// The horizon ring: real terrain from just inside the coarse tile ring (~6 km) out to 80 km, so
// the mountains a place is known by stand on its skyline — the Santa Catalinas over Tucson,
// Rainier over Seattle, the Watchungs behind a Jersey town. One low-zoom Terrarium read (z9,
// ~250 m a pixel) becomes a polar mesh drawn right after the sky with no depth, back to front:
// whatever is nearer (the tiles) paints over it, and its own nearer rings paint over its
// farther ones. Earth curvature drops the far rim; an aerial-perspective wash takes it toward
// the sky. Rebuilt when you walk more than 5 km from its centre. Deterministic: a pure function
// of the DEM and the centre.
import * as THREE from 'three';
import { demSampler } from './dem';
import { makeProjector, type LatLon } from './realTile';
import { paintMaterial } from '../render/shared';
import type { RegionStyle } from './styles';

const R0 = 6000, R1 = 80000, RINGS = 44, SEG = 240, ZOOM = 9;
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

export function horizonMaterial() {
  const m = paintMaterial({
    vertex: /* glsl */ `
      attribute vec3 color;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vCol = color;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w * 0.99999; // past the camera's far plane: pin to it, never clip
      }`,
    fragment: /* glsl */ `
      varying vec3 vCol;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 col = paintLight(pigment(vCol, vWorldPos * 0.05), N, vWorldPos, 1.0, 1.0);
        vec3 v = vWorldPos - (cameraPosition + uWorldOffset);
        float d = length(v);
        col = applyFog(col, vWorldPos);
        // aerial perspective: distant ranges go blue-grey toward the sky, never quite vanish
        col = mix(col, fogColorDir(v / max(d, 1.0)), 0.72 * (1.0 - exp(-d / 42000.0)));
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false,
  });
  m.depthTest = false;
  return m;
}

export class Horizon {
  readonly group = new THREE.Group();
  private cx = Infinity;
  private cz = Infinity;
  private busy = false;
  private mat = horizonMaterial();
  private gen = 0;

  constructor(private origin: LatLon, private style: Pick<RegionStyle, 'climate'>, private enabled: boolean) {
    this.group.name = 'horizon';
  }

  /** Call per frame with the walker's region position; rebuilds off the frame when due. */
  update(x: number, z: number) {
    if (!this.enabled || this.busy || Math.hypot(x - this.cx, z - this.cz) < 5000) return;
    this.busy = true;
    const cx = Math.round(x / 1000) * 1000, cz = Math.round(z / 1000) * 1000;
    const gen = ++this.gen;
    void this.build(cx, cz)
      .then((mesh) => {
        if (gen !== this.gen) return;
        if (!mesh) { this.cx = cx; this.cz = cz; return; } // no DEM here (offline / service down): try again after a walk
        for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
        this.group.add(mesh);
        this.cx = cx;
        this.cz = cz;
      })
      .catch(() => { this.cx = cx; this.cz = cz; })
      .finally(() => { this.busy = false; });
  }

  private async build(cx: number, cz: number): Promise<THREE.Mesh | null> {
    const P = makeProjector(this.origin);
    const [clat, clon] = P.unproject(cx, cz);
    const dLat = (R1 / 111320) * 1.02, dLon = dLat / Math.max(0.2, Math.cos((clat * Math.PI) / 180));
    const at = await demSampler(ZOOM, { s: clat - dLat, n: clat + dLat, w: clon - dLon, e: clon + dLon });
    if (!at) return null;
    const snow = Math.max(700, 5600 - 75 * Math.abs(clat)); // snowline falls with latitude
    const [rock, veg] = toneFor(this.style).map((c) => new THREE.Color(c));
    const snowC = new THREE.Color(0xf1f0ec), sea = new THREE.Color(0x7d98a6);
    const radius = (k: number) => R0 * (R1 / R0) ** (k / (RINGS - 1));
    const n = RINGS * SEG;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), hts = new Float32Array(n);
    for (let k = 0; k < RINGS; k++) {
      const r = radius(k);
      // the inner rings duck under the tiles' own terrain so their coarse silhouette never shows
      const duck = 60 * Math.max(0, 1 - (r - R0) / 4000);
      for (let a = 0; a < SEG; a++) {
        const t = (a / SEG) * Math.PI * 2;
        const x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r;
        const [lat, lon] = P.unproject(x, z);
        const h = at(lat, lon);
        const i = k * SEG + a;
        hts[i] = h;
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
      else c.copy(veg).lerp(rock, Math.min(1, relief * 0.8 + Math.max(0, (h - snow * 0.55) / (snow * 0.45)) * 0.6));
      if (h > snow) c.lerp(snowC, Math.min(1, (h - snow) / 400));
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
    mesh.renderOrder = -9; // right after the sky dome (-10), before anything with depth
    mesh.name = 'horizon:ring';
    return mesh;
  }
}
