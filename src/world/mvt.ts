// Mapbox Vector Tiles, read just enough: layers → features → rings, in tile units. The water a
// placeholder cell must know about comes from here — OpenFreeMap's CDN-served OpenMapTiles
// planet (OSM's water and the coastline's sea polygons, no key, CORS-open) — so a cell whose
// Overpass query timed out still knows where Elliott Bay is. (Overpass took 25 s and more for a
// four-line water query on a busy afternoon; the CDN answers in a fifth of a second.)
// Spec: https://github.com/mapbox/vector-tile-spec (2.1). No dependencies: a protobuf reader in
// thirty lines, geometry commands decoded straight into rings.

export interface MvtFeature { type: number; tags: Record<string, string | number | boolean>; rings: [number, number][][] }
export interface MvtLayer { name: string; extent: number; features: MvtFeature[] }

class Pbf {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}
  varint(): number {
    let v = 0, s = 0, b = 0;
    do { b = this.buf[this.pos++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80 && s < 70);
    return v;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error('mvt: wire type ' + wire);
  }
  bytes(): Uint8Array { const n = this.varint(), b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  string(): string { return new TextDecoder().decode(this.bytes()); }
  packed(): number[] { const end = this.varint() + this.pos, out: number[] = []; while (this.pos < end) out.push(this.varint()); return out; }
}

function value(b: Uint8Array): string | number | boolean {
  const p = new Pbf(b);
  let v: string | number | boolean = '';
  while (p.pos < b.length) {
    const t = p.varint(), f = t >> 3, w = t & 7;
    if (f === 1) v = p.string();
    else if (f === 2) { v = new DataView(b.buffer, b.byteOffset + p.pos, 4).getFloat32(0, true); p.pos += 4; }
    else if (f === 3) { v = new DataView(b.buffer, b.byteOffset + p.pos, 8).getFloat64(0, true); p.pos += 8; }
    else if (f === 4 || f === 5) v = p.varint();
    else if (f === 6) { const z = p.varint(); v = z % 2 ? -(z + 1) / 2 : z / 2; }
    else if (f === 7) v = !!p.varint();
    else p.skip(w);
  }
  return v;
}

/** Decode the layers of a tile whose name passes `want` (others are skipped unread). */
export function readMvt(data: ArrayBuffer | Uint8Array, want: (name: string) => boolean = () => true): MvtLayer[] {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const tile = new Pbf(buf), layers: MvtLayer[] = [];
  while (tile.pos < buf.length) {
    const t = tile.varint();
    if (t >> 3 !== 3 || (t & 7) !== 2) { tile.skip(t & 7); continue; }
    const lb = tile.bytes(), L = new Pbf(lb);
    // a first pass for the name, keys, values and extent; features decoded once we know we want them
    let name = '', extent = 4096;
    const keys: string[] = [], vals: (string | number | boolean)[] = [], feats: Uint8Array[] = [];
    while (L.pos < lb.length) {
      const lt = L.varint(), f = lt >> 3;
      if (f === 1) name = L.string();
      else if (f === 2) feats.push(L.bytes());
      else if (f === 3) keys.push(L.string());
      else if (f === 4) vals.push(value(L.bytes()));
      else if (f === 5) extent = L.varint();
      else L.skip(lt & 7);
    }
    if (!want(name)) continue;
    const features: MvtFeature[] = [];
    for (const fb of feats) {
      const F = new Pbf(fb);
      let type = 0, tags: number[] = [], geom: number[] = [];
      while (F.pos < fb.length) {
        const ft = F.varint(), f = ft >> 3;
        if (f === 2) tags = F.packed();
        else if (f === 3) type = F.varint();
        else if (f === 4) geom = F.packed();
        else F.skip(ft & 7);
      }
      const tg: MvtFeature['tags'] = {};
      for (let i = 0; i + 1 < tags.length; i += 2) tg[keys[tags[i]]] = vals[tags[i + 1]];
      // geometry: MoveTo / LineTo / ClosePath commands over zigzag deltas
      const rings: [number, number][][] = [];
      let x = 0, y = 0, cur: [number, number][] | null = null;
      for (let i = 0; i < geom.length; ) {
        const c = geom[i++], id = c & 7, n = c >> 3;
        if (id === 7) { if (cur) rings.push(cur); cur = null; continue; }
        for (let k = 0; k < n; k++) {
          const dx = geom[i++], dy = geom[i++];
          x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
          y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
          if (id === 1) { if (cur && type !== 3) rings.push(cur); cur = [[x, y]]; }
          else cur?.push([x, y]);
        }
      }
      if (cur && type !== 3) rings.push(cur);
      features.push({ type, tags: tg, rings });
    }
    layers.push({ name, extent, features });
  }
  return layers;
}

/** A polygon ring's signed area in tile units by the surveyor's formula: > 0 an outer ring (it
 *  winds clockwise on screen, y down), < 0 a hole (spec 4.3.4.4). */
export function ringArea(r: [number, number][]) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
