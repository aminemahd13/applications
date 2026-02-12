import { Module } from '@nestjs/common';
import { OrgSettingsController } from './org-settings.controller';
import { OrgSettingsService } from './org-settings.service';

@Module({
  controllers: [OrgSettingsController],
  providers: [OrgSettingsService],
  exports: [OrgSettingsService],
})
export class OrgSettingsModule {}
