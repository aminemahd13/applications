import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '@event-platform/shared';
import { AdminService } from './admin.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@UseGuards(PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /* ============ Overview ============ */

  @Get('overview')
  @RequirePermission(Permission.ADMIN_SEARCH_GLOBAL)
  async getOverview() {
    return this.adminService.getOverview();
  }

  /* ============ Global Stats ============ */

  @Get('stats')
  @RequirePermission(Permission.ADMIN_SEARCH_GLOBAL)
  async getStats() {
    return this.adminService.getStats();
  }

  /* ============ Users & Applicants ============ */

  @Get('users')
  @RequirePermission(Permission.ADMIN_SEARCH_GLOBAL)
  async getUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('filter') filter?: string,
  ) {
    return this.adminService.getUsers({
      page: parseInt(page || '1', 10),
      pageSize: parseInt(pageSize || '25', 10),
      search: search || undefined,
      filter: filter || undefined,
    });
  }

  @Get('users/export')
  @RequirePermission(Permission.ADMIN_SEARCH_GLOBAL)
  async exportUsers(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('filter') filter?: string,
  ) {
    const result = await this.adminService.exportUsersCsv({
      search: search || undefined,
      filter: filter || undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.csv);
  }

  /* ============ Event Stats ============ */

  @Get('event-stats')
  @RequirePermission(Permission.ADMIN_SEARCH_GLOBAL)
  async getEventStats(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getEventStats({
      page: parseInt(page || '1', 10),
      pageSize: parseInt(pageSize || '25', 10),
      search: search || undefined,
      status: status || undefined,
    });
  }

  /* ============ Audit Log ============ */

  @Get('audit')
  @RequirePermission(Permission.ADMIN_AUDIT_VIEW)
  async getAuditLog(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.adminService.getAuditLog({
      page: parseInt(page || '1', 10),
      pageSize: parseInt(pageSize || '25', 10),
      search: search || undefined,
      category: category || undefined,
    });
  }

  /* ============ Global Roles ============ */

  @Get('roles')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async getRoles() {
    return this.adminService.getRoles();
  }

  @Post('roles')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async assignRole(
    @Body()
    body: {
      email: string;
      role: string;
      eventId?: string;
      startAt?: string | null;
      endAt?: string | null;
    },
  ) {
    return this.adminService.assignRole(body);
  }

  @Patch('roles/:id/access')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async updateRoleAccess(
    @Param('id') id: string,
    @Body() body: { startAt?: string | null; endAt?: string | null },
  ) {
    return this.adminService.updateRoleAccess(id, body);
  }

  @Post('roles/:id/resend-invite')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async resendRoleInvite(@Param('id') id: string) {
    return this.adminService.resendRoleInvite(id);
  }

  @Delete('roles/:id')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async removeRole(@Param('id') id: string) {
    await this.adminService.removeRole(id);
    return { success: true };
  }
}
