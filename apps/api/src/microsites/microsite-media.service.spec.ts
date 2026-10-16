import { BadRequestException } from '@nestjs/common';
import { MicrositeMediaService } from './microsite-media.service';

function createServiceHarness() {
  const prisma = {
    file_objects: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: any) =>
    callback({
      file_objects: prisma.file_objects,
      $executeRawUnsafe: prisma.$executeRawUnsafe,
    }),
  );
  const storage = {
    getPresignedPutUrl: jest.fn(),
    getHeadObject: jest.fn(),
    computeSha256: jest.fn(),
    deleteObject: jest.fn(),
    getPresignedGetUrl: jest.fn(),
    getPresignedGetUrlWithResponseHeaders: jest
      .fn()
      .mockResolvedValue('https://signed-asset'),
  };
  const cls = {
    get: jest.fn().mockReturnValue('user-1'),
  };

  const service = new MicrositeMediaService(
    prisma as any,
    storage as any,
    cls as any,
  );

  return { service, prisma, storage };
}

describe('MicrositeMediaService', () => {
  it('marks committed images as optimization PENDING', async () => {
    const { service, prisma, storage } = createServiceHarness();

    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-1',
      event_id: 'event-1',
      created_by: 'user-1',
      storage_key: 'events/event-1/microsite/file-1-hero.jpg',
      status: 'STAGED',
      mime_type: 'image/jpeg',
    });
    storage.getHeadObject.mockResolvedValue({
      ContentLength: 1200000,
      ContentType: 'image/jpeg',
    });
    storage.computeSha256.mockResolvedValue('sha-1');
    prisma.file_objects.update.mockResolvedValue({ id: 'file-1', status: 'COMMITTED' });

    await service.commitUpload('event-1', 'file-1');

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = $1::uuid'),
      'file-1',
      'PENDING',
    );
  });

  it('marks committed non-images as optimization DONE', async () => {
    const { service, prisma, storage } = createServiceHarness();

    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-2',
      event_id: 'event-1',
      created_by: 'user-1',
      storage_key: 'events/event-1/microsite/file-2-teaser.mp4',
      status: 'STAGED',
      mime_type: 'video/mp4',
    });
    storage.getHeadObject.mockResolvedValue({
      ContentLength: 4200000,
      ContentType: 'video/mp4',
    });
    storage.computeSha256.mockResolvedValue('sha-2');
    prisma.file_objects.update.mockResolvedValue({ id: 'file-2', status: 'COMMITTED' });

    await service.commitUpload('event-1', 'file-2');

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = $1::uuid'),
      'file-2',
      'DONE',
    );
  });

  it('self-heals already committed images to pending optimization when needed', async () => {
    const { service, prisma, storage } = createServiceHarness();

    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-3',
      event_id: 'event-1',
      created_by: 'user-1',
      storage_key: 'events/event-1/microsite/file-3-cover.jpg',
      status: 'COMMITTED',
      mime_type: 'image/jpg',
    });

    const result = await service.commitUpload('event-1', 'file-3');

    expect(storage.getHeadObject).not.toHaveBeenCalled();
    expect(prisma.file_objects.update).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = $1::uuid'),
      'file-3',
    );
    expect(result).toMatchObject({ id: 'file-3', status: 'COMMITTED' });
  });

  it('rejects active content at commit and cleans up the object', async () => {
    const { service, prisma, storage } = createServiceHarness();

    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-4',
      event_id: 'event-1',
      created_by: 'user-1',
      storage_key: 'events/event-1/microsite/file-4-page.html',
      status: 'STAGED',
      mime_type: 'text/html',
    });
    storage.getHeadObject.mockResolvedValue({
      ContentLength: 512,
      ContentType: 'text/html',
    });

    await expect(service.commitUpload('event-1', 'file-4')).rejects.toThrow(
      'This file type is not allowed for security reasons.',
    );
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'events/event-1/microsite/file-4-page.html',
    );
    expect(prisma.file_objects.delete).toHaveBeenCalledWith({
      where: { id: 'file-4' },
    });
    expect(prisma.file_objects.update).not.toHaveBeenCalled();
  });

  it('accepts committed SVG logos', async () => {
    const { service, prisma, storage } = createServiceHarness();

    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-5',
      event_id: 'event-1',
      created_by: 'user-1',
      storage_key: 'events/event-1/microsite/file-5-logo.svg',
      status: 'STAGED',
      mime_type: 'image/svg+xml',
    });
    storage.getHeadObject.mockResolvedValue({
      ContentLength: 2048,
      ContentType: 'image/svg+xml',
    });
    storage.computeSha256.mockResolvedValue('sha-5');
    prisma.file_objects.update.mockResolvedValue({
      id: 'file-5',
      status: 'COMMITTED',
    });

    await expect(
      service.commitUpload('event-1', 'file-5'),
    ).resolves.toMatchObject({ status: 'COMMITTED' });
  });

  describe('registerUpload', () => {
    function register(
      service: MicrositeMediaService,
      data: {
        originalFilename?: string;
        mimeType?: unknown;
        sizeBytes?: unknown;
      },
    ) {
      return service.registerUpload('event-1', {
        originalFilename: 'Hero Image.PNG',
        mimeType: 'image/png',
        sizeBytes: 1024,
        ...data,
      } as any);
    }

    it('stores the MIME essence but signs the PUT with the declared type', async () => {
      const { service, prisma, storage } = createServiceHarness();
      prisma.file_objects.create.mockImplementation(({ data }: any) => data);
      storage.getPresignedPutUrl.mockResolvedValue('https://put-url');

      await expect(
        register(service, { mimeType: 'image/jpg' }),
      ).resolves.toMatchObject({
        uploadUrl: 'https://put-url',
        mimeType: 'image/jpeg',
      });

      const createArgs = prisma.file_objects.create.mock.calls[0][0];
      expect(createArgs.data.mime_type).toBe('image/jpeg');
      expect(createArgs.data.storage_key).toMatch(
        /^events\/event-1\/microsite\/[0-9a-f-]{36}-hero-image\.png$/,
      );
      expect(storage.getPresignedPutUrl).toHaveBeenCalledWith(
        createArgs.data.storage_key,
        'image/jpg',
      );
    });

    it('allows SVG uploads', async () => {
      const { service, prisma } = createServiceHarness();
      prisma.file_objects.create.mockImplementation(({ data }: any) => data);

      await expect(
        register(service, {
          originalFilename: 'logo.svg',
          mimeType: 'image/svg+xml',
        }),
      ).resolves.toMatchObject({ mimeType: 'image/svg+xml' });
    });

    it.each([
      'text/html',
      'TEXT/HTML; charset=utf-8',
      'application/xhtml+xml',
      'text/xml',
      'application/rss+xml',
      'application/javascript',
      'application/x-msdownload',
    ])('rejects %p', async (mimeType) => {
      const { service, prisma, storage } = createServiceHarness();

      await expect(register(service, { mimeType })).rejects.toThrow(
        'This file type is not allowed for security reasons.',
      );
      expect(prisma.file_objects.create).not.toHaveBeenCalled();
      expect(storage.getPresignedPutUrl).not.toHaveBeenCalled();
    });

    it.each(['', 'garbage', 'image/', undefined, 42])(
      'rejects unparseable MIME %p',
      async (mimeType) => {
        const { service, prisma } = createServiceHarness();

        await expect(register(service, { mimeType })).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.file_objects.create).not.toHaveBeenCalled();
      },
    );

    it.each([0, -5, 1.5, 'abc', undefined, 151 * 1024 * 1024])(
      'rejects invalid sizeBytes %p',
      async (sizeBytes) => {
        const { service, prisma } = createServiceHarness();

        await expect(register(service, { sizeBytes })).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.file_objects.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('getPublicAssetUrl', () => {
    const key = 'events/event-1/microsite/asset-1-file';

    function mockAsset(
      prisma: ReturnType<typeof createServiceHarness>['prisma'],
      mimeType: string,
      originalFilename: string,
    ) {
      prisma.file_objects.findFirst.mockResolvedValue({
        id: 'asset-1',
        mime_type: mimeType,
        original_filename: originalFilename,
      });
    }

    it('selects the type and filename of committed, non-archived assets', async () => {
      const { service, prisma } = createServiceHarness();
      mockAsset(prisma, 'image/png', 'hero.png');

      await expect(service.getPublicAssetUrl(key)).resolves.toBe(
        'https://signed-asset',
      );
      expect(prisma.file_objects.findFirst).toHaveBeenCalledWith({
        where: {
          storage_key: key,
          status: 'COMMITTED',
          events: { is: { status: { not: 'archived' } } },
        },
        select: { id: true, mime_type: true, original_filename: true },
      });
    });

    it('serves png inline with public caching', async () => {
      const { service, prisma, storage } = createServiceHarness();
      mockAsset(prisma, 'image/png', 'hero.png');

      await service.getPublicAssetUrl(key);

      expect(storage.getPresignedGetUrlWithResponseHeaders).toHaveBeenCalledWith(
        key,
        {
          contentType: 'image/png',
          contentDisposition: `inline; filename="hero.png"; filename*=UTF-8''hero.png`,
          cacheControl: 'public, max-age=3600',
        },
        3600,
      );
      expect(storage.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('serves svg with its type but as an attachment', async () => {
      const { service, prisma, storage } = createServiceHarness();
      mockAsset(prisma, 'image/svg+xml', 'logo.svg');

      await service.getPublicAssetUrl(key);

      const [, headers] =
        storage.getPresignedGetUrlWithResponseHeaders.mock.calls[0];
      expect(headers.contentType).toBe('image/svg+xml');
      expect(headers.contentDisposition.startsWith('attachment;')).toBe(true);
    });

    it('serves legacy html as an octet-stream attachment', async () => {
      const { service, prisma, storage } = createServiceHarness();
      mockAsset(prisma, 'text/html', 'page.html');

      await service.getPublicAssetUrl(key);

      const [, headers] =
        storage.getPresignedGetUrlWithResponseHeaders.mock.calls[0];
      expect(headers.contentType).toBe('application/octet-stream');
      expect(headers.contentDisposition.startsWith('attachment;')).toBe(true);
    });

    it('serves videos inline', async () => {
      const { service, prisma, storage } = createServiceHarness();
      mockAsset(prisma, 'video/mp4', 'teaser.mp4');

      await service.getPublicAssetUrl(key);

      const [, headers] =
        storage.getPresignedGetUrlWithResponseHeaders.mock.calls[0];
      expect(headers.contentType).toBe('video/mp4');
      expect(headers.contentDisposition.startsWith('inline;')).toBe(true);
    });
  });
});
