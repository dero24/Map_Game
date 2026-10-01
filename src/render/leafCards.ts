// Leaf cards: the crowns of the near trees (world/nearTrees.ts), every card of every near tree in
// one instanced draw.
//
// A card is a quad turned square to the eye through the middle of one of the crown's leaf clusters
// (assets/flora.ts nearTreeGeometry), showing one of the leaf pictures (flora.ts leafAtlas) — sprays
// of leaves on their twigs, cut out leaf by leaf (alpha-tested), so the crown's outline is leaves
// and the sky shows between them. It is lit the way the far crown is (propMaterial's foliage): by
// one sphere field per crown — the crown's own middle and radius — not by the card, with a little
// of the cluster's own roundness mixed in, the crown's underside and heart darker, the same
// instance green, pigment, snow, autumn turn, leaf fall and blossom, the same sun and shadows. The
// far crown and its near cards so read as one tree where they hand over (TREE_LOD_U: the same
// ordered dither, split by the same sum).
//
// Per card (instanced): aC (middle, region frame; half its width, m) · aD (height : width, turn in
// the picture plane 0–1, picture, depth in the crown 0 rim … 1 heart) · aT (the tree's foot, region
// frame; its sway at the card's height) · aK (the crown's middle, region frame; its radius) · aE
// (the tree's green, linear; flags: 1 broadleaf that falls, + 2 × fall hue, + 8 blossom).
import * as THREE from 'three';
import { paintMaterial } from './shared';
import { TREE_LOD_U, TREE_MASK_U } from './propMaterial';
import { LEAF_PICS } from '../assets/flora';

export const CARD_ATTRS = ['aC', 'aD', 'aT', 'aK', 'aE'] as const;

/** The cards' geometry: one quad, drawn `instanceCount` times. Its corners ride in `aCorner`; the
 *  position attribute folds every corner to one point far below the ground, so a pass that swaps
 *  in its own material (the id pass, a shadow pass) draws nothing of it. */
export function leafCardGeometry(cap: number) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1e5, 0, 0, -1e5, 0, 0, -1e5, 0, 0, -1e5, 0], 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const a of CARD_ATTRS) g.setAttribute(a, new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  return g;
}

/** The leaf pictures as a texture (flora.ts leafAtlas's bytes), mipmapped. */
export function leafTexture(data: Uint8Array, w: number, h: number) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export function leafCardMaterial(tex: THREE.Texture) {
  const cols = 4, rows = Math.ceil(LEAF_PICS / 4);
  return paintMaterial({
    uniforms: { uLeaf: { value: tex }, uLeafW: { value: (tex.image as { width: number }).width }, uTreeLod: TREE_LOD_U, uTreeMask: TREE_MASK_U },
    vertex: /* glsl */ `
      attribute vec2 aCorner;
      attribute vec4 aC, aD, aT, aK, aE;
      uniform vec4 uTreeLod, uTreeMask;
      varying vec2 vUv;
      varying vec2 vQ;
      flat varying vec4 vInfo;  // far share, depth in the crown, flags, the tree's own number (0–1)
      flat varying vec4 vCrown; // the crown's middle (region frame) and radius
      flat varying vec3 vTint;
      flat varying vec3 vRight, vUp, vToCam;
      flat varying float vCut;
      void main() {
        vec3 foot = (modelMatrix * vec4(aT.xyz, 1.0)).xyz; // (render frame)
        float far = 1.0;
        {
          // (the far crown's share: propMaterial's treeFarShare)
          float d = length(cameraPosition - foot);
          far = uTreeLod.z > 0.5 ? (uTreeLod.z > 1.5 ? 0.0 : 1.0) : clamp((d - uTreeLod.x + uTreeLod.y * 0.5) / max(uTreeLod.y, 1e-3), 0.0, 1.0);
        }
        bool masked = uTreeMask.w > 0.5 && length(aT.xz - uTreeMask.xy) > uTreeMask.z;
        if (far >= 1.0 || masked) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec3 c = (modelMatrix * vec4(aC.xyz, 1.0)).xyz;
        // the far crown's sway at the card's height (propMaterial WIND), and its own flutter
        float sway = aT.w * (0.4 + uWind);
        c.x += sin(uTime * 1.3 + foot.x * 0.21 + foot.z * 0.17) * sway;
        c.z += cos(uTime * 1.1 + foot.z * 0.19) * sway * 0.7;
        vec3 toCam = cameraPosition - c;
        float dc = length(toCam);
        toCam /= max(dc, 1e-4);
        // the card stands at the front of its cluster, not through its middle (the limbs inside a
        // cluster go behind its leaves), drawn as large as it looked from the middle
        float push = min(aC.w * 0.45, dc * 0.5), size = aC.w * (dc - push) / max(dc, 1e-3);
        c += toCam * push;
        vec3 right = cross(vec3(0.0, 1.0, 0.0), toCam);
        right = dot(right, right) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(right);
        vec3 up = cross(toCam, right);
        // each card turned a little (never so far its leaves' lit sides face down) and every other one
        // mirrored, so the few pictures don't repeat; and rocking a little in the wind
        float ang = (fract(aD.y * 2.0) - 0.5) * 0.9 + sin(uTime * 1.9 + aD.y * 37.0 + foot.x * 0.7) * 0.06 * (0.3 + uWind);
        float cs = cos(ang), sn = sin(ang);
        vec2 k = vec2(aD.y > 0.5 ? -aCorner.x : aCorner.x, aCorner.y);
        vec2 q = vec2(k.x * cs - k.y * sn, k.x * sn + k.y * cs);
        vec3 wp = c + (right * q.x + up * q.y * aD.x) * size;
        vWorldPos = wp + uWorldOffset;
        vNormalW = toCam;
        // the picture: its cell of the atlas (the texture rides with the card's turn)
        float pic = aD.z;
        vec2 cell = vec2(mod(pic, ${cols}.0), floor(pic / ${cols}.0));
        vUv = (cell + aCorner * 0.5 + 0.5) / vec2(${cols}.0, ${rows}.0);
        vQ = q / max(1.0, length(q));
        vRight = right; vUp = up; vToCam = toCam;
        vInfo = vec4(far, aD.w, aE.w, fract(sin(dot(foot.xz + uWorldOffset.xz, vec2(12.9898, 78.233))) * 43758.5453));
        vCrown = vec4(aK.xyz, aK.w);
        vTint = aE.rgb;
        // a card the eye is inside of (walking under a low crown) melts away rather than fill the view
        vCut = clamp((dc / max(aC.w, 0.1) - 0.45) / 0.7, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragment: /* glsl */ `
      uniform sampler2D uLeaf;
      uniform float uLeafW;
      uniform vec4 uTreeMask;
      varying vec2 vUv;
      varying vec2 vQ;
      flat varying vec4 vInfo;
      flat varying vec4 vCrown;
      flat varying vec3 vTint;
      flat varying vec3 vRight, vUp, vToCam;
      flat varying float vCut;
      void main() {
        float dth = dither4(gl_FragCoord.xy);
        if (dth < vInfo.x) discard; // (the far crown draws these pixels)
        if (dither4(gl_FragCoord.xy + vec2(2.0, 1.0)) >= vCut) discard;
        vec4 t = texture2D(uLeaf, vUv);
        // the cut-out: a leaf's edge kept where the picture is sharp, and the threshold eased as it
        // shrinks (its mips average each leaf into its gaps, and the crown would thin to nothing)
        float lod = log2(max(1.0, max(length(dFdx(vUv)), length(dFdy(vUv))) * uLeafW));
        if (t.a < mix(0.5, 0.35, clamp(lod / 3.0, 0.0, 1.0))) discard;
        if (uTreeMask.w > 0.5) { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); return; }
        float flags = vInfo.z;
        float falls = mod(flags, 2.0), hue = mod(floor(flags / 2.0), 4.0), bloom = floor(flags / 8.0);
        float vTree = vInfo.w;
        bool twig = t.g < 0.5;
        if (!twig && falls > 0.5) {
          // leaves go clump by clump as the far crown's do (each tree on its own schedule) — and
          // here leaf by leaf within the clump
          float clump = mix(vnoise3(vWorldPos * 1.1), t.b, 0.45) * 0.75 + vTree * 0.25;
          if (clump < uLeafFall * 1.05 - 0.02) discard;
        }
        // the crown's light field: its own sphere (flattened as the far crown's), a little of the
        // cluster's roundness on top
        vec3 cN = normalize((vWorldPos - vCrown.xyz) * vec3(1.0, 1.4, 1.0));
        vec3 bulge = normalize(vRight * vQ.x + vUp * vQ.y + vToCam * sqrt(max(0.0, 1.0 - dot(vQ, vQ))));
        vec3 N = normalize(mix(cN, bulge, 0.3));
        vec3 alb = twig ? vec3(0.15, 0.105, 0.068) * (0.9 + 0.4 * t.r) : vTint * (0.48 + 0.75 * t.r); // (twigs: the bark's brown)
        alb *= 0.72 + 0.5 * fbm3(vWorldPos * 0.9);
        // underside and heart in shade (the far crown's underside AO, and deeper toward the middle)
        float ao = mix(0.55, 1.0, smoothstep(vCrown.y - vCrown.w, vCrown.y + 0.3 * vCrown.w, vWorldPos.y));
        ao *= 1.0 - 0.35 * smoothstep(0.35, 1.0, vInfo.y); // (the rim's cards as lit as the far crown's skin)
        if (!twig && falls > 0.5) {
          vec3 fall;
          if (hue > 1.5) {
            fall = mix(vec3(0.88, 0.7, 0.14), vec3(0.74, 0.52, 0.08), vTree);
            fall = mix(fall, vec3(0.62, 0.62, 0.2), 0.25 * vnoise3(vWorldPos * 0.7));
          } else if (hue > 0.5) {
            fall = vTree < 0.55 ? vec3(0.76, 0.13, 0.06) : vec3(0.86, 0.36, 0.05);
            fall = mix(fall, vec3(0.9, 0.55, 0.1), 0.3 * vnoise3(vWorldPos * 0.7));
          } else {
            fall = vTree < 0.4 ? vec3(0.78, 0.55, 0.08) : vTree < 0.75 ? vec3(0.8, 0.3, 0.06) : vec3(0.6, 0.1, 0.07);
            fall = mix(fall, vec3(0.72, 0.5, 0.1), 0.35 * vnoise3(vWorldPos * 0.7));
          }
          float onset = vTree * 0.85 * (hue > 0.5 && hue < 1.5 ? 0.7 : 1.0);
          float hi = smoothstep(vCrown.y - vCrown.w, vCrown.y + vCrown.w, vWorldPos.y);
          float turn = smoothstep(onset - 0.02, onset + 0.22, uTurn * 1.25 + 0.14 * (hi - 0.5) + 0.12 * (vnoise3(vWorldPos * 0.8) - 0.5) + 0.08 * (t.b - 0.5)) * smoothstep(0.0, 0.04, uTurn);
          alb = mix(alb, fall * (0.8 + 0.4 * fbm3(vWorldPos * 0.9)) * (0.6 + 0.55 * t.r), turn);
        }
        if (!twig && bloom > 0.5)
          alb = mix(alb, mix(vec3(0.96, 0.72, 0.8), vec3(0.98, 0.9, 0.92), vnoise3(vWorldPos * 2.3)) * (0.9 + 0.2 * fbm3(vWorldPos * 1.3)), uBloom * smoothstep(0.2, 0.5, vnoise3(vWorldPos * 1.6) * 0.8 + 0.3));
        alb = snowOn(alb, N, vWorldPos, 0.9);
        alb = pigment(alb, vWorldPos);
        // the shadow map holds the far crown's solid ball: look it up from where the sun's ray leaves
        // this crown, so only buildings and other trees shade it (its own shading is the field's)
        vec3 rel = vWorldPos - vCrown.xyz;
        float b = dot(rel, uKeyDir), cc = dot(rel, rel) - vCrown.w * vCrown.w;
        float exitD = max(0.0, -b + sqrt(max(0.0, b * b - cc))) + 0.3;
        float sh = mix(shadowAt(vWorldPos + uKeyDir * exitD, N), 1.0, 0.3);
        vec3 col = paintLight(alb * mix(0.8, 1.0, ao), N, vWorldPos, sh, ao);
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}
