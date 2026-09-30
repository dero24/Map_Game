// Watercolor post pipeline.
//   scene (HDR, + depth) ──► kuwahara (half res, tonemapped)  ─┐
//            └──► down4 ──► blurH ──► blurV (quarter res, HDR) ─┼──► composite (wobble, edge darkening,
//                                                               │     pigment, granulation, ink, glow, paper)
//            depth ─────────────────────────────────────────────┘
import * as THREE from 'three';
import { GLSL_NOISE, U } from './shared';
import { GLSL_PACK_DEPTH, unpackDepth } from './seen';

export const postParams = {
  enabled: true,
  renderScale: 1,
  // the default look is 'watercolor HD' (chosen side by side against the Sep 27 default — kept as
  // the 'classic (Sep 27 default)' preset below — on Tucson's 4th Avenue, morning, golden hour and
  // the horizon): the same wash painted at a finer brush over a sharper frame, a little richer
  kuwaharaRadius: 4,
  kuwaharaSharpness: 10.5,
  exposure: 0.92,
  saturation: 1.16,
  wobble: 0.42,
  edgeDarkening: 0.85,
  pigmentTurbulence: 0.2, // world-anchored + luminance-only (never slides with the camera, never tints white)
  granulation: 0.25,
  paperTexture: 0.52,
  ink: 0.52,
  inkDistance: 350,
  glow: 0.92,
  vignette: 0.45,
  boilFps: 0,
  nightWash: 0.5,
  sketch: false, // paint as you explore (a choice in the panel, off unless picked): unvisited places near you a paler first wash that deepens as you arrive
  // …all the way out (a developer switch, off for now): every place you haven't been — the far
  // distance too — is a pencil underdrawing on paper, and walking paints it in round you
  sketchFar: false,
  sketchReach: 45, // m painted round you on foot (a plane paints wider)
  photoReach: 22000, // m out to which a photo paints what it frames (the far sketch; at most SEEN_REACH)
  paperColor: '#f8f4ea',
  inkColor: '#2e2a3a',
  // resolution: the paint (brush) pass runs at this fraction of the frame (0.5 = the old half-res
  // wash; higher = crisper strokes, same brush size on screen); hiDpi renders at the screen's own
  // pixel density (capped 1.5×) instead of CSS pixels
  paintDetail: 0.82,
  hiDpi: true,
  // colour grade: split-tone shadows/lights toward two hues (the vivid painted-sci-fi look) and a
  // vibrance lift that saturates the dull colours more than the bright ones
  grade: 0.2,
  gradeShadow: '#3f6f8a',
  gradeLight: '#ffcf9a',
  vibrance: 0.2,
  // cleaner looks: `crisp` lays the unbrushed frame back over the paint (0 = all brush, 1 = clean
  // edges and flat colour), `softGlow` blooms the bright sky and sunlit faces into a soft haze
  crisp: 0,
  softGlow: 0,
  // …and `clarity` sharpens the paint's local contrast, `contrast` an S-curve on the whole frame
  clarity: 0,
  contrast: 0,
};

/** Named looks for the panel's Look menu: each is a set of postParams (the rest stay as they are). */
export const LOOKS: Record<string, Partial<typeof postParams>> = {
  // the default as it stood on 2026-09-27, before the look comparisons — kept verbatim so it can
  // always be restored (and 'classic half-res' is the look before the paint-detail knob existed)
  'classic (Sep 27 default)': { kuwaharaRadius: 5, kuwaharaSharpness: 8, exposure: 0.9, saturation: 1.12, wobble: 0.55, edgeDarkening: 0.9, pigmentTurbulence: 0.22, granulation: 0.3, paperTexture: 0.7, ink: 0.55, inkDistance: 350, glow: 0.8, vignette: 0.55, nightWash: 0.55, paintDetail: 0.6, hiDpi: true, renderScale: 1, grade: 0, gradeShadow: '#2f6f8f', gradeLight: '#ffb27a', vibrance: 0, crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  'classic half-res': { kuwaharaRadius: 5, kuwaharaSharpness: 8, exposure: 0.9, saturation: 1.12, wobble: 0.55, edgeDarkening: 0.9, pigmentTurbulence: 0.22, granulation: 0.3, paperTexture: 0.7, ink: 0.55, inkDistance: 350, glow: 0.8, vignette: 0.55, nightWash: 0.55, paintDetail: 0.5, hiDpi: false, renderScale: 1, grade: 0, vibrance: 0, crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  watercolor: { kuwaharaRadius: 5, kuwaharaSharpness: 8, saturation: 1.12, exposure: 0.9, wobble: 0.55, edgeDarkening: 0.9, pigmentTurbulence: 0.22, granulation: 0.3, paperTexture: 0.7, ink: 0.55, glow: 0.8, vignette: 0.55, nightWash: 0.55, paintDetail: 0.6, grade: 0, vibrance: 0, crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  // the candidate default: the watercolor wash painted at a finer brush over a sharper frame, with a
  // touch of the colour-graded vibrance of a painted sci-fi world (teal shade, warm light)
  'watercolor HD': { kuwaharaRadius: 4, kuwaharaSharpness: 10.5, saturation: 1.16, exposure: 0.92, wobble: 0.42, edgeDarkening: 0.85, pigmentTurbulence: 0.2, granulation: 0.25, paperTexture: 0.52, ink: 0.52, glow: 0.92, vignette: 0.45, nightWash: 0.5, paintDetail: 0.82, hiDpi: true, grade: 0.2, vibrance: 0.2, gradeShadow: '#3f6f8a', gradeLight: '#ffcf9a', crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  'fine detail': { kuwaharaRadius: 3.2, kuwaharaSharpness: 12, saturation: 1.12, exposure: 0.92, wobble: 0.35, edgeDarkening: 0.7, pigmentTurbulence: 0.16, granulation: 0.2, paperTexture: 0.45, ink: 0.5, glow: 0.8, vignette: 0.4, nightWash: 0.5, paintDetail: 0.85, grade: 0, vibrance: 0.15, crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  'vivid painted (sci-fi)': { kuwaharaRadius: 3.8, kuwaharaSharpness: 11, saturation: 1.45, exposure: 1.0, wobble: 0.25, edgeDarkening: 0.55, pigmentTurbulence: 0.12, granulation: 0.1, paperTexture: 0.2, ink: 0.32, glow: 1.25, vignette: 0.12, nightWash: 0.35, paintDetail: 0.8, grade: 0.55, vibrance: 0.45, gradeShadow: '#2f6f8f', gradeLight: '#ffb27a', crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  'storybook soft': { kuwaharaRadius: 6.5, kuwaharaSharpness: 6, saturation: 1.0, exposure: 0.95, wobble: 0.9, edgeDarkening: 1.1, pigmentTurbulence: 0.3, granulation: 0.45, paperTexture: 1.0, ink: 0.4, glow: 0.9, vignette: 0.75, nightWash: 0.6, paintDetail: 0.5, grade: 0.15, vibrance: 0, gradeShadow: '#5a6f9a', gradeLight: '#ffd9a0', crisp: 0, softGlow: 0, clarity: 0, contrast: 0 },
  // cleaner, brighter paint (Robby, 2026-09-28, after a painted sci-fi game's clean first look):
  // clear saturated colour, crisp edges, a soft glow in the sky and the sunlit faces, no paper
  'clean vibrant': { kuwaharaRadius: 2.2, kuwaharaSharpness: 12, crisp: 0.6, softGlow: 0.2, clarity: 0.35, contrast: 0.22, saturation: 1.42, vibrance: 0.55, exposure: 1.0, wobble: 0.04, edgeDarkening: 0.25, pigmentTurbulence: 0.04, granulation: 0.02, paperTexture: 0.04, ink: 0.12, inkDistance: 250, glow: 1.1, vignette: 0, nightWash: 0.35, paintDetail: 0.92, hiDpi: true, grade: 0.3, gradeShadow: '#2a7a9e', gradeLight: '#ffd9a8' },
  // watercolor HD, cleaned: the same wash with less paper and grain and a little of the clean frame
  'clean HD': { kuwaharaRadius: 3.4, kuwaharaSharpness: 11, crisp: 0.3, softGlow: 0.1, clarity: 0.2, contrast: 0.08, saturation: 1.2, vibrance: 0.3, exposure: 0.94, wobble: 0.2, edgeDarkening: 0.6, pigmentTurbulence: 0.12, granulation: 0.12, paperTexture: 0.25, ink: 0.42, inkDistance: 350, glow: 1.0, vignette: 0.25, nightWash: 0.45, paintDetail: 0.88, hiDpi: true, grade: 0.25, gradeShadow: '#3f6f8a', gradeLight: '#ffcf9a' },
  // opaque paint: flat, saturated shapes with soft edges, like gouache on a travel poster
  gouache: { kuwaharaRadius: 5.5, kuwaharaSharpness: 16, crisp: 0, softGlow: 0.05, clarity: 0.15, contrast: 0.12, saturation: 1.3, vibrance: 0.35, exposure: 0.96, wobble: 0.12, edgeDarkening: 0.3, pigmentTurbulence: 0.06, granulation: 0.04, paperTexture: 0.28, ink: 0.22, inkDistance: 350, glow: 0.8, vignette: 0.3, nightWash: 0.45, paintDetail: 0.7, hiDpi: true, grade: 0.3, gradeShadow: '#35607a', gradeLight: '#ffc890' },
  // soft pastel light: a dreamy bloom over clean colour
  'dreamy pastel': { kuwaharaRadius: 3, kuwaharaSharpness: 10, crisp: 0.4, softGlow: 0.5, clarity: 0, contrast: 0, saturation: 1.1, vibrance: 0.4, exposure: 1.05, wobble: 0.1, edgeDarkening: 0.35, pigmentTurbulence: 0.06, granulation: 0.04, paperTexture: 0.12, ink: 0.18, inkDistance: 300, glow: 1.2, vignette: 0.12, nightWash: 0.4, paintDetail: 0.9, hiDpi: true, grade: 0.4, gradeShadow: '#6f7fc0', gradeLight: '#ffd0c8' },
};

const TONEMAP = /* glsl */ `
uniform float uExposure;
vec3 tonemap(vec3 c) {
  c *= uExposure;
  // gentle filmic shoulder that keeps washes light and pastel
  vec3 x = max(c, 0.0);
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
`;

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// HDR buffers need a float colour attachment to render into (EXT_color_buffer_half_float, or
// _float, which every WebGL 2 phone we know of has). Without one a half-float target is an
// incomplete framebuffer: every pass would draw nothing and the page stay blank — so fall back to
// 8-bit buffers (highlights clip, the world still shows).
let rtType: THREE.TextureDataType = THREE.HalfFloatType;
const makeRT = (w: number, h: number, depth = false) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: rtType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: depth,
    ...(depth ? { depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) } : {}),
  });

function pass(fragment: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
}

export class WatercolorPost {
  sceneRT: THREE.WebGLRenderTarget;
  private kuwRT: THREE.WebGLRenderTarget;
  private hA: THREE.WebGLRenderTarget;
  private hB: THREE.WebGLRenderTarget;
  private qA: THREE.WebGLRenderTarget;
  private qB: THREE.WebGLRenderTarget;
  // the brush's sketch (ui/brush.ts): drawn in a pass of its own and laid over the painting, so the
  // paint filter never smears its line (made the first time there is one)
  private ghostRT: THREE.WebGLRenderTarget | null = null;
  // what a photo saw (readSeen): the frame's depth, packed small (made the first time)
  private seenRT: THREE.WebGLRenderTarget | null = null;
  private mSeen: THREE.ShaderMaterial | null = null;
  private clearC = new THREE.Color();
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private mKuw: THREE.ShaderMaterial;
  private mDown: THREE.ShaderMaterial;
  private mBlur: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private mCopy: THREE.ShaderMaterial;
  private w = 1;
  private h = 1;

  constructor(private renderer: THREE.WebGLRenderer) {
    const ext = renderer.extensions;
    rtType = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    if (rtType !== THREE.HalfFloatType) console.warn('no float colour buffers on this GPU: painting in 8-bit');
    const rt = makeRT;
    this.sceneRT = rt(4, 4, true);
    this.kuwRT = rt(4, 4);
    this.hA = rt(4, 4);
    this.hB = rt(4, 4);
    this.qA = rt(4, 4);
    this.qB = rt(4, 4);

    this.mKuw = pass(
      /* glsl */ `
      ${TONEMAP}
      uniform sampler2D tColor, tDepth;
      uniform vec2 uTexel;
      uniform float uRadius, uQ, uNear, uFar;
      varying vec2 vUv;
      #define MAXR 7
      float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      void main() {
        vec4 m[8]; vec3 s[8];
        for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
        // depth-adaptive: keep detail at the focal distance (clapboard, sash bars, furniture),
        // broad washes behind it; foliage (scene alpha 0) a little crisper so blades don't boil
        vec4 c0 = textureLod(tColor, vUv, 0.0);
        float rad = uRadius * mix(0.4, 1.0, smoothstep(4.0, 45.0, linZ(textureLod(tDepth, vUv, 0.0).r)));
        if (c0.a < 0.5) rad *= 0.6;
        rad = max(rad, 1.25);
        float zeta = 2.0 / rad;
        float zc = 0.58;
        float sinz = sin(zc);
        float eta = (zeta + cos(zc)) / (sinz * sinz);
        float w[8];
        int R = min(int(ceil(rad)), MAXR);
        for (int j = -R; j <= R; j++) {
          for (int i = -R; i <= R; i++) {
            vec2 v = vec2(float(i), float(j)) / rad;
            if (dot(v, v) > 1.0) continue;
            vec3 c = tonemap(textureLod(tColor, vUv + vec2(float(i), float(j)) * uTexel, 0.0).rgb);
            float sum = 0.0, z, vxx, vyy;
            vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
            z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
            z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
            z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
            z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
            vec2 r = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
            vxx = zeta - eta * r.x * r.x; vyy = zeta - eta * r.y * r.y;
            z = max(0.0, r.y + vxx); w[1] = z * z; sum += w[1];
            z = max(0.0, -r.x + vyy); w[3] = z * z; sum += w[3];
            z = max(0.0, -r.y + vxx); w[5] = z * z; sum += w[5];
            z = max(0.0, r.x + vyy); w[7] = z * z; sum += w[7];
            float g = exp(-3.125 * dot(v, v)) / max(sum, 1e-5);
            for (int k = 0; k < 8; k++) { float wk = w[k] * g; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
          }
        }
        vec4 o = vec4(0.0), all = vec4(0.0);
        for (int k = 0; k < 8; k++) {
          if (m[k].w <= 0.0) continue;
          all += m[k];
          vec3 mean = m[k].rgb / m[k].w;
          vec3 var = abs(s[k] / m[k].w - mean * mean);
          float sig = var.r + var.g + var.b;
          float wk = 1.0 / (1.0 + pow(sig * 1000.0, 0.5 * uQ));
          o += vec4(mean * wk, wk);
        }
        // Every sector busy (the sun's glitter on the sea: bright dashes all round) leaves weights
        // near 1e-13 — a floor under the divisor painted those pixels black, a cloud of dark flecks
        // over the bay. Divide by the true sum; with no weight left at all, the plain mean.
        gl_FragColor = vec4(o.w > 1e-30 ? o.rgb / o.w : all.rgb / max(all.w, 1e-5), 1.0);
      }`,
      { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 5 }, uQ: { value: 8 }, uExposure: { value: 1 }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
    );

    this.mDown = pass(
      /* glsl */ `
      uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(min(c * 0.25, vec3(40.0)), 1.0);
      }`,
      { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } },
    );

    this.mBlur = pass(
      /* glsl */ `
      uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 0.227027;
        c += (texture2D(tColor, vUv + uDir * 1.3846).rgb + texture2D(tColor, vUv - uDir * 1.3846).rgb) * 0.3162162;
        c += (texture2D(tColor, vUv + uDir * 3.2308).rgb + texture2D(tColor, vUv - uDir * 3.2308).rgb) * 0.0702703;
        gl_FragColor = vec4(c, 1.0);
      }`,
      { tColor: { value: null }, uDir: { value: new THREE.Vector2() } },
    );

    this.mComp = pass(
      /* glsl */ `
      ${TONEMAP}
      ${GLSL_NOISE}
      uniform sampler2D tPaint, tBlur, tDepth, tScene, tEdge;
      uniform vec2 uRes, uNoiseOffset;
      uniform float uNear, uFar, uTime, uBoil;
      uniform float uWobble, uEdgeDark, uTurb, uGran, uPaper, uInk, uInkDist, uGlow, uVignette, uSat, uNightWash, uNight, uVibrance, uGrade;
      uniform vec3 uPaperColor, uInkColor, uNightTint, uWarm, uGradeShadow, uGradeLight;
      uniform float uGolden, uRaw;
      uniform sampler2D tExplore, tExploreFar;
      uniform vec4 uExploreBox, uExploreFarBox;
      uniform float uSketch, uSketchFar, uCrisp, uSoftGlow, uClarity, uContrast;
      uniform sampler2D tGhost, tGhostDepth;
      uniform vec4 uGhost, uBrush, uRipple;
      uniform mat4 uInvProj, uCamWorld;
      uniform vec3 uWorldOff;
      varying vec2 vUv;
      // one pencil stroke family (the underdrawing, sketchFar): parallel lines at angle a, spacing sp
      // px, broken into dashes
      float hatch(vec2 q, float a, float sp, float w) {
        vec2 d = vec2(cos(a), sin(a)), t = vec2(-d.y, d.x);
        float s = dot(q, d) + (vnoise(q * 0.015) - 0.5) * 7.0;
        float along = dot(q, t);
        float l = 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.9, abs(fract(s / sp) - 0.5) * sp);
        float dash = smoothstep(0.22, 0.5, vnoise(vec2(along * 0.035, floor(s / sp) * 7.3)));
        return l * dash;
      }
      float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float paperH(vec2 px) {
        float g = vnoise(px * 0.21) * 0.5 + vnoise(px * 0.6 + 7.0) * 0.25 + fbm(px * 0.022) * 0.5;
        float fib = smoothstep(0.62, 0.9, vnoise(vec2(px.x * 0.03, px.y * 0.6) + vec2(px.y * 0.01, 0.0)));
        return clamp(g * 0.85 + fib * 0.12, 0.0, 1.0);
      }
      void main() {
        vec2 uv = vUv;
        vec2 px = uv * uRes;
        float bt = uBoil > 0.0 ? floor(uTime * uBoil) : 0.0;
        vec2 nuv = uv * vec2(uRes.x / uRes.y, 1.0) + uNoiseOffset;
        vec2 wob = (vec2(fbm(nuv * 5.0 + bt * 1.7), fbm(nuv * 5.0 + 5.2 + bt * 1.3)) - 0.5) * uWobble * 7.0 / uRes;
        if (uRaw > 0.5) { gl_FragColor = vec4(toSrgb(tonemap(texture2D(tScene, uv).rgb)), 1.0); return; }

        vec3 c = texture2D(tPaint, uv + wob).rgb;
        vec3 blurHdr = texture2D(tBlur, uv + wob).rgb;
        vec3 bl = texture2D(tEdge, uv + wob).rgb;
        // pigment pools at the rim of each wash — on the darker (wetter) side of the boundary only
        float lc = dot(c, vec3(0.3, 0.59, 0.11)), lb = dot(bl, vec3(0.3, 0.59, 0.11));
        float edge = length(c - bl) * smoothstep(-0.01, 0.04, lb - lc);
        c *= 1.0 - uEdgeDark * smoothstep(0.02, 0.16, edge) * 0.3;
        c = pow(c, vec3(1.0 + uEdgeDark * smoothstep(0.02, 0.2, edge) * 0.5));
        // masking-fluid highlights: small lights the brush would have smeared away (lit windows, lamps, glints)
        vec3 sc = tonemap(texture2D(tScene, uv + wob * 0.5).rgb);
        float hi = smoothstep(0.08, 0.3, dot(sc - c, vec3(0.33))) * smoothstep(0.5, 0.85, dot(sc, vec3(0.33)));
        c = mix(c, sc, hi);
        // the cleaner looks lay the unbrushed frame back over the paint: crisp edges, flat colour
        c = mix(c, sc, uCrisp);
        // clarity: the paint's local contrast lifted against its own small blur (clean, crisp forms)
        c = max(c + (c - bl) * uClarity, 0.0);
        c = toSrgb(c);
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(lum), c, uSat);
        // vibrance: lift the muted colours more than the already-saturated ones
        float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        c = mix(vec3(lum), c, 1.0 + uVibrance * (1.0 - smoothstep(0.0, 0.5, chroma)));
        // contrast: a gentle S-curve (the cleaner, punchier looks)
        vec3 cc = clamp(c, 0.0, 1.0);
        c = mix(c, cc * cc * (3.0 - 2.0 * cc), uContrast);
        // split-tone grade: cool the shadows, warm the lights (value kept — hue only)
        if (uGrade > 0.001) {
          vec3 tone = mix(uGradeShadow, uGradeLight, smoothstep(0.15, 0.75, lum));
          vec3 g2 = c * tone / max(dot(tone, vec3(0.299, 0.587, 0.114)), 1e-3);
          c = mix(c, g2, uGrade * 0.5);
        }
        c = clamp(c, 0.0, 1.0);

        // where this pixel is in the world (floating origin undone)
        float dS = texture2D(tDepth, uv).r;
        bool geo = dS < 0.99999;
        vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, dS * 2.0 - 1.0, 1.0);
        vec3 wp = (uCamWorld * vec4(vp.xyz / vp.w, 1.0)).xyz + uWorldOff;

        // pigment turbulence (low-frequency density variation) + granulation in paper valleys.
        // Density lives on the subject (world space; walls get variation from height too), so it
        // never slides over the scene as you walk; the sky keeps a view-anchored field. Both only
        // change value, never hue: per-channel (c - c²) turned near-white sand pink and yellow.
        vec2 wq = wp.xz + wp.y * vec2(0.7, -0.5);
        float turb = (geo ? fbm(wq * 0.045) : fbm(nuv * 2.2 + 3.1 + bt * 0.37)) - 0.5;
        float p = paperH(px);
        float L0 = dot(c, vec3(0.299, 0.587, 0.114));
        float dL = (L0 - L0 * L0) * (turb * uTurb * 2.2 + (0.55 - p) * uGran * 1.6);
        c *= clamp((L0 - dL) / max(L0, 1e-3), 0.0, 2.0);

        // paint as you explore: close by, where you haven't walked yet, the colour is still a first,
        // paler wash (a little desaturated, lifted toward the paper); it deepens with a soft wet
        // edge as you arrive. Subtle on purpose — the world always reads as painted, never a sketch.
        float sketchAmt = 0.0;
        if (uSketch > 0.001 && geo && uSketchFar > 0.5) {
          // …all the way out (a developer switch): where you haven't been, at any distance, the page
          // is still a pencil underdrawing; colour blooms in round you as you walk, a wet noisy edge
          // with pigment pooled at its rim. The sky and the far layer (horizon, far skyline) stay
          // painted. Past the fine window (4 km, 8 m) the far one (~32 km, 64 m) says what's painted
          // (R what a photo framed, G the share you walked), blended over the fine one's last
          // ~200 m; inside it, what a photo painted far off shows too.
          vec2 eu = (wp.xz - uExploreBox.xy) * uExploreBox.zw;
          vec2 fu = (wp.xz - uExploreFarBox.xy) * uExploreFarBox.zw;
          vec2 ee = min(eu, 1.0 - eu), fe = min(fu, 1.0 - fu);
          float inFine = smoothstep(0.0, 0.05, min(ee.x, ee.y));
          vec2 ef = min(fe.x, fe.y) > 0.0 ? texture2D(tExploreFar, fu).rg : vec2(0.0);
          float e = max(ef.r, ef.g);
          if (inFine > 0.0) e = mix(e, max(texture2D(tExplore, eu).r, ef.r), inFine);
          // Painting in, in two passes like a painter's: a pale first wash runs over the pencil, then
          // the pigment deepens into it. The edge is ragged by the paper (fbm) and by brush strokes
          // (long, thin noise laid one way); none of that noise reaches bare paper (e = 0) or finished
          // paint (e = 1), so a painted place is always wholly painted.
          float n = fbm(wp.xz * 0.03) - 0.5 + (vnoise(wp.xz * 0.35 + wp.y) - 0.5) * 0.3;
          vec2 sd = vec2(0.8, 0.6);
          float stroke = vnoise(vec2(dot(wp.xz, sd) * 0.09, dot(wp.xz, vec2(-sd.y, sd.x)) * 0.9 + wp.y * 0.3)) - 0.5;
          float v = e + (n * 0.75 + stroke * 0.35) * sin(3.14159 * clamp(e, 0.0, 1.0));
          float wash = smoothstep(0.06, 0.42, v) * uSketch;
          float rev = smoothstep(0.36, 0.88, v);
          sketchAmt = 1.0 - wash;
          float Lw = dot(c, vec3(0.299, 0.587, 0.114));
          vec3 firstWash = mix(mix(vec3(Lw), c, 0.5), vec3(0.965, 0.95, 0.915), 0.22);
          float rim = rev * (1.0 - rev) * 4.0 * uSketch;
          vec3 wet = mix(c, c * c * 1.15, rim * 0.35); // pigment pooled at the wet edge
          vec3 c0 = c; // (the pencil's tones come from the finished colour)
          c = mix(firstWash, wet, rev);
          if (sketchAmt > 0.001) {
            float L = Lw;
            float tone = 1.0 - smoothstep(0.12, 0.92, L);
            vec2 hq = nuv * uRes.y; // view-anchored, like the paper noise
            float g = hatch(hq, 0.8, 6.5, 1.1) * smoothstep(0.3, 0.5, tone);
            g = max(g, hatch(hq, -0.55, 5.5, 1.0) * smoothstep(0.55, 0.72, tone));
            g = max(g, hatch(hq, 0.12, 4.5, 1.0) * smoothstep(0.78, 0.92, tone));
            // distance lightens the drawing (a lighter hand for what's far away)
            g *= (0.55 + 0.45 * p) * (1.0 - 0.55 * smoothstep(250.0, 1400.0, linZ(dS)));
            vec3 graphite = vec3(0.33, 0.32, 0.37);
            vec3 sk = mix(vec3(0.965, 0.95, 0.915), graphite, g * 0.55 + tone * 0.1);
            sk = mix(sk, c0, 0.1); // the faintest colour note, like a first wash
            c = mix(c, sk, sketchAmt);
          }
        } else if (uSketch > 0.001 && geo) {
          vec2 eu = (wp.xz - uExploreBox.xy) * uExploreBox.zw;
          float e = (eu.x > 0.0 && eu.y > 0.0 && eu.x < 1.0 && eu.y < 1.0) ? texture2D(tExplore, eu).r : 0.0;
          float n = fbm(wp.xz * 0.03) - 0.5;
          float rev = smoothstep(0.3, 0.7, e + n * 0.35);
          // Only near you: the bloom is the moment of arriving, so the first wash lives in a ring
          // just past your reveal radius and fades out by ~160 m. Far away the world is always
          // finished watercolour (a paler horizon read as "not loaded"); the atlas map is where
          // unvisited stays pencil.
          float camD = length(wp - (uCamWorld[3].xyz + uWorldOff));
          sketchAmt = (1.0 - rev) * uSketch * (1.0 - smoothstep(60.0, 160.0, camD));
          if (sketchAmt > 0.001) {
            float L = dot(c, vec3(0.299, 0.587, 0.114));
            vec3 first = mix(vec3(L), c, 0.62);             // a first wash: less saturated…
            first = mix(first, vec3(0.965, 0.95, 0.915), 0.14); // …and lighter, more paper showing
            c = mix(c, first, sketchAmt);
          }
        }

        // the brush: the world pales round the sketch — paper readied for the paint…
        if (uBrush.w > 0.001 && geo) {
          float dB = length(wp.xz - uBrush.xy) + (fbm(wp.xz * 0.11) - 0.5) * uBrush.z * 0.4;
          float pb = uBrush.w * (1.0 - smoothstep(uBrush.z * 0.45, uBrush.z, dB));
          float Lb = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c, mix(mix(vec3(Lb), c, 0.4), vec3(0.97, 0.955, 0.925), 0.55), pb);
        }
        // …and a ring runs out across the water as a painted boat settles into it
        if (uRipple.w > 0.001 && geo && abs(wp.y) < 0.35) {
          float dR = length(wp.xz - uRipple.xy);
          float ring = exp(-pow((dR - uRipple.z) / (0.12 * uRipple.z + 0.25), 2.0))
                     + 0.6 * exp(-pow((dR - uRipple.z * 0.6) / (0.1 * uRipple.z + 0.2), 2.0));
          c = mix(c, vec3(0.965, 0.978, 0.985), clamp(ring * uRipple.w * 0.6, 0.0, 0.8));
        }
        // the sketch, and the wash on it, over the painting (tGhost: colour, and coverage + 2 where the
        // paint is wet); fainter wherever something stands in front of it — never lost behind a tree
        float gOcc = 0.0, gHere = 0.0;
        if (uGhost.x > 0.5) {
          vec4 gh = texture2D(tGhost, uv);
          float gD = texture2D(tGhostDepth, uv).r;
          gHere = step(gD, 0.99999);
          gOcc = step(dS + 2e-6, gD) * gHere;
          float wetG = step(1.5, gh.a);
          float aG = (gh.a - 2.0 * wetG) * mix(1.0, 0.6, gOcc);
          // wet paint bleeds a little past the line
          if (wetG < 0.5 && uGhost.z > 0.001) {
            vec3 bc = vec3(0.0);
            float bw = 0.0;
            float ang = vnoise(px * 0.045) * 6.283, rad = uRes.y * (0.006 + 0.01 * vnoise(px * 0.02 + 3.0));
            for (int i = 0; i < 6; i++) {
              float a = ang + float(i) * 1.0472;
              vec4 s = texture2D(tGhost, uv + vec2(cos(a), sin(a)) * rad / uRes);
              float w = step(1.5, s.a);
              bc += s.rgb * w;
              bw += w;
            }
            if (bw > 0.0) c = mix(c, bc / bw, (bw / 6.0) * 0.55 * uGhost.z * (1.0 - aG));
          }
          c = mix(c, gh.rgb, aG);
        }

        // ink: Laplacian of 1/z (zero on planes, spikes at creases and silhouettes), broken and wobbly
        vec2 jit = wob * 1.6 + (vec2(vnoise(px * 0.07 + bt), vnoise(px * 0.07 + 9.0 + bt)) - 0.5) * 1.5 / uRes;
        vec2 o = 1.25 / uRes;
        float d0 = texture2D(tDepth, uv + jit).r;
        float z0 = linZ(d0);
        float w0 = 1.0 / z0;
        float wl = 1.0 / linZ(texture2D(tDepth, uv + jit + vec2(-o.x, 0.0)).r);
        float wr = 1.0 / linZ(texture2D(tDepth, uv + jit + vec2(o.x, 0.0)).r);
        float wd = 1.0 / linZ(texture2D(tDepth, uv + jit + vec2(0.0, -o.y)).r);
        float wu = 1.0 / linZ(texture2D(tDepth, uv + jit + vec2(0.0, o.y)).r);
        float lap = abs(wl + wr + wd + wu - 4.0 * w0) / max(max(max(wl, wr), max(wd, wu)), w0);
        float inkE = smoothstep(0.03, 0.12, lap);
        float lumE = length(texture2D(tPaint, uv + jit + vec2(o.x, 0.0)).rgb - texture2D(tPaint, uv + jit - vec2(o.x, 0.0)).rgb)
                   + length(texture2D(tPaint, uv + jit + vec2(0.0, o.y)).rgb - texture2D(tPaint, uv + jit - vec2(0.0, o.y)).rgb);
        inkE = max(inkE, smoothstep(0.18, 0.45, lumE) * 0.45);
        // foliage (grass writes alpha 0) never gets ink: a thousand outlined blades read as scribble
        float gm = min(min(texture2D(tScene, uv + jit + vec2(-o.x, 0.0)).a, texture2D(tScene, uv + jit + vec2(o.x, 0.0)).a),
                       min(texture2D(tScene, uv + jit + vec2(0.0, -o.y)).a, texture2D(tScene, uv + jit + vec2(0.0, o.y)).a));
        inkE *= smoothstep(0.05, 0.5, min(gm, texture2D(tScene, uv + jit).a));
        float brk = smoothstep(0.25, 0.6, vnoise(px * 0.045 + bt * 3.0));
        float fade = 1.0 - smoothstep(uInkDist * 0.35, uInkDist, z0);
        float bright = smoothstep(0.75, 0.95, dot(c, vec3(0.33)));
        c = mix(c, uInkColor, clamp(inkE * brk * fade * uInk * (1.0 - bright) * (1.0 + sketchAmt * 0.6 * uSketchFar), 0.0, 0.85));

        // the sketch's line: graphite, gone over twice by a quick hand, and it boils — redrawn seven
        // times a second, like a drawing that isn't finished yet
        if (uGhost.x > 0.5 && uGhost.y > 0.001) {
          float gb = floor(uTime * 7.0), line = 0.0, gmin = 1.0;
          for (int k = 0; k < 2; k++) {
            float fk = float(k);
            vec2 gj = (vec2(vnoise(px * 0.03 + gb * 3.7 + fk * 11.0), vnoise(px * 0.03 + 17.0 + gb * 2.9 + fk * 5.0)) - 0.5) * (3.2 + fk * 2.0) / uRes;
            vec2 go = (1.7 + 0.6 * fk) / uRes;
            float g0 = texture2D(tGhostDepth, uv + gj).r;
            float gl0 = texture2D(tGhostDepth, uv + gj + vec2(-go.x, 0.0)).r, gr0 = texture2D(tGhostDepth, uv + gj + vec2(go.x, 0.0)).r;
            float gd0 = texture2D(tGhostDepth, uv + gj + vec2(0.0, -go.y)).r, gu0 = texture2D(tGhostDepth, uv + gj + vec2(0.0, go.y)).r;
            gmin = min(gmin, min(min(g0, gl0), min(min(gr0, gd0), gu0)));
            float q0 = 1.0 / linZ(g0), ql = 1.0 / linZ(gl0), qr = 1.0 / linZ(gr0), qd = 1.0 / linZ(gd0), qu = 1.0 / linZ(gu0);
            float gl = abs(ql + qr + qd + qu - 4.0 * q0) / max(max(max(ql, qr), max(qd, qu)), q0);
            line = max(line, smoothstep(0.03, 0.12, gl) * (1.0 - 0.35 * fk));
          }
          line *= mix(0.6, 1.0, smoothstep(0.25, 0.7, p)); // graphite catches on the paper's tooth
          // behind something: a broken line, so you can still tell where it'll go
          float occL = step(dS + 2e-6, gmin) * step(gmin, 0.99999);
          line *= mix(1.0, 0.85 * step(0.4, fract((px.x + px.y) * 0.08)), occL);
          c = mix(c, vec3(0.2, 0.195, 0.23), clamp(line * uGhost.y, 0.0, 0.95));
        }
        // (harness: uGhost.w shows where the sketch is (red) and where it's hidden (green))
        if (uGhost.w > 0.5) { gl_FragColor = vec4(gHere, gOcc, 0.0, 1.0); return; }

        // wet bloom around lamps and lit windows
        vec3 g = max(blurHdr * uExposure - 1.3, 0.0);
        c += toSrgb(min(g * 0.45, vec3(1.0))) * uGlow * (0.25 + 0.75 * uNight);
        // soft glow (the cleaner looks): a mist over the lights, and the bright sky and sunlit faces
        // bloom a little past their edges
        if (uSoftGlow > 0.001) {
          vec3 bs = toSrgb(tonemap(blurHdr));
          c = mix(c, max(c, bs), uSoftGlow * 0.25);
          vec3 hiG = clamp((bs - 0.55) * 2.2, 0.0, 1.0);
          c = 1.0 - (1.0 - c) * (1.0 - hiG * uSoftGlow * 0.5);
        }

        // glazes: indigo by night, a whisper of warm sienna at golden hour
        // warm light (windows, lamps) is left out of the night glaze, like reserved paper
        // only genuinely bright warm light (windows, lamp hearts) is exempt — a dim amber street keeps its indigo night
        float warmth = smoothstep(0.05, 0.3, c.r - c.b) * smoothstep(0.4, 0.75, dot(c, vec3(0.33)));
        c = mix(c, c * uNightTint, uNightWash * uNight * (1.0 - warmth * 0.85));
        c = mix(c, c * uWarm, uGolden * 0.25);

        // paper: tint, tooth, embossed light
        float pdx = paperH(px + vec2(1.0, 0.0)) - p, pdy = paperH(px + vec2(0.0, 1.0)) - p;
        c *= uPaperColor;
        c *= 1.0 - uPaper * (1.0 - p) * 0.1;
        c += uPaper * (pdx - pdy) * 0.18;

        // unpainted margins with a brushy edge
        vec2 e2 = min(uv, 1.0 - uv) * vec2(uRes.x / uRes.y, 1.0);
        float ed = min(e2.x, e2.y);
        float rag = (fbm(nuv * 7.0 + 2.0) - 0.5) * 0.06 + (vnoise(px * 0.02) - 0.5) * 0.02;
        float wM = 0.012 + 0.05 * uVignette;
        float mask = smoothstep(wM * 0.35, wM, ed + rag * uVignette);
        float corner = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
        mask *= 1.0 - smoothstep(0.7, 1.0, corner + rag) * uVignette;
        mask = uVignette > 0.001 ? mask : 1.0;
        c = mix(uPaperColor * (0.97 + 0.03 * p), c, mask);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
      {
        tPaint: { value: null }, tBlur: { value: null }, tDepth: { value: null }, tScene: { value: null }, tEdge: { value: null },
        uRes: { value: new THREE.Vector2() }, uNoiseOffset: { value: new THREE.Vector2() },
        uNear: { value: 0.1 }, uFar: { value: 1000 }, uTime: { value: 0 }, uBoil: { value: 0 },
        uWobble: { value: 1 }, uEdgeDark: { value: 1 }, uTurb: { value: 0.3 }, uGran: { value: 0.4 }, uPaper: { value: 0.7 },
        uInk: { value: 0.5 }, uInkDist: { value: 300 }, uGlow: { value: 0.8 }, uVignette: { value: 0.5 }, uSat: { value: 1 },
        uNightWash: { value: 0.5 }, uNight: { value: 0 }, uGolden: { value: 0 }, uExposure: { value: 1 }, uRaw: { value: 0 },
        uPaperColor: { value: new THREE.Color() }, uInkColor: { value: new THREE.Color() },
        tExplore: U.uExplore, uExploreBox: U.uExploreBox, tExploreFar: U.uExploreFar, uExploreFarBox: U.uExploreFarBox, uSketch: { value: 0 }, uSketchFar: { value: 0 }, uCrisp: { value: 0 }, uSoftGlow: { value: 0 }, uClarity: { value: 0 }, uContrast: { value: 0 },
        tGhost: { value: null }, tGhostDepth: { value: null }, uGhost: U.uGhost, uBrush: U.uBrush, uRipple: U.uRipple,
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uWorldOff: U.uWorldOffset,
        uNightTint: { value: new THREE.Color(0.55, 0.62, 1.0) }, uWarm: { value: new THREE.Color(1.08, 0.97, 0.86) },
        uVibrance: { value: 0 }, uGrade: { value: 0 }, uGradeShadow: { value: new THREE.Color() }, uGradeLight: { value: new THREE.Color() },
      },
    );
    this.mCopy = pass(
      /* glsl */ `${TONEMAP} uniform sampler2D tColor; varying vec2 vUv;
      vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() { gl_FragColor = vec4(toSrgb(tonemap(texture2D(tColor, vUv).rgb)), 1.0); }`,
      { tColor: { value: null }, uExposure: { value: 1 } },
    );
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mComp);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const s = postParams.renderScale * (postParams.hiDpi ? Math.min(1.5, Math.max(1, globalThis.devicePixelRatio || 1)) : 1);
    const sw = Math.max(4, Math.round(w * s)), sh = Math.max(4, Math.round(h * s));
    this.sceneRT.setSize(sw, sh);
    U.uViewport.value.set(sw, sh);
    const d = Math.max(0.35, Math.min(1, postParams.paintDetail));
    for (const t of [this.kuwRT, this.hA, this.hB]) t.setSize(Math.max(4, Math.round(sw * d)), Math.max(4, Math.round(sh * d)));
    this.qA.setSize(Math.max(4, Math.round(sw / 4)), Math.max(4, Math.round(sh / 4)));
    this.qB.setSize(Math.max(4, Math.round(sw / 4)), Math.max(4, Math.round(sh / 4)));
  }

  private draw(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  /** The frame just drawn as view depths on a small w×h grid (row 0 = the bottom; 0 = sky), for a
   *  photo to paint what it saw (render/seen.ts). One tiny pass packs the depth buffer, then an
   *  async read (no GPU stall). Call right after render(), before the next frame draws. */
  async readSeen(w: number, h: number, near: number, far: number): Promise<Float32Array | null> {
    const r = this.renderer;
    this.mSeen ??= pass(
      /* glsl */ `uniform sampler2D tDepth; uniform float uNear, uFar; varying vec2 vUv;
      ${GLSL_PACK_DEPTH}
      void main() { gl_FragColor = packDepth(texture2D(tDepth, vUv).r); }`,
      { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
    );
    if (!this.seenRT) this.seenRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    else if (this.seenRT.width !== w || this.seenRT.height !== h) this.seenRT.setSize(w, h);
    const u = this.mSeen.uniforms;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uNear.value = near;
    u.uFar.value = far;
    const prev = r.getRenderTarget();
    const px = new Uint8Array(w * h * 4);
    let read: Promise<unknown>;
    try {
      this.draw(this.mSeen, this.seenRT);
      read = r.readRenderTargetPixelsAsync(this.seenRT, 0, 0, w, h, px); // (queued now; resolves in a frame or two)
    } catch { return null; } finally { r.setRenderTarget(prev); }
    try { await read; } catch { return null; }
    return unpackDepth(px, near, far);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, night: number, golden: number, yaw: number, pitch: number, raw = false, overlay: THREE.Object3D | null = null) {
    const P = postParams;
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    const sw = this.sceneRT.width, sh = this.sceneRT.height;
    // the brush's sketch: its own target (colour + depth), cleared to nothing, same camera
    const ghost = !!overlay && P.enabled && !raw;
    U.uGhost.value.x = ghost ? 1 : 0;
    if (ghost) {
      if (!this.ghostRT) this.ghostRT = makeRT(sw, sh, true);
      else if (this.ghostRT.width !== sw || this.ghostRT.height !== sh) this.ghostRT.setSize(sw, sh);
      r.getClearColor(this.clearC);
      const a = r.getClearAlpha();
      r.setRenderTarget(this.ghostRT);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(overlay, camera);
      r.setClearColor(this.clearC, a);
    }

    if (!P.enabled) {
      this.mCopy.uniforms.tColor.value = this.sceneRT.texture;
      this.mCopy.uniforms.uExposure.value = P.exposure;
      this.draw(this.mCopy, null);
      return;
    }
    const k = this.mKuw.uniforms;
    k.tColor.value = this.sceneRT.texture;
    // the paint buffer is paintDetail × the frame: sample the full-res source at 1/detail stride,
    // and size the brush in paint pixels so it covers the same share of the screen at any detail
    const kw = this.kuwRT.width, kh = this.kuwRT.height;
    k.uTexel.value.set(1 / kw, 1 / kh);
    k.uRadius.value = Math.max(1.5, Math.min(7, P.kuwaharaRadius * (kh / 540)));
    k.uQ.value = P.kuwaharaSharpness;
    k.uExposure.value = P.exposure;
    k.tDepth.value = this.sceneRT.depthTexture;
    k.uNear.value = camera.near;
    k.uFar.value = camera.far;
    this.draw(this.mKuw, this.kuwRT);
    // small blur of the abstracted image, for thin wet edges
    const hw = this.kuwRT.width, hh = this.kuwRT.height;
    this.mBlur.uniforms.tColor.value = this.kuwRT.texture;
    this.mBlur.uniforms.uDir.value.set(1.2 / hw, 0);
    this.draw(this.mBlur, this.hB);
    this.mBlur.uniforms.tColor.value = this.hB.texture;
    this.mBlur.uniforms.uDir.value.set(0, 1.2 / hh);
    this.draw(this.mBlur, this.hA);

    this.mDown.uniforms.tColor.value = this.sceneRT.texture;
    this.mDown.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    this.draw(this.mDown, this.qA);
    const qw = this.qA.width, qh = this.qA.height;
    for (let i = 0; i < 2; i++) {
      this.mBlur.uniforms.tColor.value = this.qA.texture;
      this.mBlur.uniforms.uDir.value.set(1 / qw, 0).multiplyScalar(1 + i);
      this.draw(this.mBlur, this.qB);
      this.mBlur.uniforms.tColor.value = this.qB.texture;
      this.mBlur.uniforms.uDir.value.set(0, 1 / qh).multiplyScalar(1 + i);
      this.draw(this.mBlur, this.qA);
    }

    const c = this.mComp.uniforms;
    c.tPaint.value = this.kuwRT.texture;
    c.tBlur.value = this.qA.texture;
    c.tEdge.value = this.hA.texture;
    c.tDepth.value = this.sceneRT.depthTexture;
    c.tScene.value = this.sceneRT.texture;
    c.tGhost.value = ghost ? this.ghostRT!.texture : null;
    c.tGhostDepth.value = ghost ? this.ghostRT!.depthTexture : null;
    c.uRes.value.set(this.w, this.h);
    c.uNear.value = camera.near;
    c.uFar.value = camera.far;
    c.uTime.value = time;
    c.uBoil.value = P.boilFps;
    // Anchor screen-space paint noise to view direction so it doesn't slide as you look around.
    const fovY = (camera.fov * Math.PI) / 180;
    c.uNoiseOffset.value.set(-yaw / fovY, pitch / fovY);
    c.uWobble.value = P.wobble;
    c.uEdgeDark.value = P.edgeDarkening;
    c.uTurb.value = P.pigmentTurbulence;
    c.uGran.value = P.granulation;
    c.uPaper.value = P.paperTexture;
    c.uInk.value = P.ink;
    c.uInkDist.value = P.inkDistance;
    c.uGlow.value = P.glow;
    c.uVignette.value = P.vignette;
    c.uSat.value = P.saturation;
    c.uVibrance.value = P.vibrance;
    c.uGrade.value = P.grade;
    c.uGradeShadow.value.set(P.gradeShadow);
    c.uGradeLight.value.set(P.gradeLight);
    c.uNightWash.value = P.nightWash;
    c.uNight.value = night;
    c.uGolden.value = golden;
    c.uExposure.value = P.exposure;
    c.uRaw.value = raw ? 1 : 0;
    c.uSketch.value = (P.sketch || P.sketchFar) && U.uExplore.value ? 1 : 0; // (either choice; neither, and the world is simply painted)
    c.uSketchFar.value = P.sketchFar ? 1 : 0;
    c.uCrisp.value = P.crisp;
    c.uSoftGlow.value = P.softGlow;
    c.uClarity.value = P.clarity;
    c.uContrast.value = P.contrast;
    (c.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (c.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (c.uPaperColor.value as THREE.Color).set(P.paperColor).convertLinearToSRGB();
    (c.uInkColor.value as THREE.Color).set(P.inkColor).convertLinearToSRGB();
    this.draw(this.mComp, null);
  }
}
