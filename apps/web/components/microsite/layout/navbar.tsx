"use client";

import Link from "next/link";
import { MicrositeSettings } from "@event-platform/shared";
import { Menu, X, ChevronDown, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { normalizeMicrositeBasePath, resolveMicrositeHref } from "./link-utils";
import { resolveAssetUrl } from "../asset-url";
import { usePathname } from "next/navigation";
import { MarkdownText } from "../markdown-text";

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
  const lastInteractionWasTouchRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTriggerRef = useRef<HTMLButtonElement | null>(null);
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

  // Body scroll lock while the mobile menu is open. The menu panel itself has
  // its own overflow-y-auto so long nav lists scroll inside.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevTouchAction = body.style.touchAction;
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prevOverflow;
      body.style.touchAction = prevTouchAction;
    };
  }, [mobileMenuOpen]);

  // Escape closes; focus moves to the X (close) button on open and back to the
  // trigger on close. Keeps screen-reader and keyboard users oriented.
  useEffect(() => {
    if (!mobileMenuOpen) {
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      closeTriggerRef.current?.focus({ preventScroll: true });
    }, 30);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [mobileMenuOpen]);

  const isLinkActive = useMemo(() => {
    return (href: string) => {
      const resolved = resolveMicrositeHref(href, basePath);
      if (!pathname) return false;
      if (resolved === pathname) return true;
      // Treat children of a section path as active for the parent (but not /)
      if (resolved !== "/" && resolved !== normalizedBasePath) {
        return pathname.startsWith(resolved + "/");
      }
      return false;
    };
  }, [pathname, basePath, normalizedBasePath]);

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
              <MarkdownText content={siteName ?? ""} mode="inline" as="span" />
            </span>
            {showTagline && tagline && (
              <span className="hidden max-w-[20rem] truncate text-[11px] uppercase tracking-[0.14em] text-[var(--mm-text-muted)] lg:block">
                <MarkdownText content={tagline} mode="inline" as="span" />
              </span>
            )}
          </div>
        </Link>

        <nav
          className="hidden items-center gap-5 lg:flex lg:justify-self-center"
          aria-label="Primary"
        >
          {links.map((link, idx) => {
            const hasChildren = !!link.children?.length;
            const childActive = hasChildren && (link.children ?? []).some((c) => isLinkActive(c.href));
            const selfActive = !hasChildren && isLinkActive(link.href);
            const isActive = selfActive || childActive;
            if (!hasChildren) {
              return (
                <Link
                  key={idx}
                  href={resolveMicrositeHref(link.href, basePath)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative text-sm transition-colors",
                    isActive
                      ? "font-semibold text-[var(--mm-text)] after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-[var(--mm-accent)]"
                      : "font-medium text-[var(--mm-text-muted)] hover:text-[var(--mm-text)]",
                  )}
                >
                  <MarkdownText content={link.label} mode="inline" as="span" />
                </Link>
              );
            }

            return (
              <div
                key={idx}
                className="relative"
                onPointerDown={(e) => {
                  lastInteractionWasTouchRef.current = e.pointerType === "touch";
                }}
                onMouseEnter={() => {
                  if (lastInteractionWasTouchRef.current) return;
                  openDesktopDropdown(idx);
                }}
                onMouseLeave={() => {
                  if (lastInteractionWasTouchRef.current) return;
                  scheduleCloseDesktopDropdown(idx);
                }}
              >
                <button
                  type="button"
                  className={cn(
                    "relative inline-flex items-center gap-1 text-sm transition-colors",
                    isActive || openDropdown === idx
                      ? "font-semibold text-[var(--mm-text)]"
                      : "font-medium text-[var(--mm-text-muted)] hover:text-[var(--mm-text)]",
                    isActive &&
                      "after:absolute after:-bottom-1 after:left-0 after:right-4 after:h-0.5 after:rounded-full after:bg-[var(--mm-accent)]",
                  )}
                  aria-expanded={openDropdown === idx}
                  aria-haspopup="menu"
                  onClick={() => {
                    clearCloseDropdownTimer();
                    setOpenDropdown((current) => (current === idx ? null : idx));
                  }}
                >
                  <MarkdownText content={link.label} mode="inline" as="span" />
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openDropdown === idx ? "rotate-180" : "")} />
                </button>
                <div
                  role="menu"
                  onMouseEnter={() => {
                    if (lastInteractionWasTouchRef.current) return;
                    clearCloseDropdownTimer();
                  }}
                  onMouseLeave={() => {
                    if (lastInteractionWasTouchRef.current) return;
                    scheduleCloseDesktopDropdown(idx);
                  }}
                  className={cn(
                    "absolute left-0 top-full mt-2 min-w-[15rem] rounded-xl border border-[var(--mm-border)] bg-[var(--mm-surface)] p-2 shadow-xl backdrop-blur transition-all",
                    openDropdown === idx
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-1 opacity-0",
                  )}
                >
                  <div className="space-y-1">
                    {link.children?.map((child, childIdx) => {
                      const childIsActive = isLinkActive(child.href);
                      return (
                        <Link
                          key={childIdx}
                          href={resolveMicrositeHref(child.href, basePath)}
                          role="menuitem"
                          aria-current={childIsActive ? "page" : undefined}
                          onClick={() => setOpenDropdown(null)}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-sm transition-colors",
                            childIsActive
                              ? "bg-[var(--mm-soft)] font-semibold text-[var(--mm-text)]"
                              : "text-[var(--mm-text-muted)] hover:bg-[var(--mm-soft)] hover:text-[var(--mm-text)]",
                          )}
                        >
                          <MarkdownText content={child.label} mode="inline" as="span" />
                        </Link>
                      );
                    })}
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
              <MarkdownText content={loginLabel || "Se connecter"} mode="inline" as="span" />
            </Link>
          )}
          {cta && (
            <Link
              href={resolveMicrositeHref(cta.href, basePath)}
              className={CTA_VARIANTS[cta.variant ?? "primary"]}
            >
              <MarkdownText content={cta.label} mode="inline" as="span" />
            </Link>
          )}
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-soft)] hover:text-[var(--mm-text)] lg:hidden"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mm-mobile-menu"
          aria-haspopup="menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Backdrop scrim — dismiss on tap, fades in/out with the panel */}
      <div
        aria-hidden="true"
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          "fixed inset-0 top-16 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        id="mm-mobile-menu"
        role="menu"
        aria-label="Mobile navigation"
        className={cn(
          "absolute inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-[var(--mm-border)] bg-[var(--mm-surface)] lg:hidden",
          "transition-[transform,opacity] duration-200 ease-out",
          mobileMenuOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        <div className="microsite-shell space-y-4 py-5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--mm-text-muted)]">
              Menu
            </span>
            <button
              ref={closeTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-soft)] hover:text-[var(--mm-text)]"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {links.map((link, idx) => {
            const hasChildren = !!link.children?.length;
            const childActive = hasChildren && (link.children ?? []).some((c) => isLinkActive(c.href));
            const selfActive = !hasChildren && isLinkActive(link.href);
            const isActive = selfActive || childActive;
            const submenuId = `mm-mobile-submenu-${idx}`;
            return (
              <div
                key={idx}
                className={cn(
                  "rounded-xl border bg-[var(--mm-soft)]/70 transition-colors",
                  isActive ? "border-[var(--mm-accent)]" : "border-[var(--mm-border)]",
                )}
              >
                <div className="flex items-center gap-2 px-2 py-2">
                  <Link
                    href={resolveMicrositeHref(link.href, basePath)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-1 items-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--mm-surface)]",
                      isActive
                        ? "font-semibold text-[var(--mm-text)]"
                        : "font-semibold text-[var(--mm-text)]",
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <MarkdownText content={link.label} mode="inline" as="span" />
                  </Link>
                  {hasChildren && (
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--mm-text-muted)] transition-colors hover:bg-[var(--mm-surface)]"
                      onClick={() => setOpenDropdown((current) => (current === idx ? null : idx))}
                      aria-label={openDropdown === idx ? "Collapse menu section" : "Expand menu section"}
                      aria-expanded={openDropdown === idx}
                      aria-controls={submenuId}
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", openDropdown === idx ? "rotate-180" : "")} />
                    </button>
                  )}
                </div>
                {hasChildren && openDropdown === idx && (
                  <div id={submenuId} className="space-y-1 px-3 pb-3">
                    {link.children?.map((child, childIdx) => {
                      const childIsActive = isLinkActive(child.href);
                      return (
                        <Link
                          key={childIdx}
                          href={resolveMicrositeHref(child.href, basePath)}
                          aria-current={childIsActive ? "page" : undefined}
                          className={cn(
                            "block min-h-11 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--mm-surface)] hover:text-[var(--mm-text)]",
                            childIsActive
                              ? "bg-[var(--mm-surface)] font-semibold text-[var(--mm-text)]"
                              : "text-[var(--mm-text-muted)]",
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <MarkdownText content={child.label} mode="inline" as="span" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-col gap-2 border-t border-[var(--mm-border)] pt-4">
            <button
              type="button"
              onClick={toggleThemeMode}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] px-5 py-2 text-sm font-medium text-[var(--mm-text)] transition-colors hover:border-[var(--mm-accent)]"
              aria-label={activeThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {activeThemeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {activeThemeMode === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {shouldShowLogin && (
              <Link
                href={resolvedLoginHref}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--mm-button-radius)] border border-[var(--mm-border)] px-5 py-2 text-center text-sm font-medium text-[var(--mm-text)]"
                onClick={() => setMobileMenuOpen(false)}
              >
                <MarkdownText content={loginLabel || "Se connecter"} mode="inline" as="span" />
              </Link>
            )}
            {cta && (
              <Link
                href={resolveMicrositeHref(cta.href, basePath)}
                className={cn("inline-flex min-h-11 w-full items-center justify-center text-center", CTA_VARIANTS[cta.variant ?? "primary"])}
                onClick={() => setMobileMenuOpen(false)}
              >
                <MarkdownText content={cta.label} mode="inline" as="span" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
