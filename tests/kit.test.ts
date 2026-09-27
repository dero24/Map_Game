import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CAR_TYPES, BOAT_TYPES, PLANE_TYPES, carGeometry, carRecipe, boatGeometry, boatRecipe, planeGeometry, planeRecipe, rockGeometry, carMix, pickFrom } from '../src/assets/kit';

const box = (g: THREE.BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!);
const finite = (g: THREE.BufferGeometry) => (g.getAttribute('position').array as Float32Array).every(Number.isFinite);

describe('asset kit', () => {
  it('cars: every type is a sane, ground-sitting, nose-forward model', () => {
    for (const t of CAR_TYPES) for (const seed of [1, 7, 42]) {
      const r = carRecipe(t, seed), g = carGeometry(r), b = box(g);
      expect(finite(g)).toBe(true);
      expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
      expect(g.getAttribute('aPart')).toBeTruthy();
      expect(Math.abs(b.min.y)).toBeLessThan(0.05); // wheels on the ground
      expect(b.max.z - b.min.z).toBeLessThan(r.L + 0.4);
      expect(b.max.x - b.min.x).toBeLessThan(r.W + 0.5); // mirrors allowed
      expect(b.max.y).toBeLessThan(2.4);
    }
  });
  it('cars: recipes are deterministic', () => {
    expect(carRecipe('suv', 3)).toEqual(carRecipe('suv', 3));
  });
  it('boats: waterline origin, keel at the draft', () => {
    for (const t of BOAT_TYPES) {
      const r = boatRecipe(t, 2), b = box(boatGeometry(r));
      expect(b.min.y).toBeGreaterThan(-r.draft - 0.35);
      expect(b.max.z - b.min.z).toBeLessThan(r.L + 1.2);
    }
  });
  it('planes: prop at the nose, gear on the ground', () => {
    for (const t of PLANE_TYPES) {
      const p = planeGeometry(planeRecipe(t, 1)), b = box(p.geo);
      expect(finite(p.geo)).toBe(true);
      expect(Math.abs(b.min.y - p.gearY)).toBeLessThan(0.05);
      expect(p.prop.z).toBeLessThan(b.min.z + 0.6);
    }
  });
  it('rocks: bounded, flat-ish underside', () => {
    for (const t of ['boulder', 'riprap', 'stone'] as const) {
      const b = box(rockGeometry(t, 3));
      expect(b.min.y).toBeGreaterThanOrEqual(-0.26);
      expect(b.max.x).toBeLessThan(2.2);
    }
  });
  it('street mix shifts by region', () => {
    const count = (mix: ReturnType<typeof carMix>, t: string) => { let n = 0; for (let i = 0; i < 1000; i++) if (pickFrom(mix, (i + 0.5) / 1000) === t) n++; return n; };
    expect(count(carMix('eu', 'temperate'), 'hatch')).toBeGreaterThan(count(carMix('na', 'temperate'), 'hatch') * 2);
    expect(count(carMix('na', 'arid'), 'pickup')).toBeGreaterThan(count(carMix('na', 'temperate'), 'pickup'));
  });
});
