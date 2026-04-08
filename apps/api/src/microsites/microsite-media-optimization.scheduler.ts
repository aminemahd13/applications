import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { MicrositeMediaOptimizerService } from './microsite-media-optimizer.service';

type ClaimedAssetRow = {
  id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: string;
  media_optimization_attempts: number;
};

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_BATCHES_PER_RUN = 4;

@Injectable()
export class MicrositeMediaOptimizationSchedulerService {
  private readonly logger = new Logger(
    MicrositeMediaOptimizationSchedulerService.name,
  );
  private readonly batchSize = Math.max(
    Number(process.env.MICROSITE_MEDIA_OPTIMIZATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE),
    1,
  );
  private readonly maxAttempts = Math.max(
    Number(process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS),
    1,
  );
  private readonly maxBatchesPerRun = Math.max(
    Number(
      process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_BATCHES_PER_RUN ??
        DEFAULT_MAX_BATCHES_PER_RUN,
    ),
    1,
  );
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly optimizer: MicrositeMediaOptimizerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async optimizePendingMicrositeImages() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      let processedCount = 0;
      for (let batchIndex = 0; batchIndex < this.maxBatchesPerRun; batchIndex += 1) {
        const claimed = await this.claimPendingBatch();
        if (claimed.length === 0) break;

        await Promise.all(
          claimed.map(async (row) => {
            await this.processClaimedAsset(row);
          }),
        );
        processedCount += claimed.length;
      }

      if (processedCount > 0) {
        this.logger.log(`Processed ${processedCount} microsite media optimization jobs.`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to process microsite media optimization jobs',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async claimPendingBatch(): Promise<ClaimedAssetRow[]> {
    return this.prisma.$queryRawUnsafe<ClaimedAssetRow[]>(
      `
      WITH candidates AS (
        SELECT id
        FROM "file_objects"
        WHERE "status" = 'COMMITTED'
          AND "storage_key" LIKE 'events/%/microsite/%'
          AND "mime_type" LIKE 'image/%'
          AND "media_optimization_status" = 'PENDING'
          AND "media_optimization_attempts" < $1
        ORDER BY "created_at" ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "file_objects" AS fo
      SET "media_optimization_status" = 'PROCESSING',
          "media_optimization_attempts" = fo."media_optimization_attempts" + 1,
          "media_optimization_last_error" = NULL
      FROM candidates
      WHERE fo.id = candidates.id
      RETURNING
        fo.id,
        fo.storage_key,
        fo.mime_type,
        fo.size_bytes::text AS size_bytes,
        fo.media_optimization_attempts
      `,
      this.maxAttempts,
      this.batchSize,
    );
  }

  private async processClaimedAsset(row: ClaimedAssetRow): Promise<void> {
    try {
      const originalBuffer = await this.storageService.getObjectBuffer(row.storage_key);
      const optimizationResult = await this.optimizer.optimizeBuffer(
        originalBuffer,
        row.mime_type,
      );
      const outputBuffer = optimizationResult.buffer;

      if (optimizationResult.changed) {
        await this.storageService.putObjectBuffer(
          row.storage_key,
          outputBuffer,
          optimizationResult.mimeType,
        );
      }

      const sha256 = createHash('sha256').update(outputBuffer).digest('hex');
      await this.prisma.$executeRawUnsafe(
        `
        UPDATE "file_objects"
        SET "size_bytes" = $2::bigint,
            "mime_type" = $3,
            "sha256" = $4,
            "media_optimization_status" = 'DONE',
            "media_optimized_at" = NOW(),
            "media_optimization_last_error" = NULL
        WHERE "id" = $1
        `,
        row.id,
        outputBuffer.byteLength,
        optimizationResult.mimeType || row.mime_type,
        sha256,
      );
    } catch (error) {
      const attempt = Number(row.media_optimization_attempts ?? 0);
      const shouldFail = attempt >= this.maxAttempts;
      const status = shouldFail ? 'FAILED' : 'PENDING';
      const message = this.truncateErrorMessage(error);

      await this.prisma.$executeRawUnsafe(
        `
        UPDATE "file_objects"
        SET "media_optimization_status" = $2,
            "media_optimization_last_error" = $3
        WHERE "id" = $1
        `,
        row.id,
        status,
        message,
      );

      if (shouldFail) {
        this.logger.warn(
          `Microsite media optimization permanently failed for ${row.storage_key}: ${message}`,
        );
      }
    }
  }

  private truncateErrorMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    return message.slice(0, 500);
  }
}
