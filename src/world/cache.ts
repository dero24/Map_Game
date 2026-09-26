// IndexedDB tile cache (Phase C): baked payloads are content-addressed by a manifest fingerprint,
// so a re-bake invalidates itself — old entries for the same base are evicted lazily at init.
// Used by both the main thread (atlas/paint/fallback loads) and the tile worker (its own idb
// connection over the same database). Structured clone makes stored buffers independent of
// whatever the caller does with them (incl. transfer-out of the worker).
import { openDB, type IDBPDatabase } from 'idb';
import type { AtlasManifest } from './data';

let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB('map-game', 1, {
    upgrade(d) {
      d.createObjectStore('files');
    },
  }));

// A bake fingerprint: any change to tiles, cell, terrain layouts or slice makes every cached
// payload stale. Small enough to compute once per session.
export function manifestFingerprint(man: AtlasManifest): string {
  // bakeId: a content hash the bake stamps — a re-bake with an identical layout (same cells,
  // terrain, slice) must still retire every cached tile payload.
  const s = JSON.stringify(man.tiles) + '|' + man.cell + '|' + JSON.stringify(man.terrain) + '|' + JSON.stringify(man.slice) + '|' + (man.bakeId ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

let prefix = '';

export function initCache(base: string, fp: string) {
  prefix = `${base}|${fp}|`;
  void (async () => {
    // Evict this base's stale entries (previous bakes) in the background — keys carry the
    // fingerprint, so a stale key can never hit regardless of when this finishes.
    try {
      const d = await db();
      const keys = (await d.getAllKeys('files')) as string[];
      const tx = d.transaction('files', 'readwrite');
      let n = 0;
      for (const k of keys) if (k.startsWith(base + '|') && !k.startsWith(prefix)) void tx.store.delete(k), n++;
      await tx.done;
      if (n) console.info(`tile cache: evicted ${n} stale entries for ${base}`);
    } catch (e) {
      console.warn('tile cache eviction failed', e);
    }
  })();
}

// Fetch a baked payload through the cache. Without initCache (legacy path) it's a plain fetch.
export async function cachedFetch(url: string): Promise<ArrayBuffer> {
  if (!prefix) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.arrayBuffer();
  }
  const d = await db();
  const key = prefix + url;
  const hit = (await d.get('files', key)) as ArrayBuffer | undefined;
  if (hit) return hit; // a fresh structured clone — safe to transfer/detach downstream
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  const buf = await r.arrayBuffer();
  void d.put('files', buf, key).catch((e) => console.warn('tile cache put failed', e));
  return buf;
}

export async function cachedFetchJson(url: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await cachedFetch(url)));
}
