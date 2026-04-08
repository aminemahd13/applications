import { Module } from '@nestjs/common';
import { MicrositesController } from './microsites.controller';
import { MicrositesService } from './microsites.service';
import { MicrositeMediaService } from './microsite-media.service';
import { MicrositeMediaOptimizerService } from './microsite-media-optimizer.service';
import { MicrositeMediaOptimizationSchedulerService } from './microsite-media-optimization.scheduler';
import { PrismaModule } from '../common/prisma/prisma.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [MicrositesController],
  providers: [
    MicrositesService,
    MicrositeMediaService,
    MicrositeMediaOptimizerService,
    MicrositeMediaOptimizationSchedulerService,
  ],
  exports: [MicrositesService],
})
export class MicrositesModule {}
