import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FilesService } from './files.service';

const DEFAULT_BATCH_SIZE = 1;
const DEFAULT_MAX_BATCHES_PER_RUN = 1;

@Injectable()
export class FieldFileExportSchedulerService {
  private readonly logger = new Logger(FieldFileExportSchedulerService.name);
  private readonly batchSize = Math.max(
    Number(process.env.FIELD_FILE_EXPORT_JOB_BATCH_SIZE ?? DEFAULT_BATCH_SIZE),
    1,
  );
  private readonly maxBatchesPerRun = Math.max(
    Number(
      process.env.FIELD_FILE_EXPORT_JOB_MAX_BATCHES_PER_RUN ??
        DEFAULT_MAX_BATCHES_PER_RUN,
    ),
    1,
  );
  private isRunning = false;

  constructor(private readonly filesService: FilesService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processFieldFileExportJobs() {
    if (this.isRunning) return;
    this.isRunning = true;
    const workerId = `field-file-export-${process.pid}`;

    try {
      let claimed = 0;
      let completed = 0;
      let failed = 0;

      for (let index = 0; index < this.maxBatchesPerRun; index += 1) {
        const result = await this.filesService.processFieldFileExportJobsBatch(
          workerId,
          this.batchSize,
        );
        claimed += result.claimed;
        completed += result.completed;
        failed += result.failed;

        if (result.claimed === 0) break;
      }

      if (claimed > 0) {
        this.logger.log(
          `Field file export batch complete: claimed=${claimed}, completed=${completed}, failed=${failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to process field file export jobs',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
