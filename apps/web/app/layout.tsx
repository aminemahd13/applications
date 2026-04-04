import type { Metadata } from "next";
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
  other: {
    google: "notranslate",
  },
};

const PLATFORM_SETTINGS_TIMEOUT_MS = Math.max(
  Number(process.env.PLATFORM_SETTINGS_TIMEOUT_MS ?? "900"),
  250,
);

async function getSettings(): Promise<PublicPlatformSettings | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLATFORM_SETTINGS_TIMEOUT_MS);
  try {
    return await apiClient<PublicPlatformSettings>("/admin/settings/public", {
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err: unknown) {
    // Fallback to defaults if API fails
    const message = err instanceof Error ? err.message : "unknown error";
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Failed to load settings, using defaults (${message})`);
    }
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      translate="no"
      className="notranslate"
    >
      <body className="antialiased notranslate">
        <Providers settings={settings}>{children}</Providers>
      </body>
    </html>
  );
}
