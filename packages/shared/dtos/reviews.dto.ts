import { z } from 'zod';
import { StepStatus } from './applications.dto';

// ============================================================
// REVIEW ENUMS
// ============================================================

export enum ReviewOutcome {
    APPROVE = 'APPROVE',
    REJECT = 'REJECT',
    REQUEST_INFO = 'REQUEST_INFO',
}

export enum NeedsInfoStatus {
    OPEN = 'OPEN',
    RESOLVED = 'RESOLVED',
    EXPIRED = 'EXPIRED',
    CANCELED = 'CANCELED',
}

export enum FieldCheckStatus {
    VERIFIED = 'VERIFIED',
    ISSUE = 'ISSUE',
    REJECTED = 'REJECTED',
}

// ============================================================
// REVIEW DTOs
// ============================================================

export const FieldCheckSchema = z.object({
    fieldKey: z.string(),
    status: z.nativeEnum(FieldCheckStatus),
    reason: z.string().optional(),
});

export type FieldCheckDto = z.infer<typeof FieldCheckSchema>;

export const FileCheckSchema = z.object({
    fieldKey: z.string(),
    fileObjectId: z.string().uuid(),
    status: z.nativeEnum(FieldCheckStatus),
    reason: z.string().optional(),
});

export type FileCheckDto = z.infer<typeof FileCheckSchema>;

export const CreateReviewSchema = z.object({
    outcome: z.nativeEnum(ReviewOutcome),
    checklistResult: z.record(z.string(), z.boolean()).optional(), // checklist item ID → pass/fail
    fieldChecks: z.array(FieldCheckSchema).optional(),
    fileChecks: z.array(FileCheckSchema).optional(),
    messageToApplicant: z.string().optional(),
    notesInternal: z.string().optional(),
    // For REQUEST_INFO:
    targetFieldIds: z.array(z.string()).optional(),
    deadline: z.coerce.date().optional(),
});

export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;

// ============================================================
// REVIEW QUEUE DTOs
// ============================================================

export const ReviewQueueFilterSchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    stepId: z.string().uuid().optional(),
    assignedTo: z.enum(['me', 'any', 'unassigned']).optional(),
    status: z.enum(['pending', 'needs_info', 'resubmitted']).optional(),
});

export type ReviewQueueFilterDto = z.infer<typeof ReviewQueueFilterSchema>;

// ============================================================
// ADMIN PATCH DTOs
// ============================================================

export enum PatchVisibility {
    INTERNAL_ONLY = 'INTERNAL_ONLY',
    VISIBLE_TO_APPLICANT = 'VISIBLE_TO_APPLICANT',
}

export const JsonPatchOpSchema = z.object({
    op: z.enum(['replace', 'add', 'remove']),
    path: z.string(),
    value: z.any().optional(),
});

export const CreatePatchSchema = z.object({
    ops: z.array(JsonPatchOpSchema),
    reason: z.string().min(1),
    visibility: z.nativeEnum(PatchVisibility).default(PatchVisibility.INTERNAL_ONLY),
});

export type CreatePatchDto = z.infer<typeof CreatePatchSchema>;

// ============================================================
// REVIEW RESPONSE TYPES
// ============================================================

export interface ReviewRecordResponse {
    id: string;
    submissionVersionId: string;
    reviewerId: string;
    reviewerEmail?: string;
    outcome: ReviewOutcome;
    checklistResult: Record<string, boolean>;
    messageToApplicant: string | null;
    notesInternal: string | null;
    createdAt: Date;
}

export interface NeedsInfoResponse {
    id: string;
    applicationId: string;
    stepId: string;
    submissionVersionId: string | null;
    targetFieldIds: string[];
    message: string;
    deadlineAt: Date | null;
    status: NeedsInfoStatus;
    resolvedAt: Date | null;
    resolvedByVersionId?: string | null;
    createdBy: string;
    createdAt: Date;
}

export interface ReviewQueueItem {
    id?: string;
    applicationId: string;
    applicantEmail: string;
    applicantName: string | null;
    stepId: string;
    stepTitle: string;
    stepIndex: number;
    submissionVersionId: string;
    submissionVersionNumber: number;
    submittedAt: Date;
    status?: StepStatus;
    answers?: Record<string, unknown>;
    formDefinition?: Record<string, unknown> | null;
    assignedReviewerId: string | null;
    hasOpenNeedsInfo: boolean;
    isResubmission: boolean;
}

export interface ReviewQueueStats {
    byStep: Array<{
        stepId: string;
        stepTitle: string;
        pendingReview: number;
        needsInfoWaiting: number;
        resubmittedWaiting: number;
    }>;
    totals: {
        pendingReview: number;
        needsInfoWaiting: number;
        resubmittedWaiting: number;
    };
}
