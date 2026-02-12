import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessagesService } from './messages.service';

@Injectable()
export class MessagesEmailSchedulerService {
  private readonly logger = new Logger(MessagesEmailSchedulerService.name);
  private isRunning = false;

  constructor(private readonly messagesService: MessagesService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processQueuedEmails() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const result = await this.messagesService.processQueuedEmails();
      if (result.attempted > 0) {
        this.logger.log(
          `Email worker batch complete: attempted=${result.attempted}, sent=${result.sent}, failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to process queued emails',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
