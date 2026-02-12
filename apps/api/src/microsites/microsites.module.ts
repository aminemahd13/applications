import { Module } from '@nestjs/common';
import { MicrositesController } from './microsites.controller';
import { MicrositesService } from './microsites.service';
import { MicrositeMediaService } from './microsite-media.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [MicrositesController],
  providers: [MicrositesService, MicrositeMediaService],
  exports: [MicrositesService],
})
export class MicrositesModule {}
