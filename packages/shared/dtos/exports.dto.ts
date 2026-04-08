import { z } from 'zod';

function normalizeDelimitedStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const normalized = raw
    .flatMap((entry) => {
      if (typeof entry === 'string') return entry.split(',');
      if (typeof entry === 'number') return [String(entry)];
      return [];
    })
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeQueryBoolean(value: unknown): boolean | undefined | unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return value;
}

function dedupeArray<T extends string>(values?: T[]): T[] | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return Array.from(new Set(values));
}

const QueryBooleanSchema = z.preprocess(
  (value) => normalizeQueryBoolean(value),
  z.boolean().optional(),
);

export const CsvPortalSchema = z.enum(['staff', 'admin']);
export type CsvPortal = z.infer<typeof CsvPortalSchema>;

export const APPLICATION_EXPORT_CORE_COLUMNS = [
  'applicationId',
  'eventId',
  'eventSlug',
  'eventTitle',
  'applicantUserId',
  'applicantEmail',
  'applicantName',
  'applicantFirstName',
  'applicantLastName',
  'applicantDateOfBirth',
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
  'applicationPath',
  'applicationUrl',
  'staffApplicationPath',
  'adminApplicationPath',
  'staffApplicationUrl',
  'adminApplicationUrl',
  'applicationCreatedAt',
  'applicationUpdatedAt',
] as const;

export type ApplicationExportCoreColumn =
  (typeof APPLICATION_EXPORT_CORE_COLUMNS)[number];

export const ApplicationExportCoreColumnSchema = z.enum(
  APPLICATION_EXPORT_CORE_COLUMNS,
);

export const DEFAULT_APPLICATION_EXPORT_CORE_COLUMNS = [
  ...APPLICATION_EXPORT_CORE_COLUMNS,
] as const;

export const ApplicationCsvExportQuerySchema = z
  .object({
    applicationIds: z.preprocess(
      (value) => normalizeDelimitedStringArray(value),
      z.array(z.string().uuid()).max(500).optional(),
    ),
    columns: z.preprocess(
      (value) => normalizeDelimitedStringArray(value),
      z
        .array(ApplicationExportCoreColumnSchema)
        .max(APPLICATION_EXPORT_CORE_COLUMNS.length)
        .optional(),
    ),
    includeResponseColumns: QueryBooleanSchema,
    portal: CsvPortalSchema.optional(),
  })
  .transform((value) => ({
    applicationIds: dedupeArray(value.applicationIds),
    columns: dedupeArray(value.columns),
    includeResponseColumns: value.includeResponseColumns,
    portal: value.portal,
  }));

export type ApplicationCsvExportQueryDto = z.infer<
  typeof ApplicationCsvExportQuerySchema
>;

export const ApplicationCsvExportBodySchema = z
  .object({
    applicationIds: z.array(z.string().uuid()).max(500).optional(),
    columns: z
      .array(ApplicationExportCoreColumnSchema)
      .max(APPLICATION_EXPORT_CORE_COLUMNS.length)
      .optional(),
    includeResponseColumns: z.boolean().optional(),
    portal: CsvPortalSchema.optional(),
  })
  .transform((value) => ({
    applicationIds: dedupeArray(value.applicationIds),
    columns: dedupeArray(value.columns),
    includeResponseColumns: value.includeResponseColumns,
    portal: value.portal,
  }));

export type ApplicationCsvExportBodyDto = z.infer<
  typeof ApplicationCsvExportBodySchema
>;

export const ADMIN_USERS_EXPORT_COLUMNS = [
  'userId',
  'email',
  'accountType',
  'isGlobalAdmin',
  'hasStaffRole',
  'staffRoleCount',
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
  'applicationPath',
  'applicationUrl',
  'staffApplicationPath',
  'adminApplicationPath',
  'staffApplicationUrl',
  'adminApplicationUrl',
  'applicationCreatedAt',
  'applicationUpdatedAt',
] as const;

export type AdminUsersExportColumn = (typeof ADMIN_USERS_EXPORT_COLUMNS)[number];

export const AdminUsersExportColumnSchema = z.enum(ADMIN_USERS_EXPORT_COLUMNS);

export const DEFAULT_ADMIN_USERS_EXPORT_COLUMNS = [
  ...ADMIN_USERS_EXPORT_COLUMNS,
] as const;

export const AdminUsersCsvExportQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    filter: z.string().trim().max(50).optional(),
    columns: z.preprocess(
      (value) => normalizeDelimitedStringArray(value),
      z
        .array(AdminUsersExportColumnSchema)
        .max(ADMIN_USERS_EXPORT_COLUMNS.length)
        .optional(),
    ),
    includeResponseColumns: QueryBooleanSchema,
    portal: CsvPortalSchema.optional(),
  })
  .transform((value) => ({
    search: value.search,
    filter: value.filter,
    columns: dedupeArray(value.columns),
    includeResponseColumns: value.includeResponseColumns,
    portal: value.portal,
  }));

export type AdminUsersCsvExportQueryDto = z.infer<
  typeof AdminUsersCsvExportQuerySchema
>;

export const CHECKIN_ATTENDEE_STATUS_VALUES = [
  'all',
  'checked_in',
  'not_checked_in',
] as const;

export const CheckinAttendeeStatusSchema = z.enum(
  CHECKIN_ATTENDEE_STATUS_VALUES,
);
export type CheckinAttendeeStatus = z.infer<typeof CheckinAttendeeStatusSchema>;

export const CHECKIN_EXPORT_COLUMNS = [
  'applicationId',
  'eventId',
  'eventSlug',
  'eventTitle',
  'applicantUserId',
  'applicantName',
  'applicantEmail',
  'decisionStatus',
  'attendanceStatus',
  'isCheckedIn',
  'checkedInAt',
  'checkedInByUserId',
  'checkedInByEmail',
  'tags',
  'applicationPath',
  'applicationUrl',
  'staffApplicationPath',
  'adminApplicationPath',
  'staffApplicationUrl',
  'adminApplicationUrl',
  'applicationCreatedAt',
  'applicationUpdatedAt',
] as const;

export type CheckinExportColumn = (typeof CHECKIN_EXPORT_COLUMNS)[number];
export const CheckinExportColumnSchema = z.enum(CHECKIN_EXPORT_COLUMNS);

export const DEFAULT_CHECKIN_EXPORT_COLUMNS = [...CHECKIN_EXPORT_COLUMNS] as const;

export const CheckinAttendeesQuerySchema = z
  .object({
    status: CheckinAttendeeStatusSchema.optional().default('all'),
    tags: z.preprocess(
      (value) => normalizeDelimitedStringArray(value),
      z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    ),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  })
  .transform((value) => ({
    ...value,
    tags: dedupeArray(value.tags),
    search: value.search ? value.search.trim() : undefined,
  }));

export type CheckinAttendeesQueryDto = z.infer<
  typeof CheckinAttendeesQuerySchema
>;

export const CheckinCsvExportRequestSchema = z
  .object({
    status: CheckinAttendeeStatusSchema.optional().default('all'),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    search: z.string().trim().max(200).optional(),
    columns: z
      .array(CheckinExportColumnSchema)
      .max(CHECKIN_EXPORT_COLUMNS.length)
      .optional(),
    portal: CsvPortalSchema.optional(),
  })
  .transform((value) => ({
    ...value,
    tags: dedupeArray(value.tags),
    columns: dedupeArray(value.columns),
    search: value.search ? value.search.trim() : undefined,
  }));

export type CheckinCsvExportRequestDto = z.infer<
  typeof CheckinCsvExportRequestSchema
>;
