"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const APP_SHELL_PREFIXES = [
  "/admin",
  "/dashboard",
  "/events",
  "/inbox",
  "/profile",
  "/applications",
  "/staff",
];

export function GlobalLocaleToggle() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();

  const isShellRoute = APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isShellRoute) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden">
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2 text-xs font-medium shadow-sm"
        onClick={() => setLocale(locale === "en" ? "fr" : "en")}
        aria-label={t("Switch language")}
        title={t("Switch language")}
      >
        {locale === "en" ? "FR" : "EN"}
      </Button>
    </div>
  );
}
