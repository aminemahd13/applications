import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import {
  CreateEventDto,
  UpdateEventDto,
  EventFilterDto,
  PublishStatus,
  LifecycleStatus,
  PaginatedResponse,
} from '@event-platform/shared';

@Injectable()
export class EventsService {
  private static readonly DEFAULT_SORT_FIELD = 'created_at';
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private parseDateCursor(cursor?: string): Date | null {
    if (!cursor || typeof cursor !== 'string') return null;
    const parsed = new Date(cursor);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  /**
   * Compute lifecycle status from dates (derived, never stored)
   */
  private computeLifecycleStatus(event: {
    application_open_at: Date | null;
    application_close_at: Date | null;
  }): LifecycleStatus {
    const now = new Date();
    if (!event.application_open_at || now < event.application_open_at) {
      return LifecycleStatus.UPCOMING;
    }
    if (event.application_close_at && now > event.application_close_at) {
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
      lifecycleStatus: this.computeLifecycleStatus(event),
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

  /**
   * List events with pagination and filters (admin view)
   */
  async findAll(filter: EventFilterDto): Promise<PaginatedResponse<any>> {
    const {
      cursor,
      limit,
      sort,
      order,
      publishStatus,
      includeArchived,
      from,
      to,
      q,
    } = filter;

    const where: any = {};

    if (publishStatus) {
      where.status = publishStatus.toLowerCase();
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

    // Cursor-based pagination
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

    const events = await this.prisma.events.findMany({
      where,
      orderBy: { [sortField]: order },
      take: limit + 1, // Fetch one extra to check hasMore
    });

    const hasMore = events.length > limit;
    const data = hasMore ? events.slice(0, -1) : events;

    return {
      data: data.map((e) => this.toEventResponse(e)),
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
    return this.findAll({
      ...filter,
      publishStatus: PublishStatus.PUBLISHED,
    });
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
    const event = await this.prisma.events.findFirst({
      where: { slug, status: 'published' },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.toEventResponse(event);
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

    return this.toEventResponse(event);
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

    // Aggregate application counts by decision_status
    const statusCounts = await this.prisma.applications.groupBy({
      by: ['decision_status'],
      where: { event_id: eventId },
      _count: { id: true },
    });

    const statusMap: Record<string, number> = {};
    let totalApplications = 0;
    for (const row of statusCounts) {
      statusMap[row.decision_status] = row._count.id;
      totalApplications += row._count.id;
    }

    // Count step-states with status SUBMITTED (proxy for "in review")
    const submittedSteps = await this.prisma.application_step_states.count({
      where: {
        applications: { event_id: eventId },
        status: 'SUBMITTED',
      },
    });

    // Count checked-in
    const checkedIn = await this.prisma.attendance_records.count({
      where: {
        applications: { event_id: eventId },
        status: 'CHECKED_IN',
      },
    });

    // Step funnel: per workflow step, count totals + statuses
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
      select: {
        title: true,
        step_index: true,
        application_step_states: {
          select: { status: true },
        },
      },
    });

    const stepFunnel = steps.map((s) => {
      const states = s.application_step_states;
      return {
        stepTitle: s.title,
        total: states.length,
        submitted: states.filter((st) => st.status === 'SUBMITTED').length,
        approved: states.filter((st) => st.status === 'APPROVED').length,
        rejected: states.filter((st) => st.status === 'REJECTED_FINAL').length,
      };
    });

    return {
      totalApplications,
      submitted: statusMap['NONE'] ?? 0, // applications still in progress
      inReview: submittedSteps,
      accepted: statusMap['ACCEPTED'] ?? 0,
      rejected: statusMap['REJECTED'] ?? 0,
      waitlisted: statusMap['WAITLISTED'] ?? 0,
      pendingReviews: submittedSteps,
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

    return { success: true };
  }
}
