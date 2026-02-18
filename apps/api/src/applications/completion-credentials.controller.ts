import { Controller, Get, Param } from '@nestjs/common';
import { ApplicationsService } from './applications.service';

@Controller('credentials')
export class CompletionCredentialsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get('certificate/:certificateId')
  async getCertificate(@Param('certificateId') certificateId: string) {
    const data = await this.applicationsService.getPublicCertificate(
      certificateId,
    );
    return { data };
  }

  @Get('verify/:credentialId')
  async verifyCredential(@Param('credentialId') credentialId: string) {
    const data = await this.applicationsService.verifyCredential(credentialId);
    return { data };
  }
}
