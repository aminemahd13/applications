import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CertificatesService } from './certificates.service';

const DEFAULT_BATCH_SIZE = 6;
const DEFAULT_MAX_BATCHES_PER_RUN = 3;
const DEFAULT_PDF_EXPORT_BATCH_SIZE = 3;
const DEFAULT_PDF_EXPORT_MAX_BATCHES_PER_RUN = 2;

@Injectable()
export class CertificateRenderSchedulerService {
  private readonly logger = new Logger(CertificateRenderSchedulerService.name);
  private readonly batchSize = Math.max(
    Number(process.env.CERTIFICATE_RENDER_BATCH_SIZE ?? DEFAULT_BATCH_SIZE),
    1,
  );
  private readonly maxBatchesPerRun = Math.max(
    Number(
      process.env.CERTIFICATE_RENDER_MAX_BATCHES_PER_RUN ??
        DEFAULT_MAX_BATCHES_PER_RUN,
    ),
    1,
  );
  private readonly pdfExportBatchSize = Math.max(
    Number(
      process.env.CERTIFICATE_PDF_EXPORT_BATCH_SIZE ??
        DEFAULT_PDF_EXPORT_BATCH_SIZE,
    ),
    1,
  );
  private readonly maxPdfExportBatchesPerRun = Math.max(
    Number(
      process.env.CERTIFICATE_PDF_EXPORT_MAX_BATCHES_PER_RUN ??
        DEFAULT_PDF_EXPORT_MAX_BATCHES_PER_RUN,
    ),
    1,
  );
  private isRunning = false;

  constructor(private readonly certificatesService: CertificatesService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processRenderJobs() {
    if (this.isRunning) return;
    this.isRunning = true;
    const workerId = `cert-render-${process.pid}`;

    try {
      let claimed = 0;
      let completed = 0;
      let failed = 0;

      for (let index = 0; index < this.maxBatchesPerRun; index += 1) {
        const result = await this.certificatesService.processRenderJobsBatch(
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
          `Certificate render batch complete: claimed=${claimed}, completed=${completed}, failed=${failed}`,
        );
      }

      let pdfClaimed = 0;
      let pdfCompleted = 0;
      let pdfFailed = 0;
      for (
        let index = 0;
        index < this.maxPdfExportBatchesPerRun;
        index += 1
      ) {
        const result = await this.certificatesService.processCertificatePdfExportJobsBatch(
          workerId,
          this.pdfExportBatchSize,
        );
        pdfClaimed += result.claimed;
        pdfCompleted += result.completed;
        pdfFailed += result.failed;
        if (result.claimed === 0) break;
      }
      if (pdfClaimed > 0) {
        this.logger.log(
          `Certificate PDF export batch complete: claimed=${pdfClaimed}, completed=${pdfCompleted}, failed=${pdfFailed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to process certificate render jobs',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
