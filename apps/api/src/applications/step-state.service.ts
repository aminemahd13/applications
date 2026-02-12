import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  StepStatus,
  StepStateResponse,
  UnlockPolicy,
} from '@event-platform/shared';

/**
 * Step State Service
 * Manages application step states and unlock policy computation
 */
@Injectable()
export class StepStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize step states for a new application
   * Creates LOCKED state for each workflow step
   */
  async initializeStepStates(
    applicationId: string,
    eventId: string,
  ): Promise<void> {
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
    });

    // Create step states in a transaction
    await this.prisma.$transaction(
      steps.map((step, index) =>
        this.prisma.application_step_states.create({
          data: {
            id: crypto.randomUUID(),
            application_id: applicationId,
            step_id: step.id,
            status:
              index === 0 ? this.computeInitialStatus(step) : StepStatus.LOCKED,
          },
        }),
      ),
    );

    // Recompute all step states (to handle AUTO unlock policies)
    await this.recomputeAllStepStates(applicationId);
  }

  /**
   * Compute initial status for the first step based on unlock policy
   */
  private computeInitialStatus(step: any): StepStatus {
    const policy = step.unlock_policy as UnlockPolicy;

    switch (policy) {
      case UnlockPolicy.AUTO_AFTER_PREV_SUBMITTED:
        // First step is auto-unlocked
        return StepStatus.UNLOCKED;

      case UnlockPolicy.DATE_BASED:
        // Check if unlock date has passed
        if (step.unlock_at && new Date() >= new Date(step.unlock_at)) {
          return StepStatus.UNLOCKED;
        }
        return StepStatus.LOCKED;

      case UnlockPolicy.ADMIN_MANUAL:
        return StepStatus.LOCKED;

      case UnlockPolicy.AFTER_DECISION_ACCEPTED:
        return StepStatus.LOCKED;

      default:
        return StepStatus.UNLOCKED;
    }
  }

  /**
   * Recompute all step states for an application
   * Called after submission, review, or status change
   */
  async recomputeAllStepStates(applicationId: string): Promise<void> {
    const app = await this.prisma.applications.findUnique({
      where: { id: applicationId },
      include: {
        application_step_states: {
          include: { workflow_steps: true },
          orderBy: { workflow_steps: { step_index: 'asc' } },
        },
      },
    });

    if (!app) return;

    const states = app.application_step_states;

    const now = new Date();
    const unlockStepIds: string[] = [];

    // Process each step in order
    for (let i = 0; i < states.length; i++) {
      const state = states[i];
      const step = state.workflow_steps;
      const prevState = i > 0 ? states[i - 1] : null;

      // Skip if already submitted/approved/needs_revision
      if (
        state.status === StepStatus.SUBMITTED ||
        state.status === StepStatus.APPROVED ||
        state.status === StepStatus.NEEDS_REVISION
      ) {
        continue;
      }

      const shouldUnlock = this.evaluateUnlockPolicy(step, prevState, app);

      if (shouldUnlock && state.status === StepStatus.LOCKED) {
        unlockStepIds.push(state.id);
        // Keep in-memory sequence consistent for downstream gating checks.
        state.status = StepStatus.UNLOCKED;
      }
    }

    if (unlockStepIds.length > 0) {
      await this.prisma.application_step_states.updateMany({
        where: {
          id: { in: unlockStepIds },
          status: StepStatus.LOCKED,
        },
        data: {
          status: StepStatus.UNLOCKED,
          unlocked_at: now,
          last_activity_at: now,
        },
      });
    }
  }

  /**
   * Ensure application has step states for all workflow steps in the event.
   * Returns true if any missing states were created.
   */
  async ensureStepStates(
    applicationId: string,
    eventId: string,
  ): Promise<boolean> {
    const [steps, existingStates] = await this.prisma.$transaction([
      this.prisma.workflow_steps.findMany({
        where: { event_id: eventId },
        orderBy: { step_index: 'asc' },
        select: { id: true },
      }),
      this.prisma.application_step_states.findMany({
        where: { application_id: applicationId },
        select: { step_id: true },
      }),
    ]);

    const existingIds = new Set(existingStates.map((s) => s.step_id));
    const missingSteps = steps.filter((s) => !existingIds.has(s.id));

    if (missingSteps.length === 0) return false;

    await this.prisma.application_step_states.createMany({
      data: missingSteps.map((step) => ({
        id: crypto.randomUUID(),
        application_id: applicationId,
        step_id: step.id,
        status: StepStatus.LOCKED,
      })),
      skipDuplicates: true,
    });

    await this.recomputeAllStepStates(applicationId);

    return true;
  }

  /**
   * Evaluate if a step should be unlocked based on its policy
   */
  private evaluateUnlockPolicy(step: any, prevState: any, app: any): boolean {
    const policy = step.unlock_policy as UnlockPolicy;
    const strictGating = Boolean(step.strict_gating);

    // When strict gating is enabled, downstream steps remain locked until the
    // previous step is submitted or approved.
    if (
      strictGating &&
      prevState &&
      prevState.status !== StepStatus.SUBMITTED &&
      prevState.status !== StepStatus.APPROVED
    ) {
      return false;
    }

    switch (policy) {
      case UnlockPolicy.AUTO_AFTER_PREV_SUBMITTED:
        // Unlock if previous step is submitted or approved
        if (!prevState) return true; // First step
        return (
          prevState.status === StepStatus.SUBMITTED ||
          prevState.status === StepStatus.APPROVED
        );

      case UnlockPolicy.AFTER_PREV_APPROVED:
        // Unlock only if previous step is approved
        if (!prevState) return true;
        return prevState.status === StepStatus.APPROVED;

      case UnlockPolicy.DATE_BASED:
        // Unlock if date has passed
        if (!step.unlock_at) return false;
        return new Date() >= new Date(step.unlock_at);

      case UnlockPolicy.AFTER_DECISION_ACCEPTED:
        // Unlock if application decision is ACCEPTED and published
        return (
          app.decision_status === 'ACCEPTED' &&
          app.decision_published_at !== null
        );

      case UnlockPolicy.ADMIN_MANUAL:
        // Never auto-unlock
        return false;

      default:
        return false;
    }
  }

  /**
   * Mark step as submitted
   */
  async markSubmitted(
    applicationId: string,
    stepId: string,
    submissionVersionId: string,
  ): Promise<void> {
    await this.prisma.application_step_states.updateMany({
      where: { application_id: applicationId, step_id: stepId },
      data: {
        status: StepStatus.SUBMITTED,
        latest_submission_version_id: submissionVersionId,
        current_draft_id: null, // Clear draft after submission
        last_activity_at: new Date(),
      },
    });

    // Recompute downstream steps
    await this.recomputeAllStepStates(applicationId);
  }

  /**
   * Mark step as approved (by reviewer)
   */
  async markApproved(applicationId: string, stepId: string): Promise<void> {
    await this.prisma.application_step_states.updateMany({
      where: { application_id: applicationId, step_id: stepId },
      data: {
        status: StepStatus.APPROVED,
        last_activity_at: new Date(),
      },
    });

    // Recompute downstream steps
    await this.recomputeAllStepStates(applicationId);
  }

  /**
   * Mark step as needs revision (by reviewer)
   */
  async markNeedsRevision(
    applicationId: string,
    stepId: string,
    options?: { lockDownstream?: boolean },
  ): Promise<void> {
    const state = await this.prisma.application_step_states.findFirst({
      where: { application_id: applicationId, step_id: stepId },
    });

    if (!state) return;

    await this.prisma.application_step_states.update({
      where: { id: state.id },
      data: {
        status: StepStatus.NEEDS_REVISION,
        revision_cycle_count: state.revision_cycle_count + 1,
        last_activity_at: new Date(),
      },
    });

    // If strict gating, lock downstream steps
    const step = await this.prisma.workflow_steps.findUnique({
      where: { id: stepId },
    });

    if (step?.strict_gating && options?.lockDownstream !== false) {
      await this.lockDownstreamSteps(applicationId, step.step_index);
    }
  }

  /**
   * Lock all steps after a given index (strict gating)
   */
  private async lockDownstreamSteps(
    applicationId: string,
    afterIndex: number,
  ): Promise<void> {
    const app = await this.prisma.applications.findUnique({
      where: { id: applicationId },
      include: {
        application_step_states: {
          include: { workflow_steps: true },
        },
      },
    });

    if (!app) return;

    const lockableStatuses = new Set<string>([
      StepStatus.UNLOCKED,
      'UNLOCKED_DRAFT',
      'READY_TO_SUBMIT',
    ]);

    const toRelock = app.application_step_states.filter((s) => {
      const status = String(s.status ?? '');
      const unlockPolicy = String(s.workflow_steps?.unlock_policy ?? '');
      const isManualUnlock = unlockPolicy === String(UnlockPolicy.ADMIN_MANUAL);
      return (
        s.workflow_steps.step_index > afterIndex &&
        lockableStatuses.has(status) &&
        !isManualUnlock
      );
    });

    await this.prisma.$transaction(
      toRelock.map((s) =>
        this.prisma.application_step_states.update({
          where: { id: s.id },
          data: { status: StepStatus.LOCKED },
        }),
      ),
    );
  }

  /**
   * Manually unlock a step (admin override)
   */
  async manualUnlock(applicationId: string, stepId: string): Promise<void> {
    await this.prisma.application_step_states.updateMany({
      where: { application_id: applicationId, step_id: stepId },
      data: {
        status: StepStatus.UNLOCKED,
        unlocked_at: new Date(),
        last_activity_at: new Date(),
      },
    });
  }

  /**
   * Get step state for a specific step
   */
  async getStepState(
    applicationId: string,
    stepId: string,
  ): Promise<StepStateResponse | null> {
    const state = await this.prisma.application_step_states.findFirst({
      where: { application_id: applicationId, step_id: stepId },
      include: {
        workflow_steps: { select: { title: true, step_index: true } },
      },
    });

    if (!state) return null;

    return {
      stepId: state.step_id,
      stepTitle: state.workflow_steps?.title || 'Unknown',
      stepIndex: state.workflow_steps?.step_index ?? 0,
      status: state.status as StepStatus,
      currentDraftId: state.current_draft_id,
      latestSubmissionVersionId: state.latest_submission_version_id,
      revisionCycleCount: state.revision_cycle_count,
      unlockedAt: state.unlocked_at,
      lastActivityAt: state.last_activity_at,
    };
  }
}
