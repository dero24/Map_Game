// wrangler's build step (wrangler.toml [build]): the laz-perf decoder as a .wasm file, which
// wrangler compiles at deploy — a Worker may not compile WASM from bytes at run time, so the
// base64 copy the game's tile worker inlines (src/vendor/laz-perf/wasm-b64.ts) won't do there.
// One source of truth: the bytes are decoded from that same file into worker/.gen/ (not committed).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(HERE, '../../src/vendor/laz-perf/wasm-b64.ts'), 'utf8');
const b64 = src.match(/export default '([A-Za-z0-9+/=]+)'/)?.[1];
if (!b64) throw new Error('no base64 in wasm-b64.ts');
const bytes = Buffer.from(b64, 'base64');
if (bytes.readUInt32BE(0) !== 0x0061736d) throw new Error('not a wasm module');
const out = resolve(HERE, '../.gen/laz-perf.wasm');
mkdirSync(dirname(out), { recursive: true });
if (!existsSync(out) || !readFileSync(out).equals(bytes)) writeFileSync(out, bytes);
console.log(`laz-perf.wasm: ${bytes.length} bytes → ${out}`);
