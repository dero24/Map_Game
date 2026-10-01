// The far skyline: a city's tallest towers at their real distance — Manhattan from a Jersey beach
// 38 km off, a downtown across a bay, a desert city from the ridge above it. The skyline ring
// (skyline.ts) draws every tower within 8 km in full; past it the tiles and the horizon ring hold
// only ground, so a city an hour's drive away was simply not there. One Overpass read of the very
// tall (≥ 120 m or 35 storeys, masts ≥ 150 m) within 60 km, through the tiles' own osmToTile so
// heights and parts match theirs, cached in IndexedDB and re-read after a 15 km walk. Flat-topped
// prisms, one merged mesh per 8 km sector, drawn in the far layer with the horizon ring: the
// earth's curve lowers them (refraction included), the sea's bulge hides their bases, a nearer
// ridge hides them by depth, and the day's air takes them toward the sky — in clear air a pale
// blue-grey silhouette with the sun on one side, in haze or sea fog nothing at all. No windows, no
// ink: at 40 km a tower is a stroke on the horizon, not a building. Deterministic: a pure function
// of the map, the DEM and where the read was taken.
import * as THREE from 'three';
import earcut from 'earcut';
import { demSampler } from './dem';
import { kvGet, kvPut } from './cache';
import { OVERPASS } from './skyline';
import { makeProjector, osmToTile, type LatLon, type OsmDoc } from './realTile';
import { GLSL_FAR_DEPTH, paintMaterial, U } from '../render/shared';
import type { Box, TileJson } from './data';

const R = 60000, MOVE = 15000, SNAP = 5000, SECTOR = 8000;
const TALL = 120, FLOORS = 35, MAST = 150, MAST_W = 6, MIN_TOP = 60;
const FAR_V = 1; // bump when the read or the tower list changes
const RETRY_MS = 60000; // a failed read (Overpass busy, a DEM tile down) tries again, backing off to half an hour
// what the near systems draw, left to them: the skyline ring's box, and always the detail tiles
// round you; before the ring has a box, everything within the 8 km it will cover
const R_MIN = 2500, NEAR_R = 8500;
/** Standard refraction (k = 0.13) bends sight lines round the curve: the earth looks this big. */
export const R_EFF = 6371000 / (1 - 0.13);
// The air: clear air (the atmosphere's base fog density, haze 0, no cloud) shows the far towers
// out to ~75 km; haze and cloud thicken the fog density and sea fog multiplies it, as the near
// fog does. The low air is the haziest: a tower's top stands clearer than its base.
const V_CLEAR = 75000, DENS_CLEAR = 0.00006, SEA_FOG_K = 12, LIFT = 0.3, LIFT_H = 500;

/** How far the ground at d metres has dropped below your level, the curve and refraction both. */
export const curvatureDrop = (d: number) => (d * d) / (2 * R_EFF);

/** How much of a far tower's own tone survives d metres of air (1 = all, 0 = sky): the fog density
 *  and sea fog of the moment, at y metres above the sea. (The shader's T, kept in step.) */
export function airT(d: number, fogDensity: number, seaFog: number, y = 0) {
  const V = (V_CLEAR * DENS_CLEAR) / Math.max(fogDensity, DENS_CLEAR) / (1 + SEA_FOG_K * seaFog);
  const s = Math.min(1, Math.max(0, y / LIFT_H));
  return Math.exp((-d / V) * (1 - LIFT * s * s * (3 - 2 * s)));
}

export function farSkylineQuery(bb: { s: number; w: number; n: number; e: number }) {
  const b = `${bb.s.toFixed(5)},${bb.w.toFixed(5)},${bb.n.toFixed(5)},${bb.e.toFixed(5)}`;
  return `[out:json][timeout:120][bbox:${b}];(
  way["building"]["height"](if: number(t["height"]) >= ${TALL});
  way["building"]["building:levels"](if: number(t["building:levels"]) >= ${FLOORS});
  relation["building"]["height"](if: number(t["height"]) >= ${TALL});
  way["building:part"]["height"](if: number(t["height"]) >= ${TALL});
  nwr["man_made"~"^(tower|mast)$"]["height"](if: number(t["height"]) >= ${MAST});
);out geom qt;`;
}

/** One far tower: its outline (0.1 m ints, as Building.r) and its bottom and top above the ground. */
export interface FarTower { r: number[]; y0: number; y1: number }

/** The prisms in a read: every tall outline and part from its lift up (an outline its parts draw is
 *  left to them, a podium under its tower's parts is too low to show), a mast as a slim box. */
export function farTowers(tj: Pick<TileJson, 'buildings' | 'points'>): FarTower[] {
  const out: FarTower[] = [];
  for (const b of tj.buildings) {
    const y0 = b.lf ?? 0, y1 = y0 + b.h;
    if (!b.hp && y1 >= MIN_TOP && b.r.length >= 6) out.push({ r: b.r, y0, y1 });
  }
  for (const p of tj.points) {
    if (p.c !== 'mast' || !p.h || p.h < MAST) continue;
    const x = Math.round(p.x * 10), z = Math.round(p.z * 10), w = MAST_W * 5;
    out.push({ r: [x - w, z - w, x + w, z - w, x + w, z + w, x - w, z + w], y0: 0, y1: p.h });
  }
  return out;
}

/** Whether the near systems draw all of a box of ground: it lies inside the skyline ring's read
 *  box (before the ring has one, within the 8.5 km it will cover), or within the detail tiles'
 *  2.5 km round you at (x, z). The shader asks the same of each pixel. */
export function nearCovers(b: Box, x: number, z: number, near: Box | null) {
  const dx = Math.max(Math.abs(b.x0 - x), Math.abs(b.x1 - x)), dz = Math.max(Math.abs(b.z0 - z), Math.abs(b.z1 - z));
  if (Math.hypot(dx, dz) < (near ? R_MIN : NEAR_R)) return true; // (its farthest corner within the ring)
  return !!near && b.x0 >= near.x0 && b.x1 <= near.x1 && b.z0 >= near.z0 && b.z1 <= near.z1;
}

/** Flat-topped prisms, merged: a wall quad per outline edge (its own corners, so each wall keeps
 *  its flat normal, facing out) and a roof facing up — no floor, nothing looks up at one. A tower
 *  stands on the ground under its outline's centre. 5 vertices per outline corner. */
export function prismGeometry(towers: FarTower[], ground: (x: number, z: number) => number) {
  let nv = 0, ni = 0;
  for (const t of towers) { const n = t.r.length >> 1; nv += n * 5; ni += n * 6 + (n - 2) * 3; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v = 0, k = 0;
  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const o = v * 3;
    (pos[o] = x), (pos[o + 1] = y), (pos[o + 2] = z), (nrm[o] = nx), (nrm[o + 1] = ny), (nrm[o + 2] = nz);
    return v++;
  };
  for (const t of towers) {
    const n = t.r.length >> 1, xs: number[] = [], zs: number[] = [];
    let cx = 0, cz = 0, s = 0;
    for (let i = 0; i < n; i++) { xs.push(t.r[i * 2] / 10); zs.push(t.r[i * 2 + 1] / 10); cx += xs[i] / n; cz += zs[i] / n; }
    for (let i = 0; i < n; i++) s += xs[i] * zs[(i + 1) % n] - xs[(i + 1) % n] * zs[i];
    if (s > 0) { xs.reverse(); zs.reverse(); } // clockwise on the map (+z south): each edge's (−dz, dx) faces out
    const g = ground(cx, cz), y0 = g + t.y0, y1 = g + t.y1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = xs[j] - xs[i], dz = zs[j] - zs[i], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const a = put(xs[i], y0, zs[i], nx, 0, nz), b = put(xs[j], y0, zs[j], nx, 0, nz);
      const c = put(xs[j], y1, zs[j], nx, 0, nz), d = put(xs[i], y1, zs[i], nx, 0, nz);
      idx.set([a, b, c, a, c, d], k); // (counter-clockwise seen from outside)
      k += 6;
    }
    const r0 = v, flat: number[] = [];
    for (let i = 0; i < n; i++) { put(xs[i], y1, zs[i], 0, 1, 0); flat.push(xs[i], zs[i]); }
    const tri = earcut(flat);
    for (let i = 0; i + 2 < tri.length; i += 3) {
      let q = tri[i + 1], w = tri[i + 2];
      const p = tri[i];
      if ((zs[q] - zs[p]) * (xs[w] - xs[p]) - (xs[q] - xs[p]) * (zs[w] - zs[p]) < 0) [q, w] = [w, q]; // (facing up)
      idx.set([r0 + p, r0 + q, r0 + w], k);
      k += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, k), 1)); // (a degenerate outline earcut can't fill has fewer roof triangles)
  return geo;
}

const TWO_R = (2 * R_EFF).toFixed(1);
const f = (x: number) => x.toFixed(6);

export function farSkylineMaterial() {
  return paintMaterial({
    uniforms: { uNear: { value: new THREE.Vector4(0, 0, -1, -1) }, uNearR: { value: NEAR_R } },
    vertex: /* glsl */ `
      ${GLSL_FAR_DEPTH}
      varying float vHt;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vHt = wp.y; // above the sea, before the curve takes it
        vec2 o = wp.xz - cameraPosition.xz;
        wp.y -= dot(o, o) / ${TWO_R}; // the earth's curve, as refraction shows it
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        // past the camera's far plane: never clipped, and at its true distance in the far layer —
        // the towers sort among themselves and the horizon ring's ridges hide what they stand before
        gl_Position.z = farDepth(distance(wp.xyz, cameraPosition)) * gl_Position.w;
      }`,
    fragment: /* glsl */ `
      uniform vec4 uNear;
      uniform float uNearR;
      varying float vHt;
      // the sky dome just over the horizon this way (sky.ts, less its clouds): the glow of the air
      // between you and the city
      vec3 hazeSky(vec3 d) {
        vec3 c = mix(uSkyHorizon, uFogSunColor, uGolden * 0.35);
        c += uFogSunColor * pow(max(dot(d, uSunDir), 0.0), 10.0) * 0.45 * smoothstep(-0.12, 0.02, uSunDir.y);
        c = mix(c, uFogColor, clamp(uSeaFog * 1.2, 0.0, 1.0));
        return mix(c, uFogColor, 1.0 - smoothstep(-0.05, 0.04, d.y));
      }
      void main() {
        vec3 eye = cameraPosition + uWorldOffset;
        vec3 v = vWorldPos - eye;
        float d = length(v.xz);
        // the near towers are the skyline ring's and the tiles': never drawn twice
        if (d < uNearR || (vWorldPos.x > uNear.x && vWorldPos.x < uNear.z && vWorldPos.z > uNear.y && vWorldPos.z < uNear.w)) discard;
        // the sea's bulge hides the bases: past the eye's own sea horizon (dh), whatever lies under
        // the line grazing it — Manhattan's lowest ~80 m from a Jersey beach, nothing from a hilltop
        float dh = sqrt(${TWO_R} * max(eye.y, 0.0)), dm = max(d - dh, 0.0);
        if (vWorldPos.y < (dm * dm - d * d) / ${TWO_R}) discard;
        float V = ${f(V_CLEAR * DENS_CLEAR)} / max(uFogDensity, ${f(DENS_CLEAR)}) / (1.0 + ${f(SEA_FOG_K)} * uSeaFog);
        float T = exp(-d / V * (1.0 - ${f(LIFT)} * smoothstep(0.0, ${f(LIFT_H)}, vHt)));
        vec3 sky = hazeSky(normalize(v));
        // a pale blue-grey of the sky's own light, a touch lighter where the sun lands: one wash
        float sun = max(dot(normalize(vNormalW), uSunDir), 0.0) * smoothstep(-0.02, 0.1, uSunDir.y);
        vec3 tone = sky * vec3(0.64, 0.69, 0.80) + uKeyColor * sun * 0.1;
        // (alpha 0.5 marks the far layer's towers for the paint: a stroke a few pixels wide that the
        // brush would smear into the sky is laid back as drawn — post.ts)
        gl_FragColor = vec4(mix(sky, tone, T), 0.5);
      }`,
  });
}

const ringBox = (towers: FarTower[]): Box => {
  const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const t of towers)
    for (let i = 0; i + 1 < t.r.length; i += 2) {
      const x = t.r[i] / 10, z = t.r[i + 1] / 10;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
    }
  return b;
};
const boxDist = (b: Box, x: number, z: number) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

export class FarSkyline {
  readonly group = new THREE.Group();
  private readonly mat = farSkylineMaterial();
  private sectors: { mesh: THREE.Mesh; box: Box }[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private busy = false;
  private retryAt = 0;
  private fails = 0;

  constructor(private origin: LatLon, private enabled: boolean) {
    this.group.name = 'far-skyline';
    this.group.visible = false;
    // The far layer sorts in a depth of its own (shared.ts farDepth); once it is drawn — these
    // towers, then the horizon ring tested against them — that depth is cleared, and the near
    // world draws over the whole layer as before. (A mesh with no vertices: it draws nothing, it
    // only marks the moment. Hidden with the group when there's nothing to draw.)
    const clear = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    clear.name = 'far-skyline:clear-depth';
    clear.frustumCulled = false;
    clear.renderOrder = -8.5; // after the horizon ring (-9), before anything near
    clear.onBeforeRender = (r) => r.clearDepth();
    this.group.add(clear);
  }

  /** Per frame, with the walker's position and the skyline ring's box: cheap uniforms and a sector
   *  cull; a re-read (off the frame) when the walker has gone 15 km. */
  update(x: number, z: number, near: Box | null) {
    if (!this.enabled) return;
    const u = this.mat.uniforms;
    if (near) (u.uNear.value as THREE.Vector4).set(near.x0, near.z0, near.x1, near.z1);
    else (u.uNear.value as THREE.Vector4).set(0, 0, -1, -1);
    u.uNearR.value = near ? R_MIN : NEAR_R;
    let closest = Infinity;
    for (const s of this.sectors) {
      s.mesh.visible = !nearCovers(s.box, x, z, near);
      if (s.mesh.visible) closest = Math.min(closest, boxDist(s.box, x, z));
    }
    // (a hazy day, a sea fog: not even the nearest top shows — nothing to draw)
    this.group.visible = closest < Infinity && airT(closest, U.uFogDensity.value, U.uSeaFog.value, LIFT_H) > 0.01;
    if (this.busy || (Math.hypot(x - this.cx, z - this.cz) < MOVE && performance.now() < this.retryAt)) return;
    this.busy = true;
    const cx = Math.round(x / SNAP) * SNAP, cz = Math.round(z / SNAP) * SNAP;
    void this.read(cx, cz)
      .then((towers) => (towers ? this.build(towers) : false))
      .catch(() => false)
      .then((whole) => {
        this.cx = cx;
        this.cz = cz;
        this.fails = whole ? 0 : this.fails + 1;
        this.retryAt = whole ? Infinity : performance.now() + RETRY_MS * 2 ** Math.min(this.fails - 1, 5);
      })
      .finally(() => { this.busy = false; });
  }

  private async read(cx: number, cz: number): Promise<FarTower[] | null> {
    const key = `far${FAR_V}|${this.origin.lat.toFixed(4)},${this.origin.lon.toFixed(4)}|${cx}_${cz}`;
    const hit = await kvGet<FarTower[]>(key);
    if (hit) return hit;
    const box = { x0: cx - R, z0: cz - R, x1: cx + R, z1: cz + R };
    const body = 'data=' + encodeURIComponent(farSkylineQuery(makeProjector(this.origin).localToBbox(box)));
    for (const ep of OVERPASS) {
      try {
        const r = await fetch(ep, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(130000) });
        if (!r.ok) continue;
        const j = (await r.json()) as OsmDoc & { remark?: string };
        if (typeof j.remark === 'string' && /error|timed out|out of memory/i.test(j.remark)) continue;
        const towers = farTowers(osmToTile(j, { id: 'far-skyline', box, origin: this.origin, margin: 0 }));
        void kvPut(key, towers);
        return towers;
      } catch { /* next mirror */ }
    }
    return null;
  }

  /** Sectors built a frame apart, then swapped in whole. False when a sector's ground couldn't be
   *  read (it's left out, and the read tried again later). */
  private async build(towers: FarTower[]): Promise<boolean> {
    const P = makeProjector(this.origin);
    const bySector = new Map<string, FarTower[]>();
    for (const t of towers) {
      let x = 0, z = 0;
      const n = t.r.length >> 1;
      for (let i = 0; i < n; i++) (x += t.r[i * 2] / 10 / n), (z += t.r[i * 2 + 1] / 10 / n);
      const k = `${Math.floor(x / SECTOR)}_${Math.floor(z / SECTOR)}`;
      (bySector.get(k) ?? bySector.set(k, []).get(k)!).push(t);
    }
    const built: { mesh: THREE.Mesh; box: Box }[] = [];
    let whole = true;
    for (const list of bySector.values()) {
      const box = ringBox(list);
      // the ground under them from the bare-earth DEM, as the skyline ring reads it (z11: the
      // lower zooms are surface models that stand a city on its own roofs)
      const at = await demSampler(11, P.localToBbox({ x0: box.x0 - 200, z0: box.z0 - 200, x1: box.x1 + 200, z1: box.z1 + 200 }));
      if (!at) { whole = false; continue; }
      const mesh = new THREE.Mesh(prismGeometry(list, (x, z) => at(...P.unproject(x, z))), this.mat);
      mesh.name = 'far-skyline:sector';
      mesh.frustumCulled = false; // (the camera's frustum ends at 25 km)
      mesh.renderOrder = -9.5; // after the sky dome, before the horizon ring that tests against it
      built.push({ mesh, box });
      await new Promise((r) => setTimeout(r, 0)); // a sector at a time: no long frame
    }
    for (const s of this.sectors) { this.group.remove(s.mesh); s.mesh.geometry.dispose(); }
    this.sectors = built;
    for (const s of built) this.group.add(s.mesh);
    return whole;
  }
}
