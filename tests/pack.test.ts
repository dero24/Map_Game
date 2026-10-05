import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { Terrain, TerrainLayer } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { RecWalk, packDeck, unpackDeck, replayOps, matTag, matFromTag, packGroup, buildObject, setFreeUploaded, type BuiltTile } from '../src/world/pack';
import { propMaterial } from '../src/render/propMaterial';
import { buildingMaterial } from '../src/world/buildings';
import { wireMaterial, haloMaterial } from '../src/world/props';
import { signMaterial } from '../src/world/signs';
import { buildTile } from '../src/world/tileBuild';
// @ts-expect-error plain js lib
import { packToBin } from '../scripts/lib/tiles.mjs';

// ---------------- node-side canvas stub: OffscreenCanvas doesn't exist in vitest ----------------
class StubCtx {
  canvas: unknown;
  fillStyle = ''; strokeStyle = ''; lineWidth = 1; lineCap = ''; lineJoin = '';
  globalCompositeOperation = ''; textBaseline = ''; font = '';
  constructor(c: unknown) { this.canvas = c; }
  setTransform() {} beginPath() {} moveTo() {} lineTo() {} stroke() {} fill() {} fillRect() {}
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(t: string) { return { width: t.length * 8 } }; // eslint-disable-line
  fillText() {} drawImage() {}
  getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}
class StubCanvas {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return new StubCtx(this); }
  transferToImageBitmap() { return { width: this.width, height: this.height, close() {} } as ImageBitmap; }
}
beforeAll(() => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas;
});

// ---------------- fixtures ----------------
const m = (v: number) => Math.round(v * 10);
const layerBuf = (() => {
  const g = { x0: 0, z0: 0, cell: 4, w: 64, h: 64 };
  const pack = {
    grid: g,
    height: new Int16Array(64 * 64).fill(120), // 1.2 m flat
    sdf: new Int16Array(64 * 64).fill(300), // 30 m land
    cover: new Uint8Array(64 * 64).fill(10),
    flags: new Uint8Array(64 * 64),
    oceanD: new Uint8Array(64 * 64).fill(200),
  };
  return packToBin(pack);
})();
const terrain = new Terrain(new TerrainLayer(layerBuf.buf, layerBuf.layout), new TerrainLayer(layerBuf.buf, layerBuf.layout));

const tileJson = {
  version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
  origin: { lat: 40, lon: -74 }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
  landmarks: [],
  buildings: [
    { r: [m(100), m(100), m(120), m(100), m(120), m(120), m(100), m(120)], h: 8, k: 'house', roof: 'gable', s: 1 },
    { r: [m(160), m(100), m(180), m(100), m(180), m(120), m(160), m(120)], h: 7, k: 'house', roof: 'flat', s: 2 },
    { r: [m(300), m(300), m(310), m(300), m(310), m(310), m(300), m(310)], h: 6, k: 'house', roof: 'gable', s: 3, own: 0 },
  ],
  roads: [
    { p: [m(90), m(130), m(200), m(130)], c: 'residential', w: 6, n: 'Test St' },
    { p: [m(90), m(131), m(90), m(160)], c: 'residential', w: 6, n: 'Other Ave' },
  ],
  areas: [],
  lines: [{ c: 'fence', p: [m(95), m(150), m(140), m(150)] }],
  points: [{ c: 'tree', x: 130, z: 160 }],
};
const spec = { id: '0_0', box: tileJson.box, lod: 0, file: 'tiles/0_0.json' };

// ---------------- decks ----------------
describe('packDeck/unpackDeck', () => {
  it('reproduces profiled ramps, flats and the bridge arch exactly', () => {
    const ramp = { pts: [[0, 0], [10, 0]] as [number, number][], cum: [0, 10], halfWidth: 1, heightAt: (s: number) => 1 + 0.3 * Math.min(1, Math.max(0, s / 10)), profile: { k: 'ramp', y0: 1, y1: 1.3, total: 10 } as const };
    const r = unpackDeck(packDeck(ramp));
    for (const s of [0, 1.7, 5, 9.9, 12]) expect(r.heightAt(s)).toBeCloseTo(ramp.heightAt(s), 6);
    const archFn = (s: number) => {
      const t = Math.min(1, Math.max(0, s / 40));
      const base = 1.3 + (2.1 - 1.3) * t;
      return base + Math.max(0, 6.5 - base) * Math.pow(Math.sin(Math.PI * t), 0.45);
    };
    const arch = { pts: [[0, 0], [40, 0]] as [number, number][], cum: [0, 40], halfWidth: 2, heightAt: archFn, profile: { k: 'arch', hA: 1.3, hB: 2.1, peak: 6.5, total: 40 } as const };
    const c = unpackDeck(packDeck(arch));
    for (let s = 0; s <= 40; s += 1.3) expect(c.heightAt(s)).toBeCloseTo(archFn(s), 6);
  });
  it('falls back to a sampled curve for unprofiled decks', () => {
    const ramp = { pts: [[0, 0], [10, 0]] as [number, number][], cum: [0, 10], halfWidth: 1, heightAt: (s: number) => 1 + 0.3 * Math.min(1, Math.max(0, s / 10)) };
    const r = unpackDeck(packDeck(ramp));
    for (const s of [0, 1.7, 5, 9.9, 12]) expect(r.heightAt(s)).toBeCloseTo(ramp.heightAt(s), 5);
  });
});

// ---------------- collision ops ----------------
describe('RecWalk + replayOps', () => {
  const box = { x0: -50, z0: -50, x1: 300, z1: 300 };
  it('records walls, loops, decks and replays them into a fresh world', () => {
    const src = new RecWalk(terrain, box);
    src.addWall([10, 10], [40, 10]);
    src.addLoop([[60, 60], [70, 60], [70, 70], [60, 70]]);
    src.addPolygon([[100, 100], [130, 100], [130, 130], [100, 130]], { floor0: 1, floorH: 3, levels: 2 });
    src.addDeck({ pts: [[0, 200], [30, 200]], cum: [0, 30], halfWidth: 1.5, heightAt: () => 2.4 });
    expect(src.ops.map((o) => o.o)).toEqual(['w', 'l', 'p', 'd']);
    const dst = new WalkWorld(terrain, box);
    replayOps(dst, src.ops);
    for (const [x, z] of [[25, 8], [65, 65], [115, 115], [15, 200]]) expect(dst.blocked(x, z, 0.4), `blocked ${x},${z}`).toBe(src.blocked(x, z, 0.4));
    expect(dst.decks).toHaveLength(1);
    expect(dst.deckAt(15, 200)).toBeCloseTo(2.4, 5);
    // paused regions (context seeds) record nothing
    src.recording = false;
    src.addWall([0, 0], [5, 0]);
    src.recording = true;
    expect(src.ops).toHaveLength(4);
  });
});

// ---------------- material tags ----------------
describe('matTag', () => {
  it('recovers propMaterial options and fingerprints the rest', () => {
    expect(matTag(buildingMaterial())).toEqual({ t: 'bld' });
    expect(matTag(wireMaterial())).toEqual({ t: 'wire' });
    expect(matTag(signMaterial(new THREE.Texture()))).toEqual({ t: 'signs' });
    const hm = matTag(haloMaterial(1.6, new THREE.Color(1, 0.7, 0.38)));
    expect(hm.t).toBe('halo');
    if (hm.t === 'halo') expect(hm.size).toBe(1.6);
    expect(matTag(propMaterial())).toEqual({ t: 'prop', o: { wind: false, bob: false, foliage: false, emissive: undefined, emissiveNight: false } });
    const p = matTag(propMaterial({ wind: true, foliage: true }));
    expect(p).toEqual({ t: 'prop', o: { wind: true, bob: false, foliage: true, emissive: undefined, emissiveNight: false } });
    // broadleaf crowns keep their seasonal define through the pack
    const dm = matTag(propMaterial({ wind: true, foliage: true, crown: [4, 2], decid: true }));
    expect(dm.t === 'prop' && dm.o.decid).toBe(true);
    expect((matFromTag(dm) as THREE.ShaderMaterial).defines.DECID).toBe(1);
    // …and its species' autumn, its blossom, a willow's sway and its leaves' own motion (lost in the pack
    // before): a cherry, a redbud, a sweetgum's jewels, a dogwood's bobbing tiers, an aspen's tremble
    for (const o of [{ fallHue: 2, weep: true }, { fallHue: 1, blossom: 1 }, { fallHue: 2, blossom: 3 }, { fallHue: 4 }, { fallHue: 1, blossom: 2, motion: 2 }, { fallHue: 2, motion: 1 }] as { fallHue: number; weep?: boolean; blossom?: number; motion?: number }[]) {
      const back = matFromTag(matTag(propMaterial({ wind: true, foliage: true, crown: [4, 2], decid: true, ...o }))) as THREE.ShaderMaterial;
      expect(back.defines.FALL_HUE).toBe(o.fallHue);
      expect(!!back.defines.WEEP).toBe(!!o.weep);
      expect(back.defines.BLOSSOM).toBe(o.blossom ?? 0);
      expect(back.defines.MOTION).toBe(o.motion ?? 0);
    }
    const e = matTag(propMaterial({ emissive: new THREE.Color(1, 0.72, 0.4), emissiveNight: true }));
    expect(e.t).toBe('prop');
    if (e.t === 'prop') {
      expect(e.o.emissiveNight).toBe(true);
      expect(e.o.emissive).toBeTypeOf('number');
    }
  });
});

// ---------------- object pack/rebuild ----------------
describe('packGroup + buildObject', () => {
  it('round-trips meshes, instancing, points and flags', () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), propMaterial());
    mesh.layers.enable(1);
    mesh.name = 'thing';
    g.add(mesh);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), propMaterial({ bob: true }), 3);
    inst.setMatrixAt(2, new THREE.Matrix4().makeTranslation(5, 6, 7));
    inst.setColorAt(1, new THREE.Color(0xff0000));
    inst.layers.enable(1);
    g.add(inst);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 2, 3, 4, 5], 3)), haloMaterial(2, new THREE.Color(1, 1, 1)));
    pts.renderOrder = 8;
    pts.frustumCulled = false;
    g.add(pts);
    const objs = packGroup(g);
    expect(objs.map((o) => o.k)).toEqual(['mesh', 'inst', 'pts']);
    const rebuilt = objs.map((o) => buildObject(o));
    const ri = rebuilt[1] as THREE.InstancedMesh;
    expect(ri.count).toBe(3);
    const m4 = new THREE.Matrix4();
    ri.getMatrixAt(2, m4);
    expect([m4.elements[12], m4.elements[13], m4.elements[14]]).toEqual([5, 6, 7]);
    expect(ri.instanceColor).not.toBeNull();
    expect(rebuilt[0].layers.mask & 2).toBe(2);
    expect(rebuilt[0].name).toBe('thing');
    expect(rebuilt[2].renderOrder).toBe(8);
    expect(rebuilt[2].frustumCulled).toBe(false);
    expect((rebuilt[0] as THREE.Mesh).geometry.attributes.position.count).toBe(24);
  });

  it('a phone lets go of the vertex data the CPU never reads again, once it is on the GPU', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(new Float32Array(24 * 4), 4));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, propMaterial()));
    const upload = (o: THREE.Object3D) => { for (const a of Object.values((o as THREE.Mesh).geometry.attributes)) (a as THREE.BufferAttribute).onUploadCallback(); };
    try {
      // (a desktop: both copies, as ever)
      setFreeUploaded(false);
      const kept = buildObject(packGroup(g)[0]) as THREE.Mesh;
      upload(kept);
      for (const a of Object.values(kept.geometry.attributes)) expect((a as THREE.BufferAttribute).array).not.toBeNull();
      // (a phone: before the upload everything is there — the stream weighs it then — after it, only
      // what's read again: the positions, the ids, the index)
      setFreeUploaded(true);
      const m = buildObject(packGroup(g)[0]) as THREE.Mesh;
      expect(m.geometry.attributes.normal.array).not.toBeNull();
      upload(m);
      const at = m.geometry.attributes as Record<string, THREE.BufferAttribute>;
      expect(at.normal.array).toBeNull();
      expect(at.uv.array).toBeNull();
      expect(at.normal.count).toBe(24); // (three draws by the count, kept)
      expect(at.position.array).not.toBeNull();
      expect(at.aInfo.array).not.toBeNull();
      expect(m.geometry.index!.array).not.toBeNull();
      m.geometry.computeBoundingSphere();
      expect(Number.isFinite(m.geometry.boundingSphere!.radius)).toBe(true);
    } finally {
      setFreeUploaded(false);
    }
  });
});

// ---------------- the whole pipeline ----------------
describe('buildTile', () => {
  const build = () => buildTile(JSON.parse(JSON.stringify(tileJson)), terrain, spec, 0);
  let a: BuiltTile;
  it('packs a tile: objects, ops, footprints, deterministic', async () => {
    a = await build();
    expect(a.objs.length).toBeGreaterThan(0);
    expect(a.objs.some((o) => o.m.t === 'bld')).toBe(true);
    expect(a.ops.length).toBeGreaterThan(0); // fence walls at least
    expect(a.roads).toHaveLength(2);
    const b = await build();
    const strip = (t: BuiltTile) => ({ ops: t.ops, fps: t.fps, walks: t.walks, plans: t.plans, walls: t.walls, pilings: t.pilings });
    expect(JSON.stringify(strip(b))).toBe(JSON.stringify(strip(a)));
    // margin context rings were seeded but not recorded as ops
    expect(a.ops.some((o) => o.o === 'p' && o.r[0][0] > 290)).toBe(false);
  });

  it('ships only the lettered part of the sign atlas, its uvs re-addressed to the crop', async () => {
    const tj = JSON.parse(JSON.stringify(tileJson));
    tj.buildings[0].ad = '12 Test St';
    tj.buildings[1].ad = '14 Test St';
    const t = await buildTile(tj, terrain, spec, 0);
    // (a 2048² atlas per tile was 16 MB + mips of mostly-empty texture — ~300 MB for a city ring)
    expect(t.atlas!.width * t.atlas!.height).toBeLessThanOrEqual(2048 * 64);
    const signs = t.objs.find((o) => o.m.t === 'signs')!;
    const uv = signs.at.uv.a;
    let lettered = 0;
    for (let i = 0; i + 1 < uv.length; i += 2) {
      if (uv[i] < 0) { expect(uv[i + 1]).toBe(-1); continue; } // untextured board / pole faces
      lettered++;
      expect(uv[i]).toBeLessThanOrEqual(1.0001);
      expect(uv[i + 1]).toBeLessThanOrEqual(1.0001);
    }
    expect(lettered).toBeGreaterThan(0);
    expect(Math.max(...Array.from(uv).filter((_, i) => i % 2 === 1))).toBeCloseTo(1, 3); // the one row fills the crop's height
  });

  it('a playground: the mapped piece where it is, an empty one fitted with a structure and swings; a flight of steps', async () => {
    const tj = JSON.parse(JSON.stringify(tileJson));
    tj.areas.push({ c: 'pitch', k: 'playground', o: [[m(20), m(180), m(50), m(180), m(50), m(210), m(20), m(210)]], i: [] });
    tj.points.push({ c: 'play', sp: 'seesaw', x: 220, z: 60 });
    tj.roads.push({ p: [m(230), m(200), m(240), m(200)], c: 'steps', w: 2 });
    const t = await buildTile(tj, terrain, spec, 0);
    const names = t.objs.map((o) => o.n ?? '');
    expect(names).toContain('play:seesaw');
    expect(names).toContain('play:structure');
    expect(names).toContain('play:swing');
  });

  it('a door never opens onto another building (a house behind another: its street side is the party wall)', async () => {
    const tj = JSON.parse(JSON.stringify(tileJson));
    // touches house 1 along z = 100; Test St runs along z = 130, on house 1's far side
    tj.buildings.push({ r: [m(100), m(80), m(120), m(80), m(120), m(100), m(100), m(100)], h: 6, k: 'house', roof: 'flat', s: 9 });
    const t = await buildTile(tj, terrain, spec, 0);
    const inRing = (x: number, z: number, r: [number, number][]) => {
      let c = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
      return c;
    };
    expect(t.doors.length).toBeGreaterThanOrEqual(3); // every house still has a door…
    for (const d of t.doors) for (const f of t.fps) expect(inRing(d.wx + d.nx * 0.6, d.wz + d.nz * 0.6, f.ring as [number, number][])).toBe(false); // …onto open ground
    const rear = t.fps.find((f) => f.ring.every(([, z]) => z <= 100.01))!;
    expect(rear.door !== undefined).toBe(true);
    expect(t.doors[rear.door!].wz).toBeLessThan(99.5); // not in the shared wall
  });

  it('mounts collision the same way the stream does', () => {
    const w = new WalkWorld(terrain, { x0: -50, z0: -50, x1: 300, z1: 300 });
    replayOps(w, a.ops);
    for (const f of a.fps) w.addPolygon(f.ring);
    for (const [pa, pb, y0, y1] of a.walls) w.addWall(pa, pb, y0, y1);
    expect(w.blocked(110, 110, 0.4)).toBe(true); // inside the first house
    expect(w.blocked(300, 300, 0.4)).toBe(false); // context building is NOT registered
    expect(w.blocked(115, 149.7, 0.4)).toBe(true); // beside the fence line
  });
});
