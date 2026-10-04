#!/usr/bin/env node
// The lower-48 load audit (docs/GAMEPLAY_VISION.md §17, docs/agent/debugging.md): every town of
// tools/audit48-towns.json opened by `?at=` on the dev server, against the deployed tile service
// (or a local `wrangler dev`), with the machine's GPU, as a desktop and as a phone (Pixel 7
// emulation, the phone tier). Per town and device: what loaded, land or water, the buildings and
// their heights, the trees, frame times, errors (tools/audit48.js). One montage per town —
// the desktop's frames over the phone's — in shots/audit48/<town>-montage.jpg, and the numbers in
// shots/audit48/audit.json + a table in shots/audit48/summary.md.
//
//   node tools/audit48.mjs [--towns=shrewsbury-nj,tucson-az] [--devices=desktop,phone]
//     [--realWait=240] [--port=5191] [--query=tiles=direct] [--headed]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(resolve(ROOT, '../../shot-harness/package.json'));
const { chromium, devices } = req('playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port ?? 5191);
const LIST = JSON.parse(readFileSync(resolve(ROOT, 'tools/audit48-towns.json'), 'utf8')).towns;
const want = args.towns ? String(args.towns).split(',') : null;
const TOWNS = want ? LIST.filter((t) => want.includes(t.id)) : LIST;
const DEVICES = String(args.devices ?? 'desktop,phone').split(',');
const OUT = resolve(ROOT, 'shots/audit48');
mkdirSync(OUT, { recursive: true });
const t00 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t00) / 1000).toFixed(0).padStart(5)}s]`, ...a);

const portOpen = (port) => new Promise((res) => {
  const s = net.connect({ port, host: 'localhost' }, () => (s.destroy(), res(true)));
  s.on('error', () => res(false));
  s.setTimeout(400, () => (s.destroy(), res(false)));
});
let server = null;
if (!args['table-only'] && !(await portOpen(PORT))) {
  server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 250)); if (await portOpen(PORT)) break; }
}
const browser = await chromium.launch({
  headless: !args.headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--force-color-profile=srgb', '--mute-audio', '--disable-frame-rate-limit'],
});
const CTX = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  phone: { ...devices['Pixel 7'] },
};
const NOISE = /X3595|favicon|Download the React|\[vite\]/;

async function one(town, dev) {
  const ctx = await browser.newContext(CTX[dev]);
  await ctx.addInitScript(() => { Element.prototype.requestPointerLock = undefined; });
  const page = await ctx.newPage();
  const errors = [], warnings = [], failed = {};
  page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e.message ?? e).slice(0, 300)}`));
  page.on('console', (m) => {
    const t = m.text();
    if (NOISE.test(t)) return;
    if (m.type() === 'error') errors.push(t.slice(0, 300));
    else if (m.type() === 'warning') warnings.push(t.slice(0, 300));
  });
  page.on('requestfailed', (r) => { const h = new URL(r.url()).host; failed[h] = (failed[h] ?? 0) + 1; });
  page.on('response', (r) => { if (r.status() >= 400) { const h = `${new URL(r.url()).host} ${r.status()}`; failed[h] = (failed[h] ?? 0) + 1; } });
  const q = `capture=1&at=${town.at[0]},${town.at[1]}${dev === 'phone' ? '&quality=phone' : ''}${args.query ? `&${args.query}` : ''}`;
  const t0 = Date.now();
  let res = null, boot = null;
  try {
    await page.goto(`http://localhost:${PORT}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    boot = await page.waitForFunction(() => {
      if (window.__READY__ === true) return { ok: true };
      const f = document.getElementById('fatal');
      return f && !f.classList.contains('hidden') ? { ok: false, report: f.innerText.slice(0, 1500) } : false;
    }, null, { timeout: 240000, polling: 500 }).then((h) => h.jsonValue(), (e) => ({ ok: false, report: `not ready: ${e.message}` }));
    const readyS = (Date.now() - t0) / 1000;
    if (!boot.ok) throw new Error(`boot: ${boot.report}`);
    const gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
    await page.evaluate(() => import('/tools/audit48.js'));
    res = await page.evaluate(({ tag, realWait }) => window.__AUDIT__(tag, { realWait }), { tag: `${town.id}-${dev}`, realWait: Number(args.realWait ?? 240) });
    res.readyS = +readyS.toFixed(1);
    res.gpu = gpu;
    if (res.sheet) {
      writeFileSync(resolve(OUT, `${town.id}-${dev}.jpg`), Buffer.from(res.sheet.split(',')[1], 'base64'));
      res.sheetFile = `shots/audit48/${town.id}-${dev}.jpg`;
    }
  } catch (e) {
    res = { ...(res ?? {}), fatal: String(e.message ?? e).slice(0, 1500) };
  }
  const sheet = res?.sheet ?? null;
  if (res) delete res.sheet;
  await ctx.close().catch(() => {});
  return { ...res, device: dev, errors: [...new Set(errors)].slice(0, 20), warnings: [...new Set(warnings)].slice(0, 12), failedRequests: failed, wallS: Math.round((Date.now() - t0) / 1000), _sheet: sheet };
}

// one montage per town: a title, the desktop's sheet, the phone's beside it
async function montage(town, runs) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const items = runs.filter((r) => r._sheet).map((r) => ({ label: r.device, src: r._sheet }));
  const title = `${town.name} (${town.kind}) · ${town.at.join(', ')} · ${runs.map((r) => `${r.device}: ${r.fatal ? 'FAILED' : `${r.ring?.real ?? 0}/${r.ring?.cells ?? 0} real, ${r.ring?.stand ?? 0} stand-in, ${r.ring?.failed ?? 0} failed · ${r.buildings?.n ?? 0} bldgs · ${r.trees?.n ?? 0} trees · water ${r.ground?.waterShare ?? '?'}% · p50 ${r.frames?.stand?.p50 ?? '?'} ms`}`).join('  |  ')}`;
  const b64 = await page.evaluate(async ({ items, title }) => {
    const imgs = [];
    for (const it of items) { const im = new Image(); im.src = it.src; await im.decode(); imgs.push(im); }
    // side by side, scaled to one height
    const H = Math.max(...imgs.map((i) => i.height), 200);
    const ws = imgs.map((i) => Math.round((i.width * H) / i.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1200, ws.reduce((a, b) => a + b, 0) + 20 * Math.max(0, imgs.length - 1));
    cv.height = H + 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#f5efe1'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#3a3346'; c.font = 'bold 18px Georgia, serif';
    c.fillText(title.slice(0, 230), 10, 24);
    let x = 0;
    imgs.forEach((im, i) => { c.drawImage(im, x, 40, ws[i], H); c.font = '15px Georgia, serif'; c.fillText(items[i].label, x + 8, 58 + H - 4 > cv.height ? cv.height - 6 : 36 + 18); x += ws[i] + 20; });
    return cv.toDataURL('image/jpeg', 0.78).split(',')[1];
  }, { items, title });
  writeFileSync(resolve(OUT, `${town.id}-montage.jpg`), Buffer.from(b64, 'base64'));
  await page.close();
}

const prev = existsSync(resolve(OUT, 'audit.json')) ? JSON.parse(readFileSync(resolve(OUT, 'audit.json'), 'utf8')) : { towns: {} };
// (--table-only: rewrite summary.md from audit.json, nothing run)
for (const town of args['table-only'] ? [] : TOWNS) {
  const runs = [];
  for (const dev of DEVICES) {
    log(`${town.id} · ${dev} …`);
    const r = await one(town, dev);
    runs.push(r);
    log(`  ${r.fatal ? 'FATAL ' + r.fatal.slice(0, 200) : `ready ${r.readyS}s, settled ${r.loadS}s · ring ${JSON.stringify({ real: r.ring.real, baked: r.ring.baked, vec: r.ring.vec, stand: r.ring.stand, failed: r.ring.failed, pending: r.ring.pending, twin: r.ring.twin, synth: r.ring.synth, first: r.ring.firstRealS })} · ${r.buildings.n} bldgs (median ${r.buildings.medianH} m, ${r.buildings.twoPlus}% 2+) · ${r.trees.n} trees · water ${r.ground.waterShare}%${r.ground.spawnWater ? ' (SPAWN IN WATER)' : ''} · frames p50 ${r.frames.stand.p50}/${r.frames.turn.p50} p95 ${r.frames.stand.p95}/${r.frames.turn.p95} ms · ${r.errors.length} errors`}`);
  }
  await montage(town, runs).catch((e) => log('  montage failed', e.message));
  prev.towns[town.id] = { name: town.name, kind: town.kind, at: town.at, when: new Date().toISOString(), runs: runs.map(({ _sheet, ...r }) => r) };
  writeFileSync(resolve(OUT, 'audit.json'), JSON.stringify(prev, null, 1));
}

// the table, every town audited so far
const rows = [];
for (const [id, t] of Object.entries(prev.towns))
  for (const r of t.runs) {
    if (r.fatal) { rows.push(`| ${t.name} | ${t.kind} | ${r.device} | **failed**: ${r.fatal.slice(0, 120).replace(/\|/g, '/')} | | | | | | |`); continue; }
    const left = r.ring.stand + r.ring.failed + r.ring.pending;
    const ring = `${r.ring.real + r.ring.baked}${r.ring.vec ? `+${r.ring.vec}v` : ''} / ${r.ring.cells}${r.ring.baked ? ` (${r.ring.baked} baked)` : ''}${left ? ` · ${left} still stand-ins (${r.ring.twin ?? '?'} vector twin, ${r.ring.synth ?? '?'} procedural; ${r.ring.pending} pending, ${r.ring.failed} failed)` : ''}`;
    rows.push(`| ${t.name} | ${t.kind} | ${r.device} (${r.tier}) | ${ring}${r.ring.allRealS != null ? ` · all real in ${r.ring.allRealS} s` : ''} | ${r.ground.waterShare}%${r.ground.spawnWater ? ' **spawn in water**' : ''}${r.ground.spawnInside ? ' **spawn inside a building**' : ''} | ${r.buildings.n} · ${r.buildings.medianH} m median · ${r.buildings.twoPlus}% 2+ storeys · max ${r.buildings.maxH} m | ${r.trees.n} | ${r.frames.stand.p50} / ${r.frames.stand.p95} / ${r.frames.turn.p95} | ${r.readyS} + ${r.loadS} s | ${r.errors.length}${r.worker?.errors?.length ? ` + ${r.worker.errors.length} worker` : ''} |`);
  }
writeFileSync(resolve(OUT, 'summary.md'), [
  '| Town | Kind | Device (tier) | Ring: real + vector twin / cells | Water in 1.2 km square | Buildings | Trees | Frames ms (p50 / p95 standing / p95 turning) | Ready + settled | Errors |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
].join('\n') + '\n');
log('wrote shots/audit48/summary.md, audit.json and the montages');
if (server) server.kill();
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
process.exit(0);
