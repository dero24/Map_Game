// Tile partitioning for the bake: cut a region's entities into grid cells (the same world.json content,
// tiled). Entities carry a margin so builders that need nearby context (door snapping, porch clearance)
// keep working across seams; `own: 0` marks margin-context entities so consumers never double-emit them.

export const TILE_CELL = 1024; // metres, region-local frame
export const TILE_MARGIN = 48;

const inBox = (b, x, z, m = 0) => x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m;

function anyVertex(flat, box, m) {
  for (let i = 0; i + 1 < flat.length; i += 2) if (inBox(box, flat[i] / 10, flat[i + 1] / 10, m)) return true;
  return false;
}
function firstVertex(flat, box) {
  return flat.length >= 2 && inBox(box, flat[0] / 10, flat[1] / 10);
}
function centroid(ring, box) {
  let x = 0, z = 0, n = 0;
  for (let i = 0; i + 1 < ring.length; i += 2) (x += ring[i] / 10), (z += ring[i + 1] / 10), n++;
  return n > 0 && inBox(box, x / n, z / n);
}

// entities: { buildings, roads, areas, lines, points } in world.json schema (rings/paths are 0.1 m ints).
// boxes: [{ id, box, lod }] grid cells. Returns [{ spec, tile }] — tile objects ready to serialise.
export function partitionEntities(entities, boxes, margin = TILE_MARGIN) {
  const { buildings = [], roads = [], areas = [], lines = [], points = [] } = entities;
  return boxes.map((spec) => {
    const b = spec.box;
    const ctx = { own: 0 }; // margin context: visible to builders, owned by a neighbour tile
    const tag = (e, flat) => (firstVertex(flat, b) ? e : { ...e, ...ctx });
    return {
      spec,
      tile: {
        version: 1,
        id: spec.id,
        lod: spec.lod,
        box: b,
        buildings: buildings.filter((bd) => anyVertex(bd.r, b, margin)).map((bd) => (centroid(bd.r, b) ? bd : { ...bd, ...ctx })),
        roads: roads.filter((r) => anyVertex(r.p, b, margin)).map((r) => tag(r, r.p)),
        areas: areas.filter((a) => a.o?.some((ring) => anyVertex(ring, b, margin))).map((a) => (a.o?.length && firstVertex(a.o[0], b) ? a : { ...a, ...ctx })),
        lines: lines.filter((l) => anyVertex(l.p, b, margin)).map((l) => tag(l, l.p)),
        points: points.filter((p) => inBox(b, p.x, p.z, margin)).map((p) => (inBox(b, p.x, p.z) ? p : { ...p, ...ctx })),
      },
    };
  });
}

// The grid of tile boxes covering a region box; lod 0 = detail (intersects the slice), 1 = backdrop.
export function tileSpecs(box, slice, cell = TILE_CELL) {
  const out = [];
  for (let cx = Math.floor(box.x0 / cell); cx <= Math.floor(box.x1 / cell); cx++)
    for (let cz = Math.floor(box.z0 / cell); cz <= Math.floor(box.z1 / cell); cz++) {
      const t = { x0: cx * cell, z0: cz * cell, x1: (cx + 1) * cell, z1: (cz + 1) * cell };
      const lod = t.x0 < slice.x1 && t.x1 > slice.x0 && t.z0 < slice.z1 && t.z1 > slice.z0 ? 0 : 1;
      out.push({ id: `${cx}_${cz}`, box: t, lod });
    }
  return out;
}

// A tile's terrain pack: the subgrid of a baked layer (grid: {x0,z0,cell,w,h} + the five field
// arrays) covering `box`. No margin — terrain is a continuous field on one lattice, so a sample on a
// tile edge reads identical corner heights from either side. Returns null when the box misses the grid.
export function terrainPack(L, box) {
  const g = L.grid;
  const i0 = Math.max(0, Math.floor((box.x0 - g.x0) / g.cell));
  const j0 = Math.max(0, Math.floor((box.z0 - g.z0) / g.cell));
  const i1 = Math.min(g.w, Math.ceil((box.x1 - g.x0) / g.cell));
  const j1 = Math.min(g.h, Math.ceil((box.z1 - g.z0) / g.cell));
  const w = i1 - i0, h = j1 - j0;
  if (w <= 0 || h <= 0) return null;
  const out = { grid: { x0: g.x0 + i0 * g.cell, z0: g.z0 + j0 * g.cell, cell: g.cell, w, h } };
  for (const key of ['height', 'sdf', 'cover', 'flags', 'oceanD']) {
    const src = L[key], dst = new src.constructor(w * h);
    for (let j = 0; j < h; j++) dst.set(src.subarray((j0 + j) * g.w + i0, (j0 + j) * g.w + i0 + w), j * w);
    out[key] = dst;
  }
  return out;
}

// Serialise a pack with the same aligned-chunk layout terrain.bin uses, plus its layout JSON — the
// client wraps the buffer straight in a TerrainLayer.
export function packToBin(pack) {
  const chunks = [];
  let offset = 0;
  const layout = { grid: pack.grid };
  for (const key of ['height', 'sdf', 'cover', 'flags', 'oceanD']) {
    const arr = pack[key];
    const pad = (arr.BYTES_PER_ELEMENT - (offset % arr.BYTES_PER_ELEMENT)) % arr.BYTES_PER_ELEMENT;
    if (pad) chunks.push(Buffer.alloc(pad)), (offset += pad);
    layout[key] = { offset, length: arr.length, type: arr.constructor.name };
    chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    offset += arr.byteLength;
  }
  return { layout, buf: Buffer.concat(chunks) };
}
