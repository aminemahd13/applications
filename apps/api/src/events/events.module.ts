import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicEventsController } from './public-events.controller';
import { EventOverviewController } from './event-overview.controller';
import { EventMetricsController } from './event-metrics.controller';
import { EventMetricsService } from './event-metrics.service';
import { RoleAssignmentsController } from './role-assignments.controller';
import { RoleAssignmentsService } from './role-assignments.service';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [
    EventsController,
    PublicEventsController,
    EventOverviewController,
    EventMetricsController,
    RoleAssignmentsController,
  ],
  providers: [EventsService, EventMetricsService, RoleAssignmentsService],
  exports: [EventsService, EventMetricsService, RoleAssignmentsService],
})
export class EventsModule {}
