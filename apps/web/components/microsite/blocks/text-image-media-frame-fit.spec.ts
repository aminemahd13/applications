import { resolveAdaptiveMediaFit } from "./text-image-media-frame-fit";

describe("resolveAdaptiveMediaFit", () => {
  it("returns cover when image and frame have the same aspect ratio", () => {
    expect(
      resolveAdaptiveMediaFit(
        { width: 1600, height: 900 },
        { width: 1280, height: 720 },
      ),
    ).toBe("cover");
  });

  it("returns cover when expected crop is at most 10%", () => {
    expect(
      resolveAdaptiveMediaFit(
        { width: 1700, height: 1000 },
        { width: 1280, height: 720 },
      ),
    ).toBe("cover");
  });

  it("returns contain when expected crop exceeds 10%", () => {
    expect(
      resolveAdaptiveMediaFit(
        { width: 4, height: 3 },
        { width: 16, height: 9 },
      ),
    ).toBe("contain");
  });

  it("returns contain when any size is missing or invalid", () => {
    expect(resolveAdaptiveMediaFit(undefined, { width: 16, height: 9 })).toBe("contain");
    expect(resolveAdaptiveMediaFit({ width: 1600, height: 900 }, null)).toBe("contain");
    expect(resolveAdaptiveMediaFit({ width: 0, height: 900 }, { width: 16, height: 9 })).toBe(
      "contain",
    );
    expect(resolveAdaptiveMediaFit({ width: 1600, height: 900 }, { width: 16, height: 0 })).toBe(
      "contain",
    );
  });
});
