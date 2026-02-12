import { z } from 'zod';

// ============================================================
// FORM DTOs
// ============================================================

export const CreateFormSchema = z.object({
    name: z.string().min(1).max(200),
});

export type CreateFormDto = z.infer<typeof CreateFormSchema>;

export const UpdateFormDraftSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    draftSchema: z.any().optional(), // JSON Schema
    draftUi: z.any().optional(), // UI layout config
});

export type UpdateFormDraftDto = z.infer<typeof UpdateFormDraftSchema>;

// ============================================================
// WORKFLOW STEP DTOs
// ============================================================

export enum UnlockPolicy {
    AUTO_AFTER_PREV_SUBMITTED = 'AUTO_AFTER_PREV_SUBMITTED',
    AFTER_PREV_APPROVED = 'AFTER_PREV_APPROVED',
    AFTER_DECISION_ACCEPTED = 'AFTER_DECISION_ACCEPTED',
    DATE_BASED = 'DATE_BASED',
    ADMIN_MANUAL = 'ADMIN_MANUAL',
}

export enum RejectBehavior {
    FINAL = 'FINAL',
    RESUBMIT_ALLOWED = 'RESUBMIT_ALLOWED',
}

export enum StepCategory {
    APPLICATION = 'APPLICATION',
    CONFIRMATION = 'CONFIRMATION',
    INFO_ONLY = 'INFO_ONLY',
}

export enum SensitivityLevel {
    NORMAL = 'NORMAL',
    SENSITIVE = 'SENSITIVE',
}

export const CreateWorkflowStepSchema = z.object({
    title: z.string().min(1).max(200),
    category: z.nativeEnum(StepCategory).default(StepCategory.APPLICATION),
    instructionsRich: z.any().optional(), // Rich text JSON
    unlockPolicy: z.nativeEnum(UnlockPolicy).default(UnlockPolicy.AUTO_AFTER_PREV_SUBMITTED),
    unlockAt: z.coerce.date().optional().nullable(),
    reviewRequired: z.boolean().default(false),
    rejectBehavior: z.nativeEnum(RejectBehavior).default(RejectBehavior.RESUBMIT_ALLOWED),
    strictGating: z.boolean().default(true),
    deadlineAt: z.coerce.date().optional().nullable(),
    formVersionId: z.string().uuid().optional().nullable(),
    sensitivityLevel: z.nativeEnum(SensitivityLevel).default(SensitivityLevel.NORMAL),
});

export type CreateWorkflowStepDto = z.infer<typeof CreateWorkflowStepSchema>;

export const UpdateWorkflowStepSchema = CreateWorkflowStepSchema.partial();

export type UpdateWorkflowStepDto = z.infer<typeof UpdateWorkflowStepSchema>;

export const ReorderWorkflowSchema = z.object({
    stepIds: z.array(z.string().uuid()),
});

export type ReorderWorkflowDto = z.infer<typeof ReorderWorkflowSchema>;

// ============================================================
// WORKFLOW VALIDATION RESULT
// ============================================================

export interface WorkflowValidationResult {
    valid: boolean;
    errors: WorkflowValidationIssue[];
    warnings: WorkflowValidationIssue[];
}

export interface WorkflowValidationIssue {
    stepId: string;
    stepTitle: string;
    code: string;
    message: string;
}

// Validation error codes
export const WorkflowValidationCodes = {
    MISSING_UNLOCK_DATE: 'MISSING_UNLOCK_DATE',
    APPROVAL_GATE_NO_REVIEW: 'APPROVAL_GATE_NO_REVIEW',
    DECISION_STEP_WRONG_CATEGORY: 'DECISION_STEP_WRONG_CATEGORY',
    STEP_NO_FORM: 'STEP_NO_FORM',
    POSITION_GAP: 'POSITION_GAP',
} as const;
