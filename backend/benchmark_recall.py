"""
Measure the REAL Cognee-first recall routing ratio.

For each recall query, the backend tags the answer with `provider`:
  - "cognee"  -> answered from the graph (GRAPH_COMPLETION)
  - anything else (groq/gemini/openai) -> LLM fallback (empty graph / miss)

This script:
  1. (optional) ingests a small known corpus via POST /ingest and waits for it,
  2. runs a batch of recall queries via POST /recall,
  3. counts cognee vs fallback and prints the ratio,
  4. writes a markdown snippet to benchmark_results.md for the README.

Run (venv active, from the backend folder):
    python benchmark_recall.py                       # local backend, ingest + query
    python benchmark_recall.py --no-ingest           # query only (graph already built)
    python benchmark_recall.py --url https://engram-backend-kknh.onrender.com

Reads ENGRAM_ACCESS_KEY from backend/.env (sent as X-Engram-Key).
"""
import argparse
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()

USER_ID = "benchmark_user"

# Known corpus. Includes the hackathon prompt plus a couple of superseding facts
# so the graph has real, queryable structure.
CORPUS = [
    ("Doug is the groom. The wedding is on Sunday in Vegas. Stu is a dentist.", "Vegas notes"),
    ("We originally chose Postgres for the backend database on November 1.", "ADR v1"),
    ("On November 20 we switched the database to Supabase for built-in auth and realtime.", "ADR v4"),
    ("Deploys used to happen weekly. Since June they now run on every merge to main.", "Ops log"),
    ("Engram uses Cognee for the memory lifecycle: remember, recall, improve, forget.", "Engram overview"),
]

QUERIES = [
    "Who is the groom and when is the wedding?",
    "What database do we use now?",
    "What database did we use before?",
    "What changed about our deploy process?",
    "What does Engram use for its memory lifecycle?",
    "Is Stu the groom?",
    "When did we switch database?",
    "Summarize the current architecture decisions.",
    "What is the wedding location?",
    "Which memory operations does Cognee provide?",
]


def headers():
    key = os.environ.get("ENGRAM_ACCESS_KEY", "")
    h = {"Content-Type": "application/json", "X-User-Id": USER_ID}
    if key:
        h["X-Engram-Key"] = key
    return h


def ingest_corpus(client: httpx.Client, base: str):
    print("\n-- Ingesting corpus --")
    job_ids = []
    for content, label in CORPUS:
        r = client.post(
            f"{base}/ingest",
            headers=headers(),
            json={"type": "text", "content": content, "label": label},
        )
        r.raise_for_status()
        data = r.json()
        jid = data.get("jobId") or data.get("id")
        print(f"  queued: {label}  (job={jid})")
        job_ids.append(jid)
        time.sleep(7)  # /ingest is rate-limited to 10/min

    print("-- Waiting for ingestion jobs --")
    for jid in job_ids:
        if not jid:
            continue
        for _ in range(60):  # up to ~5 min per job
            r = client.get(f"{base}/ingest/{jid}", headers=headers())
            if r.status_code == 404:
                break
            status = r.json().get("status")
            if status in ("completed", "failed"):
                print(f"  job {jid}: {status}")
                break
            time.sleep(5)


def _percentile(sorted_vals, pct):
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * pct
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def run_queries(client: httpx.Client, base: str):
    print("\n-- Running recall queries --")
    rows = []
    cognee = 0
    latencies = []  # client-side wall-clock ms (includes network)
    server_latencies = []  # backend-only ms from X-Response-Time-Ms
    for q in QUERIES:
        t0 = time.perf_counter()
        r = client.post(f"{base}/recall", headers=headers(), json={"query": q})
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        r.raise_for_status()
        data = r.json()
        provider = (data.get("provider") or "unknown").lower()
        model = data.get("model") or ""
        is_cognee = provider == "cognee"
        cognee += 1 if is_cognee else 0
        tag = "COGNEE " if is_cognee else "fallback"
        server_ms = r.headers.get("X-Response-Time-Ms")
        latencies.append(elapsed_ms)
        if server_ms:
            try:
                server_latencies.append(float(server_ms))
            except ValueError:
                pass
        rows.append((q, provider, model, is_cognee))
        srv = f", server {server_ms}ms" if server_ms else ""
        print(f"  [{tag}] {provider}/{model}  ({elapsed_ms:.0f}ms{srv})  <-  {q}")
        time.sleep(3.2)  # /recall is rate-limited to 20/min
    stats = _latency_stats(latencies, server_latencies)
    return rows, cognee, stats


def _latency_stats(latencies, server_latencies):
    s = sorted(latencies)
    stats = {
        "count": len(s),
        "avg_ms": round(sum(s) / len(s), 1) if s else 0.0,
        "p50_ms": round(_percentile(s, 0.50), 1),
        "p95_ms": round(_percentile(s, 0.95), 1),
        "min_ms": round(s[0], 1) if s else 0.0,
        "max_ms": round(s[-1], 1) if s else 0.0,
    }
    if server_latencies:
        ss = sorted(server_latencies)
        stats["server_avg_ms"] = round(sum(ss) / len(ss), 1)
        stats["server_p50_ms"] = round(_percentile(ss, 0.50), 1)
        stats["server_p95_ms"] = round(_percentile(ss, 0.95), 1)
    return stats


def write_report(rows, cognee, total, stats):
    pct = round(100 * cognee / total) if total else 0
    fb = total - cognee
    fb_pct = 100 - pct
    lines = [
        "### Measured recall routing",
        "",
        f"Measured over **{total}** queries against a populated graph on "
        f"{time.strftime('%Y-%m-%d')}:",
        "",
        "```mermaid",
        "pie showData",
        "    title Measured recall resolution",
        f'    "Cognee graph (GRAPH_COMPLETION)" : {cognee}',
        f'    "LLM fallback" : {fb}',
        "```",
        "",
        f"- Cognee-served: **{cognee}/{total} ({pct}%)**",
        f"- LLM fallback: **{fb}/{total} ({fb_pct}%)**",
        "",
        "### Measured recall latency",
        "",
        "| Metric | End-to-end (client) | Backend (server) |",
        "|---|---|---|",
        f"| Average | {stats.get('avg_ms', 0)} ms | {stats.get('server_avg_ms', 'n/a')} ms |",
        f"| Median (p50) | {stats.get('p50_ms', 0)} ms | {stats.get('server_p50_ms', 'n/a')} ms |",
        f"| p95 | {stats.get('p95_ms', 0)} ms | {stats.get('server_p95_ms', 'n/a')} ms |",
        f"| Min / Max | {stats.get('min_ms', 0)} / {stats.get('max_ms', 0)} ms | - |",
        "",
        "| Query | Provider | Model |",
        "|---|---|---|",
    ]
    for q, provider, model, _ in rows:
        lines.append(f"| {q} | {provider} | {model} |")
    out = "\n".join(lines) + "\n"
    with open(os.path.join(os.path.dirname(__file__), "benchmark_results.md"), "w", encoding="utf-8") as f:
        f.write(out)
    return pct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.environ.get("BENCHMARK_URL", "http://localhost:8000"))
    ap.add_argument("--no-ingest", action="store_true", help="skip ingestion, query only")
    args = ap.parse_args()
    base = args.url.rstrip("/")

    print(f"\n=== Recall routing benchmark ===\nTarget: {base}")

    with httpx.Client(timeout=300.0) as client:
        # sanity: health
        try:
            client.get(f"{base}/health").raise_for_status()
        except Exception as e:
            print(f"Backend not reachable at {base}: {e}")
            return

        if not args.no_ingest:
            ingest_corpus(client, base)

        rows, cognee, stats = run_queries(client, base)

    total = len(rows)
    pct = write_report(rows, cognee, total, stats)
    print("\n=== Summary ===")
    print(f"  Cognee-served: {cognee}/{total} ({pct}%)")
    print(f"  LLM fallback:  {total - cognee}/{total} ({100 - pct}%)")
    print(f"  Latency (end-to-end): avg {stats.get('avg_ms', 0)}ms, p50 {stats.get('p50_ms', 0)}ms, p95 {stats.get('p95_ms', 0)}ms")
    if stats.get("server_avg_ms") is not None:
        print(f"  Latency (backend):    avg {stats.get('server_avg_ms')}ms, p50 {stats.get('server_p50_ms')}ms, p95 {stats.get('server_p95_ms')}ms")
    print("  Wrote benchmark_results.md")


if __name__ == "__main__":
    main()
