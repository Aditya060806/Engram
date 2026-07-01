"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { useSession, signOut } from "next-auth/react";
import Lenis from "lenis";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://engram1002.vercel.app";

/* ── The four Cognee lifecycle operations ── */
const MEMORY_OPS: { name: string; alias?: string; tint: string; desc: string; icon: React.ReactNode }[] = [
  {
    name: "remember",
    tint: "var(--color-gradient-lavender)",
    desc: "Ingest repos, PDFs, articles, chat exports and transcripts — structured into one graph.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a2 2 0 0 0 4 0" />
        <path d="M12 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a2 2 0 0 1-4 0" />
      </svg>
    ),
  },
  {
    name: "recall",
    tint: "var(--color-gradient-sky)",
    desc: "Ask in plain language. Cognee routes between semantic search and deep graph traversal.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    name: "improve",
    alias: "memify",
    tint: "var(--color-gradient-mint)",
    desc: "Re-enrich the graph, reinforce confirmed facts, and adapt weights from your feedback.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    ),
  },
  {
    name: "forget",
    tint: "var(--color-gradient-rose)",
    desc: "Decay unreinforced nodes over time and prune what no longer deserves to be remembered.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    ),
  },
];

const faqs = [
  {
    q: "Is this just RAG with extra steps?",
    a: "No. Similarity-based RAG relies on static embeddings and happily retrieves stale facts. Engram uses Cognee to compile context into a deterministic graph and runs schema checks at ingestion to catch factual contradictions before they enter long-term memory.",
  },
  {
    q: "What happens to a belief when it's superseded?",
    a: "The older belief is deactivated and its confidence drops toward zero. Every reconciliation decision is logged, so you can run temporal diffs like 'what changed since last week' at any time.",
  },
  {
    q: "Which sources can I ingest?",
    a: "GitHub repositories, local PDFs, ChatGPT and Claude conversation exports, web articles, and YouTube transcripts — plus your own chat turns as you use the app.",
  },
  {
    q: "Where does my data go?",
    a: "Only to the LLM provider you configure. Reconciliation history, access control, and metadata live in a local SQLite database (or your own Postgres in production). Bring-your-own-key credentials are encrypted at rest.",
  },
  {
    q: "Open source or hosted?",
    a: "Both. Engram is open source and runs locally by default, or routes remember, recall, improve and forget to a hosted Cognee Cloud tenant over REST — with automatic local fallback.",
  },
];

const SOURCES = ["GitHub", "PDF", "ChatGPT", "Claude", "Articles", "YouTube"];

export default function LandingPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [entering, setEntering] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  const [liveStats, setLiveStats] = useState<{ sourcesCount: number; entitiesCount: number; conflictsCount: number } | null>(null);

  const navLinks = [
    { id: "#lifecycle", label: "Lifecycle" },
    { id: "#features", label: "Features" },
    { id: "#how", label: "How it works" },
    { id: "#faq", label: "FAQ" },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    if (lenisRef.current) {
      lenisRef.current.scrollTo(targetId, { duration: 1.3, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    } else {
      document.querySelector(targetId)?.scrollIntoView({ behavior: "smooth" });
    }
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [sourcesRes, schemaRes, reconcileRes] = await Promise.all([
          fetch("/api/proxy/sources"),
          fetch("/api/proxy/schema-inventory"),
          fetch("/api/proxy/reconciliation/events"),
        ]);
        let sourcesCount = 0, entitiesCount = 0, conflictsCount = 0;
        if (sourcesRes.ok) {
          const sources = await sourcesRes.json();
          sourcesCount = Array.isArray(sources) ? sources.length : 0;
        }
        if (schemaRes.ok) {
          const schema = await schemaRes.json();
          if (Array.isArray(schema)) entitiesCount = schema.reduce((acc, curr) => acc + (curr.count || 0), 0);
        }
        if (reconcileRes.ok) {
          const events = await reconcileRes.json();
          if (Array.isArray(events)) conflictsCount = events.filter((e) => e.status === "pending" || e.status === "detected").length;
        }
        setLiveStats({ sourcesCount, entitiesCount, conflictsCount });
      } catch (err) {
        console.error("Failed to load live stats:", err);
      }
    }
    fetchStats();
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);

    const htmlHasHFull = document.documentElement.classList.contains("h-full");
    const bodyHasHFull = document.body.classList.contains("h-full");
    document.documentElement.classList.remove("h-full");
    document.documentElement.classList.add("min-h-screen");
    document.body.classList.remove("h-full");
    document.body.classList.add("min-h-screen");

    const lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenisRef.current = lenis;
    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (htmlHasHFull) {
        document.documentElement.classList.add("h-full");
        document.documentElement.classList.remove("min-h-screen");
      }
      if (bodyHasHFull) {
        document.body.classList.add("h-full");
        document.body.classList.remove("min-h-screen");
      }
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const enter = () => {
    setEntering(true);
    setTimeout(() => router.push(session ? "/graph" : "/login"), 450);
  };

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div ref={wrapRef} className="relative min-h-screen bg-canvas text-ink font-sans overflow-x-clip selection:bg-[var(--color-gradient-sky)]/25">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Engram",
            applicationCategory: "ProductivityApplication",
            operatingSystem: "Web",
            description: "A self-organizing personal knowledge graph built on Cognee's memory lifecycle.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />

      {/* Page-enter fade veil */}
      <div className={`fixed inset-0 z-[100] bg-canvas pointer-events-none transition-opacity duration-500 ${entering ? "opacity-100" : "opacity-0"}`} />

      {/* ═══════ NAV ═══════ */}
      <nav className={`fixed top-0 inset-x-0 z-50 h-16 transition-all duration-300 ${scrolled ? "bg-canvas/80 backdrop-blur-xl border-b border-hairline" : "border-b border-transparent"}`}>
        <div className="max-w-[1180px] mx-auto px-5 sm:px-6 h-full flex items-center justify-between">
          <a href="#hero" onClick={(e) => handleNavClick(e, "#hero")} className="flex items-center gap-2 cursor-pointer" aria-label="Engram home">
            <Image src="/logo.png" alt="Engram" width={30} height={30} priority className="object-contain rounded-md" />
            <span className="text-[19px] font-semibold tracking-tight">Engram</span>
          </a>

          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((l) => (
              <a key={l.id} href={l.id} onClick={(e) => handleNavClick(e, l.id)} className="text-[14px] font-medium text-body hover:text-ink transition-colors">
                {l.label}
              </a>
            ))}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="text-[14px] font-medium text-body hover:text-ink transition-colors">GitHub</a>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-strong transition-all cursor-pointer"
              title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Switch theme"}
            >
              <ThemeIcon isDark={isDark} />
            </button>
            {session ? (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-8 h-8 rounded-full bg-ink text-canvas text-[13px] font-semibold flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer" title="Account">
                  {session.user?.name?.charAt(0) || "U"}
                </button>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-40 py-1 rounded-xl border border-hairline bg-surface-card shadow-lg">
                      <button onClick={() => router.push("/graph")} className="w-full px-4 py-2 text-left text-[13px] font-medium text-body hover:bg-surface-strong transition-colors cursor-pointer">Open app</button>
                      <button onClick={() => { signOut(); setShowUserMenu(false); }} className="w-full px-4 py-2 text-left text-[13px] font-medium text-body hover:bg-surface-strong transition-colors cursor-pointer">Sign out</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button onClick={enter} className="text-[14px] font-semibold px-4 py-2 rounded-full bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer">
                Open app
              </button>
            )}
          </div>

          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-ink" aria-label="Menu">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              {isMobileMenuOpen ? <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-canvas border-b border-hairline px-6 py-5 flex flex-col gap-3">
            {navLinks.map((l) => (
              <a key={l.id} href={l.id} onClick={(e) => handleNavClick(e, l.id)} className="text-[15px] font-medium text-body py-1">{l.label}</a>
            ))}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" onClick={() => setIsMobileMenuOpen(false)} className="text-[15px] font-medium text-body py-1">GitHub</a>
            <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="flex items-center gap-2 text-[15px] font-medium text-body py-1 cursor-pointer">
              <ThemeIcon isDark={isDark} /> {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
            </button>
            <button onClick={enter} className="mt-1 text-[15px] font-semibold px-4 py-2.5 rounded-full bg-ink text-canvas cursor-pointer">Open app</button>
          </div>
        )}
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section id="hero" className="relative pt-32 sm:pt-40 pb-20 px-5 sm:px-6">
        <div className="absolute inset-0 grid-backdrop pointer-events-none" />
        <div aria-hidden className="ambient-orb pointer-events-none absolute -top-24 left-[8%] w-[380px] h-[380px] rounded-full blur-[90px] opacity-[0.16]" style={{ background: "var(--color-gradient-lavender)" }} />
        <div aria-hidden className="ambient-orb pointer-events-none absolute top-10 right-[6%] w-[420px] h-[420px] rounded-full blur-[100px] opacity-[0.14]" style={{ background: "var(--color-gradient-sky)", animationDelay: "3s" }} />

        <div className="relative max-w-[1180px] mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-hairline bg-surface-card/60 backdrop-blur-sm caption-upper text-muted">
                <span className="relative w-1.5 h-1.5 rounded-full bg-[var(--color-semantic-success)] pulse-ring" />
                Built on the Cognee memory lifecycle
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="display-mega mt-7">
                Memory that knows<br className="hidden sm:block" /> when to <span className="text-aurora">update itself</span>.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-lg sm:text-xl text-body leading-relaxed max-w-2xl mx-auto">
                Your AI forgets last night and confidently repeats stale facts. Engram is the self-reconciling memory layer that catches contradictions the moment they appear — and forgets only what has stopped mattering.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={enter} className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-ink text-canvas text-[15px] font-semibold hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer">
                  {session ? "Open the app" : "Get started free"}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-hairline bg-surface-card text-[15px] font-semibold text-ink hover:bg-surface-strong transition-colors">
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                  View on GitHub
                </a>
              </div>
            </Reveal>
          </div>

          {/* Hero showpiece — built-in reconciliation UI */}
          <Reveal delay={300} className="mt-16 sm:mt-20 max-w-4xl mx-auto">
            <AppFrame url={`${BASE_URL.replace(/^https?:\/\//, "")}/resolve`}>
              <ReconciliationDemo />
            </AppFrame>
          </Reveal>
        </div>
      </section>

      {/* ═══════ STATS BAND ═══════ */}
      <section id="stats" className="px-5 sm:px-6 py-14 border-y border-hairline bg-surface-card/40">
        <div className="max-w-[1180px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat label="Sources remembered" value={liveStats?.sourcesCount ?? 0} loaded={!!liveStats} />
          <Stat label="Entities in graph" value={liveStats?.entitiesCount ?? 0} loaded={!!liveStats} />
          <Stat label="Conflicts pending" value={liveStats?.conflictsCount ?? 0} loaded={!!liveStats} />
          <Stat label="Lifecycle operations" value={4} loaded suffix="" />
        </div>
      </section>

      {/* ═══════ LIFECYCLE ═══════ */}
      <section id="lifecycle" className="px-5 sm:px-6 py-24">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl">
            <p className="caption-upper text-muted">The memory lifecycle</p>
            <h2 className="display-lg mt-3">Four operations. All load-bearing.</h2>
            <p className="mt-4 text-body text-lg leading-relaxed">Engram wires the full Cognee lifecycle to both the local SDK and a hosted Cognee Cloud tenant — remember, recall, improve, and forget all route to the cloud when connected, with automatic local fallback.</p>
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MEMORY_OPS.map((op, i) => (
              <Reveal key={op.name} delay={i * 80}>
                <div className="card-lift h-full rounded-2xl border border-hairline bg-surface-card p-6">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5" style={{ background: `color-mix(in srgb, ${op.tint} 14%, transparent)`, color: op.tint }}>
                    {op.icon}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[15px] font-semibold text-ink">{op.name}()</span>
                    {op.alias && <span className="text-[11px] text-muted-soft">· {op.alias}</span>}
                  </div>
                  <p className="mt-2.5 text-[14px] text-body leading-relaxed">{op.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FEATURES BENTO ═══════ */}
      <section id="features" className="px-5 sm:px-6 pb-24">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-12">
            <p className="caption-upper text-muted">What makes it different</p>
            <h2 className="display-lg mt-3">Most memory tools stop at recall. This one decides what still deserves trust.</h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Reconciliation — wide */}
            <Reveal className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9">
                <FeatureHead tint="var(--color-conflict-warning)" title="The reconciliation engine" />
                <p className="mt-3 text-body leading-relaxed max-w-lg">When new evidence contradicts something you already believe, Engram catches it at ingestion and routes it to an inbox. Keep the new claim, keep the old one, or keep both as alternatives — every decision is logged.</p>
                <div className="mt-7"><ConflictRow /></div>
              </div>
            </Reveal>

            {/* Decay */}
            <Reveal delay={80}>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead tint="var(--color-gradient-rose)" title="Confidence decay" />
                <p className="mt-3 text-body leading-relaxed">Unreinforced facts lose confidence over time. Drop below the threshold and Engram forgets them automatically.</p>
                <div className="mt-6 space-y-4">
                  <DecayBar label="postgres" value={0.12} tint="var(--color-gradient-rose)" />
                  <DecayBar label="supabase" value={0.95} tint="var(--color-semantic-success)" />
                </div>
              </div>
            </Reveal>

            {/* Temporal diffs */}
            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead tint="var(--color-gradient-sky)" title="Temporal diffs" />
                <p className="mt-3 text-body leading-relaxed">Ask &ldquo;what changed since March?&rdquo; and get a diff of added nodes, superseded beliefs, and new decisions.</p>
              </div>
            </Reveal>

            {/* Recap — wide */}
            <Reveal delay={80} className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
                <div className="max-w-lg">
                  <FeatureHead tint="var(--color-gradient-lavender)" title="The Recap — where&rsquo;s my context?" />
                  <p className="mt-3 text-body leading-relaxed">A morning-after digest of your memory. For any window, Engram stitches every lifecycle operation into one grounded narrative: what you remembered, reconciled, reinforced, and forgot.</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-hairline bg-surface-strong/60 px-5 py-4 text-center">
                  <div className="text-[11px] caption-upper text-muted">last 7 days</div>
                  <div className="display-md mt-1">+12</div>
                  <div className="text-[12px] text-muted">memories reconciled</div>
                </div>
              </div>
            </Reveal>

            {/* BYOK */}
            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead tint="var(--color-gradient-mint)" title="Bring your own key" />
                <p className="mt-3 text-body leading-relaxed">Connect Groq, OpenAI, or Gemini. Keys are validated live and encrypted at rest with Fernet — never logged, never sent to the browser.</p>
              </div>
            </Reveal>

            {/* Graph — wide */}
            <Reveal delay={80} className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 overflow-hidden relative">
                <FeatureHead tint="var(--color-gradient-sky)" title="A living 3D knowledge graph" />
                <p className="mt-3 text-body leading-relaxed max-w-md">Your memory as a weighted network. Nodes grow with connections, edges show supersedes and contradicts relationships — explore it all in an interactive 3D view.</p>
                <GraphMini />
              </div>
            </Reveal>

            {/* Sources */}
            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead tint="var(--color-gradient-peach)" title="Ingest from anywhere" />
                <div className="mt-4 flex flex-wrap gap-2">
                  {SOURCES.map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-full border border-hairline bg-surface-strong/50 text-[13px] font-medium text-body">{s}</span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section id="how" className="px-5 sm:px-6 py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-14">
            <p className="caption-upper text-muted">How it works</p>
            <h2 className="display-lg mt-3">From raw context to a memory that maintains itself.</h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { n: "01", t: "Ingest", d: "Point Engram at a repo, PDF, article, video, or chat export. It extracts the meaning and structures it into the graph." },
              { n: "02", t: "Reconcile", d: "New evidence is checked against what you already know. Contradictions surface instantly for a quick decision." },
              { n: "03", t: "Recall", d: "Ask across every session. Answers are graph-grounded and time-aware — with a diff of what changed." },
              { n: "04", t: "Decay", d: "Unreinforced beliefs fade and get pruned, so recall stays fast, lean, and trustworthy." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="relative">
                  <div className="font-mono text-[13px] text-muted-soft">{s.n}</div>
                  <div className="mt-3 h-px w-full bg-hairline relative">
                    <span className="absolute -top-1 left-0 w-2 h-2 rounded-full" style={{ background: "var(--color-ink)" }} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{s.t}</h3>
                  <p className="mt-2 text-[14px] text-body leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section id="faq" className="px-5 sm:px-6 py-24 border-t border-hairline">
        <div className="max-w-[820px] mx-auto">
          <Reveal className="text-center mb-12">
            <p className="caption-upper text-muted">Questions</p>
            <h2 className="display-lg mt-3">Good to know</h2>
          </Reveal>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 50}>
                <FAQItem q={f.q} a={f.a} isOpen={openFaqIndex === i} onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA BAND ═══════ */}
      <section id="cta" className="px-5 sm:px-6 pb-24">
        <div className="max-w-[1180px] mx-auto">
          <Reveal>
            <div className="relative overflow-hidden rounded-[28px] bg-surface-dark text-on-dark px-8 sm:px-14 py-16 sm:py-20 text-center">
              <div aria-hidden className="ambient-orb absolute -top-20 -left-10 w-72 h-72 rounded-full blur-[80px] opacity-25" style={{ background: "var(--color-gradient-lavender)" }} />
              <div aria-hidden className="ambient-orb absolute -bottom-24 -right-10 w-80 h-80 rounded-full blur-[90px] opacity-20" style={{ background: "var(--color-gradient-sky)", animationDelay: "2s" }} />
              <div className="relative">
                <h2 className="display-xl">Give your AI a memory that lasts.</h2>
                <p className="mt-5 text-[17px] text-on-dark-soft max-w-xl mx-auto leading-relaxed">Sign in with GitHub or Google and start building a knowledge graph that reconciles itself.</p>
                <button onClick={enter} className="mt-9 inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-on-dark text-surface-dark text-[15px] font-semibold hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer">
                  {session ? "Open the app" : "Get started free"}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="px-5 sm:px-6 py-14 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Engram" width={26} height={26} className="object-contain rounded-md" />
            <span className="text-[16px] font-semibold tracking-tight">Engram</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] text-body">
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="hover:text-ink transition-colors">Repository</a>
            <a href="https://github.com/Aditya060806/Engram/blob/main/README.md" target="_blank" rel="noreferrer" className="hover:text-ink transition-colors">Documentation</a>
            <a href="https://cognee.ai" target="_blank" rel="noreferrer" className="hover:text-ink transition-colors">Powered by Cognee</a>
          </div>
        </div>
        <div className="max-w-[1180px] mx-auto mt-10 pt-6 border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-muted">
          <p>© 2026 Engram. Built for the WeMakeDevs × Cognee Hackathon.</p>
          <p>Developed by <a href="https://github.com/Aditya060806" target="_blank" rel="noreferrer" className="text-body hover:text-ink transition-colors underline decoration-dotted underline-offset-4">Aditya Pandey</a></p>
        </div>
      </footer>
    </div>
  );
}

/* ══════════════ Presentational sub-components ══════════════ */

function ThemeIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {isDark ? (
        <>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </>
      ) : (
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      )}
    </svg>
  );
}

function Stat({ label, value, loaded, suffix = "" }: { label: string; value: number; loaded: boolean; suffix?: string }) {
  return (
    <div className="text-center md:text-left">
      <div className="display-md tabular-nums">
        {loaded ? <CountUp value={value} suffix={suffix} /> : <span className="text-muted-soft">—</span>}
      </div>
      <div className="mt-1.5 text-[13px] text-muted">{label}</div>
    </div>
  );
}

function AppFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="w-full rounded-2xl border border-hairline bg-surface-card shadow-[0_24px_70px_-24px_rgba(0,0,0,0.28)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-strong/60 select-none">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/50" />
        <div className="ml-3 flex-1 max-w-[280px] h-5 rounded-md border border-hairline bg-canvas/60 px-3 flex items-center text-[10px] font-mono text-muted overflow-hidden text-ellipsis whitespace-nowrap">
          {url}
        </div>
      </div>
      <div className="bg-surface-card">{children}</div>
    </div>
  );
}

function ReconciliationDemo() {
  return (
    <div className="flex">
      {/* mini sidebar */}
      <div className="hidden sm:flex flex-col w-44 shrink-0 border-r border-hairline p-4 gap-1">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Image src="/logo.png" alt="" width={18} height={18} className="object-contain rounded" />
          <span className="text-[13px] font-semibold">Engram</span>
        </div>
        {[
          { t: "Graph", a: false },
          { t: "Recap", a: false },
          { t: "Ingest", a: false },
          { t: "Resolve", a: true },
          { t: "Ask", a: false },
        ].map((n) => (
          <div key={n.t} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${n.a ? "bg-surface-strong text-ink" : "text-muted"}`}>{n.t}</div>
        ))}
      </div>
      {/* content */}
      <div className="flex-1 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-semibold">Resolve contradictions</h3>
            <p className="text-[12px] text-muted mt-0.5">Factual conflicts (2 active)</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--color-conflict-warning) 16%, transparent)", color: "var(--color-conflict-warning)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> 2 pending
          </span>
        </div>
        <div className="rounded-xl border border-hairline p-4">
          <div className="text-[12px] font-semibold text-muted mb-3">Conflict · &ldquo;Database choice&rdquo;</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-hairline bg-surface-strong/40 p-3">
              <div className="text-[11px] caption-upper text-muted mb-1.5">Old belief</div>
              <div className="text-[13px] font-medium text-ink">postgres</div>
              <div className="text-[11px] text-muted mt-1">project_spec.md · 2023-10-15</div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "color-mix(in srgb, var(--color-semantic-success) 40%, transparent)", background: "color-mix(in srgb, var(--color-semantic-success) 8%, transparent)" }}>
              <div className="text-[11px] caption-upper mb-1.5" style={{ color: "var(--color-semantic-success)" }}>New evidence</div>
              <div className="text-[13px] font-medium text-ink">supabase</div>
              <div className="text-[11px] text-muted mt-1">adr_v4.pdf · 2023-11-20</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className="px-3 py-1.5 rounded-lg border border-hairline text-[12px] font-medium text-body">Keep old</span>
            <span className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-canvas">Keep new</span>
            <span className="px-3 py-1.5 rounded-lg border border-hairline text-[12px] font-medium text-body">Keep both</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureHead({ title, tint }: { title: string; tint: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2 h-2 rounded-full" style={{ background: tint }} />
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
    </div>
  );
}

function ConflictRow() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-strong/40 p-4 flex flex-col sm:flex-row items-stretch gap-3">
      <div className="flex-1 rounded-xl bg-surface-card border border-hairline p-3">
        <div className="text-[11px] caption-upper text-muted mb-1">Old belief</div>
        <div className="text-[13px] font-medium line-through decoration-[var(--color-muted-soft)] text-muted">Deploys are weekly</div>
      </div>
      <div className="flex items-center justify-center text-muted-soft">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </div>
      <div className="flex-1 rounded-xl bg-surface-card p-3" style={{ border: "1px solid color-mix(in srgb, var(--color-semantic-success) 40%, transparent)" }}>
        <div className="text-[11px] caption-upper mb-1" style={{ color: "var(--color-semantic-success)" }}>Now active</div>
        <div className="text-[13px] font-medium text-ink">Deploys are on every merge</div>
      </div>
    </div>
  );
}

function DecayBar({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[12px] text-body">{label}</span>
        <span className="font-mono text-[12px] font-semibold" style={{ color: tint }}>{value.toFixed(2)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-strong overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${value * 100}%`, background: tint }} />
      </div>
    </div>
  );
}

function GraphMini() {
  const nodes = [
    { cx: 60, cy: 70, r: 10 }, { cx: 140, cy: 40, r: 7 }, { cx: 210, cy: 90, r: 13 },
    { cx: 120, cy: 120, r: 6 }, { cx: 280, cy: 50, r: 8 }, { cx: 260, cy: 130, r: 6 },
  ];
  const edges = [[0, 1], [0, 3], [1, 2], [2, 4], [2, 5], [1, 3]];
  return (
    <svg viewBox="0 0 340 170" className="mt-6 w-full max-w-md opacity-90" aria-hidden>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy} stroke="var(--color-hairline-strong)" strokeWidth="1" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="var(--color-ink)" opacity={0.85} className="source-float" style={{ animationDelay: `${i * 0.4}s`, transformBox: "fill-box", transformOrigin: "center" }} />
      ))}
    </svg>
  );
}

function FAQItem({ q, a, isOpen, onClick }: { q: string; a: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card overflow-hidden">
      <button onClick={onClick} className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left cursor-pointer">
        <span className="text-[15px] sm:text-base font-medium text-ink">{q}</span>
        <svg className={`w-5 h-5 shrink-0 text-muted transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="px-5 sm:px-6 pb-6 text-[14px] text-body leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}
