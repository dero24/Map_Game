// Where the sea meets the land: the lace of foam along a seawall, a beach, a pier's footing. The
// open world's sea is one plane that knows nothing of shores (its terrain textures are a flat
// stand-in), so each streamed cell lays a strip of water along its own coast, found in the cell's
// DEM patch once the map's sea is pressed into it (dem.ts waterPatch): every sea node's distance
// to the nearest dry node, and a mesh over the band of sea within SHORE_W of the land carrying that
// distance per vertex. The water shader (water.ts, SHORE) draws the waterline's lace and the wash
// just off it from the distance, transparent everywhere else — the sea plane shows through.
import * as THREE from 'three';
import type { LayerLayout } from './data';

/** How far the strip reaches out over the water (m). */
export const SHORE_W = 16;

type Layer = { buf: ArrayBuffer; layout: LayerLayout };

/** Distance (m) from each node to the nearest dry node: 0 on land (a lake counts as land here —
 *  its own shore is its own), up to `cap` over the sea. Two-pass chamfer (1, √2), ±4 %. */
export function shoreDistance(layer: Layer, cap = SHORE_W * 2): Float32Array {
  const L = layer.layout, g = L.grid, n = g.w * g.h;
  const flags = new Uint8Array(layer.buf, L.flags.offset, n), oceanD = new Uint8Array(layer.buf, L.oceanD.offset, n);
  const d = new Float32Array(n);
  for (let k = 0; k < n; k++) d[k] = flags[k] & 1 && oceanD[k] === 0 ? cap : 0;
  const a = g.cell, b = g.cell * Math.SQRT2;
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i;
      if (d[k] === 0) continue;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - g.w] + a);
        if (i > 0) v = Math.min(v, d[k - g.w - 1] + b);
        if (i + 1 < g.w) v = Math.min(v, d[k - g.w + 1] + b);
      }
      d[k] = v;
    }
  for (let j = g.h - 1; j >= 0; j--)
    for (let i = g.w - 1; i >= 0; i--) {
      const k = j * g.w + i;
      if (d[k] === 0) continue;
      let v = d[k];
      if (i + 1 < g.w) v = Math.min(v, d[k + 1] + a);
      if (j + 1 < g.h) {
        v = Math.min(v, d[k + g.w] + a);
        if (i + 1 < g.w) v = Math.min(v, d[k + g.w + 1] + b);
        if (i > 0) v = Math.min(v, d[k + g.w - 1] + b);
      }
      d[k] = v;
    }
  return d;
}

/** The strip along a cell's coast: quads of the patch grid (their centres inside `box`) with a sea
 *  corner and a corner nearer the land than SHORE_W, each vertex's `aShore` its distance from the
 *  shore — the dry corners 0: the waterline is at the land's first node, where the ground falls away
 *  into the sea. Null where the cell has no coast. */
export function shoreStrip(layer: Layer, box: { x0: number; z0: number; x1: number; z1: number }, y = 0.04): THREE.BufferGeometry | null {
  const g = layer.layout.grid, n = g.w * g.h;
  const d = shoreDistance(layer);
  const flags = new Uint8Array(layer.buf, layer.layout.flags.offset, n), oceanD = new Uint8Array(layer.buf, layer.layout.oceanD.offset, n);
  const sea = (k: number) => (flags[k] & 1) !== 0 && oceanD[k] === 0;
  const vid = new Int32Array(n).fill(-1);
  const pos: number[] = [], shore: number[] = [], idx: number[] = [];
  const vert = (i: number, j: number) => {
    const k = j * g.w + i;
    if (vid[k] < 0) {
      vid[k] = pos.length / 3;
      pos.push(g.x0 + (i + 0.5) * g.cell, y, g.z0 + (j + 0.5) * g.cell);
      shore.push(d[k]);
    }
    return vid[k];
  };
  for (let j = 0; j + 1 < g.h; j++) {
    const cz = g.z0 + (j + 1) * g.cell;
    if (cz < box.z0 || cz >= box.z1) continue;
    for (let i = 0; i + 1 < g.w; i++) {
      const cx = g.x0 + (i + 1) * g.cell;
      if (cx < box.x0 || cx >= box.x1) continue;
      const k = j * g.w + i, q = [k, k + 1, k + g.w, k + g.w + 1];
      if (!q.some(sea) || Math.min(d[q[0]], d[q[1]], d[q[2]], d[q[3]]) >= SHORE_W) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), e = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, e); // (facing up: +y)
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  return geo;
}

/** The strip as a tile object: the material crosses to the main thread as a tag (pack.ts), where it
 *  is the water shader's SHORE variant; drawn after the sea (renderOrder 6). */
export function shoreGroup(layer: Layer, box: { x0: number; z0: number; x1: number; z1: number }): THREE.Group | null {
  const geo = shoreStrip(layer, box);
  if (!geo) return null;
  const m = new THREE.MeshBasicMaterial();
  m.userData.tag = 'shore';
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'shore';
  mesh.renderOrder = 6;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}
