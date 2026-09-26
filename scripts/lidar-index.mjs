// USGS 3DEP LiDAR project index for the in-browser measurement pipeline (src/world/lidar.ts).
//
// Source: hobuinc/usgs-lidar `boundaries/resources.geojson` — one MultiPolygon per 3DEP
// project, each an Entwine Point Tile (EPT) dataset in the public `usgs-lidar-public` S3
// bucket (CORS-open, EPSG:3857, LAZ). The raw file is 7.6 MB; this compacts it to what the
// tile worker needs to pick candidate projects for a cell: name, survey year, bbox and a
// simplified coverage outline (≈100 m quantisation — the worker verifies real coverage from
// each project's EPT hierarchy counts, so the outline only has to be roughly right).
//
//   node scripts/lidar-index.mjs            → src/world/lidar-index.json (bundled into the tile worker)
//
// Also importable (the browser can run buildLidarIndex on a fetched geojson).
export const RESOURCES = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson';
export const EPT_BASE = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/';
const Q = 1000; // 0.001° integer grid

// Survey year from the project name: "..._2017", "..._2014_LAS_2015" (first year wins — the
// flight, not the delivery), or the newer "_B23"/"_D24" fiscal suffixes.
export function surveyYear(name) {
  const m = name.match(/(?:^|[_-])((?:19|20)\d\d)(?=$|[_-])/);
  if (m) return +m[1];
  const f = name.match(/_[A-Z](\d\d)$/);
  return f ? 2000 + +f[1] : 0;
}

function dp(pts, tol) {
  // Douglas–Peucker on an open polyline of [x,y] ints
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > md) (md = d), (mi = i);
    }
    if (md > tol) (keep[mi] = 1), st.push([a, mi], [mi, b]);
  }
  return pts.filter((_, i) => keep[i]);
}

export function buildLidarIndex(geo, tol = 2) {
  const p = [];
  for (const f of geo.features) {
    const name = f.properties.name;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    const rings = [];
    for (const poly of polys) {
      const ring = poly[0]; // outer rings only — holes are rare and the hierarchy check covers them
      let q = ring.map(([x, y]) => [Math.round(x * Q), Math.round(y * Q)]);
      q = q.filter((v, i) => i === 0 || v[0] !== q[i - 1][0] || v[1] !== q[i - 1][1]);
      q = dp(q, tol);
      if (q.length < 4) {
        // tiny island: keep its bbox as a quad
        const xs = ring.map((v) => v[0]), ys = ring.map((v) => v[1]);
        const x0 = Math.floor(Math.min(...xs) * Q), x1 = Math.ceil(Math.max(...xs) * Q), y0 = Math.floor(Math.min(...ys) * Q), y1 = Math.ceil(Math.max(...ys) * Q);
        q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      }
      for (const [x, y] of q) (w = Math.min(w, x)), (e = Math.max(e, x)), (s = Math.min(s, y)), (n = Math.max(n, y));
      const flat = [q[0][0], q[0][1]];
      for (let i = 1; i < q.length; i++) flat.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      rings.push(flat);
    }
    p.push({ n: name, y: surveyYear(name), b: [w, s, e, n], r: rings });
  }
  return { v: 1, q: Q, src: RESOURCES, ept: EPT_BASE, made: new Date().toISOString().slice(0, 10), p };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { writeFileSync } = await import('node:fs');
  const { ROOT } = await import('./config.mjs');
  const geo = await (await fetch(RESOURCES)).json();
  const idx = buildLidarIndex(geo);
  const out = `${ROOT}/src/world/lidar-index.json`;
  writeFileSync(out, JSON.stringify(idx));
  console.log(`${idx.p.length} projects → ${out}`);
}
