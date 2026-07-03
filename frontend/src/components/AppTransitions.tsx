"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Slim top bar that animates on every route change to signal instant response. */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setVisible(true);
    setWidth(18);
    const t1 = setTimeout(() => setWidth(72), 70);
    const t2 = setTimeout(() => setWidth(100), 240);
    const t3 = setTimeout(() => setVisible(false), 480);
    const t4 = setTimeout(() => setWidth(0), 540);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [pathname]);

  return (
    <div className="fixed top-0 inset-x-0 z-[70] h-[2px] pointer-events-none">
      <div
        className="h-full bg-ink transition-all duration-200 ease-out"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}

/** Re-mounts and replays a subtle enter animation whenever the route changes. */
export function RouteFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="route-enter h-full">
      {children}
    </div>
  );
}
