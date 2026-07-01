"use client";

import Link from "next/link";
import { useRef, useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import SourcePill from "@/components/SourcePill";
import { useChat } from "@/context/ChatContext";
import { getConflictEvents, getAskQuestions } from "@/lib/api";
import type { DiffCard, TimelinePoint, ConnectionMap, ConflictEvent } from "@/lib/types";
import { useAIConfig } from "@/context/AIConfigContext";

const fallbackPromptChips: string[] = [];

function DiffCardView({ diff }: { diff: DiffCard }) {
  return (
    <div className="mt-5 rounded-xl border border-hairline overflow-hidden bg-canvas">
      <div className="px-4 py-3 bg-surface-strong border-b border-hairline">
        <span className="caption-upper text-muted" style={{ fontSize: "11px" }}>Changes since {diff.sinceDate}</span>
      </div>
      <div className="divide-y divide-hairline">
        {diff.added.length > 0 && (
          <div className="px-4 py-3 flex items-center gap-3.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-semantic-success/10 text-semantic-success text-xs font-mono font-bold">+</span>
            <span className="text-xs font-medium text-muted w-14 uppercase">Added</span>
            <span className="text-sm font-medium text-ink">{diff.added.join(", ")}</span>
          </div>
        )}
        {diff.removed.length > 0 && (
          <div className="px-4 py-3 flex items-center gap-3.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-semantic-error/10 text-semantic-error text-xs font-mono font-bold">-</span>
            <span className="text-xs font-medium text-muted w-14 uppercase">Removed</span>
            <span className="text-sm font-medium text-ink">{diff.removed.join(", ")}</span>
          </div>
        )}
        {diff.changed.length > 0 && (
          <div className="px-4 py-3 flex items-center gap-3.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-conflict-warning/10 text-conflict-warning text-xs font-mono font-bold">~</span>
            <span className="text-xs font-medium text-muted w-14 uppercase">Changed</span>
            <span className="text-sm font-medium text-ink">
              {diff.changed.map(([old, nw]) => `${old} → ${nw}`).join(", ")}
            </span>
          </div>
        )}
        {diff.newDecisions.length > 0 && (
          <div className="px-4 py-3 flex items-center gap-3.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">*</span>
            <span className="text-xs font-medium text-muted w-28 uppercase">New Decisions</span>
            <span className="text-sm font-medium text-ink">{diff.newDecisions.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineView({ points }: { points: TimelinePoint[] }) {
  const maxConfidence = Math.max(...points.map((p) => p.confidenceScore));

  return (
    <div className="mt-5 rounded-xl border border-hairline p-5 bg-canvas">
      <span className="caption-upper text-muted mb-4 block" style={{ fontSize: "11px" }}>Confidence Timeline</span>
      <div className="space-y-3.5">
        {points.map((point, i) => (
          <div key={i} className="flex items-center gap-4">
            <span className="w-16 text-xs text-muted font-medium shrink-0">{point.date}</span>
            <div className="flex-1 h-3 rounded-full bg-surface-strong overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(point.confidenceScore / maxConfidence) * 100}%`,
                  backgroundColor: point.confidenceScore >= 0.8 ? "#292524" : point.confidenceScore >= 0.4 ? "#777169" : "#a8a29e",
                }}
              />
            </div>
            <span className="w-12 text-xs font-mono text-muted text-right shrink-0">
              {Math.round(point.confidenceScore * 100)}%
            </span>
            <span className="text-xs font-medium text-body shrink-0">{point.valueSummary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionMapView({ map }: { map: ConnectionMap }) {
  return (
    <div className="mt-5 rounded-xl border border-hairline p-5 bg-canvas">
      <span className="caption-upper text-muted mb-4 block" style={{ fontSize: "11px" }}>Connection Map: {map.topic}</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {map.connections.map((conn, i) => (
          <div key={i} className="p-4 rounded-xl border border-hairline bg-surface-card hover:bg-surface-strong transition-all duration-150 relative overflow-hidden group shadow-sm flex flex-col justify-between">
            <div className="absolute top-0 left-0 w-[3px] h-full bg-primary/20 group-hover:bg-primary/50 transition-colors" />
            <div>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-sm font-semibold text-ink truncate max-w-[70%]">{conn.nodeLabel}</span>
                <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${
                  conn.type === "shared_source" 
                    ? "bg-primary/10 text-primary" 
                    : conn.type === "temporal_proximity" 
                      ? "bg-conflict-warning/10 text-conflict-warning" 
                      : "bg-semantic-success/10 text-semantic-success"
                }`}>
                  {conn.type.replace("_", " ")}
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed mb-3">{conn.description}</p>
            </div>
            <Link 
              href={`/graph?mode=2d&node=${encodeURIComponent(conn.nodeLabel)}`}
              className="text-[10px] font-bold text-ink uppercase tracking-wider hover:underline flex items-center gap-1 group-hover:translate-x-0.5 transition-transform w-fit pointer-events-auto"
            >
              Trace in Graph 
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline">
                <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function isToday(d: Date) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function isYesterday(d: Date) {
  const t = new Date();
  t.setDate(t.getDate() - 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return `Today ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (isYesterday(d)) return `Yesterday ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Inline formatting: Bold (**text**) and Italic (*text*)
function renderLineContent(line: string) {
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;
  
  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf("**");
    const italicIdx = remaining.indexOf("*");
    
    if (boldIdx === -1 && italicIdx === -1) {
      parts.push(remaining);
      break;
    }
    
    // Check if bold is closer
    if (boldIdx !== -1 && (italicIdx === -1 || boldIdx <= italicIdx)) {
      if (boldIdx > 0) {
        parts.push(remaining.substring(0, boldIdx));
      }
      const endBoldIdx = remaining.indexOf("**", boldIdx + 2);
      if (endBoldIdx !== -1) {
        const boldText = remaining.substring(boldIdx + 2, endBoldIdx);
        parts.push(<strong key={key++} className="font-semibold text-ink">{boldText}</strong>);
        remaining = remaining.substring(endBoldIdx + 2);
      } else {
        parts.push(remaining.substring(boldIdx));
        break;
      }
    } else {
      // Italic is closer
      if (italicIdx > 0) {
        parts.push(remaining.substring(0, italicIdx));
      }
      const endItalicIdx = remaining.indexOf("*", italicIdx + 1);
      if (endItalicIdx !== -1) {
        const italicText = remaining.substring(italicIdx + 1, endItalicIdx);
        parts.push(<em key={key++} className="italic text-body-strong">{italicText}</em>);
        remaining = remaining.substring(endItalicIdx + 1);
      } else {
        parts.push(remaining.substring(italicIdx));
        break;
      }
    }
  }
  
  return parts;
}

function parseMarkdown(text: string) {
  if (!text) return null;
  
  const lines = text.split("\n");
  
  return lines.map((line, lineIdx) => {
    // 1. Check for horizontal rule
    if (line.trim() === "---") {
      return <hr key={lineIdx} className="my-4 border-t border-hairline-strong" />;
    }
    
    // 2. Check for headings
    if (line.startsWith("# ")) {
      return (
        <h1 key={lineIdx} className="text-xl font-bold text-ink mt-4 mb-2">
          {renderLineContent(line.slice(2))}
        </h1>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={lineIdx} className="text-lg font-bold text-ink mt-3 mb-1.5">
          {renderLineContent(line.slice(3))}
        </h2>
      );
    }
    if (line.startsWith("### ")) {
      return (
        <h3 key={lineIdx} className="text-md font-semibold text-ink mt-2 mb-1">
          {renderLineContent(line.slice(4))}
        </h3>
      );
    }
    
    // 3. Bullet points
    if (line.trim().startsWith("* ") || line.trim().startsWith("- ")) {
      const cleanLine = line.trim().slice(2);
      return (
        <ul key={lineIdx} className="list-disc pl-5 my-1 text-body">
          <li>{renderLineContent(cleanLine)}</li>
        </ul>
      );
    }
    
    // 4. Default paragraph or blank line
    if (line.trim() === "") {
      return <div key={lineIdx} className="h-2" />;
    }
    
    return (
      <p key={lineIdx} className="text-[15px] text-body leading-relaxed mb-2.5 whitespace-pre-wrap">
        {renderLineContent(line)}
      </p>
    );
  });
}

export default function AskPage() {
  const {
    messages,
    setMessages,
    input,
    setInput,
    isProcessing,
    showHistory,
    setShowHistory,
    convIndex,
    activeConvId,
    handleSubmit,
    newConversation,
    switchToConversation,
    deleteConversation,
    feedbackState,
    setFeedback,
    guidanceDocs,
    guidanceDismissed,
    dismissGuidance,
  } = useChat();
  const { openModal, config, isModalOpen } = useAIConfig();
  
  const [unresolvedConflicts, setUnresolvedConflicts] = useState<ConflictEvent[]>([]);
  const prevModalOpenRef = useRef(false);

  useEffect(() => {
    const prevModalOpen = prevModalOpenRef.current;
    if (prevModalOpen && !isModalOpen && config?.configured) {
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.isError && lastMsg.answer.includes("required")) {
          setMessages((prev) => prev.slice(0, -1));
          handleSubmit(lastMsg.query);
        }
      }
    }
    prevModalOpenRef.current = isModalOpen;
  }, [isModalOpen, config, messages, handleSubmit, setMessages]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const [promptChips, setPromptChips] = useState<string[]>(fallbackPromptChips);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      if (isFirstRender.current) {
        container.scrollTop = container.scrollHeight;
        isFirstRender.current = false;
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    if (showHistory) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHistory, setShowHistory]);

  // Fetch unresolved conflicts for contradiction detection banner
  useEffect(() => {
    getConflictEvents().then((events) => {
      const unresolved = events.filter((e) => e.status === "pending");
      setUnresolvedConflicts(unresolved);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPromptChips = async () => {
      try {
        const questions = await getAskQuestions();
        if (!cancelled && Array.isArray(questions) && questions.length > 0) {
          setPromptChips(questions);
        } else {
          setPromptChips([]);
        }
      } catch {
        if (!cancelled) {
          setPromptChips([]);
        }
      }
    };

    loadPromptChips();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-canvas relative overflow-hidden">

      <div className="shrink-0 px-3 sm:px-6 md:px-12 pt-3 pb-3 sm:pt-6 sm:pb-4 border-b border-hairline flex items-center justify-between bg-canvas/80 backdrop-blur-md relative z-20">
        <div>
          <div className="caption-upper text-muted" style={{ fontSize: "11px" }}>Recall · time-aware</div>
          <h1 className="display-sm text-ink mt-0.5">Ask your memory</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setShowHistory(v => !v)}
              className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-surface-card border border-hairline-strong text-xs font-semibold text-body hover:text-ink hover:bg-surface-strong transition-all duration-150 cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="hidden sm:inline">History</span>
            </button>
            {showHistory && (
              <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-24px)] max-h-80 overflow-y-auto rounded-xl border border-hairline bg-surface-card shadow-lg z-50 p-2 space-y-1">
                {convIndex.length === 0 ? (
                  <p className="text-xs text-muted-soft text-center py-5">No past conversations</p>
                ) : (
                  convIndex.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => switchToConversation(conv.id)}
                      className={`w-full text-left px-3.5 py-3 rounded-lg transition-colors duration-100 cursor-pointer group border ${
                        activeConvId === conv.id
                          ? "bg-surface-strong border-hairline-strong"
                          : "hover:bg-surface-strong border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink truncate">{conv.title}</p>
                          <p className="text-xs text-muted mt-1">
                            {formatDate(conv.updatedAt)} &middot; {conv.messageCount} msg{conv.messageCount > 1 ? "s" : ""}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                          className="ml-2 p-1.5 rounded-md opacity-40 group-hover:opacity-70 hover:opacity-100 hover:bg-surface-strong/80 text-muted hover:text-semantic-error transition-all duration-100"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            onClick={newConversation}
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-surface-card border border-hairline-strong text-xs font-semibold text-body hover:text-ink hover:bg-surface-strong transition-all duration-150 cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-6 md:px-12 py-4 sm:py-6 md:py-8 relative z-10">
        {messages.length === 0 && !isProcessing && (
          <div className="h-full flex flex-col items-center justify-center gap-8 py-10">
            <EmptyState
              icon="chat"
              title="What did you forget?"
              description="Ask anything you've fed into Engram. It recalls across every session, reconciles the timeline, and tells you what changed, not just what you first believed."
            />
            <div className="flex flex-wrap gap-2.5 justify-center max-w-xl">
              {promptChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleSubmit(chip)}
                  className="px-5 py-2.5 rounded-full border border-hairline-strong text-[14px] text-body hover:text-ink hover:bg-surface-strong hover:border-hairline bg-surface-card shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-all duration-150 cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-8">
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="px-5 py-3 rounded-2xl bg-surface-strong/60 border border-hairline max-w-xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                  <p className="text-[15px] font-medium text-body-strong leading-relaxed">{msg.query}</p>
                </div>
              </div>

              <div className="p-4 sm:p-6 md:p-8 rounded-2xl bg-surface-card border border-hairline shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
                <div className="text-[15px] text-body leading-relaxed">
                  {msg.isError ? (
                    <div className={`p-5 rounded-xl border ${
                      msg.answer.includes("required") 
                        ? "border-amber-500/20 bg-amber-500/[0.03]" 
                        : "border-semantic-error/25 bg-semantic-error/[0.03]"
                    } flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0 ${
                          msg.answer.includes("required") 
                            ? "bg-amber-500/10 text-amber-600" 
                            : "bg-semantic-error/10 text-semantic-error"
                        }`}>
                          {msg.answer.includes("required") ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-ink">
                            {msg.answer.includes("required") ? "AI Features Inactive" : "Connection Error"}
                          </h4>
                          <p className="text-xs text-muted-soft mt-1 leading-relaxed">
                            {msg.answer}
                          </p>
                        </div>
                      </div>
                      {msg.answer.includes("required") && (
                        <button
                          onClick={openModal}
                          className="px-4.5 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-active active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-sm"
                        >
                          Configure AI
                        </button>
                      )}
                    </div>
                  ) : (
                    parseMarkdown(msg.answer)
                  )}
                </div>
                {msg.diffCard && <DiffCardView diff={msg.diffCard} />}
                {msg.timeline && <TimelineView points={msg.timeline} />}
                {msg.connectionMap && <ConnectionMapView map={msg.connectionMap} />}
                {msg.sources.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-hairline flex flex-wrap items-center gap-2">
                    <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Ingested Sources:</span>
                    {msg.sources.map((s, i) => (
                      <SourcePill key={i} type={s.type} label={s.label} />
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-hairline/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => !msg.isError && setFeedback(msg.id, msg.qa_id, 1)}
                        disabled={msg.isError || !msg.qa_id || feedbackState[msg.id] === "down"}
                        className={`p-1.5 rounded-md transition-all duration-150 ${
                          feedbackState[msg.id] === "up"
                            ? "text-semantic-success bg-semantic-success/10"
                            : "text-muted hover:text-ink hover:bg-surface-strong"
                        } ${msg.isError || !msg.qa_id ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={feedbackState[msg.id] === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => !msg.isError && setFeedback(msg.id, msg.qa_id, -1)}
                        disabled={msg.isError || !msg.qa_id || feedbackState[msg.id] === "up"}
                        className={`p-1.5 rounded-md transition-all duration-150 ${
                          feedbackState[msg.id] === "down"
                            ? "text-semantic-error bg-semantic-error/10"
                            : "text-muted hover:text-ink hover:bg-surface-strong"
                        } ${msg.isError || !msg.qa_id ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={feedbackState[msg.id] === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {(msg.provider || msg.model) && !msg.isError && (
                    <span className="text-[11px] text-muted-soft font-medium">
                      via {msg.provider}{msg.model ? ` · ${msg.model}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="px-6 py-4 rounded-2xl bg-surface-card border border-hairline shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                  <span className="text-[13px] font-medium text-muted">Traversing your memory graph…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="shrink-0 px-3 sm:px-6 md:px-12 border-t border-hairline bg-canvas/80 backdrop-blur-md relative z-20">
        {guidanceDocs.length > 0 && !guidanceDismissed && (
          <div className="max-w-3xl mx-auto pt-2 pb-1">
            <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-primary/[0.04] border border-primary/10">
              <div className="shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">Engram has noticed…</p>
                <ul className="space-y-0.5">
                  {guidanceDocs.slice(0, 2).map((doc, i) => (
                    <li key={i} className="text-xs text-muted leading-relaxed">• {doc}</li>
                  ))}
                  {guidanceDocs.length > 2 && (
                    <li className="text-[10px] text-muted-soft font-medium">+{guidanceDocs.length - 2} more insights</li>
                  )}
                </ul>
              </div>
              <button
                onClick={dismissGuidance}
                className="shrink-0 p-1 rounded-md text-muted hover:text-ink hover:bg-surface-strong transition-all cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto py-3 sm:py-5 flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Ask about your knowledge graph..."
            disabled={isProcessing}
            className="flex-1 px-5 py-3.5 rounded-full bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 shadow-md transition-all duration-200"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isProcessing}
            className="px-6 py-3.5 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-active disabled:opacity-40 transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            {isProcessing ? "…" : "Ask"}
          </button>
        </div>
      </div>

      {unresolvedConflicts.length > 0 && (
        <div className="shrink-0 px-3 sm:px-6 md:px-12 pb-1">
          <div className="max-w-3xl mx-auto">
            <Link
              href="/resolve"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-semantic-error/5 border border-semantic-error/15 hover:bg-semantic-error/10 transition-all group"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semantic-error shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs font-semibold text-ink">
                {unresolvedConflicts.length} contradiction{unresolvedConflicts.length > 1 ? "s" : ""} detected across conversations
              </span>
              <span className="text-[11px] font-medium text-muted group-hover:text-ink ml-auto transition-colors">
                Resolve → 
              </span>
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
