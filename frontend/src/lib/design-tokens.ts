export const tokens = {
  colors: {
    primary: "#5e6ad2",
    "on-primary": "#ffffff",
    "primary-hover": "#828fff",
    "primary-focus": "#5e69d1",
    ink: "#f7f8f8",
    "ink-muted": "#d0d6e0",
    "ink-subtle": "#8a8f98",
    "ink-tertiary": "#62666d",
    canvas: "#010102",
    "surface-1": "#0f1011",
    "surface-2": "#141516",
    "surface-3": "#18191a",
    "surface-4": "#191a1b",
    hairline: "#23252a",
    "hairline-strong": "#34343a",
    "hairline-tertiary": "#3e3e44",
    "confidence-fresh": "#18181b",
    "confidence-fading": "#52525b",
    "confidence-stale": "#d4d4d8",
    "conflict-warning": "#e0a328",
    "semantic-success": "#27a644",
    "semantic-danger": "#e5484d",
  },

  rounded: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    pill: "9999px",
  },
} as const;

export type ConfidenceLevel = "fresh" | "fading" | "stale" | "forgotten";

export function getConfidenceColor(score: number): ConfidenceLevel {
  if (score >= 0.8) return "fresh";
  if (score >= 0.4) return "fading";
  if (score >= 0.1) return "stale";
  return "forgotten";
}

export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}
