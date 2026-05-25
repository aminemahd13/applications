import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  ArchivalJobResponse,
  ArchivalJobStatus,
  CloseEventBody,
  CloseEventResponse,
  MicrositePolicy,
  PurgePolicy,
  UserApplicationHistoryItem,
} from '@event-platform/shared';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class EventArchivalService {
  private readonly logger = new Logger(EventArchivalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async closeEvent(
    eventId: string,
    actorUserId: string,
    body: CloseEventBody,
  ): Promise<CloseEventResponse> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: { microsites: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const destructive =
      body.micrositePolicy === MicrositePolicy.DELETE ||
      body.purgePolicy === PurgePolicy.PURGE_FILES_AND_ANSWERS;

    // Slug match is required for destructive ops as an explicit confirmation.
    // For pure status flips it's still validated if provided, to catch wrong-event mistakes.
    if (destructive && body.confirmSlug !== event.slug) {
      throw new BadRequestException(
        'Confirmation slug does not match event slug',
      );
    }
    if (!destructive && body.confirmSlug && body.confirmSlug !== event.slug) {
      throw new BadRequestException(
        'Confirmation slug does not match event slug',
      );
    }

    if (event.is_system_site && (body.archive || destructive)) {
      throw new ConflictException(
        'Cannot archive, delete, or purge data for a System Site',
      );
    }

    // 1) Status — archive (if requested and not already archived)
    let updatedStatus = event.status;
    if (body.archive && event.status !== 'archived') {
      const updated = await this.prisma.events.update({
        where: { id: eventId },
        data: { status: 'archived' },
      });
      updatedStatus = updated.status;
    }

    // 2) Microsite policy
    let publishedVersion: number | null = event.microsites?.published_version ?? null;
    if (event.microsites) {
      if (body.micrositePolicy === MicrositePolicy.UNPUBLISH) {
        const updated = await this.prisma.microsites.update({
          where: { event_id: eventId },
          data: { published_version: 0 },
        });
        publishedVersion = updated.published_version;
      } else if (body.micrositePolicy === MicrositePolicy.DELETE) {
        // Cascade delete pages + versions via FK onDelete: Cascade
        await this.prisma.microsites.delete({
          where: { event_id: eventId },
        });
        publishedVersion = null;
      }
      // KEEP_PUBLIC: no-op
    }

    // 3) Purge policy — enqueue background job (synchronous create, async run)
    let job: ArchivalJobResponse | null = null;
    if (body.purgePolicy === PurgePolicy.PURGE_FILES_AND_ANSWERS) {
      const created = await this.prisma.event_archival_jobs.create({
        data: {
          event_id: eventId,
          requested_by_user_id: actorUserId,
          status: ArchivalJobStatus.PENDING,
          microsite_policy: body.micrositePolicy,
          purge_policy: body.purgePolicy,
        },
      });
      job = this.toJobResponse(created);
    }

    return {
      event: { id: eventId, status: updatedStatus },
      microsite: { policyApplied: body.micrositePolicy, publishedVersion },
      job,
    };
  }

  async getCloseImpact(eventId: string): Promise<{
    applications: number;
    files: number;
    fileBytes: number;
    submissionVersions: number;
    drafts: number;
    issuedCertificates: number;
  }> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const [applications, files, fileBytesAgg, submissionVersions, drafts, issuedCertificates] =
      await Promise.all([
        this.prisma.applications.count({ where: { event_id: eventId } }),
        this.prisma.file_objects.count({ where: { event_id: eventId } }),
        this.prisma.file_objects.aggregate({
          where: { event_id: eventId },
          _sum: { size_bytes: true },
        }),
        this.prisma.step_submission_versions.count({
          where: { applications: { event_id: eventId } },
        }),
        this.prisma.step_drafts.count({
          where: { applications: { event_id: eventId } },
        }),
        this.prisma.issued_certificates.count({ where: { event_id: eventId } }),
      ]);

    return {
      applications,
      files,
      fileBytes: Number(fileBytesAgg._sum.size_bytes ?? 0n),
      submissionVersions,
      drafts,
      issuedCertificates,
    };
  }

  async getLatestJob(eventId: string): Promise<ArchivalJobResponse | null> {
    const job = await this.prisma.event_archival_jobs.findFirst({
      where: { event_id: eventId },
      orderBy: { requested_at: 'desc' },
    });
    return job ? this.toJobResponse(job) : null;
  }

  async getUserApplicationsHistory(
    userId: string,
  ): Promise<UserApplicationHistoryItem[]> {
    const applications = await this.prisma.applications.findMany({
      where: { applicant_user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        events: {
          select: { id: true, title: true, slug: true, end_at: true, status: true },
        },
        issued_certificates: {
          orderBy: { issued_at: 'desc' },
          take: 1,
          select: {
            credential_id: true,
            status: true,
            released_at: true,
          },
        },
        step_submission_versions: {
          orderBy: { submitted_at: 'desc' },
          take: 1,
          select: { submitted_at: true, answers_snapshot: true },
        },
      },
    });

    // Determine "dataPurged" per event: completed archival job with PURGE_FILES_AND_ANSWERS
    const eventIds = applications.map((a) => a.event_id);
    const purgedJobs = eventIds.length
      ? await this.prisma.event_archival_jobs.findMany({
          where: {
            event_id: { in: eventIds },
            status: ArchivalJobStatus.COMPLETED,
            purge_policy: PurgePolicy.PURGE_FILES_AND_ANSWERS,
          },
          select: { event_id: true },
        })
      : [];
    const purgedEventIds = new Set(purgedJobs.map((j) => j.event_id));

    return applications.map((app) => {
      const latestSubmission = app.step_submission_versions[0];
      const cert = app.issued_certificates[0];
      return {
        applicationId: app.id,
        event: {
          id: app.events.id,
          title: app.events.title,
          slug: app.events.slug,
          endAt: app.events.end_at ? app.events.end_at.toISOString() : null,
          status: app.events.status,
        },
        submittedAt: latestSubmission?.submitted_at
          ? latestSubmission.submitted_at.toISOString()
          : null,
        decisionStatus: app.decision_status,
        decisionPublishedAt: app.decision_published_at
          ? app.decision_published_at.toISOString()
          : null,
        certificate: cert
          ? {
              credentialId: cert.credential_id,
              status: cert.status,
              releasedAt: cert.released_at
                ? cert.released_at.toISOString()
                : null,
            }
          : null,
        dataPurged: purgedEventIds.has(app.event_id),
      };
    });
  }

  private toJobResponse(job: {
    id: string;
    event_id: string;
    status: string;
    microsite_policy: string;
    purge_policy: string;
    requested_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
    files_total: number;
    files_deleted: number;
    submissions_total: number;
    submissions_purged: number;
    error_message: string | null;
  }): ArchivalJobResponse {
    return {
      id: job.id,
      eventId: job.event_id,
      status: job.status as ArchivalJobStatus,
      micrositePolicy: job.microsite_policy as MicrositePolicy,
      purgePolicy: job.purge_policy as PurgePolicy,
      requestedAt: job.requested_at.toISOString(),
      startedAt: job.started_at ? job.started_at.toISOString() : null,
      completedAt: job.completed_at ? job.completed_at.toISOString() : null,
      filesTotal: job.files_total,
      filesDeleted: job.files_deleted,
      submissionsTotal: job.submissions_total,
      submissionsPurged: job.submissions_purged,
      errorMessage: job.error_message,
    };
  }
}
