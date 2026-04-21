import { AuthController } from './auth.controller';
import { BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  const makeController = () => {
    const authService = {
      getUserEventRoles: jest.fn(),
      getUserEmailVerificationState: jest.fn(),
    } as any;

    const passwordResetService = {} as any;
    const emailVerificationService = {
      requestVerificationByEmail: jest.fn(),
      verifyEmail: jest.fn(),
    } as any;

    return {
      controller: new AuthController(
        authService,
        passwordResetService,
        emailVerificationService,
      ),
      authService,
      emailVerificationService,
    };
  };

  describe('getMe', () => {
    it('returns null user when the session has no authenticated user', async () => {
      const { controller } = makeController();

      await expect(controller.getMe({})).resolves.toEqual({ user: null });
    });

    it('caches event roles and verification state in the session', async () => {
      const { controller, authService } = makeController();

      authService.getUserEventRoles.mockResolvedValue([
        { eventId: 'event-1', role: 'reviewer' },
      ]);
      authService.getUserEmailVerificationState.mockResolvedValue({
        emailVerified: true,
        emailVerificationRequired: true,
        mustVerifyEmail: false,
      });

      const session: any = {
        user: {
          id: 'user-1',
          email: 'user@example.com',
          is_global_admin: false,
        },
        createdAt: 123,
      };

      const first = await controller.getMe(session);
      const second = await controller.getMe(session);

      expect(first).toEqual(second);
      expect(authService.getUserEventRoles).toHaveBeenCalledTimes(1);
      expect(authService.getUserEmailVerificationState).toHaveBeenCalledTimes(
        1,
      );
      expect(session.authMeCache).toEqual(
        expect.objectContaining({
          eventRoles: [{ eventId: 'event-1', role: 'reviewer' }],
          verificationState: {
            emailVerified: true,
            emailVerificationRequired: true,
            mustVerifyEmail: false,
          },
        }),
      );
      expect(typeof session.authMeCache.fetchedAt).toBe('number');
    });
  });

  describe('email verification endpoints', () => {
    it('returns a generic success response for public resend requests', async () => {
      const { controller, emailVerificationService } = makeController();

      emailVerificationService.requestVerificationByEmail.mockResolvedValue({
        success: true,
      });

      await expect(
        controller.requestEmailVerificationPublic({
          email: 'user@example.com',
        }),
      ).resolves.toEqual({
        message: 'If the email exists, a verification link has been sent.',
      });
      expect(
        emailVerificationService.requestVerificationByEmail,
      ).toHaveBeenCalledWith('user@example.com');
    });

    it('marks the current session as verified when the token belongs to that user', async () => {
      const { controller, emailVerificationService } = makeController();

      emailVerificationService.verifyEmail.mockResolvedValue({
        status: 'verified',
        userId: 'user-1',
      });

      const session: any = {
        user: { id: 'user-1', email_verified: false },
        authMeCache: { stale: true },
      };

      await expect(
        controller.verifyEmail({ token: 'a'.repeat(64) }, session),
      ).resolves.toEqual({
        message: 'Email verified successfully.',
        status: 'verified',
      });
      expect(session.user.email_verified).toBe(true);
      expect(session.authMeCache).toBeUndefined();
    });

    it('returns an already verified status without mutating another user session', async () => {
      const { controller, emailVerificationService } = makeController();

      emailVerificationService.verifyEmail.mockResolvedValue({
        status: 'already_verified',
        userId: 'user-2',
      });

      const session: any = {
        user: { id: 'user-1', email_verified: false },
      };

      await expect(
        controller.verifyEmail({ token: 'b'.repeat(64) }, session),
      ).resolves.toEqual({
        message: 'Email was already verified.',
        status: 'already_verified',
      });
      expect(session.user.email_verified).toBe(false);
    });

    it('preserves structured verification errors for frontend mapping', async () => {
      const { controller, emailVerificationService } = makeController();

      emailVerificationService.verifyEmail.mockRejectedValue(
        new BadRequestException({
          message:
            'This verification link has expired. Request a new verification email.',
          code: 'EMAIL_VERIFICATION_EXPIRED',
        }),
      );

      try {
        await controller.verifyEmail({ token: 'c'.repeat(64) }, {});
        fail('Expected verifyEmail to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({
          message:
            'This verification link has expired. Request a new verification email.',
          code: 'EMAIL_VERIFICATION_EXPIRED',
        });
      }
    });
  });
});
