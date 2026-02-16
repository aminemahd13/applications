import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateMicrositePageSchema,
  UpdateMicrositePageSchema,
  UpdateMicrositeSettingsSchema,
} from '@event-platform/shared';
import { z } from 'zod';

@Injectable()
export class MicrositesService {
  private readonly logger = new Logger(MicrositesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Admin: Settings ---

  async getMicrositeDraft(eventId: string) {
    const microsite = await this.prisma.microsites.findUnique({
      where: { event_id: eventId },
    });
    if (!microsite) {
      return null;
    }
    return microsite;
  }

  async ensureMicrosite(eventId: string) {
    return this.prisma.microsites.upsert({
      where: { event_id: eventId },
      update: {},
      create: { event_id: eventId, settings: {} },
      include: { events: { select: { slug: true } } },
    });
  }

  async updateSettings(
    eventId: string,
    data: z.infer<typeof UpdateMicrositeSettingsSchema>,
  ) {
    const microsite = await this.ensureMicrosite(eventId);
    const currentSettings = microsite.settings as Record<string, any>;
    const newSettings = {
      ...currentSettings,
      ...data,
      design: {
        ...(currentSettings.design ?? {}),
        ...((data as any).design ?? {}),
      },
      branding: {
        ...(currentSettings.branding ?? {}),
        ...((data as any).branding ?? {}),
      },
      navigation: {
        ...(currentSettings.navigation ?? {}),
        ...((data as any).navigation ?? {}),
      },
      footer: {
        ...(currentSettings.footer ?? {}),
        ...((data as any).footer ?? {}),
      },
      customCode: {
        ...(currentSettings.customCode ?? {}),
        ...((data as any).customCode ?? {}),
      },
    };
    if ((newSettings as any).customCode?.js) {
      delete (newSettings as any).customCode.js;
    }

    return this.prisma.microsites.update({
      where: { id: microsite.id },
      data: { settings: newSettings },
    });
  }

  // --- Admin: Pages ---

  async listDraftPages(eventId: string) {
    const microsite = await this.getMicrositeDraft(eventId);
    if (!microsite) return [];

    const pages = await this.prisma.microsite_pages.findMany({
      where: { microsite_id: microsite.id },
      orderBy: { position: 'asc' },
    });

    let publishedPageIds = new Set<string>();
    if (microsite.published_version > 0) {
      const publishedRows = await this.prisma.microsite_page_versions.findMany({
        where: {
          microsite_id: microsite.id,
          version: microsite.published_version,
        },
        select: { page_id: true },
      });
      publishedPageIds = new Set(publishedRows.map((row) => row.page_id));
    }

    const rootPageId = pages[0]?.id;

    return pages.map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      isPublished: publishedPageIds.has(page.id),
      updatedAt: page.updated_at,
      version: publishedPageIds.has(page.id) ? microsite.published_version : 0,
      isHome: page.id === rootPageId,
    }));
  }

  async getDraftPage(eventId: string, pageId: string) {
    const page = await this.prisma.microsite_pages.findUnique({
      where: { id: pageId },
      include: { microsites: true },
    });
    if (!page || page.microsites.event_id !== eventId) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  async createPage(
    eventId: string,
    data: z.infer<typeof CreateMicrositePageSchema>,
  ) {
    const microsite = await this.ensureMicrosite(eventId);

    // Slug normalization: lowercase, alphanumeric + hyphens
    const slug = (data.slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug || slug.length === 0)
      throw new BadRequestException('Invalid slug');
    if (slug === 'home')
      throw new BadRequestException('Slug "home" is reserved');

    // Check uniqueness
    const existing = await this.prisma.microsite_pages.findFirst({
      where: { microsite_id: microsite.id, slug: slug },
    });
    if (existing)
      throw new BadRequestException(`Page with slug '${slug}' already exists`);

    const seo = {
      ...(data.seo ?? {}),
      customCode: {
        ...((data.seo as any)?.customCode ?? {}),
        ...((data as any).customCode ?? {}),
      },
    } as Record<string, any>;
    if (seo.customCode?.js) {
      delete seo.customCode.js;
    }

    return this.prisma.microsite_pages.create({
      data: {
        microsite_id: microsite.id,
        slug: slug,
        title: data.title,
        position: data.position,
        blocks: (data.blocks ?? []) as unknown as Prisma.InputJsonValue,
        seo,
        visibility: data.visibility,
      },
    });
  }

  async updatePage(
    eventId: string,
    pageId: string,
    data: z.infer<typeof UpdateMicrositePageSchema>,
  ) {
    const page = await this.prisma.microsite_pages.findUnique({
      where: { id: pageId },
      include: { microsites: true },
    });
    if (!page || page.microsites.event_id !== eventId) {
      throw new NotFoundException('Page not found');
    }

    // If slug is provided, normalize and re-validate invariants from create flow.
    if (data.slug !== undefined) {
      const newSlug = String(data.slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      if (!newSlug || newSlug.length === 0) {
        throw new BadRequestException('Invalid slug');
      }
      if (newSlug === 'home') {
        throw new BadRequestException('Slug "home" is reserved');
      }

      if (newSlug !== page.slug) {
        const existing = await this.prisma.microsite_pages.findFirst({
          where: { microsite_id: page.microsite_id, slug: newSlug },
        });
        if (existing)
          throw new BadRequestException(
            `Page with slug '${newSlug}' already exists`,
          );
      }

      // Update slug in data payload.
      data.slug = newSlug;
    }

    const existingSeo = (page.seo as Record<string, any>) ?? {};
    const incomingSeo = (data.seo as Record<string, any>) ?? {};
    const mergedSeo =
      data.seo || (data as any).customCode
        ? {
            ...existingSeo,
            ...incomingSeo,
            customCode: {
              ...(existingSeo.customCode ?? {}),
              ...(incomingSeo.customCode ?? {}),
              ...((data as any).customCode ?? {}),
            },
          }
        : undefined;
    if (mergedSeo?.customCode?.js) {
      delete mergedSeo.customCode.js;
    }

    const { customCode: _customCode, ...safeData } = data as any;

    return this.prisma.microsite_pages.update({
      where: { id: pageId },
      data: {
        ...safeData,
        ...(mergedSeo ? { seo: mergedSeo } : {}),
      },
    });
  }

  async deletePage(eventId: string, pageId: string) {
    const page = await this.prisma.microsite_pages.findUnique({
      where: { id: pageId },
      include: { microsites: true },
    });
    if (!page || page.microsites.event_id !== eventId) {
      throw new NotFoundException('Page not found');
    }
    return this.prisma.microsite_pages.delete({ where: { id: pageId } });
  }

  // --- Admin: Publish & Rollback ---

  async publish(eventId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock Microsite using raw SQL
      await tx.$executeRaw`SELECT 1 FROM microsites WHERE event_id = ${eventId}::uuid FOR UPDATE`;

      // Re-fetch to get latest state after lock
      const microsite = await tx.microsites.findUniqueOrThrow({
        where: { event_id: eventId },
      });

      // Version numbers are append-only across history. Do not derive from
      // published_version because rollback/unpublish can move that pointer back.
      const latestVersion = await tx.microsite_versions.aggregate({
        where: { microsite_id: microsite.id },
        _max: { version: true },
      });
      const nextVersion = (latestVersion._max.version ?? 0) + 1;
      const pages = await tx.microsite_pages.findMany({
        where: { microsite_id: microsite.id },
      });

      // 2. Create MicrositeVersion (Settings Snapshot)
      const versionRecord = await tx.microsite_versions.create({
        data: {
          microsite_id: microsite.id,
          version: nextVersion,
          settings: microsite.settings ?? {},
          created_by: actorUserId,
        },
      });

      // 3. Create Page Versions
      if (pages.length > 0) {
        await tx.microsite_page_versions.createMany({
          data: pages.map((p) => ({
            microsite_id: microsite.id,
            microsite_version_id: versionRecord.id,
            page_id: p.id,
            version: nextVersion,
            slug: p.slug,
            title: p.title,
            position: p.position,
            blocks: p.blocks ?? [],
            seo: p.seo ?? {},
            visibility: p.visibility,
            created_by: actorUserId,
          })),
        });
      }

      // 4. Update Microsite
      await tx.microsites.update({
        where: { id: microsite.id },
        data: { published_version: nextVersion },
      });

      return { version: nextVersion };
    });
  }

  async unpublish(eventId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM microsites WHERE event_id = ${eventId}::uuid FOR UPDATE`;

      const microsite = await tx.microsites.findUniqueOrThrow({
        where: { event_id: eventId },
      });

      await tx.microsites.update({
        where: { id: microsite.id },
        data: { published_version: 0 },
      });

      return { version: 0 };
    });
  }

  async rollback(eventId: string, targetVersion: number, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock row
      await tx.$executeRaw`SELECT 1 FROM microsites WHERE event_id = ${eventId}::uuid FOR UPDATE`;

      const microsite = await tx.microsites.findUniqueOrThrow({
        where: { event_id: eventId },
      });

      if (targetVersion === 0) {
        // Unpublish
        await tx.microsites.update({
          where: { id: microsite.id },
          data: { published_version: 0 },
        });
        return { version: 0 };
      }

      // Validate target version validity (must be <= current published version? No, can hold any valid version)
      // But usually we rollback to previous.
      // Also ensure version is > 0
      if (targetVersion < 0) throw new BadRequestException('Invalid version');

      // Verify version exists
      const versionRecord = await tx.microsite_versions.findUnique({
        where: {
          microsite_id_version: {
            microsite_id: microsite.id,
            version: targetVersion,
          },
        },
      });
      if (!versionRecord)
        throw new BadRequestException(
          `Version ${targetVersion} does not exist`,
        );

      await tx.microsites.update({
        where: { id: microsite.id },
        data: { published_version: targetVersion },
      });

      return { version: targetVersion };
    });
  }

  async getVersions(eventId: string) {
    const microsite = await this.getMicrositeDraft(eventId);
    if (!microsite) return [];

    return this.prisma.microsite_versions.findMany({
      where: { microsite_id: microsite.id },
      orderBy: { version: 'desc' },
      include: { users: { select: { email: true, id: true } } },
    });
  }

  // --- Public ---

  async getPublicMicrosite(slug: string) {
    const microsite = await this.prisma.microsites.findFirst({
      where: {
        published_version: { gt: 0 },
        // Microsites can be published independently from application windows,
        // but must not remain public after the event is archived (soft deleted).
        events: { is: { slug, status: { not: 'archived' } } },
      },
      select: {
        id: true,
        published_version: true,
        events: { select: { slug: true } },
      },
    });

    if (!microsite) {
      throw new NotFoundException('Microsite not published');
    }

    const publishedVersion = microsite.published_version;
    const [versionRecord, pages] = await Promise.all([
      this.prisma.microsite_versions.findUnique({
        where: {
          microsite_id_version: {
            microsite_id: microsite.id,
            version: publishedVersion,
          },
        },
        select: { settings: true },
      }),
      this.prisma.microsite_page_versions.findMany({
        where: {
          microsite_id: microsite.id,
          version: publishedVersion,
          visibility: 'PUBLIC',
        },
        orderBy: { position: 'asc' },
        select: { title: true, slug: true },
      }),
    ]);

    if (!versionRecord)
      throw new NotFoundException('Published version data missing');

    return {
      settings: versionRecord.settings,
      nav: pages.map((p, index) => ({
        label: p.title,
        href:
          index === 0
            ? `/events/${microsite.events.slug}`
            : `/events/${microsite.events.slug}/${p.slug}`,
      })),
      publishedVersion,
    };
  }

  async getPublicPage(eventSlug: string, pageSlug: string) {
    const microsite = await this.prisma.microsites.findFirst({
      where: {
        published_version: { gt: 0 },
        // Allow public microsite pages independent of application windows,
        // but hide them once the event is archived (soft deleted).
        events: { is: { slug: eventSlug, status: { not: 'archived' } } },
      },
      select: { id: true, published_version: true },
    });
    if (!microsite) throw new NotFoundException('Microsite not published');

    const normalizedSlug = String(pageSlug || '')
      .trim()
      .toLowerCase();
    const useRootPageAlias = !normalizedSlug || normalizedSlug === 'home';

    const page = await this.prisma.microsite_page_versions.findFirst({
      where: {
        microsite_id: microsite.id,
        version: microsite.published_version,
        visibility: 'PUBLIC',
        ...(useRootPageAlias ? {} : { slug: normalizedSlug }),
      },
      ...(useRootPageAlias ? { orderBy: { position: 'asc' } } : {}),
    });

    if (!page) throw new NotFoundException('Page not found');

    return page;
  }
}
