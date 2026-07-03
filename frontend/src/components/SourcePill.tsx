"use client";

import type { SourceType } from "@/lib/types";

const sourceIcons: Record<SourceType, React.ReactNode> = {
  pdf: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 1.5H8.5L12 5V12.5H2V1.5Z" />
      <path d="M8.5 1.5V5H12" />
    </svg>
  ),
  github: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M7 1C3.68 1 1 3.68 1 7C1 9.85 2.88 12.25 5.47 13.06C5.78 13.12 5.9 12.94 5.9 12.78C5.9 12.64 5.89 12.17 5.89 11.56C4.45 11.88 3.99 11.02 3.99 11.02C3.66 10.19 3.17 10.02 3.17 10.02C2.49 9.68 3.23 9.69 3.23 9.69C3.99 9.75 4.38 10.48 4.38 10.48C5.04 11.62 6.11 11.37 6.56 11.22C6.63 10.73 6.82 10.39 7.04 10.19C5.39 10.02 3.65 9.47 3.65 7.04C3.65 6.35 3.9 5.77 4.34 5.33C4.26 5.16 4.04 4.49 4.42 3.6C4.42 3.6 4.97 3.42 5.9 4.25C6.42 4.1 6.97 4.02 7.5 4.02C8.03 4.02 8.58 4.1 9.1 4.25C10.03 3.42 10.58 3.6 10.58 3.6C10.96 4.49 10.74 5.16 10.66 5.33C11.1 5.77 11.35 6.35 11.35 7.04C11.35 9.48 9.6 10.01 7.95 10.18C8.22 10.42 8.46 10.89 8.46 11.62C8.46 12.66 8.45 13.5 8.45 13.78C8.45 13.94 8.57 14.13 8.88 14.06C11.47 13.25 13.35 10.85 13.35 8C13.35 5.22 11.13 3 8.35 3L7 3.01Z" />
    </svg>
  ),
  conversation: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7C1 3.5 3.5 1 7 1C10.5 1 13 3.5 13 7C13 10.5 10.5 13 7 13H1V7Z" />
    </svg>
  ),
  article: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 2H13V11H1V2Z" />
      <path d="M3 5H11" />
      <path d="M3 7.5H9" />
    </svg>
  ),
  youtube: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="12" height="8" rx="2" />
      <path d="M6 5.5L8.5 7L6 8.5V5.5Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  text: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3.5H11" />
      <path d="M3 7H11" />
      <path d="M3 10.5H8" />
    </svg>
  ),
};

interface SourcePillProps {
  type: SourceType;
  label: string;
  onClick?: () => void;
}

export default function SourcePill({ type, label, onClick }: SourcePillProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors duration-150 cursor-pointer"
    >
      {sourceIcons[type]}
      <span className="text-caption text-ink-subtle">{label}</span>
    </button>
  );
}
