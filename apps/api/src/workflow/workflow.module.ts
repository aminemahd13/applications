import { Module } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  controllers: [FormsController, WorkflowController],
  providers: [FormsService, WorkflowService],
  exports: [FormsService, WorkflowService],
})
export class WorkflowModule {}
