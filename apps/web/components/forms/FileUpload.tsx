'use client';

import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import {
    describeFailedUploads,
    fileTooLargeMessage,
    formatUploadLimitMB,
    isFileTooLarge,
    mergeUploadedFiles,
    putFileToStorage,
    resolveUploadSizeLimit,
    uploadOneFile,
    type FailedUpload,
} from '../../lib/file-upload-policy';

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
    applicationId?: string;
    stepId?: string;
    fieldId?: string;
    readOnly?: boolean;
    accept?: string;
    multiple?: boolean;
    maxFiles?: number;
    maxFileSizeMB?: number;
    /** Called with true when an upload starts and false when it ends (or this unmounts mid-upload). */
    onUploadingChange?: (isUploading: boolean) => void;
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
    applicationId,
    stepId,
    fieldId,
    readOnly,
    accept,
    multiple,
    maxFiles,
    maxFileSizeMB,
    onUploadingChange,
}: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const { csrfToken } = useAuth();
    const abortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const onUploadingChangeRef = useRef(onUploadingChange);
    // Latest field value, so a finished upload merges into what the field holds
    // now rather than the snapshot taken when the upload started.
    const valueRef = useRef(value);
    const acceptTokens = parseAcceptTokens(accept);
    // 10 MB cap; a smaller field max wins.
    const sizeLimit = resolveUploadSizeLimit(maxFileSizeMB);
    const hasUploadContext =
        typeof applicationId === 'string' &&
        applicationId.length > 0 &&
        typeof stepId === 'string' &&
        stepId.length > 0 &&
        typeof fieldId === 'string' &&
        fieldId.length > 0;

    useEffect(() => {
        onUploadingChangeRef.current = onUploadingChange;
        valueRef.current = value;
    });

    // Leaving the page (or hiding the field) mid-upload cancels it.
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortRef.current?.abort();
        };
    }, []);

    // Tell the parent an upload is running; the cleanup also runs on unmount.
    useEffect(() => {
        if (!uploading) return;
        onUploadingChangeRef.current?.(true);
        return () => onUploadingChangeRef.current?.(false);
    }, [uploading]);

    // Warn before closing or reloading the tab mid-upload.
    useEffect(() => {
        if (!uploading) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [uploading]);

    const handleCancel = () => {
        abortRef.current?.abort();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) return;
        if (!hasUploadContext) {
            setError('Upload context missing. Reload the page and try again.');
            e.target.value = '';
            return;
        }

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
            // Checked before registering: an oversized file never hits the network.
            if (isFileTooLarge(file.size, sizeLimit)) {
                const tooLarge = fileTooLargeMessage(sizeLimit);
                validationMessages.push(
                    filesToUpload.length > 1 ? `${file.name}: ${tooLarge}` : tooLarge,
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

        const input = e.target;
        const controller = new AbortController();
        const { signal } = controller;
        abortRef.current = controller;
        setUploading(true);
        setError(
            validationMessages.length > 0 ? summarizeMessages(validationMessages) : null,
        );
        setProgress(10);

        // Each file is independent: one failure must not discard files of the
        // same batch that already committed.
        const uploaded: FileUploadValue[] = [];
        const failures: FailedUpload[] = [];

        try {
            for (let fileIndex = 0; fileIndex < acceptedFiles.length; fileIndex++) {
                if (signal.aborted) break;
                const file = acceptedFiles[fileIndex];
                const fileMimeType = file.type || 'application/octet-stream';
                try {
                    const id = await uploadOneFile({
                        // 1. Register upload (reserve a storage key + presigned PUT URL).
                        // Never retried: each call creates a STAGED row.
                        register: () =>
                            apiClient<{ uploadUrl: string; id: string; storageKey: string }>(
                                `/events/${eventId}/uploads`,
                                {
                                    method: 'POST',
                                    body: {
                                        originalFilename: file.name,
                                        mimeType: fileMimeType,
                                        sizeBytes: file.size,
                                        applicationId,
                                        stepId,
                                        fieldId,
                                        sensitivity: 'normal',
                                    },
                                    csrfToken: csrfToken ?? undefined,
                                    signal,
                                },
                            ),
                        // 2. Upload straight to storage with real byte-level
                        // progress; retried on the same presigned URL.
                        put: (uploadUrl) =>
                            putFileToStorage(uploadUrl, file, fileMimeType, {
                                signal,
                                onProgress: (loaded, totalBytes) => {
                                    const fraction = totalBytes > 0 ? loaded / totalBytes : 0;
                                    const overall = (fileIndex + fraction) / acceptedFiles.length;
                                    // Cap at 98% so the commit step can take it to 100%.
                                    setProgress(Math.max(5, Math.min(98, Math.round(overall * 100))));
                                },
                            }),
                        // 3. Commit upload (promote STAGED -> ready); idempotent.
                        // Silent: a failed attempt may be retried; a final failure
                        // is shown inline below instead of a toast per attempt.
                        commit: (fileObjectId) =>
                            apiClient(`/events/${eventId}/uploads/${fileObjectId}/commit`, {
                                silent: true,
                                method: 'POST',
                                body: {
                                    applicationId,
                                    stepId,
                                    fieldId,
                                },
                                csrfToken: csrfToken ?? undefined,
                                signal,
                            }),
                        signal,
                        onRetry: (stage, { attempt, delayMs, error: retryError }) => {
                            console.warn(
                                `[FileUpload] ${stage} attempt ${attempt} failed; retrying in ${delayMs} ms`,
                                retryError,
                            );
                        },
                    });
                    uploaded.push({
                        fileObjectId: id,
                        originalFilename: file.name,
                        sizeBytes: file.size,
                    });
                } catch (err: unknown) {
                    // Cancelled: stop quietly, keeping what already committed.
                    if (signal.aborted) break;
                    console.error(err);
                    failures.push({
                        fileName: file.name,
                        message: err instanceof Error ? err.message : undefined,
                    });
                }
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (mountedRef.current) {
                setUploading(false);
                input.value = '';
                const failureMessage = describeFailedUploads(failures);
                const messages = failureMessage
                    ? [failureMessage, ...validationMessages]
                    : validationMessages;
                setError(messages.length > 0 ? summarizeMessages(messages) : null);
                if (uploaded.length > 0) {
                    setProgress(100);
                    const next = mergeUploadedFiles(
                        normalizeValue(valueRef.current),
                        uploaded,
                        limit,
                    );
                    onChange(
                        multiple || (typeof limit === 'number' ? limit > 1 : false)
                            ? next
                            : next[0] ?? null,
                    );
                }
            }
        }
    };

    const current = normalizeValue(value);
    const limit = typeof maxFiles === 'number' ? maxFiles : multiple ? undefined : 1;
    const canUploadMore =
        !readOnly &&
        hasUploadContext &&
        (typeof limit !== 'number' || current.length < limit);

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
                                    // Not while uploading: the finished batch is merged
                                    // into the field value and could otherwise race it.
                                    disabled={uploading}
                                    onClick={() => {
                                        const next = current.filter((f) => f.fileObjectId !== file.fileObjectId);
                                        onChange(
                                            multiple || (typeof limit === 'number' ? limit > 1 : false)
                                                ? next
                                                : next[0] ?? null,
                                        );
                                    }}
                                    className="text-destructive hover:text-destructive/80 text-xs underline underline-offset-2 disabled:pointer-events-none disabled:opacity-50"
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
                            `Max ${formatUploadLimitMB(sizeLimit)} MB per file`,
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
                    {uploading && (
                        <div className="mt-2 flex items-center gap-3">
                            <p className="text-primary text-xs">Uploading... {progress}%</p>
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                    {!hasUploadContext && (
                        <p className="text-muted-foreground mt-2 text-xs">
                            Upload unavailable until application step context is loaded.
                        </p>
                    )}
                    {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
                </div>
            )}
        </div>
    );
}
