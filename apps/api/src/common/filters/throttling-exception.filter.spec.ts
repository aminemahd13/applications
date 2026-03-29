import { ThrottlingExceptionFilter } from './throttling-exception.filter';
import { RateLimitExceededException } from '../exceptions/rate-limit-exceeded.exception';

describe('ThrottlingExceptionFilter', () => {
  function createResponseMock() {
    const headers = new Map<string, string>();
    return {
      getHeader: jest.fn((name: string) => headers.get(name)),
      setHeader: jest.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  }

  it('normalizes raw throttler messages', () => {
    const filter = new ThrottlingExceptionFilter();
    const response = createResponseMock();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/auth/login' }),
        getResponse: () => response,
      }),
    } as any;

    filter.catch(
      new RateLimitExceededException('ThrottlerException: Too Many Requests'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
    });
  });

  it('preserves custom rate-limit message and retry-after', () => {
    const filter = new ThrottlingExceptionFilter();
    const response = createResponseMock();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/auth/signup',
        }),
        getResponse: () => response,
      }),
    } as any;

    filter.catch(
      new RateLimitExceededException(
        'Too many signup attempts. Please wait before trying again.',
        120,
      ),
      host,
    );

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '120');
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many signup attempts. Please wait before trying again.',
      retryAfterSeconds: 120,
    });
  });
});
