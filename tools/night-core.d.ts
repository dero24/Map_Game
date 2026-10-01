// Types for tools/night-core.js (plain ES module: the page and the tests load it as is).

export type Pixels = Uint8Array | Uint8ClampedArray;
export function luminance(r: number, g: number, b: number): number;
export function lab(r: number, g: number, b: number): [number, number, number];
export function lstar(Y: number): number;
export function lch(a: number, b: number): { C: number; h: number };

export interface RegionColour { n: number; L: number | null; C: number | null; h: number | null; L90: number | null }
export function regionColour(px: Pixels, w: number, h: number, keep: (i: number) => boolean): RegionColour;
export function nightDarkPasses(c: RegionColour | null, opts?: { maxL?: number; hue?: [number, number]; maxC?: number }): { pass: boolean; why: string };

export interface WireReading { n: number; wireL: number | null; skyL: number | null; delta: number | null; d95: number | null; over: number; pass: boolean | null }
export function wiresVsSky(shown: Pixels, hidden: Pixels, mask: ArrayLike<number>, opts?: { tol?: number }): WireReading;

export function poolContrast<T extends { heartY: number; gapY: number | null }>(pools: T[], opts?: { ratio?: number; need?: number }): { pools: (T & { ratio: number })[]; good: number; pass: boolean };
export function windowMean(px: Pixels, w: number, h: number, cx: number, cy: number, rx: number, ry: number, keep?: (i: number) => boolean): { n: number; Y: number | null };
export function flipRows(px: Pixels, w: number, h: number): Uint8Array;
