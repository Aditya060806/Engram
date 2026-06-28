"use client";

import type { ConfidenceLevel } from "@/lib/design-tokens";

const colorMap: Record<ConfidenceLevel, string> = {
  fresh: "bg-confidence-fresh",
  fading: "bg-confidence-fading",
  stale: "bg-confidence-stale",
  forgotten: "bg-hairline-tertiary",
};

const labelMap: Record<ConfidenceLevel, string> = {
  fresh: "Fresh",
  fading: "Fading",
  stale: "Stale",
  forgotten: "Forgotten",
};

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  score: number;
  showLabel?: boolean;
}

export default function ConfidenceBadge({ level, score, showLabel = true }: ConfidenceBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-surface-2">
      <span className={`w-1.5 h-1.5 rounded-full ${colorMap[level]}`} />
      {showLabel && (
        <span className="text-caption text-ink-subtle">
          {labelMap[level]}
        </span>
      )}
      <span className="text-caption text-ink-tertiary font-mono">{Math.round(score * 100)}%</span>
    </span>
  );
}
