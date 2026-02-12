import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  CreateEventSchema,
  UpdateEventSchema,
  EventFilterSchema,
} from '@event-platform/shared';

/**
 * Admin Events Controller
 * Routes: /admin/events
 *
 * Permission mapping:
 * - POST /admin/events → admin.events.manage
 * - GET /admin/events → admin.events.manage
 * - GET /admin/events/:eventId → admin.events.manage (or event scope)
 * - PATCH /admin/events/:eventId → admin.events.manage (or event.update)
 * - POST /admin/events/:eventId/publish → admin.events.manage (or event.update)
 * - POST /admin/events/:eventId/archive → admin.events.manage
 * - DELETE /admin/events/:eventId → admin.events.manage
 * - DELETE /admin/events/:eventId/hard-delete → admin.events.manage
 */
@Controller('admin/events')
@UseGuards(PermissionsGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * Create new event
   */
  @Post()
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async create(@Body() body: Record<string, unknown>) {
    const title = body.title ?? body.name;
    const normalizedBody = {
      ...body,
      title,
    };
    const dto = CreateEventSchema.parse(normalizedBody);
    const event = await this.eventsService.create(dto);
    return { data: event };
  }

  /**
   * List all events (admin view with pagination)
   */
  @Get()
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async findAll(@Query() query: any) {
    const filter = EventFilterSchema.parse(query);
    return await this.eventsService.findAll(filter);
  }

  /**
   * Get single event by ID
   */
  @Get(':eventId')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE, Permission.EVENT_UPDATE)
  async findById(@Param('eventId') eventId: string) {
    const event = await this.eventsService.findById(eventId);
    return { data: event };
  }

  /**
   * Update event
   */
  @Patch(':eventId')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE, Permission.EVENT_UPDATE)
  async update(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const title = body.title ?? body.name;
    const applicationsCloseAt =
      body.applicationsCloseAt ?? body.applicationCloseAt;
    const normalizedBody = {
      ...body,
      title,
      applicationsCloseAt,
    };
    const dto = UpdateEventSchema.parse(normalizedBody);
    const event = await this.eventsService.update(eventId, dto);
    return { data: event };
  }

  /**
   * Publish event (set status to PUBLISHED)
   */
  @Post(':eventId/publish')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async publish(@Param('eventId') eventId: string) {
    const event = await this.eventsService.publish(eventId);
    return { data: event };
  }

  /**
   * Archive event
   */
  @Post(':eventId/archive')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async archive(@Param('eventId') eventId: string) {
    const event = await this.eventsService.archive(eventId);
    return { data: event };
  }

  /**
   * Soft delete event
   */
  @Delete(':eventId')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async delete(@Param('eventId') eventId: string) {
    return await this.eventsService.softDelete(eventId);
  }

  /**
   * Hard delete event (permanent)
   */
  @Delete(':eventId/hard-delete')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async hardDelete(@Param('eventId') eventId: string) {
    return await this.eventsService.hardDelete(eventId);
  }
}
