import * as THREE from 'three';
import { loadWorld, loadRegions, loadAtlas, manifestAsWorldJson, fromLatLon, toLatLon, type AtlasManifest, type Terrain, type World, type Road, type WorldJson } from './world/data';
import { cachedFetchJson, initCache, manifestFingerprint } from './world/cache';
import { TileStream, streamParams } from './world/stream';
import { Horizon } from './world/horizon';
import { Skyline, setSkylineSource } from './world/skyline';
import { FarSkyline } from './world/farSkyline';
import { KerbCars } from './world/kerbCars';
import { underRaised, PAD_PAINT } from './world/pads';
import { MicroLayer } from './world/microLayer';
import { NearTrees } from './world/nearTrees';
import { seasonAt, dayOfYear } from './world/season';
import { setWorldDate } from './world/calendar';
import { CrowdLayer, CROWD_TIERS } from './world/crowdLayer';
import { setDemBase } from './world/dem';
import { virtualRegion } from './world/virtual';
import { paintGround } from './world/groundPaint';
import { buildGround, terrainTextures } from './world/ground';
import { freesUploaded, setFreeUploaded, setGndMaterial } from './world/pack';
import { buildWater, waterParams } from './world/water';
import { nearPlane } from './render/nearPlane';
import { Wakes } from './world/wakes';
import { activeBuilding, type Door, type Footprint } from './world/buildings';
import { styleFor, setActiveStyle } from './world/styles';
import { setRoofSource } from './world/aerial';
import { TAG_ROOF_COLOURS } from './world/realTile';
import { Vehicles } from './player/vehicles';
import { GrassField } from './world/grass';
import { roadNear } from './world/roadBounds';
import { buildSky, skyUniforms } from './world/sky';
import { LifeClient, buildLifeBase, buildLifeInit, lifeInitSteps, lifeParams } from './sim/life';
import { Ambience } from './audio/ambience';
import { Journal } from './ui/journal';
import { Explore, SEEN_REACH } from './world/explore';
import { AmbientBalloons } from './world/balloons';
import { windKey } from './world/wind';
import { propMaterial } from './render/propMaterial';
import { compass } from './player/place';
import { shortRegion, setPlaceService } from './ui/geo';
import { initCredits } from './ui/credits';
import { Atlas } from './ui/atlas';
import { PhotoMode } from './ui/photo';
import { Commissions } from './ui/commissions';
import { makeCardArt } from './ui/cardArt';
import { Hints } from './ui/hints';
import { Brush } from './ui/brush';
import { peaksAround, sightsFrom, compassWord, type Peak } from './world/peaks';
import { Arrival } from './ui/arrival';
import type { GameCtx } from './ui/ctx';
import { modelName } from './player/vehicles';
import { Critters } from './sim/critters';
import { rhythmFor, type LifeInit } from './sim/protocol';
import { Garden } from './ui/garden';
import { SPECIES, TREE_KINDS, treeMeta } from './assets/flora';
import { Interiors, planInterior, registerPlan, type Plan } from './world/interiors';
import { LiftRide } from './player/lift';
import { LiftUI } from './ui/lift';
import { applyAtmosphere, type Weather } from './world/atmosphere';
import { U } from './render/shared';
import { WatercolorPost, postParams } from './render/post';
import { skyDepth, unprojectDepth, mendDepth } from './render/seen';
import { SunShadows, shadowParams } from './render/shadows';
import { applyTier, autoSteps, deviceInfo, isPhoneClass, pickTier, stepsPaid } from './render/quality';
import { sleepWhenHidden } from './ui/lifecycle';
import { began, contextLost, contextRestored, diag, diagInit, diagStage, diagTick, errorLine, frameFailed, frameOk, glInfo, glProbe, NO_WEBGL, shaderError, showReport, watchdogSeconds } from './ui/diag';
import { WalkWorld } from './player/collision';
import { landingAt } from './player/landing';
import { Walker, walkParams, setLens } from './player/controller';
import { frameFov } from './player/frame';
import { celestial, localHour, localToMs, sunPosition } from './core/sun';
import { buildPanel, loadSettings, userKeys, timeParams, weatherParams, debugParams } from './ui/panel';

const params = new URLSearchParams(location.search);
setWorldDate(params.get('date')); // (tiles built in the page keep the tile worker's calendar)
const CAPTURE = params.has('capture');
// real-lite tile service base (the H1 worker). Dev convenience: when the page runs on
// localhost with no explicit ?tiles=, assume the local wrangler dev worker — teleporting
// past the bake edge and ?at= then just work. ?tiles=off disables; prod never defaults.
// ?tiles=<url> is explicit; ?tiles=off disables. On localhost with neither, probe the usual
// `wrangler dev` ports (8787, or 8789 when 8787 is taken) before the world is set up — so the
// open world and the streaming past the bake just work, and a dead worker costs one probe.
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const TILES_PARAM = params.get('tiles');
// The deployed tile service (worker/, Cloudflare Workers + R2): every cell is fetched from
// Overpass once, then served from R2/edge to everyone. Production uses it by default;
// localhost prefers a running `wrangler dev` and falls back to it.
const DEPLOYED_TILES = 'https://map-game-tiles.map-game-tiles.workers.dev';
// `?tiles=direct`: no service — each browser asks Overpass itself (tile.worker.ts directTile);
// the service path also falls back to direct when it stalls.
let TILES = TILES_PARAM === 'off' ? '' : TILES_PARAM ?? (LOCAL ? '' : DEPLOYED_TILES);
async function probeLocalTiles(): Promise<string> {
  // The dev server proxies /__tiles → whichever port `wrangler dev` took (vite.config.ts).
  const via = `${location.origin}/__tiles`;
  const ok = await fetch(`${via}/health`, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
  if (ok) return via;
  const ports = [8787, 8788, 8789]; // `vite preview` has no proxy — try the worker directly
  const hits = await Promise.all(ports.map((p) => fetch(`http://localhost:${p}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => (r.ok ? `http://localhost:${p}` : ''), () => '')));
  return hits.find((h) => h) ?? DEPLOYED_TILES;
}
const $ = (id: string) => document.getElementById(id)!;

// Errors, the GPU's limits, how far the boot got — shown on the page when the world can't be
// (ui/diag.ts; index.html's boot guard covers the time before this module runs).
const crashed = diagInit();

async function main() {
  if (TILES_PARAM === null && LOCAL) TILES = await probeLocalTiles();
  // the place index (search, arrival cards) is the deployed service's R2 unless a remote service is
  // named (a local `wrangler dev` has no index in its R2); ?places=<url>|off overrides
  const PLACES = params.get('places');
  setPlaceService(PLACES === 'off' || (TILES_PARAM === 'off' && !PLACES) ? '' : PLACES ?? (/^https?:\/\//.test(TILES) && !/localhost|127\.0\.0\.1/.test(TILES) ? TILES : DEPLOYED_TILES));
  diagStage('regions');
  const regions = await loadRegions();
  // One consistent world: an unknown ?region= (old per-town links) lands in the listed one.
  const asked = params.get('region');
  let REGION = asked && (!regions?.length || regions.some((r) => r.id === asked)) ? asked : regions?.[0]?.id ?? 'shore';
  // Deep link: ?at=lat,lon — pick the baked region whose backdrop contains the point
  // (nearest origin as fallback), then spawn there / at the nearest real front door.
  const atM = params.get('at')?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  const atLatLon = atM ? ([+atM[1], +atM[2]] as [number, number]) : null;
  let best = Infinity;
  if (atLatLon && !params.get('region') && regions?.length) {
    // Slice containment beats backdrop containment beats nearest (neighbouring regions overlap).
    const boxD = (b: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) =>
      Math.hypot(Math.max(b.x0 - x, x - b.x1, 0), Math.max(b.z0 - z, z - b.z1, 0));
    for (const r of regions) {
      try {
        const man = (await cachedFetchJson(`./data/${r.id}/manifest.json`)) as AtlasManifest;
        const [x, z] = fromLatLon(man.origin, atLatLon[0], atLatLon[1]);
        const d = boxD(man.slice, x, z) === 0 ? 0 : boxD(man.backdrop, x, z) === 0 ? 1 : 2 + boxD(man.backdrop, x, z);
        if (d < best) {
          best = d;
          REGION = r.id;
        }
        if (d === 0) break;
      } catch { /* region not baked */ }
    }
  }
  // Open world: ?at= anywhere past every baked backdrop + a tile service → a virtual
  // manifest anchored there; every cell streams real-lite (or synth fallback) tiles.
  const VIRTUAL = !!(atLatLon && TILES && !params.get('region') && (!regions?.length || best >= 2));
  loadSettings(REGION);
  const canvas = $('view') as HTMLCanvasElement;
  diagStage('webgl');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  } catch (e) {
    diag.glError = glProbe(e); // (main's catch puts the report up)
    throw e;
  }
  diag.gl = glInfo(renderer.getContext());
  renderer.debug.onShaderError = shaderError; // a program that won't compile here: say so on the page
  renderer.setPixelRatio(1);
  renderer.autoClear = true;
  renderer.setClearColor(0xd8e0e4, 1);
  const maxTex = renderer.capabilities.maxTextureSize;
  // Quality tier: a phone gets lighter paint, shadows, ground canvases and tile rings (quality.ts);
  // one whose last visit here died on screen steps down again. Saved panel knobs always win.
  const device = deviceInfo(maxTex);
  // A phone or a tablet: it sleeps when it's put away (below, ui/lifecycle.ts) — a PC tab is left as it was
  const MOBILE = isPhoneClass(device);
  // (a phone whose last load here lost its GPU context steps down a tier too: its GPU ran out)
  const tier = pickTier(device, { forced: params.get('quality'), crashed: !!crashed || (MOBILE && !!diag.lostBefore) });
  const tierSet = applyTier(tier, { post: postParams, shadow: shadowParams, stream: streamParams }, userKeys);
  diag.tier = tier.tier;
  diag.tierWhy = tier.why;
  (window as unknown as Record<string, unknown>).__TIER__ = { ...tier, set: tierSet };
  if (tier.tier !== 'desktop') console.info(`quality tier: ${tier.tier} (${tier.why})${tierSet.length ? ' — ' + tierSet.join(', ') : ''}`);
  diagStage('world', tier.tier);

  // Atlas = manifest + terrain + streamed tiles. Regions baked before tiling still work: the manifest
  // is synthesised as a single tile pointing at world.json. Virtual regions are built in code —
  // there is no atlas on disk (and no terrain.bin; the flat layer rides in-band to the worker).
  const base = `./data/${REGION}/`;
  let manifest: AtlasManifest;
  let paintWorld: World;
  let terrain: Terrain;
  let terrBin: ArrayBuffer | null = null;
  if (VIRTUAL) {
    const v = virtualRegion(atLatLon!);
    manifest = v.manifest;
    terrain = v.terrain;
    terrBin = v.bin;
    paintWorld = { json: manifestAsWorldJson(manifest), terrain };
    initCache(base, manifestFingerprint(manifest)); // remote tiles share the idb cache, namespaced per origin
  } else {
    const atlasRes = await loadAtlas(base);
    if (atlasRes) {
      manifest = atlasRes.manifest;
      terrain = atlasRes.terrain;
      const paintJson = (await cachedFetchJson(base + 'paint.json')) as WorldJson;
      paintWorld = { json: paintJson, terrain };
    } else {
      const w = await loadWorld(base, (m) => ($('loading').textContent = m));
      manifest = {
        version: 1, id: REGION, meta: w.json.meta, origin: w.json.origin, slice: w.json.slice, backdrop: w.json.backdrop,
        sources: w.json.sources, cell: 1e9, margin: 0, terrain: w.json.terrain,
        roads: w.json.roads.filter((r) => r.n), pois: w.json.pois, landmarks: w.json.landmarks,
        tiles: [{ id: '0_0', box: w.json.backdrop, lod: 0, file: 'world.json' }],
      };
      paintWorld = w;
      terrain = w.terrain;
    }
  }
  const world: World = { json: manifestAsWorldJson(manifest), terrain };
  world.terrain.patchCell = manifest.cell;
  const { json } = world;
  const meta = json.meta;
  // Phase I: the region's look — meta.style when the manifest pins one, else derived from the
  // origin. Set before any tile builds (the stream hands the key to the tile worker at spawn).
  const regionLook = styleFor(meta, manifest.origin);
  setActiveStyle(regionLook);
  // A baked pack whose roof colours were read off aerial photos (its sources say so) has them
  // balanced per tile as it builds (aerial.ts) — here for the in-page builds, and the tile worker.
  // `?aerial=0`: the roofs as they were (the pack's raw samples folded to grey, palette roofs on
  // streamed cells) — for comparing.
  const aerialRoofs = params.get('aerial') !== '0';
  setRoofSource(aerialRoofs && manifest.sources?.roofColours ? 'painted' : null, TAG_ROOF_COLOURS);
  activeBuilding.uWinStyle.value.set(regionLook.windowCode, regionLook.shutterP, 0, 0);
  U.uBiome.value.set(...regionLook.biome);
  const townName = meta?.name ?? 'town';
  const shoreLabel = meta?.shoreLabel ?? 'the beach';
  const tz = meta?.tz ?? 'America/New_York';
  if (meta) {
    document.title = `${meta.name} — a watercolor walk`;
    $('town-name').textContent = meta.name;
    $('town-sub').textContent = meta.sub;
    $('journal-title').textContent = meta.title;
  }
  if (regions && regions.length > 1) {
    $('regions').innerHTML = regions.map((r) => (r.id === REGION ? `<b>${r.name}</b>` : `<a href="?region=${r.id}">${r.name}</a>`)).join(' · ');
  }
  $('loading').textContent = 'laying down the first washes…';
  await new Promise((r) => setTimeout(r, 0));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(frameFov(walkParams.fov, innerWidth / innerHeight), innerWidth / innerHeight, 0.25, 25000);
  camera.layers.enable(1);

  diagStage('paint');
  const tt = terrainTextures(world);
  const paint = paintGround(paintWorld, Math.min(maxTex, tier.paintTex));
  // Floating origin: everything in region coordinates lives under worldRoot. The render loop
  // shifts worldRoot by -origin so the camera stays near 0; shaders add U.uWorldOffset back
  // where they need true world positions (pigment, shadows, lamp/paint maps, fog distance).
  const worldRoot = new THREE.Group();
  worldRoot.name = 'world';
  scene.add(worldRoot);
  const groundGroup = buildGround(world, paint, tt);
  U.uDetailBox.value = paint.detail.box; // (the far street ribbons step aside where the paint is fine)
  worldRoot.add(groundGroup);
  setGndMaterial(groundGroup.userData.groundMat); // synthetic tiles reuse this material
  worldRoot.add(buildWater(tt));
  const wakes = new Wakes(); // (every boat under way draws its V on the water)
  wakes.bedAt = (x, z) => world.terrain.heightAt(x, z); // (none over a dock's sand or a bar)
  worldRoot.add(wakes.mesh);
  waterParams.uOpenSea.value = VIRTUAL ? 1 : 0; // (the open world's plane is the sea itself)
  { // the region's water: Puget Sound's green-steel, the Keys' turquoise, the Gulf's olive
    const w = regionLook.water;
    waterParams.uOceanDeep.value.setHex(w.deep);
    waterParams.uOceanShallow.value.setHex(w.shallow);
    waterParams.uRiverDeep.value.setHex(w.riverDeep);
    waterParams.uRiverShallow.value.setHex(w.riverShallow);
  }
  const sky = buildSky();
  scene.add(sky);
  U.uSliceBox.value.set(json.slice.x0, json.slice.z0, json.slice.x1, json.slice.z1);

  // Walk physics + interiors registry: everything is tile-scoped so neighbourhoods stream in and out.
  const walk = new WalkWorld(world.terrain, json.backdrop);
  // Synthetic tiles continue past the backdrop — the walkable bound must too (water still
  // gates via terrain height/sdf; this only widens the geometric fence).
  walk.bounds = { x0: -4e6, z0: -4e6, x1: 4e6, z1: 4e6 };
  const interiors = new Interiors(walk);
  worldRoot.add(interiors.group);
  // DEM patches for every streamed cell (w-/s-) whenever a tile service exists — past a baked
  // region's backdrop the resident terrain is just its clamped edge, so hills need the patch too.
  const tilesBase = TILES || manifest.tilesUrl || '';
  const stream = new TileStream(base, manifest, world.terrain, walk, interiors, worldRoot, tilesBase, terrBin, !!tilesBase);
  // Measured buildings from USGS 3DEP LiDAR wherever a survey covers the cell (lidar.ts);
  // `?lidar=0` builds from mapped priors only. A phone's tier builds from them too (quality.ts):
  // a city's survey decoded in the tab was hundreds of MB, and each cell built twice; `?lidar=1`.
  stream.lidar = params.get('lidar') === '1' || (params.get('lidar') !== '0' && tier.lidar);
  // A phone's tiles keep their vertex data only on the GPU (pack.ts; `?free=0` keeps both copies)
  setFreeUploaded(params.get('free') === '1' || (params.get('free') !== '0' && tier.freeArrays));
  // …and every tier applies the measurements already made — a baked pack's sidecar
  // (scripts/measure-cells.mjs), the tile service's records: a phone's buildings stand as tall
  // as a desktop's without reading the survey. `?measured=0` leaves them out (a desktop then
  // measures every cell itself, for comparing).
  stream.measured = params.get('lidar') !== '0' && params.get('measured') !== '0';
  // Real roof colours on streamed US cells, off the NAIP aerial photo (aerialFetch.ts) — one
  // photo a cell, read once per browser; every tier. `?aerial=0` keeps the palette roofs.
  stream.aerial = aerialRoofs;
  // The horizon ring: real mountains out to 80 km past the tiles (Terrarium z9 through the same
  // DEM route the cells use). `?horizon=0` turns it off.
  if (tilesBase) setDemBase(tilesBase);
  const horizon = new Horizon(manifest.origin, regionLook, !!tilesBase && params.get('horizon') !== '0');
  worldRoot.add(horizon.group);
  // …and a city's towers past the detail ring (a skyline you can navigate by). `?skyline=0` off.
  // (the towers come from the tile service's /skyline — our own extract; Overpass only on ?tiles=direct)
  setSkylineSource(tilesBase, tilesBase === 'direct');
  const skyline = new Skyline(manifest.origin, manifest.cell, !!tilesBase && params.get('skyline') !== '0', tier.skylineR);
  worldRoot.add(skyline.group);
  // …and past it the far skyline: the very tallest towers out to ~60 km at their real distance,
  // over the earth's curve and through the day's air — the city across the bay on a clear day,
  // nothing in the haze. `?farskyline=0` off.
  const farSkyline = new FarSkyline(manifest.origin, !!tilesBase && params.get('farskyline') !== '0');
  worldRoot.add(farSkyline.group);
  const realCells = new Set<string>();
  // The localhost auto-default was probed before setup: no worker answered → procedural past the bake.

  // Grass: tufts grow on open land around the walker (lawns short, open ground tall + lush).
  const grass = new GrassField(world.terrain, walk, () => stream.primRoads, paint.grassMask);
  worldRoot.add(grass.group);
  // Parked kerb and lot cars: one manager draws every tile's, near cars in the lite kit, far ones
  // as two-block proxies (kerbCars.ts)
  const kerbCars = new KerbCars();
  kerbCars.ground = (x, z, y) => walk.outdoorNear(x, z, y);
  kerbCars.height = (x, z) => world.terrain.heightAt(x, z);
  kerbCars.walls = walk; // (a beach lot's cars are walled while they're parked: calendar.ts)
  worldRoot.add(kerbCars.group);
  // The beach's people (crowd.ts places them per tile — on the chairs and towels, at the waterline,
  // up in the lifeguard stands): the near ones in the full body, the beach in the lite one, only
  // those there at the world's hour (crowdLayer.ts)
  const crowd = new CrowdLayer(CROWD_TIERS[tier.tier]);
  worldRoot.add(crowd.group);
  // The small things of the place (world/micro.ts places them per tile: carts, chairs, cleats,
  // towels, the mapped picnic tables…): real close up, impostor cards further out, two draws for
  // all of them (world/microLayer.ts). `?micro=0` leaves them out.
  const micro = new MicroLayer(renderer, tier.micro);
  micro.group.visible = params.get('micro') !== '0';
  worldRoot.add(micro.group);
  // Trees within ~30 m drawn from their near model — limbs, a tapering trunk, leaf-cluster cards
  // with the sky between the leaves — handing over to the tiles' own crowns further out
  // (world/nearTrees.ts). `?neartrees=0` keeps every tree on its far model.
  const treeLayer = new NearTrees(tier.trees);
  treeLayer.enabled = params.get('neartrees') !== '0';
  worldRoot.add(treeLayer.group);
  // the coarse backdrop's far-forest canopy drops wherever a detail tile is mounted (its trees are
  // real), and the backdrop steps aside altogether where a streamed cell brought its own ground
  const streamedGround = () => {
    const cells = new Map<string, 128 | 255>();
    const key = (b: { x0: number; z0: number; x1: number; z1: number }) => `${Math.floor((b.x0 + b.x1) / 2 / 1024)}_${Math.floor((b.z0 + b.z1) / 2 / 1024)}`;
    for (const t of stream.loaded.values()) {
      const k = key(t.spec.box);
      if (t.spec.world || t.spec.synth) cells.set(k, 255);
      else if (!cells.has(k)) cells.set(k, 128);
    }
    // the coarse ring's streamed cells bring a ground chunk too (baked coarse cells don't)
    for (const sp of stream.coarseSpecs) if (sp.world || sp.synth) cells.set(key(sp.box), 255);
    (groundGroup.userData.setDetailCells as (c: Map<string, 128 | 255>) => void)(cells);
  };
  stream.onTile = (a) => {
    paint.addWalks(a.walks, a.spec.id);
    kerbCars.add(a.spec.id, a.kerb, [a.spec.box.x0, a.spec.box.z0, a.spec.box.x1, a.spec.box.z1]);
    micro.add(a.spec.id, a.micro);
    treeLayer.add(a.spec.id, a.group);
    crowd.add(a.spec.id, a.crowd);
    streamedGround();
    // J1: streamed tiles (past the bake) paint their streets and footprints into the ground windows
    if (a.spec.world || a.spec.synth) paint.setTile(a.spec.id, a.primRoads, a.fps.map((f) => f.ring as [number, number][]), [a.spec.box.x0, a.spec.box.z0, a.spec.box.x1, a.spec.box.z1], a.fps.map((f) => !!f.front), a.areas, a.fps.map((f) => (f.kind === 'house' || f.kind === 'shed' ? 0.45 : 1)), a.xing);
    // the ground under a raised house: a pad, gravel or sand — never lawn (pads.ts), every tile's
    paint.setPads(a.spec.id, underRaised(a.fps, (x, z) => world.terrain.oceanDistAt(x, z)).map((q) => ({ ring: q.ring, fill: PAD_PAINT[q.kind], stone: q.kind === 'gravel' })), [a.spec.box.x0, a.spec.box.z0, a.spec.box.x1, a.spec.box.z1]);
    grass.invalidateBox(a.spec.box);
  };
  stream.onUnload = (id) => { paint.dropTile(id); kerbCars.remove(id); micro.remove(id); treeLayer.remove(id); crowd.remove(id); queueMicrotask(streamedGround); };
  const plans = stream.plans;
  const bld = {
    get footprints() { return stream.footprints; },
    get doors() { return stream.doors; },
    doorOf: (f: Footprint) => stream.doorOf(f),
  };
  let lifeDirty = false;
  let lifeBuild: Generator<void, LifeInit, void> | null = null; // a road-graph rebuild in progress
  let ambience: Ambience | null = null;
  const startAudio = () => {
    try { ambience ??= new Ambience(); ambience.resume(); } catch (e) { console.warn('audio unavailable', e); }
  };
  // (a phone says one thing at a time under the place name: the toast takes the hint's place, two
  // lines at most, and the hint comes back once it has faded — body.toasting, style.css)
  // A message that won't fit those two lines is said in parts — split at its last break that fits
  // (" — ", " · ", ": ", "; "), the rest after it — never cut off with "…" (review round 12, must-fix
  // 4; the copy itself is written to fit: tools/hud-audit.mjs renders all of it on ten phones).
  let toastTimer = 0, toastGone = 0, toastRest: string[] = [];
  const toastFits = (el: HTMLElement) => el.scrollHeight <= el.clientHeight + 1;
  const say = (msg: string) => {
    const el = $('toast');
    el.textContent = msg;
    if (document.body.classList.contains('touch') && !toastFits(el)) {
      for (const b of [...msg.matchAll(/ — | · |: |; /g)].map((m) => m.index!).reverse()) {
        el.textContent = msg.slice(0, b);
        if (toastFits(el)) { toastRest.unshift(msg.slice(b).replace(/^ ?[—·:;] ?/, '')); break; }
      }
      if (!toastFits(el)) el.textContent = msg; // (no break that fits: as it is)
    }
    el.classList.add('show');
    document.body.classList.add('toasting');
    clearTimeout(toastTimer);
    clearTimeout(toastGone);
    toastTimer = window.setTimeout(() => {
      const next = toastRest.shift();
      if (next !== undefined) { say(next); return; }
      el.classList.remove('show');
      // (the hint comes back once the fade has ended — on the fade's own clock, not a timer's: on a
      // slow page the two drifted and the hint stood over a toast still fading out)
      const gone = () => { clearTimeout(toastGone); el.removeEventListener('transitionend', gone); if (!el.classList.contains('show')) document.body.classList.remove('toasting'); };
      el.addEventListener('transitionend', gone);
      toastGone = window.setTimeout(gone, 2000); // (no transition ran: display none, reduced motion)
    }, 3200);
  };
  const toast = (msg: string) => { toastRest = []; say(msg); };
  const journal = new Journal(world, paint.sliceCanvas, toast);
  await journal.load();
  // Paint as you explore: a global, persistent record of where you've been (pencil elsewhere).
  const explore = new Explore(json.origin);
  // ?loop=paint: start in the loop under test — the world in pencil, a photo paints what it frames
  // sketch mode: `?loop=paint` starts in it (the photo → paint loop), `?sketch=1` / `?sketch=0` set
  // it; regression shots stay fully painted unless asked
  if (params.get('loop') === 'paint' || params.get('sketch') === '1') postParams.sketchFar = true;
  else if (CAPTURE || params.get('sketch') === '0') postParams.sketchFar = false;
  const walker = new Walker(walk, canvas);

  // Spawn: nearest point on `spawn.on` to an anchor point — the `extreme` end of `spawn.near.road`
  // (Sea Bright: the east end of the Rumson bridge = where it lands on Ocean Ave) — shifted by
  // `spawn.offset` metres, facing `spawn.toward`, stepped `spawn.sidewalk` m right onto the sidewalk.
  const spec = meta?.spawn;
  // Review fix: ?at= beyond every backdrop with no tile service would teleport 5,500 km
  // into a synth void with no explanation — suppress the deep link, drop at the region
  // spawn, and say why.
  const atStranded = !!(atLatLon && !VIRTUAL && !params.get('region') && (!regions?.length || best >= 2));
  const atPos = atLatLon && !atStranded ? fromLatLon(json.origin, atLatLon[0], atLatLon[1]) : null;
  if (atStranded) setTimeout(() => toast('no tile service here — you\'re at the nearest baked town'), 0);
  // Explicit region + a point outside its backdrop: same fix as runtime teleport —
  // drop `region` and let the picker choose (or go virtual) instead of stranding.
  if (atPos && params.get('region')) {
    const b = json.backdrop;
    if (atPos[0] < b.x0 || atPos[0] > b.x1 || atPos[1] < b.z0 || atPos[1] > b.z1) {
      const p = new URLSearchParams(location.search);
      p.delete('region');
      p.delete('shot');
      location.search = p.toString();
      return;
    }
  }
  const sliceC: [number, number] = [(json.slice.x0 + json.slice.x1) / 2, (json.slice.z0 + json.slice.z1) / 2];
  const anchor = spec?.near
    ? roadAnchor(json.roads, spec.near.road, !!spec.near.bridge, spec.near.extreme ?? 'e') ?? sliceC
    : sliceC;
  const target: [number, number] = [anchor[0] + (spec?.offset?.[0] ?? 0), anchor[1] + (spec?.offset?.[1] ?? 0)];
  const onRoad = roadPoint(json.roads, new RegExp(`^${spec?.on ?? ''}`), target[0], target[1], spec?.toward ?? 'north');
  let spawn = atPos
    ? { x: atPos[0], z: atPos[1], yaw: 0, y: undefined as number | undefined }
    : { ...sidewalk(isFinite(onRoad.d) ? onRoad : { x: target[0], z: target[1], yaw: 0, d: 0 }, spec?.sidewalk ?? 0), y: undefined as number | undefined };
  const respawn = () => walker.place(spawn.x, spawn.z, spawn.yaw, -0.02, spawn.y);
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');
  // No mouse to hand (a phone, a tablet — index.html's `nomouse`): the hints name the touch
  // controls. A touch-screen laptop has its keyboard, and keeps the key names.
  const thumbs = () => document.body.classList.contains('nomouse');
  // Pointer lock wants a mouse or trackpad: a phone has none (and headless Chromium, granted one,
  // floods the page with mousemoves), while a touch-screen laptop still does.
  const canLock = () => { try { return matchMedia('(any-pointer: fine)').matches; } catch { return !isTouch; } };
  // Doorstep-first placement (player/landing.ts): near a building → just inside its front door;
  // elsewhere → the nearest open ground (never the water, a roof or a hedge: tools/playtest.js
  // __TELEPORTS__ found 6 of 8 random map picks round the shore standing on the water, unable to
  // take a step), facing down the nearest street.
  // An arrival (an ?at= link, the map's "walk here", a search) is made against whatever has mounted —
  // often a stand-in. When the place's real cell replaces it, the arrival is made again on the real
  // buildings, as long as you're still standing where you arrived (the audit: Bar Harbor's spawn was
  // inside a restaurant once its real cell came in under the twin's doorstep).
  let landed: { x: number; z: number; to: [number, number]; t: number } | null = null;
  const teleportLocal = (x: number, z: number) => {
    const at = landingAt(walk, stream.doors, x, z);
    if (at.door) spawn = { x: at.x, z: at.z, yaw: at.yaw!, y: at.y };
    else {
      // Manifest roads plus whatever tiles have mounted (synth/remote) — in the virtual
      // world the manifest list is empty and a yaw-0 spawn would face nowhere.
      const near = roadPoint([...json.roads, ...stream.primRoads], /./, at.x, at.z, 'north');
      spawn = { x: at.x, z: at.z, yaw: isFinite(near.d) ? near.yaw : 0, y: undefined };
    }
    respawn();
    landed = { x: walker.x, z: walker.z, to: [x, z], t: performance.now() };
  };
  respawn();

  // Bring the spawn neighbourhood online before we build life or prime interiors.
  $('loading').textContent = 'raising the houses…';
  diagStage('tiles');
  await stream.ensureAround(spawn.x, spawn.z);
  diagStage('life');
  if (atPos) teleportLocal(atPos[0], atPos[1]);

  // A landmark (a tower, a monument, an attraction) is arrived at from where it's seen: open
  // ground ~90–220 m off, facing it and looking a little up — not at its front door, where a
  // 180 m tower is a wall beside you (the Space Needle search "took me far away from it").
  const LANDMARK = /tower|attraction|monument|memorial|viewpoint|castle|stadium|lighthouse|landmark|museum|bridge|arena|cathedral|observation/i;
  const viewpoint = (x: number, z: number) => {
    for (const D of [120, 160, 90, 220])
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + 0.3, px = x + Math.sin(a) * D, pz = z + Math.cos(a) * D;
        if (!walk.walkable(px, pz) || walk.buildingAt(px, pz) >= 0 || walk.blocked(px, pz, 1.2) || world.terrain.sdfAt(px, pz) < 2) continue;
        spawn = { x: px, z: pz, yaw: Math.atan2(px - x, pz - z), y: undefined };
        walker.place(px, pz, spawn.yaw, 0.2);
        return true;
      }
    return false;
  };
  if (atPos && params.get('view') === '1') viewpoint(atPos[0], atPos[1]);
  // Runtime teleport (G): same door-snap rule, waiting for the neighbourhood to stream in.
  const teleportTo = async (lat: number, lon: number, kind?: string) => {
    const [x, z] = fromLatLon(json.origin, lat, lon);
    const landmark = !!kind && LANDMARK.test(kind);
    const b = json.backdrop;
    // One world: anywhere within ~80 km stays in this frame when real tiles can stream there
    // (the local tangent plane is still accurate to centimetres); only farther jumps re-anchor.
    const inFrame = (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) || (!!(TILES || manifest.tilesUrl) && Math.hypot(x, z) < 80000);
    if (!inFrame) {
      // Outside this region — let the deep-link picker choose the right town (or go
      // virtual). Dropping `region` too: keeping it would suppress the ?at picker AND
      // the virtual manifest, stranding the spawn far outside every backdrop.
      const p = new URLSearchParams(location.search);
      p.delete('shot');
      p.delete('region');
      p.set('at', `${lat},${lon}`);
      if (landmark) p.set('view', '1');
      else p.delete('view');
      location.search = p.toString();
      return;
    }
    toast('walking over');
    await stream.ensureAround(x, z);
    if (!landmark || !viewpoint(x, z)) teleportLocal(x, z);
  };
  // When a real tile swaps in under the walker, the synth placeholder's collision is
  // tombstoned with it — the player can end up inside a wall. Nudge them clear — but
  // only when genuinely swallowed: a wall through their position, or inside a solid
  // footprint with no interior. Legit indoor players must not be yanked outside.
  const settleWalker = () => {
    if (walkParams.fly) return; // flying over a roof isn't being swallowed by it
    if (interiors.riding) return; // (a lift ride walks you through its shaft's wall on purpose)
    // a wall at 0.28 < the walker's 0.32 radius: running *through* their body, not one they're
    // legally pressed against (at their feet's height: a stair rail upstairs doesn't count) — or
    // standing inside a solid footprint (no rooms, no pilings to walk between). (It was `blocked`,
    // true anywhere inside a footprint: every mount stepped an indoor walker out of the house, and
    // someone between a beach house's pilings out from under it.)
    const inside = walk.buildingAt(walker.x, walker.z);
    const swallowed = walk.touching(walker.x, walker.z, 0.28, walker.feet) || (inside >= 0 && walk.floorsOf(inside) === null && !interiors.indoors);
    if (!swallowed) return;
    for (const r of [2.5, 4, 6, 9, 14])
      for (const a of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const nx = walker.x + Math.sin(walker.yaw + a) * r, nz = walker.z + Math.cos(walker.yaw + a) * r;
        if (walk.buildingAt(nx, nz) < 0 && !walk.blocked(nx, nz, 0.45)) {
          walker.place(nx, nz, walker.yaw, -0.02);
          toast('the paint settled — stepped you clear');
          return;
        }
      }
  };
  stream.onMount = (spec) => {
    // (spec null: no tile, just the rescue now — tools/playtest.js `settle` asks for it that way)
    if (landed && spec?.world) {
      const b = spec.box, [ax, az] = landed.to;
      const still = Math.hypot(walker.x - landed.x, walker.z - landed.z) < 1.5 && performance.now() - landed.t < 180000;
      if (!still) landed = null;
      else if (ax >= b.x0 - 48 && ax <= b.x1 + 48 && az >= b.z0 - 48 && az <= b.z1 + 48 && !vehicles.driving) { teleportLocal(ax, az); return; }
    }
    if (!vehicles.driving) settleWalker();
  };
  let settleT = 1; // …and once a second on foot: whatever put you there (a slow frame, a bad door), you're never shut in
  // Rideable vehicles (E enter/exit; you paint your own with the brush, ui/brush.ts) — the walker rides along.
  // other people's balloons: up at dawn and dusk, down on the beaches (world/balloons.ts)
  const geoLL = { toLatLon: (x: number, z: number) => toLatLon(json.origin, x, z), fromLatLon: (lat: number, lon: number) => fromLatLon(json.origin, lat, lon) };
  const ambientBalloons = new AmbientBalloons({ terrain: world.terrain, walk, mat: propMaterial(), geo: geoLL, hour: () => timeParams.hour });
  worldRoot.add(ambientBalloons.group);
  const vehicles = new Vehicles({
    ambient: ambientBalloons,
    walk, terrain: world.terrain, walker, root: worldRoot, toast,
    roads: () => stream.primRoads,
    tiles: () => stream.loaded.values(),
    kerb: kerbCars,
    driveLeft: regionLook.driveLeft,
    enabled: () => $('intro').classList.contains('hidden') && !atlas.open && !photo.active,
    summons: () => debugParams.summons,
    geo: { toLatLon: (x, z) => toLatLon(json.origin, x, z), fromLatLon: (lat, lon) => fromLatLon(json.origin, lat, lon) },
  });
  { const prev = stream.onTile; stream.onTile = (a) => { prev?.(a); vehicles.onTile(a); }; } // re-hide taken driveway cars on remount
  vehicles.windKey = windKey(json.origin.lat, json.origin.lon); // (the winds aloft: this region's)
  // A first visit: a balloon waits on the nearest beach to where you start (tried as the terrain
  // comes in; none inland). A balloon someone lands near you gets a word.
  const isBeach = (x: number, z: number) => { const T = world.terrain, d = T.oceanDistAt(x, z); return d > 12 && d < 70 && T.heightAt(x, z) > 0.4 && T.sdfAt(x, z) > 3 && walk.buildingAt(x, z) < 0; };
  let giftT = CAPTURE ? -1 : 0, giftTry = 0;
  const landedSaid = new Set<string>();
  const balloonNews = (dt: number) => {
    if (giftT >= 0 && (giftT += dt) > 4 && (giftTry -= dt) <= 0) {
      giftTry = 5;
      if (vehicles.giftBalloon(spawn.x, spawn.z, isBeach) || giftT > 120) giftT = -1;
    }
    if (vehicles.driving) return;
    for (const b of ambientBalloons.near(walker.x, walker.z, 2500)) {
      const k = `${Math.round(b.x / 50)}:${Math.round(b.z / 50)}`;
      if (!b.landed || landedSaid.has(k)) continue;
      landedSaid.add(k);
      const d = Math.hypot(b.x - walker.x, b.z - walker.z);
      if (d > 60) toast(`a balloon landed${world.terrain.oceanDistAt(b.x, b.z) < 80 ? ' on the beach' : ''}, ${d < 950 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`} ${compass(b.x - walker.x, b.z - walker.z)} — fly it`);
    }
  };

  const lifeBase = buildLifeBase(paintWorld, walk);
  lifeBase.rhythm = rhythmFor(regionLook.climate, lifeBase.beachPts.length > 0); // the shape of this place's day
  let visitSeen = 0; // (interiors.visitV last told to the life sim)
  const life = new LifeClient(buildLifeInit(lifeBase, stream.primRoads, walk, stream.doors, stream.junctions, stream.tunnels));
  life.ground = (x, z, y) => walk.outdoorNear(x, z, y);
  worldRoot.add(life.group);
  lifeDirty = false; // init already covers the loaded ring

  // ---- the sketchbook layer: photo mode, commissions, the atlas (map + search), hints, arrivals ----
  const origin = new THREE.Vector3(); // render origin (floating origin; see reanchor)
  const ndc = new THREE.Vector3(), im4 = new THREE.Matrix4(), ip = new THREE.Vector3();
  const playerGroup = worldRoot.getObjectByName('player-vehicles');
  const cardArt = makeCardArt(renderer);
  const ctx: GameCtx = {
    walker, camera, canvas, terrain: world.terrain, json, explore, origin: json.origin,
    toLatLon: (x, z) => toLatLon(json.origin, x, z),
    fromLatLon: (lat, lon) => fromLatLon(json.origin, lat, lon),
    toNdc: (x, y, z) => ndc.set(x - origin.x, y, z - origin.z).project(camera),
    roads: () => (stream.primRoads.length ? [...json.roads, ...stream.primRoads] : json.roads),
    footprints: () => stream.footprints,
    instances: (prefix, x, z, r) => {
      const out: { x: number; y: number; z: number; name: string; sy?: number; sx?: number; yaw?: number }[] = [];
      const scan = (m: THREE.Object3D) => {
        if (!m.name.startsWith(prefix) || !m.visible) return;
        if ((m as THREE.InstancedMesh).isInstancedMesh) {
          // Read the instance array in place (a city tile holds thousands of trees): only the
          // ones inside the query square get their full world transform
          const im = m as THREE.InstancedMesh, a = im.instanceMatrix.array as Float32Array, w = im.matrixWorld.elements;
          const moved = w[0] !== 1 || w[5] !== 1 || w[10] !== 1 || w[1] !== 0 || w[2] !== 0 || w[4] !== 0 || w[6] !== 0 || w[8] !== 0 || w[9] !== 0;
          const lx = x - origin.x - w[12], lz = z - origin.z - w[14];
          for (let i = 0; i < im.count; i++) {
            const o = i * 16;
            if (a[o] === 0 && a[o + 5] === 0) continue; // hidden / zero-scaled
            if (!moved && (Math.abs(a[o + 12] - lx) >= r || Math.abs(a[o + 14] - lz) >= r)) continue;
            im.getMatrixAt(i, im4);
            ip.setFromMatrixPosition(im4).applyMatrix4(im.matrixWorld);
            const wx = ip.x + origin.x, wz = ip.z + origin.z;
            const e = im4.elements;
            if (Math.abs(wx - x) < r && Math.abs(wz - z) < r && Math.hypot(wx - x, wz - z) < r) out.push({ x: wx, y: ip.y, z: wz, name: im.name, sy: Math.hypot(e[4], e[5], e[6]), sx: Math.hypot(e[0], e[1], e[2]), yaw: Math.atan2(e[8], e[10]) });
          }
        } else {
          m.getWorldPosition(ip);
          const wx = ip.x + origin.x, wz = ip.z + origin.z;
          if (Math.hypot(wx - x, wz - z) < r) out.push({ x: wx, y: ip.y, z: wz, name: m.name });
        }
      };
      // only the tiles the circle reaches (their things can sit a little past the cell edge)
      const reach = (r + 150) ** 2;
      for (const t of stream.loaded.values()) {
        const b = t.spec.box, dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
        if (t.group.visible && dx * dx + dz * dz < reach) for (const c of t.group.children) scan(c);
      }
      for (const c of life.group.children) scan(c);
      for (const c of critters.group.children) scan(c);
      for (const c of garden.group.children) scan(c);
      for (const c of kerbCars.group.children) scan(c);
      if (playerGroup) for (const c of playerGroup.children) scan(c);
      return out;
    },
    hour: () => timeParams.hour,
    setHour: (h) => setHour(h),
    env: () => ({ night: U.uNight.value, golden: U.uGolden.value, fog: weather.seaFog, oceanDist: world.terrain.oceanDistAt(walker.x, walker.z) }),
    placeLabel: () => $('place').textContent || townName,
    locality: () => arrival.locality || townName,
    region: () => arrival.region || meta?.sub || '',
    cardArt: (family, type, pencil) => cardArt(family, type, pencil),
    toast,
    teleport: async (lat, lon) => { await teleportTo(lat, lon); arrival.greet(); },
    sound: (k) => ambience?.ui(k),
    paintView: async () => {
      if (!postParams.enabled || !postParams.sketchFar) return null;
      // the frame's depth on a small grid (384 on the long side, a phone 256), unprojected through this frame's
      // camera — captured now, before the next frame moves it (render/seen.ts)
      const a = camera.aspect, L = MOBILE ? 256 : 384, /* (a phone lays it in sooner) */ w = a >= 1 ? L : Math.max(16, Math.round(L * a)), h = a >= 1 ? Math.max(16, Math.round(L / a)) : L;
      const inv = [...camera.projectionMatrixInverse.elements], cw = [...camera.matrixWorld.elements], off = { x: origin.x, y: 0, z: origin.z };
      const depth = await post.readSeen(w, h, camera.near, camera.far);
      // see through what stands in front of the view (a rope, a post, a wire — each was a streak of
      // canvas out to the horizon) and, riding, through the ride itself (render/seen.ts mendDepth)
      const k = vehicles.activeKind;
      const rideNear = k === 'balloon' ? (vehicles.third ? 70 : 30) : k === 'plane' ? 45 : k === 'car' ? 11 : k === 'boat' ? 14 : 0;
      if (depth) mendDepth(depth, w, h, { thin: Math.round(Math.max(w, h) * 0.06), near: rideNear });
      const g = depth && unprojectDepth(depth, w, h, inv, cw, off, skyDepth(camera.near, camera.far));
      return g && explore.paintSeenSliced(g, { x: cw[12] + off.x, y: cw[13], z: cw[14] + off.z }, { reach: Math.min(SEEN_REACH, postParams.photoReach), ground: (x, z) => Math.max(world.terrain.heightAt(x, z), 0) });
    },
    uiOpen: () => !$('intro').classList.contains('hidden') || atlas.open,
    lock: () => { if (canLock()) walker.lock(); },
  };
  // wildlife + your garden (assets/fauna.ts, assets/flora.ts)
  const critters = new Critters(world.terrain, walk);
  worldRoot.add(critters.group);
  const garden = new Garden(ctx, walk, regionLook.climate);
  worldRoot.add(garden.group);
  void garden.load();
  critters.onEvent = (kind, what, pan, dist) => ambience?.critter(kind, what, pan, dist);
  // the world reacts to your ride: walkers in a moving car's path are knocked down (they get up and
  // walk on), and animals give way to anything moving — traffic and you alike
  const rideMover = { x: 0, z: 0, vx: 0, vz: 0 };
  let rideMoving = 0, bumpAt = 0;
  vehicles.onMove = (kind, x, _y, z, vx, vz) => {
    rideMover.x = x; rideMover.z = z; rideMover.vx = vx; rideMover.vz = vz; rideMoving = 2;
    const now = performance.now();
    if (kind === 'car' && now - bumpAt > 90 && Math.hypot(vx, vz) > 2.5) { bumpAt = now; life.bump(x, z, vx, vz); }
  };
  life.onBumped = (n) => { if (n > 0) ambience?.ui('thud'); };
  const movers: { x: number; z: number; vx: number; vz: number }[] = [];
  garden.onClear = (x, z) => grass.invalidateBox({ x0: x - 3, z0: z - 3, x1: x + 3, z1: z + 3 });
  garden.onBloom = (p) => { toast(`your ${SPECIES[p.sp].label} is in bloom ✿`); ambience?.ui('chime'); };
  // habitat lookups for the critters: trees + garden beds near the walker, refreshed every 2 s
  let habitatT = 0, townHere = 0, nearTrees: { x: number; z: number; trunk?: number; r?: number; lean?: [number, number] }[] = [], nearGardens: { x: number; z: number }[] = [];
  const within = (list: { x: number; z: number }[], x: number, z: number, r: number) => list.filter((p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r && Math.hypot(p.x - x, p.z - z) < r);
  const south = json.origin.lat < 0;
  // the world's month (the chosen date, not the machine's): critters, gardens and sound follow it
  const worldMonth = () => new Date(worldMs).getUTCMonth() + 1;
  const commissions = new Commissions(ctx);
  void commissions.load();
  commissions.onStamp = (town, region) => { toast(`almanac stamp: ${town}${region ? ` · ${shortRegion(region)}` : ''}`); ambience?.ui('chime'); };
  const photo = new PhotoMode(ctx, commissions);
  const atlas = new Atlas(ctx, commissions, () => journal.stamps());
  photo.onSaved = () => void atlas.refreshPages();
  atlas.extraPins = () => garden.positions().map((p) => ({ x: p.x, z: p.z, kind: 'plant' as const, label: SPECIES[p.sp].label }));
  const arrival = new Arrival(ctx, { name: townName, sub: meta?.sub ?? '' });
  const hints = new Hints();
  // the brush: paint anything you've painted from life, where you aim (docs/GAME_DESIGN.md)
  const brush = new Brush(ctx, commissions, vehicles, walk, worldRoot, origin, () => $('intro').classList.contains('hidden') && !atlas.open && !photo.active && !vehicles.driving);
  hints.add(() => brush.hint());
  let brushT = 0;
  explore.onBloom = (n) => { if (n > 3 && brushT <= 0) { brushT = 1.6; ambience?.ui('brush'); } };
  const VERB = { car: 'drive this', boat: 'take the helm of this', plane: 'fly this', balloon: 'step into this' } as const;
  // (on a phone the ride's own button, beside your thumb, says the verb: the hint just names it)
  hints.add(() => { const e = vehicles.enterable(); return e ? { key: thumbs() ? undefined : 'E', text: `${VERB[e.kind]} ${modelName(e.model)}`, pri: 10 } : null; });
  hints.add(() => {
    const P = interiors.activePlan;
    if (!P || interiors.indoors || vehicles.driving) return null;
    return Math.hypot(P.door.fx - walker.x, P.door.fz - walker.z) < 3.5 ? { text: 'walk through the door to go inside', pri: 5 } : null;
  });
  // a tall building's lifts (player/lift.ts): L in a lift lobby, a floor, a ride in the car, another storey
  const ride = new LiftRide(interiors, walk, walker);
  ride.onArrive = () => ambience?.ui('chime');
  const liftUI = new LiftUI(ride, () => $('intro').classList.contains('hidden') && !atlas.open && !photo.active && !vehicles.driving && !brush.active && !walkParams.fly);
  hints.add(() => {
    if (ride.busy) return null;
    const h = ride.here();
    return h ? { key: thumbs() ? 'Lift' : 'L', text: `call the lift — you're on ${h.storey ? `floor ${h.storey + 1}` : 'the ground floor'} of ${h.n}`, pri: 8 } : null;
  });
  hints.add(() => {
    for (const t of commissions.targets()) if (Math.hypot(t.x - walker.x, t.z - walker.z) < 60) return { key: thumbs() ? 'Paint' : 'P', text: `✧ ${t.title.replace(/^Paint /, 'paint ')}`, pri: 7 };
    return null;
  });
  // Viewpoints (tourism=viewpoint): the view named — the summit it looks at, how far and which way
  // (peaks.ts: OpenFreeMap's named peaks round you) — and P turns you to it before you paint it
  let peaks: Peak[] = [], peaksAt: [number, number] | null = null, peaksBusy = false, peaksRetry = 0;
  const viewHere = () => {
    if (vehicles.driving || walkParams.fly) return null;
    let best: { x: number; z: number; b: number; d: number } | null = null;
    for (const a of stream.loaded.values())
      for (let i = 0; a.vp && i + 2 < a.vp.length; i += 3) {
        const d = Math.hypot(a.vp[i] - walker.x, a.vp[i + 1] - walker.z);
        if (d < 25 && (!best || d < best.d)) best = { x: a.vp[i], z: a.vp[i + 1], b: a.vp[i + 2], d };
      }
    if (!best) return null;
    const [lat, lon] = toLatLon(json.origin, walker.x, walker.z);
    const [s] = sightsFrom(peaks, lat, lon, walker.y, best.b >= 0 ? best.b : null); // (walker.y: the eye)
    return { vp: best, sight: s ?? null };
  };
  hints.add(() => {
    const v = viewHere();
    if (!v) return null;
    const s = v.sight;
    return { key: thumbs() ? 'Paint' : 'P', text: s ? `the view: ${s.name}, ${Math.round(s.km)} km to the ${compassWord(s.bearing)} — paint it` : 'a viewpoint — paint the view', pri: 6 };
  });
  hints.add(() => {
    // (the peak list follows you: fetched here, again after 40 km)
    if (!peaksBusy && VIRTUAL && simTime > peaksRetry && (!peaksAt || Math.hypot(walker.x - peaksAt[0], walker.z - peaksAt[1]) > 40000)) {
      peaksBusy = true;
      const at: [number, number] = [walker.x, walker.z];
      const [lat, lon] = toLatLon(json.origin, walker.x, walker.z);
      // (no answer — offline, the CDN down — tries again in a minute, not after 40 km)
      void peaksAround(lat, lon).then((p) => { if (p) (peaks = p), (peaksAt = at); else peaksRetry = simTime + 60; }).finally(() => { peaksBusy = false; });
    }
    return null;
  });
  hints.add(() => (walkParams.fly && !vehicles.driving ? { key: thumbs() ? 'Land' : 'F', text: thumbs() ? 'hold Up and Down to climb and sink · push the stick far to go faster' : 'land · Space / C up and down · wheel for speed', pri: 3, once: 'fly' } : null));
  hints.add(() => (vehicles.balloon && !vehicles.balloon.landed ? { key: thumbs() ? 'Paint' : 'P', text: thumbs() ? 'the best seat for a painting, out to the horizon' : 'the best seat for a painting — everything in frame, out to the horizon', pri: 4, once: 'balloon' } : null));
  hints.add(() => (simTime > 12 ? { key: thumbs() ? 'Map' : 'M', text: 'your map, sketchbook & commissions', pri: 1, once: 'atlas' } : null));
  hints.add(() => (simTime > 70 && !vehicles.driving && !walkParams.fly && world.terrain.coverAt(walker.x, walker.z) === 30 ? { key: thumbs() ? 'More' : 'R', text: `plant a ${SPECIES[garden.nextSpecies].label} here${thumbs() ? '' : ' (Shift+R: another seed)'}`, pri: 1, once: 'plant' } : null));
  hints.add(() => (simTime > 45 ? { key: thumbs() ? 'Paint' : 'P', text: 'frame a view and paint it into your sketchbook', pri: 1, once: 'photo' } : null));
  hints.add(() => (simTime > 100 ? { key: thumbs() ? 'Go' : 'G', text: 'go anywhere — search a town or an address', pri: 1, once: 'go' } : null));

  const post = new WatercolorPost(renderer);
  const shadows = new SunShadows(renderer);
  diagStage('compile');
  // Compile every shader now (incl. the interior + NPC materials) so the first front door doesn't hitch.
  const firstPlan = plans.keys().next().value;
  if (firstPlan !== undefined) interiors.prime(firstPlan);
  renderer.compile(scene, camera);
  if (firstPlan !== undefined) interiors.prime(null);
  const resize = () => {
    // a phone's canvas at up to 1.5× its CSS pixels when the paint is hi-DPI (at 1× a DPR-3 screen
    // stretched every painted pixel ~3× — the blur); a PC's stays at 1× (its paint supersamples)
    renderer.setPixelRatio(tier.tier !== 'desktop' && postParams.hiDpi ? Math.min(1.5, Math.max(1, devicePixelRatio || 1)) * postParams.renderScale : 1);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    // (the frame fitted to the new shape at once: taller upright, no wider than 95° on its side)
    setLens(camera, vehicles.driving ? walkParams.fov : walkParams.fov - walker.zoom);
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  // A phone turned on its side (or back): some browsers give the new size only a moment after the
  // turn's events, so the frame is fitted again once it has settled.
  const turned = () => {
    resize();
    const w = innerWidth, h = innerHeight;
    setTimeout(() => { if (innerWidth !== w || innerHeight !== h) resize(); }, 350);
  };
  if (screen.orientation?.addEventListener) screen.orientation.addEventListener('change', turned);
  else addEventListener('orientationchange', turned); // (older iPhones)
  resize();

  // World clock: real time in the region's timezone, or a free-running clock set from the panel.
  // The date: today, or a chosen day of the year (panel, or ?day=N / ?date=YYYY-MM-DD) — the sun's
  // path and the season (snow, bare trees, autumn colour) follow it.
  {
    const dq = params.get('date'), nq = params.get('day');
    if (dq && /^\d{4}-\d{2}-\d{2}$/.test(dq)) timeParams.dayOfYear = dayOfYear(Date.parse(dq + 'T12:00:00Z'));
    else if (nq !== null && isFinite(+nq)) timeParams.dayOfYear = Math.max(0, Math.min(366, Math.round(+nq)));
  }
  const dayShift = () => {
    const d = timeParams.dayOfYear;
    if (!(d > 0)) return 0;
    return Math.round((Date.UTC(new Date().getUTCFullYear(), 0, d, 12) - Date.now()) / 86400000) * 86400000;
  };
  const today = () => Date.now() + dayShift();
  let worldMs = today();
  const setHour = (h: number) => {
    timeParams.realTime = false;
    timeParams.hour = h;
    worldMs = localToMs(today(), h, tz);
  };
  if (!timeParams.realTime) worldMs = localToMs(today(), timeParams.hour, tz);
  // Every walk begins at sunrise (today's real sunrise at this place, a few minutes after the
  // disc clears the horizon); the clock then runs on. ?hour=H overrides; capture shots set their own.
  if (!CAPTURE || params.get('hour') !== null) {
    const hq = params.get('hour');
    if (hq !== null && isFinite(+hq)) setHour(+hq);
    else {
      let rise = 6.5;
      for (let h = 2; h < 11; h += 0.05)
        if (sunPosition(localToMs(today(), h, tz), json.origin.lat, json.origin.lon).alt > 0) { rise = h; break; }
      setHour(rise + 0.2);
    }
  }

  const gui = CAPTURE && !params.has('panel') ? null : buildPanel({
    onResize: resize,
    onPreset: setHour,
    onRespawn: respawn,
    onResetExplore: () => { void journal.reset(); void explore.reset(); },
    onSummon: (kind) => {
      if (debugParams.summons) vehicles.summon(kind);
      else toast('turn on free rides in Debug first');
    },
  }, { name: townName, tz, respawn: spec?.on });

  const weather: Weather = { cloud: weatherParams.cloud, seaFog: weatherParams.seaFog, haze: weatherParams.haze, wind: weatherParams.wind };
  let simTime = 0;
  let seasonT = 0;
  let groundT = 0;

  // ---- shots (capture / debug API) ----
  const shots: Record<string, () => void> = {};
  const shot = (name: string, where: { x: number; z: number; yaw: number }, hour: number, extra: Partial<typeof weatherParams> = {}, pitch = -0.02, yawOff = 0) => {
    shots[name] = () => {
      walker.place(where.x, where.z, where.yaw + yawOff, pitch);
      setHour(hour);
      timeParams.speed = 0;
      Object.assign(weatherParams, { autoWeather: false, cloud: 0.3, seaFog: 0, haze: 0.35, wind: 0.5 }, extra);
    };
  };
  const mainRe = meta?.roads?.main ? new RegExp(`^${meta.roads.main}$`) : null;
  const oceanN = mainRe ? sidewalk(roadPoint(json.roads, mainRe, 110, 60, 'north'), 8) : spawn;
  const oceanS = mainRe ? sidewalk(roadPoint(json.roads, mainRe, 110, -120, 'south'), -8) : spawn;
  shot('ocean-golden', spawn, 18.3);
  shot('ocean-noon', oceanN, 12.8);
  shot('ocean-morning', oceanS, 8.2);
  shot('ocean-dusk', spawn, 19.15);
  shot('ocean-night', oceanN, 22.0, { cloud: 0.2 });
  shot('ocean-fog', oceanN, 10.5, { seaFog: 0.7, cloud: 0.8 });
  shot('ocean-sideways', oceanN, 16.5, {}, -0.05, Math.PI / 2);
  const bridgeRe = meta?.roads?.bridge ? new RegExp(`^${meta.roads.bridge}$`) : null;
  const bridge = bridgeRe ? roadPoint(json.roads, bridgeRe, -150, 0, 'west') : spawn;
  shot('bridge-golden', bridge, 18.2, {}, -0.03);
  shot('bridge-back', bridge, 17.5, {}, 0.02, Math.PI);
  shot('beach-morning', { x: spawn.x + 160, z: spawn.z - 60, yaw: Math.PI * 0.02 }, 7.4, {}, -0.06);
  shot('aerial', { x: 200, z: 600, yaw: 0 }, 17.0, {}, -0.35);
  (window as unknown as Record<string, unknown>).__SHOTS__ = shots;
  (window as unknown as Record<string, unknown>).__APPLY_SHOT__ = (n: string) => {
    if (n === 'aerial') { walkParams.fly = true; shots[n](); walker.y = 120; return n; }
    if (n === 'inside' || n === 'inside-night' || n === 'doorway') {
      // the enterable house nearest the spawn (prefer a multi-storey home)
      let best: Plan | null = null, bd = Infinity;
      for (const P of plans.values()) {
        const homey = stream.fpByKey.get(P.fp)?.kind === 'house' && P.L * P.W < 170;
        const d = Math.hypot(P.door.x - spawn.x, P.door.z - spawn.z) - (P.levels > 1 ? 40 : 0) - (homey ? 60 : 0);
        if (d < bd) (bd = d), (best = P);
      }
      shots[n === 'inside-night' ? 'ocean-night' : 'ocean-noon']();
      const d = best!.door;
      if (n === 'doorway') walker.place(d.fx + d.nx * 5, d.fz + d.nz * 5, Math.atan2(d.nx, d.nz), -0.05);
      else walker.place(d.wx - d.nx * 2.2, d.wz - d.nz * 2.2, Math.atan2(d.nx, d.nz), -0.08, d.y);
      for (let k = 0; k < 8; k++) interiors.update(walker.x, walker.z, 0.25, walker.feet);
      interiors.flush();
      return n;
    }
    if (n === 'stairs' || n === 'upstairs' || n === 'stairs-night') {
      // the nearest house with a staircase: at the foot looking up it, or on the landing above
      let best: Plan | null = null, bd = Infinity;
      for (const P of plans.values()) {
        if (!P.flights.length) continue;
        const dd = Math.hypot(P.door.x - spawn.x, P.door.z - spawn.z) - (stream.fpByKey.get(P.fp)?.kind === 'house' && P.L * P.W < 170 ? 60 : 0);
        if (dd < bd) (bd = dd), (best = P);
      }
      shots[n === 'stairs-night' ? 'ocean-night' : 'ocean-noon']();
      if (!best) return n;
      const F = best.flights[0], P = best;
      const dir = Math.sign(F.topU - F.bottomU), vc = (F.v0 + F.v1) / 2;
      const W = (u: number, v: number): [number, number] => [P.cx + P.ux * u + P.vx * v, P.cz + P.uz * u + P.vz * v];
      const yawTo = (a: [number, number], b: [number, number]) => Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
      if (n === 'upstairs') {
        const at = W(F.topU + dir * 1.6, vc + (F.v0 > 0 ? -1.2 : 1.2)), look = W(F.bottomU, vc);
        walker.place(at[0], at[1], yawTo(at, look), -0.35, P.floor0 + P.floorH);
      } else {
        const look = W((F.topU + F.bottomU) / 2, vc);
        let at = W(F.bottomU - dir * 1.2, vc);
        search: for (const d of [3.4, 2.8, 2.2, 1.6]) for (const s of [1.6, 1.0, 0.4]) {
          const c = W(F.bottomU - dir * d, vc + (F.v0 > 0 ? -s : s));
          const [mx, mz] = walk.move(c[0], c[1], 0, 0, 0.35, P.floor0);
          if (walk.interiorAt(c[0], c[1], P.floor0) >= 0 && mx === c[0] && mz === c[1]) { at = c; break search; }
        }
        walker.place(at[0], at[1], yawTo(at, look), 0.12, P.floor0);
      }
      for (let k = 0; k < 8; k++) interiors.update(walker.x, walker.z, 0.25, walker.feet);
      interiors.flush();
      return n;
    }
    if (n === 'raised' || n === 'houses' || n === 'porch' || n === 'shop') {
      // a raised shore house / a house with a porch / a cross-gabled house / a named shop, from its street
      let best: Door | null = null, bd = Infinity;
      for (const f of bld.footprints) {
        if (f.door === undefined || (n === 'shop' ? f.kind !== 'commercial' || !f.name : f.kind !== 'house')) continue;
        const d = bld.doorOf(f);
        if (!d) continue;
        if (n === 'raised' && f.raise < 0.5) continue;
        if (n === 'houses' && (f.ring.length < 6 || !f.pitched)) continue;
        if (n === 'porch' && !d.porch) continue;
        const dd = Math.hypot(d.x - spawn.x, d.z - spawn.z);
        if (dd < bd) (bd = dd), (best = d);
      }
      shots['ocean-noon']();
      if (!best) return n;
      const d = best;
      // stand back from the door, somewhere open (not inside the neighbour's house)
      let x = d.wx + d.nx * 12, z = d.wz + d.nz * 12;
      for (const [back, side] of n === 'houses' ? [[17, 7], [15, -7], [13, 5], [11, 0]] : [[13, 3], [11, 0], [9, -2], [7, 0]]) {
        const cx = d.wx + d.nx * back - d.nz * side, cz = d.wz + d.nz * back + d.nx * side;
        if (walk.buildingAt(cx, cz) < 0 && !walk.blocked(cx, cz, 0.5)) { x = cx; z = cz; break; }
      }
      walker.place(x, z, Math.atan2(x - d.wx, z - d.wz), n === 'raised' ? 0.1 : 0.04);
      return n;
    }
    if (n === 'sign') {
      // the street-name sign nearest the start, from the crosswalk
      type Pole = { x: number; z: number; cx: number; cz: number };
      let best = stream.poles[0] as Pole | undefined, bd = Infinity;
      for (const p of stream.poles as Pole[]) { const dd = Math.hypot(p.x - spawn.x, p.z - spawn.z); if (dd < bd) (bd = dd), (best = p); }
      shots['ocean-noon']();
      if (!best) return n;
      const dx = best.x - best.cx, dz = best.z - best.cz, l = Math.hypot(dx, dz) || 1;
      const x = best.x - (dx / l) * 3.2 - (dz / l) * 1.2, z = best.z - (dz / l) * 3.2 + (dx / l) * 1.2;
      walker.place(x, z, Math.atan2(x - best.x, z - best.z), 0.38);
      return n;
    }
    if (n === 'roofs') {
      walkParams.fly = true;
      shots['ocean-golden']();
      walker.place(spawn.x - 120 * Math.sin(spawn.yaw + 0.6), spawn.z - 120 * Math.cos(spawn.yaw + 0.6), spawn.yaw + Math.PI + 0.6, -0.42);
      walker.y = 55;
      return n;
    }
    if (n === 'journal') {
      // stroll the length of downtown so the map has something painted, then open it
      shots['ocean-golden']();
      for (let s = 0; s < 60; s++) journal.update(spawn.x - Math.sin(spawn.yaw) * s * 8, spawn.z - Math.cos(spawn.yaw) * s * 8, 0);
      atlas.toggle(true, 'map');
      return n;
    }
    if (n.startsWith('top')) {
      // top:x:z:alt  — straight-down debug view
      const [, x = '0', z = '0', alt = '1400'] = n.split(':');
      walkParams.fly = true;
      shots['ocean-noon']();
      walker.place(+x, +z, 0, -1.5707);
      walker.y = +alt;
      return n;
    }
    shots[n]?.();
    return n;
  };
  (window as unknown as Record<string, unknown>).__GAME__ = { ambientBalloons, horizon, walker, walk, world, U, post, postParams, timeParams, weatherParams, debugParams, walkParams, camera, renderer, scene, THREE, interiors, lift: ride, planInterior, registerPlan, plans, bld, life, stream, vehicles, farSkyline, grass, explore, commissions, photo, atlas, arrival, hints, critters, garden, ctx, paint, brush, setHour, teleport: teleportTo, streamParams, micro, nearTrees: treeLayer, crowd, kerbCars, wakes, get spawn() { return spawn; }, at: atPos };

  // ---- HUD ----
  const named = json.roads.filter((r) => r.n && !r.lod);
  let hudTimer = 0;
  const updateHud = () => {
    let best = '', bd = 1e9;
    const scan = (r: Road) => {
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const d = segDist(walker.x, walker.z, r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10);
        if (d < bd) (bd = d), (best = r.n!);
      }
    };
    for (const r of named) scan(r);
    for (const r of stream.primRoads) if (r.n && !r.lod) scan(r); // real streets carried by w-*/s-* tiles
    $('place').textContent = bd < 40 ? best : world.terrain.oceanDistAt(walker.x, walker.z) < 60 ? shoreLabel : arrival.locality || townName;
    if (walkParams.fly) $('place').textContent = `flying over ${$('place').textContent} · ${Math.round(walker.y)} m`;
    else if (interiors.indoors && interiors.activePlan) {
      const fp = stream.fpByKey.get(interiors.activeIndex!);
      const P = interiors.activePlan;
      const storey = Math.max(0, Math.round((walker.feet - P.floor0) / P.floorH));
      // (an office tower is no shop: its plan says what it is)
      const kindName = P.arch === 'office' && fp?.kind === 'commercial' ? (P.tall && P.levels >= 8 ? 'an office tower' : 'an office building') : ({ house: 'a house', commercial: 'a shop', church: 'the church', large: P.tall && P.levels >= 8 ? 'an apartment tower' : 'an apartment building' } as Record<string, string>)[fp?.kind ?? ''] ?? 'a building';
      const what = fp?.name ?? fp?.addr ?? (P.door.street ? `${kindName} on ${P.door.street}` : kindName);
      // (a tall building's: which of how many — the lift's chooser counts them the same way)
      const floorName = P.tall ? (storey === 0 ? `ground floor of ${P.levels}` : `floor ${storey + 1} of ${P.levels}`) : storey === 0 ? 'ground floor' : storey === P.levels - 1 ? (P.levels > 2 ? 'top floor' : 'upstairs') : `floor ${storey + 1}`;
      const room = interiors.onStairs ? null : interiors.roomName(walker.x, walker.z, walker.feet);
      $('place').textContent = `inside ${what}${P.levels > 1 ? ` · ${interiors.onStairs ? 'on the stairs' : floorName}` : ''}${room ? ` · ${room}` : ''}`;
    } else if (interiors.activePlan) {
      // at someone's front steps: the real address or the shop's name
      const P = interiors.activePlan, fp = stream.fpByKey.get(interiors.activeIndex!);
      if (Math.hypot(P.door.fx - walker.x, P.door.fz - walker.z) < 3.5 || Math.hypot(P.door.x - walker.x, P.door.z - walker.z) < 3) {
        const label = fp?.name ?? fp?.addr;
        if (label) $('place').textContent = label;
      }
    }
    const h = localHour(worldMs, tz);
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    $('clock').textContent = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
  };

  // ---- intro ----
  $('loading').textContent = crashed ? 'the last visit here was cut short (out of memory?) — painting lighter this time' : '';
  diagStage('ready');
  const startBtn = $('start') as HTMLButtonElement;
  startBtn.disabled = false;
  // (ctx.lock: no pointer lock without a mouse or trackpad to capture)
  startBtn.onclick = () => { $('intro').classList.add('hidden'); document.body.classList.add('walking'); began(); ctx.lock(); startAudio(); arrival.greet(); };
  canvas.addEventListener('click', () => { if ($('intro').classList.contains('hidden')) { ctx.lock(); startAudio(); } });
  initCredits([$('credits-link'), $('credits-hud'), $('credits-journal')]);
  // P (▣ on a phone): the brush goes away, and at a viewpoint you face its view first — the summit
  // it names, else the way the map says it looks
  const togglePhoto = () => {
    brush.toggle(false);
    const v = !photo.active ? viewHere() : null;
    const b = v?.sight?.bearing ?? (v && v.vp.b >= 0 ? v.vp.b : null);
    if (b !== null && b !== undefined) walker.place(walker.x, walker.z, (-b * Math.PI) / 180, v?.sight ? Math.min(0.12, v.sight.angle + 0.01) : 0.02, walker.y - walkParams.eyeHeight);
    photo.toggle();
  };
  // ✈ on a phone. A phone builds tiles slower than you can fly, and past the ring the buildings
  // below are silhouettes with no walls yet: a landing came down inside a house (the search for
  // open ground found nothing there to avoid) and walked straight out through its wall. So a phone
  // hovers until the street under it is built, then comes down on open ground (groundCheck); a
  // second ✈ meanwhile calls it off. (A PC builds a tile in a moment: F lands at once, as ever.)
  let landing = false, groundWait = 0;
  const toggleFly = () => {
    if (!walkParams.fly) { landing = false; walker.setFly(true); return; }
    if (!MOBILE || stream.solidAt(walker.x, walker.z)) { landing = false; walker.setFly(false); return; }
    landing = !landing;
    toast(landing ? 'coming down as the street paints in' : 'still flying');
  };
  // …and on foot the same: past a built tile (off a fast ride, a slow build) you wait a moment where
  // you stand rather than walk through houses whose walls aren't there yet
  const groundCheck = (dt: number) => {
    if (landing && (!walkParams.fly || stream.solidAt(walker.x, walker.z))) { landing = false; if (walkParams.fly) walker.setFly(false); }
    const bare = !walkParams.fly && !vehicles.driving && !stream.solidAt(walker.x, walker.z);
    if (bare && groundWait < 1 && groundWait + dt >= 1) toast('the street is still painting in — a moment');
    groundWait = bare ? groundWait + dt : 0;
    walker.waitGround = bare && groundWait < 15; // (a tile that never comes: walk on after 15 s)
  };
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.closest?.('.lil-gui')) return;
    if (e.code === 'KeyT') setHour((localHour(worldMs, tz) + 1) % 24);
    if ((e.target as HTMLElement)?.closest?.('input,textarea')) return;
    const playing = $('intro').classList.contains('hidden');
    if (e.code === 'KeyP' && playing && !atlas.open && (!vehicles.driving || vehicles.activeKind === 'balloon')) togglePhoto(); // (a balloon's basket is the best seat for a painting)
    if (e.code === 'KeyM' && playing) { if (photo.active) photo.toggle(false); atlas.toggle(); }
    if (e.code === 'KeyG' && playing && !atlas.open) { if (photo.active) photo.toggle(false); atlas.focusSearch(); }
    if (e.code === 'KeyR' && playing && !atlas.open && !photo.active && !vehicles.driving && !brush.active && !e.repeat) { if (e.shiftKey) garden.cycle(); else garden.plant(); }
    if (e.code === 'Escape' && atlas.open) atlas.toggle(false);
  });
  // Touch actions mirror the keyboard verbs. The walking stick (left) and the look drag (right) stay
  // the Walker's; these are the rest: the dock, its ⋯ drawer, the ride's own button beside your
  // thumb, and what you hold down while riding or flying.
  const playing = () => $('intro').classList.contains('hidden');
  const touchMore = $('touch-more'), moreButton = $('tmore');
  const setMore = (open: boolean) => {
    if (open === !touchMore.classList.contains('hidden')) return;
    touchMore.classList.toggle('hidden', !open);
    moreButton.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('more-open', open);
  };
  moreButton.onclick = () => setMore(touchMore.classList.contains('hidden'));
  $('tfly').onclick = () => { setMore(false); toggleFly(); };
  $('tgo').onclick = () => { if (playing() && !atlas.open) { setMore(false); atlas.focusSearch(true); } };
  $('tphoto').onclick = () => { if (playing() && !atlas.open && (!vehicles.driving || vehicles.activeKind === 'balloon')) { setMore(false); togglePhoto(); } };
  $('tview').onclick = () => vehicles.toggleView();
  $('tmenu').onclick = () => { setMore(false); atlas.toggle(); };
  $('tplant').addEventListener('click', () => {
    if (playing() && !atlas.open && !photo.active && !vehicles.driving && !brush.active) garden.plant();
  });
  $('tseed').addEventListener('click', () => {
    if (playing() && !vehicles.driving && !brush.active) garden.cycle();
  });
  $('ttime').addEventListener('click', () => setHour((localHour(worldMs, tz) + 1) % 24));
  $('toptions').addEventListener('click', () => setMore(false)); // (the panel opens itself: ui/panel.ts)

  // Held buttons (boost, the plane's throttle, climb and sink): each lets go when the finger lifts
  // or is cancelled, the window loses focus, the button goes away (syncTouchControls) — or the page
  // goes to sleep with a finger still on it (below).
  const holds: (() => void)[] = [];
  const bindHold = (id: string, down: () => void, up: () => void) => {
    const button = $(id) as HTMLButtonElement;
    let held = false;
    const stop = () => { if (!held) return; held = false; button.classList.remove('held'); up(); };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (held) return;
      held = true;
      button.classList.add('held');
      try { button.setPointerCapture(e.pointerId); } catch { /* browser does not support capture */ }
      down();
    });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    window.addEventListener('blur', stop);
    holds.push(stop);
    return stop;
  };
  // (two held at once — ▲ and ▼, + and − — cancel out, and lifting one leaves the other's)
  const pair = (set: (v: number) => void) => { let up = false, down = false; const put = () => set((up ? 1 : 0) - (down ? 1 : 0)); return { up: (on: boolean) => { up = on; put(); }, down: (on: boolean) => { down = on; put(); } }; };
  const climb = pair((v) => (walker.climb = v)), throttle = pair((v) => vehicles.setTouchThrottle(v));
  const releaseFly = [bindHold('tfly-up', () => climb.up(true), () => climb.up(false)), bindHold('tfly-down', () => climb.down(true), () => climb.down(false))];
  const releaseBoost = bindHold('trboost', () => vehicles.setTouchBoost(true), () => vehicles.setTouchBoost(false));
  const releaseThrottle = [bindHold('tthrottle-up', () => throttle.up(true), () => throttle.up(false)), bindHold('tthrottle-down', () => throttle.down(true), () => throttle.down(false))];
  const releaseHolds = () => { walker.releaseTouches(); for (const stop of holds) stop(); };

  // The ride's own button beside your thumb: what E does here, by name. A double-tap on the view
  // does it too — getting out only once the ride has stopped (two taps by the boost button at speed
  // are a missed button, not a wish to step out onto the road).
  // A tap you can feel (Android; an iPhone has no web vibration): a short tick on every button.
  const tick = (e: Event) => { if ((e.target as HTMLElement)?.closest?.('.tbtn, #touch-action, .tmenu-btn')) try { navigator.vibrate?.(8); } catch { /* not allowed here */ } };
  for (const id of ['touchui', 'ride-touch', 'touch-action', 'touch-more']) $(id).addEventListener('pointerdown', tick, { passive: true });
  const touchAction = $('touch-action') as HTMLButtonElement;
  const BOARD = { car: 'Drive', boat: 'Board', plane: 'Board', balloon: 'Step in' } as const;
  const touchActionState = () => {
    if (!playing() || atlas.open || photo.active || brush.active) return null; // (the options panel leaves it in reach: style.css)
    const r = vehicles.ride;
    if (r) return { id: `exit:${r.kind}`, label: (r.kind === 'plane' || r.kind === 'balloon') && r.airborne ? 'Jump out' : 'Get out', aria: `get out of the ${modelName(r.model)}`, still: Math.abs(r.v) < 1 && !r.airborne };
    const e = vehicles.enterable();
    return e ? { id: `enter:${e.kind}:${e.model}`, label: BOARD[e.kind], aria: `${BOARD[e.kind].toLowerCase()} the ${modelName(e.model)}`, still: true } : null;
  };
  touchAction.addEventListener('click', () => { if (touchActionState()) vehicles.interact(); });
  let touchActionCheck = 0;
  const syncTouchControls = (dt: number) => {
    if (!document.body.classList.contains('touch')) return;
    touchActionCheck -= dt;
    if (touchActionCheck > 0) return;
    touchActionCheck = 0.2;
    const action = touchActionState();
    touchAction.classList.toggle('hidden', !action);
    if (action && touchAction.textContent !== action.label) touchAction.textContent = action.label;
    if (action) touchAction.setAttribute('aria-label', action.aria);
    // (a map, a photo, the brush or the panel over the world: the drawer has closed behind it)
    if (atlas.open || photo.active || brush.active || (gui && !gui._hidden)) setMore(false);
    const kind = vehicles.activeKind, flying = walkParams.fly && !kind, climbs = flying || kind === 'balloon'; // (▲ ▼: climb and sink; a balloon's burner and vent)
    document.body.classList.toggle('driving', !!kind);
    // (which of the ride's buttons stand beside the dock: a phone held upright ends the hint short of them)
    const beside = kind ?? (flying ? 'fly' : action ? 'near' : '');
    if (document.body.dataset.ride !== beside) document.body.dataset.ride = beside;
    $('ride-touch').classList.toggle('hidden', !kind && !flying);
    $('ride-touch').classList.toggle('fly', climbs);
    $('tview').classList.toggle('hidden', kind !== 'balloon');
    $('trboost').classList.toggle('hidden', kind !== 'car' && kind !== 'boat');
    for (const id of ['tthrottle-up', 'tthrottle-down']) $(id).classList.toggle('hidden', kind !== 'plane');
    for (const id of ['tfly-up', 'tfly-down']) $(id).classList.toggle('hidden', !climbs);
    // (each button's word says what it does now: Fly or Land; a balloon's burner and vent)
    const say = (id: string, word: string) => { const el = $(id); if (el.dataset.label !== word) el.dataset.label = word; };
    say('tfly', flying ? 'Land' : 'Fly');
    say('tfly-up', kind === 'balloon' ? 'Burn' : 'Up');
    say('tfly-down', kind === 'balloon' ? 'Vent' : 'Down');
    // (a button that has gone lets go of whatever it held)
    if (!climbs) for (const stop of releaseFly) stop();
    if (kind !== 'car' && kind !== 'boat') releaseBoost();
    if (kind !== 'plane') for (const stop of releaseThrottle) stop();
    $('toptions').setAttribute('aria-expanded', String(!!gui && !gui._hidden));
  };

  // A double-tap is only an interaction when two still taps happen in the look zone and the same
  // contextual action is available both times. It never steals a stick drag or overlay gesture.
  // (Any touch on the world closes the ⋯ drawer, the way a tap outside closes a menu.)
  const touchStarts = new Map<number, { x: number; y: number; t: number; moved: number; action: string }>();
  let lastTap: { x: number; y: number; t: number; action: string } | null = null;
  canvas.addEventListener('touchstart', (e) => {
    if (!document.body.classList.contains('touch')) return;
    setMore(false);
    if (e.touches.length > 1 || atlas.open || photo.active || brush.active) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < innerWidth * 0.45) continue;
      const action = touchActionState();
      if (action?.still) touchStarts.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0, action: action.id });
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touchStarts.get(t.identifier);
      if (s) { s.moved += Math.hypot(t.clientX - s.x, t.clientY - s.y); s.x = t.clientX; s.y = t.clientY; }
    }
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touchStarts.get(t.identifier);
      touchStarts.delete(t.identifier);
      if (!s || s.moved > 12 || performance.now() - s.t > 260) continue;
      const now = performance.now(), action = touchActionState();
      if (action?.still && action.id === s.action && lastTap?.action === s.action && now - lastTap.t <= 340 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) <= 30) {
        lastTap = null;
        vehicles.interact();
      } else lastTap = { x: t.clientX, y: t.clientY, t: now, action: s.action };
    }
  }, { passive: true });
  canvas.addEventListener('touchcancel', (e) => { for (const t of Array.from(e.changedTouches)) touchStarts.delete(t.identifier); lastTap = null; });
  if (CAPTURE) {
    $('intro').classList.add('hidden');
    document.body.classList.add('postcard', 'walking');
    const s = params.get('shot');
    if (s && shots[s]) (window as unknown as { __APPLY_SHOT__: (n: string) => void }).__APPLY_SHOT__(s);
  }

  // Sound context from the data: churches within earshot, how many houses are around.
  // (Rebuilt as tiles stream in/out.)
  let churches = stream.churches;
  let houseGrid = stream.houseGrid();
  let cityGrid = stream.cityGrid();
  let shopGrid = stream.shopGrid();
  let pavedIdx = stream.pavedIndex();
  // Wildlife habitat: a parking lot, a plaza or a street is no place for a rabbit, and a town's
  // main street (shops round you) keeps only its park squirrels and birds
  const pavedAt = (x: number, z: number) => {
    for (const it of pavedIdx.get(Math.floor(x / 40) * 92821 + Math.floor(z / 40)) ?? []) {
      if ('ring' in it) {
        const r = it.ring;
        let c = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
        if (c) return true;
      } else {
        const [ax, az, bx, bz, hw] = it.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < hw) return true;
      }
    }
    return false;
  };
  const townAt = (x: number, z: number) => {
    const i = Math.floor(x / 80), j = Math.floor(z / 80);
    let n = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) n += shopGrid.get((i + di) * 92821 + (j + dj)) ?? 0;
    return Math.max(cityAt(x, z), Math.min(1, Math.max(0, (n - 3) / 12)));
  };
  // built volume per ground area over the 3×3 cells around you → 0..1 (a shore main street ~0,
  // a Hell's Kitchen block ~0.4, Midtown 1): the city soundscape's volume
  const cityAt = (x: number, z: number) => {
    const i = Math.floor(x / 80), j = Math.floor(z / 80);
    let v = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) v += cityGrid.get((i + di) * 92821 + (j + dj)) ?? 0;
    return Math.max(0, Math.min(1, (v / (9 * 6400) - 4) / 20));
  };
  const isSummer = () => (json.origin.lat < 0 ? [11, 12, 1, 2, 3] : [5, 6, 7, 8, 9]).includes(worldMonth());
  let lastTileChange = 0;
  stream.onChange = () => {
    lifeDirty = true;
    lastTileChange = performance.now();
    churches = stream.churches;
    houseGrid = stream.houseGrid();
    cityGrid = stream.cityGrid();
    shopGrid = stream.shopGrid();
    pavedIdx = stream.pavedIndex();
  };

  // ---- loop ----
  let last = performance.now();
  let lastStep = 0;
  let journalTimer = 0;
  let frames = 0;
  let roadPadT = 0, roadPadD = 1e9; // metres to the nearest mapped street edge (footstep surface)
  let soundScanT = 0, harbourD = 1e9, sailsN = 0, treeCover = 0;
  let paintT = 0, paintSince: number | null = null, paintShown = 0; // "the real streets are painting in" toast
  const PAINT_MSG = 'the real streets are painting in';
  const errors = new Map<string, number>();
  const perf = { detail: 0, interior: 0 }; // worst-case ms, for tools/soak.mjs
  (window as unknown as Record<string, unknown>).__PERF__ = perf;
  const focus = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let nearT = 0;
  // Render origin (world coords), re-snapped when the walker strays >1.5 km from it — `origin` above.
  const reanchor = () => {
    const nx = Math.round(walker.x / 512) * 512, nz = Math.round(walker.z / 512) * 512;
    if (Math.abs(nx - origin.x) < 1536 && Math.abs(nz - origin.z) < 1536) return;
    origin.x = nx;
    origin.z = nz;
    worldRoot.position.set(-nx, 0, -nz);
    U.uWorldOffset.value.set(nx, 0, nz);
  };
  // Schedule the next frame first: one bad frame must never stop the world. Each chain has an
  // id: a harness restarting the loop on timers (__KICK__, for hidden panes where rAF never
  // fires) retires the old chain instead of running two.
  let chain = 0;
  const loop = (id: number) => (now: number) => {
    if (id !== chain) return;
    requestAnimationFrame(loop(id));
    try {
      frame(now);
    } catch (e) {
      const k = String((e as Error)?.message ?? e);
      const n = (errors.get(k) ?? 0) + 1;
      errors.set(k, n);
      if (n === 1 || n % 600 === 0) console.error(`frame error (x${n})`, e);
      frameFailed(e); // (a phone user sees only a frozen or blank page — ui/diag.ts says why)
    }
  };
  // Auto quality: the crisper defaults (paint detail, full screen resolution) step down a few
  // seconds into the walk on a GPU that can't hold ~40 fps; still slow after that, the render
  // scale and the shadow map follow (quality.ts autoSteps) — never a knob the player set in the
  // panel. Each round's steps are measured by the next and undone if they didn't make the frames
  // quicker (quality.ts stepsPaid): a device held back by something else keeps its sharp frame.
  // The boot tier (quality.ts pickTier) already chose lighter defaults for phones.
  let qT = 0, qN = 0, qSum = 0, qRound = 0, qDone = CAPTURE, qWait = 0, qBefore = 0;
  let qUndo: [Record<string, unknown>, string, unknown][] = [];
  const autoQuality = (rawDt: number) => {
    if (qDone || interiors.indoors) return;
    qT += rawDt;
    // let the first tiles settle: the frames while the ring streams in are the slowest a device
    // will have, and measured then, a phone that holds 60 fps afterwards was marked slow for good
    qWait += rawDt;
    if (stream.busy && qWait < 40) { (qT = 0), (qN = 0), (qSum = 0); return; } // (at most 40 s: a city streams on)
    if (qT < 4) return;
    qSum += rawDt;
    qN++;
    if (qT < 10) return;
    const ms = (qSum / qN) * 1000;
    (qT = 0), (qN = 0), (qSum = 0);
    if (qUndo.length && !stepsPaid(qBefore, ms)) {
      // the last round's steps bought nothing: back to the sharper frame, and no more stepping
      for (const [bag, k, v] of qUndo) bag[k] = v;
      resize();
      console.info(`auto quality: ${ms.toFixed(1)} ms/frame, no quicker than ${qBefore.toFixed(1)} — kept the sharp frame`);
      qDone = true;
      return;
    }
    const steps = autoSteps(ms, qRound, postParams, shadowParams, userKeys, devicePixelRatio);
    const bagOf = (b: string) => (b === 'post' ? postParams : shadowParams) as Record<string, unknown>;
    qUndo = steps.map(([b, k]) => [bagOf(b), k, bagOf(b)[k]]);
    qBefore = ms;
    for (const [b, k, v] of steps) bagOf(b)[k] = v;
    if (steps.length) { resize(); console.info(`auto quality: ${ms.toFixed(1)} ms/frame — ${steps.map(([b, k, v]) => `${b}.${k}=${v}`).join(', ')}`); }
    qRound++;
    // (each round's steps are measured by the next: two rounds of steps, a third to judge the last)
    qDone = (!steps.length && !qUndo.length) || qRound >= 3;
  };
  const frame = (now: number) => {
    const rawDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    const dt = CAPTURE ? 1 / 60 : Math.min(0.1, rawDt);
    last = now;
    autoQuality(rawDt);
    simTime += dt;
    if (timeParams.realTime) worldMs = today();
    else worldMs += dt * 1000 * timeParams.speed;
    timeParams.hour = localHour(worldMs, tz);
    // the season, from the date and where you stand (season.ts); re-read every second or so
    seasonT -= dt;
    if (seasonT <= 0) {
      seasonT = CAPTURE ? 0 : 1;
      const [lat, lon] = toLatLon(json.origin, walker.x, walker.z);
      const s = seasonAt(lat, lon, world.terrain.heightAt(walker.x, walker.z), dayOfYear(worldMs));
      U.uSnow.value = weatherParams.snow >= 0 ? weatherParams.snow : s.snow;
      U.uLeafFall.value = s.leafFall;
      U.uAutumn.value = s.autumn;
      U.uTurn.value = s.turn;
      U.uBloom.value = s.bloom;
      horizon.setSnowline(s.snowline);
    }

    if (weatherParams.autoWeather) {
      const t = worldMs / 3.6e6; // hours
      weatherParams.cloud = 0.3 + 0.3 * Math.sin(t * 0.37 + 1.3) * Math.sin(t * 0.11);
      // sea fog as the coast has it: a marine layer some mornings, by the water — burned off by
      // late morning, never inland (it rolled over every town a third of the time, a white sheet
      // under the towers on a clear day)
      const morning = 1 - Math.min(1, Math.max(0, (timeParams.hour - 9) / 2)); // (gone by 11)
      const early = timeParams.hour >= 4.5 ? morning : 0;
      const coast = 1 - Math.min(1, Math.max(0, (world.terrain.oceanDistAt(walker.x, walker.z) - 200) / 300)); // (oceanD tops out at 510 m: "inland")
      const bank = Math.max(0, Math.sin(t * 0.23 + 0.4) * 0.8 - 0.5); // (a fog bank's hours: ~a fifth of them)
      const marine = bank * early * coast;
      // …and now and then, anywhere: a slower gate lets about one bank in three through (~one hour
      // in eleven), lighter than a coast's — 'rare, anywhere' (the panel's drifting fog)
      const rare = Math.sin(t * 0.071 + 2.1) > 0.35 ? bank * 0.8 : 0;
      weatherParams.seaFog = weatherParams.fogMode === 'never' ? 0 : weatherParams.fogMode === 'coastal mornings' ? marine : Math.max(marine, rare);
      weatherParams.wind = 0.45 + 0.3 * Math.sin(t * 0.5);
    }
    const k = Math.min(1, dt * 0.8);
    weather.cloud += (weatherParams.cloud - weather.cloud) * k;
    weather.seaFog += (weatherParams.seaFog - weather.seaFog) * k;
    weather.haze += (weatherParams.haze - weather.haze) * k;
    weather.wind += (weatherParams.wind - weather.wind) * k;
    if (CAPTURE) Object.assign(weather, { cloud: weatherParams.cloud, seaFog: weatherParams.seaFog, haze: weatherParams.haze, wind: weatherParams.wind });

    const cel = celestial(worldMs, json.origin.lat, json.origin.lon);
    applyAtmosphere(cel, weather, timeParams.hour, debugParams.lightScale);
    U.uTime.value = simTime;
    skyUniforms.uCloudShift.value.set(simTime * 0.004 * (0.3 + weather.wind), simTime * 0.0015);

    reanchor();
    if (MOBILE) groundCheck(dt);
    if (!vehicles.update(dt, camera)) walker.update(dt, camera);
    syncTouchControls(dt);
    camera.position.sub(origin); // walker works in world coords; the renderer works origin-local
    stream.update(walker.x, walker.z);
    horizon.update(walker.x, walker.z);
    kerbCars.update(walker.x, walker.z, timeParams.hour, [walker.x, walker.z, fwd.x, fwd.z]); // (last frame's look)
    if (micro.group.visible) micro.update(camera.position.x + origin.x, camera.position.y, camera.position.z + origin.z, camera, timeParams.hour);
    treeLayer.update(camera.position.x + origin.x, camera.position.y, camera.position.z + origin.z);
    if (!CAPTURE) ambientBalloons.update(walker.x, walker.z, dt); // (they keep the world's clock: never in a capture)
    if (playing()) balloonNews(dt);
    groundT -= dt;
    if (groundT <= 0) { groundT = 1.5; streamedGround(); } // (coarse mounts have no hook)
    realCells.clear();
    for (const a of stream.loaded.values()) if (!a.spec.synth || a.vec) realCells.add(`${Math.floor((a.spec.box.x0 + a.spec.box.x1) / 2 / manifest.cell)}_${Math.floor((a.spec.box.z0 + a.spec.box.z1) / 2 / manifest.cell)}`);
    skyline.update(walker.x, walker.z, (k) => realCells.has(k));
    farSkyline.update(walker.x, walker.z, skyline.box);
    if (!walkParams.fly || walker.y - walker.feet < 60) grass.update(walker.x, walker.z);
    // The traffic's road graph follows the tile set — rebuilt a few ms a frame (life.ts
    // lifeInitSteps): in one go a city's took half a second, every time a tile mounted on a drive.
    // The sim keeps the old graph until the new one is whole.
    if (lifeDirty && !lifeBuild && (!stream.busy || now - lastTileChange > 4000)) {
      lifeDirty = false; // clear first: a failed reinit must not throw every frame
      lifeBuild = lifeInitSteps(lifeBase, stream.primRoads, walk, stream.doors, stream.junctions, stream.tunnels);
    }
    if (lifeBuild) {
      const t0 = performance.now();
      try {
        let r = lifeBuild.next();
        while (!r.done && performance.now() - t0 < 4) r = lifeBuild.next();
        if (r.done) { lifeBuild = null; life.reinit(r.value); }
      } catch (e) { lifeBuild = null; console.warn('life reinit failed', e); }
    }
    const tp = performance.now();
    if (paint.detail.update(walker.x, walker.z)) perf.detail = Math.max(perf.detail, performance.now() - tp);
    else if (paint.mid.update(walker.x, walker.z)) perf.detail = Math.max(perf.detail, performance.now() - tp); // (one window paints a frame, a slice at a time)
    sky.position.copy(camera.position);
    // the near plane rides the height (render/nearPlane.ts): up high, low ground and the sea plane
    // under it fought for the depth buffer's pixels (the ground flashed blue and green)
    if ((nearT -= dt) <= 0) {
      nearT = 0.2;
      const n = nearPlane(camera.position.y, camera.position.x + origin.x, camera.position.z + origin.z, (x, z) => world.terrain.heightAt(x, z));
      if (n !== camera.near) { camera.near = n; camera.updateProjectionMatrix(); }
    }
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    crowd.group.visible = lifeParams.enabled;
    if (crowd.group.visible) crowd.update(walker.x, walker.z, timeParams.hour, [camera.position.x + origin.x, camera.position.z + origin.z, fwd.x, fwd.z], Math.tan(Math.PI * 31 / 180) / Math.tan((camera.fov * Math.PI) / 360));
    focus.set(camera.position.x + fwd.x * 60, walker.y - walkParams.eyeHeight, camera.position.z + fwd.z * 60);
    const ti = performance.now();
    interiors.update(walker.x, walker.z, dt, walker.feet, !vehicles.driving && !walkParams.fly);
    // (the people outside learn which building stands open: who walks in by its door goes on in)
    if (interiors.visitV !== visitSeen) { visitSeen = interiors.visitV; life.setIndoor(interiors.visit); }
    liftUI.update(dt);
    if ((settleT -= dt) <= 0) { settleT = 1; if (!vehicles.driving) settleWalker(); }
    perf.interior = Math.max(perf.interior, performance.now() - ti);
    life.update(now, walker, { night: U.uNight.value, hour: timeParams.hour, wind: weather.wind, clock: simTime });
    { const ride = vehicles.wake; wakes.update(now / 1000, ride ? [...life.boats, ride] : life.boats); }
    if (ambience) {
      const run = walker.pressed('ShiftLeft') || walker.pressed('ShiftRight');
      const stride = interiors.onStairs ? 0.3 : run ? 1.1 : 0.75;
      const stepped = walker.distance - lastStep > stride;
      if (stepped) lastStep = walker.distance;
      const deck = walk.deckAt(walker.x, walker.z);
      const cov = world.terrain.coverAt(walker.x, walker.z);
      const oceanDist = world.terrain.oceanDistAt(walker.x, walker.z);
      const onDeck = deck !== null && Math.abs(deck - walker.feet) < 0.3;
      // Near a mapped street the surface is paved whatever the cover says — the virtual
      // region's flat layer reports grass under every London road (review finding).
      if ((roadPadT -= dt) < 0) {
        roadPadT = 0.5;
        roadPadD = 1e9;
        for (const r of stream.primRoads) {
          if (r.w > 0 && r.w < 2) continue; // skip bare footway lines — they read as grass paths
          if (!roadNear(r, walker.x, walker.z, walker.x, walker.z, r.w / 2 + 4)) continue; // (only "within 4 m" matters)
          for (let i = 0; i + 3 < r.p.length; i += 2) {
            const d = segDist(walker.x, walker.z, r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10) - r.w / 2;
            if (d < roadPadD) roadPadD = d;
            if (roadPadD < 0) break;
          }
          if (roadPadD < 0) break;
        }
      }
      const surface = interiors.onStairs ? 'stairs' : interiors.indoors ? 'wood' : onDeck ? (world.terrain.sdfAt(walker.x, walker.z) < 0 || deck! - world.terrain.heightAt(walker.x, walker.z) > 0.25 ? 'wood' : 'paved') : oceanDist < 45 || cov === 60 ? 'sand' : roadPadD < 4 ? 'paved' : cov === 30 || cov === 10 ? 'grass' : 'paved';
      let churchDist = 1e9;
      for (const c of churches) churchDist = Math.min(churchDist, Math.hypot(c[0] - walker.x, c[1] - walker.z));
      const houses = houseGrid.get(Math.floor(walker.x / 80) * 92821 + Math.floor(walker.z / 80)) ?? 0;
      // harbour + leaves: sampled once a second (instance scans are cheap but not free)
      if ((soundScanT -= dt) <= 0) {
        soundScanT = 1;
        let hb = 1e9, sails = 0;
        for (const b of ctx.instances('moored-boats:', walker.x, walker.z, 120)) {
          const d = Math.hypot(b.x - walker.x, b.z - walker.z);
          hb = Math.min(hb, d);
          if (b.name.endsWith(':sail') && d < 80) sails++;
        }
        harbourD = hb; sailsN = sails;
        let tc = 0;
        for (const [ox, oz] of [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20], [14, 14], [-14, -14], [14, -14], [-14, 14]]) if (world.terrain.coverAt(walker.x + ox, walker.z + oz) === 10) tc++;
        treeCover = tc / 9;
      }
      ambience.update({ dt, oceanDist, indoors: interiors.indoors, riverDist: Math.max(0, world.terrain.sdfAt(walker.x, walker.z)), wind: weather.wind, night: U.uNight.value, surface, stepped, running: run, life: life.stats, hour: timeParams.hour, churchDist, houses, harbour: harbourD, sails: sailsN, trees: Math.max(treeCover, Math.min(1, houses / 20) * 0.4), ride: vehicles.ride, city: cityAt(walker.x, walker.z), climate: regionLook.climate, summer: isSummer() && U.uSnow.value < 0.1 });
    }
    shadows.update(scene, focus, U.uKeyDir.value);
    post.render(scene, camera, simTime, U.uNight.value, U.uGolden.value, walker.yaw, walker.pitch, debugParams.rawScene, brush.overlay);
    frameOk();
    photo.afterRender(); // Space in photo mode grabs this very frame

    if ((hudTimer -= dt) < 0) { hudTimer = 0.4; updateHud(); }
    // While real tiles are on the wire, keep the promise visible — otherwise the first
    // minute reads as plain synth suburbia and the swap at second ~60 lands as a glitch.
    // 120 s per streaming burst (re-arms when pending clears), throttles after 3 fires,
    // and never stomps a different toast mid-display.
    if (stream.worldPending) {
      paintSince ??= simTime;
      if (simTime - paintSince < 120 && (paintT -= dt) <= 0) {
        const el = $('toast');
        if (el.classList.contains('show') && el.textContent !== PAINT_MSG) paintT = 0.5; // another toast owns the spot — retry soon
        else {
          paintT = ++paintShown > 3 ? 9 : 2.7;
          toast(PAINT_MSG);
        }
      }
    } else if (paintSince != null) { paintSince = null; paintShown = 0; }
    if (!walkParams.fly) journal.update(walker.x, walker.z, dt);
    // (your walks are always recorded — the atlas, the journal and the arrival cards count them —
    // but the world only shows it, near or far, when you've picked it in the panel)
    explore.enabled = true;
    explore.far = postParams.sketchFar; // (the far window: only the far sketch reads it)
    explore.update(walker.x, walker.z, camera.position.y - Math.max(world.terrain.heightAt(walker.x, walker.z), 0), dt, postParams.sketchReach);
    if (atlas.open && (journalTimer -= dt) < 0) {
      journalTimer = 0.5;
      const st = explore.stats();
      journal.render(`<b>${st.km2 < 1 ? st.km2.toFixed(3) : st.km2.toFixed(2)} km²</b> painted by your walks (${(st.session * (8 * Math.cos((json.origin.lat * Math.PI) / 180)) ** 2 / 1e6).toFixed(3)} km² today)${st.photoKm2 > 0.01 ? ` · <b>${st.photoKm2 < 10 ? st.photoKm2.toFixed(1) : Math.round(st.photoKm2)} km²</b> by your photos` : ''}<br>${commissions.state.done.length} commissions painted · ${Object.values(commissions.state.spotted).reduce((a, l) => a + l.length, 0)} vehicle and animal types spotted · ${garden.plants.length} plants in your garden<br>`);
    }
    brushT -= dt;
    const blocked = !$('intro').classList.contains('hidden') || atlas.open;
    if (!blocked) commissions.update(dt);
    hints.update(dt, blocked || photo.active || brush.active);
    brush.update(dt);
    arrival.update(dt, blocked || photo.active);
    atlas.update(dt);
    // wildlife + garden
    if ((habitatT -= dt) <= 0) {
      habitatT = 2;
      // each with its trunk height (the model's crown bottom × the instance's height scale): a
      // squirrel climbs the trunk, it doesn't perch in the sky over a small tree
      nearTrees = ctx.instances('trees:', walker.x, walker.z, 130).filter((t) => !t.name.includes(':shrub:')).map((t) => {
        const [, kind, v] = t.name.split(':');
        const m = (TREE_KINDS as readonly string[]).includes(kind) ? treeMeta(kind as (typeof TREE_KINDS)[number], +v || 0) : null;
        // the trunk as it stands: how tall to the crown, how thick, and which way it leans (the
        // model's lean, turned and stretched like the instance) — a squirrel clings to the bark
        const sx = t.sx ?? 1, sy = t.sy ?? 1, c = Math.cos(t.yaw ?? 0), s = Math.sin(t.yaw ?? 0), [lx, lz] = m?.lean ?? [0, 0];
        return { x: t.x, z: t.z, trunk: m && t.sy ? m.crownBottom * t.sy : undefined, r: m ? m.trunkR * sx : undefined, lean: [(lx * c + lz * s) * sx / sy, (-lx * s + lz * c) * sx / sy] as [number, number] };
      });
      nearGardens = [...ctx.instances('garden:', walker.x, walker.z, 130), ...garden.positions().filter((p) => p.g > 0.5)];
      life.coastal = world.terrain.oceanDistAt(walker.x, walker.z) < 5000;
      const cityHere = cityAt(walker.x, walker.z);
      townHere = townAt(walker.x, walker.z);
      life.taxiShare = Math.max(0, cityHere - 0.2) * 0.45;
      life.crowd = 1 + 1.6 * cityHere; // a Midtown sidewalk is busier than a shore town's
    }
    critters.enabled = lifeParams.enabled && !interiors.indoors;
    movers.length = 0;
    for (const m of life.movers) movers.push(m);
    if (rideMoving-- > 0) movers.push(rideMover);
    critters.update(dt, walker.x, walker.z, { hour: timeParams.hour, night: U.uNight.value, month: worldMonth(), south, wind: weather.wind, region: regionLook.region, climate: regionLook.climate, camFwd: fwd, trees: (x, z, r) => within(nearTrees, x, z, r), gardens: (x, z, r) => within(nearGardens, x, z, r), movers, paved: pavedAt, urban: townHere });
    garden.update(dt, worldMonth(), south);
    frames++;
    if (frames === 3) (window as unknown as Record<string, unknown>).__READY__ = true;
    (window as unknown as Record<string, unknown>).__RENDER_INFO__ = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, errors: errors.size, frames };
  };
  // Put away — a phone locked, the app switched, the tab hidden — the game sleeps like a phone
  // game: the townsfolk stop ticking in their worker (it ran on at 20 Hz for a page nobody could
  // see), nothing stays held down (the stick, the look drag, a held button: the finger's touchend
  // may never come), and on a phone or tablet the sound stops too (a PC's tab sounds on as it
  // always has). The frame loop stops by itself (no rAF for a hidden page). Back on screen it all
  // picks up where it was. (ui/lifecycle.ts — never under ?capture=1: the harnesses pump a hidden
  // pane's frames themselves, townsfolk and all)
  const sleeper = CAPTURE ? null : sleepWhenHidden(document, window, {
    sleep: () => { life.pause(); if (MOBILE) ambience?.suspend(); },
    wake: () => {
      life.resume();
      if (MOBILE) ambience?.resume();
      last = performance.now(); // (the first frame back steps from now, not from before the sleep)
      if (!qDone) qT = qN = qSum = 0; // (a sleep is no slow frame: auto quality measures afresh)
    },
    release: releaseHolds,
  });
  (window as unknown as Record<string, unknown>).__SLEEP__ = sleeper;
  // an iPhone parks the sound after a call or the lock screen ('interrupted') until the next tap
  if (MOBILE && sleeper) addEventListener('touchend', () => { if (ambience && !ambience.running && !sleeper.asleep) ambience.resume(); }, { capture: true, passive: true });
  requestAnimationFrame(loop(chain));
  if (CAPTURE) (window as unknown as Record<string, unknown>).__KICK__ = () => { chain++; loop(chain)(performance.now()); };
  // A lost GPU context would freeze the canvas for good: say so, and recover when the browser allows
  // (and if it doesn't give the context back, diagTick puts the report up).
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost();
    toast('the painting smudged — recovering');
    // (a phone's GPU ran out: come back lighter — half the tile budget, the far silhouettes and the
    // shadow pass let go — so the restored context isn't filled straight back up to where it failed)
    if (MOBILE) {
      streamParams.budgetMB = Math.max(60, Math.round((streamParams.budgetMB || 200) / 2));
      streamParams.coarseR = Math.min(streamParams.coarseR, streamParams.dropR);
      shadowParams.enabled = false;
    }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextRestored();
    // (tiles that let go of their vertex data once it was on the GPU can't upload it again: the page
    // reloads where you stand — a tier lighter, as after any lost context: diag's record of it)
    if (freesUploaded()) {
      chain++; // (no frame in between: it would ask three to upload what's gone)
      const [lat, lon] = toLatLon(json.origin, walker.x, walker.z);
      const p = new URLSearchParams(location.search);
      p.set('at', `${lat.toFixed(6)},${lon.toFixed(6)}`);
      p.delete('shot');
      p.delete('view');
      toast('the painting smudged — starting it again here');
      location.replace(`${location.pathname}?${p}`);
      return;
    }
    toast('back to the walk');
  });
  // The watchdog: no frame 15 s after Begin walking, or a context never given back → the report.
  // `?diag=1` opens it once the first frame is up (the GPU's facts, on the phone itself).
  if (!CAPTURE) {
    // (a software-GL test rig draws a frame every few seconds: `?watchdog=<s>`, and 180 s in any
    // page a rig drives — diag.ts watchdogSeconds)
    diag.watchdogS = watchdogSeconds(params.get('watchdog'), navigator.webdriver === true);
    let asked = params.get('diag') === '1';
    setInterval(() => {
      diagTick();
      if (asked && diag.frames > 0) { asked = false; showReport('on request (?diag=1) — the world is drawing', false); }
    }, 1000);
  }
  void gui;
}

// Step sideways from a road centreline point (positive = right of the facing direction).
function sidewalk(p: { x: number; z: number; yaw: number }, off: number) {
  return { ...p, x: p.x + Math.cos(p.yaw) * off, z: p.z - Math.sin(p.yaw) * off };
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

// The extreme point of a named road along one axis ('e' = max x, 'n' = min z …). Null when absent.
function roadAnchor(roads: Road[], name: string, bridge: boolean, extreme: 'e' | 'w' | 'n' | 's'): [number, number] | null {
  const score = { e: (x: number, _z: number) => x, w: (x: number, _z: number) => -x, n: (_x: number, z: number) => -z, s: (_x: number, z: number) => z }[extreme];
  let best: [number, number] | null = null, bv = -Infinity;
  for (const r of roads) {
    if (r.n !== name || (bridge && !r.br)) continue;
    for (let i = 0; i + 1 < r.p.length; i += 2) {
      const x = r.p[i] / 10, z = r.p[i + 1] / 10, v = score(x, z);
      if (v > bv) (bv = v), (best = [x, z]);
    }
  }
  return best;
}

// Nearest point on a named road to (x,z), with yaw facing along the road toward a compass direction.
function roadPoint(roads: Road[], name: RegExp, x: number, z: number, toward: 'north' | 'south' | 'east' | 'west') {
  let best = { x, z, yaw: 0, d: Infinity };
  for (const r of roads) {
    if (!r.n || !name.test(r.n) || r.lod || r.br) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < best.d) {
        let vx = dx, vz = dz;
        const want = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[toward];
        if (vx * want[0] + vz * want[1] < 0) (vx = -vx), (vz = -vz);
        best = { x: px, z: pz, yaw: Math.atan2(-vx, -vz), d };
      }
    }
  }
  return best;
}

main().catch((e) => {
  console.error(e);
  $('loading').textContent = 'Something smudged: ' + (e as Error).message;
  diag.errors.push('boot: ' + errorLine(e));
  showReport(diag.glError ? NO_WEBGL : `the boot stopped at "${diag.stage}": ${errorLine(e)}`);
});
