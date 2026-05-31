import type { FieldAnswerMatcher } from '../dtos/applications.dto';

/**
 * Normalize a stored form answer into a set of trimmed string values.
 * - Single-value fields (SELECT/RADIO/TEXT/NUMBER) are stored as a string.
 * - Multi-value fields (MULTISELECT/CHECKBOX) are stored as a string[].
 * - File-upload / object answers are not matchable as values -> empty set.
 */
export function normalizeAnswerToStringSet(answer: unknown): Set<string> {
    const set = new Set<string>();
    if (answer === null || answer === undefined) return set;
    if (Array.isArray(answer)) {
        for (const item of answer) {
            if (item === null || item === undefined) continue;
            if (typeof item === 'object') continue;
            const s = String(item).trim();
            if (s.length > 0) set.add(s);
        }
        return set;
    }
    if (typeof answer === 'object') return set;
    const s = String(answer).trim();
    if (s.length > 0) set.add(s);
    return set;
}

function answerToText(answer: unknown): string {
    if (answer === null || answer === undefined) return '';
    if (Array.isArray(answer)) {
        return answer
            .map((a) => (a === null || a === undefined || typeof a === 'object' ? '' : String(a)))
            .join(' ');
    }
    if (typeof answer === 'object') return '';
    return String(answer);
}

/**
 * Decide whether a single answer satisfies a field-answer criterion. Shared by
 * the applications filter and the messaging recipient filter so semantics never
 * drift. `negate` is applied by the caller (mirrors the other filter conditions).
 */
export function matchesFieldAnswer(
    answer: unknown,
    matcher: FieldAnswerMatcher,
    values: string[],
): boolean {
    const wanted = values.map((v) => v.trim()).filter((v) => v.length > 0);
    if (wanted.length === 0) return false;

    switch (matcher) {
        case 'any': {
            const have = normalizeAnswerToStringSet(answer);
            return wanted.some((v) => have.has(v));
        }
        case 'all': {
            const have = normalizeAnswerToStringSet(answer);
            return wanted.every((v) => have.has(v));
        }
        case 'none': {
            const have = normalizeAnswerToStringSet(answer);
            return wanted.every((v) => !have.has(v));
        }
        case 'equals': {
            const have = new Set(
                Array.from(normalizeAnswerToStringSet(answer), (s) => s.toLowerCase()),
            );
            return wanted.some((v) => have.has(v.toLowerCase()));
        }
        case 'contains': {
            const text = answerToText(answer).toLowerCase();
            return wanted.some((v) => text.includes(v.toLowerCase()));
        }
        case 'not_contains': {
            const text = answerToText(answer).toLowerCase();
            return wanted.every((v) => !text.includes(v.toLowerCase()));
        }
        default:
            return false;
    }
}
