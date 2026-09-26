import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev-only: `POST /__shot?name=<file>.jpg` (body = JPEG bytes) lands in shots/. Lets an agent
// driving a live browser (tools/inpage-montage.js) save full-resolution contact sheets
// without Playwright. Names are sanitised; only .jpg/.png, only under shots/.
const shotSink = (): Plugin => ({
  name: 'shot-sink',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
      if (req.method !== 'POST' || !/^[\w.-]+\.(jpg|png)$/.test(name)) { res.statusCode = 400; res.end('bad'); return; }
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => {
        const dir = resolve(__dirname, 'shots');
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, name), Buffer.concat(parts));
        res.end('ok');
      });
    });
  },
});

// COOP/COEP make the page cross-origin isolated so the ambient-life worker can share a
// SharedArrayBuffer with the renderer. Without them (e.g. GitHub Pages) the worker falls back
// to transferable snapshot copies — same protocol, one extra memcpy per tick.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Dev-only: `/__tiles/*` → the local `wrangler dev` tile worker, whichever port it landed on
// (8787, or 8788/8789 when taken). Same-origin for the page and its module workers: no port
// guessing in the client, no cross-origin/COEP friction, works in locked-down browser panes.
const tileProxy = (): Plugin => ({
  name: 'tile-proxy',
  apply: 'serve',
  configureServer(server) {
    let port = 0;
    const alive = async (p: number) => fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok, () => false);
    server.middlewares.use('/__tiles', async (req, res) => {
      try {
        if (!port || !(req.url === '/health' ? await alive(port) : true)) {
          port = 0;
          for (const p of [8787, 8788, 8789]) if (await alive(p)) { port = p; break; }
        }
        if (!port) { res.statusCode = 503; res.end('no local tile worker (cd worker && npx wrangler dev)'); return; }
        const up = await fetch(`http://127.0.0.1:${port}${req.url}`, { signal: AbortSignal.timeout(180000) });
        res.statusCode = up.status;
        for (const k of ['content-type', 'cache-control', 'x-tile-cache', 'x-osm-attribution']) {
          const v = up.headers.get(k);
          if (v) res.setHeader(k, v);
        }
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.end(Buffer.from(await up.arrayBuffer()));
      } catch (e) {
        port = 0; // re-probe next time (worker restarted on another port?)
        res.statusCode = 502;
        res.end(String(e));
      }
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [shotSink(), tileProxy()],
  server: { headers: isolation, hmr: process.env.NO_HMR ? false : undefined },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
