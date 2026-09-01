/**
 * Process-local TTL cache with request coalescing.
 *
 * Upstream quotas are the binding constraint here (Statlocker allows 1,000
 * match requests per hour), so every provider call goes through this. It lives
 * on globalThis to survive Next.js dev-server hot reloads.
 *
 * Swap this for Redis when running more than one instance; `cached()` is the
 * only seam that needs to change.
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

interface CacheState {
  entries: Map<string, CacheEntry>;
  inflight: Map<string, Promise<unknown>>;
  hits: number;
  misses: number;
}

const globalRef = globalThis as typeof globalThis & { __streamlockCache?: CacheState };

const state: CacheState = (globalRef.__streamlockCache ??= {
  entries: new Map(),
  inflight: new Map(),
  hits: 0,
  misses: 0,
});

const MAX_ENTRIES = 5_000;

function evictIfNeeded(): void {
  if (state.entries.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of state.entries) {
    if (entry.expiresAt <= now) state.entries.delete(key);
  }
  // Still oversized: drop oldest insertions (Map preserves insertion order).
  while (state.entries.size > MAX_ENTRIES) {
    const oldest = state.entries.keys().next();
    if (oldest.done) break;
    state.entries.delete(oldest.value);
  }
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = state.entries.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    state.hits += 1;
    return existing.value as T;
  }

  const pending = state.inflight.get(key);
  if (pending) return pending as Promise<T>;

  state.misses += 1;
  const promise = loader()
    .then((value) => {
      state.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      evictIfNeeded();
      return value;
    })
    .finally(() => {
      state.inflight.delete(key);
    });

  state.inflight.set(key, promise);
  return promise;
}

/** Cache a value only if the loader succeeds; failures are never memoised. */
export function cacheStats(): { size: number; hits: number; misses: number } {
  return { size: state.entries.size, hits: state.hits, misses: state.misses };
}

export function clearCache(prefix?: string): number {
  if (!prefix) {
    const size = state.entries.size;
    state.entries.clear();
    return size;
  }
  let removed = 0;
  for (const key of state.entries.keys()) {
    if (key.startsWith(prefix)) {
      state.entries.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export const TTL = {
  matchHistory: 5 * 60 * 1000,
  matchDetail: 24 * 60 * 60 * 1000,
  profile: 30 * 60 * 1000,
  twitchToken: 0, // managed separately, expiry comes from Twitch
  twitchUser: 6 * 60 * 60 * 1000,
  twitchVideos: 10 * 60 * 1000,
  twitchStreams: 60 * 1000,
  heroes: 24 * 60 * 60 * 1000,
  steamProfile: 60 * 60 * 1000,
} as const;
