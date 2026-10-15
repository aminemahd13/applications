import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import {
  FileSensitivity,
  FileVerificationStatus,
  FileUploadResponse,
  FileDownloadUrlResponse,
  FileVerificationResponse,
  CreateFieldFileExportJobRequestDto,
  FieldFileExportJobDownloadUrlResponse,
  FieldFileExportJobResponse,
  Permission,
} from '@event-platform/shared';
import { StorageService } from '../common/storage/storage.service';
import { FormDefinition, getFormFields } from '@event-platform/schemas';
import { canApplicantEditStep } from '../applications/applicant-step-editability.util';
import JSZip from 'jszip';
import { extname } from 'path';

interface UploadFieldContext {
  applicationId: string;
  stepId: string;
  fieldId: string;
}

interface FileFieldConstraints {
  fieldId: string;
  allowedMimeTypes: string[];
  maxFileSizeBytes?: number;
}

interface CommitUploadOptions extends UploadFieldContext {
  expectedAllowedMimeTypes?: string[];
  expectedMaxFileSizeBytes?: number;
}

interface FileValidationReference {
  fileId: string;
  fieldId: string;
  allowedMimeTypes?: string[];
  maxFileSizeBytes?: number;
}

interface ExportableFileField {
  stepId: string;
  stepTitle: string;
  stepIndex: number;
  fieldKey: string;
  fieldLabel: string;
  maxFiles: number;
}

interface ExportFieldFilesZipResult {
  filename: string;
  buffer: Buffer;
}

interface ExportPermissionContext {
  canReadNormal: boolean;
  canReadSensitive: boolean;
}

const ZIP_EXPORT_STORAGE_FETCH_CONCURRENCY = 6;
const FIELD_FILE_EXPORT_JOB_PRESIGNED_DOWNLOAD_TTL_SECONDS = 3600;
const FIELD_FILE_EXPORT_JOB_DEFAULT_MAX_ATTEMPTS = 3;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Register uploaded file (STAGED)
   */
  async registerUpload(
    eventId: string,
    fileData: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      sensitivity: FileSensitivity;
      applicationId: string;
      stepId: string;
      fieldId: string;
    },
  ): Promise<FileUploadResponse> {
    const userId = this.cls.get('actorId');
    const constraints = await this.resolveUploadFieldContext(
      eventId,
      userId,
      {
        applicationId: fileData.applicationId,
        stepId: fileData.stepId,
        fieldId: fileData.fieldId,
      },
    );

    const originalFilename = String(fileData.originalFilename ?? '').trim();
    const mimeType = String(fileData.mimeType ?? '').trim().toLowerCase();
    const declaredSizeBytes = Number(fileData.sizeBytes);
    if (!originalFilename) {
      throw new BadRequestException('originalFilename is required');
    }
    if (!mimeType) {
      throw new BadRequestException('mimeType is required');
    }
    if (!Number.isFinite(declaredSizeBytes) || declaredSizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be a positive number');
    }
    this.assertMimeNotBlocked(mimeType);
    this.assertMatchesFieldConstraints(
      mimeType,
      declaredSizeBytes,
      constraints,
      'declared',
    );

    // Expiry: 24h for STAGED files
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    const file = await this.prisma.file_objects.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        storage_key: fileData.storageKey,
        original_filename: originalFilename,
        mime_type: mimeType,
        size_bytes: BigInt(declaredSizeBytes),
        sensitivity: fileData.sensitivity,
        status: 'STAGED', // Enforce staged initially
        expires_at: expiresAt,
        created_by: userId,
      },
    });

    // Generate Presigned PUT
    const uploadUrl = await this.storageService.getPresignedPutUrl(
      fileData.storageKey,
      mimeType,
    );

    return {
      id: file.id,
      uploadUrl,
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes),
      sensitivity: file.sensitivity as FileSensitivity,
    };
  }

  /**
   * Commit uploaded file (Mark as COMMITTED)
   * Validates S3 metadata matches expected values.
   */
  async commitUpload(
    fileId: string,
    eventId: string,
    options?: CommitUploadOptions,
  ): Promise<void> {
    const userId = this.cls.get('actorId');
    let fieldConstraints: FileFieldConstraints | null = null;
    if (options) {
      fieldConstraints = await this.resolveUploadFieldContext(eventId, userId, {
        applicationId: options.applicationId,
        stepId: options.stepId,
        fieldId: options.fieldId,
      });
      fieldConstraints = {
        fieldId: fieldConstraints.fieldId,
        allowedMimeTypes:
          options.expectedAllowedMimeTypes !== undefined
            ? this.normalizeMimeTypes(options.expectedAllowedMimeTypes)
            : fieldConstraints.allowedMimeTypes,
        maxFileSizeBytes:
          options.expectedMaxFileSizeBytes !== undefined
            ? options.expectedMaxFileSizeBytes
            : fieldConstraints.maxFileSizeBytes,
      };
    }

    const file = await this.prisma.file_objects.findUnique({
      where: { id: fileId },
    });

    if (!file) throw new NotFoundException('File not found');
    if (file.event_id !== eventId)
      throw new NotFoundException('File not found');
    if (file.created_by !== userId)
      throw new ForbiddenException('Access denied');

    if (file.status === 'COMMITTED') {
      const committedMime = String(file.mime_type ?? '').toLowerCase();
      const committedSize = Number(file.size_bytes ?? 0);
      this.assertMimeNotBlocked(committedMime);
      if (fieldConstraints) {
        this.assertMatchesFieldConstraints(
          committedMime,
          committedSize,
          fieldConstraints,
          'stored',
        );
      }
      return;
    }

    // Verify existence and metadata in S3
    let head;
    try {
      head = await this.storageService.getHeadObject(file.storage_key);
    } catch (e) {
      // If not found in S3, throw Bad Request
      throw new BadRequestException(
        'File not found in storage. Upload may have failed.',
      );
    }

    if (!head) throw new BadRequestException('File not found in storage.');

    const actualSize = head.ContentLength || 0;
    const actualMime = (head.ContentType || 'application/octet-stream')
      .toLowerCase()
      .trim();

    // 0. Integrity: the stored object must be EXACTLY the size the client
    // declared at registration. A short object means the PUT body was truncated
    // in transit (observed: an HTTP/3/CDN body-truncation that cut large uploads
    // off near ~10 MiB, dropping the PDF trailer). Committing it would silently
    // store an incomplete, unopenable file, so fail loudly and clean up instead
    // — the applicant simply re-uploads.
    const declaredSize = Number(file.size_bytes ?? 0);
    if (declaredSize > 0 && actualSize !== declaredSize) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException(
        `Upload incomplete — received ${actualSize} of ${declaredSize} bytes. Please upload the file again.`,
      );
    }

    // 1. Size Check (Max 50MB global limit as safety net)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (actualSize > MAX_SIZE) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException('File too large (Max 50MB).');
    }

    // 2. Mime Type Check (Must match what was registered)
    if (actualMime !== String(file.mime_type ?? '').toLowerCase()) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException(
        `File type mismatch. Expected ${String(file.mime_type).toLowerCase()}, got ${actualMime}`,
      );
    }

    // 3. Blocklist (Extra safety)
    if (this.isBlockedMimeType(actualMime)) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException('File type not allowed.');
    }

    if (fieldConstraints) {
      try {
        this.assertMatchesFieldConstraints(
          actualMime,
          actualSize,
          fieldConstraints,
          'uploaded',
        );
      } catch (error) {
        await this.cleanupFailedUpload(file.storage_key, fileId);
        throw error;
      }
    }

    const sha256 = await this.storageService.computeSha256(file.storage_key);

    await this.prisma.file_objects.update({
      where: { id: fileId },
      data: {
        status: 'COMMITTED',
        size_bytes: BigInt(actualSize),
        expires_at: null, // Clear expiry once committed
        sha256,
      },
    });

    // Log Commit
    await this.prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        actor_user_id: userId,
        action: 'FILE_COMMIT',
        entity_type: 'file_object',
        entity_id: fileId,
        meta: { size: actualSize, mime: actualMime },
      },
    });
  }

  private async cleanupFailedUpload(key: string, fileId: string) {
    try {
      await this.storageService.deleteObject(key);
    } catch (e) {
      // Ignore S3 delete errors
    }
    await this.prisma.file_objects.delete({ where: { id: fileId } });
  }

  /**
   * Get secure download URL
   * Enforces sensitivity permissions and ownership references
   */
  async getDownloadUrl(
    fileId: string,
    eventId: string,
    userPermissions: string[],
    download = false,
  ): Promise<FileDownloadUrlResponse> {
    const userId = this.cls.get('actorId');

    const file = await this.prisma.file_objects.findUnique({
      where: { id: fileId },
    });

    if (!file) throw new NotFoundException('File not found');

    // Cross-event isolation
    if (file.event_id !== eventId) {
      throw new NotFoundException('File not found');
    }

    let allowed = false;

    // 1. Staff / Admin Check
    const requiredPerm =
      file.sensitivity === 'sensitive'
        ? Permission.EVENT_FILES_READ_SENSITIVE
        : Permission.EVENT_FILES_READ_NORMAL;

    if (
      userPermissions.includes(requiredPerm) ||
      userPermissions.includes(Permission.ADMIN_EVENTS_MANAGE)
    ) {
      allowed = true;
    }

    // 2. Applicant Owner Check (Strict: Must be referenced in draft or submission)
    if (!allowed && file.created_by === userId) {
      const myAppIds = await this.getMyApplicationIds(userId, eventId);

      if (myAppIds.length > 0) {
        // Check Drafts
        const drafts = await this.prisma.step_drafts.findMany({
          where: {
            application_id: { in: myAppIds },
          },
          select: { answers_draft: true },
        });

        // Check Submissions
        const submissions = await this.prisma.step_submission_versions.findMany(
          {
            where: {
              application_id: { in: myAppIds },
            },
            select: { answers_snapshot: true },
          },
        );

        const allMetadata = [
          ...drafts.map((d) => d.answers_draft),
          ...submissions.map((s) => s.answers_snapshot),
        ];

        const fileIdStr = fileId;
        // Basic string search in JSON to find the ID.
        // This covers structured objects like { fileObjectId: "..." } or plain arrays.
        const existsInAnswers = allMetadata.some((json) => {
          const str = JSON.stringify(json);
          return str && str.includes(fileIdStr);
        });

        if (existsInAnswers) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      throw new ForbiddenException('Access denied');
    }

    // Audit Log
    await this.prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        actor_user_id: userId,
        action: 'FILE_ACCESS',
        entity_type: 'file_object',
        entity_id: fileId,
        after: { sensitivity: file.sensitivity },
      },
    });

    // Signed URL generation
    const safeFilename = encodeURIComponent(
      file.original_filename || 'download',
    );
    const contentDisposition = download
      ? `attachment; filename*=UTF-8''${safeFilename}`
      : undefined;
    const url = await this.storageService.getPresignedGetUrlWithDisposition(
      file.storage_key,
      contentDisposition,
    );

    return {
      url,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  async listExportableFileFields(eventId: string): Promise<ExportableFileField[]> {
    const workflowSteps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
      select: {
        id: true,
        title: true,
        step_index: true,
        form_versions: {
          select: { schema: true },
        },
      },
    });

    const exportableFields: ExportableFileField[] = [];
    for (const step of workflowSteps) {
      const fields = getFormFields(
        step.form_versions?.schema as FormDefinition | undefined,
      );
      for (const field of fields) {
        if (field.type !== 'file_upload') continue;
        const fieldKey = String(field.key || field.id || '').trim();
        if (!fieldKey) continue;
        const maxFiles = Number(field.ui?.maxFiles ?? 1);

        exportableFields.push({
          stepId: step.id,
          stepTitle: step.title,
          stepIndex: step.step_index,
          fieldKey,
          fieldLabel: String(field.label || fieldKey),
          maxFiles:
            Number.isFinite(maxFiles) && maxFiles > 0
              ? Math.floor(maxFiles)
              : 1,
        });
      }
    }

    return exportableFields;
  }

  async createFieldFileExportJob(
    eventId: string,
    dto: CreateFieldFileExportJobRequestDto,
  ): Promise<FieldFileExportJobResponse> {
    const actorId = this.getActorIdOrThrow();
    const permissionContext = this.resolveExportPermissionContextFromCurrentRequest();
    const normalizedApplicationIds = this.normalizeExportApplicationIds(
      dto.applicationIds,
    );
    await this.resolveExportFieldDefinition(eventId, dto.stepId, dto.fieldId);

    const maxAttempts = Math.max(
      Number(
        process.env.FIELD_FILE_EXPORT_JOB_MAX_ATTEMPTS ??
          FIELD_FILE_EXPORT_JOB_DEFAULT_MAX_ATTEMPTS,
      ),
      1,
    );
    const row = await (this.prisma as any).field_file_export_jobs.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        step_id: dto.stepId,
        field_id: dto.fieldId,
        requester_user_id: actorId,
        application_ids: normalizedApplicationIds,
        permission_snapshot: {
          canReadNormal: permissionContext.canReadNormal,
          canReadSensitive: permissionContext.canReadSensitive,
        },
        status: 'PENDING',
        attempts: 0,
        max_attempts: maxAttempts,
        next_retry_at: new Date(),
      },
    });

    return this.mapFieldFileExportJobRow(row);
  }

  async getFieldFileExportJob(
    eventId: string,
    jobId: string,
  ): Promise<FieldFileExportJobResponse> {
    const row = await this.getFieldFileExportJobForRequester(eventId, jobId);
    return this.mapFieldFileExportJobRow(row);
  }

  async getFieldFileExportJobDownloadUrl(
    eventId: string,
    jobId: string,
  ): Promise<FieldFileExportJobDownloadUrlResponse> {
    const row = await this.getFieldFileExportJobForRequester(eventId, jobId);
    if (
      String(row.status ?? '').toUpperCase() !== 'DONE' ||
      !row.output_storage_key ||
      !row.output_filename
    ) {
      throw new BadRequestException('Export job is not ready for download');
    }

    const safeFilename = encodeURIComponent(String(row.output_filename).trim());
    const contentDisposition = `attachment; filename*=UTF-8''${safeFilename}`;
    const url = await this.storageService.getPresignedGetUrlWithDisposition(
      row.output_storage_key,
      contentDisposition,
      FIELD_FILE_EXPORT_JOB_PRESIGNED_DOWNLOAD_TTL_SECONDS,
    );

    return {
      url,
      expiresAt: new Date(
        Date.now() + FIELD_FILE_EXPORT_JOB_PRESIGNED_DOWNLOAD_TTL_SECONDS * 1000,
      ),
      filename: row.output_filename,
    };
  }

  async processFieldFileExportJobsBatch(workerId: string, batchSize: number) {
    const claimed = await this.prisma.$queryRawUnsafe<any[]>(
      `
      WITH candidates AS (
        SELECT id
        FROM "field_file_export_jobs"
        WHERE "status" = 'PENDING'
          AND "next_retry_at" <= NOW()
          AND "attempts" < "max_attempts"
        ORDER BY "created_at" ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "field_file_export_jobs" AS jobs
      SET "status" = 'PROCESSING',
          "attempts" = jobs."attempts" + 1,
          "locked_at" = NOW(),
          "locked_by" = $2,
          "updated_at" = NOW()
      FROM candidates
      WHERE jobs.id = candidates.id
      RETURNING jobs.*
      `,
      Math.max(batchSize, 1),
      workerId,
    );

    if (!claimed.length) {
      return { claimed: 0, completed: 0, failed: 0 };
    }

    let completed = 0;
    let failed = 0;

    for (const job of claimed) {
      try {
        const applicationIds = this.parseFieldFileExportJobApplicationIds(
          job.application_ids,
        );
        const permissionContext = this.parseFieldFileExportPermissionSnapshot(
          job.permission_snapshot,
        );
        const zipExport = await this.buildEventFieldFilesZip(
          job.event_id,
          job.step_id,
          job.field_id,
          applicationIds,
          permissionContext,
        );
        const outputStorageKey = this.buildFieldFileExportJobStorageKey(
          job.event_id,
          job.id,
        );
        await this.storageService.putObjectBuffer(
          outputStorageKey,
          zipExport.buffer,
          'application/zip',
        );

        await (this.prisma as any).field_file_export_jobs.update({
          where: { id: job.id },
          data: {
            status: 'DONE',
            output_storage_key: outputStorageKey,
            output_filename: zipExport.filename,
            output_size_bytes: BigInt(zipExport.buffer.byteLength),
            completed_at: new Date(),
            error_message: null,
            locked_at: null,
            locked_by: null,
            updated_at: new Date(),
          },
        });
        completed += 1;
      } catch (error) {
        failed += 1;
        const attempts = Number(job.attempts ?? 0);
        const maxAttempts = Number(
          job.max_attempts ?? FIELD_FILE_EXPORT_JOB_DEFAULT_MAX_ATTEMPTS,
        );
        const isExhausted = attempts >= maxAttempts;
        const errorMessage =
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Field file ZIP export failed';
        const retryDelaySeconds = Math.min(2 ** Math.max(attempts, 1) * 30, 3600);
        const nextRetryAt = new Date(Date.now() + retryDelaySeconds * 1000);

        await (this.prisma as any).field_file_export_jobs.update({
          where: { id: job.id },
          data: {
            status: isExhausted ? 'FAILED' : 'PENDING',
            error_message: errorMessage,
            next_retry_at: isExhausted ? job.next_retry_at : nextRetryAt,
            locked_at: null,
            locked_by: null,
            updated_at: new Date(),
            completed_at: isExhausted ? new Date() : null,
          },
        });
      }
    }

    return {
      claimed: claimed.length,
      completed,
      failed,
    };
  }

  async exportEventFieldFilesZip(
    eventId: string,
    stepId: string,
    fieldId: string,
    applicationIds?: string[],
  ): Promise<ExportFieldFilesZipResult> {
    const permissionContext = this.resolveExportPermissionContextFromCurrentRequest();
    return this.buildEventFieldFilesZip(
      eventId,
      stepId,
      fieldId,
      applicationIds,
      permissionContext,
    );
  }

  private async buildEventFieldFilesZip(
    eventId: string,
    stepId: string,
    fieldId: string,
    applicationIds: string[] | undefined,
    permissionContext: ExportPermissionContext,
  ): Promise<ExportFieldFilesZipResult> {
    const normalizedApplicationIds = this.normalizeExportApplicationIds(
      applicationIds,
    );
    const { fieldKey, safeFieldKey, allowMultiple } =
      await this.resolveExportFieldDefinition(eventId, stepId, fieldId);

    const stepStates = await this.prisma.application_step_states.findMany({
      where: {
        step_id: stepId,
        latest_submission_version_id: { not: null },
        applications: { event_id: eventId },
        ...(normalizedApplicationIds.length > 0
          ? {
              application_id: {
                in: normalizedApplicationIds,
              },
            }
          : {}),
      },
      orderBy: { application_id: 'asc' },
      select: {
        application_id: true,
        latest_submission_version_id: true,
        applications: {
          select: {
            users_applications_applicant_user_idTousers: {
              select: { email: true },
            },
          },
        },
      },
    });
    if (stepStates.length === 0) {
      throw new BadRequestException(
        normalizedApplicationIds.length > 0
          ? 'No submitted answers found for the selected applications in this step'
          : 'No submitted answers found for this step',
      );
    }

    const latestSubmissionVersionIds = Array.from(
      new Set(
        stepStates
          .map((state) => state.latest_submission_version_id)
          .filter(
            (submissionId): submissionId is string =>
              typeof submissionId === 'string' && submissionId.length > 0,
          ),
      ),
    );
    if (latestSubmissionVersionIds.length === 0) {
      throw new BadRequestException(
        normalizedApplicationIds.length > 0
          ? 'No submitted answers found for the selected applications in this step'
          : 'No submitted answers found for this step',
      );
    }

    const [submissions, patches] = await Promise.all([
      this.prisma.step_submission_versions.findMany({
        where: {
          id: { in: latestSubmissionVersionIds },
          step_id: stepId,
        },
        select: {
          id: true,
          application_id: true,
          answers_snapshot: true,
        },
      }),
      this.prisma.admin_change_patches.findMany({
        where: {
          submission_version_id: { in: latestSubmissionVersionIds },
          is_active: true,
        },
        select: {
          submission_version_id: true,
          ops: true,
        },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    const submissionsById = new Map(
      submissions.map((submission) => [submission.id, submission]),
    );
    const missingSubmissionIds = latestSubmissionVersionIds.filter(
      (submissionId) => !submissionsById.has(submissionId),
    );
    if (missingSubmissionIds.length > 0) {
      throw new NotFoundException(
        `Submission versions not found for export: ${missingSubmissionIds.join(', ')}`,
      );
    }

    const patchesBySubmissionId = new Map<string, unknown[]>();
    for (const patch of patches) {
      const list = patchesBySubmissionId.get(patch.submission_version_id) ?? [];
      list.push(patch.ops);
      patchesBySubmissionId.set(patch.submission_version_id, list);
    }

    const applicationFiles: Array<{
      applicationId: string;
      applicantEmail: string;
      fileObjectIds: string[];
    }> = [];
    const allFileObjectIds: string[] = [];

    for (const stepState of stepStates) {
      const submissionId = stepState.latest_submission_version_id;
      if (!submissionId) continue;

      const submission = submissionsById.get(submissionId);
      if (!submission) {
        throw new NotFoundException(
          `Submission version not found for export: ${submissionId}`,
        );
      }

      const effectiveAnswers = this.applyActivePatchesToAnswers(
        submission.answers_snapshot as Record<string, unknown>,
        patchesBySubmissionId.get(submission.id) ?? [],
      );
      const fileObjectIds = this.extractFileObjectIds(effectiveAnswers[fieldKey]);
      if (fileObjectIds.length === 0) continue;

      const applicantEmail =
        stepState.applications?.users_applications_applicant_user_idTousers
          ?.email ?? 'unknown-email';
      const safeEmail = this.sanitizeFileNameSegment(
        applicantEmail,
        'unknown-email',
      );

      applicationFiles.push({
        applicationId: stepState.application_id,
        applicantEmail: safeEmail,
        fileObjectIds,
      });
      allFileObjectIds.push(...fileObjectIds);
    }

    if (applicationFiles.length === 0 || allFileObjectIds.length === 0) {
      throw new BadRequestException(
        'No uploaded files found for this field in latest submitted answers',
      );
    }

    const uniqueFileIds = Array.from(new Set(allFileObjectIds));
    const files = await this.prisma.file_objects.findMany({
      where: {
        id: { in: uniqueFileIds },
        event_id: eventId,
      },
      select: {
        id: true,
        storage_key: true,
        original_filename: true,
        sensitivity: true,
      },
    });
    if (files.length !== uniqueFileIds.length) {
      const foundIds = new Set(files.map((file) => file.id));
      const missing = uniqueFileIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Files not found for export: ${missing.join(', ')}`,
      );
    }

    const fileById = new Map(files.map((file) => [file.id, file]));

    const zipEntries: Array<{
      entryName: string;
      storageKey: string;
    }> = [];
    const usedEntryNames = new Set<string>();
    for (const applicationEntry of applicationFiles) {
      for (
        let index = 0;
        index < applicationEntry.fileObjectIds.length;
        index += 1
      ) {
        const fileId = applicationEntry.fileObjectIds[index];
        const file = fileById.get(fileId);
        if (!file) {
          throw new NotFoundException(`File not found for export: ${fileId}`);
        }

        this.assertCanExportFileBySensitivityWithContext(
          file.sensitivity,
          permissionContext,
        );
        const extension = this.resolveFileExtension(file.original_filename);
        const preferredEntryName = this.buildExportEntryFilename({
          applicantEmail: applicationEntry.applicantEmail,
          applicationId: applicationEntry.applicationId,
          fieldKey: safeFieldKey,
          extension,
          fileIndex: index + 1,
          includeFileIndex: allowMultiple,
        });
        const entryName = this.ensureUniqueZipEntryName(
          preferredEntryName,
          usedEntryNames,
        );
        zipEntries.push({
          entryName,
          storageKey: file.storage_key,
        });
      }
    }

    const fileBuffersByEntryName = await this.fetchZipEntryBuffers(zipEntries);

    const zip = new JSZip();
    for (const entry of zipEntries) {
      const fileBuffer = fileBuffersByEntryName.get(entry.entryName);
      if (!fileBuffer) {
        throw new NotFoundException(
          `File content not found for export entry: ${entry.entryName}`,
        );
      }
      zip.file(entry.entryName, fileBuffer);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 1 },
    });
    const zipFilename = this.buildEventFieldExportZipFilename({
      eventId,
      stepId,
      fieldKey: safeFieldKey,
    });

    return {
      filename: zipFilename,
      buffer: zipBuffer,
    };
  }

  private async getMyApplicationIds(
    userId: string,
    eventId: string,
  ): Promise<string[]> {
    const apps = await this.prisma.applications.findMany({
      where: { applicant_user_id: userId, event_id: eventId },
      select: { id: true },
    });
    return apps.map((a) => a.id);
  }

  /**
   * Verify a field answer
   */
  async verifyField(
    eventId: string,
    applicationId: string,
    stepId: string,
    submissionVersionId: string,
    fieldId: string,
    fileObjectId: string | undefined, // Now used
    status: FileVerificationStatus,
    reason: string | undefined,
    notesInternal: string | undefined,
  ): Promise<FileVerificationResponse> {
    const userId = this.cls.get('actorId');

    const submission = await this.prisma.step_submission_versions.findFirst({
      where: {
        id: submissionVersionId,
        application_id: applicationId,
        step_id: stepId,
      },
      include: { applications: { select: { event_id: true } } },
    });
    if (!submission)
      throw new NotFoundException('Submission version not found');
    if (submission.applications.event_id !== eventId) {
      throw new NotFoundException('Submission version not found');
    }

    // Validate field exists in form schema
    const formVersion = await this.prisma.form_versions.findUnique({
      where: { id: submission.form_version_id },
    });
    if (!formVersion) throw new NotFoundException('Form version not found');

    const allFields = getFormFields(
      formVersion.schema as FormDefinition | undefined,
    );
    const field = allFields.find((f) => f.key === fieldId || f.id === fieldId);
    if (!field) throw new BadRequestException('Field not found in form schema');

    const fieldKey = field.key || field.id;

    if (field.type !== 'file_upload') {
      throw new BadRequestException('Field is not a file_upload field');
    }

    if (!fileObjectId) {
      throw new BadRequestException(
        'fileObjectId is required for file_upload verification',
      );
    }

    // Resolve the effective answers the same way the reviewer UI and the file
    // export path do: normalize the `{ data: {...} }` snapshot shape AND apply
    // any active admin patches. Reading the raw snapshot here caused valid
    // verifications to 400 ("File is not referenced...") whenever the field had
    // been patched (file replaced via "Edit field") or the snapshot was stored
    // under a nested `data` key — the fileObjectId the reviewer clicked comes
    // from the patched/normalized answers, not the raw snapshot.
    const activePatches = await this.prisma.admin_change_patches.findMany({
      where: {
        submission_version_id: submissionVersionId,
        is_active: true,
      },
      select: { ops: true },
      orderBy: { created_at: 'asc' },
    });
    const effectiveAnswers = this.applyActivePatchesToAnswers(
      submission.answers_snapshot as Record<string, unknown>,
      activePatches.map((patch) => patch.ops),
    );
    const answerValue = effectiveAnswers[fieldKey];
    const fileIdsInAnswer = this.extractFileObjectIds(answerValue);
    if (!fileIdsInAnswer.includes(fileObjectId)) {
      throw new BadRequestException(
        'File is not referenced in this submission for the specified field',
      );
    }

    // Ensure file belongs to event
    const file = await this.prisma.file_objects.findFirst({
      where: { id: fileObjectId, event_id: eventId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('File not found');

    const verification = await this.prisma.field_verifications.upsert({
      where: {
        submission_version_id_field_id_file_object_id: {
          submission_version_id: submissionVersionId,
          field_id: fieldKey,
          file_object_id: (fileObjectId || null) as any,
        },
      },
      create: {
        id: crypto.randomUUID(),
        submission_version_id: submissionVersionId,
        field_id: fieldKey,
        file_object_id: fileObjectId,
        status: status,
        reason_code: reason,
        notes_internal: notesInternal,
        set_by: userId,
      },
      update: {
        status: status,
        reason_code: reason,
        notes_internal: notesInternal,
        set_by: userId,
        set_at: new Date(),
      },
    });

    return {
      id: verification.id,
      submissionVersionId: verification.submission_version_id,
      fieldId: verification.field_id,
      fileObjectId: verification.file_object_id,
      status: verification.status as FileVerificationStatus,
      reasonCode: verification.reason_code,
      notesInternal: verification.notes_internal,
      setBy: verification.set_by,
      setAt: verification.set_at,
    };
  }

  /**
   * Validate files exist and belong to event (and "commit" them)
   */
  async validateAndCommit(
    references: FileValidationReference[],
    eventId: string,
    userId: string,
    context: { applicationId: string; stepId: string },
  ): Promise<void> {
    if (references.length === 0) return;

    const actorId = this.cls.get('actorId');
    if (actorId && userId && actorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const uniqueFileIds = Array.from(new Set(references.map((ref) => ref.fileId)));

    const files = await this.prisma.file_objects.findMany({
      where: {
        id: { in: uniqueFileIds },
        event_id: eventId,
        created_by: userId,
      },
    });

    if (files.length !== uniqueFileIds.length) {
      // Find missing or unauthorized files
      const foundIds = new Set(files.map((f) => f.id));
      const missingIds = uniqueFileIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Files not found or access denied: ${missingIds.join(', ')}`,
      );
    }

    // Enforce field constraints for each referenced field/file pair.
    const seenReferenceKeys = new Set<string>();
    for (const ref of references) {
      const key = `${ref.fileId}:${ref.fieldId}`;
      if (seenReferenceKeys.has(key)) continue;
      seenReferenceKeys.add(key);

      await this.commitUpload(ref.fileId, eventId, {
        applicationId: context.applicationId,
        stepId: context.stepId,
        fieldId: ref.fieldId,
        expectedAllowedMimeTypes: ref.allowedMimeTypes,
        expectedMaxFileSizeBytes: ref.maxFileSizeBytes,
      });
    }
  }

  /**
   * Check if all required files in a submission are verified
   */
  async checkVerificationStatus(
    submissionVersionId: string,
    requiredFileRefs: Array<{ fieldId: string; fileObjectId: string }>,
  ): Promise<boolean> {
    if (requiredFileRefs.length === 0) return true;

    const verifications = await this.prisma.field_verifications.findMany({
      where: {
        submission_version_id: submissionVersionId,
        status: FileVerificationStatus.VERIFIED,
      },
    });

    // Create look up set: "fieldId:fileObjectId"
    const verifiedSet = new Set(
      verifications
        .filter((v) => v.file_object_id)
        .map((v) => `${v.field_id}:${v.file_object_id}`),
    );

    // Check if every required ref is verified
    for (const ref of requiredFileRefs) {
      if (!verifiedSet.has(`${ref.fieldId}:${ref.fileObjectId}`)) {
        return false;
      }
    }

    return true;
  }

  private getActorIdOrThrow(): string {
    const actorId = this.cls.get('actorId');
    if (typeof actorId !== 'string' || actorId.trim().length === 0) {
      throw new ForbiddenException('Access denied');
    }
    return actorId;
  }

  private resolveExportPermissionContextFromCurrentRequest(): ExportPermissionContext {
    const permissions = (this.cls.get('permissions') ?? []) as string[];
    return this.buildExportPermissionContext(permissions);
  }

  private buildExportPermissionContext(
    userPermissions: string[],
  ): ExportPermissionContext {
    const isAdmin = userPermissions.includes(Permission.ADMIN_EVENTS_MANAGE);
    const canReadSensitive =
      isAdmin || userPermissions.includes(Permission.EVENT_FILES_READ_SENSITIVE);
    const canReadNormal =
      canReadSensitive ||
      userPermissions.includes(Permission.EVENT_FILES_READ_NORMAL);
    return {
      canReadNormal,
      canReadSensitive,
    };
  }

  private normalizeExportApplicationIds(
    applicationIds: string[] | undefined,
  ): string[] {
    return Array.from(
      new Set(
        (applicationIds ?? [])
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private async resolveExportFieldDefinition(
    eventId: string,
    stepId: string,
    fieldId: string,
  ): Promise<{
    fieldKey: string;
    safeFieldKey: string;
    allowMultiple: boolean;
  }> {
    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
      select: {
        id: true,
        form_versions: {
          select: { schema: true },
        },
      },
    });
    if (!step) throw new NotFoundException('Step not found');

    const allFields = getFormFields(
      step.form_versions?.schema as FormDefinition | undefined,
    );
    const field = allFields.find(
      (candidate) => candidate.key === fieldId || candidate.id === fieldId,
    );
    if (!field) throw new BadRequestException('Field not found in form schema');
    if (field.type !== 'file_upload') {
      throw new BadRequestException('Field is not a file_upload field');
    }

    const fieldKey = field.key || field.id || fieldId;
    const safeFieldKey = this.sanitizeFileNameSegment(fieldKey, 'field');
    const allowMultiple = Number(field.ui?.maxFiles ?? 1) > 1;

    return {
      fieldKey,
      safeFieldKey,
      allowMultiple,
    };
  }

  private parseFieldFileExportPermissionSnapshot(
    snapshot: unknown,
  ): ExportPermissionContext {
    const source =
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? (snapshot as Record<string, unknown>)
        : {};
    const canReadSensitive = Boolean(source.canReadSensitive);
    const canReadNormal = canReadSensitive || Boolean(source.canReadNormal);
    return {
      canReadNormal,
      canReadSensitive,
    };
  }

  private parseFieldFileExportJobApplicationIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const asStrings = value.map((entry) => String(entry ?? ''));
    return this.normalizeExportApplicationIds(asStrings);
  }

  private buildFieldFileExportJobStorageKey(
    eventId: string,
    jobId: string,
  ): string {
    return `events/${eventId}/exports/field-files/${jobId}.zip`;
  }

  private async getFieldFileExportJobForRequester(
    eventId: string,
    jobId: string,
  ): Promise<any> {
    const actorId = this.getActorIdOrThrow();
    const row = await (this.prisma as any).field_file_export_jobs.findFirst({
      where: { id: jobId, event_id: eventId },
    });
    if (!row || row.requester_user_id !== actorId) {
      throw new NotFoundException('File export job not found');
    }
    return row;
  }

  private mapFieldFileExportJobRow(row: any): FieldFileExportJobResponse {
    return {
      id: row.id,
      eventId: row.event_id,
      stepId: row.step_id,
      fieldId: row.field_id,
      status: String(row.status ?? 'PENDING').toUpperCase() as
        | 'PENDING'
        | 'PROCESSING'
        | 'DONE'
        | 'FAILED',
      applicationIdsCount: this.parseFieldFileExportJobApplicationIds(
        row.application_ids,
      ).length,
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(
        row.max_attempts ?? FIELD_FILE_EXPORT_JOB_DEFAULT_MAX_ATTEMPTS,
      ),
      nextRetryAt: row.next_retry_at,
      lockedAt: row.locked_at ?? null,
      lockedBy: row.locked_by ?? null,
      errorMessage: row.error_message ?? null,
      outputFilename: row.output_filename ?? null,
      outputSizeBytes: this.toSafeIntegerOrNull(row.output_size_bytes),
      completedAt: row.completed_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toSafeIntegerOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      return null;
    }
    return Math.floor(normalized);
  }

  private async resolveUploadFieldContext(
    eventId: string,
    userId: string,
    context: UploadFieldContext,
  ): Promise<FileFieldConstraints> {
    const application = await this.prisma.applications.findFirst({
      where: { id: context.applicationId, event_id: eventId },
      select: { id: true, applicant_user_id: true },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const permissions = (this.cls.get('permissions') || []) as string[];
    const isStaffActor =
      permissions.includes(Permission.EVENT_STEP_PATCH) ||
      permissions.includes(Permission.ADMIN_EVENTS_MANAGE);
    if (!isStaffActor && application.applicant_user_id !== userId) {
      throw new ForbiddenException('Cannot upload files for another applicant');
    }

    const [step, stepState] = await Promise.all([
      this.prisma.workflow_steps.findFirst({
        where: { id: context.stepId, event_id: eventId },
        select: {
          id: true,
          form_version_id: true,
          deadline_at: true,
          allow_applicant_modification: true,
          modification_scope: true,
        },
      }),
      this.prisma.application_step_states.findFirst({
        where: {
          application_id: context.applicationId,
          step_id: context.stepId,
        },
        select: { status: true },
      }),
    ]);

    if (!step) throw new NotFoundException('Step not found');
    if (!stepState) throw new NotFoundException('Step state not found');
    if (!step.form_version_id) {
      throw new BadRequestException('Step has no form attached');
    }

    if (!isStaffActor) {
      if (
        !canApplicantEditStep(
          stepState.status,
          step.allow_applicant_modification,
          step.modification_scope,
        )
      ) {
        throw new ForbiddenException('Step is not open for file uploads');
      }
      if (
        stepState.status !== 'NEEDS_REVISION' &&
        step.deadline_at &&
        new Date() > new Date(step.deadline_at)
      ) {
        throw new ForbiddenException('Step deadline has passed');
      }
    }

    const formVersion = await this.prisma.form_versions.findUnique({
      where: { id: step.form_version_id },
      select: { schema: true },
    });
    if (!formVersion) throw new NotFoundException('Form version not found');

    const fields = getFormFields(
      formVersion.schema as FormDefinition | undefined,
    );
    const field = fields.find(
      (candidate) =>
        candidate.key === context.fieldId || candidate.id === context.fieldId,
    );
    if (!field) {
      throw new BadRequestException('Field not found in form schema');
    }
    if (field.type !== 'file_upload') {
      throw new BadRequestException('Field is not a file_upload field');
    }

    return this.toFieldConstraints(field, context.fieldId);
  }

  private toFieldConstraints(
    field: any,
    fallbackFieldId: string,
  ): FileFieldConstraints {
    const allowedMimeTypes = this.normalizeMimeTypes(
      field?.ui?.allowedMimeTypes ?? field?.validation?.allowedTypes,
    );
    const maxFileSizeMB = Number(field?.ui?.maxFileSizeMB);
    const maxFileSizeBytes =
      Number.isFinite(maxFileSizeMB) && maxFileSizeMB > 0
        ? Math.floor(maxFileSizeMB * 1024 * 1024)
        : undefined;

    return {
      fieldId:
        typeof field?.key === 'string' && field.key.trim().length > 0
          ? field.key
          : typeof field?.id === 'string' && field.id.trim().length > 0
            ? field.id
            : fallbackFieldId,
      allowedMimeTypes,
      maxFileSizeBytes,
    };
  }

  private normalizeMimeTypes(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0),
      ),
    );
  }

  private applyActivePatchesToAnswers(
    baseAnswers: Record<string, unknown> | null | undefined,
    patchOpsList: unknown[],
  ): Record<string, unknown> {
    const effective = this.normalizeAnswersShape(baseAnswers);

    for (const rawOps of patchOpsList) {
      if (!Array.isArray(rawOps)) continue;
      for (const rawOp of rawOps) {
        const op = rawOp as {
          op?: string;
          path?: string;
          value?: unknown;
        };
        if (!op || typeof op.path !== 'string') continue;
        const key = this.decodeJsonPointerPath(op.path);
        if (!key) continue;

        if (op.op === 'remove') {
          delete effective[key];
          continue;
        }

        if (op.op === 'replace' || op.op === 'add') {
          effective[key] = op.value;
        }
      }
    }

    return this.normalizeAnswersShape(effective);
  }

  private normalizeAnswersShape(
    answers: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return {};
    }
    const normalized = { ...answers };
    const nestedData = normalized.data;
    if (
      nestedData &&
      typeof nestedData === 'object' &&
      !Array.isArray(nestedData)
    ) {
      Object.assign(normalized, nestedData as Record<string, unknown>);
    }
    if (
      'data' in normalized &&
      Object.keys(normalized).some((key) => key !== 'data')
    ) {
      delete normalized.data;
    }
    return normalized;
  }

  private decodeJsonPointerPath(path: string): string {
    const trimmed = path.replace(/^\//, '');
    if (!trimmed) return '';
    return trimmed
      .split('/')
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
      .join('/');
  }

  private assertCanExportFileBySensitivity(
    sensitivity: string,
    userPermissions: string[],
  ): void {
    const context = this.buildExportPermissionContext(userPermissions);
    this.assertCanExportFileBySensitivityWithContext(sensitivity, context);
  }

  private assertCanExportFileBySensitivityWithContext(
    sensitivity: string,
    context: ExportPermissionContext,
  ): void {
    const canReadSensitive = context.canReadSensitive;
    const canReadNormal = context.canReadNormal;

    const sensitivityValue = String(sensitivity || '').toLowerCase();
    if (sensitivityValue === 'sensitive') {
      if (!canReadSensitive) {
        throw new ForbiddenException(
          'Missing permission to export sensitive files',
        );
      }
      return;
    }

    if (!canReadNormal) {
      throw new ForbiddenException('Missing permission to export files');
    }
  }

  private resolveFileExtension(originalFilename: string | null | undefined): string {
    const extension = extname(String(originalFilename ?? '')).toLowerCase();
    if (!extension) return '';
    return /^\.[a-z0-9]{1,20}$/i.test(extension) ? extension : '';
  }

  private sanitizeFileNameSegment(value: string, fallback: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return fallback;
    const withoutReserved = trimmed.replace(/[<>:"/\\|?*]/g, '_');
    const withoutControlChars = Array.from(withoutReserved)
      .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('');
    const sanitized = withoutControlChars
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return sanitized || fallback;
  }

  private buildExportEntryFilename(input: {
    applicantEmail: string;
    applicationId: string;
    fieldKey: string;
    extension: string;
    fileIndex: number;
    includeFileIndex: boolean;
  }): string {
    const base = `${input.applicantEmail}__${input.applicationId}__${input.fieldKey}`;
    const indexedBase = input.includeFileIndex
      ? `${base}__file_${input.fileIndex}`
      : base;
    return `${indexedBase}${input.extension}`;
  }

  private buildEventFieldExportZipFilename(input: {
    eventId: string;
    stepId: string;
    fieldKey: string;
  }): string {
    const safeEventId = this.sanitizeFileNameSegment(input.eventId, 'event');
    const safeStepId = this.sanitizeFileNameSegment(input.stepId, 'step');
    return `${safeEventId}__${safeStepId}__${input.fieldKey}.zip`;
  }

  private ensureUniqueZipEntryName(
    preferredName: string,
    usedNames: Set<string>,
  ): string {
    if (!usedNames.has(preferredName)) {
      usedNames.add(preferredName);
      return preferredName;
    }

    const extension = this.resolveFileExtension(preferredName);
    const base =
      extension.length > 0
        ? preferredName.slice(0, preferredName.length - extension.length)
        : preferredName;
    let counter = 2;
    let nextName = `${base}__${counter}${extension}`;
    while (usedNames.has(nextName)) {
      counter += 1;
      nextName = `${base}__${counter}${extension}`;
    }
    usedNames.add(nextName);
    return nextName;
  }

  private async fetchZipEntryBuffers(
    entries: Array<{ entryName: string; storageKey: string }>,
  ): Promise<Map<string, Buffer>> {
    const buffersByEntryName = new Map<string, Buffer>();
    if (entries.length === 0) {
      return buffersByEntryName;
    }

    const workerCount = Math.min(
      ZIP_EXPORT_STORAGE_FETCH_CONCURRENCY,
      entries.length,
    );
    let nextIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < entries.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const entry = entries[currentIndex];
        if (!entry) break;

        const fileBuffer = await this.storageService.getObjectBuffer(
          entry.storageKey,
        );
        buffersByEntryName.set(entry.entryName, fileBuffer);
      }
    });

    await Promise.all(workers);
    return buffersByEntryName;
  }

  private assertMatchesFieldConstraints(
    mimeType: string,
    sizeBytes: number,
    constraints: FileFieldConstraints,
    sourceLabel: 'declared' | 'uploaded' | 'stored',
  ): void {
    if (
      typeof constraints.maxFileSizeBytes === 'number' &&
      Number.isFinite(constraints.maxFileSizeBytes) &&
      constraints.maxFileSizeBytes > 0 &&
      sizeBytes > constraints.maxFileSizeBytes
    ) {
      const maxSizeMB = (
        constraints.maxFileSizeBytes /
        (1024 * 1024)
      ).toFixed(2);
      throw new BadRequestException(
        `File too large for field "${constraints.fieldId}" (${sourceLabel} size ${sizeBytes} bytes, max ${maxSizeMB}MB).`,
      );
    }

    if (
      constraints.allowedMimeTypes.length > 0 &&
      !constraints.allowedMimeTypes.includes(String(mimeType).toLowerCase())
    ) {
      throw new BadRequestException(
        `File type "${mimeType}" is not allowed for field "${constraints.fieldId}".`,
      );
    }
  }

  private assertMimeNotBlocked(mimeType: string): void {
    if (this.isBlockedMimeType(mimeType)) {
      throw new BadRequestException('File type not allowed.');
    }
  }

  private isBlockedMimeType(mimeType: string): boolean {
    const blockedTypes = [
      'application/x-msdownload',
      'application/x-sh',
      'application/x-php',
      'application/x-dosexec',
    ];
    return blockedTypes.includes(String(mimeType).toLowerCase());
  }

  private extractFileObjectIds(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.flatMap((v) => this.extractFileObjectIds(v));
    }
    if (typeof value === 'string') return [value];
    if (typeof value === 'object') {
      if (typeof value.fileObjectId === 'string') return [value.fileObjectId];
      if (Array.isArray(value.fileObjectIds)) {
        return value.fileObjectIds.filter((v: any) => typeof v === 'string');
      }
    }
    return [];
  }
}
