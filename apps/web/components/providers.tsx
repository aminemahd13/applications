"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { AutoTranslate, LocaleProvider } from "@/lib/i18n";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { GlobalLocaleToggle } from "@/components/shared/global-locale-toggle";

import {
  PlatformSettingsProvider,
  PublicPlatformSettings,
} from "./providers/platform-settings-provider";

export function Providers({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings?: PublicPlatformSettings;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const pathname = usePathname();
  const protectedPrefixes = [
    "/admin",
    "/dashboard",
    "/events",
    "/inbox",
    "/profile",
    "/applications",
    "/staff",
  ];
  const isProtectedRoute = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const hasSessionCookie =
    typeof document !== "undefined" &&
    /(?:^|;\s*)(?:sid|connect\.sid)=/.test(document.cookie);
  const shouldBootstrapAuth = isProtectedRoute || hasSessionCookie;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <LocaleProvider>
        <PlatformSettingsProvider initialSettings={settings}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider bootstrapOnMount={shouldBootstrapAuth}>
              {/* reducedMotion="user" makes every framer-motion animation in the
                  app honor the OS "reduce motion" setting (a11y). */}
              <MotionConfig reducedMotion="user">
                <AutoTranslate>{children}</AutoTranslate>
                <GlobalLocaleToggle />
                <Toaster richColors position="bottom-right" />
              </MotionConfig>
            </AuthProvider>
          </QueryClientProvider>
        </PlatformSettingsProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
