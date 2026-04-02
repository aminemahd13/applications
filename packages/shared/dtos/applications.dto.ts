import { z } from 'zod';
import { StepModificationScope } from './workflow.dto';

// ============================================================
// APPLICATION DTOs
// ============================================================

export enum DecisionStatus {
    NONE = 'NONE',
    ACCEPTED = 'ACCEPTED',
    WAITLISTED = 'WAITLISTED',
    REJECTED = 'REJECTED',
}

export enum StepStatus {
    LOCKED = 'LOCKED',
    UNLOCKED = 'UNLOCKED',
    SUBMITTED = 'SUBMITTED',
    NEEDS_REVISION = 'NEEDS_REVISION',
    APPROVED = 'APPROVED',
    REJECTED_FINAL = 'REJECTED_FINAL',
}

export const DerivedStatusFilterSchema = z.enum([
    'waiting_applicant',
    'waiting_review',
    'revision_required',
    'all_required_steps_approved',
    'accepted',
    'waitlisted',
    'confirmed',
    'rejected',
]);

export type DerivedStatusFilter = z.infer<typeof DerivedStatusFilterSchema>;

export const CompletionBucketSchema = z.enum(['0', '1_49', '50_99', '100']);

export type CompletionBucket = z.infer<typeof CompletionBucketSchema>;

function normalizeQueryArray(value: unknown): string[] | undefined {
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

const QueryBooleanSchema = z.preprocess(
    (value) => normalizeQueryBoolean(value),
    z.boolean().optional(),
);

export const CreateApplicationSchema = z.object({
    // No extra fields needed - eventId and userId come from context
});

export type CreateApplicationDto = z.infer<typeof CreateApplicationSchema>;

export const ApplicationFilterSchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    order: z.enum(['asc', 'desc']).default('desc'),
    decisionStatus: z.nativeEnum(DecisionStatus).optional(),
    stepId: z.string().uuid().optional(), // Filter by step status
    stepStatus: z.nativeEnum(StepStatus).optional(),
    assignedReviewerId: z.string().uuid().optional(),
    tags: z.preprocess(
        (value) => normalizeQueryArray(value),
        z.array(z.string()).optional(),
    ),
    derivedStatus: z.preprocess(
        (value) => normalizeQueryArray(value),
        z.array(DerivedStatusFilterSchema).optional(),
    ),
    hasDraftProgress: QueryBooleanSchema,
    completionBucket: z.preprocess(
        (value) => normalizeQueryArray(value),
        z.array(CompletionBucketSchema).optional(),
    ),
    needsRevisionOnly: QueryBooleanSchema,
    q: z.string().optional(), // Search by applicant name/email
});

export type ApplicationFilterDto = z.infer<typeof ApplicationFilterSchema>;

// ============================================================
// ADVANCED APPLICATION FILTER TREE DTOs
// ============================================================

export const ApplicationsFilterModeSchema = z.enum(['all', 'any']);
export type ApplicationsFilterMode = z.infer<typeof ApplicationsFilterModeSchema>;

export const ApplicationsFilterConditionTypeSchema = z.enum([
    'search_text',
    'decision_status',
    'derived_status',
    'step_status',
    'assigned_reviewer',
    'tags_any',
    'tags_all',
    'tags_none',
    'completion_bucket',
    'has_draft_progress',
    'needs_revision',
]);

export type ApplicationsFilterConditionType = z.infer<
    typeof ApplicationsFilterConditionTypeSchema
>;

const ApplicationsFilterConditionBaseSchema = z.object({
    negate: z.boolean().optional(),
});

export const ApplicationsSearchTextConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('search_text'),
        value: z.string().trim().min(1).max(200),
    });

export const ApplicationsDecisionStatusConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('decision_status'),
        values: z.array(z.nativeEnum(DecisionStatus)).min(1).max(10),
    });

export const ApplicationsDerivedStatusConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('derived_status'),
        values: z.array(DerivedStatusFilterSchema).min(1).max(20),
    });

export const ApplicationsStepStatusConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('step_status'),
        stepId: z.string().uuid(),
        statuses: z.array(z.nativeEnum(StepStatus)).min(1).max(10),
    });

export const ApplicationsAssignedReviewerMatcherSchema = z.enum([
    'any',
    'unassigned',
    'specific',
]);

export type ApplicationsAssignedReviewerMatcher = z.infer<
    typeof ApplicationsAssignedReviewerMatcherSchema
>;

export const ApplicationsAssignedReviewerConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('assigned_reviewer'),
        matcher: ApplicationsAssignedReviewerMatcherSchema,
        reviewerId: z.string().uuid().optional(),
    }).superRefine((value, ctx) => {
        if (value.matcher === 'specific' && !value.reviewerId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'reviewerId is required when matcher is "specific"',
                path: ['reviewerId'],
            });
        }
        if (value.matcher !== 'specific' && value.reviewerId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'reviewerId is only allowed when matcher is "specific"',
                path: ['reviewerId'],
            });
        }
    });

const ApplicationsTagsValueSchema = z.array(z.string().trim().min(1)).min(1).max(50);

export const ApplicationsTagsAnyConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('tags_any'),
        values: ApplicationsTagsValueSchema,
    });

export const ApplicationsTagsAllConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('tags_all'),
        values: ApplicationsTagsValueSchema,
    });

export const ApplicationsTagsNoneConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('tags_none'),
        values: ApplicationsTagsValueSchema,
    });

export const ApplicationsCompletionBucketConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('completion_bucket'),
        values: z.array(CompletionBucketSchema).min(1).max(4),
    });

export const ApplicationsHasDraftProgressConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('has_draft_progress'),
        value: z.boolean(),
    });

export const ApplicationsNeedsRevisionConditionSchema =
    ApplicationsFilterConditionBaseSchema.extend({
        type: z.literal('needs_revision'),
        value: z.boolean(),
    });

export const ApplicationsFilterConditionSchema = z.discriminatedUnion('type', [
    ApplicationsSearchTextConditionSchema,
    ApplicationsDecisionStatusConditionSchema,
    ApplicationsDerivedStatusConditionSchema,
    ApplicationsStepStatusConditionSchema,
    ApplicationsAssignedReviewerConditionSchema,
    ApplicationsTagsAnyConditionSchema,
    ApplicationsTagsAllConditionSchema,
    ApplicationsTagsNoneConditionSchema,
    ApplicationsCompletionBucketConditionSchema,
    ApplicationsHasDraftProgressConditionSchema,
    ApplicationsNeedsRevisionConditionSchema,
]);

export type ApplicationsFilterCondition = z.infer<
    typeof ApplicationsFilterConditionSchema
>;

export interface ApplicationsFilterGroup {
    type: 'group';
    mode: ApplicationsFilterMode;
    negate?: boolean;
    children: ApplicationsFilterTreeNode[];
}

export type ApplicationsFilterTreeNode =
    | ApplicationsFilterGroup
    | ApplicationsFilterCondition;

export const ApplicationsFilterTreeNodeSchema: z.ZodType<ApplicationsFilterTreeNode> =
    z.lazy(() =>
        z.union([
            z.object({
                type: z.literal('group'),
                mode: ApplicationsFilterModeSchema.default('all'),
                negate: z.boolean().optional(),
                children: z.array(ApplicationsFilterTreeNodeSchema).max(40).default([]),
            }),
            ApplicationsFilterConditionSchema,
        ]),
    );

export const ApplicationsFilterGroupSchema = ApplicationsFilterTreeNodeSchema.refine(
    (value): value is ApplicationsFilterGroup => value.type === 'group',
    {
        message: 'Root filterTree node must be a group',
    },
);

function analyzeApplicationsFilterTree(
    node: ApplicationsFilterTreeNode,
    depth = 1,
): { maxDepth: number; conditionCount: number } {
    if (node.type !== 'group') {
        return { maxDepth: depth, conditionCount: 1 };
    }

    let maxDepth = depth;
    let conditionCount = 0;
    for (const child of node.children ?? []) {
        const childStats = analyzeApplicationsFilterTree(child, depth + 1);
        maxDepth = Math.max(maxDepth, childStats.maxDepth);
        conditionCount += childStats.conditionCount;
    }
    return { maxDepth, conditionCount };
}

export const ApplicationsQueryRequestSchema = z
    .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
        order: z.enum(['asc', 'desc']).default('desc'),
        filterTree: ApplicationsFilterGroupSchema.default({
            type: 'group',
            mode: 'all',
            negate: false,
            children: [],
        }),
    })
    .superRefine((value, ctx) => {
        const stats = analyzeApplicationsFilterTree(value.filterTree);
        // Root group depth is 1. Maximum accepted depth is 3.
        if (stats.maxDepth > 3) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'filterTree nesting depth cannot exceed 3',
                path: ['filterTree'],
            });
        }
        if (stats.conditionCount > 40) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'filterTree cannot contain more than 40 conditions',
                path: ['filterTree'],
            });
        }
    });

export type ApplicationsQueryRequestDto = z.infer<
    typeof ApplicationsQueryRequestSchema
>;

export const ApplicationsQuickFilterStateSchema = z.object({
    searchQuery: z.string().max(200).optional(),
    derivedStatus: z.array(DerivedStatusFilterSchema).max(20).optional(),
    decisionStatus: z.union([z.literal('all'), z.nativeEnum(DecisionStatus)]).optional(),
    stepId: z.string().uuid().optional(),
    stepStatus: z.union([z.literal('all'), z.nativeEnum(StepStatus)]).optional(),
    reviewerId: z.union([z.literal('__any__'), z.string().uuid()]).optional(),
    tagsInput: z.string().max(500).optional(),
    hasDraftProgress: z.boolean().optional(),
    completionBucket: z.array(CompletionBucketSchema).max(4).optional(),
    needsRevisionOnly: z.boolean().optional(),
});

export type ApplicationsQuickFilterState = z.infer<
    typeof ApplicationsQuickFilterStateSchema
>;

export const ApplicationsSavedViewModeSchema = z.enum(['quick', 'advanced']);
export type ApplicationsSavedViewMode = z.infer<
    typeof ApplicationsSavedViewModeSchema
>;

export const ApplicationsSavedViewPayloadSchema = z.object({
    kind: z.literal('applications').default('applications'),
    version: z.number().int().min(1).default(1),
    mode: ApplicationsSavedViewModeSchema.default('advanced'),
    filterTree: ApplicationsFilterGroupSchema,
    quickState: ApplicationsQuickFilterStateSchema.optional(),
});

export type ApplicationsSavedViewPayload = z.infer<
    typeof ApplicationsSavedViewPayloadSchema
>;

export const CreateApplicationSavedViewSchema = z.object({
    name: z.string().trim().min(1).max(100),
    mode: ApplicationsSavedViewModeSchema.default('advanced'),
    filterTree: ApplicationsFilterGroupSchema,
    quickState: ApplicationsQuickFilterStateSchema.optional(),
});

export type CreateApplicationSavedViewDto = z.infer<
    typeof CreateApplicationSavedViewSchema
>;

export const UpdateApplicationSavedViewSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    mode: ApplicationsSavedViewModeSchema.optional(),
    filterTree: ApplicationsFilterGroupSchema.optional(),
    quickState: ApplicationsQuickFilterStateSchema.optional(),
});

export type UpdateApplicationSavedViewDto = z.infer<
    typeof UpdateApplicationSavedViewSchema
>;

export interface ApplicationSavedView {
    id: string;
    eventId: string;
    name: string;
    mode: ApplicationsSavedViewMode;
    filterTree: ApplicationsFilterGroup;
    quickState?: ApplicationsQuickFilterState;
    createdBy: string;
    createdByEmail?: string;
    createdByName?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export const SetDecisionSchema = z.object({
    status: z.nativeEnum(DecisionStatus),
    draft: z.boolean().default(true), // If true, only updates decision_status, not published_at
    templateId: z.string().uuid().nullable().optional(),
});

export type SetDecisionDto = z.infer<typeof SetDecisionSchema>;

export const UpdateApplicationTagsSchema = z.object({
    tags: z.array(z.string().trim().min(1)).max(100),
});

export type UpdateApplicationTagsDto = z.infer<typeof UpdateApplicationTagsSchema>;

export const UpdateApplicationNotesSchema = z.object({
    internalNotes: z.string().max(20000).nullable(),
});

export type UpdateApplicationNotesDto = z.infer<typeof UpdateApplicationNotesSchema>;

export const PublishDecisionsSchema = z.object({
    applicationIds: z.array(z.string().uuid()).optional(),
    filter: ApplicationFilterSchema.optional(), // Bulk publish by filter? For now just explicit IDs
    // Simplified: Just IDs for now to avoid accidental mass publish
});

export type PublishDecisionsDto = z.infer<typeof PublishDecisionsSchema>;

export const BulkApplicationIdsSchema = z.object({
    applicationIds: z.array(z.string().uuid()).min(1).max(500),
});

export const BulkApplicationTagsSchema = BulkApplicationIdsSchema.extend({
    addTags: z.array(z.string().trim().min(1)).max(50).optional().default([]),
    removeTags: z.array(z.string().trim().min(1)).max(50).optional().default([]),
});

export type BulkApplicationTagsDto = z.infer<typeof BulkApplicationTagsSchema>;

export const BulkAssignReviewerSchema = BulkApplicationIdsSchema.extend({
    reviewerId: z.string().uuid().nullable(),
});

export type BulkAssignReviewerDto = z.infer<typeof BulkAssignReviewerSchema>;

export const BulkDecisionDraftSchema = BulkApplicationIdsSchema.extend({
    status: z.nativeEnum(DecisionStatus).refine(
        (status) => status !== DecisionStatus.NONE,
        { message: 'Bulk decision draft status must be ACCEPTED, WAITLISTED, or REJECTED' },
    ),
    templateId: z.string().uuid().nullable().optional(),
});

export type BulkDecisionDraftDto = z.infer<typeof BulkDecisionDraftSchema>;

export const BulkStepActionSchema = BulkApplicationIdsSchema.extend({
    stepId: z.string().uuid(),
    action: z.enum(['UNLOCK', 'SUBMITTED', 'APPROVE', 'REJECT', 'LOCK']),
});

export type BulkStepActionDto = z.infer<typeof BulkStepActionSchema>;

export const DecisionTemplateStatusSchema = z.enum([
    DecisionStatus.ACCEPTED,
    DecisionStatus.WAITLISTED,
    DecisionStatus.REJECTED,
]);

export type DecisionTemplateStatus = z.infer<typeof DecisionTemplateStatusSchema>;

export const CreateDecisionTemplateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    status: DecisionTemplateStatusSchema,
    subjectTemplate: z.string().trim().min(1).max(200),
    bodyTemplate: z.string().trim().min(1).max(10000),
    isActive: z.boolean().optional().default(true),
});

export type CreateDecisionTemplateDto = z.infer<typeof CreateDecisionTemplateSchema>;

export const UpdateDecisionTemplateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    status: DecisionTemplateStatusSchema.optional(),
    subjectTemplate: z.string().trim().min(1).max(200).optional(),
    bodyTemplate: z.string().trim().min(1).max(10000).optional(),
    isActive: z.boolean().optional(),
});

export type UpdateDecisionTemplateDto = z.infer<typeof UpdateDecisionTemplateSchema>;

export interface DecisionTemplateResponse {
    id: string;
    eventId: string;
    name: string;
    status: DecisionTemplateStatus;
    subjectTemplate: string;
    bodyTemplate: string;
    isActive: boolean;
    createdBy: string;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================
// STEP SUBMISSION DTOs
// ============================================================

export const SaveDraftSchema = z.object({
    answers: z.record(z.string(), z.any()), // Field ID → value
});

export type SaveDraftDto = z.infer<typeof SaveDraftSchema>;

export const SubmitStepSchema = z.object({
    answers: z.record(z.string(), z.any()), // Field ID → value (final submission)
});

export type SubmitStepDto = z.infer<typeof SubmitStepSchema>;

// ============================================================
// APPLICATION RESPONSE TYPES
// ============================================================

export interface ApplicationSummary {
    id: string;
    eventId: string;
    applicantUserId: string;
    applicantEmail?: string;
    applicantName?: string;
    decisionStatus: DecisionStatus;
    decisionPublishedAt: Date | null;
    decisionDraft?: Record<string, any>;
    tags: string[];
    derivedStatus: string; // Dynamic status based on steps and decision
    createdAt: Date;
    updatedAt: Date;
    stepsSummary?: {
        total: number;
        completed: number;
        progressed: number;
        progressPercent: number;
        needsRevision: number;
    };
}

export interface ApplicantProfile {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    education?: string;
    institution?: string;
    city?: string;
    country?: string;
    links?: string[];
}

export interface CompletionCredential {
    certificateId: string;
    credentialId: string;
    certificateUrl: string;
    verifiableCredentialUrl: string;
    issuedAt: Date;
    revokedAt: Date | null;
    status: "ISSUED" | "REVOKED";
}

export interface ApplicationDetail extends ApplicationSummary {
    internalNotes: string | null;
    assignedReviewerId: string | null;
    applicantProfile?: ApplicantProfile;
    completionCredential?: CompletionCredential;
    stepStates: StepStateResponse[];
}

export interface StepStateResponse {
    id?: string;
    stepId: string;
    stepTitle: string;
    stepIndex: number;
    category?: string;
    status: StepStatus;
    deadlineAt?: Date | null;
    instructions?: string;
    formDefinition?: Record<string, any>;
    answers?: Record<string, any>;
    answersSource: 'SUBMISSION' | 'DRAFT' | null;
    currentDraftId: string | null;
    latestSubmissionVersionId: string | null;
    allowApplicantModification?: boolean;
    modificationScope?: StepModificationScope;
    revisionCycleCount: number;
    unlockedAt: Date | null;
    lastActivityAt: Date;
}

export interface SubmissionVersionResponse {
    id: string;
    applicationId: string;
    stepId: string;
    formVersionId: string;
    versionNumber: number;
    answersSnapshot: Record<string, any>;
    submittedAt: Date;
    submittedBy: string;
}

export interface EffectiveDataResponse {
    stepId: string;
    formVersionId: string;
    baseAnswers: Record<string, any>; // From submission
    patches: PatchSummary[];
    effectiveAnswers: Record<string, any>; // Base + patches applied
}

export interface PatchSummary {
    id: string;
    reason: string;
    visibility: string;
    createdBy: string;
    createdAt: Date;
}
