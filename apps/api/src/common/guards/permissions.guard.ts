import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import {
  Permission,
  ROLE_PERMISSIONS,
  APPLICANT_PERMISSIONS,
} from '@event-platform/shared';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private static readonly ORG_SETTINGS_CACHE_TTL_MS = 30_000;
  private static readonly SELF_PERMISSIONS_ALLOWED_WHEN_UNVERIFIED =
    new Set<Permission>([
      Permission.SELF_PROFILE_UPDATE,
      Permission.SELF_APPLICATION_READ,
      Permission.SELF_INBOX_READ,
    ]);
  private static orgSettingsCache: {
    security: Record<string, unknown>;
    expiresAt: number;
  } | null = null;

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  private async getOrgSecuritySettings(): Promise<Record<string, unknown>> {
    const cached = PermissionsGuard.orgSettingsCache;
    if (cached && Date.now() < cached.expiresAt) {
      return cached.security;
    }

    const orgSettings = await this.prisma.org_settings.findUnique({
      where: { id: 1 },
      select: { security: true },
    });
    const security =
      orgSettings?.security && typeof orgSettings.security === 'object'
        ? (orgSettings.security as Record<string, unknown>)
        : {};

    PermissionsGuard.orgSettingsCache = {
      security,
      expiresAt: Date.now() + PermissionsGuard.ORG_SETTINGS_CACHE_TTL_MS,
    };
    return security;
  }

  private toBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const sessionUser = request.session?.user;
    const userId = sessionUser?.id;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Set actor context
    this.cls.set('actorId', userId);
    this.cls.set('ip', request.ip);
    this.cls.set('ua', request.headers['user-agent']);

    const isGlobalAdmin = Boolean(sessionUser?.is_global_admin);
    this.cls.set('isGlobalAdmin', isGlobalAdmin);

    const readBoolean = (value: unknown, fallback: boolean): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      if (typeof value === 'number') return value !== 0;
      return fallback;
    };

    const security = await this.getOrgSecuritySettings();
    const maintenanceMode = readBoolean(security.maintenanceMode, false);
    const emailVerificationRequired = readBoolean(
      security.emailVerificationRequired ??
        security.email_verification_required ??
        security.requireEmailVerification,
      true,
    );

    if (maintenanceMode && !isGlobalAdmin) {
      throw new ServiceUnavailableException('System is under maintenance');
    }

    // Resolve Event ID early for email verification checks
    const eventId = this.cls.get('eventId') || request.params.eventId;

    const isSelfScopedPermission = (permission: Permission): boolean =>
      APPLICANT_PERMISSIONS.includes(permission) ||
      permission.toString().startsWith('SELF_');

    const isApplicantOnlyRoute = requiredPermissions.every(
      isSelfScopedPermission,
    );

    if (isApplicantOnlyRoute) {
      const sessionEmailVerified = this.toBoolean(sessionUser?.email_verified);
      const sessionHasStaffRole = this.toBoolean(sessionUser?.has_staff_role);

      let emailVerified = sessionEmailVerified === true;
      let hasAnyStaffRole = sessionHasStaffRole === true;

      if (sessionEmailVerified !== true || sessionHasStaffRole === undefined) {
        const [userMeta, staffRole] = await Promise.all([
          this.prisma.users.findUnique({
            where: { id: userId },
            select: { email_verified_at: true },
          }),
          sessionHasStaffRole === undefined
            ? this.prisma.event_role_assignments.findFirst({
                where: { user_id: userId },
                select: { id: true },
              })
            : Promise.resolve(null),
        ]);

        if (!userMeta) throw new UnauthorizedException('User not found');

        emailVerified = Boolean(userMeta.email_verified_at);
        if (sessionUser) {
          sessionUser.email_verified = emailVerified;
        }

        if (sessionHasStaffRole === undefined) {
          hasAnyStaffRole = Boolean(staffRole);
          if (sessionUser) {
            sessionUser.has_staff_role = hasAnyStaffRole;
          }
        }
      }

      let requiresVerification = emailVerificationRequired;
      if (eventId && !emailVerified && !emailVerificationRequired) {
        const event = await this.prisma.events.findUnique({
          where: { id: eventId },
          select: { requires_email_verification: true },
        });
        if (event?.requires_email_verification) {
          requiresVerification = true;
        }
      }
      const requiresVerifiedEmailForRoute = requiredPermissions.some(
        (permission) =>
          !PermissionsGuard.SELF_PERMISSIONS_ALLOWED_WHEN_UNVERIFIED.has(
            permission,
          ),
      );
      if (
        !emailVerified &&
        requiresVerification &&
        requiresVerifiedEmailForRoute
      ) {
        throw new ForbiddenException('Email verification required');
      }

      if (isGlobalAdmin || hasAnyStaffRole) {
        throw new ForbiddenException(
          'Staff/admin accounts cannot access applicant routes',
        );
      }
    }

    if (isGlobalAdmin) {
      // Global admin bypasses all checks, but still needs permissions in CLS for downstream checks
      this.cls.set('permissions', Object.values(Permission));
      return true;
    }

    // Global Scope Check (No event ID)
    if (!eventId) {
      // Check if required permission is a self-scoped permission (allowed for any authenticated user)
      const isSelfScoped = requiredPermissions.every(isSelfScopedPermission);
      if (isSelfScoped) return true;

      throw new ForbiddenException('Event context required');
    }

    // Event Scope: Resolve user roles
    const assignments = await this.prisma.event_role_assignments.findMany({
      where: { user_id: userId, event_id: eventId },
      select: { role: true },
    });

    // Collect permissions from roles
    const userPermissions = new Set<Permission>();
    for (const assignment of assignments) {
      const rolePerms =
        ROLE_PERMISSIONS[
          String(assignment.role).toLowerCase() as keyof typeof ROLE_PERMISSIONS
        ];
      if (rolePerms) {
        rolePerms.forEach((p) => userPermissions.add(p));
      }
    }

    // If no role assignments, check if user is an applicant for this event
    if (assignments.length === 0) {
      // Check if required permissions are applicant-level (SELF_* or APPLICANT_PERMISSIONS)
      const isApplicantPermission = requiredPermissions.some((p) =>
        APPLICANT_PERMISSIONS.includes(p),
      );

      if (isApplicantPermission) {
        // For SELF_APPLICATION_CREATE, allow any authenticated user (they're applying)
        if (requiredPermissions.includes(Permission.SELF_APPLICATION_CREATE)) {
          return true;
        }

        // For other applicant permissions, verify they have an application
        const hasApplication = await this.prisma.applications.findFirst({
          where: { event_id: eventId, applicant_user_id: userId },
          select: { id: true },
        });

        if (hasApplication) {
          // Grant all applicant permissions
          APPLICANT_PERMISSIONS.forEach((p) => userPermissions.add(p));
        }
      }
    }

    // Store resolved permissions in CLS for controllers/services
    this.cls.set('permissions', Array.from(userPermissions));

    // Check if user has any required permission
    const hasPermission = requiredPermissions.some((p) =>
      userPermissions.has(p),
    );
    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
