interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

function cacheKey(endpoint: string, options?: RequestInit): string {
  if (!options || options.method === undefined || options.method === "GET") {
    return `GET:${endpoint}`;
  }
  return `${options.method || "GET"}:${endpoint}`;
}

export function setCache<T>(endpoint: string, data: T, ttlMs: number, options?: RequestInit): void {
  const key = cacheKey(endpoint, options);
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function getCache<T>(endpoint: string, options?: RequestInit): T | null {
  const key = cacheKey(endpoint, options);
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

const INVALIDATION_MAP: Record<string, string[]> = {
  "/ingest": ["/graph-snapshot", "/sources", "/schema-inventory", "/topics", "/recap"],
  "/reconciliation/resolve": ["/reconciliation/events", "/graph-snapshot", "/recap"],
  "/forget/node": ["/graph-snapshot", "/recap"],
  "/forget/source": ["/sources", "/graph-snapshot", "/recap"],
  "/reset-demo": ["*"],
  "/decay/settings": ["/decay/settings"],
  "/memory/improve": ["/graph-snapshot", "/schema-inventory", "/recap"],
  "/ai/config": ["/ai/config"],
};

export function invalidateCache(endpoint: string): void {
  const patterns = INVALIDATION_MAP[endpoint];
  if (!patterns) return;
  if (patterns.includes("*")) {
    cache.clear();
    return;
  }
  for (const pattern of patterns) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  }
}

export function dedupeRequest<T>(endpoint: string, fetcher: () => Promise<T>, options?: RequestInit): Promise<T> {
  const key = cacheKey(endpoint, options);
  const existing = pendingRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fetcher().finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, promise);
  return promise;
}
