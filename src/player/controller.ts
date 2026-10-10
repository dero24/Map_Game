// First-person walker: pointer-lock mouse look, WASD, gentle head bob, eye height over ground/decks.
import * as THREE from 'three';
import type { WalkWorld } from './collision';
import { frameFov } from './frame';

/** The ground a walker moves over: the world's WalkWorld, or a room of its own (the van's: van/space.ts). */
export interface WalkGround {
  move(x: number, z: number, dx: number, dz: number, r?: number, feetY?: number): [number, number];
  surfaceAt(x: number, z: number, feetY?: number): number;
}

/** `fov` is the lens: the vertical angle on a PC's 4:3–16:9 screen. A phone's frame is fitted to
 *  its shape from it (player/frame.ts) — taller held upright, no wider than 95° on its side. */
/** `cabFov`: the lens from the van's driver's seat (wider: the windshield, the mirrors — van/van.ts). */
export const walkParams = { speed: 2.4, runSpeed: 6, eyeHeight: 1.65, bob: 0.35, fov: 62, fly: false, flySpeed: 40, mouseSens: 1, cabFov: 74 };

/** Point the camera's lens: `lens`° (walkParams.fov, less any push-in), framed for the screen's
 *  shape. Every camera that follows you (on foot, the chase, the basket) and the resize call it. */
export function setLens(cam: THREE.PerspectiveCamera, lens = walkParams.fov) {
  const fov = frameFov(lens, cam.aspect);
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

export class Walker {
  x = 0;
  z = 0;
  y = 2;
  yaw = 0; // radians, 0 = looking north (-z)
  pitch = 0;
  private keys = new Set<string>();
  private bobPhase = 0;
  private surfaceY = 0;
  locked = false;
  /** the brush is washing colour in: rubbing it mustn't turn your head (ui/brush.ts) */
  holdLook = false;
  /** a lift ride is under way: no walking (player/lift.ts) */
  holdMove = false;
  /** (a phone) the street under you isn't built yet — its buildings still silhouettes with no walls:
   *  you wait where you stand until it is (main.ts) */
  waitGround = false;
  /** Degrees off the field of view: a brief push-in (the brush, as a painted thing dries). */
  zoom = 0;
  /** Where you walk instead of the world (the van's room, while you're in it: van/van.ts); null: the world. */
  space: WalkGround | null = null;
  /** The touch ▲ ▼ buttons while flying: +1 climbs, −1 sinks, at the flying speed — with the stick
   *  idle too (the keyboard's Space and C ride on the movement, as they always have). */
  climb = 0;
  distance = 0;
  // Touch: left ~45% of the screen is a floating joystick (analog walk, full push = run),
  // the rest is a look-drag region. The stick UI is injected on first touch (its resting ring is
  // index.html's #stick-home).
  private tMove = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private tLook = { id: -1, lx: 0, ly: 0 };
  private stick?: HTMLElement;
  private knob?: HTMLElement;

  constructor(private world: WalkWorld, private dom: HTMLElement) {
    if (this.taught) document.body.classList.add('stick-taught');
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('.lil-gui')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF' && !e.repeat) this.setFly(!walkParams.fly);
      if (e.code === 'Space' && walkParams.fly) e.preventDefault();
    });
    window.addEventListener('wheel', (e) => {
      if (!walkParams.fly || (e.target as HTMLElement)?.closest?.('.lil-gui')) return;
      walkParams.flySpeed = Math.max(3, Math.min(400, walkParams.flySpeed * (e.deltaY > 0 ? 0.85 : 1.18)));
    }, { passive: true });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousemove', (e) => {
      if (!this.locked || this.holdLook) return;
      const s = 0.0022 * walkParams.mouseSens;
      this.yaw -= e.movementX * s;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - e.movementY * s));
    });
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === dom));

    // ---- touch ----
    // (the stick comes to your thumb: centred where it lands, and dragged along behind it past the
    // rim — a thumb that wanders off the stick keeps walking, it never has to lift and find it again)
    const STICK_R = 50;
    const place = (s: HTMLElement) => {
      const half = s.offsetWidth / 2 || 58;
      s.style.transform = `translate(${this.tMove.ox - half}px, ${this.tMove.oy - half}px)`;
    };
    dom.addEventListener('touchstart', (e) => {
      document.body.classList.add('touch');
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.45 && this.tMove.id < 0) {
          this.tMove = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          const s = this.stick ?? this.mkStick();
          s.classList.add('on');
          place(s);
          this.knob!.style.transform = 'translate(0px, 0px)';
          document.body.classList.add('stick-on');
        } else if (this.tLook.id < 0) this.tLook = { id: t.identifier, lx: t.clientX, ly: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    dom.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.tMove.id) {
          let dx = t.clientX - this.tMove.ox, dy = t.clientY - this.tMove.oy;
          const l = Math.hypot(dx, dy);
          if (l > STICK_R) {
            this.tMove.ox += dx * (1 - STICK_R / l);
            this.tMove.oy += dy * (1 - STICK_R / l);
            dx *= STICK_R / l;
            dy *= STICK_R / l;
            if (this.stick) place(this.stick);
          }
          this.tMove.x = dx / STICK_R;
          this.tMove.y = dy / STICK_R;
          if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
          if (l > STICK_R * 0.5 && !this.taught) this.teach();
        } else if (t.identifier === this.tLook.id) {
          const s = this.holdLook ? 0 : 0.0045 * walkParams.mouseSens;
          this.yaw -= (t.clientX - this.tLook.lx) * s;
          this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - (t.clientY - this.tLook.ly) * s));
          this.tLook.lx = t.clientX;
          this.tLook.ly = t.clientY;
        }
      }
    }, { passive: false });
    const touchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.tMove.id) {
          this.tMove = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
          this.stick?.classList.remove('on');
          document.body.classList.remove('stick-on');
        } else if (t.identifier === this.tLook.id) this.tLook = { id: -1, lx: 0, ly: 0 };
      }
    };
    dom.addEventListener('touchend', touchEnd);
    dom.addEventListener('touchcancel', touchEnd);
  }

  // The resting stick says "walk" until you've walked with it once (on this device, for good).
  private taught = (() => { try { return localStorage.getItem('map-game.stick-taught.v1') === '1'; } catch { return false; } })();
  private teach() {
    this.taught = true;
    document.body.classList.add('stick-taught');
    try { localStorage.setItem('map-game.stick-taught.v1', '1'); } catch { /* private mode: it just says so again next time */ }
  }

  private mkStick() {
    const s = document.createElement('div');
    s.id = 'stick';
    this.knob = document.createElement('div');
    s.appendChild(this.knob);
    document.body.appendChild(s);
    return (this.stick = s);
  }

  lock() { void (this.dom.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => { /* embedded panes refuse pointer lock */ }); }

  // Take off where you stand, or come down to the nearest walkable spot below you.
  setFly(on: boolean) {
    if (on === walkParams.fly) return;
    walkParams.fly = on;
    if (on) { this.y += 0.5; return; }
    const [x, z] = this.world.nearestWalkable(this.x, this.z);
    const inBuilding = this.world.buildingAt(x, z) >= 0;
    this.x = x;
    this.z = z;
    // landing on a building drops you onto its top storey, otherwise onto the ground/deck
    this.surfaceY = this.world.surfaceAt(x, z, inBuilding ? this.y - walkParams.eyeHeight : this.world.surfaceAt(x, z));
    this.y = this.surfaceY + walkParams.eyeHeight;
  }

  place(x: number, z: number, yaw = this.yaw, pitch = 0, feet?: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = pitch;
    this.surfaceY = (this.space ?? this.world).surfaceAt(x, z, feet);
    this.y = this.surfaceY + walkParams.eyeHeight;
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (!this.locked) {
      if (k.has('KeyQ')) this.yaw += dt * 1.5;
      if (k.has('KeyE')) this.yaw -= dt * 1.5;
    }
    // merge the touch stick: up on the stick is -y = forward
    if (this.tMove.id >= 0 || this.tMove.x !== 0 || this.tMove.y !== 0) {
      f += -this.tMove.y;
      s += this.tMove.x;
    }
    const analog = Math.min(1, Math.hypot(this.tMove.x, this.tMove.y));
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || analog > 0.85;
    if (this.holdMove || this.waitGround) f = s = 0;
    const len = Math.hypot(f, s);
    const mag = Math.min(1, len); // keys land on integers (mag 1); the stick is analog
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    if (walkParams.fly) {
      const sp = walkParams.flySpeed * (run ? 4 : 1) * mag * dt;
      const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
      if (len > 0) {
        this.x += ((fx * cp * f + rx * s) / len) * sp;
        this.z += ((fz * cp * f + rz * s) / len) * sp;
        this.y += ((sp2 * f) / len) * sp;
      }
      if (k.has('Space')) this.y += sp;
      if (k.has('KeyC')) this.y -= sp;
      if (this.climb) this.y += this.climb * walkParams.flySpeed * (run ? 4 : 1) * dt;
    } else {
      if (len > 0) {
        const sp = (run ? walkParams.runSpeed : walkParams.speed) * mag * dt;
        const dx = ((fx * f + rx * s) / len) * sp, dz = ((fz * f + rz * s) / len) * sp;
        const [nx, nz] = (this.space ?? this.world).move(this.x, this.z, dx, dz, 0.32, this.surfaceY);
        const moved = Math.hypot(nx - this.x, nz - this.z);
        this.distance += moved;
        this.bobPhase += moved * 1.9;
        this.x = nx;
        this.z = nz;
      }
      const target = (this.space ?? this.world).surfaceAt(this.x, this.z, this.surfaceY);
      // step up quickly (stairs), settle down gently — but drop, don't float, off a real ledge
      const rate = target > this.surfaceY ? 14 : this.surfaceY - target > 1.2 ? 16 : 9;
      if (isFinite(target)) this.surfaceY += (target - this.surfaceY) * Math.min(1, dt * rate);
      const bob = Math.sin(this.bobPhase) * 0.035 * walkParams.bob * (len > 0 ? 1 : 0);
      this.y = this.surfaceY + walkParams.eyeHeight + bob;
    }
    cam.position.set(this.x, this.y, this.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase * 0.5) * 0.004 * walkParams.bob, 'YXZ');
    setLens(cam, walkParams.fov - this.zoom);
  }

  /** Carried (the van moving under you): shifted and turned with it, feet and all. */
  shift(dx: number, dy: number, dz: number, dyaw: number) {
    this.x += dx;
    this.z += dz;
    this.y += dy;
    this.surfaceY += dy;
    this.yaw += dyaw;
  }

  pressed(code: string) { return this.keys.has(code); }
  /** Let go of the stick and the look drag: a pinch took the fingers over (photo zoom), or the
   *  page went to sleep mid-drag and the finger's touchend may never come. */
  releaseTouches() {
    this.tMove = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.tLook = { id: -1, lx: 0, ly: 0 };
    this.stick?.classList.remove('on');
    document.body.classList.remove('stick-on');
  }
  /** Normalized left-stick axes; vehicles reuse the same stick while the walker is aboard. */
  get touchAxes() { return { x: this.tMove.x, y: this.tMove.y }; }
  /** Walking forward right now — keys or the touch stick pushed up (walk-in boarding, vehicles.ts). */
  get pushing() { return this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.tMove.y < -0.35; }
  get feet() { return this.surfaceY; }
}
