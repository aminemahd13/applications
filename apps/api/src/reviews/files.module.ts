import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FieldFileExportSchedulerService } from './field-file-export.scheduler';

import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [FilesController],
  providers: [FilesService, FieldFileExportSchedulerService],
  exports: [FilesService],
})
export class FilesModule {}
