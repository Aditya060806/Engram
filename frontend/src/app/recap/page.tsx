"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";
import EmptyState from "@/components/EmptyState";
import { getMemoryRecap } from "@/lib/api";
import type { MemoryRecap, RecapEvent, RecapEventKind } from "@/lib/types";

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const kindMeta: Record<
  RecapEventKind,
  { label: string; dot: string; chip: string; icon: React.ReactNode }
> = {
  ingested: {
    label: "Remembered",
    dot: "bg-primary",
    chip: "bg-primary/10 text-primary",
    icon: (
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    ),
  },
  decided: {
    label: "Decided",
    dot: "bg-semantic-success",
    chip: "bg-semantic-success/10 text-semantic-success",
    icon: (
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  contradiction: {
    label: "Reconciled",
    dot: "bg-conflict-warning",
    chip: "bg-conflict-warning/10 text-conflict-warning",
    icon: (
      <>
        <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </>
    ),
  },
  forgotten: {
    label: "Forgotten",
    dot: "bg-semantic-error",
    chip: "bg-semantic-error/10 text-semantic-error",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  reinforced: {
    label: "Reinforced",
    dot: "bg-gradient-mint",
    chip: "bg-semantic-success/10 text-semantic-success",
    icon: (
      <path d="m6 15 6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
};

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) return `Today · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: string;
}) {
  return (
    <div className="card-lift relative overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5">
      <div className={`absolute top-0 left-0 h-full w-[3px] ${accent}`} />
      <CountUp value={value} className="display-md text-ink tabular-nums" />
      <p className="mt-1 text-xs font-medium text-muted leading-snug">{label}</p>
    </div>
  );
}

export default function RecapPage() {
  const [recap, setRecap] = useState<MemoryRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(7);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemoryRecap(days);
      setRecap(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recap");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load(windowDays));
  }, [windowDays, load]);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin relative bg-canvas">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="ambient-orb absolute -top-24 left-[10%] h-72 w-72 rounded-full opacity-[0.12] blur-[90px]"
          style={{ background: "radial-gradient(circle, var(--color-gradient-lavender) 0%, transparent 70%)" }}
        />
        <div
          className="ambient-orb absolute top-[30%] right-[5%] h-80 w-80 rounded-full opacity-[0.10] blur-[100px]"
          style={{ background: "radial-gradient(circle, var(--color-gradient-sky) 0%, transparent 70%)", animationDelay: "3s" }}
        />
        <div className="grid-backdrop absolute inset-0 opacity-40" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 md:px-12 pt-8 md:pt-16 pb-24">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="caption-upper text-muted mb-2.5">Where&rsquo;s my context?</div>
            <h1 className="display-lg text-shine">The Recap</h1>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-body" style={{ letterSpacing: "0.15px" }}>
              You stepped away. Your memory didn&rsquo;t. Here&rsquo;s everything Engram learned,
              decided, reconciled, and let go of while you were out.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-card p-1 shadow-sm">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setWindowDays(w.days)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  windowDays === w.days
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-6">
            <div className="skeleton-shimmer h-32 rounded-2xl" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-24 rounded-2xl" />
              ))}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-20 rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon="inbox"
            title="Couldn't rebuild your recap"
            description={error}
            action={{ label: "Try again", onClick: () => load(windowDays) }}
          />
        )}

        {/* Empty */}
        {!loading && !error && recap && !recap.hasData && (
          <EmptyState
            icon="search"
            title="Nothing to recall yet"
            description="Your memory is a blank slate. Ingest a source and Engram will start tracking what you learn, decide, and change your mind about."
            action={{ label: "Ingest a source", onClick: () => (window.location.href = "/ingest") }}
          />
        )}

        {/* Content */}
        {!loading && !error && recap && recap.hasData && (
          <div className="space-y-10">
            {/* Narrative hero */}
            <Reveal className="card-lift relative overflow-hidden rounded-2xl border border-hairline bg-surface-card p-6 md:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
              <div className="mb-3 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-semantic-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-semantic-success" />
                </span>
                <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>
                  Memory synthesized just now
                </span>
              </div>
              <h2 className="display-sm text-ink">{recap.headline}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-body">{recap.narrative}</p>
            </Reveal>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard value={recap.stats.sourcesAdded} label="Sources remembered" accent="bg-primary" />
              <StatCard value={recap.stats.decisionsMade} label="Decisions logged" accent="bg-semantic-success" />
              <StatCard value={recap.stats.contradictionsDetected} label="Contradictions caught" accent="bg-conflict-warning" />
              <StatCard value={recap.stats.contradictionsResolved} label="Conflicts resolved" accent="bg-semantic-success" />
              <StatCard value={recap.stats.factsReinforced} label="Facts reinforced" accent="bg-gradient-mint" />
              <StatCard value={recap.stats.factsForgotten} label="Stale facts pruned" accent="bg-semantic-error" />
            </div>

            {/* Timeline */}
            {recap.events.length > 0 && (
              <div>
                <div className="mb-5 flex items-center gap-2">
                  <span className="caption-upper text-muted">The timeline</span>
                  <span className="text-xs text-muted-soft">({recap.events.length} events)</span>
                </div>

                <div className="relative pl-6">
                  {/* vertical spine */}
                  <div
                    className="absolute left-[7px] top-1 bottom-1 w-px origin-top bg-hairline-strong"
                    style={{ animation: "draw-line 0.9s cubic-bezier(0.22,1,0.36,1) forwards" }}
                  />
                  <div className="space-y-4">
                    {recap.events.map((ev, i) => (
                      <TimelineRow key={`${ev.date}-${i}`} ev={ev} index={i} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CTA footer */}
            <Reveal className="flex flex-col items-start gap-4 rounded-2xl border border-hairline bg-surface-strong/40 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Want the full story?</p>
                <p className="mt-0.5 text-xs text-muted">
                  Ask Engram anything, or resolve what still needs your judgment.
                </p>
              </div>
              <div className="flex gap-2.5">
                <Link
                  href="/ask"
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-all duration-150 hover:bg-primary-active active:scale-[0.98]"
                >
                  Ask Engram
                </Link>
                <Link
                  href="/resolve"
                  className="rounded-full border border-hairline-strong px-5 py-2.5 text-sm font-medium text-body transition-all duration-150 hover:bg-surface-strong hover:text-ink"
                >
                  Resolve conflicts
                </Link>
              </div>
            </Reveal>
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineRow({ ev, index }: { ev: RecapEvent; index: number }) {
  const meta = kindMeta[ev.kind];
  return (
    <Reveal delay={Math.min(index * 45, 400)} className="relative">
      {/* dot */}
      <span
        className={`absolute -left-[22px] top-4 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-canvas ${meta.dot}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-on-primary">
          {meta.icon}
        </svg>
      </span>
      <div className="card-lift rounded-xl border border-hairline bg-surface-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.chip}`}>
                {meta.label}
              </span>
              <span className="truncate text-sm font-semibold text-ink">{ev.topic}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-body">{ev.detail}</p>
            {ev.source && (
              <p className="mt-1 text-[11px] text-muted-soft">via {ev.source}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-medium text-muted-soft">{formatEventDate(ev.date)}</span>
        </div>
      </div>
    </Reveal>
  );
}
