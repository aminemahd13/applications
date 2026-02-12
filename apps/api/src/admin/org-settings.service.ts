import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateOrgSettingsDto } from '@event-platform/shared';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrgSettingsService {
  private static readonly SETTINGS_ID = 1;
  private static readonly CACHE_TTL_MS = 30_000;
  private cachedSettings: any | null = null;
  private cacheExpiresAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  private getDefaultSettings() {
    return {
      id: OrgSettingsService.SETTINGS_ID,
      branding: {},
      security: {},
      email: {},
      storage: {},
      retention: {},
    };
  }

  private primeCache(settings: any) {
    this.cachedSettings = settings;
    this.cacheExpiresAt = Date.now() + OrgSettingsService.CACHE_TTL_MS;
  }

  private async readOrCreateSettings() {
    const existing = await this.prisma.org_settings.findUnique({
      where: { id: OrgSettingsService.SETTINGS_ID },
    });
    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.org_settings.create({
        data: this.getDefaultSettings(),
      });
    } catch (error) {
      // Another concurrent request may have created the singleton row.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.org_settings.findUniqueOrThrow({
          where: { id: OrgSettingsService.SETTINGS_ID },
        });
      }
      throw error;
    }
  }

  /**
   * Get organization settings (singleton row id=1)
   */
  async getSettings(options?: { fresh?: boolean }) {
    if (
      !options?.fresh &&
      this.cachedSettings &&
      Date.now() < this.cacheExpiresAt
    ) {
      return this.cachedSettings;
    }

    const settings = await this.readOrCreateSettings();
    this.primeCache(settings);
    return settings;
  }

  /**
   * Update organization settings (fetch-merge-update for each category)
   */
  async updateSettings(data: UpdateOrgSettingsDto) {
    const current = await this.getSettings({ fresh: true });

    const updatedData: Record<string, object> = {};

    if (data.branding) {
      updatedData.branding = {
        ...(current.branding as object),
        ...data.branding,
      };
    }
    if (data.security) {
      updatedData.security = {
        ...(current.security as object),
        ...data.security,
      };
    }
    if (data.email) {
      updatedData.email = { ...(current.email as object), ...data.email };
    }
    if (data.storage) {
      updatedData.storage = { ...(current.storage as object), ...data.storage };
    }
    if (data.retention) {
      updatedData.retention = {
        ...(current.retention as object),
        ...data.retention,
      };
    }

    const updated = await this.prisma.org_settings.update({
      where: { id: OrgSettingsService.SETTINGS_ID },
      data: updatedData,
    });
    this.primeCache(updated);
    return updated;
  }
}
