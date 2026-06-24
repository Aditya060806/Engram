"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { useSession, signOut } from "next-auth/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Reveal from "@/components/Reveal";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const SparkleIcon = ({ className = "w-4 h-4 text-[var(--color-muted)]/40" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" />
  </svg>
);

const SectionLabel = ({ text, color = "bg-[#f4c5a8]" }: { text: string; color?: string }) => (
  <div className="flex items-center gap-2 mb-6 justify-start">
    <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
    <span className="caption-uppercase tracking-[0.08em] text-xs font-semibold text-[var(--color-muted)]">{text}</span>
  </div>
);

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "localhost:3000";
const BrowserChrome = ({ children, className = "", url = BASE_URL }: { children: React.ReactNode; className?: string; url?: string }) => (
  <div className={`w-full bg-[var(--color-canvas)] rounded-2xl border border-[var(--color-hairline)] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden ${className}`}>
    <div className="bg-[var(--color-surface-strong)] px-4 py-2.5 border-b border-[var(--color-hairline)] flex items-center gap-1.5 select-none pointer-events-none">
      <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/40" />
      <div className="w-2.5 h-2.5 rounded-full bg-[#eab308]/40" />
      <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/40" />
      <div className="h-4.5 bg-[var(--color-surface-card)]/60 border border-[var(--color-hairline)] rounded-md text-[9px] text-[var(--color-muted)] px-4 ml-4 flex items-center flex-1 max-w-[240px] font-mono tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
        {url}
      </div>
    </div>
    <div className="relative bg-[var(--color-surface-card)] w-full">
      {children}
    </div>
  </div>
);

const FAQItem = ({ question, answer, isOpen, onClick }: { question: string; answer: string; isOpen: boolean; onClick: () => void }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      if (isOpen) {
        gsap.to(contentRef.current, { height: "auto", opacity: 1, duration: 0.35, ease: "power2.out" });
      } else {
        gsap.to(contentRef.current, { height: 0, opacity: 0, duration: 0.3, ease: "power2.in" });
      }
    }
  }, [isOpen]);

  return (
    <div className="border border-[var(--color-hairline)] rounded-2xl bg-[var(--color-surface-card)] overflow-hidden transition-all duration-300">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-6 text-left font-medium text-[var(--color-ink)] hover:text-[var(--color-ink)] transition-colors focus:outline-none"
      >
        <span className="text-base font-medium">{question}</span>
        <svg
          className={`w-5 h-5 text-[var(--color-muted)] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <div
        ref={contentRef}
        style={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className="px-6 pb-6 text-sm text-[var(--color-body)] leading-relaxed border-t border-[var(--color-hairline)]/50 pt-4">
          {answer}
        </div>
      </div>
    </div>
  );
};

const faqs = [
  {
    q: "Is this just RAG with extra steps?",
    a: "No. Similarity-based RAG has a 30%+ hallucination rate on stale data because it relies on static text embeddings. Engram uses Cognee to compile context into a deterministic network graph, running schema checks in <2s at ingestion to detect factual contradictions before they enter long-term storage."
  },
  {
    q: "What happens to old beliefs when they're superseded?",
    a: "Older beliefs are deactivated and marked as deprecated, dropping their confidence score to 0.0. All reconciliation decisions are logged in SQLite for running temporal graph diffs (e.g., 'what changed since last week')."
  },
  {
    q: "Does this work with my specific tools?",
    a: "Yes. Direct integration is supported for 5 sources: GitHub API, local PDFs, ChatGPT/Claude conversation exports, Web URLs, and YouTube transcript downloads."
  },
  {
    q: "Is my data sent to third-party services?",
    a: "Only to your configured LLM provider. Engram runs its metadata reconciliation pipelines using Google Gemini or Groq API wrappers based on your local .env configuration. All other metadata, reconciliation history logs, and access control lists are stored entirely locally in a lightweight SQLite database file."
  },
  {
    q: "Open source or hosted?",
    a: "Both. Engram is 100% open-source and runs entirely local by default — or it connects to a hosted Cognee Cloud tenant (via the tenant REST API) for managed, graph-vector memory with zero ops overhead. remember, recall, and the graph all route to the cloud when configured, with automatic local fallback."
  }
];

// The four Cognee lifecycle operations — each is load-bearing in Engram.
const MEMORY_OPS: {
  name: string;
  alias?: string;
  desc: string;
  tint: string;
  icon: React.ReactNode;
}[] = [
  {
    name: "remember()",
    tint: "#5e6ad2",
    desc: "Ingest text, files, repos, and URLs and permanently structure them into the knowledge graph.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a2 2 0 0 0 4 0" />
        <path d="M12 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a2 2 0 0 1-4 0" />
      </svg>
    ),
  },
  {
    name: "recall()",
    tint: "#16a34a",
    desc: "Query memory — Cognee routes automatically between semantic similarity and deep graph traversals.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    name: "improve()",
    alias: "memify",
    tint: "#8b5cf6",
    desc: "Run post-ingestion enrichment, prune stale nodes, and adapt weights based on your feedback.",
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
    name: "forget()",
    tint: "#ef4444",
    desc: "Surgically prune stale nodes or delete whole datasets when they no longer deserve to be remembered.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [entering, setEntering] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  // Real live metrics fetched from SQLite — null means "not yet loaded"
  const [liveStats, setLiveStats] = useState<{ sourcesCount: number; entitiesCount: number; conflictsCount: number } | null>(null);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    if (lenisRef.current) {
      lenisRef.current.scrollTo(targetId, {
        duration: 1.5,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
      });
    } else {
      const target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    }
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Fetch live stats from the proxy API on load (Part 3.2)
  useEffect(() => {
    async function fetchStats() {
      try {
        const [sourcesRes, schemaRes, reconcileRes] = await Promise.all([
          fetch("/api/proxy/sources"),
          fetch("/api/proxy/schema-inventory"),
          fetch("/api/proxy/reconciliation/events")
        ]);
        
        let sourcesCount = 0;
        let entitiesCount = 0;
        let conflictsCount = 0;

        if (sourcesRes.ok) {
          const sources = await sourcesRes.json();
          sourcesCount = Array.isArray(sources) ? sources.length : 0;
        }
        if (schemaRes.ok) {
          const schema = await schemaRes.json();
          if (Array.isArray(schema)) {
            entitiesCount = schema.reduce((acc, curr) => acc + (curr.count || 0), 0);
          }
        }
        if (reconcileRes.ok) {
          const events = await reconcileRes.json();
          if (Array.isArray(events)) {
            conflictsCount = events.filter(e => e.status === "pending" || e.status === "detected").length;
          }
        }

        setLiveStats({
          sourcesCount: sourcesCount,
          entitiesCount: entitiesCount,
          conflictsCount: conflictsCount
        });
      } catch (err) {
        console.error("Failed to load live stats:", err);
      }
    }
    fetchStats();
  }, []);

  // Parallax cursor tracking on hero background orbs (Part 3)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const xPos = (clientX / window.innerWidth - 0.5) * 30;
      const yPos = (clientY / window.innerHeight - 0.5) * 30;
      document.querySelectorAll<HTMLElement>('.hero-orb').forEach((orb) => {
        orb.style.transform = `translate(${xPos}px, ${yPos}px)`;
        orb.style.transition = 'transform 1.5s cubic-bezier(0.22, 1, 0.36, 1)';
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);

    // Save original classes to restore them when unmounting
    const htmlHasHFull = document.documentElement.classList.contains("h-full");
    const bodyHasHFull = document.body.classList.contains("h-full");

    // Adjust classes for landing page scrolling
    document.documentElement.classList.remove("h-full");
    document.documentElement.classList.add("min-h-screen");
    document.body.classList.remove("h-full");
    document.body.classList.add("min-h-screen");

    // Initialize Lenis Smooth Scrolling
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    // Synchronize Lenis with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);
    
    const tickerUpdate = (time: number) => {
      lenis.raf(time * 1000);
    };
    
    gsap.ticker.add(tickerUpdate);
    gsap.ticker.lagSmoothing(0);

    // Refresh ScrollTrigger after DOM load/hydration layout shifts
    const timer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 100);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      // Restore original classes for other pages (like dashboard/graph)
      if (htmlHasHFull) {
        document.documentElement.classList.add("h-full");
        document.documentElement.classList.remove("min-h-screen");
      }
      if (bodyHasHFull) {
        document.body.classList.add("h-full");
        document.body.classList.remove("min-h-screen");
      }
      
      clearTimeout(timer);
      gsap.ticker.remove(tickerUpdate);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add({
      isDesktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
      isMobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)"
    }, (context) => {
      const { isDesktop } = context.conditions as Record<string, boolean>;

      /* ── Hero entrance ── */
      gsap.set(".fade-up", { y: 24, opacity: 0 });
      gsap.set(".scroll-cue", { y: 0, opacity: 0 });

      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .to(".fade-up", { y: 0, opacity: 1, stagger: 0.1, duration: 0.9, delay: 0.1 })
        .to(".scroll-cue", { opacity: 0.6, duration: 0.5 }, "-=0.3");

      // Hide scroll cue on scroll
      gsap.to(".scroll-cue", {
        opacity: 0,
        y: -10,
        scrollTrigger: {
          trigger: "#hero",
          start: "top top",
          end: "60px top",
          scrub: true
        }
      });

      /* ── Section 3: Scattered Source Cards ── */
      gsap.from(".source-card", {
        opacity: 0,
        scale: 0.8,
        x: (i) => [60, -60, 40, -40, 50, -50, 20][i % 7],
        y: (i) => [40, 60, -30, 50, -40, 30, -20][i % 7],
        stagger: 0.05,
        scrollTrigger: {
          trigger: "#section-problem",
          start: "top 80%",
          end: "bottom 70%",
          scrub: 1
        }
      });

      const ingestTl = gsap.timeline({
        scrollTrigger: {
          trigger: "#section-ingest",
          pin: isDesktop,
          start: isDesktop ? "top top" : "top 95%",
          end: isDesktop ? "+=1800" : "bottom 20%",
          scrub: isDesktop ? 0.5 : false,
          toggleActions: isDesktop ? "none" : "play none none reverse",
          anticipatePin: isDesktop ? 1 : 0
        }
      });

      // Scrub the spiral path drawing
      ingestTl.fromTo("#spiral-path", 
        { strokeDashoffset: 2000 }, 
        { strokeDashoffset: 0, duration: 2, ease: "none" }
      );

      // Scrub stepper dots lighting up along path progress
      const stepTimes = [0.2, 0.7, 1.3, 1.8];
      const steps = [1, 2, 3, 4];
      steps.forEach((step, idx) => {
        const time = stepTimes[idx];
        ingestTl.to(`.pipeline-step-${step}`, {
          borderColor: "var(--color-ink)",
          backgroundColor: "var(--color-ink)",
          color: "var(--color-canvas)",
          duration: 0.2
        }, time)
        .to(`.pipeline-label-${step}`, {
          color: "var(--color-ink)",
          fontWeight: 600,
          opacity: 1,
          duration: 0.2
        }, time)
        .to(`.pipeline-desc-${step}`, {
          opacity: 1,
          duration: 0.2
        }, time);
      });

      const resolveTl = gsap.timeline({
        scrollTrigger: {
          trigger: "#section-resolve",
          pin: isDesktop,
          start: isDesktop ? "top top" : "top 95%",
          end: isDesktop ? "+=2200" : "bottom 20%",
          scrub: isDesktop ? 0.5 : false,
          toggleActions: isDesktop ? "none" : "play none none reverse",
          anticipatePin: isDesktop ? 1 : 0
        }
      });

      // 1. Gold droplet fades in
      resolveTl.fromTo("#droplet-gold", { opacity: 0, scale: 0.6 }, { opacity: 0.8, scale: 1, duration: isDesktop ? 0.5 : 0.2 });
      resolveTl.fromTo("#droplet-gold-label", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: isDesktop ? 0.3 : 0.15 }, "-=0.2");

      // 2. Smoke droplet slides in and fuses
      resolveTl.fromTo("#droplet-smoke", 
        { opacity: 0, scale: 0.6, x: 100 }, 
        { opacity: 0.8, scale: 1, x: 0, duration: isDesktop ? 0.7 : 0.3, ease: "power2.out" }
      );
      resolveTl.fromTo("#droplet-smoke-label", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: isDesktop ? 0.3 : 0.15 }, "-=0.3");

      // 3. Meniscus flash pulse at overlap
      resolveTl.fromTo("#droplet-flash", { opacity: 0 }, { opacity: 1, duration: isDesktop ? 0.15 : 0.1 })
               .to("#droplet-flash", { opacity: 0, duration: isDesktop ? 0.25 : 0.15 });
      resolveTl.fromTo("#conflict-badge", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: isDesktop ? 0.2 : 0.1 }, "-=0.3");

      // 4. Compare UI card fades in on left
      resolveTl.fromTo("#compare-ui-card", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: isDesktop ? 0.5 : 0.25 }, isDesktop ? undefined : 0.1);
      
      // Pulse Keep New button
      resolveTl.to("#btn-keep-new", { scale: 1.05, boxShadow: "0 0 12px rgba(41,37,36,0.15)", duration: isDesktop ? 0.2 : 0.1 })
               .to("#btn-keep-new", { scale: 1, boxShadow: "none", duration: isDesktop ? 0.2 : 0.1 });

      // 5. Diff details reveal
      resolveTl.fromTo("#diff-card", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: isDesktop ? 0.5 : 0.25 }, isDesktop ? undefined : 0.2);

      // 6. Screenshot slide-in
      resolveTl.fromTo("#resolve-screenshot-wrapper", 
        { opacity: 0, y: 40, scale: 0.95 }, 
        { opacity: 1, y: 0, scale: 1, duration: isDesktop ? 0.6 : 0.3, ease: "power2.out" }, isDesktop ? undefined : 0.3
      );

      const decayTl = gsap.timeline({
        scrollTrigger: {
          trigger: "#section-decay",
          start: isDesktop ? "top 75%" : "top 95%",
          end: "bottom 75%",
          scrub: isDesktop ? 1 : false,
          toggleActions: isDesktop ? "none" : "play none none reverse"
        }
      });

      // Animate confidence scores and bars
      decayTl.to("#decay-bar-postgres", { width: "12%", duration: 1.2 })
             .to("#decay-score-postgres", { 
               innerText: "0.12", 
               snap: { innerText: 1 }, 
               duration: 1.2 
             }, 0)
             .to("#decay-bar-supabase", { width: "95%", duration: 1.2 }, 0)
             .to("#decay-score-supabase", { 
               innerText: "0.95", 
               snap: { innerText: 1 }, 
               duration: 1.2 
             }, 0);

    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      // Accessibility fallback: simple fades, no scroll locking/scrubbing
      gsap.set(".fade-up", { opacity: 1, y: 0 });
      gsap.set(".source-card", { opacity: 1, scale: 1, x: 0, y: 0 });
      gsap.set("#spiral-path", { strokeDashoffset: 0 });
      gsap.set(".pipeline-step-1, .pipeline-step-2, .pipeline-step-3, .pipeline-step-4", {
        borderColor: "var(--color-ink)",
        backgroundColor: "var(--color-ink)",
        color: "var(--color-canvas)"
      });
      gsap.set(".pipeline-label-1, .pipeline-label-2, .pipeline-label-3, .pipeline-label-4", { opacity: 1 });
      gsap.set(".pipeline-desc-1, .pipeline-desc-2, .pipeline-desc-3, .pipeline-desc-4", { opacity: 1 });
      gsap.set("#droplet-gold, #droplet-smoke, #compare-ui-card, #diff-card, #resolve-screenshot-wrapper", { opacity: 0.9, scale: 1, x: 0 });
      gsap.set("#decay-bar-postgres", { width: "12%" });
      gsap.set("#decay-bar-supabase", { width: "95%" });
    });
  }, { scope: wrapRef });

  const enter = () => {
    setEntering(true);
    setTimeout(() => router.push(session ? "/graph" : "/login"), 500);
  };



  return (
    <div ref={wrapRef} className="bg-[var(--color-canvas)] text-[var(--color-ink)] relative min-h-screen selection:bg-[#a8c8e8]/40 overflow-x-clip font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Engram",
            "applicationCategory": "ProductivityApplication",
            "operatingSystem": "Web",
            "description": "A self-organizing personal knowledge graph built on Cognee's memory lifecycle.",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
          }),
        }}
      />
      
      {/* ═══════ TOP FLOATING NAVIGATION ═══════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 ${
        scrolled ? "bg-[var(--color-canvas)]/90 backdrop-blur-md border-b border-[var(--color-hairline)] shadow-[0_4px_16px_rgba(0,0,0,0.02)]" : "bg-transparent border-b border-transparent"
      }`}>
        <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
            <a href="#hero" onClick={(e) => handleNavClick(e, "#hero")} className="flex items-center gap-2 cursor-pointer" aria-label="Scroll to top">
            <Image
              src="/logo.png"
              alt="Engram"
              width={32}
              height={32}
              priority
              className="object-contain rounded-md"
            />
            <span className="text-[20px] font-semibold tracking-tight text-[var(--color-ink)]">Engram</span>
          </a>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            {session && (
              <>
                <a href="#section-ingest" onClick={(e) => handleNavClick(e, "#section-ingest")} className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">How it works</a>
                <a href="#section-lifecycle" onClick={(e) => handleNavClick(e, "#section-lifecycle")} className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">Lifecycle</a>
                <a href="#section-resolve" onClick={(e) => handleNavClick(e, "#section-resolve")} className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">Reconciliation</a>
                <a href="#section-decay" onClick={(e) => handleNavClick(e, "#section-decay")} className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">Memory Health</a>
                <a href="#section-insights" onClick={(e) => handleNavClick(e, "#section-insights")} className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">Insights</a>
              </>
            )}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">GitHub</a>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)] transition-all duration-200 cursor-pointer"
              title={mounted ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode` : "Switch theme"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mounted && resolvedTheme === "dark" ? (
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
                ) : mounted && resolvedTheme !== "dark" ? (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                ) : null}
              </svg>
            </button>
            {session ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button onClick={() => setShowUserMenu(!showUserMenu)}
                    className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[13px] font-semibold flex items-center justify-center hover:bg-[var(--color-primary)]/20 transition-colors cursor-pointer"
                    title="Account">
                    {session.user?.name?.charAt(0) || "U"}
                  </button>
                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 z-50 w-36 py-1 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] shadow-lg">
                        <button onClick={() => { signOut(); setShowUserMenu(false); }}
                          className="w-full px-4 py-2 text-left text-[13px] font-medium text-[var(--color-body)] hover:bg-[var(--color-surface-strong)] transition-colors cursor-pointer">
                          Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <a href="/settings" className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors">Sign In</a>
            )}
          </div>

          {/* Mobile Menu Hamburger */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden flex items-center text-[var(--color-body-strong)] focus:outline-none">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu Panel */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-[var(--color-canvas)] border-b border-[var(--color-hairline)] px-6 py-6 space-y-4 flex flex-col items-start animate-fade-in">
            {session && (
              <>
                <a href="#section-ingest" onClick={(e) => handleNavClick(e, "#section-ingest")} className="text-[15px] font-medium text-[var(--color-body)] w-full py-1">How it works</a>
                <a href="#section-lifecycle" onClick={(e) => handleNavClick(e, "#section-lifecycle")} className="text-[15px] font-medium text-[var(--color-body)] w-full py-1">Lifecycle</a>
                <a href="#section-resolve" onClick={(e) => handleNavClick(e, "#section-resolve")} className="text-[15px] font-medium text-[var(--color-body)] w-full py-1">Reconciliation</a>
                <a href="#section-decay" onClick={(e) => handleNavClick(e, "#section-decay")} className="text-[15px] font-medium text-[var(--color-body)] w-full py-1">Memory Health</a>
                <a href="#section-insights" onClick={(e) => handleNavClick(e, "#section-insights")} className="text-[15px] font-medium text-[var(--color-body)] w-full py-1">Insights</a>
              </>
            )}
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" onClick={() => setIsMobileMenuOpen(false)} className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors w-full py-1">GitHub</a>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors w-full py-1 cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mounted && resolvedTheme === "dark" ? (
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
                ) : mounted && resolvedTheme !== "dark" ? (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                ) : null}
              </svg>
              <span>{mounted ? (resolvedTheme === "dark" ? "Light mode" : "Dark mode") : ""}</span>
            </button>
            {session ? (
              <div className="flex items-center justify-between w-full">
                <button onClick={() => signOut()}
                  className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors cursor-pointer">
                  <span className="w-7 h-7 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[11px] font-semibold flex items-center justify-center">
                    {session.user?.name?.charAt(0) || "U"}
                  </span>
                  Sign out
                </button>
              </div>
            ) : (
              <a href="/settings" className="text-[15px] font-medium text-[var(--color-body)] hover:text-[var(--color-ink)] transition-colors w-full py-1">Sign In</a>
            )}
          </div>
        )}
      </nav>

      {/* ═══════ 2 · HERO ═══════ */}
      <section id="hero" className="relative z-10 w-full min-h-screen flex items-center justify-center pt-28 pb-20 overflow-hidden">
        {/* Atmospheric gradient orbs — restored per Part 3 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
          <div className="hero-orb absolute top-[5%] left-[15%] w-[420px] h-[420px] rounded-full opacity-[0.18] blur-[100px]" style={{ background: 'radial-gradient(circle, var(--color-gradient-mint) 0%, transparent 70%)' }} />
          <div className="hero-orb absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full opacity-[0.14] blur-[120px]" style={{ background: 'radial-gradient(circle, var(--color-gradient-lavender) 0%, transparent 70%)' }} />
          <div className="hero-orb absolute top-[50%] left-[55%] w-[350px] h-[350px] rounded-full opacity-[0.10] blur-[90px]" style={{ background: 'radial-gradient(circle, var(--color-gradient-sky) 0%, transparent 70%)' }} />
        </div>

        <div className="max-w-[1200px] mx-auto px-6 w-full grid grid-cols-1 md:grid-cols-12 gap-16 items-center relative z-10">
          
          <div className="flex flex-col items-center text-center md:items-start md:text-left md:col-span-5 relative z-10 w-full">
            {/* Live Stats Pill — only shown when real data has loaded; never fabricated */}
            {liveStats && (liveStats.sourcesCount > 0 || liveStats.entitiesCount > 0) && (
              <div className="fade-up flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-[var(--color-surface-strong)]/40 backdrop-blur-md border border-[var(--color-hairline)]/60 text-[11px] font-mono text-[var(--color-ink)] shadow-[0_4px_16px_rgba(0,0,0,0.04)] select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <span className="font-semibold tracking-tight">LIVE CORE:</span>
                <span className="text-[var(--color-muted)]">{liveStats.sourcesCount} sources</span>
                <span className="text-[var(--color-hairline-strong)]">•</span>
                <span className="text-[var(--color-muted)]">{liveStats.entitiesCount} entities</span>
                {liveStats.conflictsCount > 0 && (
                  <>
                    <span className="text-[var(--color-hairline-strong)]">•</span>
                    <span className="text-[var(--color-semantic-error)] font-bold">{liveStats.conflictsCount} conflicts</span>
                  </>
                )}
              </div>
            )}

            <h1 className="fade-up display-xl text-[var(--color-ink)] mb-8 leading-[1.08] tracking-[-0.96px]">
              Your AI forgot last night.<br />Engram never does.
            </h1>

            <p className="fade-up text-[var(--color-body)] text-sm md:text-base leading-relaxed max-w-xl mb-8 tracking-[0.16px]">
              Every LLM call starts from zero — it loses the plot, drops the context, and
              confidently repeats stale facts. Engram is the memory layer that remembers across
              infinite sessions: it ingests your notes, repos, PDFs, and chats, catches
              contradictions the instant they appear, and forgets only what has stopped mattering.
            </p>

            <div className="fade-up flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 w-full sm:w-auto">
              <button onClick={enter} disabled={entering}
                className="group relative px-6 py-3.5 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[15px] font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 cursor-pointer disabled:opacity-50 w-full sm:w-auto text-center justify-center flex items-center gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.16)] overflow-hidden">
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <span className="relative z-10">{entering ? "Opening…" : "Open the App"}</span>
                {!entering && (
                  <svg className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                )}
              </button>
              <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer"
                className="px-6 py-3.5 rounded-full bg-[var(--color-surface-card)]/50 backdrop-blur-md border border-[var(--color-hairline)] text-[15px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-strong)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 cursor-pointer w-full sm:w-auto text-center justify-center flex items-center gap-2 shadow-sm">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                View on GitHub
              </a>
            </div>
          </div>

          {/* Hero: Real product screenshot in browser frame — per Part 2 */}
          <div className="fade-up md:col-span-7 hidden md:block w-full relative z-10 self-center">
            <BrowserChrome url={`${BASE_URL}/resolve`} className="shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
              <Image
                src="/images/resolve_screenshot.jpg"
                alt="Engram Resolve — conflict reconciliation screen"
                width={1200}
                height={675}
                className="w-full h-auto object-cover"
                priority
                unoptimized
              />
            </BrowserChrome>
            {/* Lived-in detail: a small badge overlay */}
            <div className="absolute top-6 right-6 bg-[#fef08a] border border-[#eab308]/30 px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 z-20 select-none">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="#ca8a04" strokeWidth="1.5"/>
                <path d="M8 5v3M8 10v.5" stroke="#ca8a04" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[10px] font-semibold text-[#92400e] tracking-wide">2 Conflicts Pending</span>
            </div>
          </div>

        </div>

        {/* Animated Scroll Cue */}
        <div className="scroll-cue absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-default select-none pointer-events-none opacity-60 z-20">
          <span className="caption-uppercase tracking-[0.15em] text-[10px] text-[var(--color-muted)]">SCROLL STORY</span>
          <svg className="w-4 h-4 animate-bounce text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </section>

      {/* ═══════ 2.5 · HOW IT WORKS WALKTHROUGH ═══════ */}
      <section id="how-it-works" className="relative z-10 py-20 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                num: "01",
                label: "INGEST",
                title: "Ingest Context",
                desc: "Connect scattered repositories, chat sessions, articles, and PDFs natively.",
                color: "bg-teal-100/50 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300 border-teal-200/50 dark:border-teal-400/20",
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                )
              },
              {
                num: "02",
                label: "RECONCILE",
                title: "Reconcile Beliefs",
                desc: "Engram detects conflicts at ingestion and surfaces them for quick resolution.",
                color: "bg-orange-100/50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300 border-orange-200/50 dark:border-orange-400/20",
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                )
              },
              {
                num: "03",
                label: "RECALL",
                title: "Recall Grounded",
                desc: "Run time-aware query diffs grounded dynamically on your metadata graph.",
                color: "bg-purple-100/50 text-purple-700 dark:bg-purple-400/10 dark:text-purple-300 border-purple-200/50 dark:border-purple-400/20",
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )
              },
              {
                num: "04",
                label: "DECAY",
                title: "Decay Stale Nodes",
                desc: "Unreinforced memories fade over time and get pruned dynamically.",
                color: "bg-blue-100/50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300 border-blue-200/50 dark:border-blue-400/20",
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )
              }
            ].map((step) => (
              <div 
                key={step.num} 
                className="relative group p-8 rounded-2xl bg-[var(--color-surface-soft)]/80 border border-[var(--color-hairline)] hover:border-[var(--color-ink)]/50 hover:bg-[var(--color-surface-card)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 transition-all duration-500 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <span className="text-[10px] font-mono font-semibold text-[var(--color-muted)] tracking-widest bg-[var(--color-surface-strong)] px-2.5 py-1 rounded">
                      {step.num} / {step.label}
                    </span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${step.color}`}>
                      {step.icon}
                    </div>
                  </div>
                  <h3 className="text-base font-serif font-medium text-[var(--color-ink)] mb-2 leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                    {step.desc}
                  </p>

                  {/* Real UI snippet overlays to make the engine feel tangible (Part 2.1) */}
                  {step.num === "01" && (
                    <div className="mt-5 p-2.5 rounded-xl bg-[var(--color-surface-strong)] border border-[var(--color-hairline)] font-mono text-[9px] text-[var(--color-muted)] flex flex-col gap-1 shadow-sm">
                      <div className="flex items-center justify-between text-[var(--color-ink)] font-semibold">
                        <span>ingest(specs.pdf)</span>
                        <span className="text-[var(--color-primary)] animate-pulse">84%</span>
                      </div>
                      <div className="w-full bg-[var(--color-hairline-strong)]/30 h-1 rounded-full overflow-hidden">
                        <div className="bg-[var(--color-primary)] h-full w-[84%]" />
                      </div>
                      <span className="text-[8px] text-[var(--color-muted-soft)]">Extracting semantic entities...</span>
                    </div>
                  )}

                  {step.num === "02" && (
                    <div className="mt-5 p-2.5 rounded-xl bg-[var(--color-surface-strong)] border border-[var(--color-hairline)] font-mono text-[9px] text-[var(--color-muted)] flex flex-col gap-1 shadow-sm">
                      <div className="flex items-center justify-between text-[var(--color-ink)] font-semibold">
                        <span>contradiction_check()</span>
                        <span className="text-[var(--color-semantic-error)] font-bold bg-[var(--color-semantic-error)]/10 px-1.5 py-0.5 rounded text-[8px] border border-[var(--color-semantic-error)]/20">1 conflict</span>
                      </div>
                      <span className="text-[8px] text-[var(--color-muted-soft)] leading-tight mt-0.5">
                        Conflicting: Tier 1 proxy vs Client-side auth
                      </span>
                    </div>
                  )}

                  {step.num === "04" && (
                    <div className="mt-5 p-2.5 rounded-xl bg-[var(--color-surface-strong)] border border-[var(--color-hairline)] font-mono text-[9px] text-[var(--color-muted)] flex flex-col gap-1 shadow-sm">
                      <div className="flex items-center justify-between text-[var(--color-ink)] font-semibold">
                        <span>cognee.forget()</span>
                        <span className="text-[var(--color-semantic-error)] font-bold animate-pulse">Pruning</span>
                      </div>
                      <span className="text-[8px] text-[var(--color-muted-soft)] mt-0.5 leading-tight">
                        &apos;auth_config.md&apos; confidence: 0.12 (stale node)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ 3 · THE PROBLEM (Scattered Cards, white BG) ═══════ */}
      <section id="section-problem" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
          <div className="text-left md:col-span-5">
            <SectionLabel text="THE PROBLEM" color="bg-[#a7e5d3]" />
            <h2 className="display-lg text-[var(--color-ink)] mb-8 leading-[1.1]">
              Every session, your AI wakes up blank.
            </h2>
            <p className="text-[var(--color-body)] text-base leading-relaxed max-w-lg mb-8 tracking-[0.16px]">
              Decisions happen in ChatGPT. Specs live on GitHub. Research sits in PDFs. Each new
              prompt starts from zero, so context spills out of the window and stale facts get
              repeated with total confidence. Engram holds it all in one graph — and keeps it honest.
            </p>
            <div className="mt-8 pt-8 border-t border-[var(--color-hairline)] flex gap-12 select-none">
              <div>
                <div className="text-3xl font-mono font-light text-[var(--color-body-strong)]">12+</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mt-1">Scattered Tools</div>
              </div>
              <div>
                <div className="text-3xl font-mono font-light text-[var(--color-conflict-warning)]">0</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mt-1">Memory Between Them</div>
              </div>
            </div>
          </div>

          {/* Scattered Source-Cards Mockup Frame */}
          <div className="md:col-span-7 relative h-[380px] sm:h-[440px] md:h-[480px] w-full flex items-center justify-center bg-[var(--color-surface-card)]/30 rounded-3xl border border-[var(--color-hairline)]/50 overflow-hidden select-none shadow-[inset_0_2px_8px_rgba(0,0,0,0.01)]">
            
            {/* Central Orbital Hub */}
            <div className="absolute top-[48%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] z-10 scale-90 sm:scale-100 md:scale-105 select-none pointer-events-none">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 240 240" fill="none">
                <circle cx="120" cy="120" r="75" stroke="var(--color-hairline)" strokeWidth="0.5" strokeDasharray="2 6" className="orbit-ring" />
                <line x1="120" y1="116" x2="120" y2="48" stroke="var(--color-hairline-strong)" strokeWidth="1" strokeDasharray="3 4" className="source-line" />
                <line x1="116" y1="120" x2="54" y2="166" stroke="var(--color-hairline-strong)" strokeWidth="1" strokeDasharray="3 4" className="source-line" style={{ animationDelay: "0.5s" }} />
                <line x1="124" y1="120" x2="186" y2="166" stroke="var(--color-hairline-strong)" strokeWidth="1" strokeDasharray="3 4" className="source-line" style={{ animationDelay: "1s" }} />
              </svg>

              <div className="absolute" style={{ left: "100px", top: "16px" }}>
                <div className="flex flex-col items-center gap-1 source-float" style={{ animationDelay: "0s" }}>
                  <div className="w-9 h-9 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-hairline)] flex items-center justify-center p-2 shadow-sm">
                    <Image src="/images/gemini-icon.png" alt="Gemini" width={22} height={22} className="object-contain" />
                  </div>
                  <span className="text-[9px] font-medium text-[var(--color-muted)]">Gemini</span>
                </div>
              </div>

              <div className="absolute" style={{ left: "28px", top: "148px" }}>
                <div className="flex flex-col items-center gap-1 source-float" style={{ animationDelay: "0.6s" }}>
                  <div className="w-9 h-9 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-hairline)] flex items-center justify-center p-2 shadow-sm">
                    <Image src="/images/chat-gpt-icon.png" alt="ChatGPT" width={22} height={22} className="object-contain" />
                  </div>
                  <span className="text-[9px] font-medium text-[var(--color-muted)]">ChatGPT</span>
                </div>
              </div>

              <div className="absolute" style={{ left: "172px", top: "148px" }}>
                <div className="flex flex-col items-center gap-1 source-float" style={{ animationDelay: "1.2s" }}>
                  <div className="w-9 h-9 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-hairline)] flex items-center justify-center p-2 shadow-sm">
                    <Image src="/images/claude-icon.png" alt="Claude" width={22} height={22} className="object-contain" />
                  </div>
                  <span className="text-[9px] font-medium text-[var(--color-muted)]">Claude</span>
                </div>
              </div>

              <div className="absolute" style={{ left: "96px", top: "96px" }}>
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute -inset-4 rounded-full border border-[var(--color-primary)]/10 animate-ping" style={{ animationDuration: "2.5s" }} />
                  <div className="absolute -inset-2 rounded-full border border-[var(--color-primary)]/20 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.8s" }} />
                  <div className="absolute -inset-6 rounded-full border border-[var(--color-primary)]/5 animate-ping" style={{ animationDuration: "3.5s", animationDelay: "1.5s" }} />
                  <div className="w-12 h-12 rounded-full bg-[var(--color-surface-card)] border-2 border-[var(--color-hairline)] flex items-center justify-center p-2.5 shadow-md relative z-10 cognee-breathe">
                    <Image src="/images/congee-icon.png" alt="Cognee" width={28} height={28} className="object-contain" />
                  </div>
                  <span className="absolute -bottom-5 text-[9px] font-semibold text-[var(--color-primary)] whitespace-nowrap">Cognee</span>
                </div>
              </div>
            </div>

            {/* Card 1: ChatGPT */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[8%] left-[6%] rotate-[-4deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-body-strong)] w-3.5 h-3.5 md:w-[18px] md:h-[18px]">
                <path d="M12 2v20M17 5H7M19 12H5M17 19H7M21 9l-18 6M3 9l18 6" />
                <circle cx="12" cy="12" r="3" className="fill-[var(--color-canvas)]" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">ChatGPT Export</span>
            </div>

            {/* Card 2: GitHub */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[44%] left-[4%] rotate-[3deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-body-strong)] w-3.5 h-3.5 md:w-[18px] md:h-[18px]">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">GitHub Commit</span>
            </div>

            {/* Card 3: Notion */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[78%] left-[8%] rotate-[-5deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-body-strong)] w-3.5 h-3.5 md:w-[18px] md:h-[18px]">
                <path d="M12 2L2 7l10 5 10-5-10-5Z" />
                <path d="M2 17l10 5 10-5" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">Notion Notes</span>
            </div>

            {/* Card 4: Claude */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[12%] right-[6%] rotate-[6deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <SparkleIcon className="w-3.5 h-3.5 md:w-[18px] md:h-[18px] text-[var(--color-body-strong)]" />
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">Claude Session</span>
            </div>

            {/* Card 5: PDFs */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[44%] right-[4%] rotate-[-2deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-body-strong)] w-3.5 h-3.5 md:w-[18px] md:h-[18px]">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">specs.pdf</span>
            </div>

            {/* Card 6: Articles */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[78%] right-[8%] rotate-[3deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-body-strong)] w-3.5 h-3.5 md:w-[18px] md:h-[18px]">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="M16 8h2M16 12h2" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">Web Article</span>
            </div>

            {/* Card 7: YouTube */}
            <div className="source-card bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-full px-3 py-2 md:px-5 md:py-3 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-1.5 md:gap-3 absolute top-[84%] left-[38%] md:top-[85%] md:left-[42%] rotate-[-1deg] hover:border-[var(--color-hairline-strong)] transition-colors duration-150 z-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-body-strong)] w-3.5 h-3.5 md:w-[18px] md:h-[18px]">
                <rect x="2" y="3" width="20" height="18" rx="5" ry="5" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold text-[var(--color-body-strong)] tracking-[0.16px]">YouTube Audio</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 4 · INGESTION AND STAGES PIPELINE (Pinned, Ingestion Spiral) ═══════ */}
      <section id="section-ingest" className="relative z-10 w-full min-h-fit md:min-h-screen bg-[var(--color-canvas)] flex items-center border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto px-6 w-full py-24 grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
          
          {/* Stepper info list */}
          <div className="text-left md:col-span-6 flex flex-col gap-6">
            <div>
              <SectionLabel text="THE PIPELINE" color="bg-[#c8b8e0]" />
              <h2 className="display-lg text-[var(--color-ink)] mb-8 leading-[1.08]">
                Feed it anything. It wakes up structured.
              </h2>
            </div>

            {/* Vertical pipeline progress UI */}
            <div className="relative flex flex-col gap-8 pl-8 border-l border-[var(--color-hairline)]">
              {[
                { step: 1, title: "Fetch", desc: "Pulls in raw context — PDFs, repo code, chat exports, articles, or YouTube transcripts." },
                { step: 2, title: "Extract", desc: "Parses the meaning: central entities, decisions, parameters, and how they relate." },
                { step: 3, title: "remember()", desc: "Cognee writes vectors and graph edges straight into hybrid graph-vector storage." },
                { step: 4, title: "improve()", desc: "A contradiction sweep flags anything that clashes with what you already know." }
              ].map((s) => (
                <div key={s.title} className="relative flex flex-col items-start">
                  <div className={`pipeline-step-${s.step} absolute left-[-45px] top-0 w-8 h-8 rounded-full border border-[var(--color-hairline-strong)] bg-[var(--color-surface-card)] grid place-items-center text-xs font-semibold font-mono text-[var(--color-muted)] transition-all duration-300`}>
                    {s.step}
                  </div>
                  <div>
                    <h4 className={`pipeline-label-${s.step} text-base font-semibold text-[var(--color-muted)] opacity-70 transition-all duration-300`}>{s.title}</h4>
                    <p className={`pipeline-desc-${s.step} text-sm text-[var(--color-muted)] mt-1.5 leading-relaxed opacity-60 transition-all duration-300`}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column with coiling spiral SVG */}
          <div className="md:col-span-6 flex justify-center items-center relative h-[380px] md:h-[480px]">
            <svg viewBox="0 0 600 600" className="w-[90%] h-[90%] select-none">
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="spiral-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a7e5d3" />
                  <stop offset="50%" stopColor="#c8b8e0" />
                  <stop offset="100%" stopColor="#f4c5a8" />
                </linearGradient>
              </defs>
              
              {/* Coiling spiral path */}
              <path 
                id="spiral-path"
                d="M 50,550 Q 100,550 120,300 C 140,50 510,70 480,300 C 460,520 160,500 180,300 C 190,120 440,140 420,300 C 400,450 200,430 220,300 C 230,190 370,200 360,300 C 350,380 250,370 260,300 C 270,250 330,260 320,300 C 310,330 280,320 280,300 C 280,290 290,270 300,280 C 305,285 305,295 300,300"
                fill="none" 
                stroke="url(#spiral-grad)" 
                strokeWidth="4" 
                strokeLinecap="round" 
                filter="url(#glow)"
                strokeDasharray="2000"
                strokeDashoffset="2000"
              />

              {/* Glowing core indicators */}
              <circle cx="300" cy="300" r="10" fill="var(--color-muted)" className="animate-pulse" />
              <circle cx="300" cy="300" r="5" fill="var(--color-gradient-mint)" />
            </svg>
          </div>
        </div>
      </section>

      {/* ═══════ 5 · WHAT CHANGED RECONCILIATION (Pinned droplets, conflict cards) ═══════ */}
      <section id="section-resolve" className="relative z-10 w-full min-h-fit md:min-h-screen bg-[var(--color-canvas)] flex items-center border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto px-6 w-full py-24 grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
          
          {/* Left Column: text details and interactive Compare + Diff card mockups */}
          <div className="text-left md:col-span-6 flex flex-col gap-8">
            <div>
              <SectionLabel text="RECONCILIATION" color="bg-[#f4c5a8]" />
              <h2 className="display-lg text-[var(--color-ink)] mb-8 leading-[1.08]">
                Conflicts resolved by design.
              </h2>
              <p className="text-[var(--color-body)] text-base leading-relaxed tracking-[0.16px]">
                When fresh evidence contradicts something you already believe, Engram catches it at
                the schema layer and surfaces it on the spot — before a stale fact poisons your
                memory. You always make the final call on what earns a place in long-term storage.
              </p>
            </div>

            <div className="space-y-6">
              {/* Compare UI Card Mockup */}
              <div id="compare-ui-card" className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] p-5 sm:p-6 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col opacity-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-hairline)] pb-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#e0a328]" />
                    <span className="text-xs font-semibold text-[var(--color-ink)] tracking-wider uppercase">Resolve Contradiction</span>
                  </div>
                  <span className="text-[10px] text-[var(--color-muted)] font-mono">Topic: Backend Security</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-canvas-soft border border-[var(--color-hairline)] p-4 rounded-xl text-left">
                    <span className="text-[9px] uppercase tracking-wider text-[var(--color-muted)] font-semibold block mb-1">Old belief</span>
                    <p className="text-xs text-[var(--color-body-strong)] font-medium leading-relaxed">&quot;Authentication: basic client-side session checker.&quot;</p>
                    <span className="text-[9px] text-[var(--color-muted-soft)] block mt-3">auth_config.md</span>
                  </div>
                  <div className="bg-canvas-soft border border-[var(--color-hairline)] p-4 rounded-xl text-left">
                    <span className="text-[9px] uppercase tracking-wider text-[var(--color-body-strong)] font-semibold block mb-1">New evidence</span>
                    <p className="text-xs text-[var(--color-body-strong)] font-medium leading-relaxed">&quot;Authentication: Tier 1 shared-secret server proxy gate.&quot;</p>
                    <span className="text-[9px] text-[var(--color-muted-soft)] block mt-3">AGENTS.md</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button className="px-4 py-2 border border-[var(--color-hairline-strong)] text-xs font-medium rounded-full text-[var(--color-body)] bg-[var(--color-surface-card)] hover:text-[var(--color-ink)] transition-colors select-none">
                    Keep Old
                  </button>
                  <button id="btn-keep-new" className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-medium rounded-full hover:bg-[var(--color-ink)] hover:text-[var(--color-canvas)] transition-colors select-none">
                    Keep New
                  </button>
                </div>
              </div>

              {/* Diff Card Mockup */}
              <div id="diff-card" className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] p-5 rounded-xl text-left font-mono text-[10px] space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] opacity-0">
                <div className="flex justify-between border-b border-[var(--color-hairline)] pb-2 mb-2 font-sans">
                  <span className="uppercase text-[8px] text-[var(--color-muted)] font-bold">Diff Result — Backend Security</span>
                  <span className="text-[8px] text-[var(--color-semantic-success)] bg-[var(--color-semantic-success)]/10 px-1.5 py-0.5 rounded-full font-semibold">Committed</span>
                </div>
                <div className="text-[var(--color-semantic-danger)] font-medium">− Client-side route blocking</div>
                <div className="text-[var(--color-semantic-success)] font-medium">+ Server-side proxy middleware.ts</div>
                <div className="text-[var(--color-semantic-success)] font-medium">+ ENGRAM_ACCESS_KEY validation</div>
                <div className="text-[var(--color-muted)] font-sans text-[9px] pt-1">
                  Reconciliation pass updated active nodes successfully.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Fusing Golden and Smoke droplet visual + Actual UI Screenshot */}
          <div className="md:col-span-6 flex flex-col justify-center items-center relative h-auto py-8">
            {/* "⚠ Conflict detected" Badge */}
            <div id="conflict-badge" className="absolute top-[5%] bg-[var(--color-conflict-warning)]/10 border border-[var(--color-conflict-warning)]/30 px-4 py-1.5 rounded-full shadow-[0_4px_12px_rgba(245,158,11,0.1)] flex items-center gap-2 z-20 opacity-0 select-none">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="var(--color-conflict-warning)" strokeWidth="1.5"/>
                <path d="M8 5v3.5M8 10.5v.01" stroke="var(--color-conflict-warning)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[10px] font-bold text-[var(--color-conflict-warning)] uppercase tracking-wider">Conflict Detected</span>
            </div>

            {/* Droplet SVG Canvas */}
            <svg viewBox="0 0 500 350" className="w-full h-full max-w-[420px] select-none relative z-10">
              <defs>
                <radialGradient id="gold-droplet" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.8" />
                  <stop offset="40%" stopColor="#eab308" stopOpacity="0.5" />
                  <stop offset="95%" stopColor="#ca8a04" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#ca8a04" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="smoke-droplet" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#78716c" stopOpacity="0.8" />
                  <stop offset="40%" stopColor="#292524" stopOpacity="0.6" />
                  <stop offset="95%" stopColor="#0c0a09" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#0c0a09" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="intersection-flash" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
                  <stop offset="50%" stopColor="#eab308" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Gold Droplet */}
              <circle id="droplet-gold" cx="180" cy="180" r="80" fill="url(#gold-droplet)" className="opacity-0" />

              {/* Smoke Droplet */}
              <circle id="droplet-smoke" cx="320" cy="180" r="80" fill="url(#smoke-droplet)" className="opacity-0" />

              {/* Overlap Flash */}
              <circle id="droplet-flash" cx="250" cy="180" r="50" fill="url(#intersection-flash)" className="opacity-0" />
            </svg>

            {/* Droplet Captions */}
            <div className="absolute top-[52%] flex justify-between w-[80%] font-mono text-[10px] text-[var(--color-muted)] select-none pointer-events-none">
              <span id="droplet-gold-label" className="opacity-0">Old Belief (Gold)</span>
              <span id="droplet-smoke-label" className="opacity-0">New Evidence (Smoke)</span>
            </div>

            {/* Real Screenshot with Browser Frame */}
            <div id="resolve-screenshot-wrapper" className="mt-8 w-full max-w-[460px] opacity-0 relative z-20">
              <BrowserChrome url={`${BASE_URL}/resolve`}>
                <Image
                  src="/images/resolve_screenshot.jpg"
                  alt="Engram Resolve Screen"
                  width={800}
                  height={450}
                  className="w-full h-auto object-cover"
                />
              </BrowserChrome>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 6 · MEMORY HEALTH / DECAY (Eclipse and dissolving bubbles) ═══════ */}
      <section id="section-decay" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
          
          {/* Left Column: Copy + Confidence decay timeline progress */}
          <div className="text-left md:col-span-6 flex flex-col gap-10">
            <div>
              <SectionLabel text="MEMORY HEALTH" color="bg-[#a8c8e8]" />
              <h2 className="display-lg text-[var(--color-ink)] mb-8 leading-[1.08]">
                Unreinforced beliefs fade.
              </h2>
              <p className="text-[var(--color-body)] text-base leading-relaxed tracking-[0.16px] max-w-lg">
                Not everything deserves to be remembered forever. Confidence decays the longer a fact
                goes untouched, and once it drops below the threshold Engram prunes it with{" "}
                <code className="text-xs bg-[var(--color-surface-strong)] px-1 py-0.5 rounded font-mono font-bold">cognee.forget()</code>. Your memory stays sharp instead of bloated.
              </p>
            </div>

            {/* Stacked Confidence Bars Mockup */}
            <div className="space-y-8 max-w-md">
              <div>
                <div className="flex justify-between text-xs font-medium mb-3">
                  <span className="text-[var(--color-muted)]">Backend Security · 3 months ago</span>
                  <span className="font-mono font-semibold text-[var(--color-semantic-danger)]" id="decay-score-postgres">0.92</span>
                </div>
                <div className="h-2 bg-[var(--color-hairline)] rounded-full overflow-hidden">
                  <div id="decay-bar-postgres" className="h-full bg-[var(--color-hairline-strong)] rounded-full w-[92%]" />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-xs font-medium mb-3">
                  <span className="text-[var(--color-ink)] font-semibold">Canvas Theme · reinforced today</span>
                  <span className="font-mono font-semibold text-[var(--color-ink)]" id="decay-score-supabase">0.00</span>
                </div>
                <div className="h-2 bg-[var(--color-hairline)] rounded-full overflow-hidden">
                  <div id="decay-bar-supabase" className="h-full bg-[var(--color-primary)] rounded-full w-[0%]" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Memory Decay Illustration */}
          <div className="md:col-span-6 flex justify-center items-center relative h-[260px] sm:h-[320px] md:h-[380px] bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-3xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.02)] select-none group">
            <Image
              src="/images/memory-decay.webp"
              alt="Memory Decay Illustration"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain p-6 group-hover:scale-102 transition-transform duration-500"
              priority
            />
            {/* Floating Memory Health Badge (Part 2.3) */}
            <div className="absolute top-4 right-4 bg-[var(--color-surface-strong)] border border-[var(--color-hairline)] px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 z-20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono font-semibold text-[var(--color-ink)]">Health Score: 94%</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 7 · METADATA GRAPH PREVIEW (Parallax SVG Graph) ═══════ */}
      <section id="section-graph-preview" className="relative z-10 py-16 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 items-center">
          
          <div className="text-left md:col-span-5 flex flex-col gap-6">
            <SectionLabel text="METADATA GRAPH" color="bg-[#e8b8c4]" />
            <h2 className="display-lg text-[var(--color-ink)] leading-[1.08]">
              Every memory, mapped.
            </h2>
            <p className="text-[var(--color-body)] text-base leading-relaxed tracking-[0.16px]">
              Engram builds a weighted semantic relationship connection network. Node sizing dynamically adjusts (larger nodes have more connections). Open the app to explore the full interactive 3D graph.
            </p>
            <div className="pt-2 text-xs font-mono text-[var(--color-muted)] select-none">
              [ Glance Preview — Static Layer Mockup ]
            </div>
          </div>

          {/* Real Screenshot */}
          <div className="md:col-span-7 flex flex-col items-center gap-6 relative w-full">
            <div className="relative z-10 w-full overflow-hidden rounded-2xl border border-[var(--color-hairline)] shadow-[0_8px_30px_rgba(0,0,0,0.02)]">
              <Image
                src="/images/graph_screenshot.jpg"
                alt="Engram Metadata Graph Screen"
                width={800}
                height={450}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
            
            <div className="absolute -top-3 right-3 md:-top-4 md:-right-4 bg-[var(--color-surface-card)] border border-[var(--color-hairline)] px-3 py-1 rounded-full text-[10px] font-mono shadow-sm z-20 select-none">
              Interactive 3D Layer
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 7.5 · INSIGHTS & GUIDANCE (Provenance, Schema, Session, Filtering) ═══════ */}
      <section id="section-insights" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-16 items-center">

          {/* Left Column: Text + feature cards */}
          <div className="text-left md:col-span-6 flex flex-col gap-8">
            <div>
              <SectionLabel text="INSIGHTS & GUIDANCE" color="bg-[#a8e0c8]" />
              <h2 className="display-lg text-[var(--color-ink)] mb-8 leading-[1.08]">
                See what your memory knows.
              </h2>
              <p className="text-[var(--color-body)] text-base leading-relaxed tracking-[0.16px]">
                New tools that expose the inner structure of your graph: provenance traces, schema inventory, session distillation, and entity-level filtering.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { title: "The Recap", desc: "\"Here's what happened while you were out\" — a morning-after digest of everything your memory learned, decided, and forgot." },
                { title: "Memory Provenance", desc: "Visualize the exact path each piece of knowledge took before entering your graph." },
                { title: "Schema Inventory", desc: "Browse all entity types in your graph with counts — classes, frameworks, patterns detected." },
                { title: "Session Distillation", desc: "Compress active-session context into structured guidance. No more re-explaining." },
                { title: "Graph Type Filtering", desc: "Filter the 3D graph by entity type to focus on specific knowledge domains." }
              ].map((item) => (
                <div key={item.title} className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] p-5 rounded-xl flex items-start gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                  <div className="w-2 h-2 rounded-full bg-[#a8e0c8] mt-1.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--color-ink)]">{item.title}</h4>
                    <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Settings screenshot */}
          <div className="md:col-span-6 flex justify-center items-center">
            <BrowserChrome url={`${BASE_URL}/settings`}>
              <div className="p-6 bg-[var(--color-surface-card)] font-sans select-none pointer-events-none">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-4 border-b border-[var(--color-hairline)] pb-3">
                  Memory Insights
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="border border-[var(--color-hairline)] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#a8e0c8]/30 grid place-items-center text-[10px] font-bold text-[var(--color-body-strong)]">P</div>
                      <div>
                        <div className="text-[11px] font-medium text-[var(--color-ink)]">Provenance</div>
                        <div className="text-[9px] text-[var(--color-muted)]">View trace path</div>
                      </div>
                    </div>
                    <div className="text-[8px] text-[var(--color-on-primary)] bg-[var(--color-primary)] px-2.5 py-1 rounded-full font-medium">View &#8594;</div>
                  </div>
                  <div className="border border-[var(--color-hairline)] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#c8b8e0]/30 grid place-items-center text-[10px] font-bold text-[var(--color-body-strong)]">S</div>
                      <div>
                        <div className="text-[11px] font-medium text-[var(--color-ink)]">Schema Inventory</div>
                        <div className="text-[9px] text-[var(--color-muted)]">8 entity types</div>
                      </div>
                    </div>
                    <div className="text-[8px] text-[var(--color-on-primary)] bg-[var(--color-primary)] px-2.5 py-1 rounded-full font-medium">Load &#8594;</div>
                  </div>
                  <div className="border border-[var(--color-hairline)] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#f4c5a8]/30 grid place-items-center text-[10px] font-bold text-[var(--color-body-strong)]">D</div>
                      <div>
                        <div className="text-[11px] font-medium text-[var(--color-ink)]">Session Guidance</div>
                        <div className="text-[9px] text-[var(--color-muted)]">Distill context</div>
                      </div>
                    </div>
                    <div className="text-[8px] text-[var(--color-on-primary)] bg-[var(--color-primary)] px-2.5 py-1 rounded-full font-medium">Distill &#8594;</div>
                  </div>
                </div>
                <div className="mt-3 text-[8px] text-[var(--color-muted-soft)] text-center border-t border-[var(--color-hairline)] pt-3">
                  Settings Dashboard — Memory Insights panel
                </div>
              </div>
            </BrowserChrome>
          </div>
        </div>
      </section>

      {/* ═══════ 7.55 · THE CORE MEMORY LIFECYCLE (Four Operations) ═══════ */}
      <section id="section-lifecycle" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-card)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8b8e0]" />
              <span className="caption-uppercase tracking-[0.08em] text-[11px] font-semibold text-[var(--color-muted)]">The Core Memory Lifecycle</span>
            </div>
            <h2 className="display-lg text-[var(--color-ink)] leading-[1.08] mb-4">Four operations. Total recall.</h2>
            <p className="text-[var(--color-body)] text-base leading-relaxed max-w-2xl mx-auto tracking-[0.16px]">
              Cognee&apos;s memory API is dead simple — and every one of these is load-bearing in
              Engram, wired to the SDK locally and to a hosted Cognee Cloud tenant.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Left: 2×2 operation cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MEMORY_OPS.map((op, i) => (
                <Reveal key={op.name} delay={i * 80} className="h-full">
                  <div className="card-lift h-full p-6 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface-card)] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${op.tint}1a`, color: op.tint }}
                    >
                      {op.icon}
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <code className="font-mono text-[15px] font-semibold" style={{ color: op.tint }}>{op.name}</code>
                      {op.alias && (
                        <span className="font-mono text-[11px] text-[var(--color-muted-soft)]">/ {op.alias}</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-muted)] leading-relaxed">{op.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Right: code window */}
            <Reveal delay={140} className="h-full">
              <div className="card-lift h-full rounded-2xl overflow-hidden border border-[var(--color-hairline)] bg-[#0c0a09] shadow-[0_10px_40px_rgba(0,0,0,0.18)]">
                <div className="flex items-center gap-2 px-4 py-3 bg-[#161311] border-b border-white/[0.06] select-none">
                  <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                  <span className="ml-3 font-mono text-[11px] text-stone-400">wheres_my_context.py</span>
                </div>
                <pre className="p-5 sm:p-6 font-mono text-[12.5px] leading-[1.7] overflow-x-auto text-stone-300 scrollbar-thin">
<span className="text-[#c8b8e0]">import</span> cognee{"\n"}
{"\n"}
<span className="text-stone-500"># 1. Give your agent a memory</span>{"\n"}
<span className="text-[#c8b8e0]">await</span> cognee.<span className="text-[#5e6ad2] font-semibold">remember</span>(<span className="text-[#a7e5d3]">&quot;Doug is the groom. The wedding is Sunday.&quot;</span>){"\n"}
<span className="text-[#c8b8e0]">await</span> cognee.<span className="text-[#5e6ad2] font-semibold">remember</span>(file=<span className="text-[#a7e5d3]">&quot;vegas_receipts.pdf&quot;</span>){"\n"}
{"\n"}
<span className="text-stone-500"># 2. Ask it anything, across infinite sessions</span>{"\n"}
answer = <span className="text-[#c8b8e0]">await</span> cognee.<span className="text-[#16a34a] font-semibold">recall</span>(<span className="text-[#a7e5d3]">&quot;Where is Doug?&quot;</span>){"\n"}
{"\n"}
<span className="text-stone-500"># 3. Let the memory get smarter over time</span>{"\n"}
<span className="text-[#c8b8e0]">await</span> cognee.<span className="text-[#8b5cf6] font-semibold">improve</span>()   <span className="text-stone-500"># a.k.a. memify</span>{"\n"}
{"\n"}
<span className="text-stone-500"># 4. Surgically forget what no longer matters</span>{"\n"}
<span className="text-[#c8b8e0]">await</span> cognee.<span className="text-[#ef4444] font-semibold">forget</span>(dataset=<span className="text-[#a7e5d3]">&quot;last_nights_mistakes&quot;</span>){"\n"}
                </pre>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-8 text-center">
            <p className="text-xs text-[var(--color-muted-soft)]">
              Not a mockup —{" "}
              <a href="#section-capabilities" onClick={(e) => handleNavClick(e, "#section-capabilities")} className="text-[var(--color-body-strong)] font-medium border-b border-dotted border-[var(--color-hairline-strong)] hover:text-[var(--color-ink)] cursor-pointer">
                see how each maps to Engram
              </a>.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════ 7.6 · CAPABILITIES (Bento Grid) ═══════ */}
      <section id="section-capabilities" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <SectionLabel text="CAPABILITIES" color="bg-[#c8b8e0]" />
            <h2 className="display-lg text-[var(--color-ink)] leading-[1.08] mb-4">
              Built on Cognee&apos;s memory lifecycle.
            </h2>
            <p className="text-[var(--color-body)] text-base leading-relaxed max-w-xl mx-auto tracking-[0.16px]">
              Four operations, total recall: <code className="text-xs bg-[var(--color-surface-strong)] px-1 py-0.5 rounded font-mono font-semibold">remember</code>,{" "}
              <code className="text-xs bg-[var(--color-surface-strong)] px-1 py-0.5 rounded font-mono font-semibold">recall</code>,{" "}
              <code className="text-xs bg-[var(--color-surface-strong)] px-1 py-0.5 rounded font-mono font-semibold">improve</code>, and{" "}
              <code className="text-xs bg-[var(--color-surface-strong)] px-1 py-0.5 rounded font-mono font-semibold">forget</code> — Cognee&apos;s hybrid graph-vector memory layer, wired end to end.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: 5 source types (bg-image: capabilities-sphere.webp) */}
            <div 
              className="p-8 rounded-3xl border border-[var(--color-hairline)]/50 flex flex-col justify-end min-h-[300px] md:col-span-2 relative overflow-hidden group shadow-[0_4px_16px_rgba(0,0,0,0.02)]"
              style={{ 
                backgroundImage: "url('/images/capabilities-sphere.webp')",
                backgroundSize: "cover",
                backgroundPosition: "center"
              }}
            >
              {/* Dark overlay for contrast */}
              <div className="absolute inset-0 bg-[var(--color-ink)]/45 group-hover:bg-[var(--color-ink)]/50 transition-colors duration-300 z-0" />
              
              <div className="relative z-10 text-[var(--color-on-primary)]">
                <div className="mb-4 text-[var(--color-on-primary)]/90">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                  </svg>
                </div>
                <h3 className="text-xl font-medium mb-2 font-serif">5 Source Types</h3>
                <p className="text-sm text-[var(--color-on-primary)]/80 leading-relaxed max-w-md">
                  Ingests PDFs, GitHub repositories, ChatGPT conversational exports, YouTube transcripts, and web articles natively.
                </p>
                <div className="flex gap-4 mt-4 bg-[var(--color-surface-card)]/10 p-3 rounded-xl max-w-sm border border-white/5 backdrop-blur-sm w-fit select-none">
                  {/* ChatGPT Icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-on-primary)]">
                    <path d="M12 2v20M17 5H7M19 12H5M17 19H7M21 9l-18 6M3 9l18 6" />
                  </svg>
                  {/* GitHub Icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-on-primary)]">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  {/* PDF Icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-on-primary)]">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {/* Article Icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-on-primary)]">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  </svg>
                  {/* YouTube Icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-on-primary)]">
                    <rect x="2" y="3" width="20" height="18" rx="5" ry="5" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card 2: Reconciliation engine */}
            <div className="p-8 rounded-3xl bg-[var(--color-surface-subtle)] border border-[var(--color-hairline)]/50 flex flex-col justify-between min-h-[300px] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
              <div className="text-[var(--color-body-strong)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3l5 5-5 5"/>
                  <path d="M21 8H9"/>
                  <path d="M8 21l-5-5 5-5"/>
                  <path d="M3 16h12"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--color-ink)] mb-2 font-serif">Reconciliation Engine</h3>
                <p className="text-sm text-[var(--color-body)] leading-relaxed">
                  Validates every new belief against your graph in under 1.8 seconds using schema-level contradiction checks.
                </p>
              </div>
            </div>

            {/* Card 3: Time-aware decay */}
            <div className="p-8 rounded-3xl bg-[var(--color-surface-subtle)] border border-[var(--color-hairline)]/50 flex flex-col justify-between min-h-[300px] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
              <div className="text-[var(--color-body-strong)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M12 7v5l3 3"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--color-ink)] mb-2 font-serif">Time-Aware Decay</h3>
                <p className="text-sm text-[var(--color-body)] leading-relaxed">
                  Confidence scores decay continuously (t1/2 = 30 days) and are automatically pruned via <code className="text-xs font-mono bg-[var(--color-surface-strong)] px-1 rounded">cognee.forget()</code> when confidence drops below 0.15.
                </p>
              </div>
            </div>

            {/* Card 4: 3D knowledge graph */}
            <div className="p-8 rounded-3xl bg-[var(--color-surface-subtle)] border border-[var(--color-hairline)]/50 flex flex-col justify-between min-h-[300px] md:col-span-2 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
              <div className="text-[var(--color-body-strong)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="5" r="3"/>
                  <circle cx="5" cy="19" r="3"/>
                  <circle cx="19" cy="19" r="3"/>
                  <line x1="10" y1="7.5" x2="6.5" y2="16.5"/>
                  <line x1="14" y1="7.5" x2="17.5" y2="16.5"/>
                  <line x1="8" y1="19" x2="16" y2="19"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--color-ink)] mb-2 font-serif">3D Knowledge Graph</h3>
                <p className="text-sm text-[var(--color-body)] leading-relaxed max-w-lg">
                  WebGL force-directed visualizer mapping up to 5,000 nodes with real-time provenance tracing, zoom, pan, and direct node mutation.
                </p>
              </div>
            </div>

            {/* Card 5: Structured diffs */}
            <div className="p-8 rounded-3xl bg-[var(--color-surface-subtle)] border border-[var(--color-hairline)]/50 flex flex-col justify-between min-h-[300px] md:col-span-2 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
              <div>
                <div className="text-[var(--color-body-strong)] mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 3v18"/>
                    <path d="M5 12h14"/>
                    <path d="M5 6h4"/>
                    <path d="M5 18h4"/>
                    <path d="M15 6h4"/>
                    <path d="M15 18h4"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--color-ink)] mb-2 font-serif">Structured Diffs</h3>
                <p className="text-sm text-[var(--color-body)] leading-relaxed max-w-lg mb-3">
                  Generates clean JSON diffs showing precise schema operations: <code className="text-xs font-mono bg-[var(--color-surface-strong)] px-1 rounded">remember()</code>, <code className="text-xs font-mono bg-[var(--color-surface-strong)] px-1 rounded">improve()</code>, and <code className="text-xs font-mono bg-[var(--color-surface-strong)] px-1 rounded">forget()</code> with transaction histories.
                </p>
              </div>
              {/* Structured Diffs real UI snippet */}
              <div className="p-3 rounded-xl bg-[var(--color-surface-strong)]/60 border border-[var(--color-hairline)] font-mono text-[9px] text-[var(--color-muted)] flex flex-col gap-1 w-full max-w-md select-none mt-2">
                <span className="text-[var(--color-semantic-danger)] font-medium">- Client-side route blocking</span>
                <span className="text-[var(--color-semantic-success)] font-medium">+ Server-side proxy middleware.ts</span>
                <span className="text-[var(--color-semantic-success)] font-medium">+ ENGRAM_ACCESS_KEY validation</span>
              </div>
            </div>

            {/* Card 6: MCP server */}
            <div className="p-8 rounded-3xl bg-[var(--color-surface-subtle)] border border-[var(--color-hairline)]/50 flex flex-col justify-between min-h-[300px] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
              <div>
                <div className="text-[var(--color-body-strong)] mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2"/>
                    <path d="M6 10h.01M10 10h.01M14 10h.01"/>
                    <path d="M6 14h12"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--color-ink)] mb-2 font-serif">Built-in MCP Server</h3>
                <p className="text-sm text-[var(--color-body)] leading-relaxed mb-3">
                  Exposes graph queries (<code className="text-xs font-mono bg-[var(--color-surface-strong)] px-1 rounded">get_nodes</code>, <code className="text-xs font-mono bg-[var(--color-surface-strong)] px-1 rounded">query_graph</code>) directly to Cursor, Claude Desktop, or custom agents via standard JSON-RPC.
                </p>
              </div>
              {/* MCP real JSON configuration snippet */}
              <div className="p-3 rounded-xl bg-[var(--color-surface-strong)]/60 border border-[var(--color-hairline)] font-mono text-[9px] text-[var(--color-muted)] flex flex-col gap-1 w-full select-none mt-2">
                <div className="text-[8px] uppercase tracking-wider text-[var(--color-ink)] font-bold mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  mcp_server.json
                </div>
                <span>mcp: &#123; name: &quot;engram-memory&quot; &#125;</span>
                <span>tools: [&quot;get_nodes&quot;, &quot;query_graph&quot;]</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 7.6 · CREDIBILITY BAND ═══════ */}
      <div className="relative z-10 py-8 bg-[var(--color-surface-strong)]/50 border-t border-b border-[var(--color-hairline)] text-center select-none animate-fade-in">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-xs text-[var(--color-muted)] font-medium tracking-wide">
          <span>BUILT FOR: WeMakeDevs × Cognee Hackathon</span>
          <span className="hidden sm:inline text-[var(--color-hairline-strong)]">•</span>
          <span>POWERED BY: <a href="https://cognee.ai" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors underline decoration-dotted underline-offset-4">Cognee Memory SDK</a></span>
          <span className="hidden sm:inline text-[var(--color-hairline-strong)]">•</span>
          <span>DEVELOPED BY: <a href="https://github.com/Aditya060806" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors underline decoration-dotted underline-offset-4">Aditya Pandey</a></span>
        </div>
      </div>

      {/* ═══════ 7.7 · FAQ SECTION (Accordion) ═══════ */}
      <section id="faq" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)]">
        <div className="max-w-[800px] mx-auto">
          <div className="text-center mb-16">
            <SectionLabel text="FAQ" color="bg-[#a8c8e8]" />
            <h2 className="display-lg text-[var(--color-ink)] leading-[1.08] mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-[var(--color-body)] text-base leading-relaxed tracking-[0.16px]">
              Substantive answers to technical questions about Engram&apos;s memory architecture.
            </p>
          </div>
          
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <FAQItem
                key={idx}
                question={faq.q}
                answer={faq.a}
                isOpen={openFaqIndex === idx}
                onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ 8 · CTA BAND ═══════ */}
      <section id="cta" className="relative z-10 py-24 md:py-32 px-6 bg-[var(--color-canvas)] text-center border-t border-[var(--color-hairline)] overflow-hidden">
        


        <div className="max-w-[800px] mx-auto flex flex-col items-center gap-8 relative z-10">
          <SparkleIcon className="w-8 h-8 text-[var(--color-primary)]/20" />
          <h2 className="display-lg text-[var(--color-ink)] leading-[1.08] text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
            Stop re-explaining context.
          </h2>
          <p className="text-[var(--color-body)] text-lg max-w-md tracking-[0.16px]">
            Build a memory graph that reconciles, decays, and actively maintains itself.
          </p>
          <button onClick={enter}
            className="px-8 py-4 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[15px] font-medium hover:bg-[var(--color-ink)] hover:text-[var(--color-canvas)] transition-all duration-300 cursor-pointer w-full sm:w-auto text-center justify-center flex">
            Initialize graph →
          </button>
        </div>
      </section>

      {/* ═══════ 9 · FOOTER ═══════ */}
      <footer id="footer" className="relative z-10 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)] py-16 px-6 select-none text-[13px]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-2 md:grid-cols-5 gap-12 text-[var(--color-body)]">
          
          {/* Column 1: Brand details */}
          <div className="col-span-2 flex flex-col items-start gap-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Engram"
                width={28}
                height={28}
                className="object-contain rounded-md"
              />
              <span className="text-[18px] font-semibold tracking-tight text-[var(--color-ink)]">Engram</span>
            </div>
            <p className="max-w-[200px] text-[var(--color-muted)] leading-relaxed">
              Autonomous memory visualization layers running on top of Cognee&apos;s semantic engine.
            </p>
          </div>

          {/* Column 2: Product */}
          <div className="flex flex-col gap-3">
            <span className="font-semibold text-[var(--color-ink)] uppercase tracking-wider text-[10px]">Product</span>
            <a href="#section-ingest" onClick={(e) => handleNavClick(e, "#section-ingest")} className="hover:text-[var(--color-ink)] transition-colors">Pipeline Ingest</a>
            <a href="#section-resolve" onClick={(e) => handleNavClick(e, "#section-resolve")} className="hover:text-[var(--color-ink)] transition-colors">Reconciliation</a>
            <a href="#section-decay" onClick={(e) => handleNavClick(e, "#section-decay")} className="hover:text-[var(--color-ink)] transition-colors">Memory Health</a>
            <a href="#section-insights" onClick={(e) => handleNavClick(e, "#section-insights")} className="hover:text-[var(--color-ink)] transition-colors">Insights &amp; Guidance</a>
          </div>

          {/* Column 3: Resources */}
          <div className="flex flex-col gap-3">
            <span className="font-semibold text-[var(--color-ink)] uppercase tracking-wider text-[10px]">Resources</span>
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">GitHub</a>
            <a href="https://github.com/Aditya060806/Engram/blob/main/README.md" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Documentation</a>
            <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Video Demo</a>
          </div>

          {/* Column 4: Tech Stack */}
          <div className="flex flex-col gap-3">
            <span className="font-semibold text-[var(--color-ink)] uppercase tracking-wider text-[10px]">Frameworks</span>
            <a href="https://cognee.ai" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Cognee SDK</a>
            <a href="https://nextjs.org" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Next.js 15</a>
            <a href="https://fastapi.tiangolo.com" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">FastAPI</a>
          </div>

        </div>

        <div className="max-w-[1200px] mx-auto mt-16 pt-8 border-t border-[var(--color-hairline)] flex flex-col md:flex-row items-center justify-between gap-4 text-[var(--color-muted)]">
          <p>© 2026 Engram AI. Built for WeMakeDevs x Cognee Hackathon.</p>
          <a href="https://github.com/Aditya060806/Engram" target="_blank" rel="noreferrer" className="hover:text-[var(--color-ink)] transition-colors">Repository Home</a>
        </div>
      </footer>
    </div>
  );
}
