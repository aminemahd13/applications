jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('signed-url'),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

const getSignedUrlMock = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

function createService() {
  const values: Record<string, string> = {
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_BUCKET: 'uploads',
  };
  const configService = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  return new StorageService(configService as any);
}

function lastCommandInput(): Record<string, unknown> {
  const call =
    getSignedUrlMock.mock.calls[getSignedUrlMock.mock.calls.length - 1];
  return (call[1] as unknown as { input: Record<string, unknown> }).input;
}

describe('StorageService presigned GET URLs', () => {
  beforeEach(() => {
    getSignedUrlMock.mockClear();
  });

  it('signs response content-type, disposition and cache-control overrides', async () => {
    const service = createService();

    await expect(
      service.getPresignedGetUrlWithResponseHeaders(
        'events/e1/uploads/file.html',
        {
          contentType: 'application/octet-stream',
          contentDisposition: 'attachment; filename="file.html"',
          cacheControl: 'private, no-store',
        },
        600,
      ),
    ).resolves.toBe('signed-url');

    expect(lastCommandInput()).toEqual(
      expect.objectContaining({
        Bucket: 'uploads',
        Key: 'events/e1/uploads/file.html',
        ResponseContentType: 'application/octet-stream',
        ResponseContentDisposition: 'attachment; filename="file.html"',
        ResponseCacheControl: 'private, no-store',
      }),
    );
    expect(getSignedUrlMock.mock.calls[0][2]).toEqual({ expiresIn: 600 });
  });

  it('keeps getPresignedGetUrlWithDisposition sending only the disposition', async () => {
    const service = createService();

    await service.getPresignedGetUrlWithDisposition(
      'exports/job.zip',
      'attachment; filename="job.zip"',
    );

    const input = lastCommandInput();
    expect(input.ResponseContentDisposition).toBe(
      'attachment; filename="job.zip"',
    );
    expect(input.ResponseContentType).toBeUndefined();
    expect(input.ResponseCacheControl).toBeUndefined();
    expect(getSignedUrlMock.mock.calls[0][2]).toEqual({ expiresIn: 3600 });
  });

  it('keeps getPresignedGetUrl free of response overrides', async () => {
    const service = createService();

    await service.getPresignedGetUrl('events/e1/certificates/pdf/c.pdf', 900);

    const input = lastCommandInput();
    expect(input.Key).toBe('events/e1/certificates/pdf/c.pdf');
    expect(input.ResponseContentDisposition).toBeUndefined();
    expect(input.ResponseContentType).toBeUndefined();
    expect(input.ResponseCacheControl).toBeUndefined();
    expect(getSignedUrlMock.mock.calls[0][2]).toEqual({ expiresIn: 900 });
  });
});
