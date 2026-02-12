import { z } from 'zod';
import {
    FormDefinition,
    FieldType,
    FieldDefinition,
    normalizeFormDefinition,
} from './form-definition';

export function generateFormSchema(definition: FormDefinition) {
    const shape: Record<string, z.ZodTypeAny> = {};
    const normalized = normalizeFormDefinition(definition);

    normalized.sections.forEach((section) => {
        section.fields.forEach((field) => {
            let schema: z.ZodTypeAny;

            // Base Type
            switch (field.type) {
                case FieldType.EMAIL:
                    schema = z.string().email({ message: 'Invalid email address' });
                    break;
                case FieldType.NUMBER:
                    // Backend receives numbers as numbers usually, but might optionally handle string
                    // Frontend Zod handles string->number transform.
                    // For shared, we can be lenient or strict.
                    // Let's allow both for robustness.
                    schema = z.union([z.string(), z.number()])
                        .transform((val) => (val === '' ? undefined : Number(val)))
                        .refine((val: number | undefined) => val === undefined || !Number.isNaN(val), { message: 'Must be a number' });
                    break;
                case FieldType.CHECKBOX:
                    schema = z.boolean();
                    break;
                case FieldType.MULTISELECT:
                    schema = z.array(z.string());
                    break;
                case FieldType.FILE_UPLOAD:
                    // Expect a single file object, an array of file objects, or raw IDs (legacy)
                    const fileObjectSchema = z.object({
                        fileObjectId: z.string(),
                        originalFilename: z.string(),
                        sizeBytes: z.number(),
                    });
                    const fileValueSchema = z.union([
                        fileObjectSchema,
                        z.array(fileObjectSchema),
                        z.string(),
                        z.array(z.string()),
                    ]);
                    schema = fileValueSchema.nullable();
                    break;
                case FieldType.INFO_TEXT:
                    return; // Skip validation for static text
                case FieldType.TEXT:
                case FieldType.TEXTAREA:
                case FieldType.SELECT:
                case FieldType.DATE:
                default:
                    schema = z.string();
                    break;
            }

            // Validation Rules
            const rules = field.validation || {};

            if (rules.required) {
                if (field.type === FieldType.CHECKBOX) {
                    schema = (schema as z.ZodBoolean).refine((val: boolean) => val === true, { message: 'Required' });
                } else if (field.type === FieldType.MULTISELECT) {
                    schema = (schema as z.ZodArray<any>).min(1, { message: 'Required' });
                } else if (field.type === FieldType.FILE_UPLOAD) {
                    schema = schema.refine((val: any) => {
                        if (val === null || val === undefined) return false;
                        if (Array.isArray(val)) return val.length > 0;
                        if (typeof val === 'string') return val.length > 0;
                        return true;
                    }, { message: 'Required' });
                } else if (field.type === FieldType.NUMBER) {
                    schema = schema.refine((val: unknown) => val !== undefined, { message: 'Required' });
                } else {
                    schema = (schema as z.ZodString).min(1, { message: 'Required' });
                }
            } else {
                schema = schema.optional();
            }

            if (rules.min !== undefined) {
                if (field.type === FieldType.NUMBER) {
                    schema = schema.refine(
                        (val: unknown) => val === undefined || (typeof val === 'number' && val >= rules.min!),
                        { message: `Min ${rules.min}` },
                    );
                } else if (field.type === FieldType.TEXT || field.type === FieldType.TEXTAREA) {
                    schema = (schema as z.ZodString).min(rules.min, { message: `Min ${rules.min} characters` });
                }
            }

            if (rules.max !== undefined) {
                if (field.type === FieldType.NUMBER) {
                    schema = schema.refine(
                        (val: unknown) => val === undefined || (typeof val === 'number' && val <= rules.max!),
                        { message: `Max ${rules.max}` },
                    );
                } else if (field.type === FieldType.TEXT || field.type === FieldType.TEXTAREA) {
                    schema = (schema as z.ZodString).max(rules.max, { message: `Max ${rules.max} characters` });
                }
            }

            if (rules.pattern) {
                if (field.type === FieldType.TEXT) {
                    schema = (schema as z.ZodString).regex(new RegExp(rules.pattern), { message: rules.customMessage || 'Invalid format' });
                }
            }

            // USE KEY INSTEAD OF ID
            // Fallback to id if key missing (for legacy compatibility during dev)
            const key = field.key || field.id;
            shape[key] = schema;
        });
    });

    return z.object(shape);
}
