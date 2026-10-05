#!/usr/bin/env node
// The tree studio, headless: the foundry's trees side by side on a lawn (tools/tree-shots.js) without
// booting the game — the dev server's /kit.html, one call, shots/trees-<tag>.jpg.
//   node tools/tree-studio.mjs --tag=liveoaks --kinds=liveoak,plateauoak,coastoak [--port=5194]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { proxyArgs } from './pw-proxy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(resolve(ROOT, '../../shot-harness/package.json'))('playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port ?? 5194), TAG = String(args.tag ?? 'studio'), KINDS = args.kinds ? String(args.kinds).split(',') : null;
const open = (port) => new Promise((res) => { const s = net.connect({ port, host: 'localhost' }, () => (s.destroy(), res(true))); s.on('error', () => res(false)); });
let server = null;
if (!(await open(PORT))) {
  server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NO_HMR: '1' } });
  for (let i = 0; i < 120 && !(await open(PORT)); i++) await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--mute-audio', ...proxyArgs()] });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/tools/studio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const out = await page.evaluate(async ([tag, kinds, extra]) => {
    await import('/tools/tree-shots.js');
    const opts = extra ? { extra: (await import(extra)).default } : {};
    return await window.__TREES__(tag, kinds, opts);
  }, [TAG, KINDS, args.extra ? String(args.extra) : null]);
  console.log(out);
} finally {
  await browser.close();
  server?.kill();
}
