"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextProps {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info", duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Floating Toast Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-300 animate-slide-in-right ${
              toast.type === "success"
                ? "bg-canvas/90 border-semantic-success/20 text-semantic-success"
                : toast.type === "error"
                  ? "bg-canvas/90 border-semantic-error/20 text-semantic-error"
                  : "bg-canvas/90 border-hairline text-ink"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === "success" && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="7" className="stroke-semantic-success" strokeWidth="1.5" fill="none" />
                  <path d="M5 8l2 2 4-4" className="stroke-semantic-success" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {toast.type === "error" && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="7" className="stroke-semantic-error" strokeWidth="1.5" fill="none" />
                  <path d="M8 5v4M8 11h.01" className="stroke-semantic-error" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              {toast.type === "info" && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="7" className="stroke-muted" strokeWidth="1.5" fill="none" />
                  <path d="M8 8v3M8 5h.01" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              <span className="text-xs font-semibold leading-normal">{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-muted hover:text-ink transition-colors cursor-pointer text-xs"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
