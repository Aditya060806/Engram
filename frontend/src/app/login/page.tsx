"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState<"github" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [entering, setEntering] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (session && mounted) router.replace("/graph");
  }, [session, mounted, router]);

  const handleSignIn = async (provider: "github" | "google") => {
    setLoading(provider);
    setError(null);
    setEntering(true);
    await signIn(provider, { callbackUrl: "/graph" });
  };

  const guestEnabled = process.env.NEXT_PUBLIC_ALLOW_GUEST_LOGIN === "true";
  const handleGuestSignIn = async () => {
    setError(null);
    setEntering(true);
    await signIn("guest", { callbackUrl: "/graph" });
  };

  if (status === "loading" || (status === "authenticated" && !entering)) {
    return (
      <div className="relative min-h-screen w-full bg-[var(--color-canvas)] flex items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <span className="absolute inset-0 rounded-full border-2 border-[var(--color-hairline)]" />
            <span className="absolute inset-0 rounded-full border-2 border-t-[var(--color-ink)] animate-spin" />
          </div>
          <p className="text-sm text-[var(--color-muted)]">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[var(--color-canvas)] flex items-center justify-center overflow-hidden">
      

      <div ref={cardRef} className="relative z-10 w-full max-w-sm mx-auto px-6 animate-fade-up">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="relative mb-8">
            {mounted && (
              <div className={`flex items-center gap-2.5 transition-opacity duration-500 ${imageLoaded ? "opacity-100" : "opacity-0"}`}>
                <Image
                  src="/logo.png"
                  alt="Engram"
                  width={40}
                  height={40}
                  priority
                  onLoad={() => setImageLoaded(true)}
                  className="object-contain rounded-lg"
                />
                <span className="text-[26px] font-semibold tracking-tight text-[var(--color-ink)]">Engram</span>
              </div>
            )}
            <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-px bg-[var(--color-hairline-strong)] transition-opacity duration-500 ${imageLoaded ? "opacity-100" : "opacity-0"}`} />
          </div>

          <h1 className="text-2xl font-medium text-[var(--color-ink)] mb-2 tracking-tight">Welcome back</h1>
          <p className="text-sm text-[var(--color-body)] leading-relaxed max-w-[260px]">
            Sign in to continue building your knowledge graph
          </p>
        </div>

        <div className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-2xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--color-semantic-error)]/10 border border-[var(--color-semantic-error)]/20 text-sm text-[var(--color-semantic-error)] font-medium text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleSignIn("github")}
              disabled={loading !== null}
              className="group relative flex items-center justify-center gap-3 w-full px-5 py-3 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)] hover:border-[var(--color-hairline-strong)] hover:shadow-[0_0_0_1px_rgba(110,118,129,0.15)] transition-all duration-200 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              {loading === "github" ? (
                <span className="relative w-4 h-4 border-2 border-[var(--color-ink)]/30 border-t-[var(--color-ink)] rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" className="relative shrink-0 text-[var(--color-body-strong)]">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
              )}
              <span className="relative">{loading === "github" ? "Connecting..." : "Continue with GitHub"}</span>
            </button>

            <button
              onClick={() => handleSignIn("google")}
              disabled={loading !== null}
              className="group relative flex items-center justify-center gap-3 w-full px-5 py-3 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)] hover:border-[var(--color-hairline-strong)] hover:shadow-[0_0_0_1px_rgba(66,133,244,0.15)] transition-all duration-200 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              {loading === "google" ? (
                <span className="relative w-4 h-4 border-2 border-[var(--color-ink)]/30 border-t-[var(--color-ink)] rounded-full animate-spin" />
              ) : (
                <svg className="relative shrink-0" width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              <span className="relative">{loading === "google" ? "Connecting..." : "Continue with Google"}</span>
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-hairline)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--color-surface-card)] px-3 text-[var(--color-muted)]">or</span>
            </div>
          </div>

          <button
            onClick={() => router.push("/")}
            className="group relative flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl border border-dashed border-[var(--color-hairline-strong)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink)]/30 transition-all duration-200 text-sm cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            <span>Back to landing</span>
          </button>

          {guestEnabled && (
            <button
              onClick={handleGuestSignIn}
              disabled={loading !== null}
              className="group relative mt-3 flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl bg-[var(--color-surface-strong)] text-[var(--color-body-strong)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)]/80 transition-all duration-200 text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              <span>Continue as guest (local dev)</span>
            </button>
          )}

        </div>

        <p className="mt-8 text-[11px] text-[var(--color-muted)] leading-relaxed text-center max-w-[260px] mx-auto">
          By continuing, Engram will access your{" "}
          <span
            className="border-b border-dotted border-[var(--color-hairline-strong)] cursor-help"
            title="Your name, email, and avatar URL — standard OAuth scopes, nothing more."
          >
            profile info
          </span>{" "}
          for authentication.
        </p>
      </div>

      {entering && (
        <div className="fixed inset-0 z-50 bg-[var(--color-canvas)] animate-fade-in flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-10 h-10">
              <span className="absolute inset-0 rounded-full border-2 border-[var(--color-hairline)]" />
              <span className="absolute inset-0 rounded-full border-2 border-t-[var(--color-ink)] animate-spin" />
            </div>
            <p className="text-sm text-[var(--color-muted)]">Opening Engram...</p>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
}
