import {
  AuthController,
  emailVerificationRequestTracker,
} from './auth.controller';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { RateLimitExceededException } from '../common/exceptions/rate-limit-exceeded.exception';
import { SafeThrottlerStorage } from '../common/throttling/safe-throttler-storage';

describe('AuthController', () => {
  const makeController = () => {
    const authService = {
      getUserEventRoles: jest.fn(),
      getUserEmailVerificationState: jest.fn(),
      signup: jest.fn(),
    } as any;

    const passwordResetService = {} as any;
    const emailVerificationService = {
      requestVerification: jest.fn(),
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

  describe('signup', () => {
    const body = { email: 'new@example.com', password: 'StrongPass123!' };
    const pending = {
      id: 'user-1',
      email: 'new@example.com',
      verificationRequired: true,
      wasExistingUnverified: false,
    };
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('reports that the verification email was sent', async () => {
      const { controller, authService, emailVerificationService } =
        makeController();
      authService.signup.mockResolvedValue(pending);
      emailVerificationService.requestVerification.mockResolvedValue({
        success: true,
      });

      await expect(controller.signup(body, {} as any)).resolves.toEqual({
        ...pending,
        verificationEmailSent: true,
      });
      expect(emailVerificationService.requestVerification).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('stays successful but says no email was sent when the per-email limit is hit', async () => {
      const { controller, authService, emailVerificationService } =
        makeController();
      authService.signup.mockResolvedValue(pending);
      emailVerificationService.requestVerification.mockRejectedValue(
        new RateLimitExceededException('Too many', 1800),
      );

      await expect(controller.signup(body, {} as any)).resolves.toEqual({
        ...pending,
        verificationEmailSent: false,
        verificationRetryAfterSeconds: 1800,
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('says no email was sent when delivery fails', async () => {
      const { controller, authService, emailVerificationService } =
        makeController();
      authService.signup.mockResolvedValue(pending);
      emailVerificationService.requestVerification.mockRejectedValue(
        new ServiceUnavailableException('smtp down'),
      );

      await expect(controller.signup(body, {} as any)).resolves.toEqual({
        ...pending,
        verificationEmailSent: false,
      });
    });

    it('does not send an email when verification is not required', async () => {
      const { controller, authService, emailVerificationService } =
        makeController();
      authService.signup.mockResolvedValue({
        ...pending,
        verificationRequired: false,
      });

      await expect(controller.signup(body, {} as any)).resolves.toEqual({
        ...pending,
        verificationRequired: false,
        verificationEmailSent: false,
      });
      expect(
        emailVerificationService.requestVerification,
      ).not.toHaveBeenCalled();
    });

    it('propagates the "Email already in use" error without sending email', async () => {
      const { controller, authService, emailVerificationService } =
        makeController();
      authService.signup.mockRejectedValue(
        new BadRequestException('Email already in use'),
      );

      await expect(controller.signup(body, {} as any)).rejects.toThrow(
        'Email already in use',
      );
      expect(
        emailVerificationService.requestVerification,
      ).not.toHaveBeenCalled();
    });
  });

  describe('email verification throttling', () => {
    const handlerOf = (name: keyof AuthController): object =>
      Reflect.get(AuthController.prototype, name) as object;
    const read = (key: string, handler: object) =>
      Reflect.getMetadata(`THROTTLER:${key}default`, handler);

    it('keys the logged-in resend button by session user, not by IP', () => {
      expect(
        emailVerificationRequestTracker({
          ip: '203.0.113.7',
          session: { user: { id: 'user-a' } },
        }),
      ).toBe('user:user-a');
      expect(
        emailVerificationRequestTracker({
          ip: '203.0.113.7',
          session: { user: { id: 'user-b' } },
        }),
      ).toBe('user:user-b');
      expect(emailVerificationRequestTracker({ ip: '203.0.113.7' })).toBe(
        'ip:203.0.113.7',
      );
    });

    it('allows 10 resend requests per 15 min per user, blocking for the whole window', () => {
      const handler = handlerOf('requestEmailVerification');
      expect(read('LIMIT', handler)).toBe(10);
      expect(read('TTL', handler)).toBe(900000);
      expect(read('BLOCK_DURATION', handler)).toBe(900000);
      expect(read('TRACKER', handler)).toBe(emailVerificationRequestTracker);
    });

    it('gives two users behind the same IP separate budgets', async () => {
      const storage = new SafeThrottlerStorage();
      const guard = new ThrottlerGuard(
        { throttlers: [{ name: 'default', ttl: 60_000, limit: 1000 }], storage },
        storage,
        new Reflector(),
      );
      await guard.onModuleInit();
      const contextFor = (userId: string) =>
        ({
          getHandler: () => handlerOf('requestEmailVerification'),
          getClass: () => AuthController,
          switchToHttp: () => ({
            getRequest: () => ({
              ip: '198.51.100.20',
              headers: {},
              session: { user: { id: userId } },
            }),
            getResponse: () => ({ header: jest.fn() }),
          }),
        }) as any;

      for (let i = 0; i < 10; i++) {
        await expect(guard.canActivate(contextFor('user-a'))).resolves.toBe(
          true,
        );
      }
      await expect(guard.canActivate(contextFor('user-a'))).rejects.toBeInstanceOf(
        ThrottlerException,
      );
      await expect(guard.canActivate(contextFor('user-b'))).resolves.toBe(true);
    });

    it('allows 30 verification link clicks per 15 min', () => {
      for (const handler of [
        handlerOf('verifyEmail'),
        handlerOf('verifyEmailAlias'),
      ]) {
        expect(read('LIMIT', handler)).toBe(30);
        expect(read('TTL', handler)).toBe(900000);
      }
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
