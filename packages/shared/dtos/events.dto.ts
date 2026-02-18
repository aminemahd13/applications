import { z } from 'zod';

export const EventSortFields = [
    'created_at',
    'updated_at',
    'application_open_at',
    'application_close_at',
    'start_at',
    'title',
] as const;

// ============================================================
// PAGINATION & FILTERING
// ============================================================

export const PaginationSchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    sort: z.enum(EventSortFields).optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        nextCursor: string | null;
        hasMore: boolean;
        total?: number;
    };
}

// ============================================================
// EVENT STATUS ENUMS
// ============================================================

export enum PublishStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED',
}

export enum ApplicationsStatus {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
}

// Derived from dates, never written directly
export enum LifecycleStatus {
    UPCOMING = 'UPCOMING',
    RUNNING = 'RUNNING',
    ENDED = 'ENDED',
}

// ============================================================
// EVENT CONFIGURATION SCHEMAS
// ============================================================

export const DecisionConfigSchema = z.object({
    autoPublish: z.boolean().optional().default(false),
}).passthrough();

export type DecisionConfig = z.infer<typeof DecisionConfigSchema>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const CertificateTemplateTextSchema = z.object({
    title: z.string().max(120).optional(),
    subtitle: z.string().max(200).optional(),
    completionText: z.string().max(240).optional(),
    footerText: z.string().max(300).optional(),
}).passthrough();

export type CertificateTemplateText = z.infer<typeof CertificateTemplateTextSchema>;

export const CertificateTemplateStyleSchema = z.object({
    primaryColor: HexColorSchema.optional(),
    secondaryColor: HexColorSchema.optional(),
    backgroundColor: HexColorSchema.optional(),
    textColor: HexColorSchema.optional(),
    borderColor: HexColorSchema.optional(),
}).passthrough();

export type CertificateTemplateStyle = z.infer<typeof CertificateTemplateStyleSchema>;

export const CheckinCertificateConfigSchema = z.object({
    publishMode: z.enum(['checkin', 'manual']).optional().default('checkin'),
    template: z.object({
        text: CertificateTemplateTextSchema.optional().default({}),
        style: CertificateTemplateStyleSchema.optional().default({}),
    }).optional().default({}),
}).passthrough();

export type CheckinCertificateConfig = z.infer<typeof CheckinCertificateConfigSchema>;

export const CheckinConfigSchema = z.object({
    enabled: z.boolean().optional().default(false),
    allowSelfCheckin: z.boolean().optional().default(false),
    qrCodeRequired: z.boolean().optional().default(true),
    certificate: CheckinCertificateConfigSchema.optional().default({}),
}).passthrough();

export type CheckinConfig = z.infer<typeof CheckinConfigSchema>;

// ============================================================
// EVENT DTOs
// ============================================================

export const CreateEventSchema = z.object({
    title: z.string().min(1).max(200),
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    seriesKey: z.string().optional(),
    editionLabel: z.string().optional(),
    timezone: z.string().default('UTC'),
    applicationsOpenAt: z.coerce.date().optional(),
    applicationsCloseAt: z.coerce.date().optional(),
    confirmationDeadline: z.coerce.date().optional(),
});

export type CreateEventDto = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = CreateEventSchema.partial().extend({
    description: z.string().optional(),
    venueName: z.string().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    capacity: z.coerce.number().int().min(0).nullable().optional(),
    requiresEmailVerification: z.boolean().optional(),
    publishStatus: z.nativeEnum(PublishStatus).optional(),
    applicationsStatus: z.nativeEnum(ApplicationsStatus).optional(),
    decisionConfig: DecisionConfigSchema.optional(),
    checkinConfig: CheckinConfigSchema.optional(),
});

export type UpdateEventDto = z.infer<typeof UpdateEventSchema>;

export const EventFilterSchema = PaginationSchema.extend({
    publishStatus: z.nativeEnum(PublishStatus).optional(),
    applicationsStatus: z.nativeEnum(ApplicationsStatus).optional(),
    includeArchived: z.coerce.boolean().optional().default(false),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().optional(), // Search query
});

export type EventFilterDto = z.infer<typeof EventFilterSchema>;

// ============================================================
// ROLE ASSIGNMENT DTOs
// Note: EventRole is defined in ../roles.ts - use that one
// ============================================================

// Re-export for convenience (using string values for schema validation)
const EventRoleValues = ['organizer', 'reviewer', 'content_editor', 'checkin_staff'] as const;

export const RoleAccessWindowSchema = z
    .object({
        startAt: z.coerce.date().optional().nullable(),
        endAt: z.coerce.date().optional().nullable(),
    })
    .refine(
        (value) =>
            !value.startAt ||
            !value.endAt ||
            value.startAt.getTime() <= value.endAt.getTime(),
        { message: 'startAt must be earlier than or equal to endAt' },
    );

export const AssignRoleSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(EventRoleValues),
}).merge(RoleAccessWindowSchema);

export type AssignRoleDto = z.infer<typeof AssignRoleSchema>;

export const BulkRolesSchema = z.object({
    assign: z.array(AssignRoleSchema).optional().default([]),
    remove: z.array(z.object({
        assignmentId: z.string().uuid(),
    })).optional().default([]),
});

export type BulkRolesDto = z.infer<typeof BulkRolesSchema>;

// ============================================================
// RESPONSE ENVELOPE
// ============================================================

export interface SuccessResponse<T> {
    data: T;
    meta?: Record<string, any>;
}

export interface ErrorResponse {
    error: {
        code: string;
        message: string;
        details?: Record<string, any>;
    };
}

// Standard error codes
export const ErrorCodes = {
    NOT_FOUND: 'NOT_FOUND',
    FORBIDDEN: 'FORBIDDEN',
    CONFLICT: 'CONFLICT',
    STALE_VERSION: 'STALE_VERSION',
    FORM_VERSION_CHANGED: 'FORM_VERSION_CHANGED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    EVENT_ID_MISMATCH: 'EVENT_ID_MISMATCH',
} as const;
