import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import {
  Permission,
  ReviewerAssignmentApplyRequestDto,
  ReviewerAssignmentApplyResponse,
  ReviewerAssignmentContextResponse,
  ReviewerAssignmentMode,
  ReviewerAssignmentPreviewRequestDto,
  ReviewerAssignmentPreviewResponse,
  ReviewerQueueItemOverrideRequestDto,
  StepStatus,
} from '@event-platform/shared';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

const DEFAULT_ASSIGNMENT_TTL_MINUTES = 120;
const DEFAULT_PREVIEW_TTL_SECONDS = 300;

interface QueueAssignmentPlan {
  queueMode: 'direct' | 'shared';
  reviewerId: string | null;
}

interface StoredPreviewOperation {
  queueItemId: string;
  expectedUpdatedAt: string;
  expectedQueueMode: 'direct' | 'shared';
  expectedAssignedReviewerId: string | null;
  expectedAssignmentExpiresAt: string | null;
  desiredQueueMode: 'direct' | 'shared';
  desiredAssignedReviewerId: string | null;
  desiredAssignmentExpiresAt: string | null;
}

interface StoredPreviewSnapshot {
  seed: string;
  stepIds: string[];
  operations: StoredPreviewOperation[];
}

interface EligibleReviewer {
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

interface ScopeQueueItem {
  id: string;
  submission_version_id: string;
  assigned_reviewer_id: string | null;
  queue_mode: string;
  assignment_expires_at: Date | null;
  updated_at: Date;
}

@Injectable()
export class ReviewerAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private readIntEnv(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(process.env[key] ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private getDefaultTtlMinutes(): number {
    return this.readIntEnv(
      'REVIEW_ASSIGNMENT_DEFAULT_TTL_MINUTES',
      DEFAULT_ASSIGNMENT_TTL_MINUTES,
      1,
      10080,
    );
  }

  private getPreviewTtlSeconds(): number {
    return this.readIntEnv(
      'REVIEW_ASSIGNMENT_PREVIEW_TTL_SECONDS',
      DEFAULT_PREVIEW_TTL_SECONDS,
      30,
      3600,
    );
  }

  private getExpiryFromTtl(ttlMinutes?: number): Date {
    const ttl =
      ttlMinutes && Number.isFinite(ttlMinutes)
        ? Math.max(1, Math.round(ttlMinutes))
        : this.getDefaultTtlMinutes();
    return new Date(Date.now() + ttl * 60_000);
  }

  private isOrganizerOrAdmin(): boolean {
    const isGlobalAdmin = Boolean(this.cls.get('isGlobalAdmin'));
    if (isGlobalAdmin) return true;
    const permissions = (this.cls.get('permissions') ?? []) as string[];
    return permissions.includes(Permission.EVENT_UPDATE);
  }

  private normalizeIso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private hashHex(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private async writeAssignmentAudit(params: {
    eventId: string;
    action: string;
    entityType: string;
    entityId: string;
    meta?: Record<string, unknown>;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const actorId = (this.cls.get('actorId') as string | undefined) ?? null;
    const client = params.tx ?? this.prisma;
    try {
      await client.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          event_id: params.eventId,
          actor_user_id: actorId,
          action: params.action,
          entity_type: params.entityType,
          entity_id: params.entityId,
          meta: (params.meta ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit failures should not block assignment execution.
    }
  }

  async listEligibleReviewers(eventId: string): Promise<EligibleReviewer[]> {
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
      const role = String(assignment.role).toLowerCase();
      const existing = byUserId.get(user.id);
      if (existing) {
        existing.roles.add(role);
        continue;
      }

      byUserId.set(user.id, {
        userId: user.id,
        email: user.email,
        fullName: user.applicant_profiles?.full_name ?? null,
        roles: new Set([role]),
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

  async syncOpenQueueItemsForEvent(
    eventId: string,
    options?: { stepIds?: string[] },
  ): Promise<{ created: number; completed: number }> {
    const now = new Date();
    const stepIdFilter =
      Array.isArray(options?.stepIds) && options.stepIds.length > 0
        ? Array.from(new Set(options.stepIds))
        : null;

    const pendingStepStates = await this.prisma.application_step_states.findMany({
      where: {
        status: StepStatus.SUBMITTED,
        latest_submission_version_id: { not: null },
        applications: { event_id: eventId },
        workflow_steps: {
          event_id: eventId,
          review_required: true,
          ...(stepIdFilter ? { id: { in: stepIdFilter } } : {}),
        },
      },
      select: {
        application_id: true,
        step_id: true,
        latest_submission_version_id: true,
      },
    });

    const targetRows = pendingStepStates
      .map((row) => ({
        applicationId: row.application_id,
        stepId: row.step_id,
        submissionVersionId: row.latest_submission_version_id,
      }))
      .filter(
        (
          row,
        ): row is {
          applicationId: string;
          stepId: string;
          submissionVersionId: string;
        } =>
          typeof row.submissionVersionId === 'string' &&
          row.submissionVersionId.length > 0,
      );

    const targetSubmissionVersionIds = targetRows.map(
      (row) => row.submissionVersionId,
    );

    const existingOpenItems = await this.prisma.review_queue_items.findMany({
      where: {
        event_id: eventId,
        completed_at: null,
        ...(stepIdFilter ? { step_id: { in: stepIdFilter } } : {}),
      },
      select: { id: true, submission_version_id: true },
    });

    const existingBySubmissionVersionId = new Map(
      existingOpenItems.map((item) => [item.submission_version_id, item.id]),
    );

    const missing = targetRows.filter(
      (row) => !existingBySubmissionVersionId.has(row.submissionVersionId),
    );

    if (missing.length > 0) {
      await this.prisma.review_queue_items.createMany({
        data: missing.map((entry) => ({
          id: crypto.randomUUID(),
          event_id: eventId,
          application_id: entry.applicationId,
          step_id: entry.stepId,
          submission_version_id: entry.submissionVersionId,
          queue_mode: 'shared',
          updated_at: now,
        })),
        skipDuplicates: true,
      });
    }

    const staleWhere: Prisma.review_queue_itemsWhereInput = {
      event_id: eventId,
      completed_at: null,
      ...(stepIdFilter ? { step_id: { in: stepIdFilter } } : {}),
      ...(targetSubmissionVersionIds.length > 0
        ? { submission_version_id: { notIn: targetSubmissionVersionIds } }
        : {}),
    };

    const staleCompletion = await this.prisma.review_queue_items.updateMany({
      where: staleWhere,
      data: {
        completed_at: now,
        completed_by: null,
        updated_at: now,
      },
    });

    return {
      created: missing.length,
      completed: staleCompletion.count,
    };
  }

  async releaseExpiredDirectAssignments(eventId: string): Promise<{ released: number }> {
    const now = new Date();
    const result = await this.prisma.review_queue_items.updateMany({
      where: {
        event_id: eventId,
        completed_at: null,
        queue_mode: 'direct',
        assignment_expires_at: { lt: now },
      },
      data: {
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        updated_at: now,
      },
    });

    if (result.count > 0) {
      await this.writeAssignmentAudit({
        eventId,
        action: 'REVIEW_ASSIGNMENT_RELEASE_EXPIRED',
        entityType: 'review_queue_items',
        entityId: eventId,
        meta: {
          released: result.count,
        },
      });
    }

    return { released: result.count };
  }

  private async resolveSelectedStepIds(
    eventId: string,
    includeStepIds: string[],
    excludeStepIds: string[],
  ): Promise<string[]> {
    const includeSet = new Set((includeStepIds ?? []).filter(Boolean));
    const excludeSet = new Set((excludeStepIds ?? []).filter(Boolean));

    const steps = await this.prisma.workflow_steps.findMany({
      where: {
        event_id: eventId,
        review_required: true,
        ...(includeSet.size > 0 ? { id: { in: Array.from(includeSet) } } : {}),
      },
      select: { id: true },
      orderBy: { step_index: 'asc' },
    });

    return steps
      .map((step) => step.id)
      .filter((stepId) => !excludeSet.has(stepId));
  }

  private sortPoolReviewerIds(ids: string[]): string[] {
    return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
  }

  private normalizeHybridTargets(params: {
    reviewerIds: string[];
    hybridTargets: Array<{ reviewerId: string; count: number }>;
  }): Map<string, number> {
    const reviewerIdSet = new Set(params.reviewerIds);
    const targets = new Map<string, number>();

    for (const target of params.hybridTargets ?? []) {
      if (!reviewerIdSet.has(target.reviewerId)) {
        throw new BadRequestException(
          'hybridTargets includes reviewers outside reviewerPoolUserIds',
        );
      }

      if (targets.has(target.reviewerId)) {
        throw new BadRequestException(
          'hybridTargets must contain at most one entry per reviewer',
        );
      }

      targets.set(target.reviewerId, Math.max(0, Math.round(target.count)));
    }

    return targets;
  }

  private pickDeterministicReviewer(
    seed: string,
    submissionVersionId: string,
    reviewerIds: string[],
  ): string {
    let winner = reviewerIds[0] ?? '';
    let winnerHash = this.hashHex(`${seed}:${submissionVersionId}:${winner}`);

    for (let index = 1; index < reviewerIds.length; index += 1) {
      const candidate = reviewerIds[index];
      const candidateHash = this.hashHex(
        `${seed}:${submissionVersionId}:${candidate}`,
      );
      if (candidateHash < winnerHash) {
        winner = candidate;
        winnerHash = candidateHash;
      }
    }

    return winner;
  }

  private buildAssignmentPlan(params: {
    mode: ReviewerAssignmentMode;
    seed: string;
    reviewerIds: string[];
    queueItems: Array<{ id: string; submissionVersionId: string }>;
    fixedReviewsPerReviewer?: number;
    hybridTargets: Map<string, number>;
  }): Map<string, QueueAssignmentPlan> {
    const {
      mode,
      seed,
      reviewerIds,
      queueItems,
      fixedReviewsPerReviewer,
      hybridTargets,
    } = params;

    const plan = new Map<string, QueueAssignmentPlan>();

    if (queueItems.length === 0) return plan;
    if (reviewerIds.length === 0) {
      throw new BadRequestException('At least one eligible reviewer is required');
    }

    switch (mode) {
      case 'equal_distribution': {
        queueItems.forEach((item, index) => {
          const reviewerId = reviewerIds[index % reviewerIds.length];
          plan.set(item.id, {
            queueMode: 'direct',
            reviewerId,
          });
        });
        return plan;
      }

      case 'pure_random': {
        queueItems.forEach((item) => {
          const reviewerId = this.pickDeterministicReviewer(
            seed,
            item.submissionVersionId,
            reviewerIds,
          );
          plan.set(item.id, {
            queueMode: 'direct',
            reviewerId,
          });
        });
        return plan;
      }

      case 'fixed_per_reviewer': {
        const fixed = Math.max(0, Math.round(fixedReviewsPerReviewer ?? 0));
        let pointer = 0;

        for (const reviewerId of reviewerIds) {
          for (let count = 0; count < fixed; count += 1) {
            if (pointer >= queueItems.length) break;
            plan.set(queueItems[pointer].id, {
              queueMode: 'direct',
              reviewerId,
            });
            pointer += 1;
          }
          if (pointer >= queueItems.length) break;
        }

        for (let index = pointer; index < queueItems.length; index += 1) {
          plan.set(queueItems[index].id, {
            queueMode: 'shared',
            reviewerId: null,
          });
        }
        return plan;
      }

      case 'hybrid_manual_then_random': {
        let pointer = 0;

        for (const reviewerId of reviewerIds) {
          const target = Math.max(0, Math.round(hybridTargets.get(reviewerId) ?? 0));
          for (let count = 0; count < target; count += 1) {
            if (pointer >= queueItems.length) break;
            plan.set(queueItems[pointer].id, {
              queueMode: 'direct',
              reviewerId,
            });
            pointer += 1;
          }
          if (pointer >= queueItems.length) break;
        }

        for (let index = pointer; index < queueItems.length; index += 1) {
          const item = queueItems[index];
          const reviewerId = this.pickDeterministicReviewer(
            seed,
            item.submissionVersionId,
            reviewerIds,
          );
          plan.set(item.id, {
            queueMode: 'direct',
            reviewerId,
          });
        }

        return plan;
      }

      default:
        throw new BadRequestException('Unsupported assignment mode');
    }
  }

  private parseStoredPreviewSnapshot(raw: unknown): StoredPreviewSnapshot {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ConflictException({
        code: 'PREVIEW_INVALID',
        message: 'Stored preview payload is invalid',
      });
    }

    const payload = raw as {
      seed?: unknown;
      stepIds?: unknown;
      operations?: unknown;
    };

    const seed = typeof payload.seed === 'string' ? payload.seed : '';
    if (!seed) {
      throw new ConflictException({
        code: 'PREVIEW_INVALID',
        message: 'Stored preview seed is invalid',
      });
    }

    const stepIds = Array.isArray(payload.stepIds)
      ? payload.stepIds.filter((value): value is string => typeof value === 'string')
      : [];

    const operations = Array.isArray(payload.operations)
      ? payload.operations.filter(
          (op): op is StoredPreviewOperation =>
            !!op &&
            typeof op === 'object' &&
            typeof (op as StoredPreviewOperation).queueItemId === 'string' &&
            typeof (op as StoredPreviewOperation).expectedUpdatedAt === 'string' &&
            typeof (op as StoredPreviewOperation).expectedQueueMode === 'string' &&
            typeof (op as StoredPreviewOperation).desiredQueueMode === 'string',
        )
      : [];

    return {
      seed,
      stepIds,
      operations,
    };
  }

  private assertPreviewNotExpired(expiresAt: Date, appliedAt: Date | null): void {
    if (appliedAt) {
      throw new ConflictException({
        code: 'PREVIEW_ALREADY_APPLIED',
        message: 'This assignment preview was already applied',
      });
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'PREVIEW_EXPIRED',
        message: 'This assignment preview has expired',
      });
    }
  }

  async getContext(eventId: string): Promise<ReviewerAssignmentContextResponse> {
    await this.syncOpenQueueItemsForEvent(eventId);
    await this.releaseExpiredDirectAssignments(eventId);

    const now = new Date();

    const [
      steps,
      reviewers,
      sharedQueueCount,
      assignedRows,
      pendingRows,
      overdueRows,
      completedRows,
    ] = await Promise.all([
      this.prisma.workflow_steps.findMany({
        where: { event_id: eventId, review_required: true },
        select: {
          id: true,
          title: true,
          step_index: true,
        },
        orderBy: { step_index: 'asc' },
      }),
      this.listEligibleReviewers(eventId),
      this.prisma.review_queue_items.count({
        where: {
          event_id: eventId,
          completed_at: null,
          queue_mode: 'shared',
        },
      }),
      this.prisma.review_queue_items.groupBy({
        by: ['assigned_reviewer_id'],
        where: {
          event_id: eventId,
          completed_at: null,
          queue_mode: 'direct',
          assigned_reviewer_id: { not: null },
        },
        _count: { id: true },
      }),
      this.prisma.review_queue_items.groupBy({
        by: ['assigned_reviewer_id'],
        where: {
          event_id: eventId,
          completed_at: null,
          queue_mode: 'direct',
          assigned_reviewer_id: { not: null },
          OR: [
            { assignment_expires_at: null },
            { assignment_expires_at: { gte: now } },
          ],
        },
        _count: { id: true },
      }),
      this.prisma.review_queue_items.groupBy({
        by: ['assigned_reviewer_id'],
        where: {
          event_id: eventId,
          completed_at: null,
          queue_mode: 'direct',
          assigned_reviewer_id: { not: null },
          assignment_expires_at: { lt: now },
        },
        _count: { id: true },
      }),
      this.prisma.review_records.groupBy({
        by: ['reviewer_id'],
        where: {
          step_submission_versions: {
            workflow_steps: {
              event_id: eventId,
            },
          },
        },
        _count: { id: true },
      }),
    ]);

    const assignedByReviewerId = new Map(
      assignedRows
        .filter((row) => typeof row.assigned_reviewer_id === 'string')
        .map((row) => [row.assigned_reviewer_id as string, row._count.id]),
    );

    const pendingByReviewerId = new Map(
      pendingRows
        .filter((row) => typeof row.assigned_reviewer_id === 'string')
        .map((row) => [row.assigned_reviewer_id as string, row._count.id]),
    );

    const overdueByReviewerId = new Map(
      overdueRows
        .filter((row) => typeof row.assigned_reviewer_id === 'string')
        .map((row) => [row.assigned_reviewer_id as string, row._count.id]),
    );

    const completedByReviewerId = new Map(
      completedRows.map((row) => [row.reviewer_id, row._count.id]),
    );

    return {
      steps: steps.map((step) => ({
        stepId: step.id,
        stepTitle: step.title,
        stepIndex: step.step_index,
      })),
      reviewers: reviewers.map((reviewer) => ({
        userId: reviewer.userId,
        email: reviewer.email,
        fullName: reviewer.fullName,
        roles: reviewer.roles,
        workload: {
          assigned: assignedByReviewerId.get(reviewer.userId) ?? 0,
          pending: pendingByReviewerId.get(reviewer.userId) ?? 0,
          overdue: overdueByReviewerId.get(reviewer.userId) ?? 0,
          completed: completedByReviewerId.get(reviewer.userId) ?? 0,
        },
      })),
      sharedQueueCount,
      defaults: {
        defaultTtlMinutes: this.getDefaultTtlMinutes(),
        previewTtlSeconds: this.getPreviewTtlSeconds(),
      },
    };
  }

  async createPreview(
    eventId: string,
    dto: ReviewerAssignmentPreviewRequestDto,
  ): Promise<ReviewerAssignmentPreviewResponse> {
    const actorId = this.cls.get('actorId') as string;

    const stepIds = await this.resolveSelectedStepIds(
      eventId,
      dto.includeStepIds,
      dto.excludeStepIds,
    );
    if (stepIds.length === 0) {
      throw new BadRequestException('No review steps selected');
    }

    await this.syncOpenQueueItemsForEvent(eventId, { stepIds });
    await this.releaseExpiredDirectAssignments(eventId);

    const eligibleReviewers = await this.listEligibleReviewers(eventId);
    const eligibleById = new Map(
      eligibleReviewers.map((reviewer) => [reviewer.userId, reviewer]),
    );

    const reviewerIds = this.sortPoolReviewerIds(dto.reviewerPoolUserIds);
    for (const reviewerId of reviewerIds) {
      if (!eligibleById.has(reviewerId)) {
        throw new BadRequestException(
          'Reviewer pool includes users without active reviewer/organizer access',
        );
      }
    }

    const scopeItems = (await this.prisma.review_queue_items.findMany({
      where: {
        event_id: eventId,
        completed_at: null,
        step_id: { in: stepIds },
      },
      select: {
        id: true,
        submission_version_id: true,
        assigned_reviewer_id: true,
        queue_mode: true,
        assignment_expires_at: true,
        updated_at: true,
      },
      orderBy: [{ submission_version_id: 'asc' }],
    })) as ScopeQueueItem[];

    const candidates =
      dto.runPolicy === 'unassigned_only'
        ? scopeItems.filter(
            (item) =>
              item.queue_mode === 'shared' || item.assigned_reviewer_id === null,
          )
        : scopeItems;

    const previewId = crypto.randomUUID();
    const hybridTargets = this.normalizeHybridTargets({
      reviewerIds,
      hybridTargets: dto.hybridTargets ?? [],
    });

    const assignmentPlan = this.buildAssignmentPlan({
      mode: dto.mode,
      seed: previewId,
      reviewerIds,
      queueItems: candidates.map((item) => ({
        id: item.id,
        submissionVersionId: item.submission_version_id,
      })),
      fixedReviewsPerReviewer: dto.fixedReviewsPerReviewer,
      hybridTargets,
    });

    const assignmentExpiry = this.getExpiryFromTtl(dto.ttlMinutes);
    const operations: StoredPreviewOperation[] = [];

    for (const item of candidates) {
      const desired = assignmentPlan.get(item.id) ?? {
        queueMode: 'shared',
        reviewerId: null,
      };

      const desiredAssignmentExpiresAt =
        desired.queueMode === 'direct' ? assignmentExpiry : null;
      const expectedAssignmentExpiresAt = this.normalizeIso(item.assignment_expires_at);
      const desiredAssignmentExpiresAtIso = this.normalizeIso(
        desiredAssignmentExpiresAt,
      );

      const isChanged =
        item.queue_mode !== desired.queueMode ||
        (item.assigned_reviewer_id ?? null) !== (desired.reviewerId ?? null) ||
        (desired.queueMode === 'direct' &&
          expectedAssignmentExpiresAt !== desiredAssignmentExpiresAtIso) ||
        (desired.queueMode === 'shared' && expectedAssignmentExpiresAt !== null);

      if (!isChanged) continue;

      operations.push({
        queueItemId: item.id,
        expectedUpdatedAt: item.updated_at.toISOString(),
        expectedQueueMode:
          item.queue_mode === 'direct' ? 'direct' : 'shared',
        expectedAssignedReviewerId: item.assigned_reviewer_id ?? null,
        expectedAssignmentExpiresAt,
        desiredQueueMode: desired.queueMode,
        desiredAssignedReviewerId: desired.reviewerId,
        desiredAssignmentExpiresAt: desiredAssignmentExpiresAtIso,
      });
    }

    const beforeAssignedByReviewerId = new Map<string, number>();
    for (const item of scopeItems) {
      if (item.queue_mode !== 'direct' || !item.assigned_reviewer_id) continue;
      beforeAssignedByReviewerId.set(
        item.assigned_reviewer_id,
        (beforeAssignedByReviewerId.get(item.assigned_reviewer_id) ?? 0) + 1,
      );
    }

    const afterAssignedByReviewerId = new Map(beforeAssignedByReviewerId);
    let sharedQueueAfter = scopeItems.filter(
      (item) => item.queue_mode === 'shared',
    ).length;
    const itemById = new Map(scopeItems.map((item) => [item.id, item]));

    for (const operation of operations) {
      const current = itemById.get(operation.queueItemId);
      if (!current) continue;

      if (current.queue_mode === 'shared') {
        sharedQueueAfter = Math.max(0, sharedQueueAfter - 1);
      } else if (current.assigned_reviewer_id) {
        const next =
          (afterAssignedByReviewerId.get(current.assigned_reviewer_id) ?? 0) - 1;
        if (next <= 0) {
          afterAssignedByReviewerId.delete(current.assigned_reviewer_id);
        } else {
          afterAssignedByReviewerId.set(current.assigned_reviewer_id, next);
        }
      }

      if (operation.desiredQueueMode === 'shared') {
        sharedQueueAfter += 1;
      } else if (operation.desiredAssignedReviewerId) {
        afterAssignedByReviewerId.set(
          operation.desiredAssignedReviewerId,
          (afterAssignedByReviewerId.get(operation.desiredAssignedReviewerId) ?? 0) +
            1,
        );
      }

      itemById.set(operation.queueItemId, {
        ...current,
        queue_mode: operation.desiredQueueMode,
        assigned_reviewer_id: operation.desiredAssignedReviewerId,
        assignment_expires_at: operation.desiredAssignmentExpiresAt
          ? new Date(operation.desiredAssignmentExpiresAt)
          : null,
      });
    }

    const reviewerImpact = reviewerIds.map((reviewerId) => {
      const beforeAssigned = beforeAssignedByReviewerId.get(reviewerId) ?? 0;
      const afterAssigned = afterAssignedByReviewerId.get(reviewerId) ?? 0;
      return {
        reviewerId,
        beforeAssigned,
        afterAssigned,
        deltaAssigned: afterAssigned - beforeAssigned,
      };
    });

    const fingerprintBase = operations
      .map((operation) => `${operation.queueItemId}:${operation.expectedUpdatedAt}`)
      .sort((a, b) => a.localeCompare(b))
      .join('|');
    const scopeFingerprint = this.hashHex(
      `${eventId}:${previewId}:${stepIds.join(',')}:${fingerprintBase}`,
    );

    const expiresAt = new Date(Date.now() + this.getPreviewTtlSeconds() * 1000);
    const snapshotPayload: StoredPreviewSnapshot = {
      seed: previewId,
      stepIds,
      operations,
    };

    await this.prisma.review_assignment_previews.create({
      data: {
        id: previewId,
        event_id: eventId,
        created_by: actorId,
        request_payload: dto as unknown as Prisma.InputJsonValue,
        snapshot_payload: snapshotPayload as unknown as Prisma.InputJsonValue,
        scope_fingerprint: scopeFingerprint,
        expires_at: expiresAt,
      },
    });

    await this.writeAssignmentAudit({
      eventId,
      action: 'REVIEW_ASSIGNMENT_PREVIEW_CREATED',
      entityType: 'review_assignment_preview',
      entityId: previewId,
      meta: {
        mode: dto.mode,
        runPolicy: dto.runPolicy,
        totalCandidates: candidates.length,
        operationCount: operations.length,
      },
    });

    return {
      previewId,
      expiresAt,
      mode: dto.mode,
      runPolicy: dto.runPolicy,
      totalCandidates: candidates.length,
      operationCount: operations.length,
      sharedQueueAfter,
      reviewerImpact,
    };
  }

  async applyPreview(
    eventId: string,
    dto: ReviewerAssignmentApplyRequestDto,
  ): Promise<ReviewerAssignmentApplyResponse> {
    const actorId = this.cls.get('actorId') as string;

    const existingRun = await this.prisma.review_assignment_runs.findFirst({
      where: {
        event_id: eventId,
        idempotency_key: dto.idempotencyKey,
      },
      select: { result_payload: true },
    });

    if (existingRun) {
      return existingRun.result_payload as unknown as ReviewerAssignmentApplyResponse;
    }

    const preview = await this.prisma.review_assignment_previews.findFirst({
      where: {
        id: dto.previewId,
        event_id: eventId,
        created_by: actorId,
      },
    });

    if (!preview) {
      throw new NotFoundException('Assignment preview not found');
    }

    this.assertPreviewNotExpired(preview.expires_at, preview.applied_at);

    const snapshot = this.parseStoredPreviewSnapshot(preview.snapshot_payload);
    const operations = snapshot.operations;

    if (operations.length > 0) {
      const queueItemIds = operations.map((operation) => operation.queueItemId);
      const currentRows = await this.prisma.review_queue_items.findMany({
        where: {
          event_id: eventId,
          id: { in: queueItemIds },
          completed_at: null,
        },
        select: {
          id: true,
          queue_mode: true,
          assigned_reviewer_id: true,
          assignment_expires_at: true,
          updated_at: true,
        },
      });

      if (currentRows.length !== queueItemIds.length) {
        throw new ConflictException({
          code: 'PREVIEW_STALE',
          message: 'Queue changed since preview was generated',
        });
      }

      const currentById = new Map(currentRows.map((row) => [row.id, row]));
      for (const operation of operations) {
        const row = currentById.get(operation.queueItemId);
        if (!row) {
          throw new ConflictException({
            code: 'PREVIEW_STALE',
            message: 'Queue changed since preview was generated',
          });
        }

        const actualUpdatedAt = row.updated_at.toISOString();
        const actualQueueMode = row.queue_mode === 'direct' ? 'direct' : 'shared';
        const actualAssignedReviewerId = row.assigned_reviewer_id ?? null;
        const actualAssignmentExpiresAt = this.normalizeIso(row.assignment_expires_at);

        if (
          actualUpdatedAt !== operation.expectedUpdatedAt ||
          actualQueueMode !== operation.expectedQueueMode ||
          actualAssignedReviewerId !== operation.expectedAssignedReviewerId ||
          actualAssignmentExpiresAt !== operation.expectedAssignmentExpiresAt
        ) {
          throw new ConflictException({
            code: 'PREVIEW_STALE',
            message: 'Queue changed since preview was generated',
          });
        }
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();

        for (const operation of operations) {
          await tx.review_queue_items.update({
            where: { id: operation.queueItemId },
            data: {
              queue_mode: operation.desiredQueueMode,
              assigned_reviewer_id: operation.desiredAssignedReviewerId,
              assignment_expires_at: operation.desiredAssignmentExpiresAt
                ? new Date(operation.desiredAssignmentExpiresAt)
                : null,
              updated_at: now,
            },
          });
        }

        await tx.review_assignment_previews.update({
          where: { id: preview.id },
          data: {
            applied_at: now,
            updated_at: now,
          },
        });

        const sharedQueueAfter = await tx.review_queue_items.count({
          where: {
            event_id: eventId,
            completed_at: null,
            queue_mode: 'shared',
          },
        });

        const result: ReviewerAssignmentApplyResponse = {
          previewId: preview.id,
          appliedAt: now,
          updatedItems: operations.length,
          sharedQueueAfter,
        };

        await tx.review_assignment_runs.create({
          data: {
            id: crypto.randomUUID(),
            event_id: eventId,
            preview_id: preview.id,
            created_by: actorId,
            idempotency_key: dto.idempotencyKey,
            result_payload: result as unknown as Prisma.InputJsonValue,
          },
        });

        await this.writeAssignmentAudit({
          eventId,
          action: 'REVIEW_ASSIGNMENT_APPLIED',
          entityType: 'review_assignment_preview',
          entityId: preview.id,
          meta: {
            idempotencyKey: dto.idempotencyKey,
            updatedItems: operations.length,
            sharedQueueAfter,
          },
          tx,
        });

        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const run = await this.prisma.review_assignment_runs.findFirst({
          where: {
            event_id: eventId,
            idempotency_key: dto.idempotencyKey,
          },
          select: { result_payload: true },
        });
        if (run) {
          return run.result_payload as unknown as ReviewerAssignmentApplyResponse;
        }
      }
      throw error;
    }
  }

  async overrideQueueItem(
    eventId: string,
    queueItemId: string,
    dto: ReviewerQueueItemOverrideRequestDto,
  ): Promise<{
    queueItemId: string;
    queueMode: 'direct' | 'shared';
    assignedReviewerId: string | null;
    assignmentExpiresAt: Date | null;
  }> {
    const existing = await this.prisma.review_queue_items.findFirst({
      where: {
        id: queueItemId,
        event_id: eventId,
        completed_at: null,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Queue item not found');
    }

    if (dto.action === 'release_shared') {
      const updated = await this.prisma.review_queue_items.update({
        where: { id: queueItemId },
        data: {
          queue_mode: 'shared',
          assigned_reviewer_id: null,
          assignment_expires_at: null,
          updated_at: new Date(),
        },
      });

      await this.writeAssignmentAudit({
        eventId,
        action: 'REVIEW_QUEUE_ITEM_RELEASED_TO_SHARED',
        entityType: 'review_queue_item',
        entityId: updated.id,
      });

      return {
        queueItemId: updated.id,
        queueMode: 'shared',
        assignedReviewerId: null,
        assignmentExpiresAt: null,
      };
    }

    const reviewerId = dto.reviewerId;
    if (!reviewerId) {
      throw new BadRequestException('reviewerId is required for direct assignment');
    }

    const eligibleReviewers = await this.listEligibleReviewers(eventId);
    const isEligible = eligibleReviewers.some(
      (reviewer) => reviewer.userId === reviewerId,
    );
    if (!isEligible) {
      throw new BadRequestException(
        'Reviewer must have an active reviewer/organizer role in this event',
      );
    }

    const updated = await this.prisma.review_queue_items.update({
      where: { id: queueItemId },
      data: {
        queue_mode: 'direct',
        assigned_reviewer_id: reviewerId,
        assignment_expires_at: this.getExpiryFromTtl(dto.ttlMinutes),
        updated_at: new Date(),
      },
    });

    await this.writeAssignmentAudit({
      eventId,
      action:
        dto.action === 'reassign_direct'
          ? 'REVIEW_QUEUE_ITEM_REASSIGNED'
          : 'REVIEW_QUEUE_ITEM_ASSIGNED',
      entityType: 'review_queue_item',
      entityId: updated.id,
      meta: {
        assignedReviewerId: reviewerId,
        assignmentExpiresAt: this.normalizeIso(updated.assignment_expires_at),
      },
    });

    return {
      queueItemId: updated.id,
      queueMode: 'direct',
      assignedReviewerId: updated.assigned_reviewer_id,
      assignmentExpiresAt: updated.assignment_expires_at,
    };
  }

  async assertQueueAccessForReview(
    eventId: string,
    submissionVersionId: string,
    reviewerId: string,
  ): Promise<void> {
    await this.syncOpenQueueItemsForEvent(eventId);
    await this.releaseExpiredDirectAssignments(eventId);

    const queueItem = await this.prisma.review_queue_items.findFirst({
      where: {
        event_id: eventId,
        submission_version_id: submissionVersionId,
      },
      select: {
        queue_mode: true,
        assigned_reviewer_id: true,
        completed_at: true,
      },
    });

    if (!queueItem || queueItem.completed_at) {
      throw new ConflictException({
        code: 'QUEUE_ITEM_NOT_AVAILABLE',
        message: 'This submission is no longer pending review',
      });
    }

    if (this.isOrganizerOrAdmin()) {
      return;
    }

    if (
      queueItem.queue_mode === 'direct' &&
      queueItem.assigned_reviewer_id !== reviewerId
    ) {
      throw new ForbiddenException('This submission is assigned to another reviewer');
    }
  }

  async markQueueItemCompleted(
    eventId: string,
    submissionVersionId: string,
    reviewerId: string,
  ): Promise<void> {
    const result = await this.prisma.review_queue_items.updateMany({
      where: {
        event_id: eventId,
        submission_version_id: submissionVersionId,
        completed_at: null,
      },
      data: {
        completed_at: new Date(),
        completed_by: reviewerId,
        updated_at: new Date(),
      },
    });

    if (result.count > 0) {
      await this.writeAssignmentAudit({
        eventId,
        action: 'REVIEW_QUEUE_ITEM_COMPLETED',
        entityType: 'review_queue_item',
        entityId: submissionVersionId,
        meta: {
          reviewerId,
        },
      });
    }
  }
}
