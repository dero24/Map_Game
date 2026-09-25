// Synthesized soundscape (no audio files): surf that swells as you near the Atlantic, wind, gull calls,
// passing cars, footsteps that know sand from pavement from boards (and creaky stairs), a distant bell buoy,
// night crickets, the hush and clock of a house, doors, church bells on the hour, dogs, porch wind chimes.
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
    const brown = noiseBuffer(ctx, 6, 'brown'), pink = noiseBuffer(ctx, 6, 'pink');
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

  resume() { void this.ctx.resume(); }

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
    const near = (Math.exp(-f.oceanDist / 160) * 0.85 + 0.12) * muffle;
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
      if (f.night < 0.8 || Math.random() < 0.1) this.gull(L.gullsNear > 0 ? L.gullPan : Math.random() * 2 - 1, vol);
    }

    // Distant bell buoy off the beach
    this.bellTimer -= f.dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = 5 + Math.random() * 9;
      this.bell(0.025 * (0.3 + near));
    }

    // Crickets at night, away from the surf
    set(this.cricketGain.gain, muffle * f.night * 0.022 * Math.min(1, f.oceanDist / 120) * (f.surface === 'sand' ? 0.3 : 1), 1.5);

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
