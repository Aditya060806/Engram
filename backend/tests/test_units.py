"""Lightweight unit tests for pure backend helpers.

These import only dependency-free modules (metrics, graph_model) so CI can run
them without installing the full backend requirements.
"""
import metrics
from graph_model import ENGRAM_GRAPH_MODEL, ENGRAM_DOMAIN_TYPES
from text_context import snippets_around_terms, source_matches_terms


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


def test_source_matches_on_body_not_just_label():
    # Regression: an imported conversation labeled "ChatGPT Chat" must be found
    # relevant when the question words only appear in its body, not the label.
    terms = ["paddle", "billing"]
    body = "We decided to migrate billing from Stripe to Paddle for EU tax."
    by_label, by_content = source_matches_terms("ChatGPT Chat", None, body, terms)
    assert by_content is True
    assert by_label is False


def test_source_matches_prefers_label_when_label_hits():
    terms = ["stripe"]
    by_label, by_content = source_matches_terms("Stripe notes", None, "unrelated body", terms)
    assert by_label is True
    assert by_content is False


def test_source_matches_none_when_no_overlap():
    by_label, by_content = source_matches_terms("Chat", None, "nothing here", ["kubernetes"])
    assert by_label is False
    assert by_content is False


def test_source_matches_handles_empty_content():
    by_label, by_content = source_matches_terms("Chat", None, None, ["anything"])
    assert (by_label, by_content) == (False, False)


def test_snippets_center_on_terms_and_are_bounded():
    text = ("alpha " * 500) + " TARGETWORD payload here " + ("omega " * 500)
    out = snippets_around_terms(text, ["targetword"], window=40, max_total=500)
    assert "TARGETWORD" in out
    assert len(out) <= 520  # bounded well under the full text length


def test_snippets_empty_when_no_match_or_no_terms():
    assert snippets_around_terms("some text", ["absent"]) == ""
    assert snippets_around_terms("some text", []) == ""
    assert snippets_around_terms("", ["x"]) == ""


def test_snippets_merges_overlapping_windows():
    text = "one two three four five six seven eight"
    # two nearby terms -> overlapping windows should merge into one contiguous chunk
    out = snippets_around_terms(text, ["two", "seven"], window=100)
    assert out.count("…") == 0
    assert "two" in out and "seven" in out
