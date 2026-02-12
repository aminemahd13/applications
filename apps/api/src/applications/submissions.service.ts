import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import {
  SaveDraftDto,
  SubmitStepDto,
  SubmissionVersionResponse,
  EffectiveDataResponse,
  StepStatus,
  PatchSummary,
} from '@event-platform/shared';
import { StepStateService } from './step-state.service';
import { FilesService } from '../reviews/files.service';
import { FormsService } from '../workflow/forms.service';
import {
  generateFormSchema,
  FormDefinition,
  getFormFields,
  FieldType,
} from '@event-platform/schemas';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly stepStateService: StepStateService,
    private readonly filesService: FilesService,
    private readonly formsService: FormsService,
  ) {}

  /**
   * Save draft answers for a step (autosave)
   */
  async saveDraft(
    applicationId: string,
    stepId: string,
    dto: SaveDraftDto,
  ): Promise<{ draftId: string }> {
    const normalizedAnswers = this.normalizeAnswersShape(dto.answers);

    const state = await this.stepStateService.getStepState(
      applicationId,
      stepId,
    );
    if (!state) throw new NotFoundException('Step state not found');

    // Check step is unlocked or needs revision
    if (
      state.status !== StepStatus.UNLOCKED &&
      state.status !== StepStatus.NEEDS_REVISION
    ) {
      throw new ForbiddenException('Step is not open for editing');
    }

    // Get current form version for this step
    const step = await this.prisma.workflow_steps.findUnique({
      where: { id: stepId },
    });
    if (!step?.form_version_id) {
      throw new BadRequestException('Step has no form attached');
    }

    // Upsert draft
    let draft = await this.prisma.step_drafts.findFirst({
      where: { application_id: applicationId, step_id: stepId },
    });

    if (draft) {
      draft = await this.prisma.step_drafts.update({
        where: { id: draft.id },
        data: {
          answers_draft: normalizedAnswers,
          form_version_id: step.form_version_id,
          updated_at: new Date(),
        },
      });
    } else {
      draft = await this.prisma.step_drafts.create({
        data: {
          id: crypto.randomUUID(),
          application_id: applicationId,
          step_id: stepId,
          form_version_id: step.form_version_id,
          answers_draft: normalizedAnswers,
        },
      });

      // Link draft to step state
      await this.prisma.application_step_states.updateMany({
        where: { application_id: applicationId, step_id: stepId },
        data: { current_draft_id: draft.id },
      });
    }

    return { draftId: draft.id };
  }

  /**
   * Get current draft for a step
   */
  async getDraft(
    applicationId: string,
    stepId: string,
  ): Promise<Record<string, any> | null> {
    const draft = await this.prisma.step_drafts.findFirst({
      where: { application_id: applicationId, step_id: stepId },
    });

    return draft?.answers_draft
      ? this.normalizeAnswersShape(draft.answers_draft as Record<string, any>)
      : null;
  }

  /**
   * Submit step (creates immutable submission version)
   */
  async submit(
    eventId: string,
    applicationId: string,
    stepId: string,
    dto: SubmitStepDto,
  ): Promise<SubmissionVersionResponse> {
    const userId = this.cls.get('actorId');
    const normalizedAnswers = this.normalizeAnswersShape(dto.answers);

    // Verify application belongs to event
    const application = await this.prisma.applications.findUnique({
      where: { id: applicationId },
      select: { event_id: true, applicant_user_id: true },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application.event_id !== eventId)
      throw new ForbiddenException('Application does not belong to this event');
    if (application.applicant_user_id !== userId) {
      throw new ForbiddenException('Cannot submit for another applicant');
    }

    // Verify user ownership (redundant if checking permissions via guard/roles, but safe)
    // If actor is the applicant, ensure matches. If reviewer, permissions handled by Guard.

    const state = await this.stepStateService.getStepState(
      applicationId,
      stepId,
    );

    if (!state) throw new NotFoundException('Step state not found');

    // Check step is unlocked or needs revision
    if (
      state.status !== StepStatus.UNLOCKED &&
      state.status !== StepStatus.NEEDS_REVISION
    ) {
      throw new ForbiddenException('Step is not open for submission');
    }

    // Get form version and step details
    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
    });
    if (!step?.form_version_id) {
      throw new BadRequestException('Step has no form attached');
    }

    // Enforce step deadline (if set)
    if (step.deadline_at && new Date() > new Date(step.deadline_at)) {
      throw new ForbiddenException('Step deadline has passed');
    }

    // Fetch form version to validate answers
    const formVersion = await this.prisma.form_versions.findUnique({
      where: { id: step.form_version_id },
    });
    if (!formVersion) {
      throw new BadRequestException('Form version not found');
    }

    // Strict Validation
    const definition = formVersion.schema as unknown as FormDefinition;
    if (definition) {
      const inputFieldCount = getFormFields(definition).filter(
        (field) => field.type !== FieldType.INFO_TEXT,
      ).length;

      if (inputFieldCount === 0) {
        throw new BadRequestException(
          'This step form has no input fields configured. Please contact the organizer.',
        );
      }

      const answerSchema = generateFormSchema(definition);
      const result = answerSchema.safeParse(normalizedAnswers);
      if (!result.success) {
        throw new BadRequestException(
          `Validation failed: ${result.error.issues.map((e) => e.message).join(', ')}`,
        );
      }
    }

    // Validate and commit files (User requirement: staging -> committed)
    // Also verifies ownership
    // Validate and commit files (User requirement: staging -> committed)
    // Also verifies ownership within event
    await this.validateFiles(
      step.form_version_id,
      normalizedAnswers,
      applicationId,
      userId,
      eventId,
    );

    // Use transaction for atomic submission + state update (concurrency protection)
    const submission = await this.prisma.$transaction(async (tx) => {
      // Get next version number within transaction to prevent race conditions
      const lastVersion = await tx.step_submission_versions.findFirst({
        where: { application_id: applicationId, step_id: stepId },
        orderBy: { version_number: 'desc' },
      });
      const nextVersion = (lastVersion?.version_number || 0) + 1;

      // Create immutable submission version
      const newSubmission = await tx.step_submission_versions.create({
        data: {
          id: crypto.randomUUID(),
          application_id: applicationId,
          step_id: stepId,
          form_version_id: step.form_version_id!,
          version_number: nextVersion,
          answers_snapshot: normalizedAnswers,
          submitted_by: userId,
        },
      });

      // Update step state to SUBMITTED within same transaction
      await tx.application_step_states.updateMany({
        where: { application_id: applicationId, step_id: stepId },
        data: {
          status: StepStatus.SUBMITTED,
          latest_submission_version_id: newSubmission.id,
          current_draft_id: null,
          last_activity_at: new Date(),
        },
      });

      return newSubmission;
    });

    // Recompute downstream steps after transaction (can be async)
    await this.stepStateService.recomputeAllStepStates(applicationId);

    // If this is a CONFIRMATION step and application is accepted, auto-create attendance record
    if (step.category === 'CONFIRMATION') {
      try {
        const app = await this.prisma.applications.findFirst({
          where: { id: applicationId, event_id: eventId },
          select: { decision_status: true, decision_published_at: true },
        });
        if (app?.decision_status === 'ACCEPTED' && app.decision_published_at) {
          const existing = await this.prisma.attendance_records.findUnique({
            where: { application_id: applicationId },
          });
          if (!existing) {
            await this.prisma.attendance_records.create({
              data: {
                application_id: applicationId,
                confirmed_at: new Date(),
                qr_token_hash: crypto.randomUUID(),
                status: 'CONFIRMED',
              },
            });
          }
        }
      } catch {
        // Non-fatal: attendance record creation is best-effort here
      }
    }

    // Resolve any open needs-info requests for this step on resubmit
    await this.prisma.needs_info_requests.updateMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        status: 'OPEN',
      },
      data: {
        status: 'RESOLVED',
        resolved_at: new Date(),
      },
    });

    return {
      id: submission.id,
      applicationId: submission.application_id,
      stepId: submission.step_id,
      formVersionId: submission.form_version_id,
      versionNumber: submission.version_number,
      answersSnapshot: this.normalizeAnswersShape(
        submission.answers_snapshot as Record<string, any>,
      ),
      submittedAt: submission.submitted_at,
      submittedBy: submission.submitted_by,
    };
  }

  /**
   * Get all submission versions for a step
   */
  async getVersions(
    eventId: string,
    applicationId: string,
    stepId: string,
  ): Promise<SubmissionVersionResponse[]> {
    await this.ensureEventScope(eventId, applicationId, stepId);
    const versions = await this.prisma.step_submission_versions.findMany({
      where: { application_id: applicationId, step_id: stepId },
      orderBy: { version_number: 'desc' },
    });

    return versions.map((v) => ({
      id: v.id,
      applicationId: v.application_id,
      stepId: v.step_id,
      formVersionId: v.form_version_id,
      versionNumber: v.version_number,
      answersSnapshot: this.normalizeAnswersShape(
        v.answers_snapshot as Record<string, any>,
      ),
      submittedAt: v.submitted_at,
      submittedBy: v.submitted_by,
    }));
  }

  /**
   * Get specific submission version
   */
  async getVersion(
    versionId: string,
  ): Promise<SubmissionVersionResponse | null> {
    const version = await this.prisma.step_submission_versions.findUnique({
      where: { id: versionId },
    });

    if (!version) return null;

    return {
      id: version.id,
      applicationId: version.application_id,
      stepId: version.step_id,
      formVersionId: version.form_version_id,
      versionNumber: version.version_number,
      answersSnapshot: this.normalizeAnswersShape(
        version.answers_snapshot as Record<string, any>,
      ),
      submittedAt: version.submitted_at,
      submittedBy: version.submitted_by,
    };
  }

  /**
   * Compute effective data for a step (base submission + patches)
   */
  async getEffectiveData(
    eventId: string,
    applicationId: string,
    stepId: string,
  ): Promise<EffectiveDataResponse | null> {
    await this.ensureEventScope(eventId, applicationId, stepId);
    // Get latest submission
    const latestSubmission =
      await this.prisma.step_submission_versions.findFirst({
        where: { application_id: applicationId, step_id: stepId },
        orderBy: { version_number: 'desc' },
      });

    if (!latestSubmission) return null;

    // Get active patches
    const patches = await this.prisma.admin_change_patches.findMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        submission_version_id: latestSubmission.id,
        is_active: true,
      },
      orderBy: { created_at: 'asc' },
      include: { users: { select: { id: true } } },
    });

    // Compute effective answers by applying patches
    const baseAnswers = this.normalizeAnswersShape(
      latestSubmission.answers_snapshot as Record<string, any>,
    );
    const effectiveAnswers = { ...baseAnswers };

    for (const patch of patches) {
      const ops = patch.ops as any[];
      if (Array.isArray(ops)) {
        for (const op of ops) {
          if (op.op === 'replace' && op.path) {
            const fieldPath = op.path.replace(/^\//, '');
            effectiveAnswers[fieldPath] = op.value;
          }
        }
      }
    }

    return {
      stepId,
      formVersionId: latestSubmission.form_version_id,
      baseAnswers,
      patches: patches.map(
        (p): PatchSummary => ({
          id: p.id,
          reason: p.reason,
          visibility: p.visibility,
          createdBy: p.created_by,
          createdAt: p.created_at,
        }),
      ),
      effectiveAnswers,
    };
  }

  /**
   * Validate and commit file answers
   */
  private async validateFiles(
    formVersionId: string,
    answers: Record<string, any>,
    applicationId: string,
    userId: string,
    eventId: string,
  ): Promise<void> {
    const version = await this.prisma.form_versions.findUnique({
      where: { id: formVersionId },
    });
    const allFields = getFormFields(
      version?.schema as FormDefinition | undefined,
    );

    const fileIds = new Set<string>();
    for (const field of allFields) {
      if (field.type !== 'file_upload') continue;
      const fieldKey = field.key || field.id;
      const value = answers[fieldKey];
      this.extractFileObjectIds(value).forEach((id) => fileIds.add(id));
    }

    if (fileIds.size > 0) {
      await this.filesService.validateAndCommit([...fileIds], eventId, userId);
    }
  }

  private extractFileObjectIds(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.flatMap((v) => this.extractFileObjectIds(v));
    }
    if (typeof value === 'string') return [value];
    if (typeof value === 'object') {
      if (typeof value.fileObjectId === 'string') return [value.fileObjectId];
      if (Array.isArray(value.fileObjectIds)) {
        return value.fileObjectIds.filter((v: any) => typeof v === 'string');
      }
    }
    return [];
  }

  /**
   * Backward-compat: unwrap legacy answer envelopes shaped as { data: {...} }.
   */
  private normalizeAnswersShape(
    answers: Record<string, any> | null | undefined,
  ): Record<string, any> {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return {};
    }

    const normalized = { ...answers };
    const nestedData = normalized.data;
    if (
      nestedData &&
      typeof nestedData === 'object' &&
      !Array.isArray(nestedData)
    ) {
      Object.assign(normalized, nestedData as Record<string, any>);
    }
    if (
      'data' in normalized &&
      Object.keys(normalized).some((key) => key !== 'data')
    ) {
      delete normalized.data;
    }

    return normalized;
  }

  private async ensureEventScope(
    eventId: string,
    applicationId: string,
    stepId: string,
  ): Promise<void> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
      select: { id: true },
    });
    if (!step) throw new NotFoundException('Step not found');
  }
}
