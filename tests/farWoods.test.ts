import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { farWoods, woodsMix, WoodsTally, blendWoods } from '../src/world/farWoods';
import { regionStyle } from '../src/world/styles';

// The far woods' make-up (ground.ts CANOPY, horizon.ts): the trees' own mix, so the forest past the
// trees turns and goes bare as the trees in front of it do.
const at = (lat: number, lon: number, elev = 0) => farWoods(regionStyle(lat, lon), elev, lat);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('the far woods', () => {
  it('a broadleaf country goes bare, a conifer country keeps its green', () => {
    const smokies = at(35.6, -83.81, 520), adirondacks = at(44.28, -73.98, 570), hoh = at(47.86, -123.93, 180);
    expect(smokies.decid).toBeGreaterThan(0.75); // (Appalachia's oaks, maples, tulip trees, hickories)
    expect(adirondacks.decid).toBeGreaterThan(0.45); // (the north woods' maples and birches among the spruce and pine)
    expect(adirondacks.decid).toBeLessThan(smokies.decid);
    expect(hoh.decid).toBeLessThan(0.35); // (a westside wood is fir, hemlock, cedar and Sitka country)
    expect(at(32.22, -110.97, 750).decid).toBe(0); // (the desert's mesquite and palo verde)
  });

  it('their hues are the broadleaves\' own, summing to one', () => {
    for (const [lat, lon, el] of [[35.6, -83.81, 520], [44.28, -73.98, 570], [47.86, -123.93, 180], [29.76, -95.37, 15], [39.19, -106.82, 2400], [32.22, -110.97, 750]]) {
      const f = at(lat, lon, el);
      expect(f.hues).toHaveLength(8);
      expect(sum(f.hues)).toBeCloseTo(1, 6);
      expect(f.hues[7]).toBe(0); // (7 is an evergreen's bronze: never a leaf that falls)
    }
    // the North's sugar and red maples scarlet, its birches gold
    const ny = at(44.28, -73.98, 570);
    expect(ny.hues[1]).toBeGreaterThan(0.1);
    expect(ny.hues[2]).toBeGreaterThan(0.3);
    // the westside's maple is the bigleaf, gold in the fall (props.ts), and its alders fall near green
    const hoh = at(47.86, -123.93, 180);
    expect(hoh.hues[2]).toBeGreaterThan(hoh.hues[1]);
    expect(hoh.hues[3]).toBeGreaterThan(0.1);
  });

  it("the West's aspens by the height you stand at", () => {
    const low = at(39.19, -106.82, 1500), band = at(39.19, -106.82, 2600);
    expect(band.hues[2]).toBeGreaterThan(low.hues[2] + 0.2); // (the montane band's groves, gold)
    expect(band.decid).toBeGreaterThan(low.decid);
  });

  it('is the scan\'s own mix: its conifers, its broadleaves, no shrubs', () => {
    const s = regionStyle(35.6, -83.81), mix = woodsMix(s, 520, 35.6);
    const [round, oak, , pine, spruce] = s.trees;
    expect(mix.get('conifer')).toBeCloseTo(pine + spruce, 6);
    expect(sum([...mix.values()])).toBeCloseTo(round + oak + pine + spruce, 6);
    expect(mix.has('shrub')).toBe(false);
  });
});

describe('the trees about the walker', () => {
  // (each kind on a crown 4 m across and 10 m tall unless it says: [name, how many, height, spread])
  const tile = (meshes: [string, number, number?, number?][]) => {
    const g = new THREE.Group();
    for (const [name, n, h = 10, r = 4] of meshes) g.add(Object.assign(new THREE.InstancedMesh(new THREE.BoxGeometry(r, h, r), new THREE.MeshBasicMaterial(), n), { name }));
    return g;
  };

  it('counts the canopy\'s crowns kind by kind and form by form, never the shrubs under it', () => {
    const t = new WoodsTally();
    t.add('a', tile([['trees:maple:0', 30], ['trees:spruce:1', 70], ['trees:shrub:0', 50], ['trees:dogwood:0', 9], ['grass', 400]]));
    const w = t.woods();
    expect(w.n).toBe(100);
    expect(w.decid).toBeCloseTo(0.3, 6);
    expect(w.hues[1]).toBeCloseTo(1, 6); // (the East's maple: scarlet)
    // (the westside's bigleaf maple, form 2: gold)
    t.add('b', tile([['trees:maple:2', 30]]));
    const v = t.woods();
    expect(v.n).toBe(130);
    expect(v.hues[2]).toBeCloseTo(0.5, 6);
  });

  it('weighs each crown by what of it shows over the wood: its spread times its height', () => {
    const t = new WoodsTally();
    // (the Adirondacks': 25 m white pines over 10 m maples — six maples in ten by count)
    t.add('a', tile([['trees:maple:0', 60, 10, 8], ['trees:whitepine:1', 40, 25, 12]]));
    const w = t.woods();
    expect(w.n).toBe(100);
    expect(w.decid).toBeCloseTo((60 * 16 * 10) / (60 * 16 * 10 + 40 * 36 * 25), 6);
    expect(w.decid).toBeLessThan(0.25);
    // (a tree scaled to nothing isn't there; one out of the wood isn't the wood's)
    const m = Object.assign(new THREE.InstancedMesh(new THREE.BoxGeometry(4, 10, 4), new THREE.MeshBasicMaterial(), 3), { name: 'trees:oak:0' });
    m.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
    m.setMatrixAt(1, new THREE.Matrix4().makeTranslation(500, 0, 0));
    const g = new THREE.Group().add(m);
    t.add('b', g, (x) => x < 100);
    expect(t.woods().n).toBe(101);
  });

  it('follows the tiles as they come and go', () => {
    const t = new WoodsTally(), v0 = t.version;
    t.add('a', tile([['trees:oak:0', 10]]));
    expect(t.version).toBeGreaterThan(v0);
    const v1 = t.version;
    t.add('a', tile([['trees:oak:0', 20]])); // (a tile mounted anew replaces its count)
    expect(t.woods().n).toBe(20);
    t.remove('a');
    expect(t.version).toBeGreaterThan(v1);
    expect(t.woods().n).toBe(0);
    t.remove('a'); // (a tile never mounted: nothing moves)
    expect(t.version).toBe(v1 + 2);
  });

  it('weighs the trees seen against the region\'s mix as they come in', () => {
    const prior = { decid: 0.8, hues: [1, 0, 0, 0, 0, 0, 0, 0] };
    const none = blendWoods(prior, { decid: 0, hues: [1, 0, 0, 0, 0, 0, 0, 0], n: 0 });
    expect(none.decid).toBeCloseTo(0.8, 6);
    const many = blendWoods(prior, { decid: 0.1, hues: [0, 0, 1, 0, 0, 0, 0, 0], n: 30000 });
    expect(many.decid).toBeCloseTo(0.1, 1);
    expect(many.hues[2]).toBeGreaterThan(0.8);
    expect(sum(many.hues)).toBeCloseTo(1, 6);
    const half = blendWoods(prior, { decid: 0.2, hues: [0, 0, 1, 0, 0, 0, 0, 0], n: 300 });
    expect(half.decid).toBeCloseTo(0.5, 6);
  });
});
