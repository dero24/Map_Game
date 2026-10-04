#!/usr/bin/env node
// The night street, measured (reviewer rounds 10 and 11), headless: opens the game on ?capture=1,
// waits for window.__READY__, imports tools/night-check.js and runs __NIGHTCHECK__ — by default the
// review's night frames 3 (its night street) and 13 (its streamed street at night): the lens, the
// wires against the sky, the bottom 40%'s chroma, the pools' hearts, the gap's ground, a pool's
// fall-off along the road, and pools down the street. Prints each pose's numbers, writes
// shots/nightcheck-<tag>.jpg (the frames, and the same frames with what was measured drawn on them)
// and shots/nightcheck-<tag>.json. Exit code: 0 every pose passed, 1 one failed, 2 it couldn't run.
//
//   node tools/night-check.mjs [--url=http://localhost:5173/] [--tag=n] [--swiftshader] [--w=960 --h=540]
//     [--poses=3,13] [--png] [--settle=12] [--ready=400] [--playwright=<dir>]
//
// --poses: 3, 13, center (Center Street at 22:00), day (frame 2, Ocean Ave in the morning: the day
// the night must leave alone); add 'n' (3n, 13n) for the same pose on the next night with the moon
// down. --png also saves each pose's frame as shots/nightcheck-<tag>-<pose>.png (for a diff).
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
const poses = args.poses ? String(args.poses).split(',').filter(Boolean) : null;
const opts = { png: !!args.png, ...(args.settle ? { settle: Number(args.settle) } : {}), eachSave: true };
const t0 = Date.now();
const browser = await pw.chromium.launch({ args: soft ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] : ['--enable-gpu', '--enable-webgl'] });
let code = 2;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/overpass|places|Failed to load resource|net::|nationalmap/i.test(m.text())) errs.push(m.text().slice(0, 300));
    if (/^\[night\]/.test(m.text())) { let what = ''; try { what = JSON.parse(m.text().slice(8)).label; } catch { /* (cut short) */ } console.log(`  (measured ${what} @${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
  });
  await page.goto(`${url}/?capture=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: Number(args.ready ?? 400) * 1000, polling: 1000 });
  console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  page.setDefaultTimeout(0);
  const out = await page.evaluate(async ([tag, poses, opts]) => { await import('/tools/night-check.js'); return window.__NIGHTCHECK__(tag, poses, opts); }, [tag, poses, opts]);
  for (const r of out.poses) {
    const ok = (k) => (r[k].pass === false ? 'FAIL' : r[k].pass == null ? 'n/a ' : 'ok  ') + (r.judged.includes(k) ? ' ' : '·');
    const f = r.falloff;
    console.log(`${r.judged.length ? (r.pass ? 'PASS' : 'FAIL') : '----'}  ${r.label}  (judged: ${r.judged.join(', ') || 'nothing'}; · = measured, not judged)`);
    console.log(`  lens    ${ok('lens')} within 2.5 m ${(r.lens.near25 * 100).toFixed(1)}%, within 4 m ${(r.lens.near4 * 100).toFixed(1)}%`);
    console.log(`  wires   ${ok('wires')} L* ${r.wires.wireL} against the sky's ${r.wires.skyL} (${r.wires.n} px)`);
    console.log(`  band    ${ok('band')} the bottom 40%: L* ${r.band.L}, C* ${r.band.C}, hue ${r.band.h}°`);
    console.log(`  heart   ${ok('heart')} L* ${r.heart.L}, C* ${r.heart.C}, hue ${r.heart.h}° (${r.heart.n} px)`);
    console.log(`  gap     ${ok('gap')} L* ${r.gap.L}, C* ${r.gap.C}, hue ${r.gap.h}° (${r.gap.n} px; p90 L* ${r.gap.L90})`);
    console.log(`  falloff ${ok('falloff')} ${f.lamp ? `the pool ${f.lamp.ahead} m ahead: half at ${f.dHalf} m, ${f.at12 == null ? '–' : (f.at12 * 100).toFixed(1) + '%'} at 12 m, steepest ${f.steep} L*/m, L* ${f.heartL} → floor ${f.floorL} (${f.floorFrom})` : f.why}`);
    if (f.profile?.length) console.log(`          ${f.profile.map(([d, L, p]) => `${d}m ${L}/${Math.round(p * 100)}%`).join(' ')}`);
    console.log(`  pools   ${ok('pools')} ${r.pools.good} at ≥ 2.5×: ${r.pools.list.map((p) => `${p.ahead} m ${p.heartL}/${p.gapL ?? '–'} (${p.ratio}×)`).join(' · ')}`);
    console.log(`  (round 10's dark: L* ${r.dark.L}, C* ${r.dark.C}, hue ${r.dark.h}°; night ${r.night}, moon ${r.moon})`);
  }
  if (errs.length) console.log('page errors:', errs.slice(0, 6));
  mkdirSync(join(ROOT, 'shots'), { recursive: true });
  writeFileSync(join(ROOT, `shots/nightcheck-${tag}.json`), JSON.stringify(out, null, 1));
  console.log(`→ ${out.sheet}, shots/nightcheck-${tag}.json (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  code = out.pass && !errs.length ? 0 : 1;
} catch (e) {
  console.error('night-check:', e?.message ?? e);
} finally {
  await browser.close();
}
process.exit(code);
