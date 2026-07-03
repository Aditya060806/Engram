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

/* ── Very light accent tints (subtle colour, only in the boxes) ── */
const T = {
  lavender: "var(--color-gradient-lavender)",
  sky: "var(--color-gradient-sky)",
  mint: "var(--color-gradient-mint)",
  rose: "var(--color-gradient-rose)",
  peach: "var(--color-gradient-peach)",
  amber: "var(--color-conflict-warning)",
};
const chip = (tint: string) => ({ background: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint });

/* ── The four Cognee lifecycle operations ── */
const MEMORY_OPS: { name: string; alias?: string; tint: string; desc: string; icon: React.ReactNode }[] = [
  {
    name: "remember", tint: T.lavender,
    desc: "Ingest repos, PDFs, articles, chat exports and transcripts, structured into one graph.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a2 2 0 0 0 4 0" /><path d="M12 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a2 2 0 0 1-4 0" /></svg>,
  },
  {
    name: "recall", tint: T.sky,
    desc: "Ask in plain language. Cognee routes between semantic search and deep graph traversal.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  },
  {
    name: "improve", alias: "memify", tint: T.mint,
    desc: "Re-enrich the graph, reinforce confirmed facts, and adapt weights from your feedback.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>,
  },
  {
    name: "forget", tint: T.rose,
    desc: "Decay unreinforced nodes over time and prune what no longer deserves to be remembered.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>,
  },
];

const faqs = [
  { q: "Is this just RAG with extra steps?", a: "No. Similarity-based RAG relies on static embeddings and happily retrieves stale facts. Engram uses Cognee to compile context into a deterministic graph and runs schema checks at ingestion to catch factual contradictions before they enter long-term memory." },
  { q: "What happens to a belief when it is superseded?", a: "The older belief is deactivated and its confidence drops toward zero. Every reconciliation decision is logged, so you can run temporal diffs like what changed since last week at any time." },
  { q: "Which sources can I ingest?", a: "GitHub repositories, local PDFs, ChatGPT and Claude conversation exports, web articles, and YouTube transcripts, plus your own chat turns as you use the app." },
  { q: "Where does my data go?", a: "Only to the LLM provider you configure. Reconciliation history, access control, and metadata live in a local SQLite database, or your own Postgres in production. Bring-your-own-key credentials are encrypted at rest." },
  { q: "Open source or hosted?", a: "Both. Engram is open source and runs locally by default, or routes remember, recall, improve and forget to a hosted Cognee Cloud tenant over REST, with automatic local fallback." },
];



const DEMO_QA = [
  { q: "What database are we using?", a: "You switched from Postgres to Supabase on Nov 20 for built-in auth and realtime. The earlier Postgres decision is now superseded.", source: "adr_v4.pdf", tag: "supersedes", tint: T.amber },
  { q: "What changed since last week?", a: "Two updates: deploys moved from weekly to on-merge, and the database choice was reconciled to Supabase. One stale node about weekly deploys was pruned.", source: "reconciliation log", tag: "diff", tint: T.sky },
  { q: "Who is the groom?", a: "Doug is the groom and the wedding is on Sunday. Remembered from your notes and recalled across sessions.", source: "vegas_notes.txt", tag: "recall", tint: T.mint },
];



const HEAD_LINE_1 = ["Memory", "that", "knows"];
const HEAD_LINE_2 = ["when", "to"];
const HEAD_ACCENT = ["update", "itself"];

/* Small inline source icons */
const Ic = {
  github: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11 11 0 0 1 6 0C17 5 18 5.3 18 5.3c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" /></svg>,
  pdf: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>,
  notion: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>,
  youtube: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" /></svg>,
  web: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18" /></svg>,
  clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  diff: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h11M4 8l3-3M4 8l3 3" /><path d="M20 16H9M20 16l-3-3M20 16l-3 3" /></svg>,
  merge: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.5 6H12a3 3 0 0 1 3 3v.5M8.5 18H12a3 3 0 0 0 3-3v-.5" /></svg>,
  graph: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.7 7.7 10.5 16M16.6 8.8 13.2 16M8 6.5h8" /></svg>,
  key: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M17 5l2 2M15 7l2 2" /></svg>,
  grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
};

type MItem = { label: string; img?: string; icon?: React.ReactNode; tint: string };
const MARQUEE_A: MItem[] = [
  { label: "GitHub", icon: Ic.github, tint: T.lavender },
  { label: "specs.pdf", icon: Ic.pdf, tint: T.rose },
  { label: "ChatGPT export", img: "/images/chat-gpt-icon.png", tint: T.mint },
  { label: "Claude session", img: "/images/claude-icon.png", tint: T.peach },
  { label: "Articles", icon: Ic.web, tint: T.sky },
  { label: "YouTube", icon: Ic.youtube, tint: T.rose },
];
const MARQUEE_B: MItem[] = [
  { label: "Notion notes", icon: Ic.notion, tint: T.sky },
  { label: "Transcripts", icon: Ic.youtube, tint: T.amber },
  { label: "Web pages", icon: Ic.web, tint: T.mint },
  { label: "Gemini", img: "/images/gemini-icon.png", tint: T.lavender },
  { label: "Repositories", icon: Ic.github, tint: T.peach },
  { label: "PDF docs", icon: Ic.pdf, tint: T.rose },
];

/* ── Self-contained WebAudio UI sound (off by default) ── */
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
    { id: "#sources", label: "Sources" },
    { id: "#features", label: "Features" },
    { id: "#faq", label: "FAQ" },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    sfxTick();
    if (lenisRef.current) lenisRef.current.scrollTo(targetId, { duration: 1.3, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    else document.querySelector(targetId)?.scrollIntoView({ behavior: "smooth" });
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
        if (sourcesRes.ok) { const s = await sourcesRes.json(); sourcesCount = Array.isArray(s) ? s.length : 0; }
        if (schemaRes.ok) { const s = await schemaRes.json(); if (Array.isArray(s)) entitiesCount = s.reduce((a, c) => a + (c.count || 0), 0); }
        if (reconcileRes.ok) { const e = await reconcileRes.json(); if (Array.isArray(e)) conflictsCount = e.filter((x) => x.status === "pending" || x.status === "detected").length; }
        setLiveStats({ sourcesCount, entitiesCount, conflictsCount });
      } catch (err) { console.error("Failed to load live stats:", err); }
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
    document.documentElement.classList.remove("h-full"); document.documentElement.classList.add("min-h-screen");
    document.body.classList.remove("h-full"); document.body.classList.add("min-h-screen");

    const lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenisRef.current = lenis;
    let rafId = 0;
    const raf = (time: number) => { lenis.raf(time); rafId = requestAnimationFrame(raf); };
    rafId = requestAnimationFrame(raf);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (htmlHasHFull) { document.documentElement.classList.add("h-full"); document.documentElement.classList.remove("min-h-screen"); }
      if (bodyHasHFull) { document.body.classList.add("h-full"); document.body.classList.remove("min-h-screen"); }
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const enter = () => { sfxClick(); setEntering(true); setTimeout(() => router.push(session ? "/graph" : "/login"), 450); };
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div ref={wrapRef} className="relative min-h-screen bg-canvas text-ink font-sans overflow-x-clip selection:bg-ink/10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Engram", applicationCategory: "ProductivityApplication", operatingSystem: "Web", description: "A self-organizing personal knowledge graph built on Cognee's memory lifecycle.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }) }} />

      <div className="fixed top-0 inset-x-0 z-[60] h-[2px] bg-transparent pointer-events-none">
        <div ref={progressRef} className="scroll-progress h-full w-full bg-ink" style={{ transform: "scaleX(0)" }} />
      </div>
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
              <a key={l.id} href={l.id} onClick={(e) => handleNavClick(e, l.id)} className="relative text-[14px] font-medium text-body hover:text-ink transition-colors after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 after:bg-ink after:transition-all hover:after:w-full">{l.label}</a>
            ))}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="text-[14px] font-medium text-body hover:text-ink transition-colors">GitHub</a>
            <button onClick={toggleSound} className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-strong transition-all cursor-pointer" title={soundOn ? "Sound on" : "Sound off"} aria-pressed={soundOn}><SoundIcon on={soundOn} /></button>
            <button onClick={() => { sfxTick(); setTheme(resolvedTheme === "dark" ? "light" : "dark"); }} className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-strong transition-all cursor-pointer" title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Switch theme"}><ThemeIcon isDark={isDark} /></button>
            {session ? (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-8 h-8 rounded-full bg-ink text-canvas text-[13px] font-semibold flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer" title="Account">{session.user?.name?.charAt(0) || "U"}</button>
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
              <button onClick={enter} className="sheen text-[14px] font-semibold px-4 py-2 rounded-full bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer">Open app</button>
            )}
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-ink" aria-label="Menu">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">{isMobileMenuOpen ? <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}</svg>
          </button>
        </div>
        {isMobileMenuOpen && (
          <div className="md:hidden bg-canvas border-b border-hairline px-6 py-5 flex flex-col gap-3">
            {navLinks.map((l) => (<a key={l.id} href={l.id} onClick={(e) => handleNavClick(e, l.id)} className="text-[15px] font-medium text-body py-1">{l.label}</a>))}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" onClick={() => setIsMobileMenuOpen(false)} className="text-[15px] font-medium text-body py-1">GitHub</a>
            <button onClick={toggleSound} className="flex items-center gap-2 text-[15px] font-medium text-body py-1 cursor-pointer"><SoundIcon on={soundOn} /> {soundOn ? "Sound on" : "Sound off"}</button>
            <button onClick={() => { sfxTick(); setTheme(resolvedTheme === "dark" ? "light" : "dark"); }} className="flex items-center gap-2 text-[15px] font-medium text-body py-1 cursor-pointer"><ThemeIcon isDark={isDark} /> {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}</button>
            <button onClick={enter} className="mt-1 text-[15px] font-semibold px-4 py-2.5 rounded-full bg-ink text-canvas cursor-pointer">Open app</button>
          </div>
        )}
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section id="hero" className="relative pt-28 sm:pt-40 pb-16 sm:pb-20 px-5 sm:px-6">
        <div className="absolute inset-0 grid-backdrop pointer-events-none" />
        <div aria-hidden className="ambient-orb pointer-events-none absolute -top-24 left-[6%] w-[300px] sm:w-[380px] h-[300px] sm:h-[380px] rounded-full blur-[90px] opacity-[0.05] bg-ink" />
        <div aria-hidden className="ambient-orb pointer-events-none absolute top-10 right-[4%] w-[320px] sm:w-[420px] h-[320px] sm:h-[420px] rounded-full blur-[100px] opacity-[0.04] bg-ink" style={{ animationDelay: "3s" }} />
        <div className="relative max-w-[1180px] mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Reveal className="flex justify-center">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-hairline bg-surface-card/60 backdrop-blur-sm caption-upper text-muted">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-ink opacity-60 animate-ping" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink" /></span>
                Built on the Cognee memory lifecycle
              </span>
            </Reveal>
            <h1 className="display-mega mt-6 sm:mt-7 leading-[1.03]">
              <span className="block">{HEAD_LINE_1.map((w, i) => (<span key={w} className="hl-word" style={{ "--i": i } as React.CSSProperties}>{w}&nbsp;</span>))}</span>
              <span className="block">
                {HEAD_LINE_2.map((w, i) => (<span key={w} className="hl-word" style={{ "--i": HEAD_LINE_1.length + i } as React.CSSProperties}>{w}&nbsp;</span>))}
                <span className="hl-underline">{HEAD_ACCENT.map((w, i) => (<span key={w} className="hl-word" style={{ "--i": HEAD_LINE_1.length + HEAD_LINE_2.length + i } as React.CSSProperties}><span className="text-mono-shine">{w}{i === 0 ? "\u00A0" : ""}</span></span>))}</span>
                <span className="hl-word" style={{ "--i": 7 } as React.CSSProperties}>.</span>
              </span>
            </h1>
            <Reveal delay={700}><p className="mt-6 text-base sm:text-xl text-body leading-relaxed max-w-2xl mx-auto">Your AI forgets last night and confidently repeats stale facts. Engram is the self-reconciling memory layer that catches contradictions the moment they appear, and forgets only what has stopped mattering.</p></Reveal>
            <Reveal delay={820}>
              <div className="mt-8 sm:mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={enter} className="sheen group inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-ink text-canvas text-[15px] font-semibold hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer w-full sm:w-auto justify-center">
                  {session ? "Open the app" : "Get started free"}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" onMouseEnter={sfxTick} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-hairline bg-surface-card text-[15px] font-semibold text-ink hover:bg-surface-strong transition-colors w-full sm:w-auto justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                  View on GitHub
                </a>
              </div>
            </Reveal>
          </div>
          <Reveal delay={400} className="mt-12 sm:mt-16 max-w-4xl mx-auto">
            <div className="float-y">
              <AppFrame url={`${BASE_URL.replace(/^https?:\/\//, "")}/resolve`}><ReconciliationDemo /></AppFrame>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ MARQUEE ═══════ */}
      <section className="py-9 sm:py-11 border-y border-hairline bg-surface-card/40 overflow-hidden">
        <p className="text-center caption-upper text-muted-soft mb-6">Everything you read, write, and build</p>
        <div className="edge-fade space-y-3">
          <MarqueeRow items={MARQUEE_A} duration={38} />
          <MarqueeRow items={MARQUEE_B} duration={46} reverse />
        </div>
      </section>

      {/* ═══════ STATS ═══════ */}
      <section id="stats" className="px-5 sm:px-6 py-12 sm:py-14">
        <div className="max-w-[1180px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          <Stat label="Sources remembered" value={liveStats?.sourcesCount ?? 0} loaded={!!liveStats} />
          <Stat label="Entities in graph" value={liveStats?.entitiesCount ?? 0} loaded={!!liveStats} />
          <Stat label="Conflicts pending" value={liveStats?.conflictsCount ?? 0} loaded={!!liveStats} />
          <Stat label="Lifecycle operations" value={4} loaded />
        </div>
      </section>

      {/* ═══════ LIFECYCLE ═══════ */}
      <section id="lifecycle" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl">
            <p className="caption-upper text-muted">The memory lifecycle</p>
            <h2 className="display-lg mt-3">Four operations, total recall.</h2>
            <p className="mt-4 text-body text-base sm:text-lg leading-relaxed">
              <span className="font-mono text-[13px] px-1.5 py-0.5 rounded" style={chip(T.lavender)}>remember</span>{" "}
              <span className="font-mono text-[13px] px-1.5 py-0.5 rounded" style={chip(T.sky)}>recall</span>{" "}
              <span className="font-mono text-[13px] px-1.5 py-0.5 rounded" style={chip(T.mint)}>improve</span>{" "}
              <span className="font-mono text-[13px] px-1.5 py-0.5 rounded" style={chip(T.rose)}>forget</span>{" "}
              are all load-bearing, wired to both the local Cognee SDK and a hosted Cognee Cloud tenant, with automatic local fallback.
            </p>
          </Reveal>
          <div className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MEMORY_OPS.map((op, i) => (
              <Reveal key={op.name} delay={i * 80}>
                <div className="card-lift group h-full rounded-2xl border border-hairline bg-surface-card p-6">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" style={chip(op.tint)}>{op.icon}</div>
                  <div className="flex items-baseline gap-2"><span className="font-mono text-[15px] font-semibold text-ink">{op.name}()</span>{op.alias && <span className="text-[11px] text-muted-soft">· {op.alias}</span>}</div>
                  <p className="mt-2.5 text-[14px] text-body leading-relaxed">{op.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SOURCES ORBIT ═══════ */}
      <section id="sources" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-10 sm:mb-14">
            <p className="caption-upper text-muted">Ingest from anywhere</p>
            <h2 className="display-lg mt-3">Everything you read, write, and build flows into one graph.</h2>
            <p className="mt-4 text-body text-base sm:text-lg leading-relaxed">Repos, PDFs, articles, YouTube transcripts, and ChatGPT or Claude exports are all compiled by Cognee into a single reconciled memory.</p>
          </Reveal>
          <Reveal><SourceOrbit /></Reveal>
        </div>
      </section>

      {/* ═══════ ASK DEMO ═══════ */}
      <section id="try" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[900px] mx-auto">
          <Reveal className="max-w-2xl mb-8 sm:mb-10">
            <p className="caption-upper text-muted">See it think</p>
            <h2 className="display-lg mt-3">Ask your memory. Get a grounded answer.</h2>
            <p className="mt-4 text-body text-base sm:text-lg leading-relaxed">A quick taste of recall. Type a question or pick one, and watch Engram answer from the graph, with the source it used.</p>
          </Reveal>
          <Reveal><AskDemo /></Reveal>
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-10 sm:mb-12">
            <p className="caption-upper text-muted">What makes it different</p>
            <h2 className="display-lg mt-3">Most memory tools stop at recall. This one decides what still deserves trust.</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Source types — sphere card */}
            <Reveal className="md:col-span-2">
              <div className="card-lift relative h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 overflow-hidden">
                <div aria-hidden className="absolute -right-10 -top-6 w-72 h-72 opacity-[0.10] pointer-events-none">
                  <Image src="/images/capabilities-sphere.webp" alt="" fill sizes="288px" className="object-contain" />
                </div>
                <div className="relative">
                  <IconChip tint={T.peach}>{Ic.grid}</IconChip>
                  <h3 className="mt-5 text-lg font-semibold">Five source types, natively</h3>
                  <p className="mt-2.5 text-body leading-relaxed max-w-md">Ingests PDFs, GitHub repositories, ChatGPT and Claude exports, YouTube transcripts, and web articles, with your chat turns remembered as you go.</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[Ic.github, Ic.pdf, Ic.notion, Ic.youtube, Ic.web].map((ic, i) => (<span key={i} className="w-9 h-9 rounded-lg border border-hairline bg-surface-strong/50 flex items-center justify-center text-body">{ic}</span>))}
                  </div>
                </div>
              </div>
            </Reveal>
            {/* Reconciliation */}
            <Reveal delay={80}>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <IconChip tint={T.amber}>{Ic.merge}</IconChip>
                <h3 className="mt-5 text-lg font-semibold">Reconciliation engine</h3>
                <p className="mt-2.5 text-body leading-relaxed">Validates every new belief against your graph in under two seconds using schema-level contradiction checks.</p>
              </div>
            </Reveal>
            {/* Decay */}
            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <IconChip tint={T.rose}>{Ic.clock}</IconChip>
                <h3 className="mt-5 text-lg font-semibold">Time-aware decay</h3>
                <p className="mt-2.5 text-body leading-relaxed">Confidence decays continuously and unreinforced nodes are pruned once they drop below the threshold.</p>
                <div className="mt-5 space-y-4">
                  <DecayBar label="postgres" value={0.12} strong={false} />
                  <DecayBar label="supabase" value={0.95} strong />
                </div>
              </div>
            </Reveal>
            {/* Graph — wide */}
            <Reveal delay={80} className="md:col-span-2">
              <div className="card-lift relative h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 overflow-hidden">
                <IconChip tint={T.sky}>{Ic.graph}</IconChip>
                <h3 className="mt-5 text-lg font-semibold">A living 3D knowledge graph</h3>
                <p className="mt-2.5 text-body leading-relaxed max-w-md">A force-directed visualizer maps your memory as a weighted network. Nodes grow with connections; edges show supersedes and contradicts, with real-time provenance tracing.</p>
                <GraphMini />
              </div>
            </Reveal>
            {/* Temporal */}
            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <IconChip tint={T.sky}>{Ic.diff}</IconChip>
                <h3 className="mt-5 text-lg font-semibold">Temporal diffs</h3>
                <p className="mt-2.5 text-body leading-relaxed">Ask what changed since March and get a diff of added nodes, superseded beliefs, and new decisions.</p>
              </div>
            </Reveal>
            {/* Recap — wide */}
            <Reveal delay={80} className="md:col-span-2">
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7 sm:p-9 flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
                <div className="max-w-lg">
                  <IconChip tint={T.lavender}>{Ic.clock}</IconChip>
                  <h3 className="mt-5 text-lg font-semibold">The Recap: where is my context?</h3>
                  <p className="mt-2.5 text-body leading-relaxed">A morning-after digest of your memory. For any window, Engram stitches every lifecycle operation into one grounded narrative.</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-hairline bg-surface-strong/60 px-5 py-4 text-center self-start sm:self-auto">
                  <div className="text-[11px] caption-upper text-muted">last 7 days</div>
                  <div className="display-md mt-1"><CountUp value={12} prefix="+" /></div>
                  <div className="text-[12px] text-muted">memories reconciled</div>
                </div>
              </div>
            </Reveal>
            {/* BYOK */}
            <Reveal>
              <div className="card-lift h-full rounded-3xl border border-hairline bg-surface-card p-7">
                <IconChip tint={T.mint}>{Ic.key}</IconChip>
                <h3 className="mt-5 text-lg font-semibold">Bring your own key</h3>
                <p className="mt-2.5 text-body leading-relaxed">Connect Groq, OpenAI, or Gemini. Keys are validated live and encrypted at rest with Fernet.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ COMPARE ═══════ */}
      <section id="compare" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-10 sm:mb-12"><p className="caption-upper text-muted">Similarity RAG vs Engram</p><h2 className="display-lg mt-3">Recall is not enough. Memory has to stay honest.</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Reveal>
              <div className="h-full rounded-3xl border border-hairline bg-surface-strong/30 p-7 sm:p-9">
                <h3 className="text-[15px] font-semibold text-muted">Similarity RAG</h3>
                <ul className="mt-5 space-y-3.5">
                  {["Retrieves stale facts with full confidence", "No contradiction detection at ingestion", "Static text embeddings, no structure", "Context grows unbounded and noisy"].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[14px] text-body"><span className="mt-0.5 w-5 h-5 shrink-0 rounded-full border border-hairline-strong flex items-center justify-center text-muted"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></span>{t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="card-lift h-full rounded-3xl border-2 border-ink bg-surface-card p-7 sm:p-9">
                <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2"><Image src="/logo.png" alt="" width={18} height={18} className="object-contain rounded" /> Engram</h3>
                <ul className="mt-5 space-y-3.5">
                  {["Catches contradictions the moment they appear", "Confidence decays and stale facts are pruned", "Deterministic Cognee knowledge graph", "Forgets only what has stopped mattering"].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[14px] text-ink"><span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-ink text-canvas flex items-center justify-center"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>{t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ HOW ═══════ */}
      <section id="how" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto">
          <Reveal className="max-w-2xl mb-12 sm:mb-14"><p className="caption-upper text-muted">How it works</p><h2 className="display-lg mt-3">From raw context to a memory that maintains itself.</h2></Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { n: "01", t: "Ingest", d: "Point Engram at a repo, PDF, article, video, or chat export. It extracts the meaning and structures it into the graph." },
              { n: "02", t: "Reconcile", d: "New evidence is checked against what you already know. Contradictions surface instantly for a quick decision." },
              { n: "03", t: "Recall", d: "Ask across every session. Answers are graph-grounded and time-aware, with a diff of what changed." },
              { n: "04", t: "Decay", d: "Unreinforced beliefs fade and get pruned, so recall stays fast, lean, and trustworthy." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="relative">
                  <div className="font-mono text-[13px] text-muted-soft">{s.n}</div>
                  <div className="mt-3 h-px w-full bg-hairline relative overflow-hidden"><span className="absolute inset-y-0 left-0 w-full bg-ink origin-left" style={{ animation: "hl-underline 0.9s cubic-bezier(0.22,1,0.36,1) forwards" }} /></div>
                  <h3 className="mt-5 text-lg font-semibold">{s.t}</h3>
                  <p className="mt-2 text-[14px] text-body leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section id="faq" className="px-5 sm:px-6 py-20 sm:py-24 border-t border-hairline">
        <div className="max-w-[820px] mx-auto">
          <Reveal className="text-center mb-10 sm:mb-12"><p className="caption-upper text-muted">Questions</p><h2 className="display-lg mt-3">Good to know</h2></Reveal>
          <div className="space-y-3">{faqs.map((f, i) => (<Reveal key={f.q} delay={i * 50}><FAQItem q={f.q} a={f.a} isOpen={openFaqIndex === i} onClick={() => { sfxTick(); setOpenFaqIndex(openFaqIndex === i ? null : i); }} /></Reveal>))}</div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section id="cta" className="px-5 sm:px-6 pb-20 sm:pb-24">
        <div className="max-w-[1180px] mx-auto">
          <Reveal>
            <div className="relative overflow-hidden rounded-[28px] bg-surface-dark text-on-dark px-7 sm:px-14 py-14 sm:py-20 text-center">
              <div aria-hidden className="ambient-orb absolute -top-20 -left-10 w-72 h-72 rounded-full blur-[80px] opacity-10 bg-on-dark" />
              <div aria-hidden className="ambient-orb absolute -bottom-24 -right-10 w-80 h-80 rounded-full blur-[90px] opacity-10 bg-on-dark" style={{ animationDelay: "2s" }} />
              <div className="relative">
                <h2 className="display-xl">Give your AI a memory that lasts.</h2>
                <p className="mt-5 text-base sm:text-[17px] text-on-dark-soft max-w-xl mx-auto leading-relaxed">Sign in with GitHub or Google and start building a knowledge graph that reconciles itself.</p>
                <button onClick={enter} className="sheen mt-8 sm:mt-9 inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-on-dark text-surface-dark text-[15px] font-semibold hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer">
                  {session ? "Open the app" : "Get started free"}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="px-5 sm:px-6 py-12 sm:py-14 border-t border-hairline">
        <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5"><Image src="/logo.png" alt="Engram" width={26} height={26} className="object-contain rounded-md" /><span className="text-[16px] font-semibold tracking-tight">Engram</span></div>
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

function IconChip({ tint, children }: { tint: string; children: React.ReactNode }) {
  return <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={chip(tint)}>{children}</div>;
}

function MarqueeRow({ items, duration, reverse = false }: { items: MItem[]; duration: number; reverse?: boolean }) {
  // Repeat items enough that a single copy is wider than any viewport, so the lane never shows a gap.
  const group = Array.from({ length: 4 }).flatMap(() => items);
  const pill = (it: MItem, i: number) => (
    <span
      key={i}
      className="tap-sm shrink-0 inline-flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full border border-hairline bg-surface-card text-[13px] font-medium text-body hover:text-ink hover:border-hairline-strong hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.28)] transition-all duration-200"
    >
      <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={chip(it.tint)}>
        {it.img ? <Image src={it.img} alt="" width={13} height={13} className="object-contain" /> : it.icon}
      </span>
      {it.label}
    </span>
  );
  return (
    <div className={`marquee-track ${reverse ? "reverse" : ""}`} style={{ animationDuration: `${duration}s` }}>
      <div className="marquee-group">{group.map(pill)}</div>
      <div className="marquee-group" aria-hidden>{group.map(pill)}</div>
    </div>
  );
}

function AskDemo() {
  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState<(typeof DEMO_QA)[number] | null>(null);
  const [typed, setTyped] = useState("");
  const [asked, setAsked] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = (q: string) => {
    const query = q.trim();
    if (!query) return;
    const lower = query.toLowerCase();
    const match =
      (lower.includes("database") || lower.includes("postgres") || lower.includes("supabase") ? DEMO_QA[0] : null) ||
      (lower.includes("chang") || lower.includes("diff") || lower.includes("week") ? DEMO_QA[1] : null) ||
      (lower.includes("groom") || lower.includes("doug") || lower.includes("wedding") ? DEMO_QA[2] : null) ||
      DEMO_QA[0];
    setAsked(query);
    setValue("");
    setAnswer(match);
    setTyped("");
    if (timerRef.current) clearInterval(timerRef.current);
    let i = 0;
    timerRef.current = setInterval(() => {
      i += 2;
      setTyped(match.a.slice(0, i));
      if (i >= match.a.length && timerRef.current) clearInterval(timerRef.current);
    }, 16);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const isTyping = answer !== null && typed.length < answer.a.length;

  return (
    <div className="rounded-3xl border border-hairline bg-surface-card p-4 sm:p-6 shadow-[0_10px_40px_-22px_rgba(0,0,0,0.25)]">
      <div className="min-h-[140px] rounded-2xl bg-surface-strong/30 border border-hairline p-4 sm:p-5">
        {answer ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-ink text-canvas flex items-center justify-center text-[10px] font-semibold shrink-0">You</span>
              <span className="text-[14px] font-medium text-ink">{asked}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Image src="/logo.png" alt="" width={24} height={24} className="object-contain rounded-md mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] text-body leading-relaxed ${isTyping ? "caret" : ""}`}>{typed}</p>
                {!isTyping && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-hairline bg-surface-card text-[11px] font-medium text-body">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      {answer.source}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={chip(answer.tint)}>{answer.tag}</span>
                    <span className="text-[11px] text-muted-soft">via cognee · graph-completion</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center py-6">
            <p className="text-[13px] text-muted-soft max-w-xs">Ask something below, or tap a suggestion. This is a live-typed demo of graph-grounded recall.</p>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(value); }} className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask your memory anything…"
          className="ring-focus flex-1 px-4 py-3 rounded-full bg-surface-card border border-hairline text-[14px] text-ink placeholder:text-muted-soft transition-all min-w-0"
        />
        <button type="submit" className="tap shrink-0 inline-flex items-center gap-1.5 px-5 py-3 rounded-full bg-ink text-canvas text-[14px] font-semibold hover:opacity-90 transition-opacity cursor-pointer">
          Ask
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {DEMO_QA.map((d) => (
          <button key={d.q} onClick={() => run(d.q)} className="tap-sm px-3 py-1.5 rounded-full border border-hairline bg-surface-strong/40 text-[12.5px] font-medium text-body hover:text-ink hover:border-hairline-strong transition-colors cursor-pointer">
            {d.q}
          </button>
        ))}
      </div>
    </div>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? (<><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>) : (<path d="M22 9l-6 6M16 9l6 6" />)}
    </svg>
  );
}

function ThemeIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {isDark ? (<><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>) : (<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />)}
    </svg>
  );
}

function Stat({ label, value, loaded }: { label: string; value: number; loaded: boolean }) {
  return (
    <Reveal className="text-center md:text-left">
      <div className="display-md tabular-nums">{loaded ? <CountUp value={value} /> : <span className="inline-block w-12 h-7 rounded-md skeleton-shimmer align-middle" />}</div>
      <div className="mt-1.5 text-[13px] text-muted">{label}</div>
    </Reveal>
  );
}

function AppFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="w-full rounded-2xl border border-hairline bg-surface-card shadow-[0_24px_70px_-24px_rgba(0,0,0,0.28)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-strong/60 select-none">
        <span className="w-2.5 h-2.5 rounded-full bg-muted-soft/50" /><span className="w-2.5 h-2.5 rounded-full bg-muted-soft/50" /><span className="w-2.5 h-2.5 rounded-full bg-muted-soft/50" />
        <div className="ml-3 flex-1 max-w-[280px] h-5 rounded-md border border-hairline bg-canvas/60 px-3 flex items-center text-[10px] font-mono text-muted overflow-hidden text-ellipsis whitespace-nowrap">{url}</div>
      </div>
      <div className="bg-surface-card">{children}</div>
    </div>
  );
}

const DEMO_CONFLICTS = [
  { topic: "memory backend", oldV: "local SQLite store", oldSrc: "setup_notes.md", oldDate: "Jun 24", newV: "Cognee Cloud tenant", newSrc: "adr_cloud.md", newDate: "Jul 1" },
  { topic: "answer engine", oldV: "LLM-generated replies", oldSrc: "recall_v1.md", oldDate: "Jun 26", newV: "Cognee graph-completion", newSrc: "recall_v2.md", newDate: "Jul 3" },
  { topic: "deployment", oldV: "single combined app", oldSrc: "deploy_v1.md", oldDate: "Jun 28", newV: "Vercel web + Render API", newSrc: "deploy_v2.md", newDate: "Jul 2" },
  { topic: "sign-in", oldV: "email and password", oldSrc: "auth_draft.md", oldDate: "Jun 25", newV: "GitHub and Google OAuth", newSrc: "auth_final.md", newDate: "Jun 30" },
];

function ResolveCheck({ tint = "var(--color-ink)" }: { tint?: string }) {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ background: tint, color: "var(--color-canvas)" }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
    </span>
  );
}

function ReconciliationDemo() {
  const [idx, setIdx] = useState(0);
  const [choice, setChoice] = useState<null | "old" | "new" | "both">(null);
  const pausedRef = useRef(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const c = DEMO_CONFLICTS[idx];

  const goNext = () => {
    setChoice(null);
    setIdx((i) => (i + 1) % DEMO_CONFLICTS.length);
  };

  const resolve = (ch: "old" | "new" | "both") => {
    if (choice) return;
    setChoice(ch);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    advanceRef.current = setTimeout(goNext, 1250);
  };

  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current || choice) return;
      goNext();
    }, 4600);
    return () => clearInterval(t);
  }, [choice]);

  useEffect(() => () => { if (advanceRef.current) clearTimeout(advanceRef.current); }, []);

  const oldChosen = choice === "old" || choice === "both";
  const newChosen = choice === "new" || choice === "both";

  return (
    <div className="flex" onMouseEnter={() => { pausedRef.current = true; }} onMouseLeave={() => { pausedRef.current = false; }}>
      <div className="hidden sm:flex flex-col w-44 shrink-0 border-r border-hairline p-4 gap-1">
        <div className="flex items-center gap-2 mb-3 px-1"><Image src="/logo.png" alt="" width={18} height={18} className="object-contain rounded" /><span className="text-[13px] font-semibold">Engram</span></div>
        {[{ t: "Graph", a: false }, { t: "Recap", a: false }, { t: "Ingest", a: false }, { t: "Resolve", a: true }, { t: "Ask", a: false }].map((n) => (<div key={n.t} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${n.a ? "bg-surface-strong text-ink" : "text-muted"}`}>{n.t}</div>))}
      </div>
      <div className="flex-1 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div><h3 className="text-[15px] font-semibold">Resolve contradictions</h3><p className="text-[12px] text-muted mt-0.5">Superseded decisions in your build</p></div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors" style={chip(choice ? T.mint : T.amber)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />{choice ? "Resolved" : `${DEMO_CONFLICTS.length} pending`}
          </span>
        </div>
        <div key={idx} className="route-enter rounded-xl border border-hairline p-4">
          <div className="text-[12px] font-semibold text-muted mb-3">Conflict: {c.topic}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 transition-all duration-300" style={{
              borderColor: oldChosen ? "color-mix(in srgb, var(--color-ink) 55%, transparent)" : "var(--color-hairline)",
              background: oldChosen ? "color-mix(in srgb, var(--color-ink) 6%, transparent)" : "color-mix(in srgb, var(--color-surface-strong) 45%, transparent)",
              opacity: choice === "new" ? 0.5 : 1,
            }}>
              <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] caption-upper text-muted">Old belief</span>{oldChosen && <ResolveCheck />}</div>
              <div className={`text-[13px] font-medium ${choice === "new" ? "text-muted line-through" : "text-ink"}`}>{c.oldV}</div>
              <div className="text-[11px] text-muted mt-1">{c.oldSrc} · {c.oldDate}</div>
            </div>
            <div className="rounded-lg border p-3 transition-all duration-300" style={{
              borderColor: newChosen || choice === null ? `color-mix(in srgb, ${T.mint} 55%, transparent)` : "var(--color-hairline)",
              background: newChosen || choice === null ? `color-mix(in srgb, ${T.mint} 8%, transparent)` : "transparent",
              opacity: choice === "old" ? 0.5 : 1,
            }}>
              <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] caption-upper" style={{ color: T.mint }}>New evidence</span>{newChosen && <ResolveCheck tint={T.mint} />}</div>
              <div className={`text-[13px] font-medium ${choice === "old" ? "text-muted line-through" : "text-ink"}`}>{c.newV}</div>
              <div className="text-[11px] text-muted mt-1">{c.newSrc} · {c.newDate}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => resolve("old")} className="tap px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all cursor-pointer" style={{ borderColor: choice === "old" ? "var(--color-ink)" : "var(--color-hairline)", background: choice === "old" ? "var(--color-ink)" : "transparent", color: choice === "old" ? "var(--color-canvas)" : "var(--color-body)" }}>Keep old</button>
            <button onClick={() => resolve("new")} className="tap px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-canvas transition-all cursor-pointer" style={{ opacity: choice && choice !== "new" ? 0.5 : 1 }}>Keep new</button>
            <button onClick={() => resolve("both")} className="tap px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all cursor-pointer" style={{ borderColor: choice === "both" ? "var(--color-ink)" : "var(--color-hairline)", background: choice === "both" ? "var(--color-ink)" : "transparent", color: choice === "both" ? "var(--color-canvas)" : "var(--color-body)" }}>Keep both</button>
          </div>
          <div className="flex items-center gap-1.5 mt-4">
            {DEMO_CONFLICTS.map((_, i) => (
              <span key={i} className="h-1 rounded-full transition-all duration-300" style={{ width: i === idx ? 18 : 6, background: i === idx ? "var(--color-ink)" : "var(--color-hairline-strong)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type OrbitPill = { label: string; img?: string; ic?: React.ReactNode; x: number; y: number; d: string };
function SourceOrbit() {
  const [hovered, setHovered] = useState<number | null>(null);
  const pills: OrbitPill[] = [
    { label: "ChatGPT Export", img: "/images/chat-gpt-icon.png", x: 18, y: 15, d: "0s" },
    { label: "Claude Session", img: "/images/claude-icon.png", x: 82, y: 17, d: "0.6s" },
    { label: "GitHub Commit", ic: Ic.github, x: 11, y: 49, d: "1.2s" },
    { label: "specs.pdf", ic: Ic.pdf, x: 89, y: 49, d: "0.9s" },
    { label: "Notion Notes", ic: Ic.notion, x: 20, y: 85, d: "0.3s" },
    { label: "YouTube Audio", ic: Ic.youtube, x: 50, y: 93, d: "1.5s" },
    { label: "Web Article", ic: Ic.web, x: 80, y: 85, d: "0.45s" },
  ];
  return (
    <div className="rounded-3xl border border-hairline bg-surface-card p-4 sm:p-6 overflow-hidden">
      <div className="relative mx-auto w-full max-w-3xl h-[380px] sm:h-[480px]">
        {/* animated connector lines + traveling data particles */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none hidden sm:block" aria-hidden>
          {pills.map((p, i) => (
            <g key={p.label}>
              <line
                x1={`${p.x}%`} y1={`${p.y}%`} x2="50%" y2="50%"
                className="flow-line" strokeLinecap="round"
                stroke={hovered === i ? "var(--color-ink)" : "var(--color-hairline-strong)"}
                strokeWidth={hovered === i ? 1.6 : 1}
                opacity={hovered === null || hovered === i ? 1 : 0.3}
                style={{ transition: "opacity 0.3s, stroke 0.3s" }}
              />
              <circle r={hovered === i ? 3.5 : 2.4} fill="var(--color-ink)">
                <animate attributeName="cx" from={`${p.x}%`} to="50%" dur="2.6s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
                <animate attributeName="cy" from={`${p.y}%`} to="50%" dur="2.6s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.75;0" dur="2.6s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </svg>

        {/* floating source pills (desktop) */}
        {pills.map((p, i) => (
          <div
            key={p.label}
            className="hidden sm:block absolute z-10"
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="source-float" style={{ animationDelay: p.d }}>
              <div
                className="flex items-center gap-2 px-3.5 py-2 rounded-full border bg-surface-card cursor-default transition-all duration-200"
                style={{
                  borderColor: hovered === i ? "var(--color-ink)" : "var(--color-hairline)",
                  boxShadow: hovered === i ? "0 12px 32px -10px rgba(0,0,0,0.32)" : "0 6px 20px -8px rgba(0,0,0,0.15)",
                  transform: hovered === i ? "scale(1.06)" : "scale(1)",
                }}
              >
                {p.img ? <Image src={p.img} alt="" width={16} height={16} className="object-contain" /> : <span className="text-body">{p.ic}</span>}
                <span className="text-[12.5px] font-medium text-body whitespace-nowrap">{p.label}</span>
              </div>
            </div>
          </div>
        ))}

        {/* center cluster */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="relative w-40 h-40 sm:w-52 sm:h-52">
            <div className="absolute inset-0 rounded-full border border-dashed border-hairline-strong/60 ring-spin" />
            <div className="absolute inset-[16%] rounded-full border border-dashed border-hairline/70 ring-spin-rev" />
            <div className="absolute inset-[26%] rounded-full blur-2xl core-glow" style={{ background: "color-mix(in srgb, var(--color-gradient-lavender) 34%, transparent)" }} />
            <Provider className="left-1/2 -translate-x-1/2 -top-4" src="/images/gemini-icon.png" label="Gemini" />
            <Provider className="-left-3 bottom-4" src="/images/chat-gpt-icon.png" label="ChatGPT" />
            <Provider className="-right-3 bottom-4" src="/images/claude-icon.png" label="Claude" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <div className={`w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full bg-surface-card border shadow-[0_8px_30px_-8px_rgba(0,0,0,0.2)] flex items-center justify-center cognee-breathe transition-all duration-300 ${hovered !== null ? "border-ink scale-105" : "border-hairline"}`}>
                <Image src="/images/congee-icon.png" alt="Cognee" width={34} height={34} className="object-contain" />
              </div>
              <span className="mt-1.5 text-[12px] font-semibold">Cognee</span>
            </div>
          </div>
        </div>
      </div>
      {/* mobile source list */}
      <div className="sm:hidden mt-4 flex flex-wrap justify-center gap-2">
        {pills.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-hairline bg-surface-card text-[12px] font-medium text-body">
            {p.img ? <Image src={p.img} alt="" width={14} height={14} className="object-contain" /> : <span className="text-body">{p.ic}</span>}{p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Provider({ className, src, label }: { className: string; src: string; label: string }) {
  return (
    <div className={`absolute ${className} flex flex-col items-center source-float`}>
      <div className="w-10 h-10 rounded-full bg-surface-card border border-hairline shadow-sm flex items-center justify-center"><Image src={src} alt={label} width={20} height={20} className="object-contain" /></div>
      <span className="mt-1 text-[10px] font-medium text-muted">{label}</span>
    </div>
  );
}

function DecayBar({ label, value, strong }: { label: string; value: number; strong: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5"><span className="font-mono text-[12px] text-body">{label}</span><span className={`font-mono text-[12px] font-semibold ${strong ? "text-ink" : "text-muted-soft"}`}>{value.toFixed(2)}</span></div>
      <div className="h-2 rounded-full bg-surface-strong overflow-hidden"><div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${value * 100}%`, background: strong ? T.mint : T.rose }} /></div>
    </div>
  );
}

function GraphMini() {
  const nodes = [{ cx: 60, cy: 70, r: 10 }, { cx: 140, cy: 40, r: 7 }, { cx: 210, cy: 90, r: 13 }, { cx: 120, cy: 120, r: 6 }, { cx: 280, cy: 50, r: 8 }, { cx: 260, cy: 130, r: 6 }];
  const edges = [[0, 1], [0, 3], [1, 2], [2, 4], [2, 5], [1, 3]];
  return (
    <svg viewBox="0 0 340 170" className="mt-6 w-full max-w-md opacity-90" aria-hidden>
      {edges.map(([a, b], i) => (<line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy} stroke="var(--color-hairline-strong)" strokeWidth="1" />))}
      {nodes.map((n, i) => (<circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="var(--color-ink)" opacity={0.85} className="float-y" style={{ animationDelay: `${i * 0.4}s`, transformBox: "fill-box", transformOrigin: "center" }} />))}
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
      <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}><div className="overflow-hidden"><p className="px-5 sm:px-6 pb-6 text-[14px] text-body leading-relaxed">{a}</p></div></div>
    </div>
  );
}
