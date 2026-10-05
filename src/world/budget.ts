// A phone's tile budget (world/stream.ts): which detail cells stay built, nearest first, while their
// vertex data fits. A shore town's whole ring is ~110 MB of vertices; one downtown cell can be 100+ —
// Manhattan filled a phone's GPU and Chrome crashed, then refused the site WebGL. So in a city the
// ring draws in round the walker (the cells past it keep their silhouettes and the skyline), and in a
// town it opens out again. Pure: tests/budget.test.ts.
//
// The cell you stand in — and any within `keepR` — always stays, whatever it weighs. The rest go in
// by distance while they fit, and the first that doesn't fit ends it: no far cell kept past a nearer
// one (no holes in the ring). A cell already built (or on its way) counts `sticky` m nearer, so two
// cells at about the same distance don't swap back and forth as you walk between them.

export interface BudgetCell {
  key: string;
  /** m from the walker to the cell's box */
  d: number;
  /** its detail tile's vertex data: measured when it was built, else an estimate */
  bytes: number;
  /** built, or on its way */
  loaded: boolean;
}

export function admitCells(cells: BudgetCell[], budget: number, keepR = 150, sticky = 150): Set<string> {
  const out = new Set<string>();
  let used = 0;
  for (const c of cells) if (c.d <= keepR) { out.add(c.key); used += c.bytes; }
  const rest = cells.filter((c) => c.d > keepR).sort((a, b) => a.d - (a.loaded ? sticky : 0) - (b.d - (b.loaded ? sticky : 0)));
  for (const c of rest) {
    if (used + c.bytes > budget) break;
    out.add(c.key);
    used += c.bytes;
  }
  return out;
}
