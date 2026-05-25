import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Session,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  CloseEventBodySchema,
  Permission,
} from '@event-platform/shared';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { EventArchivalService } from './event-archival.service';

@Controller('admin')
@UseGuards(PermissionsGuard)
export class EventArchivalController {
  constructor(private readonly service: EventArchivalService) {}

  @Post('events/:eventId/close')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async closeEvent(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
    @Session() session: { user?: { id?: string } },
  ) {
    const actorUserId = session?.user?.id;
    if (!actorUserId) throw new UnauthorizedException();
    const dto = CloseEventBodySchema.parse(body);
    const result = await this.service.closeEvent(eventId, actorUserId, dto);
    return { data: result };
  }

  @Get('events/:eventId/archival-job/latest')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async getLatestJob(@Param('eventId') eventId: string) {
    const job = await this.service.getLatestJob(eventId);
    return { data: job };
  }

  @Get('events/:eventId/close-impact')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async getCloseImpact(@Param('eventId') eventId: string) {
    const data = await this.service.getCloseImpact(eventId);
    return { data };
  }

  @Get('users/:userId/applications')
  @RequirePermission(Permission.ADMIN_SEARCH_GLOBAL)
  async getUserApplications(@Param('userId') userId: string) {
    const data = await this.service.getUserApplicationsHistory(userId);
    return { data };
  }
}
