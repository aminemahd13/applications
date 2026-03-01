import { z } from 'zod';

// ==========================================
// Field Types
// ==========================================

export enum FieldType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    NUMBER = 'number',
    EMAIL = 'email',
    PHONE = 'phone',
    DATE = 'date',
    SELECT = 'select',
    MULTISELECT = 'multiselect',
    CHECKBOX = 'checkbox',
    FILE_UPLOAD = 'file_upload',
    INFO_TEXT = 'info_text', // Static text display
}

// ==========================================
// Validation Rules
// ==========================================

export const ValidationSchema = z.object({
    required: z.boolean().optional(),
    min: z.number().optional(), // min value or min length
    max: z.number().optional(), // max value or max length
    pattern: z.string().optional(), // regex
    customMessage: z.string().optional(),
    allowedTypes: z.array(z.string()).optional(), // mime types
});

export type ValidationRules = z.infer<typeof ValidationSchema>;

// ==========================================
// Conditional Logic
// ==========================================

export enum ConditionOperator {
    EQ = 'eq',
    NEQ = 'neq',
    CONTAINS = 'contains',
    NOT_CONTAINS = 'not_contains',
    GT = 'gt',
    GTE = 'gte',
    LT = 'lt',
    LTE = 'lte',
    EXISTS = 'exists',
    NOT_EXISTS = 'not_exists',
    IN = 'in',
    NOT_IN = 'not_in',
}

export enum ConditionMode {
    ALL = 'all',
    ANY = 'any',
}

export const ConditionRuleSchema = z.object({
    fieldKey: z.string(),
    operator: z.nativeEnum(ConditionOperator).default(ConditionOperator.EQ),
    value: z.any().optional(),
});

export type ConditionRule = z.infer<typeof ConditionRuleSchema>;

export const ConditionGroupSchema = z.object({
    mode: z.nativeEnum(ConditionMode).default(ConditionMode.ALL),
    rules: z.array(ConditionRuleSchema).min(1),
});

export type ConditionGroup = z.infer<typeof ConditionGroupSchema>;

export const FieldLogicSchema = z.object({
    showWhen: ConditionGroupSchema.optional(),
    requireWhen: ConditionGroupSchema.optional(),
});

export type FieldLogic = z.infer<typeof FieldLogicSchema>;

// ==========================================
// UI Options (Widget Config)
// ==========================================

export const UiOptionsSchema = z.object({
    placeholder: z.string().optional(),
    description: z.string().optional(), // Help text
    hidden: z.boolean().optional(),

    // Select/Multiselect options
    options: z.array(z.object({
        label: z.string(),
        value: z.string(),
    })).optional(),

    // File upload specifics
    allowedMimeTypes: z.array(z.string()).optional(),
    maxFileSizeMB: z.number().optional(),
    maxFiles: z.number().optional(),
});

export type UiOptions = z.infer<typeof UiOptionsSchema>;

// ==========================================
// Field Definition
// ==========================================

export const FieldDefinitionSchema = z.object({
    id: z.string(), // internal uuid
    key: z.string(), // stable identifier for answers (e.g. "passport_photo")
    type: z.nativeEnum(FieldType),
    label: z.string(),
    validation: ValidationSchema.optional(),
    ui: UiOptionsSchema.optional(),
    logic: FieldLogicSchema.optional(),
    defaultValue: z.any().optional(),
});

export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

// ==========================================
// Section Definition
// ==========================================

export const SectionDefinitionSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    fields: z.array(FieldDefinitionSchema),
});

export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;

// ==========================================
// Form Definition (The Root)
// ==========================================

export const FormDefinitionSchema = z.object({
    sections: z.array(SectionDefinitionSchema),
    metadata: z.object({
        version: z.string().optional(), // semantic version or internal
        generatedAt: z.string().optional(),
    }).optional(),
});

export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value
        : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const arr = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return arr.length > 0 ? arr : undefined;
}

function normalizeFieldType(rawType: unknown): FieldType {
    const type = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';

    switch (type) {
        case 'text':
            return FieldType.TEXT;
        case 'textarea':
            return FieldType.TEXTAREA;
        case 'number':
            return FieldType.NUMBER;
        case 'email':
            return FieldType.EMAIL;
        case 'phone':
            return FieldType.PHONE;
        case 'date':
            return FieldType.DATE;
        case 'select':
            return FieldType.SELECT;
        case 'multiselect':
        case 'multi_select':
            return FieldType.MULTISELECT;
        case 'checkbox':
            return FieldType.CHECKBOX;
        case 'file_upload':
        case 'file':
            return FieldType.FILE_UPLOAD;
        case 'info_text':
            return FieldType.INFO_TEXT;
        default:
            return FieldType.TEXT;
    }
}

function normalizeOptions(rawOptions: unknown): Array<{ label: string; value: string }> | undefined {
    if (!Array.isArray(rawOptions)) return undefined;

    const options = rawOptions
        .filter(isRecord)
        .map((o) => {
            const label = toOptionalString(o.label);
            const value = toOptionalString(o.value);
            return label && value ? { label, value } : null;
        })
        .filter((o): o is { label: string; value: string } => o !== null);

    return options.length > 0 ? options : undefined;
}

function normalizeConditionOperator(rawOperator: unknown): ConditionOperator {
    const operator = typeof rawOperator === 'string' ? rawOperator.trim().toLowerCase() : '';
    switch (operator) {
        case 'eq':
        case '=':
        case '==':
            return ConditionOperator.EQ;
        case 'neq':
        case '!=':
        case '<>':
            return ConditionOperator.NEQ;
        case 'contains':
            return ConditionOperator.CONTAINS;
        case 'not_contains':
        case 'notcontains':
            return ConditionOperator.NOT_CONTAINS;
        case 'gt':
        case '>':
            return ConditionOperator.GT;
        case 'gte':
        case '>=':
            return ConditionOperator.GTE;
        case 'lt':
        case '<':
            return ConditionOperator.LT;
        case 'lte':
        case '<=':
            return ConditionOperator.LTE;
        case 'exists':
            return ConditionOperator.EXISTS;
        case 'not_exists':
        case 'notexists':
            return ConditionOperator.NOT_EXISTS;
        case 'in':
            return ConditionOperator.IN;
        case 'not_in':
        case 'notin':
            return ConditionOperator.NOT_IN;
        default:
            return ConditionOperator.EQ;
    }
}

function normalizeConditionMode(rawMode: unknown): ConditionMode {
    const mode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : '';
    return mode === ConditionMode.ANY ? ConditionMode.ANY : ConditionMode.ALL;
}

function normalizeConditionRule(rawRule: unknown): ConditionRule | null {
    const rule = isRecord(rawRule) ? rawRule : {};
    const fieldKey = toOptionalString(rule.fieldKey) ?? toOptionalString(rule.key);
    if (!fieldKey) return null;

    return {
        fieldKey,
        operator: normalizeConditionOperator(rule.operator),
        ...(rule.value !== undefined ? { value: rule.value } : {}),
    };
}

function normalizeConditionGroup(rawGroup: unknown): ConditionGroup | undefined {
    const group = isRecord(rawGroup) ? rawGroup : {};
    const rawRules = Array.isArray(group.rules)
        ? group.rules
        : Array.isArray(group.conditions)
            ? group.conditions
            : [];
    const rules = rawRules
        .map((rule) => normalizeConditionRule(rule))
        .filter((rule): rule is ConditionRule => rule !== null);
    if (rules.length === 0) return undefined;

    return {
        mode: normalizeConditionMode(group.mode),
        rules,
    };
}

function normalizeField(rawField: unknown, fieldIndex: number): FieldDefinition {
    const f = isRecord(rawField) ? rawField : {};
    const rawUi = isRecord(f.ui) ? f.ui : {};
    const rawValidation = isRecord(f.validation) ? f.validation : {};
    const rawLogic = isRecord(f.logic) ? f.logic : {};

    const id =
        toOptionalString(f.id) ??
        toOptionalString(f.fieldId) ??
        toOptionalString(f.key) ??
        `field_${fieldIndex + 1}`;

    const key = toOptionalString(f.key) ?? id;
    const label = toOptionalString(f.label) ?? `Field ${fieldIndex + 1}`;

    const validation: ValidationRules = {};
    const required =
        typeof rawValidation.required === 'boolean'
            ? rawValidation.required
            : typeof f.required === 'boolean'
                ? f.required
                : undefined;
    if (required !== undefined) validation.required = required;

    const min = toOptionalNumber(rawValidation.min) ?? toOptionalNumber(f.min);
    if (min !== undefined) validation.min = min;

    const max = toOptionalNumber(rawValidation.max) ?? toOptionalNumber(f.max);
    if (max !== undefined) validation.max = max;

    const pattern =
        toOptionalString(rawValidation.pattern) ?? toOptionalString(f.pattern);
    if (pattern) validation.pattern = pattern;

    const customMessage =
        toOptionalString(rawValidation.customMessage) ??
        toOptionalString(f.customMessage);
    if (customMessage) validation.customMessage = customMessage;

    const allowedTypes =
        toOptionalStringArray(rawValidation.allowedTypes) ??
        toOptionalStringArray(f.allowedTypes);
    if (allowedTypes) validation.allowedTypes = allowedTypes;

    const ui: UiOptions = {};
    const placeholder =
        toOptionalString(rawUi.placeholder) ?? toOptionalString(f.placeholder);
    if (placeholder) ui.placeholder = placeholder;

    const description =
        toOptionalString(rawUi.description) ?? toOptionalString(f.description);
    if (description) ui.description = description;

    if (typeof rawUi.hidden === 'boolean') ui.hidden = rawUi.hidden;

    const options = normalizeOptions(rawUi.options ?? f.options);
    if (options) ui.options = options;

    const allowedMimeTypes = toOptionalStringArray(rawUi.allowedMimeTypes);
    if (allowedMimeTypes) ui.allowedMimeTypes = allowedMimeTypes;

    const maxFileSizeMB = toOptionalNumber(rawUi.maxFileSizeMB);
    if (maxFileSizeMB !== undefined) ui.maxFileSizeMB = maxFileSizeMB;

    const maxFiles = toOptionalNumber(rawUi.maxFiles);
    if (maxFiles !== undefined) ui.maxFiles = maxFiles;

    const field: FieldDefinition = {
        id,
        key,
        type: normalizeFieldType(f.type),
        label,
    };

    const showWhen = normalizeConditionGroup(rawLogic.showWhen ?? f.showWhen);
    const requireWhen = normalizeConditionGroup(
        rawLogic.requireWhen ?? f.requireWhen,
    );
    if (showWhen || requireWhen) {
        field.logic = {
            ...(showWhen ? { showWhen } : {}),
            ...(requireWhen ? { requireWhen } : {}),
        };
    }

    if (Object.keys(validation).length > 0) field.validation = validation;
    if (Object.keys(ui).length > 0) field.ui = ui;
    if (f.defaultValue !== undefined) field.defaultValue = f.defaultValue;

    return field;
}

/**
 * Normalize form schema payloads to the current canonical shape.
 * Supports legacy payloads that used `pages` instead of `sections`.
 */
export function normalizeFormDefinition(rawDefinition: unknown): FormDefinition {
    const d = isRecord(rawDefinition) ? rawDefinition : {};
    const rawSections = Array.isArray(d.sections)
        ? d.sections
        : Array.isArray(d.pages)
            ? d.pages
            : [];

    const sections = rawSections.map((section, sectionIndex) => {
        const s = isRecord(section) ? section : {};
        const fields = Array.isArray(s.fields)
            ? s.fields.map((field, fieldIndex) => normalizeField(field, fieldIndex))
            : [];

        return {
            id: toOptionalString(s.id) ?? `section_${sectionIndex + 1}`,
            title: toOptionalString(s.title) ?? `Section ${sectionIndex + 1}`,
            description: toOptionalString(s.description),
            fields,
        };
    });

    const rawMetadata = isRecord(d.metadata) ? d.metadata : {};
    const metadata = {
        version: toOptionalString(rawMetadata.version),
        generatedAt: toOptionalString(rawMetadata.generatedAt),
    };

    const normalized: FormDefinition = {
        sections,
        ...(metadata.version || metadata.generatedAt ? { metadata } : {}),
    };

    return FormDefinitionSchema.parse(normalized);
}

/**
 * Flatten all fields from a form definition (legacy-compatible).
 */
export function getFormFields(rawDefinition: unknown): FieldDefinition[] {
    return normalizeFormDefinition(rawDefinition).sections.flatMap((s) => s.fields);
}

function readValueByPath(values: UnknownRecord, fieldKey: string): unknown {
    if (!fieldKey.includes('.')) return values[fieldKey];

    const parts = fieldKey.split('.').filter((part) => part.length > 0);
    let current: unknown = values;

    for (const part of parts) {
        if (!isRecord(current)) return undefined;
        current = current[part];
    }

    return current;
}

function normalizeComparable(value: unknown): unknown {
    if (typeof value === 'string') return value.trim();
    return value;
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as UnknownRecord).length > 0;
    return true;
}

export function evaluateConditionRule(
    values: Record<string, unknown>,
    rule: ConditionRule,
): boolean {
    const fieldValue = readValueByPath(values, rule.fieldKey);
    const normalizedFieldValue = normalizeComparable(fieldValue);
    const normalizedRuleValue = normalizeComparable(rule.value);

    switch (rule.operator) {
        case ConditionOperator.EQ:
            return normalizedFieldValue === normalizedRuleValue;
        case ConditionOperator.NEQ:
            return normalizedFieldValue !== normalizedRuleValue;
        case ConditionOperator.CONTAINS:
            if (Array.isArray(fieldValue)) {
                return fieldValue.some((entry) => entry === rule.value);
            }
            if (typeof fieldValue === 'string' && typeof rule.value === 'string') {
                return fieldValue.toLowerCase().includes(rule.value.toLowerCase());
            }
            return false;
        case ConditionOperator.NOT_CONTAINS:
            if (Array.isArray(fieldValue)) {
                return !fieldValue.some((entry) => entry === rule.value);
            }
            if (typeof fieldValue === 'string' && typeof rule.value === 'string') {
                return !fieldValue.toLowerCase().includes(rule.value.toLowerCase());
            }
            return true;
        case ConditionOperator.GT: {
            const left = toNumber(fieldValue);
            const right = toNumber(rule.value);
            if (left === null || right === null) return false;
            return left > right;
        }
        case ConditionOperator.GTE: {
            const left = toNumber(fieldValue);
            const right = toNumber(rule.value);
            if (left === null || right === null) return false;
            return left >= right;
        }
        case ConditionOperator.LT: {
            const left = toNumber(fieldValue);
            const right = toNumber(rule.value);
            if (left === null || right === null) return false;
            return left < right;
        }
        case ConditionOperator.LTE: {
            const left = toNumber(fieldValue);
            const right = toNumber(rule.value);
            if (left === null || right === null) return false;
            return left <= right;
        }
        case ConditionOperator.EXISTS:
            return hasMeaningfulValue(fieldValue);
        case ConditionOperator.NOT_EXISTS:
            return !hasMeaningfulValue(fieldValue);
        case ConditionOperator.IN:
            return Array.isArray(rule.value)
                ? rule.value.some((entry) => entry === fieldValue)
                : false;
        case ConditionOperator.NOT_IN:
            return Array.isArray(rule.value)
                ? !rule.value.some((entry) => entry === fieldValue)
                : true;
        default:
            return false;
    }
}

export function evaluateConditionGroup(
    values: Record<string, unknown>,
    group: ConditionGroup | undefined,
    fallbackWhenMissing = true,
): boolean {
    if (!group || !Array.isArray(group.rules) || group.rules.length === 0) {
        return fallbackWhenMissing;
    }

    const evaluations = group.rules.map((rule) =>
        evaluateConditionRule(values, rule),
    );
    return group.mode === ConditionMode.ANY
        ? evaluations.some(Boolean)
        : evaluations.every(Boolean);
}

export function isFieldVisible(
    field: FieldDefinition,
    values: Record<string, unknown>,
): boolean {
    return evaluateConditionGroup(values, field.logic?.showWhen, true);
}

export function isFieldRequired(
    field: FieldDefinition,
    values: Record<string, unknown>,
): boolean {
    const staticRequired = Boolean(field.validation?.required);
    if (staticRequired) return true;
    return evaluateConditionGroup(values, field.logic?.requireWhen, false);
}
