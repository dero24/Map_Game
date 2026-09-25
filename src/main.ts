import * as THREE from 'three';
import { loadWorld, loadRegions, type World, type Road } from './world/data';
import { paintGround } from './world/groundPaint';
import { buildGround, terrainTextures } from './world/ground';
import { buildWater } from './world/water';
import { buildBuildings } from './world/buildings';
import { buildSky, skyUniforms } from './world/sky';
import { buildStructures } from './world/structures';
import { buildProps } from './world/props';
import { buildSigns } from './world/signs';
import { LifeClient, buildLifeInit } from './sim/life';
import { Ambience } from './audio/ambience';
import { Journal } from './ui/journal';
import { Interiors, planInterior, registerPlan, type Plan } from './world/interiors';
import { applyAtmosphere, type Weather } from './world/atmosphere';
import { U } from './render/shared';
import { WatercolorPost, postParams } from './render/post';
import { SunShadows } from './render/shadows';
import { WalkWorld } from './player/collision';
import { Walker, walkParams } from './player/controller';
import { celestial, localHour, localToMs } from './core/sun';
import { buildPanel, loadSettings, timeParams, weatherParams, debugParams } from './ui/panel';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const $ = (id: string) => document.getElementById(id)!;

async function main() {
  const regions = await loadRegions();
  const REGION = params.get('region') ?? regions?.[0]?.id ?? 'seabright';
  loadSettings(REGION);
  const canvas = $('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  renderer.setPixelRatio(1);
  renderer.autoClear = true;
  renderer.setClearColor(0xd8e0e4, 1);
  const maxTex = renderer.capabilities.maxTextureSize;

  const world: World = await loadWorld(`./data/${REGION}/`, (m) => ($('loading').textContent = m));
  const { json } = world;
  const meta = json.meta;
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
  const bld = buildBuildings(world);
  scene.add(bld.group);
  const paint = paintGround(world, maxTex, bld.walks);
  scene.add(buildGround(world, paint, tt));
  scene.add(buildWater(tt));
  const sky = buildSky();
  scene.add(sky);
  U.uSliceBox.value.set(json.slice.x0, json.slice.z0, json.slice.x1, json.slice.z1);

  // Walk physics
  // Walk anywhere on the map; every building with a door gets a floor plan and can be entered.
  const walk = new WalkWorld(world.terrain, json.backdrop);
  const plans = new Map<number, Plan>();
  const walkIds = new Map<number, number>();
  bld.footprints.forEach((f, fi) => {
    if (f.kind === 'lighthouse') return;
    if (f.door === undefined) {
      // raised houses stand on open pilings: walk underneath, walls start at the floor
      if (f.raise > 0.5) walk.addPolygon(f.ring, { floor0: f.floor0, floorH: 3, levels: 1, ground: true }, null, f.floor0 - 0.6);
      else walk.addPolygon(f.ring);
      return;
    }
    const plan = planInterior(fi, f, bld.doors[f.door], Math.floor(f.seed * 4294967296));
    plans.set(fi, plan);
    walkIds.set(fi, registerPlan(walk, f, plan));
  });
  // porches, stoops, raised-house stairs + landings, lattice skirts, pilings
  for (const [a, b, y0, y1] of bld.colliders.walls) walk.addWall(a, b, y0, y1);
  for (const d of bld.colliders.decks) walk.addDeck(d);
  for (const p of bld.pilings) {
    const c = Math.cos(p.ang) * 0.17, s = Math.sin(p.ang) * 0.17;
    walk.addLoop([[p.x - c + s, p.z - s - c], [p.x + c + s, p.z + s - c], [p.x + c - s, p.z + s + c], [p.x - c - s, p.z - s + c]], -Infinity, 2.2 + Math.max(0, world.terrain.heightAt(p.x, p.z)));
  }
  const interiors = new Interiors(plans, bld.footprints, walk);
  walkIds.forEach((pid, fi) => interiors.setWalkId(fi, pid));
  scene.add(interiors.group);
  const structures = buildStructures(world, walk);
  scene.add(structures.group);
  const signs = buildSigns(world, bld.signs, walk);
  scene.add(signs.mesh);
  const props = buildProps(world, walk, structures.pierSegs, { mailboxes: bld.mailboxes });
  scene.add(props.group);
  scene.add(props.halo(bld.lanterns, 7, new THREE.Color(1.0, 0.85, 0.55)));
  scene.add(props.halo(structures.towers, 1.2, new THREE.Color(1.0, 0.75, 0.45)));
  const life = new LifeClient(buildLifeInit(world, walk, bld.doors));
  scene.add(life.group);
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
  const walker = new Walker(walk, canvas);

  // Spawn: nearest point on `spawn.on` to an anchor point — the `extreme` end of `spawn.near.road`
  // (Sea Bright: the east end of the Rumson bridge = where it lands on Ocean Ave) — shifted by
  // `spawn.offset` metres, facing `spawn.toward`, stepped `spawn.sidewalk` m right onto the sidewalk.
  const spec = meta?.spawn;
  const sliceC: [number, number] = [(json.slice.x0 + json.slice.x1) / 2, (json.slice.z0 + json.slice.z1) / 2];
  const anchor = spec?.near
    ? roadAnchor(json.roads, spec.near.road, !!spec.near.bridge, spec.near.extreme ?? 'e') ?? sliceC
    : sliceC;
  const target: [number, number] = [anchor[0] + (spec?.offset?.[0] ?? 0), anchor[1] + (spec?.offset?.[1] ?? 0)];
  const onRoad = roadPoint(json.roads, new RegExp(`^${spec?.on ?? ''}`), target[0], target[1], spec?.toward ?? 'north');
  const spawn = sidewalk(isFinite(onRoad.d) ? onRoad : { x: target[0], z: target[1], yaw: 0, d: 0 }, spec?.sidewalk ?? 0);
  const respawn = () => walker.place(spawn.x, spawn.z, spawn.yaw, -0.02);
  respawn();

  const post = new WatercolorPost(renderer);
  const shadows = new SunShadows(renderer);
  // Compile every shader now (incl. the interior + NPC materials) so the first front door doesn't hitch.
  const firstPlan = plans.keys().next().value;
  if (firstPlan !== undefined) interiors.prime(firstPlan);
  renderer.compile(scene, camera);
  if (firstPlan !== undefined) interiors.prime(-1);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  // World clock: real time in the region's timezone, or a free-running clock set from the panel.
  let worldMs = Date.now();
  const setHour = (h: number) => {
    timeParams.realTime = false;
    timeParams.hour = h;
    worldMs = localToMs(Date.now(), h, tz);
  };
  if (!timeParams.realTime) worldMs = localToMs(Date.now(), timeParams.hour, tz);

  const gui = CAPTURE && !params.has('panel') ? null : buildPanel({ onResize: resize, onPreset: setHour, onRespawn: respawn, onResetExplore: () => void journal.reset() }, { name: townName, tz, respawn: spec?.on });

  const weather: Weather = { cloud: weatherParams.cloud, seaFog: weatherParams.seaFog, haze: weatherParams.haze, wind: weatherParams.wind };
  let simTime = 0;

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
        const homey = bld.footprints[P.fp].kind === 'house' && P.L * P.W < 170;
        const d = Math.hypot(P.door.x - spawn.x, P.door.z - spawn.z) - (P.levels > 1 ? 40 : 0) - (homey ? 60 : 0);
        if (d < bd) (bd = d), (best = P);
      }
      shots[n === 'inside-night' ? 'ocean-night' : 'ocean-noon']();
      const d = best!.door;
      if (n === 'doorway') walker.place(d.fx + d.nx * 5, d.fz + d.nz * 5, Math.atan2(d.nx, d.nz), -0.05);
      else walker.place(d.wx - d.nx * 2.2, d.wz - d.nz * 2.2, Math.atan2(d.nx, d.nz), -0.08, d.y);
      for (let k = 0; k < 8; k++) interiors.update(walker.x, walker.z, 0.25, walker.feet);
      return n;
    }
    if (n === 'stairs' || n === 'upstairs' || n === 'stairs-night') {
      // the nearest house with a staircase: at the foot looking up it, or on the landing above
      let best: Plan | null = null, bd = Infinity;
      for (const P of plans.values()) {
        if (!P.flights.length) continue;
        const dd = Math.hypot(P.door.x - spawn.x, P.door.z - spawn.z) - (bld.footprints[P.fp].kind === 'house' && P.L * P.W < 170 ? 60 : 0);
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
      return n;
    }
    if (n === 'raised' || n === 'houses' || n === 'porch' || n === 'shop') {
      // a raised shore house / a house with a porch / a cross-gabled house / a named shop, from its street
      let best = -1, bd = Infinity;
      bld.footprints.forEach((f, fi) => {
        if (f.door === undefined || (n === 'shop' ? f.kind !== 'commercial' || !f.name : f.kind !== 'house')) return;
        const d = bld.doors[f.door];
        if (n === 'raised' && f.raise < 0.5) return;
        if (n === 'houses' && (f.ring.length < 6 || !f.pitched)) return;
        if (n === 'porch' && !d.porch) return;
        const dd = Math.hypot(d.x - spawn.x, d.z - spawn.z);
        if (dd < bd) (bd = dd), (best = fi);
      });
      shots['ocean-noon']();
      if (best < 0) return n;
      const d = bld.doors[bld.footprints[best].door!];
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
      let best = signs.poles[0], bd = Infinity;
      for (const p of signs.poles) { const dd = Math.hypot(p.x - spawn.x, p.z - spawn.z); if (dd < bd) (bd = dd), (best = p); }
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
      journal.toggle(true);
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
  (window as unknown as Record<string, unknown>).__GAME__ = { walker, world, U, post, postParams, timeParams, weatherParams, debugParams, walkParams, camera, renderer, scene, THREE, interiors, plans, bld, life };

  // ---- HUD ----
  const named = json.roads.filter((r) => r.n && !r.lod);
  let hudTimer = 0;
  const updateHud = () => {
    let best = '', bd = 1e9;
    for (const r of named) {
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const d = segDist(walker.x, walker.z, r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10);
        if (d < bd) (bd = d), (best = r.n!);
      }
    }
    $('place').textContent = bd < 40 ? best : world.terrain.oceanDistAt(walker.x, walker.z) < 60 ? shoreLabel : townName;
    if (walkParams.fly) $('place').textContent = `flying over ${$('place').textContent} · ${Math.round(walker.y)} m`;
    else if (interiors.indoors && interiors.activePlan) {
      const fp = bld.footprints[interiors.activeIndex];
      const P = interiors.activePlan;
      const storey = Math.max(0, Math.round((walker.feet - P.floor0) / P.floorH));
      const kindName = ({ house: 'a house', commercial: 'a shop', church: 'the church', large: 'an apartment building' } as Record<string, string>)[fp.kind] ?? 'a building';
      const what = fp.name ?? fp.addr ?? (P.door.street ? `${kindName} on ${P.door.street}` : kindName);
      const floorName = storey === 0 ? 'ground floor' : storey === P.levels - 1 ? (P.levels > 2 ? 'top floor' : 'upstairs') : `floor ${storey + 1}`;
      $('place').textContent = `inside ${what}${P.levels > 1 ? ` · ${interiors.onStairs ? 'on the stairs' : floorName}` : ''}`;
    } else if (interiors.activePlan) {
      // at someone's front steps: the real address or the shop's name
      const P = interiors.activePlan, fp = bld.footprints[interiors.activeIndex];
      if (Math.hypot(P.door.fx - walker.x, P.door.fz - walker.z) < 3.5 || Math.hypot(P.door.x - walker.x, P.door.z - walker.z) < 3) {
        const label = fp.name ?? fp.addr;
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
  startBtn.onclick = () => { $('intro').classList.add('hidden'); walker.lock(); startAudio(); };
  canvas.addEventListener('click', () => { if ($('intro').classList.contains('hidden')) { walker.lock(); startAudio(); } });
  $('credits-link').onclick = (e) => { e.preventDefault(); $('credits').classList.remove('hidden'); };
  $('credits-close').onclick = () => $('credits').classList.add('hidden');
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.closest?.('.lil-gui')) return;
    if (e.code === 'KeyT') setHour((localHour(worldMs, tz) + 1) % 24);
    if (e.code === 'KeyP') document.body.classList.toggle('postcard');
    if (e.code === 'KeyM' && $('intro').classList.contains('hidden')) {
      journal.toggle();
      if (journal.open) document.exitPointerLock?.();
      else walker.lock();
    }
    if (e.code === 'Escape' && journal.open) journal.toggle(false);
  });
  if (CAPTURE) {
    $('intro').classList.add('hidden');
    document.body.classList.add('postcard');
    const s = params.get('shot');
    if (s && shots[s]) (window as unknown as { __APPLY_SHOT__: (n: string) => void }).__APPLY_SHOT__(s);
  }

  // Sound context from the data: churches within earshot, how many houses are around.
  const churches = bld.footprints.filter((f) => f.kind === 'church').map((f) => f.ring[0]);
  const houseGrid = new Map<number, number>();
  for (const f of bld.footprints) if (f.kind === 'house') { const k = Math.floor(f.ring[0][0] / 80) * 92821 + Math.floor(f.ring[0][1] / 80); houseGrid.set(k, (houseGrid.get(k) ?? 0) + 1); }

  // ---- loop ----
  let last = performance.now();
  let lastStep = 0;
  let journalTimer = 0;
  let frames = 0;
  const errors = new Map<string, number>();
  const perf = { detail: 0, interior: 0 }; // worst-case ms, for tools/soak.mjs
  (window as unknown as Record<string, unknown>).__PERF__ = perf;
  const focus = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  // Schedule the next frame first: one bad frame must never stop the world.
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    try {
      frame(now);
    } catch (e) {
      const k = String((e as Error)?.message ?? e);
      const n = (errors.get(k) ?? 0) + 1;
      errors.set(k, n);
      if (n === 1 || n % 600 === 0) console.error(`frame error (x${n})`, e);
    }
  };
  const frame = (now: number) => {
    const dt = CAPTURE ? 1 / 60 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    simTime += dt;
    if (timeParams.realTime) worldMs = Date.now();
    else worldMs += dt * 1000 * timeParams.speed;
    timeParams.hour = localHour(worldMs, tz);

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

    walker.update(dt, camera);
    const tp = performance.now();
    if (paint.detail.update(walker.x, walker.z)) perf.detail = Math.max(perf.detail, performance.now() - tp);
    sky.position.copy(camera.position);
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    focus.set(camera.position.x + fwd.x * 60, walker.y - walkParams.eyeHeight, camera.position.z + fwd.z * 60);
    const ti = performance.now();
    interiors.update(walker.x, walker.z, dt, walker.feet);
    perf.interior = Math.max(perf.interior, performance.now() - ti);
    life.update(now, walker, { night: U.uNight.value, hour: timeParams.hour, wind: weather.wind });
    if (ambience) {
      const run = walker.pressed('ShiftLeft') || walker.pressed('ShiftRight');
      const stride = interiors.onStairs ? 0.3 : run ? 1.1 : 0.75;
      const stepped = walker.distance - lastStep > stride;
      if (stepped) lastStep = walker.distance;
      const deck = walk.deckAt(walker.x, walker.z);
      const cov = world.terrain.coverAt(walker.x, walker.z);
      const oceanDist = world.terrain.oceanDistAt(walker.x, walker.z);
      const onDeck = deck !== null && Math.abs(deck - walker.feet) < 0.3;
      const surface = interiors.onStairs ? 'stairs' : interiors.indoors ? 'wood' : onDeck ? (world.terrain.sdfAt(walker.x, walker.z) < 0 || deck! - world.terrain.heightAt(walker.x, walker.z) > 0.25 ? 'wood' : 'paved') : oceanDist < 45 || cov === 60 ? 'sand' : cov === 30 || cov === 10 ? 'grass' : 'paved';
      let churchDist = 1e9;
      for (const c of churches) churchDist = Math.min(churchDist, Math.hypot(c[0] - walker.x, c[1] - walker.z));
      const houses = houseGrid.get(Math.floor(walker.x / 80) * 92821 + Math.floor(walker.z / 80)) ?? 0;
      ambience.update({ dt, oceanDist, indoors: interiors.indoors, riverDist: Math.max(0, world.terrain.sdfAt(walker.x, walker.z)), wind: weather.wind, night: U.uNight.value, surface, stepped, running: run, life: life.stats, hour: timeParams.hour, churchDist, houses });
    }
    shadows.update(scene, focus, U.uKeyDir.value);
    post.render(scene, camera, simTime, U.uNight.value, U.uGolden.value, walker.yaw, walker.pitch, debugParams.rawScene);

    if ((hudTimer -= dt) < 0) { hudTimer = 0.4; updateHud(); }
    if (!walkParams.fly) journal.update(walker.x, walker.z, dt);
    if (journal.open && (journalTimer -= dt) < 0) { journalTimer = 0.15; journal.render(walker.x, walker.z, walker.yaw); }
    frames++;
    if (frames === 3) (window as unknown as Record<string, unknown>).__READY__ = true;
    (window as unknown as Record<string, unknown>).__RENDER_INFO__ = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, errors: errors.size, frames };
  };
  requestAnimationFrame(loop);
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
