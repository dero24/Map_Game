// Boot diagnostics: when the page can't show the world, say why — on the page, where a phone user
// can screenshot it (a phone has no console). The report lands in #fatal: the browser, WebGL and
// the GPU's key limits, the quality tier, how far the boot got, the first shader error log and the
// first JS errors. It opens when WebGL can't start, a shader fails to compile, the boot throws, no
// frame has rendered 15 s after "Begin walking", every frame is failing, or the GPU context is
// lost and not given back; `?diag=1` opens it on demand. index.html's inline boot guard buffers
// errors from before this module ran (a script that can't even parse on an old browser) and shows
// its own short report when the game never starts.
//
// The formatting is pure (tests/diag.test.ts); only the functions marked DOM touch the page.

export interface GlInfo {
  version: 1 | 2;
  renderer: string;
  vendor?: string;
  limits: Record<string, number>;
  ext: Record<string, boolean>;
}

export interface CrashNote { stage: string; tier: string; ageS: number; n: number }

export interface DiagState {
  stage: string;
  t0: number; // ms (performance.now) when the module started
  tier?: string;
  tierWhy?: string;
  ua: string;
  screen: string; // "412×915 @2.63x"
  memGB?: number;
  cores?: number;
  gl?: GlInfo | null;
  glError?: string;
  errors: string[];
  shaderErrors: string[];
  frames: number; // frames fully rendered (post.render returned)
  frameErrors: number;
  frameErrorStreak: number;
  lost: number; // WebGL contexts lost so far
  crashed?: CrashNote | null;
  lostBefore?: number; // GPU contexts the last load in this tab lost (a phone steps down a tier for it)
  began?: number; // performance.now() at Begin walking
  framesAtBegin?: number;
  watchdogS?: number; // no frame this long after Begin walking → the report (default 15)
}

const MAX_LINES = 8;

/** "Chrome 140 · Android 14" / "Safari 17.4 · iOS 17.4" from a user agent. */
export function browserName(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua) ? `iOS ${(ua.match(/OS (\d+[_.]\d+)/)?.[1] ?? '?').replace('_', '.')}`
    : /Android ([\d.]+)/.test(ua) ? `Android ${ua.match(/Android ([\d.]+)/)![1]}`
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const b = ua.match(/(Edg|EdgA|EdgiOS)\/([\d.]+)/) ? `Edge ${ua.match(/(?:Edg|EdgA|EdgiOS)\/(\d+)/)![1]}`
    : ua.match(/SamsungBrowser\/(\d+)/) ? `Samsung Internet ${ua.match(/SamsungBrowser\/(\d+)/)![1]}`
    : ua.match(/(?:Firefox|FxiOS)\/(\d+)/) ? `Firefox ${ua.match(/(?:Firefox|FxiOS)\/(\d+)/)![1]}`
    : ua.match(/(?:Chrome|CriOS)\/(\d+)/) ? `Chrome ${ua.match(/(?:Chrome|CriOS)\/(\d+)/)![1]}`
    : ua.match(/Version\/([\d.]+).*Safari/) ? `Safari ${ua.match(/Version\/([\d.]+)/)![1]}`
    : /AppleWebKit/.test(ua) ? 'WebKit (in-app browser?)' : '?';
  return `${b} · ${os}`;
}

const pad = (k: string) => (k + '          ').slice(0, 10);
const yes = (b: boolean | undefined) => (b ? 'yes' : 'NO');

/** The report shown in #fatal (plain text, ~50 columns so it reads on a phone). `failed` false:
 *  the same facts on request (?diag=1), with nothing wrong. */
export function formatReport(s: DiagState, reason: string, now: number, failed = true): string {
  const L: string[] = [];
  L.push(failed ? `the watercolor walk couldn't show the world:` : 'the watercolor walk — diagnostics:');
  L.push(`  ${reason}`);
  L.push('');
  const secs = ((now - s.t0) / 1000).toFixed(1);
  const began = s.began !== undefined ? ` · ${((now - s.began) / 1000).toFixed(1)} s since Begin walking` : '';
  L.push(`${pad('stage')}${s.stage} · ${secs} s after load${began}`);
  L.push(`${pad('frames')}${s.frames} drawn${s.frameErrors ? ` · ${s.frameErrors} failed` : ''}${s.lost ? ` · GPU context lost ×${s.lost}` : ''}`);
  if (s.tier) L.push(`${pad('quality')}${s.tier}${s.tierWhy ? ` (${s.tierWhy})` : ''}`);
  L.push(`${pad('browser')}${browserName(s.ua)}`);
  L.push(`${pad('screen')}${s.screen}${s.memGB ? ` · ${s.memGB} GB` : ''}${s.cores ? ` · ${s.cores} cores` : ''}`);
  if (s.gl) {
    const g = s.gl, l = g.limits;
    L.push(`${pad('WebGL')}${g.version} · ${g.renderer}${g.vendor && !g.renderer.includes(g.vendor) ? ` (${g.vendor})` : ''}`);
    L.push(`${pad('limits')}tex ${l.MAX_TEXTURE_SIZE} · rb ${l.MAX_RENDERBUFFER_SIZE} · vU ${l.MAX_VERTEX_UNIFORM_VECTORS} · fU ${l.MAX_FRAGMENT_UNIFORM_VECTORS}`);
    L.push(`${pad('')}vary ${l.MAX_VARYING_VECTORS} · tex units ${l.MAX_TEXTURE_IMAGE_UNITS}/${l.MAX_VERTEX_TEXTURE_IMAGE_UNITS} · attribs ${l.MAX_VERTEX_ATTRIBS}`);
    L.push(`${pad('float RT')}color_buffer_float ${yes(g.ext.EXT_color_buffer_float)} · half ${yes(g.ext.EXT_color_buffer_half_float)} · float_linear ${yes(g.ext.OES_texture_float_linear)}`);
  } else L.push(`${pad('WebGL')}${s.glError ?? 'not started'}`);
  if (s.crashed) L.push(`${pad('last load')}stopped at "${s.crashed.stage}" (${s.crashed.tier}) ${Math.round(s.crashed.ageS)} s ago — killed, likely out of memory${s.crashed.n > 1 ? ` (×${s.crashed.n})` : ''}`);
  if (s.lostBefore) L.push(`${pad('last load')}its GPU context was lost${s.lostBefore > 1 ? ` ×${s.lostBefore}` : ''} (out of GPU memory?)`);
  if (s.shaderErrors.length) {
    L.push('');
    L.push('shader error:');
    for (const l of s.shaderErrors[0].split('\n').filter((x) => x.trim()).slice(0, 14)) L.push('  ' + l.slice(0, 160));
  }
  if (s.errors.length) {
    L.push('');
    L.push(`errors (first ${Math.min(MAX_LINES, s.errors.length)} of ${s.errors.length}):`);
    s.errors.slice(0, MAX_LINES).forEach((e, i) => L.push(`  ${i + 1}. ${e.slice(0, 240)}`));
  }
  L.push('');
  L.push(`ua ${s.ua.slice(0, 200)}`);
  return L.join('\n');
}

/** Driver logs carry control characters (ANGLE ends some with a NUL): they print as boxes. */
export const clean = (t: string) => t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');

/** An error, event or rejection reason as one line: "TypeError: x is null @index-3f2a.js:12:5". */
export function errorLine(e: unknown, where?: { filename?: string; lineno?: number; colno?: number }): string {
  const err = e as { name?: string; message?: string; stack?: string } | null;
  let msg = err && typeof err === 'object' && 'message' in err ? `${err.name && err.name !== 'Error' ? err.name + ': ' : ''}${err.message}` : String(e);
  if (where?.filename) msg += ` @${where.filename.split('/').pop()}:${where.lineno ?? 0}${where.colno ? ':' + where.colno : ''}`;
  else if (err?.stack) {
    const at = err.stack.split('\n').find((l) => /:\d+:\d+/.test(l) && !l.includes(msg));
    const m = at?.match(/([^/\s(]+:\d+:\d+)\)?\s*$/);
    if (m) msg += ` @${m[1]}`;
  }
  return clean(msg);
}

// ---- the crash breadcrumb: did the last load in this tab die while on screen? ----

export interface BootRecord { stage: string; tier: string; t: number; clean: boolean; n: number; lost?: number }

/** From the previous load's record: a crash note (it died on screen) or null (clean exit / none). */
export function crashFrom(prev: BootRecord | null, now: number): CrashNote | null {
  if (!prev || prev.clean) return null;
  const ageS = (now - prev.t) / 1000;
  if (!(ageS >= 0) || ageS > 30 * 60) return null; // a stale record (clock change, long-closed tab): not this session's crash
  return { stage: prev.stage, tier: prev.tier, ageS, n: (prev.n || 0) + 1 };
}

/** How many GPU contexts the previous load in this tab lost (0 when none, or the record is stale). */
export function lostFrom(prev: BootRecord | null, now: number): number {
  if (!prev?.lost) return 0;
  const ageS = (now - prev.t) / 1000;
  return ageS >= 0 && ageS <= 30 * 60 ? prev.lost : 0;
}

/** When WebGL won't start in a browser where it may well have run before: what to do about it. */
export const NO_WEBGL = 'WebGL 2 could not start in this browser.\n  If the game ran here before, the browser may have switched WebGL off for this site after a crash:\n  close the browser completely (swipe it away) and open it again — Chrome also offers a Reload\n  button on its "WebGL hit a snag" message.';

// ---- the live state + DOM side ----

const early = () => (globalThis as { __EARLY__?: { errors: string[]; onError?: (m: string) => void; owned?: boolean } }).__EARLY__;

export const diag: DiagState = {
  stage: 'module', t0: typeof performance !== 'undefined' ? performance.now() : 0,
  ua: typeof navigator !== 'undefined' ? navigator.userAgent : '', screen: '',
  errors: [], shaderErrors: [], frames: 0, frameErrors: 0, frameErrorStreak: 0, lost: 0,
};
const KEY = 'mapgame.boot';
let shown = '';
let lostAt = 0;
const dismissed = new Set<string>(); // reasons the player closed: not reopened
let record: BootRecord | null = null;
const save = () => { try { if (record) sessionStorage.setItem(KEY, JSON.stringify(record)); } catch { /* storage off */ } };

/** DOM: start the diagnostics — adopt the boot guard's early errors, read the last load's record. */
export function diagInit(): CrashNote | null {
  const E = early();
  if (E) {
    for (const m of E.errors) diag.errors.push(m);
    E.owned = true;
    // the boot guard's "hasn't started after 25 s" note, on a slow line: it has now — take it down
    const f = typeof document !== 'undefined' ? document.getElementById('fatal') : null;
    if (f && !E.errors.length) f.classList.add('hidden');
    E.onError = (m) => { diag.errors.push(m); if (diag.errors.length > 40) diag.errors.length = 40; showReport(`an error: ${m}`); };
  } else {
    // (no boot guard — a harness page): listen ourselves
    addEventListener('error', (e) => { const m = errorLine(e.error ?? e.message, e); diag.errors.push(m); showReport(`an error: ${m}`); });
    addEventListener('unhandledrejection', (e) => { const m = 'unhandled rejection: ' + errorLine(e.reason); diag.errors.push(m); showReport(m); });
  }
  (globalThis as { __BOOT__?: unknown }).__BOOT__ = diag;
  (globalThis as { __BOOTDIAG__?: unknown }).__BOOTDIAG__ = () => ({ ...diag, report: formatReport(diag, 'on request', performance.now(), false) });
  diag.screen = `${screen.width}×${screen.height} @${(devicePixelRatio || 1).toFixed(2)}x · view ${innerWidth}×${innerHeight}`;
  const nav = navigator as Navigator & { deviceMemory?: number };
  diag.memGB = nav.deviceMemory;
  diag.cores = nav.hardwareConcurrency;
  let prev: BootRecord | null = null;
  try { prev = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as BootRecord | null; } catch { prev = null; }
  diag.crashed = crashFrom(prev, Date.now());
  diag.lostBefore = lostFrom(prev, Date.now());
  record = { stage: 'module', tier: '?', t: Date.now(), clean: false, n: diag.crashed?.n ?? 0 };
  save();
  // A kill while the tab is hidden (the OS reclaiming a background tab) isn't this page's fault:
  // only a death on screen counts as a crash.
  const mark = (clean: boolean) => { if (record) { record.clean = clean; record.t = Date.now(); save(); } };
  addEventListener('pagehide', () => mark(true));
  addEventListener('pageshow', () => mark(false)); // (back from the bfcache: on screen again)
  document.addEventListener('visibilitychange', () => {
    mark(document.visibilityState === 'hidden');
    if (document.visibilityState === 'visible') visibleSince = performance.now(); // (rAF slept while hidden)
  });
  return diag.crashed;
}

/** DOM: a boot stage reached (kept in the tab's breadcrumb so a crash reload can say where). */
export function diagStage(stage: string, tier?: string) {
  diag.stage = stage;
  if (record) {
    record.stage = stage;
    if (tier) record.tier = tier;
    record.t = Date.now();
    if (stage === 'running') record.n = 0; // made it on screen: the crash count starts over
    save();
  }
}

/** WebGL facts for the report (and the tier decision). */
export function glInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): GlInfo {
  const is2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const limits: Record<string, number> = {};
  for (const k of ['MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_ATTRIBS'] as const) limits[k] = gl.getParameter(gl[k]) as number;
  const sup = new Set(gl.getSupportedExtensions() ?? []);
  const ext: Record<string, boolean> = {};
  for (const k of ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'OES_texture_float_linear', 'OES_texture_half_float_linear', 'WEBGL_lose_context', 'KHR_parallel_shader_compile']) ext[k] = sup.has(k);
  return {
    version: is2 ? 2 : 1,
    renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : undefined,
    limits, ext,
  };
}

/** DOM: why WebGL wouldn't start — probe what this browser does offer. */
export function glProbe(e: unknown): string {
  let w2 = false, w1 = false;
  try { w2 = !!document.createElement('canvas').getContext('webgl2'); } catch { /* */ }
  try { w1 = !!document.createElement('canvas').getContext('webgl'); } catch { /* */ }
  return `${errorLine(e)} — webgl2 ${w2 ? 'available' : 'unavailable'}, webgl1 ${w1 ? 'available' : 'unavailable'}`;
}

/** three.js renderer.debug.onShaderError: keep the logs (and the offending source lines). */
export function shaderError(gl: WebGLRenderingContext, program: WebGLProgram, vs: WebGLShader, fs: WebGLShader) {
  const parts: string[] = [];
  const pl = (gl.getProgramInfoLog(program) ?? '').trim();
  for (const [name, sh] of [['vertex', vs], ['fragment', fs]] as const) {
    const log = (gl.getShaderInfoLog(sh) ?? '').trim();
    if (!log && gl.getShaderParameter(sh, gl.COMPILE_STATUS)) continue;
    parts.push(`${name}: ${log || '(no log)'}`);
    const m = log.match(/ERROR: \d+:(\d+)/);
    if (m) {
      const src = (gl.getShaderSource(sh) ?? '').split('\n'), n = +m[1];
      for (let i = Math.max(1, n - 2); i <= Math.min(src.length, n + 1); i++) parts.push(`${i === n ? '>' : ' '}${i}: ${src[i - 1]}`);
    }
  }
  if (pl) parts.push(`link: ${pl}`);
  const msg = clean(parts.join('\n')) || 'program failed to link (no log)';
  diag.shaderErrors.push(msg);
  console.error('THREE.WebGLProgram: Shader Error\n' + msg);
  showReport('a shader failed to compile on this GPU');
}

let lastFrameAt = 0;
let visibleSince = 0;
/** A frame went through (post.render returned — with a live context: a lost one draws nothing). */
export function frameOk() {
  if (lostAt) return;
  diag.frames++;
  diag.frameErrorStreak = 0;
  lastFrameAt = performance.now();
}
/** A frame threw (the loop survives it — but a phone user would only see a frozen or blank page). */
export function frameFailed(e: unknown) {
  diag.frameErrors++;
  diag.frameErrorStreak++;
  if (diag.frameErrors <= 3) diag.errors.push('frame: ' + errorLine(e));
  if (diag.frameErrorStreak === 30) showReport('every frame is failing');
}

/** DOM: Begin walking — from here, frames must appear. */
export function began() {
  diag.began = performance.now();
  diag.framesAtBegin = diag.frames;
  diagStage('walking');
}

export function contextLost() {
  diag.lost++;
  lostAt = performance.now();
  diag.errors.push('WebGL context lost');
  if (record) { record.lost = (record.lost ?? 0) + 1; record.t = Date.now(); save(); } // (the next load here steps down: main.ts)
}
export function contextRestored() { lostAt = 0; lastFrameAt = performance.now(); } // (the restored context gets a fresh window)

/** How long the watchdog waits for a frame (s): `?watchdog=<s>` when given; else 180 in a capture —
 *  a page a test rig drives (`navigator.webdriver`: the phone frames, mobile-check), where a
 *  software GPU at DPR 3 draws a frame every 5–20 s and the report would cover the very frame the
 *  capture is for (review round 12, must-fix 4: both phone-r11 frames were behind it); else 15. */
export function watchdogSeconds(param: string | null, webdriver: boolean): number {
  const asked = Number(param);
  return asked > 0 ? asked : webdriver ? 180 : 15;
}

/** DOM: once a second — the watchdog: no frame 15 s after Begin walking, frames that stop coming
 *  for 15 s while the page is on screen, or a GPU context not given back within 4 s. */
export function diagTick(now = performance.now()) {
  const wd = (diag.watchdogS ?? 15) * 1000;
  const onScreen = typeof document === 'undefined' || document.visibilityState === 'visible';
  if (diag.began !== undefined && onScreen && !lostAt) {
    const first = diag.frames <= (diag.framesAtBegin ?? 0);
    if (!first && diag.stage === 'walking') diagStage('running');
    if (now - Math.max(diag.began, lastFrameAt, visibleSince) > wd)
      showReport(first ? `no frame has rendered in the ${Math.round(wd / 1000)} s since Begin walking` : `the painting stopped: no new frame for ${Math.round(wd / 1000)} s`);
  }
  if (lostAt && now - lostAt > 4000) showReport('the GPU dropped the WebGL context (out of GPU memory?) and did not give it back —\n  reload the page; if it will not start again, close the browser completely and reopen it');
}

/** DOM: open the report in #fatal (once per reason; `?diag=1` and errors reopen it). */
export function showReport(reason: string, failed = true) {
  if (typeof document === 'undefined' || dismissed.has(reason)) return;
  const f = document.getElementById('fatal');
  if (!f) return;
  const text = formatReport(diag, reason, performance.now(), failed);
  if (shown === reason && !f.classList.contains('hidden')) {
    const pre = f.querySelector('pre');
    if (pre) pre.textContent = text; // refresh the numbers in place
    return;
  }
  shown = reason;
  f.textContent = '';
  const bar = document.createElement('div');
  bar.className = 'fatal-bar';
  const copy = document.createElement('button');
  copy.textContent = 'copy';
  copy.onclick = () => { void navigator.clipboard?.writeText(formatReport(diag, reason, performance.now(), failed)).then(() => (copy.textContent = 'copied'), () => (copy.textContent = 'select the text to copy')); };
  const close = document.createElement('button');
  close.textContent = '×';
  close.title = 'close';
  close.onclick = () => { f.classList.add('hidden'); dismissed.add(reason); };
  bar.append(copy, close);
  const pre = document.createElement('pre');
  pre.textContent = text;
  f.append(bar, pre);
  f.classList.remove('hidden');
}
