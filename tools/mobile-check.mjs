#!/usr/bin/env node
// Phone check: the production build as GitHub Pages serves it (a sub-path, no COOP/COEP — so no
// SharedArrayBuffer), opened headless as a phone (Playwright device descriptors: viewport, DPR,
// touch, UA) with WebGL through SwiftShader. Reports page/console errors, failed requests, the boot
// report, the quality tier, frames drawn, peak renderer/GPU memory, and every linked shader program
// against the ES 3.0 minimum limits a phone GPU may actually have (vertex uniforms 256, fragment
// 224, varyings 15, samplers 16/16, attributes 16) — desktop GPUs report far more, so a program
// that links on a PC can fail on a phone. Screenshot → shots/mobile-<device>.png.
//
//   npm run build && node tools/mobile-check.mjs [--device=pixel7|iphone|desktop] [--wait=30]
//     [--query=quality=low] [--dist=dist] [--port=4190] [--hw=8,8 (cores,GB the page sees)]
//
// Uses Playwright from ../../shot-harness (like capture.mjs), else a global one. Notes: pointer lock
// is stubbed (phones have none; headless Chromium, once it grants one, sends a mousemove every frame
// and its renderer grows ~40 MB/s until it is killed). SwiftShader draws a frame every few seconds
// on a small machine: the watchdog is relaxed with ?watchdog=180 and screenshots can take minutes.
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
const D = { pixel7: devices['Pixel 7'], iphone: devices['iPhone 14'] ?? devices['iPhone 13'], iphonese: devices['iPhone SE'], desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } }[DEV];
if (!D) { console.error(`unknown --device=${DEV}`); process.exit(1); }
const DIST = resolve(ROOT, String(args.dist ?? 'dist'));
if (!existsSync(join(DIST, 'index.html'))) { console.error(`no ${DIST}/index.html — npm run build first`); process.exit(1); }
const PORT = Number(args.port ?? 4190), WAIT = Number(args.wait ?? 30);

// ---- a GitHub-Pages-like server: /Map_Game/…, plain types, no isolation headers ----
const TYPES = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/Map_Game') { res.writeHead(301, { Location: '/Map_Game/' + u.search }); res.end(); return; }
  if (!u.pathname.startsWith('/Map_Game/')) { res.writeHead(404); res.end(); return; }
  let p = decodeURIComponent(u.pathname.slice('/Map_Game'.length));
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(DIST, p));
  if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT, '127.0.0.1');

// ---- in-page: WebGL context + shader program audit (runs before any page script) ----
const AUDIT = () => {
  const A = (window.__GLA__ = { ctx: [], errs: [], progs: [], src: new Map() });
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, a) { const c = gc.call(this, t, a); if (/webgl/.test(t)) A.ctx.push(`${t}:${c ? 'ok' : 'FAILED'}`); return c; };
  const P = WebGL2RenderingContext.prototype, ss = P.shaderSource, lp = P.linkProgram, as = P.attachShader;
  P.shaderSource = function (s, src) { A.src.set(s, src); return ss.call(this, s, src); };
  P.attachShader = function (p, s) { (p.__sh ??= []).push(s); return as.call(this, p, s); };
  P.linkProgram = function (p) { const r = lp.call(this, p); A.progs.push([p, this]); return r; };
  const SZ = { float: [1, 1], int: [1, 1], uint: [1, 1], bool: [1, 1], vec2: [1, 2], ivec2: [1, 2], bvec2: [1, 2], vec3: [1, 3], ivec3: [1, 3], bvec3: [1, 3], vec4: [1, 4], ivec4: [1, 4], bvec4: [1, 4], mat2: [2, 2], mat3: [3, 3], mat4: [4, 4] };
  const pack = (items) => { let r4 = 0, r3 = 0, t2 = 0, o1 = 0; for (const [r, c] of items) c === 4 ? (r4 += r) : c === 3 ? (r3 += r) : c === 2 ? (t2 += r) : (o1 += r); o1 = Math.max(0, o1 - r3 - (t2 % 2) * 2); return r4 + r3 + Math.ceil(t2 / 2) + Math.ceil(o1 / 4); };
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const decls = (src, kw) => { const out = []; const re = new RegExp(`(?:^|\\n)\\s*(?:(?:flat|smooth|highp|mediump|lowp|centroid)\\s+)*${kw}\\s+(?:(?:highp|mediump|lowp)\\s+)?(\\w+)\\s+([^;]+);`, 'g'); let m; while ((m = re.exec(src))) for (const part of m[2].split(',')) { const mm = part.trim().match(/^(\w+)\s*(?:\[\s*(\w+)\s*\])?/); if (mm) out.push({ type: m[1], name: mm[1], n: mm[2] }); } return out; };
  window.__GLAUDIT__ = () => {
    const names = new Map((window.__GAME__?.renderer?.info?.programs ?? []).map((q) => [q.program, `${q.name || q.type || 'program'}#${q.id}`]));
    const rows = [], seen = new Set();
    for (const [p, gl] of A.progs) {
      if (seen.has(p) || !p.__sh) continue;
      seen.add(p);
      const src = {};
      for (const s of p.__sh) src[gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'v' : 'f'] = strip(A.src.get(s) ?? '');
      if (!src.v || !src.f) continue;
      const active = new Set();
      const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) ?? 0;
      for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(p, i); if (u) active.add(u.name.replace(/\[0\]$/, '').split(/[.[]/)[0]); }
      let attribs = 0;
      const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES) ?? 0;
      for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); if (a) attribs += (a.type === gl.FLOAT_MAT4 ? 4 : a.type === gl.FLOAT_MAT3 ? 3 : a.type === gl.FLOAT_MAT2 ? 2 : 1) * a.size; }
      const r = { name: names.get(p) ?? '?', linked: gl.getProgramParameter(p, gl.LINK_STATUS), attribs };
      for (const st of ['v', 'f']) {
        const body = src[st].replace(/(?:^|\n)\s*uniform[^;]*;/g, '\n'), items = [];
        let tex = 0;
        for (const u of decls(src[st], 'uniform')) {
          if (!active.has(u.name) || !new RegExp(`\\b${u.name}\\b`).test(body)) continue;
          const n = u.n ? (Number(u.n) || 1) : 1;
          if (/sampler/.test(u.type)) tex += n; else items.push(SZ[u.type] ? [SZ[u.type][0] * n, SZ[u.type][1]] : [4 * n, 4]);
        }
        r[st + 'U'] = pack(items);
        r[st + 'Tex'] = tex;
      }
      const ins = new Set([...decls(src.f, 'in'), ...decls(src.f, 'varying')].map((d) => d.name));
      const fbody = src.f.replace(/(?:^|\n)\s*(?:flat\s+)?(?:in|varying)\s[^;]*;/g, '\n');
      r.vary = pack([...decls(src.v, 'out'), ...decls(src.v, 'varying')].filter((o) => ins.has(o.name) && new RegExp(`\\b${o.name}\\b`).test(fbody)).map((o) => SZ[o.type] ?? [1, 4]));
      const LIM = { vU: 256, fU: 224, vary: 15, vTex: 16, fTex: 16, attribs: 16 };
      r.over = Object.keys(LIM).filter((k) => r[k] > LIM[k]);
      if (!r.linked) r.over.push('LINK FAILED');
      rows.push(r);
    }
    return rows;
  };
};

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ ...D });
await ctx.addInitScript(() => { Element.prototype.requestPointerLock = undefined; });
if (args.hw) { const [c, m] = String(args.hw).split(',').map(Number); await ctx.addInitScript(([c, m]) => { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => c }); if (m) Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => m }); }, [c, m]); }
await ctx.addInitScript(AUDIT);
const page = await ctx.newPage();
const R = { device: DEV, pageErrors: [], consoleErrors: [], failed: [], http: [] };
page.on('pageerror', (e) => R.pageErrors.push(String(e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) R.consoleErrors.push(m.text().slice(0, 600)); });
page.on('requestfailed', (r) => R.failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 400) R.http.push(`${r.status()} ${r.url().slice(0, 120)}`); });
page.on('crash', () => { R.crashed = true; log('PAGE CRASHED'); });
const peak = {};
const sampler = setInterval(() => {
  try {
    for (const l of execSync('ps -eo rss,args', { encoding: 'utf8' }).split('\n')) {
      if (!/headless_shell|chrom/.test(l)) continue;
      const m = l.trim().match(/^(\d+)\s+(.*)$/); if (!m) continue;
      const t = m[2].match(/--type=([\w-]+)/)?.[1] ?? 'browser';
      if (t === 'renderer' || t === 'gpu-process' || t === 'browser') peak[t] = Math.max(peak[t] ?? 0, Math.round(+m[1] / 1024));
    }
  } catch { /* no ps */ }
}, 3000);
const q = `watchdog=180${args.query ? `&${args.query}` : ''}`;
await page.goto(`http://127.0.0.1:${PORT}/Map_Game/?${q}`, { waitUntil: 'domcontentloaded' });
const boot = await page.waitForFunction(() => {
  const b = document.getElementById('start'), f = document.getElementById('fatal');
  return (b && !b.disabled) || (f && !f.classList.contains('hidden')) ? { ok: !!b && !b.disabled } : false;
}, null, { timeout: 300000, polling: 1000 }).then((h) => h.jsonValue(), () => ({ ok: false, timeout: true }));
log('boot', JSON.stringify(boot));
if (boot.ok) await page.evaluate(() => document.getElementById('start').click()); // (a DOM click: SwiftShader keeps the input pipeline busy)
await page.waitForTimeout(WAIT * 1000);
const S = await page.evaluate(() => ({
  frames: window.__BOOTDIAG__?.().frames ?? null,
  stage: window.__BOOTDIAG__?.().stage ?? null,
  tier: window.__TIER__ ? `${window.__TIER__.tier} (${window.__TIER__.why})` : null,
  report: window.__BOOTDIAG__?.().report ?? null,
  fatal: (() => { const f = document.getElementById('fatal'); return f && !f.classList.contains('hidden') ? f.innerText : null; })(),
  contexts: window.__GLA__.ctx,
  audit: window.__GLAUDIT__(),
})).catch((e) => ({ error: String(e) }));
mkdirSync(resolve(ROOT, 'shots'), { recursive: true });
const shot = resolve(ROOT, `shots/mobile-${DEV}.png`);
await page.screenshot({ path: shot, timeout: 600000 }).catch((e) => log('screenshot failed', String(e).slice(0, 100)));
clearInterval(sampler);
Object.assign(R, S, { peakMB: peak, screenshot: shot });
writeFileSync(resolve(ROOT, `shots/mobile-${DEV}.json`), JSON.stringify(R, null, 1));
log(`tier ${R.tier} · stage ${R.stage} · frames ${R.frames} · peak MB ${JSON.stringify(peak)} · contexts ${R.contexts}`);
log(`page errors ${R.pageErrors.length} · console errors ${R.consoleErrors.length} · failed requests ${R.failed.length} · http ≥ 400 ${R.http.length}`);
for (const e of [...R.pageErrors, ...R.consoleErrors].slice(0, 6)) log('  ', e.slice(0, 200));
if (R.fatal) log('boot report on the page:\n' + R.fatal);
const rows = R.audit ?? [];
const mx = (k) => Math.max(0, ...rows.map((r) => r[k]));
log(`${rows.length} programs · max vertex uniforms ${mx('vU')}/256 · fragment ${mx('fU')}/224 · varyings ${mx('vary')}/15 · samplers ${mx('vTex')}/16 v, ${mx('fTex')}/16 f · attributes ${mx('attribs')}/16`);
for (const r of rows.filter((r) => r.over.length)) log('  OVER', r.name, JSON.stringify(r));
log('screenshot', shot);
await browser.close();
server.close();
process.exit(R.pageErrors.length || rows.some((r) => r.over.length) || R.crashed ? 1 : 0);
