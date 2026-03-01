import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@event-platform/db';
import { PrismaService } from '../common/prisma/prisma.service';
import { OrgSettingsService } from '../admin/org-settings.service';
import { RateLimiterService } from '../common/services/rate-limiter.service';
import { LoginDto, SignupDto } from '@event-platform/shared';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

interface UpdateProfileDto {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  education?: string;
  institution?: string;
  city?: string;
  country?: string;
  dateOfBirth?: string;
  links?: string[];
}

export interface StaffEventSummary {
  eventId: string;
  title: string;
  slug: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  applicationOpenAt: string | null;
  applicationCloseAt: string | null;
  roles: string[];
}

export interface SignupResult {
  id: string;
  email: string;
  verificationRequired: boolean;
  wasExistingUnverified: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgSettingsService: OrgSettingsService,
    private readonly rateLimiterService: RateLimiterService,
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

  private getSecurityFlags(settings: unknown): {
    registrationEnabled: boolean;
    maintenanceMode: boolean;
    emailVerificationRequired: boolean;
  } {
    const root =
      settings && typeof settings === 'object'
        ? (settings as Record<string, unknown>)
        : {};
    const securityRaw =
      root.security && typeof root.security === 'object'
        ? (root.security as Record<string, unknown>)
        : {};

    const registrationEnabled = this.readBoolean(
      securityRaw.registrationEnabled,
      true,
    );
    const maintenanceMode = this.readBoolean(
      securityRaw.maintenanceMode,
      false,
    );
    const emailVerificationRequired = this.readBoolean(
      securityRaw.emailVerificationRequired ??
        securityRaw.email_verification_required ??
        securityRaw.requireEmailVerification,
      true,
    );

    return {
      registrationEnabled,
      maintenanceMode,
      emailVerificationRequired,
    };
  }

  async signup(dto: SignupDto): Promise<SignupResult> {
    const settings = await this.orgSettingsService.getSettings();
    const security = this.getSecurityFlags(settings);

    if (!security.registrationEnabled) {
      throw new ForbiddenException('Registration is currently disabled');
    }

    // Check if user exists
    const existing = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      const isUnverified = !existing.email_verified_at;
      if (isUnverified && security.emailVerificationRequired) {
        // Keep signup idempotent for pending-verification accounts.
        await this.prisma.applicant_profiles.upsert({
          where: { user_id: existing.id },
          update: {},
          create: { user_id: existing.id },
        });
        return {
          id: existing.id,
          email: existing.email,
          verificationRequired: security.emailVerificationRequired,
          wasExistingUnverified: true,
        };
      }

      throw new BadRequestException('Email already in use');
    }

    const hashedPassword = await argon2.hash(dto.password);
    const userId = crypto.randomUUID();

    // Transaction to create User and Profile
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.users.create({
        data: {
          id: userId,
          email: dto.email,
          password_hash: hashedPassword,
        },
      });

      await tx.applicant_profiles.create({
        data: { user_id: userId },
      });

      return u;
    });

    return {
      id: user.id,
      email: user.email,
      verificationRequired: security.emailVerificationRequired,
      wasExistingUnverified: false,
    };
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (user && !user.is_disabled) {
      const match = await argon2.verify(user.password_hash, pass);
      if (match) {
        const { password_hash, ...result } = user;
        return result;
      }
    }
    return null;
  }

  /**
   * Validates credentials, regenerates session, and issues CSRF token.
   */
  async login(dto: LoginDto, req: any) {
    const settings = await this.orgSettingsService.getSettings();
    const security = this.getSecurityFlags(settings);

    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Maintenance Mode Check
    if (security.maintenanceMode && !user.is_global_admin) {
      throw new ServiceUnavailableException('System is under maintenance');
    }

    const emailVerified = Boolean(user.email_verified_at);
    const mustVerifyEmail =
      security.emailVerificationRequired && !emailVerified;
    const now = new Date();
    const hasStaffRole = Boolean(
      await this.prisma.event_role_assignments.findFirst({
        where: {
          user_id: user.id,
          AND: [
            { OR: [{ access_start_at: null }, { access_start_at: { lte: now } }] },
            { OR: [{ access_end_at: null }, { access_end_at: { gte: now } }] },
          ],
        },
        select: { id: true },
      }),
    );

    // Prevent Session Fixation: Regenerate session ID
    return new Promise((resolve, reject) => {
      req.session.regenerate((err: any) => {
        if (err) {
          return reject(
            new InternalServerErrorException('Session regeneration failed'),
          );
        }

        // Use req.session as it is the new session object
        const session = req.session;

        // Set User in New Session
        session.user = {
          id: user.id,
          email: user.email,
          is_global_admin: user.is_global_admin ?? false,
          email_verified: emailVerified,
          has_staff_role: hasStaffRole,
        };

        // Issue New CSRF Token
        const csrfToken = crypto.randomUUID();
        session.csrfToken = csrfToken;
        session.createdAt = Date.now(); // Reset absolute TTL

        // Persist session
        session.save((saveErr: any) => {
          if (saveErr) {
            return reject(
              new InternalServerErrorException('Session persist error'),
            );
          }
          this.rateLimiterService
            .trackUserSession(user.id, req.sessionID)
            .catch(() => undefined)
            .finally(() => {
              resolve({
                user,
                csrfToken,
                emailVerified,
                emailVerificationRequired: security.emailVerificationRequired,
                mustVerifyEmail,
              });
            });
        });
      });
    });
  }

  async logout(session: any) {
    return new Promise<void>((resolve, reject) => {
      session.destroy((err) => {
        if (err) reject(new InternalServerErrorException('Logout failed'));
        resolve();
      });
    });
  }

  async getMyProfile(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        email: true,
        applicant_profiles: {
          select: {
            full_name: true,
            first_name: true,
            last_name: true,
            phone: true,
            education_level: true,
            institution: true,
            city: true,
            country: true,
            date_of_birth: true,
            links: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid session');

    const rawLinks = user.applicant_profiles?.links;
    const links = Array.isArray(rawLinks)
      ? rawLinks.filter((v): v is string => typeof v === 'string')
      : [];

    const dob = user.applicant_profiles?.date_of_birth;
    const dateOfBirth = dob instanceof Date
      ? dob.toISOString().split('T')[0]
      : typeof dob === 'string'
        ? dob.split('T')[0]
        : '';

    const profile = user.applicant_profiles;
    const firstName = profile?.first_name ?? '';
    const lastName = profile?.last_name ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || profile?.full_name || '';

    return {
      email: user.email,
      firstName,
      lastName,
      fullName,
      phone: profile?.phone ?? '',
      education: profile?.education_level ?? '',
      institution: profile?.institution ?? '',
      city: profile?.city ?? '',
      country: profile?.country ?? '',
      dateOfBirth,
      links,
    };
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const cleanLinks = Array.isArray(dto.links)
      ? dto.links
          .map((l) => String(l).trim())
          .filter((l) => l.length > 0)
          .slice(0, 10)
      : [];

    const parsedDob = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;
    const dateOfBirth = parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : undefined;

    // Compute full_name from firstName/lastName for backward compatibility
    const computedFullName = dto.firstName !== undefined || dto.lastName !== undefined
      ? [dto.firstName, dto.lastName].filter(Boolean).join(' ') || null
      : dto.fullName;

    await this.prisma.applicant_profiles.upsert({
      where: { user_id: userId },
      update: {
        full_name: computedFullName,
        first_name: dto.firstName,
        last_name: dto.lastName,
        phone: dto.phone,
        education_level: dto.education,
        institution: dto.institution,
        city: dto.city,
        country: dto.country,
        date_of_birth: dateOfBirth,
        links: cleanLinks,
      },
      create: {
        user_id: userId,
        full_name: computedFullName ?? null,
        first_name: dto.firstName ?? null,
        last_name: dto.lastName ?? null,
        phone: dto.phone ?? null,
        education_level: dto.education ?? null,
        institution: dto.institution ?? null,
        city: dto.city ?? null,
        country: dto.country ?? null,
        date_of_birth: dateOfBirth ?? null,
        links: cleanLinks,
      },
    });

    return this.getMyProfile(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current and new password are required');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, password_hash: true },
    });
    if (!user) throw new UnauthorizedException('Invalid session');

    const ok = await argon2.verify(user.password_hash, currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const nextHash = await argon2.hash(newPassword);
    await this.prisma.users.update({
      where: { id: userId },
      data: { password_hash: nextHash },
    });

    return { message: 'Password changed successfully.' };
  }

  async deleteMyAccount(userId: string, currentPassword: string) {
    if (!currentPassword) {
      throw new BadRequestException('Current password is required');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, password_hash: true },
    });
    if (!user) throw new UnauthorizedException('Invalid session');

    const ok = await argon2.verify(user.password_hash, currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    try {
      await this.prisma.$transaction(async (tx) => {
        // Clear nullable historical references before deleting user row.
        await tx.audit_logs.updateMany({
          where: { actor_user_id: userId },
          data: { actor_user_id: null },
        });
        await tx.attendance_records.updateMany({
          where: { checked_in_by: userId },
          data: { checked_in_by: null },
        });
        await tx.applications.updateMany({
          where: { assigned_reviewer_id: userId },
          data: { assigned_reviewer_id: null },
        });
        await tx.microsite_page_versions.updateMany({
          where: { created_by: userId },
          data: { created_by: null },
        });
        await tx.microsite_versions.updateMany({
          where: { created_by: userId },
          data: { created_by: null },
        });

        // Remove user-owned data that should not survive account deletion.
        await tx.applications.deleteMany({
          where: { applicant_user_id: userId },
        });
        await tx.file_objects.deleteMany({
          where: { created_by: userId },
        });
        await tx.event_role_assignments.deleteMany({
          where: { user_id: userId },
        });

        await tx.users.delete({ where: { id: userId } });
      });
    } catch (error) {
      const errorCode =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined;
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003') ||
        errorCode === 'P2003'
      ) {
        throw new BadRequestException(
          'Account cannot be deleted while linked to staff activity. Contact support.',
        );
      }
      throw error;
    }

    this.rateLimiterService.revokeUserSessions(userId).catch(() => undefined);

    return { message: 'Account deleted successfully.' };
  }

  async getUserEventRoles(userId: string) {
    const now = new Date();
    const assignments = await this.prisma.event_role_assignments.findMany({
      where: {
        user_id: userId,
        AND: [
          { OR: [{ access_start_at: null }, { access_start_at: { lte: now } }] },
          { OR: [{ access_end_at: null }, { access_end_at: { gte: now } }] },
        ],
      },
      select: { event_id: true, role: true },
    });
    return assignments.map((a) => ({
      eventId: a.event_id,
      role: String(a.role).toLowerCase(),
    }));
  }

  async getUserEmailVerificationState(userId: string): Promise<{
    emailVerified: boolean;
    emailVerificationRequired: boolean;
    mustVerifyEmail: boolean;
  }> {
    const [settings, user] = await Promise.all([
      this.orgSettingsService.getSettings(),
      this.prisma.users.findUnique({
        where: { id: userId },
        select: { email_verified_at: true },
      }),
    ]);

    if (!user) throw new UnauthorizedException('Invalid session');

    const security = this.getSecurityFlags(settings);
    const emailVerified = Boolean(user.email_verified_at);

    return {
      emailVerified,
      emailVerificationRequired: security.emailVerificationRequired,
      mustVerifyEmail: security.emailVerificationRequired && !emailVerified,
    };
  }

  async getMyStaffEvents(userId: string): Promise<StaffEventSummary[]> {
    const now = new Date();
    const assignments = await this.prisma.event_role_assignments.findMany({
      where: {
        user_id: userId,
        AND: [
          { OR: [{ access_start_at: null }, { access_start_at: { lte: now } }] },
          { OR: [{ access_end_at: null }, { access_end_at: { gte: now } }] },
        ],
      },
      select: {
        event_id: true,
        role: true,
        events: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            start_at: true,
            end_at: true,
            application_open_at: true,
            application_close_at: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const byEvent = new Map<
      string,
      Omit<StaffEventSummary, 'roles'> & { roles: Set<string> }
    >();

    for (const assignment of assignments) {
      const event = assignment.events;
      if (!event) continue;

      const role = String(assignment.role).toLowerCase();
      const existing = byEvent.get(event.id);

      if (existing) {
        existing.roles.add(role);
        continue;
      }

      byEvent.set(event.id, {
        eventId: event.id,
        title: event.title,
        slug: event.slug,
        status: String(event.status ?? '').toLowerCase(),
        startAt: event.start_at ? event.start_at.toISOString() : null,
        endAt: event.end_at ? event.end_at.toISOString() : null,
        applicationOpenAt: event.application_open_at
          ? event.application_open_at.toISOString()
          : null,
        applicationCloseAt: event.application_close_at
          ? event.application_close_at.toISOString()
          : null,
        roles: new Set([role]),
      });
    }

    return Array.from(byEvent.values())
      .map((event) => ({
        ...event,
        roles: Array.from(event.roles).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }
}
