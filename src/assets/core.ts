// The asset foundry's shared workshop: the primitives, growth maths and validation every family
// (vehicles, rocks, flora, fauna, furniture) builds from. See docs/ASSET_FOUNDRY.md.
//
// Output contract (unchanged from the kit): non-indexed BufferGeometry with `color` (white =
// tintable by instance colour) and `aPart` (0 body · 1/2 fore/hind limbs · 3 head/nav lights ·
// 4 tail lights · 5 tail · 6 head · 7 wings · 8 petals/blossom) — the same channels the painted
// materials read. Metres; y up; front toward −z; origin on the ground (or waterline).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TINT = 0xffffff; // tintable surfaces (the instance colour paints them)
export const P = { body: 0, fore: 1, hind: 2, head: 3, tailLight: 4, tail: 5, skull: 6, wing: 7, bloom: 8 } as const;

export function part(g: THREE.BufferGeometry, hex: number, id = 0) {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  if (geo.getAttribute('uv1')) geo.deleteAttribute('uv1');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), pa = new Float32Array(n).fill(id);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  return geo;
}
export const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;
export const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A side profile (z along the length, y up) extruded across the width, centred on x = 0. */
export function profile(pts: [number, number][], width: number, bevel = 0.05, bevelSegments = 1) {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, width - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate((width - 2 * bevel) / 2, 0, 0);
  return g;
}

/** A turned shape: [radius, y] pairs spun about y. */
export const lathe = (pts: [number, number][], segs = 10) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), segs);

/** A tapered limb between two points (trunks, branches, legs, stems). */
export function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, segs = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length() || 1e-4;
  const g = new THREE.CylinderGeometry(r1, r0, L, segs, 1, false);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** A smooth tapered tube through a run of points (a trunk that bends, a limb with a knee): one
 *  ring of `sides` per point, each ring square to the path's direction there (turned along the
 *  path without twisting), its normals the ring's own outward directions leaned by the taper — so
 *  the bark shades round and unbroken through every bend, where a chain of `limb`s creases at each
 *  joint. Open at both ends. */
export function tube(pts: THREE.Vector3[], radii: number[], sides = 6) {
  const n = pts.length;
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    T.push(t.lengthSq() > 1e-12 ? t.normalize() : (T[i - 1]?.clone() ?? new THREE.Vector3(0, 1, 0)));
  }
  // the ring's frame carried along the path (parallel transport): no twist, no flip at a bend
  const N: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
  const ref = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(new THREE.Vector3().crossVectors(T[0], ref).normalize());
  for (let i = 1; i < n; i++) {
    const q = new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i]);
    N.push(N[i - 1].clone().applyQuaternion(q).normalize());
  }
  for (let i = 0; i < n; i++) B.push(new THREE.Vector3().crossVectors(T[i], N[i]).normalize());
  const ring: number[][] = [], nrm: number[][] = [];
  for (let i = 0; i < n; i++) {
    const L = i ? pts[i].distanceTo(pts[i - 1]) : pts[1].distanceTo(pts[0]);
    const dr = ((radii[Math.min(n - 1, i + 1)] - radii[Math.max(0, i - 1)]) / Math.max(1e-4, (i > 0 && i < n - 1 ? 2 : 1) * L)) || 0;
    const R: number[] = [], Nn: number[] = [];
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const ox = N[i].x * c + B[i].x * s, oy = N[i].y * c + B[i].y * s, oz = N[i].z * c + B[i].z * s;
      R.push(pts[i].x + ox * radii[i], pts[i].y + oy * radii[i], pts[i].z + oz * radii[i]);
      // (a tapering tube's surface leans back along the path: its normal tips toward the tip)
      const nx = ox - T[i].x * dr, ny = oy - T[i].y * dr, nz = oz - T[i].z * dr, l = Math.hypot(nx, ny, nz) || 1;
      Nn.push(nx / l, ny / l, nz / l);
    }
    ring.push(R); nrm.push(Nn);
  }
  const pos: number[] = [], nor: number[] = [];
  const put = (i: number, k: number) => {
    const kk = k % sides;
    pos.push(ring[i][kk * 3], ring[i][kk * 3 + 1], ring[i][kk * 3 + 2]);
    nor.push(nrm[i][kk * 3], nrm[i][kk * 3 + 1], nrm[i][kk * 3 + 2]);
  };
  for (let i = 0; i + 1 < n; i++)
    for (let k = 0; k < sides; k++) {
      put(i, k); put(i, k + 1); put(i + 1, k + 1);
      put(i, k); put(i + 1, k + 1); put(i + 1, k);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A soft lumpy blob (crowns, bodies, bushes): a displaced icosahedron whose shared corners move
 *  together (no cracks). `squash` flattens y; `lump` sets how knobbly. */
export function blob(r: number, seed: number, opts: { detail?: number; squash?: number; lump?: number } = {}) {
  const g = new THREE.IcosahedronGeometry(r, opts.detail ?? 1);
  const pos = g.attributes.position;
  const lump = opts.lump ?? 0.28, sq = opts.squash ?? 0.85;
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let n = seen.get(k);
    if (n === undefined) {
      n = 1 - lump / 2 + lump * hashf(Math.floor((x / r + 9) * 3) * 73 + Math.floor((y / r + 9) * 3) * 19 + Math.floor((z / r + 9) * 3) + seed * 131);
      seen.set(k, n);
    }
    pos.setXYZ(i, x * n, y * n * sq, z * n);
  }
  // soft normals (the ellipsoid's, not each facet's): a lumpy silhouette that still shades as
  // one rounded mass — flat facet normals read as cut gems up close
  const nrm = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) / (sq * sq), z = pos.getZ(i), L = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / L; nrm[i * 3 + 1] = y / L; nrm[i * 3 + 2] = z / L;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

/** A thin double-sided leaf/petal/frond card along +z from the origin, bent down along its length. */
export function card(w: number, l: number, bend = 0.2, segs = 3) {
  const pos: number[] = [];
  const at = (t: number, s: number): [number, number, number] => {
    const width = w * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.5 + w * 0.08;
    return [s * width, -bend * l * t * t, l * t];
  };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const a = at(t0, -1), b = at(t0, 1), c = at(t1, 1), d = at(t1, -1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d); // up face
    pos.push(...a, ...c, ...b, ...a, ...d, ...c); // under face
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // soft foliage shading: lean every normal toward the sky, so thin blades read as lit leaves
  // from both sides instead of flipping to black with the view
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i) * 0.35, y = Math.abs(n.getY(i)) * 0.35 + 0.65, z = n.getZ(i) * 0.35, L = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / L, y / L, z / L);
  }
  return g;
}

// ---------------------------------------------------------------- growth maths
// Tendencies, not a theme: counts drawn from Fibonacci numbers, organs set at the golden angle,
// organs tapering toward the tip. The same maths that makes plants pack well makes our seeds
// read as grown rather than assembled.
export const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°
export const FIB = [2, 3, 5, 8, 13, 21] as const;
/** A soft Fibonacci count: u in [0,1) → one of FIB between lo and hi (inclusive indices). */
export const fibCount = (u: number, lo = 1, hi = 3) => FIB[lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)))];
/** i-th point of n on a unit sphere cap (Fibonacci lattice), y from yMin..1. */
export function fibSphere(i: number, n: number, yMin = -0.3, twist = 0): THREE.Vector3 {
  const y = 1 - ((i + 0.5) / n) * (1 - yMin);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * GOLDEN + twist;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}
/** Organ size falling off toward the tip: t in [0,1] → 1..tip. */
export const taper = (t: number, tip = 0.35) => 1 - (1 - tip) * t;

// ---------------------------------------------------------------- determinism + validation
/** Stable [0,1) hash of an integer (the variety dice — never Math.random in the world). */
export function hashf(n: number) {
  n = (n | 0) >>> 0;
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15; n = Math.imul(n, 0x846ca68b); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
/** Variant index for a placed thing: position-hashed so neighbouring tiles agree. */
export const variantAt = (x: number, z: number, n: number, salt = 0) => Math.floor(hashf(Math.floor(x * 7.31) * 92821 + Math.floor(z * 5.17) * 68917 + salt * 1013) * n) % n;

export function bounds(g: THREE.BufferGeometry) { g.computeBoundingBox(); return g.boundingBox!; }
/** Every family's recipe passes through this before it may reach the world: finite, sized, grounded. */
export function validGeometry(g: THREE.BufferGeometry, max: { w: number; h: number; d: number }, groundTol = 0.12) {
  const a = g.getAttribute('position').array as Float32Array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  const b = bounds(g);
  return b.max.x - b.min.x <= max.w && b.max.y - b.min.y <= max.h && b.max.z - b.min.z <= max.d && Math.abs(b.min.y) <= groundTol;
}

const cache = new Map<string, THREE.BufferGeometry>();
/** One canonical geometry per key (family:type:variant:stage). Tile builders must .clone() it. */
export function cached(k: string, f: () => THREE.BufferGeometry) {
  let g = cache.get(k);
  if (!g) cache.set(k, (g = f()));
  return g;
}
