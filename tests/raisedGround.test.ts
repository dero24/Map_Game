import { describe, it, expect } from 'vitest';
import { Painter } from '../src/world/groundPaint';
import { underRaised, PAD_PAINT, RAISED } from '../src/world/pads';
import type { WorldJson } from '../src/world/data';

// Review round 11, frame 5: "grass grows in the deep shade under the raised house; that's usually
// where people park". The ground under a house on pilings is a parking pad, gravel or sand (pads.ts),
// painted over its yard's lawn; the grass field grows only where the paint is open or green (its mask:
// groundPaint.ts `grassMask`), so no blade stands under it. Measured here as the mask itself: the
// painter's strokes rastered, last over first, and read the way the mask reads a pixel.

type Ring = [number, number][];
interface Op { op: 'fill' | 'stroke' | 'fillRect'; style: string; width: number; rings: Ring[]; erase: boolean }
/** A recording 2D context (tests/groundPaint.test.ts's, with the composite op: stone is erased alpha). */
function recorder() {
  const ops: Op[] = [];
  let rings: Ring[] = [], cur: Ring | null = null;
  const st: Record<string, unknown> = { lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', globalCompositeOperation: 'source-over' };
  const fns: Record<string, (...a: number[]) => void> = {
    beginPath: () => { rings = []; cur = null; },
    moveTo: (x, z) => { cur = [[x, z]]; rings.push(cur); },
    lineTo: (x, z) => { cur?.push([x, z]); },
    fill: () => { ops.push({ op: 'fill', style: String(st.fillStyle), width: 0, rings: rings.slice(), erase: st.globalCompositeOperation === 'destination-out' }); },
    stroke: () => { ops.push({ op: 'stroke', style: String(st.strokeStyle), width: st.lineWidth as number, rings: rings.slice(), erase: st.globalCompositeOperation === 'destination-out' }); },
    fillRect: (x, z, w, h) => { ops.push({ op: 'fillRect', style: String(st.fillStyle), width: 0, rings: [[[x, z], [x + w, z], [x + w, z + h], [x, z + h]]], erase: false }); },
    save: () => {}, restore: () => { st.globalCompositeOperation = 'source-over'; },
  };
  const ctx = new Proxy({}, {
    get: (_, k: string) => fns[k] ?? (k in st ? st[k] : () => null),
    set: (_, k: string, v) => { st[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}
const inRing = (x: number, z: number, r: Ring) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
const segD = (px: number, pz: number, a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz); };
/** A style as [r, g, b, a] (#rrggbb or rgba(…); anything else — a gradient — as nothing). */
function rgba(style: string): [number, number, number, number] | null {
  const h = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(style);
  if (h) return [parseInt(h[1], 16), parseInt(h[2], 16), parseInt(h[3], 16), 1];
  const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(style);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
}
/** The pixel the recorded strokes leave at (x, z), each laid over the last (`over`): rgb and alpha. */
function pixelAt(ops: Op[], x: number, z: number): [number, number, number, number] {
  let px: [number, number, number, number] = [0, 0, 0, 0];
  for (const o of ops) {
    const hit = o.op === 'stroke' ? o.rings.some((r) => r.some((p, k) => k > 0 && segD(x, z, r[k - 1], p) <= o.width / 2) || (r.length > 2 && segD(x, z, r[r.length - 1], r[0]) <= o.width / 2)) : o.rings.some((r) => inRing(x, z, r));
    const c = hit ? rgba(o.style) : null;
    if (!c) continue;
    if (o.erase) { px = [px[0], px[1], px[2], px[3] * (1 - c[3])]; continue; }
    const a = c[3] + px[3] * (1 - c[3]);
    px = [0, 1, 2].map((i) => (c[i] * c[3] + px[i] * px[3] * (1 - c[3])) / Math.max(1e-6, a)).concat(a) as [number, number, number, number];
  }
  return px;
}
/** The grass mask's reading of a pixel (groundPaint.ts grassMask): unpainted (alpha under 50/255)
 *  is open land, the land-cover wash; painted, only a green wash grows grass. */
function grassAt(px: [number, number, number, number]) {
  if (px[3] * 255 < 50) return 1;
  const [r, g, b] = px;
  return g > r + 4 && g > b + 10 ? 1 : 0;
}
const json = { areas: [], roads: [], buildings: [] } as unknown as WorldJson;
const house = (x: number, z: number, L = 10, W = 8): Ring => [[x - L / 2, z - W / 2], [x + L / 2, z - W / 2], [x + L / 2, z + W / 2], [x - L / 2, z + W / 2]];
/** The mask round a house standing in its lawn: its own footprint (inset 0.2 m), and the yard
 *  1–4 m out, on a 25 cm grid. */
function maskOf(ring: Ring, raise: number, sea = Infinity) {
  const P = new Painter(json, [], () => sea);
  P.setTile('t', [], [ring], [-400, -400, 400, 400], [false], [], [0.45], []);
  P.setPads('t', underRaised([{ ring, raise }], () => sea).map((q) => ({ ring: q.ring, fill: PAD_PAINT[q.kind], stone: q.kind === 'gravel' })), [-400, -400, 400, 400]);
  const { ctx, ops } = recorder();
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, z0 = Math.min(...zs) - 6, z1 = Math.max(...zs) + 6;
  P.paint(ctx, x0, z0, x1, z1, 4, 2);
  const under: number[] = [], yard: number[] = [];
  const dist = (x: number, z: number) => Math.min(...ring.map((p, k) => segD(x, z, ring[(k + ring.length - 1) % ring.length], p)));
  for (let x = x0; x <= x1; x += 0.25)
    for (let z = z0; z <= z1; z += 0.25) {
      const d = dist(x, z), ins = inRing(x, z, ring);
      if (ins && d >= 0.2) under.push(grassAt(pixelAt(ops, x, z)));
      else if (!ins && d >= 1 && d <= 4) yard.push(grassAt(pixelAt(ops, x, z)));
    }
  const share = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  return { under: share(under), yard: share(yard), n: under.length, ops };
}

describe('the ground under a raised house (review round 11: "grass grows in the deep shade under the raised house")', () => {
  // (houses whose yards are lawn: the yard's kind is the neighbourhood's and a hash's)
  const lawned = (raise: number) => {
    const out: { ring: Ring; m: ReturnType<typeof maskOf> }[] = [];
    for (let i = 0; i < 24 && out.length < 6; i++) {
      const ring = house(i * 37.3 - 400, i * 21.7 - 250);
      const m = maskOf(ring, raise);
      if (m.yard > 0.8) out.push({ ring, m });
    }
    return out;
  };
  it('a house on the ground stands in its lawn — the mask is mostly open under it too (what a raised house showed before)', () => {
    const hs = lawned(0);
    expect(hs.length).toBeGreaterThan(2);
    // (all but its walls' contact shadow: the lawn under the footprint's half-dark wash still reads green)
    for (const { m } of hs) expect(m.under).toBeGreaterThan(0.6);
  });
  it('a raised house: no grass anywhere under it, its lawn round it kept', () => {
    const hs = lawned(2.8);
    expect(hs.length).toBeGreaterThan(2);
    for (const { m } of hs) {
      expect(m.n).toBeGreaterThan(400);
      expect(m.under).toBe(0);
      expect(m.yard).toBeGreaterThan(0.8);
    }
  });
  it('is a parking pad, gravel or — by the sea — sand, by where the house stands, the same every time', () => {
    const fps = Array.from({ length: 400 }, (_, i) => ({ ring: house((i % 20) * 23.1, Math.floor(i / 20) * 19.7), raise: i % 2 ? 2.6 : 0 }));
    const inland = underRaised(fps), shore = underRaised(fps, () => 100);
    // only the raised ones, their own outlines
    expect(inland.length).toBe(200);
    expect(fps.filter((f) => f.raise > RAISED).every((f, i) => JSON.stringify(f.ring) === JSON.stringify(inland[i].ring))).toBe(true);
    const count = (ps: typeof inland, k: string) => ps.filter((p) => p.kind === k).length / ps.length;
    expect(count(inland, 'sand')).toBe(0);
    expect(count(inland, 'pad')).toBeGreaterThan(0.25);
    expect(count(inland, 'gravel')).toBeGreaterThan(0.4);
    expect(count(shore, 'sand')).toBeGreaterThan(0.2);
    expect(count(shore, 'pad')).toBeGreaterThan(0.2);
    expect(underRaised(fps, () => 100)).toEqual(shore);
    // none of them reads as grass to the mask, and gravel lays its stones (the fine window's alpha)
    for (const k of ['pad', 'gravel', 'sand'] as const) expect(grassAt(rgba(PAD_PAINT[k])!)).toBe(0);
    const { ops } = maskOf(house(0, 0), 2.8);
    const pad = underRaised([{ ring: house(0, 0), raise: 2.8 }])[0];
    expect(ops.some((o) => o.op === 'fill' && o.style === PAD_PAINT[pad.kind] && !o.erase)).toBe(true);
    if (pad.kind === 'gravel') expect(ops.some((o) => o.op === 'fill' && o.erase)).toBe(true);
  });
  it('a dropped tile takes its pads with it', () => {
    const ring = house(0, 0);
    const P = new Painter(json, []);
    P.setTile('t', [], [ring], [-400, -400, 400, 400], [false], [], [0.45], []);
    P.setPads('t', [{ ring, fill: PAD_PAINT.pad, stone: false }], [-400, -400, 400, 400]);
    const fills = () => { const { ctx, ops } = recorder(); P.paint(ctx, -20, -20, 20, 20, 4, 2); return ops.filter((o) => o.style === PAD_PAINT.pad).length; };
    expect(fills()).toBe(1);
    P.dropTile('t');
    expect(fills()).toBe(0);
  });
});
