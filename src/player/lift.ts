// A lift ride (docs/INTERIORS_PLAN.md §3 "Elevators") — a real one. Stand in a tall building's lift
// lobby and call the lift (L): a chooser opens on the next floor; ↑↓ (or the floor's number) picks
// one, L or Enter goes. The nearest car's doors slide open, you step in and turn round, the doors
// close, the floors count by on the car's display while it carries you — under the shut doors your
// feet go to floor0 + k × fH and the building re-centres its build window there (Interiors: the
// ride holds until that storey stands built) — then the doors open on the storey you chose and you
// step out into its lift lobby. Never shut in: if the building goes from under you mid-ride, the
// ride ends with you on a floor in front of the doors, free to walk.
// Pure state and timing — ui/lift.ts draws the chooser and the display; tests drive it directly.
import type { Interiors } from '../world/interiors';
import type { WalkWorld } from './collision';
import type { Plan } from '../world/interior/plan';

/** The one who rides (the walker): where they stand, and a way to put them somewhere. */
export interface Rider {
  x: number; z: number; yaw: number; pitch: number;
  readonly feet: number;
  /** held still (a ride under way: no walking off into a storey still building) */
  holdMove: boolean;
  place(x: number, z: number, yaw?: number, pitch?: number, feet?: number): void;
}
/** idle · choose (the chooser open) · open (the doors) · board (stepping in, turning round) · close ·
 *  ride (the car moving) · arrive (the doors opening on the new storey) · alight (stepping out) ·
 *  shut (the doors closing behind you: you're free already) */
export type LiftPhase = 'idle' | 'choose' | 'open' | 'board' | 'close' | 'ride' | 'arrive' | 'alight' | 'shut';
const DOORS = 0.6, BOARD = 1.0, ALIGHT = 0.9; // s
/** The ride itself: a beat, and a little more for every floor (a real one's 1.5–8 m/s, compressed). */
const RIDE_MIN = 1.3, RIDE_PER = 0.07, RIDE_MAX = 4.2, HOLD_MAX = 8;
/** How far out of the doors you step (m). */
const OUT = 1.3;
type P2 = [number, number];
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerpAng = (a: number, b: number, t: number) => a + (((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * t;
/** The camera's yaw looking along (dx, dz). */
const yawAlong = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export class LiftRide {
  phase: LiftPhase = 'idle';
  /** the storey you called from, the one chosen, of how many */
  from = 0;
  to = 0;
  n = 1;
  /** the storey the car's display shows (it counts by as you ride) */
  shown = 0;
  private t = 0;
  private dur = RIDE_MIN;
  private typed = '';
  private plan: Plan | null = null;
  private li = 0;
  private car = 0;
  private spot = { inside: [0, 0] as P2, door: [0, 0] as P2, out: [0, 1] as P2 };
  private pose = { x: 0, z: 0, yaw: 0, pitch: 0 };
  /** A ride came in (the doors open on storey k): a chime. */
  onArrive?: (k: number) => void;
  constructor(private interiors: Interiors, private walk: WalkWorld, private rider: Rider) {}

  /** The lift you could call from where you stand (null: not in a lift lobby). */
  here() { return this.interiors.liftAt(this.rider.x, this.rider.z, this.rider.feet); }
  get busy() { return this.phase !== 'idle'; }
  /** Held in the ride: the chooser's open or the car has you (the doors closing behind you don't). */
  get holding() { return this.phase !== 'idle' && this.phase !== 'shut'; }
  /** Where you'll step out: in front of the car's doors (world). */
  private outside(): P2 { const s = this.spot; return [s.door[0] + s.out[0] * OUT, s.door[1] + s.out[1] * OUT]; }

  /** Call the lift: the chooser opens on the floor above (below, from the top one). */
  call(): boolean {
    if (this.phase !== 'idle') return false;
    const h = this.here(), P = this.interiors.activePlan;
    if (!h || h.n < 2 || !P?.lifts) return false;
    this.plan = P;
    this.li = P.lifts.indexOf(h.lift);
    this.car = this.interiors.carNear(h.lift, this.rider.x, this.rider.z);
    this.spot = this.interiors.carSpot(h.lift, this.car);
    this.from = this.shown = h.storey;
    this.n = h.n;
    this.to = h.storey + 1 < h.n ? h.storey + 1 : h.storey - 1;
    this.typed = '';
    this.phase = 'choose';
    this.rider.holdMove = true;
    return true;
  }
  /** ▲▼: `d` floors up or down (clamped to the building; the one you're on skipped). */
  step(d: number) {
    if (this.phase !== 'choose' || !d) return;
    this.typed = '';
    let k = Math.max(0, Math.min(this.n - 1, this.to + d));
    if (k === this.from) k = Math.max(0, Math.min(this.n - 1, k + Math.sign(d)));
    if (k !== this.from) this.to = k;
  }
  /** A digit typed: the floor's number as the HUD counts them (1: the ground floor). */
  digit(c: number) {
    if (this.phase !== 'choose') return;
    this.typed = (this.typed + String(c)).slice(-3);
    const f = parseInt(this.typed, 10);
    if (f >= 1 && f <= this.n && f - 1 !== this.from) this.to = f - 1;
    else if (f > this.n) this.typed = String(c);
  }
  cancel() {
    if (this.phase !== 'choose') return;
    this.phase = 'idle';
    this.rider.holdMove = false;
  }
  /** Ride to `to` — or straight to storey k (a lift called and sent in one go). */
  go(k?: number) {
    if (k !== undefined && this.phase === 'idle' && !this.call()) return false;
    if (this.phase !== 'choose') return false;
    if (k !== undefined) this.to = Math.max(0, Math.min(this.n - 1, k));
    if (this.to === this.from) { this.cancel(); return false; }
    const d = Math.abs(this.to - this.from);
    this.dur = Math.min(RIDE_MAX, RIDE_MIN + RIDE_PER * d);
    this.interiors.showCar({ li: this.li, car: this.car, k: this.from });
    this.interiors.riding = true;
    this.phase = 'open';
    this.t = 0;
    return true;
  }

  update(dt: number) {
    if (this.phase === 'idle' || this.phase === 'choose') return;
    const r = this.rider, s = this.spot;
    // (something else took the walker away — a teleport — the ride just ends where they are)
    if (Math.hypot(r.x - s.door[0], r.z - s.door[1]) > 6) return this.end();
    // (the building went from under the ride — left, unloaded, rebuilt: end it on a floor)
    if (this.interiors.activePlan !== this.plan) return this.abort();
    this.t += dt;
    const u = Math.min(1, this.t / (this.phase === 'board' ? BOARD : this.phase === 'alight' ? ALIGHT : this.phase === 'ride' ? this.dur : DOORS));
    const f = (k: number) => this.plan!.floor0 + k * this.plan!.floorH;
    switch (this.phase) {
      case 'open':
        this.interiors.liftDoor(this.li, this.car, this.from, ease(u));
        if (u >= 1) this.next('board');
        break;
      case 'board': {
        // to the doors' front, through them to the middle of the car — facing in, then turning round
        const front: P2 = [s.door[0] + s.out[0] * 0.8, s.door[1] + s.out[1] * 0.8];
        const p = this.path([[this.pose.x, this.pose.z], front, s.inside], ease(u));
        const yIn = yawAlong(-s.out[0], -s.out[1]), yOut = yawAlong(s.out[0], s.out[1]);
        const yaw = u < 0.5 ? lerpAng(this.pose.yaw, yIn, ease(u / 0.35)) : lerpAng(yIn, yOut, ease((u - 0.5) / 0.5));
        r.place(p[0], p[1], yaw, this.pose.pitch * (1 - ease(u / 0.4)), f(this.from) + 0.02);
        if (u >= 1) this.next('close');
        break;
      }
      case 'close':
        this.interiors.liftDoor(this.li, this.car, this.from, 1 - ease(u));
        if (u >= 1) {
          // shut in the car: it (and you) go to the storey you chose; the building builds it round you
          this.interiors.showCar({ li: this.li, car: this.car, k: this.to });
          r.place(s.inside[0], s.inside[1], r.yaw, r.pitch, f(this.to) + 0.02);
          this.interiors.hurry = true;
          this.next('ride');
        }
        break;
      case 'ride':
        this.shown = Math.round(this.from + (this.to - this.from) * ease(u));
        if ((u >= 1 && this.interiors.ready(this.to)) || this.t > HOLD_MAX) {
          this.shown = this.to;
          this.interiors.hurry = false;
          this.onArrive?.(this.to);
          this.next('arrive');
        }
        break;
      case 'arrive':
        this.interiors.liftDoor(this.li, this.car, this.to, ease(u));
        if (u >= 1) this.next('alight');
        break;
      case 'alight': {
        const o = this.outside(), p = this.path([s.inside, o], ease(u));
        r.place(p[0], p[1], lerpAng(this.pose.yaw, yawAlong(s.out[0], s.out[1]), ease(u / 0.6)), r.pitch, f(this.to) + 0.02);
        if (u >= 1) {
          this.settle();
          r.holdMove = false;
          this.interiors.riding = false;
          this.next('shut');
        }
        break;
      }
      case 'shut':
        this.interiors.liftDoor(this.li, this.car, this.to, 1 - ease(u));
        if (u >= 1) this.end();
        break;
    }
  }

  private next(p: LiftPhase) {
    this.phase = p;
    this.t = 0;
    const r = this.rider;
    this.pose = { x: r.x, z: r.z, yaw: r.yaw, pitch: r.pitch };
  }
  /** A point `t` (0 … 1) of the way along a polyline. */
  private path(pts: P2[], t: number): P2 {
    let L = 0;
    const seg: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) L += seg[i] = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    let d = t * L;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) {
        const q = seg[i] > 1e-9 ? Math.min(1, d / seg[i]) : 1;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * q, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * q];
      }
      d -= seg[i];
    }
    return pts[pts.length - 1];
  }
  /** Never shut in: out of the doors onto a floor, clear of every wall. */
  private settle() {
    const r = this.rider;
    if (!this.walk.touching(r.x, r.z, 0.28, r.feet)) return;
    const P = this.interiors.activePlan, L = P?.lifts?.[this.li];
    if (!L) return;
    const [x, z] = this.interiors.liftSpot(L);
    r.place(x, z, r.yaw, r.pitch, r.feet);
  }
  private end() {
    this.interiors.showCar(null);
    this.interiors.hurry = false;
    this.interiors.riding = false;
    this.phase = 'idle';
    this.rider.holdMove = false;
  }
  /** The building went mid-ride: step out of the doors onto whichever storey you're on. */
  private abort() {
    const r = this.rider;
    if (this.phase !== 'shut') {
      const o = this.outside();
      r.place(o[0], o[1], r.yaw, r.pitch, r.feet);
    }
    this.end();
  }
}
