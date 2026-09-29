import { describe, it, expect } from 'vitest';
import { seamDuplicates } from '../src/world/seams';

type P2 = [number, number];
const rect = (x0: number, z0: number, x1: number, z1: number): { ring: P2[] } => ({ ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });

describe('stand-ins beside a real cell (seams.ts)', () => {
  // the real cell is x 0..1024; the stand-in's cell is x −1024..0
  const box = { x0: 0, z0: 0, x1: 1024, z1: 1024 };
  it("its copy of a building straddling the seam goes when the real cell draws it; its own stay", () => {
    const stand = [
      rect(-12, 100, 8, 130), // straddles x = 0: its outline's centre (−2) made it the stand-in's…
      rect(-80, 100, -40, 140), // well inside its own cell
      rect(-6, 300, 5, 320), // reaches over the seam, but the real cell has nothing there (the map puts it on the stand-in's side)
      rect(-10, 500, 30, 540), // one outline over two real buildings
    ];
    const real = [
      rect(-9, 101, 11, 129), // …the map's outline, centre +1: the real cell draws it too
      rect(-10, 500, 10, 540), rect(10, 500, 30, 540),
    ];
    expect(seamDuplicates(stand, real, box)).toEqual([0, 3]);
  });
  it('nothing reaches the cell: nothing goes', () => {
    expect(seamDuplicates([rect(-300, 0, -200, 50)], [rect(10, 10, 20, 20)], box)).toEqual([]);
    expect(seamDuplicates([rect(-10, 0, 10, 50)], [], box)).toEqual([]);
  });
});
