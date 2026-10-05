// Roofs for any footprint shape. A straight skeleton (wavefront propagation: every edge walks inward at unit
// speed; edge-collapse and split events are recomputed from scratch after each one — O(n³), fine for house
// outlines) gives each wall edge its own planar roof face, so L/T/U-shaped houses get real hips and valleys.
// Gables: an end face that is a triangle whose apex joins exactly its two neighbours is folded up into a
// vertical gable wall, with the apex slid along the ridge to the wall line (a cross-gabled house).
export type V2 = [number, number];

export interface SkelNode { x: number; z: number; t: number }
export interface Skeleton { nodes: SkelNode[]; faces: number[][]; maxT: number }

interface WV { x: number; z: number; el: number; er: number; node: number; vx: number; vz: number }

export const ringArea = (r: V2[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

// Drop near-duplicate and near-collinear vertices; returns a ring with positive (math-CCW) area.
export function tidyRing(ring: V2[], minEdge = 0.35, minTurn = 0.06): V2[] {
  let r = ring.slice();
  if (ringArea(r) < 0) r.reverse();
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const cross = ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) / Math.max(1e-9, l1 * l2);
      if (l1 < minEdge || Math.abs(cross) < minTurn) {
        r.splice(i, 1);
        i--;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return r;
}

function edgeLines(ring: V2[]) {
  const n = ring.length;
  const nx = new Float64Array(n), nz = new Float64Array(n), c = new Float64Array(n), dx = new Float64Array(n), dz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    dx[i] = (q[0] - p[0]) / l; dz[i] = (q[1] - p[1]) / l;
    nx[i] = -dz[i]; nz[i] = dx[i]; // inward (left of travel for a CCW ring)
    c[i] = nx[i] * p[0] + nz[i] * p[1];
  }
  return { nx, nz, c, dx, dz };
}

// Velocity of the wavefront vertex between edges a and b (inward normals): n_a·v = n_b·v = 1.
function vel(E: ReturnType<typeof edgeLines>, a: number, b: number): [number, number] {
  const det = E.nx[a] * E.nz[b] - E.nz[a] * E.nx[b];
  if (Math.abs(det) < 1e-9) return [E.nx[a], E.nz[a]];
  return [(E.nz[b] - E.nz[a]) / det, (E.nx[a] - E.nx[b]) / det];
}

// Mitred outward offset by o metres (vertex count preserved). Null if it would fold over.
export function offsetRing(ring: V2[], o: number): V2[] | null {
  const E = edgeLines(ring), n = ring.length;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const [vx, vz] = vel(E, (i + n - 1) % n, i);
    if (Math.hypot(vx, vz) > 3.5) return null;
    out.push([ring[i][0] - vx * o, ring[i][1] - vz * o]);
  }
  for (let i = 0; i < n; i++) {
    const p = out[i], q = out[(i + 1) % n];
    if ((q[0] - p[0]) * E.dx[i] + (q[1] - p[1]) * E.dz[i] < 0.05) return null;
  }
  return out;
}

export function straightSkeleton(ring: V2[]): Skeleton | null {
  const n = ring.length;
  if (n < 3 || ringArea(ring) <= 0) return null;
  const E = edgeLines(ring);
  const nodes: SkelNode[] = ring.map(([x, z]) => ({ x, z, t: 0 }));
  const arcs: [number, number, number, number][] = []; // node a, node b, face, face
  const mk = (el: number, er: number, node: number, x: number, z: number): WV => {
    const [vx, vz] = vel(E, el, er);
    return { x, z, el, er, node, vx, vz };
  };
  let polys: WV[][] = [ring.map(([x, z], i) => mk((i + n - 1) % n, i, i, x, z))];
  for (const v of polys[0]) if (E.nx[v.el] * E.nx[v.er] + E.nz[v.el] * E.nz[v.er] < -0.999) return null;
  let T = 0;
  const node = (x: number, z: number) => (nodes.push({ x, z, t: T }), nodes.length - 1);
  // A loop that has shrunk to nothing (two vertices, or a zero-area back-and-forth along a ridge) ends
  // here: its edges become ridge arcs.
  const finish = (P: WV[]) => {
    const ids = P.map((v) => {
      if (Math.hypot(v.x - nodes[v.node].x, v.z - nodes[v.node].z) < 1e-6 && nodes[v.node].t === T) return v.node;
      const id = node(v.x, v.z);
      arcs.push([v.node, id, v.el, v.er]);
      return id;
    });
    if (P.length === 2) { if (ids[0] !== ids[1]) arcs.push([ids[0], ids[1], P[0].er, P[0].el]); return; }
    for (let k = 0; k < P.length; k++) if (ids[k] !== ids[(k + 1) % P.length]) arcs.push([ids[k], ids[(k + 1) % P.length], P[k].er, P[k].er]);
  };
  const loopArea = (P: WV[]) => {
    let a = 0;
    for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; a += p.x * q.z - q.x * p.z; }
    return a / 2;
  };

  for (let iter = 0; iter < 8 * n + 40; iter++) {
    polys = polys.filter((P) => {
      if (P.length > 2 && Math.abs(loopArea(P)) > 1e-6) return true;
      finish(P);
      return false;
    });
    if (!polys.length) break;
    // earliest event across all wavefront loops
    let best = Infinity, bp = -1, bk = -1, br = -1;
    for (let pi = 0; pi < polys.length; pi++) {
      const P = polys[pi], m = P.length;
      for (let k = 0; k < m; k++) {
        const a = P[k], b = P[(k + 1) % m], e = a.er;
        const L0 = (b.x - a.x) * E.dx[e] + (b.z - a.z) * E.dz[e];
        const rate = (a.vx - b.vx) * E.dx[e] + (a.vz - b.vz) * E.dz[e];
        let t = Infinity;
        if (L0 <= 1e-9) t = 0;
        else if (rate > 1e-9) t = L0 / rate;
        if (t < best - 1e-12) (best = t), (bp = pi), (bk = k), (br = -1);
      }
      for (let ri = 0; ri < m; ri++) {
        const r = P[ri];
        const cr = E.dx[r.el] * E.dz[r.er] - E.dz[r.el] * E.dx[r.er];
        if (cr >= -1e-9) continue; // convex vertex: no split
        for (let k = 0; k < m; k++) {
          const a = P[k], b = P[(k + 1) % m];
          if (a === r || b === r) continue;
          const e = a.er;
          const dist = E.nx[e] * r.x + E.nz[e] * r.z - (E.c[e] + T);
          const close = 1 - (E.nx[e] * r.vx + E.nz[e] * r.vz);
          if (close <= 1e-9 || dist < -1e-7) continue;
          const t = Math.max(0, dist / close);
          if (t >= best) continue;
          const hx = r.x + r.vx * t, hz = r.z + r.vz * t;
          const ax = a.x + a.vx * t, az = a.z + a.vz * t, bx = b.x + b.vx * t, bz = b.z + b.vz * t;
          const s = (hx - ax) * E.dx[e] + (hz - az) * E.dz[e], len = (bx - ax) * E.dx[e] + (bz - az) * E.dz[e];
          if (len <= 1e-9 || s < -1e-7 || s > len + 1e-7) continue;
          (best = t), (bp = pi), (bk = k), (br = ri);
        }
      }
    }
    if (!isFinite(best)) return null;
    for (const P of polys) for (const v of P) (v.x += v.vx * best), (v.z += v.vz * best);
    T += best;
    const P = polys[bp], m = P.length;
    if (br < 0) {
      const a = P[bk], b = P[(bk + 1) % m];
      const id = node((a.x + b.x) / 2, (a.z + b.z) / 2);
      arcs.push([a.node, id, a.el, a.er], [b.node, id, b.el, b.er]);
      const w = mk(a.el, b.er, id, nodes[id].x, nodes[id].z);
      if (bk + 1 < m) P.splice(bk, 2, w);
      else (P.splice(bk, 1, w), P.splice(0, 1));
    } else {
      const r = P[br], a = P[bk], e = a.er;
      const id = node(r.x, r.z);
      arcs.push([r.node, id, r.el, r.er]);
      const w1 = mk(r.el, e, id, r.x, r.z), w2 = mk(e, r.er, id, r.x, r.z);
      const at = (i: number) => P[((i % m) + m) % m];
      const P1: WV[] = [w1], P2: WV[] = [w2];
      for (let i = bk + 1; at(i) !== r; i++) P1.push(at(i));
      for (let i = br + 1; ; i++) { const v = at(i); P2.push(v); if (v === a) break; }
      polys.splice(bp, 1, P1, P2);
    }
    if (iter === 8 * n + 39) return null;
  }

  // Merge coincident nodes, then walk each edge's face: along the edge, then up its skeleton arcs.
  const rep = nodes.map((_, i) => i);
  for (let i = n; i < nodes.length; i++)
    for (let j = 0; j < i; j++)
      if (rep[j] === j && Math.abs(nodes[i].x - nodes[j].x) < 1e-4 && Math.abs(nodes[i].z - nodes[j].z) < 1e-4) { rep[i] = j; break; }
  const faceArcs: Map<number, number[]>[] = Array.from({ length: n }, () => new Map());
  const link = (f: number, a: number, b: number) => {
    const M = faceArcs[f];
    if (!M.has(a)) M.set(a, []);
    if (!M.has(b)) M.set(b, []);
    if (!M.get(a)!.includes(b)) M.get(a)!.push(b);
    if (!M.get(b)!.includes(a)) M.get(b)!.push(a);
  };
  for (const [a0, b0, f, g] of arcs) {
    const a = rep[a0], b = rep[b0];
    if (a === b) continue;
    link(f, a, b);
    if (g !== f) link(g, a, b);
  }
  const faces: number[][] = [];
  let area = 0, maxT = 0;
  for (let i = 0; i < n; i++) {
    const start = i, first = (i + 1) % n;
    const face = [start, first];
    let prev = start, cur = first;
    for (let guard = 0; guard < 4 * n + 20; guard++) {
      const cand = faceArcs[i].get(cur)?.filter((x) => x !== prev) ?? [];
      if (!cand.length) return null;
      const din = [nodes[cur].x - nodes[prev].x, nodes[cur].z - nodes[prev].z];
      let nb = -1, ba = -Infinity;
      for (const c of cand) {
        const d = [nodes[c].x - nodes[cur].x, nodes[c].z - nodes[cur].z];
        const ang = Math.atan2(din[0] * d[1] - din[1] * d[0], din[0] * d[0] + din[1] * d[1]);
        if (ang > ba) (ba = ang), (nb = c);
      }
      if (nb === start) break;
      face.push(nb);
      prev = cur;
      cur = nb;
      if (face.length > 4 * n + 10) return null;
    }
    const fa = ringArea(face.map((k) => [nodes[k].x, nodes[k].z] as V2));
    if (!(fa > -1e-6)) return null;
    area += fa;
    for (const k of face) maxT = Math.max(maxT, nodes[k].t);
    faces.push(face);
  }
  const A = ringArea(ring);
  if (Math.abs(area - A) > A * 0.02 + 0.05) return null;
  return { nodes, faces, maxT };
}

// ---------------- roof geometry ----------------
export type RoofStyle = 'hip' | 'gable';
export interface RoofGeom {
  // roof surface triangles, heights relative to the eave (wall top) — y = eave + h
  tris: { p: [number, number, number][]; n: [number, number, number] }[];
  // vertical gable triangles standing on the original wall line
  gables: { a: V2; b: V2; apex: V2; h: number; edge: number }[];
  // eave fascia (offset outline edges that are not gables) and rake boards (sloped gable edges)
  fascia: [number, number, number, number, number][]; // ax az bx bz h
  rakes: [number, number, number, number, number, number][]; // x z h -> x z h
  rise: number;
  peak: [number, number, number];
  lowH: number; // height of the overhang edge (negative)
}

// Solve a·x = ca, b·x = cb for x (2D).
function meet(ax: number, az: number, ca: number, bx: number, bz: number, cb: number): V2 | null {
  const det = ax * bz - az * bx;
  if (Math.abs(det) < 1e-9) return null;
  return [(ca * bz - az * cb) / det, (ax * cb - ca * bx) / det];
}

// ring: tidy CCW wall outline. pitch = rise/run. overhang in metres. maxRise caps the ridge.
export function buildRoof(ring: V2[], style: RoofStyle, pitch: number, overhang: number, maxRise: number): RoofGeom | null {
  let o = overhang;
  let off = o > 0 ? offsetRing(ring, o) : ring;
  if (!off) (off = ring), (o = 0);
  let sk = straightSkeleton(off);
  if (!sk && o > 0) (off = ring), (o = 0), (sk = straightSkeleton(ring));
  if (!sk) return null;
  const inner = sk.maxT - o;
  if (inner < 0.4) return null;
  if (inner * pitch > maxRise) pitch = maxRise / inner;
  const E = edgeLines(off), n = off.length;
  const { nodes, faces } = sk;
  const use = new Map<number, number>();
  for (const f of faces) for (const k of f) use.set(k, (use.get(k) ?? 0) + 1);
  const gableFace = new Set<number>();
  const gables: RoofGeom['gables'] = [];
  if (style === 'gable') {
    for (let i = 0; i < n; i++) {
      const f = faces[i];
      if (f.length !== 3) continue;
      const apex = f[2];
      if (apex < n || use.get(apex) !== 3) continue;
      const a = (i + n - 1) % n, b = (i + 1) % n;
      if (!faces[a].includes(apex) || !faces[b].includes(apex)) continue;
      const edgeLen = Math.hypot(off[b][0] - off[i][0], off[b][1] - off[i][1]);
      if (edgeLen > 16) continue;
      // ridge = points equidistant from edge lines a and b; slide the apex along it to line i
      const bx = E.nx[a] - E.nx[b], bz = E.nz[a] - E.nz[b], bc = E.c[a] - E.c[b];
      const P = meet(E.nx[i], E.nz[i], E.c[i], bx, bz, bc);
      if (!P) continue;
      const s = ((P[0] - off[i][0]) * E.dx[i] + (P[1] - off[i][1]) * E.dz[i]) / edgeLen;
      const t = E.nx[a] * P[0] + E.nz[a] * P[1] - E.c[a];
      if (s < 0.2 || s > 0.8 || t < 0.5 || t > nodes[apex].t * 1.4 + 0.2) continue;
      // the same ridge where it meets the real wall (o inside the overhang line)
      const W = meet(E.nx[i], E.nz[i], E.c[i] + o, bx, bz, bc);
      if (!W) continue;
      const tw = E.nx[a] * W[0] + E.nz[a] * W[1] - E.c[a];
      nodes[apex] = { x: P[0], z: P[1], t };
      gableFace.add(i);
      const ia = ring[i], ib = ring[(i + 1) % n];
      gables.push({ a: ia, b: ib, apex: W, h: (tw - o) * pitch, edge: i });
    }
  }
  // (a gable roof needs slopes between its gables: on a triangle every face met the gable rule
  // round the one apex, leaving three gable walls, no roof and no peak — the chimney stood at
  // minus infinity and culled its whole chunk. Fewer than two slopes left: a hip roof instead)
  if (gables.length && n - gableFace.size < 2) return buildRoof(ring, 'hip', pitch, overhang, maxRise);
  const H = (k: number) => (nodes[k].t - o) * pitch;
  const tris: RoofGeom['tris'] = [];
  let peak: [number, number, number] = [0, -Infinity, 0];
  for (let i = 0; i < n; i++) {
    if (gableFace.has(i)) continue;
    const f = faces[i];
    const nrm = normalize3(-E.nx[i] * pitch, 1, -E.nz[i] * pitch);
    const pts = f.map((k) => [nodes[k].x, H(k), nodes[k].z] as [number, number, number]);
    for (const p of pts) if (p[1] > peak[1]) peak = p;
    if (pts.length === 3) { tris.push({ p: pts, n: nrm }); continue; }
    for (const [x, y, z] of earClip(f.map((k) => [nodes[k].x, nodes[k].z] as V2))) tris.push({ p: [pts[x], pts[y], pts[z]], n: nrm });
  }
  const lowH = -o * pitch;
  const fascia: RoofGeom['fascia'] = [];
  const rakes: RoofGeom['rakes'] = [];
  for (let i = 0; i < n; i++) {
    const p = off[i], q = off[(i + 1) % n];
    if (!gableFace.has(i)) { fascia.push([p[0], p[1], q[0], q[1], lowH]); continue; }
    const ap = nodes[faces[i][2]];
    rakes.push([p[0], p[1], lowH, ap.x, ap.z, H(faces[i][2])], [ap.x, ap.z, H(faces[i][2]), q[0], q[1], lowH]);
  }
  return { tris, gables, fascia, rakes, rise: inner * pitch, peak, lowH };
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// Ear clipping for small simple polygons (roof faces). Returns index triples.
export function earClip(poly: V2[]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  if (ringArea(poly) < 0) idx.reverse();
  const out: [number, number, number][] = [];
  const cross = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: V2, a: V2, b: V2, c: V2) => cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(a, b, c) <= 1e-12) continue;
      let ok = true;
      for (const j of idx) if (j !== ia && j !== ib && j !== ic && inside(poly[j], a, b, c)) { ok = false; break; }
      if (!ok) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // degenerate sliver: drop a collinear vertex
      const i = idx.findIndex((ib, k) => Math.abs(cross(poly[idx[(k + idx.length - 1) % idx.length]], poly[ib], poly[idx[(k + 1) % idx.length]])) <= 1e-9);
      idx.splice(i >= 0 ? i : 0, 1);
    }
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
