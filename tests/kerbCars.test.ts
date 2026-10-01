import { describe, it, expect } from 'vitest';
import { KerbCars, KERB_STRIDE, type KerbWalls } from '../src/world/kerbCars';

/** A record: all day unless the hours it's parked are given. */
const rec = (x: number, z: number, t = 0, arrive = 0, leave = 24) => [x, 0, z, 0, t, 0.5, 0.5, 0.5, 1, 1, 1, arrive, leave];
const count = (k: KerbCars, f: (n: string) => boolean) => (k.group.children.filter((o) => f(o.name)) as unknown as { count: number }[]).reduce((n, im) => n + im.count, 0);
const drawn = (k: KerbCars) => count(k, () => true);

/** A walk world's scopes, as kerb cars use them: which scopes hold walls now. */
class Walls implements KerbWalls {
  scopes = new Map<number, number>();
  private cur = 0;
  withScope<T>(id: number, fn: () => T) { const p = this.cur; this.cur = id; try { return fn(); } finally { this.cur = p; } }
  addLoop(pts: [number, number][]) { this.scopes.set(this.cur, (this.scopes.get(this.cur) ?? 0) + pts.length); }
  removeScope(id: number) { this.scopes.delete(id); }
}

describe('kerb cars', () => {
  it('draws the nearest cars in full, the street in the lite kit, far ones as proxies, none past the far ring', () => {
    const k = new KerbCars();
    k.add('a', new Float32Array([...rec(10, 0, 0), ...rec(50, 0, 1), ...rec(80, 0, 1), ...rec(400, 0, 0), ...rec(900, 0, 2), ...rec(5000, 0, 0)]));
    k.update(0, 0);
    expect(count(k, (n) => n.endsWith(':full'))).toBe(1);
    expect(count(k, (n) => n !== 'kerb-cars:far' && !n.endsWith(':full'))).toBe(2);
    expect(count(k, (n) => n === 'kerb-cars:far')).toBe(2);
    expect(KERB_STRIDE).toBe(13);
  });
  it('finds the nearest car to drive off in, and skips taken ones', () => {
    const k = new KerbCars();
    k.add('t1', new Float32Array([...rec(3, 0, 2), ...rec(1, 1, 4)]));
    const a = k.find(0, 0, 5)!;
    expect(a.key).toBe('t1:kerb:1');
    expect(a.model).toBe('pickup');
    k.skip = (key) => key === 't1:kerb:1';
    expect(k.find(0, 0, 5)!.key).toBe('t1:kerb:0');
    k.remove('t1');
    expect(k.find(0, 0, 5)).toBeNull();
  });
  it('a car that comes and goes is drawn, found and walled only in its hours', () => {
    const k = new KerbCars(), W = new Walls();
    k.walls = W;
    // an all-day car, a beach-goer's (10:30–16:00) and an overnight one (20:00–07:00)
    k.add('b', new Float32Array([...rec(4, 0, 0), ...rec(8, 0, 0, 10.5, 16), ...rec(12, 0, 0, 20, 7)]));
    k.update(0, 0, 13);
    expect(drawn(k)).toBe(2);
    expect(W.scopes.size).toBe(1); // (the all-day car's walls ship with its tile: only the comer's are kerb cars')
    expect(k.find(8, 0, 1)?.key).toBe('b:kerb:1');
    k.update(0, 0, 18.5);
    expect(drawn(k)).toBe(1);
    expect(W.scopes.size).toBe(0);
    expect(k.find(8, 0, 1)).toBeNull();
    k.update(0, 0, 23);
    expect(drawn(k)).toBe(2);
    expect(k.find(12, 0, 1)?.key).toBe('b:kerb:2');
    k.update(0, 0, 3); // (past midnight: still there)
    expect(W.scopes.size).toBe(1);
    // taken: unwalled at once
    k.skip = (key) => key === 'b:kerb:2';
    k.refresh();
    expect(W.scopes.size).toBe(0);
    k.skip = () => false;
    k.update(0, 0, 12);
    k.remove('b');
    expect(W.scopes.size).toBe(0);
  });
});
