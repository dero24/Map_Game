// The micro layer's placement: the small things of a lived-in place, for one tile, as plain records
// the main thread's micro layer draws (world/microLayer.ts — 3D close up, impostor cards past a few
// dozen metres, two draws for all of them).
//
// Real data first: what the map tags one by one (a picnic table, an information board, a street
// cabinet, a recycling container, a vending machine, a clock on its post, a fire ring, a grill,
// a planter, the channel's buoys and markers — realTile furnitureClass) stands where the map puts
// it, turned to its street. Then the seeded fill, by what's there and where:
//   - each house with a kerb: its trash and recycling carts — out at the kerb on the town's
//     collection day (a weekday per ~2 km round, from the real calendar), else up by the house;
//     the town's carts one colour (towns buy them by the thousand);
//   - porches: a pair of chairs; a flag on its bracket by the door; on the lawn by the
//     neighbourhood (hood.ts) and the coast: a kayak, a bike, a birdbath, a lawn sign, a realtor's
//     sign; a hoop by the drive (tract and suburb streets); an AC unit beside the house, a grill
//     or a fire ring out back;
//   - shopfronts: an A-frame, planters flanking the door, a newspaper box at the kerb, a bike;
//   - residential kerbs: telephone pedestals, a regulation sign now and then;
//   - a summer beach: umbrellas, chairs, towels and coolers in the dry sand, looking out to sea;
//   - piers: cleats along the edges, dock boxes, life rings, a stack of traps;
//   - the water off the piers: mooring balls, and crab-pot floats further out.
// Every choice is a hash of position (or of the data the thing hangs off), so neighbouring tiles
// and every visitor agree; each tile places only on its own ground. Nothing stands in a building,
// a door's way in or a carriageway; the solid things are walls in the walk world like any prop.
import type { WalkWorld } from '../player/collision';
import type { World, WorldJson, Box, Road } from './data';
import type { Door, Mailbox, Drive, Footprint } from './buildings';
import type { HoodClass } from './hood';
import type { RegionStyle } from './styles';
import { MICRO_KINDS, MICRO_INDEX, type MicroId } from '../assets/micro';
import { hashf } from '../assets/core';
import { carriagewaysNear } from './props';
import { useOf, terraceUse } from './uses';
import { ROAD_RANK } from './roadPalette';
import { sidewalkBand, pavedAprons, SHOPFRONT, PAVED_AREA, segDist, ringDist } from './groundCover';

/** Floats per record: x, y, z, yaw, piece (MICRO_KINDS index), scale, colour 0xRRGGBB, flags. */
export const MICRO_STRIDE = 8;

type P2 = [number, number];

export interface MicroInput {
  /** the tile's own entities (prim) and the ground */
  world: World;
  /** the whole tile json, margin context included (streets a kerb looks to) */
  ctx: WorldJson;
  /** the tile's scratch walk world: every footprint, door apron, deck and prop placed so far */
  walk: WalkWorld;
  footprints: Footprint[];
  doors: Door[];
  mailboxes: Mailbox[];
  drives: Drive[];
  /** the front walks and drives the ground paint lays (x0 z0 x1 z1 width each, buildings.ts) */
  walks?: number[];
  /** the tile's own cell (none: anywhere) */
  box?: Box;
  hood?: (x: number, z: number) => HoodClass;
  style: Pick<RegionStyle, 'region' | 'climate' | 'family'>;
  /** the day the street is dressed for (collection day, the beach season); default today */
  date?: Date;
}

/** The world's date when the player picked one (?date=, sent to the tile worker at init), else the
 *  day itself: the beach crowd follows the season, the carts the collection day. */
let worldDay: Date | null = null;
export function setMicroDate(iso: string | null | undefined) {
  const t = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(iso + 'T12:00:00Z') : NaN;
  worldDay = Number.isFinite(t) ? new Date(t) : null;
}
/** How full a beach is, by the month (warm months of the hemisphere, 1 = January up north): the
 *  season's height in July and August, a handful on a warm day either side, nobody in winter. */
export const BEACH_SEASON = [0, 0, 0, 0, 0.15, 0.7, 1, 1, 0.55, 0.2, 0, 0];

/** A position hash in [0, 1): the same for every visitor and every tile that asks. */
const H = (x: number, z: number, salt = 0) => hashf(Math.floor(x * 10) * 73856093 ^ Math.floor(z * 10) * 19349663 ^ (salt * 83492791));
const pick = <T,>(a: readonly T[], u: number) => a[Math.min(a.length - 1, Math.floor(u * a.length))];
const inRing = (x: number, z: number, r: P2[]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
const unpack = (f: number[]): P2[] => {
  const o: P2[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
  return o;
};
/** The yaw that turns a piece's front (−z) toward direction (dx, dz). */
const facing = (dx: number, dz: number) => Math.atan2(-dx, -dz);

// The paints, by what the thing is (sRGB hex; TINT parts take them).
const CART_TRASH = [0x2f4f3a, 0x3a3d40, 0x26282a, 0x4a5a66, 0x5a4a3a];
const CART_RECYCLE = [0x2f62a8, 0x2f62a8, 0x3a6fb5, 0x2f6a4a, 0xd9a82a];
const CHAIR = [0xf1eee6, 0xf1eee6, 0x9a7a58, 0x3d6a4a, 0xb8392e, 0x5a8ab0, 0xe8d27a];
const SHOP = [0x2f4a3a, 0x3a2e46, 0x6b2b24, 0x23364a, 0x1f2022, 0x7a5b46];
const PLANTER = [0x6b4a32, 0x2f4a3a, 0x3a3d40, 0xf1eee6, 0x23364a];
const NEWS = [0x2f62a8, 0xb8392e, 0xd9a82a, 0x2f4a3a, 0xf1eee6];
const KAYAK = [0xe8622a, 0xf2c23a, 0x3a8ac0, 0x6aa84a, 0xd8342c];
const BIKE = [0x2f6f8f, 0xb8392e, 0x2e2e30, 0x6b8f3a, 0xd8d4c8, 0xc98a2e];
const SIGNS = [0x2f62a8, 0xb8392e, 0x2f4a3a, 0xf2c23a, 0x5a3f6e, 0xf1eee6];
const REALTOR = [0xb8392e, 0x23364a, 0x2f4a3a, 0xc9a227];
const UMB = [0x3a8ac0, 0xd8342c, 0x2e8a6a, 0xf2c23a, 0xe0705a, 0x5a4a9a];
const TOW = [0xf2c23a, 0x5aa4c8, 0xe0705a, 0x8ac06a, 0xd86a9a, 0xf2efe6];
const COOLER = [0x2f62a8, 0xb8392e, 0x3a8a5a, 0xe8622a];
const FLOAT = [0xe8622a, 0xf2c23a, 0xf1eee6, 0x6aa84a, 0xd8342c, 0x2f62a8];
const TRAP = [0xd9a82a, 0x3a6a3a, 0x26282a, 0xb8392e];
const SURF = [0xf2efe6, 0x5aa4c8, 0xf2c23a, 0xe0705a];

/** What a mapped point class (realTile furnitureClass) is drawn as, and its paint. */
const MAPPED: Record<string, { k: MicroId; c: number[]; face?: 'street' | 'free' }> = {
  picnic: { k: 'picnic', c: [0x8a6a4a, 0x7a5b46, 0x5d6e4f, 0x9a8f80], face: 'free' },
  info: { k: 'info', c: [0x5a4632, 0x2f4a3a, 0x23364a] },
  recycling: { k: 'recycling', c: [0x2f6a4a, 0x2f62a8, 0x3a3d40] },
  cabinet: { k: 'cabinet', c: [0x6f7a72, 0x9aa09a, 0x4a5a4e, 0xb9b4a6] },
  vending: { k: 'vending', c: [0xb8392e, 0x2f62a8, 0xe8e4da, 0x2e2e30] },
  clock: { k: 'clock', c: [0x23302a, 0x26282a] },
  bbq: { k: 'grill', c: [0x26282a], face: 'free' },
  firepit: { k: 'firepit', c: [0x8a8682], face: 'free' },
  planter: { k: 'planter', c: PLANTER },
};

export function buildMicro(I: MicroInput): Float32Array {
  const { world, walk, style } = I;
  const { json, terrain } = world;
  const out: number[] = [];
  const OB = I.box;
  const own = (x: number, z: number, m = 0) => !OB || (x >= OB.x0 + m && x < OB.x1 - m && z >= OB.z0 + m && z < OB.z1 - m);
  const date = I.date ?? worldDay ?? new Date();
  const month = date.getUTCMonth() + 1, south = json.origin.lat < 0;
  const warmMonth = south ? ((month + 5) % 12) + 1 : month;
  const na = style.region === 'na';
  const cold = style.climate === 'boreal' || style.climate === 'polar';
  const arid = style.climate === 'arid';
  const hood = I.hood ?? (() => 'suburb' as HoodClass);
  // the carriageways round a point (every street a car drives, the margin's too)
  const near = carriagewaysNear(I.ctx.roads);
  /** How far (x, z) stands outside the nearest carriageway's edge (Infinity: none within 25 m). */
  const kerbOut = (x: number, z: number) => {
    let best = Infinity;
    for (const r of near(x, z))
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, sx = r.p[i + 2] / 10 - ax, sz = r.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
        best = Math.min(best, Math.hypot(ax + sx * t - x, az + sz * t - z) - r.w / 2);
      }
    return best;
  };
  // the pieces placed so far that aren't walls (towels, cleats, floats): kept from piling up
  const soft = new Map<number, number[]>();
  const sk = (x: number, z: number) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
  const softFree = (x: number, z: number, r: number) => {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const a = soft.get(sk(x + i * 4, z + j * 4));
        if (a) for (let q = 0; q + 2 < a.length; q += 3) if (Math.hypot(a[q] - x, a[q + 1] - z) < a[q + 2] + r) return false;
      }
    return true;
  };
  /** Place a piece. `y` absolute (the ground under it when omitted). Solid pieces become walls. */
  const put = (id: MicroId, x: number, z: number, yaw: number, rgb: number, y = terrain.heightAt(x, z), scale = 1) => {
    const k = MICRO_INDEX[id], K = MICRO_KINDS[k];
    out.push(x, y, z, yaw, k, scale, rgb, 0);
    const r = Math.max(K.box[0], K.box[2]) * 0.5 * scale;
    (soft.get(sk(x, z)) ?? soft.set(sk(x, z), []).get(sk(x, z))!).push(x, z, r * 0.8);
    if (K.solid && !K.mount) {
      const [hx, hz, h] = K.solid, c = Math.cos(yaw), s = Math.sin(yaw);
      const pts = ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as P2[]).map(([u, v]) => [x + (c * u + s * v) * scale, z + (-s * u + c * v) * scale] as P2);
      walk.addLoop(pts, -Infinity, y + h * scale);
    }
  };
  /** Room on open ground for a piece of half-size r: own cell, off every wall, footprint, door
   *  way and deck, and `kerb` m clear of the carriageways. */
  const ground = (x: number, z: number, r: number, kerb = 0.4) =>
    own(x, z, 0.5) && terrain.sdfAt(x, z) > 1 && !walk.blocked(x, z, r) && walk.deckAt(x, z) === null && kerbOut(x, z) > kerb + r && softFree(x, z, r);
  // What the ground paint lays paved (groundPaint.ts, groundCover.ts): every street and its sidewalk
  // band, a mapped walk or path, the front walks and drives, the lots and plazas, the concrete round
  // a dense block's buildings and a shop's frontage. The lawn things — a birdbath, a kayak, a bike, a
  // hoop, a lawn sign — stand only off it: on a lawn, or a yard's gravel.
  const SC = 24, segs = new Map<number, number[]>(); // ax az bx bz half, by 24 m cell
  const sKey = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
  const addSeg = (ax: number, az: number, bx: number, bz: number, half: number) => {
    for (let i = Math.floor((Math.min(ax, bx) - half) / SC); i <= Math.floor((Math.max(ax, bx) + half) / SC); i++)
      for (let j = Math.floor((Math.min(az, bz) - half) / SC); j <= Math.floor((Math.max(az, bz) + half) / SC); j++) (segs.get(sKey(i, j)) ?? segs.set(sKey(i, j), []).get(sKey(i, j))!).push(ax, az, bx, bz, half);
  };
  for (const r of I.ctx.roads as Road[]) {
    if (r.lod || r.br || r.tu) continue;
    const half = r.w / 2 + (r.sw ? 0 : sidewalkBand(ROAD_RANK[r.c] ?? 1));
    for (let i = 0; i + 3 < r.p.length; i += 2) addSeg(r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10, half);
  }
  const W = I.walks ?? [];
  for (let i = 0; i + 4 < W.length; i += 5) addSeg(W[i], W[i + 1], W[i + 2], W[i + 3], W[i + 4] / 2);
  const ctxB = I.ctx.buildings.filter((b) => !b.lod && b.r.length >= 6);
  const hard = [
    ...pavedAprons(ctxB.map((b) => ({ ring: unpack(b.r), weight: b.k === 'house' || b.k === 'shed' ? 0.45 : 1 }))),
    ...ctxB.filter((b) => b.k === 'commercial').map((b) => ({ ring: unpack(b.r), band: SHOPFRONT })),
  ].map((h) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of h.ring) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    return { ...h, x0: x0 - h.band, z0: z0 - h.band, x1: x1 + h.band, z1: z1 + h.band };
  });
  const lots = I.ctx.areas.filter((a) => PAVED_AREA.has(a.c) && a.o?.[0] && a.o[0].length >= 6).map((a) => unpack(a.o[0]));
  const paved = (x: number, z: number, r: number) => {
    const L = segs.get(sKey(Math.floor(x / SC), Math.floor(z / SC)));
    if (L) for (let i = 0; i + 4 < L.length; i += 5) if (segDist(x, z, L[i], L[i + 1], L[i + 2], L[i + 3]) < L[i + 4] + r) return true;
    for (const h of hard) if (x > h.x0 - r && x < h.x1 + r && z > h.z0 - r && z < h.z1 + r && ringDist(x, z, h.ring) < h.band + r) return true;
    for (const q of lots) if (ringDist(x, z, q) < r) return true;
    return false;
  };
  /** Room for a lawn thing: open ground, and not paved. */
  const lawnGround = (x: number, z: number, r: number, kerb = 0.4) => ground(x, z, r, kerb) && !paved(x, z, Math.min(r, 0.35));

  // ---------------------------------------------------------------- mapped first
  for (const p of json.points) {
    const m = MAPPED[p.c];
    if (m && own(p.x, p.z) && walk.buildingAt(p.x, p.z) < 0) {
      let x = p.x, z = p.z, yaw = H(x, z, 1) * Math.PI * 2;
      if (m.face !== 'free') {
        // turned to the nearest street; one mapped in a carriageway steps back to its kerb
        let best: { d: number; ex: number; ez: number; w: number } | null = null;
        for (const r of near(x, z))
          for (let i = 0; i + 3 < r.p.length; i += 2) {
            const ax = r.p[i] / 10, az = r.p[i + 1] / 10, sx = r.p[i + 2] / 10 - ax, sz = r.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
            const ex = ax + sx * t, ez = az + sz * t, d = Math.hypot(ex - x, ez - z);
            if (d < (best?.d ?? 25)) best = { d, ex, ez, w: r.w };
          }
        if (best && best.d > 0.05) {
          const dx = (best.ex - x) / best.d, dz = (best.ez - z) / best.d;
          yaw = facing(dx, dz);
          if (best.d < best.w / 2 + 0.8) (x = best.ex - dx * (best.w / 2 + 1.0)), (z = best.ez - dz * (best.w / 2 + 1.0));
        }
      }
      const K = MICRO_KINDS[MICRO_INDEX[m.k]];
      if (walk.blocked(x, z, Math.min(K.box[0], K.box[2]) * 0.4) || kerbOut(x, z) < 0.2) continue;
      put(m.k, x, z, yaw, pick(m.c, H(x, z, 2)));
      continue;
    }
    // the channel's marks: a red nun or a green can, a marker on its pile; a mooring ball
    if ((p.c === 'buoy' || p.c === 'beacon') && own(p.x, p.z) && terrain.sdfAt(p.x, p.z) < 0) {
      const col = /red/.test(p.sp ?? '') ? 0xb8392e : /green/.test(p.sp ?? '') ? 0x2f7a4a : /yellow/.test(p.sp ?? '') ? 0xe0b030 : /black/.test(p.sp ?? '') ? 0x26282a : 0xf1eee6;
      const k: MicroId = p.c === 'beacon' ? 'beacon' : /moor/.test(p.sp ?? '') ? 'buoy' : /con|nun/.test(p.sp ?? '') || col === 0xb8392e ? 'nun' : 'can';
      put(k, p.x, p.z, H(p.x, p.z, 3) * Math.PI * 2, k === 'buoy' ? 0x2f62a8 : col, 0);
    }
  }

  // ---------------------------------------------------------------- houses
  // A town buys its carts by the thousand: their colour is the round's (a ~2 km cell), and so is
  // the collection day (a weekday) — the carts are out at the kerb on that day.
  const round = (x: number, z: number) => [Math.floor(x / 2048), Math.floor(z / 2048)];
  const weekday = date.getUTCDay(); // (0 Sunday)
  const kerbDay = (x: number, z: number) => {
    const [i, j] = round(x, z);
    return 1 + Math.floor(hashf(i * 7919 + j * 104729 + 17) * 5) === weekday;
  };
  const cartPaint = (x: number, z: number, recycle: boolean) => {
    const [i, j] = round(x, z);
    return pick(recycle ? CART_RECYCLE : CART_TRASH, hashf(i * 31337 + j * 7331 + (recycle ? 5 : 3)));
  };
  // the house each kerb box belongs to: the nearest house door within 45 m
  const houseDoors = I.doors.filter((d) => d.kind === 'house');
  const mailOf = new Map<Door, Mailbox>();
  for (const b of I.mailboxes) {
    let best: Door | null = null, bd = 45;
    for (const d of houseDoors) {
      const dd = Math.hypot(d.wx - b.x, d.wz - b.z);
      if (dd < bd) (bd = dd), (best = d);
    }
    if (best && !mailOf.has(best)) mailOf.set(best, b);
  }
  const driveOf = (d: Door) => {
    let best: Drive | null = null, bd = 14;
    for (const v of I.drives) {
      const dd = Math.hypot(v.x - d.wx, v.z - d.wz);
      if (dd < bd) (bd = dd), (best = v);
    }
    return best;
  };
  const coastal = (x: number, z: number) => terrain.oceanDistAt(x, z) < 2500;
  for (const f of I.footprints) {
    if (f.door === undefined || f.kind !== 'house') continue;
    const d = I.doors[f.door];
    if (!d || !own(d.wx, d.wz)) continue;
    const h0 = H(d.wx, d.wz, 11), h1 = H(d.wx, d.wz, 12), h2 = H(d.wx, d.wz, 13), h3 = H(d.wx, d.wz, 14);
    const nx = d.nx, nz = d.nz, tx = -nz, tz = nx; // out of the front wall; along it
    const hd = hood(d.wx, d.wz), sea = coastal(d.wx, d.wz);
    // the house's extent: how far its outline runs behind the door wall, and to either side
    let back = 6, left = 4, right = 4;
    for (const [px, pz] of f.ring) {
      const u = (px - d.wx) * tx + (pz - d.wz) * tz, v = -((px - d.wx) * nx + (pz - d.wz) * nz);
      back = Math.max(back, v);
      if (u < 0) left = Math.max(left, -u);
      else right = Math.max(right, u);
    }
    // 1. the carts: at the kerb by the box on collection day, else up beside the drive or the house
    const mb = mailOf.get(d);
    const cartsOut = hd === 'estate' ? h0 < 0.3 : h0 < 0.9;
    if (cartsOut) {
      const two = h1 < 0.75;
      if (na && mb && kerbDay(mb.x, mb.z)) {
        const ax = Math.cos(mb.yaw), az = -Math.sin(mb.yaw); // along the kerb, away from the walk
        const yaw = mb.yaw + Math.PI + (h2 - 0.5) * 0.3; // (lids to the street, set down a little askew)
        // (the box stands at the kerb; the carts a step back from it, on the walk)
        const bx = -Math.sin(mb.yaw) * 0.4, bz = -Math.cos(mb.yaw) * 0.4;
        for (const [k, o] of [[0, 1.15], [1, 1.95]] as const) {
          if (k === 1 && !two) break;
          const x = mb.x + ax * o + bx, z = mb.z + az * o + bz;
          if (ground(x, z, 0.35, 0.2)) put('cart', x, z, yaw + (k ? 0.12 : 0), cartPaint(x, z, k === 1));
        }
      } else {
        const v = driveOf(d);
        const spots: [number, number, number][] = [];
        if (v) {
          // beside the drive, a step short of the house
          const ux = Math.sin(v.yaw), uz = Math.cos(v.yaw), px = uz, pz = -ux;
          for (const s of h3 < 0.5 ? [1, -1] : [-1, 1]) spots.push([v.x + px * s * 1.95 + ux * 1.6, v.z + pz * s * 1.95 + uz * 1.6, v.yaw + Math.PI]);
        }
        // …or against the house front, past the end of the garden bed
        for (const s of h3 < 0.5 ? [1, -1] : [-1, 1]) {
          const o = s > 0 ? right - 0.6 : -left + 0.6;
          spots.push([d.wx + tx * o + nx * 0.75, d.wz + tz * o + nz * 0.75, Math.atan2(-nx, -nz)]);
        }
        for (const [x, z, yaw] of spots) {
          if (!ground(x, z, 0.35, 1.2)) continue;
          put('cart', x, z, yaw, cartPaint(x, z, false));
          const x2 = x + Math.cos(yaw) * 0.72, z2 = z - Math.sin(yaw) * 0.72;
          if (two && ground(x2, z2, 0.35, 1.2)) put('cart', x2, z2, yaw, cartPaint(x2, z2, true));
          break;
        }
      }
    }
    // 2. the porch: a pair of chairs looking out
    if (d.porch && h1 > 0.4) {
      const c = pick(CHAIR, h2);
      for (const s of [-1, 1]) {
        const o = s * (d.w / 2 + 0.85), x = d.wx + tx * o + nx * 1.0, z = d.wz + tz * o + nz * 1.0;
        const y = walk.deckAt(x, z);
        if (y === null || Math.abs(y - d.y) > 0.2 || walk.touching(x, z, 0.36, y)) continue;
        put('adirondack', x, z, Math.atan2(-nx, -nz) + s * 0.25, c, y);
      }
    }
    // 3. the flag on its bracket by the door (the stars and stripes: North America)
    if (na && h3 < (hd === 'estate' ? 0.32 : hd === 'grid' ? 0.26 : 0.17)) {
      const o = (h2 < 0.5 ? -1 : 1) * (d.w / 2 + 0.38);
      const x = d.wx + tx * o + nx * 0.06, z = d.wz + tz * o + nz * 0.06;
      if (own(x, z)) put('flag', x, z, Math.atan2(-nx, -nz), 0xffffff, d.y + 1.95);
    }
    // 4. the lawn, by the neighbourhood and the coast
    const lawn = (dn: number, dt: number) => [d.wx + nx * dn + tx * dt, d.wz + nz * dn + tz * dt] as P2;
    const u = H(d.wx, d.wz, 21);
    if (sea && !arid && u < 0.11) {
      const [x, z] = lawn(3.2 + h1 * 2, (h2 < 0.5 ? -1 : 1) * (Math.max(left, right) + 1.2));
      if (lawnGround(x, z, 0.9, 1.5)) put('kayak', x, z, Math.atan2(tx, tz) + (h3 - 0.5) * 0.3, pick(KAYAK, h1));
    } else if (u < 0.17) {
      const [x, z] = lawn(2.4, (h2 < 0.5 ? -1 : 1) * (d.w / 2 + 1.7));
      if (lawnGround(x, z, 0.5, 1.5)) put('bike', x, z, Math.atan2(tx, tz), pick(BIKE, h1));
    } else if (u < 0.24 && !arid && hd !== 'grid') {
      const [x, z] = lawn(4.5 + h1 * 2, (h2 < 0.5 ? -1 : 1) * (2.6 + h3 * 2));
      if (lawnGround(x, z, 0.35, 2)) put('birdbath', x, z, h3 * 6.28, 0xffffff);
    }
    if (sea && h1 > 0.9 && d.porch) {
      // a surfboard stood against the porch's end
      const o = (h2 < 0.5 ? 1 : -1) * (d.w / 2 + 2.6), [x, z] = lawn(0.45, o);
      if (lawnGround(x, z, 0.3, 1.5)) put('surfboard', x, z, Math.atan2(nx, nz), pick(SURF, h3));
    }
    if (na && mb) {
      // signs by the walk: a lawn sign (a school, a candidate, a contractor), a realtor's now and then
      const ax = Math.cos(mb.yaw), az = -Math.sin(mb.yaw), hx = -Math.sin(mb.yaw), hz = -Math.cos(mb.yaw);
      const w = H(mb.x, mb.z, 31);
      if (w < (hd === 'estate' ? 0.02 : 0.07)) {
        const x = mb.x - ax * 2.6 + hx * 1.9, z = mb.z - az * 2.6 + hz * 1.9; // (in the yard, behind the walk)
        if (lawnGround(x, z, 0.32, 0.6)) put('yardsign', x, z, mb.yaw + Math.PI + (w - 0.03) * 4, pick(SIGNS, H(mb.x, mb.z, 32)));
      } else if (w > 0.975) {
        const x = mb.x - ax * 3.4 + hx * 2.0, z = mb.z - az * 3.4 + hz * 2.0;
        if (lawnGround(x, z, 0.45, 0.6)) put('salesign', x, z, facing(ax, az), pick(REALTOR, H(mb.x, mb.z, 33)));
      }
    }
    // 5. a hoop by the drive (where kids play in the street: tract and suburb)
    const v = driveOf(d);
    if (na && v && H(v.x, v.z, 41) < (hd === 'tract' ? 0.22 : hd === 'suburb' ? 0.12 : 0.03)) {
      const ux = Math.sin(v.yaw), uz = Math.cos(v.yaw), px = uz, pz = -ux, s = H(v.x, v.z, 42) < 0.5 ? 1 : -1;
      const x = v.x + px * s * 2.05 + ux * 0.6, z = v.z + pz * s * 2.05 + uz * 0.6; // (on the lawn at the drive's edge)
      if (lawnGround(x, z, 0.55, 1)) put('hoop', x, z, v.yaw + Math.PI, 0xffffff);
    }
    // 6. beside and behind: the AC unit at a side wall, a grill or a fire ring out back
    if (!cold && h2 > 0.25) {
      const s = h3 < 0.5 ? 1 : -1, o = s > 0 ? right + 0.75 : -(left + 0.75), dn = -Math.min(back * 0.5, 3 + h1 * 2);
      const [x, z] = lawn(dn, o);
      if (ground(x, z, 0.45, 2)) put('acunit', x, z, Math.atan2(s * tx, s * tz), 0xffffff);
    }
    if (h0 > 0.45) {
      const [x, z] = lawn(-(back + 2.5 + h1 * 3), (h2 - 0.5) * 4);
      const pit = h3 > 0.72 && !arid;
      if (ground(x, z, pit ? 0.7 : 0.35, 3)) put(pit ? 'firepit' : 'grill', x, z, h1 * 6.28, pit ? 0x8a8682 : 0x26282a);
    }
  }

  // ---------------------------------------------------------------- shopfronts
  for (const d of I.doors) {
    if (d.kind !== 'commercial' || !own(d.wx, d.wz)) continue;
    const h0 = H(d.wx, d.wz, 51), h1 = H(d.wx, d.wz, 52), h2 = H(d.wx, d.wz, 53);
    const nx = d.nx, nz = d.nz, tx = -nz, tz = nx;
    const paint = pick(SHOP, h1);
    // (a café, a restaurant, a bar sets its board out most days; a shop now and then)
    if (h0 < (terraceUse(useOf(d.name, d.use)) ? 0.75 : 0.4)) {
      // the A-frame on the sidewalk to one side of the door, its faces to the passers-by
      const s = h2 < 0.5 ? -1 : 1, o = s * (d.w / 2 + 1.0), x = d.wx + tx * o + nx * 1.5, z = d.wz + tz * o + nz * 1.5;
      if (ground(x, z, 0.32, 0.6)) put('aframe', x, z, facing(tx, tz) + (h1 - 0.5) * 0.4, paint);
    }
    if (h0 > 0.35 && h0 < 0.75) {
      for (const s of [-1, 1]) {
        const o = s * (d.w / 2 + 0.85), x = d.wx + tx * o + nx * 0.42, z = d.wz + tz * o + nz * 0.42;
        if (ground(x, z, 0.25, 0.6)) put('planter', x, z, Math.atan2(-tz, tx), pick(PLANTER, h2));
      }
    }
    if (h1 > 0.82) {
      // a newspaper box at the kerb in front
      for (let k = 2; k < 14; k += 0.5) {
        const x = d.wx + nx * k, z = d.wz + nz * k, ko = kerbOut(x, z);
        if (ko > 1.6) continue;
        const bx = x + tx * 2.2 - nx * 0.4, bz = z + tz * 2.2 - nz * 0.4;
        if (ko > 0.3 && ground(bx, bz, 0.26, 0.3)) put('newsbox', bx, bz, facing(-nx, -nz), pick(NEWS, h2));
        break;
      }
    }
    if (h2 > 0.86 || (h2 > 0.7 && coastal(d.wx, d.wz))) {
      const o = (h0 < 0.5 ? 1 : -1) * (d.w / 2 + 2.3), x = d.wx + tx * o + nx * 0.5, z = d.wz + tz * o + nz * 0.5;
      if (ground(x, z, 0.35, 0.6)) put('bike', x, z, Math.atan2(tx, tz), pick(BIKE, h1));
    }
    if (na && h1 < 0.1) {
      const o = (h2 < 0.5 ? 1 : -1) * (d.w / 2 + 0.45), x = d.wx + tx * o + nx * 0.06, z = d.wz + tz * o + nz * 0.06;
      if (own(x, z)) put('flag', x, z, Math.atan2(-nx, -nz), 0xffffff, d.y + 2.3);
    }
  }

  // ---------------------------------------------------------------- residential kerbs
  // Every ~37 m along a street a chance of a telephone pedestal or a sign at the kerb (counted from
  // the way's start, so the tiles it crosses agree; each places those on its own ground).
  for (const r of I.ctx.roads as Road[]) {
    if (r.lod || r.br || r.tu || !/^(residential|unclassified|tertiary|living_street)$/.test(r.c)) continue;
    const pts = unpack(r.p);
    let carry = 15;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      let t = carry;
      for (; t < L; t += 37) {
        const cx = ax + ux * t, cz = az + uz * t, u = H(cx, cz, 61), s = H(cx, cz, 62) < 0.5 ? 1 : -1;
        const off = r.w / 2 + 1.1, x = cx - uz * off * s, z = cz + ux * off * s; // (the mailboxes' and hydrants' line)
        if (u < 0.3) {
          if (ground(x, z, 0.2, 0.45)) put('pedestal', x, z, facing(uz * s, -ux * s), pick([0x4f6a52, 0x5f7a62, 0xb9b4a0, 0x6f7068], H(cx, cz, 63)));
        } else if (u < 0.38 && na) {
          // (its face to the oncoming traffic on its side)
          if (ground(x, z, 0.12, 0.35)) put('sign', x, z, facing(ux * s, uz * s), H(cx, cz, 64) < 0.75 ? 0xb8392e : 0x2f7a4a);
        }
      }
      carry = t - L;
    }
  }

  // ---------------------------------------------------------------- the summer beach
  const season = BEACH_SEASON[warmMonth - 1] * (cold ? 0.3 : 1);
  if (season > 0) {
    const seaDir = (x: number, z: number): P2 => {
      const gx = terrain.oceanDistAt(x - 6, z) - terrain.oceanDistAt(x + 6, z), gz = terrain.oceanDistAt(x, z - 6) - terrain.oceanDistAt(x, z + 6), L = Math.hypot(gx, gz) || 1;
      return [gx / L, gz / L];
    };
    const C = 9;
    // (a beach is one long outline the map gives one tile; every tile fills its own stretch of it,
    // on a world-aligned grid, so the stretches meet)
    for (const a of I.ctx.areas) {
      if (a.c !== 'beach' || !a.o?.[0] || a.o[0].length < 6) continue;
      const ring = unpack(a.o[0]);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of ring) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
      if (OB) (x0 = Math.max(x0, OB.x0)), (z0 = Math.max(z0, OB.z0)), (x1 = Math.min(x1, OB.x1)), (z1 = Math.min(z1, OB.z1));
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
        for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
          const u = hashf(i * 92821 + j * 68917 + 7), v = hashf(i * 68917 + j * 92821 + 11);
          const cx = (i + 0.2 + 0.6 * u) * C, cz = (j + 0.2 + 0.6 * v) * C;
          if (!own(cx, cz)) continue;
          // the dry sand between the wrack line and the dunes, the crowd thickest mid-beach
          const wd = terrain.sdfAt(cx, cz);
          if (wd < 12 || wd > 75 || !inRing(cx, cz, ring)) continue;
          const dens = 0.55 * season * Math.max(0, 1 - Math.abs(wd - 32) / 45);
          if (hashf(i * 31 + j * 7919 + 13) > dens || walk.blocked(cx, cz, 2.5) || walk.deckAt(cx, cz) !== null || kerbOut(cx, cz) < 4) continue;
          const [sx, sz] = seaDir(cx, cz), yaw = facing(sx, sz) + (u - 0.5) * 0.5, ax = sz, az = -sx;
          const w = hashf(i * 7 + j * 131 + 17);
          if (w < 0.7 && softFree(cx, cz, 1.0)) put('umbrella', cx, cz, yaw + (v - 0.5), pick(UMB, hashf(i * 13 + j * 17)));
          const nT = 1 + Math.floor(w * 2.6);
          for (let k = 0; k < nT; k++) {
            const o = (k - (nT - 1) / 2) * 1.1 + 0.4, x = cx + ax * o - sx * 0.6, z = cz + az * o - sz * 0.6;
            if (softFree(x, z, 0.45)) put('towel', x, z, yaw + (hashf(i + j * 3 + k) - 0.5) * 0.3, pick(TOW, hashf(i * 5 + j * 11 + k * 3)), terrain.heightAt(x, z) + 0.01);
          }
          if (w > 0.35) {
            const x = cx - ax * 1.3 + sx * 0.4, z = cz - az * 1.3 + sz * 0.4;
            if (softFree(x, z, 0.4)) put('beachchair', x, z, yaw, pick(TOW, hashf(i * 3 + j * 5)));
          }
          if (w > 0.55) {
            const x = cx + ax * 1.6 - sx * 1.6, z = cz + az * 1.6 - sz * 1.6;
            if (softFree(x, z, 0.35)) put('cooler', x, z, yaw + 0.6, pick(COOLER, hashf(i * 17 + j * 3)));
          }
        }
    }
  }

  // ---------------------------------------------------------------- piers and the water off them
  const piers: { a: P2; b: P2; w: number }[] = [];
  for (const l of I.ctx.lines) if (l.c === 'pier') { const p = unpack(l.p); for (let i = 0; i + 1 < p.length; i++) piers.push({ a: p[i], b: p[i + 1], w: l.w ?? 2.2 }); }
  for (const l of I.ctx.lines) {
    if (l.c !== 'pier') continue;
    const p = unpack(l.p), w = l.w ?? 2.2;
    let along = 0;
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = uz, nz = -ux;
      for (let t = (1.5 - along % 6 + 6) % 6; t < L; t += 6) {
        const cx = ax + ux * t, cz = az + uz * t, h = H(cx, cz, 71);
        for (const s of [-1, 1]) {
          const x = cx + nx * s * (w / 2 - 0.14), z = cz + nz * s * (w / 2 - 0.14), y = walk.deckAt(x, z);
          if (y === null || !own(x, z) || !softFree(x, z, 0.2)) continue;
          put('cleat', x, z, Math.atan2(-uz, ux), 0xffffff, y);
        }
        if (w >= 1.8 && h < 0.16 && t + 3 < L) {
          // (a slip's box sits between two cleats)
          const s = h < 0.08 ? 1 : -1, x = cx + ux * 3 + nx * s * (w / 2 - 0.5), z = cz + uz * 3 + nz * s * (w / 2 - 0.5), y = walk.deckAt(x, z);
          if (y !== null && own(x, z) && softFree(x, z, 0.65)) put('dockbox', x, z, Math.atan2(-uz, ux), 0xffffff, y);
        } else if (w >= 2.4 && h > 0.95) {
          const x = cx, z = cz, y = walk.deckAt(x, z);
          if (y !== null && own(x, z) && softFree(x, z, 0.6)) put('trap', x, z, Math.atan2(-uz, ux), pick(TRAP, H(x, z, 72)), y);
        }
      }
      // a life ring at the head of a long pier
      if (i === p.length - 2 && along + L > 25) {
        const x = bx - ux * 0.6 + nx * (w / 2 - 0.1), z = bz - uz * 0.6 + nz * (w / 2 - 0.1), y = walk.deckAt(x, z);
        if (y !== null && own(x, z) && softFree(x, z, 0.3)) put('lifering', x, z, facing(nx, nz), 0xe8622a, y);
      }
      along += L;
    }
  }
  // moorings and pot floats on the water off the piers (sea level: the shore's water is at y 0)
  if (piers.length && OB) {
    const pierD = (x: number, z: number) => {
      let best = Infinity;
      for (const s of piers) {
        const sx = s.b[0] - s.a[0], sz = s.b[1] - s.a[1], L2 = sx * sx + sz * sz || 1;
        if (Math.abs(s.a[0] - x) > 450 && Math.abs(s.b[0] - x) > 450) continue;
        const t = Math.max(0, Math.min(1, ((x - s.a[0]) * sx + (z - s.a[1]) * sz) / L2));
        best = Math.min(best, Math.hypot(s.a[0] + sx * t - x, s.a[1] + sz * t - z) - s.w / 2);
      }
      return best;
    };
    const C = 26;
    for (let i = Math.floor(OB.x0 / C); i < Math.ceil(OB.x1 / C); i++)
      for (let j = Math.floor(OB.z0 / C); j < Math.ceil(OB.z1 / C); j++) {
        const u = hashf(i * 15485863 + j * 32452843 + 3);
        if (u > 0.2) continue;
        const x = (i + 0.15 + 0.7 * hashf(i * 7 + j * 977)) * C, z = (j + 0.15 + 0.7 * hashf(i * 977 + j * 7)) * C;
        if (!own(x, z) || terrain.sdfAt(x, z) > -9 || terrain.heightAt(x, z) > -0.4 || walk.deckAt(x, z) !== null || kerbOut(x, z) < 3) continue;
        const pd = pierD(x, z);
        if (pd < 14) continue;
        if (pd < 240 && u < 0.12) put('buoy', x, z, u * 50, pick([0x2f62a8, 0x2f62a8, 0xe8622a], hashf(i + j * 31)), 0);
        else if (pd < 500 && u > 0.17) put('potfloat', x, z, u * 80, pick(FLOAT, hashf(i * 3 + j * 7)), 0);
      }
  }
  return new Float32Array(out);
}
