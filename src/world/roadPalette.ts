// The street palette, shared by the painted ground (groundPaint.ts, near the walker) and the
// far asphalt ribbons (synth.ts roadRibbons) — one colour per street wherever it is drawn, so the
// hand-off between them at the edge of the painted window doesn't show.

export const ROAD_RANK: Record<string, number> = {
  path: 0, footway: 0, cycleway: 0, steps: 0, bridleway: 0, track: 0, service: 1, pedestrian: 1, living_street: 2,
  unclassified: 2, residential: 2, construction: 2, tertiary_link: 3, tertiary: 3, secondary_link: 3, secondary: 4,
  primary_link: 4, primary: 5, trunk: 5, motorway: 6,
};
export const MINOR = new Set(['path', 'footway', 'cycleway', 'steps', 'bridleway', 'track']);

/** A street's pavement colour (sRGB hex). Desert sun bleaches asphalt to a warm pale grey; bike
 *  lanes are asphalt painted by habit (green in North America, red-brown in Europe); paths and
 *  mapped sidewalks are pale. */
export function roadPaint(r: { c: string; sw?: 1 }, region: string, arid: boolean): string {
  const rank = ROAD_RANK[r.c] ?? 1;
  if (r.c === 'cycleway') return region === 'na' ? '#687a62' : region === 'eu' ? '#8a5e52' : '#6a6c6e';
  if (r.sw) return '#b8b2a4';
  if (MINOR.has(r.c)) return '#bdb5a3';
  if (arid) return rank >= 5 ? '#6f6b64' : rank >= 2 ? '#78736b' : '#817b72';
  return rank >= 5 ? '#55575b' : rank >= 2 ? '#606265' : '#6f6d68';
}
