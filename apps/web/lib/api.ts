import { Block, MicrositeSettings } from "@event-platform/shared";
import { toast } from "sonner";
import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";

/* ---------- Config ---------- */

function isAbsoluteHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

const PUBLIC_API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const INTERNAL_API_URL =
  (process.env.INTERNAL_API_URL ?? "").trim() ||
  (isAbsoluteHttpUrl(PUBLIC_API_URL)
    ? PUBLIC_API_URL
    : "http://localhost:3001/api/v1");
const API_URL =
  typeof window === "undefined" ? INTERNAL_API_URL : PUBLIC_API_URL;

/* ---------- Server-side types ---------- */

export interface PublicMicrosite {
  id: string;
  settings: MicrositeSettings;
  event: {
    title: string;
    slug: string;
  };
}

export interface PublicPage {
  id: string;
  title: string;
  slug: string;
  blocks: Block[];
  seo: {
    title?: string;
    description?: string;
    customCode?: {
      htmlTop?: string;
      htmlBottom?: string;
      css?: string;
      js?: string;
    };
    [key: string]: unknown;
  };
}

/* ---------- Server-side fetchers (RSC / ISR) ---------- */

export async function getMicrosite(
  eventSlug: string
): Promise<PublicMicrosite | null> {
  try {
    const res = await fetch(`${API_URL}/microsites/public/${eventSlug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getPage(
  eventSlug: string,
  pagePath: string = "home"
): Promise<PublicPage | null> {
  try {
    const res = await fetch(
      `${API_URL}/microsites/public/${eventSlug}/pages/${pagePath}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/* ---------- Generic Client API ---------- */

interface ApiClientOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  csrfToken?: string;
  /** Pass `req.headers.get('cookie')` from Server Components for authenticated SSR. */
  serverCookies?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiClient<T = unknown>(
  path: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { body, csrfToken, serverCookies, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((extraHeaders as Record<string, string>) ?? {}),
  };

  if (csrfToken && rest.method && rest.method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }

  if (serverCookies) {
    headers["cookie"] = serverCookies;
  }

  const url = path.startsWith("http") ? path : `${API_URL}${path}`;

  const res = await fetch(url, {
    // Only set credentials on client-side; server-side uses explicit cookie header.
    ...(serverCookies ? {} : { credentials: "include" as const }),
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    const message = err.message ?? `Error ${res.status}`;

    if (typeof window !== "undefined") {
      toast.error(message);
    }

    throw new ApiError(message, res.status, err);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
