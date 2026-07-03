"""
Typed ontology handed to Cognee Cloud `remember()` so extraction produces
Engram's domain nodes and edges instead of generic document chunks.

This mirrors the JSON-Schema shape Cognee Cloud expects: a root object of
entity arrays, one `$def` per type, and relationships expressed as `$ref`
fields (the field name becomes the edge label in the dataset graph).

Note: `format: "date"` is intentionally avoided; Cognee Cloud's remember()
rejects it, so dates stay plain strings.
"""

_str = {"type": "string"}

# The ontology is deliberately small and centered on Engram's thesis: facts and
# decisions that can supersede or contradict each other over time.
ENGRAM_GRAPH_MODEL = {
    "title": "EngramMemoryGraph",
    "type": "object",
    "properties": {
        "sources": {"type": "array", "items": {"$ref": "#/$defs/Source"}},
        "topics": {"type": "array", "items": {"$ref": "#/$defs/Topic"}},
        "entities": {"type": "array", "items": {"$ref": "#/$defs/Entity"}},
        "facts": {"type": "array", "items": {"$ref": "#/$defs/Fact"}},
        "decisions": {"type": "array", "items": {"$ref": "#/$defs/Decision"}},
    },
    "required": ["facts"],
    "$defs": {
        "Source": {
            "title": "Source",
            "type": "object",
            "description": "A document, note, repo, article, or transcript that was ingested.",
            "properties": {
                "name": _str,
                "kind": {**_str, "description": "pdf, github, article, youtube, conversation, or text."},
                "ingested_on": {**_str, "description": "YYYY-MM-DD if stated."},
            },
            "required": ["name"],
        },
        "Topic": {
            "title": "Topic",
            "type": "object",
            "description": "A subject that facts and decisions are about, e.g. 'database choice'.",
            "properties": {"name": _str},
            "required": ["name"],
        },
        "Entity": {
            "title": "Entity",
            "type": "object",
            "description": "A person, tool, system, or concept mentioned.",
            "properties": {
                "name": _str,
                "kind": {**_str, "description": "person, tool, system, or concept."},
            },
            "required": ["name"],
        },
        "Fact": {
            "title": "Fact",
            "type": "object",
            "description": "A single claim or statement drawn from a source.",
            "properties": {
                "name": {**_str, "description": "A short identifier for the claim."},
                "statement": {**_str, "description": "The claim in one sentence."},
                "stated_on": {**_str, "description": "YYYY-MM-DD if stated."},
                "about_topic": {"$ref": "#/$defs/Topic"},
                "from_source": {"$ref": "#/$defs/Source"},
                "mentions": {"type": "array", "items": {"$ref": "#/$defs/Entity"}},
                "supersedes": {
                    "$ref": "#/$defs/Fact",
                    "description": "An earlier fact this one replaces or updates.",
                },
                "contradicts": {
                    "$ref": "#/$defs/Fact",
                    "description": "A fact this one conflicts with.",
                },
            },
            "required": ["name"],
        },
        "Decision": {
            "title": "Decision",
            "type": "object",
            "description": "A choice that was made, e.g. 'switch database to Supabase'.",
            "properties": {
                "name": _str,
                "statement": {**_str, "description": "The decision in one sentence."},
                "decided_on": {**_str, "description": "YYYY-MM-DD if stated."},
                "about_topic": {"$ref": "#/$defs/Topic"},
                "from_source": {"$ref": "#/$defs/Source"},
                "supersedes": {
                    "$ref": "#/$defs/Decision",
                    "description": "An earlier decision this one replaces.",
                },
            },
            "required": ["name"],
        },
    },
}

ENGRAM_CUSTOM_PROMPT = (
    "You are extracting a personal memory graph from the given content. "
    "Extract every distinct claim as a Fact and every explicit choice as a Decision, "
    "each with a one-sentence statement and, when stated, a date (YYYY-MM-DD) and the "
    "Topic it concerns. Attach each Fact and Decision to the Source it came from, and "
    "link the people, tools, and systems it mentions as Entities.\n\n"
    "SUPERSESSION AND CONTRADICTION are the most important relationships: when the "
    "content says something changed, was updated, replaced, deprecated, migrated away "
    "from, or now differs from an earlier state, extract the supersedes relationship "
    "explicitly; when two claims conflict, extract contradicts. Reuse the same Topic "
    "node across related claims so the timeline of a subject stays connected. "
    "Copy dates and identifiers verbatim; do not invent facts that are not present."
)

# Node types Engram treats as real domain entities (the rest, DocumentChunk,
# TextSummary, etc., are Cognee housekeeping).
ENGRAM_DOMAIN_TYPES = ["Source", "Topic", "Entity", "Fact", "Decision"]
