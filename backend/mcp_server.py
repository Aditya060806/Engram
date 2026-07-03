"""
Engram MCP server.

Exposes Engram's Cognee-backed memory as MCP tools so any agent or pipeline can
use it as a persistent, self-reconciling memory backend across runs, not just
read from it. This is the "never-forget workflows" story: an agent can remember
new facts, recall them later, enrich the graph, prune stale items, and see what
needs review, all through the same lifecycle the dashboard uses.

Tools:
  read  : engram_recall, engram_graph_snapshot, engram_review
  write : engram_remember, engram_improve, engram_forget

Memory is scoped to a stable agent user (ENGRAM_MCP_USER_ID, default "mcp_agent")
so it persists across sessions and stays isolated from the web dashboard user.
"""
import asyncio
import os

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from models import RecallRequest, IngestRequest
from services import (
    answer_query,
    get_graph_snapshot,
    ingest_source,
    get_ingestion_job,
    run_memory_improve,
    forget_node,
    forget_source,
    get_review_candidates,
    set_current_user,
)

app = Server("engram-mcp")

# Stable identity so an agent's memory persists across runs and is isolated
# from the interactive dashboard user.
MCP_USER_ID = os.environ.get("ENGRAM_MCP_USER_ID", "mcp_agent")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="engram_recall",
            description="Query the Engram knowledge graph to get answers and confidence timelines.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The question to ask Engram (e.g. 'what changed about my database choice?')",
                    }
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="engram_graph_snapshot",
            description="Get a snapshot of the entire Engram knowledge graph nodes and edges.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="engram_remember",
            description=(
                "Store a new fact, note, or decision in Engram's memory. Engram structures it "
                "into the knowledge graph and reconciles it against what is already known. Use "
                "this to carry context between runs so the agent learns over time."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The fact, note, or decision to remember.",
                    },
                    "label": {
                        "type": "string",
                        "description": "Optional short title for this memory. Derived from the text if omitted.",
                    },
                },
                "required": ["text"],
            },
        ),
        Tool(
            name="engram_improve",
            description=(
                "Run post-ingestion enrichment (improve/memify): re-runs entity extraction, "
                "summarization, and graph enrichment so memory gets sharper over time."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="engram_forget",
            description=(
                "Prune something from memory. Provide either sourceId (removes an entire "
                "ingested source) or nodeId (removes a single node)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "sourceId": {"type": "string", "description": "Id of the source to forget."},
                    "nodeId": {"type": "string", "description": "Id of the single node to forget."},
                },
                "required": [],
            },
        ),
        Tool(
            name="engram_review",
            description=(
                "List the facts most in need of review, lowest confidence first. Confidence "
                "doubles as a mastery/freshness signal, useful for tutoring or re-confirmation loops."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "How many items to return (default 10)."}
                },
                "required": [],
            },
        ),
    ]


async def _handle_recall(arguments: dict) -> str:
    query = arguments.get("query")
    req = RecallRequest(query=query)
    msg = await answer_query(req)
    out = f"Answer: {msg.answer}\n"
    if msg.provider:
        out += f"(source: {msg.provider}"
        out += f" / {msg.model})\n" if msg.model else ")\n"
    if msg.diffCard:
        out += f"\nWhat Changed since {msg.diffCard.sinceDate}:\n"
        out += f"Added: {msg.diffCard.added}\n"
        out += f"Removed: {msg.diffCard.removed}\n"
        out += f"Changed: {msg.diffCard.changed}\n"
        out += f"New Decisions: {msg.diffCard.newDecisions}\n"
    if msg.timeline:
        out += "\nTimeline:\n"
        for t in msg.timeline:
            out += f"[{t.date}] {t.valueSummary} (confidence: {t.confidenceScore})\n"
    return out


async def _handle_graph_snapshot() -> str:
    snap = await get_graph_snapshot()
    out = f"Graph Snapshot (Total Nodes: {len(snap.nodes)}, Edges: {len(snap.edges)})\n\n"
    for n in snap.nodes:
        out += f"Node [{n.id}]: {n.label} (Status: {n.status}, Confidence: {n.confidenceScore})\n"
    return out


async def _handle_remember(arguments: dict) -> str:
    text = (arguments.get("text") or "").strip()
    if not text:
        return "Nothing to remember: 'text' was empty."
    label = (arguments.get("label") or " ".join(text.split()[:6]))[:200] or "Note"
    resp = await ingest_source(IngestRequest(type="text", content=text[:500_000], label=label))
    job_id = resp.jobId
    # Poll to completion so the agent gets a definitive result (ingest + graph build).
    status = "running"
    for _ in range(60):  # up to ~2 minutes
        job = await get_ingestion_job(job_id)
        status = job.get("status", "running")
        if status in ("completed", "failed", "not_found"):
            break
        await asyncio.sleep(2)
    if status == "completed":
        return f"Remembered '{label}'. It has been structured into the graph and reconciled (jobId={job_id})."
    if status == "failed":
        return f"Failed to remember '{label}' (jobId={job_id})."
    return f"Remembering '{label}' is still in progress (jobId={job_id}); the graph will finish building shortly."


async def _handle_improve() -> str:
    result = await run_memory_improve()
    backend = result.get("backend", "unknown")
    dataset = result.get("dataset", "")
    return f"Ran enrichment (improve/memify) on '{dataset}' via {backend}. Status: {result.get('status', 'ok')}."


async def _handle_forget(arguments: dict) -> str:
    source_id = arguments.get("sourceId")
    node_id = arguments.get("nodeId")
    if source_id:
        await forget_source(source_id)
        return f"Forgot source '{source_id}' and pruned its nodes from memory."
    if node_id:
        await forget_node(node_id)
        return f"Forgot node '{node_id}'."
    return "Nothing forgotten: provide either 'sourceId' or 'nodeId'."


async def _handle_review(arguments: dict) -> str:
    limit = arguments.get("limit") or 10
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 10
    items = await get_review_candidates(limit)
    if not items:
        return "Nothing to review yet: the graph is empty."
    out = "Facts most in need of review (lowest confidence first):\n\n"
    for i, it in enumerate(items, 1):
        out += f"{i}. {it['label']} - confidence {it['confidence']} ({it['status']})\n"
        if it.get("summary"):
            out += f"   {it['summary']}\n"
    return out


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    # Scope every operation to the stable agent memory so it persists across runs.
    set_current_user(MCP_USER_ID)

    if name == "engram_recall":
        text = await _handle_recall(arguments)
    elif name == "engram_graph_snapshot":
        text = await _handle_graph_snapshot()
    elif name == "engram_remember":
        text = await _handle_remember(arguments)
    elif name == "engram_improve":
        text = await _handle_improve()
    elif name == "engram_forget":
        text = await _handle_forget(arguments)
    elif name == "engram_review":
        text = await _handle_review(arguments)
    else:
        raise ValueError(f"Unknown tool: {name}")

    return [TextContent(type="text", text=text)]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
