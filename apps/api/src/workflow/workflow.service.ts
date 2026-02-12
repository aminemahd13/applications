import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateWorkflowStepDto,
  UpdateWorkflowStepDto,
  ReorderWorkflowDto,
  UnlockPolicy,
  StepCategory,
  WorkflowValidationResult,
  WorkflowValidationIssue,
  WorkflowValidationCodes,
} from '@event-platform/shared';

export interface WorkflowStepResponse {
  id: string;
  eventId: string;
  stepIndex: number;
  category: string;
  title: string;
  instructionsRich: any;
  unlockPolicy: string;
  unlockAt: Date | null;
  reviewRequired: boolean;
  rejectBehavior: string;
  strictGating: boolean;
  sensitivityLevel: string;
  deadlineAt: Date | null;
  formVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transform DB step to API response
   */
  private toStepResponse(step: any): WorkflowStepResponse {
    return {
      id: step.id,
      eventId: step.event_id,
      stepIndex: step.step_index,
      category: step.category,
      title: step.title,
      instructionsRich: step.instructions_rich,
      unlockPolicy: step.unlock_policy,
      unlockAt: step.unlock_at,
      reviewRequired: step.review_required,
      rejectBehavior: step.reject_behavior,
      strictGating: step.strict_gating,
      sensitivityLevel: step.sensitivity_level,
      deadlineAt: step.deadline_at,
      formVersionId: step.form_version_id,
      createdAt: step.created_at,
      updatedAt: step.updated_at,
    };
  }

  /**
   * Get full workflow for an event (ordered steps)
   */
  async getWorkflow(eventId: string): Promise<WorkflowStepResponse[]> {
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
    });

    return steps.map((s) => this.toStepResponse(s));
  }

  /**
   * Get single step by ID
   */
  async getStep(
    eventId: string,
    stepId: string,
  ): Promise<WorkflowStepResponse> {
    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
    });

    if (!step) throw new NotFoundException('Workflow step not found');
    return this.toStepResponse(step);
  }

  /**
   * Create new workflow step (appended at end)
   */
  async createStep(
    eventId: string,
    dto: CreateWorkflowStepDto,
  ): Promise<WorkflowStepResponse> {
    // Verify event exists
    const event = await this.prisma.events.findFirst({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Get next step index
    const lastStep = await this.prisma.workflow_steps.findFirst({
      where: { event_id: eventId },
      orderBy: { step_index: 'desc' },
    });
    const nextIndex = (lastStep?.step_index ?? -1) + 1;

    if (dto.formVersionId) {
      await this.assertFormVersionInEvent(eventId, dto.formVersionId);
    }

    const step = await this.prisma.workflow_steps.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        step_index: nextIndex,
        category: dto.category || 'APPLICATION',
        title: dto.title,
        instructions_rich: dto.instructionsRich || {},
        unlock_policy: dto.unlockPolicy || 'AUTO_AFTER_PREV_SUBMITTED',
        unlock_at: dto.unlockAt,
        review_required: dto.reviewRequired ?? false,
        reject_behavior: dto.rejectBehavior || 'reject_resubmit_allowed',
        strict_gating: dto.strictGating ?? true,
        sensitivity_level: dto.sensitivityLevel || 'NORMAL',
        deadline_at: dto.deadlineAt,
        form_version_id: dto.formVersionId,
      },
    });

    return this.toStepResponse(step);
  }

  /**
   * Update workflow step
   */
  async updateStep(
    eventId: string,
    stepId: string,
    dto: UpdateWorkflowStepDto,
  ): Promise<WorkflowStepResponse> {
    await this.getStep(eventId, stepId); // Verify exists

    const data: any = { updated_at: new Date() };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.instructionsRich !== undefined)
      data.instructions_rich = dto.instructionsRich;
    if (dto.unlockPolicy !== undefined) data.unlock_policy = dto.unlockPolicy;
    if (dto.unlockAt !== undefined) data.unlock_at = dto.unlockAt;
    if (dto.reviewRequired !== undefined)
      data.review_required = dto.reviewRequired;
    if (dto.rejectBehavior !== undefined)
      data.reject_behavior = dto.rejectBehavior;
    if (dto.strictGating !== undefined) data.strict_gating = dto.strictGating;
    if (dto.sensitivityLevel !== undefined)
      data.sensitivity_level = dto.sensitivityLevel;
    if (dto.deadlineAt !== undefined) data.deadline_at = dto.deadlineAt;
    if (dto.formVersionId !== undefined && dto.formVersionId !== null) {
      await this.assertFormVersionInEvent(eventId, dto.formVersionId);
    }
    if (dto.formVersionId !== undefined)
      data.form_version_id = dto.formVersionId;

    const step = await this.prisma.workflow_steps.update({
      where: { id: stepId },
      data,
    });

    return this.toStepResponse(step);
  }

  /**
   * Delete workflow step
   */
  async deleteStep(eventId: string, stepId: string): Promise<void> {
    await this.getStep(eventId, stepId); // Verify exists

    await this.prisma.workflow_steps.delete({
      where: { id: stepId },
    });

    // Reindex remaining steps
    await this.reindexSteps(eventId);
  }

  /**
   * Reorder workflow steps (atomic transaction)
   */
  async reorderSteps(
    eventId: string,
    dto: ReorderWorkflowDto,
  ): Promise<WorkflowStepResponse[]> {
    const { stepIds } = dto;

    // Validate all steps belong to this event
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
    });

    const existingIds = new Set(steps.map((s) => s.id));
    for (const id of stepIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(
          `Step ${id} does not belong to this event`,
        );
      }
    }

    if (stepIds.length !== steps.length) {
      throw new BadRequestException(
        'Must include all steps in reorder request',
      );
    }

    // Check for duplicates
    if (new Set(stepIds).size !== stepIds.length) {
      throw new BadRequestException('Duplicate step IDs in reorder request');
    }

    // Update positions in transaction
    await this.prisma.$transaction(
      stepIds.map((id, index) =>
        this.prisma.workflow_steps.update({
          where: { id },
          data: { step_index: index, updated_at: new Date() },
        }),
      ),
    );

    return this.getWorkflow(eventId);
  }

  /**
   * Reindex steps to be contiguous (0, 1, 2, ...)
   */
  private async reindexSteps(eventId: string): Promise<void> {
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
    });

    await this.prisma.$transaction(
      steps.map((step, index) =>
        this.prisma.workflow_steps.update({
          where: { id: step.id },
          data: { step_index: index },
        }),
      ),
    );
  }

  private async assertFormVersionInEvent(
    eventId: string,
    formVersionId: string,
  ): Promise<void> {
    const formVersion = await this.prisma.form_versions.findFirst({
      where: {
        id: formVersionId,
        forms: {
          is: { event_id: eventId },
        },
      },
      select: { id: true },
    });

    if (!formVersion) {
      throw new BadRequestException(
        'Form version does not belong to this event',
      );
    }
  }

  /**
   * Validate workflow configuration
   * Returns errors (blocking) and warnings (advisory)
   */
  async validateWorkflow(eventId: string): Promise<WorkflowValidationResult> {
    const steps = await this.prisma.workflow_steps.findMany({
      where: { event_id: eventId },
      orderBy: { step_index: 'asc' },
    });

    const errors: WorkflowValidationIssue[] = [];
    const warnings: WorkflowValidationIssue[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const prevStep = i > 0 ? steps[i - 1] : null;

      // DATE_BASED requires unlock_at
      if (step.unlock_policy === 'DATE_BASED' && !step.unlock_at) {
        errors.push({
          stepId: step.id,
          stepTitle: step.title,
          code: WorkflowValidationCodes.MISSING_UNLOCK_DATE,
          message: 'DATE_BASED unlock policy requires unlock_at date',
        });
      }

      // AFTER_PREV_APPROVED requires previous step to be reviewable
      if (
        step.unlock_policy === 'AFTER_PREV_APPROVED' &&
        prevStep &&
        !prevStep.review_required
      ) {
        errors.push({
          stepId: step.id,
          stepTitle: step.title,
          code: WorkflowValidationCodes.APPROVAL_GATE_NO_REVIEW,
          message: `Step is gated on approval but previous step "${prevStep.title}" is not reviewable`,
        });
      }

      // AFTER_DECISION_ACCEPTED should be CONFIRMATION category
      if (
        step.unlock_policy === 'AFTER_DECISION_ACCEPTED' &&
        step.category !== 'CONFIRMATION'
      ) {
        warnings.push({
          stepId: step.id,
          stepTitle: step.title,
          code: WorkflowValidationCodes.DECISION_STEP_WRONG_CATEGORY,
          message:
            'Step with AFTER_DECISION_ACCEPTED policy should be CONFIRMATION category',
        });
      }

      // Non-INFO_ONLY steps should have a form
      if (step.category !== 'INFO_ONLY' && !step.form_version_id) {
        warnings.push({
          stepId: step.id,
          stepTitle: step.title,
          code: WorkflowValidationCodes.STEP_NO_FORM,
          message: 'Step has no form attached - applicants cannot submit data',
        });
      }

      // Check for position gaps
      if (step.step_index !== i) {
        warnings.push({
          stepId: step.id,
          stepTitle: step.title,
          code: WorkflowValidationCodes.POSITION_GAP,
          message: `Step position gap detected (expected ${i}, got ${step.step_index})`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
