// In-page montage for agents driving a live browser (no Playwright): paste into the page
// console (or a browser-automation JS tool) on a `?capture=1` URL, then:
//   await __MONTAGE__(['ocean-golden','porch','inside'], { settle: 40 })
// Each entry is a shot name (window.__APPLY_SHOT__) or a function(game) that poses the
// camera itself. The contact sheet covers the page as an overlay — take ONE screenshot.
// `__MONTAGE_CLOSE__()` removes it. Mirrors tools/capture.mjs' sheet layout.
// Occluded/unfocused browser panes stop requestAnimationFrame entirely (the montage then
// hangs mid-sheet): `{ timers: true }` drives the game loop from a MessageChannel pump instead.
// A hidden pane never fires requestAnimationFrame, and throttles timers to ~1/s (then 1/min).
// MessageChannel messages aren't throttled: pump frames through one at ~60 Hz, and restart the
// game loop on the pump (__KICK__, capture builds) since its pending rAF would never fire.
window.__PUMP__ = () => {
  if (window.__TIMERS__) return;
  window.__TIMERS__ = true;
  const q = [], mc = new MessageChannel();
  let last = 0, pending = false;
  mc.port1.onmessage = () => {
    const now = performance.now();
    if (now - last < 15) return void mc.port2.postMessage(0);
    last = now;
    for (const cb of q.splice(0)) { try { cb(now); } catch (e) { console.error(e); } }
    if (q.length) mc.port2.postMessage(0);
    else pending = false;
  };
  window.requestAnimationFrame = (cb) => { q.push(cb); if (!pending) { pending = true; mc.port2.postMessage(0); } return 0; };
  window.__KICK__?.();
};
// ms of wall time, counted on the frame pump once it runs (plain timers otherwise)
window.__WAIT__ = (ms) => new Promise((r) => {
  if (!window.__TIMERS__) return void setTimeout(r, ms);
  const t0 = performance.now();
  const f = () => (performance.now() - t0 >= ms ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
window.__MONTAGE__ = async (items, opts = {}) => {
  const settle = opts.settle ?? 40, cols = Math.min(opts.cols ?? 3, items.length);
  if (opts.timers) window.__PUMP__();
  const canvas = document.querySelector('canvas');
  const frames = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const CW = opts.cw ?? 640, CH = Math.round(CW * canvas.height / canvas.width), PAD = 22;
  const rows = Math.ceil(items.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * CW; sheet.height = rows * (CH + PAD);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f5efe1'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '14px Georgia, serif'; ctx.fillStyle = '#3a3346';
  document.getElementById('__montage')?.remove();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (typeof it === 'string') window.__APPLY_SHOT__(it);
    else await (it.fn ?? it)(window.__GAME__);
    await frames(settle);
    if (typeof it !== 'string' && it.after) await it.after(); // a post-settle check may amend the label
    const label = typeof it === 'string' ? it : (it.label ?? `#${i}`);
    const x = (i % cols) * CW, y = Math.floor(i / cols) * (CH + PAD);
    ctx.drawImage(canvas, x, y, CW, CH);
    ctx.fillText(label, x + 8, y + CH + 16);
  }
  if (opts.save) {
    // dev server (vite.config.ts shot-sink) writes it to shots/<save> — read that file.
    const blob = await new Promise((r) => sheet.toBlob(r, 'image/jpeg', 0.82));
    const res = await fetch(`/__shot?name=${encodeURIComponent(opts.save)}`, { method: 'POST', body: blob });
    if (!res.ok) throw new Error('shot sink refused: ' + res.status);
    return `${items.length} shots → shots/${opts.save} (${sheet.width}x${sheet.height})`;
  }
  const img = new Image();
  img.src = sheet.toDataURL('image/jpeg', 0.8);
  img.id = '__montage';
  Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', objectFit: 'contain', background: '#f5efe1', zIndex: 99999 });
  document.body.appendChild(img);
  return `${items.length} shots, ${sheet.width}x${sheet.height}`;
};
window.__MONTAGE_CLOSE__ = () => document.getElementById('__montage')?.remove();
