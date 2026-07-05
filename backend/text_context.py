"""Dependency-free text-context helpers for grounding recall answers.

These are pure functions (no I/O, no heavy imports) so they can be unit-tested
in CI without installing the full backend/Cognee stack. `services` imports and
uses them; the retrieval logic that decides *what* content to hand the LLM lives
here so it is independently testable.
"""
from __future__ import annotations

import re


def snippets_around_terms(text: str, terms: list[str], window: int = 700,
                          max_snippets: int = 6, max_total: int = 6000) -> str:
    """Extract focused windows of `text` around each matching term and merge
    overlaps. Keeps injected context relevant and bounded so a large source
    (e.g. a 100k-char imported conversation) never blows the LLM prompt."""
    if not text or not terms:
        return ""
    text_lower = text.lower()
    spans: list[tuple[int, int]] = []
    for term in terms:
        start = 0
        while len(spans) < max_snippets * 4:
            idx = text_lower.find(term, start)
            if idx == -1:
                break
            spans.append((max(0, idx - window), min(len(text), idx + len(term) + window)))
            start = idx + len(term)
    if not spans:
        return ""
    spans.sort()
    merged = [spans[0]]
    for s, e in spans[1:]:
        ls, le = merged[-1]
        if s <= le:
            merged[-1] = (ls, max(le, e))
        else:
            merged.append((s, e))
    out: list[str] = []
    total = 0
    for s, e in merged[:max_snippets]:
        chunk = text[s:e].strip()
        if total + len(chunk) > max_total:
            chunk = chunk[: max(0, max_total - total)]
        if chunk:
            out.append(chunk)
            total += len(chunk)
        if total >= max_total:
            break
    return " … ".join(out)


def source_matches_terms(label: str, url: str | None, content: str | None,
                         terms: list[str]) -> tuple[bool, bool]:
    """Decide whether a source is relevant to the query terms.

    Returns (matched_by_label, matched_by_content). Matching the body — not just
    the label/url — is the key fix: an imported conversation labeled
    "ChatGPT Chat" never matches a user's question words by label, so its stored
    content used to be invisible to recall even though it held the answer.
    """
    label_lc = (label or "").lower()
    url_lc = (url or "").lower()
    for term in terms:
        if term in label_lc or (url_lc and term in url_lc):
            return True, False
    content_lc = (content or "").lower()
    if content_lc:
        for term in terms:
            if term in content_lc:
                return False, True
    return False, False


# Strong "the model has no answer" phrases. Kept broad on purpose: when Cognee's
# graph completion emits any of these (common right after ingest, before cognify
# finishes building the graph), recall discards it and falls through to the
# grounded LLM fallback rather than surfacing a bare refusal as the answer.
REFUSAL_MARKERS = (
    "no context", "no information", "no relevant information", "no relevant data",
    "no data available", "i don't know", "i do not know",
    "cannot answer", "can't answer", "unable to answer", "not able to answer",
    "not enough information", "insufficient information", "insufficient context",
    "don't have any information", "do not have any information",
    "don't have information", "do not have information", "don't have any data",
    "in the provided data", "in the provided context", "in the given context",
    "couldn't find", "could not find", "cannot find", "can't find",
    "doesn't contain", "does not contain", "not available in the",
)


def looks_like_refusal(text: str) -> bool:
    """True when an answer is really a 'no info found' response. Used to reject
    empty graph-completion results so recall falls back to the grounded LLM."""
    if not text:
        return True
    return any(m in text.lower() for m in REFUSAL_MARKERS)


# ── Conversation harvesting from JS-app (RSC/flight) payloads ──
# Modern ChatGPT/Claude share pages dropped __NEXT_DATA__ and stream the
# conversation as escaped strings inside <script> data (React Flight). A plain
# HTTP fetch can't run the JS, but the message text is present as escaped JSON
# strings. These helpers recover the readable conversation from that payload
# instead of ingesting login boilerplate.

_UNICODE_ESC = re.compile(r"\\u([0-9a-fA-F]{4})")
_FLIGHT_STRING = re.compile(r'\\"((?:[^\\]|\\.){25,}?)\\"', re.DOTALL)
_LEADING_KEYS = re.compile(r'^[\s,]*(?:"[^"]{1,24}",?|\[\d+\],?)+')
_NOISE_TOKENS = (
    "http", "://", "{", "}", "content_type", "message_id", "parent_id",
    "classname", "createelement", "svg", "px-", "rounded-", "border-",
    "font-", "text-", "reactcurrentdispatcher",
)


def decode_flight_string(s: str) -> str:
    """Decode one escaped React-Flight string back to readable text."""
    s = _UNICODE_ESC.sub(lambda m: chr(int(m.group(1), 16)), s)
    s = s.replace("\\r", "")
    s = s.replace("\\n", "\n").replace("\\t", "\t")
    s = s.replace('\\"', '"').replace("\\'", "'").replace("\\/", "/")
    s = s.replace("\\\\", "\\")
    return s.strip()


def _is_natural_language(t: str) -> bool:
    if len(t) < 25 or " " not in t:
        return False
    letters = sum(c.isalpha() or c.isspace() for c in t)
    if letters / max(len(t), 1) < 0.6:  # mostly ids/code/markup
        return False
    low = t.lower()
    return not any(b in low for b in _NOISE_TOKENS)


def harvest_natural_strings(payload: str, min_len: int = 25) -> list[str]:
    """Pull readable, de-duplicated natural-language strings out of an escaped
    flight/RSC payload, dropping code, ids, class names and short fragments."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in _FLIGHT_STRING.findall(payload):
        d = decode_flight_string(raw)
        d = _LEADING_KEYS.sub("", d).strip()  # drop leading  ,"text","parts",[392],
        if len(d) >= min_len and _is_natural_language(d) and d not in seen:
            seen.add(d)
            out.append(d)
    return out


_LOGIN_WALL_PHRASES = (
    "log in to get answers", "sign up for free", "log in to continue",
    "you need to sign in", "please log in", "get responses tailored to you",
)


def looks_like_login_wall(text: str) -> bool:
    """True for the short 'log in to see this' boilerplate that SPA share pages
    return to a scriptless fetcher — so we don't ingest it as the conversation."""
    if not text:
        return True
    low = text.lower()
    return len(text) < 500 and any(p in low for p in _LOGIN_WALL_PHRASES)
