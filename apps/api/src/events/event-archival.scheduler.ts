import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { ArchivalJobStatus, PurgePolicy } from '@event-platform/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';

const PROGRESS_FLUSH_EVERY = 25;

@Injectable()
export class EventArchivalScheduler {
  private readonly logger = new Logger(EventArchivalScheduler.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cls: ClsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const job = await this.prisma.event_archival_jobs.findFirst({
        where: { status: ArchivalJobStatus.PENDING },
        orderBy: { requested_at: 'asc' },
      });
      if (!job) return;

      // Set the audit-log actor to whoever requested this archival job so
      // the file/submission purge writes are attributable in audit_logs
      // instead of showing actor_user_id=null for background work.
      await this.cls.run(async () => {
        this.cls.set('actorId', job.requested_by_user_id);
        await this.processJob(job.id, job.event_id);
      });
    } catch (error) {
      this.logger.error(
        'Archival sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async processJob(jobId: string, eventId: string) {
    this.logger.log(`Starting archival job ${jobId} for event ${eventId}`);

    // Mark RUNNING + count totals up front so the UI has denominators.
    const [filesTotal, submissionsTotal] = await Promise.all([
      this.prisma.file_objects.count({ where: { event_id: eventId } }),
      this.prisma.step_submission_versions.count({
        where: { applications: { event_id: eventId } },
      }),
    ]);
    await this.prisma.event_archival_jobs.update({
      where: { id: jobId },
      data: {
        status: ArchivalJobStatus.RUNNING,
        started_at: new Date(),
        files_total: filesTotal,
        submissions_total: submissionsTotal,
      },
    });

    try {
      let filesDeleted = 0;
      let sinceLastFlush = 0;

      // Process files in chunks. Cursor over the id space so a row that
      // refuses to delete (e.g. FK violation) doesn't loop forever — we'd
      // skip past it. Storage failures are tolerated: the DB row is removed
      // either way, leaving orphan storage at worst.
      let cursorId: string | undefined = undefined;
      for (;;) {
        const batch: { id: string; storage_key: string | null }[] =
          await this.prisma.file_objects.findMany({
            where: {
              event_id: eventId,
              ...(cursorId ? { id: { gt: cursorId } } : {}),
            },
            select: { id: true, storage_key: true },
            orderBy: { id: 'asc' },
            take: 100,
          });
        if (batch.length === 0) break;
        cursorId = batch[batch.length - 1].id;

        for (const file of batch) {
          if (file.storage_key) {
            try {
              await this.storage.deleteObject(file.storage_key);
            } catch (err) {
              this.logger.warn(
                `Storage delete failed for ${file.storage_key}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
          try {
            await this.prisma.file_objects.delete({ where: { id: file.id } });
            filesDeleted += 1;
            sinceLastFlush += 1;
          } catch (err) {
            this.logger.warn(
              `DB delete failed for file_object ${file.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          if (sinceLastFlush >= PROGRESS_FLUSH_EVERY) {
            await this.prisma.event_archival_jobs.update({
              where: { id: jobId },
              data: { files_deleted: filesDeleted },
            });
            sinceLastFlush = 0;
          }
        }
      }

      // Final files flush.
      await this.prisma.event_archival_jobs.update({
        where: { id: jobId },
        data: { files_deleted: filesDeleted },
      });

      // Null out raw answer payloads. We keep the submission rows for audit
      // (who submitted what step when) but drop the actual answers JSON.
      const submissionsResult = await this.prisma.step_submission_versions.updateMany({
        where: { applications: { event_id: eventId } },
        data: { answers_snapshot: {} },
      });
      const draftsResult = await this.prisma.step_drafts.updateMany({
        where: { applications: { event_id: eventId } },
        data: { answers_draft: {} },
      });

      await this.prisma.event_archival_jobs.update({
        where: { id: jobId },
        data: {
          submissions_purged: submissionsResult.count + draftsResult.count,
          status: ArchivalJobStatus.COMPLETED,
          completed_at: new Date(),
        },
      });

      this.logger.log(
        `Archival job ${jobId} done: files=${filesDeleted}/${filesTotal}, submissions=${submissionsResult.count}, drafts=${draftsResult.count}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Archival job ${jobId} failed: ${message}`);
      await this.prisma.event_archival_jobs.update({
        where: { id: jobId },
        data: {
          status: ArchivalJobStatus.FAILED,
          completed_at: new Date(),
          error_message: message.slice(0, 1000),
        },
      });
    }
  }

  // Exposed for tests / manual invocation (not gated by cron); keep static-ish.
  static readonly PURGE_POLICY = PurgePolicy;
}
