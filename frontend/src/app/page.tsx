"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { useSession, signOut } from "next-auth/react";
import Lenis from "lenis";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://engram1002.vercel.app";

/* ── The four Cognee lifecycle operations ── */
const MEMORY_OPS: { name: string; alias?: string; desc: string; icon: React.ReactNode }[] = [
  {
    name: "remember",
    desc: "Ingest repos, PDFs, articles, chat exports and transcripts, structured into one graph.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a2 2 0 0 0 4 0" />
        <path d="M12 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a2 2 0 0 1-4 0" />
      </svg>
    ),
  },
  {
    name: "recall",
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
    q: "What happens to a belief when it is superseded?",
    a: "The older belief is deactivated and its confidence drops toward zero. Every reconciliation decision is logged, so you can run temporal diffs like what changed since last week at any time.",
  },
  {
    q: "Which sources can I ingest?",
    a: "GitHub repositories, local PDFs, ChatGPT and Claude conversation exports, web articles, and YouTube transcripts, plus your own chat turns as you use the app.",
  },
  {
    q: "Where does my data go?",
    a: "Only to the LLM provider you configure. Reconciliation history, access control, and metadata live in a local SQLite database, or your own Postgres in production. Bring-your-own-key credentials are encrypted at rest.",
  },
  {
    q: "Open source or hosted?",
    a: "Both. Engram is open source and runs locally by default, or routes remember, recall, improve and forget to a hosted Cognee Cloud tenant over REST, with automatic local fallback.",
  },
];

const SOURCES = ["GitHub", "PDF", "ChatGPT", "Claude", "Articles", "YouTube", "Notes", "Transcripts", "Web pages"];

const HEAD_LINE_1 = ["Memory", "that", "knows"];
const HEAD_LINE_2 = ["when", "to"];
const HEAD_ACCENT = ["update", "itself"];

/* ── Self-contained WebAudio UI sound (no assets, off by default) ── */
function useUiSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundOn(typeof window !== "undefined" && window.localStorage.getItem("engram-sound") === "on");
  }, []);

  const ensureCtx = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctxRef.current = new Ctor();
    return ctxRef.current;
  }, []);

  const tone = useCallback((freq: number, dur: number, vol: number, type: OscillatorType) => {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }, [ensureCtx]);

  const click = useCallback(() => { if (soundOn) { tone(523, 0.07, 0.05, "triangle"); tone(784, 0.06, 0.03, "sine"); } }, [soundOn, tone]);
  const tick = useCallback(() => { if (soundOn) tone(880, 0.045, 0.035, "sine"); }, [soundOn, tone]);

  const toggle = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      window.localStorage.setItem("engram-sound", next ? "on" : "off");
      if (next) { tone(659, 0.08, 0.05, "triangle"); setTimeout(() => tone(988, 0.1, 0.04, "sine"), 70); }
      return next;
    });
  }, [tone]);

  return { soundOn, toggle, click, tick };
}

export default function LandingPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const { soundOn, toggle: toggleSound, click: sfxClick, tick: sfxTick } = useUiSound();

  const [mounted, setMounted] = useState(false);
  const [entering, setEntering] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [liveStats, setLiveStats] = useState<{ sourcesCount: number; entitiesCount: number; conflictsCount: number } | null>(null);

  const navLinks = [
    { id: "#lifecycle", label: "Lifecycle" },
    { id: "#features", label: "Features" },
    { id: "#compare", label: "Why it is different" },
    { id: "#faq", label: "FAQ" },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    sfxTick();
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
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const p = max > 0 ? el.scrollTop / max : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

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
    sfxClick();
    setEntering(true);
    setTimeout(() => router.push(session ? "/graph" : "/login"), 450);
  };

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div ref={wrapRef} className="relative min-h-screen bg-canvas text-ink font-sans overflow-x-clip selection:bg-ink/10">
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

      {/* Scroll progress */}
      <div className="fixed top-0 inset-x-0 z-[60] h-[2px] bg-transparent pointer-events-none">
        <div ref={progressRef} className="scroll-progress h-full w-full bg-ink" style={{ transform: "scaleX(0)" }} />
      </div>

      {/* Page-enter veil */}
      <div className={`fixed inset-0 z-[100] bg-canvas pointer-events-none transition-opacity duration-500 ${entering ? "opacity-100" : "opacity-0"}`} />

      {/* ═══════ NAV ═══════ */}
      <nav className={`fixed top-0 inset-x-0 z-50 h-16 transition-all duration-300 ${scrolled ? "bg-canvas/80 backdrop-blur-xl border-b border-hairline" : "border-b border-transparent"}`}>
        <div className="max-w-[1180px] mx-auto px-5 sm:px-6 h-full flex items-center justify-between">
          <a href="#hero" onClick={(e) => handleNavClick(e, "#hero")} className="flex items-center gap-2 cursor-pointer group" aria-label="Engram home">
            <Image src="/logo.png" alt="Engram" width={30} height={30} priority className="object-contain rounded-md transition-transform duration-500 group-hover:rotate-[8deg]" />
            <span className="text-[19px] font-semibold tracking-tight">Engram</span>
          </a>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <a key={l.id} href={l.id} onClick={(e) => handleNavClick(e, l.id)} className="relative text-[14px] font-medium text-body hover:text-ink transition-colors after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 after:bg-ink after:transition-all hover:after:w-full">
                {l.label}
              </a>
            ))}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="text-[14px] font-medium text-body hover:text-ink transition-colors">GitHub</a>
            <button onClick={toggleSound} className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-strong transition-all cursor-pointer" title={soundOn ? "Sound on" : "Sound off"} aria-pressed={soundOn}>
              <SoundIcon on={soundOn} />
            </button>
            <button
              onClick={() => { sfxTick(); setTheme(resolvedTheme === "dark" ? "light" : "dark"); }}
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
              <button onClick={enter} className="sheen text-[14px] font-semibold px-4 py-2 rounded-full bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer">
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
            <div className="flex items-center gap-2">
              <button onClick={toggleSound} className="flex items-center gap-2 text-[15px] font-medium text-body py-1 cursor-pointer"><SoundIcon on={soundOn} /> {soundOn ? "Sound on" : "Sound off"}</button>
            </div>
            <button onClick={() => { sfxTick(); setTheme(resolvedTheme === "dark" ? "light" : "dark"); }} className="flex items-center gap-2 text-[15px] font-medium text-body py-1 cursor-pointer">
              <ThemeIcon isDark={isDark} /> {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
            </button>
            <button onClick={enter} className="mt-1 text-[15px] font-semibold px-4 py-2.5 rounded-full bg-ink text-canvas cursor-pointer">Open app</button>
          </div>
        )}
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section id="hero" className="relative pt-32 sm:pt-40 pb-20 px-5 sm:px-6">
        <div className="absolute inset-0 grid-backdrop pointer-events-none" />
        <div aria-hidden className="ambient-orb pointer-events-none absolute -top-24 left-[8%] w-[380px] h-[380px] rounded-full blur-[90px] opacity-[0.05] bg-ink" />
        <div aria-hidden className="ambient-orb pointer-events-none absolute top-10 right-[6%] w-[420px] h-[420px] rounded-full blur-[100px] opacity-[0.04] bg-ink" style={{ animationDelay: "3s" }} />

        <div className="relative max-w-[1180px] mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex justify-center" data-reveal-scale>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-hairline bg-surface-card/60 backdrop-blur-sm caption-upper text-muted">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-ink opacity-60 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink" />
                </span>
                Built on the Cognee memory lifecycle
              </span>
            </div>

            <h1 className="display-mega mt-7 leading-[1.03]">
              <span className="block">
                {HEAD_LINE_1.map((w, i) => (
                  <span key={w} className="hl-word" style={{ "--i": i } as React.CSSProperties}>{w}&nbsp;</span>
                ))}
              </span>
              <span className="block">
                {HEAD_LINE_2.map((w, i) => (
                  <span key={w} className="hl-word" style={{ "--i": HEAD_LINE_1.length + i } as React.CSSProperties}>{w}&nbsp;</span>
                ))}
                <span className="hl-underline">
                  {HEAD_ACCENT.map((w, i) => (
                    <span key={w} className="hl-word text-mono-shine" style={{ "--i": HEAD_LINE_1.length + HEAD_LINE_2.length + i } as React.CSSProperties}>
                      {w}{i === 0 ? "\u00A0" : ""}
                    </span>
                  ))}
                </span>
                <span className="hl-word" style={{ "--i": 7 } as React.CSSProperties}>.</span>
              </span>
            </h1>

            <Reveal delay={700}>
              <p className="mt-6 text-lg sm:text-xl text-body leading-relaxed max-w-2xl mx-auto">
                Your AI forgets last night and confidently repeats stale facts. Engram is the self-reconciling memory layer that catches contradictions the moment they appear, and forgets only what has stopped mattering.
              </p>
            </Reveal>
            <Reveal delay={820}>
              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={enter} className="sheen group inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-ink text-canvas text-[15px] font-semibold hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer">
                  {session ? "Open the app" : "Get started free"}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" onMouseEnter={sfxTick} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-hairline bg-surface-card text-[15px] font-semibold text-ink hover:bg-surface-strong transition-colors">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                  View on GitHub
                </a>
              </div>
            </Reveal>
          </div>

          <div data-reveal-scale className="mt-16 sm:mt-20 max-w-4xl mx-auto float-y">
            <AppFrame url={`${BASE_URL.replace(/^https?:\/\//, "")}/resolve`}>
              <ReconciliationDemo />
            </AppFrame>
          </div>
        </div>
      </section>

      {/* ═══════ SOURCE MARQUEE ═══════ */}
      <section className="py-8 border-y border-hairline bg-surface-card/40 overflow-hidden">
        <div className="edge-fade">
          <div className="marquee-track gap-3">
            {[...SOURCES, ...SOURCES].map((s, i) => (
              <span key={i} className="shrink-0 px-4 py-2 rounded-full border border-hairline bg-surface-card text-[13px] font-medium text-body">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ STATS ═══════ */}
      <section id="stats" className="px-5 sm:px-6 py-14">
        <div className="max-w-[1180px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat label="Sources remembered" value={liveStats?.sourcesCount ?? 0} loaded={!!liveStats} />
          <Stat label="Entities in graph" value={liveStats?.entitiesCount ?? 0} loaded={!!liveStats} />
          <Stat label="Conflicts pending" value={liveStats?.conflictsCount ?? 0} loaded={!!liveStats} />
          <Stat label="Lifecycle operations" value={4} loaded />
        </div>
      </section>

      {/* ═══════ LIFECYCLE ═══════ */}
      <section id="lifecycle" className="px-5 sm:px-6 py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl">
            <p className="caption-upper text-muted">The memory lifecycle</p>
            <h2 className="display-lg mt-3">Four operations. All load-bearing.</h2>
            <p className="mt-4 text-body text-lg leading-relaxed">Engram wires the full Cognee lifecycle to both the local SDK and a hosted Cognee Cloud tenant. Remember, recall, improve, and forget all route to the cloud when connected, with automatic local fallback.</p>
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MEMORY_OPS.map((op, i) => (
              <Reveal key={op.name} delay={i * 80}>
                <div className="card-lift group h-full rounded-2xl border border-hairline bg-surface-card p-6">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 bg-surface-strong text-ink transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
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

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" className="px-5 sm:px-6 py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-12">
            <p className="caption-upper text-muted">What makes it different</p>
            <h2 className="display-lg mt-3">Most memory tools stop at recall. This one decides what still deserves trust.</h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-4">
            <Reveal className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9">
                <FeatureHead title="The reconciliation engine" />
                <p className="mt-3 text-body leading-relaxed max-w-lg">When new evidence contradicts something you already believe, Engram catches it at ingestion and routes it to an inbox. Keep the new claim, keep the old one, or keep both as alternatives. Every decision is logged.</p>
                <div className="mt-7"><ConflictRow /></div>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead title="Confidence decay" />
                <p className="mt-3 text-body leading-relaxed">Unreinforced facts lose confidence over time. Drop below the threshold and Engram forgets them automatically.</p>
                <div className="mt-6 space-y-4">
                  <DecayBar label="postgres" value={0.12} strong={false} />
                  <DecayBar label="supabase" value={0.95} strong />
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead title="Temporal diffs" />
                <p className="mt-3 text-body leading-relaxed">Ask what changed since March and get a diff of added nodes, superseded beliefs, and new decisions.</p>
              </div>
            </Reveal>

            <Reveal delay={80} className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
                <div className="max-w-lg">
                  <FeatureHead title="The Recap: where is my context?" />
                  <p className="mt-3 text-body leading-relaxed">A morning-after digest of your memory. For any window, Engram stitches every lifecycle operation into one grounded narrative: what you remembered, reconciled, reinforced, and forgot.</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-hairline bg-surface-strong/60 px-5 py-4 text-center">
                  <div className="text-[11px] caption-upper text-muted">last 7 days</div>
                  <div className="display-md mt-1"><CountUp value={12} prefix="+" /></div>
                  <div className="text-[12px] text-muted">memories reconciled</div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead title="Bring your own key" />
                <p className="mt-3 text-body leading-relaxed">Connect Groq, OpenAI, or Gemini. Keys are validated live and encrypted at rest with Fernet, never logged, never sent to the browser.</p>
              </div>
            </Reveal>

            <Reveal delay={80} className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 overflow-hidden relative">
                <FeatureHead title="A living 3D knowledge graph" />
                <p className="mt-3 text-body leading-relaxed max-w-md">Your memory as a weighted network. Nodes grow with connections, edges show supersedes and contradicts relationships. Explore it all in an interactive 3D view.</p>
                <GraphMini />
              </div>
            </Reveal>

            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <FeatureHead title="Ingest from anywhere" />
                <div className="mt-4 flex flex-wrap gap-2">
                  {SOURCES.slice(0, 6).map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-full border border-hairline bg-surface-strong/50 text-[13px] font-medium text-body">{s}</span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ COMPARE ═══════ */}
      <section id="compare" className="px-5 sm:px-6 py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-12">
            <p className="caption-upper text-muted">Similarity RAG vs Engram</p>
            <h2 className="display-lg mt-3">Recall is not enough. Memory has to stay honest.</h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-4">
            <Reveal>
              <div className="h-full rounded-3xl border border-hairline bg-surface-strong/30 p-7 sm:p-9">
                <h3 className="text-[15px] font-semibold text-muted">Similarity RAG</h3>
                <ul className="mt-5 space-y-3.5">
                  {["Retrieves stale facts with full confidence", "No contradiction detection at ingestion", "Static text embeddings, no structure", "Context grows unbounded and noisy"].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[14px] text-body">
                      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full border border-hairline-strong flex items-center justify-center text-muted">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="card-lift h-full rounded-3xl border-2 border-ink bg-surface-card p-7 sm:p-9">
                <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                  <Image src="/logo.png" alt="" width={18} height={18} className="object-contain rounded" /> Engram
                </h3>
                <ul className="mt-5 space-y-3.5">
                  {["Catches contradictions the moment they appear", "Confidence decays and stale facts are pruned", "Deterministic Cognee knowledge graph", "Forgets only what has stopped mattering"].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[14px] text-ink">
                      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-ink text-canvas flex items-center justify-center">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
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
              { n: "03", t: "Recall", d: "Ask across every session. Answers are graph-grounded and time-aware, with a diff of what changed." },
              { n: "04", t: "Decay", d: "Unreinforced beliefs fade and get pruned, so recall stays fast, lean, and trustworthy." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="relative">
                  <div className="font-mono text-[13px] text-muted-soft">{s.n}</div>
                  <div className="mt-3 h-px w-full bg-hairline relative overflow-hidden">
                    <span className="absolute inset-y-0 left-0 w-full bg-ink origin-left" style={{ animation: "hl-underline 0.9s cubic-bezier(0.22,1,0.36,1) forwards" }} />
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
                <FAQItem q={f.q} a={f.a} isOpen={openFaqIndex === i} onClick={() => { sfxTick(); setOpenFaqIndex(openFaqIndex === i ? null : i); }} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section id="cta" className="px-5 sm:px-6 pb-24">
        <div className="max-w-[1180px] mx-auto">
          <Reveal>
            <div className="relative overflow-hidden rounded-[28px] bg-surface-dark text-on-dark px-8 sm:px-14 py-16 sm:py-20 text-center">
              <div aria-hidden className="ambient-orb absolute -top-20 -left-10 w-72 h-72 rounded-full blur-[80px] opacity-10 bg-on-dark" />
              <div aria-hidden className="ambient-orb absolute -bottom-24 -right-10 w-80 h-80 rounded-full blur-[90px] opacity-10 bg-on-dark" style={{ animationDelay: "2s" }} />
              <div className="relative">
                <h2 className="display-xl">Give your AI a memory that lasts.</h2>
                <p className="mt-5 text-[17px] text-on-dark-soft max-w-xl mx-auto leading-relaxed">Sign in with GitHub or Google and start building a knowledge graph that reconciles itself.</p>
                <button onClick={enter} className="sheen mt-9 inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-on-dark text-surface-dark text-[15px] font-semibold hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer">
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
          <p>© 2026 Engram. Built for the WeMakeDevs and Cognee Hackathon.</p>
          <p>Developed by <a href="https://github.com/Aditya060806" target="_blank" rel="noreferrer" className="text-body hover:text-ink transition-colors underline decoration-dotted underline-offset-4">Aditya Pandey</a></p>
        </div>
      </footer>
    </div>
  );
}

/* ══════════════ Sub-components ══════════════ */

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      ) : (
        <path d="M22 9l-6 6M16 9l6 6" />
      )}
    </svg>
  );
}

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

function Stat({ label, value, loaded }: { label: string; value: number; loaded: boolean }) {
  return (
    <Reveal className="text-center md:text-left">
      <div className="display-md tabular-nums">
        {loaded ? <CountUp value={value} /> : <span className="inline-block w-12 h-7 rounded-md skeleton-shimmer align-middle" />}
      </div>
      <div className="mt-1.5 text-[13px] text-muted">{label}</div>
    </Reveal>
  );
}

function AppFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="w-full rounded-2xl border border-hairline bg-surface-card shadow-[0_24px_70px_-24px_rgba(0,0,0,0.28)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-strong/60 select-none">
        <span className="w-2.5 h-2.5 rounded-full bg-muted-soft/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-muted-soft/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-muted-soft/50" />
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
      <div className="hidden sm:flex flex-col w-44 shrink-0 border-r border-hairline p-4 gap-1">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Image src="/logo.png" alt="" width={18} height={18} className="object-contain rounded" />
          <span className="text-[13px] font-semibold">Engram</span>
        </div>
        {[
          { t: "Graph", a: false }, { t: "Recap", a: false }, { t: "Ingest", a: false }, { t: "Resolve", a: true }, { t: "Ask", a: false },
        ].map((n) => (
          <div key={n.t} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${n.a ? "bg-surface-strong text-ink" : "text-muted"}`}>{n.t}</div>
        ))}
      </div>
      <div className="flex-1 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-semibold">Resolve contradictions</h3>
            <p className="text-[12px] text-muted mt-0.5">Factual conflicts (2 active)</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-hairline text-body">
            <span className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse" /> 2 pending
          </span>
        </div>
        <div className="rounded-xl border border-hairline p-4">
          <div className="text-[12px] font-semibold text-muted mb-3">Conflict: database choice</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-hairline bg-surface-strong/40 p-3">
              <div className="text-[11px] caption-upper text-muted mb-1.5">Old belief</div>
              <div className="text-[13px] font-medium text-muted line-through">postgres</div>
              <div className="text-[11px] text-muted mt-1">project_spec.md · 2023-10-15</div>
            </div>
            <div className="rounded-lg border-2 border-ink bg-surface-card p-3">
              <div className="text-[11px] caption-upper text-ink mb-1.5">New evidence</div>
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

function FeatureHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2 h-2 rounded-full bg-ink" />
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
    </div>
  );
}

function ConflictRow() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-strong/40 p-4 flex flex-col sm:flex-row items-stretch gap-3">
      <div className="flex-1 rounded-xl bg-surface-card border border-hairline p-3">
        <div className="text-[11px] caption-upper text-muted mb-1">Old belief</div>
        <div className="text-[13px] font-medium line-through text-muted">Deploys are weekly</div>
      </div>
      <div className="flex items-center justify-center text-muted-soft">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </div>
      <div className="flex-1 rounded-xl bg-surface-card border-2 border-ink p-3">
        <div className="text-[11px] caption-upper text-ink mb-1">Now active</div>
        <div className="text-[13px] font-medium text-ink">Deploys are on every merge</div>
      </div>
    </div>
  );
}

function DecayBar({ label, value, strong }: { label: string; value: number; strong: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[12px] text-body">{label}</span>
        <span className={`font-mono text-[12px] font-semibold ${strong ? "text-ink" : "text-muted-soft"}`}>{value.toFixed(2)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-strong overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${value * 100}%`, background: strong ? "var(--color-ink)" : "var(--color-muted-soft)" }} />
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
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="var(--color-ink)" opacity={0.85} className="float-y" style={{ animationDelay: `${i * 0.4}s`, transformBox: "fill-box", transformOrigin: "center" }} />
      ))}
    </svg>
  );
}

function FAQItem({ q, a, isOpen, onClick }: { q: string; a: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card overflow-hidden transition-colors hover:border-hairline-strong">
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
