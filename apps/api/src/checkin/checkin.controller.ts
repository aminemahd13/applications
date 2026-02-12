import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import { z } from 'zod';

const ScanTicketSchema = z.object({
  token: z.string(),
});
const ManualLookupSchema = z.object({
  query: z.string().min(1).max(200),
});
const ManualCheckinSchema = z.object({
  applicationId: z.string().uuid(),
});

@Controller('events/:eventId/check-in')
@UseGuards(PermissionsGuard)
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('stats')
  @RequirePermission(Permission.EVENT_CHECKIN_DASHBOARD_VIEW)
  async getStats(@Param('eventId') eventId: string) {
    return this.checkinService.getStats(eventId);
  }

  @Get('recent')
  @RequirePermission(Permission.EVENT_CHECKIN_DASHBOARD_VIEW)
  async getRecent(@Param('eventId') eventId: string) {
    return this.checkinService.getRecent(eventId);
  }

  @Post('scan')
  @RequirePermission(Permission.EVENT_CHECKIN_SCAN)
  async scanTicket(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = ScanTicketSchema.parse(body);
    const result = await this.checkinService.scanTicket(eventId, dto.token);
    return { data: result };
  }

  @Post('lookup')
  @RequirePermission(Permission.EVENT_CHECKIN_MANUAL_LOOKUP)
  async manualLookup(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = ManualLookupSchema.parse(body);
    const result = await this.checkinService.lookupAttendees(
      eventId,
      dto.query,
    );
    return { data: result };
  }

  @Post('manual')
  @RequirePermission(Permission.EVENT_CHECKIN_SCAN)
  async manualCheckin(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = ManualCheckinSchema.parse(body);
    const result = await this.checkinService.manualCheckin(
      eventId,
      dto.applicationId,
    );
    return { data: result };
  }

  @Post(':id/undo')
  @RequirePermission(Permission.EVENT_CHECKIN_UNDO)
  async undoCheckin(
    @Param('eventId') eventId: string,
    @Param('id') checkinId: string,
  ) {
    await this.checkinService.undoCheckin(eventId, checkinId);
    return { success: true };
  }
}
