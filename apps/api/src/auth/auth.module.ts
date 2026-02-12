import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import {
  PasswordResetService,
  EmailVerificationService,
} from './password-reset.service';
import { RateLimiterService } from '../common/services/rate-limiter.service';
import { OrgSettingsModule } from '../admin/org-settings.module';

@Module({
  imports: [OrgSettingsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    EmailVerificationService,
    RateLimiterService,
  ],
  exports: [
    AuthService,
    PasswordResetService,
    EmailVerificationService,
    RateLimiterService,
  ],
})
export class AuthModule {}
