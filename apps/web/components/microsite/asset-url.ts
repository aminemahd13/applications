import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";

const API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const PUBLIC_ASSET_HOST = (process.env.NEXT_PUBLIC_ASSET_HOST ?? "").trim();
const DIRECT_ASSET_HOST = (
  process.env.NEXT_PUBLIC_DIRECT_ASSET_HOST ?? ""
).trim();

function buildAssetResolverUrl(storageKey: string): string {
  return `${API_URL}/microsites/assets?key=${encodeURIComponent(storageKey)}`;
}

function buildDirectAssetUrl(baseHost: string, storageKey: string): string {
  return `${baseHost.replace(/\/+$/, "")}/${storageKey}`;
}

export function resolveAssetUrl(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("/")
  ) {
    return raw;
  }

  const storageKey = raw.replace(/^\/+/, "");
  if (PUBLIC_ASSET_HOST) {
    return buildDirectAssetUrl(PUBLIC_ASSET_HOST, storageKey);
  }

  if (DIRECT_ASSET_HOST) {
    return buildDirectAssetUrl(DIRECT_ASSET_HOST, storageKey);
  }

  return buildAssetResolverUrl(storageKey);
}
