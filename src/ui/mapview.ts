// The map screen: a hand-drawn sheet of the loaded world. Everything is pencilled in (streets,
// footprints, the water's edge); where you have walked, it is painted — the same explore record
// that colours the 3D world washes the map, so the sheet fills in as your walks do.
// Drag to pan, wheel to zoom, click to pick a spot ("walk here"); pins for sketchbook pages,
// commissions and you.
import type { GameCtx } from './ctx';

export interface Pin { x: number; z: number; kind: 'page' | 'commission' | 'result' | 'stamp' | 'plant'; label: string; id?: string }

const PAPER = '#f1e9d6';
const INK = 'rgba(58,51,70,';

export class MapView {
  cx = 0;
  cz = 0;
  scale = 1.2; // px per metre
  private dirty = true;
  private drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private hatch: CanvasPattern | null = null;
  private color = document.createElement('canvas');
  private mask = document.createElement('canvas');
  pins: () => Pin[] = () => [];
  onPick: ((x: number, z: number, sx: number, sy: number) => void) | null = null;
  onPin: ((p: Pin, sx: number, sy: number) => void) | null = null;
  private lastPins: { p: Pin; sx: number; sy: number }[] = [];

  constructor(private g: GameCtx, private cv: HTMLCanvasElement) {
    // one finger (or the mouse) drags the map; two pinch it, about the point between them — the
    // page itself never zooms (style.css), so on a phone this is the map's only zoom
    const lift = (e: PointerEvent) => {
      this.pts.delete(e.pointerId);
      if (!this.pinch || this.pts.size >= 2) return false;
      this.pinch = null;
      const q = [...this.pts.values()][0]; // (the finger left carries on dragging, never picks)
      this.drag = q ? { x: q.x, y: q.y, cx: this.cx, cz: this.cz, moved: true } : null;
      return true;
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pts.size === 2) return this.startPinch();
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false };
    });
    cv.addEventListener('pointercancel', (e) => { lift(e); if (!this.pts.size) this.drag = null; });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pts.get(e.pointerId);
      if (p) (p.x = e.clientX), (p.y = e.clientY);
      if (this.pinch) return this.movePinch();
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      const k = devicePixelRatio;
      this.cx = this.drag.cx - (dx * k) / this.scale;
      this.cz = this.drag.cz - (dy * k) / this.scale;
      this.invalidate();
    });
    cv.addEventListener('pointerup', (e) => {
      if (lift(e)) return; // (a pinch ending)
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved) return;
      const r = cv.getBoundingClientRect();
      const k = devicePixelRatio, sx = (e.clientX - r.left) * k, sy = (e.clientY - r.top) * k;
      const hit = this.lastPins.find((q) => Math.hypot(q.sx - sx, q.sy - sy) < 14 * k);
      if (hit) this.onPin?.(hit.p, e.clientX - r.left, e.clientY - r.top);
      else this.onPick?.(this.cx + (sx - cv.width / 2) / this.scale, this.cz + (sy - cv.height / 2) / this.scale, e.clientX - r.left, e.clientY - r.top);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const k = devicePixelRatio, sx = (e.clientX - r.left) * k, sy = (e.clientY - r.top) * k;
      const wx = this.cx + (sx - cv.width / 2) / this.scale, wz = this.cz + (sy - cv.height / 2) / this.scale;
      this.scale = Math.max(0.01, Math.min(8, this.scale * (e.deltaY > 0 ? 1 / 1.2 : 1.2)));
      this.cx = wx - (sx - cv.width / 2) / this.scale;
      this.cz = wz - (sy - cv.height / 2) / this.scale;
      this.invalidate();
    }, { passive: false });
  }

  private pts = new Map<number, { x: number; y: number }>(); // the pointers down on the map
  private pinch: { d: number; scale: number; wx: number; wz: number } | null = null;
  /** The two fingers' midpoint, in canvas pixels. */
  private mid() {
    const [a, b] = [...this.pts.values()], r = this.cv.getBoundingClientRect(), k = devicePixelRatio;
    return { a, b, sx: ((a.x + b.x) / 2 - r.left) * k, sy: ((a.y + b.y) / 2 - r.top) * k };
  }
  private startPinch() {
    const { a, b, sx, sy } = this.mid();
    this.pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: this.scale, wx: this.cx + (sx - this.cv.width / 2) / this.scale, wz: this.cz + (sy - this.cv.height / 2) / this.scale };
    this.drag = null;
  }
  // the place first under the fingers stays under them as they spread, close and move
  private movePinch() {
    const P = this.pinch!, { a, b, sx, sy } = this.mid();
    this.scale = Math.max(0.01, Math.min(8, (P.scale * Math.hypot(a.x - b.x, a.y - b.y)) / P.d));
    this.cx = P.wx - (sx - this.cv.width / 2) / this.scale;
    this.cz = P.wz - (sy - this.cv.height / 2) / this.scale;
    this.invalidate();
  }

  invalidate() { this.dirty = true; }
  centerOn(x: number, z: number, scale?: number) { this.cx = x; this.cz = z; if (scale) this.scale = scale; this.invalidate(); }
  toScreen(x: number, z: number): [number, number] { return [(x - this.cx) * this.scale + this.cv.width / 2, (z - this.cz) * this.scale + this.cv.height / 2]; }

  render(force = false) {
    const cv = this.cv;
    const k = devicePixelRatio;
    const W = Math.max(2, Math.round(cv.clientWidth * k)), H = Math.max(2, Math.round(cv.clientHeight * k));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; this.dirty = true; }
    if (!this.dirty && !force) return;
    this.dirty = false;
    const g = this.g, s = this.scale;
    const x0 = this.cx - W / 2 / s, z0 = this.cz - H / 2 / s, x1 = this.cx + W / 2 / s, z1 = this.cz + H / 2 / s;
    void g.explore.ensureRect(x0, z0, x1, z1, 1500).then(() => this.invalidate());
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    if (!this.hatch) this.hatch = this.makeHatch(ctx);
    const col = this.color;
    col.width = W; col.height = H;
    const cc = col.getContext('2d')!;
    cc.clearRect(0, 0, W, H);
    cc.fillStyle = 'rgba(214,220,190,0.55)'; // land: a pale green-ochre wash where you've painted
    cc.fillRect(0, 0, W, H);

    // grid: 100 m close in, 1 km out
    const step = s > 0.4 ? 100 : s > 0.04 ? 1000 : 10000;
    ctx.strokeStyle = `${INK}0.07)`;
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(x0 / step) * step; gx < x1; gx += step) { const [a] = this.toScreen(gx, 0); ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, H); ctx.stroke(); }
    for (let gz = Math.ceil(z0 / step) * step; gz < z1; gz += step) { const [, b] = this.toScreen(0, gz); ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(W, b); ctx.stroke(); }

    // water: sampled from the terrain's signed distance (whatever the loaded world knows)
    const ws = Math.max(5, Math.round(Math.min(W, H) / 140));
    ctx.fillStyle = this.hatch!;
    cc.fillStyle = 'rgba(118,160,188,0.9)';
    for (let py = 0; py < H; py += ws)
      for (let px = 0; px < W; px += ws) {
        const x = this.cx + (px + ws / 2 - W / 2) / s, z = this.cz + (py + ws / 2 - H / 2) / s;
        if (g.terrain.sdfAt(x, z) < 0) { ctx.fillRect(px, py, ws, ws); cc.fillRect(px, py, ws, ws); }
      }

    // streets (placeholder streets — synth, standing in while the real tile loads — pencilled:
    // dashed, faint, no colour, and a note that the real map is on its way)
    const roads = g.roads();
    const seen = new Set<string>();
    let pencilled = 0;
    for (const pass of [0, 1]) {
      for (const r of roads) {
        if (r.lod || r.p.length < 4) continue;
        if (!pass && (r.w < 2 && s < 0.6)) continue;
        let inView = false;
        for (let i = 0; i + 1 < r.p.length; i += 2) { const x = r.p[i] / 10, z = r.p[i + 1] / 10; if (x > x0 - 50 && x < x1 + 50 && z > z0 - 50 && z < z1 + 50) { inView = true; break; } }
        if (!inView) continue;
        if (r.sy) {
          if (pass) continue;
          pencilled++;
          ctx.save();
          ctx.setLineDash([4 * k, 5 * k]);
          ctx.strokeStyle = `${INK}0.22)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i + 1 < r.p.length; i += 2) { const [a, b] = this.toScreen(r.p[i] / 10, r.p[i + 1] / 10); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); }
          ctx.stroke();
          ctx.restore();
          continue;
        }
        const lw = Math.max(pass ? 1 : 1.2, r.w * s * (pass ? 0.75 : 1));
        const trace = (c: CanvasRenderingContext2D) => {
          c.beginPath();
          for (let i = 0; i + 1 < r.p.length; i += 2) { const [a, b] = this.toScreen(r.p[i] / 10, r.p[i + 1] / 10); if (i) c.lineTo(a, b); else c.moveTo(a, b); }
        };
        if (!pass) {
          ctx.strokeStyle = `${INK}${r.w >= 6 ? 0.6 : 0.4})`;
          ctx.lineWidth = Math.max(1, Math.min(3, lw * 0.25));
          ctx.lineCap = 'round';
          trace(ctx); ctx.stroke();
          cc.strokeStyle = 'rgba(120,108,100,0.8)';
          cc.lineWidth = lw + 2;
          cc.lineCap = 'round';
          trace(cc); cc.stroke();
        } else {
          cc.strokeStyle = r.w >= 7 ? '#e9d8a6' : '#efe7d4';
          cc.lineWidth = lw;
          trace(cc); cc.stroke();
        }
      }
    }
    // footprints
    if (s > 0.25) {
      ctx.strokeStyle = `${INK}0.45)`;
      ctx.lineWidth = 1;
      for (const f of g.footprints()) {
        const [fx, fz] = f.ring[0];
        if (fx < x0 - 80 || fx > x1 + 80 || fz < z0 - 80 || fz > z1 + 80) continue;
        ctx.beginPath();
        cc.beginPath();
        f.ring.forEach(([x, z], i) => { const [a, b] = this.toScreen(x, z); if (i) { ctx.lineTo(a, b); cc.lineTo(a, b); } else { ctx.moveTo(a, b); cc.moveTo(a, b); } });
        ctx.closePath(); cc.closePath();
        ctx.stroke();
        cc.fillStyle = f.kind === 'church' ? '#e7ddc9' : f.kind === 'commercial' || f.kind === 'large' ? '#b8c2c8' : f.kind === 'lighthouse' ? '#f2efe6' : '#cf9c83';
        cc.fill();
      }
    }

    // explored mask → the colour layer shows only where you've walked (soft, wet edges)
    const ms = 6;
    const mw = Math.ceil(W / ms), mh = Math.ceil(H / ms);
    const m = this.mask;
    m.width = mw; m.height = mh;
    const mctx = m.getContext('2d')!;
    const img = mctx.createImageData(mw, mh);
    let any = false;
    for (let j = 0; j < mh; j++)
      for (let i = 0; i < mw; i++) {
        const v = g.explore.valueAt(this.cx + (i * ms + ms / 2 - W / 2) / s, this.cz + (j * ms + ms / 2 - H / 2) / s);
        if (v) { img.data[(j * mw + i) * 4 + 3] = v; any = true; }
      }
    if (any) {
      mctx.putImageData(img, 0, 0);
      cc.globalCompositeOperation = 'destination-in';
      cc.filter = `blur(${Math.max(2, 5 * k)}px)`;
      cc.imageSmoothingEnabled = true;
      cc.drawImage(m, 0, 0, W, H);
      cc.filter = 'none';
      cc.globalCompositeOperation = 'source-over';
      ctx.drawImage(col, 0, 0);
    }

    // street names (painted streets darker)
    if (s > 0.5) {
      ctx.font = `italic ${Math.round(12 * k)}px Georgia, serif`;
      ctx.textAlign = 'center';
      const placed: [number, number, number, number][] = [];
      for (const r of roads) {
        if (!r.n || r.lod || seen.has(r.n) || r.p.length < 4) continue;
        const mid = Math.floor(r.p.length / 4) * 2;
        const x = r.p[mid] / 10, z = r.p[mid + 1] / 10;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const [a, b] = this.toScreen(x, z);
        const tw = ctx.measureText(r.n).width;
        if (placed.some(([px, py, pw, ph]) => a - tw / 2 < px + pw && a + tw / 2 > px && b - 14 * k < py + ph && b > py)) continue;
        placed.push([a - tw / 2, b - 14 * k, tw, 16 * k]);
        seen.add(r.n);
        const [a2, b2] = this.toScreen(r.p[mid + 2] / 10, r.p[mid + 3] / 10);
        let ang = Math.atan2(b2 - b, a2 - a);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        ctx.save();
        ctx.translate(a, b);
        ctx.rotate(ang);
        ctx.fillStyle = g.explore.valueAt(x, z) > 100 ? `${INK}0.85)` : `${INK}0.45)`;
        ctx.fillText(r.n, 0, -3 * k);
        ctx.restore();
      }
    }

    if (pencilled > 8) {
      ctx.font = `italic ${Math.round(12 * k)}px Georgia, serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = `${INK}0.55)`;
      ctx.fillText('pencilled streets: the real map of this place is still arriving', 14 * k, H - 14 * k);
    }

    // pins
    this.lastPins = [];
    ctx.textAlign = 'center';
    for (const p of this.pins()) {
      const [a, b] = this.toScreen(p.x, p.z);
      if (a < -20 || b < -20 || a > W + 20 || b > H + 20) continue;
      this.lastPins.push({ p, sx: a, sy: b });
      const glyph = p.kind === 'page' ? '▣' : p.kind === 'commission' ? '✧' : p.kind === 'result' ? '●' : p.kind === 'plant' ? '❀' : '✦';
      ctx.fillStyle = p.kind === 'page' ? '#3a5a78' : p.kind === 'result' ? '#2e2a3a' : p.kind === 'plant' ? '#4f7a36' : '#a0503c';
      ctx.font = `${Math.round((p.kind === 'commission' ? 20 : 15) * k)}px Georgia, serif`;
      ctx.fillText(glyph, a, b + 5 * k);
      if ((p.kind === 'commission' || p.kind === 'result') ? s > 0.15 : p.kind === 'stamp' && s > 1.6) {
        ctx.font = `italic ${Math.round(11 * k)}px Georgia, serif`;
        ctx.fillText(p.label.replace(/^Paint /, ''), a, b + 20 * k);
      }
    }
    // you
    const w = g.walker;
    const [ya, yb] = this.toScreen(w.x, w.z);
    ctx.save();
    ctx.translate(ya, yb);
    ctx.rotate(-w.yaw);
    ctx.scale(k, k);
    ctx.fillStyle = '#2e2a3a';
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // compass + scale bar
    ctx.fillStyle = `${INK}0.7)`;
    ctx.font = `italic ${Math.round(15 * k)}px Georgia, serif`;
    ctx.fillText('N', W - 30 * k, 30 * k);
    ctx.beginPath(); ctx.moveTo(W - 30 * k, 36 * k); ctx.lineTo(W - 25 * k, 56 * k); ctx.lineTo(W - 35 * k, 56 * k); ctx.closePath(); ctx.fill();
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find((v) => v * s > 90 * k) ?? 50000;
    const bw = nice * s;
    ctx.strokeStyle = `${INK}0.7)`;
    ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.moveTo(20 * k, H - 22 * k); ctx.lineTo(20 * k + bw, H - 22 * k); ctx.stroke();
    ctx.font = `${Math.round(11 * k)}px Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 20 * k, H - 30 * k);
  }

  private makeHatch(ctx: CanvasRenderingContext2D) {
    const t = document.createElement('canvas');
    t.width = t.height = 8;
    const c = t.getContext('2d')!;
    c.strokeStyle = 'rgba(80,100,130,0.35)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 8); c.lineTo(8, 0); c.stroke();
    return ctx.createPattern(t, 'repeat');
  }
}
