import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import * as crypto from 'crypto';
import {
  ReviewQueueFilterDto,
  ReviewQueueItem,
  ReviewQueueStats,
  PaginatedResponse,
  StepStatus,
  NeedsInfoStatus,
  CreateReviewQueueSavedViewDto,
  ReviewQueueSavedView,
  ReviewQueueSavedViewFilterDto,
  UpdateReviewQueueSavedViewDto,
} from '@event-platform/shared';

@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private encodeQueueCursor(value: { updatedAt: Date; id: string }): string {
    const payload = {
      updatedAt: value.updatedAt.toISOString(),
      id: value.id,
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeQueueCursor(
    cursor: string,
  ): { updatedAt: Date; id: string } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        updatedAt?: unknown;
        id?: unknown;
      };
      if (
        typeof parsed.updatedAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        parsed.id.trim().length === 0
      ) {
        return null;
      }
      const updatedAt = new Date(parsed.updatedAt);
      if (Number.isNaN(updatedAt.getTime())) {
        return null;
      }
      return { updatedAt, id: parsed.id };
    } catch {
      return null;
    }
  }

  /**
   * Get review queue with filtering
   */
  async getQueue(
    eventId: string,
    filter: ReviewQueueFilterDto,
  ): Promise<PaginatedResponse<ReviewQueueItem>> {
    const { cursor, limit, stepId, assignedTo, status, tags } = filter;
    const reviewerId = this.cls.get('actorId');

    const reviewableSteps = await this.prisma.workflow_steps.findMany({
      where: {
        event_id: eventId,
        review_required: true,
        ...(stepId ? { id: stepId } : {}),
      },
      select: { id: true },
    });
    const reviewableStepIds = reviewableSteps.map((step) => step.id);
    if (reviewableStepIds.length === 0) {
      return {
        data: [],
        meta: {
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    // Build step state filter based on status
    let stepStateStatus: string[] = [];
    if (status === 'pending') {
      stepStateStatus = [StepStatus.SUBMITTED];
    } else if (status === 'needs_info') {
      stepStateStatus = [StepStatus.NEEDS_REVISION];
    } else if (status === 'resubmitted') {
      stepStateStatus = [StepStatus.SUBMITTED]; // Will filter by revision_cycle > 0
    } else {
      stepStateStatus = [StepStatus.SUBMITTED, StepStatus.NEEDS_REVISION];
    }

    const stepStateWhere: any = {
      status: { in: stepStateStatus },
      step_id: { in: reviewableStepIds },
      ...(status === 'resubmitted' ? { revision_cycle_count: { gt: 0 } } : {}),
    };

    // Build application filter
    const appWhere: any = { event_id: eventId };
    appWhere.application_step_states = { some: stepStateWhere };

    if (cursor) {
      const parsedCursor = this.decodeQueueCursor(cursor);
      if (parsedCursor) {
        appWhere.AND = [
          ...(appWhere.AND ?? []),
          {
            OR: [
              { updated_at: { lt: parsedCursor.updatedAt } },
              {
                updated_at: parsedCursor.updatedAt,
                id: { lt: parsedCursor.id },
              },
            ],
          },
        ];
      } else {
        // Backward compatibility for legacy id-only cursors.
        const legacyAnchor = await this.prisma.applications.findFirst({
          where: { id: cursor, event_id: eventId },
          select: { id: true, updated_at: true },
        });
        if (legacyAnchor) {
          appWhere.AND = [
            ...(appWhere.AND ?? []),
            {
              OR: [
                { updated_at: { lt: legacyAnchor.updated_at } },
                {
                  updated_at: legacyAnchor.updated_at,
                  id: { lt: legacyAnchor.id },
                },
              ],
            },
          ];
        } else {
          appWhere.id = { lt: cursor };
        }
      }
    }

    if (assignedTo === 'me') {
      appWhere.assigned_reviewer_id = reviewerId;
    } else if (assignedTo === 'unassigned') {
      appWhere.assigned_reviewer_id = null;
    }
    if (tags && tags.length > 0) {
      appWhere.tags = { hasSome: tags };
    }

    // Query applications with step states
    const applications = await this.prisma.applications.findMany({
      where: appWhere,
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        updated_at: true,
        assigned_reviewer_id: true,
        tags: true,
        users_applications_applicant_user_idTousers: {
          select: {
            email: true,
            applicant_profiles: { select: { full_name: true } },
          },
        },
        application_step_states: {
          where: stepStateWhere,
          select: {
            step_id: true,
            status: true,
            latest_submission_version_id: true,
            last_activity_at: true,
            revision_cycle_count: true,
            workflow_steps: {
              select: { id: true, title: true, step_index: true },
            },
          },
        },
        needs_info_requests: {
          where: { status: NeedsInfoStatus.OPEN },
          select: { step_id: true },
        },
      },
    });

    const hasMore = applications.length > limit;
    const data = hasMore ? applications.slice(0, limit) : applications;

    const queueStepStates = data.flatMap((app) => app.application_step_states);
    const submissionVersionIds = Array.from(
      new Set(
        queueStepStates
          .map((stepState) => stepState.latest_submission_version_id)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    );

    const submissionVersions =
      submissionVersionIds.length === 0
        ? []
        : await this.prisma.step_submission_versions.findMany({
            where: { id: { in: submissionVersionIds } },
            select: {
              id: true,
              form_version_id: true,
              answers_snapshot: true,
              version_number: true,
              submitted_at: true,
            },
          });
    const submissionVersionById = new Map(
      submissionVersions.map((version) => [version.id, version]),
    );

    const formVersionIds = Array.from(
      new Set(
        submissionVersions
          .map((version) => version.form_version_id)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    );
    const formVersions =
      formVersionIds.length === 0
        ? []
        : await this.prisma.form_versions.findMany({
            where: { id: { in: formVersionIds } },
            select: { id: true, schema: true },
          });
    const formDefinitionByVersionId = new Map<
      string,
      Record<string, unknown>
    >();
    for (const formVersion of formVersions) {
      formDefinitionByVersionId.set(
        formVersion.id,
        (formVersion.schema as Record<string, unknown>) ?? {},
      );
    }

    // Transform to queue items using the preloaded submission/form maps.
    const items: any[] = [];
    for (const app of data) {
      const user = app.users_applications_applicant_user_idTousers;

      for (const stepState of app.application_step_states) {
        const submissionVersion = stepState.latest_submission_version_id
          ? (submissionVersionById.get(
              stepState.latest_submission_version_id,
            ) ?? null)
          : null;
        const formDefinition =
          (submissionVersion?.form_version_id
            ? formDefinitionByVersionId.get(submissionVersion.form_version_id)
            : null) ?? null;

        items.push({
          id: `${app.id}:${stepState.step_id}`,
          applicationId: app.id,
          applicantEmail: user?.email || '',
          applicantName: user?.applicant_profiles?.full_name || null,
          stepId: stepState.step_id,
          stepTitle: stepState.workflow_steps?.title || 'Unknown',
          stepIndex: stepState.workflow_steps?.step_index ?? 0,
          status: stepState.status as StepStatus,
          answers:
            (submissionVersion?.answers_snapshot as Record<string, unknown>) ||
            {},
          formDefinition,
          submissionVersionId:
            submissionVersion?.id ||
            stepState.latest_submission_version_id ||
            '',
          submissionVersionNumber: submissionVersion?.version_number || 0,
          submittedAt:
            submissionVersion?.submitted_at ||
            stepState.last_activity_at ||
            new Date(),
          assignedReviewerId: app.assigned_reviewer_id,
          tags: app.tags ?? [],
          hasOpenNeedsInfo: app.needs_info_requests.some(
            (ni) => ni.step_id === stepState.step_id,
          ),
          isResubmission: stepState.revision_cycle_count > 0,
        });
      }
    }

    return {
      data: items as ReviewQueueItem[],
      meta: {
        nextCursor:
          hasMore && data.length > 0
            ? this.encodeQueueCursor({
                updatedAt: data[data.length - 1].updated_at,
                id: data[data.length - 1].id,
              })
            : null,
        hasMore,
      },
    };
  }

  /**
   * Get queue stats by step
   */
  async getStats(eventId: string): Promise<ReviewQueueStats> {
    // Get all workflow steps that require review
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId, review_required: true },
      orderBy: { step_index: 'asc' },
    });
    const stepIds = steps.map((step) => step.id);
    if (stepIds.length === 0) {
      return {
        byStep: [],
        totals: {
          pendingReview: 0,
          needsInfoWaiting: 0,
          resubmittedWaiting: 0,
        },
      };
    }

    const [pendingCounts, needsInfoCounts, resubmittedCounts] =
      await Promise.all([
        this.prisma.application_step_states.groupBy({
          by: ['step_id'],
          where: {
            step_id: { in: stepIds },
            status: StepStatus.SUBMITTED,
            revision_cycle_count: 0,
          },
          _count: { id: true },
        }),
        this.prisma.needs_info_requests.groupBy({
          by: ['step_id'],
          where: {
            step_id: { in: stepIds },
            status: NeedsInfoStatus.OPEN,
          },
          _count: { id: true },
        }),
        this.prisma.application_step_states.groupBy({
          by: ['step_id'],
          where: {
            step_id: { in: stepIds },
            status: StepStatus.SUBMITTED,
            revision_cycle_count: { gt: 0 },
          },
          _count: { id: true },
        }),
      ]);

    const pendingByStepId = new Map(
      pendingCounts.map((row) => [row.step_id, row._count.id]),
    );
    const needsInfoByStepId = new Map(
      needsInfoCounts.map((row) => [row.step_id, row._count.id]),
    );
    const resubmittedByStepId = new Map(
      resubmittedCounts.map((row) => [row.step_id, row._count.id]),
    );

    const byStep: ReviewQueueStats['byStep'] = [];
    let totalPending = 0;
    let totalNeedsInfo = 0;
    let totalResubmitted = 0;

    for (const step of steps) {
      const pending = pendingByStepId.get(step.id) ?? 0;
      const needsInfo = needsInfoByStepId.get(step.id) ?? 0;
      const resubmitted = resubmittedByStepId.get(step.id) ?? 0;

      byStep.push({
        stepId: step.id,
        stepTitle: step.title,
        pendingReview: pending,
        needsInfoWaiting: needsInfo,
        resubmittedWaiting: resubmitted,
      });

      totalPending += pending;
      totalNeedsInfo += needsInfo;
      totalResubmitted += resubmitted;
    }

    return {
      byStep,
      totals: {
        pendingReview: totalPending,
        needsInfoWaiting: totalNeedsInfo,
        resubmittedWaiting: totalResubmitted,
      },
    };
  }

  /**
   * Assign reviewer to application
   */
  async assignReviewer(
    eventId: string,
    applicationId: string,
    reviewerId: string,
  ): Promise<void> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.prisma.applications.update({
      where: { id: applicationId },
      data: { assigned_reviewer_id: reviewerId },
    });
  }

  /**
   * Unassign reviewer
   */
  async unassignReviewer(
    eventId: string,
    applicationId: string,
  ): Promise<void> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.prisma.applications.update({
      where: { id: applicationId },
      data: { assigned_reviewer_id: null },
    });
  }

  async listSavedViews(eventId: string): Promise<ReviewQueueSavedView[]> {
    const actorId = this.cls.get('actorId');
    const views = await this.prisma.review_queue_saved_views.findMany({
      where: { event_id: eventId, user_id: actorId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });

    return views
      .map((view) => {
        const filters = this.parseReviewQueueSavedViewFilters(view.filters);
        if (!filters) return null;
        return {
          id: view.id,
          eventId: view.event_id,
          name: view.name,
          isDefault: view.is_default,
          filters,
          createdAt: view.created_at,
          updatedAt: view.updated_at,
        };
      })
      .filter((entry): entry is ReviewQueueSavedView => entry !== null);
  }

  async createSavedView(
    eventId: string,
    dto: CreateReviewQueueSavedViewDto,
  ): Promise<ReviewQueueSavedView> {
    const actorId = this.cls.get('actorId');

    return await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.review_queue_saved_views.updateMany({
          where: { event_id: eventId, user_id: actorId },
          data: { is_default: false, updated_at: new Date() },
        });
      }

      const created = await tx.review_queue_saved_views.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          user_id: actorId,
          name: dto.name,
          filters: {
            kind: 'review_queue',
            version: 1,
            filters: dto.filters ?? {},
          },
          is_default: dto.isDefault ?? false,
        },
      });

      const normalizedFilters =
        this.parseReviewQueueSavedViewFilters(created.filters) ?? {};

      return {
        id: created.id,
        eventId: created.event_id,
        name: created.name,
        isDefault: created.is_default,
        filters: normalizedFilters,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      };
    });
  }

  async updateSavedView(
    eventId: string,
    viewId: string,
    dto: UpdateReviewQueueSavedViewDto,
  ): Promise<ReviewQueueSavedView> {
    const actorId = this.cls.get('actorId');

    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.review_queue_saved_views.findFirst({
        where: { id: viewId, event_id: eventId, user_id: actorId },
      });
      if (!existing) {
        throw new NotFoundException('Saved view not found');
      }
      const existingFilters = this.parseReviewQueueSavedViewFilters(
        existing.filters,
      );
      if (!existingFilters) {
        throw new NotFoundException('Saved view not found');
      }

      if (dto.isDefault) {
        await tx.review_queue_saved_views.updateMany({
          where: { event_id: eventId, user_id: actorId },
          data: { is_default: false, updated_at: new Date() },
        });
      }

      const updated = await tx.review_queue_saved_views.update({
        where: { id: viewId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.filters !== undefined
            ? {
                filters: {
                  kind: 'review_queue',
                  version: 1,
                  filters: dto.filters,
                },
              }
            : {}),
          ...(dto.isDefault !== undefined
            ? { is_default: dto.isDefault }
            : {}),
          updated_at: new Date(),
        },
      });

      const normalizedFilters =
        this.parseReviewQueueSavedViewFilters(updated.filters) ?? {};

      return {
        id: updated.id,
        eventId: updated.event_id,
        name: updated.name,
        isDefault: updated.is_default,
        filters: normalizedFilters,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    });
  }

  async deleteSavedView(eventId: string, viewId: string): Promise<void> {
    const actorId = this.cls.get('actorId');
    const existing = await this.prisma.review_queue_saved_views.findFirst({
      where: { id: viewId, event_id: eventId, user_id: actorId },
      select: { id: true, filters: true },
    });
    if (!existing || !this.parseReviewQueueSavedViewFilters(existing.filters)) {
      throw new NotFoundException('Saved view not found');
    }
    await this.prisma.review_queue_saved_views.delete({ where: { id: viewId } });
  }

  private parseReviewQueueSavedViewFilters(
    raw: unknown,
  ): ReviewQueueSavedViewFilterDto | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    const payload = raw as {
      kind?: unknown;
      filters?: unknown;
    };
    if (payload.kind === 'applications') {
      return null;
    }
    if (payload.kind === 'review_queue') {
      return (payload.filters as ReviewQueueSavedViewFilterDto) ?? {};
    }
    // Backward compatibility: legacy review queue rows stored filters directly.
    return payload as unknown as ReviewQueueSavedViewFilterDto;
  }

  async listAvailableReviewers(eventId: string): Promise<
    Array<{ userId: string; email: string; fullName: string | null; roles: string[] }>
  > {
    const now = new Date();
    const assignments = await this.prisma.event_role_assignments.findMany({
      where: {
        event_id: eventId,
        role: { in: ['reviewer', 'organizer'] },
        AND: [
          { OR: [{ access_start_at: null }, { access_start_at: { lte: now } }] },
          { OR: [{ access_end_at: null }, { access_end_at: { gte: now } }] },
        ],
      },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            applicant_profiles: { select: { full_name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const byUserId = new Map<
      string,
      { userId: string; email: string; fullName: string | null; roles: Set<string> }
    >();
    for (const assignment of assignments) {
      const user = assignment.users;
      if (!user?.id || !user.email) continue;
      const existing = byUserId.get(user.id);
      if (existing) {
        existing.roles.add(String(assignment.role).toLowerCase());
        continue;
      }
      byUserId.set(user.id, {
        userId: user.id,
        email: user.email,
        fullName: user.applicant_profiles?.full_name ?? null,
        roles: new Set([String(assignment.role).toLowerCase()]),
      });
    }

    return Array.from(byUserId.values())
      .map((entry) => ({
        userId: entry.userId,
        email: entry.email,
        fullName: entry.fullName,
        roles: Array.from(entry.roles).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) =>
        (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
      );
  }
}
