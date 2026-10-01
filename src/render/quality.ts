// Quality tiers, picked once at boot from what the device says about itself. A phone (or any
// touch-first device) gets the 'phone' tier: the paint at CSS resolution (no hi-DPI multiplier),
// a lighter brush pass, a smaller shadow map, smaller ground-paint canvases and a tighter tile
// ring — the desktop set asked ~3 GB of RAM + GPU memory of a phone (docs/earth/LOG.md, mobile
// blank page). A weak phone, or one whose last visit here was killed mid-walk, gets 'low'.
// A city is what kills a phone (Manhattan: its GPU ran out, Chrome crashed and then refused the
// site WebGL): so a phone also keeps its detail tiles under a memory budget, nearest first
// (world/stream.ts), builds one or two real tiles at a time, reads a smaller skyline, and
// measures no LiDAR (decoding a city's survey was hundreds of MB in the tab, and every measured
// cell was built twice).
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
  stream: { loadR: number; dropR: number; coarseR: number; budgetMB?: number; realConc?: number; coarseMB?: number };
  /** Cap on the ground-paint canvases (groundPaint.ts sizes them min(4096, cap)). */
  paintTex: number;
  /** Buildings measured from LiDAR (world/lidar.ts). `?lidar=1` / `?lidar=0` overrule it. */
  lidar: boolean;
  /** How far out the skyline reads a city's towers, m (world/skyline.ts). */
  skylineR: number;
  /** The micro layer's budget (world/microLayer.ts): its impostor atlas, its caps, its ranges. */
  micro: MicroTier;
}

/** A tier's budget for the micro layer (world/microLayer.ts, render/impostor.ts). */
export interface MicroTier {
  /** frames per side of each piece's picture grid; picture size (px) for big (R ≥ 1.2 m) and small pieces */
  N: number; Fbig: number; Fsmall: number;
  /** the widest the atlas may be (px) */
  atlasW: number;
  /** cards drawn at once (nearest first); 3D pieces at once, and their vertices */
  cards: number; near: number; nearVerts: number;
  /** the hand-over range (m); how far cards are drawn (m); the crossfade band (m) */
  lo: number; hi: number; far: number; band: number;
  /** pixels per metre at 1 m the hand-over is worked out for (the tier's typical frame) */
  pxK: number;
  /** pieces photographed per frame while the atlas fills; re-sort every `step` m */
  bakePerFrame: number; step: number;
  /** the 3D pieces cast shadows (the cards only receive them) */
  castNear: boolean;
}
// A desktop draws 64 px pictures of the big pieces (a hoop, a kayak, an umbrella) and 32 px of the
// rest, cards to 450 m and up to 12k of them, 3D pieces to 25–60 m. A phone halves the pictures (a
// quarter of the atlas), draws a third of the cards to 260 m and hands over sooner (18–40 m); a
// weak phone keeps a few hundred cards, the 3D pieces within 14–30 m, and casts no shadows.
export const MICRO_TIERS: Record<Tier, MicroTier> = {
  desktop: { N: 8, Fbig: 64, Fsmall: 32, atlasW: 2048, cards: 12000, near: 500, nearVerts: 160000, lo: 25, hi: 60, far: 450, band: 6, pxK: 900, bakePerFrame: 6, step: 3, castNear: true },
  phone: { N: 8, Fbig: 32, Fsmall: 16, atlasW: 1024, cards: 4000, near: 160, nearVerts: 50000, lo: 18, hi: 40, far: 260, band: 5, pxK: 520, bakePerFrame: 3, step: 3, castNear: true },
  low: { N: 8, Fbig: 32, Fsmall: 16, atlasW: 1024, cards: 1500, near: 80, nearVerts: 24000, lo: 14, hi: 30, far: 160, band: 4, pxK: 400, bakePerFrame: 2, step: 4, castNear: false },
};

const TIERS: Record<Tier, Omit<TierConfig, 'tier' | 'why'>> = {
  // the shipped defaults — nothing changes on a desktop
  desktop: { post: {}, shadow: {}, stream: { loadR: 1500, dropR: 2400, coarseR: 8000 }, paintTex: 4096, lidar: true, skylineR: 8000, micro: MICRO_TIERS.desktop },
  // CSS-pixel paint (a DPR-3 phone rendered 1.5× its CSS size before), a 60% brush buffer (the
  // Kuwahara radius drops from 7 to ~4 texels: a third of the taps), 1024² shadows, ~half the
  // detail tiles and a 4 km silhouette ring, 2048² ground paint (a quarter of the slice canvas).
  // The ring's detail tiles keep under 200 MB of vertices (a shore town's whole ring is ~110; one
  // downtown cell can be 100+), two real tiles build at once, and a 4 km skyline
  // (sharper and farther since 2026-10-01: at CSS pixels and 60% paint a phone's view was a smear,
  // and 4 km of silhouettes left the middle distance to the haze — hi-DPI to 1.5×, 75% paint, a
  // 6 km ring and skyline; the silhouettes stay under coarseMB, and auto quality steps a slow one
  // down once the streaming has settled — and back up when stepping down didn't make it quicker:
  // 85% paint since the same day, a phone's view still read blurry at 75%)
  phone: { post: { hiDpi: true, paintDetail: 0.85 }, shadow: { size: 1024 }, stream: { loadR: 900, dropR: 1500, coarseR: 6000, budgetMB: 200, realConc: 2, coarseMB: 90 }, paintTex: 2048, lidar: false, skylineR: 6000, micro: MICRO_TIERS.phone },
  // …and a weak phone (or one whose last visit died): no shadow pass either — every tree, house and
  // car drawn a second time into the shadow map was half the vertex work of a frame
  low: { post: { hiDpi: false, paintDetail: 0.5, renderScale: 0.75 }, shadow: { size: 1024, enabled: false }, stream: { loadR: 750, dropR: 1300, coarseR: 2500, budgetMB: 120, realConc: 1, coarseMB: 60 }, paintTex: 1024, lidar: false, skylineR: 3000, micro: MICRO_TIERS.low },
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

/** Did a round's steps pay? Frames at least 12% quicker after them. A phone held back by its
 *  vertex work or its CPU gets nothing back from fewer pixels — only a blurrier frame (Robby,
 *  2026-10-01: the paint detail back up, the same speed) — so steps that didn't pay are undone. */
export const stepsPaid = (before: number, after: number) => after <= before * 0.88;

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
