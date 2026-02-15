import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  CreateDecisionTemplateSchema,
  UpdateDecisionTemplateSchema,
} from '@event-platform/shared';

@Controller('events/:eventId/decision-templates')
@UseGuards(PermissionsGuard)
export class DecisionTemplatesController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @RequirePermission(Permission.EVENT_DECISION_DRAFT)
  async list(@Param('eventId') eventId: string) {
    const templates = await this.applicationsService.listDecisionTemplates(
      eventId,
    );
    return { data: templates };
  }

  @Post()
  @RequirePermission(Permission.EVENT_DECISION_DRAFT)
  async create(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = CreateDecisionTemplateSchema.parse(body);
    const template = await this.applicationsService.createDecisionTemplate(
      eventId,
      dto,
    );
    return { data: template };
  }

  @Patch(':templateId')
  @RequirePermission(Permission.EVENT_DECISION_DRAFT)
  async update(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: any,
  ) {
    const dto = UpdateDecisionTemplateSchema.parse(body);
    const template = await this.applicationsService.updateDecisionTemplate(
      eventId,
      templateId,
      dto,
    );
    return { data: template };
  }

  @Delete(':templateId')
  @RequirePermission(Permission.EVENT_DECISION_DRAFT)
  async remove(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
  ) {
    await this.applicationsService.deleteDecisionTemplate(eventId, templateId);
    return { success: true };
  }
}
