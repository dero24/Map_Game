import { describe, it, expect } from 'vitest';
import { KerbCars, KERB_STRIDE } from '../src/world/kerbCars';

const rec = (x: number, z: number, t = 0) => [x, 0, z, 0, t, 0.5, 0.5, 0.5, 1, 1, 1];

describe('kerb cars', () => {
  it('draws the nearest cars in full, the street in the lite kit, far ones as proxies, none past the far ring', () => {
    const k = new KerbCars();
    k.add('a', new Float32Array([...rec(10, 0, 0), ...rec(50, 0, 1), ...rec(80, 0, 1), ...rec(400, 0, 0), ...rec(900, 0, 2), ...rec(5000, 0, 0)]));
    k.update(0, 0);
    const count = (f: (n: string) => boolean) => (k.group.children.filter((o) => f(o.name)) as unknown as { count: number }[]).reduce((n, im) => n + im.count, 0);
    expect(count((n) => n.endsWith(':full'))).toBe(1);
    expect(count((n) => n !== 'kerb-cars:far' && !n.endsWith(':full'))).toBe(2);
    expect(count((n) => n === 'kerb-cars:far')).toBe(2);
    expect(KERB_STRIDE).toBe(11);
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
});
