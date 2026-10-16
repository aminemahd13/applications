import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  resolveRequiredFileGate,
  type RequiredFileGate,
  type RequiredFileRef,
} from '../common/utils/effective-answers.util';
import { ClsService } from 'nestjs-cls';
import {
  CreateFormDto,
  UpdateFormDraftDto,
  PaginatedResponse,
  PaginationDto,
} from '@event-platform/shared';
import {
  FormDefinitionSchema,
  FormDefinition,
  normalizeFormDefinition,
  getFormFields,
  FieldType,
} from '@event-platform/schemas';

export interface FormResponse {
  id: string;
  eventId: string;
  name: string;
  draftSchema: any;
  draftUi: any;
  createdAt: Date;
  updatedAt: Date;
  latestVersion?: number | null;
}

export interface FormVersionResponse {
  id: string;
  formId: string;
  versionNumber: number;
  schema: any;
  ui: any;
  publishedBy: string;
  publishedAt: Date;
}

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * List forms for an event
   */
  async findAll(
    eventId: string,
    filter: PaginationDto,
  ): Promise<PaginatedResponse<FormResponse>> {
    const { cursor, limit, order } = filter;

    const where: any = { event_id: eventId };
    if (cursor) where.id = { lt: cursor };

    const forms = await this.prisma.forms.findMany({
      where,
      orderBy: { created_at: order },
      take: limit + 1,
      include: {
        form_versions: {
          orderBy: { version_number: 'desc' },
          take: 1,
          select: { version_number: true },
        },
      },
    });

    const hasMore = forms.length > limit;
    const data = hasMore ? forms.slice(0, -1) : forms;

    return {
      data: data.map((f) => ({
        id: f.id,
        eventId: f.event_id,
        name: f.name,
        draftSchema: f.draft_schema,
        draftUi: f.draft_ui,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        latestVersion: f.form_versions[0]?.version_number || null,
      })),
      meta: {
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  /**
   * Get form by ID
   */
  async findById(eventId: string, formId: string): Promise<FormResponse> {
    const form = await this.prisma.forms.findFirst({
      where: { id: formId, event_id: eventId },
      include: {
        form_versions: {
          orderBy: { version_number: 'desc' },
          take: 1,
          select: { version_number: true },
        },
      },
    });

    if (!form) throw new NotFoundException('Form not found');

    return {
      id: form.id,
      eventId: form.event_id,
      name: form.name,
      draftSchema: form.draft_schema,
      draftUi: form.draft_ui,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
      latestVersion: form.form_versions[0]?.version_number || null,
    };
  }

  /**
   * Delete a form and its versions
   */
  async deleteForm(eventId: string, formId: string): Promise<void> {
    const form = await this.prisma.forms.findFirst({
      where: { id: formId, event_id: eventId },
      include: {
        form_versions: { select: { id: true } },
      },
    });
    if (!form) throw new NotFoundException('Form not found');

    // Check if any form version is used by a workflow step
    if (form.form_versions.length > 0) {
      const versionIds = form.form_versions.map((v) => v.id);
      const [usedByStep, usedByDraft, usedBySubmission] = await Promise.all([
        this.prisma.workflow_steps.findFirst({
          where: { form_version_id: { in: versionIds } },
          select: { id: true },
        }),
        this.prisma.step_drafts.findFirst({
          where: { form_version_id: { in: versionIds } },
          select: { id: true },
        }),
        this.prisma.step_submission_versions.findFirst({
          where: { form_version_id: { in: versionIds } },
          select: { id: true },
        }),
      ]);

      if (usedByStep || usedByDraft || usedBySubmission) {
        throw new ConflictException(
          'Cannot delete form: one or more versions are still referenced by workflow steps or application data',
        );
      }
    }

    // Delete versions first, then the form
    await this.prisma.form_versions.deleteMany({
      where: { form_id: formId },
    });
    await this.prisma.forms.delete({
      where: { id: formId },
    });
  }

  /**
   * Delete one immutable published version if unused
   */
  async deleteVersion(
    eventId: string,
    formId: string,
    versionId: string,
  ): Promise<void> {
    await this.findById(eventId, formId); // Verify form exists and is scoped

    const version = await this.prisma.form_versions.findFirst({
      where: { id: versionId, form_id: formId },
      select: { id: true },
    });
    if (!version) throw new NotFoundException('Form version not found');

    const [usedByStep, usedByDraft, usedBySubmission] = await Promise.all([
      this.prisma.workflow_steps.findFirst({
        where: { form_version_id: versionId },
        select: { id: true },
      }),
      this.prisma.step_drafts.findFirst({
        where: { form_version_id: versionId },
        select: { id: true },
      }),
      this.prisma.step_submission_versions.findFirst({
        where: { form_version_id: versionId },
        select: { id: true },
      }),
    ]);

    if (usedByStep || usedByDraft || usedBySubmission) {
      const blockers: string[] = [];
      if (usedByStep) blockers.push('workflow steps');
      if (usedByDraft) blockers.push('application drafts');
      if (usedBySubmission) blockers.push('submitted applications');
      throw new ConflictException(
        `Cannot delete form version: it is used by ${blockers.join(', ')}`,
      );
    }

    await this.prisma.form_versions.delete({
      where: { id: versionId },
    });
  }

  /**
   * Create new form (draft state)
   */
  async create(eventId: string, dto: CreateFormDto): Promise<FormResponse> {
    // Verify event exists
    const event = await this.prisma.events.findFirst({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    const form = await this.prisma.forms.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        name: dto.name,
        draft_schema: { sections: [] },
        draft_ui: {},
      },
    });

    return {
      id: form.id,
      eventId: form.event_id,
      name: form.name,
      draftSchema: form.draft_schema,
      draftUi: form.draft_ui,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
    };
  }

  /**
   * Update form draft (schema and UI editable until published)
   */
  async updateDraft(
    eventId: string,
    formId: string,
    dto: UpdateFormDraftDto,
  ): Promise<FormResponse> {
    await this.findById(eventId, formId); // Verify exists

    const data: any = { updated_at: new Date() };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.draftSchema !== undefined) {
      // Validate schema structure (Zod)
      // We allow partial updates? dto.draftSchema is usually the whole object.
      try {
        // If it's a draft, maybe allow loosely? but structure should be correct
        // Let's enforce structure but allow missing validations
        FormDefinitionSchema.parse(dto.draftSchema);
      } catch (error: any) {
        // Wrap Zod error
        throw new BadRequestException(
          `Invalid form schema: ${error.message || error}`,
        );
      }
      data.draft_schema = dto.draftSchema;
    }
    if (dto.draftUi !== undefined) data.draft_ui = dto.draftUi;

    const form = await this.prisma.forms.update({
      where: { id: formId },
      data,
    });

    return {
      id: form.id,
      eventId: form.event_id,
      name: form.name,
      draftSchema: form.draft_schema,
      draftUi: form.draft_ui,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
    };
  }

  /**
   * Publish form → creates immutable FormVersion
   */
  async publish(eventId: string, formId: string): Promise<FormVersionResponse> {
    const form = await this.findById(eventId, formId);
    const actorId = this.cls.get('actorId');
    const normalizedSchema = normalizeFormDefinition(form.draftSchema);
    const fieldCount = getFormFields(normalizedSchema).filter(
      (field) => field.type !== FieldType.INFO_TEXT,
    ).length;

    if (fieldCount === 0) {
      throw new BadRequestException(
        'Cannot publish a form with no input fields. Add at least one non-info field.',
      );
    }

    // Get next version number
    const lastVersion = await this.prisma.form_versions.findFirst({
      where: { form_id: formId },
      orderBy: { version_number: 'desc' },
    });
    const nextVersion = (lastVersion?.version_number || 0) + 1;

    const version = await this.prisma.form_versions.create({
      data: {
        id: crypto.randomUUID(),
        form_id: formId,
        version_number: nextVersion,
        schema: normalizedSchema,
        ui: form.draftUi,
        published_by: actorId,
      },
    });

    return {
      id: version.id,
      formId: version.form_id,
      versionNumber: version.version_number,
      schema: version.schema,
      ui: version.ui,
      publishedBy: version.published_by,
      publishedAt: version.published_at,
    };
  }

  /**
   * List versions for a form
   */
  async listVersions(
    eventId: string,
    formId: string,
  ): Promise<FormVersionResponse[]> {
    await this.findById(eventId, formId); // Verify form exists and is scoped

    const versions = await this.prisma.form_versions.findMany({
      where: { form_id: formId },
      orderBy: { version_number: 'desc' },
    });

    return versions.map((v) => ({
      id: v.id,
      formId: v.form_id,
      versionNumber: v.version_number,
      schema: v.schema,
      ui: v.ui,
      publishedBy: v.published_by,
      publishedAt: v.published_at,
    }));
  }

  /**
   * Get specific version
   */
  async getVersion(
    eventId: string,
    formId: string,
    versionId: string,
  ): Promise<FormVersionResponse> {
    await this.findById(eventId, formId); // Verify form exists and is scoped

    const version = await this.prisma.form_versions.findFirst({
      where: { id: versionId, form_id: formId },
    });

    if (!version) throw new NotFoundException('Form version not found');

    return {
      id: version.id,
      formId: version.form_id,
      versionNumber: version.version_number,
      schema: version.schema,
      ui: version.ui,
      publishedBy: version.published_by,
      publishedAt: version.published_at,
    };
  }

  /**
   * Required file refs (canonical field key + fileObjectId) for the given
   * answers: every file in a required `file_upload` field. Pass the
   * EFFECTIVE answers (snapshot + active staff patches) — see
   * FilesService.getEffectiveAnswersForVersion. The input is normalized
   * defensively; a legacy answer stored under the field id is read too.
   */
  async getRequiredFileRefsForAnswers(
    formVersionId: string,
    answers: Record<string, unknown>,
  ): Promise<RequiredFileRef[]> {
    return (await this.getRequiredFileGate(formVersionId, answers)).refs;
  }

  /**
   * Approve-gate inputs: the required file refs of the effective answers plus
   * the required file fields that staff patches emptied (files in the
   * submitted snapshot, none in the effective answers). Pass the normalized
   * submitted snapshot as `originalAnswers` to detect removals.
   */
  async getRequiredFileGate(
    formVersionId: string,
    effectiveAnswers: Record<string, unknown>,
    originalAnswers?: Record<string, unknown>,
  ): Promise<RequiredFileGate> {
    const version = await this.prisma.form_versions.findUnique({
      where: { id: formVersionId },
    });
    if (!version) return { refs: [], removedFields: [] };

    return resolveRequiredFileGate(
      version.schema as FormDefinition | undefined,
      effectiveAnswers,
      originalAnswers,
    );
  }

  async getRequiredFileFields(
    formVersionId: string,
  ): Promise<Array<{ key: string; label: string }>> {
    const version = await this.prisma.form_versions.findUnique({
      where: { id: formVersionId },
    });
    if (!version) return [];

    const requiredFields: Array<{ key: string; label: string }> = [];

    const allFields = getFormFields(
      version.schema as FormDefinition | undefined,
    );
    for (const field of allFields) {
      if (field.type === 'file_upload' && field.validation?.required) {
        const fieldKey = field.key || field.id;
        requiredFields.push({ key: fieldKey, label: field.label });
      }
    }
    return requiredFields;
  }
}
