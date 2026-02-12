import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { apiClient } from "@/lib/api";
import { PublicPlatformSettings } from "@/components/providers/platform-settings-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Math&Maroc",
    template: "%s | Math&Maroc",
  },
  description:
    "Math&Maroc Event Platform - Apply to events, track applications, and manage your journey.",
};

async function getSettings(): Promise<PublicPlatformSettings | undefined> {
  try {
    return await apiClient<PublicPlatformSettings>("/admin/settings/public", {
      next: { revalidate: 300 },
    });
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
