from typing import Optional, Literal
from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    type: Literal["pdf", "github", "conversation", "article", "youtube"]
    content: str = Field(..., max_length=500_000)
    label: str = Field(..., max_length=200)
    url: Optional[str] = Field(None, max_length=2000)
    pathFilter: Optional[str] = Field(None, max_length=500)


class IngestResponse(BaseModel):
    jobId: str
    status: str


class IngestionJob(BaseModel):
    id: str
    sourceId: str
    currentStep: str
    progress: float
    status: Literal["running", "completed", "failed"]
    error: Optional[str] = None


class GraphNode(BaseModel):
    id: str
    label: str
    summary: str
    confidenceScore: float
    sourceProvenance: str
    lastReinforcedAt: str
    connectionCount: int
    status: str
    isDecisionType: bool


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str
    confidence: float


class GraphSnapshot(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class RecallRequest(BaseModel):
    query: str = Field(..., max_length=2_000)


class SourcePill(BaseModel):
    label: str
    type: str


class DiffCard(BaseModel):
    topic: str
    sinceDate: str
    added: list[str]
    removed: list[str]
    changed: list[tuple[str, str]]
    newDecisions: list[str]


class TimelinePoint(BaseModel):
    date: str
    valueSummary: str
    confidenceScore: float
    reason: str


class ConnectionItem(BaseModel):
    nodeLabel: str
    type: str
    description: str


class ConnectionMap(BaseModel):
    topic: str
    connections: list[ConnectionItem]


class ChatMessage(BaseModel):
    id: str
    query: str
    intent: Optional[str] = None
    answer: str
    sources: list[SourcePill]
    diffCard: Optional[DiffCard] = None
    timeline: Optional[list[TimelinePoint]] = None
    connectionMap: Optional[ConnectionMap] = None
    timestamp: str
    qa_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None


class ConflictEvent(BaseModel):
    id: str
    oldNodeSummary: str
    oldNodeDate: str
    oldNodeSource: str
    newNodeSummary: str
    newNodeDate: str
    newNodeSource: str
    topic: str
    relationship: Literal["contradicts", "supersedes"]
    llmConfidence: float
    status: Literal[
        "pending", "resolved_keep_old", "resolved_keep_new", "resolved_keep_both", "forgotten"
    ]
    resolutionNote: Optional[str] = None
    createdAt: str


class ResolveRequest(BaseModel):
    eventId: str
    resolution: Literal["keep_old", "keep_new", "keep_both"]
    note: Optional[str] = None


class ForgetNodeRequest(BaseModel):
    nodeId: str


class ForgetSourceRequest(BaseModel):
    sourceId: str


class ReconciliationLogEntry(BaseModel):
    id: str
    eventType: str  # 'added' | 'removed' | 'changed' | 'new_decision'
    topic: str
    oldSummary: Optional[str] = None
    newSummary: Optional[str] = None
    source: Optional[str] = None
    createdAt: str

class ConfidenceHistoryEntry(BaseModel):
    id: str
    topic: str
    valueSummary: str
    confidenceScore: float
    reason: str  # 'initial_ingest' | 'reinforced' | 'decay_tick' | 'superseded'
    date: str

class DecaySettings(BaseModel):
    decayStartDays: int = 60
    forgetThresholdDays: int = 180


class DecayResult(BaseModel):
    forgotten: int
    decayed: int


class Source(BaseModel):
    id: str
    type: str
    label: str
    url: Optional[str] = None
    filePath: Optional[str] = None
    ingestedAt: str
    lastSyncedAt: Optional[str] = None
    status: str


class NodeSearchResult(BaseModel):
    id: str
    label: str
    confidence: float
    status: str


# ── Memory Recap ("Where's My Context?") ──
class RecapEvent(BaseModel):
    kind: Literal["ingested", "decided", "contradiction", "forgotten", "reinforced"]
    topic: str
    detail: str
    source: Optional[str] = None
    date: str


class RecapStats(BaseModel):
    sourcesAdded: int = 0
    decisionsMade: int = 0
    contradictionsDetected: int = 0
    contradictionsResolved: int = 0
    factsForgotten: int = 0
    factsReinforced: int = 0


class MemoryRecap(BaseModel):
    generatedAt: str
    windowDays: int
    headline: str
    narrative: str
    stats: RecapStats
    events: list[RecapEvent]
    hasData: bool
