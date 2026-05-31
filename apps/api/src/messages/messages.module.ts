import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import {
  StaffMessagesController,
  InboxController,
  AdminAnnouncementsController,
} from './messages.controller';
import { MessagesEmailSchedulerService } from './messages-email.scheduler';
import { EffectiveAnswersService } from './effective-answers.service';

@Module({
  controllers: [StaffMessagesController, InboxController, AdminAnnouncementsController],
  providers: [
    MessagesService,
    MessagesEmailSchedulerService,
    EffectiveAnswersService,
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
