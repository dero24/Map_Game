// Types for tools/playtest-core.js (plain ES module: the page, Node and the tests load it as is).

export type CheckName = 'overlaps' | 'doors' | 'posts' | 'flicker' | 'altitude' | 'frames' | 'walkabout' | 'drive' | 'teleports' | 'streaming';
export const CHECKS: CheckName[];
export const SLOW: CheckName[];
export function planChecks(opts?: { only?: string | string[]; skip?: string | string[]; quick?: boolean } & Record<string, unknown>): CheckName[];

export function rng(seed?: number): () => number;
export function yawTo(dx: number, dz: number): number;
export function wrapAngle(a: number): number;

export function percentile(sorted: number[], p: number): number;
export interface FrameStats {
  frames: number;
  seconds: number | null;
  fps: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  hitch50: number;
  hitch100: number;
  perMin100: number | null;
  work: { p50: number | null; p95: number | null; p99: number | null; max: number | null } | null;
}
export function frameStats(intervals: number[], work?: number[]): FrameStats;
export interface FrameBudget { p50?: number | null; p95?: number | null; p99?: number | null; perMin100?: number | null }
export const FRAME_BUDGETS: { desktop: FrameBudget; phone: FrameBudget; soft: FrameBudget };
export function softGpu(gpu: string | null | undefined): boolean;
export function judgeFrames(st: FrameStats | null, budget?: string | FrameBudget): { pass: boolean; over: string[] };

export interface StepFn { (ax: number, az: number, af: number, bx: number, bz: number): number }
export interface GridPathOpts {
  start: { x: number; z: number; f: number };
  goal?: { x: number; z: number; f?: number } | null;
  step: StepFn;
  cell?: number;
  reach?: number;
  margin?: number;
  radius?: number;
  maxNodes?: number;
  /** storeys: a node per `layer` metres of feet height in each cell */
  layer?: number;
  /** a goal with `f` is reached within this much of its height (0.5) */
  reachY?: number;
}
export interface GridPathResult {
  found: boolean;
  path: [number, number, number][] | null;
  nodes: number;
  far: number;
  best: [number, number, number] | null;
}
export function gridPath(o: GridPathOpts): GridPathResult;

export interface RoadLike { p: number[]; c: string; w?: number; lod?: 1; tu?: 1 }
export interface RoadGraph { nodes: [number, number][]; adj: { to: number; len: number; w: number; c: string }[][] }
export const NOT_FOR_CARS: string[];
export function roadGraph(roads: RoadLike[], opts?: { car?: boolean; skip?: string[] }): RoadGraph;
export function nearestNode(graph: RoadGraph, x: number, z: number): number;
export function deadEnd(graph: RoadGraph, from: number, to: number, max?: number): boolean;
export function randomRoute(graph: RoadGraph, x: number, z: number, rand: () => number, metres: number, opts?: { avoidDeadEnds?: boolean; heading?: [number, number] }): { pts: [number, number][]; widths: number[]; len: number };
export function cumLength(pts: number[][]): number[];
export function pointAlong(pts: number[][], cum: number[], s: number): [number, number];
export function closestAlong(pts: number[][], cum: number[], x: number, z: number, i0?: number, i1?: number): { s: number; d: number; i: number };
export function offsetPolyline(pts: number[][], off: number): [number, number][];
export function resample(pts: number[][], step: number): [number, number][];
export interface RoadIndex { C: number; cells: Map<string, { ax: number; az: number; bx: number; bz: number; hw: number; road: string | null }[]> }
export function roadIndex(roads: (RoadLike & { n?: string })[], opts?: { cell?: number; skip?: string[] }): RoadIndex;
export function roadDist(ix: RoadIndex, x: number, z: number, R?: number): { out: number; d: number; hw: number; road: string | null };

export function summarize(name: string, r: unknown): string;
export function formatReport(rep: Record<string, unknown>, opts?: { top?: number }): string;
export function verdictLine(rep: Record<string, unknown>): string;
