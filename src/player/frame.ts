// The frame's field of view, by the screen's shape — a phone is a window, not a slot (reviewer
// round 10). walkParams.fov is the lens: the vertical angle a PC's 4:3–16:9 screen shows, which
// those screens keep exactly. A fixed vertical angle squeezed a phone held upright to a 31° slot
// across (390×844) and spread one on its side to 105° — wider than a PC's 94°. So:
// · upright (or any tall window), the frame opens taller until it shows 41° across — 78° up and
//   down at 390×844 — and stops at 84° tall on the tallest screens;
// · on its side (or an ultrawide), the frame stops widening at 95° across, and the height gives.
// Every zoom works on the lens (photo mode's wheel and pinch, the brush's push-in, the panel's
// field of view), and the frame follows it in proportion: the same zoom frames the same share of
// the view on every screen.

const RAD = Math.PI / 180;
/** The lens the rules are set for: the default walkParams.fov. */
export const LENS = 62;
/** Upright, the frame opens taller until it shows this much across… */
export const MIN_ACROSS = 41;
/** …but never taller than this. */
export const MAX_TALL = 84;
/** On its side, it stops widening here. */
export const MAX_ACROSS = 95;

const T0 = Math.tan((LENS / 2) * RAD);
const T_MIN_ACROSS = Math.tan((MIN_ACROSS / 2) * RAD);
const T_MAX_TALL = Math.tan((MAX_TALL / 2) * RAD);
const T_MAX_ACROSS = Math.tan((MAX_ACROSS / 2) * RAD);

/** How much taller (> 1) or shorter (< 1) the frame is than the lens alone at this screen shape,
 *  as a factor on tan(half the vertical angle). 1 on every screen from 4:3 to 16:9. */
export function frameScale(aspect: number): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return 1;
  let t = T0;
  if (t * aspect < T_MIN_ACROSS) t = Math.min(T_MAX_TALL, T_MIN_ACROSS / aspect); // upright: open taller
  if (t * aspect > T_MAX_ACROSS) t = T_MAX_ACROSS / aspect; // on its side: no wider than this
  return t / T0;
}

/** The camera's vertical field of view (degrees) for a lens of `lens`° on a screen of `aspect`
 *  (width / height). The lens itself wherever the frame needs no help. */
export function frameFov(lens: number, aspect: number): number {
  const k = frameScale(aspect);
  if (k === 1) return lens;
  const t = Math.tan(Math.min(170, Math.max(1, lens)) / 2 * RAD) * k;
  return Math.min(150, (2 * Math.atan(t)) / RAD);
}

/** What a frame shows across (degrees), from its vertical angle and the screen's shape. */
export function acrossOf(fov: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((fov / 2) * RAD) * aspect)) / RAD;
}
