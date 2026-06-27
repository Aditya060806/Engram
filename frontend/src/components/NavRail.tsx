"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIngestion } from "@/context/IngestionContext";
import { useAIConfig } from "@/context/AIConfigContext";
import { useTheme } from "@/components/ThemeProvider";
import { useSession, signOut } from "next-auth/react";

const navItems = [
  { href: "/graph", label: "Graph", icon: GraphIcon },
  { href: "/recap", label: "Recap", icon: RecapIcon },
  { href: "/ingest", label: "Ingest", icon: IngestIcon },
  { href: "/resolve", label: "Resolve", icon: ResolveIcon },
  { href: "/ask", label: "Ask", icon: AskIcon },
  { href: "/provenance", label: "Provenance", icon: ProvenanceIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function NavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { jobStatus, progress } = useIngestion();
  const { config, openModal, loading: loadingAI } = useAIConfig();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <aside className="fixed bottom-0 md:top-0 left-0 z-40 flex w-full h-14 md:h-full md:w-56 flex-row md:flex-col bg-canvas border-t md:border-t-0 md:border-r border-hairline">
      {/* Brand */}
      <div className="hidden md:flex items-center px-5 pt-5 pb-6">
        <Link href="/" className="flex items-center gap-2 cursor-pointer" aria-label="Go to landing page">
          <Image
            src="/logo.png"
            alt="Engram"
            width={30}
            height={30}
            priority
            className="object-contain rounded-md"
          />
          <span className="text-[19px] font-semibold tracking-tight text-ink">Engram</span>
        </Link>
      </div>

      {/* Nav links */}
      {status === "authenticated" ? (
      <nav className="flex flex-row md:flex-col w-full md:w-auto h-full md:h-auto gap-0.5 px-1.5 md:px-3 justify-around md:justify-start items-center md:items-stretch py-1 md:py-0">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const isIngest = item.label === "Ingest";
          const isSyncing = isIngest && jobStatus === "running";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col md:flex-row items-center md:justify-between px-2 py-1.5 md:px-3 md:py-2 rounded-lg text-[10px] md:text-[15px] transition-all duration-150 group flex-1 md:flex-none ${
                isActive
                  ? "text-ink md:bg-surface-strong md:text-ink font-medium"
                  : "text-muted hover:text-ink md:hover:bg-surface-strong/50"
              }`}
            >
              <div className="flex flex-col md:flex-row items-center gap-1 md:gap-2.5 relative">
                <item.icon />
                <span className="mt-0.5 md:mt-0 font-medium tracking-wide" style={{ letterSpacing: "0.15px" }}>{item.label}</span>
                {isSyncing && (
                  <span className="absolute -top-1 -right-2 md:relative md:top-auto md:right-auto flex h-2 w-2 md:mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-semantic-success"></span>
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
      ) : status === "loading" ? (
      <div className="flex flex-col items-center justify-center flex-1 px-4">
        <span className="w-5 h-5 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
      </div>
      ) : (
      <div className="flex flex-col items-center justify-center flex-1 px-4 text-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-soft mb-3">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <p className="text-xs text-muted leading-relaxed">
          Sign in to access your knowledge graph
        </p>
      </div>
      )}

      {/* Status bar */}
      <div className="hidden md:flex flex-col gap-2 mt-auto px-4 pb-4 w-full">
        {jobStatus === "running" ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-strong border border-hairline w-full">
            <div className="w-2 h-2 rounded-full bg-semantic-success animate-pulse" />
            <span className="text-xs text-body">
              Syncing… <span className="text-[10px] text-muted">({progress}%)</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-strong w-full">
            <div className="w-2 h-2 rounded-full bg-semantic-success" />
            <span className="text-xs text-muted">Memory active</span>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-strong hover:bg-surface-strong/80 border border-hairline w-full text-muted hover:text-ink transition-colors cursor-pointer"
          title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isDark ? (
              <>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </>
            ) : (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            )}
          </svg>
          <span className="text-[11px] font-medium">{mounted ? (isDark ? "Light mode" : "Dark mode") : ""}</span>
        </button>

        {/* AI Config Pill */}
        {!loadingAI && config && (
          (config.configured) ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-strong/60 border border-hairline-soft w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-[11px] font-semibold text-body truncate capitalize">
                  {config.configured 
                    ? `${config.provider} · ${config.model?.split("/").pop()}`
                    : "Judge Session"
                  }
                </span>
              </div>
              <button
                onClick={openModal}
                className="text-muted hover:text-ink transition-colors cursor-pointer shrink-0 ml-1.5"
                title="Configure custom AI"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-strong/30 border border-hairline-soft/50 w-full">
              <span className="text-[10px] text-muted-soft">AI Unconfigured</span>
              <button
                onClick={openModal}
                className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
              >
                Add AI
              </button>
            </div>
          )
        )}

        {/* User */}
        {status === "authenticated" && session?.user ? (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-strong/40 border border-hairline-soft w-full">
            <div className="flex items-center gap-2 min-w-0">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={20}
                  height={20}
                  className="rounded-full shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 shrink-0 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-primary">
                    {session.user.name?.charAt(0) || "?"}
                  </span>
                </div>
              )}
              <span className="text-[11px] font-medium text-body truncate">
                {session.user.name || "User"}
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="text-[10px] text-muted hover:text-ink transition-colors cursor-pointer shrink-0 ml-2"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-strong hover:bg-surface-strong/80 border border-hairline w-full text-muted hover:text-ink transition-colors text-[11px] font-medium cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}

/* ── SVG Icons — clean, editorial line style ── */

function ProvenanceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2v12a2 2 0 002 2h12" />
      <path d="M6 10l3-4 3 3 4-5" fill="none" />
      <circle cx="6" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="4" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="4" r="2" />
      <circle cx="4" cy="14" r="2" />
      <circle cx="14" cy="14" r="2" />
      <line x1="7.5" y1="5.5" x2="5.5" y2="12.5" strokeWidth="1.2" />
      <line x1="10.5" y1="5.5" x2="12.5" y2="12.5" strokeWidth="1.2" />
      <line x1="6" y1="14" x2="12" y2="14" strokeWidth="1.2" />
    </svg>
  );
}

function RecapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2a7 7 0 1 1-6.3 4" />
      <path d="M2.5 2.5v3h3" />
      <path d="M9 5.5V9l2.5 1.5" strokeWidth="1.3" />
    </svg>
  );
}

function IngestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v14" />
      <path d="M2 9h14" />
    </svg>
  );
}

function ResolveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="6" height="12" rx="1.5" />
      <rect x="10" y="5" width="6" height="10" rx="1.5" />
      <path d="M11 9h4" strokeWidth="1.2" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1.5C4.86 1.5 1.5 4.86 1.5 9c0 4.14 3.36 7.5 7.5 7.5h7.5V9c0-4.14-3.36-7.5-7.5-7.5z" />
      <path d="M9 12v.01" strokeWidth="2" />
      <path d="M6.5 7.5a2.5 2.5 0 015 0c0 1-.7 1.7-1.5 2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
