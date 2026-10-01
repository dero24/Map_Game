import { describe, it, expect, beforeAll } from 'vitest';
import { Terrain, TerrainLayer, prim, type TileJson, type TileSpec, type WorldJson } from '../src/world/data';
import { buildTile } from '../src/world/tileBuild';
import { buildBuildings } from '../src/world/buildings';
import { RecWalk, replayOps, type BuiltTile } from '../src/world/pack';
import { WalkWorld } from '../src/player/collision';
import { setActiveStyle, regionStyle, activeStyle } from '../src/world/styles';
import { setMicroDate, MICRO_STRIDE } from '../src/world/micro';
import { setWorldDate, present, presentPacked } from '../src/world/calendar';
import { KERB_STRIDE, parkedAt } from '../src/world/kerbCars';
import { lotLayout } from '../src/world/lots';
import { shoreDocks, waterline, SLIP } from '../src/world/docks';
import { CROWD_STRIDE, POSE } from '../src/world/crowd';
import { CROWD_TIERS } from '../src/world/crowdLayer';
import { CAPS } from '../src/sim/protocol';
import { MICRO_INDEX } from '../src/assets/micro';
import { personGeometry, personLiteGeometry } from '../src/assets/people';

// The shore keeps one calendar (round 10's must-fix 5), on the baked shore pack: the beach lot fills
// by the season and the hour, a marina's slips by the month, two in five riverfront houses have a
// dock and a boat, and the beach's people sit under its umbrellas in season, a lifeguard up in each
// stand from ten to five. The pack itself is read, never changed.

class StubCtx {
  canvas: unknown; fillStyle = ''; strokeStyle = ''; lineWidth = 1; lineCap = ''; lineJoin = ''; globalCompositeOperation = ''; textBaseline = ''; font = '';
  constructor(c: unknown) { this.canvas = c; }
  setTransform() {} beginPath() {} moveTo() {} lineTo() {} stroke() {} fill() {} fillRect() {} fillText() {} drawImage() {} closePath() {} arc() {} rect() {}
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(t: string) { return { width: t.length * 8 }; }
  getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}
class StubCanvas {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return new StubCtx(this); }
  transferToImageBitmap() { return { width: this.width, height: this.height, close() {} } as unknown as ImageBitmap; }
}

// (the pack is read off the disk: node's fs, found at run time — the type check knows no node)
type ReadFile = { (p: URL, enc: 'utf8'): string; (p: URL): Uint8Array };
let readFileSync: ReadFile;
const R = new URL('../public/data/shore/', import.meta.url);
let man: { tiles: TileSpec[]; terrain: { slice: never; backdrop: never } };
let terrain: Terrain;
const tileJson = (id: string) => JSON.parse(readFileSync(new URL(`tiles/${id}.json`, R), 'utf8')) as TileJson;
const spec = (id: string) => man.tiles.find((t) => t.id === id)!;
const built = new Map<string, BuiltTile>();
async function build(id: string, date: string) {
  const k = `${id}@${date}`;
  if (!built.has(k)) {
    setWorldDate(date);
    setMicroDate(date);
    built.set(k, await buildTile(tileJson(id), terrain, spec(id), 0));
  }
  return built.get(k)!;
}
type P = [number, number];
const un = (f: number[]): P[] => { const o: P[] = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
const inRing = (x: number, z: number, r: P[]) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
const segD = (px: number, pz: number, a: P, b: P) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz); };
const ringD = (x: number, z: number, r: P[]) => { let b = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) b = Math.min(b, segD(x, z, r[j], r[i])); return b; };
const boatsOf = (t: BuiltTile) => {
  const out: { x: number; z: number; fx: number; fz: number }[] = [];
  for (const o of t.objs) if (o.n?.startsWith('moored-boats:') && o.im) for (let i = 0; i + 16 <= o.im.length; i += 16) out.push({ x: o.im[i + 12], z: o.im[i + 14], fx: -o.im[i + 8], fz: -o.im[i + 10] });
  return out;
};

beforeAll(async () => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas;
  setActiveStyle(regionStyle(40.36, -73.98)); // (the Jersey shore)
  readFileSync = ((await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync: ReadFile }).readFileSync;
  man = JSON.parse(readFileSync(new URL('manifest.json', R), 'utf8'));
  const buf = readFileSync(new URL('terrain.bin', R));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  terrain = new Terrain(new TerrainLayer(ab, man.terrain.slice), new TerrainLayer(ab, man.terrain.backdrop));
});

describe('the shore keeps one calendar', () => {
  // Sea Bright's beach lot, east of Ocean Avenue: the biggest lot on the tile, ten metres from the sand
  const LOT = '0_-1';
  const bigLot = () => {
    let best: { ring: P[]; stalls: number } | null = null;
    for (const a of tileJson(LOT).areas) {
      if (a.c !== 'parking' || a.own === 0) continue;
      const ring = un(a.o[0]), L = lotLayout(ring, 600);
      if (L && (!best || L.stalls.length > best.stalls)) best = { ring, stalls: L.stalls.length };
    }
    return best!;
  };
  const fill = (t: BuiltTile, ring: P[], stalls: number, h: number) => {
    const k = t.kerb!;
    let n = 0;
    for (let i = 0; i + KERB_STRIDE <= k.length; i += KERB_STRIDE) if (inRing(k[i], k[i + 2], ring) && parkedAt(k, i, h)) n++;
    return n / stalls;
  };

  it('the beach lot fills by the season and the hour: under a quarter on 1 October at 17:48, full on a July afternoon', async () => {
    const lot = bigLot();
    expect(lot.stalls).toBeGreaterThan(300);
    const oct = await build(LOT, '2026-10-01'), jul = await build(LOT, '2026-07-15');
    expect(fill(oct, lot.ring, lot.stalls, 17.8)).toBeLessThanOrEqual(0.25);
    expect(fill(oct, lot.ring, lot.stalls, 13)).toBeLessThan(0.3);
    expect(fill(jul, lot.ring, lot.stalls, 13)).toBeGreaterThan(0.85);
    expect(fill(jul, lot.ring, lot.stalls, 17.8)).toBeLessThan(fill(jul, lot.ring, lot.stalls, 15));
    expect(fill(jul, lot.ring, lot.stalls, 3)).toBeLessThan(0.12);
  });

  it('a car that comes and goes is walled only by kerbCars (never in the tile\'s collision); an all-day car is', async () => {
    const t = await build(LOT, '2026-07-15');
    const w = new WalkWorld(terrain, { x0: -5000, z0: -5000, x1: 5000, z1: 5000 });
    replayOps(w, t.ops);
    const k = t.kerb!;
    let comers = 0, walledComers = 0, allDay = 0, walledAllDay = 0;
    for (let i = 0; i + KERB_STRIDE <= k.length; i += KERB_STRIDE) {
      const always = k[i + 11] <= 0 && k[i + 12] >= 24, hit = w.touching(k[i], k[i + 2], 1.15);
      if (always) (allDay++, (walledAllDay += hit ? 1 : 0));
      else (comers++, (walledComers += hit ? 1 : 0));
    }
    expect(comers).toBeGreaterThan(200);
    expect(walledComers / comers).toBeLessThan(0.05); // (a neighbour's wall within a metre, now and then)
    expect(walledAllDay / allDay).toBeGreaterThan(0.95);
  });

  it('a lot far from any beach keeps the town\'s fill all day', async () => {
    const t = await build('-1_4', '2026-07-15');
    const k = t.kerb!;
    const far = tileJson('-1_4').areas.filter((a) => a.c === 'parking' && a.own !== 0).map((a) => un(a.o[0])).filter((r) => r.every(([x, z]) => terrain.oceanDistAt(x, z) > 400));
    let n = 0;
    for (let i = 0; i + KERB_STRIDE <= k.length; i += KERB_STRIDE) if (far.some((r) => inRing(k[i], k[i + 2], r))) { n++; expect([k[i + 11], k[i + 12]]).toEqual([0, 24]); }
    expect(n).toBeGreaterThan(20);
  });

  // the marina on the region's fine ground (its others stand on the 10 m backdrop, where no pier is built)
  const MARINA = '-3_3';
  it('a mapped marina: finger piers every 4.5 m off its waterline, boats bow-in, ≥ 8 a 100 m of it in October', async () => {
    const tj = tileJson(MARINA);
    const ring = un(tj.areas.find((a) => a.c === 'marina' && a.own !== 0)!.o[0]);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    const shore = waterline(terrain, x0 - 8, z0 - 8, x1 + 8, z1 + 8, (x, z) => inRing(x, z, ring) || ringD(x, z, ring) < 6)
      .reduce((s, l) => { for (let i = 0; i + 1 < l.length; i++) s += Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]); return s; }, 0);
    expect(shore).toBeGreaterThan(100);
    const near = (b: { x: number; z: number }) => inRing(b.x, b.z, ring) || ringD(b.x, b.z, ring) < 15;
    const oct = boatsOf(await build(MARINA, '2026-10-01')).filter(near), jul = boatsOf(await build(MARINA, '2026-07-15')).filter(near);
    expect((oct.length / shore) * 100).toBeGreaterThanOrEqual(8);
    expect(jul.length).toBeGreaterThan(oct.length);
    // the fingers: rooted on the waterline, the next one along a slip's width off
    const bld = buildBuildings({ json: tj as unknown as WorldJson, terrain }, 0, false);
    const w = new RecWalk(terrain, tj.backdrop);
    for (const f of bld.footprints) w.addPolygon(f.ring);
    const pj = { ...tj, roads: prim(tj.roads), areas: prim(tj.areas), lines: prim(tj.lines), points: prim(tj.points) } as unknown as WorldJson;
    const d = shoreDocks({ json: pj, ctx: tj as unknown as WorldJson, terrain, walk: w, footprints: bld.footprints, box: spec(MARINA).box, climate: activeStyle().climate });
    const roots = d.lines.filter((l) => l.gen === 'slip').map((l) => un(l.p)[0]);
    expect(roots.length).toBeGreaterThan(15);
    const gaps = roots.map((r) => Math.min(...roots.filter((q) => q !== r).map((q) => Math.hypot(q[0] - r[0], q[1] - r[1]))));
    expect(gaps.filter((g) => g > SLIP * 0.75 && g < SLIP * 1.25).length / gaps.length).toBeGreaterThan(0.8);
    for (const r of roots) expect(Math.abs(terrain.sdfAt(r[0], r[1]))).toBeLessThan(1.5);
    // bow-in: each slip's boat noses toward the bulkhead
    for (const b of d.berths.filter((q) => q.kind === 'slip')) {
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      expect(terrain.sdfAt(b.x + fx * 4, b.z + fz * 4)).toBeGreaterThan(terrain.sdfAt(b.x - fx * 4, b.z - fz * 4));
    }
  });

  it('riverfront houses: about two in five get a dock and a boat (none within 30 m of a mapped dock)', async () => {
    let lots = 0, docks = 0, boats = 0;
    for (const id of ['-1_-1', '-1_0', '0_-1', '-1_1', '-2_3', '-1_2']) {
      const tj = tileJson(id);
      const bld = buildBuildings({ json: tj as unknown as WorldJson, terrain }, 0, false);
      const w = new RecWalk(terrain, tj.backdrop);
      for (const f of bld.footprints) w.addPolygon(f.ring);
      const pj = { ...tj, roads: prim(tj.roads), areas: prim(tj.areas), lines: prim(tj.lines), points: prim(tj.points) } as unknown as WorldJson;
      const d = shoreDocks({ json: pj, ctx: tj as unknown as WorldJson, terrain, walk: w, footprints: bld.footprints, box: spec(id).box, climate: activeStyle().climate });
      lots += d.riverfront;
      const mine = d.lines.filter((l) => l.gen === 'dock');
      docks += mine.length;
      boats += d.berths.filter((b) => b.kind === 'dock').length;
      // never within 30 m of a mapped one
      const mapped = tj.lines.filter((l) => l.c === 'pier').map((l) => un(l.p));
      for (const l of mine) for (const [x, z] of un(l.p)) for (const m of mapped) for (let i = 0; i + 1 < m.length; i++) expect(segD(x, z, m[i], m[i + 1])).toBeGreaterThan(29);
      // determinism: the same docks every time
      const again = shoreDocks({ json: pj, ctx: tj as unknown as WorldJson, terrain, walk: w, footprints: bld.footprints, box: spec(id).box, climate: activeStyle().climate });
      expect(again.lines.map((l) => l.p.join(','))).toEqual(d.lines.map((l) => l.p.join(',')));
    }
    expect(lots).toBeGreaterThan(80);
    expect(docks / lots).toBeGreaterThan(0.3);
    expect(docks / lots).toBeLessThan(0.45);
    expect(boats).toBe(docks); // (every dock its boat's berth)
  });

  // the beach by the spawn: the micro layer's umbrella cells and the stands' summer beach
  const BEACH = '0_-1';
  it('in season: 1–3 people to an umbrella, seated or lying, ≥ 1.2 people an umbrella at 13:00, a lifeguard in every stand 10–17', async () => {
    const t = await build(BEACH, '2026-07-15');
    const c = t.crowd!, m = t.micro!;
    const umbs: P[] = [];
    for (let i = 0; i + MICRO_STRIDE <= m.length; i += MICRO_STRIDE) if (m[i + 4] === MICRO_INDEX.umbrella) umbs.push([m[i], m[i + 2]]);
    expect(umbs.length).toBeGreaterThan(50);
    const people: { x: number; z: number; pose: number; a: number; l: number }[] = [];
    for (let i = 0; i + CROWD_STRIDE <= c.length; i += CROWD_STRIDE) people.push({ x: c[i], z: c[i + 2], pose: c[i + 4], a: c[i + 9], l: c[i + 10] });
    const at13 = people.filter((q) => present(13, q.a, q.l));
    expect(at13.length / umbs.length).toBeGreaterThanOrEqual(1.2);
    // under each umbrella: one to three, sitting or lying (the seated, lying and sitting poses)
    const under = umbs.map(([x, z]) => at13.filter((q) => q.pose <= POSE.SIT && Math.hypot(q.x - x, q.z - z) < 2.6).length);
    expect(under.filter((n) => n >= 1 && n <= 3).length / umbs.length).toBeGreaterThan(0.9);
    // kids at the waterline, in the swash
    const kids = at13.filter((q) => q.pose === POSE.PLAY);
    expect(kids.length).toBeGreaterThan(10);
    for (const k of kids) expect(terrain.sdfAt(k.x, k.z)).toBeLessThan(3);
    // a lifeguard in each stand, ten to five
    const stands = t.objs.find((o) => o.n === 'beach:lifeguard')!.im!.length / 16;
    const guards = people.filter((q) => q.pose === POSE.GUARD);
    expect(guards.length).toBe(stands);
    for (const g of guards) expect([g.a, g.l]).toEqual([10, 17]);
    // the morning and the evening: fewer
    expect(people.filter((q) => present(8, q.a, q.l)).length).toBeLessThan(at13.length * 0.15);
    expect(people.filter((q) => present(19.5, q.a, q.l)).length).toBeLessThan(at13.length * 0.35);
    // the gear goes up and comes down with its people: every umbrella out at 13:00, few at 8:00
    const flags: number[] = [];
    for (let i = 0; i + MICRO_STRIDE <= m.length; i += MICRO_STRIDE) if (m[i + 4] === MICRO_INDEX.umbrella) flags.push(m[i + 7]);
    expect(flags.every((f) => f > 0 && presentPacked(13, f))).toBe(true);
    expect(flags.filter((f) => presentPacked(8, f)).length).toBeLessThan(flags.length * 0.15);
  });

  it('out of season: no lifeguards after Labor Day, and nobody on a winter beach', async () => {
    const oct = (await build(BEACH, '2026-10-01')).crowd ?? new Float32Array(0);
    for (let i = 0; i + CROWD_STRIDE <= oct.length; i += CROWD_STRIDE) expect(oct[i + 4]).not.toBe(POSE.GUARD);
    expect((await build(BEACH, '2026-01-15')).crowd).toBeUndefined();
  });

  it('deterministic: the same tile on the same day is the same beach, lot and boats', async () => {
    const a = await build(BEACH, '2026-07-15');
    setWorldDate('2026-07-15'); setMicroDate('2026-07-15');
    const b = await buildTile(tileJson(BEACH), terrain, spec(BEACH), 0);
    expect(b.crowd).toEqual(a.crowd);
    expect(b.kerb).toEqual(a.kerb);
    expect(boatsOf(b)).toEqual(boatsOf(a));
  });

  it('budgets: a phone draws at most half the life sim\'s walkers, and the crowd\'s vertices stay small', () => {
    const lite = personLiteGeometry().getAttribute('position').count, full = personGeometry().getAttribute('position').count;
    expect(lite).toBeLessThan(300);
    expect(CROWD_TIERS.phone.full + CROWD_TIERS.phone.lite).toBeLessThanOrEqual(CAPS.peds / 2);
    expect(CROWD_TIERS.low.full + CROWD_TIERS.low.lite).toBeLessThanOrEqual(CAPS.peds / 4);
    expect(CROWD_TIERS.phone.full * full + CROWD_TIERS.phone.lite * lite).toBeLessThan(150_000);
    expect(CROWD_TIERS.desktop.full * full + CROWD_TIERS.desktop.lite * lite).toBeLessThan(600_000);
  });
});
