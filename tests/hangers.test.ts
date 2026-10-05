import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hangerGeometry, hangerMix, spanishMossZone, HANGERS, LOADS, HANG_BUDGET, HANG_TONES, HANG_STRAND, HANG_STIFF, HANG_FERN, type HangPlace } from '../src/assets/hangers';
import { treeGeometry, TREE_VARIANTS, type TreeKind } from '../src/assets/flora';
import { ecoAt, caFogBelt } from '../src/world/ecoregions';
import { wetness, autoCloud } from '../src/world/season';

// Hangers (docs/regional-life/models.md hanger†): Spanish moss, resurrection fern, ball moss, lace
// lichen — grown on a tree's own limbs, a layer of their own, swinging in the material (propMaterial
// hang); placed by the range rules of docs/regional-life/ranges.md.
const HOSTS: TreeKind[] = ['liveoak', 'plateauoak', 'coastoak', 'oak', 'round', 'elm', 'maple', 'willow', 'magnolia', 'mesquite'];
const at = (lat: number, lon: number): HangPlace => { const e = ecoAt(lat, lon)!; return { eco: e.region, l3: e.l3, state: e.state, fog: caFogBelt(lat, lon) }; };
const has = (kind: TreeKind, p: HangPlace, type: string) => hangerMix(kind, p).some(([t, any]) => t === type && any > 0);

describe('hangers', () => {
  it('every hanger on every host is finite, within budget, deterministic, and heavier loaded heavy', () => {
    // (each on the hosts the mix puts it on: Spanish moss on the oaks, elms and pecans, the fern on the oaks'
    // big limbs, ball moss on the Texas trees, lace lichen on California's oaks)
    const ON: Record<string, TreeKind[]> = { spanish: ['liveoak', 'plateauoak', 'oak', 'round', 'elm', 'maple', 'willow', 'magnolia'], resfern: ['liveoak', 'plateauoak', 'oak'], ballmoss: ['plateauoak', 'liveoak', 'elm', 'oak', 'round', 'mesquite'], lace: ['coastoak', 'oak', 'round'] };
    for (const type of HANGERS) for (const k of ON[type]) for (let v = 0; v < TREE_VARIANTS; v++) {
      let prev = 0;
      for (let load = 0; load < LOADS; load++) {
        const g = hangerGeometry(type, k, v, load), P = g.getAttribute('position'), A = g.getAttribute('aHang');
        expect(P.count, `${type}:${k}:${v}:${load}`).toBeGreaterThan(0);
        expect(P.count, `${type}:${k}:${v}:${load}`).toBeLessThanOrEqual(HANG_BUDGET);
        expect((P.array as Float32Array).every(Number.isFinite)).toBe(true);
        expect(A.count).toBe(P.count);
        for (let i = 0; i < A.count; i++) {
          const w = A.getW(i);
          expect([HANG_STRAND, HANG_STIFF, HANG_FERN]).toContain(w);
          if (w === HANG_STRAND) { expect(A.getX(i)).toBeGreaterThanOrEqual(0); expect(A.getX(i)).toBeLessThanOrEqual(A.getY(i) + 1e-6); }
          if (w === HANG_FERN) expect(A.getX(i)).toBeLessThanOrEqual(0); // (a frond stands up off its limb)
        }
        expect(hangerGeometry(type, k, v, load).getAttribute('position').count).toBe(P.count);
        expect(P.count).toBeGreaterThan(prev);
        prev = P.count;
      }
    }
  }, 30000); // (every hanger on every host, twice: seconds of geometry under load)
  it("hangs from the tree: every strand's top inside the crown's reach, under the leaves, its tip above the ground", () => {
    for (const k of ['liveoak', 'coastoak'] as const) for (let v = 0; v < TREE_VARIANTS; v++) {
      const { meta } = treeGeometry(k, v), type = k === 'liveoak' ? 'spanish' : 'lace';
      const g = hangerGeometry(type, k, v, 1), P = g.getAttribute('position'), A = g.getAttribute('aHang');
      for (let i = 0; i < P.count; i++) {
        const top = P.getY(i) + A.getX(i);
        expect(Math.hypot(P.getX(i), P.getZ(i))).toBeLessThan(meta.crownR + 1.5);
        expect(top).toBeLessThan(meta.h);
        expect(P.getY(i)).toBeGreaterThan(-0.05); // (a curtain never trails into the ground)
      }
    }
  });
  it("Spanish moss: the coastal plain from Virginia Beach to East Texas — never the Piedmont, the North or the West (ranges.md)", () => {
    const savannah = at(32.08, -81.09), nola = at(29.95, -90.07), houston = at(29.76, -95.37), charleston = at(32.78, -79.93), vb = at(36.85, -75.98);
    for (const p of [savannah, nola, houston, charleston, vb]) expect(has('liveoak', p, 'spanish'), JSON.stringify(p)).toBe(true);
    expect(spanishMossZone(savannah)).toBeGreaterThan(spanishMossZone(vb)); // (heaviest on the Southern coast)
    for (const [lat, lon] of [[35.23, -80.84], [33.9, -84.38], [35.78, -78.64], [39.29, -76.61], [39.95, -75.17], [38.04, -84.5], [37.21, -93.29], [30.27, -97.74], [33.45, -112.07], [34.05, -118.24], [47.61, -122.33], [41.88, -87.63]])
      for (const k of HOSTS) expect(has(k, at(lat, lon), 'spanish'), `${k} at ${lat},${lon}`).toBe(false);
  });
  it('ball moss in central and south Texas, Florida and the Gulf coast; lace lichen in California\'s fog belt only', () => {
    expect(has('plateauoak', at(30.27, -98.87), 'ballmoss')).toBe(true); // Fredericksburg
    expect(has('liveoak', at(29.42, -98.49), 'ballmoss')).toBe(true); // San Antonio
    expect(has('liveoak', at(28.54, -81.38), 'ballmoss')).toBe(true); // Orlando
    for (const [lat, lon] of [[35.22, -101.83], [35.15, -90.05], [32.08, -81.09], [38.04, -84.5]]) for (const k of HOSTS) expect(has(k, at(lat, lon), 'ballmoss'), `${k} at ${lat},${lon}`).toBe(false); // Amarillo, Memphis, Savannah, Lexington
    expect(has('coastoak', at(37.876, -122.255), 'lace')).toBe(true); // the Berkeley hills
    expect(has('coastoak', at(36.27, -121.81), 'lace')).toBe(true); // Big Sur
    expect(has('coastoak', at(38.58, -121.49), 'lace')).toBe(false); // Sacramento: the valley's dry heat
    expect(has('coastoak', at(36.74, -119.79), 'lace')).toBe(false); // Fresno
    expect(has('valleyoak', at(37.876, -122.255), 'lace')).toBe(true); // (and the coast's valley oaks)
    expect(has('valleyoak', at(38.58, -121.49), 'lace')).toBe(false);
    expect(has('redwood', at(37.89, -122.57), 'lace')).toBe(false); // (never the conifers)
  });
  it('resurrection fern on the South\'s live oaks; tones vary tree to tree', () => {
    expect(has('liveoak', at(32.08, -81.09), 'resfern')).toBe(true);
    expect(has('liveoak', at(29.95, -90.07), 'resfern')).toBe(true);
    expect(has('liveoak', at(35.78, -78.64), 'resfern')).toBe(false); // (the Piedmont's planted ones bare)
    for (const t of HANGERS) expect(new Set(HANG_TONES[t]).size).toBeGreaterThanOrEqual(4);
  });
  it('the wet clock: 1 in the wet spells, drying over a day or two, never the same all week', () => {
    let lo = 1, hi = 0;
    for (let t = 0; t < 24 * 30; t += 3) { const w = wetness(t); expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    expect(hi).toBe(1);
    expect(lo).toBeLessThan(0.3);
    const wet = [...Array(2000).keys()].find((t) => autoCloud(t) > 0.47)!;
    expect(wetness(wet)).toBe(1);
    expect(wetness(wet + 1)).toBeLessThanOrEqual(1);
    void THREE;
  });
});
