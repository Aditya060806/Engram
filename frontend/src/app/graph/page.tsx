"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import CountUp from "@/components/CountUp";
import { getConfidenceColor } from "@/lib/design-tokens";
import { getGraphSnapshot, forgetNode, getConflictEvents, resetDemoData, summarizeNode, getSchemaInventory } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAIConfig } from "@/context/AIConfigContext";
import { useTheme } from "@/components/ThemeProvider";
import * as THREE from "three";
import type { GraphNode, GraphEdge } from "@/lib/types";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d").then((m) => m.default || m), { ssr: false });
const ForceGraph2D = dynamic(() => import("react-force-graph-2d").then((m) => m.default || m), { ssr: false });

interface NodeDetail extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
}

function cssVar(name: string): string {
  if (typeof document === "undefined") return "#000000";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000000";
}

const COLORS = {
  get active() { return cssVar("--color-confidence-fresh"); },
  get superseded() { return cssVar("--color-muted"); },
  get rejected() { return cssVar("--color-semantic-danger"); },
  get forgotten() { return cssVar("--color-hairline-strong"); },
  get edge() { return cssVar("--color-hairline"); },
  get particle() { return cssVar("--color-confidence-fresh"); },
  get fresh() { return cssVar("--color-confidence-fresh"); },
  get fading() { return cssVar("--color-confidence-fading"); },
  get stale() { return cssVar("--color-confidence-stale"); },
};

function interpolateColor(color1: string, color2: string, factor: number) {
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);

  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `rgb(${r}, ${g}, ${b})`;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.4)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.2)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.08)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function nodeColor(node: GraphNode) {
  const level = getConfidenceColor(node.confidenceScore);
  if (level === "fresh") return COLORS.fresh;
  if (level === "fading") return COLORS.fading;
  return COLORS.stale;
}

// Apply theme-appropriate styling to a node's material in place. On light we use
// a solid opaque look (visible on white); on dark, the glowing glass look. This
// lets us recolor on theme change without remounting the graph.
function styleNodeMaterial(mat: THREE.MeshPhysicalMaterial, isLight: boolean, isFresh: boolean, color: string) {
  mat.color.set(color);
  if (isLight) {
    mat.transmission = 0;
    mat.opacity = 1;
    mat.transparent = false;
    mat.roughness = 0.45;
    mat.metalness = 0.0;
    mat.clearcoat = 0.3;
    mat.emissive.set("#000000");
    mat.emissiveIntensity = 0;
  } else {
    mat.transmission = 0.6;
    mat.opacity = 0.9;
    mat.transparent = true;
    mat.roughness = 0.05;
    mat.metalness = 0.1;
    mat.clearcoat = 1.0;
    mat.clearcoatRoughness = 0.02;
    mat.thickness = 2.0;
    mat.ior = 1.5;
    mat.emissive.set(isFresh ? "#ffffff" : "#000000");
    mat.emissiveIntensity = isFresh ? 0.15 : 0;
  }
  mat.needsUpdate = true;
}

function GraphLoadingSkeleton() {
  const nodes: { cx: number; cy: number; r: number }[] = [
    { cx: 50, cy: 30, r: 6 },
    { cx: 120, cy: 20, r: 5 },
    { cx: 190, cy: 40, r: 5.5 },
    { cx: 35, cy: 100, r: 5 },
    { cx: 120, cy: 95, r: 7 },
    { cx: 200, cy: 95, r: 5 },
    { cx: 80, cy: 160, r: 5.5 },
    { cx: 160, cy: 165, r: 5 },
  ];
  const edges: [number, number][] = [
    [0, 1], [0, 3], [1, 2], [1, 4],
    [2, 5], [3, 4], [3, 6], [4, 5],
    [4, 7], [5, 7], [6, 7],
  ];

  const nodeColor = (i: number) =>
    i === 4 ? "#777169" : i % 2 === 0 ? "#a8a29e" : "#d6d3d1";

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 bg-canvas">
      <div className="flex flex-col items-center gap-8">
        <svg width="200" height="180" viewBox="0 0 240 200" className="overflow-visible">
          {edges.map(([si, ti], i) => {
            const s = nodes[si];
            const t = nodes[ti];
            return (
              <line
                key={`e${i}`}
                x1={s.cx} y1={s.cy} x2={t.cx} y2={t.cy}
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                className="text-hairline-strong"
                strokeDasharray="200"
                strokeDashoffset="200"
                opacity="0"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="200" to="0"
                  dur="0.6s"
                  begin={`${0.5 + i * 0.08}s`}
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.16 1 0.3 1"
                  keyTimes="0;1"
                />
                <animate
                  attributeName="opacity"
                  from="0" to="0.35"
                  dur="0.3s"
                  begin={`${0.5 + i * 0.08}s`}
                  fill="freeze"
                />
              </line>
            );
          })}
          {nodes.map((n, i) => (
            <g key={`n${i}`} opacity="0">
              <animate
                attributeName="opacity"
                from="0" to="1"
                dur="0.4s"
                begin={`${i * 0.15}s`}
                fill="freeze"
              />
              <circle cx={n.cx} cy={n.cy} r="0">
                <animate
                  attributeName="r"
                  from="0" to={n.r * 3}
                  dur="0.4s"
                  begin={`${i * 0.15}s`}
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.16 1 0.3 1"
                  keyTimes="0;1"
                />
                <animate
                  attributeName="opacity"
                  from="0.3" to="0"
                  dur="0.4s"
                  begin={`${i * 0.15}s`}
                  fill="freeze"
                />
              </circle>
              <circle cx={n.cx} cy={n.cy} r={n.r} fill={nodeColor(i)}>
                <animate
                  attributeName="r"
                  from="0" to={n.r}
                  dur="0.35s"
                  begin={`${i * 0.15}s`}
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.16 1 0.3 1"
                  keyTimes="0;1"
                >
                </animate>
                <animate
                  attributeName="opacity"
                  from="0" to="1"
                  dur="0.2s"
                  begin={`${i * 0.15 + 0.15}s`}
                  fill="freeze"
                />
              </circle>
              <circle
                cx={n.cx} cy={n.cy} r={n.r + 4}
                fill="none"
                stroke={nodeColor(i)}
                strokeWidth="0.5"
                opacity="0.15"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 ${n.cx} ${n.cy}`}
                  to={`360 ${n.cx} ${n.cy}`}
                  dur="5s"
                  repeatCount="indefinite"
                  begin={`${i * 0.15 + 0.5}s`}
                />
              </circle>
            </g>
          ))}
        </svg>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0s", animationDuration: "1.2s" }} />
              <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0.15s", animationDuration: "1.2s" }} />
              <span className="w-2 h-2 rounded-full bg-muted-soft animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "1.2s" }} />
            </div>
            <span className="text-sm font-medium text-muted tracking-wide">Loading memory graph</span>
          </div>
          <p className="text-xs text-muted-soft tracking-wide">Nodes and edges forming</p>
        </div>
      </div>
    </div>
  );
}

export default function GraphPage() {
  const router = useRouter();
  const { config, loading: loadingAI, openModal } = useAIConfig();
  const { resolvedTheme } = useTheme();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const summaryCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("engram_dismiss_ai_banner") === "true";
      Promise.resolve().then(() => {
        setIsBannerDismissed(dismissed);
      });
    }
  }, []);

  const isConnected = !!config?.configured;
  const showAIBanner = !loading && !loadingAI && !isConnected && !isBannerDismissed;
  const [error, setError] = useState<string | null>(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [prevScore] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const prev = localStorage.getItem("engram_prev_health");
      return prev ? Number(prev) : null;
    }
    return null;
  });
  const fg3dRef = useRef<any>(null);
  const fg2dRef = useRef<any>(null);
  const glowTexRef = useRef<THREE.CanvasTexture | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const hoveredNodeRef = useRef<any>(null);
  const selectedNodeRef = useRef<any>(null);
  const lastSelectedNodeRef = useRef<{ id: string; time: number } | null>(null);
  // Live theme + tracked materials so we can recolor the 3D scene in place on
  // theme change (no remount, no relayout flash).
  const themeRef = useRef(resolvedTheme);
  const nodeMatsRef = useRef<Map<any, { mat: THREE.MeshPhysicalMaterial; isFresh: boolean; node: any }>>(new Map());
  const linkMatsRef = useRef<Map<any, { mat: THREE.LineBasicMaterial; link: any }>>(new Map());
  const nodeAnimationStatesRef = useRef<Map<string, { hoverProgress: number; lastTime: number }>>(new Map());

  // Memory Health Score: Weighted by avg node confidence (45%) & active ratio (15%), minus conflict penalties (up to -40%).
  // The +40 constant normalizes standard/un-decayed states to 100 before applying penalties.
  const healthScore = useMemo(() => {
    if (nodes.length === 0) return 100;
    const conflictPenalty = Math.min(40, conflictCount * 8);
    const avgConfidence = nodes.reduce((sum, n) => sum + (n.confidenceScore ?? 0.5), 0) / nodes.length;
    const confidenceContribution = avgConfidence * 45;
    const activeNodes = nodes.filter(n => n.status === "active").length;
    const activeRatio = activeNodes / nodes.length;
    const activeContribution = activeRatio * 15;
    const rawScore = confidenceContribution + activeContribution - conflictPenalty;
    return Math.max(0, Math.min(100, Math.round(rawScore + 40)));
  }, [nodes, conflictCount]);

  const relatedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const activeId = selectedNode.id;
    const connectedNodeIds = new Set<string>();
    
    edges.forEach((edge) => {
      const srcId = typeof edge.source === "object" ? (edge.source as any).id : edge.source;
      const tgtId = typeof edge.target === "object" ? (edge.target as any).id : edge.target;
      if (srcId === activeId) {
        connectedNodeIds.add(tgtId);
      } else if (tgtId === activeId) {
        connectedNodeIds.add(srcId);
      }
    });

    return nodes.filter((n) => connectedNodeIds.has(n.id) && n.id !== activeId).slice(0, 3);
  }, [selectedNode, edges, nodes]);

  useEffect(() => {
    themeRef.current = resolvedTheme;
    // Recolor tracked node/link materials in place for the new theme. Deferred to
    // the next frame so the theme's CSS variables are applied before we read them.
    const id = requestAnimationFrame(() => {
      const isLight = resolvedTheme === "light";
      nodeMatsRef.current.forEach(({ mat, isFresh, node }) => {
        styleNodeMaterial(mat, isLight, isFresh, nodeColor(node));
      });
      linkMatsRef.current.forEach(({ mat, link }) => {
        mat.color.set(link.confidence >= 0.8 ? COLORS.particle : COLORS.edge);
        mat.needsUpdate = true;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);

  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
  }, [hoveredNode]);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);
  const [use2d, setUse2d] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "2d";
    }
    return false;
  });


  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
         const { width, height } = entries[0].contentRect;
         setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { addToast } = useToast();

  const fetchGraphData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, events, schema] = await Promise.all([
        getGraphSnapshot(),
        getConflictEvents(),
        getSchemaInventory().catch(() => []),
      ]);
      setNodes(data.nodes);
      setEdges(data.edges);
      setConflictCount(events.filter((e) => e.status === "pending").length);
      const types = schema.map((s: { type: string }) => s.type).filter(Boolean);
      setEntityTypes(types);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && nodes.length > 0) {
      localStorage.setItem("engram_prev_health", String(healthScore));
    }
  }, [loading, nodes.length, healthScore]);

  useEffect(() => {
    glowTexRef.current = createGlowTexture();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGraphData();
  }, [fetchGraphData]);

  const handleLoadDemoData = async () => {
    setLoading(true);
    try {
      await resetDemoData();
      await fetchGraphData();
      addToast("Demo dataset loaded successfully", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo data");
      setLoading(false);
      addToast("Failed to load demo dataset", "error");
    }
  };

  const handleNodeClick = useCallback((node: any) => {
    const rawSummary = node.summary || "";
    const needsAiSummary = rawSummary.startsWith("File path:") || rawSummary.startsWith("Source:");
    const cached = needsAiSummary ? summaryCacheRef.current.get(node.id) : null;

    setSelectedNode({
      id: node.id,
      label: node.label,
      summary: cached || rawSummary,
      confidenceScore: node.confidenceScore ?? 0.5,
      sourceProvenance: node.sourceProvenance || "",
      lastReinforcedAt: node.lastReinforcedAt || "",
      connectionCount: node.connectionCount || 0,
      status: node.status || "active",
      isDecisionType: node.isDecisionType || false,
    });
    lastSelectedNodeRef.current = { id: node.id, time: performance.now() };

    if (needsAiSummary && !cached) {
      setSummarizing(true);
      summarizeNode(node.id, node.label || "", node.sourceProvenance || "")
        .then((res) => {
          summaryCacheRef.current.set(node.id, res.summary);
          setSelectedNode((prev) => prev && prev.id === node.id ? { ...prev, summary: res.summary } : prev);
        })
        .catch(() => {
          setSelectedNode((prev) => prev && prev.id === node.id ? { ...prev, summary: rawSummary } : prev);
        })
        .finally(() => setSummarizing(false));
    }
    if (use2d && fg2dRef.current) {
      fg2dRef.current.centerAt(node.x, node.y, 800);
    } else if (!use2d && fg3dRef.current) {
      fg3dRef.current.cameraPosition(
        { x: node.x * 1.4, y: node.y * 1.4, z: node.z * 1.4 + 80 },
        { x: node.x, y: node.y, z: node.z },
        800,
      );
    }
  }, [use2d]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    if (use2d && fg2dRef.current) {
      fg2dRef.current.zoomToFit(800);
    } else if (!use2d && fg3dRef.current) {
      fg3dRef.current.cameraPosition({ x: 0, y: 0, z: 250 }, { x: 0, y: 0, z: 0 }, 800);
    }
  }, [use2d]);

  const isConnectedToActiveNode = useCallback((link: any) => {
    const activeNode = hoveredNode || selectedNode;
    if (!activeNode) return false;
    const srcId = typeof link.source === "object" ? link.source.id : link.source;
    const tgtId = typeof link.target === "object" ? link.target.id : link.target;
    return srcId === activeNode.id || tgtId === activeNode.id;
  }, [hoveredNode, selectedNode]);

  const handleForgetNode = useCallback(async () => {
    if (!selectedNode) return;
    const id = selectedNode.id;
    try {
      await forgetNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
      setSelectedNode(null);
      addToast("Node forgotten", "success");
    } catch {
      addToast("Failed to forget node", "error");
    }
  }, [selectedNode, addToast]);

  const nodeThreeObject = useCallback(
    (node: any) => {
      const isLight = themeRef.current === "light";
      const color = nodeColor(node);
      const level = getConfidenceColor(node.confidenceScore);
      const isFresh = level === "fresh";

      const radius = node.isDecisionType ? 7 : 5;
      const geo = new THREE.SphereGeometry(radius, 32, 32);
      // One mutable material for both themes, styled per theme so it can be
      // recolored in place on theme change (see the recolor effect above).
      const mat = new THREE.MeshPhysicalMaterial();
      styleNodeMaterial(mat, isLight, isFresh, color);
      nodeMatsRef.current.set(node, { mat, isFresh, node });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.onBeforeRender = () => {
        const time = performance.now();
        const isLightNow = themeRef.current === "light";
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const isSelected = selectedNodeRef.current?.id === node.id;

        if (mesh.userData.hoverProgress === undefined) {
          mesh.userData.hoverProgress = 0;
          mesh.userData.lastTime = time;
        }
        const dt = time - mesh.userData.lastTime;
        mesh.userData.lastTime = time;

        const targetHover = isHovered ? 1 : 0;
        if (mesh.userData.hoverProgress !== targetHover) {
          const step = dt / 150;
          if (isHovered) {
            mesh.userData.hoverProgress = Math.min(1, mesh.userData.hoverProgress + step);
          } else {
            mesh.userData.hoverProgress = Math.max(0, mesh.userData.hoverProgress - step);
          }
        }

        let breatheScale = 1.0;
        if (isFresh && !isHovered) {
          const seed = node.id ? String(node.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
          breatheScale = 1.0 + 0.06 * Math.sin((time / 1000) * (Math.PI * 2 / 3) + seed);
        }

        const hoverScale = 1.25;
        const currentScale = (breatheScale * (1 - mesh.userData.hoverProgress) + hoverScale * mesh.userData.hoverProgress);
        
        let pingScale = 1.0;
        const ping = lastSelectedNodeRef.current;
        if (ping && ping.id === node.id) {
          const elapsed = time - ping.time;
          if (elapsed < 400) {
            const progress = elapsed / 400;
            pingScale = 1.0 + 0.4 * Math.sin(progress * Math.PI);
          }
        }
        
        const finalScale = currentScale * pingScale;
        mesh.scale.set(finalScale, finalScale, finalScale);

        // Emissive glow only reads on a dark background; on light it washes the
        // node toward white (less visible), so light mode uses scale for feedback.
        if (!isLightNow) {
          if (isFresh) {
            const baseGlow = 0.15 + 0.05 * Math.sin((time / 1000) * (Math.PI * 2 / 3));
            const targetGlow = isHovered || isSelected ? 0.6 : baseGlow;
            mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targetGlow, 0.1);
          } else if (isHovered || isSelected) {
            mat.emissive.set("#ffffff");
            mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.5, 0.1);
          } else {
            mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0, 0.1);
          }
        }
      };

      return mesh;
    },
    [],
  );

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label || "";
    const size = node.isDecisionType ? 11 : 8;
    const color = nodeColor(node);
    const level = getConfidenceColor(node.confidenceScore);

    const time = performance.now();
    
    const state = nodeAnimationStatesRef.current.get(node.id) || { hoverProgress: 0, lastTime: time };
    const dt = time - state.lastTime;
    state.lastTime = time;

    const isHovered = hoveredNode && hoveredNode.id === node.id;
    const targetHover = isHovered ? 1 : 0;
    if (state.hoverProgress !== targetHover) {
      const step = dt / 150;
      if (isHovered) {
        state.hoverProgress = Math.min(1, state.hoverProgress + step);
      } else {
        state.hoverProgress = Math.max(0, state.hoverProgress - step);
      }
    }
    nodeAnimationStatesRef.current.set(node.id, state);

    let breatheScale = 1.0;
    if (level === "fresh" && !isHovered) {
      const seed = node.id ? String(node.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
      breatheScale = 1.0 + 0.06 * Math.sin((time / 1000) * (Math.PI * 2 / 3) + seed);
    }

    const hoverScale = 1.25;
    const currentScale = breatheScale * (1 - state.hoverProgress) + hoverScale * state.hoverProgress;

    const ping = lastSelectedNodeRef.current;
    if (ping && ping.id === node.id) {
      const elapsed = time - ping.time;
      if (elapsed < 500) {
        const progress = elapsed / 500;
        const ringScale = 1.0 + 2.0 * progress;
        const opacity = 1.0 - progress;
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * currentScale * ringScale, 0, 2 * Math.PI, false);
        ctx.strokeStyle = `rgba(82, 82, 91, ${opacity * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const finalRadius = size * currentScale;
    ctx.beginPath();
    ctx.arc(node.x, node.y, finalRadius, 0, 2 * Math.PI, false);

    const gradient = ctx.createRadialGradient(
      node.x, node.y, 0,
      node.x, node.y, finalRadius
    );
    const lightCenter = level === "fresh" ? cssVar("--color-confidence-fading") : level === "fading" ? cssVar("--color-confidence-stale") : cssVar("--color-hairline");
    gradient.addColorStop(0, lightCenter);
    gradient.addColorStop(1, color);

    ctx.fillStyle = gradient;
    ctx.fill();

    const baseStroke = level === "fresh" ? cssVar("--color-hairline-strong") : level === "fading" ? cssVar("--color-muted") : cssVar("--color-hairline");
    const hoverStroke = level === "fresh" ? cssVar("--color-ink") : level === "fading" ? cssVar("--color-ink") : cssVar("--color-on-dark");
    const strokeColor = interpolateColor(baseStroke, hoverStroke, state.hoverProgress);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    const isSelected = selectedNode && selectedNode.id === node.id;
    const fontSize = 11 / globalScale;
    ctx.font = isSelected ? `600 ${fontSize}px sans-serif` : `${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isSelected ? cssVar("--color-ink") : cssVar("--color-body");
    ctx.fillText(label, node.x, node.y + size * currentScale + 12);
  }, [hoveredNode, selectedNode]);

  const linkThreeObject = useCallback((link: any) => {
    const color = link.confidence >= 0.8 ? COLORS.particle : COLORS.edge;
    const geo = new THREE.BufferGeometry();
    const points = [
      link.source.x || 0,
      link.source.y || 0,
      link.source.z || 0,
      link.target.x || 0,
      link.target.y || 0,
      link.target.z || 0,
    ];
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
    linkMatsRef.current.set(link, { mat, link });
    return new THREE.Line(geo, mat);
  }, []);

  const extractType = (label: string): string | null => {
    const match = label.match(/\(([^)]+)\)$/);
    return match ? match[1] : null;
  };

  const graphData = useMemo(() => {
    let filteredNodes = nodes;
    if (filterType !== "all") {
      filteredNodes = nodes.filter((n) => extractType(n.label) === filterType);
    }
    const filteredIds = new Set(filteredNodes.map((n) => n.id));
    return {
      nodes: filteredNodes.map((n) => ({ ...n, id: n.id, label: n.label })),
      links: edges.filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target)).map((e) => ({ source: e.source, target: e.target, confidence: e.confidence })),
    };
  }, [nodes, edges, filterType]);

  const empty = !loading && nodes.length === 0 && !error;

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden relative bg-canvas">
      <div ref={containerRef} className="flex-1 relative h-full w-full min-w-0 min-h-0" onDoubleClick={handleBackgroundClick}>
        {loading && <GraphLoadingSkeleton />}

        {showAIBanner && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl md:max-w-2xl z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 pr-10 sm:pr-4 rounded-xl bg-surface-card/85 border border-primary/20 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.03)] animate-fade-in relative">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5 sm:mt-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              </div>
              <div className="min-w-0 pr-4 sm:pr-0">
                <h4 className="text-sm font-semibold text-ink">Connect Your Custom AI Key</h4>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">
                  Bring your own Groq, OpenAI, or Gemini key to enable personalized memory updates, custom LLM reasoning models, and bypass global rate limits.
                </p>
              </div>
            </div>
            <button
              onClick={openModal}
              className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-active active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-sm self-start sm:self-auto shrink-0"
            >
              Add AI Key
            </button>
            <button
              onClick={() => {
                setIsBannerDismissed(true);
                localStorage.setItem("engram_dismiss_ai_banner", "true");
              }}
              className="absolute top-3.5 right-3 p-1 rounded-lg text-muted hover:text-ink hover:bg-surface-strong transition-colors cursor-pointer"
              aria-label="Dismiss banner"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 12L12 4M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-canvas">
            <EmptyState icon="graph" title="Could not load graph" description={error} />
          </div>
        )}

        {empty && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-canvas">
            <div className="flex flex-col items-center">
              <EmptyState
                icon="graph"
                title="Nothing to remember yet"
                description="Your memory starts empty. Point Engram at a GitHub repo, a PDF, an article, or a chat export and watch the graph assemble itself."
              />
              <div className="mt-4 flex flex-wrap gap-4 justify-center relative z-20">
                <button
                  onClick={() => router.push("/ingest")}
                  className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-[14px] font-semibold hover:bg-primary-active active:scale-[0.98] transition-all duration-150 cursor-pointer shadow-sm"
                >
                  Add your first memory
                </button>
                <button
                  onClick={handleLoadDemoData}
                  className="px-5 py-2.5 rounded-full bg-surface-strong border border-hairline-strong text-ink text-[14px] font-semibold hover:bg-surface-card-active active:scale-[0.98] transition-all duration-150 cursor-pointer shadow-sm"
                >
                  Load demo data
                </button>
              </div>
            </div>
          </div>
        )}

        {!empty && !loading && !error && (
          <>
            {dimensions.width > 0 && dimensions.height > 0 && (
              use2d ? (
                <ForceGraph2D
                  key="fg2d"
                  ref={fg2dRef}
                  width={dimensions.width}
                  height={dimensions.height}
                  graphData={graphData}
                  nodeCanvasObject={nodeCanvasObject}
                  linkWidth={(link) => isConnectedToActiveNode(link) ? 1.5 : 0.8}
                  linkColor={(link) => isConnectedToActiveNode(link) ? COLORS.particle : COLORS.edge}
                  linkDirectionalParticles={(link) => isConnectedToActiveNode(link) ? 4 : 1}
                  linkDirectionalParticleSpeed={(link) => isConnectedToActiveNode(link) ? 0.015 : 0.003}
                  linkDirectionalParticleCanvasObject={(x: number, y: number, link: any, ctx: CanvasRenderingContext2D) => {
                    const isActive = isConnectedToActiveNode(link);
                    const size = 1.2;

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, size, 0, 2 * Math.PI, false);

                    if (isActive) {
                      ctx.shadowColor = cssVar("--color-conflict-warning") + "85";
                      ctx.shadowBlur = 12;
                      ctx.fillStyle = cssVar("--color-conflict-warning");
                    } else {
                      ctx.shadowColor = cssVar("--color-muted-soft") + "59";
                      ctx.shadowBlur = 4;
                      ctx.fillStyle = cssVar("--color-muted-soft");
                    }

                    ctx.fill();
                    ctx.restore();
                  }}
                  onNodeClick={handleNodeClick}
                  onNodeHover={setHoveredNode}
                  backgroundColor={resolvedTheme === "light" ? "#ffffff" : "#000000"}
                  nodeLabel="label"
                  d3VelocityDecay={0.3}
                  d3AlphaDecay={0.02}
                  warmupTicks={100}
                  cooldownTicks={30}
                />
              ) : (
                <ForceGraph3D
                  key="fg3d"
                  ref={fg3dRef}
                  width={dimensions.width}
                  height={dimensions.height}
                  graphData={graphData}
                  nodeThreeObject={nodeThreeObject}
                  linkThreeObject={linkThreeObject}
                  linkWidth={(link) => isConnectedToActiveNode(link) ? 1.5 : 0.8}
                  linkOpacity={0.3}
                  linkDirectionalParticles={(link) => isConnectedToActiveNode(link) ? 4 : 1}
                  linkDirectionalParticleSpeed={(link) => isConnectedToActiveNode(link) ? 0.015 : 0.003}
                  linkDirectionalParticleWidth={(link) => isConnectedToActiveNode(link) ? 2.5 : 1.2}
                  linkDirectionalParticleColor={(link) => isConnectedToActiveNode(link) ? cssVar("--color-conflict-warning") : cssVar("--color-muted-soft")}
                  linkCurvature={0.05}
                  onNodeClick={handleNodeClick}
                  onNodeHover={setHoveredNode}
                  backgroundColor={resolvedTheme === "light" ? "#ffffff" : "#000000"}
                  nodeLabel="label"
                  nodeResolution={24}
                  d3VelocityDecay={0.3}
                  d3AlphaDecay={0.02}
                  warmupTicks={100}
                  cooldownTicks={30}
                  rendererConfig={{ antialias: true, alpha: true }}
                />
              )
            )}

            <div className="absolute bottom-20 md:bottom-6 left-4 right-4 md:left-6 md:right-auto flex flex-col md:flex-row items-start md:items-center gap-2.5 md:gap-4 px-4 py-3 rounded-2xl md:rounded-full bg-surface-card border border-hairline shadow-md z-10 pointer-events-none md:pointer-events-auto">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted font-semibold uppercase tracking-wider">Memory Health</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  healthScore >= 85 
                    ? "bg-semantic-success/10 text-semantic-success" 
                    : healthScore >= 60 
                      ? "bg-conflict-warning/10 text-conflict-warning" 
                      : "bg-semantic-error/10 text-semantic-error"
                }`}>
                  <CountUp value={healthScore} suffix="%" duration={900} />
                  {prevScore !== null && prevScore !== healthScore && (
                    <span className={healthScore > prevScore ? "text-semantic-success font-semibold" : "text-semantic-error font-semibold"}>
                      {healthScore > prevScore ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3.5 pointer-events-auto mt-2 md:mt-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-confidence-fresh" />
                  <span className="text-xs text-body font-medium">Fresh</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-confidence-fading" />
                  <span className="text-xs text-body font-medium">Fading</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-confidence-stale" />
                  <span className="text-xs text-body font-medium">Stale</span>
                </div>
                {entityTypes.length > 0 && (
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="text-[10px] uppercase tracking-wider text-body font-bold bg-surface-strong/60 border border-hairline rounded-md px-2 py-1 outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    {entityTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
                <div className="hidden sm:block w-px h-3 bg-hairline mx-1" />
                <button
                  onClick={() => setUse2d(!use2d)}
                  className="text-[10px] uppercase tracking-wider text-body font-bold hover:text-primary transition-colors cursor-pointer select-none bg-surface-strong/60 px-2.5 py-1 rounded-md sm:bg-transparent sm:p-0"
                >
                  {use2d ? "Switch to 3D" : "Switch to 2D"}
                </button>
              </div>
            </div>

            <div className={`hidden md:flex absolute ${showAIBanner ? "top-28" : "top-6"} left-6 items-center gap-2.5 px-4 py-2 rounded-full bg-surface-card/85 backdrop-blur-md border border-hairline z-10 pointer-events-none shadow-sm transition-all duration-300`}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="#777169" strokeWidth="1" />
                <path d="M6 3v3l2 2" stroke="#777169" strokeWidth="1" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-medium text-body">Drag to orbit &middot; Scroll to zoom &middot; Click node</span>
            </div>

            <Link
              href="/resolve"
              className={`absolute ${showAIBanner ? "top-52 sm:top-28" : "top-4 md:top-6"} right-4 md:right-6 flex items-center gap-2 px-4 py-2 rounded-full bg-surface-card border border-hairline z-10 hover:bg-surface-strong transition-all duration-300 cursor-pointer shadow-md`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="#e0a328" strokeWidth="1.3" />
                <path d="M7 4V7.5M7 10V10.01" stroke="#e0a328" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-semibold text-body">What Changed</span>
              {conflictCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-conflict-warning/15 border border-conflict-warning/30 text-xs font-bold text-conflict-warning">
                  {conflictCount}
                </span>
              )}
            </Link>
          </>
        )}
      </div>

      {selectedNode && !empty && (
        <div className="animate-fade-in absolute inset-x-0 bottom-0 top-auto md:relative md:w-[380px] md:h-full border-t md:border-t-0 md:border-l border-hairline bg-surface-card/95 md:bg-surface-card backdrop-blur-xl md:backdrop-blur-none overflow-y-auto scrollbar-thin z-20 max-h-[60vh] md:max-h-full rounded-t-2xl md:rounded-none shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
          <div className="p-6 pb-24 md:pb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: nodeColor(selectedNode) }}
                />
                <h3 className="text-base font-semibold text-ink tracking-tight">{selectedNode.label}</h3>
              </div>
                    <button
                      onClick={() => {
                        setSelectedNode(null);
                        if (use2d && fg2dRef.current) {
                          fg2dRef.current.zoomToFit(800);
                        } else if (!use2d && fg3dRef.current) {
                          fg3dRef.current.cameraPosition({ x: 0, y: 0, z: 250 }, { x: 0, y: 0, z: 0 }, 800);
                        }
                      }}
                className="text-muted hover:text-ink transition-colors duration-150 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Confidence</span>
                <div className="mt-1.5">
                  <ConfidenceBadge level={getConfidenceColor(selectedNode.confidenceScore)} score={selectedNode.confidenceScore} />
                </div>
              </div>

              {(selectedNode.summary && !selectedNode.summary.startsWith("File path:") && !selectedNode.summary.startsWith("Source:")) || summarizing ? (
                <div>
                  <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Summary</span>
                  {summarizing ? (
                    <p className="mt-1.5 text-[14px] text-body leading-relaxed text-muted-soft italic">Generating summary...</p>
                  ) : (
                    <p className="mt-1.5 text-[14px] text-body leading-relaxed">{selectedNode.summary}</p>
                  )}
                </div>
              ) : null}

              {selectedNode.sourceProvenance && (
                <div>
                  <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Source</span>
                  <p className="mt-1.5 text-sm text-body font-medium">{selectedNode.sourceProvenance}</p>
                </div>
              )}

              <div>
                <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Last reinforced</span>
                <p className="mt-1.5 text-sm text-body">{selectedNode.lastReinforcedAt || "Unknown"}</p>
              </div>

              <div>
                <span className="caption-upper text-muted" style={{ fontSize: "10px" }}>Status</span>
                <div className="mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      selectedNode.status === "active"
                        ? "bg-semantic-success/10 text-semantic-success"
                        : selectedNode.status === "superseded"
                          ? "bg-conflict-warning/10 text-conflict-warning"
                          : "bg-surface-strong text-muted"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedNode.status === "active"
                          ? "bg-semantic-success"
                          : selectedNode.status === "superseded"
                            ? "bg-conflict-warning"
                            : "bg-muted"
                      }`}
                    />
                    {selectedNode.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Related Memories */}
            {relatedNodes.length > 0 && (
              <div className="mt-6 pt-5 border-t border-hairline">
                <span className="caption-upper text-muted block mb-2.5" style={{ fontSize: "10px" }}>Related Memories</span>
                <div className="space-y-2">
                  {relatedNodes.map((rn) => (
                    <button
                      key={rn.id}
                      onClick={() => {
                        setSelectedNode({
                          id: rn.id,
                          label: rn.label,
                          summary: rn.summary || "",
                          confidenceScore: rn.confidenceScore ?? 0.5,
                          sourceProvenance: rn.sourceProvenance || "",
                          lastReinforcedAt: rn.lastReinforcedAt || "",
                          connectionCount: rn.connectionCount || 0,
                          status: rn.status || "active",
                          isDecisionType: rn.isDecisionType || false,
                        });
                        const graphRef = use2d ? fg2dRef.current : fg3dRef.current;
                        const fgNode = graphRef?.graphData?.()?.nodes?.find((n: any) => n.id === rn.id);
                        if (fgNode && graphRef) {
                          if (use2d) {
                            graphRef.centerAt(fgNode.x, fgNode.y, 800);
                          } else {
                            graphRef.cameraPosition(
                              { x: fgNode.x * 1.4, y: fgNode.y * 1.4, z: fgNode.z * 1.4 + 80 },
                              { x: fgNode.x, y: fgNode.y, z: fgNode.z },
                              800
                            );
                          }
                        }
                      }}
                      className="card-lift w-full text-left p-3 rounded-xl border border-hairline bg-surface-card hover:bg-surface-strong transition-all duration-150 relative overflow-hidden group shadow-sm flex items-center justify-between gap-3 text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: nodeColor(rn) }}
                        />
                        <span className="font-semibold text-ink truncate">{rn.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-soft shrink-0 group-hover:translate-x-0.5 transition-transform">trace &rarr;</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px] text-muted-soft italic" style={{ letterSpacing: "0.15px" }}>This connection was detected automatically by Engram.</p>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-hairline">
              <button
                onClick={handleForgetNode}
                className="w-full px-4 py-2.5 rounded-full bg-semantic-error/10 border border-semantic-error/20 text-semantic-error text-sm font-semibold hover:bg-semantic-error/20 transition-all duration-150 cursor-pointer"
              >
                Forget this node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

