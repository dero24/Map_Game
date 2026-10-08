// Side tuning panel (lil-gui), hidden by default (` toggles it). Only knobs the player actually
// changed persist to localStorage (a diff against the shipped defaults), so improved defaults
// always reach everyone who hasn't overridden that one knob.
import GUI from 'lil-gui';
import { postParams, LOOKS } from '../render/post';
import { shadowParams } from '../render/shadows';
import { walkParams } from '../player/controller';
import { waterParams } from '../world/water';
import { U } from '../render/shared';
import { lifeParams } from '../sim/life';
import { audioParams } from '../audio/ambience';
import { animalList, whereToSee } from './seeIt';
import type { CritterKind } from '../assets/fauna';

// farSeason: the forest past the trees (the far ring's canopy, the wooded ridges) turns and goes bare
// with the season, as the trees do (world/farWoods.ts) — off, its summer green all year, as it was
export const timeParams = { realTime: true, hour: 18.5, speed: 60, dayOfYear: 0, farSeason: true };
export const weatherParams = { cloud: 0.35, seaFog: 0.0, haze: 0.35, wind: 0.5, autoWeather: true, snow: -1, fogMode: 'rare, anywhere' }; // snow −1 = the season's own (season.ts)
/** Drifting weather's fog (main.ts): now and then anywhere (more on a coastal morning), only a
 *  coastal morning's marine layer, or never. */
export const FOG_MODES = ['rare, anywhere', 'coastal mornings', 'never'] as const;
/** Weather to test against (the panel's preset menu): each pins the weather (drifting off) —
 *  'drifting' hands it back to the clock. */
export const WEATHER_PRESETS: Record<string, Partial<typeof weatherParams>> = {
  drifting: { autoWeather: true },
  clear: { autoWeather: false, cloud: 0.08, seaFog: 0, haze: 0.12, wind: 0.3, snow: -1 },
  fair: { autoWeather: false, cloud: 0.35, seaFog: 0, haze: 0.35, wind: 0.5, snow: -1 },
  'hazy summer': { autoWeather: false, cloud: 0.15, seaFog: 0, haze: 0.85, wind: 0.2, snow: -1 },
  'marine layer': { autoWeather: false, cloud: 0.5, seaFog: 0.45, haze: 0.4, wind: 0.3, snow: -1 },
  'thick fog': { autoWeather: false, cloud: 0.8, seaFog: 0.9, haze: 0.7, wind: 0.1, snow: -1 },
  overcast: { autoWeather: false, cloud: 0.92, seaFog: 0, haze: 0.5, wind: 0.6, snow: -1 },
  blustery: { autoWeather: false, cloud: 0.55, seaFog: 0, haze: 0.25, wind: 1.3, snow: -1 },
  'snow day': { autoWeather: false, cloud: 0.85, seaFog: 0.05, haze: 0.5, wind: 0.6, snow: 0.9 },
};
export const debugParams = { rawScene: false, showStats: false, lightScale: 1, summons: false }; // summons: the developer's free rides (V car, Shift+B boat, N plane)

let STORE = 'world.panel.v3';
type Bag = Record<string, unknown>;
const bags: Record<string, Bag> = { post: postParams, shadow: shadowParams, walk: walkParams, time: timeParams, weather: weatherParams, debug: debugParams, life: lifeParams, audio: audioParams };
const DEFAULTS = JSON.parse(JSON.stringify(bags)) as Record<string, Bag>;
const U_KEYS = ['uPigment', 'uPigmentScale', 'uShadowStrength'] as const;
const U_DEFAULTS = Object.fromEntries(U_KEYS.map((k) => [k, U[k].value as number]));

/** `bag.key` for every knob the player saved (auto-quality never overrides those). */
export const userKeys = new Set<string>();

export function loadSettings(region = 'world') {
  STORE = `${region}.panel.v3`; // v3: diffs only; older full snapshots are retired
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Bag>;
    for (const [k, bag] of Object.entries(bags)) if (saved[k]) for (const [p, v] of Object.entries(saved[k])) if (p in bag && typeof v === typeof bag[p]) (bag[p] = v), userKeys.add(`${k}.${p}`);
    if (saved.uniforms) for (const [p, v] of Object.entries(saved.uniforms)) if (p in U && typeof v === 'number') (U as unknown as Record<string, { value: number }>)[p].value = v;
  } catch { /* fresh start */ }
}
function save() {
  const out: Record<string, Bag> = {};
  for (const [k, bag] of Object.entries(bags)) {
    const d: Bag = {};
    for (const [p, v] of Object.entries(bag)) if (!(k === 'walk' && p === 'fly') && JSON.stringify(v) !== JSON.stringify(DEFAULTS[k]?.[p])) d[p] = v;
    if (Object.keys(d).length) out[k] = d;
  }
  const u: Record<string, number> = {};
  for (const k of U_KEYS) if (U[k].value !== U_DEFAULTS[k]) u[k] = U[k].value;
  try { localStorage.setItem(STORE, JSON.stringify({ ...out, uniforms: u })); } catch { /* storage off */ }
}

export function buildPanel(hooks: { onResize: () => void; onPreset: (hour: number) => void; onRespawn: () => void; onResetExplore: () => void; onSummon: (kind: 'car' | 'boat' | 'plane') => void; onSee: (kind: CritterKind) => void; onFind: (kind: CritterKind) => void; onEveryone: (on: boolean) => void }, region: { name: string; tz: string; respawn?: string }) {
  const gui = new GUI({ title: `${region.name} · tuning` });
  gui.onFinishChange(save);
  const ZONES: Record<string, string> = { 'America/Los_Angeles': 'Pacific', 'America/Denver': 'Mountain', 'America/Phoenix': 'Arizona', 'America/Chicago': 'Central', 'America/New_York': 'Eastern' };
  const tzName = ZONES[region.tz] ?? region.tz.split('/').pop()?.replace(/_/g, ' ') ?? 'local';

  // Look: named presets first (each sets the watercolor knobs below), then the resolution and
  // colour-grade knobs a look is mostly made of. Picking a look saves like any other knob.
  const look = gui.addFolder('Look');
  const pick = { look: 'watercolor HD' };
  look.add(pick, 'look', Object.keys(LOOKS)).name('preset').onChange((k: string) => {
    Object.assign(postParams, LOOKS[k]);
    hooks.onResize();
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    save();
  });
  look.add(postParams, 'paintDetail', 0.35, 1, 0.01).name('paint detail').onFinishChange(hooks.onResize);
  look.add(postParams, 'hiDpi').name('full screen resolution').onFinishChange(hooks.onResize);
  look.add(postParams, 'renderScale', 0.5, 1.5, 0.05).name('render scale').onFinishChange(hooks.onResize);
  look.add(postParams, 'crisp', 0, 1, 0.01).name('clean edges');
  look.add(postParams, 'softGlow', 0, 1, 0.01).name('soft glow');
  look.add(postParams, 'clarity', 0, 1, 0.01).name('clarity');
  look.add(postParams, 'contrast', 0, 1, 0.01).name('contrast');
  look.add(postParams, 'vibrance', -0.5, 1.5, 0.01).name('vibrance');
  look.add(postParams, 'grade', 0, 1, 0.01).name('colour grade');
  look.addColor(postParams, 'gradeShadow').name('grade: shadows');
  look.addColor(postParams, 'gradeLight').name('grade: lights');

  const t = gui.addFolder('Time of day');
  t.add(timeParams, 'realTime').name(`real clock (${tzName})`).listen();
  t.add(timeParams, 'hour', 0, 24, 0.01).name('hour').listen().onChange(() => (timeParams.realTime = false));
  t.add(timeParams, 'speed', 0, 3600, 1).name('time speed ×');
  t.add(timeParams, 'dayOfYear', 0, 366, 1).name('day of year (0 = today)'); // the season follows: snow, bare trees, autumn
  t.add(timeParams, 'farSeason').name('far forests follow the season').listen();
  const presets = { sunrise: () => hooks.onPreset(6.9), morning: () => hooks.onPreset(9.5), noon: () => hooks.onPreset(12.9), golden: () => hooks.onPreset(18.35), dusk: () => hooks.onPreset(19.25), night: () => hooks.onPreset(22.5) };
  for (const k of Object.keys(presets)) t.add(presets, k as keyof typeof presets);

  const w = gui.addFolder('Weather');
  const wx = { preset: weatherParams.autoWeather ? 'drifting' : 'custom' };
  w.add(wx, 'preset', ['custom', ...Object.keys(WEATHER_PRESETS)]).name('weather preset').listen().onChange((k: string) => {
    const p = WEATHER_PRESETS[k];
    if (!p) return;
    Object.assign(weatherParams, p);
    save();
  });
  w.add(weatherParams, 'autoWeather').name('drifting weather').listen().onChange((on: boolean) => { wx.preset = on ? 'drifting' : 'custom'; });
  w.add(weatherParams, 'fogMode', [...FOG_MODES]).name('drifting fog');
  const custom = () => { if (!weatherParams.autoWeather) wx.preset = 'custom'; };
  w.add(weatherParams, 'cloud', 0, 1, 0.01).listen().onChange(custom);
  w.add(weatherParams, 'seaFog', 0, 1, 0.01).name('sea fog').listen().onChange(custom);
  w.add(weatherParams, 'haze', 0, 1, 0.01).listen().onChange(custom);
  w.add(weatherParams, 'wind', 0, 1.5, 0.01).listen().onChange(custom);
  w.add(weatherParams, 'snow', -1, 1, 0.01).name('snow (−1 = season)').listen().onChange(custom);

  const life = gui.addFolder('Life & sound');
  life.add(lifeParams, 'enabled').name('townsfolk, cars, gulls');
  life.add(lifeParams, 'density', 0, 3, 0.01).name('how busy (everywhere)');
  // (each kind of place its own: the quiet streets thinner than a main street or a city's towers)
  life.add(lifeParams, 'suburbs', 0, 3, 0.01).name('how busy: suburbs & country');
  life.add(lifeParams, 'towns', 0, 3, 0.01).name('how busy: main streets');
  life.add(lifeParams, 'cities', 0, 3, 0.01).name('how busy: cities');
  life.add(lifeParams, 'beach', 0, 1, 0.01).name('how busy: the beach');
  life.add(lifeParams, 'animals', 0, 2, 0.01).name('how many animals');
  life.add(audioParams, 'volume', 0, 1, 0.01).name('volume');
  life.add(audioParams, 'muted').name('mute');

  // Creatures: off to where an animal lives, in its month and at its hour (seeIt.ts), stood by its water
  // if it keeps to one; it's made sure to come, and you're told where it is
  const animals = animalList(), MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const see = { animal: (animals['harbor seal'] ?? Object.values(animals)[0]) as CritterKind, where: '', everyone: false };
  const where = () => {
    const w = whereToSee(see.animal);
    see.where = w ? `${w.lat.toFixed(2)}, ${w.lon.toFixed(2)} · ${MONTH[w.month - 1]} · ${Math.floor(w.hour)}:${String(Math.round((w.hour % 1) * 60)).padStart(2, '0')}${w.habitat === 'land' ? '' : w.habitat === 'sea' ? ' · by the sea' : ' · by fresh water'}` : 'nowhere yet';
  };
  where();
  const cr = gui.addFolder('Creatures');
  cr.add(see, 'animal', animals).name('animal').onChange(where);
  cr.add(see, 'where').name('goes to').listen().disable();
  cr.add({ go: () => hooks.onSee(see.animal) }, 'go').name('go see it');
  cr.add({ find: () => hooks.onFind(see.animal) }, 'find').name('where is it?');
  cr.add(see, 'everyone').name('every animal about (ignore how rare)').onChange(hooks.onEveryone);

  const p = gui.addFolder('Watercolor');
  p.add(postParams, 'enabled').name('painting on');
  // (the map always paints in what you've explored; sketch mode puts the world itself in pencil)
  p.add(postParams, 'sketchFar').name('sketch mode: pencil till you walk or photograph it');
  p.add(postParams, 'sketchReach', 20, 400, 5).name('paint reach as you walk (m)');
  p.add(postParams, 'photoReach', 200, 22000, 100).name('a photo paints out to (m)');
  p.add(postParams, 'kuwaharaRadius', 1, 7, 0.1).name('brush size');
  p.add(postParams, 'kuwaharaSharpness', 1, 16, 0.1).name('brush sharpness');
  p.add(postParams, 'wobble', 0, 3, 0.01).name('hand wobble');
  p.add(postParams, 'edgeDarkening', 0, 2, 0.01).name('edge darkening');
  p.add(postParams, 'pigmentTurbulence', 0, 1, 0.01).name('pigment turbulence');
  p.add(U.uPigment, 'value', 0, 1, 0.01).name('pigment (world)');
  p.add(U.uPigmentScale, 'value', 0.05, 2, 0.01).name('pigment scale');
  p.add(postParams, 'granulation', 0, 1.5, 0.01);
  p.add(postParams, 'paperTexture', 0, 2, 0.01).name('paper tooth');
  p.add(postParams, 'ink', 0, 1.5, 0.01).name('ink lines');
  p.add(postParams, 'inkDistance', 50, 1500, 1).name('ink reach (m)');
  p.add(postParams, 'glow', 0, 2, 0.01).name('wet bloom');
  p.add(postParams, 'vignette', 0, 1, 0.01).name('unpainted margin');
  p.add(postParams, 'saturation', 0, 2, 0.01);
  p.add(postParams, 'exposure', 0.3, 2.5, 0.01);
  p.add(postParams, 'nightWash', 0, 1, 0.01).name('indigo night wash');
  p.add(postParams, 'boilFps', 0, 12, 1).name('line boil (fps)');
  p.addColor(postParams, 'paperColor').name('paper');
  p.addColor(postParams, 'inkColor').name('ink');

  const l = gui.addFolder('Light & shadow');
  l.add(shadowParams, 'enabled').name('shadows');
  l.add(U.uShadowStrength, 'value', 0, 1, 0.01).name('shadow strength');
  l.add(shadowParams, 'extent', 60, 400, 1).name('shadow reach (m)');
  l.add(shadowParams, 'size', [1024, 2048, 4096]).name('shadow map');
  l.add(debugParams, 'lightScale', 0.3, 2, 0.01).name('light scale');

  const wa = gui.addFolder('Water');
  wa.add(waterParams.uWaveScale, 'value', 0, 3, 0.01).name('waves');
  wa.add(waterParams.uSurf, 'value', 0, 2, 0.01).name('surf');
  wa.add(waterParams.uGlitter, 'value', 0, 3, 0.01).name('glitter');

  const m = gui.addFolder('Walk');
  m.add(walkParams, 'speed', 0.5, 6, 0.1).name('stroll speed');
  m.add(walkParams, 'runSpeed', 2, 20, 0.1).name('shift speed');
  m.add(walkParams, 'fov', 35, 100, 1).name('field of view');
  m.add(walkParams, 'bob', 0, 2, 0.01).name('head bob');
  m.add(walkParams, 'mouseSens', 0.2, 3, 0.01).name(document.body.classList.contains('nomouse') ? 'look sensitivity' : 'mouse sensitivity'); // (a phone's drag to look goes by it too)
  m.add(walkParams, 'flySpeed', 3, 400, 1).name('fly speed');
  m.add(walkParams, 'fly').name('fly (debug)').listen();
  m.add({ respawn: hooks.onRespawn }, 'respawn').name(`back to ${region.respawn ?? 'the start'}`);

  const d = gui.addFolder('Debug');
  d.add(debugParams, 'rawScene').name('show raw render');
  d.add(debugParams, 'showStats').name('show stats (fps, draws, counts)');
  d.add(debugParams, 'summons').name('free rides: V car, ⇧B boat, N plane');
  d.add({ car: () => hooks.onSummon('car') }, 'car').name('summon a car');
  d.add({ boat: () => hooks.onSummon('boat') }, 'boat').name('summon a boat');
  d.add({ plane: () => hooks.onSummon('plane') }, 'plane').name('summon a plane');
  d.add({ reset: hooks.onResetExplore }, 'reset').name('reset explored map');
  d.add({ clear: () => { localStorage.removeItem(STORE); location.reload(); } }, 'clear').name('reset all settings');
  d.close();
  l.close();
  wa.close();
  m.close();
  // the game ships tuned: the panel is a developer tool, hidden until ` (backquote) opens it
  gui.hide();
  window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') gui._hidden ? gui.show() : gui.hide(); });
  const mobileOptions = document.getElementById('toptions');
  const mobileClose = document.createElement('button');
  mobileClose.className = 'mobile-panel-close';
  mobileClose.textContent = '× Close';
  mobileClose.type = 'button';
  mobileClose.setAttribute('aria-label', 'close options and developer tools');
  mobileClose.onclick = () => { gui.hide(); mobileOptions?.setAttribute('aria-expanded', 'false'); };
  gui.domElement.appendChild(mobileClose);
  mobileOptions?.addEventListener('click', () => {
    if (gui._hidden) gui.show(); else gui.hide();
    mobileOptions.setAttribute('aria-expanded', String(!gui._hidden));
  });
  return gui;
}
