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
    description: "Bright cobalt with mint highlights on a clean airy canvas.",
    primaryColor: "#2563eb",
    design: {
      accentSecondary: "#22d3ee",
      ringStart: "#bfdbfe",
      ringMiddle: "#2563eb",
      darkSurface: "#0f172a",
      pageBackground: "#f4f8ff",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#eaf1ff",
      textColor: "#0b1223",
      mutedTextColor: "#475569",
      borderColor: "rgba(37, 99, 235, 0.24)",
      patternStyle: "circuits",
      patternOpacity: 18,
      shadowStrength: "medium",
      cardStyle: "elevated",
    },
  },
  {
    id: "citrus",
    label: "Citrus Pop",
    description: "Sunny amber and lime with very bright, high-energy surfaces.",
    primaryColor: "#f59e0b",
    design: {
      accentSecondary: "#84cc16",
      ringStart: "#fde68a",
      ringMiddle: "#d97706",
      darkSurface: "#1f2937",
      pageBackground: "#fffdf2",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#fff5cf",
      textColor: "#2f2507",
      mutedTextColor: "#6e5a1f",
      borderColor: "rgba(245, 158, 11, 0.28)",
      patternStyle: "dots",
      patternOpacity: 14,
      radiusScale: "rounded",
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "coral",
    label: "Coral Wave",
    description: "Playful coral and cyan with soft rounded cards on bright backgrounds.",
    primaryColor: "#f43f5e",
    design: {
      accentSecondary: "#06b6d4",
      ringStart: "#fecdd3",
      ringMiddle: "#f43f5e",
      darkSurface: "#170a12",
      pageBackground: "#fff5f7",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#ffe8ee",
      textColor: "#3d1320",
      mutedTextColor: "#7f3350",
      borderColor: "rgba(244, 63, 94, 0.24)",
      patternStyle: "none",
      patternOpacity: 0,
      radiusScale: "rounded",
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "mint",
    label: "Mint Breeze",
    description: "Fresh mint palette with white cards and clean readability.",
    primaryColor: "#0ea5a4",
    design: {
      accentSecondary: "#22c55e",
      ringStart: "#99f6e4",
      ringMiddle: "#059669",
      darkSurface: "#06221f",
      pageBackground: "#f3fffb",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#dff7ef",
      textColor: "#0b2b27",
      mutedTextColor: "#2f6f68",
      borderColor: "rgba(14, 165, 164, 0.24)",
      patternStyle: "dots",
      patternOpacity: 16,
      radiusScale: "rounded",
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "lavender",
    label: "Lavender Glow",
    description: "Soft lavender palette with bright surfaces and strong legibility.",
    primaryColor: "#7c3aed",
    design: {
      accentSecondary: "#22d3ee",
      ringStart: "#ddd6fe",
      ringMiddle: "#6366f1",
      darkSurface: "#1f1845",
      pageBackground: "#f8f5ff",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#ede7ff",
      textColor: "#27164b",
      mutedTextColor: "#5f4b8b",
      borderColor: "rgba(124, 58, 237, 0.24)",
      patternStyle: "circuits",
      patternOpacity: 16,
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "skyline",
    label: "Skyline Blue",
    description: "Bright sky blue and indigo for modern conference-style microsites.",
    primaryColor: "#0284c7",
    design: {
      accentSecondary: "#60a5fa",
      ringStart: "#93c5fd",
      ringMiddle: "#2563eb",
      darkSurface: "#0d2238",
      pageBackground: "#f2f9ff",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#e2f0ff",
      textColor: "#0d2238",
      mutedTextColor: "#3d5f85",
      borderColor: "rgba(37, 99, 235, 0.22)",
      patternStyle: "grid",
      patternOpacity: 12,
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "rose",
    label: "Rose Quartz",
    description: "Warm rose tones with very bright backgrounds and readable text.",
    primaryColor: "#be185d",
    design: {
      accentSecondary: "#f97316",
      ringStart: "#fbcfe8",
      ringMiddle: "#be185d",
      darkSurface: "#2b1022",
      pageBackground: "#fff7fb",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#ffe7f4",
      textColor: "#3b1127",
      mutedTextColor: "#7a3b5a",
      borderColor: "rgba(190, 24, 93, 0.24)",
      patternStyle: "dots",
      patternOpacity: 12,
      radiusScale: "rounded",
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "retro",
    label: "Retro Paper",
    description: "Cream and poster-ink palette inspired by editorial print design.",
    primaryColor: "#1e3a8a",
    design: {
      accentSecondary: "#e11d48",
      ringStart: "#bfdbfe",
      ringMiddle: "#1e40af",
      darkSurface: "#231809",
      pageBackground: "#f7ecd8",
      surfaceBackground: "#fff9ec",
      surfaceMuted: "#ebdcc2",
      textColor: "#2b1d08",
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
    id: "glacier",
    label: "Glacier Mist",
    description: "Very bright cyan-white palette with crisp surfaces and clean lines.",
    primaryColor: "#06b6d4",
    design: {
      accentSecondary: "#3b82f6",
      ringStart: "#7dd3fc",
      ringMiddle: "#0284c7",
      darkSurface: "#0a2633",
      pageBackground: "#f3fcff",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#dff4fb",
      textColor: "#08242d",
      mutedTextColor: "#2e6070",
      borderColor: "rgba(6, 182, 212, 0.24)",
      patternStyle: "grid",
      patternOpacity: 14,
      shadowStrength: "soft",
      cardStyle: "elevated",
    },
  },
  {
    id: "mono",
    label: "Mono Light",
    description: "Minimal neutral theme with clean white backgrounds and subtle contrast.",
    primaryColor: "#4b5563",
    design: {
      accentSecondary: "#111827",
      ringStart: "#d1d5db",
      ringMiddle: "#4b5563",
      darkSurface: "#17171b",
      pageBackground: "#f7f7f8",
      surfaceBackground: "#ffffff",
      surfaceMuted: "#ececef",
      textColor: "#17171b",
      mutedTextColor: "#52525b",
      borderColor: "rgba(82, 82, 91, 0.2)",
      patternStyle: "grid",
      patternOpacity: 8,
      radiusScale: "compact",
      shadowStrength: "soft",
      cardStyle: "outlined",
    },
  },
  {
    id: "night",
    label: "Night Neon",
    description: "Dark neon option for teams that want a bold immersive look.",
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
      patternOpacity: 28,
      shadowStrength: "bold",
      cardStyle: "elevated",
      animation: "full",
    },
  },
  {
    id: "carbon",
    label: "Carbon Mono",
    description: "Dark graphite fallback with highly readable monochrome contrast.",
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
