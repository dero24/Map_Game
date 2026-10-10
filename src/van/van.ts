// The van: your home on the road, bigger on the inside (docs/agent/gameplay.md "The van").
//
// Outside it's an ordinary camper van (assets/camper.ts). Inside, the room (room.ts) is wider,
// longer and taller than the van could hold. There is no loading and no fade between them — the
// back doorway works like any front door in the game:
//   - outside, the room is drawn only through the doorway: the room is rendered from your own eye
//     (`beforeRender` → `portalRT`, colour and depth), and after the world (`after`) the passage's
//     faces (the portal) mark where the doorway shows (a stencil, depth-tested: whatever stands in
//     front of it stays), then lay the room's colour and its true depth there — the paint, the ink
//     and the brush see the room exactly as they do from inside. Where the room has an opening (a
//     window) it lays nothing, so the world behind shows through;
//   - inside, the world is drawn as ever (from where you stand — the room shares the van's frame),
//     the van's body left out, then the room over it (`after`, from the post's scene pass): its
//     shell without a depth test (it's convex from inside, so the world shows only through its
//     windows and doorway), then the passage and the furniture with one;
//   - you change over a little way into the passage (layout.ts nextMode), where both draws show
//     the same surfaces — the passage's — so nothing on screen changes as you step through.
// You walk the world's WalkWorld outside (the van stands in it as walls, its step and floor as
// decks) and the room's own walls inside (space.ts), the van's pose between the two.
import * as THREE from 'three';
import { camperGeometry, camperRecipe } from '../assets/camper';
import { propMaterial } from '../render/propMaterial';
import { U } from '../render/shared';
import type { WalkWorld } from '../player/collision';
import { vanLayout, nextMode, roomSegments, hullSegments, toWorld, toLocal, type VanLayout, type VanPose, type Mode } from './layout';
import { VanSpace, type WalkSpace } from './space';
import { shellGeometry, tunnelGeometry, contentsGeometry, roomLights, roomMaterial, mapMaterial, chartCanvas, tunnelFaces } from './room';

/** What the van needs of the walker: where they are, and the ground they walk on. */
export interface VanWalker { x: number; z: number; y: number; yaw: number; feet: number; space: WalkSpace | null }

/** Collision scope for the van's walls in the WalkWorld (tiles count up from 0, kerb cars down
 *  from −1,000,000, interiors −7…−9). */
const SCOPE = -5_000_000;
/** The back doors swing right round, against the van's sides (rad), over this many seconds. */
const DOOR_OPEN = Math.PI * 1.45, DOOR_S = 1.3;

export class Van {
  readonly layout: VanLayout;
  /** In the world (under the world root): the body, its bumper and step, the doors, the portal. */
  readonly group = new THREE.Group();
  /** The room, drawn on its own (beforeRender, after): its root follows the van's pose. */
  readonly roomScene = new THREE.Scene();
  pose: VanPose = { x: 0, y: 0, z: 0, yaw: 0 };
  mode: Mode = 'out';
  /** 0 shut … 1 open (the doors' swing) */
  doors = 0;
  private doorTarget = 0;
  private body: THREE.Mesh;
  private sides: THREE.Mesh[] = []; // the cargo box's left and right sides
  private rear: THREE.Mesh;
  private leaves: THREE.Object3D[] = [];
  private portalScene = new THREE.Scene();
  private portalRoot = new THREE.Group();
  private portalRT: THREE.WebGLRenderTarget | null = null;
  private portalMat: THREE.ShaderMaterial;
  private portalOn = false; // (the doorway's room was drawn this frame: `after` lays it)
  private paintMat = propMaterial({ keep: true });
  private hiddenMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private roomRoot = new THREE.Group();
  private shellMat: THREE.ShaderMaterial;
  private space: VanSpace;
  private registered = false;
  private clearC = new THREE.Color();
  private portalBox = new THREE.Box3();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  /** You stepped out of the back door (the first time: the town's bloom — main.ts). */
  onStepOut: ((first: boolean) => void) | null = null;
  /** The doors started to swing open (a sound). */
  onDoors: (() => void) | null = null;
  private outs = 0;

  constructor(private o: { walk: WalkWorld; root: THREE.Object3D }) {
    const recipe = camperRecipe(1);
    const L = (this.layout = vanLayout(recipe));
    const geo = camperGeometry(recipe);
    this.group.name = 'van';
    this.group.matrixAutoUpdate = false;
    this.body = new THREE.Mesh(geo.body, this.paintMat);
    this.body.name = 'van:body';
    this.rear = new THREE.Mesh(geo.rear, this.paintMat);
    this.rear.name = 'van:rear';
    // (each side of the cargo box is drawn only from outside it: through the doorway and the room's
    // windows you'd otherwise see its window frames from behind — beforeRender)
    for (const g of [geo.left, geo.right]) { const m = new THREE.Mesh(g, this.paintMat); m.name = 'van:side'; this.sides.push(m); }
    this.group.add(this.body, this.rear, ...this.sides);
    // the doors: one leaf, hinged at each back corner (the left mirrored)
    const hw = recipe.W / 2, zr = L.frame.zr + 0.03;
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * hw, 0, zr);
      pivot.scale.x = s;
      const leaf = new THREE.Mesh(geo.leaf, this.paintMat);
      leaf.name = 'van:door';
      pivot.add(leaf);
      this.leaves.push(pivot);
      this.group.add(pivot);
    }
    for (const m of [this.body, this.rear, ...this.sides, ...this.leaves.map((p) => p.children[0])]) m.layers.enable(1); // (they cast the sun's shadow)
    // the portal: the passage's faces, twice — first marking where the doorway shows (depth-tested
    // against the world, nothing drawn), then laying the room's colour and depth there
    const vert = /* glsl */ `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const markMat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(0.0); }`,
      side: THREE.DoubleSide, colorWrite: false, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    });
    this.portalMat = new THREE.ShaderMaterial({
      uniforms: { tPortal: { value: null }, tPortalDepth: { value: null }, uViewport: U.uViewport },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPortal, tPortalDepth;
        uniform vec2 uViewport;
        void main() {
          vec2 uv = gl_FragCoord.xy / uViewport;
          vec4 c = texture2D(tPortal, uv);
          if (c.a < 0.5) discard; // (one of the room's windows: the world behind shows through)
          gl_FragColor = vec4(c.rgb, 0.75);
          gl_FragDepthEXT = texture2D(tPortalDepth, uv).r;
        }`,
      side: THREE.DoubleSide, depthFunc: THREE.AlwaysDepth,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.KeepStencilOp,
    });
    // (the passage's four faces, and across its far end the way into the room — the room's own
    // passage has no face there: it opens into the room)
    const pg = new THREE.BufferGeometry(), pos: number[] = [], d = L.door, t = L.tunnel;
    const end = { p: [[d.x0, d.y0, t.z0], [d.x1, d.y0, t.z0], [d.x1, d.y1, t.z0], [d.x0, d.y1, t.z0]] as [number, number, number][] };
    for (const f of [...tunnelFaces(L), end]) for (const i of [0, 1, 2, 0, 2, 3]) pos.push(...f.p[i]);
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mark = new THREE.Mesh(pg, markMat), fill = new THREE.Mesh(pg, this.portalMat);
    mark.renderOrder = 0;
    fill.renderOrder = 1;
    mark.frustumCulled = fill.frustumCulled = false;
    this.portalRoot.add(mark, fill);
    this.portalRoot.matrixAutoUpdate = false;
    this.portalScene.add(this.portalRoot);
    this.portalScene.matrixWorldAutoUpdate = false;
    this.portalBox.setFromBufferAttribute(pg.getAttribute('position') as THREE.BufferAttribute);
    // the room, in a scene of its own
    const lights = roomLights(L);
    this.shellMat = roomMaterial(L, lights);
    const contentMat = roomMaterial(L, lights);
    const shell = new THREE.Mesh(shellGeometry(L), this.shellMat);
    shell.renderOrder = 0;
    const tunnel = new THREE.Mesh(tunnelGeometry(L), contentMat);
    const contents = new THREE.Mesh(contentsGeometry(L), contentMat);
    tunnel.renderOrder = contents.renderOrder = 1;
    this.roomRoot.add(shell, tunnel, contents);
    const chart = chartCanvas();
    if (chart) {
      const tex = new THREE.CanvasTexture(chart);
      tex.colorSpace = THREE.NoColorSpace;
      const t = L.furniture.find((f) => f.kind === 'maptable')!;
      const map = new THREE.Mesh(new THREE.PlaneGeometry(t.hx * 2 - 0.16, t.hz * 2 - 0.14), mapMaterial(L, lights, tex));
      map.rotation.set(-Math.PI / 2, 0, t.yaw, 'YXZ');
      map.position.set(t.x, L.room.y0 + 0.763, t.z);
      map.renderOrder = 1;
      this.roomRoot.add(map);
    }
    for (const m of this.roomRoot.children) m.frustumCulled = false;
    this.roomRoot.matrixAutoUpdate = false;
    this.roomScene.add(this.roomRoot);
    this.roomScene.matrixWorldAutoUpdate = false;
    this.space = new VanSpace(roomSegments(L), L.floor, this.pose);
    o.root.add(this.group);
  }

  /** Stand the van at `pose` (world x, z; the ground's y; yaw as three.js turns it). */
  park(pose: VanPose) {
    this.pose = { ...pose };
    this.space.pose = this.pose;
    this.group.position.set(pose.x, pose.y, pose.z);
    this.group.rotation.set(0, pose.yaw, 0);
    this.group.updateMatrix();
    this.group.updateMatrixWorld(true);
    this.register();
  }

  /** The van in the WalkWorld while it's parked: its outline as walls (open at the doorway), and
   *  as decks the step behind it and the floor of the doorway's passage, so you step up into it. */
  private register() {
    const W = this.o.walk;
    if (this.registered) W.removeScope(SCOPE, true);
    const L = this.layout, p = this.pose;
    W.withScope(SCOPE, () => {
      for (const [ax, az, bx, bz] of hullSegments(L)) W.addWall(toWorld(p, ax, az), toWorld(p, bx, bz), -Infinity, p.y + L.recipe.H);
      const deck = (z0: number, z1: number, y: number, halfWidth: number) => {
        const a = toWorld(p, 0, z0), b = toWorld(p, 0, z1);
        W.addDeck({ pts: [a, b], cum: [0, Math.abs(z1 - z0)], halfWidth, heightAt: () => p.y + y, profile: { k: 'const', y: p.y + y }, cut: 1 });
      };
      deck(L.frame.zr + 0.34, L.frame.zr, 0.32, (L.door.x1 - L.door.x0) / 2 - 0.05); // the step
      deck(L.frame.zr, L.tunnel.z0 - 0.6, L.floor, (L.door.x1 - L.door.x0) / 2); // the passage's floor, on in
    });
    this.registered = true;
  }

  /** Is (x, z) (world) where the room is? — for the systems that must look away while you're in. */
  covers(x: number, z: number) {
    const [lx, lz] = toLocal(this.pose, x, z), R = this.layout.room;
    return lx > R.x0 - 0.3 && lx < R.x1 + 0.3 && lz > R.z0 - 0.3 && lz < this.layout.door.z + 0.6;
  }
  get inside() { return this.mode === 'in'; }
  /** The van's own scenes, for the start's shader compile (render/warm.ts): its room and its doorway. */
  get scenes(): THREE.Scene[] { return [this.roomScene, this.portalScene]; }
  /** You've been out of the back door at least once. */
  get steppedOut() { return this.outs > 0; }

  /** After the walker moves, before the frame draws: in or out by where the eye is now, the walk
   *  space to match (for the next step), the doors. Flying, you're always out (you leave by the roof). */
  update(dt: number, w: VanWalker, flying = false) {
    const L = this.layout;
    const [lx, lz] = toLocal(this.pose, w.x, w.z);
    const prev = this.mode;
    this.mode = flying ? 'out' : nextMode(prev, lx, lz, L);
    if (this.mode !== prev) {
      if (this.mode === 'out') this.onStepOut?.(this.outs++ === 0);
    }
    w.space = this.mode === 'in' ? this.space : null;
    // the doors open as you come to them, from either side, and stay open
    const near = Math.abs(lx) < 2.4 && lz > L.tunnel.z0 - 2.2 && lz < L.door.z + 2.6;
    if (near && this.doorTarget === 0) { this.doorTarget = 1; this.onDoors?.(); }
    const was = this.doors;
    this.doors = Math.min(1, Math.max(0, this.doors + Math.sign(this.doorTarget - this.doors) * (dt / DOOR_S)));
    if (this.doors !== was || !this.leaves[0].userData.set) {
      const e = this.doors < 0.5 ? 2 * this.doors * this.doors : 1 - Math.pow(-2 * this.doors + 2, 2) / 2;
      this.leaves.forEach((p, i) => { p.rotation.y = (i === 0 ? 1 : -1) * e * DOOR_OPEN; p.updateMatrix(); p.userData.set = true; });
      this.group.updateMatrixWorld(true);
    }
    // inside: the body isn't drawn (you're in the room, which reaches past it) but still casts its shadow
    this.body.material = this.mode === 'in' ? this.hiddenMat : this.paintMat;
  }
  private cam = new THREE.Vector3();

  /** The doors open at once (shots; a reload into an open van). */
  openDoors() {
    this.doorTarget = this.doors = 1;
    this.leaves.forEach((p, i) => { p.rotation.y = (i === 0 ? 1 : -1) * DOOR_OPEN; p.updateMatrix(); p.userData.set = true; });
    this.group.updateMatrixWorld(true);
  }

  /** Put the walker in the room (van-local x, z; yaw in the van's frame), standing on its floor. */
  placeInside(w: VanWalker & { place(x: number, z: number, yaw?: number, pitch?: number, feet?: number): void }, lx: number, lz: number, lyaw: number, pitch = 0) {
    this.mode = 'in';
    w.space = this.space;
    const [x, z] = toWorld(this.pose, lx, lz);
    w.place(x, z, lyaw + this.pose.yaw, pitch, this.pose.y + this.layout.floor);
  }

  /** Keep the room's root (and the portal's) on the van, in the render frame (the floating origin). */
  private placeRoom(origin: THREE.Vector3) {
    this.m4.makeRotationY(this.pose.yaw).setPosition(this.pose.x - origin.x, this.pose.y, this.pose.z - origin.z);
    this.roomRoot.matrix.copy(this.m4);
    this.roomRoot.updateMatrixWorld(true);
    this.portalRoot.matrix.copy(this.m4);
    this.portalRoot.updateMatrixWorld(true);
  }

  /** Before the frame's draw: outside with the doorway in view, the room drawn into the portal's
   *  target from this camera. `size`: the frame's render target (post.ts sceneRT). */
  beforeRender(r: THREE.WebGLRenderer, cam: THREE.Camera, size: THREE.Vector2, origin: THREE.Vector3) {
    this.placeRoom(origin);
    // each side of the cargo box only from outside it (its shadow cast either way)
    cam.getWorldPosition(this.cam);
    const [cx] = toLocal(this.pose, this.cam.x + origin.x, this.cam.z + origin.z), hw = this.layout.recipe.W / 2 - 0.06;
    this.sides[0].material = this.mode === 'out' && cx < -hw ? this.paintMat : this.hiddenMat;
    this.sides[1].material = this.mode === 'out' && cx > hw ? this.paintMat : this.hiddenMat;
    this.portalOn = false;
    if (this.mode !== 'out' || this.doors < 0.02) return;
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const box = this.portalBox.clone().applyMatrix4(this.portalRoot.matrixWorld);
    if (!this.frustum.intersectsBox(box)) return;
    const w = Math.max(4, size.x), h = Math.max(4, size.y);
    if (!this.portalRT) this.portalRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    else if (this.portalRT.width !== w || this.portalRT.height !== h) this.portalRT.setSize(w, h);
    this.portalMat.uniforms.tPortal.value = this.portalRT.texture;
    this.portalMat.uniforms.tPortalDepth.value = this.portalRT.depthTexture;
    this.portalOn = true;
    // only the doorway's patch of the screen: the room shaded there and nowhere else (from across
    // the car park the doorway is a few hundred pixels; in the passage, most of the frame)
    const rect = this.screenRect(box, cam, w, h);
    this.portalRT.scissorTest = !!rect;
    if (rect) this.portalRT.scissor.set(rect[0], rect[1], rect[2], rect[3]);
    this.shellMat.depthFunc = THREE.LessEqualDepth;
    const prev = r.getRenderTarget(), a = r.getClearAlpha();
    r.getClearColor(this.clearC);
    r.setRenderTarget(this.portalRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.roomScene, cam);
    r.setClearColor(this.clearC, a);
    r.setRenderTarget(prev);
  }

  private corner = new THREE.Vector3();
  /** The pixel rectangle (x, y, w, h) a box covers on a w×h frame — null when it reaches behind
   *  the camera (then the whole frame). */
  private screenRect(box: THREE.Box3, cam: THREE.Camera, w: number, h: number): [number, number, number, number] | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = this.corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      p.applyMatrix4(cam.matrixWorldInverse);
      if (p.z > -0.05) return null; // (a corner behind the eye)
      p.applyMatrix4((cam as THREE.PerspectiveCamera).projectionMatrix);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const px0 = Math.max(0, Math.floor((x0 * 0.5 + 0.5) * w) - 2), py0 = Math.max(0, Math.floor((y0 * 0.5 + 0.5) * h) - 2);
    const px1 = Math.min(w, Math.ceil((x1 * 0.5 + 0.5) * w) + 2), py1 = Math.min(h, Math.ceil((y1 * 0.5 + 0.5) * h) + 2);
    return [px0, py0, Math.max(1, px1 - px0), Math.max(1, py1 - py0)];
  }

  /** From the post's scene pass, right after the world: inside, the room over it; outside, the
   *  room through the doorway (the portal's mark, then its fill). */
  readonly after = (r: THREE.WebGLRenderer, cam: THREE.Camera) => {
    if (this.mode !== 'in' && !this.portalOn) return;
    const auto = r.autoClear;
    r.autoClear = false;
    try {
      if (this.mode === 'in') {
        this.shellMat.depthFunc = THREE.AlwaysDepth;
        r.render(this.roomScene, cam);
      } else r.render(this.portalScene, cam);
    } finally { r.autoClear = auto; this.shellMat.depthFunc = THREE.LessEqualDepth; }
  };

  dispose() {
    this.o.walk.removeScope(SCOPE, true);
    this.portalRT?.dispose();
    this.group.removeFromParent();
  }
}
