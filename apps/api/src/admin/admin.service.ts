import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventRole } from '@event-platform/shared';
import { PasswordResetService } from '../auth/password-reset.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

export interface AuditEntry {
  id: string;
  action: string;
  category?: string;
  actorEmail: string;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffMember {
  id: string;
  email: string;
  fullName?: string;
  role: string;
  eventName?: string;
  eventId?: string;
  assignedAt: string;
  accessStartAt?: string | null;
  accessEndAt?: string | null;
  isGlobalAdmin?: boolean;
  invitationSent?: boolean;
  inviteStatus?: 'NONE' | 'SENT' | 'FAILED' | 'EXPIRED';
  inviteFailureReason?: string | null;
  inviteLastAttemptAt?: string | null;
  inviteLastSentAt?: string | null;
  inviteLastExpiresAt?: string | null;
}

export interface AdminStats {
  totals: {
    users: number;
    applicants: number;
    nonApplicants: number;
    disabledUsers: number;
    verifiedUsers: number;
    profilesWithFullName: number;
    profilesWithPhone: number;
    profilesWithEducation: number;
    profilesWithInstitution: number;
    profilesWithLocation: number;
    profilesWithLinks: number;
    events: number;
    activeEvents: number;
    publishedEvents: number;
    draftEvents: number;
    archivedEvents: number;
    applications: number;
    checkedIn: number;
  };
  applicationsByDecision: {
    none: number;
    accepted: number;
    waitlisted: number;
    rejected: number;
  };
  topCountries: Array<{
    country: string;
    count: number;
  }>;
  topCities: Array<{
    city: string;
    country?: string;
    count: number;
  }>;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName?: string;
  country?: string;
  city?: string;
  educationLevel?: string;
  institution?: string;
  hasPhone: boolean;
  hasLinks: boolean;
  profileCompleteness: number;
  isDisabled: boolean;
  emailVerifiedAt?: string;
  createdAt: string;
  applicationCount: number;
  eventCount: number;
  lastApplicationAt?: string;
}

export interface AdminUserListResponse {
  data: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminEventStats {
  id: string;
  title: string;
  slug: string;
  status: string;
  createdAt: string;
  capacity?: number;
  totalApplications: number;
  decisionCounts: {
    none: number;
    accepted: number;
    waitlisted: number;
    rejected: number;
  };
  staffAssignments: number;
  checkedIn: number;
}

export interface AdminEventStatsResponse {
  data: AdminEventStats[];
  total: number;
  page: number;
  pageSize: number;
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function hasFilledValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some((entry) => hasFilledValue(entry));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      hasFilledValue(entry),
    );
  }
  return false;
}

function parseOptionalDateInput(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }
  return undefined;
}

function resolveInviteStatus(
  inviteStatus: unknown,
  inviteLastExpiresAt: Date | null,
): 'NONE' | 'SENT' | 'FAILED' | 'EXPIRED' {
  const normalized = String(inviteStatus ?? 'NONE')
    .trim()
    .toUpperCase();
  if (normalized === 'FAILED') return 'FAILED';
  if (normalized === 'SENT') {
    if (
      inviteLastExpiresAt instanceof Date &&
      !Number.isNaN(inviteLastExpiresAt.getTime()) &&
      inviteLastExpiresAt.getTime() <= Date.now()
    ) {
      return 'EXPIRED';
    }
    return 'SENT';
  }
  return 'NONE';
}

function isRoleAssignmentActiveNow(assignment: {
  access_start_at: Date | null;
  access_end_at: Date | null;
}): boolean {
  const now = Date.now();
  if (assignment.access_start_at && assignment.access_start_at.getTime() > now) {
    return false;
  }
  if (assignment.access_end_at && assignment.access_end_at.getTime() < now) {
    return false;
  }
  return true;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /* ================================================================ */
  /*  Overview                                                         */
  /* ================================================================ */

  async getOverview() {
    const [
      totalEvents,
      activeEvents,
      totalUsers,
      totalApplications,
      totalStaffAssignments,
      totalStaffUsers,
      recentEventsRaw,
    ] = await Promise.all([
      this.prisma.events.count(),
      this.prisma.events.count({ where: { start_at: { gt: new Date() } } }),
      this.prisma.users.count(),
      this.prisma.applications.count(),
      this.prisma.event_role_assignments.count(),
      this.prisma.users.count({
        where: {
          OR: [
            { is_global_admin: true },
            { event_role_assignments: { some: {} } },
          ],
        },
      }),
      this.prisma.events.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: { applications: true },
          },
        },
      }),
    ]);

    const recentEvents = recentEventsRaw.map((event) => ({
      id: event.id,
      name: event.title,
      applicationCount: event._count.applications,
      isPublished: event.status === 'published',
      createdAt: event.created_at.toISOString(),
    }));

    return {
      totalEvents,
      activeEvents,
      totalUsers,
      totalApplications,
      totalStaff: totalStaffUsers,
      totalStaffAssignments,
      recentEvents,
    };
  }

  /* ================================================================ */
  /*  Global Stats                                                     */
  /* ================================================================ */

  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const nonStaffUserWhere = {
      is_global_admin: false,
      event_role_assignments: { none: {} },
    };
    const nonStaffApplicationWhere = {
      users_applications_applicant_user_idTousers: nonStaffUserWhere,
    };
    const [
      totalUsers,
      disabledUsers,
      verifiedUsers,
      applicants,
      nonApplicants,
      totalEvents,
      activeEvents,
      eventStatusCounts,
      totalApplications,
      decisionCounts,
      checkedIn,
      profiles,
    ] = await Promise.all([
      this.prisma.users.count({ where: nonStaffUserWhere }),
      this.prisma.users.count({
        where: { ...nonStaffUserWhere, is_disabled: true },
      }),
      this.prisma.users.count({
        where: { ...nonStaffUserWhere, email_verified_at: { not: null } },
      }),
      this.prisma.users.count({
        where: {
          ...nonStaffUserWhere,
          applications_applications_applicant_user_idTousers: { some: {} },
        },
      }),
      this.prisma.users.count({
        where: {
          ...nonStaffUserWhere,
          applications_applications_applicant_user_idTousers: { none: {} },
        },
      }),
      this.prisma.events.count(),
      this.prisma.events.count({ where: { start_at: { gt: now } } }),
      this.prisma.events.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.applications.count({
        where: nonStaffApplicationWhere,
      }),
      this.prisma.applications.groupBy({
        by: ['decision_status'],
        where: nonStaffApplicationWhere,
        _count: { id: true },
      }),
      this.prisma.attendance_records.count({
        where: {
          status: 'CHECKED_IN',
          applications: nonStaffApplicationWhere,
        },
      }),
      this.prisma.applicant_profiles.findMany({
        where: {
          users: nonStaffUserWhere,
        },
        select: {
          full_name: true,
          phone: true,
          education_level: true,
          institution: true,
          city: true,
          country: true,
          links: true,
        },
      }),
    ]);

    const eventStatusMap: Record<string, number> = {
      published: 0,
      draft: 0,
      archived: 0,
    };
    for (const row of eventStatusCounts) {
      eventStatusMap[row.status] = row._count.id;
    }

    const decisionMap: Record<string, number> = {
      NONE: 0,
      ACCEPTED: 0,
      WAITLISTED: 0,
      REJECTED: 0,
    };
    for (const row of decisionCounts) {
      decisionMap[row.decision_status] = row._count.id;
    }

    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<
      string,
      { city: string; country?: string; count: number }
    >();
    let profilesWithFullName = 0;
    let profilesWithPhone = 0;
    let profilesWithEducation = 0;
    let profilesWithInstitution = 0;
    let profilesWithLocation = 0;
    let profilesWithLinks = 0;

    for (const profile of profiles) {
      const fullName = normalizeOptionalText(profile.full_name);
      const phone = normalizeOptionalText(profile.phone);
      const educationLevel = normalizeOptionalText(profile.education_level);
      const institution = normalizeOptionalText(profile.institution);
      const country = normalizeOptionalText(profile.country);
      const city = normalizeOptionalText(profile.city);
      const linksPopulated = hasFilledValue(profile.links);

      if (fullName) profilesWithFullName += 1;
      if (phone) profilesWithPhone += 1;
      if (educationLevel) profilesWithEducation += 1;
      if (institution) profilesWithInstitution += 1;
      if (country || city) profilesWithLocation += 1;
      if (linksPopulated) profilesWithLinks += 1;

      if (country) {
        countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
      }

      if (city) {
        const cityKey = `${city.toLowerCase()}|${(country ?? '').toLowerCase()}`;
        const existingCity = cityCounts.get(cityKey);
        if (existingCity) {
          existingCity.count += 1;
        } else {
          cityCounts.set(cityKey, { city, country, count: 1 });
        }
      }
    }

    const topCountries = Array.from(countryCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
      .slice(0, 8);

    const topCities = Array.from(cityCounts.values())
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.city.localeCompare(b.city) ||
          (a.country ?? '').localeCompare(b.country ?? ''),
      )
      .slice(0, 8);

    return {
      totals: {
        users: totalUsers,
        applicants,
        nonApplicants,
        disabledUsers,
        verifiedUsers,
        profilesWithFullName,
        profilesWithPhone,
        profilesWithEducation,
        profilesWithInstitution,
        profilesWithLocation,
        profilesWithLinks,
        events: totalEvents,
        activeEvents,
        publishedEvents: eventStatusMap.published ?? 0,
        draftEvents: eventStatusMap.draft ?? 0,
        archivedEvents: eventStatusMap.archived ?? 0,
        applications: totalApplications,
        checkedIn,
      },
      applicationsByDecision: {
        none: decisionMap.NONE ?? 0,
        accepted: decisionMap.ACCEPTED ?? 0,
        waitlisted: decisionMap.WAITLISTED ?? 0,
        rejected: decisionMap.REJECTED ?? 0,
      },
      topCountries,
      topCities,
    };
  }

  /* ================================================================ */
  /*  Users & Applicants                                               */
  /* ================================================================ */

  async getUsers(params: {
    page: number;
    pageSize: number;
    search?: string;
    filter?: string;
  }): Promise<AdminUserListResponse> {
    const { page, pageSize, search, filter } = params;
    const safePage = Number.isFinite(page) ? Math.max(page, 1) : 1;
    const safePageSize = Number.isFinite(pageSize)
      ? Math.min(Math.max(pageSize, 1), 100)
      : 25;
    const skip = (safePage - 1) * safePageSize;

    const and: any[] = [
      { is_global_admin: false },
      { event_role_assignments: { none: {} } },
    ];

    if (search) {
      and.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          {
            applicant_profiles: {
              is: { full_name: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            applicant_profiles: {
              is: { city: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            applicant_profiles: {
              is: { country: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            applicant_profiles: {
              is: {
                education_level: { contains: search, mode: 'insensitive' },
              },
            },
          },
          {
            applicant_profiles: {
              is: { institution: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    if (filter && filter !== 'all') {
      if (filter === 'disabled') {
        and.push({ is_disabled: true });
      } else if (filter === 'applicants') {
        and.push({
          applications_applications_applicant_user_idTousers: { some: {} },
        });
      } else if (filter === 'non_applicants') {
        and.push({
          applications_applications_applicant_user_idTousers: { none: {} },
        });
      } else if (filter === 'verified') {
        and.push({ email_verified_at: { not: null } });
      } else if (filter === 'unverified') {
        and.push({ email_verified_at: null });
      }
    }

    const where = { AND: and };

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: safePageSize,
        select: {
          id: true,
          email: true,
          is_disabled: true,
          email_verified_at: true,
          created_at: true,
          applicant_profiles: {
            select: {
              full_name: true,
              phone: true,
              education_level: true,
              institution: true,
              city: true,
              country: true,
              links: true,
            },
          },
        },
      }),
      this.prisma.users.count({ where }),
    ]);

    if (users.length === 0) {
      return { data: [], total, page: safePage, pageSize: safePageSize };
    }

    const userIds = users.map((u) => u.id);

    const [applicationAgg, appEvents] = await Promise.all([
      this.prisma.applications.groupBy({
        by: ['applicant_user_id'],
        where: { applicant_user_id: { in: userIds } },
        _count: { id: true },
        _max: { updated_at: true, created_at: true },
      }),
      this.prisma.applications.findMany({
        where: { applicant_user_id: { in: userIds } },
        select: { applicant_user_id: true, event_id: true },
      }),
    ]);

    const applicationMap = new Map<
      string,
      { count: number; lastApplicationAt?: string }
    >();
    for (const row of applicationAgg) {
      const last = row._max.updated_at ?? row._max.created_at ?? undefined;
      applicationMap.set(row.applicant_user_id, {
        count: row._count.id,
        lastApplicationAt: last ? last.toISOString() : undefined,
      });
    }

    const eventMap = new Map<string, Set<string>>();
    for (const row of appEvents) {
      const existing = eventMap.get(row.applicant_user_id) ?? new Set<string>();
      existing.add(row.event_id);
      eventMap.set(row.applicant_user_id, existing);
    }

    const data: AdminUserSummary[] = users.map((user) => {
      const applicationInfo = applicationMap.get(user.id);
      const fullName = normalizeOptionalText(
        user.applicant_profiles?.full_name,
      );
      const city = normalizeOptionalText(user.applicant_profiles?.city);
      const country = normalizeOptionalText(user.applicant_profiles?.country);
      const educationLevel = normalizeOptionalText(
        user.applicant_profiles?.education_level,
      );
      const institution = normalizeOptionalText(
        user.applicant_profiles?.institution,
      );
      const hasPhone = !!normalizeOptionalText(user.applicant_profiles?.phone);
      const hasLinks = hasFilledValue(user.applicant_profiles?.links);
      const completedProfileFields = [
        Boolean(fullName),
        hasPhone,
        Boolean(educationLevel),
        Boolean(institution),
        Boolean(city || country),
        hasLinks,
      ].filter(Boolean).length;

      return {
        id: user.id,
        email: user.email,
        fullName,
        city,
        country,
        educationLevel,
        institution,
        hasPhone,
        hasLinks,
        profileCompleteness: Math.round((completedProfileFields / 6) * 100),
        isDisabled: user.is_disabled ?? false,
        emailVerifiedAt: user.email_verified_at
          ? user.email_verified_at.toISOString()
          : undefined,
        createdAt: user.created_at.toISOString(),
        applicationCount: applicationInfo?.count ?? 0,
        eventCount: eventMap.get(user.id)?.size ?? 0,
        lastApplicationAt: applicationInfo?.lastApplicationAt,
      };
    });

    return { data, total, page: safePage, pageSize: safePageSize };
  }

  async exportUsersCsv(params?: {
    search?: string;
    filter?: string;
  }): Promise<{ filename: string; csv: string }> {
    const search = params?.search?.trim();
    const filter = params?.filter?.trim();

    const and: any[] = [
      { is_global_admin: false },
      { event_role_assignments: { none: {} } },
    ];

    if (search) {
      and.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          {
            applicant_profiles: {
              is: { full_name: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            applicant_profiles: {
              is: { city: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            applicant_profiles: {
              is: { country: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            applicant_profiles: {
              is: {
                education_level: { contains: search, mode: 'insensitive' },
              },
            },
          },
          {
            applicant_profiles: {
              is: { institution: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    if (filter && filter !== 'all') {
      if (filter === 'disabled') {
        and.push({ is_disabled: true });
      } else if (filter === 'applicants') {
        and.push({
          applications_applications_applicant_user_idTousers: { some: {} },
        });
      } else if (filter === 'non_applicants') {
        and.push({
          applications_applications_applicant_user_idTousers: { none: {} },
        });
      } else if (filter === 'verified') {
        and.push({ email_verified_at: { not: null } });
      } else if (filter === 'unverified') {
        and.push({ email_verified_at: null });
      }
    }

    const where = { AND: and };

    const users = await this.prisma.users.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        email: true,
        is_disabled: true,
        email_verified_at: true,
        created_at: true,
        updated_at: true,
        applicant_profiles: {
          select: {
            full_name: true,
            phone: true,
            education_level: true,
            institution: true,
            city: true,
            country: true,
            links: true,
          },
        },
      },
    });

    const userIds = users.map((user) => user.id);
    const applications = userIds.length
      ? await this.prisma.applications.findMany({
          where: { applicant_user_id: { in: userIds } },
          orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            event_id: true,
            applicant_user_id: true,
            decision_status: true,
            decision_published_at: true,
            tags: true,
            created_at: true,
            updated_at: true,
            events: {
              select: {
                id: true,
                slug: true,
                title: true,
                status: true,
                start_at: true,
                end_at: true,
              },
            },
            application_step_states: {
              select: {
                step_id: true,
                status: true,
                latest_submission_version_id: true,
                workflow_steps: {
                  select: {
                    step_index: true,
                    title: true,
                  },
                },
              },
            },
            attendance_records: {
              select: {
                status: true,
              },
            },
          },
        })
      : [];

    const latestSubmissionVersionIds = Array.from(
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
        latestSubmissionVersionIds,
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
        const versionId = stepState.latest_submission_version_id;
        if (!versionId) continue;
        const effectiveAnswers = this.normalizeAnswersShape(
          effectiveAnswersBySubmissionVersionId.get(versionId),
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
          where: { id: { in: allFileIds } },
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

    const applicationsByUserId = new Map<string, typeof applications>();
    for (const application of applications) {
      const existing =
        applicationsByUserId.get(application.applicant_user_id) ?? [];
      existing.push(application);
      applicationsByUserId.set(application.applicant_user_id, existing);
    }

    const appBaseUrl = this.getAppBaseUrl();
    const headers = [
      'userId',
      'email',
      'fullName',
      'phone',
      'educationLevel',
      'institution',
      'city',
      'country',
      'profileLinks',
      'profileCompleteness',
      'hasPhone',
      'hasLinks',
      'isDisabled',
      'emailVerifiedAt',
      'userCreatedAt',
      'userUpdatedAt',
      'totalApplicationsForUser',
      'totalEventsForUser',
      'lastApplicationAt',
      'allEventSlugsForUser',
      'allEventTitlesForUser',
      'applicationId',
      'eventId',
      'eventSlug',
      'eventTitle',
      'eventStatus',
      'eventStartAt',
      'eventEndAt',
      'decisionStatus',
      'decisionPublishedAt',
      'derivedStatus',
      'tags',
      'stepStatuses',
      'uploadedFileCount',
      'uploadedFileIds',
      'uploadedFiles',
      'staffApplicationPath',
      'adminApplicationPath',
      'staffApplicationUrl',
      'adminApplicationUrl',
      'applicationCreatedAt',
      'applicationUpdatedAt',
      ...responseHeaders,
    ];

    const rows: unknown[][] = [];
    for (const user of users) {
      const profile = user.applicant_profiles;
      const fullName = normalizeOptionalText(profile?.full_name);
      const phone = normalizeOptionalText(profile?.phone);
      const educationLevel = normalizeOptionalText(profile?.education_level);
      const institution = normalizeOptionalText(profile?.institution);
      const city = normalizeOptionalText(profile?.city);
      const country = normalizeOptionalText(profile?.country);
      const hasPhone = Boolean(phone);
      const hasLinks = hasFilledValue(profile?.links);
      const profileCompleteness = Math.round(
        ([
          Boolean(fullName),
          hasPhone,
          Boolean(educationLevel),
          Boolean(institution),
          Boolean(city || country),
          hasLinks,
        ].filter(Boolean).length /
          6) *
          100,
      );

      const userApplications = applicationsByUserId.get(user.id) ?? [];
      const allEventSlugs = Array.from(
        new Set(
          userApplications
            .map((application) => application.events?.slug)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const allEventTitles = Array.from(
        new Set(
          userApplications
            .map((application) => application.events?.title)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const lastApplicationAt = userApplications.reduce<Date | undefined>(
        (latest, application) => {
          const candidate = application.updated_at ?? application.created_at;
          if (!candidate) return latest;
          if (!latest || candidate > latest) return candidate;
          return latest;
        },
        undefined,
      );

      const sharedUserColumns: unknown[] = [
        user.id,
        user.email,
        fullName ?? '',
        phone ?? '',
        educationLevel ?? '',
        institution ?? '',
        city ?? '',
        country ?? '',
        this.formatProfileLinks(profile?.links),
        profileCompleteness,
        hasPhone,
        hasLinks,
        user.is_disabled ?? false,
        this.toIsoString(user.email_verified_at),
        this.toIsoString(user.created_at),
        this.toIsoString(user.updated_at),
        userApplications.length,
        allEventSlugs.length,
        this.toIsoString(lastApplicationAt),
        allEventSlugs.join(' | '),
        allEventTitles.join(' | '),
      ];

      if (userApplications.length === 0) {
        rows.push([
          ...sharedUserColumns,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          0,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ...responseColumnKeys.map(() => ''),
        ]);
        continue;
      }

      for (const application of userApplications) {
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

        const staffApplicationPath = `/staff/${application.event_id}/applications/${application.id}`;
        const adminApplicationPath = `/admin/events/${application.event_id}/applications/${application.id}`;
        const responseValues = responseValuesByApplicationId.get(
          application.id,
        );

        rows.push([
          ...sharedUserColumns,
          application.id,
          application.event_id,
          application.events?.slug ?? '',
          application.events?.title ?? '',
          application.events?.status ?? '',
          this.toIsoString(application.events?.start_at),
          this.toIsoString(application.events?.end_at),
          application.decision_status,
          this.toIsoString(application.decision_published_at),
          this.calculateDerivedStatus(
            application,
            application.application_step_states,
          ),
          (application.tags ?? []).join(' | '),
          stepStatuses,
          fileIds.length,
          fileIds.join(' | '),
          uploadedFiles,
          staffApplicationPath,
          adminApplicationPath,
          `${appBaseUrl}${staffApplicationPath}`,
          `${appBaseUrl}${adminApplicationPath}`,
          this.toIsoString(application.created_at),
          this.toIsoString(application.updated_at),
          ...responseColumnKeys.map(
            (columnKey) => responseValues?.get(columnKey) ?? '',
          ),
        ]);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `users-applications-${timestamp}.csv`,
      csv: this.buildCsv(headers, rows),
    };
  }

  /* ================================================================ */
  /*  Event Stats                                                      */
  /* ================================================================ */

  async getEventStats(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  }): Promise<AdminEventStatsResponse> {
    const { page, pageSize, search, status } = params;
    const safePage = Number.isFinite(page) ? Math.max(page, 1) : 1;
    const safePageSize = Number.isFinite(pageSize)
      ? Math.min(Math.max(pageSize, 1), 100)
      : 25;
    const skip = (safePage - 1) * safePageSize;

    const and: any[] = [];

    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (status && status !== 'all') {
      and.push({ status });
    }

    const where = and.length ? { AND: and } : {};

    const [events, total] = await Promise.all([
      this.prisma.events.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: safePageSize,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          created_at: true,
          capacity: true,
        },
      }),
      this.prisma.events.count({ where }),
    ]);

    if (events.length === 0) {
      return { data: [], total, page: safePage, pageSize: safePageSize };
    }

    const eventIds = events.map((event) => event.id);

    const [appCounts, staffCounts, checkedInRows] = await Promise.all([
      this.prisma.applications.groupBy({
        by: ['event_id', 'decision_status'],
        where: { event_id: { in: eventIds } },
        _count: { id: true },
      }),
      this.prisma.event_role_assignments.groupBy({
        by: ['event_id'],
        where: { event_id: { in: eventIds } },
        _count: { id: true },
      }),
      this.prisma.attendance_records.findMany({
        where: {
          status: 'CHECKED_IN',
          applications: { event_id: { in: eventIds } },
        },
        select: { applications: { select: { event_id: true } } },
      }),
    ]);

    const decisionMap = new Map<
      string,
      { none: number; accepted: number; waitlisted: number; rejected: number }
    >();
    for (const row of appCounts) {
      const entry = decisionMap.get(row.event_id) ?? {
        none: 0,
        accepted: 0,
        waitlisted: 0,
        rejected: 0,
      };
      if (row.decision_status === 'ACCEPTED') entry.accepted += row._count.id;
      else if (row.decision_status === 'WAITLISTED')
        entry.waitlisted += row._count.id;
      else if (row.decision_status === 'REJECTED')
        entry.rejected += row._count.id;
      else entry.none += row._count.id;
      decisionMap.set(row.event_id, entry);
    }

    const staffMap = new Map<string, number>();
    for (const row of staffCounts) {
      staffMap.set(row.event_id, row._count.id);
    }

    const checkinMap = new Map<string, number>();
    for (const row of checkedInRows) {
      const eventId = row.applications?.event_id;
      if (!eventId) continue;
      checkinMap.set(eventId, (checkinMap.get(eventId) ?? 0) + 1);
    }

    const data: AdminEventStats[] = events.map((event) => {
      const decisionCounts = decisionMap.get(event.id) ?? {
        none: 0,
        accepted: 0,
        waitlisted: 0,
        rejected: 0,
      };
      const totalApplications =
        decisionCounts.none +
        decisionCounts.accepted +
        decisionCounts.waitlisted +
        decisionCounts.rejected;
      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
        createdAt: event.created_at.toISOString(),
        capacity: event.capacity ?? undefined,
        totalApplications,
        decisionCounts,
        staffAssignments: staffMap.get(event.id) ?? 0,
        checkedIn: checkinMap.get(event.id) ?? 0,
      };
    });

    return { data, total, page: safePage, pageSize: safePageSize };
  }

  /* ================================================================ */
  /*  Audit Log                                                        */
  /* ================================================================ */

  async getAuditLog(params: {
    page: number;
    pageSize: number;
    search?: string;
    category?: string;
  }): Promise<AuditResponse> {
    const { page, pageSize, search, category } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity_type: { contains: search, mode: 'insensitive' } },
        {
          users: {
            is: { email: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (category && category !== 'all') {
      // Map category to entity_type patterns
      const categoryMap: Record<string, string[]> = {
        auth: ['users', 'password_reset_tokens', 'email_verification_tokens'],
        event: ['events'],
        application: [
          'applications',
          'application_step_states',
          'step_submission_versions',
        ],
        user: ['users', 'applicant_profiles'],
        role: ['event_role_assignments'],
        settings: ['platform_settings'],
      };
      const types = categoryMap[category];
      if (types) {
        where.entity_type = { in: types };
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.audit_logs.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          users: {
            select: {
              email: true,
              applicant_profiles: { select: { full_name: true } },
            },
          },
        },
      }),
      this.prisma.audit_logs.count({ where }),
    ]);

    const data: AuditEntry[] = logs.map((log) => {
      const entityType = log.entity_type || '';
      let logCategory = 'default';
      if (
        [
          'users',
          'password_reset_tokens',
          'email_verification_tokens',
        ].includes(entityType)
      )
        logCategory = 'auth';
      else if (entityType === 'events') logCategory = 'event';
      else if (
        [
          'applications',
          'application_step_states',
          'step_submission_versions',
        ].includes(entityType)
      )
        logCategory = 'application';
      else if (entityType === 'event_role_assignments') logCategory = 'role';
      else if (entityType === 'applicant_profiles') logCategory = 'user';

      const afterData = log.after as Record<string, any> | null;
      let details: string | undefined;
      if (afterData?._diff && afterData?.changes) {
        const changedKeys = Object.keys(afterData.changes);
        details = `Changed: ${changedKeys.join(', ')}`;
      }

      return {
        id: log.id,
        action: log.action,
        category: logCategory,
        actorEmail: log.users?.email ?? 'system',
        actorName: log.users?.applicant_profiles?.full_name ?? undefined,
        targetType: log.entity_type,
        targetId: log.entity_id,
        details,
        metadata: (log.after ?? undefined) as
          | Record<string, unknown>
          | undefined,
        ip: log.ip_address ?? undefined,
        userAgent: log.user_agent ?? undefined,
        createdAt: log.created_at.toISOString(),
      };
    });

    return { data, total, page, pageSize };
  }

  /* ================================================================ */
  /*  Global Roles                                                     */
  /* ================================================================ */

  async getRoles(): Promise<StaffMember[]> {
    // Get all role assignments across all events + global admins
    const [assignments, globalAdmins] = await Promise.all([
      this.prisma.event_role_assignments.findMany({
        orderBy: { created_at: 'desc' },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              applicant_profiles: { select: { full_name: true } },
            },
          },
          events: { select: { id: true, title: true } },
        },
      }),
      this.prisma.users.findMany({
        where: { is_global_admin: true },
        select: {
          id: true,
          email: true,
          created_at: true,
          applicant_profiles: { select: { full_name: true } },
        },
      }),
    ]);

    const members: StaffMember[] = [];

    // Add global admins first
    for (const admin of globalAdmins) {
      members.push({
        id: `global-admin-${admin.id}`,
        email: admin.email,
        fullName: admin.applicant_profiles?.full_name ?? undefined,
        role: 'global_admin',
        eventName: undefined,
        eventId: undefined,
        assignedAt: admin.created_at.toISOString(),
        accessStartAt: null,
        accessEndAt: null,
        isGlobalAdmin: true,
        inviteStatus: 'NONE',
      });
    }

    // Add event-scoped role assignments
    for (const a of assignments) {
      members.push({
        id: a.id,
        email: a.users?.email ?? 'unknown',
        fullName: a.users?.applicant_profiles?.full_name ?? undefined,
        role: a.role.toLowerCase(),
        eventName: a.events?.title ?? undefined,
        eventId: a.events?.id ?? undefined,
        assignedAt: a.created_at.toISOString(),
        accessStartAt: a.access_start_at
          ? a.access_start_at.toISOString()
          : null,
        accessEndAt: a.access_end_at ? a.access_end_at.toISOString() : null,
        isGlobalAdmin: false,
        inviteStatus: resolveInviteStatus(a.invite_status, a.invite_last_expires_at),
        inviteFailureReason: a.invite_failure_reason ?? null,
        inviteLastAttemptAt: a.invite_last_attempt_at
          ? a.invite_last_attempt_at.toISOString()
          : null,
        inviteLastSentAt: a.invite_last_sent_at
          ? a.invite_last_sent_at.toISOString()
          : null,
        inviteLastExpiresAt: a.invite_last_expires_at
          ? a.invite_last_expires_at.toISOString()
          : null,
      });
    }

    return members;
  }

  async assignRole(params: {
    email: string;
    role: string;
    eventId?: string;
    startAt?: string | Date | null;
    endAt?: string | Date | null;
  }): Promise<StaffMember> {
    const { email, role, eventId } = params;
    const parsedStartAt = parseOptionalDateInput(params.startAt);
    const parsedEndAt = parseOptionalDateInput(params.endAt);
    if (parsedStartAt === undefined) {
      throw new BadRequestException('Invalid startAt date');
    }
    if (parsedEndAt === undefined) {
      throw new BadRequestException('Invalid endAt date');
    }
    if (
      parsedStartAt instanceof Date &&
      parsedEndAt instanceof Date &&
      parsedStartAt.getTime() > parsedEndAt.getTime()
    ) {
      throw new BadRequestException('startAt must be earlier than endAt');
    }
    const normalizedEmail = String(email ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    const normalizedRole = String(role).toLowerCase();
    const isGlobalAdminRole = normalizedRole === 'global_admin';

    // Validate valid eventId format if provided
    if (
      eventId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        eventId,
      )
    ) {
      throw new BadRequestException('Invalid Event ID format');
    }

    let event: { id: string; title: string } | null = null;

    // Global Admin is an explicit role assignment and must not be accidental.
    if (!eventId) {
      if (!isGlobalAdminRole) {
        throw new BadRequestException(
          'Event scope is required for event roles. Use role "global_admin" for global access.',
        );
      }
      if (parsedStartAt !== null || parsedEndAt !== null) {
        throw new BadRequestException(
          'startAt/endAt are only supported for event-scoped staff roles',
        );
      }
    } else {
      if (isGlobalAdminRole) {
        throw new BadRequestException(
          'Global Admin role cannot be scoped to an event',
        );
      }

      if (!(Object.values(EventRole) as string[]).includes(normalizedRole)) {
        throw new BadRequestException('Invalid event role');
      }

      // Validate event exists
      event = await this.prisma.events.findFirst({
        where: { id: eventId },
        select: { id: true, title: true },
      });
      if (!event) {
        throw new NotFoundException('Event not found');
      }
    }

    let createdUser = false;
    let user = await this.prisma.users.findFirst({
      where: { email: normalizedEmail },
      include: { applicant_profiles: { select: { full_name: true } } },
    });
    let hadStaffAccessBefore = false;
    const now = new Date();

    if (!user) {
      createdUser = true;
      const passwordHash = await argon2.hash(
        `${crypto.randomUUID()}-${crypto.randomUUID()}`,
      );
      user = await this.prisma.users.create({
        data: {
          id: crypto.randomUUID(),
          email: normalizedEmail,
          password_hash: passwordHash,
          applicant_profiles: { create: {} },
        },
        include: { applicant_profiles: { select: { full_name: true } } },
      });
    } else {
      const existingStaffAssignment =
        await this.prisma.event_role_assignments.findFirst({
          where: {
            user_id: user.id,
            AND: [
              { OR: [{ access_start_at: null }, { access_start_at: { lte: now } }] },
              { OR: [{ access_end_at: null }, { access_end_at: { gte: now } }] },
            ],
          },
          select: { id: true },
        });
      hadStaffAccessBefore = Boolean(
        user.is_global_admin || existingStaffAssignment,
      );
    }

    const sendInviteIfNeeded = async (
      shouldSend: boolean,
    ): Promise<{
      invitationSent?: boolean;
      inviteStatus?: 'NONE' | 'SENT' | 'FAILED' | 'EXPIRED';
      inviteFailureReason?: string | null;
      inviteLastAttemptAt?: Date | null;
      inviteLastSentAt?: Date | null;
      inviteLastExpiresAt?: Date | null;
    }> => {
      if (!shouldSend) return {};
      const attemptedAt = new Date();
      const inviteResult =
        await this.passwordResetService.sendPasswordSetupInvite({
          userId: user.id,
          email: user.email,
          userName: user.applicant_profiles?.full_name ?? undefined,
          role: normalizedRole,
          eventName: event?.title,
        });
      return {
        invitationSent: inviteResult.invitationSent,
        inviteStatus: inviteResult.invitationSent ? 'SENT' : 'FAILED',
        inviteFailureReason: inviteResult.invitationSent
          ? null
          : 'Failed to send invitation email',
        inviteLastAttemptAt: attemptedAt,
        inviteLastSentAt: inviteResult.invitationSent ? attemptedAt : null,
        inviteLastExpiresAt: inviteResult.invitationSent
          ? inviteResult.expiresAt ??
            new Date(attemptedAt.getTime() + 60 * 60 * 1000)
          : null,
      };
    };

    const toStaffMemberFromAssignment = (assignment: {
      id: string;
      created_at: Date;
      access_start_at: Date | null;
      access_end_at: Date | null;
      invite_status: string | null;
      invite_failure_reason: string | null;
      invite_last_attempt_at: Date | null;
      invite_last_sent_at: Date | null;
      invite_last_expires_at: Date | null;
    }): StaffMember => ({
      id: assignment.id,
      email: user.email,
      fullName: user.applicant_profiles?.full_name ?? undefined,
      role: normalizedRole,
      eventName: event?.title,
      eventId: event?.id,
      assignedAt: assignment.created_at.toISOString(),
      accessStartAt: assignment.access_start_at
        ? assignment.access_start_at.toISOString()
        : null,
      accessEndAt: assignment.access_end_at
        ? assignment.access_end_at.toISOString()
        : null,
      isGlobalAdmin: false,
      inviteStatus: resolveInviteStatus(
        assignment.invite_status,
        assignment.invite_last_expires_at,
      ),
      inviteFailureReason: assignment.invite_failure_reason ?? null,
      inviteLastAttemptAt: assignment.invite_last_attempt_at
        ? assignment.invite_last_attempt_at.toISOString()
        : null,
      inviteLastSentAt: assignment.invite_last_sent_at
        ? assignment.invite_last_sent_at.toISOString()
        : null,
      inviteLastExpiresAt: assignment.invite_last_expires_at
        ? assignment.invite_last_expires_at.toISOString()
        : null,
    });

    if (!eventId) {
      const roleGrantedNow = !user.is_global_admin;
      await this.prisma.users.update({
        where: { id: user.id },
        data: { is_global_admin: true },
      });
      const inviteResult = await sendInviteIfNeeded(
        createdUser || (!hadStaffAccessBefore && roleGrantedNow),
      );
      return {
        id: `global-admin-${user.id}`,
        email: user.email,
        fullName: user.applicant_profiles?.full_name ?? undefined,
        role: 'global_admin',
        assignedAt: new Date().toISOString(),
        accessStartAt: null,
        accessEndAt: null,
        isGlobalAdmin: true,
        invitationSent: inviteResult.invitationSent,
        inviteStatus: inviteResult.inviteStatus ?? 'NONE',
        inviteFailureReason: inviteResult.inviteFailureReason ?? null,
        inviteLastAttemptAt: inviteResult.inviteLastAttemptAt
          ? inviteResult.inviteLastAttemptAt.toISOString()
          : null,
        inviteLastSentAt: inviteResult.inviteLastSentAt
          ? inviteResult.inviteLastSentAt.toISOString()
          : null,
        inviteLastExpiresAt: inviteResult.inviteLastExpiresAt
          ? inviteResult.inviteLastExpiresAt.toISOString()
          : null,
      };
    }

    const roleAccessData = {
      ...(parsedStartAt !== undefined ? { access_start_at: parsedStartAt } : {}),
      ...(parsedEndAt !== undefined ? { access_end_at: parsedEndAt } : {}),
    };

    // Check for existing assignment
    const existing = await this.prisma.event_role_assignments.findFirst({
      where: { event_id: eventId, user_id: user.id, role: normalizedRole },
    });
    if (existing) {
      let assignment = existing;
      if (Object.keys(roleAccessData).length > 0) {
        assignment = await this.prisma.event_role_assignments.update({
          where: { id: existing.id },
          data: roleAccessData,
        });
      }

      const inviteResult = await sendInviteIfNeeded(
        createdUser ||
          (!hadStaffAccessBefore &&
            isRoleAssignmentActiveNow({
              access_start_at: assignment.access_start_at,
              access_end_at: assignment.access_end_at,
            })),
      );

      if (inviteResult.invitationSent !== undefined) {
        assignment = await this.prisma.event_role_assignments.update({
          where: { id: assignment.id },
          data: {
            invite_status: inviteResult.inviteStatus,
            invite_failure_reason: inviteResult.inviteFailureReason,
            invite_last_attempt_at: inviteResult.inviteLastAttemptAt,
            invite_last_sent_at: inviteResult.inviteLastSentAt,
            invite_last_expires_at: inviteResult.inviteLastExpiresAt,
            invite_resend_count: { increment: 1 },
          },
        });
      }

      return {
        ...toStaffMemberFromAssignment(assignment),
        invitationSent: inviteResult.invitationSent,
      };
    }

    let assignment = await this.prisma.event_role_assignments.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        user_id: user.id,
        role: normalizedRole,
        access_start_at: parsedStartAt ?? null,
        access_end_at: parsedEndAt ?? null,
      },
    });

    const inviteResult = await sendInviteIfNeeded(
      createdUser ||
        (!hadStaffAccessBefore &&
          isRoleAssignmentActiveNow({
            access_start_at: assignment.access_start_at,
            access_end_at: assignment.access_end_at,
          })),
    );

    if (inviteResult.invitationSent !== undefined) {
      assignment = await this.prisma.event_role_assignments.update({
        where: { id: assignment.id },
        data: {
          invite_status: inviteResult.inviteStatus,
          invite_failure_reason: inviteResult.inviteFailureReason,
          invite_last_attempt_at: inviteResult.inviteLastAttemptAt,
          invite_last_sent_at: inviteResult.inviteLastSentAt,
          invite_last_expires_at: inviteResult.inviteLastExpiresAt,
          invite_resend_count: { increment: 1 },
        },
      });
    }

    return {
      ...toStaffMemberFromAssignment(assignment),
      invitationSent: inviteResult.invitationSent,
    };
  }

  async updateRoleAccess(
    id: string,
    params: { startAt?: string | Date | null; endAt?: string | Date | null },
  ): Promise<StaffMember> {
    if (id.startsWith('global-admin-')) {
      throw new BadRequestException(
        'Global admin roles do not support event access windows',
      );
    }

    const parsedStartAt = parseOptionalDateInput(params.startAt);
    const parsedEndAt = parseOptionalDateInput(params.endAt);
    if (parsedStartAt === undefined) {
      throw new BadRequestException('Invalid startAt date');
    }
    if (parsedEndAt === undefined) {
      throw new BadRequestException('Invalid endAt date');
    }
    if (
      parsedStartAt instanceof Date &&
      parsedEndAt instanceof Date &&
      parsedStartAt.getTime() > parsedEndAt.getTime()
    ) {
      throw new BadRequestException('startAt must be earlier than endAt');
    }

    if (parsedStartAt === undefined && parsedEndAt === undefined) {
      throw new BadRequestException('At least one access date must be provided');
    }

    const assignment = await this.prisma.event_role_assignments.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            email: true,
            applicant_profiles: { select: { full_name: true } },
          },
        },
        events: {
          select: { id: true, title: true },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Role assignment not found');

    const updated = await this.prisma.event_role_assignments.update({
      where: { id },
      data: {
        ...(parsedStartAt !== undefined ? { access_start_at: parsedStartAt } : {}),
        ...(parsedEndAt !== undefined ? { access_end_at: parsedEndAt } : {}),
      },
    });

    return {
      id: updated.id,
      email: assignment.users?.email ?? 'unknown',
      fullName: assignment.users?.applicant_profiles?.full_name ?? undefined,
      role: updated.role.toLowerCase(),
      eventName: assignment.events?.title ?? undefined,
      eventId: assignment.events?.id ?? undefined,
      assignedAt: updated.created_at.toISOString(),
      accessStartAt: updated.access_start_at
        ? updated.access_start_at.toISOString()
        : null,
      accessEndAt: updated.access_end_at
        ? updated.access_end_at.toISOString()
        : null,
      isGlobalAdmin: false,
      inviteStatus: resolveInviteStatus(
        updated.invite_status,
        updated.invite_last_expires_at,
      ),
      inviteFailureReason: updated.invite_failure_reason ?? null,
      inviteLastAttemptAt: updated.invite_last_attempt_at
        ? updated.invite_last_attempt_at.toISOString()
        : null,
      inviteLastSentAt: updated.invite_last_sent_at
        ? updated.invite_last_sent_at.toISOString()
        : null,
      inviteLastExpiresAt: updated.invite_last_expires_at
        ? updated.invite_last_expires_at.toISOString()
        : null,
    };
  }

  async resendRoleInvite(id: string): Promise<StaffMember> {
    if (id.startsWith('global-admin-')) {
      const userId = id.replace('global-admin-', '');
      const user = await this.prisma.users.findUnique({
        where: { id: userId },
        include: { applicant_profiles: { select: { full_name: true } } },
      });
      if (!user) throw new NotFoundException('User not found');

      const inviteResult =
        await this.passwordResetService.sendPasswordSetupInvite({
          userId: user.id,
          email: user.email,
          userName: user.applicant_profiles?.full_name ?? undefined,
          role: 'global_admin',
        });
      const attemptedAt = new Date();
      return {
        id: `global-admin-${user.id}`,
        email: user.email,
        fullName: user.applicant_profiles?.full_name ?? undefined,
        role: 'global_admin',
        assignedAt: user.created_at.toISOString(),
        accessStartAt: null,
        accessEndAt: null,
        isGlobalAdmin: true,
        invitationSent: inviteResult.invitationSent,
        inviteStatus: inviteResult.invitationSent ? 'SENT' : 'FAILED',
        inviteFailureReason: inviteResult.invitationSent
          ? null
          : 'Failed to send invitation email',
        inviteLastAttemptAt: attemptedAt.toISOString(),
        inviteLastSentAt: inviteResult.invitationSent
          ? attemptedAt.toISOString()
          : null,
        inviteLastExpiresAt: inviteResult.invitationSent
          ? (
              inviteResult.expiresAt ??
              new Date(attemptedAt.getTime() + 60 * 60 * 1000)
            ).toISOString()
          : null,
      };
    }

    const assignment = await this.prisma.event_role_assignments.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            applicant_profiles: { select: { full_name: true } },
          },
        },
        events: { select: { id: true, title: true } },
      },
    });
    if (!assignment) throw new NotFoundException('Role assignment not found');
    if (!assignment.users?.email) {
      throw new BadRequestException('Cannot resend invite for assignment without user email');
    }

    const inviteResult = await this.passwordResetService.sendPasswordSetupInvite({
      userId: assignment.user_id,
      email: assignment.users.email,
      userName: assignment.users?.applicant_profiles?.full_name ?? undefined,
      role: assignment.role,
      eventName: assignment.events?.title ?? undefined,
    });
    const attemptedAt = new Date();

    const updated = await this.prisma.event_role_assignments.update({
      where: { id: assignment.id },
      data: {
        invite_status: inviteResult.invitationSent ? 'SENT' : 'FAILED',
        invite_failure_reason: inviteResult.invitationSent
          ? null
          : 'Failed to send invitation email',
        invite_last_attempt_at: attemptedAt,
        invite_last_sent_at: inviteResult.invitationSent ? attemptedAt : null,
        invite_last_expires_at: inviteResult.invitationSent
          ? inviteResult.expiresAt ??
            new Date(attemptedAt.getTime() + 60 * 60 * 1000)
          : null,
        invite_resend_count: { increment: 1 },
      },
    });

    return {
      id: updated.id,
      email: assignment.users?.email ?? 'unknown',
      fullName: assignment.users?.applicant_profiles?.full_name ?? undefined,
      role: updated.role.toLowerCase(),
      eventName: assignment.events?.title ?? undefined,
      eventId: assignment.events?.id ?? undefined,
      assignedAt: updated.created_at.toISOString(),
      accessStartAt: updated.access_start_at
        ? updated.access_start_at.toISOString()
        : null,
      accessEndAt: updated.access_end_at
        ? updated.access_end_at.toISOString()
        : null,
      isGlobalAdmin: false,
      invitationSent: inviteResult.invitationSent,
      inviteStatus: resolveInviteStatus(
        updated.invite_status,
        updated.invite_last_expires_at,
      ),
      inviteFailureReason: updated.invite_failure_reason ?? null,
      inviteLastAttemptAt: updated.invite_last_attempt_at
        ? updated.invite_last_attempt_at.toISOString()
        : null,
      inviteLastSentAt: updated.invite_last_sent_at
        ? updated.invite_last_sent_at.toISOString()
        : null,
      inviteLastExpiresAt: updated.invite_last_expires_at
        ? updated.invite_last_expires_at.toISOString()
        : null,
    };
  }

  async removeRole(id: string): Promise<void> {
    // Check if it's a global admin removal
    if (id.startsWith('global-admin-')) {
      const userId = id.replace('global-admin-', '');
      const user = await this.prisma.users.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('User not found');
      await this.prisma.users.update({
        where: { id: userId },
        data: { is_global_admin: false },
      });
      return;
    }

    // Otherwise remove event role assignment
    const assignment = await this.prisma.event_role_assignments.findUnique({
      where: { id },
    });
    if (!assignment) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.event_role_assignments.delete({ where: { id } });
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
      const effectiveAnswers = {
        ...this.normalizeAnswersShape(
          submission.answers_snapshot as Record<string, any>,
        ),
      };
      for (const patch of patchesByVersionId.get(submission.id) ?? []) {
        const ops = Array.isArray(patch.ops) ? patch.ops : [];
        for (const op of ops) {
          if (!op || op.op !== 'replace' || typeof op.path !== 'string') {
            continue;
          }
          const fieldPath = op.path.replace(/^\//, '');
          if (!fieldPath) continue;
          effectiveAnswers[fieldPath] = op.value;
        }
      }
      effectiveByVersionId.set(
        submission.id,
        this.normalizeAnswersShape(effectiveAnswers),
      );
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
      const hasTopLevelAnswerKeys =
        Object.keys(normalized).some((key) => key !== 'data') &&
        Object.keys(normalized).length > 1;
      if (!hasTopLevelAnswerKeys) {
        return { ...(nestedData as Record<string, any>) };
      }
    }

    return normalized;
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

  private calculateDerivedStatus(
    application: {
      decision_status: string;
      decision_published_at: Date | null;
      attendance_records?: { status: string } | null;
    },
    stepStates: Array<{
      status: string;
      workflow_steps?: { step_index: number } | null;
    }>,
  ): string {
    const decisionStatus = application.decision_status;
    const decisionPublished = application.decision_published_at != null;

    if (decisionStatus === 'REJECTED') {
      return decisionPublished
        ? 'DECISION_REJECTED_PUBLISHED'
        : 'DECISION_REJECTED_DRAFT';
    }

    if (stepStates.some((stepState) => stepState.status === 'REJECTED_FINAL')) {
      return 'BLOCKED_REJECTED';
    }

    if (application.attendance_records?.status === 'CONFIRMED') {
      return 'CONFIRMED';
    }

    if (decisionStatus === 'ACCEPTED') {
      return decisionPublished
        ? 'DECISION_ACCEPTED_PUBLISHED'
        : 'DECISION_ACCEPTED_DRAFT';
    }

    if (decisionStatus === 'WAITLISTED') {
      return decisionPublished
        ? 'DECISION_WAITLISTED_PUBLISHED'
        : 'DECISION_WAITLISTED_DRAFT';
    }

    const sortedSteps = [...stepStates].sort(
      (a, b) =>
        (a.workflow_steps?.step_index ?? 0) -
        (b.workflow_steps?.step_index ?? 0),
    );
    const blockingStep = sortedSteps.find(
      (stepState) => stepState.status !== 'APPROVED',
    );

    if (!blockingStep) return 'ALL_REQUIRED_STEPS_APPROVED';

    const stepIndex = blockingStep.workflow_steps?.step_index ?? 0;
    if (blockingStep.status === 'SUBMITTED') {
      return `WAITING_FOR_REVIEW_STEP_${stepIndex}`;
    }
    if (blockingStep.status === 'NEEDS_REVISION') {
      return `REVISION_REQUIRED_STEP_${stepIndex}`;
    }
    return `WAITING_FOR_APPLICANT_STEP_${stepIndex}`;
  }
}
