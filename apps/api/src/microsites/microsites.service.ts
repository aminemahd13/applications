import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateMicrositePageSchema,
  UpdateMicrositePageSchema,
  UpdateMicrositeSettingsSchema,
} from '@event-platform/shared';
import { z } from 'zod';

type JsonRecord = Record<string, unknown>;

function toJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as JsonRecord) };
}

function removeLegacyJsField(record: JsonRecord) {
  if ('js' in record) {
    delete record.js;
  }
}

@Injectable()
export class MicrositesService {
  private static readonly PUBLIC_CACHE_TTL_MS = Math.max(
    Number(process.env.MICROSITES_PUBLIC_CACHE_TTL_MS ?? 30_000),
    5_000,
  );
  private static readonly PUBLIC_CACHE_MAX_ENTRIES = Math.max(
    Number(process.env.MICROSITES_PUBLIC_CACHE_MAX_ENTRIES ?? 2_000),
    200,
  );
  private readonly publicMicrositeCache = new Map<
    string,
    { value: any; expiresAt: number }
  >();
  private readonly publicPageCache = new Map<
    string,
    { value: any; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  private getCachedEntry<T>(
    cache: Map<string, { value: T; expiresAt: number }>,
    key: string,
  ): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCachedEntry<T>(
    cache: Map<string, { value: T; expiresAt: number }>,
    key: string,
    value: T,
  ) {
    const now = Date.now();
    cache.set(key, {
      value,
      expiresAt: now + MicrositesService.PUBLIC_CACHE_TTL_MS,
    });

    if (cache.size <= MicrositesService.PUBLIC_CACHE_MAX_ENTRIES) return;

    for (const [cacheKey, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(cacheKey);
      }
      if (cache.size <= MicrositesService.PUBLIC_CACHE_MAX_ENTRIES) {
        return;
      }
    }

    const overflow = cache.size - MicrositesService.PUBLIC_CACHE_MAX_ENTRIES;
    if (overflow <= 0) return;

    let removed = 0;
    for (const cacheKey of cache.keys()) {
      cache.delete(cacheKey);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  private invalidatePublicCaches() {
    this.publicMicrositeCache.clear();
    this.publicPageCache.clear();
  }

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
    const currentSettingsResult = UpdateMicrositeSettingsSchema.safeParse(
      microsite.settings,
    );
    const currentSettings = currentSettingsResult.success
      ? currentSettingsResult.data
      : {};

    const newSettings: z.infer<typeof UpdateMicrositeSettingsSchema> = {
      ...currentSettings,
      ...data,
    };

    if (currentSettings.design || data.design) {
      newSettings.design = {
        ...(currentSettings.design ?? data.design ?? {}),
        ...(data.design ?? {}),
      } as NonNullable<z.infer<typeof UpdateMicrositeSettingsSchema>['design']>;
    }
    if (currentSettings.branding || data.branding) {
      newSettings.branding = {
        ...(currentSettings.branding ?? data.branding ?? {}),
        ...(data.branding ?? {}),
      };
    }
    if (currentSettings.navigation || data.navigation) {
      newSettings.navigation = {
        ...(currentSettings.navigation ?? data.navigation ?? {}),
        ...(data.navigation ?? {}),
      } as NonNullable<
        z.infer<typeof UpdateMicrositeSettingsSchema>['navigation']
      >;
    }
    if (currentSettings.footer || data.footer) {
      newSettings.footer = {
        ...(currentSettings.footer ?? data.footer ?? {}),
        ...(data.footer ?? {}),
      } as NonNullable<z.infer<typeof UpdateMicrositeSettingsSchema>['footer']>;
    }
    if (currentSettings.customCode || data.customCode) {
      newSettings.customCode = {
        ...(currentSettings.customCode ?? data.customCode ?? {}),
        ...(data.customCode ?? {}),
      };
    }

    const sanitizedCustomCode = toJsonRecord(newSettings.customCode);
    removeLegacyJsField(sanitizedCustomCode);
    newSettings.customCode = sanitizedCustomCode as z.infer<
      typeof UpdateMicrositeSettingsSchema
    >['customCode'];

    const updated = await this.prisma.microsites.update({
      where: { id: microsite.id },
      data: { settings: newSettings as Prisma.InputJsonValue },
    });
    this.invalidatePublicCaches();
    return updated;
  }

  // --- Admin: Pages ---

  async listDraftPages(eventId: string) {
    const microsite = await this.getMicrositeDraft(eventId);
    if (!microsite) return [];

    const pages = await this.prisma.microsite_pages.findMany({
      where: { microsite_id: microsite.id },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
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

    // Canonical homepage is the page with an empty slug. Keep positional
    // fallback for legacy rows that predate empty-slug homepage handling.
    const rootPageId = pages.find((page) => page.slug.length === 0)?.id ?? pages[0]?.id;

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
    const slug = String(data.slug ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    if (slug === 'home')
      throw new BadRequestException('Slug "home" is reserved');

    let position = 0;
    if (slug.length === 0) {
      // Empty slug is reserved for the homepage/root page only.
      const existingRoot = await this.prisma.microsite_pages.findFirst({
        where: { microsite_id: microsite.id, slug: '' },
        select: { id: true },
      });
      if (existingRoot) {
        throw new BadRequestException(
          'Only the homepage can use an empty slug',
        );
      }
    } else {
      // Check uniqueness for non-empty slugs.
      const existing = await this.prisma.microsite_pages.findFirst({
        where: { microsite_id: microsite.id, slug: slug },
      });
      if (existing) {
        throw new BadRequestException(
          `Page with slug '${slug}' already exists`,
        );
      }

      // Most clients do not provide a position; append safely in that case.
      const lastPage = await this.prisma.microsite_pages.findFirst({
        where: { microsite_id: microsite.id },
        orderBy: [{ position: 'desc' }, { created_at: 'desc' }],
        select: { position: true },
      });
      const nextPosition = (lastPage?.position ?? -1) + 1;
      position =
        Number.isFinite(data.position) && data.position > 0
          ? data.position
          : nextPosition;
    }

    const seoBase = toJsonRecord(data.seo as unknown);
    const mergedCustomCode = {
      ...toJsonRecord(seoBase.customCode),
      ...toJsonRecord(data.customCode as unknown),
    };
    removeLegacyJsField(mergedCustomCode);

    const seo: JsonRecord = {
      ...seoBase,
      customCode: mergedCustomCode,
    };

    const created = await this.prisma.microsite_pages.create({
      data: {
        microsite_id: microsite.id,
        slug: slug,
        title: data.title,
        position,
        blocks: (data.blocks ?? []) as unknown as Prisma.InputJsonValue,
        seo: seo as Prisma.InputJsonValue,
        visibility: data.visibility,
      },
    });
    this.invalidatePublicCaches();
    return created;
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
      if (newSlug === 'home') {
        throw new BadRequestException('Slug "home" is reserved');
      }

      if (newSlug.length === 0) {
        const rootPage = await this.prisma.microsite_pages.findFirst({
          where: { microsite_id: page.microsite_id, slug: '' },
          select: { id: true },
        });
        if (rootPage && rootPage.id !== page.id) {
          throw new BadRequestException(
            'Only the homepage can use an empty slug',
          );
        }
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

    const existingSeo = toJsonRecord(page.seo);
    const incomingSeo = toJsonRecord(data.seo as unknown);
    const incomingCustomCode = toJsonRecord(data.customCode as unknown);
    const mergedSeo =
      data.seo || data.customCode
        ? {
            ...existingSeo,
            ...incomingSeo,
            customCode: {
              ...toJsonRecord(existingSeo.customCode),
              ...toJsonRecord(incomingSeo.customCode),
              ...incomingCustomCode,
            },
          }
        : undefined;
    if (mergedSeo?.customCode) {
      removeLegacyJsField(mergedSeo.customCode);
    }

    const updateData: Prisma.microsite_pagesUpdateInput = {};
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.blocks !== undefined) {
      updateData.blocks = data.blocks as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.microsite_pages.update({
      where: { id: pageId },
      data: {
        ...updateData,
        ...(mergedSeo
          ? { seo: mergedSeo as Prisma.InputJsonValue }
          : data.seo !== undefined
            ? { seo: data.seo as unknown as Prisma.InputJsonValue }
            : {}),
      },
    });
    this.invalidatePublicCaches();
    return updated;
  }

  async deletePage(eventId: string, pageId: string) {
    const page = await this.prisma.microsite_pages.findUnique({
      where: { id: pageId },
      include: { microsites: true },
    });
    if (!page || page.microsites.event_id !== eventId) {
      throw new NotFoundException('Page not found');
    }
    const deleted = await this.prisma.microsite_pages.delete({
      where: { id: pageId },
    });
    this.invalidatePublicCaches();
    return deleted;
  }

  // --- Admin: Publish & Rollback ---

  async publish(eventId: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
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
    this.invalidatePublicCaches();
    return result;
  }

  async unpublish(eventId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
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
    this.invalidatePublicCaches();
    return result;
  }

  async rollback(eventId: string, targetVersion: number) {
    const result = await this.prisma.$transaction(async (tx) => {
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
    this.invalidatePublicCaches();
    return result;
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
    const normalizedSlug = slug.trim().toLowerCase();
    const cached = this.getCachedEntry(
      this.publicMicrositeCache,
      normalizedSlug,
    );
    if (cached) {
      return cached;
    }

    const microsite = await this.prisma.microsites.findFirst({
      where: {
        published_version: { gt: 0 },
        // Microsites can be published independently from application windows,
        // but must not remain public after the event is archived (soft deleted).
        events: { is: { slug: normalizedSlug, status: { not: 'archived' } } },
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
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: { title: true, slug: true },
      }),
    ]);

    if (!versionRecord)
      throw new NotFoundException('Published version data missing');

    const rootPageSlug =
      pages.find((p) => p.slug.length === 0)?.slug ?? pages[0]?.slug;

    const response = {
      settings: versionRecord.settings,
      nav: pages.map((p) => ({
        label: p.title,
        href:
          p.slug === rootPageSlug
            ? `/events/${microsite.events.slug}`
            : `/events/${microsite.events.slug}/${p.slug}`,
      })),
      publishedVersion,
    };
    this.setCachedEntry(this.publicMicrositeCache, normalizedSlug, response);
    return response;
  }

  async getPublicPage(eventSlug: string, pageSlug: string) {
    const normalizedEventSlug = eventSlug.trim().toLowerCase();
    const normalizedSlug = String(pageSlug || '')
      .trim()
      .toLowerCase();
    const useRootPageAlias = !normalizedSlug || normalizedSlug === 'home';
    const cacheKey = `${normalizedEventSlug}:${useRootPageAlias ? '__home__' : normalizedSlug}`;
    const cachedPage = this.getCachedEntry(this.publicPageCache, cacheKey);
    if (cachedPage) {
      return cachedPage;
    }

    const microsite = await this.prisma.microsites.findFirst({
      where: {
        published_version: { gt: 0 },
        // Allow public microsite pages independent of application windows,
        // but hide them once the event is archived (soft deleted).
        events: {
          is: { slug: normalizedEventSlug, status: { not: 'archived' } },
        },
      },
      select: { id: true, published_version: true },
    });
    if (!microsite) throw new NotFoundException('Microsite not published');

    if (useRootPageAlias) {
      const rootByEmptySlug =
        await this.prisma.microsite_page_versions.findFirst({
        where: {
          microsite_id: microsite.id,
          version: microsite.published_version,
          visibility: 'PUBLIC',
          slug: '',
        },
      });
      if (rootByEmptySlug) {
        this.setCachedEntry(this.publicPageCache, cacheKey, rootByEmptySlug);
        return rootByEmptySlug;
      }
    }

    const page = await this.prisma.microsite_page_versions.findFirst({
      where: {
        microsite_id: microsite.id,
        version: microsite.published_version,
        visibility: 'PUBLIC',
        ...(useRootPageAlias ? {} : { slug: normalizedSlug }),
      },
      ...(useRootPageAlias
        ? { orderBy: [{ position: 'asc' }, { created_at: 'asc' }] }
        : {}),
    });

    if (!page) throw new NotFoundException('Page not found');

    this.setCachedEntry(this.publicPageCache, cacheKey, page);
    return page;
  }
}
