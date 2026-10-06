// Synthesized soundscape (no audio files): surf that swells as you near the Atlantic, wind, gull calls,
// passing cars, footsteps that know sand from pavement from boards (and creaky stairs), a distant bell buoy,
// night crickets, the hush and clock of a house, doors, church bells on the hour, dogs, porch wind chimes,
// halyards ringing on moored sailboats and water lapping the pilings, leaves in the wind, birdsong by day,
// engines for whatever you ride (car / outboard / propeller), and the brush + paper sounds of the sketchbook.
// Places sound like themselves: the city's roar, crowds, horns, sirens and pigeons grow with the built
// volume around you; the desert has cicadas on summer days and mourning doves at dawn; the sea stays by the sea.
import type { LifeStats } from '../sim/life';

export const audioParams = { volume: 0.7, muted: false };

export interface AudioFrame {
  dt: number;
  oceanDist: number; // m to the Atlantic
  riverDist: number; // m to any water
  indoors: boolean; // walls muffle the outside world
  wind: number;
  night: number;
  surface: 'sand' | 'paved' | 'wood' | 'grass' | 'stairs';
  stepped: boolean;
  running: boolean;
  life: LifeStats;
  hour: number; // local clock
  churchDist: number; // m to the nearest church (bells on the hour)
  houses: number; // houses within ~80 m (dogs, wind chimes on porches)
  harbour?: number; // m to the nearest moored boat
  sails?: number; // moored sailboats within ~80 m (halyards)
  trees?: number; // 0..1 tree cover around you (leaves, birds)
  ride?: { kind: 'car' | 'boat' | 'plane' | 'balloon'; v: number; throttle: number; airborne: boolean } | null;
  city?: number; // 0..1 how built-up the blocks around you are (stream.cityGrid): traffic roar, horns, sirens, crowds
  climate?: string; // styles.ts climate: the desert's cicadas and doves
  summer?: boolean; // the warm months where you are (hemisphere-aware)
  cicadas?: number; // 0..1 the annual cicadas on the bark about you (sim/critters.ts chorus): their buzzing chorus
}

function noiseBuffer(ctx: AudioContext, seconds: number, color: 'white' | 'pink' | 'brown') {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    let seed = 12345 + ch * 777;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let i = 0; i < n; i++) {
      const w = rnd();
      if (color === 'white') d[i] = w;
      else if (color === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
  }
  return buf;
}

export class Ambience {
  private ctx: AudioContext;
  private master: GainNode;
  private surfGain: GainNode;
  private surfFilter: BiquadFilterNode;
  private hissGain: GainNode;
  private windGain: GainNode;
  private windFilter: BiquadFilterNode;
  private carGain: GainNode;
  private carPan: StereoPannerNode;
  private carFilter: BiquadFilterNode;
  private cricketGain: GainNode;
  private roomGain: GainNode;
  private white: AudioBuffer;
  private t = 0;
  private gullTimer = 2;
  private bellTimer = 5;
  private tickTimer = 0;
  private tickOn = false;
  private wasIndoors = false;
  private lastHour = -1;
  private strikes = 0;
  private strikeTimer = 0;
  private strikeVol = 0;
  private dogTimer = 20;
  private chimeTimer = 6;
  private halyardT = 3;
  private lapT = 1;
  private birdT = 4;
  private leafGain!: GainNode;
  // the city: a traffic roar that fills the street canyon, a crowd murmur, horns, sirens, pigeons
  private roarGain!: GainNode;
  private crowdGain!: GainNode;
  private hornT = 6;
  private sirenT = 40;
  private pigeonT = 8;
  // the desert: cicadas on summer days, mourning doves in the morning
  private cicadaGain!: GainNode;
  private doveT = 6;
  private engine!: { g: GainNode; lp: BiquadFilterNode; o1: OscillatorNode; o2: OscillatorNode; am: GainNode; lfo: OscillatorNode; rush: GainNode };
  private pink!: AudioBuffer;

  constructor() {
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(0, Math.random() * buf.duration);
      return s;
    };
    const brown = noiseBuffer(ctx, 6, 'brown'), pink = (this.pink = noiseBuffer(ctx, 6, 'pink'));
    this.white = noiseBuffer(ctx, 2, 'white');

    // Surf: low roar + foamy hiss, both breathing with the swell.
    this.surfFilter = ctx.createBiquadFilter();
    this.surfFilter.type = 'lowpass';
    this.surfFilter.frequency.value = 500;
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0;
    loop(brown).connect(this.surfFilter).connect(this.surfGain).connect(this.master);
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 2400;
    hf.Q.value = 0.4;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    loop(pink).connect(hf).connect(this.hissGain).connect(this.master);

    // Wind
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    loop(pink).connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Passing traffic: filtered noise panned toward the nearest car.
    this.carFilter = ctx.createBiquadFilter();
    this.carFilter.type = 'lowpass';
    this.carFilter.frequency.value = 700;
    this.carGain = ctx.createGain();
    this.carGain.gain.value = 0;
    this.carPan = ctx.createStereoPanner();
    loop(pink).connect(this.carFilter).connect(this.carGain).connect(this.carPan).connect(this.master);

    // Crickets / katydids: a few pulsing high tones.
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    this.cricketGain.connect(this.master);
    for (const [f, rate, p] of [[4300, 13, -0.6], [4700, 17, 0.5], [3900, 9.5, 0.1]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const am = ctx.createGain();
      am.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      const slow = ctx.createOscillator();
      slow.frequency.value = 0.3 + Math.random() * 0.3;
      const sg = ctx.createGain();
      sg.gain.value = 0.5;
      slow.connect(sg).connect(am.gain);
      const pn = ctx.createStereoPanner();
      pn.pan.value = p;
      o.connect(am).connect(pn).connect(this.cricketGain);
      o.start(); lfo.start(); slow.start();
    }

    // Indoors: the hush of a house — a low room tone (fridge, the sea through the walls).
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 180;
    loop(brown).connect(rf).connect(this.roomGain).connect(this.master);
    const hum = ctx.createOscillator();
    hum.frequency.value = 60;
    const hg = ctx.createGain();
    hg.gain.value = 0.05;
    hum.connect(hg).connect(this.roomGain);
    hum.start();

    // Leaves: a high, airy rustle that gusts with the wind where there are trees.
    const lf = ctx.createBiquadFilter();
    lf.type = 'highpass';
    lf.frequency.value = 2600;
    this.leafGain = ctx.createGain();
    this.leafGain.gain.value = 0;
    loop(pink).connect(lf).connect(this.leafGain).connect(this.master);

    // City roar: tyres and engines off the walls — a low rumble plus a mid band, never silent
    // among towers. Crowd: babble-band noise breathing on a slow random swell.
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    const rl = ctx.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 280;
    loop(brown).connect(rl).connect(this.roarGain);
    const rm = ctx.createBiquadFilter();
    rm.type = 'bandpass';
    rm.frequency.value = 750;
    rm.Q.value = 0.6;
    const rmg = ctx.createGain();
    rmg.gain.value = 0.35;
    loop(pink).connect(rm).connect(rmg).connect(this.roarGain);
    this.roarGain.connect(this.master);
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    const cb = ctx.createBiquadFilter();
    cb.type = 'bandpass';
    cb.frequency.value = 950;
    cb.Q.value = 1.3;
    const cam = ctx.createGain();
    cam.gain.value = 0.7;
    const clfo = ctx.createOscillator();
    clfo.frequency.value = 3.1;
    const clg = ctx.createGain();
    clg.gain.value = 0.3;
    clfo.connect(clg).connect(cam.gain);
    clfo.start();
    loop(pink).connect(cb).connect(cam).connect(this.crowdGain).connect(this.master);
    // Cicadas: a bright noise band chopped ~180 times a second, swelling and fading in waves
    this.cicadaGain = ctx.createGain();
    this.cicadaGain.gain.value = 0;
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 5400;
    cf.Q.value = 2.5;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const co = ctx.createOscillator();
    co.type = 'square';
    co.frequency.value = 182;
    const cg = ctx.createGain();
    cg.gain.value = 0.5;
    co.connect(cg).connect(chop.gain);
    const swellO = ctx.createOscillator();
    swellO.frequency.value = 0.09;
    const swellG = ctx.createGain();
    swellG.gain.value = 0.4;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    swellO.connect(swellG).connect(swell.gain);
    co.start(); swellO.start();
    loop(pink).connect(cf).connect(chop).connect(swell).connect(this.cicadaGain).connect(this.master);

    // Engine: two detuned oscillators through a lowpass, a tremolo for the propeller's chop,
    // and a wind rush that grows with speed. Silent until you ride something.
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const am = ctx.createGain();
    am.gain.value = 1;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o1.connect(lp); o2.connect(lp);
    lp.connect(am).connect(g).connect(this.master);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0;
    lfo.connect(lfoG).connect(am.gain);
    o1.start(); o2.start(); lfo.start();
    const rush = ctx.createGain();
    rush.gain.value = 0;
    const rf2 = ctx.createBiquadFilter();
    rf2.type = 'bandpass';
    rf2.frequency.value = 900;
    rf2.Q.value = 0.5;
    loop(pink).connect(rf2).connect(rush).connect(this.master);
    this.engine = { g, lp, o1, o2, am: lfoG, lfo, rush };
  }

  // ---- sketchbook + UI sounds ----
  /** brush: a soft wet stroke · shutter: a longer stroke + paper · chime: two soft bells · page: paper · thud: a body against a bumper · settle: a hull settling into the water. */
  ui(kind: 'brush' | 'shutter' | 'chime' | 'page' | 'thud' | 'settle') {
    const ctx = this.ctx, t = ctx.currentTime;
    const stroke = (dur: number, f0: number, f1: number, vol: number, delay = 0) => {
      const s = ctx.createBufferSource();
      s.buffer = this.pink;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(f0, t + delay);
      bp.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(vol, t + delay + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.3, t + delay);
      p.pan.linearRampToValueAtTime(0.3, t + delay + dur);
      s.connect(bp).connect(g).connect(p).connect(this.master);
      s.start(t + delay, Math.random() * 4);
      s.stop(t + delay + dur + 0.05);
    };
    if (kind === 'brush') stroke(0.55, 700, 2200, 0.035);
    else if (kind === 'shutter') { stroke(0.7, 500, 2600, 0.07); stroke(0.35, 3000, 1500, 0.03, 0.55); this.blip({ freq: 160, q: 1, dur: 0.2, gain: 0.05, type: 'lowpass' }); }
    else if (kind === 'thud') {
      // a soft bump and an "oof" (a falling voiced formant) — slapstick, not a crash
      this.blip({ freq: 110, q: 0.9, dur: 0.22, gain: 0.14, type: 'lowpass' });
      setTimeout(() => { this.blip({ freq: 420, q: 5, dur: 0.2, gain: 0.05 }); this.blip({ freq: 820, q: 6, dur: 0.16, gain: 0.025 }); }, 70);
    }
    else if (kind === 'settle') { this.lap(0.16); stroke(0.6, 420, 160, 0.05); this.blip({ freq: 140, q: 1.2, dur: 0.3, gain: 0.06, type: 'lowpass' }); }
    else if (kind === 'page') { this.blip({ freq: 4200, q: 0.6, dur: 0.12, gain: 0.03 }); this.blip({ freq: 2600, q: 0.8, dur: 0.18, gain: 0.02 }); }
    else if (kind === 'chime') {
      for (const [f, d] of [[784, 0], [1175, 0.16]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + d);
        g.gain.linearRampToValueAtTime(0.035, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.6);
        o.connect(g).connect(this.master);
        o.start(t + d);
        o.stop(t + d + 1.7);
      }
    }
  }

  /** Wildlife: a squirrel's scolding chatter, a flush of wings, a deer's snort. */
  critter(kind: string, what: 'flee' | 'flush', pan: number, dist: number) {
    const vol = Math.min(1, 12 / (dist + 4));
    if (kind === 'splash') {
      // something going into the water: a soft low slap and its spray
      this.blip({ freq: 520, q: 0.7, dur: 0.22, gain: 0.05 * vol, pan, type: 'lowpass' });
      setTimeout(() => this.blip({ freq: 1800, q: 0.6, dur: 0.12, gain: 0.018 * vol, pan }), 40);
    } else if (kind === 'squirrel') {
      for (let k = 0; k < 6; k++) setTimeout(() => this.blip({ freq: 3200 + Math.random() * 900, q: 7, dur: 0.035, gain: 0.03 * vol, pan }), k * 70);
    } else if (what === 'flush') {
      // a whirr of wings: a few fast noise bursts
      for (let k = 0; k < 5; k++) setTimeout(() => this.blip({ freq: 900 + Math.random() * 500, q: 0.8, dur: 0.06, gain: 0.04 * vol, pan }), k * 45);
      if (kind === 'songbird') setTimeout(() => this.bird(0.02 * vol), 180);
    } else if (kind === 'deer') this.blip({ freq: 500, q: 1.2, dur: 0.25, gain: 0.05 * vol, pan, type: 'lowpass' });
  }

  // A halyard slapping a mast: a bright metallic ping (inharmonic partials, fast decay).
  private halyard(vol: number, pan: number) {
    const ctx = this.ctx, t = ctx.currentTime;
    const base = 1800 + Math.random() * 900;
    for (const [m, a, d] of [[1, 1, 0.5], [2.41, 0.5, 0.3], [3.93, 0.3, 0.18]]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * a, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.master);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }
  // Water lapping at pilings and hulls: a soft low slosh with a quick in and slow out.
  private lap(vol: number) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.pink;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500 + Math.random() * 400, t);
    lp.frequency.linearRampToValueAtTime(250, t + 0.6);
    const g = ctx.createGain();
    const d = 0.35 + Math.random() * 0.4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.2 - 0.6;
    s.connect(lp).connect(g).connect(p).connect(this.master);
    s.start(t, Math.random() * 5);
    s.stop(t + d + 0.05);
  }
  // A songbird phrase: a few quick whistled notes with little upward flicks.
  private bird(vol: number) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const pan = Math.random() * 1.6 - 0.8;
    const n = 3 + Math.floor(Math.random() * 5);
    const base = 2200 + Math.random() * 1600;
    const style = Math.random();
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.09 + Math.random() * 0.08);
      const f = base * (style < 0.5 ? 1 + ((k % 3) - 1) * 0.12 : 1.25 - k * 0.05);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 0.85, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.master);
      o.start(t);
      o.stop(t + 0.11);
    }
  }

  // A door opening / closing: latch click + a soft wooden thump + a short creak.
  private door() {
    const ctx = this.ctx, t = ctx.currentTime;
    this.blip({ freq: 2400, q: 6, dur: 0.05, gain: 0.08 });
    this.blip({ freq: 140, q: 1.2, dur: 0.25, gain: 0.18, type: 'lowpass' });
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(310, t + 0.05);
    o.frequency.linearRampToValueAtTime(240 + Math.random() * 60, t + 0.45);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + 0.05);
    g.gain.linearRampToValueAtTime(0.025, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(bp).connect(g).connect(this.master);
    o.start(t + 0.05);
    o.stop(t + 0.55);
  }

  // A wooden stair tread: a thump and, now and then, a creak.
  private creak() {
    const ctx = this.ctx, t = ctx.currentTime;
    this.blip({ freq: 180, q: 3, dur: 0.14, gain: 0.2 });
    if (Math.random() > 0.35) return;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f = 420 + Math.random() * 300;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.2), t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.36);
  }

  // Church bell: one strike of a large bell (partials of a minor-third bell).
  private strike(vol: number) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, a, d] of [[220, 1, 5], [264, 0.5, 4], [330, 0.35, 3.5], [440, 0.3, 3], [587, 0.15, 2]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * a, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + d + 0.1);
    }
  }

  // A dog somewhere down the block: two or three short barks.
  private dog(pan: number, vol: number) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.28 + Math.random() * 0.12);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 330 + Math.random() * 120;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(bp).connect(g).connect(p).connect(this.master);
      o.start(t);
      o.stop(t + 0.16);
    }
  }

  // Wind chimes on a porch: a few pentatonic tubes knocked by the breeze.
  private chimes(vol: number) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const notes = [1047, 1175, 1319, 1568, 1760, 2093];
    const n = 2 + Math.floor(Math.random() * 4);
    const pan = Math.random() * 1.6 - 0.8;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.15 + Math.random() * 0.35);
      const f = notes[Math.floor(Math.random() * notes.length)];
      for (const [m, a] of [[1, 1], [2.76, 0.3]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * m;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * a, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        o.connect(g).connect(p).connect(this.master);
        o.start(t);
        o.stop(t + 2.3);
      }
    }
  }

  // A car horn down the block: one or two blasts of a two-tone horn, softened by distance.
  private horn(vol: number, pan: number) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = Math.random() < 0.6 ? 1 : 2, base = 390 + Math.random() * 80;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.3 + Math.random() * 0.15), d = 0.18 + Math.random() * (k ? 0.2 : 0.45);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400 + Math.random() * 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + d);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      for (const m of [1, 1.26]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = base * m;
        o.connect(lp);
        o.start(t);
        o.stop(t + d + 0.08);
      }
      lp.connect(g).connect(p).connect(this.master);
    }
  }
  // A siren passing a few blocks over: the American wail, rising as it nears and fading away.
  private siren(vol: number) {
    const ctx = this.ctx, t = ctx.currentTime, dur = 7 + Math.random() * 4;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    for (let k = 0; k * 1.6 < dur; k++) {
      o.frequency.setValueAtTime(680, t + k * 1.6);
      o.frequency.linearRampToValueAtTime(1350, t + k * 1.6 + 0.8);
      o.frequency.linearRampToValueAtTime(680, t + k * 1.6 + 1.6);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.random() < 0.5 ? -0.7 : 0.7, t);
    p.pan.linearRampToValueAtTime(-p.pan.value, t + dur);
    o.connect(lp).connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  // Soft low cooing: a pigeon on a ledge (fast warble) or a mourning dove at dawn (slow, falling).
  private coo(vol: number, dove: boolean) {
    const ctx = this.ctx, t0 = ctx.currentTime, pan = Math.random() * 1.4 - 0.7;
    const notes = dove ? [[0, 0.35, 470, 520], [0.45, 0.6, 560, 470], [1.2, 0.45, 460, 430], [1.75, 0.45, 450, 420]] : [[0, 0.45, 330, 290], [0.55, 0.3, 310, 280]];
    for (const [dt, d, f0, f1] of notes) {
      const t = t0 + dt;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f1, t + d);
      const vib = ctx.createOscillator();
      vib.frequency.value = dove ? 6 : 24;
      const vg = ctx.createGain();
      vg.gain.value = dove ? 6 : 18;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + d * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.master);
      o.start(t); vib.start(t);
      o.stop(t + d + 0.05); vib.stop(t + d + 0.05);
    }
  }

  resume() { this.ctx.resume().catch(() => { /* not allowed yet (an iPhone after a call or the lock screen): the next tap asks again */ }); }
  /** Silence while the page sleeps (a phone locked, the app switched away): the whole graph pauses where it is. */
  suspend() { this.ctx.suspend().catch(() => { /* already closed */ }); }
  /** Sounding now: false while suspended, or interrupted by the system (iOS). */
  get running() { return this.ctx.state === 'running'; }

  private blip(opts: { freq: number; q: number; dur: number; gain: number; pan?: number; type?: BiquadFilterType }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + opts.dur + 0.05);
  }

  private gull(pan: number, vol: number) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const calls = 1 + Math.floor(Math.random() * 4);
    for (let k = 0; k < calls; k++) {
      const t = t0 + k * (0.22 + Math.random() * 0.08);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 1100 + Math.random() * 350;
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      o.connect(bp).connect(g).connect(p).connect(this.master);
      o.start(t);
      o.stop(t + 0.3);
    }
  }

  private bell(vol: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [f, a] of [[880, 1], [1328, 0.5], [2094, 0.3], [2860, 0.15]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * a, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      const p = ctx.createStereoPanner();
      p.pan.value = 0.6;
      o.connect(g).connect(p).connect(this.master);
      o.start(t);
      o.stop(t + 3.6);
    }
  }

  update(f: AudioFrame) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (!isFinite(f.dt)) return;
    this.t += f.dt;
    // non-finite automation values throw — never let one bad number stop the frame loop
    const set = (p: AudioParam, v: number, tc = 0.3) => { if (isFinite(v)) p.setTargetAtTime(v, now, tc); };
    set(this.master.gain, audioParams.muted ? 0 : audioParams.volume, 0.2);

    // Surf: sets of waves ~9 s apart, with a crash transient on each.
    const muffle = f.indoors ? 0.3 : 1;
    const near = (Math.exp(-f.oceanDist / 160) * 0.85 + 0.12 * Math.exp(-f.oceanDist / 2500)) * muffle; // inland, no sea at all
    const swell = Math.pow(Math.max(0, Math.sin(this.t * 0.7)), 3) * 0.7 + Math.pow(Math.max(0, Math.sin(this.t * 0.7 + 2.2)), 4) * 0.4;
    set(this.surfGain.gain, near * (0.32 + 0.4 * swell), 0.25);
    set(this.surfFilter.frequency, 380 + 700 * swell * near, 0.3);
    set(this.hissGain.gain, near * near * 0.16 * swell, 0.2);

    // Wind
    set(this.windGain.gain, (0.03 + f.wind * 0.12) * muffle * muffle, 1.0);
    set(this.windFilter.frequency, 380 + 500 * f.wind + 250 * Math.sin(this.t * 0.37), 1.2);

    // Cars
    const L = f.life;
    const cv = L.nearestCar < 200 ? Math.min(0.45, (L.carSpeed / 12) * 18 / (L.nearestCar * L.nearestCar * 0.08 + 18)) : 0;
    set(this.carGain.gain, cv * muffle, 0.15);
    set(this.carPan.pan, Math.max(-1, Math.min(1, L.carPan)), 0.15);
    set(this.carFilter.frequency, 400 + 900 * Math.min(1, cv * 3), 0.2);

    // Gulls: more calls the more gulls are wheeling nearby
    this.gullTimer -= f.dt;
    if (this.gullTimer <= 0) {
      const busy = Math.min(1, L.gullsNear / 12);
      this.gullTimer = (1 - f.night * 0.8) > 0.3 ? 1.5 + Math.random() * (9 - busy * 7) : 20 + Math.random() * 30;
      const vol = L.gullsNear > 0 ? 0.12 * Math.min(1, 25 / (L.gullDist + 5)) + 0.02 : 0.02 * near;
      if ((f.night < 0.8 || Math.random() < 0.1) && (L.gullsNear > 0 || f.oceanDist < 4000)) this.gull(L.gullsNear > 0 ? L.gullPan : Math.random() * 2 - 1, vol);
    }

    // Distant bell buoy off the beach
    this.bellTimer -= f.dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = 5 + Math.random() * 9;
      if (f.oceanDist < 3000) this.bell(0.025 * (0.3 + near));
    }

    // Crickets at night, away from the surf (and the city)
    const city = Math.max(0, Math.min(1, f.city ?? 0)), day = 1 - f.night;
    set(this.cricketGain.gain, muffle * f.night * 0.022 * Math.min(1, f.oceanDist / 120) * (f.surface === 'sand' ? 0.3 : 1) * (1 - city * 0.85), 1.5);

    // The city: the roar never stops among towers (quieter after midnight), a crowd where people
    // are, horns now and then, a siren every few minutes, pigeons on the ledges by day
    const late = f.hour >= 1 && f.hour < 5 ? 0.45 : 1;
    set(this.roarGain.gain, city * 0.1 * late * (f.indoors ? 0.35 : 1) * (0.8 + 0.2 * Math.sin(this.t * 0.23)), 0.8);
    set(this.crowdGain.gain, city * Math.min(1, L.pedsNear / 18) * 0.045 * (0.3 + 0.7 * day) * muffle, 0.8);
    if ((this.hornT -= f.dt) <= 0) {
      this.hornT = 2.5 + Math.random() * 14 / Math.max(0.25, city);
      if (city > 0.2 && late === 1 && !f.indoors) this.horn(0.012 + 0.018 * city * Math.random(), Math.random() * 1.6 - 0.8);
    }
    if ((this.sirenT -= f.dt) <= 0) {
      this.sirenT = 70 + Math.random() * 170;
      if (city > 0.45) this.siren(0.014 * city * muffle);
    }
    if ((this.pigeonT -= f.dt) <= 0) {
      this.pigeonT = 6 + Math.random() * 16;
      if (city > 0.25 && day > 0.6 && !f.indoors) this.coo(0.012, false);
    }
    // The desert: cicadas through the heat of a summer day; mourning doves at dawn. Elsewhere the annual
    // cicadas' chorus wherever they're on the bark about you (the East's dog days, the Plains', Texas's)
    const desert = f.climate === 'arid';
    const heat = f.hour > 9 && f.hour < 19.5 ? 1 : 0;
    set(this.cicadaGain.gain, Math.max(desert && f.summer ? heat * day * 0.014 : 0, (f.cicadas ?? 0) * day * 0.016) * muffle * (1 - city * 0.7), 2.5);
    if ((this.doveT -= f.dt) <= 0) {
      this.doveT = 7 + Math.random() * 18;
      const dawn = f.hour > 5 && f.hour < 10;
      if ((desert || f.climate === 'mediterranean') && dawn && !f.indoors && city < 0.6) this.coo(0.014, true);
    }

    // Indoors: room tone and a ticking clock; a door sound as you cross the threshold
    set(this.roomGain.gain, f.indoors ? 0.05 : 0, 0.6);
    if (f.indoors !== this.wasIndoors) { this.door(); this.wasIndoors = f.indoors; }
    if (f.indoors && (this.tickTimer -= f.dt) <= 0) {
      this.tickTimer = 1;
      this.tickOn = !this.tickOn;
      this.blip({ freq: this.tickOn ? 3200 : 2700, q: 9, dur: 0.03, gain: 0.018 });
    }

    // Church bells ring the hour when there's a church within earshot
    const hh = Math.floor(f.hour);
    if (this.lastHour >= 0 && hh !== this.lastHour && f.churchDist < 900) {
      this.strikes = ((hh + 11) % 12) + 1;
      this.strikeTimer = 0;
      this.strikeVol = 0.09 * Math.min(1, 160 / (f.churchDist + 60)) * (f.indoors ? 0.4 : 1);
    }
    this.lastHour = hh;
    if (this.strikes > 0 && (this.strikeTimer -= f.dt) <= 0) {
      this.strike(this.strikeVol);
      this.strikes--;
      this.strikeTimer = 2.4;
    }

    // Among the houses: a dog now and then by day, wind chimes on the porches when it blows
    if ((this.dogTimer -= f.dt) <= 0) {
      this.dogTimer = 25 + Math.random() * 70;
      if (f.houses > 6 && f.night < 0.7) this.dog(Math.random() * 1.6 - 0.8, 0.025 * muffle);
    }
    if ((this.chimeTimer -= f.dt) <= 0) {
      this.chimeTimer = 5 + Math.random() * (14 - f.wind * 8);
      if (f.houses > 3 && f.oceanDist < 600 && f.wind > 0.3 && !f.indoors) this.chimes(0.012 * Math.min(1.5, f.wind));
    }

    // Harbour: halyards ring on the masts when it blows; water laps the pilings
    const hb = f.harbour ?? 1e9;
    if ((this.halyardT -= f.dt) <= 0) {
      this.halyardT = 0.4 + Math.random() * (3.5 - f.wind * 2.5);
      if ((f.sails ?? 0) > 0 && hb < 110 && f.wind > 0.2) {
        const v = 0.02 * Math.min(1, 40 / (hb + 10)) * Math.min(1.5, f.wind + 0.3) * muffle;
        this.halyard(v, Math.random() * 1.6 - 0.8);
        if (Math.random() < 0.4) setTimeout(() => this.halyard(v * 0.6, Math.random() * 1.6 - 0.8), 120 + Math.random() * 200);
      }
    }
    if ((this.lapT -= f.dt) <= 0) {
      this.lapT = 0.5 + Math.random() * 1.4;
      const edge = Math.min(hb, f.riverDist < 1 ? 0 : 1e9);
      if ((hb < 60 || (f.riverDist <= 0 && f.oceanDist > 250)) && !f.indoors) this.lap(0.05 * Math.min(1, 25 / (edge + 10)) * (0.5 + f.wind));
    }
    // Leaves in the wind; songbirds by day where there are trees and gardens
    const trees = f.trees ?? 0;
    set(this.leafGain.gain, trees * (0.012 + f.wind * 0.03) * (0.6 + 0.4 * Math.sin(this.t * 0.9) * Math.sin(this.t * 0.31)) * muffle, 0.6);
    if ((this.birdT -= f.dt) <= 0) {
      const morning = f.hour > 5 && f.hour < 10 ? 1 : f.hour >= 10 && f.hour < 18 ? 0.35 : 0;
      this.birdT = 2 + Math.random() * (morning > 0.5 ? 5 : 14);
      if (!f.indoors && f.night < 0.3 && morning > 0 && (trees > 0.15 || f.houses > 4) && f.oceanDist > 80 && Math.random() < (morning + 0.2) * (1 - city * 0.7)) this.bird(0.02 * morning * (0.5 + trees));
    }

    // Engine of whatever you're riding
    const e = this.engine, r = f.ride;
    if (r) {
      const sp = Math.abs(r.v);
      if (r.kind === 'car') {
        const gear = 1 + Math.min(4, Math.floor(sp / 9));
        const rpm = 38 + ((sp % 9) / 9) * 40 + gear * 4;
        set(e.o1.frequency, rpm, 0.1); set(e.o2.frequency, rpm * 1.51, 0.1);
        set(e.lp.frequency, 260 + sp * 22, 0.2);
        set(e.g.gain, 0.05 + Math.min(0.06, sp * 0.004), 0.2);
        set(e.am.gain, 0, 0.2);
        set(e.rush.gain, Math.min(0.06, sp * 0.002), 0.3);
      } else if (r.kind === 'boat') {
        const f0 = 70 + r.throttle * 90 + sp * 2;
        set(e.o1.frequency, f0, 0.15); set(e.o2.frequency, f0 * 2.02, 0.15);
        set(e.lp.frequency, 500 + r.throttle * 1400, 0.2);
        set(e.g.gain, 0.025 + r.throttle * 0.05, 0.25);
        set(e.am.gain, 0.2, 0.2); set(e.lfo.frequency, 9 + r.throttle * 12, 0.2);
        set(e.rush.gain, Math.min(0.08, sp * 0.006), 0.3); // hull slap + spray
      } else if (r.kind === 'balloon') {
        // the burner: a roar of gas (the noise band) over a low flutter, only while it burns; the
        // basket is otherwise silent — you drift with the air, so there's no wind in your ears
        const burn = r.throttle;
        set(e.o1.frequency, 48, 0.1); set(e.o2.frequency, 97, 0.1);
        set(e.lp.frequency, 300 + burn * 900, 0.08);
        set(e.g.gain, burn * 0.05, 0.08);
        set(e.am.gain, 0.3 * burn, 0.1); set(e.lfo.frequency, 21, 0.2);
        set(e.rush.gain, burn * 0.16, 0.06);
      } else {
        const f0 = 62 + r.throttle * 55;
        set(e.o1.frequency, f0, 0.3); set(e.o2.frequency, f0 * 1.99, 0.3);
        set(e.lp.frequency, 380 + r.throttle * 700, 0.3);
        set(e.g.gain, 0.03 + r.throttle * 0.06, 0.3);
        set(e.am.gain, 0.45, 0.2); set(e.lfo.frequency, 14 + r.throttle * 30, 0.3); // the propeller's chop
        set(e.rush.gain, Math.min(0.1, sp * 0.0018) * (r.airborne ? 1 : 0.4), 0.4);
      }
    } else { set(e.g.gain, 0, 0.3); set(e.rush.gain, 0, 0.3); }

    // Footsteps
    if (f.stepped) {
      const pan = (Math.random() - 0.5) * 0.3;
      const g = f.running ? 0.16 : 0.1;
      if (f.surface === 'stairs') this.creak();
      else if (f.surface === 'sand') this.blip({ freq: 600, q: 0.7, dur: 0.16, gain: g * 0.9, pan, type: 'lowpass' });
      else if (f.surface === 'wood') this.blip({ freq: 320, q: 5, dur: 0.12, gain: g * 1.6, pan });
      else if (f.surface === 'grass') this.blip({ freq: 1200, q: 0.8, dur: 0.1, gain: g * 0.5, pan });
      else this.blip({ freq: 2600, q: 1.4, dur: 0.07, gain: g, pan });
    }
  }
}
