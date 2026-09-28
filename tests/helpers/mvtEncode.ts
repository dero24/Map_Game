// A minimal Mapbox Vector Tile encoder for tests: layers of point / line / polygon features with
// string or number tags — the protobuf the CDN sends, built by hand.
type Val = string | number | boolean;
export interface EncFeature { type: 1 | 2 | 3; tags: Record<string, Val>; geom: [number, number][][] }
export interface EncLayer { name: string; features: EncFeature[]; extent?: number }

const varint = (v: number, o: number[]) => { while (v >= 0x80) { o.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } o.push(v); };
const key = (f: number, w: number, o: number[]) => varint((f << 3) | w, o);
const bytes = (f: number, b: number[], o: number[]) => { key(f, 2, o); varint(b.length, o); o.push(...b); };
const str = (f: number, s: string, o: number[]) => bytes(f, [...new TextEncoder().encode(s)], o);
const zz = (n: number) => (n << 1) ^ (n >> 31);

function geometry(type: number, parts: [number, number][][]) {
  const g: number[] = [];
  let cx = 0, cy = 0;
  if (type === 1) {
    g.push((parts.flat().length << 3) | 1);
    for (const [x, y] of parts.flat()) (g.push(zz(x - cx), zz(y - cy)), ([cx, cy] = [x, y]));
    return g;
  }
  for (const r of parts) {
    g.push((1 << 3) | 1, zz(r[0][0] - cx), zz(r[0][1] - cy));
    [cx, cy] = r[0];
    g.push(((r.length - 1) << 3) | 2);
    for (const [x, y] of r.slice(1)) (g.push(zz(x - cx), zz(y - cy)), ([cx, cy] = [x, y]));
    if (type === 3) g.push((1 << 3) | 7);
  }
  return g;
}

export function encodeTile(layers: EncLayer[]): Uint8Array {
  const out: number[] = [];
  for (const L of layers) {
    const keys: string[] = [], vals: Val[] = [];
    const ki = (k: string) => { let i = keys.indexOf(k); if (i < 0) i = keys.push(k) - 1; return i; };
    const vi = (v: Val) => { let i = vals.indexOf(v); if (i < 0) i = vals.push(v) - 1; return i; };
    const o: number[] = [];
    key(15, 0, o); varint(2, o);
    str(1, L.name, o);
    for (const f of L.features) {
      const fb: number[] = [];
      const packed = (fld: number, a: number[]) => { const b: number[] = []; for (const v of a) varint(v, b); bytes(fld, b, fb); };
      packed(2, Object.entries(f.tags).flatMap(([k, v]) => [ki(k), vi(v)]));
      key(3, 0, fb); varint(f.type, fb);
      packed(4, geometry(f.type, f.geom));
      bytes(2, fb, o);
    }
    for (const k of keys) str(3, k, o);
    for (const v of vals) {
      const b: number[] = [];
      if (typeof v === 'string') str(1, v, b);
      else if (typeof v === 'boolean') { key(7, 0, b); varint(v ? 1 : 0, b); }
      else if (Number.isInteger(v) && v >= 0) { key(5, 0, b); varint(v, b); }
      else { key(3, 1, b); const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v, true); b.push(...new Uint8Array(dv.buffer)); }
      bytes(4, b, o);
    }
    key(5, 0, o); varint(L.extent ?? 4096, o);
    bytes(3, o, out);
  }
  return new Uint8Array(out);
}
