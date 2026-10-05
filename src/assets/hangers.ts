// Hangers (docs/regional-life/models.md hanger†): what grows on a tree's limbs — Spanish moss's grey
// curtains swinging from the live oaks, resurrection fern's mats along the tops of the big limbs (green
// within hours of rain, curled and brown in a dry spell), ball moss's grey tufts, lace lichen's pale
// nets in California's fog belt. Grown on the tree's own plan (flora.ts TreePlan: its boughs and its
// crown's lobes), so each hangs where that tree's limbs are; a layer of its own beside the trees
// (props.ts `hang:<type>:<kind>:<v>:<load>`, instanced with the trees that carry it), so the region
// says which and how heavy (hangerMix) and the tree's model stays as it is.
//
// The motion is the material's (propMaterial `hang`): every vertex carries `aHang` = (how far below
// its anchor it hangs — negative: how far above the limb it stands —, the strand's length, the
// strand's phase, what it is: 0 a strand that swings, 1 a stiff tuft, 2 a resurrection fern frond).
// A strand swings as a pendulum of its own length (the long ones slow), more toward its tip, out of
// step with its neighbours so the curtain twists and parts; a ripple runs down it when the wind
// rises, and the whole curtain leans downwind. Foliage is TINT: the instance colour is each tree's
// own tone of grey-green (no two trees' moss quite alike).
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { cached } from './core';
import { treeGeometry, type TreeKind, type TreePlan } from './flora';

export type HangerType = 'spanish' | 'resfern' | 'ballmoss' | 'lace';
export const HANGERS: HangerType[] = ['spanish', 'resfern', 'ballmoss', 'lace'];
/** A hanger's loads: 0 a light dressing, 1 a heavy one (the grand old oaks of a Savannah square). */
export const LOADS = 2;
/** What `aHang.w` says a vertex is. */
export const HANG_STRAND = 0, HANG_STIFF = 1, HANG_FERN = 2;
/** The tones the instance colour paints each kind in (sRGB): Spanish moss silver grey-green (greener
 *  wet, as after rain), the fern's green, ball moss's grey, lace lichen's pale grey-green. */
export const HANG_TONES: Record<HangerType, number[]> = {
  spanish: [0xa9ae9a, 0xa0a891, 0xb4b8a7, 0x98a189, 0xadb39f, 0x9ca394, 0xb0b49c],
  resfern: [0x5f7f3a, 0x6a8a40, 0x58763a, 0x718f46],
  ballmoss: [0x9a9d8c, 0x8f9384, 0xa6a896, 0x949a86],
  lace: [0xbcc6a4, 0xb2bf9c, 0xc4ccb0, 0xaab896],
};

/** Each hanger's budget (vertices, the heavy load): it draws for every tree that carries it. */
export const HANG_BUDGET = 2000;

interface Build { pos: number[]; nrm: number[]; hang: number[]; idx: number[] }
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A ribbon hanging from `a`: `segs` lengths down, `w0` wide at the top to `w1` at the tip, its face
 *  turning by `twist` as it falls and drifting by `drift`; both faces (no culling trick). `kind`:
 *  HANG_STRAND or HANG_STIFF. `widths`: a ragged edge (lace) — each ring's share of the taper. */
function ribbon(B: Build, a: THREE.Vector3, len: number, w0: number, w1: number, yaw: number, twist: number, drift: THREE.Vector3, phase: number, segs: number, kind: number, widths?: number[]) {
  const ring: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ang = yaw + twist * t;
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.7)) * (widths?.[i] ?? 1) * 0.5;
    const c = V3(a.x + drift.x * t * t, a.y - len * t, a.z + drift.z * t * t);
    const u = V3(Math.cos(ang) * w, 0, Math.sin(ang) * w), n = V3(-Math.sin(ang), 0, Math.cos(ang));
    ring.push([c.clone().sub(u), c.clone().add(u), n]);
  }
  for (const side of [1, -1]) {
    const base = B.pos.length / 3;
    ring.forEach(([l, r, n], i) => {
      const t = i / segs;
      for (const p of [l, r]) {
        B.pos.push(p.x, p.y, p.z);
        B.nrm.push(n.x * side, n.y * side, n.z * side);
        B.hang.push(len * t, len, phase, kind);
      }
    });
    for (let i = 0; i < segs; i++) {
      const q = base + i * 2;
      if (side > 0) B.idx.push(q, q + 1, q + 3, q, q + 3, q + 2);
      else B.idx.push(q, q + 3, q + 1, q, q + 2, q + 3);
    }
  }
}

/** A frond of resurrection fern standing up off a limb's top at `a`: a narrow two-sided blade leaning
 *  out along `yaw`, `h` tall. */
function frond(B: Build, a: THREE.Vector3, h: number, w: number, yaw: number, lean: number, phase: number) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const tip = V3(a.x + ca * lean * h, a.y + h, a.z + sa * lean * h), u = V3(-sa * w * 0.5, 0, ca * w * 0.5);
  const n = V3(ca, 0.35, sa).normalize();
  const quad = [a.clone().sub(u), a.clone().add(u), tip.clone().sub(u.clone().multiplyScalar(0.3)), tip.clone().add(u.clone().multiplyScalar(0.3))];
  for (const side of [1, -1]) {
    const base = B.pos.length / 3;
    quad.forEach((p, i) => {
      B.pos.push(p.x, p.y, p.z);
      B.nrm.push(n.x * side, n.y * side, n.z * side);
      B.hang.push(-(i < 2 ? 0 : h), h, phase, HANG_FERN);
    });
    if (side > 0) B.idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
    else B.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
  }
}

/** A tuft of ball moss: a lumpy little ball (an icosahedron's twelve corners, nudged) at `c`. */
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0], [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T], [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1]];
const ICO_F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
function tuft(B: Build, c: THREE.Vector3, r: number, seed: number) {
  const base = B.pos.length / 3, rng = makeRng(seed), L = Math.hypot(1, ICO_T);
  for (const [x, y, z] of ICO_V) {
    const k = (r * (0.75 + rng.float() * 0.5)) / L;
    B.pos.push(c.x + x * k, c.y + y * k * 0.85, c.z + z * k);
    B.nrm.push(x / L, y / L, z / L);
    B.hang.push(0, 0, 0, HANG_STIFF);
  }
  for (const i of ICO_F) B.idx.push(base + i);
}

/** Where on a tree hangers can grow: points under its limbs (with the limb's direction and girth) and
 *  under its crown's lobes, and points along the tops of its big, near-level limbs. */
function sites(plan: TreePlan) {
  const trunkTop = Math.max(...plan.boughs.filter((b) => b.a.y < 0).map((b) => b.b.y), 0.5);
  const under: { p: THREE.Vector3; dir: THREE.Vector3; r: number; out: number }[] = [];
  const tops: { p: THREE.Vector3; dir: THREE.Vector3; r: number }[] = [];
  for (const b of plan.boughs) {
    if (b.a.y < 0.05) continue; // (not the trunk itself)
    const d = b.b.clone().sub(b.a), L = d.length();
    if (L < 0.4) continue;
    d.normalize();
    const n = Math.max(1, Math.round(L / 0.9));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = b.a.clone().lerp(b.b, t), r = b.r0 + (b.r1 - b.r0) * t;
      if (p.y < 0.9) continue; // (a limb resting on the ground grows no curtain under itself)
      under.push({ p: p.clone().add(V3(0, -r * 0.8, 0)), dir: d, r, out: Math.hypot(p.x, p.z) });
      if (r > 0.1 && Math.abs(d.y) < 0.62 && p.y > trunkTop * 0.6) tops.push({ p: p.clone().add(V3(0, r * 0.85, 0)), dir: d, r });
    }
  }
  for (const l of plan.lobes) {
    // under the crown: moss hangs from the twigs inside it and shows below its underside
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + l.c.x * 1.7 + l.c.z * 0.9, rr = l.r * 0.55;
      // (at the lobe's underside: the curtain's whole length shows below the leaves)
      under.push({ p: l.c.clone().add(V3(Math.cos(a) * rr, -l.r * l.sq * 0.8, Math.sin(a) * rr)), dir: V3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57)), r: 0.03, out: Math.hypot(l.c.x, l.c.z) + rr });
    }
  }
  return { under, tops };
}

/** A hanger grown on a tree: deterministic in (type, kind, variant, load). */
export function hangerGeometry(type: HangerType, kind: TreeKind, v: number, load: number): THREE.BufferGeometry {
  const { plan, meta } = treeGeometry(kind, v);
  const rng = makeRng(7919 * (HANGERS.indexOf(type) + 1) + 104729 * v + 31 * load + kind.length * 977 + kind.charCodeAt(0) * 13);
  const B: Build = { pos: [], nrm: [], hang: [], idx: [] };
  const { under, tops } = sites(plan);
  const pick = <T,>(list: T[], n: number, weight: (t: T) => number) => {
    // n sites by weight, without repeats (a deterministic weighted draw)
    const w = list.map(weight), out: T[] = [], used = new Set<number>();
    for (let k = 0; k < n && used.size < list.length; k++) {
      let sum = 0;
      w.forEach((x, i) => { if (!used.has(i)) sum += x; });
      let t = rng.float() * sum, at = -1;
      for (let i = 0; i < list.length; i++) { if (used.has(i)) continue; if ((t -= w[i]) <= 0) { at = i; break; } }
      if (at < 0) break;
      used.add(at);
      out.push(list[at]);
    }
    return out;
  };
  const H = meta.h;
  if (type === 'spanish' || type === 'lace') {
    // curtains (festoons) of strands: the middle ones longest (the curtain's belly), the outer ones
    // shorter; each strand turning as it falls, out of step with its neighbours
    const lace = type === 'lace';
    const n = lace ? (load ? 13 : 7) : load ? 22 : 11;
    for (const s of pick(under, n, (u) => 0.4 + u.out / Math.max(1, H) + (u.r < 0.12 ? 0.5 : 0))) {
      const across = s.dir.clone().setY(0);
      if (across.lengthSq() < 1e-4) across.set(1, 0, 0);
      across.normalize();
      // (a festoon is a mass a hand to an arm wide, its strands broad tapering ribbons that turn as they
      // fall: from a little way off it reads as a grey curtain, close to as tangled threads)
      const strands = lace ? 4 : 4 + Math.floor(rng.float() * 3.5);
      const width = (lace ? 0.35 : 0.35) + rng.float() * (lace ? 0.35 : 0.55);
      const Lf = (lace ? 0.35 + rng.float() * 0.45 : 0.95 + rng.float() * 1.6) * (1 + 0.3 * load) * (H / 8.5);
      const ph0 = rng.float() * 6.283;
      for (let i = 0; i < strands; i++) {
        const u = strands > 1 ? i / (strands - 1) : 0.5;
        const a = s.p.clone().addScaledVector(across, (u - 0.5) * width).add(V3(0, -rng.float() * 0.05, 0));
        // (never trailing into the ground under a low billow: a curtain stops a hand above it)
        const L = Math.max(0.12, Math.min(a.y - 0.15, Lf * (0.5 + 0.5 * rng.float()) * (1 - 0.4 * Math.abs(u - 0.5) * 2)));
        const yaw = Math.atan2(across.z, across.x) + (rng.float() - 0.5) * 0.9;
        const twist = (rng.float() - 0.5) * (lace ? 1.4 : 2.6);
        const drift = V3((rng.float() - 0.5) * 0.12 * L, 0, (rng.float() - 0.5) * 0.12 * L);
        const w0 = lace ? 0.12 + rng.float() * 0.06 : 0.17 + rng.float() * 0.12;
        // (lace lichen's edge ragged, a net of holes: each ring a different share of the width)
        const rag = lace ? [1, 0.55, 1.05, 0.45, 0.7] : undefined;
        ribbon(B, a, L, w0, lace ? 0.03 : 0.035, yaw, twist, drift, ph0 + i * 0.83 + rng.float() * 0.6, lace ? 4 : 3, HANG_STRAND, rag);
      }
    }
  } else if (type === 'resfern') {
    // mats along the tops of the big limbs: fronds standing up out of the bark's moss, a few a hand apart
    const mats = load ? 7 : 4;
    for (const s of pick(tops, mats, (t) => t.r)) {
      const along = s.dir.clone().setY(0).normalize(), side = V3(-along.z, 0, along.x);
      const fronds = Math.round((7 + Math.floor(rng.float() * 5)) * (load ? 1.35 : 1)), run = (0.5 + rng.float() * 0.6) * (load ? 1.25 : 1);
      for (let i = 0; i < fronds; i++) {
        const t = (i / Math.max(1, fronds - 1) - 0.5) * run;
        const a = s.p.clone().addScaledVector(along, t).addScaledVector(side, (rng.float() - 0.5) * s.r * 1.2);
        const h = (0.1 + rng.float() * 0.08) * (H / 8.5);
        frond(B, a, h, 0.04 * (H / 8.5), Math.atan2(side.z, side.x) + (rng.float() - 0.5) * 2.4, 0.25 + rng.float() * 0.35, rng.float() * 6.283);
      }
    }
  } else {
    // ball moss: grey tufts strung along the outer branches and the crown's underside
    const n = load ? 30 : 16;
    for (const s of pick(under, n, (u) => (u.r < 0.12 ? 1.2 : 0.4) + u.out / Math.max(1, H))) {
      tuft(B, s.p.clone().add(V3(0, 0.02, 0)), (0.045 + rng.float() * 0.045) * (H / 8.5), Math.floor(rng.float() * 1e6));
    }
  }
  const g = new THREE.BufferGeometry();
  const n = B.pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
  const col = new Float32Array(n * 3).fill(1); // (TINT: the instance colour is the tree's own tone)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(B.hang, 4));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** One hanger model per (type, kind, variant, load) — a tile builder clones it (AGENTS.md rule 6). */
export const hangerLib = (type: HangerType, kind: TreeKind, v: number, load: number) => cached(`hang:${type}:${kind}:${v}:${load}`, () => hangerGeometry(type, kind, v, load));

// ---------------- where they grow (docs/regional-life/ranges.md) ----------------

/** Where a tree stands, for its hangers: the lower 48's region, ecoregion and state (styles.ts castOf),
 *  and whether it's in California's coastal fog belt (ecoregions.ts caFogBelt). */
export interface HangPlace { eco: string; l3: number; state?: string; fog?: boolean }
/** Spanish moss by ecoregion: 1 the Southern coastal plain and the Delta's swamps, where every big oak
 *  is hung with it; less inland up the rivers and in the East Texas pines; a little in southeast
 *  Virginia and far south Florida (it thins out there). None in the Piedmont uplands, the mountains,
 *  the Ozarks, the Midwest, the Plains or anywhere in the West. */
export function spanishMossZone(p: HangPlace): number {
  if (!p.eco) return 0;
  // (never north of SE Virginia: the coastal plain's ecoregions run on into Maryland and Delaware)
  if (p.l3 === 63) return p.state === 'VA' ? 0.35 : p.state === 'NC' || p.state === 'SC' ? 0.75 : 0;
  if (!MOSS_STATES.has(p.state ?? '')) return 0;
  if (p.state === 'AR') return p.l3 === 35 ? 0.5 : p.l3 === 73 ? 0.35 : 0; // (southern Arkansas only)
  return ({ 75: 1, 73: 0.9, 34: 0.7, 65: 0.55, 74: 0.6, 35: 0.55, 76: 0.35, 33: 0.3 } as Record<number, number>)[p.l3] ?? 0;
}
/** The states Spanish moss reaches past SE Virginia's coast (ranges.md: never Tennessee, Kentucky or
 *  Missouri, whose Delta it never climbs). */
const MOSS_STATES = new Set(['NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'LA', 'TX', 'AR']);
/** How readily each kind carries Spanish moss: the live oak most, then the other oaks, the pecans and
 *  water hickories (round), the elms, the swamp's red maples and willows; magnolias seldom. */
const MOSS_HOST: Partial<Record<TreeKind, number>> = { liveoak: 1, oak: 0.55, round: 0.35, elm: 0.3, willow: 0.25, maple: 0.2, magnolia: 0.1, plateauoak: 0.4 };
/** Central and south Texas, where ball moss greys the live oaks and the cedar elms (EPA 30–34). */
const BALL_TX = new Set([30, 31, 32, 33, 34]);

/** The hangers a tree of `kind` carries here: [type, P(it has any), P(a heavy load)]. */
export function hangerMix(kind: TreeKind, p: HangPlace): [HangerType, number, number][] {
  const out: [HangerType, number, number][] = [];
  const z = spanishMossZone(p), f = MOSS_HOST[kind] ?? 0;
  if (z > 0 && f > 0) {
    const any = Math.min(0.95, f * (0.35 + 0.55 * z));
    out.push(['spanish', any, any * f * (0.25 + 0.5 * z)]);
  }
  // resurrection fern along the big limbs of the Southern live oaks (and some other oaks)
  const south = p.eco === 'southeast' || p.eco === 'florida' || p.eco === 'gulf' || p.eco === 'texas' || (p.l3 === 63 && p.state === 'VA');
  if (south && p.l3 !== 45) {
    const r = kind === 'liveoak' ? 0.6 : kind === 'plateauoak' ? 0.35 : kind === 'oak' ? 0.2 : 0;
    if (r) out.push(['resfern', r, r * 0.45]);
  }
  // ball moss: Florida, the Gulf, central and south Texas
  // (the Gulf's coastal plain and Louisiana's bayous — never the Delta north of the Gulf states)
  const gulfCoast = p.eco === 'gulf' && (p.l3 === 75 || p.l3 === 34 || (p.l3 === 73 && p.state === 'LA'));
  const ballZone = p.eco === 'florida' ? 0.6 : gulfCoast ? 0.3 : p.eco === 'texas' && BALL_TX.has(p.l3) ? 1 : 0;
  if (ballZone) {
    const b = ({ plateauoak: 0.85, liveoak: 0.6, elm: 0.45, oak: 0.35, mesquite: 0.3, round: 0.2 } as Partial<Record<TreeKind, number>>)[kind] ?? 0;
    if (b) out.push(['ballmoss', b * ballZone, b * ballZone * 0.55]);
  }
  // lace lichen: California's coast live oaks (and its other oaks) in the fog belt
  if (p.eco === 'california' && p.fog) {
    const l = kind === 'coastoak' ? 0.75 : kind === 'oak' ? 0.4 : kind === 'round' ? 0.1 : 0;
    if (l) out.push(['lace', l, l * 0.5]);
  }
  return out;
}
