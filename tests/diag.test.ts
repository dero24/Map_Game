import { describe, it, expect } from 'vitest';
import { browserName, clean, crashFrom, errorLine, formatReport, type DiagState } from '../src/ui/diag';

const UA = {
  pixel: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  crios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  samsung: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
};

const base = (): DiagState => ({
  stage: 'walking', t0: 0, ua: UA.pixel, screen: '412×915 @2.63x · view 412×839', memGB: 8, cores: 8,
  tier: 'phone', tierWhy: 'touch screen',
  gl: {
    version: 2, renderer: 'ANGLE (ARM, Mali-G710, OpenGL ES 3.2)', vendor: 'Google Inc. (ARM)',
    limits: { MAX_TEXTURE_SIZE: 8192, MAX_RENDERBUFFER_SIZE: 8192, MAX_VERTEX_UNIFORM_VECTORS: 256, MAX_FRAGMENT_UNIFORM_VECTORS: 224, MAX_VARYING_VECTORS: 15, MAX_TEXTURE_IMAGE_UNITS: 16, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16, MAX_VERTEX_ATTRIBS: 16 },
    ext: { EXT_color_buffer_float: true, EXT_color_buffer_half_float: true, OES_texture_float_linear: false },
  },
  errors: [], shaderErrors: [], frames: 0, frameErrors: 0, frameErrorStreak: 0, lost: 0, began: 2000, framesAtBegin: 0,
});

describe('browserName', () => {
  it('names the browser and OS from the user agent', () => {
    expect(browserName(UA.pixel)).toBe('Chrome 140 · Android 14');
    expect(browserName(UA.iphone)).toBe('Safari 17.4 · iOS 17.4');
    expect(browserName(UA.crios)).toBe('Chrome 140 · iOS 16.6');
    expect(browserName(UA.samsung)).toBe('Samsung Internet 25 · Android 13');
    expect(browserName(UA.firefox)).toBe('Firefox 131 · Android 14');
    expect(browserName(UA.instagram)).toBe('WebKit (in-app browser?) · iOS 17.2');
    expect(browserName(UA.win)).toBe('Edge 140 · Windows');
  });
});

describe('formatReport', () => {
  it('says what failed, where the boot got to, and the GPU facts', () => {
    const r = formatReport(base(), 'no frame has rendered in the 15 s since Begin walking', 17000);
    expect(r).toContain("couldn't show the world");
    expect(r).toContain('no frame has rendered in the 15 s since Begin walking');
    expect(r).toContain('walking · 17.0 s after load · 15.0 s since Begin walking');
    expect(r).toContain('0 drawn');
    expect(r).toContain('quality   phone (touch screen)');
    expect(r).toContain('Chrome 140 · Android 14');
    expect(r).toContain('2 · ANGLE (ARM, Mali-G710, OpenGL ES 3.2)');
    expect(r).toContain('tex 8192');
    expect(r).toContain('vU 256 · fU 224');
    expect(r).toContain('vary 15 · tex units 16/16');
    expect(r).toContain('float_linear NO');
    expect(r.includes('shader error')).toBe(false);
    expect(r.includes('errors (')).toBe(false);
    for (const line of r.split('\n').slice(0, -1)) expect(line.length).toBeLessThan(200);
  });
  it('carries the first shader log and the first errors, capped', () => {
    const s = base();
    s.shaderErrors.push('fragment: ERROR: 0:412: too many uniforms\n>412: uniform vec4 uLamps[64];', 'second');
    for (let i = 0; i < 12; i++) s.errors.push(`TypeError: e${i} is null @index.js:${i}`);
    s.frameErrors = 40;
    s.lost = 1;
    const r = formatReport(s, 'a shader failed to compile on this GPU', 5000);
    expect(r).toContain('shader error:');
    expect(r).toContain('ERROR: 0:412: too many uniforms');
    expect(r).toContain('>412: uniform vec4 uLamps[64];');
    expect(r.includes('second')).toBe(false);
    expect(r).toContain('errors (first 8 of 12)');
    expect(r).toContain('8. TypeError: e7 is null');
    expect(r.includes('e8 is null')).toBe(false);
    expect(r).toContain('40 failed');
    expect(r).toContain('GPU context lost ×1');
  });
  it('reports a WebGL that never started, and a previous crash', () => {
    const s = base();
    s.gl = null;
    s.glError = 'Error creating WebGL context. — webgl2 unavailable, webgl1 available';
    s.crashed = { stage: 'tiles', tier: 'desktop', ageS: 12.4, n: 2 };
    s.began = undefined;
    const r = formatReport(s, 'WebGL 2 could not start in this browser', 3000);
    expect(r).toContain('WebGL     Error creating WebGL context. — webgl2 unavailable, webgl1 available');
    expect(r).toContain('stopped at "tiles" (desktop) 12 s ago');
    expect(r).toContain('(×2)');
    expect(r.includes('since Begin walking')).toBe(false);
  });
});

describe('formatReport on request', () => {
  it('reads as diagnostics, not a failure', () => {
    const r = formatReport({ ...base(), frames: 40, stage: 'running' }, 'on request (?diag=1)', 30000, false);
    expect(r.split('\n')[0]).toBe('the watercolor walk — diagnostics:');
    expect(r.includes("couldn't")).toBe(false);
    expect(r).toContain('40 drawn');
  });
});

describe('crashFrom', () => {
  const now = 1_700_000_000_000;
  it('reads a load that died on screen as a crash', () => {
    expect(crashFrom({ stage: 'tiles', tier: 'phone', t: now - 8000, clean: false, n: 0 }, now)).toEqual({ stage: 'tiles', tier: 'phone', ageS: 8, n: 1 });
    expect(crashFrom({ stage: 'running', tier: 'phone', t: now - 1000, clean: false, n: 2 }, now)?.n).toBe(3);
  });
  it('ignores clean exits, missing and stale records', () => {
    expect(crashFrom(null, now)).toBeNull();
    expect(crashFrom({ stage: 'running', tier: 'phone', t: now - 1000, clean: true, n: 0 }, now)).toBeNull();
    expect(crashFrom({ stage: 'tiles', tier: 'phone', t: now - 3 * 3600e3, clean: false, n: 0 }, now)).toBeNull();
    expect(crashFrom({ stage: 'tiles', tier: 'phone', t: now + 60e3, clean: false, n: 0 }, now)).toBeNull();
  });
});

describe('clean', () => {
  it('drops the control characters driver logs end with', () => {
    expect(clean('ERROR: 0:114: x\u0000\n\tnext\u001b')).toBe('ERROR: 0:114: x\n\tnext'); // (tabs and newlines stay)
  });
});

describe('errorLine', () => {
  it('flattens errors, events and odd rejection reasons', () => {
    expect(errorLine(new TypeError('x is null'), { filename: 'https://h/Map_Game/assets/index-3f2a.js', lineno: 12, colno: 5 })).toBe('TypeError: x is null @index-3f2a.js:12:5');
    expect(errorLine('plain string')).toBe('plain string');
    expect(errorLine(null)).toBe('null');
    const e = new Error('boom');
    e.stack = 'Error: boom\n    at f (https://h/Map_Game/assets/index-3f2a.js:40:7)';
    expect(errorLine(e)).toBe('boom @index-3f2a.js:40:7');
  });
});
