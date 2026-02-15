import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateLimiterService } from '../common/services/rate-limiter.service';
import { EmailService } from '../common/email/email.service';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiterService,
    private readonly emailService: EmailService,
  ) {}

  private async createPasswordResetToken(
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    // Invalidate previous unused tokens for this user
    await this.prisma.password_reset_tokens.updateMany({
      where: {
        user_id: userId,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    });

    // Generate secure token (32 bytes = 64 hex chars)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // Store hashed token
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.password_reset_tokens.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    return { token: rawToken, expiresAt };
  }

  /**
   * Request password reset - generates token, stores hash, returns raw token for email.
   * Always returns generic response to prevent email enumeration.
   */
  async requestPasswordReset(
    email: string,
  ): Promise<{ success: boolean; token?: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check per-email rate limit (3 per hour)
    const allowed =
      await this.rateLimiter.checkPasswordResetLimit(normalizedEmail);
    if (!allowed) {
      // Still return success to prevent enumeration
      return { success: true };
    }

    // Find user (don't reveal if exists)
    const user = await this.prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Return success to prevent enumeration
      return { success: true };
    }

    const { token: rawToken } = await this.createPasswordResetToken(user.id);

    // Send password reset email
    await this.emailService
      .sendPasswordReset(normalizedEmail, rawToken)
      .catch((err) => {
        console.error('Failed to send password reset email:', err);
      });

    return {
      success: true,
      token: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
    };
  }

  async sendPasswordSetupInvite(params: {
    userId: string;
    email: string;
    userName?: string;
    role?: string;
    eventName?: string;
  }): Promise<{ invitationSent: boolean; token?: string; expiresAt?: Date }> {
    const normalizedEmail = params.email.toLowerCase().trim();
    try {
      const { token: rawToken, expiresAt } = await this.createPasswordResetToken(
        params.userId,
      );
      await this.emailService.sendStaffInvite(normalizedEmail, rawToken, {
        userName: params.userName,
        role: params.role,
        eventName: params.eventName,
      });
      return {
        invitationSent: true,
        token: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
        expiresAt,
      };
    } catch (err) {
      console.error('Failed to send staff invite email:', err);
      return {
        invitationSent: false,
      };
    }
  }

  /**
   * Reset password using token.
   * Atomic transaction: validate token, update password, revoke sessions.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token || token.length !== 64) {
      throw new BadRequestException('Invalid token format');
    }

    if (!newPassword || newPassword.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await this.prisma.$transaction(async (tx) => {
      // Find and lock token row
      const tokenRow = await tx.password_reset_tokens.findFirst({
        where: {
          token_hash: tokenHash,
          used_at: null,
          expires_at: { gt: new Date() },
        },
      });

      if (!tokenRow) {
        throw new BadRequestException('Invalid or expired token');
      }

      // Mark token as used
      await tx.password_reset_tokens.update({
        where: { id: tokenRow.id },
        data: { used_at: new Date() },
      });

      // Update password
      const hashedPassword = await argon2.hash(newPassword);
      await tx.users.update({
        where: { id: tokenRow.user_id },
        data: { password_hash: hashedPassword },
      });

      // Revoke all sessions for this user (logout everywhere)
      // This happens outside the transaction since Redis is separate
      this.rateLimiter.revokeUserSessions(tokenRow.user_id).catch((err) => {
        console.error('Failed to revoke sessions:', err);
      });
    });
  }
}

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiterService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Request email verification - generates token for the current user.
   */
  async requestVerification(
    userId: string,
  ): Promise<{ success: boolean; token?: string }> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.email_verified_at) {
      return { success: true }; // Already verified
    }

    // Check per-email rate limit
    const allowed = await this.rateLimiter.checkEmailVerificationLimit(
      user.email,
    );
    if (!allowed) {
      throw new BadRequestException(
        'Too many verification requests. Please wait before trying again.',
      );
    }

    // Invalidate previous unused tokens
    await this.prisma.email_verification_tokens.updateMany({
      where: {
        user_id: userId,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    });

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // Store hashed token
    await this.prisma.email_verification_tokens.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    // Send email verification
    await this.emailService
      .sendEmailVerification(user.email, rawToken)
      .catch((err) => {
        console.error('Failed to send verification email:', err);
      });

    return {
      success: true,
      token: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
    };
  }

  /**
   * Verify email using token.
   */
  async verifyEmail(token: string): Promise<void> {
    if (!token || token.length !== 64) {
      throw new BadRequestException('Invalid token format');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await this.prisma.$transaction(async (tx) => {
      const tokenRow = await tx.email_verification_tokens.findFirst({
        where: {
          token_hash: tokenHash,
          used_at: null,
          expires_at: { gt: new Date() },
        },
      });

      if (!tokenRow) {
        throw new BadRequestException('Invalid or expired token');
      }

      // Mark token as used
      await tx.email_verification_tokens.update({
        where: { id: tokenRow.id },
        data: { used_at: new Date() },
      });

      // Update user's email_verified_at
      await tx.users.update({
        where: { id: tokenRow.user_id },
        data: { email_verified_at: new Date() },
      });
    });
  }
}
