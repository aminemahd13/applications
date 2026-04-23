import { resolveAppBaseUrl } from './export-csv.util';

describe('resolveAppBaseUrl', () => {
  it('prefers PUBLIC_APP_BASE_URL when valid', () => {
    const value = resolveAppBaseUrl({
      PUBLIC_APP_BASE_URL: 'https://public.example.com/',
      APP_BASE_URL: 'https://internal.example.com',
      CORS_ORIGIN: 'https://cors.example.com',
    } as NodeJS.ProcessEnv);

    expect(value).toBe('https://public.example.com');
  });

  it('falls back from loopback/public-invalid values to next valid candidate', () => {
    const value = resolveAppBaseUrl({
      PUBLIC_APP_BASE_URL: 'http://preview.localhost:3000',
      APP_BASE_URL: 'http://api:3000',
      CORS_ORIGIN: 'https://apply.example.com/',
    } as NodeJS.ProcessEnv);

    expect(value).toBe('https://apply.example.com');
  });

  it('falls back to localhost default when every candidate is invalid', () => {
    const value = resolveAppBaseUrl({
      PUBLIC_APP_BASE_URL: 'http://127.0.0.1:3000',
      APP_BASE_URL: 'http://minio:9000',
      CORS_ORIGIN: 'not-a-url',
    } as NodeJS.ProcessEnv);

    expect(value).toBe('http://localhost:3000');
  });

  it('keeps a valid APP_BASE_URL when no public override is provided', () => {
    const value = resolveAppBaseUrl({
      APP_BASE_URL: 'https://apply.mathmaroc.org/',
    } as NodeJS.ProcessEnv);

    expect(value).toBe('https://apply.mathmaroc.org');
  });

  it('supports CORS_ORIGINS list as candidates', () => {
    const value = resolveAppBaseUrl({
      PUBLIC_APP_BASE_URL: 'http://127.0.0.1:3000',
      APP_BASE_URL: 'http://api:3000',
      CORS_ORIGINS: 'http://localhost:3000, https://participant.example.com',
    } as NodeJS.ProcessEnv);

    expect(value).toBe('https://participant.example.com');
  });

  it('strict mode prefers PUBLIC_APP_BASE_URL on https', () => {
    const value = resolveAppBaseUrl(
      {
        PUBLIC_APP_BASE_URL: 'https://participant.example.com/',
        APP_BASE_URL: 'http://0.0.0.0:3000',
      } as NodeJS.ProcessEnv,
      { strictPublic: true },
    );

    expect(value).toBe('https://participant.example.com');
  });

  it('strict mode can select first valid public HTTPS URL from CORS_ORIGINS', () => {
    const value = resolveAppBaseUrl(
      {
        APP_BASE_URL: 'http://api:3000',
        CORS_ORIGINS:
          'http://localhost:3000, https://participant.example.com, https://secondary.example.com',
      } as NodeJS.ProcessEnv,
      { strictPublic: true },
    );

    expect(value).toBe('https://participant.example.com');
  });

  it('strict mode rejects loopback/private/internal hosts and throws actionable error', () => {
    expect(() =>
      resolveAppBaseUrl(
        {
          PUBLIC_APP_BASE_URL: 'http://0.0.0.0:3000',
          APP_BASE_URL: 'http://minio:9000',
          CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
          CORS_ORIGIN: 'http://api:3000',
        } as NodeJS.ProcessEnv,
        { strictPublic: true, errorContext: 'credential links' },
      ),
    ).toThrow(
      'Unable to resolve a public application base URL for credential links. Set PUBLIC_APP_BASE_URL to the public HTTPS origin',
    );
  });
});
