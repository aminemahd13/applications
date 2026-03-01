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
import { FormsService } from './forms.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  CreateFormSchema,
  UpdateFormDraftSchema,
  PaginationSchema,
} from '@event-platform/shared';

/**
 * Forms Controller
 * Routes: /events/:eventId/forms
 *
 * Permissions:
 * - GET → event.forms.read (REV can read, ORG can read)
 * - POST/PATCH/publish → event.forms.manage (ORG only)
 */
@Controller('events/:eventId/forms')
@UseGuards(PermissionsGuard)
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  /**
   * List forms for an event
   */
  @Get()
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async findAll(@Param('eventId') eventId: string, @Query() query: any) {
    const filter = PaginationSchema.parse(query);
    return await this.formsService.findAll(eventId, filter);
  }

  /**
   * Get form by ID
   */
  @Get(':formId')
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async findById(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
  ) {
    const form = await this.formsService.findById(eventId, formId);
    return { data: form };
  }

  /**
   * Create new form (starts as draft)
   */
  @Post()
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async create(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = CreateFormSchema.parse(body);
    const form = await this.formsService.create(eventId, dto);
    return { data: form };
  }

  /**
   * Delete a form
   */
  @Delete(':formId')
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async deleteForm(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
  ) {
    await this.formsService.deleteForm(eventId, formId);
    return { success: true };
  }

  /**
   * Update form draft (schema/UI)
   */
  @Patch(':formId')
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async updateDraft(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
    @Body() body: any,
  ) {
    const dto = UpdateFormDraftSchema.parse(body);
    const form = await this.formsService.updateDraft(eventId, formId, dto);
    return { data: form };
  }

  /**
   * Publish form → creates immutable FormVersion
   */
  @Post(':formId/publish')
  @RequirePermission(Permission.EVENT_FORMS_PUBLISH)
  async publish(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
  ) {
    const version = await this.formsService.publish(eventId, formId);
    return { data: version };
  }

  /**
   * List all versions for a form
   */
  @Get(':formId/versions')
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async listVersions(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
  ) {
    const versions = await this.formsService.listVersions(eventId, formId);
    return { data: versions };
  }

  /**
   * Get specific version
   */
  @Get(':formId/versions/:versionId')
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async getVersion(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
    @Param('versionId') versionId: string,
  ) {
    const version = await this.formsService.getVersion(
      eventId,
      formId,
      versionId,
    );
    return { data: version };
  }

  /**
   * Delete specific immutable version (only when unused)
   */
  @Delete(':formId/versions/:versionId')
  @RequirePermission(Permission.EVENT_FORMS_MANAGE_DRAFT)
  async deleteVersion(
    @Param('eventId') eventId: string,
    @Param('formId') formId: string,
    @Param('versionId') versionId: string,
  ) {
    await this.formsService.deleteVersion(eventId, formId, versionId);
    return { success: true };
  }
}
