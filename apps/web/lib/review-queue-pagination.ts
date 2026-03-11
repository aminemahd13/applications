export interface ReviewQueueMeta {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ReviewQueueResponse<T> {
  data?: T[];
  meta?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  } | null;
}

export function normalizeReviewQueueResponse<T>(
  payload: unknown,
): { items: T[]; meta: ReviewQueueMeta } {
  if (Array.isArray(payload)) {
    return {
      items: payload as T[],
      meta: {
        hasMore: false,
        nextCursor: null,
      },
    };
  }

  const response = (payload ?? {}) as ReviewQueueResponse<T>;
  const items = Array.isArray(response.data) ? response.data : [];
  const hasMore = response.meta?.hasMore === true;
  const nextCursor =
    typeof response.meta?.nextCursor === "string" &&
    response.meta.nextCursor.length > 0
      ? response.meta.nextCursor
      : null;

  return {
    items,
    meta: {
      hasMore,
      nextCursor,
    },
  };
}

export function appendUniqueQueueItems<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function shouldAutoLoadNext(params: {
  currentIndex: number;
  queueLength: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}): boolean {
  const { currentIndex, queueLength, hasMore, isLoadingMore } = params;
  if (!hasMore || isLoadingMore) return false;
  if (queueLength === 0) return false;
  return currentIndex >= queueLength - 1;
}

