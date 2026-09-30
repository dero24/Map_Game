import { describe, it, expect } from 'vitest';
import { sleepWhenHidden } from '../src/ui/lifecycle';

// A page the test can hide and show: the document's visibility and its events, and the window's.
function page(visible = true) {
  const doc = Object.assign(new EventTarget(), { visibilityState: visible ? 'visible' : 'hidden' });
  const win = new EventTarget();
  const calls: string[] = [];
  const hooks = { sleep: () => calls.push('sleep'), wake: () => calls.push('wake'), release: () => calls.push('release') };
  const show = (v: boolean) => { doc.visibilityState = v ? 'visible' : 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); };
  return { doc, win, calls, hooks, show };
}

describe('sleepWhenHidden', () => {
  it('sleeps when the page is hidden and wakes when it is back', () => {
    const p = page();
    const st = sleepWhenHidden(p.doc, p.win, p.hooks);
    expect(p.calls).toEqual([]);
    p.show(false);
    expect(p.calls).toEqual(['release', 'sleep']);
    expect(st.asleep).toBe(true);
    p.show(true);
    expect(p.calls).toEqual(['release', 'sleep', 'wake']);
    expect(st.asleep).toBe(false);
  });

  it('sleeps once however many ways it is told (hidden, pagehide, freeze), and lets go each time', () => {
    const p = page();
    const st = sleepWhenHidden(p.doc, p.win, p.hooks);
    p.show(false);
    p.win.dispatchEvent(new Event('pagehide'));
    p.doc.dispatchEvent(new Event('freeze'));
    expect(p.calls.filter((c) => c === 'sleep')).toHaveLength(1);
    expect(p.calls.filter((c) => c === 'release')).toHaveLength(3);
    expect(st.sleeps).toBe(1);
  });

  it('never wakes while the page is still hidden (a thaw or a bfcache return in the background)', () => {
    const p = page();
    sleepWhenHidden(p.doc, p.win, p.hooks);
    p.show(false);
    p.doc.dispatchEvent(new Event('resume'));
    p.win.dispatchEvent(new Event('pageshow'));
    expect(p.calls).not.toContain('wake');
    p.show(true);
    expect(p.calls.filter((c) => c === 'wake')).toHaveLength(1);
    p.win.dispatchEvent(new Event('pageshow')); // (already awake: nothing more)
    expect(p.calls.filter((c) => c === 'wake')).toHaveLength(1);
  });

  it('wakes on its own for a bfcache return that is on screen', () => {
    const p = page();
    sleepWhenHidden(p.doc, p.win, p.hooks);
    p.win.dispatchEvent(new Event('pagehide'));
    expect(p.calls).toContain('sleep');
    p.win.dispatchEvent(new Event('pageshow'));
    expect(p.calls.at(-1)).toBe('wake');
  });

  it('starts asleep in a background tab', () => {
    const p = page(false);
    const st = sleepWhenHidden(p.doc, p.win, p.hooks);
    expect(st.asleep).toBe(true);
    expect(p.calls).toEqual(['release', 'sleep']);
    p.show(true);
    expect(p.calls.at(-1)).toBe('wake');
  });
});
