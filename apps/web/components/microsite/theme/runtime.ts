import type { MicrositeSettings } from "@event-platform/shared";
import type { CSSProperties } from "react";
import {
  MICROSITE_THEME,
  type MicrositeBodyFont,
  type MicrositeCardStyle,
  type MicrositeContainerWidth,
  type MicrositeDesignSettings,
  type MicrositeHeadingFont,
  type MicrositeMotionStyle,
  type MicrositeRadiusScale,
  type MicrositeShadowStrength,
} from "./preset";

const CONTAINER_WIDTH_MAP: Record<MicrositeContainerWidth, string> = {
  normal: "68rem",
  wide: "82rem",
  ultra: "96rem",
};

const HEADING_FONT_CLASS_MAP: Record<MicrositeHeadingFont, string> = {
  sf: "mm-heading-sf",
  pally: "mm-heading-pally",
  neco: "mm-heading-neco",
};

const BODY_FONT_CLASS_MAP: Record<MicrositeBodyFont, string> = {
  inter: "mm-body-inter",
  poppins: "mm-body-poppins",
  neco: "mm-body-neco",
};

const MOTION_CLASS_MAP: Record<MicrositeMotionStyle, string> = {
  full: "mm-motion-full",
  reduced: "mm-motion-reduced",
  none: "mm-motion-none",
};

const RADIUS_MAP: Record<MicrositeRadiusScale, { surface: string; card: string; button: string }> = {
  compact: { surface: "1.05rem", card: "0.85rem", button: "0.85rem" },
  comfortable: { surface: "1.7rem", card: "1.35rem", button: "9999px" },
  rounded: { surface: "2.2rem", card: "1.8rem", button: "9999px" },
};

const SHADOW_MAP: Record<MicrositeShadowStrength, { card: string; surface: string }> = {
  soft: {
    card: "0 10px 25px rgba(15, 23, 42, 0.07)",
    surface: "0 16px 38px rgba(15, 23, 42, 0.1)",
  },
  medium: {
    card: "0 18px 45px rgba(15, 23, 42, 0.09)",
    surface: "0 24px 56px rgba(15, 23, 42, 0.13)",
  },
  bold: {
    card: "0 24px 60px rgba(15, 23, 42, 0.14)",
    surface: "0 30px 72px rgba(15, 23, 42, 0.18)",
  },
};

function resolveCardVisuals(cardStyle: MicrositeCardStyle, shadowStrength: MicrositeShadowStrength) {
  const shadows = SHADOW_MAP[shadowStrength];

  if (cardStyle === "flat") {
    return {
      cardBackground: "var(--mm-soft)",
      cardBorder: "color-mix(in oklab, var(--mm-border) 75%, transparent)",
      cardShadow: "none",
    };
  }

  if (cardStyle === "outlined") {
    return {
      cardBackground: "color-mix(in oklab, var(--mm-surface) 92%, var(--mm-accent) 8%)",
      cardBorder: "color-mix(in oklab, var(--mm-accent) 30%, var(--mm-border) 70%)",
      cardShadow: "none",
    };
  }

  return {
    cardBackground: "var(--mm-surface)",
    cardBorder: "var(--mm-border)",
    cardShadow: shadows.card,
  };
}

export function normalizeMicrositeSettings(raw: unknown): MicrositeSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<MicrositeSettings>;
  const navigation = (source.navigation ?? {}) as NonNullable<MicrositeSettings["navigation"]>;
  const footer = (source.footer ?? {}) as NonNullable<MicrositeSettings["footer"]>;
  const designSource = (source.design ?? {}) as Partial<MicrositeDesignSettings>;

  const safePatternOpacity =
    typeof designSource.patternOpacity === "number" && Number.isFinite(designSource.patternOpacity)
      ? Math.max(0, Math.min(100, designSource.patternOpacity))
      : MICROSITE_THEME.designDefaults.patternOpacity;

  return {
    theme: source.theme ?? "system",
    primaryColor: source.primaryColor,
    design: {
      ...MICROSITE_THEME.designDefaults,
      ...designSource,
      patternOpacity: safePatternOpacity,
    },
    branding: { ...(source.branding ?? {}) },
    navigation: {
      links: navigation.links ?? [],
      cta: navigation.cta,
      logoAssetKey: navigation.logoAssetKey,
      showLogin: navigation.showLogin ?? true,
      loginLabel: navigation.loginLabel,
      loginHref: navigation.loginHref,
      style: navigation.style ?? "glass",
      sticky: navigation.sticky ?? true,
      showTagline: navigation.showTagline ?? true,
    },
    footer: {
      columns: footer.columns ?? [],
      socials: footer.socials ?? [],
      legalText: footer.legalText,
      style: footer.style ?? "angled",
      showLogo: footer.showLogo ?? true,
      showTagline: footer.showTagline ?? true,
      showSocials: footer.showSocials ?? true,
      showDividers: footer.showDividers ?? true,
    },
    customCode: { ...(source.customCode ?? {}) },
    footerText: source.footerText,
  };
}

export function resolveMicrositeThemeClass(theme: MicrositeSettings["theme"]): string {
  if (theme === "dark") return "dark mm-theme-dark";
  if (theme === "light") return "mm-theme-light";
  return "mm-theme-system";
}

export function resolveMicrositeHeadingClass(settings: MicrositeSettings): string {
  const heading = settings.design?.headingFont ?? MICROSITE_THEME.designDefaults.headingFont;
  return HEADING_FONT_CLASS_MAP[heading];
}

export function resolveMicrositeBodyClass(settings: MicrositeSettings): string {
  const body = settings.design?.bodyFont ?? MICROSITE_THEME.designDefaults.bodyFont;
  return BODY_FONT_CLASS_MAP[body];
}

export function resolveMicrositeMotionClass(settings: MicrositeSettings): string {
  const motion = settings.design?.animation ?? MICROSITE_THEME.designDefaults.animation;
  return MOTION_CLASS_MAP[motion];
}

export function getMicrositeStyleVariables(settingsInput?: MicrositeSettings): CSSProperties {
  const settings = normalizeMicrositeSettings(settingsInput ?? {});
  const design = settings.design ?? MICROSITE_THEME.designDefaults;
  const accent = settings.primaryColor ?? MICROSITE_THEME.accent;
  const radius = RADIUS_MAP[design.radiusScale];
  const shadows = SHADOW_MAP[design.shadowStrength];
  const cardVisuals = resolveCardVisuals(design.cardStyle, design.shadowStrength);
  const darkBase = design.darkSurface || "#020617";
  const lightBase = "#f8fafc";
  const lightSurface = "#ffffff";
  const lightSoft = "#eef2ff";
  const lightText = "#0f172a";
  const lightMuted = "#475569";
  const lightBorder = "rgba(15, 23, 42, 0.16)";

  const paletteLight = {
    dark: `color-mix(in oklab, ${darkBase} 40%, #1e293b 60%)`,
    bg: `color-mix(in oklab, ${design.pageBackground} 42%, ${lightBase} 58%)`,
    surface: `color-mix(in oklab, ${design.surfaceBackground} 44%, ${lightSurface} 56%)`,
    soft: `color-mix(in oklab, ${design.surfaceMuted} 52%, ${lightSoft} 48%)`,
    text: `color-mix(in oklab, ${design.textColor} 16%, ${lightText} 84%)`,
    muted: `color-mix(in oklab, ${design.mutedTextColor} 22%, ${lightMuted} 78%)`,
    border: `color-mix(in oklab, ${design.borderColor} 38%, ${lightBorder} 62%)`,
  };

  const paletteDark = {
    dark: darkBase,
    bg: `color-mix(in oklab, ${design.pageBackground} 8%, ${darkBase} 92%)`,
    surface: `color-mix(in oklab, ${design.surfaceBackground} 12%, ${darkBase} 88%)`,
    soft: `color-mix(in oklab, ${design.surfaceMuted} 16%, ${darkBase} 84%)`,
    text: `color-mix(in oklab, ${design.textColor} 12%, #f8fafc 88%)`,
    muted: `color-mix(in oklab, ${design.mutedTextColor} 18%, #cbd5e1 82%)`,
    border: `color-mix(in oklab, ${design.borderColor} 20%, #94a3b8 80%)`,
  };

  return {
    "--microsite-accent": accent,
    "--mm-accent": accent,
    "--mm-accent-2": design.accentSecondary,
    "--mm-ring-start": design.ringStart,
    "--mm-ring-middle": design.ringMiddle,
    "--mm-dark-light": paletteLight.dark,
    "--mm-bg-light": paletteLight.bg,
    "--mm-surface-light": paletteLight.surface,
    "--mm-soft-light": paletteLight.soft,
    "--mm-border-light": paletteLight.border,
    "--mm-text-light": paletteLight.text,
    "--mm-text-muted-light": paletteLight.muted,
    "--mm-dark-dark": paletteDark.dark,
    "--mm-bg-dark": paletteDark.bg,
    "--mm-surface-dark": paletteDark.surface,
    "--mm-soft-dark": paletteDark.soft,
    "--mm-border-dark": paletteDark.border,
    "--mm-text-dark": paletteDark.text,
    "--mm-text-muted-dark": paletteDark.muted,
    "--mm-pattern-opacity": String(Math.max(0, Math.min(100, design.patternOpacity)) / 100),
    "--mm-container-max": CONTAINER_WIDTH_MAP[design.containerWidth],
    "--mm-surface-radius": radius.surface,
    "--mm-card-radius": radius.card,
    "--mm-button-radius": radius.button,
    "--mm-shadow-card": cardVisuals.cardShadow,
    "--mm-shadow-surface": shadows.surface,
    "--mm-card-bg": cardVisuals.cardBackground,
    "--mm-card-border": cardVisuals.cardBorder,
  } as CSSProperties;
}

export const MICROSITE_RUNTIME_CSS = `
  [data-microsite-root="true"] {
    color-scheme: light;
    --mm-dark: var(--mm-dark-light);
    --mm-bg: var(--mm-bg-light);
    --mm-surface: var(--mm-surface-light);
    --mm-soft: var(--mm-soft-light);
    --mm-border: var(--mm-border-light);
    --mm-text: var(--mm-text-light);
    --mm-text-muted: var(--mm-text-muted-light);
  }

  [data-microsite-root="true"].mm-theme-light {
    color-scheme: light;
    --mm-dark: var(--mm-dark-light);
    --mm-bg: var(--mm-bg-light);
    --mm-surface: var(--mm-surface-light);
    --mm-soft: var(--mm-soft-light);
    --mm-border: var(--mm-border-light);
    --mm-text: var(--mm-text-light);
    --mm-text-muted: var(--mm-text-muted-light);
  }

  [data-microsite-root="true"].mm-theme-dark {
    color-scheme: dark;
    --mm-dark: var(--mm-dark-dark);
    --mm-bg: var(--mm-bg-dark);
    --mm-surface: var(--mm-surface-dark);
    --mm-soft: var(--mm-soft-dark);
    --mm-border: var(--mm-border-dark);
    --mm-text: var(--mm-text-dark);
    --mm-text-muted: var(--mm-text-muted-dark);
  }

  @media (prefers-color-scheme: dark) {
    [data-microsite-root="true"].mm-theme-system {
      color-scheme: dark;
      --mm-dark: var(--mm-dark-dark);
      --mm-bg: var(--mm-bg-dark);
      --mm-surface: var(--mm-surface-dark);
      --mm-soft: var(--mm-soft-dark);
      --mm-border: var(--mm-border-dark);
      --mm-text: var(--mm-text-dark);
      --mm-text-muted: var(--mm-text-muted-dark);
    }
  }

  [data-microsite-root="true"] {
    color: var(--mm-text);
    background: var(--mm-bg);
  }

  [data-microsite-root="true"] ::selection {
    background: color-mix(in oklab, var(--mm-accent) 28%, transparent);
  }

  [data-microsite-root="true"].mm-heading-sf h1,
  [data-microsite-root="true"].mm-heading-sf h2,
  [data-microsite-root="true"].mm-heading-sf h3,
  [data-microsite-root="true"].mm-heading-sf .microsite-display {
    font-family: var(--font-mm-sf), "Segoe UI", sans-serif;
    letter-spacing: -0.025em;
  }

  [data-microsite-root="true"].mm-heading-pally h1,
  [data-microsite-root="true"].mm-heading-pally h2,
  [data-microsite-root="true"].mm-heading-pally h3,
  [data-microsite-root="true"].mm-heading-pally .microsite-display {
    font-family: var(--font-mm-pally), "Times New Roman", serif;
    letter-spacing: -0.02em;
  }

  [data-microsite-root="true"].mm-heading-neco h1,
  [data-microsite-root="true"].mm-heading-neco h2,
  [data-microsite-root="true"].mm-heading-neco h3,
  [data-microsite-root="true"].mm-heading-neco .microsite-display {
    font-family: var(--font-mm-neco), "Trebuchet MS", sans-serif;
    letter-spacing: -0.02em;
  }

  [data-microsite-root="true"].mm-body-inter {
    font-family: var(--font-mm-inter), "Segoe UI", sans-serif;
  }

  [data-microsite-root="true"].mm-body-poppins {
    font-family: var(--font-mm-poppins), "Segoe UI", sans-serif;
  }

  [data-microsite-root="true"].mm-body-neco {
    font-family: var(--font-mm-neco), "Segoe UI", sans-serif;
  }

  [data-microsite-root="true"] p,
  [data-microsite-root="true"] li {
    line-height: 1.72;
  }

  [data-microsite-root="true"] .microsite-shell {
    width: min(100%, var(--mm-container-max, 82rem));
    margin-inline: auto;
    padding-inline: clamp(1.1rem, 2.4vw, 1.8rem);
  }

  [data-microsite-root="true"] .microsite-accent-text {
    color: var(--mm-accent);
  }

  [data-microsite-root="true"] .microsite-soft-bg {
    background: var(--mm-soft);
  }

  [data-microsite-root="true"] .microsite-soft-bg-strong {
    background: color-mix(in oklab, var(--mm-soft) 65%, var(--mm-accent) 35%);
  }

  [data-microsite-root="true"] .microsite-card {
    border: 1px solid var(--mm-card-border, var(--mm-border));
    background: var(--mm-card-bg, var(--mm-surface));
    border-radius: var(--mm-card-radius, 1.35rem);
    box-shadow: var(--mm-shadow-card, 0 18px 45px rgba(15, 23, 42, 0.08));
  }

  [data-microsite-root="true"] .microsite-surface {
    border: 1px solid var(--mm-border);
    background: var(--mm-surface);
    border-radius: var(--mm-surface-radius, 1.7rem);
    box-shadow: var(--mm-shadow-surface, 0 24px 56px rgba(15, 23, 42, 0.12));
  }

  [data-microsite-root="true"] .mm-angled-divider {
    position: relative;
    width: 100%;
    height: 2.75rem;
    margin-top: -0.05rem;
  }

  [data-microsite-root="true"] .mm-angled-divider svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  [data-microsite-root="true"] .mm-dark-band {
    background: var(--mm-dark);
    color: #fff;
  }

  [data-microsite-root="true"] .mm-pattern-cta {
    height: 100%;
    background:
      radial-gradient(14rem 10rem at 20% -10%, color-mix(in oklab, var(--mm-accent) 34%, transparent), transparent 70%),
      radial-gradient(14rem 9rem at 90% 0%, color-mix(in oklab, var(--mm-accent-2) 25%, transparent), transparent 72%),
      linear-gradient(140deg, color-mix(in oklab, var(--mm-dark) 92%, #000) 0%, var(--mm-dark) 100%);
  }

  [data-microsite-root="true"] .mm-primary-button {
    background: var(--mm-accent);
    color: #fff;
    border: 1px solid color-mix(in oklab, var(--mm-accent) 80%, #0f172a);
    border-radius: var(--mm-button-radius, 9999px);
    transition: all 180ms ease;
  }

  [data-microsite-root="true"] .mm-primary-button:hover {
    filter: brightness(1.08);
  }

  [data-microsite-root="true"] .mm-ring-button {
    position: relative;
    display: inline-flex;
    height: 2.75rem;
    overflow: hidden;
    border-radius: var(--mm-button-radius, 9999px);
    padding: 1px;
    outline: none;
  }

  [data-microsite-root="true"] .mm-ring-button::before {
    content: "";
    position: absolute;
    inset: -1000%;
    animation: mm-spin 2s linear infinite;
    background: conic-gradient(from 90deg at 50% 50%, var(--mm-ring-start) 0%, var(--mm-ring-middle) 50%, var(--mm-ring-start) 100%);
  }

  [data-microsite-root="true"] .mm-ring-button > span {
    position: relative;
    display: inline-flex;
    height: 100%;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: var(--mm-button-radius, 9999px);
    background: var(--mm-surface);
    padding: 0 1.5rem;
    color: var(--mm-text);
    backdrop-filter: blur(24px);
  }

  @keyframes mm-spin {
    to {
      transform: rotate(1turn);
    }
  }

  [data-microsite-root="true"] .mm-faq-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 2.75rem;
    border-radius: var(--mm-button-radius, 9999px);
    border: 1px solid color-mix(in oklab, var(--mm-border) 70%, #fff 30%);
    background: var(--mm-surface);
    color: var(--mm-text);
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.12);
    transition: border-color 180ms ease;
  }

  [data-microsite-root="true"] .mm-faq-button:hover {
    border-color: var(--mm-accent);
  }

  [data-microsite-root="true"] .custom-shadow {
    border-radius: var(--mm-surface-radius, 1.7rem);
    box-shadow: 0 0 35px 0 color-mix(in oklab, var(--mm-accent) 55%, transparent);
  }

  [data-microsite-root="true"] .mm-outline-button {
    border: 1px solid color-mix(in oklab, var(--mm-accent) 40%, #111827);
    color: var(--mm-text);
    background: color-mix(in oklab, var(--mm-surface) 88%, var(--mm-accent) 12%);
    border-radius: var(--mm-button-radius, 9999px);
    transition: all 180ms ease;
  }

  [data-microsite-root="true"] .mm-outline-button:hover {
    border-color: var(--mm-accent);
  }

  @keyframes mm-fade-up {
    0% {
      opacity: 0;
      transform: translateY(12px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  [data-microsite-root="true"] .mm-fade-up {
    opacity: 0;
    animation: mm-fade-up 0.55s ease forwards;
  }

  @keyframes mm-rise-up {
    0% {
      opacity: 0;
      transform: translateY(24px) scale(0.98);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  [data-microsite-root="true"] .mm-rise-up {
    opacity: 0;
    animation: mm-rise-up 0.62s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }

  @keyframes mm-zoom-in {
    0% {
      opacity: 0;
      transform: scale(0.92);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  [data-microsite-root="true"] .mm-zoom-in {
    opacity: 0;
    animation: mm-zoom-in 0.5s ease forwards;
  }

  [data-microsite-root="true"].mm-motion-reduced .mm-fade-up {
    animation-duration: 0.24s;
  }

  [data-microsite-root="true"].mm-motion-reduced .mm-rise-up,
  [data-microsite-root="true"].mm-motion-reduced .mm-zoom-in {
    animation-duration: 0.22s;
  }

  [data-microsite-root="true"].mm-motion-none .mm-fade-up {
    opacity: 1;
    animation: none !important;
    transform: none !important;
  }

  [data-microsite-root="true"].mm-motion-none .mm-rise-up,
  [data-microsite-root="true"].mm-motion-none .mm-zoom-in {
    opacity: 1;
    animation: none !important;
    transform: none !important;
  }

  [data-microsite-root="true"] .mm-grid-plus {
    position: relative;
  }

  [data-microsite-root="true"] .mm-grid-plus::before,
  [data-microsite-root="true"] .mm-grid-plus::after {
    content: "";
    position: absolute;
    width: 1rem;
    height: 1px;
    background: currentColor;
  }

  [data-microsite-root="true"] .mm-grid-plus::after {
    transform: rotate(90deg);
  }

  [data-microsite-root="true"] .mm-bg-overlay {
    background:
      radial-gradient(50rem 24rem at 8% 0%, color-mix(in oklab, var(--mm-accent) 28%, transparent), transparent 65%),
      radial-gradient(36rem 18rem at 100% 0%, color-mix(in oklab, var(--mm-accent-2) 26%, transparent), transparent 66%);
  }

  [data-microsite-root="true"] .mm-section-divider-top,
  [data-microsite-root="true"] .mm-section-divider-bottom {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: space-between;
    height: 2.75rem;
  }

  [data-microsite-root="true"] .mm-section-divider-top {
    margin-top: -2.75rem;
  }

  [data-microsite-root="true"] .mm-section-divider-top svg,
  [data-microsite-root="true"] .mm-section-divider-bottom svg {
    height: 100%;
    width: min(75%, 80rem);
    margin-inline: auto;
  }
`;
