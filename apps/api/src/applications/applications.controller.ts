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
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationsService } from './applications.service';
import { StepStateService } from './step-state.service';
import { SubmissionsService } from './submissions.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  ApplicationFilterSchema,
  BulkApplicationTagsSchema,
  BulkAssignReviewerSchema,
  BulkDecisionDraftSchema,
  SaveDraftSchema,
  SubmitStepSchema,
  SetDecisionSchema,
  PublishDecisionsSchema,
} from '@event-platform/shared';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../common/prisma/prisma.service';
import { z } from 'zod';

const UpdateApplicationTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1)).max(100),
});

const UpdateApplicationNotesSchema = z.object({
  internalNotes: z.string().max(20000).nullable(),
});

/**
 * Applications Controller
 * Routes split between admin/reviewer and applicant views
 */
@Controller('events/:eventId/applications')
@UseGuards(PermissionsGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly stepStateService: StepStateService,
    private readonly submissionsService: SubmissionsService,
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // ADMIN/REVIEWER ENDPOINTS
  // ============================================================

  /**
   * List all applications for an event (admin/reviewer)
   */
  @Get()
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async findAll(@Param('eventId') eventId: string, @Query() query: any) {
    const filter = ApplicationFilterSchema.parse(query);
    return await this.applicationsService.findAll(eventId, filter);
  }

  /**
   * Export applications as CSV
   */
  @Get('export')
  @RequirePermission(Permission.EVENT_APPLICATION_EXPORT)
  async exportCsv(@Param('eventId') eventId: string, @Res() res: Response) {
    const result =
      await this.applicationsService.exportEventApplicationsCsv(eventId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.csv);
  }

  /**
   * Get my application for this event
   *
   * Keep this static route above `:applicationId` to avoid matching `/me`
   * as an application ID and incorrectly enforcing staff permissions.
   */
  @Get('me')
  @RequirePermission(Permission.SELF_APPLICATION_CREATE) // Any authenticated user
  async getMyApplication(@Param('eventId') eventId: string) {
    const application =
      await this.applicationsService.findMyApplication(eventId);
    return { data: application };
  }

  /**
   * Get application by ID (admin/reviewer)
   */
  @Get(':applicationId')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_BASIC)
  async findById(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
  ) {
    const application = await this.applicationsService.findById(
      eventId,
      applicationId,
    );
    return { data: application };
  }

  /**
   * Delete application by ID (organizer/admin)
   */
  @Delete(':applicationId')
  @RequirePermission(Permission.EVENT_APPLICATION_DELETE)
  async deleteById(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
  ) {
    await this.applicationsService.deleteById(eventId, applicationId);
    return { success: true };
  }

  /**
   * List messages delivered to the applicant for this application
   */
  @Get(':applicationId/messages')
  @RequirePermission(Permission.EVENT_MESSAGES_READ)
  async getApplicationMessages(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
  ) {
    const messages = await this.applicationsService.getApplicationMessages(
      eventId,
      applicationId,
    );
    return { data: messages };
  }

  /**
   * Get audit log entries for this application
   */
  @Get(':applicationId/audit')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_BASIC)
  async getApplicationAudit(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed =
      typeof limit === 'string' && limit.trim().length > 0
        ? Number(limit)
        : 100;
    const safeLimit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 200)
      : 100;
    const audit = await this.applicationsService.getApplicationAuditLog(
      eventId,
      applicationId,
      safeLimit,
    );
    return { data: audit };
  }

  /**
   * Replace application tags
   */
  @Patch(':applicationId/tags')
  @RequirePermission(Permission.EVENT_APPLICATION_TAGS_MANAGE)
  async updateTags(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: any,
  ) {
    const dto = UpdateApplicationTagsSchema.parse(body);
    const application = await this.applicationsService.updateTags(
      eventId,
      applicationId,
      dto.tags,
    );
    return { data: application };
  }

  /**
   * Update internal notes
   */
  @Patch(':applicationId/internal-notes')
  @RequirePermission(Permission.EVENT_APPLICATION_NOTES_MANAGE)
  async updateInternalNotes(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: any,
  ) {
    const dto = UpdateApplicationNotesSchema.parse(body);
    const application = await this.applicationsService.updateInternalNotes(
      eventId,
      applicationId,
      dto.internalNotes,
    );
    return { data: application };
  }

  /**
   * Bulk add/remove tags
   */
  @Post('bulk/tags')
  @RequirePermission(Permission.EVENT_APPLICATION_TAGS_MANAGE)
  async bulkUpdateTags(
    @Param('eventId') eventId: string,
    @Body() body: any,
  ) {
    const dto = BulkApplicationTagsSchema.parse(body);
    const result = await this.applicationsService.bulkUpdateTags(
      eventId,
      dto,
    );
    return { data: result };
  }

  /**
   * Bulk assign/unassign reviewer
   */
  @Post('bulk/assign-reviewer')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async bulkAssignReviewer(
    @Param('eventId') eventId: string,
    @Body() body: any,
  ) {
    const dto = BulkAssignReviewerSchema.parse(body);
    const result = await this.applicationsService.bulkAssignReviewer(
      eventId,
      dto,
    );
    return { data: result };
  }

  /**
   * Bulk draft decisions
   */
  @Post('bulk/decision-draft')
  @RequirePermission(Permission.EVENT_DECISION_DRAFT)
  async bulkDraftDecision(
    @Param('eventId') eventId: string,
    @Body() body: any,
  ) {
    const dto = BulkDecisionDraftSchema.parse(body);
    const result = await this.applicationsService.bulkDraftDecisions(
      eventId,
      dto,
    );
    return { data: result };
  }

  /**
   * Get submission versions for a step
   */
  @Get(':applicationId/steps/:stepId/versions')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_FULL)
  async getVersions(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
  ) {
    const versions = await this.submissionsService.getVersions(
      eventId,
      applicationId,
      stepId,
    );
    return { data: versions };
  }

  /**
   * Get effective data for a step (submission + patches)
   */
  @Get(':applicationId/steps/:stepId/effective')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_FULL)
  async getEffectiveData(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
  ) {
    const data = await this.submissionsService.getEffectiveData(
      eventId,
      applicationId,
      stepId,
    );
    return { data };
  }

  /**
   * Admin override: manually unlock a step
   */
  @Post(':applicationId/steps/:stepId/unlock')
  @RequirePermission(Permission.EVENT_STEP_OVERRIDE_UNLOCK)
  async manualUnlock(
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
  ) {
    await this.stepStateService.manualUnlock(applicationId, stepId);
    return { success: true };
  }

  // ============================================================
  // DECISIONS
  // ============================================================

  /**
   * Set decision for an application
   */
  @Patch(':applicationId/decision')
  @RequirePermission(
    Permission.EVENT_DECISION_PUBLISH,
    Permission.EVENT_DECISION_DRAFT,
  )
  async setDecision(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: any,
  ) {
    const dto = SetDecisionSchema.parse(body);
    const app = await this.applicationsService.setDecision(
      eventId,
      applicationId,
      dto.status,
      dto.draft,
      dto.templateId,
    );
    return { data: app };
  }

  /**
   * Bulk publish decisions
   */
  @Post('decisions/publish')
  @RequirePermission(Permission.EVENT_DECISION_PUBLISH)
  async publishDecisions(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = PublishDecisionsSchema.parse(body);
    // Note: For now only supporting explicit ID list
    const result = await this.applicationsService.publishDecisions(
      eventId,
      dto.applicationIds,
    );
    return { data: result };
  }

  // ============================================================
  // CONFIRMATION & TICKET
  // ============================================================

  /**
   * Confirm attendance (generate ticket)
   * Requires: Owner of application OR organizer
   */
  @Post(':applicationId/confirm')
  @RequirePermission(
    Permission.SELF_APPLICATION_READ,
    Permission.EVENT_APPLICATION_READ_BASIC,
  )
  async confirmAttendance(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
  ) {
    await this.verifyOwnershipOrOrganizer(eventId, applicationId);
    const result = await this.applicationsService.confirmAttendance(
      eventId,
      applicationId,
    );
    return { data: result };
  }

  /**
   * Get ticket (QR Token)
   * Requires: Owner of application OR organizer
   */
  @Get(':applicationId/ticket')
  @RequirePermission(
    Permission.SELF_APPLICATION_READ,
    Permission.EVENT_APPLICATION_READ_BASIC,
  )
  async getTicket(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
  ) {
    await this.verifyOwnershipOrOrganizer(eventId, applicationId);
    const result = await this.applicationsService.getTicket(
      eventId,
      applicationId,
    );
    return { data: result };
  }

  /**
   * Get completion credential links for an application
   * Requires: Owner of application OR organizer
   */
  @Get(':applicationId/completion-credential')
  @RequirePermission(
    Permission.SELF_APPLICATION_READ,
    Permission.EVENT_APPLICATION_READ_BASIC,
  )
  async getCompletionCredential(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
  ) {
    await this.verifyOwnershipOrOrganizer(eventId, applicationId);
    const result = await this.applicationsService.getCompletionCredentialForApplication(
      eventId,
      applicationId,
    );
    return { data: result };
  }

  /**
   * Helper: Verify current user owns application or is organizer
   */
  private async verifyOwnershipOrOrganizer(
    eventId: string,
    applicationId: string,
  ): Promise<void> {
    const actorId = this.cls.get('actorId');
    const isGlobalAdmin = this.cls.get('isGlobalAdmin');

    if (isGlobalAdmin) return;

    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { applicant_user_id: true },
    });

    if (!app) {
      throw new ForbiddenException('Application not found');
    }

    // Owner can access
    if (app.applicant_user_id === actorId) return;

    // Organizers can access
    const isOrganizer = await this.prisma.event_role_assignments.findFirst({
      where: {
        user_id: actorId,
        event_id: eventId,
        role: 'organizer',
        AND: [
          {
            OR: [{ access_start_at: null }, { access_start_at: { lte: new Date() } }],
          },
          {
            OR: [{ access_end_at: null }, { access_end_at: { gte: new Date() } }],
          },
        ],
      },
    });

    if (!isOrganizer) {
      throw new ForbiddenException("Cannot access another user's application");
    }
  }

  // ============================================================
  // APPLICANT ENDPOINTS (my application)
  // ============================================================

  /**
   * Create my application (start applying)
   */
  @Post('me')
  @RequirePermission(Permission.SELF_APPLICATION_CREATE)
  async createMyApplication(@Param('eventId') eventId: string) {
    const application = await this.applicationsService.create(eventId);
    return { data: application };
  }

  /**
   * Save draft for a step (autosave)
   */
  @Patch('me/steps/:stepId/draft')
  @RequirePermission(Permission.SELF_SUBMIT_STEP)
  async saveDraft(
    @Param('eventId') eventId: string,
    @Param('stepId') stepId: string,
    @Body() body: any,
  ) {
    const myApp = await this.applicationsService.findMyApplication(eventId);
    if (!myApp) throw new NotFoundException('Application not found');

    const dto = SaveDraftSchema.parse(body);
    const result = await this.submissionsService.saveDraft(
      myApp.id,
      stepId,
      dto,
    );
    return { data: result };
  }

  /**
   * Get current draft for a step
   */
  @Get('me/steps/:stepId/draft')
  @RequirePermission(Permission.SELF_SUBMIT_STEP)
  async getDraft(
    @Param('eventId') eventId: string,
    @Param('stepId') stepId: string,
  ) {
    const myApp = await this.applicationsService.findMyApplication(eventId);
    if (!myApp) throw new NotFoundException('Application not found');

    const draft = await this.submissionsService.getDraft(myApp.id, stepId);
    return { data: draft };
  }

  /**
   * Submit a step (final submission)
   */
  @Post('me/steps/:stepId/submit')
  @RequirePermission(Permission.SELF_SUBMIT_STEP)
  async submitStep(
    @Param('eventId') eventId: string,
    @Param('stepId') stepId: string,
    @Body() body: any,
  ) {
    const myApp = await this.applicationsService.findMyApplication(eventId);
    if (!myApp) throw new NotFoundException('Application not found');

    const dto = SubmitStepSchema.parse(body);
    const submission = await this.submissionsService.submit(
      eventId,
      myApp.id,
      stepId,
      dto,
    );
    return { data: submission };
  }
}
