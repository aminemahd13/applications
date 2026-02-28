export type MediaFitMode = "contain" | "cover";

export const MAX_COVER_CROP_FRACTION = 0.1;

type Size = {
  width: number;
  height: number;
};

function isValidDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidSize(size?: Partial<Size> | null): size is Size {
  if (!size) return false;
  return isValidDimension(size.width ?? 0) && isValidDimension(size.height ?? 0);
}

export function resolveAdaptiveMediaFit(
  imageSize?: Partial<Size> | null,
  frameSize?: Partial<Size> | null,
  maxCoverCropFraction: number = MAX_COVER_CROP_FRACTION,
): MediaFitMode {
  if (!isValidSize(imageSize) || !isValidSize(frameSize)) return "contain";

  const imageAspect = imageSize.width / imageSize.height;
  const frameAspect = frameSize.width / frameSize.height;
  if (!Number.isFinite(imageAspect) || !Number.isFinite(frameAspect)) return "contain";

  const visibleFraction = Math.min(frameAspect / imageAspect, imageAspect / frameAspect);
  if (!Number.isFinite(visibleFraction)) return "contain";

  const normalizedVisible = Math.max(0, Math.min(1, visibleFraction));
  const cropFraction = 1 - normalizedVisible;

  return cropFraction <= maxCoverCropFraction ? "cover" : "contain";
}
