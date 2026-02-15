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
import { ReviewsService } from './reviews.service';
import { ReviewQueueService } from './review-queue.service';
import { PatchesService } from './patches.service';
import { FilesService } from './files.service'; // Added import
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  CreateReviewSchema,
  ReviewQueueFilterSchema,
  CreatePatchSchema,
  CreateReviewQueueSavedViewSchema,
  UpdateReviewQueueSavedViewSchema,
  VerifyFieldSchema, // Added import
} from '@event-platform/shared';

/**
 * Reviews Controller
 * Handles review actions, queue, and patches
 */
@Controller('events/:eventId')
@UseGuards(PermissionsGuard)
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly queueService: ReviewQueueService,
    private readonly patchesService: PatchesService,
    private readonly filesService: FilesService, // Injected
  ) {}

  // ============================================================
  // REVIEW QUEUE
  // ============================================================

  /**
   * Get review queue
   */
  @Get('review-queue')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async getQueue(@Param('eventId') eventId: string, @Query() query: any) {
    const filter = ReviewQueueFilterSchema.parse(query);
    return await this.queueService.getQueue(eventId, filter);
  }

  /**
   * Get queue stats
   */
  @Get('review-queue/stats')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async getStats(@Param('eventId') eventId: string) {
    const stats = await this.queueService.getStats(eventId);
    return { data: stats };
  }

  @Get('review-queue/views')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async listSavedViews(@Param('eventId') eventId: string) {
    const views = await this.queueService.listSavedViews(eventId);
    return { data: views };
  }

  @Post('review-queue/views')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async createSavedView(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = CreateReviewQueueSavedViewSchema.parse(body);
    const view = await this.queueService.createSavedView(eventId, dto);
    return { data: view };
  }

  @Patch('review-queue/views/:viewId')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async updateSavedView(
    @Param('eventId') eventId: string,
    @Param('viewId') viewId: string,
    @Body() body: any,
  ) {
    const dto = UpdateReviewQueueSavedViewSchema.parse(body);
    const view = await this.queueService.updateSavedView(eventId, viewId, dto);
    return { data: view };
  }

  @Delete('review-queue/views/:viewId')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async deleteSavedView(
    @Param('eventId') eventId: string,
    @Param('viewId') viewId: string,
  ) {
    await this.queueService.deleteSavedView(eventId, viewId);
    return { success: true };
  }

  @Get('review-queue/reviewers')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async listReviewers(@Param('eventId') eventId: string) {
    const reviewers = await this.queueService.listAvailableReviewers(eventId);
    return { data: reviewers };
  }

  /**
   * Assign reviewer
   */
  @Post('applications/:applicationId/assign')
  @RequirePermission(Permission.EVENT_APPLICATION_LIST)
  async assignReviewer(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: { reviewerId: string },
  ) {
    await this.queueService.assignReviewer(
      eventId,
      applicationId,
      body.reviewerId,
    );
    return { success: true };
  }

  // ============================================================
  // VERSION-TARGETED REVIEWS
  // ============================================================

  /**
   * Create review action (version-targeted)
   */
  @Post('applications/:applicationId/steps/:stepId/versions/:versionId/reviews')
  @RequirePermission(Permission.EVENT_STEP_REVIEW)
  async createReview(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
    @Param('versionId') versionId: string,
    @Body() body: any,
  ) {
    const dto = CreateReviewSchema.parse(body);
    const review = await this.reviewsService.createReview(
      eventId,
      applicationId,
      stepId,
      versionId,
      dto,
    );
    return { data: review };
  }

  /**
   * Get reviews for a version
   */
  @Get('applications/:applicationId/steps/:stepId/versions/:versionId/reviews')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_FULL)
  async getVersionReviews(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
    @Param('versionId') versionId: string,
  ) {
    const reviews = await this.reviewsService.getVersionReviews(
      eventId,
      applicationId,
      stepId,
      versionId,
    );
    return { data: reviews };
  }

  // ============================================================
  // NEEDS-INFO
  // ============================================================

  /**
   * Get needs-info requests for application
   */
  @Get('applications/:applicationId/needs-info')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_BASIC)
  async getNeedsInfo(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Query('stepId') stepId?: string,
  ) {
    const requests = await this.reviewsService.getNeedsInfo(
      eventId,
      applicationId,
      stepId,
    );
    return { data: requests };
  }

  /**
   * Delete needs-info request
   */
  @Delete('needs-info/:needsInfoId')
  @RequirePermission(Permission.EVENT_APPLICATION_DELETE)
  async deleteNeedsInfo(
    @Param('eventId') eventId: string,
    @Param('needsInfoId') needsInfoId: string,
  ) {
    await this.reviewsService.deleteNeedsInfo(eventId, needsInfoId);
    return { success: true };
  }

  // ============================================================
  // ADMIN PATCHES
  // ============================================================

  /**
   * Create admin patch (anchored to version)
   */
  @Post('applications/:applicationId/steps/:stepId/versions/:versionId/patches')
  @RequirePermission(Permission.EVENT_STEP_PATCH)
  async createPatch(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
    @Param('versionId') versionId: string,
    @Body() body: any,
  ) {
    const dto = CreatePatchSchema.parse(body);
    const patch = await this.patchesService.createPatch(
      eventId,
      applicationId,
      stepId,
      versionId,
      dto,
    );
    return { data: patch };
  }

  /**
   * Get patches for a step
   */
  @Get('applications/:applicationId/steps/:stepId/patches')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_FULL)
  async getPatches(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
  ) {
    const patches = await this.patchesService.getPatches(
      eventId,
      applicationId,
      stepId,
    );
    return { data: patches };
  }

  /**
   * Deactivate a patch
   */
  @Delete('patches/:patchId')
  @RequirePermission(Permission.EVENT_STEP_PATCH)
  async deactivatePatch(
    @Param('eventId') eventId: string,
    @Param('patchId') patchId: string,
  ) {
    await this.patchesService.deactivatePatch(eventId, patchId);
    return { success: true };
  }

  /**
   * Reapply patch to new version
   */
  @Post('patches/:patchId/reapply')
  @RequirePermission(Permission.EVENT_STEP_PATCH)
  async reapplyPatch(
    @Param('eventId') eventId: string,
    @Param('patchId') patchId: string,
    @Body() body: { newVersionId: string },
  ) {
    const patch = await this.patchesService.reapplyPatch(
      eventId,
      patchId,
      body.newVersionId,
    );
    return { data: patch };
  }

  // ============================================================
  // FIELD VERIFICATIONS
  // ============================================================

  /**
   * Verify field (generic: files or data)
   */
  @Post(
    'applications/:applicationId/steps/:stepId/versions/:versionId/verifications',
  )
  @RequirePermission(Permission.EVENT_STEP_REVIEW)
  async verifyField(
    @Param('eventId') eventId: string,
    @Param('applicationId') applicationId: string,
    @Param('stepId') stepId: string,
    @Param('versionId') versionId: string,
    @Body() body: any,
  ) {
    // We import VerifyFieldSchema from shared but need to update imports first if missing
    // For now, assuming it's available or I'll add the import.
    const dto = VerifyFieldSchema.parse(body);

    // Note: We need access to FilesService here.
    // ReviewsController already injects ReviewsService, QueueService, PatchesService.
    // We need to inject FilesService or expose it via ReviewsService.
    // ReviewsService imports FilesService, so we can expose a delegate method there OR just inject FilesService here.
    // Injecting FilesService is cleaner for now.
    return await this.filesService.verifyField(
      eventId,
      applicationId,
      stepId,
      versionId,
      dto.fieldKey,
      dto.fileObjectId,
      dto.status,
      dto.reason,
      dto.notesInternal,
    );
  }
}
