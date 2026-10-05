// A minimal ESRI shapefile + dBASE reader: polygons (shape type 5) and their attribute rows —
// enough for the Census cartographic boundary files (scripts/build-places.mjs). No dependency.
import { readFileSync } from 'node:fs';

/** The records of a .dbf: one object per row, trimmed strings (numbers stay strings). */
export function readDbf(path, encoding = 'utf8') {
  const b = readFileSync(path);
  const n = b.readUInt32LE(4), headLen = b.readUInt16LE(8), recLen = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) {
    const name = b.toString('latin1', o, o + 11).replace(/\0.*$/s, '');
    fields.push({ name, len: b[o + 16] });
  }
  const dec = new TextDecoder(encoding);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const o = headLen + i * recLen;
    if (b[o] === 0x2a) { rows.push(null); continue; } // deleted
    let p = o + 1;
    const row = {};
    for (const f of fields) { row[f.name] = dec.decode(b.subarray(p, p + f.len)).trim(); p += f.len; }
    rows.push(row);
  }
  return rows;
}

/** The polygons of a .shp, in file order: each a list of rings, each ring flat [x0, y0, x1, y1, …]
 *  (null for a null shape). */
export function readShpPolygons(path) {
  const b = readFileSync(path);
  const out = [];
  for (let o = 100; o + 8 <= b.length; ) {
    const len = b.readUInt32BE(o + 4) * 2; // content length in 16-bit words
    const c = o + 8;
    const type = b.readInt32LE(c);
    if (type === 0) { out.push(null); o = c + len; continue; }
    if (type !== 5 && type !== 15 && type !== 25) throw new Error(`shape type ${type} at ${o}: polygons only`);
    const nParts = b.readInt32LE(c + 36), nPts = b.readInt32LE(c + 40);
    const parts = [];
    for (let i = 0; i < nParts; i++) parts.push(b.readInt32LE(c + 44 + i * 4));
    const pts = c + 44 + nParts * 4;
    const rings = [];
    for (let i = 0; i < nParts; i++) {
      const a = parts[i], z = i + 1 < nParts ? parts[i + 1] : nPts;
      const r = new Array((z - a) * 2);
      for (let k = a; k < z; k++) { r[(k - a) * 2] = b.readDoubleLE(pts + k * 16); r[(k - a) * 2 + 1] = b.readDoubleLE(pts + k * 16 + 8); }
      rings.push(r);
    }
    out.push(rings);
    o = c + len;
  }
  return out;
}
