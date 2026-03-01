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
import { isDeepStrictEqual } from 'node:util';

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
      select: { category: true, form_version_id: true },
    });
    if (!step) {
      throw new NotFoundException('Step not found');
    }
    if (!step.form_version_id) {
      if (step.category === 'INFO_ONLY') {
        // Info-only steps intentionally do not persist answer drafts.
        await this.prisma.application_step_states.updateMany({
          where: { application_id: applicationId, step_id: stepId },
          data: { last_activity_at: new Date() },
        });
        return { draftId: state.currentDraftId ?? '' };
      }

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
    let answersForSubmission = normalizedAnswers;

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
      select: {
        category: true,
        deadline_at: true,
        form_version_id: true,
        review_required: true,
      },
    });
    if (!step) {
      throw new NotFoundException('Step not found');
    }

    // Enforce step deadline (if set)
    if (step.deadline_at && new Date() > new Date(step.deadline_at)) {
      throw new ForbiddenException('Step deadline has passed');
    }

    if (!step.form_version_id) {
      if (step.category === 'INFO_ONLY') {
        const submittedAt = new Date();

        await this.prisma.application_step_states.updateMany({
          where: { application_id: applicationId, step_id: stepId },
          data: {
            // Info-only steps have no submission version; consider them complete immediately.
            status: StepStatus.APPROVED,
            latest_submission_version_id: null,
            current_draft_id: null,
            last_activity_at: submittedAt,
          },
        });

        await this.stepStateService.recomputeAllStepStates(applicationId);

        await this.prisma.needs_info_requests.updateMany({
          where: {
            application_id: applicationId,
            step_id: stepId,
            status: 'OPEN',
          },
          data: {
            status: 'RESOLVED',
            resolved_at: submittedAt,
          },
        });

        return {
          id: crypto.randomUUID(),
          applicationId,
          stepId,
          formVersionId: '',
          versionNumber: 0,
          answersSnapshot: {},
          submittedAt,
          submittedBy: userId,
        };
      }

      throw new BadRequestException('Step has no form attached');
    }
    const formVersionId = step.form_version_id;

    // Fetch form version to validate answers
    const formVersion = await this.prisma.form_versions.findUnique({
      where: { id: formVersionId },
    });
    if (!formVersion) {
      throw new BadRequestException('Form version not found');
    }

    const definition = formVersion.schema as unknown as FormDefinition;
    await this.ensureNeedsInfoTargetFieldEditsAllowed(
      applicationId,
      stepId,
      state.status,
      normalizedAnswers,
      definition,
    );
    answersForSubmission =
      await this.mergeAnswersWithPreviousWhenTargetedNeedsInfo(
        applicationId,
        stepId,
        state.status,
        normalizedAnswers,
      );

    // Strict Validation
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
      const result = answerSchema.safeParse(answersForSubmission);
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
      formVersionId,
      answersForSubmission,
      applicationId,
      stepId,
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
          form_version_id: formVersionId,
          version_number: nextVersion,
          answers_snapshot: answersForSubmission,
          submitted_by: userId,
        },
      });

      const shouldRequireReview = Boolean(step.review_required);

      // Update step state in the same transaction.
      // Steps without review_required are auto-approved on submit.
      await tx.application_step_states.updateMany({
        where: { application_id: applicationId, step_id: stepId },
        data: {
          status: shouldRequireReview
            ? StepStatus.SUBMITTED
            : StepStatus.APPROVED,
          latest_submission_version_id: newSubmission.id,
          current_draft_id: null,
          last_activity_at: new Date(),
        },
      });

      return newSubmission;
    });

    // Recompute downstream steps after transaction (can be async)
    await this.stepStateService.recomputeAllStepStates(applicationId);

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

  private async mergeAnswersWithPreviousWhenTargetedNeedsInfo(
    applicationId: string,
    stepId: string,
    currentStepStatus: StepStatus,
    submittedAnswers: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (currentStepStatus !== StepStatus.NEEDS_REVISION) {
      return submittedAnswers;
    }

    const openRequests = await this.prisma.needs_info_requests.findMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        status: 'OPEN',
      },
      select: { target_field_ids: true },
    });
    const hasTargetedFields = openRequests.some((request) =>
      (request.target_field_ids ?? []).some(
        (fieldId) => typeof fieldId === 'string' && fieldId.trim().length > 0,
      ),
    );
    if (!hasTargetedFields) {
      return submittedAnswers;
    }

    const latestSubmission = await this.prisma.step_submission_versions.findFirst({
      where: { application_id: applicationId, step_id: stepId },
      orderBy: { version_number: 'desc' },
      select: { answers_snapshot: true },
    });
    if (!latestSubmission) {
      return submittedAnswers;
    }

    const previousAnswers = this.normalizeAnswersShape(
      latestSubmission.answers_snapshot as Record<string, any>,
    );
    const mergedAnswers: Record<string, any> = { ...previousAnswers };
    for (const [fieldId, value] of Object.entries(submittedAnswers)) {
      if (value === undefined) continue;
      mergedAnswers[fieldId] = value;
    }
    return mergedAnswers;
  }

  /**
   * Enforce targeted-field revision mode when open needs-info requests specify targets.
   */
  private async ensureNeedsInfoTargetFieldEditsAllowed(
    applicationId: string,
    stepId: string,
    currentStepStatus: StepStatus,
    submittedAnswers: Record<string, any>,
    formDefinition?: FormDefinition,
  ): Promise<void> {
    if (currentStepStatus !== StepStatus.NEEDS_REVISION) return;

    const openRequests = await this.prisma.needs_info_requests.findMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        status: 'OPEN',
      },
      select: { target_field_ids: true },
    });
    if (openRequests.length === 0) return;

    const targetedFieldIds = new Set(
      openRequests.flatMap((request) =>
        (request.target_field_ids ?? [])
          .filter((fieldId): fieldId is string => typeof fieldId === 'string')
          .map((fieldId) => fieldId.trim())
          .filter((fieldId) => fieldId.length > 0),
      ),
    );
    if (targetedFieldIds.size === 0) return;

    const fieldAliases = this.buildFormFieldAliasMap(formDefinition);
    const allowedFieldIds = this.expandAllowedNeedsInfoFieldIds(
      targetedFieldIds,
      formDefinition,
      fieldAliases,
    );

    const latestSubmission = await this.prisma.step_submission_versions.findFirst({
      where: { application_id: applicationId, step_id: stepId },
      orderBy: { version_number: 'desc' },
      select: { answers_snapshot: true },
    });
    if (!latestSubmission) return;

    const previousAnswers = this.normalizeAnswersShape(
      latestSubmission.answers_snapshot as Record<string, any>,
    );
    const changedFieldIds = Object.keys(submittedAnswers)
      .map((fieldId) => fieldId.trim())
      .filter((fieldId) => fieldId.length > 0)
      .filter(
        (fieldId) =>
          !isDeepStrictEqual(submittedAnswers[fieldId], previousAnswers[fieldId]),
      );

    const disallowedChanges = changedFieldIds.filter(
      (fieldId) =>
        !allowedFieldIds.has(
          this.resolveCanonicalFieldId(fieldId, fieldAliases),
        ),
    );
    if (disallowedChanges.length === 0) return;

    const allowedFieldList = Array.from(allowedFieldIds).sort();
    throw new BadRequestException(
      `Only requested fields can be changed for this revision. Allowed fields: ${allowedFieldList.join(', ')}.`,
    );
  }

  private buildFormFieldAliasMap(
    formDefinition?: FormDefinition,
  ): Map<string, string> {
    const aliases = new Map<string, string>();
    if (!formDefinition) return aliases;

    for (const field of getFormFields(formDefinition)) {
      const canonicalFieldId = this.normalizeFieldId(field.key ?? field.id);
      if (!canonicalFieldId) continue;

      aliases.set(canonicalFieldId, canonicalFieldId);
      const rawFieldId = this.normalizeFieldId(field.id);
      if (rawFieldId) {
        aliases.set(rawFieldId, canonicalFieldId);
      }
    }

    return aliases;
  }

  private expandAllowedNeedsInfoFieldIds(
    targetedFieldIds: Set<string>,
    formDefinition: FormDefinition | undefined,
    fieldAliases: Map<string, string>,
  ): Set<string> {
    const allowedFieldIds = new Set<string>();
    const dependencyGraph = this.buildConditionalDependencyGraph(
      formDefinition,
      fieldAliases,
    );
    const queue: string[] = [];

    for (const targetFieldId of targetedFieldIds) {
      const canonicalFieldId = this.resolveCanonicalFieldId(
        targetFieldId,
        fieldAliases,
      );
      if (allowedFieldIds.has(canonicalFieldId)) continue;
      allowedFieldIds.add(canonicalFieldId);
      queue.push(canonicalFieldId);
    }

    while (queue.length > 0) {
      const currentFieldId = queue.shift();
      if (!currentFieldId) continue;

      const dependentFields = dependencyGraph.get(currentFieldId);
      if (!dependentFields) continue;

      for (const dependentFieldId of dependentFields) {
        if (allowedFieldIds.has(dependentFieldId)) continue;
        allowedFieldIds.add(dependentFieldId);
        queue.push(dependentFieldId);
      }
    }

    return allowedFieldIds;
  }

  private buildConditionalDependencyGraph(
    formDefinition: FormDefinition | undefined,
    fieldAliases: Map<string, string>,
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    if (!formDefinition) return graph;

    const fields = getFormFields(formDefinition);
    for (const field of fields) {
      const canonicalFieldId = this.normalizeFieldId(field.key ?? field.id);
      if (!canonicalFieldId) continue;

      const canonicalTargetFieldId = this.resolveCanonicalFieldId(
        canonicalFieldId,
        fieldAliases,
      );
      if (!graph.has(canonicalTargetFieldId)) {
        graph.set(canonicalTargetFieldId, new Set<string>());
      }

      const conditionGroups = [field.logic?.showWhen, field.logic?.requireWhen];
      for (const group of conditionGroups) {
        for (const rule of group?.rules ?? []) {
          const normalizedSourceFieldId = this.normalizeFieldId(rule.fieldKey);
          if (!normalizedSourceFieldId) continue;

          const canonicalSourceFieldId = this.resolveCanonicalFieldId(
            normalizedSourceFieldId,
            fieldAliases,
          );
          if (!graph.has(canonicalSourceFieldId)) {
            graph.set(canonicalSourceFieldId, new Set<string>());
          }
          graph
            .get(canonicalSourceFieldId)
            ?.add(canonicalTargetFieldId);
        }
      }
    }

    return graph;
  }

  private resolveCanonicalFieldId(
    fieldId: string,
    fieldAliases: Map<string, string>,
  ): string {
    return fieldAliases.get(fieldId) ?? fieldId;
  }

  private normalizeFieldId(fieldId: string | null | undefined): string | null {
    if (typeof fieldId !== 'string') return null;
    const normalized = fieldId.trim();
    return normalized.length > 0 ? normalized : null;
  }

  /**
   * Validate and commit file answers
   */
  private async validateFiles(
    formVersionId: string,
    answers: Record<string, any>,
    applicationId: string,
    stepId: string,
    userId: string,
    eventId: string,
  ): Promise<void> {
    const version = await this.prisma.form_versions.findUnique({
      where: { id: formVersionId },
    });
    const allFields = getFormFields(
      version?.schema as FormDefinition | undefined,
    );

    const references: Array<{
      fileId: string;
      fieldId: string;
      allowedMimeTypes: string[];
      maxFileSizeBytes?: number;
    }> = [];
    for (const field of allFields) {
      if (field.type !== 'file_upload') continue;
      const fieldKey = field.key || field.id;
      const value = answers[fieldKey];
      const fileIds = this.extractFileObjectIds(value);
      if (fileIds.length === 0) continue;

      const allowedMimeTypes = Array.isArray(
        field.ui?.allowedMimeTypes ?? field.validation?.allowedTypes,
      )
        ? Array.from(
            new Set(
              (field.ui?.allowedMimeTypes ?? field.validation?.allowedTypes ?? [])
                .filter((entry): entry is string => typeof entry === 'string')
                .map((entry) => entry.trim().toLowerCase())
                .filter((entry) => entry.length > 0),
            ),
          )
        : [];
      const maxFileSizeMB = Number(field.ui?.maxFileSizeMB);
      const maxFileSizeBytes =
        Number.isFinite(maxFileSizeMB) && maxFileSizeMB > 0
          ? Math.floor(maxFileSizeMB * 1024 * 1024)
          : undefined;

      for (const fileId of fileIds) {
        const normalizedFileId = String(fileId).trim();
        if (!normalizedFileId) continue;
        references.push({
          fileId: normalizedFileId,
          fieldId: fieldKey,
          allowedMimeTypes,
          maxFileSizeBytes,
        });
      }
    }

    if (references.length > 0) {
      await this.filesService.validateAndCommit(references, eventId, userId, {
        applicationId,
        stepId,
      });
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
