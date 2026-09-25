// The tile build pipeline, shared by the tile worker and the no-worker fallback: decode a tile
// json, run the same builders the old in-page path ran, and pack everything for mount. Collision
// goes into a recording scratch WalkWorld so the ops replay verbatim inside the mount scope.
import { prim, type Terrain, type TileJson, type TileSpec, type World, type WorldJson } from './data';
import { buildBuildings } from './buildings';
import { buildStructures } from './structures';
import { buildSigns } from './signs';
import { buildProps } from './props';
import { planInterior } from './interiors';
import { RecWalk, packGroup, packDeck, type BuiltTile } from './pack';
import { canvasBitmap } from './canvas';

export async function buildTile(tj: TileJson, terrain: Terrain, spec: TileSpec, idBase: number, lite = false): Promise<BuiltTile> {
  const world: World = { json: tj as unknown as WorldJson, terrain };
  const w = new RecWalk(terrain, tj.backdrop);
  const bld = buildBuildings(world, idBase);
  // Only owner-flagged entities emit — margin context exists solely for builders that need it.
  const pj = { ...tj, roads: prim(tj.roads), areas: prim(tj.areas), lines: prim(tj.lines), points: prim(tj.points) } as unknown as WorldJson;
  const world2: World = { json: pj, terrain };
  if (lite) {
    // Coarse ring: silhouettes only — building + structure meshes, no collision, interiors,
    // signs or props. The stream mounts these as display geometry until the detail ring takes over.
    const structures = buildStructures(world2, w);
    return {
      id: spec.id,
      lod: spec.lod,
      objs: [...packGroup(bld.group), ...packGroup(structures.group)],
      ops: [],
      fps: [],
      doors: [],
      walls: [],
      decks: [],
      walks: [],
      pilings: [],
      lanterns: bld.lanterns.flatMap((v) => [v.x, v.y, v.z]),
      towers: structures.towers.flatMap((v) => [v.x, v.y, v.z]),
      plans: [],
      roads: [],
      poles: [],
    };
  }
  // Seed the scratch walk with margin-context buildings so prop/sign placement queries see
  // neighbours' houses the way the live world does once neighbours have mounted (deterministically —
  // independent of mount order). The seed is context, not part of the tile's ops.
  w.recording = false;
  for (const r of bld.ctxRings) w.addPolygon(r);
  w.recording = true;
  const structures = buildStructures(world2, w);
  const signs = buildSigns(world, bld.signs, w); // full json: intersection signs need context roads
  const props = buildProps(world2, w, structures.pierSegs, { mailboxes: bld.mailboxes, doors: bld.doors, ctx: tj as unknown as WorldJson, box: spec.box });
  const plans: BuiltTile['plans'] = [];
  bld.footprints.forEach((f, i) => {
    if (f.door === undefined || f.kind === 'lighthouse') return;
    plans.push({ i, p: planInterior(`${spec.id}:${i}`, f, bld.doors[f.door], Math.floor(f.seed * 4294967296)) });
  });
  return {
    id: spec.id,
    lod: spec.lod,
    objs: [...packGroup(bld.group), ...packGroup(structures.group), ...packGroup(signs.mesh), ...packGroup(props.group)],
    ops: w.ops,
    fps: bld.footprints,
    doors: bld.doors,
    walls: bld.colliders.walls,
    decks: bld.colliders.decks.map(packDeck),
    walks: bld.walks,
    pilings: bld.pilings,
    lanterns: bld.lanterns.flatMap((v) => [v.x, v.y, v.z]),
    towers: structures.towers.flatMap((v) => [v.x, v.y, v.z]),
    plans,
    roads: pj.roads,
    poles: signs.poles,
    atlas: await canvasBitmap(signs.atlas),
    lamp: await canvasBitmap(props.lampMap),
    lampBox: props.lampBox,
  };
}
