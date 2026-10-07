#!/usr/bin/env node
// The animals where they live, in the real game: each one's place, date and hour opened with its
// `see=` link (ui/seeIt.ts — it comes, its role's slots its first), waited for, then framed twice —
// close, through a long lens from outside its flight distance (nothing scared off), and wide, from
// where you'd stand (is it on its own ground: the marsh, the bank, the beach, a trunk?). One sheet:
// shots/critters-<tag>-montage.jpg — read that, not the frames. Also prints, per animal: how far it
// came, its state, its height over the ground or the water (floating? sunk?).
//
//   node tools/critter-shots.mjs [--set=handoff|own] [--only=fiddlercrab,alligator] [--tag=x] [--port=5191] [--wait=60]
//
// A set is a list of { kind, q (the page's query: at=… or region=…), date, hour }. `handoff` is
// docs/earth/HANDOFF.md's "walk these places"; `own` the same animals (or --only's) where the game's own
// "go see it" sends you (ui/seeIt.ts whereToSee: its place, month and hour). The camera stands where
// it isn't in a building and nothing walls the line to the animal. Uses the machine's GPU (Playwright
// from ../../shot-harness).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(resolve(ROOT, '../../shot-harness/package.json'))('playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port ?? 5191), TAG = String(args.tag ?? args.set ?? 'handoff'), WAIT = Number(args.wait ?? 60);

const SETS = {
  handoff: [
    { kind: 'laughinggull', q: 'region=shore', date: '2026-07-15', hour: 12 },
    { kind: 'fiddlercrab', q: 'at=31.99,-81.0', date: '2026-07-15', hour: 11 },
    { kind: 'paintedturtle', q: 'region=shore', date: '2026-07-15', hour: 12 },
    { kind: 'greendarner', q: 'region=shore', date: '2026-07-15', hour: 12 },
    { kind: 'monarch', q: 'region=shore', date: '2026-07-15', hour: 12 },
    { kind: 'alligator', q: 'at=31.99,-81.0', date: '2026-07-15', hour: 11 },
    { kind: 'greenanole', q: 'at=31.99,-81.0', date: '2026-07-15', hour: 11 },
    { kind: 'crawfish', q: 'at=29.95,-90.07', date: '2026-07-15', hour: 10 },
    { kind: 'sideblotched', q: 'at=32.22,-110.97', date: '2026-05-15', hour: 10 },
    { kind: 'collaredlizard', q: 'at=32.22,-110.97', date: '2026-05-15', hour: 10 },
    { kind: 'ringbilledgull', q: 'at=41.88,-87.62', date: '2026-07-15', hour: 12 },
    { kind: 'bananaslug', q: 'at=47.6,-122.3', date: '2026-11-10', hour: 15 },
    { kind: 'blackbear', q: 'at=35.6,-82.55', date: '2026-06-15', hour: 7 },
    { kind: 'dolphin', q: 'region=shore', date: '2026-07-15', hour: 10 },
    { kind: 'harborseal', q: 'region=shore', date: '2026-01-20', hour: 12 },
    { kind: 'seaotter', q: 'at=36.62,-121.9', date: '2026-01-15', hour: 12 },
    { kind: 'orca', q: 'at=47.6,-122.43', date: '2026-07-15', hour: 14 },
    { kind: 'beaver', q: 'at=44.0,-73.9', date: '2026-07-15', hour: 19 },
  ],
};
let LIST = SETS[args.set === 'own' ? 'handoff' : args.set ?? 'handoff'] ?? SETS.handoff;
if (args.only) { const want = String(args.only).split(','); LIST = want.map((k) => LIST.find((e) => e.kind === k) ?? { kind: k, q: 'region=shore', date: '2026-07-15', hour: 12 }); }

const portOpen = (port) => new Promise((res) => { const s = net.connect({ port, host: 'localhost' }, () => (s.destroy(), res(true))); s.on('error', () => res(false)); s.setTimeout(400, () => (s.destroy(), res(false))); });
let server = null;
if (!(await portOpen(PORT))) {
  server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 250)); if (await portOpen(PORT)) break; }
}
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio'] });
if (args.set === 'own') {
  // the game's own places for them (a page's modules: any page will do)
  const p = await browser.newPage();
  await p.goto(`http://localhost:${PORT}/?capture=1&region=shore`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const own = await p.evaluate(async (kinds) => { const { whereToSee } = await import('/src/ui/seeIt.ts'); return kinds.map((k) => { const w = whereToSee(k); return w && { kind: k, q: `at=${w.lat},${w.lon}`, date: `2026-${String(w.month).padStart(2, '0')}-15`, hour: w.hour }; }); }, LIST.map((e) => e.kind));
  LIST = own.filter(Boolean);
  await p.close();
}
const t00 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t00) / 1000)).padStart(4)}s]`, ...a);
const shots = [];
for (const e of LIST) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', (er) => errs.push(er.message));
  let res = null;
  try {
    await page.goto(`http://localhost:${PORT}/?capture=1&${e.q}&date=${e.date}&hour=${e.hour}&see=${e.kind}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 300000, polling: 500 });
    res = await page.evaluate(async ({ kind, wait, hour }) => {
      const G = window.__GAME__, C = G.critters, T = G.THREE;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      G.setHour(hour); G.timeParams.speed = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 60000 && G.stream.busy) await sleep(400);
      // its own place and month (the `see` link stood us by its water if it keeps to one): wait for one
      let c = null;
      const find = () => { let best = null; for (const k of C.list) if (k.kind === kind && !k.dead) { const d = Math.hypot(k.x - G.walker.x, k.z - G.walker.z); if (!best || d < best.d) best = { c: k, d }; } return best; };
      for (let s = 0; s < wait * 2 && !(c = find()); s++) await sleep(500);
      if (!c) return { found: false };
      const k = c.c, m = C.meshes?.get?.(kind)?.m;
      m?.geometry?.computeBoundingBox?.();
      const bb = m?.geometry?.boundingBox, size = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * (k.s ?? 1) : 1;
      const ground = G.world.terrain.heightAt(k.x, k.z), water = k.wl ?? null;
      const info = { found: true, dist: Math.round(c.d), state: k.state, y: +k.y.toFixed(2), ground: +ground.toFixed(2), water: water === null ? null : +water.toFixed(2), size: +size.toFixed(2) };
      // frame it: from `back` metres off (beyond what scares it), eye at `up`, looking at its middle;
      // the lens narrowed so it fills about a third of the frame — then wide, from the same spot
      const W = G.scene.children.find((o) => o.name === 'world');
      // the bearing to stand on: toward where we were first, else round it — not in a building, nothing
      // walling the line (a parked car, a wall) but the animal's own few metres
      const W0 = G.walk, b0 = Math.atan2(G.walker.z - k.z, G.walker.x - k.x);
      const clear = (a, back) => {
        const px = k.x + Math.cos(a) * back, pz = k.z + Math.sin(a) * back;
        if (W0.buildingAt(px, pz) >= 0) return false;
        for (let t = 0.15; t <= 1; t += 0.05) { const x = k.x + Math.cos(a) * back * t, z = k.z + Math.sin(a) * back * t; if (back * t > 1.5 && (W0.buildingAt(x, z) >= 0 || W0.blocked(x, z, 0.2))) return false; }
        return true;
      };
      let bear = b0;
      for (const d of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) if (clear(b0 + d, 20)) { bear = b0 + d; break; }
      const frame = (back, up, fov) => {
        const kx = k.x, kz = k.z, ky = k.y + size * 0.35;
        const px = kx + Math.cos(bear) * back, pz = kz + Math.sin(bear) * back;
        const g = Math.max(G.world.terrain.heightAt(px, pz), 0), eye = Math.max(g, k.wl ?? -Infinity) + up;
        G.walkParams.fly = true;
        G.walker.place(px, pz, Math.atan2(px - kx, pz - kz), -Math.atan2(eye - ky, back));
        G.walker.y = eye;
        G.walkParams.fov = fov;
      };
      const back = Math.max(6, size * 8, 14);
      const shot = async (label, back, up, fov) => {
        for (let i = 0; i < 6; i++) { frame(back, up, fov); await sleep(120); } // (it moves: follow it a few frames)
        const cv = document.querySelector('canvas');
        return { label, url: cv.toDataURL('image/jpeg', 0.82) };
      };
      const fov0 = G.walkParams.fov;
      const lens = Math.max(4, Math.min(40, (2 * Math.atan2(size * 1.6, back) * 180) / Math.PI));
      const a = await shot('close', back, Math.max(1.2, size * 0.6), lens);
      const b = await shot('wide', back + 6, 1.7, 55);
      G.walkParams.fov = fov0;
      return { ...info, frames: [a, b] };
    }, { kind: e.kind, wait: WAIT, hour: e.hour });
  } catch (er) {
    res = { found: false, error: String(er.message ?? er).slice(0, 200) };
  }
  log(`${e.kind} @ ${e.q} ${e.date} ${e.hour}h →`, res.found ? `found ${res.dist} m off · ${res.state} · y ${res.y} (ground ${res.ground}${res.water !== null ? `, water ${res.water}` : ''}) · size ${res.size} m` : `NOT FOUND ${res.error ?? ''}`, errs.length ? `· ${errs.length} page errors: ${errs[0].slice(0, 120)}` : '');
  for (const f of res.frames ?? []) shots.push({ label: `${e.kind} · ${f.label} · ${res.state} · y ${res.y}/${res.water ?? res.ground}`, url: f.url });
  if (!res.found) shots.push({ label: `${e.kind} · not found`, url: null });
  await page.close();
}
// the sheet: two frames an animal, side by side, four animals a row
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const b64 = await page.evaluate(async (shots) => {
  const CW = 480, CH = 270, PAD = 22, cols = 4, rows = Math.ceil(shots.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * CW; cv.height = rows * (CH + PAD);
  const c = cv.getContext('2d');
  c.fillStyle = '#f5efe1'; c.fillRect(0, 0, cv.width, cv.height);
  c.font = '14px Georgia, serif'; c.fillStyle = '#3a3346';
  for (let i = 0; i < shots.length; i++) {
    const x = (i % cols) * CW, y = Math.floor(i / cols) * (CH + PAD);
    if (shots[i].url) { const im = new Image(); im.src = shots[i].url; await im.decode(); c.drawImage(im, x, y, CW, CH); }
    c.fillText(shots[i].label.slice(0, 64), x + 6, y + CH + 16);
  }
  return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
}, shots);
mkdirSync(resolve(ROOT, 'shots'), { recursive: true });
const out = resolve(ROOT, 'shots', `critters-${TAG}-montage.jpg`);
writeFileSync(out, Buffer.from(b64, 'base64'));
log(`montage: ${out}`);
await browser.close();
server?.kill();
