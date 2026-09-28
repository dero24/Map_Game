// Context hints: one small pill above the bottom edge that says what the key does *here*
// ("E — drive this pickup", "walk through the door to go inside"). Providers are asked a few times a
// second; the most important answer wins. First-time tips ("M — map & sketchbook") show a few times
// ever, then retire (localStorage), so the screen stays quiet for people who know the keys.

export interface Hint { key?: string; text: string; pri: number; once?: string }
type Provider = () => Hint | null;

const SEEN = 'map-game.hints.v1';

export class Hints {
  private providers: Provider[] = [];
  private el: HTMLElement;
  private t = 0;
  private shown = '';
  private seen: Record<string, number> = {};
  private since = 0;

  constructor() {
    this.el = document.getElementById('hint')!;
    try { this.seen = JSON.parse(localStorage.getItem(SEEN) ?? '{}'); } catch { this.seen = {}; }
  }
  add(p: Provider) { this.providers.push(p); }

  update(dt: number, blocked: boolean) {
    if ((this.t -= dt) > 0) return;
    this.t = 0.2;
    let best: Hint | null = null;
    if (!blocked)
      for (const p of this.providers) {
        const h = p();
        if (!h || (h.once && (this.seen[h.once] ?? 0) >= 3)) continue;
        if (!best || h.pri > best.pri) best = h;
      }
    const id = best ? `${best.key ?? ''}|${best.text}` : '';
    if (id === this.shown) {
      this.since += 0.2;
      // a first-time tip has said its piece after 7 s
      if (best?.once && this.since > 7 && (this.seen[best.once] ?? 0) < 3) {
        this.seen[best.once] = 3;
        this.save();
      }
      return;
    }
    this.shown = id;
    if (best?.once) { this.seen[best.once] = (this.seen[best.once] ?? 0) + 1; this.save(); }
    this.since = 0;
    if (!best) { this.el.classList.remove('show'); return; }
    // (built as nodes, never markup: a hint can carry text from the map — a peak's name)
    this.el.replaceChildren();
    if (best.key) { const k = document.createElement('kbd'); k.textContent = best.key; this.el.append(k, ' '); }
    this.el.append(best.text);
    this.el.classList.add('show');
  }
  private save() { try { localStorage.setItem(SEEN, JSON.stringify(this.seen)); } catch { /* ignore */ } }
}
