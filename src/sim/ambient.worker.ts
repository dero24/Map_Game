// Ambient-life worker. Runs LifeSim at a fixed SIM_HZ and publishes double-buffered snapshots:
//  - 'sab' mode: straight into a SharedArrayBuffer the renderer reads (flip FRONT, bump TICK atomically)
//  - 'copy' mode (no cross-origin isolation): into a local buffer, then copied into a transferable buffer
//    borrowed from the renderer's pool and posted back.
import { LifeSim } from './lifeSim';
import { H, SIM_HZ, layout, views, type LifeInit } from './protocol';

interface WorkerScope { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null }
const ctx = self as unknown as WorkerScope;

let sim: LifeSim | null = null;
let V: ReturnType<typeof views>;
let mode: 'sab' | 'copy' = 'sab';
let local: ArrayBuffer | null = null;
const pool: ArrayBuffer[] = [];
let avgCost = 0;
// Asleep while the page can't be seen (a phone locked, the app switched away): no ticks at all —
// the townsfolk stand where they were and walk on when it wakes (main.ts, ui/lifecycle.ts).
let paused = false;
let timer: ReturnType<typeof setTimeout> | 0 = 0;

function tick() {
  timer = 0;
  if (!sim || paused) return;
  const t0 = performance.now();
  const h = V.header;
  sim.setEnv({
    playerX: h[H.PLAYER_X] / 100,
    playerZ: h[H.PLAYER_Z] / 100,
    night: h[H.NIGHT] / 1000,
    hour: h[H.HOUR] / 100,
    density: h[H.DENSITY] / 100,
    wind: h[H.WIND] / 1000,
    clock: h[H.CLOCK] / 100,
    playerYaw: h[H.PLAYER_YAW] / 1000,
  });
  const dt = 1 / SIM_HZ;
  sim.step(dt);
  const back = 1 - h[H.FRONT];
  h[H.ACTIVE] = sim.publish(V.snaps[back]);
  h[H.FRONT] = back;
  Atomics.store(h, H.TICK, sim.tick);
  const cost = performance.now() - t0;
  h[H.SIM_US] = Math.round(cost * 1000);
  if (mode === 'copy' && local && pool.length) {
    const buf = pool.pop()!;
    new Uint8Array(buf).set(new Uint8Array(local));
    ctx.postMessage({ kind: 'snap', buf }, [buf]);
  }
  avgCost = avgCost * 0.9 + cost * 0.1;
  const period = 1000 / SIM_HZ;
  timer = setTimeout(tick, Math.max(0, period - cost));
}

ctx.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d.kind === 'init') {
    const init = d.init as LifeInit;
    if (d.sab) {
      mode = 'sab';
      V = views(d.sab as SharedArrayBuffer);
    } else {
      mode = 'copy';
      local = new ArrayBuffer(layout().total);
      V = views(local);
      for (const b of d.pool as ArrayBuffer[]) pool.push(b);
      V.header.set(d.header as Int32Array);
    }
    sim = new LifeSim(init);
    ctx.postMessage({ kind: 'ready', mode });
    tick();
  } else if (d.kind === 'bump' && sim) {
    const n = sim.bump(d.x, d.z, d.vx, d.vz);
    if (n) ctx.postMessage({ kind: 'bumped', n });
  } else if (d.kind === 'regraph' && sim) {
    // new tiles streamed in: same worker, same agents, a bigger road graph
    sim = new LifeSim(d.init as LifeInit, sim);
  } else if (d.kind === 'pause') {
    paused = true;
    if (timer) { clearTimeout(timer); timer = 0; }
  } else if (d.kind === 'resume') {
    paused = false;
    if (!timer) tick(); // (one loop: a resume while ticking changes nothing)
  } else if (d.kind === 'return') {
    pool.push(d.buf as ArrayBuffer);
  } else if (d.kind === 'env' && mode === 'copy') {
    V.header.set((d.header as Int32Array).subarray(H.PLAYER_X, H.WIND + 1), H.PLAYER_X);
    V.header[H.CLOCK] = (d.header as Int32Array)[H.CLOCK];
    V.header[H.PLAYER_YAW] = (d.header as Int32Array)[H.PLAYER_YAW];
  }
};
