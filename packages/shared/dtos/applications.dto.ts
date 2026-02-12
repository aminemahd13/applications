import { z } from 'zod';

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
    tags: z.array(z.string()).optional(),
    q: z.string().optional(), // Search by applicant name/email
});

export type ApplicationFilterDto = z.infer<typeof ApplicationFilterSchema>;

export const SetDecisionSchema = z.object({
    status: z.nativeEnum(DecisionStatus),
    draft: z.boolean().default(true), // If true, only updates decision_status, not published_at
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
    tags: string[];
    derivedStatus: string; // Dynamic status based on steps and decision
    createdAt: Date;
    updatedAt: Date;
    stepsSummary?: {
        total: number;
        completed: number;
        needsRevision: number;
    };
}

export interface ApplicantProfile {
    fullName?: string;
    phone?: string;
    education?: string;
    institution?: string;
    city?: string;
    country?: string;
    links?: string[];
}

export interface ApplicationDetail extends ApplicationSummary {
    internalNotes: string | null;
    assignedReviewerId: string | null;
    applicantProfile?: ApplicantProfile;
    stepStates: StepStateResponse[];
}

export interface StepStateResponse {
    id?: string;
    stepId: string;
    stepTitle: string;
    stepIndex: number;
    status: StepStatus;
    deadlineAt?: Date | null;
    instructions?: string;
    formDefinition?: Record<string, any>;
    answers?: Record<string, any>;
    currentDraftId: string | null;
    latestSubmissionVersionId: string | null;
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
