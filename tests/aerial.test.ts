import { describe, it, expect } from 'vitest';
import shoreTile from '../public/data/shore/tiles/-2_6.json'; // (a baked shore tile: ~1,000 NAIP-sampled roofs)
import {
  aerialRoof, fitCast, hex, NAIP_CAST, NO_CAST, readCell, rgbOf, rgbToHsl, ringPixels, ROOF_WARMTH, sampleRoof, setRoofSource,
  tileRoofs, uncast, unpaint, balanced, hslToRgb, type Aerial, type Cast, type RGB,
} from '../src/world/aerial';
import { enrichAerial, initAerial, naipRequest, NAIP_SERVICE, setAerialIO, setAerialLog } from '../src/world/aerialFetch';
import { recipeFor, ROOFMAT, roofGamut } from '../src/world/recipe';
import { regionStyle } from '../src/world/styles';
import { makeProjector, TAG_ROOF_COLOURS } from '../src/world/realTile';
import type { Building, TileJson } from '../src/world/data';

// ---------- a synthetic orthophoto: a street of gabled houses, the way NAIP shows one ----------
// Lawn, an asphalt street, houses whose roofs have a sunlit and a shaded slope, dark gutters at
// the eaves, trees over some corners, a chimney's shadow — then shifted against the map (the
// survey offset) and given a cast (green throughout, cyan haze in the darks, yellow in the
// lights). The test: read each roof back.
const noise = (i: number, j: number, k = 0) => {
  let h = Math.imul(i * 73856093 ^ j * 19349663 ^ k * 83492791, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (((h ^ (h >>> 13)) >>> 0) / 4294967296) * 2 - 1;
};
const CAST: Cast = { a: [-12, 5, 7], b: [0.1, 0.02, -0.12], n: 0 }; // (sums to nothing, like a real one)
const TRUTH: RGB[] = [[62, 62, 64], [112, 86, 66], [158, 82, 58], [150, 150, 148], [88, 100, 118], [80, 62, 50], [128, 118, 104], [205, 205, 200]];
interface House { x: number; z: number; w: number; d: number; c: RGB; tree?: boolean; chimney?: boolean; buried?: boolean }
const HOUSES: House[] = TRUTH.map((c, k) => ({ x: 4 + k * 14, z: k % 2 ? 44 : 10, w: 10, d: 12, c, tree: k % 3 === 1, chimney: k % 3 === 2 }));
HOUSES.push({ x: 4 + 8 * 14, z: 10, w: 10, d: 12, c: [100, 100, 100], buried: true }); // under one big tree
const SHIFT = [2, -1.5]; // the photo sits 2 m east and 1.5 m north of the map
function scene(cast: Cast = CAST): Aerial {
  const w = 280, h = 150, dx = 0.5, x0 = -10, z0 = -10, px = new Uint8ClampedArray(w * h * 3);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * dx - SHIFT[0], z = z0 + (j + 0.5) * dx - SHIFT[1];
      let c: RGB = [92 + noise(i, j) * 10, 124 + noise(i, j, 1) * 10, 70 + noise(i, j, 2) * 8]; // lawn
      if (z > 30 && z < 38) c = [110 + noise(i, j) * 6, 110 + noise(i, j) * 6, 112 + noise(i, j) * 6]; // the street
      for (const H of HOUSES) {
        const u = x - H.x, v = z - H.z;
        if (u < 0 || v < 0 || u > H.w || v > H.d) continue;
        const sunlit = v > H.d / 2; // the south slope faces the sun
        const base: RGB = sunlit ? [...H.c] : [H.c[0] * 0.62, H.c[1] * 0.62 + 2, H.c[2] * 0.62 + 8];
        c = base.map((q, k) => q + noise(i, j, k + 5) * 5) as RGB;
        if (u < 0.6 || v < 0.6 || u > H.w - 0.6 || v > H.d - 0.6) c = [40, 40, 42]; // gutters, eave shadow
        if (H.chimney && u > 6 && u < 7 && v > 7 && v < 9.5) c = [35, 35, 38];
      }
      for (const H of HOUSES) {
        const r = H.buried ? 9 : 3.5, tx = H.buried ? H.x + 5 : H.x + H.w, tz = H.buried ? H.z + 6 : H.z;
        if ((H.tree || H.buried) && Math.hypot(x - tx, z - tz) < r) c = [48 + noise(i, j) * 8, 78 + noise(i, j, 1) * 8, 38 + noise(i, j, 2) * 6];
      }
      const m = (c[0] + c[1] + c[2]) / 3;
      for (let k = 0; k < 3; k++) px[(j * w + i) * 3 + k] = c[k] + cast.a[k] + cast.b[k] * m;
    }
  return { w, h, px, ch: 3, x0, z0, dx, dz: dx };
}
const q = (v: number) => Math.round(v * 10);
const building = (H: House, s: number): Building => ({ r: [q(H.x), q(H.z), q(H.x + H.w), q(H.z), q(H.x + H.w), q(H.z + H.d), q(H.x), q(H.z + H.d)], h: 8, k: 'house', roof: 'gable', s });
const tile = () => ({ buildings: HOUSES.map((H, k) => building(H, 1000 + k)), roads: [{ p: [q(-10), q(34), q(130), q(34)], c: 'residential', w: 8 }] });
const err = (a: RGB, b: RGB) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));

describe('the photo\'s cast (aerial.ts fitCast)', () => {
  it('recovers a cast from grey things at every brightness, and takes it back out', () => {
    const obs: RGB[] = [];
    for (let k = 0; k < 600; k++) {
      const g = 30 + (k % 190), m = g;
      obs.push([g + CAST.a[0] + CAST.b[0] * m + noise(k, 1) * 3, g + CAST.a[1] + CAST.b[1] * m + noise(k, 2) * 3, g + CAST.a[2] + CAST.b[2] * m + noise(k, 3) * 3]);
    }
    const c = fitCast(obs);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(c.a[k] - CAST.a[k])).toBeLessThan(2.5);
      expect(Math.abs(c.b[k] - CAST.b[k])).toBeLessThan(0.025);
    }
    expect(Math.abs(c.a[0] + c.a[1] + c.a[2])).toBeLessThan(1e-6); // (it moves chroma, never brightness)
    for (const o of obs.slice(0, 50)) {
      const g = uncast(o, c);
      expect(Math.max(...g) - Math.min(...g)).toBeLessThan(12);
    }
  });
  it('leans on its prior when it has little to go on, and never moves a channel past what air can', () => {
    const few: RGB[] = [[90, 100, 95], [91, 99, 96], [89, 101, 94], [90, 100, 96]];
    const c = fitCast(few, undefined, NAIP_CAST);
    expect(c.n).toBe(4);
    expect(Math.abs(c.a[0] - NAIP_CAST.a[0])).toBeLessThan(Math.abs(NAIP_CAST.a[0])); // pulled from the prior, not replaced
    const wild = fitCast(Array.from({ length: 200 }, (_, k): RGB => [40 + k * 0.5, 160 + k * 0.5, 40 + k * 0.5]));
    for (let k = 0; k < 3; k++) for (const m of [30, 120, 220]) expect(Math.abs(wild.a[k] + wild.b[k] * m)).toBeLessThanOrEqual(28.001);
  });
  it('is a function of what it saw, not the order it saw it', () => {
    const obs = Array.from({ length: 300 }, (_, k): RGB => [60 + (k % 120) + noise(k, 0) * 9, 64 + (k % 120), 70 + (k % 120) - noise(k, 2) * 9]);
    expect(fitCast([...obs].reverse())).toEqual(fitCast(obs));
  });
});

describe('reading roofs off a photo (aerial.ts readCell)', () => {
  const img = scene(), t = tile();
  const out = readCell(img, t);
  it('balances against the street and finds where the map sits on the photo', () => {
    expect(out.by).toBe('streets');
    expect(out.nodata).toBe(false);
    expect(Math.abs(out.shift[0] - SHIFT[0] / img.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(out.shift[1] - SHIFT[1] / img.dz)).toBeLessThanOrEqual(1);
  });
  it('reads each roof\'s sunlit colour — not its shaded slope, the trees over it, its gutters or the lawn', () => {
    HOUSES.forEach((H, k) => {
      if (H.buried) return;
      const got = out.roofs.get(k);
      expect(got, `house ${k}`).toBeDefined();
      // (the street's own warmth, 2 levels of blue, comes off everything)
      expect(err(rgbOf(got!), H.c), `house ${k} ${rgbOf(got!)} vs ${H.c}`).toBeLessThan(10);
    });
  });
  it('does better than the plain mean of the footprint by a wide margin', () => {
    let ours = 0, naive = 0;
    HOUSES.forEach((H, k) => {
      if (H.buried) return;
      const ring: [number, number][] = [[H.x, H.z], [H.x + H.w, H.z], [H.x + H.w, H.z + H.d], [H.x, H.z + H.d]];
      const mask = ringPixels(img, ring, 0);
      const mean: RGB = [0, 0, 0];
      for (const p of mask) for (let c = 0; c < 3; c++) mean[c] += img.px[p * 3 + c] / mask.length;
      naive += err(mean, H.c);
      ours += err(rgbOf(out.roofs.get(k)!), H.c);
    });
    expect(naive).toBeGreaterThan(ours * 4);
  });
  it('says nothing for a house it can\'t see (under a tree), a tower that leans off its footprint, or off the survey', () => {
    expect(out.roofs.has(HOUSES.length - 1)).toBe(false);
    const tall = tile();
    tall.buildings[3] = { ...tall.buildings[3], h: 30, k: 'large' };
    const withTower = readCell(scene(), tall);
    expect(withTower.roofs.has(3)).toBe(false);
    expect(withTower.roofs.has(2)).toBe(true);
    const blank: Aerial = { ...img, px: new Uint8ClampedArray(img.px.length) };
    const none = readCell(blank, t);
    expect(none.nodata).toBe(true);
    expect(none.roofs.size).toBe(0);
  });
  it('is deterministic: the same photo and map give the same colours, in any building order', () => {
    const again = readCell(scene(), tile());
    expect([...again.roofs.entries()]).toEqual([...out.roofs.entries()]);
    const rev = tile();
    rev.buildings.reverse();
    const back = readCell(scene(), rev), n = HOUSES.length;
    for (const [k, v] of out.roofs) expect(back.roofs.get(n - 1 - k)).toBe(v);
  });
  it('balances against the roofs themselves where there are no streets to see', () => {
    const noStreet = readCell(scene(), { ...tile(), roads: [] });
    expect(noStreet.by).toBe('roofs');
    // a handful of roofs can't pin a cast the way a street does — but they still read close
    let worst = 0;
    HOUSES.forEach((H, k) => { if (!H.buried) worst = Math.max(worst, err(rgbOf(noStreet.roofs.get(k)!), H.c)); });
    expect(worst).toBeLessThan(26);
  });
  it('drops a roof the greenery covers, keeps one the sun and a tree only share', () => {
    const bal = balanced(scene(), CAST);
    const H = HOUSES[1]; // brown, a tree over one corner
    const ring: [number, number][] = [[H.x + SHIFT[0], H.z + SHIFT[1]], [H.x + H.w + SHIFT[0], H.z + SHIFT[1]], [H.x + H.w + SHIFT[0], H.z + H.d + SHIFT[1]], [H.x + SHIFT[0], H.z + H.d + SHIFT[1]]];
    const r = sampleRoof(bal, ringPixels(bal, ring, 1), 0, 0)!;
    expect(r.veg).toBeGreaterThan(0.02);
    expect(err(r.c, H.c)).toBeLessThan(8);
  });
});

describe('the painter\'s roof (aerial.ts aerialRoof)', () => {
  const hsl = (c: number) => rgbToHsl(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
  it('keeps the measured hue and lightness order, holds chroma to what roofing comes in', () => {
    const clay = hsl(aerialRoof(hex([158, 82, 58]), false));
    expect(clay[0] * 360).toBeLessThan(30);
    expect(clay[1]).toBeGreaterThan(0.25);
    const sage = hsl(aerialRoof(hex([90, 140, 95]), false)); // a sage the photo left: shade, not copper
    expect(sage[1]).toBeLessThanOrEqual(0.145); // (0.14, and a level of rounding)
    const dark = hsl(aerialRoof(hex([20, 20, 22]), false)), light = hsl(aerialRoof(hex([200, 200, 196]), false));
    expect(dark[2]).toBeGreaterThanOrEqual(0.115); // (0.12, and a level of rounding)
    expect(light[2]).toBeLessThanOrEqual(0.6001);
    expect(hsl(aerialRoof(hex([200, 200, 196]), true))[2]).toBeGreaterThan(light[2]); // a white membrane roof stays whiter
    expect(hsl(aerialRoof(hex([60, 60, 60]), false))[2]).toBeLessThan(hsl(aerialRoof(hex([120, 120, 120]), false))[2]);
  });
});

describe('the baked shore\'s roof colours (aerial.ts tileRoofs)', () => {
  // scripts/lib/colour.mjs paintFromAerial, mirrored: what the bake did to every sample
  const paint = (r: number, g: number, b: number) => {
    const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
    const [R, G, B] = hslToRgb(h, Math.min(0.55, s * 1.3), Math.max(0.16, Math.min(0.88, 0.5 + (l - 0.5) * 1.18)));
    return hex([R * 255, G * 255, B * 255]);
  };
  it('undoes the bake\'s lift', () => {
    for (const c of [[60, 70, 72], [110, 92, 80], [150, 152, 140], [90, 95, 110]] as RGB[]) expect(err(unpaint(paint(...c)), c)).toBeLessThan(2.5);
  });
  it('balances a real baked tile: its typical roof comes out a warm grey, each roof keeps its own difference', () => {
    const tj = shoreTile as unknown as TileJson;
    setRoofSource('painted', TAG_ROOF_COLOURS);
    const roofs = tileRoofs(tj.buildings, true);
    const got = [...roofs].filter((v) => v >= 0).map(rgbOf);
    expect(got.length).toBeGreaterThan(800);
    const med = (k: number) => { const v = got.map((c) => c[k] - (c[0] + c[1] + c[2]) / 3).sort((a, b) => a - b); return v[v.length >> 1]; };
    // the green and the haze are gone: what's left is the warmth North American roofs have
    for (let k = 0; k < 3; k++) expect(Math.abs(med(k) - ROOF_WARMTH[k])).toBeLessThan(3);
    // …and, painted, the roofs differ from each other in hue far more than the old fold-every-
    // green-and-blue-to-grey allowed (roofGamut straight on the baked colour)
    const spread = (cs: number[], k: number) => { const v = cs.map(rgbOf).map((c) => c[k] - (c[0] + c[1] + c[2]) / 3).sort((a, b) => a - b); return v[Math.floor(v.length * 0.9)] - v[Math.floor(v.length * 0.1)]; };
    const own = tj.buildings.map((b, i) => [b, i] as const).filter(([b, i]) => roofs[i] >= 0 && b.own !== 0);
    const now = own.map(([b, i]) => aerialRoof(roofs[i], b.roof === 'flat')), then = own.map(([b]) => roofGamut(b.rc!));
    expect(spread(now, 2)).toBeGreaterThan(spread(then, 2) * 2);
    expect(spread(now, 0)).toBeGreaterThan(spread(then, 0) * 1.5);
    // a pure function of the tile
    expect([...tileRoofs(tj.buildings, true)]).toEqual([...roofs]);
    // not a baked tile (a streamed one: its rc is the map's) → nothing; no aerial source → nothing
    expect([...tileRoofs(tj.buildings, false)].every((v) => v === -1)).toBe(true);
    setRoofSource(null);
    expect([...tileRoofs(tj.buildings, true)].every((v) => v === -1)).toBe(true);
  });
  it('passes a streamed cell\'s own readings straight through, whatever the region', () => {
    const b = (ar?: number): Building => ({ r: [0, 0, 100, 0, 100, 100], h: 6, k: 'house', roof: 'gable', s: 7, ...(ar != null ? { ar } : {}) });
    for (const src of ['painted', null] as const) {
      setRoofSource(src, TAG_ROOF_COLOURS);
      expect([...tileRoofs([b(0x6b5a4c), b(), b(0x55585c)], false)]).toEqual([0x6b5a4c, -1, 0x55585c]);
    }
    setRoofSource(null);
  });
  it('leaves a mapped roof colour alone', () => {
    setRoofSource('painted', TAG_ROOF_COLOURS);
    const b = (rc: number): Building => ({ r: [0, 0, 100, 0, 100, 100], h: 6, k: 'house', roof: 'gable', s: 7, rc });
    const roofs = tileRoofs([b(0x9c4436 /* roof:colour=red */), b(paint(70, 80, 82)), b(paint(72, 80, 84))], true);
    expect(roofs[0]).toBe(-1);
    expect(roofs[1]).toBeGreaterThanOrEqual(0);
    setRoofSource(null);
  });
});

describe('the recipe with a real roof colour (recipe.ts)', () => {
  const nj = regionStyle(40.36, -73.98);
  const bd = (s: number, extra: Partial<Building> = {}): Building => ({ r: [], h: 8, k: 'house', roof: 'gable', s, ...extra });
  it('without one, is today\'s recipe exactly', () => {
    for (let s = 1; s < 300; s += 7) expect(recipeFor(bd(s * 7919), nj, 'suburb', 0, -1)).toEqual(recipeFor(bd(s * 7919), nj));
  });
  it('takes the photo\'s colour over the palette and the neighbourhood\'s roofs; a mapped roof:colour still wins', () => {
    const brown = hex([112, 86, 66]);
    for (const hood of ['suburb', 'estate', 'tract', 'grid'] as const) expect(recipeFor(bd(42), nj, hood, 9, brown).roof).toBe(aerialRoof(brown, false));
    expect(recipeFor(bd(42, { rc: 0x2f3032 }), nj, 'suburb', 0, -1).roof).not.toBe(aerialRoof(brown, false));
  });
  it('reads clay and painted metal off the photo; greys and browns keep the region\'s habit', () => {
    expect(recipeFor(bd(5), nj, 'suburb', 0, hex([158, 82, 58])).roofMat).toBe(ROOFMAT.tile);
    expect(recipeFor(bd(5), nj, 'estate', 0, hex([158, 82, 58])).roofMat).toBe(ROOFMAT.tile);
    expect(recipeFor(bd(5), nj, 'suburb', 0, hex([80, 100, 135])).roofMat).toBe(ROOFMAT.metal);
    for (let s = 1; s < 60; s++) expect(recipeFor(bd(s * 977), nj, 'suburb', 0, hex([100, 100, 98])).roofMat).toBe(recipeFor(bd(s * 977), nj).roofMat);
  });
});

describe('streamed cells: the NAIP request and the enrichment (aerialFetch.ts)', () => {
  const origin = { lat: 40.3605, lon: -74.0385 }; // a town inside the survey
  const box = { x0: 0, z0: 0, x1: 1024, z1: 1024 };
  it('asks for exactly the cell and its margin, pixels mapping straight onto the local frame', () => {
    const { query, frame } = naipRequest(origin, box);
    const p = new URLSearchParams(query);
    const [w, s, e, n] = p.get('bbox')!.split(',').map(Number);
    const [W, H] = p.get('size')!.split(',').map(Number);
    expect(p.get('bboxSR')).toBe('4326');
    expect(p.get('imageSR')).toBe('4326');
    expect(W).toBeLessThanOrEqual(4000);
    expect(Math.abs(W / H - (e - w) / (n - s))).toBeLessThan(2 / H); // (the server keeps the bbox)
    const P = makeProjector(origin);
    const [lat, lon] = P.unproject(frame.x0 + frame.dx * W, frame.z0 + frame.dz * H);
    expect(Math.abs(lon - e) * 85000).toBeLessThan(0.05);
    expect(Math.abs(lat - s) * 111000).toBeLessThan(0.05);
    expect(frame.dz).toBeCloseTo(0.9, 1);
  });
  it('puts the photo\'s roof colours on the buildings, caches them, and stays quiet offline', async () => {
    // the same street of houses, placed in the cell; the photo is the synthetic one, laid on the frame
    const { frame } = naipRequest(origin, box);
    const small = scene(NAIP_CAST);
    const big = new Uint8ClampedArray(frame.w * frame.h * 4);
    for (let j = 0; j < frame.h; j++)
      for (let i = 0; i < frame.w; i++) {
        // nearest pixel of the synthetic scene (lawn past its edge)
        const x = frame.x0 + (i + 0.5) * frame.dx - 300, z = frame.z0 + (j + 0.5) * frame.dz - 300;
        const si = Math.floor((x - small.x0) / small.dx), sj = Math.floor((z - small.z0) / small.dz), o = (j * frame.w + i) * 4;
        const src = si >= 0 && sj >= 0 && si < small.w && sj < small.h ? (sj * small.w + si) * 3 : -1;
        big[o] = src >= 0 ? small.px[src] : 80; big[o + 1] = src >= 0 ? small.px[src + 1] : 128; big[o + 2] = src >= 0 ? small.px[src + 2] : 66; big[o + 3] = 255;
      }
    const move = (b: Building): Building => ({ ...b, r: b.r.map((v) => v + 3000) });
    const tj = { ...tile(), buildings: tile().buildings.map(move), roads: [{ p: [q(290), q(334), q(430), q(334)], c: 'residential', w: 8 }], areas: [], lines: [], points: [] } as unknown as TileJson;
    let calls = 0;
    setAerialLog(() => {});
    setAerialIO({ image: async (url) => { calls++; expect(url).toContain('USGSNAIPImagery'); return { w: frame.w, h: frame.h, px: big }; } });
    initAerial(origin, '');
    expect(await enrichAerial(tj, box, null)).toBe('done');
    expect(calls).toBe(1);
    const seen = tj.buildings.filter((b) => b.ar != null).length;
    expect(seen).toBeGreaterThanOrEqual(HOUSES.length - 2);
    expect(err(rgbOf(tj.buildings[2].ar!), TRUTH[2])).toBeLessThan(14); // the clay roof, through a ~0.9 m resampling
    // a second build of the cell: from the record, no photo
    const again = { ...tj, buildings: tile().buildings.map(move) } as TileJson;
    expect(await enrichAerial(again, box, null)).toBe('done');
    expect(calls).toBe(1);
    expect(again.buildings.map((b) => b.ar)).toEqual(tj.buildings.map((b) => b.ar));
    // a mapped roof colour wins over the photo
    const tagged = { ...tj, buildings: tile().buildings.map(move).map((b, k) => (k === 2 ? { ...b, rc: 0x9c4436 } : b)) } as TileJson;
    await enrichAerial(tagged, box, null);
    expect(tagged.buildings[2].ar).toBeUndefined();
    // offline (or a server that says no): palette roofs, no throw
    setAerialIO({ image: async () => { throw new TypeError('Failed to fetch'); } });
    const other = { x0: 1024, z0: 0, x1: 2048, z1: 1024 };
    const off = { ...tile(), buildings: tile().buildings.map((b) => ({ ...b, r: b.r.map((v, k) => (k % 2 ? v + 3000 : v + 13240)) })), areas: [], lines: [], points: [] } as unknown as TileJson;
    expect(await enrichAerial(off, other, 10)).toBe('none');
    expect(off.buildings.every((b) => b.ar == null)).toBe(true);
    // a browser USGS refuses (no CORS header for its origin): the tile service's relay, and only
    // the relay from then on
    const asked: string[] = [];
    setAerialIO({ image: async (url) => { asked.push(url.split('?')[0]); if (url.includes('nationalmap')) throw new TypeError('Failed to fetch'); return { w: frame.w, h: frame.h, px: big }; } });
    initAerial(origin, 'https://tiles.example/');
    const cell2 = { x0: 0, z0: 1024, x1: 1024, z1: 2048 }, cell3 = { x0: -1024, z0: 1024, x1: 0, z1: 2048 };
    const shiftTo = (dz: number, dx = 0) => ({ ...tj, buildings: tile().buildings.map(move).map((b) => ({ ...b, r: b.r.map((v, k) => v + (k % 2 ? dz : dx)) })) }) as TileJson;
    expect(await enrichAerial(shiftTo(10240), cell2, null)).toBe('done');
    expect(await enrichAerial(shiftTo(10240, -10240), cell3, null)).toBe('done');
    expect(asked).toEqual([NAIP_SERVICE, 'https://tiles.example/naip', 'https://tiles.example/naip']);
    // out past the survey (the open Atlantic): settled without asking
    let sea = 0;
    setAerialIO({ image: async () => { sea++; return null; } });
    initAerial({ lat: 38.0, lon: -60.0 }, '');
    expect(await enrichAerial({ ...tile(), areas: [], lines: [], points: [] } as unknown as TileJson, box, null)).toBe('none');
    expect(sea).toBe(0);
    setAerialIO(null);
  });
});
// (NO_CAST is the identity)
void NO_CAST;
