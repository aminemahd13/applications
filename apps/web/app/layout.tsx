import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Providers } from "@/components/providers";
import { PublicPlatformSettings } from "@/components/providers/platform-settings-provider";
import { apiClient } from "@/lib/api";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Math&Maroc",
    template: "%s | Math&Maroc",
  },
  description:
    "Math&Maroc Event Platform - Apply to events, track applications, and manage your journey.",
};

const PLATFORM_SETTINGS_REVALIDATE_SECONDS = 300;
const PLATFORM_SETTINGS_TIMEOUT_MS = Math.max(
  Number(process.env.PLATFORM_SETTINGS_TIMEOUT_MS ?? "900"),
  250,
);

const getCachedSettings = unstable_cache(
  async (): Promise<PublicPlatformSettings> => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      PLATFORM_SETTINGS_TIMEOUT_MS,
    );

    try {
      return await apiClient<PublicPlatformSettings>("/admin/settings/public", {
        signal: controller.signal,
        cache: "force-cache",
      });
    } finally {
      clearTimeout(timer);
    }
  },
  ["public-platform-settings"],
  { revalidate: PLATFORM_SETTINGS_REVALIDATE_SECONDS },
);

async function getSettings(): Promise<PublicPlatformSettings | undefined> {
  try {
    return await getCachedSettings();
  } catch (err: unknown) {
    // Fallback to defaults if API fails
    const message = err instanceof Error ? err.message : "unknown error";
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Failed to load settings, using defaults (${message})`);
    }
    return undefined;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers settings={settings}>{children}</Providers>
      </body>
    </html>
  );
}
