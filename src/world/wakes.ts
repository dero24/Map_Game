// Wakes: every moving boat draws its Kelvin wake on the water behind it — two arms of broken
// white spreading at ~19.5° from its track (the angle any hull's wake keeps, at any speed), the
// faint crests across the track between them, and a churned wash straight behind the stern, all
// fading as they spread and age. Drawn along the boat's own track (sampled every few metres), so a
// turning boat leaves a curving wake and a stopped one's goes on spreading and fading where it
// was. The ambient boats (life sim) and the boat you're riding.
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

interface Trail { x: Float32Array; z: Float32Array; t: Float32Array; k: Float32Array; n: number; head: number; seen: number; y: number; beam: number; src: WakeSource | null }

export class Wakes {
  readonly mesh: THREE.Mesh;
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
          P[v * 3] = x - tz * w * sd; P[v * 3 + 1] = tr.y + 0.035; P[v * 3 + 2] = z + tx * w * sd;
          A[v * 4] = sd; A[v * 4 + 1] = w; A[v * 4 + 2] = s; A[v * 4 + 3] = k * Math.exp(-age / 14);
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
}

function wakeMaterial() {
  const m = paintMaterial({
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
      varying vec4 vWake; // side (-1..1 across), half-width (m), metres behind the stern, strength (faded by age)
      varying float vBeam; // the hull's beam (m)
      void main() {
        vec2 xz = vWorldPos.xz;
        float t = uTime, side = abs(vWake.x), w = vWake.y, s = vWake.z, k = vWake.w;
        float lat = side * w; // metres off the track
        // the arms: a thin broken white lip along each edge of the V (born a hull's length back),
        // the paper left bare in short strokes — never a band
        float din = (1.0 - side) * w; // metres in from the V's edge
        float arm = smoothstep(0.0, 0.3, din) * (1.0 - smoothstep(0.55, 1.3, din));
        arm *= smoothstep(0.42, 0.72, vnoise(xz * 0.9 + vec2(t * 0.12, -t * 0.08)));
        arm *= smoothstep(2.0, 7.0, s) * (1.0 - smoothstep(40.0, 85.0, s));
        // the transverse crests: faint lines across the track between the arms
        float crest = smoothstep(0.85, 0.98, sin(s * 0.9 - side * side * 2.2 - t * 0.6)) * (1.0 - smoothstep(0.5, 0.85, side));
        crest *= 0.25 * exp(-s / 30.0) * smoothstep(0.4, 0.65, vnoise(xz * 0.5 + 3.0));
        // the churn straight behind the stern: as wide as the hull, ragged at its edges, broken into
        // clumps of foam that tumble and thin out over twenty-odd metres
        float ww = vBeam * 0.5 + s * 0.07;
        float core = 1.0 - smoothstep(ww * 0.55, ww * 1.1, lat + (vnoise(xz * 0.8 + t * 0.2) - 0.5) * ww * 0.6);
        float clumps = smoothstep(0.38, 0.78, vnoise(xz * 1.7 - vec2(t * 0.6, t * 0.3)) * 0.65 + vnoise(xz * 4.3 + t * 0.4) * 0.35);
        float wash = core * mix(0.3, 1.0, clumps) * exp(-s / 22.0);
        wash *= smoothstep(0.0, 1.4, s + (vnoise(xz * 2.3 + t) - 0.5) * 1.6); // (thrown up off the transom — no ruled edge)
        float foam = max(arm * 0.8, max(crest, wash * 0.85)) * k;
        vec3 foamCol = vec3(0.95, 0.95, 0.92) * (uAmbSky * 0.9 + uKeyColor * 0.5 * max(uKeyDir.y, 0.0) + uLampColor * 0.05);
        gl_FragColor = vec4(applyFog(foamCol, vWorldPos), clamp(foam, 0.0, 0.8));
      }`,
  });
  // (a few centimetres over the water: pulled forward a few depth steps, like the coast's foam)
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -6;
  m.side = THREE.DoubleSide; // (a ribbon folds over itself on the inside of a tight turn)
  return m;
}
