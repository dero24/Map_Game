// Quality tiers, picked once at boot from what the device says about itself. A phone (or any
// touch-first device) gets the 'phone' tier: the paint at CSS resolution (no hi-DPI multiplier),
// a lighter brush pass, a smaller shadow map, smaller ground-paint canvases and a tighter tile
// ring — the desktop set asked ~3 GB of RAM + GPU memory of a phone (docs/earth/LOG.md, mobile
// blank page). A weak phone, or one whose last visit here was killed mid-walk, gets 'low'.
// A city is what kills a phone (Manhattan: its GPU ran out, Chrome crashed and then refused the
// site WebGL): so a phone also keeps its detail tiles under a memory budget, nearest first
// (world/stream.ts), builds one or two real tiles at a time, reclaims the walls of the tiles it
// leaves, reads a smaller skyline, and measures no LiDAR (decoding a city's survey was hundreds
// of MB in the tab, and every measured cell was built twice).
// Knobs the player saved in the panel (panel.ts userKeys) are never overridden.
//
// Pure: no DOM at import time — deviceInfo() is the only browser-facing function.

export type Tier = 'desktop' | 'phone' | 'low';

export interface DeviceInfo {
  coarse: boolean; // (pointer: coarse): the primary pointer is a finger
  hover: boolean; // (hover: hover): the primary pointer can hover (mouse, trackpad)
  touchPoints: number; // navigator.maxTouchPoints
  screenMin: number; // shorter screen side, CSS px
  screenMax: number;
  dpr: number;
  memoryGB?: number; // navigator.deviceMemory (Chromium only; a coarse bucket, ≤ 8)
  cores?: number; // navigator.hardwareConcurrency
  ua: string;
  maxTex?: number; // WebGL MAX_TEXTURE_SIZE
}

export interface TierConfig {
  tier: Tier;
  why: string;
  post: { hiDpi?: boolean; renderScale?: number; paintDetail?: number };
  shadow: { size?: number; enabled?: boolean };
  stream: { loadR: number; dropR: number; coarseR: number; budgetMB?: number; realConc?: number; purge?: boolean };
  /** Cap on the ground-paint canvases (groundPaint.ts sizes them min(4096, cap)). */
  paintTex: number;
  /** Buildings measured from LiDAR (world/lidar.ts). `?lidar=1` / `?lidar=0` overrule it. */
  lidar: boolean;
  /** How far out the skyline reads a city's towers, m (world/skyline.ts). */
  skylineR: number;
}

const TIERS: Record<Tier, Omit<TierConfig, 'tier' | 'why'>> = {
  // the shipped defaults — nothing changes on a desktop
  desktop: { post: {}, shadow: {}, stream: { loadR: 1500, dropR: 2400, coarseR: 8000 }, paintTex: 4096, lidar: true, skylineR: 8000 },
  // CSS-pixel paint (a DPR-3 phone rendered 1.5× its CSS size before), a 60% brush buffer (the
  // Kuwahara radius drops from 7 to ~4 texels: a third of the taps), 1024² shadows, ~half the
  // detail tiles and a 4 km silhouette ring, 2048² ground paint (a quarter of the slice canvas).
  // The ring's detail tiles keep under 200 MB of vertices (a shore town's whole ring is ~110; one
  // downtown cell can be 100+), two real tiles build at once, and a 4 km skyline
  phone: { post: { hiDpi: false, paintDetail: 0.6 }, shadow: { size: 1024 }, stream: { loadR: 900, dropR: 1500, coarseR: 4000, budgetMB: 200, realConc: 2, purge: true }, paintTex: 2048, lidar: false, skylineR: 4000 },
  // …and a weak phone (or one whose last visit died): no shadow pass either — every tree, house and
  // car drawn a second time into the shadow map was half the vertex work of a frame
  low: { post: { hiDpi: false, paintDetail: 0.5, renderScale: 0.75 }, shadow: { size: 1024, enabled: false }, stream: { loadR: 750, dropR: 1300, coarseR: 2500, budgetMB: 120, realConc: 1, purge: true }, paintTex: 1024, lidar: false, skylineR: 3000 },
};
const ORDER: Tier[] = ['desktop', 'phone', 'low'];
const ALIAS: Record<string, Tier> = { desktop: 'desktop', high: 'desktop', phone: 'phone', mobile: 'phone', medium: 'phone', low: 'low', safe: 'low' };

/** A phone-class device: a finger for a pointer, a phone's user agent, or a small touch screen. */
export function isPhoneClass(d: DeviceInfo) {
  const mobileUA = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(d.ua) && !/iPad|Tablet/i.test(d.ua);
  return mobileUA || (d.coarse && !d.hover) || (d.touchPoints > 0 && d.screenMin <= 600);
}

/**
 * The tier for this device. `forced` (?quality=desktop|phone|low) wins; `crashed` (the last load
 * in this tab died while it was on screen — killed for memory, most likely) steps one tier down.
 */
export function pickTier(d: DeviceInfo, opts: { forced?: string | null; crashed?: boolean } = {}): TierConfig {
  const make = (tier: Tier, why: string): TierConfig => ({ tier, why, ...structuredCopy(TIERS[tier]) });
  const f = opts.forced ? ALIAS[opts.forced.toLowerCase()] : undefined;
  if (f) return make(f, `?quality=${opts.forced}`);
  let tier: Tier = 'desktop';
  const why: string[] = [];
  if (isPhoneClass(d)) {
    tier = 'phone';
    why.push(d.coarse ? 'touch screen' : 'phone browser');
    if (d.memoryGB !== undefined && d.memoryGB <= 3) (tier = 'low'), why.push(`${d.memoryGB} GB RAM`);
    else if (d.maxTex !== undefined && d.maxTex <= 4096) (tier = 'low'), why.push(`max texture ${d.maxTex}`);
    else if (d.cores !== undefined && d.cores <= 4 && !/iPhone|iPad|Macintosh/.test(d.ua)) (tier = 'low'), why.push(`${d.cores} cores`);
  } else if (d.memoryGB !== undefined && d.memoryGB <= 2) {
    tier = 'phone';
    why.push(`${d.memoryGB} GB RAM`);
  }
  if (opts.crashed && tier !== 'low') {
    tier = ORDER[ORDER.indexOf(tier) + 1];
    why.push('last visit was cut short');
  }
  return make(tier, why.join(', ') || 'desktop browser');
}

const structuredCopy = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

type Bag = Record<string, unknown>;
/**
 * Lay a tier's knobs over the live parameter bags, skipping any the player saved (`post.hiDpi`
 * style keys, panel.ts userKeys). Returns the keys it set.
 */
export function applyTier(cfg: TierConfig, bags: { post: Bag; shadow: Bag; stream: Bag }, user: ReadonlySet<string>): string[] {
  const set: string[] = [];
  const lay = (name: 'post' | 'shadow' | 'stream', vals: Bag) => {
    for (const [k, v] of Object.entries(vals)) {
      if (v === undefined || user.has(`${name}.${k}`) || !(k in bags[name])) continue;
      if (bags[name][k] !== v) set.push(`${name}.${k}`);
      bags[name][k] = v;
    }
  };
  lay('post', cfg.post);
  lay('shadow', cfg.shadow);
  lay('stream', cfg.stream);
  return set;
}

/**
 * Auto quality, one measuring round: given the mean frame time, the steps to take (the crisper
 * defaults step down on a GPU that can't hold ~40 fps). Round 0 trades resolution for speed;
 * round 1 — still slow after that — drops the render scale and the shadow map. Never a knob in
 * `user`. Returns [bag, key, value] triples to apply.
 */
export function autoSteps(ms: number, round: number, post: { hiDpi: boolean; paintDetail: number; renderScale: number }, shadow: { size: number }, user: ReadonlySet<string>, dpr: number): [string, string, number | boolean][] {
  const out: [string, string, number | boolean][] = [];
  if (ms <= 25) return out;
  if (round === 0) {
    if (!user.has('post.hiDpi') && post.hiDpi && dpr > 1) out.push(['post', 'hiDpi', false]);
    if (!user.has('post.paintDetail') && post.paintDetail > 0.5) out.push(['post', 'paintDetail', 0.5]);
  } else if (ms > 33) {
    if (!user.has('post.renderScale') && post.renderScale > 0.75) out.push(['post', 'renderScale', 0.75]);
    if (!user.has('shadow.size') && shadow.size > 1024) out.push(['shadow', 'size', 1024]);
  }
  return out;
}

/** What the browser says about the device (the only DOM-facing part of this module). */
export function deviceInfo(maxTex?: number): DeviceInfo {
  const mm = (q: string) => { try { return matchMedia(q).matches; } catch { return false; } };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const sw = screen?.width || innerWidth, sh = screen?.height || innerHeight;
  return {
    coarse: mm('(pointer: coarse)'),
    hover: mm('(hover: hover)'),
    touchPoints: nav.maxTouchPoints ?? 0,
    screenMin: Math.min(sw, sh),
    screenMax: Math.max(sw, sh),
    dpr: globalThis.devicePixelRatio || 1,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    ua: nav.userAgent ?? '',
    maxTex,
  };
}
