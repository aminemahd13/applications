import { z } from 'zod';

// ==========================================
// Field Types
// ==========================================

export enum FieldType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    NUMBER = 'number',
    EMAIL = 'email',
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

function normalizeField(rawField: unknown, fieldIndex: number): FieldDefinition {
    const f = isRecord(rawField) ? rawField : {};
    const rawUi = isRecord(f.ui) ? f.ui : {};
    const rawValidation = isRecord(f.validation) ? f.validation : {};

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
