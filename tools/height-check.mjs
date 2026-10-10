#!/usr/bin/env node
// Height check: the production build as GitHub Pages serves it, opened headless as a phone or a
// desktop (Playwright device descriptors, like mobile-check.mjs), walked to a place; once the cells
// round it have settled (no build in flight, nothing waiting on a measurement), reads the built
// buildings at probe points — wall top above ground and storeys by the interior planner's own rule
// (interior/plan.ts: max(1, ⌊(top − floor0 + 0.2) ÷ floor height⌋)). Run it on two devices and the
// numbers must match: a phone's buildings stand as tall as a desktop's (docs/agent/streaming.md).
//
//   npm run build && node tools/height-check.mjs --device=pixel7|desktop --at=<lat,lon>
//     --probes=<x,z;x,z…> (local metres, the pack's frame) [--query=measured=0] [--wait=240]
//     [--out=shots/heights-<device>.json]
//
// Prints one line per probe and writes the JSON (the probes, the device's tier, the settled cells).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const load = (p) => { try { return createRequire(p)('playwright'); } catch { return null; } };
const pw = load(resolve(ROOT, '../../shot-harness/package.json')) ?? load(resolve(ROOT, 'package.json')) ?? load(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'package.json'));
if (!pw) { console.error('no playwright (../../shot-harness or global)'); process.exit(1); }
const { chromium, devices } = pw;
const DEV = String(args.device ?? 'pixel7');
const D = { pixel7: devices['Pixel 7'], iphone: devices['iPhone 14'] ?? devices['iPhone 13'], desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } }[DEV];
if (!D) { console.error(`unknown --device=${DEV}`); process.exit(1); }
if (!args.at || !args.probes) { console.error('--at=<lat,lon> and --probes=<x,z;x,z…> are required'); process.exit(1); }
const PROBES = String(args.probes).split(';').map((s) => s.split(',').map(Number));
const DIST = resolve(ROOT, String(args.dist ?? 'dist'));
if (!existsSync(join(DIST, 'index.html'))) { console.error(`no ${DIST}/index.html — npm run build first`); process.exit(1); }
const PORT = Number(args.port ?? 4191), WAIT = Number(args.wait ?? 240);

// ---- a GitHub-Pages-like server: /Map_Game/…, plain types, no isolation headers ----
const TYPES = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/Map_Game/')) { res.writeHead(404); res.end(); return; }
  let p = decodeURIComponent(u.pathname.slice('/Map_Game'.length));
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(DIST, p));
  if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT, '127.0.0.1');

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ ...D });
await ctx.addInitScript(() => { Element.prototype.requestPointerLock = undefined; });
const page = await ctx.newPage();
const errors = [], notes = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
const q = `watchdog=180&poc=0&at=${args.at}${args.query ? `&${args.query}` : ''}`; // (the old start: walked to the place, not woken in the van)
await page.goto(`http://127.0.0.1:${PORT}/Map_Game/?${q}`, { waitUntil: 'domcontentloaded' });
const boot = await page.waitForFunction(() => {
  const b = document.getElementById('start'), f = document.getElementById('fatal');
  return (b && !b.disabled) || (f && !f.classList.contains('hidden')) ? { ok: !!b && !b.disabled } : false;
}, null, { timeout: 300000, polling: 1000 }).then((h) => h.jsonValue(), () => ({ ok: false }));
if (!boot.ok) { log('boot failed'); await browser.close(); server.close(); process.exit(1); }
await page.evaluate(() => document.getElementById('start').click());

// Every probe's building, once its cell is mounted and settled (not flat: no measurement on the way).
const READ = (probes) => {
  const S = window.__GAME__?.stream;
  if (!S) return null;
  const inRing = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
  const fH = (k) => (k === 'commercial' ? 3.8 : k === 'large' ? 3.1 : 2.9);
  const busy = S.fetching?.size ?? 0;
  const out = probes.map(([x, z]) => {
    for (const [id, L] of S.loaded) {
      const b = L.spec.box;
      if (x < b.x0 || x >= b.x1 || z < b.z0 || z >= b.z1) continue;
      const fp = L.fps.find((f) => inRing(x, z, f.ring));
      if (!fp) return { x, z, cell: id, flat: L.flat, none: true };
      const storeys = fp.kind === 'church' ? 1 : Math.max(1, Math.floor((fp.top - fp.floor0 + 0.2) / fH(fp.kind)));
      return { x, z, cell: id, flat: L.flat, kind: fp.kind, wall: +(fp.top - fp.base).toFixed(2), floor0: +(fp.floor0 - fp.base).toFixed(2), storeys, pitched: !!fp.pitched };
    }
    return { x, z, cell: null };
  });
  // the ring's detail tiles: how many, and their vertex data (a phone's budget: world/budget.ts)
  return { busy, out, tier: window.__TIER__?.tier, tiles: S.loaded.size, detailMB: +(S.detailBytes / 1048576).toFixed(1), budgetMB: window.__GAME__.streamParams?.budgetMB ?? 0 };
};
let R = null;
const until = Date.now() + WAIT * 1000;
for (;;) {
  R = await page.evaluate(READ, PROBES).catch(() => null);
  const ok = R && !R.busy && R.out.every((p) => p.cell && !p.flat);
  if (ok || Date.now() > until) break;
  await page.waitForTimeout(3000);
}
const settled = !!R && !R.busy && R.out.every((p) => p.cell && !p.flat);
// (the tile worker's notes: which cells the survey was read for, here or not at all)
const wlog = await page.evaluate(() => [...(window.__GAME__?.stream?.workerLog ?? [])]).catch(() => []);
notes.push(...wlog.filter((t) => /lidar|measured/i.test(t)));
log(`${DEV} (${R?.tier}) ${settled ? 'settled' : 'NOT settled'} · ${args.query ?? ''}`);
for (const p of R?.out ?? []) log(`  (${p.x}, ${p.z}) ${p.cell ?? '—'}${p.flat ? ' flat' : ''} ${p.none ? 'no building' : `${p.kind} wall ${p.wall} m, floor ${p.floor0} m, ${p.storeys} storey${p.storeys > 1 ? 's' : ''}${p.pitched ? ', pitched' : ''}`}`);
log(`  ${notes.filter((t) => /reading for/.test(t)).length} cells read from the survey in this browser · ${R?.tiles} detail tiles, ${R?.detailMB} MB of vertex data (budget ${R?.budgetMB || 'none'})`);
for (const e of errors.slice(0, 4)) log('  page error', e);
const out = resolve(ROOT, String(args.out ?? `shots/heights-${DEV}${args.query ? '-' + String(args.query).replace(/[^\w]+/g, '_') : ''}.json`));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ device: DEV, at: args.at, query: args.query ?? '', settled, ...R, errors, notes: notes.slice(-40) }, null, 1));
log('wrote', out);
await browser.close();
server.close();
process.exit(settled && !errors.length ? 0 : 1);
