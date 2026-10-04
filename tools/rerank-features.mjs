#!/usr/bin/env node
// One-off (2026-10-03): re-rank feature_list.json into docs/GAMEPLAY_VISION.md §17's tiers after the
// lower-48 audit. Every item keeps its history (verification, evidence, notes); each gets `tier` and
// `rank`; stale ones are `superseded` with the reason; the new tier items are added; one in_progress.
//   node tools/rerank-features.mjs   (idempotent: re-running leaves the file as it is)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = resolve(ROOT, 'feature_list.json');
const f = JSON.parse(readFileSync(P, 'utf8'));
const byId = new Map(f.features.map((x) => [x.id, x]));
const today = '2026-10-03';

f.last_updated = today;
f.status_legend.superseded = 'Replaced by a newer item or by docs/GAMEPLAY_VISION.md; kept for its history (see stale_reason).';
f.tiers = {
  note: 'docs/GAMEPLAY_VISION.md §17: the whole lower 48 loading everywhere, looking right everywhere, on PC and phone — then a game on top. Work the lowest tier first; within a tier, by rank. Re-ranked 2026-10-03 against the lower-48 audit (docs/earth/AUDIT_48.md).',
  0: 'Foundations: every tile loads (or falls back gracefully), commercial-safe infrastructure, phones, no glitches.',
  1: 'It looks right everywhere: the real-world comparison loop first, then place parity, public places, Mapillary objects, night/ground/far trees.',
  2: 'The game (§15 order): the bloom, pencil collecting, the van-home, placing things, rares, travel, the home, the special vehicles, the portal gun, series, the dog, friends. Waits for tiers 0–1, except a throwaway bloom prototype.',
  3: 'Polish and later: kept, not deleted.',
};

// ---- new items from the vision's tiers ----
const NEW = [
  { id: 'own-osm-extract', tier: 0, area: 'platform', status: 'in_progress',
    title: 'Our own OpenStreetMap extract in R2 — every cell from it, Overpass only a polite fallback',
    user_visible_behavior: 'Anywhere in the lower 48, a new place\'s real streets, buildings, trees and lamps arrive in seconds, never stuck as stand-ins because the public Overpass servers are busy or down; the skylines come from the same extract.',
    verification: ['tests/osmQuery.test.ts: the Overpass query generated from the one statement list, byte for byte the old', 'tests/osmTiles.test.ts: the grid, Overpass\'s box rule, assembly', 'tests/osmExtract.test.ts: real cells — the extract\'s TileJson identical to the service\'s Overpass builds (osmBase aside)', 'tools/osm-compare.mjs on the US pack: the audit\'s Overpass-built cells identical', 'tools/must-load.mjs --live: every must-load town from x-tile-source: extract'],
    evidence: ['src/world/osmQuery.ts', 'src/world/osmTiles.ts', 'scripts/osm-extract.mjs', 'scripts/osm-upload.mjs', 'worker/src/osm.js', 'worker/src/index.js (extract first; /skyline)', 'tools/osm-compare.mjs', 'docs/agent/streaming.md "Our own OpenStreetMap extract"'],
    notes: 'Robby 2026-10-03: option one (R2), packed (not millions of files), match Overpass exactly and prove it with saved answers kept as a test, cut on a global grid from the whole-US file, ODbL on request, monthly refresh by a script on his PC, Overpass only as a polite fallback. New Jersey prototype identical to Overpass on two Shrewsbury cells; the US run under way.' },
  { id: 'own-place-index', tier: 0, area: 'platform', status: 'passing',
    title: 'Our own lower-48 place index (USGS GNIS + US Census) replaces Photon',
    user_visible_behavior: 'Map search finds towns, townships, counties, parks, peaks, lakes and landmarks across the lower 48; arrival cards name the town and county where you are; no street addresses; offline the loaded world still answers.',
    verification: ['tests/placeIndex.test.ts (17)', 'tests/placesWorker.test.ts (5)', 'in the game at ?at=40.3297,-74.0617: arrival card "Shrewsbury · Monmouth County, New Jersey"; search and reverse only to our service'],
    evidence: ['scripts/build-places.mjs', 'src/ui/placeIndex.ts', 'src/ui/geo.ts', 'worker/src/places.js', 'R2 places/v3 (deployed 2026-10-03)'],
    notes: '1.85 M public-domain names; 8,026 shards; 13,737 boundary tiles. Re-bake: INDEX_V + places.js V together.' },
  { id: 'licence-check', tier: 0, area: 'platform', status: 'passing',
    title: 'A licence check for every data source and service, recorded; anything not for a commercial game swapped',
    user_visible_behavior: '(Developer) docs/DATA_SOURCES.md §0 says, for every source and service, whether a paid game may use it and the credit it needs; the code can\'t name an uncredited host.',
    verification: ['tests/licences.test.ts (6): every outside host credited or a reference link; Photon and Open-Meteo never return; §0 records each host'],
    evidence: ['docs/DATA_SOURCES.md §0', 'src/ui/credits.ts'],
    notes: 'Findings: public Overpass is not a game backend (→ own-osm-extract); GitHub Pages is not for a paid game (Robby: keep it while building; move before charging); weather stays seeded.' },
  { id: 'credits-screen', tier: 0, area: 'ui', status: 'passing',
    title: 'A credits screen listing every source with its credit, plus the always-visible HUD credit',
    user_visible_behavior: 'From the intro, the HUD\'s credit line (desktop) and the map\'s journal page, a card lists every data source and service with its licence and credit; the OpenStreetMap credit stays on screen.',
    verification: ['tests/licences.test.ts: every credit shown; the ODbL line stays', 'tools/hud-audit.mjs: 560 layouts clear'],
    evidence: ['src/ui/credits.ts', 'index.html #osm-credit, #credits'], notes: 'Mapillary\'s logo joins the HUD line when its objects are used.' },
  { id: 'every-tile-loads', tier: 0, area: 'world', status: 'not_started',
    title: 'Every tile loads, or falls back gracefully — no missing land, no land drawn as water, no holes; a fixed must-load town list in the tests',
    user_visible_behavior: 'Wherever you start or go in the lower 48, the ground under you is land where it is land and water where it is water, real streets and buildings arrive, and a cell that can\'t is a believable stand-in, never a hole.',
    verification: ['tests/mustLoad.test.ts: the must-load towns (tools/audit48-towns.json) build with land under the spawn, streets, buildings and trees', 'tools/must-load.mjs --live in CI', 'tools/audit48.mjs: the lower-48 audit, montage per town'],
    evidence: ['tools/audit48.mjs, tools/audit48.js, tools/audit48-towns.json', 'docs/earth/AUDIT_48.md'],
    notes: 'Audit 2026-10-03 (Overpass down): most cold cells stayed vector twins (Midtown 0/14 real, Intercourse 0/14, Hays 1/14). Shrewsbury\'s reported dark-blue ground not reproduced at the centre (to check across the ring and on a phone).' },
  { id: 'spawn-on-land-outside', tier: 0, area: 'world', status: 'not_started',
    title: 'A ?at= arrival stands outside, on land: never inside a building, never in water',
    user_visible_behavior: 'Arriving anywhere by link, search or teleport, you stand on the street or a path outside, facing the place — not in a restaurant\'s dining room or a pond.',
    verification: ['tools/audit48.mjs: every town\'s spawn outside and on land, desktop and phone'], evidence: [],
    notes: 'Audit 2026-10-03: Bar Harbor ME (44.3876, −68.2045) desktop spawned inside a restaurant\'s dining room; Levittown NY flagged spawn in water (0.6% water round it).' },
  { id: 'worker-costs', tier: 0, area: 'platform', status: 'not_started',
    title: 'Worker costs under control (Workers Paid): cache-hit rate, requests, R2 reads and writes checked and kept efficient',
    user_visible_behavior: '(Developer) The tile service\'s monthly bill stays a few dollars as players grow; every repeat visit is a cache hit.',
    verification: ['docs/agent/streaming.md cost model + the dashboard numbers (Robby)'], evidence: [],
    notes: 'Cost model 2026-10-03: a new-area session ~300–500 requests (10 M a month included); a cold cell from the extract ~0.1–0.5 s CPU and a few R2 reads. The TileJson cache is keyed per session origin — neighbouring starts rebuild the same ground (cheap now; a global cell key would share it).' },
  { id: 'real-world-comparison', tier: 1, area: 'tools', status: 'not_started',
    title: 'The real-world comparison loop: Mapillary photos against game renders from the same spot, heading and field of view, a montage per state, scored, worst fixed first',
    user_visible_behavior: '(Developer) One command samples seeded spots in every state, fetches an openly licensed street photo for each (Mapillary; never Google Street View), renders the game from the same pose, puts the pairs side by side and scores them — the score history says whether a change made the lower 48 more like itself.',
    verification: [], evidence: [],
    notes: 'docs/GAMEPLAY_VISION.md §17. Photos cached outside git, never shipped; never unblur faces or plates; NAIP aerial comparison where no photo. Needs a Mapillary client token (Robby).' },
  { id: 'public-places', tier: 1, area: 'world', status: 'not_started',
    title: 'Public places from the vision\'s table: airports and airfields, gas stations and chargers, rest areas, campgrounds, marinas and ferry terminals first; then parks, beaches, trails, landmarks and the rest',
    user_visible_behavior: 'Airfields with runways (the plane lands there later), gas stations with pumps under their canopies and chargers, rest areas, campgrounds, marinas and ferry terminals are drawn where they are; parks, beaches, trails, viewpoints, lighthouses, stations, museums, historic sites and civic buildings read as what they are.',
    verification: [], evidence: [],
    notes: 'OpenStreetMap first (the extract), public US government data to fill gaps (FAA, DOE AFDC, RIDB, PAD-US…) — each licence checked first (DATA_SOURCES §0). Public places and data only.' },
  { id: 'mapillary-objects', tier: 1, area: 'world', status: 'not_started',
    title: 'Mapillary\'s detected street objects behind a switch: public classes only, recent and repeated sightings, cached by the worker, Mapillary logo credit',
    user_visible_behavior: 'Street lights, poles, hydrants, benches, bins, signs and the like stand where Mapillary\'s cameras saw them where the map has none; off by a switch for comparing.',
    verification: [], evidence: [],
    notes: 'docs/GAMEPLAY_VISION.md §17 (Robby\'s decision: use it, credit every source). Fills street-furniture-nodes\' gaps. 50,000 tile requests a day per app: the worker bakes them into tiles once.' },
  { id: 'night-ground-far-trees', tier: 1, area: 'render', status: 'not_started',
    title: 'Review round 12\'s must-fixes: the night value plan, the ground, far trees',
    user_visible_behavior: 'Night reads as night with lamplight that pools and falls off; the ground underfoot has its real texture; far trees read as trees, not blobs.',
    verification: ['tools/night-check.mjs', 'docs/earth/REVIEWER.md round 12'], evidence: [], notes: 'docs/earth/REVIEWER.md round 12; j1-lamp-pools folds in.' },
  { id: 'phone-look', tier: 1, area: 'render', status: 'not_started',
    title: 'Phone sharpness and look checked on real devices after the new defaults',
    user_visible_behavior: 'On a real phone the painting is as sharp and as coloured as on a PC, within the phone\'s frame budget.',
    verification: [], evidence: [], notes: 'Needs Robby\'s phone (the Pages deploy).' },
  { id: 'bloom', tier: 2, area: 'gameplay', status: 'not_started',
    title: 'The bloom: a seen map, the pencil-to-colour composite, the first-sight wash (a throwaway prototype first, to prove the feel)',
    user_visible_behavior: 'Somewhere new is a pencil sketch; the moment it\'s in view it washes into watercolour as far as you can see, once, for good.',
    verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §1, §15 step 1. The only gameplay allowed before tiers 0–1 pass: a small throwaway prototype.' },
  { id: 'pencil-collecting', tier: 2, area: 'gameplay', status: 'not_started', title: 'Pencil collecting: tap to paint, the card into the sketchbook, the out-of-sight rhythm, cards as moments', user_visible_behavior: 'A few things nearby stay in pencil; tap one within ~30 m and it paints in and flies into the sketchbook as a card of that moment.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §2, §15 step 2.' },
  { id: 'van-home-start', tier: 2, area: 'gameplay', status: 'not_started', title: 'The van-home start and placing at home: wake in the van, "Start near you?", step out; the first card placed at home', user_visible_behavior: 'You wake in a small van that\'s bigger inside; with consent the game starts at a public spot in your town; your first card goes on its shelf.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §7, §8, §15 step 3. City-level location only, never stored (privacy: ask Robby before building).' },
  { id: 'placing-in-world', tier: 2, area: 'gameplay', status: 'not_started', title: 'Placing things in the world: your own layer, ride what you\'ve painted, light the bridge, plank the creek, near in full and far as flat paintings, the camp kit', user_visible_behavior: 'Hold to paint from the sketchbook: a boat settles on water, lanterns on the bridge, a plank across the creek — on your own private layer, kept until you take it back.', verification: [], evidence: ['src/ui/brush.ts (the prototype)', 'src/player/place.ts (the solvers)'], notes: 'docs/GAMEPLAY_VISION.md §6, §15 step 4. Supersedes brush-boat-minute.' },
  { id: 'regional-rares', tier: 2, area: 'gameplay', status: 'not_started', title: 'Regional rares as data, sketchbook silhouettes, sets, then moment rares', user_visible_behavior: 'Each state and town has its own things worth finding; the sketchbook shows what\'s still missing and when.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §3, §15 step 5. Folds in almanac-regional.' },
  { id: 'van-travel', tier: 2, area: 'gameplay', status: 'not_started', title: 'Van travel: call it, drive it, fuel, self-drive, sleep legs with planned stops and arrival cards', user_visible_behavior: 'Tell the map where to go; drive or sleep in the back and wake at a stop chosen for a reason.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §4, §15 step 6. Needs public-places (gas stations, rest areas).' },
  { id: 'growing-home', tier: 2, area: 'gameplay', status: 'not_started', title: 'Growing the home: rooms, windows that show the vehicle\'s view, miniatures, outdoor rooms', user_visible_behavior: 'Add rooms where you like; every window shows the vehicle\'s real view; a lighthouse as a model on a shelf; a backyard inside.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §7, §15 step 7.' },
  { id: 'special-vehicles', tier: 2, area: 'gameplay', status: 'not_started', title: 'The other special vehicles: yacht, plane, balloon, each earned in the world', user_visible_behavior: 'Earn a yacht at a marina, a plane at an airfield, a balloon at a festival: the same home behind every door.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §4, §15 step 8. Needs public-places (airfields, marinas).' },
  { id: 'portal-gun', tier: 2, area: 'gameplay', status: 'not_started', title: 'The portal gun (legendary)', user_visible_behavior: 'A one-off find that opens a portal to anywhere you\'ve painted, your portals, or home.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §9, §15 step 9.' },
  { id: 'series-bridge-postcards', tier: 2, area: 'gameplay', status: 'not_started', title: 'Series, the bridge on its real schedule, postcards', user_visible_behavior: 'Three hours or seasons of one view as one card; the bridge opens when you sound for it; send a painting to a friend.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §11, §13, §15 step 10.' },
  { id: 'the-dog', tier: 2, area: 'gameplay', status: 'not_started', title: 'The dog (later)', user_visible_behavior: 'Adopt a dog from a mapped shelter; its nose finds pencil things; beach rules to break, for fun.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §10, §15 step 11.' },
  { id: 'friends-visits', tier: 2, area: 'gameplay', status: 'not_started', title: 'Friends and visits', user_visible_behavior: 'A friend steps into your home or walks a town with you and sees your layer while visiting.', verification: [], evidence: [], notes: 'docs/GAMEPLAY_VISION.md §13, §15 step 12. Needs accounts (ask Robby: privacy).' },
];

// ---- the existing items: tier, and what became of the stale ones ----
const PLAN = {
  // tier 0
  'phones': { tier: 0, notes: 'Tier 0 (2026-10-03): what\'s left needs a real phone — Robby, on the Pages deploy: ?diag=1 in Manhattan, and an iPhone for the gesture-zoom guard.' },
  'playtest-suite': { tier: 0, status: 'in_ci', notes: 'Tier 0 (2026-10-03): .github/workflows/playtest.yml plays the quick suite headless (SwiftShader, the baked shore) on every push and PR, with the typecheck, tests and build. Locally 2026-10-03: 5 of 6 checks passed; posts failed on a rural mailbox in a junction link\'s lane (Sea Bright\'s Ocean Avenue at Rumson Road) — fixed (props.ts drops a box in any carriageway; tests/kerbposts.test.ts).' },
  'traversal-spike': { tier: 0, status: 'superseded', stale: 'The loop it was to decide is decided (docs/GAMEPLAY_VISION.md). Its streaming question — does the pipeline keep up at 25 m/s — is every-tile-loads\' at driving speed (drive-hitch passed; the van\'s self-drive will lean on it).' },
  'measured-shore-sidecar': { tier: 1 }, 'measured-service': { tier: 1 }, 'measured-fallback-priors': { tier: 1 }, 'measured-parity': { tier: 1 },
  // tier 1
  'place-parity': { tier: 1 },
  'street-furniture-nodes': { tier: 1, status: 'not_started', notes: 'Unblocked by own-osm-extract (2026-10-03): real cells come from our own extract, whatever Overpass is doing — lamps, crossing markings and hydrants included. Mapillary objects fill the gaps (mapillary-objects).' },
  'towers-structures': { tier: 1 }, 'j1-lamp-pools': { tier: 1, notes: 'Folds into night-ground-far-trees (Tier 1).' },
  'interiors-rooms': { tier: 1 }, 'city-doors': { tier: 1 }, 'harness-asserts-see': { tier: 1 }, 'altitude-depth': { tier: 1 }, 'gpu-benchmark': { tier: 1, notes: 'Tier 1 with phone-look: a measured tier choice for phones.' },
  // tier 2 (superseded by the vision's steps)
  'brush-boat-minute': { tier: 2, status: 'superseded', stale: 'docs/GAME_DESIGN.md §14\'s slice; the vision replaces the brush-from-life slices with pencil collecting (§2) and placing on your own layer (§6): placing-in-world. The brush code stays as the prototype of placing.' },
  'almanac-regional': { tier: 2, status: 'superseded', stale: 'Folded into regional-rares (docs/GAMEPLAY_VISION.md §3): rares as data by region, silhouettes, sets.' },
  'atlas-journal': { tier: 3 }, 'people-doing-things': { tier: 3 }, 'local-plates-interiors': { tier: 3 },
  // tier 3 (the vision names these)
  'vehicle-polish': { tier: 3 }, 'l-cross-gable': { tier: 3 }, 'j2-rest': { tier: 3 }, 'k-life': { tier: 3 }, 'l-full': { tier: 3 }, 'k-life-districts': { tier: 3 }, 'hero-region-02': { tier: 3 }, 'j1-road-ribbon': { tier: 3 },
};
// the passing items keep their place by area: platform → 0; world, render, data, presentation → 1; the rest → 3
const AREA_TIER = { platform: 0, world: 1, render: 1, rendering: 1, data: 1, presentation: 1, buildings: 1, core: 1, tools: 1, gameplay: 3, life: 3, ui: 3 };
const ORDER0 = ['own-osm-extract', 'every-tile-loads', 'spawn-on-land-outside', 'playtest-suite', 'worker-costs', 'phones', 'own-place-index', 'licence-check', 'credits-screen', 'traversal-spike'];
const ORDER1 = ['real-world-comparison', 'place-parity', 'public-places', 'mapillary-objects', 'street-furniture-nodes', 'night-ground-far-trees', 'j1-lamp-pools', 'phone-look', 'gpu-benchmark', 'interiors-rooms', 'city-doors', 'towers-structures', 'harness-asserts-see', 'altitude-depth'];
const ORDER2 = ['bloom', 'pencil-collecting', 'van-home-start', 'placing-in-world', 'regional-rares', 'van-travel', 'growing-home', 'special-vehicles', 'portal-gun', 'series-bridge-postcards', 'the-dog', 'friends-visits', 'brush-boat-minute', 'almanac-regional'];

for (const n of NEW) if (!byId.has(n.id)) { const item = { id: n.id, ...n }; f.features.push(item); byId.set(n.id, item); }
for (const x of f.features) {
  const p = PLAN[x.id];
  x.tier = p?.tier ?? NEW.find((n) => n.id === x.id)?.tier ?? AREA_TIER[x.area] ?? 3;
  if (p?.status === 'superseded' && x.status !== 'superseded') { x.status = 'superseded'; x.stale_reason = `${today}: ${p.stale}`; }
  else if (p?.status === 'in_ci' && x.status !== 'passing') x.status = 'not_started';
  else if (p?.status && p.status !== 'in_ci' && p.status !== 'superseded' && x.status !== 'passing') x.status = p.status;
  if (p?.notes && !(x.notes ?? '').includes(p.notes)) x.notes = [x.notes, p.notes].filter(Boolean).join(' ');
}
// one in_progress: the extract
for (const x of f.features) if (x.status === 'in_progress' && x.id !== 'own-osm-extract') x.status = 'not_started';
const ORDER = [...ORDER0, ...ORDER1, ...ORDER2];
const open = (x) => x.status !== 'passing' && x.status !== 'superseded';
f.features.sort((a, b) => a.tier - b.tier || (ORDER.indexOf(a.id) < 0 ? 999 : ORDER.indexOf(a.id)) - (ORDER.indexOf(b.id) < 0 ? 999 : ORDER.indexOf(b.id)) || Number(open(b)) - Number(open(a)) || (a.priority ?? 9) - (b.priority ?? 9));
f.features.forEach((x, i) => { x.rank = i + 1; });
// (keys in a readable order: id, tier, rank, status first)
f.features = f.features.map(({ id, tier, rank, status, ...rest }) => ({ id, tier, rank, status, ...rest }));
writeFileSync(P, JSON.stringify(f, null, 2) + '\n');
const count = (pred) => f.features.filter(pred).length;
console.log(`${f.features.length} items · tier 0 ${count((x) => x.tier === 0)}, 1 ${count((x) => x.tier === 1)}, 2 ${count((x) => x.tier === 2)}, 3 ${count((x) => x.tier === 3)} · in_progress ${f.features.filter((x) => x.status === 'in_progress').map((x) => x.id).join(', ')} · superseded ${count((x) => x.status === 'superseded')}`);
for (const x of f.features.filter((x) => x.tier <= 1 && open(x))) console.log(`  T${x.tier} #${x.rank} ${x.id} [${x.status}]`);
