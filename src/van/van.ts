// The van: your home on the road, bigger on the inside (docs/agent/gameplay.md "The van").
//
// Outside it's an ordinary camper van (assets/camper.ts). Inside, the room (room.ts) is wider,
// longer and taller than the van could hold. There is no loading and no fade between them — the
// back doorway works like any front door in the game:
//   - outside, the room is drawn only through the doorway and the windows: the room is rendered
//     from your own eye (`beforeRender` → `portalRT`, colour and depth), and after the world
//     (`after`) the passage's faces and the windows' (the portal) mark where they show (a stencil,
//     depth-tested: whatever stands in front stays — the windows' frames, their curtains, you), then
//     lay the room's colour and its true depth there — the paint, the ink and the brush see the room
//     exactly as they do from inside. Where the room has an opening (a window) it lays nothing, so
//     the world behind shows through. The room is wider than the van, so from beside it its near
//     side stands outside the van: through a side's windows only what's beyond them is drawn
//     (layout.ts windowClip);
//   - inside, the world is drawn as ever (from where you stand — the room shares the van's frame),
//     the van's body left out, then the room over it (`after`, from the post's scene pass): its
//     shell without a depth test (it's convex from inside, so the world shows only through its
//     windows and doorway), then the passage and the furniture with one;
//   - you change over a little way into the passage (layout.ts nextMode), where both draws show
//     the same surfaces — the passage's — so nothing on screen changes as you step through.
// You walk the world's WalkWorld outside (the van stands in it as walls, its step and floor as
// decks) and the room's own walls inside (space.ts), the van's pose between the two.
//
// The cab: the driver's door (outside, on the left) seats you at the wheel — a wide lens, the dash,
// the windshield's frame, the mirrors, a free look; from the seat you get up and go into the back
// through the curtain (a curtain brushes past: `wipe`), and through the room's curtained way in its
// front wall you come back to the seat. The van drives itself (drive.ts): a destination from the map
// table, the back doors shut, and it carries you — in the room or at the wheel — along its lane. Or you
// drive it: at the wheel W/S and A/D (a phone's stick) are the pedals and the wheel (`stepWheel`); it
// leaves the world's walls as it moves, bumps off what it meets, and stops itself if you get up. At the
// wheel you see from the driver's seat or from behind the van (V; a phone's View: `chase`). Turned round
// in the seat you lean in to the middle (`seat`) and your own seat's back is left out (it's behind your
// head). The dash lives: the speedometer and the rev counter (`dashLife`), the charm under the mirror
// swinging as the van pulls away, brakes and turns, and the nav screen (dashMap.ts: main draws it) — M at
// the wheel (a phone's Map) leans you in to it till it fills the view, and the atlas opens on it to pick
// where to drive (`toggleScreen`, `onScreen`); driving it yourself, it slows to a stop while you look.
import * as THREE from 'three';
import { camperGeometry, camperRecipe, DIAL_SWEEP } from '../assets/camper';
import { propMaterial } from '../render/propMaterial';
import { U } from '../render/shared';
import type { WalkWorld } from '../player/collision';
import { vanLayout, nextMode, roomSegments, hullSegments, toWorld, toLocal, peekSide, windowClip, seatLean, type VanLayout, type VanPose, type Mode } from './layout';
import { VanSpace, type WalkSpace } from './space';
import { buildGraph, route, lanePath, Drive, stepWheel, timeLeft, HANDLING, type Graph, type PathPt, type Wheel } from './drive';
import { screenMaterial, type DashNav } from './dashMap';
import { walkParams, setLens } from '../player/controller';
import { stickAxes } from '../player/vehicles';
import type { Road } from '../world/data';
import { shellGeometry, tunnelGeometry, contentsGeometry, roomLights, roomMaterial, mapMaterial, chartCanvas, tunnelFaces, windowFaces } from './room';

/** What the van needs of the walker: where they are, and the ground they walk on. */
export interface VanWalker {
  x: number; z: number; y: number; yaw: number; pitch: number; feet: number; space: WalkSpace | null; holdMove: boolean;
  /** a phone's walking stick (−1…1 each way, +y down): at the wheel, the pedals and the wheel */
  readonly touchAxes?: { x: number; y: number };
  /** the mouse has the look (pointer lock): behind the van the view stays where you turn it */
  readonly locked?: boolean;
  place(x: number, z: number, yaw?: number, pitch?: number, feet?: number): void;
  shift(dx: number, dy: number, dz: number, dyaw: number): void;
}
/** What E (or the touch button) does now, by the van. */
export interface VanAction { id: 'sit' | 'back' | 'map'; label: string; text: string }

/** Collision scope for the van's walls in the WalkWorld (tiles count up from 0, kerb cars down
 *  from −1,000,000, interiors −7…−9). */
const SCOPE = -5_000_000;
/** The back doors swing right round, against the van's sides (rad), over this many seconds. */
const DOOR_OPEN = Math.PI * 1.45, DOOR_S = 1.3;
/** While it drives itself the pedals and the wheel don't move it: a pedal held this long takes the
 *  wheel (a tap only brings up how — main's hint). */
const TAKE_S = 1.1;

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
  private portalOn = false; // (the room was drawn for the doorway or a window this frame: `after` lays it)
  /** what of the room is drawn (van-local plane; all of it but through a side's windows) */
  private clip = { value: new THREE.Vector4(0, 0, 0, 1) };
  private paintMat = propMaterial({ keep: true });
  private hiddenMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private roomRoot = new THREE.Group();
  private shellMat: THREE.ShaderMaterial;
  private space: VanSpace;
  private registered = false;
  private clearC = new THREE.Color();
  private doorBox = new THREE.Box3(); // (the portal's parts, van-local: the doorway's passage, each side's windows)
  private winBox = [new THREE.Box3(), new THREE.Box3()];
  private box3 = new THREE.Box3();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  /** You stepped out of the back door (the first time: the town's bloom — main.ts). */
  onStepOut: ((first: boolean) => void) | null = null;
  /** The doors started to swing open (a sound). */
  onDoors: (() => void) | null = null;
  /** E at the map table: choose where to drive (main opens the atlas to pick a place). */
  onMapTable: (() => void) | null = null;
  /** The van stopped at the end of a drive (main: the kerb cars about it, a word). */
  onArrive: (() => void) | null = null;
  /** The van pulled away (the first time, with the town still in pencil: its bloom — main.ts). */
  onDepart: (() => void) | null = null;
  /** The van moving (x, z, vx, vz): animals give way to it as to any traffic. */
  onMove: ((x: number, z: number, vx: number, vz: number) => void) | null = null;
  private outs = 0;
  private wheelPivot = new THREE.Group();
  private wheelMesh: THREE.Mesh;
  private steer = 0;
  private trip: Drive | null = null;
  private pending: PathPt[] | null = null; // (a route waiting for the back doors to shut)
  /** under way (driven, or driving itself): out of the WalkWorld until it stops and parks */
  private rolling = false;
  /** driven by hand: its speed along its nose, the wheel's turn, its heading */
  private hand: Wheel = { v: 0, steer: 0, yaw: 0 };
  private keys = new Set<string>();
  /** At the wheel, seen from behind the van (V; a phone's View) rather than from the driver's seat. */
  third = false;
  private takeT = 0; // (a pedal held while it drives itself)
  /** You took the wheel from the van driving itself (main: a word). */
  onTakeWheel: (() => void) | null = null;
  private chasePos = new THREE.Vector3();
  private chaseInit = false;
  private driverBack: THREE.Mesh; // (your seat's back and headrest: not from your own eye)
  private needles: THREE.Mesh[] = []; // (the speedometer's, the rev counter's)
  private charm: THREE.Mesh;
  private glass: THREE.Mesh; // (the nav screen's: main gives it the map — setScreen)
  private cabBits: THREE.Object3D[] = [];
  private rpm = 0;
  private swing = { fb: 0, vb: 0, fs: 0, vs: 0, ax: 0, al: 0, v: 0, yaw: 0, t: 0 }; // (the charm: its swing back and to the side; the van's pull)
  private scr = { on: false, t: 0, opened: false }; // (leaning in to the screen: M)
  /** Leant in to the screen, it fills the view (main: the atlas opens on it to pick where to drive). */
  onScreen: (() => void) | null = null;
  private pendingV = 0; // (the speed a new drive starts from: picked on the move, it carries on)
  private tLeft: Float32Array | null = null; // (the drive's seconds to go from each metre: the screen)
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private e1 = new THREE.Euler();
  private m5 = new THREE.Matrix4();
  private graph: { n: number; g: Graph } | null = null;
  private wipe: { t: number; to: 'in' | 'cab' } | null = null;
  private wipeEl: HTMLElement | null = null;
  private seatT = 1; // (easing into the seat)
  private seatFrom = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private w: VanWalker | null = null;

  constructor(private o: { walk: WalkWorld; root: THREE.Object3D; ground?: (x: number, z: number, y: number) => number; driveLeft?: boolean; enabled?: () => boolean }) {
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
    // the windows' panes: never drawn, but they cast the sun's shadow as glass would
    const panes = new THREE.Mesh(geo.panes, this.hiddenMat);
    panes.name = 'van:panes';
    this.group.add(panes);
    for (const p of this.leaves) { const m = new THREE.Mesh(geo.leafPane, this.hiddenMat); m.name = 'van:pane'; p.add(m); }
    for (const m of [this.body, this.rear, ...this.sides, panes, ...this.leaves.flatMap((p) => p.children)]) m.layers.enable(1); // (they cast the sun's shadow)
    // the steering wheel, on its column: it turns with the road
    const st = L.frame.steer;
    this.wheelPivot.position.set(st.x, st.y, st.z);
    this.wheelPivot.rotation.x = st.tilt;
    this.wheelMesh = new THREE.Mesh(geo.wheel, this.paintMat);
    this.wheelMesh.name = 'van:wheel';
    this.wheelPivot.add(this.wheelMesh);
    this.group.add(this.wheelPivot);
    // your seat's back and headrest (left out from your own eye: they're behind your head)
    this.driverBack = new THREE.Mesh(geo.driverBack, this.paintMat);
    this.driverBack.name = 'van:seat';
    this.group.add(this.driverBack);
    // the binnacle's live needles (the speedometer, the rev counter), each on its dial's face
    const cl = L.frame.cluster, ct = cl.tilt;
    for (const d of L.frame.dials.slice(0, 2)) {
      const m = new THREE.Mesh(geo.needle, this.paintMat);
      m.name = 'van:needle';
      m.position.set(cl.x + d.du, cl.y + Math.cos(ct) * d.dv + Math.sin(ct) * 0.0125, cl.z - Math.sin(ct) * d.dv + Math.cos(ct) * 0.0125);
      m.rotation.set(-ct, 0, DIAL_SWEEP / 2, 'XYZ');
      this.needles.push(m);
    }
    // the charm under the mirror; the nav screen's glass (drawn nothing till main gives it the map)
    const ch = L.frame.charm, sc = L.frame.screen;
    this.charm = new THREE.Mesh(geo.charm, this.paintMat);
    this.charm.name = 'van:charm';
    this.charm.position.set(ch.x, ch.y, ch.z);
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(sc.w, sc.h), this.hiddenMat);
    this.glass.name = 'van:screen';
    this.glass.rotation.set(sc.tilt, sc.yaw, 0, 'YXZ');
    const out = new THREE.Vector3(0, 0, 0.0008).applyEuler(this.glass.rotation);
    this.glass.position.set(sc.x + out.x, sc.y + out.y, sc.z + out.z);
    this.cabBits.push(...this.needles, this.charm, this.glass);
    this.group.add(...this.cabBits);
    // the portal: the passage's faces and the windows', twice — first marking where they show
    // (depth-tested against the world, nothing drawn), then laying the room's colour and depth there
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
    // passage has no face there: it opens into the room; then a face across each side window)
    const pg = new THREE.BufferGeometry(), pos: number[] = [], d = L.door, t = L.tunnel;
    const end = { p: [[d.x0, d.y0, t.z0], [d.x1, d.y0, t.z0], [d.x1, d.y1, t.z0], [d.x0, d.y1, t.z0]] as [number, number, number][] };
    for (const f of [...tunnelFaces(L), end]) for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...f.p[i]); this.doorBox.expandByPoint(new THREE.Vector3(...f.p[i])); }
    for (const f of windowFaces(L)) for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...f.p[i]); this.winBox[f.side < 0 ? 0 : 1].expandByPoint(new THREE.Vector3(...f.p[i])); }
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mark = new THREE.Mesh(pg, markMat), fill = new THREE.Mesh(pg, this.portalMat);
    mark.renderOrder = 0;
    fill.renderOrder = 1;
    mark.frustumCulled = fill.frustumCulled = false;
    this.portalRoot.add(mark, fill);
    this.portalRoot.matrixAutoUpdate = false;
    this.portalScene.add(this.portalRoot);
    this.portalScene.matrixWorldAutoUpdate = false;
    // the room, in a scene of its own
    const lights = roomLights(L);
    this.shellMat = roomMaterial(L, lights, this.clip);
    const contentMat = roomMaterial(L, lights, this.clip);
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
      const map = new THREE.Mesh(new THREE.PlaneGeometry(t.hx * 2 - 0.16, t.hz * 2 - 0.14), mapMaterial(L, lights, tex, this.clip));
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
    this.space.shut = [L.door.x0, L.door.z, L.door.x1, L.door.z];
    o.root.add(this.group);
    // E: the van's action here (the driver's seat, the back, the map table) — vehicles.ts steps aside
    // while the van has one (main: its `enabled`); the keys held, for the pedals and the wheel
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if ((e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
        this.keys.add(e.code);
        if ((e.code !== 'KeyE' && e.code !== 'KeyV') || e.repeat) return;
        if (this.o.enabled && !this.o.enabled()) return;
        if (e.code === 'KeyV') this.toggleView();
        else this.act();
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.keys.clear());
    }
  }

  /** Stand the van at `pose` (world x, z; the ground's y; yaw as three.js turns it). */
  park(pose: VanPose) {
    Object.assign(this.pose, pose);
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
    const [lx, lz] = toLocal(this.pose, x, z), R = this.layout.room, F = this.layout.frame;
    if (this.rolling) return Math.abs(lx) < this.layout.recipe.W / 2 + 0.3 && lz > F.zf - 0.3 && lz < F.zr + 0.3;
    return lx > R.x0 - 0.3 && lx < R.x1 + 0.3 && lz > R.z0 - 0.3 && lz < this.layout.door.z + 0.6;
  }
  /** On the move (or about to be: the doors shutting first). */
  get moving() { return this.rolling || !!this.pending; }
  /** How fast it's going (m/s). */
  get speed() { return this.trip?.v ?? Math.abs(this.hand.v); }
  /** Driven by hand right now (at the wheel, under way). */
  get driven() { return this.rolling && !this.trip; }
  /** Driving itself (a drive from the map table), or about to (its doors shutting first). */
  get selfDriving() { return !!this.trip || !!this.pending; }
  /** How far along a pedal's hold to take the wheel from it is (0…1). */
  get taking() { return Math.min(1, this.takeT / TAKE_S); }
  get inside() { return this.mode === 'in'; }
  /** The van's own scenes, for the start's shader compile (render/warm.ts): its room and its doorway. */
  get scenes(): THREE.Scene[] { return [this.roomScene, this.portalScene]; }
  /** You've been out of the back door at least once. */
  get steppedOut() { return this.outs > 0; }

  /** After the walker moves, before the frame draws: in or out by where the eye is now, the walk
   *  space to match (for the next step), the doors. Flying, you're always out (you leave by the roof). */
  update(dt: number, w: VanWalker, flying = false) {
    const L = this.layout;
    this.w = w;
    const [lx, lz] = toLocal(this.pose, w.x, w.z);
    const prev = this.mode;
    this.mode = flying && prev !== 'cab' ? 'out' : nextMode(prev, lx, lz, L);
    if (this.mode !== prev) {
      if (this.mode === 'out') this.onStepOut?.(this.outs++ === 0);
    }
    w.space = this.mode === 'in' ? this.space : null;
    // the curtained way to the cab: walk into it and you're through, at the wheel
    const way = L.cab.way;
    if (this.mode === 'in' && !this.wipe && lx > way.x0 && lx < way.x1 && lz < way.z + 0.5) this.startWipe('cab');
    this.wipeStep(dt, w);
    // the doors open as you come to them, from either side, and stay open — but shut for a drive
    const near = Math.abs(lx) < 2.4 && lz > L.tunnel.z0 - 2.2 && lz < L.door.z + 2.6;
    if (this.moving) this.doorTarget = 0;
    else if (near && this.doorTarget === 0 && this.mode !== 'cab') { this.doorTarget = 1; this.onDoors?.(); }
    const was = this.doors;
    this.doors = Math.min(1, Math.max(0, this.doors + Math.sign(this.doorTarget - this.doors) * (dt / DOOR_S)));
    if (this.doors !== was || !this.leaves[0].userData.set) {
      const e = this.doors < 0.5 ? 2 * this.doors * this.doors : 1 - Math.pow(-2 * this.doors + 2, 2) / 2;
      this.leaves.forEach((p, i) => { p.rotation.y = (i === 0 ? 1 : -1) * e * DOOR_OPEN; p.updateMatrix(); p.userData.set = true; });
      this.group.updateMatrixWorld(true);
    }
    // inside: the body isn't drawn (you're in the room, which reaches past it) but still casts its shadow
    this.body.material = this.mode === 'in' ? this.hiddenMat : this.paintMat;
    this.wheelMesh.material = this.body.material;
    for (const m of this.cabBits) m.visible = this.mode !== 'in';
    this.driverBack.visible = this.mode !== 'in' && !(this.mode === 'cab' && !this.chasing); // (behind your head)
    this.space.closed = this.doors < 0.98; // (the doorway's a wall while the doors aren't open)
    this.dashLife(dt);
  }

  /** The dials and the charm: the speedometer's needle on the speed (0–80 mph), the rev counter's on the
   *  engine (idling while you're at the wheel, running with the van: a gear every 6.5 m/s, the revs
   *  climbing through each), the charm a 15 cm pendulum on the van's pull — swinging back as it pulls
   *  away, forward as it brakes, out as it turns, a little road shake under it. */
  private dashLife(dt: number) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const v = this.trip ? this.trip.v : this.hand.v, a = Math.abs(v), on = this.mode === 'cab' || this.rolling;
    const gear = Math.min(3, Math.floor(a / 6.5)), f = Math.min(1, (a - gear * 6.5) / 6.5);
    this.rpm += ((!on ? 0 : a < 0.3 ? 760 : 1250 + f * 2100 - gear * 120) - this.rpm) * Math.min(1, dt * 4);
    this.needles[0].rotation.z = DIAL_SWEEP / 2 - Math.min(1, (a * 2.237) / 80) * DIAL_SWEEP;
    this.needles[1].rotation.z = DIAL_SWEEP / 2 - Math.min(1, this.rpm / 6000) * DIAL_SWEEP;
    const S = this.swing, dyaw = Math.atan2(Math.sin(this.pose.yaw - S.yaw), Math.cos(this.pose.yaw - S.yaw));
    const k = Math.min(1, dt * 10), clamp = (x: number) => Math.max(-6, Math.min(6, x));
    S.ax += (clamp((v - S.v) / dt) - S.ax) * k; // (smoothed: one frame's jolt isn't a swing)
    S.al += (clamp((v * dyaw) / dt) - S.al) * k;
    S.v = v;
    S.yaw = this.pose.yaw;
    const g = 9.8 / 0.15, n = Math.ceil(dt / 0.008), h = dt / n, shake = Math.min(1, a / 12) * 4;
    for (let i = 0; i < n; i++) {
      S.t += h;
      const bump = shake * Math.sin(S.t * 23) * Math.sin(S.t * 9.7);
      S.vb += (-g * Math.sin(S.fb) + ((S.ax + bump) / 0.15) * Math.cos(S.fb) - 1.6 * S.vb) * h;
      S.vs += (-g * Math.sin(S.fs) + (S.al / 0.15) * Math.cos(S.fs) - 1.6 * S.vs) * h;
      S.fb += S.vb * h;
      S.fs += S.vs * h;
    }
    this.charm.rotation.set(-S.fb, 0, S.fs);
  }

  /** The nav screen's map (dashMap.ts's canvas, main's). */
  setScreen(tex: THREE.Texture) { this.glass.material = screenMaterial(tex); }
  /** What the nav screen shows (dashMap.ts): where the van is, its drive and how far it has to go. */
  nav(): DashNav {
    const T = this.trip, path = T ? T.path : this.pending;
    let route: DashNav['route'] = null;
    if (path && path.length > 1) {
      const at = T ? T.s : 0, i = Math.min(path.length - 1, Math.floor(at));
      route = { path, at, left: Math.max(0, path[path.length - 1].s - at), eta: this.tLeft?.[i] ?? 0 };
    }
    return { x: this.pose.x, z: this.pose.z, yaw: this.pose.yaw, speed: this.speed, route, hand: this.driven };
  }
  /** M at the wheel (a phone's Map): lean in to the screen, or back to the seat. From behind the van,
   *  into the seat first. */
  toggleScreen() {
    if (this.mode !== 'cab' || this.wipe) return false;
    const S = this.scr;
    S.on = !S.on;
    S.opened = false;
    if (S.on) { this.third = false; this.chaseInit = false; }
    return true;
  }
  /** Leaning in to the screen, or there. */
  get screenOn() { return this.scr.on; }
  /** How far in (0 the seat … 1 the screen fills the view). */
  get screenT() { return this.scr.t; }

  // ---------------- the cab ----------------
  /** What E does here (and the touch button says): sit at the wheel from the driver's door; from the
   *  seat, go into the back; at the map table, choose where to drive. */
  action(): VanAction | null {
    const w = this.w, L = this.layout;
    if (!w || this.wipe) return null;
    if (this.mode === 'cab') return { id: 'back', label: 'Back', text: this.driven ? 'get up and go into the back (the van stops itself)' : 'get up and go into the back' };
    const [lx, lz] = toLocal(this.pose, w.x, w.z);
    if (this.mode === 'out' && !this.moving && Math.hypot(lx - L.cab.door.x, lz - L.cab.door.z) < 1.5) return { id: 'sit', label: 'Sit', text: "the driver's seat" };
    const t = L.furniture.find((f) => f.kind === 'maptable')!;
    if (this.mode === 'in' && Math.hypot(lx - t.x, lz - t.z) < 1.4) return { id: 'map', label: 'Map', text: this.moving ? 'where you are going' : 'choose where to drive' };
    return null;
  }
  act() {
    const a = this.action(), w = this.w;
    if (!a || !w) return false;
    if (a.id === 'map') this.onMapTable?.();
    else if (a.id === 'back') this.startWipe('in');
    else this.sit(w);
    return true;
  }
  /** Into the driver's seat (from where you stand: the eye eases over). The back doors swing shut,
   *  ready to go. */
  private sit(w: VanWalker) {
    this.seatFrom.set(w.x, w.y, w.z);
    this.seatT = this.mode === 'out' ? 0 : 1;
    this.mode = 'cab';
    if (this.doorTarget !== 0) { this.doorTarget = 0; this.onDoors?.(); }
    w.space = null;
    w.holdMove = true;
    w.yaw = this.pose.yaw; // (looking out of the windshield)
    w.pitch = -0.05;
  }
  /** A curtain brushes past your face (a quarter second each way): at its fullest, you're through. */
  private startWipe(to: 'in' | 'cab') {
    this.wipe = { t: 0, to };
    this.scr.on = this.scr.opened = false;
    this.scr.t = 0;
    if (typeof document === 'undefined') return;
    if (!this.wipeEl) {
      const el = (this.wipeEl = document.createElement('div'));
      el.id = 'van-curtain';
      Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '15', pointerEvents: 'none', transform: 'translateX(-110%)', background: 'repeating-linear-gradient(90deg, #8f3f35 0px, #b0544a 26px, #7d362e 52px, #a24a40 78px)', boxShadow: 'inset 0 0 120px rgba(40,10,8,0.6)' });
      document.body.appendChild(el);
    }
  }
  private wipeStep(dt: number, w: VanWalker) {
    const W = this.wipe;
    if (!W) return;
    const was = W.t;
    W.t += dt;
    w.holdMove = true;
    const IN = 0.22, OUT = 0.3;
    if (was < IN && W.t >= IN) {
      // through: at the wheel, or just inside the room's curtained way facing in
      const L = this.layout;
      if (W.to === 'cab') { this.sit(w); this.seatT = 1; }
      else {
        this.mode = 'in';
        w.space = this.space;
        const [x, z] = toWorld(this.pose, L.cab.into.x, L.cab.into.z);
        w.place(x, z, L.cab.into.yaw + this.pose.yaw, -0.05, this.pose.y + L.floor);
      }
    }
    const k = W.t < IN ? W.t / IN : 1 - (W.t - IN) / OUT;
    if (this.wipeEl) this.wipeEl.style.transform = `translateX(${W.t < IN ? -110 + 110 * k : 110 * (1 - k)}%)`;
    if (W.t >= IN + OUT) {
      this.wipe = null;
      if (this.wipeEl) this.wipeEl.style.transform = 'translateX(-110%)';
      w.holdMove = this.mode === 'cab';
    }
  }
  /** At the wheel: from the driver's seat, or from behind the van (and back). */
  toggleView() {
    if (this.mode !== 'cab') return;
    this.third = !this.third;
    this.chaseInit = false;
  }
  /** Seen from behind the van now (at the wheel, settled in the seat). */
  get chasing() { return this.mode === 'cab' && this.third && this.seatT >= 1; }
  /** At the wheel: the camera is the driver's eye (it rides the van), your look free about it — or,
   *  from behind, it follows the van round your look. True while seated (the walker doesn't walk). */
  seat(dt: number, cam: THREE.PerspectiveCamera, w: VanWalker): boolean {
    if (this.mode !== 'cab') return false;
    const L = this.layout, e = L.cab.eye;
    // turned round in the seat (looking back over a shoulder) you lean in to the middle and a little
    // forward: you look back between the seats, never into your own headrest
    const ln = seatLean(w.yaw - this.pose.yaw);
    const [x, z] = toWorld(this.pose, e.x + ln.dx, e.z + ln.dz);
    this.eye.set(x, this.pose.y + e.y + ln.dy, z);
    if (this.seatT < 1) {
      this.seatT = Math.min(1, this.seatT + dt / 0.6);
      const k = this.seatT * this.seatT * (3 - 2 * this.seatT);
      this.eye.lerpVectors(this.seatFrom, this.eye, k);
    }
    w.x = this.eye.x;
    w.z = this.eye.z;
    w.y = this.eye.y;
    w.holdMove = true;
    if (this.chasing) { this.chase(dt, cam, w); return true; }
    cam.position.copy(this.eye);
    cam.up.set(0, 1, 0);
    cam.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
    setLens(cam, walkParams.cabFov);
    this.screenView(dt, cam);
    return true;
  }
  /** Leaning in to the screen (M): the eye eases from the seat to just before the glass, square to it,
   *  the lens narrowing till the screen fills the view (there: `onScreen`); and back. */
  private screenView(dt: number, cam: THREE.PerspectiveCamera) {
    const S = this.scr;
    S.t = Math.min(1, Math.max(0, S.t + (S.on ? dt / 0.55 : -dt / 0.4)));
    if (S.on && S.t >= 1 && !S.opened) { S.opened = true; this.onScreen?.(); }
    if (S.t <= 0) return;
    const k = S.t * S.t * (3 - 2 * S.t), sc = this.layout.frame.screen, p = this.pose, d = 0.4;
    // the glass in the world: its middle, which way it faces, its up
    this.m4.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z);
    const q = this.q1.setFromEuler(this.e1.set(sc.tilt, sc.yaw, 0, 'YXZ'));
    const n = this.v1.set(0, 0, 1).applyQuaternion(q).transformDirection(this.m4);
    const up = this.v2.set(0, 1, 0).applyQuaternion(q).transformDirection(this.m4);
    const c = this.v3.set(sc.x, sc.y, sc.z).applyMatrix4(this.m4), at = this.v4.copy(c).addScaledVector(n, d);
    cam.position.lerpVectors(this.eye, at, k);
    this.q2.setFromRotationMatrix(this.m5.lookAt(at, c, up));
    cam.quaternion.slerp(this.q2, k);
    // the lens: from the seat's to the one the glass fills, with a margin round it
    const fit = (2 * Math.atan(Math.max((sc.h * 1.12) / 2, (sc.w * 1.06) / 2 / cam.aspect) / d) * 180) / Math.PI;
    cam.fov += (fit - cam.fov) * k;
    cam.updateProjectionMatrix();
  }
  /** From behind the van (vehicles.ts chase, the van's own sizes): the camera behind your look and
   *  above it, on the van; with no mouse to hold the look (a phone) it swings back behind the van. */
  private chase(dt: number, cam: THREE.PerspectiveCamera, w: VanWalker) {
    if (!w.locked) w.yaw += Math.atan2(Math.sin(this.pose.yaw - w.yaw), Math.cos(this.pose.yaw - w.yaw)) * Math.min(1, dt * 1.2);
    const el = Math.max(-0.1, Math.min(1.1, 0.2 - w.pitch * 0.8)), dist = 9.5 * (1 + Math.min(0.3, this.speed / 80));
    const tx = this.pose.x + Math.sin(w.yaw) * Math.cos(el) * dist, tz = this.pose.z + Math.cos(w.yaw) * Math.cos(el) * dist;
    const ground = this.o.ground ? this.o.ground(tx, tz, this.pose.y) : this.pose.y;
    const target = this.cam.set(tx, Math.max(this.pose.y + 2.4 + Math.sin(el) * dist, ground + 1.2), tz);
    if (!this.chaseInit) { this.chasePos.copy(target); this.chaseInit = true; }
    this.chasePos.lerp(target, Math.min(1, dt * 6));
    cam.position.copy(this.chasePos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.pose.x, this.pose.y + 1.6, this.pose.z);
    setLens(cam);
  }

  // ---------------- driving ----------------
  /** Drive to (x, z) on the roads given: plan the route; the doors shut, then it goes. False when
   *  there's no way there on the roads it knows. */
  driveTo(x: number, z: number, roads: readonly Road[]) {
    if (!this.graph || this.graph.n !== roads.length) this.graph = { n: roads.length, g: buildGraph(roads) };
    const F = this.layout.frame;
    const [fx, fz] = toWorld(this.pose, 0, F.zf - 2);
    const pts = route(this.graph.g, { x: fx, z: fz }, { x, z });
    if (!pts || pts.length < 2) return false;
    // (picked on the move — at the screen, driving — it carries on at the speed it's doing)
    const v0 = this.rolling ? Math.max(0, this.trip ? this.trip.v : this.hand.v) : 0;
    const path = lanePath(pts, { driveLeft: this.o.driveLeft, start: { x: this.pose.x, z: this.pose.z, yaw: this.pose.yaw }, v0 });
    if (path.length < 2) return false;
    this.pending = path;
    this.pendingV = v0;
    this.tLeft = timeLeft(path);
    this.doorTarget = 0;
    return true;
  }
  /** The pedals and the wheel, at the wheel only (seated, no curtain passing): thr −1…1, steer −1…1
   *  (+ left). Keys are all the way; a phone's stick part way, past its dead zones (vehicles.ts). */
  private wheelInput(w: VanWalker) {
    if (this.mode !== 'cab' || this.seatT < 1 || this.wipe || this.scr.on || (this.o.enabled && !this.o.enabled())) return { thr: 0, steer: 0 };
    const k = (c: string) => this.keys.has(c), ax = (pos: string[], neg: string[]) => (pos.some(k) ? 1 : 0) - (neg.some(k) ? 1 : 0);
    const t = w.touchAxes ? stickAxes(w.touchAxes.x, w.touchAxes.y) : { x: 0, y: 0 };
    const c = (v: number) => Math.max(-1, Math.min(1, v));
    return { thr: c(ax(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) - t.y), steer: c(ax(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) - t.x) };
  }
  /** Under way: out of the world's walls while it moves (the town's bloom, if you never stepped out). */
  private depart() {
    this.rolling = true;
    this.onDepart?.();
    this.o.walk.removeScope(SCOPE, true);
    this.registered = false;
  }
  /** Stopped for good: parked where it stands, back in the world's walls. */
  private arrive() {
    this.trip = null;
    this.rolling = false;
    this.hand.v = this.hand.steer = 0;
    this.steer = 0;
    this.wheelMesh.rotation.z = 0;
    this.park({ ...this.pose });
    this.onArrive?.();
  }

  /** Before the walker moves: the drive on (its own, or yours at the wheel), the van's pose with it,
   *  and you carried along. */
  move(dt: number, w: VanWalker) {
    let inp = this.wheelInput(w);
    if (this.trip || this.pending) {
      // driving itself: the pedals and the wheel don't move it — hold a pedal (W or S; a phone's stick
      // up or down) and you take the wheel, at the speed it was doing
      this.takeT = inp.thr !== 0 ? this.takeT + dt : 0;
      if (this.takeT < TAKE_S) inp = { thr: 0, steer: 0 };
      else {
        this.hand.v = this.trip?.v ?? 0;
        this.hand.steer = 0;
        this.trip = null;
        this.pending = null;
        this.takeT = 0;
        this.onTakeWheel?.();
      }
    } else this.takeT = 0;
    if (this.pending && this.doors < 0.02) {
      // the doors are shut: off we go (already on the move — a new destination — it carries on)
      this.trip = new Drive(this.pending, this.pendingV);
      this.pending = null;
      this.hand.v = this.hand.steer = 0;
      if (!this.rolling) this.depart();
    }
    const T = this.trip;
    dt = Math.min(dt, 0.05);
    if (!T && !this.rolling && inp.thr === 0) {
      // parked: the wheel turns in your hands, and nothing moves till you press on
      const s = this.hand;
      if (s.steer !== 0 || inp.steer !== 0) {
        s.steer += (inp.steer - s.steer) * Math.min(1, dt * HANDLING.steerRate);
        if (inp.steer === 0 && Math.abs(s.steer) < 1e-3) s.steer = 0;
        this.wheelMesh.rotation.z = this.steer = s.steer * 2.4;
        this.wheelMesh.updateMatrixWorld();
      }
      return;
    }
    const old = { ...this.pose };
    if (T) {
      const p = T.step(dt);
      const dyaw = Math.atan2(Math.sin(p.yaw - old.yaw), Math.cos(p.yaw - old.yaw));
      // (the heading eased — never a twitch, and never turning faster than a van can at this speed: a
      // 4 m turning radius — and the steering wheel turned by how fast it turns)
      const most = (T.v / 4 + 0.1) * dt;
      this.pose.x = p.x;
      this.pose.z = p.z;
      this.pose.yaw = old.yaw + Math.max(-most, Math.min(most, dyaw * Math.min(1, dt * 8)));
      const rate = (this.pose.yaw - old.yaw) / Math.max(dt, 1e-3);
      this.steer += (Math.max(-1, Math.min(1, rate * 6 / Math.max(2, T.v))) * 2.4 - this.steer) * Math.min(1, dt * 5);
    } else {
      // by hand: the pedals and the wheel yours; nobody at the wheel (or you looking at the screen), it
      // brakes to a stop
      if (!this.rolling) this.depart();
      const s = this.hand, L = this.layout, r = L.recipe.W / 2 + 0.04, half = Math.max(0, L.recipe.L / 2 - r);
      s.yaw = old.yaw;
      const d = stepWheel(s, inp.thr, inp.steer, dt, this.mode !== 'cab' || this.scr.on);
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      // against the world's walls, its own shape sliding along them (vehicles.ts carMove): it bumps off
      const [nx, nz] = this.o.walk.moveBody(old.x, old.z, fx * d, fz * d, fx, fz, half, half, r, old.y);
      const got = Math.hypot(nx - old.x, nz - old.z);
      if (Math.abs(d) > 1e-4 && got < Math.abs(d) * 0.5) s.v *= 0.35;
      this.pose.x = nx;
      this.pose.z = nz;
      this.pose.yaw = s.yaw;
      this.steer += (s.steer * 2.4 - this.steer) * Math.min(1, dt * 10); // (the wheel in your hands)
    }
    this.wheelMesh.rotation.z = this.steer;
    const y = this.o.ground ? this.o.ground(this.pose.x, this.pose.z, old.y) : old.y;
    this.pose.y = old.y + (y - old.y) * Math.min(1, dt * 6);
    this.group.position.set(this.pose.x, this.pose.y, this.pose.z);
    this.group.rotation.set(0, this.pose.yaw, 0);
    this.group.updateMatrix();
    this.group.updateMatrixWorld(true);
    // carry you: in the room your spot in the van holds; at the wheel the seat (seat()) does
    if (this.mode === 'in') {
      const [lx, lz] = toLocal(old, w.x, w.z), [nx, nz] = toWorld(this.pose, lx, lz);
      w.shift(nx - w.x, this.pose.y - old.y, nz - w.z, this.pose.yaw - old.yaw);
    } else if (this.mode === 'cab') w.yaw += this.pose.yaw - old.yaw;
    const v = T ? T.v : this.hand.v;
    if (Math.abs(v) > 0.5) this.onMove?.(this.pose.x, this.pose.z, -Math.sin(this.pose.yaw) * v, -Math.cos(this.pose.yaw) * v);
    // it parks: at the end of its drive, or stopped with nobody at the wheel
    if (T ? T.done : this.mode !== 'cab' && this.hand.v === 0) this.arrive();
  }
  private cam = new THREE.Vector3();

  /** The doors open (or shut) at once (shots; a reload into an open van). */
  openDoors(open = true) {
    this.doorTarget = this.doors = open ? 1 : 0;
    this.leaves.forEach((p, i) => { p.rotation.y = open ? (i === 0 ? 1 : -1) * DOOR_OPEN : 0; p.updateMatrix(); p.userData.set = true; });
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

  /** Before the frame's draw: outside with the doorway or a window in view, the room drawn into the
   *  portal's target from this camera. `size`: the frame's render target (post.ts sceneRT). */
  beforeRender(r: THREE.WebGLRenderer, cam: THREE.Camera, size: THREE.Vector2, origin: THREE.Vector3) {
    this.placeRoom(origin);
    // each side of the cargo box only from outside it (its shadow cast either way) — and from there,
    // the room through its windows
    cam.getWorldPosition(this.cam);
    const [cx, cz] = toLocal(this.pose, this.cam.x + origin.x, this.cam.z + origin.z);
    const outside = this.mode === 'out' || this.chasing; // (behind the van at the wheel, you see it as from outside)
    const side = outside ? peekSide(this.layout, cx) : 0;
    this.sides[0].material = side < 0 ? this.paintMat : this.hiddenMat;
    this.sides[1].material = side > 0 ? this.paintMat : this.hiddenMat;
    this.portalOn = false;
    if (!outside) return;
    // what of the portal is in view: the doorway (from behind the van, or in its passage — shut, its
    // doors' windows show it), and the windows of the side you're beside
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const w = Math.max(4, size.x), h = Math.max(4, size.y), M = this.portalRoot.matrixWorld;
    let rect: [number, number, number, number] | null | undefined; // (undefined: none of it in view; null: the whole frame)
    for (const b of [cz > this.layout.tunnel.z0 ? this.doorBox : null, side ? this.winBox[side < 0 ? 0 : 1] : null]) {
      if (!b || !this.frustum.intersectsBox(this.box3.copy(b).applyMatrix4(M))) continue;
      const q = this.screenRect(this.box3, cam, w, h);
      rect = rect === undefined ? q : rect && q ? [Math.min(rect[0], q[0]), Math.min(rect[1], q[1]), Math.max(rect[0] + rect[2], q[0] + q[2]) - Math.min(rect[0], q[0]), Math.max(rect[1] + rect[3], q[1] + q[3]) - Math.min(rect[1], q[1])] : null;
    }
    if (rect === undefined) return;
    if (!this.portalRT) this.portalRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    else if (this.portalRT.width !== w || this.portalRT.height !== h) this.portalRT.setSize(w, h);
    this.portalMat.uniforms.tPortal.value = this.portalRT.texture;
    this.portalMat.uniforms.tPortalDepth.value = this.portalRT.depthTexture;
    this.portalOn = true;
    // only the portal's patch of the screen: the room shaded there and nowhere else (from across
    // the car park the doorway is a few hundred pixels; in the passage, most of the frame)
    this.portalRT.scissorTest = !!rect;
    if (rect) this.portalRT.scissor.set(rect[0], rect[1], rect[2], rect[3]);
    this.shellMat.depthFunc = THREE.LessEqualDepth;
    this.clip.value.fromArray(windowClip(this.layout, side));
    const prev = r.getRenderTarget(), a = r.getClearAlpha();
    r.getClearColor(this.clearC);
    r.setRenderTarget(this.portalRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.roomScene, cam);
    r.setClearColor(this.clearC, a);
    r.setRenderTarget(prev);
    this.clip.value.set(0, 0, 0, 1);
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
