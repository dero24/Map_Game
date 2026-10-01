// Types for tools/id-pass.js (plain ES module, loaded in the page; the tests load lensVerdict).

export interface Seen { subject: number; near25: number; near4: number; world: number }
// (G: the page's window.__GAME__)
export function flatPass(G: unknown, mat: unknown, W: number, H: number, then?: ((R: unknown, rt: unknown, world: unknown, hide: (o: unknown) => void) => void) | null): Uint8Array;
export function idPass(G: unknown, subj?: { sphere?: { x: number; y: number; z: number; r: number } | null; name?: string } | null, W?: number): Seen;
export function lensVerdict(seen: Seen, opts?: { near25?: number; near4?: number; world?: number }): string[];
