import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import {
  CreateReviewDto,
  ReviewOutcome,
  ReviewRecordResponse,
  NeedsInfoResponse,
  NeedsInfoStatus,
  StepStatus,
} from '@event-platform/shared';
import { StepStateService } from '../applications/step-state.service';
import { ApplicationsService } from '../applications/applications.service';
import { FilesService } from './files.service';
import { FormsService } from '../workflow/forms.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly stepStateService: StepStateService,
    private readonly applicationsService: ApplicationsService,
    private readonly filesService: FilesService,
    private readonly formsService: FormsService,
  ) {}

  /**
   * Create a review action (version-targeted)
   * Returns 409 if versionId is not the latest submitted version
   */
  async createReview(
    eventId: string,
    applicationId: string,
    stepId: string,
    versionId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewRecordResponse> {
    const reviewerId = this.cls.get('actorId');

    // Verify application belongs to event
    const application = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Get step config for reject behavior and ensure event scope
    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
    });
    if (!step) throw new NotFoundException('Step not found');

    // Verify version exists and is for this step
    const version = await this.prisma.step_submission_versions.findFirst({
      where: { id: versionId, application_id: applicationId, step_id: stepId },
    });
    if (!version) {
      throw new NotFoundException('Submission version not found');
    }

    // Check if this is the latest version for this step
    const latestVersion = await this.prisma.step_submission_versions.findFirst({
      where: { application_id: applicationId, step_id: stepId },
      orderBy: { version_number: 'desc' },
    });

    if (!latestVersion || latestVersion.id !== versionId) {
      throw new ConflictException({
        code: 'VERSION_NOT_LATEST',
        message: 'Cannot review old version. Applicant has resubmitted.',
        latestVersionId: latestVersion?.id,
      });
    }

    if (dto.outcome === ReviewOutcome.APPROVE) {
      const requiredRefs =
        await this.formsService.getRequiredFileRefsForAnswers(
          version.form_version_id,
          version.answers_snapshot as Record<string, any>,
        );

      const allVerified = await this.filesService.checkVerificationStatus(
        versionId,
        requiredRefs,
      );
      if (!allVerified) {
        throw new BadRequestException(
          'Required file uploads must be verified before approval. Please review file answers.',
        );
      }
    }

    // Create review record
    const review = await this.prisma.review_records.create({
      data: {
        id: crypto.randomUUID(),
        submission_version_id: versionId,
        reviewer_id: reviewerId,
        outcome: dto.outcome,
        checklist_result: dto.checklistResult || {},
        message_to_applicant: dto.messageToApplicant,
        notes_internal: dto.notesInternal,
      },
    });

    // Handle outcome effects
    switch (dto.outcome) {
      case ReviewOutcome.APPROVE: {
        await this.handleApprove(eventId, applicationId, stepId, versionId);
        break;
      }

      case ReviewOutcome.REJECT:
        await this.handleReject(applicationId, stepId, step.reject_behavior);
        break;

      case ReviewOutcome.REQUEST_INFO: {
        await this.createNeedsInfo(
          applicationId,
          stepId,
          versionId,
          dto.targetFieldIds || [],
          dto.messageToApplicant || '',
          dto.deadline,
          reviewerId,
        );
        break;
      }
    }

    return {
      id: review.id,
      submissionVersionId: review.submission_version_id,
      reviewerId: review.reviewer_id,
      outcome: review.outcome as ReviewOutcome,
      checklistResult: review.checklist_result as Record<string, boolean>,
      messageToApplicant: review.message_to_applicant,
      notesInternal: review.notes_internal,
      createdAt: review.created_at,
    };
  }

  /**
   * Handle APPROVE outcome
   */
  private async handleApprove(
    eventId: string,
    applicationId: string,
    stepId: string,
    versionId: string,
  ): Promise<void> {
    // Mark step as approved
    await this.stepStateService.markApproved(applicationId, stepId);

    // If step is a CONFIRMATION step, generate attendance record + QR token
    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
      select: { category: true },
    });
    if (step?.category === 'CONFIRMATION') {
      try {
        await this.applicationsService.confirmAttendance(
          eventId,
          applicationId,
        );
      } catch {
        // Non-fatal: attendance record may already exist or decision not yet published
      }
    }

    // Close any open needs-info for this step
    await this.prisma.needs_info_requests.updateMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        status: NeedsInfoStatus.OPEN,
      },
      data: {
        status: NeedsInfoStatus.CANCELED,
        resolved_at: new Date(),
      },
    });
  }

  /**
   * Handle REJECT outcome
   */
  private async handleReject(
    applicationId: string,
    stepId: string,
    rejectBehavior: string | null,
  ): Promise<void> {
    if (rejectBehavior === 'FINAL') {
      // Permanent rejection - update step state
      await this.prisma.application_step_states.updateMany({
        where: { application_id: applicationId, step_id: stepId },
        data: {
          status: StepStatus.REJECTED_FINAL,
          last_activity_at: new Date(),
        },
      });

      // Lock all downstream steps (they become "not applicable")
      const step = await this.prisma.workflow_steps.findUnique({
        where: { id: stepId },
      });
      if (step) {
        const downstreamSteps = await this.prisma.workflow_steps.findMany({
          where: {
            event_id: step.event_id,
            step_index: { gt: step.step_index },
          },
          select: { id: true },
        });

        if (downstreamSteps.length > 0) {
          await this.prisma.application_step_states.updateMany({
            where: {
              application_id: applicationId,
              step_id: { in: downstreamSteps.map((ds) => ds.id) },
            },
            data: { status: StepStatus.LOCKED },
          });
        }
      }
    } else {
      // RESUBMIT_ALLOWED - mark as needs revision
      await this.stepStateService.markNeedsRevision(applicationId, stepId);
    }
  }

  /**
   * Create needs-info request
   */
  private async createNeedsInfo(
    applicationId: string,
    stepId: string,
    versionId: string,
    targetFieldIds: string[],
    message: string,
    deadline: Date | undefined,
    createdBy: string,
  ): Promise<void> {
    await this.prisma.needs_info_requests.create({
      data: {
        id: crypto.randomUUID(),
        application_id: applicationId,
        step_id: stepId,
        submission_version_id: versionId,
        target_field_ids: targetFieldIds,
        message,
        deadline_at: deadline,
        status: NeedsInfoStatus.OPEN,
        created_by: createdBy,
      },
    });

    // Mark step as needs revision (triggers strict gating)
    await this.stepStateService.markNeedsRevision(applicationId, stepId);
  }

  /**
   * Get all reviews for a submission version
   */
  async getVersionReviews(
    eventId: string,
    applicationId: string,
    stepId: string,
    versionId: string,
  ): Promise<ReviewRecordResponse[]> {
    const version = await this.prisma.step_submission_versions.findFirst({
      where: { id: versionId, application_id: applicationId, step_id: stepId },
      include: { applications: { select: { event_id: true } } },
    });
    if (!version || version.applications.event_id !== eventId) {
      throw new NotFoundException('Submission version not found');
    }

    const reviews = await this.prisma.review_records.findMany({
      where: { submission_version_id: versionId },
      orderBy: { created_at: 'desc' },
      include: { users: { select: { email: true } } },
    });

    return reviews.map((r) => ({
      id: r.id,
      submissionVersionId: r.submission_version_id,
      reviewerId: r.reviewer_id,
      reviewerEmail: r.users?.email,
      outcome: r.outcome as ReviewOutcome,
      checklistResult: r.checklist_result as Record<string, boolean>,
      messageToApplicant: r.message_to_applicant,
      notesInternal: r.notes_internal,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get open needs-info requests for an application
   */
  async getNeedsInfo(
    eventId: string,
    applicationId: string,
    stepId?: string,
  ): Promise<NeedsInfoResponse[]> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const where: any = { application_id: applicationId };
    if (stepId) where.step_id = stepId;

    const requests = await this.prisma.needs_info_requests.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      applicationId: r.application_id,
      stepId: r.step_id,
      submissionVersionId: r.submission_version_id,
      targetFieldIds: r.target_field_ids,
      message: r.message,
      deadlineAt: r.deadline_at,
      status: r.status as NeedsInfoStatus,
      resolvedAt: r.resolved_at,
      resolvedByVersionId: null, // Not in schema, tracked separately if needed
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  }

  /**
   * Resolve needs-info when applicant resubmits
   * Called automatically by SubmissionsService on new submission
   */
  async resolveNeedsInfoOnResubmit(
    applicationId: string,
    stepId: string,
    newVersionId: string,
  ): Promise<void> {
    // Note: newVersionId stored in audit log but not in needs_info_requests table
    await this.prisma.needs_info_requests.updateMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        status: NeedsInfoStatus.OPEN,
      },
      data: {
        status: NeedsInfoStatus.RESOLVED,
        resolved_at: new Date(),
      },
    });
  }

  /**
   * Cancel a needs-info request (staff action)
   */
  async cancelNeedsInfo(eventId: string, needsInfoId: string): Promise<void> {
    const req = await this.prisma.needs_info_requests.findUnique({
      where: { id: needsInfoId },
      include: { applications: { select: { event_id: true } } },
    });
    if (!req || req.applications.event_id !== eventId) {
      throw new NotFoundException('Needs-info request not found');
    }

    await this.prisma.needs_info_requests.update({
      where: { id: needsInfoId },
      data: {
        status: NeedsInfoStatus.CANCELED,
        resolved_at: new Date(),
      },
    });
  }
}
