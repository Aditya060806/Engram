<p align="center">
  <picture>
    <img src="frontend/public/logo1.png" alt="Engram" width="420" />
  </picture>
</p>

# The Autonomous Memory Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/Aditya060806/Engram/actions/workflows/ci.yml/badge.svg)](https://github.com/Aditya060806/Engram/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[Live Demo](https://engram1002.vercel.app)** |
**Built by [Aditya Pandey](https://github.com/Aditya060806)**

## Quick Access

**Live demo:** [https://engram1002.vercel.app](https://engram1002.vercel.app)

Sign in with GitHub or Google to access the full experience — your knowledge graph and conversations are saved to your account. A **"View demo without signing in"** link is available on the login page for judges and exploration of seed data. For AI features (querying, ingestion, memory reconciliation), click **"Configure AI"** in Settings and bring your own API key after signing in.

---

Engram is a self-organizing memory layers dashboard built on Cognee to handle dynamic context updates, contradiction management, and automatic memory decay.

*AI coding assistants were used in the development of Engram, in accordance with the WeMakeDevs × Cognee Hackathon guidelines.*

Built for: **The Hangover Part AI: Where is My Context? — WeMakeDevs x Cognee Hackathon (Jun 29 - Jul 5, 2026)**

---

## 1. The Problem & Potential Impact

As Large Language Models (LLMs) ingest more context over time, they encounter a critical issue: **semantic drift and contradiction**. Real-world context is dynamic—credentials get rotated, tech stacks evolve, and architectural design decisions update. Most memory tools simply append new information, leading to conflicting records, bloated contexts, and retrieval failures where the LLM confidently retrieves stale facts.

Engram solves this by providing a **self-reconciling memory dashboard**. By detecting semantic contradictions at ingestion time and offering an intuitive reconciliation workflow, Engram ensures the underlying memory store contains only active, verified, and high-confidence facts. The potential impact is huge: eliminating the cost, hallucination, and logic bugs associated with LLMs acting on stale or contradicted knowledge.

---

## 2. Hackathon Submission & Judging Criteria

| Criterion | Where to look |
|---|---|
| **Potential Impact** | [The Problem & Potential Impact](#1-the-problem--potential-impact) — acting on stale/contradicted knowledge is a real, recurring cost this directly addresses |
| **Creativity & Innovation** | [The Reconciliation Engine](#51-the-reconciliation-engine) + "What Changed?" diff query — most memory tools stop at recall; this one decides what still deserves trust |
| **Technical Excellence** | [Core Architecture & Memory Lifecycle](#3-core-architecture-and-memory-lifecycle) + [Cognee API Mapping](#4-cognee-api-mapping) below |
| **Best Use of Cognee** | Full lifecycle usage — `remember`/`recall`/`improve`/`forget` are all load-bearing, wired to **both the local SDK and a hosted Cognee Cloud tenant** (REST), and verified end-to-end by [`test_cognee_cloud.py`](#41-verifying-the-lifecycle-end-to-end) |
| **User Experience** | Screenshots of `/resolve`, `/graph`, and `/ask` (provided in the `assets/` folder and accessible via local run) |
| **Presentation Quality** | The WeMakeDevs project submission page + this comprehensive README |

---

## 3. Core Architecture and Memory Lifecycle

The following flow illustrates how Engram manages the ingestion, contradiction resolution, query recall, and automated decay of dynamic memory:

```mermaid
graph TD
    classDef highlight stroke:#3b82f6,stroke-width:2px;
    classDef database stroke:#10b981,stroke-width:2px;
    
    Raw[Raw Context: PDFs, repos, YouTube, ChatGPT, articles] -->|1. Ingest| Ingestion[Cognee Ingestion Pipeline]
    Ingestion -->|2. cognify| GraphDb[(Cognee Graph Store)]:::database
    Ingestion -->|3. Reconciliation Pass| ContradictionJudge{Conflict Detected?}
    
    ContradictionJudge -->|Yes| ConflictInbox[What Changed Inbox UI]:::highlight
    ContradictionJudge -->|No| GraphDb
    
    ConflictInbox -->|Keep New/Old/Both| ResolveAction[Update Active States]
    GraphDb -->|4. recall| AskChat[Graph-Grounded Temporal Ask UI]:::highlight
    
    GraphDb -->|5. Decay Sweep| Degradation{Confidence < 0.20?}
    Degradation -->|Yes: forget| ForgetAction[Pruned from Graph Store]
```

---

## 4. Cognee API Mapping

Engram uses Cognee two ways, both load-bearing: the **local Python SDK** (embedded) and, when configured, a **hosted Cognee Cloud tenant** over its REST API (`cognee.serve()`-style routing implemented directly against the tenant endpoints). All four lifecycle operations prefer the hosted tenant when connected and fall back to the local SDK/metadata store otherwise.

| Cognee Operation | Local SDK call | Hosted-tenant REST endpoint | Engram feature |
|---|---|---|---|
| `remember()` | `cognee.remember(...)` | `POST /api/v1/add_text` → `POST /api/v1/cognify` | Ingests GitHub repos, PDFs, ChatGPT/Claude exports, articles, YouTube transcripts + chat-turn memory |
| `recall()` | `cognee.recall(...)` | `POST /api/v1/recall` | Graph-grounded, time-aware chat queries ("what did I believe before vs now") + the `/recap` narrative |
| `improve()` / memify | `cognee.memify(...)` / `cognify()` | `POST /api/v1/cognify` (re-enrichment) | Post-ingestion enrichment + the "Run enrichment" action in Settings |
| `forget()` | `cognee.forget(...)` | `POST /api/v1/forget` | Source-level pruning and automatic confidence-decay sweeps |
| graph / schema / provenance | `get_memory_provenance_graph`, `get_schema_inventory` | `GET /datasets/{id}/graph`, `GET /schema/inventory`, `GET /schema/provenance` | The 3D graph, schema inventory, and provenance views |

Core wiring lives in [`services/__init__.py`](https://github.com/Aditya060806/Engram/blob/main/backend/services/__init__.py) and the tenant REST client in [`cognee_cloud.py`](https://github.com/Aditya060806/Engram/blob/main/backend/cognee_cloud.py).

### 4.1 Verifying the lifecycle end-to-end

[`backend/test_cognee_cloud.py`](https://github.com/Aditya060806/Engram/blob/main/backend/test_cognee_cloud.py) exercises all four operations against a live tenant on a throwaway dataset and prints PASS/FAIL per op:

```text
=== Cognee Cloud live lifecycle test ===
PASS  connectivity + API key (GET /health)
PASS  dataset ready
PASS  remember() — add_text + cognify built the graph
PASS  recall() — got an answer from the graph
      ↳ The groom is Doug, and the wedding is scheduled for Sunday.
PASS  improve() — re-enrichment queued on tenant
PASS  forget() — dataset pruned from tenant
```

That `recall()` line is the hackathon prompt itself — ingest "Doug is the groom… the wedding is Sunday," then answer *"Where is Doug?"* across a fresh query, straight from the Cognee-built graph.

---

## 5. Key Features

### 5.1 The Reconciliation Engine
When new evidence is ingested, Engram queries existing knowledge graph schemas to identify contradictions or superseded statements. Detected conflicts are sent to the user's inbox in the UI. The user can choose to Keep New (pruning the old data), Keep Old (discarding the new claim), or Keep Both (adding the new claim as an alternative relationship).

### 5.2 The Decay Engine
Confidence scores of unreinforced graph nodes degrade over time (by 0.15 per sweep invocation). If a node's confidence score drops below 0.20, Engram invokes `cognee.forget()` to prune the node from the active graph store.

### 5.3 Temporal Query Diffs
Queries matching historical comparison patterns (e.g. "what changed since March?") extract diff matrices outlining added nodes, deleted nodes, changed schemas, and newly recorded decisions.

### 5.4 Bring-Your-Own-Key (BYOK) & Live Discovery
Self-hosting users can connect their own accounts/keys for Groq, OpenAI, or Gemini. The application features a secure, guided 3-step setup: provider selection, API key validation, and live model list discovery. Keys are encrypted at rest using a symmetric cipher (`Fernet`) and never exposed in console logging or frontend payloads.

### 5.5 The Recap — "Where's My Context?"
A direct answer to the hackathon's premise. The `/recap` view is a *morning-after digest* of your memory: **"Here's what happened while you were out."** For a chosen window (7/30/90 days) it stitches together every Cognee lifecycle operation into one narrative — sources **remembered**, decisions and reinforcements from **improve/cognify**, contradictions **reconciled**, and stale nodes **forgotten** — then uses `recall()` plus the LLM to write a punchy, grounded summary. Animated count-up stats and a reveal-on-scroll event timeline make the invisible work of a self-maintaining memory legible at a glance.

---

## 6. Known Limitations

- **Authentication Model**: Authentication via GitHub/Google OAuth is enforced for all routes except the landing page and login page. The session user ID is threaded to the backend via the `X-User-Id` header for per-user data routing.
- **Chat History Persistence**: The chat conversation history in `/ask` is currently persisted in the browser's local storage (`localStorage`) rather than being stored on the server side.
- **Database Scope**: The database configuration supports both a local SQLite file (default for local development) and a managed PostgreSQL instance with PGVector for remote Vercel/production deployment.
- **Cognee Per-Request LLM Isolation (Upstream Issue #2228)**: LLM configuration for Cognee's own internal pipeline (`remember`/`recall`/`improve`/`forget`) is applied per-request but relies on Cognee's global process-wide config state. This is fully safe under this project's single-session usage pattern, but would require request-scoped isolation (or waiting on Cognee's roadmap for issue #2228) before being run under highly concurrent multi-tenant loads.
- **AI Chat Import Depends on External Page Structure**: The chat-URL importer (`/import/chat-url`) scrapes undocumented page structure from ChatGPT, Claude, and Gemini public share links. These platforms may change their page layout at any time with no notice, which can break import for a specific platform. This is not a Engram bug — the feature works within the limits of what each platform's public share page exposes.
- **Article ingestion vs. bot protection**: Article ingestion uses `trafilatura` to fetch page text. Sites with aggressive bot protection (e.g. large corporate/news domains) will refuse or time out the request. GitHub repos, PDFs, and scraper-friendly pages (blogs, Wikipedia) are the reliable paths.
- **Decay-sweep pruning is local**: Source-delete and demo-reset trigger `forget()` on the hosted tenant; the automatic decay sweep still prunes via the local SDK/metadata store, because decayed records are keyed by summary text rather than a tenant `dataId`. Mapping those to tenant data items is a known follow-up.

---

## 7. Technical Stack
- **Frontend**: Next.js 16 (App Router), Tailwind CSS, TypeScript, `react-force-graph-3d` for the node network.
- **Backend**: FastAPI (Python), SQLite/PostgreSQL metadata database ([database.py](https://github.com/Aditya060806/Engram/blob/main/backend/database.py)), the Cognee SDK, plus a direct REST client to a hosted **Cognee Cloud** tenant ([cognee_cloud.py](https://github.com/Aditya060806/Engram/blob/main/backend/cognee_cloud.py)), and Gemini / Groq LLM wrappers.

---

## 8. Local Setup

### Backend Setup

> **Python 3.11+** is required. (The `numpy` pin is set for 3.11 compatibility.)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate      # Windows: .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set the environment variables in a `.env` file:
   ```env
   # LLM for Engram's own reasoning (Ask answers, reconciliation, Recap narrative)
   LLM_PROVIDER=groq
   GROQ_API_KEY=your_groq_key
   LLM_MODEL_FALLBACK=groq/llama-3.3-70b-versatile
   # (or) LLM_PROVIDER=gemini + GEMINI_API_KEY=your_AIza_key

   ENVIRONMENT=development
   FRONTEND_URL=http://localhost:3000
   ENGRAM_ACCESS_KEY=change-me
   ENGRAM_ENCRYPTION_KEY=random-32+ -chars   # encrypts BYOK keys at rest

   # Optional: route remember/recall/improve/forget to a hosted Cognee Cloud tenant.
   # Activates only when BOTH are set. Find them in your Cognee Cloud dashboard.
   COGNEE_API_KEY=your_cognee_cloud_api_key
   COGNEE_SERVICE_URL=https://<your-tenant>.aws.cognee.ai
   COGNEE_TENANT_ID=<your-tenant-uuid>
   ```
5. Start the backend server:
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```
   Look for `[Cognee] Connected to Cognee Cloud tenant …` to confirm cloud routing is live.
6. (Optional) Verify all four Cognee operations against your tenant:
   ```bash
   python test_cognee_cloud.py
   ```

> **DNS note:** if you hit `getaddrinfo failed` / "DNS operation refused" reaching the tenant, your resolver is flaky — run `ipconfig /flushdns` (Windows) or set your DNS to `8.8.8.8` / `1.1.1.1`.

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code conventions, and the pull request process. This project also uses a [Code of Conduct](CODE_OF_CONDUCT.md) and has a [security policy](SECURITY.md).

Look for issues tagged [`good first issue`](https://github.com/Aditya060806/Engram/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for well-scoped starting points.

---

## Author

Built by [Aditya Pandey](https://github.com/Aditya060806) for the WeMakeDevs × Cognee Hackathon.
