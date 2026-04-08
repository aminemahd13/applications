const MICROSITE_IMAGE_TARGET_SIZE_BYTES = 800 * 1024;
const MICROSITE_IMAGE_MAX_EDGE_PX = 1920;
const DIMENSION_SCALE_STEPS = [1, 0.9, 0.82, 0.74, 0.66];
const JPEG_WEBP_QUALITY_STEPS = [0.82, 0.76, 0.7, 0.64];

const TRANSCODE_SKIP_MIME_TYPES = new Set(["image/svg+xml", "image/gif"]);
const OPTIMIZABLE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeMimeType(mimeType: string | undefined): string {
  const normalized = String(mimeType ?? "").trim().toLowerCase();
  if (normalized === "image/jpg" || normalized === "image/pjpeg") {
    return "image/jpeg";
  }
  return normalized;
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isBlobLike(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isRasterImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") && !TRANSCODE_SKIP_MIME_TYPES.has(mimeType);
}

function isOptimizableMimeType(mimeType: string): boolean {
  return OPTIMIZABLE_MIME_TYPES.has(mimeType);
}

export function shouldOptimizeMicrositeImage(mimeType: string | undefined): boolean {
  const normalized = normalizeMimeType(mimeType);
  return isRasterImageMimeType(normalized) && isOptimizableMimeType(normalized);
}

export function selectSmallerFileCandidate(original: File, candidate?: File | null): File {
  if (!candidate) return original;
  return candidate.size < original.size ? candidate : original;
}

function roundDimension(value: number): number {
  return Math.max(1, Math.round(value));
}

type DecodedDimensions = {
  width: number;
  height: number;
};

function decodeImageDimensions(file: Blob): Promise<DecodedDimensions> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      reject(new Error("Failed to decode image"));
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode image"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

async function renderCandidate(
  file: File,
  mimeType: string,
  width: number,
  height: number,
  quality?: number,
): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image for compression"));
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!isBlobLike(blob)) {
      return null;
    }

    const encodedType = normalizeMimeType(blob.type) || mimeType;
    if (encodedType !== mimeType) {
      return null;
    }

    return new File([blob], file.name, {
      type: mimeType,
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildCandidateDimensions(width: number, height: number): Array<{ width: number; height: number }> {
  const maxEdge = Math.max(width, height);
  const resizeScale = maxEdge > MICROSITE_IMAGE_MAX_EDGE_PX ? MICROSITE_IMAGE_MAX_EDGE_PX / maxEdge : 1;
  const baseWidth = roundDimension(width * resizeScale);
  const baseHeight = roundDimension(height * resizeScale);

  const dimensions: Array<{ width: number; height: number }> = [];
  for (const scale of DIMENSION_SCALE_STEPS) {
    const scaledWidth = roundDimension(baseWidth * scale);
    const scaledHeight = roundDimension(baseHeight * scale);
    const duplicate = dimensions.some(
      (existing) => existing.width === scaledWidth && existing.height === scaledHeight,
    );
    if (!duplicate) {
      dimensions.push({ width: scaledWidth, height: scaledHeight });
    }
  }
  return dimensions;
}

function getQualitySteps(mimeType: string): Array<number | undefined> {
  if (mimeType === "image/jpeg" || mimeType === "image/webp") {
    return JPEG_WEBP_QUALITY_STEPS;
  }
  return [undefined];
}

export async function optimizeMicrositeImageForUpload(file: File): Promise<File> {
  const mimeType = normalizeMimeType(file.type);
  if (!isBrowserEnvironment()) return file;
  if (!shouldOptimizeMicrositeImage(mimeType)) return file;

  let dimensions: DecodedDimensions;
  try {
    dimensions = await decodeImageDimensions(file);
  } catch {
    return file;
  }

  if (!dimensions.width || !dimensions.height) {
    return file;
  }

  const candidateDimensions = buildCandidateDimensions(dimensions.width, dimensions.height);
  const qualitySteps = getQualitySteps(mimeType);

  let best = file;
  for (const size of candidateDimensions) {
    for (const quality of qualitySteps) {
      let candidate: File | null = null;
      try {
        candidate = await renderCandidate(file, mimeType, size.width, size.height, quality);
      } catch {
        candidate = null;
      }

      if (!candidate) continue;
      if (candidate.size < best.size) {
        best = candidate;
      }
      if (best.size <= MICROSITE_IMAGE_TARGET_SIZE_BYTES) {
        return best;
      }
    }
  }

  return selectSmallerFileCandidate(file, best);
}
