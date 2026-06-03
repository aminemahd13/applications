import { matchesFieldAnswer } from './field-answer-match';
import type {
    ApplicantConditionGroup,
    ApplicantConditionNode,
    ApplicantProfileField,
    DeadlineRule,
} from '../dtos/workflow.dto';

/**
 * Inputs an applicant-condition tree is evaluated against. Built once per
 * (application, request) and reused for every step's deadline rules.
 */
export interface ApplicantDeadlineContext {
    /** Applicant profile fields referenced by `profile` condition leaves. */
    profile: Partial<Record<ApplicantProfileField, string | null | undefined>>;
    /**
     * Effective answers for this application keyed by stepId, each a map of
     * fieldKey -> answer value. A step the applicant hasn't submitted yet is
     * simply absent, so its `field_answer` leaves evaluate to false.
     */
    answersByStep: Map<string, Record<string, unknown>>;
}

function isGroup(node: ApplicantConditionNode): node is ApplicantConditionGroup {
    return (node as ApplicantConditionGroup).type === 'group';
}

function countLeaves(node: ApplicantConditionNode): number {
    if (!isGroup(node)) return 1;
    return (node.children ?? []).reduce((n, c) => n + countLeaves(c), 0);
}

/**
 * Recursively evaluate an applicant-condition tree. Groups combine their
 * children with AND (`mode: 'all'`) or OR (`mode: 'any'`) and may `negate` the
 * result. Leaves delegate to `matchesFieldAnswer` so option/free-text semantics
 * stay identical to the applications & messaging filters. An empty group is
 * vacuously true (callers skip empty *rules* via `resolveStepDeadline`).
 */
export function evaluateApplicantCondition(
    node: ApplicantConditionNode,
    ctx: ApplicantDeadlineContext,
): boolean {
    if (isGroup(node)) {
        const children = node.children ?? [];
        let result: boolean;
        if (children.length === 0) {
            result = true;
        } else if (node.mode === 'any') {
            result = children.some((c) => evaluateApplicantCondition(c, ctx));
        } else {
            result = children.every((c) => evaluateApplicantCondition(c, ctx));
        }
        return node.negate ? !result : result;
    }

    if (node.kind === 'profile') {
        return matchesFieldAnswer(
            ctx.profile?.[node.field],
            node.matcher ?? 'any',
            node.values,
        );
    }

    // kind === 'field_answer' — false until that earlier step is submitted.
    const answers = ctx.answersByStep.get(node.stepId);
    return matchesFieldAnswer(
        answers?.[node.fieldKey],
        node.matcher ?? 'any',
        node.values,
    );
}

/**
 * Resolve the effective deadline for one step + applicant: the deadline of the
 * first rule whose condition matches (ordered, first-match-wins), else the base
 * `deadline_at`. Rules with no criteria (incomplete) are skipped. Returns a
 * normalized `Date | null`.
 */
export function resolveStepDeadline(
    rules: DeadlineRule[] | null | undefined,
    baseDeadline: Date | string | null | undefined,
    ctx: ApplicantDeadlineContext,
): Date | null {
    const base = baseDeadline ? new Date(baseDeadline) : null;
    if (!Array.isArray(rules) || rules.length === 0) return base;

    for (const rule of rules) {
        if (!rule?.condition || countLeaves(rule.condition) === 0) continue;
        if (evaluateApplicantCondition(rule.condition, ctx)) {
            return rule.deadlineAt ? new Date(rule.deadlineAt) : base;
        }
    }
    return base;
}
