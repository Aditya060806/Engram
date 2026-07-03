"""Lightweight unit tests for pure backend helpers.

These import only dependency-free modules (metrics, graph_model) so CI can run
them without installing the full backend requirements.
"""
import metrics
from graph_model import ENGRAM_GRAPH_MODEL, ENGRAM_DOMAIN_TYPES


def test_percentile_edges_and_interpolation():
    vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    assert metrics._percentile(vals, 0.5) == 5.5
    assert metrics._percentile(vals, 0.0) == 1
    assert metrics._percentile(vals, 1.0) == 10
    assert metrics._percentile([], 0.5) == 0.0
    assert metrics._percentile([42.0], 0.95) == 42.0


def test_metrics_summary_roundtrip():
    metrics.reset()
    for v in (10.0, 20.0, 30.0):
        metrics.record("GET /x", v)
    rows = metrics.summary()
    row = next(r for r in rows if r["endpoint"] == "GET /x")
    assert row["count"] == 3
    assert row["avg_ms"] == 20.0
    assert row["min_ms"] == 10.0
    assert row["max_ms"] == 30.0
    metrics.reset()
    assert metrics.summary() == []


def test_graph_model_has_typed_supersedes_and_contradicts():
    defs = ENGRAM_GRAPH_MODEL["$defs"]
    assert "Fact" in defs and "Decision" in defs
    assert "supersedes" in defs["Fact"]["properties"]
    assert "contradicts" in defs["Fact"]["properties"]
    assert "supersedes" in defs["Decision"]["properties"]
    for t in ("Source", "Topic", "Entity", "Fact", "Decision"):
        assert t in ENGRAM_DOMAIN_TYPES
