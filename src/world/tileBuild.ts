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
import { crossingPaint } from './kerbside';
import { buildStairs } from './stairs';
import { buildMicro } from './micro';
import { activeStyle } from './styles';

export async function buildTile(tj0: TileJson, terrain: Terrain, spec: TileSpec, idBase: number, lite = false): Promise<BuiltTile> {
  // Tunnels leave here: no builder paints, furnishes, parks along, faces a door to or grows grass
  // round a road under the ground — only the life sim's cars take them (BuiltTile.tun)
  const tunnels = tj0.roads.filter((r) => r.tu);
  const tj: TileJson = tunnels.length ? { ...tj0, roads: tj0.roads.filter((r) => !r.tu) } : tj0;
  const world: World = { json: tj as unknown as WorldJson, terrain };
  const w = new RecWalk(terrain, tj.backdrop);
  const bld = buildBuildings(world, idBase, lite);
  // Only owner-flagged entities emit — margin context exists solely for builders that need it.
  const pj = { ...tj, roads: prim(tj.roads), areas: prim(tj.areas), lines: prim(tj.lines), points: prim(tj.points) } as unknown as WorldJson;
  const world2: World = { json: pj, terrain };
  // (a bridge is profiled whole, from every span this tile can see — its margin's too)
  const seen = { roads: tj.roads, lines: tj.lines };
  if (lite) {
    // Coarse ring: silhouettes only — building + structure meshes, no collision, interiors,
    // signs or props. The stream mounts these as display geometry until the detail ring takes over.
    const structures = buildStructures(world2, w, seen);
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
  // Every door's approach stays clear: nothing the builders place (a mapped bike rack, a tree pit,
  // a bin, a planter, a car at the kerb) lands in the 3 m in front of it. The scratch world holds a
  // keep-out there while they build; it isn't recorded, so the live world never gets it. (Downtown,
  // racks and tree pits on a narrow sidewalk stood in front of doors: you couldn't get in.)
  for (const d of bld.doors) w.addPolygon(doorApron(d));
  // …and its own buildings: the builders' "is something standing here" checks saw only the margin's
  // (a kerb car could park half inside a building, a rack stand against a wall). The live world
  // gets these footprints at mount, so they aren't recorded either.
  for (const f of bld.footprints) w.addPolygon(f.ring);
  // …and their steps and landings, kept clear the same way: a car parked in the drive across a
  // stair's foot, a hydrant on its bottom step, a mapped fence up its flight
  for (const d of bld.colliders.decks) {
    w.addDeck(d);
    for (const r of deckKeepOut(d)) w.addPolygon(r);
  }
  w.recording = true;
  const structures = buildStructures(world2, w, seen);
  const signs = buildSigns(world, bld.signs, w); // full json: intersection signs need context roads
  const props = buildProps(world2, w, structures.pierSegs, { mailboxes: bld.mailboxes, drives: bld.drives, doors: bld.doors, ctx: tj as unknown as WorldJson, box: spec.box, hood: bld.hood });
  const stairs = buildStairs(pj.roads, (x, z) => terrain.heightAt(x, z), w); // (every highway=steps a flight you climb)
  // the small things — carts, chairs, cleats, towels, the mapped picnic tables — for the micro layer,
  // placed last so they keep off everything above
  const micro = buildMicro({ world: world2, ctx: tj as unknown as WorldJson, walk: w, footprints: bld.footprints, doors: bld.doors, mailboxes: bld.mailboxes, drives: bld.drives, box: spec.box, hood: bld.hood, style: activeStyle() });
  const xing = crossingPaint(tj.roads, pj.points); // (the tile's own crossings, on any street round them)
  const vp = pj.points.filter((p) => p.c === 'viewpoint').flatMap((p) => [p.x, p.z, p.d ?? -1]);
  const plans: BuiltTile['plans'] = [];
  bld.footprints.forEach((f, i) => {
    if (f.door === undefined || f.kind === 'lighthouse') return;
    plans.push({ i, p: planInterior(`${spec.id}:${i}`, f, bld.doors[f.door], Math.floor(f.seed * 4294967296)) });
  });
  return {
    id: spec.id,
    lod: spec.lod,
    objs: [...packGroup(bld.group), ...packGroup(structures.group), ...packGroup(signs.mesh), ...packGroup(props.group), ...packGroup(stairs)],
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
    ...(tunnels.length ? { tun: prim(tunnels) } : {}),
    areas: pj.areas,
    poles: signs.poles,
    atlas: await canvasBitmap(signs.atlas),
    lampPts: props.lampPts,
    kerb: props.kerb.length ? props.kerb : undefined,
    micro: micro.length ? micro : undefined,
    junc: props.junc.length ? props.junc : undefined,
    ...(xing.length ? { xing } : {}),
    ...(vp.length ? { vp } : {}),
  };
}

/** The ground a building's deck stands on, to keep clear (one rectangle a stretch of it): 30 cm
 *  round it, and 1.2 m of ground in front of a flight's foot to step off onto. */
export function deckKeepOut(d: { pts: [number, number][]; halfWidth: number; profile?: { k: string } }): [number, number][][] {
  const out: [number, number][][] = [], hw = d.halfWidth + 0.3;
  for (let i = 0; i + 1 < d.pts.length; i++) {
    const [ax, az] = d.pts[i], [bx, bz] = d.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, px = -uz, pz = ux;
    const e0 = i === 0 && d.profile?.k === 'ramp' ? 1.2 : 0.3, e1 = 0.3;
    const a: [number, number] = [ax - ux * e0, az - uz * e0], b: [number, number] = [bx + ux * e1, bz + uz * e1];
    out.push([[a[0] + px * hw, a[1] + pz * hw], [b[0] + px * hw, b[1] + pz * hw], [b[0] - px * hw, b[1] - pz * hw], [a[0] - px * hw, a[1] - pz * hw]]);
  }
  return out;
}

/** The ground in front of a door that must stay walkable: 3.2 m out from the wall, the door's
 *  width and 35 cm either side. */
export function doorApron(d: { wx: number; wz: number; nx: number; nz: number; w: number }): [number, number][] {
  const tx = -d.nz, tz = d.nx, hw = d.w / 2 + 0.35, L = 3.2;
  const a: [number, number] = [d.wx + tx * hw, d.wz + tz * hw], b: [number, number] = [d.wx - tx * hw, d.wz - tz * hw];
  return [a, b, [b[0] + d.nx * L, b[1] + d.nz * L], [a[0] + d.nx * L, a[1] + d.nz * L]];
}
