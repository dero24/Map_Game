// Wildlife around the walker: squirrels at the foot of trees (they bolt up the trunk when you
// come close), rabbits on lawns at dawn and dusk, songbirds hopping on grass by day, sandpipers
// running the surf line, deer at the wood's edge, butterflies over gardens in the warm months and
// fireflies on summer nights, a red fox working the lawns at dusk and a red-tailed hawk circling
// by day. They live as one small ecosystem: the fox stalks and pounces, the hawk stoops on what's
// in the open, prey flee whatever threatens them — the walker, a fox, a stooping hawk or a moving
// car — and an alarm spreads through a flock or warren. Habitat comes from the world itself (trees, land cover, the ocean
// edge, gardens) so every region grows its own — no per-town lists. A light main-thread sim: a
// few dozen animals within ~90 m, one instanced draw per species (fauna.ts).
//
// Behaviour belongs to a *role* (climber, burrower, grazer, songbird, shorebird, browser,
// predator, raptor, butterfly, firefly); which species fills each role comes from the place
// (fauna.ts faunaMix: climate → cast), so a desert walk meets jackrabbits, quail, a roadrunner
// and a coyote with no new behaviour code.
import * as THREE from 'three';
import type { Terrain } from '../world/data';
import type { WalkWorld } from '../player/collision';
import { CRITTERS, ROLE, ROLES, critterLib, critterMaterial, faunaMix, swimSink, sitPivot, monarchRoost, monarchMigrating, rippleGeometry, spoutGeometry, WHALES, BODY_DEPTH, presenceOdds, type CritterKind, type CritterRole } from '../assets/fauna';
import { prairieTown, baskingLogs } from '../assets/signs';
import { hashf } from '../assets/core';

// Small animals are drawn a little larger than life (×1.3–2): at painting scale a true-size
// squirrel dissolves into the grass wash — the same licence an illustrator takes.
interface Spec { cap: number; walk: number; flee: number; fleeR: number; gaitHz: number; scale: [number, number]; colors: number[] }
const SPEC: Record<CritterKind, Spec> = {
  squirrel: { cap: 8, walk: 1.6, flee: 5.5, fleeR: 7, gaitHz: 1.6, scale: [1.3, 1.5], colors: [0xffffff] },
  rabbit: { cap: 6, walk: 1.1, flee: 7, fleeR: 9, gaitHz: 1.3, scale: [1.15, 1.35], colors: [0xffffff] },
  songbird: { cap: 10, walk: 0.7, flee: 6, fleeR: 5, gaitHz: 3, scale: [1.4, 1.7], colors: [0xb04a4c, 0x4f7cc0, 0x8a6a4e, 0x7a6a5a, 0x6a7a48, 0xd4b232, 0x8a6a4e] }, // (sparrows, finches: a house finch's rose, a bluebird, a goldfinch)
  sandpiper: { cap: 12, walk: 1.4, flee: 3.5, fleeR: 8, gaitHz: 4.5, scale: [1.25, 1.45], colors: [0xffffff] },
  deer: { cap: 3, walk: 1.0, flee: 8, fleeR: 26, gaitHz: 0.9, scale: [0.85, 1.05], colors: [0xffffff] },
  butterfly: { cap: 10, walk: 0.9, flee: 0.9, fleeR: 0, gaitHz: 0, scale: [1.5, 2.1], colors: [0xe8862a, 0xf2d24a, 0x7aa6e0, 0xf6f2e8, 0xd86a9a] },
  firefly: { cap: 30, walk: 0.4, flee: 0.4, fleeR: 0, gaitHz: 0, scale: [0.9, 1.1], colors: [0xffffff] },
  fox: { cap: 2, walk: 1.3, flee: 7.5, fleeR: 16, gaitHz: 1.5, scale: [1.0, 1.15], colors: [0xffffff] },
  hawk: { cap: 1, walk: 9, flee: 18, fleeR: 0, gaitHz: 0.4, scale: [1.1, 1.25], colors: [0xffffff] },
  coyote: { cap: 2, walk: 1.4, flee: 8, fleeR: 22, gaitHz: 1.3, scale: [1.0, 1.1], colors: [0xffffff] },
  jackrabbit: { cap: 6, walk: 1.2, flee: 9, fleeR: 12, gaitHz: 1.2, scale: [1.1, 1.25], colors: [0xffffff] },
  snowshoe: { cap: 6, walk: 1.0, flee: 7.5, fleeR: 9, gaitHz: 1.3, scale: [1.1, 1.3], colors: [0x8a6e52] }, // (winter white is set at spawn)
  groundSquirrel: { cap: 8, walk: 1.4, flee: 5, fleeR: 7, gaitHz: 1.8, scale: [1.3, 1.5], colors: [0xffffff] },
  muleDeer: { cap: 3, walk: 1.0, flee: 8, fleeR: 28, gaitHz: 0.9, scale: [0.85, 1.05], colors: [0xffffff] },
  roadrunner: { cap: 2, walk: 1.8, flee: 6.5, fleeR: 9, gaitHz: 3.2, scale: [1.35, 1.5], colors: [0xffffff] },
  quail: { cap: 12, walk: 0.7, flee: 5, fleeR: 6, gaitHz: 3.5, scale: [1.6, 1.8], colors: [0xffffff] },
  ibis: { cap: 6, walk: 0.8, flee: 3.5, fleeR: 10, gaitHz: 2, scale: [1.1, 1.25], colors: [0xffffff] },
  // the backyard birds (fauna.ts package #11): the cardinal's pair (two males to a female's tan, the
  // one people notice), the robin running and stopping across the lawn, the crow wary from farther
  // off, the pigeons tame and many, each its own grey
  cardinal: { cap: 4, walk: 0.6, flee: 6, fleeR: 6, gaitHz: 3, scale: [1.35, 1.55], colors: [0xc4302a, 0xc4302a, 0xb0947a] },
  bluejay: { cap: 4, walk: 0.8, flee: 6.5, fleeR: 7, gaitHz: 2.8, scale: [1.3, 1.5], colors: [0xffffff] },
  robin: { cap: 8, walk: 1.5, flee: 6, fleeR: 6, gaitHz: 5, scale: [1.3, 1.5], colors: [0xffffff] },
  stellersjay: { cap: 4, walk: 0.8, flee: 6.5, fleeR: 7, gaitHz: 2.8, scale: [1.25, 1.45], colors: [0xffffff] },
  gilawoodpecker: { cap: 3, walk: 0.5, flee: 6, fleeR: 6, gaitHz: 3, scale: [1.35, 1.5], colors: [0xc8302a, 0xc8302a, 0xbca88a] },
  mourningdove: { cap: 6, walk: 0.55, flee: 7, fleeR: 7, gaitHz: 2.6, scale: [1.25, 1.45], colors: [0xffffff] },
  crow: { cap: 4, walk: 0.9, flee: 7, fleeR: 13, gaitHz: 1.8, scale: [1.1, 1.25], colors: [0xffffff] },
  pigeon: { cap: 12, walk: 0.6, flee: 5.5, fleeR: 4, gaitHz: 2.6, scale: [1.15, 1.3], colors: [0x9098a4, 0x9098a4, 0x8a929e, 0x6a6e78, 0xb4b0aa] },
  // the water and big birds (fauna.ts package #12): geese and ducks paddling (walk: their paddling
  // speed), the heron's patient creep, the gulls' strut; the soarers' `walk` their airspeed
  canadagoose: { cap: 10, walk: 0.6, flee: 2.5, fleeR: 9, gaitHz: 2, scale: [1.05, 1.15], colors: [0xffffff] },
  mallard: { cap: 6, walk: 0.5, flee: 2.5, fleeR: 7, gaitHz: 2.6, scale: [1.15, 1.3], colors: [0xffffff] },
  mallardhen: { cap: 6, walk: 0.5, flee: 2.5, fleeR: 7, gaitHz: 2.6, scale: [1.15, 1.3], colors: [0xffffff] },
  loon: { cap: 2, walk: 0.4, flee: 2, fleeR: 20, gaitHz: 1.4, scale: [1.05, 1.15], colors: [0x1e2224] }, // (winter grey set at spawn)
  greatblueheron: { cap: 2, walk: 0.3, flee: 2, fleeR: 22, gaitHz: 0.9, scale: [1.0, 1.1], colors: [0xffffff] },
  greategret: { cap: 3, walk: 0.35, flee: 2, fleeR: 18, gaitHz: 1, scale: [1.0, 1.1], colors: [0xffffff] },
  snowyegret: { cap: 4, walk: 0.7, flee: 2.5, fleeR: 14, gaitHz: 2, scale: [1.05, 1.15], colors: [0xffffff] },
  spoonbill: { cap: 5, walk: 0.4, flee: 2, fleeR: 16, gaitHz: 1.2, scale: [1.0, 1.1], colors: [0xffffff] },
  sandhillcrane: { cap: 6, walk: 0.5, flee: 2.5, fleeR: 25, gaitHz: 0.9, scale: [1.0, 1.1], colors: [0xffffff] },
  turkeyvulture: { cap: 5, walk: 7, flee: 14, fleeR: 0, gaitHz: 0.3, scale: [1.0, 1.1], colors: [0xffffff] },
  baldeagle: { cap: 1, walk: 8, flee: 20, fleeR: 0, gaitHz: 0.3, scale: [1.0, 1.1], colors: [0xffffff] },
  osprey: { cap: 2, walk: 8, flee: 18, fleeR: 0, gaitHz: 0.4, scale: [1.0, 1.1], colors: [0xffffff] },
  wildturkey: { cap: 8, walk: 0.7, flee: 4.5, fleeR: 20, gaitHz: 1.6, scale: [0.95, 1.1], colors: [0xffffff] },
  californiaquail: { cap: 14, walk: 0.8, flee: 5.5, fleeR: 7, gaitHz: 3.8, scale: [1.6, 1.8], colors: [0xffffff] },
  brownpelican: { cap: 4, walk: 9, flee: 2, fleeR: 14, gaitHz: 1, scale: [1.0, 1.1], colors: [0xffffff] },
  laughinggull: { cap: 12, walk: 0.9, flee: 3, fleeR: 6, gaitHz: 3, scale: [1.15, 1.3], colors: [0x1e1e22] }, // (the winter's white hood set at spawn)
  californiagull: { cap: 12, walk: 0.9, flee: 3, fleeR: 6, gaitHz: 3, scale: [1.1, 1.25], colors: [0xffffff] },
  ringbilledgull: { cap: 14, walk: 0.9, flee: 3, fleeR: 5, gaitHz: 3, scale: [1.1, 1.25], colors: [0xffffff] }, // (the boldest: a parking lot's)
  herringgull: { cap: 8, walk: 0.85, flee: 3, fleeR: 7, gaitHz: 2.8, scale: [1.05, 1.15], colors: [0xffffff] },
  // the West's lizards (fauna.ts, the sprawler plan), drawn larger than life like the anoles: quick off the
  // mark, a dash to cover; the horned lizard sits tight; a collared lizard's colours set at spawn (a male's
  // turquoise, a female's tan)
  fencelizard: { cap: 6, walk: 0.4, flee: 3, fleeR: 4, gaitHz: 5, scale: [1.6, 1.9], colors: [0x7a7468, 0x6a6458, 0x8a8070, 0x5e5a50] },
  sideblotched: { cap: 6, walk: 0.4, flee: 3, fleeR: 3.5, gaitHz: 5, scale: [1.8, 2.1], colors: [0x8a7a62, 0x7a6e5a, 0x9a8a6e] },
  spinylizard: { cap: 4, walk: 0.35, flee: 3, fleeR: 5, gaitHz: 4, scale: [1.4, 1.6], colors: [0x8a7a5a, 0x9a8a62, 0x7a6e50] },
  collaredlizard: { cap: 3, walk: 0.4, flee: 3.5, fleeR: 6, gaitHz: 4.5, scale: [1.25, 1.4], colors: [0xffffff] },
  hornedlizard: { cap: 2, walk: 0.12, flee: 0.4, fleeR: 1.5, gaitHz: 3, scale: [2.0, 2.3], colors: [0xb09a78, 0x9a8466, 0xa89070] },
  // the water's life: a few fish at a time and only near the walker (seen when they rise, roll or leap);
  // the seals shy on land, the sea lions bold; the dolphins' `walk` their cruising speed; a whale or two
  rainbowtrout: { cap: 3, walk: 0.5, flee: 0.5, fleeR: 0, gaitHz: 2, scale: [1.2, 1.4], colors: [0xffffff] },
  largemouthbass: { cap: 3, walk: 0.4, flee: 0.4, fleeR: 0, gaitHz: 2, scale: [1.1, 1.3], colors: [0xffffff] },
  mullet: { cap: 4, walk: 0.7, flee: 0.7, fleeR: 0, gaitHz: 2, scale: [1.2, 1.4], colors: [0xffffff] },
  salmon: { cap: 3, walk: 0.4, flee: 0.4, fleeR: 0, gaitHz: 1.5, scale: [1.0, 1.15], colors: [0xffffff] },
  tarpon: { cap: 2, walk: 0.5, flee: 0.5, fleeR: 0, gaitHz: 1, scale: [0.9, 1.1], colors: [0xffffff] },
  silvercarp: { cap: 5, walk: 0.5, flee: 0.5, fleeR: 0, gaitHz: 2, scale: [1.0, 1.2], colors: [0xffffff] },
  shoal: { cap: 3, walk: 0.35, flee: 0.35, fleeR: 0, gaitHz: 3, scale: [1.0, 1.4], colors: [0xffffff] },
  harborseal: { cap: 8, walk: 0.5, flee: 1.5, fleeR: 22, gaitHz: 1, scale: [0.95, 1.05], colors: [0x8a8a84, 0x9a968c, 0x6a6258, 0xa8a49a] },
  grayseal: { cap: 6, walk: 0.5, flee: 1.5, fleeR: 18, gaitHz: 0.9, scale: [0.95, 1.05], colors: [0x7a7a74, 0x8a8682, 0x5a5856] },
  sealion: { cap: 8, walk: 0.7, flee: 2, fleeR: 8, gaitHz: 1.2, scale: [0.9, 1.05], colors: [0x5a4630, 0x6a5238, 0x8a6a48] },
  seaotter: { cap: 4, walk: 0.25, flee: 1, fleeR: 12, gaitHz: 1, scale: [1.0, 1.1], colors: [0xffffff] },
  riverotter: { cap: 3, walk: 0.8, flee: 2.5, fleeR: 15, gaitHz: 1.6, scale: [1.0, 1.1], colors: [0xffffff] },
  dolphin: { cap: 6, walk: 3, flee: 3, fleeR: 0, gaitHz: 1.4, scale: [0.9, 1.1], colors: [0xffffff] },
  porpoise: { cap: 4, walk: 2, flee: 2, fleeR: 0, gaitHz: 1.6, scale: [0.9, 1.1], colors: [0xffffff] },
  orca: { cap: 4, walk: 2.5, flee: 2.5, fleeR: 0, gaitHz: 0.9, scale: [0.9, 1.1], colors: [0xffffff] },
  humpback: { cap: 1, walk: 1.2, flee: 1.2, fleeR: 0, gaitHz: 0.4, scale: [0.9, 1.1], colors: [0xffffff] },
  graywhale: { cap: 2, walk: 1.0, flee: 1.0, fleeR: 0, gaitHz: 0.4, scale: [0.9, 1.1], colors: [0xffffff] },
  // the mammals (fauna.ts package #13): the night's waddlers, the squirrels, the burrowers (a prairie dog
  // town's many), the beaver, the herds wary from far off (a pronghorn from 70 m, and the fastest)
  raccoon: { cap: 3, walk: 0.7, flee: 3.5, fleeR: 10, gaitHz: 1.6, scale: [1.0, 1.1], colors: [0xffffff] },
  opossum: { cap: 2, walk: 0.5, flee: 2.5, fleeR: 8, gaitHz: 1.4, scale: [1.0, 1.1], colors: [0xffffff] },
  skunk: { cap: 2, walk: 0.5, flee: 2.5, fleeR: 9, gaitHz: 1.6, scale: [1.0, 1.15], colors: [0xffffff] },
  foxsquirrel: { cap: 6, walk: 1.3, flee: 5, fleeR: 7, gaitHz: 1.4, scale: [1.15, 1.3], colors: [0xffffff] },
  chipmunk: { cap: 6, walk: 1.6, flee: 6, fleeR: 6, gaitHz: 2.2, scale: [1.4, 1.6], colors: [0xffffff] },
  woodchuck: { cap: 3, walk: 0.6, flee: 3.5, fleeR: 12, gaitHz: 1.4, scale: [1.0, 1.1], colors: [0xffffff] },
  beaver: { cap: 2, walk: 0.5, flee: 2, fleeR: 14, gaitHz: 1.2, scale: [1.0, 1.1], colors: [0xffffff] },
  prairiedog: { cap: 20, walk: 0.9, flee: 5, fleeR: 14, gaitHz: 2, scale: [1.2, 1.35], colors: [0xffffff] },
  elk: { cap: 10, walk: 1.0, flee: 9, fleeR: 45, gaitHz: 0.8, scale: [0.95, 1.05], colors: [0xffffff] },
  moose: { cap: 2, walk: 0.9, flee: 6, fleeR: 30, gaitHz: 0.7, scale: [0.95, 1.05], colors: [0xffffff] },
  pronghorn: { cap: 10, walk: 1.2, flee: 16, fleeR: 70, gaitHz: 1.1, scale: [0.95, 1.05], colors: [0xffffff] },
  bighorn: { cap: 8, walk: 0.7, flee: 5, fleeR: 30, gaitHz: 1, scale: [0.95, 1.05], colors: [0xffffff] },
  // the new plans (fauna.ts package #14): the bear's coat painted at spawn (black in the East; black,
  // cinnamon, brown or blond in the West), its cubs a sow's; the bison slow and many; the manatee
  // heedless of you
  blackbear: { cap: 4, walk: 0.9, flee: 8, fleeR: 28, gaitHz: 0.9, scale: [0.95, 1.1], colors: [0x1e1a18] },
  bison: { cap: 14, walk: 0.7, flee: 7, fleeR: 35, gaitHz: 0.7, scale: [0.95, 1.05], colors: [0xffffff] },
  armadillo: { cap: 3, walk: 0.6, flee: 3, fleeR: 6, gaitHz: 2.6, scale: [1.1, 1.25], colors: [0xffffff] },
  manatee: { cap: 4, walk: 0.35, flee: 0.5, fleeR: 0, gaitHz: 0.4, scale: [0.9, 1.1], colors: [0xffffff] },
  // the reptiles (fauna.ts package #15): the alligator wary from 12 m, the anoles drawn larger than life
  // (they're a hand long), the turtles off their log at 10 m
  alligator: { cap: 3, walk: 0.4, flee: 3.5, fleeR: 12, gaitHz: 0.8, scale: [0.9, 1.15], colors: [0xffffff] },
  greenanole: { cap: 6, walk: 0.5, flee: 3, fleeR: 3, gaitHz: 4, scale: [1.6, 1.9], colors: [0x5aa040] }, // (brown when it's cool: set at spawn)
  brownanole: { cap: 6, walk: 0.5, flee: 3, fleeR: 3, gaitHz: 4, scale: [1.6, 1.9], colors: [0xffffff] },
  paintedturtle: { cap: 8, walk: 0.2, flee: 1, fleeR: 10, gaitHz: 1.2, scale: [1.3, 1.5], colors: [0xffffff] },
  redslider: { cap: 8, walk: 0.2, flee: 1, fleeR: 10, gaitHz: 1.2, scale: [1.3, 1.5], colors: [0xffffff] },
  yellowslider: { cap: 8, walk: 0.2, flee: 1, fleeR: 10, gaitHz: 1.2, scale: [1.3, 1.5], colors: [0xffffff] },
  // the small life (fauna.ts package #16), drawn larger than life: the monarchs many in a winter roost; the
  // darner's `walk` its dart, a male's blue or a female's brown; the cicada off its bark at 2.5 m; the
  // banana slug's glide, yellow to olive; the fiddlers by the score, down their burrows from 5 m; the
  // crawfish standing its ground
  monarch: { cap: 24, walk: 1.1, flee: 1.1, fleeR: 0, gaitHz: 0, scale: [1.5, 1.8], colors: [0xffffff] },
  greendarner: { cap: 4, walk: 6, flee: 6, fleeR: 0, gaitHz: 0, scale: [1.7, 2.0], colors: [0x3a7ad0, 0x3a7ad0, 0x8a5a48] },
  annualcicada: { cap: 4, walk: 0, flee: 5, fleeR: 2.5, gaitHz: 0, scale: [1.8, 2.1], colors: [0xffffff] },
  cicadashell: { cap: 4, walk: 0, flee: 0, fleeR: 0, gaitHz: 0, scale: [1.8, 2.1], colors: [0xffffff] },
  bananaslug: { cap: 4, walk: 0.025, flee: 0.025, fleeR: 0, gaitHz: 0, scale: [1.2, 1.4], colors: [0xd8c030, 0xe0c838, 0xc8b030, 0xb8a838, 0x8a8a3a] },
  fiddlercrab: { cap: 30, walk: 0.25, flee: 1.6, fleeR: 5, gaitHz: 6, scale: [2.3, 2.7], colors: [0x4a4034, 0x5a5048, 0x3e3c38, 0x6a5a48] },
  crawfish: { cap: 6, walk: 0.12, flee: 0.4, fleeR: 3, gaitHz: 3, scale: [1.4, 1.6], colors: [0xffffff] },
};
/** How often a fish leaps when it comes up (else it rises: a ring), and how high (m, at its own size): the
 *  mullet again and again, the salmon at its run, the silver carp at anything coming near; the bass and
 *  the trout mostly rise; the tarpon rolls. */
const LEAP: Partial<Record<CritterKind, [number, number]>> = { mullet: [0.85, 0.8], salmon: [0.6, 1.0], silvercarp: [0.5, 1.4], largemouthbass: [0.25, 0.6], rainbowtrout: [0.15, 0.5], tarpon: [0.1, 1.6] };
/** The monarchs' way south in the fall (a unit heading, south a little west: toward Mexico, the West's
 *  toward the coast). */
const MIG = [-0.35, 0.937] as const;
const ANOLES = new Set<CritterKind>(['greenanole', 'brownanole']);
/** The lizards up the trunks: the anoles, and a spiny lizard as often as not (it spirals round to the far side). */
const TRUNKERS = new Set<CritterKind>(['greenanole', 'brownanole', 'spinylizard']);
const TURTLES = new Set<CritterKind>(['paintedturtle', 'redslider', 'yellowslider']);
/** A western black bear's colours (the East's all black). */
const WEST_BEAR = [0x1e1a18, 0x1e1a18, 0x7a4a2a, 0x5a3a24, 0xb08a5a];
/** Who wears antlers or horns, and when: the share of the herd that are bulls, bucks or rams, and the
 *  months they carry them (antlers grow in summer and drop in winter; horns stay). */
const RACK: Partial<Record<CritterKind, { male: number; months: number[] | null }>> = {
  deer: { male: 0.35, months: [9, 10, 11, 12, 1] }, muleDeer: { male: 0.35, months: [9, 10, 11, 12, 1] },
  elk: { male: 0.3, months: [8, 9, 10, 11, 12, 1, 2, 3] }, moose: { male: 0.5, months: [8, 9, 10, 11, 12] },
  pronghorn: { male: 0.45, months: null }, bighorn: { male: 0.4, months: null }, bison: { male: 1, months: null },
  // (and the claws: a male fiddler's one great claw; a crawfish's pair)
  fiddlercrab: { male: 0.5, months: null }, crawfish: { male: 1, months: null },
  // (a male fence lizard's and spiny lizard's blue patches; a collared lizard's colours)
  fencelizard: { male: 0.5, months: null }, spinylizard: { male: 0.5, months: null }, collaredlizard: { male: 0.5, months: null },
  // (and a beaver with a peeled stick in its teeth: a third of them, on their way to the lodge)
  beaver: { male: 0.33, months: null },
};
/** The burrowers that sit bolt upright by their holes (a prairie dog town's sentries, a woodchuck). */
const SITTERS = new Set<CritterKind>(['prairiedog', 'woodchuck', 'blackbear']);
/** The roles that keep together in flocks: geese and ducks, gulls, turkeys and cranes; the herds. */
const FLOCKS = new Set<CritterRole>(['waterfowl', 'gull', 'fowl', 'herd']);
/** The soarers that stoop on prey (the vulture never does; the osprey plunges for fish instead). */
const STOOPS = new Set<CritterKind>(['hawk']);
// who hunts whom, by role (only animals on the ground can be taken)
const PREY: Partial<Record<CritterRole, CritterRole[]>> = { predator: ['grazer', 'climber', 'songbird', 'burrower'], raptor: ['grazer', 'climber', 'songbird', 'burrower'] };
const HUNTED = new Set<CritterRole>(['grazer', 'climber', 'songbird', 'shorebird', 'burrower']);
const R = (c: { kind: CritterKind }) => ROLE[c.kind];
/** At most this many of each water mark at once. */
const FX_CAP = 12;
/** A moving thing animals give way to: traffic and the player's vehicle (x, z, velocity). */
export interface Mover { x: number; z: number; vx: number; vz: number }

type State = 'idle' | 'move' | 'flee' | 'climb' | 'perch' | 'fly' | 'drift' | 'stalk' | 'pounce' | 'soar' | 'stoop' | 'rise'
  // (package #13: an opossum playing dead, a skunk's warning)
  | 'possum' | 'warn'
  // (package #14: a bison rolling in its wallow; #15: a basker sliding off its bank or log into the water;
  // #16: a darner on its beat; the water's life: a fish cruising, leaping, rising; a pod surfacing; a whale)
  | 'wallow' | 'slide' | 'patrol' | 'cruise' | 'leap' | 'sip' | 'porpoise' | 'surface'
  // (package #12: a gull wheeling and coming down again, a pelican skimming the waves, an osprey's hover
  // and plunge, a loon under the water)
  | 'glide' | 'alight' | 'skim' | 'hover' | 'plunge' | 'dive';
interface Critter {
  kind: CritterKind; x: number; y: number; z: number; yaw: number; pitch: number;
  state: State; t: number; tx: number; tz: number; ty: number; home?: { x: number; z: number; trunk?: number; r?: number; lean?: [number, number] };
  phase: number; amt: number; s: number; c: THREE.Color; seed: number;
  roll?: number;
  fx?: number; fz?: number;        // where the last scare came from (flee away from it)
  alarm?: number;                  // seconds until a neighbour's alarm reaches this one
  prey?: Critter;                  // a hunter's quarry
  dead?: boolean;
  vig?: number;                    // vigilance 0..1: how early it notices a stalking fox
  wl?: number;                     // its water's level: a swimmer on it (y below by its sink), a wader at its edge
  show?: boolean;                  // displaying: a turkey tom strutting, his fan up; an elk bull bugling
  sit?: boolean;                   // sitting bolt upright by its burrow (a prairie dog's sentry, a woodchuck)
  yip?: number;                    // a prairie dog's jump-yip, an armadillo's leap: seconds left of it
  lead?: Critter;                  // a cub's mother: it keeps by her, and goes where she goes
  beat?: number;                   // a darner's beat: the line it patrols along, by its angle
  stage?: number;                  // a surfacer's part of its cycle (under, up, a breach; a whale's blow and its dive)
}
export interface CritterEnv {
  hour: number; night: number; month: number; wind: number; south: boolean;
  region?: string; climate?: string; // the place's cast (faunaMix); temperate North America when absent
  /** In the lower 48, the place's region and ecoregion (styles.ts castOf): its own cast. */
  place?: { eco: string; l3: number; west: boolean };
  camFwd: THREE.Vector3;
  trees: (x: number, z: number, r: number) => { x: number; z: number; trunk?: number; r?: number; lean?: [number, number] }[];
  gardens: (x: number, z: number, r: number) => { x: number; z: number }[];
  movers?: Mover[];
  /** Paved open ground — parking lots, plazas — where no rabbit grazes (main.ts from the map). */
  paved?: (x: number, z: number) => boolean;
  /** A parking lot or a plaza (not a road): where the gulls come down off the beach. */
  lot?: (x: number, z: number) => boolean;
  /** 0 (open country) … 1 (a built-up downtown) at the walker: fewer wild animals in town. */
  urban?: number;
  /** 0 (the woods, the fields) … 1 (a suburb's streets of houses, a town, a downtown) at the walker: how
   *  settled the land is (main.ts from the houses, the shops and the city's volume about it). A wild
   *  animal is rare where it's high (fauna.ts ABUNDANCE). When absent, `urban`. */
  settled?: number;
}

export class Critters {
  readonly group = new THREE.Group();
  private list: Critter[] = [];
  private meshes = new Map<CritterKind, { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute }>();
  private spawnT = 0;
  private seed = 1;
  private mat4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sv = new THREE.Vector3();
  enabled = true;
  /** Every species of the place's cast about, whatever its odds (the review harness's, and the tests' of
   *  how an animal lives — not of how often you meet it). */
  everyone = false;
  /** The one species to show (the panel's "go see it"): always about, and filling its role's slots
   *  first, wherever its cast is. */
  spotlight: CritterKind | null = null;
  /** How many animals about, of each role's own count (main.ts: lifeParams.animals, and less on a phone):
   *  Robby, 2026-10-06 — "too much". 1 here (the tests' and the harness's); the game's well under. */
  amount = 1;
  /** The nearest of a kind about now, and how far (the panel's "where is it?"). */
  nearestOf(kind: CritterKind, x: number, z: number) {
    let best: { x: number; y: number; z: number; d: number } | null = null;
    for (const c of this.list) {
      if (c.kind !== kind || c.dead) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (!best || d < best.d) best = { x: c.x, y: c.y, z: c.z, d };
    }
    return best;
  }
  /** A sound cue: the sound family (squirrel chatter, a flush of wings, a deer's snort) — not the species. */
  onEvent: ((sound: string, what: 'flee' | 'flush', pan: number, dist: number) => void) | null = null;
  private sound(c: Critter) { const r = R(c); return r === 'climber' || r === 'burrower' ? 'squirrel' : r === 'browser' ? 'deer' : r === 'shorebird' ? 'sandpiper' : r === 'songbird' ? 'songbird' : c.kind; }
  stats: Record<string, number> = {};
  /** Ecosystem tallies since load (hunts started, catches, scares by source) — for the review harness and tests. */
  readonly eco = { hunts: 0, caught: 0, walker: 0, car: 0, predator: 0, raptor: 0, alarm: 0 };

  constructor(private terrain: Terrain, private walk: WalkWorld) {
    this.group.name = 'critters';
    for (const k of CRITTERS) {
      const cap = SPEC[k].cap;
      const geo = critterLib(k).clone();
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAnim', anim);
      const m = new THREE.InstancedMesh(geo, critterMaterial(k), cap);
      m.name = `critter:${k}`;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.layers.enable(1);
      this.group.add(m);
      this.meshes.set(k, { m, anim });
    }
    // the water's marks: a ring spreading where something broke the surface; a whale's blow, a breach's splash
    for (const [i, geo0] of [rippleGeometry(), spoutGeometry()].entries()) {
      const geo = geo0.clone();
      geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(FX_CAP * 3), 3));
      const m = new THREE.InstancedMesh(geo, critterMaterial('manatee'), FX_CAP);
      m.name = i ? 'critter-fx:spout' : 'critter-fx:ripple';
      m.count = 0; m.visible = false; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.layers.enable(1);
      this.group.add(m);
      this.fxMesh.push(m);
    }
  }
  /** The rings and the blows on the water (a few at a time: FX_CAP each), aging out. */
  private fx: { k: 0 | 1; x: number; y: number; z: number; t: number; life: number; s: number }[] = [];
  private fxMesh: THREE.InstancedMesh[] = [];
  private ripple(x: number, y: number, z: number, s: number) { if (this.fx.filter((f) => f.k === 0).length < FX_CAP) this.fx.push({ k: 0, x, y: y + 0.03, z, t: 0, life: 1.8, s }); }
  private spout(x: number, y: number, z: number, s: number, life = 2.6) { if (this.fx.filter((f) => f.k === 1).length < FX_CAP) this.fx.push({ k: 1, x, y, z, t: 0, life, s }); }
  /** Water about the walker, kept for its 25 m square: fresh water within ~30 m (the fish's, a river
   *  otter's), the sea within ~150 m (the dolphins', the seals'), within ~800 m (the whales'). */
  private wet = { key: '', fresh: false, sea: false, offshore: false };
  private wetAt(wx: number, wz: number) {
    const key = `${Math.round(wx / 25)},${Math.round(wz / 25)}`;
    if (key === this.wet.key) return this.wet;
    const T = this.terrain, od = T.oceanDistAt(wx, wz);
    let fresh = false;
    for (const [ox, oz] of [[0, 0], [28, 0], [-28, 0], [0, 28], [0, -28], [20, 20], [-20, 20], [20, -20], [-20, -20]]) if (T.sdfAt(wx + ox, wz + oz) < -1.5) { fresh = true; break; }
    this.wet = { key, fresh, sea: od < 150, offshore: od < 800 };
    return this.wet;
  }

  private rnd() { this.seed = (Math.imul(this.seed ^ 0x9e3779b9, 0x85ebca6b) + 0x6b43a9b3) >>> 0; return this.seed / 4294967296; }

  // ---------------- habitat ----------------
  private ground(x: number, z: number) { return Math.max(this.terrain.heightAt(x, z), 0); }
  private open(x: number, z: number, r = 0.6) { return this.terrain.sdfAt(x, z) > 2 && this.walk.buildingAt(x, z) < 0 && !this.walk.blocked(x, z, r); }
  private lawn(x: number, z: number) { const c = this.terrain.coverAt(x, z); return (c === 30 || c === 10 || c === 20) && this.terrain.oceanDistAt(x, z) > 60 && this.open(x, z, 1.2) && !this.paved(x, z); }
  // open country for grazers, burrowers and ground birds: lawns, meadow, shrub, crops, desert —
  // never a parking lot or a plaza
  private field(x: number, z: number) { const c = this.terrain.coverAt(x, z); return (c === 30 || c === 10 || c === 20 || c === 40 || c === 60) && this.terrain.oceanDistAt(x, z) > 60 && this.open(x, z, 1.2) && !this.paved(x, z); }
  private shore(x: number, z: number) { const s = this.terrain.sdfAt(x, z); return this.terrain.oceanDistAt(x, z) < 45 && s > 0.5 && s < 14; }
  /** What a flier's height is over: the water's level over the water, else the ground. */
  private airBase(x: number, z: number) { return this.terrain.sdfAt(x, z) < 0 ? this.level(x, z) : this.ground(x, z); }
  /** The month as the north has it (the south's year turned round): the seasons' casts and colours. */
  private month(env: CritterEnv) { return env.south ? ((env.month + 5) % 12) + 1 : env.month; }
  private mix(env: CritterEnv) { return faunaMix(env.region ?? 'na', env.climate ?? 'temperate', env.place, this.month(env)); }
  // the water: a swimmer's (open water, `deep` metres from the bank; the sea only for a loon), its level
  // (the sea's 0; a lake's its shore's lowest ground — the level its sheet is laid at, synth.ts)
  private swimmable(x: number, z: number, deep: number, sea = false) {
    const s = this.terrain.sdfAt(x, z);
    return s < -deep && s > -400 && (sea || this.terrain.oceanDistAt(x, z) > 8);
  }
  private level(x: number, z: number) {
    const T = this.terrain;
    if (T.oceanDistAt(x, z) < 6) return 0;
    let px = x, pz = z;
    for (let i = 0; i < 10; i++) {
      const s = T.sdfAt(px, pz);
      if (s > 0.5) break;
      const gx = T.sdfAt(px + 1, pz) - T.sdfAt(px - 1, pz), gz = T.sdfAt(px, pz + 1) - T.sdfAt(px, pz - 1), L = Math.hypot(gx, gz) || 1;
      const st = Math.max(1, 1 - s);
      px += (gx / L) * st; pz += (gz / L) * st;
    }
    // (the bank's ground round the spot — the bank's only: a sample back over the water reads its bed)
    let lo = Infinity;
    for (const [ox, oz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (T.sdfAt(px + ox, pz + oz) > 0.5) lo = Math.min(lo, T.heightAt(px + ox, pz + oz));
    return Math.max(0, lo < Infinity ? lo : T.heightAt(px, pz));
  }
  /** Whether it wears its antlers or horns now: a bull, a buck or a ram (by its seed), in their months. */
  private horned(c: Critter, month: number) {
    const r = RACK[c.kind];
    return !!r && (c.seed % 997) / 997 < r.male && (!r.months || r.months.includes(month));
  }
  /** The ground's steepness (rise over run): a bighorn's cliffs and roadside cuts. */
  private slope(x: number, z: number) {
    const T = this.terrain;
    return Math.hypot(T.heightAt(x + 3, z) - T.heightAt(x - 3, z), T.heightAt(x, z + 3) - T.heightAt(x, z - 3)) / 6;
  }
  /** At the water's edge, a step in or out (a heron's, an egret's). */
  private edge(x: number, z: number) { const s = this.terrain.sdfAt(x, z); return s > -2.4 && s < 1.4 && this.walk.buildingAt(x, z) < 0; }
  /** A gull's ground: the beach, a coastal town's lots and plazas — the inland gulls' (the California gull's
   *  anywhere, the ring-billed's and the herring gull's away from the sea) lots and fields too. */
  private gullGround(x: number, z: number, sp: CritterKind) {
    if (this.shore(x, z)) return true;
    // (a parking lot or a plaza, never the road: they'd stand in every street of a shore town)
    const lot = this.lotAt(x, z) && this.walk.buildingAt(x, z) < 0 && !this.walk.blocked(x, z, 0.6) && this.terrain.sdfAt(x, z) > 1;
    // (the ring-billed and the herring gull keep to the beach and the coast's lots like the rest by the sea;
    // inland — the Great Lakes, the Plains — any lot or field)
    const od = this.terrain.oceanDistAt(x, z);
    return (lot && od < 3000) || ((sp === 'californiagull' || ((sp === 'ringbilledgull' || sp === 'herringgull') && od > 3000)) && (lot || this.field(x, z)));
  }
  /** Where this one can go next: on its water, at its edge, on its ground. */
  private valid(c: Critter, x: number, z: number) {
    const r = R(c);
    if (r === 'wader') return this.edge(x, z);
    if (c.wl !== undefined) return this.swimmable(x, z, c.kind === 'loon' ? 6 : 1.2, c.kind === 'loon' || c.kind === 'brownpelican' || c.kind === 'manatee' || r === 'gull' || (r === 'swimmer' && c.kind !== 'riverotter'));
    if (r === 'gull') return this.gullGround(x, z, c.kind);
    if (c.kind === 'pigeon' && this.paved(x, z)) return this.walk.buildingAt(x, z) < 0 && !this.walk.blocked(x, z, 0.2);
    if (c.kind === 'prairiedog' && !prairieTown(x, z)) return false; // (a prairie dog never leaves its town)
    // (a fiddler keeps to its mud, a crawfish to its water's edge; a slug to the ground under its trees)
    if (r === 'crab') return c.kind === 'fiddlercrab' ? this.shore(x, z) : this.terrain.sdfAt(x, z) > 0 && this.terrain.sdfAt(x, z) < 6 && this.walk.buildingAt(x, z) < 0;
    if (r === 'crawler') return this.terrain.sdfAt(x, z) > 1 && this.walk.buildingAt(x, z) < 0 && !this.walk.blocked(x, z, 0.1);
    return this.open(x, z, 0.2);
  }
  /** Its height where it is: on the water by its sink, at the edge knee-deep, else on the ground. */
  private stand(c: Critter) {
    if (c.wl === undefined) return this.ground(c.x, c.z);
    if (R(c) === 'wader') return Math.max(this.ground(c.x, c.z), c.wl - 0.1);
    return c.wl + 0.06 - swimSink(c.kind) * c.s;
  }
  /** A flock's: near one of its own already here (geese, ducks, gulls, turkeys, cranes), on the same footing. */
  private nearKin(sp: CritterKind) {
    const kin = this.list.filter((o) => o.kind === sp && (o.state === 'idle' || o.state === 'move'));
    return kin.length ? kin[Math.floor(this.rnd() * kin.length)] : null;
  }
  private want(k: CritterRole, env: CritterEnv) {
    if (!this.mix(env)[k]?.length) return 0; // the place has no species for this role
    const h = env.hour, day = env.night < 0.35;
    const warm = (env.south ? ((env.month + 5) % 12) + 1 : env.month);
    const summer = warm >= 5 && warm <= 9;
    const dawnDusk = (h > 5 && h < 9.5) || (h > 16.5 && h < 20.5);
    // a built-up downtown keeps its squirrels in the park trees and little else wild on the ground
    const town = 1 - 0.85 * Math.min(1, Math.max(0, env.urban ?? 0));
    switch (k) {
      case 'climber': return day ? Math.round(6 * (0.5 + 0.5 * town)) : 0;
      // (a prairie dog town near the walker: the dozens of them up and about)
      case 'burrower': return day ? Math.round(5 * town) + (this.inTown ? 14 : 0) : 0;
      case 'grazer': return Math.round((dawnDusk ? 4 : day ? 1 : 0) * town);
      case 'songbird': return day ? (h < 10 ? 8 : 5) : 0;
      case 'shorebird': return day ? 10 : 0;
      case 'browser': return dawnDusk && town > 0.6 ? 2 : 0;
      // (a winter roost's monarchs, whatever the day; the summer's butterflies, and October's with the
      // monarchs streaming south)
      case 'butterfly': return this.roost ? 22 : day && (summer || warm === 10) && env.wind < 0.75 ? 8 : 0;
      case 'firefly': return env.night > 0.6 && warm >= 6 && warm <= 8 ? 26 : 0;
      case 'predator': return town < 0.5 ? 0 : dawnDusk ? 2 : env.night > 0.5 ? 1 : 0;
      // (one raptor where a hawk's alone in the sky; where there are vultures, a few circling with it)
      case 'raptor': return day && h > 8 && h < 17.5 ? 3 : 0;
      case 'waterfowl': return day ? (dawnDusk ? 8 : 6) : 0;
      case 'wader': return day ? (dawnDusk ? 4 : 3) : 0;
      case 'gull': return day ? 4 : 0;
      case 'fowl': return day ? Math.round(6 * (0.3 + 0.7 * town)) : 0;
      // (the raccoon, the opossum and the skunk out at night, in town as much as out of it; the herds
      // in open country only, most at dawn and dusk)
      case 'forager': return env.night > 0.5 ? 3 : dawnDusk && env.night > 0.15 ? 1 : 0;
      case 'herd': return town < 0.6 ? 0 : dawnDusk ? 8 : day ? 4 : 0;
      case 'basker': return day ? 6 : 0;
      // (the darners on their beats by day; the cicadas on the bark through a summer's day, their shells
      // with them; the slugs about under the trees, most at night; the fiddlers out on the mud by day, the
      // crawfish at any hour)
      case 'dragonfly': return day && env.wind < 0.8 ? 4 : 0;
      case 'bug': return day && h > 9 && h < 19.5 ? 5 : 0;
      case 'crawler': return env.night > 0.5 ? 5 : 3;
      case 'crab': return day ? 24 : 4;
      case 'lizard': return day && h > 8 && h < 18.5 ? 5 : 0;
      // (the water's life only where there's water near: a few fish, most at dawn and dusk; the swimmers;
      // the dolphins and the whales by day)
      case 'fish': return this.wet.fresh || this.wet.sea ? (dawnDusk ? 6 : 4) : 0;
      case 'swimmer': return this.wet.fresh || this.wet.sea ? (day ? 5 : 2) : 0;
      case 'cetacean': return this.wet.offshore && day ? 6 : 0;
    }
  }
  private place(k: CritterRole, wx: number, wz: number, env: CritterEnv, sp?: CritterKind): Omit<Critter, 'kind' | 'seed' | 'c' | 's'> | null {
    const near = k === 'butterfly' || k === 'firefly' || k === 'dragonfly' || k === 'crawler' || k === 'lizard' || k === 'fish';
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rnd() * Math.PI * 2;
      const d = near ? 6 + this.rnd() * 22 : 20 + this.rnd() * 40;
      let x = wx + Math.sin(a) * d, z = wz + Math.cos(a) * d;
      // don't pop into existence in plain view (unless far or tiny)
      const f = env.camFwd;
      if (!near && k !== 'raptor' && d < 38 && (Math.sin(a) * f.x + Math.cos(a) * f.z) > 0.25) continue;
      let home: { x: number; z: number; trunk?: number; r?: number; lean?: [number, number] } | undefined;
      if (k === 'bug') {
        // a cicada on the bark two to five metres up, head up; a shell lower down, where the nymph climbed
        // out of the ground and split its skin
        const t = env.trees(x, z, 14);
        if (!t.length) continue;
        home = t[Math.floor(this.rnd() * t.length)];
        const g = this.ground(home.x, home.z), top = Math.max(1.2, (home.trunk ?? 3) * 0.9), ra = this.rnd() * 6.28;
        const y = sp === 'cicadashell' ? g + 0.3 + this.rnd() * 1.1 : g + Math.min(top, 1.6 + this.rnd() * 3);
        return { x: home.x + Math.sin(ra) * 0.5, y, z: home.z + Math.cos(ra) * 0.5, yaw: 0, pitch: Math.PI / 2 - 0.1, state: 'perch', t: 1e6, tx: x, tz: z, ty: y, home, phase: this.rnd(), amt: 0 };
      } else if ((k === 'climber' && sp && ANOLES.has(sp)) || (sp === 'spinylizard' && this.rnd() < 0.5 && env.trees(x, z, 14).length)) {
        // an anole up a trunk, head up, a metre or two off the ground
        const t = env.trees(x, z, 14);
        if (!t.length) continue;
        home = t[Math.floor(this.rnd() * t.length)];
        const ra = this.rnd() * 6.28, top = Math.max(0.8, (home.trunk ?? 3) * 0.8), y = this.ground(home.x, home.z) + 0.5 + this.rnd() * Math.min(1.6, top - 0.5);
        return { x: home.x + Math.sin(ra) * 0.5, y, z: home.z + Math.cos(ra) * 0.5, yaw: 0, pitch: Math.PI / 2 - 0.1, state: 'perch', t: 1e6, tx: x, tz: z, ty: y, home, phase: this.rnd(), amt: 0 };
      } else if (k === 'basker') {
        const base = { pitch: 0, t: 1e6, tx: x, tz: z, phase: this.rnd(), amt: 0 };
        if (sp && TURTLES.has(sp)) {
          // turtles in a row along a log, necks out; or, with no log about, swimming with their heads up
          const logs = this.logsNear(wx, wz).filter((l) => Math.hypot(l.x - wx, l.z - wz) < 80);
          if (logs.length && this.rnd() < 0.8) {
            const l = logs[Math.floor(this.rnd() * logs.length)], u = -2.1 + this.rnd() * 4;
            const lx = l.x + Math.sin(l.yaw) * u, lz = l.z + Math.cos(l.yaw) * u;
            if (this.list.some((o) => TURTLES.has(o.kind) && Math.hypot(o.x - lx, o.z - lz) < 0.4)) continue;
            return { ...base, x: lx, y: l.y + 0.56, z: lz, ty: l.y + 0.56, yaw: l.yaw + (this.rnd() < 0.5 ? 0 : Math.PI), state: 'perch' };
          }
          if (!this.swimmable(x, z, 1.5) || this.terrain.sdfAt(x, z) < -12) continue;
          const wl = this.level(x, z);
          return { ...base, x, z, y: wl, ty: wl, wl, yaw: this.rnd() * 6.28, t: 2, state: 'idle' };
        }
        // an alligator on a sunny bank, or floating with its eyes and snout up
        if (this.rnd() < 0.5) {
          const sd = this.terrain.sdfAt(x, z);
          if (sd < 1 || sd > 5 || this.walk.buildingAt(x, z) >= 0 || this.terrain.oceanDistAt(x, z) < 100) continue;
          const gx = this.terrain.sdfAt(x + 1, z) - this.terrain.sdfAt(x - 1, z), gz = this.terrain.sdfAt(x, z + 1) - this.terrain.sdfAt(x, z - 1);
          return { ...base, x, z, y: this.ground(x, z), ty: 0, yaw: Math.atan2(gx, gz) + (this.rnd() - 0.5), state: 'perch' }; // (facing the water)
        }
        if (!this.swimmable(x, z, 3)) continue;
        const wl = this.level(x, z);
        return { ...base, x, z, y: wl, ty: wl, wl, yaw: this.rnd() * 6.28, t: 2, state: 'idle' };
      } else if (k === 'climber') {
        const t = env.trees(x, z, 14);
        if (!t.length) continue;
        home = t[Math.floor(this.rnd() * t.length)];
        const ra = this.rnd() * 6.28;
        x = home.x + Math.sin(ra) * (1.5 + this.rnd() * 3);
        z = home.z + Math.cos(ra) * (1.5 + this.rnd() * 3);
        if (!this.open(x, z, 0.3) || this.paved(x, z)) continue; // on the lawn, not in the street
      } else if (k === 'burrower' && sp === 'prairiedog') {
        // only in a town (signs.ts prairieTown: its mounds are props.ts's), near the others
        const kin = this.rnd() < 0.7 ? this.nearKin(sp) : null;
        if (kin) { const ka = this.rnd() * 6.28, kd = 2 + this.rnd() * 8; x = kin.x + Math.sin(ka) * kd; z = kin.z + Math.cos(ka) * kd; }
        if (!prairieTown(x, z) || !this.field(x, z)) continue;
      } else if (k === 'forager') {
        // the lawns, the yards and the fields' edges at night
        if (!this.lawn(x, z) && !this.field(x, z)) continue;
      } else if (k === 'herd') {
        // a herd comes down by its own: elk in the meadows, pronghorn on the open grass, bighorn on the steeps
        const kin = sp && this.rnd() < 0.85 ? this.nearKin(sp) : null;
        if (kin) { const ka = this.rnd() * 6.28, kd = 3 + this.rnd() * 9; x = kin.x + Math.sin(ka) * kd; z = kin.z + Math.cos(ka) * kd; }
        if (sp === 'bighorn' ? !(this.slope(x, z) > 0.4 && this.open(x, z, 1.5) && !this.paved(x, z)) : !this.field(x, z)) continue;
        if (sp === 'pronghorn' && this.terrain.oceanDistAt(x, z) < 1000) continue;
        // (bison are kept herds — the parks' and the preserves' — so only deep in open country here, never by a town)
        if (sp === 'bison' && (env.urban ?? 0) > 0.02) continue;
      } else if (k === 'browser' && sp === 'moose' && this.rnd() < 0.35) {
        // a moose in the shallows, feeding
        if (!this.edge(x, z)) continue;
      } else if (k === 'grazer' || k === 'songbird' || k === 'burrower') {
        // (a pigeon's on the plaza and the parking lot as well as the grass)
        if (!this.field(x, z) && !(sp === 'pigeon' && this.paved(x, z) && this.open(x, z, 1.2) && this.terrain.oceanDistAt(x, z) > 60)) continue;
      } else if (k === 'shorebird') {
        if (!this.shore(x, z)) continue;
      } else if (k === 'browser') {
        // the wood's edge — or, where there are no woods, open shrubland (mule deer in the desert)
        const cv = this.terrain.coverAt(x, z);
        if (!this.open(x, z, 3) || !((cv === 10 && env.trees(x, z, 12).length >= 3) || cv === 20)) continue;
      } else if (k === 'butterfly' && sp === 'monarch' && this.roost) {
        // a winter roost: three clusters hanging under its tree's crown, the monarchs shingled down them
        // like dead leaves, wings closed
        const R0 = this.roost, n = this.list.filter((o) => o.kind === 'monarch' && o.home?.x === R0.home.x && o.home?.z === R0.home.z).length;
        const cl = n % 3, row = Math.floor(n / 3), a = R0.a + cl * 2.1, r = 1.3 + cl * 0.25;
        const gx = R0.home.x + Math.sin(a) * r + (this.rnd() - 0.5) * 0.14, gz = R0.home.z + Math.cos(a) * r + (this.rnd() - 0.5) * 0.14;
        const y = this.ground(R0.home.x, R0.home.z) + R0.top - 0.1 - row * 0.05;
        return { x: gx, y, z: gz, yaw: this.rnd() * 6.28, pitch: (this.rnd() - 0.5) * 0.4, roll: Math.PI, state: 'perch', t: 3 + this.rnd() * 8, tx: gx, tz: gz, ty: y, home: R0.home, phase: this.rnd(), amt: 0 };
      } else if (k === 'butterfly' && sp === 'monarch' && this.migrating) {
        // streaming south: in over the walker from the north, high and steady, along a broad front
        const across = (this.rnd() - 0.5) * 50;
        const mx = wx - MIG[0] * 28 + MIG[1] * across, mz = wz - MIG[1] * 28 - MIG[0] * across, y = this.ground(mx, mz) + 2.5 + this.rnd() * 3;
        return { x: mx, y, z: mz, yaw: Math.atan2(-MIG[0], -MIG[1]), pitch: 0, state: 'drift', t: 30, tx: mx, tz: mz, ty: y, phase: this.rnd(), amt: 0 };
      } else if (k === 'dragonfly') {
        // a darner's beat: over a pond's, a lake's or a creek's edge (or, now and then, a meadow), at head height
        const s = this.terrain.sdfAt(x, z);
        if (!((s > -10 && s < 12 && this.terrain.oceanDistAt(x, z) > 40) || (this.field(x, z) && this.rnd() < 0.3))) continue;
        const y = this.airBase(x, z) + 0.9 + this.rnd() * 1.2;
        return { x, y, z, yaw: this.rnd() * 6.28, pitch: 0, state: 'patrol', t: 0.5, tx: x, tz: z, ty: y, home: { x, z }, beat: this.rnd() * Math.PI, phase: this.rnd(), amt: 1 };
      } else if (k === 'fish') {
        // in the water near the walker: the salt fish in the sea's bays and creeks, the rest in fresh water; a
        // school in any clear shallow water, salt or fresh
        const s0 = this.terrain.sdfAt(x, z), od = this.terrain.oceanDistAt(x, z), salt = sp === 'mullet' || sp === 'tarpon';
        if (!(salt ? s0 < -2 && s0 > -60 && od < 3000 : sp === 'shoal' ? s0 < -1.5 && s0 > -40 : s0 < -1.5 && od > 8)) continue;
        const wl = this.level(x, z), yaw = this.rnd() * 6.28;
        if (sp === 'shoal') return { x, y: wl + 0.015, z, yaw, pitch: 0, state: 'cruise', t: 1e6, tx: x, tz: z, ty: wl, wl, phase: this.rnd(), amt: 0.5 };
        return { x, y: wl - 0.6, z, yaw, pitch: 0, state: 'cruise', t: 2 + this.rnd() * 8, tx: x, tz: z, ty: wl, wl, phase: this.rnd(), amt: 0.4 };
      } else if (k === 'swimmer') {
        const T = this.terrain, s0 = T.sdfAt(x, z), od = T.oceanDistAt(x, z), base = { yaw: this.rnd() * 6.28, pitch: 0, t: 1 + this.rnd() * 4, tx: x, tz: z, phase: this.rnd(), amt: 0 };
        if (sp === 'seaotter') {
          // afloat on its back in the kelp, off the central coast
          if (!(s0 < -8 && s0 > -200 && od < 6)) continue;
          return { ...base, x, z, y: 0, ty: 0, wl: 0, roll: Math.PI, state: 'idle' };
        }
        const river = sp === 'riverotter', kin = this.list.find((o) => o.kind === sp && o.wl === undefined && Math.hypot(o.x - x, o.z - z) < 40);
        if (kin && this.rnd() < 0.7) { x = kin.x + (this.rnd() - 0.5) * 6; z = kin.z + (this.rnd() - 0.5) * 6; }
        if (this.rnd() < 0.5 || kin) {
          // hauled out: the seals on the beach by the water, packed together; an otter on a riverbank
          const s1 = T.sdfAt(x, z);
          if (river ? !(s1 > 0.3 && s1 < 4 && T.oceanDistAt(x, z) > 300 && this.walk.buildingAt(x, z) < 0) : !(this.shore(x, z) && s1 < 8)) continue;
          return { ...base, x, z, y: this.ground(x, z), ty: 0, state: 'idle' };
        }
        if (river ? !(this.swimmable(x, z, 1.5) && od > 300) : !(this.swimmable(x, z, 3, true) && od < 6 && s0 > -80)) continue;
        const wl = this.level(x, z);
        return { ...base, x, z, y: wl, ty: wl, wl, state: 'idle' };
      } else if (k === 'cetacean') {
        const T = this.terrain;
        if (sp && WHALES.has(sp)) {
          // far out in the open sea, a few hundred metres off
          let ok = false;
          for (let i = 0; i < 6 && !ok; i++) { const a2 = this.rnd() * 6.28, d2 = 250 + this.rnd() * 450; x = wx + Math.sin(a2) * d2; z = wz + Math.cos(a2) * d2; ok = T.sdfAt(x, z) < -150 && T.oceanDistAt(x, z) < 6; }
          if (!ok) continue;
          return { x, y: -10, z, yaw: this.rnd() * 6.28, pitch: 0, state: 'surface', stage: 0, t: 3 + this.rnd() * 12, tx: x, tz: z, ty: 0, wl: 0, phase: this.rnd(), amt: 0.5 };
        }
        // a pod beyond the breakers: alongside one already there, heading its way
        const kin = this.list.find((o) => o.kind === sp && o.state === 'porpoise' && Math.hypot(o.x - wx, o.z - wz) < 120);
        let yaw = this.rnd() * 6.28;
        if (kin) { const side = (this.rnd() - 0.5) * 10, back = 2 + this.rnd() * 6; yaw = kin.yaw; x = kin.x + Math.cos(yaw) * side + Math.sin(yaw) * back; z = kin.z - Math.sin(yaw) * side + Math.cos(yaw) * back; }
        else {
          // (along the shore, one way or the other)
          const gx = T.sdfAt(x + 2, z) - T.sdfAt(x - 2, z), gz = T.sdfAt(x, z + 2) - T.sdfAt(x, z - 2);
          yaw = Math.atan2(gz, -gx) + (this.rnd() < 0.5 ? Math.PI : 0);
        }
        const s0 = T.sdfAt(x, z);
        if (!(s0 < -15 && s0 > -250 && T.oceanDistAt(x, z) < 6)) continue;
        return { x, y: -2, z, yaw, pitch: 0, state: 'porpoise', stage: 0, t: kin ? (kin.t as number) + this.rnd() * 0.8 : this.rnd() * 3, tx: x, tz: z, ty: 0, wl: 0, phase: this.rnd(), amt: 1 };
      } else if (k === 'lizard') {
        // out in the sun on open ground: the desert's flats and trails, the grass and the scrub's edges
        const cv = this.terrain.coverAt(x, z);
        if (!(cv === 20 || cv === 30 || cv === 60) || !this.open(x, z, 0.6) || this.paved(x, z) || this.terrain.oceanDistAt(x, z) < 60) continue;
      } else if (k === 'crawler') {
        // the forest floor: under the trees, in the duff and the ferns
        if (!(this.terrain.coverAt(x, z) === 10 || env.trees(x, z, 6).length >= 2) || !this.open(x, z, 0.3) || this.paved(x, z) || this.terrain.oceanDistAt(x, z) < 60) continue;
      } else if (k === 'crab') {
        if (sp === 'fiddlercrab') {
          // a colony out on the mud: by one already out, or a new one on the shore
          const kin = this.nearKin('fiddlercrab');
          if (kin && this.rnd() < 0.85) { x = kin.x + (this.rnd() - 0.5) * 6; z = kin.z + (this.rnd() - 0.5) * 6; }
          if (!this.shore(x, z) || this.terrain.sdfAt(x, z) > 8) continue;
        } else {
          // a crawfish by its ditch, its creek or its pond: on the bank at the water's edge
          const s = this.terrain.sdfAt(x, z);
          if (s < 0.2 || s > 4 || this.terrain.oceanDistAt(x, z) < 300 || this.walk.buildingAt(x, z) >= 0) continue;
        }
      } else if (k === 'butterfly') {
        const gd = env.gardens(x, z, 20);
        if (gd.length) { const g = gd[Math.floor(this.rnd() * gd.length)]; x = g.x; z = g.z; }
        else if (!this.lawn(x, z)) continue;
      } else if (k === 'firefly') {
        if (!this.lawn(x, z) && this.terrain.coverAt(x, z) !== 10) continue;
      } else if (k === 'predator') {
        if (!(this.field(x, z) || (this.terrain.coverAt(x, z) === 10 && this.open(x, z, 1)))) continue;
      } else if (k === 'raptor') {
        // circles a thermal over open ground, 55–75 m up: at that range the silhouette is the read —
        // an osprey over the water, lower; an eagle near big water; the vultures a kettle on one thermal
        let home = { x: wx + Math.sin(a) * d * 0.7, z: wz + Math.cos(a) * d * 0.7 }, up = 55 + this.rnd() * 20;
        if (sp === 'osprey') { if (this.terrain.sdfAt(home.x, home.z) > -8) continue; up = 18 + this.rnd() * 10; }
        if (sp === 'baldeagle' && this.terrain.sdfAt(home.x, home.z) > 250) continue;
        const kin = sp === 'turkeyvulture' ? this.list.find((o) => o.kind === sp && o.home) : undefined;
        if (kin) (home = { x: kin.home!.x, z: kin.home!.z }), (up = kin.ty + (this.rnd() - 0.5) * 16);
        const y = this.ground(home.x, home.z) + up;
        return { x, y, z, yaw: this.rnd() * 6.28, pitch: 0, state: 'soar', t: 4 + this.rnd() * 6, tx: x, tz: z, ty: y, home, phase: this.rnd(), amt: 0 };
      } else if (k === 'waterfowl' || k === 'wader' || k === 'gull' || k === 'fowl') {
        // a flock comes down by its own (geese, ducks, gulls, a turkey's flock, a crane's family)
        const kin = k !== 'wader' && sp && this.rnd() < (k === 'fowl' ? 0.85 : 0.65) ? this.nearKin(sp) : null;
        if (kin) { const ka = this.rnd() * 6.28, kd = 1.5 + this.rnd() * 5; x = kin.x + Math.sin(ka) * kd; z = kin.z + Math.cos(ka) * kd; }
        const base = { yaw: this.rnd() * 6.28, pitch: 0, t: 1 + this.rnd() * 3, tx: x, tz: z, home, phase: this.rnd(), amt: 0 };
        if (k === 'waterfowl') {
          // on the water — a pond, a lake, a river; geese (and a few ducks) grazing the lawns by it
          const water = sp === 'loon' || sp === 'manatee'; // (never on land)
          const land = kin ? kin.wl === undefined : (sp === 'canadagoose' && this.rnd() < 0.55) || (!water && this.rnd() < 0.12);
          if (land) { if (water || !this.lawn(x, z) || this.terrain.sdfAt(x, z) > 45) continue; }
          else {
            if (!this.swimmable(x, z, sp === 'loon' ? 12 : 2, water)) continue;
            const wl = this.level(x, z);
            return { ...base, x, z, y: wl, ty: wl, wl, state: 'idle' };
          }
        } else if (k === 'wader') {
          if (!this.edge(x, z)) continue;
          const wl = this.level(x, z);
          return { ...base, x, z, y: Math.max(this.ground(x, z), wl - 0.1), ty: 0, wl, state: 'idle' };
        } else if (k === 'gull') {
          if (sp === 'brownpelican') {
            // a line of pelicans skimming the waves along the shore, or a few sitting on the water
            const s0 = this.terrain.sdfAt(x, z);
            if (this.terrain.oceanDistAt(x, z) > 4 || s0 > -6 || s0 < -70) continue;
            // (one behind another in a skimming line; a few rafted up on the water)
            if (kin?.state === 'skim') { const bx = x, bz = z; x = kin.x + Math.sin(kin.yaw) * (5 + this.rnd() * 2); z = kin.z + Math.cos(kin.yaw) * (5 + this.rnd() * 2); if (this.terrain.sdfAt(x, z) > -4) (x = bx), (z = bz); else return { ...base, x, z, y: kin.ty, ty: kin.ty, yaw: kin.yaw, state: 'skim', t: kin.t + 2 }; }
            if ((kin && kin.wl !== undefined) || this.rnd() < 0.3) return { ...base, x, z, y: 0, ty: 0, wl: 0, state: 'idle' };
            const gx = this.terrain.sdfAt(x + 2, z) - this.terrain.sdfAt(x - 2, z), gz = this.terrain.sdfAt(x, z + 2) - this.terrain.sdfAt(x, z - 2);
            const along = Math.atan2(gz, -gx) + (this.rnd() < 0.5 ? Math.PI : 0); // (square to the shore's slope)
            return { ...base, x, z, y: 1.4 + this.rnd(), ty: 1.4 + this.rnd(), yaw: along, state: 'skim', t: 25 + this.rnd() * 15 };
          }
          if (!this.gullGround(x, z, sp!)) continue;
          if (this.rnd() < 0.3) {
            // some on the wing, wheeling over their beach or lot
            const y = this.ground(x, z) + 6 + this.rnd() * 8;
            return { ...base, x, z, y, ty: y, home: { x, z }, state: 'glide', t: 6 + this.rnd() * 10 };
          }
        } else if (!this.field(x, z)) continue;
        const y0 = this.ground(x, z);
        return { ...base, x, z, y: y0, ty: y0, state: 'idle' };
      }
      const y = this.ground(x, z) + (k === 'butterfly' ? 0.6 + this.rnd() : k === 'firefly' ? 0.4 + this.rnd() * 1.6 : 0);
      return { x, y, z, yaw: this.rnd() * 6.28, pitch: 0, state: k === 'butterfly' || k === 'firefly' ? 'drift' : 'idle', t: 1 + this.rnd() * 3, tx: x, tz: z, ty: y, home, phase: this.rnd(), amt: 0 };
    }
    return null;
  }

  // ---------------- tick ----------------
  private paved: (x: number, z: number) => boolean = () => false;
  private lotAt: (x: number, z: number) => boolean = () => false;
  /** The basking logs about the walker (signs.ts baskingLogs: the props' own), kept for its 50 m square. */
  private logs: { x: number; y: number; z: number; yaw: number }[] = [];
  private logsAt = '';
  private logsNear(wx: number, wz: number) {
    const key = `${Math.round(wx / 50)},${Math.round(wz / 50)}`;
    if (key !== this.logsAt) {
      this.logsAt = key;
      const T = this.terrain;
      this.logs = baskingLogs({ x0: wx - 90, z0: wz - 90, x1: wx + 90, z1: wz + 90 }, (x, z) => T.sdfAt(x, z), (x, z) => T.oceanDistAt(x, z), (x, z) => T.heightAt(x, z));
    }
    return this.logs;
  }
  /** Whether a species is about this patch of ground this month: a lottery by its odds (fauna.ts
   *  presenceOdds) for each 160 m square — deterministic, the same for every visitor — so a rare animal is
   *  in a few patches and a common one in most. A winter roost's monarchs and a prairie dog town's prairie
   *  dogs are always there. */
  private present(sp: CritterKind, x: number, z: number, wild: number, month: number) {
    if (this.everyone || sp === this.spotlight || (sp === 'monarch' && this.roost) || (sp === 'prairiedog' && this.inTown)) return true;
    const ci = Math.floor(x / 160), cj = Math.floor(z / 160);
    return hashf(ci * 92821 + cj * 68917 + CRITTERS.indexOf(sp) * 7919 + month * 104729) < presenceOdds(sp, wild);
  }
  /** Whether a prairie dog town lies within ~60 m of the walker (signs.ts prairieTown). */
  private inTown = false;
  /** A monarchs' winter roost near the walker (its tree, how high its crown starts, which way its
   *  clusters hang), kept for the walker's 40 m square; whether the monarchs are streaming south. */
  private roost: { home: { x: number; z: number; trunk?: number; r?: number }; top: number; a: number } | null = null;
  private roostKey = '';
  private migrating = false;
  private roostAt(wx: number, wz: number, env: CritterEnv) {
    if (!monarchRoost(env.place?.eco, this.month(env)) || this.terrain.oceanDistAt(wx, wz) > 2500 || !this.mix(env).butterfly?.some(([k]) => k === 'monarch')) return (this.roostKey = ''), null;
    const key = `${Math.round(wx / 40)},${Math.round(wz / 40)}`;
    if (key === this.roostKey) return this.roost;
    this.roostKey = key;
    // the biggest tree about (a eucalyptus, a cypress or a pine in a sheltered grove)
    const big = env.trees(wx, wz, 60).filter((t) => (t.trunk ?? 0) >= 4).sort((a, b) => (b.trunk ?? 0) - (a.trunk ?? 0) || a.x - b.x)[0];
    return big ? { home: big, top: big.trunk ?? 4, a: (((Math.floor(big.x) * 73 + Math.floor(big.z) * 19) % 628) + 628) % 628 / 100 } : null;
  }
  /** How loud the annual cicadas' chorus is about the walker (0–1: those on the bark near; ambience.ts). */
  get chorus() { return Math.min(1, this.list.filter((c) => c.kind === 'annualcicada' && c.state === 'perch').length / 2); }
  update(dt: number, wx: number, wz: number, env: CritterEnv) {
    this.paved = env.paved ?? (() => false); this.lotAt = env.lot ?? (() => false);
    this.inTown = [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [42, 42], [-42, 42], [42, -42], [-42, -42]].some(([ox, oz]) => prairieTown(wx + ox, wz + oz) !== null);
    this.roost = this.roostAt(wx, wz, env);
    this.wetAt(wx, wz);
    this.migrating = monarchMigrating(env.place?.eco, this.month(env));
    const count: Record<string, number> = {}, roleCount: Record<string, number> = {};
    for (const c of this.list) { count[c.kind] = (count[c.kind] ?? 0) + 1; roleCount[R(c)] = (roleCount[R(c)] ?? 0) + 1; }
    if (this.enabled && (this.spawnT -= dt) <= 0) {
      this.spawnT = 0.6;
      const mix = this.mix(env), mo = this.month(env), wild = 1 - Math.max(env.settled ?? 0, env.urban ?? 0);
      for (const role of ROLES) {
        // (only the species about this patch of ground this month: most patches have none of the rare ones)
        const cast = mix[role]?.filter(([sp]) => this.present(sp, wx, wz, wild, mo));
        if (!cast?.length) continue;
        const cap = Math.max(...cast.map(([sp]) => SPEC[sp].cap));
        const want = Math.min(cap, Math.round(this.want(role, env) * this.amount));
        if ((roleCount[role] ?? 0) >= want) continue;
        // which of the place's species fills this slot (weighted)
        // (pigeons are the town's: few in the country, the most of the birds downtown)
        // (a winter roost's butterflies all monarchs; in their fall streams the monarchs the most of them)
        const wt = (sp: CritterKind, w: number) => sp === this.spotlight ? Math.max(w, 0.1) * 60 : sp === 'pigeon' ? w * (0.2 + 3 * Math.min(1, Math.max(0, env.urban ?? 0))) : sp === 'prairiedog' ? w * (this.inTown ? 5 : 0.05)
          : sp === 'monarch' ? w * (this.migrating ? 4 : 1) : this.roost && ROLE[sp] === 'butterfly' ? 0 : w;
        let r = this.rnd() * cast.reduce((a, [sp, w]) => a + wt(sp, w), 0), k = cast[0][0];
        for (const [sp, w] of cast) { if ((r -= wt(sp, w)) <= 0) { k = sp; break; } }
        if ((count[k] ?? 0) >= SPEC[k].cap) continue;
        const p = this.place(role, wx, wz, env, k);
        if (!p) continue;
        const S = SPEC[k];
        const c = new THREE.Color(S.colors[Math.floor(this.rnd() * S.colors.length)]);
        if (k === 'snowshoe') {
          // a snowshoe hare is white from late autumn to spring
          const m = env.south ? ((env.month + 5) % 12) + 1 : env.month;
          if (m >= 11 || m <= 4) c.set(0xf2f0ea);
        }
        // a loon grey in winter; a laughing gull's black hood gone white from September to March; a western
        // black bear any of its colours
        if (k === 'greenanole' && !(mo >= 4 && mo <= 10 && env.hour > 8 && env.hour < 19)) c.set(0x7a5a3a); // (brown when it's cool)
        if (k === 'collaredlizard') c.set((this.seed % 997) / 997 < RACK.collaredlizard!.male ? 0x3aa080 : 0x9a8a6a); // (a male turquoise, a female tan)
        if (k === 'blackbear') c.set(env.place?.west || ['rockies', 'great-basin', 'desert-sw', 'california', 'pnw'].includes(env.place?.eco ?? '') ? WEST_BEAR[Math.floor(this.rnd() * WEST_BEAR.length)] : 0x1e1a18);
        if (k === 'loon' && (mo >= 10 || mo <= 4)) c.set(0x5e646c);
        if (k === 'laughinggull' && (mo >= 9 || mo <= 3)) c.set(0xe8e8e4);
        const born: Critter = { ...p, kind: k, seed: this.seed, s: S.scale[0] + this.rnd() * (S.scale[1] - S.scale[0]), c, vig: this.rnd() };
        this.list.push(born);
        // (a sow in the summer with one to three cubs at her heels, her colour or near it)
        if (k === 'blackbear' && mo >= 5 && mo <= 9 && this.rnd() < 0.45) {
          for (let n = 1 + Math.floor(this.rnd() * 2.2); n > 0; n--) {
            const a = this.rnd() * 6.28;
            this.list.push({ ...p, x: p.x + Math.sin(a) * 1.5, z: p.z + Math.cos(a) * 1.5, kind: k, seed: this.seed + n * 7, s: born.s * 0.42, c: c.clone(), vig: this.rnd(), lead: born });
          }
        }
        count[k] = (count[k] ?? 0) + 1;
        roleCount[role] = (roleCount[role] ?? 0) + 1;
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const d = Math.hypot(c.x - wx, c.z - wz);
      const gone = c.dead || d > (WHALES.has(c.kind) ? 1500 : 95) || (!this.enabled) || (this.want(R(c), env) === 0 && d > 30) || (c.state === 'fly' && c.t <= 0) || (c.state === 'skim' && c.t <= 0) || (c.state === 'perch' && c.t <= 0 && d > 18);
      if (gone) { this.list.splice(i, 1); continue; }
      this.step(c, dt, wx, wz, d, env);
    }
    // the water's marks age out
    for (let i = this.fx.length - 1; i >= 0; i--) if ((this.fx[i].t += dt) > this.fx[i].life) this.fx.splice(i, 1);
    this.stats = count;
    this.mo = this.month(env);
    this.draw(wx, wz, env.camFwd);
  }

  private step(c: Critter, dt: number, wx: number, wz: number, d: number, env: CritterEnv) {
    const S = SPEC[c.kind];
    c.t -= dt;
    if (c.yip !== undefined && (c.yip -= dt) <= 0) c.yip = undefined;
    if (c.state !== 'idle') c.sit = false;
    // a neighbour's alarm (a flushing flock, a thumping rabbit) reaches this one a beat later
    if (c.alarm !== undefined && c.alarm > 0 && (c.alarm -= dt) <= 0) {
      c.alarm = undefined;
      if (c.state === 'idle' || c.state === 'move') { this.eco.alarm++; this.startle(c, c.fx ?? wx, c.fz ?? wz, wx, wz, d, env); }
    }
    const basking = c.state === 'perch' && (R(c) === 'basker' || TRUNKERS.has(c.kind) || c.kind === 'annualcicada');
    if ((c.state === 'idle' || c.state === 'move' || c.state === 'stalk' || basking) && !(c.kind === 'blackbear' && c.sit)) { // (a bear stood up to look has seen you: it goes on its own count)
      const th = this.threat(c, wx, wz, d, env);
      if (th && (th.src === 'predator' || th.src === 'raptor')) {
        // a predator: a heartbeat of freezing first — the watchful go at once, the dozy a beat late
        if (c.alarm === undefined) { this.eco[th.src]++; c.alarm = 0.25 + (1 - (c.vig ?? 0.5)) * 0.55; c.fx = th.x; c.fz = th.z; }
      } else if (th) { this.eco[th.src]++; this.startle(c, th.x, th.z, wx, wz, d, env); }
    }
    let speed = 0;
    switch (c.state) {
      case 'idle':
        c.amt = Math.max(0, c.amt - dt * 4);
        if (c.wl !== undefined && R(c) === 'swimmer') { c.y = this.stand(c); if (c.kind === 'seaotter') c.phase += dt * 0.3; } // (afloat; a sea otter drifting)
        if (c.t <= 0 && R(c) === 'predator' && this.rnd() < 0.6) {
          const p = this.quarry(c, 24);
          if (p) { c.state = 'stalk'; c.prey = p; c.t = 14; this.eco.hunts++; break; }
        }
        // (a turkey tom in the spring stops to strut, his fan stood up — a third of the flock are toms; an
        // elk bull in the fall rut throws his head back and bugles)
        if (c.t <= 0 && c.kind === 'wildturkey') c.show = c.seed % 3 === 0 && [3, 4, 5].includes(this.month(env)) && this.rnd() < 0.6;
        if (c.t <= 0 && c.kind === 'elk') c.show = this.horned(c, this.month(env)) && [9, 10].includes(this.month(env)) && this.rnd() < 0.35;
        if (c.show && c.t <= 0) { c.t = 4 + this.rnd() * 5; break; }
        // (a prairie dog or a woodchuck sits up by its hole to look about; now and then a prairie dog
        // leaps up, forepaws flung high: the jump-yip)
        // (a bison drops and rolls in a dust wallow; a bull bellows in the July rut)
        if (c.t <= 0 && c.kind === 'bison' && this.rnd() < 0.12) { c.state = 'wallow'; c.t = 3 + this.rnd() * 2; break; }
        if (c.t <= 0 && c.kind === 'bison') c.show = this.month(env) === 7 && c.seed % 3 === 0 && this.rnd() < 0.3;
        // (a lizard's push-ups: a bob or three on its forelegs, to say whose rock this is)
        if (c.t <= 0 && R(c) === 'lizard' && c.kind !== 'hornedlizard' && this.rnd() < 0.4) { c.yip = 0.6; c.t = 0.7 + this.rnd() * 0.6; break; }
        if (c.t <= 0 && SITTERS.has(c.kind) && c.kind !== 'blackbear') {
          c.sit = this.rnd() < 0.45;
          if (c.sit) { c.t = 2 + this.rnd() * 4; if (c.kind === 'prairiedog' && this.rnd() < 0.3) c.yip = 0.6; break; }
        }
        // (gulls come and go: one at rest lifts off now and then, wheels, and comes down again)
        if (c.t <= 0 && R(c) === 'gull' && c.wl === undefined && this.rnd() < 0.1) { c.state = 'glide'; c.t = 4 + this.rnd() * 8; c.home = { x: c.x, z: c.z }; c.ty = c.y + 4 + this.rnd() * 8; break; }
        if (c.t <= 0) {
          // (a flock keeps together: half the time the next few steps are toward one of its own; a cub
          // always keeps by its mother)
          const flock = c.lead && this.list.includes(c.lead) ? c.lead : FLOCKS.has(R(c)) && this.rnd() < 0.5 ? this.list.find((o) => o !== c && o.kind === c.kind && (o.wl === undefined) === (c.wl === undefined) && Math.hypot(o.x - c.x, o.z - c.z) < 25 && Math.hypot(o.x - c.x, o.z - c.z) > 3) : undefined;
          for (let k = 0; k < 4; k++) {
            // (the small things a step at a time: a crab's, a crawfish's, a slug's, a lizard's scurry)
            const a = this.rnd() * 6.28, r = R(c) === 'wader' ? 0.8 + this.rnd() * 2.5 : R(c) === 'crab' || R(c) === 'crawler' || R(c) === 'lizard' || (R(c) === 'swimmer' && c.wl === undefined) ? 0.3 + this.rnd() * 0.9 : 2 + this.rnd() * (R(c) === 'browser' ? 8 : 5);
            const tx = flock ? flock.x + Math.sin(a) * (1.5 + this.rnd() * 2) : c.x + Math.sin(a) * r, tz = flock ? flock.z + Math.cos(a) * (1.5 + this.rnd() * 2) : c.z + Math.cos(a) * r;
            if (!this.valid(c, tx, tz)) continue;
            if (R(c) === 'shorebird' && !this.shore(tx, tz)) continue;
            c.tx = tx; c.tz = tz; c.state = 'move'; c.t = R(c) === 'crawler' ? 40 : 6; break;
          }
          // (a heron stands frozen a long while between its slow steps; a slug longer)
          if (c.state === 'idle') c.t = R(c) === 'wader' ? 4 + this.rnd() * 9 : R(c) === 'crawler' ? 6 + this.rnd() * 14 : 1 + this.rnd() * 2;
        }
        break;
      case 'move': case 'flee': {
        speed = c.state === 'flee' ? S.flee : S.walk;
        const dx = c.tx - c.x, dz = c.tz - c.z, L = Math.hypot(dx, dz);
        if (L < 0.3 || c.t <= 0) {
          // up the trunk — never higher than where the crown starts (a small street tree's trunk
          // is 2 m; perching 5 m up put squirrels in the sky over it)
          if (c.state === 'flee' && (R(c) === 'climber' || c.kind === 'raccoon' || (c.kind === 'blackbear' && c.lead)) && c.home && L < 0.6) { const top = Math.max(1.2, (c.home.trunk ?? 4) * 0.85); c.state = 'climb'; c.t = 1.4; c.ty = this.ground(c.home.x, c.home.z) + Math.min(top, 1.2 + this.rnd() * Math.max(0.3, top - 1.2)); break; }
          if (c.state === 'flee' && R(c) === 'shorebird' && d < S.fleeR) { c.state = 'fly'; c.t = 3; break; }
          if (c.state === 'flee' && R(c) === 'burrower') { c.dead = true; break; } // down its burrow
          if (c.state === 'flee' && c.kind === 'fiddlercrab') { c.state = 'dive'; c.t = 5 + this.rnd() * 8; break; } // (down its burrow, until you've gone by)
          c.state = 'idle'; c.t = 0.8 + this.rnd() * 3; break;
        }
        const step = Math.min(L, speed * dt);
        const nx = c.x + (dx / L) * step, nz = c.z + (dz / L) * step;
        if (!(c.wl !== undefined || R(c) === 'gull' || R(c) === 'crab' || R(c) === 'crawler' || c.kind === 'pigeon' || c.kind === 'prairiedog' ? this.valid(c, nx, nz) : this.open(nx, nz, 0.15)) && !((R(c) === 'climber' || c.kind === 'raccoon' || c.kind === 'blackbear') && c.state === 'flee')) { c.state = 'idle'; c.t = 0.4; break; }
        c.x = nx; c.z = nz;
        c.yaw = Math.atan2(-dx, -dz) + (c.kind === 'fiddlercrab' ? Math.PI / 2 : 0); // (a crab goes sideways)
        c.y = this.stand(c);
        c.amt = Math.min(c.wl !== undefined && R(c) !== 'wader' ? 0.3 : 1, c.amt + dt * 6); // (a swimmer's paddling feet, under the water)
        // (a swimming beaver, otter or seal draws a wake behind it: small rings left where it's been)
        if (c.wl !== undefined && (c.kind === 'beaver' || R(c) === 'swimmer') && this.rnd() < dt * 1.6) this.ripple(c.x + Math.sin(c.yaw) * 0.5 * c.s, c.wl, c.z + Math.cos(c.yaw) * 0.5 * c.s, 0.3 * c.s);
        c.phase += dt * S.gaitHz * (c.state === 'flee' ? 2.2 : 1);
        break;
      }
      case 'climb':
        c.pitch = Math.min(Math.PI / 2 - 0.1, c.pitch + dt * 4);
        c.y = Math.min(c.ty, c.y + dt * 3.2);
        c.amt = 1; c.phase += dt * 3.5;
        if (c.y >= c.ty) { c.state = 'perch'; c.t = TRUNKERS.has(c.kind) ? 1e6 : 8; c.amt = 0; }
        break;
      case 'perch':
        c.amt = 0;
        c.phase += dt * 0.35; // (an anole's displays, by its own clock)
        // a roosting monarch: on a warm afternoon the clusters burst into flight round the tree, and settle again
        if (c.kind === 'monarch' && c.t <= 0) {
          if (env.hour > 11.5 && env.hour < 15.5 && env.wind < 0.6 && this.rnd() < 0.3) { c.state = 'drift'; c.roll = 0; c.t = 5 + this.rnd() * 12; }
          else c.t = 3 + this.rnd() * 8;
        }
        break;
      case 'slide': {
        // down the bank into the water — an alligator's belly slide, a turtle off its log — then under
        const dx = c.tx - c.x, dz = c.tz - c.z, L = Math.hypot(dx, dz);
        const step = Math.min(L, S.flee * dt);
        if (L > 0.05) { c.x += (dx / L) * step; c.z += (dz / L) * step; c.yaw = Math.atan2(-dx, -dz); }
        c.y = Math.max(this.ground(c.x, c.z), this.level(c.x, c.z) - 0.3);
        c.amt = 1; c.phase += dt * S.gaitHz * 2;
        if (this.terrain.sdfAt(c.x, c.z) < -1.2 || L < 0.1 || c.t <= 0) { c.wl = this.level(c.x, c.z); c.state = 'dive'; c.t = 5 + this.rnd() * 6; c.amt = 0; }
        break;
      }
      case 'fly': {
        // up and away: a songbird's quick dash; the big birds labour off, heavy and slow
        const a = Math.atan2(c.x - (c.fx ?? wx), c.z - (c.fz ?? wz)), big = R(c) !== 'songbird';
        c.x += Math.sin(a) * (big ? 5 : 7) * dt; c.z += Math.cos(a) * (big ? 5 : 7) * dt;
        c.y += (big ? 1.8 : 2.6) * dt; c.yaw = a + Math.PI; c.pitch = big ? 0.12 : 0.2;
        c.amt = big ? 1 : 0.2; c.phase += dt * 3;
        break;
      }
      case 'glide': {
        // a gull wheeling over its beach, a few strokes now and then, then coming down again
        const h = c.home ?? (c.home = { x: c.x, z: c.z });
        const Rg = 9 + (c.seed % 997) / 997 * 8;
        const a = Math.atan2(c.x - h.x, c.z - h.z) + (5 / Rg) * dt;
        c.x = h.x + Math.sin(a) * Rg; c.z = h.z + Math.cos(a) * Rg;
        c.y += (c.ty - c.y) * Math.min(1, dt * 0.8);
        c.yaw = a + Math.PI / 2 + Math.PI; c.roll = 0.28; c.pitch = 0;
        c.phase += dt * 0.5;
        c.amt = Math.sin(c.phase * 6.28 * 0.6) > 0.6 ? 1 : 0.1;
        if (c.t <= 0) {
          let ok = false;
          for (let k = 0; k < 6 && !ok; k++) {
            const la = this.rnd() * 6.28, lr = 3 + this.rnd() * 12, tx = h.x + Math.sin(la) * lr, tz = h.z + Math.cos(la) * lr;
            if (this.gullGround(tx, tz, c.kind)) (c.tx = tx), (c.tz = tz), (ok = true);
          }
          if (ok) (c.state = 'alight'), (c.t = 12), (c.roll = 0);
          else c.t = 4; // (round again)
        }
        break;
      }
      case 'alight': {
        const gy = this.ground(c.tx, c.tz), dx = c.tx - c.x, dz = c.tz - c.z, dy = gy - c.y, L = Math.hypot(dx, dy, dz) || 1;
        if (L < 0.4 || c.t <= 0) { c.x = c.tx; c.z = c.tz; c.y = gy; c.state = 'idle'; c.t = 1 + this.rnd() * 3; c.pitch = 0; c.amt = 0; break; }
        const step = Math.min(L, 4 * dt);
        c.x += dx / L * step; c.y += dy / L * step; c.z += dz / L * step;
        c.yaw = Math.atan2(-dx, -dz); c.pitch = -0.15; c.amt = L < 3 ? 1 : 0.2; // (wings working as it lands)
        break;
      }
      case 'skim': {
        // pelicans in a line, a metre or two off the waves on still wings, a few strokes now and then
        c.x -= Math.sin(c.yaw) * S.walk * dt; c.z -= Math.cos(c.yaw) * S.walk * dt;
        c.phase += dt * 0.4;
        c.y = c.ty + Math.sin(c.phase * 3.1) * 0.25;
        c.amt = Math.sin(c.phase * 6.28 * 0.45) > 0.8 ? 1 : 0;
        c.pitch = 0; c.roll = 0;
        break;
      }
      case 'hover': {
        // an osprey hanging on quick beats over the water, head down, looking
        c.amt = 1; c.pitch = 0.45; c.roll = 0; c.phase += dt;
        if (c.t <= 0) {
          if (this.rnd() < 0.6) { c.state = 'plunge'; c.t = 5; c.tx = c.x + Math.sin(c.yaw + Math.PI) * 4; c.tz = c.z + Math.cos(c.yaw + Math.PI) * 4; }
          else { c.state = 'soar'; c.t = 6 + this.rnd() * 6; }
        }
        break;
      }
      case 'plunge': {
        // …and down, wings folded back, feet first into the water; then labouring up with its fish
        const wl = c.wl ?? this.level(c.tx, c.tz);
        const dx = c.tx - c.x, dz = c.tz - c.z, dy = wl + 0.2 - c.y, L = Math.hypot(dx, dy, dz) || 1;
        if (L < 0.6 || c.t <= 0) {
          this.eco.caught++;
          const pan = Math.max(-1, Math.min(1, ((c.x - wx) * env.camFwd.z - (c.z - wz) * env.camFwd.x) / Math.max(1, d)));
          if (d < 60) this.onEvent?.('splash', 'flush', pan, d);
          c.state = 'rise'; break;
        }
        const step = Math.min(L, S.flee * dt);
        c.x += dx / L * step; c.y += dy / L * step; c.z += dz / L * step;
        c.yaw = Math.atan2(-dx, -dz); c.pitch = -1.0; c.amt = -1;
        break;
      }
      case 'wallow': {
        // over on its side in the dust and back, legs working
        c.roll = Math.sin((c.t / 4) * Math.PI * 3) * 1.25; c.amt = 0.6; c.phase += dt * 2;
        if (c.t <= 0) { c.roll = 0; c.state = 'idle'; c.t = 2; }
        break;
      }
      case 'possum': {
        // an opossum playing dead on its side, stock-still; then up, and off at an amble
        c.amt = 0; c.roll = 1.45;
        if (c.t <= 0) { c.roll = 0; c.state = 'move'; c.t = 8; const a = Math.atan2(c.x - (c.fx ?? wx), c.z - (c.fz ?? wz)); c.tx = c.x + Math.sin(a) * 15; c.tz = c.z + Math.cos(a) * 15; }
        break;
      }
      case 'warn': {
        // a skunk's warning: facing you, tail stood up, stamping its forefeet; then it waddles off
        c.yaw = Math.atan2(c.x - wx, c.z - wz);
        if (c.kind === 'crawfish') {
          // a crawfish's: claws up, facing you, backing off a step at a time
          const nx = c.x + Math.sin(c.yaw) * 0.15 * dt, nz = c.z + Math.cos(c.yaw) * 0.15 * dt;
          if (this.valid(c, nx, nz)) { c.x = nx; c.z = nz; c.y = this.ground(nx, nz); }
          c.phase += dt * 2; c.amt = 0.4;
          if (c.t <= 0) { c.state = 'idle'; c.t = 2 + this.rnd() * 3; c.amt = 0; }
          break;
        }
        c.phase += dt * 3; c.amt = Math.sin(c.phase * 6.28) > 0.3 ? 0.6 : 0;
        if (c.t <= 0) { c.state = 'flee'; c.t = 4; const a = Math.atan2(c.x - wx, c.z - wz) + (this.rnd() - 0.5); c.tx = c.x + Math.sin(a) * 12; c.tz = c.z + Math.cos(a) * 12; }
        break;
      }
      case 'dive': {
        // a fiddler down its burrow: up again once you've gone by
        if (R(c) === 'crab') { if (c.t <= 0) { if (d > 8) { c.state = 'idle'; c.t = 1 + this.rnd() * 3; } else c.t = 1; } break; }
        // a loon gone under: it swims off below and comes up again well away
        const a = Math.atan2(c.x - (c.fx ?? wx), c.z - (c.fz ?? wz));
        const nx = c.x + Math.sin(a) * 2.2 * dt, nz = c.z + Math.cos(a) * 2.2 * dt;
        if (this.valid(c, nx, nz)) (c.x = nx), (c.z = nz);
        if (c.t <= 0) { c.state = 'idle'; c.t = 2 + this.rnd() * 3; c.y = this.stand(c); }
        break;
      }
      case 'stalk': case 'pounce': {
        // the fox: a slow low creep, then a sprint and a leap for the last few metres
        const p = c.prey;
        if (!p || p.dead || !this.grounded(p) || c.t <= 0 || !this.list.includes(p)) { c.prey = undefined; c.state = 'idle'; c.t = 1 + this.rnd() * 3; break; }
        const dx = p.x - c.x, dz = p.z - c.z, L = Math.hypot(dx, dz);
        if (c.state === 'stalk' && L < 5) { c.state = 'pounce'; c.t = 1.6; }
        if (c.state === 'pounce' && L < 0.5) { this.take(c, p); c.state = 'move'; c.t = 8; const a = this.rnd() * 6.28; c.tx = c.x + Math.sin(a) * 30; c.tz = c.z + Math.cos(a) * 30; break; }
        speed = c.state === 'pounce' ? S.flee * 1.15 : S.walk * 0.5;
        const step = Math.min(L, speed * dt);
        const nx = c.x + (dx / L) * step, nz = c.z + (dz / L) * step;
        if (!this.open(nx, nz, 0.15)) { c.prey = undefined; c.state = 'idle'; c.t = 1; break; }
        c.x = nx; c.z = nz; c.y = this.ground(c.x, c.z);
        c.yaw = Math.atan2(-dx, -dz);
        c.amt = c.state === 'pounce' ? 1 : 0.45;
        c.phase += dt * S.gaitHz * (c.state === 'pounce' ? 2.4 : 0.6);
        c.pitch = c.state === 'pounce' && L < 1.6 ? 0.25 : 0; // the leap
        break;
      }
      case 'soar': {
        // wide circles over the thermal, a few wingbeats now and then; sometimes a stoop
        // (a vulture's kettle wider and teetering, rarely a wingbeat; an eagle's wide flat circles; an
        // osprey's tighter, low over the water, stopping to hover)
        const h = c.home!, vult = c.kind === 'turkeyvulture';
        const R = (vult ? 20 : c.kind === 'baldeagle' ? 26 : c.kind === 'osprey' ? 13 : 16) + (c.seed % 997) / 997 * 14;
        const a = Math.atan2(c.x - h.x, c.z - h.z) + (S.walk / R) * dt;
        c.x = h.x + Math.sin(a) * R; c.z = h.z + Math.cos(a) * R;
        c.y += (c.ty - c.y) * Math.min(1, dt * 0.5);
        c.phase += dt * 0.37;
        c.yaw = a + Math.PI / 2 + Math.PI; c.roll = vult ? 0.3 + Math.sin(c.phase * 9 + c.seed) * 0.16 : 0.32; c.pitch = 0;
        c.amt = Math.sin(c.phase * 6.28 * 0.8) > (vult ? 0.97 : 0.75) ? 1 : 0;
        if (c.t <= 0) {
          c.t = 6 + this.rnd() * 8;
          if (c.kind === 'osprey' && this.terrain.sdfAt(c.x, c.z) < -4 && this.rnd() < 0.5) { c.state = 'hover'; c.t = 2.5 + this.rnd() * 3; c.wl = this.level(c.x, c.z); break; }
          const p = STOOPS.has(c.kind) && this.rnd() < 0.45 ? this.quarry(c, 50) : null;
          if (p) { c.state = 'stoop'; c.prey = p; c.t = 6; this.eco.hunts++; }
        }
        break;
      }
      case 'stoop': {
        const p = c.prey;
        if (!p || p.dead || c.t <= 0) { c.prey = undefined; c.state = 'rise'; break; }
        const dx = p.x - c.x, dy = p.y + 0.15 - c.y, dz = p.z - c.z, L = Math.hypot(dx, dy, dz) || 1;
        if (L < 0.9) {
          if (this.grounded(p) && this.list.includes(p)) this.take(c, p);
          c.prey = undefined; c.state = 'rise'; break;
        }
        const step = Math.min(L, S.flee * dt);
        c.x += dx / L * step; c.y += dy / L * step; c.z += dz / L * step;
        c.y = Math.max(c.y, this.ground(c.x, c.z) + 0.3);
        c.yaw = Math.atan2(-dx, -dz); c.roll = 0;
        c.pitch = -Math.atan2(-dy, Math.hypot(dx, dz)) * 0.9;
        c.amt = -1; // wings folded
        break;
      }
      case 'rise': {
        // labouring back up to the thermal
        const h = c.home!;
        const dx = h.x - c.x, dz = h.z - c.z, L = Math.hypot(dx, dz) || 1;
        c.x += dx / L * Math.min(L, 5 * dt); c.z += dz / L * Math.min(L, 5 * dt);
        c.y += 3.2 * dt;
        c.yaw = Math.atan2(-dx, -dz); c.pitch = 0.25; c.roll = 0;
        c.amt = 1; c.phase += dt * 1.1;
        if (c.y >= c.ty - 2) { c.state = 'soar'; c.t = 8 + this.rnd() * 8; }
        break;
      }
      case 'drift': {
        // butterflies and fireflies wander on smooth random curves near the ground
        const tt = performance.now() / 1000 + c.phase * 50;
        const fx = Math.sin(tt * 0.7 + c.phase * 9) + Math.sin(tt * 1.9) * 0.4, fz = Math.cos(tt * 0.6 + c.phase * 5) + Math.cos(tt * 1.7) * 0.4;
        const roost = c.kind === 'monarch' && c.home, back = roost && c.t <= 0, mig = c.kind === 'monarch' && !roost && this.migrating;
        let vx = back ? 0 : fx * S.walk * (mig ? 0.35 : 1), vz = back ? 0 : fz * S.walk * (mig ? 0.35 : 1);
        if (mig) { vx += MIG[0] * 2.2; vz += MIG[1] * 2.2; } // (streaming south, high and steady)
        c.x += vx * dt; c.z += vz * dt;
        const base = this.ground(c.x, c.z);
        let target = base + (R(c) === 'butterfly' ? 0.7 + 0.5 * Math.sin(tt * 1.3 + c.phase) : 0.8 + 0.8 * Math.sin(tt * 0.5 + c.phase * 7));
        if (c.kind === 'monarch') c.amt = Math.sin(tt * 2.1 + c.seed) > 0.15 ? -1 : 1; // (a few deep beats, then a sail)
        if (mig) target = base + 3 + 1.5 * Math.sin(tt * 0.4 + c.phase * 3);
        if (roost) {
          // round its roost tree, then back to its place in the cluster
          const gx = (back ? c.tx : c.home!.x) - c.x, gz = (back ? c.tz : c.home!.z) - c.z, k = Math.min(1, dt * (back ? 2.5 : 0.35));
          c.x += gx * k; c.z += gz * k;
          target = back ? c.ty : c.ty + 0.5 + 1.2 * (0.5 + 0.5 * Math.sin(tt * 0.9 + c.phase * 5));
          if (back) { vx = gx; vz = gz; }
          if (back && Math.hypot(gx, gz) < 0.2 && Math.abs(c.y - c.ty) < 0.2) { c.x = c.tx; c.z = c.tz; c.y = c.ty; c.state = 'perch'; c.roll = Math.PI; c.amt = 0; c.t = 6 + this.rnd() * 10; break; }
        }
        c.y += (target - c.y) * Math.min(1, dt * (back ? 4 : 2));
        if (Math.hypot(vx, vz) > 1e-4) c.yaw = Math.atan2(-vx, -vz);
        if (Math.hypot(c.x - wx, c.z - wz) > 40 && !env.gardens(c.x, c.z, 25).length && R(c) === 'butterfly' && !mig) c.t = Math.min(c.t, 0);
        break;
      }
      case 'cruise': {
        const wl = c.wl ?? 0;
        if (c.kind === 'shoal') {
          // a school milling just under the surface, turning together now and then, away from the shallows' edge
          const tt = performance.now() / 1000 + c.phase * 40;
          c.yaw += Math.sin(tt * 0.3 + c.phase * 9) * 0.35 * dt;
          const nx = c.x - Math.sin(c.yaw) * S.walk * dt, nz = c.z - Math.cos(c.yaw) * S.walk * dt, s1 = this.terrain.sdfAt(nx, nz);
          if (s1 < -1.2 && s1 > -45) (c.x = nx), (c.z = nz);
          else c.yaw += Math.PI * 0.6;
          c.y = wl + 0.015; c.amt = 0.6; c.phase += dt;
          break;
        }
        // a fish under the surface (not drawn: unseen), cruising; now and then up to the top — a rise and its
        // ring, a roll — or out of it in a leap
        const dx = c.tx - c.x, dz = c.tz - c.z, L = Math.hypot(dx, dz);
        if (L < 0.4) {
          for (let k = 0; k < 4; k++) {
            const a = this.rnd() * 6.28, r = 1 + this.rnd() * 4, tx = c.x + Math.sin(a) * r, tz = c.z + Math.cos(a) * r;
            if (this.terrain.sdfAt(tx, tz) < -1.2) { c.tx = tx; c.tz = tz; break; }
          }
        } else {
          const st = Math.min(L, S.walk * dt);
          c.x += (dx / L) * st; c.z += (dz / L) * st; c.yaw = Math.atan2(-dx, -dz);
        }
        c.y = wl - 0.6; c.pitch = 0; c.amt = 0.4; c.phase += dt * S.gaitHz;
        if (c.t <= 0) {
          const [p] = LEAP[c.kind] ?? [0, 0];
          if (this.rnd() < (c.kind === 'silvercarp' && d < 18 ? 0.95 : p)) { c.state = 'leap'; c.t = c.kind === 'tarpon' ? 1.3 : 0.9; c.stage = 0; }
          else { c.state = 'sip'; c.t = c.kind === 'tarpon' ? 1.8 : 0.7; this.ripple(c.x, wl, c.z, 0.35 * c.s); }
        }
        break;
      }
      case 'leap': {
        // out of the water in an arc, nose up and then down, and back in with a splash and a ring
        const wl = c.wl ?? 0, T0 = c.kind === 'tarpon' ? 1.3 : 0.9, u = Math.min(1, 1 - c.t / T0), h = (LEAP[c.kind]?.[1] ?? 0.6) * c.s;
        if (c.stage === 0) { c.stage = 1; this.ripple(c.x, wl, c.z, 0.3 * c.s); }
        c.x -= Math.sin(c.yaw) * 2.2 * dt; c.z -= Math.cos(c.yaw) * 2.2 * dt;
        c.y = wl - 0.3 + (h + 0.3) * 4 * u * (1 - u);
        c.pitch = (0.5 - u) * 1.8; c.amt = 1; c.phase += dt * 4;
        if (c.t <= 0) {
          this.ripple(c.x, wl, c.z, 0.5 * c.s); this.spout(c.x, wl, c.z, 0.35 * c.s, 0.7);
          if (d < 45) this.onEvent?.('splash', 'flush', Math.max(-1, Math.min(1, ((c.x - wx) * env.camFwd.z - (c.z - wz) * env.camFwd.x) / Math.max(1, d))), d);
          c.state = 'cruise'; c.t = 3 + this.rnd() * 9; c.pitch = 0;
        }
        break;
      }
      case 'sip': {
        // up to the top: a trout's nose taking a fly, a bass's mouth, a tarpon's back and fin rolling over
        const wl = c.wl ?? 0, H = (BODY_DEPTH[c.kind] ?? 0.1) * c.s, roll = c.kind === 'tarpon';
        c.y += (wl - H * (roll ? 0.55 : 0.8) - c.y) * Math.min(1, dt * 6);
        c.pitch = roll ? -0.2 : 0.35; c.amt = 0.6; c.phase += dt * 3;
        if (c.t <= 0) { c.state = 'cruise'; c.t = 4 + this.rnd() * 10; c.pitch = 0; }
        break;
      }
      case 'porpoise': {
        // a pod travelling beyond the breakers: under, then up and over in an arc — the back and the fin
        // rolling over the surface — and under again; now and then one breaches clear of the water
        const wl = c.wl ?? 0, H = (BODY_DEPTH[c.kind] ?? 0.5) * c.s, arc = c.kind === 'orca' ? 2.2 : c.kind === 'porpoise' ? 1.0 : 1.3;
        const nx = c.x - Math.sin(c.yaw) * S.walk * dt, nz = c.z - Math.cos(c.yaw) * S.walk * dt;
        if (this.terrain.sdfAt(nx, nz) < -8 && this.terrain.oceanDistAt(nx, nz) < 6) (c.x = nx), (c.z = nz);
        else c.yaw += Math.PI * 0.8 * dt * 2; // (turning off the shallows)
        c.amt = 1; c.phase += dt * S.gaitHz;
        if (c.stage === 0) {
          c.y = wl - H * 2.6; c.pitch = 0;
          if (c.t <= 0) { const breach = this.rnd() < (c.kind === 'orca' ? 0.14 : c.kind === 'dolphin' ? 0.1 : 0); c.stage = breach ? 2 : 1; c.t = breach ? 1.8 : arc; }
        } else {
          const T0 = c.stage === 2 ? 1.8 : arc, u = Math.min(1, 1 - c.t / T0);
          if (c.stage === 1) { c.y = wl - H * 1.15 + H * Math.sin(Math.PI * u); c.pitch = (0.5 - u) * 0.8; }
          else { const len = H / 0.21; c.y = wl - H + len * 0.55 * 4 * u * (1 - u); c.pitch = (0.6 - u) * 2.0; }
          if (c.t <= 0) {
            if (c.stage === 2) { this.ripple(c.x, wl, c.z, H * 2.5); this.spout(c.x, wl, c.z, H * 2.2, 1.2); if (d < 120) this.onEvent?.('splash', 'flush', 0, d); }
            c.stage = 0; c.t = c.kind === 'orca' ? 4 + this.rnd() * 5 : 2 + this.rnd() * 4;
          }
        }
        break;
      }
      case 'surface': {
        // a whale offshore: long under; then up, its back out, blowing two or three times; then sounding —
        // head down, its back arched, its flukes lifting clear — and under again
        const wl = c.wl ?? 0, H = (BODY_DEPTH[c.kind] ?? 3) * c.s, len = H / 0.25;
        const nx = c.x - Math.sin(c.yaw) * S.walk * dt, nz = c.z - Math.cos(c.yaw) * S.walk * dt;
        if (this.terrain.sdfAt(nx, nz) < -120) (c.x = nx), (c.z = nz);
        else c.yaw += 0.5 * dt;
        c.amt = 0.5; c.phase += dt * S.gaitHz;
        if (c.stage === 0) {
          c.y = wl - H * 3; c.pitch = 0;
          if (c.t <= 0) { c.stage = 1; c.t = 7; }
        } else if (c.stage === 1) {
          c.y += (wl - H * 0.62 - c.y) * Math.min(1, dt * 1.5); c.pitch = 0;
          for (const at of [6.2, 4.0, 1.8]) if (c.t + dt > at && c.t <= at) this.spout(c.x - Math.sin(c.yaw) * len * 0.32, wl, c.z - Math.cos(c.yaw) * len * 0.32, H * 1.5);
          if (c.t <= 0) { c.stage = 2; c.t = 3.2; }
        } else {
          const u = Math.min(1, 1 - c.t / 3.2);
          c.pitch = -1.15 * Math.min(1, u * 1.6); c.y = wl - H * 0.62 - u * H * 1.2;
          if (c.t <= 0) { c.stage = 0; c.t = 15 + this.rnd() * 20; c.pitch = 0; }
        }
        break;
      }
      case 'patrol': {
        // a darner on its beat: along the water's edge and back at head height, hanging still a moment at
        // each end, darting off and turning on a dime; now and then aside after a midge
        const h = c.home ?? (c.home = { x: c.x, z: c.z });
        const dx = c.tx - c.x, dz = c.tz - c.z, dy = c.ty - c.y, L = Math.hypot(dx, dy, dz);
        c.phase += dt; c.amt = 1; c.pitch = 0;
        if (L > 0.12) {
          const step = Math.min(L, S.walk * dt * (L < 1 ? 0.6 : 1));
          c.x += (dx / L) * step; c.y += (dy / L) * step; c.z += (dz / L) * step;
          if (Math.hypot(dx, dz) > 0.05) c.yaw = Math.atan2(-dx, -dz);
          if (L - step <= 0.12) c.t = 0.4 + this.rnd() * 1.6; // (there: it hangs a moment)
        } else {
          c.x += Math.sin(c.phase * 9 + c.seed) * 0.03 * dt; c.y += Math.sin(c.phase * 7) * 0.02 * dt; // (a quiver in the hover)
          if (c.t <= 0) {
            const b = c.beat ?? 0, end = Math.sign(Math.sin(b) * (c.x - h.x) + Math.cos(b) * (c.z - h.z)) || 1, aside = this.rnd() < 0.3;
            const along = -end * (3 + this.rnd() * 4), off = (this.rnd() - 0.5) * (aside ? 5 : 1.2);
            c.tx = h.x + Math.sin(b) * along + Math.cos(b) * off; c.tz = h.z + Math.cos(b) * along - Math.sin(b) * off;
            c.ty = this.airBase(c.tx, c.tz) + 0.8 + this.rnd() * 1.4;
          }
        }
        break;
      }
    }
  }

  /** Grounded animals are the only ones a fox or hawk can take (and the only ones that feel a stalk). */
  private grounded(c: Critter) { return !c.dead && (c.state === 'idle' || c.state === 'move' || c.state === 'flee'); }

  private quarry(h: Critter, r: number) {
    const roles = PREY[R(h)] ?? [];
    let best: Critter | undefined, bd = r;
    for (const o of this.list) {
      if (o === h || !roles.includes(R(o)) || !this.grounded(o)) continue;
      const dd = Math.hypot(o.x - h.x, o.z - h.z);
      if (dd < bd) { bd = dd; best = o; }
    }
    return best;
  }

  private take(h: Critter, p: Critter) {
    p.dead = true;
    this.eco.caught++;
    h.prey = undefined;
  }

  /** The nearest thing this animal minds right now, or null. */
  private threat(c: Critter, wx: number, wz: number, d: number, env: CritterEnv): { x: number; z: number; src: 'walker' | 'car' | 'predator' | 'raptor' } | null {
    const S = SPEC[c.kind];
    if (!S.fleeR) return null;
    if (d < S.fleeR) return { x: wx, z: wz, src: 'walker' };
    // traffic: the faster it comes, the sooner they go (a deer at the verge bolts at ~30 m)
    for (const m of env.movers ?? []) {
      const sp = Math.hypot(m.vx, m.vz);
      if (sp < 2) continue;
      const dx = c.x - m.x, dz = c.z - m.z, dd = Math.hypot(dx, dz);
      const r = Math.min(32, S.fleeR * 0.7 + sp * 0.9);
      if (dd < r && (dx * m.vx + dz * m.vz > -2 * sp || dd < r * 0.4)) return { x: m.x, z: m.z, src: 'car' };
    }
    if (!HUNTED.has(R(c))) return null;
    for (const o of this.list) {
      if (o.dead) continue;
      if (R(o) === 'predator') {
        const dd = Math.hypot(o.x - c.x, o.z - c.z);
        // a creeping fox is seen late (by the watchful ones); a trotting or sprinting one early
        const r = o.state === 'stalk' ? S.fleeR * (0.3 + 0.55 * (c.vig ?? 0.5)) : S.fleeR * 1.3;
        if (dd < r) return { x: o.x, z: o.z, src: 'predator' };
      } else if (R(o) === 'raptor' && o.state === 'stoop') {
        if (Math.hypot(o.x - c.x, o.z - c.z) < 12 + (c.vig ?? 0.5) * 8 && o.y - c.y < 18) return { x: o.x, z: o.z, src: 'raptor' };
      }
    }
    return null;
  }

  /** Flee / flush / climb away from (fx, fz); the alarm spreads to neighbours. */
  private startle(c: Critter, fx: number, fz: number, wx: number, wz: number, d: number, env: CritterEnv) {
    c.fx = fx; c.fz = fz; c.prey = undefined;
    const pan = Math.max(-1, Math.min(1, ((c.x - wx) * env.camFwd.z - (c.z - wz) * env.camFwd.x) / Math.max(1, d)));
    const heard = d < 45;
    const role = R(c);
    if (role === 'songbird') { c.state = 'fly'; c.t = 3.5; if (heard) this.onEvent?.(this.sound(c), 'flush', pan, d); }
    else if (c.kind === 'loon') { c.state = 'dive'; c.t = 5 + this.rnd() * 5; } // (it slips under)
    else if (c.kind === 'hornedlizard') { c.state = 'idle'; c.t = 3 + this.rnd() * 3; } // (it sits tight, trusting its colours)
    else if (TRUNKERS.has(c.kind) && c.home) { c.state = 'climb'; c.t = 1; c.ty = Math.min(this.ground(c.home.x, c.home.z) + Math.max(1, (c.home.trunk ?? 3) * 0.9), c.y + 0.6 + this.rnd() * 0.8); } // (round the trunk and up)
    else if ((role === 'basker' || role === 'swimmer') && c.wl !== undefined) { c.state = 'dive'; c.t = 6 + this.rnd() * 6; } // (it sinks without a ripple)
    else if (role === 'basker' || role === 'swimmer') {
      // off the bank or the log, down into the water (a seal humping down the beach, an otter's slide)
      const T = this.terrain, gx = T.sdfAt(c.x + 1, c.z) - T.sdfAt(c.x - 1, c.z), gz = T.sdfAt(c.x, c.z + 1) - T.sdfAt(c.x, c.z - 1), L = Math.hypot(gx, gz) || 1;
      c.state = 'slide'; c.t = 4; c.tx = c.x - (gx / L) * 6; c.tz = c.z - (gz / L) * 6;
      if (heard) this.onEvent?.('splash', 'flush', pan, d);
    }
    else if (c.kind === 'beaver' && c.wl !== undefined) { c.state = 'dive'; c.t = 6 + this.rnd() * 6; this.ripple(c.x, c.wl, c.z, 0.6); this.spout(c.x, c.wl, c.z, 0.5, 0.6); if (heard) this.onEvent?.('splash', 'flush', pan, d); } // (a slap of the tail, a burst of spray, and under)
    else if (c.kind === 'opossum' && d < SPEC.opossum.fleeR * 0.6) { c.state = 'possum'; c.t = 10 + this.rnd() * 6; }
    else if (c.kind === 'skunk') { c.state = 'warn'; c.t = 2.2 + this.rnd(); }
    else if (c.kind === 'annualcicada') { c.state = 'fly'; c.t = 3; c.home = undefined; if (heard) this.onEvent?.(this.sound(c), 'flush', pan, d); } // (it buzzes off)
    else if (c.kind === 'crawfish') { c.state = 'warn'; c.t = 2.5 + this.rnd() * 2; } // (claws up: it stands its ground, backing off)
    else if (c.kind === 'fiddlercrab') {
      // a dash sideways to its burrow, and down (the flat's others a beat after)
      const a = Math.atan2(c.x - fx, c.z - fz) + (this.rnd() - 0.5) * 2, r = 0.3 + this.rnd() * 0.6;
      c.state = 'flee'; c.t = 0.8; c.tx = c.x + Math.sin(a) * r; c.tz = c.z + Math.cos(a) * r;
    }
    else if (c.kind === 'raccoon' && (c.home = env.trees(c.x, c.z, 12)[0]) !== undefined) { c.state = 'flee'; c.tx = c.home.x; c.tz = c.home.z; c.t = 5; } // (up the nearest tree)
    else if (c.kind === 'blackbear' && c.lead && (c.home = env.trees(c.x, c.z, 15)[0]) !== undefined) { c.state = 'flee'; c.tx = c.home.x; c.tz = c.home.z; c.t = 6; } // (a cub up a tree)
    else if (c.kind === 'blackbear' && !c.sit && (Math.imul(c.seed, 2654435761) >>> 0) % 100 < 65 && d > SPEC.blackbear.fleeR * 0.4) { c.state = 'idle'; c.sit = true; c.t = 2.6; c.alarm = 2.2; c.fx = fx; c.fz = fz; } // (it stands up to look, then goes — most bears do, by their temperament; the rest just go)
    else if (role === 'gull' && c.wl === undefined) { c.state = 'glide'; c.t = 5 + this.rnd() * 6; c.home = { x: c.x, z: c.z }; c.ty = this.ground(c.x, c.z) + 5 + this.rnd() * 6; if (heard) this.onEvent?.(this.sound(c), 'flush', pan, d); }
    else if (role === 'wader' || ((role === 'waterfowl' || role === 'gull' || role === 'fowl') && d < SPEC[c.kind].fleeR * 0.45)) {
      // the big birds: a heron off at once, heavy; geese, ducks, turkeys and cranes only when pressed
      c.state = 'fly'; c.t = 6; c.wl = undefined; if (heard) this.onEvent?.(this.sound(c), 'flush', pan, d);
    }
    else if (role === 'climber' && c.home && Math.hypot(c.home.x - c.x, c.home.z - c.z) < 14) { c.state = 'flee'; c.tx = c.home.x; c.tz = c.home.z; c.t = 4; if (heard) this.onEvent?.(this.sound(c), 'flee', pan, d); }
    else {
      if (c.kind === 'armadillo') c.yip = 0.5; // (it jumps straight up, then runs)
      c.sit = false;
      c.state = 'flee';
      c.t = role === 'browser' || role === 'predator' || role === 'herd' ? 6 : role === 'waterfowl' || role === 'fowl' ? 3 : 1.6;
      // a burrower dashes a few metres to its hole; a herd runs a long way; everything else runs well clear
      const run = role === 'burrower' ? 4 + this.rnd() * 4 : role === 'lizard' ? 2 + this.rnd() * 3 : role === 'herd' ? 70 : 40; // (a lizard's dash to cover)
      const a = Math.atan2(c.x - fx, c.z - fz) + (this.rnd() - 0.5) * 0.9;
      c.tx = c.x + Math.sin(a) * run; c.tz = c.z + Math.cos(a) * run;
      if (heard && (role === 'shorebird' || role === 'browser' || role === 'burrower')) this.onEvent?.(this.sound(c), role === 'shorebird' ? 'flush' : 'flee', pan, d);
    }
    // contagion: the same kind within ~10 m follows a beat later; other small prey within 5 m hear it too
    for (const o of this.list) {
      if (o === c || o.dead || o.alarm !== undefined || !(o.state === 'idle' || o.state === 'move')) continue;
      const dd = Math.hypot(o.x - c.x, o.z - c.z);
      if ((o.kind === c.kind && dd < (role === 'herd' ? 30 : 10)) || (HUNTED.has(R(o)) && HUNTED.has(role) && dd < 5)) { o.alarm = 0.12 + this.rnd() * 0.4 + dd * 0.03; o.fx = fx; o.fz = fz; }
    }
  }

  /** Animals drawn last frame, and those left out behind the walker (for the review harness and tests). */
  readonly drawn = { shown: 0, behind: 0 };
  private mo = 6;
  private draw(wx: number, wz: number, fwd: THREE.Vector3) {
    const per = new Map<CritterKind, number>();
    // (looking about level, an animal well behind the walker isn't drawn — its vertices cost nothing;
    // looking down from the air, all of them are)
    const fl = Math.hypot(fwd.x, fwd.z), level = fl > 0.6;
    this.drawn.shown = this.drawn.behind = 0;
    for (const c of this.list) {
      const M = this.meshes.get(c.kind)!;
      if (c.state === 'dive') continue; // (under the water)
      // (a fish cruising under the surface, a pod or a whale deep between its breaths: unseen, so not drawn)
      if ((c.state === 'cruise' && c.kind !== 'shoal') || ((c.state === 'porpoise' || c.state === 'surface') && c.stage === 0)) continue;
      if (level) {
        const dx = c.x - wx, dz = c.z - wz, d = Math.hypot(dx, dz);
        if (d > 8 && (dx * fwd.x + dz * fwd.z) / (d * fl) < -0.25) { this.drawn.behind++; continue; }
      }
      this.drawn.shown++;
      const i = per.get(c.kind) ?? 0;
      if (i >= M.m.instanceMatrix.count) continue;
      per.set(c.kind, i + 1);
      // climbing / perched squirrels face up the trunk, feet on the bark: the trunk's surface at
      // that height (it tapers, and leans with the tree)
      let x = c.x, z = c.z;
      if ((c.state === 'climb' || c.state === 'perch') && c.home && c.kind !== 'monarch') { // (a roost's monarchs hang from its crown)
        const dx = c.x - c.home.x, dz = c.z - c.home.z, L = Math.hypot(dx, dz) || 1;
        const up = Math.max(0, c.y - this.ground(c.home.x, c.home.z)), [lx, lz] = c.home.lean ?? [0, 0];
        const r = (c.home.r ?? 0.25) * Math.max(0.55, 1 - 0.1 * up) + 0.02;
        x = c.home.x + lx * up + (dx / L) * r; z = c.home.z + lz * up + (dz / L) * r;
        c.yaw = Math.atan2(dx, dz);
      }
      // sitting up: the body tipped back about its hind feet (the hind foot kept where it stood); a
      // jump-yip lifts it off the ground; an opossum playing dead lies on its side, not through the ground
      let pitch = c.pitch, y = c.y;
      if (c.sit && c.state === 'idle') {
        const th = 1.15, zp = sitPivot(c.kind) * c.s;
        pitch = th;
        y += zp * Math.sin(th);
        x += Math.sin(c.yaw) * zp * (1 - Math.cos(th)); z += Math.cos(c.yaw) * zp * (1 - Math.cos(th));
      }
      if (c.yip !== undefined) y += Math.sin(Math.PI * Math.min(1, 1 - c.yip / 0.6)) * (c.kind === 'armadillo' ? 0.35 : R(c) === 'lizard' ? 0.012 : 0.12) * c.s;
      if (c.kind === 'collaredlizard' && c.state === 'flee') pitch = 0.55; // (it runs up on its hind legs)
      if (c.state === 'possum') y += 0.11 * c.s;
      this.e.set(pitch, c.yaw, c.roll ?? 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.mat4.compose(this.v.set(x, y, z), this.q, this.sv.setScalar(c.s));
      M.m.setMatrixAt(i, this.mat4);
      M.m.setColorAt(i, c.c);
      const role = R(c);
      const air = c.state === 'fly' || c.state === 'glide' || c.state === 'alight' || c.state === 'skim';
      const pose = role === 'firefly' ? 3 : air || (role === 'butterfly' && c.state !== 'perch') || role === 'raptor' || c.state === 'patrol' ? 2 : (c.show && c.state === 'idle') || c.state === 'warn' ? 4 : c.amt !== 0 ? 1 : 0;
      // (+10: wearing its antlers or horns, a fiddler's great claw, a crawfish's — or an anole flashing its
      // throat fan, a slug's tentacles out while nothing's close)
      const shown = this.horned(c, this.mo) || (ANOLES.has(c.kind) && c.state === 'perch' && Math.sin(c.phase * 6.28 + (c.seed % 7)) > 0.7) || (c.kind === 'bananaslug' && Math.hypot(c.x - wx, c.z - wz) > 1.6);
      M.anim.setXYZ(i, c.phase, c.amt, pose + (shown ? 10 : 0));
    }
    // the water's marks: a ring spreading and thinning; a blow rising, hanging and sinking away
    const nfx = [0, 0];
    for (const f of this.fx) {
      const M = this.fxMesh[f.k], i = nfx[f.k]++, u = f.t / f.life;
      const sc = f.k === 0 ? f.s * (0.3 + 1.7 * u) : f.s * (u < 0.25 ? 0.3 + 2.8 * u : 1 - (u - 0.25) * 0.5);
      this.v.set(f.x, f.y - (f.k === 1 && u > 0.6 ? (u - 0.6) * f.s * 0.6 : 0), f.z);
      this.mat4.compose(this.v, this.q.identity(), this.sv.set(sc, f.k === 0 ? 1 : sc * (f.k === 1 && u > 0.6 ? 1 - (u - 0.6) * 1.2 : 1), sc));
      M.setMatrixAt(i, this.mat4);
    }
    this.fxMesh.forEach((M, k) => { M.count = nfx[k]; M.visible = nfx[k] > 0; M.instanceMatrix.needsUpdate = true; });
    for (const [k, M] of this.meshes) {
      M.m.count = per.get(k) ?? 0;
      M.m.visible = M.m.count > 0; // most of the cast is absent in any one place: no empty draws
      M.m.instanceMatrix.needsUpdate = true;
      if (M.m.instanceColor) M.m.instanceColor.needsUpdate = true;
      M.anim.needsUpdate = true;
    }
  }
}
