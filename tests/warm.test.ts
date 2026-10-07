import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ShaderWarm, variantKey, compileForScene } from '../src/render/warm';
import { probeGeometry } from '../src/render/probe';
import type { PObj } from '../src/world/pack';

const attrs = (names: string[]) => Object.fromEntries(names.map((n) => [n, { a: new Float32Array(3), n: 3 }]));
const tree = (o: Record<string, unknown>, extra: Partial<PObj> = {}): PObj => ({ k: 'inst', m: { t: 'prop', o }, at: attrs(['position', 'normal', 'color']), ic: new Float32Array(3), ...extra } as PObj);

// a renderer that records what it was asked to compile, and into which target; each compile resolves
// when the test says so
function fakeRenderer() {
  let target: unknown = null;
  const calls: { root: THREE.Object3D; target: unknown; done: () => void }[] = [];
  const r = {
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => { target = t; },
    compileAsync: (root: THREE.Object3D) => new Promise<void>((done) => calls.push({ root, target, done })),
  };
  return { r: r as unknown as THREE.WebGLRenderer, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('shader warm-up (render/warm.ts)', () => {
  it("keys a tile object's program by what changes the shader, not by its uniforms", () => {
    const a = tree({ wind: true, foliage: true, crown: [4, 3], fallHue: 2 });
    expect(variantKey(a)).toBe(variantKey(tree({ wind: true, foliage: true, crown: [6, 1], fallHue: 2 }))); // (a crown's size: a uniform)
    expect(variantKey(a)).not.toBe(variantKey(tree({ wind: true, foliage: true, crown: [4, 3], fallHue: 4 }))); // (another autumn: a define)
    expect(variantKey(a)).not.toBe(variantKey(a, true)); // (the near trees' hand-over: TREE_LOD)
    expect(variantKey(a)).not.toBe(variantKey(tree({ wind: true, foliage: true, crown: [4, 3], fallHue: 2 }, { ic: undefined }))); // (instance colours)
    expect(variantKey(a)).not.toBe(variantKey(tree({ wind: true, foliage: true, crown: [4, 3], fallHue: 2 }, { at: attrs(['position', 'color']) }))); // (normals)
    const lamp = (c: number) => ({ k: 'inst', m: { t: 'prop', o: { emissive: c, emissiveNight: true } }, at: attrs(['position']) } as PObj);
    expect(variantKey(lamp(0xffaa00))).toBe(variantKey(lamp(0x88ccff))); // (an emissive colour: a uniform)
  });

  it('compiles into a render target — the frame draws the scene into one — and puts the target back', async () => {
    const { r, calls } = fakeRenderer();
    const prev = { prev: true };
    r.setRenderTarget(prev as unknown as THREE.WebGLRenderTarget);
    const p = compileForScene(r, new THREE.Mesh(probeGeometry(), new THREE.MeshBasicMaterial()), new THREE.PerspectiveCamera());
    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBeInstanceOf(THREE.WebGLRenderTarget);
    expect(r.getRenderTarget()).toBe(prev);
    calls[0].done();
    await p;
  });

  it('holds a tile until its variants are built, compiles each variant once, and keeps it', async () => {
    const { r, calls } = fakeRenderer();
    const w = new ShaderWarm(r, new THREE.PerspectiveCamera(), new THREE.Scene());
    w.farLod = (name) => name.startsWith('trees:oak');
    const tile = [
      tree({ wind: true, foliage: true, crown: [4, 3] }, { n: 'trees:oak:0' }),
      tree({ wind: true, foliage: true, crown: [5, 2] }, { n: 'trees:oak:1' }), // (the same variant)
      tree({ wind: true, foliage: true, crown: [4, 3], fallHue: 4 }, { n: 'trees:sweetgum:0' }),
    ];
    const keys = w.prepare(tile);
    expect(keys).toHaveLength(2);
    expect(calls).toHaveLength(2);
    // the oak's far material learns the hand-over on its probe, as NearTrees.add does on the real one
    const oak = calls.map((c) => (c.root as THREE.InstancedMesh).material as THREE.ShaderMaterial).find((m) => m.defines.TREE_LOD === 1);
    expect(oak).toBeDefined();
    expect(w.pending(keys)).toHaveLength(2);
    // the same tile again (next frame) starts nothing new
    w.prepare(tile);
    expect(calls).toHaveLength(2);
    calls[0].done();
    await flush();
    expect(w.pending(keys)).toHaveLength(1);
    calls[1].done();
    await flush();
    expect(w.pending(keys)).toHaveLength(0);
    expect(w.compiled).toBe(2);
    // a later tile with a built variant mounts at once; whenReady resolves without a compile
    expect(w.prepare([tile[1]])).toHaveLength(0);
    await w.whenReady(tile);
    expect(calls).toHaveLength(2);
  });

  it("never holds a tile forever: a variant whose compile fails counts as done (it compiles as it's drawn)", async () => {
    const { r, calls } = fakeRenderer();
    const w = new ShaderWarm(r, new THREE.PerspectiveCamera(), new THREE.Scene());
    const tile = [tree({ wind: true })];
    const keys = w.prepare(tile);
    expect(keys).toHaveLength(1);
    calls[0].done(); // (three.js resolves once the program is ready or has failed)
    await flush();
    expect(w.pending(keys)).toHaveLength(0);
  });
});
