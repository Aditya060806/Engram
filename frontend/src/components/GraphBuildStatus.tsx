"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCogneeGraphStatus, type CogneeGraphStatus } from "@/lib/api";

/**
 * After an ingest job completes, the tenant still builds the knowledge graph in
 * the background (cognify runs asynchronously). This polls the graph status so
 * the user sees a clear "building" state instead of an empty graph, and a
 * "ready" state with a link to Ask once nodes have landed.
 */
export default function GraphBuildStatus() {
  const [status, setStatus] = useState<CogneeGraphStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const MAX_ATTEMPTS = 40; // ~2 minutes at 3s intervals

  useEffect(() => {
    let cancelled = false;

    const clear = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const poll = async () => {
      attemptsRef.current += 1;
      try {
        const s = await getCogneeGraphStatus();
        if (cancelled) return;
        setStatus(s);
        if (s.ready || attemptsRef.current >= MAX_ATTEMPTS) clear();
      } catch {
        if (attemptsRef.current >= MAX_ATTEMPTS) clear();
      }
    };

    poll();
    timerRef.current = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      clear();
    };
  }, []);

  if (!status) return null;

  if (status.ready) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        <span className="flex h-2 w-2 rounded-full bg-semantic-success" />
        <p className="text-sm text-body">
          <span className="font-medium text-ink">Graph ready</span>
          <span className="text-muted"> · {status.nodeCount} node{status.nodeCount === 1 ? "" : "s"} in memory. </span>
          <Link href="/ask" className="font-medium text-ink underline decoration-dotted underline-offset-4 hover:opacity-70">
            Ask a question
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-ink" />
      </span>
      <p className="text-sm text-body">
        <span className="font-medium text-ink">Building your knowledge graph</span>
        <span className="text-muted">
          {status.backend === "cloud" ? " on Cognee Cloud" : ""}. Recall gets sharper as nodes appear, this can take a moment.
        </span>
      </p>
    </div>
  );
}
