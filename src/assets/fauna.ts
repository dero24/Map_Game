// Fauna — small animals built from one quadruped/bird skeleton (docs/ASSET_FOUNDRY.md §Fauna).
//
// Each species is a handful of parameters over a shared body plan (torso, head, limbs, tail,
// wings), in the Spore / No Man's Sky spirit: one tested skeleton, many animals. Limbs, tail,
// head and wings carry an `aPart` and an `aPivot` (the joint they swing about), and the critter
// material animates them in the vertex shader from a per-instance `aAnim` (gait phase, gait
// amount, pose) — no skinning, no rigs, one instanced draw per species.
import * as THREE from 'three';
import { P, part, merge, limb, blob, card, cached, taper, tube, hashf } from './core';
import { paintMaterial } from '../render/shared';
import type { EcoRegion } from '../world/ecoregions';

export type CritterKind =
  | 'squirrel' | 'rabbit' | 'songbird' | 'sandpiper' | 'deer' | 'butterfly' | 'firefly' | 'fox' | 'hawk'
  | 'coyote' | 'jackrabbit' | 'snowshoe' | 'groundSquirrel' | 'muleDeer' | 'roadrunner' | 'quail' | 'ibis'
  // (package #11, docs/regional-life/models.md: the backyard birds)
  | 'cardinal' | 'bluejay' | 'robin' | 'stellersjay' | 'gilawoodpecker' | 'mourningdove' | 'crow' | 'pigeon'
  // (package #12: the water and big birds)
  | 'canadagoose' | 'mallard' | 'mallardhen' | 'loon' | 'greatblueheron' | 'greategret' | 'snowyegret' | 'spoonbill' | 'sandhillcrane'
  | 'turkeyvulture' | 'baldeagle' | 'osprey' | 'wildturkey' | 'californiaquail' | 'brownpelican' | 'laughinggull' | 'californiagull'
  // (package #13: the mammals on the existing bases)
  | 'raccoon' | 'opossum' | 'skunk' | 'foxsquirrel' | 'chipmunk' | 'woodchuck' | 'beaver' | 'prairiedog' | 'elk' | 'moose' | 'pronghorn' | 'bighorn'
  // (package #14: the new plans)
  | 'blackbear' | 'bison' | 'armadillo' | 'manatee'
  // (package #15: the reptiles)
  | 'alligator' | 'greenanole' | 'brownanole' | 'paintedturtle' | 'redslider' | 'yellowslider'
  // (package #16: the small life)
  | 'monarch' | 'greendarner' | 'annualcicada' | 'cicadashell' | 'bananaslug' | 'fiddlercrab' | 'crawfish';
export const CRITTERS: CritterKind[] = ['squirrel', 'rabbit', 'songbird', 'sandpiper', 'deer', 'butterfly', 'firefly', 'fox', 'hawk', 'coyote', 'jackrabbit', 'snowshoe', 'groundSquirrel', 'muleDeer', 'roadrunner', 'quail', 'ibis',
  'cardinal', 'bluejay', 'robin', 'stellersjay', 'gilawoodpecker', 'mourningdove', 'crow', 'pigeon',
  'canadagoose', 'mallard', 'mallardhen', 'loon', 'greatblueheron', 'greategret', 'snowyegret', 'spoonbill', 'sandhillcrane',
  'turkeyvulture', 'baldeagle', 'osprey', 'wildturkey', 'californiaquail', 'brownpelican', 'laughinggull', 'californiagull',
  'raccoon', 'opossum', 'skunk', 'foxsquirrel', 'chipmunk', 'woodchuck', 'beaver', 'prairiedog', 'elk', 'moose', 'pronghorn', 'bighorn',
  'blackbear', 'bison', 'armadillo', 'manatee',
  'alligator', 'greenanole', 'brownanole', 'paintedturtle', 'redslider', 'yellowslider',
  'monarch', 'greendarner', 'annualcicada', 'cicadashell', 'bananaslug', 'fiddlercrab', 'crawfish'];
export const CRITTER_NAME: Record<CritterKind, string> = {
  squirrel: 'squirrel', rabbit: 'rabbit', songbird: 'songbird', sandpiper: 'sandpiper', deer: 'white-tailed deer', butterfly: 'butterfly', firefly: 'firefly', fox: 'red fox', hawk: 'red-tailed hawk',
  coyote: 'coyote', jackrabbit: 'black-tailed jackrabbit', snowshoe: 'snowshoe hare', groundSquirrel: 'ground squirrel', muleDeer: 'mule deer', roadrunner: 'greater roadrunner', quail: 'quail', ibis: 'white ibis',
  cardinal: 'northern cardinal', bluejay: 'blue jay', robin: 'American robin', stellersjay: "Steller's jay", gilawoodpecker: 'Gila woodpecker', mourningdove: 'mourning dove', crow: 'American crow', pigeon: 'rock pigeon',
  canadagoose: 'Canada goose', mallard: 'mallard', mallardhen: 'mallard (hen)', loon: 'common loon', greatblueheron: 'great blue heron', greategret: 'great egret', snowyegret: 'snowy egret', spoonbill: 'roseate spoonbill', sandhillcrane: 'sandhill crane',
  turkeyvulture: 'turkey vulture', baldeagle: 'bald eagle', osprey: 'osprey', wildturkey: 'wild turkey', californiaquail: 'California quail', brownpelican: 'brown pelican', laughinggull: 'laughing gull', californiagull: 'California gull',
  raccoon: 'raccoon', opossum: 'Virginia opossum', skunk: 'striped skunk', foxsquirrel: 'fox squirrel', chipmunk: 'eastern chipmunk', woodchuck: 'woodchuck', beaver: 'American beaver', prairiedog: 'black-tailed prairie dog', elk: 'elk', moose: 'moose', pronghorn: 'pronghorn', bighorn: 'bighorn sheep',
  blackbear: 'American black bear', bison: 'American bison', armadillo: 'nine-banded armadillo', manatee: 'West Indian manatee',
  alligator: 'American alligator', greenanole: 'green anole', brownanole: 'brown anole', paintedturtle: 'painted turtle', redslider: 'red-eared slider', yellowslider: 'yellow-bellied slider',
  monarch: 'monarch', greendarner: 'common green darner', annualcicada: 'annual cicada', cicadashell: "cicada's shell", bananaslug: 'Pacific banana slug', fiddlercrab: 'Atlantic marsh fiddler crab', crawfish: 'red swamp crawfish',
};

/** Ecological roles: the sim (sim/critters.ts) gives each role its habitat and behaviour; the
 *  species that fills a role comes from the place (faunaMix) — a desert's grazer is a jackrabbit
 *  (and a roadrunner), a north-woods one a snowshoe hare. New species = a table row, not new code. */
export type CritterRole = 'climber' | 'burrower' | 'grazer' | 'songbird' | 'shorebird' | 'browser' | 'butterfly' | 'firefly' | 'predator' | 'raptor'
  // (package #12: on the water, at its edge, the gulls of the beach and the lot, the big ground birds)
  | 'waterfowl' | 'wader' | 'gull' | 'fowl'
  // (package #13: the night's foragers about the yards and the bins; the herds of the open country)
  | 'forager' | 'herd'
  // (package #15: the reptiles that bask — on a bank, on a log — and slide into the water)
  | 'basker'
  // (package #16: the dragonflies on their beats over the water, the insects on the bark, the slugs on the
  // forest floor, the crabs and the crawfish at the water's edge)
  | 'dragonfly' | 'bug' | 'crawler' | 'crab';
export const ROLES: CritterRole[] = ['climber', 'burrower', 'grazer', 'songbird', 'shorebird', 'browser', 'butterfly', 'firefly', 'predator', 'raptor', 'waterfowl', 'wader', 'gull', 'fowl', 'forager', 'herd', 'basker', 'dragonfly', 'bug', 'crawler', 'crab'];
export const ROLE: Record<CritterKind, CritterRole> = {
  squirrel: 'climber', groundSquirrel: 'burrower', rabbit: 'grazer', jackrabbit: 'grazer', snowshoe: 'grazer', roadrunner: 'grazer',
  songbird: 'songbird', quail: 'songbird', sandpiper: 'shorebird', ibis: 'shorebird', deer: 'browser', muleDeer: 'browser',
  butterfly: 'butterfly', firefly: 'firefly', fox: 'predator', coyote: 'predator', hawk: 'raptor',
  // (the backyard birds: all on the lawns and the verges, hopping, pecking, flushing)
  cardinal: 'songbird', bluejay: 'songbird', robin: 'songbird', stellersjay: 'songbird', gilawoodpecker: 'songbird', mourningdove: 'songbird', crow: 'songbird', pigeon: 'songbird',
  // (the water and big birds: swimming, wading, the gulls and the pelican, the turkey and the crane
  // walking the fields, the vulture, the eagle and the osprey on the wing; the California quail a covey
  // like the desert's)
  canadagoose: 'waterfowl', mallard: 'waterfowl', mallardhen: 'waterfowl', loon: 'waterfowl',
  greatblueheron: 'wader', greategret: 'wader', snowyegret: 'wader', spoonbill: 'wader',
  laughinggull: 'gull', californiagull: 'gull', brownpelican: 'gull', sandhillcrane: 'fowl', wildturkey: 'fowl',
  turkeyvulture: 'raptor', baldeagle: 'raptor', osprey: 'raptor', californiaquail: 'songbird',
  // (the mammals: the raccoon, the opossum and the skunk out at night; the fox squirrel up the trees;
  // the chipmunk, the woodchuck and the prairie dog down their holes; the beaver on the water; the
  // moose browsing the willows; the elk, the pronghorn and the bighorn in herds)
  raccoon: 'forager', opossum: 'forager', skunk: 'forager', foxsquirrel: 'climber', chipmunk: 'burrower', woodchuck: 'burrower', prairiedog: 'burrower',
  beaver: 'waterfowl', moose: 'browser', elk: 'herd', pronghorn: 'herd', bighorn: 'herd',
  // (the bear at the wood's edge with the deer; the bison in the herds; the armadillo out at night; the
  // manatee in the warm water)
  blackbear: 'browser', bison: 'herd', armadillo: 'forager', manatee: 'waterfowl',
  // (the alligator and the turtles bask by the water; the anoles up the trunks with the squirrels)
  alligator: 'basker', paintedturtle: 'basker', redslider: 'basker', yellowslider: 'basker', greenanole: 'climber', brownanole: 'climber',
  // (the monarch with the butterflies; the darner on its beat; the cicada and its cast-off shell on the bark;
  // the banana slug on the forest floor; the fiddler crab on the marsh's mud, the crawfish by its ditch)
  monarch: 'butterfly', greendarner: 'dragonfly', annualcicada: 'bug', cicadashell: 'bug', bananaslug: 'crawler', fiddlercrab: 'crab', crawfish: 'crab',
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
// (package #11: the East's backyard birds — the robin on every lawn, the cardinal, the blue jay, the
// mourning dove, the crow, the town's pigeons; the generic songbird for the sparrows and the finches)
const EAST_BIRDS: [CritterKind, number][] = [['songbird', 1], ['robin', 1.3], ['cardinal', 0.9], ['bluejay', 0.6], ['mourningdove', 0.8], ['crow', 0.5], ['pigeon', 0.3]];
const EAST: FaunaMix = { ...FAUNA.temperate, songbird: EAST_BIRDS }; // (the Mid-Atlantic's: the shore's cast as it was, its birds their own)
const REGION_FAUNA: Record<EcoRegion | 'pnw-dry', FaunaMix> = {
  'new-england': { ...EAST, predator: [['fox', 1], ['coyote', 0.7]] },
  'upstate-ny': { ...EAST, predator: [['fox', 1], ['coyote', 0.7]] },
  'mid-atlantic': EAST,
  appalachia: { ...EAST, predator: [['fox', 1], ['coyote', 0.5]] },
  southeast: { ...EAST, predator: [['fox', 1], ['coyote', 0.5]] },
  florida: { climber: [['squirrel', 1]], grazer: [['rabbit', 1]], songbird: [['songbird', 1], ['cardinal', 0.9], ['mourningdove', 1], ['bluejay', 0.5], ['robin', 0.4], ['crow', 0.4], ['pigeon', 0.3]], shorebird: [['sandpiper', 1], ['ibis', 1.4]], browser: [['deer', 0.5]], predator: [['fox', 0.4], ['coyote', 0.3]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1.3]], firefly: [['firefly', 0.6]] },
  gulf: { ...EAST, shorebird: [['sandpiper', 1], ['ibis', 0.8]], predator: [['fox', 0.8], ['coyote', 0.6]] },
  texas: { ...EAST, shorebird: [['sandpiper', 1], ['ibis', 0.3]], predator: [['coyote', 1], ['fox', 0.4]], butterfly: [['butterfly', 1.2]], firefly: [['firefly', 0.7]] },
  plains: { climber: [['squirrel', 0.8]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 1], ['jackrabbit', 0.6]], songbird: [['songbird', 1], ['robin', 1], ['mourningdove', 1.3], ['bluejay', 0.4], ['cardinal', 0.35], ['crow', 0.5], ['pigeon', 0.3]], shorebird: [['sandpiper', 0.6]], browser: [['deer', 1], ['muleDeer', 0.6]], predator: [['coyote', 1], ['fox', 0.5]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]] },
  midwest: { ...EAST, predator: [['fox', 1], ['coyote', 0.6]], firefly: [['firefly', 1.2]] },
  ozarks: { ...EAST, grazer: [['rabbit', 1], ['roadrunner', 0.1]], predator: [['fox', 0.8], ['coyote', 0.7]] },
  rockies: { climber: [['squirrel', 1]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 0.7], ['snowshoe', 0.5]], songbird: [['songbird', 1], ['robin', 1.2], ['stellersjay', 0.6], ['mourningdove', 0.5], ['crow', 0.3], ['pigeon', 0.2]], shorebird: [['sandpiper', 0.5]], browser: [['muleDeer', 1], ['deer', 0.4]], predator: [['coyote', 1], ['fox', 0.6]], raptor: [['hawk', 1]], butterfly: [['butterfly', 1]] },
  'desert-sw': { ...FAUNA.arid, songbird: [['quail', 1], ['songbird', 0.4], ['mourningdove', 1], ['gilawoodpecker', 0.6], ['pigeon', 0.25]] },
  'great-basin': { climber: [['squirrel', 0.3]], burrower: [['groundSquirrel', 1]], grazer: [['jackrabbit', 1], ['rabbit', 0.5]], songbird: [['songbird', 1], ['californiaquail', 0.5], ['robin', 0.8], ['mourningdove', 0.9], ['crow', 0.3], ['pigeon', 0.25]], shorebird: [['sandpiper', 0.6]], browser: [['muleDeer', 1]], predator: [['coyote', 1]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.6]] },
  california: { ...FAUNA.mediterranean, songbird: [['songbird', 1], ['californiaquail', 0.6], ['robin', 0.7], ['mourningdove', 0.9], ['crow', 0.7], ['pigeon', 0.3]] },
  pnw: { climber: [['squirrel', 1]], grazer: [['rabbit', 1]], songbird: [['songbird', 1], ['robin', 1], ['stellersjay', 0.9], ['crow', 1.1], ['mourningdove', 0.25], ['pigeon', 0.3]], shorebird: [['sandpiper', 1]], browser: [['muleDeer', 1], ['deer', 0.15]], predator: [['coyote', 1], ['fox', 0.5]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.8]] },
  'pnw-dry': { climber: [['squirrel', 0.6]], burrower: [['groundSquirrel', 1]], grazer: [['rabbit', 0.6], ['jackrabbit', 0.6]], songbird: [['songbird', 1], ['californiaquail', 0.4], ['robin', 0.9], ['mourningdove', 0.8], ['crow', 0.4], ['pigeon', 0.25]], shorebird: [['sandpiper', 0.5]], browser: [['muleDeer', 1], ['deer', 0.4]], predator: [['coyote', 1]], raptor: [['hawk', 1]], butterfly: [['butterfly', 0.8]] },
};
// (package #12: the water and the big birds — what's on each region's ponds and lakes, at their edges,
// on its beaches and parking lots, walking its fields and over its head; the habitat itself (water,
// the shore, a field) is the sim's, the season faunaMix's `month`)
type Mix = [CritterKind, number][];
const DUCKS: Mix = [['canadagoose', 1], ['mallard', 0.9], ['mallardhen', 0.8]];
const LOONS: Mix = [...DUCKS, ['loon', 0.3]];
const raptors = (vulture = 1.2, eagle = 0.25, osprey = 0.4): Mix => [['hawk', 1], ['turkeyvulture', vulture], ['baldeagle', eagle], ['osprey', osprey]];
const WATER: Record<EcoRegion | 'pnw-dry', FaunaMix> = {
  'new-england': { waterfowl: LOONS, wader: [['greatblueheron', 1], ['greategret', 0.6], ['snowyegret', 0.4]], gull: [['laughinggull', 1]], fowl: [['wildturkey', 1]], raptor: raptors(1, 0.3, 0.5) },
  'upstate-ny': { waterfowl: LOONS, wader: [['greatblueheron', 1], ['greategret', 0.5]], fowl: [['wildturkey', 1], ['sandhillcrane', 0.2]], raptor: raptors(1, 0.3, 0.4) },
  'mid-atlantic': { waterfowl: LOONS, wader: [['greatblueheron', 1], ['greategret', 0.9], ['snowyegret', 0.6]], gull: [['laughinggull', 1], ['brownpelican', 0.3]], fowl: [['wildturkey', 1]], raptor: raptors(1.2, 0.25, 0.6) },
  appalachia: { waterfowl: DUCKS, wader: [['greatblueheron', 1], ['greategret', 0.4]], fowl: [['wildturkey', 1.2], ['sandhillcrane', 0.15]], raptor: raptors(1.4, 0.2, 0.3) },
  southeast: { waterfowl: [...DUCKS, ['loon', 0.15]], wader: [['greatblueheron', 1], ['greategret', 1], ['snowyegret', 0.7], ['spoonbill', 0.2]], gull: [['laughinggull', 1], ['brownpelican', 0.6]], fowl: [['wildturkey', 1]], raptor: raptors(1.4, 0.25, 0.5) },
  florida: { waterfowl: [['mallard', 0.6], ['mallardhen', 0.6], ['canadagoose', 0.3], ['loon', 0.15]], wader: [['greatblueheron', 1], ['greategret', 1.2], ['snowyegret', 0.8], ['spoonbill', 0.6]], gull: [['laughinggull', 1.2], ['brownpelican', 1]], fowl: [['sandhillcrane', 1], ['wildturkey', 0.6]], raptor: raptors(1.4, 0.3, 0.8) },
  gulf: { waterfowl: [...DUCKS, ['loon', 0.1]], wader: [['greatblueheron', 1], ['greategret', 1], ['snowyegret', 0.7], ['spoonbill', 0.4]], gull: [['laughinggull', 1], ['brownpelican', 0.8]], fowl: [['wildturkey', 0.8], ['sandhillcrane', 0.2]], raptor: raptors(1.4, 0.25, 0.6) },
  texas: { waterfowl: DUCKS, wader: [['greatblueheron', 1], ['greategret', 0.9], ['snowyegret', 0.5], ['spoonbill', 0.3]], gull: [['laughinggull', 0.8], ['brownpelican', 0.5]], fowl: [['wildturkey', 1], ['sandhillcrane', 0.3]], raptor: raptors(1.4, 0.15, 0.3) },
  plains: { waterfowl: DUCKS, wader: [['greatblueheron', 1], ['greategret', 0.4]], fowl: [['wildturkey', 0.8], ['sandhillcrane', 0.6]], raptor: raptors(1, 0.2, 0.2) },
  midwest: { waterfowl: LOONS, wader: [['greatblueheron', 1], ['greategret', 0.6]], fowl: [['wildturkey', 1], ['sandhillcrane', 0.4]], raptor: raptors(1, 0.3, 0.4) },
  ozarks: { waterfowl: DUCKS, wader: [['greatblueheron', 1], ['greategret', 0.5]], fowl: [['wildturkey', 1.3]], raptor: raptors(1.4, 0.2, 0.2) },
  rockies: { waterfowl: [...DUCKS, ['loon', 0.1]], wader: [['greatblueheron', 1]], fowl: [['wildturkey', 0.8], ['sandhillcrane', 0.4]], raptor: raptors(1, 0.3, 0.4) },
  'desert-sw': { waterfowl: DUCKS, wader: [['greatblueheron', 0.8], ['greategret', 0.5], ['snowyegret', 0.5]], gull: [['californiagull', 0.4]], fowl: [['sandhillcrane', 0.4], ['wildturkey', 0.3]], raptor: raptors(1.4, 0.1, 0.3) },
  'great-basin': { waterfowl: DUCKS, wader: [['greatblueheron', 1], ['greategret', 0.5], ['snowyegret', 0.5]], gull: [['californiagull', 1.2]], fowl: [['sandhillcrane', 0.5], ['wildturkey', 0.3]], raptor: raptors(1.2, 0.2, 0.3) },
  california: { waterfowl: [...DUCKS, ['loon', 0.15]], wader: [['greatblueheron', 1], ['greategret', 1], ['snowyegret', 0.6]], gull: [['californiagull', 1], ['brownpelican', 0.7]], fowl: [['wildturkey', 0.6], ['sandhillcrane', 0.2]], raptor: raptors(1.4, 0.15, 0.4) },
  pnw: { waterfowl: LOONS, wader: [['greatblueheron', 1.2], ['greategret', 0.3]], gull: [['californiagull', 0.8], ['brownpelican', 0.3]], fowl: [['wildturkey', 0.3], ['sandhillcrane', 0.15]], raptor: raptors(1, 0.5, 0.5) },
  'pnw-dry': { waterfowl: DUCKS, wader: [['greatblueheron', 1]], gull: [['californiagull', 0.6]], fowl: [['wildturkey', 0.6], ['sandhillcrane', 0.3]], raptor: raptors(1, 0.25, 0.3) },
};
for (const k of Object.keys(WATER) as (keyof typeof WATER)[]) REGION_FAUNA[k] = { ...REGION_FAUNA[k], ...WATER[k] };
// (package #13: the mammals on the existing bases — each region's squirrels, burrowers, night foragers,
// beavers and herds (docs/regional-life/ranges.md): the grey squirrel the East's, the fox squirrel the
// Midwest's, the Plains' and the South's, and planted in the West's cities; the chipmunk and the
// woodchuck the East's and the Midwest's; the prairie dog the western Plains' and the Front Range's; the
// opossum east of the Rockies and on the Pacific coast, not the interior West; the elk the West's (and a
// few restored herds in the East); the pronghorn west of the 100th meridian; the bighorn the mountains'
// and the desert's)
const SQ = (fox: number, grey = 1): Mix => (fox ? [['squirrel', grey], ['foxsquirrel', fox]] : [['squirrel', grey]]);
const EASTERN_BURROWS: Mix = [['chipmunk', 1], ['woodchuck', 0.35]];
const NIGHT = (opossum = 0.8): Mix => [['raccoon', 1], ['skunk', 0.6], ...(opossum ? [['opossum', opossum] as [CritterKind, number]] : [])];
const MAMMALS: Record<EcoRegion | 'pnw-dry', FaunaMix> = {
  'new-england': { climber: SQ(0), burrower: EASTERN_BURROWS, forager: NIGHT(0.6) },
  'upstate-ny': { climber: SQ(0), burrower: EASTERN_BURROWS, forager: NIGHT(0.6) },
  'mid-atlantic': { climber: SQ(0.1), burrower: EASTERN_BURROWS, forager: NIGHT() },
  appalachia: { climber: SQ(0.3), burrower: EASTERN_BURROWS, forager: NIGHT(), herd: [['elk', 0.15]] },
  southeast: { climber: SQ(0.4), forager: NIGHT(1) },
  florida: { climber: SQ(0.3), forager: NIGHT(1) },
  gulf: { climber: SQ(0.5), forager: NIGHT(1) },
  texas: { climber: SQ(1, 0.5), forager: NIGHT(0.9) },
  plains: { climber: SQ(1.2, 0.4), burrower: [['groundSquirrel', 1], ['prairiedog', 1.2], ['woodchuck', 0.15]], forager: NIGHT(0.6), herd: [['pronghorn', 1], ['elk', 0.1]] },
  midwest: { climber: SQ(0.8), burrower: EASTERN_BURROWS, forager: NIGHT() },
  ozarks: { climber: SQ(0.7), burrower: EASTERN_BURROWS, forager: NIGHT(), herd: [['elk', 0.1]] },
  rockies: { climber: SQ(0.4), burrower: [['groundSquirrel', 1], ['prairiedog', 0.6]], forager: NIGHT(0.1), herd: [['elk', 1], ['pronghorn', 0.5], ['bighorn', 0.35]], browser: [['muleDeer', 1], ['deer', 0.4], ['moose', 0.3]] },
  'desert-sw': { forager: NIGHT(0), herd: [['pronghorn', 0.4], ['bighorn', 0.4]] },
  'great-basin': { climber: SQ(0.3, 0.3), forager: NIGHT(0), herd: [['pronghorn', 1], ['elk', 0.4], ['bighorn', 0.35]] },
  california: { climber: SQ(0.3), forager: NIGHT(0.7) },
  pnw: { climber: SQ(0.2), forager: NIGHT(0.7), herd: [['elk', 0.8]] },
  'pnw-dry': { climber: SQ(0.1, 0.6), forager: NIGHT(0.2), herd: [['elk', 0.6], ['pronghorn', 0.3], ['bighorn', 0.2]], browser: [['muleDeer', 1], ['deer', 0.4], ['moose', 0.1]] },
};
// (package #14: the black bear in the forested mountains, the Southeast's swamps and Florida, never the
// open Plains or the Corn Belt (the north woods' alone in the Midwest, ranges.md); the bison the western
// Plains' and the Rockies' kept herds; the armadillo across the South to Kansas and Kentucky; the
// manatee Florida's, and the Carolinas' and the Gulf's in summer)
const BEAR = (w: number): Mix => [['blackbear', w]];
const NEW_PLANS: Partial<Record<EcoRegion | 'pnw-dry', FaunaMix>> = {
  'new-england': { browser: [['deer', 1], ...BEAR(0.12)] }, 'upstate-ny': { browser: [['deer', 1], ...BEAR(0.12)] }, 'mid-atlantic': { browser: [['deer', 1], ...BEAR(0.06)] },
  appalachia: { browser: [['deer', 1], ...BEAR(0.2)], forager: [...NIGHT(), ['armadillo', 0.15]] },
  southeast: { browser: [['deer', 1], ...BEAR(0.06)], forager: [...NIGHT(1), ['armadillo', 0.6]], waterfowl: [...DUCKS, ['loon', 0.15], ['beaver', 0.15], ['manatee', 0.08]] },
  florida: { browser: [['deer', 0.5], ...BEAR(0.1)], forager: [...NIGHT(1), ['armadillo', 0.8]], waterfowl: [['mallard', 0.6], ['mallardhen', 0.6], ['canadagoose', 0.3], ['loon', 0.15], ['beaver', 0.05], ['manatee', 0.25]] },
  gulf: { browser: [['deer', 1], ...BEAR(0.08)], forager: [...NIGHT(1), ['armadillo', 0.8]], waterfowl: [...DUCKS, ['loon', 0.1], ['beaver', 0.15], ['manatee', 0.08]] },
  texas: { forager: [...NIGHT(0.9), ['armadillo', 0.9]] },
  ozarks: { browser: [['deer', 1], ...BEAR(0.12)], forager: [...NIGHT(), ['armadillo', 0.6]] },
  rockies: { browser: [['muleDeer', 1], ['deer', 0.4], ['moose', 0.3], ...BEAR(0.15)], herd: [['elk', 1], ['pronghorn', 0.5], ['bighorn', 0.35], ['bison', 0.2]] },
  plains: { herd: [['pronghorn', 1], ['elk', 0.1], ['bison', 0.25]], forager: [...NIGHT(0.6), ['armadillo', 0.4]] },
  california: { browser: [['muleDeer', 1], ...BEAR(0.1)] },
  pnw: { browser: [['muleDeer', 1], ['deer', 0.15], ...BEAR(0.15)] },
  'desert-sw': { browser: [['muleDeer', 1], ...BEAR(0.05)] },
};
for (const k of Object.keys(NEW_PLANS) as (keyof typeof NEW_PLANS)[]) MAMMALS[k] = { ...MAMMALS[k], ...NEW_PLANS[k] };
// (package #15: the reptiles — the alligator in the Southeast's coastal plain, Florida, the Gulf, East
// Texas and southern Arkansas; the yellow-bellied slider the Southeast's, Florida's and the Gulf's; the
// red-eared slider everywhere (planted far and wide); the painted turtle everywhere but the desert and
// Florida; the green anole across the South, the brown anole Florida's and the southern coasts')
const TURTLES: Mix = [['paintedturtle', 1], ['redslider', 0.8]];
const REPTILES: Partial<Record<EcoRegion | 'pnw-dry', FaunaMix>> = {
  southeast: { basker: [['alligator', 0.6], ['yellowslider', 1], ['redslider', 0.8], ['paintedturtle', 0.4]], climber: [...SQ(0.4), ['greenanole', 0.8], ['brownanole', 0.2]] },
  florida: { basker: [['alligator', 1.2], ['yellowslider', 1], ['redslider', 0.6]], climber: [...SQ(0.3), ['greenanole', 0.6], ['brownanole', 1.4]] },
  gulf: { basker: [['alligator', 1], ['yellowslider', 0.8], ['redslider', 1], ['paintedturtle', 0.3]], climber: [...SQ(0.5), ['greenanole', 0.8], ['brownanole', 0.2]] },
  texas: { basker: [['alligator', 0.4], ['redslider', 1], ['paintedturtle', 0.2]], climber: [...SQ(1, 0.5), ['greenanole', 0.7], ['brownanole', 0.15]] },
  ozarks: { basker: [['redslider', 1], ['paintedturtle', 0.8], ['alligator', 0.1]], climber: [...SQ(0.7), ['greenanole', 0.4]] },
  appalachia: { basker: TURTLES, climber: [...SQ(0.3), ['greenanole', 0.2]] },
  'desert-sw': { basker: [['redslider', 0.3]] },
};
for (const k of ['new-england', 'upstate-ny', 'mid-atlantic', 'plains', 'midwest', 'rockies', 'great-basin', 'california', 'pnw', 'pnw-dry'] as const) REPTILES[k] = { basker: TURTLES };
for (const k of Object.keys(REPTILES) as (keyof typeof REPTILES)[]) MAMMALS[k] = { ...MAMMALS[k], ...REPTILES[k] };
for (const k of Object.keys(MAMMALS) as (keyof typeof MAMMALS)[]) {
  const m = MAMMALS[k], here = REGION_FAUNA[k];
  REGION_FAUNA[k] = { ...here, ...m, ...(here.waterfowl && !m.waterfowl ? { waterfowl: [...here.waterfowl, ['beaver', 0.15]] } : {}) };
}
// (package #16: the small life — the monarch with every region's butterflies (and on California's coast in
// its winter roosts); the green darner over every pond; the annual cicadas of the East, the Plains, Texas
// and the desert, their shells left on the bark; the banana slug of the wet Northwest and the redwood
// coast; the fiddler crabs of the Atlantic's and the Gulf's marshes; the crawfish of the South's ditches
// and the Midwest's and the Plains' creeks)
const BUGS: Mix = [['annualcicada', 1], ['cicadashell', 0.7]];
const SMALL: Partial<Record<EcoRegion | 'pnw-dry', FaunaMix>> = {
  'new-england': { bug: BUGS, crab: [['fiddlercrab', 1]] }, 'upstate-ny': { bug: BUGS, crab: [['crawfish', 1]] }, 'mid-atlantic': { bug: BUGS, crab: [['fiddlercrab', 1]] },
  appalachia: { bug: BUGS, crab: [['crawfish', 1]] }, southeast: { bug: BUGS, crab: [['fiddlercrab', 1], ['crawfish', 1]] }, florida: { bug: BUGS, crab: [['fiddlercrab', 1.2]] },
  gulf: { bug: BUGS, crab: [['fiddlercrab', 0.8], ['crawfish', 1.4]] }, texas: { bug: BUGS, crab: [['fiddlercrab', 0.6], ['crawfish', 1]] },
  plains: { bug: BUGS, crab: [['crawfish', 1]] }, midwest: { bug: BUGS, crab: [['crawfish', 1]] }, ozarks: { bug: BUGS, crab: [['crawfish', 1]] },
  'desert-sw': { bug: BUGS }, pnw: { crawler: [['bananaslug', 1]] }, california: { crawler: [['bananaslug', 1]] },
};
for (const k of Object.keys(REGION_FAUNA) as (keyof typeof REGION_FAUNA)[]) {
  const here = REGION_FAUNA[k];
  REGION_FAUNA[k] = { ...here, ...SMALL[k], dragonfly: [['greendarner', 1]], butterfly: [...(here.butterfly ?? []), ['monarch', k === 'california' ? 0.9 : 0.6]] };
}
/** Where the monarchs winter, hanging in clusters in the coast's trees (ranges.md: the West's on
 *  California's coast, November to February). */
export const monarchRoost = (eco: string | undefined, m: number) => eco === 'california' && months(m, 11, 2);
/** When the monarchs stream south, high and steady (the north's September and October; Florida's stay). */
export const monarchMigrating = (eco: string | undefined, m: number) => eco !== undefined && eco !== 'florida' && eco !== 'california' && months(m, 9, 10);
/** Where the crawfish build their mud chimneys in the lawns and the ditches (models.md: crawfish-chimney). */
const CHIMNEY_COUNTRY = new Set(['gulf', 'texas', 'southeast', 'plains', 'ozarks']);
export const chimneyCountry = (place?: { eco: string }) => !!place && CHIMNEY_COUNTRY.has(place.eco);
/** The western Plains (the High Plains, the Southwestern Tablelands, the Northwestern Plains): the
 *  pronghorn's, west of the 100th meridian. */
const PLAINS_WEST = new Set([25, 26, 42, 43, 44]);
const NORTHERN = new Set(['new-england', 'upstate-ny', 'midwest', 'plains', 'rockies', 'pnw', 'pnw-dry', 'great-basin']);
function months(m: number, a: number, b: number) { return a <= b ? m >= a && m <= b : m >= a || m <= b; }
/** When a bird is here (month 1–12, the north's: the sim turns the south's year round), by the region's
 *  table key (ranges.md: who winters where, who only summers): the loons on the northern lakes in summer
 *  and on the coasts in winter, the vultures, ospreys and egrets gone south for the winter, the
 *  cranes' migrations, the pelicans' and the laughing gulls' summers in the north. */
const SEASON: Partial<Record<CritterKind, (eco: string, m: number) => boolean>> = {
  loon: (e, m) => ['new-england', 'pnw'].includes(e) || (['mid-atlantic', 'southeast', 'gulf', 'florida', 'california', 'texas'].includes(e) ? months(m, 11, 3) : months(m, 4, 10)),
  turkeyvulture: (e, m) => !NORTHERN.has(e) || months(m, 3, 10),
  osprey: (e, m) => ['florida', 'gulf'].includes(e) || (NORTHERN.has(e) ? months(m, 4, 9) : months(m, 3, 10)),
  laughinggull: (e, m) => !['new-england', 'mid-atlantic'].includes(e) || months(m, 4, 10),
  brownpelican: (e, m) => (e === 'mid-atlantic' ? months(m, 5, 9) : e === 'pnw' ? months(m, 6, 10) : true),
  sandhillcrane: (e, m) => (e === 'florida' ? true : e === 'plains' ? months(m, 2, 4) || months(m, 10, 11) : ['texas', 'desert-sw', 'california', 'gulf'].includes(e) ? months(m, 11, 2) : months(m, 3, 10)),
  greategret: (e, m) => !NORTHERN.has(e) || months(m, 4, 10),
  snowyegret: (e, m) => !['new-england', 'mid-atlantic', 'great-basin'].includes(e) || months(m, 4, 10),
  // (the woodchuck asleep from November to February; the chipmunk under the ground through the winter)
  woodchuck: (_e, m) => months(m, 3, 10),
  // (the bears denned up through the northern winter; the manatee in the Carolinas' and the Gulf's warm months)
  blackbear: (e, m) => !NORTHERN.has(e) && !['new-england', 'upstate-ny', 'appalachia', 'midwest'].includes(e) || months(m, 4, 11),
  manatee: (e, m) => e === 'florida' || months(m, 5, 10),
  // (the turtles bask spring to fall, the year round in Florida; the anoles out whenever it's warm; the
  // alligators bask even on a sunny winter's day, but the Ozarks' only in the warm months)
  paintedturtle: (e, m) => (['southeast', 'gulf', 'texas'].includes(e) ? months(m, 2, 11) : months(m, 4, 9)),
  redslider: (e, m) => e === 'florida' || (['southeast', 'gulf', 'texas'].includes(e) ? months(m, 2, 11) : months(m, 4, 9)),
  yellowslider: (e, m) => e === 'florida' || months(m, 2, 11),
  greenanole: (e, m) => e === 'florida' || months(m, 3, 11),
  brownanole: (e, m) => e === 'florida' || months(m, 3, 11),
  alligator: (e, m) => e !== 'ozarks' || months(m, 4, 10),
  chipmunk: (_e, m) => months(m, 3, 11),
  // (package #16: the monarch from May to October — the year round in Florida and on California's coast,
  // where it winters in its roosts; the darners spring to fall; the annual cicadas' summer, their shells
  // left into the fall; the banana slug through the wet months, not the dry end of summer; the fiddlers
  // and the crawfish out in the warm months)
  monarch: (e, m) => e === 'florida' || e === 'california' || (['texas', 'gulf', 'southeast', 'desert-sw'].includes(e) ? months(m, 3, 11) : months(m, 5, 10)),
  greendarner: (e, m) => (['florida', 'gulf', 'texas', 'california'].includes(e) ? months(m, 2, 11) : months(m, 4, 10)),
  annualcicada: (e, m) => (['texas', 'gulf', 'southeast', 'florida', 'desert-sw'].includes(e) ? months(m, 5, 9) : months(m, 6, 9)),
  cicadashell: (e, m) => (['texas', 'gulf', 'southeast', 'florida', 'desert-sw'].includes(e) ? months(m, 5, 10) : months(m, 6, 10)),
  bananaslug: (_e, m) => !months(m, 7, 9),
  fiddlercrab: (e, m) => e === 'florida' || months(m, 4, 10),
  crawfish: (e, m) => (['gulf', 'texas', 'southeast'].includes(e) ? months(m, 2, 11) : months(m, 4, 10)),
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
export function faunaMix(region: string, climate: string, place?: { eco: string; l3: number; west: boolean }, month?: number): FaunaMix {
  void region; // continents get their own rows here as they come online
  const eco = place?.eco as EcoRegion | undefined;
  if (eco && REGION_FAUNA[eco]) {
    const l3 = place!.l3;
    const key = eco === 'pnw' && !place!.west ? 'pnw-dry' : eco;
    let m = REGION_FAUNA[key];
    if (NORTH_WOODS.has(l3)) m = { ...m, grazer: [...(m.grazer ?? []), ['snowshoe', 0.6]], browser: [...(m.browser ?? [['deer', 1]]), ['moose', 0.4], ...(eco === 'midwest' ? [['blackbear', 0.12] as [CritterKind, number]] : [])] };
    // (no bear on California's valley floor or in the low deserts; the armadillo only in the southern
    // Plains and Appalachia's Interior Plateau)
    const drop = (r: CritterRole, k: CritterKind) => { m = { ...m, [r]: (m[r] ?? []).filter(([kk]) => kk !== k) }; };
    if ((eco === 'california' && l3 === 7) || (eco === 'desert-sw' && (l3 === 81 || l3 === 79 || l3 === 14))) drop('browser', 'blackbear');
    if (eco === 'plains' && ![26, 27, 29].includes(l3)) drop('forager', 'armadillo');
    if (eco === 'appalachia' && l3 !== 71) (drop('forager', 'armadillo'), drop('climber', 'greenanole'));
    // (the alligator only on the coastal plain — not the Piedmont — and in East Texas)
    if (eco === 'southeast' && l3 === 45) drop('basker', 'alligator');
    if (eco === 'texas' && ![33, 34, 35].includes(l3)) drop('basker', 'alligator');
    // (the brown anole on the coasts only, spreading from Florida)
    if ((eco === 'southeast' && l3 === 45) || (eco === 'texas' && l3 !== 34) || (eco === 'gulf' && ![73, 75].includes(l3))) drop('climber', 'brownanole');
    // (the pronghorn west of the 100th meridian only; the Roosevelt elk on California's north coast)
    if (eco === 'plains' && !PLAINS_WEST.has(l3)) m = { ...m, herd: (m.herd ?? []).filter(([k]) => k !== 'pronghorn' && k !== 'bison'), burrower: (m.burrower ?? []).filter(([k]) => k !== 'prairiedog') };
    if (eco === 'plains' && !PLAINS_EAST.has(l3)) m = { ...m, burrower: (m.burrower ?? []).filter(([k]) => k !== 'woodchuck') }; // (the woodchuck only at the Plains' eastern edge)
    if (eco === 'california' && l3 === 1) m = { ...m, herd: [['elk', 0.6]] };
    if (eco === 'plains' && PLAINS_EAST.has(l3)) m = { ...m, firefly: [['firefly', 0.6]] };
    if (eco === 'southeast' && (l3 === 63 || l3 === 75)) m = { ...m, shorebird: [['sandpiper', 1], ['ibis', 0.6]] }; // (the coastal plain's marshes)
    // (Steller's jay in California's conifer forests: the redwood coast, the Sierra, the Klamath and the
    // Cascades; the Sonoran's Gila woodpecker only below the desert's mountains)
    if (eco === 'california' && [1, 4, 5, 78].includes(l3)) m = { ...m, songbird: [...(m.songbird ?? []), ['stellersjay', 0.8]] };
    if (eco === 'desert-sw' && l3 !== 81 && l3 !== 79) m = { ...m, songbird: (m.songbird ?? []).filter(([k]) => k !== 'gilawoodpecker') };
    // (the banana slug only in the redwood coast's and the Klamath's wet forests)
    if (eco === 'california' && l3 !== 1 && l3 !== 78) drop('crawler', 'bananaslug');
    if (eco === 'texas' && TEXAS_WEST.has(l3)) {
      // (the High and Rolling Plains' dry nights flash no fireflies; the Hill Country and the brush a few)
      const { firefly: _f, ...dry } = m;
      m = { ...dry, burrower: l3 === 25 ? [['groundSquirrel', 0.6], ['prairiedog', 0.8]] : [['groundSquirrel', 0.6]], ...(l3 === 25 || l3 === 26 ? { herd: [['pronghorn', 0.6]] as Mix } : {}), grazer: [['rabbit', 1], ['jackrabbit', 0.7], ['roadrunner', 0.4]], songbird: [['songbird', 1], ['quail', 0.5], ['mourningdove', 1.2], ['cardinal', 0.4], ['crow', 0.2]], ...(l3 >= 29 ? { firefly: [['firefly', 0.3]] as [CritterKind, number][] } : {}) };
      drop('crab', 'crawfish'); // (the crawfish of East Texas's ditches, not the dry west's)
    }
    if (month !== undefined) {
      // (the season's: who's away this month leaves its role to the rest — a role left empty goes)
      const out: FaunaMix = {};
      for (const [r, list] of Object.entries(m) as [CritterRole, Mix][]) {
        const here = list.filter(([k]) => SEASON[k]?.(key, month) ?? true);
        if (here.length) out[r] = here;
      }
      m = out;
    }
    return m;
  }
  return FAUNA[climate] ?? FAUNA.temperate;
}

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Four-legged species as parameters over the four base builds (squirrel, rabbit, deer, fox):
// overall scale, coat / belly, leg-stocking and tail-tip colours, ear size, tail fullness.
interface Quad {
  base: 'squirrel' | 'rabbit' | 'deer' | 'fox'; k?: number; coat?: number; belly?: number; stock?: number; tailTip?: number; ear?: number; earC?: number; plume?: number;
  // (package #13, the mammals on the existing bases: the marks and the build a mammal is known by)
  /** the head's own colour (an opossum's white face); a deer's neck and head (an elk's chocolate mane) */
  headC?: number; mane?: number;
  /** a mask across the eyes (a raccoon's); a stripe up the forehead (a skunk's) */
  mask?: number; blaze?: number;
  /** stripes along the back, each [offset across it: −1 … 1, colour] (a skunk's white V, a chipmunk's) */
  stripes?: [number, number][];
  /** the tail: a raccoon's ringed brush, an opossum's naked one, a skunk's plume, a beaver's paddle, a
   *  woodchuck's stub; `ring`: the ringed tail's dark bands; `tailC`: the tail's own colour (a fox
   *  squirrel's orange plume, a beaver's black paddle) */
  tail?: 'ringed' | 'naked' | 'plume' | 'paddle' | 'stub'; ring?: number; tailC?: number;
  /** stockier (the body's width and depth ×) and the legs' length × (a raccoon's short legs) */
  girth?: number; legs?: number;
  /** a deer's lower legs, its rump patch, a moose's long overhanging muzzle (the head's length ×),
   *  its humped shoulders and its throat bell */
  legC?: number; rump?: number; snout?: number; hump?: boolean; bell?: boolean;
  /** antlers or horns (the sim shows them on its bulls, bucks and rams, in their season) */
  antlers?: 'whitetail' | 'mule' | 'elk' | 'moose' | 'pronghorn' | 'ram' | 'bison'; antlerC?: number;
}
const QUAD: Partial<Record<CritterKind, Quad>> = {
  squirrel: { base: 'squirrel' }, rabbit: { base: 'rabbit' }, deer: { base: 'deer', antlers: 'whitetail' }, fox: { base: 'fox' },
  // a coyote: the fox plan a third bigger, grizzled tan-grey, tan legs, big ears, a black-tipped brush
  coyote: { base: 'fox', k: 1.3, coat: 0x9c8c74, belly: 0xe2d8c4, stock: 0x8a7658, tailTip: 0x2a2622, ear: 1.25, earC: 0x8a7a64 },
  // a jackrabbit: rangy, sandy, with the enormous ears
  jackrabbit: { base: 'rabbit', k: 1.25, coat: 0xa8906a, ear: 1.5 },
  // a snowshoe hare: coat is TINT — the sim paints it brown in summer and white in winter
  snowshoe: { base: 'rabbit', k: 1.15, coat: 0xffffff, belly: 0xf2eee6, ear: 0.9 },
  // a ground squirrel: sandy, a thin tail (it bolts down a burrow, not up a tree)
  groundSquirrel: { base: 'squirrel', k: 1.1, coat: 0xa08462, plume: 0.55 },
  // a mule deer: greyer, and the mule ears
  muleDeer: { base: 'deer', k: 1.05, coat: 0x8f7f6c, ear: 1.4, antlers: 'mule' },
  // (package #13: the mammals on the existing bases)
  // a raccoon: grizzled grey, the black mask, the ringed tail, black hands, hunched on short legs
  raccoon: { base: 'fox', k: 0.78, coat: 0x7a7670, belly: 0x9a958c, stock: 0x2a2624, headC: 0x8a867e, mask: 0x1e1c1a, ear: 0.75, earC: 0x5a5650, tail: 'ringed', ring: 0x2a2624, tailTip: 0x2a2624, girth: 1.25, legs: 0.68 },
  // a Virginia opossum: coarse white-grey, the white pointed face, black ears and legs, the naked pink tail
  opossum: { base: 'fox', k: 0.78, coat: 0xb4b0a8, belly: 0xc8c4bc, stock: 0x2a2624, headC: 0xeeeae2, ear: 0.8, earC: 0x1a1a1a, tail: 'naked', girth: 1.15, legs: 0.62 },
  // a striped skunk: glossy black, the white V of two stripes, the great plume of a tail
  skunk: { base: 'fox', k: 0.66, coat: 0x161616, belly: 0x1a1a1a, stock: 0x161616, headC: 0x161616, blaze: 0xf2f2ee, stripes: [[-0.42, 0xf2f2ee], [0.42, 0xf2f2ee]], ear: 0.55, earC: 0x161616, tail: 'plume', tailTip: 0xe8e8e4, girth: 1.25, legs: 0.55 },
  // a fox squirrel: bigger than the grey, grizzled brown-grey, the orange belly and tail
  foxsquirrel: { base: 'squirrel', k: 1.3, coat: 0x8a7258, belly: 0xc8803a, plume: 1.1, tailC: 0xa8743e },
  // an eastern chipmunk: small, red-brown, five black and two white stripes down the back
  chipmunk: { base: 'squirrel', k: 0.75, coat: 0x9a6a42, belly: 0xe8dcc8, stripes: [[0, 0x2a2220], [-0.32, 0xe8dcc8], [0.32, 0xe8dcc8], [-0.55, 0x2a2220], [0.55, 0x2a2220]], plume: 0.55 },
  // a woodchuck: chunky, grizzled brown, small ears, a short flat tail
  woodchuck: { base: 'squirrel', k: 2.3, coat: 0x6a5a48, belly: 0x8a6a4a, ear: 0.6, tail: 'stub', girth: 1.3 },
  // an American beaver: big, chestnut, the flat black paddle of a tail
  beaver: { base: 'squirrel', k: 3.2, coat: 0x5a3a24, belly: 0x6a4a34, ear: 0.5, tail: 'paddle', tailC: 0x2a2420, girth: 1.25, legs: 0.8 },
  // a black-tailed prairie dog: plump, tan-buff, the short black-tipped tail
  prairiedog: { base: 'squirrel', k: 1.3, coat: 0xb89870, belly: 0xd8c4a0, ear: 0.5, tail: 'stub', tailTip: 0x2a2420, girth: 1.2 },
  // an elk: big, tan-grey, the chocolate neck mane and legs, the cream rump; a bull's great rack
  elk: { base: 'deer', k: 1.35, coat: 0xb09a78, mane: 0x4a3426, legC: 0x3e2c20, rump: 0xe8d8b8, antlers: 'elk', antlerC: 0xc8b898 },
  // a moose: the tallest deer, dark brown-black, long pale legs, humped shoulders, the overhanging
  // muzzle and the bell; a bull's broad palms
  moose: { base: 'deer', k: 1.5, coat: 0x2e241c, mane: 0x2a2018, legC: 0x9a8a78, rump: 0x2e241c, snout: 1.35, hump: true, bell: true, ear: 1.15, antlers: 'moose', antlerC: 0xa89878, legs: 1.1 },
  // a pronghorn: tan back, white belly and rump, the black pronged horns
  pronghorn: { base: 'deer', k: 0.78, coat: 0xc08a50, belly: 0xf2eee6, legC: 0xc89a62, rump: 0xf8f6f0, antlers: 'pronghorn', antlerC: 0x1e1a18, ear: 0.9 },
  // a bighorn sheep: stocky, brown, the white rump and muzzle; a ram's massive curl
  bighorn: { base: 'deer', k: 0.85, coat: 0x7a6248, legC: 0x6a5440, rump: 0xf2eee6, antlers: 'ram', antlerC: 0xb0a088, girth: 1.3, legs: 0.82, ear: 0.7 },
};
/** A stripe along a body's back (an ellipsoid of semi-axes ax, ay, az centred at height cy): a strip on
 *  its surface — a hair proud of a lumpy coat — running front to back at the angle across the back
 *  where x = f·ax. */
function backStripe(ax: number, ay: number, az: number, cy: number, f: number, w = 0.13) {
  const pos: number[] = [];
  const n = 7, phi = Math.acos(Math.max(-0.95, Math.min(0.95, f)));
  const at = (t: number, a: number): [number, number, number] => {
    const z = az * (-0.75 + 1.4 * t), k = Math.sqrt(Math.max(0, 1 - (z / az) ** 2)) * 1.07;
    return [Math.cos(a) * ax * k, cy + Math.sin(a) * ay * k, z];
  };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const a = at(t0, phi - w), b = at(t0, phi + w), c = at(t1, phi + w), d = at(t1, phi - w);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d); // (the outward face only: it lies on the coat)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** The antlers' and horns' part: the head's (they swing with it), shown by the critter material only
 *  on the animals the sim says wear them (aAnim.z + 10). */
const ANTLER = 9;
/** One side's antlers or horns, `s` the side, from `base` on the skull (deer-base metres before the
 *  animal's size): the whitetail's forward-curving beam with its tines, the mule deer's forks, the
 *  elk's long sweeping beam, the moose's palm, the pronghorn's prong, the ram's curl. */
function antlerSide(type: NonNullable<Quad['antlers']>, s: number, base: THREE.Vector3, c: number, pivot: THREE.Vector3): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const tube = (pts: THREE.Vector3[], r0: number, r1: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const g = limb(pts[i], pts[i + 1], r0 + (r1 - r0) * (i / (pts.length - 1)), r0 + (r1 - r0) * ((i + 1) / (pts.length - 1)), 4);
      out.push(part(g, c, ANTLER));
    }
  };
  const at = (x: number, y: number, z: number) => V3(base.x + s * x, base.y + y, base.z + z);
  const tine = (from: THREE.Vector3, x: number, y: number, z: number, r = 0.012) => tube([from, V3(from.x + s * x, from.y + y, from.z + z)], r, r * 0.35);
  if (type === 'whitetail') {
    const beam = [at(0, 0, 0), at(0.1, 0.1, 0.05), at(0.2, 0.17, -0.02), at(0.21, 0.2, -0.14)];
    tube(beam, 0.018, 0.008);
    tine(beam[1], 0.0, 0.12, -0.02); tine(beam[2], -0.02, 0.13, -0.02); tine(beam[2].clone().lerp(beam[3], 0.6), -0.03, 0.1, -0.01);
  } else if (type === 'mule') {
    const fork = at(0.12, 0.14, 0.03);
    tube([at(0, 0, 0), fork], 0.018, 0.013);
    const a = at(0.22, 0.27, 0.02), b = at(0.1, 0.29, -0.06);
    tube([fork, a], 0.013, 0.01); tube([fork, b], 0.013, 0.01);
    tine(a, 0.04, 0.09, 0.03, 0.009); tine(a, -0.02, 0.1, -0.04, 0.009); tine(b, 0.02, 0.09, -0.04, 0.009); tine(b, -0.03, 0.08, 0.02, 0.009);
  } else if (type === 'elk') {
    const beam = [at(0, 0, 0), at(0.12, 0.22, 0.1), at(0.22, 0.45, 0.22), at(0.24, 0.66, 0.28), at(0.19, 0.82, 0.22)];
    tube(beam, 0.03, 0.012);
    tine(beam[0], 0.05, 0.08, -0.22, 0.018); tine(beam[1], 0.05, 0.08, -0.22, 0.016); // (the brow and bez tines, low and forward)
    tine(beam[2], 0.02, 0.16, -0.22, 0.016); tine(beam[3], 0.0, 0.14, -0.18, 0.014); tine(beam[3].clone().lerp(beam[4], 0.5), -0.02, 0.12, -0.12, 0.012);
  } else if (type === 'moose') {
    // the beam out sideways, then the palm: a broad flat plate tipped up, points along its rim
    const root = at(0, 0, 0), palm = at(0.32, 0.1, 0.04);
    tube([root, at(0.14, 0.04, 0.02)], 0.03, 0.026);
    out.push(part(blob(0.2, 61, { detail: 0, lump: 0.15 }).scale(1.35, 0.22, 0.95).rotateZ(s * 0.45).translate(palm.x, palm.y, palm.z), c, ANTLER));
    for (let i = 0; i < 5; i++) {
      const a = -0.8 + i * 0.4, p = V3(palm.x + s * Math.cos(a) * 0.24, palm.y + 0.08 + Math.sin(i * 1.3) * 0.02, palm.z + Math.sin(a) * 0.18);
      out.push(part(new THREE.ConeGeometry(0.022, 0.1, 4).rotateZ(-s * 0.6).translate(p.x, p.y + 0.04, p.z), c, ANTLER));
    }
  } else if (type === 'bison') {
    // a bison's short horns: out from the skull's side, hooking up and in
    tube([at(0, 0, 0), at(0.12, 0.02, 0), at(0.18, 0.1, 0.02), at(0.15, 0.18, 0.04)], 0.045, 0.012);
  } else if (type === 'pronghorn') {
    const top = at(0.01, 0.2, 0.04);
    tube([at(0, 0, 0), top, at(-0.02, 0.26, 0.08)], 0.022, 0.008); // (curving back and in at the tip)
    tine(at(0.005, 0.11, 0.02), 0, 0.03, -0.06, 0.012); // the prong
  } else {
    // the ram's curl: up and back from the skull, down behind the ear, forward under it
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, th = -0.4 + t * 4.4, R = 0.13 * (1 - 0.32 * t);
      pts.push(at(0.02 + 0.11 * t, -0.03 + R * Math.cos(th), 0.08 + R * Math.sin(th)));
    }
    tube(pts, 0.055, 0.018);
  }
  for (const g of out) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([pivot.x, pivot.y, pivot.z], i * 3);
    g.setAttribute('aPivot', new THREE.BufferAttribute(a, 3));
  }
  return out;
}
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
  // (package #12, the water and big birds)
  // a Canada goose: the black stocking of a neck, the white chinstrap, the brown-grey body, the flat bill
  canadagoose: { coat: 0x7a6c5c, belly: 0xcfc6b8, legC: 0x1e1e20, beakC: 0x1e1e20, legH: 0.03, beakL: 0.022, k: 3.2, plan: { bill: 'flat', hood: 0x1a1a1c, headR: 0.85, neck: [0.1, 0.1, 0.06], neckW: 0.85, cheek: 0xf2f0ea, tail: [0.05, 0.05], tailC: 0x1e1e20, body: [1.0, 0.78, 1.4], wingL: 0.1 } },
  // a mallard drake: the green head, the white collar, the chestnut breast, the grey flanks, the blue
  // speculum, the yellow bill; and the hen, mottled brown with the same blue in the wing
  mallard: { coat: 0x8e8c86, belly: 0x6e3c2a, legC: 0xe08a30, beakC: 0xd8c040, legH: 0.02, beakL: 0.02, k: 2.1, plan: { bill: 'flat', hood: 0x2a6a40, necklace: 0xf2f2ee, breast: true, bars: [0x3a50a0, 1], tail: [0.04, 0.035], tailC: 0x1e1e20, body: [1.0, 0.75, 1.45], head: [0.05, -0.08] } },
  mallardhen: { coat: 0x8a6a4a, belly: 0x9a7a58, legC: 0xe08a30, beakC: 0xb8803a, legH: 0.02, beakL: 0.02, k: 2.0, plan: { bill: 'flat', hood: 0x7a5a3e, bars: [0x3a50a0, 1], tail: [0.04, 0.035], body: [1.0, 0.75, 1.45], head: [0.05, -0.08] } },
  // a common loon: long and low on the water, the dagger bill, the back spotted white; summer black or
  // winter grey (TINT); never on land (no legs to stand on)
  loon: { coat: 0xffffff, belly: 0xf0f0ec, legC: 0x1e1e20, beakC: 0x1e1e22, legH: 0, beakL: 0.03, k: 3.2, plan: { bill: 'dagger', noLegs: true, bars: [0xf0f0ec, 3], tail: [0.035, 0.03], body: [0.95, 0.62, 1.55], head: [0.042, -0.085] } },
  // a great blue heron: blue-grey, the white face with its black plume, the long S of a grey neck, the
  // yellow dagger, legs to the knee in the water
  greatblueheron: { coat: 0x6e7c8c, belly: 0x8a96a4, legC: 0x5a4a3a, beakC: 0xd8b040, legH: 0.12, beakL: 0.06, k: 3.4, plan: { bill: 'dagger', hood: 0xeeeeea, cap: 0x1e1e22, crest: 0x1e1e22, crestTilt: 1.3, crestL: 0.04, neck: [0.11, 0.3, 0.32], neckCol: 0x9a9aa2, neckW: 0.8, tail: [0.05, 0.05], body: [0.72, 0.72, 1.35], wingL: 0.11 } },
  // a great egret: all white, the yellow bill, black legs; a snowy egret smaller, the black bill, plumes
  greategret: { coat: 0xf6f6f2, belly: 0xf6f6f2, legC: 0x1e1e20, beakC: 0xe0c040, legH: 0.12, beakL: 0.055, k: 3.0, plan: { bill: 'dagger', neck: [0.12, 0.28, 0.38], neckW: 0.7, tail: [0.05, 0.05], body: [0.68, 0.7, 1.35], wingL: 0.11 } },
  snowyegret: { coat: 0xf6f6f2, belly: 0xf6f6f2, legC: 0x1e1e20, beakC: 0x1e1e20, legH: 0.09, beakL: 0.04, k: 2.3, plan: { bill: 'dagger', crest: 0xf6f6f2, crestTilt: 1.2, crestL: 0.03, neck: [0.09, 0.3, 0.35], neckW: 0.7, tail: [0.05, 0.05], body: [0.68, 0.7, 1.35], wingL: 0.1 } },
  // a roseate spoonbill: bubblegum pink, the red shoulder, the orange tail, the bare greenish head, the
  // spoon
  spoonbill: { coat: 0xe88a98, belly: 0xeea0aa, legC: 0xb85a6a, beakC: 0xa8a890, legH: 0.09, beakL: 0.06, k: 2.7, plan: { bill: 'spoon', hood: 0xb4bc98, headR: 0.9, neck: [0.075, 0.45, 0.15], neckCol: 0xf2e4e2, bars: [0xc83a4a, 1], tail: [0.05, 0.04], tailC: 0xd88a60, body: [0.75, 0.72, 1.3], wingL: 0.1 } },
  // a sandhill crane: tall and grey, the red crown, the white cheek, the neck held up, the bustle
  sandhillcrane: { coat: 0x8c8a86, belly: 0x9c9a96, legC: 0x2a2a2a, beakC: 0x3a3a3a, legH: 0.14, beakL: 0.045, k: 3.6, plan: { bill: 'dagger', hood: 0x9a9894, cap: 0xc03030, cheek: 0xe8e6e0, neck: [0.12, 0.12, 0.08], neckW: 0.75, tail: [0.08, 0.07], tailC: 0x7a7670, body: [0.72, 0.72, 1.3], wingL: 0.11 } },
  // a turkey vulture: black-brown, the small bare red head, the ivory hook, the silver trailing half of
  // the wings, held in a V
  turkeyvulture: { coat: 0x2a2420, belly: 0x2a2420, legC: 0xb8a090, beakC: 0xe8dcc8, legH: 0.025, beakL: 0.016, k: 3.6, plan: { bill: 'hook', hood: 0xb84030, headR: 0.62, wing: [0.075, 0.17], fingers: 5, trail: 0x8a8884, tail: [0.07, 0.08], body: [0.6, 0.62, 1.45], head: [0.03, -0.085] } },
  // a bald eagle: dark brown, the white head and tail, the huge yellow hook; flat planks of wings
  baldeagle: { coat: 0x3a2a1e, belly: 0x3a2a1e, legC: 0xe0c040, beakC: 0xe8c040, legH: 0.025, beakL: 0.018, k: 4.2, plan: { bill: 'hook', hood: 0xf2f2ee, wing: [0.085, 0.17], fingers: 5, tail: [0.08, 0.07], tailC: 0xf2f2ee, body: [0.62, 0.64, 1.45], head: [0.034, -0.088] } },
  // an osprey: dark above, white below and on the head, the dark stripe through the eye, long narrow
  // wings
  osprey: { coat: 0x4a3a2c, belly: 0xf2f0ea, legC: 0x9aa0a8, beakC: 0x1e1e20, legH: 0.025, beakL: 0.016, k: 3.0, plan: { bill: 'hook', hood: 0xf2f0ea, mask: 0x3a2a1e, wing: [0.06, 0.18], fingers: 4, tail: [0.07, 0.07], tailC: 0x6a5a4a, body: [0.56, 0.6, 1.45], head: [0.03, -0.085] } },
  // a wild turkey: big, bronze-black, the bare blue head on a red neck, the wattle, white-barred wings,
  // the great fan of a tail tipped chestnut
  wildturkey: { coat: 0x3a2c22, belly: 0x2e2620, legC: 0x9a8a80, beakC: 0x9a9080, legH: 0.06, beakL: 0.014, k: 4.4, plan: { bill: 'slim', hood: 0x8aa4cc, headR: 0.62, neck: [0.06, 0.15, 0], neckCol: 0xb04a4a, neckW: 0.8, wattle: 0xc03030, barred: [0xe8e0d0, 5], tail: [0.12, 0.1], tailC: 0x4a3a2a, tailTip: 0xa08060, body: [0.95, 0.95, 1.3], wingL: 0.1 } },
  // a California quail: blue-grey, the scaled buff belly, the black face edged white, the forward-curling
  // black plume
  californiaquail: { coat: 0x6a7480, belly: 0xb89a70, legC: 0x6a5a4a, beakC: 0x2a2622, legH: 0.018, beakL: 0.012, k: 1.6, plan: { mask: 0x1a1a1a, cheek: 0xf0f0ee, crest: 0x1a1a1a, crestTilt: -0.95, crestL: 0.042, body: [1.05, 0.95, 1.05], tail: [0.04, 0.035], head: [0.04, -0.065] } },
  // a brown pelican: grey-brown, the white and yellow head, the long bill with its pouch, the neck
  brownpelican: { coat: 0x7a7268, belly: 0x6a645c, legC: 0x2a2a2a, beakC: 0xb8a888, legH: 0.03, beakL: 0.075, k: 3.4, plan: { bill: 'pouch', wattle: 0x6a6458, hood: 0xeee4c8, neck: [0.06, 0.25, 0.25], neckCol: 0xe8e2d4, wingL: 0.12, tail: [0.05, 0.04], body: [0.85, 0.8, 1.45] } },
  // the gulls: white below, the grey mantle, black wingtips; a laughing gull's hood black in summer, white
  // in winter (TINT), its bill dark red; a California gull's paler, yellow bill, yellow-green legs
  laughinggull: { coat: 0x5a6068, belly: 0xf4f4f2, legC: 0x6a2a2a, beakC: 0x8a2a2a, legH: 0.03, beakL: 0.022, k: 2.2, plan: { hood: 0xffffff, wingTip: 0x1a1a1c, wingL: 0.11, tail: [0.05, 0.05], tailC: 0xf2f2f0, body: [0.8, 0.75, 1.35] } },
  californiagull: { coat: 0x9aa2aa, belly: 0xf4f4f2, legC: 0xc0c070, beakC: 0xe0c040, legH: 0.032, beakL: 0.025, k: 2.5, plan: { hood: 0xf4f4f2, wingTip: 0x1a1a1c, wingL: 0.115, tail: [0.05, 0.05], tailC: 0xf2f2f0, body: [0.82, 0.76, 1.35] } },
  // (package #11, the backyard birds — each known at twenty metres by its colour masses, its crest
  // or bill, the way it stands; TINT parts are painted per bird: a female cardinal's tan, a pigeon's
  // own grey, a Gila woodpecker without the male's red cap)
  // a cardinal: red all over (or the female's warm tan), the crest swept back, the black mask round
  // the big orange-red seed-cracker of a bill
  cardinal: { coat: 0xffffff, belly: 0xffffff, legC: 0x8a5a4a, beakC: 0xe0603a, legH: 0.022, beakL: 0.017, k: 1.3, plan: { bill: 'thick', crest: 0xffffff, crestTilt: 0.55, crestL: 0.042, mask: 0x1a1414, tail: [0.055, 0.09] } },
  // a blue jay: blue above, white below, a black necklace, the pale face, a blue crest, a white bar
  // across the wing and white corners to the long tail
  bluejay: { coat: 0x4a78c0, belly: 0xe8eaec, legC: 0x2a2a30, beakC: 0x1e1e22, legH: 0.026, beakL: 0.022, k: 1.5, plan: { crest: 0x4a78c0, crestTilt: 0.8, crestL: 0.046, mask: 0xe4e6e8, necklace: 0x1a1a22, bars: [0xf4f4f2, 1], tail: [0.055, 0.105], tailC: 0x4670b4, tailTip: 0xf0f0ee } },
  // a robin: grey-brown back, the dark head, the brick-orange breast, the yellow bill; upright
  robin: { coat: 0x625a52, belly: 0xc4602c, legC: 0x5a4a40, beakC: 0xe0b030, legH: 0.032, beakL: 0.022, k: 1.45, plan: { hood: 0x2c2826, breast: true, tail: [0.05, 0.09], tailC: 0x2e2a28, body: [0.82, 0.82, 1.25], head: [0.052, -0.068] } },
  // a Steller's jay: deep blue, the sooty head and breast, the tall black crest, the wings barred dark
  stellersjay: { coat: 0x2a4a88, belly: 0x30508e, legC: 0x1e1e22, beakC: 0x1e1e22, legH: 0.028, beakL: 0.023, k: 1.6, plan: { hood: 0x1c1f28, crest: 0x1c1f28, crestTilt: 0.5, crestL: 0.058, necklace: 0x1c1f28, bars: [0x1a1c28, 3], tail: [0.055, 0.11], tailC: 0x2c4c8c } },
  // a Gila woodpecker: the zebra-barred back and wings, the plain tan head and belly, the male's red
  // cap (TINT), the chisel bill
  gilawoodpecker: { coat: 0xd8d2c2, belly: 0xbca88a, legC: 0x5a5a5a, beakC: 0x26262a, legH: 0.02, beakL: 0.03, k: 1.35, plan: { bill: 'chisel', hood: 0xbca88a, cap: 0xffffff, barred: [0x1c1c1e, 7], breast: true, tail: [0.045, 0.08], tailC: 0x2a2a2c, body: [0.78, 0.75, 1.3] } },
  // a mourning dove: soft grey-tan, the small round head, the slim bill, black spots on the wing and
  // the long pointed tail edged white; pink legs
  mourningdove: { coat: 0xa8987e, belly: 0xc8ae98, legC: 0xc06a5a, beakC: 0x2a2626, legH: 0.02, beakL: 0.014, k: 1.55, plan: { bill: 'slim', headR: 0.78, bars: [0x2a2622, 2], tail: [0.05, 0.15], wedge: true, tailC: 0x9a8a72, tailTip: 0xeeeae2, body: [0.78, 0.72, 1.35], wingL: 0.09 } },
  // a crow: black all over, big, the stout dagger of a bill
  crow: { coat: 0x1e1e24, belly: 0x24242a, legC: 0x1a1a1e, beakC: 0x1a1a1e, legH: 0.035, beakL: 0.026, k: 2.8, plan: { bill: 'stout', tail: [0.06, 0.09], body: [0.82, 0.78, 1.3], head: [0.05, -0.075], wingL: 0.095 } },
  // a rock pigeon: plump, its own grey (TINT), the darker head, the green neck, two black wing bars, a
  // dark band across the tail's end, pink legs
  pigeon: { coat: 0xffffff, belly: 0xffffff, legC: 0xc8605a, beakC: 0x2a2a2c, legH: 0.024, beakL: 0.016, k: 2.1, plan: { bill: 'slim', headR: 0.85, hood: 0x5e6472, neckC: 0x5a8a74, bars: [0x26262c, 2], tail: [0.06, 0.085], tailTip: 0x2a2a30, body: [0.9, 0.86, 1.25] } },
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
function broadWing(chord: number, span: number, side: number, from = 0, to = 1, lift = 0) {
  const pos: number[] = [];
  const n = 5;
  const at = (t: number, u: number, y: number): [number, number, number] => {
    const w = chord * (1 - 0.42 * t * t), lead = -w * 0.32, trail = w * 0.68 - (t > 0.8 ? (t - 0.8) * chord * 0.6 * Math.sin(t * 40) : 0);
    return [side * span * t, 0.02 * span * t * t + y, lead + (trail - lead) * u];
  };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    for (const y of lift ? [lift, -lift] : [0]) {
      const a = at(t0, from, y), b = at(t0, to, y), c = at(t1, to, y), d = at(t1, from, y);
      if (y >= 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      if (y <= 0) pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

interface BirdPlan {
  wing?: [number, number]; tail?: [number, number]; head?: [number, number]; tailC?: number; body?: [number, number, number]; band?: number; fingers?: number; crest?: number; curve?: number;
  // (package #11, the backyard birds: the marks a bird is known by at twenty metres)
  /** the crest's tilt (radians: − curls forward, a quail's topknot; + swept back, a jay's) and length */
  crestTilt?: number; crestL?: number;
  /** the head's own colour (a robin's dark head, a Steller's jay's sooty hood, a woodpecker's tan) and size */
  hood?: number; headR?: number;
  /** a crown patch (a woodpecker's red cap) */
  cap?: number;
  /** the face round the bill (a cardinal's black mask, a blue jay's pale face) */
  mask?: number;
  /** a band across the throat (a blue jay's black necklace) */
  necklace?: number;
  /** a patch on the side of the neck (a pigeon's iridescent green) */
  neckC?: number;
  /** the bill: a seed-eater's thick cone, a crow's stout dagger, a woodpecker's chisel, a dove's slim;
   *  a duck's flat one, a heron's dagger, a spoonbill's spoon, a pelican's pouch, an eagle's hook */
  bill?: keyof typeof BILL_R;
  /** bars across the wing (colour, how many: a jay's white bar, a pigeon's two black ones) */
  bars?: [number, number];
  /** barred wings (colour, how many cross-bars: a Gila woodpecker's zebra back — the closed wings lie
   *  over it) */
  barred?: [number, number];
  /** a full breast (a robin's orange, coming up to the throat) */
  breast?: boolean;
  /** the tail a long pointed wedge (a dove's), not a squared fan; its tip's colour (a dove's white corners) */
  wedge?: boolean; tailTip?: number;
  /** the folded wing's length (a crow's longer) */
  wingL?: number;
  // (package #12, the water and big birds)
  /** a long neck: its length, its lean forward from upright (radians) and its S (a heron's kink); its
   *  colour (the head's when absent) and thickness */
  neck?: [number, number, number]; neckCol?: number; neckW?: number;
  /** a band across the cheeks and under the chin (a goose's white chinstrap) */
  cheek?: number;
  /** a wattle hanging under the bill (a turkey's) */
  wattle?: number;
  /** the wing's outer third (a gull's black primaries) */
  wingTip?: number;
  /** a broad wing's trailing half (a vulture's silver flight feathers) */
  trail?: number;
  /** no legs: a bird only ever on the water (a loon) */
  noLegs?: boolean;
}
const BILL_R = { thick: 0.012, stout: 0.0095, chisel: 0.006, slim: 0.0045, flat: 0.0095, dagger: 0.0065, spoon: 0.006, pouch: 0.0085, hook: 0.011 } as const;
/** A tail: narrow at the rump, a squared fan at the tip (or a long wedge to a point), along +z,
 *  lifting a little; double-sided. `from`/`to` (0–1 of its length) cut a piece of it (the tip band). */
function tailFan(w: number, l: number, wedge: boolean, from = 0, to = 1) {
  const pos: number[] = [];
  const half = (t: number) => wedge ? w * (t < 0.55 ? 0.2 + 0.4 * (t / 0.55) : 0.6 * (1 - (t - 0.55) / 0.45) + 0.02) : w * (0.18 + 0.32 * t);
  const at = (t: number, s: number): [number, number, number] => [s * half(t), 0.05 * l * t * t, l * t];
  const n = wedge ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const t0 = from + (to - from) * i / n, t1 = from + (to - from) * (i + 1) / n;
    const a = at(t0, -1), b = at(t0, 1), c = at(t1, 1), d = at(t1, -1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** A wing card's width at `t` along its span (core.ts card). */
const cardHalf = (w: number, t: number) => w * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.5 + w * 0.08;
/** A stripe across a wing card, chord to chord, from span `t0` to `t1` (a woodpecker's barring), a
 *  hair off both faces. */
function wingStripe(w: number, l: number, bend: number, t0: number, t1: number) {
  const pos: number[] = [];
  for (const lift of [0.0012, -0.0012]) {
    const y0 = -bend * l * t0 * t0 + lift, y1 = -bend * l * t1 * t1 + lift, h0 = cardHalf(w, t0) * 0.96, h1 = cardHalf(w, t1) * 0.96;
    const a: [number, number, number] = [-h0, y0, l * t0], b: [number, number, number] = [h0, y0, l * t0];
    const c: [number, number, number] = [h1, y1, l * t1], d: [number, number, number] = [-h1, y1, l * t1];
    if (lift > 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** A bar along a wing card (card space: span along +z, chord along x, the card's droop): a strip at
 *  chord offset `x` from span `t0` to `t1`, a hair off both faces. */
function wingBar(w: number, l: number, bend: number, x: number, t0: number, t1: number) {
  const pos: number[] = [];
  const hw = w * 0.07;
  for (const lift of [0.0012, -0.0012]) {
    const n = 2;
    for (let i = 0; i < n; i++) {
      const u0 = t0 + (t1 - t0) * i / n, u1 = t0 + (t1 - t0) * (i + 1) / n;
      const y0 = -bend * l * u0 * u0 + lift, y1 = -bend * l * u1 * u1 + lift;
      const a: [number, number, number] = [x - hw, y0, l * u0], b: [number, number, number] = [x + hw, y0, l * u0];
      const c: [number, number, number] = [x + hw, y1, l * u1], d: [number, number, number] = [x - hw, y1, l * u1];
      if (lift > 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function birdGeometry(coat: number, belly: number, legC: number, beakC: number, legH: number, beakL = 0.022, o: BirdPlan = {}): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const by = legH + 0.045;
  const hooked = !o.bill && beakL < 0.02;
  const [bx, byy, bz] = o.body ?? [0.8, 0.75, 1.25];
  parts.push(still(blob(0.055, 30, { lump: 0.06 }).scale(bx, byy, bz).translate(0, by, 0), coat));
  // (a full breast: the body's own shape a little smaller, set forward and down so it shows from the
  // throat to the belly)
  if (o.breast) parts.push(still(blob(0.055 * 0.93, 31, { lump: 0.03 }).scale(bx, byy, bz).translate(0, by - 0.007, -0.013), belly));
  else parts.push(still(blob(0.04, 31, { detail: 0 }).scale(bx, byy * 0.93, bz * 0.88).translate(0, by - 0.02, -0.01), belly));
  if (o.band !== undefined) parts.push(still(blob(0.036, 33, { detail: 0 }).scale(bx * 1.05, 0.45, 0.6).translate(0, by - 0.022, 0.012), o.band)); // a dark belly band
  let neck = V3(0, by + 0.02, -0.05);
  let [hy, hz] = o.head ?? [0.045, -0.07];
  const hr = o.headR ?? 1, head = o.hood ?? coat;
  if (o.neck) {
    // a long neck off the front of the shoulders, the head on its end: two tapering pieces with an
    // S between them (a heron's), the whole of it bending at the base to graze or strike
    const [nl, lean, kink] = o.neck, nw = o.neckW ?? 1, nc = o.neckCol ?? head;
    const base = V3(0, by + 0.055 * byy * 0.45, -0.055 * bz * 0.72);
    const dir = (a: number) => V3(0, Math.cos(a), -Math.sin(a));
    const mid = base.clone().addScaledVector(dir(lean + kink), nl / 2), tip = mid.clone().addScaledVector(dir(lean - kink), nl / 2);
    parts.push(jointed(limb(base, mid, 0.02 * nw, 0.0135 * nw, 5), nc, P.skull, base));
    parts.push(jointed(limb(mid, tip, 0.0135 * nw, 0.012 * nw, 5), nc, P.skull, base));
    parts.push(jointed(new THREE.SphereGeometry(0.0135 * nw, 5, 3).translate(mid.x, mid.y, mid.z), nc, P.skull, base));
    neck = base;
    hy = tip.y + 0.006 - by; hz = tip.z - 0.008;
  }
  parts.push(jointed(blob(0.032 * hr, 32, { detail: 0, lump: 0.04 }).translate(0, by + hy, hz), head, P.skull, neck));
  // the neck: the head sits on the shoulders, not floating off the front of the body
  if (!o.neck) parts.push(jointed(blob(0.025 * Math.max(0.85, hr), 38, { detail: 0, lump: 0.03 }).scale(bx * 1.15, 1, 1).translate(0, by + 0.012 + hy * 0.45, -0.04 + (hz + 0.04) * 0.55), head, P.skull, neck));
  const face = hz - 0.025 * hr; // (where the bill leaves the face)
  if (o.curve) {
    // a long bill curving down from its base (an ibis): hinge the cone at the face and bend it
    const bill = new THREE.ConeGeometry(0.007, beakL, 4).rotateX(-Math.PI / 2).translate(0, 0, -beakL / 2).rotateX(-o.curve);
    parts.push(jointed(bill.translate(0, by + hy - 0.005, face), beakC, P.skull, neck));
  } else {
    const b = o.bill, hook = hooked || b === 'hook';
    const beak = new THREE.ConeGeometry(b ? BILL_R[b] : 0.008, beakL, b === 'thick' || b === 'hook' ? 5 : 4).rotateX(-Math.PI / 2);
    // (a duck's, a spoonbill's and a pelican's bills flat and broad)
    if (b === 'flat' || b === 'spoon' || b === 'pouch') beak.scale(b === 'flat' ? 1.5 : 1.2, b === 'flat' ? 0.42 : 0.4, 1);
    if (hook) beak.rotateX(0.5); // a raptor's short down-hooked bill
    const by0 = by + hy - 0.005 * hr - (hook ? 0.004 : 0), bz0 = face - beakL / 2;
    parts.push(jointed(beak.translate(0, by0, bz0), beakC, P.skull, neck));
    // the spoon at the tip; the pelican's pouch slung under the bill's length
    if (b === 'spoon') parts.push(jointed(blob(0.011, 39, { detail: 0, lump: 0 }).scale(1.25, 0.3, 1.15).translate(0, by0, face - beakL * 0.92), beakC, P.skull, neck));
    if (b === 'pouch') parts.push(jointed(blob(0.016, 40, { detail: 0, lump: 0 }).scale(0.75, 0.7, beakL / 0.034).translate(0, by0 - 0.012, bz0 + beakL * 0.08), o.wattle ?? beakC, P.skull, neck));
  }
  if (o.wattle !== undefined && o.bill !== 'pouch') parts.push(jointed(blob(0.01 * hr, 41, { detail: 0, lump: 0 }).scale(0.7, 1.5, 0.7).translate(0, by + hy - 0.022 * hr, face + 0.004), o.wattle, P.skull, neck));
  if (o.cheek !== undefined) parts.push(jointed(blob(0.02 * hr, 42, { detail: 0, lump: 0 }).scale(1.7, 0.7, 0.85).translate(0, by + hy - 0.009 * hr, hz + 0.002), o.cheek, P.skull, neck));
  // the face's marks: a mask round the bill and eyes, a crown patch, a necklace, a neck patch
  if (o.mask !== undefined) parts.push(jointed(blob(0.018 * hr, 34, { detail: 0, lump: 0 }).scale(1.45, 0.95, 0.7).translate(0, by + hy - 0.004 * hr, hz - 0.021 * hr), o.mask, P.skull, neck));
  if (o.cap !== undefined) parts.push(jointed(blob(0.016 * hr, 35, { detail: 0, lump: 0 }).scale(1, 0.55, 1.25).translate(0, by + hy + 0.026 * hr, hz + 0.002), o.cap, P.skull, neck));
  if (o.necklace !== undefined) parts.push(still(blob(0.03, 36, { detail: 0, lump: 0 }).scale(bx * 1.2, 0.24, 0.6).rotateX(0.5).translate(0, by + 0.018, -0.054), o.necklace));
  if (o.neckC !== undefined) parts.push(still(blob(0.026, 37, { detail: 0, lump: 0 }).scale(bx * 1.3, 0.85, 0.75).translate(0, by + 0.024, -0.05), o.neckC));
  // a crest / topknot off the crown: curling forward (a quail's) or swept back (a jay's, a cardinal's)
  if (o.crest !== undefined) {
    const cl = o.crestL ?? 0.035;
    parts.push(jointed(new THREE.ConeGeometry(0.009 * (cl / 0.035) ** 0.5, cl, 4).rotateX(o.crestTilt ?? -0.6).translate(0, by + hy + 0.03 * hr + cl * 0.4, hz + (o.crestTilt ?? -0.6) * cl * 0.25), o.crest, P.skull, neck));
  }
  // the tail: a fan (or a dove's wedge) off the rump, flicked about its root
  const [tw, tl] = o.tail ?? [0.05, 0.07];
  const root = V3(0, by + 0.01, 0.04);
  const cut = o.tailTip !== undefined ? 0.8 : 1;
  parts.push(jointed(tailFan(tw, tl, !!o.wedge, 0, cut).translate(root.x, root.y, root.z), o.tailC ?? coat, P.tail, root));
  if (o.tailTip !== undefined) parts.push(jointed(tailFan(tw, tl, !!o.wedge, cut, 1).translate(root.x, root.y, root.z), o.tailTip, P.tail, root));
  const wl = o.wingL ?? 0.085;
  for (const s of [-1, 1]) {
    // the shoulder at the flank (the critter material closes the wing along the body's side from
    // there); a soaring bird's broad wing from inside the body
    const sh = o.wing ? V3(s * 0.03, by + 0.02, -0.02) : V3(s * 0.052 * bx, by + 0.02, -0.022);
    const wing = o.wing ? broadWing(o.wing[0], o.wing[1], s) : card(0.05, wl, 0.1, 2).rotateY(s * Math.PI / 2);
    parts.push(jointed(wing.translate(sh.x, sh.y, sh.z), coat, P.wing, sh));
    if (o.wingTip !== undefined && !o.wing) parts.push(jointed(wingStripe(0.05, wl, 0.1, 0.62, 1).rotateY(s * Math.PI / 2).translate(sh.x, sh.y, sh.z), o.wingTip, P.wing, sh));
    if (o.trail !== undefined && o.wing) parts.push(jointed(broadWing(o.wing[0], o.wing[1], s, 0.55, 1, 0.0015).translate(sh.x, sh.y, sh.z), o.trail, P.wing, sh));
    if (o.barred && !o.wing) {
      const [bc, nb] = o.barred;
      for (let b = 0; b < nb; b++) {
        const t0 = 0.12 + (0.8 * b) / nb;
        parts.push(jointed(wingStripe(0.05, wl, 0.1, t0, t0 + 0.4 / nb).rotateY(s * Math.PI / 2).translate(sh.x, sh.y, sh.z), bc, P.wing, sh));
      }
    }
    if (o.bars && !o.wing) {
      // bars across the closed wing (card space: chord along x — a physical front-to-back offset is
      // −s·x — span along z)
      const [bc, nb] = o.bars;
      for (let b = 0; b < nb; b++) {
        const zc = nb === 1 ? 0.004 : -0.006 + (0.016 * b) / (nb - 1);
        parts.push(jointed(wingBar(0.05, wl, 0.1, -s * zc, 0.12, 0.62).rotateY(s * Math.PI / 2).translate(sh.x, sh.y, sh.z), bc, P.wing, sh));
      }
    }
    if (o.wing && o.fingers) {
      // the fingered primaries: separate slotted feathers fanning off the wing tip
      const [ch, sp] = o.wing;
      for (let f = 0; f < o.fingers; f++) {
        const a = (f / (o.fingers - 1) - 0.5) * 0.55;
        const fg = card(ch * 0.16, sp * 0.24, 0.05, 1).rotateY(s * (Math.PI / 2 - a)).translate(sh.x + s * sp * 0.93, sh.y + 0.02 * sp, sh.z + ch * (0.05 + f * 0.1));
        parts.push(jointed(fg, 0x3a2f28, P.wing, sh));
      }
    }
    // (one leg 'fore', one 'hind': GAIT's phase offset makes a hop — both together — or a walk)
    if (!o.noLegs) parts.push(jointed(limb(V3(s * 0.012, by - 0.02, 0.005), V3(s * 0.012, 0, -0.005), 0.004, 0.003, 3), legC, s < 0 ? P.fore : P.hind, V3(s * 0.012, by - 0.02, 0)));
    parts.push(jointed(new THREE.SphereGeometry(0.006 * Math.max(0.85, hr), 4, 3).translate(s * 0.02 * hr, by + hy + 0.01 * hr, hz - 0.015 * hr), 0x121010, P.skull, neck));
  }
  return merge(parts);
}

// ---- package #14: the new plans (models.md: bear†, bovid†, armadillo†, swimmer†) ----
// Each a builder of its own over the same joints (P.fore, P.hind, P.skull, P.tail: the critter material
// animates them as it does every animal), with its rows as parameters, so a grizzly, a cow or a javelina
// is a row later. Front toward −z, feet at y 0, real metres (before the sim's scale).

interface BearRow { k?: number; coat?: number; muzzle?: number; hump?: number }
/** The bear plan: a heavy rounded body, the rump as high as the shoulders, a thick neck, the round head
 *  and its tan muzzle, small round ears, thick pigeon-toed legs, a stub of a tail. Coat TINT: the sim
 *  paints a black bear black in the East, black, cinnamon, brown or blond in the West. */
function bearGeometry(o: BearRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], coat = o.coat ?? 0xffffff, legH = 0.42, by = legH + 0.3;
  parts.push(still(blob(0.7, 91, { lump: 0.1 }).scale(0.45, 0.48, 0.95).translate(0, by, 0), coat));
  parts.push(still(blob(0.36, 92, { detail: 0, lump: 0.1 }).scale(0.85, 0.85, 0.9).translate(0, by + 0.04, 0.38), coat)); // (the rump)
  parts.push(still(blob(0.3, 93, { detail: 0, lump: 0.1 }).scale(0.9, 0.8, 1.1).translate(0, by + 0.14 * (o.hump ?? 1), -0.36), coat)); // (the shoulders)
  const neck = V3(0, by + 0.12, -0.5), head = V3(0, by + 0.06, -0.86);
  parts.push(jointed(limb(V3(0, by + 0.08, -0.45), head, 0.2, 0.15, 6), coat, P.skull, neck));
  parts.push(jointed(blob(0.19, 94, { lump: 0.06 }).scale(0.95, 0.88, 1.0).translate(head.x, head.y, head.z), coat, P.skull, neck));
  parts.push(jointed(new THREE.ConeGeometry(0.095, 0.24, 6).rotateX(-Math.PI / 2).translate(0, head.y - 0.04, head.z - 0.22), o.muzzle ?? 0xa88a68, P.skull, neck));
  parts.push(jointed(new THREE.SphereGeometry(0.035, 5, 4).translate(0, head.y - 0.03, head.z - 0.34), 0x161210, P.skull, neck)); // (the nose)
  for (const s of [-1, 1]) {
    parts.push(jointed(new THREE.SphereGeometry(0.055, 6, 4).scale(1, 1, 0.55).translate(s * 0.12, head.y + 0.16, head.z + 0.03), coat, P.skull, neck)); // ears
    parts.push(jointed(new THREE.SphereGeometry(0.018, 4, 3).translate(s * 0.085, head.y + 0.05, head.z - 0.15), 0x120e0c, P.skull, neck)); // eyes
    const sh = V3(s * 0.17, by - 0.02, -0.4), hip = V3(s * 0.19, by, 0.42);
    parts.push(jointed(limb(sh, V3(s * 0.18, 0.06, -0.47), 0.105, 0.075, 6), coat, P.fore, sh));
    parts.push(jointed(blob(0.075, 95, { detail: 0, lump: 0 }).scale(1, 0.55, 1.35).rotateY(s * 0.25).translate(s * 0.17, 0.04, -0.52), coat, P.fore, sh)); // (the paw, toed in)
    const hock = V3(s * 0.2, 0.22, 0.52);
    parts.push(jointed(limb(hip, hock, 0.14, 0.085, 6), coat, P.hind, hip));
    parts.push(jointed(limb(hock, V3(s * 0.19, 0.04, 0.44), 0.08, 0.07, 5), coat, P.hind, hip));
    parts.push(jointed(blob(0.08, 96, { detail: 0, lump: 0 }).scale(1, 0.5, 1.5).rotateY(s * 0.25).translate(s * 0.18, 0.035, 0.38), coat, P.hind, hip));
  }
  const tb = V3(0, by + 0.12, 0.66);
  parts.push(jointed(blob(0.06, 97, { detail: 0 }).translate(tb.x, tb.y, tb.z), coat, P.tail, tb));
  return scaleGeo(merge(parts), o.k ?? 1);
}

/** The bovid plan, as a bison: the great woolly forequarters and head, the high hump, the lighter, smaller
 *  rear, the head carried low with its beard, short curved horns (both sexes), the tufted tail. */
function bisonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], wool = 0x3a2618, rear = 0x6e4e32, horn = 0x1a1614;
  parts.push(still(blob(0.55, 101, { lump: 0.12 }).scale(0.78, 0.82, 1.15).translate(0, 1.12, 0.48), rear));
  parts.push(still(blob(0.78, 102, { lump: 0.25 }).scale(0.85, 0.95, 0.95).translate(0, 1.25, -0.25), wool));
  parts.push(still(blob(0.45, 103, { detail: 0, lump: 0.2 }).scale(0.75, 1, 1.15).translate(0, 1.58, -0.18), wool)); // (the hump)
  const neck = V3(0, 1.1, -0.62), head = V3(0, 0.88, -1.02);
  parts.push(jointed(blob(0.34, 104, { lump: 0.3 }).scale(0.9, 1, 1.1).translate(head.x, head.y, head.z), wool, P.skull, neck));
  parts.push(jointed(blob(0.2, 105, { detail: 0, lump: 0.3 }).scale(0.55, 1.25, 0.6).translate(0, head.y - 0.32, head.z + 0.04), wool, P.skull, neck)); // (the beard)
  parts.push(jointed(blob(0.15, 106, { detail: 0, lump: 0 }).scale(1, 0.8, 0.9).translate(0, head.y - 0.12, head.z - 0.3), 0x241810, P.skull, neck)); // (the muzzle)
  for (const s of [-1, 1]) {
    parts.push(jointed(new THREE.SphereGeometry(0.03, 4, 3).translate(s * 0.17, head.y + 0.06, head.z - 0.16), 0x0e0a08, P.skull, neck)); // eyes
    for (const g of antlerSide('bison', s, V3(s * 0.22, head.y + 0.16, head.z + 0.02), horn, neck)) parts.push(g);
    const sh = V3(s * 0.24, 1.0, -0.45), hip = V3(s * 0.22, 1.0, 0.68);
    parts.push(jointed(blob(0.24, 107, { detail: 0, lump: 0.3 }).scale(0.8, 1.1, 0.9).translate(s * 0.24, 0.72, -0.48), wool, P.fore, sh)); // (the woolly chaps)
    parts.push(jointed(limb(V3(s * 0.24, 0.6, -0.48), V3(s * 0.23, 0, -0.5), 0.085, 0.06, 5), 0x2a1c12, P.fore, sh));
    const hock = V3(s * 0.21, 0.42, 0.8);
    parts.push(jointed(limb(hip, hock, 0.15, 0.08, 6), rear, P.hind, hip));
    parts.push(jointed(limb(hock, V3(s * 0.2, 0, 0.72), 0.07, 0.055, 5), 0x2a1c12, P.hind, hip));
  }
  const tb = V3(0, 1.3, 1.08);
  parts.push(jointed(limb(tb, V3(0, 0.85, 1.18), 0.03, 0.02, 4), rear, P.tail, tb));
  parts.push(jointed(blob(0.06, 108, { detail: 0, lump: 0.2 }).scale(0.8, 1.6, 0.8).translate(0, 0.78, 1.19), wool, P.tail, tb)); // (the tuft)
  return merge(parts);
}

/** The armadillo plan: a small body under its shell — a front shield, nine hinged bands, a rear shield —
 *  the pointed head, the upright ears, short legs, the long scaled tail. */
function armadilloGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], skin = 0xb09a8c, shell = 0x9a8878, band = 0x857464, by = 0.17;
  parts.push(still(blob(0.14, 111, { detail: 0, lump: 0.05 }).scale(0.9, 0.7, 1.4).translate(0, by - 0.02, 0), skin));
  parts.push(still(blob(0.17, 112, { lump: 0.04 }).scale(0.92, 0.72, 0.8).translate(0, by + 0.01, -0.12), shell)); // (the front shield)
  parts.push(still(blob(0.16, 113, { lump: 0.04 }).scale(0.92, 0.72, 0.75).translate(0, by + 0.01, 0.14), shell)); // (the rear shield)
  for (let i = 0; i < 9; i++) {
    // the bands: arches across the middle of the back, each a hair proud of the last
    const z = -0.06 + i * 0.015, r = 0.158 + Math.sin((i / 8) * Math.PI) * 0.008;
    const arch = new THREE.CylinderGeometry(r, r, 0.016, 10, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(0.92, 0.72, 1).translate(0, by + 0.01, z);
    parts.push(still(arch, i % 2 ? band : shell));
  }
  const neck = V3(0, by, -0.2), head = V3(0, by - 0.02, -0.27);
  parts.push(jointed(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2).translate(head.x, head.y, head.z - 0.04), skin, P.skull, neck)); // (the pointed head)
  parts.push(jointed(blob(0.05, 114, { detail: 0, lump: 0 }).scale(0.85, 0.8, 0.9).translate(head.x, head.y + 0.01, head.z + 0.03), shell, P.skull, neck)); // (its little shield)
  for (const s of [-1, 1]) {
    parts.push(jointed(new THREE.ConeGeometry(0.018, 0.06, 4).translate(s * 0.03, head.y + 0.06, head.z + 0.05), skin, P.skull, neck)); // ears, upright
    const sh = V3(s * 0.08, by - 0.05, -0.1), hip = V3(s * 0.08, by - 0.05, 0.12);
    parts.push(jointed(limb(sh, V3(s * 0.085, 0, -0.11), 0.022, 0.016, 4), skin, P.fore, sh));
    parts.push(jointed(limb(hip, V3(s * 0.085, 0, 0.12), 0.026, 0.018, 4), skin, P.hind, hip));
  }
  const tb = V3(0, by - 0.02, 0.24), tip = [V3(0, by - 0.05, 0.36), V3(0, by - 0.1, 0.46), V3(0, by - 0.13, 0.54)];
  let prev = tb;
  tip.forEach((q, i) => { parts.push(jointed(limb(prev, q, 0.03 - i * 0.008, 0.022 - i * 0.007, 5), i % 2 ? band : shell, P.tail, tb)); prev = q; });
  return merge(parts);
}

/** The swimmer plan, as a manatee: the grey wrinkled potato of a body, the round paddle tail, the
 *  flippers, the square whiskered snout, algae on its back (no legs: it never leaves the water). */
function manateeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], hide = 0x6a665e, by = 0.392; // (its belly at the origin)
  parts.push(still(blob(1, 121, { lump: 0.08 }).scale(0.55, 0.45, 1.3).translate(0, by, 0), hide));
  parts.push(still(blob(0.55, 122, { detail: 0, lump: 0.2 }).scale(0.8, 0.25, 1.4).translate(0.05, by + 0.36, 0.1), 0x5e6a52)); // (algae on its back)
  const neck = V3(0, by, -1.1);
  parts.push(jointed(blob(0.32, 123, { lump: 0.08 }).scale(0.95, 0.85, 0.85).translate(0, by - 0.02, -1.38), hide, P.skull, neck));
  parts.push(jointed(blob(0.2, 124, { detail: 0, lump: 0 }).scale(1.15, 0.9, 0.7).translate(0, by - 0.06, -1.62), 0x7a766c, P.skull, neck)); // (the square snout)
  for (const s of [-1, 1]) {
    const f = V3(s * 0.45, by - 0.15, -0.65);
    parts.push(jointed(blob(0.22, 125, { detail: 0, lump: 0 }).scale(0.5, 0.18, 1).rotateY(s * 0.6).translate(f.x + s * 0.12, f.y - 0.05, f.z - 0.05), hide, P.fore, f)); // flippers
    parts.push(jointed(new THREE.SphereGeometry(0.03, 4, 3).translate(s * 0.2, by + 0.06, -1.5), 0x161412, P.skull, neck)); // eyes
  }
  const tb = V3(0, by - 0.05, 1.2);
  parts.push(jointed(blob(0.5, 126, { lump: 0.05 }).scale(1.1, 0.14, 0.9).translate(tb.x, tb.y, tb.z + 0.38), hide, P.tail, tb)); // (the round paddle)
  return merge(parts);
}

// ---- package #15: the reptiles (models.md: sprawler†, turtle†) ----
interface SprawlerRow { len: number; coat: number; belly: number; snout: 'broad' | 'pointed'; tail: number; scutes?: number; dewlap?: number; slim?: number }
/** The sprawler plan: a long low body slung between legs splayed out to the sides, the flat head and its
 *  snout (an alligator's broad and rounded, an anole's pointed), the eyes raised on top, the long
 *  tapering tail; an alligator's ridged scutes along the back and tail; an anole's throat fan on the
 *  display part (9: shown only while it displays). Built at a nominal length, scaled to `len` metres. */
function sprawlerGeometry(o: SprawlerRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], legH = 0.035, by = legH + 0.045, w = o.slim ?? 1;
  parts.push(still(blob(0.5, 131, { lump: 0.05 }).scale(0.17 * w, 0.085, 0.34).translate(0, by, 0), o.coat));
  parts.push(still(blob(0.4, 132, { detail: 0, lump: 0 }).scale(0.18 * w, 0.07, 0.36).translate(0, by - 0.018, 0), o.belly));
  const neck = V3(0, by, -0.15), hz = -0.21; // (the head on the shoulders, no neck to speak of)
  // (a head the size of a fingertip needs no finer mesh: an anole's is the plain icosahedron)
  parts.push(jointed(blob(0.5, 133, { lump: 0.04, detail: o.len > 1 ? 1 : 0 }).scale(0.13 * w, 0.066, 0.2).translate(0, by + 0.004, hz), o.coat, P.skull, neck));
  // (an alligator's snout broad, flat and rounded at the end; an anole's a point)
  const snout = o.snout === 'broad' ? blob(0.5, 136, { lump: 0.03 }).scale(0.1 * w, 0.045, 0.22) : new THREE.ConeGeometry(0.03, 0.12, 5).rotateX(-Math.PI / 2).scale(w, 0.7, 1);
  parts.push(jointed(snout.translate(0, by - 0.006, hz - (o.snout === 'broad' ? 0.14 : 0.15)), o.coat, P.skull, neck));
  for (const s of [-1, 1]) {
    parts.push(jointed(new THREE.SphereGeometry(0.014, 5, 3).translate(s * 0.035 * w, by + 0.03, hz + 0.02), o.snout === 'broad' ? 0x6a6a30 : 0x1a1a14, P.skull, neck)); // (eyes up on top)
    for (const [fz, part] of [[-0.12, P.fore], [0.12, P.hind]] as [number, number][]) {
      const sh = V3(s * 0.06 * w, by - 0.005, fz), elbow = V3(s * 0.13 * w, by + 0.008, fz - 0.005), foot = V3(s * 0.15 * w, 0.006, fz - 0.03);
      parts.push(jointed(limb(sh, elbow, 0.022 * w, 0.017 * w, 4), o.coat, part, sh));
      parts.push(jointed(limb(elbow, foot, 0.017 * w, 0.013 * w, 4), o.coat, part, sh));
      parts.push(jointed(blob(0.025 * w, 134, { detail: 0, lump: 0 }).scale(1.1, 0.3, 1.3).translate(foot.x, 0.006, foot.z - 0.01), o.coat, part, sh));
    }
  }
  // the tail: tapering out behind, a little to one side
  // (it drops to the ground but rests on it: never lower than its own thickness)
  const tb = V3(0, by, 0.15), n = 6, tr = (t: number) => 0.055 * w * (1 - t * 0.85), ty = (t: number) => Math.max(tr(t), by - (by - 0.012) * Math.min(1, t * 1.6));
  let prev = tb;
  for (let i = 1; i <= n; i++) {
    const t = i / n, q = V3(Math.sin(t * 2.2) * 0.04 * o.tail, ty(t), 0.15 + o.tail * t);
    parts.push(jointed(limb(prev, q, tr(t - 1 / n), tr(t), 5), o.coat, P.tail, tb));
    prev = q;
  }
  if (o.scutes !== undefined) {
    // the scutes: two rows of ridges down the back, one down the tail
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) parts.push(still(new THREE.ConeGeometry(0.011, 0.022, 4).translate(s * 0.035, by + 0.04, -0.12 + i * 0.033), o.scutes));
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 8, z = 0.15 + o.tail * t * 0.85;
      parts.push(jointed(new THREE.ConeGeometry(0.009, 0.02 * (1 - t * 0.6), 4).translate(Math.sin(t * 0.85 * 2.2) * 0.04 * o.tail, ty(t * 0.85) + tr(t * 0.85) * 0.8, z), o.scutes, P.tail, tb));
    }
  }
  if (o.dewlap !== undefined) {
    // an anole's throat fan, out only while it displays (the display part)
    const g = blob(0.05, 135, { detail: 0, lump: 0 }).scale(0.12, 1, 1.15).translate(0, by - 0.05, hz + 0.02);
    const f = part(g, o.dewlap, ANTLER), m = f.attributes.position.count, pv = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) pv.set([neck.x, neck.y, neck.z], i * 3);
    f.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
    parts.push(f);
  }
  return scaleGeo(merge(parts), o.len / (0.48 + o.tail));
}

interface TurtleRow { len: number; shell: number; rim: number; skin: number; stripe: number; ear?: number }
/** The turtle plan: the domed shell with its coloured rim, the pale plastron under it, the head on its
 *  neck (striped), a patch behind the eye (a slider's red or yellow), four short flippered legs, the
 *  stub of a tail. Built with a nominal shell of 1, scaled to `len` metres of shell. */
function turtleGeometry(o: TurtleRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], by = 0.12; // (the shell riding low, its legs splayed)
  parts.push(still(blob(0.5, 141, { lump: 0.04 }).scale(0.8, 0.4, 1).translate(0, by + 0.04, 0), o.shell));
  parts.push(still(new THREE.TorusGeometry(0.4, 0.03, 4, 16).rotateX(Math.PI / 2).scale(1, 1, 1.24).translate(0, by - 0.01, 0), o.rim)); // (the rim)
  parts.push(still(blob(0.45, 142, { detail: 0, lump: 0 }).scale(0.82, 0.14, 1.0).translate(0, by - 0.05, 0), 0xd8c890)); // (the plastron)
  const neck = V3(0, by, -0.44), head = V3(0, by + 0.08, -0.66);
  parts.push(jointed(limb(neck, head, 0.07, 0.055, 5), o.skin, P.skull, neck));
  parts.push(jointed(limb(V3(0.035, by + 0.03, -0.46), V3(0.04, by + 0.1, -0.64), 0.012, 0.01, 3), o.stripe, P.skull, neck)); // (the neck's stripe)
  parts.push(jointed(blob(0.085, 143, { detail: 0, lump: 0 }).scale(0.85, 0.75, 1.25).translate(head.x, head.y, head.z), o.skin, P.skull, neck));
  for (const s of [-1, 1]) {
    if (o.ear !== undefined) parts.push(jointed(blob(0.03, 144, { detail: 0, lump: 0 }).scale(0.5, 0.8, 1.4).translate(s * 0.06, head.y + 0.005, head.z + 0.04), o.ear, P.skull, neck)); // (a slider's mark behind the eye)
    parts.push(jointed(new THREE.SphereGeometry(0.016, 4, 3).translate(s * 0.055, head.y + 0.025, head.z - 0.04), 0x141410, P.skull, neck));
    for (const [fz, part] of [[-0.28, P.fore], [0.3, P.hind]] as [number, number][]) {
      const sh = V3(s * 0.3, by - 0.02, fz);
      parts.push(jointed(limb(sh, V3(s * 0.46, 0.015, fz - 0.05 * Math.sign(-fz)), 0.05, 0.035, 4), o.skin, part, sh));
      parts.push(jointed(blob(0.05, 145, { detail: 0, lump: 0 }).scale(1.25, 0.3, 1.15).translate(s * 0.48, 0.012, fz - 0.06 * Math.sign(-fz)), o.skin, part, sh));
    }
  }
  const tb = V3(0, by - 0.02, 0.48);
  parts.push(jointed(new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI / 2).translate(tb.x, tb.y, tb.z + 0.05), o.skin, P.tail, tb));
  return scaleGeo(merge(parts), o.len);
}

// ---- package #16: the small life (models.md: the butterfly row, dragonfly†, bug†, slug†, crab†) ----
type XZ = [number, number];
/** A flat panel in the xz plane at height `y` (a wing, a mark painted on it): a fan from its first point;
 *  `face` 1 seen from above only, −1 from below only, 0 both. */
function flat(poly: XZ[], y: number, face: -1 | 0 | 1 = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i + 1 < poly.length; i++) {
    const [a, b, c] = [poly[0], poly[i], poly[i + 1]];
    // (wound so its normal is +y; the under face the other way)
    const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
    const [p, q] = up ? [b, c] : [c, b];
    if (face >= 0) pos.push(a[0], y, a[1], p[0], y, p[1], q[0], y, q[1]);
    if (face <= 0) pos.push(a[0], y, a[1], q[0], y, q[1], p[0], y, p[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** A thin strip from a to b (a vein), `w` wide. */
const vein = (a: XZ, b: XZ, w: number): XZ[] => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = (-dz / L) * w * 0.5, nz = (dx / L) * w * 0.5;
  return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
};
/** A small round spot (a white dot on a wing's border), `r` across. */
const spot = (c: XZ, r: number, n = 5): XZ[] => Array.from({ length: n }, (_, i) => [c[0] + Math.cos((i / n) * 6.283) * r, c[1] + Math.sin((i / n) * 6.283) * r] as XZ);
const mirror = (poly: XZ[], s: number): XZ[] => poly.map(([x, z]) => [x * s, z] as XZ);
/** A thin open rod from a to b (an insect's leg, a feeler, an eyestalk): three sides, no caps. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length() || 1e-4;
  const g = new THREE.CylinderGeometry(r1, r0, L, 3, 1, true).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** The monarch (the butterfly row's own): orange wings veined in black, the black borders dotted white,
 *  the forewing's black tip with its orange and white spots; underneath paler, the hindwing's veins bold;
 *  the black body dotted white, the clubbed antennae. Wings on the wing part about the body's line
 *  (critterMaterial: a flap and a glide; at rest closed up over the back). Real size: 10 cm across. */
function monarchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], root = V3(0, 0, 0);
  const BLACK = 0x1a1612, ORANGE = 0xe0761c, UNDER = 0xe8a050, WHITE = 0xf2eee4;
  const FORE: XZ[] = [[0.003, -0.006], [0.02, -0.014], [0.038, -0.021], [0.05, -0.02], [0.049, -0.012], [0.044, -0.002], [0.036, 0.004], [0.012, 0.004], [0.003, 0.002]];
  const FORE_IN: XZ[] = [[0.006, -0.005], [0.02, -0.0115], [0.034, -0.0165], [0.04, -0.013], [0.041, -0.004], [0.034, 0.0015], [0.013, 0.0015], [0.006, 0.0005]];
  const HIND: XZ[] = [[0.003, 0.002], [0.018, 0.0], [0.03, 0.006], [0.036, 0.016], [0.032, 0.027], [0.022, 0.033], [0.01, 0.032], [0.004, 0.022], [0.002, 0.01]];
  const HIND_IN: XZ[] = [[0.006, 0.004], [0.018, 0.0025], [0.028, 0.008], [0.032, 0.016], [0.029, 0.024], [0.02, 0.0285], [0.011, 0.028], [0.006, 0.02]];
  const VEINS: [XZ, XZ][] = [[[0.005, -0.002], [0.04, -0.011]], [[0.005, -0.001], [0.038, -0.003]], [[0.008, 0.0], [0.03, 0.0015]], [[0.024, -0.009], [0.027, 0.001]],
    [[0.005, 0.006], [0.028, 0.008]], [[0.005, 0.006], [0.031, 0.017]], [[0.005, 0.006], [0.026, 0.026]], [[0.005, 0.006], [0.016, 0.029]], [[0.005, 0.006], [0.008, 0.026]]];
  const DOTS: XZ[] = [[0.046, -0.017], [0.047, -0.012], [0.045, -0.007], [0.041, 0.0], [0.034, 0.016], [0.031, 0.025], [0.024, 0.031], [0.015, 0.031], [0.007, 0.029], [0.042, -0.019]];
  const APEX: XZ[] = [[0.043, -0.0155], [0.04, -0.0185]]; // (the orange spots in the black tip)
  for (const s of [-1, 1]) {
    const w = (poly: XZ[], y: number, hex: number, face: -1 | 0 | 1) => parts.push(jointed(flat(mirror(poly, s), y, face), hex, P.wing, root));
    w(FORE, 0, BLACK, 0); w(HIND, 0, BLACK, 0);
    for (const [y, hex, face] of [[0.0012, ORANGE, 1], [-0.0012, UNDER, -1]] as [number, number, -1 | 1][]) {
      w(FORE_IN, y, hex, face); w(HIND_IN, y, hex, face);
      for (const [a, b] of VEINS) w(vein(a, b, face < 0 ? 0.0016 : 0.0011), y * 2, BLACK, face);
      for (const d of DOTS) w(spot(d, 0.0011), y * 2, WHITE, face);
      for (const d of APEX) w(spot(d, 0.0014), y * 2, face > 0 ? ORANGE : UNDER, face);
    }
  }
  // the body: the thorax and its white dots, the slim abdomen, the head and its clubbed antennae
  parts.push(still(blob(0.5, 151, { detail: 0, lump: 0 }).scale(0.007, 0.006, 0.011).translate(0, 0, -0.003), BLACK));
  parts.push(still(limb(V3(0, -0.0005, 0.002), V3(0, -0.0015, 0.022), 0.0032, 0.0018, 5), BLACK));
  parts.push(still(new THREE.SphereGeometry(0.0034, 5, 4).translate(0, 0.0006, -0.0105), BLACK));
  for (const s of [-1, 1]) {
    parts.push(still(new THREE.SphereGeometry(0.0009, 4, 2).translate(s * 0.0022, 0.0028, -0.006), WHITE));
    parts.push(still(new THREE.SphereGeometry(0.0009, 4, 2).translate(s * 0.0016, 0.0034, -0.012), WHITE));
    parts.push(still(rod(V3(s * 0.001, 0.002, -0.013), V3(s * 0.006, 0.008, -0.026), 0.00045, 0.00045), BLACK));
    parts.push(still(new THREE.SphereGeometry(0.0011, 4, 2).translate(s * 0.006, 0.008, -0.026), BLACK)); // (the clubs)
  }
  return merge(parts);
}

interface DragonflyRow { len: number; thorax: number; eyes: number; wing: number; vein: number }
/** The dragonfly plan (dragonfly†): the great eyes meeting on top of the head, the thick thorax, the long
 *  thin abdomen (TINT: a male green darner's blue, a female's red-brown) ringed dark at each segment, four
 *  long clear wings held straight out (dark leading edge, the dark stigma near each tip), six legs folded
 *  forward. Wings on the wing part about their roots (critterMaterial's bug mode: held out at rest, a
 *  blur of a beat on the wing). Built at a nominal 7.5 cm, scaled to `len`. */
function dragonflyGeometry(o: DragonflyRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], wy = 0.017;
  for (const s of [-1, 1]) parts.push(still(new THREE.SphereGeometry(0.0046, 6, 4).translate(s * 0.0034, 0.0125, -0.029), o.eyes)); // (the eyes, meeting on top)
  parts.push(still(blob(0.5, 161, { detail: 0, lump: 0 }).scale(0.006, 0.006, 0.004).translate(0, 0.0095, -0.0325), o.thorax)); // (the face)
  parts.push(still(blob(0.5, 162, { detail: 0, lump: 0.02 }).scale(0.0085, 0.0105, 0.014).translate(0, 0.0115, -0.019), o.thorax));
  // the abdomen: one tapering tube (TINT), its first segment the thorax's green, dark rings between segments
  const pts: THREE.Vector3[] = [], rad: number[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V3(0, 0.011 - t * 0.0025, -0.012 + t * 0.06)); rad.push(i === 0 ? 0.0034 : 0.0029 - t * 0.0009 + (i === 1 ? 0.0004 : 0)); }
  parts.push(still(tube(pts, rad, 5), 0xffffff));
  parts.push(still(limb(V3(0, 0.011, -0.012), V3(0, 0.0108, -0.005), 0.0036, 0.0033, 5), o.thorax));
  for (let i = 1; i < 8; i++) { const t = i / 8; parts.push(still(new THREE.CylinderGeometry(rad[i] + 0.0003, rad[i] + 0.0003, 0.0009, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0.011 - t * 0.0025, -0.012 + t * 0.06), 0x1e2220)); }
  for (const s of [-1, 1]) {
    // the wings: the fore pair narrower, the hind broader at the base
    for (const [z0, span, chord, base] of [[-0.022, 0.047, 0.0085, 0.006], [-0.015, 0.045, 0.011, 0.011]] as [number, number, number, number][]) {
      const pivot = V3(s * 0.002, wy, z0), W: XZ[] = [[0.002, z0 - 0.002], [span * 0.55, z0 - 0.003], [span, z0 - 0.002], [span + 0.001, z0 + chord * 0.4], [span * 0.6, z0 + chord], [0.006, z0 + base], [0.002, z0 + 0.002]];
      parts.push(jointed(flat(mirror(W, s), wy, 0), o.wing, P.wing, pivot));
      parts.push(jointed(flat(mirror(vein([0.002, z0 - 0.002], [span, z0 - 0.0018], 0.0007), s), wy + 0.0003, 0), o.vein, P.wing, pivot)); // (the leading edge)
      parts.push(jointed(flat(mirror([[span - 0.006, z0 - 0.0022], [span - 0.0025, z0 - 0.002], [span - 0.0025, z0 - 0.0002], [span - 0.006, z0 - 0.0004]], s), wy + 0.0005, 0), o.vein, P.wing, pivot)); // (the stigma)
    }
    // six legs folded forward under the thorax, to the ground
    for (const [z, fwd] of [[-0.024, -0.006], [-0.019, -0.004], [-0.014, -0.002]] as [number, number][]) {
      const hip = V3(s * 0.003, 0.006, z), knee = V3(s * 0.006, 0.004, z + fwd), foot = V3(s * 0.0065, 0.0004, z + fwd * 0.4);
      parts.push(still(rod(hip, knee, 0.0005, 0.0005), 0x1e1e1a));
      parts.push(still(rod(knee, foot, 0.0005, 0.0004), 0x1e1e1a));
    }
  }
  return scaleGeo(merge(parts), o.len / 0.075);
}

interface BugRow { len: number; head: number; thorax: number; mark: number; abdomen: number; eyes: number; wing?: number; vein?: number; legs: number; shell?: boolean }
/** The six-legged insect plan (bug†): the broad head with its eyes set wide, the thorax and its dark
 *  saddle, the abdomen, two pairs of clear wings tented over the back like a roof (veined in green), six
 *  legs to the ground. `shell`: the cast-off nymph's skin left on the bark — amber, humped, split down the
 *  back, the wing pads, the big digging forelegs. Built at a nominal 4.5 cm, scaled to `len`. */
function bugGeometry(o: BugRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], by = 0.0085; // (low on the bark: short legs bent close)
  parts.push(still(blob(0.5, 171, { detail: 0, lump: 0.05 }).scale(0.016, 0.0075, 0.0065).translate(0, by + 0.0005, -0.0175), o.head));
  for (const s of [-1, 1]) parts.push(still(new THREE.SphereGeometry(0.0034, 5, 4).translate(s * 0.0088, by + 0.0015, -0.017), o.eyes)); // (set wide)
  parts.push(still(blob(0.5, 172, { detail: o.shell ? 0 : 1, lump: 0.04 }).scale(0.0155, o.shell ? 0.011 : 0.0095, 0.0135).translate(0, by + 0.0015, -0.0075), o.thorax));
  parts.push(still(blob(0.5, 173, { detail: 0, lump: 0 }).scale(0.009, 0.004, 0.0085).translate(0, by + (o.shell ? 0.0065 : 0.0055), -0.0045), o.mark)); // (the saddle; a shell's split)
  parts.push(still(blob(0.5, 174, { detail: o.shell ? 0 : 1, lump: 0.03 }).scale(o.shell ? 0.014 : 0.012, o.shell ? 0.011 : 0.009, o.shell ? 0.02 : 0.019).translate(0, by - 0.0005, 0.0085), o.abdomen));
  if (o.shell) for (let i = 1; i < 5; i++) parts.push(still(new THREE.TorusGeometry(0.0062 - i * 0.0005, 0.0006, 3, 6).scale(1.1, 0.85, 1).translate(0, by - 0.0005, 0.002 + i * 0.0035), o.mark)); // (the abdomen's rings)
  for (const s of [-1, 1]) {
    if (o.wing !== undefined) {
      // the wings, a roof over the back: each a panel sloping down and out from the midline, past the tail
      for (const [len, chord, dy, hex] of [[0.044, 0.0115, 0, o.wing], [0.026, 0.009, -0.0012, o.wing]] as [number, number, number, number][]) {
        const pivot = V3(s * 0.003, by + 0.0075 + dy, -0.007);
        const W: XZ[] = [[0, 0], [chord * 0.8, len * 0.25], [chord, len * 0.75], [chord * 0.55, len], [0.001, len * 0.85]];
        const roof = (g: THREE.BufferGeometry) => g.rotateZ(-s * 0.62).translate(pivot.x, pivot.y, pivot.z);
        parts.push(jointed(roof(flat(mirror(W, s), 0, 0)), hex, P.wing, pivot));
        for (const [a, b] of [[[0.0008, 0.001], [chord * 0.95, len * 0.72]], [[0.0008, 0.001], [chord * 0.45, len * 0.95]], [[chord * 0.5, len * 0.5], [chord * 0.9, len * 0.62]]] as [XZ, XZ][])
          parts.push(jointed(roof(flat(mirror(vein(a, b, 0.0007), s), 0.0003, 0)), o.vein ?? hex, P.wing, pivot));
      }
    } else if (o.shell) parts.push(still(blob(0.5, 175, { detail: 0, lump: 0 }).scale(0.005, 0.002, 0.011).rotateZ(-s * 0.5).translate(s * 0.0065, by + 0.004, -0.001), o.thorax)); // (the wing pads)
    // six legs: the forelegs heavier (a nymph's for digging, reaching forward)
    for (const [z, fwd, r] of [[-0.012, -0.008, o.shell ? 0.0016 : 0.001], [-0.007, 0.001, 0.0009], [-0.002, 0.007, 0.0009]] as [number, number, number][]) {
      const hip = V3(s * 0.004, by - 0.003, z), knee = V3(s * 0.0085, by - 0.0005, z + fwd * 0.5), foot = V3(s * 0.0105, 0.0004, z + fwd);
      parts.push(still(rod(hip, knee, r, r * 0.85), o.legs));
      parts.push(still(rod(knee, foot, r * 0.85, r * 0.6), o.legs));
    }
  }
  return scaleGeo(merge(parts), o.len / 0.045);
}

interface SlugRow { len: number; foot: number; spots: number }
/** The slug plan (slug†): the long soft body (TINT: a banana slug's yellow to olive) flat on its foot,
 *  the mantle's saddle over the front with its breathing hole, black spots, the tail tapering to a point;
 *  the head with its two pairs of tentacles — the upper long, eyes at their tips — on the display part (9:
 *  out while nothing's near, drawn in when you come close). Built at a nominal 20 cm, scaled to `len`. */
function slugGeometry(o: SlugRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], sq = 0.85;
  const zs = [-0.085, -0.06, -0.03, 0.0, 0.03, 0.055, 0.075, 0.09, 0.1], rs = [0.0105, 0.0125, 0.013, 0.0128, 0.0118, 0.0095, 0.0068, 0.004, 0.0015];
  const body = tube(zs.map((z, i) => V3(0, rs[i], z)), rs, 7);
  body.scale(1, sq, 1);
  parts.push(still(body, 0xffffff));
  const top = (z: number) => { let i = 0; while (i < zs.length - 2 && zs[i + 1] < z) i++; const t = (z - zs[i]) / (zs[i + 1] - zs[i]); return 2 * sq * (rs[i] + (rs[i + 1] - rs[i]) * t); };
  parts.push(still(blob(0.5, 181, { detail: 1, lump: 0.06 }).scale(0.03, 0.017, 0.07).translate(0, top(-0.055) - 0.0055, -0.052), 0xffffff)); // (the mantle)
  parts.push(still(new THREE.SphereGeometry(0.0022, 4, 3).translate(0.0125, top(-0.04) * 0.62, -0.04), 0x2a2618)); // (its breathing hole, on the right)
  parts.push(still(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2).scale(0.034, 1, 0.2).translate(0, 0.0012, 0.004), o.foot)); // (the foot's fringe)
  for (let i = 0; i < 11; i++) {
    const z = -0.075 + i * 0.016 + (hashf(i * 31 + 5) - 0.5) * 0.008, h = top(z), r = rs[Math.min(zs.length - 1, Math.max(0, Math.round((z + 0.085) / 0.025)))];
    const x = (hashf(i * 17 + 3) - 0.5) * r * 1.1, sz = 0.0018 + hashf(i * 7 + 1) * 0.0022;
    parts.push(still(new THREE.OctahedronGeometry(sz).scale(1, 0.35, 1.4).translate(x, h - Math.abs(x) * 0.4 + (z < -0.03 ? 0.004 : 0), z), o.spots));
  }
  // the head and its tentacles: the head lifts and sways (the skull part); the tentacles on the display part
  const neck = V3(0, 0.01, -0.08);
  parts.push(jointed(blob(0.5, 182, { detail: 0, lump: 0.02 }).scale(0.023, 0.018, 0.026).translate(0, 0.0095, -0.093), 0xffffff, P.skull, neck));
  for (const s of [-1, 1]) {
    for (const [a, b, r, eye] of [[V3(s * 0.0045, 0.015, -0.1), V3(s * 0.0095, 0.033, -0.118), 0.0017, true], [V3(s * 0.0045, 0.007, -0.103), V3(s * 0.0065, 0.004, -0.113), 0.0013, false]] as [THREE.Vector3, THREE.Vector3, number, boolean][]) {
      parts.push(jointed(limb(a, b, r, r * 0.75, 4), 0xffffff, ANTLER, neck));
      if (eye) parts.push(jointed(new THREE.SphereGeometry(r * 1.2, 4, 3).translate(b.x, b.y, b.z), 0x1a1a14, ANTLER, neck));
    }
  }
  return scaleGeo(merge(parts), o.len / 0.2);
}

interface CrabRow { w: number; shell: number; legs: number; claw: number; big?: number; tail?: number; feelers?: boolean }
/** The crab plan (crab†): the carapace (TINT where the species varies) on four pairs of jointed walking
 *  legs, the claws in front; a fiddler's eyes on long stalks and, a male's, one great claw (the display
 *  part, 9: worn by the males, raised and waved by the head's idle bob); `tail`: a crawfish's long body —
 *  the segmented tail and its fan behind, the long feelers, both claws big and bumpy on the display part
 *  (raised in its warning). Built with a nominal carapace 2.5 cm wide (a crawfish's 10 cm overall),
 *  scaled to `w` metres of carapace. */
function crabGeometry(o: CrabRow): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], long = o.tail !== undefined, by = long ? 0.0075 : 0.011;
  // the carapace: a fiddler's square-fronted, a crawfish's long, its beak (the rostrum) forward
  if (long) {
    parts.push(still(blob(0.5, 191, { detail: 1, lump: 0.05 }).scale(0.0135, 0.011, 0.033).translate(0, by + 0.001, -0.01), o.shell));
    parts.push(still(new THREE.ConeGeometry(0.0025, 0.009, 4).rotateX(-Math.PI / 2).translate(0, by + 0.0025, -0.03), o.shell));
    // the tail: five segments narrowing, curving a little down, and the fan
    for (let i = 0; i < 5; i++) parts.push(still(blob(0.5, 192 + i, { detail: 0, lump: 0 }).scale(0.0115 - i * 0.0011, 0.0078 - i * 0.0007, 0.0085).translate(0, by + 0.0005 - i * 0.0006, 0.009 + i * 0.0068), o.tail!));
    for (const [x, a] of [[0, 0], [-0.0045, -0.45], [0.0045, 0.45], [-0.0085, -0.8], [0.0085, 0.8]] as [number, number][]) {
      parts.push(still(flat([[-0.0022, 0], [0.0022, 0], [0.003, 0.009], [0, 0.0105], [-0.003, 0.009]], 0, 0).rotateY(-a * 0.5).translate(x * 0.5, by - 0.0028, 0.0405), o.tail!));
    }
  } else {
    parts.push(still(blob(0.5, 191, { detail: 1, lump: 0.04 }).scale(0.025, 0.0095, 0.0175).translate(0, by + 0.001, 0), o.shell));
  }
  for (const s of [-1, 1]) {
    if (o.feelers) {
      // the long feelers swept back past the body; the short pair forward
      parts.push(still(rod(V3(s * 0.002, by + 0.003, -0.03), V3(s * 0.018, by + 0.01, -0.05), 0.0006, 0.0004), o.legs));
      parts.push(still(rod(V3(s * 0.018, by + 0.01, -0.05), V3(s * 0.034, by + 0.006, -0.03), 0.0004, 0.00025), o.legs));
      parts.push(still(rod(V3(s * 0.0015, by + 0.002, -0.031), V3(s * 0.005, by + 0.004, -0.04), 0.0004, 0.0003), o.legs));
      parts.push(still(new THREE.SphereGeometry(0.0016, 4, 3).translate(s * 0.004, by + 0.0045, -0.027), 0x141210));
    } else {
      // a fiddler's eyes up on their stalks
      parts.push(still(rod(V3(s * 0.0055, by + 0.004, -0.008), V3(s * 0.0075, by + 0.013, -0.0095), 0.0011, 0.0009), o.shell));
      parts.push(still(new THREE.SphereGeometry(0.0017, 4, 3).translate(s * 0.0075, by + 0.0135, -0.0095), 0x141210));
    }
    // four pairs of walking legs, out to the side and down (the fore pairs and the hind on their own joints)
    for (let i = 0; i < 4; i++) {
      const z = long ? -0.012 + i * 0.006 : -0.0045 + i * 0.0045, hip = V3(s * (long ? 0.006 : 0.011), by - 0.001, z);
      const knee = V3(s * (long ? 0.014 : 0.019), by + 0.004, z + (i - 1.5) * 0.002), foot = V3(s * (long ? 0.018 : 0.024), 0.0004, z + (i - 1.5) * 0.004);
      const pt = i < 2 ? P.fore : P.hind;
      parts.push(jointed(rod(hip, knee, 0.0011, 0.0009), o.legs, pt, hip));
      parts.push(jointed(rod(knee, foot, 0.0009, 0.0005), o.legs, pt, hip));
    }
    // the small claws: a fiddler female's pair (a male's on his great claw's side hidden under it)
    if (!long) {
      const sh = V3(s * 0.0085, by - 0.0015, -0.009), el = V3(s * 0.0105, by - 0.002, -0.0155);
      parts.push(still(limb(sh, el, 0.0012, 0.001, 3), o.claw));
      parts.push(still(blob(0.5, 196, { detail: 0, lump: 0 }).scale(0.0035, 0.0028, 0.0058).translate(el.x + s * 0.0005, el.y, el.z - 0.0028), o.claw));
    }
  }
  // the great claw(s) on the display part, each about its shoulder
  const claws: [number, number][] = long ? [[-1, o.claw], [1, o.claw]] : o.big !== undefined ? [[1, o.big]] : [];
  for (const [s, hex] of claws) {
    const f = (g: THREE.BufferGeometry, c: number, sh: THREE.Vector3) => parts.push(jointed(g, c, ANTLER, sh));
    if (long) {
      // a crawfish's: out ahead on their long arms, bumpy, the fingers' tips orange
      const sh = V3(s * 0.007, by + 0.0005, -0.024), el = V3(s * 0.017, by + 0.003, -0.038), pc = V3(s * 0.02, by + 0.003, -0.055);
      f(limb(sh, el, 0.0022, 0.0026, 4), o.claw, sh);
      f(blob(0.5, 197, { detail: 0, lump: 0.3 }).scale(0.0085, 0.0055, 0.022).translate(pc.x, pc.y, pc.z), hex, sh);
      f(limb(V3(pc.x - s * 0.002, pc.y + 0.001, pc.z - 0.008), V3(pc.x - s * 0.0013, pc.y, pc.z - 0.021), 0.0016, 0.0008, 3), 0xc84a2a, sh);
      f(new THREE.ConeGeometry(0.0018, 0.008, 3).rotateX(-Math.PI / 2).translate(pc.x + s * 0.0015, pc.y - 0.001, pc.z - 0.02), 0xc84a2a, sh); // (the fixed finger's tip)
    } else {
      // a male fiddler's: folded across the front of him, longer than he is wide, the moving finger along its top
      const sh = V3(s * 0.011, by, -0.007), el = V3(s * 0.022, by + 0.002, -0.017), pc = V3(s * 0.006, by + 0.003, -0.027);
      f(limb(sh, el, 0.003, 0.0036, 4), 0xd89058, sh);
      f(blob(0.5, 198, { detail: 1, lump: 0.06 }).scale(0.036, 0.0105, 0.0135).translate(pc.x, pc.y, pc.z), hex, sh);
      f(limb(V3(pc.x + s * 0.012, pc.y + 0.004, pc.z - 0.002), V3(pc.x - s * 0.018, pc.y + 0.002, pc.z - 0.004), 0.0022, 0.0012, 4), hex, sh);
    }
  }
  return scaleGeo(merge(parts), o.w / (long ? 0.1 : 0.025));
}

/** The new plans' animals, by kind (package #14). */
const NEW_PLAN: Partial<Record<CritterKind, () => THREE.BufferGeometry>> = {
  blackbear: () => bearGeometry({ k: 1 }),
  bison: () => bisonGeometry(),
  armadillo: () => armadilloGeometry(),
  manatee: () => manateeGeometry(),
  // (package #15: the reptiles)
  alligator: () => sprawlerGeometry({ len: 3.2, coat: 0x2e3226, belly: 0xc8c0a0, snout: 'broad', tail: 0.5, scutes: 0x262a20, slim: 1.3 }),
  greenanole: () => sprawlerGeometry({ len: 0.18, coat: 0xffffff, belly: 0xe8e8c8, snout: 'pointed', tail: 0.9, dewlap: 0xe86a8a, slim: 0.7 }),
  brownanole: () => sprawlerGeometry({ len: 0.18, coat: 0x7a5a3a, belly: 0xc8b090, snout: 'pointed', tail: 0.85, dewlap: 0xe0602a, slim: 0.75 }),
  paintedturtle: () => turtleGeometry({ len: 0.2, shell: 0x2a3026, rim: 0xb83a2a, skin: 0x2a2e24, stripe: 0xe0c040 }),
  redslider: () => turtleGeometry({ len: 0.24, shell: 0x4a5a34, rim: 0xc8b048, skin: 0x3a4a2e, stripe: 0xd8c84a, ear: 0xc8302a }),
  yellowslider: () => turtleGeometry({ len: 0.25, shell: 0x2e3428, rim: 0xd8c040, skin: 0x2e3428, stripe: 0xe0c840, ear: 0xe8c838 }),
  // (package #16: the small life)
  monarch: () => monarchGeometry(),
  greendarner: () => dragonflyGeometry({ len: 0.076, thorax: 0x5a9a3a, eyes: 0x4a6a5a, wing: 0xdfe6e4, vein: 0x3a3226 }),
  annualcicada: () => bugGeometry({ len: 0.045, head: 0x2e3a24, thorax: 0x5a8a3a, mark: 0x1e2018, abdomen: 0x22241e, eyes: 0x4a4434, wing: 0xd2dccf, vein: 0x4e7a34, legs: 0x5a5a3a }),
  cicadashell: () => bugGeometry({ len: 0.03, head: 0xa8742e, thorax: 0xb07a34, mark: 0x5a3a1c, abdomen: 0xa06c2a, eyes: 0xc89a5a, legs: 0x9a6a2a, shell: true }),
  bananaslug: () => slugGeometry({ len: 0.2, foot: 0xd4c890, spots: 0x1e1c12 }),
  fiddlercrab: () => crabGeometry({ w: 0.025, shell: 0xffffff, legs: 0x6a5a48, claw: 0xc8b8a0, big: 0xeee0b0 }),
  crawfish: () => crabGeometry({ w: 0.1, shell: 0x8a2a1e, legs: 0x7a2a1e, claw: 0x8e2618, tail: 0x7a2218, feelers: true }),
};

/** Build one animal (front toward −z, feet at y = 0). Colours: TINT-free — each species has its own coat. */
export function critterGeometry(kind: CritterKind): THREE.BufferGeometry {
  const B = BIRD[kind];
  if (B) return scaleGeo(birdGeometry(B.coat, B.belly, B.legC, B.beakC, B.legH, B.beakL, B.plan), B.k ?? 1);
  const N = NEW_PLAN[kind];
  if (N) return N();
  const parts: THREE.BufferGeometry[] = [];
  const Q = QUAD[kind];
  if (Q) {
    const base = Q.base, sq = base === 'squirrel', rb = base === 'rabbit', fx0 = base === 'fox', dr = base === 'deer';
    const S = sq ? 0.2 : rb ? 0.3 : fx0 ? 0.62 : 1.55; // body length
    const coat = Q.coat ?? (sq ? 0x8a8580 : rb ? 0x8f7a62 : fx0 ? 0xc4622d : 0x9a7654);
    const belly = Q.belly ?? (sq ? 0xe8e2d6 : rb ? 0xe2d8c8 : 0xe4dccc);
    const stock = Q.stock ?? 0x2e2420, tailTip = Q.tailTip ?? 0xf2eee6;
    const legH = (sq ? 0.07 : rb ? 0.1 : fx0 ? 0.26 : 0.85) * (Q.legs ?? 1);
    const bodyY = legH + S * (sq ? 0.2 : rb ? 0.22 : 0.18);
    const gth = Q.girth ?? 1, bs = (dr ? [0.34, 0.42, 0.88] : fx0 ? [0.42, 0.46, 0.95] : [0.62, 0.62, 1]).map((v, i) => (i < 2 ? v * gth : v));
    const hc = Q.headC ?? (dr ? Q.mane ?? coat : coat), lowLeg = Q.legC ?? 0x7a5c40;
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
    if (dr) parts.push(jointed(limb(V3(0, bodyY + 0.1, -S * 0.38), head, 0.13, 0.09, 6), Q.mane ?? coat, P.skull, neck));
    const sn = Q.snout ?? 1;
    parts.push(jointed(blob(hr, 5, { lump: 0.05, detail: 1 }).scale(0.85, 0.85, (dr ? 1.5 : 1.15) * sn).translate(head.x, head.y, head.z - (sn - 1) * hr * 0.6), hc, P.skull, neck));
    parts.push(jointed(new THREE.SphereGeometry(hr * 0.35, 5, 4).translate(0, head.y - hr * (fx0 ? 0.25 : 0.15), head.z - hr * (dr ? 1.55 : fx0 ? 1.85 : 1.05) * sn), 0x2a2622, P.skull, neck)); // nose
    // a raccoon's mask across the eyes; a moose's humped shoulders and the bell under its throat
    if (Q.mask !== undefined) parts.push(jointed(blob(hr * 0.5, 62, { detail: 0, lump: 0 }).scale(2.2, 0.62, 1.05).translate(0, head.y + hr * 0.22, head.z - hr * 0.5), Q.mask, P.skull, neck));
    if (Q.blaze !== undefined) parts.push(jointed(blob(hr * 0.4, 70, { detail: 0, lump: 0 }).scale(0.4, 0.45, 2.2).translate(0, head.y + hr * 0.72, head.z - hr * 0.35), Q.blaze, P.skull, neck));
    if (Q.hump) parts.push(still(blob(S * 0.13, 63, { detail: 0, lump: 0.06 }).scale(0.75, 1, 1.5).translate(0, bodyY + S * 0.16, -S * 0.26), Q.mane ?? coat));
    if (Q.bell) parts.push(jointed(blob(hr * 0.32, 64, { detail: 0, lump: 0 }).scale(0.6, 1.5, 0.7).translate(0, head.y - hr * 1.15, head.z + hr * 0.65), Q.mane ?? coat, P.skull, neck));
    // stripes along the back: a strip laid on the body's own curve from the shoulders to the rump,
    // at its place across the back (f: −1 one flank … 1 the other)
    for (const [f, col] of Q.stripes ?? []) parts.push(still(backStripe(S * 0.5 * bs[0], S * 0.5 * bs[1], S * 0.5 * bs[2], bodyY, f), col));
    // antlers and horns on the skull, swinging with the head
    if (Q.antlers) for (const s of [-1, 1]) parts.push(...antlerSide(Q.antlers, s, V3(s * hr * 0.3, head.y + hr * 0.7, head.z + hr * (Q.antlers === 'ram' ? 0.05 : 0.2)), Q.antlerC ?? 0xb8a888, neck));
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
        parts.push(jointed(limb(knee, V3(fx, 0, fz), 0.035, 0.026, 5), lowLeg, P.fore, V3(fx, bodyY, fz)));
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
        parts.push(jointed(limb(hock, V3(hx, 0, hz + 0.05), 0.035, 0.026, 5), lowLeg, P.hind, hip));
      }
    }
    // tails: squirrel = a tall bushy S of blobs, rabbit = a cotton puff, deer = a white flag
    const tb = V3(0, bodyY + S * 0.05, S * 0.48);
    const tc = Q.tailC ?? coat;
    if (Q.tail === 'paddle') {
      // a beaver's paddle: broad, flat, scaled black, held low behind
      parts.push(jointed(blob(S * 0.3, 66, { detail: 0, lump: 0.05 }).scale(0.62, 0.16, 1.35).translate(tb.x, tb.y - S * 0.2, tb.z + S * 0.32), tc, P.tail, tb));
    } else if (Q.tail === 'stub') {
      // a woodchuck's or a prairie dog's: short and flat, a prairie dog's tipped black
      parts.push(jointed(blob(S * 0.12, 67, { detail: 0, lump: 0.08 }).scale(0.75, 0.55, 1.5).translate(tb.x, tb.y - S * 0.05, tb.z + S * 0.1), tc, P.tail, tb));
      if (Q.tailTip !== undefined) parts.push(jointed(blob(S * 0.07, 68, { detail: 0, lump: 0 }).translate(tb.x, tb.y - S * 0.06, tb.z + S * 0.26), Q.tailTip, P.tail, tb));
    } else if (Q.tail === 'naked') {
      // an opossum's: long, naked, pink, tapering, carried low and curling at the end
      const pts = [V3(0, 0, 0), V3(0, -0.05, 0.1), V3(0, -0.11, 0.2), V3(0, -0.14, 0.3), V3(0.02, -0.13, 0.37)].map((q) => V3(tb.x + q.x, tb.y + q.y, tb.z + q.z));
      for (let i = 0; i + 1 < pts.length; i++) parts.push(jointed(limb(pts[i], pts[i + 1], 0.024 * (1 - i * 0.2), 0.024 * (1 - (i + 1) * 0.2), 4), 0xd8a8a0, P.tail, tb));
    } else if (Q.tail === 'plume') {
      // a skunk's great plume, carried out behind (stood straight up in a warning: the display pose)
      [V3(0, 0.02, 0.07), V3(0, 0.05, 0.16), V3(0, 0.08, 0.25), V3(0, 0.1, 0.33)].forEach((q, i) => parts.push(jointed(blob(0.075 + i * 0.008, 69 + i, { detail: 0, lump: 0.18 }).scale(0.85, 0.85, 1.15).translate(tb.x + q.x, tb.y + q.y, tb.z + q.z), i === 3 ? Q.tailTip ?? tc : tc, P.tail, tb)));
    } else if (Q.tail === 'ringed') {
      // a raccoon's: a full brush in rings, dark and pale, to a dark tip
      for (let i = 0; i < 6; i++) {
        const t = i / 5, q = V3(0, -0.03 - 0.12 * t, 0.08 + 0.26 * t);
        parts.push(jointed(blob(0.05 - t * 0.008, 73 + i, { detail: 0, lump: 0.1 }).scale(0.85, 0.85, 1.0).translate(tb.x + q.x, tb.y + q.y, tb.z + q.z), i === 5 ? Q.tailTip ?? Q.ring! : i % 2 ? Q.ring ?? 0x2a2624 : 0xa8a298, P.tail, tb));
      }
    } else if (sq) {
      // one continuous bushy plume rising from the rump and curling forward over the back:
      // seven overlapping puffs along an S (each overlaps the next by half), no gaps
      const pts = [V3(0, 0.0, 0.01), V3(0, 0.05, 0.05), V3(0, 0.11, 0.06), V3(0, 0.16, 0.035), V3(0, 0.19, -0.01)];
      const pl = Q.plume ?? 1;
      pts.forEach((q, i) => parts.push(jointed(blob((0.058 - i * 0.003) * pl, 20 + i, { detail: 0, lump: 0.1 }).scale(0.75, 0.9, 1.05).translate(tb.x + q.x, tb.y + q.y, tb.z + q.z), Q.tailC ?? (Q.coat !== undefined ? coat : 0x9a948c), P.tail, tb)));
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
    else parts.push(jointed(card(0.12, 0.22, -0.3, 2).rotateX(-2.3).translate(tb.x, tb.y, tb.z), Q.rump ?? 0xf2eee6, P.tail, tb));
    if (dr) parts.push(jointed(blob(0.1, 22, { detail: 0 }).scale(1 * gth, 0.6 * gth, 1.2).translate(0, bodyY + 0.02, S * 0.46), Q.rump ?? 0xf2eee6, P.tail, tb)); // rump patch
    if (fx0) {
      parts.push(jointed(new THREE.ConeGeometry(hr * 0.5, hr * 1.2, 6).rotateX(-Math.PI / 2).translate(0, head.y - hr * 0.2, head.z - hr * 1.25), hc, P.skull, neck)); // the fox's long snout
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
/** Where a sitter's body tips up about its hind feet (its own metres before its size: the sim keeps the
 *  hind foot where it stood when a prairie dog or a woodchuck sits up). */
export const sitPivot = (k: CritterKind) => { const Q = QUAD[k]; return k === 'blackbear' ? 0.44 : Q?.base === 'squirrel' ? 0.09 * (Q.k ?? 1) : 0; };
/** The big animals, seen large and close (the deer family, the bear and the bison to come, the great
 *  birds): their vertex budget is a near tree's. */
const BIG_CRITTERS = new Set<CritterKind>(['alligator', 'blackbear', 'bison', 'manatee', 'deer', 'muleDeer', 'elk', 'moose', 'pronghorn', 'bighorn', 'greatblueheron', 'sandhillcrane', 'wildturkey', 'baldeagle', 'brownpelican', 'canadagoose', 'turkeyvulture']);
/** A species' vertex budget (tests/foundry.test.ts): 2,500 for the big animals — a near tree's, and only a
 *  few on screen; 2,000 for the middling ones on the fox's plan (the fox, the coyote, the raccoon, the
 *  opossum, the skunk, a walker's dog), met close at dusk; 1,600 for the rest, whose extra detail would
 *  be a few pixels. */
export const critterBudget = (k: CritterKind) => (BIG_CRITTERS.has(k) ? 2500 : QUAD[k]?.base === 'fox' ? 2000 : 1600);
/** How far below the water a swimming bird's feet sit (its own metres, before its size): its body's
 *  lower third under, the waterline along its flanks (sim/critters.ts sinks it by this × its scale). */
export function swimSink(k: CritterKind) {
  const B = BIRD[k];
  if (B) return (B.legH + 0.045 - 0.016) * (B.k ?? 1);
  if (k === 'manatee') return 0.78; // (only its back and its snout at the surface)
  // (an alligator only its eyes and snout up; a turtle its head and the top of its shell)
  if (k === 'alligator') return 0.095 * (3.2 / 0.98);
  if (k === 'paintedturtle' || k === 'redslider' || k === 'yellowslider') return 0.28 * (k === 'paintedturtle' ? 0.2 : k === 'redslider' ? 0.24 : 0.25);
  // (a swimming mammal — a beaver — lower: its legs and most of its body under, its back and head out)
  const Q = QUAD[k];
  if (!Q) return 0;
  const S = Q.base === 'squirrel' ? 0.2 : Q.base === 'rabbit' ? 0.3 : Q.base === 'fox' ? 0.62 : 1.55;
  const legH = (Q.base === 'squirrel' ? 0.07 : Q.base === 'rabbit' ? 0.1 : Q.base === 'fox' ? 0.26 : 0.85) * (Q.legs ?? 1);
  return (legH + S * 0.2 + S * 0.5 * 0.62 * (Q.girth ?? 1) * 0.4) * (Q.k ?? 1);
}
/** The painted (TINT) parts' colour in a portrait of the species — the Almanac's card, the kit viewer —
 *  where the sim paints each animal its own: the cardinal's red, the pigeon's grey, the Gila
 *  woodpecker's red cap, a monarch's orange. */
export const CRITTER_TINT: Partial<Record<CritterKind, number>> = { cardinal: 0xc4302a, pigeon: 0x9098a4, gilawoodpecker: 0xc8302a, butterfly: 0xe8862a, loon: 0x1e2224, laughinggull: 0x1e1e22, greendarner: 0x3a7ad0, bananaslug: 0xd8c030, fiddlercrab: 0x4a4034 };

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
// z wing flap, w head bob (a grazer's head comes up, + ; a bird's dips to peck, −).
// Limb swing amplitude (radians at full gait) per species.
export const LIMB: Record<CritterKind, number> = { squirrel: 0.9, rabbit: 0.85, songbird: 0.4, sandpiper: 0.55, deer: 0.38, butterfly: 0, firefly: 0, fox: 0.7, hawk: 0.3, coyote: 0.65, jackrabbit: 0.9, snowshoe: 0.85, groundSquirrel: 0.9, muleDeer: 0.38, roadrunner: 0.75, quail: 0.5, ibis: 0.45,
  cardinal: 0.4, bluejay: 0.4, robin: 0.55, stellersjay: 0.4, gilawoodpecker: 0.35, mourningdove: 0.5, crow: 0.5, pigeon: 0.5,
  canadagoose: 0.45, mallard: 0.5, mallardhen: 0.5, loon: 0, greatblueheron: 0.35, greategret: 0.35, snowyegret: 0.45, spoonbill: 0.4, sandhillcrane: 0.35,
  turkeyvulture: 0.2, baldeagle: 0.2, osprey: 0.25, wildturkey: 0.45, californiaquail: 0.5, brownpelican: 0.35, laughinggull: 0.5, californiagull: 0.5,
  raccoon: 0.55, opossum: 0.5, skunk: 0.5, foxsquirrel: 0.85, chipmunk: 0.95, woodchuck: 0.6, beaver: 0.5, prairiedog: 0.9, elk: 0.4, moose: 0.36, pronghorn: 0.55, bighorn: 0.45,
  blackbear: 0.45, bison: 0.35, armadillo: 0.6, manatee: 0.25,
  alligator: 0.5, greenanole: 0.8, brownanole: 0.8, paintedturtle: 0.6, redslider: 0.6, yellowslider: 0.6,
  monarch: 0, greendarner: 0, annualcicada: 0, cicadashell: 0, bananaslug: 0, fiddlercrab: 0.6, crawfish: 0.45 };
export const GAIT: Record<CritterKind, [number, number, number, number]> = {
  squirrel: [0.5, 0.5, 0, 0.25], rabbit: [0.3, 0.2, 0, 0.2], songbird: [0, 0.3, 1.2, -0.5], sandpiper: [3.14, 0.2, 1.1, -0.35],
  deer: [3.14, 0.4, 0, 0.12], butterfly: [0, 0, 1.3, 0], firefly: [0, 0, 0, 0], fox: [3.14, 0.45, 0, 0.2], hawk: [0, 0.2, 0.55, 0.3],
  coyote: [3.14, 0.35, 0, 0.2], jackrabbit: [0.3, 0.2, 0, 0.2], snowshoe: [0.3, 0.2, 0, 0.2], groundSquirrel: [0.5, 0.3, 0, 0.3], muleDeer: [3.14, 0.4, 0, 0.12],
  roadrunner: [3.14, 0.5, 1.1, -0.3], quail: [3.14, 0.2, 1.3, -0.5], ibis: [3.14, 0.2, 1.0, -0.4],
  // (the hoppers — cardinal, the jays, the woodpecker — both feet together; the walkers — robin, dove,
  // crow, pigeon — one foot then the other, the robin running and stopping, the pigeon's head nodding)
  cardinal: [0, 0.3, 1.2, -0.5], bluejay: [0, 0.35, 1.15, -0.45], robin: [3.14, 0.35, 1.15, -0.6], stellersjay: [0, 0.35, 1.15, -0.45],
  gilawoodpecker: [0, 0.2, 1.1, -0.55], mourningdove: [3.14, 0.15, 1.2, -0.45], crow: [3.14, 0.2, 1.0, -0.35], pigeon: [3.14, 0.2, 1.15, -0.6],
  // (the water and big birds all walk; a goose's and a turkey's head go right down to graze, a heron's
  // strikes; the big wings beat slow and deep)
  canadagoose: [3.14, 0.2, 0.9, -0.9], mallard: [3.14, 0.3, 1.05, -0.7], mallardhen: [3.14, 0.3, 1.05, -0.7], loon: [3.14, 0.1, 0.8, -0.3],
  greatblueheron: [3.14, 0.1, 0.75, -0.75], greategret: [3.14, 0.1, 0.8, -0.7], snowyegret: [3.14, 0.15, 0.9, -0.7], spoonbill: [3.14, 0.1, 0.85, -0.6], sandhillcrane: [3.14, 0.15, 0.75, -0.7],
  turkeyvulture: [0, 0.15, 0.4, 0.2], baldeagle: [0, 0.15, 0.5, 0.2], osprey: [0, 0.2, 0.6, 0.2], wildturkey: [3.14, 0.2, 0.9, -0.8], californiaquail: [3.14, 0.2, 1.3, -0.5],
  brownpelican: [3.14, 0.1, 0.7, -0.3], laughinggull: [3.14, 0.2, 0.85, -0.5], californiagull: [3.14, 0.2, 0.85, -0.5],
  // (the waddlers' slow walk; the squirrels' bound; the deer family's walk, heads coming up from grazing)
  raccoon: [3.14, 0.3, 0, 0.2], opossum: [3.14, 0.2, 0, 0.15], skunk: [3.14, 0.25, 0, 0.2], foxsquirrel: [0.5, 0.5, 0, 0.25], chipmunk: [0.5, 0.6, 0, 0.3],
  woodchuck: [3.14, 0.2, 0, 0.25], beaver: [3.14, 0.2, 0, 0.15], prairiedog: [0.5, 0.3, 0, 0.3], elk: [3.14, 0.35, 0, 0.12], moose: [3.14, 0.3, 0, 0.1], pronghorn: [3.14, 0.4, 0, 0.14], bighorn: [3.14, 0.3, 0, 0.14],
  // (the bear's rolling walk, its head swinging; the bison's slow graze; the armadillo's snuffling trot,
  // nose down; the manatee's slow tail-beat, its snout up to breathe)
  blackbear: [3.14, 0.15, 0, 0.18], bison: [3.14, 0.4, 0, 0.16], armadillo: [3.14, 0.2, 0, -0.35], manatee: [3.14, 0.35, 0, 0.3],
  // (a lizard's diagonal walk and swinging tail; an anole's head-bob; a turtle's neck stretched up to bask)
  alligator: [3.14, 0.5, 0, 0.1], greenanole: [3.14, 0.4, 0, 0.6], brownanole: [3.14, 0.4, 0, 0.6], paintedturtle: [3.14, 0.1, 0, 0.35], redslider: [3.14, 0.1, 0, 0.35], yellowslider: [3.14, 0.1, 0, 0.35],
  // (the monarch's deep slow beat; the darner's and the cicada's blur; a slug's head lifting to look about;
  // a fiddler's great claw waved, a crawfish's claws lifted a little)
  monarch: [0, 0, 1.25, 0], greendarner: [0, 0, 0.45, 0], annualcicada: [0, 0, 0.6, 0], cicadashell: [0, 0, 0, 0], bananaslug: [0, 0, 0, 0.3], fiddlercrab: [3.14, 0, 0, 0.9], crawfish: [3.14, 0, 0, 0.15],
};
/** Wingbeats (radians a second of the flap's sine; 38 ≈ six a second): the hawk's slow soaring
 *  strokes, a crow's steady rowing, the pigeons' and doves' clatter, the jays' and the robin's. */
const FLAP: Partial<Record<CritterKind, number>> = {
  hawk: 6.5, crow: 21, pigeon: 33, mourningdove: 34, bluejay: 30, stellersjay: 30, robin: 36,
  // (the big birds' slow strokes; the osprey's hover a quick shallow beat; the ducks' whistling wings)
  canadagoose: 17, mallard: 30, mallardhen: 30, loon: 26, greatblueheron: 13, greategret: 14, snowyegret: 18, spoonbill: 16, sandhillcrane: 14,
  turkeyvulture: 8, baldeagle: 9, osprey: 16, wildturkey: 28, californiaquail: 55, brownpelican: 12, laughinggull: 18, californiagull: 17,
  monarch: 30, greendarner: 75, annualcicada: 85,
};
/** How a bird flies: 1 soars (always on the wing: wings held out at its dihedral, flapped by amount,
 *  folded in a stoop), 3 glides (stands on the ground; on the wing glides, flapped by amount), 0 flaps
 *  (a songbird); its wings' dihedral when held out (radians: a vulture's V, an eagle's flat plank). The
 *  insects': 2 a butterfly's, 4 a bug's. */
const FLIGHT: Partial<Record<CritterKind, [number, number]>> = {
  hawk: [1, 0.14], turkeyvulture: [1, 0.36], baldeagle: [1, 0.04], osprey: [1, 0.1],
  greatblueheron: [3, 0.02], greategret: [3, 0.02], snowyegret: [3, 0.04], spoonbill: [3, 0.04], sandhillcrane: [3, 0.06], canadagoose: [3, 0.04],
  brownpelican: [3, 0.0], laughinggull: [3, 0.1], californiagull: [3, 0.1],
  // (2: a butterfly's — a monarch's flap and glide, closed up over its back at rest; 4: a bug's — its wings
  // as built at rest, a blur of a beat on the wing)
  monarch: [2, 0], greendarner: [4, 0], annualcicada: [4, 0],
};
export const flapOf = (k: CritterKind) => FLAP[k] ?? 38;

/** Painted material for critters: vertex-animated joints driven by the instanced aAnim (phase, amount, pose). */
export function critterMaterial(kind: CritterKind) {
  const g = GAIT[kind];
  return paintMaterial({
    uniforms: { uGait: { value: new THREE.Vector4(...g) }, uLimb: { value: LIMB[kind] }, uFlap: { value: new THREE.Vector3(flapOf(kind), kind === 'butterfly' ? 2 : FLIGHT[kind]?.[0] ?? 0, FLIGHT[kind]?.[1] ?? 0.14) }, uWag: { value: new THREE.Vector2(0, 0) } },
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aPart;
      attribute vec3 aPivot;
      attribute vec3 aAnim; // x gait phase (cycles), y gait amount 0..1, z pose (0 idle, 1 moving, 2 flying/climbing, 3 glowing, 4 displaying)
      uniform vec4 uGait;
      uniform float uLimb;
      uniform vec3 uFlap; // x flap rate; y 1 a soaring bird (always on the wing), 2 a butterfly (rests wings-up), 3 a glider (on the wing: held out, flapped by amount), 4 a bug (its wings as built at rest); z the wings' dihedral held out
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
        // (the pose, and +10 when it wears its antlers or horns: a bull, a buck, a ram, in season)
        float pose = mod(aAnim.z, 10.0), horned = step(9.5, aAnim.z);
        vec3 q = p - aPivot;
        if (aPart > 0.5 && aPart < 1.5) q = rotX(sin(ph) * uLimb * amt) * q;                       // fore limbs
        else if (aPart > 1.5 && aPart < 2.5) q = rotX(sin(ph + uGait.x) * uLimb * amt) * q;        // hind limbs
        else if (aPart > 4.5 && aPart < 5.5) {                                                    // tail
          if (pose > 3.5) q = rotX(-1.35 + sin(uTime * 1.7 + aAnim.x * 7.0) * 0.04) * q; // (a strutting tom's fan stood up behind him, a skunk's plume in warning)
          else if (uWag.x > 0.0) q = rotY(sin(uTime * uWag.y + float(gl_InstanceID) * 2.1) * uWag.x * (0.55 + 0.45 * amt)) * q;
          else q = rotX(sin(ph * 0.5) * uGait.y * (0.3 + amt) + sin(uTime * 3.1 + aAnim.x * 9.0) * 0.12 * idle) * q;
        }
        else if ((aPart > 5.5 && aPart < 6.5) || aPart > 8.5) {
          // head (and its antlers): grazing / pecking bobs; thrown back in a display (an elk bull's bugle);
          // antlers on an animal not wearing them shrunk away to nothing at the neck
          float bob = (0.5 + 0.5 * sin(uTime * 2.3 + aAnim.x * 17.0)) * uGait.w * idle * step(0.5, fract(uTime * 0.21 + aAnim.x * 3.7)) + sin(ph) * 0.06 * amt;
          q = rotX(pose > 3.5 ? 0.7 : bob) * q;
          if (aPart > 8.5) q *= horned;
        }
        else if (aPart > 6.5 && aPart < 7.5) {                                                  // wings
          float sx = sign(q.x + 1e-4);
          bool flying = pose > 1.5 && pose < 2.5; // (2: on the wing — not 3, glowing, or 4, a display)
          if (uFlap.y > 3.5) {
            // a bug: its wings as built at rest (a cicada's roof over its back, a darner's held out flat);
            // on the wing a blur of a beat
            if (flying) q = rotZ(sx * sin(uTime * uFlap.x + aAnim.x * 20.0) * uGait.z) * q;
          } else if ((uFlap.y > 0.5 && uFlap.y < 1.5) || (uFlap.y > 2.5 && flying)) {
            // soaring or gliding: held out at the bird's dihedral, flapped by amount (a few strokes,
            // an osprey's hover), folded in a stoop or a plunge
            q = rotZ(sx * (amt < 0.0 ? -0.85 : uFlap.z + sin(uTime * uFlap.x + aAnim.x * 20.0) * uGait.z * amt)) * q;
          } else if (flying || (uFlap.y > 1.5 && uFlap.y < 2.5)) {
            // flying: a fast flap — or a monarch's glide between beats (amount < 0), its wings held out flat; a
            // butterfly at rest holds its wings closed up over its back
            q = rotZ(sx * (flying ? (amt < -0.5 ? 0.12 : sin(uTime * uFlap.x + aAnim.x * 20.0) * uGait.z) : 1.45)) * q;
          } else {
            // perched: the wing closed along the body's side from the flank — rolled edge-down and
            // leaning in over the back, swept back so the tips cross over the rump, a breath of
            // movement (the shoulder's at the flank: fauna.ts birdGeometry)
            q.z *= 0.72; // (the hand tucked under: a closed wing is narrower than an open one)
            q = rotX(0.18 + sin(uTime * 2.0 + aAnim.x * 11.0) * 0.02) * rotY(-sx * 1.72) * rotX(-0.95) * q;
          }
        }
        p = q + aPivot;
        vGlow = aPart > 2.5 && aPart < 3.5 ? step(2.5, pose) * step(pose, 3.5) * smoothstep(0.2, 1.0, sin(uTime * 2.2 + aAnim.x * 31.0)) : 0.0;
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
