// Watercolor post pipeline.
//   scene (HDR, + depth) ──► kuwahara (half res, tonemapped)  ─┐
//            └──► down4 ──► blurH ──► blurV (quarter res, HDR) ─┼──► composite (wobble, edge darkening,
//                                                               │     pigment, granulation, ink, glow, paper)
//            depth ─────────────────────────────────────────────┘
import * as THREE from 'three';
import { GLSL_NOISE } from './shared';

export const postParams = {
  enabled: true,
  renderScale: 1,
  kuwaharaRadius: 5,
  kuwaharaSharpness: 8,
  exposure: 1.0,
  saturation: 1.05,
  wobble: 1.0,
  edgeDarkening: 0.9,
  pigmentTurbulence: 0.35,
  granulation: 0.45,
  paperTexture: 0.7,
  ink: 0.55,
  inkDistance: 350,
  glow: 0.8,
  vignette: 0.55,
  boilFps: 0,
  nightWash: 0.55,
  paperColor: '#f8f4ea',
  inkColor: '#2e2a3a',
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
    const rt = (w: number, h: number, depth = false) =>
      new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: depth,
        ...(depth ? { depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) } : {}),
      });
    this.sceneRT = rt(4, 4, true);
    this.kuwRT = rt(4, 4);
    this.hA = rt(4, 4);
    this.hB = rt(4, 4);
    this.qA = rt(4, 4);
    this.qB = rt(4, 4);

    this.mKuw = pass(
      /* glsl */ `
      ${TONEMAP}
      uniform sampler2D tColor;
      uniform vec2 uTexel;
      uniform float uRadius, uQ;
      varying vec2 vUv;
      #define MAXR 7
      void main() {
        vec4 m[8]; vec3 s[8];
        for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
        float zeta = 2.0 / uRadius;
        float zc = 0.58;
        float sinz = sin(zc);
        float eta = (zeta + cos(zc)) / (sinz * sinz);
        float w[8];
        int R = min(int(ceil(uRadius)), MAXR);
        for (int j = -R; j <= R; j++) {
          for (int i = -R; i <= R; i++) {
            vec2 v = vec2(float(i), float(j)) / uRadius;
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
        vec4 o = vec4(0.0);
        for (int k = 0; k < 8; k++) {
          if (m[k].w <= 0.0) continue;
          vec3 mean = m[k].rgb / m[k].w;
          vec3 var = abs(s[k] / m[k].w - mean * mean);
          float sig = var.r + var.g + var.b;
          float wk = 1.0 / (1.0 + pow(sig * 1000.0, 0.5 * uQ));
          o += vec4(mean * wk, wk);
        }
        gl_FragColor = vec4(o.rgb / max(o.w, 1e-5), 1.0);
      }`,
      { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 5 }, uQ: { value: 8 }, uExposure: { value: 1 } },
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
      uniform float uWobble, uEdgeDark, uTurb, uGran, uPaper, uInk, uInkDist, uGlow, uVignette, uSat, uNightWash, uNight;
      uniform vec3 uPaperColor, uInkColor, uNightTint, uWarm;
      uniform float uGolden, uRaw;
      varying vec2 vUv;
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
        c = toSrgb(c);
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(lum), c, uSat);

        // pigment turbulence (low-frequency density variation) + granulation in paper valleys
        float turb = fbm(nuv * 2.2 + 3.1 + bt * 0.37) - 0.5;
        c = c - (c - c * c) * turb * uTurb * 2.2;
        float p = paperH(px);
        c = c - (c - c * c) * (0.55 - p) * uGran * 1.6;

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
        float brk = smoothstep(0.25, 0.6, vnoise(px * 0.045 + bt * 3.0));
        float fade = 1.0 - smoothstep(uInkDist * 0.35, uInkDist, z0);
        float bright = smoothstep(0.75, 0.95, dot(c, vec3(0.33)));
        c = mix(c, uInkColor, clamp(inkE * brk * fade * uInk * (1.0 - bright), 0.0, 0.85));

        // wet bloom around lamps and lit windows
        vec3 g = max(blurHdr * uExposure - 1.3, 0.0);
        c += toSrgb(min(g * 0.45, vec3(1.0))) * uGlow * (0.25 + 0.75 * uNight);

        // glazes: indigo by night, a whisper of warm sienna at golden hour
        // warm light (windows, lamps) is left out of the night glaze, like reserved paper
        float warmth = smoothstep(0.05, 0.3, c.r - c.b) * smoothstep(0.25, 0.6, dot(c, vec3(0.33)));
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
        uNightTint: { value: new THREE.Color(0.55, 0.62, 1.0) }, uWarm: { value: new THREE.Color(1.08, 0.97, 0.86) },
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
    const s = postParams.renderScale;
    const sw = Math.max(4, Math.round(w * s)), sh = Math.max(4, Math.round(h * s));
    this.sceneRT.setSize(sw, sh);
    for (const t of [this.kuwRT, this.hA, this.hB]) t.setSize(Math.max(4, Math.round(sw / 2)), Math.max(4, Math.round(sh / 2)));
    this.qA.setSize(Math.max(4, Math.round(sw / 4)), Math.max(4, Math.round(sh / 4)));
    this.qB.setSize(Math.max(4, Math.round(sw / 4)), Math.max(4, Math.round(sh / 4)));
  }

  private draw(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, night: number, golden: number, yaw: number, pitch: number, raw = false) {
    const P = postParams;
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    const sw = this.sceneRT.width, sh = this.sceneRT.height;

    if (!P.enabled) {
      this.mCopy.uniforms.tColor.value = this.sceneRT.texture;
      this.mCopy.uniforms.uExposure.value = P.exposure;
      this.draw(this.mCopy, null);
      return;
    }
    const k = this.mKuw.uniforms;
    k.tColor.value = this.sceneRT.texture;
    k.uTexel.value.set(1 / sw, 1 / sh);
    // radius is in half-res pixels; sample the full-res source at 2x stride
    k.uTexel.value.multiplyScalar(2);
    k.uRadius.value = Math.max(1.5, Math.min(7, P.kuwaharaRadius * (this.h / 1080)));
    k.uQ.value = P.kuwaharaSharpness;
    k.uExposure.value = P.exposure;
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
    c.uNightWash.value = P.nightWash;
    c.uNight.value = night;
    c.uGolden.value = golden;
    c.uExposure.value = P.exposure;
    c.uRaw.value = raw ? 1 : 0;
    (c.uPaperColor.value as THREE.Color).set(P.paperColor).convertLinearToSRGB();
    (c.uInkColor.value as THREE.Color).set(P.inkColor).convertLinearToSRGB();
    this.draw(this.mComp, null);
  }
}
