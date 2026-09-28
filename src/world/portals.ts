// Tunnel portals: where a street goes underground (OSM `tunnel=*`, the life sim's `tu` roads) the
// mouth is built — a concrete headwall round a dark opening, the carriageway's width and a lorry's
// clearance — so a car driving down into SR 99 or the Lincoln Tunnel goes into the dark, not
// through the asphalt. A portal is a tunnel's end shared with a street above ground; it faces
// out along that street.
import * as THREE from 'three';
import type { Road } from './data';
import { propMaterial } from '../render/propMaterial';

type P = [number, number];
const DRIVE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;
const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

export interface Portal { x: number; z: number; ux: number; uz: number; w: number }

/** Every portal among a tile's roads: (x, z) the mouth, (ux, uz) pointing into the tunnel. */
export function findPortals(roads: Road[]): Portal[] {
  const open = new Set<string>();
  for (const r of roads) {
    if (r.tu || !DRIVE.test(r.c)) continue;
    for (let i = 0; i + 1 < r.p.length; i += 2) open.add(key(r.p[i] / 10, r.p[i + 1] / 10));
  }
  const out: Portal[] = [], seen = new Set<string>();
  for (const r of roads) {
    if (!r.tu || !DRIVE.test(r.c) || r.p.length < 4 || r.own === 0) continue;
    const n = r.p.length / 2, pt = (i: number): P => [r.p[2 * i] / 10, r.p[2 * i + 1] / 10];
    for (const [end, next] of [[0, 1], [n - 1, n - 2]]) {
      const [x, z] = pt(end), [nx, nz] = pt(next), k = key(x, z);
      if (!open.has(k) || seen.has(k)) continue;
      const L = Math.hypot(nx - x, nz - z) || 1;
      seen.add(k);
      out.push({ x, z, ux: (nx - x) / L, uz: (nz - z) / L, w: r.w });
    }
  }
  return out;
}

/** The headwalls and dark mouths for a set of portals, standing on the ground (`h`), with the
 *  walls a walker meets: [a, b, feetY0, feetY1]. */
export function portalMeshes(portals: Portal[], h: (x: number, z: number) => number) {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const walls: [P, P, number, number][] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], cc: number[]) => {
    const base = pos.length / 3;
    for (const v of [a, b, c, d]) (pos.push(...v), nrm.push(...n), col.push(...cc));
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const CONCRETE = [0.63, 0.61, 0.57], DARK = [0.035, 0.035, 0.04], CAP = [0.7, 0.68, 0.64];
  for (const p of portals) {
    const y = h(p.x, p.z), clear = 5.2, top = clear + 2.2, open = p.w / 2 + 0.6, half = open + 2.4, T = 0.8;
    // the mouth plane sits across the road at the portal; +u is into the tunnel
    const rx = -p.uz, rz = p.ux; // across the road
    const at = (s: number, up: number, d = 0) => [p.x + rx * s + p.ux * d, y + up, p.z + rz * s + p.uz * d];
    const out = [-p.ux, 0, -p.uz]; // the face looks back along the street
    // the headwall's face: left pier, right pier, the lintel over the opening
    quad(at(-half, -0.4), at(-open, -0.4), at(-open, top), at(-half, top), out, CONCRETE);
    quad(at(open, -0.4), at(half, -0.4), at(half, top), at(open, top), out, CONCRETE);
    quad(at(-open, clear), at(open, clear), at(open, top), at(-open, top), out, CONCRETE);
    // its cap and the reveal (depth) round the opening
    quad(at(-half, top), at(half, top), at(half, top, T), at(-half, top, T), [0, 1, 0], CAP);
    quad(at(-open, -0.4), at(-open, -0.4, T), at(-open, clear, T), at(-open, clear), [rx, 0, rz], CONCRETE);
    quad(at(open, -0.4, T), at(open, -0.4), at(open, clear), at(open, clear, T), [-rx, 0, -rz], CONCRETE);
    quad(at(-open, clear, T), at(open, clear, T), at(open, clear), at(-open, clear), [0, -1, 0], CONCRETE);
    // the dark: a car driving in is swallowed by it, not by the asphalt
    quad(at(-open, -0.4, T), at(open, -0.4, T), at(open, clear, T), at(-open, clear, T), out, DARK);
    // (walkers meet the piers; the opening is the road's)
    const pa = (s: number): P => [p.x + rx * s, p.z + rz * s];
    walls.push([pa(-half), pa(-open), -Infinity, y + top], [pa(open), pa(half), -Infinity, y + top]);
  }
  const g = new THREE.Group();
  if (!pos.length) return { group: g, walls };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, propMaterial());
  m.name = 'tunnel-portals';
  g.add(m);
  return { group: g, walls };
}
