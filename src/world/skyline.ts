// The skyline ring: a city's towers past the 1.5 km detail ring. The streamed tiles are the city up
// close; beyond them the coarse ring is procedural, so from Midtown the Empire State Building,
// from Queen Anne the Seattle skyline, from a Miami beach the condo wall would simply not be there.
// One Overpass read of every tall building (≥ 45 m or 14+ storeys) and tall building part within
// 8 km — through the same osmToTile transform as the tiles, so heights, parts, colours and recipes
// match — built as lite silhouettes per 1024 m cell. A cell's towers hide the moment its real tile mounts
// (no doubled walls); the read is cached in IndexedDB like the direct tiles, and re-read when you
// walk more than 4 km from where it was taken. Nothing in a town without towers: an empty read.
import * as THREE from 'three';
import { buildBuildings } from './buildings';
import { demSampler } from './dem';
import { kvGet, kvPut } from './cache';
import { makeProjector, osmToTile, type LatLon, type OsmDoc } from './realTile';
import type { Building, Terrain, TileJson, World, WorldJson } from './data';

const R = 8000, TALL = 45, FLOORS = 14, SKY_V = 2;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export function skylineQuery(bb: { s: number; w: number; n: number; e: number }) {
  const b = `${bb.s.toFixed(5)},${bb.w.toFixed(5)},${bb.n.toFixed(5)},${bb.e.toFixed(5)}`;
  return `[out:json][timeout:60][bbox:${b}];(
  way["building"]["height"](if: number(t["height"]) >= ${TALL});
  way["building"]["building:levels"](if: number(t["building:levels"]) >= ${FLOORS});
  relation["building"]["height"](if: number(t["height"]) >= ${TALL});
  way["building:part"]["height"](if: number(t["height"]) >= ${TALL});
);out geom qt;`;
}

export class Skyline {
  readonly group = new THREE.Group();
  private cells = new Map<string, THREE.Group>();
  private cx = Infinity;
  private cz = Infinity;
  private busy = false;
  private gen = 0;

  constructor(private origin: LatLon, private cell: number, private enabled: boolean) {
    this.group.name = 'skyline';
  }

  /** Per frame: hide cells whose real tile is mounted; re-read when the walker has moved far. */
  update(x: number, z: number, realLoaded: (cellKey: string) => boolean) {
    if (!this.enabled) return;
    // a cell's towers stay until its real tile has mounted, however close you come — hiding
    // them by distance made a city melt away as you flew in faster than its tiles streamed
    for (const [k, g] of this.cells) g.visible = !realLoaded(k);
    if (this.busy || Math.hypot(x - this.cx, z - this.cz) < 4000) return;
    this.busy = true;
    const cx = Math.round(x / 2000) * 2000, cz = Math.round(z / 2000) * 2000;
    const gen = ++this.gen;
    void this.read(cx, cz)
      .then((tj) => (gen === this.gen && tj ? this.build(tj) : undefined))
      .catch(() => {})
      .finally(() => { this.cx = cx; this.cz = cz; this.busy = false; });
  }

  private async read(cx: number, cz: number): Promise<TileJson | null> {
    const P = makeProjector(this.origin);
    const key = `sky${SKY_V}|${this.origin.lat.toFixed(4)},${this.origin.lon.toFixed(4)}|${cx}_${cz}`;
    const hit = await kvGet<TileJson>(key);
    if (hit) return hit;
    const box = { x0: cx - R, z0: cz - R, x1: cx + R, z1: cz + R };
    const body = 'data=' + encodeURIComponent(skylineQuery(P.localToBbox(box)));
    for (const ep of OVERPASS) {
      try {
        const r = await fetch(ep, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(70000) });
        if (!r.ok) continue;
        const j = (await r.json()) as OsmDoc & { remark?: string };
        if (typeof j.remark === 'string' && /error|timed out|out of memory/i.test(j.remark)) continue;
        const tj = osmToTile(j, { id: 'skyline', box, origin: this.origin, margin: 0 });
        void kvPut(key, tj);
        return tj;
      } catch { /* next mirror */ }
    }
    return null;
  }

  private async build(tj: TileJson) {
    for (const g of this.cells.values()) { this.group.remove(g); g.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    this.cells.clear();
    // the tall parts too, with the outlines they stand on: a landmark drawn by its parts (the
    // Space Needle's saucer over its legs) was a plain 184 m prism of its outline from afar, and a
    // tower's outline a podium under its shaft (osmToTile's part join, as on the tiles)
    const hostOf = new Set(tj.buildings.flatMap((b) => (b.pt && b.po != null && b.po >= 0 ? [b.po] : [])));
    const keep = tj.buildings.map((b, i) => (b.pt ? (b.po != null && b.po >= 0) || b.h + (b.lf ?? 0) >= 30 : hostOf.has(i) || b.h + (b.lf ?? 0) >= 30));
    const towers = tj.buildings.filter((_, i) => keep[i]);
    if (!towers.length) return;
    // ground under each tower from a bare-earth DEM (towers sit in the coarse ring, where no
    // detail terrain is loaded). Not the horizon's zoom 9: zooms 9-10 are SRTM-class surface
    // models that read a city's roofs as ground — Midtown at ~50 m, not ~20 — and every skyline
    // tower stood 30–40 m tall until its real tile swapped in, then "vanished" into the city.
    const P = makeProjector(this.origin);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of towers) for (let i = 0; i + 1 < b.r.length; i += 2) (x0 = Math.min(x0, b.r[i] / 10)), (x1 = Math.max(x1, b.r[i] / 10)), (z0 = Math.min(z0, b.r[i + 1] / 10)), (z1 = Math.max(z1, b.r[i + 1] / 10));
    const at = await demSampler(11, P.localToBbox({ x0: x0 - 500, z0: z0 - 500, x1: x1 + 500, z1: z1 + 500 })); // (z11+: bare earth)
    const ground = (x: number, z: number) => { const [lat, lon] = P.unproject(x, z); return at ? at(lat, lon) : 0; };
    const terrain = { heightAt: ground, oceanDistAt: () => 1e4, sdfAt: () => 100, coverAt: () => 50 } as unknown as Terrain;
    // by cell (a part goes where its outline does), each part's outline index remapped into
    // its cell's list
    const cellOf = (b: Building) => {
      let sx = 0, sz = 0;
      const n = b.r.length >> 1;
      for (let i = 0; i < n; i++) (sx += b.r[i * 2] / 10), (sz += b.r[i * 2 + 1] / 10);
      return `${Math.floor(sx / n / this.cell)}_${Math.floor(sz / n / this.cell)}`;
    };
    const byCell = new Map<string, Building[]>(), slot = new Map<number, [string, number]>();
    const add = (i: number, k: string) => {
      const l = byCell.get(k) ?? byCell.set(k, []).get(k)!;
      slot.set(i, [k, l.length]);
      l.push({ ...tj.buildings[i], own: undefined, lod: 1 });
    };
    tj.buildings.forEach((b, i) => { if (keep[i] && !(b.pt && b.po != null && b.po >= 0)) add(i, cellOf(b)); });
    tj.buildings.forEach((b, i) => {
      if (!keep[i] || !(b.pt && b.po != null && b.po >= 0)) return;
      const host = slot.get(b.po);
      add(i, host ? host[0] : cellOf(b));
      const [k, j] = slot.get(i)!;
      byCell.get(k)![j].po = host && host[0] === k ? host[1] : -1;
    });
    let idBase = 1 << 22;
    for (const [k, list] of byCell) {
      const [i, j] = k.split('_').map(Number);
      const cellBox = { x0: i * this.cell, z0: j * this.cell, x1: (i + 1) * this.cell, z1: (j + 1) * this.cell };
      const json = { ...tj, buildings: list, roads: [], areas: [], lines: [], points: [], slice: cellBox, backdrop: cellBox, landmarks: [] } as unknown as WorldJson;
      const res = buildBuildings({ json, terrain } as World, idBase, true);
      idBase += list.length + 1;
      res.group.name = `skyline:${k}`;
      this.cells.set(k, res.group);
      this.group.add(res.group);
      await new Promise((r) => setTimeout(r, 0)); // a cell at a time: no long frame
    }
  }
}
