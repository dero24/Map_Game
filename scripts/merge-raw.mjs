// Offline union of already-fetched regions: `node scripts/merge-raw.mjs --region=<id>` where the
// region spec lists `mergeFrom: ['a', 'b']`. Builds raw/<id>/ from the sources' raw inputs so a
// wider region can be baked without re-downloading (a fresh `npm run fetch -- --region=<id>`
// over the union bbox is the long-term path; this is equivalent where the sources cover it).
//   osm.json                 elements deduped by type+id (newest source wins on conflicts)
//   overture-buildings.json  rows deduped by id
//   roofs.json               colour maps merged
//   worldcover.json          mosaicked on ESA's shared 1/12000° grid over the union bbox
//   terrain/<z>/*.png        copied (slippy tiles are identical across sources)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, REGIONS, REGION, CFG } from './config.mjs';

if (!CFG.mergeFrom?.length) {
  console.error(`region '${REGION}' has no mergeFrom list`);
  process.exit(2);
}
const rawOf = (id) => {
  const root = resolve(ROOT, 'raw');
  // same transition shim as config.mjs: seabright's data may still live at raw/ top level
  return id === 'seabright' && existsSync(resolve(root, 'osm.json')) && !existsSync(resolve(root, 'seabright', 'osm.json')) ? root : resolve(root, id);
};
const out = resolve(ROOT, 'raw', REGION);
mkdirSync(out, { recursive: true });
const srcs = CFG.mergeFrom.map((id) => {
  if (!REGIONS[id]) throw new Error(`mergeFrom: unknown region ${id}`);
  return { id, dir: rawOf(id) };
});
const read = (dir, f) => (existsSync(resolve(dir, f)) ? JSON.parse(readFileSync(resolve(dir, f), 'utf8')) : null);

// --- OSM ---
{
  const byKey = new Map();
  let head = null, newest = '';
  for (const s of srcs) {
    const d = read(s.dir, 'osm.json');
    if (!d) continue;
    const ts = d.osm3s?.timestamp_osm_base ?? '';
    if (!head || ts > newest) (head = d), (newest = ts);
    for (const e of d.elements) {
      const k = e.type[0] + e.id;
      const prev = byKey.get(k);
      if (!prev || ts >= prev.ts) byKey.set(k, { e, ts });
    }
  }
  // stable order: nodes, ways, relations, then id — the bake is order-sensitive only via ids
  const rank = { node: 0, way: 1, relation: 2 };
  const elements = [...byKey.values()].map((v) => v.e).sort((a, b) => rank[a.type] - rank[b.type] || a.id - b.id);
  writeFileSync(resolve(out, 'osm.json'), JSON.stringify({ ...head, elements }));
  console.log(`osm: ${elements.length} elements (newest base ${newest})`);
}
// --- Overture ---
{
  const rows = new Map();
  let release = '';
  for (const s of srcs) {
    const d = read(s.dir, 'overture-buildings.json');
    if (!d) continue;
    if (d.release > release) release = d.release;
    for (const r of d.rows) rows.set(r.id, r);
  }
  writeFileSync(resolve(out, 'overture-buildings.json'), JSON.stringify({ release, rows: [...rows.values()].sort((a, b) => (a.id < b.id ? -1 : 1)) }));
  console.log(`overture: ${rows.size} rows`);
}
// --- roofs ---
{
  const colors = {};
  let meta = null;
  for (const s of srcs) {
    const d = read(s.dir, 'roofs.json');
    if (!d) continue;
    meta ??= d;
    Object.assign(colors, d.colors);
  }
  if (meta) writeFileSync(resolve(out, 'roofs.json'), JSON.stringify({ ...meta, colors }));
  console.log(`roofs: ${Object.keys(colors).length} colours`);
}
// --- WorldCover mosaic ---
{
  const R = 12000; // ESA WorldCover 10 m product: 1/12000° pixels on a global grid
  const parts = srcs.map((s) => read(s.dir, 'worldcover.json')).filter(Boolean);
  if (parts.length) {
    const w = Math.min(...parts.map((p) => p.bbox.w)), e = Math.max(...parts.map((p) => p.bbox.e));
    const n = Math.max(...parts.map((p) => p.bbox.n)), sLat = Math.min(...parts.map((p) => p.bbox.s));
    const W = Math.round((e - w) * R), H = Math.round((n - sLat) * R);
    const buf = new Uint8Array(W * H);
    for (const p of parts) {
      const data = Buffer.from(p.data, 'base64');
      const ox = Math.round((p.bbox.w - w) * R), oy = Math.round((n - p.bbox.n) * R);
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const v = data[y * p.w + x];
          const X = x + ox, Y = y + oy;
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue; // rounding at the seams must not wrap rows
          const i = Y * W + X;
          if (v && !buf[i]) buf[i] = v; // first source with data wins (sources agree on overlap)
        }
    }
    writeFileSync(resolve(out, 'worldcover.json'), JSON.stringify({ w: W, h: H, bbox: { w, n, e, s: sLat }, data: Buffer.from(buf).toString('base64') }));
    console.log(`worldcover: ${W}x${H}`);
  }
}
// --- coverage: warn when the merged region's backdrop reaches past every source ---
{
  const B = CFG.backdrop, pts = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) pts.push([B.s + ((B.n - B.s) * i) / 8, B.w + ((B.e - B.w) * j) / 8]);
  const miss = pts.filter(([la, lo]) => !CFG.mergeFrom.some((id) => { const b = REGIONS[id].backdrop; return la >= b.s && la <= b.n && lo >= b.w && lo <= b.e; }));
  if (miss.length) console.warn(`coverage: ${miss.length}/81 backdrop sample points lie outside every source backdrop, e.g. ${miss.slice(0, 3).map((p) => p.map((v) => v.toFixed(3)).join(',')).join('  ')} — shrink the backdrop or fetch the union`);
  else console.log('coverage: backdrop fully covered by sources');
}
// --- terrain tiles ---
{
  let n = 0;
  for (const s of srcs) {
    const t = resolve(s.dir, 'terrain');
    if (!existsSync(t)) continue;
    for (const z of readdirSync(t)) {
      mkdirSync(resolve(out, 'terrain', z), { recursive: true });
      for (const f of readdirSync(resolve(t, z))) {
        const dst = resolve(out, 'terrain', z, f);
        if (!existsSync(dst)) copyFileSync(resolve(t, z, f), dst), n++;
      }
    }
  }
  console.log(`terrain: ${n} tiles`);
}
