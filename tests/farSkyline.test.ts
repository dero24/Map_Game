import { describe, it, expect } from 'vitest';
import { farSkylineQuery, curvatureDrop, R_EFF, airT, nearCovers, farTowers, prismGeometry, type FarTower } from '../src/world/farSkyline';
import { osmToTile, type OsmElement } from '../src/world/realTile';

// the fog density applyAtmosphere sets for a haze and a cloud cover (atmosphere.ts)
const dens = (haze: number, cloud: number) => (0.00006 + haze * 0.00028) * (1 + cloud * cloud * 0.8);

// a closed square outline, `half` metres from its centre each way
const sq = (lat: number, lon: number, half: number) => {
  const dLat = half / 111320, dLon = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => ({ lat: lat + a * dLat, lon: lon + b * dLon }));
};
const origin = { lat: 40.7, lon: -74.0 };
const box = { x0: -60000, z0: -60000, x1: 60000, z1: 60000 };
const doc = {
  elements: [
    { type: 'way', id: 1, tags: { building: 'yes', height: '300' }, geometry: sq(40.75, -73.99, 20) },
    { type: 'way', id: 2, tags: { building: 'yes', height: '250' }, geometry: sq(40.76, -73.98, 30) },
    { type: 'way', id: 3, tags: { 'building:part': 'yes', height: '250' }, geometry: sq(40.76, -73.98, 30) },
    { type: 'node', id: 4, lat: 40.7, lon: -74.05, tags: { man_made: 'mast', height: '200' } },
    { type: 'way', id: 5, tags: { building: 'yes', height: '130' }, geometry: sq(40.72, -74.03, 25) },
    { type: 'way', id: 6, tags: { 'building:part': 'yes', height: '420', min_height: '380' }, geometry: sq(40.75, -73.99, 5) },
  ] as OsmElement[],
};
const square = (x: number, z: number, half: number): FarTower => ({ r: [x - half, z - half, x + half, z - half, x + half, z + half, x - half, z + half].map((v) => v * 10), y0: 0, y1: 300 });

describe('the far skyline', () => {
  it('asks Overpass only for the very tall: 120 m, 35 storeys, 150 m masts', () => {
    const q = farSkylineQuery({ s: 40.1, w: -74.6, n: 41.2, e: -73.4 });
    expect(q).toContain('[bbox:40.10000,-74.60000,41.20000,-73.40000]');
    expect(q).toContain('way["building"]["height"](if: number(t["height"]) >= 120)');
    expect(q).toContain('relation["building"]["height"](if: number(t["height"]) >= 120)');
    expect(q).toContain('way["building:part"]["height"](if: number(t["height"]) >= 120)');
    expect(q).toContain('(if: number(t["building:levels"]) >= 35)');
    expect(q).toContain('["man_made"~"^(tower|mast)$"]["height"](if: number(t["height"]) >= 150)');
    expect(q).toContain('out geom');
  });

  it('drops ~104 m at 39 km — Manhattan from a Jersey beach — with standard refraction', () => {
    expect(R_EFF).toBeCloseTo(6371000 / 0.87, 0);
    expect(curvatureDrop(39000)).toBeGreaterThan(98);
    expect(curvatureDrop(39000)).toBeLessThan(110);
    expect(curvatureDrop(0)).toBe(0);
    expect(curvatureDrop(60000)).toBeGreaterThan(curvatureDrop(39000) * 2); // (it grows with the square)
  });

  it('leaves the near towers to the skyline ring and the tiles', () => {
    const tower = (x: number, z: number) => ({ x0: x, z0: z, x1: x + 40, z1: z + 40 });
    // before the ring has read: everything within the 8 km it will cover (8.5 with a margin)
    expect(nearCovers(tower(5000, 0), 0, 0, null)).toBe(true);
    expect(nearCovers(tower(0, -8400), 0, 0, null)).toBe(true);
    expect(nearCovers(tower(0, -9000), 0, 0, null)).toBe(false);
    expect(nearCovers(tower(-20000, 30000), 0, 0, null)).toBe(false);
    // with its box: whatever it holds, however far from you; past it, the far skyline's — even 6 km off
    const ring = { x0: -8000, z0: -8000, x1: 8000, z1: 8000 };
    expect(nearCovers(tower(7000, 0), 3000, 0, ring)).toBe(true);
    expect(nearCovers(tower(-7900, 7900), 3000, 0, ring)).toBe(true);
    expect(nearCovers(tower(9000, 0), 3000, 0, ring)).toBe(false);
    expect(nearCovers(tower(7980, 0), 3000, 0, ring)).toBe(false); // (straddling its edge: the ring draws it whole, the far half is cut per pixel)
    // and the detail tiles round you always draw their own, box or not
    expect(nearCovers(tower(9000, 0), 9500, 0, ring)).toBe(true);
    // a whole sector is only dropped when all of it is covered
    expect(nearCovers({ x0: 0, z0: 0, x1: 8000, z1: 8000 }, 3000, 0, ring)).toBe(true);
    expect(nearCovers({ x0: 4000, z0: 0, x1: 12000, z1: 8000 }, 3000, 0, ring)).toBe(false);
  });

  it('builds a tower as a flat-topped prism: four walls facing out, a roof facing up', () => {
    const g = prismGeometry([square(100, -200, 10)], () => 5);
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), idx = g.getIndex()!;
    expect(pos.count).toBe(20); // 4 walls × 4 corners + 4 roof corners
    expect(idx.count).toBe(30); // 4 × 2 wall triangles + 2 roof triangles
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pos.count; i++) (lo = Math.min(lo, pos.getY(i))), (hi = Math.max(hi, pos.getY(i)));
    expect(lo).toBe(5); // on its ground…
    expect(hi).toBe(305); // …and its height above it
    // every triangle faces the way its normal says (counter-clockwise from outside: the side
    // that survives back-face culling), and every wall faces away from the tower's middle
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const e1 = [pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a)];
      const e2 = [pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a)];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      expect(n[0] * nrm.getX(a) + n[1] * nrm.getY(a) + n[2] * nrm.getZ(a)).toBeGreaterThan(0);
      if (nrm.getY(a) === 0) expect((pos.getX(a) - 100) * nrm.getX(a) + (pos.getZ(a) + 200) * nrm.getZ(a)).toBeGreaterThan(0);
      else expect(nrm.getY(a)).toBe(1);
    }
    // the outline's winding doesn't matter; an L-shaped one gets 6 walls and a 4-triangle roof
    const rev = square(100, -200, 10);
    const r2: number[] = [];
    for (let i = rev.r.length - 2; i >= 0; i -= 2) r2.push(rev.r[i], rev.r[i + 1]);
    const g2 = prismGeometry([{ ...rev, r: r2 }], () => 5);
    expect(g2.getIndex()!.count).toBe(30);
    const L = { r: [0, 0, 400, 0, 400, 200, 200, 200, 200, 400, 0, 400], y0: 20, y1: 150 };
    const g3 = prismGeometry([L], () => 0);
    expect(g3.getAttribute('position').count).toBe(30);
    expect(g3.getIndex()!.count).toBe(6 * 6 + 4 * 3);
  });

  it('reads its towers through the tiles\' transform: parts drawn, the outline they fill left out, a mast as a slim box', () => {
    const towers = farTowers(osmToTile(doc, { id: 'far-skyline', box, origin, margin: 0 }));
    expect(towers).toHaveLength(5); // the 300 m tower + its lifted crown, the full-cover part (not its outline), the 130 m tower, the mast
    expect(towers.map((t) => t.y1).sort((a, b) => a - b)).toEqual([130, 200, 250, 300, 420]);
    expect(towers.find((t) => t.y1 === 420)!.y0).toBe(380); // (the crown from its min_height up)
    const mast = towers.find((t) => t.y1 === 200)!;
    const xs = mast.r.filter((_, i) => i % 2 === 0);
    expect((Math.max(...xs) - Math.min(...xs)) / 10).toBeLessThan(10);
  });

  it('sees less through more air: farther, hazier, cloudier, sea-foggier — and the tops clearer than the bases', () => {
    const clear = dens(0, 0), usual = dens(0.35, 0.35), hazy = dens(1, 0.35);
    expect(airT(38000, clear, 0)).toBeGreaterThan(0.5); // a clear day: the city across the bay, plain
    expect(airT(60000, clear, 0)).toBeLessThan(airT(38000, clear, 0));
    expect(airT(38000, clear, 0)).toBeLessThan(airT(10000, clear, 0));
    expect(airT(38000, usual, 0)).toBeLessThan(airT(38000, clear, 0));
    expect(airT(38000, usual, 0)).toBeGreaterThan(0.1); // the game's usual haze: faint, but there
    expect(airT(38000, dens(0.35, 0.9), 0)).toBeLessThan(airT(38000, usual, 0));
    expect(airT(38000, hazy, 0)).toBeLessThan(0.05); // a hazy day: gone
    expect(airT(38000, clear, 0.35)).toBeLessThan(0.1); // sea fog: gone
    expect(airT(38000, usual, 0, 400)).toBeGreaterThan(airT(38000, usual, 0, 0));
    expect(airT(0, hazy, 1)).toBe(1);
  });

  it('is deterministic: the same read builds the same towers, the same towers the same mesh', () => {
    const a = farTowers(osmToTile(doc, { id: 'far-skyline', box, origin, margin: 0 }));
    const b = farTowers(osmToTile({ elements: [...doc.elements].reverse() }, { id: 'far-skyline', box, origin, margin: 0 }));
    expect(a).toEqual(b); // (whatever order the server sends)
    const ground = (x: number, z: number) => Math.abs(Math.sin(x * 0.001) * 30 + z * 0.0001);
    const g1 = prismGeometry(a, ground), g2 = prismGeometry(b, ground);
    expect(Array.from(g1.getAttribute('position').array)).toEqual(Array.from(g2.getAttribute('position').array));
    expect(Array.from(g1.getAttribute('normal').array)).toEqual(Array.from(g2.getAttribute('normal').array));
    expect(Array.from(g1.getIndex()!.array)).toEqual(Array.from(g2.getIndex()!.array));
  });
});
