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
      expect.stringContaining('"media_optimization_status" = $2'),
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
      expect.stringContaining('"media_optimization_status" = $2'),
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
      expect.stringContaining('"media_optimization_status" = \'PENDING\''),
      'file-3',
    );
    expect(result).toMatchObject({ id: 'file-3', status: 'COMMITTED' });
  });
});
