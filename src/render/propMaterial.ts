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
// fallHue: how a tree turns (flora.ts FALL_HUE; the sums are treeSeasons.ts fallColour, fallOnset,
// leafDown): 0 each tree its own of yellow / orange / red, 1 the maples' reds, 2 gold, 3 drab, 4 the
// sweetgum's jewels, 5 the buckeye's early orange (and its early fall), 6 russet; 7 an evergreen that
// bronzes in the cold (the redcedar). blossom: what a flowering tree blooms as (flora.ts BLOSSOM_OF: 1
// cherry, 2 dogwood, 3 redbud, 4 crape myrtle, 5 rosebay, 6 manzanita; treeSeasons.ts bloomNow / bloomColour /
// bloomCover) — the spring's flowers open on bare twigs, where the leaves aren't out yet. weep: a
// willow's hanging strands swing with the wind.
// wash: a thing being painted in by the brush (ui/brush.ts), drawn in the sketch pass (post.ts):
// translucent paper, hatched, until the wash reaches it — uWashAt = (world x, y, z of the first
// touch, the wash's radius in m; < 0 all paper); uWash = (dry: 0 wet → 1 dry, opacity, -, -).
// It writes display colour and coverage (+ 2 where the paint is wet) for post.ts to lay over the
// painting; the outline is drawn there, from the pass's depth.
// keep: always painted, never the town's pencil (your van: src/van/) — it writes alpha 0.75, which
// the post's sketch mode leaves alone (render/post.ts).
// fade: the micro layer's near pieces (world/microLayer.ts), merged into one mesh. `aFade` is each
// piece's foot (x, y, z) and where it hands over to its impostor card (m; < 0: it has no card and
// draws whole); across the band uFade.x it gives way pixel by pixel on the ordered dither the cards
// use the other way round (render/impostor.ts), so the two never both draw a pixel, nor leave one.
// uFade.y: 0 by distance, 1 cards only (this draws nothing), 2 never hand over.
// hang: a tree's hangers (assets/hangers.ts): `aHang` = (depth below the anchor — negative: height
// above the limb —, the strand's length, its phase, what it is: 0 a strand, 1 a stiff tuft, 2 a
// resurrection fern frond). A strand swings in the world as a pendulum of its own length, its tip
// most, out of step with its neighbours, a ripple running down it as the wind rises, the curtain
// leaning downwind; it rides its tree's own sway from its anchor. The fern greens and opens with
// uWet and curls brown in a dry spell.
// motion (flora.ts MOTION_OF): 1 an aspen's round leaves trembling on their flat stalks — each leafy
// vertex shivering fast and small, the crown shimmering as the pale undersides flash, more as the wind
// rises; 2 the dogwood's flat tiers bobbing, each on its own beat, the outer ends most; 3 the longleaf's
// long needles tossing in brushes, gust by gust (its grass stage a shivering fountain); 4 a palm's
// fronds thrown about from its crown in a gust and leaning downwind, the tips most (far models only).
// Every tree's bark a shade of its own (its number from where it stands).
// treeLod: a tree's two models (world/nearTrees.ts). 'far' (TREE_LOD 1): a tile's trees, the solid
// lobed crowns — the near-tree layer marks the trees it draws close up (`aNear`, per instance), and
// for those this gives way to the near model across the hand-over band on the same ordered dither
// (and draws nothing at all inside it: the instance folds to a point). 'near' (TREE_LOD 2): the
// near model's limbs, the other side of the same split. A far tree its tile's mid mesh draws (`aLod`,
// per instance: past the mid reach the tile mesh draws every tree from the distant model, and folds
// away the ones within it) draws nothing from the tile mesh. TREE_LOD_U = (hand-over distance, band,
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
export function propMaterial(opts: { wind?: boolean; bob?: boolean; emissive?: THREE.Color; emissiveNight?: boolean; foliage?: boolean; crown?: [number, number]; decid?: boolean; paved?: boolean; signal?: boolean; fallHue?: number; blossom?: number; weep?: boolean; wash?: boolean; fade?: boolean; treeLod?: 'far' | 'near'; hang?: boolean; motion?: number; keep?: boolean } = {}) {
  const defines: Record<string, number> = {};
  if (opts.keep) defines.KEEP = 1;
  if (opts.hang) defines.HANG = 1;
  defines.MOTION = opts.motion ?? 0; // (always defined, as FALL_HUE and BLOSSOM: they're read in #if)
  if (opts.treeLod) defines.TREE_LOD = opts.treeLod === 'far' ? 1 : 2;
  if (opts.fade) defines.FADE = 1;
  if (opts.wash) defines.WASH = 1;
  if (opts.weep) defines.WEEP = 1;
  defines.FALL_HUE = opts.fallHue ?? 0; // (always defined: an undefined macro in #if is a GLSL error)
  defines.BLOSSOM = opts.blossom ?? 0;
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
      #if BLOSSOM >= 7
      varying float vBloomPart;
      #endif
      #ifdef SIGNAL
      ${SIGNAL_GLSL}
      #endif
      #ifdef FADE
      attribute vec4 aFade;
      uniform vec4 uFade;
      flat varying float vFade;
      #endif
      #ifdef HANG
      attribute vec4 aHang;
      uniform float uWet;
      #endif
      #ifdef TREE_LOD
      uniform vec4 uTreeLod, uTreeMask;
      flat varying float vLodFar;
      flat varying float vMaskOut;
      ${GLSL_TREE_LOD}
      #if TREE_LOD == 1
      attribute float aNear;
      attribute float aLod;
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
        #if BLOSSOM >= 7
          vBloomPart = 0.0;
        #endif
        vLocal = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #ifdef TREE_LOD
          // the hand-over between a tree's two models, by its foot's distance from the eye
          #if TREE_LOD == 1
            if (aLod > 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; } // (its tile's mid mesh draws it whole)
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
          #ifdef HANG
            float sway = max(p.y + aHang.x - 1.5, 0.0) * 0.012 * (0.4 + uWind); // (its tree's sway, at the anchor)
            if (aHang.w > 1.5) p.y -= max(-aHang.x, 0.0) * (1.0 - uWet) * 0.6; // (a dry fern's fronds curl down to the bark)
          #else
          float sway = max(p.y - 1.5, 0.0) * 0.012 * (0.4 + uWind);
          #endif
          p.x += sin(uTime * 1.3 + origin.x * 0.21 + origin.z * 0.17) * sway;
          p.z += cos(uTime * 1.1 + origin.z * 0.19) * sway * 0.7;
          #if MOTION > 0
            float leafF = step(0.98, min(color.r, min(color.g, color.b)));
            #if MOTION == 1
              // the aspen's leaves trembling: each leafy vertex shivers along its normal, fast and small
              p += normal * leafF * sin(uTime * 13.0 + dot(position, vec3(4.1, 3.3, 2.7)) + vTree * 31.0) * 0.035 * (0.5 + uWind);
            #elif MOTION == 2
              // the dogwood's tiers bobbing: each flat tier (a metre or so apart) rising and falling on its
              // own beat, its outer ends most
              p.y += leafF * sin(uTime * 1.7 + floor(position.y * 1.1) * 2.3 + vTree * 6.28) * 0.07 * (0.35 + uWind) * clamp(length(position.xz) / 2.2, 0.0, 1.0);
            #elif MOTION == 3
              // the longleaf's needles tossing: each brush thrown about, gust by gust, more as the wind rises
              float tph = dot(position, vec3(3.1, 2.3, 2.9)) + vTree * 23.0, gust = 0.55 + 0.45 * sin(uTime * 0.9 + vTree * 5.0);
              p += (normal * 0.6 + vec3(sin(uTime * 5.1 + tph * 1.3), 0.0, cos(uTime * 4.3 + tph * 1.1)) * 0.5) * leafF * sin(uTime * 6.5 + tph) * 0.06 * (0.3 + uWind) * gust;
            #else
              // a palm's fronds thrown about from its crown, the tips most: leaning downwind (the clouds'
              // way) as the wind rises, and when a gust comes through — each palm its own, out of step with
              // the next — tossing and rattling, bent down by it (far models only: no card has this)
              vec3 hd = position - vec3(0.0, uCrown.x, 0.0);
              float reach = clamp(length(hd) / max(uCrown.y, 0.5), 0.0, 1.4);
              float gph = uTime * 0.55 + vTree * 6.28 + dot(origin.xz, vec2(0.011, 0.017));
              float gust = smoothstep(0.3, 1.0, (0.5 + 0.5 * sin(gph)) * (0.5 + 0.5 * sin(gph * 0.43 + 2.0)) * 1.6);
              float fph = dot(position, vec3(1.7, 0.9, 1.3));
              vec3 dw = normalize(transpose(mat3(m)) * vec3(0.88, 0.0, 0.47));
              float amp = leafF * reach * reach * (0.05 + 0.14 * uWind + 0.4 * gust * (0.3 + uWind));
              p += dw * amp * (0.65 + 0.35 * sin(uTime * 1.9 + fph));
              p += vec3(sin(uTime * 7.3 + fph * 2.0), 0.5 * sin(uTime * 5.9 + fph), cos(uTime * 6.7 + fph * 1.7)) * amp * 0.3 * gust;
              p.y -= amp * 0.35 * gust;
            #endif
          #endif
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
        #ifdef HANG
          if (aHang.w < 0.5 && aHang.y > 0.0) {
            // the strand as a pendulum in the world: its length there (the tree's scale), its own
            // swing (slow for the long ones), out of step with its neighbours and with the next tree's
            float sc = length(m[0].xyz), L = max(aHang.y * sc, 0.2), k = clamp(aHang.x / max(aHang.y, 1e-3), 0.0, 1.0);
            float w = 2.4 / sqrt(L + 0.25), ph = aHang.z + dot(origin.xz + uWorldOffset.xz, vec2(0.37, 0.23));
            float air = 0.3 + 0.7 * uWind, amp = L * (0.045 + 0.14 * uWind) * pow(k, 1.35);
            vec2 sw = vec2(sin(uTime * w + ph), 0.7 * sin(uTime * w * 0.83 + ph * 1.7 + 1.3)) * amp;
            // a ripple running down toward the tip in a gust: the strands twist and part
            sw += vec2(sin(uTime * w * 2.9 - k * 4.0 + ph * 2.3), cos(uTime * w * 2.3 - k * 3.0 + ph * 1.1)) * (0.02 + 0.03 * uWind) * L * k * k * air;
            // the curtain leaning downwind (the clouds' way)
            sw += vec2(0.88, 0.47) * (0.1 * uWind * L * pow(k, 1.6));
            wp.xz += sw;
            wp.y += dot(sw, sw) / (2.0 * L); // (a pendulum's tip rises as it swings out)
          }
        #endif
        #ifdef BOB
          // gentle roll
          wp.y += sin(uTime * 0.7 + ph * 1.7) * 0.04 * p.x;
        #endif
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * normal);
        #ifdef FOLIAGE
          vRimN = vNormalW; // (the lobe's own normal, before the crown's light field bends it)
          float leafy = step(0.98, min(color.r, min(color.g, color.b)));
          #if BLOSSOM >= 7
            // (the desert's flowers and fruit: a part of their own, a hair off white — flora.ts BLOOM_PART)
            vBloomPart = leafy * step(color.b, 0.995);
          #endif
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
          #ifdef HANG
            // the resurrection fern: green within hours of rain, curled grey-brown in a dry spell
            if (aHang.w > 1.5) vColor = mix(vec3(0.36, 0.29, 0.19), vColor, uWet);
          #endif
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
      #if BLOSSOM >= 7
      varying float vBloomPart;
      #endif
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
          // (each tree's bark a shade of its own: a street of one species is never one brown)
          if (uCrown.y > 0.0 && vLeafy < 0.5) alb *= 0.88 + 0.24 * fract(vTree * 13.7);
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
        #if defined(DECID) || BLOSSOM > 0 || FALL_HUE == 7
          #if BLOSSOM >= 7
          if (vBloomPart > 0.5) {
            // the desert's flowers and fruit, parts of their own: out in their season, a few at a time as
            // it comes and goes (each its own number), and not there at all the rest of the year
            float own = fract(vnoise3(vWorldPos * 7.0) * 3.7 + vTree * 1.3) * 0.85 + 0.08;
            float bl = bloomNow(float(BLOSSOM), vTree), fr = fruitNow(float(BLOSSOM), vTree);
            if (bl < own && fr < own) discard;
            alb = (bl >= fr ? bloomColour(float(BLOSSOM), vTree, vWorldPos) : fruitColour(float(BLOSSOM), vTree, vWorldPos)) * (0.9 + 0.2 * fbm3(vWorldPos * 3.0));
          } else
          #endif
          if (vLeafy > 0.5) {
            float hi = uCrown.y > 0.0 ? smoothstep(uCrown.x - uCrown.y, uCrown.x + uCrown.y, vLocal.y) : 0.5;
            float fl = 0.0; // (how much of this is in flower)
            #if BLOSSOM > 0 && BLOSSOM < 7
              fl = bloomNow(float(BLOSSOM), vTree) * bloomCover(float(BLOSSOM), vWorldPos, hi);
            #endif
            #ifdef DECID
              // leaves go clump by clump (each tree on its own schedule), the last ones thin and high —
              // and where the spring's flowers open before the leaves (the redbud's, the dogwood's, the
              // cherry's), the bare twigs carry the flowers
              float clump = vnoise3(vWorldPos * 1.1) * 0.75 + vTree * 0.25;
              bool bare = clump < leafDown(float(FALL_HUE), vTree) * 1.05 - 0.02;
              if (bare && (BLOSSOM == 0 || BLOSSOM > 3 || fl < 0.3)) discard;
              // autumn: each species its own (fallColour) and each tree its own of it, each on its own
              // schedule — a few early maples by late September, the last oaks into November (uTurn: the
              // season's progress, never going back) — and a crown from its sunlit top and outside inward:
              // never every tree faintly tinted at once
              float onset = fallOnset(float(FALL_HUE), vTree);
              float turn = smoothstep(onset - 0.02, onset + 0.22, uTurn * 1.25 + 0.14 * (hi - 0.5) + 0.12 * (vnoise3(vWorldPos * 0.8) - 0.5)) * smoothstep(0.0, 0.04, uTurn);
              alb = mix(alb, fallColour(float(FALL_HUE), vTree, vWorldPos, 0.0) * (0.8 + 0.4 * fbm3(vWorldPos * 0.9)), turn);
              if (bare) fl = 1.0;
            #endif
            #if FALL_HUE == 7
              // an evergreen bronzing in the cold: the redcedar's winter coat, the rosebay's curled leaves
              alb = mix(alb, vec3(0.4, 0.31, 0.16) * (0.85 + 0.3 * vnoise3(vWorldPos * 0.8)), 0.55 * uLeafFall * (0.7 + 0.3 * vTree));
            #endif
            #if BLOSSOM > 0 && BLOSSOM < 7
              alb = mix(alb, bloomColour(float(BLOSSOM), vTree, vWorldPos) * (0.9 + 0.2 * fbm3(vWorldPos * 1.3)), fl);
            #endif
          }
        #endif
        #if MOTION == 1
          // the grove's shimmer: the leaves' pale undersides flashing, patch by patch, as they turn
          if (vLeafy > 0.5) {
            float fl = sin(uTime * 9.0 + dot(vWorldPos, vec3(5.1, 3.7, 4.3)) + vTree * 17.0) * sin(uTime * 5.3 + dot(vWorldPos, vec3(-2.3, 4.1, 3.1)));
            alb = mix(alb, mix(vec3(0.66, 0.72, 0.5), alb * 1.3, 0.5), clamp(fl, 0.0, 1.0) * (0.12 + 0.22 * uWind));
          }
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
        #ifdef KEEP
          gl_FragColor = vec4(applyFog(col, vWorldPos), 0.75); // (always painted: render/post.ts)
        #else
          gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
        #endif
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
