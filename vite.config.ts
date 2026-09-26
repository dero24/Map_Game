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

export default defineConfig({
  base: './',
  plugins: [shotSink()],
  server: { headers: isolation, hmr: process.env.NO_HMR ? false : undefined },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
