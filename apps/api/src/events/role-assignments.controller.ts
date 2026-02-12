import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleAssignmentsService } from './role-assignments.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  AssignRoleSchema,
  BulkRolesSchema,
  PaginationSchema,
} from '@event-platform/shared';

/**
 * Role Assignments Controller
 * Routes: /events/:eventId/roles
 *
 * Permission mapping:
 * - GET /events/:eventId/roles → admin.roles.manage OR event organizer
 * - POST /events/:eventId/roles → admin.roles.manage
 * - POST /events/:eventId/roles/bulk → admin.roles.manage
 * - DELETE /events/:eventId/roles/:assignmentId → admin.roles.manage
 */
@Controller('events/:eventId/roles')
@UseGuards(PermissionsGuard)
export class RoleAssignmentsController {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  /**
   * List role assignments for an event
   */
  @Get()
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async findAll(@Param('eventId') eventId: string, @Query() query: any) {
    const filter = PaginationSchema.parse(query);
    return await this.roleAssignmentsService.findAll(eventId, filter);
  }

  /**
   * Assign a single role
   */
  @Post()
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async assign(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = AssignRoleSchema.parse(body);
    const assignment = await this.roleAssignmentsService.assign(eventId, dto);
    return { data: assignment };
  }

  /**
   * Bulk assign/remove roles (idempotent)
   */
  @Post('bulk')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async bulk(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = BulkRolesSchema.parse(body);
    const result = await this.roleAssignmentsService.bulk(eventId, dto);
    return { data: result };
  }

  /**
   * Remove a specific role assignment
   */
  @Delete(':assignmentId')
  @RequirePermission(Permission.ADMIN_ROLES_MANAGE)
  async remove(
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    await this.roleAssignmentsService.remove(eventId, assignmentId);
    return { success: true };
  }
}
