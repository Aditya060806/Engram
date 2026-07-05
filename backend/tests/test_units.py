"""Lightweight unit tests for pure backend helpers.

These import only dependency-free modules (metrics, graph_model) so CI can run
them without installing the full backend requirements.
"""
import metrics
from graph_model import ENGRAM_GRAPH_MODEL, ENGRAM_DOMAIN_TYPES
from text_context import (
    snippets_around_terms,
    source_matches_terms,
    looks_like_refusal,
    decode_flight_string,
    harvest_natural_strings,
    looks_like_login_wall,
)


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


def test_refusal_detection_catches_dont_have_phrasing():
    # Regression: the exact graph-completion refusal that used to be shown as a
    # real answer (footer "via cognee") instead of falling back to the grounded LLM.
    assert looks_like_refusal("I don't have any information about Builderly in the provided data.")
    assert looks_like_refusal("I could not find anything about that.")
    assert looks_like_refusal("There is no information on this topic.")
    assert looks_like_refusal("")


def test_refusal_detection_allows_real_answers():
    assert not looks_like_refusal("Builderly is a no-code website builder for small businesses.")
    assert not looks_like_refusal("You decided to migrate billing from Stripe to Paddle in Q3.")


def test_decode_flight_string_unescapes():
    assert decode_flight_string("Hello\\nWorld") == "Hello\nWorld"
    assert decode_flight_string("a \\u003e b") == "a > b"
    assert decode_flight_string('say \\"hi\\"') == 'say "hi"'


def test_harvest_pulls_conversation_text_from_flight_payload():
    # Mimics the escaped React-Flight payload shape modern ChatGPT emits.
    payload = (
        r'["stop_tokens",[387],"content_type",\"text\",\"parts\",[392],'
        r'\"Builderly is an AI first technology studio that builds software for startups.\"'
        r',\"another\",\"The migration to Paddle is scheduled for Q3 next year.\"'
        r',\"className\",\"px-4 rounded-lg border-2\"'  # noise, must be dropped
    )
    got = harvest_natural_strings(payload)
    joined = " ".join(got)
    assert "Builderly is an AI first technology studio" in joined
    assert "migration to Paddle" in joined
    assert "rounded-lg" not in joined  # class-name noise filtered out


def test_harvest_dedupes_and_skips_short_fragments():
    payload = r'\"This is a long enough natural sentence to keep.\",\"This is a long enough natural sentence to keep.\",\"tiny\"'
    got = harvest_natural_strings(payload)
    assert got == ["This is a long enough natural sentence to keep."]


def test_login_wall_detection():
    assert looks_like_login_wall("Log in to get answers based on saved chats.")
    assert looks_like_login_wall("")
    # A full conversation that merely mentions signing up is not a login wall.
    long_convo = "We discussed Builderly. " * 60 + "You can sign up for free later."
    assert not looks_like_login_wall(long_convo)
