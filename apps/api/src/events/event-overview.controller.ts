import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';

/**
 * Event Overview Controller
 * Route: GET /events/:eventId/overview
 */
@Controller('events/:eventId')
@UseGuards(PermissionsGuard)
export class EventOverviewController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('overview')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async getOverview(@Param('eventId') eventId: string) {
    const data = await this.eventsService.getOverview(eventId);
    return { data };
  }
}
