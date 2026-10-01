// The ground under a raised house (review round 11, frame 5: "grass grows in the deep shade under
// the raised house; that's usually where people park"). A house up on pilings stands over what its
// owners put down there: a poured pad to park on, gravel, or by the sea plain sand — never the lawn
// round it, which no sun reaches. The painter fills the footprint with it (groundPaint.ts `setPads`),
// so the grass field (its mask: green paint only) grows none there. Pure: a tile's footprints in,
// rings and kinds out; the kind is a hash of where the house stands.

/** What's under a raised house: a parking pad (poured concrete), gravel, or sand. */
export type PadKind = 'pad' | 'gravel' | 'sand';
/** Their paint (gravel the yards' own, sand the beach's, the pad a shade under a drive's concrete). */
export const PAD_PAINT: Record<PadKind, string> = { pad: '#b2ab9d', gravel: '#b9b4a9', sand: '#dccb9f' };
export interface Pad { ring: [number, number][]; kind: PadKind }
/** A raised house: on pilings at least this high (m; buildings.ts `raise`). */
export const RAISED = 0.5;
/** Within this of the open sea (m) the ground under a house may be the beach's own sand. */
const SANDY = 400;

const hash = (x: number, z: number) => {
  let h = Math.imul(Math.floor(x * 2) ^ 0x2c1b3c6d, 0x85ebca6b) ^ Math.imul(Math.floor(z * 2) + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/** The ground under each raised house of a tile's footprints: a parking pad for about two in five,
 *  gravel for the most of the rest; by the sea (`sea`: metres to the open sea) sand for one in three. */
export function underRaised(fps: readonly { ring: readonly (readonly [number, number])[]; raise: number }[], sea: (x: number, z: number) => number = () => Infinity): Pad[] {
  const out: Pad[] = [];
  for (const f of fps) {
    if (!(f.raise > RAISED) || f.ring.length < 3) continue;
    let cx = 0, cz = 0;
    for (const [x, z] of f.ring) (cx += x), (cz += z);
    (cx /= f.ring.length), (cz /= f.ring.length);
    const h = hash(cx, cz), shore = sea(cx, cz) < SANDY;
    const kind: PadKind = shore ? (h < 0.36 ? 'pad' : h < 0.67 ? 'gravel' : 'sand') : h < 0.42 ? 'pad' : 'gravel';
    out.push({ ring: f.ring.map(([x, z]) => [x, z] as [number, number]), kind });
  }
  return out;
}
