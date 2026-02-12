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
