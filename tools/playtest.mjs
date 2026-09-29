#!/usr/bin/env node
// Gameplay playtest, headless (or --headed): opens the game on ?capture=1, clicks "Begin walking" if
// the intro is up, waits for window.__READY__, imports tools/playtest.js and runs __PLAYTEST__ —
// footprint overlaps, doors, posts in the road, flicker, altitude, frame pacing, a seeded walk, a
// drive, teleports, streaming (and with --selftest each check against failures planted for it).
// Prints a readable report, then the report as JSON; writes it to shots/playtest-<place>.json.
// Exit code: 0 all passed, 1 a check failed (or the page threw), 2 it couldn't run.
//
//   node tools/playtest.mjs [--url=http://localhost:5173/] [--at=lat,lon | --region=<id>] [--query=k=v&…]
//     [--only=doors,walkabout,…] [--skip=altitude,…] [--quick] [--selftest] [--seconds=N] [--seed=N]
//     [--opts='{"doors":{"max":300}}'] [--budget=desktop|phone|soft] [--swiftshader] [--headed]
//     [--w=1280 --h=720] [--ready=400] [--no-server] [--out=shots/x.json] [--json-only]
//
// Playwright: the project's own (`playwright` or `@playwright/test`), else ../../shot-harness (like
// capture.mjs), else a global install, else --playwright=<dir>. None: it says what to install.
// The GPU: headless Chromium uses the machine's GPU where it can; --swiftshader forces software GL
// (a frame every few seconds: the frame budget turns to `soft` by itself, and a full run takes many
// minutes). A localhost --url that doesn't answer gets vite started on its port, and stopped after.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { formatReport, verdictLine } from './playtest-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (args.help || args.h === true) {
  console.log(usage());
  process.exit(0);
}

// ---- Playwright: `playwright` or `@playwright/test`, from the first place that has one ----
const tryLoad = (from) => {
  for (const name of ['playwright', '@playwright/test']) {
    try { const m = createRequire(from)(name); if (m?.chromium) return { pw: m, name, from }; } catch { /* next */ }
  }
  return null;
};
const globalRoot = () => { try { return execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const places = [
  args.playwright && resolve(String(args.playwright), 'package.json'),
  resolve(ROOT, 'package.json'),
  resolve(ROOT, '../../shot-harness/package.json'),
  globalRoot() && join(globalRoot(), '..', 'package.json'),
].filter(Boolean);
let found = null;
for (const p of places) if ((found = tryLoad(p))) break;
if (!found) {
  console.error('playtest: no Playwright here. Install it in the project:');
  console.error('  npm i -D playwright && npx playwright install chromium');
  console.error('(or @playwright/test; or point --playwright=<dir> at a folder where it is installed)');
  process.exit(2);
}
const { chromium } = found.pw;

// ---- the page ----
const URL0 = String(args.url ?? 'http://localhost:5173').replace(/\/+$/, '');
const u = new URL(URL0);
const soft = !!args.swiftshader;
const W = Number(args.w ?? (soft ? 960 : 1280)), H = Number(args.h ?? (soft ? 540 : 720)), READY = Number(args.ready ?? 400);
const glFlags = soft ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'] : ['--enable-gpu', '--enable-webgl'];

// ---- the dev server: vite on a localhost URL nobody answers ----
const portOpen = (port, host) => new Promise((res) => {
  const s = net.connect({ port, host }, () => (s.destroy(), res(true)));
  s.on('error', () => res(false));
  s.setTimeout(600, () => (s.destroy(), res(false)));
});
let server = null;
const local = ['localhost', '127.0.0.1'].includes(u.hostname), port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
if (local && !(await portOpen(port, u.hostname)) && !args['no-server']) {
  const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) { console.error(`playtest: nothing answers ${URL0}, and there's no vite to start (npm install, or --url)`); process.exit(2); }
  console.log(`starting vite on :${port} …`);
  server = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 160 && !(await portOpen(port, u.hostname)); i++) await new Promise((r) => setTimeout(r, 250));
}

// ---- what to run ----
const opts = {};
if (args.opts) {
  try { Object.assign(opts, JSON.parse(String(args.opts))); } catch (e) { console.error(`playtest: --opts isn't JSON: ${e.message}`); process.exit(2); }
}
if (args.only) opts.only = String(args.only);
if (args.skip) opts.skip = String(args.skip);
if (args.quick) opts.quick = true;
if (args.selftest) opts.selftest = true;
if (args.seed) opts.seed = Number(args.seed);
if (args.seconds) opts.seconds = Number(args.seconds);
if (args.budget) opts.frames = { ...(typeof opts.frames === 'object' ? opts.frames : {}), budget: String(args.budget) };
const query = [
  'capture=1',
  args.at ? `at=${String(args.at).replace(/\s/g, '')}` : '',
  args.region ? `region=${args.region}` : '',
  args.query ? String(args.query).replace(/^[?&]/, '') : '',
].filter(Boolean).join('&');
const place = args.at ? `at_${String(args.at).replace(/[^\d.,-]/g, '').replace(',', '_')}` : args.region ? String(args.region) : null;

let browser;
try {
  browser = await chromium.launch({
    headless: !args.headed,
    args: ['--ignore-gpu-blocklist', '--mute-audio', '--force-device-scale-factor=1', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...glFlags],
  });
} catch (e) {
  const msg = String(e?.message ?? e);
  console.error(`playtest: Chromium didn't start (${msg.split('\n')[0]})`);
  if (/Executable doesn't exist|install/i.test(msg)) console.error(`  install its browser: npx playwright install chromium   (Playwright from ${dirname(found.from)})`);
  server?.kill();
  process.exit(2);
}
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// Headless Chromium, once it grants pointer lock, sends a mousemove every frame and its renderer
// grows until it's killed (debugging.md): the game never needs the lock here.
await ctx.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
const page = await ctx.newPage();
const PLANTED = 'playtest-planted'; // (errors the self-tests throw on purpose)
const pageErrors = [], t0 = Date.now();
const stamp = () => `${String(Math.round((Date.now() - t0) / 1000)).padStart(4)} s`;
page.on('pageerror', (e) => { const m = String(e?.message ?? e); if (!m.includes(PLANTED)) pageErrors.push(`[pageerror] ${m.slice(0, 300)}`); });
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'info' && t.startsWith('playtest ')) console.log(`${stamp()}  ${t.slice(9)}`);
  else if (m.type() === 'error' && !t.includes(PLANTED) && !/Failed to load resource|net::ERR_|ERR_TUNNEL|CORS/.test(t)) pageErrors.push(`[console] ${t.slice(0, 300)}`);
});
let code = 0;
try {
  console.log(`${stamp()}  loading ${URL0}/?${query}   (Playwright: ${found.name}, ${soft ? 'SwiftShader' : 'the GPU'}, ${W}×${H})`);
  await page.goto(`${URL0}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  // ready, or the boot report up (no WebGL, a shader that won't compile, a boot that threw)
  const state = await page.waitForFunction(() => {
    if (window.__READY__ === true) return 'ready';
    const f = document.getElementById('fatal');
    return f && getComputedStyle(f).display !== 'none' && f.textContent.trim() ? 'fatal' : false;
  }, null, { timeout: READY * 1000, polling: 1000 }).then((h) => h.jsonValue());
  if (state === 'fatal') {
    const txt = await page.evaluate(() => document.getElementById('fatal')?.innerText ?? '');
    console.error(`playtest: the game didn't start:\n${txt.slice(0, 1500)}`);
    if (!soft) console.error('  (no WebGL on this GPU headless? try --swiftshader, or --headed)');
    code = 2;
  } else {
    // "Begin walking", if the intro is still up (capture mode hides it by itself)
    const begun = await page.evaluate(async () => {
      const intro = document.getElementById('intro'), start = document.getElementById('start');
      if (!intro || intro.classList.contains('hidden') || !start) return false;
      for (let i = 0; i < 100 && start.disabled; i++) await new Promise((r) => setTimeout(r, 200));
      start.click();
      return true;
    });
    const gpu = await page.evaluate(() => { try { const gl = document.createElement('canvas').getContext('webgl2'), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); } catch { return '?'; } });
    console.log(`${stamp()}  ready${begun ? ' (clicked Begin walking)' : ''} — ${gpu}`);
    await page.waitForTimeout(2000);
    await page.evaluate(async () => { await import('/tools/playtest.js'); });
    const report = await page.evaluate((o) => window.__PLAYTEST__(o), opts);
    report.pageErrors = [...new Set(pageErrors)];
    report.url = `${URL0}/?${query}`;
    report.seconds = Math.round((Date.now() - t0) / 1000);
    report.summary = verdictLine(report);
    const file = resolve(ROOT, String(args.out ?? `shots/playtest-${place ?? report.place ?? 'spawn'}.json`));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(report, null, 1));
    if (!args['json-only']) {
      console.log('');
      console.log(formatReport(report));
      console.log(`\n${report.summary}`);
      console.log('\n--- JSON ---');
    }
    console.log(JSON.stringify(report, null, 1));
    if (!args['json-only']) console.log(`\nreport: ${file}`);
    code = report.pass && !report.pageErrors.some((e) => e.startsWith('[pageerror]')) ? 0 : 1;
  }
} catch (e) {
  console.error(`playtest could not run: ${String(e?.message ?? e).split('\n')[0]}`);
  for (const l of [...new Set(pageErrors)].slice(0, 8)) console.error(`  ${l}`);
  code = 2;
} finally {
  await browser.close().catch(() => {});
  server?.kill();
}
process.exit(code);

function usage() {
  return [
    'node tools/playtest.mjs [--url=http://localhost:5173/] [--at=lat,lon | --region=<id>] [--query=k=v&…]',
    '  [--only=overlaps,doors,posts,flicker,altitude,frames,walkabout,drive,teleports,streaming] [--skip=…]',
    '  [--quick] (no flicker/altitude/frames/streaming)  [--selftest] (each check against planted failures)',
    '  [--seconds=N] [--seed=N] [--opts=\'{"doors":{"max":300}}\'] [--budget=desktop|phone|soft]',
    '  [--swiftshader] [--headed] [--w=1280 --h=720] [--ready=400] [--no-server] [--out=shots/x.json] [--json-only]',
    '  [--playwright=<dir with playwright installed>]',
    'exit: 0 pass, 1 a check failed or the page threw, 2 it could not run',
  ].join('\n');
}
