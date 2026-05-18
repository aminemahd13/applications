import {
  buildCsvContent,
  resolveAppBaseUrl,
  resolvePublicAppBaseUrl,
} from './export-csv.util';

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

describe('resolvePublicAppBaseUrl', () => {
  it('accepts a valid PUBLIC_APP_BASE_URL', () => {
    const value = resolvePublicAppBaseUrl({
      PUBLIC_APP_BASE_URL: 'https://participant.example.com/',
      APP_BASE_URL: 'http://0.0.0.0:3000',
      CORS_ORIGINS: 'https://fallback.example.com',
    } as NodeJS.ProcessEnv);

    expect(value).toBe('https://participant.example.com');
  });

  it('rejects missing PUBLIC_APP_BASE_URL even when other hosts are present', () => {
    expect(() =>
      resolvePublicAppBaseUrl(
        {
          APP_BASE_URL: 'https://apply.example.com',
          CORS_ORIGINS: 'https://participant.example.com',
        } as NodeJS.ProcessEnv,
        { errorContext: 'credential links' },
      ),
    ).toThrow(
      'Unable to resolve a public application base URL for credential links. Set PUBLIC_APP_BASE_URL to the public HTTPS origin',
    );
  });

  it('rejects loopback/private/internal PUBLIC_APP_BASE_URL values', () => {
    const candidates = [
      'http://0.0.0.0:3000',
      'https://localhost:3000',
      'https://127.0.0.1:3000',
      'https://10.0.0.15:3000',
      'https://api:3000',
    ];

    for (const candidate of candidates) {
      expect(() =>
        resolvePublicAppBaseUrl(
          { PUBLIC_APP_BASE_URL: candidate } as NodeJS.ProcessEnv,
          { errorContext: 'certificate links' },
        ),
      ).toThrow('Set PUBLIC_APP_BASE_URL to the public HTTPS origin');
    }
  });
});

describe('buildCsvContent', () => {
  const BOM = '﻿';

  it('emits one physical line per row plus header, using CRLF', () => {
    const csv = buildCsvContent(
      ['name', 'age'],
      [
        ['Ada', 36],
        ['Linus', 54],
      ],
    );
    const body = csv.startsWith(BOM) ? csv.slice(1) : csv;
    const lines = body.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"name","age"');
    expect(lines[1]).toBe('"Ada","36"');
    expect(lines[2]).toBe('"Linus","54"');
  });

  it('includes a UTF-8 BOM by default and can suppress it', () => {
    const withBom = buildCsvContent(['h'], [['v']]);
    const withoutBom = buildCsvContent(['h'], [['v']], { includeBom: false });
    expect(withBom.startsWith(BOM)).toBe(true);
    expect(withoutBom.startsWith(BOM)).toBe(false);
  });

  describe.each([
    ['LF', 'first\nsecond'],
    ['CR', 'first\rsecond'],
    ['CRLF', 'first\r\nsecond'],
    ['mixed', 'a\nb\rc\r\nd'],
  ])('with %s newlines embedded in a cell', (_label, value) => {
    it('flattens to a single space and keeps row count stable', () => {
      const csv = buildCsvContent(
        ['note'],
        [[value], ['after']],
      );
      const body = csv.startsWith(BOM) ? csv.slice(1) : csv;
      const lines = body.split('\r\n');
      expect(lines).toHaveLength(3);
      // The cell value should be present without any \r or \n inside it.
      expect(lines[1]).not.toMatch(/[\r\n]/);
      // wc -l style count: total \n occurrences equals lines - 1.
      const newlineCount = (csv.match(/\n/g) ?? []).length;
      expect(newlineCount).toBe(2);
    });
  });

  it('escapes embedded quotes by doubling', () => {
    const csv = buildCsvContent(['q'], [['a"b']]);
    const body = csv.startsWith(BOM) ? csv.slice(1) : csv;
    expect(body.split('\r\n')[1]).toBe('"a""b"');
  });

  it('prefixes formula-injection candidates with a single quote', () => {
    const csv = buildCsvContent(
      ['cell'],
      [['=SUM(A1)'], ['+1'], ['-1'], ['@cmd']],
    );
    const body = csv.startsWith(BOM) ? csv.slice(1) : csv;
    const lines = body.split('\r\n').slice(1);
    for (const line of lines) {
      expect(line.startsWith("\"'")).toBe(true);
    }
  });
});
