import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import {
  ReviewQueueFilterDto,
  ReviewQueueItem,
  ReviewQueueStats,
  PaginatedResponse,
  StepStatus,
  NeedsInfoStatus,
} from '@event-platform/shared';

@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Get review queue with filtering
   */
  async getQueue(
    eventId: string,
    filter: ReviewQueueFilterDto,
  ): Promise<PaginatedResponse<ReviewQueueItem>> {
    const { cursor, limit, stepId, assignedTo, status } = filter;
    const reviewerId = this.cls.get('actorId');

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

    // Build application filter
    const appWhere: any = { event_id: eventId };
    if (cursor) appWhere.id = { lt: cursor };

    if (assignedTo === 'me') {
      appWhere.assigned_reviewer_id = reviewerId;
    } else if (assignedTo === 'unassigned') {
      appWhere.assigned_reviewer_id = null;
    }

    // Query applications with step states
    const applications = await this.prisma.applications.findMany({
      where: appWhere,
      orderBy: { updated_at: 'desc' },
      take: limit + 1,
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            email: true,
            applicant_profiles: { select: { full_name: true } },
          },
        },
        application_step_states: {
          where: {
            status: { in: stepStateStatus },
            ...(stepId ? { step_id: stepId } : {}),
            ...(status === 'resubmitted'
              ? { revision_cycle_count: { gt: 0 } }
              : {}),
          },
          include: {
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

    // Filter to only apps with matching step states
    const filtered = applications.filter(
      (app) => app.application_step_states.length > 0,
    );

    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, -1) : filtered;

    const queueStepStates = data.flatMap((app) => app.application_step_states);
    const submissionVersionIds = Array.from(
      new Set(
        queueStepStates
          .map((stepState) => stepState.latest_submission_version_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
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
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const formVersions =
      formVersionIds.length === 0
        ? []
        : await this.prisma.form_versions.findMany({
            where: { id: { in: formVersionIds } },
            select: { id: true, schema: true },
          });
    const formDefinitionByVersionId = new Map<string, Record<string, unknown>>();
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
          ? submissionVersionById.get(stepState.latest_submission_version_id) ??
            null
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
        nextCursor: hasMore ? data[data.length - 1].id : null,
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
}
