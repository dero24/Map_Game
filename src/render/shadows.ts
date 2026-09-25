// Key-light shadow map: an orthographic depth pass that follows the walker, texel-snapped so edges
// don't crawl. Casters opt in via layer 1. Sampled by shadowAt() in every painted material.
import * as THREE from 'three';
import { U } from './shared';

export const shadowParams = { enabled: true, size: 2048, extent: 170, depth: 900 };

export class SunShadows {
  private rt: THREE.WebGLRenderTarget;
  readonly cam: THREE.OrthographicCamera;
  private depthMat = new THREE.MeshDepthMaterial();
  private size = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, shadowParams.depth * 2);
    this.cam.layers.set(1);
    this.rt = this.makeRT(shadowParams.size);
  }
  private makeRT(size: number) {
    this.size = size;
    const depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    const rt = new THREE.WebGLRenderTarget(size, size, { depthTexture, depthBuffer: true });
    U.uShadowMap.value = depthTexture;
    U.uShadowTexel.value = 1 / size;
    return rt;
  }

  update(scene: THREE.Scene, focus: THREE.Vector3, lightDir: THREE.Vector3) {
    U.uShadowOn.value = shadowParams.enabled && lightDir.y > 0.02 ? 1 : 0;
    if (!U.uShadowOn.value) return;
    if (shadowParams.size !== this.size) {
      this.rt.dispose();
      this.rt = this.makeRT(shadowParams.size);
    }
    const E = shadowParams.extent;
    const cam = this.cam;
    cam.left = -E; cam.right = E; cam.top = E; cam.bottom = -E;
    cam.far = shadowParams.depth * 2;
    cam.updateProjectionMatrix();
    // Look along -lightDir; snap the focus to shadow texels in light space.
    const d = lightDir.clone().normalize();
    cam.position.copy(focus).addScaledVector(d, shadowParams.depth);
    cam.up.set(0, 1, 0);
    if (Math.abs(d.y) > 0.99) cam.up.set(0, 0, -1);
    cam.lookAt(focus);
    cam.updateMatrixWorld();
    const texel = (2 * E) / this.size;
    const inv = cam.matrixWorldInverse;
    const f = focus.clone().applyMatrix4(inv);
    const sx = Math.round(f.x / texel) * texel - f.x, sy = Math.round(f.y / texel) * texel - f.y;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, -sx).addScaledVector(up, -sy);
    cam.updateMatrixWorld();

    U.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const r = this.renderer;
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    scene.overrideMaterial = this.depthMat;
    scene.background = null;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, cam);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    r.setRenderTarget(null);
  }
}
