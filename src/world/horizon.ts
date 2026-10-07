// The horizon ring: real terrain from just inside the coarse tile ring (~6 km) out to 125 km, so
// the mountains a place is known by stand on its skyline — the Santa Catalinas over Tucson,
// Rainier over Seattle, the Watchungs behind a Jersey town. Two low-zoom Terrarium reads (z10
// near, z9 far) become a polar mesh drawn right after the sky, back to front: whatever is nearer
// (the tiles) paints over it, and its own nearer rings paint over its farther ones. It writes no
// depth, but tests the far layer's own (shared.ts farDepth): a ridge in front of the far
// skyline's towers hides them, the ground behind them doesn't. Earth curvature drops the far
// rim; an aerial-perspective wash takes it toward the sky. Rebuilt when you walk more than 5 km
// from its centre. Deterministic: a pure function of the DEM and the centre.
import * as THREE from 'three';
import { probeGeometry } from '../render/probe';
import { demSampler } from './dem';
import { makeProjector, type LatLon } from './realTile';
import { landcoverAround } from './peaks';
import { GLSL_FAR_DEPTH, paintMaterial } from '../render/shared';
import type { RegionStyle } from './styles';

// (two reads: z10, ~90 m a pixel, out to 60 km; z9 beyond, to 125 km — Rainier stands 95 km from
// Kerry Park, Hood 80 from Portland, Baker 140 from Seattle: a 70 km ring left them all off)
const R0 = 6000, R1 = 125000, NEAR_R = 60000, RINGS = 56, SEG = 384, ZOOM = 10, FAR_ZOOM = 9;
const EARTH = 6371000 * (7 / 6); // standard refraction lengthens the apparent radius

/** Ground tone for the far hills by climate, before haze: forest, scrub, desert, tundra. */
function toneFor(st: Pick<RegionStyle, 'climate'>): [number, number] {
  switch (st.climate) {
    case 'arid': return [0x94806a, 0x6e6f52]; // bare granite + desert scrub (reads blue-grey-violet through the haze)
    case 'mediterranean': return [0xa29a74, 0x6f7550];
    case 'tropical': return [0x5f7a48, 0x4a6a3a];
    case 'boreal': return [0x55664a, 0x3c5036];
    case 'polar': return [0x8e8f8c, 0x6f7470];
    default: return [0x6f7a58, 0x4f6440]; // temperate/continental: wooded ridges
  }
}

export function horizonMaterial(haze = 1) {
  const m = paintMaterial({
    uniforms: { uHaze: { value: haze } },
    vertex: /* glsl */ `
      ${GLSL_FAR_DEPTH}
      attribute vec3 color;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vCol = color;
        gl_Position = projectionMatrix * viewMatrix * wp;
        // past the camera's far plane: never clipped, and at its true distance in the far layer
        gl_Position.z = farDepth(distance(wp.xyz, cameraPosition)) * gl_Position.w;
      }`,
    fragment: /* glsl */ `
      varying vec3 vCol;
      uniform float uHaze;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 col = paintLight(pigment(vCol, vWorldPos * 0.05), N, vWorldPos, 1.0, 1.0);
        vec3 v = vWorldPos - (cameraPosition + uWorldOffset);
        float d = length(v);
        // the local haze by the air's clarity (dry desert air carries 100 km), then aerial
        // perspective: distant ranges go a deep blue-violet under the sky's own tone — a
        // silhouette that reads as mountains — rather than fading into the pale horizon glow
        float snowy = smoothstep(0.72, 0.86, min(vCol.r, min(vCol.g, vCol.b)));
        col = mix(col, applyFog(col, vWorldPos), uHaze);
        vec3 far = fogColorDir(v / max(d, 1.0)) * vec3(0.64, 0.7, 0.88);
        // (the haze is the low air's: a summit's line of sight runs above most of it — Rainier's
        // snow stands clear at 95 km while the foothills under it go blue)
        float lift = exp(-max(0.0, vWorldPos.y * 0.5 - 300.0) / 1800.0);
        // (sunlit snow and ice carry through the haze: a glacier 97 km off still reads white, a
        // shade brighter than the sky behind it)
        col = mix(col, far, 0.78 * (0.5 + 0.5 * uHaze) * (1.0 - exp(-d / 38000.0)) * lift * (1.0 - 0.55 * snowy));
        col = mix(col, col * 1.12 + 0.04, snowy * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false,
  });
  // (depth-tested: the only depth written before it is the far skyline's — see farSkyline.ts)
  m.depthTest = true;
  return m;
}

export class Horizon {
  readonly group = new THREE.Group();
  private cx = Infinity;
  private cz = Infinity;
  private busy = false;
  private mat: THREE.ShaderMaterial;
  private gen = 0;
  /** the season's snowline (season.ts); null until the first season read */
  private snowline: number | null = null;
  private builtSnow: number | null = null;

  constructor(private origin: LatLon, private style: Pick<RegionStyle, 'climate'>, private enabled: boolean) {
    this.group.name = 'horizon';
    // dry air carries far: desert ranges stand sharp and violet at 30 km, humid ones go pale
    this.mat = horizonMaterial(style.climate === 'arid' ? 0.45 : style.climate === 'mediterranean' || style.climate === 'polar' ? 0.7 : 1);
  }
  /** Its material on an empty mesh, for the boot's shader compile (render/warm.ts): the ring is
   *  built later, and compiled as it was first drawn. */
  probes(): THREE.Object3D[] { return [new THREE.Mesh(probeGeometry(), this.mat)]; }

  /** The season's snowline: a move of 250 m or more (a new month, a new date) rebuilds the ring. */
  setSnowline(m: number) {
    this.snowline = m;
    if (this.builtSnow !== null && Math.abs(m - this.builtSnow) > 250 && !this.busy) this.cx = Infinity;
  }

  /** Why the last build came to nothing (null: it didn't) — for ?diag and the tools. */
  lastFail: string | null = null;
  private retryAt = 0;
  private backoff = 30000;

  /** Call per frame with the walker's region position; rebuilds off the frame when due — and a
   *  build that came to nothing (a DEM read or the land cover down as the town loads) is tried again
   *  on a backoff, from 30 s to 10 min: it used to wait for a 5 km walk, and a desktop's first one,
   *  racing the town's own loads, left most arrivals with no mountains on the horizon at all. */
  update(x: number, z: number) {
    const moved = Math.hypot(x - this.cx, z - this.cz) >= 5000;
    const retry = this.lastFail !== null && performance.now() >= this.retryAt;
    if (!this.enabled || this.busy || (!moved && !retry)) return;
    this.busy = true;
    const cx = Math.round(x / 1000) * 1000, cz = Math.round(z / 1000) * 1000;
    const gen = ++this.gen;
    const failed = (why: string) => {
      this.cx = cx; this.cz = cz;
      this.lastFail = why;
      this.retryAt = performance.now() + this.backoff;
      this.backoff = Math.min(600000, this.backoff * 2);
    };
    void this.build(cx, cz)
      .then((mesh) => {
        if (gen !== this.gen) return;
        if (!mesh) return failed('no DEM'); // (offline, the service down, a tile that didn't come)
        for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
        this.group.add(mesh);
        this.cx = cx;
        this.cz = cz;
        this.lastFail = null;
        this.backoff = 30000;
      })
      .catch((e) => failed(String((e as Error)?.message ?? e).slice(0, 160)))
      .finally(() => { this.busy = false; });
  }

  private async build(cx: number, cz: number): Promise<THREE.Mesh | null> {
    const P = makeProjector(this.origin);
    const [clat, clon] = P.unproject(cx, cz);
    const bb = (R: number) => {
      const dLat = (R / 111320) * 1.02, dLon = dLat / Math.max(0.2, Math.cos((clat * Math.PI) / 180));
      return { s: clat - dLat, n: clat + dLat, w: clon - dLon, e: clon + dLon };
    };
    // the mountains' own glaciers and bare rock (OSM, in OpenFreeMap's low-zoom landcover): white and
    // grey whatever the season's snowline says — Rainier's ice runs down to 1,500 m in September
    const [near, farAt, cover] = await Promise.all([
      demSampler(ZOOM, bb(NEAR_R)), demSampler(FAR_ZOOM, bb(R1)),
      Promise.race([landcoverAround(clat, clon, R1), new Promise<null>((r) => setTimeout(() => r(null), 12000))]),
    ]);
    if (!near) return null;
    const rMax = farAt ? R1 : NEAR_R * 0.98; // (the far read failed: the near ring alone)
    const at = (lat: number, lon: number, r: number) => (r < NEAR_R * 0.97 || !farAt ? near(lat, lon) : farAt(lat, lon));
    // the snowline: the season's (season.ts — low in a northern winter, only the high peaks in
    // summer), or by latitude alone before the first season read
    const snow = this.snowline ?? Math.max(700, 5600 - 75 * Math.abs(clat));
    this.builtSnow = snow;
    const [rock, veg] = toneFor(this.style).map((c) => new THREE.Color(c));
    const snowC = new THREE.Color(0xf1f0ec), sea = new THREE.Color(0x7d98a6), iceC = new THREE.Color(0xe8eef0), bareC = new THREE.Color(0x8d8a84);
    const radius = (k: number) => R0 * (rMax / R0) ** (k / (RINGS - 1));
    const n = RINGS * SEG;
    // (ice and rock as the share of each vertex's own patch of ground they cover — nine samples
    // across it: at 97 km a vertex stands for ~9 km², more than all but the biggest glaciers)
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), hts = new Float32Array(n), iceF = new Float32Array(n), rockF = new Float32Array(n);
    const dr = (rMax / R0) ** (1 / (RINGS - 1)) - 1, dA = (Math.PI * 2) / SEG;
    for (let k = 0; k < RINGS; k++) {
      const r = radius(k);
      // the inner rings duck under the tiles' own terrain so their coarse silhouette never shows
      const duck = 60 * Math.max(0, 1 - (r - R0) / 4000);
      for (let a = 0; a < SEG; a++) {
        const t = (a / SEG) * Math.PI * 2;
        const x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r;
        // the highest of nine samples across the vertex's own patch: a summit between two vertices
        // 5 km apart still tops the ring (Rainier stood 2.6 km or 3.7 km tall by where you were)
        let h = -Infinity, ice = 0, bare = 0;
        for (const u of [-1 / 3, 0, 1 / 3])
          for (const w of [-1 / 3, 0, 1 / 3]) {
            const rr = r * (1 + u * dr), tt = t + w * dA;
            const [sla, slo] = P.unproject(cx + Math.cos(tt) * rr, cz + Math.sin(tt) * rr);
            const sh = at(sla, slo, r);
            if (sh > h) h = sh;
            if (!cover || sh < 600) continue;
            const cv = cover.at(sla, slo);
            if (cv === 'ice') ice++;
            else if (cv === 'rock') bare++;
          }
        const i = k * SEG + a;
        hts[i] = h;
        iceF[i] = ice / 9;
        rockF[i] = bare / 9;
        pos[i * 3] = x;
        pos[i * 3 + 1] = h - (r * r) / (2 * EARTH) - duck;
        pos[i * 3 + 2] = z;
      }
    }
    // colour by height + local relief: flats and valleys vegetated, steep and high bare, snow above the line
    const c = new THREE.Color();
    for (let k = 0; k < RINGS; k++) for (let a = 0; a < SEG; a++) {
      const i = k * SEG + a, h = hts[i];
      const nb = [hts[k * SEG + ((a + 1) % SEG)], hts[k * SEG + ((a + SEG - 1) % SEG)], k > 0 ? hts[i - SEG] : h, k < RINGS - 1 ? hts[i + SEG] : h];
      const relief = Math.max(...nb.map((q) => Math.abs(q - h))) / Math.max(250, radius(k) * 0.03);
      if (h <= 0.5) c.copy(sea);
      else {
        c.copy(veg).lerp(rock, Math.min(1, relief * 0.8 + Math.max(0, (h - snow * 0.55) / (snow * 0.45)) * 0.6));
        if (rockF[i] > 0) c.lerp(bareC, 0.65 * rockF[i]);
        if (h > snow) c.lerp(snowC, Math.min(1, (h - snow) / 400));
        // (a vertex a third on ice reads as the glacier's edge; half on it, as the glacier)
        if (iceF[i] > 0) c.lerp(iceC, Math.min(1, iceF[i] * 2));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    // back to front: the outermost band first, so nearer ridges paint over farther ones
    const idx: number[] = [];
    for (let k = RINGS - 2; k >= 0; k--)
      for (let a = 0; a < SEG; a++) {
        const a1 = (a + 1) % SEG, p = k * SEG + a, q = k * SEG + a1, u = (k + 1) * SEG + a, w = (k + 1) * SEG + a1;
        idx.push(p, q, u, q, w, u); // counter-clockwise seen from above
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -9; // after the sky (-10) and the far skyline's towers (-9.5); before anything near
    mesh.name = 'horizon:ring';
    return mesh;
  }
}
