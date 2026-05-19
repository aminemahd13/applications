import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@event-platform/db';
import {
  CHECKIN_EXPORT_COLUMNS,
  type CheckinAttendeeStatus,
  type CheckinAttendeesQueryDto,
  type CheckinCsvExportRequestDto,
  type CheckinExportColumn,
  type CsvPortal,
} from '@event-platform/shared';
import * as jwt from 'jsonwebtoken';
import { ApplicationsService } from '../applications/applications.service';
import {
  buildApplicationPortalLinks,
  buildCsvContent,
  resolveAppBaseUrl,
} from '../common/utils/export-csv.util';

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  private readBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (typeof value === 'number') return value !== 0;
    return fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private shouldAutoIssueCompletionCredential(
    checkinConfig: Record<string, unknown>,
  ): boolean {
    // Certificate issuance is now fully manual from the dedicated
    // certificate management flow.
    return false;
  }

  private async getCheckinConfig(
    eventId: string,
  ): Promise<Record<string, unknown>> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { checkin_config: true },
    });
    return (event?.checkin_config as Record<string, unknown>) ?? {};
  }

  private async assertCheckinEnabled(
    eventId: string,
  ): Promise<Record<string, unknown>> {
    const config = await this.getCheckinConfig(eventId);
    const enabled = this.readBoolean(config.enabled, false);
    if (!enabled) {
      throw new ForbiddenException('Check-in is disabled for this event');
    }
    return config;
  }

  /* ================================================================ */
  /*  Stats                                                            */
  /* ================================================================ */

  async getStats(eventId: string) {
    const config = await this.getCheckinConfig(eventId);
    const enabled = this.readBoolean(config.enabled, false);
    if (!enabled) {
      return {
        enabled,
        data: {
          total: 0,
          checkedIn: 0,
          remaining: 0,
        },
      };
    }

    const [total, checkedIn] = await Promise.all([
      this.prisma.attendance_records.count({
        where: {
          applications: { event_id: eventId },
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        },
      }),
      this.prisma.attendance_records.count({
        where: {
          applications: { event_id: eventId },
          status: 'CHECKED_IN',
        },
      }),
    ]);

    return {
      enabled,
      data: {
        total,
        checkedIn,
        remaining: total - checkedIn,
      },
    };
  }

  /* ================================================================ */
  /*  Recent check-ins                                                 */
  /* ================================================================ */

  async getRecent(eventId: string) {
    const config = await this.getCheckinConfig(eventId);
    const enabled = this.readBoolean(config.enabled, false);
    if (!enabled) {
      return { enabled, data: [] };
    }

    const records = await this.prisma.checkin_records.findMany({
      where: { event_id: eventId, result: 'SUCCESS' },
      orderBy: { scanned_at: 'desc' },
      take: 50,
      include: {
        applications: {
          include: {
            users_applications_applicant_user_idTousers: {
              select: {
                email: true,
                applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
              },
            },
          },
        },
        users: { select: { email: true } },
      },
    });

    return {
      enabled,
      data: records.map((r) => ({
        id: r.id,
        applicantName:
          ApplicationsService.getDisplayName(r.applications?.users_applications_applicant_user_idTousers?.applicant_profiles) || 'Unknown',
        applicantEmail:
          r.applications?.users_applications_applicant_user_idTousers?.email ??
          '',
        checkedInAt: r.scanned_at.toISOString(),
        checkedInBy: r.users?.email ?? 'Unknown',
      })),
    };
  }

  /* ================================================================ */
  /*  Attendees list + export                                          */
  /* ================================================================ */

  async listAttendees(eventId: string, query: CheckinAttendeesQueryDto) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true, title: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 500);
    const skip = (page - 1) * pageSize;
    const appBaseUrl = this.getAppBaseUrl();
    const portal: CsvPortal = 'staff';

    const filters = {
      status: query.status ?? 'all',
      tags: query.tags,
      search: query.search,
    };
    const listWhere = this.buildCheckinAttendeesWhere(eventId, filters);
    const tagsWhere = this.buildCheckinAttendeesWhere(eventId, {
      status: 'all',
      search: query.search,
    });

    const [applications, total, checkedIn, notCheckedIn, tagRows] =
      await Promise.all([
        this.prisma.applications.findMany({
          where: listWhere,
          orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
          skip,
          take: pageSize,
          select: this.buildCheckinAttendeeSelect(),
        }),
        this.prisma.applications.count({ where: listWhere }),
        this.prisma.applications.count({
          where: this.buildCheckinAttendeesWhere(eventId, {
            ...filters,
            status: 'checked_in',
          }),
        }),
        this.prisma.applications.count({
          where: this.buildCheckinAttendeesWhere(eventId, {
            ...filters,
            status: 'not_checked_in',
          }),
        }),
        this.prisma.applications.findMany({
          where: tagsWhere,
          select: { tags: true },
        }),
      ]);

    const availableTags = Array.from(
      new Set(
        tagRows.flatMap((row) =>
          (row.tags ?? [])
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        ),
      ),
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return {
      data: applications.map((application) =>
        this.toCheckinExportRowValues({
          application,
          event,
          portal,
          appBaseUrl,
        }),
      ),
      meta: {
        page,
        pageSize,
        total,
        checkedIn,
        notCheckedIn,
        availableTags,
      },
    };
  }

  async exportAttendeesCsv(
    eventId: string,
    body: CheckinCsvExportRequestDto,
  ): Promise<{ filename: string; csv: string }> {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true, title: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const portal: CsvPortal = body.portal === 'admin' ? 'admin' : 'staff';
    const selectedColumns = this.resolveRequestedColumns(
      CHECKIN_EXPORT_COLUMNS,
      body.columns,
    );
    const where = this.buildCheckinAttendeesWhere(eventId, {
      status: body.status ?? 'all',
      tags: body.tags,
      search: body.search,
    });
    const appBaseUrl = this.getAppBaseUrl();

    const applications = await this.prisma.applications.findMany({
      where,
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      select: this.buildCheckinAttendeeSelect(),
    });

    const rows = applications.map((application) => {
      const rowValues = this.toCheckinExportRowValues({
        application,
        event,
        portal,
        appBaseUrl,
      });
      return selectedColumns.map((column) => rowValues[column] ?? '');
    });

    return {
      filename: `checkin-attendees-${this.toFilenameSafePart(event.slug || event.id)}.csv`,
      csv: buildCsvContent([...selectedColumns], rows),
    };
  }

  private buildCheckinAttendeeSelect(): Prisma.applicationsSelect {
    return {
      id: true,
      event_id: true,
      applicant_user_id: true,
      decision_status: true,
      tags: true,
      created_at: true,
      updated_at: true,
      attendance_records: {
        select: {
          status: true,
          checked_in_at: true,
          checked_in_by: true,
          users: { select: { email: true } },
        },
      },
      users_applications_applicant_user_idTousers: {
        select: {
          email: true,
          applicant_profiles: {
            select: { first_name: true, last_name: true, full_name: true },
          },
        },
      },
    };
  }

  private buildCheckinAttendeesWhere(
    eventId: string,
    filters: {
      status?: CheckinAttendeeStatus;
      tags?: string[];
      search?: string;
    },
  ): Prisma.applicationsWhereInput {
    const andConditions: Prisma.applicationsWhereInput[] = [
      { event_id: eventId },
      {
        attendance_records: {
          is: {
            status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          },
        },
      },
    ];

    if (filters.status === 'checked_in') {
      andConditions.push({
        attendance_records: { is: { status: 'CHECKED_IN' } },
      });
    } else if (filters.status === 'not_checked_in') {
      andConditions.push({
        attendance_records: { is: { status: 'CONFIRMED' } },
      });
    }

    const tags = (filters.tags ?? [])
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tags.length > 0) {
      andConditions.push({ tags: { hasEvery: tags } });
    }

    const search = filters.search?.trim();
    if (search) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          search,
        );
      const orConditions: Prisma.applicationsWhereInput[] = [
        {
          users_applications_applicant_user_idTousers: {
            email: { contains: search, mode: 'insensitive' },
          },
        },
        {
          users_applications_applicant_user_idTousers: {
            applicant_profiles: {
              full_name: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          users_applications_applicant_user_idTousers: {
            applicant_profiles: {
              first_name: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          users_applications_applicant_user_idTousers: {
            applicant_profiles: {
              last_name: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          users_applications_applicant_user_idTousers: {
            applicant_profiles: {
              phone: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
      if (isUuid) {
        orConditions.push({ id: search }, { applicant_user_id: search });
      }
      andConditions.push({ OR: orConditions });
    }

    return andConditions.length === 1
      ? andConditions[0]
      : { AND: andConditions };
  }

  private toCheckinExportRowValues(input: {
    application: any;
    event: { id: string; slug: string; title: string };
    portal: CsvPortal;
    appBaseUrl: string;
  }): Record<CheckinExportColumn, unknown> {
    const { application, event, portal, appBaseUrl } = input;
    const applicant = application.users_applications_applicant_user_idTousers;
    const attendance = application.attendance_records;
    const links = buildApplicationPortalLinks({
      eventId: event.id,
      applicationId: application.id,
      portal,
      baseUrl: appBaseUrl,
    });
    const applicantName =
      ApplicationsService.getDisplayName(applicant?.applicant_profiles) ||
      'Unknown attendee';
    const attendanceStatus = attendance?.status ?? 'NONE';
    const isCheckedIn = attendanceStatus === 'CHECKED_IN';

    return {
      applicationId: application.id,
      eventId: event.id,
      eventSlug: event.slug,
      eventTitle: event.title,
      applicantUserId: application.applicant_user_id,
      applicantName,
      applicantEmail: applicant?.email ?? '',
      decisionStatus: application.decision_status,
      attendanceStatus,
      isCheckedIn,
      checkedInAt: this.toIsoString(attendance?.checked_in_at),
      checkedInByUserId: attendance?.checked_in_by ?? '',
      checkedInByEmail: attendance?.users?.email ?? '',
      tags: (application.tags ?? []).join(' | '),
      applicationPath: links.applicationPath,
      applicationUrl: links.applicationUrl,
      staffApplicationPath: links.staffApplicationPath,
      adminApplicationPath: links.adminApplicationPath,
      staffApplicationUrl: links.staffApplicationUrl,
      adminApplicationUrl: links.adminApplicationUrl,
      applicationCreatedAt: this.toIsoString(application.created_at),
      applicationUpdatedAt: this.toIsoString(application.updated_at),
    };
  }

  private resolveRequestedColumns<TColumn extends string>(
    availableColumns: readonly TColumn[],
    requestedColumns?: readonly TColumn[],
  ): TColumn[] {
    if (!requestedColumns || requestedColumns.length === 0) {
      return [...availableColumns];
    }
    const allowedSet = new Set<string>(availableColumns);
    const selected: TColumn[] = [];
    for (const column of requestedColumns) {
      if (allowedSet.has(column) && !selected.includes(column)) {
        selected.push(column);
      }
    }
    return selected.length > 0 ? selected : [...availableColumns];
  }

  private toIsoString(value: unknown): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return '';
  }

  private getAppBaseUrl(): string {
    return resolveAppBaseUrl(process.env);
  }

  private toFilenameSafePart(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-');
    const compact = normalized.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return compact || 'event';
  }

  /* ================================================================ */
  /*  Manual lookup                                                    */
  /* ================================================================ */

  async lookupAttendees(eventId: string, query: string) {
    await this.assertCheckinEnabled(eventId);
    const trimmed = query.trim();
    if (!trimmed) return [];

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      );

    const orConditions: Prisma.applicationsWhereInput[] = [
      {
        users_applications_applicant_user_idTousers: {
          email: { contains: trimmed, mode: 'insensitive' },
        },
      },
      {
        users_applications_applicant_user_idTousers: {
          applicant_profiles: {
            full_name: { contains: trimmed, mode: 'insensitive' },
          },
        },
      },
      {
        users_applications_applicant_user_idTousers: {
          applicant_profiles: {
            phone: { contains: trimmed, mode: 'insensitive' },
          },
        },
      },
    ];

    if (isUuid) {
      orConditions.push({ id: trimmed }, { applicant_user_id: trimmed });
    }

    const records = await this.prisma.applications.findMany({
      where: {
        event_id: eventId,
        OR: orConditions,
      },
      orderBy: { updated_at: 'desc' },
      take: 20,
      include: {
        attendance_records: {
          include: { users: { select: { email: true } } },
        },
        users_applications_applicant_user_idTousers: {
          select: {
            email: true,
            applicant_profiles: { select: { first_name: true, last_name: true, full_name: true } },
          },
        },
      },
    });

    return records.map((app) => ({
      applicationId: app.id,
      applicantName:
        ApplicationsService.getDisplayName(app.users_applications_applicant_user_idTousers.applicant_profiles) || 'Unknown',
      applicantEmail:
        app.users_applications_applicant_user_idTousers.email ?? '',
      status: app.attendance_records?.status ?? 'NONE',
      checkedInAt: app.attendance_records?.checked_in_at?.toISOString(),
      checkedInBy: app.attendance_records?.users?.email ?? undefined,
    }));
  }

  /* ================================================================ */
  /*  Undo check-in                                                    */
  /* ================================================================ */

  async undoCheckin(eventId: string, checkinRecordId: string) {
    await this.assertCheckinEnabled(eventId);
    const record = await this.prisma.checkin_records.findFirst({
      where: { id: checkinRecordId, event_id: eventId, result: 'SUCCESS' },
    });
    if (!record) throw new NotFoundException('Check-in record not found');

    if (record.application_id) {
      await this.prisma.attendance_records.update({
        where: { application_id: record.application_id },
        data: {
          status: 'CONFIRMED',
          checked_in_at: null,
          checked_in_by: null,
        },
      });
      try {
        await this.applicationsService.revokeCompletionCredential(
          eventId,
          record.application_id,
        );
      } catch {
        // Best-effort: check-in rollback should not fail if credential revocation fails.
      }
    }

    // Mark the checkin record as undone
    await this.prisma.checkin_records.update({
      where: { id: checkinRecordId },
      data: { result: 'UNDONE' },
    });
  }

  /* ================================================================ */
  /*  Scan ticket                                                      */
  /* ================================================================ */

  async scanTicket(eventId: string, token: string): Promise<any> {
    const config = await this.assertCheckinEnabled(eventId);
    const autoIssueCompletionCredential =
      this.shouldAutoIssueCompletionCredential(config);
    const staffUserId = this.cls.get('actorId');
    const secret = process.env.JWT_SECRET;
    if (!secret)
      throw new Error('JWT_SECRET environment variable must be configured');

    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch (e) {
      throw new BadRequestException('Invalid or expired ticket token');
    }

    // Payload: { sub: appId, eventId, jti, type: 'checkin' }
    if (payload.eventId !== eventId) {
      throw new BadRequestException('Ticket is for a different event');
    }

    if (payload.type !== 'checkin') {
      throw new BadRequestException('Invalid token type');
    }

    const applicationId = payload.sub;
    const jti = payload.jti;

    const app = await this.prisma.applications.findUnique({
      where: { id: applicationId },
      include: {
        attendance_records: true,
        users_applications_applicant_user_idTousers: {
          include: { applicant_profiles: true },
        },
      },
    });

    if (!app) throw new NotFoundException('Application not found');
    if (app.event_id !== eventId) {
      throw new NotFoundException('Application not found');
    }

    // Verify JTI matches stored hash (security check against old/revoked tokens)
    if (app.attendance_records?.qr_token_hash !== jti) {
      throw new BadRequestException('Ticket has been revoked or is invalid');
    }

    // Check if already checked in
    // Logic: if status CONFIRMED -> allow checkin.
    // If status CHECKED_IN -> warn/deny?
    // Requirement says "Prevent double check-in (unless override)".
    // We'll return status specifically.

    // Atomically transition CONFIRMED -> CHECKED_IN, then write the audit log
    // with the resolved outcome. Doing the read + transition + log in one
    // transaction + relying on updateMany's predicate to serialize concurrent
    // scans means two near-simultaneous scans cannot both record SUCCESS.
    const { checkinStatus, failReason, checkinRecord, successCheckedInAt } =
      await this.prisma.$transaction(async (tx) => {
        const transitionTime = new Date();
        const transition = await tx.attendance_records.updateMany({
          where: { application_id: applicationId, status: 'CONFIRMED' },
          data: {
            status: 'CHECKED_IN',
            checked_in_at: transitionTime,
            checked_in_by: staffUserId,
          },
        });

        let resolvedStatus: string;
        let resolvedFailReason: string | undefined;
        let resolvedCheckedInAt: Date | null = null;

        if (transition.count === 1) {
          resolvedStatus = 'SUCCESS';
          resolvedCheckedInAt = transitionTime;
        } else {
          // Couldn't transition — the row's current status isn't CONFIRMED.
          // Re-read inside the transaction to report accurately.
          const current = await tx.attendance_records.findUnique({
            where: { application_id: applicationId },
            select: { status: true },
          });
          if (current?.status === 'CHECKED_IN') {
            resolvedStatus = 'ALREADY_CHECKED_IN';
            resolvedFailReason = 'Already checked in';
          } else {
            resolvedStatus = 'INVALID_STATUS';
            resolvedFailReason = `Status is ${current?.status}`;
          }
        }

        const record = await tx.checkin_records.create({
          data: {
            id: crypto.randomUUID(),
            event_id: eventId,
            application_id: applicationId,
            staff_user_id: staffUserId,
            result: resolvedStatus,
            fail_reason: resolvedFailReason,
            raw_token_fingerprint: jti, // Store JTI as fingerprint
          },
        });

        return {
          checkinStatus: resolvedStatus,
          failReason: resolvedFailReason,
          checkinRecord: record,
          successCheckedInAt: resolvedCheckedInAt,
        };
      });

    if (checkinStatus === 'SUCCESS') {
      if (autoIssueCompletionCredential && successCheckedInAt) {
        try {
          await this.applicationsService.issueCompletionCredential(
            eventId,
            applicationId,
            { checkedInAt: successCheckedInAt },
          );
        } catch {
          // Best-effort: keep check-in successful even if credential issuance fails.
        }
      }
    } else if (checkinStatus === 'ALREADY_CHECKED_IN') {
      if (autoIssueCompletionCredential) {
        try {
          await this.applicationsService.issueCompletionCredential(
            eventId,
            applicationId,
          );
        } catch {
          // Best-effort: keep check-in response stable on issuance failures.
        }
      }
    }

    const applicantName =
      ApplicationsService.getDisplayName(app.users_applications_applicant_user_idTousers.applicant_profiles) || 'Unknown';
    const applicantEmail =
      app.users_applications_applicant_user_idTousers.email;

    const message =
      checkinStatus === 'SUCCESS'
        ? 'Checked in successfully'
        : checkinStatus === 'ALREADY_CHECKED_IN'
          ? 'Already checked in'
          : failReason || 'Ticket is not eligible for check-in';

    return {
      id: checkinRecord.id,
      status: checkinStatus,
      message,
      applicantName,
      applicantEmail,
      applicant: {
        name: applicantName,
        email: applicantEmail,
        id: app.applicant_user_id,
      },
      timestamp: new Date(),
    };
  }

  /* ================================================================ */
  /*  Manual check-in                                                  */
  /* ================================================================ */

  async manualCheckin(eventId: string, applicationId: string): Promise<any> {
    const config = await this.assertCheckinEnabled(eventId);
    const qrCodeRequired = this.readBoolean(config.qrCodeRequired, true);
    const autoIssueCompletionCredential =
      this.shouldAutoIssueCompletionCredential(config);
    if (qrCodeRequired) {
      throw new BadRequestException(
        'Manual check-in is disabled for this event',
      );
    }
    const staffUserId = this.cls.get('actorId');

    const app = await this.prisma.applications.findUnique({
      where: { id: applicationId },
      include: {
        attendance_records: true,
        users_applications_applicant_user_idTousers: {
          include: { applicant_profiles: true },
        },
      },
    });

    if (!app || app.event_id !== eventId) {
      throw new NotFoundException('Application not found');
    }

    let checkinStatus = 'SUCCESS';
    let failReason: string | undefined;
    let checkedInAt = app.attendance_records?.checked_in_at ?? null;

    if (!app.attendance_records) {
      checkinStatus = 'INVALID_STATUS';
      failReason = 'Attendance record not found';
    } else if (app.attendance_records.status === 'CHECKED_IN') {
      checkinStatus = 'ALREADY_CHECKED_IN';
      failReason = 'Already checked in';
    } else if (app.attendance_records.status !== 'CONFIRMED') {
      checkinStatus = 'INVALID_STATUS';
      failReason = `Status is ${app.attendance_records.status}`;
    }

    const checkinRecord = await this.prisma.checkin_records.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        application_id: applicationId,
        staff_user_id: staffUserId,
        result: checkinStatus,
        fail_reason: failReason,
      },
    });

    if (checkinStatus === 'SUCCESS') {
      checkedInAt = new Date();
      await this.prisma.attendance_records.update({
        where: { application_id: applicationId },
        data: {
          status: 'CHECKED_IN',
          checked_in_at: checkedInAt,
          checked_in_by: staffUserId,
        },
      });
      if (autoIssueCompletionCredential) {
        try {
          await this.applicationsService.issueCompletionCredential(
            eventId,
            applicationId,
            { checkedInAt },
          );
        } catch {
          // Best-effort: keep check-in successful even if credential issuance fails.
        }
      }
    } else if (checkinStatus === 'ALREADY_CHECKED_IN') {
      if (autoIssueCompletionCredential) {
        try {
          await this.applicationsService.issueCompletionCredential(
            eventId,
            applicationId,
          );
        } catch {
          // Best-effort: keep check-in response stable on issuance failures.
        }
      }
    }

    const applicantName =
      ApplicationsService.getDisplayName(app.users_applications_applicant_user_idTousers.applicant_profiles) || 'Unknown';
    const applicantEmail =
      app.users_applications_applicant_user_idTousers.email;

    const message =
      checkinStatus === 'SUCCESS'
        ? 'Checked in successfully'
        : checkinStatus === 'ALREADY_CHECKED_IN'
          ? 'Already checked in'
          : failReason || 'Ticket is not eligible for check-in';

    return {
      id: checkinRecord.id,
      status: checkinStatus,
      message,
      applicantName,
      applicantEmail,
      applicant: {
        name: applicantName,
        email: applicantEmail,
        id: app.applicant_user_id,
      },
      checkedInAt: checkedInAt ? checkedInAt.toISOString() : undefined,
      timestamp: new Date(),
    };
  }
}
