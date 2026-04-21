import { Controller, Get, Param } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CertificatesService } from '../certificates/certificates.service';

@Controller('credentials')
export class CompletionCredentialsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly certificatesService: CertificatesService,
  ) {}

  @Get('certificate/:certificateId')
  async getCertificate(@Param('certificateId') certificateId: string) {
    const next = await this.certificatesService.getPublicCertificate(
      certificateId,
    );
    const data = next
      ? next
      : await this.applicationsService.getPublicCertificate(certificateId);
    return { data };
  }

  @Get('verify/:credentialId')
  async verifyCredential(@Param('credentialId') credentialId: string) {
    const next = await this.certificatesService.verifyCredential(credentialId);
    const data = next
      ? next
      : await this.applicationsService.verifyCredential(credentialId);
    return { data };
  }
}
