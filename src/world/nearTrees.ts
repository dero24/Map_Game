// The near trees: every tree a tile placed (props.ts, the `trees:<kind>:<v>` meshes) is drawn up
// close from its near model (assets/flora.ts nearTreeGeometry) — a trunk that flares and tapers,
// limbs and branches reaching into the crown, the crown a few large leaf-cluster cards with the sky
// between the leaves — and past the hand-over (about 30 m on a desktop) from the tile's own solid
// crowns, as before.
//
// The tile's far meshes stay as they are; this layer marks the trees it has taken (a per-instance
// `aNear` on each far mesh, the far material's TREE_LOD define), and for those the far crown gives
// way to the near model across a band of a few metres, the two splitting the pixels on one ordered
// dither by the same sum (propMaterial treeFarShare) — inside it the far tree folds away and draws
// nothing. A tree this layer hasn't taken (over the cap, a tile it was never told of) draws whole
// from its far mesh, so nothing ever goes missing.
//
// Every `step` m moved it re-sorts the mounted tiles' trees, nearest first, under the tier's cap
// (a phone: 40). The limbs are one instanced draw per model in use (a street's two or three
// species × variants); every leaf card of every near tree is one more (render/leafCards.ts).
//
// The leaf pictures are painted once, a picture a frame while the world boots (flora.ts
// leafAtlasJob); until they're done every tree draws from its far mesh.
import * as THREE from 'three';
import { NEAR_KINDS, TREE_KINDS, nearTreeLib, crownField, CARD_STRIDE, leafAtlasJob, fallHueOf, DECIDUOUS, treeMeta, type TreeKind } from '../assets/flora';
import { propMaterial, TREE_LOD_U, TREE_MASK_U } from '../render/propMaterial';
import { leafCardGeometry, leafCardMaterial, leafTexture, CARD_ATTRS } from '../render/leafCards';
import type { TreeTier } from '../render/quality';

/** A tile's far tree mesh this layer can take trees from. */
interface Far { im: THREE.InstancedMesh; kind: TreeKind; v: number; near: THREE.InstancedBufferAttribute; box: [number, number, number, number] }
/** Cards a near tree may have at most (flora.ts: 8–20 per crown). */
export const MAX_CARDS = 20;

/** Which trees are near, nearest first under the cap, and where the hand-over stands: when more
 *  trees are within reach than the cap allows, it comes in to keep a step and the band clear of the
 *  first tree left out (so a tree joins and leaves inside the band, never popping in closer). Pure:
 *  `d` the trees' distances (any order); returns the indices taken and the hand-over distance. */
export function pickNear(d: ArrayLike<number>, T: Pick<TreeTier, 'near' | 'hand' | 'band' | 'step'>): { take: number[]; hand: number } {
  const reach = T.hand + T.band / 2 + T.step + 0.5;
  const idx: number[] = [];
  for (let i = 0; i < d.length; i++) if (d[i] < reach) idx.push(i);
  idx.sort((a, b) => d[a] - d[b]);
  let hand = T.hand;
  if (idx.length > T.near) {
    hand = Math.max(0, Math.min(T.hand, d[idx[T.near]] - T.band / 2 - T.step - 0.5));
    idx.length = T.near;
  }
  return { take: idx, hand };
}

export class NearTrees {
  readonly group = new THREE.Group();
  private tiles = new Map<string, Far[]>();
  private wood = new Map<string, THREE.InstancedMesh>();
  private woodMat: THREE.ShaderMaterial;
  private cardGeo: THREE.InstancedBufferGeometry;
  private cardMat: THREE.ShaderMaterial | null = null;
  private cards: THREE.Mesh | null = null;
  private job: ReturnType<typeof leafAtlasJob> | null;
  private flagged: { a: THREE.InstancedBufferAttribute; i: number }[] = [];
  private lx = Infinity; private ly = Infinity; private lz = Infinity;
  private dirty = true;
  private last = 0;
  private grow = new Set<string>();
  private grown = new Set<string>();
  /** false: every tree from its far mesh (`?neartrees=0`) */
  enabled = true;
  /** 0: hand over by distance · 1 far models only · 2 near models only (within reach) — a comparison */
  mode: 0 | 1 | 2 = 0;
  readonly stats = { tiles: 0, trees: 0, cards: 0, models: 0, verts: 0, hand: 0, refillMs: 0, ready: false };

  constructor(readonly tier: TreeTier) {
    this.group.name = 'near-trees';
    this.woodMat = propMaterial({ wind: true, foliage: true, crown: [3, 1], treeLod: 'near' });
    this.cardGeo = leafCardGeometry(tier.near * MAX_CARDS);
    this.job = leafAtlasJob(tier.atlas);
  }

  /** A mounted tile: take note of its tree meshes (their far material learns the hand-over). */
  add(id: string, root: THREE.Object3D) {
    this.remove(id);
    const fars: Far[] = [];
    root.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !im.name.startsWith('trees:')) return;
      const [, kind, vs] = im.name.split(':');
      if (!NEAR_KINDS.has(kind as TreeKind)) return;
      const n = im.count, near = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      im.geometry.setAttribute('aNear', near);
      const mat = im.material as THREE.ShaderMaterial;
      if (mat.defines && mat.defines.TREE_LOD !== 1) { mat.defines.TREE_LOD = 1; mat.needsUpdate = true; }
      const e = im.instanceMatrix.array as Float32Array;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) { const x = e[i * 16 + 12], z = e[i * 16 + 14]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      fars.push({ im, kind: kind as TreeKind, v: +vs || 0, near, box: [x0, z0, x1, z1] });
      if (!this.grown.has(`${kind}:${+vs || 0}`)) this.grow.add(`${kind}:${+vs || 0}`);
    });
    if (fars.length) this.tiles.set(id, fars);
    this.dirty = true;
  }
  remove(id: string) {
    const f = this.tiles.get(id);
    if (!f) return;
    this.tiles.delete(id);
    // (its meshes may still draw a few frames while their replacement is revealed: whole, unmarked)
    const gone = new Set(f.map((q) => q.near));
    for (const e of this.flagged) if (gone.has(e.a)) (e.a.array as Float32Array)[e.i] = 0;
    for (const a of gone) a.needsUpdate = true;
    this.flagged = this.flagged.filter((e) => !gone.has(e.a));
    this.dirty = true;
  }
  refresh() { this.dirty = true; }

  /** The trees standing within r of (x, z), each its foot and its crown's reach (its model's crown
   *  radius × its scale) — every mounted tile's, shown yet or not: where a wood's canopy closes, the
   *  forest floor grows (understory.ts) and the lawn grass gives way (grass.ts). */
  crownsNear(x: number, z: number, r: number): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (const fars of this.tiles.values())
      for (const f of fars) {
        const b = f.box;
        if (f.kind === 'shrub' || b[0] - r > x || b[2] + r < x || b[1] - r > z || b[3] + r < z) continue;
        const e = f.im.instanceMatrix.array as Float32Array, cr = treeMeta(f.kind, f.v).crownR;
        for (let i = 0; i < f.im.count; i++) {
          const o = i * 16, tx = e[o + 12], tz = e[o + 14];
          if (Math.abs(tx - x) > r || Math.abs(tz - z) > r) continue;
          const sx = Math.hypot(e[o], e[o + 1], e[o + 2]);
          if (sx > 0) out.push({ x: tx, z: tz, r: cr * sx });
        }
      }
    return out;
  }

  /** The mask pass for the metrics: only the tree standing within r of (x, z), drawn flat — its
   *  leaves green, its wood red. off: everything as painted. */
  mask(on: boolean, x = 0, z = 0, r = 1) { TREE_MASK_U.value.set(x, z, r, on ? 1 : 0); }

  /** Per frame, with the camera's position in the region frame. */
  update(x: number, y: number, z: number) {
    // a species' near model is grown the first time a tile brings it, one a frame (a few ms each),
    // not all at once the moment you walk up to it
    for (const key of this.grow) {
      this.grow.delete(key);
      this.grown.add(key);
      const [kind, vs] = key.split(':');
      nearTreeLib(kind as TreeKind, +vs);
      break;
    }
    if (this.job) {
      // the leaf pictures, one a frame
      if (this.job.step()) {
        const tex = leafTexture(this.job.data, this.job.w, this.job.h);
        this.cardMat = leafCardMaterial(tex);
        this.cards = new THREE.Mesh(this.cardGeo, this.cardMat);
        this.cards.name = 'near-trees:cards';
        this.cards.frustumCulled = false; // (refilled round the walker: its bounds would always be stale)
        this.group.add(this.cards);
        this.job = null;
        this.stats.ready = true;
        this.dirty = true;
      }
    }
    const live = this.enabled && !!this.cards;
    TREE_LOD_U.value.z = live ? this.mode : 1;
    if (!live) { if (this.flagged.length) this.clear(); return; }
    const T = this.tier, now = performance.now();
    // (and twice a second regardless: a tile's meshes revealed a few at a time, a tree put away)
    if (!this.dirty && now - this.last < 500 && Math.hypot(x - this.lx, z - this.lz) < T.step && Math.abs(y - this.ly) < T.step) return;
    this.dirty = false;
    this.last = now;
    this.lx = x; this.ly = y; this.lz = z;
    this.refill(x, y, z);
  }

  private clear() {
    const touched = new Set<THREE.InstancedBufferAttribute>();
    for (const e of this.flagged) { (e.a.array as Float32Array)[e.i] = 0; touched.add(e.a); }
    for (const a of touched) a.needsUpdate = true;
    this.flagged = [];
    for (const m of this.wood.values()) (m.count = 0), (m.visible = false);
    this.cardGeo.instanceCount = 0;
  }

  private refill(cx: number, cy: number, cz: number) {
    const t0 = performance.now();
    const T = this.tier, reach = T.hand + T.band / 2 + T.step + 0.5;
    // every tree within reach of the eye
    const cand: { f: Far; i: number }[] = [], dist: number[] = [];
    let tiles = 0;
    for (const fars of this.tiles.values()) {
      tiles++;
      for (const f of fars) {
        const b = f.box;
        if (Math.max(b[0] - cx, 0, cx - b[2]) > reach || Math.max(b[1] - cz, 0, cz - b[3]) > reach) continue;
        if (!f.im.visible || (f.im.parent && !f.im.parent.visible)) continue;
        const e = f.im.instanceMatrix.array as Float32Array;
        for (let i = 0; i < f.im.count; i++) {
          const o = i * 16;
          if (e[o] === 0 && e[o + 1] === 0 && e[o + 2] === 0) continue; // (a tree put away)
          const d = Math.hypot(e[o + 12] - cx, e[o + 13] - cy, e[o + 14] - cz);
          if (d < reach) { cand.push({ f, i }); dist.push(d); }
        }
      }
    }
    const { take, hand } = pickNear(dist, T);
    TREE_LOD_U.value.x = hand;
    TREE_LOD_U.value.y = T.band;
    // the marks on the far meshes: last time's off, this time's on
    const touched = new Set<THREE.InstancedBufferAttribute>();
    for (const e of this.flagged) { (e.a.array as Float32Array)[e.i] = 0; touched.add(e.a); }
    this.flagged = take.map((k) => ({ a: cand[k].f.near, i: cand[k].i }));
    for (const e of this.flagged) { (e.a.array as Float32Array)[e.i] = 1; touched.add(e.a); }
    for (const a of touched) a.needsUpdate = true;

    // the limbs: one instanced draw per model, the far instance's own matrix
    const per = new Map<string, number[]>();
    for (const k of take) {
      const c = cand[k], key = `${c.f.kind}:${c.f.v}`;
      let l = per.get(key);
      if (!l) per.set(key, (l = []));
      l.push(k);
    }
    let verts = 0;
    for (const [key, m] of this.wood) if (!per.has(key)) (m.count = 0), (m.visible = false);
    for (const [key, list] of per) {
      const [kind, vs] = key.split(':'), model = nearTreeLib(kind as TreeKind, +vs);
      let m = this.wood.get(key);
      if (!m || m.instanceMatrix.count < list.length) {
        if (m) { this.group.remove(m); m.dispose(); }
        m = new THREE.InstancedMesh(model.wood, this.woodMat, Math.max(8, list.length * 2));
        m.name = `near-trees:wood:${key}`;
        m.frustumCulled = false;
        this.wood.set(key, m);
        this.group.add(m);
      }
      const dst = m.instanceMatrix.array as Float32Array;
      list.forEach((k, j) => {
        const c = cand[k], src = c.f.im.instanceMatrix.array as Float32Array;
        for (let q = 0; q < 16; q++) dst[j * 16 + q] = src[c.i * 16 + q];
      });
      m.count = list.length;
      m.visible = true;
      m.instanceMatrix.needsUpdate = true;
      verts += model.wood.getAttribute('position').count * list.length;
    }

    // the leaf cards
    const A = CARD_ATTRS.map((n) => (this.cardGeo.getAttribute(n) as THREE.InstancedBufferAttribute).array as Float32Array);
    const [aC, aD, aT, aK, aE] = A;
    let n = 0;
    const cap = aC.length / 4;
    for (const k of take) {
      const c = cand[k], e = c.f.im.instanceMatrix.array as Float32Array, o = c.i * 16;
      const model = nearTreeLib(c.f.kind, c.f.v), R = model.cards, [cyM, cRM] = crownField(model.meta);
      const sxz = Math.hypot(e[o], e[o + 1], e[o + 2]), sy = Math.hypot(e[o + 4], e[o + 5], e[o + 6]);
      const fx = e[o + 12], fy = e[o + 13], fz = e[o + 14];
      const col = c.f.im.instanceColor ? (c.f.im.instanceColor.array as Float32Array) : null;
      const r = col ? col[c.i * 3] : 0.35, g = col ? col[c.i * 3 + 1] : 0.45, b = col ? col[c.i * 3 + 2] : 0.25;
      const flags = (DECIDUOUS.has(c.f.kind) ? 1 : 0) + 2 * fallHueOf(c.f.kind, c.f.v) + (c.f.kind === 'cherry' ? 8 : 0);
      const seed = fract(Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453);
      // the crown's middle: the model's crown field, up its own axis
      const kx = e[o + 4] * cyM + fx, ky = e[o + 5] * cyM + fy, kz = e[o + 6] * cyM + fz;
      for (let q = 0; q + CARD_STRIDE <= R.length && n < cap; q += CARD_STRIDE, n++) {
        const x = R[q], y = R[q + 1], zz = R[q + 2];
        const wx = e[o] * x + e[o + 4] * y + e[o + 8] * zz + fx, wy = e[o + 1] * x + e[o + 5] * y + e[o + 9] * zz + fy, wz = e[o + 2] * x + e[o + 6] * y + e[o + 10] * zz + fz;
        aC.set([wx, wy, wz, R[q + 3] * sxz], n * 4);
        aD.set([R[q + 4] * (sy / Math.max(1e-3, sxz)), fract(R[q + 5] + seed), R[q + 6], R[q + 7]], n * 4);
        aT.set([fx, fy, fz, Math.max(y - 1.5, 0) * 0.012 * sxz], n * 4);
        aK.set([kx, ky, kz, cRM * sxz], n * 4);
        aE.set([r, g, b, flags], n * 4);
      }
    }
    for (const nm of CARD_ATTRS) {
      const a = this.cardGeo.getAttribute(nm) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      if (n) a.addUpdateRange(0, n * 4);
      a.needsUpdate = n > 0;
    }
    this.cardGeo.instanceCount = n;
    const st = this.stats;
    st.tiles = tiles; st.trees = take.length; st.cards = n; st.models = per.size; st.verts = verts + n * 4; st.hand = hand;
    st.refillMs = performance.now() - t0;
  }

  dispose() {
    this.clear();
    for (const m of this.wood.values()) m.dispose();
    this.woodMat.dispose();
    this.cardGeo.dispose();
    this.cardMat?.dispose();
    (this.cardMat?.uniforms.uLeaf.value as THREE.Texture | undefined)?.dispose();
  }
}

const fract = (x: number) => x - Math.floor(x);
/** The kinds a near model exists for, in TREE_KINDS order (for tools). */
export const nearKinds = () => TREE_KINDS.filter((k) => NEAR_KINDS.has(k));
