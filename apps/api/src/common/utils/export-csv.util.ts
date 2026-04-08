import type { CsvPortal } from '@event-platform/shared';

interface BuildCsvOptions {
  includeBom?: boolean;
}

const CSV_FORMULA_PREFIX_PATTERN = /^[\s]*[=+\-@]/;

function normalizeCsvCellValue(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw.length === 0) return '';
  if (CSV_FORMULA_PREFIX_PATTERN.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

function escapeCsvCell(value: unknown): string {
  const safeValue = normalizeCsvCellValue(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function buildCsvContent(
  headers: string[],
  rows: unknown[][],
  options?: BuildCsvOptions,
): string {
  const includeBom = options?.includeBom ?? true;
  const headerLine = headers.map((header) => escapeCsvCell(header)).join(',');
  const rowLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  const csv = [headerLine, ...rowLines].join('\n');
  return includeBom ? `\ufeff${csv}` : csv;
}

export function resolveAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    (env.APP_BASE_URL && env.APP_BASE_URL.trim()) ||
    (env.CORS_ORIGIN && env.CORS_ORIGIN.trim()) ||
    'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

export function joinAppUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export interface ApplicationPortalLinks {
  applicationPath: string;
  applicationUrl: string;
  staffApplicationPath: string;
  adminApplicationPath: string;
  staffApplicationUrl: string;
  adminApplicationUrl: string;
}

export function buildApplicationPortalLinks(input: {
  eventId: string;
  applicationId: string;
  portal?: CsvPortal;
  baseUrl?: string;
}): ApplicationPortalLinks {
  const baseUrl = (input.baseUrl ?? resolveAppBaseUrl()).replace(/\/+$/, '');
  const staffApplicationPath = `/staff/${input.eventId}/applications/${input.applicationId}`;
  const adminApplicationPath = `/admin/events/${input.eventId}/applications/${input.applicationId}`;
  const portal = input.portal === 'admin' ? 'admin' : 'staff';
  const applicationPath =
    portal === 'admin' ? adminApplicationPath : staffApplicationPath;
  return {
    applicationPath,
    applicationUrl: joinAppUrl(baseUrl, applicationPath),
    staffApplicationPath,
    adminApplicationPath,
    staffApplicationUrl: joinAppUrl(baseUrl, staffApplicationPath),
    adminApplicationUrl: joinAppUrl(baseUrl, adminApplicationPath),
  };
}
