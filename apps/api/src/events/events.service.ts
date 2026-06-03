import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { ClsService } from 'nestjs-cls';
import {
  CreateEventDto,
  CloneEventDto,
  UpdateEventDto,
  EventFilterDto,
  PublishStatus,
  LifecycleStatus,
  PaginatedResponse,
} from '@event-platform/shared';

@Injectable()
export class EventsService {
  private static readonly DEFAULT_SORT_FIELD = 'created_at';
  private static readonly PUBLIC_CACHE_TTL_MS = Math.max(
    Number(process.env.EVENTS_PUBLIC_CACHE_TTL_MS ?? 30_000),
    5_000,
  );
  private static readonly PUBLIC_CACHE_MAX_ENTRIES = Math.max(
    Number(process.env.EVENTS_PUBLIC_CACHE_MAX_ENTRIES ?? 500),
    100,
  );
  private readonly logger = new Logger(EventsService.name);
  private readonly publicEventsListCache = new Map<
    string,
    { value: PaginatedResponse<any>; expiresAt: number }
  >();
  private readonly publicEventBySlugCache = new Map<
    string,
    { value: any; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly cls: ClsService,
  ) {}

  private getActorIdOrThrow(): string {
    const actorId = this.cls.get('actorId');
    if (typeof actorId !== 'string' || actorId.trim().length === 0) {
      throw new ForbiddenException('Authentication required');
    }
    return actorId;
  }

  private toPrismaJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  /**
   * Deep-copy a step's conditional `deadline_rules`, rewriting every
   * `field_answer` leaf's `stepId` to the cloned step's id. Steps are cloned in
   * `step_index` order and a `field_answer` leaf may only reference an earlier
   * step, so the referenced id is always present in `idMap` by the time we get
   * here. References that are somehow unmapped are dropped (their leaf is
   * removed) so a clone never carries a dangling cross-event step id.
   */
  private remapDeadlineRulesStepIds(
    rules: unknown,
    idMap: Map<string, string>,
  ): unknown {
    if (!Array.isArray(rules) || rules.length === 0) return [];

    const remapNode = (node: any): any | null => {
      if (node && node.type === 'group') {
        const children = Array.isArray(node.children)
          ? node.children.map(remapNode).filter((c: any) => c !== null)
          : [];
        return { ...node, children };
      }
      if (node && node.kind === 'field_answer') {
        const mapped = idMap.get(node.stepId);
        if (!mapped) return null;
        return { ...node, stepId: mapped };
      }
      return node;
    };

    return rules
      .map((rule: any) => {
        if (!rule || !rule.condition) return null;
        return { ...rule, condition: remapNode(rule.condition) };
      })
      .filter((r: any) => r !== null);
  }

  private parseDateCursor(cursor?: string): Date | null {
    if (!cursor || typeof cursor !== 'string') return null;
    const parsed = new Date(cursor);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private buildEventQueryContext(
    filter: EventFilterDto,
    options?: { forcePublishStatus?: PublishStatus },
  ) {
    const {
      cursor,
      sort,
      publishStatus,
      includeArchived,
      from,
      to,
      q,
    } = filter;

    const where: any = {};
    const effectivePublishStatus = options?.forcePublishStatus ?? publishStatus;

    if (effectivePublishStatus) {
      where.status = effectivePublishStatus.toLowerCase();
    } else if (!includeArchived) {
      where.status = { not: 'archived' };
    }
    if (from) where.application_open_at = { gte: from };
    if (to) where.application_close_at = { lte: to };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const sortField = sort ?? EventsService.DEFAULT_SORT_FIELD;
    if (cursor) {
      if (sortField === EventsService.DEFAULT_SORT_FIELD) {
        const cursorDate = this.parseDateCursor(cursor);
        if (cursorDate) {
          where.created_at = { lt: cursorDate };
        } else {
          where.id = { lt: cursor };
        }
      } else {
        where.id = { lt: cursor };
      }
    }

    return { where, sortField };
  }

  private normalizePublicFilterForCache(filter: EventFilterDto): string {
    return JSON.stringify({
      cursor: filter.cursor ?? null,
      limit: filter.limit,
      sort: filter.sort ?? null,
      order: filter.order,
      from: filter.from ? filter.from.toISOString() : null,
      to: filter.to ? filter.to.toISOString() : null,
      q: filter.q?.trim().toLowerCase() ?? null,
    });
  }

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
      expiresAt: now + EventsService.PUBLIC_CACHE_TTL_MS,
    });

    if (cache.size <= EventsService.PUBLIC_CACHE_MAX_ENTRIES) return;

    for (const [cacheKey, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(cacheKey);
      }
      if (cache.size <= EventsService.PUBLIC_CACHE_MAX_ENTRIES) {
        return;
      }
    }

    const overflow = cache.size - EventsService.PUBLIC_CACHE_MAX_ENTRIES;
    if (overflow <= 0) return;

    let removed = 0;
    for (const cacheKey of cache.keys()) {
      cache.delete(cacheKey);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  private invalidatePublicCaches() {
    this.publicEventsListCache.clear();
    this.publicEventBySlugCache.clear();
  }

  private rewriteStorageKey(
    value: string,
    assetKeyMap: Map<string, string>,
  ): string {
    const directMatch = assetKeyMap.get(value);
    if (directMatch) return directMatch;

    if (!value.startsWith('/')) {
      return value;
    }

    const normalized = value.slice(1);
    const mapped = assetKeyMap.get(normalized);
    return mapped ? `/${mapped}` : value;
  }

  private normalizeStorageKeyReference(value: string): string {
    return value.startsWith('/') ? value.slice(1) : value;
  }

  private collectReferencedMicrositeStorageKeys(
    sourceMicrosite:
      | {
          settings: unknown;
          microsite_pages: Array<{ blocks: unknown; seo: unknown }>;
        }
      | null,
    sourceEventId: string,
  ): Set<string> {
    const referencedKeys = new Set<string>();
    const sourcePrefix = `events/${sourceEventId}/microsite/`;

    const visit = (value: unknown) => {
      if (typeof value === 'string') {
        const normalized = this.normalizeStorageKeyReference(value.trim());
        if (normalized.startsWith(sourcePrefix)) {
          referencedKeys.add(normalized);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);
        }
        return;
      }

      if (!value || typeof value !== 'object') {
        return;
      }

      for (const child of Object.values(value)) {
        visit(child);
      }
    };

    if (!sourceMicrosite) {
      return referencedKeys;
    }

    visit(sourceMicrosite.settings);
    for (const page of sourceMicrosite.microsite_pages) {
      visit(page.blocks);
      visit(page.seo);
    }

    return referencedKeys;
  }

  private ensureReferencedMicrositeAssetsHaveFileRows(
    referencedKeys: Set<string>,
    sourceFiles: Array<{ storage_key: string }>,
  ) {
    if (referencedKeys.size === 0) {
      return;
    }

    const availableKeys = new Set(
      sourceFiles
        .map((file) => file.storage_key.trim())
        .filter((key) => key.length > 0),
    );
    const missingKeys = Array.from(referencedKeys).filter(
      (key) => !availableKeys.has(key),
    );

    if (missingKeys.length > 0) {
      throw new ConflictException(
        this.buildMissingMicrositeAssetsMessage(
          'missing file records',
          missingKeys,
        ),
      );
    }
  }

  private isMissingStorageObjectError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as {
      name?: string;
      Code?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    return (
      maybeError.name === 'NoSuchKey' ||
      maybeError.Code === 'NoSuchKey' ||
      maybeError.code === 'NoSuchKey' ||
      maybeError.$metadata?.httpStatusCode === 404
    );
  }

  private buildMissingMicrositeAssetsMessage(
    reason: string,
    keys: string[],
  ): string {
    const preview = keys.slice(0, 3).join(', ');
    const suffix =
      keys.length > 3 ? ` (+${keys.length - 3} more)` : '';
    return `Source microsite has ${reason}: ${preview}${suffix}. Repair the source microsite before cloning.`;
  }

  private rewriteStorageKeysInJson(
    value: unknown,
    assetKeyMap: Map<string, string>,
  ): unknown {
    if (typeof value === 'string') {
      return this.rewriteStorageKey(value, assetKeyMap);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.rewriteStorageKeysInJson(item, assetKeyMap));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const rewritten: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      rewritten[key] = this.rewriteStorageKeysInJson(child, assetKeyMap);
    }
    return rewritten;
  }

  private async copyMicrositeStorageObjects(
    sourceFiles: Array<{ storage_key: string; mime_type: string }>,
    sourceEventId: string,
    targetEventId: string,
    requiredSourceKeys: Set<string>,
  ): Promise<{ assetKeyMap: Map<string, string>; copiedKeys: string[] }> {
    const sourcePrefix = `events/${sourceEventId}/microsite/`;
    const targetPrefix = `events/${targetEventId}/microsite/`;
    const assetKeyMap = new Map<string, string>();
    const copiedKeys: string[] = [];

    for (const sourceFile of sourceFiles) {
      const sourceKey = sourceFile.storage_key.trim();
      if (!sourceKey || !sourceKey.startsWith(sourcePrefix)) {
        continue;
      }

      const suffix = sourceKey.slice(sourcePrefix.length);
      const targetKey = `${targetPrefix}${suffix}`;

      try {
        const body = await this.storageService.getObjectBuffer(sourceKey);
        await this.storageService.putObjectBuffer(
          targetKey,
          body,
          sourceFile.mime_type || 'application/octet-stream',
        );
        assetKeyMap.set(sourceKey, targetKey);
        copiedKeys.push(targetKey);
      } catch (error) {
        if (this.isMissingStorageObjectError(error)) {
          if (requiredSourceKeys.has(sourceKey)) {
            await this.cleanupCopiedStorageObjects(copiedKeys, targetEventId);
            throw new ConflictException(
              this.buildMissingMicrositeAssetsMessage(
                'missing storage objects',
                [sourceKey],
              ),
            );
          }

          this.logger.warn(
            `Skipping missing microsite asset during clone for source event ${sourceEventId}: ${sourceKey}`,
          );
          continue;
        }

        await this.cleanupCopiedStorageObjects(copiedKeys, targetEventId);
        throw error;
      }
    }

    return { assetKeyMap, copiedKeys };
  }

  private async cleanupCopiedStorageObjects(
    copiedKeys: string[],
    targetEventId: string,
  ) {
    if (copiedKeys.length === 0) {
      return;
    }

    const uniqueKeys = Array.from(new Set(copiedKeys));
    const results = await Promise.allSettled(
      uniqueKeys.map((key) => this.storageService.deleteObject(key)),
    );
    const failedCount = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    if (failedCount > 0) {
      this.logger.warn(
        `Clone cleanup for event ${targetEventId} failed to delete ${failedCount}/${uniqueKeys.length} storage objects`,
      );
    }
  }

  /**
   * Compute lifecycle status from dates (derived, never stored)
   */
  private computeLifecycleStatus(
    applicationOpenAt: Date | null,
    applicationCloseAt: Date | null,
  ): LifecycleStatus {
    const now = new Date();
    if (!applicationOpenAt || now < applicationOpenAt) {
      return LifecycleStatus.UPCOMING;
    }
    if (applicationCloseAt && now > applicationCloseAt) {
      return LifecycleStatus.ENDED;
    }
    return LifecycleStatus.RUNNING;
  }

  /**
   * Transform DB event to API response with derived fields
   */
  private toEventResponse(event: any) {
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      seriesKey: event.series_key,
      editionLabel: event.edition_label,
      status: event.status,
      lifecycleStatus: this.computeLifecycleStatus(
        event.application_open_at,
        event.application_close_at,
      ),
      applicationOpenAt: event.application_open_at,
      applicationCloseAt: event.application_close_at,
      timezone: event.timezone,
      startAt: event.start_at,
      endAt: event.end_at,
      venueName: event.venue_name,
      venueAddress: event.venue_address,
      venueMapUrl: event.venue_map_url,
      description: event.description,
      capacity: event.capacity,
      requiresEmailVerification: event.requires_email_verification,
      format: event.format,
      decisionConfig: event.decision_config,
      checkinConfig: event.checkin_config,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    };
  }

  private toPublicEventResponse(event: any) {
    // The deadline shown publicly (and used to derive open/closed) is the FIRST
    // workflow step's BASE deadline — the date by which a new applicant must
    // complete the first step. Conditional per-step `deadline_rules` are
    // intentionally NOT applied here: there is no applicant (profile / answers)
    // to evaluate them against yet, so the personalized deadline only appears
    // once the user starts applying. The legacy event-level application_close_at
    // is no longer used for gating or display.
    const effectiveCloseAt =
      (Array.isArray(event.workflow_steps)
        ? event.workflow_steps[0]?.deadline_at
        : null) ?? null;
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      seriesKey: event.series_key,
      editionLabel: event.edition_label,
      status: event.status,
      lifecycleStatus: this.computeLifecycleStatus(
        event.application_open_at,
        effectiveCloseAt,
      ),
      applicationOpenAt: event.application_open_at,
      applicationCloseAt: effectiveCloseAt,
      timezone: event.timezone,
      startAt: event.start_at,
      endAt: event.end_at,
      venueName: event.venue_name,
      venueAddress: event.venue_address,
      venueMapUrl: event.venue_map_url,
      description: event.description,
      capacity: event.capacity,
      requiresEmailVerification: event.requires_email_verification,
      format: event.format,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    };
  }

  /**
   * List events with pagination and filters (admin view)
   */
  async findAll(filter: EventFilterDto): Promise<PaginatedResponse<any>> {
    const { limit, order } = filter;
    const { where, sortField } = this.buildEventQueryContext(filter);

    const events = await this.prisma.events.findMany({
      where,
      orderBy: { [sortField]: order },
      take: limit + 1, // Fetch one extra to check hasMore
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        application_open_at: true,
        application_close_at: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            applications: true,
            event_role_assignments: true,
          },
        },
      },
    });

    const hasMore = events.length > limit;
    const data = hasMore ? events.slice(0, -1) : events;

    return {
      data: data.map((event) => ({
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
        isPublished: event.status === 'published',
        lifecycleStatus: this.computeLifecycleStatus(
        event.application_open_at,
        event.application_close_at,
      ),
        applicationOpenAt: event.application_open_at,
        applicationCloseAt: event.application_close_at,
        applicationCount: event._count.applications,
        staffCount: event._count.event_role_assignments,
        createdAt: event.created_at,
        updatedAt: event.updated_at,
      })),
      meta: {
        nextCursor: hasMore
          ? sortField === EventsService.DEFAULT_SORT_FIELD
            ? data[data.length - 1].created_at.toISOString()
            : data[data.length - 1].id
          : null,
        hasMore,
      },
    };
  }

  /**
   * List published events only (public view)
   */
  async findPublic(filter: EventFilterDto): Promise<PaginatedResponse<any>> {
    const publicFilter: EventFilterDto = {
      ...filter,
      publishStatus: PublishStatus.PUBLISHED,
    };
    const cacheKey = this.normalizePublicFilterForCache(publicFilter);
    const cached = this.getCachedEntry(this.publicEventsListCache, cacheKey);
    if (cached) {
      return cached;
    }

    const { limit, order } = publicFilter;
    const { where, sortField } = this.buildEventQueryContext(publicFilter, {
      forcePublishStatus: PublishStatus.PUBLISHED,
    });
    const events = await this.prisma.events.findMany({
      where,
      orderBy: { [sortField]: order },
      take: limit + 1,
      select: {
        id: true,
        title: true,
        slug: true,
        series_key: true,
        edition_label: true,
        status: true,
        application_open_at: true,
        application_close_at: true,
        timezone: true,
        start_at: true,
        end_at: true,
        venue_name: true,
        venue_address: true,
        venue_map_url: true,
        description: true,
        capacity: true,
        requires_email_verification: true,
        format: true,
        created_at: true,
        updated_at: true,
        workflow_steps: {
          orderBy: { step_index: 'asc' },
          take: 1,
          select: { deadline_at: true },
        },
      },
    });

    const hasMore = events.length > limit;
    const data = hasMore ? events.slice(0, -1) : events;
    const response: PaginatedResponse<any> = {
      data: data.map((event) => this.toPublicEventResponse(event)),
      meta: {
        nextCursor: hasMore
          ? sortField === EventsService.DEFAULT_SORT_FIELD
            ? data[data.length - 1].created_at.toISOString()
            : data[data.length - 1].id
          : null,
        hasMore,
      },
    };

    this.setCachedEntry(this.publicEventsListCache, cacheKey, response);
    return response;
  }

  /**
   * Get single event by ID
   */
  async findById(id: string) {
    const event = await this.prisma.events.findFirst({
      where: { id },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.toEventResponse(event);
  }

  /**
   * Get single event by slug (public)
   */
  async findBySlug(slug: string) {
    const normalizedSlug = slug.trim().toLowerCase();
    const cached = this.getCachedEntry(
      this.publicEventBySlugCache,
      normalizedSlug,
    );
    if (cached) {
      return cached;
    }

    const event = await this.prisma.events.findFirst({
      where: { slug: normalizedSlug, status: 'published' },
      select: {
        id: true,
        title: true,
        slug: true,
        series_key: true,
        edition_label: true,
        status: true,
        application_open_at: true,
        application_close_at: true,
        timezone: true,
        start_at: true,
        end_at: true,
        venue_name: true,
        venue_address: true,
        venue_map_url: true,
        description: true,
        capacity: true,
        requires_email_verification: true,
        format: true,
        created_at: true,
        updated_at: true,
        workflow_steps: {
          orderBy: { step_index: 'asc' },
          take: 1,
          select: { deadline_at: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const response = this.toPublicEventResponse(event);
    this.setCachedEntry(this.publicEventBySlugCache, normalizedSlug, response);
    return response;
  }

  /**
   * Create new event
   */
  async create(dto: CreateEventDto) {
    // Check slug uniqueness
    const existing = await this.prisma.events.findFirst({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Event with this slug already exists');
    }

    const event = await this.prisma.events.create({
      data: {
        id: crypto.randomUUID(),
        title: dto.title,
        slug: dto.slug,
        series_key: dto.seriesKey,
        edition_label: dto.editionLabel,
        status: 'draft',
        timezone: dto.timezone || 'UTC',
        format: 'in_person', // Default
        application_open_at: dto.applicationsOpenAt,
        application_close_at: dto.applicationsCloseAt,
      },
    });

    this.invalidatePublicCaches();
    return this.toEventResponse(event);
  }

  async clone(dto: CloneEventDto) {
    const actorId = this.getActorIdOrThrow();

    const sourceEvent = await this.prisma.events.findUnique({
      where: { id: dto.sourceEventId },
    });
    if (!sourceEvent) {
      throw new NotFoundException('Source event not found');
    }

    const existing = await this.prisma.events.findFirst({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Event with this slug already exists');
    }

    const targetEventId = crypto.randomUUID();
    const [sourceForms, sourceWorkflowSteps, sourceMicrosite, sourceMicrositeFiles] =
      await Promise.all([
        this.prisma.forms.findMany({
          where: { event_id: dto.sourceEventId },
          orderBy: { created_at: 'asc' },
          include: {
            form_versions: {
              orderBy: { version_number: 'desc' },
            },
          },
        }),
        this.prisma.workflow_steps.findMany({
          where: { event_id: dto.sourceEventId },
          orderBy: { step_index: 'asc' },
        }),
        this.prisma.microsites.findUnique({
          where: { event_id: dto.sourceEventId },
          include: {
            microsite_pages: {
              orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
            },
          },
        }),
        this.prisma.file_objects.findMany({
          where: {
            event_id: dto.sourceEventId,
            storage_key: {
              startsWith: `events/${dto.sourceEventId}/microsite/`,
            },
          },
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            storage_key: true,
            original_filename: true,
            mime_type: true,
            size_bytes: true,
            sha256: true,
            sensitivity: true,
            virus_scan_status: true,
            expires_at: true,
            status: true,
            media_optimization_status: true,
            media_optimization_attempts: true,
            media_optimized_at: true,
            media_optimization_last_error: true,
          },
        }),
      ]);

    const sourceFormVersionToFormId = new Map<string, string>();
    for (const form of sourceForms) {
      for (const version of form.form_versions) {
        sourceFormVersionToFormId.set(version.id, form.id);
      }
    }

    const referencedMicrositeKeys = this.collectReferencedMicrositeStorageKeys(
      sourceMicrosite,
      dto.sourceEventId,
    );
    this.ensureReferencedMicrositeAssetsHaveFileRows(
      referencedMicrositeKeys,
      sourceMicrositeFiles,
    );

    const { assetKeyMap, copiedKeys } = await this.copyMicrositeStorageObjects(
      sourceMicrositeFiles,
      dto.sourceEventId,
      targetEventId,
      referencedMicrositeKeys,
    );

    try {
      const clonedEvent = await this.prisma.$transaction(async (tx) => {
        const event = await tx.events.create({
          data: {
            id: targetEventId,
            title: dto.title,
            slug: dto.slug,
            series_key: sourceEvent.series_key,
            edition_label: sourceEvent.edition_label,
            timezone: sourceEvent.timezone,
            start_at: sourceEvent.start_at,
            end_at: sourceEvent.end_at,
            venue_name: sourceEvent.venue_name,
            venue_address: sourceEvent.venue_address,
            venue_map_url: sourceEvent.venue_map_url,
            description: sourceEvent.description,
            capacity: sourceEvent.capacity,
            requires_email_verification: sourceEvent.requires_email_verification,
            format: sourceEvent.format,
            application_open_at: sourceEvent.application_open_at,
            application_close_at: sourceEvent.application_close_at,
            status: 'draft',
            decision_config: this.toPrismaJson(sourceEvent.decision_config),
            checkin_config: this.toPrismaJson(sourceEvent.checkin_config),
            is_system_site: false,
          },
        });

        const sourceFormIdToClonedLatestVersionId = new Map<string, string>();

        for (const sourceForm of sourceForms) {
          const clonedFormId = crypto.randomUUID();
          const latestVersion = sourceForm.form_versions[0] ?? null;

          await tx.forms.create({
            data: {
              id: clonedFormId,
              event_id: targetEventId,
              name: sourceForm.name,
              draft_schema: this.toPrismaJson(
                latestVersion ? latestVersion.schema : sourceForm.draft_schema,
              ),
              draft_ui: this.toPrismaJson(
                latestVersion ? latestVersion.ui : sourceForm.draft_ui,
              ),
            },
          });

          if (latestVersion) {
            const clonedLatestVersionId = crypto.randomUUID();
            await tx.form_versions.create({
              data: {
                id: clonedLatestVersionId,
                form_id: clonedFormId,
                version_number: 1,
                schema: this.toPrismaJson(latestVersion.schema),
                ui: this.toPrismaJson(latestVersion.ui),
                published_by: actorId,
              },
            });
            sourceFormIdToClonedLatestVersionId.set(
              sourceForm.id,
              clonedLatestVersionId,
            );
          }
        }

        const sourceStepIdToClonedId = new Map<string, string>();
        for (const sourceStep of sourceWorkflowSteps) {
          let mappedFormVersionId: string | null = null;
          if (sourceStep.form_version_id) {
            const sourceFormId = sourceFormVersionToFormId.get(
              sourceStep.form_version_id,
            );
            if (sourceFormId) {
              mappedFormVersionId =
                sourceFormIdToClonedLatestVersionId.get(sourceFormId) ?? null;
            }
          }

          const clonedStepId = crypto.randomUUID();
          await tx.workflow_steps.create({
            data: {
              id: clonedStepId,
              event_id: targetEventId,
              step_index: sourceStep.step_index,
              category: sourceStep.category,
              title: sourceStep.title,
              instructions_rich: this.toPrismaJson(
                sourceStep.instructions_rich,
              ),
              unlock_policy: sourceStep.unlock_policy,
              unlock_at: sourceStep.unlock_at,
              review_required: sourceStep.review_required,
              reviewer_roles_allowed: this.toPrismaJson(
                sourceStep.reviewer_roles_allowed,
              ),
              reject_behavior: sourceStep.reject_behavior,
              strict_gating: sourceStep.strict_gating,
              allow_next_steps_while_revising:
                sourceStep.allow_next_steps_while_revising,
              revision_deadline_at: sourceStep.revision_deadline_at,
              sensitivity_level: sourceStep.sensitivity_level,
              hidden: sourceStep.hidden,
              allow_applicant_modification: sourceStep.allow_applicant_modification,
              modification_scope: sourceStep.modification_scope,
              deadline_at: sourceStep.deadline_at,
              deadline_rules: this.remapDeadlineRulesStepIds(
                (sourceStep as { deadline_rules?: unknown }).deadline_rules,
                sourceStepIdToClonedId,
              ) as any,
              max_revision_cycles: sourceStep.max_revision_cycles,
              form_version_id: mappedFormVersionId,
            },
          });
          sourceStepIdToClonedId.set(sourceStep.id, clonedStepId);
        }

        if (sourceMicrosite) {
          const clonedMicrosite = await tx.microsites.create({
            data: {
              event_id: targetEventId,
              settings: this.rewriteStorageKeysInJson(
                sourceMicrosite.settings,
                assetKeyMap,
              ) as any,
              published_version: 0,
            },
          });

          if (sourceMicrosite.microsite_pages.length > 0) {
            await tx.microsite_pages.createMany({
              data: sourceMicrosite.microsite_pages.map((page) => ({
                microsite_id: clonedMicrosite.id,
                slug: page.slug,
                title: page.title,
                position: page.position,
                blocks: this.rewriteStorageKeysInJson(
                  page.blocks,
                  assetKeyMap,
                ) as any,
                seo: this.rewriteStorageKeysInJson(page.seo, assetKeyMap) as any,
                visibility: page.visibility,
              })),
            });
          }
        }

        const clonedFileRows = sourceMicrositeFiles.flatMap((sourceFile) => {
          const sourceKey = sourceFile.storage_key.trim();
          const targetKey = assetKeyMap.get(sourceKey);
          if (!targetKey) {
            return [];
          }

          return [
            {
              id: crypto.randomUUID(),
              event_id: targetEventId,
              storage_key: targetKey,
              original_filename: sourceFile.original_filename,
              mime_type: sourceFile.mime_type,
              size_bytes: sourceFile.size_bytes,
              sha256: sourceFile.sha256,
              sensitivity: sourceFile.sensitivity,
              virus_scan_status: sourceFile.virus_scan_status,
              created_by: actorId,
              expires_at: sourceFile.expires_at,
              status: sourceFile.status,
              media_optimization_status: sourceFile.media_optimization_status,
              media_optimization_attempts:
                sourceFile.media_optimization_attempts,
              media_optimized_at: sourceFile.media_optimized_at,
              media_optimization_last_error:
                sourceFile.media_optimization_last_error,
            },
          ];
        });

        if (clonedFileRows.length > 0) {
          await tx.file_objects.createMany({
            data: clonedFileRows,
          });
        }

        return event;
      });

      this.invalidatePublicCaches();
      return this.toEventResponse(clonedEvent);
    } catch (error) {
      await this.cleanupCopiedStorageObjects(copiedKeys, targetEventId);
      throw error;
    }
  }

  /**
   * Update event
   */
  async update(id: string, dto: UpdateEventDto) {
    const eventBefore = await this.prisma.events.findUnique({ where: { id } });
    if (!eventBefore) throw new NotFoundException('Event not found');

    // PROTECTION: System sites cannot change slug or format
    if (eventBefore.is_system_site) {
      if (dto.slug && dto.slug !== eventBefore.slug) {
        throw new ConflictException('Cannot change slug of a System Site');
      }
      if (dto.publishStatus === PublishStatus.ARCHIVED) {
        throw new ConflictException('Cannot archive a System Site');
      }
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) {
      // Check slug uniqueness if changing
      const existing = await this.prisma.events.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('Event with this slug already exists');
      }
      data.slug = dto.slug;
    }
    if (dto.seriesKey !== undefined) data.series_key = dto.seriesKey;
    if (dto.editionLabel !== undefined) data.edition_label = dto.editionLabel;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.applicationsOpenAt !== undefined)
      data.application_open_at = dto.applicationsOpenAt;
    if (dto.applicationsCloseAt !== undefined)
      data.application_close_at = dto.applicationsCloseAt;
    if (dto.publishStatus !== undefined) {
      const status = dto.publishStatus.toLowerCase();
      if (eventBefore.is_system_site && status === 'archived') {
        throw new ConflictException('Cannot archive a System Site');
      }
      data.status = status;
    }
    if (dto.decisionConfig !== undefined)
      data.decision_config = dto.decisionConfig;
    if (dto.checkinConfig !== undefined)
      data.checkin_config = dto.checkinConfig;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.venueName !== undefined) data.venue_name = dto.venueName;
    if (dto.startAt !== undefined) data.start_at = dto.startAt;
    if (dto.endAt !== undefined) data.end_at = dto.endAt;
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.requiresEmailVerification !== undefined)
      data.requires_email_verification = dto.requiresEmailVerification;

    const event = await this.prisma.events.update({
      where: { id },
      data,
    });

    this.invalidatePublicCaches();
    return this.toEventResponse(event);
  }

  /**
   * Publish event (set status to published)
   */
  async publish(id: string) {
    const event = await this.prisma.events.update({
      where: { id },
      data: { status: 'published' },
    });
    this.invalidatePublicCaches();
    return this.toEventResponse(event);
  }

  /**
   * Archive event
   */
  async archive(id: string) {
    const event = await this.prisma.events.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (event.is_system_site) {
      throw new ConflictException('Cannot archive a System Site');
    }

    const updated = await this.prisma.events.update({
      where: { id },
      data: { status: 'archived' },
    });
    this.invalidatePublicCaches();
    return this.toEventResponse(updated);
  }

  /**
   * Unarchive event
   */
  async unarchive(id: string) {
    const event = await this.prisma.events.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (event.status !== 'archived') {
      throw new ConflictException('Only archived events can be unarchived');
    }

    const updated = await this.prisma.events.update({
      where: { id },
      data: { status: 'draft' },
    });
    this.invalidatePublicCaches();
    return this.toEventResponse(updated);
  }

  /**
   * Event overview with aggregated stats
   */
  async getOverview(eventId: string) {
    const event = await this.prisma.events.findFirst({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    const submissionStatuses = [
      'SUBMITTED',
      'NEEDS_REVISION',
      'APPROVED',
      'REJECTED_FINAL',
    ] as const;
    const submissionStatusSet = new Set<string>(submissionStatuses);

    const [
      totalApplications,
      statusCounts,
      submittedApplications,
      inReviewApplications,
      pendingReviews,
      checkedIn,
      steps,
    ] = await Promise.all([
      this.prisma.applications.count({
        where: { event_id: eventId },
      }),
      this.prisma.applications.groupBy({
        by: ['decision_status'],
        where: { event_id: eventId },
        _count: { id: true },
      }),
      this.prisma.application_step_states.groupBy({
        by: ['application_id'],
        where: {
          applications: { event_id: eventId },
          status: { in: [...submissionStatuses] },
        },
        _count: { id: true },
      }),
      this.prisma.application_step_states.groupBy({
        by: ['application_id'],
        where: {
          applications: { event_id: eventId },
          status: 'SUBMITTED',
        },
        _count: { id: true },
      }),
      this.prisma.application_step_states.count({
        where: {
          applications: { event_id: eventId },
          status: 'SUBMITTED',
        },
      }),
      this.prisma.attendance_records.count({
        where: {
          applications: { event_id: eventId },
          status: 'CHECKED_IN',
        },
      }),
      this.prisma.workflow_steps.findMany({
        where: { event_id: eventId },
        orderBy: { step_index: 'asc' },
        select: {
          title: true,
          step_index: true,
          application_step_states: {
            select: { status: true },
          },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.decision_status] = row._count.id;
    }

    const stepFunnel = steps.map((s) => {
      const states = s.application_step_states;
      return {
        stepTitle: s.title,
        total: states.filter((st) => st.status !== 'LOCKED').length,
        submitted: states.filter((st) => submissionStatusSet.has(st.status))
          .length,
        approved: states.filter((st) => st.status === 'APPROVED').length,
        rejected: states.filter((st) => st.status === 'REJECTED_FINAL').length,
      };
    });

    return {
      totalApplications,
      submitted: submittedApplications.length,
      inReview: inReviewApplications.length,
      accepted: statusMap['ACCEPTED'] ?? 0,
      rejected: statusMap['REJECTED'] ?? 0,
      waitlisted: statusMap['WAITLISTED'] ?? 0,
      pendingReviews,
      checkedIn,
      recentActivity: [],
      stepFunnel,
    };
  }

  /**
   * Soft delete is not supported in current schema.
   * For now, we archive instead.
   */
  async softDelete(id: string) {
    const event = await this.prisma.events.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (event.is_system_site) {
      throw new ConflictException('Cannot delete a System Site');
    }

    // Proceed to archive
    await this.archive(id);
    return { success: true };
  }

  /**
   * Hard delete event and associated data.
   */
  async hardDelete(id: string) {
    const event = await this.prisma.events.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (event.is_system_site) {
      throw new ConflictException('Cannot delete a System Site');
    }

    const fileObjects = await this.prisma.file_objects.findMany({
      where: { event_id: id },
      select: { storage_key: true },
    });
    const storageKeys = fileObjects
      .map((file) => file.storage_key.trim())
      .filter((key) => key.length > 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.audit_logs.deleteMany({ where: { event_id: id } });
      await tx.events.delete({ where: { id } });
    });

    if (storageKeys.length > 0) {
      const uniqueKeys = Array.from(new Set(storageKeys));
      const deletions = await Promise.allSettled(
        uniqueKeys.map((key) => this.storageService.deleteObject(key)),
      );
      const failedCount = deletions.filter(
        (result) => result.status === 'rejected',
      ).length;
      if (failedCount > 0) {
        this.logger.warn(
          `Hard delete removed event ${id} but failed to delete ${failedCount}/${uniqueKeys.length} storage objects`,
        );
      }
    }

    this.invalidatePublicCaches();
    return { success: true };
  }
}
