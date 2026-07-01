"use client";

import { useState, useEffect } from "react";
import EmptyState from "@/components/EmptyState";
import { getConflictEvents, resolveConflict } from "@/lib/api";
import type { ConflictEvent } from "@/lib/types";
import { useToast } from "@/context/ToastContext";

export default function ResolvePage() {
  const { addToast } = useToast();
  const [conflicts, setConflicts] = useState<ConflictEvent[]>([]);
  const [resolved, setResolved] = useState<ConflictEvent[]>([]);
  const [noteForId, setNoteForId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const events = await getConflictEvents();
        setConflicts(events.filter((c) => c.status === "pending"));
        setResolved(events.filter((c) => c.status !== "pending"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load conflicts");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleResolve = async (id: string, resolution: "keep_old" | "keep_new" | "keep_both") => {
    setResolving(id);
    const note = resolution === "keep_both" ? noteText : undefined;
    try {
      await resolveConflict(id, resolution, note);
      const conflict = conflicts.find((c) => c.id === id);
      if (conflict) {
        const resolvedStatus = `resolved_${resolution}` as ConflictEvent["status"];
        setConflicts((prev) => prev.filter((c) => c.id !== id));
        setResolved((prev) => [{ ...conflict, status: resolvedStatus, resolutionNote: note || null }, ...prev]);
      }
      setNoteForId(null);
      setNoteText("");
      
      const toastMsg = resolution === "keep_new"
        ? "Kept new belief"
        : resolution === "keep_old"
          ? "Kept old belief"
          : "Saved both as context-dependent";
      addToast(toastMsg, "success");
    } catch (e) {
      console.error("Failed to resolve:", e);
      addToast("Failed to resolve conflict", "error");
    } finally {
      setResolving(null);
    }
  };

  const openNote = (id: string) => {
    setNoteForId(id);
    setNoteText("");
  };

  const pendingCount = conflicts.length;

  if (loading) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin bg-canvas">
        <div className="max-w-3xl mx-auto px-6 md:px-12 pt-10 md:pt-16 pb-24">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div>
              <div className="h-8 w-48 bg-surface-strong animate-pulse rounded-lg mb-2.5" />
              <div className="h-4 w-72 bg-surface-strong/60 animate-pulse rounded-lg" />
            </div>
            <div className="h-8 w-28 bg-surface-strong animate-pulse rounded-full hidden sm:block" />
          </div>
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-surface-card border border-hairline p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-4 h-4 rounded-full bg-surface-strong animate-pulse" />
                  <div className="h-4 w-48 bg-surface-strong animate-pulse rounded-md" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="p-4 rounded-lg bg-surface-strong/40 animate-pulse h-28" />
                  <div className="p-4 rounded-lg bg-surface-strong/40 animate-pulse h-28" />
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-24 bg-surface-strong animate-pulse rounded-full" />
                  <div className="h-9 w-24 bg-surface-strong animate-pulse rounded-full" />
                  <div className="h-9 w-24 bg-surface-strong animate-pulse rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas">
        <EmptyState icon="inbox" title="Could not load conflicts" description={error} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin relative bg-canvas">

      <div className="max-w-3xl mx-auto px-6 md:px-12 pt-10 md:pt-16 pb-24 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <div className="caption-upper text-muted mb-2.5">Reconciliation inbox</div>
            <h1 className="display-lg text-ink">What changed?</h1>
            <p className="mt-2 text-base text-body leading-relaxed max-w-xl" style={{ letterSpacing: "0.15px" }}>
              New evidence collided with what you already knew. Engram caught it before it
              poisoned your memory, you make the final call.
            </p>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-strong border border-hairline-strong self-start sm:self-auto shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-conflict-warning animate-pulse" />
              <span className="caption-upper text-ink" style={{ fontSize: "11px" }}>{pendingCount} unresolved</span>
            </div>
          )}
        </div>

        {pendingCount === 0 && resolved.length === 0 && (
          <EmptyState
            icon="inbox"
            title="Your memory agrees with itself"
            description="No contradictions right now. The moment new information clashes with something you already believe, it lands here for your judgment."
          />
        )}

        <div className="space-y-6">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="card-lift rounded-2xl bg-surface-card border border-hairline p-6 md:p-8 shadow-[0_4px_16px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-hairline-soft">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="#e0a328" strokeWidth="1.5" />
                  <path d="M8 4.5v4m0 2.5h.01" stroke="#e0a328" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="text-[15px] font-semibold text-ink tracking-tight">
                  Contradiction: &ldquo;{conflict.topic}&rdquo;
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                <div className="p-5 rounded-xl bg-canvas border border-hairline">
                  <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Old belief</span>
                  <p className="mt-1 text-xs text-muted-soft">
                    {conflict.oldNodeDate} &middot; {conflict.oldNodeSource}
                  </p>
                  <p className="mt-3 text-[14px] text-body leading-relaxed">
                    &ldquo;{conflict.oldNodeSummary}&rdquo;
                  </p>
                </div>
                <div className="p-5 rounded-xl bg-canvas border border-hairline-strong relative">
                  <span className="caption-upper text-ink font-semibold" style={{ fontSize: "10px" }}>New ingest</span>
                  <p className="mt-1 text-xs text-muted">
                    {conflict.newNodeDate} &middot; {conflict.newNodeSource}
                  </p>
                  <p className="mt-3 text-[14px] text-body-strong font-medium leading-relaxed">
                    &ldquo;{conflict.newNodeSummary}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleResolve(conflict.id, "keep_new")}
                  disabled={resolving === conflict.id}
                  className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-[14px] font-medium hover:bg-primary-active active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-40"
                >
                  Keep New
                </button>
                <button
                  onClick={() => handleResolve(conflict.id, "keep_old")}
                  disabled={resolving === conflict.id}
                  className="px-5 py-2.5 rounded-full border border-hairline-strong bg-transparent text-[14px] font-medium text-body hover:text-ink hover:bg-surface-strong active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-40"
                >
                  Keep Old
                </button>
                <button
                  onClick={() => openNote(conflict.id)}
                  className="px-5 py-2.5 rounded-full border border-hairline-strong bg-transparent text-[14px] font-medium text-body hover:text-ink hover:bg-surface-strong active:scale-[0.98] transition-all duration-150 cursor-pointer"
                >
                  Keep Both
                </button>
              </div>

              {noteForId === conflict.id && (
                <div className="mt-4 flex gap-3">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add contextual note (e.g. Project A vs Project B)"
                    className="flex-1 px-4 py-2.5 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-150"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleResolve(conflict.id, "keep_both");
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => handleResolve(conflict.id, "keep_both")}
                    disabled={resolving === conflict.id}
                    className="px-4 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-active transition-all duration-150 cursor-pointer disabled:opacity-50"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {resolved.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center gap-2 mb-4">
              <span className="caption-upper text-muted">Resolved History</span>
              <span className="text-xs text-muted-soft">({resolved.length} items)</span>
            </div>
            <div className="space-y-2">
              {resolved.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-5 py-4 rounded-xl bg-surface-card border border-hairline shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                  <div className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-semantic-success" />
                    <span className="text-sm font-medium text-ink">{entry.topic}</span>
                    <span className="text-xs text-muted bg-surface-strong px-2.5 py-0.5 rounded-full">
                      {entry.status === "resolved_keep_new" ? "Kept new" : entry.status === "resolved_keep_old" ? "Kept old" : "Kept both"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-soft">{entry.newNodeDate}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

