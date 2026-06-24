const store = globalThis.__jujaServerCache || new Map();
globalThis.__jujaServerCache = store;

export async function getCached(key, ttlMs, loader) {
  const now = Date.now();
  const existing = store.get(key);

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.promise) return existing.promise;

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      store.delete(key);
      throw error;
    });

  store.set(key, {
    promise,
    value: existing?.value,
    expiresAt: existing?.expiresAt || 0,
  });

  return promise;
}

export function clearCached(prefix = "") {
  for (const key of store.keys()) {
    if (!prefix || String(key).startsWith(prefix)) store.delete(key);
  }
}

export function cacheHeaders(seconds, staleSeconds = seconds * 4) {
  return {
    "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`,
    "CDN-Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`,
    "Vercel-CDN-Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`,
  };
}
