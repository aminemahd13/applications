import { AuthService } from './auth.service';
import { RateLimitExceededException } from '../common/exceptions/rate-limit-exceeded.exception';

describe('AuthService rate limiting', () => {
  let service: AuthService;
  const prisma = {} as any;
  const orgSettingsService = {
    getSettings: jest.fn(),
  } as any;
  const rateLimiterService = {
    checkLoginLimit: jest.fn(),
    checkSignupEmailLimit: jest.fn(),
    checkSignupIpLimit: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(prisma, orgSettingsService, rateLimiterService);
  });

  it('rejects login when email rate limit is exceeded', async () => {
    rateLimiterService.checkLoginLimit.mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'Test@Example.com', password: 'irrelevant' } as any,
        { ip: '198.51.100.10' } as any,
      ),
    ).rejects.toBeInstanceOf(RateLimitExceededException);

    expect(rateLimiterService.checkLoginLimit).toHaveBeenCalledWith(
      'test@example.com',
    );
    expect(orgSettingsService.getSettings).not.toHaveBeenCalled();
  });

  it('rejects signup when per-email limit is exceeded', async () => {
    rateLimiterService.checkSignupEmailLimit.mockResolvedValue(false);
    rateLimiterService.checkSignupIpLimit.mockResolvedValue(true);

    await expect(
      service.signup(
        { email: 'Signup@Example.com', password: 'irrelevant' } as any,
        { ip: '203.0.113.42' } as any,
      ),
    ).rejects.toBeInstanceOf(RateLimitExceededException);

    expect(rateLimiterService.checkSignupEmailLimit).toHaveBeenCalledWith(
      'signup@example.com',
    );
    expect(rateLimiterService.checkSignupIpLimit).toHaveBeenCalledWith(
      '203.0.113.42',
    );
    expect(orgSettingsService.getSettings).not.toHaveBeenCalled();
  });

  it('rejects signup when per-IP limit is exceeded', async () => {
    rateLimiterService.checkSignupEmailLimit.mockResolvedValue(true);
    rateLimiterService.checkSignupIpLimit.mockResolvedValue(false);

    await expect(
      service.signup(
        { email: 'Signup@Example.com', password: 'irrelevant' } as any,
        { headers: { 'x-forwarded-for': '203.0.113.44, 10.0.0.1' } } as any,
      ),
    ).rejects.toBeInstanceOf(RateLimitExceededException);

    expect(rateLimiterService.checkSignupIpLimit).toHaveBeenCalledWith(
      '203.0.113.44',
    );
  });

  it('does not evaluate signup IP limit when source IP is missing', async () => {
    rateLimiterService.checkSignupEmailLimit.mockResolvedValue(false);

    await expect(
      service.signup(
        { email: 'Signup@Example.com', password: 'irrelevant' } as any,
        {} as any,
      ),
    ).rejects.toBeInstanceOf(RateLimitExceededException);

    expect(rateLimiterService.checkSignupIpLimit).not.toHaveBeenCalled();
  });
});
