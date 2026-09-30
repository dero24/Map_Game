// The lift on the page (player/lift.ts rides it): L in a tall building's lift lobby opens a small
// floor chooser — ▼ floor 24 of 39 ▲, ↑↓ (or W S, PgUp PgDn by ten) or the floor's number, L or
// Enter to go, Esc to stay — and while the car carries you the same panel is its display, the floors
// counting by. On a touch screen a lift button joins the others while you're in a lift lobby, and
// the chooser's own arrows and "go" are buttons.
import type { LiftRide } from '../player/lift';

/** A floor as the HUD counts them (the ground floor is the first). */
const floorName = (k: number, n: number) => (k === 0 ? `ground floor · 1 of ${n}` : `floor ${k + 1} of ${n}`);

export class LiftUI {
  private panel: HTMLElement;
  private label: HTMLElement;
  private keys: HTMLElement;
  private tbtn: HTMLElement;
  private buttons: HTMLElement[] = [];
  private shown = '';
  constructor(private ride: LiftRide, private enabled: () => boolean) {
    this.panel = document.createElement('div');
    this.panel.id = 'lift';
    this.panel.className = 'hidden';
    const btn = (t: string, title: string, f: () => void) => {
      const b = document.createElement('button');
      b.textContent = t;
      b.title = title;
      b.onclick = (e) => { e.stopPropagation(); f(); };
      this.buttons.push(b);
      return b;
    };
    this.label = document.createElement('span');
    this.label.className = 'lift-floor';
    this.keys = document.createElement('div');
    this.keys.className = 'lift-keys';
    this.keys.textContent = '↑ ↓ or its number · L to go · Esc to stay';
    const down = btn('▼', 'down a floor', () => ride.step(-1)), up = btn('▲', 'up a floor', () => ride.step(1));
    this.panel.append(down, this.label, up, btn('go', 'ride the lift', () => ride.go()), btn('×', 'stay here', () => ride.cancel()), this.keys);
    this.tbtn = document.createElement('button');
    this.tbtn.id = 'tlift';
    this.tbtn.className = 'tbtn hidden';
    this.tbtn.title = 'call the lift';
    this.tbtn.setAttribute('aria-label', 'call the lift');
    this.tbtn.dataset.label = 'Lift';
    this.tbtn.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 9.5 4.5-4.5 4.5 4.5M7.5 14.5l4.5 4.5 4.5-4.5"/></svg>';
    this.tbtn.onclick = () => { if (this.enabled()) ride.call(); };
    document.body.append(this.panel);
    (document.getElementById('tdock') ?? document.getElementById('touchui'))?.append(this.tbtn);
    // (capture: while the chooser is open its keys are its own — not the walker's, the atlas's)
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
      if (ride.phase === 'choose') {
        const c = e.code;
        if (c === 'ArrowUp' || c === 'KeyW') ride.step(1);
        else if (c === 'ArrowDown' || c === 'KeyS') ride.step(-1);
        else if (c === 'PageUp') ride.step(10);
        else if (c === 'PageDown') ride.step(-10);
        else if (/^(Digit|Numpad)[0-9]$/.test(c)) ride.digit(+c.slice(-1));
        else if ((c === 'KeyL' || c === 'Enter' || c === 'NumpadEnter') && !e.repeat) ride.go();
        else if (c === 'Escape') ride.cancel();
        else return;
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (ride.holding) {
        // (riding: the walker's keys — walking, turning, flying, getting in a car — wait for the doors)
        if (/^(Arrow|Key[WASDEQFC]$|Space)/.test(e.code)) e.stopImmediatePropagation();
      } else if (e.code === 'KeyL' && !e.repeat && this.enabled() && ride.call()) e.preventDefault();
    }, { capture: true });
  }

  update(dt: number) {
    const r = this.ride;
    r.update(dt);
    const choose = r.phase === 'choose', riding = r.phase === 'close' || r.phase === 'ride' || r.phase === 'arrive';
    const id = choose ? `c${r.to}/${r.n}` : riding ? `r${r.shown}/${r.n}` : '';
    if (id !== this.shown) {
      this.shown = id;
      this.panel.classList.toggle('hidden', !choose && !riding);
      this.panel.classList.toggle('riding', riding);
      for (const b of this.buttons) b.style.display = choose ? '' : 'none';
      this.keys.style.display = choose ? '' : 'none';
      if (choose) this.label.textContent = floorName(r.to, r.n);
      else if (riding) this.label.textContent = `${r.to > r.from ? '▲' : '▼'} ${floorName(r.shown, r.n)}`;
    }
    this.tbtn.classList.toggle('hidden', r.busy || !this.enabled() || !r.here());
  }
}
