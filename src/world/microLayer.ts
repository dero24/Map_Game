// The micro layer: every small thing world/micro.ts placed in the mounted tiles — carts, chairs,
// cleats, towels, the mapped picnic tables and cabinets — drawn by one manager in two draws.
//
// Close up, the real foundry pieces (assets/micro.ts), merged into one mesh rebuilt as you move
// (the painted prop material, so they light, shade and cast like any prop). Further out, one
// impostor card each (render/impostor.ts): a camera-facing quad that shows the piece as photographed
// from the nearest directions, thousands in a single instanced draw. Each piece hands over at its
// own distance — where a texel of its pictures is about a pixel on screen (bigger pieces later),
// kept within the tier's range — across a band of a few metres where the two trade pixels on one
// ordered dither, so neither pops. Very far, the cards thin out the same way and stop.
//
// Every few metres walked (or flown) the manager re-sorts what's near: the nearest pieces first,
// within the tier's caps — so a phone draws fewer, and closer.
//
// A piece out only some hours (a record's `flags`: the beach's gear, out with its party — world/
// crowd.ts) is drawn only then. One due to go up or come down in front of you waits until you look
// away, as its people do (crowdLayer.ts); a jump of the clock applies at once.
import * as THREE from 'three';
import { MICRO_KINDS, microLib } from '../assets/micro';
import { ImpostorAtlas, impostorMaterial, cardGeometry, handoverAt, maxLodOf, KIND_TEXELS, GUTTER, atlasBytes } from '../render/impostor';
import { propMaterial } from '../render/propMaterial';
import { U } from '../render/shared';
import { MICRO_STRIDE } from './micro';
import { presentPacked } from './calendar';
import type { MicroTier } from '../render/quality';
export type { MicroTier };


interface KindGeo { pos: Float32Array; nrm: Float32Array; col: Float32Array; tint: Uint8Array; n: number; R: number; F: number; dh: number; far: number }
interface TileRec { uid: number; d: Float32Array; box: [number, number, number, number, number, number]; near: Uint32Array; card: Uint32Array; shown: Uint8Array }

/** Per piece: the picture size (px), where it hands over and how far its cards are drawn (m). */
export function kindLod(R: number, T: Pick<MicroTier, 'Fbig' | 'Fsmall' | 'lo' | 'hi' | 'far' | 'band' | 'pxK'>) {
  const F = R >= 1.2 ? T.Fbig : T.Fsmall;
  const dh = handoverAt(R, F, T.pxK, T.lo, T.hi);
  // drawn until it's a couple of pixels tall, and always well past its hand-over
  const far = Math.min(T.far, Math.max(dh + T.band + 12, (R * T.pxK) / 2.5));
  return { F, dh, far };
}

export class MicroLayer {
  readonly group = new THREE.Group();
  readonly atlas: ImpostorAtlas;
  readonly kinds: (KindGeo | null)[];
  private table: THREE.DataTexture;
  private cardGeo: THREE.InstancedBufferGeometry;
  private cardMat: THREE.ShaderMaterial;
  readonly cards: THREE.Mesh;
  private nearGeo: THREE.BufferGeometry;
  private nearMat: THREE.ShaderMaterial;
  readonly near: THREE.Mesh;
  private tiles = new Map<string, TileRec>();
  /** 0: hand over by distance · 1: cards only · 2: 3D only (a comparison) */
  mode: 0 | 1 | 2 = 0;
  private lx = Infinity; private ly = Infinity; private lz = Infinity;
  private dirty = true;
  private seen = -1;
  private gen = 0;
  private uids = 0;
  private nearSig = 0;
  /** the world's hour the pieces out some hours are drawn for (update's); NaN: not told */
  private hour = NaN;
  private jump = true;
  private fwd = new THREE.Vector3(0, 0, -1);
  private view = false;
  readonly stats = { records: 0, cards: 0, near: 0, nearVerts: 0, refillMs: 0, bakeMs: 0, atlasW: 0, atlasH: 0, atlasMB: 0, kinds: 0, ready: 0 };

  constructor(renderer: THREE.WebGLRenderer, readonly tier: MicroTier, pieces?: (THREE.BufferGeometry | null)[]) {
    this.group.name = 'micro';
    const geos = pieces ?? MICRO_KINDS.map((k) => microLib(k.id));
    // each piece's model, unrolled once for the near mesh's writer
    const prep = geos.map((g) => {
      if (!g || !g.getAttribute('position')?.count) return null;
      const src = g.index ? g.toNonIndexed() : g.clone();
      if (!src.getAttribute('normal')) src.computeVertexNormals();
      const n = src.getAttribute('position').count, colA = src.getAttribute('color');
      const col = new Float32Array(n * 3).fill(1), tint = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (colA) (col[i * 3] = colA.getX(i)), (col[i * 3 + 1] = colA.getY(i)), (col[i * 3 + 2] = colA.getZ(i));
        tint[i] = Math.min(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]) >= 0.98 ? 1 : 0;
      }
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), P = src.getAttribute('position'), Nn = src.getAttribute('normal');
      for (let i = 0; i < n; i++) {
        pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
        nrm[i * 3] = Nn.getX(i); nrm[i * 3 + 1] = Nn.getY(i); nrm[i * 3 + 2] = Nn.getZ(i);
      }
      return { src, pos, nrm, col, tint, n };
    });
    const radius = (k: number) => {
      const s = prep[k]?.src;
      if (!s) return 0;
      s.computeBoundingSphere();
      return s.boundingSphere!.radius;
    };
    const Fs = prep.map((p, k) => (p ? kindLod(radius(k), tier).F : 0));
    this.atlas = new ImpostorAtlas(renderer, prep.map((p) => p?.src ?? null), Fs, tier.N, tier.atlasW);
    const S = this.atlas.spheres, L = this.atlas.L;
    this.kinds = prep.map((p, k) => {
      if (!p || S[k * 4 + 3] <= 0) return null;
      const R = S[k * 4 + 3], { F, dh, far } = kindLod(R, tier);
      return { pos: p.pos, nrm: p.nrm, col: p.col, tint: p.tint, n: p.n, R, F, dh, far };
    });
    // the cards' table of pieces (impostor.ts KIND_TEXELS)
    const K = Math.max(1, geos.length), tab = new Float32Array(KIND_TEXELS * 4 * K);
    this.kinds.forEach((G, k) => {
      if (!G) return;
      const o = k * KIND_TEXELS * 4, b = L.blocks[k];
      tab.set([S[k * 4], S[k * 4 + 1], S[k * 4 + 2], G.R, b.x, b.y, b.F, GUTTER, G.dh, G.far, 0, maxLodOf(b.F)], o);
    });
    this.table = new THREE.DataTexture(tab, KIND_TEXELS, K, THREE.RGBAFormat, THREE.FloatType);
    this.table.minFilter = this.table.magFilter = THREE.NearestFilter;
    this.table.needsUpdate = true;

    this.cardGeo = cardGeometry(tier.cards);
    this.cardMat = impostorMaterial(this.atlas, this.table);
    this.cards = new THREE.Mesh(this.cardGeo, this.cardMat);
    this.cards.name = 'micro:cards';
    this.cards.frustumCulled = false; // (refilled round the walker; its bounds would always be stale)
    this.group.add(this.cards);

    const V = tier.nearVerts, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(V * 3), 3, true).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(V * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.nearGeo = g;
    this.nearMat = propMaterial({ fade: true });
    this.near = new THREE.Mesh(g, this.nearMat);
    this.near.name = 'micro:near';
    this.near.frustumCulled = false;
    if (tier.castNear) this.near.layers.enable(1);
    this.group.add(this.near);

    const st = this.stats;
    st.atlasW = L.W; st.atlasH = L.H; st.atlasMB = atlasBytes(L) / 1048576; st.kinds = this.kinds.filter(Boolean).length;
    renderer.domElement?.addEventListener?.('webglcontextrestored', () => this.atlas.rebake());
  }

  /** A tile's records (world/micro.ts); none or empty: nothing. */
  add(id: string, d: Float32Array | undefined) {
    this.remove(id);
    if (!d || d.length < MICRO_STRIDE) return;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i + MICRO_STRIDE <= d.length; i += MICRO_STRIDE) {
      x0 = Math.min(x0, d[i]); x1 = Math.max(x1, d[i]);
      y0 = Math.min(y0, d[i + 1]); y1 = Math.max(y1, d[i + 1]);
      z0 = Math.min(z0, d[i + 2]); z1 = Math.max(z1, d[i + 2]);
    }
    const n = Math.floor(d.length / MICRO_STRIDE);
    this.tiles.set(id, { uid: ++this.uids, d, box: [x0, y0, z0, x1, y1, z1], near: new Uint32Array(n), card: new Uint32Array(n), shown: new Uint8Array(n).fill(255) });
    this.dirty = true;
  }
  remove(id: string) {
    if (this.tiles.delete(id)) this.dirty = true;
  }
  refresh() { this.dirty = true; }

  /** Per frame, with the camera's position in the region frame: photograph a few more pieces while
   *  the atlas fills, and re-sort what's near when the camera has moved a few metres. */
  update(x: number, y: number, z: number, camera?: THREE.PerspectiveCamera, hour?: number) {
    const T = this.tier;
    if (hour !== undefined && !(Math.abs(hour - this.hour) < 0.02)) {
      const dh = Math.abs(hour - this.hour);
      this.jump = !(dh < 0.25) && !(dh > 23.75);
      this.hour = hour;
      this.dirty = true;
    }
    if (camera) { camera.getWorldDirection(this.fwd); this.view = true; }
    if (this.atlas.pending) {
      const t0 = performance.now();
      this.atlas.bake(T.bakePerFrame);
      this.stats.bakeMs += performance.now() - t0;
    }
    if (this.atlas.version !== this.seen) {
      this.seen = this.atlas.version;
      const tab = this.table.image.data as Float32Array;
      let ready = 0;
      this.kinds.forEach((G, k) => {
        if (!G) return;
        const r = this.atlas.ready(k) ? 1 : 0;
        tab[k * KIND_TEXELS * 4 + 10] = r;
        ready += r;
      });
      this.stats.ready = ready;
      this.table.needsUpdate = true;
      this.dirty = true;
    }
    const pxK = camera ? U.uViewport.value.y / (2 * Math.tan((camera.fov * Math.PI) / 360)) : T.pxK;
    this.cardMat.uniforms.uLod.value.set(T.band, this.mode, pxK, 0);
    this.nearMat.uniforms.uFade.value.set(T.band, this.mode, 0, 0);
    if (!this.dirty && Math.hypot(x - this.lx, z - this.lz) < T.step && Math.abs(y - this.ly) < T.step) return;
    this.dirty = false;
    this.lx = x; this.ly = y; this.lz = z;
    this.refill(x, y, z);
  }

  private refill(cx: number, cy: number, cz: number) {
    const t0 = performance.now();
    const T = this.tier, K = this.kinds, mode = this.mode, gen = ++this.gen, M = T.step + 0.5;
    const nearL: { t: TileRec; i: number; d: number }[] = [];
    const cardL: { t: TileRec; i: number; d: number }[] = [];
    let records = 0;
    for (const t of this.tiles.values()) {
      const b = t.box, d = t.d;
      const bx = Math.max(b[0] - cx, 0, cx - b[3]), by = Math.max(b[1] - cy, 0, cy - b[4]), bz = Math.max(b[2] - cz, 0, cz - b[5]);
      records += t.near.length;
      if (bx * bx + by * by + bz * bz > T.far * T.far) continue;
      for (let i = 0, r = 0; i + MICRO_STRIDE <= d.length; i += MICRO_STRIDE, r++) {
        const G = K[d[i + 4] | 0];
        if (!G) continue; // (a piece this build doesn't have: left out)
        const dx = d[i] - cx, dy = d[i + 1] - cy, dz = d[i + 2] - cz, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d[i + 7] > 0 && !this.outNow(t, r, d[i + 7], dx, dz, dist)) continue;
        if (dist > G.far + M) continue; // (and a step past: the camera moves on before the next sort)
        const ready = this.atlas.ready(d[i + 4] | 0);
        const wantNear = mode === 2 || (mode === 0 && (dist < G.dh + T.band / 2 + M || !ready));
        const wantCard = ready && (mode === 1 || (mode === 0 && dist > G.dh - T.band / 2 - M));
        if (wantNear) nearL.push({ t, i: r, d: dist });
        if (wantCard) cardL.push({ t, i: r, d: dist });
      }
    }
    // the caps, nearest first
    nearL.sort((a, b) => a.d - b.d);
    if (cardL.length > T.cards) {
      cardL.sort((a, b) => a.d - b.d);
      cardL.length = T.cards;
    }
    for (const c of cardL) c.t.card[c.i] = gen;
    // the 3D pieces: which (nearest first, under the caps) — and the same ones as last time, in the
    // same hand, need no new upload
    const take: { t: TileRec; i: number; d: number }[] = [];
    let v = 0, sig = 0;
    for (const e of nearL) {
      if (take.length >= T.near) break;
      const G = K[e.t.d[e.i * MICRO_STRIDE + 4] | 0]!;
      if (v + G.n > T.nearVerts) continue;
      e.t.near[e.i] = gen;
      take.push(e);
      v += G.n;
      sig = (Math.imul(sig ^ (e.t.uid * 1000003 + e.i), 2654435761) + (e.t.card[e.i] === gen ? 7 : 1)) | 0;
    }
    const nN = take.length, g = this.nearGeo;
    if (sig !== this.nearSig || v !== g.drawRange.count) {
      this.nearSig = sig;
      this.writeNear(take, gen);
    }
    // the cards
    const ap = this.cardGeo.getAttribute('aPos') as THREE.InstancedBufferAttribute, ai = this.cardGeo.getAttribute('aInfo') as THREE.InstancedBufferAttribute;
    const A = ap.array as Float32Array, B = ai.array as Float32Array;
    let n = 0;
    for (const e of cardL) {
      const d = e.t.d, i = e.i * MICRO_STRIDE;
      A[n * 4] = d[i]; A[n * 4 + 1] = d[i + 1]; A[n * 4 + 2] = d[i + 2]; A[n * 4 + 3] = d[i + 3];
      B[n * 4] = d[i + 4]; B[n * 4 + 1] = d[i + 5]; B[n * 4 + 2] = d[i + 6]; B[n * 4 + 3] = e.t.near[e.i] === gen ? 1 : 0;
      n++;
    }
    for (const a of [ap, ai]) {
      a.clearUpdateRanges();
      if (n) a.addUpdateRange(0, n * 4);
      a.needsUpdate = n > 0;
    }
    this.cardGeo.instanceCount = n;
    const st = this.stats;
    st.records = records; st.cards = n; st.near = nN; st.nearVerts = v;
    st.refillMs = performance.now() - t0;
    this.jump = false;
  }

  /** Is a piece out only some hours (`flags`) out as drawn now? It changes when its hours say so —
   *  unless it's within 140 m in front of you and the clock only moved on (it waits for you to look
   *  away). */
  private outNow(t: TileRec, r: number, flags: number, dx: number, dz: number, dist: number) {
    if (!Number.isFinite(this.hour)) return true;
    const want = presentPacked(this.hour, flags) ? 1 : 0, S = t.shown;
    if (S[r] !== want) {
      const held = S[r] !== 255 && !this.jump && this.view && dist < 140 && dx * this.fwd.x + dz * this.fwd.z > -2;
      if (!held) S[r] = want;
    }
    return S[r] === 1;
  }

  /** The chosen 3D pieces into the merged mesh: turned, scaled, painted, each vertex carrying its
   *  piece's foot and hand-over (−1: it has no card and draws whole). */
  private writeNear(take: { t: TileRec; i: number }[], gen: number) {
    const K = this.kinds, g = this.nearGeo, P = g.getAttribute('position').array as Float32Array, N = g.getAttribute('normal').array as Int8Array;
    const C = g.getAttribute('color').array as Float32Array, F = g.getAttribute('aFade').array as Float32Array;
    let v = 0;
    for (const e of take) {
      const d = e.t.d, i = e.i * MICRO_STRIDE, G = K[d[i + 4] | 0]!;
      const x = d[i], y = d[i + 1], z = d[i + 2], yaw = d[i + 3], s = d[i + 5], rgb = d[i + 6];
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const tr = srgb((rgb >> 16) & 255), tg = srgb((rgb >> 8) & 255), tb = srgb(rgb & 255);
      const dh = e.t.card[e.i] === gen ? G.dh : -1; // (no card: it draws whole)
      const gp = G.pos, gn = G.nrm, gc = G.col, gt = G.tint;
      for (let q = 0; q < G.n; q++, v++) {
        const lx = gp[q * 3] * s, ly = gp[q * 3 + 1] * s, lz = gp[q * 3 + 2] * s;
        P[v * 3] = x + c * lx + sn * lz;
        P[v * 3 + 1] = y + ly;
        P[v * 3 + 2] = z - sn * lx + c * lz;
        const nx = gn[q * 3], ny = gn[q * 3 + 1], nz = gn[q * 3 + 2];
        N[v * 3] = Math.round((c * nx + sn * nz) * 127);
        N[v * 3 + 1] = Math.round(ny * 127);
        N[v * 3 + 2] = Math.round((-sn * nx + c * nz) * 127);
        const t = gt[q];
        C[v * 3] = t ? gc[q * 3] * tr : gc[q * 3];
        C[v * 3 + 1] = t ? gc[q * 3 + 1] * tg : gc[q * 3 + 1];
        C[v * 3 + 2] = t ? gc[q * 3 + 2] * tb : gc[q * 3 + 2];
        F[v * 4] = x; F[v * 4 + 1] = y; F[v * 4 + 2] = z; F[v * 4 + 3] = dh;
      }
    }
    for (const name of ['position', 'normal', 'color', 'aFade']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      if (v) a.addUpdateRange(0, v * a.itemSize);
      a.needsUpdate = v > 0;
    }
    g.setDrawRange(0, v);
  }

  dispose() {
    this.atlas.dispose();
    this.table.dispose();
    this.cardGeo.dispose();
    this.cardMat.dispose();
    this.nearGeo.dispose();
    this.nearMat.dispose();
  }
}

/** sRGB byte → linear (the instance colours are sRGB hex, the vertex colours linear). */
const LIN = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const srgb = (b: number) => LIN[b];
