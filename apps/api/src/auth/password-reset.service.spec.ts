import { EmailVerificationService } from './password-reset.service';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

describe('EmailVerificationService', () => {
  const validToken = 'a'.repeat(64);
  const futureDate = new Date('2030-01-01T00:00:00.000Z');
  const pastDate = new Date('2020-01-01T00:00:00.000Z');

  let service: EmailVerificationService;
  let mockPrisma: any;
  let mockTx: any;
  let mockRateLimiter: any;
  let mockEmailService: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockTx = {
      email_verification_tokens: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      users: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockPrisma = {
      users: {
        findUnique: jest.fn(),
      },
      email_verification_tokens: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (callback: any) => callback(mockTx)),
    };

    mockRateLimiter = {
      checkEmailVerificationLimit: jest.fn().mockResolvedValue(true),
    };

    mockEmailService = {
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    };

    service = new EmailVerificationService(
      mockPrisma,
      mockRateLimiter,
      mockEmailService,
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('creates a new verification token without invalidating older ones', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      email_verified_at: null,
    });

    const result = await service.requestVerification('user-1');

    expect(result.success).toBe(true);
    expect(mockPrisma.email_verification_tokens.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.email_verification_tokens.updateMany).not.toHaveBeenCalled();
    expect(mockEmailService.sendEmailVerification).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
    );
  });

  it('returns generic success for public resend requests when the email is unknown', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);

    await expect(
      service.requestVerificationByEmail('missing@example.com'),
    ).resolves.toEqual({ success: true });
    expect(mockRateLimiter.checkEmailVerificationLimit).not.toHaveBeenCalled();
    expect(mockPrisma.email_verification_tokens.create).not.toHaveBeenCalled();
  });

  it('suppresses rate limit errors for the public resend flow', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      email_verified_at: null,
    });
    mockRateLimiter.checkEmailVerificationLimit.mockResolvedValue(false);

    await expect(
      service.requestVerificationByEmail('user@example.com'),
    ).resolves.toEqual({ success: true });
    expect(mockPrisma.email_verification_tokens.create).not.toHaveBeenCalled();
  });

  it('returns generic success for the public resend flow when email delivery fails', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      email_verified_at: null,
    });
    mockEmailService.sendEmailVerification.mockRejectedValueOnce(
      new Error('smtp unavailable'),
    );

    await expect(
      service.requestVerificationByEmail('user@example.com'),
    ).resolves.toEqual(expect.objectContaining({ success: true }));
  });

  it('throws when requesting verification for a missing authenticated user', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);

    await expect(service.requestVerification('missing-user')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws service unavailable for authenticated resend when delivery fails', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      email_verified_at: null,
    });
    mockEmailService.sendEmailVerification.mockRejectedValueOnce(
      new Error('smtp unavailable'),
    );

    await expect(service.requestVerification('user-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('verifies a valid token and marks the user as verified', async () => {
    mockTx.email_verification_tokens.findUnique.mockResolvedValue({
      id: 'token-1',
      user_id: 'user-1',
      used_at: null,
      expires_at: futureDate,
      users: {
        email_verified_at: null,
      },
    });

    await expect(service.verifyEmail(validToken)).resolves.toEqual({
      status: 'verified',
      userId: 'user-1',
    });
    expect(mockTx.email_verification_tokens.updateMany).toHaveBeenCalledWith({
      where: { id: 'token-1', used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(mockTx.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { email_verified_at: expect.any(Date) },
    });
  });

  it('treats a token for an already verified user as idempotent success', async () => {
    mockTx.email_verification_tokens.findUnique.mockResolvedValue({
      id: 'token-1',
      user_id: 'user-1',
      used_at: new Date(),
      expires_at: pastDate,
      users: {
        email_verified_at: new Date(),
      },
    });

    await expect(service.verifyEmail(validToken)).resolves.toEqual({
      status: 'already_verified',
      userId: 'user-1',
    });
    expect(mockTx.email_verification_tokens.updateMany).not.toHaveBeenCalled();
    expect(mockTx.users.update).not.toHaveBeenCalled();
  });

  it('returns no-longer-valid when a concurrent consume already used the token', async () => {
    mockTx.email_verification_tokens.findUnique.mockResolvedValue({
      id: 'token-1',
      user_id: 'user-1',
      used_at: null,
      expires_at: futureDate,
      users: {
        email_verified_at: null,
      },
    });
    mockTx.email_verification_tokens.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    try {
      await service.verifyEmail(validToken);
      fail('Expected verifyEmail to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message:
          'This verification link is no longer valid. Request a new verification email.',
        code: 'EMAIL_VERIFICATION_NO_LONGER_VALID',
      });
    }
    expect(mockTx.users.update).not.toHaveBeenCalled();
  });

  it('returns a specific expired-link error', async () => {
    mockTx.email_verification_tokens.findUnique.mockResolvedValue({
      id: 'token-1',
      user_id: 'user-1',
      used_at: null,
      expires_at: pastDate,
      users: {
        email_verified_at: null,
      },
    });

    try {
      await service.verifyEmail(validToken);
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

  it('returns a specific no-longer-valid error for consumed legacy tokens', async () => {
    mockTx.email_verification_tokens.findUnique.mockResolvedValue({
      id: 'token-1',
      user_id: 'user-1',
      used_at: new Date(),
      expires_at: futureDate,
      users: {
        email_verified_at: null,
      },
    });

    try {
      await service.verifyEmail(validToken);
      fail('Expected verifyEmail to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message:
          'This verification link is no longer valid. Request a new verification email.',
        code: 'EMAIL_VERIFICATION_NO_LONGER_VALID',
      });
    }
  });

  it('rejects malformed tokens before hitting the database', async () => {
    try {
      await service.verifyEmail('bad-token');
      fail('Expected verifyEmail to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'This verification link is invalid.',
        code: 'EMAIL_VERIFICATION_INVALID',
      });
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
