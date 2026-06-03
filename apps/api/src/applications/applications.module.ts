import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { SelfApplicationsController } from './self-applications.controller';
import { ApplicationsService } from './applications.service';
import { StepStateService } from './step-state.service';
import { SubmissionsService } from './submissions.service';
import { StepDeadlineService } from './step-deadline.service';
import { DecisionTemplatesController } from './decision-templates.controller';
import { CompletionCredentialsController } from './completion-credentials.controller';
import { EffectiveAnswersService } from '../messages/effective-answers.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { FilesModule } from '../reviews/files.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [WorkflowModule, FilesModule, CertificatesModule],
  controllers: [
    ApplicationsController,
    SelfApplicationsController,
    DecisionTemplatesController,
    CompletionCredentialsController,
  ],
  providers: [
    ApplicationsService,
    StepStateService,
    SubmissionsService,
    StepDeadlineService,
    EffectiveAnswersService,
  ],
  exports: [ApplicationsService, StepStateService, SubmissionsService],
})
export class ApplicationsModule {}
