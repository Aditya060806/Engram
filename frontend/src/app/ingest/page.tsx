"use client";

import { useState, useRef } from "react";
import IngestionStepper from "@/components/IngestionStepper";
import GraphBuildStatus from "@/components/GraphBuildStatus";
import ChatImportModal from "@/components/ChatImportModal";
import { ingestSource } from "@/lib/api";
import type { SourceType } from "@/lib/types";
import { useIngestion } from "@/context/IngestionContext";

type Tab = "github" | "pdf" | "article" | "youtube" | "text";

export default function IngestPage() {
  const { jobStatus, currentStep, progress, error, startSync, resetSync } = useIngestion();

  const [activeTab, setActiveTab] = useState<Tab>("github");
  const [repoUrl, setRepoUrl] = useState("");
  const [pathFilter, setPathFilter] = useState("");

  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [articleUrl, setArticleUrl] = useState("");
  const [articleLabel, setArticleLabel] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeLabel, setYoutubeLabel] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteLabel, setNoteLabel] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectTab = (tabKey: Tab) => {
    setActiveTab(tabKey);
    setPathFilter("");
    if (tabKey === "pdf") setPdfFiles([]);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "text", label: "Note" },
    { key: "github", label: "GitHub" },
    { key: "pdf", label: "Upload PDF" },
    { key: "article", label: "Article URL" },
    { key: "youtube", label: "YouTube URL" },
  ];

  const handleSync = async () => {
    setApiError(null);
    try {
      let sourceType: SourceType;
      let content: string;
      let label: string;
      let url: string | undefined;

      if (activeTab === "github") {
        if (!repoUrl) return;
        sourceType = "github";
        content = `Repository: ${repoUrl}\nPath filter: ${pathFilter || "all"}`;
        label = repoUrl.split("/").slice(-2).join("/");
        url = repoUrl;
      } else if (activeTab === "article") {
        if (!articleUrl) return;
        sourceType = "article";
        content = `Article URL: ${articleUrl}`;
        label = articleLabel || articleUrl.replace("https://", "").replace("http://", "").split("/")[0] || "Article URL";
        url = articleUrl;
      } else if (activeTab === "youtube") {
        if (!youtubeUrl) return;
        sourceType = "youtube";
        content = `YouTube URL: ${youtubeUrl}`;
        label = youtubeLabel || "YouTube Transcript";
        url = youtubeUrl;
      } else if (activeTab === "text") {
        if (!noteText.trim()) return;
        sourceType = "text";
        content = noteText.trim();
        label = noteLabel.trim() || noteText.trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 60) || "Note";
        url = undefined;
      } else {
        if (pdfFiles.length === 0) return;
        const file = pdfFiles[0];
        const toBase64 = (f: File): Promise<string> =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(f);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
          });
        sourceType = "pdf";
        content = await toBase64(file);
        label = file.name;
        url = undefined;
      }

      const { jobId } = await ingestSource(sourceType, content, label, url, pathFilter);
      startSync(jobId);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to start ingestion");
    }
  };

  const handleReset = () => {
    resetSync();
    setApiError(null);
    setRepoUrl("");
    setPathFilter("");

    setPdfFiles([]);
    setArticleUrl("");
    setArticleLabel("");
    setYoutubeUrl("");
    setYoutubeLabel("");
    setNoteText("");
    setNoteLabel("");
  };

  const handlePdfClick = () => {
    fileInputRef.current?.click();
  };

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type === "application/pdf");
    if (files.length > 0) setPdfFiles(files);
    e.target.value = "";
  };

  const isDisabled = jobStatus === "running" || jobStatus === "completed";

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin relative bg-canvas">

      <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-12 pt-6 md:pt-16 pb-24 relative z-10">
        <div className="mb-10">
          <div className="caption-upper text-muted mb-2.5">Remember · ingest</div>
          <h1 className="display-lg text-ink">Give it something to remember</h1>
          <p className="mt-2 text-base text-body leading-relaxed max-w-xl" style={{ letterSpacing: "0.15px" }}>
            Write a quick note, or point Engram at a repo, PDF, article, video, or chat export. It extracts
            the meaning, checks it against what you already know, and weaves it into your graph, permanently.
          </p>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto scrollbar-none rounded-xl bg-surface-strong w-full mb-8 border border-hairline">
          {tabs.map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => { if (!isDisabled) selectTab(tab.key); }}
              disabled={isDisabled}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer text-center whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-surface-card text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              } ${i === 0 ? "rounded-l-xl" : ""}`}
            >
              {tab.label}
            </button>
          ))}
          <div className="w-px bg-hairline self-stretch" />
          <button
            onClick={() => setShowImportModal(true)}
            className="flex-1 px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer text-center whitespace-nowrap text-muted hover:text-ink rounded-r-xl flex items-center justify-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Import
          </button>
        </div>

        <div className="bg-surface-card border border-hairline rounded-2xl p-4 sm:p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-6">
          {activeTab === "text" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">Note title (optional)</label>
                <input
                  type="text"
                  value={noteLabel}
                  onChange={(e) => setNoteLabel(e.target.value)}
                  placeholder="e.g. Decision: switched database to Supabase"
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">Write something to remember</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type any note, fact, or decision. Engram will structure it into your knowledge graph and reconcile it against what you already know."
                  disabled={isDisabled}
                  rows={8}
                  maxLength={500000}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200 resize-y leading-relaxed"
                />
                <p className="mt-1.5 text-xs text-muted-soft">{noteText.trim().length} characters</p>
              </div>
            </div>
          )}

          {activeTab === "github" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">GitHub Repo URL</label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repo"
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">Path filter (optional)</label>
                <input
                  type="text"
                  value={pathFilter}
                  onChange={(e) => setPathFilter(e.target.value)}
                  placeholder="e.g. /docs or *.md"
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
              {jobStatus === "completed" ? (
                <p className="text-xs font-medium text-semantic-success">Last synced: just now</p>
              ) : (
                <p className="text-xs text-muted-soft">Last synced: never</p>
              )}
            </div>
          )}

          {activeTab === "pdf" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handlePdfFileChange}
                className="hidden"
              />
              <div
                onClick={handlePdfClick}
                className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center transition-all duration-200 ${
                  isDisabled ? "border-hairline opacity-50" : "border-hairline hover:border-primary cursor-pointer bg-canvas/30"
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isDisabled) setPdfFiles(Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf"));
                }}
              >
                <svg width="36" height="36" viewBox="0 0 32 32" fill="none" className="mx-auto mb-4 opacity-60 text-body">
                  <path d="M16 4v16m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20v6a2 2 0 002 2h20a2 2 0 002-2v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p className="text-sm font-medium text-body">
                  {pdfFiles.length > 0
                    ? `${pdfFiles.length} PDF${pdfFiles.length > 1 ? "s" : ""} selected`
                    : "Drop PDFs here or click to browse"}
                </p>
                {pdfFiles.length > 0 && (
                  <div className="mt-4 space-y-1">
                    {pdfFiles.map((f, i) => (
                      <p key={i} className="text-xs text-muted font-mono bg-surface-strong px-2.5 py-1 rounded inline-block">{f.name}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "article" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">Article URL</label>
                <input
                  type="url"
                  value={articleUrl}
                  onChange={(e) => setArticleUrl(e.target.value)}
                  placeholder="https://example.com/blog-post"
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">Article Label (optional)</label>
                <input
                  type="text"
                  value={articleLabel}
                  onChange={(e) => setArticleLabel(e.target.value)}
                  placeholder="e.g. My Startup Roadmap"
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
            </div>
          )}

          {activeTab === "youtube" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">YouTube Video URL</label>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body-strong mb-2">Video Label (optional)</label>
                <input
                  type="text"
                  value={youtubeLabel}
                  onChange={(e) => setYoutubeLabel(e.target.value)}
                  placeholder="e.g. Supabase Keynote Transcript"
                  disabled={isDisabled}
                  className="w-full px-4 py-3 rounded-lg bg-surface-card border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center gap-4">
            <button
              onClick={jobStatus === "completed" ? handleReset : handleSync}
              disabled={isDisabled && jobStatus !== "completed"}
              className={`px-6 py-3 rounded-full text-[15px] font-medium transition-all duration-200 cursor-pointer shadow-sm whitespace-nowrap ${
                jobStatus === "completed"
                  ? "bg-surface-strong text-body border border-hairline-strong hover:bg-surface-strong/80"
                  : "bg-primary text-on-primary hover:bg-primary-active active:scale-[0.98]"
              }`}
            >
              {jobStatus === "idle" ? "Sync Now" : jobStatus === "running" ? `Syncing… (${progress}%)` : "Done, Sync Another"}
            </button>
            {(apiError || error) && <span className="text-sm text-semantic-error font-medium">{apiError || error}</span>}
          </div>
        </div>

        {jobStatus !== "idle" && (
          <div className="mt-8 p-6 rounded-2xl bg-surface-card border border-hairline shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
            <IngestionStepper currentStep={currentStep} progress={progress} status={jobStatus} />
          </div>
        )}

        {jobStatus === "completed" && <GraphBuildStatus />}
      </div>

      <ChatImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
    </div>
  );
}

