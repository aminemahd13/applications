import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import {
  StaffMessagesController,
  InboxController,
} from './messages.controller';
import { MessagesEmailSchedulerService } from './messages-email.scheduler';

@Module({
  controllers: [StaffMessagesController, InboxController],
  providers: [MessagesService, MessagesEmailSchedulerService],
  exports: [MessagesService],
})
export class MessagesModule {}
