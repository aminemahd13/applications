import { z } from 'zod';

// ============================================================
// FILE DTOs
// ============================================================

export enum FileSensitivity {
    NORMAL = 'normal',
    SENSITIVE = 'sensitive',
}

export enum FileVerificationStatus {
    PENDING = 'PENDING',
    VERIFIED = 'VERIFIED',
    ISSUE = 'ISSUE',
    REJECTED = 'REJECTED',
}

export const FileUploadResponseSchema = z.object({
    id: z.string().uuid(),
    originalFilename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.coerce.number(), // BigInt handling
    sensitivity: z.nativeEnum(FileSensitivity),
    uploadUrl: z.string(), // Presigned PUT URL
    storageKey: z.string(),
    url: z.string().optional(), // Preview URL, deprecated? or for download
});

export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;

export const VerifyFieldSchema = z.object({
    fieldKey: z.string(),
    fileObjectId: z.string().uuid().optional(), // Optional, only for file fields
    status: z.nativeEnum(FileVerificationStatus),
    reason: z.string().optional(),
    notesInternal: z.string().optional(),
});

export type VerifyFieldDto = z.infer<typeof VerifyFieldSchema>;

// ============================================================
// FILE RESPONSE TYPES
// ============================================================

export interface FileDownloadUrlResponse {
    url: string;
    expiresAt: Date;
}

export interface FileObjectResponse {
    id: string;
    eventId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    sensitivity: FileSensitivity;
    createdAt: Date;
    createdBy: string;
}

export interface FileVerificationResponse {
    id: string;
    submissionVersionId: string;
    fieldId: string;
    fileObjectId: string | null;
    status: FileVerificationStatus;
    reasonCode: string | null; // Mapped from reason
    notesInternal: string | null;
    setBy: string;
    setAt: Date;
}

function dedupeStringArray(values?: string[]): string[] | undefined {
    if (!Array.isArray(values) || values.length === 0) return undefined;
    return Array.from(new Set(values));
}

export const FieldFileExportJobStatusSchema = z.enum([
    'PENDING',
    'PROCESSING',
    'DONE',
    'FAILED',
]);

export type FieldFileExportJobStatus = z.infer<
    typeof FieldFileExportJobStatusSchema
>;

export const CreateFieldFileExportJobRequestSchema = z
    .object({
        stepId: z.string().uuid(),
        fieldId: z.string().trim().min(1).max(200),
        applicationIds: z.array(z.string().uuid()).max(5000).optional(),
    })
    .transform((value) => ({
        ...value,
        applicationIds: dedupeStringArray(value.applicationIds),
    }));

export type CreateFieldFileExportJobRequestDto = z.infer<
    typeof CreateFieldFileExportJobRequestSchema
>;

export const FieldFileExportJobResponseSchema = z.object({
    id: z.string().uuid(),
    eventId: z.string().uuid(),
    stepId: z.string().uuid(),
    fieldId: z.string(),
    status: FieldFileExportJobStatusSchema,
    applicationIdsCount: z.number().int().min(0),
    attempts: z.number().int().min(0),
    maxAttempts: z.number().int().min(1),
    nextRetryAt: z.coerce.date(),
    lockedAt: z.coerce.date().nullable(),
    lockedBy: z.string().nullable(),
    errorMessage: z.string().nullable(),
    outputFilename: z.string().nullable(),
    outputSizeBytes: z.coerce.number().int().min(0).nullable(),
    completedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export type FieldFileExportJobResponse = z.infer<
    typeof FieldFileExportJobResponseSchema
>;

export const FieldFileExportJobDownloadUrlResponseSchema = z.object({
    url: z.string().url(),
    expiresAt: z.coerce.date(),
    filename: z.string().trim().min(1),
});

export type FieldFileExportJobDownloadUrlResponse = z.infer<
    typeof FieldFileExportJobDownloadUrlResponseSchema
>;
