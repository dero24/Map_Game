// Flora — trees and garden plants from genomes (docs/ASSET_FOUNDRY.md §Flora).
//
// A species is a *growth form* (how the plant is built) plus parameters (sizes, colours, counts).
// Each species has a few grown variants (seed 0..V-1) so a street of oaks isn't a row of clones,
// and garden plants have growth stages 0..STAGES-1 (sprout → leafy → in bloom) so a seed you plant
// visibly grows. Counts come from Fibonacci numbers and organs sit at the golden angle, the way
// real plants pack them. Foliage is TINT (white): the instance colour paints it in the region's
// greens; bark and blossoms carry their own colours.
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { TINT, P, part, merge, limb, tube, blob, card, lathe, fibSphere, fibCount, taper, GOLDEN, cached, bounds } from './core';
import type { EcoRegion } from '../world/ecoregions';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BARK = 0x6b5a48, BARK_DARK = 0x5d4a3a, BIRCH = 0xe4dfd2, PALM = 0x8a7458, MESQ = 0x4f4034, PALOVERDE = 0x8f9c5a;
// the Northwest's barks: Douglas fir's thick furrowed grey-brown, the hemlock's, the Sitka spruce's grey
// scales, the redcedar's stringy red-brown, the alder's pale grey blotched with lichen, the vine maple's
// green-brown stems; a dead top or stub silvered; the moss that hangs from the limbs and the licorice
// fern growing in it
const FIR_BARK = 0x5b4a3c, HEMLOCK_BARK = 0x5f4b3f, SITKA_BARK = 0x787168, CEDAR_BARK = 0x7a4f3a, ALDER_BARK = 0xc4bfb3, VINE_BARK = 0x6a6a46, SNAG = 0x9e978b, MOSS = 0x8a9a46, LICORICE = 0x5a8a36;

// ================================================================ trees
// Index order matches the region style table's `trees` weights (styles.ts) and the old kinds.
export type TreeKind = 'round' | 'oak' | 'shrub' | 'pine' | 'spruce' | 'palm' | 'birch' | 'mesquite' | 'fanpalm' | 'maple' | 'willow' | 'elm' | 'poplar' | 'magnolia' | 'cherry' | 'fir' | 'cedar' | 'hemlock' | 'sitka' | 'alder' | 'vinemaple' | 'liveoak' | 'plateauoak' | 'coastoak'
  | 'whitepine' | 'ponderosa' | 'lodgepole' | 'redspruce' | 'balsamfir' | 'engelmann' | 'subalpinefir' | 'easthemlock' | 'aspen' | 'willowshrub' | 'snag'
  | 'tuliptree' | 'sweetgum' | 'hickory' | 'buckeye' | 'sycamore' | 'buroak' | 'dogwood' | 'redbud' | 'crapemyrtle' | 'loblolly' | 'longleaf' | 'slashpine' | 'redcedar' | 'rosebay';
/** (New kinds go on the end: a kind's index is in the tiles' instance names and the region weights.) */
export const TREE_KINDS: TreeKind[] = ['round', 'oak', 'shrub', 'pine', 'spruce', 'palm', 'birch', 'mesquite', 'fanpalm', 'maple', 'willow', 'elm', 'poplar', 'magnolia', 'cherry', 'fir', 'cedar', 'hemlock', 'sitka', 'alder', 'vinemaple', 'liveoak', 'plateauoak', 'coastoak',
  'whitepine', 'ponderosa', 'lodgepole', 'redspruce', 'balsamfir', 'engelmann', 'subalpinefir', 'easthemlock', 'aspen', 'willowshrub', 'snag',
  // (package #4: the eastern hardwoods, the flowering understory, the southern pines)
  'tuliptree', 'sweetgum', 'hickory', 'buckeye', 'sycamore', 'buroak', 'dogwood', 'redbud', 'crapemyrtle', 'loblolly', 'longleaf', 'slashpine', 'redcedar', 'rosebay'];
/** The live oaks (liveoak†): the South's, the Hill Country's plateau oak, California's coast live oak. */
export const LIVE_OAKS = new Set<TreeKind>(['liveoak', 'plateauoak', 'coastoak']);
/** The southern pines (package #4): their long needles in fat, brushy tufts up close. */
export const SOUTHERN_PINES = new Set<TreeKind>(['loblolly', 'longleaf', 'slashpine']);
/** The conifers that wear needle tufts up close (the cedars wear their own flat sprays). */
export const NEEDLED = new Set<TreeKind>(['pine', 'spruce', 'fir', 'hemlock', 'sitka', 'whitepine', 'ponderosa', 'lodgepole', 'redspruce', 'balsamfir', 'engelmann', 'subalpinefir', 'easthemlock', 'loblolly', 'longleaf', 'slashpine']);
/** How each tree turns (propMaterial, leafCards; the GLSL is treeSeasons.ts fallColour): 0 mixed, 1 red
 *  (maples, cherries, the vine maple, the dogwood's burgundy), 2 gold, 3 drab (the alder's leaves fall
 *  near green, an olive brown), 4 jewel (the sweetgum: purple, red, orange and yellow on one tree,
 *  lobe by lobe, late), 5 orange and early (the buckeye: first to turn, bare by October), 6 russet
 *  (the bur oak's brown, the sycamore's tan, late) — and 7 an evergreen that bronzes in the cold (the
 *  redcedar, the rosebay's curled winter leaves). */
export const FALL_HUE: Partial<Record<TreeKind, number>> = { maple: 1, cherry: 1, willow: 2, elm: 2, poplar: 2, birch: 2, vinemaple: 1, alder: 3, aspen: 2, willowshrub: 2,
  tuliptree: 2, sweetgum: 4, hickory: 2, buckeye: 5, sycamore: 6, buroak: 6, dogwood: 1, redbud: 2, redcedar: 7, rosebay: 7 };
/** How a grown variant turns: the bigleaf maple (maple variant 2) goes gold, not scarlet. */
export const fallHueOf = (k: TreeKind, v: number) => (k === 'maple' && v === 2 ? 2 : FALL_HUE[k] ?? 0);
/** Broadleaves that colour and drop their leaves (magnolias and the palms keep theirs). */
export const DECIDUOUS = new Set<TreeKind>(['round', 'oak', 'birch', 'shrub', 'maple', 'willow', 'elm', 'poplar', 'cherry', 'alder', 'vinemaple', 'aspen', 'willowshrub',
  'tuliptree', 'sweetgum', 'hickory', 'buckeye', 'sycamore', 'buroak', 'dogwood', 'redbud', 'crapemyrtle']);
/** What each flowering tree blooms as (propMaterial BLOSSOM, the cards' bloom bits; the GLSL is
 *  treeSeasons.ts bloomNow / bloomColour): 1 the cherry's pink cloud in April, 2 the dogwood's white bracts
 *  on its tiers (one in six pink), 3 the redbud's magenta along its bare twigs in March, 4 the crape
 *  myrtle's summer cones (each tree pink, watermelon red, lavender or white), 5 the rosebay's white-pink
 *  trusses in June. */
export const BLOSSOM_OF: Partial<Record<TreeKind, number>> = { cherry: 1, dogwood: 2, redbud: 3, crapemyrtle: 4, rosebay: 5 };
/** How each tree's leaves move besides the crown's sway (propMaterial MOTION, the cards' motion
 *  bits): 1 the aspen's leaves trembling on flat stalks, 2 the dogwood's flat tiers bobbing, each tier
 *  on its own beat, 3 the longleaf's long needles tossing (its grass stage a shivering fountain). */
export const MOTION_OF: Partial<Record<TreeKind, number>> = { aspen: 1, dogwood: 2, longleaf: 3 };
/** A standing dead tree: wood only (no leaves, no near model). */
export const LEAFLESS = new Set<TreeKind>(['snag']);
/** The leaf cards' flags (world/nearTrees.ts → render/leafCards.ts aE.w): 1 a broadleaf whose leaves
 *  fall, + 2 × its fall hue (3 bits, 0–7), + 16 × its blossom (3 bits, 0–5), + 128 × its motion (0–3).
 *  Exact in a float; the shader takes it apart the same way (unpackCardFlags). */
export const packCardFlags = (f: { falls: boolean; hue: number; bloom: number; motion: number }) => (f.falls ? 1 : 0) + 2 * (f.hue & 7) + 16 * (f.bloom & 7) + 128 * (f.motion & 3);
export const unpackCardFlags = (x: number) => ({ falls: x % 2 === 1, hue: Math.floor(x / 2) % 8, bloom: Math.floor(x / 16) % 8, motion: Math.floor(x / 128) % 4 });
/** A tree's card flags. */
export const cardFlags = (k: TreeKind, v: number) => packCardFlags({ falls: DECIDUOUS.has(k), hue: fallHueOf(k, v), bloom: BLOSSOM_OF[k] ?? 0, motion: MOTION_OF[k] ?? 0 });
export const TREE_VARIANTS = 3;
/** `lean`: the trunk's horizontal drift per metre of height (model space) — where the bark is. */
export interface TreeMeta { h: number; crownR: number; crownBottom: number; trunkR: number; lean: [number, number] }
/** The grown plan behind a tree's model: every piece of wood (from → to, radius at each end, bark)
 *  and every crown lobe (its middle, radius and squash), in the order the recipe grew them. The far
 *  model is drawn from it as solid lobes; the near one (nearTreeGeometry) grows its limbs and leaf
 *  cards from the same plan, so the two stand in the same place with the same crown. */
export interface Bough { a: THREE.Vector3; b: THREE.Vector3; r0: number; r1: number; col: number }
export interface Lobe { c: THREE.Vector3; r: number; sq: number }
/** `hang`: what hangs from and grows on the limbs (moss beards, licorice fern), already coloured —
 *  drawn by both models as it is. */
export interface TreePlan { boughs: Bough[]; lobes: Lobe[]; hang: THREE.BufferGeometry[] }

/** The Northwest conifers' three grown forms each (treeGeometry): the model's height (it is scaled to
 *  the real tree), the bare trunk's share of it, the boughs' reach at the crown's foot and top, the
 *  boughs to a tier (≤ 19 clumps and the leader: a near tree has at most 20 cards), the trunk, the
 *  bark; how a bough rises and droops, a clump's size (× its bough) and squash, how irregular; the
 *  buttresses at the foot, dead stubs on the bare trunk, the top (a spire, a nodding leader, a broken
 *  top, a candelabra of dead spikes), J-shaped boughs, stilt roots. v0 grown in the open (foliage near
 *  the ground), v1 in the forest, v2 old. */
type Spire = { H: number; bare: number; R0: number; Rt: number; rings: number[]; trunkR: number; bark: number; lift: number; droop: number; lobe: number; sq: number; stretch: number; bend: number; jit: number; buttress: number; stubs: number; top: 'spire' | 'nod' | 'broken' | 'snag'; j?: boolean; stilts?: boolean };
// the northern and mountain conifers' barks: the eastern hemlock's furrowed cinnamon-brown, red
// spruce's grey-brown scales, balsam fir's smooth grey with its resin blisters, Engelmann spruce's thin
// russet scales, subalpine fir's pale grey
const EHEMLOCK_BARK = 0x5a4636, RSPRUCE_BARK = 0x6a5a4a, BALSAM_BARK = 0x857d70, ENGELMANN_BARK = 0x72604e, SUBALPINE_BARK = 0x8c867a;
type SpireKind = 'fir' | 'hemlock' | 'sitka' | 'cedar' | 'easthemlock' | 'redspruce' | 'balsamfir' | 'engelmann' | 'subalpinefir';
const SPIRES: Record<SpireKind, Spire[]> = {
  fir: [
    { H: 12.2, bare: 0.12, R0: 2.6, Rt: 0.3, rings: [3, 3, 3, 2, 2, 2, 2, 1], trunkR: 0.24, bark: FIR_BARK, lift: 0.2, droop: 0.2, lobe: 0.5, sq: 0.62, stretch: 1.3, bend: 0.45, jit: 0.35, buttress: 0, stubs: 0, top: 'spire' },
    { H: 12.8, bare: 0.42, R0: 2.0, Rt: 0.3, rings: [3, 3, 2, 2, 2, 2, 1, 1], trunkR: 0.24, bark: FIR_BARK, lift: 0.2, droop: 0.22, lobe: 0.52, sq: 0.62, stretch: 1.3, bend: 0.5, jit: 0.42, buttress: 0, stubs: 4, top: 'spire' },
    { H: 12.6, bare: 0.5, R0: 2.4, Rt: 1.0, rings: [3, 3, 2, 2, 2, 2, 1], trunkR: 0.28, bark: FIR_BARK, lift: 0.12, droop: 0.28, lobe: 0.52, sq: 0.6, stretch: 1.35, bend: 0.55, jit: 0.45, buttress: 3, stubs: 3, top: 'broken' },
  ],
  hemlock: [
    { H: 12.0, bare: 0.12, R0: 2.2, Rt: 0.25, rings: [3, 3, 2, 2, 2, 2, 2, 1], trunkR: 0.2, bark: HEMLOCK_BARK, lift: 0.08, droop: 0.4, lobe: 0.5, sq: 0.62, stretch: 1.25, bend: 0.7, jit: 0.2, buttress: 0, stubs: 0, top: 'nod' },
    { H: 12.4, bare: 0.38, R0: 1.9, Rt: 0.25, rings: [3, 2, 2, 2, 2, 2, 1, 1], trunkR: 0.2, bark: HEMLOCK_BARK, lift: 0.08, droop: 0.4, lobe: 0.52, sq: 0.62, stretch: 1.25, bend: 0.7, jit: 0.22, buttress: 0, stubs: 3, top: 'nod' },
    { H: 12.6, bare: 0.4, R0: 1.9, Rt: 0.25, rings: [3, 2, 2, 2, 2, 2, 1, 1], trunkR: 0.2, bark: HEMLOCK_BARK, lift: 0.08, droop: 0.4, lobe: 0.52, sq: 0.62, stretch: 1.25, bend: 0.7, jit: 0.22, buttress: 0, stubs: 2, top: 'nod', stilts: true },
  ],
  sitka: [
    { H: 12.4, bare: 0.17, R0: 2.8, Rt: 0.35, rings: [3, 3, 3, 2, 2, 2, 1], trunkR: 0.26, bark: SITKA_BARK, lift: 0.04, droop: 0.32, lobe: 0.52, sq: 0.72, stretch: 1.35, bend: 0.6, jit: 0.25, buttress: 3, stubs: 0, top: 'spire' },
    { H: 12.8, bare: 0.38, R0: 2.6, Rt: 0.35, rings: [3, 3, 2, 2, 2, 1], trunkR: 0.27, bark: SITKA_BARK, lift: 0.04, droop: 0.32, lobe: 0.54, sq: 0.72, stretch: 1.35, bend: 0.6, jit: 0.28, buttress: 4, stubs: 2, top: 'spire' },
    { H: 12.9, bare: 0.42, R0: 3.0, Rt: 0.8, rings: [3, 3, 2, 2, 2, 1], trunkR: 0.3, bark: SITKA_BARK, lift: 0.04, droop: 0.34, lobe: 0.52, sq: 0.72, stretch: 1.4, bend: 0.65, jit: 0.32, buttress: 4, stubs: 2, top: 'broken' },
  ],
  cedar: [
    { H: 11.8, bare: 0.1, R0: 2.9, Rt: 0.3, rings: [3, 3, 3, 2, 2, 2, 1], trunkR: 0.27, bark: CEDAR_BARK, lift: 0, droop: 0, lobe: 0.5, sq: 0.8, stretch: 1.3, bend: 0.65, jit: 0.25, buttress: 4, stubs: 0, top: 'nod', j: true },
    { H: 12.4, bare: 0.3, R0: 2.4, Rt: 0.3, rings: [3, 3, 2, 2, 2, 1], trunkR: 0.27, bark: CEDAR_BARK, lift: 0, droop: 0, lobe: 0.52, sq: 0.8, stretch: 1.3, bend: 0.65, jit: 0.25, buttress: 4, stubs: 2, top: 'nod', j: true },
    { H: 12.8, bare: 0.28, R0: 2.5, Rt: 0.7, rings: [3, 3, 2, 2, 2, 2], trunkR: 0.29, bark: CEDAR_BARK, lift: 0, droop: 0, lobe: 0.52, sq: 0.8, stretch: 1.3, bend: 0.65, jit: 0.28, buttress: 4, stubs: 1, top: 'snag', j: true },
  ],
  // (package #3, the northern and mountain conifers) Eastern hemlock: broader and denser than the
  // western, its boughs level with drooping tips, the leader nodding; the third thinned and greying, as
  // the woolly adelgid leaves them
  easthemlock: [
    { H: 12.0, bare: 0.08, R0: 2.9, Rt: 0.3, rings: [3, 3, 3, 2, 2, 2, 2, 1], trunkR: 0.24, bark: EHEMLOCK_BARK, lift: 0.04, droop: 0.32, lobe: 0.54, sq: 0.66, stretch: 1.25, bend: 0.6, jit: 0.25, buttress: 0, stubs: 0, top: 'nod' },
    { H: 12.4, bare: 0.34, R0: 2.4, Rt: 0.3, rings: [3, 3, 2, 2, 2, 2, 1, 1], trunkR: 0.25, bark: EHEMLOCK_BARK, lift: 0.04, droop: 0.34, lobe: 0.54, sq: 0.66, stretch: 1.25, bend: 0.62, jit: 0.25, buttress: 0, stubs: 3, top: 'nod' },
    { H: 11.6, bare: 0.24, R0: 2.5, Rt: 0.3, rings: [3, 2, 2, 2, 2, 2, 1], trunkR: 0.24, bark: EHEMLOCK_BARK, lift: 0.02, droop: 0.38, lobe: 0.42, sq: 0.62, stretch: 1.2, bend: 0.65, jit: 0.45, buttress: 0, stubs: 5, top: 'broken' },
  ],
  // Red spruce: a narrow spire, yellow-green, its boughs short and a little upswept
  redspruce: [
    { H: 12.4, bare: 0.1, R0: 1.7, Rt: 0.2, rings: [3, 3, 3, 2, 2, 2, 2, 1], trunkR: 0.2, bark: RSPRUCE_BARK, lift: 0.12, droop: 0.2, lobe: 0.56, sq: 0.66, stretch: 1.2, bend: 0.42, jit: 0.2, buttress: 0, stubs: 0, top: 'spire' },
    { H: 12.8, bare: 0.38, R0: 1.5, Rt: 0.2, rings: [3, 3, 2, 2, 2, 2, 1, 1], trunkR: 0.21, bark: RSPRUCE_BARK, lift: 0.12, droop: 0.22, lobe: 0.56, sq: 0.66, stretch: 1.2, bend: 0.45, jit: 0.22, buttress: 0, stubs: 4, top: 'spire' },
    { H: 12.6, bare: 0.3, R0: 1.9, Rt: 0.4, rings: [3, 3, 2, 2, 2, 2, 1], trunkR: 0.23, bark: RSPRUCE_BARK, lift: 0.08, droop: 0.26, lobe: 0.54, sq: 0.66, stretch: 1.25, bend: 0.5, jit: 0.3, buttress: 0, stubs: 3, top: 'broken' },
  ],
  // Balsam fir: a dark, narrow, near-perfect spire, dense, its boughs level (the Christmas tree)
  balsamfir: [
    { H: 11.0, bare: 0.09, R0: 1.55, Rt: 0.15, rings: [3, 3, 3, 3, 2, 2, 2, 1], trunkR: 0.17, bark: BALSAM_BARK, lift: 0.1, droop: 0.12, lobe: 0.6, sq: 0.7, stretch: 1.1, bend: 0.3, jit: 0.1, buttress: 0, stubs: 0, top: 'spire' },
    { H: 11.4, bare: 0.3, R0: 1.35, Rt: 0.15, rings: [3, 3, 3, 2, 2, 2, 1, 1], trunkR: 0.17, bark: BALSAM_BARK, lift: 0.1, droop: 0.14, lobe: 0.6, sq: 0.7, stretch: 1.1, bend: 0.32, jit: 0.12, buttress: 0, stubs: 3, top: 'spire' },
    { H: 10.6, bare: 0.14, R0: 1.75, Rt: 0.18, rings: [3, 3, 3, 3, 2, 2, 1], trunkR: 0.18, bark: BALSAM_BARK, lift: 0.08, droop: 0.16, lobe: 0.58, sq: 0.7, stretch: 1.12, bend: 0.34, jit: 0.15, buttress: 0, stubs: 1, top: 'spire' },
  ],
  // Engelmann spruce: a narrow dark blue-green spire, the lower boughs hanging; in the old one a broken top
  engelmann: [
    { H: 13.0, bare: 0.08, R0: 1.8, Rt: 0.2, rings: [3, 3, 3, 3, 2, 2, 2, 1], trunkR: 0.22, bark: ENGELMANN_BARK, lift: 0, droop: 0.36, lobe: 0.52, sq: 0.66, stretch: 1.3, bend: 0.6, jit: 0.2, buttress: 0, stubs: 0, top: 'spire' },
    { H: 13.2, bare: 0.36, R0: 1.55, Rt: 0.2, rings: [3, 3, 3, 2, 2, 2, 1, 1], trunkR: 0.23, bark: ENGELMANN_BARK, lift: 0, droop: 0.38, lobe: 0.52, sq: 0.66, stretch: 1.3, bend: 0.62, jit: 0.22, buttress: 0, stubs: 4, top: 'spire' },
    { H: 12.6, bare: 0.28, R0: 1.9, Rt: 0.5, rings: [3, 3, 2, 2, 2, 2, 1], trunkR: 0.25, bark: ENGELMANN_BARK, lift: 0, droop: 0.4, lobe: 0.5, sq: 0.64, stretch: 1.3, bend: 0.65, jit: 0.32, buttress: 0, stubs: 3, top: 'broken' },
  ],
  // Subalpine fir: the narrowest spire of all, a church steeple of short dense boughs
  subalpinefir: [
    { H: 12.6, bare: 0.1, R0: 1.15, Rt: 0.1, rings: [3, 3, 3, 3, 2, 2, 2, 1], trunkR: 0.18, bark: SUBALPINE_BARK, lift: 0.05, droop: 0.24, lobe: 0.62, sq: 0.76, stretch: 1.1, bend: 0.4, jit: 0.14, buttress: 0, stubs: 0, top: 'spire' },
    { H: 12.8, bare: 0.3, R0: 1.0, Rt: 0.1, rings: [3, 3, 3, 2, 2, 2, 2, 1], trunkR: 0.18, bark: SUBALPINE_BARK, lift: 0.05, droop: 0.26, lobe: 0.62, sq: 0.76, stretch: 1.1, bend: 0.42, jit: 0.16, buttress: 0, stubs: 3, top: 'spire' },
    { H: 12.2, bare: 0.12, R0: 0.95, Rt: 0.08, rings: [3, 3, 3, 3, 2, 2, 2, 1], trunkR: 0.17, bark: SUBALPINE_BARK, lift: 0.06, droop: 0.22, lobe: 0.66, sq: 0.8, stretch: 1.05, bend: 0.36, jit: 0.12, buttress: 0, stubs: 1, top: 'spire' },
  ],
};
const isSpire = (k: TreeKind): k is SpireKind => k in SPIRES;

// the live oaks' barks: the southern live oak's near-black blocky furrows, the plateau oak's dark grey,
// the coast live oak's grey going dark and furrowed with age
const LIVEOAK_BARK = 0x403a33, PLATEAU_BARK = 0x57524a, COASTOAK_BARK = 0x6a645a;
// the sycamore's bark: olive-tan below, flaking in cream, olive and brown patches, the limbs above
// ghost-white; the bur oak's dark grey, deeply ridged
const SYC_BARK = 0x857c66, SYC_WHITE = 0xe4e0d4, SYC_PATCH = [0xd8d2bc, 0xa6a488, 0x6e6450], BUROAK_BARK = 0x4e4840;
/** The live oaks' three grown forms each (liveoak†; docs/regional-life/05, 08, 15): a short, massive
 *  trunk dividing low (`fork`) — or a mott's two or three trunks from one root crown (`stems`) — into
 *  heavy limbs that climb (`up`), level off and sweep out (`reach`), their outer third coming down
 *  again (`droop`); some come down to rest on the ground and rise again (`rest`); the coast live oak's
 *  limbs snake sideways (`snake`). Billows along each limb's middle and at its end, the rim lower than
 *  the middle, and a broad dome over the fork: an umbrella twice as wide as it stands, never a ball.
 *  The southern live oak: v0 the grand old open-grown oak, v1 a street oak arching over (the live oak
 *  alley), v2 old and gnarled, leaning, a limb broken short. The plateau oak: v0 one trunk, v1 a
 *  mott of three, v2 two. The coast live oak: v0 a broad round dome, v1 two leaning trunks, v2 old,
 *  a limb along the ground. */
type Oak = { H: number; stems: number; fork: number; trunkR: number; limbs: number; reach: [number, number]; up: number; droop: number; rest: number; snake: number; billow: number; dome: number; sq: number; lean: number; bark: number; stub?: boolean;
  /** (package #4) the limbs' bark past their first stretch (the sycamore's ghost-white), pale patches
   *  flaking on the trunk (its mottle), the limbs pulled toward the trunk's lean (a streamside
   *  sycamore's crown hanging out over the water), the limbs' girth at the fork (× the trunk's: the bur
   *  oak's thick corky limbs), dead limbs standing out of the crown */
  upper?: number; mottle?: number; bias?: number; limbR?: number; dead?: number;
  /** a billow low on each limb too, under its knee (a sycamore's crown runs deep, not a plate on top) */
  low?: boolean };
type OakKind = 'liveoak' | 'plateauoak' | 'coastoak' | 'sycamore' | 'buroak';
const OAKS: Record<OakKind, Oak[]> = {
  // (package #4) American sycamore: v0 the floodplain's open-grown giant, v1 leaning out over a creek,
  // v2 old, two trunks from one base — massive crooked limbs going ghost-white above the fork, the
  // trunk flaking in patches; a broad, open, irregular crown, never the live oak's umbrella
  sycamore: [
    { H: 12.4, stems: 1, fork: 2.7, trunkR: 0.48, limbs: 4, reach: [3.4, 4.6], up: 4.0, droop: -1.3, rest: 0, snake: 1.0, billow: 2.1, dome: 2.6, sq: 0.92, lean: 0.4, bark: SYC_BARK, upper: SYC_WHITE, mottle: 9, limbR: 0.62, low: true },
    { H: 11.8, stems: 1, fork: 2.5, trunkR: 0.42, limbs: 4, reach: [3.2, 4.6], up: 3.8, droop: -1.0, rest: 0, snake: 1.1, billow: 2.0, dome: 2.4, sq: 0.9, lean: 2.0, bark: SYC_BARK, upper: SYC_WHITE, mottle: 8, bias: 0.65, limbR: 0.62, low: true },
    { H: 12.6, stems: 2, fork: 2.9, trunkR: 0.42, limbs: 4, reach: [3.3, 4.5], up: 4.4, droop: -1.5, rest: 0, snake: 1.2, billow: 2.1, dome: 2.6, sq: 0.9, lean: 0.9, bark: SYC_BARK, upper: SYC_WHITE, mottle: 8, low: true },
  ],
  // Bur oak: v0 the savanna's open-grown oak (a short massive trunk, thick corky limbs reaching wide
  // and crooked under a broad rounded crown), v1 in a wood or on a street (a taller trunk, a narrower
  // crown), v2 old and gnarled (a limb broken, a dead one standing out of the crown)
  buroak: [
    { H: 11.6, stems: 1, fork: 2.6, trunkR: 0.56, limbs: 5, reach: [4.0, 5.2], up: 3.4, droop: 1.3, rest: 0, snake: 0.8, billow: 2.2, dome: 3.0, sq: 0.76, lean: 0.3, bark: BUROAK_BARK, limbR: 0.7 },
    { H: 12.2, stems: 1, fork: 4.0, trunkR: 0.44, limbs: 5, reach: [3.0, 4.0], up: 4.0, droop: 0.8, rest: 0, snake: 0.6, billow: 1.95, dome: 2.7, sq: 0.8, lean: 0.25, bark: BUROAK_BARK, limbR: 0.66 },
    { H: 11.2, stems: 1, fork: 2.2, trunkR: 0.62, limbs: 5, reach: [4.4, 5.8], up: 3.0, droop: 1.6, rest: 0, snake: 1.1, billow: 2.1, dome: 2.8, sq: 0.74, lean: 0.35, bark: BUROAK_BARK, stub: true, dead: 1, limbR: 0.72 },
  ],
  liveoak: [
    { H: 8.6, stems: 1, fork: 1.7, trunkR: 0.5, limbs: 5, reach: [7.0, 8.4], up: 2.2, droop: 1.6, rest: 2, snake: 0.4, billow: 2.45, dome: 3.3, sq: 0.7, lean: 0.2, bark: LIVEOAK_BARK },
    { H: 9.0, stems: 1, fork: 2.0, trunkR: 0.4, limbs: 4, reach: [5.4, 6.6], up: 2.1, droop: 1.3, rest: 0, snake: 0.35, billow: 2.3, dome: 3.0, sq: 0.72, lean: 0.3, bark: LIVEOAK_BARK },
    { H: 8.0, stems: 1, fork: 1.4, trunkR: 0.55, limbs: 5, reach: [6.0, 9.0], up: 1.8, droop: 1.4, rest: 1, snake: 0.6, billow: 2.3, dome: 2.9, sq: 0.68, lean: 0.6, bark: LIVEOAK_BARK, stub: true },
  ],
  plateauoak: [
    { H: 7.4, stems: 1, fork: 1.3, trunkR: 0.32, limbs: 4, reach: [3.8, 4.8], up: 2.0, droop: 0.9, rest: 0, snake: 0.4, billow: 1.95, dome: 2.6, sq: 0.72, lean: 0.25, bark: PLATEAU_BARK },
    { H: 7.0, stems: 3, fork: 1.6, trunkR: 0.22, limbs: 4, reach: [3.0, 4.2], up: 2.2, droop: 0.7, rest: 0, snake: 0.5, billow: 1.8, dome: 2.4, sq: 0.74, lean: 0.9, bark: PLATEAU_BARK },
    { H: 7.8, stems: 2, fork: 1.5, trunkR: 0.3, limbs: 4, reach: [4.2, 5.6], up: 2.0, droop: 1.0, rest: 1, snake: 0.5, billow: 2.0, dome: 2.6, sq: 0.7, lean: 0.6, bark: PLATEAU_BARK },
  ],
  coastoak: [
    { H: 9.0, stems: 1, fork: 1.5, trunkR: 0.4, limbs: 5, reach: [4.6, 5.8], up: 2.8, droop: 0.9, rest: 0, snake: 0.9, billow: 2.3, dome: 3.4, sq: 0.8, lean: 0.3, bark: COASTOAK_BARK },
    { H: 8.4, stems: 2, fork: 1.2, trunkR: 0.3, limbs: 4, reach: [4.4, 5.6], up: 2.6, droop: 0.8, rest: 0, snake: 1.1, billow: 2.15, dome: 3.0, sq: 0.82, lean: 1.0, bark: COASTOAK_BARK },
    { H: 8.2, stems: 1, fork: 1.1, trunkR: 0.48, limbs: 5, reach: [5.0, 7.0], up: 2.2, droop: 1.2, rest: 1, snake: 1.0, billow: 2.2, dome: 3.0, sq: 0.78, lean: 0.5, bark: COASTOAK_BARK, stub: true },
  ],
};

// the pines' barks: the white pine's dark grey furrows, the ponderosa's orange-cinnamon jigsaw plates
// (a young one's near-black "blackjack"), the lodgepole's thin grey-brown scales; the aspen's white,
// its dark eyes; the willow thickets' coloured stems (red, gold, purple: they glow in a bare winter)
const WPINE_BARK = 0x4c463e, PONDEROSA_BARK = 0xa0643c, BLACKJACK_BARK = 0x4a3c32, LODGEPOLE_BARK = 0x6e5e4c, ASPEN_BARK = 0xd8d6c6, ASPEN_EYE = 0x2c2824;
const WILLOW_STEMS = [0x9a3a2c, 0xb08a3a, 0x6a3a4a];
/** The pines' three grown forms each (package #3): tiers of boughs up the trunk from `bare` of its
 *  height, each bough ending in its tuft of needles (a spray drawn out along it), `reach` from the
 *  foot of the crown to its top, rising by `rise` a metre out; the top a leader's point, an old tree's
 *  flat crown or a ponderosa's rounded one; the old white pine's limbs flagged to one side.
 *  Eastern white pine: v0 open-grown (tiers near the ground), v1 a forest tree (a clean trunk, the
 *  tiers in its top half), v2 the old giant (flagged, flat-topped). Ponderosa: v0 a young "blackjack",
 *  v1 mature (an open crown high on an orange trunk), v2 the old "yellow-belly" (a tall bare column,
 *  a flat top). Lodgepole: v0 open-grown, v1 a pole in a dense stand, v2 between. */
type Pine = { H: number; bare: number; trunkR: number; bark: number; tiers: number[]; reach: [number, number]; rise: number; tuft: number; sq: number; top: 'point' | 'flat' | 'round'; flag?: number; lean: number;
  /** (package #4) a bough's crook (m: an old longleaf's heavy crooked limbs), a tuft's draw along its
   *  bough and droop (the southern pines' long needles hang in brushes), a life stage: the longleaf's
   *  grass stage (a fountain of needles on the ground) and its bottlebrush sapling (one stem, needles
   *  all down its top half, a fat brush at the tip) */
  crook?: number; stretch?: number; bend?: number; form?: 'grass' | 'brush' };
// the southern pines' barks: the loblolly's red-brown scaly plates, the longleaf's orange-brown plates,
// the slash pine's purple-brown papery plates
const LOBLOLLY_BARK = 0x6c4836, LONGLEAF_BARK = 0x7c5a40, SLASH_BARK = 0x684a40;
type PineKind = 'whitepine' | 'ponderosa' | 'lodgepole' | 'loblolly' | 'longleaf' | 'slashpine';
const PINES: Record<PineKind, Pine[]> = {
  // (package #4, the southern pines; docs/regional-life/05, 06, 07, 08) Loblolly: v0 open-grown (a round
  // crown from a third of the way up), v1 a plantation pole (a long bare bole, a small crown on top),
  // v2 old (a flat-topped crown on heavy limbs high on the bole)
  loblolly: [
    { H: 12.4, bare: 0.3, trunkR: 0.26, bark: LOBLOLLY_BARK, tiers: [3, 3, 3, 2, 2, 1], reach: [3.0, 0.9], rise: 0.2, tuft: 1.35, sq: 0.72, top: 'round', lean: 0.15, stretch: 1.35, bend: 0.3 },
    { H: 12.8, bare: 0.66, trunkR: 0.2, bark: LOBLOLLY_BARK, tiers: [3, 2, 2, 2, 1], reach: [1.8, 0.6], rise: 0.25, tuft: 1.15, sq: 0.75, top: 'round', lean: 0.08, stretch: 1.3, bend: 0.3 },
    { H: 12.8, bare: 0.6, trunkR: 0.32, bark: LOBLOLLY_BARK, tiers: [3, 3, 2, 2, 2], reach: [2.8, 1.5], rise: 0.28, tuft: 1.35, sq: 0.68, top: 'flat', lean: 0.2, crook: 0.5, stretch: 1.35, bend: 0.32 },
  ],
  // Longleaf: v0 the grass stage (years as a fountain of needles on the sand, no trunk at all), v1 the
  // bottlebrush sapling, v2 old: a tall bare bole, an open flat-topped crown of a few heavy crooked
  // limbs, each ending in its own brush of foot-long needles
  longleaf: [
    { H: 1.1, bare: 0, trunkR: 0.07, bark: LONGLEAF_BARK, tiers: [], reach: [0.9, 0], rise: 0, tuft: 1, sq: 1, top: 'point', lean: 0, form: 'grass' },
    { H: 5.6, bare: 0.48, trunkR: 0.11, bark: LONGLEAF_BARK, tiers: [], reach: [0.3, 0], rise: 0, tuft: 0.62, sq: 0.9, top: 'point', lean: 0.12, form: 'brush' },
    { H: 13.0, bare: 0.68, trunkR: 0.3, bark: LONGLEAF_BARK, tiers: [3, 2, 2, 2], reach: [3.1, 2.3], rise: 0.12, tuft: 1.0, sq: 0.66, top: 'flat', lean: 0.15, crook: 0.7, stretch: 1.6, bend: 0.45 },
  ],
  // Slash pine: v0 open-grown (a round open crown), v1 in the flatwoods (higher, still round), v2 the
  // South Florida slash pine of the rocklands (shorter, crooked and leaning, a flat irregular top)
  slashpine: [
    { H: 12.0, bare: 0.32, trunkR: 0.25, bark: SLASH_BARK, tiers: [3, 3, 3, 2, 2], reach: [2.9, 1.2], rise: 0.3, tuft: 1.4, sq: 0.78, top: 'round', lean: 0.15, stretch: 1.3, bend: 0.25 },
    { H: 12.8, bare: 0.58, trunkR: 0.24, bark: SLASH_BARK, tiers: [3, 3, 2, 2, 1], reach: [2.4, 1.0], rise: 0.32, tuft: 1.35, sq: 0.8, top: 'round', lean: 0.1, stretch: 1.3, bend: 0.25 },
    { H: 11.0, bare: 0.48, trunkR: 0.24, bark: SLASH_BARK, tiers: [2, 3, 2, 2], reach: [2.6, 2.0], rise: 0.1, tuft: 1.2, sq: 0.65, top: 'flat', lean: 0.6, crook: 0.45, stretch: 1.35, bend: 0.3 },
  ],
  whitepine: [
    { H: 11.5, bare: 0.08, trunkR: 0.22, bark: WPINE_BARK, tiers: [3, 3, 3, 3, 2, 2], reach: [3.2, 0.8], rise: 0.05, tuft: 1.25, sq: 0.56, top: 'point', lean: 0.15 },
    { H: 12.6, bare: 0.45, trunkR: 0.25, bark: WPINE_BARK, tiers: [3, 3, 3, 2, 2, 1], reach: [2.8, 0.8], rise: 0.04, tuft: 1.2, sq: 0.56, top: 'point', lean: 0.15 },
    { H: 13.0, bare: 0.35, trunkR: 0.34, bark: WPINE_BARK, tiers: [3, 3, 3, 2, 2, 2], reach: [3.6, 1.6], rise: 0.08, tuft: 1.35, sq: 0.54, top: 'flat', flag: 0.75, lean: 0.25 },
  ],
  ponderosa: [
    { H: 10.5, bare: 0.18, trunkR: 0.22, bark: BLACKJACK_BARK, tiers: [3, 3, 3, 2, 2, 1], reach: [2.2, 0.6], rise: 0.25, tuft: 1.05, sq: 0.75, top: 'point', lean: 0.1 },
    { H: 12.4, bare: 0.52, trunkR: 0.3, bark: PONDEROSA_BARK, tiers: [3, 3, 2, 2, 1], reach: [2.6, 1.0], rise: 0.4, tuft: 1.25, sq: 0.8, top: 'round', lean: 0.15 },
    { H: 13.0, bare: 0.62, trunkR: 0.38, bark: PONDEROSA_BARK, tiers: [3, 3, 2, 2], reach: [3.0, 1.6], rise: 0.3, tuft: 1.3, sq: 0.72, top: 'flat', lean: 0.12 },
  ],
  lodgepole: [
    { H: 11.0, bare: 0.25, trunkR: 0.17, bark: LODGEPOLE_BARK, tiers: [3, 3, 2, 2, 2, 1], reach: [1.6, 0.5], rise: 0.15, tuft: 0.85, sq: 0.8, top: 'point', lean: 0.1 },
    { H: 12.2, bare: 0.65, trunkR: 0.15, bark: LODGEPOLE_BARK, tiers: [3, 2, 2, 2, 1], reach: [1.3, 0.4], rise: 0.12, tuft: 0.8, sq: 0.85, top: 'point', lean: 0.08 },
    { H: 11.6, bare: 0.48, trunkR: 0.16, bark: LODGEPOLE_BARK, tiers: [3, 2, 2, 2, 2, 1], reach: [1.5, 0.45], rise: 0.14, tuft: 0.82, sq: 0.82, top: 'point', lean: 0.1 },
  ],
};
const isPine = (k: TreeKind): k is PineKind => k in PINES;
const isOak = (k: TreeKind): k is OakKind => k in OAKS;

// ---- package #4: the eastern hardwoods (docs/regional-life/03, 04, 05, 10, 11) ----
// their barks: the tulip tree's grey with pale diamond furrows, the sweetgum's deep corky grey-brown
// furrows, the shagbark hickory's dark grey under its pale curling strips, the yellow buckeye's grey
// scaly plates
const TULIP_BARK = 0x6f6a5c, SWEETGUM_BARK = 0x5c5047, HICKORY_BARK = 0x55504a, HICKORY_SHAG = 0x8e877a, BUCKEYE_BARK = 0x7a756a;
/** The hardwoods on a leader (package #4): a straight trunk carried up through the crown (excurrent:
 *  the tulip tree's ramrod, a hickory's, a young sweetgum's spire) — or, `fork`ed low, three stems
 *  (the old buckeye) — bare to `bare` of the height, `limbs` off it in a spiral rising by `rise` a metre
 *  out, and the crown's lobes along it: half-width `R` at each height a `shape` ('oval' widest in the
 *  middle, 'cone' widest low — the young sweetgum's pyramid —, 'round', 'dome' widest high), the
 *  lobes `lobeR` across, squashed `sq`, every other one pulled in by `core` to close the crown's
 *  heart; `dead` dead limbs silvered through the crown, `stub` a limb broken short on the bole, `shag`
 *  the shagbark's strips curling off the trunk, `lean` the trunk's sweep.
 *  Tulip tree: v0 open-grown, v1 the forest's ramrod (bare two thirds up), v2 the old cove giant.
 *  Sweetgum: v0 the young pyramid, v1 mature (an oblong oval), v2 old and rounded. Shagbark hickory:
 *  v0 open-grown, v1 in the forest (a narrow oval high on a tall shaggy bole), v2 old (dead limbs).
 *  Yellow buckeye: v0 open-grown (round and low-branched), v1 in a cove forest, v2 forked low into
 *  three stems under a broad dome. */
type Leader = { H: number; bare: number; trunkR: number; bark: number; R: number; shape: 'oval' | 'cone' | 'round' | 'dome'; lobes: number; lobeR: number; sq: number; limbs: number; rise: number; lean: number; core: number; fork?: number; dead?: number; stub?: boolean; shag?: number };
type LeaderKind = 'tuliptree' | 'sweetgum' | 'hickory' | 'buckeye';
const LEADERS: Record<LeaderKind, Leader[]> = {
  tuliptree: [
    { H: 12.0, bare: 0.24, trunkR: 0.26, bark: TULIP_BARK, R: 2.9, shape: 'oval', lobes: 16, lobeR: 1.35, sq: 0.9, limbs: 6, rise: 0.55, lean: 0.2, core: 0.5 },
    { H: 12.8, bare: 0.56, trunkR: 0.25, bark: TULIP_BARK, R: 2.1, shape: 'oval', lobes: 13, lobeR: 1.2, sq: 0.9, limbs: 5, rise: 0.65, lean: 0.12, core: 0.5 },
    { H: 12.8, bare: 0.5, trunkR: 0.36, bark: TULIP_BARK, R: 3.1, shape: 'dome', lobes: 15, lobeR: 1.45, sq: 0.86, limbs: 5, rise: 0.45, lean: 0.25, core: 0.55, stub: true, dead: 1 },
  ],
  sweetgum: [
    { H: 11.0, bare: 0.1, trunkR: 0.2, bark: SWEETGUM_BARK, R: 3.3, shape: 'cone', lobes: 16, lobeR: 1.15, sq: 0.85, limbs: 7, rise: 0.15, lean: 0.1, core: 0.4 },
    { H: 12.0, bare: 0.3, trunkR: 0.27, bark: SWEETGUM_BARK, R: 2.9, shape: 'oval', lobes: 16, lobeR: 1.3, sq: 0.88, limbs: 6, rise: 0.35, lean: 0.15, core: 0.45 },
    { H: 11.6, bare: 0.32, trunkR: 0.32, bark: SWEETGUM_BARK, R: 3.4, shape: 'round', lobes: 17, lobeR: 1.45, sq: 0.86, limbs: 5, rise: 0.45, lean: 0.3, core: 0.5, dead: 1 },
  ],
  hickory: [
    { H: 12.2, bare: 0.3, trunkR: 0.24, bark: HICKORY_BARK, R: 3.1, shape: 'oval', lobes: 14, lobeR: 1.3, sq: 0.92, limbs: 6, rise: 0.5, lean: 0.2, core: 0.6, shag: 10 },
    { H: 12.6, bare: 0.52, trunkR: 0.24, bark: HICKORY_BARK, R: 2.1, shape: 'oval', lobes: 12, lobeR: 1.15, sq: 0.92, limbs: 5, rise: 0.6, lean: 0.15, core: 0.6, shag: 10 },
    { H: 12.2, bare: 0.42, trunkR: 0.3, bark: HICKORY_BARK, R: 2.9, shape: 'oval', lobes: 13, lobeR: 1.3, sq: 0.9, limbs: 5, rise: 0.5, lean: 0.3, core: 0.65, dead: 2, stub: true, shag: 10 },
  ],
  buckeye: [
    { H: 10.5, bare: 0.18, trunkR: 0.26, bark: BUCKEYE_BARK, R: 3.5, shape: 'round', lobes: 16, lobeR: 1.45, sq: 0.88, limbs: 6, rise: 0.45, lean: 0.2, core: 0.45 },
    { H: 12.0, bare: 0.42, trunkR: 0.26, bark: BUCKEYE_BARK, R: 2.8, shape: 'round', lobes: 14, lobeR: 1.35, sq: 0.9, limbs: 5, rise: 0.55, lean: 0.15, core: 0.45 },
    { H: 10.8, bare: 0.22, trunkR: 0.3, bark: BUCKEYE_BARK, R: 3.7, shape: 'dome', lobes: 16, lobeR: 1.5, sq: 0.86, limbs: 0, rise: 0.6, lean: 0.25, core: 0.5, fork: 1.9 },
  ],
};
const isLeader = (k: TreeKind): k is LeaderKind => k in LEADERS;

// ---- package #4: the small flowering trees and the rosebay (docs/regional-life/03, 04, 05, 08) ----
// barks: the dogwood's dark blocky "alligator" bark, the redbud's near-black, the crape myrtle's smooth
// cinnamon flaking to grey, tan and cream patches, the rosebay's red-brown, the redcedar's red shreds
const DOGWOOD_BARK = 0x4a3c34, REDBUD_BARK = 0x4a3a35, CRAPE_BARK = 0x9c6c4c, ROSEBAY_BARK = 0x6a564a, REDCEDAR_BARK = 0x7c4c38;
const CRAPE_PATCH = [0xc4b6a2, 0x8c8a7c, 0xd6ac8a];
/** Small trees and shrubs of many stems (package #4): `stems` from one root crown `spread` apart — or
 *  one trunk to `fork` and the stems from there — each rising to a `knee` (its share of the way up) and
 *  out to a tip `out` from the middle at `top` of the height (`arch`: the tips bowing back down, the
 *  rosebay's; `zig`: the stems zigzagging, the redbud's; `lean`: the clump leaning to the light), and
 *  the crown's `lobes` clustered on the tips, `lobeR` across, squashed `sq`, `flat`-topped where the
 *  species is (the redbud's, the crape myrtle's umbrella); `mottle` pale patches on the stems where the
 *  bark flakes (the crape myrtle's), `knuckle` a pollarded crape myrtle's fists with whips shooting
 *  from them. Redbud: v0 three trunks, flat-topped and wide, v1 one trunk forking low and leaning, v2 two
 *  trunks on zigzag limbs. Crape myrtle: v0 the multi-trunk vase, v1 a tree-form three, v2 pollarded
 *  ("crape murder": knuckles and whips). Rosebay: v0 a streamside clump, v1 a "laurel hell" tangle,
 *  v2 an old one of a few thick twisting stems. */
type Clump = { H: number; trunkR: number; bark: number; stems: number; spread: number; fork?: number; knee: number; out: number; top: number; arch?: number; zig?: number; lean?: number; lobes: number; lobeR: number; sq: number; flat?: boolean; mottle?: number; knuckle?: boolean; low?: number };
type ClumpKind = 'redbud' | 'crapemyrtle' | 'rosebay';
const CLUMPS: Record<ClumpKind, Clump[]> = {
  redbud: [
    { H: 6.6, trunkR: 0.13, bark: REDBUD_BARK, stems: 3, spread: 0.16, knee: 0.4, out: 2.2, top: 0.7, lobes: 14, lobeR: 1.25, sq: 0.7, flat: true, low: 0.4 },
    { H: 7.2, trunkR: 0.17, bark: REDBUD_BARK, stems: 3, spread: 0, fork: 1.3, knee: 0.45, out: 2.0, top: 0.74, lean: 0.9, lobes: 13, lobeR: 1.3, sq: 0.74, flat: true, low: 0.35 },
    { H: 6.2, trunkR: 0.14, bark: REDBUD_BARK, stems: 2, spread: 0.22, knee: 0.38, out: 2.5, top: 0.7, zig: 0.55, lobes: 14, lobeR: 1.25, sq: 0.7, flat: true, low: 0.4 },
  ],
  crapemyrtle: [
    { H: 6.4, trunkR: 0.09, bark: CRAPE_BARK, stems: 5, spread: 0.14, knee: 0.4, out: 2.3, top: 0.76, zig: 0.2, lobes: 14, lobeR: 1.15, sq: 0.82, flat: true, mottle: 2, low: 0.4 },
    { H: 7.4, trunkR: 0.12, bark: CRAPE_BARK, stems: 3, spread: 0.12, knee: 0.45, out: 2.1, top: 0.78, zig: 0.25, lobes: 13, lobeR: 1.25, sq: 0.85, flat: true, mottle: 3, low: 0.35 },
    { H: 5.4, trunkR: 0.1, bark: CRAPE_BARK, stems: 4, spread: 0.13, knee: 0.5, out: 0.9, top: 0.5, lobes: 8, lobeR: 0.85, sq: 1.15, mottle: 2, knuckle: true },
  ],
  rosebay: [
    { H: 5.2, trunkR: 0.07, bark: ROSEBAY_BARK, stems: 6, spread: 0.25, knee: 0.5, out: 1.8, top: 0.78, arch: 0.25, zig: 0.3, lobes: 14, lobeR: 0.95, sq: 0.75, low: 0.45 },
    { H: 5.0, trunkR: 0.07, bark: ROSEBAY_BARK, stems: 7, spread: 0.4, knee: 0.45, out: 2.6, top: 0.62, arch: 0.45, zig: 0.4, lean: 0.4, lobes: 16, lobeR: 1.0, sq: 0.7, low: 0.35 },
    { H: 5.6, trunkR: 0.1, bark: ROSEBAY_BARK, stems: 4, spread: 0.2, knee: 0.55, out: 1.6, top: 0.82, zig: 0.45, lobes: 13, lobeR: 1.1, sq: 0.72, flat: true, low: 0.3 },
  ],
};
const isClump = (k: TreeKind): k is ClumpKind => k in CLUMPS;

/** Build one grown tree. Deterministic in (kind, variant). */
export function treeGeometry(kind: TreeKind, v: number): { geo: THREE.BufferGeometry; meta: TreeMeta; plan: TreePlan } {
  const r = makeRng(9173 * (TREE_KINDS.indexOf(kind) + 1) + v * 7919);
  const wood: THREE.BufferGeometry[] = [], leaf: THREE.BufferGeometry[] = [];
  const plan: TreePlan = { boughs: [], lobes: [], hang: [] };
  let trunkR = 0.3, leanPer: [number, number] = [0, 0];
  // `spray`: a conifer's clump of foliage on its bough — drawn out along the bough (heading `dir`)
  // by `stretch`, its rim drooping by `bend` × its radius at the edge (the bough's tips hang): a
  // tent of foliage, not a plate
  const lobe = (rad: number, c: THREE.Vector3, seed: number, squash = 0.85, detail = 1, spray?: { dir: number; stretch: number; bend: number }) => {
    plan.lobes.push({ c: c.clone(), r: spray ? rad * (1 + spray.stretch) * 0.5 : rad, sq: squash });
    const g = blob(rad, seed, { squash, detail });
    if (spray) {
      const P = g.getAttribute('position'), ca = Math.cos(spray.dir), sa = Math.sin(spray.dir), R = rad * spray.stretch;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), z = P.getZ(i), u = (x * ca + z * sa) * spray.stretch, w = -x * sa + z * ca;
        P.setXYZ(i, u * ca - w * sa, P.getY(i) - spray.bend * rad * Math.min(1, (u * u + w * w) / (R * R)), u * sa + w * ca);
      }
      g.computeVertexNormals();
    }
    leaf.push(g.translate(c.x, c.y, c.z));
  };
  const bough = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, segs: number, col: number) => {
    plan.boughs.push({ a: a.clone(), b: b.clone(), r0, r1, col });
    return part(limb(a, b, r0, r1, segs), col);
  };
  const j = (a: number) => (r.float() * 2 - 1) * a;
  // a piece of wood the far model draws as an open tube (half a capped cylinder's vertices): the
  // many slim boughs of a conifer, which the crown mostly hides
  const twig = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides: number, col: number) => {
    plan.boughs.push({ a: a.clone(), b: b.clone(), r0, r1, col });
    return part(tube([a, b], [r0, r1], sides), col);
  };
  // a beard of moss hanging from a limb: a ribbon (both faces) full where it hangs and narrowing to a
  // ragged tip, drifting a little as it falls
  const beard = (p: THREE.Vector3, len: number, w: number, yaw: number) => {
    const ca = Math.cos(yaw), sa = Math.sin(yaw), pos: number[] = [];
    const at = (t: number, side: number): [number, number, number] => { const hw = (w / 2) * (1 - 0.7 * t); return [p.x + ca * hw * side + sa * 0.08 * t, p.y - len * t, p.z + sa * hw * side - ca * 0.08 * t]; };
    for (let k = 0; k < 2; k++) {
      const A = at(k / 2, -1), B = at(k / 2, 1), C = at((k + 1) / 2, 1), D = at((k + 1) / 2, -1);
      pos.push(...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    plan.hang.push(part(g, MOSS));
  };
  // a patch of bark proud of a trunk of radius R round the point c on its axis, facing `a`: an uneven
  // diamond w wide and h tall, one-sided, facing out (the sycamore's and the crape myrtle's flaking)
  const patch = (c: THREE.Vector3, a: number, R: number, w: number, h: number) => {
    const dw = w / (2 * R);
    const at = (da: number, dy: number) => [c.x + Math.cos(a + da) * R, c.y + dy, c.z + Math.sin(a + da) * R];
    const L = at(-dw * (0.8 + j(0.2)), j(h * 0.15)), T = at(j(dw * 0.3), h / 2 + j(h * 0.1)), Rt = at(dw * (0.8 + j(0.2)), j(h * 0.15)), B = at(j(dw * 0.3), -h / 2 + j(h * 0.1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...L, ...T, ...Rt, ...L, ...Rt, ...B], 3));
    g.computeVertexNormals();
    return g;
  };
  // moss along a limb from a to b (radius rad there): beards hanging under it and licorice fern
  // fronds standing up out of the moss on its top — the bigleaf maple of every westside ravine
  const drape = (a: THREE.Vector3, b: THREE.Vector3, rad: number, beards: number, ferns: number) => {
    for (let i = 0; i < beards; i++) beard(a.clone().lerp(b, (i + 0.4 + r.float() * 0.3) / beards).add(V3(0, -rad * 0.7, 0)), 0.32 + r.float() * 0.36, 0.16 + r.float() * 0.1, r.float() * 6.28);
    for (let i = 0; i < ferns; i++) {
      const p = a.clone().lerp(b, (i + 0.3 + r.float() * 0.4) / ferns).add(V3(0, rad * 0.8, 0));
      const f = card(0.075, 0.24 + r.float() * 0.08, 0.35, 1);
      f.rotateX(-1.15 + r.float() * 0.3);
      f.rotateY(r.float() * 6.28);
      plan.hang.push(part(f.translate(p.x, p.y, p.z), LICORICE));
    }
  };

  if (kind === 'oak') {
    // a street or park oak (red, pin, white): a short, thick trunk that forks low into a few heavy
    // limbs reaching out and up, each ending in its own billow, and over them a broad dome — half
    // again as wide as it is tall, dark hollows between the billows, the limbs showing under it.
    // (The old oak was one squashed ball on a pole: a median lollipop.)
    trunkR = 0.36;
    const th = 2.5 + j(0.3), lean = V3(j(0.3), 0, j(0.3)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(bough(V3(0, -0.3, 0), top, trunkR, trunkR * 0.8, 6, BARK_DARK));
    const limbs = 4, a0 = r.float() * Math.PI * 2;
    let rise = 0;
    for (let i = 0; i < limbs; i++) {
      const a = a0 + i * GOLDEN + j(0.25), reach = 3.1 + r.float() * 1.0, up = 2.2 + r.float() * 1.0;
      rise += up / limbs;
      const knee = V3(lean.x + Math.cos(a) * reach * 0.45, th + up * 0.55, lean.z + Math.sin(a) * reach * 0.45);
      const tip = V3(lean.x + Math.cos(a) * reach, th + up, lean.z + Math.sin(a) * reach);
      wood.push(bough(top.clone().add(V3(0, -0.35, 0)), knee, trunkR * 0.62, trunkR * 0.42, 4, BARK_DARK), bough(knee, tip, trunkR * 0.42, trunkR * 0.16, 4, BARK_DARK));
      // the billow at the limb's end: a big lobe over the tip, two smaller ones either side of it
      const ca = Math.cos(a), sa = Math.sin(a);
      lobe(1.85 + r.float() * 0.35, tip.clone().add(V3(ca * 0.3, 0.7, sa * 0.3)), 120 + v * 17 + i * 3, 0.82, 0);
      for (const sd of [-1, 1]) lobe(1.35 + r.float() * 0.3, tip.clone().add(V3(-sa * sd * 1.25 + ca * 0.2, -0.45 + j(0.3), ca * sd * 1.25 + sa * 0.2)), 121 + v * 17 + i * 3 + sd, 0.8, 0); // (the rim hangs lower)
    }
    // the dome over the billows: a ring of three between the limbs, one broad crown on top
    for (let k = 0; k < 3; k++) {
      const a = a0 + GOLDEN * 0.5 + k * ((2 * Math.PI) / 3) + j(0.3);
      lobe(2.0 + r.float() * 0.3, V3(lean.x + Math.cos(a) * 1.9, th + rise + 1.5, lean.z + Math.sin(a) * 1.9), 110 + v * 7 + k, 0.78, 0);
    }
    lobe(2.5 + r.float() * 0.3, V3(lean.x + j(0.5), th + rise + 2.5, lean.z + j(0.5)), 118 + v, 0.72, 0);
  } else if (kind === 'round' || kind === 'birch') {
    const oak = false, birch = kind === 'birch';
    const th = (birch ? 4.4 : 4.2) + j(0.5);
    trunkR = oak ? 0.3 : birch ? 0.14 : 0.22; // a 7 m street tree: a 0.45 m trunk, not a 0.75 m barrel
    const lean = V3(j(0.35), 0, j(0.35));
    const top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    const barkC = birch ? BIRCH : BARK;
    // birches grow in clumps: two or three slim stems
    const stems = birch ? 2 + Math.floor(r.float() * 2) : 1;
    for (let s = 0; s < stems; s++) {
      const off = s ? V3(Math.cos(s * GOLDEN) * 0.45, 0, Math.sin(s * GOLDEN) * 0.45) : V3(0, 0, 0);
      const t = top.clone().add(off.clone().multiplyScalar(2.2)).add(V3(0, s ? -0.6 : 0, 0));
      wood.push(bough(off.clone().add(V3(0, -0.3, 0)), t, trunkR * (s ? 0.75 : 1), trunkR * 0.55, 6, barkC));
    }
    // scaffold limbs: a Fibonacci count of forks set at the golden angle
    const forks = fibCount(r.float(), 1, oak ? 3 : 2);
    const spread = oak ? 2.4 : birch ? 1.0 : 1.6;
    const tips: THREE.Vector3[] = [top.clone().add(V3(0, oak ? 1.0 : 1.6, 0))];
    for (let i = 0; i < forks; i++) {
      const a = i * GOLDEN + r.float();
      const tip = top.clone().add(V3(Math.cos(a) * spread, (oak ? 0.9 : 1.5) + j(0.4), Math.sin(a) * spread));
      wood.push(bough(top.clone().add(V3(0, -0.6, 0)), tip, trunkR * 0.55, trunkR * 0.25, 4, barkC));
      tips.push(tip);
    }
    // crown: lobes on a Fibonacci sphere around the fork tips, smaller toward the top
    const rx = oak ? 3.5 : birch ? 1.9 : 2.7, ry = oak ? 1.7 : birch ? 2.6 : 2.2;
    const cy = top.y + (oak ? 1.1 : birch ? 1.9 : 1.6); // low enough that the crown skirts over the forks
    const n = oak ? 8 : birch ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.35, r.float() * 6);
      const c = V3(lean.x + u.x * rx * 0.72, cy + u.y * ry * 0.7, lean.z + u.z * rx * 0.72);
      const rad = (oak ? 2.0 : birch ? 1.05 : 1.75) * taper(i / n, 0.65) * (0.85 + r.float() * 0.3);
      lobe(rad * 1.06, c, 100 + v * 17 + i, oak ? 0.62 : birch ? 1.0 : 0.85, 0);
    }
    lobe(oak ? 2.6 : birch ? 1.2 : 2.3, V3(lean.x, cy, lean.z), 7 + v, oak ? 0.55 : 0.85);
    // two low skirt lobes hide the bare slingshot of the scaffold forks
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI + r.float() * 1.5;
      lobe((oak ? 1.7 : birch ? 0.8 : 1.35) * (0.9 + r.float() * 0.2), V3(lean.x + Math.cos(a) * rx * 0.45, top.y + 0.3, lean.z + Math.sin(a) * rx * 0.45), 150 + v * 5 + k, 0.7, 0);
    }
  } else if (kind === 'shrub') {
    trunkR = 0.1;
    const stems = fibCount(r.float(), 1, 2);
    for (let i = 0; i < stems; i++) {
      const a = i * GOLDEN + r.float();
      wood.push(bough(V3(0, -0.1, 0), V3(Math.cos(a) * 0.4, 1.1 + j(0.2), Math.sin(a) * 0.4), 0.08, 0.04, 4, BARK));
    }
    const n = fibCount(r.float(), 1, 2);
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, 0, r.float() * 6);
      lobe(1.0 * taper(i / n, 0.7) + j(0.12), V3(u.x * 0.8, 1.45 + u.y * 0.7, u.z * 0.8), 200 + v * 13 + i, 0.85, 0);
    }
    lobe(1.25, V3(0, 1.5, 0), 211 + v);
  } else if (kind === 'pine') {
    // a coastal pitch pine: kinked trunk, a windswept flat-topped crown that starts well down the
    // trunk (open, clumped tufts), and a couple of lower limbs with their own tufts
    trunkR = 0.24;
    const kink = V3(j(0.4), 3.6, j(0.4)), top = V3(kink.x + j(0.6), 7.0 + j(0.5), kink.z + j(0.6));
    wood.push(bough(V3(0, -0.3, 0), kink, trunkR, trunkR * 0.8, 6, BARK_DARK), bough(kink, top, trunkR * 0.8, trunkR * 0.45, 6, BARK_DARK));
    const wind = r.float() * Math.PI * 2;
    // three overlapping tiers of clumped tufts (never separate pancakes with sky between them):
    // each tuft's radius ≥ 0.7 × the tier spacing, tufts staggered ±0.6 m, leaning downwind
    const tiers = 3, gap = 1.15;
    for (let t = 0; t < tiers; t++) {
      const y = top.y - (tiers - 1 - t) * gap;
      const spread = 1.35 - t * 0.3;
      for (let k = 0; k < 3; k++) {
        const a = wind + t * GOLDEN + (k / 3) * Math.PI * 2 + j(0.3);
        const c = V3(top.x + Math.cos(a) * spread + Math.cos(wind) * 0.45 + j(0.6) * 0.5, y + j(0.25), top.z + Math.sin(a) * spread + Math.sin(wind) * 0.45 + j(0.6) * 0.5);
        wood.push(bough(V3(top.x, y - 0.5, top.z), c, 0.09, 0.045, 3, BARK_DARK));
        lobe(Math.max(0.7 * gap * 1.25, 1.2 - t * 0.12) + r.float() * 0.12, c, 300 + v * 11 + t * 3 + k, 0.8, 0);
      }
    }
    // one or two lower limbs whose tufts tuck up under the crown (overlapping it, no sky gap)
    const stubs = 1 + (v % 2);
    for (let i = 0; i < stubs; i++) {
      const a = wind + Math.PI + i * GOLDEN;
      const y = top.y - 3.5 + i * 0.45 + j(0.15);
      const f = Math.min(1, y / 3.6);
      const from = V3(kink.x * f + (top.x - kink.x) * Math.max(0, (y - 3.6) / (top.y - 3.6)), y, kink.z * f + (top.z - kink.z) * Math.max(0, (y - 3.6) / (top.y - 3.6)));
      const tip = from.clone().add(V3(Math.cos(a) * 1.15, 0.45, Math.sin(a) * 1.15));
      wood.push(bough(from, tip, 0.08, 0.04, 3, BARK_DARK));
      lobe(0.95 + r.float() * 0.15, tip.clone().add(V3(0, 0.25, 0)), 320 + v * 7 + i, 0.6, 0);
    }
    lobe(1.6, top.clone().add(V3(Math.cos(wind) * 0.4, 0.55, Math.sin(wind) * 0.4)), 311 + v, 0.62); // swallows the upper tier
  } else if (kind === 'spruce') {
    // conical tiers — a Fibonacci count of whorls, each a ring of drooping lobes
    trunkR = 0.18;
    const H = 9.4 + j(0.6);
    wood.push(bough(V3(0, -0.3, 0), V3(0, H - 0.9, 0), trunkR, 0.05, 5, BARK_DARK));
    const tiers = fibCount(r.float(), 3, 3); // 8
    const gap = (H - 2.6) / (tiers - 1);
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = 2.0 + f * (H - 2.6);
      const rad = 1.75 * taper(f, 0.18);
      const ring = t < 3 ? 3 : t < tiers - 2 ? 2 : 1;
      for (let k = 0; k < ring; k++) {
        const a = k * ((2 * Math.PI) / ring) + t * GOLDEN;
        const off = ring > 1 ? rad * 0.45 : 0, rr = rad * (ring > 1 ? 0.72 : 1);
        // each whorl at least as deep as the gap to the next: a narrowing cone of boughs to the tip,
        // never plates on a pole (the small upper whorls were 20 cm thin a metre apart)
        lobe(rr, V3(Math.cos(a) * off, y, Math.sin(a) * off), 400 + v * 19 + t * 3 + k, Math.max(0.62, (0.62 * gap) / rr), t === 0 && k === 0 ? 1 : 0);
      }
    }
    lobe(0.42, V3(0, H - 0.35, 0), 431 + v, 2.0, 0); // the leader: the spire closing the tip
  } else if (kind === 'palm') {
    trunkR = 0.2;
    const H = 7.5 + j(1.2);
    const bend = V3(j(1), 0, j(1)).normalize().multiplyScalar(1.4 + r.float() * 1.2);
    let prev = V3(0, -0.2, 0);
    const segs = 5;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = V3(bend.x * t * t, H * t, bend.z * t * t);
      wood.push(bough(prev, p, trunkR * (1 - t * 0.25) + 0.02, trunkR * (1 - t * 0.25), 6, i % 2 ? PALM : 0x7c684e));
      prev = p;
    }
    const n = fibCount(r.float(), 3, 4); // 8 or 13 fronds
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const up = 0.35 - (i / n) * 0.8; // young fronds up, old ones droop
      const fr = card(0.9, 3.2 + r.float() * 0.6, 0.55, 3);
      fr.rotateX(-up);
      fr.rotateY(a);
      fr.translate(prev.x, prev.y, prev.z);
      leaf.push(fr);
    }
    for (let k = 0; k < 3; k++) leaf.push(new THREE.SphereGeometry(0.16, 5, 4).translate(prev.x + Math.cos(k * 2.1) * 0.25, prev.y - 0.25, prev.z + Math.sin(k * 2.1) * 0.25));
  } else if (kind === 'mesquite') {
    // desert legume trees (mesquite; variant 2 a palo verde with green bark): two to four
    // twisting trunks leaning out from one root crown, and a wide, low, airy canopy of thin
    // flattened clouds with sky between them — the shade trees of the Sonoran street
    trunkR = 0.2;
    const verde = v === 2;
    const barkC = verde ? PALOVERDE : MESQ;
    const stems = 2 + (v === 1 ? 2 : 1);
    const crowns: THREE.Vector3[] = [];
    for (let i = 0; i < stems; i++) {
      const a = i * GOLDEN + r.float();
      const knee = V3(Math.cos(a) * 0.7, 1.5 + j(0.3), Math.sin(a) * 0.7);
      const tip = V3(Math.cos(a) * (2.2 + r.float()), 3.6 + j(0.4), Math.sin(a) * (2.2 + r.float()));
      wood.push(bough(V3(0, -0.3, 0), knee, trunkR, trunkR * 0.75, 5, barkC), bough(knee, tip, trunkR * 0.75, trunkR * 0.35, 4, barkC));
      crowns.push(tip);
    }
    // canopy: small, irregular, loosely stacked clouds over each limb tip (an airy, uneven
    // crown with sky through it — not a flat umbrella), one lifted a little higher per limb
    for (let i = 0; i < crowns.length; i++) {
      const c = crowns[i];
      const n = 3 + (i % 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i * GOLDEN + j(0.4);
        const rr = 0.8 + r.float() * 0.7;
        // smaller, rounder, spread wider: a feathery, broken canopy (flat, fat lobes read as an
        // acacia umbrella)
        lobe((verde ? 0.7 : 0.82) + r.float() * 0.3, V3(c.x + Math.cos(a) * rr, c.y + 0.5 + j(0.7) + (k === 0 ? 0.6 : 0), c.z + Math.sin(a) * rr), 500 + v * 23 + i * 5 + k, 0.74, 0);
      }
    }
    lobe(verde ? 0.9 : 1.05, V3(j(0.5), 4.9 + j(0.3), j(0.5)), 520 + v, 0.72, 0);
  } else if (kind === 'fanpalm') {
    // Washingtonia: a tall, straight, slim trunk, a compact round head of fan fronds, and the
    // skirt of dead brown fronds hanging under it — the palm of desert and California streets
    trunkR = 0.24;
    const H = 9.4 + r.float() * 2.0;
    const lean = V3(j(0.35), 0, j(0.35));
    const top = V3(lean.x, H, lean.z);
    wood.push(bough(V3(0, -0.3, 0), top, trunkR * 1.25, trunkR * 0.8, 7, 0x7a6a58));
    // the skirt: a hanging shell of thatch, widest at the top (street palms are kept trimmed short)
    const skirt = lathe([[0.001, -1.25], [0.5, -1.22], [0.6, -0.5], [0.48, -0.02], [0.001, 0]], 9);
    wood.push(part(skirt.translate(top.x, top.y - 0.15, top.z), 0x8a7552));
    // the head: broad fan fronds splayed out on long stalks — a ~4 m crown, not a knob
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN, up = 0.75 - (i / n) * 1.35;
      const fr = card(1.5, 2.1 + r.float() * 0.45, 0.42, 2);
      fr.rotateX(-up);
      fr.rotateY(a);
      fr.translate(top.x, top.y + 0.15, top.z);
      leaf.push(fr);
    }
    lobe(0.55, V3(top.x, top.y + 0.3, top.z), 540 + v, 0.9);
  } else if (kind === 'maple') {
    if (v === 2) {
      // bigleaf maple, the Northwest's own: two or three stems leaning out from one base, each
      // carrying a heavy, uneven billow of huge leaves — broad, open, a tree for a park or a ravine
      trunkR = 0.3;
      const stems = 3, a0 = r.float() * Math.PI * 2;
      for (let i = 0; i < stems; i++) {
        const a = a0 + i * ((2 * Math.PI) / stems) + j(0.4), ca = Math.cos(a), sa = Math.sin(a);
        const knee = V3(ca * 0.9, 2.6 + j(0.3), sa * 0.9), tip = V3(ca * (2.6 + r.float() * 0.6), 5.6 + j(0.5), sa * (2.6 + r.float() * 0.6));
        wood.push(bough(V3(ca * 0.15, -0.3, sa * 0.15), knee, trunkR * (i ? 0.8 : 1), trunkR * 0.65, 5, BARK), bough(knee, tip, trunkR * 0.6, trunkR * 0.22, 4, BARK));
        drape(knee, tip, trunkR * 0.45, 2, 2); // (green-gold beards under each limb, licorice fern along it)
        lobe(1.95 + r.float() * 0.3, tip.clone().add(V3(ca * 0.3, 0.7, sa * 0.3)), 610 + v * 17 + i * 3, 0.78, 0);
        lobe(1.45 + r.float() * 0.25, tip.clone().add(V3(-sa * 1.2 + ca * 0.5, -0.4 + j(0.3), ca * 1.2 + sa * 0.5)), 611 + v * 17 + i * 3, 0.8, 0);
        lobe(1.35 + r.float() * 0.25, knee.clone().add(V3(ca * 1.3 + sa * 0.6, 0.9, sa * 1.3 - ca * 0.6)), 612 + v * 17 + i * 3, 0.8, 0);
      }
      lobe(2.2, V3(j(0.4), 6.6 + j(0.3), j(0.4)), 640 + v, 0.72);
    } else {
      // sugar or red maple: a short trunk under a full, dense egg of a crown — widest a third of the
      // way up, a finer texture of many small lobes, reaching down near the lawn (the round tree is
      // a ball held up on a tall bare trunk; this is the maple's closed oval)
      trunkR = 0.26;
      const th = 2.1 + j(0.3), lean = V3(j(0.2), 0, j(0.2)), top = V3(lean.x, th, lean.z);
      leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
      wood.push(bough(V3(0, -0.3, 0), top, trunkR, trunkR * 0.6, 6, BARK));
      for (let i = 0; i < 4; i++) {
        const a = i * GOLDEN + r.float();
        wood.push(bough(top.clone().add(V3(0, -0.4, 0)), top.clone().add(V3(Math.cos(a) * 1.5, 2.2 + j(0.3), Math.sin(a) * 1.5)), trunkR * 0.5, trunkR * 0.22, 4, BARK));
      }
      const rx = 3.3 + j(0.2), ry = 3.2 + j(0.3), cy = top.y + 3.0, n = 14;
      for (let i = 0; i < n; i++) {
        const u = fibSphere(i, n, -0.75, r.float() * 6);
        const w = rx * (1 - 0.18 * u.y); // (the egg: fuller low, narrower toward the top)
        lobe(1.2 * taper(i / n, 0.8) * (0.88 + r.float() * 0.24), V3(lean.x + u.x * w * 0.74, cy + u.y * ry * 0.74, lean.z + u.z * w * 0.74), 600 + v * 17 + i, 0.92, 0);
      }
      lobe(2.3, V3(lean.x, cy - 0.2, lean.z), 640 + v, 1.05);
    }
  } else if (kind === 'willow') {
    // weeping willow: a stout leaning trunk, limbs arching up and out under a rounded dome, and
    // from the dome a curtain of long tresses that bow out and fall to about a metre off the
    // ground (the wind swings them) — the tree of riverbanks and pond edges
    trunkR = 0.34;
    const th = 2.3 + j(0.3), lean = V3(j(0.5), 0, j(0.5)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(bough(V3(0, -0.3, 0), top, trunkR, trunkR * 0.7, 6, BARK_DARK));
    const R0 = 2.8 + j(0.3), H0 = 6.8 + j(0.5);
    for (let i = 0; i < 4; i++) {
      const a = i * GOLDEN + r.float();
      wood.push(bough(top.clone().add(V3(0, -0.3, 0)), V3(lean.x + Math.cos(a) * R0 * 0.7, H0 - 0.9 + j(0.4), lean.z + Math.sin(a) * R0 * 0.7), trunkR * 0.5, trunkR * 0.18, 4, BARK_DARK));
    }
    // the dome: a few round lobes (not a lid)
    for (let k = 0; k < 5; k++) {
      const u = fibSphere(k, 5, 0.1, r.float() * 6);
      lobe(1.55 + r.float() * 0.3, V3(lean.x + u.x * R0 * 0.55, H0 - 0.6 + u.y * 0.8, lean.z + u.z * R0 * 0.55), 700 + v * 13 + k, 0.8, 0);
    }
    // the curtain: tresses set round the dome at the golden angle, each a ribbon full-width at the
    // top and narrowing to its tip, bowing out from under the dome and then hanging straight
    const nS = 34;
    for (let i = 0; i < nS; i++) {
      const a = i * GOLDEN, ca = Math.cos(a), sa = Math.sin(a);
      const r0 = R0 * (0.62 + 0.28 * r.float()), bow = 0.35 + r.float() * 0.35;
      const y0 = H0 - 0.4 - (r0 - R0 * 0.6) * 0.9 + j(0.25), y1 = 0.9 + r.float() * 1.3;
      const w0 = 0.75 + r.float() * 0.3;
      const pts: [number, number, number][] = []; // (radius, height, half-width) down the tress
      for (let k = 0; k <= 2; k++) {
        const t = k / 2;
        pts.push([r0 + bow * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2), y0 + (y1 - y0) * t, (w0 / 2) * (1 - 0.6 * t)]);
      }
      const pos: number[] = [];
      const P = (rr: number, y: number, hw: number, side: number): [number, number, number] => [lean.x + ca * rr - sa * hw * side, y, lean.z + sa * rr + ca * hw * side];
      for (let k = 0; k < 2; k++) {
        const A = P(pts[k][0], pts[k][1], pts[k][2], -1), B = P(pts[k][0], pts[k][1], pts[k][2], 1), C = P(pts[k + 1][0], pts[k + 1][1], pts[k + 1][2], 1), D = P(pts[k + 1][0], pts[k + 1][1], pts[k + 1][2], -1);
        pos.push(...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C); // (both faces)
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      leaf.push(g);
    }
  } else if (kind === 'elm') {
    // American elm: the trunk forks low into a vase of limbs that rise and arch out into a broad,
    // high umbrella — the cathedral arch over an old Main Street
    trunkR = 0.3;
    const th = 2.4 + j(0.3), lean = V3(j(0.2), 0, j(0.2)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(bough(V3(0, -0.3, 0), top, trunkR, trunkR * 0.75, 6, BARK_DARK));
    const W = 3.6 + j(0.4), H = 8.4 + j(0.6), limbs = 3;
    for (let i = 0; i < limbs; i++) {
      const a = i * ((2 * Math.PI) / limbs) + r.float() * 0.6;
      const knee = V3(lean.x + Math.cos(a) * W * 0.3, th + 2.6, lean.z + Math.sin(a) * W * 0.3);
      const tip = V3(lean.x + Math.cos(a) * W * 0.78, H - 0.9, lean.z + Math.sin(a) * W * 0.78);
      wood.push(bough(top.clone().add(V3(0, -0.3, 0)), knee, trunkR * 0.6, trunkR * 0.42, 4, BARK_DARK), bough(knee, tip, trunkR * 0.42, trunkR * 0.18, 4, BARK_DARK));
    }
    // the umbrella: one broad dome of overlapping lobes (no sky between them), a flat core to
    // close its middle, and a drooping outer fringe
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.2, r.float() * 6);
      lobe(1.8 + r.float() * 0.3, V3(lean.x + u.x * W * 0.7, H - 0.9 + u.y * 1.5, lean.z + u.z * W * 0.7), 760 + v * 11 + i, 0.8, 0);
    }
    lobe(2.6, V3(lean.x, H - 0.8, lean.z), 775 + v, 0.6, 0);
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI / 2) + 0.4 + r.float() * 0.5;
      lobe(1.45 + r.float() * 0.2, V3(lean.x + Math.cos(a) * W * 0.82, H - 1.9 + j(0.3), lean.z + Math.sin(a) * W * 0.82), 780 + v * 7 + k, 0.85, 0);
    }

  } else if (kind === 'poplar') {
    // Lombardy poplar (and, dark, the Italian cypress): a narrow column of foliage from low on
    // the trunk to a point — the windbreak row, the formal drive, the Tuscan hill
    trunkR = 0.2;
    const H = 11 + j(0.8);
    wood.push(bough(V3(0, -0.3, 0), V3(0, H - 2, 0), trunkR, trunkR * 0.3, 5, BARK));
    // a spindle: lobes a little apart round the axis, overlapping tier on tier so the column
    // reads as one piece, narrowing to the tip
    const tiers = 9;
    for (let t = 0; t < tiers; t++) {
      // (tiers close enough near the tip that each overlaps the next — its top used to float off)
      const f = t / (tiers - 1), y = 1.6 + f * (H - 3.1), rad = 1.12 * (1 - 0.55 * Math.pow(f, 1.4)) * (0.8 + 0.25 * Math.sin(f * Math.PI));
      const k2 = t % 2 ? 1 : 2;
      for (let k = 0; k < k2; k++) {
        const a = t * GOLDEN + k * Math.PI;
        lobe(rad * (0.9 + r.float() * 0.15), V3(Math.cos(a) * rad * 0.22, y + j(0.2), Math.sin(a) * rad * 0.22), 800 + v * 19 + t * 2 + k, 1.45, 0);
      }
    }
  } else if (kind === 'magnolia') {
    // southern magnolia: evergreen, dense, dark and glossy — an egg of foliage, broad at the base
    // and reaching down almost to the lawn, rounding off at the top
    trunkR = 0.24;
    const H = 8.2 + j(0.6);
    wood.push(bough(V3(0, -0.3, 0), V3(j(0.15), H - 1.6, j(0.15)), trunkR, trunkR * 0.4, 6, BARK_DARK));
    const cy = H * 0.5, rx = 2.5 + j(0.2), ry = H * 0.4, n = 13;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.85, r.float() * 6);
      const w = rx * (1 - 0.32 * u.y); // (wider low, narrower high)
      lobe(1.25 + r.float() * 0.2, V3(u.x * w * 0.78, cy + u.y * ry * 0.8, u.z * w * 0.78), 840 + v * 23 + i, 0.9, 0);
    }
    lobe(2.1, V3(0, cy - 0.3, 0), 860 + v, 1.2, 0);
  } else if (kind === 'cherry') {
    // flowering cherry: a short trunk, limbs spreading wide and low, a broad flat-topped crown —
    // in April a cloud of pink (propMaterial's blossom)
    trunkR = 0.2;
    const th = 1.5 + j(0.2), lean = V3(j(0.25), 0, j(0.25)), top = V3(lean.x, th, lean.z);
    leanPer = [lean.x / (th + 0.3), lean.z / (th + 0.3)];
    wood.push(bough(V3(0, -0.3, 0), top, trunkR, trunkR * 0.7, 6, 0x5a3f36));
    for (let i = 0; i < 4; i++) {
      const a = i * GOLDEN + r.float();
      wood.push(bough(top.clone().add(V3(0, -0.2, 0)), V3(lean.x + Math.cos(a) * 2.3, th + 1.7 + j(0.3), lean.z + Math.sin(a) * 2.3), trunkR * 0.55, trunkR * 0.22, 4, 0x5a3f36));
    }
    // a rounded, spreading crown: lobes packed over a wide dome round a flat core
    const n = 12, cy = th + 2.5;
    for (let i = 0; i < n; i++) {
      const u = fibSphere(i, n, -0.5, r.float() * 6);
      lobe(1.4 + r.float() * 0.25, V3(lean.x + u.x * 2.0, cy + u.y * 1.25, lean.z + u.z * 2.0), 880 + v * 13 + i, 0.9, 0);
    }
    lobe(2.2, V3(lean.x, cy, lean.z), 895 + v, 0.75, 0);
    // (the underside breaks into clumps hanging between the limbs — from below it read as a
    // tabletop)
    for (let k = 0; k < 3; k++) {
      const a = k * ((2 * Math.PI) / 3) + 0.5 + r.float() * 0.6, rr = 1.3 + r.float() * 0.5;
      lobe(0.95 + r.float() * 0.2, V3(lean.x + Math.cos(a) * rr, cy - 1.15 - r.float() * 0.25, lean.z + Math.sin(a) * rr), 897 + v * 5 + k, 0.9, 0);
    }
  } else if (isSpire(kind)) {
    // The Northwest's conifers (docs/regional-life/16-pnw.md), one build: a trunk up to the leader and
    // tiers of boughs round it, each bough carrying its clump of foliage — the species in how they
    // stand (SPIRES). Douglas fir: an irregular, clumpy spire, gaps between the clumps; in the forest a
    // long bare trunk with a few dead stubs, the old ones flat-topped on heavy limbs. Western hemlock:
    // finer and narrower, every bough's tip drooping and the leader nodding over; the third stands on
    // stilt roots, where it grew on a nurse log that rotted away. Sitka spruce: broad and open on a
    // buttressed foot, level limbs with the foliage hanging under them. Western redcedar: a fluted,
    // flaring foot, J-shaped boughs that dip and turn up at the tips with lacy sprays hanging from them,
    // the leader drooping; the old one's top a candelabra of dead silver spikes.
    const S = SPIRES[kind][v], bark = S.bark;
    trunkR = S.trunkR;
    const H = S.H + j(0.25), lean = V3(j(0.25), 0, j(0.25));
    leanPer = [lean.x / H, lean.z / H];
    const axis = (y: number) => V3(lean.x * (y / H), y, lean.z * (y / H)); // the trunk's middle at height y
    const foot = S.stilts ? 1.35 : -0.3;
    const yb = H * S.bare, top = S.top === 'snag' ? H - 2.3 : S.top === 'spire' ? H - 0.9 : S.top === 'nod' ? H - 1.2 : H - 0.7;
    const knee = Math.max(foot + 1, Math.min(yb, top - 1.5));
    const base = S.stilts ? axis(foot) : V3(0, -0.3, 0);
    wood.push(twig(base, axis(knee), trunkR, trunkR * 0.72, 6, bark), twig(axis(knee), axis(top), trunkR * 0.72, trunkR * 0.2, 5, bark));
    if (S.stilts) {
      // three roots arching down from the trunk's foot to the ground
      for (let s = 0; s < 3; s++) {
        const a = s * ((2 * Math.PI) / 3) + j(0.3), ca = Math.cos(a), sa = Math.sin(a);
        const g0 = V3(ca * 1.0, -0.3, sa * 1.0), g1 = V3(ca * 0.62, 0.55, sa * 0.62);
        wood.push(twig(g0, g1, 0.15, 0.13, 4, bark), twig(g1, base, 0.13, 0.12, 4, bark));
      }
    }
    // the flaring, fluted foot: buttresses from the ground up into the trunk
    for (let b = 0; b < S.buttress; b++) {
      const a = b * ((2 * Math.PI) / S.buttress) + j(0.3), ca = Math.cos(a), sa = Math.sin(a), y = 1.0 + j(0.3);
      // (from just above the ground: a buttress is the trunk's flare, not a trunk of its own)
      wood.push(twig(V3(ca * trunkR * 2.3, 0.05, sa * trunkR * 2.3), axis(y).add(V3(ca * trunkR * 0.55, 0, sa * trunkR * 0.55)), trunkR * 0.5, trunkR * 0.28, 3, bark));
    }
    // dead stubs on the bare trunk (a forest tree drops its lower limbs as the canopy closes over)
    for (let s = 0; s < S.stubs; s++) {
      const y = 1.8 + (s + 0.5) * ((yb - 2.3) / S.stubs) + j(0.3), a = s * GOLDEN * 2 + r.float();
      if (y > yb - 0.4 || y < 1.2) continue;
      wood.push(twig(axis(y), axis(y).add(V3(Math.cos(a) * (0.5 + r.float() * 0.45), -0.12, Math.sin(a) * (0.5 + r.float() * 0.45))), 0.05, 0.02, 3, SNAG));
    }
    // the tiers: a cone of boughs from the crown's foot to its top, a few to a tier at the golden angle
    // (the tiers come closer together toward the top, so the clumps there can be small and the spire
    // tapers to its point; within a tier each bough sits at its own height, a spiral up the trunk)
    const T = S.rings.length, ct = S.top === 'snag' ? H - 2.3 : top + 0.2, a0 = r.float() * Math.PI * 2;
    const yAt = (u: number) => yb + (ct - yb) * (1 - Math.pow(1 - u, 1.35));
    for (let t = 0; t < T; t++) {
      const f = (t + 0.5) / T, y0 = yAt(t / T), gap = yAt((t + 1) / T) - y0;
      const L0 = S.Rt + (S.R0 - S.Rt) * Math.pow(1 - f, 0.85);
      for (let k = 0; k < S.rings[t]; k++) {
        const a = a0 + t * GOLDEN + (k * 2 * Math.PI) / S.rings[t] + j(S.jit), ca = Math.cos(a), sa = Math.sin(a);
        const y = y0 + gap * ((k + 0.5) / S.rings[t]) + j(gap * 0.15);
        const L = L0 * (1 - S.jit * 0.4 + r.float() * S.jit * 0.8), from = axis(y);
        const out = (d: number, dy: number) => from.clone().add(V3(ca * d, dy, sa * d));
        const br = Math.max(0.035, trunkR * 0.3 * (1 - f * 0.6));
        let c: THREE.Vector3;
        if (S.j) {
          // the J: down and out, then up at the tip; the sprays hang from the dip
          const dip = out(L * 0.55, -L * 0.36), tip = out(L, -L * 0.1);
          if (k === 0 && t < 3) wood.push(twig(from, dip, br, br * 0.6, 3, bark), twig(dip, tip, br * 0.6, br * 0.25, 3, bark));
          c = out(L * 0.5, -L * 0.22);
        } else {
          if (k === 0 && t < T / 2) wood.push(twig(from, out(L * 0.9, (S.lift - S.droop) * L), br, br * 0.3, 3, bark));
          c = out(L * 0.5, (S.lift * 0.5 - S.droop * 0.5) * L);
        }
        // each clump deep enough to reach the next tier's (a cone of foliage, never plates on a pole)
        const rad = Math.max(L * S.lobe, (gap * 0.75) / S.sq) * (0.9 + r.float() * 0.2);
        lobe(rad, c, 1200 + TREE_KINDS.indexOf(kind) * 97 + v * 31 + t * 5 + k, S.sq, 0, { dir: a, stretch: S.stretch, bend: S.bend });
      }
    }
    if (S.top === 'spire') lobe(0.42, axis(H - 0.45), 1290 + v, 2.0, 0);
    else if (S.top === 'nod') {
      // the leader bowing over (a hemlock is known by it from a mile away)
      const a = r.float() * 6.28, k1 = axis(top).add(V3(Math.cos(a) * 0.15, 0.65, Math.sin(a) * 0.15)), tip = k1.clone().add(V3(Math.cos(a) * 0.5, -0.28, Math.sin(a) * 0.5));
      wood.push(twig(axis(top), k1, trunkR * 0.2, 0.03, 3, bark), twig(k1, tip, 0.03, 0.012, 3, bark));
      lobe(0.4, k1.clone().lerp(tip, 0.6), 1291 + v, 1.2, 0);
    } else if (S.top === 'broken') {
      // an old tree's top: the leader long gone, a limb turned up to take its place
      const a = r.float() * 6.28, from = axis(H - 1.9), to = from.clone().add(V3(Math.cos(a) * 0.8, 1.5, Math.sin(a) * 0.8));
      wood.push(twig(from, to, trunkR * 0.25, 0.04, 3, bark));
      lobe(0.75, to, 1292 + v, 0.85, 0);
      lobe(1.05, axis(top + 0.25), 1293 + v, 0.6, 0);
    } else {
      // the candelabra: the old cedar's dead top, silvered, and two spikes beside it
      wood.push(twig(axis(top), axis(H), trunkR * 0.2, 0.03, 4, SNAG));
      for (let s = 0; s < 2; s++) {
        const a = s * Math.PI + r.float(), from = axis(H - 1.9 + s * 0.5);
        wood.push(twig(from, from.clone().add(V3(Math.cos(a) * 0.55, 1.2, Math.sin(a) * 0.55)), 0.06, 0.015, 3, SNAG));
      }
    }
  } else if (kind === 'alder') {
    // red alder: one to three slim, straight stems of pale grey bark blotched white with lichen, and
    // a narrow, rounded crown high on them — the tree of every Northwest stream bank and clearing
    trunkR = 0.17;
    const stems = v + 1, H = 10.6 + j(0.5);
    for (let s = 0; s < stems; s++) {
      const a = s * ((2 * Math.PI) / Math.max(1, stems)) + r.float() * 0.6, ca = Math.cos(a), sa = Math.sin(a);
      const off = stems > 1 ? 0.22 : 0, out = stems > 1 ? 0.9 + r.float() * 0.5 : j(0.3);
      const base = V3(ca * off, -0.3, sa * off), mid = V3(ca * (off + out * 0.35), H * 0.36, sa * (off + out * 0.35));
      const th = H * (stems > 1 ? 0.52 - s * 0.04 : 0.48), top = V3(ca * (off + out), th, sa * (off + out));
      const rr = trunkR * (s ? 0.82 : 1);
      wood.push(bough(base, mid, rr, rr * 0.85, 6, ALDER_BARK), bough(mid, top, rr * 0.85, rr * 0.45, 5, ALDER_BARK));
      if (!s) leanPer = [top.x / (th + 0.3), top.z / (th + 0.3)];
      for (let k = 0; k < 2; k++) {
        const b = a + (k ? 2.2 : -2.2) + j(0.3);
        wood.push(twig(top.clone().add(V3(0, -1.0, 0)), top.clone().add(V3(Math.cos(b) * 0.9, 1.2, Math.sin(b) * 0.9)), rr * 0.35, rr * 0.12, 3, ALDER_BARK));
      }
      // its crown: a narrow oval of small lobes over the stem's top
      const n = stems === 1 ? 10 : stems === 2 ? 6 : 4, rx = stems === 1 ? 1.9 : 1.45, ry = stems === 1 ? 3.0 : 2.4, cy = th + ry * 0.62;
      for (let i = 0; i < n; i++) {
        const u = fibSphere(i, n, -0.6, r.float() * 6);
        lobe((stems === 1 ? 1.25 : 1.1) * (0.88 + r.float() * 0.24), V3(top.x + u.x * rx * 0.72, cy + u.y * ry * 0.72, top.z + u.z * rx * 0.72), 1300 + v * 41 + s * 11 + i, 0.95, 0);
      }
    }
    lobe(1.6, V3(0, H * 0.5 + 2.4, 0), 1340 + v, 1.0, 0);
  } else if (kind === 'vinemaple') {
    // vine maple: a clump of slender stems arching up and out from one root, a few bowing back toward
    // the ground, the leaves held in flat layers along them — a light green sprawl in the shade of the
    // firs, scarlet and orange in October, the older clumps hung with moss
    trunkR = 0.07;
    const stems = [5, 6, 6][v];
    for (let i = 0; i < stems; i++) {
      const a = i * GOLDEN + r.float() * 0.4, ca = Math.cos(a), sa = Math.sin(a);
      const reach = 2.0 + r.float() * 1.3 + v * 0.2, h = i === 0 ? 6.6 : 4.0 + r.float() * 1.8;
      const base = V3(ca * 0.15, -0.25, sa * 0.15), knee = V3(ca * reach * 0.42, h * 0.52, sa * reach * 0.42); // (leaning well out: a sprawl, not a sheaf)
      const tip = V3(ca * reach, h * (0.72 + r.float() * 0.1), sa * reach);
      wood.push(twig(base, knee, 0.075, 0.05, 4, VINE_BARK), twig(knee, tip, 0.05, 0.02, 3, VINE_BARK));
      // the flat layers of leaves along the arch
      lobe(1.0 + r.float() * 0.2, knee.clone().lerp(tip, 0.3).add(V3(0, 0.15, 0)), 1400 + v * 29 + i * 2, 0.62, 0, { dir: a, stretch: 1.2, bend: 0.35 });
      lobe(1.1 + r.float() * 0.2, tip.clone().add(V3(ca * 0.2, 0.05, sa * 0.2)), 1401 + v * 29 + i * 2, 0.62, 0, { dir: a, stretch: 1.25, bend: 0.45 });
      if (v && i % 2 === 0) drape(knee, tip, 0.04, 1, 0);
    }
    lobe(1.0, V3(j(0.3), 4.4, j(0.3)), 1440 + v, 0.6, 0);
  } else if (isPine(kind) && PINES[kind][v].form === 'grass') {
    // the longleaf's grass stage: for its first years no trunk at all — a fountain of foot-long needles
    // from a bud at the sand, the young ones standing up in the middle, the old arching out and down
    // (it is putting down its taproot, and fire passes over it); the fountain shivers in the wind
    // (MOTION 3). Its far model at every distance: its needles are already blades.
    const P = PINES[kind][v];
    trunkR = P.trunkR;
    wood.push(twig(V3(0, -0.3, 0), V3(0, 0.2, 0), P.trunkR, P.trunkR * 0.45, 4, P.bark));
    // the bud at its heart, silver-white
    wood.push(part(blob(0.07, 2700 + v, { detail: 0, squash: 1.6 }).translate(0, 0.3, 0), 0xdcd6c4));
    const n = 28, a0 = r.float() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const t = i / n, len = (0.75 + r.float() * 0.35) * P.H, up = 1.2 - t * 0.75 + j(0.08);
      const blade = card(0.11, len, 0.45 + t * 0.3, 2);
      blade.rotateX(-up);
      blade.rotateY(a0 + i * GOLDEN);
      leaf.push(blade.translate(0, 0.2, 0));
    }
  } else if (isPine(kind) && PINES[kind][v].form === 'brush') {
    // the longleaf's bottlebrush: a single stout stem shooting up out of the grass stage, unbranched, its
    // top half thick with long needles standing out all round it, a fat brush at the tip round the
    // silver candle of its bud
    const P = PINES[kind][v], ki = TREE_KINDS.indexOf(kind);
    trunkR = P.trunkR;
    const H = P.H + j(0.3), lean = V3(j(P.lean), 0, j(P.lean));
    leanPer = [lean.x / H, lean.z / H];
    const axis = (y: number) => V3((lean.x * y) / H, y, (lean.z * y) / H);
    wood.push(twig(V3(0, -0.3, 0), axis(H * 0.5), P.trunkR, P.trunkR * 0.82, 6, P.bark), twig(axis(H * 0.5), axis(H - 0.3), P.trunkR * 0.82, P.trunkR * 0.45, 5, P.bark));
    wood.push(part(blob(0.09, 2710 + v, { detail: 0, squash: 2.0 }).translate(axis(H - 0.15).x, H - 0.15, axis(H - 0.15).z), 0xdcd6c4));
    const y0 = H * P.bare, n = 8;
    for (let i = 0; i < n; i++) {
      const y = y0 + ((i + 0.5) / n) * (H - 1.0 - y0), a = i * GOLDEN + j(0.3);
      lobe(P.tuft * (0.9 + r.float() * 0.25), axis(y).add(V3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22)), 2720 + ki * 13 + i, P.sq, 0, { dir: a, stretch: 1.3, bend: 0.5 });
    }
    lobe(P.tuft * 1.3, axis(H - 0.7), 2735 + v, 1.3, 0);
  } else if (isPine(kind)) {
    const P = PINES[kind][v], ki = TREE_KINDS.indexOf(kind);
    trunkR = P.trunkR;
    const H = P.H + j(0.3), lean = V3(j(P.lean), 0, j(P.lean));
    leanPer = [lean.x / H, lean.z / H];
    const axis = (y: number) => V3((lean.x * y) / H, y, (lean.z * y) / H);
    const topY = P.top === 'flat' ? H - 0.6 : H - 0.4;
    wood.push(twig(V3(0, -0.3, 0), axis(H * 0.5), P.trunkR, P.trunkR * 0.7, 6, P.bark), twig(axis(H * 0.5), axis(topY), P.trunkR * 0.7, P.trunkR * 0.25, 5, P.bark));
    const y0 = H * P.bare, y1 = topY - 0.3, T = P.tiers.length, flagDir = r.float() * Math.PI * 2;
    for (let t = 0; t < T; t++) {
      const f = T > 1 ? t / (T - 1) : 0, y = y0 + (y1 - y0) * f, reach = P.reach[0] + (P.reach[1] - P.reach[0]) * f;
      for (let k = 0; k < P.tiers[t]; k++) {
        let a = t * GOLDEN + (k * 2 * Math.PI) / P.tiers[t] + j(0.3), short = 1;
        if (P.flag) {
          // (the old white pine's limbs flagged downwind: pulled round to one side, the windward ones short)
          const d = Math.atan2(Math.sin(a - flagDir), Math.cos(a - flagDir));
          a = flagDir + d * (1 - P.flag * 0.6);
          if (Math.abs(d) > 1.7) short = 0.5;
        }
        const ca = Math.cos(a), sa = Math.sin(a), L = reach * (0.85 + r.float() * 0.3) * short;
        const from = axis(y), tip = from.clone().add(V3(ca * L, P.rise * L + j(0.15), sa * L)), br = Math.max(0.035, P.trunkR * 0.32 * (1 - f * 0.5));
        if (P.crook) {
          // (an old southern pine's heavy limb: up off the bole, then crooking out — never a straight rod)
          const knee = from.clone().lerp(tip, 0.45).add(V3(j(P.crook), P.crook * 0.6, j(P.crook)));
          wood.push(twig(from, knee, br * 1.3, br * 0.8, 3, P.bark), twig(knee, tip, br * 0.8, 0.03, 3, P.bark));
        } else wood.push(twig(from, tip, br, 0.03, 3, P.bark));
        // its tuft of needles: a spray drawn out along the bough (the southern pines' long needles in
        // brushes, drooping)
        lobe(P.tuft * (0.9 + r.float() * 0.2) * (1 - 0.25 * f), tip.clone().add(V3(0, P.tuft * 0.15, 0)), 1700 + ki * 61 + v * 37 + t * 5 + k, P.sq, 0, { dir: a, stretch: P.stretch ?? 1.25, bend: P.bend ?? 0.2 });
      }
    }
    if (P.top === 'point') lobe(P.tuft * 0.55, axis(H - 0.5), 1790 + ki * 7 + v, 1.6, 0);
    else lobe(P.tuft * (P.top === 'flat' ? 1.3 : 1.1), axis(topY + 0.15), 1790 + ki * 7 + v, P.top === 'flat' ? 0.45 : 0.7, 0);
  } else if (kind === 'aspen') {
    // quaking aspen: one straight white stem (the third, two of a clone), dark "eyes" where its lower
    // branches fell, and a narrow oval crown high on it of small round leaves that tremble on their
    // flat stalks (propMaterial flutter) — lime green in late May, gold in September, bare and white
    // in the winter grove
    trunkR = 0.13;
    const stems = v === 2 ? 2 : 1, H = (v === 0 ? 10.4 : 11.6) + j(0.4);
    for (let s = 0; s < stems; s++) {
      const a = r.float() * Math.PI * 2, off = s ? 0.9 : 0, base = V3(Math.cos(a) * off, -0.3, Math.sin(a) * off);
      const top = V3(base.x + j(0.3), H * (s ? 0.88 : 1) - 2.4, base.z + j(0.3)), mid = base.clone().lerp(top, 0.5);
      const R = trunkR * (s ? 0.85 : 1);
      wood.push(twig(base, mid, R, R * 0.85, 6, ASPEN_BARK), twig(mid, top, R * 0.85, R * 0.4, 5, ASPEN_BARK));
      if (!s) leanPer = [top.x / H, top.z / H];
      // the eyes: dark scars up the bare stem, drawn by both models
      for (let e = 0; e < 4; e++) {
        const y = 1.4 + e * ((top.y * 0.62 - 1.4) / 4) + j(0.2), t = (y - base.y) / (top.y - base.y), c = base.clone().lerp(top, t);
        const ea = r.float() * Math.PI * 2, ex = Math.cos(ea), ez = Math.sin(ea), rr = R * (1 - 0.3 * t) * 1.04;
        const g = new THREE.BufferGeometry(), w = 0.1, h = 0.07;
        const P0 = [c.x + ex * rr, c.y, c.z + ez * rr], tx = -ez * w, tz = ex * w;
        const q = [[P0[0] - tx, P0[1], P0[2] - tz], [P0[0], P0[1] + h, P0[2]], [P0[0] + tx, P0[1], P0[2] + tz], [P0[0], P0[1] - h, P0[2]]];
        g.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3], ...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]], 3));
        g.computeVertexNormals();
        plan.hang.push(part(g, ASPEN_EYE));
      }
      for (let k = 0; k < 3; k++) {
        const b = a + k * 2.1 + r.float() * 0.5;
        wood.push(twig(top.clone().add(V3(0, -1.5, 0)), top.clone().add(V3(Math.cos(b) * 0.9, 0.9, Math.sin(b) * 0.9)), R * 0.35, R * 0.12, 3, ASPEN_BARK));
      }
      const n = stems > 1 ? 6 : 9, rx = stems > 1 ? 1.2 : 1.5, ry = 2.6, cy = top.y + 0.9;
      for (let i = 0; i < n; i++) {
        const u = fibSphere(i, n, -0.6, r.float() * 6);
        lobe(0.95 * (0.9 + r.float() * 0.2), V3(top.x + u.x * rx * 0.75, cy + u.y * ry * 0.72, top.z + u.z * rx * 0.75), 1860 + v * 31 + s * 13 + i, 0.95, 0);
      }
    }
    lobe(1.2, V3(0, H - 1.3, 0), 1890 + v, 1.1, 0);
  } else if (kind === 'willowshrub') {
    // a willow thicket (and red-osier dogwood, its look-alike): a dense clump of thin stems fanning up
    // from one base, coloured — red, gold, purple — and glowing in a bare winter, narrow leaves in sprays
    // along their upper half; along every mountain creek and northern bog, the moose's browse
    trunkR = 0.06;
    const col = WILLOW_STEMS[v], H = 3.4 + j(0.3);
    for (let i = 0; i < 8; i++) {
      const a = i * GOLDEN + r.float() * 0.5, ca = Math.cos(a), sa = Math.sin(a), out = 0.6 + r.float() * 1.0, h = H * (0.65 + r.float() * 0.35);
      const base = V3(ca * 0.12, -0.2, sa * 0.12), tip = V3(ca * out, h, sa * out), mid = base.clone().lerp(tip, 0.5).add(V3(-ca * 0.1, 0, -sa * 0.1));
      wood.push(twig(base, mid, 0.05, 0.035, 3, col), twig(mid, tip, 0.035, 0.012, 3, col));
      lobe(0.62 + r.float() * 0.2, mid.clone().lerp(tip, 0.62), 1920 + v * 17 + i, 0.85, 0, { dir: a, stretch: 1.5, bend: 0.2 });
    }
    lobe(1.0, V3(j(0.2), H * 0.72, j(0.2)), 1950 + v, 0.85, 0);
  } else if (kind === 'snag') {
    // a standing dead tree, grey all year: v0 a dead conifer's spike with its dead stubs (beetle-kill,
    // an adelgid's ghost hemlock), v1 a dead broadleaf's bare limbs (an ash the borer took), v2 a
    // drowned trunk snapped off in a beaver pond, a woodpecker's hole in it
    trunkR = v === 1 ? 0.26 : v === 2 ? 0.28 : 0.2;
    const H = v === 2 ? 5.5 + j(0.4) : 11.5 + j(0.6), lean = V3(j(0.4), 0, j(0.4));
    leanPer = [lean.x / H, lean.z / H];
    const axis = (y: number) => V3((lean.x * y) / H, y, (lean.z * y) / H);
    wood.push(twig(V3(0, -0.3, 0), axis(H * 0.5), trunkR, trunkR * 0.75, 6, SNAG), twig(axis(H * 0.5), axis(H), trunkR * 0.75, v === 0 ? 0.03 : trunkR * 0.55, 5, SNAG));
    if (v === 0) {
      for (let k = 0; k < 10; k++) {
        const y = 2.0 + k * ((H - 2.6) / 10) + j(0.2), a = k * GOLDEN + r.float() * 0.4, L = (1.3 - (k / 10) * 0.9) * (0.7 + r.float() * 0.5);
        wood.push(twig(axis(y), axis(y).add(V3(Math.cos(a) * L, -0.15 * L, Math.sin(a) * L)), 0.045, 0.012, 3, SNAG));
      }
    } else if (v === 1) {
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + r.float() * 0.6, from = axis(H * (0.55 + k * 0.1)), knee = from.clone().add(V3(Math.cos(a) * 1.4, 1.5, Math.sin(a) * 1.4)), tip = knee.clone().add(V3(Math.cos(a + 0.4) * 1.0, 1.3 - k * 0.3, Math.sin(a + 0.4) * 1.0));
        wood.push(twig(from, knee, trunkR * 0.45, trunkR * 0.3, 4, SNAG), twig(knee, tip, trunkR * 0.3, 0.025, 3, SNAG));
        wood.push(twig(knee, knee.clone().add(V3(Math.cos(a - 1) * 0.7, 0.8, Math.sin(a - 1) * 0.7)), 0.04, 0.012, 3, SNAG));
      }
    } else {
      // the snapped top's splinters, and the woodpecker's hole
      for (let k = 0; k < 2; k++) { const a = k * 3 + r.float(); wood.push(twig(axis(H - 0.1), axis(H - 0.1).add(V3(Math.cos(a) * 0.1, 0.6 + k * 0.3, Math.sin(a) * 0.1)), 0.06, 0.01, 3, SNAG)); }
      const c = axis(H * 0.62), g = new THREE.BufferGeometry(), hr = 0.09, ox = trunkR * 0.68 * 1.05;
      g.setAttribute('position', new THREE.Float32BufferAttribute([c.x + ox, c.y - hr, c.z - hr, c.x + ox, c.y + hr, c.z - hr, c.x + ox, c.y + hr, c.z + hr, c.x + ox, c.y - hr, c.z - hr, c.x + ox, c.y + hr, c.z + hr, c.x + ox, c.y - hr, c.z + hr], 3));
      g.computeVertexNormals();
      plan.hang.push(part(g, 0x1e1a16));
    }
  } else if (isOak(kind)) {
    // The live oaks (OAKS): the trunk (or a mott's trunks) to the fork, the limbs off it, the billows
    // and the dome. The southern live oak's limbs sweep out twice as far as the tree stands, the outer
    // ends low and some resting on the ground; the plateau oak small and dense; the coast live oak's
    // limbs snaking under a round dome. (Package #4 on the same plan: the sycamore's limbs climbing
    // steeply and going white, the bur oak's thick and crooked.)
    const O = OAKS[kind][v], bark = O.bark, ki = TREE_KINDS.indexOf(kind), upper = O.upper ?? bark;
    // (the live oaks' long sprawling limbs a side rounder: the others' are hidden more by their crowns)
    const sides = LIVE_OAKS.has(kind) ? [5, 4, 3] : [4, 3, 3];
    trunkR = O.trunkR;
    const a0 = r.float() * Math.PI * 2;
    const forks: THREE.Vector3[] = [], stemPath: [THREE.Vector3, THREE.Vector3, THREE.Vector3, number][] = [];
    for (let s = 0; s < O.stems; s++) {
      // (one trunk leans its own way; a mott's trunks lean out from one root crown)
      const a = O.stems > 1 ? a0 + (s * 2 * Math.PI) / O.stems + j(0.35) : a0 + Math.PI + j(0.4), ca = Math.cos(a), sa = Math.sin(a);
      const off = O.stems > 1 ? 0.28 : 0, R = O.trunkR * (s ? 0.86 : 1);
      const foot = V3(ca * off, -0.3, sa * off), mid = V3(ca * (off + O.lean * 0.4), O.fork * 0.5, sa * (off + O.lean * 0.4)), fork = V3(ca * (off + O.lean), O.fork + j(0.15), sa * (off + O.lean));
      const ts = O.stems > 1 && !LIVE_OAKS.has(kind) ? 5 : 7; // (two trunks: within the far budget)
      wood.push(twig(foot, mid, R, R * 0.9, ts, bark), twig(mid, fork, R * 0.9, R * 0.78, ts, bark));
      if (!s) leanPer = [fork.x / (O.fork + 0.3), fork.z / (O.fork + 0.3)];
      forks.push(fork);
      stemPath.push([foot, mid, fork, R]);
    }
    const rests = new Set<number>();
    for (let i = 0; i < O.rest; i++) rests.add((i * 2 + 1) % O.limbs);
    const leanA = a0 + Math.PI; // (where the first trunk leans)
    for (let i = 0; i < O.limbs; i++) {
      const F = forks[i % forks.length];
      let a = a0 + i * GOLDEN + j(0.25);
      // (pulled round toward the lean: the streamside sycamore's crown hangs out over the water)
      if (O.bias) a = leanA + Math.atan2(Math.sin(a - leanA), Math.cos(a - leanA)) * (1 - O.bias);
      const ca = Math.cos(a), sa = Math.sin(a);
      const L = O.reach[0] + r.float() * (O.reach[1] - O.reach[0]);
      // the limb's way out, wandering sideways (the coast live oak's snake)
      const wob = r.float() * 6.28;
      const at = (t: number, y: number) => V3(F.x + ca * L * t - sa * Math.sin(t * 4.2 + wob) * O.snake * t, y, F.z + sa * L * t + ca * Math.sin(t * 4.2 + wob) * O.snake * t);
      const rest = rests.has(i);
      // up off the fork, levelling, and the outer third down again — or, resting, down to the ground
      // two thirds of the way out and up again at the end
      const p1 = at(0.28, F.y + O.up * (rest ? 0.45 : 0.85) + j(0.2));
      const p2 = rest ? at(0.66, 0.16) : at(0.6, F.y + O.up + j(0.25));
      const p3 = rest ? at(1, 1.0 + r.float() * 0.5) : at(1, F.y + O.up - O.droop + j(0.3)); // (a long sag down to the ground and a gentle rise)
      // (a resting limb stays heavy all the way to the ground: it is the oak's biggest wood)
      const R0 = O.trunkR * (O.stems > 1 ? 0.78 : O.limbR ?? 0.62), k1 = rest ? 0.86 : 0.72, k2 = rest ? 0.66 : 0.46, k3 = rest ? 0.3 : 0.2;
      wood.push(twig(F, p1, R0, R0 * k1, sides[0], bark), twig(p1, p2, R0 * k1, R0 * k2, sides[1], upper), twig(p2, p3, R0 * k2, R0 * k3, sides[2], upper));
      // the billows (the near model grows its branches out into them): one over the limb's middle, and
      // at its end a cluster a little lower — a big one and a smaller one off its side — the
      // umbrella's lumpy rim, never a plate
      const sd = r.float() < 0.5 ? 1 : -1, sid = V3(-sa * sd, 0, ca * sd);
      lobe(O.billow * (0.95 + r.float() * 0.15), p1.clone().lerp(p2, 0.55).add(V3(0, O.billow * 0.5, 0)), 1500 + ki * 53 + v * 29 + i * 3, O.sq, 0);
      lobe(O.billow * (0.85 + r.float() * 0.15), p3.clone().add(V3(ca * 0.3, O.billow * 0.32, sa * 0.3)), 1501 + ki * 53 + v * 29 + i * 3, O.sq, 0);
      lobe(O.billow * (0.6 + r.float() * 0.12), p3.clone().lerp(p2, 0.3).add(sid.clone().multiplyScalar(O.billow * 0.75)).add(V3(0, O.billow * 0.55, 0)), 1502 + ki * 53 + v * 29 + i * 3, O.sq * 1.05, 0);
      if (O.low) lobe(O.billow * (0.72 + r.float() * 0.12), p1.clone().lerp(p2, 0.2).add(sid.clone().multiplyScalar(-O.billow * 0.45)).add(V3(ca * 0.5, -O.billow * 0.15, sa * 0.5)), 1640 + ki * 17 + v * 7 + i, O.sq, 0);
    }
    // the dome over the fork: a broad crown and a second billow beside it, lifting the middle
    const dm = forks.reduce((m, f) => m.add(f), V3(0, 0, 0)).multiplyScalar(1 / forks.length);
    lobe(O.dome, V3(dm.x + j(0.4), O.H - O.dome * O.sq, dm.z + j(0.4)), 1590 + ki * 7 + v, O.sq * 0.92, 0);
    const da = a0 + GOLDEN * 0.5;
    lobe(O.dome * 0.72, V3(dm.x + Math.cos(da) * O.dome * 0.85, O.H - O.dome * O.sq * 1.25, dm.z + Math.sin(da) * O.dome * 0.85), 1597 + ki * 7 + v, O.sq, 0);
    if (O.stub) {
      // a limb broken short long ago, its end silvered
      const a = a0 + Math.PI * 0.5, F = forks[0], tip = F.clone().add(V3(Math.cos(a) * 1.7, 0.7, Math.sin(a) * 1.7));
      wood.push(twig(F, tip, O.trunkR * 0.36, O.trunkR * 0.3, sides[0], SNAG));
    }
    // a dead limb standing up out of the crown, grey and bare (an old bur oak's stag-head)
    for (let d = 0; d < (O.dead ?? 0); d++) {
      const a = a0 + Math.PI * 1.3 + d * 2.1, F = forks[0], k = F.clone().add(V3(Math.cos(a) * 1.4, O.up * 0.8, Math.sin(a) * 1.4));
      const tip = k.clone().add(V3(Math.cos(a) * 1.6, O.H - O.fork - O.up * 0.5, Math.sin(a) * 1.6));
      wood.push(twig(F, k, O.trunkR * 0.3, O.trunkR * 0.2, 3, SNAG), twig(k, tip, O.trunkR * 0.2, 0.03, 3, SNAG));
    }
    // the sycamore's mottle: patches where the bark has flaked, cream, olive and brown on the trunk
    for (let m = 0; m < (O.mottle ?? 0); m++) {
      const [foot, mid, F, R0] = stemPath[m % stemPath.length], y = 1.0 + r.float() * (O.fork - 1.4);
      const c = y < mid.y ? foot.clone().lerp(mid, (y - foot.y) / (mid.y - foot.y)) : mid.clone().lerp(F, (y - mid.y) / (F.y - mid.y));
      // (a little proud of the bark, and of the near model's flaring trunk)
      const R = R0 * (1 - 0.22 * (y + 0.3) / (F.y + 0.3)) * 1.12 + 0.01;
      plan.hang.push(part(patch(c, r.float() * Math.PI * 2, R, 0.12 + r.float() * 0.12, 0.16 + r.float() * 0.2), SYC_PATCH[m % SYC_PATCH.length]));
    }
  } else if (isLeader(kind)) {
    // The eastern hardwoods on a leader (LEADERS; docs/regional-life/04-appalachia.md, 05, 10): a
    // straight trunk up through the crown, limbs off it in a spiral, the crown's lobes along it in the
    // species' own outline — the tulip tree's high narrow oval on its ramrod, the young sweetgum's
    // pyramid, the hickory's tall oval on a shaggy bole, the buckeye's low round crown.
    const L = LEADERS[kind][v], bark = L.bark, ki = TREE_KINDS.indexOf(kind);
    trunkR = L.trunkR;
    const H = L.H + j(0.3), lean = V3(j(L.lean), 0, j(L.lean));
    leanPer = [lean.x / H, lean.z / H];
    // the trunk's middle at height y: a sweep that grows toward the top (a tree reaching for light)
    const axis = (y: number) => { const f = Math.pow(Math.max(0, y) / H, 1.4); return V3(lean.x * f, y, lean.z * f); };
    const yb = H * L.bare, top = H - L.lobeR * L.sq * 0.7, a0 = r.float() * Math.PI * 2;
    // the crown's half-width at t (0 its foot … 1 its top), a share of R
    const prof = (t: number) => L.shape === 'cone' ? Math.min(1, 0.45 + t * 4) * Math.pow(1 - t, 0.85)
      : L.shape === 'round' ? Math.sqrt(Math.max(0.05, 1 - Math.pow(2 * t - 1, 2)))
        : L.shape === 'dome' ? Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + 0.7 * t)), 0.6)
          : Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * t)), 0.7);
    if (L.fork) {
      // forked low: three stems climbing out of the fork, hidden in the crown
      const F = axis(L.fork);
      wood.push(twig(V3(0, -0.3, 0), F, trunkR, trunkR * 0.86, 7, bark));
      for (let s = 0; s < 3; s++) {
        const a = a0 + (s * 2 * Math.PI) / 3 + j(0.3), ca = Math.cos(a), sa = Math.sin(a), out = L.R * (0.4 + r.float() * 0.12);
        const mid = F.clone().add(V3(ca * out * 0.55, (top - L.fork) * 0.42, sa * out * 0.55)), tip = axis(top - 0.6).add(V3(ca * out, 0, sa * out));
        wood.push(twig(F, mid, trunkR * 0.66, trunkR * 0.5, 5, bark), twig(mid, tip, trunkR * 0.5, trunkR * 0.18, 4, bark));
      }
    } else {
      const mid = axis(Math.max(yb, H * 0.42));
      wood.push(twig(V3(0, -0.3, 0), mid, trunkR, trunkR * 0.76, 7, bark), twig(mid, axis(top), trunkR * 0.76, trunkR * 0.2, 5, bark));
    }
    // the limbs: a spiral up the crown's lower two thirds, each rising out to the crown's edge
    for (let i = 0; i < L.limbs; i++) {
      const t = ((i + 0.6) / L.limbs) * 0.7, y = yb + (top - yb) * t + j(0.25), a = a0 + i * GOLDEN + j(0.35), ca = Math.cos(a), sa = Math.sin(a);
      const w = L.R * prof(Math.min(1, t + 0.12)) * (0.62 + r.float() * 0.22), from = axis(y);
      const tip = from.clone().add(V3(ca * w, w * L.rise + 0.25, sa * w)), knee = from.clone().lerp(tip, 0.45).add(V3(0, w * 0.12, 0));
      const lr = Math.max(0.05, trunkR * (0.5 - 0.25 * t));
      wood.push(twig(from, knee, lr, lr * 0.7, 4, bark), twig(knee, tip, lr * 0.7, lr * 0.25, 3, bark));
    }
    // the crown: its heart first — one or two big lobes up the leader, a mass for the outline to sit on
    // (never a single file of balls round a hollow) — then the outline's lobes spiralling up it at the
    // golden angle, each at the outline's width there, every third pulled in by `core`
    const y0 = yb + L.lobeR * L.sq * 0.55, span = top - y0, cores = span > 2.4 * L.R ? 2 : 1, n = L.lobes - cores;
    for (let c = 0; c < cores; c++) {
      const t = cores === 1 ? 0.42 : c ? 0.66 : 0.28, w = L.R * prof(t), rad = Math.max(L.lobeR, w * 0.78);
      lobe(rad, axis(y0 + span * t).add(V3(j(0.2), 0, j(0.2))), 2080 + ki * 13 + v * 3 + c, Math.min(1.6, Math.max(L.sq, (span / cores) * 0.5 / rad)), 0);
    }
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (i + 0.5) / n + j(0.03))), a = a0 + i * GOLDEN + j(0.3), w = L.R * prof(t);
      const rad = L.lobeR * (0.72 + 0.28 * prof(t)) * (0.88 + r.float() * 0.24);
      const off = Math.max(0, w - rad * 0.8) * (i % 3 === 2 ? L.core : 0.9 + r.float() * 0.15);
      lobe(rad, axis(y0 + span * t).add(V3(Math.cos(a) * off, j(0.15), Math.sin(a) * off)), 2100 + ki * 59 + v * 31 + i, L.sq, 0);
    }
    lobe(L.lobeR * (L.shape === 'cone' ? 0.6 : 0.85), axis(top + L.lobeR * 0.15), 2190 + ki * 7 + v, L.sq * (L.shape === 'cone' ? 1.5 : 1), 0); // (the crown's top: a young sweetgum's a point)
    // dead limbs standing out of the crown, silvered
    for (let d = 0; d < (L.dead ?? 0); d++) {
      const y = yb + (top - yb) * (0.4 + d * 0.22), a = a0 + Math.PI * (0.6 + d * 0.9), from = axis(y), reach = L.R * prof(0.5) + 0.6;
      const tip = from.clone().add(V3(Math.cos(a) * reach, 1.0 + r.float() * 0.6, Math.sin(a) * reach)), k = from.clone().lerp(tip, 0.6);
      wood.push(twig(from, tip, Math.max(0.05, trunkR * 0.22), 0.025, 3, SNAG), twig(k, k.clone().add(V3(Math.cos(a + 1) * 0.6, 0.7, Math.sin(a + 1) * 0.6)), 0.03, 0.01, 3, SNAG));
    }
    if (L.stub) {
      // a limb broken short on the bare bole
      const y = Math.max(2.2, yb * 0.7), a = a0 + 2.4, from = axis(y);
      wood.push(twig(from, from.clone().add(V3(Math.cos(a) * 0.7, 0.25, Math.sin(a) * 0.7)), trunkR * 0.32, trunkR * 0.26, 4, SNAG));
    }
    // the shagbark: long strips of bark loose at both ends, curling away from the trunk — lying on it at
    // their middles, pale over the dark bark between them
    const shag = L.shag ?? 0, hb = Math.max(yb, 2.6);
    for (let s = 0; s < shag; s++) {
      const y = 0.55 + ((s + 0.3 + r.float() * 0.4) / shag) * (hb - 1.1), a = s * GOLDEN * 2 + r.float() * 0.8, c = axis(y);
      const R = trunkR * (1 - (0.24 * y) / H) * 1.12 + 0.01, len = 0.5 + r.float() * 0.45, w = 0.07 + r.float() * 0.05, curl = 0.06 + r.float() * 0.08;
      const ca = Math.cos(a), sa = Math.sin(a), tx = -sa * w * 0.5, tz = ca * w * 0.5;
      const ring = [[R + curl, len / 2], [R, 0], [R + curl * 1.3, -len / 2]].map(([rr, dy]) => V3(c.x + ca * rr, c.y + dy, c.z + sa * rr));
      const pos: number[] = [];
      for (let k = 0; k < 2; k++) {
        const A = ring[k], B = ring[k + 1];
        const q = [[A.x - tx, A.y, A.z - tz], [A.x + tx, A.y, A.z + tz], [B.x + tx, B.y, B.z + tz], [B.x - tx, B.y, B.z - tz]];
        pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3], ...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]); // (both faces)
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      plan.hang.push(part(g, HICKORY_SHAG));
    }
  } else if (kind === 'dogwood') {
    // flowering dogwood: a short trunk forking low into limbs held out level, its leaves in flat tiers one
    // over another with air between them — the layered understory tree of every eastern wood's edge,
    // white with its four-bracted flowers in April (propMaterial blossom 2), burgundy in the fall, the
    // tiers bobbing each on its own beat (MOTION 2). v0 grown in a yard (low, wide, its tiers near the
    // lawn), v1 in a wood's shade (leaning to the light, sparse tiers with sky between), v2 an old one
    // of two stems. Tiers: [height, reach, sprays].
    const D = [
      { stems: 1, fork: 1.0, lean: 0.3, sq: 0.52, tiers: [[1.7, 2.6, 4], [2.8, 2.4, 4], [3.9, 1.9, 4], [4.9, 1.3, 3]] },
      { stems: 1, fork: 1.8, lean: 1.0, sq: 0.46, tiers: [[2.6, 2.4, 3], [3.9, 2.2, 3], [5.1, 1.8, 3], [6.1, 1.1, 2]] },
      { stems: 2, fork: 1.2, lean: 0.5, sq: 0.52, tiers: [[1.9, 2.7, 4], [3.0, 2.5, 4], [4.1, 2.0, 4], [5.1, 1.4, 3]] },
    ][v];
    trunkR = 0.13;
    const a0 = r.float() * Math.PI * 2, la = a0 + Math.PI, lx = Math.cos(la) * D.lean, lz = Math.sin(la) * D.lean;
    const H = D.tiers[D.tiers.length - 1][0] + 0.6;
    leanPer = [lx / H, lz / H];
    const axis = (y: number) => V3(lx * (y / H), y, lz * (y / H));
    for (let s = 0; s < D.stems; s++) {
      const o = s ? V3(Math.cos(a0) * 0.3, 0, Math.sin(a0) * 0.3) : V3(0, 0, 0), R = trunkR * (s ? 0.8 : 1);
      wood.push(twig(o.clone().add(V3(0, -0.3, 0)), axis(D.fork).add(o), R, R * 0.8, 6, DOGWOOD_BARK));
      if (!s) wood.push(twig(axis(D.fork), axis(H - 0.5), R * 0.8, R * 0.25, 4, DOGWOOD_BARK)); // (the leader, weak in the crown)
    }
    D.tiers.forEach(([y, reach, k], t) => {
      for (let q = 0; q < k; q++) {
        const a = a0 + t * GOLDEN + (q * 2 * Math.PI) / k + j(0.3), ca = Math.cos(a), sa = Math.sin(a);
        const R = reach * (0.85 + r.float() * 0.3), from = axis(y - 0.25), c = axis(y).add(V3(ca * R * 0.55, j(0.12), sa * R * 0.55));
        wood.push(twig(from, c.clone().add(V3(ca * R * 0.15, -0.05, sa * R * 0.15)), 0.045, 0.015, 3, DOGWOOD_BARK));
        // a flat spray of leaves along the limb, its tips turned up a little (the tier's plate)
        lobe(R * 0.48, c, 2300 + v * 41 + t * 7 + q, D.sq, 0, { dir: a, stretch: 1.4, bend: -0.12 });
      }
    });
  } else if (isClump(kind)) {
    // Many stems from one root (CLUMPS): the redbud's few trunks under a flat-topped spread, magenta
    // along its bare twigs in March (blossom 3); the crape myrtle's vase of smooth mottled stems, its
    // summer cones each tree's own colour (blossom 4), or pollarded into knuckles; the rosebay's
    // crooked stems arching out over a creek, white-pink trusses in June (blossom 5).
    const C = CLUMPS[kind][v], bark = C.bark, ki = TREE_KINDS.indexOf(kind);
    trunkR = C.trunkR;
    const a0 = r.float() * Math.PI * 2, la = a0 + Math.PI * 0.5;
    const lx = Math.cos(la) * (C.lean ?? 0), lz = Math.sin(la) * (C.lean ?? 0);
    const tips: THREE.Vector3[] = [], knees: THREE.Vector3[] = [], stemsAt: [THREE.Vector3, THREE.Vector3, number][] = [];
    let base0: THREE.Vector3 | null = null;
    if (C.fork) {
      base0 = V3(lx * 0.25, C.fork, lz * 0.25);
      wood.push(twig(V3(0, -0.3, 0), base0, trunkR, trunkR * 0.85, 6, bark));
      stemsAt.push([V3(0, -0.3, 0), base0, trunkR]);
    }
    const sideSides = C.stems > 5 ? [4, 3] : [5, 4];
    for (let s = 0; s < C.stems; s++) {
      const a = a0 + (s * 2 * Math.PI) / C.stems + j(0.45), ca = Math.cos(a), sa = Math.sin(a);
      const R = C.trunkR * (base0 ? 0.68 : s ? 0.78 + r.float() * 0.2 : 1);
      const foot = base0 ? base0.clone() : V3(ca * C.spread, -0.3, sa * C.spread);
      const out = C.out * (0.8 + r.float() * 0.4), h = C.H * C.top * (0.86 + r.float() * 0.2);
      // (the zigzag: the stem's knee kicked sideways, the redbud's and the crape myrtle's sinuous stems)
      const zz = (C.zig ?? 0) * (r.float() < 0.5 ? -1 : 1);
      const knee = V3(ca * out * 0.38 - sa * zz + lx * C.knee, foot.y + (h - foot.y) * C.knee, sa * out * 0.38 + ca * zz + lz * C.knee);
      const tip = V3(ca * out + lx, h - (C.arch ?? 0) * out * 0.6, sa * out + lz);
      if (C.arch) {
        // the rosebay's stem rising and bowing back over: up past the knee, then out and down to its tip
        const crown = knee.clone().lerp(tip, 0.5).add(V3(0, C.arch * out * 0.9, 0));
        wood.push(twig(foot, knee, R, R * 0.8, sideSides[0], bark), twig(knee, crown, R * 0.8, R * 0.55, sideSides[1], bark), twig(crown, tip, R * 0.55, R * 0.25, 3, bark));
        tips.push(crown.clone().lerp(tip, 0.6));
      } else if (C.knuckle) {
        // pollarded: the stem cut back to a knuckle every winter, a fist of whips shooting up from it
        const fist = V3(ca * out, h, sa * out);
        wood.push(twig(foot, knee, R, R * 0.9, 5, bark), twig(knee, fist, R * 0.9, R * 0.85, 5, bark));
        wood.push(part(tube([fist.clone().add(V3(0, -0.14, 0)), fist, fist.clone().add(V3(0, 0.12, 0))], [R * 0.9, R * 1.9, R * 1.3], 5), bark));
        for (let w = 0; w < 3; w++) {
          const b = a + (w - 1) * 0.9 + j(0.2), wt = fist.clone().add(V3(Math.cos(b) * 0.45, 1.6 + r.float() * 0.6, Math.sin(b) * 0.45));
          wood.push(twig(fist.clone().add(V3(0, 0.1, 0)), wt, 0.03, 0.012, 3, bark));
        }
        tips.push(fist.clone().add(V3(0, 1.3, 0)));
      } else {
        wood.push(twig(foot, knee, R, R * 0.78, sideSides[0], bark), twig(knee, tip, R * 0.78, R * 0.3, sideSides[1], bark));
        tips.push(tip);
      }
      stemsAt.push([foot, knee, R]);
      knees.push(knee);
      if (!s && !base0) leanPer = [knee.x / Math.max(1, knee.y + 0.3), knee.z / Math.max(1, knee.y + 0.3)];
    }
    if (base0) leanPer = [base0.x / (C.fork! + 0.3), base0.z / (C.fork! + 0.3)];
    // the crown: lobes clustered on the stems' tips (a pollarded one's tall and narrow, round its whips),
    // and over the middle — flat-topped where the species is
    // (`low`: a share of them hung lower along the stems, past their knees — a redbud is leafy from low
    // on its trunks, a rosebay along its upper stems)
    const capY = C.H - C.lobeR * C.sq, nLow = Math.round(C.lobes * (C.low ?? 0));
    for (let i = 0; i < C.lobes; i++) {
      const s = i % tips.length, lowOne = i >= C.lobes - nLow, t = lowOne ? knees[s].clone().lerp(tips[s], 0.35 + r.float() * 0.25) : tips[s], per = Math.ceil(C.lobes / tips.length);
      const u = fibSphere(Math.floor(i / tips.length), per, -0.25, s * 2.1 + a0);
      const c = t.clone().add(V3(u.x * C.lobeR * 0.85, u.y * C.lobeR * 0.45 + C.lobeR * 0.3, u.z * C.lobeR * 0.85));
      if (C.flat) c.y = Math.min(c.y, capY);
      lobe(C.lobeR * (0.82 + r.float() * 0.3), c, 2400 + ki * 53 + v * 29 + i, C.sq, 0);
    }
    const mid = tips.reduce((m, t) => m.add(t), V3(0, 0, 0)).multiplyScalar(1 / tips.length);
    if (!C.knuckle) lobe(C.lobeR * 1.2, V3(mid.x, Math.min(capY, Math.max(...tips.map((t) => t.y)) + C.lobeR * 0.25), mid.z), 2490 + ki * 7 + v, C.sq * 0.9, 0);
    // the crape myrtle's mottle: its smooth cinnamon bark flaking in grey, tan and cream patches
    for (let m = 0; m < (C.mottle ?? 0) * stemsAt.length; m++) {
      const [foot, knee, R] = stemsAt[m % stemsAt.length], t = 0.3 + r.float() * 0.6, c = foot.clone().lerp(knee, t); // (above the root's flare)
      plan.hang.push(part(patch(c, r.float() * Math.PI * 2, R * (1 - 0.2 * t) * 1.15 + 0.008, 0.06 + r.float() * 0.06, 0.12 + r.float() * 0.14), CRAPE_PATCH[m % CRAPE_PATCH.length]));
    }
  } else if (kind === 'redcedar') {
    // eastern redcedar: a dark, dense column — flame-shaped young, spreading into a cone on an old
    // field, twisted and open on a limestone bluff — scale-leaf sprays (its near cards the cedar's), the
    // red bark shredding in strips; bronze-green through the winter (FALL_HUE 7). The tree that takes
    // over every old field and fence line east of the Plains.
    trunkR = [0.14, 0.2, 0.22][v];
    const H = [10.4, 11.2, 9.2][v] + j(0.3), lean = V3(j(v === 2 ? 0.9 : 0.25), 0, j(v === 2 ? 0.9 : 0.25));
    leanPer = [lean.x / H, lean.z / H];
    if (v < 2) {
      // a spindle of lobes from the ground to a point: v0 a narrow flame, v1 an old field's broad cone
      const axis = (y: number) => V3(lean.x * (y / H), y, lean.z * (y / H));
      // (its fluted foot: a quick taper over the first metre, then the long column)
      wood.push(twig(V3(0, -0.3, 0), axis(0.6), trunkR, trunkR * 0.7, 6, REDCEDAR_BARK), twig(axis(0.6), axis(H * 0.5), trunkR * 0.7, trunkR * 0.55, 6, REDCEDAR_BARK), twig(axis(H * 0.5), axis(H - 1.2), trunkR * 0.55, trunkR * 0.2, 4, REDCEDAR_BARK));
      const tiers = 9, R = v ? 2.0 : 1.25, y0 = v ? 1.25 : 1.0;
      for (let t = 0; t < tiers; t++) {
        const f = t / (tiers - 1), y = y0 + f * (H - 1.1 - y0);
        const rad = R * (v ? 1 - 0.78 * f : (1 - 0.62 * Math.pow(f, 1.5)) * (0.86 + 0.22 * Math.sin(f * Math.PI)));
        const k2 = v ? 2 : t % 2 ? 1 : 2;
        for (let k = 0; k < k2; k++) {
          const a = t * GOLDEN + k * Math.PI + j(0.4);
          lobe(Math.max(0.55, rad * (0.85 + r.float() * 0.2)), axis(y + j(0.15)).add(V3(Math.cos(a) * rad * 0.28, 0, Math.sin(a) * rad * 0.28)), 2600 + v * 37 + t * 2 + k, v ? 1.05 : 1.35, 0);
        }
      }
      lobe(0.5, axis(H - 0.55), 2650 + v, 1.8, 0); // (the point)
    } else {
      // the bluff's: a crooked trunk, bare below, its clumps on the ends of twisting limbs, flat and
      // windswept on top, a dead limb silvered
      const k1 = V3(lean.x * 0.4 + j(0.4), H * 0.35, lean.z * 0.4 + j(0.4)), k2 = V3(lean.x * 0.8 + j(0.5), H * 0.68, lean.z * 0.8 + j(0.5)), top = V3(lean.x, H - 1.0, lean.z);
      wood.push(twig(V3(0, -0.3, 0), k1, trunkR, trunkR * 0.8, 6, REDCEDAR_BARK), twig(k1, k2, trunkR * 0.8, trunkR * 0.55, 5, REDCEDAR_BARK), twig(k2, top, trunkR * 0.55, trunkR * 0.25, 4, REDCEDAR_BARK));
      const a0 = r.float() * Math.PI * 2;
      for (let i = 0; i < 6; i++) {
        const from = k1.clone().lerp(top, 0.25 + (i / 6) * 0.75), a = a0 + i * GOLDEN, L = 1.6 - i * 0.12 + r.float() * 0.4;
        const tip = from.clone().add(V3(Math.cos(a) * L, 0.4 + r.float() * 0.5, Math.sin(a) * L));
        wood.push(twig(from, tip, trunkR * 0.3, 0.03, 3, REDCEDAR_BARK));
        lobe(0.95 + r.float() * 0.25, tip, 2660 + i, 0.85, 0);
        lobe(0.7 + r.float() * 0.2, from.clone().lerp(tip, 0.45).add(V3(0, 0.2, 0)), 2670 + i, 0.9, 0);
      }
      lobe(1.1, top.clone().add(V3(0, 0.4, 0)), 2680, 0.65, 0);
      lobe(0.85, top.clone().add(V3(Math.cos(a0) * 0.8, -0.3, Math.sin(a0) * 0.8)), 2681, 0.75, 0);
      const d0 = k1.clone().lerp(k2, 0.5), da = a0 + Math.PI;
      wood.push(twig(d0, d0.clone().add(V3(Math.cos(da) * 1.5, 0.9, Math.sin(da) * 1.5)), 0.05, 0.015, 3, SNAG));
    }
  }

  // (a snag has no leaves: its "crown" is its wood's reach)
  const leafGeo = leaf.length ? merge(leaf.map((g) => part(g, TINT))) : null;
  const geo = merge([...wood, ...plan.hang, ...(leafGeo ? [leafGeo] : [])]);
  const bb = bounds(geo), lb = leafGeo ? bounds(leafGeo) : (() => { const w = bounds(geo); return { min: V3(w.min.x, w.max.y * 0.5, w.min.z), max: w.max }; })();
  const meta: TreeMeta = {
    h: bb.max.y,
    crownR: Math.max(leafGeo ? 0 : 0.6, Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z) / 2), // (a snapped snag's "crown" is a trunk's width; it still stands for a tree)
    crownBottom: Math.max(0.3, lb.min.y),
    trunkR,
    lean: leanPer,
  };
  return { geo, meta, plan };
}
const tmeta = new Map<string, TreeMeta>();
export function treeLib(kind: TreeKind, v: number) {
  const k = `tree:${kind}:${v}`;
  return cached(k, () => { const t = treeGeometry(kind, v); tmeta.set(k, t.meta); return t.geo; });
}
export function treeMeta(kind: TreeKind, v: number): TreeMeta {
  const k = `tree:${kind}:${v}`;
  if (!tmeta.has(k)) treeLib(kind, v);
  return tmeta.get(k)!;
}
/** Where a tree's crown is lit from (the far shader's sphere field, propMaterial `uCrown`): its
 *  middle's height and its radius, in the model's own metres. */
export const crownField = (m: TreeMeta): [number, number] => [m.crownBottom + 0.85 * m.crownR, m.crownR];

// ================================================================ near trees
// Within about 30 m a tree is drawn from its near model instead (world/nearTrees.ts): the limbs
// the far model hides, a trunk that flares at the root and tapers to its fork, scaffold limbs and a
// second order of branches reaching into the crown, and the crown itself a few large leaf-cluster
// cards — each a spray of painted leaves with gaps between them — set where the far model's lobes
// are. Lit by the same crown field and the same instance colour, the two read as one tree at the
// hand-over; up close the outline is leaves and the sky shows through.
//
// The near model is grown from the far recipe's own plan (TreePlan), so a species keeps the
// silhouette its far model was tuned to: the oak's billows at its limbs' ends, the elm's vase, the
// pine's windswept tufts. Palms and the willow keep their far model at every distance: their
// leaves are already fronds and tresses.
export const NEAR_KINDS = new Set<TreeKind>(['round', 'oak', 'shrub', 'pine', 'spruce', 'birch', 'mesquite', 'maple', 'elm', 'poplar', 'magnolia', 'cherry', 'fir', 'cedar', 'hemlock', 'sitka', 'alder', 'vinemaple', 'liveoak', 'plateauoak', 'coastoak',
  'whitepine', 'ponderosa', 'lodgepole', 'redspruce', 'balsamfir', 'engelmann', 'subalpinefir', 'easthemlock', 'aspen', 'willowshrub',
  'tuliptree', 'sweetgum', 'hickory', 'buckeye', 'sycamore', 'buroak', 'dogwood', 'redbud', 'crapemyrtle', 'loblolly', 'longleaf', 'slashpine', 'redcedar', 'rosebay']); // (the snag is wood alone: its far model at every distance)
/** Does this grown form have a near model? (The longleaf's grass stage keeps its fountain of needle
 *  blades at every distance, as the palms keep their fronds.) */
export const hasNear = (k: TreeKind, v: number) => NEAR_KINDS.has(k) && !(k === 'longleaf' && v === 0);
/** A leaf card: its middle (x, y, z, model space), half its width, height : width, its turn in the
 *  picture plane (0–1 of a turn), its picture (LEAF_PICS) and how deep in the crown it sits
 *  (0 on the rim … 1 at the heart). */
export const CARD_STRIDE = 8;
/** What each leaf picture shows (paintCluster): 0–1 sprays of small leaves (the big cards), 2–3 of
 *  large leaves, 4–7 needle tufts, 8–9 a redcedar's flat lacy sprays, 10–11 a maple's big hands (the
 *  bigleaf, the vine maple, the sycamore); package #4's: 12–13 the sweetgum's glossy stars, 14–15 the
 *  tulip tree's square-ended leaves, 16–17 the hickory's compound leaves (five leaflets), 18–19 the
 *  buckeye's (five fingers), 20–21 the redbud's hearts, 22–23 the southern pines' long needles in
 *  drooping brushes. */
type PicShape = 'small' | 'large' | 'needle' | 'spray' | 'hand' | 'star' | 'tulip' | 'pinnate' | 'palmate' | 'heart' | 'longneedle';
const PIC_SHAPE: PicShape[] = ['small', 'small', 'large', 'large', 'needle', 'needle', 'needle', 'needle', 'spray', 'spray', 'hand', 'hand',
  'star', 'star', 'tulip', 'tulip', 'pinnate', 'pinnate', 'palmate', 'palmate', 'heart', 'heart', 'longneedle', 'longneedle'];
export const LEAF_PICS = PIC_SHAPE.length;
/** Which pictures a tree's cards show (two or four, card by card): each its own leaf where the
 *  foundry paints one. */
export const picsOf = (kind: TreeKind, v: number, big: boolean): number[] =>
  SOUTHERN_PINES.has(kind) ? [22, 23] : NEEDLED.has(kind) ? [4, 5, 6, 7] : kind === 'cedar' || kind === 'redcedar' ? [8, 9]
    : kind === 'vinemaple' || (kind === 'maple' && v === 2) || kind === 'sycamore' ? [10, 11]
      : kind === 'sweetgum' ? [12, 13] : kind === 'tuliptree' ? [14, 15] : kind === 'hickory' ? [16, 17] : kind === 'buckeye' ? [18, 19] : kind === 'redbud' ? [20, 21]
        : big || LIVE_OAKS.has(kind) || kind === 'crapemyrtle' ? [0, 1] : [2, 3]; // (a live oak's and a crape myrtle's small leaves)
export interface NearTree {
  /** the branch skeleton: trunk, limbs, branches — non-indexed, bark colours, aPart 0 */
  wood: THREE.BufferGeometry;
  /** CARD_STRIDE floats per leaf card */
  cards: Float32Array;
  meta: TreeMeta;
  /** pieces of wood (limbs and branches, or a clump's stems) that reach from below the crown into it */
  limbsIn: number;
  /** the trunk's radius at the ground and where it meets the crown (m) */
  trunk: [number, number];
}

/** Grow a tree's near model from its plan. Deterministic in (kind, variant). */
export function nearTreeGeometry(kind: TreeKind, v: number): NearTree {
  const { meta, plan } = treeGeometry(kind, v);
  const rng = makeRng(31337 * (TREE_KINDS.indexOf(kind) + 1) + v * 104729);

  // ---- the wood the far recipe grew, joined end to end into runs (a trunk, a limb with its knee)
  type Run = { p: THREE.Vector3[]; r: number[]; col: number; trunk: boolean };
  const B = plan.boughs, used = new Uint8Array(B.length), runs: Run[] = [];
  const next = (i: number) => B.findIndex((q, k) => !used[k] && k !== i && q.a.distanceTo(B[i].b) < 1e-3 && q.col === B[i].col);
  for (let i = 0; i < B.length; i++) {
    if (used[i] || B.some((q, k) => k !== i && q.b.distanceTo(B[i].a) < 1e-3 && q.col === B[i].col)) continue; // (a run starts where nothing ends)
    used[i] = 1;
    const run: Run = { p: [B[i].a.clone(), B[i].b.clone()], r: [B[i].r0, B[i].r1], col: B[i].col, trunk: B[i].a.y <= 0.01 };
    for (let k = next(i); k >= 0; k = next(k)) { used[k] = 1; run.p.push(B[k].b.clone()); run.r.push(B[k].r1); }
    runs.push(run);
  }
  // (anything left over — a loop the joiner can't start — still grows, a run of its own)
  B.forEach((q, i) => { if (!used[i]) runs.push({ p: [q.a.clone(), q.b.clone()], r: [q.r0, q.r1], col: q.col, trunk: q.a.y <= 0.01 }); });

  // ---- the crown: one leaf card per far lobe (where it was, as big, as squashed), split until
  // there are at least 8 — a shrub's three lobes would be three stickers
  type Card = { c: THREE.Vector3; h: number; sq: number };
  const cards: Card[] = plan.lobes.map((l) => ({ c: l.c.clone(), h: l.r * 1.17, sq: Math.min(1.5, Math.max(0.6, l.sq)) }));
  while (cards.length < 8) {
    let bi = 0;
    cards.forEach((q, i) => { if (q.h > cards[bi].h) bi = i; });
    const q = cards[bi], a = cards.length * GOLDEN, o = V3(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(q.h * 0.4);
    cards.splice(bi, 1, { c: q.c.clone().add(o), h: q.h * 0.78, sq: q.sq }, { c: q.c.clone().sub(o), h: q.h * 0.78, sq: q.sq });
  }
  // a run that ends in the open (a clump's side stem, a limb the far lobes covered) grows on into the
  // nearest leaf cluster, thinning — never a cut-off stick under the crown
  for (const run of runs) {
    const e = run.p[run.p.length - 1];
    if (e.y < 0.5 || run.col === SNAG) continue; // (dead wood stays bare)
    let near: Card | null = null, nd = Infinity;
    for (const q of cards) { const d = q.c.distanceTo(e) - q.h * 0.8; if (d < nd) (nd = d), (near = q); }
    if (!near || nd <= 0) continue;
    const to = e.clone().lerp(near.c, 0.85), r1 = run.r[run.r.length - 1];
    run.p.push(e.clone().lerp(to, 0.5).add(V3(0, 0.08 * e.distanceTo(to), 0)), to);
    run.r.push(r1 * 0.75, Math.max(0.015, r1 * 0.45));
  }

  // every run resampled into a gently crooked curve (a ring every ~0.8 m, each nudged off the
  // straight line), the trunk with its root flare: wide where it meets the ground, tapering up (a live
  // oak's long sprawl a ring every ~1.6 m and a side fewer: its limbs reach three times as far)
  const coarse = isOak(kind);
  const wood: THREE.BufferGeometry[] = [], trunks: { p: THREE.Vector3[]; r: number[] }[] = [];
  const axis: { p: THREE.Vector3; r: number; trunk: boolean; col: number }[] = []; // where a branch may start (and its bark)
  for (const run of runs) {
    const P: THREE.Vector3[] = [], R: number[] = [];
    for (let s = 0; s + 1 < run.p.length; s++) {
      const a = run.p[s], b = run.p[s + 1], L = a.distanceTo(b);
      const steps = Math.max(1, Math.min(run.trunk ? 5 : coarse ? 2 : 3, Math.round(L / (coarse ? 1.6 : 0.8))));
      const d = b.clone().sub(a).normalize(), side = new THREE.Vector3(-d.z, 0, d.x);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const up = new THREE.Vector3().crossVectors(side, d).normalize();
      for (let k = s ? 1 : 0; k <= steps; k++) {
        const t = k / steps, p = a.clone().lerp(b, t);
        const inner = k > 0 && k < steps;
        if (inner) p.addScaledVector(side, (rng.float() - 0.5) * 0.08 * L / steps).addScaledVector(up, (rng.float() - 0.5) * 0.06 * L / steps);
        P.push(p);
        R.push(run.r[s] + (run.r[s + 1] - run.r[s]) * t);
      }
    }
    // (a clump's third and later stems, when thin — a crape myrtle's, a rosebay's, a willow thicket's —
    // plainer and without a flare of their own: eight of them would be a tree's whole budget)
    const thin = run.trunk && trunks.length > 1 && run.r[0] < 0.1;
    if (run.trunk && !thin) {
      // the root flare: rings packed near the ground, swelling to half again the trunk's girth
      const base = P[0], top = P[1], r0 = R[0];
      const at = (y: number) => base.clone().lerp(top, (y - base.y) / Math.max(1e-3, top.y - base.y));
      const flare = [[0.0, 1.5], [0.18, 1.3], [0.5, 1.1]].filter(([y]) => y + 0.1 < top.y);
      P.splice(1, 0, ...flare.map(([y]) => at(y)));
      R.splice(0, 1, r0 * 1.55, ...flare.map(([y, f]) => r0 * (f as number) * (1 - 0.15 * (y as number) / Math.max(1, top.y))));
    }
    const sides = run.trunk ? (thin ? 4 : trunks.length ? 6 : coarse ? 7 : 8) : R[0] > 0.12 && !coarse ? 6 : 5; // (a clump's second and third stems a little plainer)
    if (run.trunk) trunks.push({ p: P, r: R });
    wood.push(part(tube(P, R, sides), run.col));
    if (run.col !== SNAG) P.forEach((p, i) => axis.push({ p, r: R[i], trunk: run.trunk, col: run.col })); // (no leafy branch off dead wood)
  }

  // how deep in the crown each card sits: 0 for the outermost cluster, 1 at the middle of them all
  // (the lobes' own middle — a wide crown's field sits high, and its dome would read as its heart)
  const mid = cards.reduce((m, q) => m.add(q.c), V3(0, 0, 0)).multiplyScalar(1 / cards.length);
  const reachOut = Math.max(0.5, ...cards.map((q) => q.c.distanceTo(mid)));
  const rec = new Float32Array(cards.length * CARD_STRIDE);
  cards.forEach((q, i) => {
    const pics = picsOf(kind, v, q.h >= 1.6), pic = pics[i % pics.length];
    const depth = 1 - Math.min(1, q.c.distanceTo(mid) / reachOut);
    rec.set([q.c.x, q.c.y, q.c.z, q.h, q.sq, rng.float(), pic, depth], i * CARD_STRIDE);
  });

  // ---- the second order: a branch from the nearest limb out into each card's cluster (ending
  // inside it), arching up; none where a limb already ends in the cluster
  const above = meta.crownBottom - 0.4, cb = meta.crownBottom;
  const reaches = (a: THREE.Vector3, b: THREE.Vector3) => a.y < cb + 0.5 && b.y > cb + 0.3;
  const stems = runs.filter((rn) => rn.trunk);
  let limbsIn = runs.filter((rn) => (!rn.trunk || stems.length > 1) && reaches(rn.p[0], rn.p[rn.p.length - 1])).length;
  const limbed = axis.some((o) => !o.trunk);
  for (const q of cards) {
    let best = -1, bs = Infinity;
    for (let i = 0; i < axis.length; i++) {
      const s = axis[i];
      if (s.trunk && s.p.y < above && limbed) continue; // (not off the bare trunk under the crown)
      const d = s.p.distanceTo(q.c) + Math.max(0, s.p.y - q.c.y - 0.2) * 2;
      if (d < bs) (bs = d), (best = i);
    }
    if (best < 0) continue;
    const S = axis[best], L = S.p.distanceTo(q.c);
    if (L < Math.max(0.6, q.h * 0.35)) continue;
    const E = S.p.clone().lerp(q.c, 0.82);
    const M = S.p.clone().lerp(E, 0.5).add(V3((rng.float() - 0.5) * 0.12 * L, 0.12 * L, (rng.float() - 0.5) * 0.12 * L));
    const r0 = Math.min(0.11, Math.max(0.025, Math.min(S.r * 0.55, 0.03 + 0.025 * L))), r1 = Math.max(0.012, r0 * 0.3);
    // (inside a Northwest conifer's dense clumps a three-sided twig does: there's little to see of it)
    // (in the colour of the limb it leaves: a sycamore's white up in the crown)
    wood.push(part(tube([S.p.clone(), M, E], [r0, (r0 + r1) * 0.55, r1], isSpire(kind) ? 3 : r0 > 0.06 ? 5 : 4), S.col));
    if (reaches(S.p, E)) limbsIn++;
  }
  // the trunk's girth at the ground and where it meets the crown (the first stem's)
  const t0 = trunks[0];
  const rAt = (y: number) => {
    for (let i = 0; i + 1 < t0.p.length; i++) if (t0.p[i + 1].y >= y) { const f = (y - t0.p[i].y) / Math.max(1e-4, t0.p[i + 1].y - t0.p[i].y); return t0.r[i] + (t0.r[i + 1] - t0.r[i]) * Math.max(0, Math.min(1, f)); }
    return t0.r[t0.r.length - 1];
  };
  // what hangs from the limbs (moss, licorice fern) as the far model has it
  return { wood: merge([...wood, ...plan.hang.map((g) => g.clone())]), cards: rec, meta, limbsIn, trunk: [rAt(0), rAt(Math.min(cb, t0.p[t0.p.length - 1].y))] };
}
const nearCache = new Map<string, NearTree>();
/** One near model per (kind, variant) — its wood through the foundry cache (a builder clones it). */
export function nearTreeLib(kind: TreeKind, v: number): NearTree {
  const k = `near-tree:${kind}:${v}`;
  let t = nearCache.get(k);
  if (!t) {
    const g = nearTreeGeometry(kind, v);
    nearCache.set(k, (t = { ...g, wood: cached(k, () => g.wood) }));
  }
  return t;
}

/** The leaf pictures the cards show (LEAF_PICS in a 4 × 2 grid of S-pixel cells), painted once:
 *  A how much leaf covers the texel (anti-aliased), R the leaf's own shade (0–1, ~0.7 on average:
 *  each leaf a little lighter or darker, a midrib, the side away from the light deeper), G 1 on a
 *  leaf and 0 on the twigs between them (bark), B a number per leaf (autumn turns and drops them
 *  one by one). Each picture is a cluster: twigs from its heart out to sprays of leaves set along
 *  them, alternating, smaller toward the tip, inside a lobed outline — dense at the heart, ragged
 *  at the rim, gaps between the sprays. Deterministic. */
export function leafAtlas(S = 256): { data: Uint8Array; w: number; h: number } {
  const job = leafAtlasJob(S);
  while (!job.step());
  return job;
}
/** The same, a picture at a time (a few tens of ms each): `step()` paints the next and says
 *  whether the atlas is done — the near-tree layer runs one a frame while the world boots. */
export function leafAtlasJob(S = 256) {
  const W = S * 4, H = S * Math.ceil(LEAF_PICS / 4), data = new Uint8Array(W * H * 4);
  let pic = 0;
  return {
    data, w: W, h: H,
    step() {
      if (pic >= LEAF_PICS) return true;
      const ox = (pic % 4) * S, oy = Math.floor(pic / 4) * S, acc = new Float32Array(S * S * 4); // straight-alpha r, g, b, a
      paintCluster(acc, S, 0, 0, S, pic);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S * 4; x++) data[((oy + y) * W + ox) * 4 + x] = Math.max(0, Math.min(255, Math.round(acc[y * S * 4 + x] * 255)));
      return ++pic >= LEAF_PICS;
    },
  };
}

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function paintCluster(acc: Float32Array, W: number, ox: number, oy: number, S: number, pic: number) {
  const rng = makeRng(7907 + pic * 3301), shape = PIC_SHAPE[pic];
  const needles = shape === 'needle', spray = shape === 'spray', hands = shape === 'hand', smallLeaf = shape === 'small';
  // (package #4's leaves: their own shapes, the same sprays round them)
  const NEW = ({ star: { L0: 0.26, sprays: 10, fill: 100, step: 0.6 }, tulip: { L0: 0.2, sprays: 12, fill: 80, step: 0.55 }, heart: { L0: 0.17, sprays: 13, fill: 130, step: 0.52 },
    pinnate: { L0: 0.34, sprays: 7, fill: 75, step: 0.5 }, palmate: { L0: 0.34, sprays: 7, fill: 60, step: 0.55 }, longneedle: { L0: 0.22, sprays: 9, fill: 45, step: 0.5 } } as Partial<Record<PicShape, { L0: number; sprays: number; fill: number; step: number }>>)[shape];
  const half = S / 2, gutter = 3, k = half - gutter; // (texels per unit: the cell spans −1 … 1)
  // lay one shape over the picture, anti-aliased: `edge(u, v)` is how far inside the shape a point
  // is, in the picture's units (< 0 outside), and sets `tone` for that point when it's inside
  let tone = 0;
  const over = (x0: number, y0: number, x1: number, y1: number, edge: (u: number, v: number) => number, g: number, b: number) => {
    const px0 = Math.max(0, Math.floor(x0 * k + half)), px1 = Math.min(S - 1, Math.ceil(x1 * k + half));
    const py0 = Math.max(0, Math.floor(y0 * k + half)), py1 = Math.min(S - 1, Math.ceil(y1 * k + half));
    for (let py = py0; py <= py1; py++) {
      const v = (py + 0.5 - half) / k;
      for (let px = px0; px <= px1; px++) {
        const cov = Math.min(1, edge((px + 0.5 - half) / k, v) * k + 0.5);
        if (cov <= 0) continue;
        const i = ((oy + py) * W + ox + px) * 4, a0 = acc[i + 3], a = cov + a0 * (1 - cov);
        const k0 = (a0 * (1 - cov)) / a, k1 = cov / a;
        acc[i] = acc[i] * k0 + tone * k1; acc[i + 1] = acc[i + 1] * k0 + g * k1; acc[i + 2] = acc[i + 2] * k0 + b * k1; acc[i + 3] = a;
      }
    }
  };
  // the cluster's outline: a lobed disc, never reaching the gutter
  const ph = [rng.float() * 6.28, rng.float() * 6.28, rng.float() * 6.28];
  const rim = (th: number) => 0.8 + 0.08 * Math.sin(3 * th + ph[0]) + 0.05 * Math.sin(5 * th + ph[1]) + 0.04 * Math.sin(8 * th + ph[2]);
  // a stroke from a to b, w wide at a and half that at b (a twig, a needle)
  const stroke = (ax: number, ay: number, bx: number, by: number, w: number, r: number, g: number, b: number) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
    over(Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w, Math.max(ay, by) + w, (u, v) => {
      const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / L2));
      tone = r;
      return w * (1 - 0.5 * t) - Math.hypot(u - ax - dx * t, v - ay - dy * t);
    }, g, b);
  };
  // a leaf: an almond from its base along angle a, length L, widest a third of the way out; the
  // half turned to the light (up) a shade lighter than the other, a darker midrib between them
  const leaf = (bx: number, by: number, a: number, L: number, wid: number, shade: number, idv?: number) => {
    const ca = Math.cos(a), sa = Math.sin(a), hw = L * wid, tx = bx + ca * L, ty = by + sa * L;
    const id = idv ?? rng.float(), lit = sa >= 0 ? 1 : -1, rib = hw * 0.1; // (a compound leaf's leaflets share its number: they fall together)
    const hi = Math.min(1, shade * 1.1), lo = shade * 0.86, mid = shade * 0.8;
    over(Math.min(bx, tx) - hw, Math.min(by, ty) - hw, Math.max(bx, tx) + hw, Math.max(by, ty) + hw, (u, v) => {
      const x = u - bx, y = v - by, s = (x * ca + y * sa) / L, w = -x * sa + y * ca;
      if (s <= 0 || s >= 1) return -1;
      const wl = w * lit;
      tone = wl > rib ? hi : wl < -rib ? lo : mid;
      return Math.sqrt(s) * (1 - s) * 1.8 * hw - Math.abs(w);
    }, 1, id);
  };
  // a needle tuft: a fan of fine needles from a point
  const tuft = (bx: number, by: number, a: number, L: number, shade: number) => {
    const n = 9 + Math.floor(rng.float() * 5), id = rng.float();
    for (let q = 0; q < n; q++) {
      const t = q / (n - 1) - 0.5, aa = a + t * 2.4 + (rng.float() - 0.5) * 0.25, LL = L * (0.7 + 0.6 * (0.5 - Math.abs(t)) + rng.float() * 0.2);
      stroke(bx, by, bx + Math.cos(aa) * LL, by + Math.sin(aa) * LL, 0.016, Math.min(1, shade * (0.82 + 0.36 * rng.float())), 1, id);
    }
  };
  // a maple's hand: five pointed lobes about its middle, the two at the base turned back either side
  // of the stalk (the sinus where it joins), its veins running out to the lobes' points; the half
  // turned to the light a shade lighter
  const hand = (bx: number, by: number, a: number, L: number, shade: number) => {
    const R = L * 0.5, cx = bx + Math.cos(a) * R * 0.95, cy = by + Math.sin(a) * R * 0.95, id = rng.float();
    const lit = Math.sin(a) >= 0 ? 1 : -1, deep = pic === 10 ? 1.6 : 1.1;
    over(cx - R * 1.05, cy - R * 1.05, cx + R * 1.05, cy + R * 1.05, (u, v) => {
      const x = u - cx, y = v - cy, d = Math.hypot(x, y), th = Math.atan2(y, x) - a;
      const c = Math.abs(Math.cos(2.5 * th)), lobe = 0.5 + 0.5 * Math.pow(c, deep);
      const side = (-x * Math.sin(a) + y * Math.cos(a)) * lit;
      tone = shade * (0.8 + 0.14 * Math.pow(c, 6) + (side > 0 ? 0.1 : 0)) * (1 - 0.18 * Math.pow(c, 40));
      return R * lobe - d;
    }, 1, id);
  };
  // the sweetgum's star: five sharp points from its middle, deep sinuses between them, glossy — a bright
  // ridge down each point, the veins darker
  const star = (bx: number, by: number, a: number, L: number, shade: number) => {
    const R = L * 0.5, cx = bx + Math.cos(a) * R * 0.9, cy = by + Math.sin(a) * R * 0.9, id = rng.float(), lit = Math.sin(a) >= 0 ? 1 : -1;
    over(cx - R * 1.05, cy - R * 1.05, cx + R * 1.05, cy + R * 1.05, (u, v) => {
      const x = u - cx, y = v - cy, d = Math.hypot(x, y), th = Math.atan2(y, x) - a;
      const c = Math.abs(Math.cos(2.5 * th)), lobe = 0.3 + 0.7 * Math.pow(c, 2.6);
      const side = (-x * Math.sin(a) + y * Math.cos(a)) * lit;
      tone = shade * (0.82 + 0.18 * Math.pow(c, 12) + (side > 0 ? 0.1 : 0)) * (1 - 0.22 * Math.pow(c, 60) * Math.min(1, d / (R * 0.25)));
      return R * lobe - d;
    }, 1, id);
  };
  // the tulip tree's leaf: lobes either side of the base, a waist, two more at the shoulders, the tip
  // cut square across with a shallow notch — a tulip's outline
  const tulip = (bx: number, by: number, a: number, L: number, shade: number) => {
    const ca = Math.cos(a), sa = Math.sin(a), W = L * 0.48, id = rng.float(), lit = sa >= 0 ? 1 : -1, rib = W * 0.08;
    const hi = Math.min(1, shade * 1.1), lo = shade * 0.86, mid = shade * 0.78, tx = bx + ca * L, ty = by + sa * L, pad = W * 1.05;
    over(Math.min(bx, tx) - pad, Math.min(by, ty) - pad, Math.max(bx, tx) + pad, Math.max(by, ty) + pad, (u, v) => {
      const x = u - bx, y = v - by, s = (x * ca + y * sa) / L, w = -x * sa + y * ca, aw = Math.abs(w);
      const hw = W * (0.5 + 0.38 * sstep(0, 0.2, s) - 0.28 * Math.exp(-(((s - 0.55) / 0.13) ** 2)) + 0.1 * Math.exp(-(((s - 0.84) / 0.07) ** 2)));
      const end = 1 - 0.16 * Math.max(0, 1 - aw / (W * 0.55)), wl = w * lit;
      tone = wl > rib ? hi : wl < -rib ? lo : mid;
      return Math.min(hw - aw, (end - s) * L, (s - 0.03) * L);
    }, 1, id);
  };
  // the redbud's heart: two round lobes either side of the stalk, widest a third of the way out, drawn
  // to a point
  const heart = (bx: number, by: number, a: number, L: number, shade: number) => {
    const ca = Math.cos(a), sa = Math.sin(a), W = L * 0.52, id = rng.float(), lit = sa >= 0 ? 1 : -1, rib = W * 0.08;
    const hi = Math.min(1, shade * 1.1), lo = shade * 0.86, mid = shade * 0.78, tx = bx + ca * L, ty = by + sa * L, pad = W * 1.05 + L * 0.15;
    over(Math.min(bx, tx) - pad, Math.min(by, ty) - pad, Math.max(bx, tx) + pad, Math.max(by, ty) + pad, (u, v) => {
      const x = u - bx, y = v - by, s = (x * ca + y * sa) / L, w = -x * sa + y * ca, aw = Math.abs(w), t = (s + 0.14) / 1.14;
      if (t <= 0 || t >= 1) return -1;
      const hw = W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * (1.05 - 0.3 * t);
      const sinus = s + 0.14 - 0.22 * Math.max(0, 1 - aw / (W * 0.3)), wl = w * lit; // (the notch where the stalk joins)
      tone = wl > rib ? hi : wl < -rib ? lo : mid;
      return Math.min(hw - aw, sinus * L);
    }, 1, id);
  };
  // the hickory's compound leaf: a stalk and its rachis, two pairs of leaflets and the end one, the
  // outer ones largest
  const pinnate = (bx: number, by: number, a: number, L: number, shade: number) => {
    const id = rng.float(), ca = Math.cos(a), sa = Math.sin(a);
    stroke(bx, by, bx + ca * L * 0.62, by + sa * L * 0.62, 0.009, shade * 0.72, 1, id);
    for (const [t, len, ang] of [[0.2, 0.27, 1.0], [0.42, 0.36, 0.9]])
      for (const sd of [1, -1]) leaf(bx + ca * L * t, by + sa * L * t, a + sd * (ang + (rng.float() - 0.5) * 0.2), L * len, 0.34, shade * (0.9 + 0.12 * rng.float()), id);
    leaf(bx + ca * L * 0.6, by + sa * L * 0.6, a + (rng.float() - 0.5) * 0.15, L * 0.42, 0.34, shade, id);
  };
  // the buckeye's: five long leaflets fanned from the end of a stalk, the middle one longest
  const palmate = (bx: number, by: number, a: number, L: number, shade: number) => {
    const id = rng.float(), ca = Math.cos(a), sa = Math.sin(a), px = bx + ca * L * 0.2, py = by + sa * L * 0.2;
    stroke(bx, by, px, py, 0.01, shade * 0.72, 1, id);
    for (const [da, len] of [[0, 0.52], [0.6, 0.46], [-0.6, 0.46], [1.2, 0.32], [-1.2, 0.32]]) leaf(px, py, a + da + (rng.float() - 0.5) * 0.12, L * len, 0.3, shade * (0.9 + 0.12 * rng.float()), id);
  };
  // the southern pines' brush: a fan of long needles from a point, each bowing toward the ground as it
  // goes (a loblolly's, a longleaf's foot-long ones)
  const longTuft = (bx: number, by: number, a: number, L: number, shade: number) => {
    const n = 14 + Math.floor(rng.float() * 6), id = rng.float();
    for (let q = 0; q < n; q++) {
      const t = q / (n - 1) - 0.5, aa = a + t * 2.0 + (rng.float() - 0.5) * 0.25, LL = L * (0.75 + 0.5 * (0.5 - Math.abs(t)) + rng.float() * 0.2);
      const mx = bx + Math.cos(aa) * LL * 0.55, my = by + Math.sin(aa) * LL * 0.55;
      const ab = aa + Math.atan2(Math.sin(-Math.PI / 2 - aa), Math.cos(-Math.PI / 2 - aa)) * 0.22, tn = Math.min(1, shade * (0.82 + 0.36 * rng.float()));
      stroke(bx, by, mx, my, 0.013, tn, 1, id);
      stroke(mx, my, mx + Math.cos(ab) * LL * 0.45, my + Math.sin(ab) * LL * 0.45, 0.0085, tn, 1, id);
    }
  };
  const other = (bx: number, by: number, a: number, L: number, shade: number) =>
    shape === 'star' ? star(bx, by, a, L, shade) : shape === 'tulip' ? tulip(bx, by, a, L, shade) : shape === 'heart' ? heart(bx, by, a, L, shade)
      : shape === 'pinnate' ? pinnate(bx, by, a, L, shade) : shape === 'palmate' ? palmate(bx, by, a, L, shade) : longTuft(bx, by, a, L, shade);
  if (spray) return paintSpray(stroke, rng, rim);
  const L0 = NEW ? NEW.L0 : needles ? 0.15 : hands ? 0.3 : smallLeaf ? 0.085 : 0.12;
  // the sprays: twigs from near the heart out toward the rim, a side spray off each — laid out
  // first, their twigs painted under every leaf (they show only in the gaps, as branchlets, never
  // as a starburst over the leaves)
  const sprays = NEW ? NEW.sprays : needles ? 11 : hands ? 8 : 17;
  const a0 = rng.float() * 6.28;
  const runs: [number, number, number, number, number][] = [];
  for (let s = 0; s < sprays; s++) {
    const th = a0 + s * GOLDEN * 2 + (rng.float() - 0.5) * 0.3;
    // (a leaf at the tip stays inside the cell: one cut by its edge would be a straight edge)
    const reach = Math.min(rim(th) * (0.86 + 0.2 * rng.float()), 0.95 - L0 * 1.1);
    const r0 = 0.1 + 0.3 * rng.float();
    const bx = Math.cos(th + 0.25) * r0, by = Math.sin(th + 0.25) * r0;
    const ex = Math.cos(th) * reach, ey = Math.sin(th) * reach;
    runs.push([bx, by, ex, ey, needles ? 0.012 : 0.013]);
    const mx = bx + (ex - bx) * 0.45, my = by + (ey - by) * 0.45, sa = th + (rng.float() < 0.5 ? 0.7 : -0.7), sl = (reach - r0) * 0.45;
    runs.push([mx, my, mx + Math.cos(sa) * sl, my + Math.sin(sa) * sl, needles ? 0.009 : 0.009]);
  }
  for (const [bx, by, ex, ey, w] of runs) stroke(bx, by, ex, ey, w, 0.28, 0, 0);
  // the heart, darker (it's under the rest): enough leaves to close the inner three quarters
  const fill = NEW ? NEW.fill : needles ? 72 : hands ? 46 : smallLeaf ? 950 : 460;
  for (let q = 0; q < fill; q++) {
    const rr = Math.sqrt(rng.float()) * 0.8, th = rng.float() * 6.28;
    const x = Math.cos(th) * rr * rim(th), y = Math.sin(th) * rr * rim(th);
    // (pointing roughly outward, the way leaves face the light — any way at the very heart — and
    // centred on the point, or every picture would have a hole where the leaves start)
    const out = th + (rng.float() - 0.5) * (rr < 0.25 ? 6.28 : 2.4), Lf = L0 * (0.8 + 0.35 * rng.float());
    const cx = x - Math.cos(out) * Lf * 0.45, cyy = y - Math.sin(out) * Lf * 0.45;
    if (needles) tuft(x - Math.cos(out) * L0 * 0.4, y - Math.sin(out) * L0 * 0.4, out, L0 * 0.85, 0.42 + 0.3 * rr + 0.12 * rng.float());
    else if (shape === 'longneedle') longTuft(x - Math.cos(out) * L0 * 0.4, y - Math.sin(out) * L0 * 0.4, out, L0 * 0.85, 0.42 + 0.3 * rr + 0.12 * rng.float());
    else if (NEW) other(cx, cyy, out, Lf, 0.42 + 0.3 * rr + 0.12 * rng.float());
    else if (hands) hand(cx, cyy, out, Lf, 0.42 + 0.3 * rr + 0.12 * rng.float());
    else leaf(cx, cyy, out, Lf, 0.4, 0.4 + 0.32 * rr + 0.12 * rng.float());
  }
  // then the sprays' leaves (or tufts) over it, alternating along each twig, lighter toward the
  // open rim, a leaf at the tip
  for (const [bx, by, ex, ey] of runs) {
    const dir = Math.atan2(ey - by, ex - bx), len = Math.hypot(ex - bx, ey - by);
    const step = NEW ? L0 * NEW.step : needles ? 0.09 : hands ? L0 * 0.62 : L0 * 0.48;
    let side = rng.float() < 0.5 ? 1 : -1;
    for (let t = 0.2; t <= 1.0; t += step / len) {
      const px = bx + (ex - bx) * t, py = by + (ey - by) * t, sh = 0.6 + 0.38 * t + (rng.float() - 0.5) * 0.16;
      if (needles) tuft(px, py, dir + side * 0.45, L0 * (1.05 - 0.25 * t), sh);
      else if (NEW) other(px, py, dir + side * (shape === 'longneedle' ? 0.45 : 0.75 + (rng.float() - 0.5) * 0.4), L0 * (1.0 - 0.25 * t) * (0.85 + 0.3 * rng.float()), sh);
      else if (hands) hand(px, py, dir + side * (0.7 + (rng.float() - 0.5) * 0.4), L0 * (1.0 - 0.25 * t) * (0.85 + 0.3 * rng.float()), sh);
      else leaf(px, py, dir + side * (0.8 + (rng.float() - 0.5) * 0.4), L0 * (1.1 - 0.3 * t) * (0.85 + 0.3 * rng.float()), 0.42, sh);
      side = -side;
    }
    if (NEW) other(ex, ey, dir + (rng.float() - 0.5) * 0.3, L0 * 0.8, 0.95);
    else if (hands) hand(ex, ey, dir + (rng.float() - 0.5) * 0.3, L0 * 0.8, 0.95);
    else if (!needles) leaf(ex, ey, dir + (rng.float() - 0.5) * 0.3, L0 * 0.85, 0.4, 0.95);
  }
}

/** A western redcedar's foliage: flat, lacy sprays of scale leaves — fronds from the heart out and
 *  curving down (they hang), each a midrib with sprays alternating along it and smaller sprays off
 *  those, fanned flat; the heart a mat of them, darker. */
function paintSpray(stroke: (ax: number, ay: number, bx: number, by: number, w: number, r: number, g: number, b: number) => void, rng: { float(): number }, rim: (th: number) => number) {
  // the heart: short fat sprays every way, darker under the rest
  for (let q = 0; q < 260; q++) {
    const rr = Math.sqrt(rng.float()) * 0.72, th = rng.float() * 6.28, x = Math.cos(th) * rr * rim(th), y = Math.sin(th) * rr * rim(th);
    const a = rng.float() * 6.28, L = 0.06 + 0.06 * rng.float();
    stroke(x - Math.cos(a) * L * 0.5, y - Math.sin(a) * L * 0.5, x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5, 0.032, 0.38 + 0.3 * rr + 0.1 * rng.float(), 1, rng.float());
  }
  // the fronds over it, lighter toward their tips
  const fronds = 9, a0 = rng.float() * 6.28;
  for (let f = 0; f < fronds; f++) {
    const th = a0 + (f / fronds) * 6.28 + (rng.float() - 0.5) * 0.3, reach = rim(th) * (0.82 + 0.1 * rng.float()), id = rng.float();
    // the midrib, its heading easing round toward the ground as it goes out
    const n = 9, pts: [number, number][] = [];
    let x = Math.cos(th) * 0.12, y = Math.sin(th) * 0.12, a = th;
    const down = -Math.PI / 2, seg = (reach - 0.12) / n;
    for (let k = 0; k <= n; k++) {
      pts.push([x, y]);
      let da = down - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      a += da * 0.06;
      x += Math.cos(a) * seg; y += Math.sin(a) * seg;
      if (Math.hypot(x, y) > 0.9) break;
    }
    let side = rng.float() < 0.5 ? 1 : -1;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], t = k / (pts.length - 1), dir = Math.atan2(by - ay, bx - ax);
      stroke(ax, ay, bx, by, 0.022 * (1 - 0.4 * t), 0.55 + 0.3 * t, 1, id);
      // a side spray off the midrib, and two smaller off it, fanned in the frond's plane
      const sl = 0.13 * (1 - 0.55 * t), sa = dir + side * (0.85 + (rng.float() - 0.5) * 0.25);
      const ex = bx + Math.cos(sa) * sl, ey = by + Math.sin(sa) * sl, sh = 0.6 + 0.32 * t + (rng.float() - 0.5) * 0.12;
      stroke(bx, by, ex, ey, 0.026 * (1 - 0.3 * t), sh, 1, id);
      for (const m of [0.4, 0.75]) {
        const mx = bx + (ex - bx) * m, my = by + (ey - by) * m, ma = sa - side * 0.7;
        stroke(mx, my, mx + Math.cos(ma) * sl * 0.4, my + Math.sin(ma) * sl * 0.4, 0.018, sh * 1.04, 1, id);
      }
      side = -side;
    }
  }
}

// ================================================================ garden plants
export type PlantForm = 'mound' | 'rosette' | 'spike' | 'stem' | 'clump' | 'clipped';
export type PlantSpecies = 'hydrangea' | 'rose' | 'daylily' | 'lavender' | 'sunflower' | 'hosta' | 'agave' | 'hibiscus' | 'beachgrass' | 'boxwood' | 'coneflower' | 'fern' | 'swordfern' | 'salal' | 'oregongrape' | 'rhododendron' | 'azalea';
export interface Species {
  form: PlantForm;
  label: string;
  h: number; // mature height (m)
  w: number; // mature spread (m)
  bloom: number[]; // blossom colours (a seed picks one); [] = foliage only
  leaf?: number; // fixed leaf colour (otherwise TINT → region greens)
  months: [number, number]; // bloom season, 1–12 (northern hemisphere; flipped south)
  climates: Partial<Record<string, number>>; // region climate → weight in the garden mix
}
export const SPECIES: Record<PlantSpecies, Species> = {
  hydrangea: { form: 'mound', label: 'hydrangea', h: 1.3, w: 1.5, bloom: [0x8fa8e0, 0xd99ab8, 0x7f98d8, 0xb39ad9, 0xf0ece4], months: [6, 9], climates: { temperate: 5, continental: 2, mediterranean: 1 } },
  rose: { form: 'mound', label: 'rosebush', h: 1.1, w: 1.0, bloom: [0xc2303a, 0xe88aa0, 0xf4efe2, 0xf0b440], months: [5, 10], climates: { temperate: 3, mediterranean: 3, continental: 2, arid: 1 } },
  hibiscus: { form: 'mound', label: 'hibiscus', h: 1.6, w: 1.3, bloom: [0xd8342c, 0xf06a8a, 0xf2b233], months: [1, 12], climates: { tropical: 6, mediterranean: 1 } },
  daylily: { form: 'clump', label: 'daylily', h: 0.8, w: 0.8, bloom: [0xe9782c, 0xf2c23a, 0xc8403a], months: [6, 8], climates: { temperate: 3, continental: 3 } },
  beachgrass: { form: 'clump', label: 'beach grass', h: 0.9, w: 0.7, bloom: [], leaf: 0xb8b27a, months: [7, 9], climates: { temperate: 1, mediterranean: 1, tropical: 1 } },
  lavender: { form: 'spike', label: 'lavender', h: 0.6, w: 0.7, bloom: [0x9a7cc8, 0x8468b8], months: [6, 8], climates: { mediterranean: 6, arid: 3, temperate: 1 } },
  coneflower: { form: 'stem', label: 'coneflower', h: 0.9, w: 0.5, bloom: [0xc76b9a, 0xe8a6c0, 0xf0c040], months: [6, 9], climates: { continental: 4, temperate: 2 } },
  sunflower: { form: 'stem', label: 'sunflower', h: 2.1, w: 0.6, bloom: [0xf2c028, 0xe8a52a], months: [7, 9], climates: { continental: 4, temperate: 2, arid: 2 } },
  hosta: { form: 'rosette', label: 'hosta', h: 0.5, w: 0.9, bloom: [0xd8cce8], months: [7, 8], climates: { temperate: 3, continental: 3, boreal: 2 } },
  agave: { form: 'rosette', label: 'agave', h: 0.9, w: 1.3, bloom: [], leaf: 0x8aa6a0, months: [6, 6], climates: { arid: 6, mediterranean: 2, tropical: 1 } },
  fern: { form: 'rosette', label: 'fern', h: 0.7, w: 1.0, bloom: [], months: [5, 9], climates: { boreal: 5, temperate: 2, tropical: 2 } },
  boxwood: { form: 'clipped', label: 'boxwood', h: 0.8, w: 0.9, bloom: [], months: [5, 5], climates: { temperate: 2, continental: 1, mediterranean: 1, boreal: 1 } },
  // the forest floor's (understoryMix; never a garden's mix): the westside Northwest's knee-high
  // fountains of dark, leathery sword fern, glossy salal with its pink-white urns in late spring,
  // and Oregon grape's holly-like leaves under bright yellow sprays in April
  swordfern: { form: 'rosette', label: 'sword fern', h: 1.0, w: 1.7, bloom: [], leaf: 0x34592c, months: [5, 9], climates: {} },
  salal: { form: 'mound', label: 'salal', h: 0.9, w: 1.4, bloom: [0xf0d9d6, 0xe8c8cc], leaf: 0x527c3c, months: [5, 7], climates: {} },
  oregongrape: { form: 'mound', label: 'Oregon grape', h: 0.7, w: 0.9, bloom: [0xe9c93a], leaf: 0x3a5a2e, months: [3, 5], climates: {} },
  // (package #4) the East's and the Northwest's foundation shrubs: the rhododendron's dark leathery
  // mound under its big round trusses in May (pink, purple or white), and the azalea smothered in bloom
  // in spring — each plant its own hot pink, coral, white or magenta (the South's giant Indicas: the
  // Augusta, Charleston and Mobile springs)
  rhododendron: { form: 'mound', label: 'rhododendron', h: 2.0, w: 2.0, bloom: [0xd96aa8, 0x9a6ac4, 0xf2ecec, 0xe58ab0], leaf: 0x30502e, months: [5, 5], climates: {} },
  azalea: { form: 'mound', label: 'azalea', h: 1.3, w: 1.6, bloom: [0xe0337a, 0xf0715a, 0xf6f2ec, 0xc0307a], leaf: 0x3e5e30, months: [3, 5], climates: {} },
};
export const PLANT_SPECIES = Object.keys(SPECIES) as PlantSpecies[];
export const STAGES = 8; // 0 sprout … 7 full bloom
/** growth in [0,1] → stage index */
export const stageOf = (g: number) => Math.max(0, Math.min(STAGES - 1, Math.floor(g * STAGES)));

// The lower 48's gardens, region by region (docs/regional-life/: each file's street and yard plants),
// from the species the foundry has — each flora package adds its own (models.md build order): the
// Mid-Atlantic's blue hydrangeas, the Midwest's coneflowers and daylilies, the Plains' sunflowers,
// Florida's hibiscus, the desert's agave, California's lavender and roses.
const REGION_GARDEN: Partial<Record<EcoRegion, [PlantSpecies, number][]>> = {
  'new-england': [['hydrangea', 4], ['rose', 2], ['daylily', 3], ['hosta', 3], ['coneflower', 1], ['boxwood', 2], ['fern', 1], ['rhododendron', 1.2]],
  'upstate-ny': [['daylily', 3], ['hosta', 3], ['hydrangea', 2], ['rose', 2], ['coneflower', 2], ['boxwood', 1]],
  'mid-atlantic': [['hydrangea', 5], ['rose', 3], ['daylily', 3], ['hosta', 2], ['boxwood', 2], ['beachgrass', 1], ['azalea', 3], ['rhododendron', 1.6]],
  appalachia: [['daylily', 3], ['hosta', 2], ['rose', 2], ['hydrangea', 2], ['boxwood', 2], ['coneflower', 1], ['fern', 1], ['rhododendron', 2.4], ['azalea', 1.6]],
  southeast: [['hydrangea', 3], ['boxwood', 2], ['rose', 2], ['daylily', 2], ['hosta', 1], ['azalea', 5], ['rhododendron', 0.6]],
  florida: [['hibiscus', 6], ['agave', 1], ['rose', 1], ['azalea', 1]],
  gulf: [['hibiscus', 2], ['hydrangea', 2], ['rose', 2], ['daylily', 2], ['boxwood', 1], ['azalea', 3.5]],
  texas: [['rose', 2], ['lavender', 1], ['agave', 2], ['sunflower', 1], ['coneflower', 2]],
  plains: [['sunflower', 4], ['coneflower', 4], ['daylily', 2], ['rose', 1]],
  midwest: [['daylily', 3], ['hosta', 3], ['coneflower', 3], ['rose', 2], ['hydrangea', 2], ['sunflower', 1]],
  ozarks: [['coneflower', 3], ['daylily', 2], ['rose', 2], ['hosta', 1], ['hydrangea', 1]],
  rockies: [['rose', 1], ['lavender', 1], ['daylily', 2], ['coneflower', 2], ['sunflower', 1]],
  'desert-sw': [['agave', 6], ['lavender', 2], ['rose', 1]],
  'great-basin': [['lavender', 2], ['rose', 2], ['daylily', 1], ['agave', 1], ['sunflower', 1]],
  california: [['lavender', 4], ['rose', 3], ['agave', 2], ['hibiscus', 1]],
  pnw: [['hydrangea', 3], ['rose', 3], ['fern', 2], ['hosta', 2], ['lavender', 1], ['rhododendron', 2.4], ['azalea', 1]],
};
/** The region's garden: its species weights — the lower 48's region's own, else its climate's (always
 *  non-empty). */
export function plantMix(climate: string, eco = ''): [PlantSpecies, number][] {
  const r = REGION_GARDEN[eco as EcoRegion];
  if (r) return r;
  const m = PLANT_SPECIES.map((s) => [s, SPECIES[s].climates[climate] ?? 0] as [PlantSpecies, number]).filter(([, w]) => w > 0);
  return m.length ? m : [['boxwood', 1], ['rose', 1]];
}
/** Where a place is, for its casts: the climate, the lower 48's region and ecoregion ('' and 0
 *  elsewhere), and whether it's the Northwest's westside (styles.ts westside). */
export interface CastPlace { climate: string; sub: string; eco: string; l3: number; west: boolean; state?: string }
/** The region's forest floor (world/understory.ts): which plants grow under a wood's canopy, and how
 *  thickly (the share of 1.8 m spots that grow one). The westside Northwest's sword fern, salal and
 *  Oregon grape (and the redwood coast's sword fern); ferns in the damp Eastern, Southern and northern
 *  woods; nothing yet in the dry West (each region's ground layer is docs/regional-life/models.md's
 *  to add). */
export function understoryMix(p: CastPlace): { mix: [PlantSpecies, number][]; density: number } {
  if (p.west) return { mix: [['swordfern', 7], ['salal', 3], ['oregongrape', 1.2]], density: 0.6 };
  if (p.eco === 'california' && p.l3 === 1) return { mix: [['swordfern', 1]], density: 0.45 }; // under the redwoods
  const fern = ({ 'new-england': 0.24, 'upstate-ny': 0.24, appalachia: 0.26, 'mid-atlantic': 0.22, southeast: 0.14, gulf: 0.14, florida: 0.1, ozarks: 0.16, midwest: p.l3 === 49 || p.l3 === 50 ? 0.22 : 0.12 } as Partial<Record<string, number>>)[p.eco];
  if (fern) return { mix: [['fern', 1]], density: fern };
  if (p.eco) return { mix: [], density: 0 };
  if ((p.sub === 'northeast' && p.climate !== 'arid') || p.climate === 'boreal') return { mix: [['fern', 1]], density: 0.22 };
  return { mix: [], density: 0 };
}

// The lower 48's broadleaf street, yard and wood trees, region by region (docs/regional-life/: each
// file's canopy and street-tree tables), from the kinds the foundry has — each flora package adds
// its own (models.md build order): New England's and upstate New York's sugar and red maples,
// the South's magnolias, Texas's cedar elms and (west of the Balcones) mesquite, the Plains' elms and
// poplar windbreaks, the Northwest's red alder and bigleaf maple.
// (package #4 adds the East's own: the Appalachian coves' tulip trees, hickories and buckeyes, the
// South's sweetgums and crape myrtles, the dogwood and the redbud in every yard from the Mid-Atlantic
// south and through the Midwest, the Plains' and the Midwest's bur oaks, the redcedars of the old fields —
// each cut to its range within the region by rangeIn)
const REGION_BROAD: Partial<Record<EcoRegion | 'pnw-dry', [TreeKind, number][]>> = {
  'new-england': [['round', 2], ['oak', 1.8], ['maple', 3.2], ['elm', 0.8], ['cherry', 0.4], ['poplar', 0.3], ['hickory', 0.4], ['redcedar', 0.2], ['dogwood', 0.2]],
  'upstate-ny': [['round', 2], ['oak', 1.4], ['maple', 3.4], ['elm', 0.9], ['cherry', 0.4], ['poplar', 0.4], ['hickory', 0.5], ['redcedar', 0.15]],
  'mid-atlantic': [['round', 2.5], ['oak', 2], ['maple', 2.6], ['elm', 1.1], ['cherry', 0.6], ['poplar', 0.4], ['tuliptree', 1.0], ['sweetgum', 1.2], ['dogwood', 0.8], ['redbud', 0.4], ['hickory', 0.3], ['redcedar', 0.4], ['crapemyrtle', 0.6]],
  appalachia: [['round', 3], ['oak', 2.6], ['maple', 2.2], ['magnolia', 0.3], ['elm', 0.4], ['cherry', 0.4], ['poplar', 0.2], ['tuliptree', 2.0], ['hickory', 1.0], ['buckeye', 0.6], ['sweetgum', 0.4], ['dogwood', 0.9], ['redbud', 0.6], ['redcedar', 0.4], ['crapemyrtle', 0.4]],
  southeast: [['round', 2.4], ['oak', 3], ['maple', 1.1], ['magnolia', 1.6], ['cherry', 0.4], ['elm', 0.5], ['poplar', 0.2], ['liveoak', 0.5], ['sweetgum', 1.6], ['tuliptree', 0.8], ['dogwood', 1.1], ['redbud', 0.5], ['crapemyrtle', 1.5], ['hickory', 0.4], ['redcedar', 0.3]],
  florida: [['round', 2], ['liveoak', 3.2], ['oak', 1.2], ['magnolia', 1.8], ['maple', 0.6], ['fanpalm', 0.8], ['crapemyrtle', 1.0], ['sweetgum', 0.4], ['dogwood', 0.2], ['redbud', 0.15]],
  gulf: [['round', 2.4], ['liveoak', 3], ['oak', 1.6], ['magnolia', 1.4], ['maple', 0.8], ['elm', 0.5], ['cherry', 0.3], ['sweetgum', 1.3], ['crapemyrtle', 1.5], ['dogwood', 0.5], ['redbud', 0.4], ['hickory', 0.4]],
  texas: [['round', 1.6], ['liveoak', 2.6], ['oak', 1.4], ['elm', 1.6], ['mesquite', 0.4], ['magnolia', 0.3], ['poplar', 0.2], ['crapemyrtle', 1.5], ['redbud', 0.5], ['hickory', 0.4], ['buroak', 0.25], ['sweetgum', 0.5], ['dogwood', 0.2], ['redcedar', 0.3]],
  plains: [['round', 2.6], ['oak', 1.2], ['elm', 2.2], ['poplar', 1.6], ['maple', 0.8], ['cherry', 0.2], ['buroak', 1.0], ['redcedar', 0.6], ['redbud', 0.25], ['hickory', 0.1]],
  midwest: [['round', 2.5], ['oak', 2.2], ['maple', 2.4], ['elm', 1.4], ['cherry', 0.3], ['poplar', 0.6], ['buroak', 1.0], ['hickory', 0.8], ['tuliptree', 0.5], ['buckeye', 0.4], ['redbud', 0.6], ['dogwood', 0.4], ['sweetgum', 0.25], ['redcedar', 0.3]],
  ozarks: [['round', 2.4], ['oak', 3.4], ['maple', 1.2], ['elm', 0.6], ['cherry', 0.6], ['poplar', 0.2], ['hickory', 1.0], ['redbud', 0.8], ['dogwood', 0.9], ['redcedar', 0.8], ['sweetgum', 0.4], ['buroak', 0.2], ['crapemyrtle', 0.5]],
  rockies: [['round', 2], ['oak', 0.4], ['poplar', 1.8], ['maple', 1]],
  'great-basin': [['round', 2], ['oak', 0.3], ['poplar', 1.6], ['maple', 0.8], ['elm', 1.2]],
  california: [['round', 1.6], ['coastoak', 2.4], ['oak', 1.2], ['poplar', 1.4], ['magnolia', 0.3]],
  pnw: [['round', 2], ['oak', 0.6], ['maple', 3], ['cherry', 0.9], ['poplar', 0.7], ['elm', 0.3], ['alder', 2.4], ['vinemaple', 0.4]],
  'pnw-dry': [['round', 1.6], ['oak', 0.4], ['poplar', 1.8], ['maple', 1], ['elm', 0.6]],
};
/** Texas west of the Balcones and the Cross Timbers' west: mesquite country (EPA 25–27, 29–31). */
const MESQUITE_TX = new Set([25, 26, 27, 29, 30, 31]);
/** The Southeast's coastal plain (the Middle Atlantic and Southern coastal plains, EPA 63, 75): oaks
 *  and magnolias over the Piedmont's tulip poplars, maples and dogwoods (docs/regional-life/05). */
export const SE_COAST = new Set([63, 75]);
const SE_COAST_BROAD: [TreeKind, number][] = [['round', 2], ['liveoak', 3.4], ['oak', 1.4], ['magnolia', 2.2], ['maple', 0.7], ['cherry', 0.3], ['elm', 0.4], ['sweetgum', 1.2], ['crapemyrtle', 1.5], ['dogwood', 0.5], ['redcedar', 0.2], ['tuliptree', 0.15]];
/** Where within its region each of package #4's trees stops (docs/regional-life/ranges.md and each
 *  region's file): 1 it grows here, 0 it doesn't. The crape myrtle hardy to zone 7 — the Mid-Atlantic
 *  only from Delaware and Maryland south, Appalachia's southern valleys; the north woods (EPA 49–51)
 *  past the tulip tree's, the buckeye's, the dogwood's, the redbud's and the sweetgum's reach; Texas's
 *  sweetgums and dogwoods in its east, its bur oaks on the Blackland and the Cross Timbers; Florida's
 *  dogwoods, redbuds and sweetgums in its north (EPA 75). */
function rangeIn(k: TreeKind, p: CastPlace): number {
  const st = p.state ?? '', north = p.eco === 'midwest' && (p.l3 === 49 || p.l3 === 50 || p.l3 === 51);
  switch (k) {
    case 'crapemyrtle':
      if (p.eco === 'mid-atlantic') return ['VA', 'MD', 'DC', 'DE'].includes(st) ? 1 : 0;
      if (p.eco === 'appalachia') return (p.l3 === 67 || p.l3 === 68 || p.l3 === 71) && ['TN', 'GA', 'AL', 'NC', 'SC'].includes(st) ? 1 : 0;
      return 1;
    case 'tuliptree': return p.eco === 'midwest' ? (['OH', 'IN', 'MI', 'KY'].includes(st) || p.l3 === 72) && !north ? 1 : 0 : 1;
    case 'buckeye': return p.eco === 'midwest' ? ['OH', 'IN', 'IL'].includes(st) && !north ? 1 : 0 : 1;
    case 'sweetgum': return p.eco === 'midwest' ? (p.l3 === 72 ? 1 : 0) : p.eco === 'texas' ? (p.l3 === 33 || p.l3 === 34 || p.l3 === 35 ? 1 : 0) : p.eco === 'florida' ? (p.l3 === 75 ? 1 : 0) : 1;
    case 'dogwood':
      if (p.eco === 'new-england') return ['CT', 'RI', 'MA'].includes(st) ? 1 : 0;
      if (p.eco === 'midwest') return north || ['MN', 'WI', 'IA'].includes(st) ? 0 : 1;
      return p.eco === 'texas' ? (p.l3 === 35 || p.l3 === 33 ? 1 : 0) : p.eco === 'florida' ? (p.l3 === 75 ? 1 : 0) : 1;
    case 'redbud':
      if (p.eco === 'midwest') return north || ['MN', 'WI'].includes(st) ? 0 : 1;
      return p.eco === 'plains' ? (['OK', 'KS'].includes(st) ? 1 : 0) : p.eco === 'florida' ? (p.l3 === 75 ? 1 : 0) : 1;
    case 'hickory': return (p.eco === 'midwest' && (p.l3 === 49 || p.l3 === 50)) || (p.eco === 'plains' && !['OK', 'KS', 'NE'].includes(st)) ? 0 : 1;
    case 'buroak': return p.eco === 'texas' ? ([29, 32, 33].includes(p.l3) ? 1 : 0) : 1;
    case 'redcedar': return p.eco === 'texas' ? ([29, 32, 33, 35].includes(p.l3) ? 1 : 0) : p.eco === 'midwest' && (p.l3 === 49 || p.l3 === 50) ? 0 : 1;
  }
  return 1;
}
const inRange = (m: [TreeKind, number][], p: CastPlace) => m.map(([k, w]) => [k, w * rangeIn(k, p)] as [TreeKind, number]).filter(([, w]) => w > 0);
/** Texas by ecoregion: the Hill Country, the Cross Timbers and the brush country's plateau live oak
 *  (EPA 29–31) and the coast's, the Blackland's and the Piney Woods' southern live oak (32–35); the
 *  Panhandle's plains (25–27) have neither — elms, cottonwoods and windbreaks. */
const TX_PLATEAU = new Set([29, 30, 31]), TX_PLAINS = new Set([25, 26, 27]);
/** A place's broadleaf trees past the round and oak a scan keeps (props.ts `broad`): [kind, weight].
 *  In the lower 48 its region's (the tropics and the desert keep their climate's: palms, mesquite);
 *  elsewhere its climate's and subregion's. */
export function broadMix(p: CastPlace): [TreeKind, number][] {
  if (p.eco && p.climate !== 'tropical' && p.climate !== 'arid' && p.climate !== 'polar') {
    const r = p.eco === 'southeast' && SE_COAST.has(p.l3) ? SE_COAST_BROAD : REGION_BROAD[p.eco === 'pnw' && !p.west ? 'pnw-dry' : (p.eco as EcoRegion)];
    if (r && p.eco === 'texas') {
      // (west of the Balcones mesquite country; the plateau oak in the Hill Country, none on the plains)
      return inRange(r.map(([k, w]) => [k === 'liveoak' && TX_PLATEAU.has(p.l3) ? 'plateauoak' : k, k === 'mesquite' && MESQUITE_TX.has(p.l3) ? 2.4 : k === 'liveoak' && TX_PLAINS.has(p.l3) ? 0 : k === 'liveoak' && TX_PLATEAU.has(p.l3) ? 3.2 : w] as [TreeKind, number]).filter(([, w]) => w > 0), p);
    }
    // (southeast Virginia's coastal plain: the live oak's northern edge, a few planted)
    if (r && p.eco === 'mid-atlantic' && p.l3 === 63 && p.state === 'VA') return inRange([...r, ['liveoak', 0.6]], p);
    if (r) return inRange(r, p);
  }
  const c = p.climate, sub = p.sub;
  return c === 'mediterranean' ? [['round', 1.6], ['oak', 2.2], ['poplar', 1.4], ['magnolia', 0.3]]
    : c === 'tropical' ? [['round', 3], ['magnolia', 1]]
      : c === 'arid' || c === 'polar' ? [['round', 1]]
        : sub === 'south' ? [['round', 2.4], ['oak', 3], ['maple', 1.1], ['magnolia', 1.6], ['cherry', 0.4], ['elm', 0.5], ['poplar', 0.2]]
          : sub === 'pnw' ? REGION_BROAD.pnw!
            : sub === 'mountain' ? [['round', 2], ['oak', 0.4], ['poplar', 1.8], ['maple', 1]]
              : sub === 'midwest' ? [['round', 2.5], ['oak', 2.2], ['maple', 2.4], ['elm', 1.4], ['cherry', 0.3], ['poplar', 0.6]]
                : [['round', 2.5], ['oak', 2], ['maple', 2.6], ['elm', 1.1], ['cherry', 0.6], ['poplar', 0.4]]; // the Northeast (and temperate elsewhere)
}
/** Is a species flowering in this month? (south = southern hemisphere, seasons flip) */
export function inBloom(sp: PlantSpecies, month: number, south = false) {
  const S = SPECIES[sp];
  if (!S.bloom.length) return false;
  const m = south ? ((month + 5) % 12) + 1 : month;
  const [a, b] = S.months;
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}

/** A plant at growth g (0 sprout → 1 mature, blooming from ~0.6 when `bloom`). */
/** `lite`: the budget version for world garden beds (hundreds per tile): fewer organs, same silhouette. */
export function plantGeometry(sp: PlantSpecies, seed: number, g: number, bloom = true, lite = false): THREE.BufferGeometry {
  const S = SPECIES[sp];
  const r = makeRng(seed * 4099 + PLANT_SPECIES.indexOf(sp) * 131 + 7);
  const gs = 0.12 + 0.88 * Math.min(1, g); // size follows growth
  const H = S.h * gs, W = S.w * gs;
  const leafC = S.leaf ?? TINT;
  const bc = S.bloom.length ? S.bloom[Math.floor(r.float() * S.bloom.length)] : 0;
  const flowering = bloom && S.bloom.length > 0 && g >= 0.6;
  const fb = flowering ? Math.min(1, (g - 0.55) / 0.35) : 0; // blossom size ramps in
  const parts: THREE.BufferGeometry[] = [];
  const leafy = (geo: THREE.BufferGeometry) => parts.push(part(geo, leafC));
  const flower = (geo: THREE.BufferGeometry) => parts.push(part(geo, bc, P.bloom));

  if (S.form === 'mound' || S.form === 'clipped') {
    const clipped = S.form === 'clipped';
    const n = clipped ? 1 : lite ? 2 : fibCount(Math.min(0.99, g), 1, 3); // 3 → 8 lobes as it fills out
    leafy(blob(W * 0.42, seed + 3, { squash: clipped ? 0.8 : 0.75, lump: clipped ? 0.08 : 0.3 }).translate(0, H * 0.42, 0));
    for (let i = 0; i < n && !clipped; i++) {
      const u = fibSphere(i, n, 0.05, seed);
      leafy(blob(W * 0.26 * taper(i / n, 0.7), seed * 7 + i, { detail: 0 }).translate(u.x * W * 0.32, H * (0.4 + u.y * 0.35), u.z * W * 0.32));
    }
    if (fb > 0) {
      // blossom heads (hydrangea mopheads / roses / hibiscus) scattered over the crown's upper face
      // (the rhododendron's big round trusses; the azalea smothered: many flat flowers over its whole face)
      const azalea = sp === 'azalea', rhodo = sp === 'rhododendron';
      const heads = lite ? (sp === 'hydrangea' ? 2 : azalea ? 7 : 5) : sp === 'hydrangea' ? fibCount(r.float(), 2, 3) : azalea ? 21 : fibCount(r.float(), 3, 4);
      const hr = (sp === 'hydrangea' ? 0.17 : rhodo ? 0.15 : azalea ? (lite ? 0.18 : 0.12) : 0.08) * fb * (0.8 + gs * 0.4);
      for (let i = 0; i < heads; i++) {
        const u = fibSphere(i, heads, 0.1, seed * 3);
        flower(blob(hr * (lite && sp !== 'hydrangea' && !azalea ? 1.25 : 1), seed + 50 + i, { detail: sp === 'hydrangea' ? 1 : 0, lump: sp === 'hydrangea' ? 0.3 : 0.35, squash: azalea ? 0.55 : 0.9 }).translate(u.x * W * (azalea ? 0.47 : 0.44), H * ((azalea ? 0.42 : 0.5) + u.y * (azalea ? 0.5 : 0.42)), u.z * W * (azalea ? 0.47 : 0.44)));
      }
    }
  } else if (S.form === 'rosette') {
    // leaves spiral out at the golden angle, longer and flatter toward the outside
    const n = Math.max(3, Math.round(fibCount(Math.min(0.99, g * 1.1), 2, lite ? 3 : 4) * (sp === 'agave' ? 1 : 0.9)));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const sword = sp === 'swordfern';
      const len = (sp === 'agave' ? 0.75 : sword ? 0.8 : sp === 'fern' ? 0.7 : 0.5) * W * (0.55 + t * 0.6);
      const lf = card(sp === 'agave' ? 0.16 * gs : sword ? 0.15 * gs : sp === 'fern' ? 0.22 * gs : 0.3 * gs, len, sp === 'agave' ? 0.05 : sword ? 0.5 : 0.35, 3);
      lf.rotateX(-(sp === 'agave' ? 1.1 - t * 0.6 : sword ? 1.15 - t * 0.55 : 0.95 - t * 0.5)); // (a sword fern's fronds stand up and arch over)
      lf.rotateY(i * GOLDEN);
      lf.translate(0, 0.04, 0);
      leafy(lf);
    }
    if (fb > 0 && sp === 'hosta') {
      for (let k = 0; k < 3; k++) {
        const a = k * GOLDEN * 2 + r.float();
        const top = V3(Math.cos(a) * 0.1, S.h * 1.4, Math.sin(a) * 0.1);
        leafy(limb(V3(0, 0.05, 0), top, 0.012, 0.01, 3));
        flower(blob(0.06 * fb + 0.02, seed + k, { detail: 0 }).scale(0.6, 1.8, 0.6).translate(top.x, top.y, top.z));
      }
    }
  } else if (S.form === 'spike' || S.form === 'clump') {
    // blades/stems fountaining out from the base
    const n = S.form === 'clump' ? fibCount(Math.min(0.99, g), 2, lite ? 3 : 5) : fibCount(Math.min(0.99, g), 2, lite ? 3 : 4);
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN + r.float() * 0.3;
      const lean = 0.2 + (i % 5) * 0.12;
      const len = H * (0.75 + r.float() * 0.4);
      const blade = card(S.form === 'clump' ? (lite ? 0.07 : 0.05) : 0.03, len, S.form === 'clump' ? 0.35 : 0.08, lite ? 2 : 3);
      blade.rotateX(-(Math.PI / 2 - lean));
      blade.rotateY(a);
      leafy(blade);
      if (fb > 0 && (S.form === 'spike' || (sp === 'daylily' && i % 4 === 0))) {
        const tip = V3(Math.sin(a) * Math.sin(lean) * len, Math.cos(lean) * len, Math.cos(a) * Math.sin(lean) * len);
        if (S.form === 'spike') flower(new THREE.CylinderGeometry(0.035 * fb + 0.01, 0.02, 0.2 * fb + 0.04, 5).translate(tip.x, tip.y + 0.05, tip.z));
        else flower(lathe([[0.001, 0], [0.09 * fb, 0.05], [0.13 * fb, 0.12]], 6).translate(tip.x, tip.y, tip.z));
      }
    }
    if (sp === 'beachgrass' && g > 0.7) for (let k = 0; k < 3; k++) {
      const a = k * GOLDEN * 3;
      parts.push(part(new THREE.CylinderGeometry(0.02, 0.012, 0.25, 4).translate(Math.cos(a) * 0.1, H * 1.1, Math.sin(a) * 0.1), 0xd8cc98));
    }
  } else if (S.form === 'stem') {
    // one or a few stems; a composite head of Fibonacci-many petals around a seeded disc
    const stems = sp === 'sunflower' || lite ? 1 : fibCount(r.float(), 1, 2);
    for (let s = 0; s < stems; s++) {
      const a = s * GOLDEN + r.float();
      const top = V3(Math.cos(a) * 0.12 * s, H * (1 - s * 0.12), Math.sin(a) * 0.12 * s);
      leafy(limb(V3(0, 0, 0), top, sp === 'sunflower' ? 0.03 : 0.012, sp === 'sunflower' ? 0.02 : 0.008, 4));
      const leaves = fibCount(Math.min(0.99, g), 1, 3);
      for (let k = 0; k < leaves; k++) {
        const lf = card(sp === 'sunflower' ? 0.24 * gs : 0.07, sp === 'sunflower' ? 0.34 * gs : 0.18, 0.3, 2);
        lf.rotateX(-1.0);
        lf.rotateY(k * GOLDEN + a);
        lf.translate(top.x * 0.5, top.y * (0.25 + (k / leaves) * 0.55), top.z * 0.5);
        leafy(lf);
      }
      if (fb > 0) {
        const disc = (sp === 'sunflower' ? 0.14 : 0.04) * fb + 0.01;
        const face = sp === 'sunflower' ? -1.1 : 0; // sunflower heads turn to face out; coneflowers look up
        parts.push(part(new THREE.CylinderGeometry(disc, disc * 0.8, disc * 0.6, 8).rotateX(face).translate(top.x, top.y, top.z), sp === 'sunflower' ? 0x5a3c22 : 0x8a4a28));
        const petals = lite ? (sp === 'sunflower' ? 13 : 8) : sp === 'sunflower' ? 21 : 13;
        for (let k = 0; k < petals; k++) {
          const pt = card(disc * 0.7, disc * 1.4, 0.15, 1).translate(0, 0, disc * 0.55);
          pt.rotateX(sp === 'coneflower' ? 0.45 : -0.15); // sunflower petals cup; coneflower petals droop
          pt.rotateY(k * ((2 * Math.PI) / petals));
          pt.rotateX(face);
          pt.translate(top.x, top.y, top.z);
          flower(pt);
        }
      }
    }
  }
  return merge(parts);
}
export const plantLib = (sp: PlantSpecies, v: number, stage: number, bloom = true, lite = false) =>
  cached(`plant:${sp}:${v}:${stage}:${bloom ? 1 : 0}:${lite ? 1 : 0}`, () => plantGeometry(sp, v + 1, (stage + 1) / STAGES, bloom, lite));


// ---------------- the northern and mountain conifers by place (models.md build order #3) ----------------

/** Where a scan's generic conifer stands, in a Colorado tree-line's metres: real elevation, its bands
 *  ~110 m lower a degree north (Montana's ponderosa grows where Arizona's would be desert scrub). */
export const bandElevation = (elev: number, lat: number) => elev + (lat - 39) * 110;
/** The West's mountain bands (docs/regional-life/12-rockies.md), in bandElevation's metres. */
export const BANDS = { ponderosaFloor: 1450, montane: 2450, subalpine: 2900 } as const;
const WEST_MOUNTAINS = new Set(['rockies', 'great-basin', 'desert-sw', 'california']);
/** What the scan's generic `pine` or `spruce` becomes here (props.ts regional): the region's own
 *  conifers by weight — the West's by elevation band, the Northeast's white pine, red spruce, balsam
 *  fir and eastern hemlock, the north woods', the South's loblolly, longleaf and slash pines — or [] to
 *  keep the generic kind. `west`-side Northwest conifers are props.ts's own (nwConifer). */
export function coniferMix(p: CastPlace, kind: 'pine' | 'spruce', elev: number, lat: number, coast = false): [TreeKind, number][] {
  const pine = kind === 'pine';
  const dry = p.eco === 'pnw' && !p.west;
  if (WEST_MOUNTAINS.has(p.eco) || dry) {
    // (the desert's and the basin's floors keep theirs: piñon and juniper are package #7's)
    if (p.eco === 'california' && p.l3 !== 5 && p.l3 !== 4 && p.l3 !== 9 && p.l3 !== 78) return [];
    const z = bandElevation(elev, lat);
    if ((p.eco === 'desert-sw' || p.eco === 'great-basin') && z < BANDS.ponderosaFloor) return [];
    // (the Front Range's foothills: Douglas fir on the north slopes among the ponderosa; the drier
    // foothills of the Northwest's dry side, the Great Basin and the desert's mountains mostly ponderosa)
    if (z < BANDS.montane) return pine ? [['ponderosa', 1]] : p.eco === 'rockies' ? [['fir', 0.6], ['ponderosa', 0.4]] : [['ponderosa', 0.65], ['fir', 0.35]];
    if (z < BANDS.subalpine) return pine ? [['lodgepole', 0.55], ['ponderosa', 0.45]] : [['fir', 0.5], ['engelmann', 0.25], ['subalpinefir', 0.25]];
    return pine ? [['lodgepole', 1]] : [['engelmann', 0.55], ['subalpinefir', 0.45]];
  }
  switch (p.eco) {
    case 'new-england':
      // (pitch pine on the sandy coast — Cape Cod, the islands — white pine inland)
      return pine ? (coast ? [['pine', 0.65], ['whitepine', 0.35]] : [['whitepine', 0.8], ['pine', 0.2]]) : [['easthemlock', 0.45], ['redspruce', 0.4], ['balsamfir', 0.3]];
    case 'upstate-ny':
      return pine ? [['whitepine', 0.85], ['pine', 0.15]] : p.l3 === 58 ? [['redspruce', 0.4], ['balsamfir', 0.4], ['easthemlock', 0.3]] : [['easthemlock', 0.5], ['redspruce', 0.25], ['balsamfir', 0.25]];
    case 'mid-atlantic':
      // (the loblolly's northern edge: Virginia's, Maryland's and Delaware's coastal plain and Piedmont;
      // New Jersey's Pine Barrens are pitch pine)
      if (pine && (p.l3 === 63 || p.l3 === 45 || p.l3 === 65) && ['VA', 'MD', 'DE'].includes(p.state ?? '')) return [['loblolly', 0.6], ['pine', 0.3], ['whitepine', 0.1]];
      return pine ? [['pine', 0.75], ['whitepine', 0.25]] : [['easthemlock', 0.5], ['spruce', 0.5]];
    case 'appalachia':
      // (the Smokies' and the Black Mountains' spruce-fir summits above ~1,500 m; the southern ridges'
      // and valleys' loblolly, below the mountains)
      if (pine && (p.l3 === 67 || p.l3 === 68) && ['TN', 'GA', 'AL'].includes(p.state ?? '') && elev < 600) return [['loblolly', 0.55], ['whitepine', 0.15], ['pine', 0.3]];
      return pine ? [['whitepine', 0.55], ['pine', 0.45]] : elev > 1500 ? [['redspruce', 0.75], ['balsamfir', 0.25]] : [['easthemlock', 0.7], ['redspruce', 0.3]];
    // the South's pines (docs/regional-life/05–08): loblolly on the Piedmont and in the plantations
    // everywhere; longleaf on the Sandhills and the coastal plains (EPA 63 in the Carolinas, 65, 75; the
    // Gulf's; East Texas's Big Thicket); slash pine on the lower coastal plain and the Gulf, and all of
    // South Florida's (76)
    case 'southeast':
      if (!pine) return [];
      if (p.l3 === 45) return [['loblolly', 0.85], ['pine', 0.15]];
      if (p.l3 === 65) return [['loblolly', 0.5], ['longleaf', 0.42], ['slashpine', 0.08]];
      if (p.l3 === 63 || p.l3 === 75) return lat < 33.5 ? [['loblolly', 0.42], ['longleaf', 0.3], ['slashpine', 0.28]] : [['loblolly', 0.6], ['longleaf', 0.35], ['pine', 0.05]];
      return [['loblolly', 1]];
    case 'gulf':
      if (!pine) return [];
      if (p.l3 === 65 || p.l3 === 75) return [['longleaf', 0.4], ['slashpine', 0.3], ['loblolly', 0.3]];
      if (p.l3 === 35) return [['loblolly', 0.7], ['longleaf', 0.3]];
      if (p.l3 === 34) return [['loblolly', 0.7], ['slashpine', 0.3]];
      return [['loblolly', 1]];
    case 'florida':
      if (!pine) return [];
      return p.l3 === 76 ? [['slashpine', 1]] : [['longleaf', 0.45], ['slashpine', 0.55]];
    case 'texas':
      if (!pine) return [];
      return p.l3 === 35 ? [['loblolly', 0.7], ['longleaf', 0.3]] : p.l3 === 33 || p.l3 === 34 || p.l3 === 32 ? [['loblolly', 1]] : [];
    case 'ozarks':
      // (the shortleaf pine's country: the loblolly stands in for it, a tall bole and a small crown, until
      // its own row; the Ouachitas have both)
      return pine ? [['loblolly', 0.6], ['pine', 0.4]] : [];
    case 'midwest':
      return p.l3 === 49 || p.l3 === 50 || p.l3 === 51
        ? (pine ? [['whitepine', 0.6], ['pine', 0.4]] : [['balsamfir', 0.5], ['spruce', 0.3], ['easthemlock', 0.2]])
        : (pine ? [['whitepine', 0.3], ['pine', 0.7]] : []);
    case 'plains':
      // (the Pine Ridge's and the Niobrara's ponderosa; windbreak pines and blue spruce elsewhere)
      return pine && (p.l3 === 25 || p.l3 === 43 || p.l3 === 44) ? [['ponderosa', 0.6], ['pine', 0.4]] : [];
  }
  return [];
}
/** Where quaking aspen stands in for a scan's round broadleaf: the West's montane band (its groves gold
 *  against the dark spruce), and among the north woods' birches. The share of round picks it takes. */
export function aspenShare(p: CastPlace, elev: number, lat: number): number {
  if (WEST_MOUNTAINS.has(p.eco) || (p.eco === 'pnw' && !p.west)) {
    const z = bandElevation(elev, lat);
    return z > 2150 && z < 3300 ? 0.5 : z > 1750 && z <= 2150 ? 0.2 : 0;
  }
  if (p.eco === 'new-england' || p.eco === 'upstate-ny') return p.l3 === 58 || p.l3 === 82 ? 0.2 : 0.08;
  if (p.eco === 'midwest' && (p.l3 === 49 || p.l3 === 50)) return 0.25;
  return 0;
}
/** Where willow thickets crowd the creeks and bogs: the West's mountains and dry side, the North. */
export const willowThickets = (p: CastPlace) => WEST_MOUNTAINS.has(p.eco) && p.eco !== 'desert-sw' || (p.eco === 'pnw' && !p.west) || p.eco === 'new-england' || p.eco === 'upstate-ny' || (p.eco === 'midwest' && (p.l3 === 49 || p.l3 === 50 || p.l3 === 51)) || p.eco === 'plains';
/** Standing dead trees in a wood (models.md `snag`): the Rockies' beetle-killed lodgepole and spruce,
 *  the East's hemlocks the adelgid took, the North's drowned beaver-pond trunks — the share of a
 *  wood's trees of `kind` that stand dead here (and `wet`: beside fresh water). */
export function snagShare(p: CastPlace, kind: TreeKind, wet: boolean): number {
  const west = WEST_MOUNTAINS.has(p.eco) || (p.eco === 'pnw' && !p.west);
  if (west && (kind === 'lodgepole' || kind === 'engelmann' || kind === 'subalpinefir')) return 0.1;
  if (kind === 'easthemlock' && (p.eco === 'appalachia' || p.eco === 'mid-atlantic' || (p.eco === 'new-england' && p.l3 === 59))) return 0.14;
  if (wet && (p.eco === 'new-england' || p.eco === 'upstate-ny' || (p.eco === 'midwest' && (p.l3 === 49 || p.l3 === 50)) || west)) return 0.12;
  return 0;
}

// ---------------- package #4 by place: the eastern hardwoods, the flowering understory, the southern pines ----------------

/** The east of the Rockies where the sycamore leans over the creeks (docs/regional-life/models.md
 *  american-sycamore): southern New England to Texas and the Plains' eastern rivers. */
function sycamoreCountry(p: CastPlace): boolean {
  const st = p.state ?? '';
  switch (p.eco) {
    case 'mid-atlantic': case 'appalachia': case 'southeast': case 'gulf': case 'ozarks': case 'texas': case 'upstate-ny': return true;
    case 'midwest': return p.l3 !== 49 && p.l3 !== 50 && p.l3 !== 51;
    case 'new-england': return ['CT', 'RI', 'MA'].includes(st);
    case 'plains': return ['OK', 'KS', 'NE'].includes(st);
  }
  return false;
}
/** The trees of a stream's bank (props.ts: a broadleaf close to fresh water) — [kind, weight]: the
 *  weeping willow, and in sycamore country the sycamore leaning out over the water, its white limbs. */
export function bankMix(p: CastPlace): [TreeKind, number][] {
  return sycamoreCountry(p) ? [['willow', 0.45], ['sycamore', 0.55]] : [['willow', 1]];
}
/** Eastern redcedar's share of the trees on open ground (a scan's grassland and shrubland: the old
 *  fields, fence lines and glades it takes over east of the Plains — and spreads across the Plains). */
export function redcedarShare(p: CastPlace): number {
  const st = p.state ?? '';
  switch (p.eco) {
    case 'ozarks': return 0.55;
    case 'plains': return ['OK', 'KS', 'NE'].includes(st) ? 0.45 : 0.2;
    case 'appalachia': return 0.4;
    case 'mid-atlantic': return 0.35;
    case 'southeast': return 0.3;
    case 'midwest': return p.l3 === 49 || p.l3 === 50 ? 0 : 0.3;
    case 'texas': return [29, 32, 33, 35].includes(p.l3) ? 0.35 : 0;
    case 'gulf': return 0.15;
    case 'new-england': case 'upstate-ny': return 0.2;
  }
  return 0;
}
/** The rosebay's thickets ("laurel hells") — Appalachia's mountains and plateaus alone (not the
 *  Interior Plateau's bluegrass and basins, EPA 71): the share of a scan's shrubs that are rosebay by a
 *  stream, or in a wood. */
export function rosebayShare(p: CastPlace, stream: boolean, wood: boolean): number {
  if (p.eco !== 'appalachia' || p.l3 === 71) return 0;
  return stream ? 0.75 : wood ? 0.3 : 0;
}
/** The small trees under an eastern wood's canopy (props.ts: a scan's shrub in a wood): flowering
 *  dogwood and redbud, the white and magenta layers of the April woods — [kind, share of the shrubs],
 *  by their weights in the place's mix, or [] past their range. */
export function understoryTrees(p: CastPlace): [TreeKind, number][] {
  const m = broadMix(p), dw = m.find(([k]) => k === 'dogwood')?.[1] ?? 0, rb = m.find(([k]) => k === 'redbud')?.[1] ?? 0;
  return dw + rb > 0 ? ([['dogwood', (0.45 * dw) / (dw + rb)], ['redbud', (0.45 * rb) / (dw + rb)]] as [TreeKind, number][]).filter(([, w]) => w > 0) : [];
}
/** The small trees' tallest (m): a survey's 18 m crown is never a dogwood stretched to fit it. */
export const SMALL_TREE: Partial<Record<TreeKind, number>> = { dogwood: 10, redbud: 10, crapemyrtle: 9, rosebay: 6.5 };
/** Package #4's trees at their real heights (m), for a draw u (0–1), in a wood or not (props.ts) — 0
 *  for the kinds props.ts sizes itself. The tulip tree the tallest hardwood of the East (26–40 m in a
 *  cove), the loblolly 24–33 in a stand, the longleaf's grass stage under a metre. */
export function treeHeight4(k: TreeKind, v: number, u: number, wood: boolean): number {
  switch (k) {
    case 'tuliptree': return wood ? 26 + u * 14 : 16 + u * 12;
    case 'sweetgum': return wood ? 20 + u * 10 : 12 + u * 10;
    case 'hickory': return wood ? 20 + u * 9 : 14 + u * 8;
    case 'buckeye': return wood ? 18 + u * 10 : 10 + u * 8;
    case 'sycamore': return wood ? 24 + u * 12 : 16 + u * 10;
    case 'buroak': return wood ? 20 + u * 9 : 15 + u * 9;
    case 'dogwood': return 4 + u * 5;
    case 'redbud': return 4.5 + u * 4.5;
    case 'crapemyrtle': return v === 2 ? 3 + u * 2 : 3.5 + u * 4.5;
    case 'loblolly': return v === 1 ? 18 + u * 8 : wood ? 24 + u * 9 : 15 + u * 10;
    case 'longleaf': return v === 0 ? 0.4 + u * 0.35 : v === 1 ? 2 + u * 4 : wood ? 22 + u * 10 : 17 + u * 10;
    case 'slashpine': return v === 2 ? 10 + u * 8 : wood ? 21 + u * 9 : 13 + u * 9;
    case 'redcedar': return wood ? 9 + u * 7 : 5 + u * 8;
    case 'rosebay': return 2.5 + u * 3.5;
  }
  return 0;
}
/** A southern pine's grown form for a draw u (0–1): the longleaf's woods full of grass stages and
 *  bottlebrushes under the old trees (fire keeps them so), the loblolly's plantations, South Florida's
 *  own slash pine on the rocklands (EPA 76). */
export function southPineForm(k: TreeKind, u: number, wood: boolean, p: CastPlace): number {
  if (k === 'longleaf') return wood ? (u < 0.22 ? 0 : u < 0.36 ? 1 : 2) : u < 0.1 ? 0 : u < 0.25 ? 1 : 2;
  if (k === 'slashpine') return p.l3 === 76 ? 2 : wood ? 1 : u < 0.7 ? 0 : 1;
  return wood ? (u < 0.55 ? 1 : 2) : u < 0.65 ? 0 : u < 0.85 ? 1 : 2;
}
