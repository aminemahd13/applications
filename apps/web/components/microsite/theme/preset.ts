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

export type MicrositeDesignPreset = {
  id: string;
  label: string;
  description: string;
  primaryColor: string;
  design: Partial<MicrositeDesignSettings>;
};

export const MICROSITE_DESIGN_PRESETS: MicrositeDesignPreset[] = [
  {
    id: "electric",
    label: "Electric Pulse",
    description: "High-voltage cobalt with lime accents on a deep midnight canvas.",
    primaryColor: "#5b7fff",
    design: {
      accentSecondary: "#b7f871",
      ringStart: "#c7d2fe",
      ringMiddle: "#4f46e5",
      darkSurface: "#050816",
      pageBackground: "#0a1124",
      surfaceBackground: "#111b36",
      surfaceMuted: "#18244a",
      textColor: "#e8eeff",
      mutedTextColor: "#b2c0df",
      borderColor: "rgba(124, 150, 255, 0.3)",
      patternStyle: "circuits",
      patternOpacity: 28,
      shadowStrength: "bold",
      cardStyle: "elevated",
    },
  },
  {
    id: "sunset",
    label: "Sunset Studio",
    description: "Burnt orange and golden tones with cozy, cinematic depth.",
    primaryColor: "#f97316",
    design: {
      accentSecondary: "#facc15",
      ringStart: "#fed7aa",
      ringMiddle: "#ea580c",
      darkSurface: "#1f1208",
      pageBackground: "#2a170e",
      surfaceBackground: "#361f13",
      surfaceMuted: "#462816",
      textColor: "#ffead8",
      mutedTextColor: "#e3bfa2",
      borderColor: "rgba(249, 115, 22, 0.35)",
      patternStyle: "dots",
      patternOpacity: 22,
      radiusScale: "rounded",
      shadowStrength: "medium",
      cardStyle: "elevated",
    },
  },
  {
    id: "ink",
    label: "Ink Grid",
    description: "Editorial monochrome style with crisp lines and cyan highlights.",
    primaryColor: "#38bdf8",
    design: {
      accentSecondary: "#22d3ee",
      ringStart: "#7dd3fc",
      ringMiddle: "#0ea5e9",
      darkSurface: "#020617",
      pageBackground: "#10141c",
      surfaceBackground: "#171d29",
      surfaceMuted: "#202838",
      textColor: "#eef4ff",
      mutedTextColor: "#b4bfd4",
      borderColor: "rgba(148, 163, 184, 0.32)",
      patternStyle: "grid",
      patternOpacity: 18,
      radiusScale: "compact",
      shadowStrength: "medium",
      cardStyle: "outlined",
    },
  },
  {
    id: "night",
    label: "Night Neon",
    description: "Purple neon glow with strong contrast and energetic motion.",
    primaryColor: "#8b5cf6",
    design: {
      accentSecondary: "#06b6d4",
      ringStart: "#c4b5fd",
      ringMiddle: "#4f46e5",
      darkSurface: "#050717",
      pageBackground: "#0b1023",
      surfaceBackground: "#12193a",
      surfaceMuted: "#18224a",
      textColor: "#edf1ff",
      mutedTextColor: "#b3bef0",
      borderColor: "rgba(165, 180, 252, 0.28)",
      patternStyle: "circuits",
      patternOpacity: 30,
      shadowStrength: "bold",
      cardStyle: "elevated",
      animation: "full",
    },
  },
  {
    id: "forest",
    label: "Forest Signal",
    description: "Emerald-forward palette for community and sustainability events.",
    primaryColor: "#22c55e",
    design: {
      accentSecondary: "#facc15",
      ringStart: "#86efac",
      ringMiddle: "#16a34a",
      darkSurface: "#04140b",
      pageBackground: "#0b1f14",
      surfaceBackground: "#112b1c",
      surfaceMuted: "#173723",
      textColor: "#e1ffe9",
      mutedTextColor: "#9fd2b1",
      borderColor: "rgba(74, 222, 128, 0.3)",
      patternStyle: "dots",
      patternOpacity: 20,
      shadowStrength: "medium",
      cardStyle: "outlined",
    },
  },
  {
    id: "coral",
    label: "Coral Wave",
    description: "Playful coral and cyan with soft rounded cards and punchy contrast.",
    primaryColor: "#fb7185",
    design: {
      accentSecondary: "#38bdf8",
      ringStart: "#fecdd3",
      ringMiddle: "#f43f5e",
      darkSurface: "#170a12",
      pageBackground: "#2a1120",
      surfaceBackground: "#34172a",
      surfaceMuted: "#45203a",
      textColor: "#ffe7f0",
      mutedTextColor: "#dfb3c9",
      borderColor: "rgba(251, 113, 133, 0.33)",
      patternStyle: "none",
      patternOpacity: 0,
      radiusScale: "rounded",
      shadowStrength: "medium",
      cardStyle: "elevated",
    },
  },
  {
    id: "aurora",
    label: "Aurora Mint",
    description: "Mint-to-cyan theme with clean geometry and modern product vibes.",
    primaryColor: "#2dd4bf",
    design: {
      accentSecondary: "#67e8f9",
      ringStart: "#5eead4",
      ringMiddle: "#22d3ee",
      darkSurface: "#041918",
      pageBackground: "#0a2a27",
      surfaceBackground: "#103532",
      surfaceMuted: "#15423f",
      textColor: "#dcfffa",
      mutedTextColor: "#99d5cf",
      borderColor: "rgba(45, 212, 191, 0.3)",
      patternStyle: "grid",
      patternOpacity: 20,
      shadowStrength: "medium",
      cardStyle: "outlined",
    },
  },
  {
    id: "royal",
    label: "Royal Ember",
    description: "Royal blue with ember highlights for premium conference experiences.",
    primaryColor: "#60a5fa",
    design: {
      accentSecondary: "#fb923c",
      ringStart: "#93c5fd",
      ringMiddle: "#f97316",
      darkSurface: "#0d132d",
      pageBackground: "#131c3d",
      surfaceBackground: "#1a2650",
      surfaceMuted: "#223162",
      textColor: "#eaf0ff",
      mutedTextColor: "#bdcae9",
      borderColor: "rgba(96, 165, 250, 0.33)",
      patternStyle: "circuits",
      patternOpacity: 26,
      shadowStrength: "bold",
      cardStyle: "elevated",
    },
  },
  {
    id: "desert",
    label: "Desert Gold",
    description: "Sandstone and amber palette with warm editorial contrast.",
    primaryColor: "#d97706",
    design: {
      accentSecondary: "#fbbf24",
      ringStart: "#fde68a",
      ringMiddle: "#d97706",
      darkSurface: "#2f1d06",
      pageBackground: "#3a240a",
      surfaceBackground: "#4a3010",
      surfaceMuted: "#5a3c15",
      textColor: "#fff4d6",
      mutedTextColor: "#e6c68d",
      borderColor: "rgba(251, 191, 36, 0.35)",
      patternStyle: "dots",
      patternOpacity: 18,
      radiusScale: "compact",
      shadowStrength: "medium",
      cardStyle: "outlined",
    },
  },
  {
    id: "berry",
    label: "Berry Synth",
    description: "Magenta-plum atmosphere with neon cyan accents and rich depth.",
    primaryColor: "#e879f9",
    design: {
      accentSecondary: "#22d3ee",
      ringStart: "#f0abfc",
      ringMiddle: "#a21caf",
      darkSurface: "#1a0b1f",
      pageBackground: "#24102a",
      surfaceBackground: "#31163a",
      surfaceMuted: "#3f1d4b",
      textColor: "#fdeeff",
      mutedTextColor: "#dfb7e8",
      borderColor: "rgba(232, 121, 249, 0.33)",
      patternStyle: "circuits",
      patternOpacity: 24,
      shadowStrength: "bold",
      cardStyle: "elevated",
    },
  },
  {
    id: "ocean",
    label: "Ocean Current",
    description: "Deep oceanic blues with seafoam accents and clean geometry.",
    primaryColor: "#0ea5e9",
    design: {
      accentSecondary: "#34d399",
      ringStart: "#7dd3fc",
      ringMiddle: "#0284c7",
      darkSurface: "#04131d",
      pageBackground: "#081c2a",
      surfaceBackground: "#0d2638",
      surfaceMuted: "#133248",
      textColor: "#e4f7ff",
      mutedTextColor: "#a8cfe1",
      borderColor: "rgba(56, 189, 248, 0.31)",
      patternStyle: "grid",
      patternOpacity: 20,
      shadowStrength: "medium",
      cardStyle: "outlined",
    },
  },
  {
    id: "retro",
    label: "Retro Paper",
    description: "Cream, indigo, and tomato palette inspired by printed posters.",
    primaryColor: "#1e3a8a",
    design: {
      accentSecondary: "#e11d48",
      ringStart: "#bfdbfe",
      ringMiddle: "#1e40af",
      darkSurface: "#231809",
      pageBackground: "#f5e8d0",
      surfaceBackground: "#f9efd9",
      surfaceMuted: "#ead8b9",
      textColor: "#261a0b",
      mutedTextColor: "#6f5532",
      borderColor: "rgba(30, 58, 138, 0.25)",
      patternStyle: "none",
      patternOpacity: 0,
      radiusScale: "compact",
      shadowStrength: "soft",
      cardStyle: "flat",
    },
  },
  {
    id: "carbon",
    label: "Carbon Mono",
    description: "Ultra-clean graphite style for minimal and technical microsites.",
    primaryColor: "#a3a3a3",
    design: {
      accentSecondary: "#f5f5f5",
      ringStart: "#d4d4d4",
      ringMiddle: "#525252",
      darkSurface: "#09090b",
      pageBackground: "#121214",
      surfaceBackground: "#1a1a1f",
      surfaceMuted: "#22222a",
      textColor: "#f5f5f7",
      mutedTextColor: "#b4b4bf",
      borderColor: "rgba(163, 163, 163, 0.3)",
      patternStyle: "grid",
      patternOpacity: 10,
      radiusScale: "compact",
      shadowStrength: "soft",
      cardStyle: "outlined",
    },
  },
];
