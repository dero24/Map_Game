// Generic painted material for props: vertex color (and instance color), optional emissive, wind sway, bobbing.
import * as THREE from 'three';
import { paintMaterial } from './shared';
import { SIGNAL_GLSL } from '../sim/traffic';

// crown: [centre height, radius] in the geometry's own metres (treeMeta). With it, a tree's
// foliage shades as one lit volume with a darker underside (the BOTW/Ghibli read) instead of
// evenly lit balls on a stick; bark keeps its own normals.
// decid: a broadleaf crown — its leaves colour in autumn and fall in winter (season.ts uLeafFall /
// uAutumn); conifers and palms keep theirs.
// paved: street ribbons — snow is ploughed off the asphalt (slushy tracks) and lies on the walks.
// signal: traffic-signal masts — the instance colour is DATA (r = the junction's phase key, g = the
// phase group), and the red / amber / green lens the life sim is obeying right now is lit
// (src/sim/traffic.ts signalState, on the shared clock uTime).
// fallHue: how a broadleaf turns (flora.ts FALL_HUE): 1 the maples' reds, 2 gold (willow, elm,
// poplar, birch); else each tree its own of yellow / orange / red. blossom: the flowering cherry's
// spring pink (season.ts bloom). weep: a willow's hanging strands swing with the wind.
// wash: a thing being painted in by the brush (ui/brush.ts), drawn in the sketch pass (post.ts):
// translucent paper, hatched, until the wash reaches it — uWashAt = (world x, y, z of the first
// touch, the wash's radius in m; < 0 all paper); uWash = (dry: 0 wet → 1 dry, opacity, -, -).
// It writes display colour and coverage (+ 2 where the paint is wet) for post.ts to lay over the
// painting; the outline is drawn there, from the pass's depth.
// fade: the micro layer's near pieces (world/microLayer.ts), merged into one mesh. `aFade` is each
// piece's foot (x, y, z) and where it hands over to its impostor card (m; < 0: it has no card and
// draws whole); across the band uFade.x it gives way pixel by pixel on the ordered dither the cards
// use the other way round (render/impostor.ts), so the two never both draw a pixel, nor leave one.
// uFade.y: 0 by distance, 1 cards only (this draws nothing), 2 never hand over.
// treeLod: a tree's two models (world/nearTrees.ts). 'far' (TREE_LOD 1): a tile's trees, the solid
// lobed crowns — the near-tree layer marks the trees it draws close up (`aNear`, per instance), and
// for those this gives way to the near model across the hand-over band on the same ordered dither
// (and draws nothing at all inside it: the instance folds to a point). 'near' (TREE_LOD 2): the
// near model's limbs, the other side of the same split. TREE_LOD_U = (hand-over distance, band,
// mode: 0 by distance · 1 far only · 2 near only, -), shared by every tree material; the near
// layer's mask pass (uTreeMask: x, z, radius, on) draws one tree's wood flat red for the metrics.
export const TREE_LOD_U = { value: new THREE.Vector4(30, 6, 0, 0) };
export const TREE_MASK_U = { value: new THREE.Vector4(0, 0, 0, 0) };
/** The far model's share of a tree's pixels at distance d (TREE_LOD_U's x, y): 0 inside the
 *  hand-over, 1 past it. The shaders run the same sum. */
export const farShare = (d: number, hand: number, band: number) => Math.min(1, Math.max(0, (d - hand + band * 0.5) / Math.max(band, 1e-3)));
const GLSL_TREE_LOD = /* glsl */ `
  float treeFarShare(float d, vec4 L, float flagged) {
    if (flagged < 0.5) return 1.0;
    if (L.z > 0.5) return L.z > 1.5 ? 0.0 : 1.0;
    return clamp((d - L.x + L.y * 0.5) / max(L.y, 1e-3), 0.0, 1.0);
  }`;
export function propMaterial(opts: { wind?: boolean; bob?: boolean; emissive?: THREE.Color; emissiveNight?: boolean; foliage?: boolean; crown?: [number, number]; decid?: boolean; paved?: boolean; signal?: boolean; fallHue?: number; blossom?: boolean; weep?: boolean; wash?: boolean; fade?: boolean; treeLod?: 'far' | 'near' } = {}) {
  const defines: Record<string, number> = {};
  if (opts.treeLod) defines.TREE_LOD = opts.treeLod === 'far' ? 1 : 2;
  if (opts.fade) defines.FADE = 1;
  if (opts.wash) defines.WASH = 1;
  if (opts.weep) defines.WEEP = 1;
  defines.FALL_HUE = opts.fallHue ?? 0; // (always defined: an undefined macro in #if is a GLSL error)
  if (opts.blossom) defines.BLOSSOM = 1;
  if (opts.wind) defines.WIND = 1;
  if (opts.bob) defines.BOB = 1;
  if (opts.foliage) defines.FOLIAGE = 1;
  if (opts.decid) defines.DECID = 1;
  if (opts.paved) defines.PAVED = 1;
  if (opts.signal) defines.SIGNAL = 1;
  if (opts.emissive) defines.EMISSIVE = 1;
  const mat = paintMaterial({
    defines,
    uniforms: { uEmissive: { value: opts.emissive ?? new THREE.Color(0) }, uEmNight: { value: opts.emissiveNight ? 1 : 0 }, uCrown: { value: new THREE.Vector2(...(opts.crown ?? [3, 0])) }, uWashAt: { value: new THREE.Vector4(0, 0, 0, -1) }, uWash: { value: new THREE.Vector4(0, 1, 0, 0) }, uExposure: { value: 0.92 }, ...(opts.fade ? { uFade: { value: new THREE.Vector4(6, 0, 0, 0) } } : {}), uTreeLod: TREE_LOD_U, uTreeMask: TREE_MASK_U },
    vertex: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying float vAO;
      varying float vLeafy;
      varying float vTree;
      varying float vSig;
      uniform vec2 uCrown;
      #ifdef FOLIAGE
      varying vec3 vRimN;
      #endif
      #ifdef SIGNAL
      ${SIGNAL_GLSL}
      #endif
      #ifdef FADE
      attribute vec4 aFade;
      uniform vec4 uFade;
      flat varying float vFade;
      #endif
      #ifdef TREE_LOD
      uniform vec4 uTreeLod, uTreeMask;
      flat varying float vLodFar;
      flat varying float vMaskOut;
      ${GLSL_TREE_LOD}
      #if TREE_LOD == 1
      attribute float aNear;
      #endif
      #endif
      void main() {
        #ifdef FADE
          float fd = length(cameraPosition - (modelMatrix * vec4(aFade.xyz, 1.0)).xyz);
          vFade = aFade.w < 0.0 ? 1.0 : clamp((aFade.w + uFade.x * 0.5 - fd) / uFade.x, 0.0, 1.0);
          if (uFade.y > 0.5) vFade = uFade.y > 1.5 ? 1.0 : 0.0;
        #endif
        vec3 p = position;
        vAO = 1.0;
        vSig = 0.0;
        vLeafy = 0.0;
        vLocal = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #ifdef TREE_LOD
          // the hand-over between a tree's two models, by its foot's distance from the eye
          #if TREE_LOD == 1
            vLodFar = treeFarShare(length(cameraPosition - origin), uTreeLod, aNear);
            if (vLodFar <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; } // (the near model has it all)
          #else
            vLodFar = treeFarShare(length(cameraPosition - origin), uTreeLod, 1.0);
            if (vLodFar >= 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
          #endif
          vMaskOut = uTreeMask.w > 0.5 && length(origin.xz + uWorldOffset.xz - uTreeMask.xy) > uTreeMask.z ? 1.0 : 0.0;
        #endif
        vTree = fract(sin(dot(origin.xz + uWorldOffset.xz, vec2(12.9898, 78.233))) * 43758.5453);
        #ifdef WIND
          float sway = max(p.y - 1.5, 0.0) * 0.012 * (0.4 + uWind);
          p.x += sin(uTime * 1.3 + origin.x * 0.21 + origin.z * 0.17) * sway;
          p.z += cos(uTime * 1.1 + origin.z * 0.19) * sway * 0.7;
          #ifdef WEEP
            // a willow's curtain: the further down a strand, the more it swings
            float hang = step(0.98, min(color.r, min(color.g, color.b))) * max(0.0, uCrown.x + 0.5 - p.y) * 0.06 * (0.5 + uWind);
            p.x += sin(uTime * 1.7 + origin.x * 0.3 + p.z * 0.8) * hang;
            p.z += cos(uTime * 1.5 + origin.z * 0.3 + p.x * 0.8) * hang * 0.8;
          #endif
        #endif
        #ifdef BOB
          float ph = origin.x * 0.37 + origin.z * 0.23;
          p.y += sin(uTime * 0.9 + ph) * 0.07 * (0.5 + uWind);
        #endif
        vec4 wp = m * vec4(p, 1.0);
        #ifdef BOB
          // gentle roll
          wp.y += sin(uTime * 0.7 + ph * 1.7) * 0.04 * p.x;
        #endif
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * normal);
        #ifdef FOLIAGE
          vRimN = vNormalW; // (the lobe's own normal, before the crown's light field bends it)
          float leafy = step(0.98, min(color.r, min(color.g, color.b)));
          if (uCrown.y > 0.0) {
            // one spherical light field per crown (slightly flattened), foliage only
            vec3 cN = normalize(mat3(m) * ((position - vec3(0.0, uCrown.x, 0.0)) * vec3(1.0, 1.4, 1.0)));
            vNormalW = normalize(mix(vNormalW, cN, 0.75 * leafy));
            vAO = mix(1.0, mix(0.55, 1.0, smoothstep(uCrown.x - uCrown.y, uCrown.x + 0.3 * uCrown.y, position.y)), leafy);
            vLeafy = leafy;
          } else {
            // soft, rounded shading: bend normals toward the blob's outward direction
            vNormalW = normalize(mix(vNormalW, normalize(wp.xyz - origin - vec3(0.0, 3.0, 0.0)), 0.6));
          }
        #endif
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          // instance colour tints only the white-painted parts (foliage, hulls); trunks keep their brown
          float tintable = step(0.98, min(color.r, min(color.g, color.b)));
          vColor = mix(color, color * instanceColor, tintable);
          #ifdef SIGNAL
            // which lens is this vertex (1 red, 2 amber, 3 green), and is it the one lit now
            float lens = color.r > 2.0 * color.g && color.r > 2.0 * color.b ? 1.0
              : color.r > color.g && color.g > 1.5 * color.b && color.g > 0.25 ? 2.0
              : color.g > 1.3 * color.r && color.g > 1.1 * color.b ? 3.0 : 0.0;
            float st = signalState(instanceColor.g > 0.5 ? 1.0 : 0.0, uTime, instanceColor.r);
            vSig = lens < 0.5 ? 0.0 : (abs(lens - (3.0 - st)) < 0.5 ? 1.0 : 0.5);
            vColor = color;
          #endif
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uEmissive;
      uniform float uEmNight;
      uniform vec4 uWashAt, uWash;
      uniform float uExposure;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying float vAO;
      varying float vLeafy;
      varying float vTree;
      varying float vSig;
      uniform vec2 uCrown;
      #ifdef PAVED
      uniform vec4 uDetailBox;
      #endif
      #ifdef FOLIAGE
      varying vec3 vRimN;
      #endif
      #ifdef FADE
      flat varying float vFade;
      #endif
      #ifdef TREE_LOD
      uniform vec4 uTreeMask;
      flat varying float vLodFar;
      flat varying float vMaskOut;
      #endif
      void main() {
        #ifdef FADE
          if (dither4(gl_FragCoord.xy) >= vFade) discard; // (its impostor card draws the rest)
        #endif
        #ifdef TREE_LOD
          // one dither, split: the far crown where it's under the far share, the near tree the rest
          #if TREE_LOD == 1
            if (dither4(gl_FragCoord.xy) >= vLodFar) discard;
          #else
            if (dither4(gl_FragCoord.xy) < vLodFar) discard;
            if (uTreeMask.w > 0.5) { if (vMaskOut > 0.5) discard; gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
          #endif
        #endif
        #ifdef FOLIAGE
          // A crown seen from 5–10 m: each low-poly lobe's rim breaks into leaf-sized bites and
          // holes where it turns away from the eye, so the outline is a ragged edge of leaves, not
          // a cut facet (and never sky through its heart — only the grazing rim thins). Near only:
          // far off it would shimmer, and a far crown's outline is small anyway.
          if (vLeafy > 0.5) {
            vec3 eye = cameraPosition + uWorldOffset - vWorldPos;
            float dEye = length(eye), nearF = 1.0 - smoothstep(22.0, 45.0, dEye);
            if (nearF > 0.0) {
              vec3 rn = normalize(vRimN);
              float rim = 1.0 - abs(dot(rn, eye / max(dEye, 1e-3)));
              float bite = vnoise3(vWorldPos * 3.1) * 0.65 + vnoise3(vWorldPos * 7.7 + 5.0) * 0.35;
              // (the sides of a lobe only: a spruce's flat whorls seen level are all grazing top and
              // underside, and bitten there they thinned to plates on a pole)
              float side = smoothstep(0.05, 0.45, 1.0 - abs(rn.y));
              if (rim > 0.5 && bite < (rim - 0.5) * 1.7 * nearF * side) discard;
            }
          }
        #endif
        #ifdef PAVED
          // near the walker the painted ground carries the street (lanes, kerbs, sidewalks,
          // crossings, all exactly on the ground): the far ribbon steps aside, dissolving across
          // the painted window's rim as the paint fades in (the ground shader's own ramp)
          vec2 ud = (vWorldPos.xz - uDetailBox.xy) * uDetailBox.zw;
          vec2 ue = min(ud, 1.0 - ud);
          if (smoothstep(0.0, 0.08, min(ue.x, ue.y)) > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
        #endif
        vec3 N = normalize(vNormalW);
        vec3 alb = vColor;
        #ifdef SIGNAL
          if (vSig > 0.25) alb = vSig > 0.75 ? min(vec3(1.0), vColor * 1.8 + 0.08) : vColor * 0.2; // a dark lens is near black
        #endif
        #ifdef FOLIAGE
          alb *= 0.72 + 0.5 * fbm3(vWorldPos * 0.9);
          #ifdef TREE_LOD
          #if TREE_LOD == 2
            // a near tree's bark: furrows running up the wood (in its own frame, so they stay on it as
            // it sways), under a pixel by the hand-over
            alb *= 0.74 + 0.36 * smoothstep(0.2, 0.8, vnoise3(vLocal * vec3(7.0, 0.8, 7.0)));
          #endif
          #endif
          // moss on the bark, as damp as the region (uMoss): it takes the trunk's foot and the sides
          // that face up and north first (the wet, shaded sides), in patches, and in the westside
          // Northwest wraps whole trunks and limbs (a tree's wood only: its crown field is set)
          if (uMoss > 0.0 && uCrown.y > 0.0 && vLeafy < 0.5) {
            float wet = clamp(0.5 * N.y + 0.35 * max(0.0, -N.z) + 0.4 * (1.0 - smoothstep(0.5, 5.0, vLocal.y)) + 0.1, 0.0, 1.0);
            float patchy = vnoise3(vWorldPos * 1.7) * 0.6 + vnoise3(vWorldPos * 5.3 + 3.0) * 0.4;
            float cover = smoothstep(0.6, 0.75, patchy * 0.55 + wet * uMoss * 0.6 + 0.12 * uMoss);
            vec3 moss = mix(vec3(0.075, 0.11, 0.025), vec3(0.15, 0.18, 0.045), vnoise3(vWorldPos * 3.1)); // (a deep olive, never lime)
            alb = mix(alb, moss, cover);
          }
        #endif
        #ifdef DECID
          if (vLeafy > 0.5) {
            // leaves go clump by clump (each tree on its own schedule), the last ones thin and high
            float clump = vnoise3(vWorldPos * 1.1) * 0.75 + vTree * 0.25;
            if (clump < uLeafFall * 1.05 - 0.02) discard;
            // autumn: each tree its own colour — yellow, orange, red — mixed through the crown
            #if FALL_HUE == 1
              vec3 fall = vTree < 0.55 ? vec3(0.76, 0.13, 0.06) : vec3(0.86, 0.36, 0.05); // maple scarlet / flame
              fall = mix(fall, vec3(0.9, 0.55, 0.1), 0.3 * vnoise3(vWorldPos * 0.7));
            #elif FALL_HUE == 2
              vec3 fall = mix(vec3(0.88, 0.7, 0.14), vec3(0.74, 0.52, 0.08), vTree); // gold
              fall = mix(fall, vec3(0.62, 0.62, 0.2), 0.25 * vnoise3(vWorldPos * 0.7));
            #elif FALL_HUE == 3
              vec3 fall = mix(vec3(0.36, 0.38, 0.12), vec3(0.42, 0.32, 0.12), vTree); // drab: the alder's leaves drop near green
            #else
              vec3 fall = vTree < 0.4 ? vec3(0.78, 0.55, 0.08) : vTree < 0.75 ? vec3(0.8, 0.3, 0.06) : vec3(0.6, 0.1, 0.07);
              fall = mix(fall, vec3(0.72, 0.5, 0.1), 0.35 * vnoise3(vWorldPos * 0.7));
            #endif
            // …each on its own schedule: a few early maples by late September, the last oaks into
            // November (uTurn: the season's progress, never going back), and a crown from its sunlit
            // top and outside inward — never every tree faintly tinted at once
            float onset = vTree * 0.85;
            #if FALL_HUE == 1
              onset *= 0.7; // (the red and sugar maples lead)
            #endif
            float hi = uCrown.y > 0.0 ? smoothstep(uCrown.x - uCrown.y, uCrown.x + uCrown.y, vLocal.y) : 0.5;
            float turn = smoothstep(onset - 0.02, onset + 0.22, uTurn * 1.25 + 0.14 * (hi - 0.5) + 0.12 * (vnoise3(vWorldPos * 0.8) - 0.5)) * smoothstep(0.0, 0.04, uTurn);
            alb = mix(alb, fall * (0.8 + 0.4 * fbm3(vWorldPos * 0.9)), turn);
          }
        #endif
        #ifdef BLOSSOM
          // spring: the crown a cloud of pink, flecked white, clump by clump
          if (vLeafy > 0.5) alb = mix(alb, mix(vec3(0.96, 0.72, 0.8), vec3(0.98, 0.9, 0.92), vnoise3(vWorldPos * 2.3)) * (0.9 + 0.2 * fbm3(vWorldPos * 1.3)), uBloom * smoothstep(0.2, 0.5, vnoise3(vWorldPos * 1.6) * 0.8 + 0.3));
        #endif
        #ifdef PAVED
          alb = snowOn(alb, N, vWorldPos, snowKeep(alb));
        #else
          alb = snowOn(alb, N, vWorldPos, 0.9); // car roofs, bench seats, conifer tops
        #endif
        alb = pigment(alb, vWorldPos);
        // a crown is shaded by its sphere field + underside AO, not by its own low-poly lobes
        // (their outlines shadowed each other into shards); buildings still shadow it
        float sh = shadowAt(vWorldPos + uKeyDir * uCrown.y * 0.7 * vLeafy, N);
        sh = mix(sh, 1.0, 0.3 * vLeafy);
        vec3 col = paintLight(alb * mix(0.8, 1.0, vAO), N, vWorldPos, sh, vAO);
        #ifdef EMISSIVE
          col += uEmissive * mix(1.0, uLampPower * 3.0, uEmNight);
        #endif
        #ifdef SIGNAL
          if (vSig > 0.75) col += normalize(vColor + 1e-3) * (0.9 + 2.2 * uNight); // the lit lens glows
        #endif
        #ifdef WASH
        {
          // paper until the wash arrives: the lit side left white, the side away from the light a
          // pale grey hatched in the thing's own frame (the strokes stay on it as you walk round)
          float dW = length(vWorldPos - uWashAt.xyz);
          float jag = (vnoise3(vWorldPos * 1.9) - 0.5) * 0.8 + (vnoise3(vWorldPos * 6.3 + 3.0) - 0.5) * 0.3;
          float front = uWashAt.w + jag * clamp(uWashAt.w, 0.0, 1.0);
          float lam = clamp(dot(N, uKeyDir), 0.0, 1.0);
          float shade = max(smoothstep(0.6, 0.05, lam), 1.0 - sh);
          // strokes a hand would make: one set of diagonals, broken along their length, and a
          // second set across them only in the deepest shade
          float hatch = step(0.7, fract(dot(vLocal, vec3(2.3, 2.9, 1.5)))) * step(0.3, vnoise3(vLocal * vec3(0.8, 5.0, 0.8)));
          float cross = step(0.75, fract(dot(vLocal, vec3(-2.1, 3.1, 1.8)))) * smoothstep(0.3, 0.0, lam);
          float crease = smoothstep(0.2, 0.7, length(fwidth(N)));
          // the strokes are graphite, all but opaque; between them the paper is thin, the painting
          // (paled round it) showing through
          float strokes = clamp(max(0.85 * hatch * shade + 0.6 * cross, 0.6 * crease), 0.0, 1.0);
          vec3 paper = mix(vec3(1.0, 0.985, 0.955) * (1.0 - 0.07 * shade), vec3(0.3, 0.295, 0.33), strokes);
          // the wash: wet pigment is darker and richer than it dries, and pools at its edge
          float wet = step(dW, front);
          float pool = wet * (1.0 - smoothstep(0.0, 0.5, front - dW)) * (1.0 - uWash.x);
          vec3 lit = col * mix(0.82, 1.0, uWash.x) * (1.0 - 0.3 * pool);
          vec3 tm = clamp((lit * uExposure * (2.51 * lit * uExposure + 0.03)) / (lit * uExposure * (2.43 * lit * uExposure + 0.59) + 0.14), 0.0, 1.0);
          vec3 ws = mix(tm * 12.92, 1.055 * pow(max(tm, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, tm));
          ws = clamp(mix(vec3(dot(ws, vec3(0.299, 0.587, 0.114))), ws, mix(1.45, 1.1, uWash.x)), 0.0, 1.0);
          // translucent paper; the wash all but opaque (+ 2: wet, it bleeds past the line)
          float a = mix(mix(0.4, 0.88, strokes), 0.95, wet) * uWash.y;
          gl_FragColor = vec4(mix(paper, ws, wet), a + 2.0 * wet * step(uWash.x, 0.98));
          return;
        }
        #endif
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
  if (opts.paved) {
    // the far ribbons lie 6 cm over the ground: a kilometre out that is under one step of the depth
    // buffer, and ground and street would flicker through each other — pull the street forward a
    // few steps (constant in depth units, so metres far away and a hair up close)
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
  }
  return mat;
}

// Merge simple geometries after baking a per-geometry vertex color.
export function colored(g: THREE.BufferGeometry, hex: number) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}
