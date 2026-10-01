import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NearTrees, pickNear, MAX_CARDS } from '../src/world/nearTrees';
import { TREE_TIERS } from '../src/render/quality';
import { farShare, TREE_LOD_U, propMaterial } from '../src/render/propMaterial';
import { treeLib, treeMeta, crownField, nearTreeLib, CARD_STRIDE } from '../src/assets/flora';

// a tile's tree meshes as props.ts names and lays them out: one far mesh per species × variant
function tile(trees: { kind: string; v: number; x: number; z: number; s?: number }[]) {
  const g = new THREE.Group(), by = new Map<string, typeof trees>();
  for (const t of trees) {
    const k = `${t.kind}:${t.v}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(t);
  }
  for (const [k, list] of by) {
    const [kind, v] = k.split(':');
    const im = new THREE.InstancedMesh(treeLib(kind as 'round', +v).clone(), propMaterial({ wind: true, foliage: true, crown: crownField(treeMeta(kind as 'round', +v)) }), list.length);
    im.name = `trees:${k}`;
    list.forEach((t, i) => {
      im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s ?? 1, t.s ?? 1, t.s ?? 1)));
      im.setColorAt(i, new THREE.Color(0x5f7f3a));
    });
    g.add(im);
  }
  return g;
}
const ready = (l: NearTrees) => { for (let i = 0; i < 20 && !l.stats.ready; i++) l.update(1e6, 0, 1e6); };

describe('near trees: which trees, where the hand-over stands', () => {
  it('the far and near shares split every pixel: far 0 inside, 1 past the band', () => {
    expect(farShare(10, 30, 6)).toBe(0);
    expect(farShare(27, 30, 6)).toBe(0);
    expect(farShare(30, 30, 6)).toBeCloseTo(0.5, 5);
    expect(farShare(33, 30, 6)).toBe(1);
    expect(farShare(80, 30, 6)).toBe(1);
  });
  it('nearest first under the cap; over it, the hand-over comes in clear of the first left out', () => {
    const T = { near: 3, hand: 30, band: 6, step: 2 };
    const d = [50, 4, 12, 31, 8, 20, 36.5];
    const a = pickNear(d, T);
    expect(a.take).toEqual([1, 4, 2]);
    // the fourth nearest (20 m) is left out: it must be past the band and a step's walk
    expect(a.hand + T.band / 2 + T.step + 0.5).toBeLessThanOrEqual(20 + 1e-9);
    // under the cap: everything within reach, the hand-over where the tier puts it
    const b = pickNear(d, { ...T, near: 10 });
    expect(b.take).toEqual([1, 4, 2, 5, 3]);
    expect(b.hand).toBe(30);
  });
});

describe('the near-tree layer', () => {
  it('takes the trees round the eye, nearest first under the phone cap, in one draw per model and one for every card', () => {
    const T = { ...TREE_TIERS.phone, atlas: 32 };
    const l = new NearTrees(T);
    const trees: { kind: string; v: number; x: number; z: number }[] = [];
    // a park: 90 trees on a 6 m grid, three species × two variants
    for (let i = 0; i < 90; i++) trees.push({ kind: ['round', 'oak', 'maple'][i % 3], v: i % 2, x: (i % 10) * 6 - 27, z: Math.floor(i / 10) * 6 - 24 });
    // and a palm, which keeps its far model at every distance
    trees.push({ kind: 'palm', v: 0, x: 1, z: 1 });
    const g = tile(trees);
    l.add('t', g);
    ready(l);
    l.update(0, 1.6, 0);
    expect(l.stats.trees).toBe(T.near); // the cap binds in a park
    expect(l.stats.hand).toBeLessThanOrEqual(T.hand);
    // the draws: the models in use (3 species × 2 variants) and one for the cards — not one a tree
    const draws = l.group.children.filter((o) => o.visible && ((o as THREE.InstancedMesh).count > 0 || (o as THREE.Mesh).geometry instanceof THREE.InstancedBufferGeometry));
    expect(draws.length).toBe(6 + 1);
    expect(l.stats.cards).toBeLessThanOrEqual(T.near * MAX_CARDS);
    // the taken trees are marked on their far meshes; the palm never is, and its material is as it was
    let marked = 0;
    g.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh) return;
      const a = im.geometry.getAttribute('aNear');
      if (im.name.startsWith('trees:palm')) { expect(a).toBeUndefined(); expect((im.material as THREE.ShaderMaterial).defines.TREE_LOD).toBeUndefined(); return; }
      expect((im.material as THREE.ShaderMaterial).defines.TREE_LOD).toBe(1);
      for (let i = 0; i < a.count; i++) marked += a.getX(i);
    });
    expect(marked).toBe(T.near);
    // the marked ones are the nearest: nothing unmarked is nearer than anything marked
    const dist: { d: number; m: number }[] = [];
    g.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || im.name.startsWith('trees:palm')) return;
      const a = im.geometry.getAttribute('aNear'), e = im.instanceMatrix.array;
      for (let i = 0; i < im.count; i++) dist.push({ d: Math.hypot(e[i * 16 + 12], e[i * 16 + 13] - 1.6, e[i * 16 + 14]), m: a.getX(i) });
    });
    const farthestMarked = Math.max(...dist.filter((q) => q.m).map((q) => q.d)), nearestUnmarked = Math.min(...dist.filter((q) => !q.m).map((q) => q.d));
    expect(farthestMarked).toBeLessThanOrEqual(nearestUnmarked);
    // walk away: nobody near, nothing marked, nothing drawn
    l.update(5000, 1.6, 5000);
    expect(l.stats.trees).toBe(0);
    expect(l.stats.cards).toBe(0);
    // and every card stands where its tree's model puts it (the round tree at the origin's grid)
    l.update(-27, 1.6, -24);
    const C = (l.group.children.find((o) => o.name === 'near-trees:cards') as THREE.Mesh).geometry as THREE.InstancedBufferGeometry;
    const aC = C.getAttribute('aC') as THREE.InstancedBufferAttribute, aT = C.getAttribute('aT') as THREE.InstancedBufferAttribute;
    const m = nearTreeLib('round', 0), first = [...Array(C.instanceCount).keys()].find((i) => aT.getX(i) === -27 && aT.getZ(i) === -24)!;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(aC.getX(first)).toBeCloseTo(-27 + m.cards[0], 4);
    expect(aC.getY(first)).toBeCloseTo(m.cards[1], 4);
    expect(aC.getW(first)).toBeCloseTo(m.cards[3], 4);
    expect(m.cards.length / CARD_STRIDE).toBeLessThanOrEqual(MAX_CARDS);
  });
  it('a tile it is told to forget takes its marks with it; ?neartrees=0 marks nothing', () => {
    const l = new NearTrees({ ...TREE_TIERS.desktop, atlas: 32 });
    const g = tile([{ kind: 'oak', v: 1, x: 3, z: 4 }]);
    l.add('a', g);
    ready(l);
    l.update(0, 1.6, 0);
    expect(l.stats.trees).toBe(1);
    expect(TREE_LOD_U.value.z).toBe(0);
    l.remove('a');
    l.update(0.1, 1.6, 0); // (a removal re-sorts at once)
    expect(l.stats.trees).toBe(0);
    l.add('a', g);
    l.enabled = false;
    l.update(0, 1.6, 0);
    expect(TREE_LOD_U.value.z).toBe(1); // (far only: the marks are cleared too)
    const a = (g.children[0] as THREE.InstancedMesh).geometry.getAttribute('aNear');
    expect(a.getX(0)).toBe(0);
  });
});
