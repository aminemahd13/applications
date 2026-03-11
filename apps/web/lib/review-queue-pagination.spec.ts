import {
  appendUniqueQueueItems,
  normalizeReviewQueueResponse,
  shouldAutoLoadNext,
} from "./review-queue-pagination";

describe("review-queue-pagination", () => {
  it("normalizes legacy array responses", () => {
    const response = normalizeReviewQueueResponse<{ id: string }>([
      { id: "a" },
      { id: "b" },
    ]);

    expect(response.items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(response.meta).toEqual({ hasMore: false, nextCursor: null });
  });

  it("normalizes paginated responses with meta", () => {
    const response = normalizeReviewQueueResponse<{ id: string }>({
      data: [{ id: "a" }],
      meta: {
        hasMore: true,
        nextCursor: "cursor-1",
      },
    });

    expect(response.items).toEqual([{ id: "a" }]);
    expect(response.meta).toEqual({ hasMore: true, nextCursor: "cursor-1" });
  });

  it("appends incoming queue items without duplicates", () => {
    const merged = appendUniqueQueueItems(
      [
        { id: "a", value: 1 },
        { id: "b", value: 2 },
      ],
      [
        { id: "b", value: 3 },
        { id: "c", value: 4 },
      ],
    );

    expect(merged).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 4 },
    ]);
  });

  it("auto-loads only at queue end when more pages exist", () => {
    expect(
      shouldAutoLoadNext({
        currentIndex: 4,
        queueLength: 5,
        hasMore: true,
        isLoadingMore: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoLoadNext({
        currentIndex: 3,
        queueLength: 5,
        hasMore: true,
        isLoadingMore: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoLoadNext({
        currentIndex: 4,
        queueLength: 5,
        hasMore: false,
        isLoadingMore: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoLoadNext({
        currentIndex: 4,
        queueLength: 5,
        hasMore: true,
        isLoadingMore: true,
      }),
    ).toBe(false);
  });
});

