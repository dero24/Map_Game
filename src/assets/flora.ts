// Flora — trees and garden plants from genomes (docs/ASSET_FOUNDRY.md §Flora).
//
// A species is a *growth form* (how the plant is built) plus parameters (sizes, colours, counts).
// Each species has a few grown variants (seed 0..V-1) so a street of oaks isn't a row of clones,
// and garden plants have growth stages 0..STAGES-1 (sprout → leafy → in bloom) so a seed you plant
// visibly grows. Counts come from Fibonacci numbers and organs sit at the golden angle, the way
// real plants pack them. Foliage is TINT (white): the instance colour paints it in the region's
// greens; bark and blossoms carry their own colours.
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { TINT, P, part, merge, limb, blob, card, lathe, fibSphere, fibCount, taper, GOLDEN, cached, bounds } from './core';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BARK = 0x6b5a48, BARK_DARK = 0x5d4a3a, BIRCH = 0xe4dfd2, PALM = 0x8a7458;

// ================================================================ trees
// Index order matches the region style table's `trees` weights (styles.ts) and the old kinds.
export type TreeKind = 'round' | 'oak' | 'shrub' | 'pine' | 'spruce' | 'palm' | 'birch';
export const TREE_KINDS: TreeKind[] = ['round', 'oak', 'shrub', 'pine', 'spruce', 'palm', 'birch'];
export const TREE_VARIANTS = 3;
export interface TreeMeta { h: number; crownR: number; crownBottom: number; trunkR: number }

/** Build one grown tree. Deterministic in (kind, variant). */
export function treeGeometry(kind: TreeKind, v: number): { geo: THREE.BufferGeometry; meta: TreeMeta } {
  const r = makeRng(9173 * (TREE_KINDS.indexOf(kind) + 1) + v * 7919);
  const wood: THREE.BufferGeometry[] = [], leaf: THREE.BufferGeometry[] = [];
  let trunkR = 0.3;
  const lobe = (rad: number, c: THREE.Vector3, seed: number, squash = 0.85, detail = 1) => leaf.push(blob(rad, seed, { squash, detail }).translate(c.x, c.y, c.z));
  const j = (a: number) => (r.float() * 2 - 1) * a;

  if (kind === 'round' || kind === 'oak' || kind === 'birch') {
    const oak = kind === 'oak', birch = kind === 'birch';
    const th = (oak ? 3.6 : birch ? 5.2 : 4.2) + j(0.5);
    trunkR = oak ? 0.38 : birch ? 0.16 : 0.28;
    const lean = V3(j(0.35), 0, j(0.35));
    const top = V3(lean.x, th, lean.z);
    const barkC = birch ? BIRCH : BARK;
    // birches grow in clumps: two or three slim stems
    const stems = birch ? 2 + Math.floor(r.float() * 2) : 1;
    for (let s = 0; s < stems; s++) {
      const off = s ? V3(Math.cos(s * GOLDEN) * 0.45, 0, Math.sin(s * GOLDEN) * 0.45) : V3(0, 0, 0);
      const t = top.clone().add(off.clone().multiplyScalar(2.2)).add(V3(0, s ? -0.6 : 0, 0));
      wood.push(part(limb(off.clone().add(V3(0, -0.3, 0)), t, trunkR * (s ? 0.75 : 1), trunkR * 0.55, 6), barkC));
    }
    // scaffold limbs: a Fibonacci count of forks set at the golden angle
    const forks = fibCount(r.float(), 1, oak ? 3 : 2);
    const spread = oak ? 2.4 : birch ? 1.0 : 1.6;
    const tips: THREE.Vector3[] = [top.clone().add(V3(0, oak ? 1.0 : 1.6, 0))];
    for (let i = 0; i < forks; i++) {
      const a = i * GOLDEN + r.float();
      const tip = top.clone().add(V3(Math.cos(a) * spread, (oak ? 0.9 : 1.5) + j(0.4), Math.sin(a) * spread));
      wood.push(part(limb(top.clone().add(V3(0, -0.6, 0)), tip, trunkR * 0.55, trunkR * 0.25, 4), barkC));
      tips.push(tip);
    }
    // crown: lobes on a Fibonacci sphere around the fork tips, smaller toward the top
    const rx = oak ? 3.5 : birch ? 1.9 : 2.7, ry = oak ? 1.7 : birch ? 2.6 : 2.2;
    const cy = top.y + (oak ? 1.6 : birch ? 2.4 : 2.1);
    const n = oak ? 8 : birch ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.35, r.float() * 6);
      const c = V3(lean.x + u.x * rx * 0.72, cy + u.y * ry * 0.7, lean.z + u.z * rx * 0.72);
      const rad = (oak ? 2.0 : birch ? 1.05 : 1.75) * taper(i / n, 0.65) * (0.85 + r.float() * 0.3);
      lobe(rad * 1.06, c, 100 + v * 17 + i, oak ? 0.62 : birch ? 1.0 : 0.85, 0);
    }
    lobe(oak ? 2.6 : birch ? 1.2 : 2.3, V3(lean.x, cy, lean.z), 7 + v, oak ? 0.55 : 0.85);
  } else if (kind === 'shrub') {
    trunkR = 0.1;
    const stems = fibCount(r.float(), 1, 2);
    for (let i = 0; i < stems; i++) {
      const a = i * GOLDEN + r.float();
      wood.push(part(limb(V3(0, -0.1, 0), V3(Math.cos(a) * 0.4, 1.1 + j(0.2), Math.sin(a) * 0.4), 0.08, 0.04, 4), BARK));
    }
    const n = fibCount(r.float(), 1, 2);
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, 0, r.float() * 6);
      lobe(1.0 * taper(i / n, 0.7) + j(0.12), V3(u.x * 0.8, 1.45 + u.y * 0.7, u.z * 0.8), 200 + v * 13 + i, 0.85, 0);
    }
    lobe(1.25, V3(0, 1.5, 0), 211 + v);
  } else if (kind === 'pine') {
    // a coastal pitch pine: long bare, slightly kinked trunk, a windswept flat-topped crown
    trunkR = 0.24;
    const kink = V3(j(0.4), 3.6, j(0.4)), top = V3(kink.x + j(0.6), 7.0 + j(0.5), kink.z + j(0.6));
    wood.push(part(limb(V3(0, -0.3, 0), kink, trunkR, trunkR * 0.8, 6), BARK_DARK), part(limb(kink, top, trunkR * 0.8, trunkR * 0.45, 6), BARK_DARK));
    const wind = r.float() * Math.PI * 2;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN + wind;
      const d = 0.6 + (i / n) * 1.6;
      const c = V3(top.x + Math.cos(a) * d + Math.cos(wind) * 0.6, top.y + 0.9 - (i / n) * 1.2 + j(0.2), top.z + Math.sin(a) * d + Math.sin(wind) * 0.6);
      wood.push(part(limb(top.clone().add(V3(0, -1, 0)), c, 0.1, 0.05, 3), BARK_DARK));
      lobe(1.35 * taper(i / n, 0.6) + 0.3, c, 300 + v * 11 + i, 0.55, 0);
    }
    lobe(1.5, top.clone().add(V3(0, 1.0, 0)), 311 + v, 0.6);
  } else if (kind === 'spruce') {
    // conical tiers — a Fibonacci count of whorls, each a ring of drooping lobes
    trunkR = 0.18;
    const H = 9.4 + j(0.6);
    wood.push(part(limb(V3(0, -0.3, 0), V3(0, H - 0.9, 0), trunkR, 0.05, 5), BARK_DARK));
    const tiers = fibCount(r.float(), 3, 3); // 8
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = 2.0 + f * (H - 2.6);
      const rad = 1.75 * taper(f, 0.18);
      const ring = t < 3 ? 3 : t < tiers - 2 ? 2 : 1;
      for (let k = 0; k < ring; k++) {
        const a = k * ((2 * Math.PI) / ring) + t * GOLDEN;
        const off = ring > 1 ? rad * 0.45 : 0;
        lobe(rad * (ring > 1 ? 0.72 : 1), V3(Math.cos(a) * off, y, Math.sin(a) * off), 400 + v * 19 + t * 3 + k, 0.62, t === 0 && k === 0 ? 1 : 0);
      }
    }
  } else if (kind === 'palm') {
    trunkR = 0.2;
    const H = 7.5 + j(1.2);
    const bend = V3(j(1), 0, j(1)).normalize().multiplyScalar(1.4 + r.float() * 1.2);
    let prev = V3(0, -0.2, 0);
    const segs = 5;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = V3(bend.x * t * t, H * t, bend.z * t * t);
      wood.push(part(limb(prev, p, trunkR * (1 - t * 0.25) + 0.02, trunkR * (1 - t * 0.25), 6), i % 2 ? PALM : 0x7c684e));
      prev = p;
    }
    const n = fibCount(r.float(), 3, 4); // 8 or 13 fronds
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const up = 0.35 - (i / n) * 0.8; // young fronds up, old ones droop
      const fr = card(0.9, 3.2 + r.float() * 0.6, 0.55, 3);
      fr.rotateX(-up);
      fr.rotateY(a);
      fr.translate(prev.x, prev.y, prev.z);
      leaf.push(fr);
    }
    for (let k = 0; k < 3; k++) leaf.push(new THREE.SphereGeometry(0.16, 5, 4).translate(prev.x + Math.cos(k * 2.1) * 0.25, prev.y - 0.25, prev.z + Math.sin(k * 2.1) * 0.25));
  }

  const leafGeo = merge(leaf.map((g) => part(g, TINT)));
  const geo = merge([...wood, leafGeo]);
  const bb = bounds(geo), lb = bounds(leafGeo);
  const meta: TreeMeta = {
    h: bb.max.y,
    crownR: Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z) / 2,
    crownBottom: Math.max(0.3, lb.min.y),
    trunkR,
  };
  return { geo, meta };
}
const tmeta = new Map<string, TreeMeta>();
export function treeLib(kind: TreeKind, v: number) {
  const k = `tree:${kind}:${v}`;
  return cached(k, () => { const t = treeGeometry(kind, v); tmeta.set(k, t.meta); return t.geo; });
}
export function treeMeta(kind: TreeKind, v: number): TreeMeta {
  const k = `tree:${kind}:${v}`;
  if (!tmeta.has(k)) treeLib(kind, v);
  return tmeta.get(k)!;
}

// ================================================================ garden plants
export type PlantForm = 'mound' | 'rosette' | 'spike' | 'stem' | 'clump' | 'clipped';
export type PlantSpecies = 'hydrangea' | 'rose' | 'daylily' | 'lavender' | 'sunflower' | 'hosta' | 'agave' | 'hibiscus' | 'beachgrass' | 'boxwood' | 'coneflower' | 'fern';
export interface Species {
  form: PlantForm;
  label: string;
  h: number; // mature height (m)
  w: number; // mature spread (m)
  bloom: number[]; // blossom colours (a seed picks one); [] = foliage only
  leaf?: number; // fixed leaf colour (otherwise TINT → region greens)
  months: [number, number]; // bloom season, 1–12 (northern hemisphere; flipped south)
  climates: Partial<Record<string, number>>; // region climate → weight in the garden mix
}
export const SPECIES: Record<PlantSpecies, Species> = {
  hydrangea: { form: 'mound', label: 'hydrangea', h: 1.3, w: 1.5, bloom: [0x8fa8e0, 0xd99ab8, 0x7f98d8, 0xb39ad9, 0xf0ece4], months: [6, 9], climates: { temperate: 5, continental: 2, mediterranean: 1 } },
  rose: { form: 'mound', label: 'rosebush', h: 1.1, w: 1.0, bloom: [0xc2303a, 0xe88aa0, 0xf4efe2, 0xf0b440], months: [5, 10], climates: { temperate: 3, mediterranean: 3, continental: 2, arid: 1 } },
  hibiscus: { form: 'mound', label: 'hibiscus', h: 1.6, w: 1.3, bloom: [0xd8342c, 0xf06a8a, 0xf2b233], months: [1, 12], climates: { tropical: 6, mediterranean: 1 } },
  daylily: { form: 'clump', label: 'daylily', h: 0.8, w: 0.8, bloom: [0xe9782c, 0xf2c23a, 0xc8403a], months: [6, 8], climates: { temperate: 3, continental: 3 } },
  beachgrass: { form: 'clump', label: 'beach grass', h: 0.9, w: 0.7, bloom: [], leaf: 0xb8b27a, months: [7, 9], climates: { temperate: 1, mediterranean: 1, tropical: 1 } },
  lavender: { form: 'spike', label: 'lavender', h: 0.6, w: 0.7, bloom: [0x9a7cc8, 0x8468b8], months: [6, 8], climates: { mediterranean: 6, arid: 3, temperate: 1 } },
  coneflower: { form: 'stem', label: 'coneflower', h: 0.9, w: 0.5, bloom: [0xc76b9a, 0xe8a6c0, 0xf0c040], months: [6, 9], climates: { continental: 4, temperate: 2 } },
  sunflower: { form: 'stem', label: 'sunflower', h: 2.1, w: 0.6, bloom: [0xf2c028, 0xe8a52a], months: [7, 9], climates: { continental: 4, temperate: 2, arid: 2 } },
  hosta: { form: 'rosette', label: 'hosta', h: 0.5, w: 0.9, bloom: [0xd8cce8], months: [7, 8], climates: { temperate: 3, continental: 3, boreal: 2 } },
  agave: { form: 'rosette', label: 'agave', h: 0.9, w: 1.3, bloom: [], leaf: 0x8aa6a0, months: [6, 6], climates: { arid: 6, mediterranean: 2, tropical: 1 } },
  fern: { form: 'rosette', label: 'fern', h: 0.7, w: 1.0, bloom: [], months: [5, 9], climates: { boreal: 5, temperate: 2, tropical: 2 } },
  boxwood: { form: 'clipped', label: 'boxwood', h: 0.8, w: 0.9, bloom: [], months: [5, 5], climates: { temperate: 2, continental: 1, mediterranean: 1, boreal: 1 } },
};
export const PLANT_SPECIES = Object.keys(SPECIES) as PlantSpecies[];
export const STAGES = 8; // 0 sprout … 7 full bloom
/** growth in [0,1] → stage index */
export const stageOf = (g: number) => Math.max(0, Math.min(STAGES - 1, Math.floor(g * STAGES)));

/** The region's garden: species weights for its climate (always non-empty). */
export function plantMix(climate: string): [PlantSpecies, number][] {
  const m = PLANT_SPECIES.map((s) => [s, SPECIES[s].climates[climate] ?? 0] as [PlantSpecies, number]).filter(([, w]) => w > 0);
  return m.length ? m : [['boxwood', 1], ['rose', 1]];
}
/** Is a species flowering in this month? (south = southern hemisphere, seasons flip) */
export function inBloom(sp: PlantSpecies, month: number, south = false) {
  const S = SPECIES[sp];
  if (!S.bloom.length) return false;
  const m = south ? ((month + 5) % 12) + 1 : month;
  const [a, b] = S.months;
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}

/** A plant at growth g (0 sprout → 1 mature, blooming from ~0.6 when `bloom`). */
/** `lite`: the budget version for world garden beds (hundreds per tile): fewer organs, same silhouette. */
export function plantGeometry(sp: PlantSpecies, seed: number, g: number, bloom = true, lite = false): THREE.BufferGeometry {
  const S = SPECIES[sp];
  const r = makeRng(seed * 4099 + PLANT_SPECIES.indexOf(sp) * 131 + 7);
  const gs = 0.12 + 0.88 * Math.min(1, g); // size follows growth
  const H = S.h * gs, W = S.w * gs;
  const leafC = S.leaf ?? TINT;
  const bc = S.bloom.length ? S.bloom[Math.floor(r.float() * S.bloom.length)] : 0;
  const flowering = bloom && S.bloom.length > 0 && g >= 0.6;
  const fb = flowering ? Math.min(1, (g - 0.55) / 0.35) : 0; // blossom size ramps in
  const parts: THREE.BufferGeometry[] = [];
  const leafy = (geo: THREE.BufferGeometry) => parts.push(part(geo, leafC));
  const flower = (geo: THREE.BufferGeometry) => parts.push(part(geo, bc, P.bloom));

  if (S.form === 'mound' || S.form === 'clipped') {
    const clipped = S.form === 'clipped';
    const n = clipped ? 1 : lite ? 2 : fibCount(Math.min(0.99, g), 1, 3); // 3 → 8 lobes as it fills out
    leafy(blob(W * 0.42, seed + 3, { squash: clipped ? 0.8 : 0.75, lump: clipped ? 0.08 : 0.3 }).translate(0, H * 0.42, 0));
    for (let i = 0; i < n && !clipped; i++) {
      const u = fibSphere(i, n, 0.05, seed);
      leafy(blob(W * 0.26 * taper(i / n, 0.7), seed * 7 + i, { detail: 0 }).translate(u.x * W * 0.32, H * (0.4 + u.y * 0.35), u.z * W * 0.32));
    }
    if (fb > 0) {
      // blossom heads (hydrangea mopheads / roses / hibiscus) scattered over the crown's upper face
      const heads = lite ? (sp === 'hydrangea' ? 2 : 5) : sp === 'hydrangea' ? fibCount(r.float(), 2, 3) : fibCount(r.float(), 3, 4);
      const hr = (sp === 'hydrangea' ? 0.17 : 0.08) * fb * (0.8 + gs * 0.4);
      for (let i = 0; i < heads; i++) {
        const u = fibSphere(i, heads, 0.1, seed * 3);
        flower(blob(hr * (lite && sp !== 'hydrangea' ? 1.25 : 1), seed + 50 + i, { detail: sp === 'hydrangea' ? 1 : 0, lump: sp === 'hydrangea' ? 0.3 : 0.35, squash: 0.9 }).translate(u.x * W * 0.44, H * (0.5 + u.y * 0.42), u.z * W * 0.44));
      }
    }
  } else if (S.form === 'rosette') {
    // leaves spiral out at the golden angle, longer and flatter toward the outside
    const n = Math.max(3, Math.round(fibCount(Math.min(0.99, g * 1.1), 2, lite ? 3 : 4) * (sp === 'agave' ? 1 : 0.9)));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const len = (sp === 'agave' ? 0.75 : sp === 'fern' ? 0.7 : 0.5) * W * (0.55 + t * 0.6);
      const lf = card(sp === 'agave' ? 0.16 * gs : sp === 'fern' ? 0.22 * gs : 0.3 * gs, len, sp === 'agave' ? 0.05 : 0.35, 3);
      lf.rotateX(-(sp === 'agave' ? 1.1 - t * 0.6 : 0.95 - t * 0.5));
      lf.rotateY(i * GOLDEN);
      lf.translate(0, 0.04, 0);
      leafy(lf);
    }
    if (fb > 0 && sp === 'hosta') {
      for (let k = 0; k < 3; k++) {
        const a = k * GOLDEN * 2 + r.float();
        const top = V3(Math.cos(a) * 0.1, S.h * 1.4, Math.sin(a) * 0.1);
        leafy(limb(V3(0, 0.05, 0), top, 0.012, 0.01, 3));
        flower(blob(0.06 * fb + 0.02, seed + k, { detail: 0 }).scale(0.6, 1.8, 0.6).translate(top.x, top.y, top.z));
      }
    }
  } else if (S.form === 'spike' || S.form === 'clump') {
    // blades/stems fountaining out from the base
    const n = S.form === 'clump' ? fibCount(Math.min(0.99, g), 2, lite ? 3 : 5) : fibCount(Math.min(0.99, g), 2, lite ? 3 : 4);
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN + r.float() * 0.3;
      const lean = 0.2 + (i % 5) * 0.12;
      const len = H * (0.75 + r.float() * 0.4);
      const blade = card(S.form === 'clump' ? (lite ? 0.07 : 0.05) : 0.03, len, S.form === 'clump' ? 0.35 : 0.08, lite ? 2 : 3);
      blade.rotateX(-(Math.PI / 2 - lean));
      blade.rotateY(a);
      leafy(blade);
      if (fb > 0 && (S.form === 'spike' || (sp === 'daylily' && i % 4 === 0))) {
        const tip = V3(Math.sin(a) * Math.sin(lean) * len, Math.cos(lean) * len, Math.cos(a) * Math.sin(lean) * len);
        if (S.form === 'spike') flower(new THREE.CylinderGeometry(0.035 * fb + 0.01, 0.02, 0.2 * fb + 0.04, 5).translate(tip.x, tip.y + 0.05, tip.z));
        else flower(lathe([[0.001, 0], [0.09 * fb, 0.05], [0.13 * fb, 0.12]], 6).translate(tip.x, tip.y, tip.z));
      }
    }
    if (sp === 'beachgrass' && g > 0.7) for (let k = 0; k < 3; k++) {
      const a = k * GOLDEN * 3;
      parts.push(part(new THREE.CylinderGeometry(0.02, 0.012, 0.25, 4).translate(Math.cos(a) * 0.1, H * 1.1, Math.sin(a) * 0.1), 0xd8cc98));
    }
  } else if (S.form === 'stem') {
    // one or a few stems; a composite head of Fibonacci-many petals around a seeded disc
    const stems = sp === 'sunflower' || lite ? 1 : fibCount(r.float(), 1, 2);
    for (let s = 0; s < stems; s++) {
      const a = s * GOLDEN + r.float();
      const top = V3(Math.cos(a) * 0.12 * s, H * (1 - s * 0.12), Math.sin(a) * 0.12 * s);
      leafy(limb(V3(0, 0, 0), top, sp === 'sunflower' ? 0.03 : 0.012, sp === 'sunflower' ? 0.02 : 0.008, 4));
      const leaves = fibCount(Math.min(0.99, g), 1, 3);
      for (let k = 0; k < leaves; k++) {
        const lf = card(sp === 'sunflower' ? 0.24 * gs : 0.07, sp === 'sunflower' ? 0.34 * gs : 0.18, 0.3, 2);
        lf.rotateX(-1.0);
        lf.rotateY(k * GOLDEN + a);
        lf.translate(top.x * 0.5, top.y * (0.25 + (k / leaves) * 0.55), top.z * 0.5);
        leafy(lf);
      }
      if (fb > 0) {
        const disc = (sp === 'sunflower' ? 0.14 : 0.04) * fb + 0.01;
        const face = sp === 'sunflower' ? -1.1 : 0; // sunflower heads turn to face out; coneflowers look up
        parts.push(part(new THREE.CylinderGeometry(disc, disc * 0.8, disc * 0.6, 8).rotateX(face).translate(top.x, top.y, top.z), sp === 'sunflower' ? 0x5a3c22 : 0x8a4a28));
        const petals = lite ? (sp === 'sunflower' ? 13 : 8) : sp === 'sunflower' ? 21 : 13;
        for (let k = 0; k < petals; k++) {
          const pt = card(disc * 0.7, disc * 1.4, 0.15, 1).translate(0, 0, disc * 0.55);
          pt.rotateX(sp === 'coneflower' ? 0.45 : -0.15); // sunflower petals cup; coneflower petals droop
          pt.rotateY(k * ((2 * Math.PI) / petals));
          pt.rotateX(face);
          pt.translate(top.x, top.y, top.z);
          flower(pt);
        }
      }
    }
  }
  return merge(parts);
}
export const plantLib = (sp: PlantSpecies, v: number, stage: number, bloom = true, lite = false) =>
  cached(`plant:${sp}:${v}:${stage}:${bloom ? 1 : 0}:${lite ? 1 : 0}`, () => plantGeometry(sp, v + 1, (stage + 1) / STAGES, bloom, lite));

