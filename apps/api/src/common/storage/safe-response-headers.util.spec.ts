import {
  buildContentDisposition,
  isActiveContentMimeType,
  isBareMimeType,
  normalizeMimeEssence,
  PRIVATE_INLINE_MIME_TYPES,
  PUBLIC_ASSET_INLINE_MIME_TYPES,
  resolveSafeResponseHeaders,
} from './safe-response-headers.util';

describe('normalizeMimeEssence', () => {
  it.each([
    ['image/png', 'image/png'],
    ['IMAGE/PNG', 'image/png'],
    ['  image/png  ', 'image/png'],
    ['image/jpg', 'image/jpeg'],
    ['image/pjpeg', 'image/jpeg'],
    ['text/html; charset=utf-8', 'text/html'],
    ['TEXT/HTML;charset=UTF-8', 'text/html'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  ])('normalizes %p to %p', (raw, expected) => {
    expect(normalizeMimeEssence(raw)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'png',
    'image/',
    '/png',
    'image/png/x',
    'text/ html',
    'image/*',
    '<script>',
    'a b/c',
  ])('rejects unparseable %p', (raw) => {
    expect(normalizeMimeEssence(raw)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeMimeEssence(undefined)).toBeNull();
    expect(normalizeMimeEssence(null)).toBeNull();
    expect(normalizeMimeEssence(42)).toBeNull();
  });
});

describe('isBareMimeType', () => {
  it('accepts a bare type/subtype token regardless of case', () => {
    expect(isBareMimeType('application/pdf')).toBe(true);
    expect(isBareMimeType(' Image/PNG ')).toBe(true);
  });

  it('rejects parameters and garbage', () => {
    expect(isBareMimeType('text/html; charset=utf-8')).toBe(false);
    expect(isBareMimeType('image/png;x=y')).toBe(false);
    expect(isBareMimeType('')).toBe(false);
    expect(isBareMimeType('png')).toBe(false);
    expect(isBareMimeType(undefined)).toBe(false);
  });
});

describe('isActiveContentMimeType', () => {
  it.each([
    'text/html',
    'TEXT/HTML',
    'text/html; charset=utf-8',
    'application/xhtml+xml',
    'image/svg+xml',
    'text/xml',
    'application/xml',
    'application/rss+xml',
    'application/mathml+xml',
    'application/atom+xml',
    'text/xsl',
    'application/xslt+xml',
    'text/javascript',
    'application/javascript',
    'application/x-javascript',
    'application/ecmascript',
    'text/ecmascript',
    'multipart/x-mixed-replace',
    '',
    'garbage',
  ])('flags %p as active', (mime) => {
    expect(isActiveContentMimeType(mime)).toBe(true);
  });

  it.each([
    'image/png',
    'image/jpeg',
    'application/pdf',
    'text/plain',
    'text/csv',
    'video/mp4',
    'application/zip',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])('does not flag %p', (mime) => {
    expect(isActiveContentMimeType(mime)).toBe(false);
  });
});

describe('buildContentDisposition', () => {
  it('emits an ASCII fallback and an RFC 5987 UTF-8 filename', () => {
    expect(buildContentDisposition('attachment', 'report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it('percent-encodes apostrophes and non-ASCII characters', () => {
    expect(buildContentDisposition('inline', "l'été.pdf")).toBe(
      `inline; filename="l'_t_.pdf"; filename*=UTF-8''l%27%C3%A9t%C3%A9.pdf`,
    );
  });

  it('escapes the remaining RFC 5987 reserved characters', () => {
    expect(buildContentDisposition('attachment', 'a(b)*!.png')).toBe(
      `attachment; filename="a(b)*!.png"; filename*=UTF-8''a%28b%29%2A%21.png`,
    );
  });

  it('strips quotes, backslashes and CR/LF (no header injection)', () => {
    const value = buildContentDisposition(
      'attachment',
      'evil".pdf\r\nSet-Cookie: a=b\\',
    );
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toBe(
      `attachment; filename="evil.pdfSet-Cookie: a=b_"; filename*=UTF-8''evil%22.pdfSet-Cookie%3A%20a%3Db_`,
    );
  });

  it('falls back to "download" for empty or missing names', () => {
    expect(buildContentDisposition('attachment', '')).toBe(
      `attachment; filename="download"; filename*=UTF-8''download`,
    );
    expect(buildContentDisposition('attachment', null)).toBe(
      `attachment; filename="download"; filename*=UTF-8''download`,
    );
  });

  it('survives lone surrogates instead of throwing', () => {
    expect(() =>
      buildContentDisposition('attachment', 'bad\ud800name.pdf'),
    ).not.toThrow();
  });

  it('caps very long names but keeps the extension', () => {
    const value = buildContentDisposition(
      'attachment',
      `${'a'.repeat(500)}.pdf`,
    );
    const asciiName = /filename="([^"]*)"/.exec(value)?.[1] ?? '';
    expect(asciiName.length).toBe(180);
    expect(asciiName.endsWith('.pdf')).toBe(true);
  });
});

describe('resolveSafeResponseHeaders', () => {
  it('keeps the private inline allow-list identical to the web preview list', () => {
    expect(PRIVATE_INLINE_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
    ]);
  });

  it.each([
    ['image/png', 'image/png'],
    ['IMAGE/PNG', 'image/png'],
    ['image/jpg', 'image/jpeg'],
    ['image/webp', 'image/webp'],
    ['image/gif', 'image/gif'],
    ['application/pdf', 'application/pdf'],
  ])('serves private %p inline as %p', (mimeType, contentType) => {
    const result = resolveSafeResponseHeaders({
      mimeType,
      filename: 'file.bin',
      profile: 'private',
    });
    expect(result).toEqual({
      contentType,
      contentDisposition: `inline; filename="file.bin"; filename*=UTF-8''file.bin`,
      inline: true,
    });
  });

  it.each([
    'text/html',
    'text/html; charset=utf-8',
    'application/xhtml+xml',
    'text/xml',
    'application/rss+xml',
    'image/svg+xml',
    'application/javascript',
    'text/plain',
    'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '',
    'garbage',
  ])('downloads private %p as octet-stream', (mimeType) => {
    const result = resolveSafeResponseHeaders({
      mimeType,
      filename: 'x.html',
      profile: 'private',
    });
    expect(result.contentType).toBe('application/octet-stream');
    expect(result.contentDisposition.startsWith('attachment;')).toBe(true);
    expect(result.inline).toBe(false);
  });

  it('serves only the canonical essence, never the stored parameters', () => {
    const result = resolveSafeResponseHeaders({
      mimeType: 'IMAGE/PNG; x=y',
      filename: 'a.png',
      profile: 'private',
    });
    expect(result.contentType).toBe('image/png');
    expect(result.inline).toBe(true);
  });

  it('forces attachment but keeps the canonical type on forceDownload', () => {
    expect(
      resolveSafeResponseHeaders({
        mimeType: 'image/png',
        filename: 'photo.png',
        forceDownload: true,
        profile: 'private',
      }),
    ).toEqual({
      contentType: 'image/png',
      contentDisposition: `attachment; filename="photo.png"; filename*=UTF-8''photo.png`,
      inline: false,
    });
  });

  it('serves public-asset SVG with its real type, but as an attachment', () => {
    expect(
      resolveSafeResponseHeaders({
        mimeType: 'image/svg+xml',
        filename: 'logo.svg',
        profile: 'public-asset',
      }),
    ).toEqual({
      contentType: 'image/svg+xml',
      contentDisposition: `attachment; filename="logo.svg"; filename*=UTF-8''logo.svg`,
      inline: false,
    });
  });

  it.each([
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
  ])('serves public-asset %p inline', (mimeType) => {
    expect(PUBLIC_ASSET_INLINE_MIME_TYPES).toContain(mimeType);
    const result = resolveSafeResponseHeaders({
      mimeType,
      filename: 'media',
      profile: 'public-asset',
    });
    expect(result.contentType).toBe(mimeType);
    expect(result.inline).toBe(true);
  });

  it('does not serve videos inline on the private profile', () => {
    const result = resolveSafeResponseHeaders({
      mimeType: 'video/mp4',
      filename: 'clip.mp4',
      profile: 'private',
    });
    expect(result.contentType).toBe('application/octet-stream');
    expect(result.inline).toBe(false);
  });

  it.each(['text/html', 'application/xml', 'text/javascript', 'font/woff2'])(
    'downloads public-asset %p as octet-stream',
    (mimeType) => {
      const result = resolveSafeResponseHeaders({
        mimeType,
        filename: 'asset',
        profile: 'public-asset',
      });
      expect(result.contentType).toBe('application/octet-stream');
      expect(result.contentDisposition.startsWith('attachment;')).toBe(true);
    },
  );
});

describe('comma-separated content types (browsers use the last value)', () => {
  it.each(['application/pdf;x=1,text/html', 'image/png, text/html'])(
    'treats %p as unparseable and serves it as an octet-stream attachment',
    (mimeType) => {
      expect(normalizeMimeEssence(mimeType)).toBeNull();
      expect(isActiveContentMimeType(mimeType)).toBe(true);
      const result = resolveSafeResponseHeaders({
        mimeType,
        filename: 'x.pdf',
        profile: 'private',
      });
      expect(result.contentType).toBe('application/octet-stream');
      expect(result.inline).toBe(false);
    },
  );
});

describe('public-asset passive media', () => {
  it.each(['video/x-m4v', 'audio/mpeg'])(
    'serves %p inline with its real type',
    (mimeType) => {
      const result = resolveSafeResponseHeaders({
        mimeType,
        filename: 'clip',
        profile: 'public-asset',
      });
      expect(result).toEqual(
        expect.objectContaining({ contentType: mimeType, inline: true }),
      );
    },
  );

  it('keeps a +xml media type as an octet-stream attachment', () => {
    const result = resolveSafeResponseHeaders({
      mimeType: 'video/foo+xml',
      filename: 'clip',
      profile: 'public-asset',
    });
    expect(result.contentType).toBe('application/octet-stream');
    expect(result.inline).toBe(false);
  });

  it('does not extend inline media to the private (applicant) profile', () => {
    const result = resolveSafeResponseHeaders({
      mimeType: 'video/x-m4v',
      filename: 'clip',
      profile: 'private',
    });
    expect(result.contentType).toBe('application/octet-stream');
  });
});
