#!/usr/bin/env node
// Phone HUD audit: the production build's CSS and markup as GitHub Pages serves them, the game's
// module blocked (no WebGL — the HUD's geometry only, so it runs in a minute), opened as a range of
// phones upright and on their side, in each touch state — walking, by a lift, beside a ride,
// driving a car, flying a plane, flying on foot, in a balloon — with a long hint up and a long place
// name, and each of those with the messages that come and go: a toast (the longest the game says),
// an arrival card, and both. Reported, exit 1 if any:
// · every pair of HUD boxes that overlap, and any box off the screen;
// · anything of the HUD — a button with its word, the stick's ring, the place, a hint, a toast, a
//   ride's readout, an arrival card — in the middle of the frame, x 15–85%, y 30–62%: that is the
//   world's while you walk or ride (reviewer round 10, "a phone is a window, not a slot");
// · any message of the copy set (every toast a phone can see and the arrival cards, with the longest
//   names they fill in: COPY, ARRIVALS) cut off — a toast past its two lines, a card past its width
//   or over two lines: the "…" (reviewer round 12, must-fix 4).
// The states are set the way main.ts syncTouchControls sets them (body classes, body[data-ride],
// the ride buttons shown), a toast the way main.ts toast() puts it up (body.toasting), an arrival
// card the way ui/arrival.ts does (body.arriving); the ride readout is made with the inline style
// player/vehicles.ts gives it — keep those in step.
//
//   npm run build && node tools/hud-audit.mjs [--phones="Pixel 7,iPhone SE"] [--dist=dist] [--port=4191] [--shots=shots/hud]
//   (--shots: a PNG of every layout, the HUD alone over a blank page, to look at;
//    --base=/ for a build whose index.html asks for its files from the root — dist is served under /Map_Game/)
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
// (the page's path: GitHub Pages serves the build under /Map_Game/; --base=/ for a build whose
// index.html asks for its files from the root, like an esbuild bundle that links /src/ui/style.css)
const BASE = String(args.base ?? '/Map_Game/').replace(/^\/?/, '/').replace(/\/?$/, '/');
if (args.shots) mkdirSync(resolve(ROOT, String(args.shots)), { recursive: true });
// (small to large, old to new: a 320-wide SE to a Pro Max; the Playwright descriptors' viewports
// are what a page gets — the browser's bars already taken off)
const PHONES = String(args.phones ?? 'iPhone SE,Galaxy S9+,iPhone SE (3rd gen),iPhone 12 Mini,Galaxy S8,iPhone 14,iPhone 15,Pixel 5,Pixel 7,iPhone 14 Pro Max').split(',').map((s) => s.trim());
for (const p of PHONES) if (!devices[p]) { console.error(`no Playwright device "${p}"`); process.exit(1); }

// ---- a GitHub-Pages-like server: /Map_Game/…, plain types ----
const TYPES = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  let p = decodeURIComponent(u.pathname.slice(BASE.length - 1));
  if (p.endsWith('/')) p += 'index.html';
  // (the build first, then the checkout: a stylesheet the build links from the source tree)
  const f = [DIST, ROOT].map((d) => normalize(join(d, p))).find((c, i) => c.startsWith([DIST, ROOT][i]) && existsSync(c) && statSync(c).isFile());
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT, '127.0.0.1');

const HINT = '✧ paint the lighthouse from the end of the jetty at dusk';
// The copy set (review round 12, must-fix 4: "every toast and the arrival card fit two lines at
// 320–390 px with no '…'"): every toast a phone can see, in its phone wording, each with the longest
// names it fills in — keep in step with the toast() calls (main.ts, player/vehicles.ts, ui/brush.ts,
// ui/commissions.ts, ui/garden.ts, ui/journal.ts, ui/photo.ts). Each is put up as main.ts toast()
// does and must show whole in its two lines: a clamped one (its text past the box: the "…") fails.
// (main.ts toast() also splits anything longer at a break, a safety net for names longer than these.)
const COPY = [
  // main.ts
  "no tile service here — you're at the nearest baked town", 'walking over', 'the paint settled — stepped you clear',
  'a balloon landed on the beach, 2.4 km north-east — fly it', 'your beach grass is in bloom ✿',
  'almanac stamp: Point Pleasant Beach · Monmouth County, NJ', 'coming down as the street paints in', 'still flying',
  'the street is still painting in — a moment', 'the real streets are painting in', 'the painting smudged — recovering', 'back to the walk',
  // player/vehicles.ts (a phone's words)
  'Burn to rise, Vent to sink · the wind steers: pick a layer', 'the stick drives and steers · hold Boost to go faster',
  'the stick steers and throttles · hold Boost for more', 'hold Faster for throttle · pull the stick back to climb',
  'you step out into the sky — Land to come down', 'no dry land within reach — head for shore', 'no street nearby for a car',
  'a hatchback with a bike on the back pulls up — tap Drive', 'no open water nearby', 'a center-console bobs at the water’s edge — tap Board',
  'a center-console waits on the water 120 m away', 'a plane swings alongside — tap Board', 'a high-wing plane is waiting on a clear run — tap Board',
  'no runway here — a plane circles overhead: Fly up, then Board', 'splashdown — the painted sea is forgiving', 'touchdown',
  'clipped a rooftop — the paint forgives: set down nearby', 'a bump and a skid — down', 'the basket settles — down',
  // ui/brush.ts
  'your harlequin balloon — walk over, then tap Step in', 'your center-console — walk out to it to go aboard',
  // ui/commissions.ts (a landmark's name of 26 letters)
  '✧ new commission: Paint Sea Bright First Aid Squad at golden hour', '✧ Paint Sea Bright First Aid Squad at golden hour — frame it, Paint',
  'Black-tailed jackrabbit in pencil — paint one · 12 of 17 animals', 'Harlequin balloon in pencil — paint one · 2 of 4 hot air balloons',
  'place card: Sea Bright Public Library and Museum · paint it to finish',
  // ui/garden.ts, ui/journal.ts
  'seed packet: beach grass', 'can’t plant here — too close to another plant', 'planted beach grass — it grows while you walk', '✦ Rumson–Sea Bright Bridge',
  // ui/photo.ts
  'the paint would not dry — try again', 'almanac: black-tailed jackrabbit + 3 more · yours to paint now',
  '✦ commission done: Paint Sea Bright First Aid Squad at golden hour', 'painted out to 12.5 km · 3.42 km² · Map: your sketchbook',
  'already in colour — the pencil is to the north-east', 'painted into your sketchbook · Map to see it', "you've painted an area the size of a small town",
];
// (a toast for the overlap checks — two lines, as wide as they come — and an arrival card)
const TOAST = 'painted out to 12.5 km · 3.42 km² · Map: your sketchbook';
// [name, the region written short, the time] as ui/arrival.ts paints it on a phone (and a PC's long
// region and sky line, hidden there) — the arrival cards of the copy set: the longest names
const ARRIVAL = ['Monmouth Beach', 'Monmouth County, NJ', '7:42 pm', 'Monmouth County, New Jersey', ' · golden hour · first visit — walk to paint it in'];
const ARRIVALS = [
  ARRIVAL,
  ['Point Pleasant Beach', 'Ocean County, NJ', '12:05 pm', 'Ocean County, New Jersey', ' · fair · 0.35 km² painted so far'],
  ['Bourton-on-the-Water', 'Gloucestershire, England', '11:05 am', 'Gloucestershire, England', ' · sea fog · first visit'],
  ['Saint-Jean-sur-Richelieu', 'Le Haut-Richelieu, Quebec', '10:58 pm', 'Le Haut-Richelieu, Quebec', ' · night · first visit'],
];
// the middle of the screen — x 15–85%, y 30–62% — is the world's while you walk or ride (reviewer round 10)
const BAND = { l: 0.15, r: 0.85, t: 0.3, b: 0.62 };
const STATES = {
  walking: { hint: ['Paint', HINT] },
  'by a lift': { lift: true, hint: ['Lift', "call the lift — you're on floor 3 of 12"] },
  'beside a ride': { ride: 'near', action: 'Board', hint: [null, 'take the helm of this sailboat'] },
  'driving a car': { ride: 'car', driving: true, action: 'Get out', show: ['trboost'], hud: ['🚗 38 km/h', ' · left stick: steer / throttle · ⇧: boost'], hint: ['Paint', HINT] },
  'flying a plane': { ride: 'plane', driving: true, action: 'Jump out', show: ['tthrottle-down', 'tthrottle-up'], hud: ['✈ 212 km/h · alt 480 m · throttle 100%', ' · stick: pitch / bank · +/−: throttle'], hint: ['Paint', HINT] },
  'flying on foot': { ride: 'fly', fly: true, show: ['tfly-up', 'tfly-down'], hint: ['Land', 'hold Up and Down to climb and sink · push the stick far to go faster'] },
  'in a balloon': { ride: 'balloon', driving: true, fly: true, action: 'Jump out', show: ['tfly-up', 'tfly-down', 'tview'], hud: ['🎈 312 m · ↑ 2.1 m/s · 84°C · ↗ 14 km/h · holding', ''], hint: ['Paint', 'the best seat for a painting, out to the horizon'] }, // (main.ts: a phone's words)
};

// ---- in-page: set a state, measure the HUD ----
const MEASURE = ({ s, place, msg, band }) => {
  const $ = (id) => document.getElementById(id);
  const b = document.body;
  b.className = 'touch nomouse walking';
  if (s.driving) b.classList.add('driving');
  if (msg.toast) b.classList.add('toasting');
  if (msg.arrival) b.classList.add('arriving');
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
  ta.style.animation = 'none'; // (measured where it comes to rest, not mid-pop at 0.9×)
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
  // a toast and an arrival card, as main.ts toast() and ui/arrival.ts put them up
  const toast = $('toast'), arr = $('arrival');
  toast.textContent = msg.toast ?? '';
  toast.style.transition = 'none';
  toast.classList.toggle('show', !!msg.toast);
  arr.replaceChildren();
  if (msg.arrival) {
    // (as ui/arrival.ts: the name; the region long and short; the time and the PC's sky line — and a
    // region too long for the phone's line stepped aside, .a-tight)
    const el = (tag, cls, ...kids) => { const d = document.createElement(tag); d.className = cls; d.append(...kids); return d; };
    const [name, short, time, long, more] = msg.arrival;
    arr.append(el('div', 'a-name', name), el('div', 'a-region', el('span', 'a-long', long), el('span', 'a-short', short)), el('div', 'a-line', el('span', 'a-time', time), el('span', 'a-more', more)));
    arr.classList.remove('a-tight', 'a-small');
    if (arr.firstElementChild.scrollWidth > arr.firstElementChild.clientWidth + 1) arr.classList.add('a-small'); // (as ui/arrival.ts)
    if (arr.scrollWidth > arr.clientWidth + 1) arr.classList.add('a-tight');
    arr.style.animation = 'none';
    arr.style.opacity = '1';
  }
  arr.classList.toggle('show', !!msg.arrival);
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
  if (msg.toast) add('toast', '#toast', box(toast));
  if (msg.arrival) add('arrival', '#arrival', box(arr));
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
  // the middle of the frame is the world's: nothing of the HUD stands in it
  const B = { l: innerWidth * band.l, r: innerWidth * band.r, t: innerHeight * band.t, b: innerHeight * band.b };
  for (const q of items) {
    const w = Math.min(q.r, B.r) - Math.max(q.l, B.l), hh = Math.min(q.b, B.b) - Math.max(q.t, B.t);
    if (w > 0.5 && hh > 0.5) hits.push(`${q.label} in the middle (${w.toFixed(0)}×${hh.toFixed(0)} px)`);
  }
  return hits;
};

// ---- in-page: the copy set, each message put up as the game puts it up, whole or cut off ----
const COPYCHECK = ({ texts, arrivals }) => {
  const $ = (id) => document.getElementById(id), b = document.body;
  b.className = 'touch nomouse walking toasting';
  b.dataset.ride = '';
  $('intro')?.classList.add('hidden');
  $('fatal')?.classList.add('hidden');
  const toast = $('toast'), arr = $('arrival'), bad = [];
  toast.style.transition = 'none';
  toast.classList.add('show');
  let most = 0;
  for (const t of texts) {
    toast.textContent = t;
    const lh = parseFloat(getComputedStyle(toast).lineHeight) || 16, lines = Math.round(toast.scrollHeight / lh);
    most = Math.max(most, lines);
    // (two lines at most, clamped: a third line's text is past the box — what reads as "…")
    if (toast.scrollHeight > toast.clientHeight + 1 || lines > 2) bad.push(`toast cut off at two lines (${lines} needed): "${t}"`);
  }
  toast.classList.remove('show');
  b.classList.remove('toasting');
  b.classList.add('arriving');
  const el = (tag, cls, ...kids) => { const d = document.createElement(tag); d.className = cls; d.append(...kids); return d; };
  for (const [name, short, time, long, more] of arrivals) {
    arr.replaceChildren(el('div', 'a-name', name), el('div', 'a-region', el('span', 'a-long', long), el('span', 'a-short', short)), el('div', 'a-line', el('span', 'a-time', time), el('span', 'a-more', more)));
    arr.classList.remove('a-tight', 'a-small');
    if (arr.firstElementChild.scrollWidth > arr.firstElementChild.clientWidth + 1) arr.classList.add('a-small'); // (as ui/arrival.ts)
    if (arr.scrollWidth > arr.clientWidth + 1) arr.classList.add('a-tight'); // (as ui/arrival.ts)
    arr.style.animation = 'none';
    arr.style.opacity = '1';
    arr.classList.add('show');
    const nm = arr.querySelector('.a-name'), ln = arr.querySelector('.a-time');
    const tops = [...arr.querySelectorAll('.a-name, .a-short, .a-time')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().top).sort((p, q) => p - q);
    const rows = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 6).length;
    const cut = arr.scrollWidth > arr.clientWidth + 1 || nm.scrollWidth > nm.clientWidth + 1;
    if (cut || rows > 2 || !ln.getClientRects().length) bad.push(`arrival card ${cut ? 'cut off' : `on ${rows} lines`}: "${name} / ${short} · ${time}"${arr.classList.contains('a-tight') ? ' (region stepped aside)' : ''}`);
    arr.classList.remove('show');
  }
  b.classList.remove('arriving');
  return { bad, most };
};

// (what comes and goes over a state: nothing but its hint; a toast in the hint's place; an arrival card
// over the place name; both at once)
const MESSAGES = { '': {}, 'a toast': { toast: TOAST }, 'an arrival card': { arrival: ARRIVAL }, 'a toast and an arrival card': { toast: TOAST, arrival: ARRIVAL } };
const browser = await chromium.launch({ headless: true });
let bad = 0, n = 0, copyBad = 0, copyN = 0, mostLines = 0;
for (const name of PHONES)
  for (const side of [false, true]) {
    const base = devices[name];
    const dev = side ? (devices[`${name} landscape`] ?? { ...base, viewport: { width: base.viewport.height, height: base.viewport.width } }) : base;
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    await page.route('**/*.js', (r) => r.abort()); // (the CSS and the markup only: no script file runs)
    await page.goto(`http://127.0.0.1:${PORT}${BASE}`, { waitUntil: 'load' });
    for (const [state, s] of Object.entries(STATES))
      for (const [up, msg] of Object.entries(MESSAGES)) {
        const hits = await page.evaluate(MEASURE, { s, place: 'Ocean Avenue North', msg, band: BAND });
        if (args.shots) await page.screenshot({ path: resolve(ROOT, String(args.shots), `${name}${side ? '-side' : ''}-${state}${up ? `-${up}` : ''}.png`.replace(/[^\w.-]+/g, '_')) });
        const tag = `${name}${side ? ' on its side' : ''} (${dev.viewport.width}×${dev.viewport.height}) · ${state}${up ? ` · ${up}` : ''}`;
        n++;
        if (hits.length) { bad++; console.log(`✗ ${tag}: ${hits.join('; ')}`); }
        else if (args.verbose) console.log(`✓ ${tag}`);
      }
    // the copy set: every message whole in its two lines on this phone, this way up
    const cc = await page.evaluate(COPYCHECK, { texts: COPY, arrivals: ARRIVALS });
    copyN += COPY.length + ARRIVALS.length;
    mostLines = Math.max(mostLines, cc.most);
    if (cc.bad.length) { copyBad += cc.bad.length; console.log(`✗ ${name}${side ? ' on its side' : ''} (${dev.viewport.width}×${dev.viewport.height}) · the copy set: ${cc.bad.join('; ')}`); }
    else if (args.verbose) console.log(`✓ ${name}${side ? ' on its side' : ''} · the copy set: ${COPY.length} toasts and ${ARRIVALS.length} arrival cards whole (at most ${cc.most} lines)`);
    await ctx.close();
  }
await browser.close();
server.close();
console.log(bad ? `${bad} of ${n} layouts overlap or stand in the middle` : `${n} layouts, no overlaps, nothing in the middle`);
console.log(copyBad ? `${copyBad} of ${copyN} messages cut off ("…") or over two lines` : `${copyN} messages (${COPY.length} toasts, ${ARRIVALS.length} arrival cards × ${PHONES.length} phones × 2 ways up): every one whole, ${mostLines} lines at most`);
process.exit(bad || copyBad ? 1 : 0);
