import type {
  GraphSnapshot,
  ConflictEvent,
  ChatMessage,
  DecaySettings,
  Source,
  IngestionJob,
  SourceType,
  SchemaInventoryItem,
  SessionEntry,
  GuidanceResult,
  MemoryRecap,
} from "./types";
import { setCache, getCache, invalidateCache, dedupeRequest } from "./api-cache";

const API_BASE = "/api/proxy";

function parseAPIError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.detail) {
      const detail = parsed.detail;
      if (typeof detail === "string" && detail.includes("error") && detail.includes("message")) {
        try {
          const startIdx = detail.indexOf("{");
          if (startIdx !== -1) {
            const nestedJson = detail.substring(startIdx);
            const nestedParsed = JSON.parse(nestedJson);
            if (nestedParsed.error?.message) {
              return nestedParsed.error.message;
            }
          }
        } catch {}
      }
      return detail;
    }
  } catch {}

  if (status === 403) return "Access denied.";
  if (status === 401) return "Unauthorized session. Please check your credentials.";
  if (status === 404) return "Requested resource not found.";
  if (status === 502 || status === 503 || status === 504) {
    return "The backend is waking up (free hosting sleeps when idle). Give it up to a minute, then ask again.";
  }
  if (status >= 500) return "Server error. Make sure the backend is running correctly.";
  return `Request failed with status ${status}`;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const cleanMsg = parseAPIError(res.status, body);
    throw new Error(cleanMsg);
  }
  return res.json();
}

function cachedFetch<T>(endpoint: string, ttlMs: number): Promise<T> {
  const cached = getCache<T>(endpoint);
  if (cached) return Promise.resolve(cached);
  return dedupeRequest(endpoint, async () => {
    const data = await fetchAPI<T>(endpoint);
    setCache(endpoint, data, ttlMs);
    return data;
  }, { method: "GET" });
}

export async function ingestSource(
  type: SourceType,
  content: string,
  label: string,
  url?: string,
  pathFilter?: string,
): Promise<{ jobId: string }> {
  const result = await fetchAPI<{ jobId: string }>("/ingest", {
    method: "POST",
    body: JSON.stringify({ type, content, label, url, pathFilter }),
  });
  invalidateCache("/ingest");
  return result;
}

export async function getIngestionJob(jobId: string): Promise<IngestionJob> {
  return fetchAPI(`/ingest/${jobId}`);
}

export async function getGraphSnapshot(): Promise<GraphSnapshot> {
  return cachedFetch<GraphSnapshot>("/graph-snapshot", 30_000);
}

export async function forgetNode(nodeId: string): Promise<void> {
  await fetchAPI("/forget/node", {
    method: "POST",
    body: JSON.stringify({ nodeId }),
  });
  invalidateCache("/forget/node");
}

export async function forgetSource(sourceId: string): Promise<void> {
  await fetchAPI("/forget/source", {
    method: "POST",
    body: JSON.stringify({ sourceId }),
  });
  invalidateCache("/forget/source");
}

export async function getConflictEvents(): Promise<ConflictEvent[]> {
  return cachedFetch<ConflictEvent[]>("/reconciliation/events", 30_000);
}

export async function resolveConflict(
  eventId: string,
  resolution: "keep_old" | "keep_new" | "keep_both",
  note?: string,
): Promise<void> {
  await fetchAPI("/reconciliation/resolve", {
    method: "POST",
    body: JSON.stringify({ eventId, resolution, note }),
  });
  invalidateCache("/reconciliation/resolve");
}

export async function answerQuery(query: string, signal?: AbortSignal): Promise<ChatMessage> {
  return fetchAPI("/recall", {
    method: "POST",
    body: JSON.stringify({ query }),
    signal,
  });
}

export async function getAskTopics(): Promise<{ trackedTopics: string[]; timelineTopics: string[] }> {
  return cachedFetch<{ trackedTopics: string[]; timelineTopics: string[] }>("/topics", 60_000);
}

export async function getAskQuestions(): Promise<string[]> {
  return fetchAPI<string[]>("/ask-questions");
}

export async function runDecayCheck(): Promise<{ forgotten: number; decayed: number }> {
  const result = await fetchAPI<{ forgotten: number; decayed: number }>("/decay/run", {
    method: "POST",
  });
  invalidateCache("/reset-demo");
  return result;
}

export async function improveMemory(): Promise<{ status: string; backend?: string; dataset?: string }> {
  const result = await fetchAPI<{ status: string; backend?: string; dataset?: string }>("/memory/improve", {
    method: "POST",
  });
  invalidateCache("/memory/improve");
  return result;
}

export async function getDecaySettings(): Promise<DecaySettings> {
  return cachedFetch<DecaySettings>("/decay/settings", 300_000);
}

export async function updateDecaySettings(settings: DecaySettings): Promise<void> {
  await fetchAPI("/decay/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  invalidateCache("/decay/settings");
}

export async function getSources(): Promise<Source[]> {
  return cachedFetch<Source[]>("/sources", 30_000);
}

export async function searchNodes(query: string): Promise<{ id: string; label: string; confidence: number; status: string }[]> {
  return fetchAPI(`/nodes/search?q=${encodeURIComponent(query)}`);
}

export async function summarizeNode(nodeId: string, label: string, sourceProvenance: string): Promise<{ summary: string }> {
  return fetchAPI("/nodes/summarize", {
    method: "POST",
    body: JSON.stringify({ nodeId, label, sourceProvenance }),
  });
}

export async function resetDemoData(): Promise<void> {
  await fetchAPI("/reset-demo", { method: "POST" });
  invalidateCache("/reset-demo");
}

export interface CogneeActivityLog {
  timestamp: string;
  operation: string;
  details: string;
}

export async function getCogneeActivity(): Promise<CogneeActivityLog[]> {
  return fetchAPI("/cognee/activity");
}

export interface CogneeGraphStatus {
  backend: string;
  dataset: string;
  nodeCount: number;
  ready: boolean;
  building: boolean;
}

export async function getCogneeGraphStatus(): Promise<CogneeGraphStatus> {
  return fetchAPI("/cognee/graph-status");
}

export interface AIConfig {
  configured: boolean;
  provider?: string;
  model?: string;
}

export async function getAIConfig(): Promise<AIConfig> {
  return cachedFetch<AIConfig>("/ai/config", 300_000);
}

export async function saveAIConfig(provider: string, apiKey: string, model: string): Promise<{ status: string }> {
  const result = await fetchAPI<{ status: string }>("/ai/config", {
    method: "POST",
    body: JSON.stringify({ provider, apiKey, model }),
  });
  invalidateCache("/ai/config");
  return result;
}

export async function deleteAIConfig(): Promise<{ status: string }> {
  const result = await fetchAPI<{ status: string }>("/ai/config", {
    method: "DELETE",
  });
  invalidateCache("/ai/config");
  return result;
}

export async function getAIModels(provider: string, key: string): Promise<{ models: string[] }> {
  return fetchAPI("/ai/models", {
    method: "POST",
    body: JSON.stringify({ provider, key }),
  });
}

export async function getSchemaInventory(): Promise<SchemaInventoryItem[]> {
  return cachedFetch<SchemaInventoryItem[]>("/schema-inventory", 60_000);
}

export async function getMemoryRecap(windowDays: number = 7): Promise<MemoryRecap> {
  return cachedFetch<MemoryRecap>(`/recap?window=${windowDays}`, 30_000);
}

export async function getSessionHistory(sessionId: string = "default_session", lastN: number = 5): Promise<SessionEntry[]> {
  return fetchAPI("/session/history", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, last_n: lastN }),
  });
}

export async function distillSession(sessionId: string = "default_session"): Promise<GuidanceResult> {
  return fetchAPI("/session/distill", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function rememberChatTurn(
  question: string,
  answer: string,
  context: string = "",
  sessionId: string = "default_session",
): Promise<void> {
  await fetchAPI("/session/remember", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, question, answer, context }),
  });
}

// ── Server-side chat history (durable, cross-device) ──
export interface ServerConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export async function listServerConversations(): Promise<ServerConversationMeta[]> {
  return fetchAPI("/chat/conversations");
}

export async function getServerConversation(convId: string): Promise<{ id: string; messages: ChatMessage[] }> {
  return fetchAPI(`/chat/conversations/${encodeURIComponent(convId)}`);
}

export async function saveServerConversation(convId: string, title: string, messages: ChatMessage[]): Promise<void> {
  await fetchAPI("/chat/conversations", {
    method: "POST",
    body: JSON.stringify({ convId, title, messages }),
  });
}

export async function deleteServerConversation(convId: string): Promise<void> {
  await fetchAPI(`/chat/conversations/${encodeURIComponent(convId)}`, { method: "DELETE" });
}

export async function addSessionFeedback(
  sessionId: string,
  qaId: string,
  feedbackScore?: number,
  feedbackText?: string,
): Promise<void> {
  await fetchAPI("/session/feedback", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, qa_id: qaId, feedback_score: feedbackScore, feedback_text: feedbackText }),
  });
}
