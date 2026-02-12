import { Controller, Get, UseGuards } from '@nestjs/common';
import { Permission } from '@event-platform/shared';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Controller('applications')
@UseGuards(PermissionsGuard)
export class SelfApplicationsController {
  constructor(
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  @RequirePermission(Permission.SELF_APPLICATION_READ)
  async listMyApplications() {
    const actorId = this.cls.get('actorId');

    const applications = await this.prisma.applications.findMany({
      where: { applicant_user_id: actorId },
      orderBy: { updated_at: 'desc' },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            slug: true,
            start_at: true,
            venue_name: true,
          },
        },
        application_step_states: {
          include: {
            workflow_steps: {
              select: {
                title: true,
                step_index: true,
                deadline_at: true,
              },
            },
          },
        },
      },
    });

    const data = applications.map((app) => {
      const stepStates = app.application_step_states ?? [];
      const stepsTotal = stepStates.length;
      const stepsCompleted = stepStates.filter(
        (s) => s.status === 'APPROVED' || s.status === 'SUBMITTED',
      ).length;

      const actionableStep = [...stepStates]
        .sort(
          (a, b) =>
            (a.workflow_steps?.step_index ?? 9999) -
            (b.workflow_steps?.step_index ?? 9999),
        )
        .find((s) => s.status === 'UNLOCKED' || s.status === 'NEEDS_REVISION');

      return {
        id: app.id,
        eventId: app.events.id,
        eventTitle: app.events.title,
        eventSlug: app.events.slug,
        eventStartDate: app.events.start_at,
        eventLocation: app.events.venue_name,
        decisionStatus:
          app.decision_published_at != null ? app.decision_status : 'NONE',
        stepsCompleted,
        stepsTotal,
        nextAction: actionableStep
          ? actionableStep.status === 'NEEDS_REVISION'
            ? `Revision requested: ${actionableStep.workflow_steps?.title ?? 'Step'}`
            : `Complete: ${actionableStep.workflow_steps?.title ?? 'Step'}`
          : undefined,
        nextDeadline: actionableStep?.workflow_steps?.deadline_at,
      };
    });

    return { applications: data };
  }
}
