// Outdoor stairs: every `highway=steps` a flight you climb — a hillside's public stairway, the
// Hillclimb from a waterfront up to its market, the steps down to a beach. The map gives the line,
// its width and (often) its `step_count`; the ground at its two ends gives the rise. Treads of
// even rise (~16.5 cm, or the mapped count) run the length of the way, each a solid concrete
// block down into the slope — lifted where the hillside bulges over the flight's line, so it never
// sinks into a convex slope — with a handrail either side on posts; the walker climbs a line
// through the middle of each tread's top (a deck, like a bridge's).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Road } from './data';
import type { WalkWorld } from '../player/collision';
import { colored, propMaterial } from '../render/propMaterial';

type P = [number, number];
const RISE = 0.165;

export interface Flight { pts: P[]; cum: number[]; y0: number; y1: number; n: number; w: number }

/** The flights among a tile's own ways: each steps way with a rise worth a stair, its tread count. */
export function flightsOf(roads: Road[], heightAt: (x: number, z: number) => number): Flight[] {
  const out: Flight[] = [];
  for (const r of roads) {
    if (r.c !== 'steps' || r.br || r.tu || r.own === 0 || r.p.length < 4) continue;
    const pts: P[] = [];
    for (let i = 0; i + 1 < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    if (L < 1.2) continue;
    let y0 = heightAt(...pts[0]), y1 = heightAt(...pts[pts.length - 1]);
    const dh = Math.abs(y1 - y0);
    if (dh < 0.3) continue; // (a flat path drawn as steps: a step or two the ground already shows)
    // (always built from the foot up: a way drawn from the top is turned round)
    if (y1 < y0) {
      pts.reverse();
      for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      [y0, y1] = [y1, y0];
    }
    const n = r.sc && r.sc >= 2 && r.sc < 400 ? r.sc : Math.max(2, Math.round(dh / RISE));
    out.push({ pts, cum, y0, y1, n, w: Math.max(1.2, Math.min(6, r.w || 2)) });
  }
  return out;
}

/** Where along a polyline (arc length s): the point and the unit direction there. */
function at(f: Flight, s: number): { x: number; z: number; ux: number; uz: number } {
  let i = 0;
  while (i + 2 < f.cum.length && f.cum[i + 1] < s) i++;
  const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], L = f.cum[i + 1] - f.cum[i] || 1, t = Math.max(0, Math.min(1, (s - f.cum[i]) / L));
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: (bx - ax) / L, uz: (bz - az) / L };
}

/** The flights' meshes (one merged concrete mesh, one for the rails) and their walking decks. */
export function buildStairs(roads: Road[], heightAt: (x: number, z: number) => number, walk: WalkWorld): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stairs';
  const steps: THREE.BufferGeometry[] = [], rails: THREE.BufferGeometry[] = [];
  for (const f of flightsOf(roads, heightAt)) {
    const L = f.cum[f.cum.length - 1], dh = f.y1 - f.y0, run = L / f.n;
    const tone = 0.62 + 0.06 * Math.abs(Math.sin(f.pts[0][0] * 0.37 + f.pts[0][1] * 0.61)); // (each flight poured its own day)
    const hex = new THREE.Color(tone * 1.0, tone * 0.98, tone * 0.93).getHex();
    // The treads' tops: the straight flight from the foot to the top, lifted wherever the hillside
    // bulges over that line (a convex slope never swallows the flight), never stepping back down,
    // and no riser over ~22 cm — earlier treads rise to spread a steep stretch (a concave slope
    // gets a stair on a plinth). Each is then a solid block down into the ground.
    const tops: number[] = [], ground: number[] = [], mids = [];
    for (let k = 0; k < f.n; k++) {
      const m = at(f, (k + 0.5) * run), gnd = heightAt(m.x, m.z);
      mids.push(m);
      ground.push(gnd);
      tops.push(Math.max(f.y0 + (dh * (k + 1)) / f.n, gnd + 0.03, k ? tops[k - 1] : -Infinity));
    }
    const maxR = Math.max(0.22, (1.25 * dh) / f.n);
    for (let k = f.n - 2; k >= 0; k--) tops[k] = Math.max(tops[k], tops[k + 1] - maxR);
    for (let k = 0; k < f.n; k++) {
      const m = mids[k], top = tops[k], base = Math.min(top, ground[k]) - 0.45;
      const b = new THREE.BoxGeometry(f.w, top - base, run + 0.02);
      b.rotateY(Math.atan2(m.ux, m.uz)).translate(m.x, (top + base) / 2, m.z);
      steps.push(colored(b, hex));
      // (a tread well up off the ground beside it is walled there: you climb it from its foot)
      if (top - ground[k] > 0.45)
        for (const sd of [-1, 1]) {
          const sx = -m.uz * (f.w / 2) * sd, sz = m.ux * (f.w / 2) * sd;
          walk.addWall([m.x + sx - m.ux * run / 2, m.z + sz - m.uz * run / 2], [m.x + sx + m.ux * run / 2, m.z + sz + m.uz * run / 2], -Infinity, top - 0.35);
        }
    }
    // the walking line: through the middle of each tread's top, the foot's ground at s = 0
    const nose = (s: number) => {
      const q = s / run - 0.5;
      if (q <= 0) return tops[0];
      const k = Math.min(f.n - 2, Math.floor(q));
      if (k < 0) return tops[0];
      const t = Math.min(1, q - k);
      return tops[k] + (tops[k + 1] - tops[k]) * t;
    };
    // handrails: a rail 0.9 m over the nosing line either side, a post every ~2.4 m
    const side = f.w / 2 - 0.08;
    for (const sd of [-1, 1]) {
      const posts = Math.max(2, Math.ceil(L / 2.4) + 1);
      let prev: THREE.Vector3 | null = null;
      for (let q = 0; q < posts; q++) {
        const s = Math.min(L - 0.15, Math.max(0.15, (L * q) / (posts - 1)));
        const m = at(f, s), x = m.x - m.uz * side * sd, z = m.z + m.ux * side * sd, y = nose(s) - 0.05;
        rails.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 0.92, 5).translate(x, y + 0.46, z), 0x3c4146));
        const top = new THREE.Vector3(x, y + 0.92, z);
        if (prev) {
          const d = top.clone().sub(prev), len = d.length();
          const c = new THREE.CylinderGeometry(0.028, 0.028, len, 5);
          c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
          c.translate((top.x + prev.x) / 2, (top.y + prev.y) / 2, (top.z + prev.z) / 2);
          rails.push(colored(c, 0x3c4146));
        }
        prev = top;
      }
    }
    walk.addDeck({ pts: f.pts, cum: f.cum, halfWidth: f.w / 2, heightAt: nose }); // (sampled across the worker boundary)
  }
  if (steps.length) {
    const m = new THREE.Mesh(mergeGeometries(steps)!, propMaterial());
    m.name = 'stairs:treads';
    m.layers.enable(1);
    g.add(m);
  }
  if (rails.length) {
    const m = new THREE.Mesh(mergeGeometries(rails)!, propMaterial());
    m.name = 'stairs:rails';
    g.add(m);
  }
  return g;
}
