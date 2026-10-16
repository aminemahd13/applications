const redisMock = {
  pttl: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService.getEmailVerificationRetryAfterSeconds', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    redisMock.pttl.mockReset();
    service = new RateLimiterService();
  });

  it('returns the remaining window in whole seconds for the normalized email', async () => {
    redisMock.pttl.mockResolvedValue(61_001);

    await expect(
      service.getEmailVerificationRetryAfterSeconds(' User@Example.com '),
    ).resolves.toBe(62);
    expect(redisMock.pttl).toHaveBeenCalledWith(
      'ratelimit:emailverify:user@example.com',
    );
  });

  it.each([-2, -1, 0])('returns null when no window is active (pttl %p)', async (ttl) => {
    redisMock.pttl.mockResolvedValue(ttl);

    await expect(
      service.getEmailVerificationRetryAfterSeconds('user@example.com'),
    ).resolves.toBeNull();
  });
});
