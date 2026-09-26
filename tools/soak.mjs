#!/usr/bin/env node
// Freeze hunter: drives the real game in headless Chromium for a while — walking in through front doors,
// up and down staircases, along streets, flying, skipping hours — and reports frame-loop stalls, long
// hitches and any page errors.
//   node tools/soak.mjs [--region=shore] [--seconds=120] [--port=5191]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(resolve(ROOT, '../../shot-harness/package.json'))('playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port ?? 5191), REGION = String(args.region ?? 'shore'), SECONDS = Number(args.seconds ?? 120);
const portOpen = (port) => new Promise((res) => { const s = net.connect({ port, host: 'localhost' }, () => (s.destroy(), res(true))); s.on('error', () => res(false)); s.setTimeout(400, () => (s.destroy(), res(false))); });

let server = null;
if (!(await portOpen(PORT))) {
  server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 250)); if (await portOpen(PORT)) break; }
}
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
let code = 0;
try {
  await page.goto(`http://localhost:${PORT}/?region=${REGION}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 180000 });
  // Optional instrumentation: --inject="…" evaluates a snippet before driving (wrap subsystems, counters).
  if (args.inject) await page.evaluate(String(args.inject));
  await page.evaluate(() => {
    document.getElementById('intro')?.classList.add('hidden');
    const w = window;
    w.__MAXDT__ = 0; w.__HITCH__ = 0;
    let last = performance.now();
    const tick = (t) => { const d = t - last; last = t; if (d > w.__MAXDT__) w.__MAXDT__ = d; if (d > 250) w.__HITCH__++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const G = (fn, a) => page.evaluate(fn, a);
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const t0 = Date.now();
  let step = 0, lastFrames = -1, stalls = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    const kind = step++ % 6;
    if (kind === 0 || kind === 3) {
      // walk in through a random front door
      await G((k) => {
        const g = window.__GAME__, P = [...g.plans.values()][Math.floor(k * 7919) % g.plans.size], d = P.door;
        g.walkParams.fly = false;
        g.walker.place(d.fx + d.nx * 1.5, d.fz + d.nz * 1.5, Math.atan2(d.nx, d.nz), 0);
      }, step);
      await hold('KeyW', 3500);
      await hold('KeyA', 600);
      await hold('KeyW', 1500);
    } else if (kind === 1) {
      // climb a staircase and come back down
      const ok = await G((k) => {
        const g = window.__GAME__, list = [...g.plans.values()].filter((p) => p.flights.length);
        if (!list.length) return false;
        const P = list[Math.floor(k * 104729) % list.length], F = P.flights[0], dir = Math.sign(F.topU - F.bottomU), vc = (F.v0 + F.v1) / 2;
        const W = (u, v) => [P.cx + P.ux * u + P.vx * v, P.cz + P.uz * u + P.vz * v];
        const a = W(F.bottomU - dir * 0.8, vc), b = W(F.topU, vc);
        g.walkParams.fly = false;
        g.walker.place(a[0], a[1], Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])), 0, P.floor0 + F.level * P.floorH);
        return true;
      }, step);
      if (ok) {
        await hold('KeyW', 3200);
        await hold('KeyS', 3400);
      }
    } else if (kind === 2) {
      // stroll / run along the street
      await G(() => { const g = window.__GAME__; g.walkParams.fly = false; g.walker.yaw += 1.1; });
      await page.keyboard.down('ShiftLeft');
      await hold('KeyW', 2500);
      await page.keyboard.up('ShiftLeft');
    } else if (kind === 4) {
      // fly somewhere and land
      await hold('KeyF', 50);
      await G(() => { const g = window.__GAME__; g.walker.pitch = -0.2; g.walker.yaw += 2.3; });
      await page.keyboard.down('ShiftLeft');
      await hold('KeyW', 1500);
      await page.keyboard.up('ShiftLeft');
      await hold('KeyF', 50);
    } else {
      await hold('KeyT', 50);
      await hold('KeyD', 800);
    }
    const info = await G(() => ({ ...window.__RENDER_INFO__, maxdt: window.__MAXDT__, hitch: window.__HITCH__, x: window.__GAME__.walker.x, y: window.__GAME__.walker.y, active: window.__GAME__.life?.stats.active, simMs: window.__GAME__.life?.stats.simMs }));
    if (info.frames === lastFrames) stalls++;
    lastFrames = info.frames;
    if (!isFinite(info.x) || !isFinite(info.y)) { console.log('walker position went non-finite', info); code = 1; break; }
    if (step % 6 === 0) console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s frames=${info.frames} maxFrame=${info.maxdt.toFixed(0)}ms hitches>250ms=${info.hitch} frameErrors=${info.errors} life=${info.active}@${info.simMs?.toFixed(1)}ms`);
  }
  const fin = await G(() => ({ ...window.__RENDER_INFO__, maxdt: window.__MAXDT__, hitch: window.__HITCH__ }));
  console.log(`done: frames=${fin.frames} stalls=${stalls} maxFrame=${fin.maxdt.toFixed(0)}ms hitches>250ms=${fin.hitch} frameErrors=${fin.errors}`);
  console.log('worst subsystem ms:', JSON.stringify(await G(() => window.__PERF__)));
  if (stalls || fin.errors) code = 1;
} catch (e) {
  console.error('soak failed:', e.message);
  code = 1;
} finally {
  const uniq = [...new Set(logs)];
  if (uniq.length) console.log('page errors:\n' + uniq.slice(0, 20).join('\n'));
  if (uniq.some((l) => l.includes('pageerror') || l.includes('frame error'))) code = 1;
  if (server) server.kill();
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  process.exit(code);
}
