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
  Permission,
  StepStatus,
} from '@event-platform/shared';
import { StorageService } from '../common/storage/storage.service';
import { FormDefinition, getFormFields } from '@event-platform/schemas';

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

    // Ensure the file is actually referenced in the submission answers for this field
    const answerValue = (submission.answers_snapshot as Record<string, any>)[
      fieldKey
    ];
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
        select: { id: true, form_version_id: true, deadline_at: true },
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
        stepState.status !== StepStatus.UNLOCKED &&
        stepState.status !== StepStatus.NEEDS_REVISION
      ) {
        throw new ForbiddenException('Step is not open for file uploads');
      }
      if (step.deadline_at && new Date() > new Date(step.deadline_at)) {
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
