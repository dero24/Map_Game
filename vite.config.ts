import { defineConfig } from 'vite';

// COOP/COEP make the page cross-origin isolated so the ambient-life worker can share a
// SharedArrayBuffer with the renderer. Without them (e.g. GitHub Pages) the worker falls back
// to transferable snapshot copies — same protocol, one extra memcpy per tick.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  server: { headers: isolation, hmr: process.env.NO_HMR ? false : undefined },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
