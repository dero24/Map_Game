// Renderer side of ambient life: builds the static world description for the worker (road graph, beach,
// water), owns the shared snapshot buffers, and draws gulls / cars / people / boats as instanced meshes,
// interpolating between sim ticks and animating wings and legs in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Road, World } from '../world/data';
import type { WalkWorld } from '../player/collision';
import type { Door } from '../world/buildings';
import { U, GLSL_NOISE } from '../render/shared';
import { CAPS, H, RANGES, S, SIM_HZ, layout, views, type LifeInit } from './protocol';
import { CAR_TYPES, carMix, carLib, boatLib, pickFrom, carRecipe, type BoatType } from '../assets/kit';
import { gearGeometry, gearFor, type CarGear } from '../assets/furniture';
import { hashf } from '../assets/core';
import { propMaterial } from '../render/propMaterial';
import { activeStyle } from '../world/styles';
import { personLib, warmthFor } from '../assets/people';

// Moving boats offshore: the working/pleasure mix (skiffs and pontoons stay moored near shore).
const LIFE_BOATS: BoatType[] = ['console', 'cabin', 'sail', 'lobster', 'skiff'];
const LIFE_GEAR: CarGear[] = ['rack', 'surf', 'kayak', 'cargo'];
const ROOF = Object.fromEntries(CAR_TYPES.map((t) => [t, carRecipe(t, 1).roof])) as Record<(typeof CAR_TYPES)[number], number>;

export const lifeParams = { density: 1, enabled: true };

const RANK: Record<string, number> = {
  primary: 5, trunk: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 3,
  residential: 2, unclassified: 2, living_street: 2, pedestrian: 1, footway: 0, path: 0,
};

// ---------------- worker init data ----------------
// The slice-scoped parts of the sim world (beach, water, downtown, seaward) are static per region —
// computed once. The road graph and door list rebuild when the streamed tile set changes.
export interface LifeBase {
  seed: number;
  bounds: [number, number, number, number];
  beachPts: Float32Array;
  waterGrid: Uint8Array;
  waterG: [number, number, number, number, number];
  downtown: [number, number, number, number];
  seaward: [number, number];
}

export function buildLifeBase(world: World, walk: WalkWorld): LifeBase {
  const { json, terrain } = world;
  const S0 = json.slice;
  // Sand near the surf, for gulls to land on and beach walkers to wander; seaward = down the ocean-distance slope.
  const beach: number[] = [];
  let sx = 0, sz = 0;
  for (let z = S0.z0 + 20; z < S0.z1 - 20; z += 6)
    for (let x = S0.x0 + 20; x < S0.x1 - 20; x += 6) {
      const d = terrain.sdfAt(x, z);
      if (d < 3 || d > 55 || terrain.oceanDistAt(x, z) > 70 || walk.blocked(x, z, 1)) continue;
      beach.push(x, terrain.heightAt(x, z), z);
      sx += terrain.oceanDistAt(x - 8, z) - terrain.oceanDistAt(x + 8, z);
      sz += terrain.oceanDistAt(x, z - 8) - terrain.oceanDistAt(x, z + 8);
    }
  const sl = Math.hypot(sx, sz);
  const seaward: [number, number] = sl > 1e-6 ? [sx / sl, sz / sl] : [1, 0];

  // Downtown = where the shops are: the middle half of the commercial buildings in the slice.
  const shops: [number, number][] = [];
  for (const b of json.buildings) {
    if (b.k !== 'commercial' || b.lod) continue;
    const x = b.r[0] / 10, z = b.r[1] / 10;
    if (x > S0.x0 && x < S0.x1 && z > S0.z0 && z < S0.z1) shops.push([x, z]);
  }
  const q = (a: number[], t: number) => a.sort((m, n) => m - n)[Math.floor(t * (a.length - 1))];
  const downtown: [number, number, number, number] = shops.length > 4
    ? [q(shops.map((s) => s[0]), 0.2) - 40, q(shops.map((s) => s[1]), 0.2) - 40, q(shops.map((s) => s[0]), 0.8) + 40, q(shops.map((s) => s[1]), 0.8) + 40]
    : [S0.x0, S0.z0, S0.x1, S0.z1];

  const cell = 8;
  const gw = Math.ceil((S0.x1 - S0.x0) / cell), gh = Math.ceil((S0.z1 - S0.z0) / cell);
  const water = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const x = S0.x0 + (i + 0.5) * cell, z = S0.z0 + (j + 0.5) * cell;
      water[j * gw + i] = terrain.sdfAt(x, z) < -14 && x < S0.x1 - 40 && x > S0.x0 + 40 && z > S0.z0 + 40 && z < S0.z1 - 40 ? 1 : 0;
    }
  // Bounds only steer gulls/home anchors — synthetic tiles keep the world (and its road
  // graph) going well past the bake, so agents get a generous 20 km apron, not the slice.
  const PAD = 10000;
  return { seed: 20260923, bounds: [S0.x0 - PAD, S0.z0 - PAD, S0.x1 + PAD, S0.z1 + PAD], beachPts: new Float32Array(beach), waterGrid: water, waterG: [S0.x0, S0.z0, cell, gw, gh], downtown, seaward };
}

export function buildLifeInit(base: LifeBase, roads: Road[], walk: WalkWorld, doors: Door[]): LifeInit {
  const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
  const ways = roads
    .filter((r) => !r.lod && r.own !== 0 && r.c in RANK && r.c !== 'steps')
    .map((r) => {
      const p: [number, number][] = [];
      for (let i = 0; i + 1 < r.p.length; i += 2) p.push([r.p[i] / 10, r.p[i + 1] / 10]);
      return { r, p };
    });
  // Split ways wherever they share a vertex with another way, so intersections become graph nodes.
  const use = new Map<string, number>();
  for (const w of ways) for (const [x, z] of w.p) use.set(key(x, z), (use.get(key(x, z)) ?? 0) + 1);
  const pieces: { r: (typeof ways)[number]['r']; p: [number, number][] }[] = [];
  for (const w of ways) {
    let cur: [number, number][] = [w.p[0]];
    for (let i = 1; i < w.p.length; i++) {
      cur.push(w.p[i]);
      if (i < w.p.length - 1 && (use.get(key(w.p[i][0], w.p[i][1])) ?? 0) > 1) {
        pieces.push({ r: w.r, p: cur });
        cur = [w.p[i]];
      }
    }
    if (cur.length > 1) pieces.push({ r: w.r, p: cur });
  }
  const nodeId = new Map<string, number>();
  const node = (x: number, z: number) => {
    const k = key(x, z);
    if (!nodeId.has(k)) nodeId.set(k, nodeId.size);
    return nodeId.get(k)!;
  };
  const pts: number[] = [], start: number[] = [], count: number[] = [], lens: number[] = [], info: number[] = [], ends: number[] = [];
  for (const { r, p } of pieces) {
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (L < 1) continue;
    const n = Math.max(2, Math.ceil(L / 4) + 1);
    // uniform resample with heights from the walk surface (so bridge decks carry traffic)
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    start.push(pts.length / 3);
    let k = 0;
    for (let j = 0; j < n; j++) {
      const s = (j / (n - 1)) * L;
      while (k < p.length - 2 && cum[k + 1] < s) k++;
      const t = (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
      const x = p[k][0] + (p[k + 1][0] - p[k][0]) * t, z = p[k][1] + (p[k + 1][1] - p[k][1]) * t;
      pts.push(x, walk.surfaceAt(x, z), z);
    }
    count.push(n);
    lens.push(L);
    info.push(RANK[r.c], r.w, r.ow ? 1 : 0, 1);
    ends.push(node(p[0][0], p[0][1]), node(p[p.length - 1][0], p[p.length - 1][1]));
  }
  const nNodes = nodeId.size, nEdges = lens.length;
  const deg = new Int32Array(nNodes + 1);
  for (let e = 0; e < nEdges; e++) (deg[ends[e * 2] + 1]++), (deg[ends[e * 2 + 1] + 1]++);
  for (let i = 0; i < nNodes; i++) deg[i + 1] += deg[i];
  const fill = deg.slice();
  const adj = new Int32Array(deg[nNodes]);
  for (let e = 0; e < nEdges; e++) for (const nd of [ends[e * 2], ends[e * 2 + 1]]) adj[fill[nd]++] = e;

  return {
    ...base,
    // base arrays are shared across reinits — fresh copies, since init buffers transfer to the worker
    beachPts: base.beachPts.slice(),
    waterGrid: base.waterGrid.slice(),
    edgePts: new Float32Array(pts),
    edgeStart: new Int32Array(start),
    edgeCount: new Int32Array(count),
    edgeLen: new Float32Array(lens),
    edgeInfo: new Float32Array(info),
    edgeNodes: new Int32Array(ends),
    nodeEdgeStart: deg,
    nodeEdges: adj,
    doors: new Float32Array(doors.flatMap((d) => [d.x, d.y, d.z, d.fx, d.fy, d.fz])),
  };
}

// ---------------- models ----------------
function part(g: THREE.BufferGeometry, hex: number, id: number) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), pa = new Float32Array(n).fill(id);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function gullGeo() {
  return mergeGeometries([
    part(new THREE.SphereGeometry(1, 8, 6).scale(0.12, 0.11, 0.3), 0xffffff, 0),
    part(new THREE.SphereGeometry(0.085, 8, 6).translate(0, 0.07, -0.27), 0xffffff, 0),
    part(new THREE.ConeGeometry(0.025, 0.1, 5).rotateX(-Math.PI / 2).translate(0, 0.06, -0.38), 0xe8b93a, 0),
    part(box(0.14, 0.03, 0.14, 0, 0.02, 0.33), 0x8e969d, 0),
    part(box(0.5, 0.025, 0.22, 0.33, 0.04, 0.02), 0xa1a9b0, 1),
    part(box(0.5, 0.025, 0.22, -0.33, 0.04, 0.02), 0xa1a9b0, 1),
    part(box(0.16, 0.022, 0.16, 0.66, 0.04, 0.05), 0x2a2c30, 1),
    part(box(0.16, 0.022, 0.16, -0.66, 0.04, 0.05), 0x2a2c30, 1),
    part(box(0.02, 0.2, 0.02, 0.05, -0.17, 0.02), 0xd9a07a, 0),
    part(box(0.02, 0.2, 0.02, -0.05, -0.17, 0.02), 0xd9a07a, 0),
  ]);
}
/** Walkers and residents: the foundry's jointed person (src/assets/people.ts), varied per
 *  instance in the shader — use creatureMaterial({ LEGS: 1, PEOPLE: 1 }). */
export function pedGeo() { return personLib().clone(); }
// Cars and boats come from the asset kit (src/assets/kit.ts): one InstancedMesh per type.
import { peopleU, creatureMaterial } from '../render/creature';
export { peopleU, creatureMaterial };

const CAR_COLORS = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x5a5e64, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e];
const SHIRTS = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0xf2efe6, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0x3f6f78, 0xd98a8a, 0x2f3a4a];
const BOATS = [0xf5f3ee, 0xf5f3ee, 0xe9eef0, 0x2d4a6a, 0xc9d8de, 0x9b3b32];

interface Group { mesh: THREE.InstancedMesh; meshes: THREE.InstancedMesh[]; anim: THREE.InstancedBufferAttribute; range: readonly [number, number]; scale: number }

export interface LifeStats {
  nearestCar: number; carPan: number; carSpeed: number;
  gullsNear: number; gullPan: number; gullDist: number;
  pedsNear: number; active: number; simMs: number; mode: string;
}

export class LifeClient {
  readonly group = new THREE.Group();
  private worker!: Worker; // assigned by spawn() in the constructor
  private buf: ArrayBuffer | SharedArrayBuffer;
  private V: ReturnType<typeof views>;
  private sab: boolean;
  private lastTick = -1;
  private tickAt = 0;
  private groups: Group[] = [];
  private headPts: THREE.Points;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private envFrame = 0;
  readonly stats: LifeStats = { nearestCar: 1e9, carPan: 0, carSpeed: 0, gullsNear: 0, gullPan: 0, gullDist: 1e9, pedsNear: 0, active: 0, simMs: 0, mode: 'sab' };

  constructor(init: LifeInit) {
    this.group.name = 'life';
    this.sab = typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
    const total = layout().total;
    this.buf = this.sab ? new SharedArrayBuffer(total) : new ArrayBuffer(total);
    this.V = views(this.buf);
    this.V.header[H.DENSITY] = 100;
    this.V.header[H.HOUR] = 1200;
    this.spawn(init);

    // One InstancedMesh per model variant (the asset kit's car / boat types); an agent shows
    // in the mesh its variant picks and is zero-scaled in the others.
    const make = (geos: THREE.BufferGeometry | THREE.BufferGeometry[], defines: Record<string, number>, range: readonly [number, number], scale: number, colors?: (i: number) => number, names?: string[]) => {
      const n = range[1] - range[0];
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      const meshes = (Array.isArray(geos) ? geos : [geos]).map((g0, gi) => {
        const geo = g0.clone();
        geo.setAttribute('aAnim', anim);
        const mesh = new THREE.InstancedMesh(geo, creatureMaterial(defines), n);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.layers.enable(1);
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < n; i++) mesh.setMatrixAt(i, zero);
        if (colors) {
          const c = new THREE.Color();
          for (let i = 0; i < n; i++) mesh.setColorAt(i, c.set(colors(i)));
        }
        if (names) mesh.name = names[gi];
        this.group.add(mesh);
        return mesh;
      });
      this.groups.push({ mesh: meshes[0], meshes, anim, range, scale });
    };
    make(gullGeo(), { WINGS: 1 }, RANGES.gulls, 1.8);
    make(CAR_TYPES.map((t) => carLib(t)), {}, RANGES.cars, 1, () => 0xffffff, CAR_TYPES.map((t) => `life-car:${t}`));
    make(pedGeo(), { LEGS: 1, PEOPLE: 1 }, RANGES.peds, 1, () => 0xffffff, ['life-ped']);
    { const st = activeStyle(), now = new Date(); peopleU.uWarmth.value = warmthFor(st.climate, now.getMonth() + 1, st.region === "oceania"); }
    // gear on the roofs of passing cars (placed on each car's own roof height per frame)
    for (const gname of LIFE_GEAR) {
      const m = new THREE.InstancedMesh(gearGeometry(gname, 0, 4.6, 1.86, 1), propMaterial(), CAPS.cars);
      m.name = `life-gear:${gname}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      for (let i = 0; i < CAPS.cars; i++) m.setMatrixAt(i, this.zeroM);
      m.layers.enable(1);
      this.group.add(m);
      this.gear.set(gname, m);
    }
    make(LIFE_BOATS.map((t) => boatLib(t)), {}, RANGES.boats, 1, () => 0xffffff, LIFE_BOATS.map((t) => `life-boat:${t}`));

    // Headlight / masthead halos at night (positions rewritten per frame).
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CAPS.cars * 2 + CAPS.boats) * 3).fill(-9999), 3));
    this.headPts = new THREE.Points(hg, new THREE.ShaderMaterial({
      uniforms: { uNight: U.uNight },
      vertexShader: /* glsl */ `
        varying float vFade;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(900.0 / -mv.z, 1.5, 90.0); vFade = clamp(1.0 + mv.z / 900.0, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uNight; varying float vFade;
        ${GLSL_NOISE}
        void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a * uNight * vFade; gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.headPts.frustumCulled = false;
    this.headPts.renderOrder = 8;
    this.group.add(this.headPts);
  }

  // (Re)start the sim worker with a fresh road graph — called when the streamed tile set changes.
  /** The player's car at (x,z) moving (vx,vz): walkers in its path are knocked down (lifeSim.bump). */
  bump(x: number, z: number, vx: number, vz: number) { this.worker.postMessage({ kind: 'bump', x, z, vx, vz }); }
  onBumped: ((n: number) => void) | null = null;
  /** Moving traffic near the player this frame (x, z, velocity) — the critters give way to it. */
  readonly movers: { x: number; z: number; vx: number; vz: number }[] = [];
  private nMovers = 0;
  /** The road graph changed (tiles streamed in or out): hand the worker the new graph. Its agents
   *  carry over by position (LifeSim.adopt), so traffic and walkers never reset. */
  reinit(init: LifeInit) {
    const transfer = [init.edgePts.buffer, init.edgeStart.buffer, init.edgeCount.buffer, init.edgeLen.buffer, init.edgeInfo.buffer, init.edgeNodes.buffer, init.nodeEdgeStart.buffer, init.nodeEdges.buffer, init.beachPts.buffer, init.waterGrid.buffer, init.doors.buffer] as ArrayBuffer[];
    this.worker.postMessage({ kind: 'regraph', init }, transfer);
  }

  private spawn(init: LifeInit) {
    const total = layout().total;
    this.worker = new Worker(new URL('./ambient.worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (e) => { if (e.data?.kind === 'bumped') this.onBumped?.(e.data.n as number); });
    const transfer: Transferable[] = [init.edgePts.buffer, init.edgeStart.buffer, init.edgeCount.buffer, init.edgeLen.buffer, init.edgeInfo.buffer, init.edgeNodes.buffer, init.nodeEdgeStart.buffer, init.nodeEdges.buffer, init.beachPts.buffer, init.waterGrid.buffer, init.doors.buffer] as ArrayBuffer[];
    if (this.sab) {
      this.worker.postMessage({ kind: 'init', init, sab: this.buf }, transfer);
    } else {
      this.stats.mode = 'copy';
      const pool = [new ArrayBuffer(total), new ArrayBuffer(total)];
      this.worker.postMessage({ kind: 'init', init, pool, header: this.V.header.slice() }, [...transfer, ...pool]);
      this.worker.onmessage = (e) => {
        if (e.data.kind !== 'snap') return;
        const old = this.buf as ArrayBuffer;
        this.buf = e.data.buf as ArrayBuffer;
        const hdr = this.V.header.slice();
        this.V = views(this.buf);
        this.V.header.set(hdr.subarray(H.PLAYER_X, H.WIND + 1), H.PLAYER_X);
        this.worker.postMessage({ kind: 'return', buf: old }, [old]);
      };
    }
  }

  update(now: number, player: { x: number; z: number; yaw: number }, env: { night: number; hour: number; wind: number }) {
    const h = this.V.header;
    this.group.visible = lifeParams.enabled;
    const hdr = [Math.round(player.x * 100), Math.round(player.z * 100), Math.round(env.night * 1000), Math.round(env.hour * 100), Math.round(lifeParams.density * 100), Math.round(env.wind * 1000)];
    h[H.PLAYER_X] = hdr[0]; h[H.PLAYER_Z] = hdr[1]; h[H.NIGHT] = hdr[2]; h[H.HOUR] = hdr[3]; h[H.DENSITY] = hdr[4]; h[H.WIND] = hdr[5];
    if (!this.sab && this.envFrame++ % 3 === 0) this.worker.postMessage({ kind: 'env', header: h.slice() });

    const tick = Atomics.load(h, H.TICK);
    if (tick !== this.lastTick) { this.lastTick = tick; this.tickAt = now; }
    if (tick === 0) return;
    const a = Math.min(1, (now - this.tickAt) / (1000 / SIM_HZ));
    const snap = this.V.snaps[h[H.FRONT]];
    const st = this.stats;
    st.nearestCar = 1e9; st.gullsNear = 0; st.gullDist = 1e9; st.pedsNear = 0;
    this.nMovers = 0;
    st.active = h[H.ACTIVE];
    st.simMs = h[H.SIM_US] / 1000;
    const heads = this.headPts.geometry.attributes.position as THREE.BufferAttribute;
    let hk = 0;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const pan = (x: number, z: number) => {
      const dx = x - player.x, dz = z - player.z, l = Math.hypot(dx, dz) || 1;
      return (dx * -fz + dz * fx) / l;
    };
    for (const g of this.groups) {
      const [r0, r1] = g.range;
      const kind = g.range === RANGES.gulls ? 0 : g.range === RANGES.cars ? 1 : g.range === RANGES.peds ? 2 : 3;
      const A = g.anim.array as Float32Array;
      for (let i = r0; i < r1; i++) {
        const o = i * S.STRIDE, li = i - r0;
        const flags = snap[o + S.FLAGS];
        if (!(flags & 1) || snap[o + S.Y] < -500) {
          for (const mm of g.meshes) mm.setMatrixAt(li, this.zeroM);
          if (kind === 1) for (const gm of this.gear.values()) gm.setMatrixAt(li, this.zeroM);
          continue;
        }
        const x = snap[o + S.PX] + (snap[o + S.X] - snap[o + S.PX]) * a;
        let y = snap[o + S.PY] + (snap[o + S.Y] - snap[o + S.PY]) * a;
        const z = snap[o + S.PZ] + (snap[o + S.Z] - snap[o + S.PZ]) * a;
        let yaw0 = snap[o + S.PYAW], yaw1 = snap[o + S.YAW];
        const d = ((yaw1 - yaw0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const yaw = yaw0 + d * a;
        const amt = snap[o + S.AMT];
        const variant = snap[o + S.VARIANT];
        const lights = flags & 2 ? 1 : 0;
        let sx = g.scale, sy = g.scale, sz = g.scale;
        let roll = 0, pitch = 0, spin = 0;
        const dist = Math.hypot(x - player.x, z - player.z);
        if (kind === 0) {
          if (amt < 0) y += 0.2 * g.scale;
          if (amt >= 0 && dist < 70) { st.gullsNear++; if (dist < st.gullDist) { st.gullDist = dist; st.gullPan = pan(x, z); } }
          roll = amt >= 0 ? -d * 2.5 : 0;
        } else if (kind === 1) {
          if (variant >= 10) { sx = 1.06; sy = 1.22; sz = 1.04; }
          if (dist < st.nearestCar) { st.nearestCar = dist; st.carPan = pan(x, z); st.carSpeed = amt; }
          if (dist < 100 && amt > 2 && this.nMovers < 48) {
            const m = this.movers[this.nMovers] ?? (this.movers[this.nMovers] = { x: 0, z: 0, vx: 0, vz: 0 });
            m.x = x; m.z = z; m.vx = -Math.sin(yaw) * amt; m.vz = -Math.cos(yaw) * amt; this.nMovers++;
          }
          if (lights) {
            const hx = x - Math.sin(yaw) * 2.3, hz = z - Math.cos(yaw) * 2.3;
            const rx = Math.cos(yaw) * 0.62, rz = -Math.sin(yaw) * 0.62;
            heads.setXYZ(hk++, hx + rx, y + 0.76, hz + rz);
            heads.setXYZ(hk++, hx - rx, y + 0.76, hz - rz);
          }
          g.mesh.setColorAt(li, this.tmpC.set(CAR_COLORS[variant % 10 % CAR_COLORS.length]));
          // the kit's vans / SUVs are their own models; each car breathes a little within its type
          sx = 0.97 + hashf(i * 7919 + variant) * 0.06; sy = 0.96 + hashf(i * 104729 + variant) * 0.08; sz = 0.97 + hashf(i * 31 + variant * 131) * 0.06;
        } else if (kind === 2) {
          if (dist < 25) st.pedsNear++;
          if (amt < -0.5 && amt > -1.999) {
            // knocked down: laid back over ~0.15 s with one log-roll as they slide, then sprawled
            // face-up (the pose itself — knees up, an arm flung out — is in the shader)
            const t = -1 - amt;
            pitch = Math.PI / 2 * Math.min(1, t / 0.1);
            spin = Math.PI * 2 * Math.min(1, t / 0.35);
            y += 0.13 * Math.min(1, t / 0.1);
          }
          g.mesh.setColorAt(li, this.tmpC.set(SHIRTS[variant % SHIRTS.length]));
        } else {
          const t = snap[o + S.ANIM];
          y = Math.sin(t * 1.3 + i) * 0.12;
          roll = Math.sin(t * 0.9 + i * 2) * 0.05;
          if (lights) heads.setXYZ(hk++, x, 2.3, z);
          g.mesh.setColorAt(li, this.tmpC.set(BOATS[variant % BOATS.length]));
        }
        this.q.setFromAxisAngle(this.up, yaw);
        if (roll) this.q.multiply(this.tmpQ.setFromAxisAngle(this.fwdAxis, roll));
        if (pitch) this.q.multiply(this.tmpQ.setFromAxisAngle(this.sideAxis, pitch));
        if (spin) this.q.multiply(this.tmpQ.setFromAxisAngle(this.up, spin));
        this.m.compose(this.p.set(x, y, z), this.q, this.sc.set(sx, sy, sz));
        if (g.meshes.length > 1) {
          // the agent's model: a stable pick from its variant (cars follow the street mix)
          const pick = kind === 1 ? CAR_TYPES.indexOf(pickFrom(carMix(activeStyle().region, activeStyle().climate), ((variant * 0.618034) % 1 + (i * 0.1234) % 1) % 1)) : (variant + i) % g.meshes.length;
          if (kind === 1) {
            const gr = gearFor(hashf(i * 613 + variant * 7), this.coastal);
            const gname = gr === 'bike' ? null : gr;
            for (const [gk, gm] of this.gear) {
              if (gk === gname) gm.setMatrixAt(li, this.gm.multiplyMatrices(this.m, this.gt.makeTranslation(0, ROOF[CAR_TYPES[pick]], 0)));
              else gm.setMatrixAt(li, this.zeroM);
            }
          }
          for (let k = 0; k < g.meshes.length; k++) {
            if (k === pick) {
              g.meshes[k].setMatrixAt(li, this.m);
              if (g.meshes[k] !== g.mesh && g.mesh.instanceColor) { g.mesh.getColorAt(li, this.tmpC); g.meshes[k].setColorAt(li, this.tmpC); }
            } else g.meshes[k].setMatrixAt(li, this.zeroM);
          }
        } else g.mesh.setMatrixAt(li, this.m);
        const aph = snap[o + S.ANIM];
        A[li * 3] = aph; A[li * 3 + 1] = amt; // walkers pass the knockdown code (< 0) through to the pose shader A[li * 3 + 2] = lights;
        if (kind === 1) A[li * 3 + 1] = 0;
      }
      if (kind === 1) for (const gm of this.gear.values()) gm.instanceMatrix.needsUpdate = true;
      for (const mm of g.meshes) {
        mm.instanceMatrix.needsUpdate = true;
        if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
      }
      g.anim.needsUpdate = true;
    }
    for (let k = hk; k < heads.count; k++) heads.setXYZ(k, 0, -9999, 0);
    heads.needsUpdate = true;
    this.movers.length = this.nMovers;
  }
  private tmpC = new THREE.Color();
  private zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  private gear = new Map<CarGear, THREE.InstancedMesh>();
  private gm = new THREE.Matrix4();
  private gt = new THREE.Matrix4();
  /** near the coast, cars carry surfboards and kayaks (main sets this from the walker's position) */
  coastal = true;
  private tmpQ = new THREE.Quaternion();
  private fwdAxis = new THREE.Vector3(0, 0, 1);
  private sideAxis = new THREE.Vector3(1, 0, 0);
}
