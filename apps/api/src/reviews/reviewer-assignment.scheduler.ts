import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReviewerAssignmentService } from './reviewer-assignment.service';

@Injectable()
export class ReviewerAssignmentSchedulerService {
  private readonly logger = new Logger(ReviewerAssignmentSchedulerService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewerAssignmentService: ReviewerAssignmentService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpiredReviewerAssignments() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const events = await this.prisma.review_queue_items.findMany({
        where: {
          completed_at: null,
          queue_mode: 'direct',
          assignment_expires_at: { lt: new Date() },
        },
        select: { event_id: true },
        distinct: ['event_id'],
      });

      for (const event of events) {
        const { released } =
          await this.reviewerAssignmentService.releaseExpiredDirectAssignments(
            event.event_id,
          );
        if (released > 0) {
          this.logger.log(
            `Released ${released} expired review assignments for event ${event.event_id}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to release expired reviewer assignments',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
