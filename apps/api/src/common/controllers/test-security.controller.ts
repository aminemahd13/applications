/**
 * Test Controller for E2E Security Tests
 *
 * Provides dummy routes for testing RBAC, event isolation, and global admin protection
 * WITHOUT waiting for Phase 3 routes to be implemented.
 *
 * These routes are prefixed with /_test and should be disabled in production.
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { Permission } from '@event-platform/shared';

@Controller()
export class TestSecurityController {
  /**
   * Event-scoped protected route
   * Requires EVENT_APPLICATION_LIST permission (available to organizer+reviewer)
   */
  @Get('events/:eventId/_test/protected')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async testEventProtected(@Param('eventId') eventId: string) {
    return {
      success: true,
      message: 'Event-scoped access granted',
      eventId,
    };
  }

  /**
   * Global admin-only route
   * Requires ADMIN_EVENTS_MANAGE permission (only global admin)
   */
  @Get('admin/_test/impersonate')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async testAdminOnly() {
    return {
      success: true,
      message: 'Global admin access granted',
    };
  }

  /**
   * Self route (any authenticated user)
   * Requires SELF_PROFILE_UPDATE permission
   */
  @Get('me/_test/profile')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.SELF_PROFILE_UPDATE)
  async testSelfRoute() {
    return {
      success: true,
      message: 'Self access granted',
    };
  }

  /**
   * Unprotected health check
   */
  @Get('_test/health')
  async testHealth() {
    return { status: 'ok' };
  }
}
