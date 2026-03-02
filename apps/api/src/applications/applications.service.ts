import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@event-platform/db';
import {
  ApplicationFilterDto,
  ApplicationSummary,
  ApplicationDetail,
  ApplicantProfile,
  CompletionCredential,
  BulkApplicationTagsDto,
  BulkAssignReviewerDto,
  BulkDecisionDraftDto,
  BulkStepActionDto,
  CreateDecisionTemplateDto,
  DecisionStatus,
  DecisionTemplateResponse,
  EmailDeliveryStatus,
  MessageType,
  StepStatus,
  UpdateDecisionTemplateDto,
  PaginatedResponse,
} from '@event-platform/shared';
import { StepStateService } from './step-state.service';
import * as jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';

@Injectable()
export class ApplicationsService {
  private static readonly HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
  private static readonly DEFAULT_CERTIFICATE_TEMPLATE = {
    text: {
      title: 'Certificate of Completion',
      subtitle: 'This certifies that',
      completionText: 'has successfully completed',
      footerText: 'Verification available via the secure credential link below.',
    },
    style: {
      primaryColor: '#2563eb',
      secondaryColor: '#1d4ed8',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      borderColor: '#cbd5e1',
    },
  } as const;
  private static readonly REQUIRED_PROFILE_FIELDS = [
    { key: 'first_name', label: 'First name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'phone', label: 'Phone' },
    { key: 'education_level', label: 'Education level' },
    { key: 'institution', label: 'Institution' },
    { key: 'city', label: 'City' },
    { key: 'country', label: 'Country' },
    { key: 'date_of_birth', label: 'Date of birth' },
  ] as const;

  /** Compute display name from profile name fields */
  static getDisplayName(profile: any): string {
    const first = profile?.first_name?.trim?.() ?? '';
    const last = profile?.last_name?.trim?.() ?? '';
    return [first, last].filter(Boolean).join(' ') || profile?.full_name?.trim?.() || '';
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly stepStateService: StepStateService,
  ) {}

  /**
   * List applications for an event (admin/reviewer view)
   */
  async findAll(
    eventId: string,
    filter: ApplicationFilterDto,
  ): Promise<PaginatedResponse<ApplicationSummary>> {
    const {
      cursor,
      limit,
      order,
      decisionStatus,
      stepId,
      stepStatus,
      assignedReviewerId,
      tags,
      q,
    } = filter;

    const where: any = { event_id: eventId };

    if (cursor) where.id = { lt: cursor };
    if (decisionStatus) where.decision_status = decisionStatus;
    if (assignedReviewerId) where.assigned_reviewer_id = assignedReviewerId;
    if (tags && tags.length > 0) where.tags = { hasEvery: tags };

    if (q && q.trim().length > 0) {
      const query = q.trim();
      where.OR = [
        {
          users_applications_applicant_user_idTousers: {
            is: {
              email: { contains: query, mode: 'insensitive' },
            },
          },
        },
        {
          users_applications_applicant_user_idTousers: {
            is: {
              applicant_profiles: {
                is: {
                  first_name: { contains: query, mode: 'insensitive' },
                },
              },
            },
          },
        },
        {
          users_applications_applicant_user_idTousers: {
            is: {
              applicant_profiles: {
                is: {
                  last_name: { contains: query, mode: 'insensitive' },
                },
              },
            },
          },
        },
      ];
    }

    // Filter by step status requires a join
    if (stepId && stepStatus) {
      where.application_step_states = {
        some: {
          step_id: stepId,
          status: stepStatus,
        },
      };
    }

    const applications = await this.prisma.applications.findMany({
      where,
      orderBy: { updated_at: order },
      take: limit + 1,
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            id: true,
            email: true,
            applicant_profiles: {
              select: {
                full_name: true,
                first_name: true,
                last_name: true,
                phone: true,
                education_level: true,
                institution: true,
                city: true,
                country: true,
                links: true,
              },
            },
          },
        },
        application_step_states: {
          select: {
            status: true,
            workflow_steps: { select: { step_index: true } },
          },
        },
        attendance_records: {
          select: { status: true },
        },
      },
    });

    const hasMore = applications.length > limit;
    const data = hasMore ? applications.slice(0, -1) : applications;

    return {
      data: data.map((app) => this.toSummary(app)),
      meta: {
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  /**
   * Export all applications for an event as CSV with direct links.
   */
  async exportEventApplicationsCsv(
    eventId: string,
    applicationIds?: string[],
  ): Promise<{ filename: string; csv: string }> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true, title: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const where: Prisma.applicationsWhereInput = { event_id: eventId };
    if (applicationIds && applicationIds.length > 0) {
      where.id = { in: applicationIds };
    }

    const applications = await this.prisma.applications.findMany({
      where,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            id: true,
            email: true,
            applicant_profiles: {
              select: {
                full_name: true,
                first_name: true,
                last_name: true,
                phone: true,
                education_level: true,
                institution: true,
                city: true,
                country: true,
                links: true,
              },
            },
          },
        },
        application_step_states: {
          select: {
            step_id: true,
            status: true,
            latest_submission_version_id: true,
            workflow_steps: { select: { title: true, step_index: true } },
          },
        },
        attendance_records: {
          select: { status: true },
        },
      },
    });

    const completionCredentialRows =
      applications.length > 0
        ? await (this.prisma as any).completion_credentials.findMany({
            where: {
              event_id: eventId,
              application_id: {
                in: applications.map((application) => application.id),
              },
            },
            select: {
              application_id: true,
              certificate_id: true,
              credential_id: true,
              issued_at: true,
              revoked_at: true,
            },
          })
        : [];
    const completionCredentialByApplicationId = new Map<
      string,
      {
        application_id: string;
        certificate_id: string;
        credential_id: string;
        issued_at: Date;
        revoked_at: Date | null;
      }
    >(
      completionCredentialRows.map(
        (row: {
          application_id: string;
          certificate_id: string;
          credential_id: string;
          issued_at: Date;
          revoked_at: Date | null;
        }) => [row.application_id, row],
      ),
    );

    const submissionVersionIds = Array.from(
      new Set(
        applications.flatMap((application) =>
          (application.application_step_states ?? [])
            .map((stepState) => stepState.latest_submission_version_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    );

    const effectiveAnswersBySubmissionVersionId =
      await this.getEffectiveAnswersBySubmissionVersionIds(
        submissionVersionIds,
      );

    const responseColumnKeySet = new Set<string>();
    const responseHeaderByColumnKey = new Map<string, string>();
    const responseHeaderUsageCount = new Map<string, number>();
    const responseValuesByApplicationId = new Map<
      string,
      Map<string, string>
    >();
    const fileIdsByApplicationId = new Map<string, Set<string>>();
    for (const application of applications) {
      const responseValues = new Map<string, string>();
      const fileIds = new Set<string>();
      const sortedStepStates = [
        ...(application.application_step_states ?? []),
      ].sort(
        (a, b) =>
          (a.workflow_steps?.step_index ?? 0) -
            (b.workflow_steps?.step_index ?? 0) ||
          a.step_id.localeCompare(b.step_id),
      );
      for (const stepState of sortedStepStates) {
        const submissionVersionId = stepState.latest_submission_version_id;
        if (!submissionVersionId) continue;
        const effectiveAnswers = this.normalizeAnswersShape(
          effectiveAnswersBySubmissionVersionId.get(submissionVersionId),
        );
        this.collectFileObjectIds(effectiveAnswers, fileIds);

        const stepIndex = stepState.workflow_steps?.step_index ?? 0;
        const stepId = stepState.step_id;
        const sortedAnswerEntries = Object.entries(effectiveAnswers).sort(
          ([a], [b]) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: 'base',
            }),
        );

        for (const [fieldKey, fieldValue] of sortedAnswerEntries) {
          const responseColumnKey = `${String(stepIndex)}:${stepId}:${fieldKey}`;
          if (!responseColumnKeySet.has(responseColumnKey)) {
            responseColumnKeySet.add(responseColumnKey);
            const baseHeader = this.buildResponseHeaderLabel(
              stepState.workflow_steps?.title,
              stepState.workflow_steps?.step_index,
              fieldKey,
            );
            const usageCount = responseHeaderUsageCount.get(baseHeader) ?? 0;
            responseHeaderUsageCount.set(baseHeader, usageCount + 1);
            const finalHeader =
              usageCount === 0
                ? baseHeader
                : `${baseHeader} (${usageCount + 1})`;
            responseHeaderByColumnKey.set(responseColumnKey, finalHeader);
          }

          responseValues.set(
            responseColumnKey,
            this.serializeAnswerValueForCsv(fieldValue),
          );
        }
      }
      if (fileIds.size > 0) {
        fileIdsByApplicationId.set(application.id, fileIds);
      }
      if (responseValues.size > 0) {
        responseValuesByApplicationId.set(application.id, responseValues);
      }
    }

    const responseColumnKeys = Array.from(responseColumnKeySet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
    const responseHeaders = responseColumnKeys.map(
      (columnKey) => responseHeaderByColumnKey.get(columnKey) ?? columnKey,
    );

    const allFileIds = Array.from(
      new Set(
        Array.from(fileIdsByApplicationId.values()).flatMap((fileIds) =>
          Array.from(fileIds),
        ),
      ),
    );
    const fileObjects = allFileIds.length
      ? await this.prisma.file_objects.findMany({
          where: {
            id: { in: allFileIds },
            event_id: eventId,
          },
          select: {
            id: true,
            original_filename: true,
            mime_type: true,
            size_bytes: true,
            status: true,
          },
        })
      : [];
    const fileObjectsById = new Map(fileObjects.map((file) => [file.id, file]));

    const appBaseUrl = this.getAppBaseUrl();
    const headers = [
      'applicationId',
      'eventId',
      'eventSlug',
      'eventTitle',
      'applicantUserId',
      'applicantEmail',
      'applicantName',
      'phone',
      'education',
      'institution',
      'city',
      'country',
      'profileLinks',
      'decisionStatus',
      'decisionPublishedAt',
      'derivedStatus',
      'tags',
      'stepStatuses',
      'uploadedFileCount',
      'uploadedFileIds',
      'uploadedFiles',
      'completionCredentialStatus',
      'certificateId',
      'credentialId',
      'certificatePath',
      'verificationPath',
      'certificateUrl',
      'verificationUrl',
      'credentialIssuedAt',
      'credentialRevokedAt',
      'staffApplicationPath',
      'adminApplicationPath',
      'staffApplicationUrl',
      'adminApplicationUrl',
      'applicationCreatedAt',
      'applicationUpdatedAt',
      ...responseHeaders,
    ];

    const rows: unknown[][] = applications.map((application) => {
      const summary = this.toSummary(application);
      const user = application.users_applications_applicant_user_idTousers;
      const profile = user?.applicant_profiles;
      const stepStatuses = [...(application.application_step_states ?? [])]
        .sort(
          (a, b) =>
            (a.workflow_steps?.step_index ?? 0) -
            (b.workflow_steps?.step_index ?? 0),
        )
        .map(
          (stepState) =>
            `${stepState.workflow_steps?.step_index ?? 0}:${stepState.workflow_steps?.title ?? stepState.step_id}=${stepState.status}`,
        )
        .join(' | ');

      const fileIds = Array.from(
        fileIdsByApplicationId.get(application.id) ?? [],
      );
      const uploadedFiles = fileIds
        .map((fileId) => {
          const file = fileObjectsById.get(fileId);
          if (!file) return fileId;
          return `${file.original_filename} (${String(file.size_bytes)} bytes, ${file.mime_type}, ${file.status})`;
        })
        .join(' | ');

      const staffApplicationPath = `/staff/${eventId}/applications/${application.id}`;
      const adminApplicationPath = `/admin/events/${eventId}/applications/${application.id}`;
      const responseValues = responseValuesByApplicationId.get(application.id);
      const completion = completionCredentialByApplicationId.get(application.id);
      const credentialStatus = completion
        ? completion.revoked_at
          ? 'REVOKED'
          : 'ISSUED'
        : 'NOT_ISSUED';
      const credentialLinks = completion
        ? this.getCompletionCredentialLinks(
            completion.certificate_id,
            completion.credential_id,
          )
        : null;
      const certificatePath = completion
        ? `/credentials/certificate/${completion.certificate_id}`
        : '';
      const verificationPath = completion
        ? `/credentials/verify/${completion.credential_id}`
        : '';

      return [
        application.id,
        event.id,
        event.slug,
        event.title,
        summary.applicantUserId,
        summary.applicantEmail ?? '',
        summary.applicantName ?? '',
        profile?.phone ?? '',
        profile?.education_level ?? '',
        profile?.institution ?? '',
        profile?.city ?? '',
        profile?.country ?? '',
        this.formatProfileLinks(profile?.links),
        summary.decisionStatus,
        this.toIsoString(summary.decisionPublishedAt),
        summary.derivedStatus,
        (summary.tags ?? []).join(' | '),
        stepStatuses,
        fileIds.length,
        fileIds.join(' | '),
        uploadedFiles,
        credentialStatus,
        completion?.certificate_id ?? '',
        completion?.credential_id ?? '',
        certificatePath,
        verificationPath,
        credentialLinks?.certificateUrl ?? '',
        credentialLinks?.verifiableCredentialUrl ?? '',
        this.toIsoString(completion?.issued_at),
        this.toIsoString(completion?.revoked_at),
        staffApplicationPath,
        adminApplicationPath,
        `${appBaseUrl}${staffApplicationPath}`,
        `${appBaseUrl}${adminApplicationPath}`,
        this.toIsoString(application.created_at),
        this.toIsoString(application.updated_at),
        ...responseColumnKeys.map(
          (columnKey) => responseValues?.get(columnKey) ?? '',
        ),
      ];
    });

    const safeSlug = this.toFilenameSafePart(event.slug || event.id);
    return {
      filename: `applications-${safeSlug}.csv`,
      csv: this.buildCsv(headers, rows),
    };
  }

  /**
   * Get application by ID with full step states
   */
  async findById(
    eventId: string,
    applicationId: string,
  ): Promise<ApplicationDetail> {
    let app: any = await (this.prisma as any).applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            id: true,
            email: true,
            applicant_profiles: {
              select: {
                full_name: true,
                first_name: true,
                last_name: true,
                phone: true,
                education_level: true,
                institution: true,
                city: true,
                country: true,
                links: true,
              },
            },
          },
        },
        application_step_states: {
          include: {
            workflow_steps: {
              select: {
                title: true,
                step_index: true,
                category: true,
                deadline_at: true,
                instructions_rich: true,
                form_versions: { select: { schema: true } },
              },
            },
          },
          orderBy: { workflow_steps: { step_index: 'asc' } },
        },
        attendance_records: {
          select: { status: true },
        },
      },
    });

    if (!app) throw new NotFoundException('Application not found');
    const updated = await this.stepStateService.ensureStepStates(
      app.id,
      eventId,
    );
    if (updated) {
      app = await (this.prisma as any).applications.findFirst({
        where: { id: applicationId, event_id: eventId },
        include: {
          users_applications_applicant_user_idTousers: {
            select: {
              id: true,
              email: true,
              applicant_profiles: {
                select: {
                  full_name: true,
                  first_name: true,
                  last_name: true,
                  phone: true,
                  education_level: true,
                  institution: true,
                  city: true,
                  country: true,
                  links: true,
                },
              },
            },
          },
          application_step_states: {
            include: {
              workflow_steps: {
                select: {
                  title: true,
                  step_index: true,
                  category: true,
                  deadline_at: true,
                  instructions_rich: true,
                  form_versions: { select: { schema: true } },
                },
              },
            },
            orderBy: { workflow_steps: { step_index: 'asc' } },
          },
          attendance_records: {
            select: { status: true },
          },
          completion_credentials: {
            select: {
              certificate_id: true,
              credential_id: true,
              issued_at: true,
              revoked_at: true,
            },
          },
        },
      });
      if (!app) throw new NotFoundException('Application not found');
    }

    const answersByStepId = await this.getEffectiveAnswersByStepId(
      app.application_step_states ?? [],
    );

    const detail = this.toDetail(app, { answersByStepId });
    const profile = await this.prisma.applicant_profiles.findUnique({
      where: { user_id: detail.applicantUserId },
      select: {
        full_name: true,
        first_name: true,
        last_name: true,
        phone: true,
        education_level: true,
        institution: true,
        city: true,
        country: true,
        links: true,
      },
    });
    if (profile) {
      detail.applicantProfile = this.mapApplicantProfile(profile) ?? undefined;
      const displayName = ApplicationsService.getDisplayName(profile);
      if (!detail.applicantName && displayName) {
        detail.applicantName = displayName;
      }
    }

    return detail;
  }

  /**
   * Create new application (applicant starting their application)
   */
  async create(eventId: string): Promise<ApplicationDetail> {
    const userId = this.cls.get('actorId');

    // Check event exists and applications are open
    const event = await this.prisma.events.findFirst({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Enforce event must be published
    if (String(event.status).toLowerCase() !== 'published') {
      throw new ForbiddenException('Applications are not open for this event');
    }

    // Enforce application window (if set)
    const now = new Date();
    if (
      event.application_open_at &&
      now < new Date(event.application_open_at)
    ) {
      throw new ForbiddenException('Applications have not opened yet');
    }
    if (
      event.application_close_at &&
      now > new Date(event.application_close_at)
    ) {
      throw new ForbiddenException('Applications are closed');
    }

    if (event.capacity !== null && event.capacity !== undefined) {
      const totalApplications = await this.prisma.applications.count({
        where: { event_id: eventId },
      });
      if (totalApplications >= event.capacity) {
        throw new ForbiddenException('Event capacity has been reached');
      }
    }

    // Check for existing application
    const existing = await this.prisma.applications.findFirst({
      where: { event_id: eventId, applicant_user_id: userId },
    });
    if (existing) {
      const detail = await this.findMyApplication(eventId);
      if (!detail) throw new NotFoundException('Application not found');
      return detail;
    }

    await this.ensureApplicantProfileComplete(userId);

    // Create application
    let applicationId: string;
    try {
      const application = await this.prisma.applications.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          applicant_user_id: userId,
          decision_status: DecisionStatus.NONE,
          decision_draft: {},
          tags: [],
        },
      });
      applicationId = application.id;
    } catch (error) {
      // Handle create races (e.g. duplicate client requests in dev strict mode).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedExisting = await this.prisma.applications.findFirst({
          where: { event_id: eventId, applicant_user_id: userId },
          select: { id: true },
        });
        if (racedExisting?.id) {
          const detail = await this.findMyApplication(eventId);
          if (!detail) throw new NotFoundException('Application not found');
          return detail;
        }
      }
      throw error;
    }

    // Initialize step states based on workflow
    await this.stepStateService.initializeStepStates(applicationId, eventId);

    const detail = await this.findMyApplication(eventId);
    if (!detail) throw new NotFoundException('Application not found');
    return detail;
  }

  private hasTextValue(value: unknown): boolean {
    if (value instanceof Date) {
      return !Number.isNaN(value.getTime());
    }
    return typeof value === 'string' && value.trim().length > 0;
  }

  private getMissingRequiredProfileFields(
    profile:
      | {
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          education_level: string | null;
          institution: string | null;
          city: string | null;
          country: string | null;
          date_of_birth: Date | string | null;
        }
      | null,
  ): string[] {
    const source = (profile ?? {}) as Record<string, unknown>;
    return ApplicationsService.REQUIRED_PROFILE_FIELDS.filter(
      ({ key }) => !this.hasTextValue(source[key]),
    ).map(({ label }) => label);
  }

  private async ensureApplicantProfileComplete(userId: string): Promise<void> {
    const profile = await this.prisma.applicant_profiles.findUnique({
      where: { user_id: userId },
      select: {
        full_name: true,
        first_name: true,
        last_name: true,
        phone: true,
        education_level: true,
        institution: true,
        city: true,
        country: true,
        date_of_birth: true,
      },
    });
    const missingFields = this.getMissingRequiredProfileFields(profile);
    if (missingFields.length === 0) return;

    throw new ForbiddenException({
      message: 'Complete your profile before applying to events.',
      code: 'PROFILE_INCOMPLETE',
      missingFields,
    });
  }

  /**
   * Get the current user's application for an event
   */
  async findMyApplication(eventId: string): Promise<ApplicationDetail | null> {
    const userId = this.cls.get('actorId');

    let app: any = await (this.prisma as any).applications.findFirst({
      where: {
        event_id: eventId,
        applicant_user_id: userId,
        events: { is: { status: 'published' } },
      },
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            id: true,
            email: true,
            applicant_profiles: {
              select: {
                full_name: true,
                first_name: true,
                last_name: true,
                phone: true,
                education_level: true,
                institution: true,
                city: true,
                country: true,
                links: true,
              },
            },
          },
        },
        application_step_states: {
          include: {
            workflow_steps: {
              select: {
                title: true,
                step_index: true,
                category: true,
                deadline_at: true,
                instructions_rich: true,
                hidden: true,
                form_versions: { select: { schema: true } },
              },
            },
          },
          orderBy: { workflow_steps: { step_index: 'asc' } },
        },
        attendance_records: {
          select: { status: true },
        },
        completion_credentials: {
          select: {
            certificate_id: true,
            credential_id: true,
            issued_at: true,
            revoked_at: true,
          },
        },
      },
    });

    if (!app) return null;
    const updated = await this.stepStateService.ensureStepStates(
      app.id,
      eventId,
    );
    if (updated) {
      app = await (this.prisma as any).applications.findFirst({
        where: {
          id: app.id,
          event_id: eventId,
          events: { is: { status: 'published' } },
        },
        include: {
          users_applications_applicant_user_idTousers: {
            select: {
              id: true,
              email: true,
              applicant_profiles: {
                select: {
                  full_name: true,
                  first_name: true,
                  last_name: true,
                  phone: true,
                  education_level: true,
                  institution: true,
                  city: true,
                  country: true,
                  links: true,
                },
              },
            },
          },
          application_step_states: {
            include: {
              workflow_steps: {
                select: {
                  title: true,
                  step_index: true,
                  category: true,
                  deadline_at: true,
                  instructions_rich: true,
                  hidden: true,
                  form_versions: { select: { schema: true } },
                },
              },
            },
            orderBy: { workflow_steps: { step_index: 'asc' } },
          },
          attendance_records: {
            select: { status: true },
          },
          completion_credentials: {
            select: {
              certificate_id: true,
              credential_id: true,
              issued_at: true,
              revoked_at: true,
            },
          },
        },
      });
      if (!app) return null;
    }
    return this.toDetail(app, {
      maskDecisionIfUnpublished: true,
      hideInternalNotes: true,
      hideAssignedReviewer: true,
    });
  }

  /**
   * Set decision for an application
   */
  async setDecision(
    eventId: string,
    applicationId: string,
    status: DecisionStatus,
    draft: boolean,
    templateId?: string | null,
  ): Promise<ApplicationDetail> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, slug: true, decision_config: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const decisionConfig =
      (event?.decision_config as Record<string, unknown>) ?? {};
    const autoPublish = this.readBoolean(decisionConfig.autoPublish, false);
    const shouldPublish = autoPublish ? true : !draft;

    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            email: true,
            applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
          },
        },
      },
    });

    if (!app) throw new NotFoundException('Application not found');

    const now = new Date();
    const data: any = {
      decision_status: status,
      updated_at: now,
    };

    if (templateId !== undefined) {
      if (templateId === null) {
        data.decision_draft = {};
      } else {
        const template = await this.prisma.decision_templates.findFirst({
          where: {
            id: templateId,
            event_id: eventId,
            is_active: true,
          },
        });
        if (!template) {
          throw new NotFoundException('Decision template not found');
        }
        if (template.status !== status) {
          throw new BadRequestException(
            'Decision template status must match decision status',
          );
        }

        const variables = this.buildDecisionTemplateVariables(
          {
            id: app.id,
            applicantEmail:
              app.users_applications_applicant_user_idTousers?.email ?? '',
            applicantName:
              ApplicationsService.getDisplayName(
                app.users_applications_applicant_user_idTousers?.applicant_profiles,
              ) ||
              app.users_applications_applicant_user_idTousers?.email ||
              'Applicant',
          },
          {
            id: event.id,
            title: event.title,
            slug: event.slug,
          },
          status,
        );

        data.decision_draft = {
          templateId: template.id,
          templateName: template.name,
          status,
          subjectTemplate: template.subject_template,
          bodyTemplate: template.body_template,
          rendered: {
            subject: this.renderDecisionTemplateString(
              template.subject_template,
              variables,
            ),
            body: this.renderDecisionTemplateString(
              template.body_template,
              variables,
            ),
          },
          variables,
          updatedAt: now.toISOString(),
        };
      }
    }

    if (!shouldPublish) {
      // If drafting, ensure published_at is not set (unless it was already published?)
      // Requirement: "If draft=true, sets decision_status but keeps decision_published_at null."
      // Assuming we reset published_at if going back to draft? Or just don't touch it?
      // "If draft=true ... sets decision_published_at null" implies unpublishing.
      data.decision_published_at = null;
    } else {
      // Immediate publish
      data.decision_published_at = now;
    }

    await this.prisma.applications.update({
      where: { id: applicationId },
      data,
    });

    if (shouldPublish) {
      // Trigger unlock logic (for Confirmation step)
      await this.stepStateService.recomputeAllStepStates(applicationId);
    }

    return this.findById(eventId, applicationId);
  }

  async bulkUpdateTags(
    eventId: string,
    dto: BulkApplicationTagsDto,
  ): Promise<{ updated: number }> {
    const applications = await this.prisma.applications.findMany({
      where: {
        event_id: eventId,
        id: { in: dto.applicationIds },
      },
      select: { id: true, tags: true },
    });
    if (applications.length === 0) return { updated: 0 };

    const addTags = Array.from(
      new Set(
        (dto.addTags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
    const removeSet = new Set(
      (dto.removeTags ?? [])
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    );

    await this.prisma.$transaction(
      applications.map((application) => {
        const nextTags = Array.from(
          new Set([...(application.tags ?? []), ...addTags]),
        ).filter((tag) => !removeSet.has(tag));
        return this.prisma.applications.update({
          where: { id: application.id },
          data: { tags: nextTags, updated_at: new Date() },
        });
      }),
    );

    return { updated: applications.length };
  }

  async bulkAssignReviewer(
    eventId: string,
    dto: BulkAssignReviewerDto,
  ): Promise<{ updated: number }> {
    if (dto.reviewerId) {
      const now = new Date();
      const assignment = await this.prisma.event_role_assignments.findFirst({
        where: {
          event_id: eventId,
          user_id: dto.reviewerId,
          role: { in: ['reviewer', 'organizer'] },
          AND: [
            { OR: [{ access_start_at: null }, { access_start_at: { lte: now } }] },
            { OR: [{ access_end_at: null }, { access_end_at: { gte: now } }] },
          ],
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new BadRequestException(
          'Reviewer must have an active reviewer/organizer role in this event',
        );
      }
    }

    const result = await this.prisma.applications.updateMany({
      where: { event_id: eventId, id: { in: dto.applicationIds } },
      data: {
        assigned_reviewer_id: dto.reviewerId ?? null,
        updated_at: new Date(),
      },
    });

    return { updated: result.count };
  }

  async bulkDraftDecisions(
    eventId: string,
    dto: BulkDecisionDraftDto,
  ): Promise<{ updated: number }> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, slug: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const applications = await this.prisma.applications.findMany({
      where: {
        event_id: eventId,
        id: { in: dto.applicationIds },
      },
      include: {
        users_applications_applicant_user_idTousers: {
          select: {
            email: true,
            applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
          },
        },
      },
    });
    if (applications.length === 0) return { updated: 0 };

    let template:
      | {
          id: string;
          name: string;
          status: string;
          subject_template: string;
          body_template: string;
        }
      | null = null;
    if (dto.templateId) {
      template = await this.prisma.decision_templates.findFirst({
        where: {
          id: dto.templateId,
          event_id: eventId,
          is_active: true,
        },
        select: {
          id: true,
          name: true,
          status: true,
          subject_template: true,
          body_template: true,
        },
      });
      if (!template) throw new NotFoundException('Decision template not found');
      if (template.status !== dto.status) {
        throw new BadRequestException(
          'Decision template status must match bulk decision status',
        );
      }
    }

    const now = new Date();
    await this.prisma.$transaction(
      applications.map((application) => {
        let decisionDraft: Prisma.InputJsonValue = {};
        if (template) {
          const variables = this.buildDecisionTemplateVariables(
            {
              id: application.id,
              applicantEmail:
                application.users_applications_applicant_user_idTousers?.email ??
                '',
              applicantName:
                ApplicationsService.getDisplayName(
                  application.users_applications_applicant_user_idTousers
                    ?.applicant_profiles,
                ) ||
                application.users_applications_applicant_user_idTousers
                  ?.email ||
                'Applicant',
            },
            event,
            dto.status,
          );
          decisionDraft = {
            templateId: template.id,
            templateName: template.name,
            status: dto.status,
            subjectTemplate: template.subject_template,
            bodyTemplate: template.body_template,
            rendered: {
              subject: this.renderDecisionTemplateString(
                template.subject_template,
                variables,
              ),
              body: this.renderDecisionTemplateString(
                template.body_template,
                variables,
              ),
            },
            variables,
            updatedAt: now.toISOString(),
          } as Prisma.InputJsonValue;
        }

        return this.prisma.applications.update({
          where: { id: application.id },
          data: {
            decision_status: dto.status,
            decision_published_at: null,
            decision_draft: decisionDraft as Prisma.InputJsonValue,
            updated_at: now,
          },
        });
      }),
    );

    return { updated: applications.length };
  }

  async listDecisionTemplates(
    eventId: string,
  ): Promise<DecisionTemplateResponse[]> {
    const templates = await this.prisma.decision_templates.findMany({
      where: { event_id: eventId },
      orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
    });

    return templates.map((template) => ({
      id: template.id,
      eventId: template.event_id,
      name: template.name,
      status: template.status as DecisionTemplateResponse['status'],
      subjectTemplate: template.subject_template,
      bodyTemplate: template.body_template,
      isActive: template.is_active,
      createdBy: template.created_by,
      updatedBy: template.updated_by,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    }));
  }

  async createDecisionTemplate(
    eventId: string,
    dto: CreateDecisionTemplateDto,
  ): Promise<DecisionTemplateResponse> {
    const actorId = this.cls.get('actorId');
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    try {
      const created = await this.prisma.decision_templates.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          name: dto.name,
          status: dto.status,
          subject_template: dto.subjectTemplate,
          body_template: dto.bodyTemplate,
          is_active: dto.isActive ?? true,
          created_by: actorId,
          updated_by: actorId,
        },
      });
      return {
        id: created.id,
        eventId: created.event_id,
        name: created.name,
        status: created.status as DecisionTemplateResponse['status'],
        subjectTemplate: created.subject_template,
        bodyTemplate: created.body_template,
        isActive: created.is_active,
        createdBy: created.created_by,
        updatedBy: created.updated_by,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A decision template with this name already exists for this event',
        );
      }
      throw error;
    }
  }

  async updateDecisionTemplate(
    eventId: string,
    templateId: string,
    dto: UpdateDecisionTemplateDto,
  ): Promise<DecisionTemplateResponse> {
    const actorId = this.cls.get('actorId');
    const existing = await this.prisma.decision_templates.findFirst({
      where: { id: templateId, event_id: eventId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Decision template not found');

    try {
      const updated = await this.prisma.decision_templates.update({
        where: { id: templateId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.subjectTemplate !== undefined
            ? { subject_template: dto.subjectTemplate }
            : {}),
          ...(dto.bodyTemplate !== undefined
            ? { body_template: dto.bodyTemplate }
            : {}),
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
          updated_by: actorId,
          updated_at: new Date(),
        },
      });
      return {
        id: updated.id,
        eventId: updated.event_id,
        name: updated.name,
        status: updated.status as DecisionTemplateResponse['status'],
        subjectTemplate: updated.subject_template,
        bodyTemplate: updated.body_template,
        isActive: updated.is_active,
        createdBy: updated.created_by,
        updatedBy: updated.updated_by,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A decision template with this name already exists for this event',
        );
      }
      throw error;
    }
  }

  async deleteDecisionTemplate(eventId: string, templateId: string): Promise<void> {
    const result = await this.prisma.decision_templates.deleteMany({
      where: { id: templateId, event_id: eventId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Decision template not found');
    }
  }

  /**
   * Replace application tags (staff)
   */
  async updateTags(
    eventId: string,
    applicationId: string,
    tags: string[],
  ): Promise<ApplicationDetail> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const normalizedTags = [
      ...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    ];

    await this.prisma.applications.update({
      where: { id: applicationId },
      data: {
        tags: normalizedTags,
        updated_at: new Date(),
      },
    });

    return this.findById(eventId, applicationId);
  }

  /**
   * Update internal notes blob (staff)
   */
  async updateInternalNotes(
    eventId: string,
    applicationId: string,
    internalNotes: string | null,
  ): Promise<ApplicationDetail> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    await this.prisma.applications.update({
      where: { id: applicationId },
      data: {
        internal_notes:
          internalNotes && internalNotes.trim().length > 0
            ? internalNotes
            : null,
        updated_at: new Date(),
      },
    });

    return this.findById(eventId, applicationId);
  }

  /**
   * Delete an application (organizer/admin)
   */
  async deleteById(eventId: string, applicationId: string): Promise<void> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    await this.prisma.$transaction(async (tx) => {
      // Keep check-in history rows but detach them from the deleted application.
      await tx.checkin_records.updateMany({
        where: { event_id: eventId, application_id: applicationId },
        data: { application_id: null },
      });

      await tx.applications.delete({
        where: { id: applicationId },
      });
    });
  }

  /**
   * Bulk delete applications (organizer/admin)
   */
  async bulkDelete(
    eventId: string,
    applicationIds: string[],
  ): Promise<{ deleted: number }> {
    const apps = await this.prisma.applications.findMany({
      where: { event_id: eventId, id: { in: applicationIds } },
      select: { id: true },
    });
    if (apps.length === 0) return { deleted: 0 };

    const validIds = apps.map((a) => a.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.checkin_records.updateMany({
        where: { event_id: eventId, application_id: { in: validIds } },
        data: { application_id: null },
      });

      await tx.applications.deleteMany({
        where: { id: { in: validIds }, event_id: eventId },
      });
    });

    return { deleted: validIds.length };
  }

  /**
   * Bulk step action (unlock, approve, needs revision, lock)
   */
  async bulkStepAction(
    eventId: string,
    dto: BulkStepActionDto,
  ): Promise<{ updated: number; skipped: number }> {
    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: dto.stepId, event_id: eventId },
    });
    if (!step) throw new NotFoundException('Step not found in this event');

    const apps = await this.prisma.applications.findMany({
      where: { event_id: eventId, id: { in: dto.applicationIds } },
      select: { id: true },
    });
    if (apps.length === 0) return { updated: 0, skipped: 0 };

    let updated = 0;
    for (const app of apps) {
      try {
        switch (dto.action) {
          case 'UNLOCK':
            await this.stepStateService.manualUnlock(app.id, dto.stepId);
            break;
          case 'APPROVE':
            await this.stepStateService.markApproved(app.id, dto.stepId);
            break;
          case 'NEEDS_REVISION':
            await this.stepStateService.markNeedsRevision(app.id, dto.stepId);
            break;
          case 'LOCK':
            await this.prisma.application_step_states.updateMany({
              where: { application_id: app.id, step_id: dto.stepId },
              data: { status: 'LOCKED', last_activity_at: new Date() },
            });
            break;
        }
        updated++;
      } catch {
        // Skip individual failures
      }
    }

    return { updated, skipped: apps.length - updated };
  }

  /**
   * List messages delivered to the applicant for this application/event
   */
  async getApplicationMessages(eventId: string, applicationId: string) {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { applicant_user_id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const recipients = await this.prisma.message_recipients.findMany({
      where: {
        recipient_user_id: app.applicant_user_id,
        messages: { event_id: eventId },
      },
      include: {
        messages: {
          include: {
            users: {
              select: {
                email: true,
                applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return recipients.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      title: r.messages.title,
      type: r.messages.type,
      bodyRich: r.messages.body_rich,
      bodyText: r.messages.body_text ?? null,
      actionButtons: r.messages.action_buttons ?? [],
      createdAt: r.messages.created_at,
      readAt: r.read_at,
      senderEmail: r.messages.users?.email ?? null,
      senderName:
        ApplicationsService.getDisplayName(r.messages.users?.applicant_profiles) ||
        r.messages.users?.email ||
        'Staff',
    }));
  }

  /**
   * List audit log entries related to an application
   */
  async getApplicationAuditLog(
    eventId: string,
    applicationId: string,
    limit = 100,
  ) {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const [stepStates, submissions, needsInfo, patches] =
      await this.prisma.$transaction([
        this.prisma.application_step_states.findMany({
          where: { application_id: applicationId },
          select: { id: true },
        }),
        this.prisma.step_submission_versions.findMany({
          where: { application_id: applicationId },
          select: { id: true },
        }),
        this.prisma.needs_info_requests.findMany({
          where: { application_id: applicationId },
          select: { id: true },
        }),
        this.prisma.admin_change_patches.findMany({
          where: { application_id: applicationId },
          select: { id: true },
        }),
      ]);

    const submissionIds = submissions.map((s) => s.id);
    const reviewRecords = submissionIds.length
      ? await this.prisma.review_records.findMany({
          where: { submission_version_id: { in: submissionIds } },
          select: { id: true },
        })
      : [];

    const entityFilters: any[] = [
      { entity_type: 'applications', entity_id: applicationId },
    ];

    if (stepStates.length) {
      entityFilters.push({
        entity_type: 'application_step_states',
        entity_id: { in: stepStates.map((s) => s.id) },
      });
    }
    if (submissionIds.length) {
      entityFilters.push({
        entity_type: 'step_submission_versions',
        entity_id: { in: submissionIds },
      });
    }
    if (needsInfo.length) {
      entityFilters.push({
        entity_type: 'needs_info_requests',
        entity_id: { in: needsInfo.map((r) => r.id) },
      });
    }
    if (patches.length) {
      entityFilters.push({
        entity_type: 'admin_change_patches',
        entity_id: { in: patches.map((p) => p.id) },
      });
    }
    if (reviewRecords.length) {
      entityFilters.push({
        entity_type: 'review_records',
        entity_id: { in: reviewRecords.map((r) => r.id) },
      });
    }

    const logs = await this.prisma.audit_logs.findMany({
      where: {
        OR: [
          {
            event_id: eventId,
            OR: entityFilters,
          },
          {
            event_id: null,
            OR: entityFilters,
          },
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        users: {
          select: {
            email: true,
            applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
          },
        },
      },
    });

    return logs.map((log) => {
      const afterData = log.after as Record<string, any> | null;
      let details: string | undefined;
      if (afterData?._diff && afterData?.changes) {
        const changedKeys = Object.keys(afterData.changes);
        details = `Changed: ${changedKeys.join(', ')}`;
      }
      if (
        !details &&
        log.action === 'create' &&
        log.entity_type === 'admin_change_patches' &&
        afterData
      ) {
        const ops = Array.isArray(afterData.ops) ? afterData.ops : [];
        const changedFields = Array.from(
          new Set(
            ops
              .map((op) =>
                typeof op?.path === 'string'
                  ? op.path.replace(/^\//, '')
                  : undefined,
              )
              .filter((path): path is string => Boolean(path)),
          ),
        );
        const reason =
          typeof afterData.reason === 'string'
            ? afterData.reason.trim()
            : undefined;
        const detailParts: string[] = [];
        if (changedFields.length > 0) {
          detailParts.push(`Fields: ${changedFields.join(', ')}`);
        }
        if (reason) {
          detailParts.push(`Reason: ${reason}`);
        }
        details = detailParts.join(' | ') || 'Patch created';
      }

      return {
        id: log.id,
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_id,
        actorEmail: log.users?.email ?? 'system',
        actorName: ApplicationsService.getDisplayName(log.users?.applicant_profiles) || undefined,
        details,
        createdAt: log.created_at,
        redactionApplied: log.redaction_applied,
      };
    });
  }

  /**
   * Bulk publish decisions
   */
  async publishDecisions(
    eventId: string,
    applicationIds?: string[],
  ): Promise<{ count: number }> {
    const actorId = this.cls.get('actorId');
    if (!actorId) {
      throw new ForbiddenException('Actor context missing');
    }

    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Find all applications for this event that have a decision set (not NONE) but are not published
    // If applicationIds provided, filter by them
    const where: any = {
      event_id: eventId,
      decision_status: { not: DecisionStatus.NONE },
      decision_published_at: null,
    };

    if (applicationIds && applicationIds.length > 0) {
      where.id = { in: applicationIds };
    }

    const toPublish = await this.prisma.applications.findMany({
      where,
      select: {
        id: true,
        applicant_user_id: true,
        decision_status: true,
        decision_draft: true,
      },
    });

    if (toPublish.length === 0) return { count: 0 };

    const now = new Date();

    // Update in DB
    await this.prisma.applications.updateMany({
      where: { id: { in: toPublish.map((a) => a.id) } },
      data: { decision_published_at: now, updated_at: now },
    });

    await this.createDecisionPublishNotifications(event, toPublish, actorId, now);

    // Trigger unlock logic in bounded parallel batches.
    const recomputeBatchSize = 25;
    for (let i = 0; i < toPublish.length; i += recomputeBatchSize) {
      const batch = toPublish.slice(i, i + recomputeBatchSize);
      await Promise.all(
        batch.map((app) =>
          this.stepStateService.recomputeAllStepStates(app.id),
        ),
      );
    }

    return { count: toPublish.length };
  }

  private async createDecisionPublishNotifications(
    event: { id: string; title: string },
    applications: Array<{
      id: string;
      applicant_user_id: string;
      decision_status: string;
      decision_draft: Prisma.JsonValue;
    }>,
    actorId: string,
    now: Date,
  ): Promise<void> {
    if (applications.length === 0) return;

    const messages = applications.map((application) => {
      const { title, bodyText } = this.buildDecisionPublishMessage(
        event.title,
        application.decision_status as DecisionStatus,
        application.decision_draft,
      );
      const id = crypto.randomUUID();
      const bodyRich: Prisma.InputJsonValue = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: bodyText }],
          },
        ],
      };

      return {
        id,
        event_id: event.id,
        created_by: actorId,
        type: MessageType.TRANSACTIONAL,
        title,
        body_rich: bodyRich,
        body_text: bodyText,
        action_buttons: [
          {
            kind: 'OPEN_APPLICATION',
            eventId: event.id,
            label: 'View decision',
          },
        ] as Prisma.InputJsonValue,
        resolved_recipient_count: 1,
        resolved_at: now,
        status: 'SENT',
        recipientUserId: application.applicant_user_id,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.messages.createMany({
        data: messages.map((message) => ({
          id: message.id,
          event_id: message.event_id,
          created_by: message.created_by,
          type: message.type,
          title: message.title,
          body_rich: message.body_rich,
          body_text: message.body_text,
          action_buttons: message.action_buttons,
          resolved_recipient_count: message.resolved_recipient_count,
          resolved_at: message.resolved_at,
          status: message.status,
        })),
      });

      await tx.message_recipients.createMany({
        data: messages.map((message) => ({
          id: crypto.randomUUID(),
          message_id: message.id,
          recipient_user_id: message.recipientUserId,
          delivery_inbox_status: 'DELIVERED',
          delivery_email_status: EmailDeliveryStatus.QUEUED,
        })),
        skipDuplicates: true,
      });
    });
  }

  private buildDecisionPublishMessage(
    eventTitle: string,
    status: DecisionStatus,
    decisionDraft: Prisma.JsonValue | null,
  ): { title: string; bodyText: string } {
    const decisionDraftRecord =
      decisionDraft && typeof decisionDraft === 'object' && !Array.isArray(decisionDraft)
        ? (decisionDraft as Record<string, unknown>)
        : {};
    const rendered =
      decisionDraftRecord.rendered &&
      typeof decisionDraftRecord.rendered === 'object' &&
      !Array.isArray(decisionDraftRecord.rendered)
        ? (decisionDraftRecord.rendered as Record<string, unknown>)
        : {};
    const renderedSubject =
      typeof rendered.subject === 'string' ? rendered.subject.trim() : '';
    const renderedBody = typeof rendered.body === 'string' ? rendered.body.trim() : '';

    if (renderedSubject && renderedBody) {
      return { title: renderedSubject, bodyText: renderedBody };
    }

    const normalizedStatus =
      status === DecisionStatus.ACCEPTED
        ? 'accepted'
        : status === DecisionStatus.WAITLISTED
          ? 'waitlisted'
          : status === DecisionStatus.REJECTED
            ? 'rejected'
            : 'updated';

    return {
      title:
        renderedSubject || `Application decision published for ${eventTitle}`,
      bodyText:
        renderedBody ||
        `Your application decision for ${eventTitle} is now published. Current status: ${normalizedStatus}.`,
    };
  }

  /**
   * Transform DB application to summary
   */
  private toSummary(
    app: any,
    options?: { maskDecisionIfUnpublished?: boolean },
  ): ApplicationSummary {
    const user = app.users_applications_applicant_user_idTousers;
    const stepStates = app.application_step_states || [];
    const decisionPublished = app.decision_published_at != null;
    const decisionStatus =
      options?.maskDecisionIfUnpublished && !decisionPublished
        ? DecisionStatus.NONE
        : (app.decision_status as DecisionStatus);
    const decisionDraft =
      options?.maskDecisionIfUnpublished && !decisionPublished
        ? undefined
        : ((app.decision_draft as Record<string, any> | undefined) ?? undefined);
    const appForDerivedStatus = {
      ...app,
      decision_status: decisionStatus,
    };

    return {
      id: app.id,
      eventId: app.event_id,
      applicantUserId: app.applicant_user_id,
      applicantEmail: user?.email,
      applicantName: ApplicationsService.getDisplayName(user?.applicant_profiles) || undefined,
      decisionStatus,
      decisionPublishedAt: decisionPublished ? app.decision_published_at : null,
      decisionDraft,
      tags: app.tags,
      derivedStatus: this.calculateDerivedStatus(
        appForDerivedStatus,
        stepStates,
      ),
      createdAt: app.created_at,
      updatedAt: app.updated_at,
      stepsSummary: {
        total: stepStates.length,
        completed: stepStates.filter(
          (s: any) =>
            s.status === StepStatus.APPROVED ||
            s.status === StepStatus.SUBMITTED,
        ).length,
        needsRevision: stepStates.filter(
          (s: any) => s.status === StepStatus.NEEDS_REVISION,
        ).length,
      },
    };
  }

  private mapApplicantProfile(profile: any): ApplicantProfile | null {
    if (!profile) return null;
    const rawLinks = profile.links;
    const links = Array.isArray(rawLinks)
      ? rawLinks
          .filter((v): v is string => typeof v === 'string')
          .map((link) => link.trim())
          .filter((link) => link.length > 0)
      : [];

    return {
      firstName: profile.first_name ?? undefined,
      lastName: profile.last_name ?? undefined,
      fullName: ApplicationsService.getDisplayName(profile) || undefined,
      phone: profile.phone ?? undefined,
      education: profile.education_level ?? undefined,
      institution: profile.institution ?? undefined,
      city: profile.city ?? undefined,
      country: profile.country ?? undefined,
      links,
    };
  }

  private toApplicantProfile(user: any): ApplicantProfile | null {
    return this.mapApplicantProfile(user?.applicant_profiles);
  }

  /**
   * Calculate derived status based on steps and decision
   */
  private calculateDerivedStatus(app: any, stepStates: any[]): string {
    const decisionStatus = app.decision_status as DecisionStatus;
    const decisionPublished = app.decision_published_at != null;

    if (decisionStatus === DecisionStatus.REJECTED) {
      return decisionPublished
        ? 'DECISION_REJECTED_PUBLISHED'
        : 'DECISION_REJECTED_DRAFT';
    }

    if (stepStates.some((s) => s.status === StepStatus.REJECTED_FINAL)) {
      return 'BLOCKED_REJECTED';
    }

    if (
      app.attendance_records &&
      app.attendance_records.status === 'CHECKED_IN'
    ) {
      return 'CHECKED_IN';
    }

    if (
      app.attendance_records &&
      app.attendance_records.status === 'CONFIRMED'
    ) {
      return 'CONFIRMED';
    }

    if (decisionStatus === DecisionStatus.ACCEPTED) {
      return decisionPublished
        ? 'DECISION_ACCEPTED_PUBLISHED'
        : 'DECISION_ACCEPTED_DRAFT';
    }

    if (decisionStatus === DecisionStatus.WAITLISTED) {
      return decisionPublished
        ? 'DECISION_WAITLISTED_PUBLISHED'
        : 'DECISION_WAITLISTED_DRAFT';
    }

    // Check steps
    // Sort steps by index just in case
    const sortedSteps = [...stepStates].sort(
      (a, b) =>
        (a.workflow_steps?.step_index ?? 0) -
        (b.workflow_steps?.step_index ?? 0),
    );

    const blockingStep = sortedSteps.find(
      (s) => s.status !== StepStatus.APPROVED,
    );

    if (!blockingStep) {
      return 'ALL_REQUIRED_STEPS_APPROVED';
    }

    const stepIndex = blockingStep.workflow_steps?.step_index ?? 0;

    if (blockingStep.status === StepStatus.SUBMITTED) {
      return `WAITING_FOR_REVIEW_STEP_${stepIndex}`;
    }

    if (blockingStep.status === StepStatus.NEEDS_REVISION) {
      return `REVISION_REQUIRED_STEP_${stepIndex}`;
    }

    return `WAITING_FOR_APPLICANT_STEP_${stepIndex}`;
  }

  private toDetail(
    app: any,
    options?: {
      answersByStepId?: Record<string, Record<string, any>>;
      maskDecisionIfUnpublished?: boolean;
      hideInternalNotes?: boolean;
      hideAssignedReviewer?: boolean;
    },
  ): ApplicationDetail {
    const summary = this.toSummary(app, {
      maskDecisionIfUnpublished: options?.maskDecisionIfUnpublished,
    });
    const user = app.users_applications_applicant_user_idTousers;
    const applicantProfile = this.toApplicantProfile(user);
    const allStepStates = app.application_step_states || [];
    // Keep hidden steps invisible until they are unlocked.
    const stepStates = options?.maskDecisionIfUnpublished
      ? allStepStates.filter((ss: any) => this.isApplicantStepVisible(ss))
      : allStepStates;
    const answersByStepId = options?.answersByStepId ?? {};

    return {
      ...summary,
      internalNotes: options?.hideInternalNotes ? null : app.internal_notes,
      assignedReviewerId: options?.hideAssignedReviewer
        ? null
        : app.assigned_reviewer_id,
      applicantProfile: applicantProfile ?? undefined,
      completionCredential: this.toCompletionCredential(
        app.completion_credentials ?? null,
      ),
      stepStates: stepStates.map((ss: any) => ({
        id: `${ss.application_id}:${ss.step_id}`,
        stepId: ss.step_id,
        stepTitle: ss.workflow_steps?.title || 'Unknown Step',
        stepIndex: ss.workflow_steps?.step_index ?? 0,
        category: ss.workflow_steps?.category,
        status: ss.status as StepStatus,
        deadlineAt: ss.workflow_steps?.deadline_at ?? null,
        instructions:
          typeof ss.workflow_steps?.instructions_rich === 'string'
            ? ss.workflow_steps.instructions_rich
            : ss.workflow_steps?.instructions_rich?.html || undefined,
        formDefinition: ss.workflow_steps?.form_versions?.schema || undefined,
        answers: answersByStepId[ss.step_id]
          ? this.normalizeAnswersShape(answersByStepId[ss.step_id])
          : undefined,
        currentDraftId: ss.current_draft_id,
        latestSubmissionVersionId: ss.latest_submission_version_id,
        revisionCycleCount: ss.revision_cycle_count,
        unlockedAt: ss.unlocked_at,
        lastActivityAt: ss.last_activity_at,
      })),
    };
  }

  private isApplicantStepVisible(stepState: any): boolean {
    if (!stepState?.workflow_steps?.hidden) return true;
    return String(stepState.status ?? '') !== String(StepStatus.LOCKED);
  }

  private async ensureConfirmationApprovedBeforeTicket(
    eventId: string,
    applicationId: string,
  ): Promise<void> {
    const confirmationSteps = await this.prisma.application_step_states.findMany({
      where: {
        application_id: applicationId,
        workflow_steps: {
          event_id: eventId,
          category: 'CONFIRMATION',
        },
      },
      select: {
        status: true,
      },
    });

    // Backward compatibility: keep existing behavior when no confirmation step exists.
    if (confirmationSteps.length === 0) return;

    const hasPendingConfirmation = confirmationSteps.some(
      (step) => step.status !== StepStatus.APPROVED,
    );
    if (hasPendingConfirmation) {
      throw new ForbiddenException(
        'Ticket is available only after confirmation step approval',
      );
    }
  }

  private async getEffectiveAnswersByStepId(
    stepStates: Array<{
      step_id: string;
      latest_submission_version_id?: string | null;
    }>,
  ): Promise<Record<string, Record<string, any>>> {
    const latestSubmissionIds = Array.from(
      new Set(
        stepStates
          .map((s) => s.latest_submission_version_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (latestSubmissionIds.length === 0) return {};

    const [submissions, patches] = await this.prisma.$transaction([
      this.prisma.step_submission_versions.findMany({
        where: { id: { in: latestSubmissionIds } },
        select: { id: true, answers_snapshot: true },
      }),
      this.prisma.admin_change_patches.findMany({
        where: {
          submission_version_id: { in: latestSubmissionIds },
          is_active: true,
        },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    const submissionsById = new Map(
      submissions.map((s) => [
        s.id,
        this.normalizeAnswersShape(s.answers_snapshot as Record<string, any>),
      ]),
    );

    const patchesByVersionId = new Map<string, any[]>();
    for (const patch of patches) {
      const list = patchesByVersionId.get(patch.submission_version_id) ?? [];
      list.push(patch);
      patchesByVersionId.set(patch.submission_version_id, list);
    }

    const answersByStepId: Record<string, Record<string, any>> = {};
    for (const state of stepStates) {
      const versionId = state.latest_submission_version_id;
      if (!versionId) continue;
      const baseAnswers = submissionsById.get(versionId) ?? {};
      const effectiveAnswers = this.applyPatches(
        baseAnswers,
        patchesByVersionId.get(versionId) ?? [],
      );
      answersByStepId[state.step_id] = effectiveAnswers;
    }

    return answersByStepId;
  }

  private async getEffectiveAnswersBySubmissionVersionIds(
    submissionVersionIds: string[],
  ): Promise<Map<string, Record<string, any>>> {
    if (submissionVersionIds.length === 0) return new Map();

    const [submissions, patches] = await this.prisma.$transaction([
      this.prisma.step_submission_versions.findMany({
        where: { id: { in: submissionVersionIds } },
        select: { id: true, answers_snapshot: true },
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

    const patchesByVersionId = new Map<string, Array<{ ops: any }>>();
    for (const patch of patches) {
      const list = patchesByVersionId.get(patch.submission_version_id) ?? [];
      list.push({ ops: patch.ops });
      patchesByVersionId.set(patch.submission_version_id, list);
    }

    const effectiveByVersionId = new Map<string, Record<string, any>>();
    for (const submission of submissions) {
      const baseAnswers = this.normalizeAnswersShape(
        submission.answers_snapshot as Record<string, any>,
      );
      const effectiveAnswers = this.applyPatches(
        baseAnswers,
        patchesByVersionId.get(submission.id) ?? [],
      );
      effectiveByVersionId.set(submission.id, effectiveAnswers);
    }

    return effectiveByVersionId;
  }

  private collectFileObjectIds(value: unknown, target: Set<string>): void {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      for (const entry of value) {
        this.collectFileObjectIds(entry, target);
      }
      return;
    }

    if (typeof value === 'string') {
      if (this.isUuidV4(value)) target.add(value);
      return;
    }

    if (typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    const maybeFileObjectId = record.fileObjectId;
    if (typeof maybeFileObjectId === 'string') {
      target.add(maybeFileObjectId);
    }

    const maybeFileObjectIds = record.fileObjectIds;
    if (Array.isArray(maybeFileObjectIds)) {
      for (const fileId of maybeFileObjectIds) {
        if (typeof fileId === 'string') target.add(fileId);
      }
    }

    for (const nestedValue of Object.values(record)) {
      this.collectFileObjectIds(nestedValue, target);
    }
  }

  private isUuidV4(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private formatProfileLinks(rawLinks: unknown): string {
    if (Array.isArray(rawLinks)) {
      return rawLinks
        .filter((link): link is string => typeof link === 'string')
        .map((link) => link.trim())
        .filter((link) => link.length > 0)
        .join(' | ');
    }

    if (typeof rawLinks === 'string') return rawLinks;
    if (!rawLinks) return '';

    try {
      return JSON.stringify(rawLinks);
    } catch {
      return '';
    }
  }

  private buildResponseHeaderLabel(
    stepTitle: string | null | undefined,
    stepIndex: number | null | undefined,
    fieldKey: string,
  ): string {
    const cleanedStepTitle = (stepTitle ?? '').trim();
    const fieldLabel = this.humanizeAnswerFieldKey(fieldKey);
    const numericStepIndex =
      typeof stepIndex === 'number' && Number.isFinite(stepIndex)
        ? Math.max(0, stepIndex)
        : undefined;
    const stepLabel =
      numericStepIndex !== undefined
        ? `Step ${String(numericStepIndex + 1)}`
        : 'Step';

    if (cleanedStepTitle) {
      return `${stepLabel} - ${cleanedStepTitle} - ${fieldLabel}`;
    }
    return `${stepLabel} - ${fieldLabel}`;
  }

  private humanizeAnswerFieldKey(fieldKey: string): string {
    const cleaned = fieldKey
      .replace(/\./g, ' ')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
    if (!cleaned) return fieldKey;

    return cleaned.replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
  }

  private serializeAnswerValueForCsv(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private toIsoString(value: unknown): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return '';
  }

  private getAppBaseUrl(): string {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    return baseUrl.replace(/\/+$/, '');
  }

  private getCredentialIssuerName(): string {
    const issuer = (process.env.CREDENTIAL_ISSUER ?? '').trim();
    if (issuer.length > 0) return issuer;
    return 'Math&Maroc Event Platform';
  }

  private getCredentialSigningSecret(): string {
    const explicit = (process.env.CREDENTIAL_SIGNING_SECRET ?? '').trim();
    if (explicit.length > 0) return explicit;
    return this.getJwtSecret();
  }

  private getCompletionCredentialLinks(
    certificateId: string,
    credentialId: string,
  ): { certificateUrl: string; verifiableCredentialUrl: string } {
    const appBaseUrl = this.getAppBaseUrl();
    return {
      certificateUrl: `${appBaseUrl}/credentials/certificate/${certificateId}`,
      verifiableCredentialUrl: `${appBaseUrl}/credentials/verify/${credentialId}`,
    };
  }

  private buildCompletionCredentialSignature(input: {
    applicationId: string;
    applicantUserId: string;
    eventId: string;
    certificateId: string;
    credentialId: string;
    issuedAt: Date;
    checkedInAt: Date;
  }): string {
    const payload = [
      input.applicationId,
      input.applicantUserId,
      input.eventId,
      input.certificateId,
      input.credentialId,
      input.issuedAt.toISOString(),
      input.checkedInAt.toISOString(),
    ].join('|');

    return createHmac('sha256', this.getCredentialSigningSecret())
      .update(payload)
      .digest('hex');
  }

  private toCompletionCredential(
    record:
      | {
          certificate_id: string;
          credential_id: string;
          issued_at: Date;
          revoked_at: Date | null;
        }
      | null
      | undefined,
  ): CompletionCredential | undefined {
    if (!record) return undefined;

    const links = this.getCompletionCredentialLinks(
      record.certificate_id,
      record.credential_id,
    );
    return {
      certificateId: record.certificate_id,
      credentialId: record.credential_id,
      certificateUrl: links.certificateUrl,
      verifiableCredentialUrl: links.verifiableCredentialUrl,
      issuedAt: record.issued_at,
      revokedAt: record.revoked_at ?? null,
      status: record.revoked_at ? 'REVOKED' : 'ISSUED',
    };
  }

  private toFilenameSafePart(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-');
    const compact = normalized.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return compact || 'event';
  }

  private csvEscape(value: unknown): string {
    const normalized =
      value === null || value === undefined ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  private buildCsv(headers: string[], rows: unknown[][]): string {
    const headerLine = headers
      .map((header) => this.csvEscape(header))
      .join(',');
    const rowLines = rows.map((row) =>
      row.map((cell) => this.csvEscape(cell)).join(','),
    );
    return [headerLine, ...rowLines].join('\n');
  }

  private applyPatches(
    baseAnswers: Record<string, any>,
    patches: Array<{ ops: any }>,
  ): Record<string, any> {
    const effective = { ...this.normalizeAnswersShape(baseAnswers) };

    for (const patch of patches) {
      const ops = Array.isArray(patch.ops) ? patch.ops : [];
      for (const op of ops) {
        if (!op || op.op !== 'replace' || typeof op.path !== 'string') {
          continue;
        }
        const fieldPath = op.path.replace(/^\//, '');
        if (!fieldPath) continue;
        effective[fieldPath] = op.value;
      }
    }

    return this.normalizeAnswersShape(effective);
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

  private buildDecisionTemplateVariables(
    application: {
      id: string;
      applicantName: string;
      applicantEmail: string;
    },
    event: { id: string; title: string; slug: string },
    status: DecisionStatus,
  ): Record<string, string> {
    const decisionLabelMap: Record<DecisionStatus, string> = {
      [DecisionStatus.NONE]: 'No decision',
      [DecisionStatus.ACCEPTED]: 'Accepted',
      [DecisionStatus.WAITLISTED]: 'Waitlisted',
      [DecisionStatus.REJECTED]: 'Rejected',
    };

    return {
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      applicationId: application.id,
      eventTitle: event.title,
      eventSlug: event.slug,
      eventId: event.id,
      decisionStatus: status,
      decisionLabel: decisionLabelMap[status] ?? status,
    };
  }

  private renderDecisionTemplateString(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
      const value = variables[key];
      return value !== undefined ? value : '';
    });
  }

  private readBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (typeof value === 'number') return value !== 0;
    return fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readTemplateText(
    value: unknown,
    fallback: string,
    maxLength: number,
  ): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.length <= maxLength
      ? trimmed
      : trimmed.slice(0, maxLength).trim();
  }

  private readHexColor(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return ApplicationsService.HEX_COLOR_PATTERN.test(trimmed)
      ? trimmed
      : fallback;
  }

  private getCredentialPublishModeFromCheckinConfig(
    checkinConfig: Record<string, unknown>,
  ): 'checkin' | 'manual' {
    const certificate = this.toRecord(checkinConfig.certificate);
    const rawMode =
      typeof certificate.publishMode === 'string'
        ? certificate.publishMode.trim().toLowerCase()
        : '';
    return rawMode === 'manual' ? 'manual' : 'checkin';
  }

  private async getCredentialPublishMode(
    eventId: string,
  ): Promise<'checkin' | 'manual'> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { checkin_config: true },
    });
    const checkinConfig = this.toRecord(event?.checkin_config);
    return this.getCredentialPublishModeFromCheckinConfig(checkinConfig);
  }

  private getCertificateTemplateFromCheckinConfig(
    checkinConfig: Record<string, unknown>,
  ): {
    text: {
      title: string;
      subtitle: string;
      completionText: string;
      footerText: string;
    };
    style: {
      primaryColor: string;
      secondaryColor: string;
      backgroundColor: string;
      textColor: string;
      borderColor: string;
    };
  } {
    const certificate = this.toRecord(checkinConfig.certificate);
    const template = this.toRecord(certificate.template);
    const text = this.toRecord(template.text);
    const style = this.toRecord(template.style);

    const defaults = ApplicationsService.DEFAULT_CERTIFICATE_TEMPLATE;

    return {
      text: {
        title: this.readTemplateText(text.title, defaults.text.title, 120),
        subtitle: this.readTemplateText(
          text.subtitle,
          defaults.text.subtitle,
          200,
        ),
        completionText: this.readTemplateText(
          text.completionText,
          defaults.text.completionText,
          240,
        ),
        footerText: this.readTemplateText(
          text.footerText,
          defaults.text.footerText,
          300,
        ),
      },
      style: {
        primaryColor: this.readHexColor(
          style.primaryColor,
          defaults.style.primaryColor,
        ),
        secondaryColor: this.readHexColor(
          style.secondaryColor,
          defaults.style.secondaryColor,
        ),
        backgroundColor: this.readHexColor(
          style.backgroundColor,
          defaults.style.backgroundColor,
        ),
        textColor: this.readHexColor(style.textColor, defaults.style.textColor),
        borderColor: this.readHexColor(
          style.borderColor,
          defaults.style.borderColor,
        ),
      },
    };
  }

  async getCompletionCredentialForApplication(
    eventId: string,
    applicationId: string,
  ): Promise<CompletionCredential | null> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: {
        id: true,
        attendance_records: {
          select: {
            status: true,
            checked_in_at: true,
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');

    const existing = await (this.prisma as any).completion_credentials.findUnique({
      where: { application_id: applicationId },
      select: {
        certificate_id: true,
        credential_id: true,
        issued_at: true,
        revoked_at: true,
      },
    });
    if (existing) {
      return this.toCompletionCredential(existing) ?? null;
    }

    if (
      app.attendance_records?.status === 'CHECKED_IN' &&
      app.attendance_records.checked_in_at
    ) {
      const publishMode = await this.getCredentialPublishMode(eventId);
      if (publishMode === 'checkin') {
        return this.issueCompletionCredential(eventId, applicationId, {
          checkedInAt: app.attendance_records.checked_in_at,
        });
      }
    }

    return null;
  }

  async issueCompletionCredential(
    eventId: string,
    applicationId: string,
    options?: { checkedInAt?: Date | null },
  ): Promise<CompletionCredential> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: {
        id: true,
        event_id: true,
        applicant_user_id: true,
        attendance_records: {
          select: {
            status: true,
            checked_in_at: true,
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');

    if (
      app.attendance_records?.status !== 'CHECKED_IN' ||
      !app.attendance_records.checked_in_at
    ) {
      throw new BadRequestException(
        'Completion credential can only be issued after check-in',
      );
    }

    const checkedInAt = options?.checkedInAt ?? app.attendance_records.checked_in_at;
    const existing = await (this.prisma as any).completion_credentials.findUnique({
      where: { application_id: applicationId },
      select: {
        certificate_id: true,
        credential_id: true,
        issued_at: true,
        revoked_at: true,
      },
    });

    const certificateId = existing?.certificate_id ?? crypto.randomUUID();
    const credentialId = existing?.credential_id ?? crypto.randomUUID();
    const issuedAt =
      !existing || existing.revoked_at ? checkedInAt : existing.issued_at;

    const signature = this.buildCompletionCredentialSignature({
      applicationId,
      applicantUserId: app.applicant_user_id,
      eventId,
      certificateId,
      credentialId,
      issuedAt,
      checkedInAt,
    });

    const now = new Date();
    const record = existing
      ? await (this.prisma as any).completion_credentials.update({
          where: { application_id: applicationId },
          data: {
            event_id: eventId,
            credential_signature: signature,
            issued_at: issuedAt,
            revoked_at: null,
            updated_at: now,
          },
          select: {
            certificate_id: true,
            credential_id: true,
            issued_at: true,
            revoked_at: true,
          },
        })
      : await (this.prisma as any).completion_credentials.create({
          data: {
            application_id: applicationId,
            event_id: eventId,
            certificate_id: certificateId,
            credential_id: credentialId,
            credential_signature: signature,
            issued_at: issuedAt,
            revoked_at: null,
            created_at: now,
            updated_at: now,
          },
          select: {
            certificate_id: true,
            credential_id: true,
            issued_at: true,
            revoked_at: true,
          },
        });

    const credential = this.toCompletionCredential(record);
    if (!credential) {
      throw new Error('Failed to create completion credential');
    }
    return credential;
  }

  async issueCompletionCredentialsBulk(
    eventId: string,
    applicationIds: string[],
  ): Promise<{
    requested: number;
    issued: number;
    alreadyIssued: number;
    skippedNotCheckedIn: number;
    notFound: string[];
    failed: Array<{ applicationId: string; reason: string }>;
  }> {
    const uniqueIds = Array.from(
      new Set(
        applicationIds
          .map((id) => String(id).trim())
          .filter((id) => id.length > 0),
      ),
    );

    if (uniqueIds.length === 0) {
      return {
        requested: 0,
        issued: 0,
        alreadyIssued: 0,
        skippedNotCheckedIn: 0,
        notFound: [],
        failed: [],
      };
    }

    const applications = await (this.prisma as any).applications.findMany({
      where: {
        event_id: eventId,
        id: { in: uniqueIds },
      },
      include: {
        attendance_records: {
          select: {
            status: true,
            checked_in_at: true,
          },
        },
        completion_credentials: {
          select: {
            revoked_at: true,
          },
        },
      },
    });

    const byId = new Map<string, any>(
      applications.map((application: any) => [application.id, application]),
    );
    const notFound: string[] = [];
    const failed: Array<{ applicationId: string; reason: string }> = [];
    let issued = 0;
    let alreadyIssued = 0;
    let skippedNotCheckedIn = 0;

    for (const applicationId of uniqueIds) {
      const application = byId.get(applicationId);
      if (!application) {
        notFound.push(applicationId);
        continue;
      }

      if (
        application.completion_credentials &&
        application.completion_credentials.revoked_at === null
      ) {
        alreadyIssued += 1;
        continue;
      }

      const checkedInAt = application.attendance_records?.checked_in_at ?? null;
      const isCheckedIn =
        application.attendance_records?.status === 'CHECKED_IN' && checkedInAt;

      if (!isCheckedIn) {
        skippedNotCheckedIn += 1;
        continue;
      }

      try {
        await this.issueCompletionCredential(eventId, applicationId, {
          checkedInAt,
        });
        issued += 1;
      } catch (error) {
        const reason =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to issue credential';
        failed.push({ applicationId, reason });
      }
    }

    return {
      requested: uniqueIds.length,
      issued,
      alreadyIssued,
      skippedNotCheckedIn,
      notFound,
      failed,
    };
  }

  async revokeCompletionCredential(
    eventId: string,
    applicationId: string,
  ): Promise<void> {
    const now = new Date();
    await (this.prisma as any).completion_credentials.updateMany({
      where: {
        application_id: applicationId,
        event_id: eventId,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
        updated_at: now,
      },
    });
  }

  async getPublicCertificate(certificateId: string): Promise<any> {
    const record = await (this.prisma as any).completion_credentials.findUnique({
      where: { certificate_id: certificateId },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            start_at: true,
            end_at: true,
            venue_name: true,
            venue_address: true,
            checkin_config: true,
          },
        },
        applications: {
          select: {
            id: true,
            applicant_user_id: true,
            attendance_records: {
              select: {
                checked_in_at: true,
              },
            },
            users_applications_applicant_user_idTousers: {
              select: {
                applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
              },
            },
          },
        },
      },
    });

    if (!record) throw new NotFoundException('Certificate not found');

    const attendeeName =
      ApplicationsService.getDisplayName(record.applications.users_applications_applicant_user_idTousers?.applicant_profiles) || 'Attendee';
    const checkedInAt =
      record.applications.attendance_records?.checked_in_at ?? record.issued_at;
    const links = this.getCompletionCredentialLinks(
      record.certificate_id,
      record.credential_id,
    );
    const location =
      record.events.venue_name?.trim() ||
      record.events.venue_address?.trim() ||
      undefined;
    const checkinConfig = this.toRecord(record.events.checkin_config);
    const template = this.getCertificateTemplateFromCheckinConfig(checkinConfig);

    return {
      certificateId: record.certificate_id,
      credentialId: record.credential_id,
      status: record.revoked_at ? 'REVOKED' : 'ISSUED',
      issuedAt: record.issued_at,
      checkedInAt,
      revokedAt: record.revoked_at,
      issuer: this.getCredentialIssuerName(),
      certificateUrl: links.certificateUrl,
      verifiableCredentialUrl: links.verifiableCredentialUrl,
      event: {
        id: record.events.id,
        title: record.events.title,
        slug: record.events.slug,
        status: record.events.status,
        startAt: record.events.start_at,
        endAt: record.events.end_at,
        location,
      },
      recipient: {
        name: attendeeName,
      },
      verification: {
        algorithm: 'HMAC-SHA256',
        signature: record.credential_signature,
      },
      template,
    };
  }

  async verifyCredential(credentialId: string): Promise<any> {
    const record = await (this.prisma as any).completion_credentials.findUnique({
      where: { credential_id: credentialId },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
          },
        },
        applications: {
          select: {
            id: true,
            applicant_user_id: true,
            attendance_records: {
              select: {
                checked_in_at: true,
              },
            },
            users_applications_applicant_user_idTousers: {
              select: {
                applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
              },
            },
          },
        },
      },
    });

    if (!record) throw new NotFoundException('Credential not found');

    const checkedInAt =
      record.applications.attendance_records?.checked_in_at ?? record.issued_at;
    const expectedSignature = this.buildCompletionCredentialSignature({
      applicationId: record.application_id,
      applicantUserId: record.applications.applicant_user_id,
      eventId: record.event_id,
      certificateId: record.certificate_id,
      credentialId: record.credential_id,
      issuedAt: record.issued_at,
      checkedInAt,
    });
    const signatureValid = expectedSignature === record.credential_signature;
    const isRevoked = Boolean(record.revoked_at);
    const eventStatus = String(record.events.status ?? '').toLowerCase();
    const isArchivedEvent = eventStatus === 'archived';
    // Archived events remain valid for verification as long as the credential itself is intact.
    const valid = signatureValid && !isRevoked;
    const links = this.getCompletionCredentialLinks(
      record.certificate_id,
      record.credential_id,
    );

    return {
      valid,
      status: isRevoked ? 'REVOKED' : signatureValid ? 'VALID' : 'INVALID',
      issuer: this.getCredentialIssuerName(),
      issuedAt: record.issued_at,
      revokedAt: record.revoked_at,
      certificateUrl: links.certificateUrl,
      verifiableCredentialUrl: links.verifiableCredentialUrl,
      credential: {
        id: record.credential_id,
        certificateId: record.certificate_id,
        applicationId: record.application_id,
        event: {
          id: record.events.id,
          title: record.events.title,
          slug: record.events.slug,
          status: record.events.status,
        },
        recipient: {
          name:
            ApplicationsService.getDisplayName(record.applications.users_applications_applicant_user_idTousers?.applicant_profiles) || 'Attendee',
        },
        checkedInAt,
      },
      eventArchived: isArchivedEvent,
      verification: {
        algorithm: 'HMAC-SHA256',
        signature: record.credential_signature,
        signatureValid,
      },
    };
  }

  /**
   * Confirm attendance for an application (Applicant or Admin)
   */
  async confirmAttendance(
    eventId: string,
    applicationId: string,
  ): Promise<{ qrToken: string }> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { checkin_config: true },
    });
    const checkinConfig =
      (event?.checkin_config as Record<string, unknown>) ?? {};
    if (!this.readBoolean(checkinConfig.enabled, false)) {
      throw new ForbiddenException('Check-in is disabled for this event');
    }

    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      include: { attendance_records: true },
    });

    if (!app) throw new NotFoundException('Application not found');

    const allowSelfCheckin = this.readBoolean(
      checkinConfig.allowSelfCheckin,
      false,
    );
    const actorId = this.cls.get('actorId');
    if (actorId && actorId === app.applicant_user_id && !allowSelfCheckin) {
      throw new ForbiddenException('Self check-in is disabled for this event');
    }

    // Check decision status
    if (
      app.decision_status !== DecisionStatus.ACCEPTED ||
      app.decision_published_at === null
    ) {
      throw new ForbiddenException('Application not accepted');
    }

    await this.ensureConfirmationApprovedBeforeTicket(eventId, applicationId);

    const now = new Date();
    // Generate JTI if not exists
    let jti = app.attendance_records?.qr_token_hash;

    if (!jti) {
      jti = crypto.randomUUID();

      // Upsert attendance record
      await this.prisma.attendance_records.upsert({
        where: { application_id: applicationId },
        create: {
          application_id: applicationId,
          confirmed_at: now,
          qr_token_hash: jti, // Storing JTI as the "hash" logic
          status: 'CONFIRMED',
        },
        update: {
          confirmed_at: now, // Re-confirming updates timestamp?
          qr_token_hash: jti,
          status: 'CONFIRMED',
        },
      });
    } else {
      // Ensure confirmed_at is set if it was somehow null but JTI existed
      if (!app.attendance_records?.confirmed_at) {
        await this.prisma.attendance_records.update({
          where: { application_id: applicationId },
          data: { confirmed_at: now, status: 'CONFIRMED' },
        });
      }
    }

    // Generate Token
    // Payload: { sub: appId, eventId, jti, type: 'checkin' }
    return {
      qrToken: this.signQrToken(
        applicationId,
        eventId,
        jti,
        this.getJwtSecret(),
      ),
    };
  }

  /**
   * Get existing ticket (QR Token)
   */
  async getTicket(
    eventId: string,
    applicationId: string,
  ): Promise<{ qrToken: string }> {
    await this.ensureConfirmationApprovedBeforeTicket(eventId, applicationId);

    const record = await this.prisma.attendance_records.findUnique({
      where: { application_id: applicationId },
    });

    if (!record || !record.qr_token_hash) {
      throw new NotFoundException('Ticket not confirmed');
    }

    return {
      qrToken: this.signQrToken(
        applicationId,
        eventId,
        record.qr_token_hash,
        this.getJwtSecret(),
      ),
    };
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable must be configured');
    }
    return secret;
  }

  private signQrToken(
    appId: string,
    eventId: string,
    jti: string,
    secret: string,
  ): string {
    return jwt.sign(
      { sub: appId, eventId, jti, type: 'checkin' },
      secret,
      { expiresIn: '30d' }, // Long expiry for convenience
    );
  }
}
