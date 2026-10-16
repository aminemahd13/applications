import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import {
  isActiveContentMimeType,
  normalizeMimeEssence,
  resolveSafeResponseHeaders,
} from '../common/storage/safe-response-headers.util';
import { ClsService } from 'nestjs-cls';
import { FileSensitivity } from '@event-platform/shared';

type MediaKind = 'all' | 'image' | 'video';
const MICROSITE_STORAGE_PREFIX = /^events\/[^/]+\/microsite\/.+/;
const MICROSITE_MEDIA_MAX_SIZE_BYTES = 150 * 1024 * 1024;
const PUBLIC_ASSET_URL_TTL_SECONDS = 3600;
const BLOCKED_FILE_TYPE_MESSAGE =
  'This file type is not allowed for security reasons.';
const BLOCKED_EXECUTABLE_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-sh',
  'application/x-php',
  'application/x-dosexec',
];

/**
 * Microsite media is public and served from the app origin. Active content
 * (HTML, XML, JS…) is refused; SVG stays allowed for logos — it is always
 * served as an attachment, so it renders in <img> but never as a page.
 */
function isBlockedMicrositeMimeType(rawMimeType: unknown): boolean {
  const essence = normalizeMimeEssence(rawMimeType);
  if (!essence) return true;
  if (BLOCKED_EXECUTABLE_MIME_TYPES.includes(essence)) return true;
  if (essence === 'image/svg+xml') return false;
  return isActiveContentMimeType(essence);
}

@Injectable()
export class MicrositeMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly cls: ClsService,
  ) {}

  async registerUpload(
    eventId: string,
    data: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    const userId = this.cls.get('actorId');

    const declaredMimeType =
      typeof data?.mimeType === 'string' ? data.mimeType.trim() : '';
    const mimeEssence = normalizeMimeEssence(declaredMimeType);
    if (!declaredMimeType || !mimeEssence) {
      throw new BadRequestException('mimeType must be a valid MIME type');
    }
    if (isBlockedMicrositeMimeType(mimeEssence)) {
      throw new BadRequestException(BLOCKED_FILE_TYPE_MESSAGE);
    }
    const sizeBytes = Number(data?.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be a positive integer');
    }
    if (sizeBytes > MICROSITE_MEDIA_MAX_SIZE_BYTES) {
      throw new BadRequestException('File too large (Max 150MB).');
    }

    const originalFilename =
      typeof data?.originalFilename === 'string' &&
      data.originalFilename.trim()
        ? data.originalFilename.trim()
        : 'upload';
    const safeName = originalFilename
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120);

    const storageKey = `events/${eventId}/microsite/${crypto.randomUUID()}-${safeName}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    const file = await this.prisma.file_objects.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        storage_key: storageKey,
        original_filename: originalFilename,
        mime_type: mimeEssence,
        size_bytes: BigInt(sizeBytes),
        sensitivity: FileSensitivity.NORMAL,
        status: 'STAGED',
        expires_at: expiresAt,
        created_by: userId,
      },
    });

    // Sign the exact Content-Type the browser will send on the PUT; the
    // stored essence is what commit and serving compare against.
    const uploadUrl = await this.storageService.getPresignedPutUrl(
      storageKey,
      declaredMimeType,
    );

    return {
      id: file.id,
      uploadUrl,
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes),
      sensitivity: file.sensitivity,
    };
  }

  async commitUpload(eventId: string, fileId: string) {
    const userId = this.cls.get('actorId');
    const file = await this.prisma.file_objects.findUnique({
      where: { id: fileId },
    });

    if (!file || file.event_id !== eventId) {
      throw new NotFoundException('File not found');
    }
    if (file.created_by !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (file.status === 'COMMITTED') {
      await this.ensureCommittedOptimizationState(file.id, file.mime_type);
      return file;
    }

    let head;
    try {
      head = await this.storageService.getHeadObject(file.storage_key);
    } catch {
      throw new BadRequestException('File not found in storage');
    }

    if (!head) throw new BadRequestException('File not found in storage');

    const actualSize = head.ContentLength || 0;
    const actualMime = this.normalizeMimeType(
      head.ContentType || 'application/octet-stream',
    );
    const expectedMime = this.normalizeMimeType(file.mime_type);

    if (actualSize > MICROSITE_MEDIA_MAX_SIZE_BYTES) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException('File too large (Max 150MB).');
    }

    if (actualMime !== expectedMime) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException(
        `File type mismatch. Expected ${expectedMime}, got ${actualMime}`,
      );
    }

    if (isBlockedMicrositeMimeType(actualMime)) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException(BLOCKED_FILE_TYPE_MESSAGE);
    }

    const sha256 = await this.storageService.computeSha256(file.storage_key);
    const optimizationStatus = actualMime.startsWith('image/') ? 'PENDING' : 'DONE';

    return this.prisma.$transaction(async (tx) => {
      const committed = await tx.file_objects.update({
        where: { id: fileId },
        data: {
          status: 'COMMITTED',
          size_bytes: BigInt(actualSize),
          expires_at: null,
          sha256,
        },
      });

      await tx.$executeRawUnsafe(
        `
        UPDATE "file_objects"
        SET "media_optimization_status" = $2,
            "media_optimization_attempts" = 0,
            "media_optimized_at" = CASE WHEN $2 = 'DONE' THEN NOW() ELSE NULL END,
            "media_optimization_last_error" = NULL
        WHERE "id" = $1::uuid
        `,
        fileId,
        optimizationStatus,
      );

      return committed;
    });
  }

  async listAssets(eventId: string, kind: MediaKind = 'all', limit = 120) {
    const where: any = {
      event_id: eventId,
      status: 'COMMITTED',
      storage_key: { startsWith: `events/${eventId}/microsite/` },
    };

    if (kind === 'image') {
      where.mime_type = { startsWith: 'image/' };
    } else if (kind === 'video') {
      where.mime_type = { startsWith: 'video/' };
    }

    const items = await this.prisma.file_objects.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
      select: {
        id: true,
        storage_key: true,
        original_filename: true,
        mime_type: true,
        size_bytes: true,
        created_at: true,
      },
    });

    return items.map((item) => ({
      id: item.id,
      storageKey: item.storage_key,
      originalFilename: item.original_filename,
      mimeType: item.mime_type,
      sizeBytes: Number(item.size_bytes),
      createdAt: item.created_at,
    }));
  }

  async deleteAsset(eventId: string, fileId: string) {
    const file = await this.prisma.file_objects.findFirst({
      where: {
        id: fileId,
        event_id: eventId,
        status: 'COMMITTED',
        storage_key: { startsWith: `events/${eventId}/microsite/` },
      },
      select: {
        id: true,
        storage_key: true,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    await this.storageService.deleteObject(file.storage_key);
    await this.prisma.file_objects.delete({
      where: { id: file.id },
    });
  }

  async getPublicAssetUrl(rawStorageKey: string): Promise<string> {
    const storageKey = (rawStorageKey || '').trim().replace(/^\/+/, '');
    if (!storageKey) {
      throw new BadRequestException('Asset key is required');
    }

    // Only expose microsite media through the public resolver.
    if (!MICROSITE_STORAGE_PREFIX.test(storageKey)) {
      throw new NotFoundException('Asset not found');
    }

    const asset = await this.prisma.file_objects.findFirst({
      where: {
        storage_key: storageKey,
        status: 'COMMITTED',
        events: { is: { status: { not: 'archived' } } },
      },
      select: { id: true, mime_type: true, original_filename: true },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Served from the app origin: never echo the stored type for anything
    // that could render as a document (SVG keeps its type but downloads).
    const responseHeaders = resolveSafeResponseHeaders({
      mimeType: asset.mime_type,
      filename: asset.original_filename,
      profile: 'public-asset',
    });
    return this.storageService.getPresignedGetUrlWithResponseHeaders(
      storageKey,
      {
        contentType: responseHeaders.contentType,
        contentDisposition: responseHeaders.contentDisposition,
        cacheControl: 'public, max-age=3600',
      },
      PUBLIC_ASSET_URL_TTL_SECONDS,
    );
  }

  private async cleanupFailedUpload(key: string, fileId: string) {
    try {
      await this.storageService.deleteObject(key);
    } catch {
      // ignore
    }
    await this.prisma.file_objects.delete({ where: { id: fileId } });
  }

  private normalizeMimeType(rawMimeType: string | undefined): string {
    const raw = rawMimeType ?? 'application/octet-stream';
    // Compare essences (no `;params`, jpg → jpeg); keep the raw lowercase
    // string for unparseable values so they still fail the block check.
    return normalizeMimeEssence(raw) ?? String(raw).trim().toLowerCase();
  }

  private async ensureCommittedOptimizationState(
    fileId: string,
    rawMimeType: string | undefined,
  ): Promise<void> {
    const isImage = this.normalizeMimeType(rawMimeType).startsWith('image/');
    if (isImage) {
      await this.prisma.$executeRawUnsafe(
        `
        UPDATE "file_objects"
        SET "media_optimization_status" = 'PENDING',
            "media_optimization_attempts" = 0,
            "media_optimized_at" = NULL,
            "media_optimization_last_error" = NULL
        WHERE "id" = $1::uuid
          AND "status" = 'COMMITTED'
          AND "media_optimization_status" = 'DONE'
          AND "media_optimized_at" IS NULL
        `,
        fileId,
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "file_objects"
      SET "media_optimization_status" = 'DONE',
          "media_optimized_at" = COALESCE("media_optimized_at", NOW()),
          "media_optimization_last_error" = NULL
      WHERE "id" = $1::uuid
        AND "status" = 'COMMITTED'
        AND "media_optimization_status" <> 'PROCESSING'
      `,
      fileId,
    );
  }
}
