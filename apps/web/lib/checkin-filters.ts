import type {
  CheckinAttendeeStatus,
  CheckinExportColumn,
  CsvPortal,
} from "@event-platform/shared";

export interface CheckinCsvExportPayload {
  status: CheckinAttendeeStatus;
  tags?: string[];
  search?: string;
  columns?: CheckinExportColumn[];
  portal?: CsvPortal;
}

function dedupeTrimmed(values?: readonly string[]): string[] {
  if (!values || values.length === 0) return [];
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      deduped.add(normalized);
    }
  }
  return Array.from(deduped);
}

export function normalizeCheckinTags(tags?: readonly string[]): string[] {
  return dedupeTrimmed(tags);
}

export function buildCheckinAttendeesQuery(input: {
  status?: CheckinAttendeeStatus;
  tags?: readonly string[];
  search?: string;
  page?: number;
  pageSize?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  const status = input.status ?? "all";
  params.set("status", status);

  const tags = normalizeCheckinTags(input.tags);
  if (tags.length > 0) {
    params.set("tags", tags.join(","));
  }

  const search = input.search?.trim();
  if (search) {
    params.set("search", search);
  }

  if (Number.isFinite(input.page) && (input.page ?? 0) > 0) {
    params.set("page", String(input.page));
  }
  if (Number.isFinite(input.pageSize) && (input.pageSize ?? 0) > 0) {
    params.set("pageSize", String(input.pageSize));
  }

  return params;
}

export function buildCheckinExportRequest(input: {
  status?: CheckinAttendeeStatus;
  tags?: readonly string[];
  search?: string;
  columns?: readonly CheckinExportColumn[];
  portal?: CsvPortal;
}): CheckinCsvExportPayload {
  const request: CheckinCsvExportPayload = {
    status: input.status ?? "all",
  };
  const tags = normalizeCheckinTags(input.tags);
  if (tags.length > 0) {
    request.tags = tags;
  }
  const search = input.search?.trim();
  if (search) {
    request.search = search;
  }
  const columns = dedupeTrimmed(input.columns as readonly string[]) as
    | CheckinExportColumn[]
    | [];
  if (columns.length > 0) {
    request.columns = columns;
  }
  if (input.portal) {
    request.portal = input.portal;
  }
  return request;
}
