import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { StepStatus, UnlockPolicy } from '@event-platform/shared';
import { StepStateService } from '../applications/step-state.service';

@Injectable()
export class WorkflowSchedulerService {
  private readonly logger = new Logger(WorkflowSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stepStateService: StepStateService,
  ) {}

  /**
   * Periodically check for steps that are scheduled to unlock based on date
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleScheduledUnlocks() {
    this.logger.log('Checking for scheduled step unlocks...');

    try {
      const now = new Date();
      const applicationIds = new Set<string>();
      const scanBatchSize = 500;
      let cursorId: string | undefined;

      while (true) {
        const stepsToUnlock =
          await this.prisma.application_step_states.findMany({
            where: {
              status: StepStatus.LOCKED,
              workflow_steps: {
                unlock_policy: UnlockPolicy.DATE_BASED,
                unlock_at: {
                  lte: now,
                },
              },
            },
            select: {
              id: true,
              application_id: true,
            },
            orderBy: { id: 'asc' },
            take: scanBatchSize,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          });

        if (stepsToUnlock.length === 0) {
          break;
        }

        for (const step of stepsToUnlock) {
          applicationIds.add(step.application_id);
        }

        cursorId = stepsToUnlock[stepsToUnlock.length - 1]?.id;
        if (stepsToUnlock.length < scanBatchSize) {
          break;
        }
      }

      if (applicationIds.size === 0) {
        return;
      }

      const uniqueApplicationIds = Array.from(applicationIds);
      this.logger.log(
        `Found ${uniqueApplicationIds.length} applications with unlockable steps.`,
      );

      // Delegate final unlock decisions to step-state logic so strict gating
      // and dependency rules are enforced consistently.
      const recomputeBatchSize = 40;
      for (
        let i = 0;
        i < uniqueApplicationIds.length;
        i += recomputeBatchSize
      ) {
        const batch = uniqueApplicationIds.slice(i, i + recomputeBatchSize);
        await Promise.all(
          batch.map((applicationId) =>
            this.stepStateService.recomputeAllStepStates(applicationId),
          ),
        );
      }

      this.logger.log(
        `Recomputed step states for ${uniqueApplicationIds.length} applications.`,
      );
    } catch (error) {
      this.logger.error(
        'Error processing scheduled unlocks',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
