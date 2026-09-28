// What the UI layer (photo mode, sketchbook, commissions, map, hints, arrival cards) may see of the
// game. main.ts builds one of these; the UI modules never reach into main's locals directly.
import type * as THREE from 'three';
import type { Walker } from '../player/controller';
import type { Terrain, WorldJson, Road } from '../world/data';
import type { Footprint } from '../world/buildings';
import type { Explore } from '../world/explore';

export interface GameCtx {
  walker: Walker;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  terrain: Terrain;
  json: WorldJson;
  explore: Explore;
  origin: { lat: number; lon: number };
  toLatLon: (x: number, z: number) => [number, number];
  fromLatLon: (lat: number, lon: number) => [number, number];
  /** world (region) position → NDC through the current camera; z > 1 means behind / beyond. */
  toNdc: (x: number, y: number, z: number) => THREE.Vector3;
  roads: () => Road[];
  footprints: () => Footprint[];
  /** Visible instances (world coords) of InstancedMeshes named `prefix…` within r of (x,z): tile props,
   *  ambient life and player vehicles ('parked-cars:', 'moored-boats:', 'life-car:', 'ride:' …). */
  instances: (prefix: string, x: number, z: number, r: number) => { x: number; y: number; z: number; name: string; sy?: number; sx?: number; yaw?: number }[];
  hour: () => number;
  setHour: (h: number) => void;
  env: () => { night: number; golden: number; fog: number; oceanDist: number };
  placeLabel: () => string; // what the HUD says right now
  locality: () => string; // the town you're in (arrival cards), '' if unknown
  region: () => string; // its county / state line ("Monmouth County, New Jersey"), '' if unknown
  /** A small watercolour card picture of a foundry model (Almanac cards), as a data URL. */
  cardArt: (family: string, type: string, pencil?: boolean) => string;
  toast: (m: string) => void;
  /** `kind`: what the place is (a geocoder's class — tower, attraction, street …): a landmark
   *  is arrived at from a viewpoint that shows it, not from its front door. */
  teleport: (lat: number, lon: number, kind?: string) => Promise<void>;
  sound: (kind: 'brush' | 'shutter' | 'chime' | 'page') => void;
  uiOpen: () => boolean; // a modal (atlas / intro) owns the keyboard
  lock: () => void;
}
