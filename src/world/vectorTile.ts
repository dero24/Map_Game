// A cell from OpenFreeMap's vector tiles — the OpenMapTiles planet, OSM already cut into z14
// tiles and served from a CDN in a fifth of a second — for when Overpass can't answer (it took
// 25 s a query on a busy afternoon, and on another stopped answering at all). The tiles are
// translated back into the Overpass JSON osmToTile reads, tag for tag as far as the schema keeps
// them, so the cell goes down the one pipeline (real streets with their names and classes,
// bridges and tunnels; buildings with their mapped heights and colours; parks, woods, pitches,
// playgrounds, water; named shops and cafés) and the full OSM tile replaces it when it lands.
//   What the schema drops, the game's priors fill as for any untagged OSM feature: a building's
// type (house or apartments), a pitch's sport, trees and street furniture, parking lots.
//   Three things the tiles do to OSM that are undone here: a way crossing a tile edge is cut
// (pieces are clipped to the exact tile and stitched back at the cut); a building on an edge is
// in both tiles (each is kept by the tile holding its centre, whole — the tiles carry 64 units,
// ~26 m, of their neighbours; a bigger one is clipped to each tile); and junction nodes on a
// straight street are simplified away (streets are re-noded where they cross or meet).
// Schema: https://openmaptiles.org/schema/ — attribution: © OpenMapTiles © OpenStreetMap.

import { readMvt, ringArea, type MvtLayer } from './mvt';
import type { OsmDoc, OsmElement } from './realTile';

type P = [number, number];
/** A fetched z14 tile. */
export interface VTile { x: number; y: number; z: number; data: ArrayBuffer | Uint8Array }

const E = 4096; // tile units, normalised
const WANT = new Set(['transportation', 'transportation_name', 'building', 'landuse', 'landcover', 'water', 'poi']);

/** Stable positive id from a string (FNV-1a). */
function hid(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

// ---------------- the OpenMapTiles → OSM tag tables ----------------

const HIGHWAY: Record<string, string> = {
  motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary',
  minor: 'residential', service: 'service', track: 'track', raceway: 'raceway', busway: 'busway',
};
const LINKABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const PATHS = new Set(['footway', 'cycleway', 'steps', 'path', 'pedestrian', 'bridleway', 'corridor']);

/** A transportation feature's OSM tags (null: not a way osmToTile builds). */
export function wayTags(t: Record<string, string | number | boolean>): Record<string, string> | null {
  const cls = String(t.class ?? ''), sub = String(t.subclass ?? '');
  const o: Record<string, string> = {};
  if (cls === 'path') {
    if (!PATHS.has(sub) || sub === 'corridor') return null;
    o.highway = sub;
  } else if (cls === 'rail' || cls === 'transit') {
    const rw = sub === 'rail' || sub === 'light_rail' || sub === 'tram' || sub === 'subway' || sub === 'monorail' ? sub : null;
    if (!rw) return null;
    o.railway = rw;
  } else if (cls === 'pier') {
    o.man_made = 'pier';
  } else if (cls in HIGHWAY) {
    o.highway = HIGHWAY[cls] + (+(t.ramp ?? 0) === 1 && LINKABLE.has(cls) ? '_link' : '');
    if (cls === 'service' && t.service) o.service = String(t.service);
  } else return null;
  if (t.brunnel === 'bridge') o.bridge = 'yes';
  else if (t.brunnel === 'tunnel') o.tunnel = 'yes';
  if (t.layer !== undefined && +t.layer !== 0) o.layer = String(t.layer);
  if (+(t.oneway ?? 0) === 1) o.oneway = 'yes';
  if (t.surface === 'unpaved') o.surface = 'unpaved';
  if (t.access === 'no') o.access = 'no';
  if (t.name) o.name = String(t.name);
  if (t.ref) o.ref = String(t.ref);
  return o;
}

/** A landuse / landcover / water polygon's OSM tags (null: nothing the ground paints). */
export function areaTags(layer: string, t: Record<string, string | number | boolean>): Record<string, string> | null {
  const cls = String(t.class ?? ''), sub = String(t.subclass ?? '');
  if (layer === 'water') {
    if (cls === 'ocean' || cls === 'swimming_pool' || +(t.intermittent ?? 0) === 1 || t.brunnel === 'tunnel') return null;
    return cls === 'river' ? { natural: 'water', water: 'river' } : { natural: 'water', water: cls || 'lake' };
  }
  if (layer === 'landcover') {
    if (cls === 'wood') return { natural: 'wood' };
    if (cls === 'wetland') return { natural: 'wetland' };
    if (cls === 'sand') return { natural: sub === 'beach' ? 'beach' : 'sand' };
    if (cls === 'farmland') return { landuse: 'farmland' };
    if (cls === 'grass') {
      if (sub === 'park') return { leisure: 'park' };
      if (sub === 'garden') return { leisure: 'garden' };
      if (sub === 'scrub' || sub === 'shrubbery') return { natural: 'scrub' };
      if (sub === 'heath') return { natural: 'heath' };
      if (sub === 'recreation_ground') return { leisure: 'recreation_ground' };
      if (sub === 'golf_course') return { leisure: 'golf_course' };
      return { landuse: 'grass' };
    }
    return null;
  }
  if (layer === 'landuse') {
    if (cls === 'pitch') return { leisure: 'pitch' };
    if (cls === 'playground') return { leisure: 'playground' };
    if (cls === 'cemetery') return { landuse: 'cemetery' };
    if (/^(school|university|college|kindergarten|hospital|library)$/.test(cls)) return { amenity: cls };
    if (/^(residential|commercial|retail|industrial|railway|garages)$/.test(cls)) return { landuse: cls };
    return null;
  }
  return null;
}

const AMENITY = new Set('restaurant cafe bar pub fast_food ice_cream biergarten food_court bank atm pharmacy hospital clinic doctors dentist veterinary cinema theatre library school college university kindergarten childcare post_office police fire_station townhall community_centre place_of_worship fuel car_wash charging_station parking bicycle_parking bicycle_rental bench toilets drinking_water marketplace nightclub arts_centre waste_basket post_box bus_station ferry_terminal courthouse social_facility recycling shelter fountain clock vending_machine telephone taxi car_rental music_school language_school driving_school internet_cafe casino'.split(' '));
const LEISURE = new Set('park playground pitch sports_centre fitness_centre swimming_pool dog_park garden marina stadium golf_course water_park ice_rink miniature_golf track'.split(' '));
const TOURISM = new Set('hotel motel hostel guest_house museum gallery attraction viewpoint artwork information zoo aquarium theme_park picnic_site camp_site'.split(' '));
const BARRIER = new Set('bollard gate lift_gate'.split(' '));
// OpenMapTiles' shop classes, and the common OSM shop values under any class
const SHOP_CLASS = new Set('grocery alcohol_shop clothing_store laundry bakery butcher furniture hardware jewelry florist books gift shoes music bicycle car mobile_phone electronics optician hairdresser beauty toys sports pet stationery'.split(' '));
const SHOP = new Set('supermarket convenience greengrocer deli seafood cheese chocolate coffee tea wine beverages alcohol bakery butcher pastry confectionery clothes shoes boutique jewelry gift books stationery newsagent tobacco kiosk florist garden_centre hardware doityourself furniture interior_decoration houseware kitchen electronics mobile_phone computer photo camera music musical_instrument video_games toys sports outdoor bicycle car car_parts motorcycle pet optician hairdresser beauty cosmetics perfumery chemist department_store mall variety_store second_hand charity antiques art craft fabric frame tailor laundry dry_cleaning copyshop travel_agency ticket bookmaker lottery pawnbroker cannabis e-cigarette'.split(' '));
/** A point of interest's OSM tags from its class and subclass (the subclass is the OSM value). */
export function poiTags(t: Record<string, string | number | boolean>): Record<string, string> | null {
  const cls = String(t.class ?? ''), sub = String(t.subclass ?? '');
  if (!sub) return null;
  const o: Record<string, string> = {};
  if (AMENITY.has(sub)) o.amenity = sub;
  else if (LEISURE.has(sub)) o.leisure = sub;
  else if (TOURISM.has(sub) || sub === 'art_gallery') o.tourism = sub === 'art_gallery' ? 'gallery' : sub;
  else if (BARRIER.has(sub)) o.barrier = sub;
  else if (sub === 'bus_stop') o.highway = 'bus_stop';
  else if (/^(station|halt|tram_stop|subway_entrance)$/.test(sub)) o.railway = sub;
  else if (cls === 'office') o.office = sub;
  else if (cls === 'shop' || SHOP_CLASS.has(cls) || SHOP.has(sub)) o.shop = sub;
  else return null; // (a grave yard, a prison, a monument, an entrance: not a storefront)
  if (t.name) o.name = String(t.name);
  return o;
}

// ---------------- geometry in global tile units ----------------

const EPS = 1e-9;
const same = (a: P, b: P) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;

/** Liang–Barsky: the pieces of a polyline inside [x0, x1] × [y0, y1], each saying whether its start
 *  and end were cut by the box (rather than being the line's own ends). Half-open: a segment lying
 *  along the box's far edge (x1 or y1) is the neighbour's, so a street on a tile edge is kept once;
 *  a zero-length touch (a vertex exactly on the edge) makes no piece. */
export function clipLine(pts: P[], x0: number, y0: number, x1: number, y1: number) {
  const out: { p: P[]; cut0: boolean; cut1: boolean }[] = [];
  let cur: P[] | null = null, cut0 = false;
  const close = (cut1: boolean) => {
    if (cur && cur.length >= 2) out.push({ p: cur, cut0, cut1 });
    cur = null;
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay;
    if ((ax === x1 && bx === x1) || (ay === y1 && by === y1)) { close(true); continue; }
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as [number, number][]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok || t1 - t0 <= EPS) { close(true); continue; }
    const st: P = [ax + dx * t0, ay + dy * t0], en: P = [ax + dx * t1, ay + dy * t1];
    if (!cur) { cur = [st]; cut0 = i > 0 || t0 > EPS; }
    if (!same(cur[cur.length - 1], en)) cur.push(en);
    if (t1 < 1 - EPS) close(true);
  }
  close(false);
  return out;
}

/** A polygon ring clipped to the box — as many rings as the box cuts it into (a U-shaped block
 *  whose two wings lie in the tile is two rings, never one joined by a sliver along the edge). */
export function clipPoly(r: P[], x0: number, y0: number, x1: number, y1: number): P[][] {
  let rings: P[][] = [r];
  const planes: [(p: P) => number, (p: P) => number][] = [
    [(p) => p[0] - x0, (p) => p[1]], [(p) => x1 - p[0], (p) => -p[1]], [(p) => p[1] - y0, (p) => -p[0]], [(p) => y1 - p[1], (p) => p[0]],
  ];
  for (const [d, along] of planes) {
    const next: P[][] = [];
    for (const ring of rings) next.push(...clipHalf(ring, d, along));
    rings = next;
    if (!rings.length) break;
  }
  return rings.filter((q) => q.length >= 3 && Math.abs(signedArea(q)) > 1e-6);
}
function signedArea(r: P[]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
/** One half-plane (inside: d ≥ 0; `along` orders points on its line): the inside chains of the
 *  ring, rejoined along the line — each exit to the entry paired with it (the line's stretches
 *  inside the polygon lie between the 1st and 2nd crossing, the 3rd and 4th, …). */
function clipHalf(r: P[], d: (p: P) => number, along: (p: P) => number): P[][] {
  const n = r.length, ds = r.map(d);
  if (ds.every((v) => v >= 0)) return [r];
  if (ds.every((v) => v < 0)) return [];
  // start at an outside vertex, so every chain runs entry → … → exit
  const s0 = ds.findIndex((v) => v < 0);
  type X = { p: P; s: number; chain: number; entry: boolean };
  const chains: P[][] = [], xs: X[] = [];
  let cur: P[] | null = null;
  for (let k = 0; k < n; k++) {
    const i = (s0 + k) % n, j = (i + 1) % n, a = r[i], b = r[j], da = ds[i], db = ds[j];
    if (da < 0 && db >= 0) {
      const t = da / (da - db), p: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      cur = [p];
      xs.push({ p, s: along(p), chain: chains.length, entry: true });
      if (!same(p, b)) cur.push(b);
    } else if (da >= 0 && db >= 0) {
      cur?.push(b);
    } else if (da >= 0 && db < 0) {
      const t = da / (da - db), p: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (cur) {
        if (!same(cur[cur.length - 1], p)) cur.push(p);
        xs.push({ p, s: along(p), chain: chains.length, entry: false });
        chains.push(cur);
      }
      cur = null;
    }
  }
  if (!chains.length) return [];
  // pair the crossings along the line; each exit's partner is the entry that closes its stretch
  const sorted = xs.slice().sort((a, b) => a.s - b.s || (a.entry === b.entry ? 0 : a.entry ? 1 : -1));
  const partner = new Map<X, X>();
  for (let q = 0; q + 1 < sorted.length; q += 2) (partner.set(sorted[q], sorted[q + 1]), partner.set(sorted[q + 1], sorted[q]));
  const exitOf = new Map<number, X>(), entryOf = new Map<number, X>();
  for (const x of xs) (x.entry ? entryOf : exitOf).set(x.chain, x);
  const used = new Set<number>(), out: P[][] = [];
  for (let c0 = 0; c0 < chains.length; c0++) {
    if (used.has(c0)) continue;
    const ring: P[] = [];
    let c = c0, guard = 0;
    while (!used.has(c) && guard++ <= chains.length) {
      used.add(c);
      for (const p of chains[c]) if (!ring.length || !same(ring[ring.length - 1], p)) ring.push(p);
      const ex = exitOf.get(c), en = ex && partner.get(ex);
      if (!en || !en.entry) break;
      c = en.chain;
    }
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/** The OSM elements for a cell from the vector tiles covering it (all fetched). `keep` bounds
 *  the global-unit box whose features matter (the cell and its margin). */
export function vectorToOsm(tiles: VTile[], keep?: { x0: number; y0: number; x1: number; y1: number }): OsmDoc {
  const Z = tiles[0]?.z ?? 14, N = E * 2 ** Z;
  const toLL = ([X, Y]: P) => ({ lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * Y) / N))) * 180) / Math.PI, lon: (X / N) * 360 - 180 });
  const bbOf = (pts: P[]) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of pts) (a = Math.min(a, x)), (b = Math.min(b, y)), (c = Math.max(c, x)), (d = Math.max(d, y)); return [a, b, c, d]; };
  const inKeep = (pts: P[]) => { if (!keep) return true; const [a, b, c, d] = bbOf(pts); return !(c < keep.x0 || a > keep.x1 || d < keep.y0 || b > keep.y1); };
  const elements: OsmElement[] = [];
  const pieces: Line[] = [];
  const names: NameSeg[] = [];
  const poiSeen = new Set<string>();

  for (const tile of tiles) {
    const layers = new Map<string, MvtLayer>();
    for (const l of readMvt(tile.data, (n) => WANT.has(n))) layers.set(l.name, l);
    const ox = tile.x * E, oy = tile.y * E, bx0 = ox, by0 = oy, bx1 = ox + E, by1 = oy + E;
    const G = (l: MvtLayer) => { const k = E / l.extent; return ([x, y]: P): P => [ox + x * k, oy + y * k]; };
    // outer rings, each followed by its holes (MVT 4.3.4.4: positive area outer, negative hole)
    const polysOf = (rings: [number, number][][]) => {
      const polys: { o: P[]; h: P[][] }[] = [];
      for (const r of rings) {
        const a = ringArea(r);
        if (a > 0) polys.push({ o: r, h: [] });
        else if (a < 0 && polys.length) polys[polys.length - 1].h.push(r);
      }
      return polys;
    };
    const clipArea = (o: P[], holes: P[][]) => {
      const outs = clipPoly(o, bx0, by0, bx1, by1);
      // (a hole the tile edge cuts is clipped like its polygon — an island over the edge stays
      // land in both tiles; each piece of it goes with the piece of the polygon round it)
      const hs = holes.flatMap((h) => clipPoly(h, bx0, by0, bx1, by1));
      return outs.map((ring) => ({ ring, holes: hs.filter((h) => pip(centroid(h), ring)) }));
    };

    const tn = layers.get('transportation_name');
    if (tn) {
      const g = G(tn);
      for (const f of tn.features)
        for (const r of f.rings) {
          const pts = r.map(g);
          for (let i = 0; i + 1 < pts.length; i++)
            names.push({ a: pts[i], b: pts[i + 1], name: f.tags.name ? String(f.tags.name) : undefined, ref: f.tags.ref ? String(f.tags.ref) : undefined, cls: String(f.tags.class ?? ''), layer: +(f.tags.layer ?? 0) });
        }
    }

    const tr = layers.get('transportation');
    if (tr) {
      const g = G(tr);
      for (const f of tr.features) {
        // (a pier's deck and a pedestrian plaza come as polygons: the ground paints them)
        if (f.type === 3 && (f.tags.class === 'pier' || f.tags.subclass === 'pedestrian')) {
          const tags: Record<string, string> = f.tags.class === 'pier' ? { man_made: 'pier' } : { highway: 'pedestrian', area: 'yes' };
          for (const pl of polysOf(f.rings))
            for (const { ring, holes } of clipArea(pl.o.map(g), pl.h.map((h) => h.map(g))))
              if (inKeep(ring)) elements.push(poly(hid(`t${Math.round(ring[0][0])},${Math.round(ring[0][1])},${ring.length}`), tags, ring, holes, toLL));
          continue;
        }
        if (f.type !== 2) continue;
        const tags = wayTags(f.tags);
        if (!tags) continue;
        // (stitched on the way's own tags; its name is found afterwards along its length)
        const sig = JSON.stringify(tags);
        for (const r of f.rings) {
          const pts = r.map(g);
          if (pts.length < 2) continue;
          for (const q of clipLine(pts, bx0, by0, bx1, by1)) if (inKeep(q.p)) pieces.push({ tags, sig, ...q });
        }
      }
    }

    const bl = layers.get('building');
    if (bl) {
      const g = G(bl), k = E / bl.extent, lo = -60 / k, hi = (E + 60) / k, edge = 60 / k, far = E / k;
      for (const f of bl.features) {
        if (f.type !== 3 || f.tags.hide_3d === true) continue;
        // (render_height 5 with no min height is the schema's default: an untagged building —
        // the game's own priors (and the LiDAR) decide its height, not a flat 5 m)
        const rh = +(f.tags.render_height ?? 0), rmh = +(f.tags.render_min_height ?? 0);
        const tags: Record<string, string> = { building: 'yes' };
        if (!(rh === 5 && rmh === 0) && rh > 0) tags.height = String(rh);
        if (rmh > 0) tags.min_height = String(rmh);
        if (f.tags.colour) tags['building:colour'] = String(f.tags.colour);
        for (const pl of polysOf(f.rings)) {
          // Whole only if BOTH tiles on an edge it crosses hold it whole (it reaches under 60
          // units past the edge on each side): then the tile holding its centre keeps it. Else
          // each tile keeps exactly its own part — never one tile the whole and the other a piece.
          const [a, b, c, d2] = bbOf(pl.o);
          const whole = a >= lo && b >= lo && c <= hi && d2 <= hi && (a >= 0 || c <= edge) && (c <= far || a >= far - edge) && (b >= 0 || d2 <= edge) && (d2 <= far || b >= far - edge);
          if (whole) {
            const o = pl.o.map(g);
            let cx = 0, cy = 0;
            for (const [x, y] of o) (cx += x), (cy += y);
            cx /= o.length; cy /= o.length;
            if (cx < bx0 || cx >= bx1 || cy < by0 || cy >= by1 || !inKeep(o)) continue;
            elements.push(poly(hid(`b${Math.round(o[0][0])},${Math.round(o[0][1])},${o.length}`), tags, o, pl.h.map((h) => h.map(g)), toLL));
          } else {
            for (const { ring, holes } of clipArea(pl.o.map(g), pl.h.map((h) => h.map(g))))
              if (inKeep(ring)) elements.push(poly(hid(`b${Math.round(ring[0][0])},${Math.round(ring[0][1])},${ring.length}`), tags, ring, holes, toLL));
          }
        }
      }
    }

    for (const name of ['landuse', 'landcover', 'water']) {
      const l = layers.get(name);
      if (!l) continue;
      const g = G(l);
      for (const f of l.features) {
        if (f.type !== 3) continue;
        const tags = areaTags(name, f.tags);
        if (!tags) continue;
        for (const pl of polysOf(f.rings))
          for (const { ring, holes } of clipArea(pl.o.map(g), pl.h.map((h) => h.map(g))))
            if (inKeep(ring)) elements.push(poly(hid(`a${name}${Math.round(ring[0][0])},${Math.round(ring[0][1])},${ring.length}`), tags, ring, holes, toLL));
      }
    }

    const po = layers.get('poi');
    if (po) {
      const g = G(po);
      for (const f of po.features) {
        if (f.type !== 1) continue;
        const tags = poiTags(f.tags);
        if (!tags) continue;
        for (const r of f.rings)
          for (const pt of r) {
            const [X, Y] = g(pt);
            if (X < bx0 || X >= bx1 || Y < by0 || Y >= by1) continue; // (each tile its own; the rest are its neighbours')
            if (keep && (X < keep.x0 || X > keep.x1 || Y < keep.y0 || Y > keep.y1)) continue;
            const key = `${Math.round(X)},${Math.round(Y)},${tags.name ?? ''}`;
            if (poiSeen.has(key)) continue;
            poiSeen.add(key);
            const ll = toLL([X, Y]);
            elements.push({ type: 'node', id: hid('p' + key), lat: ll.lat, lon: ll.lon, tags });
          }
      }
    }
  }

  // ---- streets: stitch the pieces cut at tile edges, name them along their length, re-node ----
  const noded = stitch(pieces);
  node(noded);
  const lines = name(noded, names);
  for (const l of lines) {
    const id = hid(`w${Math.round(l.p[0][0])},${Math.round(l.p[0][1])},${Math.round(l.p[l.p.length - 1][0])},${Math.round(l.p[l.p.length - 1][1])},${JSON.stringify(l.tags)}`);
    elements.push({ type: 'way', id, tags: l.tags, geometry: l.p.map(toLL) });
  }
  return { elements };
}
function centroid(r: P[]): P {
  // (the area centroid: inside for any convex piece, and for the rest nearly always)
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
  return Math.abs(a) > 1e-9 ? [cx / (3 * a), cy / (3 * a)] : r[0];
}
function pip([x, y]: P, r: P[]) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
}

function poly(id: number, tags: Record<string, string>, o: P[], holes: P[][], toLL: (p: P) => { lat: number; lon: number }): OsmElement {
  const ring = (r: P[]) => [...r, r[0]].map(toLL);
  if (!holes.length) return { type: 'way', id, tags, geometry: ring(o) };
  return {
    type: 'relation', id, tags: { ...tags, type: 'multipolygon' },
    members: [{ type: 'way', ref: id, role: 'outer', geometry: ring(o) }, ...holes.map((h, i) => ({ type: 'way' as const, ref: id + i + 1, role: 'inner', geometry: ring(h) }))],
  } as OsmElement;
}

type NameSeg = { a: P; b: P; name?: string; ref?: string; cls: string; layer: number };
export type Line = { tags: Record<string, string>; sig: string; p: P[]; cut0: boolean; cut1: boolean };

/** Join pieces with the same tags that were cut at the same tile edge: their cut ends on one edge
 *  line, close along it (each tile quantises its own copy of the crossing — a street meeting the
 *  edge at a shallow angle moves further along it), carrying on the same way; the best such, not
 *  the first. The joint is the two ends' midpoint. */
export function stitch(pieces: Line[]): Line[] {
  const live = pieces.map((q) => ({ ...q, p: q.p.slice(), dead: false }));
  type End = { i: number; end: 0 | 1 };
  const at = (e: End) => { const q = live[e.i]; return e.end ? q.p[q.p.length - 1] : q.p[0]; };
  // the unit direction leaving the piece at this end
  const out = (e: End): P => {
    const q = live[e.i], p = q.p, a = e.end ? p[p.length - 2] : p[1], b = e.end ? p[p.length - 1] : p[0];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  // which tile edge line a cut end lies on (tile edges are multiples of E)
  const edgeOf = ([x, y]: P) => {
    const fx = Math.abs(x / E - Math.round(x / E)) * E, fy = Math.abs(y / E - Math.round(y / E)) * E;
    return fx <= fy ? { key: 'x' + Math.round(x / E), s: y } : { key: 'y' + Math.round(y / E), s: x };
  };
  const byEdge = new Map<string, End[]>();
  const add = (e: End) => { const k = edgeOf(at(e)).key; (byEdge.get(k) ?? byEdge.set(k, []).get(k)!).push(e); };
  live.forEach((q, i) => { if (q.cut0) add({ i, end: 0 }); if (q.cut1) add({ i, end: 1 }); });
  const find = (e: End): End | null => {
    const q = live[e.i], ed = edgeOf(at(e)), u = out(e);
    const vertical = ed.key[0] === 'x', sinT = Math.abs(vertical ? u[0] : u[1]); // the angle to the edge
    // (a street meeting the edge at a shallow angle crosses it far along from where its other copy
    // does: the window along the edge widens, and the two are matched on how far apart their LINES
    // run — the other cut point's offset from this piece's line — not on the distance along it)
    const win = Math.min(40, 2 / Math.max(0.05, sinT)), pe = at(e);
    let best: End | null = null, bs = Infinity;
    for (const c of byEdge.get(ed.key) ?? []) {
      if (c.i === e.i || live[c.i].dead || live[c.i].sig !== q.sig || !(c.end ? live[c.i].cut1 : live[c.i].cut0)) continue;
      const ec = edgeOf(at(c));
      if (ec.key !== ed.key) continue; // (an entry left from before that piece grew past this edge)
      const dAlong = Math.abs(ec.s - ed.s);
      if (dAlong > win) continue;
      const v = out(c), dot = u[0] * v[0] + u[1] * v[1];
      if (dot > -0.7) continue; // (the other piece must carry on the way this one was going)
      const pc = at(c), off = Math.abs(u[0] * (pc[1] - pe[1]) - u[1] * (pc[0] - pe[0]));
      if (off > 2) continue;
      const score = off + dAlong * 0.01 + (1 + dot) * 10;
      if (score < bs) (bs = score), (best = c);
    }
    return best;
  };
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < live.length; i++) {
      const q = live[i];
      if (q.dead) continue;
      for (const end of [1, 0] as const) {
        if (!(end ? q.cut1 : q.cut0)) continue;
        const c = find({ i, end });
        if (!c) continue;
        const r = live[c.i];
        const pa = at({ i, end }), pb = at(c), mid: P = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        let rp = r.p.slice();
        const rcutFar = c.end ? r.cut0 : r.cut1;
        if (end === c.end) rp.reverse();
        if (end === 1) { q.p[q.p.length - 1] = mid; q.p = [...q.p, ...rp.slice(1)]; q.cut1 = rcutFar; }
        else { q.p[0] = mid; q.p = [...rp.slice(0, -1), ...q.p]; q.cut0 = rcutFar; }
        r.dead = true;
        merged = true;
        if (end === 1 ? q.cut1 : q.cut0) add({ i, end });
      }
    }
  }
  return live.filter((q) => !q.dead).map(({ tags, sig, p, cut0, cut1 }) => ({ tags, sig, p, cut0, cut1 }));
}

/** Names from the name layer, found along each street every ~16 units from name lines running the
 *  same way (a cross street's middle sits right on the street it crosses) — the same layer (a
 *  viaduct doesn't take the name of the street under it) and class preferred — and the street split
 *  where its name changes (the tiles merge a street through a change of name). */
const vkey = (p: P) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
export function name(lines: Line[], segs: NameSeg[]): Line[] {
  // vertices two streets share (after node(): every crossing and T)
  const seenV = new Map<string, number>();
  for (const l of lines) for (const p of new Set(l.p.map(vkey))) seenV.set(p, (seenV.get(p) ?? 0) + 1);
  const junction = new Set([...seenV].filter(([, n]) => n > 1).map(([k]) => k));
  const H = new Map<string, number[]>();
  const B = 32, PAD = 6;
  segs.forEach((q, id) => {
    for (let u = Math.floor((Math.min(q.a[0], q.b[0]) - PAD) / B); u <= Math.floor((Math.max(q.a[0], q.b[0]) + PAD) / B); u++)
      for (let v = Math.floor((Math.min(q.a[1], q.b[1]) - PAD) / B); v <= Math.floor((Math.max(q.a[1], q.b[1]) + PAD) / B); v++)
        (H.get(u + ',' + v) ?? H.set(u + ',' + v, []).get(u + ',' + v)!).push(id);
  });
  const labelAt = (m: P, ux: number, uy: number, cls: string, layer: number): NameSeg | null => {
    let best: NameSeg | null = null, bd = 6;
    for (const id of H.get(Math.floor(m[0] / B) + ',' + Math.floor(m[1] / B)) ?? []) {
      const q = segs[id], dx = q.b[0] - q.a[0], dy = q.b[1] - q.a[1], l = Math.hypot(dx, dy) || 1;
      if (Math.abs((dx / l) * ux + (dy / l) * uy) < 0.85) continue;
      const t = Math.max(0, Math.min(1, ((m[0] - q.a[0]) * dx + (m[1] - q.a[1]) * dy) / (l * l)));
      const d = Math.hypot(q.a[0] + dx * t - m[0], q.a[1] + dy * t - m[1]) + (q.cls === cls ? 0 : 1.5) + (q.layer === layer ? 0 : 3);
      if (d < bd) (bd = d), (best = q);
    }
    return best;
  };
  const OMT_CLASS: Record<string, string> = { residential: 'minor', unclassified: 'minor', living_street: 'minor' };
  const out: Line[] = [];
  for (const l of lines) {
    const hw = l.tags.highway;
    if (!hw || (PATHS.has(hw) && hw !== 'pedestrian')) { out.push(l); continue; }
    const cls = OMT_CLASS[hw] ?? hw.replace(/_link$/, ''), layer = +(l.tags.layer ?? 0);
    // samples along the line: (segment index, point, label key)
    const sm: { si: number; p: P; k: string; q: NameSeg | null }[] = [];
    for (let si = 0; si + 1 < l.p.length; si++) {
      const a = l.p[si], b = l.p[si + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < EPS) continue;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, n = Math.max(1, Math.round(len / 16));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n, p: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const q = labelAt(p, ux, uy, cls, layer);
        sm.push({ si, p, k: q ? `${q.name ?? ''}|${q.ref ?? ''}` : '', q });
      }
    }
    // a lone odd sample between two agreeing ones is noise
    for (let j = 1; j + 1 < sm.length; j++) if (sm[j - 1].k === sm[j + 1].k && sm[j].k !== sm[j - 1].k) (sm[j].k = sm[j - 1].k), (sm[j].q = sm[j - 1].q);
    // runs of one label
    let runs: { k: string; q: NameSeg | null; from: number; to: number }[] = [];
    for (let j = 0; j < sm.length; j++) {
      const last = runs[runs.length - 1];
      if (last && last.k === sm[j].k) last.to = j;
      else runs.push({ k: sm[j].k, q: sm[j].q, from: j, to: j });
    }
    // a short unnamed stretch takes its neighbours' name: between two runs of one name (a gap in
    // the name line), or at an end beside a named run (a name line stopping short) — then runs of
    // one name merge again
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.to - run.from + 1 > 3) continue;
      const a = runs[r - 1], b = runs[r + 1];
      // (between two runs of one name: that name, whatever this one read — a fork's neighbour
      // for a few samples; at an end: only an unnamed stub takes its neighbour's)
      const fill = a && b ? (a.k === b.k ? a : null) : run.k === '' ? (a ?? b ?? null) : null;
      if (fill && fill.k !== '') (run.k = fill.k), (run.q = fill.q);
    }
    runs = runs.reduce<typeof runs>((acc, r) => { const last = acc[acc.length - 1]; if (last && last.k === r.k) last.to = r.to; else acc.push({ ...r }); return acc; }, []);
    const apply = (tags: Record<string, string>, q: NameSeg | null) => {
      const t = { ...tags };
      if (q?.name) t.name = q.name;
      if (q?.ref) t.ref = q.ref;
      return t;
    };
    if (runs.length <= 1) { out.push({ ...l, tags: apply(l.tags, runs[0]?.q ?? null) }); continue; }
    // Split where each new run starts — on the junction there when one is within 24 units (a
    // street changes its name at a crossing; the samples only find it within one of them), else at
    // the sample, a vertex put there and shared by both parts.
    type Cut = { pos: number; v?: number; si?: number; p?: P };
    const cuts: Cut[] = [];
    for (let r = 1; r < runs.length; r++) {
      const smp = sm[runs[r].from], a = l.p[smp.si], b = l.p[smp.si + 1];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = Math.hypot(smp.p[0] - a[0], smp.p[1] - a[1]) / seg;
      let cut: Cut = { pos: smp.si + f, si: smp.si, p: smp.p };
      let best = 24;
      for (let v = Math.max(1, smp.si - 3); v <= Math.min(l.p.length - 2, smp.si + 4); v++) {
        if (!junction.has(vkey(l.p[v]))) continue;
        const d = Math.hypot(l.p[v][0] - smp.p[0], l.p[v][1] - smp.p[1]);
        if (d < best) (best = d), (cut = { pos: v, v });
      }
      if (cuts.length && cut.pos <= cuts[cuts.length - 1].pos) cut = { pos: smp.si + f, si: smp.si, p: smp.p };
      if (!cuts.length || cut.pos > cuts[cuts.length - 1].pos) cuts.push(cut);
      else cuts.push({ ...cuts[cuts.length - 1] }); // (degenerate: the part between is dropped)
    }
    let prev: Cut | null = null;
    for (let r = 0; r < runs.length; r++) {
      const next = cuts[r] ?? null;
      const part: P[] = [];
      let from: number;
      if (!prev) { part.push(l.p[0]); from = 1; }
      else if (prev.v !== undefined) { part.push(l.p[prev.v]); from = prev.v + 1; }
      else { part.push(prev.p!); from = prev.si! + 1; }
      const to = !next ? l.p.length - 1 : next.v !== undefined ? next.v : next.si!;
      for (let v = from; v <= to; v++) part.push(l.p[v]);
      if (next && next.v === undefined) part.push(next.p!);
      const clean = part.filter((p, i) => i === 0 || !same(part[i - 1], p));
      if (clean.length >= 2) out.push({ tags: apply(l.tags, runs[r].q), sig: l.sig, p: clean, cut0: r === 0 ? l.cut0 : false, cut1: r + 1 === runs.length ? l.cut1 : false });
      prev = next;
    }
  }
  return out;
}

/** Put a shared vertex where two streets cross or one ends on another (the tiles simplified the
 *  junction nodes off straight streets). A street whose end overshoots the street it meets — or
 *  falls short of it — by up to 1.5 units across that street (and 12 along itself) is ended on it:
 *  no stub past the kerb, no phantom fourth arm. Of several streets in reach, the one its end
 *  overshoots least; crossings past its new end go. Only streets snap (a tram line in the road is
 *  noded, never ended on). Not across a level: a bridge or a tunnel meets nothing but its own kind
 *  at its own layer. */
export function node(lines: Line[]) {
  const lvl = (l: Line) => `${l.tags.layer ?? '0'}|${l.tags.bridge ? 'b' : l.tags.tunnel ? 't' : 'g'}`;
  const SNAP = 1.5, ALONG = 12, C = 64;
  // segments by a global index; the hash pads each segment's box by the reach of a snap
  const segLine: number[] = [], segIdx: number[] = [], firstSeg: number[] = [];
  const H = new Map<number, number[]>();
  const hk = (u: number, v: number) => u * 1_000_003 + v;
  lines.forEach((l, li) => {
    firstSeg.push(segLine.length);
    for (let si = 0; si + 1 < l.p.length; si++) {
      const id = segLine.push(li) - 1;
      segIdx.push(si);
      const [a, b] = [l.p[si], l.p[si + 1]];
      for (let u = Math.floor((Math.min(a[0], b[0]) - ALONG) / C); u <= Math.floor((Math.max(a[0], b[0]) + ALONG) / C); u++)
        for (let v = Math.floor((Math.min(a[1], b[1]) - ALONG) / C); v <= Math.floor((Math.max(a[1], b[1]) + ALONG) / C); v++) {
          const k = hk(u, v);
          const cell = H.get(k);
          if (cell) cell.push(id);
          else H.set(k, [id]);
        }
    }
  });
  const street = (l: Line) => !!l.tags.highway;
  type Hit = { t: number; p: P; other: number }; // other: the other segment's id
  const hits = new Map<number, Hit[]>(); // segment id → crossings on it
  const addHit = (sid: number, h: Hit) => { const a = hits.get(sid); if (a) a.push(h); else hits.set(sid, [h]); };
  const seen = new Set<number>();
  for (const cell of H.values())
    for (let x = 0; x < cell.length; x++)
      for (let y = x + 1; y < cell.length; y++) {
        const A = Math.min(cell[x], cell[y]), Bq = Math.max(cell[x], cell[y]);
        const pk = A * 4_194_304 + Bq;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const la = segLine[A], lb = segLine[Bq];
        if (la === lb || lvl(lines[la]) !== lvl(lines[lb])) continue;
        const a0 = lines[la].p[segIdx[A]], a1 = lines[la].p[segIdx[A] + 1], b0 = lines[lb].p[segIdx[Bq]], b1 = lines[lb].p[segIdx[Bq] + 1];
        const rx = a1[0] - a0[0], ry = a1[1] - a0[1], sx = b1[0] - b0[0], sy = b1[1] - b0[1];
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) continue;
        const qx = b0[0] - a0[0], qy = b0[1] - a0[1];
        const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
        if (t > -1e-6 && t < 1 + 1e-6 && u > -1e-6 && u < 1 + 1e-6) {
          const p: P = [a0[0] + rx * t, a0[1] + ry * t];
          addHit(A, { t, p, other: Bq });
          addHit(Bq, { t: u, p, other: A });
        }
      }
  // ends: overshoots (a crossing on the end segment) and shortfalls (the end short of a street).
  // Overshoots first — a shortfall is then checked against the streets as trimmed. A closed way
  // (a roundabout drawn as one line) has no ends.
  const MIN_SIN = 0.2; // (under ~11°, a reach along the line is a street running beside, not a T)
  const TOUCH = 0.5; // (…but an end within half a unit of a street, at any angle, is on it: a slip lane's merge)
  const endAt = new Map<number, { start?: P; end?: P; ts?: number; te?: number; os?: number; oe?: number }>();
  const drop = new Map<string, Set<string>>(); // `${li}:${which}` → `${sid}:${t}` crossings past that new end
  const dropped = () => { const all = new Set<string>(); for (const d of drop.values()) for (const k of d) all.add(k); return all; };
  const extra: [number, Hit][] = []; // (street segment, the vertex it gets where an end came to rest)
  const sinOf = (ux: number, uy: number, oid: number) => {
    const o0 = lines[segLine[oid]].p[segIdx[oid]], o1 = lines[segLine[oid]].p[segIdx[oid] + 1];
    const ol = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]) || 1;
    return Math.abs((ux * (o1[1] - o0[1])) / ol - (uy * (o1[0] - o0[0])) / ol);
  };
  const endSeg = (li: number, which: 'start' | 'end') => (which === 'start' ? firstSeg[li] : firstSeg[li] + lines[li].p.length - 2);
  const closed = (l: Line) => same(l.p[0], l.p[l.p.length - 1]);
  lines.forEach((l, li) => {
    if (!street(l) || l.p.length < 2 || closed(l)) return;
    for (const which of ['start', 'end'] as const) {
      const sid = endSeg(li, which), si = segIdx[sid];
      const a = l.p[si], b = l.p[si + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < EPS) continue;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      // the street crossing nearest the end: snapped to only if it is within reach (a real
      // crossing a little further in is never passed over for a near-miss behind it)
      let near: Hit | null = null, over = Infinity;
      for (const h of hits.get(sid) ?? []) {
        if (!street(lines[segLine[h.other]])) continue;
        const o = (which === 'end' ? 1 - h.t : h.t) * len;
        if (o < over) (over = o), (near = h);
      }
      if (!near) continue;
      const m = endAt.get(li) ?? endAt.set(li, {}).get(li)!;
      if (over < 1e-3) { m[which] = near.p; continue; } // (already on it: shared exactly)
      const sn = sinOf(ux, uy, near.other);
      if (over > ALONG || !((sn >= MIN_SIN && over * sn <= SNAP) || over * sn <= TOUCH)) continue;
      // (a short street whose both ends would come to the same crossing keeps the lesser move)
      const otherEnd = which === 'start' ? 'end' : 'start', other = m[otherEnd];
      if (other && same(other, near.p)) {
        if (over >= (which === 'start' ? m.oe! : m.os!)) continue;
        delete m[otherEnd];
        if (otherEnd === 'start') delete m.ts, delete m.os;
        else delete m.te, delete m.oe;
        drop.delete(`${li}:${otherEnd}`);
      }
      m[which] = near.p;
      if (which === 'start') (m.ts = near.t), (m.os = over);
      else (m.te = near.t), (m.oe = over);
      const d = new Set<string>();
      for (const h of hits.get(sid) ?? []) if (which === 'end' ? h.t > near.t + 1e-9 : h.t < near.t - 1e-9) d.add(`${sid}:${h.t}`);
      drop.set(`${li}:${which}`, d);
    }
  });
  // the part of a street segment left after its own end moved (t range kept)
  const kept = (oid: number, t: number) => {
    const lo = segLine[oid], m = endAt.get(lo);
    if (!m) return true;
    if (oid === endSeg(lo, 'end') && m.te !== undefined && t > m.te + 1e-9) return false;
    if (oid === endSeg(lo, 'start') && m.ts !== undefined && t < m.ts - 1e-9) return false;
    return true;
  };
  lines.forEach((l, li) => {
    if (!street(l) || l.p.length < 2 || closed(l)) return;
    for (const which of ['start', 'end'] as const) {
      if (endAt.get(li)?.[which]) continue;
      const sid = endSeg(li, which), si = segIdx[sid];
      const a = l.p[si], b = l.p[si + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < EPS) continue;
      // shortfall: the end carried on along its own line meets a street within reach — at an
      // angle (a street running beside it is not one it ends on); or, at any angle, the end
      // within half a unit of a street (a merge). A hit on a street's vertex takes the vertex.
      const e = which === 'end' ? b : a, ux = (which === 'end' ? 1 : -1) * ((b[0] - a[0]) / len), uy = (which === 'end' ? 1 : -1) * ((b[1] - a[1]) / len);
      let best: { sid: number; t: number; p: P; s: number } | null = null;
      for (const oid of H.get(hk(Math.floor(e[0] / C), Math.floor(e[1] / C))) ?? []) {
        const lo = segLine[oid];
        if (lo === li || !street(lines[lo]) || lvl(lines[lo]) !== lvl(l)) continue;
        const c0 = lines[lo].p[segIdx[oid]], c1 = lines[lo].p[segIdx[oid] + 1], sx = c1[0] - c0[0], sy = c1[1] - c0[1];
        const sn = sinOf(ux, uy, oid), den = ux * sy - uy * sx;
        const at = (t: number): P => (t <= 1e-6 ? c0 : t >= 1 - 1e-6 ? c1 : [c0[0] + sx * t, c0[1] + sy * t]);
        if (sn >= MIN_SIN && Math.abs(den) > 1e-12) {
          const qx = c0[0] - e[0], qy = c0[1] - e[1];
          const sAlong = (qx * sy - qy * sx) / den, t = (qx * uy - qy * ux) / den;
          if (sAlong > 1e-9 && t >= -1e-6 && t <= 1 + 1e-6 && kept(oid, t) && sAlong <= ALONG && sAlong * sn <= SNAP) {
            if (!best || sAlong < best.s) best = { sid: oid, t, p: at(t), s: sAlong };
            continue;
          }
        }
        // (a merge: the perpendicular foot, within half a unit)
        const l2 = sx * sx + sy * sy || 1, t = ((e[0] - c0[0]) * sx + (e[1] - c0[1]) * sy) / l2;
        if (t < -1e-6 || t > 1 + 1e-6 || !kept(oid, t)) continue;
        const f = at(t), dd = Math.hypot(f[0] - e[0], f[1] - e[1]);
        if (dd <= TOUCH && dd > 1e-9 && (!best || dd < best.s)) best = { sid: oid, t, p: f, s: dd };
      }
      if (best) {
        (endAt.get(li) ?? endAt.set(li, {}).get(li)!)[which] = best.p;
        if (best.t > 1e-6 && best.t < 1 - 1e-6) extra.push([best.sid, { t: best.t, p: best.p, other: sid }]);
      }
    }
  });
  const dropAll = dropped();
  // rebuild: moved ends; each segment's crossings (bar those past a new end) in order
  for (const [sid, h] of extra) addHit(sid, h);
  lines.forEach((l, li) => {
    const m = endAt.get(li), pts: P[] = [];
    const nseg = l.p.length - 1;
    for (let si = 0; si < l.p.length; si++) {
      let v = l.p[si];
      if (si === 0 && m?.start) v = m.start;
      if (si === l.p.length - 1 && m?.end) v = m.end;
      if (!pts.length || !same(pts[pts.length - 1], v)) pts.push(v);
      if (si < nseg) {
        const sid = firstSeg[li] + si;
        const add = (hits.get(sid) ?? []).filter((h) => h.t > 1e-6 && h.t < 1 - 1e-6 && !dropAll.has(`${sid}:${h.t}`) && !(si === 0 && m?.start && same(h.p, m.start)) && !(si === nseg - 1 && m?.end && same(h.p, m.end)));
        for (const h of add.sort((x, y) => x.t - y.t)) if (!same(pts[pts.length - 1], h.p)) pts.push(h.p);
      }
    }
    l.p = pts;
  });
}
