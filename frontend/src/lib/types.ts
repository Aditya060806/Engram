export type SourceType = "pdf" | "github" | "conversation" | "article" | "youtube";

export type SourceStatus = "processing" | "ready" | "failed";

export interface Source {
  id: string;
  type: SourceType;
  label: string;
  url: string | null;
  ingestedAt: string;
  lastSyncedAt: string | null;
  status: SourceStatus;
}

export interface GraphNode {
  id: string;
  label: string;
  summary: string;
  confidenceScore: number;
  sourceProvenance: string;
  lastReinforcedAt: string;
  connectionCount: number;
  status: "active" | "superseded" | "rejected" | "forgotten";
  isDecisionType: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  confidence: number;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ConflictEvent {
  id: string;
  oldNodeSummary: string;
  oldNodeDate: string;
  oldNodeSource: string;
  newNodeSummary: string;
  newNodeDate: string;
  newNodeSource: string;
  topic: string;
  relationship: "contradicts" | "supersedes";
  llmConfidence: number;
  status: "pending" | "resolved_keep_old" | "resolved_keep_new" | "resolved_keep_both" | "forgotten";
  resolutionNote: string | null;
  createdAt: string;
}

export type QueryIntent = "what_changed" | "temporal_belief" | "standard";

export interface DiffCard {
  topic: string;
  sinceDate: string;
  added: string[];
  removed: string[];
  changed: [string, string][];
  newDecisions: string[];
}

export interface TimelinePoint {
  date: string;
  valueSummary: string;
  confidenceScore: number;
  reason: string;
}

export interface ConnectionItem {
  nodeLabel: string;
  type: "shared_source" | "temporal_proximity" | "semantic_link";
  description: string;
}

export interface ConnectionMap {
  topic: string;
  connections: ConnectionItem[];
}

export interface ChatMessage {
  id: string;
  query: string;
  intent: QueryIntent | "cross_correlation" | null;
  answer: string;
  sources: { label: string; type: SourceType }[];
  diffCard: DiffCard | null;
  timeline: TimelinePoint[] | null;
  connectionMap?: ConnectionMap | null;
  timestamp: string;
  isError?: boolean;
  qa_id?: string;
  provider?: string;
  model?: string;
}

export interface DecaySettings {
  decayStartDays: number;
  forgetThresholdDays: number;
}

export interface SchemaInventoryItem {
  type: string;
  count: number;
  samples: string[];
  sample_size: number;
  relationships: { source: string; target: string; count: number }[];
}

export interface SessionEntry {
  qa_id: string;
  question: string;
  answer: string;
  time: string;
  feedback_score: number | null;
  feedback_text: string | null;
}

export interface GuidanceResult {
  session_id: string;
  status: string;
  documents: string[];
}

export type RecapEventKind = "ingested" | "decided" | "contradiction" | "forgotten" | "reinforced";

export interface RecapEvent {
  kind: RecapEventKind;
  topic: string;
  detail: string;
  source: string | null;
  date: string;
}

export interface RecapStats {
  sourcesAdded: number;
  decisionsMade: number;
  contradictionsDetected: number;
  contradictionsResolved: number;
  factsForgotten: number;
  factsReinforced: number;
}

export interface MemoryRecap {
  generatedAt: string;
  windowDays: number;
  headline: string;
  narrative: string;
  stats: RecapStats;
  events: RecapEvent[];
  hasData: boolean;
}

export type IngestionStep = "fetching" | "extracting" | "remember" | "improve";

export interface IngestionJob {
  id: string;
  sourceId: string;
  currentStep: IngestionStep;
  progress: number;
  status: "running" | "completed" | "failed";
  error: string | null;
}
