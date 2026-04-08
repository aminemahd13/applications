import { apiClient } from "@/lib/api";
import { optimizeMicrositeImageForUpload } from "@/lib/microsite-image-optimizer";
import { uploadMicrositeAsset } from "./microsite-media";

jest.mock("@/lib/api", () => ({
  apiClient: jest.fn(),
}));

jest.mock("@/lib/microsite-image-optimizer", () => ({
  optimizeMicrositeImageForUpload: jest.fn(),
}));

describe("uploadMicrositeAsset", () => {
  const apiClientMock = apiClient as jest.MockedFunction<typeof apiClient>;
  const optimizeMock =
    optimizeMicrositeImageForUpload as jest.MockedFunction<
      typeof optimizeMicrositeImageForUpload
    >;
  const originalFetch = global.fetch;

  beforeEach(() => {
    apiClientMock.mockReset();
    optimizeMock.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uploads optimized file metadata and body", async () => {
    const original = new File(["0123456789"], "hero.jpg", { type: "image/jpeg" });
    const optimized = new File(["0123"], "hero.jpg", { type: "image/jpeg" });

    optimizeMock.mockResolvedValue(optimized);
    apiClientMock
      .mockResolvedValueOnce({
        id: "file-1",
        uploadUrl: "https://uploads.example.com/file-1",
        storageKey: "events/event-1/microsite/file-1-hero.jpg",
      } as never)
      .mockResolvedValueOnce({ status: "COMMITTED" } as never);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const result = await uploadMicrositeAsset("event-1", original, "csrf-token");

    expect(optimizeMock).toHaveBeenCalledWith(original);
    expect(apiClientMock).toHaveBeenNthCalledWith(
      1,
      "/admin/events/event-1/microsite/media/uploads",
      expect.objectContaining({
        method: "POST",
        csrfToken: "csrf-token",
        body: {
          originalFilename: "hero.jpg",
          mimeType: "image/jpeg",
          sizeBytes: optimized.size,
        },
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "https://uploads.example.com/file-1",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: optimized,
      }),
    );
    expect(apiClientMock).toHaveBeenNthCalledWith(
      2,
      "/admin/events/event-1/microsite/media/uploads/file-1/commit",
      expect.objectContaining({
        method: "POST",
        csrfToken: "csrf-token",
      }),
    );
    expect(result).toBe("events/event-1/microsite/file-1-hero.jpg");
  });

  it("passes through non-image files unchanged", async () => {
    const video = new File(["video-content"], "clip.mp4", { type: "video/mp4" });
    optimizeMock.mockResolvedValue(video);
    apiClientMock
      .mockResolvedValueOnce({
        id: "file-2",
        uploadUrl: "https://uploads.example.com/file-2",
        storageKey: "events/event-1/microsite/file-2-clip.mp4",
      } as never)
      .mockResolvedValueOnce({ status: "COMMITTED" } as never);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    await uploadMicrositeAsset("event-1", video);

    expect(apiClientMock).toHaveBeenNthCalledWith(
      1,
      "/admin/events/event-1/microsite/media/uploads",
      expect.objectContaining({
        body: {
          originalFilename: "clip.mp4",
          mimeType: "video/mp4",
          sizeBytes: video.size,
        },
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "https://uploads.example.com/file-2",
      expect.objectContaining({ body: video }),
    );
  });

  it("throws when storage upload fails", async () => {
    const file = new File(["small"], "hero.jpg", { type: "image/jpeg" });
    optimizeMock.mockResolvedValue(file);
    apiClientMock.mockResolvedValueOnce({
      id: "file-3",
      uploadUrl: "https://uploads.example.com/file-3",
      storageKey: "events/event-1/microsite/file-3-hero.jpg",
    } as never);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    await expect(uploadMicrositeAsset("event-1", file)).rejects.toThrow(
      "Upload failed: 500",
    );
    expect(apiClientMock).toHaveBeenCalledTimes(1);
  });
});

