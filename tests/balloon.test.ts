import { describe, it, expect } from 'vitest';
import { BALLOON, newBalloon, stepBalloon, levelTemp, airDensity, type BalloonState, type BalloonInput } from '../src/player/balloonPhysics';
import { windLayers, windAt, WIND_LAYERS } from '../src/world/wind';
import { balloonRecipe, balloonGeometry, flameGeometry, BALLOON_PATTERNS } from '../src/assets/balloon';
import { validGeometry } from '../src/assets/core';

const calm = { wind: [0, 0] as [number, number] };
const fly = (s: BalloonState, inp: Partial<BalloonInput>, secs: number, ground = 0, wind: [number, number] = [0, 0]) => {
  const I: BalloonInput = { burn: 0, vent: 0, fanX: 0, fanZ: 0, assist: false, ...inp };
  for (let t = 0; t < secs; t += 0.05) stepBalloon(s, I, { ground, wind }, 0.05);
  return s;
};

describe('balloon physics', () => {
  it('floats level at the level temperature: a real balloon runs ~70–90 °C', () => {
    const T = levelTemp(0) - 273.15;
    expect(T).toBeGreaterThan(65);
    expect(T).toBeLessThan(95);
    expect(levelTemp(1500)).toBeGreaterThan(levelTemp(0)); // thinner air: hotter to float
    expect(airDensity(0)).toBeCloseTo(1.225, 3);
  });

  it('sits on the ground cold, lifts off on the burner, climbs at a real balloon\'s rate', () => {
    const s = newBalloon(0, 0, 0, true);
    fly(s, {}, 5, 0, calm.wind);
    expect(s.landed).toBe(true);
    expect(s.y).toBe(0);
    fly(s, { burn: 1 }, 25);
    expect(s.landed).toBe(false);
    expect(s.y).toBeGreaterThan(20);
    expect(s.vy).toBeGreaterThan(1.5);
    expect(s.vy).toBeLessThan(6); // (real ones climb 1–5 m/s)
    expect(s.T).toBeLessThanOrEqual(BALLOON.Tmax);
  });

  it('answers the burner late — the lag you fly by — but turns round within seconds', () => {
    const s = newBalloon(0, 300, 0, false);
    s.T = levelTemp(300);
    fly(s, { burn: 1 }, 0.5);
    expect(s.vy).toBeLessThan(0.3); // half a second in: barely moving yet
    fly(s, { burn: 1 }, 10);
    const up = s.vy;
    expect(up).toBeGreaterThan(1);
    let t = 0;
    while (s.vy > 0 && t < 30) { fly(s, { vent: 1 }, 0.25); t += 0.25; }
    expect(t).toBeGreaterThan(1); // it carries on up a moment…
    expect(t).toBeLessThan(12); // …then sinks
  });

  it('the assist holds the height you let go at', () => {
    const s = newBalloon(0, 0, 0, true);
    fly(s, { burn: 1 }, 30);
    fly(s, { assist: true }, 60);
    const y0 = s.y;
    fly(s, { assist: true }, 60);
    expect(Math.abs(s.y - y0)).toBeLessThan(8);
    expect(Math.abs(s.vy)).toBeLessThan(0.5);
    // and sinks to the ground on the vent, landing gently
    fly(s, { vent: 1 }, 240);
    expect(s.landed).toBe(true);
    expect(s.y).toBe(0);
  });

  it('goes with the wind, the fan only nudges it', () => {
    const s = newBalloon(0, 400, 0, false);
    s.T = levelTemp(400);
    fly(s, { assist: true }, 60, 0, [5, 0]);
    expect(s.vx).toBeGreaterThan(4.5);
    expect(s.x).toBeGreaterThan(150);
    fly(s, { assist: true, fanZ: -1 }, 40, 0, [5, 0]);
    expect(s.vz).toBeLessThan(-1); // pushed north a little…
    expect(Math.abs(s.vz)).toBeLessThanOrEqual(BALLOON.fan + 0.01); // …never more than the fan
  });

  it('never falls through the ground, a roof or the sea', () => {
    const s = newBalloon(0, 50, 0, false);
    s.T = 300;
    fly(s, {}, 60, 12);
    expect(s.y).toBeGreaterThanOrEqual(12);
    expect(s.landed).toBe(true);
  });
});

describe('winds aloft', () => {
  it('turn and strengthen with height, the same for everyone, easing hour to hour', () => {
    const L = windLayers(1234, 480000.25);
    expect(L.map((l) => l.y)).toEqual(WIND_LAYERS);
    for (let i = 1; i < L.length; i++) expect(L[i].speed).toBeGreaterThan(L[i - 1].speed * 0.9);
    const turn = L[3].dir - L[0].dir;
    expect(turn).toBeGreaterThan(1.5); // the top layer blows a very different way from the surface
    expect(windLayers(1234, 480000.25)).toEqual(L); // deterministic
    const a = windAt(windLayers(1234, 480000.999), 300), b = windAt(windLayers(1234, 480001.001), 300);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.2); // no jump at the hour
    const w0 = windAt(L, 0), w1 = windAt(L, 100), w2 = windAt(L, 200);
    expect(w1[0]).toBeCloseTo((w0[0] + w2[0]) / 2, 5); // between layers, interpolated
  });
});

describe('the balloon family', () => {
  it('every pattern is valid, grounded, balloon-sized and within its vertex budget', () => {
    for (let seed = 1; seed <= 12; seed++)
      for (const pattern of BALLOON_PATTERNS) {
        const r = balloonRecipe(seed, undefined, pattern);
        const { geo, burnerY, mouthY, topY } = balloonGeometry(r);
        expect(validGeometry(geo, { w: 20, h: 28, d: 20 }, 0.01), `${seed}:${pattern}`).toBe(true);
        expect(geo.getAttribute('position').count).toBeLessThan(4800); // (a handful in the sky at once, never instanced by the thousand)
        expect(burnerY).toBeLessThan(mouthY);
        expect(topY - mouthY).toBeGreaterThan(15);
        expect(geo.getAttribute('color').count).toBe(geo.getAttribute('position').count);
      }
    expect(flameGeometry().getAttribute('position').count).toBeLessThan(200);
  });
  it('wears the colours the brush chooses', () => {
    const r = balloonRecipe(3, [0x123456, 0x654321]);
    expect(r.colors).toEqual([0x123456, 0x654321, 0x654321]);
    expect(balloonRecipe(3)).toEqual(balloonRecipe(3)); // deterministic
  });
});
