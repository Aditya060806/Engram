"use client";

import { useEffect, useRef, useState } from "react";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Delay before the reveal transition kicks in (ms). */
  delay?: number;
  /** How much of the element must be visible before revealing (0-1). */
  threshold?: number;
  as?: React.ElementType;
  /** Reveal only once, then stop observing (default true). */
  once?: boolean;
}

/**
 * Reveals its children with a fade-up transition when scrolled into view.
 * Relies on the [data-reveal] utility defined in globals.css.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  threshold = 0.15,
  as: Tag = "div",
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion — reveal immediately.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  return (
    <Tag
      ref={ref}
      data-reveal={inView ? "in" : ""}
      style={{ transitionDelay: `${delay}ms` }}
      className={className}
    >
      {children}
    </Tag>
  );
}
