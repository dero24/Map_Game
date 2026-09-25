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
