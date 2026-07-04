"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme, attribute: string) {
  const root = document.documentElement;

  // Suppress the global color transitions during the swap. Animating
  // background/border/color on every element at once causes a heavy, laggy
  // full-page repaint; disabling transitions makes the switch instant and
  // smooth, then we restore them on the next frame.
  const override = document.createElement("style");
  override.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none !important;animation:none !important}"
    )
  );
  document.head.appendChild(override);

  root.classList.remove("light", "dark");
  root.classList.add(theme);
  if (attribute === "class") {
    root.setAttribute("data-theme", theme);
  }
  root.style.colorScheme = theme;

  // Force a reflow so the style change is flushed before transitions return.
  void window.getComputedStyle(root).opacity;
  window.requestAnimationFrame(() => {
    override.remove();
  });
}

function getInitialTheme(storageKey: string, defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const stored = localStorage.getItem(storageKey) as Theme | null;
    return stored || defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export default function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  attribute = "class",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() =>
    getInitialTheme(storageKey, defaultTheme)
  );
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(() =>
    defaultTheme === "system" ? getSystemTheme() : "light"
  );

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (theme === "system" ? systemPref : theme),
    [theme, systemPref]
  );

  useEffect(() => {
    applyTheme(resolvedTheme, attribute);
  }, [resolvedTheme, attribute]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemPref(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setThemeState(e.newValue as Theme);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {}
    },
    [storageKey]
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
