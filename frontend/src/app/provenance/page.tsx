"use client";

import { useEffect, useRef, useState } from "react";

export default function ProvenancePage() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch("/api/proxy/provenance")
      .then((r) => r.text())
      .then((raw) => {
        const start = raw.indexOf("// ── URL hash sync");
        if (start !== -1) {
          const end = raw.indexOf("function row(", start);
          if (end !== -1) {
            setHtml(raw.slice(0, start) + raw.slice(end));
            return;
          }
        }
        setHtml(raw);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] md:h-screen p-8 text-center">
        <div className="p-4 rounded-full bg-semantic-error/10 mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semantic-error">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-ink mb-1">Failed to load provenance</p>
        <p className="text-xs text-muted-soft max-w-xs">{error}</p>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] md:h-screen gap-4">
        <div className="relative w-8 h-8">
          <span className="absolute inset-0 rounded-full border-2 border-hairline" />
          <span className="absolute inset-0 rounded-full border-2 border-t-ink animate-spin" />
        </div>
        <p className="text-sm text-muted-soft">Loading provenance graph…</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem)] md:h-screen bg-canvas">
      <iframe
        ref={iframeRef}
        srcDoc={html}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full border-0 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        title="Memory Provenance"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
