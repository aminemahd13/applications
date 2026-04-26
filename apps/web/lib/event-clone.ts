export interface CloneSourceApiEvent {
  id: string;
  title?: string;
  name?: string;
  slug?: string;
  status?: string;
}

export interface CloneSourceOption {
  id: string;
  title: string;
  slug: string;
  status: string;
}

type EventListResponse =
  | CloneSourceApiEvent[]
  | {
      data?: CloneSourceApiEvent[];
      events?: CloneSourceApiEvent[];
      meta?: {
        nextCursor?: string | null;
        hasMore?: boolean;
      };
    };

type ApiClientFn = <T>(path: string) => Promise<T>;

export function resolveCreateEventEndpoint(sourceEventId?: string | null): string {
  return sourceEventId ? "/admin/events/clone" : "/admin/events";
}

export function buildCloneSourceListPath(
  cursor?: string | null,
  limit = 100,
): string {
  const params = new URLSearchParams();
  params.set("includeArchived", "true");
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }
  return `/admin/events?${params.toString()}`;
}

function unwrapEventListResponse(response: EventListResponse): CloneSourceApiEvent[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.events)) return response.events;
  return [];
}

function normalizeCloneSource(event: CloneSourceApiEvent): CloneSourceOption {
  return {
    id: event.id,
    title: event.title ?? event.name ?? "Untitled event",
    slug: event.slug ?? "",
    status: event.status?.toLowerCase() ?? "draft",
  };
}

export async function fetchCloneSourceOptions(
  apiClient: ApiClientFn,
): Promise<CloneSourceOption[]> {
  const options: CloneSourceOption[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pageCount = 0;

  while (pageCount < 25) {
    pageCount += 1;
    const response = await apiClient<EventListResponse>(
      buildCloneSourceListPath(cursor),
    );
    const page = unwrapEventListResponse(response).map(normalizeCloneSource);
    for (const option of page) {
      if (seen.has(option.id)) continue;
      seen.add(option.id);
      options.push(option);
    }

    if (Array.isArray(response)) {
      break;
    }

    const nextCursor = response.meta?.nextCursor ?? null;
    const hasMore = Boolean(response.meta?.hasMore && nextCursor);
    if (!hasMore) {
      break;
    }
    cursor = nextCursor;
  }

  return options;
}
