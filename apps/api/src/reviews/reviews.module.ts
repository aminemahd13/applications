import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewQueueService } from './review-queue.service';
import { PatchesService } from './patches.service';
import { ApplicationsModule } from '../applications/applications.module';
import { FilesModule } from './files.module';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [ApplicationsModule, FilesModule, WorkflowModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewQueueService, PatchesService],
  exports: [ReviewsService, ReviewQueueService, PatchesService],
})
export class ReviewsModule {}
