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
const BARK = 0x6b5a48, BARK_DARK = 0x5d4a3a, BIRCH = 0xe4dfd2, PALM = 0x8a7458, MESQ = 0x4f4034, PALOVERDE = 0x8f9c5a;

// ================================================================ trees
// Index order matches the region style table's `trees` weights (styles.ts) and the old kinds.
export type TreeKind = 'round' | 'oak' | 'shrub' | 'pine' | 'spruce' | 'palm' | 'birch' | 'mesquite' | 'fanpalm' | 'maple' | 'willow' | 'elm' | 'poplar' | 'magnolia' | 'cherry';
export const TREE_KINDS: TreeKind[] = ['round', 'oak', 'shrub', 'pine', 'spruce', 'palm', 'birch', 'mesquite', 'fanpalm', 'maple', 'willow', 'elm', 'poplar', 'magnolia', 'cherry'];
/** How each broadleaf turns in autumn (propMaterial): 0 mixed, 1 red (maples, cherries), 2 gold. */
export const FALL_HUE: Partial<Record<TreeKind, number>> = { maple: 1, cherry: 1, willow: 2, elm: 2, poplar: 2, birch: 2 };
/** How a grown variant turns: the bigleaf maple (maple variant 2) goes gold, not scarlet. */
export const fallHueOf = (k: TreeKind, v: number) => (k === 'maple' && v === 2 ? 2 : FALL_HUE[k] ?? 0);
/** Broadleaves that colour and drop their leaves (magnolias and the palms keep theirs). */
export const DECIDUOUS = new Set<TreeKind>(['round', 'oak', 'birch', 'shrub', 'maple', 'willow', 'elm', 'poplar', 'cherry']);
export const TREE_VARIANTS = 3;
/** `lean`: the trunk's horizontal drift per metre of height (model space) — where the bark is. */
export interface TreeMeta { h: number; crownR: number; crownBottom: number; trunkR: number; lean: [number, number] }

/** Build one grown tree. Deterministic in (kind, variant). */
export function treeGeometry(kind: TreeKind, v: number): { geo: THREE.BufferGeometry; meta: TreeMeta } {
  const r = makeRng(9173 * (TREE_KINDS.indexOf(kind) + 1) + v * 7919);
  const wood: THREE.BufferGeometry[] = [], leaf: THREE.BufferGeometry[] = [];
  let trunkR = 0.3, leanPer: [number, number] = [0, 0];
  const lobe = (rad: number, c: THREE.Vector3, seed: number, squash = 0.85, detail = 1) => leaf.push(blob(rad, seed, { squash, detail }).translate(c.x, c.y, c.z));
  const j = (a: number) => (r.float() * 2 - 1) * a;

  if (kind === 'oak') {
    // a street or park oak (red, pin, white): a short, thick trunk that forks low into a few heavy
    // limbs reaching out and up, each ending in its own billow, and over them a broad dome — half
    // again as wide as it is tall, dark hollows between the billows, the limbs showing under it.
    // (The old oak was one squashed ball on a pole: a median lollipop.)
    trunkR = 0.36;
    const th = 2.5 + j(0.3), lean = V3(j(0.3), 0, j(0.3)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(part(limb(V3(0, -0.3, 0), top, trunkR, trunkR * 0.8, 6), BARK_DARK));
    const limbs = 4, a0 = r.float() * Math.PI * 2;
    let rise = 0;
    for (let i = 0; i < limbs; i++) {
      const a = a0 + i * GOLDEN + j(0.25), reach = 3.1 + r.float() * 1.0, up = 2.2 + r.float() * 1.0;
      rise += up / limbs;
      const knee = V3(lean.x + Math.cos(a) * reach * 0.45, th + up * 0.55, lean.z + Math.sin(a) * reach * 0.45);
      const tip = V3(lean.x + Math.cos(a) * reach, th + up, lean.z + Math.sin(a) * reach);
      wood.push(part(limb(top.clone().add(V3(0, -0.35, 0)), knee, trunkR * 0.62, trunkR * 0.42, 4), BARK_DARK), part(limb(knee, tip, trunkR * 0.42, trunkR * 0.16, 4), BARK_DARK));
      // the billow at the limb's end: a big lobe over the tip, two smaller ones either side of it
      const ca = Math.cos(a), sa = Math.sin(a);
      lobe(1.85 + r.float() * 0.35, tip.clone().add(V3(ca * 0.3, 0.7, sa * 0.3)), 120 + v * 17 + i * 3, 0.82, 0);
      for (const sd of [-1, 1]) lobe(1.35 + r.float() * 0.3, tip.clone().add(V3(-sa * sd * 1.25 + ca * 0.2, -0.45 + j(0.3), ca * sd * 1.25 + sa * 0.2)), 121 + v * 17 + i * 3 + sd, 0.8, 0); // (the rim hangs lower)
    }
    // the dome over the billows: a ring of three between the limbs, one broad crown on top
    for (let k = 0; k < 3; k++) {
      const a = a0 + GOLDEN * 0.5 + k * ((2 * Math.PI) / 3) + j(0.3);
      lobe(2.0 + r.float() * 0.3, V3(lean.x + Math.cos(a) * 1.9, th + rise + 1.5, lean.z + Math.sin(a) * 1.9), 110 + v * 7 + k, 0.78, 0);
    }
    lobe(2.5 + r.float() * 0.3, V3(lean.x + j(0.5), th + rise + 2.5, lean.z + j(0.5)), 118 + v, 0.72, 0);
  } else if (kind === 'round' || kind === 'birch') {
    const oak = false, birch = kind === 'birch';
    const th = (birch ? 4.4 : 4.2) + j(0.5);
    trunkR = oak ? 0.3 : birch ? 0.14 : 0.22; // a 7 m street tree: a 0.45 m trunk, not a 0.75 m barrel
    const lean = V3(j(0.35), 0, j(0.35));
    const top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
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
    const cy = top.y + (oak ? 1.1 : birch ? 1.9 : 1.6); // low enough that the crown skirts over the forks
    const n = oak ? 8 : birch ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.35, r.float() * 6);
      const c = V3(lean.x + u.x * rx * 0.72, cy + u.y * ry * 0.7, lean.z + u.z * rx * 0.72);
      const rad = (oak ? 2.0 : birch ? 1.05 : 1.75) * taper(i / n, 0.65) * (0.85 + r.float() * 0.3);
      lobe(rad * 1.06, c, 100 + v * 17 + i, oak ? 0.62 : birch ? 1.0 : 0.85, 0);
    }
    lobe(oak ? 2.6 : birch ? 1.2 : 2.3, V3(lean.x, cy, lean.z), 7 + v, oak ? 0.55 : 0.85);
    // two low skirt lobes hide the bare slingshot of the scaffold forks
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI + r.float() * 1.5;
      lobe((oak ? 1.7 : birch ? 0.8 : 1.35) * (0.9 + r.float() * 0.2), V3(lean.x + Math.cos(a) * rx * 0.45, top.y + 0.3, lean.z + Math.sin(a) * rx * 0.45), 150 + v * 5 + k, 0.7, 0);
    }
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
    // a coastal pitch pine: kinked trunk, a windswept flat-topped crown that starts well down the
    // trunk (open, clumped tufts), and a couple of lower limbs with their own tufts
    trunkR = 0.24;
    const kink = V3(j(0.4), 3.6, j(0.4)), top = V3(kink.x + j(0.6), 7.0 + j(0.5), kink.z + j(0.6));
    wood.push(part(limb(V3(0, -0.3, 0), kink, trunkR, trunkR * 0.8, 6), BARK_DARK), part(limb(kink, top, trunkR * 0.8, trunkR * 0.45, 6), BARK_DARK));
    const wind = r.float() * Math.PI * 2;
    // three overlapping tiers of clumped tufts (never separate pancakes with sky between them):
    // each tuft's radius ≥ 0.7 × the tier spacing, tufts staggered ±0.6 m, leaning downwind
    const tiers = 3, gap = 1.15;
    for (let t = 0; t < tiers; t++) {
      const y = top.y - (tiers - 1 - t) * gap;
      const spread = 1.35 - t * 0.3;
      for (let k = 0; k < 3; k++) {
        const a = wind + t * GOLDEN + (k / 3) * Math.PI * 2 + j(0.3);
        const c = V3(top.x + Math.cos(a) * spread + Math.cos(wind) * 0.45 + j(0.6) * 0.5, y + j(0.25), top.z + Math.sin(a) * spread + Math.sin(wind) * 0.45 + j(0.6) * 0.5);
        wood.push(part(limb(V3(top.x, y - 0.5, top.z), c, 0.09, 0.045, 3), BARK_DARK));
        lobe(Math.max(0.7 * gap * 1.25, 1.2 - t * 0.12) + r.float() * 0.12, c, 300 + v * 11 + t * 3 + k, 0.8, 0);
      }
    }
    // one or two lower limbs whose tufts tuck up under the crown (overlapping it, no sky gap)
    const stubs = 1 + (v % 2);
    for (let i = 0; i < stubs; i++) {
      const a = wind + Math.PI + i * GOLDEN;
      const y = top.y - 3.5 + i * 0.45 + j(0.15);
      const f = Math.min(1, y / 3.6);
      const from = V3(kink.x * f + (top.x - kink.x) * Math.max(0, (y - 3.6) / (top.y - 3.6)), y, kink.z * f + (top.z - kink.z) * Math.max(0, (y - 3.6) / (top.y - 3.6)));
      const tip = from.clone().add(V3(Math.cos(a) * 1.15, 0.45, Math.sin(a) * 1.15));
      wood.push(part(limb(from, tip, 0.08, 0.04, 3), BARK_DARK));
      lobe(0.95 + r.float() * 0.15, tip.clone().add(V3(0, 0.25, 0)), 320 + v * 7 + i, 0.6, 0);
    }
    lobe(1.6, top.clone().add(V3(Math.cos(wind) * 0.4, 0.55, Math.sin(wind) * 0.4)), 311 + v, 0.62); // swallows the upper tier
  } else if (kind === 'spruce') {
    // conical tiers — a Fibonacci count of whorls, each a ring of drooping lobes
    trunkR = 0.18;
    const H = 9.4 + j(0.6);
    wood.push(part(limb(V3(0, -0.3, 0), V3(0, H - 0.9, 0), trunkR, 0.05, 5), BARK_DARK));
    const tiers = fibCount(r.float(), 3, 3); // 8
    const gap = (H - 2.6) / (tiers - 1);
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = 2.0 + f * (H - 2.6);
      const rad = 1.75 * taper(f, 0.18);
      const ring = t < 3 ? 3 : t < tiers - 2 ? 2 : 1;
      for (let k = 0; k < ring; k++) {
        const a = k * ((2 * Math.PI) / ring) + t * GOLDEN;
        const off = ring > 1 ? rad * 0.45 : 0, rr = rad * (ring > 1 ? 0.72 : 1);
        // each whorl at least as deep as the gap to the next: a narrowing cone of boughs to the tip,
        // never plates on a pole (the small upper whorls were 20 cm thin a metre apart)
        lobe(rr, V3(Math.cos(a) * off, y, Math.sin(a) * off), 400 + v * 19 + t * 3 + k, Math.max(0.62, (0.62 * gap) / rr), t === 0 && k === 0 ? 1 : 0);
      }
    }
    lobe(0.42, V3(0, H - 0.35, 0), 431 + v, 2.0, 0); // the leader: the spire closing the tip
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
  } else if (kind === 'mesquite') {
    // desert legume trees (mesquite; variant 2 a palo verde with green bark): two to four
    // twisting trunks leaning out from one root crown, and a wide, low, airy canopy of thin
    // flattened clouds with sky between them — the shade trees of the Sonoran street
    trunkR = 0.2;
    const verde = v === 2;
    const barkC = verde ? PALOVERDE : MESQ;
    const stems = 2 + (v === 1 ? 2 : 1);
    const crowns: THREE.Vector3[] = [];
    for (let i = 0; i < stems; i++) {
      const a = i * GOLDEN + r.float();
      const knee = V3(Math.cos(a) * 0.7, 1.5 + j(0.3), Math.sin(a) * 0.7);
      const tip = V3(Math.cos(a) * (2.2 + r.float()), 3.6 + j(0.4), Math.sin(a) * (2.2 + r.float()));
      wood.push(part(limb(V3(0, -0.3, 0), knee, trunkR, trunkR * 0.75, 5), barkC), part(limb(knee, tip, trunkR * 0.75, trunkR * 0.35, 4), barkC));
      crowns.push(tip);
    }
    // canopy: small, irregular, loosely stacked clouds over each limb tip (an airy, uneven
    // crown with sky through it — not a flat umbrella), one lifted a little higher per limb
    for (let i = 0; i < crowns.length; i++) {
      const c = crowns[i];
      const n = 3 + (i % 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i * GOLDEN + j(0.4);
        const rr = 0.8 + r.float() * 0.7;
        // smaller, rounder, spread wider: a feathery, broken canopy (flat, fat lobes read as an
        // acacia umbrella)
        lobe((verde ? 0.7 : 0.82) + r.float() * 0.3, V3(c.x + Math.cos(a) * rr, c.y + 0.5 + j(0.7) + (k === 0 ? 0.6 : 0), c.z + Math.sin(a) * rr), 500 + v * 23 + i * 5 + k, 0.74, 0);
      }
    }
    lobe(verde ? 0.9 : 1.05, V3(j(0.5), 4.9 + j(0.3), j(0.5)), 520 + v, 0.72, 0);
  } else if (kind === 'fanpalm') {
    // Washingtonia: a tall, straight, slim trunk, a compact round head of fan fronds, and the
    // skirt of dead brown fronds hanging under it — the palm of desert and California streets
    trunkR = 0.24;
    const H = 9.4 + r.float() * 2.0;
    const lean = V3(j(0.35), 0, j(0.35));
    const top = V3(lean.x, H, lean.z);
    wood.push(part(limb(V3(0, -0.3, 0), top, trunkR * 1.25, trunkR * 0.8, 7), 0x7a6a58));
    // the skirt: a hanging shell of thatch, widest at the top (street palms are kept trimmed short)
    const skirt = lathe([[0.001, -1.25], [0.5, -1.22], [0.6, -0.5], [0.48, -0.02], [0.001, 0]], 9);
    wood.push(part(skirt.translate(top.x, top.y - 0.15, top.z), 0x8a7552));
    // the head: broad fan fronds splayed out on long stalks — a ~4 m crown, not a knob
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN, up = 0.75 - (i / n) * 1.35;
      const fr = card(1.5, 2.1 + r.float() * 0.45, 0.42, 2);
      fr.rotateX(-up);
      fr.rotateY(a);
      fr.translate(top.x, top.y + 0.15, top.z);
      leaf.push(fr);
    }
    lobe(0.55, V3(top.x, top.y + 0.3, top.z), 540 + v, 0.9);
  } else if (kind === 'maple') {
    if (v === 2) {
      // bigleaf maple, the Northwest's own: two or three stems leaning out from one base, each
      // carrying a heavy, uneven billow of huge leaves — broad, open, a tree for a park or a ravine
      trunkR = 0.3;
      const stems = 3, a0 = r.float() * Math.PI * 2;
      for (let i = 0; i < stems; i++) {
        const a = a0 + i * ((2 * Math.PI) / stems) + j(0.4), ca = Math.cos(a), sa = Math.sin(a);
        const knee = V3(ca * 0.9, 2.6 + j(0.3), sa * 0.9), tip = V3(ca * (2.6 + r.float() * 0.6), 5.6 + j(0.5), sa * (2.6 + r.float() * 0.6));
        wood.push(part(limb(V3(ca * 0.15, -0.3, sa * 0.15), knee, trunkR * (i ? 0.8 : 1), trunkR * 0.65, 5), BARK), part(limb(knee, tip, trunkR * 0.6, trunkR * 0.22, 4), BARK));
        lobe(1.95 + r.float() * 0.3, tip.clone().add(V3(ca * 0.3, 0.7, sa * 0.3)), 610 + v * 17 + i * 3, 0.78, 0);
        lobe(1.45 + r.float() * 0.25, tip.clone().add(V3(-sa * 1.2 + ca * 0.5, -0.4 + j(0.3), ca * 1.2 + sa * 0.5)), 611 + v * 17 + i * 3, 0.8, 0);
        lobe(1.35 + r.float() * 0.25, knee.clone().add(V3(ca * 1.3 + sa * 0.6, 0.9, sa * 1.3 - ca * 0.6)), 612 + v * 17 + i * 3, 0.8, 0);
      }
      lobe(2.2, V3(j(0.4), 6.6 + j(0.3), j(0.4)), 640 + v, 0.72);
    } else {
      // sugar or red maple: a short trunk under a full, dense egg of a crown — widest a third of the
      // way up, a finer texture of many small lobes, reaching down near the lawn (the round tree is
      // a ball held up on a tall bare trunk; this is the maple's closed oval)
      trunkR = 0.26;
      const th = 2.1 + j(0.3), lean = V3(j(0.2), 0, j(0.2)), top = V3(lean.x, th, lean.z);
      leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
      wood.push(part(limb(V3(0, -0.3, 0), top, trunkR, trunkR * 0.6, 6), BARK));
      for (let i = 0; i < 4; i++) {
        const a = i * GOLDEN + r.float();
        wood.push(part(limb(top.clone().add(V3(0, -0.4, 0)), top.clone().add(V3(Math.cos(a) * 1.5, 2.2 + j(0.3), Math.sin(a) * 1.5)), trunkR * 0.5, trunkR * 0.22, 4), BARK));
      }
      const rx = 3.3 + j(0.2), ry = 3.2 + j(0.3), cy = top.y + 3.0, n = 14;
      for (let i = 0; i < n; i++) {
        const u = fibSphere(i, n, -0.75, r.float() * 6);
        const w = rx * (1 - 0.18 * u.y); // (the egg: fuller low, narrower toward the top)
        lobe(1.2 * taper(i / n, 0.8) * (0.88 + r.float() * 0.24), V3(lean.x + u.x * w * 0.74, cy + u.y * ry * 0.74, lean.z + u.z * w * 0.74), 600 + v * 17 + i, 0.92, 0);
      }
      lobe(2.3, V3(lean.x, cy - 0.2, lean.z), 640 + v, 1.05);
    }
  } else if (kind === 'willow') {
    // weeping willow: a stout leaning trunk, limbs arching up and out under a rounded dome, and
    // from the dome a curtain of long tresses that bow out and fall to about a metre off the
    // ground (the wind swings them) — the tree of riverbanks and pond edges
    trunkR = 0.34;
    const th = 2.3 + j(0.3), lean = V3(j(0.5), 0, j(0.5)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(part(limb(V3(0, -0.3, 0), top, trunkR, trunkR * 0.7, 6), BARK_DARK));
    const R0 = 2.8 + j(0.3), H0 = 6.8 + j(0.5);
    for (let i = 0; i < 4; i++) {
      const a = i * GOLDEN + r.float();
      wood.push(part(limb(top.clone().add(V3(0, -0.3, 0)), V3(lean.x + Math.cos(a) * R0 * 0.7, H0 - 0.9 + j(0.4), lean.z + Math.sin(a) * R0 * 0.7), trunkR * 0.5, trunkR * 0.18, 4), BARK_DARK));
    }
    // the dome: a few round lobes (not a lid)
    for (let k = 0; k < 5; k++) {
      const u = fibSphere(k, 5, 0.1, r.float() * 6);
      lobe(1.55 + r.float() * 0.3, V3(lean.x + u.x * R0 * 0.55, H0 - 0.6 + u.y * 0.8, lean.z + u.z * R0 * 0.55), 700 + v * 13 + k, 0.8, 0);
    }
    // the curtain: tresses set round the dome at the golden angle, each a ribbon full-width at the
    // top and narrowing to its tip, bowing out from under the dome and then hanging straight
    const nS = 34;
    for (let i = 0; i < nS; i++) {
      const a = i * GOLDEN, ca = Math.cos(a), sa = Math.sin(a);
      const r0 = R0 * (0.62 + 0.28 * r.float()), bow = 0.35 + r.float() * 0.35;
      const y0 = H0 - 0.4 - (r0 - R0 * 0.6) * 0.9 + j(0.25), y1 = 0.9 + r.float() * 1.3;
      const w0 = 0.75 + r.float() * 0.3;
      const pts: [number, number, number][] = []; // (radius, height, half-width) down the tress
      for (let k = 0; k <= 2; k++) {
        const t = k / 2;
        pts.push([r0 + bow * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2), y0 + (y1 - y0) * t, (w0 / 2) * (1 - 0.6 * t)]);
      }
      const pos: number[] = [];
      const P = (rr: number, y: number, hw: number, side: number): [number, number, number] => [lean.x + ca * rr - sa * hw * side, y, lean.z + sa * rr + ca * hw * side];
      for (let k = 0; k < 2; k++) {
        const A = P(pts[k][0], pts[k][1], pts[k][2], -1), B = P(pts[k][0], pts[k][1], pts[k][2], 1), C = P(pts[k + 1][0], pts[k + 1][1], pts[k + 1][2], 1), D = P(pts[k + 1][0], pts[k + 1][1], pts[k + 1][2], -1);
        pos.push(...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C); // (both faces)
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      leaf.push(g);
    }
  } else if (kind === 'elm') {
    // American elm: the trunk forks low into a vase of limbs that rise and arch out into a broad,
    // high umbrella — the cathedral arch over an old Main Street
    trunkR = 0.3;
    const th = 2.4 + j(0.3), lean = V3(j(0.2), 0, j(0.2)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(part(limb(V3(0, -0.3, 0), top, trunkR, trunkR * 0.75, 6), BARK_DARK));
    const W = 3.6 + j(0.4), H = 8.4 + j(0.6), limbs = 3;
    for (let i = 0; i < limbs; i++) {
      const a = i * ((2 * Math.PI) / limbs) + r.float() * 0.6;
      const knee = V3(lean.x + Math.cos(a) * W * 0.3, th + 2.6, lean.z + Math.sin(a) * W * 0.3);
      const tip = V3(lean.x + Math.cos(a) * W * 0.78, H - 0.9, lean.z + Math.sin(a) * W * 0.78);
      wood.push(part(limb(top.clone().add(V3(0, -0.3, 0)), knee, trunkR * 0.6, trunkR * 0.42, 4), BARK_DARK), part(limb(knee, tip, trunkR * 0.42, trunkR * 0.18, 4), BARK_DARK));
    }
    // the umbrella: one broad dome of overlapping lobes (no sky between them), a flat core to
    // close its middle, and a drooping outer fringe
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.2, r.float() * 6);
      lobe(1.8 + r.float() * 0.3, V3(lean.x + u.x * W * 0.7, H - 0.9 + u.y * 1.5, lean.z + u.z * W * 0.7), 760 + v * 11 + i, 0.8, 0);
    }
    lobe(2.6, V3(lean.x, H - 0.8, lean.z), 775 + v, 0.6, 0);
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI / 2) + 0.4 + r.float() * 0.5;
      lobe(1.45 + r.float() * 0.2, V3(lean.x + Math.cos(a) * W * 0.82, H - 1.9 + j(0.3), lean.z + Math.sin(a) * W * 0.82), 780 + v * 7 + k, 0.85, 0);
    }

  } else if (kind === 'poplar') {
    // Lombardy poplar (and, dark, the Italian cypress): a narrow column of foliage from low on
    // the trunk to a point — the windbreak row, the formal drive, the Tuscan hill
    trunkR = 0.2;
    const H = 11 + j(0.8);
    wood.push(part(limb(V3(0, -0.3, 0), V3(0, H - 2, 0), trunkR, trunkR * 0.3, 5), BARK));
    // a spindle: lobes a little apart round the axis, overlapping tier on tier so the column
    // reads as one piece, narrowing to the tip
    const tiers = 9;
    for (let t = 0; t < tiers; t++) {
      // (tiers close enough near the tip that each overlaps the next — its top used to float off)
      const f = t / (tiers - 1), y = 1.6 + f * (H - 3.1), rad = 1.12 * (1 - 0.55 * Math.pow(f, 1.4)) * (0.8 + 0.25 * Math.sin(f * Math.PI));
      const k2 = t % 2 ? 1 : 2;
      for (let k = 0; k < k2; k++) {
        const a = t * GOLDEN + k * Math.PI;
        lobe(rad * (0.9 + r.float() * 0.15), V3(Math.cos(a) * rad * 0.22, y + j(0.2), Math.sin(a) * rad * 0.22), 800 + v * 19 + t * 2 + k, 1.45, 0);
      }
    }
  } else if (kind === 'magnolia') {
    // southern magnolia: evergreen, dense, dark and glossy — an egg of foliage, broad at the base
    // and reaching down almost to the lawn, rounding off at the top
    trunkR = 0.24;
    const H = 8.2 + j(0.6);
    wood.push(part(limb(V3(0, -0.3, 0), V3(j(0.15), H - 1.6, j(0.15)), trunkR, trunkR * 0.4, 6), BARK_DARK));
    const cy = H * 0.5, rx = 2.5 + j(0.2), ry = H * 0.4, n = 13;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.85, r.float() * 6);
      const w = rx * (1 - 0.32 * u.y); // (wider low, narrower high)
      lobe(1.25 + r.float() * 0.2, V3(u.x * w * 0.78, cy + u.y * ry * 0.8, u.z * w * 0.78), 840 + v * 23 + i, 0.9, 0);
    }
    lobe(2.1, V3(0, cy - 0.3, 0), 860 + v, 1.2, 0);
  } else if (kind === 'cherry') {
    // flowering cherry: a short trunk, limbs spreading wide and low, a broad flat-topped crown —
    // in April a cloud of pink (propMaterial's blossom)
    trunkR = 0.2;
    const th = 1.5 + j(0.2), lean = V3(j(0.25), 0, j(0.25)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(part(limb(V3(0, -0.3, 0), top, trunkR, trunkR * 0.7, 6), 0x5a3f36));
    for (let i = 0; i < 4; i++) {
      const a = i * GOLDEN + r.float();
      wood.push(part(limb(top.clone().add(V3(0, -0.2, 0)), V3(lean.x + Math.cos(a) * 2.3, th + 1.7 + j(0.3), lean.z + Math.sin(a) * 2.3), trunkR * 0.55, trunkR * 0.22, 4), 0x5a3f36));
    }
    // a rounded, spreading crown: lobes packed over a wide dome round a flat core
    const n = 12, cy = th + 2.5;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.5, r.float() * 6);
      lobe(1.4 + r.float() * 0.25, V3(lean.x + u.x * 2.0, cy + u.y * 1.25, lean.z + u.z * 2.0), 880 + v * 13 + i, 0.9, 0);
    }
    lobe(2.2, V3(lean.x, cy, lean.z), 895 + v, 0.75, 0);
    // (the underside breaks into clumps hanging between the limbs — from below it read as a
    // tabletop)
    for (let k = 0; k < 3; k++) {
      const a = k * ((2 * Math.PI) / 3) + 0.5 + r.float() * 0.6, rr = 1.3 + r.float() * 0.5;
      lobe(0.95 + r.float() * 0.2, V3(lean.x + Math.cos(a) * rr, cy - 1.15 - r.float() * 0.25, lean.z + Math.sin(a) * rr), 897 + v * 5 + k, 0.9, 0);
    }
  }

  const leafGeo = merge(leaf.map((g) => part(g, TINT)));
  const geo = merge([...wood, leafGeo]);
  const bb = bounds(geo), lb = bounds(leafGeo);
  const meta: TreeMeta = {
    h: bb.max.y,
    crownR: Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z) / 2,
    crownBottom: Math.max(0.3, lb.min.y),
    trunkR,
    lean: leanPer,
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

