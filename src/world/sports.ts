// Courts and fields from the map: which game a mapped pitch is for (OSM `sport`), the court it is
// played on (its real dimensions), and where that court sits inside the mapped outline — the one
// fit that the ground paint (the lines, groundPaint.ts) and the props (hoops, nets, goals, the
// backstop; props.ts) both use, so the hoop stands exactly on the painted baseline.
// Pure data and geometry (no three.js): realTile.ts runs in the tile service too.

export type Sport = 'basketball' | 'tennis' | 'pickleball' | 'volleyball' | 'soccer' | 'american_football' | 'baseball' | 'softball' | 'skateboard';

const SPORT_OF: Record<string, Sport> = {
  basketball: 'basketball', streetball: 'basketball', tennis: 'tennis', paddle_tennis: 'pickleball', pickleball: 'pickleball', platform_tennis: 'pickleball',
  volleyball: 'volleyball', beachvolleyball: 'volleyball', soccer: 'soccer', futsal: 'soccer', football: 'soccer', american_football: 'american_football',
  rugby_union: 'soccer', rugby_league: 'soccer', lacrosse: 'soccer', field_hockey: 'soccer', baseball: 'baseball', softball: 'softball', skateboard: 'skateboard',
};
/** A pitch's sport from OSM `sport` (a `;` list: the first one we can furnish), else null. */
export function sportOf(tag: string | undefined): Sport | null {
  for (const s of (tag ?? '').split(/[;,]/)) {
    const k = SPORT_OF[s.trim().toLowerCase()];
    if (k) return k;
  }
  return null;
}

/** The court (m: lines' length × width; `gap` between side-by-side courts in one mapped block)
 *  and its paint — public courts as North America colours them (sRGB hex). */
export const COURT: Record<Sport, { L: number; W: number; gap: number; court: string; apron: string; lines: string }> = {
  basketball: { L: 28, W: 15, gap: 3, court: '#5d7f5c', apron: '#7d4c43', lines: '#f4f2ea' },
  tennis: { L: 23.77, W: 10.97, gap: 3.7, court: '#46708c', apron: '#557d51', lines: '#f4f2ea' },
  pickleball: { L: 13.41, W: 6.1, gap: 2.4, court: '#46708c', apron: '#557d51', lines: '#f4f2ea' },
  volleyball: { L: 18, W: 9, gap: 4, court: '#d8c39a', apron: '#d8c39a', lines: '#2f5f9a' },
  soccer: { L: 100, W: 64, gap: 6, court: '#5d8d45', apron: '#5d8d45', lines: '#f4f2ea' },
  american_football: { L: 109.7, W: 48.8, gap: 6, court: '#5d8d45', apron: '#5d8d45', lines: '#f4f2ea' },
  baseball: { L: 27.43, W: 27.43, gap: 0, court: '#5d8d45', apron: '#5d8d45', lines: '#f4f2ea' },
  softball: { L: 18.29, W: 18.29, gap: 0, court: '#5d8d45', apron: '#5d8d45', lines: '#f4f2ea' },
  skateboard: { L: 30, W: 20, gap: 0, court: '#b9b5ac', apron: '#b9b5ac', lines: '#b9b5ac' },
};

/** A mapped surface's colour (OSM `surface`), when it says. */
export function surfacePaint(sf: string | undefined): string | null {
  switch (sf) {
    case 'asphalt': return '#5f6164';
    case 'concrete': case 'paved': return '#a9a59c';
    case 'clay': return '#b5623d';
    case 'grass': return '#679a4c';
    case 'artificial_turf': return '#4c8c43';
    case 'sand': return '#d8c39a';
    case 'dirt': case 'earth': case 'ground': case 'fine_gravel': return '#a88458';
    case 'woodchips': case 'bark_mulch': return '#8f6f4d';
    case 'rubber': case 'tartan': return '#a65a45';
    case 'wood': return '#9c8466';
    default: return null;
  }
}

type P2 = [number, number];
export interface CourtFrame {
  cx: number; cz: number; // the block's centre
  ux: number; uz: number; // along the courts (their length)
  len: number; wid: number; // the mapped outline's extent along / across
  L: number; W: number; // one court's lines, scaled to fit
  n: number; // courts side by side across the block
  step: number; // centre-to-centre across
  half: boolean; // a basketball half court (one key, one hoop at +u)
}

/** Where the courts sit inside a mapped outline: the longest edge sets the axis (mapped courts
 *  are rectangles; a block of tennis courts is one polygon), the outline's extent sets the fit —
 *  a mapped court includes its run-off, a kids' field is smaller than a stadium's (scale ≤ 1),
 *  and a wide block holds several courts side by side. */
export function courtFrame(ring: P2[], sport: Sport): CourtFrame {
  let cx = 0, cz = 0;
  for (const [x, z] of ring) (cx += x), (cz += z);
  cx /= ring.length; cz /= ring.length;
  let best = 0, ux = 1, uz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], L = Math.hypot(bx - ax, bz - az);
    if (L > best) (best = L), (ux = (bx - ax) / L), (uz = (bz - az) / L);
  }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of ring) {
    const a = (x - cx) * ux + (z - cz) * uz, b = -(x - cx) * uz + (z - cz) * ux;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  let len = a1 - a0, wid = b1 - b0;
  const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
  cx += ux * am - uz * bm; cz += uz * am + ux * bm;
  const C = COURT[sport];
  // courts side by side across `e` metres (run-off outside the outer lines as wide as the gap)
  const fits = (e: number) => Math.max(1, Math.floor((e - C.gap) / (C.W + C.gap)));
  // a court's length runs along the outline's long side — unless the block is a row of courts
  // wider than it is long (four tennis courts side by side): then the frame turns
  if (C.gap > 0 && wid >= C.L * 0.85 && fits(len) > fits(wid)) {
    [ux, uz] = [-uz, ux];
    [len, wid] = [wid, len];
  }
  // a park's half court: mapped a key and a bit long (baseline to the half line is 14 m)
  const half = sport === 'basketball' && len < C.L * 0.72;
  const CL = half ? Math.min(Math.max(len * 0.94, 11), 14) : C.L;
  const k = Math.min(1, (len * 0.94) / CL, (wid * 0.94) / C.W);
  const n = C.gap > 0 && k >= 0.95 ? Math.min(8, fits(wid)) : 1;
  return { cx, cz, ux, uz, len, wid, L: CL * k, W: C.W * k, n, step: C.W + C.gap, half };
}

/** A diamond inside a mapped baseball/softball outline: home plate at the corner the two long
 *  straight foul lines leave (the fan's point), the diamond out along their bisector. */
export function diamondFrame(ring: P2[], sport: 'baseball' | 'softball') {
  let bestI = 0, bestS = -1;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n], c = ring[i], q = ring[(i + 1) % n];
    const ax = p[0] - c[0], az = p[1] - c[1], bx = q[0] - c[0], bz = q[1] - c[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1 || lb < 1) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb))));
    if (ang < 1.2 || ang > 1.95) continue; // ~70°–110°
    const s = Math.min(la, lb);
    if (s > bestS) (bestS = s), (bestI = i);
  }
  const p = ring[(bestI + n - 1) % n], c = ring[bestI], q = ring[(bestI + 1) % n];
  let dx = (p[0] - c[0]) / Math.hypot(p[0] - c[0], p[1] - c[1]) + (q[0] - c[0]) / Math.hypot(q[0] - c[0], q[1] - c[1]);
  let dz = (p[1] - c[1]) / Math.hypot(p[0] - c[0], p[1] - c[1]) + (q[1] - c[1]) / Math.hypot(q[0] - c[0], q[1] - c[1]);
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  // full-size bases need foul lines past ~75 m; a little-league or softball field is smaller
  const side = sport === 'softball' || bestS < 75 ? COURT.softball.L : COURT.baseball.L;
  // a mapped diamond-only square: its corner is home, the far corner second base
  const k = Math.min(1, (bestS * 0.98) / side);
  return { hx: c[0], hz: c[1], dx, dz, side: side * Math.max(0.6, k), foul: Math.max(bestS, side * 1.2), little: side < 20 };
}
