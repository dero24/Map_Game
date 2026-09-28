// Packed tile build results — everything the tile worker ships across the boundary. Geometry is
// harvested as raw attribute arrays (transferables), materials cross as tags rebuilt from the
// main-thread factories, canvas work crosses as ImageBitmaps, and WalkWorld mutations travel as
// reified ops replayed inside the tile's collision scope on mount. The same helpers drive the
// no-worker fallback: buildTile() runs identically on either thread.
import * as THREE from 'three';
import type { Deck, DeckProfile, Floors, WalkWorld } from '../player/collision';
import { WalkWorld as WalkWorldImpl } from '../player/collision';
import type { Footprint, Door } from './buildings';
import type { Plan } from './interiors';
import type { Area, LayerLayout, Road } from './data';
import { buildingMaterial } from './buildings';
import { propMaterial } from '../render/propMaterial';
import { creatureMaterial } from '../render/creature';
import { wireMaterial, haloMaterial } from './props';
import { signMaterial } from './signs';

type P2 = [number, number];

// ---------------- wire format ----------------

export interface PAttr { a: Float32Array; n: number }
export type PMat =
  | { t: 'bld' }
  | { t: 'wire' }
  | { t: 'signs' }
  | { t: 'halo'; size: number; color: number }
  | { t: 'people'; seated: boolean }
  | { t: 'prop'; o: { wind?: boolean; bob?: boolean; foliage?: boolean; decid?: boolean; paved?: boolean; signal?: boolean; emissive?: number; emissiveNight?: boolean; crown?: [number, number] } }
  | { t: 'gnd' }; // region ground material (shared; set via setGndMaterial at boot)

export interface PObj {
  k: 'mesh' | 'inst' | 'pts' | 'lines';
  m: PMat;
  at: Record<string, PAttr>;
  ix?: Uint16Array | Uint32Array;
  im?: Float32Array; // instanceMatrix elements, 16 per instance
  ic?: Float32Array; // instanceColor, 3 per instance
  l1?: 1; ro?: number; nc?: 1; n?: string;
}

// A walkable deck surface: pts + cumulative length + a height profile. Known profiles cross
// exactly; anything else falls back to a sampled curve (<5 mm for typical shapes).
export interface PDeck { pts: P2[]; cum: number[]; hw: number; p?: DeckProfile; h?: Float32Array }

// WalkWorld mutations the builders made while building — replayed verbatim inside the scope.
export type WalkOp =
  | { o: 'w'; a: P2; b: P2; y0: number; y1: number }
  | { o: 'l'; p: P2[]; y0: number; y1: number }
  | { o: 'p'; r: P2[]; f: Floors | null; g: { x: number; z: number; w: number } | null; y: number }
  | { o: 'd'; d: PDeck };

export interface BuiltTile {
  id: string;
  lod: number;
  objs: PObj[];
  ops: WalkOp[];
  fps: Footprint[];
  doors: Door[];
  walls: [P2, P2, number, number][]; // collider walls (a, b, feetY0, feetY1)
  decks: PDeck[]; // collider decks
  walks: number[];
  pilings: { x: number; z: number; ang: number }[];
  lanterns: number[]; // flat xyz — lantern halo points (mount adds the halo)
  towers: number[]; // flat xyz — bascule tower tops
  plans: { i: number; p: Plan }[]; // i = footprint index
  roads: Road[]; // prim (own-only) roads for the life sim
  areas?: Area[]; // prim (own-only) areas — the ground paint's parks, lots, pitches
  kerb?: Float32Array; // parked kerb + lot cars as records (kerbCars.ts KERB_STRIDE)
  junc?: Float32Array; // the tile's junctions and who stops where (src/sim/traffic.ts packJunctions)
  poles: { x: number; z: number; cx: number; cz: number }[];
  atlas?: ImageBitmap; // street-sign atlas
  lampPts?: number[]; // street-lamp pool centres (x,z pairs) — the stream paints the light map
  terr?: ArrayBuffer; // the tile's terrain pack, for the main thread's patch registry
  dem?: { buf: ArrayBuffer; layout: LayerLayout }; // H2: Terrarium patch for virtual cells — registered under the cell key
  late?: 1; // built without data still in flight (flat for a late DEM, mapped priors for a late LiDAR read) — relief rebuild wanted
}

// ---------------- decks ----------------

export function packDeck(d: Deck): PDeck {
  if (d.profile) return { pts: d.pts, cum: d.cum, hw: d.halfWidth, p: d.profile };
  const total = d.cum[d.cum.length - 1];
  const n = Math.max(2, Math.min(97, Math.ceil(total / 1.5) + 1));
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = d.heightAt((total * i) / (n - 1));
  return { pts: d.pts, cum: d.cum, hw: d.halfWidth, h };
}

export function unpackDeck(p: PDeck): Deck {
  const total = p.cum[p.cum.length - 1];
  let heightAt: (s: number) => number;
  const pf = p.p;
  if (pf?.k === 'const') heightAt = () => pf.y;
  else if (pf?.k === 'ramp') heightAt = (s) => pf.y0 + (pf.y1 - pf.y0) * Math.min(1, Math.max(0, s / pf.total));
  else if (pf?.k === 'arch') heightAt = (s) => {
    const t = Math.min(1, Math.max(0, s / pf.total));
    const base = pf.hA + (pf.hB - pf.hA) * t;
    return base + Math.max(0, pf.peak - base) * Math.pow(Math.sin(Math.PI * t), 0.45);
  };
  else {
    const h = p.h!, n = h.length;
    heightAt = (s) => {
      const t = Math.min(1, Math.max(0, s / total)) * (n - 1);
      const i = Math.min(n - 2, Math.floor(t));
      return h[i] + (h[i + 1] - h[i]) * (t - i);
    };
  }
  return { pts: p.pts, cum: p.cum, halfWidth: p.hw, heightAt, profile: p.p };
}

// ---------------- collision ops ----------------

// A WalkWorld that records every mutation as a replayable op. addLoop/addPolygon expand into
// addWall internally, so recording is suspended for the call and the outer op is logged once.
export class RecWalk extends WalkWorldImpl {
  ops: WalkOp[] = [];
  recording = true;
  private log(op: WalkOp) { if (this.recording) this.ops.push(op); }
  override addWall(a: P2, b: P2, y0 = -Infinity, y1 = Infinity) {
    const was = this.recording; this.recording = false;
    super.addWall(a, b, y0, y1);
    this.recording = was; this.log({ o: 'w', a, b, y0, y1 });
  }
  override addLoop(p: P2[], y0 = -Infinity, y1 = Infinity) {
    const was = this.recording; this.recording = false;
    super.addLoop(p, y0, y1);
    this.recording = was; this.log({ o: 'l', p, y0, y1 });
  }
  override addPolygon(r: P2[], f: Floors | null = null, g: { x: number; z: number; w: number } | null = null, y = -Infinity) {
    const was = this.recording; this.recording = false;
    const pid = super.addPolygon(r, f, g, y);
    this.recording = was; this.log({ o: 'p', r, f, g, y });
    return pid;
  }
  override addDeck(d: Deck) {
    const was = this.recording; this.recording = false;
    super.addDeck(d);
    this.recording = was; this.log({ o: 'd', d: packDeck(d) });
  }
}

export function replayOps(w: WalkWorld, ops: WalkOp[]) {
  for (const op of ops) {
    switch (op.o) {
      case 'w': w.addWall(op.a, op.b, op.y0, op.y1); break;
      case 'l': w.addLoop(op.p, op.y0, op.y1); break;
      case 'p': w.addPolygon(op.r, op.f, op.g, op.y); break;
      case 'd': w.addDeck(unpackDeck(op.d)); break;
    }
  }
}

// ---------------- materials ----------------

// Classify a material created by the builders so it can be rebuilt on the main thread.
// propMaterial's full option space is recovered from defines + uniforms; the rest are
// fingerprinted by their vertex shader. Throws on anything unexpected — loud, not wrong.
export function matTag(m: THREE.Material): PMat {
  const s = m as THREE.ShaderMaterial;
  const forced = (s.userData?.tag as PMat['t'] | undefined);
  if (forced) return { t: forced } as PMat;
  const vs = s.vertexShader ?? '';
  if (vs.includes('aWall')) return { t: 'bld' };
  if (vs.includes('aText')) return { t: 'signs' };
  if (vs.includes('vDist')) return { t: 'wire' };
  if (vs.includes('gl_PointSize')) {
    const u = s.uniforms;
    return { t: 'halo', size: u.uSize.value, color: (u.uColor.value as THREE.Color).getHex() };
  }
  const u = s.uniforms ?? {}, d = s.defines ?? {};
  if (d.PEOPLE) return { t: 'people', seated: !!d.SEATED };
  if (u.uEmissive !== undefined) {
    return {
      t: 'prop',
      o: {
        wind: !!d.WIND, bob: !!d.BOB, foliage: !!d.FOLIAGE, ...(d.DECID ? { decid: true } : {}), ...(d.PAVED ? { paved: true } : {}), ...(d.SIGNAL ? { signal: true } : {}),
        emissive: d.EMISSIVE ? (u.uEmissive.value as THREE.Color).getHex() : undefined,
        emissiveNight: u.uEmNight?.value === 1,
        ...(d.FOLIAGE && u.uCrown && u.uCrown.value.y > 0 ? { crown: [u.uCrown.value.x, u.uCrown.value.y] as [number, number] } : {}),
      },
    };
  }
  throw new Error('unrecognised tile material');
}

// The ground shader lives on the boot-time region ground mesh; synthetic tiles reuse it.
let gndMat: THREE.Material | null = null;
export function setGndMaterial(m: THREE.Material) { gndMat = m; }

export function matFromTag(t: PMat, atlas?: THREE.Texture): THREE.Material {
  switch (t.t) {
    case 'bld': return buildingMaterial();
    case 'wire': return wireMaterial();
    case 'signs': return signMaterial(atlas!);
    case 'halo': return haloMaterial(t.size, new THREE.Color(t.color));
    case 'gnd': return gndMat ?? propMaterial();
    case 'people': return creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, ...(t.seated ? { SEATED: 1 } : {}) });
    case 'prop':
      return propMaterial({ ...t.o, emissive: t.o.emissive !== undefined ? new THREE.Color(t.o.emissive) : undefined });
  }
}

// ---------------- geometry harvest / rebuild ----------------

const flags = (o: THREE.Object3D) => ({
  ...(o.layers.mask & 2 ? { l1: 1 as const } : {}),
  ...(o.renderOrder ? { ro: o.renderOrder } : {}),
  ...(o.frustumCulled === false ? { nc: 1 as const } : {}),
  ...(o.name ? { n: o.name } : {}),
});

const attrs = (g: THREE.BufferGeometry) => {
  const out: Record<string, PAttr> = {};
  for (const [name, a] of Object.entries(g.attributes)) out[name] = { a: a.array as Float32Array, n: a.itemSize };
  return out;
};

export function packGroup(root: THREE.Object3D): PObj[] {
  const out: PObj[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      out.push({
        k: 'inst', m: matTag(o.material as THREE.Material), at: attrs(o.geometry),
        ix: o.geometry.index ? (o.geometry.index.array as Uint16Array | Uint32Array) : undefined,
        im: o.instanceMatrix.array as Float32Array,
        ic: o.instanceColor ? (o.instanceColor.array as Float32Array) : undefined,
        ...flags(o),
      });
    } else if (o instanceof THREE.Mesh) {
      out.push({
        k: 'mesh', m: matTag(o.material as THREE.Material), at: attrs(o.geometry),
        ix: o.geometry.index ? (o.geometry.index.array as Uint16Array | Uint32Array) : undefined,
        ...flags(o),
      });
    } else if (o instanceof THREE.Points) {
      out.push({ k: 'pts', m: matTag(o.material as THREE.Material), at: attrs(o.geometry), ...flags(o) });
    } else if (o instanceof THREE.LineSegments) {
      out.push({ k: 'lines', m: matTag(o.material as THREE.Material), at: attrs(o.geometry), ...flags(o) });
    }
  });
  return out;
}

export function buildObject(p: PObj, atlas?: THREE.Texture): THREE.Object3D {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(p.at)) g.setAttribute(name, new THREE.BufferAttribute(a.a, a.n));
  if (p.ix) g.setIndex(new THREE.BufferAttribute(p.ix, 1));
  let o: THREE.Object3D;
  if (p.k === 'inst') {
    const im = new THREE.InstancedMesh(g, matFromTag(p.m, atlas), p.im!.length / 16);
    im.instanceMatrix = new THREE.InstancedBufferAttribute(p.im!, 16);
    if (p.ic) im.instanceColor = new THREE.InstancedBufferAttribute(p.ic, 3);
    o = im;
  } else {
    o = p.k === 'pts' ? new THREE.Points(g, matFromTag(p.m, atlas)) : p.k === 'lines' ? new THREE.LineSegments(g, matFromTag(p.m, atlas)) : new THREE.Mesh(g, matFromTag(p.m, atlas));
  }
  if (p.l1) o.layers.enable(1);
  if (p.ro !== undefined) o.renderOrder = p.ro;
  if (p.nc) o.frustumCulled = false;
  if (p.n) o.name = p.n;
  return o;
}
