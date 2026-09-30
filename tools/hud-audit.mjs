#!/usr/bin/env node
// Phone HUD audit: the production build's CSS and markup as GitHub Pages serves them, the game's
// module blocked (no WebGL — the HUD's geometry only, so it runs in a minute), opened as a range of
// phones upright and on their side, in each touch state — walking, by a lift, beside a ride,
// driving a car, flying a plane, flying on foot, in a balloon — with a long hint up and a long place name. Every pair of HUD
// boxes that overlap is reported (the dock's own buttons with each other aside), and any box off
// the screen; exit 1 if there are any. The states are set the way main.ts syncTouchControls sets
// them (body classes, body[data-ride], the ride buttons shown); the ride readout is made with the
// inline style player/vehicles.ts gives it — keep those in step.
//
//   npm run build && node tools/hud-audit.mjs [--phones="Pixel 7,iPhone SE"] [--dist=dist] [--port=4191] [--shots=shots/hud]
//   (--shots: a PNG of every layout, the HUD alone over a blank page, to look at)
//
// Uses Playwright from ../../shot-harness (like capture.mjs), else a global one.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const load = (p) => { try { return createRequire(p)('playwright'); } catch { return null; } };
const pw = load(resolve(ROOT, '../../shot-harness/package.json')) ?? load(resolve(ROOT, 'package.json')) ?? load(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'package.json'));
if (!pw) { console.error('no playwright (../../shot-harness or global)'); process.exit(1); }
const { chromium, devices } = pw;
const DIST = resolve(ROOT, String(args.dist ?? 'dist'));
if (!existsSync(join(DIST, 'index.html'))) { console.error(`no ${DIST}/index.html — npm run build first`); process.exit(1); }
const PORT = Number(args.port ?? 4191);
if (args.shots) mkdirSync(resolve(ROOT, String(args.shots)), { recursive: true });
// (small to large, old to new: a 320-wide SE to a Pro Max; the Playwright descriptors' viewports
// are what a page gets — the browser's bars already taken off)
const PHONES = String(args.phones ?? 'iPhone SE,Galaxy S9+,iPhone SE (3rd gen),iPhone 12 Mini,Galaxy S8,iPhone 14,iPhone 15,Pixel 5,Pixel 7,iPhone 14 Pro Max').split(',').map((s) => s.trim());
for (const p of PHONES) if (!devices[p]) { console.error(`no Playwright device "${p}"`); process.exit(1); }

// ---- a GitHub-Pages-like server: /Map_Game/…, plain types ----
const TYPES = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

const HINT = '✧ paint the lighthouse from the end of the jetty at dusk';
const STATES = {
  walking: { hint: ['Paint', HINT] },
  'by a lift': { lift: true, hint: ['Lift', "call the lift — you're on floor 3 of 12"] },
  'beside a ride': { ride: 'near', action: 'Board', hint: [null, 'take the helm of this sailboat'] },
  'driving a car': { ride: 'car', driving: true, action: 'Get out', show: ['trboost'], hud: ['🚗 38 km/h', ' · left stick: steer / throttle · ⇧: boost'], hint: ['Paint', HINT] },
  'flying a plane': { ride: 'plane', driving: true, action: 'Jump out', show: ['tthrottle-down', 'tthrottle-up'], hud: ['✈ 212 km/h · alt 480 m · throttle 100%', ' · stick: pitch / bank · +/−: throttle'], hint: ['Paint', HINT] },
  'flying on foot': { ride: 'fly', fly: true, show: ['tfly-up', 'tfly-down'], hint: ['Land', 'hold Up and Down to climb and sink · push the stick far to go faster'] },
  'in a balloon': { ride: 'balloon', driving: true, fly: true, action: 'Jump out', show: ['tfly-up', 'tfly-down', 'tview'], hud: ['🎈 312 m · ↑ 2.1 m/s · 84°C · ↗ 14 km/h · holding', ''], hint: ['Paint', 'the best seat for a painting — everything in frame, out to the horizon'] },
};

// ---- in-page: set a state, measure the HUD ----
const MEASURE = ({ s, place }) => {
  const $ = (id) => document.getElementById(id);
  const b = document.body;
  b.className = 'touch nomouse walking';
  if (s.driving) b.classList.add('driving');
  b.dataset.ride = s.ride ?? '';
  $('intro')?.classList.add('hidden');
  $('fatal')?.classList.add('hidden');
  $('place').textContent = place;
  $('clock').textContent = '11:05 am';
  if (!$('tbrush')) { const t = document.createElement('button'); t.id = 'tbrush'; t.className = 'tbtn'; t.dataset.label = 'Brush'; $('tphoto').after(t); } // (brush.ts adds it)
  if (!$('tlift')) { const t = document.createElement('button'); t.id = 'tlift'; t.className = 'tbtn hidden'; t.dataset.label = 'Lift'; $('tdock').append(t); } // (lift.ts adds it)
  $('tlift').classList.toggle('hidden', !s.lift);
  $('tfly').dataset.label = s.fly && !s.driving ? 'Land' : 'Fly';
  const h = $('hint');
  h.replaceChildren();
  if (s.hint[0]) { const k = document.createElement('kbd'); k.textContent = s.hint[0]; h.append(k, ' '); }
  h.append(s.hint[1]);
  h.style.transition = 'none';
  h.classList.add('show');
  const ta = $('touch-action');
  ta.classList.toggle('hidden', !s.action);
  ta.textContent = s.action ?? '';
  const rt = $('ride-touch');
  rt.classList.toggle('hidden', !s.show);
  rt.classList.toggle('fly', !!s.fly);
  for (const el of rt.children) el.classList.toggle('hidden', !(s.show ?? []).includes(el.id));
  let v = $('vehud');
  if (!v) { // (as player/vehicles.ts makes it)
    v = document.createElement('div');
    v.id = 'vehud';
    Object.assign(v.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: '14px', background: 'rgba(245,239,225,0.82)', color: '#3a3346', font: '14px Georgia, serif', pointerEvents: 'none', display: 'none', zIndex: '20', whiteSpace: 'nowrap' });
    v.append(document.createElement('span'), document.createElement('span'));
    v.lastChild.className = 'vkeys';
    b.append(v);
  }
  v.style.display = s.hud ? 'block' : 'none';
  if (s.hud) { v.firstChild.textContent = s.hud[0]; v.lastChild.textContent = s.hud[1]; }
  const shown = (el) => { const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'hidden'; };
  const box = (el) => { const q = el.getBoundingClientRect(); return q.width && q.height && shown(el) ? { l: q.left, t: q.top, r: q.right, b: q.bottom } : null; };
  // (a line of text by its text — a block can run wider than what it shows — clipped where it hides its overflow)
  const textBox = (el) => {
    if (!shown(el)) return null;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const q = rg.getBoundingClientRect();
    if (!q.width) return null;
    const o = { l: q.left, t: q.top, r: q.right, b: q.bottom };
    if (getComputedStyle(el).overflow === 'hidden') { const e = el.getBoundingClientRect(); o.l = Math.max(o.l, e.left); o.r = Math.min(o.r, e.right); o.t = Math.max(o.t, e.top); o.b = Math.min(o.b, e.bottom); }
    return o;
  };
  const items = [];
  const add = (group, label, q) => { if (q) items.push({ group, label, ...q }); };
  add('place', '#place', textBox($('place')));
  add('place', '#clock', textBox($('clock')));
  add('hint', '#hint', box(h));
  add('vehud', '#vehud', box(v));
  add('credit', '#osm-credit', textBox($('osm-credit')));
  // (a button and the word under it, as one box: the label is the button's ::after)
  const ctx2 = document.createElement('canvas').getContext('2d');
  ctx2.font = '11px Georgia, serif';
  const withLabel = (el) => {
    const q = box(el);
    if (!q || !el.dataset.label) return q;
    const w = ctx2.measureText(el.dataset.label).width, cx = (q.l + q.r) / 2;
    return { l: Math.min(q.l, cx - w / 2 - 5), r: Math.max(q.r, cx + w / 2 + 5), t: q.t, b: q.b + 3 + 15 };
  };
  for (const el of document.querySelectorAll('#touchui .tbtn')) add(`btn:${el.id}`, `#${el.id}`, withLabel(el));
  add('action', '#touch-action', box(ta));
  for (const el of rt.children) add(`btn:${el.id}`, `#${el.id}`, withLabel(el));
  add('stick', '#stick-home', box($('stick-home')));
  const hits = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.group === c.group) continue;
      const w = Math.min(a.r, c.r) - Math.max(a.l, c.l), hh = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (w > 0.5 && hh > 0.5) hits.push(`${a.label} × ${c.label} (${w.toFixed(0)}×${hh.toFixed(0)} px)`);
    }
  for (const q of items) if (q.l < -0.5 || q.t < -0.5 || q.r > innerWidth + 0.5 || q.b > innerHeight + 0.5) hits.push(`${q.label} off the screen`);
  return hits;
};

const browser = await chromium.launch({ headless: true });
let bad = 0, n = 0;
for (const name of PHONES)
  for (const side of [false, true]) {
    const base = devices[name];
    const dev = side ? (devices[`${name} landscape`] ?? { ...base, viewport: { width: base.viewport.height, height: base.viewport.width } }) : base;
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    await page.route('**/assets/*.js', (r) => r.abort()); // (the CSS and the markup only)
    await page.goto(`http://127.0.0.1:${PORT}/Map_Game/`, { waitUntil: 'load' });
    for (const [state, s] of Object.entries(STATES)) {
      const hits = await page.evaluate(MEASURE, { s, place: 'Ocean Avenue North' });
      if (args.shots) await page.screenshot({ path: resolve(ROOT, String(args.shots), `${name}${side ? '-side' : ''}-${state}.png`.replace(/[^\w.-]+/g, '_')) });
      const tag = `${name}${side ? ' on its side' : ''} (${dev.viewport.width}×${dev.viewport.height}) · ${state}`;
      n++;
      if (hits.length) { bad++; console.log(`✗ ${tag}: ${hits.join('; ')}`); }
      else if (args.verbose) console.log(`✓ ${tag}`);
    }
    await ctx.close();
  }
await browser.close();
server.close();
console.log(bad ? `${bad} of ${n} layouts overlap` : `${n} layouts, no overlaps`);
process.exit(bad ? 1 : 0);
