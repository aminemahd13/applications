import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import {
  StaffMessagesController,
  InboxController,
  AdminAnnouncementsController,
} from './messages.controller';
import { MessagesEmailSchedulerService } from './messages-email.scheduler';

@Module({
  controllers: [StaffMessagesController, InboxController, AdminAnnouncementsController],
  providers: [MessagesService, MessagesEmailSchedulerService],
  exports: [MessagesService],
})
export class MessagesModule {}
