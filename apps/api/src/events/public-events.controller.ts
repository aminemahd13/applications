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
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
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
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    const event = await this.eventsService.findBySlug(slug);
    return { data: event };
  }
}
