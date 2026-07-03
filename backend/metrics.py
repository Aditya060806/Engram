"""
Lightweight in-process request timing.

A tiny, dependency-free rolling store of per-endpoint response times so we can
measure real latency (avg / p50 / p95) without any external observability stack.
Bounded per endpoint, so memory stays flat.
"""
from collections import defaultdict, deque
from threading import Lock
from typing import Deque

_MAX_SAMPLES = 200
_samples: dict[str, Deque[float]] = defaultdict(lambda: deque(maxlen=_MAX_SAMPLES))
_lock = Lock()


def record(endpoint: str, ms: float) -> None:
    with _lock:
        _samples[endpoint].append(ms)


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * pct
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def summary() -> list[dict]:
    with _lock:
        snapshot = {k: list(v) for k, v in _samples.items()}
    out: list[dict] = []
    for endpoint, vals in snapshot.items():
        s = sorted(vals)
        n = len(s)
        if not n:
            continue
        out.append({
            "endpoint": endpoint,
            "count": n,
            "avg_ms": round(sum(s) / n, 1),
            "p50_ms": round(_percentile(s, 0.50), 1),
            "p95_ms": round(_percentile(s, 0.95), 1),
            "min_ms": round(s[0], 1),
            "max_ms": round(s[-1], 1),
        })
    out.sort(key=lambda r: r["count"], reverse=True)
    return out


def reset() -> None:
    with _lock:
        _samples.clear()
