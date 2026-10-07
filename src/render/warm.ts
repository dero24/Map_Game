// Shaders compiled before they're first drawn. three.js builds a program the first time something
// draws with it, and on Windows (ANGLE over Direct3D 11) one of the paint shaders takes 0.15–1 s to
// build: a tile bringing a new tree variant, the first pond in view, each a freeze of a second or two
// (the shore's playtest on Robby's PC, 2026-10-06: 2.2 s while walking). Here they're built ahead —
// in parallel, off the main thread where the browser can (KHR_parallel_shader_compile) — and a tile
// mounts once its shaders are ready (world/stream.ts).
import * as THREE from 'three';
import { matFromTag, type PObj } from '../world/pack';

let rt: THREE.WebGLRenderTarget | null = null;

/** Compile every material under `root` as a frame draws it: into a render target. The watercolor
 *  post draws the scene into one, and three.js keys a program by where it draws — one built for the
 *  canvas (`renderer.compile` outside a frame) is never used. Resolves when they're all ready. */
export function compileForScene(renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene): Promise<unknown> {
  rt ??= new THREE.WebGLRenderTarget(1, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  // (compileAsync builds the programs now, synchronously; its promise only waits for them)
  try { return renderer.compileAsync(root, camera, scene ?? null); } finally { renderer.setRenderTarget(prev); }
}

/** What a tile object's program depends on: its kind (instanced, with colours), its attributes and
 *  its material's shader options — not its uniforms (a crown's size, an emissive colour). `far`: a
 *  tree mesh whose far material the near trees take over (TREE_LOD 1, world/nearTrees.ts). */
export function variantKey(p: PObj, far = false): string {
  const t = p.m;
  const m = t.t === 'prop' ? `prop${JSON.stringify({ ...t.o, crown: t.o.crown ? 1 : 0, emissive: t.o.emissive !== undefined ? 1 : 0 })}` : t.t === 'people' ? `people${t.seated ? 1 : 0}` : t.t;
  let a = '';
  for (const n in p.at) a += `${n}${p.at[n].n},`;
  return `${p.k}${p.ic ? 'c' : ''}|${a}|${m}${far ? '|far' : ''}`;
}

/** A tile's shader variants, compiled before it mounts. One probe a variant, kept for good: a
 *  one-instance object of the tile object's kind, attributes and material, so its program is the
 *  one the tile will draw with — and stays built after the last tile using it unloads. */
export class ShaderWarm {
  private done = new Set<string>();
  private jobs = new Map<string, Promise<void>>();
  private probes = new THREE.Group();
  private tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  /** A tile's tree mesh (by name) the near trees take over: its far material gets TREE_LOD 1. */
  farLod: ((name: string) => boolean) | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private camera: THREE.Camera, private scene: THREE.Scene) {
    this.probes.name = 'shader-probes';
  }
  get compiled() { return this.done.size; }
  /** Starts compiling what `objs` draw with that isn't built yet; returns the keys still compiling. */
  prepare(objs: readonly PObj[]): string[] {
    const out = new Set<string>();
    for (const p of objs) {
      const far = !!(p.n && this.farLod?.(p.n));
      const k = variantKey(p, far);
      if (this.done.has(k)) continue;
      if (!this.jobs.has(k)) this.jobs.set(k, this.compile(p, far, k));
      out.add(k);
    }
    return [...out];
  }
  /** Of `keys`, those still compiling. */
  pending(keys: readonly string[]): string[] { return keys.filter((k) => !this.done.has(k)); }
  /** Resolves once everything `objs` draw with is built. */
  whenReady(objs: readonly PObj[]): Promise<void> {
    return Promise.all(this.prepare(objs).map((k) => this.jobs.get(k))).then(() => undefined);
  }

  private compile(p: PObj, far: boolean, k: string): Promise<void> {
    const finish = () => { this.done.add(k); this.jobs.delete(k); };
    let o: THREE.Object3D;
    try { o = probe(p, far, this.tex); } catch (e) {
      console.warn('shader warm-up: no probe for', k, e);
      return Promise.resolve().then(finish); // (the tile still mounts: its shader compiles as it's drawn)
    }
    this.probes.add(o);
    return compileForScene(this.renderer, o, this.camera, this.scene).catch(() => undefined).then(finish);
  }
}

function probe(p: PObj, far: boolean, tex: THREE.Texture): THREE.Object3D {
  const g = new THREE.BufferGeometry();
  for (const n in p.at) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(3 * p.at[n].n), p.at[n].n));
  const mat = matFromTag(p.m, tex);
  const d = (mat as THREE.ShaderMaterial).defines;
  if (far && d && d.TREE_LOD !== 1) d.TREE_LOD = 1; // (as NearTrees.add sets it: appended, so the same key)
  if (p.k === 'inst') {
    const im = new THREE.InstancedMesh(g, mat, 1);
    if (p.ic) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
    return im;
  }
  return p.k === 'pts' ? new THREE.Points(g, mat) : p.k === 'lines' ? new THREE.LineSegments(g, mat) : new THREE.Mesh(g, mat);
}
