// Procedural fallback tiles: cells past the baked manifest synthesize a TileJson (plus a
// ground chunk + road ribbons) from a position-driven warped street field — every answer is
// a pure function of (x, z, regionSeed), so neighbouring tiles agree on shared roads and
// lots without ever seeing each other, and every client builds the same world forever.
import * as THREE from 'three';
import earcut from 'earcut';
import type { Building, Point, Road, TileJson, TileSpec } from './data';
import { propMaterial } from '../render/propMaterial';
import { buildGrid } from './ground';
import { pointInRing } from './realTile';
import { activeStyle } from './styles';

// Region seed: stable hash of the manifest id (same bake → same synthetic world).
export function regionSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Lattice hash + smoothed value noise — pure functions of position (cross-tile continuous).
const vh = (ix: number, iz: number, seed: number) => {
  let h = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x: number, z: number, cell: number, seed: number) {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
  const sx = ax * ax * (3 - 2 * ax), sz = az * az * (3 - 2 * az);
  const a = vh(ix, iz, seed), b = vh(ix + 1, iz, seed), c = vh(ix, iz + 1, seed), d = vh(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const PITCH = 108; // street grid spacing (m)
const ROAD_W = 6.5;

// Street centrelines: gentle sine wander — x(y) for N-S streets, z(x) for E-W ones.
const nsX = (iu: number, z: number, seed: number) => iu * PITCH + 26 * Math.sin(z * 0.006 + vh(iu, 777, seed) * 6.28);
const ewZ = (iv: number, x: number, seed: number) => iv * PITCH + 26 * Math.sin(x * 0.006 + vh(911, iv, seed) * 6.28);
// A street segment exists where the town mask wants it — towns clump, edges fray; outside
// cores the grid collapses to sparse rural lanes (every 4th line survives as an arterial).
const town = (x: number, z: number, seed: number) => vnoise(x, z, 1500, seed ^ 0x51d15e);
const segOn = (mx: number, mz: number, iu: number, iv: number, seed: number, arterial: boolean) => {
  const t = town(mx, mz, seed);
  return vh(iu * 31 + iv, iv * 17 + iu, seed ^ 0x700) < (arterial ? 0.35 + t * 0.55 : 0.08 + t * 0.8);
};

export interface SynthResult { tj: TileJson; extra: THREE.Group }

export function synthTile(spec: TileSpec, seed: number, terrain: { sdfAt(x: number, z: number): number; heightAt(x: number, z: number): number }): SynthResult {
  const box = spec.box;
  const M = 48;
  const S = { x0: box.x0 - M, z0: box.z0 - M, x1: box.x1 + M, z1: box.z1 + M };
  const land = (x: number, z: number) => terrain.sdfAt(x, z) > 1.5;

  const roads: Road[] = [];
  const buildings: Building[] = [];
  const points: Point[] = [];
  const lots: { x: number; z: number; r: number }[] = []; // placed footprint centres (overlap check)

  const ints = (pts: [number, number][]) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
  const own = (x: number, z: number) => (x >= box.x0 && x < box.x1 && z >= box.z0 && z < box.z1 ? undefined : 0);

  // ---- streets: N-S lines x=f(z) and E-W lines z=f(x), emitted per segment ----
  const emitRoad = (pts: [number, number][], cls: string, w: number, id: number) => {
    // split into land runs; a segment is owned iff its midpoint sits in our box
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length >= 2) {
        const [mx, mz] = run[Math.floor(run.length / 2)];
        roads.push({ p: ints(run), c: cls, w, own: own(mx, mz), n: `synth-st-${id}` });
      }
      run = [];
    };
    for (const p of pts) {
      if (land(p[0], p[1])) run.push(p);
      else flush();
    }
    flush();
  };

  const iu0 = Math.floor((box.x0 - 140) / PITCH), iu1 = Math.floor(box.x1 / PITCH);
  const iv0 = Math.floor((box.z0 - 140) / PITCH), iv1 = Math.floor(box.z1 / PITCH);
  let roadId = 0;
  for (let iu = iu0; iu <= iu1; iu++)
    for (let iv = iv0; iv <= iv1; iv++) {
      const mz = (iv + 0.5) * PITCH;
      if (!segOn(nsX(iu, mz, seed), mz, iu, iv, seed, iu % 4 === 0)) continue;
      const pts: [number, number][] = [];
      for (let z = iv * PITCH; z <= (iv + 1) * PITCH; z += 18) pts.push([nsX(iu, z, seed), z]);
      emitRoad(pts, iu % 4 === 0 ? 'secondary' : 'residential', ROAD_W, roadId++);
    }
  for (let iv = iv0; iv <= iv1; iv++)
    for (let iu = iu0; iu <= iu1; iu++) {
      const mx = (iu + 0.5) * PITCH;
      if (!segOn(mx, ewZ(iv, mx, seed), iu, iv, seed, iv % 4 === 0)) continue;
      const pts: [number, number][] = [];
      for (let x = iu * PITCH; x <= (iu + 1) * PITCH; x += 18) pts.push([x, ewZ(iv, x, seed)]);
      emitRoad(pts, iv % 4 === 0 ? 'secondary' : 'residential', ROAD_W, roadId++);
    }

  // ---- buildings: lots along each owned/margin road, centres owned by their tile ----
  const nearRoad = (x: number, z: number) => {
    const iu = Math.round((x - 26 * Math.sin(z * 0.006 + vh(Math.round(x / PITCH), 777, seed) * 6.28)) / PITCH);
    const iv = Math.round((z - 26 * Math.sin(x * 0.006 + vh(911, Math.round(z / PITCH), seed) * 6.28)) / PITCH);
    return Math.min(Math.abs(x - nsX(iu, z, seed)), Math.abs(z - ewZ(iv, x, seed)));
  };
  const lotAt = (cx: number, cz: number, ax: number, nx: number, nz: number, side: number, id: number) => {
    const r = vh(id, 3, seed);
    const L = 9 + r * 7, W = 8 + vh(id, 5, seed) * 6;
    const c = Math.cos(ax), s = Math.sin(ax);
    const kk = vh(id, 7, seed);
    const t = town(cx, cz, seed);
    const k = kk < 0.12 && t > 0.55 ? 'commercial' : kk < 0.17 ? 'shed' : 'house';
    // ~1 in 5 houses is an L — a wing off one end, so block faces aren't comb teeth.
    const Lshape = k === 'house' && vh(id, 41, seed) < 0.2;
    const local: [number, number][] = Lshape
      ? [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, 0], [L / 2 + W * 0.5, 0], [L / 2 + W * 0.5, W * 0.62], [-L / 2, W * 0.62]]
      : [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
    const ring = local.map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c] as [number, number]);
    const rr = Math.max(L, W * 1.6) * 0.62;
    if (lots.some((o) => Math.hypot(o.x - cx, o.z - cz) < o.r + rr)) return;
    if (!ring.every(([x, z]) => land(x, z))) return; // corner lots can't hang over water
    lots.push({ x: cx, z: cz, r: rr });
    const mix = activeStyle().roofMix; // regional roof habit (gable / hip / rest flat)
    const rv = vh(id, 11, seed);
    const roof = k === 'commercial' ? (rv < 0.7 ? 'flat' : 'gable') : rv < mix[0] ? 'gable' : rv < mix[0] + mix[1] ? 'hip' : 'flat';
    const h = k === 'commercial' ? 5 + vh(id, 13, seed) * 5 : k === 'shed' ? 2.6 : 3.4 + vh(id, 13, seed) * 5.6;
    buildings.push({ r: ints(ring), h, k: k as Building['k'], roof: roof as Building['roof'], s: vh(id, 17, seed) * 4294967296, own: own(cx, cz) });
    // An entrance point on the street face biases the door toward the street, like OSM data does.
    if (own(cx, cz) === undefined) points.push({ c: 'entrance', x: cx - nx * side * (W / 2 + 0.4), z: cz - nz * side * (W / 2 + 0.4) });
  };
  // Lots front the roads: step along every emitted segment, offset each side. Step and
  // setback jitter are seeded from the segment + step index — identical across tiles.
  for (const rd of roads) {
    const p = rd.p;
    const segId = ((Math.round(p[0] * 3) ^ Math.round(p[1] * 7)) >>> 0);
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const ang = Math.atan2(dz, dx);
      for (let d = 10, n = 0; d < len - 6; n++, d += 17 + vh(segId, n * 97, seed) * 9) {
        for (const side of [-1, 1]) {
          const sb = ROAD_W / 2 + 7.5 + vh(segId ^ n, side * 31 + 5, seed) * 5; // setback varies per lot
          const lx = ax + ux * d + nx * side * sb;
          const lz = az + uz * d + nz * side * sb;
          if (lx < S.x0 || lx > S.x1 || lz < S.z0 || lz > S.z1) continue;
          // The lot id is seeded from its position, not tile indices — neighbour tiles
          // synthesizing the same physical lot agree on its size/kind/seed.
          const id = ((Math.round(lx * 2.3) ^ Math.round(lz * 4.1) ^ (side + 1) * 77) >>> 0);
          if (!land(lx, lz)) continue;
          const t = town(lx, lz, seed);
          if (vh(id, 23, seed) > 0.25 + t * 0.6) continue; // density follows the town mask
          lotAt(lx, lz, ang, nx, nz, side, id);
        }
      }
      // sparse benches along owned road stretches
      if (rd.own !== 0)
        for (let d = 20; d < len - 8; d += 65)
          if (vh(segId, Math.floor(d * 7), seed ^ 0xb3) < 0.3) {
            const bxp = ax + ux * d + nx * (ROAD_W / 2 + 2.4), bzp = az + uz * d + nz * (ROAD_W / 2 + 2.4);
            if (bxp >= box.x0 && bxp < box.x1 && bzp >= box.z0 && bzp < box.z1 && land(bxp, bzp)) points.push({ c: 'bench', x: bxp, z: bzp });
          }
    }
  }

  // ---- vegetation: jittered lattice, thinned inside towns, off road corridors ----
  for (let z = S.z0; z < S.z1; z += 17)
    for (let x = S.x0; x < S.x1; x += 17) {
      const jx = x + (vh(Math.round(x), Math.round(z), seed) - 0.5) * 15;
      const jz = z + (vh(Math.round(x) + 7, Math.round(z), seed) - 0.5) * 15;
      if (!land(jx, jz) || nearRoad(jx, jz) < ROAD_W / 2 + 3.5) continue;
      if (lots.some((o) => Math.hypot(o.x - jx, o.z - jz) < o.r + 3)) continue;
      const t = town(jx, jz, seed);
      if (vh(Math.round(x * 3), Math.round(z * 3), seed ^ 0x77ee) > 0.55 - t * 0.35) continue;
      points.push({ c: 'tree', x: jx, z: jz, own: own(jx, jz) });
    }

  const tj: TileJson = {
    version: 1, id: spec.id, lod: 0, box, slice: S, backdrop: S,
    origin: { lat: 0, lon: 0 }, buildings, roads, areas: [], lines: [], points, landmarks: [],
  };

  // ---- visuals the bake normally ships via paint/atlas: ground chunk + road ribbons ----
  const extra = new THREE.Group();
  const g = buildGrid({ x0: box.x0, z0: box.z0, x1: box.x1, z1: box.z1, step: 8 }, (x, z) => terrain.heightAt(x, z), (x, z) => terrain.sdfAt(x, z) > -45);
  if (g.index && g.index.count) {
    const gm = new THREE.Mesh(g, new THREE.ShaderMaterial());
    gm.material.userData.tag = 'gnd'; // matTag resolves this to the shared ground material
    extra.add(gm);
  }
  extra.add(roadRibbons(roads, terrain));

  return { tj, extra };
}

// Asphalt + sidewalk ribbons hugging the terrain — the synth world's visible streets.
function roadRibbons(roads: Road[], terrain: { heightAt(x: number, z: number): number }) {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const push = (cx: number, cz: number, ux: number, uz: number, nx: number, nz: number, hw: number, r: number, gg: number, b: number, y = 0.07) => {
    const at = (sx: number, sz: number) => { const x = cx + sx, z = cz + sz; pos.push(x, terrain.heightAt(x, z) + y, z); nrm.push(0, 1, 0); col.push(r, gg, b); };
    const base = pos.length / 3;
    at(-ux - nx * hw, -uz - nz * hw); at(ux - nx * hw, uz - nz * hw); at(ux + nx * hw, uz + nz * hw); at(-ux + nx * hw, -uz + nz * hw);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const rd of roads) {
    if (rd.own === 0) continue;
    const p = rd.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1.5) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, hl = len / 2 + 0.6;
      // N-S and E-W ribbons sit at different heights so crossings layer instead of z-fighting.
      const ew = Math.abs(dx) > Math.abs(dz);
      const yAsp = ew ? 0.085 : 0.075, ySw = ew ? 0.065 : 0.055;
      push(cx, cz, ux * hl, uz * hl, nx, nz, rd.w / 2 + 1.6, 0.72, 0.69, 0.62, ySw); // sidewalks poke past the kerb
      push(cx, cz, ux * hl, uz * hl, nx, nz, rd.w / 2, 0.23, 0.22, 0.21, yAsp);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, propMaterial());
  return m;
}

// Real-lite tiles (worker-served OSM data) need the same visuals the bake gets from
// paint/atlas: a ground chunk, asphalt ribbons along the REAL road centrelines, and
// water sheets over the tile's water/coast areas (the terrain has no shore data here).
export function realExtras(tj: TileJson, terrain: { sdfAt(x: number, z: number): number; heightAt(x: number, z: number): number }): THREE.Group {
  const box = tj.box;
  const extra = new THREE.Group();
  const unpack = (f: number[]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < f.length; i += 2) out.push([f[i] / 10, f[i + 1] / 10]);
    return out;
  };
  const waters = tj.areas.filter((a) => a.c === 'water' || a.c === 'wetland');
  const waterRings = waters.flatMap((a) => a.o.map(unpack));
  const inWater = (x: number, z: number) => waterRings.some((r) => pointInRing(x, z, r));
  const g = buildGrid({ x0: box.x0, z0: box.z0, x1: box.x1, z1: box.z1, step: 8 }, (x, z) => terrain.heightAt(x, z), (x, z) => terrain.sdfAt(x, z) > -45 && !inWater(x, z));
  if (g.index && g.index.count) {
    const gm = new THREE.Mesh(g, new THREE.ShaderMaterial());
    gm.material.userData.tag = 'gnd';
    extra.add(gm);
  }
  extra.add(roadRibbons(tj.roads, terrain));
  // Water sheets: flat tinted polygons hugging the ground. The watercolor post-pass
  // softens them toward the painted look; sdf/ocean shading arrives with real DEM (H2).
  const WET: Record<string, [number, number, number]> = { water: [0.32, 0.44, 0.55], wetland: [0.38, 0.45, 0.4], beach: [0.82, 0.75, 0.58] };
  for (const a of tj.areas) {
    const col = WET[a.c];
    if (!col) continue;
    const outers = a.o.map(unpack).filter((r) => r.length >= 3);
    const inners = a.i.map(unpack).filter((r) => r.length >= 3);
    for (const pts of outers) {
      // earcut handles holes: outer ring first, then each inner ring as a hole.
      const rings = [pts, ...inners];
      const flat = rings.flatMap((r) => r.flat());
      const holes = inners.length ? inners.reduce<number[]>((hs, _r, i) => [...hs, pts.length + inners.slice(0, i).reduce((n, rr) => n + rr.length, 0)], []) : undefined;
      const idx = earcut(flat, holes);
      if (!idx.length) continue;
      const pos: number[] = [], nrm: number[] = [], cc: number[] = [];
      for (const ring of rings)
        for (const [x, z] of ring) {
          pos.push(x, terrain.heightAt(x, z) + 0.06, z);
          nrm.push(0, 1, 0);
          cc.push(col[0], col[1], col[2]);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      geo.setIndex(idx);
      extra.add(new THREE.Mesh(geo, propMaterial()));
    }
  }
  return extra;
}
