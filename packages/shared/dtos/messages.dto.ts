import { z } from 'zod';
import { DecisionStatus, StepStatus } from './applications.dto';

// ============================================================
// MESSAGING DTOs
// ============================================================

export const RecipientFilterSchema = z.object({
    // Decision status
    decisionStatus: z.array(z.nativeEnum(DecisionStatus)).optional(),

    // Step-specific filters
    stepId: z.string().uuid().optional(),
    stepStatus: z.array(z.nativeEnum(StepStatus)).optional(),

    // Derived convenience
    currentStepId: z.string().uuid().optional(),
    needsInfoOpen: z.boolean().optional(),

    // Post-decision
    confirmed: z.boolean().optional(),
    checkedIn: z.boolean().optional(),

    // Tags (AND/OR)
    tagsAny: z.array(z.string()).optional(),
    tagsAll: z.array(z.string()).optional(),

    // Explicit addressing
    applicationIds: z.array(z.string().uuid()).optional(),
    userIds: z.array(z.string().uuid()).optional(),
    emails: z.array(z.string().email()).optional(),

    // Exclusions
    excludeUserIds: z.array(z.string().uuid()).optional(),

    // Demographic filters
    ageMin: z.coerce.number().int().min(0).max(150).optional(),
    ageMax: z.coerce.number().int().min(0).max(150).optional(),
    country: z.array(z.string()).optional(),
    city: z.array(z.string()).optional(),
    educationLevel: z.array(z.string()).optional(),
});

export type RecipientFilter = z.infer<typeof RecipientFilterSchema>;

// Action button types
export const ActionButtonSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('OPEN_STEP'),
        eventId: z.string().uuid(),
        stepId: z.string().uuid(),
        label: z.string().max(50),
    }),
    z.object({
        kind: z.literal('OPEN_APPLICATION'),
        eventId: z.string().uuid(),
        label: z.string().max(50),
    }),
    z.object({
        kind: z.literal('EXTERNAL_LINK'),
        url: z.string().url().refine(u => u.startsWith('https://'), { message: 'Must be https' }),
        label: z.string().max(50),
    }),
]);

export type ActionButton = z.infer<typeof ActionButtonSchema>;

// Create message schema
export const CreateMessageSchema = z.object({
    title: z.string().min(1).max(200),
    bodyRich: z.any(), // ProseMirror/TipTap JSON - validated separately
    bodyText: z.string().optional(),
    actionButtons: z.array(ActionButtonSchema).max(3).optional(),
    recipientFilter: RecipientFilterSchema.optional(),
    explicitUserIds: z.array(z.string().uuid()).optional(),
    sendEmail: z.boolean().default(false),
});

export type CreateMessageDto = z.infer<typeof CreateMessageSchema>;

// Preview recipients schema
export const PreviewRecipientsSchema = z.object({
    recipientFilter: RecipientFilterSchema,
});

export type PreviewRecipientsDto = z.infer<typeof PreviewRecipientsSchema>;

export const MessageListQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
});

export type MessageListQueryDto = z.infer<typeof MessageListQuerySchema>;

export const MessageRecipientsQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(200).default(100),
});

export type MessageRecipientsQueryDto = z.infer<typeof MessageRecipientsQuerySchema>;

// Inbox query schema
export const InboxQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    eventId: z.string().uuid().optional(),
    unreadOnly: z.coerce.boolean().optional(),
});

export type InboxQueryDto = z.infer<typeof InboxQuerySchema>;

// System-wide announcement filter (admin, no event context)
export const SystemAnnouncementFilterSchema = z.object({
    eventsAttended: z.array(z.string().uuid()).optional(),
    registeredAfter: z.coerce.date().optional(),
    registeredBefore: z.coerce.date().optional(),
    country: z.array(z.string()).optional(),
    city: z.array(z.string()).optional(),
    educationLevel: z.array(z.string()).optional(),
    ageMin: z.coerce.number().int().min(0).max(150).optional(),
    ageMax: z.coerce.number().int().min(0).max(150).optional(),
    excludeUserIds: z.array(z.string().uuid()).optional(),
});

export type SystemAnnouncementFilter = z.infer<typeof SystemAnnouncementFilterSchema>;

export const CreateSystemAnnouncementSchema = z.object({
    title: z.string().min(1).max(200),
    bodyRich: z.any(),
    bodyText: z.string().optional(),
    actionButtons: z.array(ActionButtonSchema).max(3).optional(),
    recipientFilter: SystemAnnouncementFilterSchema.optional(),
    sendEmail: z.boolean().default(false),
});

export type CreateSystemAnnouncementDto = z.infer<typeof CreateSystemAnnouncementSchema>;

// Message types
export enum MessageType {
    ANNOUNCEMENT = 'ANNOUNCEMENT',
    DIRECT = 'DIRECT',
    ACTION_REQUIRED = 'ACTION_REQUIRED',
    TRANSACTIONAL = 'TRANSACTIONAL',
    SYSTEM = 'SYSTEM',
}

export enum MessageStatus {
    DRAFT = 'DRAFT',
    SENT = 'SENT',
    SCHEDULED = 'SCHEDULED',
}

export enum EmailDeliveryStatus {
    NOT_REQUESTED = 'NOT_REQUESTED',
    QUEUED = 'QUEUED',
    SENT = 'SENT',
    FAILED = 'FAILED',
    SKIPPED_NO_PROVIDER = 'SKIPPED_NO_PROVIDER',
    SUPPRESSED = 'SUPPRESSED',
}

// Response types
export interface MessageSummary {
    id: string;
    eventId: string | null;
    type: MessageType;
    title: string;
    status: MessageStatus;
    recipientCount: number;
    readCount: number;
    createdAt: Date;
    createdBy: string;
}

export interface MessageDetail extends MessageSummary {
    bodyRich: any;
    bodyText: string | null;
    actionButtons: ActionButton[];
    recipientFilter: RecipientFilter | null;
    resolvedAt: Date | null;
}

export interface InboxItem {
    recipientId: string;
    messageId: string;
    title: string;
    type: MessageType;
    eventId: string | null;
    createdAt: Date;
    readAt: Date | null;
    preview: string; // First 100 chars of bodyText
    actionType?: 'OPEN_STEP' | 'OPEN_APPLICATION' | 'EXTERNAL_LINK';
    actionPayload?: Record<string, string>;
    actionLabel?: string;
}

export interface InboxDetail extends InboxItem {
    bodyRich: any;
    bodyText: string | null;
    actionButtons: ActionButton[];
}
