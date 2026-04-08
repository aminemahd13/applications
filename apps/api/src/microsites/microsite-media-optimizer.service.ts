import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

const DEFAULT_TARGET_BYTES = 800 * 1024;
const DEFAULT_MAX_EDGE_PX = 1920;

const QUALITY_STEPS: Record<string, number[]> = {
  'image/jpeg': [82, 76, 70, 64],
  'image/webp': [82, 76, 70, 64],
  'image/png': [85, 75, 65],
};

const DIMENSION_STEPS = [1, 0.92, 0.84, 0.76, 0.68];
const OPTIMIZABLE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type MicrositeMediaOptimizationResult = {
  buffer: Buffer;
  mimeType: string;
  changed: boolean;
  reason:
    | 'unsupported'
    | 'kept-original'
    | 'compressed'
    | 'resize-only'
    | 'already-small';
};

@Injectable()
export class MicrositeMediaOptimizerService {
  readonly targetBytes = Math.max(
    Number(process.env.MICROSITE_MEDIA_OPTIMIZATION_TARGET_BYTES ?? DEFAULT_TARGET_BYTES),
    64 * 1024,
  );
  readonly maxEdgePx = Math.max(
    Number(process.env.MICROSITE_MEDIA_OPTIMIZATION_MAX_EDGE_PX ?? DEFAULT_MAX_EDGE_PX),
    320,
  );

  isOptimizableImageMimeType(rawMimeType: string | undefined): boolean {
    const mimeType = this.normalizeMimeType(rawMimeType);
    return OPTIMIZABLE_IMAGE_MIME_TYPES.has(mimeType);
  }

  async optimizeBuffer(
    inputBuffer: Buffer,
    rawMimeType: string | undefined,
  ): Promise<MicrositeMediaOptimizationResult> {
    const mimeType = this.normalizeMimeType(rawMimeType);
    if (!this.isOptimizableImageMimeType(mimeType)) {
      return {
        buffer: inputBuffer,
        mimeType,
        changed: false,
        reason: 'unsupported',
      };
    }

    const metadata = await sharp(inputBuffer, { failOn: 'none' })
      .metadata()
      .catch(() => null);
    if (!metadata?.width || !metadata?.height) {
      return {
        buffer: inputBuffer,
        mimeType,
        changed: false,
        reason: 'kept-original',
      };
    }

    const maxEdge = Math.max(metadata.width, metadata.height);
    const resizeToMaxScale = maxEdge > this.maxEdgePx ? this.maxEdgePx / maxEdge : 1;
    const requiresResizeForMaxEdge = resizeToMaxScale < 1;
    if (inputBuffer.byteLength <= this.targetBytes && !requiresResizeForMaxEdge) {
      return {
        buffer: inputBuffer,
        mimeType,
        changed: false,
        reason: 'already-small',
      };
    }

    const baseWidth = Math.max(1, Math.round(metadata.width * resizeToMaxScale));
    const baseHeight = Math.max(1, Math.round(metadata.height * resizeToMaxScale));
    const qualitySteps = QUALITY_STEPS[mimeType] ?? QUALITY_STEPS['image/jpeg'];

    let bestBuffer = inputBuffer;
    let bestReason: MicrositeMediaOptimizationResult['reason'] =
      requiresResizeForMaxEdge ? 'resize-only' : 'kept-original';
    const hasResizedForMaxEdge =
      baseWidth < metadata.width || baseHeight < metadata.height;

    for (const dimensionScale of DIMENSION_STEPS) {
      const width = Math.max(1, Math.round(baseWidth * dimensionScale));
      const height = Math.max(1, Math.round(baseHeight * dimensionScale));

      for (const quality of qualitySteps) {
        const candidate = await this.encodeWithFormat(
          inputBuffer,
          mimeType,
          width,
          height,
          quality,
        ).catch(() => null);
        if (!candidate) continue;

        if (candidate.byteLength < bestBuffer.byteLength) {
          bestBuffer = candidate;
          bestReason = hasResizedForMaxEdge ? 'resize-only' : 'compressed';
        }

        if (bestBuffer.byteLength <= this.targetBytes) {
          return {
            buffer: bestBuffer,
            mimeType,
            changed: bestBuffer !== inputBuffer,
            reason: bestReason,
          };
        }
      }
    }

    return {
      buffer: bestBuffer,
      mimeType,
      changed: bestBuffer !== inputBuffer,
      reason: bestReason,
    };
  }

  private normalizeMimeType(rawMimeType: string | undefined): string {
    const normalized = String(rawMimeType ?? 'application/octet-stream')
      .trim()
      .toLowerCase();
    if (normalized === 'image/jpg' || normalized === 'image/pjpeg') {
      return 'image/jpeg';
    }
    return normalized;
  }

  private async encodeWithFormat(
    inputBuffer: Buffer,
    mimeType: string,
    width: number,
    height: number,
    quality: number,
  ): Promise<Buffer> {
    const pipeline = sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize({
        width,
        height,
        fit: 'inside',
        withoutEnlargement: true,
      });

    switch (mimeType) {
      case 'image/jpeg':
        return pipeline
          .jpeg({
            quality,
            progressive: true,
            mozjpeg: true,
            force: true,
          })
          .toBuffer();
      case 'image/webp':
        return pipeline
          .webp({
            quality,
            effort: 4,
            smartSubsample: true,
            force: true,
          })
          .toBuffer();
      case 'image/png':
        return pipeline
          .png({
            compressionLevel: 9,
            effort: 8,
            palette: true,
            quality,
            force: true,
          })
          .toBuffer();
      default:
        return inputBuffer;
    }
  }
}
