"""
Direct REST client for a hosted Cognee Cloud tenant.

Wired against the tenant OpenAPI at
  https://<tenant>.aws.cognee.ai/openapi.json

Activates only when both COGNEE_API_KEY and COGNEE_SERVICE_URL are set. Every
method raises on transport/HTTP error so callers can fall back to local memory.

Auth: X-Api-Key header (the tenant is encoded in the service subdomain, so a
separate tenant header is optional; we send X-Tenant-Id too when provided).
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx


def cloud_enabled() -> bool:
    return bool(os.environ.get("COGNEE_API_KEY") and os.environ.get("COGNEE_SERVICE_URL"))


class CogneeCloudClient:
    def __init__(self, base_url: str, api_key: str, tenant_id: str | None = None, timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self._headers = {"X-Api-Key": api_key}
        if tenant_id:
            self._headers["X-Tenant-Id"] = tenant_id
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.request(method, url, headers=self._headers, **kwargs)
            resp.raise_for_status()
            ctype = resp.headers.get("content-type", "")
            if "application/json" in ctype:
                return resp.json()
            return resp.text

    # ── Health / datasets ──
    async def health(self) -> Any:
        return await self._request("GET", "/health")

    async def list_datasets(self) -> list[dict]:
        return await self._request("GET", "/api/v1/datasets/")

    async def ensure_dataset(self, name: str) -> Optional[str]:
        """Create (or fetch existing) dataset by name; returns its UUID."""
        data = await self._request("POST", "/api/v1/datasets/", json={"name": name})
        if isinstance(data, dict):
            return data.get("id")
        return None

    async def dataset_id_for(self, name: str) -> Optional[str]:
        try:
            for d in await self.list_datasets():
                if d.get("name") == name:
                    return d.get("id")
        except Exception:
            pass
        return None

    # ── remember (add + cognify) ──
    async def add_text(self, texts: list[str], dataset_name: str) -> Any:
        return await self._request(
            "POST",
            "/api/v1/add_text",
            json={"textData": texts, "datasetName": dataset_name},
        )

    async def cognify(self, dataset_name: str, run_in_background: bool = True) -> Any:
        return await self._request(
            "POST",
            "/api/v1/cognify",
            json={"datasets": [dataset_name], "runInBackground": run_in_background},
        )

    async def remember_text(self, text: str, dataset_name: str, run_in_background: bool = True) -> Any:
        """Convenience: add text then kick off graph building."""
        await self.add_text([text], dataset_name)
        return await self.cognify(dataset_name, run_in_background=run_in_background)

    async def remember_qa(self, question: str, answer: str, context: str, session_id: str, dataset_name: str) -> Any:
        return await self._request(
            "POST",
            "/api/v1/remember/entry",
            json={
                "entry": {"type": "qa", "question": question, "answer": answer, "context": context},
                "dataset_name": dataset_name,
                "session_id": session_id,
            },
        )

    async def add_feedback(self, qa_id: str, session_id: str, dataset_name: str,
                           feedback_text: str | None, feedback_score: int | None) -> Any:
        entry: dict[str, Any] = {"type": "feedback", "qa_id": qa_id}
        if feedback_text is not None:
            entry["feedback_text"] = feedback_text
        if feedback_score is not None:
            entry["feedback_score"] = feedback_score
        return await self._request(
            "POST",
            "/api/v1/remember/entry",
            json={"entry": entry, "dataset_name": dataset_name, "session_id": session_id},
        )

    # ── recall ──
    async def recall(self, query: str, dataset_name: str, top_k: int = 5,
                     only_context: bool = True, search_type: str = "GRAPH_COMPLETION") -> list[str]:
        payload = {
            "query": query,
            "datasets": [dataset_name],
            "searchType": search_type,
            "topK": top_k,
            "onlyContext": only_context,
        }
        data = await self._request("POST", "/api/v1/recall", json=payload)
        return _extract_texts(data)

    # ── forget ──
    async def forget(self, dataset_name: str | None = None, data_id: str | None = None,
                     memory_only: bool = False, everything: bool = False) -> Any:
        payload: dict[str, Any] = {}
        if everything:
            payload["everything"] = True
        else:
            if dataset_name:
                payload["dataset"] = dataset_name
            if data_id:
                payload["dataId"] = data_id
            if memory_only:
                payload["memoryOnly"] = True
        return await self._request("POST", "/api/v1/forget", json=payload)

    # ── improve / memify (re-run enrichment) ──
    async def improve(self, dataset_name: str, run_in_background: bool = True) -> Any:
        """
        The tenant REST API has no dedicated memify endpoint; a re-cognify pass
        re-runs entity extraction, summarization, and graph enrichment over the
        dataset — the hosted equivalent of improve()/memify.
        """
        return await self.cognify(dataset_name, run_in_background=run_in_background)

    # ── dataset data listing (needed to resolve a single item's UUID for forget) ──
    async def list_dataset_data(self, dataset_id: str) -> list[dict]:
        return await self._request("GET", f"/api/v1/datasets/{dataset_id}/data")

    async def data_id_for(self, dataset_id: str, name: str) -> Optional[str]:
        """Best-effort resolve a data item's UUID by (partial) name match."""
        try:
            items = await self.list_dataset_data(dataset_id)
            for it in items:
                iname = (it.get("name") or "")
                if iname == name or (name and name in iname) or (iname and iname in name):
                    return it.get("id")
        except Exception:
            pass
        return None

    # ── introspection ──
    async def schema_inventory(self, dataset_id: str, samples_per_type: int = 3) -> list[dict]:
        return await self._request(
            "GET",
            f"/api/v1/schema/inventory?dataset_id={dataset_id}&samples_per_type={samples_per_type}",
        )

    async def dataset_graph(self, dataset_id: str) -> dict:
        return await self._request("GET", f"/api/v1/datasets/{dataset_id}/graph")

    async def provenance_html(self, include_memory: bool = True) -> str:
        return await self._request(
            "GET",
            f"/api/v1/schema/provenance?include_memory={'true' if include_memory else 'false'}",
        )


def _extract_texts(data: Any) -> list[str]:
    """Pull human-readable text out of the recall response (mixed item shapes)."""
    out: list[str] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                for key in ("text", "content", "answer", "search_result"):
                    val = item.get(key)
                    if isinstance(val, str) and val.strip():
                        out.append(val.strip())
                        break
    elif isinstance(data, str):
        out.append(data)
    return out


_client: Optional[CogneeCloudClient] = None


def get_cloud_client() -> Optional[CogneeCloudClient]:
    """Singleton client, or None when cloud is not configured."""
    global _client
    if not cloud_enabled():
        return None
    if _client is None:
        _client = CogneeCloudClient(
            base_url=os.environ["COGNEE_SERVICE_URL"],
            api_key=os.environ["COGNEE_API_KEY"],
            tenant_id=os.environ.get("COGNEE_TENANT_ID"),
        )
    return _client
