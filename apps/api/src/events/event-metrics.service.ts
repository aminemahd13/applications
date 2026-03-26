import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type application_step_states } from '@prisma/client';
import { FieldType, getFormFields } from '@event-platform/schemas';
import {
  DecisionStatus,
  type EventMetricsFieldsResponse,
  type EventMetricsQueryDto,
  type EventMetricsQueryResponse,
  MetricsFieldType,
  MetricsFilterOperator,
  type MetricsResponseFilter,
  type RecipientFilter,
  StepStatus,
} from '@event-platform/shared';
import { PrismaService } from '../common/prisma/prisma.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TOP_COUNTRIES = 10;
const DEFAULT_TOP_CITIES = 10;
const SUBMISSION_STATUSES = new Set<string>([
  StepStatus.SUBMITTED,
  StepStatus.NEEDS_REVISION,
  StepStatus.APPROVED,
  StepStatus.REJECTED_FINAL,
]);

type MetricsApplicationStepState = Pick<
  application_step_states,
  'step_id' | 'status' | 'latest_submission_version_id'
> & {
  workflow_steps: {
    title: string;
    step_index: number;
  } | null;
};

type MetricsApplicationRow = {
  id: string;
  decision_status: string;
  decision_published_at: Date | null;
  created_at: Date;
  tags: string[];
  attendance_records: {
    status: string;
    confirmed_at: Date | null;
    checked_in_at: Date | null;
  } | null;
  users_applications_applicant_user_idTousers: {
    applicant_profiles: {
      country: string | null;
      city: string | null;
      education_level: string | null;
      date_of_birth: Date | null;
    } | null;
  } | null;
  application_step_states: MetricsApplicationStepState[];
};

type MetricsFieldCatalogEntry = {
  stepId: string;
  stepTitle: string;
  stepIndex: number;
  fieldKey: string;
  fieldLabel: string;
  fieldType: MetricsFieldType;
  operators: MetricsFilterOperator[];
  chartable: boolean;
  options?: Array<{ value: string; label: string }>;
};

type TimelineBucket = {
  start: Date;
  end: Date;
  applicationsStarted: number;
  submissions: number;
  decisionsPublished: number;
  checkedIn: number;
};

@Injectable()
export class EventMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFields(eventId: string): Promise<EventMetricsFieldsResponse> {
    await this.ensureEventExists(eventId);
    const { steps } = await this.getStepFieldCatalog(eventId);
    return { steps };
  }

  async query(
    eventId: string,
    dto: EventMetricsQueryDto,
  ): Promise<EventMetricsQueryResponse> {
    await this.ensureEventExists(eventId);
    const { fieldsByStepAndKey, stepsById, orderedSteps } =
      await this.getStepFieldCatalog(eventId);

    const recipientFilter = this.sanitizeRecipientFilter(dto.recipientFilter);
    const where = this.buildBaseWhere(eventId, recipientFilter);

    const applications = (await this.prisma.applications.findMany({
      where,
      select: {
        id: true,
        decision_status: true,
        decision_published_at: true,
        created_at: true,
        tags: true,
        attendance_records: {
          select: {
            status: true,
            confirmed_at: true,
            checked_in_at: true,
          },
        },
        users_applications_applicant_user_idTousers: {
          select: {
            applicant_profiles: {
              select: {
                country: true,
                city: true,
                education_level: true,
                date_of_birth: true,
              },
            },
          },
        },
        application_step_states: {
          select: {
            step_id: true,
            status: true,
            latest_submission_version_id: true,
            workflow_steps: {
              select: {
                title: true,
                step_index: true,
              },
            },
          },
        },
      },
    })) as MetricsApplicationRow[];

    const stepIdsNeedingResponses = new Set<string>(
      dto.responseFilters.map((filter) => filter.stepId),
    );
    if (dto.breakdownField) {
      stepIdsNeedingResponses.add(dto.breakdownField.stepId);
    }

    const submissionVersionIds = this.collectSubmissionVersionIds(
      applications,
      stepIdsNeedingResponses,
    );
    const effectiveAnswersByVersionId =
      await this.getEffectiveAnswersBySubmissionVersionIds(submissionVersionIds);

    const matchedApplications = this.applyResponseFilters(
      applications,
      dto.responseFilters,
      fieldsByStepAndKey,
      effectiveAnswersByVersionId,
    );

    const totals = this.buildTotals(matchedApplications);
    const decisionBreakdown = this.buildDecisionBreakdown(matchedApplications);
    const currentStepBreakdown = this.buildCurrentStepBreakdown(
      matchedApplications,
      stepsById,
    );
    const stepFunnel = this.buildStepFunnel(matchedApplications, orderedSteps);
    const geo = this.buildGeoDistributions(matchedApplications);
    const ageBuckets = this.buildAgeBuckets(matchedApplications, new Date());
    const fieldBreakdown = this.buildFieldBreakdown(
      matchedApplications,
      dto.breakdownField,
      fieldsByStepAndKey,
      stepsById,
      effectiveAnswersByVersionId,
    );
    const timeline = await this.buildTimeline(
      matchedApplications,
      dto.timeline.periods,
    );

    return {
      totals,
      decisionBreakdown,
      currentStepBreakdown,
      stepFunnel,
      geo,
      ageBuckets,
      fieldBreakdown,
      timeline,
    };
  }

  private async ensureEventExists(eventId: string): Promise<void> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
  }

  private async getStepFieldCatalog(eventId: string): Promise<{
    steps: EventMetricsFieldsResponse['steps'];
    fieldsByStepAndKey: Map<string, MetricsFieldCatalogEntry>;
    stepsById: Map<string, { title: string; stepIndex: number }>;
    orderedSteps: Array<{ id: string; title: string; stepIndex: number }>;
  }> {
    const workflowSteps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
      select: {
        id: true,
        title: true,
        step_index: true,
        form_versions: {
          select: {
            schema: true,
          },
        },
      },
    });

    const stepsById = new Map<string, { title: string; stepIndex: number }>();
    const fieldsByStepAndKey = new Map<string, MetricsFieldCatalogEntry>();

    const steps: EventMetricsFieldsResponse['steps'] = workflowSteps.map(
      (step) => {
        stepsById.set(step.id, {
          title: step.title,
          stepIndex: step.step_index,
        });

        const rawFields = step.form_versions?.schema
          ? getFormFields(step.form_versions.schema)
          : [];

        const fields = rawFields
          .map((field) => {
            const mappedFieldType = this.mapFormFieldType(field.type);
            if (!mappedFieldType) return null;

            const operators = this.operatorsForFieldType(mappedFieldType);
            const chartable = this.isChartableFieldType(mappedFieldType);
            const options = Array.isArray(field.ui?.options)
              ? field.ui?.options
                  .map((option) => ({
                    value: String(option.value),
                    label: String(option.label),
                  }))
                  .filter(
                    (option) =>
                      option.value.trim().length > 0 &&
                      option.label.trim().length > 0,
                  )
              : undefined;

            const entry: MetricsFieldCatalogEntry = {
              stepId: step.id,
              stepTitle: step.title,
              stepIndex: step.step_index,
              fieldKey: field.key,
              fieldLabel: field.label || field.key,
              fieldType: mappedFieldType,
              operators,
              chartable,
              ...(options && options.length > 0 ? { options } : {}),
            };
            fieldsByStepAndKey.set(
              this.composeStepFieldKey(step.id, field.key),
              entry,
            );

            return {
              stepId: entry.stepId,
              stepTitle: entry.stepTitle,
              stepIndex: entry.stepIndex,
              fieldKey: entry.fieldKey,
              fieldLabel: entry.fieldLabel,
              fieldType: entry.fieldType,
              operators: entry.operators,
              chartable: entry.chartable,
              ...(entry.options ? { options: entry.options } : {}),
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null);

        return {
          stepId: step.id,
          stepTitle: step.title,
          stepIndex: step.step_index,
          fields,
        };
      },
    );

    return {
      steps,
      fieldsByStepAndKey,
      stepsById,
      orderedSteps: workflowSteps.map((step) => ({
        id: step.id,
        title: step.title,
        stepIndex: step.step_index,
      })),
    };
  }

  private mapFormFieldType(formFieldType: FieldType): MetricsFieldType | null {
    switch (formFieldType) {
      case FieldType.TEXT:
        return MetricsFieldType.TEXT;
      case FieldType.TEXTAREA:
        return MetricsFieldType.TEXTAREA;
      case FieldType.NUMBER:
        return MetricsFieldType.NUMBER;
      case FieldType.EMAIL:
        return MetricsFieldType.EMAIL;
      case FieldType.PHONE:
        return MetricsFieldType.PHONE;
      case FieldType.DATE:
        return MetricsFieldType.DATE;
      case FieldType.SELECT:
        return MetricsFieldType.SELECT;
      case FieldType.MULTISELECT:
        return MetricsFieldType.MULTISELECT;
      case FieldType.CHECKBOX:
        return MetricsFieldType.CHECKBOX;
      default:
        return null;
    }
  }

  private operatorsForFieldType(
    fieldType: MetricsFieldType,
  ): MetricsFilterOperator[] {
    switch (fieldType) {
      case MetricsFieldType.MULTISELECT:
        return [MetricsFilterOperator.IN];
      case MetricsFieldType.NUMBER:
      case MetricsFieldType.DATE:
        return [MetricsFilterOperator.EQ, MetricsFilterOperator.RANGE];
      case MetricsFieldType.SELECT:
        return [MetricsFilterOperator.EQ, MetricsFilterOperator.IN];
      case MetricsFieldType.TEXT:
      case MetricsFieldType.TEXTAREA:
      case MetricsFieldType.EMAIL:
      case MetricsFieldType.PHONE:
      case MetricsFieldType.CHECKBOX:
      default:
        return [MetricsFilterOperator.EQ];
    }
  }

  private isChartableFieldType(fieldType: MetricsFieldType): boolean {
    return (
      fieldType === MetricsFieldType.SELECT ||
      fieldType === MetricsFieldType.MULTISELECT ||
      fieldType === MetricsFieldType.CHECKBOX
    );
  }

  private sanitizeRecipientFilter(filter?: RecipientFilter): RecipientFilter {
    if (!filter) return {};
    return {
      ...(Array.isArray(filter.decisionStatus) &&
      filter.decisionStatus.length > 0
        ? { decisionStatus: filter.decisionStatus }
        : {}),
      ...(typeof filter.stepId === 'string' ? { stepId: filter.stepId } : {}),
      ...(Array.isArray(filter.stepStatus) && filter.stepStatus.length > 0
        ? { stepStatus: filter.stepStatus }
        : {}),
      ...(typeof filter.currentStepId === 'string'
        ? { currentStepId: filter.currentStepId }
        : {}),
      ...(typeof filter.needsInfoOpen === 'boolean'
        ? { needsInfoOpen: filter.needsInfoOpen }
        : {}),
      ...(typeof filter.confirmed === 'boolean'
        ? { confirmed: filter.confirmed }
        : {}),
      ...(typeof filter.checkedIn === 'boolean'
        ? { checkedIn: filter.checkedIn }
        : {}),
      ...(Array.isArray(filter.tagsAny) && filter.tagsAny.length > 0
        ? { tagsAny: filter.tagsAny }
        : {}),
      ...(Array.isArray(filter.tagsAll) && filter.tagsAll.length > 0
        ? { tagsAll: filter.tagsAll }
        : {}),
      ...(typeof filter.ageMin === 'number' ? { ageMin: filter.ageMin } : {}),
      ...(typeof filter.ageMax === 'number' ? { ageMax: filter.ageMax } : {}),
      ...(Array.isArray(filter.country) && filter.country.length > 0
        ? { country: filter.country }
        : {}),
      ...(Array.isArray(filter.city) && filter.city.length > 0
        ? { city: filter.city }
        : {}),
      ...(Array.isArray(filter.educationLevel) &&
      filter.educationLevel.length > 0
        ? { educationLevel: filter.educationLevel }
        : {}),
    };
  }

  private buildBaseWhere(
    eventId: string,
    filter: RecipientFilter,
  ): Prisma.applicationsWhereInput {
    const andConditions: Prisma.applicationsWhereInput[] = [];

    if (filter.decisionStatus?.length) {
      andConditions.push({ decision_status: { in: filter.decisionStatus } });
    }

    if (filter.tagsAny?.length) {
      andConditions.push({ tags: { hasSome: filter.tagsAny } });
    }
    if (filter.tagsAll?.length) {
      andConditions.push({ tags: { hasEvery: filter.tagsAll } });
    }

    if (filter.needsInfoOpen) {
      andConditions.push({ needs_info_requests: { some: { status: 'OPEN' } } });
    }

    if (filter.stepId && filter.stepStatus?.length) {
      andConditions.push({
        application_step_states: {
          some: {
            step_id: filter.stepId,
            status: { in: filter.stepStatus },
          },
        },
      });
    }

    if (filter.currentStepId) {
      andConditions.push({
        application_step_states: {
          some: {
            step_id: filter.currentStepId,
            status: { notIn: [StepStatus.APPROVED, StepStatus.REJECTED_FINAL] },
          },
        },
      });
    }

    if (filter.confirmed !== undefined) {
      if (filter.confirmed) {
        andConditions.push({
          OR: [
            { attendance_records: { is: { status: 'CONFIRMED' } } },
            { attendance_records: { is: { status: 'CHECKED_IN' } } },
          ],
        });
      } else {
        andConditions.push({
          OR: [
            { attendance_records: { is: null } },
            {
              attendance_records: {
                is: { status: { notIn: ['CONFIRMED', 'CHECKED_IN'] } },
              },
            },
          ],
        });
      }
    }

    if (filter.checkedIn !== undefined) {
      if (filter.checkedIn) {
        andConditions.push({
          attendance_records: { is: { status: 'CHECKED_IN' } },
        });
      } else {
        andConditions.push({
          OR: [
            { attendance_records: { is: null } },
            { attendance_records: { is: { status: { not: 'CHECKED_IN' } } } },
          ],
        });
      }
    }

    if (filter.country?.length) {
      andConditions.push({
        users_applications_applicant_user_idTousers: {
          is: {
            applicant_profiles: {
              is: { country: { in: filter.country } },
            },
          },
        },
      });
    }

    if (filter.city?.length) {
      andConditions.push({
        users_applications_applicant_user_idTousers: {
          is: {
            applicant_profiles: {
              is: {
                city: {
                  in: filter.city,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      });
    }

    if (filter.educationLevel?.length) {
      andConditions.push({
        users_applications_applicant_user_idTousers: {
          is: {
            applicant_profiles: {
              is: { education_level: { in: filter.educationLevel } },
            },
          },
        },
      });
    }

    if (filter.ageMin !== undefined || filter.ageMax !== undefined) {
      const dateOfBirthRange = this.buildDateOfBirthRange(
        filter.ageMin,
        filter.ageMax,
      );
      andConditions.push({
        users_applications_applicant_user_idTousers: {
          is: {
            applicant_profiles: {
              is: { date_of_birth: dateOfBirthRange },
            },
          },
        },
      });
    }

    const where: Prisma.applicationsWhereInput = { event_id: eventId };
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }
    return where;
  }

  private buildDateOfBirthRange(
    ageMin?: number,
    ageMax?: number,
  ): { gte?: Date; lte?: Date } {
    const range: { gte?: Date; lte?: Date } = {};
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    if (ageMax !== undefined) {
      range.gte = new Date(Date.UTC(year - ageMax - 1, month, day + 1));
    }
    if (ageMin !== undefined) {
      range.lte = new Date(Date.UTC(year - ageMin, month, day));
    }
    return range;
  }

  private collectSubmissionVersionIds(
    applications: MetricsApplicationRow[],
    stepIds: Set<string>,
  ): string[] {
    if (stepIds.size === 0) return [];
    const ids = new Set<string>();
    for (const app of applications) {
      for (const stepState of app.application_step_states ?? []) {
        if (!stepIds.has(stepState.step_id)) continue;
        if (stepState.latest_submission_version_id) {
          ids.add(stepState.latest_submission_version_id);
        }
      }
    }
    return Array.from(ids);
  }

  private async getEffectiveAnswersBySubmissionVersionIds(
    submissionVersionIds: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    if (submissionVersionIds.length === 0) {
      return new Map();
    }

    const [submissions, patches] = await Promise.all([
      this.prisma.step_submission_versions.findMany({
        where: { id: { in: submissionVersionIds } },
        select: {
          id: true,
          answers_snapshot: true,
        },
      }),
      this.prisma.admin_change_patches.findMany({
        where: {
          submission_version_id: { in: submissionVersionIds },
          is_active: true,
        },
        select: {
          submission_version_id: true,
          ops: true,
        },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    const patchesByVersionId = new Map<string, Array<{ ops: unknown }>>();
    for (const patch of patches) {
      const list = patchesByVersionId.get(patch.submission_version_id) ?? [];
      list.push({ ops: patch.ops });
      patchesByVersionId.set(patch.submission_version_id, list);
    }

    const effectiveByVersionId = new Map<string, Record<string, unknown>>();
    for (const submission of submissions) {
      const baseAnswers = this.normalizeAnswersShape(
        submission.answers_snapshot as Record<string, unknown>,
      );
      const effective = { ...baseAnswers };
      for (const patch of patchesByVersionId.get(submission.id) ?? []) {
        const ops = Array.isArray(patch.ops) ? patch.ops : [];
        for (const op of ops) {
          if (!op || typeof op !== 'object' || Array.isArray(op)) continue;
          const operation = op as Record<string, unknown>;
          if (operation.op !== 'replace' || typeof operation.path !== 'string') {
            continue;
          }
          const fieldPath = operation.path.replace(/^\//, '');
          if (!fieldPath) continue;
          effective[fieldPath] = operation.value;
        }
      }
      effectiveByVersionId.set(submission.id, this.normalizeAnswersShape(effective));
    }

    return effectiveByVersionId;
  }

  private normalizeAnswersShape(
    answers: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return {};
    }
    const normalized: Record<string, unknown> = { ...answers };
    if (
      normalized.data &&
      typeof normalized.data === 'object' &&
      !Array.isArray(normalized.data)
    ) {
      Object.assign(normalized, normalized.data as Record<string, unknown>);
    }
    if ('data' in normalized && Object.keys(normalized).some((key) => key !== 'data')) {
      delete normalized.data;
    }
    return normalized;
  }

  private applyResponseFilters(
    applications: MetricsApplicationRow[],
    responseFilters: MetricsResponseFilter[],
    fieldsByStepAndKey: Map<string, MetricsFieldCatalogEntry>,
    effectiveAnswersByVersionId: Map<string, Record<string, unknown>>,
  ): MetricsApplicationRow[] {
    if (responseFilters.length === 0) return applications;

    return applications.filter((application) =>
      responseFilters.every((filter) =>
        this.matchesResponseFilter(
          application,
          filter,
          fieldsByStepAndKey,
          effectiveAnswersByVersionId,
        ),
      ),
    );
  }

  private matchesResponseFilter(
    application: MetricsApplicationRow,
    filter: MetricsResponseFilter,
    fieldsByStepAndKey: Map<string, MetricsFieldCatalogEntry>,
    effectiveAnswersByVersionId: Map<string, Record<string, unknown>>,
  ): boolean {
    const field = fieldsByStepAndKey.get(
      this.composeStepFieldKey(filter.stepId, filter.fieldKey),
    );
    if (!field) return false;

    const stepState = application.application_step_states.find(
      (state) => state.step_id === filter.stepId,
    );
    if (!stepState?.latest_submission_version_id) return false;

    const answers = effectiveAnswersByVersionId.get(
      stepState.latest_submission_version_id,
    );
    if (!answers) return false;

    const answerValue = this.readAnswerValue(answers, filter.fieldKey);
    return this.evaluateAnswerFilter(answerValue, filter, field.fieldType);
  }

  private readAnswerValue(
    answers: Record<string, unknown>,
    fieldKey: string,
  ): unknown {
    if (!fieldKey.includes('.')) return answers[fieldKey];
    const parts = fieldKey.split('.').filter((part) => part.length > 0);
    let current: unknown = answers;
    for (const part of parts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private evaluateAnswerFilter(
    answerValue: unknown,
    filter: MetricsResponseFilter,
    fieldType: MetricsFieldType,
  ): boolean {
    switch (filter.operator) {
      case MetricsFilterOperator.EQ:
        return this.valueEquals(fieldType, answerValue, filter.value);
      case MetricsFilterOperator.IN:
        return this.valueIn(fieldType, answerValue, filter.values ?? []);
      case MetricsFilterOperator.RANGE:
        return this.valueInRange(
          fieldType,
          answerValue,
          filter.min,
          filter.max,
        );
      default:
        return false;
    }
  }

  private valueEquals(
    fieldType: MetricsFieldType,
    left: unknown,
    right: unknown,
  ): boolean {
    if (left === undefined || right === undefined) return false;

    if (fieldType === MetricsFieldType.MULTISELECT) {
      const leftValues = this.toStringArray(left);
      if (leftValues.length === 0) return false;
      const rightValue = this.toNormalizedString(right);
      if (rightValue === null) return false;
      return leftValues.includes(rightValue);
    }

    if (fieldType === MetricsFieldType.CHECKBOX) {
      const leftBool = this.toBoolean(left);
      const rightBool = this.toBoolean(right);
      return leftBool !== null && rightBool !== null && leftBool === rightBool;
    }

    if (fieldType === MetricsFieldType.NUMBER) {
      const leftNumber = this.toNumber(left);
      const rightNumber = this.toNumber(right);
      return (
        leftNumber !== null &&
        rightNumber !== null &&
        leftNumber === rightNumber
      );
    }

    if (fieldType === MetricsFieldType.DATE) {
      const leftDate = this.toDateKey(left);
      const rightDate = this.toDateKey(right);
      return leftDate !== null && rightDate !== null && leftDate === rightDate;
    }

    const leftText = this.toNormalizedString(left);
    const rightText = this.toNormalizedString(right);
    return leftText !== null && rightText !== null && leftText === rightText;
  }

  private valueIn(
    fieldType: MetricsFieldType,
    answerValue: unknown,
    candidates: unknown[],
  ): boolean {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return false;
    }
    if (Array.isArray(answerValue)) {
      const answerValues =
        fieldType === MetricsFieldType.NUMBER
          ? answerValue
              .map((value) => this.toNumber(value))
              .filter((value): value is number => value !== null)
          : answerValue
              .map((value) => this.toNormalizedString(value))
              .filter((value): value is string => value !== null);
      if (answerValues.length === 0) return false;

      if (fieldType === MetricsFieldType.NUMBER) {
        const candidateNumbers = candidates
          .map((value) => this.toNumber(value))
          .filter((value): value is number => value !== null);
        return answerValues.some((value) => candidateNumbers.includes(value));
      }

      const candidateValues = candidates
        .map((value) => this.toNormalizedString(value))
        .filter((value): value is string => value !== null);
      return answerValues.some((value) => candidateValues.includes(value));
    }

    return candidates.some((candidate) =>
      this.valueEquals(fieldType, answerValue, candidate),
    );
  }

  private valueInRange(
    fieldType: MetricsFieldType,
    answerValue: unknown,
    min: unknown,
    max: unknown,
  ): boolean {
    if (fieldType === MetricsFieldType.DATE) {
      const answerTimestamp = this.toTimestamp(answerValue);
      if (answerTimestamp === null) return false;
      const minTimestamp =
        min === undefined ? null : this.toTimestamp(min, 'start');
      const maxTimestamp = max === undefined ? null : this.toTimestamp(max, 'end');
      if (minTimestamp !== null && answerTimestamp < minTimestamp) return false;
      if (maxTimestamp !== null && answerTimestamp > maxTimestamp) return false;
      return true;
    }

    const answerNumber = this.toNumber(answerValue);
    if (answerNumber === null) return false;

    const minNumber = min === undefined ? null : this.toNumber(min);
    const maxNumber = max === undefined ? null : this.toNumber(max);
    if (minNumber !== null && answerNumber < minNumber) return false;
    if (maxNumber !== null && answerNumber > maxNumber) return false;
    return true;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private toBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    return null;
  }

  private toTimestamp(
    value: unknown,
    boundary: 'start' | 'end' = 'start',
  ): number | null {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch;
      const year = Number(y);
      const month = Number(m);
      const day = Number(d);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
      }
      if (boundary === 'start') {
        return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
      }
      return Date.UTC(year, month - 1, day, 23, 59, 59, 999);
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getTime();
  }

  private toDateKey(value: unknown): string | null {
    const timestamp = this.toTimestamp(value);
    if (timestamp === null) return null;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  private toNormalizedString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized.length > 0 ? normalized : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim().toLowerCase();
    }
    return null;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => this.toNormalizedString(entry))
      .filter((entry): entry is string => entry !== null);
  }

  private buildTotals(applications: MetricsApplicationRow[]) {
    const accepted = applications.filter(
      (app) => app.decision_status === DecisionStatus.ACCEPTED,
    ).length;
    const waitlisted = applications.filter(
      (app) => app.decision_status === DecisionStatus.WAITLISTED,
    ).length;
    const rejected = applications.filter(
      (app) => app.decision_status === DecisionStatus.REJECTED,
    ).length;

    const submitted = applications.filter((app) =>
      app.application_step_states.some((stepState) =>
        SUBMISSION_STATUSES.has(stepState.status),
      ),
    ).length;
    const inReview = applications.filter((app) =>
      app.application_step_states.some(
        (stepState) => stepState.status === StepStatus.SUBMITTED,
      ),
    ).length;

    const confirmed = applications.filter((app) =>
      ['CONFIRMED', 'CHECKED_IN'].includes(
        app.attendance_records?.status ?? 'NONE',
      ),
    ).length;
    const checkedIn = applications.filter(
      (app) => app.attendance_records?.status === 'CHECKED_IN',
    ).length;

    return {
      matchedApplications: applications.length,
      submitted,
      inReview,
      accepted,
      waitlisted,
      rejected,
      confirmed,
      checkedIn,
    };
  }

  private buildDecisionBreakdown(applications: MetricsApplicationRow[]) {
    const labels: Array<{ key: string; label: string }> = [
      { key: DecisionStatus.NONE, label: 'No decision' },
      { key: DecisionStatus.ACCEPTED, label: 'Accepted' },
      { key: DecisionStatus.WAITLISTED, label: 'Waitlisted' },
      { key: DecisionStatus.REJECTED, label: 'Rejected' },
    ];

    return labels.map(({ key, label }) => ({
      key,
      label,
      count: applications.filter((app) => app.decision_status === key).length,
    }));
  }

  private buildCurrentStepBreakdown(
    applications: MetricsApplicationRow[],
    stepsById: Map<string, { title: string; stepIndex: number }>,
  ) {
    const counts = new Map<string, number>();

    for (const app of applications) {
      const stepStates = [...app.application_step_states].sort(
        (a, b) =>
          (a.workflow_steps?.step_index ?? Number.MAX_SAFE_INTEGER) -
          (b.workflow_steps?.step_index ?? Number.MAX_SAFE_INTEGER),
      );
      const blocking = stepStates.find(
        (stepState) => stepState.status !== StepStatus.APPROVED,
      );

      const bucketKey = blocking?.step_id ?? '__completed__';
      counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
    }

    const response = Array.from(counts.entries()).map(([key, count]) => {
      if (key === '__completed__') {
        return {
          stepId: null,
          stepTitle: 'Completed',
          stepIndex: null,
          count,
        };
      }

      const meta = stepsById.get(key);
      return {
        stepId: key,
        stepTitle: meta?.title ?? 'Unknown step',
        stepIndex: meta?.stepIndex ?? null,
        count,
      };
    });

    return response.sort((a, b) => {
      if (a.stepIndex === null && b.stepIndex === null) return 0;
      if (a.stepIndex === null) return 1;
      if (b.stepIndex === null) return -1;
      return a.stepIndex - b.stepIndex;
    });
  }

  private buildStepFunnel(
    applications: MetricsApplicationRow[],
    orderedSteps: Array<{ id: string; title: string; stepIndex: number }>,
  ) {
    return orderedSteps.map((step) => {
      let total = 0;
      let submitted = 0;
      let approved = 0;
      let rejected = 0;

      for (const app of applications) {
        const stepState = app.application_step_states.find(
          (state) => state.step_id === step.id,
        );
        if (!stepState) continue;

        if (stepState.status !== StepStatus.LOCKED) {
          total += 1;
        }
        if (SUBMISSION_STATUSES.has(stepState.status)) {
          submitted += 1;
        }
        if (stepState.status === StepStatus.APPROVED) {
          approved += 1;
        }
        if (stepState.status === StepStatus.REJECTED_FINAL) {
          rejected += 1;
        }
      }

      return {
        stepId: step.id,
        stepTitle: step.title,
        stepIndex: step.stepIndex,
        total,
        submitted,
        approved,
        rejected,
      };
    });
  }

  private buildGeoDistributions(applications: MetricsApplicationRow[]) {
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<
      string,
      { city: string; country?: string; count: number }
    >();

    for (const app of applications) {
      const profile =
        app.users_applications_applicant_user_idTousers?.applicant_profiles;
      if (!profile) continue;

      const country = this.cleanString(profile.country);
      const city = this.cleanString(profile.city);

      if (country) {
        countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
      }

      if (city) {
        const cityKey = `${city.toLowerCase()}::${country?.toLowerCase() ?? ''}`;
        const current = cityCounts.get(cityKey);
        if (current) {
          current.count += 1;
        } else {
          cityCounts.set(cityKey, {
            city,
            ...(country ? { country } : {}),
            count: 1,
          });
        }
      }
    }

    const countries = Array.from(countryCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
      .slice(0, DEFAULT_TOP_COUNTRIES);

    const cities = Array.from(cityCounts.values())
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.city.localeCompare(b.city) ||
          (a.country ?? '').localeCompare(b.country ?? ''),
      )
      .slice(0, DEFAULT_TOP_CITIES);

    return { countries, cities };
  }

  private buildAgeBuckets(applications: MetricsApplicationRow[], now: Date) {
    const bucketDefs: Array<{
      key: string;
      label: string;
      min?: number;
      max?: number;
    }> = [
      { key: 'under_13', label: 'Under 13', max: 12 },
      { key: '13_17', label: '13-17', min: 13, max: 17 },
      { key: '18_24', label: '18-24', min: 18, max: 24 },
      { key: '25_34', label: '25-34', min: 25, max: 34 },
      { key: '35_44', label: '35-44', min: 35, max: 44 },
      { key: '45_plus', label: '45+', min: 45 },
    ];

    const counts = new Map<string, number>(
      bucketDefs.map((bucket) => [bucket.key, 0]),
    );

    for (const app of applications) {
      const dob =
        app.users_applications_applicant_user_idTousers?.applicant_profiles
          ?.date_of_birth;
      if (!dob) continue;

      const age = this.calculateAge(dob, now);
      if (age === null) continue;

      for (const bucket of bucketDefs) {
        const minOk = bucket.min === undefined || age >= bucket.min;
        const maxOk = bucket.max === undefined || age <= bucket.max;
        if (minOk && maxOk) {
          counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
          break;
        }
      }
    }

    return bucketDefs.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: counts.get(bucket.key) ?? 0,
    }));
  }

  private calculateAge(dateOfBirth: Date, now: Date): number | null {
    if (!(dateOfBirth instanceof Date) || Number.isNaN(dateOfBirth.getTime())) {
      return null;
    }
    let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();
    const dayDiff = now.getUTCDate() - dateOfBirth.getUTCDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  private buildFieldBreakdown(
    applications: MetricsApplicationRow[],
    breakdownField:
      | {
          stepId: string;
          fieldKey: string;
        }
      | undefined,
    fieldsByStepAndKey: Map<string, MetricsFieldCatalogEntry>,
    stepsById: Map<string, { title: string; stepIndex: number }>,
    effectiveAnswersByVersionId: Map<string, Record<string, unknown>>,
  ) {
    if (!breakdownField) return null;

    const field = fieldsByStepAndKey.get(
      this.composeStepFieldKey(breakdownField.stepId, breakdownField.fieldKey),
    );
    if (!field || !field.chartable) return null;

    const counts = new Map<string, number>();
    let otherCount = 0;
    const optionLabels = new Map(
      (field.options ?? []).map((option) => [option.value, option.label]),
    );

    for (const app of applications) {
      const stepState = app.application_step_states.find(
        (state) => state.step_id === breakdownField.stepId,
      );
      if (!stepState?.latest_submission_version_id) continue;
      const answers = effectiveAnswersByVersionId.get(
        stepState.latest_submission_version_id,
      );
      if (!answers) continue;

      const answerValue = this.readAnswerValue(answers, breakdownField.fieldKey);
      if (
        answerValue === undefined ||
        answerValue === null ||
        (typeof answerValue === 'string' && answerValue.trim().length === 0)
      ) {
        continue;
      }

      if (field.fieldType === MetricsFieldType.CHECKBOX) {
        const value = this.toBoolean(answerValue);
        if (value === null) {
          otherCount += 1;
          continue;
        }
        const key = value ? 'true' : 'false';
        counts.set(key, (counts.get(key) ?? 0) + 1);
        continue;
      }

      if (field.fieldType === MetricsFieldType.MULTISELECT) {
        const values = this.toStringArray(answerValue);
        if (values.length === 0) {
          otherCount += 1;
          continue;
        }
        for (const value of values) {
          const label = optionLabels.get(value) ?? value;
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        continue;
      }

      const normalized = this.toNormalizedString(answerValue);
      if (normalized === null) {
        otherCount += 1;
        continue;
      }
      const label = optionLabels.get(normalized) ?? normalized;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    const values = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const stepMeta = stepsById.get(breakdownField.stepId);

    return {
      stepId: breakdownField.stepId,
      stepTitle: stepMeta?.title ?? field.stepTitle,
      stepIndex: stepMeta?.stepIndex ?? field.stepIndex,
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
      values,
      otherCount,
    };
  }

  private async buildTimeline(
    applications: MetricsApplicationRow[],
    periods: number,
  ) {
    const timeline = this.createWeeklyTimeline(periods, new Date());
    if (applications.length === 0) {
      return timeline.map((bucket) => ({
        periodStart: bucket.start.toISOString(),
        periodEnd: bucket.end.toISOString(),
        applicationsStarted: bucket.applicationsStarted,
        submissions: bucket.submissions,
        decisionsPublished: bucket.decisionsPublished,
        checkedIn: bucket.checkedIn,
      }));
    }

    const appIds = applications.map((app) => app.id);
    const timelineStart = timeline[0].start;
    const timelineEnd = timeline[timeline.length - 1].end;

    const submissions = await this.prisma.step_submission_versions.findMany({
      where: {
        application_id: { in: appIds },
        submitted_at: {
          gte: timelineStart,
          lt: timelineEnd,
        },
      },
      select: {
        submitted_at: true,
      },
    });

    for (const app of applications) {
      this.incrementTimelineBucket(timeline, app.created_at, 'applicationsStarted');
      this.incrementTimelineBucket(
        timeline,
        app.decision_published_at,
        'decisionsPublished',
      );
      this.incrementTimelineBucket(
        timeline,
        app.attendance_records?.checked_in_at ?? null,
        'checkedIn',
      );
    }

    for (const submission of submissions) {
      this.incrementTimelineBucket(timeline, submission.submitted_at, 'submissions');
    }

    return timeline.map((bucket) => ({
      periodStart: bucket.start.toISOString(),
      periodEnd: bucket.end.toISOString(),
      applicationsStarted: bucket.applicationsStarted,
      submissions: bucket.submissions,
      decisionsPublished: bucket.decisionsPublished,
      checkedIn: bucket.checkedIn,
    }));
  }

  private createWeeklyTimeline(periods: number, now: Date): TimelineBucket[] {
    const safePeriods = Math.max(1, Math.min(periods, 52));
    const currentWeekStart = this.getWeekStartUtc(now);
    const firstStart = new Date(
      currentWeekStart.getTime() - (safePeriods - 1) * WEEK_MS,
    );

    const buckets: TimelineBucket[] = [];
    for (let i = 0; i < safePeriods; i += 1) {
      const start = new Date(firstStart.getTime() + i * WEEK_MS);
      const end = new Date(start.getTime() + WEEK_MS);
      buckets.push({
        start,
        end,
        applicationsStarted: 0,
        submissions: 0,
        decisionsPublished: 0,
        checkedIn: 0,
      });
    }
    return buckets;
  }

  private getWeekStartUtc(date: Date): Date {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    const day = normalized.getUTCDay();
    const offset = (day + 6) % 7; // Monday = 0
    normalized.setUTCDate(normalized.getUTCDate() - offset);
    return normalized;
  }

  private incrementTimelineBucket(
    timeline: TimelineBucket[],
    timestamp: Date | null,
    metric:
      | 'applicationsStarted'
      | 'submissions'
      | 'decisionsPublished'
      | 'checkedIn',
  ): void {
    if (!timestamp) return;
    const time = timestamp.getTime();
    for (const bucket of timeline) {
      if (time >= bucket.start.getTime() && time < bucket.end.getTime()) {
        bucket[metric] += 1;
        return;
      }
    }
  }

  private composeStepFieldKey(stepId: string, fieldKey: string): string {
    return `${stepId}:${fieldKey}`;
  }

  private cleanString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}

