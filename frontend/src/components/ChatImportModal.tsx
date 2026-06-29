"use client";

import { useState } from "react";
import { useIngestion } from "@/context/IngestionContext";

interface ChatImportModalProps {
  open: boolean;
  onClose: () => void;
}

const PLATFORM_HELP: Record<string, { share: string }> = {
  chatgpt: {
    share: "Open the conversation → click Share (top-right) → Copy link → paste here",
  },
  gemini: {
    share: "Open the conversation → click Share → Create public link → Copy → paste here",
  },
  claude: {
    share: "Open the conversation → click Share (top-right) → Copy public link → paste here",
  },
};

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("chatgpt.com") || u.includes("chat.openai.com")) return "chatgpt";
  if (u.includes("gemini.google.com")) return "gemini";
  if (u.includes("claude.ai")) return "claude";
  return "generic";
}

export default function ChatImportModal({ open, onClose }: ChatImportModalProps) {
  const { startSync } = useIngestion();
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!open) return null;

  const platform = detectPlatform(url);
  const help = PLATFORM_HELP[platform];

  const handleImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/proxy/import/chat-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (data.status === "ok") {
        setResult({ ok: true, message: `Conversation imported successfully` });
        setUrl("");
        if (data.jobId) startSync(data.jobId);
        onClose();
      } else {
        setResult({ ok: false, message: data.error || "Import failed" });
      }
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface-card border border-hairline shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <h2 className="text-lg font-semibold text-ink">Import AI Chat</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface-strong transition-all cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-strong border border-hairline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <div className="flex-1 min-w-0">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
                placeholder="Paste a ChatGPT, Gemini, or Claude conversation link..."
                disabled={importing}
                className="w-full bg-transparent text-sm text-ink placeholder:text-muted-soft focus:outline-none"
              />
            </div>
          </div>

          {help && (
            <div className="px-4 py-3 rounded-xl bg-primary/[0.04] border border-primary/10">
              <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">
                {platform === "chatgpt" ? "ChatGPT" : platform === "gemini" ? "Gemini" : "Claude"}
              </p>
              <p className="text-xs text-muted">{help.share}</p>
            </div>
          )}

          {!help && url && (
            <div className="px-4 py-3 rounded-xl bg-surface-strong border border-hairline">
              <p className="text-xs text-muted">
                This link doesn&apos;t look like a ChatGPT, Gemini, or Claude URL. The importer will try to extract any conversation text found on the page.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-soft">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Only public shared links work. Use the Share button on your chat to generate one.</span>
          </div>

          <button
            onClick={handleImport}
            disabled={!url.trim() || importing}
            className="w-full px-5 py-2.5 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-active disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Import Conversation
              </>
            )}
          </button>

          {result && (
            <div className={`p-4 rounded-xl border ${
              result.ok
                ? "bg-semantic-success/5 border-semantic-success/20"
                : "bg-semantic-error/5 border-semantic-error/20"
            }`}>
              <div className="flex items-start gap-2.5">
                {result.ok ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semantic-success shrink-0 mt-0.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semantic-error shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                )}
                <p className={`text-sm font-semibold ${result.ok ? "text-ink" : "text-semantic-error"}`}>
                  {result.message}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-hairline bg-surface-strong/50">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-surface-card border border-hairline-strong text-sm font-semibold text-ink hover:bg-surface-strong transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}