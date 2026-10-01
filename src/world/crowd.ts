// The beach's people, for one tile, as plain records the main thread's crowd layer draws
// (world/crowdLayer.ts). They go where the beach's things already are: a person on each beach
// chair and towel — the micro layer's umbrella cells (world/micro.ts) and the summer beach round
// the lifeguard stands (props.ts) — one to three to an umbrella, sitting or lying, now and then one
// standing to talk; a family's kids down at the waterline jumping the waves, a parent wading; and a
// lifeguard up in each stand from ten to five, Memorial Day to Labor Day (calendar.ts).
//
// Who comes and goes: each party carries the stretch of the day it's on the beach (calendar.ts
// windowFor over beachDay — the early ones stay latest), so the beach fills through the morning,
// is full from half past eleven to half past three, and empties into the evening; the crowd layer
// draws a record only in its hours. The season is in the gear: out of season there are no umbrellas
// or towels and nobody under them. Every choice a hash of where the thing lies — the same beach for
// every visitor and every tile.
import type { Terrain } from './data';
import { MICRO_STRIDE } from './micro';
import { MICRO_INDEX } from '../assets/micro';
import { hashf } from '../assets/core';
import { beachDay, lifeguardSeason, LIFEGUARD_HOURS, windowFor, worldDate } from './calendar';

/** Floats per person: x, y, z, yaw, pose (POSE), scale, r, g, b, arrive, leave. */
export const CROWD_STRIDE = 11;
/** How each one is posed (creature.ts BEACH): in a beach chair, lying on a towel, sitting on the
 *  sand, standing, a kid jumping the waves, a lifeguard up in the stand. */
export const POSE = { CHAIR: 0, LIE: 1, SIT: 2, STAND: 3, PLAY: 4, GUARD: 5 } as const;

/** The lifeguard stand's seat, above its feet (props.ts builds the stand: platform 2.46, seat on it). */
export const GUARD_SEAT = 2.88;
/** A beach thing someone sits or lies on (props.ts's summer beach hands its own over). */
export interface Seat { x: number; y: number; z: number; yaw: number; k: 'chair' | 'towel' }
/** A lifeguard stand: where it stands (its ground) and the way it looks out (its local +z). */
export interface Stand { x: number; y: number; z: number; yaw: number }
export interface CrowdInput {
  /** the tile's micro records (micro.ts MICRO_STRIDE): its umbrellas, towels and chairs */
  micro?: Float32Array;
  /** the summer beach round the stands (props.ts): umbrellas and the seats under them */
  umbrellas?: [number, number, number][];
  seats?: Seat[];
  stands?: Stand[];
  terrain: Terrain;
  south: boolean;
  date?: Date;
}

// swimsuits and the lifeguard's red (sRGB hex)
const SUIT = [0x1f3f7a, 0xc8302a, 0x2e8a6a, 0xf2c23a, 0xe0705a, 0x5a4a9a, 0x26282c, 0x3a8ac0, 0xd86a9a, 0xf2efe6, 0x8a5a3a];
const GUARD = 0xc8302a;
const H = (x: number, z: number, salt: number) => hashf(Math.floor(x * 10) * 73856093 ^ Math.floor(z * 10) * 19349663 ^ (salt * 83492791));
const facing = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export function beachCrowd(I: CrowdInput): Float32Array {
  const T = I.terrain, out: number[] = [];
  const date = I.date ?? worldDate();
  const put = (x: number, y: number, z: number, yaw: number, pose: number, scale: number, hex: number, win: [number, number]) => {
    out.push(x, y, z, yaw, pose, scale, ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, win[0], win[1]);
  };
  /** Out to sea from a point on the sand (down the distance-to-ocean slope). */
  const seaDir = (x: number, z: number): [number, number] => {
    const gx = T.oceanDistAt(x - 6, z) - T.oceanDistAt(x + 6, z), gz = T.oceanDistAt(x, z - 6) - T.oceanDistAt(x, z + 6), L = Math.hypot(gx, gz) || 1;
    return [gx / L, gz / L];
  };

  // ---- the beach's things: umbrellas, and the chairs and towels under them
  const umbrellas: [number, number, number][] = [...(I.umbrellas ?? [])];
  const seats: Seat[] = [...(I.seats ?? [])];
  const M = I.micro;
  if (M) {
    const UMB = MICRO_INDEX.umbrella, TOW = MICRO_INDEX.towel, CHR = MICRO_INDEX.beachchair;
    for (let i = 0; i + MICRO_STRIDE <= M.length; i += MICRO_STRIDE) {
      const k = M[i + 4];
      if (k === UMB) umbrellas.push([M[i], M[i + 1], M[i + 2]]);
      else if (k === TOW || k === CHR) seats.push({ x: M[i], y: M[i + 1], z: M[i + 2], yaw: M[i + 3], k: k === CHR ? 'chair' : 'towel' });
    }
  }
  // each seat to the nearest umbrella within 3.5 m; the rest in parties of their own (a towel or two
  // with no umbrella: the sunbathers)
  const parties: { at: [number, number, number]; umb: boolean; seats: Seat[] }[] = umbrellas.map((u) => ({ at: u, umb: true, seats: [] }));
  for (const s of seats) {
    let best = -1, bd = 3.5;
    for (let p = 0; p < umbrellas.length; p++) { const d = Math.hypot(umbrellas[p][0] - s.x, umbrellas[p][2] - s.z); if (d < bd) (bd = d), (best = p); }
    if (best < 0) for (let p = umbrellas.length; p < parties.length; p++) { const d = Math.hypot(parties[p].at[0] - s.x, parties[p].at[2] - s.z); if (d < 3) { best = p; break; } }
    if (best < 0) parties.push({ at: [s.x, s.y, s.z], umb: false, seats: [s] });
    else parties[best].seats.push(s);
  }

  for (const P of parties) {
    const [ax, , az] = P.at;
    if (!P.umb && !P.seats.length) continue;
    // the stretch of the day this party is here: keyed so the whole beach is in by the early afternoon
    const win = windowFor(H(ax, az, 1) * 0.985, beachDay);
    if (!win) continue;
    const [sx, sz] = seaDir(ax, az);
    const suit = (k: number) => SUIT[Math.floor(H(ax, az, 20 + k) * SUIT.length)];
    let n = 0;
    // one to a seat, three at most: the chairs sat in, the towels lain or sat on
    for (const s of P.seats) {
      if (n >= 3) break;
      if (s.k === 'chair') put(s.x, s.y, s.z, s.yaw, POSE.CHAIR, 1, suit(n), win);
      else put(s.x, s.y + 0.012, s.z, s.yaw, H(s.x, s.z, 3) < 0.62 ? POSE.LIE : POSE.SIT, 1, suit(n), win);
      n++;
    }
    // an umbrella with no one on a seat yet, or a lone towel: someone sitting in its shade
    if (n === 0 || (n === 1 && H(ax, az, 4) < 0.45)) {
      const ox = ax + sx * 0.7 + sz * (H(ax, az, 5) - 0.5), oz = az + sz * 0.7 - sx * (H(ax, az, 5) - 0.5);
      put(ox, T.heightAt(ox, oz), oz, facing(sx, sz) + (H(ax, az, 6) - 0.5) * 0.8, POSE.SIT, 1, suit(n), win);
      n++;
    }
    // now and then one of them up, talking to the others
    if (n < 3 && H(ax, az, 7) < 0.14) {
      const ox = ax - sx * 1.2 + sz * 1.4, oz = az - sz * 1.2 - sx * 1.4;
      put(ox, T.heightAt(ox, oz), oz, facing(-sz, sx) + (H(ax, az, 8) - 0.5), POSE.STAND, 1, suit(n), win);
    }
    // a family's kids down at the waterline jumping the waves, or a parent wading out
    const fam = H(ax, az, 9);
    if (fam < 0.5) {
      // down the beach to the water's edge (at most 120 m)
      let wx = NaN, wz = NaN;
      for (let t = 2; t < 120; t += 2) {
        const x = ax + sx * t, z = az + sz * t;
        if (T.sdfAt(x, z) < 1.2) { (wx = x), (wz = z); break; }
      }
      if (Number.isFinite(wx)) {
        if (fam < 0.34) {
          const kids = 1 + (H(ax, az, 10) < 0.45 ? 1 : 0);
          for (let k = 0; k < kids; k++) {
            const along = (H(ax, az, 11 + k) - 0.5) * 7, inn = (H(ax, az, 13 + k) - 0.55) * 2;
            const x = wx + sz * along + sx * inn, z = wz - sx * along + sz * inn;
            put(x, Math.max(0, T.heightAt(x, z)), z, facing(sx, sz) + (H(ax, az, 15 + k) - 0.5) * 1.2, POSE.PLAY, 0.56 + H(ax, az, 17 + k) * 0.16, suit(4 + k), win);
          }
        } else {
          // waist-deep a few metres out (the sea's surface at 0)
          const x = wx + sx * (5 + H(ax, az, 18) * 5), z = wz + sz * (5 + H(ax, az, 18) * 5);
          if (T.sdfAt(x, z) < -2) put(x, -0.78, z, facing(-sx, -sz) + (H(ax, az, 19) - 0.5), POSE.STAND, 1, suit(6), win);
        }
      }
    }
  }

  // ---- the lifeguards: one up in each stand, ten to five, Memorial Day to Labor Day
  if (lifeguardSeason(date, I.south))
    for (const s of I.stands ?? []) {
      // on the stand's seat, its back to the land (the stand looks out along its local +z; a person
      // faces −z, so it's turned round)
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), lz = -0.32;
      put(s.x + sn * lz, s.y + GUARD_SEAT - 0.45, s.z + c * lz, s.yaw + Math.PI, POSE.GUARD, 1, GUARD, LIFEGUARD_HOURS);
    }
  return new Float32Array(out);
}
