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
    card:
      "0 12px 28px color-mix(in oklab, var(--mm-dark) 18%, transparent), inset 0 1px 0 color-mix(in oklab, #ffffff 50%, transparent)",
    surface:
      "0 16px 38px color-mix(in oklab, var(--mm-dark) 20%, transparent), inset 0 1px 0 color-mix(in oklab, #ffffff 55%, transparent)",
  },
  medium: {
    card:
      "0 20px 46px color-mix(in oklab, var(--mm-dark) 23%, transparent), inset 0 1px 0 color-mix(in oklab, #ffffff 58%, transparent)",
    surface:
      "0 26px 58px color-mix(in oklab, var(--mm-dark) 25%, transparent), inset 0 1px 0 color-mix(in oklab, #ffffff 62%, transparent)",
  },
  bold: {
    card:
      "0 28px 66px color-mix(in oklab, var(--mm-dark) 30%, transparent), 0 0 0 1px color-mix(in oklab, var(--mm-accent) 14%, transparent) inset",
    surface:
      "0 34px 80px color-mix(in oklab, var(--mm-dark) 32%, transparent), 0 0 0 1px color-mix(in oklab, var(--mm-accent) 16%, transparent) inset",
  },
};

function resolveCardVisuals(cardStyle: MicrositeCardStyle, shadowStrength: MicrositeShadowStrength) {
  const shadows = SHADOW_MAP[shadowStrength];

  if (cardStyle === "flat") {
    return {
      cardBackground: "color-mix(in oklab, var(--mm-soft) 84%, var(--mm-accent) 16%)",
      cardBorder: "color-mix(in oklab, var(--mm-border) 66%, var(--mm-accent) 34%)",
      cardShadow: "none",
    };
  }

  if (cardStyle === "outlined") {
    return {
      cardBackground:
        "linear-gradient(160deg, color-mix(in oklab, var(--mm-surface) 86%, var(--mm-accent) 14%) 0%, color-mix(in oklab, var(--mm-surface) 82%, var(--mm-accent-2) 18%) 100%)",
      cardBorder: "color-mix(in oklab, var(--mm-accent) 44%, var(--mm-border) 56%)",
      cardShadow: "none",
    };
  }

  return {
    cardBackground:
      "linear-gradient(165deg, color-mix(in oklab, var(--mm-surface) 88%, var(--mm-accent) 12%) 0%, var(--mm-surface) 52%, color-mix(in oklab, var(--mm-surface) 86%, var(--mm-accent-2) 14%) 100%)",
    cardBorder: "color-mix(in oklab, var(--mm-border) 76%, var(--mm-accent) 24%)",
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
  const accentBlend = `color-mix(in oklab, ${accent} 56%, ${design.accentSecondary} 44%)`;
  const lightBase = "#f4f8ff";
  const lightSurface = "#ffffff";
  const lightSoft = "#e8eeff";
  const lightText = "#0b1328";
  const lightMuted = "#3f4f69";
  const lightBorder = "rgba(37, 99, 235, 0.2)";
  const darkTextFallback = "#f8fbff";
  const darkMutedFallback = "#c7d2fe";
  const darkBorderFallback = "#a5b4fc";

  const paletteLight = {
    dark: `color-mix(in oklab, ${darkBase} 56%, ${design.ringMiddle} 44%)`,
    bg: `color-mix(in oklab, ${design.pageBackground} 66%, color-mix(in oklab, ${lightBase} 78%, ${accentBlend} 22%) 34%)`,
    surface: `color-mix(in oklab, ${design.surfaceBackground} 74%, color-mix(in oklab, ${lightSurface} 88%, ${accentBlend} 12%) 26%)`,
    soft: `color-mix(in oklab, ${design.surfaceMuted} 63%, color-mix(in oklab, ${lightSoft} 52%, ${accentBlend} 48%) 37%)`,
    text: `color-mix(in oklab, ${design.textColor} 56%, ${lightText} 44%)`,
    muted: `color-mix(in oklab, ${design.mutedTextColor} 56%, ${lightMuted} 44%)`,
    border: `color-mix(in oklab, ${design.borderColor} 60%, ${lightBorder} 40%)`,
  };

  const paletteDark = {
    dark: `color-mix(in oklab, ${darkBase} 82%, ${design.ringMiddle} 18%)`,
    bg: `color-mix(in oklab, ${darkBase} 76%, color-mix(in oklab, ${design.pageBackground} 28%, ${accentBlend} 72%) 24%)`,
    surface: `color-mix(in oklab, ${darkBase} 66%, color-mix(in oklab, ${design.surfaceBackground} 32%, ${accentBlend} 68%) 34%)`,
    soft: `color-mix(in oklab, ${darkBase} 58%, color-mix(in oklab, ${design.surfaceMuted} 36%, ${accentBlend} 64%) 42%)`,
    text: `color-mix(in oklab, ${design.textColor} 18%, ${darkTextFallback} 82%)`,
    muted: `color-mix(in oklab, ${design.mutedTextColor} 30%, ${darkMutedFallback} 70%)`,
    border: `color-mix(in oklab, ${design.borderColor} 44%, ${darkBorderFallback} 56%)`,
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
    background: color-mix(in oklab, var(--mm-soft) 54%, var(--mm-accent) 46%);
  }

  [data-microsite-root="true"] .microsite-card {
    border: 1px solid var(--mm-card-border, var(--mm-border));
    background: var(--mm-card-bg, var(--mm-surface));
    border-radius: var(--mm-card-radius, 1.35rem);
    box-shadow: var(--mm-shadow-card, 0 18px 45px rgba(15, 23, 42, 0.08));
    backdrop-filter: saturate(120%) blur(1px);
  }

  [data-microsite-root="true"] .microsite-surface {
    border: 1px solid var(--mm-border);
    background:
      linear-gradient(
        165deg,
        color-mix(in oklab, var(--mm-surface) 90%, var(--mm-accent) 10%) 0%,
        var(--mm-surface) 52%,
        color-mix(in oklab, var(--mm-surface) 88%, var(--mm-accent-2) 12%) 100%
      );
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
    background:
      radial-gradient(26rem 16rem at 12% -4%, color-mix(in oklab, var(--mm-accent) 30%, transparent), transparent 72%),
      radial-gradient(24rem 14rem at 92% 0%, color-mix(in oklab, var(--mm-accent-2) 28%, transparent), transparent 74%),
      linear-gradient(145deg, color-mix(in oklab, var(--mm-dark) 88%, #010409) 0%, color-mix(in oklab, var(--mm-dark) 80%, var(--mm-ring-middle) 20%) 100%);
    color: #fff;
  }

  [data-microsite-root="true"] .mm-pattern-cta {
    height: 100%;
    background:
      radial-gradient(16rem 11rem at 18% -10%, color-mix(in oklab, var(--mm-accent) 44%, transparent), transparent 68%),
      radial-gradient(16rem 10rem at 90% 0%, color-mix(in oklab, var(--mm-accent-2) 34%, transparent), transparent 70%),
      linear-gradient(140deg, color-mix(in oklab, var(--mm-dark) 86%, #020617) 0%, color-mix(in oklab, var(--mm-dark) 74%, var(--mm-ring-middle) 26%) 100%);
  }

  [data-microsite-root="true"] .mm-primary-button {
    background:
      linear-gradient(
        140deg,
        color-mix(in oklab, var(--mm-accent) 84%, #ffffff 16%) 0%,
        color-mix(in oklab, var(--mm-accent) 70%, var(--mm-ring-middle) 30%) 100%
      );
    color: #fff;
    border: 1px solid color-mix(in oklab, var(--mm-accent) 58%, var(--mm-ring-middle) 42%);
    border-radius: var(--mm-button-radius, 9999px);
    box-shadow: 0 12px 26px color-mix(in oklab, var(--mm-accent) 34%, transparent);
    transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
  }

  [data-microsite-root="true"] .mm-primary-button:hover {
    transform: translateY(-1px);
    filter: saturate(1.12);
    box-shadow: 0 16px 30px color-mix(in oklab, var(--mm-accent) 44%, transparent);
  }

  [data-microsite-root="true"] .mm-ring-button {
    position: relative;
    display: inline-flex;
    height: 2.75rem;
    overflow: hidden;
    border-radius: var(--mm-button-radius, 9999px);
    padding: 1px;
    outline: none;
    transition: transform 180ms ease, filter 180ms ease;
  }

  [data-microsite-root="true"] .mm-ring-button::before {
    content: "";
    position: absolute;
    inset: -1000%;
    animation: mm-spin 2s linear infinite;
    background: conic-gradient(from 90deg at 50% 50%, var(--mm-ring-start) 0%, var(--mm-ring-middle) 50%, var(--mm-ring-start) 100%);
  }

  [data-microsite-root="true"] .mm-ring-button > .mm-ring-button-inner {
    position: relative;
    display: inline-flex;
    height: 100%;
    width: auto;
    min-width: fit-content;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    white-space: nowrap;
    border-radius: var(--mm-button-radius, 9999px);
    background: var(--mm-surface);
    padding: 0 1.5rem;
    color: var(--mm-text);
    backdrop-filter: blur(24px);
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  [data-microsite-root="true"] .mm-ring-button:hover {
    transform: translateY(-1px);
    filter: saturate(1.08);
  }

  [data-microsite-root="true"] .mm-ring-button:hover > .mm-ring-button-inner {
    box-shadow: 0 10px 22px color-mix(in oklab, var(--mm-accent) 20%, transparent) inset;
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
    box-shadow: 0 10px 24px color-mix(in oklab, var(--mm-dark) 20%, transparent);
    transition: border-color 180ms ease;
  }

  [data-microsite-root="true"] .mm-faq-button:hover {
    border-color: var(--mm-accent);
  }

  [data-microsite-root="true"] .mm-feedback-link {
    position: relative;
  }

  [data-microsite-root="true"] .mm-feedback-link[data-cta-state="loading"] {
    filter: saturate(1.05);
  }

  [data-microsite-root="true"] .mm-feedback-link[data-cta-state="success"] {
    filter: saturate(1.12);
  }

  [data-microsite-root="true"] .mm-feedback-badge {
    position: absolute;
    right: 0.2rem;
    top: 0.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.15rem;
    min-width: 1.15rem;
    border-radius: 9999px;
    border: 1px solid color-mix(in oklab, var(--mm-accent) 58%, var(--mm-border) 42%);
    background: var(--mm-surface);
    color: var(--mm-accent);
    box-shadow: 0 8px 20px color-mix(in oklab, var(--mm-dark) 20%, transparent);
    transition: opacity 180ms ease, transform 180ms ease;
    transform: scale(0.92);
    z-index: 2;
  }

  [data-microsite-root="true"] .mm-feedback-link[data-cta-state="loading"] .mm-feedback-badge,
  [data-microsite-root="true"] .mm-feedback-link[data-cta-state="success"] .mm-feedback-badge {
    transform: scale(1);
  }

  [data-microsite-root="true"] .custom-shadow {
    border-radius: var(--mm-surface-radius, 1.7rem);
    box-shadow: 0 0 35px 0 color-mix(in oklab, var(--mm-accent) 55%, transparent);
  }

  [data-microsite-root="true"] .mm-logo-shell {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.9rem;
    border: 1px solid color-mix(in oklab, var(--mm-border) 64%, var(--mm-accent) 36%);
    background:
      radial-gradient(120% 120% at 15% 0%, color-mix(in oklab, var(--mm-accent) 22%, transparent), transparent 58%),
      linear-gradient(160deg, color-mix(in oklab, var(--mm-surface) 88%, var(--mm-bg) 12%) 0%, color-mix(in oklab, var(--mm-surface) 76%, var(--mm-soft) 24%) 100%);
    box-shadow:
      0 10px 24px color-mix(in oklab, var(--mm-dark) 20%, transparent),
      inset 0 1px 0 color-mix(in oklab, #ffffff 58%, transparent);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  [data-microsite-root="true"] .mm-logo-shell:hover {
    transform: translateY(-1px);
    border-color: color-mix(in oklab, var(--mm-accent) 60%, var(--mm-border) 40%);
    box-shadow:
      0 14px 28px color-mix(in oklab, var(--mm-dark) 24%, transparent),
      0 0 0 1px color-mix(in oklab, var(--mm-accent) 28%, transparent) inset;
  }

  [data-microsite-root="true"] .mm-logo-shell img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 2px 9px color-mix(in oklab, var(--mm-dark) 22%, transparent));
  }

  [data-microsite-root="true"] .mm-outline-button {
    border: 1px solid color-mix(in oklab, var(--mm-accent) 52%, var(--mm-border) 48%);
    color: var(--mm-text);
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--mm-surface) 82%, var(--mm-accent) 18%) 0%,
        color-mix(in oklab, var(--mm-surface) 78%, var(--mm-accent-2) 22%) 100%
      );
    border-radius: var(--mm-button-radius, 9999px);
    box-shadow: 0 8px 20px color-mix(in oklab, var(--mm-accent) 20%, transparent);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  [data-microsite-root="true"] .mm-outline-button:hover {
    transform: translateY(-1px);
    border-color: color-mix(in oklab, var(--mm-accent) 70%, var(--mm-accent-2) 30%);
    box-shadow: 0 12px 24px color-mix(in oklab, var(--mm-accent) 28%, transparent);
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
      radial-gradient(52rem 25rem at 6% 0%, color-mix(in oklab, var(--mm-accent) 38%, transparent), transparent 66%),
      radial-gradient(40rem 20rem at 100% 0%, color-mix(in oklab, var(--mm-accent-2) 34%, transparent), transparent 68%),
      linear-gradient(180deg, color-mix(in oklab, var(--mm-bg) 78%, var(--mm-surface) 22%) 0%, var(--mm-bg) 56%, color-mix(in oklab, var(--mm-bg) 76%, var(--mm-dark) 24%) 100%);
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

  [data-microsite-root="true"] table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--mm-border);
    border-radius: 0.85rem;
    overflow: hidden;
  }

  [data-microsite-root="true"] th,
  [data-microsite-root="true"] td {
    border: 1px solid color-mix(in oklab, var(--mm-border) 70%, var(--mm-accent) 30%);
    padding: 0.45rem 0.6rem;
    text-align: left;
    font-size: 0.86rem;
  }

  [data-microsite-root="true"] th {
    background: color-mix(in oklab, var(--mm-soft) 82%, var(--mm-accent) 18%);
    color: var(--mm-text);
  }

  [data-microsite-root="true"] .mm-task-item {
    list-style: none;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-left: -1.2rem;
  }

  [data-microsite-root="true"] .mm-task-box {
    margin-top: 0.2rem;
    display: inline-flex;
    height: 0.92rem;
    width: 0.92rem;
    align-items: center;
    justify-content: center;
    border-radius: 0.2rem;
    border: 1px solid color-mix(in oklab, var(--mm-border) 74%, var(--mm-accent) 26%);
    background: var(--mm-surface);
    color: transparent;
    font-size: 0.7rem;
    line-height: 1;
  }

  [data-microsite-root="true"] .mm-task-box.is-checked {
    border-color: color-mix(in oklab, var(--mm-accent) 68%, var(--mm-border) 32%);
    background: color-mix(in oklab, var(--mm-accent) 28%, var(--mm-surface) 72%);
    color: var(--mm-accent);
  }

  [data-microsite-root="true"] .mm-director-frame {
    position: relative;
    height: clamp(15rem, 32vw, 23rem);
    width: 100%;
    overflow: hidden;
    border-radius: var(--mm-card-radius, 1.35rem);
    border: 1px solid color-mix(in oklab, var(--mm-border) 74%, var(--mm-accent) 26%);
    background: color-mix(in oklab, var(--mm-soft) 70%, var(--mm-surface) 30%);
    box-shadow:
      0 24px 52px color-mix(in oklab, var(--mm-dark) 26%, transparent),
      inset 0 1px 0 color-mix(in oklab, #ffffff 58%, transparent);
  }

  [data-microsite-root="true"] .mm-director-frame::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
    background:
      linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--mm-dark) 16%, transparent) 68%, color-mix(in oklab, var(--mm-dark) 30%, transparent) 100%);
  }

  [data-microsite-root="true"] .mm-hero-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 420ms ease;
    z-index: 1;
  }

  [data-microsite-root="true"] .mm-hero-slide.is-active {
    opacity: 1;
    z-index: 2;
  }

  [data-microsite-root="true"] .mm-hero-slide img {
    transform-origin: center;
    will-change: transform, clip-path, filter;
  }

  @keyframes mm-hero-pan-left {
    0% {
      transform: scale(1.08) translateX(3.5%);
    }
    100% {
      transform: scale(1.14) translateX(-3.5%);
    }
  }

  @keyframes mm-hero-pan-right {
    0% {
      transform: scale(1.08) translateX(-3.5%);
    }
    100% {
      transform: scale(1.14) translateX(3.5%);
    }
  }

  @keyframes mm-hero-zoom-in {
    0% {
      transform: scale(1.01);
    }
    100% {
      transform: scale(1.16);
    }
  }

  @keyframes mm-hero-parallax {
    0% {
      transform: scale(1.14) translateY(-2%) translateX(-0.7%);
    }
    50% {
      transform: scale(1.12) translateY(1.5%) translateX(0.8%);
    }
    100% {
      transform: scale(1.15) translateY(-1.2%) translateX(-0.6%);
    }
  }

  @keyframes mm-hero-split-reveal {
    0% {
      clip-path: inset(0 50% 0 50%);
      transform: scale(1.07);
      filter: saturate(0.95);
    }
    35% {
      clip-path: inset(0 26% 0 26%);
    }
    100% {
      clip-path: inset(0 0 0 0);
      transform: scale(1.14);
      filter: saturate(1.08);
    }
  }

  [data-microsite-root="true"] .mm-hero-anim-pan-left {
    animation: mm-hero-pan-left 6.2s ease forwards;
  }

  [data-microsite-root="true"] .mm-hero-anim-pan-right {
    animation: mm-hero-pan-right 6.2s ease forwards;
  }

  [data-microsite-root="true"] .mm-hero-anim-zoom-in {
    animation: mm-hero-zoom-in 6.2s ease forwards;
  }

  [data-microsite-root="true"] .mm-hero-anim-parallax {
    animation: mm-hero-parallax 6.2s ease-in-out forwards;
  }

  [data-microsite-root="true"] .mm-hero-anim-split-reveal {
    animation: mm-hero-split-reveal 6.2s cubic-bezier(0.22, 0.72, 0.2, 1) forwards;
  }

  [data-microsite-root="true"] .mm-hero-frame-label {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    z-index: 4;
    max-width: calc(100% - 6rem);
    border-radius: 9999px;
    border: 1px solid color-mix(in oklab, var(--mm-border) 55%, transparent);
    background: color-mix(in oklab, var(--mm-dark) 46%, transparent);
    padding: 0.2rem 0.65rem;
    font-size: 0.74rem;
    font-weight: 600;
    color: #f8fafc;
    backdrop-filter: blur(8px);
  }

  [data-microsite-root="true"] .mm-hero-dots {
    position: absolute;
    right: 0.75rem;
    bottom: 0.7rem;
    z-index: 4;
    display: flex;
    gap: 0.35rem;
  }

  [data-microsite-root="true"] .mm-hero-dot {
    width: 0.58rem;
    height: 0.58rem;
    border-radius: 9999px;
    border: 1px solid color-mix(in oklab, #ffffff 75%, transparent);
    background: color-mix(in oklab, #ffffff 30%, transparent);
    transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease;
  }

  [data-microsite-root="true"] .mm-hero-dot.is-active {
    transform: scale(1.15);
    background: #ffffff;
    border-color: #ffffff;
  }

  [data-microsite-root="true"].mm-motion-reduced .mm-hero-anim-pan-left,
  [data-microsite-root="true"].mm-motion-reduced .mm-hero-anim-pan-right,
  [data-microsite-root="true"].mm-motion-reduced .mm-hero-anim-zoom-in,
  [data-microsite-root="true"].mm-motion-reduced .mm-hero-anim-parallax,
  [data-microsite-root="true"].mm-motion-reduced .mm-hero-anim-split-reveal {
    animation-duration: 2.4s;
  }

  [data-microsite-root="true"].mm-motion-none .mm-hero-anim-pan-left,
  [data-microsite-root="true"].mm-motion-none .mm-hero-anim-pan-right,
  [data-microsite-root="true"].mm-motion-none .mm-hero-anim-zoom-in,
  [data-microsite-root="true"].mm-motion-none .mm-hero-anim-parallax,
  [data-microsite-root="true"].mm-motion-none .mm-hero-anim-split-reveal {
    animation: none !important;
    transform: scale(1.08);
    clip-path: inset(0 0 0 0) !important;
  }
`;
