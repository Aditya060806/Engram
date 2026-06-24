import time
from collections import OrderedDict

class MemoryCache:
    def __init__(self, max_entries: int = 64, default_ttl: int = 30):
        self._cache: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self._max_entries = max_entries
        self._default_ttl = default_ttl

    def get(self, key: str) -> object | None:
        if key not in self._cache:
            return None
        expires_at, data = self._cache[key]
        if time.monotonic() > expires_at:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return data

    def set(self, key: str, data: object, ttl: int | None = None) -> None:
        ttl = ttl if ttl is not None else self._default_ttl
        self._cache[key] = (time.monotonic() + ttl, data)
        self._cache.move_to_end(key)
        if len(self._cache) > self._max_entries:
            self._cache.popitem(last=False)

    def invalidate(self, key: str) -> None:
        self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        for key in list(self._cache.keys()):
            if key.startswith(prefix):
                del self._cache[key]

    def clear(self) -> None:
        self._cache.clear()

cache = MemoryCache(max_entries=128, default_ttl=30)
