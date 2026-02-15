import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@event-platform/db';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
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
                applicant_profiles: { select: { full_name: true } },
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
          r.applications?.users_applications_applicant_user_idTousers
            ?.applicant_profiles?.full_name ?? 'Unknown',
        applicantEmail:
          r.applications?.users_applications_applicant_user_idTousers?.email ??
          '',
        checkedInAt: r.scanned_at.toISOString(),
        checkedInBy: r.users?.email ?? 'Unknown',
      })),
    };
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
            applicant_profiles: { select: { full_name: true } },
          },
        },
      },
    });

    return records.map((app) => ({
      applicationId: app.id,
      applicantName:
        app.users_applications_applicant_user_idTousers.applicant_profiles
          ?.full_name ?? 'Unknown',
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
    await this.assertCheckinEnabled(eventId);
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

    let checkinStatus = 'SUCCESS';
    let failReason: string | undefined;

    if (app.attendance_records?.status === 'CHECKED_IN') {
      checkinStatus = 'ALREADY_CHECKED_IN';
      failReason = 'Already checked in';
    } else if (app.attendance_records?.status !== 'CONFIRMED') {
      // Should be impossible if decision is accepted logic held, but valid check
      checkinStatus = 'INVALID_STATUS';
      failReason = `Status is ${app.attendance_records?.status}`;
    }

    // Log the attempt
    const checkinRecord = await this.prisma.checkin_records.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        application_id: applicationId,
        staff_user_id: staffUserId,
        result: checkinStatus,
        fail_reason: failReason,
        raw_token_fingerprint: jti, // Store JTI as fingerprint
      },
    });

    if (checkinStatus === 'SUCCESS') {
      // Update attendance record
      await this.prisma.attendance_records.update({
        where: { application_id: applicationId },
        data: {
          status: 'CHECKED_IN',
          checked_in_at: new Date(),
          checked_in_by: staffUserId,
        },
      });
    }

    const applicantName =
      app.users_applications_applicant_user_idTousers.applicant_profiles
        ?.full_name || 'Unknown';
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
    }

    const applicantName =
      app.users_applications_applicant_user_idTousers.applicant_profiles
        ?.full_name || 'Unknown';
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
