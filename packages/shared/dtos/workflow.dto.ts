import { z } from 'zod';
import { FieldAnswerMatcherSchema } from './applications.dto';

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

export enum StepModificationScope {
    SUBMITTED_ONLY = 'SUBMITTED_ONLY',
    SUBMITTED_OR_APPROVED = 'SUBMITTED_OR_APPROVED',
}

// ============================================================
// CONDITIONAL STEP DEADLINES
// ============================================================

/** Known education-level values (kept in sync with the applicant profile form). */
export const EDUCATION_LEVEL_OPTIONS = [
    'Middle School',
    'High School',
    'Undergraduate',
    'Graduate',
    'PhD',
    'Other',
] as const;

export const ApplicantProfileFieldSchema = z.enum([
    'education_level',
    'country',
    'city',
    'institution',
]);
export type ApplicantProfileField = z.infer<typeof ApplicantProfileFieldSchema>;

const conditionValuesSchema = z.array(z.string().trim().min(1)).min(1).max(50);

export const ApplicantConditionLeafSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('profile'),
        field: ApplicantProfileFieldSchema,
        matcher: FieldAnswerMatcherSchema.default('any'),
        values: conditionValuesSchema,
    }),
    z.object({
        kind: z.literal('field_answer'),
        stepId: z.string().uuid(),
        fieldKey: z.string().trim().min(1).max(200),
        matcher: FieldAnswerMatcherSchema.default('any'),
        values: conditionValuesSchema,
    }),
]);
export type ApplicantConditionLeaf = z.infer<typeof ApplicantConditionLeafSchema>;

export interface ApplicantConditionGroup {
    type: 'group';
    mode: 'all' | 'any';
    negate?: boolean;
    children: ApplicantConditionNode[];
}
export type ApplicantConditionNode =
    | ApplicantConditionGroup
    | ApplicantConditionLeaf;

export const ApplicantConditionNodeSchema: z.ZodType<ApplicantConditionNode> =
    z.lazy(() =>
        z.union([
            z.object({
                type: z.literal('group'),
                mode: z.enum(['all', 'any']).default('all'),
                negate: z.boolean().optional(),
                children: z
                    .array(ApplicantConditionNodeSchema)
                    .max(40)
                    .default([]),
            }),
            ApplicantConditionLeafSchema,
        ]),
    );

export const ApplicantConditionGroupSchema = ApplicantConditionNodeSchema.refine(
    (value): value is ApplicantConditionGroup =>
        !!value &&
        typeof value === 'object' &&
        (value as { type?: unknown }).type === 'group',
    { message: 'Condition root must be a group' },
);

function analyzeApplicantConditionTree(
    node: ApplicantConditionNode,
    depth = 1,
): { maxDepth: number; leafCount: number } {
    if ((node as ApplicantConditionGroup).type !== 'group') {
        return { maxDepth: depth, leafCount: 1 };
    }
    let maxDepth = depth;
    let leafCount = 0;
    for (const child of (node as ApplicantConditionGroup).children ?? []) {
        const r = analyzeApplicantConditionTree(child, depth + 1);
        maxDepth = Math.max(maxDepth, r.maxDepth);
        leafCount += r.leafCount;
    }
    return { maxDepth, leafCount };
}

export const DeadlineRuleSchema = z.object({
    condition: ApplicantConditionGroupSchema.superRefine((value, ctx) => {
        const stats = analyzeApplicantConditionTree(value);
        if (stats.maxDepth > 3) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'condition nesting depth cannot exceed 3',
            });
        }
        if (stats.leafCount > 40) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'condition cannot contain more than 40 criteria',
            });
        }
    }),
    deadlineAt: z.coerce.date(),
});
export type DeadlineRule = z.infer<typeof DeadlineRuleSchema>;

export const CreateWorkflowStepSchema = z.object({
    title: z.string().min(1).max(200),
    category: z.nativeEnum(StepCategory).default(StepCategory.APPLICATION),
    instructionsRich: z.any().optional(), // Rich text JSON
    unlockPolicy: z.nativeEnum(UnlockPolicy).default(UnlockPolicy.AUTO_AFTER_PREV_SUBMITTED),
    unlockAt: z.coerce.date().optional().nullable(),
    reviewRequired: z.boolean().default(false),
    rejectBehavior: z.nativeEnum(RejectBehavior).default(RejectBehavior.RESUBMIT_ALLOWED),
    strictGating: z.boolean().default(true),
    allowNextStepsWhileRevising: z.boolean().default(true),
    revisionDeadlineAt: z.coerce.date().optional().nullable(),
    deadlineAt: z.coerce.date().optional().nullable(),
    deadlineRules: z.array(DeadlineRuleSchema).max(20).optional(),
    formVersionId: z.string().uuid().optional().nullable(),
    sensitivityLevel: z.nativeEnum(SensitivityLevel).default(SensitivityLevel.NORMAL),
    hidden: z.boolean().default(false),
    allowApplicantModification: z.boolean().default(false),
    modificationScope: z.nativeEnum(StepModificationScope).default(
        StepModificationScope.SUBMITTED_ONLY,
    ),
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
