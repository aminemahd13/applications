import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreatePatchDto, PatchVisibility } from '@event-platform/shared';

export interface PatchResponse {
  id: string;
  applicationId: string;
  stepId: string;
  baseVersionId: string;
  ops: any[];
  reason: string;
  visibility: PatchVisibility;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
}

@Injectable()
export class PatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Create admin change patch (anchored to base version)
   */
  async createPatch(
    eventId: string,
    applicationId: string,
    stepId: string,
    baseVersionId: string,
    dto: CreatePatchDto,
  ): Promise<PatchResponse> {
    const userId = this.cls.get('actorId');

    await this.ensureEventScope(eventId, applicationId, stepId);

    // Verify base version exists
    const version = await this.prisma.step_submission_versions.findFirst({
      where: {
        id: baseVersionId,
        application_id: applicationId,
        step_id: stepId,
      },
    });
    if (!version) {
      throw new NotFoundException('Base submission version not found');
    }

    // Check if this is the current latest version
    const latestVersion = await this.prisma.step_submission_versions.findFirst({
      where: { application_id: applicationId, step_id: stepId },
      orderBy: { version_number: 'desc' },
    });

    if (latestVersion && latestVersion.id !== baseVersionId) {
      throw new BadRequestException({
        code: 'PATCH_ON_OLD_VERSION',
        message:
          'Cannot create patch on old version. Applicant has resubmitted.',
        latestVersionId: latestVersion.id,
      });
    }

    this.validateOps(dto.ops);

    const patch = await this.prisma.admin_change_patches.create({
      data: {
        id: crypto.randomUUID(),
        application_id: applicationId,
        step_id: stepId,
        submission_version_id: baseVersionId,
        ops: dto.ops,
        reason: dto.reason,
        visibility: dto.visibility,
        is_active: true,
        created_by: userId,
      },
    });

    return this.toPatchResponse(patch);
  }

  /**
   * Get all patches for a step
   */
  async getPatches(
    eventId: string,
    applicationId: string,
    stepId: string,
  ): Promise<PatchResponse[]> {
    await this.ensureEventScope(eventId, applicationId, stepId);
    const patches = await this.prisma.admin_change_patches.findMany({
      where: { application_id: applicationId, step_id: stepId },
      orderBy: { created_at: 'desc' },
    });

    return patches.map((p) => this.toPatchResponse(p));
  }

  /**
   * Get patches for a specific version (only active ones)
   */
  async getActivePatches(
    eventId: string,
    applicationId: string,
    stepId: string,
    versionId: string,
  ): Promise<PatchResponse[]> {
    await this.ensureEventScope(eventId, applicationId, stepId);
    const patches = await this.prisma.admin_change_patches.findMany({
      where: {
        application_id: applicationId,
        step_id: stepId,
        submission_version_id: versionId,
        is_active: true,
      },
      orderBy: { created_at: 'asc' },
    });

    return patches.map((p) => this.toPatchResponse(p));
  }

  /**
   * Deactivate a patch
   */
  async deactivatePatch(eventId: string, patchId: string): Promise<void> {
    await this.ensurePatchEvent(eventId, patchId);
    await this.prisma.admin_change_patches.update({
      where: { id: patchId },
      data: { is_active: false },
    });
  }

  /**
   * Reapply patch to new version (creates new patch with audit trail)
   */
  async reapplyPatch(
    eventId: string,
    patchId: string,
    newVersionId: string,
  ): Promise<PatchResponse> {
    const userId = this.cls.get('actorId');

    const oldPatch = await this.prisma.admin_change_patches.findUnique({
      where: { id: patchId },
      include: { applications: { select: { event_id: true } } },
    });
    if (!oldPatch) throw new NotFoundException('Patch not found');
    if (oldPatch.applications.event_id !== eventId) {
      throw new NotFoundException('Patch not found');
    }

    // Verify new version exists
    const newVersion = await this.prisma.step_submission_versions.findUnique({
      where: { id: newVersionId },
      include: { applications: { select: { event_id: true } } },
    });
    if (!newVersion) throw new NotFoundException('New version not found');
    if (newVersion.applications.event_id !== eventId) {
      throw new NotFoundException('New version not found');
    }
    if (
      newVersion.application_id !== oldPatch.application_id ||
      newVersion.step_id !== oldPatch.step_id
    ) {
      throw new BadRequestException(
        'New version does not belong to the same application/step',
      );
    }

    // Deactivate old patch
    await this.prisma.admin_change_patches.update({
      where: { id: patchId },
      data: { is_active: false },
    });

    // Create new patch anchored to new version
    const newPatch = await this.prisma.admin_change_patches.create({
      data: {
        id: crypto.randomUUID(),
        application_id: oldPatch.application_id,
        step_id: oldPatch.step_id,
        submission_version_id: newVersionId,
        ops: oldPatch.ops as object,
        reason: `Reapplied from patch ${patchId}: ${oldPatch.reason}`,
        visibility: oldPatch.visibility as PatchVisibility,
        is_active: true,
        created_by: userId,
      },
    });

    return this.toPatchResponse(newPatch);
  }

  private toPatchResponse(patch: any): PatchResponse {
    return {
      id: patch.id,
      applicationId: patch.application_id,
      stepId: patch.step_id,
      baseVersionId: patch.submission_version_id,
      ops: patch.ops,
      reason: patch.reason,
      visibility: patch.visibility as PatchVisibility,
      isActive: patch.is_active,
      createdBy: patch.created_by,
      createdAt: patch.created_at,
    };
  }

  private async ensureEventScope(
    eventId: string,
    applicationId: string,
    stepId: string,
  ): Promise<void> {
    const app = await this.prisma.applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const step = await this.prisma.workflow_steps.findFirst({
      where: { id: stepId, event_id: eventId },
      select: { id: true },
    });
    if (!step) throw new NotFoundException('Step not found');
  }

  private async ensurePatchEvent(
    eventId: string,
    patchId: string,
  ): Promise<void> {
    const patch = await this.prisma.admin_change_patches.findUnique({
      where: { id: patchId },
      include: { applications: { select: { event_id: true } } },
    });
    if (!patch || patch.applications.event_id !== eventId) {
      throw new NotFoundException('Patch not found');
    }
  }

  private validateOps(ops: any[]) {
    if (!Array.isArray(ops)) {
      throw new BadRequestException('Patch ops must be an array');
    }
    for (const op of ops) {
      if (typeof op !== 'object' || !op || Array.isArray(op)) {
        throw new BadRequestException('Invalid patch operation');
      }
      if (
        !['replace', 'add', 'remove', 'test', 'move', 'copy'].includes(op.op)
      ) {
        throw new BadRequestException(`Invalid patch op: ${op.op}`);
      }
      if (typeof op.path !== 'string' || !op.path.startsWith('/')) {
        throw new BadRequestException(`Invalid patch path: ${op.path}`);
      }

      switch (op.op) {
        case 'add':
        case 'replace':
        case 'test':
          if (op.value === undefined) {
            throw new BadRequestException(
              `Patch op '${op.op}' requires a 'value' field`,
            );
          }
          break;
        case 'move':
        case 'copy':
          if (typeof op.from !== 'string' || !op.from.startsWith('/')) {
            throw new BadRequestException(
              `Patch op '${op.op}' requires a valid 'from' path`,
            );
          }
          break;
      }
    }
  }
}
