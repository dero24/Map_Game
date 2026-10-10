// The gameplay being built (docs/agent/gameplay.md "The van"): you wake in the back of your van, the
// town in pencil until you look at it. On by default (Robby, 2026-10-10: "make poc1 the default url");
// `?poc=0` is the old start, kept while the new one settles. The review tools open the game with
// `?capture=1` (tools/capture.mjs, the CI playtest, the region and photo comparisons): they keep the
// old start — the world in colour from the spawn — unless they ask for the van (`&poc=1`).
export function pocOn(search: string) {
  const p = new URLSearchParams(search), v = p.get('poc');
  return v === '1' || (v !== '0' && !p.has('capture'));
}
