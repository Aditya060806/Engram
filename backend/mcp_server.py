import asyncio
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from models import RecallRequest
from services import answer_query, get_graph_snapshot

app = Server("engram-mcp")

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
                        "description": "The question to ask Engram (e.g. 'what changed about my database choice?')"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="engram_graph_snapshot",
            description="Get a snapshot of the entire Engram knowledge graph nodes and edges.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "engram_recall":
        query = arguments.get("query")
        req = RecallRequest(query=query)
        msg = await answer_query(req)
        out = f"Answer: {msg.answer}\n"
        
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
                
        return [TextContent(type="text", text=out)]
        
    elif name == "engram_graph_snapshot":
        snap = await get_graph_snapshot()
        out = f"Graph Snapshot (Total Nodes: {len(snap.nodes)}, Edges: {len(snap.edges)})\n\n"
        for n in snap.nodes:
            out += f"Node [{n.id}]: {n.label} (Status: {n.status}, Confidence: {n.confidenceScore})\n"
        return [TextContent(type="text", text=out)]
    else:
        raise ValueError(f"Unknown tool: {name}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
