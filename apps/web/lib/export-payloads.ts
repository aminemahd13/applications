import type {
  AdminUsersExportColumn,
  ApplicationExportCoreColumn,
  CsvPortal,
} from "@event-platform/shared";

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

export function filenameFromContentDisposition(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return fallback;
}

export function humanizeExportColumnKey(columnKey: string): string {
  const cleaned = columnKey
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!cleaned) return columnKey;
  return cleaned.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function resolvePortalFromPathname(pathname: string): CsvPortal {
  return pathname.startsWith("/admin") ? "admin" : "staff";
}

export function buildApplicationExportRequest(input: {
  applicationIds?: readonly string[];
  columns?: readonly ApplicationExportCoreColumn[];
  includeResponseColumns?: boolean;
  portal?: CsvPortal;
}) {
  const request: {
    applicationIds?: string[];
    columns?: ApplicationExportCoreColumn[];
    includeResponseColumns?: boolean;
    portal?: CsvPortal;
  } = {};

  const applicationIds = dedupeTrimmed(input.applicationIds);
  if (applicationIds.length > 0) {
    request.applicationIds = applicationIds;
  }

  const columns = dedupeTrimmed(input.columns as readonly string[]) as
    | ApplicationExportCoreColumn[]
    | [];
  if (columns.length > 0) {
    request.columns = columns;
  }

  if (typeof input.includeResponseColumns === "boolean") {
    request.includeResponseColumns = input.includeResponseColumns;
  }

  if (input.portal) {
    request.portal = input.portal;
  }

  return request;
}

export function buildAdminUsersExportQuery(input: {
  search?: string;
  filter?: string;
  columns?: readonly AdminUsersExportColumn[];
  includeResponseColumns?: boolean;
  portal?: CsvPortal;
}): URLSearchParams {
  const params = new URLSearchParams();
  const search = input.search?.trim();
  const filter = input.filter?.trim();
  if (search) params.set("search", search);
  if (filter) params.set("filter", filter);

  const columns = dedupeTrimmed(input.columns as readonly string[]) as
    | AdminUsersExportColumn[]
    | [];
  for (const column of columns) {
    params.append("columns", column);
  }

  if (typeof input.includeResponseColumns === "boolean") {
    params.set("includeResponseColumns", String(input.includeResponseColumns));
  }
  if (input.portal) {
    params.set("portal", input.portal);
  }
  return params;
}

