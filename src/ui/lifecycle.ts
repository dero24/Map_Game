// Sleep while nobody can see the page — a phone locked, the app switched away, the tab hidden —
// the way a phone game does: the sound stops, the townsfolk's simulation stops (the frame loop
// already has: browsers don't run requestAnimationFrame for a hidden page), and whatever a thumb
// was holding lets go, so a stick dragged when the screen went dark doesn't walk on by itself
// when it lights up again. Waking undoes it. main.ts wires it on phones and tablets.
//
// Pure wiring: every effect is a hook and the page's events come from the targets passed in, so
// tests/lifecycle.test.ts drives it with plain EventTargets.

export interface SleepHooks {
  /** Hidden: silence the sound, stop the simulation. */
  sleep(): void;
  /** On screen again. */
  wake(): void;
  /** Hidden: let go of held input (the walking stick, the look drag, held buttons). */
  release(): void;
}

interface Doc extends EventTarget { readonly visibilityState: string }

/** Wire the page's lifecycle events to `hooks`. The state it returns says whether it's asleep. */
export function sleepWhenHidden(doc: Doc, win: EventTarget, hooks: SleepHooks) {
  const state = { asleep: false, sleeps: 0 };
  const sleep = () => {
    hooks.release(); // (every time: a hide right after a wake may have caught new held input)
    if (state.asleep) return;
    state.asleep = true;
    state.sleeps++;
    hooks.sleep();
  };
  const wake = () => {
    if (!state.asleep || doc.visibilityState !== 'visible') return;
    state.asleep = false;
    hooks.wake();
  };
  doc.addEventListener('visibilitychange', () => (doc.visibilityState === 'visible' ? wake() : sleep()));
  win.addEventListener('pagehide', sleep); // (leaving, or into the back-forward cache)
  win.addEventListener('pageshow', wake); // (back from it)
  doc.addEventListener('freeze', sleep); // (Chrome's page lifecycle: a background tab frozen…)
  doc.addEventListener('resume', wake); // (…and thawed)
  if (doc.visibilityState !== 'visible') sleep(); // (opened in a background tab)
  return state;
}
