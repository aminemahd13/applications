import { validateProductionEnv } from './configure-app';

describe('validateProductionEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does nothing when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.DATABASE_URL;

    const exitSpy = jest.spyOn(process, 'exit');

    expect(() => validateProductionEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits process when required production variables are missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short';
    delete process.env.SESSION_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.APP_BASE_URL;

    const exitError = new Error('process.exit called');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw exitError;
    }) as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => validateProductionEnv()).toThrow(exitError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes when production environment is fully configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.SESSION_SECRET = 'y'.repeat(32);
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.APP_BASE_URL = 'https://example.com';
    process.env.MINIO_ENDPOINT = 'minio';

    const exitSpy = jest.spyOn(process, 'exit');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => validateProductionEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
