// Balloons in the sky: other people's flights. Now and then — most at dawn and dusk, when real
// balloons fly, a few through the day, none at night — a balloon goes up somewhere near you,
// drifts on the wind at its height (world/wind.ts), and comes down: on a beach near where the wind
// took it if there is one (a pilot's favourite field), else open ground. It sits there a while
// with its envelope up — you can walk over and step in (it's yours then) — then packs up.
//
// Deterministic (hard constraint 3): each ~5 km cell of the real map (0.05° of latitude and
// longitude) gets one roll of the dice every half hour of the world's clock (UTC), from which the
// flight's launch point, height, colours and timing all follow. Where it comes down is worked out
// from the terrain once, when first needed, and kept.
import * as THREE from 'three';
import { hashf } from '../assets/core';
import { balloonGeometry, balloonRecipe, flameGeometry, BALLOON_PATTERNS, BALLOON_COLORS, type BalloonPattern } from '../assets/balloon';
import { windAt, windLayers, windKey } from './wind';
import type { Terrain } from './data';
import type { WalkWorld } from '../player/collision';

const CELL = 0.05; // degrees
const SLOT = 1800; // s: one roll of the dice per cell per half hour
// a flight's timeline (s from launch)
const CLIMB = 150, CRUISE = 1260, DOWN = 1500, LANDED = 1980, GONE = 2100;
const SEEN = 9000; // m: shown within this (a balloon is a big thing on the horizon)

export interface Flight {
  id: string;
  seed: number;
  pattern: BalloonPattern;
  colors: number[];
  lat: number; lon: number; // launch
  alt: number; // cruise height above the ground (m)
  t0: number; // launch (s since the epoch)
  wind: [number, number]; // at its cruise height, that half hour
}

/** The flight cell (ci, cj) starts in half hour `slot`, if any: more at dawn and dusk (`hour`, the
 *  local hour of the day), none in the dark. Pure. */
export function flightFor(ci: number, cj: number, slot: number, hour: number): Flight | null {
  if (hour < 5.3 || hour > 20.7) return null;
  const u = (k: number) => hashf(ci * 92821 + cj * 68917 + slot * 7919 + k * 1013);
  const golden = (hour > 5.3 && hour < 9.5) || (hour > 16.5 && hour < 20.7);
  if (u(0) > (golden ? 0.3 : 0.1)) return null;
  const lat = (ci + u(1)) * CELL, lon = (cj + u(2)) * CELL;
  const alt = 180 + u(3) * 520;
  const a = BALLOON_COLORS[Math.floor(u(4) * BALLOON_COLORS.length)];
  let b = BALLOON_COLORS[Math.floor(u(5) * BALLOON_COLORS.length)];
  if (b === a) b = 0xf4f1ea;
  const t0 = slot * SLOT + u(6) * 300;
  const L = windLayers(windKey(lat, lon), t0 / 3600);
  return { id: `${ci}:${cj}:${slot}`, seed: 1 + Math.floor(u(7) * 997), pattern: BALLOON_PATTERNS[Math.floor(u(8) * BALLOON_PATTERNS.length)], colors: [a, b, BALLOON_COLORS[Math.floor(u(9) * BALLOON_COLORS.length)]], lat, lon, alt, t0, wind: windAt(L, alt) };
}

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

interface Live { f: Flight; obj: THREE.Group; env: THREE.Mesh; flame: THREE.Object3D; land: { x: number; z: number } | null | undefined; x: number; y: number; z: number; landed: boolean }

export class AmbientBalloons {
  readonly group = new THREE.Group();
  private live = new Map<string, Live>();
  private taken = new Set<string>();
  private flame = flameGeometry();
  private t = 0;

  constructor(private o: {
    terrain: Terrain;
    walk: WalkWorld;
    mat: THREE.Material;
    geo: { toLatLon: (x: number, z: number) => [number, number]; fromLatLon: (lat: number, lon: number) => [number, number] };
    hour: () => number; // the hour of the day in the world (the light)
  }) {
    this.group.name = 'ambient-balloons';
  }

  private ground(x: number, z: number) { return Math.max(this.o.terrain.heightAt(x, z), 0); }
  /** Beach: dry sand by the sea, off the buildings, with room for an envelope. */
  private beach(x: number, z: number) {
    const T = this.o.terrain, d = T.oceanDistAt(x, z);
    return d > 12 && d < 70 && T.heightAt(x, z) > 0.4 && this.open(x, z);
  }
  private open(x: number, z: number) {
    const T = this.o.terrain, h = T.heightAt(x, z);
    if (!(h > 0.3) || T.sdfAt(x, z) < 3 || this.o.walk.buildingAt(x, z) >= 0) return false;
    for (let a = 0; a < 8; a++) if (this.o.walk.buildingAt(x + Math.sin(a * 0.785) * 10, z + Math.cos(a * 0.785) * 10) >= 0) return false;
    return true;
  }
  /** Where a flight comes down near (x, z): the nearest beach within 2.5 km, else open ground within 800 m. */
  private landing(x: number, z: number, f: Flight): { x: number; z: number } | null {
    const ring = (r1: number, step: number, ok: (x: number, z: number) => boolean) => {
      for (let r = 0; r <= r1; r += step) {
        const n = r ? Math.max(8, Math.floor((r * 6.283) / step)) : 1;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 6.283 + hashf(f.seed) * 6.283, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
          if (ok(px, pz)) return { x: px, z: pz };
        }
      }
      return null;
    };
    return ring(2500, 60, (px, pz) => this.beach(px, pz)) ?? ring(800, 40, (px, pz) => this.open(px, pz));
  }

  /** Where flight f is at time t (s since launch): x, y (the basket's floor), z; null once gone. */
  private at(L: Live, t: number) {
    const f = L.f, [lx, lz] = this.o.geo.fromLatLon(f.lat, f.lon);
    const drift = (s: number) => [lx + f.wind[0] * s, lz + f.wind[1] * s] as const;
    if (t < CRUISE) {
      const [x, z] = drift(t);
      const g = this.ground(x, z);
      return { x, z, y: g + f.alt * smooth(t / CLIMB) + (t > CLIMB ? Math.sin(t / 90) * 18 : 0), landed: false };
    }
    const [ex, ez] = drift(CRUISE);
    if (L.land === undefined) L.land = this.landing(ex, ez, f);
    if (!L.land) {
      // nowhere to come down here: it flies on out of sight
      const [x, z] = drift(t);
      return t > CRUISE + 240 ? null : { x, z, y: this.ground(x, z) + f.alt, landed: false };
    }
    const k = smooth((t - CRUISE) / (DOWN - CRUISE));
    const x = ex + (L.land.x - ex) * k, z = ez + (L.land.z - ez) * k;
    const g0 = this.ground(ex, ez) + f.alt, g1 = this.ground(L.land.x, L.land.z);
    if (t < DOWN) return { x, z, y: g0 + (g1 - g0) * Math.min(1, (t - CRUISE) / (DOWN - CRUISE) * 1.08), landed: false };
    return { x: L.land.x, z: L.land.z, y: g1, landed: true };
  }

  update(px: number, pz: number, dt: number, nowMs = Date.now()) {
    this.t += dt;
    const now = nowMs / 1000, slot = Math.floor(now / SLOT), hour = this.o.hour();
    const [lat, lon] = this.o.geo.toLatLon(px, pz);
    const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
    const want = new Set<string>();
    for (let di = -1; di <= 1; di++)
      for (let dj = -2; dj <= 2; dj++)
        for (const s of [slot, slot - 1]) {
          const f = flightFor(ci + di, cj + dj, s, hour);
          if (!f || this.taken.has(f.id) || now < f.t0 || now > f.t0 + GONE) continue;
          want.add(f.id);
          if (!this.live.has(f.id)) this.spawn(f);
        }
    for (const [id, L] of this.live) {
      const p = want.has(id) ? this.at(L, now - L.f.t0) : null;
      if (!p || Math.hypot(p.x - px, p.z - pz) > SEEN + 2000) { this.drop(id); continue; }
      L.x = p.x; L.y = p.y; L.z = p.z; L.landed = p.landed;
      L.obj.position.set(p.x, p.y, p.z);
      L.obj.visible = Math.hypot(p.x - px, p.z - pz) < SEEN;
      // the burner: long burns on the way up, a blip every ~20 s aloft, quiet on the ground
      const t = now - L.f.t0, cyc = (t + L.f.seed) % 20;
      const burn = p.landed ? 0 : t < CLIMB ? (cyc % 5 < 3.5 ? 1 : 0) : cyc < 2.5 ? 1 : 0;
      const fl = burn ? 0.85 + 0.15 * Math.sin(this.t * 37) : 0.001;
      L.flame.scale.set(fl, fl, fl);
      // packing up: the envelope sighs down over the basket
      const pack = smooth((t - (LANDED + 30)) / (GONE - LANDED - 30));
      L.env.scale.set(1 + pack * 0.4, Math.max(0.04, 1 - pack), 1 + pack * 0.4);
      L.obj.rotation.y = L.f.seed + t * 0.004;
    }
  }
  private spawn(f: Flight) {
    const P = balloonGeometry(balloonRecipe(f.seed, f.colors, f.pattern));
    const obj = new THREE.Group();
    obj.name = `balloon:${f.pattern}`; // (the painting reads what's in frame off the name)
    const env = new THREE.Mesh(P.geo, this.o.mat);
    const flame = new THREE.Mesh(this.flame, this.o.mat);
    flame.position.y = P.burnerY + 0.2;
    obj.add(env, flame);
    obj.traverse((m) => m.layers.enable(1));
    this.group.add(obj);
    this.live.set(f.id, { f, obj, env, flame, land: undefined, x: 0, y: 0, z: 0, landed: false });
  }
  private drop(id: string) {
    const L = this.live.get(id);
    if (!L) return;
    this.group.remove(L.obj);
    L.env.geometry.dispose();
    this.live.delete(id);
  }
  /** A balloon sitting on the ground within r of (x, z), to step into. */
  landedNear(x: number, z: number, r: number) {
    let best: Live | null = null, bd = r;
    for (const L of this.live.values()) {
      if (!L.landed || L.env.scale.y < 0.9) continue;
      const d = Math.hypot(L.x - x, L.z - z);
      if (d < bd) (bd = d), (best = L);
    }
    return best ? { id: best.f.id, x: best.x, z: best.z, yaw: best.obj.rotation.y, pattern: best.f.pattern, colors: best.f.colors } : null;
  }
  /** Stepped into: it's the player's now (vehicles.ts makes it); this flight is over. */
  take(id: string) { this.taken.add(id); this.drop(id); }
  /** The balloons in the sky or on the ground near you (hints). */
  near(x: number, z: number, r: number) { return [...this.live.values()].filter((L) => L.obj.visible && Math.hypot(L.x - x, L.z - z) < r).map((L) => ({ x: L.x, y: L.y, z: L.z, landed: L.landed && L.env.scale.y >= 0.9 })); } // (landed: down with its envelope up — not packing away)
}
