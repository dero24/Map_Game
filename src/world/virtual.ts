// The open-world region: ?at=lat,lon beyond every baked region (+ a tile service).
// Anchors a virtual manifest at the snapped lat/lon — origins snap to a 1/64° grid so
// players arriving at the same place share cells, ids AND the tile worker's R2 cache.
//
// Terrain is a flat synthetic layer (gentle land 3 m up, landmask everywhere): enough for
// buildGround / heightAt / sdfAt to answer while every cell streams w-*/s-* tiles. Real
// elevation lands with the Terrarium DEM in H2 — replace this layer, nothing else changes.
import { Terrain, TerrainLayer, type AtlasManifest, type Box, type Chunk, type LayerLayout } from './data';

const SLICE_HALF = 512; // region "slice" box — the fine ground mesh extent (kept small: flat)
const BACKDROP_HALF = 3072; // region "backdrop" box — horizon ground; coarse tiles carry past it
const LAYER_CELL = 64; // metres per terrain cell on the flat layer

// A constant-field TerrainLayer, packed in the same aligned-chunk layout terrain.bin uses.
function flatLayer(box: Box, cell: number, fill: { height: number; sdf: number; cover: number; flags: number; oceanD: number }): { layout: LayerLayout; bin: ArrayBuffer } {
  const w = Math.ceil((box.x1 - box.x0) / cell);
  const h = Math.ceil((box.z1 - box.z0) / cell);
  const n = w * h;
  const fields: [keyof Omit<LayerLayout, 'grid'>, Int16Array | Uint8Array][] = [
    ['height', new Int16Array(n).fill(fill.height)],
    ['sdf', new Int16Array(n).fill(fill.sdf)],
    ['cover', new Uint8Array(n).fill(fill.cover)],
    ['flags', new Uint8Array(n).fill(fill.flags)],
    ['oceanD', new Uint8Array(n).fill(fill.oceanD)],
  ];
  const layout = { grid: { x0: box.x0, z0: box.z0, cell, w, h } } as LayerLayout;
  const chunks: Uint8Array[] = [];
  let off = 0;
  for (const [key, arr] of fields) {
    const pad = (arr.BYTES_PER_ELEMENT - (off % arr.BYTES_PER_ELEMENT)) % arr.BYTES_PER_ELEMENT;
    if (pad) chunks.push(new Uint8Array(pad)), (off += pad);
    (layout as unknown as Record<string, Chunk>)[key] = { offset: off, length: arr.length, type: arr.constructor.name };
    chunks.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    off += arr.byteLength;
  }
  const bin = new Uint8Array(off);
  let at = 0;
  for (const c of chunks) bin.set(c, at), (at += c.byteLength);
  return { layout, bin: bin.buffer };
}

export interface VirtualRegion { manifest: AtlasManifest; terrain: Terrain; bin: ArrayBuffer }

export function virtualRegion(at: [number, number]): VirtualRegion {
  const snap = (v: number) => Math.round(v * 64) / 64;
  const origin = { lat: snap(at[0]), lon: snap(at[1]) };
  const backdrop: Box = { x0: -BACKDROP_HALF, z0: -BACKDROP_HALF, x1: BACKDROP_HALF, z1: BACKDROP_HALF };
  const { layout, bin } = flatLayer(backdrop, LAYER_CELL, {
    height: 300, // 3 m — gentle land everywhere
    sdf: 400, // +40 m inside land; no water carved out (H2 DEM supplies real shores)
    cover: 30, // WorldCover grassland — reads as ground green, not a forest canopy
    flags: 0,
    oceanD: 0,
  });
  const layer = new TerrainLayer(bin, layout);
  const terrain = new Terrain(layer, layer);
  terrain.patchCell = 1024;
  const manifest: AtlasManifest = {
    version: 1,
    id: `earth@${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`,
    meta: {
      id: 'earth',
      name: 'the open world',
      title: 'Somewhere on Earth',
      sub: `${at[0].toFixed(4)}°, ${at[1].toFixed(4)}°`,
      tz: 'UTC',
      spawn: null,
      roads: {},
      shoreLabel: 'the shore',
    },
    origin,
    slice: { x0: -SLICE_HALF, z0: -SLICE_HALF, x1: SLICE_HALF, z1: SLICE_HALF },
    backdrop,
    sources: { osm: 'live (overpass via tile worker)', dem: 'flat — Terrarium DEM lands in H2' },
    cell: 1024,
    margin: 48,
    terrain: { slice: layout, backdrop: layout },
    roads: [],
    pois: [],
    landmarks: [],
    tiles: [],
  };
  return { manifest, terrain, bin };
}
