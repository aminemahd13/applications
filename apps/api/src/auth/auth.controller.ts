import {
  Controller,
  Post,
  Patch,
  Body,
  Session,
  Res,
  Get,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  PasswordResetService,
  EmailVerificationService,
} from './password-reset.service';
import { LoginSchema, SignupSchema } from '@event-platform/shared';
import * as express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  private requireSessionUserId(session: any): string {
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedException('Unauthorized');
    return userId;
  }

  @Get('csrf')
  getCsrf(
    @Session() session: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    if (!session.csrfToken) {
      session.csrfToken = uuidv4();
    }
    // Prevent caching of CSRF tokens
    res.setHeader('Cache-Control', 'no-store');
    res.cookie('csrf_token', session.csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { csrfToken: session.csrfToken };
  }

  @Post('signup')
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 per 15 min
  async signup(@Body() body: any) {
    const result = SignupSchema.safeParse(body);
    if (!result.success) throw new BadRequestException('Validation failed');

    const signupResult = await this.authService.signup(result.data);

    if (signupResult.verificationRequired) {
      try {
        await this.emailVerificationService.requestVerification(
          signupResult.id,
        );
      } catch {
        // Keep signup successful even if email delivery is rate-limited or fails.
      }
    }

    return signupResult;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 per 15 min
  async login(
    @Body() body: any,
    @Session() session: any,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = LoginSchema.safeParse(body);
    if (!result.success) throw new BadRequestException('Validation failed');

    const {
      user,
      csrfToken,
      emailVerified,
      emailVerificationRequired,
      mustVerifyEmail,
    } = (await this.authService.login(result.data, req)) as any;

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return { user, emailVerified, emailVerificationRequired, mustVerifyEmail };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Session() session: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    await this.authService.logout(session);
    res.clearCookie('sid');
    res.clearCookie('csrf_token');
    return { message: 'Logged out' };
  }

  @Get('me/profile')
  async getMyProfile(@Session() session: any) {
    const userId = this.requireSessionUserId(session);
    return await this.authService.getMyProfile(userId);
  }

  @Get('me')
  async getMe(@Session() session: any) {
    if (!session?.user?.id) {
      return { user: null };
    }
    const userId = session.user.id;
    const [eventRoles, verificationState] = await Promise.all([
      this.authService.getUserEventRoles(userId),
      this.authService.getUserEmailVerificationState(userId),
    ]);
    const sessionCreatedAt =
      typeof session.createdAt === 'number' ? session.createdAt : null;

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        isGlobalAdmin: session.user.is_global_admin ?? false,
        eventRoles,
        ...verificationState,
        sessionCreatedAt,
      },
    };
  }

  @Get('me/staff-events')
  async getMyStaffEvents(@Session() session: any) {
    const userId = this.requireSessionUserId(session);
    const data = await this.authService.getMyStaffEvents(userId);
    return { data };
  }

  @Patch('me/profile')
  @HttpCode(HttpStatus.OK)
  async updateMyProfile(@Session() session: any, @Body() body: any) {
    const userId = this.requireSessionUserId(session);
    return await this.authService.updateMyProfile(userId, body ?? {});
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Session() session: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const userId = this.requireSessionUserId(session);
    return await this.authService.changePassword(
      userId,
      body?.currentPassword,
      body?.newPassword,
    );
  }

  // Password Reset Flow - Token-based, no session auth required
  @Post('password/forgot')
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() body: { email: string }) {
    if (!body.email) throw new BadRequestException('Email is required');

    // Always return success to prevent email enumeration
    await this.passwordResetService.requestPasswordReset(body.email);
    return {
      message: 'If the email exists, a password reset link has been sent.',
    };
  }

  @Post('request-password-reset')
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  async requestPasswordResetAlias(@Body() body: { email: string }) {
    return this.requestPasswordReset(body);
  }

  @Post('password/reset')
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: { token: string; password: string }) {
    if (!body.token || !body.password) {
      throw new BadRequestException('Token and password are required');
    }

    await this.passwordResetService.resetPassword(body.token, body.password);
    return { message: 'Password has been reset successfully.' };
  }

  @Post('reset-password')
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  async resetPasswordAlias(
    @Body() body: { token: string; password?: string; newPassword?: string },
  ) {
    const password = body.password ?? body.newPassword;
    if (!body.token || !password) {
      throw new BadRequestException('Token and password are required');
    }
    await this.passwordResetService.resetPassword(body.token, password);
    return { message: 'Password has been reset successfully.' };
  }

  // Email Verification Flow
  @Post('email/verify/request')
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 per 15 min
  @HttpCode(HttpStatus.OK)
  async requestEmailVerification(@Session() session: any) {
    if (!session.user?.id) {
      throw new BadRequestException(
        'Must be logged in to request verification',
      );
    }

    const result = await this.emailVerificationService.requestVerification(
      session.user.id,
    );
    return {
      message: 'Verification email sent.',
      ...(result.token ? { token: result.token } : {}),
    };
  }

  @Post('email/verify')
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: { token: string }) {
    if (!body.token) throw new BadRequestException('Token is required');

    await this.emailVerificationService.verifyEmail(body.token);
    return { message: 'Email verified successfully.' };
  }

  @Post('verify-email')
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  async verifyEmailAlias(@Body() body: { token: string }) {
    return this.verifyEmail(body);
  }
}
