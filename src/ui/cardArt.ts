// Almanac card pictures: any foundry model, painted small. The model is rendered once (a three-
// quarter view, soft key + sky fill, on transparent) into a 256 px target, then finished on a 2D
// canvas like a field-guide plate: paper, a pale wash shadow, softened edges, pigment pooling at
// the rim and a little granulation. Deterministic (no randomness beyond position hashes) and cached
// per entry, so a card looks the same every time you open the book.
import * as THREE from 'three';
import { carLib, boatLib, planeGeometry, planeRecipe, type CarType, type BoatType, type PlaneType } from '../assets/kit';
import { critterGeometry, CRITTER_TINT, type CritterKind } from '../assets/fauna';
import { treeLib, plantLib, STAGES, type TreeKind, type PlantSpecies } from '../assets/flora';
import { hashf } from '../assets/core';
import { balloonGeometry, balloonRecipe, type BalloonPattern } from '../assets/balloon';
import { camperPicture, camperRecipe } from '../assets/camper';

// smooth value noise in [0,1] for ragged edges and paper tooth
const noise2 = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hashf(a * 73856093 ^ b * 19349663);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
};
// 4-sector Kuwahara: each pixel takes the mean of its least-varied quadrant → flat washes, kept edges
function kuwahara(src: Uint8ClampedArray, S: number, r: number) {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let best = Infinity, br = 0, bg = 0, bb = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        let n = 0, mr = 0, mg = 0, mb = 0, v = 0;
        for (let j = 0; j <= r; j++)
          for (let i = 0; i <= r; i++) {
            const xx = Math.min(S - 1, Math.max(0, x + i * sx)), yy = Math.min(S - 1, Math.max(0, y + j * sy)), t = (yy * S + xx) * 4;
            if (src[t + 3] < 20) continue;
            const R = src[t], G = src[t + 1], B = src[t + 2];
            mr += R; mg += G; mb += B; v += R * R + G * G + B * B; n++;
          }
        if (!n) continue;
        mr /= n; mg /= n; mb /= n;
        const varr = v / n - (mr * mr + mg * mg + mb * mb);
        if (varr < best) { best = varr; br = mr; bg = mg; bb = mb; }
      }
      const t = (y * S + x) * 4;
      out[t] = best < Infinity ? br : src[t]; out[t + 1] = best < Infinity ? bg : src[t + 1]; out[t + 2] = best < Infinity ? bb : src[t + 2]; out[t + 3] = src[t + 3];
    }
  return out;
}
const TINTS: Record<string, number> = { car: 0x9c2a26, boat: 0xf2efe6, plane: 0xe9e4d6, wildlife: 0xa88f6a, tree: 0x6f8f4a, flower: 0x6a9448 };
const S = 256;

function model(family: string, type: string): THREE.BufferGeometry | null {
  switch (family) {
    case 'car': return type === 'camper' ? camperPicture(camperRecipe(1)) : carLib(type as CarType); // (your van: the brush's chip)
    case 'boat': return boatLib(type as BoatType);
    case 'plane': return planeGeometry(planeRecipe(type as PlaneType, 1)).geo;
    case 'wildlife': return critterGeometry(type as CritterKind);
    case 'tree': return treeLib(type as TreeKind, 0);
    case 'flower': return plantLib(type as PlantSpecies, 0, STAGES - 1, true);
    case 'balloon': return balloonGeometry(balloonRecipe(1, [0xd8412f, 0xf2b632, 0x2f6fb5], type as BalloonPattern)).geo;
  }
  return null;
}

export function makeCardArt(renderer: THREE.WebGLRenderer) {
  const cache = new Map<string, string>();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x8a7a60, 1.3));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-3, 5, -2);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 200);
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(S * S * 4);

  return (family: string, type: string, pencil = false): string => {
    const k = `${family}:${type}${pencil ? ':pencil' : ''}`;
    const hit = cache.get(k);
    if (hit) return hit;
    const g0 = model(family, type);
    if (!g0) return '';
    // white (TINT) surfaces take the family's painted colour
    const g = g0.clone();
    const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (col) {
      const t = new THREE.Color((family === 'wildlife' ? CRITTER_TINT[type as CritterKind] : undefined) ?? TINTS[family] ?? 0xcccccc);
      for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.98 && col.getY(i) > 0.98 && col.getZ(i) > 0.98) col.setXYZ(i, t.r, t.g, t.b);
    }
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: !!col, side: THREE.DoubleSide }));
    scene.add(mesh);
    // frame it: a three-quarter view from the front-left, a little above
    g.computeBoundingBox();
    const b = g.boundingBox!, c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    const r = Math.max(sz.x, sz.y, sz.z) * 0.62;
    const dir = new THREE.Vector3(-0.75, 0.42, -1).normalize();
    cam.position.copy(c).addScaledVector(dir, r / Math.tan((cam.fov * Math.PI) / 360) * 1.05);
    cam.lookAt(c);
    const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevClear, prevA);
    scene.remove(mesh);
    (mesh.material as THREE.Material).dispose();
    g.dispose();

    // the plate: the render becomes a watercolour — Kuwahara flattens it into washes, pigment
    // pools at the wash rims, the silhouette bleeds a little into wet paper with a ragged edge,
    // a pencil ground line anchors it, and the paper's tooth shows through
    const src = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) src.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4); // flip
    const A = (x: number, y: number) => src[(Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))) * 4 + 3];
    if (pencil) {
      // a field sketch, not yet painted: graphite outlines and light hatching on bare paper
      const o = document.createElement('canvas');
      o.width = o.height = S;
      const c2 = o.getContext('2d')!, im = c2.createImageData(S, S), dd = im.data;
      const L = (x: number, y: number) => { const t = (Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))) * 4; return src[t + 3] < 30 ? 255 : src[t] * 0.3 + src[t + 1] * 0.59 + src[t + 2] * 0.11; };
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const q = (y * S + x) * 4, gx = L(x + 1, y) - L(x - 1, y), gy = L(x, y + 1) - L(x, y - 1);
          const edge = Math.min(1, Math.hypot(gx, gy) / 70) * (0.55 + 0.45 * noise2(x * 0.2, y * 0.2));
          const shade = src[q + 3] > 30 ? (1 - L(x, y) / 255) : 0;
          const hatch = shade > 0.35 && ((x + y) % 5 === 0) ? 0.35 * shade : 0;
          const g = 1 - Math.min(0.85, edge * 0.9 + hatch);
          const grain = (hashf(q * 3 + 7) - 0.5) * 10;
          dd[q] = 246 * g + (1 - g) * 70 + grain; dd[q + 1] = 241 * g + (1 - g) * 66 + grain; dd[q + 2] = 228 * g + (1 - g) * 78 + grain; dd[q + 3] = 255;
        }
      c2.putImageData(im, 0, 0);
      const url = o.toDataURL('image/jpeg', 0.85);
      cache.set(k, url);
      return url;
    }
    const paint = kuwahara(src, S, 3);
    // soft coverage: blurred alpha, eroded by noise → a ragged wet edge instead of a cutout
    const cov = new Float32Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let a = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += A(x + i, y + j);
        const n = noise2(x * 0.09, y * 0.09) * 0.6 + noise2(x * 0.31, y * 0.31) * 0.4;
        cov[y * S + x] = Math.max(0, Math.min(1, (a / (25 * 255) - 0.32 + (n - 0.5) * 0.35) * 2.4));
      }
    const out = document.createElement('canvas');
    out.width = out.height = S;
    const o = out.getContext('2d')!;
    const img = o.createImageData(S, S), d = img.data;
    const paper = [246, 241, 228];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const k = y * S + x, q = k * 4, c = cov[k];
        // pigment pools where the wash thins out (the rim), and at strong value edges inside it
        const rim = c > 0 && c < 1 ? Math.sin(c * Math.PI) : 0;
        const l = (i: number, j: number) => { const t = (Math.min(S - 1, Math.max(0, y + j)) * S + Math.min(S - 1, Math.max(0, x + i))) * 4; return paint[t] * 0.3 + paint[t + 1] * 0.59 + paint[t + 2] * 0.11; };
        const edge = Math.min(1, Math.abs(l(1, 0) - l(-1, 0)) / 60 + Math.abs(l(0, 1) - l(0, -1)) / 60);
        const dark = 1 - 0.28 * rim - 0.16 * edge;
        const gran = (hashf(k * 7 + 131) - 0.5) * 16 + (noise2(x * 0.6, y * 0.6) - 0.5) * 10;
        for (let ch = 0; ch < 3; ch++) {
          // the wash is a little lighter and more transparent than the render (paper glows through)
          const w = (paint[q + ch] * 0.86 + paper[ch] * 0.14) * dark;
          d[q + ch] = paper[ch] + (w - paper[ch]) * c + gran * (0.4 + 0.6 * c);
        }
        d[q + 3] = 255;
      }
    o.putImageData(img, 0, 0);
    // a pencil ground line under the subject: two light, slightly wobbly strokes
    let minY = S, minX = S, maxX = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (src[(y * S + x) * 4 + 3] > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    for (let y = S - 1; y >= 0 && minY === S; y--) for (let x = 0; x < S; x++) if (src[(y * S + x) * 4 + 3] > 40) { minY = y; break; }
    if (minY < S) {
      o.strokeStyle = 'rgba(70, 64, 78, 0.45)';
      o.lineCap = 'round';
      for (let s2 = 0; s2 < 2; s2++) {
        o.lineWidth = s2 ? 0.8 : 1.2;
        o.beginPath();
        const x0 = minX - 18 - s2 * 6, x1 = maxX + 14 + s2 * 9, gy = minY + 2 + s2 * 2.5;
        for (let x = x0; x <= x1; x += 6) { const yy = gy + (noise2(x * 0.05 + s2 * 7, k.length) - 0.5) * 2.2; if (x === x0) o.moveTo(x, yy); else o.lineTo(x, yy); }
        o.stroke();
      }
    }
    const url = out.toDataURL('image/jpeg', 0.88);
    cache.set(k, url);
    return url;
  };
}
