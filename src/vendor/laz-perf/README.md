# laz-perf (vendored)

LAZ point-cloud decoder (Emscripten/WASM) used by `src/world/lidar.ts` to read USGS 3DEP
Entwine Point Tiles in the tile worker.

- Upstream: https://github.com/hobuinc/laz-perf — npm `laz-perf@0.0.7`, `lib/worker/`
- License: Apache-2.0
- Local changes: the UMD export tail of `laz-perf.js` is replaced by `export default createLazPerf;`
  so Vite can bundle it into the module worker; `laz-perf.wasm` (byte-identical upstream, 214 KB)
  ships as base64 in `wasm-b64.ts` so it travels inside the worker chunk instead of being a
  separate request. Regenerate from the npm package's `lib/worker/laz-perf.wasm`:
  `python3 -c "import base64;print(base64.b64encode(open('laz-perf.wasm','rb').read()).decode())"`

Vendored rather than an npm dependency so the build has no install-time network step and the
worker gets a pinned, reviewable decoder.
