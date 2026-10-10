// The van's plan (pure — no three.js): where the room is, its doorway, its windows and furniture,
// the walls you bump into inside and out, and when you're in which.
//
// Bigger on the inside, with no loading screen: the room shares the van's own frame (van-local:
// +x the van's right, +z toward its back, −z its front, y up from the ground under it), so the
// windows look out from where the van really stands and walking through the back doorway is just
// walking. The room is wider, longer and taller than the van — it overlaps the world round the
// van — and is only ever drawn where you can see it: through the doorway from outside (a portal,
// van.ts), and all round you once you're in. Its back wall stands at the van's back, the doorway
// a short passage through it (`tunnel`) so the view through the opening always has a surface to
// land on as you step through.
import { camperFrame, camperRecipe, type CamperRecipe } from '../assets/camper';

export type Seg = [number, number, number, number]; // ax az bx bz (van-local metres)
export interface VanPose { x: number; y: number; z: number; yaw: number }
export type Wall = 'left' | 'right' | 'front';
/** A window in one of the room's walls: its middle along the wall (z on a side wall, x on the
 *  front one), its width, and its sill and head over the floor. */
export interface Opening { wall: Wall; c: number; w: number; y0: number; y1: number }
/** A piece of furniture: what it is, where it stands (van-local, on the floor), which way its back
 *  faces (yaw: 0 = its back toward +z, as decor builds it), and its footprint's half sizes along its
 *  own x (its width) and z (its depth) — what you can't walk through, when `solid`. */
export interface Furn { kind: FurnKind; x: number; z: number; yaw: number; hx: number; hz: number; solid: boolean }
export type FurnKind = 'bed' | 'nightstand' | 'maptable' | 'chair' | 'shelves' | 'kitchen' | 'rug' | 'floorlamp' | 'plant' | 'coats' | 'armchair' | 'picturerail' | 'doormat' | 'cabcurtain';
/** out: in the world · in: in the room · cab: in the driver's seat */
export type Mode = 'out' | 'in' | 'cab';

export interface VanLayout {
  recipe: CamperRecipe;
  frame: ReturnType<typeof camperFrame>;
  /** the van's floor over the ground under it (the room's floor too) */
  floor: number;
  /** the back doorway (van-local): across x0…x1, from the floor to the head, in the plane z */
  door: { x0: number; x1: number; y0: number; y1: number; z: number };
  /** the passage through the back wall: from z0 (in the room) to z1 (the door's plane) */
  tunnel: { z0: number; z1: number };
  /** the room's inside: x0…x1, z0 (the front wall) … z1 (the back wall), floor y0, ceiling y1 */
  room: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };
  windows: Opening[];
  furniture: Furn[];
  /** how far through the doorway (m past the door's plane) you go in, and come back out */
  enter: number;
  leave: number;
  /** where you wake: sitting on the bed's edge, looking across the room (van-local, yaw as the walker's) */
  wake: { x: number; z: number; yaw: number; pitch: number };
  /** the cab: the driver's eye in the seat; the driver's door, where you stand outside to get in; the
   *  curtain behind the seats; and the room's curtained way through to it (in its front wall), with
   *  where you come out into the room */
  cab: { eye: { x: number; y: number; z: number }; door: { x: number; z: number }; curtain: { x0: number; x1: number; z: number }; way: { x0: number; x1: number; z: number }; into: { x: number; z: number; yaw: number } };
}

// The room: 4.8 m across, 6 m deep and 2.85 m to the ceiling, in a van 2 m wide whose back is
// 3.9 m long and 2.1 m tall inside.
const ROOM_W = 4.8, ROOM_D = 6.0, ROOM_H = 2.85, TUNNEL = 0.6;

export function vanLayout(recipe: CamperRecipe = camperRecipe(1)): VanLayout {
  const frame = camperFrame(recipe);
  const floor = recipe.floor;
  const zDoor = frame.zr;
  const tz0 = zDoor - TUNNEL;
  const room = { x0: -ROOM_W / 2, x1: ROOM_W / 2, z0: tz0 - ROOM_D, z1: tz0, y0: floor, y1: floor + ROOM_H };
  const door = { x0: -recipe.doorW / 2, x1: recipe.doorW / 2, y0: floor, y1: floor + recipe.doorH, z: zDoor };
  const { x0, x1, z0, z1 } = room;
  const windows: Opening[] = [
    { wall: 'left', c: z0 + 2.4, w: 1.05, y0: 0.95, y1: 1.85 },
    { wall: 'left', c: z1 - 1.6, w: 1.05, y0: 0.95, y1: 1.85 },
    { wall: 'right', c: z0 + 1.05, w: 1.2, y0: 1.05, y1: 1.85 },
    { wall: 'right', c: z0 + 3.6, w: 1.0, y0: 0.95, y1: 1.85 },
  ];
  // the bed in the front right corner, its head on the front wall; the map table under the left
  // windows; the shelves and the kitchen either side of the door; an armchair in the front left
  // corner under the empty wall (where your first painting will hang)
  const bedW = 1.5, bedL = 2.05;
  const furniture: Furn[] = [
    { kind: 'bed', x: x1 - bedW / 2 - 0.04, z: z0 + bedL / 2 + 0.03, yaw: Math.PI, hx: bedW / 2, hz: bedL / 2, solid: true },
    { kind: 'nightstand', x: x1 - bedW - 0.3, z: z0 + 0.26, yaw: Math.PI, hx: 0.22, hz: 0.2, solid: true },
    { kind: 'floorlamp', x: x1 - 0.28, z: z0 + bedL + 0.42, yaw: 0, hx: 0.16, hz: 0.16, solid: true },
    { kind: 'maptable', x: x0 + 1.25, z: z0 + 2.9, yaw: -Math.PI / 2, hx: 0.72, hz: 0.44, solid: true },
    { kind: 'chair', x: x0 + 1.25 + 0.72, z: z0 + 2.6, yaw: Math.PI / 2, hx: 0.22, hz: 0.22, solid: true },
    { kind: 'chair', x: x0 + 1.25 + 0.72, z: z0 + 3.25, yaw: Math.PI / 2 + 0.25, hx: 0.22, hz: 0.22, solid: true },
    { kind: 'rug', x: 0.15, z: (z0 + z1) / 2 + 0.2, yaw: Math.PI / 2, hx: 1.3, hz: 0.8, solid: false },
    { kind: 'shelves', x: x0 + 0.2, z: z1 - 0.95, yaw: -Math.PI / 2, hx: 0.7, hz: 0.2, solid: true },
    { kind: 'kitchen', x: x1 - 0.32, z: z1 - 1.1, yaw: Math.PI / 2, hx: 0.78, hz: 0.32, solid: true },
    { kind: 'plant', x: x0 + 0.35, z: z1 - 2.05, yaw: 0, hx: 0.2, hz: 0.2, solid: true },
    { kind: 'coats', x: door.x0 - 0.62, z: z1 - 0.15, yaw: 0, hx: 0.42, hz: 0.12, solid: true },
    { kind: 'armchair', x: x0 + 2.1, z: z0 + 0.62, yaw: Math.PI + 0.2, hx: 0.42, hz: 0.42, solid: true }, // (under the empty wall)
    { kind: 'picturerail', x: x0 + 2.15, z: z0 + 0.02, yaw: Math.PI, hx: 0.85, hz: 0.02, solid: false },
    // the curtained way through to the cab, in the front wall's left end (the empty wall beside it)
    { kind: 'cabcurtain', x: x0 + 0.72, z: z0 + 0.06, yaw: Math.PI, hx: 0.47, hz: 0.06, solid: true },
    { kind: 'doormat', x: 0, z: z1 + 0.28, yaw: 0, hx: 0.6, hz: 0.25, solid: false },
  ];
  // sitting at the bed's near edge, its foot end, looking across at the doorway and the windows
  const bed = furniture[0];
  // (just clear of the bed's collider, so the first step doesn't shove you off it)
  const wx = bed.x - bed.hx * 0.92 - 0.33, wz = bed.z + 0.35, tx = -0.9, tz = z1 - 0.5;
  const wake = { x: wx, z: wz, yaw: Math.atan2(-(tx - wx), -(tz - wz)), pitch: -0.06 };
  // the cab: the driver sits on the left (x < 0), the curtain across the cab's back (camper.ts)
  const cab = {
    eye: { x: -0.48, y: 1.72, z: frame.zB - 0.3 },
    door: { x: -recipe.W / 2 - 0.55, z: frame.zB - 0.7 },
    curtain: { x0: -recipe.W / 2 + 0.1, x1: recipe.W / 2 - 0.1, z: frame.zB },
    way: { x0: x0 + 0.25, x1: x0 + 1.19, z: z0 },
    into: { x: x0 + 0.72, z: z0 + 0.75, yaw: Math.PI }, // (facing into the room, +z)
  };
  return { recipe, frame, floor, door, tunnel: { z0: tz0, z1: zDoor }, room, windows, furniture, enter: 0.3, leave: 0.22, wake, cab };
}

/** In or out: in once you're `enter` past the door's plane, back out under `leave` (between the
 *  two you stay as you were, so standing in the doorway never flickers). Only the doorway's
 *  width counts as the way in — beside the van you're always out. Both ways of drawing the van
 *  (van.ts) show the same thing anywhere in the passage — out, while the passage's far end is
 *  past the camera's near plane (0.25 m: under 0.35 in); in, anywhere in it — so the change is
 *  never seen, whichever side of the band a step lands. */
export function nextMode(prev: Mode, lx: number, lz: number, L: VanLayout): Mode {
  if (prev === 'cab') return 'cab'; // (the seat is left by getting up: van.ts)
  const depth = L.door.z - lz; // how far past the door's plane, inward
  const inDoor = lx > L.door.x0 - 0.05 && lx < L.door.x1 + 0.05;
  if (prev === 'out') return inDoor && depth > L.enter && depth < TUNNEL + 0.5 ? 'in' : 'out';
  // in: anywhere in the room stays in; only the doorway's passage leads out
  const inRoom = lx > L.room.x0 - 0.5 && lx < L.room.x1 + 0.5 && lz > L.room.z0 - 0.5 && lz < L.door.z + 0.5;
  if (!inRoom) return 'out';
  return inDoor && depth < L.leave ? 'out' : 'in';
}

/** The walls inside: the room's four (the back one open at the passage), the passage's two sides
 *  (on out past the door's plane, so leaving keeps you in line with the doorway), and the
 *  furniture's footprints (a little inside their tops: you stand close to a table). */
export function roomSegments(L: VanLayout): Seg[] {
  const { x0, x1, z0, z1 } = L.room, d = L.door;
  const out: Seg[] = [
    [x0, z0, x1, z0], [x1, z0, x1, z1], [x0, z1, x0, z0],
    [x1, z1, d.x1, z1], [d.x0, z1, x0, z1],
    [d.x1, z1, d.x1, d.z + 0.6], [d.x0, d.z + 0.6, d.x0, z1],
  ];
  for (const f of L.furniture) if (f.solid) out.push(...boxSegs(f.x, f.z, f.yaw, f.hx * 0.92, f.hz * 0.92));
  return out;
}

/** The van's outline from outside, open at the back doorway — and the doorway's two sides on in, so
 *  stepping up into it you're held in line with it until you're in (van-local). */
export function hullSegments(L: VanLayout): Seg[] {
  const hw = L.recipe.W / 2 + 0.04, zf = L.frame.zf - 0.08, zr = L.frame.zr, d = L.door;
  return [
    [-hw, zf, hw, zf], [hw, zf, hw, zr], [-hw, zr, -hw, zf],
    [hw, zr, d.x1, zr], [d.x0, zr, -hw, zr],
    [d.x1, zr, d.x1, zr - 1.2], [d.x0, zr - 1.2, d.x0, zr],
  ];
}

/** A yawed box's outline as four walls (yaw as Furn's: 0 = unturned). */
export function boxSegs(x: number, z: number, yaw: number, hx: number, hz: number): Seg[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const p = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c] as [number, number]);
  return p.map((a, i) => { const b = p[(i + 1) % 4]; return [a[0], a[1], b[0], b[1]] as Seg; });
}

// ---- frames: van-local ↔ world (the van turned by yaw about y, as three.js turns an object)
/** World (x, z) of a van-local point. */
export function toWorld(p: VanPose, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}
/** Van-local (x, z) of a world point. */
export function toLocal(p: VanPose, wx: number, wz: number): [number, number] {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = wx - p.x, dz = wz - p.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
