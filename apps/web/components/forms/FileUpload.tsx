'use client';

import React, { useState } from 'react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export interface FileUploadValue {
    fileObjectId: string;
    originalFilename: string;
    sizeBytes: number;
}

type FileUploadSelection = FileUploadValue | FileUploadValue[] | null;

interface FileUploadProps {
    value?: FileUploadSelection;
    onChange: (value: FileUploadSelection) => void;
    eventId: string;
    readOnly?: boolean;
    accept?: string;
    multiple?: boolean;
    maxFiles?: number;
    maxFileSizeMB?: number;
}

function normalizeValue(value?: FileUploadSelection): FileUploadValue[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function parseAcceptTokens(accept?: string): string[] {
    if (!accept) return [];
    return accept
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0);
}

function fileMatchesAcceptToken(file: File, token: string): boolean {
    const fileType = (file.type || '').toLowerCase();
    const fileName = file.name.toLowerCase();

    if (token === '*/*') return true;
    if (token.startsWith('.')) return fileName.endsWith(token);
    if (token.endsWith('/*')) {
        const prefix = token.slice(0, token.length - 1);
        return fileType.startsWith(prefix);
    }

    return fileType === token;
}

function formatSize(sizeBytes: number): string {
    if (sizeBytes >= 1024 * 1024) {
        return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function summarizeMessages(messages: string[]): string {
    if (messages.length <= 2) return messages.join(' ');
    return `${messages.slice(0, 2).join(' ')} (+${messages.length - 2} more)`;
}

export function FileUpload({
    value,
    onChange,
    eventId,
    readOnly,
    accept,
    multiple,
    maxFiles,
    maxFileSizeMB,
}: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const { csrfToken } = useAuth();
    const acceptTokens = parseAcceptTokens(accept);
    const effectiveMaxFileSizeMB =
        typeof maxFileSizeMB === 'number' && Number.isFinite(maxFileSizeMB) && maxFileSizeMB > 0
            ? maxFileSizeMB
            : 50;
    const effectiveMaxFileSizeBytes = Math.floor(effectiveMaxFileSizeMB * 1024 * 1024);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) return;

        const existing = normalizeValue(value);
        const limit = typeof maxFiles === 'number' ? maxFiles : multiple ? undefined : 1;
        const remaining =
            typeof limit === 'number' ? Math.max(limit - existing.length, 0) : files.length;
        const filesToUpload = typeof limit === 'number' ? files.slice(0, remaining) : files;

        if (filesToUpload.length === 0) {
            setError('Maximum number of files reached.');
            e.target.value = '';
            return;
        }

        const acceptedFiles: File[] = [];
        const validationMessages: string[] = [];
        for (const file of filesToUpload) {
            if (file.size > effectiveMaxFileSizeBytes) {
                validationMessages.push(
                    `${file.name} exceeds ${effectiveMaxFileSizeMB} MB.`,
                );
                continue;
            }

            if (
                acceptTokens.length > 0 &&
                !acceptTokens.some((token) => fileMatchesAcceptToken(file, token))
            ) {
                validationMessages.push(`${file.name} is not an allowed file type.`);
                continue;
            }

            acceptedFiles.push(file);
        }

        if (acceptedFiles.length === 0) {
            setError(
                validationMessages.length > 0
                    ? summarizeMessages(validationMessages)
                    : 'No valid files selected.',
            );
            e.target.value = '';
            return;
        }

        setUploading(true);
        setError(
            validationMessages.length > 0 ? summarizeMessages(validationMessages) : null,
        );
        setProgress(10);

        try {
            const uploaded: FileUploadValue[] = [];

            for (const file of acceptedFiles) {
                // 1. Register Upload
                const { uploadUrl, id } = await apiClient<{ uploadUrl: string; id: string; storageKey: string }>(
                    `/events/${eventId}/uploads`,
                    {
                        method: 'POST',
                        body: {
                            originalFilename: file.name,
                            mimeType: file.type,
                            sizeBytes: file.size,
                            sensitivity: 'normal',
                        },
                        csrfToken: csrfToken ?? undefined,
                    },
                );

                setProgress(30);

                // 2. Upload to S3 (PUT)
                const s3Res = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        'Content-Type': file.type,
                    },
                });

                if (!s3Res.ok) {
                    throw new Error(`Upload to storage failed: ${s3Res.statusText}`);
                }

                setProgress(80);

                // 3. Commit Upload
                await apiClient(`/events/${eventId}/uploads/${id}/commit`, {
                    method: 'POST',
                    csrfToken: csrfToken ?? undefined,
                });

                setProgress(100);

                uploaded.push({
                    fileObjectId: id,
                    originalFilename: file.name,
                    sizeBytes: file.size,
                });
            }

            const next = [...existing, ...uploaded];
            const output =
                multiple || (typeof limit === 'number' ? limit > 1 : false)
                    ? next
                    : next[0] ?? null;

            onChange(output);
            if (validationMessages.length > 0) {
                setError(summarizeMessages(validationMessages));
            }
        } catch (err: unknown) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const current = normalizeValue(value);
    const limit = typeof maxFiles === 'number' ? maxFiles : multiple ? undefined : 1;
    const canUploadMore =
        !readOnly && (typeof limit !== 'number' || current.length < limit);

    return (
        <div className="bg-muted/30 border-border rounded-lg border p-4">
            {current.length > 0 && (
                <div className="space-y-2">
                    {current.map((file) => (
                        <div key={file.fileObjectId} className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">File Uploaded</span>
                                <span className="text-muted-foreground text-xs">
                                    {file.originalFilename} ({formatSize(file.sizeBytes)})
                                </span>
                            </div>
                            {!readOnly && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = current.filter((f) => f.fileObjectId !== file.fileObjectId);
                                        onChange(
                                            multiple || (typeof limit === 'number' ? limit > 1 : false)
                                                ? next
                                                : next[0] ?? null,
                                        );
                                    }}
                                    className="text-destructive hover:text-destructive/80 text-xs underline underline-offset-2"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {canUploadMore && (
                <div className={current.length > 0 ? 'mt-3' : ''}>
                    <input
                        type="file"
                        disabled={readOnly || uploading}
                        accept={accept}
                        multiple={multiple}
                        onChange={handleFileChange}
                        className="border-input bg-background text-muted-foreground file:text-foreground file:bg-muted file:border-border hover:file:bg-muted/80 focus-visible:border-ring focus-visible:ring-ring/50 block w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 file:mr-4 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
                    />
                    <p className="text-muted-foreground mt-2 text-xs">
                        {[
                            `Max ${effectiveMaxFileSizeMB} MB per file`,
                            typeof limit === 'number'
                                ? `Up to ${limit} file${limit === 1 ? '' : 's'}`
                                : null,
                            acceptTokens.length > 0
                                ? `Allowed: ${acceptTokens.join(', ')}`
                                : null,
                        ]
                            .filter(
                                (text): text is string =>
                                    typeof text === 'string' && text.length > 0,
                            )
                            .join(' | ')}
                    </p>
                    {uploading && <p className="text-primary mt-2 text-xs">Uploading... {progress}%</p>}
                    {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
                </div>
            )}
        </div>
    );
}
