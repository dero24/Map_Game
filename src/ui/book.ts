// The sketchbook's storage: paintings (full + thumbnail JPEG blobs + where/when), commission state,
// and the spotting log. IndexedDB, global across regions (a page remembers its lat/lon, not a local frame).
import { openDB, type IDBPDatabase } from 'idb';

export interface Page {
  id: string;
  t: number; // real time painted (ms)
  lat: number;
  lon: number;
  yaw: number;
  place: string; // caption line: "Ocean Avenue, Sea Bright"
  when: string; // "7:42 pm · golden hour"
  commission?: string; // title of a commission it fulfilled
  img: Blob;
  thumb: Blob;
}
export interface BookState {
  done: { id: string; title: string; page: string; t: number }[];
  active: { id: string; title: string; hint: string; kind: string; lat?: number; lon?: number; y?: number; type?: string; cond?: string }[];
  spotted: Record<string, string[]>; // family → types seen ("car" → ["sedan", "pickup"])
}
export const emptyState = (): BookState => ({ done: [], active: [], spotted: {} });

let dbp: Promise<IDBPDatabase> | null = null;
const db = () => {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return (dbp ??= openDB('map-game-sketchbook', 1, {
      upgrade: (d) => { d.createObjectStore('pages', { keyPath: 'id' }); d.createObjectStore('state'); },
    }));
  } catch { return null; }
};

export async function savePage(p: Page) { try { await (await db())?.put('pages', p); } catch { /* quota / private */ } }
export async function deletePage(id: string) { try { await (await db())?.delete('pages', id); } catch { /* ignore */ } }
export async function listPages(): Promise<Page[]> {
  try { return (((await (await db())?.getAll('pages')) ?? []) as Page[]).sort((a, b) => b.t - a.t); } catch { return []; }
}
export async function loadState(): Promise<BookState> {
  try { return { ...emptyState(), ...(((await (await db())?.get('state', 'book')) ?? {}) as Partial<BookState>) }; } catch { return emptyState(); }
}
export async function saveState(s: BookState) { try { await (await db())?.put('state', s, 'book'); } catch { /* ignore */ } }
