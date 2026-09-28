// Shared layout between the ambient-life worker and the renderer (same pattern as the reference engine:
// an Int32 header + two Float32 snapshot buffers; the worker writes the back buffer then flips FRONT).

export const KIND = { GULL: 0, CAR: 1, PED: 2, BOAT: 3 } as const;
export const CAPS = { gulls: 220, cars: 320, peds: 640, boats: 24 } as const;
export const MAX_ENTITIES = CAPS.gulls + CAPS.cars + CAPS.peds + CAPS.boats;
export const RANGES = {
  gulls: [0, CAPS.gulls],
  cars: [CAPS.gulls, CAPS.gulls + CAPS.cars],
  peds: [CAPS.gulls + CAPS.cars, CAPS.gulls + CAPS.cars + CAPS.peds],
  boats: [CAPS.gulls + CAPS.cars + CAPS.peds, MAX_ENTITIES],
} as const;

export const SIM_HZ = 20;

// Header slots (Int32).
export const H = {
  TICK: 0,
  FRONT: 1,
  PLAYER_X: 2, // cm
  PLAYER_Z: 3, // cm
  NIGHT: 4, // 0..1000
  HOUR: 5, // hour * 100
  DENSITY: 6, // * 100
  WIND: 7, // * 1000
  SIM_US: 8, // last tick cost (µs)
  ACTIVE: 9,
  SIZE: 16,
} as const;

// Snapshot record (Float32): previous + current pose for interpolation, then render hints.
export const S = {
  PX: 0, PY: 1, PZ: 2, PYAW: 3,
  X: 4, Y: 5, Z: 6, YAW: 7,
  VARIANT: 8, // colour / model variant
  ANIM: 9, // monotonic animation phase (radians)
  AMT: 10, // animation amount (flap/stride); gulls: <0 means standing
  FLAGS: 11, // bit0 active, bit1 lights on
  STRIDE: 12,
} as const;

export function layout() {
  const header = H.SIZE * 4;
  const snap = MAX_ENTITIES * S.STRIDE * 4;
  return { total: header + snap * 2, header: 0, snap0: header, snap1: header + snap };
}

export function views(buf: ArrayBufferLike) {
  const L = layout();
  return {
    header: new Int32Array(buf, L.header, H.SIZE),
    snaps: [new Float32Array(buf, L.snap0, MAX_ENTITIES * S.STRIDE), new Float32Array(buf, L.snap1, MAX_ENTITIES * S.STRIDE)] as const,
  };
}

// Static world description handed to the worker once at init (all transferable typed arrays).
export interface LifeInit {
  seed: number;
  bounds: [number, number, number, number]; // x0 z0 x1 z1
  // Road graph: each edge is a resampled polyline (x,y,z triplets).
  edgePts: Float32Array;
  edgeStart: Int32Array; // first point index per edge
  edgeCount: Int32Array; // points per edge
  edgeLen: Float32Array; // metres
  edgeInfo: Float32Array; // per edge: [rank, width, oneway, walkable]
  edgeNodes: Int32Array; // per edge: [startNode, endNode]
  nodeEdgeStart: Int32Array; // CSR adjacency
  nodeEdges: Int32Array;
  beachPts: Float32Array; // x,y,z on sand near the surf
  waterGrid: Uint8Array; // 1 = boatable water
  waterG: [number, number, number, number, number]; // x0 z0 cell w h
  downtown: [number, number, number, number]; // bias box for pedestrians (where the shops are)
  seaward: [number, number]; // unit direction from the beach out to sea (gulls wheel over the surf)
  doors: Float32Array; // per door: x, y, z (threshold), fx, fy, fz (front / foot of the steps)
  rhythm?: Rhythm; // the shape of the place's day (lifeSim.desired); 'shore' when absent
}
/** The daily rhythm of a place's streets: a beach town (the crowd builds toward the afternoon
 *  beach), an ordinary town (commute, lunch, errands, evening stroll) or a hot-country town
 *  (busy early and after sunset, a midday lull). Chosen from climate + coast (rhythmFor). */
export type Rhythm = 'shore' | 'town' | 'desert';
export const rhythmFor = (climate: string, coastal: boolean): Rhythm => (coastal ? 'shore' : climate === 'arid' ? 'desert' : 'town');
