import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  EventMetricsQuerySchema,
  Permission,
} from '@event-platform/shared';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { EventMetricsService } from './event-metrics.service';

@Controller('events/:eventId/metrics')
@UseGuards(PermissionsGuard)
export class EventMetricsController {
  constructor(private readonly eventMetricsService: EventMetricsService) {}

  @Get('fields')
  @RequirePermission(Permission.EVENT_UPDATE)
  async getFields(@Param('eventId') eventId: string) {
    const data = await this.eventMetricsService.getFields(eventId);
    return { data };
  }

  @Post('query')
  @RequirePermission(Permission.EVENT_UPDATE)
  async query(@Param('eventId') eventId: string, @Body() body: unknown) {
    const dto = EventMetricsQuerySchema.parse(body ?? {});
    const data = await this.eventMetricsService.query(eventId, dto);
    return { data };
  }
}
