// Colour by sight: the town is a pencil drawing until you look at it, and whatever you look at washes
// into watercolour, near and far, the first time you see it (docs/agent/gameplay.md "Exploring").
// It is photo mode's read-back (render/post.ts readSeen → render/seen.ts → world/explore.ts
// paintSeenSliced) run as you look about: whenever the view has turned or moved enough, a few
// times a second at most, one look at a time — each laid in a slice a frame, so it never hitches.
// Sketch mode (postParams.sketchFar) draws the pencil; this paints it in.
import * as THREE from 'three';
import type { WatercolorPost } from '../render/post';
import type { Explore } from './explore';
import { mendDepth, skyDepth, unprojectDepth } from '../render/seen';

export interface SightView { yaw: number; pitch: number; x: number; z: number }
/** When to look again: never sooner than `gap` s; then once the view has turned `turn` rad or moved
 *  `move` m — or after `idle` s regardless (what came into view while you stood still). */
export const SIGHT = { gap: 0.35, turn: 0.12, move: 3, idle: 2.5 };

/** Pure: is it time for another look? */
export function shouldLook(last: SightView | null, now: SightView, since: number, o = SIGHT) {
  if (!last) return true;
  if (since < o.gap) return false;
  const dy = Math.atan2(Math.sin(now.yaw - last.yaw), Math.cos(now.yaw - last.yaw));
  const turned = Math.hypot(dy * Math.cos(now.pitch), now.pitch - last.pitch);
  return turned > o.turn || Math.hypot(now.x - last.x, now.z - last.z) > o.move || since > o.idle;
}

export class Sight {
  /** Off until the town is to bloom (the van: when you first step out of its back door). */
  armed = false;
  private busy = false;
  private since = 0;
  private last: SightView | null = null;
  private held = 0;
  /** A look's grid on its long side (a phone's smaller), and how far it paints (m). */
  constructor(private o: { post: WatercolorPost; explore: Explore; camera: THREE.PerspectiveCamera; origin: THREE.Vector3; ground: (x: number, z: number) => number; grid: number; reach: () => number }) {}

  /** The town's first bloom: a held breath (`hush`), then the wash and a chime as the colour runs
   *  out from you to the horizon. */
  bloom(sound: { hush(d: number): void; ui(k: 'wash' | 'chime'): void } | null, hold = 0.9) {
    if (this.armed || this.held > 0) return;
    sound?.hush(hold);
    this.held = hold;
    this.onBloom = () => { sound?.ui('wash'); setTimeout(() => sound?.ui('chime'), 650); };
  }
  private onBloom: (() => void) | null = null;

  /** Right after the frame's post.render: readSeen reads the frame just drawn. */
  update(dt: number, view: SightView) {
    this.since += dt;
    if (this.held > 0 && (this.held -= dt) <= 0) {
      this.armed = true;
      this.last = null;
      this.onBloom?.();
      this.onBloom = null;
    }
    if (!this.armed || this.busy) return;
    if (!shouldLook(this.last, view, this.since)) return;
    this.last = { ...view };
    this.since = 0;
    this.busy = true;
    void this.look().catch(() => { /* a lost frame: the next look covers it */ }).finally(() => { this.busy = false; });
  }

  private async look() {
    const { camera: cam, post, explore, origin } = this.o;
    const a = cam.aspect, L = this.o.grid;
    const w = a >= 1 ? L : Math.max(16, Math.round(L * a)), h = a >= 1 ? Math.max(16, Math.round(L / a)) : L;
    const inv = [...cam.projectionMatrixInverse.elements], cw = [...cam.matrixWorld.elements], off = { x: origin.x, y: 0, z: origin.z };
    const near = cam.near, far = cam.far;
    const depth = await post.readSeen(w, h, near, far);
    if (!depth) return;
    mendDepth(depth, w, h, { thin: Math.round(Math.max(w, h) * 0.06) });
    const g = unprojectDepth(depth, w, h, inv, cw, off, skyDepth(near, far));
    await explore.paintSeenSliced(g, { x: cw[12] + off.x, y: cw[13], z: cw[14] + off.z }, { reach: this.o.reach(), ground: this.o.ground });
  }
}
