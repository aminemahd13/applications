import {
  selectSmallerFileCandidate,
  shouldOptimizeMicrositeImage,
} from "./microsite-image-optimizer";

describe("microsite image optimizer helpers", () => {
  it("optimizes only supported raster image formats", () => {
    expect(shouldOptimizeMicrositeImage("image/jpeg")).toBe(true);
    expect(shouldOptimizeMicrositeImage("image/jpg")).toBe(true);
    expect(shouldOptimizeMicrositeImage("image/pjpeg")).toBe(true);
    expect(shouldOptimizeMicrositeImage("image/png")).toBe(true);
    expect(shouldOptimizeMicrositeImage("image/webp")).toBe(true);

    expect(shouldOptimizeMicrositeImage("image/svg+xml")).toBe(false);
    expect(shouldOptimizeMicrositeImage("image/gif")).toBe(false);
    expect(shouldOptimizeMicrositeImage("video/mp4")).toBe(false);
    expect(shouldOptimizeMicrositeImage("application/pdf")).toBe(false);
  });

  it("keeps the original file when candidate is not smaller", () => {
    const original = new File(["abcdef"], "photo.jpg", { type: "image/jpeg" });
    const larger = new File(["abcdefghi"], "photo.jpg", { type: "image/jpeg" });
    const equal = new File(["abcdef"], "photo.jpg", { type: "image/jpeg" });

    expect(selectSmallerFileCandidate(original, larger)).toBe(original);
    expect(selectSmallerFileCandidate(original, equal)).toBe(original);
    expect(selectSmallerFileCandidate(original, null)).toBe(original);
  });

  it("chooses the compressed candidate when it is smaller", () => {
    const original = new File(["abcdefghi"], "photo.jpg", { type: "image/jpeg" });
    const smaller = new File(["abc"], "photo.jpg", { type: "image/jpeg" });

    expect(selectSmallerFileCandidate(original, smaller)).toBe(smaller);
  });
});
