import { Module } from '@nestjs/common';
import { StorageModule } from '../common/storage/storage.module';
import {
  CertificatesController,
  CertificatesPublicController,
} from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificateRenderSchedulerService } from './certificate-render.scheduler';

@Module({
  imports: [StorageModule],
  controllers: [CertificatesController, CertificatesPublicController],
  providers: [CertificatesService, CertificateRenderSchedulerService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
