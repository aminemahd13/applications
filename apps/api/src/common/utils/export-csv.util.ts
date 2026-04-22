import type { CsvPortal } from '@event-platform/shared';
import { isIP } from 'node:net';

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
  const candidates = [
    env.PUBLIC_APP_BASE_URL,
    env.APP_BASE_URL,
    env.CORS_ORIGIN,
  ];

  for (const rawCandidate of candidates) {
    const normalized = normalizePublicAppBaseUrl(rawCandidate);
    if (normalized) return normalized;
  }

  return 'http://localhost:3000';
}

function normalizePublicAppBaseUrl(rawValue: string | undefined): string | null {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase();
  if (!normalizedHost) return true;
  if (
    normalizedHost === 'localhost' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1' ||
    normalizedHost === '[::1]'
  ) {
    return true;
  }

  const ipType = isIP(normalizedHost);
  if (ipType === 4) {
    const segments = normalizedHost.split('.').map((segment) => Number(segment));
    const [a, b] = segments;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ipType === 6) {
    return (
      normalizedHost === '::1' ||
      normalizedHost.startsWith('fc') ||
      normalizedHost.startsWith('fd') ||
      normalizedHost.startsWith('fe80')
    );
  }

  // Non-FQDN hostnames (for example "api", "minio") are internal-only.
  return !normalizedHost.includes('.');
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
