#!/usr/bin/env node
// The real-world comparison loop (docs/GAMEPLAY_VISION.md §17 "how the agent checks looks right";
// feature real-world-comparison, Tier 1 #1): for each spot of tools/real-spots.json, the Mapillary
// street photo against the game rendered from the same place, height, heading and lens, at the
// photo's date and hour; side by side, one montage per state, each pair scored by what share of the
// view is sky, buildings, vegetation, ground, water and vehicles in each (the photo's from Mapillary's
// own segmentation, the game's from a class pass: tools/class-pass.js). The scores go to
// tools/real-scores.json (in the repo) so a change shows whether the lower 48 got more like itself.
//
//   node tools/real-compare.mjs [--states=NJ,NY] [--ids=a,b] [--port=5199] [--wait=150] [--tag=<run name>]
//
// Photos are fetched into raw/mapillary/ (git-ignored) and never shipped; every sheet credits them
// (CC BY-SA 4.0, © the Mapillary contributor named under each). Development use only (DATA_SOURCES §0).
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
// (the git-ignored .env when there is one; else the environment — a cloud session's settings)
const env = Object.fromEntries((existsSync(resolve(ROOT, '.env')) ? readFileSync(resolve(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).filter((l) => /=/.test(l) && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const TOKEN = env.ACCESS_TOKEN ?? process.env.ACCESS_TOKEN;
if (!TOKEN?.startsWith('MLY|')) { console.error('ACCESS_TOKEN (a Mapillary client token) is missing: set it in .env or the environment'); process.exit(1); }
const H = { headers: { Authorization: `OAuth ${TOKEN}` } };
const CACHE = resolve(ROOT, 'raw/mapillary');
mkdirSync(CACHE, { recursive: true });
const SHOTS = resolve(ROOT, 'shots/real');
mkdirSync(SHOTS, { recursive: true });
const PORT = Number(args.port ?? 5199), WAIT = Number(args.wait ?? 150);
const t00 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t00) / 1000).toFixed(0).padStart(5)}s]`, ...a);

const { runnerImport } = await import('vite');
const load = async (p) => (await runnerImport(resolve(ROOT, p), { configFile: false, logLevel: 'error' })).module;
const MVT = await load('src/world/mvt.ts');
const TZ = await load('src/world/tz.ts');

// ---- the spots ----
const spots = JSON.parse(readFileSync(resolve(ROOT, 'tools/real-spots.json'), 'utf8')).spots.filter((s) => s.img)
  .filter((s) => !args.states || String(args.states).split(',').includes(s.state))
  .filter((s) => !args.ids || String(args.ids).split(',').includes(s.id))
  .filter((s) => !args.kind || s.kind === args.kind); // (--kind=green: the green spots only)
if (!spots.length) { console.error('no spots (tools/real-spots.mjs first)'); process.exit(1); }

// ---- a photo and its segmentation, cached ----
async function photo(id) {
  const jpg = resolve(CACHE, `${id}.jpg`), det = resolve(CACHE, `${id}.det.json`);
  if (!existsSync(jpg)) {
    const e = await (await fetch(`https://graph.mapillary.com/${id}?fields=thumb_1024_url`, H)).json();
    if (!e.thumb_1024_url) throw new Error(`no image url for ${id}`);
    writeFileSync(jpg, Buffer.from(await (await fetch(e.thumb_1024_url)).arrayBuffer()));
  }
  if (!existsSync(det)) {
    const d = await (await fetch(`https://graph.mapillary.com/${id}/detections?fields=value,geometry&limit=2000`, H)).json();
    writeFileSync(det, JSON.stringify(d.data ?? []));
  }
  return { jpg: readFileSync(jpg), det: JSON.parse(readFileSync(det, 'utf8')) };
}
// Mapillary's classes → ours (the ego vehicle and the unlabelled are left out of both shares)
const CLASSES = ['sky', 'building', 'vegetation', 'ground', 'water', 'vehicle', 'other'];
const classOfValue = (v) => {
  if (v === 'nature--sky') return 'sky';
  if (v === 'nature--vegetation') return 'vegetation';
  if (/^construction--structure--(building|bridge|tunnel)/.test(v)) return 'building';
  if (/^(construction--flat--|nature--(terrain|sand|snow|beach)|void--ground|marking--)/.test(v)) return 'ground';
  if (v === 'nature--water') return 'water';
  if (/^object--vehicle--/.test(v)) return 'vehicle';
  if (/^void--(ego-vehicle|unlabeled|car-mount|dynamic)$/.test(v)) return null;
  return 'other';
};
// paint order: the big classes first, then what stands in front of them
const ORDER = ['sky', 'ground', 'water', 'building', 'vegetation', 'other', 'vehicle'];
function photoShares(det, w, h) {
  const GW = 160, GH = Math.max(1, Math.round((160 * h) / w));
  const grid = new Int8Array(GW * GH).fill(-1); // -1: nothing said; −2: left out
  const polys = det.map((d) => ({ cls: classOfValue(d.value), rings: (() => { try { const L = MVT.readMvt(Buffer.from(d.geometry, 'base64'))[0]; return L ? L.features.flatMap((f) => f.rings.map((r) => r.map(([x, y]) => [x / L.extent, y / L.extent]))) : []; } catch { return []; } })() }));
  const fill = (rings, code) => {
    for (let gy = 0; gy < GH; gy++) {
      const v = (gy + 0.5) / GH;
      for (let gx = 0; gx < GW; gx++) {
        const u = (gx + 0.5) / GW;
        let ins = false;
        for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > v !== r[j][1] > v && u < ((r[j][0] - r[i][0]) * (v - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
        if (ins) grid[gy * GW + gx] = code;
      }
    }
  };
  for (const p of polys) if (p.cls === null) fill(p.rings, -2);
  for (const c of ORDER) for (const p of polys) if (p.cls === c) fill(p.rings, CLASSES.indexOf(c));
  const count = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  let n = 0;
  for (const g of grid) { if (g < 0) continue; count[CLASSES[g]]++; n++; }
  return { shares: Object.fromEntries(CLASSES.map((c) => [c, n ? Math.round((count[c] / n) * 1000) / 1000 : 0])), labelled: Math.round((n / grid.length) * 1000) / 1000 };
}
/** A photo Mapillary only found objects in (poles, signs, lamps — no sky, street or walls segmented)
 *  says nothing of the view's mix: its every labelled patch is 'other'. Shown, not scored. */
const segmented = (ps) => ps.shares.other < 0.9 && ps.labelled >= 0.3;
/** 1 − the total variation between two class mixes: 1 identical, 0 nothing in common. */
const score = (a, b) => Math.round((1 - 0.5 * CLASSES.reduce((s, c) => s + Math.abs((a[c] ?? 0) - (b[c] ?? 0)), 0)) * 1000) / 1000;

// ---- the game, from the same spot ----
const portOpen = (port) => new Promise((res) => { const s = net.connect({ port, host: 'localhost' }, () => (s.destroy(), res(true))); s.on('error', () => res(false)); s.setTimeout(400, () => (s.destroy(), res(false))); });
let server = null;
if (!(await portOpen(PORT))) {
  server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 250)); if (await portOpen(PORT)) break; }
}
const req = createRequire(resolve(ROOT, '../../shot-harness/package.json'));
const { chromium } = req('playwright');
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--force-color-profile=srgb', '--mute-audio'] });

async function render(s) {
  const img = s.img, aspect = img.w / img.h, W = 1024, Hh = Math.round(W / aspect);
  const zone = TZ.zoneAt(img.lat, img.lon);
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(img.captured));
  const part = (t) => local.find((p) => p.type === t)?.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`, hour = +part('hour') % 24 + +part('minute') / 60;
  const ctx = await browser.newContext({ viewport: { width: W, height: Hh }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { Element.prototype.requestPointerLock = undefined; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e).slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?capture=1&at=${img.lat},${img.lon}&date=${date}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 240000 });
  const out = await page.evaluate(async ({ img, hour, wait }) => {
    const G = window.__GAME__, S = G.stream, T = G.world.terrain;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // the place's own cells, real (not stand-ins), and the stream at rest
    const [x, z] = [G.at[0], G.at[1]];
    const key = `${Math.floor(x / 1024)}_${Math.floor(z / 1024)}`;
    const t0 = performance.now();
    for (let i = 0; i < wait; i++) {
      const real = S.loaded.has('w' + key) || S.loaded.has(key);
      // (and no cell round the lens still owed its relief — the LiDAR record's trees, the roof colours:
      // queued behind the ring's first builds, they landed after the shot and green-1 measured bare streets)
      const late = [...S.loaded.values()].some((a) => a.flat && Math.hypot((a.spec.box.x0 + a.spec.box.x1) / 2 - x, (a.spec.box.z0 + a.spec.box.z1) / 2 - z) < 1100);
      if (real && !late && !S.worldPending && !S.fetching?.size && !S.buildQueue?.length && i > 4) break;
      await sleep(1000);
    }
    const cell = S.loaded.get('w' + key) ? (S.loaded.get('w' + key).vec ? 'twin' : 'real') : S.loaded.has(key) ? 'baked' : S.loaded.get('s' + key)?.vec ? 'twin' : 'stand-in';
    G.setHour(hour); G.timeParams.speed = 0;
    G.walkParams.fov = img.vfov; // (the lens: the photo's own, vertically — the window is its shape)
    G.walkParams.fly = true;
    const ground = T.heightAt(x, z);
    // (a compass bearing, clockwise from north → the game's yaw; the photo's own pitch: a dash camera tilts)
    G.walker.place(x, z, -img.heading * Math.PI / 180, ((img.pitch ?? 0) * Math.PI) / 180);
    G.walker.y = ground + 2.0; // (Mapillary's cameras ride a car's roof or a walker's hand: 2 m)
    // (not Mapillary's computed altitude: national-1 lifted 15 of 83 lenses by it, Oklahoma City's 47 m and
    // Belvedere's 23 m over photos plainly taken from the street — it's metres-noisy)
    let lift = 0;
    // (a photo whose place is inside a mapped building was taken from on top of it — a car park's top
    // deck, a roof terrace: Bangor's looks out over a lot from one — the lens stands on its roof)
    const pin = (r, px, pz) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > pz !== r[j][1] > pz && px < ((r[j][0] - r[i][0]) * (pz - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
    const under = (G.stream.footprints ?? []).find((f) => pin(f.ring, x, z));
    if (under && under.top + 1.6 > ground + 2 + lift) lift = under.top + 1.6 - ground;
    if (lift) G.walker.y = ground + lift;
    for (let i = 0; i < 50; i++) await new Promise((r) => requestAnimationFrame(r));
    const { classPass } = await import('/tools/class-pass.js');
    const cls = classPass(G, { W: 256 });
    return { cell, secs: Math.round((performance.now() - t0) / 1000), water: T.sdfAt(x, z) < 0, cls, lift: Math.round(lift) };
  }, { img, hour, wait: WAIT });
  const shot = await page.screenshot({ type: 'jpeg', quality: 85 });
  await ctx.close();
  return { ...out, shot, date, hour: +hour.toFixed(2), errors };
}

// ---- run, one state at a time; a montage per state ----
const scoresFile = resolve(ROOT, 'tools/real-scores.json');
const history = existsSync(scoresFile) ? JSON.parse(readFileSync(scoresFile, 'utf8')) : { note: 'tools/real-compare.mjs: per spot, 1 − the total variation between the photo\'s class mix and the game\'s (1 = the same mix of sky, buildings, vegetation, ground, water, vehicles). One entry a run.', runs: [] };
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; } })();
const run = { at: new Date().toISOString(), commit, tag: args.tag ?? '', spots: {} };
const byState = new Map();
// (one montage a state; `--group=region`: a region's, for the green spots)
for (const s of spots) { const k = args.group === 'region' ? s.region ?? s.state : s.state; if (!byState.has(k)) byState.set(k, []); byState.get(k).push(s); }
for (const [st, list] of byState) {
  const pairs = [];
  for (const s of list) {
    try {
      const p = await photo(s.img.id);
      const ps = photoShares(p.det, s.img.w, s.img.h);
      const g = await render(s);
      const unfit = s.img.unfit ?? (segmented(ps) ? null : 'not segmented');
      const sc = unfit ? null : score(ps.shares, g.cls);
      run.spots[s.id] = { score: sc, ...(unfit ? { unscored: unfit } : {}), photo: ps.shares, labelled: ps.labelled, game: g.cls, cell: g.cell, water: g.water, date: g.date, hour: g.hour };
      pairs.push({ s, sc, ps, g, photo: p.jpg.toString('base64'), game: g.shot.toString('base64') });
      log(`${s.id} ${s.town}: score ${sc ?? `n/a (${unfit})`} · cell ${g.cell}${g.lift ? ` · lens ${g.lift} m up (on the roof it stands in)` : ''}${g.water ? ' (WATER under the lens)' : ''} · photo ${JSON.stringify(ps.shares)} · game ${JSON.stringify(g.cls)}${g.errors.length ? ` · ${g.errors.length} page errors` : ''}`);
    } catch (e) { log(`${s.id}: failed — ${e.message}`); run.spots[s.id] = { error: String(e.message).slice(0, 200) }; }
  }
  if (!pairs.length) continue;
  // the sheet: each pair a row (the photo, then the game), labelled, the credits along the bottom
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const sheet = await page.evaluate(async ({ pairs, st }) => {
    const CW = 520, CH = 293, PAD = 54;
    const cv = document.createElement('canvas');
    cv.width = CW * 2 + 30; cv.height = pairs.length * (CH + PAD) + 70;
    const c = cv.getContext('2d');
    c.fillStyle = '#f5efe1'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#3a3346'; c.font = 'bold 18px Georgia'; c.fillText(`${st} — Mapillary photo (left) and the game from the same spot, lens, date and hour (right)`, 10, 24);
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i], y = 40 + i * (CH + PAD);
      for (const [k, x] of [['photo', 0], ['game', CW + 30]]) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + p[k]; await im.decode(); const r = Math.min(CW / im.width, CH / im.height); c.drawImage(im, x, y, im.width * r, im.height * r); }
      c.fillStyle = '#3a3346'; c.font = '14px Georgia';
      c.fillText(`${p.s.town} (${p.s.kind}) · score ${p.sc ?? `n/a (the photo: ${p.s.img.unfit ?? 'not segmented'})`} · cell ${p.g.cell} · ${p.g.date} ${p.g.hour.toFixed(1)} h · ${p.s.img.hfov}° lens`, 8, y + CH + 17);
      const fmt = (o) => Object.entries(o).filter(([, v]) => v >= 0.01).map(([k, v]) => `${k} ${Math.round(v * 100)}`).join(' · ');
      c.font = '12px Georgia';
      c.fillText(`photo: ${fmt(p.ps.shares)}   |   game: ${fmt(p.g.cls)}   ·   photo © ${p.s.img.by || 'a contributor'} / Mapillary, CC BY-SA 4.0, image ${p.s.img.id}`, 8, y + CH + 34);
    }
    c.font = '12px Georgia';
    c.fillText('Street photos: Mapillary contributors, CC BY-SA 4.0 (mapillary.com) — development comparison only, never shipped.', 10, cv.height - 12);
    return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, { pairs, st });
  writeFileSync(resolve(SHOTS, `${st}-montage.jpg`), Buffer.from(sheet, 'base64'));
  await page.close();
  const scored = pairs.filter((p) => p.sc !== null);
  log(`${st}: shots/real/${st}-montage.jpg · mean score ${scored.length ? (scored.reduce((a, p) => a + p.sc, 0) / scored.length).toFixed(3) : 'n/a'} (${scored.length} of ${pairs.length} scored)`);
}
history.runs.push(run);
writeFileSync(scoresFile, JSON.stringify(history, null, 1));
const all = Object.values(run.spots).filter((x) => x.score != null);
log(`${all.length} spots, mean ${(all.reduce((a, x) => a + x.score, 0) / Math.max(1, all.length)).toFixed(3)} → tools/real-scores.json`);
if (server) server.kill();
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
process.exit(0);
