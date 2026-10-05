import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TREE_KINDS, TREE_VARIANTS, treeGeometry, PLANT_SPECIES, plantGeometry, plantMix, inBloom, stageOf, STAGES, fallHueOf, NEAR_KINDS, nearTreeGeometry, CARD_STRIDE, LEAF_PICS, leafAtlas, hasNear, DECIDUOUS, BLOSSOM_OF, MOTION_OF, packCardFlags, unpackCardFlags, cardFlags, picsOf, NEEDLED, treeHeight4, SMALL_TREE, type TreeKind } from '../src/assets/flora';
import leafCardsSrc from '../src/render/leafCards.ts?raw';
import { TREE_TIERS } from '../src/render/quality';
import { CRITTERS, critterGeometry } from '../src/assets/fauna';
import { MAILBOXES, mailboxGeometry, gearGeometry, gearFor, CAR_GEAR, umbrellaGeometry, picnicTableGeometry } from '../src/assets/furniture';
import { fibCount, fibSphere, hashf, variantAt, tube } from '../src/assets/core';
import { personGeometry, personLiteGeometry, HAIRSTYLES, MARK, warmthFor } from '../src/assets/people';
import { dogLib } from '../src/assets/fauna';
import * as D from '../src/assets/decor';
import { FABRIC, CABINET_PAINT, CAB_WHITE, cabinetColour } from '../src/world/interior/furnish';
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
      // (the shrubs; the rosebay's laurel hell, low and sprawling, and the chaparral's manzanita; the
      // longleaf's grass stage, under a metre)
      expect(meta.h).toBeGreaterThan(k === 'shrub' || k === 'willowshrub' ? 1.5 : k === 'rosebay' || k === 'manzanita' ? 3.5 : k === 'longleaf' && v === 0 ? 0.6 : 5);
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
  // The Northwest's trees (docs/regional-life/16-pnw.md; Robby: "do northwest")
  it('the Northwest conifers read as themselves: spires, bare-trunked in the forest, each with its mark', () => {
    for (const k of ['fir', 'hemlock', 'sitka', 'cedar'] as const) {
      const open = treeGeometry(k, 0).meta, forest = treeGeometry(k, 1).meta;
      expect(open.crownR / open.h).toBeLessThan(0.32); // a spire, not a ball
      expect(open.crownBottom / open.h).toBeLessThan(0.12); // grown in the open: foliage near the ground
      expect(forest.crownBottom / forest.h).toBeGreaterThan(k === 'cedar' ? 0.15 : 0.22); // in the forest, a bare trunk
      for (let v = 0; v < TREE_VARIANTS; v++) {
        const n = nearTreeGeometry(k, v), pics = new Set<number>();
        for (let i = 0; i < n.cards.length; i += CARD_STRIDE) pics.add(n.cards[i + 6]);
        // needles up close; the redcedar its own flat sprays
        expect([...pics].every((p) => (k === 'cedar' ? p === 8 || p === 9 : p >= 4 && p <= 7))).toBe(true);
      }
    }
    // the hemlock that grew on a nurse log stands on stilt roots: wood at the ground a metre out from the trunk
    const P = treeGeometry('hemlock', 2).geo.getAttribute('position');
    let out = 0;
    for (let i = 0; i < P.count; i++) if (P.getY(i) < 0.2) out = Math.max(out, Math.hypot(P.getX(i), P.getZ(i)));
    expect(out).toBeGreaterThan(0.8);
    // the old redcedar's candelabra: dead silver wood at the very top
    const cd = treeGeometry('cedar', 2).plan;
    expect(Math.max(...cd.boughs.filter((b) => b.col === 0x9e978b).map((b) => b.b.y))).toBeGreaterThan(Math.max(...cd.lobes.map((l) => l.c.y)));
  });
  it('the Northwest broadleaves: the red alder narrow on pale stems, the vine maple a sprawl, the bigleaf maple hung with moss', () => {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const a = treeGeometry('alder', v), vm = treeGeometry('vinemaple', v).meta;
      expect(a.meta.crownR / a.meta.h).toBeLessThan(0.36);
      expect(a.plan.boughs[0].col).toBe(0xc4bfb3); // pale grey bark
      expect(vm.crownR / vm.h).toBeGreaterThan(0.55);
      expect(vm.h).toBeLessThan(7.5);
    }
    // moss beards under the bigleaf's limbs and licorice fern along them, in both models
    const bl = treeGeometry('maple', 2);
    expect(bl.plan.hang.length).toBeGreaterThanOrEqual(6);
    const C = bl.geo.getAttribute('color'), moss = new THREE.Color(0x8a9a46);
    let mossy = 0;
    for (let i = 0; i < C.count; i++) if (Math.abs(C.getX(i) - moss.r) < 1e-3 && Math.abs(C.getY(i) - moss.g) < 1e-3) mossy++;
    expect(mossy).toBeGreaterThan(0);
    const near = nearTreeGeometry('maple', 2), pics = new Set<number>();
    for (let i = 0; i < near.cards.length; i += CARD_STRIDE) pics.add(near.cards[i + 6]);
    expect([...pics].every((p) => p === 10 || p === 11)).toBe(true); // the maple's big hands
    expect(fallHueOf('vinemaple', 0)).toBe(1); // scarlet in October
    expect(fallHueOf('alder', 0)).toBe(3); // the alder's drop near green
  });
  // The live oaks (docs/regional-life/models.md build order #2; liveoak†): the South's spreading twice
  // as wide as it stands on limbs that rest on the ground, the Hill Country's mott, California's
  // round dark dome on snaking limbs
  it('the live oaks read as themselves: umbrellas twice as wide as they stand, limbs resting on the ground', () => {
    for (const k of ['liveoak', 'plateauoak', 'coastoak'] as const) {
      for (let v = 0; v < TREE_VARIANTS; v++) {
        const t = treeGeometry(k, v);
        expect((2 * t.meta.crownR) / t.meta.h, `${k}:${v}`).toBeGreaterThan(k === 'liveoak' && v !== 1 ? 2.2 : 1.6);
        expect(t.meta.crownBottom / t.meta.h, `${k}:${v}`).toBeLessThan(0.45); // (a canopy you walk under, its rim low)
        // evergreen: they keep their leaves through the winter
        expect(fallHueOf(k, v)).toBe(0);
      }
    }
    // the grand old southern live oak and the gnarled one: a limb comes down to the ground far out from
    // the trunk, and rises again
    for (const v of [0, 2]) {
      const wood = treeGeometry('liveoak', v).plan.boughs.filter((b) => b.a.y > 0.05);
      expect(wood.some((b) => b.b.y < 0.3 && Math.hypot(b.b.x, b.b.z) > 3.5)).toBe(true);
    }
    // the Hill Country's mott: three trunks out of one root crown
    expect(treeGeometry('plateauoak', 1).plan.boughs.filter((b) => b.a.y < 0).length).toBe(3);
    // the coast live oak's dome rounder than the southern's flat umbrella
    const sq = (k: 'liveoak' | 'coastoak') => treeGeometry(k, 0).plan.lobes.reduce((m, l) => m + l.sq, 0) / treeGeometry(k, 0).plan.lobes.length;
    expect(sq('coastoak')).toBeGreaterThan(sq('liveoak'));
    // their near models wear small leaves
    for (const k of ['liveoak', 'plateauoak', 'coastoak'] as const) {
      const n = nearTreeGeometry(k, 0);
      for (let i = 0; i < n.cards.length; i += CARD_STRIDE) expect([0, 1]).toContain(n.cards[i + 6]);
    }
  });
  // Package #4 (docs/regional-life/models.md build order 4; Robby: "make things detailed, and variety and
  // variation matter"): the eastern hardwoods, the flowering understory and the southern pines
  it('the eastern hardwoods read as themselves: a tulip tree, a sycamore and a white oak tell apart by shape alone', () => {
    const m = (k: TreeKind, v: number) => treeGeometry(k, v).meta;
    const rh = (k: TreeKind) => [0, 1, 2].map((v) => m(k, v).crownR / m(k, v).h), deep = (k: TreeKind) => [0, 1, 2].map((v) => (m(k, v).h - m(k, v).crownBottom) / (2 * m(k, v).crownR));
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    // the tulip tree a high narrow crown on its ramrod, deeper than it is wide; the sycamore an open crown
    // deeper than the street oak's and narrower for its height, on big pale limbs, and twice the oak's
    // height when grown; the street oak a broad shallow dome
    for (const x of rh('tuliptree')) expect(x).toBeLessThan(0.26);
    for (const x of deep('tuliptree')) expect(x).toBeGreaterThan(1.0);
    for (const x of rh('sycamore')) expect(x).toBeGreaterThan(0.38);
    expect(mean(rh('sycamore'))).toBeLessThan(Math.min(...rh('oak')) - 0.04);
    expect(mean(deep('sycamore'))).toBeGreaterThan(mean(deep('oak')) + 0.05);
    expect(mean(rh('sycamore'))).toBeGreaterThan(1.8 * mean(rh('tuliptree')));
    expect(treeHeight4('sycamore', 0, 0, false)).toBeGreaterThan(15); // (props.ts grows a street oak to 8–15 m)
    expect(m('tuliptree', 1).crownBottom / m('tuliptree', 1).h).toBeGreaterThan(0.45); // (the forest's: bare more than halfway up)
    // the young sweetgum a pyramid: its crown wider low than high
    const sg = treeGeometry('sweetgum', 0).plan.lobes, y0 = Math.min(...sg.map((l) => l.c.y)), y1 = Math.max(...sg.map((l) => l.c.y));
    const reach = (a: number, b: number) => Math.max(...sg.filter((l) => l.c.y >= y0 + (y1 - y0) * a && l.c.y <= y0 + (y1 - y0) * b).map((l) => Math.hypot(l.c.x, l.c.z) + l.r));
    expect(reach(0, 0.34)).toBeGreaterThan(1.5 * reach(0.66, 1));
    // the shagbark's strips curling off its trunk, in both models; the sycamore's white limbs and its
    // flaking mottle; the buckeye round and low
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const hk = treeGeometry('hickory', v).plan;
      expect(hk.hang.length, `shag ${v}`).toBeGreaterThanOrEqual(8);
      const sy = treeGeometry('sycamore', v).plan;
      expect(sy.boughs.some((b) => b.col === 0xe4e0d4 && b.a.y > 2)).toBe(true);
      expect(sy.hang.length).toBeGreaterThanOrEqual(6);
    }
    expect(m('buckeye', 0).crownR / m('buckeye', 0).h).toBeGreaterThan(0.27);
    expect(m('buckeye', 0).crownBottom / m('buckeye', 0).h).toBeLessThan(0.25);
    // the bur oak savanna-wide on thick limbs
    const bo = treeGeometry('buroak', 0);
    expect(bo.meta.crownR / bo.meta.h).toBeGreaterThan(0.5);
    expect(bo.plan.boughs.filter((b) => b.a.y > 1 && b.r0 >= 0.6 * bo.meta.trunkR).length).toBeGreaterThanOrEqual(4);
    // their autumns: the tulip tree gold, the sweetgum's jewels, the buckeye early orange, the bur oak
    // and the sycamore russet
    expect([fallHueOf('tuliptree', 0), fallHueOf('sweetgum', 0), fallHueOf('buckeye', 0), fallHueOf('buroak', 0), fallHueOf('sycamore', 0)]).toEqual([2, 4, 5, 6, 6]);
  });
  it('the flowering understory: the dogwood in tiers, the redbud and the crape myrtle on many stems, the rosebay a thicket', () => {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      // the dogwood's flat tiers, three or more one over another with air between them
      const dw = treeGeometry('dogwood', v);
      const tiers = [...new Set(dw.plan.lobes.map((l) => Math.round(l.c.y * 1.2)))];
      expect(tiers.length, `dogwood ${v}`).toBeGreaterThanOrEqual(3);
      expect(dw.plan.lobes.every((l) => l.sq <= 0.55)).toBe(true); // (flat: leafy layers, wider than deep)
      expect(dw.meta.h).toBeLessThan(7.5);
      // stems from the ground: the redbud's (all but the forked one), the crape myrtle's, the rosebay's
      const stems = (k: TreeKind) => treeGeometry(k, v).plan.boughs.filter((b) => b.a.y < -0.2).length;
      if (v !== 1) expect(stems('redbud'), `redbud ${v}`).toBeGreaterThanOrEqual(2);
      expect(stems('crapemyrtle'), `crape ${v}`).toBeGreaterThanOrEqual(3);
      expect(stems('rosebay'), `rosebay ${v}`).toBeGreaterThanOrEqual(4);
      // the redbud flat-topped and spreading, wider than half its height
      const rb = treeGeometry('redbud', v).meta;
      expect(rb.crownR / rb.h).toBeGreaterThan(0.45);
    }
    // the crape myrtle's mottled bark; the pollarded one's knuckles: whips bunched on fists, a narrow crown
    expect(treeGeometry('crapemyrtle', 0).plan.hang.length).toBeGreaterThanOrEqual(8);
    expect(treeGeometry('crapemyrtle', 2).meta.crownR).toBeLessThan(treeGeometry('crapemyrtle', 0).meta.crownR);
    // what each flowers as, and its fall
    expect([BLOSSOM_OF.cherry, BLOSSOM_OF.dogwood, BLOSSOM_OF.redbud, BLOSSOM_OF.crapemyrtle, BLOSSOM_OF.rosebay]).toEqual([1, 2, 3, 4, 5]);
    expect(fallHueOf('dogwood', 0)).toBe(1); // burgundy
    expect(DECIDUOUS.has('rosebay')).toBe(false); // evergreen…
    expect(fallHueOf('rosebay', 0)).toBe(7); // …its leaves curling bronze in the cold
    expect(MOTION_OF.dogwood).toBe(2); // the tiers bob
  });
  it('the southern pines: a tall bare bole under a small crown; the longleaf a grass stage, a bottlebrush and an old flat top', () => {
    const lob = treeGeometry('loblolly', 1).meta, ll = treeGeometry('longleaf', 2).meta;
    expect(lob.crownBottom / lob.h).toBeGreaterThan(0.55);
    expect(lob.crownR / lob.h).toBeLessThan(0.25);
    expect(ll.crownBottom / ll.h).toBeGreaterThan(0.55);
    // the grass stage: no trunk above the bud, a fountain of needles wider than it stands; never near-drawn
    const gs = treeGeometry('longleaf', 0);
    expect(gs.meta.h).toBeLessThan(1.5);
    expect(gs.meta.crownR).toBeGreaterThan(gs.meta.h * 0.8);
    expect(Math.max(...gs.plan.boughs.map((b) => b.b.y))).toBeLessThan(0.3);
    expect(hasNear('longleaf', 0)).toBe(false);
    // the bottlebrush: one stem, no boughs off it
    const bb2 = treeGeometry('longleaf', 1);
    expect(bb2.plan.boughs.length).toBe(2);
    expect(bb2.meta.crownR).toBeLessThan(1.4);
    // the old slash pine of the rocklands leaning and flat-topped; all of them needled, the longleaf's tossing
    for (const k of ['loblolly', 'longleaf', 'slashpine'] as const) {
      expect(NEEDLED.has(k)).toBe(true);
      expect(DECIDUOUS.has(k)).toBe(false);
    }
    expect(MOTION_OF.longleaf).toBe(3);
    // the redcedar: a dark column to the ground, a cone on an old field
    const rc0 = treeGeometry('redcedar', 0).meta, rc1 = treeGeometry('redcedar', 1).meta;
    expect(rc0.crownR / rc0.h).toBeLessThan(0.16);
    expect(rc0.crownBottom).toBeLessThan(0.6);
    expect(rc1.crownR).toBeGreaterThan(rc0.crownR * 1.4);
    expect(fallHueOf('redcedar', 0)).toBe(7);
  });
  it('each new tree wears its own leaf up close, and its real height', () => {
    const pics = (k: TreeKind, v = 1) => { const n = nearTreeGeometry(k, v), s = new Set<number>(); for (let i = 0; i < n.cards.length; i += CARD_STRIDE) s.add(n.cards[i + 6]); return [...s].sort((a, b) => a - b); };
    expect(pics('sweetgum')).toEqual([12, 13]); // stars
    expect(pics('tuliptree')).toEqual([14, 15]); // tulips
    expect(pics('hickory')).toEqual([16, 17]); // five leaflets
    expect(pics('buckeye')).toEqual([18, 19]); // five fingers
    expect(pics('redbud')).toEqual([20, 21]); // hearts
    for (const k of ['loblolly', 'longleaf', 'slashpine'] as const) expect(pics(k)).toEqual([22, 23]); // long needles in brushes
    expect(pics('redcedar')).toEqual([8, 9]); // scale-leaf sprays
    expect(pics('sycamore')).toEqual([10, 11]); // big maple-like hands
    expect(picsOf('crapemyrtle', 0, false)).toEqual([0, 1]); // small leaves
    expect(LEAF_PICS).toBe(28);
    // the small trees never taller than they grow; the tulip tree the tallest hardwood in a cove
    for (const k of Object.keys(SMALL_TREE) as TreeKind[]) for (let v = 0; v < TREE_VARIANTS; v++) expect(treeHeight4(k, v, 1, true)).toBeLessThanOrEqual(SMALL_TREE[k]!);
    expect(treeHeight4('tuliptree', 0, 1, true)).toBeGreaterThan(treeHeight4('sweetgum', 0, 1, true));
    expect(treeHeight4('longleaf', 0, 1, true)).toBeLessThan(1);
    expect(treeHeight4('round', 0, 0.5, true)).toBe(0); // (props.ts sizes the older kinds itself)
  });
  // Package #5 (models.md build order 5): the swamps and the rivers
  it('the swamps and rivers: the cypress on its fluted foot among its knees, the tupelo on its bottle, the cottonwoods broad', () => {
    const groundReach = (k: TreeKind, v: number, y0: number, y1: number) => {
      const P = treeGeometry(k, v).geo.getAttribute('position');
      let r = 0;
      for (let i = 0; i < P.count; i++) if (P.getY(i) > y0 && P.getY(i) < y1) r = Math.max(r, Math.hypot(P.getX(i), P.getZ(i)));
      return r;
    };
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const bc = treeGeometry('baldcypress', v);
      // the flaring foot: wood at knee height twice the trunk's girth out; the knees standing round it
      expect(groundReach('baldcypress', v, 0.1, 0.5), `foot ${v}`).toBeGreaterThan(1.7 * bc.meta.trunkR);
      const C = bc.geo.getAttribute('color'), knee = new THREE.Color(0x8e7a66);
      let kneeV = 0;
      for (let i = 0; i < C.count; i++) if (Math.abs(C.getX(i) - knee.r) < 1e-3 && Math.abs(C.getY(i) - knee.g) < 1e-3) kneeV++;
      expect(kneeV, `knees ${v}`).toBeGreaterThanOrEqual(4 * 18);
    }
    // young a cone with its sprays near the ground; grown in the swamp flat-topped high on its trunk
    const y0 = treeGeometry('baldcypress', 0).meta, y1 = treeGeometry('baldcypress', 1).meta;
    expect(y0.crownBottom / y0.h).toBeLessThan(0.15);
    expect(y1.crownBottom / y1.h).toBeGreaterThan(0.3);
    expect(y1.crownR / y1.h).toBeGreaterThan(y0.crownR / y0.h);
    expect(treeGeometry('pondcypress', 2).meta.h).toBeLessThan(7.5); // the dwarf cypress
    // the water tupelo's swollen bottle foot
    const tp = treeGeometry('tupelo', 0);
    expect(groundReach('tupelo', 0, 0.1, 0.5)).toBeGreaterThan(1.8 * tp.meta.trunkR);
    // the cottonwoods broad, their leaves rattling; Fremont's bark pale
    for (const k of ['cottonwood', 'fremont'] as const) {
      for (let v = 0; v < TREE_VARIANTS; v++) expect(treeGeometry(k, v).meta.crownR / treeGeometry(k, v).meta.h, `${k} ${v}`).toBeGreaterThan(0.38);
      expect(MOTION_OF[k]).toBe(1);
      expect(fallHueOf(k, 0)).toBe(2); // gold
    }
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(treeGeometry('fremont', 0).plan.boughs[0].col)).toBeGreaterThan(lum(treeGeometry('cottonwood', 0).plan.boughs[0].col) + 60);
    // seasons: all bare in winter; the cypresses russet, the swamp tupelo scarlet, the water tupelo rusty
    for (const k of ['baldcypress', 'pondcypress', 'tupelo', 'cottonwood', 'fremont'] as const) expect(DECIDUOUS.has(k)).toBe(true);
    expect([fallHueOf('baldcypress', 1), fallHueOf('tupelo', 0), fallHueOf('tupelo', 1)]).toEqual([6, 6, 1]);
    // their own leaves up close: the cypress's feathers, the cottonwood's triangles
    const pics = (k: TreeKind) => { const n = nearTreeGeometry(k, 1), q = new Set<number>(); for (let i = 0; i < n.cards.length; i += CARD_STRIDE) q.add(n.cards[i + 6]); return [...q].sort((a, b) => a - b); };
    expect(pics('baldcypress')).toEqual([24, 25]);
    expect(pics('cottonwood')).toEqual([26, 27]);
  });
  // Package #6 (models.md build order 6): California's oaks, its giants and its chaparral
  it("California: the valley oak's weeping spread, the blue oak small, the redwood's column on its fluted foot, the sequoia's, the manzanita's red stems", () => {
    const groundReach = (k: TreeKind, v: number, y0: number, y1: number) => {
      const P = treeGeometry(k, v).geo.getAttribute('position');
      let r = 0;
      for (let i = 0; i < P.count; i++) if (P.getY(i) > y0 && P.getY(i) < y1) r = Math.max(r, Math.hypot(P.getX(i), P.getZ(i)));
      return r;
    };
    const coloured = (k: TreeKind, v: number, hex: number) => {
      const C = treeGeometry(k, v).geo.getAttribute('color'), c = new THREE.Color(hex);
      let n = 0;
      for (let i = 0; i < C.count; i++) if (Math.abs(C.getX(i) - c.r) < 1e-3 && Math.abs(C.getY(i) - c.g) < 1e-3 && Math.abs(C.getZ(i) - c.b) < 1e-3) n++;
      return n;
    };
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const vo = treeGeometry('valleyoak', v).meta, bo = treeGeometry('blueoak', v).meta;
      expect((2 * vo.crownR) / vo.h, `valley oak ${v}`).toBeGreaterThan(1.0); // as wide as it stands tall, or wider
      expect(bo.crownR, `blue oak ${v}`).toBeLessThan(vo.crownR); // the blue oak the smaller tree
      // the redwood's foot fluted and flaring
      expect(groundReach('redwood', v, 0.05, 0.6), `redwood foot ${v}`).toBeGreaterThan(1.4 * treeGeometry('redwood', v).meta.trunkR);
    }
    const vo0 = treeGeometry('valleyoak', 0).meta;
    expect(vo0.crownBottom / vo0.h).toBeLessThan(0.25); // its outer branches hanging near the grass
    // the redwood: young a spire to the ground; the grove's a bare column, its crown narrow and high
    const r0 = treeGeometry('redwood', 0).meta, r1 = treeGeometry('redwood', 1).meta;
    expect(r0.crownBottom).toBeLessThan(1);
    expect(r1.crownBottom / r1.h).toBeGreaterThan(0.4);
    expect(r1.crownR / r1.h).toBeLessThan(0.2);
    // the sequoia: grown and ancient, the thickest trunk of all, its fire scar on the old one alone
    for (const v of [1, 2]) expect(treeGeometry('sequoia', v).meta.trunkR).toBeGreaterThan(1.5 * r1.trunkR);
    expect(coloured('sequoia', 2, 0x231e1a)).toBeGreaterThan(0);
    expect(coloured('sequoia', 1, 0x231e1a)).toBe(0);
    // the manzanita's red stems; the old one's dead and silver among them
    for (let v = 0; v < TREE_VARIANTS; v++) expect(coloured('manzanita', v, 0x7a2a22), `manzanita ${v}`).toBeGreaterThan(0);
    expect(coloured('manzanita', 2, 0x9e978b)).toBeGreaterThan(0);
    expect(coloured('manzanita', 0, 0x9e978b)).toBe(0);
    // seasons: the valley and blue oaks bare in winter, brown in autumn; the giants and the manzanita
    // evergreen — the manzanita's urns in the winter
    for (const k of ['valleyoak', 'blueoak'] as const) (expect(DECIDUOUS.has(k)).toBe(true), expect(fallHueOf(k, 0)).toBe(6));
    for (const k of ['redwood', 'sequoia', 'manzanita'] as const) expect(DECIDUOUS.has(k)).toBe(false);
    expect(BLOSSOM_OF.manzanita).toBe(6);
    // their own leaves up close: the redwood's flat sprays, the sequoia's scales
    const pics = (k: TreeKind) => { const n = nearTreeGeometry(k, 1), q = new Set<number>(); for (let i = 0; i < n.cards.length; i += CARD_STRIDE) q.add(n.cards[i + 6]); return [...q].sort((a, b) => a - b); };
    expect(pics('redwood')).toEqual([24, 25]);
    expect(pics('sequoia')).toEqual([8, 9]);
    // at their real heights: the old redwood the tallest tree there is, the sequoia's grove next; the
    // blue oak a small tree
    expect(treeHeight4('redwood', 2, 0, true)).toBeGreaterThanOrEqual(70);
    expect(treeHeight4('redwood', 2, 1, true)).toBeLessThanOrEqual(116);
    expect(treeHeight4('sequoia', 1, 0, true)).toBeGreaterThanOrEqual(50);
    expect(treeHeight4('redwood', 0, 1, false)).toBeLessThan(30); // (a yard's young one)
    expect(treeHeight4('blueoak', 0, 1, false)).toBeLessThanOrEqual(15);
    expect(treeHeight4('valleyoak', 0, 1, true)).toBeGreaterThan(treeHeight4('blueoak', 0, 1, true));
  });
  it('the leaf cards\' flags round-trip: leaf fall, a 3-bit fall hue, a 3-bit blossom, the motion', () => {
    for (const falls of [false, true]) for (let hue = 0; hue < 8; hue++) for (let bloom = 0; bloom < 8; bloom++) for (let motion = 0; motion < 4; motion++) {
      const f = packCardFlags({ falls, hue, bloom, motion });
      expect(f).toBeLessThan(512);
      expect(unpackCardFlags(f)).toEqual({ falls, hue, bloom, motion });
    }
    // every kind's own, as the cards get them
    for (const k of TREE_KINDS) for (let v = 0; v < TREE_VARIANTS; v++)
      expect(unpackCardFlags(cardFlags(k, v))).toEqual({ falls: DECIDUOUS.has(k), hue: fallHueOf(k, v), bloom: BLOSSOM_OF[k] ?? 0, motion: MOTION_OF[k] ?? 0 });
    expect(unpackCardFlags(cardFlags('aspen', 0)).motion).toBe(1); // (the aspen still trembles)
    expect(unpackCardFlags(cardFlags('cherry', 0)).bloom).toBe(1);
    // and the shader takes them apart the same way
    expect(leafCardsSrc).toContain('falls = mod(flags, 2.0), hue = mod(floor(flags / 2.0), 8.0), bloom = mod(floor(flags / 16.0), 8.0), mo = floor(flags / 128.0)');
    expect(leafCardsSrc).toContain('mo = floor(aE.w / 128.0)');
  });
  it('the rhododendron and the azalea: blooming in season, each azalea its own colour', () => {
    expect(inBloom('rhododendron', 5)).toBe(true);
    expect(inBloom('rhododendron', 8)).toBe(false);
    expect(inBloom('azalea', 4)).toBe(true);
    expect(inBloom('azalea', 7)).toBe(false);
    // the azalea smothered: more flowers than the rhododendron's trusses, both under the lite budget
    expect(partCount(plantGeometry('azalea', 1, 1), 8)).toBeGreaterThan(partCount(plantGeometry('rhododendron', 1, 1), 8));
    const colours = new Set<string>();
    for (let seed = 1; seed < 12; seed++) {
      const g = plantGeometry('azalea', seed, 1), C = g.getAttribute('color'), A = g.getAttribute('aPart');
      for (let i = 0; i < A.count; i++) if (A.getX(i) === 8) { colours.add(`${C.getX(i).toFixed(2)},${C.getY(i).toFixed(2)}`); break; }
    }
    expect(colours.size).toBeGreaterThanOrEqual(3);
    for (const eco of ['southeast', 'appalachia', 'mid-atlantic']) expect(plantMix('temperate', eco).some(([sp]) => sp === 'azalea' || sp === 'rhododendron')).toBe(true);
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
      if (!hasNear(k, v)) continue;
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
    expect(n).toBe(NEAR_KINDS.size * TREE_VARIANTS - 1); // (the longleaf's grass stage keeps its blades at every distance)
  });
  it('near trees: the trunk flares and tapers, limbs reach into the crown, the crown stands where the far one does', () => {
    for (const k of NEAR_KINDS) for (let v = 0; v < TREE_VARIANTS; v++) {
      if (!hasNear(k, v)) continue;
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
    expect(verts(g)).toBeLessThan(1600); // (indexed and smooth: tests/people.test.ts holds it at arm's length)
    expect(g.getAttribute('aSkin').count).toBe(verts(g));
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
  it('the lite body (a beach crowd small on screen): the full body\'s joints, parts, skin weights and markers in under 300 vertices', () => {
    const g = personLiteGeometry(), full = personGeometry();
    const b = bb(g), bf = bb(full);
    expect(finite(g)).toBe(true);
    expect(Math.abs(b.min.y)).toBeLessThan(0.03);
    expect(Math.abs(b.max.y - bf.max.y)).toBeLessThan(0.12); // (the same height: the same pose)
    expect(verts(g)).toBeLessThan(300);
    expect(g.getAttribute('aSkin').count).toBe(verts(g)); // (the shader poses it like the full body)
    for (const id of [0, 1, 2, 5, 6, 9]) expect(partCount(g, id)).toBeGreaterThan(0);
    const col = g.getAttribute('color');
    // (no shoes or thigh band at that size: the clothes' own markers)
    for (const m of [MARK.skin, MARK.hair, MARK.pants, MARK.shin, MARK.forearm]) {
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
    // lunch on a café's tables (review round 12, frame 18): a plate, a coffee, a glass of water
    ['tableware: plate', D.tableware('plate'), 500, [0.25, 0.25], true],
    ['tableware: cup', D.tableware('cup'), 500, [0.15, 0.15], true],
    ['tableware: glass', D.tableware('glass'), 400, [0.08, 0.08], true],
    // the pieces a planned interior repeats (docs/INTERIORS_PLAN.md, Slice 1): plain boxes, instanced by the hundred
    // a home's kitchen (review round 11): the run with its sink, cooker and hood, fridge and wall
    // cabinets; one passing under a window; and a cooker and a fridge on walls of their own
    ['kitchen', D.kitchen({ len: 3.9, sink: -0.6, range: 0.75, fridge: -1, gaps: [] }), 2400, [3.9, 0.7], true],
    ['kitchen (under a window)', D.kitchen({ len: 3.3, sink: 0.2, range: -0.9, fridge: 1, gaps: [[-0.4, 0.8]] }), 2400, [3.3, 0.7], true],
    ['kitchen (no cooker or fridge in the run)', D.kitchen({ len: 2.1, sink: 0, range: null, fridge: 0, gaps: [[-0.6, 0.6]] }), 1600, [2.1, 0.7], true],
    ['stove', D.stove(), 700, [0.62, 0.7], true],
    ['fridge', D.fridge(), 300, [0.72, 0.7], true],
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
  it("a kitchen has its cooker under a hood, a fridge, and wall cabinets over the run — never in a window's stretch", () => {
    // (the parts by what they are: the cooker's steel body at the floor, the hood's canopy over it, the
    // fridge's tall body, the wall cabinets — tinted, hung from WALL_Y)
    const kinds = (parts: D.DecorPart[]) => {
      const out = { cooker: [] as THREE.Box3[], hood: [] as THREE.Box3[], fridge: [] as THREE.Box3[], wall: [] as THREE.Box3[], base: [] as THREE.Box3[] };
      for (const p of parts) {
        const b = bb(p.g), h = b.max.y - b.min.y, w = b.max.x - b.min.x;
        if (p.mat === 'metal' && b.min.y < 0.01 && h > 0.85) out.cooker.push(b);
        else if (p.mat === 'metal' && b.min.y > 1.5 && b.min.y < 1.6 && w > 0.55) out.hood.push(b);
        else if (p.mat === 'porcelain' && h > 1.8) out.fridge.push(b);
        else if (p.hex === 0xffffff && Math.abs(b.min.y - D.WALL_Y) < 0.01 && h > 0.7) out.wall.push(b);
        else if (p.hex === 0xffffff && Math.abs(b.min.y - 0.08) < 0.01) out.base.push(b);
      }
      return out;
    };
    const spec: D.KitchenSpec = { len: 3.6, sink: 0.4, range: -1.1, fridge: 1, gaps: [[-0.2, 1.0]] };
    const k = kinds(D.kitchen(spec));
    expect(k.cooker.length).toBe(1);
    expect(k.hood.length).toBe(1);
    expect(k.fridge.length).toBe(1);
    // the hood over the cooker
    expect((k.hood[0].min.x + k.hood[0].max.x) / 2).toBeCloseTo((k.cooker[0].min.x + k.cooker[0].max.x) / 2, 2);
    // the fridge at its end (+x), the cooker where the spec put it
    expect(k.fridge[0].max.x).toBeCloseTo(spec.len / 2 - 0.01, 2);
    expect((k.cooker[0].min.x + k.cooker[0].max.x) / 2).toBeCloseTo(-1.1, 2);
    // wall cabinets: some, none over the window's stretch or the hood
    const wallM = k.wall.reduce((a, b) => a + b.max.x - b.min.x, 0);
    expect(wallM).toBeGreaterThan(0.6);
    for (const b of k.wall) {
      expect(b.max.x <= -0.2 || b.min.x >= 1.0).toBe(true);
      expect(b.max.x <= -1.4 || b.min.x >= -0.8).toBe(true);
    }
    // the base units stop at the cooker (it has its own top) and at the fridge
    for (const b of k.base) expect(b.max.x <= -1.4 + 1e-3 || b.min.x >= -0.8 - 1e-3).toBe(true);
    for (const b of k.base) expect(b.max.x).toBeLessThan(spec.len / 2 - D.FRIDGE_W + 1e-3);
    // the same spec, the same key and the same piece; a different one, another key
    expect(D.kitchenKey(spec)).toBe(D.kitchenKey({ ...spec, gaps: [[-0.2, 1.0]] }));
    expect(D.kitchenKey(spec)).not.toBe(D.kitchenKey({ ...spec, range: -1.0 }));
    expect(Array.from(D.mergeDecor(D.kitchen(spec)).getAttribute('position').array)).toEqual(Array.from(D.mergeDecor(D.kitchen({ ...spec })).getAttribute('position').array));
    // a cooker and a fridge on walls of their own: the stove has its hood
    const st = kinds(D.stove());
    expect(st.cooker.length).toBe(1);
    expect(st.hood.length).toBe(1);
    expect(kinds(D.fridge()).fridge.length).toBe(1);
  });
  it('wall cabinets read as cabinets (round 12, frame 6): 30 cm deep, door joints and handles, a shadow under them, a colour of their own', () => {
    const spec: D.KitchenSpec = { len: 3.6, sink: 0.4, range: -1.1, fridge: 1, gaps: [[-0.2, 1.0]] };
    const parts = D.kitchen(spec), splash = 0xe9eef0;
    const runs = D.wallCabinets(spec);
    const body = parts.filter((p) => p.hex === 0xffffff && Math.abs(bb(p.g).min.y - D.WALL_Y) < 0.01 && bb(p.g).max.y - bb(p.g).min.y > 0.7);
    expect(body.length).toBe(runs.length);
    for (const p of body) {
      const b = bb(p.g);
      expect(b.max.z - b.min.z).toBeGreaterThanOrEqual(0.3); // ≥ 30 cm off the wall
      expect(b.max.z).toBeLessThanOrEqual(0.3 + 1e-6); // its back on the wall (the splashback's plane)
      const w = b.max.x - b.min.x, front = b.min.z;
      // the doors' joints: a dark reveal ≥ 2 cm wide between each pair of ~0.6 m doors, on the front
      const joints = parts.filter((q) => { const c = bb(q.g); return q.mat === 'solid' && q.hex !== 0xffffff && c.min.x >= b.min.x - 1e-3 && c.max.x <= b.max.x + 1e-3 && c.min.y >= D.WALL_Y && c.max.y - c.min.y > 0.6 && c.max.z <= front + 1e-3; });
      expect(joints.length).toBe(Math.max(1, Math.round(w / 0.6)) - 1);
      for (const j of joints) { expect(bb(j.g).max.x - bb(j.g).min.x).toBeGreaterThanOrEqual(0.02 - 1e-6); expect(D.labOf(j.hex)[0]).toBeLessThan(40); }
      // a handle on every door
      const handles = parts.filter((q) => { const c = bb(q.g); return q.mat === 'metal' && c.min.x >= b.min.x && c.max.x <= b.max.x && c.min.y > D.WALL_Y && c.max.y < D.WALL_Y + 0.3 && c.max.z <= front; });
      expect(handles.length).toBe(Math.max(1, Math.round(w / 0.6)));
      // the shadow they throw on the splashback: right under the cabinet's foot, ≥ 10 L* darker
      // than the splashback and ≥ 5 cm tall, softening below
      const band = parts.filter((q) => { const c = bb(q.g); return q.mat === 'solid' && c.max.y <= D.WALL_Y + 1e-6 && c.max.y > D.WALL_Y - 0.12 && Math.abs(c.min.x - b.min.x) < 1e-3 && c.min.z > 0.28; });
      expect(band.length).toBe(2);
      const top = band.find((q) => Math.abs(bb(q.g).max.y - D.WALL_Y) < 1e-6)!;
      expect(bb(top.g).max.y - bb(top.g).min.y).toBeGreaterThanOrEqual(0.05);
      expect(D.labOf(splash)[0] - D.labOf(top.hex)[0]).toBeGreaterThanOrEqual(10);
      for (const q of band) expect(D.labOf(q.hex)[0]).toBeLessThan(D.labOf(splash)[0]);
    }
    // a colour of their own: never within ΔE 15 of the room's curtains, whatever the fabric and the pick
    let least = Infinity;
    for (const fab of FABRIC) for (const pick of [null, ...CABINET_PAINT]) {
      const c = cabinetColour(pick, fab);
      least = Math.min(least, D.deltaE(c, fab));
      expect([CAB_WHITE, ...CABINET_PAINT]).toContain(c);
    }
    console.log(`[foundry] wall cabinets vs the curtains: the nearest ΔE76 ${least.toFixed(1)}`);
    expect(least).toBeGreaterThanOrEqual(15);
    // the blue that merged with frame 6's blue curtains goes white beside them; kept beside red ones
    expect(cabinetColour(0x5f7a8c, 0x4f6d8f)).toBe(CAB_WHITE);
    expect(cabinetColour(0x5f7a8c, 0xa65a44)).toBe(0x5f7a8c);
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
