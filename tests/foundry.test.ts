import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TREE_KINDS, TREE_VARIANTS, treeGeometry, PLANT_SPECIES, plantGeometry, plantMix, inBloom, stageOf, STAGES } from '../src/assets/flora';
import { CRITTERS, critterGeometry } from '../src/assets/fauna';
import { MAILBOXES, mailboxGeometry, gearGeometry, gearFor, CAR_GEAR, umbrellaGeometry, picnicTableGeometry } from '../src/assets/furniture';
import { fibCount, fibSphere, hashf, variantAt } from '../src/assets/core';

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
