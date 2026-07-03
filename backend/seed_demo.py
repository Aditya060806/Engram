"""
Seed a clean, typed demo graph.

Ingests a small, coherent narrative through the backend so the knowledge graph
shows Engram's typed nodes (Fact, Decision, Topic) and, crucially, supersedes
relationships, ideal for the demo video and screenshots.

Run (venv active, from the backend folder):
    python seed_demo.py                       # local backend
    python seed_demo.py --url https://engram-backend-kknh.onrender.com

Reads ENGRAM_ACCESS_KEY from backend/.env. Uses the same auth as the app.
"""
import argparse
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()

USER_ID = os.environ.get("SEED_USER_ID", "")  # empty = default dataset

# A coherent story with clear supersession and a stable topic thread.
NOTES = [
    ("Database decision", "On 2025-11-01 we chose Postgres as our production database for its reliability."),
    ("Deploy cadence", "As of June 2026 we deploy on every merge to main; we used to deploy weekly."),
    ("Database switch", "On 2025-11-20 we switched the database from Postgres to Supabase for built-in auth and realtime. This supersedes the earlier Postgres decision."),
    ("Wedding note", "Doug is the groom and the wedding is on Sunday in Vegas. Stu is a dentist."),
    ("Engram overview", "Engram uses Cognee for its memory lifecycle: remember, recall, improve, and forget."),
]


def headers():
    h = {"Content-Type": "application/json"}
    key = os.environ.get("ENGRAM_ACCESS_KEY", "")
    if key:
        h["X-Engram-Key"] = key
    if USER_ID:
        h["X-User-Id"] = USER_ID
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.environ.get("SEED_URL", "http://localhost:8000"))
    args = ap.parse_args()
    base = args.url.rstrip("/")

    print(f"Seeding typed demo graph at {base}\n")
    with httpx.Client(timeout=120.0) as client:
        try:
            client.get(f"{base}/health").raise_for_status()
        except Exception as e:
            print(f"Backend not reachable: {e}")
            return

        job_ids = []
        for label, content in NOTES:
            r = client.post(f"{base}/ingest", headers=headers(),
                            json={"type": "text", "content": content, "label": label})
            r.raise_for_status()
            jid = r.json().get("jobId")
            print(f"  queued: {label} (job={jid})")
            job_ids.append(jid)
            time.sleep(7)  # /ingest is rate-limited to 10/min

        print("\nWaiting for ingestion to complete...")
        for jid in job_ids:
            if not jid:
                continue
            for _ in range(60):
                jr = client.get(f"{base}/ingest/{jid}", headers=headers())
                if jr.status_code == 404:
                    break
                status = jr.json().get("status")
                if status in ("completed", "failed"):
                    print(f"  job {jid}: {status}")
                    break
                time.sleep(5)

    print("\nDone. Give the tenant a minute to finish cognify, then open /graph to see the typed nodes.")


if __name__ == "__main__":
    main()
