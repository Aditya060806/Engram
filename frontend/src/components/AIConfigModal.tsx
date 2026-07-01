"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAIConfig } from "@/context/AIConfigContext";
import { getAIModels, saveAIConfig } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

function getCleanErrorMessage(err: unknown): string {
  if (!err) return "An unknown error occurred";
  return (err as Error).message || "An error occurred";
}

export default function AIConfigModal() {
  const { isModalOpen, closeModal, refreshConfig, config } = useAIConfig();
  const { addToast } = useToast();

  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<"groq" | "openai" | "gemini">("groq");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isModalOpen) {
      Promise.resolve().then(async () => {
        setErrorMsg("");
        setModels([]);
        setApiKey("");

        if (config?.configured) {
          const p = (config.provider as "groq" | "openai" | "gemini") || "groq";
          setProvider(p);
          setSelectedModel(config.model || "");
          setStep(2);

          if (p === "gemini" || p === "groq") {
            setLoadingModels(true);
            try {
              const res = await getAIModels(p, "");
              if (res.models && res.models.length > 0) {
                setModels(res.models);
                let defaultModel = res.models[0];
                if (p === "groq") {
                  const preferred = res.models.find(m => m.includes("llama-3.3-70b") || m.includes("llama3-70b") || m.includes("mixtral"));
                  if (preferred) defaultModel = preferred;
                } else {
                  const preferred = res.models.find(m => m.includes("gemini-1.5-flash") || m.includes("gemini-1.5-pro"));
                  if (preferred) defaultModel = preferred;
                }
                setSelectedModel(defaultModel);
                setStep(3);
              } else {
                setErrorMsg("No models available with default configuration. Please add your own API key.");
              }
            } catch (err: unknown) {
              console.error(err);
              setErrorMsg(getCleanErrorMessage(err));
            } finally {
              setLoadingModels(false);
            }
          }
        } else {
          setStep(1);
        }
      });
    }
  }, [isModalOpen, config]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal]);

  const handleProviderSelect = (selected: "groq" | "openai" | "gemini") => {
    setProvider(selected);
    setErrorMsg("");
    setStep(2);
  };

  const handleFetchModels = async () => {
    const keyToUse = apiKey.trim() || "";

    setLoadingModels(true);
    setErrorMsg("");
    setModels([]);

    try {
      const res = await getAIModels(provider, keyToUse);
      if (res.models && res.models.length > 0) {
        setModels(res.models);
        let defaultModel = res.models[0];
        if (provider === "groq") {
          const preferred = res.models.find(m => m.includes("llama-3.3-70b") || m.includes("llama3-70b") || m.includes("mixtral"));
          if (preferred) defaultModel = preferred;
        } else if (provider === "openai") {
          const preferred = res.models.find(m => m.includes("gpt-4o-mini") || m.includes("gpt-4o"));
          if (preferred) defaultModel = preferred;
        } else if (provider === "gemini") {
          const preferred = res.models.find(m => m.includes("gemini-1.5-flash") || m.includes("gemini-1.5-pro"));
          if (preferred) defaultModel = preferred;
        }
        setSelectedModel(defaultModel);
        setStep(3);
      } else {
        setErrorMsg("No models returned for this key. Make sure the key has model access permissions.");
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(getCleanErrorMessage(err));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveBYOK = async () => {
    if (!selectedModel) {
      setErrorMsg("Please select a model to proceed");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      await saveAIConfig(provider, apiKey.trim(), selectedModel);
      await refreshConfig();
      addToast(`Successfully configured ${provider} with model ${selectedModel}`, "success");
      closeModal();
    } catch (err: unknown) {
      setErrorMsg(getCleanErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4 animate-fade-in">
      <div
        ref={modalRef}
        className="w-full max-w-xl rounded-2xl border border-hairline bg-surface-card p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.08)] relative overflow-hidden"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-12 bg-gradient-to-b from-primary/10 to-transparent blur-md pointer-events-none" />

        <div className="flex items-center justify-between mb-6 pb-4 border-b border-hairline-soft">
          <div>
            <h3 className="text-lg font-semibold text-ink">Bring your own AI</h3>
            <p className="text-xs text-muted mt-0.5">Powers recall, ingestion reconciliation, and your daily Recap, with your key, encrypted locally.</p>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-strong transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 12L12 4M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-semantic-error/10 border border-semantic-error/15 text-xs text-semantic-error font-medium flex items-start gap-2.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 4.5v3M7 9.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step indicator */}
        {step >= 1 && (
          <div className="flex items-center justify-center gap-2 mb-6 pb-2 border-b border-hairline-soft">
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                step >= 1 ? "bg-primary text-on-primary" : "bg-surface-strong text-muted-soft"
              }`}>
                1
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-ink">Provider</span>
            </div>
            <span className="w-4 sm:w-8 h-px bg-hairline-soft" />
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                step >= 2 ? "bg-primary text-on-primary" : "bg-surface-strong text-muted-soft"
              }`}>
                2
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-ink">API Key</span>
            </div>
            <span className="w-4 sm:w-8 h-px bg-hairline-soft" />
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                step >= 3 ? "bg-primary text-on-primary" : "bg-surface-strong text-muted-soft"
              }`}>
                3
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-ink">Model</span>
            </div>
          </div>
        )}

        {/* Step 1: Provider selection */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="text-xs font-semibold text-muted-soft uppercase tracking-wider block">Select LLM Provider</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleProviderSelect("groq")}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-200 hover:border-ink hover:bg-surface-strong/30 cursor-pointer group ${
                  provider === "groq" ? "border-ink bg-surface-strong/50" : "border-hairline bg-surface-card"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-surface-strong flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <span className="text-base font-bold text-ink font-display">Gq</span>
                </div>
                <span className="text-sm font-semibold text-ink">Groq</span>
                <span className="text-[10px] text-muted-soft mt-1">Llama 3, Mixtral</span>
              </button>

              <button
                onClick={() => handleProviderSelect("openai")}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-200 hover:border-ink hover:bg-surface-strong/30 cursor-pointer group ${
                  provider === "openai" ? "border-ink bg-surface-strong/50" : "border-hairline bg-surface-card"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-surface-strong flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <span className="text-base font-bold text-ink font-display">O</span>
                </div>
                <span className="text-sm font-semibold text-ink">OpenAI</span>
                <span className="text-[10px] text-muted-soft mt-1">GPT-4o, GPT-4o-mini</span>
              </button>

              <button
                onClick={() => handleProviderSelect("gemini")}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-200 hover:border-ink hover:bg-surface-strong/30 cursor-pointer group ${
                  provider === "gemini" ? "border-ink bg-surface-strong/50" : "border-hairline bg-surface-card"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-surface-strong flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <span className="text-base font-bold text-ink font-display">Ge</span>
                </div>
                <span className="text-sm font-semibold text-ink">Gemini</span>
                <span className="text-[10px] text-muted-soft mt-1">1.5 Pro, 1.5 Flash</span>
              </button>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-hairline-soft">
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2.5 rounded-full border border-hairline text-ink text-[14px] font-semibold hover:bg-surface-strong/50 active:scale-[0.98] transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 2: API Key input */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-soft uppercase tracking-wider">
                  Enter {provider.toUpperCase()} API Key
                </label>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Change Provider
                </button>
              </div>

              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`${provider === "groq" ? "gsk_..." : provider === "openai" ? "sk-..." : "AIzaSy..."}`}
                  className="w-full pl-4 pr-10 py-3 rounded-xl bg-surface-strong/40 border border-hairline-strong text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 transition-all duration-200 font-mono"
                  disabled={loadingModels}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                  disabled={loadingModels}
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1 8s3-5.5 7-5.5 7 5.5 7 5.5-3 5.5-7 5.5S1 8 1 8z" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1 8s3-5.5 7-5.5 7 5.5 7 5.5-3 5.5-7 5.5S1 8 1 8z" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-muted-soft mt-2 leading-relaxed">
                Your key is stored encrypted locally on this server and is only sent to the provider&apos;s official APIs to fulfill your requests.
              </p>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-hairline-soft">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 rounded-full border border-hairline text-ink text-[14px] font-semibold hover:bg-surface-strong/50 active:scale-[0.98] transition-all cursor-pointer"
                disabled={loadingModels}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={loadingModels || !apiKey.trim()}
                className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-[14px] font-semibold hover:bg-primary-active active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {loadingModels ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-on-primary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Discovering…
                  </>
                ) : (
                  "Discover Models"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Select Model */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-soft uppercase tracking-wider">
                  Select {provider.toUpperCase()} Model
                </label>
                <span className="text-[11px] text-muted bg-surface-strong px-2 py-0.5 rounded-md font-mono">
                  {models.length} models discovered
                </span>
              </div>

              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-strong/40 border border-hairline-strong text-sm text-ink focus:outline-none focus:border-ink transition-all appearance-none cursor-pointer"
                  disabled={saving}
                >
                  {models.map((m) => (
                    <option key={m} value={m} className="bg-surface-card text-ink">
                      {m}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              <p className="text-[11px] text-muted-soft mt-2 leading-relaxed">
                Choose the model that suits your task. Larger models have higher intelligence but may be slower or cost more.
              </p>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-hairline-soft">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 rounded-full border border-hairline text-ink text-[14px] font-semibold hover:bg-surface-strong/50 active:scale-[0.98] transition-all cursor-pointer"
                disabled={saving}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSaveBYOK}
                disabled={saving || !selectedModel}
                className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-[14px] font-semibold hover:bg-primary-active active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-on-primary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving…
                  </>
                ) : (
                  "Save AI Config"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
