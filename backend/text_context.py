"""Dependency-free text-context helpers for grounding recall answers.

These are pure functions (no I/O, no heavy imports) so they can be unit-tested
in CI without installing the full backend/Cognee stack. `services` imports and
uses them; the retrieval logic that decides *what* content to hand the LLM lives
here so it is independently testable.
"""
from __future__ import annotations


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
