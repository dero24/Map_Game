#!/usr/bin/env node
// Visual verification: boot vite (if needed), load the world once, capture named shots to shots/*.png.
//   node tools/capture.mjs --shots=ocean-golden,ocean-night [--region=monmouthbeach --w=1600 --h=900 --settle=40 --port=5190 --montage=only]
// Always emits shots/<region>-montage.jpg — a single JPEG contact sheet agents should read instead
// of the per-shot PNGs. --montage=only skips writing the PNGs entirely.
// Uses Playwright from ../../shot-harness (already installed there with Chromium).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { proxyArgs } from './pw-proxy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(resolve(ROOT, '../../shot-harness/package.json'));
const { chromium } = req('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const PORT = Number(args.port ?? 5190);
const W = Number(args.w ?? 1600), H = Number(args.h ?? 900);
const SETTLE = Number(args.settle ?? 30);
const SHOTS = String(args.shots ?? 'ocean-golden').split(',');
const REGION = args.region ? String(args.region) : 'shore';
// --region=none drops the param entirely: ?at= deep-links and the open-world virtual
// region only run when no explicit region is requested.
const EXTRA = `${REGION === 'none' ? '' : `&region=${REGION}`}${args.query ? `&${args.query}` : ''}`;

const portOpen = (port) => new Promise((res) => {
  const s = net.connect({ port, host: 'localhost' }, () => (s.destroy(), res(true)));
  s.on('error', () => res(false));
  s.setTimeout(400, () => (s.destroy(), res(false)));
});

let server = null;
if (!(await portOpen(PORT))) {
  server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 250)); if (await portOpen(PORT)) break; }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--force-color-profile=srgb', '--force-device-scale-factor=1', '--mute-audio', '--disable-frame-rate-limit', ...proxyArgs()],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
mkdirSync(resolve(ROOT, 'shots'), { recursive: true });
try {
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?capture=1&shot=${SHOTS[0]}${EXTRA}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await Promise.race([
    page.waitForFunction('window.__READY__ === true', null, { timeout: 180000 }),
    new Promise((_, rej) => { const t = setInterval(() => { if (logs.some((l) => l.startsWith('[pageerror]') || l.includes('TypeError') || l.includes('Shader Error'))) { clearInterval(t); rej(new Error('page error before ready')); } }, 300); }),
  ]);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const d = gl?.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s on ${gpu}`);
  const montageOnly = String(args.montage ?? '') === 'only';
  const taken = [];
  for (const s of SHOTS) {
    await page.evaluate((n) => window.__APPLY_SHOT__(n), s);
    if (args.eval) await page.evaluate(String(args.eval));
    const f0 = Date.now();
    await page.evaluate((n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); }), SETTLE);
    const fps = (SETTLE / ((Date.now() - f0) / 1000)).toFixed(1);
    const buf = await page.screenshot();
    const fname = `${REGION}-${s.replace(/[^\w.-]+/g, '_')}`;
    if (!montageOnly) writeFileSync(resolve(ROOT, 'shots', `${fname}.png`), buf);
    taken.push({ name: fname, b64: buf.toString('base64') });
    const info = await page.evaluate('window.__RENDER_INFO__');
    console.log(`${s}: ${montageOnly ? '(buffered)' : resolve(ROOT, 'shots', `${fname}.png`)} (${fps} fps, ${JSON.stringify(info)})`);
  }

  // Contact sheet: all shots composited into one JPEG inside the page (no deps).
  // Agents should read THIS file instead of opening each PNG.
  // (cells keep the shots' aspect: a phone's portrait frames side by side, six to a row, not
  // squeezed into landscape cells; a landscape capture is 640×360 three to a row, as always)
  const ar = W / H, cols = Math.min(ar >= 1 ? 3 : 6, taken.length);
  const CW = ar >= 1 ? 640 : Math.round(640 * ar), CH = ar >= 1 ? Math.round(640 / ar) : 640;
  const sheet = await page.evaluate(async ({ items, cols, CW, CH }) => {
    const PAD = 26;
    const rows = Math.ceil(items.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * CW;
    cv.height = rows * (CH + PAD);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f5efe1';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = '#3a3346';
    for (let i = 0; i < items.length; i++) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + items[i].b64;
      await img.decode();
      const x = (i % cols) * CW, y = Math.floor(i / cols) * (CH + PAD);
      ctx.drawImage(img, x, y, CW, CH);
      ctx.fillText(items[i].name, x + 8, y + CH + 17);
    }
    return cv.toDataURL('image/jpeg', 0.72).split(',')[1];
  }, { items: taken, cols, CW, CH });
  const sheetOut = resolve(ROOT, 'shots', `${REGION}-montage.jpg`);
  writeFileSync(sheetOut, Buffer.from(sheet, 'base64'));
  console.log(`montage: ${sheetOut}  <- read this one image for review`);
} catch (e) {
  console.error('capture failed:', e.message);
  process.exitCode = 1;
} finally {
  const uniq = [...new Set(logs.map((l) => l.slice(0, 220)))].filter((l) => !l.includes('X3595'));
  if (uniq.length) console.log(uniq.slice(0, 30).join('\n'));
  if (server) server.kill();
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  process.exit(process.exitCode ?? 0);
}
