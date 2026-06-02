import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventFilterDto, EventFilterSchema } from '@event-platform/shared';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * Public Events Controller
 * Routes: /public/events
 *
 * No authentication required - returns only published events
 */
@Controller('public/events')
export class PublicEventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * List published events (public, paginated)
   */
  @Get()
  @SkipCsrf()
  @SkipThrottle()
  async findAll(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filter = EventFilterSchema.parse(query);
    // The response embeds the time-derived lifecycleStatus (open/closed) and the
    // application_close_at deadline, which an admin can change at any moment
    // (e.g. extending a deadline). A long shared cache with stale-while-revalidate
    // kept serving a stale "closed" payload to some users for minutes after an
    // extension. Keep only a short shared window and force browsers to revalidate
    // so an extension is reflected within seconds. The origin is itself protected
    // by an in-memory cache (EVENTS_PUBLIC_CACHE_TTL_MS), invalidated on update.
    res.set('Cache-Control', 'public, max-age=0, s-maxage=15, must-revalidate');
    return await this.eventsService.findPublic(filter);
  }

  /**
   * Get event by slug (public)
   */
  @Get(':slug')
  @SkipCsrf()
  @SkipThrottle()
  async findBySlug(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Same reasoning as the list endpoint: this payload carries the derived
    // open/closed lifecycleStatus and the editable application_close_at deadline,
    // so it must not be served stale for minutes after an admin extends it.
    res.set('Cache-Control', 'public, max-age=0, s-maxage=15, must-revalidate');
    const event = await this.eventsService.findBySlug(slug);
    return { data: event };
  }
}
