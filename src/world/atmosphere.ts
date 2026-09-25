// Turns (sun, moon, weather, hour) into the shared palette: sky wash, key light, ambient, fog, night glow.
import * as THREE from 'three';
import { U } from '../render/shared';
import { skyUniforms } from './sky';
import type { CelestialState } from '../core/sun';

type Key = { e: number; zen: number; hor: number; sun: number; sunI: number; fog: number };
// Keyframes by sun elevation (deg). Colors are sRGB; interpolated in linear space.
const KEYS: Key[] = [
  { e: -18, zen: 0x060a1c, hor: 0x121833, sun: 0x8ea4d8, sunI: 0.0, fog: 0x1a2140 },
  { e: -9, zen: 0x121a40, hor: 0x2f3160, sun: 0x9a8ac0, sunI: 0.0, fog: 0x363a66 },
  { e: -4, zen: 0x26356a, hor: 0xa87088, sun: 0xff8a60, sunI: 0.08, fog: 0x8c6f86 },
  { e: 0, zen: 0x3b5687, hor: 0xeea276, sun: 0xff9350, sunI: 0.7, fog: 0xe0a88a },
  { e: 4, zen: 0x4a70a6, hor: 0xf4bf8a, sun: 0xffb46e, sunI: 1.15, fog: 0xecc7a4 },
  { e: 10, zen: 0x5a88c0, hor: 0xe8d6b8, sun: 0xffd8a8, sunI: 1.4, fog: 0xe3dccc },
  { e: 25, zen: 0x5f92cc, hor: 0xd4e2ea, sun: 0xfff0da, sunI: 1.6, fog: 0xd9e2e6 },
  { e: 70, zen: 0x5a8fcf, hor: 0xcfe0ec, sun: 0xfff6ea, sunI: 1.7, fog: 0xd6e0e8 },
];
const C = (h: number) => new THREE.Color(h);
const tmp = { a: new THREE.Color(), b: new THREE.Color() };
function lerpKey(e: number, pick: (k: Key) => number, out: THREE.Color) {
  if (e <= KEYS[0].e) return out.set(pick(KEYS[0]));
  for (let i = 0; i + 1 < KEYS.length; i++) {
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    if (e <= k1.e) {
      const t = (e - k0.e) / (k1.e - k0.e);
      return out.copy(tmp.a.set(pick(k0))).lerp(tmp.b.set(pick(k1)), t);
    }
  }
  return out.set(pick(KEYS[KEYS.length - 1]));
}
function lerpNum(e: number, pick: (k: Key) => number) {
  if (e <= KEYS[0].e) return pick(KEYS[0]);
  for (let i = 0; i + 1 < KEYS.length; i++) {
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    if (e <= k1.e) return pick(k0) + (pick(k1) - pick(k0)) * ((e - k0.e) / (k1.e - k0.e));
  }
  return pick(KEYS[KEYS.length - 1]);
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Weather { cloud: number; seaFog: number; haze: number; wind: number }

const overcast = C(0xb6babd);
const sand = C(0xc9b894);
const moonCol = C(0x8fa6dc);
const v = new THREE.Vector3();

export function applyAtmosphere(cel: CelestialState, w: Weather, hour: number, lightScale = 1) {
  const e = cel.sunElevation;
  lerpKey(e, (k) => k.zen, U.uSkyZenith.value);
  lerpKey(e, (k) => k.hor, U.uSkyHorizon.value);
  lerpKey(e, (k) => k.fog, U.uFogColor.value);
  const sunCol = lerpKey(e, (k) => k.sun, new THREE.Color());
  let sunI = lerpNum(e, (k) => k.sunI);

  // Clouds grey the wash and steal direct light.
  const oc = w.cloud * w.cloud;
  const dayness = smooth(-6, 8, e);
  U.uSkyZenith.value.lerp(tmp.a.copy(overcast).multiplyScalar(0.25 + 0.75 * dayness), oc * 0.7);
  U.uSkyHorizon.value.lerp(tmp.a.copy(overcast).multiplyScalar(0.2 + 0.8 * dayness), oc * 0.6);
  U.uFogColor.value.lerp(tmp.a.copy(overcast).multiplyScalar(0.2 + 0.8 * dayness), oc * 0.5);
  sunI *= 1 - oc * 0.75;

  const night = 1 - smooth(-10, -1, e);
  const golden = smooth(-3, 2, e) * (1 - smooth(6, 16, e));
  U.uNight.value = night;
  U.uGolden.value = golden * (1 - oc * 0.6);

  // Key light: sun by day, moon by night (crossfade during twilight).
  const k = smooth(-5, -0.5, e);
  const moonUp = smooth(-2, 6, cel.moonElevation);
  const moonI = (0.06 + 0.22 * cel.moonIllum) * moonUp * (1 - oc * 0.6);
  const sunDir = v.set(...cel.sunDir);
  U.uSunDir.value.copy(sunDir);
  const moonDir = new THREE.Vector3(...cel.moonDir);
  if (moonDir.y < 0.15) moonDir.set(0.3, 0.9, -0.3).normalize();
  const keyDir = k > 0.5 ? new THREE.Vector3(...cel.sunDir) : moonDir;
  if (keyDir.y < 0.06) keyDir.y = 0.06;
  U.uKeyDir.value.copy(keyDir.normalize());
  U.uKeyColor.value.copy(sunCol).multiplyScalar(sunI * k).lerp(tmp.a.copy(moonCol).multiplyScalar(moonI), 1 - k);
  U.uKeyColor.value.multiplyScalar(lightScale);

  // Ambient from the sky wash; bounce from sand.
  U.uAmbSky.value.copy(U.uSkyZenith.value).lerp(U.uSkyHorizon.value, 0.55).multiplyScalar((1.1 + 0.35 * oc) * lightScale);
  U.uAmbSky.value.addScalar(0.015 * night);
  U.uAmbGround.value.copy(sand).multiplyScalar((0.08 + 0.35 * Math.max(0, sunI / 3)) * lightScale).lerp(U.uAmbSky.value, 0.35);
  U.uFogSunColor.value.copy(sunCol).multiplyScalar(0.6 + 0.6 * golden).lerp(U.uFogColor.value, 0.35 + 0.4 * oc);
  U.uShadowTintAmt.value = 0.25 + 0.2 * golden;

  // Fog / haze / sea fog.
  U.uSeaFog.value = w.seaFog;
  U.uFogDensity.value = (0.00006 + w.haze * 0.00028) * (1 + oc * 0.8);
  U.uWind.value = w.wind;

  // Night life: windows and street lamps.
  const late = hour > 23.5 || hour < 5.5 ? 0.3 : 1;
  U.uWindowLit.value = (1 - smooth(-6, 3, e)) * 0.55 * late;
  U.uLampPower.value = 1 - smooth(-3, 4, e);

  skyUniforms.uMoonDir.value.set(...cel.moonDir);
  skyUniforms.uMoonPhase.value = cel.moonPhase;
  skyUniforms.uCloud.value = w.cloud;
}
