// The far woods' make-up: the forest past the trees — the far ring's canopy (ground.ts CANOPY) and the
// wooded ridges past it (horizon.ts) — drawn without a tree, so what it is made of comes from here: the
// share of a wood's crowns whose leaves colour and fall, and the hues they turn (flora.ts FALL_HUE). It
// is the trees' own mix, as props.ts scatters a wood: the region's weights (look.trees — a round or an
// oak broadleaf, a shrub under them, a pine or a spruce), each read again as the region's own (props.ts
// regional: its conifers, its broadleaves, the North's birches, the West's aspens, the tropics' palms) —
// so the forest past the trees turns and goes bare with the trees in front of it (render/treeSeasons.ts).
//
// Which mix: the trees the walker has about them (WoodsTally — every mounted tile's crowns, kind by
// kind), as soon as there are enough of them; the region's (farWoods) before. A wood the survey measured
// is mostly its slim crowns' conifers (props.ts: a slim measured crown is a conifer where the region
// grows them) — the Adirondacks' around Lake Placid nine in ten — which the region's mix can't know.
import type * as THREE from 'three';
import { broadMix, aspenShare, DECIDUOUS, fallHueOf, type TreeKind } from '../assets/flora';
import { castOf, type RegionStyle } from './styles';

export interface FarWoods {
  /** 0..1 the share of a wood's crowns whose leaves colour and fall (the rest keep theirs) */
  decid: number;
  /** what those turn: the share of each fall hue (flora.ts FALL_HUE 0–7 — 0 mixed, 1 red, 2 gold, 3 drab,
   *  4 the sweetgum's jewels, 5 the buckeye's early orange, 6 russet), summing to 1 */
  hues: number[];
}

/** A wood's crowns here, kind by kind, as props.ts's scan grows them away from the water and the coast
 *  (its shrubs left out: they stand under the canopy, not in it). `elev`, `lat`: where (the aspens' band). */
export function woodsMix(look: RegionStyle, elev = 0, lat = 40): Map<TreeKind | 'conifer', number> {
  const cast = castOf(look), [round, oak, , pine, spruce] = look.trees;
  const mix = new Map<TreeKind | 'conifer', number>();
  const add = (k: TreeKind | 'conifer', w: number) => { if (w > 0) mix.set(k, (mix.get(k) ?? 0) + w); };
  add('conifer', pine + spruce); // (a scan's pine or spruce is the region's conifer: every one keeps its needles)
  const broad = broadMix(cast), bsum = broad.reduce((s, [, w]) => s + w, 0);
  const desert = look.climate === 'arid', birchy = look.climate === 'boreal' || look.climate === 'continental';
  for (const [k0, w0] of [['round', round], ['oak', oak]] as [TreeKind, number][]) {
    let w = w0;
    if (!(w > 0)) continue;
    // (the West's aspen groves, the north woods': a share of the round picks)
    if (k0 === 'round') { const a = Math.min(1, aspenShare(cast, elev, lat) * 1.4) * 0.85; add('aspen', w * a); w *= 1 - a; }
    // (the tropics' palms; the desert's own trees — its mesquite and palo verde, a Great Basin town's
    // shade trees the odd one)
    if (look.climate === 'tropical') { add('palm', w * 0.75); w *= 0.25; }
    if (desert) { add('mesquite', w * (cast.eco === 'great-basin' ? 0.86 : 1)); w *= cast.eco === 'great-basin' ? 0.14 : 0; }
    if (birchy && k0 === 'round') { add('birch', w * 0.35); w *= 0.65; }
    // (props.ts broad: a pick keeps its own kind one time in three, else it's one of the region's)
    let keep = w * 0.35;
    // (a westside wood is conifer country — and the north coast's redwood country: most of the round
    // and oak picks a conifer)
    if (cast.west) { add('conifer', keep * 0.7); keep *= 0.3; }
    else if (cast.eco === 'california' && cast.l3 === 1) { add('conifer', keep * 0.6); keep *= 0.4; }
    add(k0, keep);
    if (bsum > 0) for (const [k, bw] of broad) add(k, (w * 0.65 * bw) / bsum);
    else add(k0, w * 0.65);
  }
  return mix;
}

/** A make-up from crowns counted kind by kind and form by form ([kind, how many, form]: a form its own
 *  fall hue — the westside's bigleaf maple gold, the swamp tupelo scarlet). */
function makeUp(mix: Iterable<[TreeKind | 'conifer', number, number]>): FarWoods & { n: number } {
  const hues = new Array<number>(8).fill(0);
  let all = 0, decid = 0;
  for (const [k, w, v] of mix) {
    all += w;
    if (k === 'conifer' || !DECIDUOUS.has(k)) continue;
    const hue = fallHueOf(k, v);
    if (hue > 7) continue; // (the ocotillo's leaves come and go with the rain: no wood's)
    decid += w;
    hues[hue] += w;
  }
  if (!(decid > 0)) return { decid: 0, hues: [1, 0, 0, 0, 0, 0, 0, 0], n: all };
  return { decid: decid / all, hues: hues.map((h) => h / decid), n: all };
}

/** The far woods' make-up here, by the region's mix: see FarWoods. */
export function farWoods(look: RegionStyle, elev = 0, lat = 40): FarWoods {
  const west = castOf(look).west;
  // (a westside maple is the bigleaf, gold in the fall — props.ts — and the East's sugar and red maples scarlet)
  const { decid, hues } = makeUp([...woodsMix(look, elev, lat)].map(([k, w]) => [k, w, k === 'maple' && west ? 2 : 0] as [TreeKind | 'conifer', number, number]));
  return { decid, hues };
}

/** What never stands in a wood's canopy: the shrubs and the small trees under it (the dogwood and the
 *  redbud flower under the April woods; the rosebay's laurel hells), the desert's low plants, the dead. */
const UNDER = new Set<string>(['shrub', 'willowshrub', 'sawpalmetto', 'rosebay', 'kudzu', 'sagebrush', 'creosote', 'pricklypear', 'cholla', 'dogwood', 'redbud', 'crapemyrtle', 'manzanita', 'snag']);

/** The crowns about the walker: each mounted tile's tree meshes (`trees:<kind>:<form>`, props.ts),
 *  kind by kind and form by form — those standing in a wood (`inWood`, the ground's cover: a town's
 *  street and yard trees are its own, not the forest's) — each weighed by what of it shows over the
 *  wood: its crown's spread times its height (its far model's bounds, scaled as it stands). A wood seen
 *  from afar is its tallest crowns: the Adirondacks' white pines stand 25 m over 10 m maples and birches,
 *  so a wood of six broadleaves in ten by count shows three in ten. */
export class WoodsTally {
  private tiles = new Map<string, Map<string, { n: number; w: number }>>();
  /** bumped on every change: the far woods re-read when it moves */
  version = 0;
  add(id: string, root: THREE.Object3D, inWood: (x: number, z: number) => boolean = () => true) {
    const m = new Map<string, { n: number; w: number }>();
    root.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !im.name.startsWith('trees:')) return;
      const [, kind, vs] = im.name.split(':');
      if (UNDER.has(kind) || !(im.count > 0)) return;
      const g = im.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!, H = b.max.y - b.min.y, R = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
      if (!(H > 0 && R > 0)) return;
      const e = im.instanceMatrix.array as Float32Array;
      let n = 0, w = 0;
      for (let i = 0; i < im.count; i++) {
        const o = i * 16, sx = Math.hypot(e[o], e[o + 1], e[o + 2]);
        // (a tree folded away — scaled to nothing — isn't there)
        if (!(sx > 0) || !inWood(e[o + 12], e[o + 14])) continue;
        n++;
        w += (R * sx) ** 2 * H * Math.hypot(e[o + 4], e[o + 5], e[o + 6]);
      }
      if (!n) return;
      const key = `${kind}:${+vs || 0}`, c = m.get(key) ?? { n: 0, w: 0 };
      c.n += n;
      c.w += w;
      m.set(key, c);
    });
    if (m.size || this.tiles.has(id)) { this.tiles.set(id, m); this.version++; }
  }
  remove(id: string) { if (this.tiles.delete(id)) this.version++; }
  /** Their make-up (n: how many crowns). */
  woods(): FarWoods & { n: number } {
    const sum = new Map<string, { n: number; w: number }>();
    let n = 0;
    for (const m of this.tiles.values())
      for (const [k, c] of m) {
        const s = sum.get(k) ?? { n: 0, w: 0 };
        s.n += c.n;
        s.w += c.w;
        sum.set(k, s);
        n += c.n;
      }
    const { decid, hues } = makeUp([...sum].map(([key, c]) => { const [kind, v] = key.split(':'); return [kind as TreeKind, c.w, +v || 0]; }));
    return { decid, hues, n };
  }
}

/** The far woods: the trees about the walker once there are a few hundred of them (`seen`), the
 *  region's mix (`prior`) before — weighed one against the other as they come in. */
export function blendWoods(prior: FarWoods, seen: FarWoods & { n: number }, half = 300): FarWoods {
  const w = seen.n / (seen.n + half), a = (1 - w) * prior.decid, b = w * seen.decid;
  const decid = a + b;
  if (!(decid > 0)) return { decid: 0, hues: prior.hues.slice() };
  return { decid, hues: prior.hues.map((h, i) => (a * h + b * seen.hues[i]) / decid) };
}
