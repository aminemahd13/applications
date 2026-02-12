import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { ClsService } from 'nestjs-cls';
import { FileSensitivity } from '@event-platform/shared';

type MediaKind = 'all' | 'image' | 'video';
const MICROSITE_STORAGE_PREFIX = /^events\/[^/]+\/microsite\/.+/;

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
    const safeName = (data.originalFilename || 'upload')
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
        original_filename: data.originalFilename,
        mime_type: data.mimeType,
        size_bytes: BigInt(data.sizeBytes),
        sensitivity: FileSensitivity.NORMAL,
        status: 'STAGED',
        expires_at: expiresAt,
        created_by: userId,
      },
    });

    const uploadUrl = await this.storageService.getPresignedPutUrl(
      storageKey,
      data.mimeType,
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

    if (file.status === 'COMMITTED') return file;

    let head;
    try {
      head = await this.storageService.getHeadObject(file.storage_key);
    } catch {
      throw new BadRequestException('File not found in storage');
    }

    if (!head) throw new BadRequestException('File not found in storage');

    const actualSize = head.ContentLength || 0;
    const actualMime = head.ContentType || 'application/octet-stream';

    const MAX_SIZE = 150 * 1024 * 1024;
    if (actualSize > MAX_SIZE) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException('File too large (Max 150MB).');
    }

    if (actualMime !== file.mime_type) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException(
        `File type mismatch. Expected ${file.mime_type}, got ${actualMime}`,
      );
    }

    const blockedTypes = [
      'application/x-msdownload',
      'application/x-sh',
      'application/x-php',
      'application/x-dosexec',
    ];
    if (blockedTypes.includes(actualMime)) {
      await this.cleanupFailedUpload(file.storage_key, fileId);
      throw new BadRequestException('File type not allowed.');
    }

    const sha256 = await this.storageService.computeSha256(file.storage_key);

    return this.prisma.file_objects.update({
      where: { id: fileId },
      data: {
        status: 'COMMITTED',
        size_bytes: BigInt(actualSize),
        expires_at: null,
        sha256,
      },
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

    return this.storageService.getPresignedGetUrl(storageKey, 3600);
  }

  private async cleanupFailedUpload(key: string, fileId: string) {
    try {
      await this.storageService.deleteObject(key);
    } catch {
      // ignore
    }
    await this.prisma.file_objects.delete({ where: { id: fileId } });
  }
}
