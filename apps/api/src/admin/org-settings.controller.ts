import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { OrgSettingsService } from './org-settings.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  Permission,
  PlatformSettingsSchema,
  PlatformSettingsDto,
} from '@event-platform/shared';

@Controller('admin/settings')
@UseGuards(PermissionsGuard)
export class OrgSettingsController {
  constructor(private readonly service: OrgSettingsService) {}

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

  private getEmailVerificationRequired(security: unknown): boolean {
    const s =
      security && typeof security === 'object'
        ? (security as Record<string, unknown>)
        : {};
    return this.readBoolean(
      s.emailVerificationRequired ??
        s.email_verification_required ??
        s.requireEmailVerification,
      true,
    );
  }

  @Get()
  @RequirePermission(Permission.ADMIN_SETTINGS_UPDATE)
  async getSettings() {
    const settings = await this.service.getSettings();
    return this.toFlat(settings);
  }

  @Get('public')
  async getPublicSettings() {
    const settings = await this.service.getSettings();
    return this.toPublic(settings);
  }

  @Patch()
  @RequirePermission(Permission.ADMIN_SETTINGS_UPDATE)
  async updateSettings(@Body() body: any) {
    const dto = PlatformSettingsSchema.parse(body);
    const categorized = this.toCategorized(dto);
    const settings = await this.service.updateSettings(categorized);
    return this.toFlat(settings);
  }

  private toFlat(settings: any) {
    const b = settings.branding || {};
    const s = settings.security || {};
    const e = settings.email || {};
    const st = settings.storage || {};
    const r = settings.retention || {};
    const emailVerificationRequired = this.getEmailVerificationRequired(
      settings.security,
    );
    return {
      platformName: b.platformName ?? 'Math&Maroc',
      platformUrl: b.platformUrl ?? '',
      primaryColor: b.primaryColor ?? '#2563eb',
      footerText: b.footerText ?? '',
      maintenanceMode: s.maintenanceMode ?? false,
      registrationEnabled: s.registrationEnabled ?? true,
      emailVerificationRequired,
      supportEmail: e.supportEmail ?? '',
      smtpHost: e.smtpHost ?? '',
      smtpPort: e.smtpPort ?? 587,
      smtpSender: e.smtpSender ?? '',
      maxEventsPerOrganizer: st.maxEventsPerOrganizer ?? 10,
      maxApplicationsPerUser: st.maxApplicationsPerUser ?? 5,
      defaultApplicationDeadlineDays: st.defaultApplicationDeadlineDays ?? 30,
      defaultTimezone: r.defaultTimezone ?? 'Africa/Casablanca',
    };
  }

  private toCategorized(dto: PlatformSettingsDto) {
    return {
      branding: {
        platformName: dto.platformName,
        platformUrl: dto.platformUrl,
        primaryColor: dto.primaryColor,
        footerText: dto.footerText,
      },
      security: {
        maintenanceMode: dto.maintenanceMode,
        registrationEnabled: dto.registrationEnabled,
        emailVerificationRequired: dto.emailVerificationRequired,
      },
      email: {
        supportEmail: dto.supportEmail,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort,
        smtpSender: dto.smtpSender,
      },
      storage: {
        maxEventsPerOrganizer: dto.maxEventsPerOrganizer,
        maxApplicationsPerUser: dto.maxApplicationsPerUser,
        defaultApplicationDeadlineDays: dto.defaultApplicationDeadlineDays,
      },
      retention: {
        defaultTimezone: dto.defaultTimezone,
      },
    };
  }

  private toPublic(settings: any) {
    const b = settings.branding || {};
    const s = settings.security || {};
    const e = settings.email || {};
    const emailVerificationRequired = this.getEmailVerificationRequired(
      settings.security,
    );
    return {
      platformName: b.platformName ?? 'Math&Maroc',
      platformUrl: b.platformUrl ?? '',
      primaryColor: b.primaryColor ?? '#2563eb',
      footerText: b.footerText ?? '',
      maintenanceMode: s.maintenanceMode ?? false,
      registrationEnabled: s.registrationEnabled ?? true,
      emailVerificationRequired,
      supportEmail: e.supportEmail ?? '',
    };
  }
}
