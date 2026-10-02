// Wakes: every moving boat draws its Kelvin wake on the water behind it — two arms spreading at
// ~19.5° from its track (the angle any hull's wake keeps, at any speed), each a thin line of broken
// white with a fainter one inside it, the faint crests across the track between them, and the
// churn straight behind the stern in streaks along it, all fading as they spread and age. Drawn
// along the boat's own track (sampled every few metres), so a turning boat leaves a curving wake and
// a stopped one's goes on spreading and fading where it was. The ambient boats (life sim) and the
// boat you're riding. No wake in water too shallow to carry one (`bedAt`: a dock's sand, a bar).
//
// Review round 11 (calendar-autumn 3): "white lozenges fan across the water at the house's dock …
// its foam is too thick and opaque at 10 m" — the arms were a metre-wide band broken by blobs of
// world-space noise, at up to 80% white. The foam's shape is `wakeFoam` (a plain function the test
// reads); the shader runs its GLSL twin on the same numbers.
import * as THREE from 'three';
import { paintMaterial } from '../render/shared';

export interface WakeSource {
  /** stable per boat while it lives (life-sim slot, or -1 for the ridden boat) */
  id: number;
  x: number; z: number; yaw: number;
  /** speed through the water, m/s (negative = astern) */
  v: number;
  /** the water's level under it */
  y?: number;
  /** stern offset from the position, m (half the hull) */
  stern?: number;
  /** beam, m */
  beam?: number;
}

const MAX_BOATS = 28, SAMPLES = 44, STEP = 2.5, LIFE = 36; // (a 110 m track, gone in half a minute)
const KELVIN = Math.tan((19.47 * Math.PI) / 180); // the arms' spread: lateral offset / distance behind
const MIN_V = 0.8;
/** Foam at its whitest (alpha): watercolour foam is broken paper, never a white sheet. */
export const WAKE_MAX = 0.55;
/** The water's depth (m) under which a wake fades out, and from which it is whole. */
export const SHALLOW: [number, number] = [0.45, 1.3];

// ---- the foam's shape (the shader's twin below): value noise as shared.ts's GLSL has it ----
const fract = (x: number) => x - Math.floor(x);
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash12(x: number, y: number) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  (a += d), (b += d), (c += d);
  return fract((a + b) * c);
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
/** The wake's foam (alpha, 0 … WAKE_MAX) at a point of its ribbon: `sd` across it (−1 port edge, 0
 *  the track, +1 starboard edge), `w` the V's half-width there (m), `s` metres behind the stern, `k`
 *  the strength (speed, age, the shallows), `beam` the hull's, `t` the clock. The arms: a line ~20 cm
 *  wide along each edge of the V, in dashes along it that crawl outward and come and go, a fainter
 *  line a stride inside it; faint crests across the track; the churn behind the stern in streaks
 *  along it; all fading as the wake spreads. */
export function wakeFoam(sd: number, w: number, s: number, k: number, beam: number, t: number) {
  const side = Math.abs(sd), lat = side * w, din = (1 - side) * w, sg = sd < 0 ? -1 : 1;
  let arm = sstep(0.0, 0.05, din) * (1 - sstep(0.1, 0.26, din));
  arm *= sstep(0.5, 0.66, vnoise(s * 0.6 - t * 0.35, sg * 5.3));
  arm *= sstep(2.0, 6.0, s) * Math.exp(-s / 22);
  let arm2 = sstep(0.55, 0.6, din) * (1 - sstep(0.64, 0.76, din));
  arm2 *= 0.45 * sstep(0.55, 0.72, vnoise(s * 0.5 + 3.1 - t * 0.3, sg * 9.1)) * sstep(4.0, 9.0, s) * Math.exp(-s / 16);
  let crest = sstep(0.965, 0.998, Math.sin(s * 0.9 - side * side * 2.2 - t * 0.6)) * (1 - sstep(0.5, 0.85, side));
  crest *= 0.2 * Math.exp(-s / 24) * sstep(0.45, 0.65, vnoise(lat * 0.7 + 3, s * 0.2 + 3));
  const ww = beam * 0.5 + s * 0.05;
  const core = 1 - sstep(ww * 0.45, ww, lat);
  const streak = sstep(0.5, 0.74, vnoise(lat * 3.2, s * 0.3 - t * 0.5));
  const wash = core * streak * Math.exp(-s / 12) * sstep(0.0, 1.2, s);
  return Math.min(WAKE_MAX, Math.max(Math.max(arm, arm2), Math.max(crest, wash * 0.9)) * k * WAKE_MAX);
}

interface Trail { x: Float32Array; z: Float32Array; t: Float32Array; k: Float32Array; n: number; head: number; seen: number; y: number; beam: number; src: WakeSource | null }

export class Wakes {
  readonly mesh: THREE.Mesh;
  /** The bed's height under a point (the terrain's): a wake fades out where the water over it is
   *  shallower than SHALLOW (a dock's sand, a bar) — null: deep everywhere. */
  bedAt: ((x: number, z: number) => number) | null = null;
  private trails = new Map<number, Trail>();
  private pos: Float32Array;
  private att: Float32Array;
  private beamA: Float32Array;
  private geo: THREE.BufferGeometry;
  private idx: Uint16Array;

  constructor() {
    // three vertices a station — port edge, the track, starboard edge — so the track itself is a
    // vertex line (two per station bent the wash into a zigzag down the middle as the V widened)
    const nv = MAX_BOATS * (SAMPLES + 1) * 3;
    this.pos = new Float32Array(nv * 3);
    this.att = new Float32Array(nv * 4);
    this.beamA = new Float32Array(nv);
    this.idx = new Uint16Array(MAX_BOATS * SAMPLES * 12);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aWake', new THREE.BufferAttribute(this.att, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aBeam', new THREE.BufferAttribute(this.beamA, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = (this.mesh = new THREE.Mesh(g, wakeMaterial()));
    m.name = 'wakes';
    m.frustumCulled = false;
    m.renderOrder = 7; // (over the water and the coast's foam)
  }

  /** Per frame: `t` seconds (any monotonic clock), the moving boats this frame. */
  update(t: number, boats: readonly WakeSource[]) {
    for (const tr of this.trails.values()) tr.src = null;
    for (const b of boats) {
      if (this.trails.size >= MAX_BOATS && !this.trails.has(b.id)) continue;
      let tr = this.trails.get(b.id);
      const moving = Math.abs(b.v) > MIN_V;
      if (!tr) {
        if (!moving) continue;
        tr = { x: new Float32Array(SAMPLES), z: new Float32Array(SAMPLES), t: new Float32Array(SAMPLES), k: new Float32Array(SAMPLES), n: 0, head: 0, seen: t, y: b.y ?? 0, beam: b.beam ?? 2.4, src: null };
        this.trails.set(b.id, tr);
      }
      tr.seen = t;
      tr.y = b.y ?? 0;
      tr.beam = b.beam ?? 2.4;
      tr.src = moving ? b : null;
      if (!moving) continue;
      // the stern: the wake starts there, behind the hull
      const st = (b.stern ?? 3) * Math.sign(b.v), sx = b.x + Math.sin(b.yaw) * st, sz = b.z + Math.cos(b.yaw) * st;
      let last = tr.n ? (tr.head + SAMPLES - 1) % SAMPLES : -1;
      // (a slot the sim gave a new boat somewhere else, or a boat called to you: a new track)
      if (last >= 0 && Math.hypot(sx - tr.x[last], sz - tr.z[last]) > 40) (tr.n = 0), (last = -1);
      if (last < 0 || Math.hypot(sx - tr.x[last], sz - tr.z[last]) >= STEP || t - tr.t[last] > 1.5) {
        tr.x[tr.head] = sx; tr.z[tr.head] = sz; tr.t[tr.head] = t;
        tr.k[tr.head] = Math.min(1, Math.max(0.3, Math.abs(b.v) / 7));
        tr.head = (tr.head + 1) % SAMPLES;
        tr.n = Math.min(SAMPLES, tr.n + 1);
      }
    }
    // build the ribbons: from the stern (the boat's own place, if it's still under way) back
    // along the samples, each station as wide as the V is there
    let v = 0, ii = 0;
    const P = this.pos, A = this.att, BM = this.beamA, I = this.idx;
    for (const [id, tr] of [...this.trails]) {
      // (a boat gone from the sim or long stopped: its wake ages out where it lies)
      const newest = tr.n ? tr.t[(tr.head + SAMPLES - 1) % SAMPLES] : -Infinity;
      if (t - newest > LIFE && t - tr.seen > 1) { this.trails.delete(id); continue; }
      const pts: [number, number, number, number][] = []; // x, z, age, strength
      if (tr.src) {
        const b = tr.src, st = (b.stern ?? 3) * Math.sign(b.v);
        pts.push([b.x + Math.sin(b.yaw) * st, b.z + Math.cos(b.yaw) * st, 0, Math.min(1, Math.max(0.3, Math.abs(b.v) / 7))]);
      }
      for (let q = 1; q <= tr.n; q++) {
        const j = (tr.head + SAMPLES - q) % SAMPLES, age = t - tr.t[j];
        if (age > LIFE) break;
        const p = pts[pts.length - 1];
        if (p && Math.hypot(p[0] - tr.x[j], p[1] - tr.z[j]) < 0.3) continue; // (the stern sits on its newest sample)
        pts.push([tr.x[j], tr.z[j], age, tr.k[j]]);
      }
      if (pts.length < 2) continue;
      const v0 = v;
      let s = 0;
      for (let q = 0; q < pts.length && v + 3 <= P.length / 3; q++) {
        const [x, z, age, k] = pts[q];
        if (q) s += Math.hypot(x - pts[q - 1][0], z - pts[q - 1][1]);
        // the track's direction here (toward the boat), its normal to either side
        const a = pts[Math.max(0, q - 1)], c = pts[Math.min(pts.length - 1, q + 1)];
        let tx = a[0] - c[0], tz = a[1] - c[1];
        const L = Math.hypot(tx, tz) || 1;
        tx /= L; tz /= L;
        // the V's half-width: the hull's own at the stern, then the Kelvin arms — still spreading
        // slowly where a boat has stopped
        const w = tr.beam / 2 + 0.7 + KELVIN * s + 0.25 * age; // (+ room for the churn's ragged edge)
        for (const sd of [-1, 0, 1]) {
          const px = x - tz * w * sd, pz = z + tx * w * sd;
          // (none in water too shallow to carry it: a dock's sand, a bar)
          // (ground well above the water is a hole in the data under a boat afloat, or a bank the
          // ribbon reaches over — the land hides that: only the shallows fade it)
          const d = this.bedAt ? tr.y - this.bedAt(px, pz) : Infinity, deep = d < -1 ? 1 : sstep(SHALLOW[0], SHALLOW[1], d);
          P[v * 3] = px; P[v * 3 + 1] = tr.y + 0.035; P[v * 3 + 2] = pz;
          A[v * 4] = sd; A[v * 4 + 1] = w; A[v * 4 + 2] = s; A[v * 4 + 3] = k * Math.exp(-age / 14) * deep;
          BM[v] = tr.beam;
          v++;
        }
        if (q) {
          const p0 = v - 6; // (the last station's port, track, starboard; then this one's)
          for (const h of [0, 1]) {
            const a0 = p0 + h, b0 = p0 + 3 + h;
            I[ii++] = a0; I[ii++] = b0; I[ii++] = a0 + 1;
            I[ii++] = a0 + 1; I[ii++] = b0; I[ii++] = b0 + 1;
          }
        }
      }
      if (v - v0 < 6) v = v0;
    }
    const g = this.geo;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aWake as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aBeam as THREE.BufferAttribute).needsUpdate = true;
    g.index!.needsUpdate = true;
    g.setDrawRange(0, ii);
    this.mesh.visible = ii > 0;
  }

  /** How many boats are drawing a wake (tests, the harness). */
  get count() { return this.trails.size; }
  /** (tests) The ribbon's vertices as drawn: x, z and the strength each carries. */
  vertices(): [number, number, number][] {
    const n = this.geo.drawRange.count, out: [number, number, number][] = [], seen = new Set<number>();
    for (let i = 0; i < n; i++) { const j = this.idx[i]; if (seen.has(j)) continue; seen.add(j); out.push([this.pos[j * 3], this.pos[j * 3 + 2], this.att[j * 4 + 3]]); }
    return out;
  }
}

function wakeMaterial() {
  const m = paintMaterial({
    uniforms: { uWakeMax: { value: WAKE_MAX } }, // (the foam at its whitest: tools/arm-check.js turns it)
    transparent: true,
    depthWrite: false,
    vertex: /* glsl */ `
      attribute vec4 aWake;
      attribute float aBeam;
      varying vec4 vWake;
      varying float vBeam;
      void main() {
        vBeam = aBeam;
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = vec3(0.0, 1.0, 0.0);
        vWake = aWake;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform float uWakeMax;
      varying vec4 vWake; // side (-1..1 across), half-width (m), metres behind the stern, strength (speed, age, the shallows)
      varying float vBeam; // the hull's beam (m)
      void main() {
        // (wakeFoam's twin: the same shapes on the same numbers)
        float t = uTime, sd = vWake.x, side = abs(sd), w = vWake.y, s = vWake.z, k = vWake.w;
        float lat = side * w, din = (1.0 - side) * w, sg = sd < 0.0 ? -1.0 : 1.0;
        // the arms: a thin line of broken white along each edge of the V (born a hull's length back),
        // in dashes along it that crawl outward and come and go, and a fainter line a stride inside
        float arm = smoothstep(0.0, 0.05, din) * (1.0 - smoothstep(0.1, 0.26, din));
        arm *= smoothstep(0.5, 0.66, vnoise(vec2(s * 0.6 - t * 0.35, sg * 5.3)));
        arm *= smoothstep(2.0, 6.0, s) * exp(-s / 22.0);
        float arm2 = smoothstep(0.55, 0.6, din) * (1.0 - smoothstep(0.64, 0.76, din));
        arm2 *= 0.45 * smoothstep(0.55, 0.72, vnoise(vec2(s * 0.5 + 3.1 - t * 0.3, sg * 9.1))) * smoothstep(4.0, 9.0, s) * exp(-s / 16.0);
        // the transverse crests: faint lines across the track between the arms
        float crest = smoothstep(0.965, 0.998, sin(s * 0.9 - side * side * 2.2 - t * 0.6)) * (1.0 - smoothstep(0.5, 0.85, side));
        crest *= 0.2 * exp(-s / 24.0) * smoothstep(0.45, 0.65, vnoise(vec2(lat * 0.7 + 3.0, s * 0.2 + 3.0)));
        // the churn behind the stern: streaks along the track, as wide as the hull, gone in a dozen metres
        float ww = vBeam * 0.5 + s * 0.05;
        float core = 1.0 - smoothstep(ww * 0.45, ww, lat);
        float streak = smoothstep(0.5, 0.74, vnoise(vec2(lat * 3.2, s * 0.3 - t * 0.5)));
        float wash = core * streak * exp(-s / 12.0) * smoothstep(0.0, 1.2, s);
        float foam = min(uWakeMax, max(max(arm, arm2), max(crest, wash * 0.9)) * k * uWakeMax);
        vec3 foamCol = vec3(0.95, 0.95, 0.92) * (uAmbSky * 0.9 + uKeyColor * 0.5 * max(uKeyDir.y, 0.0) + uLampColor * 0.05);
        gl_FragColor = vec4(applyFog(foamCol, vWorldPos), foam);
      }`,
  });
  // (a few centimetres over the water: pulled forward a few depth steps, like the coast's foam)
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -6;
  m.side = THREE.DoubleSide; // (a ribbon folds over itself on the inside of a tight turn)
  return m;
}
