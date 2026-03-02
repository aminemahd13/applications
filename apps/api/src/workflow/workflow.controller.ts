import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@event-platform/shared';
import {
  CreateWorkflowStepSchema,
  UpdateWorkflowStepSchema,
  ReorderWorkflowSchema,
} from '@event-platform/shared';

/**
 * Workflow Controller
 * Routes: /events/:eventId/workflow
 *
 * Permissions:
 * - GET → event.workflow.read (ORG, REV can read)
 * - POST/PATCH/DELETE/reorder → event.workflow.manage (ORG only)
 */
@Controller('events/:eventId/workflow')
@UseGuards(PermissionsGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  /**
   * Get full workflow (ordered steps)
   */
  @Get()
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async getWorkflow(@Param('eventId') eventId: string) {
    const steps = await this.workflowService.getWorkflow(eventId);
    return { data: steps };
  }

  /**
   * Get lightweight workflow step list for selectors
   */
  @Get('steps')
  @RequirePermission(
    Permission.EVENT_APPLICATION_LIST,
    Permission.EVENT_MESSAGES_SEND,
    Permission.EVENT_STEP_OVERRIDE_UNLOCK,
    Permission.EVENT_WORKFLOW_MANAGE,
  )
  async listSteps(@Param('eventId') eventId: string) {
    const steps = await this.workflowService.getWorkflow(eventId);
    return {
      data: steps.map((step) => ({
        id: step.id,
        title: step.title,
        stepIndex: step.stepIndex,
        category: step.category,
      })),
    };
  }

  /**
   * Get single step
   */
  @Get('steps/:stepId')
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async getStep(
    @Param('eventId') eventId: string,
    @Param('stepId') stepId: string,
  ) {
    const step = await this.workflowService.getStep(eventId, stepId);
    return { data: step };
  }

  /**
   * Create new workflow step
   */
  @Post('steps')
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async createStep(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = CreateWorkflowStepSchema.parse(body);
    const step = await this.workflowService.createStep(eventId, dto);
    return { data: step };
  }

  /**
   * Update workflow step
   */
  @Patch('steps/:stepId')
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async updateStep(
    @Param('eventId') eventId: string,
    @Param('stepId') stepId: string,
    @Body() body: any,
  ) {
    const dto = UpdateWorkflowStepSchema.parse(body);
    const step = await this.workflowService.updateStep(eventId, stepId, dto);
    return { data: step };
  }

  /**
   * Delete workflow step
   */
  @Delete('steps/:stepId')
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async deleteStep(
    @Param('eventId') eventId: string,
    @Param('stepId') stepId: string,
  ) {
    await this.workflowService.deleteStep(eventId, stepId);
    return { success: true };
  }

  /**
   * Reorder workflow steps (atomic)
   */
  @Put('reorder')
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async reorderSteps(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = ReorderWorkflowSchema.parse(body);
    const steps = await this.workflowService.reorderSteps(eventId, dto);
    return { data: steps };
  }

  /**
   * Validate workflow configuration
   * Returns errors (blocking) and warnings (advisory)
   */
  @Get('validate')
  @RequirePermission(Permission.EVENT_WORKFLOW_MANAGE)
  async validateWorkflow(@Param('eventId') eventId: string) {
    const result = await this.workflowService.validateWorkflow(eventId);
    return { data: result };
  }
}
