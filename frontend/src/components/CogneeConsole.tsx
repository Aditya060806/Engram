"use client";

import { useEffect, useState, useRef } from "react";
import { getCogneeActivity, type CogneeActivityLog } from "@/lib/api";

export default function CogneeConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<CogneeActivityLog[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const fetchLogs = async () => {
      try {
        const activity = await getCogneeActivity();
        if (active) {
          // Sort logs chronologically
          const sorted = [...activity].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setLogs(sorted);
        }
      } catch (err) {
        console.error("Failed to fetch Cognee activity logs:", err);
      }
    };

    fetchLogs();
    
    // Fast polling (3.5s) if open, slow polling (30s) if closed to save resources
    const pollInterval = isOpen ? 3500 : 30000;
    const interval = setInterval(fetchLogs, pollInterval);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen]);

  const getOpColor = (op: string) => {
    switch (op.toLowerCase()) {
      case "remember()":
        return "text-[#5e6ad2]"; // Brand Blue/Sky
      case "cognify()":
        return "text-[#e0a328]"; // Brand Gold/Amber
      case "memify()":
        return "text-purple-400"; // Purple
      case "recall()":
        return "text-[#16a34a]"; // Success Green
      case "forget()":
        return "text-red-400"; // Error Rose
      default:
        return "text-stone-400";
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 md:bottom-6 md:right-6 md:left-auto md:top-auto z-30 pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full border border-hairline bg-surface-card hover:bg-surface-strong shadow-md text-xs font-semibold text-body select-none active:scale-[0.98] transition-all duration-150 cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-success opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-semantic-success"></span>
        </span>
        Cognee Console
        <span className="text-[10px] text-muted bg-surface-strong px-1.5 py-0.5 rounded font-mono">
          {logs.length}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed top-4 left-4 md:bottom-6 md:right-6 md:left-auto md:top-auto z-30 pointer-events-auto w-[360px] max-w-[calc(100vw-3rem)] h-64 bg-[#0c0a09] border border-stone-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-in-up">
      {/* Console Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-stone-900 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-semantic-success"></span>
          </span>
          <span className="text-xs font-mono font-bold text-stone-200">Cognee Live Feed</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-stone-400 hover:text-stone-200 transition-colors cursor-pointer text-xs"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Console Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2 bg-stone-950 font-mono text-[10px] leading-normal select-text">
        {logs.length === 0 ? (
          <div className="text-stone-500 italic p-2">Waiting for memory activity, ingest a source to watch remember(), cognify(), and memify() fire live.</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-stone-900/50 pb-1.5 last:border-0 last:pb-0">
              <span className="text-stone-500 shrink-0 select-none">
                [{formatTime(log.timestamp)}]
              </span>
              <div className="min-w-0 break-words">
                <span className={`font-bold ${getOpColor(log.operation)}`}>
                  {log.operation}
                </span>{" "}
                <span className="text-stone-300">
                  {log.details}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
}
