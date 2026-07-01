"""
Live end-to-end test of the four Cognee lifecycle operations against your
hosted Cognee Cloud tenant.

Run (with the venv active, from the backend folder):
    python test_cognee_cloud.py

It exercises remember -> recall -> improve -> forget on a throwaway dataset
("engram_livetest") and prints PASS/FAIL for each. Reads COGNEE_API_KEY and
COGNEE_SERVICE_URL from backend/.env.
"""
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()
sys.path.append(os.path.dirname(__file__))

from cognee_cloud import get_cloud_client, cloud_enabled  # noqa: E402

DATASET = "engram_livetest"


def ok(msg):
    print(f"  \033[92mPASS\033[0m  {msg}")


def fail(msg):
    print(f"  \033[91mFAIL\033[0m  {msg}")


async def main():
    print("\n=== Cognee Cloud live lifecycle test ===\n")

    if not cloud_enabled():
        fail("Cloud not configured. Set COGNEE_API_KEY and COGNEE_SERVICE_URL in backend/.env")
        return

    client = get_cloud_client()
    client._timeout = 300.0  # cognify can take a while (blocking mode)
    print(f"Tenant: {os.environ.get('COGNEE_SERVICE_URL')}\n")

    # 0. Health / auth
    try:
        await client.health()
        ok("connectivity + API key (GET /health)")
    except Exception as e:
        fail(f"health check: {e}")
        return

    # ensure a clean dataset
    try:
        ds_id = await client.ensure_dataset(DATASET)
        ok(f"dataset ready ({ds_id})")
    except Exception as e:
        fail(f"ensure_dataset: {e}")
        return

    # 1. remember() = add_text + cognify (blocking so we can recall right after)
    try:
        await client.add_text(
            ["Doug is the groom. The wedding is Sunday in Vegas. Stu is a dentist. Alan lost the groom."],
            DATASET,
        )
        await client.cognify(DATASET, run_in_background=False)
        ok("remember() — add_text + cognify built the graph")
    except Exception as e:
        fail(f"remember(): {e}")
        return

    # 2. recall()
    try:
        texts = await client.recall(
            "Who is the groom and when is the wedding?",
            DATASET, top_k=5, only_context=False, search_type="GRAPH_COMPLETION",
        )
        if texts:
            ok("recall() — got an answer from the graph")
            for t in texts[:3]:
                line = f"        -> {t[:160]}"
                try:
                    print(line)
                except UnicodeEncodeError:
                    print(line.encode("ascii", "replace").decode("ascii"))
        else:
            fail("recall() returned no text (graph may still be building — retry in ~30s)")
    except Exception as e:
        fail(f"recall(): {e}")

    # 3. improve() / memify (re-enrichment; background is fine)
    try:
        await client.improve(DATASET, run_in_background=True)
        ok("improve() — re-enrichment (cognify) queued on tenant")
    except Exception as e:
        fail(f"improve(): {e}")

    # 4. forget() — delete the throwaway dataset
    try:
        await client.forget(dataset_name=DATASET)
        ok("forget() — dataset pruned from tenant")
    except Exception as e:
        fail(f"forget(): {e}")

    print("\n=== done ===\n")


if __name__ == "__main__":
    asyncio.run(main())
