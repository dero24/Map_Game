import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { presenceOdds, ABUNDANCE, CRITTERS, type CritterKind } from '../src/assets/fauna';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// How common each animal is, and where: the squirrels and the town birds everywhere; the turkeys, the
// foxes, the deer and the elk a sighting in a town, more in the woods and the fields, and the big ones
// rare even there (fauna.ts ABUNDANCE, sim/critters.ts present)
const lawn = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false, deckAt: () => null } as unknown as WalkWorld;
const present = (c: Critters, sp: CritterKind, x: number, z: number, wild: number, m = 7) =>
  (c as unknown as { present(sp: CritterKind, x: number, z: number, wild: number, m: number): boolean }).present(sp, x, z, wild, m);
const share = (sp: CritterKind, wild: number, m = 7) => {
  const c = new Critters(lawn, walk);
  let n = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) if (present(c, sp, i * 160 + 5, j * 160 + 5, wild, m)) n++;
  return n / 1600;
};

describe('how common each animal is', () => {
  it('every animal has its odds; the town birds and the squirrels everywhere, the shy and the big ones scarce in a town and none common everywhere', () => {
    for (const k of CRITTERS) expect(ABUNDANCE[k], k).toBeDefined();
    for (const k of ['squirrel', 'pigeon', 'songbird', 'ringbilledgull'] as CritterKind[]) expect(presenceOdds(k, 0), k).toBeGreaterThan(0.9);
    for (const k of ['wildturkey', 'elk', 'moose', 'blackbear', 'hornedlizard', 'snowshoe', 'collaredlizard', 'riverotter'] as CritterKind[]) expect(presenceOdds(k, 0), k).toBeLessThan(0.05);
    for (const k of ['fox', 'coyote', 'deer', 'muleDeer', 'beaver'] as CritterKind[]) expect(presenceOdds(k, 0), k).toBeLessThan(0.15);
    for (const k of CRITTERS) expect(presenceOdds(k, 1), k).toBeGreaterThanOrEqual(presenceOdds(k, 0) - 1e-9); // (never fewer in the wild)
    expect(presenceOdds('blackbear', 1)).toBeLessThan(0.1);
    expect(presenceOdds('moose', 1)).toBeLessThan(0.15);
  });
  it('the patches of ground: a turkey about one 160 m patch in twenty in a town, a third of them in the woods; the same patch the same every visit; a new draw each month', () => {
    const town = share('wildturkey', 0), wild = share('wildturkey', 1);
    expect(town).toBeLessThan(0.04);
    expect(wild).toBeGreaterThan(0.25);
    expect(wild).toBeLessThan(0.45);
    expect(share('squirrel', 0)).toBe(1);
    expect(Math.abs(share('fox', 1) - presenceOdds('fox', 1))).toBeLessThan(0.04); // (the lottery keeps its odds)
    const a = new Critters(lawn, walk), b = new Critters(lawn, walk);
    let same = 0, moved = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 160 + 5, z = 777;
      if (present(a, 'fox', x, z, 1) === present(b, 'fox', x, z, 1)) same++;
      if (present(a, 'fox', x, z, 1) !== present(a, 'fox', x, z, 1, 8)) moved++;
    }
    expect(same).toBe(200); // (deterministic: every visitor's the same)
    expect(moved).toBeGreaterThan(10);
  });
  it("a shore town's street (Sea Bright): the squirrels, the gulls, the robins; a turkey or a fox now and then — and out of town, more of them", () => {
    const tally = (settled: number, hour: number) => {
      const seen: Record<string, number> = {};
      for (let p = 0; p < 30; p++) {
        const x = (p % 6) * 400, z = Math.floor(p / 6) * 400;
        const c = new Critters(lawn, walk), got = new Set<string>();
        const env: CritterEnv = { hour, night: hour > 19 ? 0.3 : 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, -1, 0), trees: () => [{ x: x + 5, z: z + 5 }], gardens: () => [], movers: [], place: castOf(regionStyle(40.36, -73.97)), urban: settled ? 0.3 : 0, settled };
        for (let i = 0; i < 120; i++) { c.update(0.05, x, z, env); for (const o of (c as unknown as { list: { kind: string }[] }).list) got.add(o.kind); }
        for (const k of got) seen[k] = (seen[k] ?? 0) + 1;
      }
      return (k: string) => seen[k] ?? 0;
    };
    const town = tally(1, 12), wild = tally(0, 12), townDusk = tally(1, 19.6), wildDusk = tally(0, 19.6);
    expect(town('squirrel')).toBeGreaterThan(25);
    expect(town('robin') + town('songbird')).toBeGreaterThan(25);
    expect(town('wildturkey')).toBeLessThanOrEqual(2);
    expect(wild('wildturkey')).toBeGreaterThan(town('wildturkey') + 4);
    expect(townDusk('fox') + townDusk('coyote')).toBeLessThanOrEqual(4);
    expect(wildDusk('fox') + wildDusk('coyote')).toBeGreaterThan(townDusk('fox') + townDusk('coyote') + 4);
  }, 60000);
});
