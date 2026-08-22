/**
 * THEME
 *
 * The seller dresses the room they build their world in. The constraint that
 * makes this safe rather than a way to break your own interface: the accent is
 * free, but we compute what colour text must be on top of it, so a dark accent
 * gets white text and a neon one gets black. Nobody can pick their way into an
 * unreadable button.
 */

export type RailStyle = "black" | "white" | "accent";
export type WallpaperKind = "globe" | "grid" | "shine" | "none" | "custom";

export interface Theme {
  preset: string;
  accent: string;
  rail: RailStyle;
  wallpaperKind: WallpaperKind;
  wallpaperPath: string | null;
  wallpaperSrc: string | null;
  wallpaperOpacity: number;
  /** Wallpaper colour. null means "follow my accent". */
  wallpaperAccent: string | null;
  /** Show the door on the way in. Off means go straight to Home. */
  door: boolean;
}

export const DEFAULT_THEME: Theme = {
  preset: "signature",
  accent: "#EE6FC0",
  rail: "black",
  wallpaperKind: "globe",
  wallpaperPath: null,
  wallpaperSrc: null,
  wallpaperOpacity: 22,
  wallpaperAccent: null,
  door: true,
};

/* ------------------------------------------------------------------ */
/* colour maths                                                        */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function toHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white — whichever is actually readable on this accent. */
export function onAccent(accent: string) {
  return contrastRatio(accent, "#000000") >= contrastRatio(accent, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}

function mix(hex: string, target: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

/**
 * A darkened accent that is always readable as text on white. Light accents
 * (yellow, mint) would vanish otherwise, so we walk them down until they pass.
 */
export function accentInk(accent: string) {
  let c = accent;
  let guard = 0;
  while (contrastRatio(c, "#FFFFFF") < 4.5 && guard < 24) {
    c = mix(c, "#000000", 0.09);
    guard++;
  }
  return c;
}

/** A pale tint of the accent for chip and note backgrounds. */
export function accentSoft(accent: string) {
  return mix(accent, "#FFFFFF", 0.88);
}

export function accentHover(accent: string) {
  return luminance(accent) > 0.5
    ? mix(accent, "#000000", 0.1)
    : mix(accent, "#FFFFFF", 0.12);
}

/* ------------------------------------------------------------------ */
/* presets                                                             */
/* ------------------------------------------------------------------ */

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  accent: string;
  rail: RailStyle;
  wallpaperKind: WallpaperKind;
  wallpaperOpacity: number;
}

export const PRESETS: Preset[] = [
  {
    id: "signature",
    name: "Signature",
    blurb: "The house look. Black rail, hot pink, the globe turning behind it.",
    accent: "#EE6FC0",
    rail: "black",
    wallpaperKind: "globe",
    wallpaperOpacity: 22,
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "Black rail, electric violet, no wallpaper. Quiet and severe.",
    accent: "#8B5CF6",
    rail: "black",
    wallpaperKind: "none",
    wallpaperOpacity: 0,
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    blurb: "Pink rail, black type, the shine behind everything. Loud on purpose.",
    accent: "#FF4FA3",
    rail: "accent",
    wallpaperKind: "shine",
    wallpaperOpacity: 34,
  },
  {
    id: "paper",
    name: "Paper",
    blurb: "White rail, black accent, faint grid. Nothing between you and the work.",
    accent: "#111111",
    rail: "white",
    wallpaperKind: "grid",
    wallpaperOpacity: 16,
  },
  {
    id: "citrus",
    name: "Citrus",
    blurb: "Black rail, tangerine. Warm without going soft.",
    accent: "#FF7A2F",
    rail: "black",
    wallpaperKind: "grid",
    wallpaperOpacity: 18,
  },
  {
    id: "seafoam",
    name: "Seafoam",
    blurb: "White rail, deep teal, globe behind. Calm, coastal, grown-up.",
    accent: "#0E9F8E",
    rail: "white",
    wallpaperKind: "globe",
    wallpaperOpacity: 20,
  },
];

/** Every CSS variable the app reads, derived from one accent. */
export function themeVars(theme: Theme): Record<string, string> {
  const accent = theme.accent;
  return {
    "--accent": accent,
    "--accent-on": onAccent(accent),
    "--accent-ink": accentInk(accent),
    "--accent-soft": accentSoft(accent),
    "--accent-hover": accentHover(accent),
    "--wall": theme.wallpaperAccent || accent,
  };
}

/** What the wallpaper is actually painted in right now. */
export const wallColor = (t: Theme) => t.wallpaperAccent || t.accent;

/* The globe artwork is a flat pink-and-white illustration, so it cannot be
   masked into another colour without losing its detail. Rotating its hue
   instead keeps every shape and just moves the pink to wherever the seller
   pointed. */
const GLOBE_HUE = 322;
const GLOBE_SAT = 0.62;

function hsl(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** CSS filter that repaints the globe in the seller's wallpaper colour. */
export function globeFilter(hex: string) {
  const { h, s, l } = hsl(hex);
  if (s < 0.06) return `grayscale(1) brightness(${(0.35 + l).toFixed(2)})`;
  const rotate = Math.round(h - GLOBE_HUE);
  const sat = Math.max(0.25, Math.min(2.2, s / GLOBE_SAT));
  const bright = Math.max(0.6, Math.min(1.35, 0.72 + l * 0.62));
  return `hue-rotate(${rotate}deg) saturate(${sat.toFixed(2)}) brightness(${bright.toFixed(2)})`;
}

/** Ready-made wallpaper colours, so nobody has to open a colour wheel. */
export const WALLPAPER_SWATCHES = [
  "#EE6FC0",
  "#FF4FA3",
  "#8B5CF6",
  "#3B82F6",
  "#0E9F8E",
  "#FF7A2F",
  "#F2C14E",
  "#111111",
  "#9A938C",
];

export const RAIL_LABEL: Record<RailStyle, string> = {
  black: "Black",
  white: "White",
  accent: "Accent",
};

export const WALLPAPER_LABEL: Record<WallpaperKind, string> = {
  globe: "The globe",
  grid: "Grid",
  shine: "Shine",
  none: "Nothing",
  custom: "Your image",
};
