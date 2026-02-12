import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { SelfApplicationsController } from './self-applications.controller';
import { ApplicationsService } from './applications.service';
import { StepStateService } from './step-state.service';
import { SubmissionsService } from './submissions.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { FilesModule } from '../reviews/files.module';

@Module({
  imports: [WorkflowModule, FilesModule],
  controllers: [ApplicationsController, SelfApplicationsController],
  providers: [ApplicationsService, StepStateService, SubmissionsService],
  exports: [ApplicationsService, StepStateService, SubmissionsService],
})
export class ApplicationsModule {}
