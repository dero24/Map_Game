import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { Terrain, TerrainLayer } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { RecWalk, packDeck, unpackDeck, replayOps, matTag, matFromTag, packGroup, buildObject, type BuiltTile } from '../src/world/pack';
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
  fillText() {}
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
