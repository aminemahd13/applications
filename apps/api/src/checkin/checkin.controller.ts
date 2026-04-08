import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CheckinService } from './checkin.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CheckinAttendeesQuerySchema,
  CheckinCsvExportRequestSchema,
  Permission,
} from '@event-platform/shared';
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

  @Get('attendees')
  @RequirePermission(Permission.EVENT_CHECKIN_DASHBOARD_VIEW)
  async getAttendees(
    @Param('eventId') eventId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const dto = CheckinAttendeesQuerySchema.parse(query ?? {});
    return this.checkinService.listAttendees(eventId, dto);
  }

  @Post('export')
  @RequirePermission(Permission.EVENT_CHECKIN_DASHBOARD_VIEW)
  async exportAttendeesCsv(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const dto = CheckinCsvExportRequestSchema.parse(body ?? {});
    const result = await this.checkinService.exportAttendeesCsv(eventId, dto);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.csv);
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
