import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { OrgSettingsModule } from '../../admin/org-settings.module';

@Global()
@Module({
  imports: [OrgSettingsModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
