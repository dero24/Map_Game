import { describe, it, expect } from 'vitest';
import { admitCells, type BudgetCell } from '../src/world/budget';

const MB = 1e6;
const cell = (key: string, d: number, mb: number, loaded = false): BudgetCell => ({ key, d, bytes: mb * MB, loaded });

describe('admitCells (a phone keeps its detail tiles under a budget, nearest first)', () => {
  it('keeps a whole shore town: its ring fits', () => {
    const ring = [cell('a', 0, 24), cell('b', 120, 22), cell('c', 300, 14), cell('d', 500, 9), cell('e', 700, 12), cell('f', 850, 20)];
    expect([...admitCells(ring, 200 * MB)].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('draws in round the walker in a city', () => {
    const ring = [cell('here', 0, 120), cell('n', 300, 110), cell('e', 450, 130), cell('ne', 700, 90)];
    expect([...admitCells(ring, 200 * MB)]).toEqual(['here']); // (the next alone would take it to 230)
    expect([...admitCells(ring, 240 * MB)].sort()).toEqual(['here', 'n']);
  });

  it('always keeps the cell you stand in, and those right by you, whatever they weigh', () => {
    const ring = [cell('here', 0, 300), cell('edge', 90, 150), cell('far', 400, 1)];
    expect([...admitCells(ring, 200 * MB)].sort()).toEqual(['edge', 'here']);
  });

  it('leaves no holes: a far small cell never goes in past a nearer one that did not fit', () => {
    const ring = [cell('here', 0, 50), cell('big', 300, 180), cell('tiny', 600, 1)];
    expect(admitCells(ring, 200 * MB).has('tiny')).toBe(false);
  });

  it('a built cell holds its place against a slightly nearer newcomer (no flip-flop)', () => {
    const built = cell('old', 520, 90, true), next = cell('new', 450, 90);
    const ring = [cell('here', 0, 100), built, next];
    expect(admitCells(ring, 200 * MB).has('old')).toBe(true);
    expect(admitCells(ring, 200 * MB).has('new')).toBe(false);
    // …until the newcomer is clearly nearer
    const later = [cell('here', 0, 100), cell('old', 700, 90, true), cell('new', 300, 90)];
    expect(admitCells(later, 200 * MB).has('new')).toBe(true);
    expect(admitCells(later, 200 * MB).has('old')).toBe(false);
  });

  it('the budget is an upper bound on what it keeps beyond the cells by you', () => {
    const ring = Array.from({ length: 20 }, (_, i) => cell(`c${i}`, 200 + i * 40, 10 + (i % 7) * 9));
    const kept = admitCells(ring, 200 * MB);
    const used = ring.filter((c) => kept.has(c.key)).reduce((a, c) => a + c.bytes, 0);
    expect(used).toBeLessThanOrEqual(200 * MB);
    expect(kept.size).toBeGreaterThan(3);
  });
});
