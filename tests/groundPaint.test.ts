import { describe, it, expect } from 'vitest';
import { Painter } from '../src/world/groundPaint';
import type { Road, WorldJson } from '../src/world/data';

// A recording 2D context: every fill and stroke with its style, width and the rings it drew.
type Ring = [number, number][];
interface Op { op: 'fill' | 'stroke' | 'fillRect'; style: string; width: number; rings: Ring[] }
function recorder() {
  const ops: Op[] = [];
  let rings: Ring[] = [], cur: Ring | null = null;
  const st: Record<string, unknown> = { lineWidth: 1, fillStyle: '#000', strokeStyle: '#000' };
  const fns: Record<string, (...a: number[]) => void> = {
    beginPath: () => { rings = []; cur = null; },
    moveTo: (x, z) => { cur = [[x, z]]; rings.push(cur); },
    lineTo: (x, z) => { cur?.push([x, z]); },
    fill: () => { ops.push({ op: 'fill', style: String(st.fillStyle), width: 0, rings: rings.slice() }); },
    stroke: () => { ops.push({ op: 'stroke', style: String(st.strokeStyle), width: st.lineWidth as number, rings: rings.slice() }); },
    fillRect: (x, z, w, h) => { ops.push({ op: 'fillRect', style: String(st.fillStyle), width: 0, rings: [[[x, z], [x + w, z], [x + w, z + h], [x, z + h]]] }); },
  };
  const ctx = new Proxy({}, {
    get: (_, k: string) => fns[k] ?? (k in st ? st[k] : () => null),
    set: (_, k: string, v) => { st[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}
const PAVE = '#b1ab9d';
const json = { areas: [], roads: [], buildings: [] } as unknown as WorldJson;
const ang = (32 * Math.PI) / 180;
const rot = (u: number, v: number): [number, number] => [u * Math.cos(ang) - v * Math.sin(ang), u * Math.sin(ang) + v * Math.cos(ang)];
const box = (u: number, v: number, w: number, h: number): Ring => [rot(u, v), rot(u + w, v), rot(u + w, v + h), rot(u, v + h)];
const street = (a: [number, number], b: [number, number]): Road => ({ c: 'residential', w: 11, p: [a[0] * 10, a[1] * 10, b[0] * 10, b[1] * 10] });

function paint(rings: Ring[], weights: number[], roads: Road[] = []) {
  const P = new Painter(json, []);
  P.setTile('t', roads, rings, [-400, -400, 400, 400], rings.map(() => false), [], weights, []);
  const { ctx, ops } = recorder();
  P.paint(ctx, -150, -150, 150, 150, 7, 2);
  return ops.filter((o) => o.style === PAVE);
}

describe('block paving', () => {
  // a downtown on a grid turned 32° off north: 72 m blocks, four towers in each
  const towers: Ring[] = [];
  for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) for (let q = 0; q < 4; q++) towers.push(box(i * 72 + 13 + (q % 2) * 24, j * 72 + 13 + Math.floor(q / 2) * 24, 22, 22));
  const roads: Road[] = [];
  for (let k = -3; k <= 3; k++) roads.push(street(rot(k * 72, -250), rot(k * 72, 250)), street(rot(-250, k * 72), rot(250, k * 72)));
  it('paves round a dense grid in its own orientation — no north-up squares', () => {
    const ops = paint(towers, towers.map(() => 1), roads);
    expect(ops.some((o) => o.op === 'fillRect')).toBe(false);
    const aprons = ops.filter((o) => o.op === 'stroke');
    expect(aprons.length).toBeGreaterThan(0);
    // every ring the paving draws is a building's own outline
    const key = (r: Ring) => r.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join(' ');
    const outlines = new Set(towers.map(key));
    for (const o of aprons) for (const r of o.rings) expect(outlines.has(key(r))).toBe(true);
    // the towers in view are all paved, the core wider than the threshold's 8 m
    const paved = new Set(aprons.flatMap((o) => o.rings.map(key)));
    const inView = towers.filter((t) => t.every(([x, z]) => Math.abs(x) < 140 && Math.abs(z) < 140));
    expect(inView.every((t) => paved.has(key(t)))).toBe(true);
    expect(Math.max(...aprons.map((o) => o.width))).toBeGreaterThan(16);
  });
  it('leaves a street of houses its lawns', () => {
    const houses: Ring[] = [];
    for (let i = -8; i < 8; i++) for (let j = -8; j < 8; j++) houses.push(box(i * 20 + 5, j * 30 + 8, 10, 12));
    expect(paint(houses, houses.map(() => 0.45))).toEqual([]);
  });
  it('paves the apron of one big building standing alone (a store, a block of flats)', () => {
    const ops = paint([box(-20, -20, 40, 30)], [1]);
    expect(ops.filter((o) => o.op === 'stroke').length).toBe(1);
    expect(paint([box(-6, -6, 12, 12)], [1])).toEqual([]); // (a lone shed doesn't)
  });
});
