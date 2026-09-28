import * as THREE from 'three';
import { loadWorld, loadRegions, loadAtlas, manifestAsWorldJson, fromLatLon, toLatLon, type AtlasManifest, type Terrain, type World, type Road, type WorldJson } from './world/data';
import { cachedFetchJson, initCache, manifestFingerprint } from './world/cache';
import { TileStream } from './world/stream';
import { Horizon } from './world/horizon';
import { Skyline } from './world/skyline';
import { KerbCars } from './world/kerbCars';
import { seasonAt, dayOfYear } from './world/season';
import { setDemBase } from './world/dem';
import { virtualRegion } from './world/virtual';
import { paintGround } from './world/groundPaint';
import { buildGround, terrainTextures } from './world/ground';
import { setGndMaterial } from './world/pack';
import { buildWater, waterParams } from './world/water';
import { activeBuilding, type Door, type Footprint } from './world/buildings';
import { styleFor, setActiveStyle } from './world/styles';
import { Vehicles } from './player/vehicles';
import { GrassField } from './world/grass';
import { buildSky, skyUniforms } from './world/sky';
import { LifeClient, buildLifeBase, buildLifeInit, lifeParams } from './sim/life';
import { Ambience } from './audio/ambience';
import { Journal } from './ui/journal';
import { Explore } from './world/explore';
import { Atlas } from './ui/atlas';
import { PhotoMode } from './ui/photo';
import { Commissions } from './ui/commissions';
import { makeCardArt } from './ui/cardArt';
import { Hints } from './ui/hints';
import { Arrival } from './ui/arrival';
import type { GameCtx } from './ui/ctx';
import { modelName } from './player/vehicles';
import { Critters } from './sim/critters';
import { rhythmFor } from './sim/protocol';
import { Garden } from './ui/garden';
import { SPECIES, TREE_KINDS, treeMeta } from './assets/flora';
import { Interiors, type Plan } from './world/interiors';
import { applyAtmosphere, type Weather } from './world/atmosphere';
import { U } from './render/shared';
import { WatercolorPost, postParams } from './render/post';
import { SunShadows } from './render/shadows';
import { WalkWorld } from './player/collision';
import { Walker, walkParams } from './player/controller';
import { celestial, localHour, localToMs, sunPosition } from './core/sun';
import { buildPanel, loadSettings, userKeys, timeParams, weatherParams, debugParams } from './ui/panel';

const params = new URLSearchParams(location.search);
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

async function main() {
  if (TILES_PARAM === null && LOCAL) TILES = await probeLocalTiles();
  // Surface fatal errors on-screen — on a phone there is no console to open.
  {
    const show = (msg: string) => {
      const f = $('fatal');
      f.textContent = (f.textContent + msg + '\n').slice(-4000);
      f.classList.remove('hidden');
    };
    window.addEventListener('error', (e) => show(e.message + (e.filename ? ` @${e.filename.split('/').pop()}:${e.lineno}` : '')));
    window.addEventListener('unhandledrejection', (e) => show('rejection: ' + (e.reason?.message ?? String(e.reason))));
  }
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  renderer.setPixelRatio(1);
  renderer.autoClear = true;
  renderer.setClearColor(0xd8e0e4, 1);
  const maxTex = renderer.capabilities.maxTextureSize;

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
  const camera = new THREE.PerspectiveCamera(walkParams.fov, innerWidth / innerHeight, 0.25, 25000);
  camera.layers.enable(1);

  const tt = terrainTextures(world);
  const paint = paintGround(paintWorld, maxTex);
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
  waterParams.uOpenSea.value = VIRTUAL ? 1 : 0; // (the open world's plane is the sea itself)
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
  // `?lidar=0` builds from mapped priors only.
  stream.lidar = params.get('lidar') !== '0';
  // The horizon ring: real mountains out to 80 km past the tiles (Terrarium z9 through the same
  // DEM route the cells use). `?horizon=0` turns it off.
  if (tilesBase) setDemBase(tilesBase);
  const horizon = new Horizon(manifest.origin, regionLook, !!tilesBase && params.get('horizon') !== '0');
  worldRoot.add(horizon.group);
  // …and a city's towers past the detail ring (a skyline you can navigate by). `?skyline=0` off.
  const skyline = new Skyline(manifest.origin, manifest.cell, !!tilesBase && params.get('skyline') !== '0');
  worldRoot.add(skyline.group);
  const realCells = new Set<string>();
  // The localhost auto-default was probed before setup: no worker answered → procedural past the bake.

  // Grass: tufts grow on open land around the walker (lawns short, open ground tall + lush).
  const grass = new GrassField(world.terrain, walk, () => stream.primRoads, paint.grassMask);
  worldRoot.add(grass.group);
  // Parked kerb and lot cars: one manager draws every tile's, near cars in the lite kit, far ones
  // as two-block proxies (kerbCars.ts)
  const kerbCars = new KerbCars();
  kerbCars.ground = (x, z, y) => walk.outdoorNear(x, z, y);
  worldRoot.add(kerbCars.group);
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
    paint.addWalks(a.walks);
    kerbCars.add(a.spec.id, a.kerb);
    streamedGround();
    // J1: streamed tiles (past the bake) paint their streets and footprints into the ground windows
    if (a.spec.world || a.spec.synth) paint.setTile(a.spec.id, a.primRoads, a.fps.map((f) => f.ring as [number, number][]), [a.spec.box.x0, a.spec.box.z0, a.spec.box.x1, a.spec.box.z1], a.fps.map((f) => !!f.front), a.areas, a.fps.map((f) => (f.kind === 'house' || f.kind === 'shed' ? 0.45 : 1)));
    grass.invalidateBox(a.spec.box);
  };
  stream.onUnload = (id) => { paint.dropTile(id); kerbCars.remove(id); queueMicrotask(streamedGround); };
  const plans = stream.plans;
  const bld = {
    get footprints() { return stream.footprints; },
    get doors() { return stream.doors; },
    doorOf: (f: Footprint) => stream.doorOf(f),
  };
  let lifeDirty = false;
  let ambience: Ambience | null = null;
  const startAudio = () => {
    try { ambience ??= new Ambience(); ambience.resume(); } catch (e) { console.warn('audio unavailable', e); }
  };
  let toastTimer = 0;
  const toast = (msg: string) => {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
  };
  const journal = new Journal(world, paint.sliceCanvas, toast);
  await journal.load();
  // Paint as you explore: a global, persistent record of where you've been (pencil elsewhere).
  const explore = new Explore(json.origin);
  if (CAPTURE) postParams.sketch = params.get('sketch') === '1'; // regression shots stay fully painted unless asked
  else if (params.get('sketch') === '0') postParams.sketch = false;
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
  if (atStranded) setTimeout(() => toast('no tile service — that place can\'t stream yet; you\'re at the nearest baked town'), 0);
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
  // Doorstep-first placement: on or near a building → step out its front door;
  // on open ground → stand on the spot facing down the nearest street.
  const teleportLocal = (x: number, z: number) => {
    let best: Door | null = null, bd = 40 * 40;
    for (const d of stream.doors) {
      const dd = (d.wx - x) ** 2 + (d.wz - z) ** 2;
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (best) spawn = { x: best.wx - best.nx * 2.2, z: best.wz - best.nz * 2.2, yaw: Math.atan2(best.nx, best.nz), y: best.y };
    else {
      // Manifest roads plus whatever tiles have mounted (synth/remote) — in the virtual
      // world the manifest list is empty and a yaw-0 spawn would face nowhere.
      const near = roadPoint([...json.roads, ...stream.primRoads], /./, x, z, 'north');
      spawn = { x, z, yaw: isFinite(near.d) ? near.yaw : 0, y: undefined };
    }
    respawn();
  };
  respawn();

  // Bring the spawn neighbourhood online before we build life or prime interiors.
  $('loading').textContent = 'raising the houses…';
  await stream.ensureAround(spawn.x, spawn.z);
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
    toast('walking over…');
    await stream.ensureAround(x, z);
    if (!landmark || !viewpoint(x, z)) teleportLocal(x, z);
  };
  // When a real tile swaps in under the walker, the synth placeholder's collision is
  // tombstoned with it — the player can end up inside a wall. Nudge them clear — but
  // only when genuinely swallowed: a wall through their position, or inside a solid
  // footprint with no interior. Legit indoor players must not be yanked outside.
  const settleWalker = () => {
    if (walkParams.fly) return; // flying over a roof isn't being swallowed by it
    // blocked at 0.28 < the walker's 0.35 radius: a wall running *through* their body,
    // not a wall they're legally pressed against.
    const swallowed = walk.blocked(walker.x, walker.z, 0.28) || (walk.buildingAt(walker.x, walker.z) >= 0 && !interiors.indoors && walk.interiorAt(walker.x, walker.z, walker.feet) < 0);
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
  stream.onMount = () => { if (!vehicles.driving) settleWalker(); };
  // Rideable vehicles (E enter/exit · V car · B boat · N plane) — the walker rides along.
  const vehicles = new Vehicles({
    walk, terrain: world.terrain, walker, root: worldRoot, toast,
    roads: () => stream.primRoads,
    tiles: () => stream.loaded.values(),
    kerb: kerbCars,
    driveLeft: regionLook.driveLeft,
    enabled: () => $('intro').classList.contains('hidden') && !atlas.open && !photo.active,
    geo: { toLatLon: (x, z) => toLatLon(json.origin, x, z), fromLatLon: (lat, lon) => fromLatLon(json.origin, lat, lon) },
  });
  { const prev = stream.onTile; stream.onTile = (a) => { prev?.(a); vehicles.onTile(a); }; } // re-hide taken driveway cars on remount

  const lifeBase = buildLifeBase(paintWorld, walk);
  lifeBase.rhythm = rhythmFor(regionLook.climate, lifeBase.beachPts.length > 0); // the shape of this place's day
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
          const im = m as THREE.InstancedMesh;
          for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, im4);
            if (im4.elements[0] === 0 && im4.elements[5] === 0) continue; // hidden / zero-scaled
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
      for (const t of stream.loaded.values()) if (t.group.visible) for (const c of t.group.children) scan(c);
      for (const c of life.group.children) scan(c);
      for (const c of critters.group.children) scan(c);
      for (const c of garden.group.children) scan(c);
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
    uiOpen: () => !$('intro').classList.contains('hidden') || atlas.open,
    lock: () => { if (!isTouch) walker.lock(); },
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
  commissions.onStamp = (town, region) => { toast(`almanac stamp: ${town}${region ? ` · ${region}` : ''}`); ambience?.ui('chime'); };
  const photo = new PhotoMode(ctx, commissions);
  const atlas = new Atlas(ctx, commissions, () => journal.stamps());
  photo.onSaved = () => void atlas.refreshPages();
  atlas.extraPins = () => garden.positions().map((p) => ({ x: p.x, z: p.z, kind: 'plant' as const, label: SPECIES[p.sp].label }));
  const arrival = new Arrival(ctx, { name: townName, sub: meta?.sub ?? '' });
  const hints = new Hints();
  let brushT = 0;
  explore.onBloom = (n) => { if (n > 3 && brushT <= 0) { brushT = 1.6; ambience?.ui('brush'); } };
  const VERB = { car: 'drive this', boat: 'take the helm of this', plane: 'fly this' } as const;
  hints.add(() => { const e = vehicles.enterable(); return e ? { key: 'E', text: `${VERB[e.kind]} ${modelName(e.model)}`, pri: 10 } : null; });
  hints.add(() => {
    const P = interiors.activePlan;
    if (!P || interiors.indoors || vehicles.driving) return null;
    return Math.hypot(P.door.fx - walker.x, P.door.fz - walker.z) < 3.5 ? { text: 'walk through the door to go inside', pri: 5 } : null;
  });
  hints.add(() => {
    for (const t of commissions.targets()) if (Math.hypot(t.x - walker.x, t.z - walker.z) < 60) return { key: 'P', text: `✧ ${t.title.replace(/^Paint /, 'paint ')}`, pri: 7 };
    return null;
  });
  hints.add(() => (walkParams.fly && !vehicles.driving ? { key: 'F', text: 'land · Space / C up and down · wheel for speed', pri: 3, once: 'fly' } : null));
  hints.add(() => (!vehicles.driving && !walkParams.fly && (world.terrain.oceanDistAt(walker.x, walker.z) < 70 || world.terrain.sdfAt(walker.x, walker.z) < 25) ? { key: 'B', text: 'call a boat', pri: 2, once: 'boat' } : null));
  hints.add(() => (simTime > 12 ? { key: 'M', text: 'your map, sketchbook & commissions', pri: 1, once: 'atlas' } : null));
  hints.add(() => (simTime > 70 && !vehicles.driving && !walkParams.fly && world.terrain.coverAt(walker.x, walker.z) === 30 ? { key: 'R', text: `plant a ${SPECIES[garden.nextSpecies].label} here (Shift+R: another seed)`, pri: 1, once: 'plant' } : null));
  hints.add(() => (simTime > 45 ? { key: 'P', text: 'frame a view and paint it into your sketchbook', pri: 1, once: 'photo' } : null));
  hints.add(() => (simTime > 100 ? { key: 'G', text: 'go anywhere — search a town or an address', pri: 1, once: 'go' } : null));

  const post = new WatercolorPost(renderer);
  const shadows = new SunShadows(renderer);
  // Compile every shader now (incl. the interior + NPC materials) so the first front door doesn't hitch.
  const firstPlan = plans.keys().next().value;
  if (firstPlan !== undefined) interiors.prime(firstPlan);
  renderer.compile(scene, camera);
  if (firstPlan !== undefined) interiors.prime(null);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
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

  const gui = CAPTURE && !params.has('panel') ? null : buildPanel({ onResize: resize, onPreset: setHour, onRespawn: respawn, onResetExplore: () => { void journal.reset(); void explore.reset(); } }, { name: townName, tz, respawn: spec?.on });

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
  (window as unknown as Record<string, unknown>).__GAME__ = { walker, walk, world, U, post, postParams, timeParams, weatherParams, debugParams, walkParams, camera, renderer, scene, THREE, interiors, plans, bld, life, stream, vehicles, grass, explore, commissions, photo, atlas, arrival, hints, critters, garden, ctx, paint, setHour, teleport: teleportTo, get spawn() { return spawn; }, at: atPos };

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
      const kindName = ({ house: 'a house', commercial: 'a shop', church: 'the church', large: 'an apartment building' } as Record<string, string>)[fp?.kind ?? ''] ?? 'a building';
      const what = fp?.name ?? fp?.addr ?? (P.door.street ? `${kindName} on ${P.door.street}` : kindName);
      const floorName = storey === 0 ? 'ground floor' : storey === P.levels - 1 ? (P.levels > 2 ? 'top floor' : 'upstairs') : `floor ${storey + 1}`;
      $('place').textContent = `inside ${what}${P.levels > 1 ? ` · ${interiors.onStairs ? 'on the stairs' : floorName}` : ''}`;
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
  $('loading').textContent = '';
  const startBtn = $('start') as HTMLButtonElement;
  startBtn.disabled = false;
  startBtn.onclick = () => { $('intro').classList.add('hidden'); walker.lock(); startAudio(); arrival.greet(); };
  canvas.addEventListener('click', () => { if ($('intro').classList.contains('hidden')) { walker.lock(); startAudio(); } });
  $('credits-link').onclick = (e) => { e.preventDefault(); $('credits').classList.remove('hidden'); };
  $('credits-close').onclick = () => $('credits').classList.add('hidden');
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.closest?.('.lil-gui')) return;
    if (e.code === 'KeyT') setHour((localHour(worldMs, tz) + 1) % 24);
    if ((e.target as HTMLElement)?.closest?.('input,textarea')) return;
    const playing = $('intro').classList.contains('hidden');
    if (e.code === 'KeyP' && playing && !atlas.open && !vehicles.driving) photo.toggle();
    if (e.code === 'KeyM' && playing) { if (photo.active) photo.toggle(false); atlas.toggle(); }
    if (e.code === 'KeyG' && playing && !atlas.open) { if (photo.active) photo.toggle(false); atlas.focusSearch(); }
    if (e.code === 'KeyR' && playing && !atlas.open && !photo.active && !vehicles.driving && !e.repeat) { if (e.shiftKey) garden.cycle(); else garden.plant(); }
    if (e.code === 'Escape' && atlas.open) atlas.toggle(false);
  });
  // Touch buttons (shown by body.touch): fly toggle, go-anywhere search, atlas, photo mode.
  $('tfly').onclick = () => walker.setFly(!walkParams.fly);
  $('tgo').onclick = () => { if ($('intro').classList.contains('hidden') && !atlas.open) atlas.focusSearch(); };
  $('tphoto').onclick = () => { if ($('intro').classList.contains('hidden') && !atlas.open) photo.toggle(); };
  $('tmenu').onclick = () => {
    atlas.toggle();
  };
  if (CAPTURE) {
    $('intro').classList.add('hidden');
    document.body.classList.add('postcard');
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
  const PAINT_MSG = 'the real streets are painting in…';
  const errors = new Map<string, number>();
  const perf = { detail: 0, interior: 0 }; // worst-case ms, for tools/soak.mjs
  (window as unknown as Record<string, unknown>).__PERF__ = perf;
  const focus = new THREE.Vector3();
  const fwd = new THREE.Vector3();
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
    }
  };
  // Auto quality: the crisper defaults (paint detail, full screen resolution) step down once, a
  // few seconds into the walk, on a GPU that can't hold ~40 fps — unless the player set them in
  // the panel. (A proper boot benchmark with tiers is the backlog's 1.7.)
  let qT = 0, qN = 0, qSum = 0, qDone = CAPTURE;
  const autoQuality = (rawDt: number) => {
    if (qDone || interiors.indoors) return;
    qT += rawDt;
    if (qT < 4) return; // let the first tiles settle
    qSum += rawDt;
    qN++;
    if (qT < 10) return;
    qDone = true;
    const ms = (qSum / qN) * 1000;
    if (ms > 25) {
      let changed = false;
      if (!userKeys.has('post.hiDpi') && postParams.hiDpi && devicePixelRatio > 1) (postParams.hiDpi = false), (changed = true);
      if (!userKeys.has('post.paintDetail') && postParams.paintDetail > 0.5) (postParams.paintDetail = 0.5), (changed = true);
      if (changed) { resize(); console.info(`auto quality: ${ms.toFixed(1)} ms/frame — paint detail and resolution stepped down`); }
    }
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
      U.uBloom.value = s.bloom;
      horizon.setSnowline(s.snowline);
    }

    if (weatherParams.autoWeather) {
      const t = worldMs / 3.6e6; // hours
      weatherParams.cloud = 0.3 + 0.3 * Math.sin(t * 0.37 + 1.3) * Math.sin(t * 0.11);
      weatherParams.seaFog = Math.max(0, Math.sin(t * 0.23 + 0.4) * 0.8 - 0.45);
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
    if (!vehicles.update(dt, camera)) walker.update(dt, camera);
    camera.position.sub(origin); // walker works in world coords; the renderer works origin-local
    stream.update(walker.x, walker.z);
    horizon.update(walker.x, walker.z);
    kerbCars.update(walker.x, walker.z);
    groundT -= dt;
    if (groundT <= 0) { groundT = 1.5; streamedGround(); } // (coarse mounts have no hook)
    realCells.clear();
    for (const a of stream.loaded.values()) if (!a.spec.synth) realCells.add(`${Math.floor((a.spec.box.x0 + a.spec.box.x1) / 2 / manifest.cell)}_${Math.floor((a.spec.box.z0 + a.spec.box.z1) / 2 / manifest.cell)}`);
    skyline.update(walker.x, walker.z, (k) => realCells.has(k));
    if (!walkParams.fly || walker.y - walker.feet < 60) grass.update(walker.x, walker.z);
    if (lifeDirty && (!stream.busy || now - lastTileChange > 4000)) {
      lifeDirty = false; // clear first: a failed reinit must not throw every frame
      try { life.reinit(buildLifeInit(lifeBase, stream.primRoads, walk, stream.doors, stream.junctions, stream.tunnels)); }
      catch (e) { console.warn('life reinit failed', e); }
    }
    const tp = performance.now();
    if (paint.detail.update(walker.x, walker.z)) perf.detail = Math.max(perf.detail, performance.now() - tp);
    else if (paint.mid.update(walker.x, walker.z)) perf.detail = Math.max(perf.detail, performance.now() - tp); // at most one window repaint per frame
    sky.position.copy(camera.position);
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    focus.set(camera.position.x + fwd.x * 60, walker.y - walkParams.eyeHeight, camera.position.z + fwd.z * 60);
    const ti = performance.now();
    interiors.update(walker.x, walker.z, dt, walker.feet);
    perf.interior = Math.max(perf.interior, performance.now() - ti);
    life.update(now, walker, { night: U.uNight.value, hour: timeParams.hour, wind: weather.wind, clock: simTime });
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
    post.render(scene, camera, simTime, U.uNight.value, U.uGolden.value, walker.yaw, walker.pitch, debugParams.rawScene);
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
    explore.enabled = postParams.sketch;
    explore.update(walker.x, walker.z, camera.position.y - Math.max(world.terrain.heightAt(walker.x, walker.z), 0), dt);
    if (atlas.open && (journalTimer -= dt) < 0) {
      journalTimer = 0.5;
      const st = explore.stats();
      journal.render(`<b>${st.km2 < 1 ? st.km2.toFixed(3) : st.km2.toFixed(2)} km²</b> painted by your walks (${(st.session * (8 * Math.cos((json.origin.lat * Math.PI) / 180)) ** 2 / 1e6).toFixed(3)} km² today)<br>${commissions.state.done.length} commissions painted · ${Object.values(commissions.state.spotted).reduce((a, l) => a + l.length, 0)} vehicle and animal types spotted · ${garden.plants.length} plants in your garden<br>`);
    }
    brushT -= dt;
    const blocked = !$('intro').classList.contains('hidden') || atlas.open;
    if (!blocked) commissions.update(dt);
    hints.update(dt, blocked || photo.active);
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
  requestAnimationFrame(loop(chain));
  if (CAPTURE) (window as unknown as Record<string, unknown>).__KICK__ = () => { chain++; loop(chain)(performance.now()); };
  // A lost GPU context would freeze the canvas for good: say so, and recover when the browser allows.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('the painting smudged — recovering…'); });
  canvas.addEventListener('webglcontextrestored', () => toast('back to the walk'));
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
});
