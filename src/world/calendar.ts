// The shore's calendar: what the date and the hour do to a place's crowds — how full the beach, its
// parking and the marina's slips are, and when the lifeguards sit their stands. One calendar for the
// whole world, read by the tile builders (who is out this month) and the main thread (who is here
// at this hour): a pure function of the date, the hour, the hemisphere and the climate, so every
// visitor on the same day sees the same beach. No place names: a beach is a beach because the map
// says so, and a marina because the map draws one.
//
// The season is fixed when a tile is built (the month: the umbrellas, the boats in the water); the
// hour moves while you watch. Things that come and go through the day carry the stretch of hours
// they are there for (`windowFor`): the beach's people, the cars in its lot.

/** How full a beach is, by the month (warm months of the hemisphere, 1 = January up north): the
 *  season's height in July and August, a handful on a warm day either side, nobody in winter. */
export const BEACH_SEASON = [0, 0, 0, 0, 0.15, 0.7, 1, 1, 0.55, 0.2, 0, 0];

/** Marina slips taken, by the month (warm months of the hemisphere): the boats go in through the
 *  spring, the slips are nearly full from July to August, and they come out through the autumn —
 *  October about half (Jersey's haul-out runs October into November); a winter marina keeps the
 *  boats wintering in the water and the liveaboards. */
export const MARINA_SEASON = [0.22, 0.22, 0.25, 0.35, 0.6, 0.8, 0.9, 0.9, 0.75, 0.55, 0.35, 0.25];

/** The day the world is dressed for when the player picked one (?date=, sent to the tile worker at
 *  init); else today. */
let day: Date | null = null;
export function setWorldDate(iso: string | null | undefined) {
  const t = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(iso + 'T12:00:00Z') : NaN;
  day = Number.isFinite(t) ? new Date(t) : null;
}
export const worldDate = (): Date => day ?? new Date();

/** The month as the warm half of the year counts it: July is 7 up north, January down south. */
export const warmMonth = (month: number, south: boolean) => (south ? ((month + 5) % 12) + 1 : month);
const COLD = new Set(['boreal', 'polar']);
const WARM = new Set(['tropical', 'mediterranean', 'arid']);

/** How full the beach is this month (0..1): BEACH_SEASON, a cold coast's a third of it. */
export function beachSeason(month: number, south: boolean, climate: string) {
  return BEACH_SEASON[warmMonth(month, south) - 1] * (COLD.has(climate) ? 0.3 : 1);
}

/** The share of a marina's slips with a boat in them this month: a warm coast's marina is busy all
 *  year (its winter is the season), a cold one's empties for the ice. */
export function marinaSeason(month: number, south: boolean, climate: string) {
  const m = MARINA_SEASON[warmMonth(month, south) - 1];
  if (WARM.has(climate)) return Math.max(m, 0.72);
  if (COLD.has(climate)) return Math.max(0.05, m - 0.15);
  return m;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How a beach fills over a summer's day (0..1 of the day's crowd): a few early walkers and
 *  swimmers from seven, the families from nine, the full beach from about half past eleven to half
 *  past three, thinning through the late afternoon (half of it still there at six) and gone by half
 *  past eight, the last ones out at sunset. One rise and one fall. */
export function beachDay(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  return 0.12 * smooth(6.5, 9, h) + 0.88 * smooth(8.5, 11.5, h) - 0.88 * smooth(15.5, 19.5, h) - 0.12 * smooth(19, 20.5, h);
}

/** How full a beach's parking lot is (0..1) at an hour: a few cars all day and night (the
 *  residents', the staff's, the early fishermen's), then the beach's day times its season. */
export const BEACH_LOT_FLOOR = 0.06;
export function beachLotFill(hour: number, season: number) {
  return BEACH_LOT_FLOOR + (1 - BEACH_LOT_FLOOR) * season * beachDay(hour);
}

/** Lifeguards are on their stands from Memorial Day to Labor Day — the last Monday of May to the
 *  first Monday of September (half a year round in the south) — from ten to five. */
export const LIFEGUARD_HOURS: [number, number] = [10, 17];
export function lifeguardSeason(date: Date, south: boolean) {
  const y = date.getUTCFullYear();
  // the year's guarded stretch, for the hemisphere: the north's summer, or the south's (from the
  // last Monday of November to the first Monday of March)
  const lastMonday = (yy: number, m: number) => { const d = new Date(Date.UTC(yy, m + 1, 0)); return Date.UTC(yy, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); };
  const firstMonday = (yy: number, m: number) => { const d = new Date(Date.UTC(yy, m, 1)); return Date.UTC(yy, m, 1 + ((8 - d.getUTCDay()) % 7)); };
  const t = Date.UTC(y, date.getUTCMonth(), date.getUTCDate());
  if (!south) return t >= lastMonday(y, 4) && t <= firstMonday(y, 8);
  return t >= lastMonday(y, 10) || t <= firstMonday(y, 2);
}

/** The stretch of the day something keyed `u` (0..1) is there for, when the share there at hour h is
 *  `fill(h)`: there while u < fill(h). For a day with one rise and one fall (a beach's), that is one
 *  stretch — from the hour fill first passes u to the hour it drops back — so the lowest keys come
 *  first and stay latest, and the count at any hour is exactly the fill. [0, 24]: there all day;
 *  null: never. Found on a 3-minute step. */
export function windowFor(u: number, fill: (h: number) => number): [number, number] | null {
  const S = 0.05;
  let a = -1, b = -1;
  for (let h = 0; h < 24; h += S) if (u < fill(h)) { if (a < 0) a = h; b = h + S; }
  if (a < 0) return null;
  if (a === 0 && b >= 24 - S / 2) return [0, 24];
  return [Math.round(a * 100) / 100, Math.round(Math.min(24, b) * 100) / 100];
}
/** Is the hour inside a window (arrive, leave)? Leave before arrive: overnight. */
export const present = (hour: number, arrive: number, leave: number) => {
  if (arrive <= 0 && leave >= 24) return true;
  const h = ((hour % 24) + 24) % 24;
  return arrive <= leave ? h >= arrive && h < leave : h >= arrive || h < leave;
};
