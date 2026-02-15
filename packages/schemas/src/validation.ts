import { z } from 'zod';
import {
    FormDefinition,
    FieldType,
    FieldDefinition,
    normalizeFormDefinition,
    isFieldVisible,
    isFieldRequired,
} from './form-definition';

type FormValueMap = Record<string, unknown>;

interface NormalizedFileValue {
    fileObjectId: string;
    mimeType?: string;
    sizeBytes?: number;
}

function isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function toOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeFileValues(value: unknown): NormalizedFileValue[] {
    if (value === null || value === undefined) return [];

    if (Array.isArray(value)) {
        return value.flatMap((entry) => normalizeFileValues(entry));
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? [{ fileObjectId: trimmed }] : [];
    }

    if (typeof value === 'object') {
        const candidate = value as Record<string, unknown>;
        const fileObjectId =
            typeof candidate.fileObjectId === 'string'
                ? candidate.fileObjectId.trim()
                : '';
        if (!fileObjectId) return [];
        return [
            {
                fileObjectId,
                mimeType:
                    typeof candidate.mimeType === 'string'
                        ? candidate.mimeType
                        : undefined,
                sizeBytes:
                    typeof candidate.sizeBytes === 'number'
                        ? candidate.sizeBytes
                        : undefined,
            },
        ];
    }

    return [];
}

function addIssue(
    ctx: z.RefinementCtx,
    fieldKey: string,
    message: string,
): void {
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [fieldKey],
        message,
    });
}

function validateFieldValue(
    field: FieldDefinition,
    value: unknown,
    values: FormValueMap,
    ctx: z.RefinementCtx,
): void {
    const fieldKey = field.key || field.id;

    if (!isFieldVisible(field, values)) {
        return;
    }

    const required = isFieldRequired(field, values);
    const rules = field.validation || {};

    switch (field.type) {
        case FieldType.CHECKBOX: {
            if (value === undefined || value === null) {
                if (required) addIssue(ctx, fieldKey, 'Required');
                return;
            }
            if (typeof value !== 'boolean') {
                addIssue(ctx, fieldKey, 'Must be true or false');
                return;
            }
            if (required && value !== true) {
                addIssue(ctx, fieldKey, 'Required');
            }
            return;
        }

        case FieldType.MULTISELECT: {
            if (value === undefined || value === null) {
                if (required) addIssue(ctx, fieldKey, 'Required');
                return;
            }
            if (!Array.isArray(value)) {
                addIssue(ctx, fieldKey, 'Must be a list of values');
                return;
            }
            const entries = value.filter(
                (entry): entry is string =>
                    typeof entry === 'string' && entry.trim().length > 0,
            );
            if (required && entries.length === 0) {
                addIssue(ctx, fieldKey, 'Required');
                return;
            }
            if (
                typeof rules.min === 'number' &&
                entries.length > 0 &&
                entries.length < rules.min
            ) {
                addIssue(ctx, fieldKey, `Min ${rules.min}`);
            }
            if (
                typeof rules.max === 'number' &&
                entries.length > 0 &&
                entries.length > rules.max
            ) {
                addIssue(ctx, fieldKey, `Max ${rules.max}`);
            }
            return;
        }

        case FieldType.NUMBER: {
            if (isEmptyValue(value)) {
                if (required) addIssue(ctx, fieldKey, 'Required');
                return;
            }
            const numericValue = toOptionalNumber(value);
            if (numericValue === null) {
                addIssue(ctx, fieldKey, 'Must be a number');
                return;
            }
            if (typeof rules.min === 'number' && numericValue < rules.min) {
                addIssue(ctx, fieldKey, `Min ${rules.min}`);
            }
            if (typeof rules.max === 'number' && numericValue > rules.max) {
                addIssue(ctx, fieldKey, `Max ${rules.max}`);
            }
            return;
        }

        case FieldType.FILE_UPLOAD: {
            const files = normalizeFileValues(value);
            if (required && files.length === 0) {
                addIssue(ctx, fieldKey, 'Required');
                return;
            }
            if (files.length === 0) return;

            const maxFiles = field.ui?.maxFiles;
            if (
                typeof maxFiles === 'number' &&
                Number.isFinite(maxFiles) &&
                files.length > maxFiles
            ) {
                addIssue(ctx, fieldKey, `Max ${maxFiles} files`);
            }
            return;
        }

        case FieldType.INFO_TEXT:
            return;

        case FieldType.EMAIL:
        case FieldType.TEXT:
        case FieldType.TEXTAREA:
        case FieldType.SELECT:
        case FieldType.DATE:
        default: {
            const textValue =
                typeof value === 'string'
                    ? value
                    : value === undefined || value === null
                        ? ''
                        : String(value);
            const trimmed = textValue.trim();

            if (trimmed.length === 0) {
                if (required) addIssue(ctx, fieldKey, 'Required');
                return;
            }

            if (field.type === FieldType.EMAIL) {
                const emailResult = z.string().email().safeParse(trimmed);
                if (!emailResult.success) {
                    addIssue(ctx, fieldKey, 'Invalid email address');
                    return;
                }
            }

            if (
                (field.type === FieldType.TEXT ||
                    field.type === FieldType.TEXTAREA) &&
                typeof rules.min === 'number' &&
                textValue.length < rules.min
            ) {
                addIssue(ctx, fieldKey, `Min ${rules.min} characters`);
            }

            if (
                (field.type === FieldType.TEXT ||
                    field.type === FieldType.TEXTAREA) &&
                typeof rules.max === 'number' &&
                textValue.length > rules.max
            ) {
                addIssue(ctx, fieldKey, `Max ${rules.max} characters`);
            }

            if (
                field.type === FieldType.TEXT &&
                typeof rules.pattern === 'string' &&
                rules.pattern.length > 0
            ) {
                try {
                    const pattern = new RegExp(rules.pattern);
                    if (!pattern.test(textValue)) {
                        addIssue(
                            ctx,
                            fieldKey,
                            rules.customMessage || 'Invalid format',
                        );
                    }
                } catch {
                    // Ignore invalid legacy patterns to keep drafts usable.
                }
            }

            if (
                field.type === FieldType.SELECT &&
                Array.isArray(field.ui?.options) &&
                field.ui.options.length > 0
            ) {
                const allowed = new Set(
                    field.ui.options.map((option) => option.value),
                );
                if (!allowed.has(textValue)) {
                    addIssue(ctx, fieldKey, 'Select a valid option');
                }
            }

            if (field.type === FieldType.DATE) {
                const parsed = new Date(textValue);
                if (Number.isNaN(parsed.getTime())) {
                    addIssue(ctx, fieldKey, 'Invalid date');
                }
            }
            return;
        }
    }
}

export function generateFormSchema(definition: FormDefinition) {
    const normalized = normalizeFormDefinition(definition);
    const fields = normalized.sections.flatMap((section) => section.fields);
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const field of fields) {
        if (field.type === FieldType.INFO_TEXT) continue;
        const key = field.key || field.id;
        shape[key] = z.any().optional();
    }

    return z.object(shape).superRefine((values, ctx) => {
        const valueMap = values as FormValueMap;
        for (const field of fields) {
            if (field.type === FieldType.INFO_TEXT) continue;
            const key = field.key || field.id;
            validateFieldValue(field, valueMap[key], valueMap, ctx);
        }
    });
}
