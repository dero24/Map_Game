// Hot air balloon flight: the physics of the real thing, with the lag kept readable.
//
// Lift is buoyancy: the envelope's V m³ of hot air weighs less than the same volume of the air
// around it, L = V·ρ(y)·(1 − Tₐ(y)/T)·g, against the balloon's weight M·g and a quadratic drag on
// the envelope's cross-section. The envelope temperature T is the state you fly: the burner heats
// it, the fabric loses heat to the air, the parachute vent dumps it fast. Air is ISA: 15 °C and
// 1.225 kg/m³ at sea level, −6.5 K/km. The balloon also drags ~half its volume of air along with
// it (added mass), which is why a balloon answers the burner seconds late — that lag is the feel
// of ballooning, kept, but short enough to read (~3 s to turn a climb round).
//
// You can't steer a balloon: it goes where the wind at its height goes, and the wind turns and
// strengthens with height (world/wind.ts) — choosing a height is choosing a direction. The game's
// gift: a little "fan" (the stick) nudges you ±1.5 m/s, and an assist holds the height you let go
// at (the burner blips for you), or flies to a height you pick.
//
// Pure (no three, no DOM): tests/balloon.test.ts flies it.

export const BALLOON = {
  V: 2800, // envelope volume (m³)
  M: 620, // envelope, basket, burner, fuel and pilot (kg)
  A: 230, // cross-section (m²) for drag
  Cd: 0.6,
  heat: 3.2, // K/s the burner adds at full roar
  cool: 0.009, // 1/s: heat lost through the fabric (∝ T − Tₐ)
  vent: 4.5, // K/s the parachute vent dumps, fully open
  Tmax: 385, // K: the fabric's limit (112 °C)
  fan: 1.5, // m/s the stick's gentle push
  catchUp: 1 / 6, // 1/s: how fast the basket takes up the wind's speed
  ceiling: 3000, // m above sea level
} as const;
const G = 9.81;

export const airTemp = (y: number) => 288.15 - 0.0065 * Math.max(0, y);
export const airDensity = (y: number) => 1.225 * Math.pow(1 - 2.25577e-5 * Math.max(0, y), 4.2559);
/** The envelope temperature (K) at which the balloon floats level at height y. */
export function levelTemp(y: number) {
  const rho = airDensity(y);
  return airTemp(y) / (1 - BALLOON.M / (BALLOON.V * rho));
}

export interface BalloonState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  T: number; // envelope air temperature (K)
  burn: number; // the flame, 0..1 (what the burner is doing this moment)
  venting: number;
  landed: boolean;
  hold: number | null; // the height the assist holds (null: none)
}
export interface BalloonInput {
  burn: number; // 0..1 held
  vent: number; // 0..1 held
  fanX: number; fanZ: number; // the stick, in world axes (−1..1)
  assist: boolean;
}
export interface BalloonEnv {
  ground: number; // the surface under the basket (terrain, roof or the water)
  wind: [number, number]; // m/s at the balloon's height
}

export function newBalloon(x: number, y: number, z: number, landed = true): BalloonState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, T: levelTemp(y) - (landed ? 4 : 0), burn: 0, venting: 0, landed, hold: landed ? null : y };
}

/** The burner the assist would run to settle at `target` (0..1), and whether it'd vent. */
function assistInputs(s: BalloonState, target: number) {
  const want = Math.max(-2.2, Math.min(2.2, (target - s.y) * 0.18)); // m/s toward the target
  const Tneed = levelTemp(s.y) + (want - s.vy) * 5.5 + (want * 2.2); // hotter to climb, cooler to sink
  const hold = (BALLOON.cool * (s.T - airTemp(s.y))) / BALLOON.heat; // what just holds T
  const burn = Math.max(0, Math.min(1, hold + (Tneed - s.T) * 0.6));
  const vent = s.T - Tneed > 6 ? Math.min(1, (s.T - Tneed - 6) * 0.15) : 0;
  return { burn, vent };
}

/** Advance a balloon dt seconds (≤ 0.1 each step; call it more often for more). */
export function stepBalloon(s: BalloonState, inp: BalloonInput, env: BalloonEnv, dt: number): BalloonState {
  dt = Math.min(dt, 0.1);
  let burn = Math.max(0, Math.min(1, inp.burn)), vent = Math.max(0, Math.min(1, inp.vent));
  const manual = burn > 0 || vent > 0;
  if (manual) s.hold = null;
  else if (inp.assist) {
    if (s.hold === null && !s.landed) s.hold = s.y + s.vy * 2.5; // (where the climb would level off)
    if (s.hold !== null) { const a = assistInputs(s, s.hold); burn = a.burn; vent = a.vent; }
  }
  // the envelope
  const Ta = airTemp(s.y);
  s.T += (BALLOON.heat * burn - BALLOON.cool * (s.T - Ta) - BALLOON.vent * vent) * dt;
  s.T = Math.max(Ta, Math.min(BALLOON.Tmax, s.T));
  s.burn += (burn - s.burn) * Math.min(1, dt * 12);
  s.venting += (vent - s.venting) * Math.min(1, dt * 8);
  // vertical: buoyancy − weight − drag, over the balloon's mass and the air it carries
  const rho = airDensity(s.y);
  const lift = BALLOON.V * rho * (1 - Ta / s.T) * G, weight = BALLOON.M * G;
  const drag = 0.5 * rho * BALLOON.Cd * BALLOON.A * s.vy * Math.abs(s.vy);
  const mEff = BALLOON.M + 0.5 * rho * BALLOON.V;
  s.vy += ((lift - weight - drag) / mEff) * dt;
  // horizontal: the basket takes up the wind (plus the fan's push); on the ground it drags
  const tx = env.wind[0] + inp.fanX * BALLOON.fan, tz = env.wind[1] + inp.fanZ * BALLOON.fan;
  const k = s.landed ? Math.min(1, dt * 3) : Math.min(1, dt * BALLOON.catchUp);
  s.vx += ((s.landed ? 0 : tx) - s.vx) * k;
  s.vz += ((s.landed ? 0 : tz) - s.vz) * k;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.y += s.vy * dt;
  // the ground (or the water, or a roof): the basket sits on it until the lift carries it off
  if (s.y <= env.ground) {
    s.y = env.ground;
    if (s.vy < 0) s.vy = 0;
    s.landed = lift < weight * 1.002;
    if (s.landed && s.hold !== null && s.hold <= env.ground + 1) s.hold = null;
  } else if (s.y > env.ground + 0.3) s.landed = false;
  if (s.y > BALLOON.ceiling) { s.y = BALLOON.ceiling; s.vy = Math.min(0, s.vy); }
  return s;
}
