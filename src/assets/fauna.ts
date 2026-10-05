// Fauna — small animals built from one quadruped/bird skeleton (docs/ASSET_FOUNDRY.md §Fauna).
//
// Each species is a handful of parameters over a shared body plan (torso, head, limbs, tail,
// wings), in the Spore / No Man's Sky spirit: one tested skeleton, many animals. Limbs, tail,
// head and wings carry an `aPart` and an `aPivot` (the joint they swing about), and the critter
// material animates them in the vertex shader from a per-instance `aAnim` (gait phase, gait
// amount, pose) — no skinning, no rigs, one instanced draw per species.
import * as THREE from 'three';
import { P, part, merge, limb, blob, card, cached, taper } from './core';
import { paintMaterial } from '../render/shared';
import type { EcoRegion } from '../world/ecoregions';

export type CritterKind =
  | 'squirrel' | 'rabbit' | 'songbird' | 'sandpiper' | 'deer' | 'butterfly' | 'firefly' | 'fox' | 'hawk'
  | 'coyote' | 'jackrabbit' | 'snowshoe' | 'groundSquirrel' | 'muleDeer' | 'roadrunner' | 'quail' | 'ibis';
export const CRITTERS: CritterKind[] = ['squirrel', 'rabbit', 'songbird', 'sandpiper', 'deer', 'butterfly', 'firefly', 'fox', 'hawk', 'coyote', 'jackrabbit', 'snowshoe', 'groundSquirrel', 'muleDeer', 'roadrunner', 'quail', 'ibis'];
export const CRITTER_NAME: Record<CritterKind, string> = {
  squirrel: 'squirrel', rabbit: 'rabbit', songbird: 'songbird', sandpiper: 'sandpiper', deer: 'white-tailed deer', butterfly: 'butterfly', firefly: 'firefly', fox: 'red fox', hawk: 'red-tailed hawk',
  coyote: 'coyote', jackrabbit: 'black-tailed jackrabbit', snowshoe: 'snowshoe hare', groundSquirrel: 'ground squirrel', muleDeer: 'mule deer', roadrunner: 'greater roadrunner', quail: 'quail', ibis: 'white ibis',
};

/** Ecological roles: the sim (sim/critters.ts) gives each role its habitat and behaviour; the
 *  species that fills a role comes from the place (faunaMix) — a desert's grazer is a jackrabbit
 *  (and a roadrunner), a north-woods one a snowshoe hare. New species = a table row, not new code. */
export type CritterRole = 'climber' | 'burrower' | 'grazer' | 'songbird' | 'shorebird' | 'browser' | 'butterfly' | 'firefly' | 'predator' | 'raptor';
export const ROLES: CritterRole[] = ['climber', 'burrower', 'grazer', 'songbird', 'shorebird', 'browser', 'butterfly', 'firefly', 'predator', 'raptor'];
export const ROLE: Record<CritterKind, CritterRole> = {
  squirrel: 'climber', groundSquirrel: 'burrower', rabbit: 'grazer', jackrabbit: 'grazer', snowshoe: 'grazer', roadrunner: 'grazer',
  songbird: 'songbird', quail: 'songbird', sandpiper: 'shorebird', ibis: 'shorebird', deer: 'browser', muleDeer: 'browser',
  butterfly: 'butterfly', firefly: 'firefly', fox: 'predator', coyote: 'predator', hawk: 'raptor',
};
export type FaunaMix = Partial<Record<CritterRole, [CritterKind, number][]>>;
// Species per role by climate (Köppen-ish, the same key the plant and car mixes use). North
// American species first — the lower 48 is the goal; other continents fall back to the closest
// climate's cast until they get their own rows.
const FAUNA: Record<string, FaunaMix> = {
  temperate: { climber: [['squirrel', 1]], grazer: [['rabbit', 1]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 1]], browser: [['deer', 1]], predator: [['fox', 1], ['coyote', 0.25]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]], firefly: [['firefly', 1]] },
  continental: { climber: [['squirrel', 1]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 1], ['jackrabbit', 0.3]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 1]], browser: [['deer', 1], ['muleDeer', 0.3]], predator: [['coyote', 1], ['fox', 0.7]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]], firefly: [['firefly', 1]] },
  boreal: { climber: [['squirrel', 1]], grazer: [['snowshoe', 1]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 1]], browser: [['deer', 1]], predator: [['fox', 1], ['coyote', 0.5]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.6]] },
  polar: { grazer: [['snowshoe', 1]], predator: [['fox', 1]], shorebird: [['sandpiper', 0.5]] },
  arid: { climber: [['squirrel', 0.15]], burrower: [['groundSquirrel', 1]], grazer: [['jackrabbit', 1], ['roadrunner', 0.35]], songbird: [['quail', 1], ['songbird', 0.4]], shorebird: [['sandpiper', 0.4]], browser: [['muleDeer', 1]], predator: [['coyote', 1]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.5]] },
  mediterranean: { climber: [['squirrel', 1]], burrower: [['groundSquirrel', 0.7]], grazer: [['rabbit', 1], ['jackrabbit', 0.3]], songbird: [['songbird', 1], ['quail', 0.6]], shorebird: [['sandpiper', 1]], browser: [['muleDeer', 1]], predator: [['coyote', 1], ['fox', 0.3]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]] },
  tropical: { climber: [['squirrel', 1]], grazer: [['rabbit', 1]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 1], ['ibis', 1]], browser: [['deer', 0.6]], predator: [['fox', 0.5]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1.3]], firefly: [['firefly', 0.6]] },
};
// …and in the lower 48, each region's own cast (docs/regional-life/: each file's wildlife, how common
// each animal is), from the species the foundry has — each wildlife package adds its own (models.md
// build order #11–#16). The range rules (docs/regional-life/ranges.md) are this table's: fireflies
// that flash only east of the Plains; the white ibis on the Southern coasts and in Florida; the
// roadrunner, the jackrabbit and the quail in the dry West and the southern Plains; the Northwest's
// deer the black-tailed (a mule deer); the snowshoe hare in the north woods.
const EAST: FaunaMix = FAUNA.temperate; // (the Mid-Atlantic's: the shore's cast as it was)
const REGION_FAUNA: Record<EcoRegion | 'pnw-dry', FaunaMix> = {
  'new-england': { ...EAST, predator: [['fox', 1], ['coyote', 0.7]] },
  'upstate-ny': { ...EAST, predator: [['fox', 1], ['coyote', 0.7]] },
  'mid-atlantic': EAST,
  appalachia: { ...EAST, predator: [['fox', 1], ['coyote', 0.5]] },
  southeast: { ...EAST, predator: [['fox', 1], ['coyote', 0.5]] },
  florida: { climber: [['squirrel', 1]], grazer: [['rabbit', 1]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 1], ['ibis', 1.4]], browser: [['deer', 0.5]], predator: [['fox', 0.4], ['coyote', 0.3]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1.3]], firefly: [['firefly', 0.6]] },
  gulf: { ...EAST, shorebird: [['sandpiper', 1], ['ibis', 0.8]], predator: [['fox', 0.8], ['coyote', 0.6]] },
  texas: { ...EAST, shorebird: [['sandpiper', 1], ['ibis', 0.3]], predator: [['coyote', 1], ['fox', 0.4]], butterfly: [['butterfly', 1.2]], firefly: [['firefly', 0.7]] },
  plains: { climber: [['squirrel', 0.8]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 1], ['jackrabbit', 0.6]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 0.6]], browser: [['deer', 1], ['muleDeer', 0.6]], predator: [['coyote', 1], ['fox', 0.5]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]] },
  midwest: { ...EAST, predator: [['fox', 1], ['coyote', 0.6]], firefly: [['firefly', 1.2]] },
  ozarks: { ...EAST, grazer: [['rabbit', 1], ['roadrunner', 0.1]], predator: [['fox', 0.8], ['coyote', 0.7]] },
  rockies: { climber: [['squirrel', 1]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 0.7], ['snowshoe', 0.5]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 0.5]], browser: [['muleDeer', 1], ['deer', 0.4]], predator: [['coyote', 1], ['fox', 0.6]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]] },
  'desert-sw': FAUNA.arid,
  'great-basin': { climber: [['squirrel', 0.3]], burrower: [['groundSquirrel', 1]], grazer: [['jackrabbit', 1], ['rabbit', 0.5]], songbird: [['songbird', 1], ['quail', 0.5]], shorebird: [['sandpiper', 0.6]], browser: [['muleDeer', 1]], predator: [['coyote', 1]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.6]] },
  california: FAUNA.mediterranean,
  pnw: { climber: [['squirrel', 1]], grazer: [['rabbit', 1]], songbird: [['songbird', 1]], shorebird: [['sandpiper', 1]], browser: [['muleDeer', 1], ['deer', 0.15]], predator: [['coyote', 1], ['fox', 0.5]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.8]] },
  'pnw-dry': { climber: [['squirrel', 0.6]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 0.6], ['jackrabbit', 0.6]], songbird: [['songbird', 1], ['quail', 0.4]], shorebird: [['sandpiper', 0.5]], browser: [['muleDeer', 1], ['deer', 0.4]], predator: [['coyote', 1]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.8]] },
};
/** The north woods' ecoregions (the Adirondacks and northern New England, Maine's Acadian hills, the
 *  Northwoods of Minnesota, Wisconsin and Michigan): the snowshoe hare's. */
const NORTH_WOODS = new Set([58, 82, 49, 50]);
/** The tallgrass Plains east of the 98th meridian (the Flint Hills, the Cross Timbers, the Central
 *  Irregular Plains, the Western Corn Belt, the Red River Valley): fireflies still flash there. */
const PLAINS_EAST = new Set([28, 29, 40, 47, 48]);
/** Texas west of the Balcones (the High Plains, the Rolling Plains, the Edwards Plateau, the brush
 *  country): the roadrunner's, the jackrabbit's and the quail's. */
const TEXAS_WEST = new Set([25, 26, 27, 29, 30, 31]);

/** The species cast for a place: role → weighted species (a role missing from the mix simply doesn't
 *  appear). In the lower 48 its region's (`place`: styles.ts castOf), else its climate's. */
export function faunaMix(region: string, climate: string, place?: { eco: string; l3: number; west: boolean }): FaunaMix {
  void region; // continents get their own rows here as they come online
  const eco = place?.eco as EcoRegion | undefined;
  if (eco && REGION_FAUNA[eco]) {
    const l3 = place!.l3;
    let m = REGION_FAUNA[eco === 'pnw' && !place!.west ? 'pnw-dry' : eco];
    if (NORTH_WOODS.has(l3)) m = { ...m, grazer: [...(m.grazer ?? []), ['snowshoe', 0.6]] };
    if (eco === 'plains' && PLAINS_EAST.has(l3)) m = { ...m, firefly: [['firefly', 0.6]] };
    if (eco === 'southeast' && (l3 === 63 || l3 === 75)) m = { ...m, shorebird: [['sandpiper', 1], ['ibis', 0.6]] }; // (the coastal plain's marshes)
    if (eco === 'texas' && TEXAS_WEST.has(l3)) {
      // (the High and Rolling Plains' dry nights flash no fireflies; the Hill Country and the brush a few)
      const { firefly: _f, ...dry } = m;
      m = { ...dry, burrower: [['groundSquirrel', 0.6]], grazer: [['rabbit', 1], ['jackrabbit', 0.7], ['roadrunner', 0.4]], songbird: [['songbird', 1], ['quail', 0.5]], ...(l3 >= 29 ? { firefly: [['firefly', 0.3]] as [CritterKind, number][] } : {}) };
    }
    return m;
  }
  return FAUNA[climate] ?? FAUNA.temperate;
}

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Four-legged species as parameters over the four base builds (squirrel, rabbit, deer, fox):
// overall scale, coat / belly, leg-stocking and tail-tip colours, ear size, tail fullness.
interface Quad { base: 'squirrel' | 'rabbit' | 'deer' | 'fox'; k?: number; coat?: number; belly?: number; stock?: number; tailTip?: number; ear?: number; earC?: number; plume?: number }
const QUAD: Partial<Record<CritterKind, Quad>> = {
  squirrel: { base: 'squirrel' }, rabbit: { base: 'rabbit' }, deer: { base: 'deer' }, fox: { base: 'fox' },
  // a coyote: the fox plan a third bigger, grizzled tan-grey, tan legs, big ears, a black-tipped brush
  coyote: { base: 'fox', k: 1.3, coat: 0x9c8c74, belly: 0xe2d8c4, stock: 0x8a7658, tailTip: 0x2a2622, ear: 1.25, earC: 0x8a7a64 },
  // a jackrabbit: rangy, sandy, with the enormous ears
  jackrabbit: { base: 'rabbit', k: 1.25, coat: 0xa8906a, ear: 1.5 },
  // a snowshoe hare: coat is TINT — the sim paints it brown in summer and white in winter
  snowshoe: { base: 'rabbit', k: 1.15, coat: 0xffffff, belly: 0xf2eee6, ear: 0.9 },
  // a ground squirrel: sandy, a thin tail (it bolts down a burrow, not up a tree)
  groundSquirrel: { base: 'squirrel', k: 1.1, coat: 0xa08462, plume: 0.55 },
  // a mule deer: greyer, and the mule ears
  muleDeer: { base: 'deer', k: 1.05, coat: 0x8f7f6c, ear: 1.4 },
};
// Birds: the bird plan with its colours, legs, bill and body plan, scaled up from songbird size.
interface Bird { coat: number; belly: number; legC: number; beakC: number; legH: number; beakL: number; plan?: BirdPlan; k?: number }
const BIRD: Partial<Record<CritterKind, Bird>> = {
  songbird: { coat: 0xffffff, belly: 0xe4d6c0, legC: 0x6a5040, beakC: 0xd8a040, legH: 0.025, beakL: 0.022 }, // TINT coat, painted per bird
  sandpiper: { coat: 0xa89a86, belly: 0xf2eee6, legC: 0x3a3530, beakC: 0x2a2622, legH: 0.06, beakL: 0.05 },
  // slim, broad-winged, the red tail
  hawk: { coat: 0x5a4232, belly: 0xeee2cc, legC: 0x3a2f28, beakC: 0xd8a040, legH: 0.025, beakL: 0.014, k: 3.3, plan: { wing: [0.07, 0.15], tail: [0.08, 0.07], head: [0.03, -0.085], tailC: 0xb5502e, body: [0.58, 0.6, 1.5], band: 0x5a4232, fingers: 4 } },
  // long-legged, streaky, a long tail cocked up and a shaggy crest
  roadrunner: { coat: 0x6e5a44, belly: 0xd8ccb4, legC: 0x7a8a9a, beakC: 0x2a2622, legH: 0.045, beakL: 0.03, k: 2.3, plan: { body: [0.7, 0.7, 1.35], tail: [0.03, 0.17], crest: 0x3a3028, head: [0.05, -0.08] } },
  // plump and grey with a forward-curling topknot
  quail: { coat: 0x7a7a82, belly: 0xc8b08a, legC: 0x6a5a4a, beakC: 0x2a2622, legH: 0.018, beakL: 0.012, k: 1.6, plan: { body: [1.05, 0.95, 1.05], tail: [0.04, 0.035], crest: 0x2a2622, head: [0.04, -0.065] } },
  // white, long red legs, the long down-curved bill
  ibis: { coat: 0xf4f2ee, belly: 0xf4f2ee, legC: 0xd86a4a, beakC: 0xd86a4a, legH: 0.1, beakL: 0.1, k: 2.4, plan: { body: [0.75, 0.75, 1.3], curve: 0.55, head: [0.06, -0.075] } },
};
// the dog's tail: root to tip (up and back from the rump, in metres before the dog's 1.18)
const DOG_TAIL: [number, number][] = [[-0.012, -0.025], [0.03, 0.065], [0.075, 0.145], [0.105, 0.21], [0.118, 0.255]];
const scaleGeo = (g: THREE.BufferGeometry, k: number) => {
  if (k === 1) return g;
  for (const a of ['position', 'aPivot']) { const at = g.getAttribute(a); for (let i = 0; i < at.count; i++) at.setXYZ(i, at.getX(i) * k, at.getY(i) * k, at.getZ(i) * k); }
  g.computeBoundingBox();
  return g;
};
// a part that swings about `pivot`
function jointed(g: THREE.BufferGeometry, hex: number, id: number, pivot: THREE.Vector3) {
  const p = part(g, hex, id);
  const n = p.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([pivot.x, pivot.y, pivot.z], i * 3);
  p.setAttribute('aPivot', new THREE.BufferAttribute(a, 3));
  return p;
}
const still = (g: THREE.BufferGeometry, hex: number, id: number = P.body) => jointed(g, hex, id, V3(0, 0, 0));

/** The shared bird plan at songbird size (front −z, feet at y 0): body, breast, head, beak, tail,
 *  two folding wings (P.wing about the shoulder) and two legs. Sandpipers, songbirds and — scaled —
 *  the hawk are parameters over it. */
/** A broad soaring wing along +x (or −x): widest at the root, a straight leading edge, the
 *  trailing edge sweeping in to fingered tips — a raptor's plank, not a songbird's leaf. */
function broadWing(chord: number, span: number, side: number) {
  const pos: number[] = [];
  const n = 5;
  const at = (t: number, e: -1 | 1): [number, number, number] => {
    const w = chord * (1 - 0.42 * t * t);
    return [side * span * t, 0.02 * span * t * t, e < 0 ? -w * 0.32 : w * 0.68 - (t > 0.8 ? (t - 0.8) * chord * 0.6 * Math.sin(t * 40) : 0)];
  };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const a = at(t0, -1), b = at(t0, 1), c = at(t1, 1), d = at(t1, -1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

interface BirdPlan { wing?: [number, number]; tail?: [number, number]; head?: [number, number]; tailC?: number; body?: [number, number, number]; band?: number; fingers?: number; crest?: number; curve?: number }
function birdGeometry(coat: number, belly: number, legC: number, beakC: number, legH: number, beakL = 0.022, o: BirdPlan = {}): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const by = legH + 0.045;
  const hooked = beakL < 0.02;
  const [bx, byy, bz] = o.body ?? [0.8, 0.75, 1.25];
  parts.push(still(blob(0.055, 30, { lump: 0.06 }).scale(bx, byy, bz).translate(0, by, 0), coat));
  parts.push(still(blob(0.04, 31, { detail: 0 }).scale(bx, byy * 0.93, bz * 0.88).translate(0, by - 0.02, -0.01), belly));
  if (o.band !== undefined) parts.push(still(blob(0.036, 33, { detail: 0 }).scale(bx * 1.05, 0.45, 0.6).translate(0, by - 0.022, 0.012), o.band)); // a dark belly band
  const neck = V3(0, by + 0.02, -0.05);
  const [hy, hz] = o.head ?? [0.045, -0.07];
  parts.push(jointed(blob(0.032, 32, { detail: 0, lump: 0.04 }).translate(0, by + hy, hz), coat, P.skull, neck));
  if (o.curve) {
    // a long bill curving down from its base (an ibis): hinge the cone at the face and bend it
    const bill = new THREE.ConeGeometry(0.007, beakL, 4).rotateX(-Math.PI / 2).translate(0, 0, -beakL / 2).rotateX(-o.curve);
    parts.push(jointed(bill.translate(0, by + hy - 0.005, hz - 0.025), beakC, P.skull, neck));
  } else {
    const beak = new THREE.ConeGeometry(0.008, beakL, 4).rotateX(-Math.PI / 2);
    if (hooked) beak.rotateX(0.5); // a raptor's short down-hooked bill
    parts.push(jointed(beak.translate(0, by + hy - 0.005 - (hooked ? 0.004 : 0), hz - 0.025 - beakL / 2), beakC, P.skull, neck));
  }
  // a crest / topknot, curling forward off the crown
  if (o.crest !== undefined) parts.push(jointed(new THREE.ConeGeometry(0.009, 0.035, 4).rotateX(-0.6).translate(0, by + hy + 0.045, hz - 0.004), o.crest, P.skull, neck));
  const [tw, tl] = o.tail ?? [0.05, 0.07];
  parts.push(still(card(tw, tl, -0.05, 1).translate(0, by + 0.01, 0.04), o.tailC ?? coat, P.tail));
  for (const s of [-1, 1]) {
    const sh = V3(s * 0.03, by + 0.02, -0.02);
    const wing = o.wing ? broadWing(o.wing[0], o.wing[1], s) : card(0.05, 0.085, 0.1, 2).rotateY(s * Math.PI / 2);
    parts.push(jointed(wing.translate(sh.x, sh.y, sh.z), coat, P.wing, sh));
    if (o.wing && o.fingers) {
      // the fingered primaries: separate slotted feathers fanning off the wing tip
      const [ch, sp] = o.wing;
      for (let f = 0; f < o.fingers; f++) {
        const a = (f / (o.fingers - 1) - 0.5) * 0.55;
        const fg = card(ch * 0.16, sp * 0.24, 0.05, 1).rotateY(s * (Math.PI / 2 - a)).translate(sh.x + s * sp * 0.93, sh.y + 0.02 * sp, sh.z + ch * (0.05 + f * 0.1));
        parts.push(jointed(fg, 0x3a2f28, P.wing, sh));
      }
    }
    parts.push(jointed(limb(V3(s * 0.012, by - 0.02, 0.005), V3(s * 0.012, 0, -0.005), 0.004, 0.003, 3), legC, P.fore, V3(s * 0.012, by - 0.02, 0)));
    parts.push(jointed(new THREE.SphereGeometry(0.006, 4, 3).translate(s * 0.02, by + hy + 0.01, hz - 0.015), 0x121010, P.skull, neck));
  }
  return merge(parts);
}

/** Build one animal (front toward −z, feet at y = 0). Colours: TINT-free — each species has its own coat. */
export function critterGeometry(kind: CritterKind): THREE.BufferGeometry {
  const B = BIRD[kind];
  if (B) return scaleGeo(birdGeometry(B.coat, B.belly, B.legC, B.beakC, B.legH, B.beakL, B.plan), B.k ?? 1);
  const parts: THREE.BufferGeometry[] = [];
  const Q = QUAD[kind];
  if (Q) {
    const base = Q.base, sq = base === 'squirrel', rb = base === 'rabbit', fx0 = base === 'fox', dr = base === 'deer';
    const S = sq ? 0.2 : rb ? 0.3 : fx0 ? 0.62 : 1.55; // body length
    const coat = Q.coat ?? (sq ? 0x8a8580 : rb ? 0x8f7a62 : fx0 ? 0xc4622d : 0x9a7654);
    const belly = Q.belly ?? (sq ? 0xe8e2d6 : rb ? 0xe2d8c8 : 0xe4dccc);
    const stock = Q.stock ?? 0x2e2420, tailTip = Q.tailTip ?? 0xf2eee6;
    const legH = sq ? 0.07 : rb ? 0.1 : fx0 ? 0.26 : 0.85;
    const bodyY = legH + S * (sq ? 0.2 : rb ? 0.22 : 0.18);
    const bs = dr ? [0.34, 0.42, 0.88] : fx0 ? [0.42, 0.46, 0.95] : [0.62, 0.62, 1];
    parts.push(still(blob(S * 0.5, 3, { lump: fx0 ? 0.04 : 0.08, squash: 1 }).scale(bs[0], bs[1], bs[2]).translate(0, bodyY, 0), coat));
    parts.push(still(blob(S * 0.3, 4, { lump: 0.05, detail: 0 }).scale(bs[0] * 1.2, 0.5, bs[2]).translate(0, bodyY - S * (dr ? 0.1 : 0.14), -S * 0.02), belly));
    // head on a neck (deer), or straight on the shoulders
    // a deer carries its neck forward (~25° off vertical), not straight up like a llama
    const neck = V3(0, bodyY + (dr ? 0.24 : S * 0.12), -S * 0.42);
    const hr = sq ? 0.055 : rb ? 0.075 : fx0 ? 0.1 : 0.2;
    const head = V3(0, neck.y + (dr ? 0.26 : fx0 ? 0.07 : 0.02), neck.z - (dr ? 0.32 : fx0 ? 0.09 : 0.04));
    if (fx0) {
      // the fox holds its head up on a short ruffed neck, white bib at the throat
      parts.push(jointed(limb(V3(0, bodyY + 0.02, -S * 0.36), head, 0.075, 0.06, 5), coat, P.skull, neck));
      parts.push(jointed(blob(0.06, 27, { detail: 0 }).scale(0.9, 1.1, 0.7).translate(0, bodyY + 0.02, -S * 0.46), 0xf2eee6, P.skull, neck));
    }
    if (dr) parts.push(jointed(limb(V3(0, bodyY + 0.1, -S * 0.38), head, 0.13, 0.09, 6), coat, P.skull, neck));
    parts.push(jointed(blob(hr, 5, { lump: 0.05, detail: 1 }).scale(0.85, 0.85, dr ? 1.5 : 1.15).translate(head.x, head.y, head.z), coat, P.skull, neck));
    parts.push(jointed(new THREE.SphereGeometry(hr * 0.35, 5, 4).translate(0, head.y - hr * (fx0 ? 0.25 : 0.15), head.z - hr * (dr ? 1.55 : fx0 ? 1.85 : 1.05)), 0x2a2622, P.skull, neck)); // nose
    for (const s of [-1, 1]) {
      // ears: rabbits long, squirrels tufted, deer broad
      const eh = (rb ? 0.14 : sq ? 0.035 : fx0 ? 0.1 : 0.16) * (Q.ear ?? 1), ew = (rb ? 0.03 : sq ? 0.018 : fx0 ? 0.045 : 0.07) * Math.sqrt(Q.ear ?? 1);
      const ear = new THREE.ConeGeometry(ew, eh, 5).rotateZ(-s * (rb ? 0.15 : fx0 ? 0.3 : 0.5)).translate(s * hr * 0.55, head.y + hr * 0.7 + eh / 2, head.z + hr * 0.2);
      parts.push(jointed(ear, Q.earC ?? (fx0 ? 0x3a2a22 : coat), P.skull, neck)); // a fox's ears are black-backed
      parts.push(jointed(new THREE.SphereGeometry(hr * 0.13, 4, 3).translate(s * hr * 0.55, head.y + hr * 0.25, head.z - hr * 0.6), 0x1a1614, P.skull, neck)); // eyes
      // legs: fore at the shoulder, hind at the hip
      const lr = sq ? 0.014 : rb ? 0.02 : fx0 ? 0.026 : 0.045;
      const fz = -S * 0.3, hz = S * 0.3;
      const fx = s * S * (dr ? 0.09 : 0.17), hx = s * S * (rb ? 0.2 : dr ? 0.1 : 0.18);
      if (dr) {
        // a muscled forearm down to the knee, then a slim cannon bone to the hoof
        const knee = V3(fx, legH * 0.52, fz - 0.02);
        parts.push(jointed(limb(V3(fx, bodyY, fz), knee, 0.085, 0.045, 5), coat, P.fore, V3(fx, bodyY, fz)));
        parts.push(jointed(limb(knee, V3(fx, 0, fz), 0.035, 0.026, 5), 0x7a5c40, P.fore, V3(fx, bodyY, fz)));
      } else if (fx0) {
        // russet to the elbow, then black stockings
        const elbow = V3(fx, legH * 0.55, fz);
        parts.push(jointed(limb(V3(fx, bodyY, fz), elbow, lr * 1.9, lr * 1.3, 4), coat, P.fore, V3(fx, bodyY, fz)));
        parts.push(jointed(limb(elbow, V3(fx, 0, fz - 0.015), lr * 1.2, lr, 4), stock, P.fore, V3(fx, bodyY, fz)));
      } else parts.push(jointed(limb(V3(fx, bodyY, fz), V3(fx, 0, fz - (sq ? 0.01 : 0)), lr * 1.3, lr, 5), coat, P.fore, V3(fx, bodyY, fz)));
      const hip = V3(hx, bodyY + (rb ? 0.02 : 0), hz);
      if (rb || sq) {
        // folded haunch: a thigh blob plus a long foot along the ground
        parts.push(jointed(blob(S * (rb ? 0.2 : 0.17), 9, { detail: 0, lump: 0.05 }).translate(hip.x, hip.y - S * 0.08, hip.z), coat, P.hind, hip));
        parts.push(jointed(card(lr * 3, S * 0.36, 0, 1).rotateY(Math.PI).translate(hip.x, 0.012, hip.z + S * 0.12), coat, P.hind, hip));
      } else if (fx0) {
        const hock = V3(hx, legH * 0.45, hz + 0.05);
        parts.push(jointed(limb(hip, hock, lr * 2.6, lr * 1.3, 4), coat, P.hind, hip)); // a full haunch
        parts.push(jointed(limb(hock, V3(hx, 0, hz + 0.02), lr * 1.2, lr, 4), stock, P.hind, hip));
      }
      else {
        // a deep haunch to the hock (set back), then the slim lower leg
        const hock = V3(hx, legH * 0.5, hz + 0.12);
        parts.push(jointed(limb(hip, hock, 0.11, 0.045, 5), coat, P.hind, hip));
        parts.push(jointed(limb(hock, V3(hx, 0, hz + 0.05), 0.035, 0.026, 5), 0x7a5c40, P.hind, hip));
      }
    }
    // tails: squirrel = a tall bushy S of blobs, rabbit = a cotton puff, deer = a white flag
    const tb = V3(0, bodyY + S * 0.05, S * 0.48);
    if (sq) {
      // one continuous bushy plume rising from the rump and curling forward over the back:
      // seven overlapping puffs along an S (each overlaps the next by half), no gaps
      const pts = [V3(0, 0.0, 0.01), V3(0, 0.05, 0.05), V3(0, 0.11, 0.06), V3(0, 0.16, 0.035), V3(0, 0.19, -0.01)];
      const pl = Q.plume ?? 1;
      pts.forEach((q, i) => parts.push(jointed(blob((0.058 - i * 0.003) * pl, 20 + i, { detail: 0, lump: 0.1 }).scale(0.75, 0.9, 1.05).translate(tb.x + q.x, tb.y + q.y, tb.z + q.z), Q.coat !== undefined ? coat : 0x9a948c, P.tail, tb)));
    } else if (rb) parts.push(jointed(blob(0.045, 21, { detail: 0 }).translate(tb.x, tb.y + 0.02, tb.z + 0.02), 0xf2eee6, P.tail, tb));
    else if (kind === ('dog' as CritterKind)) {
      // a dog out for a walk carries its tail: up off the rump and curving back, tapering to the
      // tip (dogMaterial wags it side to side about the root — it never drops to the ground)
      const pts = DOG_TAIL.map(([y, z]) => V3(tb.x, tb.y + y, tb.z + z));
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], d = new THREE.Vector3().subVectors(b, a), L = d.length();
        const g = new THREE.CylinderGeometry(0.033 * taper(i / 4, 0.45) * 0.86, 0.033 * taper(i / 4, 0.45), L * 1.08, 5, 1, true).translate(0, L / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
        parts.push(jointed(g.translate(a.x, a.y, a.z), coat, P.tail, tb));
      }
      const tip = pts[pts.length - 1];
      parts.push(jointed(new THREE.SphereGeometry(0.013, 5, 3).translate(tip.x, tip.y, tip.z), coat, P.tail, tb));
    } else if (fx0) {
      // the brush: long, low and full, with a white tip
      // (carried low: drooping ~20° from the rump, swaying with the trot via the tail joint)
      [V3(0, -0.04, 0.1), V3(0, -0.1, 0.21), V3(0, -0.15, 0.31)].forEach((q, i) => parts.push(jointed(blob(0.075 - i * 0.008, 23 + i, { detail: 0, lump: 0.12 }).scale(0.8, 0.8, 1.3).rotateX(0.35).translate(tb.x + q.x, tb.y + q.y, tb.z + q.z), coat, P.tail, tb)));
      parts.push(jointed(blob(0.05, 26, { detail: 0 }).translate(tb.x, tb.y - 0.19, tb.z + 0.39), tailTip, P.tail, tb));
    }
    else parts.push(jointed(card(0.12, 0.22, -0.3, 2).rotateX(-2.3).translate(tb.x, tb.y, tb.z), 0xf2eee6, P.tail, tb));
    if (dr) parts.push(jointed(blob(0.1, 22, { detail: 0 }).scale(1, 0.6, 1.2).translate(0, bodyY + 0.02, S * 0.46), 0xf2eee6, P.tail, tb)); // rump patch
    if (fx0) {
      parts.push(jointed(new THREE.ConeGeometry(hr * 0.5, hr * 1.2, 6).rotateX(-Math.PI / 2).translate(0, head.y - hr * 0.2, head.z - hr * 1.25), coat, P.skull, neck)); // the fox's long snout
      parts.push(jointed(new THREE.ConeGeometry(hr * 0.36, hr * 1.0, 5).rotateX(-Math.PI / 2).translate(0, head.y - hr * 0.42, head.z - hr * 1.1), 0xf2eee6, P.skull, neck)); // white muzzle below
    }
  } else if (kind === 'butterfly') {
    parts.push(still(new THREE.CylinderGeometry(0.004, 0.003, 0.035, 4).rotateX(Math.PI / 2), 0x2a2622));
    for (const s of [-1, 1]) {
      const root = V3(0, 0, 0);
      parts.push(jointed(card(0.05, 0.045, 0, 1).rotateY(s * Math.PI / 2).translate(0, 0, -0.008), 0xffffff, P.wing, root));
      parts.push(jointed(card(0.035, 0.03, 0, 1).rotateY(s * Math.PI / 2 + s * 0.6).translate(0, 0, 0.01), 0xffffff, P.wing, root));
    }
  } else if (kind === 'firefly') {
    parts.push(still(new THREE.SphereGeometry(0.012, 5, 4).scale(0.8, 0.7, 1.3), 0x2a2622));
    parts.push(jointed(new THREE.SphereGeometry(0.018, 6, 5).translate(0, 0, 0.012), 0xfff2a0, P.head, V3(0, 0, 0)));
  }
  return scaleGeo(merge(parts), Q?.k ?? 1);
}
export const critterLib = (k: CritterKind) => cached(`critter:${k}`, () => critterGeometry(k));

// A dog on a lead (life.ts walks it beside its walker): the fox plan a little bigger and
// stockier, the coat all tintable (white) so the instance colour makes the breed's coat —
// golden, black, chocolate, grey, cream — with dark eyes and nose. Animated by the fox's gait.
QUAD['dog' as CritterKind] = { base: 'fox', k: 1.18, coat: 0xffffff, belly: 0xffffff, stock: 0xffffff, tailTip: 0xffffff, ear: 0.85, earC: 0xffffff };
export const DOG_COATS = [0xd9a860, 0x2a2624, 0x6b4a32, 0xe8dcc4, 0x8a8680, 0xb07040, 0xf2ece0, 0x3a2e28];
export const dogLib = () => cached('critter:dog', () => critterGeometry('dog' as CritterKind));
/** Where the lead clips to the dog's collar (the dog's own frame, before its size: life.ts). */
export const DOG_COLLAR: readonly [number, number, number] = [0, 0.56, -0.33];
/** The dogs' material: the fox's trot, and the tail carried and wagged side to side. */
export function dogMaterial() {
  const m = critterMaterial('fox');
  m.uniforms.uGait.value.set(Math.PI, 0, 0, 0.2);
  m.uniforms.uLimb.value = 0.62;
  m.uniforms.uWag.value.set(0.42, 8.5);
  return m;
}

// Per-species animation constants: x hind-leg phase offset (bound 0.5π, walk π), y tail swing,
// z wing flap, w head bob.
// Limb swing amplitude (radians at full gait) per species.
export const LIMB: Record<CritterKind, number> = { squirrel: 0.9, rabbit: 0.85, songbird: 0.4, sandpiper: 0.55, deer: 0.38, butterfly: 0, firefly: 0, fox: 0.7, hawk: 0.3, coyote: 0.65, jackrabbit: 0.9, snowshoe: 0.85, groundSquirrel: 0.9, muleDeer: 0.38, roadrunner: 0.75, quail: 0.5, ibis: 0.45 };
export const GAIT: Record<CritterKind, [number, number, number, number]> = {
  squirrel: [0.5, 0.5, 0, 0.25], rabbit: [0.3, 0.2, 0, 0.2], songbird: [0, 0.3, 1.2, 0.5], sandpiper: [3.14, 0.2, 1.1, 0.35],
  deer: [3.14, 0.4, 0, 0.12], butterfly: [0, 0, 1.3, 0], firefly: [0, 0, 0, 0], fox: [3.14, 0.45, 0, 0.2], hawk: [0, 0.2, 0.55, 0.3],
  coyote: [3.14, 0.35, 0, 0.2], jackrabbit: [0.3, 0.2, 0, 0.2], snowshoe: [0.3, 0.2, 0, 0.2], groundSquirrel: [0.5, 0.3, 0, 0.3], muleDeer: [3.14, 0.4, 0, 0.12],
  roadrunner: [3.14, 0.5, 1.1, 0.3], quail: [3.14, 0.2, 1.3, 0.5], ibis: [3.14, 0.2, 1.0, 0.4],
};

/** Painted material for critters: vertex-animated joints driven by the instanced aAnim (phase, amount, pose). */
export function critterMaterial(kind: CritterKind) {
  const g = GAIT[kind];
  return paintMaterial({
    uniforms: { uGait: { value: new THREE.Vector4(...g) }, uLimb: { value: LIMB[kind] }, uFlap: { value: new THREE.Vector2(kind === 'hawk' ? 6.5 : 38, kind === 'hawk' ? 1 : 0) }, uWag: { value: new THREE.Vector2(0, 0) } },
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aPart;
      attribute vec3 aPivot;
      attribute vec3 aAnim; // x gait phase (cycles), y gait amount 0..1, z pose (0 idle, 1 moving, 2 flying/climbing, 3 glowing)
      uniform vec4 uGait;
      uniform float uLimb;
      uniform vec2 uFlap; // x flap rate, y 1 = a soaring bird (wings held out, flap by amount, folded in a stoop)
      uniform vec2 uWag; // x > 0: the tail wags side to side (a dog) by this much, y times a second
      varying vec3 vColor;
      varying float vGlow;
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      void main() {
        vec3 p = position;
        float ph = aAnim.x * 6.2831853, amt = aAnim.y;
        float idle = 1.0 - clamp(amt * 3.0, 0.0, 1.0);
        vec3 q = p - aPivot;
        if (aPart > 0.5 && aPart < 1.5) q = rotX(sin(ph) * uLimb * amt) * q;                       // fore limbs
        else if (aPart > 1.5 && aPart < 2.5) q = rotX(sin(ph + uGait.x) * uLimb * amt) * q;        // hind limbs
        else if (aPart > 4.5 && aPart < 5.5) {                                                    // tail
          if (uWag.x > 0.0) q = rotY(sin(uTime * uWag.y + float(gl_InstanceID) * 2.1) * uWag.x * (0.55 + 0.45 * amt)) * q;
          else q = rotX(sin(ph * 0.5) * uGait.y * (0.3 + amt) + sin(uTime * 3.1 + aAnim.x * 9.0) * 0.12 * idle) * q;
        }
        else if (aPart > 5.5 && aPart < 6.5) q = rotX((0.5 + 0.5 * sin(uTime * 2.3 + aAnim.x * 17.0)) * uGait.w * idle * step(0.5, fract(uTime * 0.21 + aAnim.x * 3.7)) + sin(ph) * 0.06 * amt) * q; // head: grazing / pecking bobs
        else if (aPart > 6.5 && aPart < 7.5) {                                                  // wings
          // flying: a fast flap; perched: folded down along the body (butterflies rest wings-up)
          float flap = aAnim.z > 1.5 ? sin(uTime * uFlap.x + aAnim.x * 20.0) * uGait.z : (uGait.z > 1.25 ? 1.2 : -1.25 + sin(uTime * 2.0 + aAnim.x * 11.0) * 0.05);
          if (uFlap.y > 0.5) flap = amt < 0.0 ? -0.85 : 0.14 + sin(uTime * uFlap.x + aAnim.x * 20.0) * uGait.z * amt; // soar with a shallow dihedral; stoop folded
          q = rotZ(sign(q.x + 1e-4) * flap) * q;
        }
        p = q + aPivot;
        vGlow = aPart > 2.5 && aPart < 3.5 ? step(2.5, aAnim.z) * smoothstep(0.2, 1.0, sin(uTime * 2.2 + aAnim.x * 31.0)) : 0.0;
        mat4 m = worldMat();
        vec4 wp = m * vec4(p, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * normal);
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          float tintable = step(0.98, min(color.r, min(color.g, color.b)));
          vColor = mix(color, instanceColor, tintable);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 alb = pigment(vColor, vWorldPos);
        vec3 col = paintLight(alb, N, vWorldPos, shadowAt(vWorldPos, N), 1.0);
        col += vec3(1.0, 0.92, 0.45) * vGlow * 3.0;
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}
