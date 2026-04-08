import sharp from 'sharp';
import { MicrositeMediaOptimizerService } from './microsite-media-optimizer.service';

function buildNoiseBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(width * height * 3);
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = (index * 31) % 251;
  }
  return buffer;
}

describe('MicrositeMediaOptimizerService', () => {
  beforeEach(() => {
    delete process.env.MICROSITE_MEDIA_OPTIMIZATION_TARGET_BYTES;
    delete process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_EDGE_PX;
  });

  it('compresses large JPEG input while keeping format', async () => {
    const service = new MicrositeMediaOptimizerService();
    const source = await sharp(buildNoiseBuffer(2800, 1800), {
      raw: { width: 2800, height: 1800, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const result = await service.optimizeBuffer(source, 'image/jpeg');

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.changed).toBe(true);
    expect(result.buffer.byteLength).toBeLessThan(source.byteLength);
  });

  it('skips unsupported image mime types', async () => {
    const service = new MicrositeMediaOptimizerService();
    const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    const result = await service.optimizeBuffer(source, 'image/svg+xml');

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(result.buffer).toBe(source);
  });

  it('keeps already small images without re-encoding', async () => {
    const service = new MicrositeMediaOptimizerService();
    const source = await sharp({
      create: {
        width: 240,
        height: 140,
        channels: 3,
        background: '#ffcc00',
      },
    })
      .jpeg({ quality: 82 })
      .toBuffer();

    const result = await service.optimizeBuffer(source, 'image/jpeg');

    expect(source.byteLength).toBeLessThan(service.targetBytes);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('already-small');
    expect(result.buffer).toBe(source);
  });

  it('still resizes high-resolution images even when byte size is under target', async () => {
    const service = new MicrositeMediaOptimizerService();
    const source = await sharp({
      create: {
        width: 4200,
        height: 2400,
        channels: 3,
        background: '#f5f5f5',
      },
    })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();

    expect(source.byteLength).toBeLessThan(service.targetBytes);

    const result = await service.optimizeBuffer(source, 'image/png');
    const metadata = await sharp(result.buffer).metadata();

    expect(result.changed).toBe(true);
    expect(result.reason).toBe('resize-only');
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(
      service.maxEdgePx,
    );
  });

  it('normalizes jpg aliases to jpeg for optimization', async () => {
    const service = new MicrositeMediaOptimizerService();
    const source = await sharp(buildNoiseBuffer(2000, 1200), {
      raw: { width: 2000, height: 1200, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const result = await service.optimizeBuffer(source, 'image/jpg');

    expect(result.mimeType).toBe('image/jpeg');
    expect(service.isOptimizableImageMimeType('image/jpg')).toBe(true);
  });
});
