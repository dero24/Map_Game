import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TREE_KINDS, TREE_VARIANTS, treeGeometry, PLANT_SPECIES, plantGeometry, plantMix, inBloom, stageOf, STAGES, fallHueOf, NEAR_KINDS, nearTreeGeometry, CARD_STRIDE, LEAF_PICS, leafAtlas } from '../src/assets/flora';
import { TREE_TIERS } from '../src/render/quality';
import { CRITTERS, critterGeometry } from '../src/assets/fauna';
import { MAILBOXES, mailboxGeometry, gearGeometry, gearFor, CAR_GEAR, umbrellaGeometry, picnicTableGeometry } from '../src/assets/furniture';
import { fibCount, fibSphere, hashf, variantAt, tube } from '../src/assets/core';
import { personGeometry, personLiteGeometry, HAIRSTYLES, MARK, warmthFor } from '../src/assets/people';
import { dogLib } from '../src/assets/fauna';
import * as D from '../src/assets/decor';
import { SPORT_PIECES, sportGeometry } from '../src/assets/sport';
import { TOWER_KINDS, towerGeometry } from '../src/assets/tower';
import { STALL_KINDS, stallGeometry, STALL_VARIANTS } from '../src/assets/market';
import { validGeometry } from '../src/assets/core';
import { courtFrame, diamondFrame, sportOf } from '../src/world/sports';

const bb = (g: THREE.BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!);
const verts = (g: THREE.BufferGeometry) => g.getAttribute('position').count;
const finite = (g: THREE.BufferGeometry) => (g.getAttribute('position').array as Float32Array).every(Number.isFinite);
const partCount = (g: THREE.BufferGeometry, id: number) => { const a = g.getAttribute('aPart').array; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] === id) n++; return n; };

describe('foundry core', () => {
  it('growth maths: Fibonacci counts, sphere lattice, hashes', () => {
    expect([fibCount(0, 1, 3), fibCount(0.99, 1, 3)]).toEqual([3, 8]);
    for (let i = 0; i < 8; i++) expect(fibSphere(i, 8).length()).toBeCloseTo(1, 5);
    expect(hashf(42)).toBe(hashf(42));
    expect(variantAt(10.2, 33.1, 3)).toBe(variantAt(10.2, 33.1, 3));
  });
});

describe('flora', () => {
  it('trees: every species × variant is sane, grounded, deterministic and within budget', () => {
    for (const k of TREE_KINDS) for (let v = 0; v < TREE_VARIANTS; v++) {
      const { geo, meta } = treeGeometry(k, v);
      const b = bb(geo);
      expect(finite(geo)).toBe(true);
      expect(b.min.y).toBeLessThanOrEqual(0.01); // the trunk reaches into the ground
      expect(meta.h).toBeGreaterThan(k === 'shrub' ? 1.5 : 5);
      expect(meta.h).toBeLessThan(14);
      expect(meta.crownR).toBeGreaterThan(0.5);
      expect(meta.crownBottom).toBeLessThan(meta.h);
      expect(verts(geo)).toBeLessThan(1500);
      expect(verts(treeGeometry(k, v).geo)).toBe(verts(geo));
    }
  });
  it('the broadleaf species read as themselves', () => {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const w = treeGeometry('willow', v).meta, p = treeGeometry('poplar', v).meta, c = treeGeometry('cherry', v).meta, m = treeGeometry('magnolia', v).meta, e = treeGeometry('elm', v).meta;
      expect(w.crownBottom).toBeLessThan(1.6); // the curtain hangs to near the ground
      expect(w.crownR).toBeGreaterThan(2.5);
      expect(p.crownR / p.h).toBeLessThan(0.16); // a column
      expect(c.h).toBeLessThan(7); // low and spreading
      expect(c.crownR / c.h).toBeGreaterThan(0.45);
      expect(m.crownBottom).toBeLessThan(1.3); // foliage nearly to the lawn
      expect(e.crownBottom / e.h).toBeLessThan(0.56); // (the vase stays a street tree, not a lollipop)
      expect(e.crownR).toBeGreaterThan(3.5);
      // the oak spreads as wide as it stands tall, a broad dome on heavy limbs — never a ball on a
      // pole — and the maple is a full egg down near the lawn, where the round tree holds its ball
      // up on a trunk
      const o = treeGeometry('oak', v).meta, mp = treeGeometry('maple', v).meta, rd = treeGeometry('round', v).meta;
      expect((2 * o.crownR) / o.h).toBeGreaterThan(1.0);
      expect(o.crownR / o.h).toBeGreaterThan(1.4 * (rd.crownR / rd.h));
      expect(o.crownBottom / o.h).toBeLessThan(0.56);
      expect(mp.crownBottom).toBeLessThan(rd.crownBottom - 0.5);
      if (v < 2) expect(mp.crownR / mp.h).toBeGreaterThan(rd.crownR / rd.h);
      else expect(mp.crownR).toBeGreaterThan(4); // (the bigleaf maple: three stems, a broad open crown)
    }
    expect(fallHueOf('maple', 0)).toBe(1); // sugar and red maples go scarlet…
    expect(fallHueOf('maple', 2)).toBe(2); // …the bigleaf gold
  });
  it('variants differ', () => {
    const a = bb(treeGeometry('round', 0).geo), b = bb(treeGeometry('round', 1).geo);
    expect(a.max.y === b.max.y && a.max.x === b.max.x).toBe(false);
  });
  it('plants grow: bigger with growth, blossoms only when mature and in season', () => {
    for (const sp of PLANT_SPECIES) {
      const young = plantGeometry(sp, 1, 0.2), grown = plantGeometry(sp, 1, 1);
      expect(finite(grown)).toBe(true);
      expect(bb(grown).max.y).toBeGreaterThan(bb(young).max.y);
      expect(partCount(young, 8)).toBe(0);
      expect(partCount(plantGeometry(sp, 1, 1, false), 8)).toBe(0);
      expect(verts(plantGeometry(sp, 1, 1, true, true))).toBeLessThanOrEqual(verts(grown));
      expect(verts(plantGeometry(sp, 1, 1, true, true))).toBeLessThan(900);
    }
    expect(partCount(plantGeometry('hydrangea', 1, 1), 8)).toBeGreaterThan(0);
    expect(stageOf(0)).toBe(0);
    expect(stageOf(1)).toBe(STAGES - 1);
  });
  // The near model (round 11, must-fix 4): within ~30 m a tree is its branch skeleton and 8–20
  // leaf-cluster cards, grown from the far recipe's own plan (flora.ts nearTreeGeometry)
  it('near trees: every species with a near model is sane, grounded, deterministic and within budget', () => {
    let n = 0;
    for (const k of TREE_KINDS) for (let v = 0; v < TREE_VARIANTS; v++) {
      if (!NEAR_KINDS.has(k)) continue;
      n++;
      const t = nearTreeGeometry(k, v), b = bb(t.wood), cards = t.cards.length / CARD_STRIDE;
      expect(finite(t.wood)).toBe(true);
      expect(t.cards.every(Number.isFinite)).toBe(true);
      expect(b.min.y).toBeLessThanOrEqual(0.01); // the root reaches into the ground…
      expect(b.min.y).toBeGreaterThan(-0.6); // …and no deeper than the far trunk's
      expect(cards).toBeGreaterThanOrEqual(8);
      expect(cards).toBeLessThanOrEqual(20);
      // ≤ 2,500 vertices a tree: its wood, and four corners a card
      expect(verts(t.wood) + 4 * cards).toBeLessThanOrEqual(2500);
      for (let i = 0; i < t.cards.length; i += CARD_STRIDE) {
        expect(t.cards[i + 3]).toBeGreaterThan(0.2); // half its width, m
        expect(t.cards[i + 6]).toBeGreaterThanOrEqual(0);
        expect(t.cards[i + 6]).toBeLessThan(LEAF_PICS);
        expect(t.cards[i + 7]).toBeGreaterThanOrEqual(0);
        expect(t.cards[i + 7]).toBeLessThanOrEqual(1);
      }
      const again = nearTreeGeometry(k, v);
      expect(verts(again.wood)).toBe(verts(t.wood));
      expect(Array.from(again.cards)).toEqual(Array.from(t.cards));
    }
    expect(n).toBe(NEAR_KINDS.size * TREE_VARIANTS);
  });
  it('near trees: the trunk flares and tapers, limbs reach into the crown, the crown stands where the far one does', () => {
    for (const k of NEAR_KINDS) for (let v = 0; v < TREE_VARIANTS; v++) {
      const t = nearTreeGeometry(k, v), far = treeGeometry(k, v);
      // the trunk's base at least 30% wider than where it meets the crown
      expect(t.trunk[0]).toBeGreaterThanOrEqual(1.3 * t.trunk[1]);
      // …and the mesh says so: its widest ring at the ground against the far trunk's
      const P = t.wood.getAttribute('position');
      let r0 = 0;
      for (let i = 0; i < P.count; i++) if (Math.abs(P.getY(i)) < 0.02) r0 = Math.max(r0, Math.hypot(P.getX(i), P.getZ(i)));
      if (k !== 'birch' && k !== 'mesquite' && !(k === 'maple' && v === 2)) expect(r0).toBeGreaterThan(1.3 * far.meta.trunkR); // (a clump's stems stand apart)
      // the street and yard broadleaves show at least three limbs going up into the crown
      if (['round', 'oak', 'maple', 'elm', 'cherry', 'birch', 'mesquite'].includes(k)) expect(t.limbsIn).toBeGreaterThanOrEqual(3);
      // every card's middle inside the far crown's box, and the cards reach out to fill most of it
      const lb = new THREE.Box3();
      for (const l of far.plan.lobes) lb.expandByPoint(l.c.clone().addScalar(-l.r)).expandByPoint(l.c.clone().addScalar(l.r));
      const cb = new THREE.Box3();
      for (let i = 0; i < t.cards.length; i += CARD_STRIDE) {
        const c = new THREE.Vector3(t.cards[i], t.cards[i + 1], t.cards[i + 2]), h = t.cards[i + 3];
        expect(lb.containsPoint(c)).toBe(true);
        cb.expandByPoint(c.clone().addScalar(-h * 0.9)).expandByPoint(c.clone().addScalar(h * 0.9));
      }
      const fs = lb.getSize(new THREE.Vector3()), ns = cb.getSize(new THREE.Vector3());
      expect(ns.x / fs.x).toBeGreaterThan(0.85);
      expect(ns.x / fs.x).toBeLessThan(1.25);
      expect(ns.y / fs.y).toBeGreaterThan(0.8);
      expect(ns.y / fs.y).toBeLessThan(1.3);
    }
  });
  it('a tube bends without creasing: no normal turns more than 25° from one ring to the next', () => {
    // a limb with a 40° knee, tapering
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 2, 0), new THREE.Vector3(0.64, 2.77, 0), new THREE.Vector3(1.29, 3.53, 0)];
    const g = tube(pts, [0.3, 0.27, 0.24, 0.2, 0.15], 6), N = g.getAttribute('normal'), P = g.getAttribute('position');
    // each quad: (i,k) (i,k+1) (i+1,k+1) (i,k) (i+1,k+1) (i+1,k) — compare the ring-i corner with the ring-(i+1) corner on the same side
    let worst = 0;
    for (let q = 0; q < N.count; q += 6) {
      const a = new THREE.Vector3(N.getX(q), N.getY(q), N.getZ(q)), b = new THREE.Vector3(N.getX(q + 5), N.getY(q + 5), N.getZ(q + 5));
      worst = Math.max(worst, (a.angleTo(b) * 180) / Math.PI);
    }
    expect(worst).toBeLessThan(25);
    expect(finite(g)).toBe(true);
    expect(P.count).toBe(4 * 6 * 6);
  });
  it('leaf pictures: deterministic, leafy at the heart, ragged at the rim, with gaps between the leaves', () => {
    const S = 64, a = leafAtlas(S), b = leafAtlas(S);
    expect(a.w).toBe(4 * S);
    expect(a.data.every((x, i) => x === b.data[i])).toBe(true);
    for (let p = 0; p < LEAF_PICS; p++) {
      let inN = 0, inC = 0, rimN = 0, rimC = 0;
      const ox = (p % 4) * S, oy = Math.floor(p / 4) * S;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = (x + 0.5 - S / 2) / (S / 2 - 3), v = (y + 0.5 - S / 2) / (S / 2 - 3), r = Math.hypot(u, v), on = a.data[((oy + y) * a.w + ox + x) * 4 + 3] >= 128;
        if (r < 0.6) (inN++, (inC += on ? 1 : 0));
        else if (r > 0.85 && r < 1) (rimN++, (rimC += on ? 1 : 0));
      }
      expect(inC / inN).toBeGreaterThan(0.5); // a mass of leaves…
      expect(inC / inN).toBeLessThan(0.97); // …with the sky between some of them
      expect(rimC / rimN).toBeLessThan(inC / inN); // and thinner at the edge: the outline is leaves
    }
  });
  it('near trees: a phone draws at most 40; every tier within its vertex budget', () => {
    expect(TREE_TIERS.phone.near).toBeLessThanOrEqual(40);
    expect(TREE_TIERS.low.near).toBeLessThanOrEqual(TREE_TIERS.phone.near);
    for (const t of Object.values(TREE_TIERS)) {
      expect(t.near * 2500).toBeLessThanOrEqual(400000);
      expect(t.hand).toBeLessThanOrEqual(30);
      expect(t.band).toBeGreaterThan(0);
    }
  });
  it('gardens follow the climate and the calendar', () => {
    for (const c of ['tropical', 'arid', 'mediterranean', 'temperate', 'continental', 'boreal', 'polar']) expect(plantMix(c).length).toBeGreaterThan(0);
    expect(plantMix('arid').some(([s]) => s === 'agave')).toBe(true);
    expect(inBloom('hydrangea', 7)).toBe(true);
    expect(inBloom('hydrangea', 1)).toBe(false);
    expect(inBloom('hydrangea', 1, true)).toBe(true); // January is summer in the south
    expect(inBloom('agave', 7)).toBe(false);
  });
});

describe('fauna', () => {
  it('every animal is jointed, on its feet and within budget', () => {
    for (const k of CRITTERS) {
      const g = critterGeometry(k);
      expect(finite(g)).toBe(true);
      expect(g.getAttribute('aPivot')).toBeTruthy();
      expect(g.getAttribute('aPivot').count).toBe(verts(g));
      if (k !== 'butterfly' && k !== 'firefly') expect(Math.abs(bb(g).min.y)).toBeLessThan(0.03);
      expect(verts(g)).toBeLessThan(1600);
    }
    expect(partCount(critterGeometry('squirrel'), 5)).toBeGreaterThan(0); // the tail swings
    expect(partCount(critterGeometry('songbird'), 7)).toBeGreaterThan(0); // wings
    expect(partCount(critterGeometry('hawk'), 7)).toBeGreaterThan(0); // the hawk soars on the bird plan
    expect(partCount(critterGeometry('fox'), 5)).toBeGreaterThan(0); // the brush
    // the walkers' dogs: the fox plan, coat tintable, on its feet, a tail that wags
    const dog = dogLib();
    expect(finite(dog)).toBe(true);
    expect(Math.abs(bb(dog).min.y)).toBeLessThan(0.03);
    expect(verts(dog)).toBeLessThan(1600);
    expect(partCount(dog, 5)).toBeGreaterThan(0);
    const hb = new THREE.Box3().setFromBufferAttribute(critterGeometry('hawk').getAttribute('position') as THREE.BufferAttribute);
    expect(hb.max.x - hb.min.x).toBeGreaterThan(0.5); // a raptor's wingspan, not a songbird's
  });
});

describe('furniture', () => {
  it('mailboxes and beach things stand on the ground', () => {
    for (const s of MAILBOXES) expect(bb(mailboxGeometry(s)).min.y).toBeGreaterThan(-0.05);
    expect(bb(umbrellaGeometry(0)).max.y).toBeGreaterThan(1.8);
    expect(bb(picnicTableGeometry()).min.y).toBeGreaterThan(-0.05);
  });
  it('roof gear sits on the roof; surfboards turn up near the coast', () => {
    for (const g of CAR_GEAR) if (g !== 'bike') expect(bb(gearGeometry(g, 1.5, 4.6, 1.8)).min.y).toBeGreaterThanOrEqual(1.48); // rails rest on the roof skin
    let coast = 0, inland = 0;
    for (let i = 0; i < 2000; i++) { if (gearFor((i + 0.5) / 2000, true) === 'surf') coast++; if (gearFor((i + 0.5) / 2000, false) === 'surf') inland++; }
    expect(coast).toBeGreaterThan(100);
    expect(inland).toBe(0);
  });
});

describe('people', () => {
  it('one jointed body: on its feet, person-sized, every hairstyle and colour marker present, within budget', () => {
    const g = personGeometry();
    const b = bb(g);
    expect(finite(g)).toBe(true);
    expect(Math.abs(b.min.y)).toBeLessThan(0.02);
    expect(b.max.y).toBeGreaterThan(1.65);
    expect(b.max.y).toBeLessThan(1.85);
    expect(verts(g)).toBeLessThan(1800); // (headphones joined the wardrobe: 180 vertices)
    for (const id of [1, 2, 5, 6]) expect(partCount(g, id)).toBeGreaterThan(0); // legs and arms swing
    HAIRSTYLES.forEach((_, i) => expect(partCount(g, 9 + i)).toBeGreaterThan(0));
    expect(partCount(g, 14)).toBeGreaterThan(0); // headphones, worn per person
    const col = g.getAttribute('color');
    for (const m of Object.values(MARK)) {
      let n = 0;
      for (let i = 0; i < col.count; i++) if (col.getX(i) === m[0] && col.getY(i) === m[1] && col.getZ(i) === m[2]) n++;
      expect(n).toBeGreaterThan(0);
    }
  });
  it('the lite body (a beach crowd past ~40 m): the full body\'s joints, parts and markers in under 300 vertices', () => {
    const g = personLiteGeometry(), full = personGeometry();
    const b = bb(g), bf = bb(full);
    expect(finite(g)).toBe(true);
    expect(Math.abs(b.min.y)).toBeLessThan(0.03);
    expect(Math.abs(b.max.y - bf.max.y)).toBeLessThan(0.12); // (the same height: the same pose)
    expect(verts(g)).toBeLessThan(300);
    for (const id of [0, 1, 2, 5, 6, 9]) expect(partCount(g, id)).toBeGreaterThan(0);
    const col = g.getAttribute('color');
    for (const m of Object.values(MARK)) {
      let n = 0;
      for (let i = 0; i < col.count; i++) if (col.getX(i) === m[0] && col.getY(i) === m[1] && col.getZ(i) === m[2]) n++;
      expect(n).toBeGreaterThan(0);
    }
  });
  it('people dress for the climate and the season', () => {
    expect(warmthFor('tropical', 7)).toBeGreaterThan(warmthFor('continental', 1));
    expect(warmthFor('temperate', 7)).toBeGreaterThan(warmthFor('temperate', 1));
    expect(warmthFor('temperate', 1, true)).toBeGreaterThan(warmthFor('temperate', 1));
  });
});

describe('decor (interior + terrace furniture)', () => {
  const W = 0x8a6242, F = 0x9c6a5a;
  // [pieces, vertex budget, declared footprint w × d (or null), floor-standing?]
  const cases: [string, D.DecorPart[], number, [number, number] | null, boolean][] = [
    ['sofa', D.sofa(2, 0.9, F), 4000, [2, 0.9], true],
    ['armchair', D.armchair(0.8, 0.8, F), 2400, [0.8, 0.8], true],
    ['bed', D.bed(1.6, 2.0, F, W), 3000, [1.6, 2.0], true],
    ['table', D.table(1.2, 0.8, 0.75, W), 600, [1.2, 0.8], true],
    ['roundTable', D.roundTable(0.35, 0.74, 0xf1ede4), 600, [0.7, 0.7], true],
    ['chair', D.chair(W, F), 1500, null, true],
    ['bistroChair', D.bistroChair(0x2a2622), 1200, null, true],
    ['officeChair', D.officeChair(0x3a3b3e), 1600, null, true],
    ['monitor', D.monitor(), 400, null, true],
    ['floor lamp', D.lamp(true), 400, null, true],
    ['counter', D.counter(3, 0.65, W), 2600, [3, 0.65], true],
    ['ceilingFan', D.ceilingFan(W), 1200, null, false],
    ['chestBench', D.chestBench(1, 0.42, W, F), 1200, [1, 0.42], true],
    ['booth', D.booth(1.25, 0x9c2a26, 0xe9e2d0), 2000, [1.25, 2.2], true],
    ['shelves', D.shelves(1.2, 0.4, 1.8, W, [0xc46a4a, 0x7fa0b8], 7), 2000, [1.2, 0.4], true],
    ['pottedPlant', D.pottedPlant(true), 1500, null, true],
    ['cafeSet', D.cafeSet(0xf1ede4, 0x2a2622, 0x2f4a6a), 2600, null, true],
    // the pieces a planned interior repeats (docs/INTERIORS_PLAN.md, Slice 1): plain boxes, instanced by the hundred
    ['kitchenRun', D.kitchenRun(3.9), 800, [3.9, 0.66], true],
    ['kitchenRun (under a window)', D.kitchenRun(2.4, undefined, undefined, false), 600, [2.42, 0.66], true],
    ['workstation', D.workstation(), 500, [1.6, 1.4], true],
    ['doorFrame', D.doorFrame(0.9), 200, [1.06, 0.16], true],
    ['doorLeaf', D.doorLeaf(0.8), 350, [0.8, 0.14], true],
    ['toilet', D.toilet(), 500, [0.42, 0.66], true],
    ['vanity', D.vanity(0.7), 300, [0.72, 0.5], true],
    ['bathtub', D.bathtub(1.7), 200, [1.7, 0.76], true],
    ['wardrobe', D.wardrobe(1.1), 250, [1.1, 0.62], true],
    ['dresser', D.dresser(1.1), 800, [1.1, 0.5], true],
    ['bookcase', D.bookcase(1.0, 12, [0xc46a4a, 0x7fa0b8]), 2600, [1.0, 0.34], true],
    ['gondola', D.gondola(1.23, 101, [0xc46a4a, 0x7fa0b8]), 2600, [1.23, 0.9], true],
    ['washer', D.washer(), 200, [0.6, 0.6], true],
    ['liftDoors', D.liftDoors(), 250, [1.3, 0.12], true],
    // a tower's lobby and lift lobbies (Slice 3): the landing door's frame and leaves, the car you ride
    ['liftFrame', D.liftFrame(1.1), 200, [1.4, 0.22], true],
    ['liftLeaf', D.liftLeaf(0.56), 100, [0.56, 0.04], true],
    ['liftCar', D.liftCar(2.1, 1.6), 900, [2.14, 1.64], true],
    ['liftButton', D.liftButton(), 150, [0.12, 0.04], true],
    ['turnstile', D.turnstile(), 200, [0.75, 1.25], true],
    ['securityDesk', D.securityDesk(2.4), 200, [2.46, 0.7], true],
    ['directory', D.directory(), 400, [1.1, 0.07], true],
    ['mailboxes', D.mailboxes(1.6), 1000, [1.6, 0.31], true],
    ['rack', D.rack(2.4), 900, [2.4, 0.6], true],
    ['range', D.range(), 400, [1.2, 0.8], true],
    ['ceilingLight', D.ceilingLight(0.6, 0.24, 0.05), 100, [0.6, 0.24], false],
    // the deeper archetypes (Slice 4): a supermarket's, a church's, a hotel's, a school's, a
    // library's, a bank's and a post office's, a gym's
    ['checkout', D.checkout(4.2), 500, [4.2, 0.84], true],
    ['cooler', D.cooler(1.9, 3, [0xc46a4a, 0x7fa0b8]), 2600, [1.9, 1.0], true],
    ['cooler (doors)', D.cooler(1.9, 3, [0xc46a4a, 0x7fa0b8], true), 2600, [1.9, 1.0], true],
    ['produce', D.produce(2.4, 1.2, 5), 1500, [2.4, 1.2], true],
    ['pew', D.pew(4.5), 450, [4.5, 0.72], true],
    ['altar', D.altar(2.0), 500, [2.04, 0.84], true],
    ['lectern', D.lectern(), 150, [0.55, 0.45], true],
    ['hotelBed', D.hotelBed(1.6), 600, [2.66, 2.14], true],
    ['hotelDesk', D.hotelDesk(2.6), 450, [2.6, 1.3], true],
    ['schoolDesk', D.schoolDesk(), 700, [1.2, 1.0], true],
    ['whiteboard', D.whiteboard(3.0), 250, [3.06, 0.08], true],
    ['bookStack', D.bookStack(0.9, 7, [0xc46a4a, 0x7fa0b8]), 4200, [0.9, 0.6], true],
    ['tellerCounter', D.tellerCounter(4.5), 700, [4.54, 0.72], true],
    ['queuePosts', D.queuePosts(2.8), 900, [3.1, 0.32], true],
    ['atm', D.atm(), 200, [0.8, 0.48], true],
    ['treadmill', D.treadmill(), 350, [0.78, 1.95], true],
    ['weightBench', D.weightBench(), 900, [1.8, 1.27], true],
    ['dumbbellRack', D.dumbbellRack(1.8), 1500, [1.8, 0.5], true],
    ['lockers', D.lockers(1.8), 800, [1.8, 0.46], true],
    // the way in (review round 10, must-fix 4): coats on their rail, the hall's runner, the console
    // with its lamp lit, the mirror over it, a metre of skirting, a ceiling light's dome
    ['coatRail', D.coatRail(1.0, 4, 3), 3200, [1.06, 0.3], true],
    ['runner', D.runner(3.0, 0.8), 800, [3.12, 0.8], true],
    ['consoleLamp', D.consoleLamp(1.0), 1200, [1.0, 0.32], true],
    ['mirror', D.mirror(0.7, 0.9), 250, [0.73, 0.045], true],
    ['skirting', D.skirting(), 100, [1.0, 0.02], true],
    ['ceilingDome', D.ceilingDome(0.17, 'lamp'), 500, [0.4, 0.4], false],
  ];
  it('coats hang as coats: three or more on a rail, rounded, 0.9–1.1 m long, whatever the seed', () => {
    for (let seed = 0; seed < 32; seed++)
      for (const n of [3, 4]) {
        const parts = D.coatRail(1.0, n, seed);
        // (a coat's body: the fabric part that hangs most of a metre)
        const bodies = parts.filter((p) => p.mat === 'fabric' && bb(p.g).max.y - bb(p.g).min.y > 0.85);
        expect(bodies.length).toBe(n);
        for (const p of bodies) {
          const b = bb(p.g), len = b.max.y - b.min.y;
          expect(len).toBeGreaterThanOrEqual(0.9 - 1e-6);
          expect(len).toBeLessThanOrEqual(1.1 + 1e-6);
          // rounded: a turned body, many vertices across its width at the waist (a box has two)
          const pos = p.g.getAttribute('position'), xs = new Set<number>();
          for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - (b.min.y + 0.46 * len)) < 0.01) xs.add(Math.round(pos.getX(i) * 1000) * 10000 + Math.round(pos.getZ(i) * 1000));
          expect(xs.size).toBeGreaterThanOrEqual(6);
          // it hangs in front of the wall, from a peg at ~1.66 m
          expect(b.max.y).toBeGreaterThan(1.6);
          expect(b.max.z).toBeLessThanOrEqual(0.15 + 1e-6);
        }
      }
    expect(Array.from(D.mergeDecor(D.coatRail(1, 3, 5)).getAttribute('position').array)).toEqual(Array.from(D.mergeDecor(D.coatRail(1, 3, 5)).getAttribute('position').array));
  });
  it('the skirting is 12 cm of trim white, its back on the wall', () => {
    const b = new THREE.Box3();
    for (const p of D.skirting()) b.union(bb(p.g));
    expect(b.max.y).toBeCloseTo(D.SKIRT_H, 2);
    expect(b.max.z).toBeCloseTo(0.009, 3);
    for (const p of D.skirting()) for (const sh of [16, 8, 0]) expect((p.hex >> sh) & 255).toBeGreaterThanOrEqual(0xe0); // (trim white)
  });
  it('every piece is valid, grounded, within its footprint and its vertex budget', () => {
    for (const [name, parts, budget, fp, floor] of cases) {
      let n = 0;
      const b = new THREE.Box3();
      for (const p of parts) {
        expect(p.g.index, name).toBeNull(); // non-indexed, like every foundry part
        expect(p.g.getAttribute('normal'), name).toBeTruthy();
        expect(finite(p.g), name).toBe(true);
        n += verts(p.g);
        b.union(bb(p.g));
      }
      expect(n, name).toBeLessThan(budget);
      if (floor) expect(b.min.y, name).toBeGreaterThan(-0.011);
      else expect(b.max.y, name).toBeLessThan(0.5); // a ceiling fan hangs down from its canopy at 0.45
      if (fp) {
        expect(b.max.x - b.min.x, name).toBeLessThan(fp[0] + 0.1);
        expect(b.max.z - b.min.z, name).toBeLessThan(fp[1] + 0.1);
      }
    }
  });
  it('stock is deterministic by seed and differs between seeds', () => {
    const pos = (seed: number) => D.mergeDecor(D.shelves(1.2, 0.4, 1.8, W, [0xc46a4a, 0x7fa0b8], seed)).getAttribute('position').array;
    expect(Array.from(pos(7))).toEqual(Array.from(pos(7)));
    expect(Array.from(pos(7))).not.toEqual(Array.from(pos(8)));
    // (a bookcase's books and a gondola's stock too — and never past their budgets, whatever the seed)
    const n = (p: D.DecorPart[]) => p.reduce((a, q) => a + verts(q.g), 0);
    for (let seed = 0; seed < 64; seed++) {
      expect(n(D.bookcase(1.0, seed, [0xc46a4a, 0x7fa0b8]))).toBeLessThan(2600);
      expect(n(D.gondola(1.23, seed, [0xc46a4a, 0x7fa0b8]))).toBeLessThan(2600);
      // (Slice 4's stocked pieces: a cooler's decks, a stack's books, a stand's produce)
      expect(n(D.cooler(1.9, seed, [0xc46a4a, 0x7fa0b8], seed % 2 === 1))).toBeLessThan(2600);
      expect(n(D.bookStack(0.9, seed, [0xc46a4a, 0x7fa0b8]))).toBeLessThan(4200);
      expect(n(D.produce(2.4, 1.2, seed))).toBeLessThan(1500);
    }
    const stack = (seed: number) => D.mergeDecor(D.bookStack(0.9, seed, [0xc46a4a, 0x7fa0b8])).getAttribute('position').array;
    expect(Array.from(stack(3))).toEqual(Array.from(stack(3)));
    expect(Array.from(stack(3))).not.toEqual(Array.from(stack(4)));
    const books = (seed: number) => D.mergeDecor(D.bookcase(1.0, seed, [0xc46a4a, 0x7fa0b8])).getAttribute('position').array;
    expect(Array.from(books(11))).toEqual(Array.from(books(11)));
    expect(Array.from(books(11))).not.toEqual(Array.from(books(12)));
  });
  it('a café set seats two across its table; mergeDecor bakes vertex colour', () => {
    const set = D.cafeSet(0xf1ede4, 0x2a2622, null);
    const g = D.mergeDecor(set);
    expect(g.getAttribute('color').count).toBe(verts(g));
    expect(verts(g)).toBe(set.reduce((a, p) => a + verts(p.g), 0));
    // chairs sit either side of the table (the set spans ≥ 1 m across, but stays compact in depth)
    const b = bb(g);
    expect(b.max.x - b.min.x).toBeGreaterThan(1.0);
    expect(verts(D.mergeDecor(D.cafeSet(0xf1ede4, 0x2a2622, 0x2f4a6a)))).toBeGreaterThan(verts(g)); // + parasol
  });
});

describe('sport: the courts and fields in the parks', () => {
  it('every piece is valid, grounded and within budget; the rim is at regulation height', () => {
    for (const k of SPORT_PIECES)
      for (const v of k === 'bases' ? [0, 1] : [0]) {
        const g = sportGeometry(k, v);
        expect(validGeometry(g, { w: 45, h: 7, d: 45 }), k).toBe(true);
        expect(verts(g), k).toBeLessThan(k === 'backstop' ? 1500 : 900); // (five fence bays and a hood)
      }
    const rim = bb(sportGeometry('hoop'));
    expect(rim.max.y).toBeGreaterThan(3.8); // the board's top
    expect(rim.max.y).toBeLessThan(4.1);
    const tn = bb(sportGeometry('tennisNet')).max.x;
    expect(tn).toBeGreaterThan(6.35); // posts 0.914 m outside the doubles lines (and their footings)
    expect(tn).toBeLessThan(6.6);
  });
  it('reads the sport off the map', () => {
    expect(sportOf('basketball')).toBe('basketball');
    expect(sportOf('multi;tennis;basketball')).toBe('tennis');
    expect(sportOf('beachvolleyball')).toBe('volleyball');
    expect(sportOf('equestrian')).toBeNull();
    expect(sportOf(undefined)).toBeNull();
  });
  it('fits the courts into their mapped outline: one court, a row of four, a half court', () => {
    const rect = (w: number, l: number): [number, number][] => [[0, 0], [l, 0], [l, w], [0, w]];
    const one = courtFrame(rect(18.3, 36.6), 'tennis'); // a court with its run-off, length along x
    expect(one.n).toBe(1);
    expect(Math.abs(one.ux)).toBeCloseTo(1, 3);
    expect(one.L).toBeCloseTo(23.77, 1);
    const four = courtFrame(rect(36.6, 73.2), 'tennis'); // four side by side: the long side is ACROSS them
    expect(four.n).toBe(4);
    expect(Math.abs(four.uz)).toBeCloseTo(1, 3); // their length runs along z
    const half = courtFrame(rect(15.2, 14), 'basketball');
    expect(half.half).toBe(true);
    const full = courtFrame(rect(17, 31), 'basketball');
    expect(full.half).toBe(false);
    expect(full.L).toBeCloseTo(28, 1);
  });
  it('finds home plate at the point of a mapped fan', () => {
    // a quarter-circle field: home at (0, 0), foul lines along +x and +z, the arc between
    const fan: [number, number][] = [[0, 0], [100, 0]];
    for (let a = 0.1; a < Math.PI / 2; a += 0.1) fan.push([Math.cos(a) * 100, Math.sin(a) * 100]);
    fan.push([0, 100]);
    const d = diamondFrame(fan, 'baseball');
    expect(Math.hypot(d.hx, d.hz)).toBeLessThan(0.01);
    expect(d.dx).toBeCloseTo(Math.SQRT1_2, 2); // out along the bisector, to second base
    expect(d.dz).toBeCloseTo(Math.SQRT1_2, 2);
    expect(d.side).toBeCloseTo(27.43, 1);
  });
});

describe('towers: the tall things a town is known by', () => {
  it('each is a valid unit-height model within budget, standing on its foot', () => {
    for (const k of TOWER_KINDS) {
      const g = towerGeometry(k);
      expect(validGeometry(g, { w: 0.7, h: 1.1, d: 0.7 }, 0.01), k).toBe(true);
      expect(verts(g), k).toBeLessThan(k === 'mast' ? 3000 : 1500);
      expect(bb(g).max.y, k).toBeGreaterThan(0.97); // scales to the mapped height
    }
  });
});


describe('market stalls: what makes a market read as one from the street', () => {
  it('every trade and variant is sane, grounded, under budget, and awning-tinted', () => {
    for (const k of STALL_KINDS)
      for (let v = 0; v < STALL_VARIANTS; v++) {
        const g = stallGeometry(k, v);
        expect(validGeometry(g, { w: 3.0, h: 2.8, d: 2.2 })).toBe(true);
        expect(g.getAttribute('position').count).toBeLessThan(1800);
        // some white (TINT) surfaces: the awning the instance colour paints
        const c = g.getAttribute('color');
        let white = 0;
        for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.99 && c.getY(i) > 0.99 && c.getZ(i) > 0.99) white++;
        expect(white).toBeGreaterThan(0);
      }
  });
  it('the table stands in front, the awning over it higher at the back', () => {
    const g = stallGeometry('produce', 0), p = g.getAttribute('position');
    let backTop = -Infinity, frontTop = -Infinity;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 2) continue;
      if (p.getZ(i) > 1.2) backTop = Math.max(backTop, p.getY(i));
      if (p.getZ(i) < 0) frontTop = Math.max(frontTop, p.getY(i));
    }
    expect(backTop).toBeGreaterThan(frontTop);
    expect(frontTop).toBeGreaterThan(2.1); // clear of a shopper's head
  });
});

import { STREET_KINDS, STREET_VARIANTS, streetGeometry, streetPaint } from '../src/assets/street';
describe('street furniture: the small things the map places one by one', () => {
  // [footprint w × h × d, vertex budget]
  const SIZE: Record<string, [number, number, number, number]> = {
    postbox: [0.6, 1.2, 0.6, 400], pillarbox: [0.65, 1.5, 0.65, 800], bikerack: [2.6, 1.0, 1.8, 2000],
    drinking: [0.55, 1.1, 0.55, 500], bollard: [0.25, 1.1, 0.25, 350], meter: [0.45, 1.65, 0.35, 300], viewer: [0.6, 1.65, 0.6, 1000],
  };
  it('every piece and variant is valid, standing on its foot, in its footprint and under budget', () => {
    for (const k of STREET_KINDS)
      for (let v = 0; v < STREET_VARIANTS; v++) {
        const g = streetGeometry(k, v), [w, h, d, budget] = SIZE[k];
        expect(validGeometry(g, { w, h, d }, 0.01), `${k}:${v}`).toBe(true);
        expect(verts(g), `${k}:${v}`).toBeLessThan(budget);
        expect(bb(g).max.y, k).toBeGreaterThan(h * 0.6);
      }
  });
  it('racks hold a varying number of bikes; the paint follows the region', () => {
    const n = [0, 1, 2].map((v) => verts(streetGeometry('bikerack', v)));
    expect(new Set(n).size).toBe(3);
    expect(streetPaint('postbox', 'na')).not.toBe(streetPaint('postbox', 'eu'));
    expect(streetPaint('bikerack', 'na', 0.1)).not.toBe(streetPaint('bikerack', 'na', 0.5));
  });
});

import { PLAY_KINDS, playGeometry, PLAY_FOOT } from '../src/assets/play';
describe('playgrounds: the pieces a park\'s playground is made of', () => {
  it('every piece is valid, standing on the ground inside its footprint, painted, under budget', () => {
    for (const k of PLAY_KINDS) {
      const g = playGeometry(k), [hx, hz] = PLAY_FOOT[k];
      expect(validGeometry(g, { w: hx * 2 + 0.3, h: 4.2, d: hz * 2 + 0.3 }, 0.02), k).toBe(true);
      expect(verts(g), k).toBeLessThan(1500);
      const c = g.getAttribute('color');
      let white = 0;
      for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.99 && c.getY(i) > 0.99 && c.getZ(i) > 0.99) white++;
      if (k !== 'sandpit') expect(white, k).toBeGreaterThan(0); // (the park's paint)
    }
  });
  it('the slide lands at the front, the swing seats hang at a child\'s height', () => {
    const b = bb(playGeometry('slide'));
    expect(b.max.z).toBeGreaterThan(1.6);
    expect(b.max.y).toBeGreaterThan(2.0);
    expect(bb(playGeometry('swing')).max.y).toBeGreaterThan(2.2);
  });
});

import { MICRO_KINDS, microLib } from '../src/assets/micro';
describe('micro things: the small made objects the micro layer draws (assets/micro.ts)', () => {
  it('every piece is valid, within its box and under budget; on its foot (a float: at the waterline; a wall mount: at its bracket)', () => {
    for (const k of MICRO_KINDS) {
      const g = k.geo(), [w, h, d] = k.box, b = bb(g);
      expect(finite(g), k.id).toBe(true);
      expect(verts(g), k.id).toBeLessThanOrEqual(k.budget);
      expect(b.max.x - b.min.x, k.id).toBeLessThanOrEqual(w);
      expect(b.max.y - b.min.y, k.id).toBeLessThanOrEqual(h);
      expect(b.max.z - b.min.z, k.id).toBeLessThanOrEqual(d);
      if (k.mount === 'float') expect(b.min.y, k.id).toBeGreaterThan(-2.1); // (a buoy's skirt, a marker's pile under the water)
      else if (!k.mount) expect(Math.abs(b.min.y), k.id).toBeLessThanOrEqual(0.21); // (an umbrella's pole is pushed into the sand)
      for (const a of ['position', 'normal', 'color']) expect(g.getAttribute(a), `${k.id} ${a}`).toBeDefined();
      // every collider fits inside the piece's own footprint
      if (k.solid) expect(k.solid[0] * 2 <= w + 0.01 && k.solid[1] * 2 <= d + 0.01, k.id).toBe(true);
    }
    expect(new Set(MICRO_KINDS.map((k) => k.id)).size).toBe(MICRO_KINDS.length);
  });
  it('is deterministic, and most pieces take the instance colour somewhere (TINT)', () => {
    let tinted = 0;
    for (const k of MICRO_KINDS) {
      const a = k.geo().getAttribute('position').array, b = k.geo().getAttribute('position').array;
      expect(Array.from(a)).toEqual(Array.from(b));
      const c = microLib(k.id)!.getAttribute('color').array as Float32Array;
      let white = false;
      for (let i = 0; i + 2 < c.length; i += 3) if (c[i] >= 0.98 && c[i + 1] >= 0.98 && c[i + 2] >= 0.98) white = true;
      if (white) tinted++;
    }
    expect(tinted).toBeGreaterThan(MICRO_KINDS.length * 0.6);
  });
});
