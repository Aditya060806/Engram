"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { useSession } from "next-auth/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import Reveal from "@/components/Reveal";

gsap.registerPlugin(useGSAP);

const REPO_URL = "https://github.com/Aditya060806/Engram";
const ACCENT = "linear-gradient(120deg, var(--color-gradient-lavender), var(--color-gradient-sky))";

/* ── Small building blocks ─────────────────────────────────────── */

const GradientText = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{ backgroundImage: ACCENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
  >
    {children}
  </span>
);

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-2 mb-5">
    <span className="h-px w-6" style={{ background: ACCENT }} />
    <span className="caption-upper text-[var(--color-muted)]">{children}</span>
  </div>
);

/* ── Data ──────────────────────────────────────────────────────── */

const LIFECYCLE = [
  {
    n: "01",
    op: "remember()",
    title: "Ingest & structure",
    body: "Point Engram at a repo, PDF, article, video, or chat export. Cognee compiles it into a graph of entities and relationships — not just another pile of embeddings.",
  },
  {
    n: "02",
    op: "recall()",
    title: "Ask across time",
    body: "Query in plain language. Engram routes between semantic search and deep graph traversal, then tells you what changed — not only what you first believed.",
  },
  {
    n: "03",
    op: "improve()",
    title: "Reconcile & reinforce",
    body: "Fresh evidence is checked against what you already know. Contradictions surface instantly, and your decisions reinforce the facts that win.",
  },
  {
    n: "04",
    op: "forget()",
    title: "Decay & prune",
    body: "Unreinforced facts lose confidence over time. Once they slip below the line, Engram forgets them — so what you recall stays sharp.",
  },
];

const FEATURES = [
  {
    title: "Reconciliation engine",
    body: "Every new belief is validated against your graph in under two seconds using schema-level contradiction checks.",
    span: "lg",
  },
  {
    title: "Time-aware decay",
    body: "Confidence scores fall continuously and stale nodes are pruned once they cross the threshold.",
    span: "sm",
  },
  {
    title: "3D knowledge graph",
    body: "A force-directed WebGL view of thousands of nodes with live provenance tracing and direct editing.",
    span: "sm",
  },
  {
    title: "Bring your own key",
    body: "Connect Groq, Gemini, or OpenAI. Keys are encrypted at rest and never touch the client.",
    span: "sm",
  },
  {
    title: "Five native sources",
    body: "GitHub repos, PDFs, ChatGPT and Claude exports, web articles, and YouTube transcripts — ingested natively.",
    span: "sm",
  },
  {
    title: "The Recap",
    body: "A morning-after digest of everything your memory learned, reconciled, and forgot while you were away.",
    span: "lg",
  },
];

const FAQS = [
  {
    q: "How is this different from plain RAG?",
    a: "RAG leans on static embeddings and happily returns stale matches. Engram compiles context into a deterministic graph and runs contradiction checks at ingestion, so conflicting facts get caught before they ever reach recall.",
  },
  {
    q: "What happens to a fact once it's contradicted?",
    a: "It's deactivated, its confidence drops to zero, and the decision is logged. You can replay the timeline to see exactly what changed and when.",
  },
  {
    q: "Which sources can I feed it?",
    a: "Five out of the box: GitHub repositories, PDFs, ChatGPT and Claude exports, web articles, and YouTube transcripts.",
  },
  {
    q: "Where does my data actually go?",
    a: "Only prompts reach your chosen LLM provider. Everything else — metadata, reconciliation logs, access rules — stays in your own database, and keys are encrypted at rest.",
  },
  {
    q: "Do I have to self-host?",
    a: "No. Run it fully local by default, or connect a hosted Cognee Cloud tenant for managed graph-vector memory. Operations fall back to local automatically.",
  },
];

/* ── Hero constellation — a living memory graph in pure SVG ─────── */

const NODES = [
  { id: 0, x: 300, y: 170, r: 26, core: true },
  { id: 1, x: 140, y: 90, r: 9 },
  { id: 2, x: 470, y: 90, r: 11 },
  { id: 3, x: 90, y: 230, r: 8 },
  { id: 4, x: 520, y: 240, r: 10 },
  { id: 5, x: 210, y: 300, r: 7 },
  { id: 6, x: 400, y: 300, r: 9 },
  { id: 7, x: 300, y: 40, r: 6 },
];
const EDGES = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [1, 7], [2, 4], [3, 5], [4, 6],
];

const NodeField = () => (
  <svg viewBox="0 0 600 340" className="w-full h-full" fill="none" aria-hidden>
    <defs>
      <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--color-gradient-lavender)" />
        <stop offset="100%" stopColor="var(--color-gradient-sky)" />
      </linearGradient>
      <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--color-gradient-lavender)" stopOpacity="0.9" />
        <stop offset="100%" stopColor="var(--color-gradient-sky)" stopOpacity="0.75" />
      </radialGradient>
    </defs>
    {EDGES.map(([a, b], i) => (
      <line
        key={i}
        x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y}
        stroke="url(#edgeGrad)" strokeWidth="1.25" strokeOpacity="0.4"
        strokeDasharray="4 6" className="source-line"
      />
    ))}
    {NODES.map((n) => (
      <g key={n.id} className={n.core ? "cognee-breathe" : "source-float"} style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${n.id * 0.4}s` }}>
        {n.core ? (
          <>
            <circle cx={n.x} cy={n.y} r={n.r + 14} fill="url(#coreGlow)" opacity="0.25" />
            <circle cx={n.x} cy={n.y} r={n.r} fill="url(#coreGlow)" />
          </>
        ) : (
          <circle cx={n.x} cy={n.y} r={n.r} fill="var(--color-surface-card)" stroke="url(#edgeGrad)" strokeWidth="1.5" />
        )}
      </g>
    ))}
  </svg>
);

/* ── Custom Engram product mockup (replaces old screenshots) ────── */

const GlowFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative rounded-2xl p-[1px] overflow-hidden" style={{ background: ACCENT }}>
    <div className="rounded-[15px] bg-[var(--color-surface-card)] overflow-hidden">{children}</div>
  </div>
);

const ResolveMockup = () => (
  <GlowFrame>
    <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-hairline)]">
      <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-gradient-rose)]/60" />
      <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-gradient-peach)]/60" />
      <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-gradient-mint)]/60" />
      <span className="ml-3 text-[11px] font-mono text-[var(--color-muted)]">engram · resolve</span>
      <span className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: "color-mix(in srgb, var(--color-gradient-peach) 15%, transparent)", color: "var(--color-gradient-peach)" }}>
        Conflict #341
      </span>
    </div>
    <div className="p-5">
      <p className="text-sm font-semibold text-[var(--color-ink)] mb-4">Database choice — which fact still holds?</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--color-hairline)] p-3.5 bg-[var(--color-surface-strong)]/40">
          <p className="caption-upper text-[10px] text-[var(--color-muted)] mb-2">Old belief · 0.12</p>
          <p className="text-sm font-medium text-[var(--color-body-strong)]">Postgres</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">project_spec.md · Oct 15</p>
          <div className="mt-3 h-1 rounded-full bg-[var(--color-hairline)] overflow-hidden">
            <div className="h-full w-[12%] rounded-full bg-[var(--color-muted-soft)]" />
          </div>
        </div>
        <div className="rounded-xl p-3.5" style={{ border: "1px solid color-mix(in srgb, var(--color-gradient-sky) 45%, transparent)", background: "color-mix(in srgb, var(--color-gradient-sky) 8%, transparent)" }}>
          <p className="caption-upper text-[10px] mb-2" style={{ color: "var(--color-gradient-sky)" }}>New evidence · 0.95</p>
          <p className="text-sm font-medium text-[var(--color-body-strong)]">Supabase</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">adr_v4.pdf · Nov 20</p>
          <div className="mt-3 h-1 rounded-full bg-[var(--color-hairline)] overflow-hidden">
            <div className="h-full w-[95%] rounded-full" style={{ background: ACCENT }} />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className="flex-1 text-xs font-medium py-2 rounded-lg border border-[var(--color-hairline)] text-[var(--color-muted)]">Keep old</button>
        <button className="flex-1 text-xs font-semibold py-2 rounded-lg text-[var(--color-on-primary)]" style={{ background: ACCENT }}>Keep new</button>
        <button className="flex-1 text-xs font-medium py-2 rounded-lg border border-[var(--color-hairline)] text-[var(--color-muted)]">Keep both</button>
      </div>
    </div>
  </GlowFrame>
);

/* ── FAQ accordion (CSS-only, new style) ───────────────────────── */

const FaqRow = ({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) => (
  <div className="border-b border-[var(--color-hairline)]">
    <button onClick={onToggle} className="w-full flex items-center justify-between gap-4 py-5 text-left group">
      <span className="text-[15px] md:text-base font-medium text-[var(--color-ink)]">{q}</span>
      <span
        className="shrink-0 grid place-items-center w-7 h-7 rounded-full border border-[var(--color-hairline)] text-[var(--color-muted)] transition-transform duration-300"
        style={{ transform: open ? "rotate(45deg)" : "none" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </span>
    </button>
    <div className="grid transition-all duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
      <div className="overflow-hidden">
        <p className="pb-5 text-sm text-[var(--color-body)] leading-relaxed max-w-2xl">{a}</p>
      </div>
    </div>
  </div>
);

/* ── Page ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const wrapRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  const [mounted, setMounted] = useState(false);
  const [entering, setEntering] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [stats, setStats] = useState<{ sources: number; entities: number; conflicts: number } | null>(null);

  const isDark = mounted && resolvedTheme === "dark";

  const enter = () => {
    setEntering(true);
    setTimeout(() => router.push(session ? "/graph" : "/login"), 450);
  };

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setMenuOpen(false);
    if (lenisRef.current) lenisRef.current.scrollTo(id, { duration: 1.3 });
    else document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Live metrics from the backend via the proxy
  useEffect(() => {
    (async () => {
      try {
        const [s, sc, rc] = await Promise.all([
          fetch("/api/proxy/sources"),
          fetch("/api/proxy/schema-inventory"),
          fetch("/api/proxy/reconciliation/events"),
        ]);
        let sources = 0, entities = 0, conflicts = 0;
        if (s.ok) { const j = await s.json(); sources = Array.isArray(j) ? j.length : 0; }
        if (sc.ok) { const j = await sc.json(); if (Array.isArray(j)) entities = j.reduce((a, c) => a + (c.count || 0), 0); }
        if (rc.ok) { const j = await rc.json(); if (Array.isArray(j)) conflicts = j.filter((e) => e.status === "pending" || e.status === "detected").length; }
        setStats({ sources, entities, conflicts });
      } catch { /* stats stay null → placeholder shown */ }
    })();
  }, []);

  // Smooth scroll + hero intro
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);

    document.documentElement.classList.remove("h-full");
    document.documentElement.classList.add("min-h-screen");
    document.body.classList.remove("h-full");
    document.body.classList.add("min-h-screen");

    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenisRef.current = lenis;
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.documentElement.classList.add("h-full");
      document.documentElement.classList.remove("min-h-screen");
      document.body.classList.add("h-full");
      document.body.classList.remove("min-h-screen");
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(".hero-in", { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(".hero-in", { y: 26, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.09, duration: 0.85, ease: "power3.out", delay: 0.05 });
  }, { scope: wrapRef });

  const metric = (v: number | undefined, fallback: string) =>
    stats ? v!.toLocaleString() : fallback;

  return (
    <div
      ref={wrapRef}
      className="relative min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] font-sans overflow-x-clip transition-opacity duration-500"
      style={{ opacity: entering ? 0 : 1 }}
    >
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

      {/* ══ NAV ══ */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "py-2" : "py-4"}`}>
        <nav className={`mx-auto max-w-6xl px-4 md:px-6`}>
          <div className={`flex items-center justify-between rounded-2xl px-4 md:px-5 h-14 transition-all duration-300 ${scrolled ? "bg-[var(--color-surface-card)]/80 backdrop-blur-xl border border-[var(--color-hairline)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]" : "border border-transparent"}`}>
            <a href="#top" onClick={(e) => scrollTo(e, "#top")} className="flex items-center gap-2 cursor-pointer">
              <Image src="/logo.png" alt="Engram" width={30} height={30} priority className="object-contain rounded-md" />
              <span className="text-[19px] font-semibold tracking-tight">Engram</span>
            </a>

            <div className="hidden md:flex items-center gap-7 text-[14px] text-[var(--color-body)]">
              <a href="#lifecycle" onClick={(e) => scrollTo(e, "#lifecycle")} className="hover:text-[var(--color-ink)] transition-colors">Lifecycle</a>
              <a href="#features" onClick={(e) => scrollTo(e, "#features")} className="hover:text-[var(--color-ink)] transition-colors">Features</a>
              <a href="#faq" onClick={(e) => scrollTo(e, "#faq")} className="hover:text-[var(--color-ink)] transition-colors">FAQ</a>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-label="Toggle theme"
                className="grid place-items-center w-9 h-9 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)] transition-colors cursor-pointer"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isDark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />}
                </svg>
              </button>
              <button onClick={enter} className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 h-9 rounded-lg text-[var(--color-on-primary)] cursor-pointer transition-transform hover:scale-[1.03]" style={{ background: ACCENT }}>
                {session ? "Open app" : "Launch"}
              </button>
              <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden grid place-items-center w-9 h-9 rounded-lg text-[var(--color-ink)]" aria-label="Menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={menuOpen ? "M6 6l12 12M6 18L18 6" : "M4 7h16M4 12h16M4 17h16"} /></svg>
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="md:hidden mt-2 rounded-2xl bg-[var(--color-surface-card)] border border-[var(--color-hairline)] p-4 flex flex-col gap-3 text-[15px]">
              <a href="#lifecycle" onClick={(e) => scrollTo(e, "#lifecycle")} className="text-[var(--color-body)]">Lifecycle</a>
              <a href="#features" onClick={(e) => scrollTo(e, "#features")} className="text-[var(--color-body)]">Features</a>
              <a href="#faq" onClick={(e) => scrollTo(e, "#faq")} className="text-[var(--color-body)]">FAQ</a>
              <button onClick={enter} className="mt-1 text-[14px] font-semibold py-2.5 rounded-lg text-[var(--color-on-primary)]" style={{ background: ACCENT }}>{session ? "Open app" : "Launch Engram"}</button>
            </div>
          )}
        </nav>
      </header>

      {/* ══ HERO ══ */}
      <section id="top" className="relative pt-36 md:pt-44 pb-20 px-4 md:px-6 overflow-hidden">
        {/* ambient glow */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-24 -translate-x-1/2 w-[720px] h-[420px] rounded-full blur-[120px] opacity-[0.18]" style={{ background: ACCENT }} />
        </div>

        <div className="mx-auto max-w-5xl text-center">
          <div className="hero-in inline-flex items-center gap-2 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-card)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-body)] mb-7">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
            Memory lifecycle · powered by Cognee
          </div>

          <h1 className="hero-in display-mega mb-6">
            Give your AI a memory<br className="hidden sm:block" /> that <GradientText>edits itself.</GradientText>
          </h1>

          <p className="hero-in mx-auto max-w-2xl text-[17px] md:text-lg text-[var(--color-body)] leading-relaxed mb-9">
            Engram folds your repos, docs, and conversations into a living knowledge graph — catching contradictions the moment they appear, letting stale facts decay, and keeping only what still holds true.
          </p>

          <div className="hero-in flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <button onClick={enter} className="group inline-flex items-center gap-2 px-6 h-12 rounded-xl text-[15px] font-semibold text-[var(--color-on-primary)] cursor-pointer transition-transform hover:scale-[1.03]" style={{ background: ACCENT }}>
              {session ? "Open your graph" : "Launch Engram"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 h-12 rounded-xl text-[15px] font-medium border border-[var(--color-hairline)] bg-[var(--color-surface-card)] text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.4.6.1.83-.26.83-.58v-2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.76-1.34-1.76-1.08-.75.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.8 1.3 3.49.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" /></svg>
              View source
            </a>
          </div>

          {/* live memory graph visual */}
          <div className="hero-in relative mx-auto max-w-3xl rounded-3xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)]/60 backdrop-blur-sm p-6 md:p-10">
            <div className="aspect-[600/340] w-full"><NodeField /></div>
            <div className="absolute left-1/2 -bottom-px -translate-x-1/2 h-px w-2/3" style={{ background: ACCENT, opacity: 0.5 }} />
          </div>
        </div>
      </section>

      {/* ══ LIVE METRICS ══ */}
      <section className="px-4 md:px-6 pb-24">
        <div className="mx-auto max-w-5xl grid grid-cols-3 divide-x divide-[var(--color-hairline)] rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] py-8">
          {[
            { v: metric(stats?.sources, "—"), l: "Sources remembered" },
            { v: metric(stats?.entities, "—"), l: "Entities mapped" },
            { v: metric(stats?.conflicts, "—"), l: "Conflicts flagged" },
          ].map((m, i) => (
            <div key={i} className="text-center px-2">
              <div className="display-md tabular-nums"><GradientText>{m.v}</GradientText></div>
              <div className="mt-1 text-[12px] md:text-[13px] text-[var(--color-muted)]">{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ THE DRIFT PROBLEM ══ */}
      <section className="px-4 md:px-6 py-24 border-t border-[var(--color-hairline)]">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <Kicker>The drift problem</Kicker>
            <h2 className="display-lg mb-4">Append-only memory rots.</h2>
            <p className="text-[var(--color-body)] leading-relaxed text-[16px]">
              Most tools just pile new text on top of old. Credentials rotate, stacks change, decisions get reversed — and the model keeps citing whichever version it retrieves first. Confidence stays high while accuracy quietly collapses.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5 mt-12">
            <Reveal className="rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] p-7">
              <p className="caption-upper text-[var(--color-muted)] mb-5">Typical memory tools</p>
              <ul className="space-y-3.5">
                {["Store everything, forever", "Never check for contradictions", "Stale facts resurface with full confidence"].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-[var(--color-body)]">
                    <span className="mt-1.5 shrink-0 w-4 h-4 rounded-full grid place-items-center border border-[var(--color-hairline-strong)] text-[var(--color-muted-soft)]">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={100} className="relative rounded-2xl p-[1px] overflow-hidden" >
              <div className="absolute inset-0" style={{ background: ACCENT, opacity: 0.5 }} />
              <div className="relative rounded-[15px] bg-[var(--color-surface-card)] p-7 h-full">
                <p className="caption-upper mb-5" style={{ color: "var(--color-gradient-lavender)" }}>With Engram</p>
                <ul className="space-y-3.5">
                  {["Detects contradictions at ingestion", "Scores confidence continuously over time", "Forgets what no longer deserves trust"].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[15px] text-[var(--color-body-strong)]">
                      <span className="mt-1 shrink-0 w-4 h-4 rounded-full grid place-items-center text-[var(--color-on-primary)]" style={{ background: ACCENT }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
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

      {/* ══ LIFECYCLE ══ */}
      <section id="lifecycle" className="px-4 md:px-6 py-24 border-t border-[var(--color-hairline)]">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <Kicker>The lifecycle</Kicker>
            <h2 className="display-lg mb-4">Four operations. Total recall.</h2>
            <p className="text-[var(--color-body)] leading-relaxed">
              <span className="font-mono text-[13px]">remember</span> · <span className="font-mono text-[13px]">recall</span> · <span className="font-mono text-[13px]">improve</span> · <span className="font-mono text-[13px]">forget</span> — Cognee&apos;s hybrid graph-vector memory, wired end to end.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-5">
            {LIFECYCLE.map((s, i) => (
              <Reveal key={s.op} delay={i * 80} className="group relative rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] p-7 hover:border-[var(--color-hairline-strong)] transition-colors">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-[40px] font-semibold leading-none" style={{ WebkitTextStroke: "1px var(--color-hairline-strong)", color: "transparent" }}>{s.n}</span>
                  <code className="text-[13px] font-mono px-2.5 py-1 rounded-md bg-[var(--color-surface-strong)]" style={{ color: "var(--color-gradient-sky)" }}>{s.op}</code>
                </div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-[14px] text-[var(--color-body)] leading-relaxed">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ MOCKUP + COPY ══ */}
      <section className="px-4 md:px-6 py-24 border-t border-[var(--color-hairline)]">
        <div className="mx-auto max-w-5xl grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <Kicker>Reconciliation, in the open</Kicker>
            <h2 className="display-md mb-4">You decide what still counts.</h2>
            <p className="text-[var(--color-body)] leading-relaxed mb-6">
              When new evidence collides with something you already believe, Engram surfaces both sides with their confidence scores and provenance. Keep the new fact, keep the old, or keep both as alternatives — every choice is logged to the timeline.
            </p>
            <button onClick={enter} className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--color-gradient-sky)" }}>
              Try it live
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </Reveal>
          <Reveal delay={120}><ResolveMockup /></Reveal>
        </div>
      </section>

      {/* ══ FEATURES BENTO ══ */}
      <section id="features" className="px-4 md:px-6 py-24 border-t border-[var(--color-hairline)]">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl mb-12">
            <Kicker>Under the hood</Kicker>
            <h2 className="display-lg">Everything a self-maintaining memory needs.</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={(i % 3) * 80}
                className={`rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] p-7 ${f.span === "lg" ? "md:col-span-2" : ""}`}
              >
                <div className="w-10 h-10 rounded-xl mb-5 grid place-items-center" style={{ background: "color-mix(in srgb, var(--color-gradient-lavender) 14%, transparent)" }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ACCENT }} />
                </div>
                <h3 className="text-[17px] font-semibold mb-2">{f.title}</h3>
                <p className="text-[14px] text-[var(--color-body)] leading-relaxed">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="px-4 md:px-6 py-24 border-t border-[var(--color-hairline)]">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-10">
            <Kicker>Questions</Kicker>
            <h2 className="display-lg">Good to know.</h2>
          </Reveal>
          <div>
            {FAQS.map((f, i) => (
              <FaqRow key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="px-4 md:px-6 py-24 border-t border-[var(--color-hairline)]">
        <Reveal className="relative mx-auto max-w-5xl rounded-3xl overflow-hidden p-[1px]" >
          <div className="absolute inset-0" style={{ background: ACCENT, opacity: 0.6 }} />
          <div className="relative rounded-[23px] bg-[var(--color-surface-card)] px-8 py-16 md:py-20 text-center">
            <div className="pointer-events-none absolute inset-0 -z-0">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[500px] h-[240px] rounded-full blur-[100px] opacity-[0.15]" style={{ background: ACCENT }} />
            </div>
            <h2 className="relative display-lg mb-4">Ready to give your memory a spine?</h2>
            <p className="relative text-[var(--color-body)] max-w-xl mx-auto mb-8">
              Sign in with GitHub or Google, bring your own key, and start building a memory that keeps itself honest.
            </p>
            <button onClick={enter} className="relative inline-flex items-center gap-2 px-7 h-12 rounded-xl text-[15px] font-semibold text-[var(--color-on-primary)] cursor-pointer transition-transform hover:scale-[1.03]" style={{ background: ACCENT }}>
              {session ? "Open your graph" : "Launch Engram"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="px-4 md:px-6 py-12 border-t border-[var(--color-hairline)]">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Engram" width={26} height={26} className="object-contain rounded-md" />
            <span className="text-[16px] font-semibold tracking-tight">Engram</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-[var(--color-muted)]">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">GitHub</a>
            <a href={`${REPO_URL}/blob/main/README.md`} target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Docs</a>
            <a href="https://cognee.ai" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Powered by Cognee</a>
          </div>
          <p className="text-[12px] text-[var(--color-muted)]">
            Built by <a href="https://github.com/Aditya060806" target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4 hover:text-[var(--color-ink)]">Aditya Pandey</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
