"use client";

import Link from "next/link";
import { MicrositeSettings } from "@event-platform/shared";
import { Menu, X, ChevronDown, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { normalizeMicrositeBasePath, resolveMicrositeHref } from "./link-utils";
import { resolveAssetUrl } from "../asset-url";
import { usePathname } from "next/navigation";

type NavigationSettings = MicrositeSettings["navigation"];

const NAV_STYLE_CLASSES = {
  glass: {
    top: "border-b border-transparent bg-[color-mix(in_oklab,var(--mm-bg)_38%,transparent)]",
    scrolled: "border-b border-[var(--mm-border)] bg-[color-mix(in_oklab,var(--mm-surface)_84%,transparent)] shadow-[0_10px_30px_rgba(15,23,42,0.2)] backdrop-blur-xl",
  },
  solid: {
    top: "border-b border-[var(--mm-border)] bg-[var(--mm-surface)] shadow-[0_8px_28px_rgba(15,23,42,0.1)]",
    scrolled: "border-b border-[var(--mm-border)] bg-[var(--mm-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.14)]",
  },
  minimal: {
    top: "border-b border-transparent bg-[color-mix(in_oklab,var(--mm-bg)_78%,transparent)]",
    scrolled: "border-b border-[var(--mm-border)] bg-[color-mix(in_oklab,var(--mm-bg)_92%,transparent)] shadow-[0_8px_22px_rgba(15,23,42,0.08)]",
  },
} as const;

const CTA_VARIANTS = {
  primary: "mm-primary-button px-5 py-2 text-sm font-semibold",
  secondary:
    "rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] bg-[var(--mm-surface)] px-5 py-2 text-sm font-semibold text-[var(--mm-text)] hover:border-[var(--mm-accent)] transition-colors",
  outline: "mm-outline-button px-5 py-2 text-sm font-semibold",
} as const;

const THEME_STORAGE_EVENT = "mm-theme-storage-change";

export function Navbar({
  settings,
  basePath,
  siteName,
  tagline,
  themePreference = "system",
}: {
  settings?: NavigationSettings;
  basePath?: string;
  siteName?: string;
  tagline?: string;
  themePreference?: MicrositeSettings["theme"];
}) {
  const normalizedBasePath = normalizeMicrositeBasePath(basePath);
  const themeStorageKey = `mm-theme-override:${normalizedBasePath || "__global__"}`;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const closeDropdownTimerRef = useRef<number | null>(null);
  const pathname = usePathname();
  const {
    links = [],
    cta,
    logoAssetKey,
    showLogin,
    loginLabel,
    loginHref,
    style = "glass",
    sticky = true,
    showTagline = true,
  } = settings || {};
  const shouldShowLogin = showLogin ?? true;
  const navStyle = style ?? "glass";
  const getSystemThemeMode = (): "light" | "dark" => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const systemThemeMode = useSyncExternalStore<"light" | "dark">(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => onStoreChange();
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    getSystemThemeMode,
    () => "light",
  );
  const storedThemeOverride = useSyncExternalStore<"light" | "dark" | null>(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      const onStorage = (event: StorageEvent) => {
        if (event.key === themeStorageKey) onStoreChange();
      };
      const onInternal = (event: Event) => {
        const customEvent = event as CustomEvent<string>;
        if (customEvent.detail === themeStorageKey) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(THEME_STORAGE_EVENT, onInternal as EventListener);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(THEME_STORAGE_EVENT, onInternal as EventListener);
      };
    },
    () => {
      if (typeof window === "undefined") return null;
      const stored = window.localStorage.getItem(themeStorageKey);
      return stored === "light" || stored === "dark" ? stored : null;
    },
    () => null,
  );
  const activeThemeMode = useMemo<"light" | "dark">(() => {
    if (storedThemeOverride) return storedThemeOverride;
    if (themePreference === "dark") return "dark";
    if (themePreference === "light") return "light";
    return systemThemeMode;
  }, [storedThemeOverride, themePreference, systemThemeMode]);

  const resolvedLoginHref = (() => {
    const raw = (loginHref ?? "/login").trim();
    if (!raw) return "/login";
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("#") || raw.startsWith("/")) {
      return raw;
    }
    return resolveMicrositeHref(raw, basePath);
  })();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMobileMenuOpen(false);
      setOpenDropdown(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!sticky) return;
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sticky]);

  const navHasScrolled = sticky && scrolled;

  const applyThemeMode = (mode: "light" | "dark") => {
    const root = document.querySelector<HTMLElement>('[data-microsite-root="true"]');
    if (!root) return;
    root.classList.remove("mm-theme-system", "mm-theme-light", "mm-theme-dark");
    root.classList.add(mode === "dark" ? "mm-theme-dark" : "mm-theme-light");
    root.classList.toggle("dark", mode === "dark");
    root.dataset.themeMode = mode;
  };

  const applySystemTheme = (mode: "light" | "dark") => {
    const root = document.querySelector<HTMLElement>('[data-microsite-root="true"]');
    if (!root) return;
    root.classList.remove("mm-theme-light", "mm-theme-dark");
    root.classList.add("mm-theme-system");
    root.classList.toggle("dark", mode === "dark");
    root.dataset.themeMode = mode;
  };

  const clearCloseDropdownTimer = () => {
    if (closeDropdownTimerRef.current === null) return;
    window.clearTimeout(closeDropdownTimerRef.current);
    closeDropdownTimerRef.current = null;
  };

  const openDesktopDropdown = (idx: number) => {
    clearCloseDropdownTimer();
    setOpenDropdown(idx);
  };

  const scheduleCloseDesktopDropdown = (idx: number) => {
    clearCloseDropdownTimer();
    closeDropdownTimerRef.current = window.setTimeout(() => {
      setOpenDropdown((current) => (current === idx ? null : current));
      closeDropdownTimerRef.current = null;
    }, 220);
  };

  useEffect(() => {
    return () => clearCloseDropdownTimer();
  }, []);

  useEffect(() => {
    if (
      themePreference === "system" &&
      !storedThemeOverride
    ) {
      applySystemTheme(systemThemeMode);
      return;
    }
    applyThemeMode(activeThemeMode);
  }, [
    activeThemeMode,
    storedThemeOverride,
    systemThemeMode,
    themePreference,
  ]);

  const toggleThemeMode = () => {
    const next = activeThemeMode === "dark" ? "light" : "dark";
    if (typeof window !== "undefined") {
      window.localStorage.setItem(themeStorageKey, next);
      window.dispatchEvent(
        new CustomEvent<string>(THEME_STORAGE_EVENT, {
          detail: themeStorageKey,
        }),
      );
    }
    applyThemeMode(next);
  };

  return (
    <header
      className={cn(
        "inset-x-0 top-0 z-50 flex w-full justify-center transition-all duration-300",
        sticky ? "fixed" : "relative",
        navHasScrolled ? NAV_STYLE_CLASSES[navStyle].scrolled : NAV_STYLE_CLASSES[navStyle].top,
      )}
    >
      <div className="microsite-shell flex h-16 items-center gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link
          href={resolveMicrositeHref("/", basePath)}
          className="flex min-w-0 items-center gap-2.5 lg:justify-self-start"
          onClick={() => setMobileMenuOpen(false)}
        >
          {logoAssetKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveAssetUrl(logoAssetKey)}
              alt="Logo"
              className="h-11 w-auto rounded-sm"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/microsite/presets/mm-light.png"
              alt="Math&Maroc Logo"
              className="h-10 w-auto rounded-sm"
            />
          )}
          <div className="min-w-0">
            <span className="block truncate text-base font-semibold tracking-tight text-[var(--mm-text)] sm:text-lg">
              {siteName || "Math&Maroc"}
            </span>
            {showTagline && tagline && (
              <span className="hidden max-w-[20rem] truncate text-[11px] uppercase tracking-[0.14em] text-[var(--mm-text-muted)] lg:block">
                {tagline}
              </span>
            )}
          </div>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex lg:justify-self-center">
          {links.map((link, idx) => {
            const hasChildren = !!link.children?.length;
            if (!hasChildren) {
              return (
                <Link
                  key={idx}
                  href={resolveMicrositeHref(link.href, basePath)}
                  className="text-sm font-medium text-[var(--mm-text-muted)] transition-colors hover:text-[var(--mm-text)]"
                >
                  {link.label}
                </Link>
              );
            }

            return (
              <div
                key={idx}
                className="relative"
                onMouseEnter={() => openDesktopDropdown(idx)}
                onMouseLeave={() => scheduleCloseDesktopDropdown(idx)}
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium transition-colors",
                    openDropdown === idx ? "text-[var(--mm-text)]" : "text-[var(--mm-text-muted)] hover:text-[var(--mm-text)]",
                  )}
                  aria-expanded={openDropdown === idx}
                  onClick={() => {
                    clearCloseDropdownTimer();
                    setOpenDropdown((current) => (current === idx ? null : idx));
                  }}
                >
                  {link.label}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openDropdown === idx ? "rotate-180" : "")} />
                </button>
                <div
                  onMouseEnter={() => clearCloseDropdownTimer()}
                  onMouseLeave={() => scheduleCloseDesktopDropdown(idx)}
                  className={cn(
                    "absolute left-0 top-full mt-2 min-w-[15rem] rounded-xl border border-[var(--mm-border)] bg-[var(--mm-surface)] p-2 shadow-xl backdrop-blur transition-all",
                    openDropdown === idx
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-1 opacity-0",
                  )}
                >
                  <div className="space-y-1">
                    {link.children?.map((child, childIdx) => (
                      <Link
                        key={childIdx}
                        href={resolveMicrositeHref(child.href, basePath)}
                        className="block rounded-lg px-3 py-2 text-sm text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-soft)] hover:text-[var(--mm-text)]"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex lg:justify-self-end">
          <button
            type="button"
            onClick={toggleThemeMode}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] bg-[var(--mm-surface)] text-[var(--mm-text)] transition-colors hover:border-[var(--mm-accent)]"
            aria-label={activeThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={activeThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {activeThemeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {shouldShowLogin && (
            <Link
              href={resolvedLoginHref}
              className="rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] px-4 py-1.5 text-sm text-[var(--mm-text)] transition-colors hover:border-[var(--mm-accent)]"
            >
              {loginLabel || "Se connecter"}
            </Link>
          )}
          {cta && (
            <Link
              href={resolveMicrositeHref(cta.href, basePath)}
              className={CTA_VARIANTS[cta.variant ?? "primary"]}
            >
              {cta.label}
            </Link>
          )}
        </div>

        <button
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-soft)] hover:text-[var(--mm-text)] lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn(
          "absolute inset-x-0 top-16 z-40 overflow-hidden border-t border-[var(--mm-border)] bg-[var(--mm-surface)] transition-all duration-200 lg:hidden",
          mobileMenuOpen ? "max-h-[90vh] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="microsite-shell space-y-4 py-5">
          {links.map((link, idx) => {
            const hasChildren = !!link.children?.length;
            return (
              <div key={idx} className="rounded-xl border border-[var(--mm-border)] bg-[var(--mm-soft)]/70">
                <div className="flex items-center gap-2 px-2 py-2">
                  <Link
                    href={resolveMicrositeHref(link.href, basePath)}
                    className="flex min-h-11 flex-1 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-surface)]"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                  {hasChildren && (
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-surface)]"
                      onClick={() => setOpenDropdown((current) => (current === idx ? null : idx))}
                      aria-label={openDropdown === idx ? "Collapse menu section" : "Expand menu section"}
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", openDropdown === idx ? "rotate-180" : "")} />
                    </button>
                  )}
                </div>
                {hasChildren && openDropdown === idx && (
                  <div className="space-y-1 px-3 pb-3">
                    {link.children?.map((child, childIdx) => (
                      <Link
                        key={childIdx}
                        href={resolveMicrositeHref(child.href, basePath)}
                        className="block min-h-10 rounded-lg px-3 py-2 text-sm text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-surface)] hover:text-[var(--mm-text)]"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-col gap-2 border-t border-[var(--mm-border)] pt-4">
            <button
              type="button"
              onClick={toggleThemeMode}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] px-5 py-2 text-sm font-medium text-[var(--mm-text)] transition-colors hover:border-[var(--mm-accent)]"
              aria-label={activeThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {activeThemeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {activeThemeMode === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {shouldShowLogin && (
              <Link
                href={resolvedLoginHref}
                className="rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] px-5 py-2 text-center text-sm font-medium text-[var(--mm-text)]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {loginLabel || "Se connecter"}
              </Link>
            )}
            {cta && (
              <Link
                href={resolveMicrositeHref(cta.href, basePath)}
                className={cn("w-full text-center", CTA_VARIANTS[cta.variant ?? "primary"])}
                onClick={() => setMobileMenuOpen(false)}
              >
                {cta.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
