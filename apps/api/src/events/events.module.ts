import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicEventsController } from './public-events.controller';
import { EventOverviewController } from './event-overview.controller';
import { RoleAssignmentsController } from './role-assignments.controller';
import { RoleAssignmentsService } from './role-assignments.service';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [
    EventsController,
    PublicEventsController,
    EventOverviewController,
    RoleAssignmentsController,
  ],
  providers: [EventsService, RoleAssignmentsService],
  exports: [EventsService, RoleAssignmentsService],
})
export class EventsModule {}
