// The camera's near plane, for how high the eye is over what's below it. On foot it's 25 cm: a
// wall at arm's length still draws. Up high nothing is within metres of the eye, and a 25 cm near
// plane spent the depth buffer's precision on that empty air: 2 km out one step of it was a metre,
// so shore ground a metre over the sea plane fought it for the same pixels — the ground flashed
// blue and green under a flight. The near plane grows with the clearance (1% of it), and a depth
// step 3 km out from 1 km up is a few centimetres again.

/** Metres of clearance per metre of near plane (1%: at 500 m up it's 5 m — nothing is nearer). */
const PER = 0.01;
export const NEAR_MIN = 0.25, NEAR_MAX = 40;

/** The near plane for an eye at height `y` over (x, z): its clearance over the highest ground in
 *  a 120 m square round it (a cliff beside a canyon flight, not only the floor under it) and the
 *  sea; in quarter-octave steps, so a drifting height doesn't rebuild the projection each frame. */
export function nearPlane(y: number, x: number, z: number, ground: (x: number, z: number) => number): number {
  let top = 0; // (the sea plane)
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) top = Math.max(top, ground(x + i * 30, z + j * 30));
  const n = (y - top) * PER;
  if (!(n > NEAR_MIN * 1.19)) return NEAR_MIN;
  const q = NEAR_MIN * 2 ** (Math.floor(Math.log2(n / NEAR_MIN) * 4) / 4);
  return Math.min(NEAR_MAX, +q.toFixed(3));
}

/** One step of a 24-bit depth buffer `d` metres out, for a near plane `n` (far ≫ n): what two
 *  surfaces must be apart by not to fight over a pixel. */
export const depthStep = (d: number, n: number) => (d * d) / (n * 2 ** 24);
