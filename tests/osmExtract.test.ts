import { describe, expect, it, beforeAll } from 'vitest';
import { osmToTile } from '../src/world/realTile';
import { assemble, canonical, type TileSource } from '../src/world/osmTiles';
import type { TileJson } from '../src/world/data';

// Our own extract against Overpass (docs/DATA_SOURCES.md §0, Robby: "match Overpass exactly, and prove
// it … keep that comparison as a test"). Each fixture (tools/osm-compare.mjs --fixture) is a real cell:
// the extract tiles under its box (scripts/osm-extract.mjs, Geofabrik's 2026-10-02T20:21:34Z files)
// and the TileJson the tile service built from Overpass for the same cell; or (`overpass`) Overpass's
// own raw answer for the box, asked as of the extract's moment. The extract's answer, through the same
// osmToTile, must equal it — every building, street, area, line and point; only `osmBase`, the data's
// timestamp, may differ.
type Fixture = {
  name: string; origin: { lat: number; lon: number }; box: { x0: number; z0: number; x1: number; z1: number };
  bb: { s: number; w: number; n: number; e: number }; ts: string; tiles: Record<string, string>;
  overpassTile?: TileJson; overpass?: { elements: unknown[] }; how: string;
};
const fixtures: Fixture[] = [];
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readdirSync(p: URL): string[]; readFileSync(p: URL): Uint8Array };
  const zlib = (await import(/* @vite-ignore */ `node:${'zlib'}`)) as { gunzipSync(b: Uint8Array): Uint8Array };
  const dir = new URL('./fixtures/osm/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort())
    fixtures.push(JSON.parse(new TextDecoder().decode(zlib.gunzipSync(fs.readFileSync(new URL(f, dir))))));
});
const sourceOf = (f: Fixture): TileSource => ({
  tile: async (b, t) => f.tiles[`${b}/${t}`] ?? null,
  big: async (b, id) => f.tiles[`${b}/big/${id}`] ?? null,
});

describe('our own extract answers as Overpass does (tests/fixtures/osm)', () => {
  it('has real cells to compare', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });
  it('every cell: the same TileJson as the tile service built from Overpass', async () => {
    for (const f of fixtures.filter((f) => f.overpassTile)) {
      const doc = await assemble(sourceOf(f), f.bb, f.ts);
      // (the cell's own id, as the service names it: seeds inside the tile hash it)
      const tj = osmToTile(doc, { id: `${f.box.x0 / 1024}_${f.box.z0 / 1024}`, box: f.box, origin: f.origin });
      const theirs = f.overpassTile!;
      expect(tj.buildings.length, f.name).toBe(theirs.buildings.length);
      // (as it travels: JSON — which writes −0 as 0, the one difference a fresh build has from the wire)
      expect(JSON.parse(JSON.stringify({ ...tj, osmBase: 0 })), `${f.name} (${f.how})`).toEqual({ ...theirs, osmBase: 0 });
    }
  });
  it("every raw answer (Overpass as of the extract's moment): element for element, and the same TileJson", async () => {
    for (const f of fixtures.filter((f) => f.overpass)) {
      const doc = await assemble(sourceOf(f), f.bb, f.ts);
      const ours = doc.elements!.map(canonical).sort(), theirs = (f.overpass!.elements as never[]).map(canonical).sort();
      expect(ours, f.name).toEqual(theirs);
      // (both through today's osmToTile: the proof holds whatever the builder becomes)
      const id = `${f.box.x0 / 1024}_${f.box.z0 / 1024}`;
      const a = osmToTile(doc, { id, box: f.box, origin: f.origin }), b = osmToTile(f.overpass as never, { id, box: f.box, origin: f.origin });
      expect({ ...a, osmBase: 0 }, f.name).toEqual({ ...b, osmBase: 0 });
    }
  });
});
