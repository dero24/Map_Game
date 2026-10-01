#!/usr/bin/env node
// The night street, measured (reviewer round 10, must-fix 2), headless: opens the game on
// ?capture=1, waits for window.__READY__, imports tools/night-check.js and runs __NIGHTCHECK__ — the
// review's night street (frame 3) and Center Street at 22:00: the lens, wires against the sky, the
// bottom 40% outside the lamp hearts, pools down the street. Prints each pose's numbers, writes
// shots/nightcheck-<tag>.jpg (the frames, and the same frames with what was measured drawn on them)
// and shots/nightcheck-<tag>.json. Exit code: 0 every pose passed, 1 one failed, 2 it couldn't run.
//
//   node tools/night-check.mjs [--url=http://localhost:5173/] [--tag=n] [--swiftshader] [--w=960 --h=540]
//     [--ready=400] [--playwright=<dir>]
//
// The page must be served (npm run dev, or npm run preview) — this runner starts nothing. Playwright
// as tools/playtest.mjs finds it: the project's own, ../../shot-harness, a global install.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const tryLoad = (from) => {
  for (const name of ['playwright', '@playwright/test']) {
    try { const m = createRequire(from)(name); if (m?.chromium) return m; } catch { /* next */ }
  }
  return null;
};
const globalRoot = () => { try { return execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const places = [args.playwright && resolve(String(args.playwright), 'package.json'), resolve(ROOT, 'package.json'), resolve(ROOT, '../../shot-harness/package.json'), globalRoot() && join(globalRoot(), '..', 'package.json')].filter(Boolean);
let pw = null;
for (const p of places) if ((pw = tryLoad(p))) break;
if (!pw) { console.error('night-check: no Playwright here (npm i -D playwright && npx playwright install chromium, or --playwright=<dir>)'); process.exit(2); }

const url = String(args.url ?? 'http://localhost:5173').replace(/\/+$/, ''), tag = String(args.tag ?? 'n');
const soft = !!args.swiftshader;
const W = Number(args.w ?? 960), H = Number(args.h ?? 540);
const browser = await pw.chromium.launch({ args: soft ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] : ['--enable-gpu', '--enable-webgl'] });
let code = 2;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/overpass|photon|Failed to load resource|net::|nationalmap/i.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await page.goto(`${url}/?capture=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: Number(args.ready ?? 400) * 1000, polling: 1000 });
  page.setDefaultTimeout(0);
  const out = await page.evaluate(async (tag) => { await import('/tools/night-check.js'); return window.__NIGHTCHECK__(tag); }, tag);
  for (const r of out.poses) {
    const ok = (b) => (b === false ? 'FAIL' : b == null ? 'n/a' : 'ok');
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.label}  (judged: ${r.judged.join(', ')})`);
    console.log(`  lens   ${ok(r.lens.pass)}  within 2.5 m ${(r.lens.near25 * 100).toFixed(1)}%, within 4 m ${(r.lens.near4 * 100).toFixed(1)}%`);
    console.log(`  wires  ${ok(r.wires.pass)}  L* ${r.wires.wireL} against the sky's ${r.wires.skyL} (${r.wires.n} px)`);
    console.log(`  dark   ${ok(r.dark.pass)}  L* ${r.dark.L}, C* ${r.dark.C}, hue ${r.dark.h}°  outside the hearts (${Math.round(r.dark.heartShare * 100)}% of the band is heart); the whole band L* ${r.dark.all.L}, C* ${r.dark.all.C}, hue ${r.dark.all.h}°`);
    console.log(`  pools  ${ok(r.pools.pass)}  ${r.pools.good} at ≥ 2.5×: ${r.pools.list.map((p) => `${p.ahead} m ${p.heartL}/${p.gapL ?? '–'} (${p.ratio}×)`).join(' · ')}`);
  }
  if (errs.length) console.log('page errors:', errs.slice(0, 6));
  mkdirSync(join(ROOT, 'shots'), { recursive: true });
  writeFileSync(join(ROOT, `shots/nightcheck-${tag}.json`), JSON.stringify(out, null, 1));
  console.log(`→ ${out.sheet}, shots/nightcheck-${tag}.json`);
  code = out.pass && !errs.length ? 0 : 1;
} catch (e) {
  console.error('night-check:', e?.message ?? e);
} finally {
  await browser.close();
}
process.exit(code);
