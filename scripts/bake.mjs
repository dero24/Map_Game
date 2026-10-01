// Offline bake: raw OSM + Overture + Terrarium + WorldCover  ->  public/data/{world.json, terrain.bin}
// Deterministic: same raw inputs produce byte-identical outputs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { RAW, OUT, DATA, SLICE, BACKDROP, ORIGIN, REGION, CFG, REGIONS } from './config.mjs';
import { project, bboxToLocal, ringArea, centroid, pointInRing, cleanRing, assembleRings, obb, simplify, hashStr, parseWkt } from './lib/geo.mjs';
import { parseColour, materialColour, roofMaterialColour, paintFromAerial } from './lib/colour.mjs';
import { Grid, fillRings, stampSegment, components, signedDistance, edt, bilinear } from './lib/raster.mjs';
import { terrainSampler } from './lib/terrain.mjs';
import { partitionEntities, tileSpecs, terrainPack, packToBin, TILE_CELL, TILE_MARGIN } from './lib/tiles.mjs';

// A length tag in metres ("120", "394 ft", "12'6\"") — mirror of realTile.ts parseLen.
const parseLen = (v) => {
  if (v == null) return null;
  const t = String(v).trim().toLowerCase().replace(',', '.');
  const ft = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"|''))?$/.exec(t);
  if (ft) return parseFloat(ft[1]) * 0.3048 + (ft[2] ? parseFloat(ft[2]) * 0.0254 : 0);
  const f = parseFloat(t);
  return isFinite(f) ? f : null;
};

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
mkdirSync(OUT, { recursive: true });
mkdirSync(resolve(RAW, 'debug'), { recursive: true });

const osm = JSON.parse(readFileSync(resolve(RAW, 'osm.json'), 'utf8'));
const overture = JSON.parse(readFileSync(resolve(RAW, 'overture-buildings.json'), 'utf8'));
const wc = existsSync(resolve(RAW, 'worldcover.json')) ? JSON.parse(readFileSync(resolve(RAW, 'worldcover.json'), 'utf8')) : null;
const wcData = wc ? Buffer.from(wc.data, 'base64') : null;
const z15 = terrainSampler(15);
const z13 = terrainSampler(13);

const S = bboxToLocal(SLICE);
const B = bboxToLocal(BACKDROP);
// Detail box: features inside it bake at full fidelity (no lod simplification, minor roads kept,
// addresses resolved). It used to be the slice, which left the whole backdrop ring as a
// permanent low-detail zone once streaming made it walkable. The slice now only sets the fine
// (2 m) terrain lattice; streaming distance decides what renders at full detail.
const D = CFG.detail === 'slice' ? S : B;
const inBox = (b, x, z, m = 0) => x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m;
const K = (Math.PI / 180) * 6378137;
const COS0 = Math.cos((ORIGIN.lat * Math.PI) / 180);
const unproject = (x, z) => [ORIGIN.lat - z / K, ORIGIN.lon + x / (K * COS0)];

// ---------- OSM element helpers ----------
const els = osm.elements;
const wayPts = (e) => (e.geometry ?? []).filter(Boolean).map((p) => project(p.lat, p.lon));
const isClosed = (e) => e.geometry && e.geometry.length > 3 && e.geometry[0].lat === e.geometry.at(-1).lat && e.geometry[0].lon === e.geometry.at(-1).lon;
// Area rings for a way or multipolygon relation: { outer: [...], inner: [...] }
function areaRings(e) {
  if (e.type === 'way') return isClosed(e) ? { outer: [wayPts(e)], inner: [] } : null;
  if (e.type === 'relation' && e.members) {
    const part = (role) => e.members.filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map((m) => m.geometry.filter(Boolean).map((p) => project(p.lat, p.lon)));
    const outer = assembleRings(part('outer'));
    return outer.length ? { outer, inner: assembleRings(part('inner')) } : null;
  }
  return null;
}
const q = (v) => Math.round(v * 10); // 0.1 m quantization
const flat = (pts) => pts.flatMap(([x, z]) => [q(x), q(z)]);

// ---------- 1. Land / water mask ----------
const coastSegs = [];
for (const e of els) {
  if (e.type !== 'way' || e.tags?.natural !== 'coastline') continue;
  const p = wayPts(e);
  for (let i = 0; i + 1 < p.length; i++) coastSegs.push([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]);
}
const waterAreas = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (!(t.natural === 'water' || t.waterway === 'riverbank' || t.water === 'river')) continue;
  const r = areaRings(e);
  if (r) waterAreas.push(r);
}
log(`coast segments ${coastSegs.length}, water areas ${waterAreas.length}`);

function landMask(g) {
  const n = g.w * g.h;
  const BAR = 2;
  const cellType = new Uint8Array(n); // 0 free, 2 barrier
  for (const s of coastSegs) stampSegment(g, cellType, s[0], s[1], s[2], s[3], BAR);
  const { lab, count } = components(g, (i) => cellType[i] !== BAR);
  const vote = new Float64Array(count);
  const off = g.cell * 1.6;
  for (const s of coastSegs) {
    const dx = s[2] - s[0], dz = s[3] - s[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    // OSM coastline: land on the LEFT of the way direction. Left of (dx,dz) in x-east/z-south frame is (dz,-dx).
    const lx = dz / len, lz = -dx / len;
    const steps = Math.max(1, Math.ceil(len / g.cell));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const mx = s[0] + dx * t, mz = s[1] + dz * t;
      for (const [sx, w] of [[1, 1], [-1, -1]]) {
        const i = g.gi(mx + lx * off * sx), j = g.gj(mz + lz * off * sx);
        if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
        const c = lab[j * g.w + i];
        if (c >= 0) vote[c] += w;
      }
    }
  }
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lab[i] >= 0) land[i] = vote[lab[i]] >= 0 ? 1 : 0;
  // Resolve barrier cells from neighbours.
  for (let pass = 0; pass < 3; pass++)
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++) {
        const c = j * g.w + i;
        if (cellType[c] !== BAR) continue;
        let l = 0, w = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue;
            const cc = jj * g.w + ii;
            if (cellType[cc] === BAR) continue;
            land[cc] ? l++ : w++;
          }
        if (l + w) (land[c] = l >= w ? 1 : 0), (cellType[c] = 0);
      }
  for (const wa of waterAreas) fillRings(g, land, [...wa.outer, ...wa.inner], 0);
  return land;
}
const waterSegs = [...coastSegs];
for (const wa of waterAreas) for (const r of [...wa.outer, ...wa.inner]) for (let i = 0; i + 1 < r.length; i++) waterSegs.push([r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]]);

function oceanFlood(g, land) {
  // Water connected to the region's oceanEdge = open sea. (For Sea Bright: the Shrewsbury River only
  // reaches the sea far north of the backdrop, so east-edge water is unambiguously the Atlantic.)
  const { lab } = components(g, (i) => !land[i]);
  const seeds = new Set();
  const edge = CFG.oceanEdge ?? 'e';
  const seed = (i, j) => { const c = lab[j * g.w + i]; if (c >= 0) seeds.add(c); };
  if (edge === 'e' || edge === 'w') { const i = edge === 'e' ? g.w - 1 : 0; for (let j = 0; j < g.h; j++) seed(i, j); }
  else { const j = edge === 's' ? g.h - 1 : 0; for (let i = 0; i < g.w; i++) seed(i, j); }
  const ocean = new Uint8Array(g.w * g.h);
  for (let i = 0; i < ocean.length; i++) ocean[i] = lab[i] >= 0 && seeds.has(lab[i]) ? 1 : 0;
  return ocean;
}

function wcAt(x, z) {
  if (!wc) return 0;
  const [lat, lon] = unproject(x, z);
  const i = Math.floor(((lon - wc.bbox.w) / (wc.bbox.e - wc.bbox.w)) * wc.w);
  const j = Math.floor(((wc.bbox.n - lat) / (wc.bbox.n - wc.bbox.s)) * wc.h);
  if (i < 0 || j < 0 || i >= wc.w || j >= wc.h) return 0;
  return wcData[j * wc.w + i];
}

function bakeLayer(name, g, sampler, detail) {
  log(`${name}: grid ${g.w}x${g.h} @ ${g.cell} m`);
  const land = landMask(g);
  const ocean = oceanFlood(g, land);
  const sdf = signedDistance(g, land, waterSegs, detail ? 16 : 40);
  const dOcean = edt(g, (i) => ocean[i] === 1);
  const n = g.w * g.h;
  const height = new Int16Array(n), sdfQ = new Int16Array(n), cover = new Uint8Array(n), flags = new Uint8Array(n), oceanD = new Uint8Array(n);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const c = j * g.w + i;
      const x = g.cx(i), z = g.cz(j);
      const [lat, lon] = unproject(x, z);
      let h = sampler(lat, lon);
      if (!isFinite(h)) h = 1;
      const d = sdf[c];
      if (d > 0) {
        // Land: keep real elevation, but meet the waterline smoothly and never sink below it.
        h = Math.max(h, 0.35);
        h = Math.min(h, 0.12 + d * (ocean[c] || dOcean[c] < 200 ? 0.09 : 0.35));
      } else {
        // Water: shelve down from the shore. Ocean deeper than river.
        const deep = ocean[c] ? -6 : -2.6;
        h = Math.max(deep, Math.min(-0.25, d * (ocean[c] ? 0.05 : 0.12)));
      }
      height[c] = Math.round(h * 100);
      sdfQ[c] = Math.max(-32767, Math.min(32767, Math.round(d * 10)));
      cover[c] = wcAt(x, z);
      flags[c] = (land[c] ? 0 : 1) | (ocean[c] ? 2 : 0);
      oceanD[c] = Math.min(255, Math.round(dOcean[c] / 2));
    }
  // Debug picture of the mask.
  const png = new PNG({ width: g.w, height: g.h });
  for (let c = 0; c < n; c++) {
    const w = flags[c] & 1, o = flags[c] & 2;
    const hh = Math.max(0, Math.min(255, height[c] / 100 * 20 + 40));
    png.data.set(w ? (o ? [30, 60, 140, 255] : [60, 120, 170, 255]) : [hh, hh + 30, hh * 0.6, 255], c * 4);
  }
  writeFileSync(resolve(RAW, 'debug', `${name}-mask.png`), PNG.sync.write(png));
  return { grid: g.header(), height, sdf: sdfQ, cover, flags, oceanD };
}

const sliceLayer = bakeLayer('slice', new Grid(S.x0, S.z0, S.x1, S.z1, 2), z15, true);
const backLayer = bakeLayer('backdrop', new Grid(B.x0, B.z0, B.x1, B.z1, 10), z13, false);

// ---------- 2. Buildings (Overture footprints, enriched with OSM tags + named POIs) ----------
const osmBuildings = [];
const pois = [];
const POI_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'club', 'historic', 'man_made', 'office', 'craft'];
for (const e of els) {
  const t = e.tags ?? {};
  if (t.building) {
    const r = areaRings(e);
    if (r) osmBuildings.push({ ring: r.outer[0], tags: t });
  }
  if (t.name && POI_KEYS.some((k) => t[k])) {
    let x, z;
    if (e.type === 'node') [x, z] = project(e.lat, e.lon);
    else if (e.geometry?.length) [x, z] = centroid(wayPts(e));
    else if (e.bounds) [x, z] = project((e.bounds.minlat + e.bounds.maxlat) / 2, (e.bounds.minlon + e.bounds.maxlon) / 2);
    else continue;
    if (!inBox(B, x, z)) continue;
    const kind = t.amenity ?? t.shop ?? t.tourism ?? t.leisure ?? (t.club ? 'club' : null) ?? t.historic ?? t.man_made ?? 'place';
    pois.push({ name: t.name, kind, x: +x.toFixed(1), z: +z.toFixed(1), slice: inBox(S, x, z) });
  }
}

// Real roof colours observed from aerial imagery (scripts/fetch-imagery.mjs), keyed by Overture id.
const roofObs = existsSync(resolve(RAW, 'roofs.json')) ? JSON.parse(readFileSync(resolve(RAW, 'roofs.json'), 'utf8')).colors : {};
// Address points (entrances / address nodes) to label footprints that carry no address themselves.
const addrPts = [];
for (const e of els) {
  const t = e.tags;
  if (e.type !== 'node' || !t?.['addr:housenumber'] || !t['addr:street'] || t.building) continue;
  const [x, z] = project(e.lat, e.lon);
  addrPts.push({ x, z, a: `${t['addr:housenumber']} ${t['addr:street']}` });
}
const ROOF_TAG = { gabled: 'gable', gable: 'gable', hipped: 'hip', hip: 'hip', 'half-hipped': 'hip', side_hipped: 'hip', pyramidal: 'hip', flat: 'flat', skillion: 'skillion', lean_to: 'skillion', gambrel: 'gable', mansard: 'hip', saltbox: 'gable', dome: 'hip', round: 'hip', onion: 'hip', cone: 'hip', butterfly: 'flat', sawtooth: 'flat' };
const CLS_COMMERCIAL = new Set(['commercial', 'retail', 'office', 'hotel', 'civic', 'public', 'school', 'fire_station', 'government', 'hospital', 'supermarket', 'restaurant', 'kiosk', 'industrial', 'warehouse', 'college', 'university', 'train_station', 'transportation', 'clinic']);
const CLS_CHURCH = new Set(['church', 'chapel', 'cathedral', 'temple', 'mosque', 'synagogue', 'religious', 'shrine']);
const CLS_SHED = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'cabin', 'boathouse', 'outbuilding', 'roof']);
const colourStats = { facadeTag: 0, roofTag: 0, roofAerial: 0, address: 0 };

const buildings = [];
let skipped = 0;
for (const row of overture.rows) {
  const polys = parseWkt(row.wkt);
  for (const poly of polys) {
    let ring = cleanRing(poly[0].map(([lon, lat]) => project(lat, lon)));
    if (ring.length < 3) { skipped++; continue; }
    const area = Math.abs(ringArea(ring));
    if (area < 6) { skipped++; continue; }
    if (ringArea(ring) < 0) ring.reverse(); // ringArea>0 == CCW in x-east/z-south screen sense; normalize one winding
    const [cx, cz] = centroid(ring);
    if (!inBox(B, cx, cz)) continue;
    const inS = inBox(D, cx, cz, 60);
    if (!inS) ring = cleanRing(simplify([...ring, ring[0]], 0.8).slice(0, -1), 0.5);
    if (ring.length < 3) continue;
    const o = obb(ring);
    const osmHit = osmBuildings.find((b) => Math.abs(b.ring[0][0] - cx) < 80 && pointInRing(cx, cz, b.ring));
    const tags = osmHit?.tags ?? {};
    const named = pois.filter((p) => Math.abs(p.x - cx) < 60 && Math.abs(p.z - cz) < 60 && pointInRing(p.x, p.z, ring));
    // Kind: OSM tags first, then Overture's class/subtype, then size.
    const cls = row.class ?? '', sub = row.subtype ?? '';
    let kind = 'house';
    if (tags.man_made === 'lighthouse') kind = 'lighthouse';
    else if (['church', 'chapel', 'cathedral'].includes(tags.building) || tags.amenity === 'place_of_worship' || named.some((p) => p.kind === 'place_of_worship') || CLS_CHURCH.has(cls) || sub === 'religious') kind = 'church';
    else if (named.length || CLS_COMMERCIAL.has(tags.building) || CLS_COMMERCIAL.has(cls) || ['commercial', 'civic', 'education', 'medical', 'entertainment', 'industrial', 'transportation'].includes(sub)) kind = 'commercial';
    else if (tags.building === 'apartments' || cls === 'apartments' || area > 700) kind = 'large';
    else if (area < 32 || CLS_SHED.has(tags.building) || CLS_SHED.has(cls) || sub === 'outbuilding') kind = 'shed';
    const seed = hashStr(row.id);
    const floors = row.num_floors ?? (tags['building:levels'] ? parseFloat(tags['building:levels']) : null);
    // plausible height — mirror of realTile.ts plausibleHeight (real towers keep their height)
    let h = row.height ?? parseLen(tags.height);
    if (floors && floors > 0) {
      const est = floors * (floors > 10 ? 3.7 : 3.1) + 1.5;
      if (h == null || !isFinite(h) || h > est * 2 + 20 || h < floors * 1.8) h = est;
    } else if (h != null && isFinite(h) && h > 100 && area < 120) h = 40;
    if (h == null || !isFinite(h)) {
      const r = (seed % 1000) / 1000;
      h = kind === 'shed' ? 3 + r : kind === 'large' ? 8 + r * 5 : kind === 'commercial' ? 5.5 + r * 3 : 6.5 + r * 3;
    }
    if (kind === 'lighthouse') h = tags.name === 'North Tower' ? 22 : 21;
    if ((kind === 'house' || kind === 'shed') && (h >= 15 || (floors ?? 0) >= 4)) kind = 'large';
    h = Math.max(kind === 'shed' ? 2.6 : 3.2, Math.min(830, h));
    // Roof: mapped shape wins; otherwise a style prior by kind + size. Any footprint shape can take a
    // pitched roof — the runtime builds it on the true outline with a straight skeleton.
    const tagRoof = ROOF_TAG[String(tags['roof:shape'] ?? row.roof_shape ?? '').toLowerCase()];
    const r4 = (seed >>> 8) % 100;
    let roof = 'flat';
    if (kind === 'lighthouse') roof = 'tower';
    else if (tagRoof) roof = tagRoof;
    else if (kind === 'church') roof = 'gable';
    // ~97% of detached houses are pitched; wide ones hip rather than going flat
    else if (kind === 'house') roof = ring.length > 60 ? 'flat' : o.wid > 18 ? (r4 < 85 ? 'hip' : 'flat') : r4 < 55 ? 'gable' : r4 < 97 ? 'hip' : 'flat';
    else if (kind === 'shed') roof = r4 < 50 ? 'gable' : r4 < 75 ? 'skillion' : r4 < 85 ? 'hip' : 'flat';
    else if (kind === 'commercial') roof = o.wid < 13 && area < 400 && r4 < 45 ? (r4 < 30 ? 'gable' : 'hip') : 'flat';
    else if (kind === 'large') roof = o.wid < 16 && r4 < 25 && h < 20 ? 'hip' : 'flat';
    const b = { r: flat(ring), h: +h.toFixed(1), k: kind, roof, s: seed };
    // Real colours: explicit tags / Overture attributes, then materials, then the aerial photo (roofs).
    const fc = parseColour(tags['building:colour']) ?? parseColour(row.facade_color) ?? materialColour(tags['building:material'] ?? row.facade_material);
    if (fc != null) (b.fc = fc), colourStats.facadeTag++;
    let rc = parseColour(tags['roof:colour']) ?? parseColour(row.roof_color) ?? roofMaterialColour(tags['roof:material']);
    if (rc != null) colourStats.roofTag++;
    else if (roofObs[row.id]) {
      const v = parseInt(roofObs[row.id], 16);
      rc = paintFromAerial((v >> 16) & 255, (v >> 8) & 255, v & 255);
      colourStats.roofAerial++;
    }
    if (rc != null) b.rc = rc;
    if (floors && isFinite(floors)) b.fl = Math.round(floors);
    const minH = tags.min_height ? parseFloat(tags.min_height) : tags['building:min_level'] ? parseFloat(tags['building:min_level']) * 3 : null;
    if (minH && isFinite(minH)) b.mh = +minH.toFixed(1);
    if (!inS) b.lod = 1;
    const nm = tags.name ?? named[0]?.name;
    if (nm) b.n = nm;
    // what it's used for, in OSM's own language-neutral values (uses.ts): the building's tags, else a POI inside
    const use = tags.amenity ?? tags.shop ?? tags.office ?? tags.craft ?? named.find((p) => p.kind !== 'place')?.kind;
    if (use && use !== 'yes' && use !== 'place_of_worship') b.u = use;
    if (inS) {
      let ad = tags['addr:housenumber'] && tags['addr:street'] ? `${tags['addr:housenumber']} ${tags['addr:street']}` : null;
      if (!ad) ad = addrPts.find((p) => Math.abs(p.x - cx) < 40 && Math.abs(p.z - cz) < 40 && pointInRing(p.x, p.z, ring))?.a ?? null;
      if (ad) (b.ad = ad), colourStats.address++;
    }
    buildings.push(b);
  }
}
log(`buildings ${buildings.length} (skipped ${skipped}); kinds`, buildings.reduce((a, b) => ((a[b.k] = (a[b.k] ?? 0) + 1), a), {}), 'roofs', buildings.reduce((a, b) => ((a[b.roof] = (a[b.roof] ?? 0) + 1), a), {}));
log('real attributes', colourStats);

// ---------- 3. Roads, bridges, areas, lines, points ----------
const ROAD_W = { motorway: 14, trunk: 12, primary: 11, primary_link: 6, secondary: 9, secondary_link: 6, tertiary: 8, tertiary_link: 5, residential: 6.5, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, track: 3, footway: 1.8, path: 1.5, cycleway: 2, steps: 2, bridleway: 2, construction: 5 };
const roads = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (e.type !== 'way' || !t.highway || !(t.highway in ROAD_W)) continue;
  let pts = wayPts(e);
  if (pts.length < 2) continue;
  const inS = pts.some(([x, z]) => inBox(D, x, z, 80));
  const minor = ['footway', 'path', 'cycleway', 'steps', 'bridleway', 'track'].includes(t.highway);
  if (!inS && minor) continue;
  if (!pts.some(([x, z]) => inBox(B, x, z))) continue;
  if (!inS) pts = simplify(pts, 1.5);
  let w = parseFloat(t.width) || ROAD_W[t.highway];
  if (t.highway === 'primary' && t.lanes) w = Math.max(w, parseInt(t.lanes) * 3.4 + 1.5);
  if (t.footway === 'sidewalk') w = 1.6;
  const r = { p: flat(pts), c: t.highway, w: +w.toFixed(1) };
  if (t.name) r.n = t.name;
  if (t.ref) r.ref = t.ref;
  if (t.bridge && t.bridge !== 'no') r.br = t['bridge:movable'] || t.bridge === 'movable' ? 'movable' : 'yes';
  if (r.br && t['bridge:structure']) r.bs = String(t['bridge:structure']).toLowerCase().slice(0, 24);
  if (r.br === 'movable' && t['bridge:movable']) r.bm = String(t['bridge:movable']).toLowerCase().slice(0, 16);
  if (t.layer) r.l = parseInt(t.layer) || 0;
  if (t.oneway === 'yes') r.ow = 1;
  if (t.footway === 'sidewalk') r.sw = 1;
  if (t.service) r.sv = t.service;
  if (!inS) r.lod = 1;
  roads.push(r);
}
log(`roads ${roads.length}`);

const AREA_CLASS = (t) => {
  if (t.amenity === 'parking' || t.parking === 'surface') return 'parking';
  if (t.leisure === 'swimming_pool') return 'pool';
  if (t.man_made === 'pier') return 'pier';
  if (t.natural === 'beach' || t.natural === 'sand' || t.leisure === 'beach_resort') return 'beach';
  if (t.natural === 'wetland') return 'wetland';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'scrub';
  if (t.leisure === 'pitch' || t.leisure === 'playground') return 'pitch';
  if (t.leisure === 'golf_course') return 'golf';
  if (t.leisure === 'park' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.landuse === 'village_green' || t.landuse === 'meadow' || t.natural === 'grassland' || t.landuse === 'cemetery') return 'grass';
  if (t.leisure === 'marina') return 'marina';
  if (t.landuse === 'commercial' || t.landuse === 'retail') return 'commercial';
  if (t.area === 'yes' && t.highway === 'pedestrian') return 'plaza';
  if (t.landuse === 'brownfield' || t.landuse === 'construction') return 'bare';
  return null;
};
const areas = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (t.building) continue;
  const cls = AREA_CLASS(t);
  if (!cls) continue;
  const r = areaRings(e);
  if (!r) continue;
  const all = [...r.outer, ...r.inner];
  if (!all.some((ring) => ring.some(([x, z]) => inBox(B, x, z)))) continue;
  const inS = all.some((ring) => ring.some(([x, z]) => inBox(D, x, z, 100)));
  const tol = inS ? 0.25 : 2;
  const a = { c: cls, o: r.outer.map((ring) => flat(simplify(ring, tol))), i: r.inner.map((ring) => flat(simplify(ring, tol))) };
  if (t.name) a.n = t.name;
  if (!inS) a.lod = 1;
  areas.push(a);
}
log(`areas ${areas.length}`, areas.reduce((a, b) => ((a[b.c] = (a[b.c] ?? 0) + 1), a), {}));

const lines = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (e.type !== 'way') continue;
  let c = null;
  if (t.wall === 'seawall' || /seawall/i.test(t.name ?? '')) c = 'seawall';
  else if (t.man_made === 'groyne' || t.man_made === 'breakwater') c = 'groyne';
  else if (t.man_made === 'pier' && !isClosed(e)) c = 'pier';
  else if (t.barrier === 'fence') c = 'fence';
  else if (t.barrier === 'wall' || t.barrier === 'retaining_wall') c = 'wall';
  else if (t.power === 'line') c = 'power'; // transmission (minor lines = the procedural street poles) — as realTile.ts
  else if (t.railway === 'rail') c = 'rail';
  if (!c) continue;
  const pts = wayPts(e);
  if (!pts.some(([x, z]) => inBox(B, x, z))) continue;
  const l = { c, p: flat(pts) };
  if (t.width) l.w = parseFloat(t.width);
  if (t.bridge) l.br = 1;
  lines.push(l);
}
log(`lines ${lines.length}`, lines.reduce((a, b) => ((a[b.c] = (a[b.c] ?? 0) + 1), a), {}));

const points = [];
for (const e of els) {
  if (e.type !== 'node') continue;
  const t = e.tags ?? {};
  let c = null;
  if (t.natural === 'tree') c = 'tree';
  else if (t.power === 'pole') c = 'pole';
  else if (t.highway === 'street_lamp') c = 'lamp';
  else if (t.amenity === 'bench') c = 'bench';
  else if (t.highway === 'traffic_signals') c = 'signal';
  else if (t.emergency === 'fire_hydrant') c = 'hydrant';
  else if (t.railway === 'subway_entrance') c = 'subway';
  else if (t.man_made === 'lighthouse') c = 'lighthouse';
  else if (t.man_made === 'flagpole') c = 'flagpole';
  else if (t.entrance || t.door) c = 'entrance';
  if (!c) continue;
  const [x, z] = project(e.lat, e.lon);
  if (!inBox(B, x, z)) continue;
  points.push({ c, x: +x.toFixed(1), z: +z.toFixed(1) });
}
log(`points ${points.length}`, points.reduce((a, b) => ((a[b.c] = (a[b.c] ?? 0) + 1), a), {}));

// Landmarks beyond the backdrop that belong on the skyline (from the region config).
const landmarks = (CFG.landmarks ?? []).map((l) => {
  const [x, z] = project(l.lat, l.lon);
  return { id: l.id, name: l.name, x: +x.toFixed(1), z: +z.toFixed(1), h: l.h, ground: l.ground };
});

// ---------- 4. Write ----------
const layers = { slice: sliceLayer, backdrop: backLayer };
const chunks = [];
let offset = 0;
const layout = {};
for (const [name, L] of Object.entries(layers)) {
  layout[name] = { grid: L.grid };
  for (const key of ['height', 'sdf', 'cover', 'flags', 'oceanD']) {
    const arr = L[key];
    const pad = (arr.BYTES_PER_ELEMENT - (offset % arr.BYTES_PER_ELEMENT)) % arr.BYTES_PER_ELEMENT;
    if (pad) chunks.push(Buffer.alloc(pad)), (offset += pad);
    layout[name][key] = { offset, length: arr.length, type: arr.constructor.name };
    chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    offset += arr.byteLength;
  }
}
writeFileSync(resolve(OUT, 'terrain.bin'), Buffer.concat(chunks));
const world = {
  version: 1,
  meta: {
    id: REGION,
    name: CFG.name,
    title: CFG.title,
    sub: CFG.sub,
    tz: CFG.tz,
    spawn: CFG.spawn ?? null,
    roads: CFG.roads ?? {},
    shoreLabel: CFG.shoreLabel ?? 'the beach',
  },
  origin: ORIGIN,
  slice: S,
  backdrop: B,
  sources: { osm: osm.osm3s?.timestamp_osm_base, overture: overture.release, worldcover: wc ? 'v200/2021' : null, terrain: 'terrarium z13/z15', roofColours: Object.keys(roofObs).length ? 'USDA NAIP aerial imagery' : null },
  terrain: layout,
  buildings,
  roads,
  areas,
  lines,
  points,
  pois,
  landmarks,
};
writeFileSync(resolve(OUT, 'world.json'), JSON.stringify(world));
log(`wrote world.json ${(JSON.stringify(world).length / 1e6).toFixed(2)} MB, terrain.bin ${(offset / 1e6).toFixed(2)} MB`);

// Manifest of baked regions — the client's region picker reads this.
mkdirSync(DATA, { recursive: true });
const mfPath = resolve(DATA, 'regions.json');
let manifest = [];
try { manifest = JSON.parse(readFileSync(mfPath, 'utf8')); } catch { /* first bake */ }
// `hidden` regions are merge sources (e.g. the towns inside `shore`) — baked data for them is
// never listed, so the game offers exactly one consistent world.
manifest = manifest.filter((r) => r.id !== REGION && !REGIONS[r.id]?.hidden);
if (!CFG.hidden) manifest.push({ id: REGION, name: CFG.name, title: CFG.title, sub: CFG.sub, origin: ORIGIN });
manifest.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(mfPath, JSON.stringify(manifest, null, 2));
log(`regions.json -> [${manifest.map((r) => r.id).join(', ')}]`);

// ---------- 5. Tiles + atlas manifest ----------
// The same content as world.json, cut into a grid of cells the client can stream around the walker.
// Margin-context entities carry `own: 0` so the renderer never double-draws them at seams.
mkdirSync(resolve(OUT, 'tiles'), { recursive: true });
const specs = tileSpecs(B, S);
const parts = partitionEntities({ buildings, roads, areas, lines, points }, specs, TILE_MARGIN);
// Landmarks are emitted exactly once, by the tile nearest each — otherwise every mounted tile
// would stack a copy of the same tower mesh.
const lmTile = landmarks.map((l) => {
  let best = '', bd = Infinity;
  for (const { spec } of parts) {
    const dx = Math.max(spec.box.x0 - l.x, 0, l.x - spec.box.x1), dz = Math.max(spec.box.z0 - l.z, 0, l.z - spec.box.z1);
    const d = dx * dx + dz * dz;
    if (d < bd) (bd = d), (best = spec.id);
  }
  return best;
});
const tiles = [];
let tBytes = 0;
let bakeHash = 0x811c9dc5; // FNV-1a over every tile payload → atlas.bakeId (client cache key)
const hashIn = (s) => { for (let i = 0; i < s.length; i++) bakeHash = Math.imul(bakeHash ^ s.charCodeAt(i), 0x01000193); };
let packCount = 0;
for (const { spec, tile } of parts) {
  const file = `tiles/${spec.id}.json`;
  const out = JSON.stringify({ ...tile, origin: ORIGIN, slice: S, backdrop: B, detail: D, landmarks: landmarks.filter((_, i) => lmTile[i] === spec.id) });
  writeFileSync(resolve(OUT, file), out);
  hashIn(out);
  tBytes += out.length;
  const entry = { id: spec.id, box: spec.box, lod: spec.lod, file };
  // Detail tiles carry their own slice-resolution terrain pack (a subgrid of the slice layer, no
  // margin — the shared lattice keeps seams exact). Backdrop tiles sample the region backdrop layer.
  if (spec.lod === 0) {
    const pack = terrainPack(sliceLayer, spec.box);
    if (pack) {
      const { layout, buf } = packToBin(pack);
      const tfile = `tiles/${spec.id}.terrain.bin`;
      writeFileSync(resolve(OUT, tfile), buf);
      entry.terrain = { file: tfile, layout };
      tBytes += buf.length;
      packCount++;
    }
  }
  tiles.push(entry);
}
// The manifest doubles as the slim region record the journal/HUD/spawn logic needs:
// everything except the bulky entity arrays (named roads are kept — labels, spawn anchors, HUD).
const namedRoads = roads.filter((r) => r.n);
const atlas = {
  version: 1,
  id: REGION,
  meta: world.meta,
  origin: ORIGIN,
  slice: S,
  backdrop: B,
  sources: world.sources,
  bakeId: (bakeHash >>> 0).toString(36),
  cell: TILE_CELL,
  margin: TILE_MARGIN,
  terrain: layout,
  roads: namedRoads,
  pois,
  landmarks,
  tiles,
};
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(atlas));
// Slim entity dump for the ground painter: full geometry, only the fields the Painter reads.
const paintJson = {
  version: 1, slice: S, backdrop: B,
  areas: areas.map((a) => ({ c: a.c, o: a.o, i: a.i, lod: a.lod })),
  roads: roads.map((r) => ({ p: r.p, c: r.c, w: r.w, br: r.br, lod: r.lod, sw: r.sw })),
  buildings: buildings.map((b) => ({ r: b.r, k: b.k, lod: b.lod })),
};
writeFileSync(resolve(OUT, 'paint.json'), JSON.stringify(paintJson));
log(`wrote ${tiles.length} tiles (${(tBytes / 1e6).toFixed(2)} MB, ${packCount} terrain packs) + manifest.json (${namedRoads.length} named roads) + paint.json`);
