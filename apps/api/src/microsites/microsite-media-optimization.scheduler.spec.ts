import { MicrositeMediaOptimizationSchedulerService } from './microsite-media-optimization.scheduler';
import { MicrositeMediaOptimizerService } from './microsite-media-optimizer.service';

type ClaimedAssetRow = {
  id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: string;
  media_optimization_attempts: number;
};

function createRow(
  overrides: Partial<ClaimedAssetRow> = {},
): ClaimedAssetRow {
  return {
    id: 'file-1',
    storage_key: 'events/event-1/microsite/file-1-hero.jpg',
    mime_type: 'image/jpeg',
    size_bytes: '1600000',
    media_optimization_attempts: 1,
    ...overrides,
  };
}

describe('MicrositeMediaOptimizationSchedulerService', () => {
  const originalBatch = process.env.MICROSITE_MEDIA_OPTIMIZATION_BATCH_SIZE;
  const originalAttempts = process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_ATTEMPTS;
  const originalMaxBatchesPerRun =
    process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_BATCHES_PER_RUN;

  beforeEach(() => {
    process.env.MICROSITE_MEDIA_OPTIMIZATION_BATCH_SIZE = '2';
    process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_ATTEMPTS = '3';
    process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_BATCHES_PER_RUN = '4';
  });

  afterEach(() => {
    if (originalBatch === undefined) {
      delete process.env.MICROSITE_MEDIA_OPTIMIZATION_BATCH_SIZE;
    } else {
      process.env.MICROSITE_MEDIA_OPTIMIZATION_BATCH_SIZE = originalBatch;
    }

    if (originalAttempts === undefined) {
      delete process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_ATTEMPTS;
    } else {
      process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_ATTEMPTS = originalAttempts;
    }

    if (originalMaxBatchesPerRun === undefined) {
      delete process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_BATCHES_PER_RUN;
    } else {
      process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_BATCHES_PER_RUN =
        originalMaxBatchesPerRun;
    }
  });

  it('claims and optimizes pending assets', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const storage = {
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('original-image-bytes')),
      putObjectBuffer: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const optimizer = {
      optimizeBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('optimized-bytes'),
        mimeType: 'image/jpeg',
        changed: true,
        reason: 'compressed',
      }),
    };

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([createRow()])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockResolvedValue(1);

    const service = new MicrositeMediaOptimizationSchedulerService(
      prisma as any,
      storage as any,
      optimizer as unknown as MicrositeMediaOptimizerService,
    );

    await service.optimizePendingMicrositeImages();

    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WITH candidates AS'),
      3,
      2,
    );
    expect(storage.getObjectBuffer).toHaveBeenCalledWith(
      'events/event-1/microsite/file-1-hero.jpg',
    );
    expect(optimizer.optimizeBuffer).toHaveBeenCalled();
    expect(storage.putObjectBuffer).toHaveBeenCalledWith(
      'events/event-1/microsite/file-1-hero.jpg',
      Buffer.from('optimized-bytes'),
      'image/jpeg',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = $1::uuid'),
      'file-1',
      Buffer.from('optimized-bytes').byteLength,
      'image/jpeg',
      expect.any(String),
    );
  });

  it('does not re-enter while already running', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };

    const service = new MicrositeMediaOptimizationSchedulerService(
      prisma as any,
      { getObjectBuffer: jest.fn(), putObjectBuffer: jest.fn() } as any,
      { optimizeBuffer: jest.fn() } as any,
    );

    (service as any).isRunning = true;
    await service.optimizePendingMicrositeImages();

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('marks assets as failed when max retries are exhausted', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const storage = {
      getObjectBuffer: jest.fn().mockRejectedValue(new Error('cannot read object')),
      putObjectBuffer: jest.fn(),
    };

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        createRow({
          id: 'file-2',
          media_optimization_attempts: 3,
        }),
      ])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockResolvedValue(1);

    const service = new MicrositeMediaOptimizationSchedulerService(
      prisma as any,
      storage as any,
      { optimizeBuffer: jest.fn() } as any,
    );

    await service.optimizePendingMicrositeImages();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = $1::uuid'),
      'file-2',
      'FAILED',
      expect.stringContaining('cannot read object'),
    );
  });

  it('drains multiple batches in one scheduler run', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const storage = {
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('image-bytes')),
      putObjectBuffer: jest.fn(),
    };
    const optimizer = {
      optimizeBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('image-bytes'),
        mimeType: 'image/jpeg',
        changed: false,
        reason: 'already-small',
      }),
    };

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([createRow({ id: 'file-a' })])
      .mockResolvedValueOnce([createRow({ id: 'file-b' })])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockResolvedValue(1);

    const service = new MicrositeMediaOptimizationSchedulerService(
      prisma as any,
      storage as any,
      optimizer as unknown as MicrositeMediaOptimizerService,
    );

    await service.optimizePendingMicrositeImages();

    expect(optimizer.optimizeBuffer).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    expect(storage.putObjectBuffer).not.toHaveBeenCalled();
  });

  it('caps work per run with max batches setting', async () => {
    process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_BATCHES_PER_RUN = '1';
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const storage = {
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('image-bytes')),
      putObjectBuffer: jest.fn(),
    };
    const optimizer = {
      optimizeBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('image-bytes'),
        mimeType: 'image/jpeg',
        changed: false,
        reason: 'already-small',
      }),
    };

    prisma.$queryRawUnsafe.mockResolvedValue([createRow()]);
    prisma.$executeRawUnsafe.mockResolvedValue(1);

    const service = new MicrositeMediaOptimizationSchedulerService(
      prisma as any,
      storage as any,
      optimizer as unknown as MicrositeMediaOptimizerService,
    );

    await service.optimizePendingMicrositeImages();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(optimizer.optimizeBuffer).toHaveBeenCalledTimes(1);
  });
});
