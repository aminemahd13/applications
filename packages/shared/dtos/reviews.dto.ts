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
    tags: z
        .preprocess((value) => {
            if (typeof value === 'string') {
                const items = value
                    .split(',')
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0);
                return items;
            }
            if (Array.isArray(value)) {
                return value
                    .map((entry) =>
                        typeof entry === 'string' ? entry.trim() : '',
                    )
                    .filter((entry) => entry.length > 0);
            }
            return undefined;
        }, z.array(z.string().trim().min(1)).max(20))
        .optional(),
});

export type ReviewQueueFilterDto = z.infer<typeof ReviewQueueFilterSchema>;

// ============================================================
// REVIEWER ASSIGNMENT DTOs
// ============================================================

export const ReviewerAssignmentModeSchema = z.enum([
    'equal_distribution',
    'fixed_per_reviewer',
    'hybrid_manual_then_random',
    'pure_random',
]);

export type ReviewerAssignmentMode = z.infer<
    typeof ReviewerAssignmentModeSchema
>;

export const ReviewerAssignmentRunPolicySchema = z.enum([
    'reassign_all',
    'unassigned_only',
]);

export type ReviewerAssignmentRunPolicy = z.infer<
    typeof ReviewerAssignmentRunPolicySchema
>;

export const ReviewerAssignmentHybridTargetSchema = z.object({
    reviewerId: z.string().uuid(),
    count: z.coerce.number().int().min(0),
});

export type ReviewerAssignmentHybridTargetDto = z.infer<
    typeof ReviewerAssignmentHybridTargetSchema
>;

export const ReviewerAssignmentPreviewRequestSchema = z
    .object({
        mode: ReviewerAssignmentModeSchema,
        reviewerPoolUserIds: z.array(z.string().uuid()).min(1).max(500),
        includeStepIds: z.array(z.string().uuid()).max(200).optional().default([]),
        excludeStepIds: z.array(z.string().uuid()).max(200).optional().default([]),
        runPolicy: ReviewerAssignmentRunPolicySchema.default('reassign_all'),
        ttlMinutes: z.coerce.number().int().min(1).max(10080).optional(),
        fixedReviewsPerReviewer: z.coerce.number().int().min(0).optional(),
        hybridTargets: z
            .array(ReviewerAssignmentHybridTargetSchema)
            .max(500)
            .optional()
            .default([]),
    })
    .superRefine((value, ctx) => {
        if (
            value.mode === 'fixed_per_reviewer' &&
            value.fixedReviewsPerReviewer === undefined
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'fixedReviewsPerReviewer is required for fixed_per_reviewer mode',
                path: ['fixedReviewsPerReviewer'],
            });
        }

        if (
            value.mode !== 'fixed_per_reviewer' &&
            value.fixedReviewsPerReviewer !== undefined
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'fixedReviewsPerReviewer is only allowed in fixed_per_reviewer mode',
                path: ['fixedReviewsPerReviewer'],
            });
        }

        if (
            value.mode === 'hybrid_manual_then_random' &&
            (!Array.isArray(value.hybridTargets) || value.hybridTargets.length === 0)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'hybridTargets is required for hybrid_manual_then_random mode',
                path: ['hybridTargets'],
            });
        }

        if (
            value.mode !== 'hybrid_manual_then_random' &&
            Array.isArray(value.hybridTargets) &&
            value.hybridTargets.length > 0
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'hybridTargets is only allowed in hybrid_manual_then_random mode',
                path: ['hybridTargets'],
            });
        }
    });

export type ReviewerAssignmentPreviewRequestDto = z.infer<
    typeof ReviewerAssignmentPreviewRequestSchema
>;

export const ReviewerAssignmentApplyRequestSchema = z.object({
    previewId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(1).max(200),
});

export type ReviewerAssignmentApplyRequestDto = z.infer<
    typeof ReviewerAssignmentApplyRequestSchema
>;

export const ReviewerQueueItemOverrideActionSchema = z.enum([
    'assign_direct',
    'release_shared',
    'reassign_direct',
]);

export type ReviewerQueueItemOverrideAction = z.infer<
    typeof ReviewerQueueItemOverrideActionSchema
>;

export const ReviewerQueueItemOverrideRequestSchema = z
    .object({
        action: ReviewerQueueItemOverrideActionSchema,
        reviewerId: z.string().uuid().optional(),
        ttlMinutes: z.coerce.number().int().min(1).max(10080).optional(),
    })
    .superRefine((value, ctx) => {
        const needsReviewer =
            value.action === 'assign_direct' || value.action === 'reassign_direct';
        if (needsReviewer && !value.reviewerId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'reviewerId is required for direct assignment actions',
                path: ['reviewerId'],
            });
        }
        if (value.action === 'release_shared' && value.reviewerId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'reviewerId is not allowed for release_shared',
                path: ['reviewerId'],
            });
        }
    });

export type ReviewerQueueItemOverrideRequestDto = z.infer<
    typeof ReviewerQueueItemOverrideRequestSchema
>;

export const ReviewQueueItemClaimResponseSchema = z.object({
    queueItemId: z.string().uuid(),
    queueMode: z.literal('direct'),
    assignedReviewerId: z.string().uuid(),
    assignmentExpiresAt: z.coerce.date().nullable(),
});

export type ReviewQueueItemClaimResponseDto = z.infer<
    typeof ReviewQueueItemClaimResponseSchema
>;

export const ReviewQueueItemReleaseResponseSchema = z.object({
    queueItemId: z.string().uuid(),
    queueMode: z.literal('shared'),
    assignedReviewerId: z.null(),
    assignmentExpiresAt: z.null(),
});

export type ReviewQueueItemReleaseResponseDto = z.infer<
    typeof ReviewQueueItemReleaseResponseSchema
>;

export const ReviewQueueSavedViewFilterSchema = z.object({
    stepId: z.string().uuid().optional(),
    assignedTo: z.enum(['me', 'any', 'unassigned']).optional(),
    status: z.enum(['pending', 'needs_info', 'resubmitted']).optional(),
    tags: z.array(z.string().trim().min(1)).max(20).optional(),
});

export type ReviewQueueSavedViewFilterDto = z.infer<
    typeof ReviewQueueSavedViewFilterSchema
>;

export const CreateReviewQueueSavedViewSchema = z.object({
    name: z.string().trim().min(1).max(100),
    isDefault: z.boolean().optional().default(false),
    filters: ReviewQueueSavedViewFilterSchema.default({}),
});

export type CreateReviewQueueSavedViewDto = z.infer<
    typeof CreateReviewQueueSavedViewSchema
>;

export const UpdateReviewQueueSavedViewSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    isDefault: z.boolean().optional(),
    filters: ReviewQueueSavedViewFilterSchema.optional(),
});

export type UpdateReviewQueueSavedViewDto = z.infer<
    typeof UpdateReviewQueueSavedViewSchema
>;

export interface ReviewQueueSavedView {
    id: string;
    eventId: string;
    name: string;
    isDefault: boolean;
    filters: ReviewQueueSavedViewFilterDto;
    createdAt: Date;
    updatedAt: Date;
}

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
    queueItemId?: string;
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
    assignedReviewerEmail?: string | null;
    assignedReviewerName?: string | null;
    queueMode?: 'direct' | 'shared';
    assignmentExpiresAt?: Date | null;
    isOverdue?: boolean;
    tags?: string[];
    hasOpenNeedsInfo: boolean;
    isResubmission: boolean;
}

export interface ReviewerAssignmentContextResponse {
    steps: Array<{
        stepId: string;
        stepTitle: string;
        stepIndex: number;
    }>;
    reviewers: Array<{
        userId: string;
        email: string;
        fullName: string | null;
        roles: string[];
        workload: {
            assigned: number;
            pending: number;
            overdue: number;
            completed: number;
        };
    }>;
    sharedQueueCount: number;
    defaults: {
        defaultTtlMinutes: number;
        previewTtlSeconds: number;
    };
}

export interface ReviewerAssignmentPreviewResponse {
    previewId: string;
    expiresAt: Date;
    mode: ReviewerAssignmentMode;
    runPolicy: ReviewerAssignmentRunPolicy;
    totalCandidates: number;
    operationCount: number;
    sharedQueueAfter: number;
    reviewerImpact: Array<{
        reviewerId: string;
        beforeAssigned: number;
        afterAssigned: number;
        deltaAssigned: number;
    }>;
}

export interface ReviewerAssignmentApplyResponse {
    previewId: string;
    appliedAt: Date;
    updatedItems: number;
    sharedQueueAfter: number;
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
