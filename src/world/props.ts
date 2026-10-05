// Street furniture and life: utility poles with sagging wires and cobra-head lamps (plus the lamp light map
// that paints warm pools on the ground at night), trees from WorldCover, moored boats, lifeguard stands.
import * as THREE from 'three';
import type { HoodClass } from './hood';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detailBox, toLatLon, type World, type WorldJson, type Road, type Box, type Building } from './data';
import type { WalkWorld } from '../player/collision';
import { propMaterial, colored } from '../render/propMaterial';
import { lotLayout } from './lots';
import { U, GLSL_NOISE } from '../render/shared';
import { makeRng, hash01 } from '../core/rng';
import { carMix, boatMix, carLib, boatLib, boatRecipe, carRecipe, pickFrom, CAR_TYPES, type BoatType, type CarType } from '../assets/kit';
import type { Mailbox, Door, Drive } from './buildings';
import { makeCanvas } from './canvas';
import { pointInRing, ringTester } from './realTile';
import { activeStyle, castOf, pickWeighted, westside as isWestside } from './styles';
import { hangerLib, hangerMix, HANGERS, HANG_TONES, type HangerType } from '../assets/hangers';
import { caFogBelt } from './ecoregions';
import { TREE_KINDS, TREE_VARIANTS, treeLib, treeMeta, plantMix, broadMix, coniferMix, aspenShare, willowThickets, snagShare, NEEDLED, plantLib, inBloom, SPECIES, STAGES, fallHueOf, DECIDUOUS, FLUTTER, type PlantSpecies } from '../assets/flora';
import { MAILBOXES, mailboxLib, beachLib, gearFor, type MailboxStyle, type CarGear } from '../assets/furniture';
import { variantAt, hashf } from '../assets/core';
import { cafeSet, mergeDecor } from '../assets/decor';
import { personGeometry } from '../assets/people';
import { creatureMaterial } from '../render/creature';
import { useOf, terraceUse } from './uses';
import { analyzeJunctions, packJunctions, signalKey, CTL, type Junction, STOP_BACK } from '../sim/traffic';
import { sportLib, type SportPiece } from '../assets/sport';
import { towerLib, TOWER_H, ROOFTOP_H, CHIMNEY_BRICK, type TowerKind } from '../assets/tower';
import { COURT, courtFrame, diamondFrame, type Sport } from './sports';
import { stallLib, STALL_VARIANTS, AWNING, STALL_FOOT, type StallKind } from '../assets/market';
import { kerbSpaces, oneToASpace, OCCUPANCY } from './kerbside';
import { viewCones, viewDir } from './views';
import { streetLib, streetPaint, STREET_VARIANTS, type StreetKind } from '../assets/street';
import { playLib, PLAY_KINDS, PLAY_PAINT, PLAY_FOOT, type PlayKind } from '../assets/play';
import { beachSeason, beachLotFill, marinaSeason, windowFor, worldDate } from './calendar';
import { seaLevel, type Berth } from './docks';
import { GUARD_SEAT, type Gear, type Stand } from './crowd';

type P = [number, number];
/** The hours a thing is there for when it's there all day (calendar.ts windows). */
const ALL_DAY: [number, number] = [0, 24];
/** Do two outlines come within `d` of each other (or overlap)? */
function ringsWithin(a: P[], b: P[], d: number) {
  let ax0 = Infinity, az0 = Infinity, ax1 = -Infinity, az1 = -Infinity, bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const [x, z] of a) (ax0 = Math.min(ax0, x)), (ax1 = Math.max(ax1, x)), (az0 = Math.min(az0, z)), (az1 = Math.max(az1, z));
  for (const [x, z] of b) (bx0 = Math.min(bx0, x)), (bx1 = Math.max(bx1, x)), (bz0 = Math.min(bz0, z)), (bz1 = Math.max(bz1, z));
  if (ax0 > bx1 + d || bx0 > ax1 + d || az0 > bz1 + d || bz0 > az1 + d) return false;
  const segD = (px: number, pz: number, r: P[]) => {
    let best = Infinity;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x0, z0] = r[j], dx = r[i][0] - x0, dz = r[i][1] - z0, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2));
      best = Math.min(best, Math.hypot(x0 + dx * t - px, z0 + dz * t - pz));
    }
    return best;
  };
  return a.some(([x, z]) => pointIn(x, z, b) || segD(x, z, b) <= d) || b.some(([x, z]) => pointIn(x, z, a) || segD(x, z, a) <= d);
}
const pointIn = (x: number, z: number, r: P[]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
const unpackPts = (f: number[]): P[] => {
  const o: P[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
  return o;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The roof under a point mapped on a building (the tall structures: a rooftop tank, an antenna,
 *  a flag up top): inside a standing building's outline, the highest roof over it — flat, or a
 *  pitched one's eaves (the thing rises out of the slope) — as a world height `y` and a height
 *  above the ground `top`; null on open ground. A tier stacked on the building counts (a mast on
 *  a tower's crown); an outline its parts draw has no roof of its own. */
export function roofUnder(json: { buildings: Building[] }, terrain: { heightAt(x: number, z: number): number }) {
  let rs: { b: Building; ring: P[]; x0: number; z0: number; x1: number; z1: number }[] | null = null;
  return (x: number, z: number): { y: number; top: number } | null => {
    rs ??= json.buildings.filter((b) => !b.in && !b.cn && b.r.length >= 6).map((b) => {
      const ring = unpackPts(b.r);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [px, pz] of ring) (x0 = Math.min(x0, px)), (z0 = Math.min(z0, pz)), (x1 = Math.max(x1, px)), (z1 = Math.max(z1, pz));
      return { b, ring, x0, z0, x1, z1 };
    });
    let stands = false, top = -Infinity, tb: (typeof rs)[number] | null = null;
    for (const r of rs) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1 || !pointIn(x, z, r.ring)) continue;
      if ((r.b.lf ?? 0) <= 1.5) stands = true;
      const t = (r.b.lf ?? 0) + r.b.h;
      if (!r.b.hp && t > top) (top = t), (tb = r);
    }
    if (!stands || !tb) return null;
    let g = Infinity;
    for (const [px, pz] of tb.ring) g = Math.min(g, terrain.heightAt(px, pz));
    const eave = tb.b.roof === 'flat' ? top : tb.b.eav ?? top - Math.min(4, 0.3 * tb.b.h);
    return { y: Math.max(g, 0.2) - 0.3 + eave, top: eave }; // (the building's base: buildings.ts)
  };
}

/** A spot for a thing `r` round that keeps every door's way in clear (tileBuild doorApron: 3.2 m
 *  out, the door's width and 35 cm either side): the same spot when it's clear, else beside the
 *  door on its own side, as far out from the wall. */
export function clearOfDoors(x: number, z: number, r: number, doors: readonly { wx: number; wz: number; nx: number; nz: number; w: number }[]): P {
  for (const d of doors) {
    const dx = x - d.wx, dz = z - d.wz, tx = -d.nz, tz = d.nx;
    const t = dx * tx + dz * tz, n = dx * d.nx + dz * d.nz, hw = d.w / 2 + 0.35;
    if (Math.abs(t) >= hw + r || n <= -0.5 || n >= 3.2 + r) continue;
    const s = t < 0 ? -1 : 1, t2 = s * (hw + r + 0.1), n2 = Math.max(n, r + 0.35);
    return [d.wx + tx * t2 + d.nx * n2, d.wz + tz * t2 + d.nz * n2];
  }
  return [x, z];
}
const RANK: Record<string, number> = { residential: 2, unclassified: 2, living_street: 2, tertiary: 3, secondary: 4, primary: 5 };

/** The carriageways (ranked 2+, at grade) with a segment within `pad` m of a point, from a 32 m grid
 *  of their segments' boxes: a street lookup for each of a downtown's thousands of mapped lamps,
 *  racks and bollards without walking every street each time. */
function streetsNear(roads: Road[], pad = 25): (x: number, z: number) => Road[] {
  const C = 32, grid = new Map<number, Road[]>();
  const key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
  for (const r of roads) {
    if (r.lod || r.br || r.tu || (RANK[r.c] ?? 0) < 2) continue;
    const seen = new Set<number>();
    for (let q = 0; q + 3 < r.p.length; q += 2) {
      const ax = r.p[q] / 10, az = r.p[q + 1] / 10, bx = r.p[q + 2] / 10, bz = r.p[q + 3] / 10;
      for (let i = Math.floor((Math.min(ax, bx) - pad) / C); i <= Math.floor((Math.max(ax, bx) + pad) / C); i++)
        for (let j = Math.floor((Math.min(az, bz) - pad) / C); j <= Math.floor((Math.max(az, bz) + pad) / C); j++) {
          const k = key(i, j);
          if (seen.has(k)) continue;
          seen.add(k);
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(r);
        }
    }
  }
  return (x, z) => grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? [];
}

/** Every way a car drives (at grade): the carriageways a post must keep out of. */
const CARRIAGEWAY = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
/** The carriageways with a segment within 25 m of a point (streetsNear's grid, every class a car
 *  drives on, links too). */
export function carriagewaysNear(roads: Road[]): (x: number, z: number) => Road[] {
  return streetsNear(roads.filter((r) => CARRIAGEWAY.has(r.c.replace(/_link$/, ''))).map((r) => ({ ...r, c: 'residential' })));
}

/** A post (a signal mast, a stop sign, a hydrant, a pole) that the map or a corner rule puts in a
 *  carriageway steps out onto the sidewalk: `r` + 30 cm past the kerb, on its own side of the
 *  street — then out of the next street too, at a corner. Null when there's no sidewalk to find
 *  (the middle of a junction). A car stops dead on a post in its lane, and traffic drives through
 *  it (tools/playtest.js __ROADPOSTS__ found a signal mast on a main road's centre line). */
export function offCarriageway(near: (x: number, z: number) => Road[], x: number, z: number, r: number): P | null {
  for (let k = 0; k < 4; k++) {
    let best: { out: number; qx: number; qz: number; ux: number; uz: number; w: number } | null = null;
    for (const rd of near(x, z))
      for (let i = 0; i + 3 < rd.p.length; i += 2) {
        const ax = rd.p[i] / 10, az = rd.p[i + 1] / 10, sx = rd.p[i + 2] / 10 - ax, sz = rd.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz;
        if (L2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
        const qx = ax + sx * t, qz = az + sz * t, out = Math.hypot(x - qx, z - qz) - rd.w / 2;
        if (out < r && (!best || out < best.out)) { const L = Math.sqrt(L2); best = { out, qx, qz, ux: sx / L, uz: sz / L, w: rd.w }; }
      }
    if (!best) return [x, z];
    let nx = x - best.qx, nz = z - best.qz;
    const l = Math.hypot(nx, nz);
    if (l > 0.05) (nx /= l), (nz /= l);
    else (nx = -best.uz), (nz = best.ux); // (on the line itself: its left side, a stable choice)
    x = best.qx + nx * (best.w / 2 + r + 0.3);
    z = best.qz + nz * (best.w / 2 + r + 0.3);
  }
  return null;
}

// Overhead wires as screen-space ribbons: a real wire's projected width (~2.5 cm), but never
// thinner than 2 px — a one-pixel line vanishes in the brush pass, and the wires criss-crossing
// the sky are what an American street looks like. Each segment is a quad of 4 corners carrying
// the other end (aOther) and a side (aSide); the vertex shader spreads them across the line.
export function wireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uNight: U.uNight, uViewport: U.uViewport, uSkyZenith: U.uSkyZenith },
    vertexShader: /* glsl */ `
      attribute vec3 aOther;
      attribute float aSide;
      uniform vec2 uViewport;
      varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        vec4 a = projectionMatrix * mv;
        vec4 b = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
        gl_Position = a;
        if (a.w < 0.05 || b.w < 0.05) return;
        vec2 hv = 0.5 * uViewport;
        vec2 d = (b.xy / b.w - a.xy / a.w) * hv;
        float L = length(d);
        if (L < 1e-5) return;
        vec2 n = vec2(-d.y, d.x) / L;
        float px = max(2.0, 0.025 * projectionMatrix[1][1] * hv.y / a.w);
        gl_Position.xy += n * aSide * (0.5 * px) / hv * a.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor, uSkyZenith; uniform float uFogDensity, uNight;
      varying float vDist;
      void main() {
        // at night a wire is a silhouette, darker than the sky behind it (a fixed navy was ten
        // times the night zenith's light: the wires glowed like searchlights)
        vec3 c = mix(vec3(0.16, 0.15, 0.17), min(vec3(0.05, 0.06, 0.1), uSkyZenith * 0.6), uNight);
        float f = 1.0 - exp(-vDist * (uFogDensity * 2.0 + 0.004));
        gl_FragColor = vec4(mix(c, uFogColor, f), 1.0 - f * 0.9);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
/** Segments (x0 y0 z0 x1 y1 z1 …) → the ribbon geometry wireMaterial expands on screen. */
export function wireGeometry(seg: number[]) {
  const n = seg.length / 6;
  const pos = new Float32Array(n * 18), oth = new Float32Array(n * 18), side = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const a = seg.slice(i * 6, i * 6 + 3), b = seg.slice(i * 6 + 3, i * 6 + 6);
    // corners: p0 left(+1), p0 right(-1), p1 left(-1), p1 right(+1) — the far end's "other" points back
    const V4: [number[], number[], number][] = [[a, b, 1], [a, b, -1], [b, a, -1], [b, a, 1]];
    [0, 1, 2, 1, 3, 2].forEach((k, j) => {
      const [p, o, sd] = V4[k], v = i * 6 + j;
      pos.set(p, v * 3);
      oth.set(o, v * 3);
      side[v] = sd;
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOther', new THREE.BufferAttribute(oth, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.computeBoundingSphere();
  return g;
}

// 2 m/px mask of paved / sandy / built-over ground where nothing should grow or stand.
function pavedMask(world: World, zone: { x0: number; z0: number; x1: number; z1: number }) {
  const { json } = world;
  const w = Math.ceil((zone.x1 - zone.x0) / 2), h = Math.ceil((zone.z1 - zone.z0) / 2);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })! as CanvasRenderingContext2D;
  ctx.setTransform(0.5, 0, 0, 0.5, -zone.x0 * 0.5, -zone.z0 * 0.5);
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const r of json.roads) {
    if (r.lod) continue;
    const p = unpackPts(r.p);
    ctx.beginPath();
    p.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.lineWidth = r.w + (RANK[r.c] ? 3 : 1.2);
    ctx.stroke();
  }
  for (const a of json.areas) {
    if (!['parking', 'plaza', 'beach', 'pier', 'pool', 'pitch', 'marina'].includes(a.c)) continue;
    ctx.beginPath();
    for (const ring of a.o) unpackPts(ring).forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.fill();
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return (x: number, z: number) => {
    const i = Math.floor((x - zone.x0) / 2), j = Math.floor((z - zone.z0) / 2);
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    return data[(j * w + i) * 4] > 60;
  };
}

/** The land cover the map draws (WorldCover's classes: 10 tree, 20 shrub, 30 grass), from the tile's
 *  own OSM areas — woods and forests, scrub and heath, parks, lawns and golf — at 4 m; 0 where it
 *  draws none. A streamed cell's ground layer comes from the DEM, whose cover is grassland everywhere
 *  (dem.ts demLayer): without this the tree scan planted a forest a grassland's 5% (Longmire, inside
 *  Mount Rainier's old growth, stood on an open lawn). */
function areaCoverMask(world: World, zone: { x0: number; z0: number; x1: number; z1: number }) {
  // (polygons, not a canvas: a point a 9 m scan cell — the big rings tested by row, ringTester)
  type R = { b: [number, number, number, number]; at: (x: number, z: number) => boolean };
  const ring = (f: number[]): R => {
    const r = unpackPts(f);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    return { b: [x0, z0, x1, z1], at: r.length > 64 ? ringTester(r, zone.z0 - 8, zone.z1 + 8) : (x, z) => pointInRing(x, z, r) };
  };
  const inR = (q: R, x: number, z: number) => x >= q.b[0] && x <= q.b[2] && z >= q.b[1] && z <= q.b[3] && q.at(x, z);
  // (strongest first: a wood inside a park is a wood)
  const CODE: Record<string, number> = { wood: 10, scrub: 20, wetland: 20, grass: 30, golf: 30, pitch: 30 };
  const areas = world.json.areas
    .filter((a) => CODE[a.c])
    .map((a) => ({ code: CODE[a.c], o: a.o.map(ring), i: a.i.map(ring) }))
    .filter((a) => a.o.some((q) => q.b[2] >= zone.x0 && q.b[0] <= zone.x1 && q.b[3] >= zone.z0 && q.b[1] <= zone.z1))
    .sort((p, q) => p.code - q.code);
  return (x: number, z: number) => {
    for (const a of areas) if (a.o.some((q) => inR(q, x, z)) && !a.i.some((q) => inR(q, x, z))) return a.code;
    return 0;
  };
}

// Night halos around lamp heads and lanterns (soft wet blooms, additive). Module-level so the
// tile worker's packed objects can be rebuilt with the same material on the main thread.
export function haloMaterial(size: number, color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uLampPower: U.uLampPower, uSize: { value: size }, uColor: { value: color }, uTime: U.uTime },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * 900.0 / -mv.z, 2.0, 220.0);
        vFade = clamp(1.0 - (-mv.z) / 2500.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLampPower, uTime;
      uniform vec3 uColor;
      varying float vFade;
      ${GLSL_NOISE}
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        float rag = 0.85 + 0.3 * vnoise(d * 7.0 + 3.0);
        float a = smoothstep(1.0 * rag, 0.0, r);
        a = a * a * uLampPower * vFade;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function haloPoints(pts: THREE.Vector3[], size: number, color: THREE.Color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  const pts3 = new THREE.Points(g, haloMaterial(size, color));
  pts3.renderOrder = 8;
  pts3.frustumCulled = false;
  return pts3;
}

// A clipped hedge run (3.4 × 0.85 × 0.55 m, same footprint the old box had): overlapping
// squashed blobs with a gently lumpy skin and a flatter top — reads as foliage, not a crate.
// A 3.2 m run of picket fence along x (the hedge's footprint): pointed pickets, two rails, end posts.
function picketGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const x = -1.52 + i * 0.16;
    parts.push(new THREE.BoxGeometry(0.075, 0.9, 0.022).translate(x, 0.45, 0));
    parts.push(new THREE.ConeGeometry(0.053, 0.08, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.3).translate(x, 0.94, 0));
  }
  for (const y of [0.25, 0.7]) parts.push(new THREE.BoxGeometry(3.2, 0.07, 0.035).translate(0, y, 0.03));
  for (const x of [-1.6, 1.6]) parts.push(new THREE.BoxGeometry(0.1, 1.05, 0.1).translate(x, 0.52, 0.03));
  return colored(mergeGeometries(parts.map((p) => p.toNonIndexed())), 0xffffff);
}
let hedgeCache: THREE.BufferGeometry | null = null;
function hedgeGeo() {
  if (hedgeCache) return hedgeCache.clone();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.IcosahedronGeometry(0.5, 1);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const n = 1 + 0.12 * Math.sin(x * 9.1 + i * 1.7) * Math.cos(z * 7.3 + y * 5.1);
      pos.setXYZ(k, x * 0.95 * n, Math.min(y, 0.36) * 0.95 * n, z * 0.6 * n);
    }
    g.computeVertexNormals();
    parts.push(g.translate((-1.36 + i * 0.68) * 0.86, 0.42, 0).scale(1, 1, 1));
  }
  hedgeCache = mergeGeometries(parts); // (icosahedra come unindexed: no copy, no console warning)
  hedgeCache.computeVertexNormals();
  return hedgeCache.clone();
}

/** Built cover over the 3×3 neighbourhood of 80 m cells around (x, z): the footprint share of
 *  the ground and the area-weighted mean height. */
export function builtField(buildings: { r: number[]; h: number; pt?: 1; lf?: number }[]) {
  const C = 80, cells = new Map<number, [number, number]>();
  const key = (i: number, j: number) => i * 73856093 + j;
  for (const b of buildings) {
    if (b.pt) continue; // parts are inside their outline — count the building once
    let a = 0, cx = 0, cz = 0;
    const r = b.r, n = r.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2] / 10, zi = r[i * 2 + 1] / 10, xj = r[j * 2] / 10, zj = r[j * 2 + 1] / 10;
      a += (xj - xi) * (zj + zi);
      cx += xi;
      cz += zi;
    }
    a = Math.abs(a / 2);
    const k = key(Math.floor(cx / n / C), Math.floor(cz / n / C));
    const c = cells.get(k) ?? [0, 0];
    c[0] += a;
    c[1] += a * (b.h + (b.lf ?? 0));
    cells.set(k, c);
  }
  const memo = new Map<number, [number, number]>();
  return (x: number, z: number): [number, number] => {
    const i = Math.floor(x / C), j = Math.floor(z / C), k = key(i, j);
    let v = memo.get(k);
    if (v === undefined) {
      let A = 0, AH = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const c = cells.get(key(i + di, j + dj)); if (c) (A += c[0]), (AH += c[1]); }
      v = [A / (9 * C * C), A > 0 ? AH / A : 0];
      memo.set(k, v);
    }
    return v;
  };
}
/** Is (x, z) in a dense core — blocks tall and close (footprint cover > 30 %, mean height
 *  > 16 m over the 3×3 neighbourhood of 80 m cells)? There the wires run underground. */
export function urbanCore(buildings: { r: number[]; h: number; pt?: 1; lf?: number }[]) {
  const f = builtField(buildings);
  return (x: number, z: number) => { const [cover, h] = f(x, z); return cover > 0.3 && h > 16; };
}

export function buildProps(world: World, walk: WalkWorld, pierSegs: { a: P; b: P; w: number; gen?: 'slip' | 'dock' }[], extras: { mailboxes?: Mailbox[]; drives?: Drive[]; doors?: Door[]; ctx?: WorldJson; box?: Box; hood?: (x: number, z: number) => HoodClass; berths?: Berth[] } = {}) {
  const hoodAt = extras.hood ?? (() => 'suburb' as HoodClass);
  const { json, terrain } = world;
  const S = json.slice; // region slice: lamp-map compositor box
  // Placement gate: the detail zone (the backdrop for baked tiles, cell+margin for synthetic
  // and real-lite ones — so props render everywhere a tile is mounted at detail).
  const DZ = detailBox(json);
  const inSlice = (x: number, z: number, m = 0) => x > DZ.x0 - m && x < DZ.x1 + m && z > DZ.z0 - m && z < DZ.z1 + m;
  // the tile's own cell, `m` inside its edge (no box given: anywhere) — for what the tile's own
  // buildings put round them, which must not stand in a neighbour's doorway it can't see
  const OB = extras.box;
  const ownGround = (x: number, z: number, m = 0) => !OB || (x > OB.x0 + m && x < OB.x1 - m && z > OB.z0 + m && z < OB.z1 - m);
  const group = new THREE.Group();
  group.name = 'props';
  const rng = makeRng(7);
  // The paved/blocked masks must see EVERY entity — margin-context roads (own: 0) are
  // stripped from `json` by prim(), but a tree dropped on a neighbour-owned road is still
  // a tree in the road. ctx carries the unfiltered tile json; box bounds the tree scan to
  // this tile's own area so overlapping scan zones never double-spawn the same tree.
  const ctxJson = extras.ctx ?? json;
  const kerbNear = carriagewaysNear(ctxJson.roads); // (posts step out of the carriageways: offCarriageway)
  let junctions: Junction[] = [];
  // Cap the mask canvas at the slice + margin: legacy regions hand us box=backdrop, which
  // would otherwise rasterize a ~12 km canvas (hundreds of MB) in the worker.
  const big = { x0: S.x0 - 250, z0: S.z0 - 250, x1: S.x1 + 250, z1: S.z1 + 250 };
  const maskZone = extras.box
    ? { x0: extras.box.x0 - 8, z0: extras.box.z0 - 8, x1: extras.box.x1 + 8, z1: extras.box.z1 + 8 }
    : big;
  const paved = pavedMask({ json: ctxJson, terrain }, maskZone);
  const mapCover = areaCoverMask({ json: ctxJson, terrain }, maskZone);
  /** Walls only the builders see — the tile's scratch walk's (pack.ts RecWalk), not shipped with it:
   *  a car that comes and goes keeps its stall clear of what's placed after it, and the main thread
   *  walls it only while it's there (kerbCars.ts). */
  const scratchOnly = (fn: () => void) => {
    const w = walk as WalkWorld & { recording?: boolean }, was = w.recording;
    if (was !== undefined) w.recording = false;
    try { fn(); } finally { if (was !== undefined) w.recording = was; }
  };

  // ---------- utility poles, wires, lamps ----------
  // Dense cores bury their wires: where blocks stand tall and close (a downtown, not a main
  // street of two-storey shops), steel streetlight masts line both kerbs instead of wooden
  // poles. Read from the buildings themselves: 80 m cells of footprint cover and mean height.
  const built = builtField(ctxJson.buildings);
  const urban = (x: number, z: number) => { const [cover, h] = built(x, z); return cover > 0.3 && h > 16; };
  const poleMats: THREE.Matrix4[] = [];
  const mastMats: THREE.Matrix4[] = [];
  const armMats: THREE.Matrix4[] = [];
  const lampHeads: THREE.Vector3[] = [];
  const lampGround: [number, number][] = [];
  const wire: number[] = [];
  const q = new THREE.Quaternion();
  const roads = json.roads.filter((r) => !r.lod && !r.br && (RANK[r.c] ?? 0) >= 2) as Road[];
  // Mapped street lamps (`highway=street_lamp`): a mast exactly where the map puts each one, its
  // arm over the nearest street — and the spaced-out lamps below step aside within 18 m of one
  // (a street the map lights is lit as mapped, not twice).
  const allLamps = ctxJson.points.filter((p) => p.c === 'lamp');
  const lampNear = (x: number, z: number) => allLamps.some((p) => Math.abs(p.x - x) < 18 && Math.abs(p.z - z) < 18);
  for (const r of roads) {
    const rank = RANK[r.c];
    const p = unpackPts(r.p);
    const side = hash01(r.p[0] * 31 + r.p[1]) < 0.5 ? 1 : -1;
    const off = (r.w / 2 + (rank >= 5 ? 3.8 : 1.6)) * side;
    const spacing = rank >= 5 ? 34 : 38;
    let carry = spacing * 0.35;
    let prev: { top: THREE.Vector3; ang: number } | null = null;
    let count = 0;
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      const nx = tz, nz = -tx;
      let s = carry;
      while (s < L) {
        let x = ax + tx * s + nx * off, z = az + tz * s + nz * off;
        s += spacing;
        if (!inSlice(x, z, 20) || terrain.sdfAt(x, z) < 1.5) { prev = null; continue; }
        // a porch, a sign or a wall where the pole would go: slide it a few metres along the kerb;
        // failing that, skip it and let the wires span to the next pole (a gap, not a dead end)
        if (walk.blocked(x, z, 0.8)) {
          const alt = [-4, 4, -8, 8].find((d) => !walk.blocked(x + tx * d, z + tz * d, 0.8));
          if (alt === undefined) { if (prev && Math.hypot(prev.top.x - x, prev.top.z - z) > 80) prev = null; continue; }
          (x += tx * alt), (z += tz * alt);
        }
        const g = terrain.heightAt(x, z);
        const ang = Math.atan2(tz, tx);
        if (urban(x, z)) {
          // a mast here and one on the far kerb half a span back, each lamp over the street
          prev = null;
          const off2 = r.w / 2 + 1.2;
          for (const [px, pz, sd] of [[ax + tx * (s - spacing) + nx * off2 * side, az + tz * (s - spacing) + nz * off2 * side, side], [ax + tx * (s - spacing * 1.5) - nx * off2 * side, az + tz * (s - spacing * 1.5) - nz * off2 * side, -side]] as const) {
            if (s - spacing * 1.5 < 0 && sd !== side) continue;
            if (!inSlice(px, pz, 20) || terrain.sdfAt(px, pz) < 1.5 || walk.blocked(px, pz, 0.6) || lampNear(px, pz)) continue;
            const gp = terrain.heightAt(px, pz), dir = -sd;
            mastMats.push(new THREE.Matrix4().compose(V(px, gp, pz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang), V(1, 1, 1)));
            armMats.push(new THREE.Matrix4().compose(V(px, gp, pz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang + (dir > 0 ? Math.PI : 0)), V(1, 1, 1)));
            lampHeads.push(V(px + nx * dir * 2.2, gp + 8.05, pz + nz * dir * 2.2));
            lampGround.push([px + nx * dir * 4.5, pz + nz * dir * 4.5]);
            walk.addLoop([[px - 0.16, pz - 0.16], [px + 0.16, pz - 0.16], [px + 0.16, pz + 0.16], [px - 0.16, pz + 0.16]]);
          }
          continue;
        }
        q.setFromAxisAngle(V(0, 1, 0), -ang);
        poleMats.push(new THREE.Matrix4().compose(V(x, g, z), q, V(1, 1, 1)));
        const top = V(x, g + 9.6, z);
        if (prev) {
          for (const [dv, dy] of [[-1.05, 0], [1.05, 0], [0, -2.0]] as const) {
            const ox = nx * dv, oz = nz * dv;
            const a = V(prev.top.x + ox, prev.top.y + dy, prev.top.z + oz), b = V(top.x + ox, top.y + dy, top.z + oz);
            const span = a.distanceTo(b);
            const sag = 0.012 * span + 0.15;
            const N = 8;
            for (let k = 0; k < N; k++) {
              const t0 = k / N, t1 = (k + 1) / N;
              const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
              p0.y -= sag * 4 * t0 * (1 - t0);
              p1.y -= sag * 4 * t1 * (1 - t1);
              wire.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            }
          }
        }
        prev = { top, ang };
        // cobra-head lamp on some poles, reaching over the street
        if (count++ % (rank >= 3 ? 2 : 3) === 0 && !lampNear(x, z)) {
          const dir = -side;
          // the arm's local +z must point where the head (and its glow + pool) goes: rotating +z by
          // −ang gives (−tz, tx) = −n, so the side toward +n needs the extra half turn
          const hx = x + nx * dir * 2.2, hz = z + nz * dir * 2.2;
          armMats.push(new THREE.Matrix4().compose(V(x, g, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang + (dir > 0 ? Math.PI : 0)), V(1, 1, 1)));
          lampHeads.push(V(hx, g + 8.05, hz));
          lampGround.push([x + nx * dir * 4.5, z + nz * dir * 4.5]);
        }
      }
      carry = s - L;
    }
  }
  {
    const near = streetsNear(ctxJson.roads);
    for (const p of json.points) {
      if (p.c !== 'lamp' || !inSlice(p.x, p.z) || terrain.sdfAt(p.x, p.z) < 1 || walk.blocked(p.x, p.z, 0.25)) continue;
      // the arm reaches toward the nearest street's centre line (a park lamp: any way)
      let best = 20, bw = 0, dx = 0, dz = 1;
      for (const r of near(p.x, p.z))
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, sx = r.p[i + 2] / 10 - ax, sz = r.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz || 1;
          const t = Math.max(0, Math.min(1, ((p.x - ax) * sx + (p.z - az) * sz) / L2));
          const ex = ax + sx * t - p.x, ez = az + sz * t - p.z, d = Math.hypot(ex, ez);
          if (d >= best) continue;
          (best = d), (bw = r.w);
          if (d > 0.3) (dx = ex / d), (dz = ez / d);
          else {
            // (a lamp node on the street's own line: to one kerb, its arm back over the street)
            const L = Math.sqrt(L2), sd = hash01(Math.floor(p.x * 5) ^ Math.floor(p.z * 3)) < 0.5 ? 1 : -1;
            (dx = (sz / L) * sd), (dz = (-sx / L) * sd);
          }
        }
      if (best === 20) { const a = hash01(Math.floor(p.x * 7) ^ Math.floor(p.z * 13)) * Math.PI * 2; (dx = Math.sin(a)), (dz = Math.cos(a)); }
      // (a node a metre into the carriageway — or a width that counts the parking lanes — stands
      // the mast back on the kerb)
      const back = best < 20 && best < bw / 2 + 0.3 ? best - bw / 2 - 0.6 : 0;
      const lx = p.x + dx * back, lz = p.z + dz * back;
      if (back && (walk.blocked(lx, lz, 0.25) || terrain.sdfAt(lx, lz) < 1)) continue;
      const g = terrain.heightAt(lx, lz), yaw = Math.atan2(dx, dz);
      mastMats.push(new THREE.Matrix4().compose(V(lx, g, lz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
      armMats.push(new THREE.Matrix4().compose(V(lx, g, lz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
      lampHeads.push(V(lx + dx * 2.2, g + 8.05, lz + dz * 2.2));
      lampGround.push([lx + dx * 4.5, lz + dz * 4.5]);
      walk.addLoop([[lx - 0.16, lz - 0.16], [lx + 0.16, lz - 0.16], [lx + 0.16, lz + 0.16], [lx - 0.16, lz + 0.16]]);
    }
  }
  // Mapped power lines (OSM power=line): the tall wooden H-less poles of a sub-transmission run
  // — two crossarms, six wires — standing on the line's own nodes (mappers put one at every
  // pole), subdivided where a mapped span runs long. Distribution lines along streets
  // (minor_line) are the procedural street poles above.
  const hvMats: THREE.Matrix4[] = [];
  for (const l of json.lines) {
    if (l.c !== 'power') continue;
    const raw = unpackPts(l.p);
    const pts: [number, number][] = [];
    for (let i = 0; i < raw.length; i++) {
      if (i > 0) {
        const [ax, az] = raw[i - 1], [bx, bz] = raw[i], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 75);
        for (let k = 1; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      pts.push(raw[i]);
    }
    let prev: THREE.Vector3[] | null = null;
    for (let i = 0; i < pts.length; i++) {
      const q = offCarriageway(kerbNear, pts[i][0], pts[i][1], 0.2); // (a node mapped a metre into the street)
      if (!q) { prev = null; continue; }
      const [x, z] = q;
      if (!inSlice(x, z, 30) || terrain.sdfAt(x, z) < 0.5 || walk.blocked(x, z, 0.5)) { prev = null; continue; }
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const g = terrain.heightAt(x, z);
      hvMats.push(new THREE.Matrix4().compose(V(x, g, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang), V(1, 1, 1)));
      walk.addLoop([[x - 0.2, z - 0.2], [x + 0.2, z - 0.2], [x + 0.2, z + 0.2], [x - 0.2, z + 0.2]]);
      const nx = -Math.sin(ang), nz = Math.cos(ang); // across the line
      const tops = [[-1.45, 14.35], [0, 14.35], [1.45, 14.35], [-1.2, 12.35], [0.6, 12.35], [1.2, 12.35]].map(([o, y]) => V(x + nx * o, g + y, z + nz * o));
      if (prev) {
        for (let w = 0; w < tops.length; w++) {
          const A = prev[w], B = tops[w], span = A.distanceTo(B), sag = 0.018 * span + 0.2;
          if (span > 140) continue;
          for (let k = 0; k < 8; k++) {
            const t0 = k / 8, t1 = (k + 1) / 8, p0 = A.clone().lerp(B, t0), p1 = A.clone().lerp(B, t1);
            p0.y -= sag * 4 * t0 * (1 - t0);
            p1.y -= sag * 4 * t1 * (1 - t1);
            wire.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
          }
        }
      }
      prev = tops;
    }
  }
  // Streetcar and light-rail lines (OSM railway=tram / light_rail): the overhead contact wire on
  // slim steel poles with a bracket arm every ~30 m, down the side of the street it runs in, and
  // the rails set into the pavement. Trolleybus streets (OSM trolley_wire on the road): a pair of
  // wires over each direction's lane, on bracket poles at the kerb.
  const tramMats: THREE.Matrix4[] = [], rails: number[] = [];
  for (const l of json.lines) {
    if (l.c !== 'tram' && l.c !== 'trolley') continue;
    const tram = l.c === 'tram', w = l.w ?? 9;
    const offs = tram ? [0] : [-w / 4 - 0.3, -w / 4 + 0.3, w / 4 - 0.3, w / 4 + 0.3];
    const poleOffs = tram ? [4.2, 5.2, 3.4] : [w / 2 + 0.6, w / 2 + 1.3];
    const pts = unpackPts(l.p);
    let carry = 12, prevTops: THREE.Vector3[] | null = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
      // the rails: two steel strips at standard gauge, set flush in the street
      if (tram)
        for (let a = 0; a < L; a += 4) {
          const b = Math.min(L, a + 4);
          for (const g of [-0.72, 0.72]) {
            const x0 = ax + tx * a + nx * g, z0 = az + tz * a + nz * g, x1 = ax + tx * b + nx * g, z1 = az + tz * b + nz * g;
            if (!inSlice(x0, z0, 10)) continue;
            const y0 = terrain.heightAt(x0, z0) + 0.035, y1 = terrain.heightAt(x1, z1) + 0.035, hw = 0.05;
            // wound counter-clockwise seen from above (faces up)
            rails.push(x0 - nx * hw, y0, z0 - nz * hw, x1 + nx * hw, y1, z1 + nz * hw, x1 - nx * hw, y1, z1 - nz * hw);
            rails.push(x0 - nx * hw, y0, z0 - nz * hw, x0 + nx * hw, y0, z0 + nz * hw, x1 + nx * hw, y1, z1 + nz * hw);
          }
        }
      let t = carry;
      for (; t < L; t += 30) {
        const cx = ax + tx * t, cz = az + tz * t; // on the track / the road's centre line
        const gy = terrain.heightAt(cx, cz) + 5.8;
        const tops = offs.map((o) => V(cx + nx * o, gy, cz + nz * o));
        if (prevTops && prevTops[0].distanceTo(tops[0]) < 45) {
          const sag = 0.15;
          for (let q = 0; q < tops.length; q++)
            for (let k = 0; k < 6; k++) {
              const t0 = k / 6, t1 = (k + 1) / 6, p0 = prevTops[q].clone().lerp(tops[q], t0), p1 = prevTops[q].clone().lerp(tops[q], t1);
              p0.y -= sag * 4 * t0 * (1 - t0);
              p1.y -= sag * 4 * t1 * (1 - t1);
              wire.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            }
        }
        prevTops = tops;
        // the pole stands off the track at the kerb side, its arm reaching back over the wire
        for (const off of poleOffs) {
          const px = cx + nx * off, pz = cz + nz * off;
          if (!inSlice(px, pz, 10) || walk.blocked(px, pz, 0.4) || terrain.sdfAt(px, pz) < 1) continue;
          tramMats.push(new THREE.Matrix4().compose(V(px, terrain.heightAt(px, pz), pz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(-nx, -nz)), V(1, 1, off / 4.2)));
          walk.addLoop([[px - 0.14, pz - 0.14], [px + 0.14, pz - 0.14], [px + 0.14, pz + 0.14], [px - 0.14, pz + 0.14]]);
          break;
        }
      }
      carry = t - L;
    }
  }
  if (rails.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rails, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(rails.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const m = new THREE.Mesh(colored(g, 0x57544e), propMaterial());
    m.name = 'street:rails';
    group.add(m);
  }
  if (tramMats.length) {
    const g = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.1, 0.13, 6.3, 7).translate(0, 3.15, 0), 0x4a4f4c),
      colored(new THREE.BoxGeometry(0.07, 0.07, 4.2).translate(0, 6.05, 2.1), 0x4a4f4c),
      colored(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5).translate(0, 5.9, 4.2), 0x9fb0a8),
    ]);
    const im = new THREE.InstancedMesh(g, propMaterial(), tramMats.length);
    tramMats.forEach((m, i) => im.setMatrixAt(i, m));
    im.name = 'poles:tram';
    im.layers.enable(1);
    group.add(im);
  }
  if (hvMats.length) {
    const hv = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.15, 0.22, 15.2, 7).translate(0, 7.6, 0), 0x5a4c3f),
      colored(new THREE.BoxGeometry(0.14, 0.14, 3.4).translate(0, 14.2, 0), 0x55483c),
      colored(new THREE.BoxGeometry(0.14, 0.14, 2.9).translate(0, 12.2, 0), 0x55483c),
      ...[[-1.45, 14.3], [0, 14.3], [1.45, 14.3], [-1.2, 12.3], [0.6, 12.3], [1.2, 12.3]].map(([o, y]) => colored(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5).translate(0, y + 0.15, o), 0x9fb0a8)),
    ]);
    const hvm = new THREE.InstancedMesh(hv, propMaterial(), hvMats.length);
    hvMats.forEach((m, i) => hvm.setMatrixAt(i, m));
    hvm.name = 'poles:power-line';
    hvm.layers.enable(1);
    group.add(hvm);
  }

  const poleGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.17, 10.2, 7).translate(0, 5.1, 0), 0x5e5043),
    colored(new THREE.BoxGeometry(0.12, 0.12, 2.5).translate(0, 9.6, 0), 0x5a4c3f),
    colored(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 5).translate(0, 9.8, -1.05), 0x9fb0a8),
    colored(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 5).translate(0, 9.8, 1.05), 0x9fb0a8),
    colored(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 8).translate(0.3, 8.3, 0), 0x6f7479), // transformer can
  ]);
  const poles = new THREE.InstancedMesh(poleGeo, propMaterial(), poleMats.length);
  poleMats.forEach((m, i) => poles.setMatrixAt(i, m));
  poles.layers.enable(1);
  group.add(poles);
  if (mastMats.length) {
    // steel streetlight mast (dark green-grey, fluted base) carrying the same cobra-head arm
    const mastGeo = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.09, 0.14, 8.4, 8).translate(0, 4.2, 0), 0x3c4440),
      colored(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 8).translate(0, 0.45, 0), 0x353b38),
    ]);
    const masts = new THREE.InstancedMesh(mastGeo, propMaterial(), mastMats.length);
    mastMats.forEach((m, i) => masts.setMatrixAt(i, m));
    masts.name = 'lamp:masts';
    masts.layers.enable(1);
    group.add(masts);
  }

  const armGeo = mergeGeometries([
    colored(new THREE.BoxGeometry(0.08, 0.08, 2.2).translate(0, 8.25, 1.1), 0x8d9296),
    colored(new THREE.BoxGeometry(0.34, 0.14, 0.62).translate(0, 8.12, 2.2), 0x9aa0a4),
  ]);
  const arms = new THREE.InstancedMesh(armGeo, propMaterial(), armMats.length);
  armMats.forEach((m, i) => arms.setMatrixAt(i, m));
  arms.name = 'lamp:arms';
  group.add(arms);
  // glowing lenses
  const lens = new THREE.InstancedMesh(colored(new THREE.BoxGeometry(0.3, 0.05, 0.5), 0xfff0d0), propMaterial({ emissive: new THREE.Color(1.0, 0.72, 0.4), emissiveNight: true }), lampHeads.length);
  // the lens sits under the head, turned with its arm
  const lensAt = new THREE.Matrix4().makeTranslation(0, 8.03, 2.2);
  armMats.forEach((am, i) => lens.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(am, lensAt)));
  lens.name = 'lamp:lens';
  group.add(lens);

  const wires = new THREE.Mesh(wireGeometry(wire), wireMaterial());
  wires.frustumCulled = false;
  wires.renderOrder = 6;
  group.add(wires);

  // Lamp pools: the ground points ship to the stream, which paints one walker-centred light
  // map from every mounted tile's lamps (so pools follow you past the bake too).
  // (halos + the pool list are made at the end: main-street posts add lamps further down)

  // ---------- trees ----------
  const look0 = () => activeStyle();
  // kinds: 0 round deciduous, 1 tall oak, 2 shrub, 3 pine, 4 spruce
  // kinds: 0 round · 1 oak · 2 shrub · 3 pine · 4 spruce · 5 palm · 6 birch · 7 mesquite · 8 fan palm (assets/flora.ts), each in
  // TREE_VARIANTS grown variants; v is position-hashed so neighbouring tiles agree.
  /** `meas`: the survey measured it (LiDAR) — a real tree, never dropped for a building's sake. */
  const trees: { m: THREE.Matrix4; c: THREE.Color; k: number; v: number; meas?: 1 }[] = [];
  // No tree grows on a structure: inside a building's outline (a tower built after the survey, a
  // roof garden's planters read as crowns) or within 15 m of a mast, a chimney or a water tower
  // (a LiDAR survey reads a TV mast as a 60 m tree — Queen Anne grew three 60 m cypresses).
  const STRUCTS = ctxJson.points.filter((p) => p.c === 'mast' || p.c === 'chimney' || p.c === 'water_tower');
  const onStructure = (x: number, z: number) => walk.buildingAt(x, z) >= 0 || STRUCTS.some((p) => Math.abs(p.x - x) < 15 && Math.abs(p.z - z) < 15 && Math.hypot(p.x - x, p.z - z) < 15);
  const tropical = look0().climate === 'tropical', aridCoast = look0().climate === 'arid' || look0().climate === 'mediterranean';
  const birchy = look0().climate === 'boreal' || look0().climate === 'continental';
  const desert = look0().climate === 'arid';
  // the region re-reads a broadleaf as its own tree: palms where it's warm by the sea, birches up north
  // Past round and oak, the broadleaf mix of the region and the spot: maples and elms up north,
  // magnolias in the South, cherries in PNW and town yards, columnar poplars (on a Mediterranean
  // hill, the cypress), willows where fresh water is close. Indices are TREE_KINDS'.
  const MAPLE = 9, WILLOW = 10, ELM = 11, POPLAR = 12, MAGNOLIA = 13, CHERRY = 14;
  const FIR = 15, CEDAR = 16, HEMLOCK = 17, SITKA = 18, ALDER = 19, VINEMAPLE = 20;
  const LIVEOAK = 21, PLATEAUOAK = 22, COASTOAK = 23;
  const WHITEPINE = 24, PONDEROSA = 25, LODGEPOLE = 26, ASPEN = 32, WILLOWSHRUB = 33, SNAG = 34;
  // the northern and mountain conifers (package #3): grown forms like the Northwest's (open-grown, a
  // forest tree, an old one), and the needled kinds a town keeps only where the region is conifer
  // country
  const NORTH_CONIFER = new Set([24, 25, 26, 27, 28, 29, 30, 31]);
  const NEEDLE_K = new Set(TREE_KINDS.map((kk, i) => (NEEDLED.has(kk) || kk === 'cedar' ? i : -1)).filter((i) => i >= 0));
  const isLiveOak = (k: number) => k === LIVEOAK || k === PLATEAUOAK || k === COASTOAK;
  // the region's live oak, if it has one (flora.ts broadMix: the South's, the Hill Country's plateau
  // oak, California's coast live oak) — a mapped "oak" there is most likely it
  const clim = look0().climate;
  // The westside Northwest (styles.ts westside: west of the Cascades' crest, not a dry-side
  // ecoregion): its conifers are Douglas fir, western hemlock and western redcedar — Sitka spruce in
  // the outer coast's fog belt, within ~30 km of the open Pacific (west of about 123.6°W in
  // Washington and Oregon) — never the generic spruce or pine (docs/regional-life/16-pnw.md).
  const westside = isWestside(look0());
  const NW_CONIFER = new Set([FIR, CEDAR, HEMLOCK, SITKA]);
  const nwConifer = (x: number, z: number) => {
    const u = hashf(Math.floor(x * 2.3) * 7919 + Math.floor(z * 1.9) * 104729 + 61);
    const fog = toLatLon(json.origin, x, z)[1] < -123.6;
    return [FIR, HEMLOCK, CEDAR, SITKA][pickWeighted([5, 3, 2.4, fog ? 4.5 : 0], u)];
  };
  /** A Northwest conifer's grown form: the forest's bare-trunked ones (an old giant one in three)
   *  under a closed canopy, the open-grown one (foliage to the ground) in yards and parks. */
  const nwForm = (x: number, z: number, forest: boolean) => forest ? (variantAt(x, z, 10, 13) < 3 ? 2 : 1) : variantAt(x, z, 10, 13) < 7 ? 0 : 1;
  // The region's own conifers for a scan's generic pine or spruce (flora.ts coniferMix: the West's by
  // elevation band, the Northeast's white pine, red spruce, balsam fir and hemlock, the north woods'),
  // aspen groves (clonal: whole patches of a scan's round trees, aspenShare), willow thickets by fresh
  // water, and the snags that stand dead in a wood (snagShare). Position hashes only: the scan's
  // random sequence stays as it was.
  const cast0 = castOf(look0());
  const latAt = (x: number, z: number) => toLatLon(json.origin, x, z)[0];
  const conifer = (k: number, x: number, z: number) => {
    const mix = coniferMix(cast0, k === 3 ? 'pine' : 'spruce', terrain.heightAt(x, z), latAt(x, z), terrain.oceanDistAt(x, z) < 3000);
    if (!mix.length) return -1;
    return TREE_KINDS.indexOf(mix[pickWeighted(mix.map(([, w]) => w), hashf(Math.floor(x * 2.1) * 104729 + Math.floor(z * 1.7) * 7919 + 503))][0]);
  };
  const aspenAt = (x: number, z: number) => {
    const share = aspenShare(cast0, terrain.heightAt(x, z), latAt(x, z));
    // (a grove is one clone: a 35 m patch where nearly every round tree is an aspen)
    return share > 0 && hashf(Math.floor(x / 35) * 7919 + Math.floor(z / 35) * 104729 + 401) < share * 1.4 && hashf(Math.floor(x * 3.7) * 7919 + Math.floor(z * 2.3) * 104729 + 409) < 0.85;
  };
  const thickets = willowThickets(cast0);
  // (the region's own in the lower 48 — flora.ts broadMix, from docs/regional-life/ — else the climate's)
  const BROAD: [number, number][] = broadMix(castOf(look0())).map(([kind, w]) => [TREE_KINDS.indexOf(kind), w]);
  const regionLiveOak = BROAD.find(([kk, w]) => w > 0 && (kk === LIVEOAK || kk === PLATEAUOAK || kk === COASTOAK))?.[0] ?? -1;
  /** `ratio`: a measured crown's radius / height (LiDAR) — slim reads columnar, broad spreading. */
  const broad = (k: number, x: number, z: number, ratio = 0) => {
    const u = hashf(Math.floor(x * 1.7) * 104729 + Math.floor(z * 2.3) * 7919 + 17), u2 = hashf(Math.floor(x * 2.9) * 7919 + Math.floor(z * 1.3) * 104729 + 29);
    if (clim !== 'arid' && clim !== 'polar' && terrain.sdfAt(x, z) < 28 && terrain.oceanDistAt(x, z) > 250 && u < 0.4) return WILLOW; // a bank
    if (u2 < 0.35) return k; // (the caller's round / oak stands)
    const ws = BROAD.map(([kk, w]) => w * (!ratio ? 1 : ratio < 0.3 ? (kk === POPLAR ? 6 : kk === ELM || kk === 1 || kk === CHERRY || isLiveOak(kk) ? 0.2 : 1) : ratio > 0.45 ? (kk === POPLAR || kk === MAGNOLIA ? 0.1 : kk === 1 || kk === ELM ? 1.8 : isLiveOak(kk) ? 2.4 : 1) : 1));
    return BROAD[pickWeighted(ws, u)][0];
  };
  const regional = (k: number, x: number, z: number, ratio = 0) => {
    if (westside && (k === 3 || k === 4)) return nwConifer(x, z);
    // (a low clump under the firs: the vine maple)
    if (westside && k === 2 && hashf(Math.floor(x * 1.3) * 104729 + Math.floor(z * 3.7) * 7919 + 5) < 0.45) return VINEMAPLE;
    if (k === 3 || k === 4) { const c = conifer(k, x, z); if (c >= 0) return c; }
    // (willow thickets crowd the creeks and bogs of the North and the mountains)
    if (k === 2 && thickets && terrain.sdfAt(x, z) < 22 && terrain.oceanDistAt(x, z) > 250 && hashf(Math.floor(x * 2.9) * 104729 + Math.floor(z * 3.1) * 7919 + 211) < 0.6) return WILLOWSHRUB;
    if (k > 1) return k;
    if (k === 0 && aspenAt(x, z)) return ASPEN;
    const u = hashf(Math.floor(x * 3.1) * 7919 + Math.floor(z * 2.7) * 104729);
    // palms by climate: coconut palms in the tropics, Washingtonia fan palms on dry coasts
    if (tropical && u < 0.75) return 5;
    if (aridCoast && terrain.oceanDistAt(x, z) < 1500 && u < 0.4) return 8;
    // the desert's own shade trees: mesquite and palo verde (a few fan palms in town)
    if (desert) return u < 0.14 ? 8 : 7;
    if (birchy && k === 0 && u < 0.35) return 6;
    return broad(k, x, z, ratio);
  };
  // When a tile box is provided the scan only walks cells this tile owns — neighbours cover
  // the rest. Without one (legacy single-tile worlds) it covers slice + margin as before.
  const zone = extras.box ?? { x0: S.x0 - 250, z0: S.z0 - 250, x1: S.x1 + 250, z1: S.z1 + 250 };
  const G = 9;
  const look = activeStyle(); // Phase I: region species mix, density and greens
  const green = look.greens;
  // Nearest point on any nearby road — used to slide mistagged street trees off the carriageway.
  const roadEdge = (x: number, z: number) => {
    let best: { x: number; z: number; w: number; d: number } | null = null;
    for (const r of ctxJson.roads) {
      if (r.lod || r.br) continue;
      const p = unpackPts(r.p);
      for (let i = 0; i + 1 < p.length; i++) {
        const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1];
        const L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - p[i][0]) * dx + (z - p[i][1]) * dz) / L2));
        const qx = p[i][0] + dx * t, qz = p[i][1] + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (!best || d < best.d) best = { x: qx, z: qz, w: r.w, d };
      }
    }
    return best && best.d < 60 ? best : null;
  };
  // LiDAR trees (lidar.ts): where the survey covered the ground, the real trees replace
  // both the WorldCover scan and OSM tree points (they're the same trees, measured).
  const LT = json.trees, LC = json.treeCov, TB = extras.box;
  const lidarCovered = (x: number, z: number) => {
    if (!LC || !TB) return false;
    const I = Math.floor(((x - TB.x0) / (TB.x1 - TB.x0)) * 16), J = Math.floor(((z - TB.z0) / (TB.z1 - TB.z0)) * 16);
    return I >= 0 && J >= 0 && I < 16 && J < 16 && LC[J * 16 + I] === 1;
  };
  for (let z = zone.z0; z < zone.z1; z += G)
    for (let x = zone.x0; x < zone.x1; x += G) {
      // Only cells this tile owns — the scan zones of adjacent tiles overlap the margin, and
      // the rng sequence is identical per tile. Skipping here also spares the ~9x redundant
      // terrain lookups the old S±250 zone spent on cells owned by neighbours.
      if (extras.box && (x < extras.box.x0 || x >= extras.box.x1 || z < extras.box.z0 || z >= extras.box.z1)) continue;
      const jx = x + rng.float() * G, jz = z + rng.float() * G;
      if (lidarCovered(jx, jz)) continue;
      const cov = mapCover(jx, jz) || terrain.coverAt(jx, jz); // (the map's own woods first)
      const beachy = terrain.oceanDistAt(jx, jz) < 90;
      const pr = cov === 10 ? 0.85 : beachy ? 0 : cov === 50 ? 0.035 : cov === 30 ? 0.05 : cov === 20 ? 0.3 : 0;
      // (estate country is old trees round big lawns; an old grid's street trees are mature too)
      const hk = cov === 10 || beachy ? 'suburb' : hoodAt(jx, jz), canopy = hk === 'estate' ? 3.2 : hk === 'grid' ? 1.2 : 1;
      if (rng.float() > pr * look.treeDensity * canopy) continue;
      if (terrain.sdfAt(jx, jz) < 3 || paved(jx, jz) || walk.blocked(jx, jz, 2.2) || onStructure(jx, jz)) continue;
      const g = terrain.heightAt(jx, jz);
      // species from the region's weights; coastal cells lean to wind-shaped pines everywhere
      const coastPine = terrain.oceanDistAt(jx, jz) < 500 && look.trees[3] > 0.5 && rng.float() < 0.35;
      // (a coast pine stays a pine: shore pine on the dunes and headlands)
      let k = coastPine ? 3 : regional(pickWeighted(look.trees, rng.float()), jx, jz);
      // (a westside wood is conifer country: four trees in five Douglas fir, hemlock, cedar or Sitka;
      // the rest its alders, bigleaf maples and vine maples)
      if (westside && cov === 10 && (k === 0 || k === 1) && hashf(Math.floor(jx * 3.3) * 104729 + Math.floor(jz * 2.1) * 7919 + 77) < 0.7) k = nwConifer(jx, jz);
      let v = variantAt(jx, jz, TREE_VARIANTS, 11);
      if (k === MAPLE && v === 2 && !westside) v = 0; // (the bigleaf maple is the Northwest's westside's alone)
      if (NW_CONIFER.has(k) || NORTH_CONIFER.has(k)) v = nwForm(jx, jz, cov === 10);
      // (a wood's dead: the Rockies' beetle-killed lodgepole and spruce, the East's adelgid-killed
      // hemlocks, the drowned trunks of a beaver pond — grey spikes, bare limbs, snapped stumps)
      if (cov === 10 && k !== 2 && k !== WILLOWSHRUB) {
        const wet = terrain.sdfAt(jx, jz) < 30 && terrain.oceanDistAt(jx, jz) > 250;
        if (hashf(Math.floor(jx * 1.3) * 7919 + Math.floor(jz * 1.9) * 104729 + 607) < snagShare(cast0, TREE_KINDS[k], wet)) (v = NEEDLE_K.has(k) ? 0 : wet ? 2 : 1), (k = SNAG);
      }
      // the Northwest's at their real heights: Douglas fir and Sitka spruce 25–48 m in the forest, hemlock
      // and cedar 20–40 m (a yard's 14–30 and 12–26), red alder 12–22 m, vine maple 3.5–7 m
      const hu = rng.float();
      // (the live oaks: the South's 10–18 m in a yard and up to 20 m in a wood, twice as wide; the
      // plateau oak 6–11 m; the coast live oak 8–16 m)
      const h = k === 2 ? 2.4 + hu * 1.6 : k === VINEMAPLE ? 3.5 + hu * 3.5 : k === ALDER ? (cov === 10 ? 12 + hu * 10 : 9 + hu * 7)
        : k === LIVEOAK ? (cov === 10 ? 13 + hu * 7 : 10 + hu * 8) : k === PLATEAUOAK ? 6 + hu * 5 : k === COASTOAK ? (cov === 10 ? 10 + hu * 8 : 8 + hu * 7)
          // (the northern and mountain conifers at their real heights: white pine the tallest of the
          // East, 20–32 m in a wood; ponderosa 18–32; lodgepole 15–24; Engelmann spruce 18–32; red
          // spruce and hemlock 14–28; balsam and subalpine fir smaller; aspen 10–18; willow 1.5–4)
          : k === WHITEPINE || k === PONDEROSA || k === 28 ? (cov === 10 ? 19 + hu * 13 : 11 + hu * 12) : k === LODGEPOLE ? (cov === 10 ? 15 + hu * 9 : 9 + hu * 7)
            : k === 27 || k === 31 ? (cov === 10 ? 15 + hu * 12 : 8 + hu * 9) : k === 29 || k === 30 ? (cov === 10 ? 11 + hu * 9 : 6 + hu * 6)
              : k === ASPEN ? (cov === 10 ? 11 + hu * 7 : 8 + hu * 6) : k === WILLOWSHRUB ? 1.6 + hu * 2.4
                : k === SNAG ? (v === 2 ? 3 + hu * 3 : 8 + hu * 9) // (a snapped beaver-pond trunk 3–6 m; a dead spire or ash its tree's height)
        : k === FIR && !westside ? (cov === 10 ? 18 + hu * 14 : 12 + hu * 10) // (the interior's Douglas fir: 18–32 m, not the westside's giants)
        : k === FIR || k === SITKA ? (cov === 10 ? 25 + hu * 23 : 14 + hu * 16) : k === HEMLOCK || k === CEDAR ? (cov === 10 ? 20 + hu * 20 : 12 + hu * 14)
          : (k >= 3 ? 7 : 8) + hu * 7;
      const s = h / treeMeta(TREE_KINDS[k], v).h;
      const m = new THREE.Matrix4().compose(V(jx, g - 0.2, jz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(s * (0.85 + rng.float() * 0.3), s * (k === 2 ? 1.3 : 1), s * (0.85 + rng.float() * 0.3)));
      const c = new THREE.Color(rng.pick(green));
      if (k === 4) c.lerp(new THREE.Color(0x2e4630), 0.55); // spruces run dark
      else if (rng.float() < 0.12 && !NW_CONIFER.has(k) && !isLiveOak(k)) c.lerp(new THREE.Color(0xb59a3e), 0.45); // first hints of autumn (the live oaks keep theirs)
      trees.push({ m, c, k, v });
    }
  // The map's own species (natural=tree + genus / species / taxon, realTile treeKindOf): a mapped
  // tree is that tree — and a LiDAR crown within 3.5 m of one takes its species (the survey
  // measures it, the map names it). The bigleaf maple is the Northwest's alone.
  const kindOfSp = (sp: string, x: number, z: number): [number, number] => {
    const [name, vs] = sp.split(':');
    if (westside && (name === 'conifer' || name === 'spruce')) return [nwConifer(x, z), nwForm(x, z, mapCover(x, z) === 10)];
    if (name === 'conifer') return [look.trees[4] > look.trees[3] ? 4 : 3, variantAt(x, z, TREE_VARIANTS, 11)];
    // (in live oak country a mapped oak is most likely the live oak: Savannah's squares, St. Charles Avenue)
    if (name === 'oak' && regionLiveOak >= 0 && hashf(Math.floor(x * 2.7) * 7919 + Math.floor(z * 3.1) * 104729 + 211) < 0.72) return [regionLiveOak, variantAt(x, z, TREE_VARIANTS, 11)];
    const k = TREE_KINDS.indexOf(name as (typeof TREE_KINDS)[number]);
    if (k < 0) return [-1, 0];
    return [k, vs !== undefined ? +vs % TREE_VARIANTS : name === 'maple' || name === 'mesquite' ? variantAt(x, z, 2, 11) : variantAt(x, z, TREE_VARIANTS, 11)];
  };
  const SPC = 8, spGrid = new Map<string, { x: number; z: number; sp: string }[]>();
  for (const p of ctxJson.points) {
    if (p.c !== 'tree' || !p.sp) continue;
    const key = `${Math.floor(p.x / SPC)},${Math.floor(p.z / SPC)}`;
    (spGrid.get(key) ?? spGrid.set(key, []).get(key)!).push({ x: p.x, z: p.z, sp: p.sp });
  }
  const mappedSpecies = (x: number, z: number) => {
    let best: string | null = null, bd = 3.5;
    for (let i = Math.floor((x - bd) / SPC); i <= Math.floor((x + bd) / SPC); i++)
      for (let j = Math.floor((z - bd) / SPC); j <= Math.floor((z + bd) / SPC); j++)
        for (const q of spGrid.get(`${i},${j}`) ?? []) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) (bd = d), (best = q.sp); }
    return best;
  };
  for (const p of json.points) {
    if (p.c !== 'tree' || !inSlice(p.x, p.z) || lidarCovered(p.x, p.z)) continue;
    let { x, z } = p;
    if (paved(x, z)) {
      // OSM street trees are often tagged on the carriageway — slide to the near verge
      // instead of dropping them, so the canopy still shades the street.
      const e = roadEdge(x, z);
      if (!e) continue;
      const nx = x - e.x, nz = z - e.z, L = Math.hypot(nx, nz) || 1;
      const out = e.w / 2 + 2.0 + rng.float() * 1.2;
      x = e.x + (nx / L) * out;
      z = e.z + (nz / L) * out;
      if (paved(x, z) || walk.blocked(x, z, 2.2)) continue;
    }
    if (onStructure(x, z)) continue;
    let [k, v] = p.sp ? kindOfSp(p.sp, x, z) : [-1, 0];
    if (k < 0) (k = regional(rng.float() < 0.6 ? 0 : 1, x, z)), (v = variantAt(x, z, TREE_VARIANTS, 11));
    if (k === MAPLE && v === 2 && !westside && !p.sp?.endsWith(':2')) v = 0;
    const s = (p.h ?? (k === 2 ? 3 : 9)) / treeMeta(TREE_KINDS[k], v).h;
    trees.push({ m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(s, s, s)), c: new THREE.Color(rng.pick(green)), k, v });
  }

  // street trees' pits at the kerb: the survey's, where the street is paved wall to wall, and the
  // city's own (below)
  const pits: THREE.Matrix4[] = [];
  if (LT && TB) {
    // model extents per kind (height to crown top, crown radius) — scale each to the measured tree
    const wsum = look.trees.reduce((a, b) => a + b, 0) || 1;
    const conifer = (look.trees[3] + look.trees[4]) / wsum; // the region's conifer share
    for (let i = 0; i + 3 < LT.length; i += 4) {
      let x = LT[i] / 10, z = LT[i + 1] / 10;
      const h = LT[i + 2] / 10, r = LT[i + 3] / 10;
      if (x < TB.x0 || x >= TB.x1 || z < TB.z0 || z >= TB.z1) continue; // each tree is its own cell's
      if (terrain.sdfAt(x, z) < 1) continue;
      // taller than any street or park tree in the lower 48 grows: a structure the survey saw
      if (h > 50) continue;
      let pit = false, tx = 0, tz = 0;
      // (and a crown at the kerb line whose trunk spot a kerb, a door's way in or a stoop takes: the same)
      if (paved(x, z) || walk.blocked(x, z, 0.6) || onStructure(x, z)) {
        // crown tops over the street: plant the trunk on the verge beneath the edge of it — past the
        // paved band (its mask is the road and 1.5 m each side, at 2 m cells) — or, where the street
        // is paved wall to wall (a town's sidewalks), in a pit at the kerb, as a city's street trees
        // stand. (Both used to be dropped: of the 35 trees the survey measured within 50 m of a
        // Savannah street under live oaks, the game kept 6.)
        const e = roadEdge(x, z);
        if (!e || e.d > e.w / 2 + 6) continue; // (not a street's tree: a yard's, under a wall or a deck)
        const nx = x - e.x, nz = z - e.z, L = Math.hypot(nx, nz) || 1;
        tx = -nz / L; tz = nx / L;
        const out = e.w / 2 + 2.8 + rng.float() * 0.8;
        const cands: [number, number, boolean][] = [[e.x + (nx / L) * out, e.z + (nz / L) * out, false]];
        if (e.w >= 5) cands.push([e.x + (nx / L) * (e.w / 2 + 1.1), e.z + (nz / L) * (e.w / 2 + 1.1), true]); // (an alley, a drive: no kerb)
        // (a stoop, a door's way in, a lamp where the trunk would stand: a step or two along the street)
        let placed = false;
        for (const [cx, cz, isPit] of cands) {
          for (const d of [0, 1.5, -1.5, 3, -3]) {
            const px = cx + tx * d, pz = cz + tz * d;
            if ((!isPit && paved(px, pz)) || walk.blocked(px, pz, isPit ? 0.5 : 0.6) || onStructure(px, pz)) continue;
            (x = px), (z = pz), (pit = isPit), (placed = true);
            break;
          }
          if (placed) break;
        }
        if (!placed) continue;
      }
      if (pit) {
        pits.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(tx, tz)), V(1, 1, 1)));
        walk.addLoop([[x - 0.3, z - 0.3], [x + 0.3, z - 0.3], [x + 0.3, z + 0.3], [x - 0.3, z + 0.3]]);
      }
      // species: shrubs are short; a narrow crown for its height reads conifer where the
      // region grows them; otherwise the region's broadleaf mix (oaks for the broad ones)
      const slim = r / h < 0.3;
      let k: number;
      if (h < 4.2) k = 2;
      else if (slim && rng.float() < Math.min(1, conifer * 3)) k = look.trees[4] > look.trees[3] ? 4 : 3;
      else if (!slim && conifer > 0.6 && rng.float() < 0.5) k = look.trees[4] > look.trees[3] ? 4 : 3;
      else k = r / h > 0.42 || rng.float() < look.trees[1] / Math.max(0.01, look.trees[0] + look.trees[1]) ? 1 : 0;
      k = regional(k, x, z, r / h);
      let v = variantAt(x, z, TREE_VARIANTS, 11);
      // In town, silhouette decides: street and yard trees are broadleaf with the crown filling
      // the upper half or more. Conifers only where the region is mostly conifer, and no model
      // whose bare trunk would be stretched into a lollipop by the measured height.
      if (k !== 2 && walk.blocked(x, z, 14)) {
        if (NEEDLE_K.has(k) && conifer <= 0.5) k = r / h > 0.42 ? 1 : 0;
        if (k !== 7 && k !== 8 && k !== 5 && treeMeta(TREE_KINDS[k], v).crownBottom / treeMeta(TREE_KINDS[k], v).h > 0.56) k = regional(r / h > 0.42 ? 1 : 0, x, z, r / h);
        v = variantAt(x, z, TREE_VARIANTS, 11);
      }
      // …unless the map names the tree the survey measured (a mapped street tree under this crown)
      const named = h >= 4.2 ? mappedSpecies(x, z) : null;
      if (named) {
        const [nk, nv] = kindOfSp(named, x, z);
        if (nk >= 0) (k = nk), (v = nv);
      }
      if (k === MAPLE && v === 2 && !westside && !named?.endsWith(':2')) v = 0;
      if (NW_CONIFER.has(k) && !named) v = nwForm(x, z, mapCover(x, z) === 10 && !walk.blocked(x, z, 14));
      const tm = treeMeta(TREE_KINDS[k], v);
      const mh = tm.h, mr = tm.crownR;
      // crowns never thinner than ~the model's own proportions: a lone 20 m oak measured
      // at half-height reads narrow, and a stretched-thin model reads as a lollipop; nor squashed
      // much flatter (a crown stretched 1.8× wide turned its lobes into slabs stacked on a pole —
      // a broad crown is an oak's, chosen above, not a round tree flattened)
      const sy = h / mh, sr = Math.max(0.85 * sy, Math.min(1.35 * sy, r / mr));
      const m = new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z) - 0.2, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(sr * (0.92 + rng.float() * 0.16), sy, sr * (0.92 + rng.float() * 0.16)));
      const c = new THREE.Color(rng.pick(green));
      if (k === 4) c.lerp(new THREE.Color(0x2e4630), 0.55);
      else if (rng.float() < 0.12) c.lerp(new THREE.Color(0xb59a3e), 0.45);
      trees.push({ m, c, k, v, meas: 1 });
    }
  }

  // City street trees: in dense cores the side streets are lined with trees in square pits at the
  // kerb (every ~9 m, where nothing else stands), a tree every few spaces — the green of a
  // brownstone block. Mapped street trees already count: none within 6 m of one.
  const bins: THREE.Matrix4[] = [];
  for (const r of json.roads) {
    const rank = RANK[r.c] ?? 0;
    if (r.lod || r.br || rank < 2 || rank > 4) continue;
    const p = unpackPts(r.p);
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L < 12) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
      for (let t = 6; t < L - 6; t += 9) {
        for (const sd of [1, -1]) {
          const x = ax + tx * t + nx * sd * (r.w / 2 + 1.1), z = az + tz * t + nz * sd * (r.w / 2 + 1.1);
          if (!inSlice(x, z) || !urban(x, z)) continue;
          const hq = hashf(Math.floor(x * 3.7) * 7919 + Math.floor(z * 2.9));
          if (hq > 0.62 || walk.blocked(x, z, 1.4) || terrain.sdfAt(x, z) < 2) continue;
          if (trees.some((q) => { const e = q.m.elements; return Math.abs(e[12] - x) < 6 && Math.abs(e[14] - z) < 6; })) continue;
          const g = terrain.heightAt(x, z);
          const k = regional(hq < 0.2 ? 1 : 0, x, z), v = k === MAPLE ? variantAt(x, z, 2, 11) : variantAt(x, z, TREE_VARIANTS, 11); // (street maples are sugar and red)
          const sc = (7 + hq * 6) / treeMeta(TREE_KINDS[k], v).h;
          trees.push({ m: new THREE.Matrix4().compose(V(x, g - 0.1, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), hq * 40), V(sc * 0.85, sc, sc * 0.85)), c: new THREE.Color(rng.pick(green)), k, v });
          pits.push(new THREE.Matrix4().compose(V(x, g, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(tx, tz)), V(1, 1, 1)));
          walk.addLoop([[x - 0.3, z - 0.3], [x + 0.3, z - 0.3], [x + 0.3, z + 0.3], [x - 0.3, z + 0.3]]);
          // a litter bin at every few trees' worth of kerb
          if (hq < 0.06) {
            const bx2 = x + tx * 2.2, bz2 = z + tz * 2.2;
            if (!walk.blocked(bx2, bz2, 0.4)) { bins.push(new THREE.Matrix4().makeTranslation(bx2, terrain.heightAt(bx2, bz2), bz2)); walk.addLoop([[bx2 - 0.3, bz2 - 0.3], [bx2 + 0.3, bz2 - 0.3], [bx2 + 0.3, bz2 + 0.3], [bx2 - 0.3, bz2 + 0.3]], -Infinity, terrain.heightAt(bx2, bz2) + 0.9); }
          }
        }
      }
    }
  }
  if (pits.length) {
    // the pit: a low granite kerb square round dark soil
    const g = mergeGeometries([
      colored(new THREE.BoxGeometry(1.5, 0.06, 1.5).translate(0, 0.03, 0), 0x4a3d30),
      colored(new THREE.BoxGeometry(1.6, 0.12, 0.1).translate(0, 0.06, 0.75), 0x9a968c),
      colored(new THREE.BoxGeometry(1.6, 0.12, 0.1).translate(0, 0.06, -0.75), 0x9a968c),
      colored(new THREE.BoxGeometry(0.1, 0.12, 1.5).translate(0.75, 0.06, 0), 0x9a968c),
      colored(new THREE.BoxGeometry(0.1, 0.12, 1.5).translate(-0.75, 0.06, 0), 0x9a968c),
    ]);
    const im = new THREE.InstancedMesh(g, propMaterial(), pits.length);
    pits.forEach((m, i) => im.setMatrixAt(i, m));
    im.name = 'street:treepits';
    group.add(im);
  }
  if (bins.length) {
    const g = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.3, 0.26, 0.85, 10, 1, true).translate(0, 0.43, 0), 0x3f5a46),
      colored(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 10).translate(0, 0.04, 0), 0x2e3a30),
    ]);
    const im = new THREE.InstancedMesh(g, propMaterial(), bins.length);
    bins.forEach((m, i) => im.setMatrixAt(i, m));
    im.name = 'street:bins';
    group.add(im);
  }

  // ---- a viewpoint's view is kept open (every tree source) ----
  // `tourism=viewpoint` says there is a view here: the crowns in front of it (along its mapped
  // `direction`, else down its slope) that would rise into the sightline are cut back under it —
  // a smaller tree where one of 4 m fits, none where it doesn't. Kerry Park looked into its own
  // spruces.
  {
    const vps = viewCones(ctxJson.points, (x, z) => terrain.heightAt(x, z));
    if (vps.length) {
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      for (let i = trees.length - 1; i >= 0; i--) {
        const t = trees[i];
        const e = t.m.elements;
        let allow = Infinity;
        for (const c of vps) allow = Math.min(allow, c.allow(e[12], e[14], e[13]));
        if (allow === Infinity) continue;
        t.m.decompose(pos, q, sc);
        const h = treeMeta(TREE_KINDS[t.k], t.v).h * sc.y;
        if (h <= allow) continue;
        if (allow < 4) { trees.splice(i, 1); continue; } // (cut to a shrub at the rail it reads as a blob in the view: gone)
        sc.multiplyScalar(allow / h);
        t.m.compose(pos, q, sc);
      }
    }
  }

  // ---- clearance against buildings (every tree source) ----
  // Real trees overhang roofs, but a watercolour blob crown through a wall reads as a tree
  // growing inside the house. A crown that sits below the neighbouring roof is narrowed to
  // stop just short of the wall; one that clears the roof may overhang it; a trunk inside
  // or hugging a footprint is moved out to 1.3 m, and a tree squeezed to a stick is dropped.
  {
    type FB = { r: P[]; h: number; bb: [number, number, number, number] };
    const fbs: FB[] = [];
    const cellB = 32, byCell = new Map<number, FB[]>();
    const ck = (a: number, b: number) => a * 92821 + b;
    for (const bd of ctxJson.buildings) {
      const r = unpackPts(bd.r).map(([x, z]) => [x, z] as P);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of r) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
      const f: FB = { r, h: bd.h, bb: [x0, z0, x1, z1] };
      fbs.push(f);
      for (let a = Math.floor((x0 - 10) / cellB); a <= Math.floor((x1 + 10) / cellB); a++)
        for (let b = Math.floor((z0 - 10) / cellB); b <= Math.floor((z1 + 10) / cellB); b++) {
          const l = byCell.get(ck(a, b));
          if (l) l.push(f);
          else byCell.set(ck(a, b), [f]);
        }
    }
    // nearest footprint edge: distance, outward normal, inside?, building height
    const nearest = (x: number, z: number) => {
      let best: { d: number; nx: number; nz: number; inside: boolean; h: number } | null = null;
      for (const f of byCell.get(ck(Math.floor(x / cellB), Math.floor(z / cellB))) ?? []) {
        if (x < f.bb[0] - 10 || x > f.bb[2] + 10 || z < f.bb[1] - 10 || z > f.bb[3] + 10) continue;
        let inside = false, d = Infinity, qx = 0, qz = 0;
        for (let a = 0, b = f.r.length - 1; a < f.r.length; b = a++) {
          const [xa, za] = f.r[a], [xb, zb] = f.r[b];
          if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
          const dx = xb - xa, dz = zb - za, L2 = dx * dx + dz * dz || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - xa) * dx + (z - za) * dz) / L2));
          const px = xa + t * dx, pz = za + t * dz, dd = Math.hypot(x - px, z - pz);
          if (dd < d) (d = dd), (qx = px), (qz = pz);
        }
        const sd = inside ? -d : d;
        if (!best || sd < (best.inside ? -best.d : best.d)) {
          const L = Math.hypot(x - qx, z - qz) || 1;
          best = { d, nx: ((x - qx) / L) * (inside ? -1 : 1), nz: ((z - qz) / L) * (inside ? -1 : 1), inside, h: f.h };
        }
      }
      return best;
    };
    // per model: crown radius and crown-bottom height (at scale 1)
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = trees.length - 1; i >= 0; i--) {
      const t = trees[i];
      t.m.decompose(pos, q, sc);
      let n = nearest(pos.x, pos.z);
      if (!n) continue;
      if (n.inside || n.d < 1.3) {
        const push = (n.inside ? n.d : -n.d) + 1.3;
        pos.x += n.nx * push;
        pos.z += n.nz * push;
        n = nearest(pos.x, pos.z);
        if (n && (n.inside || n.d < 1.2)) { trees.splice(i, 1); continue; } // wedged between houses
        pos.y = terrain.heightAt(pos.x, pos.z) - 0.2;
      }
      if (n) {
        const tm = treeMeta(TREE_KINDS[t.k], t.v);
        const crownR = tm.crownR * Math.max(sc.x, sc.z), crownBottom = tm.crownBottom * sc.y;
        // (a crown topping the roof by 3 m overhangs it, as a row's street trees do over its fronts:
        // narrowing them to sticks dropped nearly every one of them)
        if (crownBottom < n.h + 0.8 && crownR > n.d + 0.4 && tm.h * sc.y < n.h + 3) {
          let f = (n.d + 0.4) / crownR;
          if (f * Math.max(sc.x, sc.z) < 0.45 * sc.y) {
            if (!t.meas) { trees.splice(i, 1); continue; } // would be a stick
            f = (0.45 * sc.y) / Math.max(sc.x, sc.z); // (a measured tree stands, as slim as it may)
          }
          sc.x *= f;
          sc.z *= f;
        }
      }
      t.m.compose(pos, q, sc);
    }
    // Solid trunks: walking, driving and landing bump into trees now (shrubs stay brushable).
    for (const t of trees) {
      if (t.k === 2) continue;
      t.m.decompose(pos, q, sc);
      const r = Math.max(0.15, treeMeta(TREE_KINDS[t.k], t.v).trunkR * Math.max(sc.x, sc.z));
      walk.addLoop([[pos.x - r, pos.z - r], [pos.x + r, pos.z - r], [pos.x + r, pos.z + r], [pos.x - r, pos.z + r]]);
    }
  }

  const blob = (r: number, y: number, ox: number, oz: number, seed: number, sy = 0.85) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = V(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = 0.82 + 0.3 * hash01(Math.floor((v.x + 9) * 3) * 73 + Math.floor((v.y + 9) * 3) * 19 + Math.floor((v.z + 9) * 3) + seed);
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x + ox, v.y * sy + y, v.z + oz);
    }
    g.computeVertexNormals();
    return colored(g, 0xffffff);
  };
  // Trees from the foundry (assets/flora.ts): one InstancedMesh per species × grown variant.
  // Trunks keep their bark: instance colour only tints foliage (vertex color white there).
  for (let k = 0; k < TREE_KINDS.length; k++)
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const list = trees.filter((t) => t.k === k && t.v === v);
      if (!list.length) continue;
      const tm = treeMeta(TREE_KINDS[k], v);
      const crown: [number, number] = [tm.crownBottom + 0.85 * tm.crownR, tm.crownR];
      // broadleaf crowns colour and fall with the season (each species its own autumn); conifers,
      // palms, magnolias and the desert legumes keep theirs
      const kind = TREE_KINDS[k];
      const decid = DECIDUOUS.has(kind);
      const im = new THREE.InstancedMesh(treeLib(kind, v).clone(), propMaterial({ wind: true, foliage: true, crown, decid, fallHue: fallHueOf(kind, v), blossom: kind === 'cherry', weep: kind === 'willow', flutter: FLUTTER.has(kind) }), list.length);
      im.name = `trees:${kind}:${v}`;
      // a species' own green over the region's: the desert legumes a dusty grey-green (palo verde a
      // thin yellow-green), the willow a soft yellow-green, the magnolia dark and glossy, the
      // cypress-dark poplar of a Mediterranean hill
      const own = kind === 'mesquite' ? [new THREE.Color(v === 2 ? 0xa3ad55 : 0x7f8a5c), 0.8]
        : kind === 'willow' ? [new THREE.Color(0xa9b857), 0.6]
          : kind === 'magnolia' ? [new THREE.Color(0x2c4a2a), 0.6]
            : kind === 'poplar' ? [new THREE.Color(clim === 'mediterranean' ? 0x2f4a2c : 0x4f6e34), clim === 'mediterranean' ? 0.7 : 0.35]
              : kind === 'maple' ? [new THREE.Color(0x6b8c3a), 0.3]
                // the Northwest's: Douglas fir dark, hemlock a softer dark, Sitka spruce blue-green, redcedar
                // a yellower green, the vine maple's light green in the shade
                : kind === 'fir' ? [new THREE.Color(0x2c452a), 0.55] : kind === 'hemlock' ? [new THREE.Color(0x34502e), 0.45]
                  : kind === 'sitka' ? [new THREE.Color(0x3c584c), 0.5] : kind === 'cedar' ? [new THREE.Color(0x4f6e34), 0.45]
                    : kind === 'vinemaple' ? [new THREE.Color(0x7a9a44), 0.45] : kind === 'alder' ? [new THREE.Color(0x55703a), 0.25]
                      // the live oaks dark and leathery: the South's deep olive, the plateau oak's dusty olive, the coast live oak's near-black green
                      : kind === 'liveoak' ? [new THREE.Color(0x35502e), 0.5] : kind === 'plateauoak' ? [new THREE.Color(0x4d5e36), 0.5] : kind === 'coastoak' ? [new THREE.Color(0x2c4426), 0.55]
                        // the northern and mountain conifers: the white pine's soft blue-green, the ponderosa's
                        // yellow-green, the lodgepole's, red spruce's yellow-green, balsam fir's near-black, Engelmann's
                        // blue-green, subalpine fir's, hemlock's dark; the aspen's bright, the willow's grey-green
                        : kind === 'whitepine' ? [new THREE.Color(0x4a6a5a), 0.5] : kind === 'ponderosa' ? [new THREE.Color(0x5a6e3a), 0.45] : kind === 'lodgepole' ? [new THREE.Color(0x46603a), 0.45]
                          : kind === 'redspruce' ? [new THREE.Color(0x4a6232), 0.45] : kind === 'balsamfir' ? [new THREE.Color(0x2a4230), 0.6] : kind === 'engelmann' ? [new THREE.Color(0x34504a), 0.55]
                            : kind === 'subalpinefir' ? [new THREE.Color(0x3a5640), 0.5] : kind === 'easthemlock' ? [new THREE.Color(0x2e4a32), 0.55]
                              : kind === 'aspen' ? [new THREE.Color(0x7a9a46), 0.45] : kind === 'willowshrub' ? [new THREE.Color(0x7a9452), 0.4] : null;
      list.forEach((t, i) => { im.setMatrixAt(i, t.m); im.setColorAt(i, own ? t.c.clone().lerp(own[0] as THREE.Color, own[1] as number) : t.c); });
      im.layers.enable(1);
      im.computeBoundingSphere();
      group.add(im);
    }

  // Hangers (assets/hangers.ts): what grows on the trees' limbs here — Spanish moss on the Southern
  // coastal plain's oaks, resurrection fern along the live oaks' big limbs, ball moss in Texas, Florida
  // and the Gulf, lace lichen in California's fog belt — each tree drawn with its own (a hash of where
  // it stands: none, a light dressing or a heavy one) and its own tone, instanced on the tree's own
  // matrix so the strands hang from its limbs. The strands swing in the material (propMaterial hang).
  {
    const hangPlace = { ...castOf(look0()), fog: caFogBelt(json.origin.lat, json.origin.lon) };
    const mixes = new Map<number, ReturnType<typeof hangerMix>>();
    const hung = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
    for (const t of trees) {
      let mix = mixes.get(t.k);
      if (!mix) mixes.set(t.k, (mix = hangerMix(TREE_KINDS[t.k], hangPlace)));
      if (!mix.length) continue;
      const e = t.m.elements, x = e[12], z = e[14];
      for (const [type, any, heavy] of mix) {
        const salt = HANGERS.indexOf(type) + 1, u = hashf(Math.floor(x * 1.9) * 73856093 ^ Math.floor(z * 2.3) * 19349663 ^ (salt * 83492791));
        if (u >= any) continue;
        const key = `${type}:${t.k}:${t.v}:${u < heavy ? 1 : 0}`;
        const tones = HANG_TONES[type], h2 = hashf(Math.floor(x * 3.3) * 19349663 ^ Math.floor(z * 2.9) * 73856093 ^ (salt * 2654435761));
        const c = new THREE.Color(tones[Math.floor(h2 * tones.length)]).lerp(new THREE.Color(tones[Math.floor(hashf(Math.floor(x * 5.1) + Math.floor(z * 4.7) * 31 + salt) * tones.length)]), 0.5);
        (hung.get(key) ?? hung.set(key, []).get(key)!).push({ m: t.m, c });
      }
    }
    for (const [key, list] of hung) {
      const [type, k, v, load] = key.split(':');
      const lib = hangerLib(type as HangerType, TREE_KINDS[+k], +v, +load);
      if (!lib.getAttribute('position').count) continue; // (a tree with nowhere for it to grow)
      const im = new THREE.InstancedMesh(lib.clone(), propMaterial({ wind: true, hang: true }), list.length);
      im.name = `hang:${type}:${TREE_KINDS[+k]}:${v}:${load}`;
      list.forEach((h, i) => { im.setMatrixAt(i, h.m); im.setColorAt(i, h.c); });
      im.layers.enable(1);
      im.computeBoundingSphere();
      group.add(im);
    }
  }

  // ---------- moored boats (asset kit hulls) ----------
  // Along each side of the map's piers bow to stern, and in the berths the map didn't draw — a
  // marina's slips, a house's dock (docks.ts) — as many as the month puts in the water (calendar.ts
  // marinaSeason: nearly every slip in July and August, about half in October). Every choice a
  // hash of where the boat lies.
  const MOOR = boatMix(look.climate);
  const inWater = marinaSeason(worldDate().getUTCMonth() + 1, json.origin.lat < 0, look.climate);
  const HULL = [0xf4f2ec, 0xf4f2ec, 0xeef0f0, 0x2d4a6a, 0xd9e4ea, 0x9b3b32];
  const hb = (x: number, z: number, salt: number) => hashf(Math.floor(x * 3) * 73856093 ^ Math.floor(z * 3) * 19349663 ^ (salt * 83492791));
  const moored = new Map<BoatType, { m: THREE.Matrix4; c: THREE.Color }[]>();
  // (each boat's hull, so two never lie in one another — a pier's boats and the next pier's, 6 m off)
  const hulls: { type: BoatType; x: number; z: number; yaw: number; corners: P[] }[] = [];
  const moor = (type: BoatType, x: number, z: number, yaw: number) => {
    const r = boatRecipe(type, 1), hl = r.L / 2 + 0.2, hw = r.B / 2 + 0.15, cy = Math.cos(yaw), sy = Math.sin(yaw);
    hulls.push({ type, x, z, yaw, corners: [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [x + u * cy + v * sy, z - u * sy + v * cy] as P) });
  };
  for (const s of pierSegs) {
    if (s.gen) continue; // (a generated pier's boats lie at its berths, below)
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const L = Math.hypot(dx, dz);
    if (L < 4) continue;
    const tx = dx / L, tz = dz / L;
    for (const side of [-1, 1]) {
      let d = 2;
      while (d < L - 3) {
        const px = s.a[0] + tx * d + tz * side, pz = s.a[1] + tz * d - tx * side;
        if (hb(px, pz, 1) >= inWater) { d += 4; continue; } // an empty slip (the boat's out of the water this month)
        const type = pickFrom(MOOR, hb(px, pz, 2));
        const r = boatRecipe(type, 1);
        if (d + r.L > L - 1) break;
        const off = s.w / 2 + r.B / 2 + 0.6;
        const c = d + r.L / 2;
        const x = s.a[0] + tx * c + tz * side * off, z = s.a[1] + tz * c - tx * side * off;
        d += r.L + 1.2;
        if (terrain.sdfAt(x, z) > -2.5 || walk.deckAt(x, z) !== null || !seaLevel(terrain, x, z)) continue;
        // bow (−z in the model) toward either end of the pier
        const f = hb(px, pz, 3) < 0.5 ? 1 : -1;
        moor(type, x, z, Math.atan2(-tx * f, -tz * f));
      }
    }
  }
  for (const b of extras.berths ?? []) if (b.u < inWater && inSlice(b.x, b.z) && walk.deckAt(b.x, b.z) === null) moor(b.type, b.x, b.z, b.yaw);
  for (const h of oneToASpace(hulls)) {
    if (!moored.has(h.type)) moored.set(h.type, []);
    moored.get(h.type)!.push({ m: new THREE.Matrix4().compose(V(h.x, 0, h.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), h.yaw), V(1, 1, 1)), c: new THREE.Color(HULL[Math.floor(hb(h.x, h.z, 5) * HULL.length)]) });
  }
  for (const [type, list] of moored) {
    const im = new THREE.InstancedMesh(boatLib(type).clone(), propMaterial({ bob: true }), list.length);
    im.name = 'moored-boats:' + type;
    list.forEach((b, i) => { im.setMatrixAt(i, b.m); im.setColorAt(i, b.c); });
    im.layers.enable(1);
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- lifeguard stands along the beach, facing the sea ----------
  // (crowd.ts seats a lifeguard up in each one in season: `beachStands`)
  const stands: THREE.Matrix4[] = [];
  const standAt: [number, number][] = [];
  const beachStands: Stand[] = [];
  const SZ = extras.box
    ? { x0: Math.max(DZ.x0 + 60, extras.box.x0), z0: Math.max(DZ.z0 + 60, extras.box.z0), x1: Math.min(DZ.x1 - 60, extras.box.x1), z1: Math.min(DZ.z1 - 60, extras.box.z1) }
    : { x0: DZ.x0 + 60, z0: DZ.z0 + 60, x1: DZ.x1 - 60, z1: DZ.z1 - 60 };
  for (let z = SZ.z0; z < SZ.z1; z += 12)
    for (let x = SZ.x0; x < SZ.x1; x += 3) {
      if (extras.box && (x < extras.box.x0 || x >= extras.box.x1 || z < extras.box.z0 || z >= extras.box.z1)) continue;
      const d = terrain.sdfAt(x, z);
      if (!(terrain.oceanDistAt(x, z) < 60 && d > 22 && d < 30) || standAt.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 140)) continue;
      const gx = terrain.oceanDistAt(x - 6, z) - terrain.oceanDistAt(x + 6, z), gz = terrain.oceanDistAt(x, z - 6) - terrain.oceanDistAt(x, z + 6);
      standAt.push([x, z]);
      // the chair's back (local -z) to the land, looking out along the seaward slope
      stands.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(gx, gz)), V(1, 1, 1)));
      beachStands.push({ x, y: terrain.heightAt(x, z), z, yaw: Math.atan2(gx, gz) });
      walk.addLoop([[x - 1, z - 0.9], [x + 1, z - 0.9], [x + 1, z + 0.9], [x - 1, z + 0.9]]);
    }

  // ---------- parked cars at the house end of real driveways ----------
  // keyed type|gear: every car of a type still differs — proportions breathe ±3–4 % per car, paint
  // fades with age, and some carry gear (surfboards near the coast, racks, kayaks, bikes).
  const parked = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
  const CAR = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x5a5e64, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e, 0x7a8894];
  for (const r of json.roads) {
    if (r.lod || r.sv !== 'driveway' || r.p.length < 4) continue;
    const p = unpackPts(r.p);
    const h = hash01(r.p[0] * 131 + r.p[1] * 7);
    if (h > 0.62) continue;
    // the end farther from any street is the house end
    const a = p[0], b = p[p.length - 1];
    const blockedA = walk.blocked(a[0], a[1], 3), blockedB = walk.blocked(b[0], b[1], 3);
    const [e, f] = blockedA && !blockedB ? [a, p[1]] : blockedB && !blockedA ? [b, p[p.length - 2]] : hash01(r.p[2] * 17) < 0.5 ? [a, p[1]] : [b, p[p.length - 2]];
    const dx = f[0] - e[0], dz = f[1] - e[1], l = Math.hypot(dx, dz);
    if (l < 0.5) continue;
    const back = Math.min(3.2, l * 0.5);
    const x = e[0] + (dx / l) * back, z = e[1] + (dz / l) * back;
    const yaw = Math.atan2(-dx, -dz) + (h < 0.3 ? Math.PI : 0);
    // the model: the region's street mix, footprint sized by its recipe
    const type = pickFrom(carMix(look.region, look.climate), hash01(r.p[1] * 53 + r.p[0] * 3));
    const rc = carRecipe(type, 1), hl = rc.L / 2, hw = rc.W / 2 + 0.05;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const corners: P[] = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [x + u * cy + v * sy, z - u * sy + v * cy]);
    if (!inSlice(x, z, 10) || corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.3)) || terrain.sdfAt(x, z) < 2) continue;
    const u1 = hashf(r.p[0] * 31 + r.p[1]), u2 = hashf(r.p[1] * 17 + r.p[0] * 5), u3 = hashf(r.p[0] + r.p[1] * 97);
    const gear = gearFor(hashf(r.p[0] * 7 + r.p[1] * 13), terrain.oceanDistAt(x, z) < 3000);
    const key = `${type}|${gear ?? ''}`;
    if (!parked.has(key)) parked.set(key, []);
    const paint = new THREE.Color(CAR[Math.floor(h * 97) % CAR.length]).lerp(new THREE.Color(0xd8d4cc), u3 < 0.25 ? 0.12 + u3 : 0); // an old car's sun-faded paint
    parked.get(key)!.push({ m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(0.97 + u1 * 0.06, 0.96 + u2 * 0.08, 0.97 + u3 * 0.06)), c: paint });
    walk.addLoop(corners);
  }
  // generated drives (buildings.ts lot dressing): most have a car at the house end
  for (const d of extras.drives ?? []) {
    const hq = hashf(Math.floor(d.x * 7.3) * 92821 + Math.floor(d.z * 5.1));
    if (hq > 0.72) continue;
    const yaw = d.yaw + (hq < 0.18 ? Math.PI : 0); // most nose in, some backed in
    const type = pickFrom(carMix(look.region, look.climate), hashf(Math.floor(d.x * 3.1) + Math.floor(d.z * 11.7) * 31));
    const rc = carRecipe(type, 1), hl = rc.L / 2, hw = rc.W / 2 + 0.05;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const corners: P[] = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [d.x + u * cy + v * sy, d.z - u * sy + v * cy]);
    if (corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.3) || paved(cx, cz)) || terrain.sdfAt(d.x, d.z) < 2) continue;
    const e = roadEdge(d.x, d.z);
    if (e && e.d - e.w / 2 < 4.5) continue; // never on the sidewalk strip or a footway
    const u1 = hashf(Math.floor(d.x * 31)), u2 = hashf(Math.floor(d.z * 17)), u3 = hashf(Math.floor(d.x * 13 + d.z * 97));
    const gear = gearFor(hashf(Math.floor(d.x * 7) + Math.floor(d.z * 13) * 7), terrain.oceanDistAt(d.x, d.z) < 3000);
    const key = `${type}|${gear ?? ''}`;
    if (!parked.has(key)) parked.set(key, []);
    const paint = new THREE.Color(CAR[Math.floor(hq * 97) % CAR.length]).lerp(new THREE.Color(0xd8d4cc), u3 < 0.25 ? 0.12 + u3 : 0);
    parked.get(key)!.push({ m: new THREE.Matrix4().compose(V(d.x, terrain.heightAt(d.x, d.z), d.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(0.97 + u1 * 0.06, 0.96 + u2 * 0.08, 0.97 + u3 * 0.06)), c: paint });
    walk.addLoop(corners);
  }
  // curbside parking on main streets in front of businesses (parallel, ~60 % of spaces taken):
  // downtowns read busy because their curbs are full
  // the nearest carriageway (not the footway in front of the shop, which is usually nearer)
  const CARRIAGE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
  const carriageEdge = (x: number, z: number) => {
    let best: { x: number; z: number; w: number; d: number } | null = null;
    for (const r of ctxJson.roads) {
      if (r.lod || r.br || !CARRIAGE.has(r.c) || r.w < 9) continue;
      const p = unpackPts(r.p);
      for (let i = 0; i + 1 < p.length; i++) {
        const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1], L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - p[i][0]) * dx + (z - p[i][1]) * dz) / L2));
        const qx = p[i][0] + dx * t, qz = p[i][1] + dz * t, dd = Math.hypot(x - qx, z - qz);
        if (!best || dd < best.d) best = { x: qx, z: qz, w: r.w, d: dd };
      }
    }
    return best;
  };
  for (const d of extras.doors ?? []) {
    if (d.kind !== 'commercial') continue;
    const e = carriageEdge(d.fx, d.fz);
    if (!e || e.d > e.w / 2 + 14) continue;
    const ox = d.fx - e.x, oz = d.fz - e.z, ol = Math.hypot(ox, oz) || 1;
    const ux = ox / ol, uz = oz / ol, tx = -uz, tz = ux; // toward the door, and along the curb
    for (const along of [-3.2, 3.3]) {
      const hq = hashf(Math.floor(d.fx * 5.3 + along) * 92821 + Math.floor(d.fz * 3.7));
      if (hq > 0.6) continue;
      const x = e.x + ux * (e.w / 2 - 1.15) + tx * along, z = e.z + uz * (e.w / 2 - 1.15) + tz * along;
      const yaw = Math.atan2(-tx, -tz) + (hq < 0.3 ? Math.PI : 0);
      const type = pickFrom(carMix(look.region, look.climate), hashf(Math.floor(x * 3.3) + Math.floor(z * 7.1) * 131));
      const rc = carRecipe(type, 1), hl = rc.L / 2, hw = rc.W / 2 + 0.05;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const corners: P[] = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [x + u * cy + v * sy, z - u * sy + v * cy]);
      if (corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.2)) || terrain.sdfAt(x, z) < 2) continue;
      const key = `${type}|`;
      if (!parked.has(key)) parked.set(key, []);
      const u3 = hashf(Math.floor(x * 13 + z * 97));
      parked.get(key)!.push({ m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(0.97 + hq * 0.06, 0.97 + u3 * 0.06, 0.98)), c: new THREE.Color(CAR[Math.floor(hq * 97 + u3 * 31) % CAR.length]) });
      walk.addLoop(corners);
    }
  }
  // Street parking (realTile `pk`: left + 4·right; 1 parallel, 2 angled — mapped, or both kerbs
  // of a North American town street): kerbside.ts finds the spaces — kept clear of corners,
  // driveways, crosswalks, hydrants and bus zones where the map puts them, four in five taken
  // downtown — and they're parked here where nothing already stands. The cars go out as records
  // (kerbCars.ts draws them with a per-car level of detail); a tile keeps at most KERB_CAP of them
  // (with the lots' cars below), thinned evenly.
  const kerb: number[] = [];
  {
    const KERB_CAP = 8000;
    const cand: { x: number; z: number; yaw: number; type: CarType; hq: number; corners: P[]; win?: [number, number] }[] = [];
    // (a market's own streets are its walkers' and its stalls': the shared streets within ~60 m of a
    // market hall park no cars — the stalls line them further down)
    const halls = ctxJson.buildings.filter((b) => b.u === 'marketplace' && !b.pt).map((b) => { const r = unpackPts(b.r); return [r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length] as P; });
    const marketStreet = (r: Road) => halls.length > 0 && /^(residential|living_street|unclassified)$/.test(r.c) && unpackPts(r.p).some(([x, z], i, q) => {
      if (i === 0) return halls.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 60);
      const [ax, az] = q[i - 1], dx = x - ax, dz = z - az, L2 = dx * dx + dz * dz || 1;
      return halls.some(([hx, hz]) => { const t = Math.max(0, Math.min(1, ((hx - ax) * dx + (hz - az) * dz) / L2)); return Math.hypot(ax + dx * t - hx, az + dz * t - hz) < 60; });
    });
    for (const k of kerbSpaces(json.roads.filter((r) => !marketStreet(r)), ctxJson.roads, ctxJson.points, { left: !!look.driveLeft, built: (x, z) => built(x, z)[0], inSlice })) {
      const type = pickFrom(carMix(look.region, look.climate), hashf(Math.floor(k.x * 3.3) + Math.floor(k.z * 7.1) * 131));
      const rc = carRecipe(type, 1), hl = rc.L / 2, hw = rc.W / 2 + 0.05;
      const cy = Math.cos(k.yaw), sy = Math.sin(k.yaw);
      const corners: P[] = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [k.x + u * cy + v * sy, k.z - u * sy + v * cy]);
      // the whole car clear (not just its corners: a car straddled a doorway's keep-out), and a
      // sidewalk's width (3 m: a stoop's reach) between it and any building — where the street's
      // modelled width runs up to the facades the lane is on the sidewalk, and it parked across the
      // front doors (a neighbour tile's too, whose doors this tile doesn't know)
      const along: P[] = [];
      for (const v of [-hl, -hl / 2, 0, hl / 2, hl]) for (const u of [-hw, 0, hw]) along.push([k.x + u * cy + v * sy, k.z - u * sy + v * cy]);
      const margin: P[] = [];
      for (const v of [-hl - 0.5, 0, hl + 0.5]) for (const u of [-hw - 3, hw + 3]) margin.push([k.x + u * cy + v * sy, k.z - u * sy + v * cy]);
      if (along.some(([cx, cz]) => walk.blocked(cx, cz, 0.2)) || margin.some(([cx, cz]) => walk.buildingAt(cx, cz) >= 0) || terrain.sdfAt(k.x, k.z) < 2) continue;
      cand.push({ x: k.x, z: k.z, yaw: k.yaw, type, hq: k.hq, corners });
    }
    // Parking lots (lots.ts, the stalls the ground paint stripes): filled by the town's pulse —
    // a third of the stalls at the edge of town, most of them where the blocks are built up. A
    // beach's lot (within 150 m of a mapped beach; the map drawing none round the tile, within
    // 150 m of the open sea) keeps the beach's calendar instead (calendar.ts): a few cars all day
    // and night, then as full as the beach is this month at this hour. Each of its cars carries
    // the hours it's parked; kerbCars.ts draws and walls it only then, so here it walls the stall
    // for the builders after it and nothing else.
    const beachRings = ctxJson.areas.filter((a) => a.c === 'beach' && a.o?.[0]?.length >= 6).map((a) => unpackPts(a.o[0]));
    const beachLot = (ring: P[]) => {
      if (!beachRings.length) return ring.some(([x, z]) => terrain.oceanDistAt(x, z) < 150);
      return beachRings.some((b) => ringsWithin(ring, b, 150));
    };
    const lotSeason = beachSeason(worldDate().getUTCMonth() + 1, json.origin.lat < 0, look.climate);
    const beachFill = (h: number) => beachLotFill(h, lotSeason);
    for (const a of json.areas) {
      if (a.c !== 'parking' || a.lod || !a.o.length) continue;
      const ring = unpackPts(a.o[0]);
      const L = lotLayout(ring, 600);
      if (!L) continue;
      const beach = beachLot(ring);
      for (const st of L.stalls) {
        if (!inSlice(st.x, st.z)) continue;
        const occ = 0.3 + (OCCUPANCY - 0.3) * Math.min(1, Math.max(0, (built(st.x, st.z)[0] - 0.03) / 0.2));
        const win = beach ? windowFor(st.hq, beachFill) : st.hq > occ ? null : ALL_DAY;
        if (!win) continue;
        const type = pickFrom(carMix(look.region, look.climate), hashf(Math.floor(st.x * 3.3) + Math.floor(st.z * 7.1) * 131));
        const rc = carRecipe(type, 1), hl = rc.L / 2, hw = rc.W / 2 + 0.05;
        const yaw = st.yaw + (st.hq < 0.08 ? Math.PI : 0); // a few backed in
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const corners: P[] = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [st.x + u * cy + v * sy, st.z - u * sy + v * cy]);
        if (corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.15)) || terrain.sdfAt(st.x, st.z) < 2) continue;
        cand.push({ x: st.x, z: st.z, yaw, type, hq: st.hq, corners, win });
      }
    }
    // over the cap: keep the spaces with the lowest hash — an even thinning across the tile
    const keep = cand.length > KERB_CAP ? cand.slice().sort((a, b) => a.hq - b.hq)[KERB_CAP - 1].hq : 1;
    for (const k of oneToASpace(cand.filter((k) => k.hq <= keep))) {
      const u3 = hashf(Math.floor(k.x * 13 + k.z * 97));
      const paint = new THREE.Color(CAR[Math.floor(k.hq * 97 + u3 * 31) % CAR.length]).lerp(new THREE.Color(0xd8d4cc), u3 < 0.2 ? 0.12 + u3 : 0);
      const [arrive, leave] = k.win ?? ALL_DAY;
      kerb.push(k.x, terrain.heightAt(k.x, k.z), k.z, k.yaw, CAR_TYPES.indexOf(k.type), paint.r, paint.g, paint.b, 0.97 + k.hq * 0.06, 0.97 + u3 * 0.06, 0.98, arrive, leave); // kerbCars.ts KERB_STRIDE
      if (arrive <= 0 && leave >= 24) walk.addLoop(k.corners);
      else scratchOnly(() => walk.addLoop(k.corners));
    }
  }
  // Main-street lamps: where shops line the street, ornamental posts on the sidewalk just behind
  // the kerb — the black acorn-globe post of an American downtown, a lantern post elsewhere —
  // one every ~18 m of frontage (a grid keeps both sides and neighbouring doors from doubling up).
  {
    const acorn = look.region === 'na';
    const posts: THREE.Matrix4[] = [], seen = new Set<string>();
    for (const d of extras.doors ?? []) {
      if (d.kind !== 'commercial') continue;
      const e = carriageEdge(d.fx, d.fz);
      if (!e || e.d > e.w / 2 + 12) continue;
      const ox = d.fx - e.x, oz = d.fz - e.z, ol = Math.hypot(ox, oz) || 1;
      const ux = ox / ol, uz = oz / ol;
      // (a corner shop's: behind this street's kerb can be in the side street — then its kerb)
      const q = offCarriageway(kerbNear, e.x + ux * (e.w / 2 + 0.55), e.z + uz * (e.w / 2 + 0.55), 0.14);
      if (!q) continue;
      const [x, z] = q;
      const k = `${Math.round(x / 18)}_${Math.round(z / 18)}`;
      if (seen.has(k) || !inSlice(x, z) || walk.blocked(x, z, 0.5) || terrain.sdfAt(x, z) < 1) continue;
      seen.add(k);
      const g = terrain.heightAt(x, z);
      posts.push(new THREE.Matrix4().makeTranslation(x, g, z));
      lampHeads.push(V(x, g + (acorn ? 4.05 : 3.7), z));
      lampGround.push([x, z]);
      walk.addLoop([[x - 0.14, z - 0.14], [x + 0.14, z - 0.14], [x + 0.14, z + 0.14], [x - 0.14, z + 0.14]]);
    }
    if (posts.length) {
      const black = 0x1f2224;
      const post = mergeGeometries(acorn ? [
        colored(new THREE.CylinderGeometry(0.2, 0.24, 0.7, 10).translate(0, 0.35, 0), black), // fluted base
        colored(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8).translate(0, 2.2, 0), black),
        colored(new THREE.CylinderGeometry(0.16, 0.12, 0.14, 10).translate(0, 3.8, 0), black), // collar
        colored(new THREE.ConeGeometry(0.2, 0.24, 10).translate(0, 4.43, 0), black), // finial cap
      ] : [
        colored(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8).translate(0, 0.25, 0), black),
        colored(new THREE.CylinderGeometry(0.06, 0.08, 3.1, 8).translate(0, 2.0, 0), black),
        colored(new THREE.ConeGeometry(0.26, 0.2, 4).rotateY(Math.PI / 4).translate(0, 4.05, 0), black), // lantern roof
      ]);
      const pm = new THREE.InstancedMesh(post, propMaterial(), posts.length);
      posts.forEach((m, i) => pm.setMatrixAt(i, m));
      pm.name = 'lamp:posts';
      pm.layers.enable(1);
      group.add(pm);
      const globe = acorn ? new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.35, 1).translate(0, 4.08, 0) : new THREE.BoxGeometry(0.3, 0.4, 0.3).translate(0, 3.72, 0);
      const gm = new THREE.InstancedMesh(colored(globe, 0xfff4dc), propMaterial({ emissive: new THREE.Color(1.0, 0.78, 0.48), emissiveNight: true }), posts.length);
      posts.forEach((m, i) => gm.setMatrixAt(i, m));
      gm.name = 'lamp:globes';
      group.add(gm);
    }
  }
  // Mapped street furniture: traffic-signal masts at signalled junctions (arms over the road,
  // heads facing the traffic), fire hydrants, subway entrances (a stair well in the sidewalk
  // behind railings, a globe lamp either side).
  {
    const segAt = (x: number, z: number, lim?: number) => {
      let best: { ux: number; uz: number; w: number; d: number; qx: number; qz: number } | null = null;
      for (const r of ctxJson.roads) {
        if (r.lod || r.br || !CARRIAGE.has(r.c)) continue;
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L = Math.hypot(dx, dz) || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
          const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
          if (!best || d < best.d || (d < best.d + 0.5 && r.w > best.w)) best = { ux: dx / L, uz: dz / L, w: r.w, d, qx, qz };
        }
      }
      return best && best.d < (lim ?? 8) ? best : null;
    };
    const masts: THREE.Matrix4[] = [], mastData: THREE.Color[] = [], hyd: THREE.Matrix4[] = [], subs: THREE.Matrix4[] = [], stops: THREE.Matrix4[] = [], shelters: THREE.Matrix4[] = [];
    const stopSigns: THREE.Matrix4[] = [], allWay: THREE.Matrix4[] = [], yieldSigns: THREE.Matrix4[] = [];
    const na = look.region === 'na';
    // Junction control (src/sim/traffic.ts): the same analysis ships with the tile to the life sim,
    // so the lit lens and the stop sign are what the traffic actually obeys.
    const TB2 = extras.box;
    junctions = analyzeJunctions(ctxJson.roads, ctxJson.points, na, (x, z) => inSlice(x, z) && (!TB2 || (x >= TB2.x0 && x < TB2.x1 && z >= TB2.z0 && z < TB2.z1)));
    for (const J of junctions) {
      for (const m of J.arms) {
        if (!m.inb) continue; // no traffic arrives down a one-way leaving the junction
        const right = [m.dz, -m.dx]; // kerb side of the traffic arriving along this arm
        if (m.ctl === CTL.SIG_A || m.ctl === CTL.SIG_B) {
          // the mast on the far-right corner, its arm over the lanes, the heads facing the arrivals
          // (an arm meeting the main road at a slant puts that corner in the main road: the kerb)
          const q = offCarriageway(kerbNear, J.x - m.dx * J.setback + right[0] * (m.w / 2 + 1.3), J.z - m.dz * J.setback + right[1] * (m.w / 2 + 1.3), 0.18);
          if (!q) continue;
          const [x, z] = q;
          if (walk.blocked(x, z, 0.4) || terrain.sdfAt(x, z) < 1) continue;
          masts.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(-right[0], -right[1])), V(1, 1, na ? Math.min(1.6, (m.w / 2 + 1.3) / 5) : 0.35)));
          mastData.push(new THREE.Color(J.key, m.ctl === CTL.SIG_B ? 1 : 0, 1));
          walk.addLoop([[x - 0.18, z - 0.18], [x + 0.18, z - 0.18], [x + 0.18, z + 0.18], [x - 0.18, z + 0.18]]);
        } else if (m.ctl === CTL.STOP || m.ctl === CTL.ALL_STOP || m.ctl === CTL.YIELD) {
          // the sign at the stop line (where a stopped car's bumper is, behind the crosswalk), on
          // the kerb to the right, facing the arrivals
          const back = J.setback + STOP_BACK - 2.1;
          const q = offCarriageway(kerbNear, J.x + m.dx * back + right[0] * (m.w / 2 + 0.7), J.z + m.dz * back + right[1] * (m.w / 2 + 0.7), 0.06);
          if (!q) continue;
          const [x, z] = q;
          if (walk.blocked(x, z, 0.25) || terrain.sdfAt(x, z) < 1) continue;
          const mt = new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(m.dx, m.dz)), V(1, 1, 1));
          (m.ctl === CTL.YIELD ? yieldSigns : m.ctl === CTL.ALL_STOP && na ? allWay : stopSigns).push(mt);
          walk.addLoop([[x - 0.06, z - 0.06], [x + 0.06, z - 0.06], [x + 0.06, z + 0.06], [x - 0.06, z + 0.06]]);
        }
      }
    }
    for (const p of json.points) {
      if (!inSlice(p.x, p.z) || p.own === 0) continue;
      if (p.c === 'signal') {
        // a signal at a junction is drawn with the junction above; one mid-block (a crosswalk) here
        if (junctions.some((J) => J.signal && Math.hypot(J.x - p.x, J.z - p.z) < 22)) continue;
        const s = segAt(p.x, p.z);
        if (!s) continue;
        const nx = -s.uz, nz = s.ux;
        // two masts on opposite corners, each arm reaching over its half of the road
        for (const sd of [1, -1]) {
          const q = offCarriageway(kerbNear, p.x + nx * sd * (s.w / 2 + 1.3) - s.ux * sd * (s.w / 2 + 2.2), p.z + nz * sd * (s.w / 2 + 1.3) - s.uz * sd * (s.w / 2 + 2.2), 0.18);
          if (!q) continue;
          const [x, z] = q;
          if (walk.blocked(x, z, 0.4) || terrain.sdfAt(x, z) < 1) continue;
          const yaw = Math.atan2(-nx * sd, -nz * sd); // local +z (the arm) points back across the road
          masts.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, na ? Math.min(1.6, (s.w / 2 + 1.3) / 5) : 0.35)));
          mastData.push(new THREE.Color(signalKey(p.x, p.z), 0, 1));
          walk.addLoop([[x - 0.18, z - 0.18], [x + 0.18, z - 0.18], [x + 0.18, z + 0.18], [x - 0.18, z + 0.18]]);
        }
      } else if (p.c === 'hydrant') {
        const q = offCarriageway(kerbNear, p.x, p.z, 0.18); // (on the sidewalk, however near the street's line it's mapped)
        if (!q || walk.blocked(q[0], q[1], 0.3)) continue;
        const [x, z] = q;
        hyd.push(new THREE.Matrix4().makeTranslation(x, terrain.heightAt(x, z), z));
        walk.addLoop([[x - 0.18, z - 0.18], [x + 0.18, z - 0.18], [x + 0.18, z + 0.18], [x - 0.18, z + 0.18]], -Infinity, terrain.heightAt(x, z) + 0.8);
      } else if (p.c === 'bus' || p.c === 'bus_shelter') {
        // the stop stands on the sidewalk just behind the kerb, whatever side of it OSM put the node
        const s = segAt(p.x, p.z, 25);
        if (!s) continue;
        let nx = p.x - s.qx, nz = p.z - s.qz;
        const nl = Math.hypot(nx, nz);
        if (nl < 0.2) (nx = -s.uz), (nz = s.ux); else (nx /= nl), (nz /= nl);
        const x = s.qx + nx * (s.w / 2 + 0.7), z = s.qz + nz * (s.w / 2 + 0.7);
        if (walk.blocked(x, z, 0.3) || terrain.sdfAt(x, z) < 1) continue;
        stops.push(new THREE.Matrix4().makeTranslation(x, terrain.heightAt(x, z), z));
        walk.addLoop([[x - 0.12, z - 0.12], [x + 0.12, z - 0.12], [x + 0.12, z + 0.12], [x - 0.12, z + 0.12]]);
        if (p.c === 'bus_shelter') {
          // a glass-and-steel shelter a few steps along, its back to the buildings
          const sx = x + nx * 1.4 + s.ux * 2.6, sz = z + nz * 1.4 + s.uz * 2.6;
          const yaw = Math.atan2(nx, nz); // local +z faces away from the road: the back wall
          const c = Math.cos(yaw), sn = Math.sin(yaw), corners: P[] = [[-1.8, -0.7], [1.8, -0.7], [1.8, 0.75], [-1.8, 0.75]].map(([u, v]) => [sx + u * c + v * sn, sz - u * sn + v * c]);
          if (corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.1)) || terrain.sdfAt(sx, sz) < 1) continue;
          shelters.push(new THREE.Matrix4().compose(V(sx, terrain.heightAt(sx, sz), sz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
          // the back and the two ends are walls; the open front faces the kerb
          const wall = (a: P, b: P) => walk.addLoop([a, b, [b[0] + 0.05, b[1] + 0.05], [a[0] + 0.05, a[1] + 0.05]], -Infinity, terrain.heightAt(sx, sz) + 2.4);
          wall(corners[3], corners[2]);
          wall(corners[0], corners[3]);
          wall(corners[1], corners[2]);
        }
      } else if (p.c === 'subway') {
        const s = segAt(p.x, p.z);
        const yaw = s ? Math.atan2(s.ux, s.uz) : 0; // the stair runs along the kerb
        subs.push(new THREE.Matrix4().compose(V(p.x, terrain.heightAt(p.x, p.z), p.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
        const c = Math.cos(yaw), sn = Math.sin(yaw), corners: P[] = [[-0.9, -2.2], [0.9, -2.2], [0.9, 2.2], [-0.9, 2.2]].map(([u, v]) => [p.x + u * c + v * sn, p.z - u * sn + v * c]);
        walk.addLoop(corners, -Infinity, terrain.heightAt(p.x, p.z) + 1.0);
      }
    }
    if (masts.length) {
      const dark = na ? 0x4a4f4c : 0x3a3d40;
      const head = (z: number) => [
        colored(new THREE.BoxGeometry(0.3, 1.0, 0.34).translate(0, 5.25, z), 0x1f2224),
        // lenses on the face the traffic sees (across the arm)
        colored(new THREE.BoxGeometry(0.05, 0.2, 0.2).translate(0.17, 5.55, z), 0xb8392e),
        colored(new THREE.BoxGeometry(0.05, 0.2, 0.2).translate(0.17, 5.25, z), 0xd9a43a),
        colored(new THREE.BoxGeometry(0.05, 0.2, 0.2).translate(0.17, 4.95, z), 0x3f9a62),
      ];
      // pole + arm (arm length scales with the road via the instance z-scale; the pole doesn't
      // stretch visibly — it's thin and the scale is applied along the arm axis only)
      const g = mergeGeometries([
        colored(new THREE.CylinderGeometry(0.12, 0.16, 6.2, 8).translate(0, 3.1, 0), dark),
        colored(new THREE.BoxGeometry(0.1, 0.12, 5).translate(0, 5.95, 2.5), dark),
        ...head(2.8), ...head(4.8),
      ]);
      const im = new THREE.InstancedMesh(g, propMaterial({ signal: true }), masts.length);
      masts.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, mastData[i]); });
      im.name = 'street:signals';
      im.layers.enable(1);
      group.add(im);
    }
    // stop / all-way / yield signs: a galvanised post, the plate facing the arrivals (local +z)
    const signPost = () => colored(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6).translate(0, 1.15, -0.03), 0x9aa0a2);
    const octagon = (r: number, y: number, z: number, hex: number) => colored(new THREE.CylinderGeometry(r, r, 0.02, 8).rotateX(Math.PI / 2).rotateZ(Math.PI / 8).translate(0, y, z), hex);
    const signSets: [THREE.Matrix4[], () => THREE.BufferGeometry[], string][] = [
      [stopSigns, () => [signPost(), octagon(0.38, 2.15, 0.0, 0xf2efe6), octagon(0.34, 2.15, 0.012, 0xb8392e)], 'street:stop'],
      [allWay, () => [signPost(), octagon(0.38, 2.15, 0.0, 0xf2efe6), octagon(0.34, 2.15, 0.012, 0xb8392e), colored(new THREE.BoxGeometry(0.5, 0.16, 0.02).translate(0, 1.66, 0.005), 0xb8392e), colored(new THREE.BoxGeometry(0.44, 0.1, 0.01).translate(0, 1.66, 0.018), 0xf2efe6)], 'street:allway'],
      [yieldSigns, () => [signPost(), colored(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 3).rotateX(Math.PI / 2).translate(0, 2.1, 0.0), 0xb8392e), colored(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 3).rotateX(Math.PI / 2).translate(0, 2.07, 0.012), 0xf2efe6)], 'street:yield'],
    ];
    for (const [list, geo, name] of signSets) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(mergeGeometries(geo()), propMaterial(), list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.name = name;
      im.layers.enable(1);
      group.add(im);
    }
    if (hyd.length) {
      const g = mergeGeometries([
        colored(new THREE.CylinderGeometry(0.13, 0.15, 0.62, 8).translate(0, 0.31, 0), na ? 0xb5322a : 0xc9a13a),
        colored(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.62, 0), na ? 0xb5322a : 0xc9a13a),
        colored(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6).rotateZ(Math.PI / 2).translate(0, 0.42, 0), 0xd8d2c4),
      ]);
      const im = new THREE.InstancedMesh(g, propMaterial(), hyd.length);
      hyd.forEach((m, i) => im.setMatrixAt(i, m));
      im.name = 'street:hydrants';
      group.add(im);
    }
    if (stops.length) {
      // the stop sign: a pole and a plate in the region's transit colours
      const plate = na ? 0x2d5d9f : look.region === 'eu' ? 0xe0b52a : 0xc23b2e;
      const g = mergeGeometries([
        colored(new THREE.CylinderGeometry(0.04, 0.045, 2.9, 6).translate(0, 1.45, 0), 0x6d7174),
        colored(new THREE.BoxGeometry(0.46, 0.62, 0.03).translate(0, 2.55, 0.05), plate),
        colored(new THREE.BoxGeometry(0.34, 0.16, 0.035).translate(0, 2.62, 0.05), 0xf2f0ea),
        colored(new THREE.BoxGeometry(0.32, 0.4, 0.06).translate(0, 1.6, 0.06), 0x3b3f44), // the timetable case
      ]);
      const im = new THREE.InstancedMesh(g, propMaterial(), stops.length);
      stops.forEach((m, i) => im.setMatrixAt(i, m));
      im.name = 'street:busstops';
      group.add(im);
    }
    if (shelters.length) {
      const steel = 0x4b5054, glass = 0xa7bcc2;
      const g = mergeGeometries([
        colored(new THREE.BoxGeometry(3.8, 0.1, 1.6).translate(0, 2.45, 0), steel), // roof
        colored(new THREE.BoxGeometry(3.5, 1.9, 0.03).translate(0, 1.2, 0.72), glass), // back glass
        colored(new THREE.BoxGeometry(0.03, 1.9, 1.2).translate(-1.78, 1.2, 0.1), glass),
        colored(new THREE.BoxGeometry(0.03, 1.9, 1.2).translate(1.78, 1.2, 0.1), 0xe8e2cf), // the lit ad panel end
        ...[-1.8, 1.8].flatMap((x) => [-0.72, 0.72].map((z) => colored(new THREE.BoxGeometry(0.07, 2.45, 0.07).translate(x, 1.22, z), steel))),
        colored(new THREE.BoxGeometry(2.2, 0.06, 0.38).translate(0, 0.46, 0.45), 0x6a6e70), // the bench
        colored(new THREE.BoxGeometry(0.06, 0.44, 0.3).translate(-0.9, 0.22, 0.45), steel),
        colored(new THREE.BoxGeometry(0.06, 0.44, 0.3).translate(0.9, 0.22, 0.45), steel),
      ]);
      const im = new THREE.InstancedMesh(g, propMaterial(), shelters.length);
      shelters.forEach((m, i) => im.setMatrixAt(i, m));
      im.name = 'street:bus-shelters';
      group.add(im);
    }
    if (subs.length) {
      const rail = 0x2f4a3a;
      const g = mergeGeometries([
        colored(new THREE.BoxGeometry(1.7, 0.02, 4.2).translate(0, 0.01, 0), 0x1c1d1f), // the stair well, dark
        colored(new THREE.BoxGeometry(0.05, 1.0, 4.3).translate(-0.88, 0.5, 0), rail),
        colored(new THREE.BoxGeometry(0.05, 1.0, 4.3).translate(0.88, 0.5, 0), rail),
        colored(new THREE.BoxGeometry(1.8, 1.0, 0.05).translate(0, 0.5, 2.15), rail),
        colored(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6).translate(-0.88, 1.3, -2.1), rail),
        colored(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6).translate(0.88, 1.3, -2.1), rail),
      ]);
      const im = new THREE.InstancedMesh(g, propMaterial(), subs.length);
      subs.forEach((m, i) => im.setMatrixAt(i, m));
      im.name = 'street:subway';
      group.add(im);
      const globe = new THREE.InstancedMesh(colored(mergeGeometries([new THREE.SphereGeometry(0.17, 10, 8).translate(-0.88, 2.2, -2.1), new THREE.SphereGeometry(0.17, 10, 8).translate(0.88, 2.2, -2.1)]), 0x8fd08a), propMaterial({ emissive: new THREE.Color(0.35, 0.9, 0.4), emissiveNight: true }), subs.length);
      subs.forEach((m, i) => { globe.setMatrixAt(i, m); const e = new THREE.Vector3().setFromMatrixPosition(m); lampHeads.push(V(e.x, e.y + 2.2, e.z)); });
      globe.name = 'street:subway-globes';
      group.add(globe);
    }
  }
  for (const [key, list] of parked) {
    const [type, gear] = key.split('|') as [CarType, string];
    const im = new THREE.InstancedMesh(carLib(type, (gear || null) as CarGear | null).clone(), propMaterial(), list.length);
    im.name = `parked-cars:${type}${gear ? ':' + gear : ''}`; // player/vehicles.ts finds these to let you drive off in one
    list.forEach((p, i) => { im.setMatrixAt(i, p.m); im.setColorAt(i, p.c); });
    im.layers.enable(1);
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- mapped fences: timber post-and-rail, iron railings, chain-link ----------
  // The map's fence_type decides; untyped, a fence in a dense core is an iron railing (a Midtown
  // tree pit or church yard), elsewhere the painted post-and-rail of a yard or a field.
  const fm = new THREE.Group();
  const FENCE = {
    wood: { posts: [] as THREE.Matrix4[], rails: [] as THREE.Matrix4[], step: 2.2, railsY: [0.35, 0.95] },
    iron: { posts: [] as THREE.Matrix4[], rails: [] as THREE.Matrix4[], step: 2.4, railsY: [0.12, 1.12] },
    chain: { posts: [] as THREE.Matrix4[], rails: [] as THREE.Matrix4[], step: 3.0, railsY: [0.08, 0.95, 1.78] },
  };
  const FENCE_TOP: Record<keyof typeof FENCE, number> = { wood: 1.15, iron: 1.25, chain: 1.85 }; // (the posts' tops: fenceParts)
  const bayM: THREE.Matrix4[] = []; // iron: one metre of square bars per instance
  // A fence across a door's way in has a gate there: the map draws the fence line through it (the
  // gate is a node on it, if at all), and a yard fence along the front stood between the walk and
  // the door. The gap: where the fence crosses the door's line, within 6 m of the wall, 1.4 m wide.
  const doorsNear = extras.doors ?? [];
  const fenceGaps = (ax: number, az: number, bx: number, bz: number): [number, number][] => {
    const out: [number, number][] = [];
    const sx = bx - ax, sz = bz - az, L = Math.hypot(sx, sz);
    for (const d of doorsNear) {
      if (Math.min(Math.abs(d.wx - ax), Math.abs(d.wx - bx)) > L + 8 || Math.min(Math.abs(d.wz - az), Math.abs(d.wz - bz)) > L + 8) continue;
      // fence line a + t·s against the door's line w + u·n, u in (0, 6]
      const den = sx * d.nz - sz * d.nx;
      if (Math.abs(den) < 1e-6) continue;
      const qx = d.wx - ax, qz = d.wz - az;
      const t = (qx * d.nz - qz * d.nx) / den, u = (qx * sz - qz * sx) / den;
      if (u <= 0 || u > 6 || t < -0.1 || t > 1.1) continue;
      const half = (0.7 + d.w / 2) / Math.max(0.35, Math.abs(den) / L) / L; // (a slanting fence opens wider along itself)
      out.push([t - half, t + half]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  // Steps or a deck low over a fence's line: the fence stops short of them (a raised shore house's
  // stair runs down its side, over the lot-line fence the map draws there — the fence walled off
  // the flight, and stood through its treads). A bridge or a landing high over it leaves it be.
  // The spans of a-b (as fractions) by a deck lower than the fence's top, 15 cm clear each side.
  const deckGaps = (ax: number, az: number, bx: number, bz: number, top: number): [number, number][] => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.2)), m = 0.15 / Math.max(L, 1e-6);
    const out: [number, number][] = [];
    let open: number | null = null;
    // (within 80 cm of one too: a fence along a flight's side walls off the way to its foot)
    const near = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]];
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, g = terrain.heightAt(x, z);
      const on = near.some(([ox, oz]) => walk.decksAt(x + ox, z + oz).some((h) => h < g + top + 0.3));
      if (on && open === null) open = Math.max(0, t - 1 / n);
      if (!on && open !== null) { out.push([open - m, t + m]); open = null; }
    }
    if (open !== null) out.push([open - m, 1 + m]);
    return out;
  };
  for (const l of json.lines) {
    if (l.c !== 'fence') continue;
    const p0 = unpackPts(l.p);
    if (!p0.some(([x, z]) => inSlice(x, z, -20))) continue;
    const mid = p0[Math.floor(p0.length / 2)];
    const kind = l.ft === 1 ? 'iron' : l.ft === 2 ? 'chain' : l.ft === 3 ? 'wood' : urban(mid[0], mid[1]) ? 'iron' : 'wood';
    const F = FENCE[kind];
    // the fence's runs between its gates, and off any steps or landing standing over its line
    const runs: [number, number][][] = [];
    for (let i = 0; i + 1 < p0.length; i++) {
      const [ax, az] = p0[i], [bx, bz] = p0[i + 1];
      let t0 = 0;
      const gaps = [...fenceGaps(ax, az, bx, bz), ...deckGaps(ax, az, bx, bz, FENCE_TOP[kind])].sort((a, b) => a[0] - b[0]);
      for (const [g0, g1] of gaps) {
        if (g0 > t0) runs.push([[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * g0, az + (bz - az) * g0]]);
        t0 = Math.max(t0, g1);
      }
      if (t0 < 1) runs.push([[ax + (bx - ax) * t0, az + (bz - az) * t0], [bx, bz]]);
    }
    for (const [[ax, az], [bx, bz]] of runs) {
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) continue;
      const ang = Math.atan2(bz - az, bx - ax);
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang);
      const n = Math.max(1, Math.round(L / F.step));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        F.posts.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), q, V(1, 1, 1)));
      }
      for (const y of F.railsY) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        F.rails.push(new THREE.Matrix4().compose(V(mx, terrain.heightAt(mx, mz) + y, mz), q, V(L, 1, 1)));
      }
      if (kind === 'iron') {
        const nb = Math.max(1, Math.round(L));
        for (let k = 0; k < nb; k++) {
          const t = (k + 0.5) / nb, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          bayM.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), q, V(L / nb, 1, 1)));
        }
      }
      // (up to its top: a deck, a bridge, a stair's upper flight passes over a fence line)
      walk.addWall([ax, az], [bx, bz], -Infinity, Math.max(terrain.heightAt(ax, az), terrain.heightAt(bx, bz)) + FENCE_TOP[kind] + 0.1);
    }
  }
  const fenceParts: [keyof typeof FENCE, THREE.BufferGeometry, THREE.BufferGeometry][] = [
    ['wood', colored(new THREE.BoxGeometry(0.1, 1.15, 0.1).translate(0, 0.575, 0), 0xefebe2), colored(new THREE.BoxGeometry(1, 0.07, 0.04), 0xefebe2)],
    ['iron', colored(new THREE.BoxGeometry(0.06, 1.25, 0.06).translate(0, 0.625, 0), 0x232120), colored(new THREE.BoxGeometry(1, 0.035, 0.03), 0x232120)],
    ['chain', colored(new THREE.CylinderGeometry(0.03, 0.03, 1.85, 6).translate(0, 0.925, 0), 0x9aa0a2), colored(new THREE.BoxGeometry(1, 0.03, 0.03), 0xa9aeb0)],
  ];
  for (const [k, postG, railG] of fenceParts) {
    const F = FENCE[k];
    if (!F.posts.length) continue;
    const post = new THREE.InstancedMesh(postG, propMaterial(), F.posts.length);
    F.posts.forEach((mt, i) => post.setMatrixAt(i, mt));
    const rail = new THREE.InstancedMesh(railG, propMaterial(), F.rails.length);
    F.rails.forEach((mt, i) => rail.setMatrixAt(i, mt));
    post.name = rail.name = `fence:${k}`;
    post.layers.enable(1);
    fm.add(post, rail);
  }
  if (bayM.length) {
    const bars: THREE.BufferGeometry[] = [];
    for (let u = -0.45; u <= 0.46; u += 0.13) bars.push(new THREE.BoxGeometry(0.018, 1.1, 0.018).translate(u, 0.6, 0));
    const bay = new THREE.InstancedMesh(colored(mergeGeometries(bars), 0x232120), propMaterial(), bayM.length);
    bayM.forEach((mt, i) => bay.setMatrixAt(i, mt));
    bay.name = 'fence:iron';
    fm.add(bay);
  }
  if (fm.children.length) group.add(fm);

  // ---------- curbside mailboxes for the houses with a mapped address ----------
  // North American curbs only (elsewhere the post goes through the door); a street mixes styles,
  // chosen per house by position so neighbouring tiles agree.
  // A box stands at its own street's kerb, and buildings.ts knows only the plain streets: where a
  // slip road or a trunk runs past that kerb (a junction's link — Sea Bright's Ocean Avenue at Rumson
  // Road), the post stood in the link's lane (tools/playtest.js __ROADPOSTS__). A box in any
  // carriageway is left out, and the hydrant beside it with it.
  if (extras.mailboxes?.length) extras.mailboxes = extras.mailboxes.filter((b) => { const q = offCarriageway(kerbNear, b.x, b.z, 0.35); return !!q && q[0] === b.x && q[1] === b.z; });
  if (extras.mailboxes?.length && look.region === 'na') {
    const MIX: [MailboxStyle, number][] = [['post', 5], ['rural', 2], ['newspaper', 1.5], ['brick', 1], ['lantern', 1]];
    const MBC = [0x2b2d30, 0x2b2d30, 0xf2efe6, 0x3e5b45, 0x2c3e5c, 0x7a2a26];
    const byStyle = new Map<MailboxStyle, { m: THREE.Matrix4; c: THREE.Color }[]>();
    for (const b of extras.mailboxes) {
      const st = pickFrom(MIX, hashf(Math.floor(b.x * 10) * 7919 + Math.floor(b.z * 10)));
      if (!byStyle.has(st)) byStyle.set(st, []);
      // the door faces the street (the mailbox yaw points −z at the house)
      byStyle.get(st)!.push({ m: new THREE.Matrix4().compose(V(b.x, terrain.heightAt(b.x, b.z), b.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), b.yaw + Math.PI), V(1, 0.94 + hashf(Math.floor(b.x * 3)) * 0.12, 1)), c: new THREE.Color(MBC[Math.floor(hash01(Math.floor(b.x * 10) ^ Math.floor(b.z * 10)) * MBC.length)]) });
      const r0 = st === 'brick' ? 0.3 : 0.14;
      walk.addLoop([[b.x - r0, b.z - r0], [b.x + r0, b.z - r0], [b.x + r0, b.z + r0], [b.x - r0, b.z + r0]]);
    }
    for (const st of MAILBOXES) {
      const list = byStyle.get(st);
      if (!list) continue;
      const im = new THREE.InstancedMesh(mailboxLib(st).clone(), propMaterial(), list.length);
      im.name = `mailbox:${st}`;
      list.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
      im.layers.enable(1);
      group.add(im);
    }
  }
  if (stands.length) {
    const parts: THREE.BufferGeometry[] = [];
    for (const [x, zz] of [[-0.8, -0.7], [0.8, -0.7], [-0.8, 0.7], [0.8, 0.7]]) parts.push(colored(new THREE.BoxGeometry(0.14, 2.4, 0.14).translate(x, 1.2, zz).rotateX(zz * 0.12), 0xf4f1ea));
    parts.push(colored(new THREE.BoxGeometry(1.9, 0.12, 1.6).translate(0, 2.4, 0), 0xf4f1ea));
    parts.push(colored(new THREE.BoxGeometry(1.9, 1.0, 0.12).translate(0, 2.95, -0.75), 0xf4f1ea));
    parts.push(colored(new THREE.BoxGeometry(1.4, 0.35, 0.05).translate(0, 3.2, 0.3), 0xc2412f));
    for (let k = 0; k < 4; k++) parts.push(colored(new THREE.BoxGeometry(1.7, 0.06, 0.1).translate(0, 0.4 + k * 0.5, 0.78), 0xf4f1ea));
    // the guard's seat on the platform, against the back (GUARD_SEAT: crowd.ts sits the lifeguard on it)
    parts.push(colored(new THREE.BoxGeometry(1.1, 0.06, 0.46).translate(0, GUARD_SEAT - 0.03, -0.42), 0xf4f1ea));
    for (const sx of [-0.5, 0.5]) parts.push(colored(new THREE.BoxGeometry(0.06, GUARD_SEAT - 2.46, 0.4).translate(sx, (GUARD_SEAT + 2.46) / 2, -0.42), 0xf4f1ea));
    const im = new THREE.InstancedMesh(mergeGeometries(parts), propMaterial(), stands.length);
    im.name = 'beach:lifeguard'; // (the review's beach shot frames one when the umbrellas are packed away)
    stands.forEach((m, i) => im.setMatrixAt(i, m));
    im.layers.enable(1);
    group.add(im);
  }

  // ---------- mapped small furniture: post boxes, bike racks, fountains, bollards, pay stations ----------
  // (assets/street.ts) Each exactly where the map puts it, turned to face the nearest street; one
  // mapped on the carriageway itself (a node a metre off, a width that counts the parking lanes)
  // steps back onto the sidewalk — all but a bollard, which may well stand in the road.
  {
    const KIND: Record<string, StreetKind> = { postbox: look.region === 'eu' && look.driveLeft ? 'pillarbox' : 'postbox', bikerack: 'bikerack', drinking: 'drinking', bollard: 'bollard', meter: 'meter', viewpoint: 'viewer' };
    const HALF: Record<StreetKind, [number, number]> = { postbox: [0.28, 0.26], pillarbox: [0.3, 0.3], bikerack: [1.25, 0.85], drinking: [0.25, 0.25], bollard: [0.12, 0.12], meter: [0.2, 0.16], viewer: [0.25, 0.25] };
    const near = streetsNear(ctxJson.roads);
    const byKey = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
    for (const p of json.points) {
      const k = KIND[p.c];
      if (!k || !inSlice(p.x, p.z) || terrain.sdfAt(p.x, p.z) < 1 || walk.buildingAt(p.x, p.z) >= 0) continue;
      let x = p.x, z = p.z, best: { d: number; ex: number; ez: number; w: number } | null = null;
      for (const r of near(x, z))
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, sx = r.p[i + 2] / 10 - ax, sz = r.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
          const ex = ax + sx * t, ez = az + sz * t, d = Math.hypot(ex - x, ez - z);
          if (d < (best?.d ?? 25)) best = { d, ex, ez, w: r.w };
        }
      let dx = 0, dz = 1; // toward the street
      if (k === 'viewer') {
        // a viewer looks where the map says the view is (`direction`), else down the slope — the
        // way the trees in front of it are kept low (views.ts)
        const vd = viewDir(p, (qx, qz) => terrain.heightAt(qx, qz));
        if (vd) [dx, dz] = vd;
        best = null; // (no stepping back off a street: it stands where it's mapped)
      } else if (best) {
        const l = best.d || 1;
        (dx = (best.ex - x) / l), (dz = (best.ez - z) / l);
        if (best.d < 0.05) (dx = 0), (dz = 1);
        if (k !== 'bollard' && best.d < best.w / 2 + 0.3) (x = best.ex - dx * (best.w / 2 + 0.7)), (z = best.ez - dz * (best.w / 2 + 0.7));
      }
      const yaw = Math.atan2(dx, dz), [hx, hz] = HALF[k], c = Math.cos(yaw), sn = Math.sin(yaw);
      const corners: P[] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [x + u * c + v * sn, z - u * sn + v * c]);
      if (corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.05))) continue;
      const u = hashf(Math.floor(x * 13) * 7919 + Math.floor(z * 11)), v = Math.floor(u * STREET_VARIANTS);
      const key = `${k}:${k === 'bikerack' ? v : 0}`;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push({
        m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)),
        c: new THREE.Color(streetPaint(k, look.region, hashf(Math.floor(x * 5) + Math.floor(z * 3) * 977))),
      });
      walk.addLoop(corners, -Infinity, terrain.heightAt(x, z) + (k === 'meter' ? 1.6 : 1.0));
    }
    for (const [key, list] of byKey) {
      const [k, v] = key.split(':');
      const im = new THREE.InstancedMesh(streetLib(k as StreetKind, +v).clone(), propMaterial(), list.length);
      list.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
      im.name = `street:${key}`;
      im.layers.enable(1);
      group.add(im);
    }
  }

  // ---------- street furniture: hydrants, benches, bins, planters, front hedges ----------
  {
    // Distance from (x,z) to the nearest carriageway edge — the universal "not in the street"
    // check. Street furniture may sit on pavement but never inside the lane.
    const clearOfRoad = (x: number, z: number, margin: number) => {
      const e = roadEdge(x, z);
      return !e || e.d - e.w / 2 > margin;
    };
    const HY = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.13, 0.15, 0.55, 6).translate(0, 0.3, 0), 0xffffff),
      colored(new THREE.SphereGeometry(0.14, 6, 5).scale(1, 0.7, 1).translate(0, 0.6, 0), 0xffffff),
      colored(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 5).rotateZ(Math.PI / 2).translate(0, 0.44, 0), 0xffffff),
      colored(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 5).translate(0, 0.68, 0), 0xffffff),
    ]);
    const hydrants: THREE.Matrix4[] = [], hydCol: THREE.Color[] = [];
    for (const b of extras.mailboxes ?? []) {
      if (hash01(Math.floor(b.x * 7) ^ Math.floor(b.z * 13)) > 0.26) continue; // ~1 in 4 curbs
      const a = b.yaw + Math.PI / 2;
      // (along the kerb from the box, 60 cm behind the kerb's face: the box's post stands at 45)
      const x = b.x + Math.sin(a) * 4.2 - Math.sin(b.yaw) * 0.15, z = b.z + Math.cos(a) * 4.2 - Math.cos(b.yaw) * 0.15;
      // (in the tile's own ground: over its edge are the next tile's doors and steps, which this
      // one doesn't know — a hydrant stood on a neighbour's bottom step)
      if (!ownGround(x, z, 1.6) || walk.blocked(x, z, 1.6) || !clearOfRoad(x, z, 0.35)) continue;
      // (at its kerb, as the box is: one a bend or the street's end leaves standing off it isn't placed)
      let gap = Infinity;
      for (const r of ctxJson.roads) {
        if (r.lod || r.br || r.tu || !/^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|trunk)$/.test(r.c)) continue;
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          gap = Math.min(gap, Math.hypot(ax + dx * t - x, az + dz * t - z) - r.w / 2);
        }
      }
      if (!(gap > 0.35 && gap <= 1)) continue;
      hydrants.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), b.yaw), V(1, 1, 1)));
      hydCol.push(new THREE.Color(hash01(Math.floor(x * 5) ^ Math.floor(z * 5)) < 0.8 ? 0xb03024 : 0xd9a52c));
      walk.addLoop([[x - 0.14, z - 0.14], [x + 0.14, z - 0.14], [x + 0.14, z + 0.14], [x - 0.14, z + 0.14]], -Infinity, terrain.heightAt(x, z) + 0.7);
    }
    if (hydrants.length) {
      const im = new THREE.InstancedMesh(HY, propMaterial(), hydrants.length);
      hydrants.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, hydCol[i]); });
      im.name = 'street:hydrants:kerb';
      im.layers.enable(1);
      group.add(im);
    }

    // Benches: real bench points, plus a rim of them inside plazas, parks, pitches and the
    // beach edge (seaward-facing there). They belong on pavement, so no paved check.
    const BEN = mergeGeometries([
      colored(new THREE.BoxGeometry(1.7, 0.08, 0.45).translate(0, 0.46, 0), 0xffffff),
      colored(new THREE.BoxGeometry(1.7, 0.4, 0.06).rotateX(-0.12).translate(0, 0.82, -0.22), 0xffffff),
      ...[-0.65, 0.65].flatMap((x) => [
        colored(new THREE.BoxGeometry(0.08, 0.46, 0.38).translate(x, 0.23, 0), 0x4a4239),
        colored(new THREE.BoxGeometry(0.08, 0.5, 0.06).translate(x, 0.7, -0.2), 0x4a4239),
      ]),
    ]);
    const benches: THREE.Matrix4[] = [], benCol: THREE.Color[] = [];
    const benchAt = (x: number, z: number, yaw: number) => {
      if (walk.blocked(x, z, 1.4) || !clearOfRoad(x, z, 1.6)) return;
      benches.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
      benCol.push(new THREE.Color(rng.pick([0x8a6a4a, 0x9a8f80, 0x5d6e4f, 0x7a5b46])));
      walk.addLoop([[x - 0.85, z - 0.3], [x + 0.85, z - 0.3], [x + 0.85, z + 0.3], [x - 0.85, z + 0.3]], -Infinity, terrain.heightAt(x, z) + 0.9);
    };
    for (const p of json.points) if (p.c === 'bench') benchAt(p.x, p.z, rng.float() * 6.28);
    for (const a of json.areas) {
      if (!['plaza', 'grass', 'pitch', 'pool', 'beach', 'playground'].includes(a.c)) continue;
      const ring = a.o?.[0];
      if (!ring || ring.length < 8) continue;
      const pts = unpackPts(ring);
      const acx = pts.reduce((s, p) => s + p[0], 0) / pts.length, acz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const faceOut = a.c === 'beach'; // beach benches look at the water
      let along = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        along += L;
        if (along < 42) continue;
        along = 0;
        const rx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * 0.5, rz = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * 0.5;
        const cl = Math.hypot(acx - rx, acz - rz) || 1;
        const bx = rx + ((acx - rx) / cl) * 1.1, bz = rz + ((acz - rz) / cl) * 1.1; // a step inside the area, off any kerb
        const yaw = Math.atan2(acx - bx, acz - bz) + (faceOut ? Math.PI : 0);
        benchAt(bx, bz, yaw);
      }
    }
    if (benches.length) {
      const im = new THREE.InstancedMesh(BEN, propMaterial(), benches.length);
      benches.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, benCol[i]); });
      im.layers.enable(1);
      group.add(im);
    }

    // Bins: beside ~40% of benches, near plaza edges and a sprinkle at parking corners.
    const CAN = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.26, 0.24, 0.72, 7).translate(0, 0.38, 0), 0xffffff),
      colored(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 7).translate(0, 0.76, 0), 0x3a3d38),
      colored(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6).translate(0, 0.83, 0), 0x3a3d38),
    ]);
    const cans: THREE.Matrix4[] = [], canCol: THREE.Color[] = [];
    const canAt = (x: number, z: number, mapped = false) => {
      if (mapped) {
        const q = offCarriageway(kerbNear, x, z, 0.2); // (a mapped bin a metre into the street: the kerb)
        if (!q) return;
        [x, z] = q;
      }
      if (mapped ? walk.blocked(x, z, 0.25) || walk.buildingAt(x, z) >= 0 : walk.blocked(x, z, 1.2) || !clearOfRoad(x, z, 1.0)) return;
      cans.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(1, 1, 1)));
      canCol.push(new THREE.Color(rng.pick([0x4a5548, 0x5a6166, 0x3e4a42, 0x6a6e5c])));
      walk.addLoop([[x - 0.2, z - 0.2], [x + 0.2, z - 0.2], [x + 0.2, z + 0.2], [x - 0.2, z + 0.2]], -Infinity, terrain.heightAt(x, z) + 0.85);
    };
    for (const p of json.points) if (p.c === 'bin' && inSlice(p.x, p.z)) canAt(p.x, p.z, true); // (the map's own, first)
    benches.forEach((m, i) => {
      if (i % 3 !== 0) return;
      const e = m.elements;
      const a = rng.float() * 6.28;
      canAt(e[12] + Math.sin(a) * 1.5, e[14] + Math.cos(a) * 1.5);
    });
    if (cans.length) {
      const im = new THREE.InstancedMesh(CAN, propMaterial(), cans.length);
      cans.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, canCol[i]); });
      im.layers.enable(1);
      group.add(im);
    }

    // Planters beside doors + hedge strips flanking the front walk — both need door data.
    if (extras.doors?.length) {
      const POT = mergeGeometries([
        colored(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 6).translate(0, 0.15, 0), 0xa9623f),
        blob(0.26, 0.42, 0, 0, 31),
      ]);
      const pots: THREE.Matrix4[] = [];
      const hedgeM: THREE.Matrix4[] = [], hedgeC: THREE.Color[] = [];
      const yardM: THREE.Matrix4[] = [], yardC: THREE.Color[] = [], ironM: THREE.Matrix4[] = [];
      const picketM: THREE.Matrix4[] = [], picketC: THREE.Color[] = [];
      for (const d of extras.doors) {
        const h0 = hash01(Math.floor(d.wx * 11) ^ Math.floor(d.wz * 17));
        const tx = -d.nz, tz = d.nx; // along the house front
        if (h0 < 0.2) {
          // planter pair tucked beside the door (just outside its way in: tileBuild doorApron)
          for (const s of h0 < 0.08 ? [-1, 1] : [h0 < 0.12 ? -1 : 1]) {
            const o = s * (d.w / 2 + 0.6), x = d.wx + d.nx * 0.7 + tx * o, z = d.wz + d.nz * 0.7 + tz * o;
            if (walk.blocked(x, z, 0.22)) continue;
            pots.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion(), V(1, 0.9 + h0, 1)));
            walk.addLoop([[x - 0.16, z - 0.16], [x + 0.16, z - 0.16], [x + 0.16, z + 0.16], [x - 0.16, z + 0.16]], -Infinity, terrain.heightAt(x, z) + 0.6);
          }
        }
        // the front-yard edge by building tradition: picket fences where houses wear clapboard,
        // low stucco / block walls (some capped with wrought iron) where they're adobe or stucco
        // and the yards are gravel, clipped hedges elsewhere
        const masonryYard = look.family === 'adobe' || look.family === 'stucco' || look.climate === 'arid';
        const picket = h0 >= 0.6 && h0 < 0.74 && look.region === 'na' && look.family === 'clapboard';
        const yardWall = masonryYard && h0 > 0.38 && h0 < 0.74;
        // estate country: a long clipped hedge along the frontage, well out from the house (the
        // privet walls of an estate lane), not a short run by the walk
        if (look.region === 'na' && hoodAt(d.wx, d.wz) === 'estate' && h0 >= 0.2 && !d.porch) {
          const ok = (x: number, z: number) => ownGround(x, z, 1) && !walk.blocked(x, z, 1) && !paved(x, z) && clearOfRoad(x, z, 2.4);
          for (const D of [16, 12, 8]) {
            let placed = 0;
            for (const s of [-12.4, -9.2, -6, -2.8, 2.8, 6, 9.2, 12.4]) {
              const hx = d.wx + d.nx * D + tx * s, hz = d.wz + d.nz * D + tz * s;
              const ax = hx - tx * 1.6, az = hz - tz * 1.6, bxx = hx + tx * 1.6, bz2 = hz + tz * 1.6;
              if (!ok(hx, hz) || !ok(ax, az) || !ok(bxx, bz2)) continue;
              hedgeM.push(new THREE.Matrix4().compose(V(hx, terrain.heightAt(hx, hz), hz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(tz, tx)), V(1, 1.5 + h0 * 0.6, 1.1)));
              hedgeC.push(new THREE.Color(rng.pick(green)).lerp(new THREE.Color(0x24391f), 0.3));
              walk.addWall([ax, az], [bxx, bz2], -Infinity, terrain.heightAt(hx, hz) + 1.6);
              placed++;
            }
            if (placed >= 3) break; // (a proper run, or try nearer the house)
          }
          continue;
        }
        if (((h0 > 0.38 && h0 < 0.6) || picket || yardWall) && !d.porch) {
          // Hedge run parallel to the front, split to leave the walk clear. Try the yard line
          // first (6 m out) then hug the foundation (2.4 m) — every point must be off pavement,
          // unblocked and at least 2.4 m inside the road edge so it can't land on a sidewalk.
          const LEN = 3.2;
          for (const D of [6.0, 2.4]) {
            let placed = 0;
            for (const s of [-2.8, 2.8]) {
              const hx = d.wx + d.nx * D + tx * s, hz = d.wz + d.nz * D + tz * s;
              const ax = hx - tx * LEN / 2, az = hz - tz * LEN / 2, bxx = hx + tx * LEN / 2, bz2 = hz + tz * LEN / 2;
              const ok = (x: number, z: number) => ownGround(x, z, 1) && !walk.blocked(x, z, 1) && !paved(x, z) && clearOfRoad(x, z, 2.4);
              if (!ok(hx, hz) || !ok(ax, az) || !ok(bxx, bz2)) continue;
              const mt = new THREE.Matrix4().compose(V(hx, terrain.heightAt(hx, hz), hz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(tz, tx)), V(1, 1, 1));
              if (yardWall) { yardM.push(mt); yardC.push(new THREE.Color(look.facadeHouse[Math.floor(h0 * 7919) % look.facadeHouse.length]).multiplyScalar(0.92)); if (h0 > 0.6) ironM.push(mt); }
              else if (picket) { picketM.push(mt); picketC.push(new THREE.Color([0xf2efe6, 0xeae5d8, 0xdcd4c2][Math.floor(h0 * 1000) % 3])); }
              else { hedgeM.push(mt); hedgeC.push(new THREE.Color(rng.pick(green)).lerp(new THREE.Color(0x2e4630), 0.15)); }
              walk.addWall([ax, az], [bxx, bz2], -Infinity, terrain.heightAt(hx, hz) + 0.95);
              placed++;
            }
            if (placed) break; // one row only — foundation fallback fires when the yard is too shallow
          }
        }
      }
      // Café terraces: cafés, restaurants and bars the map names put tables out front — a round
      // table, two bistro chairs, a parasol where it's warm — and, by day, people at them.
      const sets: THREE.Matrix4[] = [], setsP: THREE.Matrix4[] = [], guests: THREE.Matrix4[] = [];
      // tables may stand on the sidewalk (and on mapped footways), never in a carriageway
      const WALKWAYS = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'service', 'track', 'bridleway']);
      const carriageClear = (x: number, z: number, margin: number) => {
        for (const r of ctxJson.roads) {
          if (r.lod || r.br || WALKWAYS.has(r.c)) continue;
          for (let i = 0; i + 3 < r.p.length; i += 2) {
            const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L2 = dx * dx + dz * dz || 1;
            if (Math.abs(ax - x) > 200 && Math.abs(ax + dx - x) > 200) continue;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
            if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r.w / 2 + margin) return false;
          }
        }
        return true;
      };
      const poiKind = new Map<string, string>();
      for (const q of world.json.pois ?? []) poiKind.set(q.name.toLowerCase(), q.kind);
      const warm = look.climate !== 'boreal' && look.climate !== 'polar';
      for (const d of extras.doors) {
        if (d.kind !== 'commercial' || !terraceUse(useOf(d.name, d.use ?? (d.name ? poiKind.get(d.name.toLowerCase()) : undefined)))) continue;
        const tx = -d.nz, tz = d.nx;
        const h0 = hash01(Math.floor(d.wx * 13) ^ Math.floor(d.wz * 7));
        let n = 0;
        for (const along of [-1.9, 1.9, -3.8, 3.8]) {
          for (const out of [2.2, 1.7]) {
            const x = d.wx + d.nx * out + tx * along, z = d.wz + d.nz * out + tz * along;
            if (walk.blocked(x, z, 0.95) || !carriageClear(x, z, 1.0) || terrain.sdfAt(x, z) < 2) continue;
            const yaw = Math.atan2(tx, tz) + (h0 > 0.5 ? Math.PI / 2 : 0);
            const mt = new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1));
            (warm && hashf(Math.floor(x * 9) + Math.floor(z * 11) * 57) < 0.6 ? setsP : sets).push(mt);
            walk.addLoop([[x - 0.45, z - 0.45], [x + 0.45, z - 0.45], [x + 0.45, z + 0.45], [x - 0.45, z + 0.45]], -Infinity, terrain.heightAt(x, z) + 0.8);
            // one or two guests, sitting on the chairs (chairs sit ±0.58 along the table's local x)
            for (const s2 of [-1, 1]) {
              if (hashf(Math.floor(x * 31 + s2) * 7 + Math.floor(z * 17)) > 0.55) continue;
              const cx = x + Math.cos(yaw) * 0.62 * s2, cz = z - Math.sin(yaw) * 0.62 * s2;
              const gy = yaw + (s2 > 0 ? Math.PI / 2 : -Math.PI / 2); // facing the table
              guests.push(new THREE.Matrix4().compose(V(cx, terrain.heightAt(cx, cz), cz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), gy), V(1, 1, 1)));
            }
            n++;
            break;
          }
          if (n >= 3) break;
        }
      }
      const mk = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], name: string) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geo, propMaterial(), list.length);
        im.name = name;
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.layers.enable(1);
        group.add(im);
      };
      const topC = [0xf1ede4, 0x3a3530, 0x2f4a3a][Math.floor(hashf(Math.floor(S.x0) + Math.floor(S.z0)) * 3)];
      mk(mergeDecor(cafeSet(topC, 0x2e2c2a, null)), sets, 'terrace:table');
      mk(mergeDecor(cafeSet(topC, 0x2e2c2a, [0xf2efe6, 0x9c2a26, 0x2f4a6a, 0x3d5a46][Math.floor(hashf(Math.floor(S.z0)) * 4)])), setsP, 'terrace:parasol');
      if (guests.length) {
        const im = new THREE.InstancedMesh(personGeometry(), creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, SEATED: 1 }), guests.length);
        im.name = 'terrace:guests';
        guests.forEach((m, i) => im.setMatrixAt(i, m));
        im.setColorAt(0, new THREE.Color(1, 1, 1));
        guests.forEach((_, i) => im.setColorAt(i, new THREE.Color([0xe8d8b0, 0x5b7fa6, 0xc4553f, 0xf2efe6, 0x6e8c5a, 0xe0a33b, 0x7a5b8c][Math.floor(hashf(i * 7919 + Math.floor(S.x0)) * 7)])));
        im.layers.enable(1);
        group.add(im);
      }

      // Market stalls: a building the map says is a market (`amenity=marketplace` on it) — and a
      // canopy standing against one, the covered walk of a market arcade — puts its trades out
      // along every face that looks onto a street or a walk: a trestle under an awning every 3 m,
      // the vendor behind it, a shopper or two in front by day. From tags, never names.
      {
        type R = { r: P[]; cn: boolean };
        const mk2 = (b: { r: number[] }) => unpackPts(b.r);
        const markets: R[] = ctxJson.buildings.filter((b) => b.u === 'marketplace' && !b.pt).map((b) => ({ r: mk2(b), cn: false }));
        if (markets.length) {
          // canopies touching a market join it (a vertex within 3 m of one)
          const near = (a: P[], b: P[]) => a.some(([x, z]) => b.some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 3));
          for (const b of ctxJson.buildings) if (b.cn && markets.some((m) => near(mk2(b), m.r))) markets.push({ r: mk2(b), cn: true });
          const STREETS = /^(living_street|pedestrian|residential|unclassified|service|tertiary|secondary|primary|footway|path|steps)$/;
          const nearStreet = (x: number, z: number, d: number) => {
            for (const r of ctxJson.roads) {
              if (r.lod || r.tu || !STREETS.test(r.c)) continue;
              for (let i = 0; i + 3 < r.p.length; i += 2) {
                const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L2 = dx * dx + dz * dz || 1;
                if (Math.abs(ax - x) > 150 && Math.abs(ax + dx - x) > 150) continue;
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
                if (Math.hypot(ax + dx * t - x, az + dz * t - z) < d + r.w / 2) return true;
              }
            }
            return false;
          };
          // (a stall may stand on a shared street's edge — a living street, a walk, the market's own
          // street, where cars crawl down the middle among the shoppers — never in a through road's traffic)
          const motorClear = (x: number, z: number) => {
            for (const r of ctxJson.roads) {
              if (r.lod || r.br || r.tu || !/^(residential|unclassified|tertiary|secondary|primary|trunk|motorway)(_link)?$/.test(r.c)) continue;
              const clear = /^(residential|unclassified)$/.test(r.c) ? Math.min(r.w / 2 + 0.3, 2.6) : r.w / 2 + 0.3;
              for (let i = 0; i + 3 < r.p.length; i += 2) {
                const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L2 = dx * dx + dz * dz || 1;
                if (Math.abs(ax - x) > 150 && Math.abs(ax + dx - x) > 150) continue;
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
                if (Math.hypot(ax + dx * t - x, az + dz * t - z) < clear) return false;
              }
            }
            return true;
          };
          const byKind = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
          const vendors: THREE.Matrix4[] = [], shoppers: THREE.Matrix4[] = [];
          const seenStall = new Set<string>(), placed: P[] = [];
          /** A stall at (x, z) with its front toward (fx, fz) — the street — and its back to the
           *  frontage, if it fits there. */
          const stallAt = (x: number, z: number, fx: number, fz: number, under: boolean) => {
            const key = `${Math.round(x)},${Math.round(z)}`;
            // (each stall is its own cell's: a market by a cell edge is in both tiles' context)
            const own = extras.box ? x >= extras.box.x0 && x < extras.box.x1 && z >= extras.box.z0 && z < extras.box.z1 : inSlice(x, z, 4);
            if (seenStall.has(key) || !own || terrain.sdfAt(x, z) < 1 || !motorClear(x, z)) return;
            if (placed.some(([px, pz]) => Math.abs(px - x) < 2.6 && Math.abs(pz - z) < 2.6 && Math.hypot(px - x, pz - z) < 2.6)) return;
            const yaw = Math.atan2(-fx, -fz); // the stall's back (+z) to the market, its front to the street
            const c = Math.cos(yaw), sn = Math.sin(yaw);
            const foot = STALL_FOOT.map(([lx, lz]) => [x + lx * c + lz * sn, z - lx * sn + lz * c] as P);
            if (foot.some(([px, pz]) => walk.blocked(px, pz, 0.2) || (!under && walk.buildingAt(px, pz) >= 0))) return;
            seenStall.add(key);
            placed.push([x, z]);
            const y = terrain.heightAt(x, z), u = hashf(Math.floor(x * 3.7) * 7919 + Math.floor(z * 5.3));
            const kind: StallKind = u < 0.36 ? 'produce' : u < 0.56 ? 'flowers' : u < 0.7 ? 'fish' : u < 0.85 ? 'bakery' : 'crafts';
            const v = Math.floor(hashf(Math.floor(x * 11) + Math.floor(z * 13) * 31) * STALL_VARIANTS);
            const kk = `${kind}:${v}`;
            (byKind.get(kk) ?? byKind.set(kk, []).get(kk)!).push({
              m: new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)),
              c: new THREE.Color(AWNING[Math.floor(hashf(Math.floor(x * 5) * 131 + Math.floor(z * 7)) * AWNING.length)]),
            });
            walk.addLoop(foot, -Infinity, y + 0.9);
            // the vendor behind the table, facing the street
            const vx = x + 1.2 * sn, vz = z + 1.2 * c;
            // (a person's front is its −z: at the stall's own yaw it looks out over the table)
            vendors.push(new THREE.Matrix4().compose(V(vx, terrain.heightAt(vx, vz), vz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
            // a shopper or two at the table, looking at the goods
            for (const side of [-0.65, 0.7]) {
              if (hashf(Math.floor(x * 17 + side * 5) * 131 + Math.floor(z * 19)) > 0.62) continue;
              const sx = x + side * c - 0.55 * sn, sz = z - side * sn - 0.55 * c;
              if (walk.blocked(sx, sz, 0.3)) continue;
              shoppers.push(new THREE.Matrix4().compose(V(sx, terrain.heightAt(sx, sz), sz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw + Math.PI + (hashf(Math.floor(sx * 7)) - 0.5) * 0.6), V(1, 1, 1)));
            }
          };
          for (const mkt of markets) {
            const r = mkt.r;
            for (let i = 0; i < r.length; i++) {
              const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], len = Math.hypot(bx - ax, bz - az);
              if (len < 4) continue;
              const ux = (bx - ax) / len, uz = (bz - az) / len;
              let nx = uz, nz = -ux; // (out of the footprint: flipped when half a metre along it is inside)
              if (pointIn((ax + bx) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5, r)) (nx = -nx), (nz = -nz);
              const mx = (ax + bx) / 2 + nx * 4, mz = (az + bz) / 2 + nz * 4;
              if (walk.buildingAt(mx, mz) >= 0 && !mkt.cn) continue; // (a wall against the next building)
              if (!nearStreet(mx, mz, 8)) continue;
              const n = Math.floor((len - 2) / 3.0);
              for (let k = 0; k < n; k++) {
                const along = 1 + 1.5 + k * 3.0 + ((len - 2) - n * 3.0) / 2;
                // under a canopy the stalls stand beneath it (its middle); against a hall, out front
                const out = mkt.cn ? -1.2 : 1.6;
                stallAt(ax + ux * along + nx * out, az + uz * along + nz * out, nx, nz, mkt.cn);
              }
            }
          }
          // …and the market's streets: the map puts a market on a building, but its trade spills
          // along the streets round it — the shared streets and walks within ~60 m of a market hall
          // get stalls down both sides, backs to the frontage, fronts to the street (Pike Place's
          // stalls line the street, whichever building carries the tag)
          {
            const halls: P[] = markets.filter((m) => !m.cn).map((m) => [m.r.reduce((a, q) => a + q[0], 0) / m.r.length, m.r.reduce((a, q) => a + q[1], 0) / m.r.length]);
            const SHARED = /^(residential|living_street|pedestrian|unclassified|service|footway)$/;
            for (const rd of ctxJson.roads) {
              if (rd.lod || rd.br || rd.tu || !SHARED.test(rd.c) || rd.sv === 'driveway' || rd.sv === 'parking_aisle') continue;
              const pts = unpackPts(rd.p);
              for (let i = 0; i + 1 < pts.length; i++) {
                const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
                if (len < 3) continue;
                const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
                for (let t = 1.5; t < len - 1; t += 3) {
                  const cx = ax + ux * t, cz = az + uz * t;
                  if (!halls.some(([hx, hz]) => Math.hypot(hx - cx, hz - cz) < 60)) continue;
                  for (const sd of [1, -1]) {
                    // on the street's edge: past the lane a car crawls down, short of the frontage
                    const off = Math.max(2.9, rd.w / 2 + 0.9);
                    stallAt(cx + nx * off * sd, cz + nz * off * sd, -nx * sd, -nz * sd, false);
                  }
                }
              }
            }
          }
          for (const [kk, list] of byKind) {
            const [kind, v] = kk.split(':');
            const im = new THREE.InstancedMesh(stallLib(kind as StallKind, +v).clone(), propMaterial(), list.length);
            im.name = `market:${kk}`;
            list.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
            im.layers.enable(1);
            group.add(im);
          }
          const people = vendors.concat(shoppers);
          if (people.length) {
            const im = new THREE.InstancedMesh(personGeometry(), creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1 }), people.length);
            im.name = 'market:people';
            const cols = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0xf2efe6, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0x2f3a4a, 0x9c6b4a];
            people.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(cols[Math.floor(hashf(i * 7919 + Math.floor(S.x0)) * cols.length)])); });
            im.layers.enable(1);
            group.add(im);
          }
        }
      }

      if (pots.length) {
        const im = new THREE.InstancedMesh(POT, propMaterial(), pots.length);
        pots.forEach((m, i) => im.setMatrixAt(i, m));
        im.layers.enable(1);
        group.add(im);
      }
      if (picketM.length) {
        const im = new THREE.InstancedMesh(picketGeo(), propMaterial(), picketM.length);
        im.name = 'fence:picket';
        picketM.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, picketC[i]); });
        im.layers.enable(1);
        group.add(im);
      }
      if (yardM.length) {
        // a 3.2 m run of rendered wall with a projecting cap
        const wall = mergeGeometries([
          colored(new THREE.BoxGeometry(3.2, 0.95, 0.24).translate(0, 0.475, 0), 0xffffff),
          colored(new THREE.BoxGeometry(3.26, 0.07, 0.32).translate(0, 0.985, 0), 0xf2ede4),
        ]);
        const im = new THREE.InstancedMesh(wall, propMaterial(), yardM.length);
        im.name = 'fence:yardwall';
        yardM.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, yardC[i]); });
        im.layers.enable(1);
        group.add(im);
        if (ironM.length) {
          // wrought-iron railing along the top: square bars every 0.12 m and a top rail
          const bars: THREE.BufferGeometry[] = [];
          for (let u = -1.55; u <= 1.56; u += 0.12) bars.push(new THREE.BoxGeometry(0.025, 0.55, 0.025).translate(u, 1.3, 0));
          bars.push(new THREE.BoxGeometry(3.2, 0.04, 0.04).translate(0, 1.58, 0));
          const iron = new THREE.InstancedMesh(colored(mergeGeometries(bars), 0x232120), propMaterial(), ironM.length);
          iron.name = 'fence:iron';
          ironM.forEach((m, i) => iron.setMatrixAt(i, m));
          group.add(iron);
        }
      }
      if (hedgeM.length) {
        const im = new THREE.InstancedMesh(colored(hedgeGeo(), 0xffffff), propMaterial({ foliage: true }), hedgeM.length);
        hedgeM.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, hedgeC[i]); });
        im.layers.enable(1);
        group.add(im);
      }
    }
  }

  // ---------- gardens: foundation beds along the house fronts (assets/flora.ts) ----------
  // Species from the region's garden mix; in bloom when the real calendar says so (seasons flip
  // south of the equator). A house plants one or two species, a few of each either side of the
  // door, on open (unpaved, unblocked) ground only — storefronts on sidewalks get none.
  const month = worldDate().getUTCMonth() + 1, south = json.origin.lat < 0; // (the world's day: ?date=)
  const gardenMix = plantMix(look.climate, look.eco);
  const beds = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
  const bed = (sp: PlantSpecies, v: number, x: number, z: number, yaw: number, s: number) => {
    const bloom = inBloom(sp, month, south);
    const key = `${sp}|${v}|${bloom ? 1 : 0}`;
    if (!beds.has(key)) beds.set(key, []);
    beds.get(key)!.push({ m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(s, s * (0.9 + hashf(Math.floor(x * 13)) * 0.2), s)), c: new THREE.Color(rng.pick(green)).lerp(new THREE.Color(0x6f9a48), 0.25) });
    if (SPECIES[sp].h >= 1) walk.addLoop([[x - 0.3, z - 0.3], [x + 0.3, z - 0.3], [x + 0.3, z + 0.3], [x - 0.3, z + 0.3]], -Infinity, terrain.heightAt(x, z) + SPECIES[sp].h * s);
  };
  for (const d of extras.doors ?? []) {
    const h0 = hashf(Math.floor(d.wx * 13) * 7919 + Math.floor(d.wz * 11));
    if (h0 > 0.7) continue; // not every house gardens
    const tx = -d.nz, tz = d.nx;
    const spA = pickFrom(gardenMix, hashf(Math.floor(d.wx * 3) + Math.floor(d.wz * 5) * 31));
    const spB = pickFrom(gardenMix, hashf(Math.floor(d.wx * 5) * 17 + Math.floor(d.wz * 3)));
    const out = 0.8 + SPECIES[spA].w * 0.35;
    for (const side of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const along = side * (1.4 + k * (0.9 + SPECIES[spA].w * 0.4));
        const x = d.wx + d.nx * out + tx * along, z = d.wz + d.nz * out + tz * along;
        if (paved(x, z) || walk.blocked(x, z, 0.45) || terrain.sdfAt(x, z) < 1) continue;
        const sp = k === 2 || (h0 > 0.45 && k === 1) ? spB : spA;
        bed(sp, variantAt(x, z, 2, 5), x, z, hashf(Math.floor(x * 7)) * 6.28, 0.8 + hashf(Math.floor(z * 7)) * 0.35);
      }
  }
  for (const [key, list] of beds) {
    const [sp, v, bl] = key.split('|');
    const stage = bl === '1' ? STAGES - 1 : STAGES - 2;
    const im = new THREE.InstancedMesh(plantLib(sp as PlantSpecies, +v, stage, bl === '1', true).clone(), propMaterial({ wind: true }), list.length);
    im.name = `garden:${sp}`;
    list.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
    im.layers.enable(1);
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- a summer beach: umbrellas, towels and chairs around the lifeguard stands ----------
  // Handed to the micro layer with its umbrella cells (crowd.ts appends them to the tile's micro
  // records): drawn by the same manager, someone on each chair and towel, all of it out on the sand
  // only in its party's hours (`beachGear`).
  const beachGear: Gear[] = [];
  const warmMonth = south ? ((month + 5) % 12) + 1 : month;
  if (standAt.length && warmMonth >= 6 && warmMonth <= 9 && look.climate !== 'boreal' && look.climate !== 'polar') {
    const UMB = [0x3a8ac0, 0xd8342c, 0x2e8a6a, 0xf2c23a, 0xe0705a, 0x5a4a9a];
    const TOW = [0xf2c23a, 0x5aa4c8, 0xe0705a, 0x8ac06a, 0xd86a9a, 0xf2efe6];
    for (const [sx, sz] of standAt) {
      const gx = terrain.oceanDistAt(sx - 6, sz) - terrain.oceanDistAt(sx + 6, sz), gz = terrain.oceanDistAt(sx, sz - 6) - terrain.oceanDistAt(sx, sz + 6);
      const L = Math.hypot(gx, gz) || 1, sea = [gx / L, gz / L], along = [-sea[1], sea[0]];
      const n = 5 + Math.floor(hashf(Math.floor(sx) * 31 + Math.floor(sz)) * 8);
      for (let i = 0; i < n; i++) {
        const u = hashf(Math.floor(sx) * 131 + i * 7919), w = hashf(Math.floor(sz) * 71 + i * 104729);
        const a = (u - 0.5) * 90, b = -6 + w * 16; // up and down the beach, toward and back from the water
        const x = sx + along[0] * a + sea[0] * b, z = sz + along[1] * a + sea[1] * b;
        if (terrain.sdfAt(x, z) < 6 || walk.blocked(x, z, 1.4)) continue;
        const yaw = Math.atan2(-sea[0], -sea[1]) + (u - 0.5) * 0.6; // looking out to sea
        beachGear.push({ k: 'umbrella', x, y: terrain.heightAt(x, z), z, yaw: yaw + (w - 0.5), rgb: UMB[Math.floor(u * 97) % UMB.length] });
        const ox = Math.sin(yaw + 1.6) * 1.2, oz = Math.cos(yaw + 1.6) * 1.2;
        if (w < 0.7) beachGear.push({ k: 'towel', x: x + ox, y: terrain.heightAt(x + ox, z + oz) + 0.01, z: z + oz, yaw, rgb: TOW[Math.floor(w * 91) % TOW.length] });
        if (u < 0.6) beachGear.push({ k: 'chair', x: x - ox * 0.8, y: terrain.heightAt(x - ox * 0.8, z - oz * 0.8), z: z - oz * 0.8, yaw, rgb: TOW[Math.floor(u * 53) % TOW.length] });
      }
    }
  }

  // ---------- picnic tables in the parks and on the greens ----------
  {
    const tables: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    for (const a of json.areas) {
      if (!['grass', 'playground', 'park', 'picnic_site'].includes(a.c)) continue;
      const ring = a.o?.[0];
      if (!ring || ring.length < 8) continue;
      const pts = unpackPts(ring);
      const cx = pts.reduce((q, p) => q + p[0], 0) / pts.length, cz = pts.reduce((q, p) => q + p[1], 0) / pts.length;
      if (!inSlice(cx, cz) || paved(cx, cz) || walk.blocked(cx, cz, 2) || terrain.sdfAt(cx, cz) < 3) continue;
      const yaw = hashf(Math.floor(cx) * 31 + Math.floor(cz)) * 6.28;
      tables.push({ m: new THREE.Matrix4().compose(V(cx, terrain.heightAt(cx, cz), cz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)), c: new THREE.Color([0x8a6a4a, 0x7a5b46, 0x5d6e4f, 0x9a8f80][Math.floor(hashf(Math.floor(cz) * 7) * 4)]) });
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      walk.addLoop([[-0.9, -0.95], [0.9, -0.95], [0.9, 0.95], [-0.9, 0.95]].map(([u, v]) => [cx + u * c + v * sn, cz - u * sn + v * c] as P), -Infinity, terrain.heightAt(cx, cz) + 0.8);
    }
    if (tables.length) {
      const im = new THREE.InstancedMesh(beachLib('picnic').clone(), propMaterial(), tables.length);
      im.name = 'picnic:table';
      tables.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
      im.layers.enable(1);
      group.add(im);
    }
  }

  // ---------- playgrounds: the pieces where the map puts them ----------
  // (`playground=swing/slide/structure/…`, assets/play.ts) — and a mapped playground the map left
  // empty gets a structure, swings and a spring rider or two, fitted inside its outline along its
  // longest side, clear of each other (seeded by position: the same playground every visit).
  {
    const byKind = new Map<PlayKind, { m: THREE.Matrix4; c: THREE.Color }[]>();
    const placed: { x: number; z: number; r: number }[] = [];
    // every way (paths through the playground too) on a grid: a piece keeps off each one
    const waysGrid = new Map<number, [number, number, number, number, number][]>(), WG = 16, wk = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
    for (const r of ctxJson.roads) {
      if (r.lod || r.br || r.tu) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const sg: [number, number, number, number, number] = [r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10, r.w];
        const pad = r.w / 2 + 3;
        for (let u = Math.floor((Math.min(sg[0], sg[2]) - pad) / WG); u <= Math.floor((Math.max(sg[0], sg[2]) + pad) / WG); u++)
          for (let v = Math.floor((Math.min(sg[1], sg[3]) - pad) / WG); v <= Math.floor((Math.max(sg[1], sg[3]) + pad) / WG); v++) (waysGrid.get(wk(u, v)) ?? waysGrid.set(wk(u, v), []).get(wk(u, v))!).push(sg);
      }
    }
    const onWay = (x: number, z: number, r: number) => {
      for (const [ax, az, bx, bz, w] of waysGrid.get(wk(Math.floor(x / WG), Math.floor(z / WG))) ?? []) {
        const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < w / 2 + r) return true;
      }
      return false;
    };
    const put = (k: PlayKind, x: number, z: number, yaw: number, inside?: P[]) => {
      if (!inSlice(x, z) || terrain.sdfAt(x, z) < 1 || walk.blocked(x, z, 0.3)) return false;
      const [hx, hz] = PLAY_FOOT[k], c = Math.cos(yaw), sn = Math.sin(yaw);
      const r = Math.hypot(hx, hz);
      if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 1.2)) return false;
      const corners: P[] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [x + u * c + v * sn, z - u * sn + v * c]);
      if (inside && corners.some(([cx, cz]) => !pointIn(cx, cz, inside))) return false;
      // (a playground's own surface counts as paved: only walls, fences and the ways keep a piece out)
      if (corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.1)) || onWay(x, z, inside ? r * 0.7 : 0.5)) return false;
      placed.push({ x, z, r });
      const y = terrain.heightAt(x, z);
      (byKind.get(k) ?? byKind.set(k, []).get(k)!).push({
        m: new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)),
        c: new THREE.Color(PLAY_PAINT[Math.floor(hashf(Math.floor(x * 3) * 7919 + Math.floor(z * 5)) * PLAY_PAINT.length)]),
      });
      walk.addLoop(corners, -Infinity, y + (k === 'sandpit' || k === 'roundabout' ? 0.35 : 1.2));
      return true;
    };
    for (const p of json.points) {
      if (p.c !== 'play' || !p.sp || !(PLAY_KINDS as string[]).includes(p.sp)) continue;
      // (a way's bearing is its longest side: a slide's or a tower's length is its +z, a swing set's
      // beam and a climbing frame's its x)
      const along = p.sp === 'swing' || p.sp === 'climbingframe' ? Math.PI / 2 : 0;
      const yaw = p.d !== undefined ? Math.PI - (p.d * Math.PI) / 180 + along : hashf(Math.floor(p.x * 7) + Math.floor(p.z * 11) * 131) * 6.28;
      put(p.sp as PlayKind, p.x, p.z, yaw);
    }
    const mapped = ctxJson.points.filter((p) => p.c === 'play');
    for (const a of json.areas) {
      if (a.c !== 'pitch' || a.k !== 'playground' || !a.o.length) continue;
      const ring = unpackPts(a.o[0]);
      let area = 0, bl = 0, ux = 1, uz = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
        const dx = ring[i][0] - ring[j][0], dz = ring[i][1] - ring[j][1], l = Math.hypot(dx, dz);
        if (l > bl) (bl = l), (ux = dx / l), (uz = dz / l);
      }
      area = Math.abs(area) / 2;
      if (area < 60 || mapped.some((p) => pointIn(p.x, p.z, ring))) continue;
      // (an indoor or rooftop playground — its middle inside a building — is the building's)
      const mx = ring.reduce((q, p) => q + p[0], 0) / ring.length, mz = ring.reduce((q, p) => q + p[1], 0) / ring.length;
      if (walk.buildingAt(mx, mz) >= 0) continue;
      const want: PlayKind[] = area > 600 ? ['structure', 'swing', 'climbingframe', 'sandpit', 'springy', 'springy', 'seesaw', 'roundabout'] : area > 250 ? ['structure', 'swing', 'sandpit', 'springy', 'springy'] : ['slide', 'swing', 'springy'];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of ring) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
      const cand: [number, number, number][] = [];
      for (let z = z0 + 1.5; z < z1 - 1.5; z += 2.5) for (let x = x0 + 1.5; x < x1 - 1.5; x += 2.5) if (pointIn(x, z, ring)) cand.push([x, z, hashf(Math.floor(x * 3) * 92821 + Math.floor(z * 7))]);
      cand.sort((p, q) => p[2] - q[2]);
      const yaw = Math.atan2(ux, uz); // (squared to the playground's longest side)
      // (a bounded search: 40 spots a piece, the first that fits)
      for (const k of want) for (const [x, z] of cand.slice(0, 40)) if (put(k, x, z, yaw + (hashf(Math.floor(x) * 31 + Math.floor(z)) < 0.5 ? 0 : Math.PI), ring)) break;
    }
    for (const [k, list] of byKind) {
      const im = new THREE.InstancedMesh(playLib(k).clone(), propMaterial(), list.length);
      list.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
      im.name = `play:${k}`;
      im.layers.enable(1);
      group.add(im);
    }
  }

  // ---------- tall structures: masts, water towers, chimneys, flagpoles (assets/tower.ts) ----------
  // Built where the map puts them, to the mapped height (else a typical one), each scaled from
  // its unit model; a town's water tower in its own colour, a chimney in brick or concrete.
  // One mapped on a building stands on its roof — a city's rooftop tank or antenna, a boiler
  // chimney, a flag up top — rooftop-sized unless the map gives its height (a height past the
  // roof is from the street: the part above it shows). Drawn from the street, it stood inside the
  // building: in its rooms, and in its front door. One mapped in a door's way (a flag over the
  // entrance) stands beside the door: the way in stays clear.
  {
    const KIND: Record<string, TowerKind> = { mast: 'mast', water_tower: 'waterTower', chimney: 'chimney', flagpole: 'flagpole' };
    const byKind = new Map<TowerKind, { m: THREE.Matrix4; c: THREE.Color }[]>();
    const beacons: THREE.Vector3[] = []; // the red obstruction light atop every mast (a night halo)
    const onRoof = roofUnder(ctxJson, terrain);
    for (const p of json.points) {
      const k = KIND[p.c];
      if (!k || !inSlice(p.x, p.z) || terrain.sdfAt(p.x, p.z) < 0) continue;
      const jit = 0.8 + hashf(Math.floor(p.x * 7) * 131 + Math.floor(p.z * 3)) * 0.4;
      const roof = onRoof(p.x, p.z);
      let x = p.x, z = p.z, y0 = terrain.heightAt(p.x, p.z), h = p.h ?? TOWER_H[k] * jit;
      if (roof) {
        y0 = roof.y;
        h = p.h == null ? ROOFTOP_H[k] * jit : p.h > roof.top + 2 ? p.h - roof.top : p.h;
      }
      const r = k === 'mast' ? 0.012 * h + 0.2 : k === 'chimney' ? 0.045 * h : k === 'flagpole' ? 0.12 : 0;
      if (!roof) {
        const at = clearOfDoors(x, z, r, extras.doors ?? []);
        if (at[0] !== x || at[1] !== z) {
          [x, z] = at;
          if (k === 'flagpole' && walk.buildingAt(x, z) >= 0) continue; // (no room beside it either)
          y0 = terrain.heightAt(x, z);
        }
      }
      const u = hashf(Math.floor(p.x * 13) * 7 + Math.floor(p.z * 11));
      const c = new THREE.Color(k === 'waterTower' ? [0xe9eef0, 0xcfd9df, 0xb9cbd6, 0xd6dfcf][Math.floor(u * 4)] : k === 'chimney' ? (u < 0.6 ? CHIMNEY_BRICK : 0xb5b0a6) : 0xffffff);
      (byKind.get(k) ?? byKind.set(k, []).get(k)!).push({ m: new THREE.Matrix4().compose(V(x, y0 - 0.05, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), u * 6.28), V(h, h, h)), c });
      // what you walk into: the mast's legs, the chimney's base, the pole (a water tower you walk
      // under) — from its foot up, so one on a roof never walls off the rooms below it
      if (k === 'mast') beacons.push(V(x, y0 + h * 1.003, z));
      if (r > 0) walk.addLoop([[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]], roof ? y0 - 0.3 : -Infinity, y0 + h);
    }
    for (const [k, list] of byKind) {
      const im = new THREE.InstancedMesh(towerLib(k).clone(), propMaterial(), list.length);
      list.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, q.c); });
      im.name = `tower:${k}`;
      im.layers.enable(1);
      group.add(im);
    }
    if (beacons.length) group.add(haloPoints(beacons, 2.2, new THREE.Color(1.0, 0.22, 0.12)));
  }

  // ---------- courts and fields: hoops, nets, goals, the backstop and bases ----------
  // Each mapped pitch that says its sport (realTile Area.k) gets its gear where the painted lines
  // put it (sports.ts courtFrame / diamondFrame — the same fit the ground paint draws).
  {
    const place = new Map<string, THREE.Matrix4[]>();
    const put = (piece: string, x: number, z: number, fx: number, fz: number) => {
      if (!inSlice(x, z)) return;
      (place.get(piece) ?? place.set(piece, []).get(piece)!).push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(fx, fz)), V(1, 1, 1)));
    };
    const post = (x: number, z: number, r: number, h: number) => walk.addLoop([[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]], -Infinity, terrain.heightAt(x, z) + h);
    for (const a of json.areas) {
      const k = a.k as Sport | 'playground' | undefined;
      if (a.c !== 'pitch' || !k || k === 'playground' || k === 'skateboard' || k === 'american_football') continue;
      const ring = a.o?.[0];
      if (!ring || ring.length < 8) continue;
      const pts = unpackPts(ring);
      if (k === 'baseball' || k === 'softball') {
        const d = diamondFrame(pts, k);
        put('backstop', d.hx, d.hz, d.dx, d.dz);
        put(d.little ? 'bases:1' : 'bases:0', d.hx, d.hz, d.dx, d.dz);
        // the backstop's fence: walls along its panels (backstop recipe: R 8 m round home)
        const bx = -d.dx, bz = -d.dz;
        for (let i = 0; i < 5; i++) {
          const a0 = ((i / 5 - 0.5) * Math.PI * 0.62), a1 = (((i + 1) / 5 - 0.5) * Math.PI * 0.62);
          const P = (t: number): P => [d.hx + (bx * Math.cos(t) - bz * Math.sin(t)) * 8, d.hz + (bx * Math.sin(t) + bz * Math.cos(t)) * 8];
          walk.addWall(P(a0), P(a1));
        }
        continue;
      }
      const f = courtFrame(pts, k);
      const C = COURT[k];
      const at = (u: number, v: number): P => [f.cx + f.ux * u - f.uz * v, f.cz + f.uz * u + f.ux * v];
      for (let i = 0; i < f.n; i++) {
        const v0 = (i - (f.n - 1) / 2) * f.step;
        if (k === 'basketball') {
          // a half court (mapped shorter than two keys) has one hoop, at its far end
          const ends = f.half ? [1] : [-1, 1];
          for (const e of ends) {
            const [x, z] = at(e * (f.L / 2), v0);
            put('hoop', x, z, -e * f.ux, -e * f.uz);
            const [px, pz] = at(e * (f.L / 2 + 1.0), v0);
            post(px, pz, 0.12, 3.3);
          }
        } else if (k === 'tennis' || k === 'pickleball' || k === 'volleyball') {
          const [x, z] = at(0, v0);
          put(k === 'tennis' ? 'tennisNet' : k === 'pickleball' ? 'pickleNet' : 'volleyNet', x, z, f.ux, f.uz);
          const hw = (k === 'tennis' ? 12.8 : k === 'pickleball' ? 6.7 : 10) / 2;
          for (const s of [-1, 1]) { const [qx, qz] = at(0, v0 + s * hw); post(qx, qz, 0.06, 1.2); }
          walk.addWall(at(0, v0 - hw), at(0, v0 + hw));
        } else if (k === 'soccer') {
          const kids = f.L < C.L * 0.7;
          for (const e of [-1, 1]) {
            const [x, z] = at(e * (f.L / 2), v0);
            put(kids ? 'kidsGoal' : 'goal', x, z, -e * f.ux, -e * f.uz);
            const gw = (kids ? 5.5 : 7.32) / 2;
            for (const s of [-1, 1]) { const [qx, qz] = at(e * (f.L / 2), v0 + s * gw); post(qx, qz, 0.07, 2.4); }
          }
        }
      }
    }
    for (const [key, mats] of place) {
      const [piece, v] = key.split(':') as [SportPiece, string | undefined];
      const im = new THREE.InstancedMesh(sportLib(piece, v ? +v : 0).clone(), propMaterial(), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.name = `sport:${piece}`;
      im.layers.enable(1);
      group.add(im);
    }
  }

  const lampPts = lampGround.flat();
  group.add(haloPoints(lampHeads, 1.6, new THREE.Color(1.0, 0.7, 0.38)));
  return { group, lampHeads, lampPts, kerb: new Float32Array(kerb), junc: packJunctions(junctions), beach: { gear: beachGear, stands: beachStands } };
}
