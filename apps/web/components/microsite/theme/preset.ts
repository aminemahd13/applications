export type MicrositeHeadingFont = "sf" | "pally" | "neco";
export type MicrositeBodyFont = "inter" | "poppins" | "neco";
export type MicrositeContainerWidth = "normal" | "wide" | "ultra";
export type MicrositePatternStyle = "circuits" | "dots" | "grid" | "none";
export type MicrositeRadiusScale = "compact" | "comfortable" | "rounded";
export type MicrositeShadowStrength = "soft" | "medium" | "bold";
export type MicrositeCardStyle = "elevated" | "outlined" | "flat";
export type MicrositeMotionStyle = "full" | "reduced" | "none";

export type MicrositeDesignSettings = {
  headingFont: MicrositeHeadingFont;
  bodyFont: MicrositeBodyFont;
  containerWidth: MicrositeContainerWidth;
  accentSecondary: string;
  ringStart: string;
  ringMiddle: string;
  darkSurface: string;
  pageBackground: string;
  surfaceBackground: string;
  surfaceMuted: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  patternStyle: MicrositePatternStyle;
  patternOpacity: number;
  radiusScale: MicrositeRadiusScale;
  shadowStrength: MicrositeShadowStrength;
  cardStyle: MicrositeCardStyle;
  animation: MicrositeMotionStyle;
};

export type MicrositeTheme = {
  accent: string;
  accentSecondary: string;
  ringStart: string;
  ringMiddle: string;
  darkSurface: string;
  pageBackground: string;
  surfaceBackground: string;
  surfaceMuted: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  backgroundPatternOpacity: number;
  headingFontClass: "mm-heading-sf";
  bodyFontClass: "mm-body-inter";
  designDefaults: MicrositeDesignSettings;
};

export const MICROSITE_THEME: MicrositeTheme = {
  accent: "#1c55ff",
  accentSecondary: "#e5ff52",
  ringStart: "#e2cbff",
  ringMiddle: "#393bb2",
  darkSurface: "#030712",
  pageBackground: "#ffffff",
  surfaceBackground: "#ffffff",
  surfaceMuted: "#f6f8fb",
  textColor: "#030712",
  mutedTextColor: "#4b5563",
  borderColor: "rgba(15, 23, 42, 0.14)",
  backgroundPatternOpacity: 0.2,
  headingFontClass: "mm-heading-sf",
  bodyFontClass: "mm-body-inter",
  designDefaults: {
    headingFont: "sf",
    bodyFont: "inter",
    containerWidth: "wide",
    accentSecondary: "#e5ff52",
    ringStart: "#e2cbff",
    ringMiddle: "#393bb2",
    darkSurface: "#030712",
    pageBackground: "#ffffff",
    surfaceBackground: "#ffffff",
    surfaceMuted: "#f6f8fb",
    textColor: "#030712",
    mutedTextColor: "#4b5563",
    borderColor: "rgba(15, 23, 42, 0.14)",
    patternStyle: "circuits",
    patternOpacity: 20,
    radiusScale: "comfortable",
    shadowStrength: "medium",
    cardStyle: "elevated",
    animation: "full",
  },
};

export type MicrositeDesignPresetMode = "light" | "dark";

export type MicrositeDesignPresetVariant = {
  primaryColor: string;
  design: Partial<MicrositeDesignSettings>;
};

export type MicrositeDesignPreset = {
  id: string;
  label: string;
  description: string;
  variants: Record<MicrositeDesignPresetMode, MicrositeDesignPresetVariant>;
};

export const MICROSITE_DESIGN_PRESETS: MicrositeDesignPreset[] = [
  {
    id: "electric",
    label: "Electric Pulse",
    description: "Vivid accents and bold contrast for high-energy campaigns.",
    variants: {
      light: {
        primaryColor: "#1c55ff",
        design: {
          accentSecondary: "#e5ff52",
          ringStart: "#d4c5ff",
          ringMiddle: "#4f46e5",
          darkSurface: "#020617",
          pageBackground: "#f8fbff",
          surfaceBackground: "#ffffff",
          surfaceMuted: "#ecf2ff",
          textColor: "#0f172a",
          mutedTextColor: "#475569",
          borderColor: "rgba(37, 99, 235, 0.24)",
          patternStyle: "circuits",
          patternOpacity: 22,
          shadowStrength: "medium",
          cardStyle: "elevated",
        },
      },
      dark: {
        primaryColor: "#7aa2ff",
        design: {
          accentSecondary: "#a3ff6f",
          ringStart: "#c4b5fd",
          ringMiddle: "#6366f1",
          darkSurface: "#050816",
          pageBackground: "#060d1f",
          surfaceBackground: "#0b1630",
          surfaceMuted: "#122043",
          textColor: "#e4ecff",
          mutedTextColor: "#a9b7d8",
          borderColor: "rgba(122, 162, 255, 0.32)",
          patternStyle: "circuits",
          patternOpacity: 26,
          shadowStrength: "bold",
          cardStyle: "elevated",
        },
      },
    },
  },
  {
    id: "sunset",
    label: "Sunset Studio",
    description: "Warm hues with gentle depth and expressive rounded surfaces.",
    variants: {
      light: {
        primaryColor: "#e75b2b",
        design: {
          accentSecondary: "#ffd166",
          ringStart: "#ffe0ba",
          ringMiddle: "#e75b2b",
          darkSurface: "#2b1208",
          pageBackground: "#fff8f1",
          surfaceBackground: "#fffdfb",
          surfaceMuted: "#ffeedd",
          textColor: "#3b1f16",
          mutedTextColor: "#7c4a33",
          borderColor: "rgba(231, 91, 43, 0.24)",
          patternStyle: "dots",
          patternOpacity: 16,
          radiusScale: "rounded",
          shadowStrength: "soft",
          cardStyle: "elevated",
        },
      },
      dark: {
        primaryColor: "#ff874f",
        design: {
          accentSecondary: "#ffd37c",
          ringStart: "#ffbd95",
          ringMiddle: "#ff6b36",
          darkSurface: "#1d0f09",
          pageBackground: "#22130d",
          surfaceBackground: "#2b1a13",
          surfaceMuted: "#382116",
          textColor: "#ffe8d6",
          mutedTextColor: "#e0b999",
          borderColor: "rgba(255, 148, 92, 0.33)",
          patternStyle: "dots",
          patternOpacity: 22,
          radiusScale: "rounded",
          shadowStrength: "medium",
          cardStyle: "elevated",
        },
      },
    },
  },
  {
    id: "ink",
    label: "Ink Grid",
    description: "Sharp editorial style with subtle grid texture and clean outlines.",
    variants: {
      light: {
        primaryColor: "#0f172a",
        design: {
          accentSecondary: "#22d3ee",
          ringStart: "#93c5fd",
          ringMiddle: "#0f172a",
          darkSurface: "#020617",
          pageBackground: "#f8fafc",
          surfaceBackground: "#ffffff",
          surfaceMuted: "#e2e8f0",
          textColor: "#0f172a",
          mutedTextColor: "#334155",
          borderColor: "rgba(15, 23, 42, 0.22)",
          patternStyle: "grid",
          patternOpacity: 14,
          radiusScale: "compact",
          shadowStrength: "soft",
          cardStyle: "outlined",
        },
      },
      dark: {
        primaryColor: "#38bdf8",
        design: {
          accentSecondary: "#22d3ee",
          ringStart: "#7dd3fc",
          ringMiddle: "#0ea5e9",
          darkSurface: "#020617",
          pageBackground: "#040914",
          surfaceBackground: "#0a1220",
          surfaceMuted: "#111c2e",
          textColor: "#e2e8f0",
          mutedTextColor: "#94a3b8",
          borderColor: "rgba(148, 163, 184, 0.3)",
          patternStyle: "grid",
          patternOpacity: 18,
          radiusScale: "compact",
          shadowStrength: "medium",
          cardStyle: "outlined",
        },
      },
    },
  },
  {
    id: "night",
    label: "Night Neon",
    description: "Dark immersive mood with bright accent trails and high legibility.",
    variants: {
      light: {
        primaryColor: "#7c3aed",
        design: {
          accentSecondary: "#22d3ee",
          ringStart: "#c4b5fd",
          ringMiddle: "#6366f1",
          darkSurface: "#020617",
          pageBackground: "#f7f5ff",
          surfaceBackground: "#ffffff",
          surfaceMuted: "#ecebff",
          textColor: "#22123d",
          mutedTextColor: "#5f4b8b",
          borderColor: "rgba(124, 58, 237, 0.24)",
          patternStyle: "circuits",
          patternOpacity: 18,
          shadowStrength: "medium",
          cardStyle: "elevated",
          animation: "full",
        },
      },
      dark: {
        primaryColor: "#7c3aed",
        design: {
          accentSecondary: "#06b6d4",
          ringStart: "#c4b5fd",
          ringMiddle: "#4338ca",
          darkSurface: "#020617",
          pageBackground: "#030712",
          surfaceBackground: "#0b1223",
          surfaceMuted: "#131c32",
          textColor: "#e2e8f0",
          mutedTextColor: "#a5b4fc",
          borderColor: "rgba(165, 180, 252, 0.26)",
          patternStyle: "circuits",
          patternOpacity: 26,
          shadowStrength: "bold",
          cardStyle: "elevated",
          animation: "full",
        },
      },
    },
  },
  {
    id: "forest",
    label: "Forest Signal",
    description: "Fresh green palette tuned for sustainability and community-led events.",
    variants: {
      light: {
        primaryColor: "#1f9d55",
        design: {
          accentSecondary: "#f59e0b",
          ringStart: "#bbf7d0",
          ringMiddle: "#16a34a",
          darkSurface: "#04140b",
          pageBackground: "#f5fff8",
          surfaceBackground: "#ffffff",
          surfaceMuted: "#e8f7ee",
          textColor: "#07240f",
          mutedTextColor: "#2f6d47",
          borderColor: "rgba(22, 163, 74, 0.24)",
          patternStyle: "dots",
          patternOpacity: 15,
          shadowStrength: "soft",
          cardStyle: "elevated",
        },
      },
      dark: {
        primaryColor: "#4ade80",
        design: {
          accentSecondary: "#facc15",
          ringStart: "#86efac",
          ringMiddle: "#22c55e",
          darkSurface: "#04140b",
          pageBackground: "#071a10",
          surfaceBackground: "#0d2417",
          surfaceMuted: "#143020",
          textColor: "#dcfce7",
          mutedTextColor: "#8dc5a4",
          borderColor: "rgba(74, 222, 128, 0.3)",
          patternStyle: "dots",
          patternOpacity: 22,
          shadowStrength: "medium",
          cardStyle: "outlined",
        },
      },
    },
  },
  {
    id: "coral",
    label: "Coral Wave",
    description: "Playful coral and cyan mix for youth programs and social campaigns.",
    variants: {
      light: {
        primaryColor: "#f43f5e",
        design: {
          accentSecondary: "#38bdf8",
          ringStart: "#fecdd3",
          ringMiddle: "#fb7185",
          darkSurface: "#170a12",
          pageBackground: "#fff6f8",
          surfaceBackground: "#ffffff",
          surfaceMuted: "#ffe9ee",
          textColor: "#3f1020",
          mutedTextColor: "#7f3350",
          borderColor: "rgba(244, 63, 94, 0.24)",
          patternStyle: "none",
          patternOpacity: 0,
          radiusScale: "rounded",
          shadowStrength: "soft",
          cardStyle: "elevated",
        },
      },
      dark: {
        primaryColor: "#fb7185",
        design: {
          accentSecondary: "#38bdf8",
          ringStart: "#fecdd3",
          ringMiddle: "#f43f5e",
          darkSurface: "#170a12",
          pageBackground: "#1d0b16",
          surfaceBackground: "#2a1220",
          surfaceMuted: "#35172a",
          textColor: "#ffe4ed",
          mutedTextColor: "#d8a5bb",
          borderColor: "rgba(251, 113, 133, 0.33)",
          patternStyle: "none",
          patternOpacity: 0,
          radiusScale: "rounded",
          shadowStrength: "medium",
          cardStyle: "elevated",
        },
      },
    },
  },
];
