// The developer's frame readout (panel: Debug → "show stats"): how fast the frames come and what's in
// them — the frame rate and the worst frame, the draw calls and triangles, and how many people, cars,
// animals and tiles are about — so a slow stretch on a phone can be read off the screen, not guessed at.
export interface StatsLine { [label: string]: string | number }

export class StatsHud {
  private el: HTMLDivElement | null = null;
  private n = 0;
  private sum = 0;
  private worst = 0;
  private t0 = 0;

  /** Per frame: `ms` the frame's time; `read` the numbers (called twice a second, only while shown). */
  frame(on: boolean, now: number, ms: number, read: () => StatsLine) {
    if (!on) { if (this.el) this.el.style.display = 'none'; this.n = this.sum = this.worst = 0; this.t0 = now; return; }
    const el = this.el ?? this.make();
    el.style.display = 'block';
    this.n++; this.sum += ms; this.worst = Math.max(this.worst, ms);
    if (now - this.t0 < 500) return;
    const fps = (this.n * 1000) / Math.max(1, now - this.t0);
    const lines = [`${fps.toFixed(fps < 10 ? 1 : 0)} fps · avg ${(this.sum / this.n).toFixed(0)} ms · worst ${this.worst.toFixed(0)} ms`];
    for (const [k, v] of Object.entries(read())) lines.push(`${k} ${v}`);
    el.textContent = lines.join('\n');
    this.n = this.sum = this.worst = 0;
    this.t0 = now;
  }

  private make() {
    const el = document.createElement('div');
    el.id = 'stats-hud';
    Object.assign(el.style, {
      position: 'fixed', top: '6px', left: '6px', zIndex: '60', pointerEvents: 'none', whiteSpace: 'pre',
      font: '11px/1.35 ui-monospace, Menlo, Consolas, monospace', color: '#f4f1ea', background: 'rgba(20, 22, 28, 0.72)',
      padding: '5px 7px', borderRadius: '4px',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    this.el = el;
    return el;
  }
}
