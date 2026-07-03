"use client";

import { useEffect } from "react";
import { getSources, getAskTopics, getConflictEvents } from "@/lib/api";

/**
 * Warms the shared api-cache shortly after the authenticated shell mounts, so
 * navigating to the common pages (Sources, Ask, Resolve) renders from cache
 * instantly instead of waiting on a round trip. These all go through
 * `cachedFetch`, which dedupes and caches, so a page mounting mid-flight simply
 * joins the in-flight request. It is fire-and-forget and swallows errors, so it
 * can never affect correctness, only perceived speed.
 */
export default function Prewarm() {
  useEffect(() => {
    // Defer past first paint so prewarming never competes with initial render.
    const id = window.setTimeout(() => {
      void getSources().catch(() => {});
      void getAskTopics().catch(() => {});
      void getConflictEvents().catch(() => {});
    }, 300);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
