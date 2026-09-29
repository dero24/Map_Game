// First-person walker: pointer-lock mouse look, WASD, gentle head bob, eye height over ground/decks.
import * as THREE from 'three';
import type { WalkWorld } from './collision';

export const walkParams = { speed: 2.4, runSpeed: 6, eyeHeight: 1.65, bob: 0.35, fov: 62, fly: false, flySpeed: 40, mouseSens: 1 };

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
  /** Degrees off the field of view: a brief push-in (the brush, as a painted thing dries). */
  zoom = 0;
  distance = 0;
  // Touch: left ~45% of the screen is a floating joystick (analog walk, full push = run),
  // the rest is a look-drag region. The stick UI is injected on first touch.
  private tMove = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private tLook = { id: -1, lx: 0, ly: 0 };
  private stick?: HTMLElement;
  private knob?: HTMLElement;

  constructor(private world: WalkWorld, private dom: HTMLElement) {
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
    const STICK_R = 56;
    dom.addEventListener('touchstart', (e) => {
      document.body.classList.add('touch');
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.45 && this.tMove.id < 0) {
          this.tMove = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          const s = this.stick ?? this.mkStick();
          s.style.transform = `translate(${t.clientX - STICK_R - 8}px, ${t.clientY - STICK_R - 8}px)`;
          this.knob!.style.transform = 'translate(0px, 0px)';
          s.classList.add('on');
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
          if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
          this.tMove.x = dx / STICK_R;
          this.tMove.y = dy / STICK_R;
          if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === this.tLook.id) {
          const s = this.holdLook ? 0 : 0.0045;
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
        } else if (t.identifier === this.tLook.id) this.tLook = { id: -1, lx: 0, ly: 0 };
      }
    };
    dom.addEventListener('touchend', touchEnd);
    dom.addEventListener('touchcancel', touchEnd);
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
    this.surfaceY = this.world.surfaceAt(x, z, feet);
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
    } else {
      if (len > 0) {
        const sp = (run ? walkParams.runSpeed : walkParams.speed) * mag * dt;
        const dx = ((fx * f + rx * s) / len) * sp, dz = ((fz * f + rz * s) / len) * sp;
        const [nx, nz] = this.world.move(this.x, this.z, dx, dz, 0.32, this.surfaceY);
        const moved = Math.hypot(nx - this.x, nz - this.z);
        this.distance += moved;
        this.bobPhase += moved * 1.9;
        this.x = nx;
        this.z = nz;
      }
      const target = this.world.surfaceAt(this.x, this.z, this.surfaceY);
      // step up quickly (stairs), settle down gently — but drop, don't float, off a real ledge
      const rate = target > this.surfaceY ? 14 : this.surfaceY - target > 1.2 ? 16 : 9;
      if (isFinite(target)) this.surfaceY += (target - this.surfaceY) * Math.min(1, dt * rate);
      const bob = Math.sin(this.bobPhase) * 0.035 * walkParams.bob * (len > 0 ? 1 : 0);
      this.y = this.surfaceY + walkParams.eyeHeight + bob;
    }
    cam.position.set(this.x, this.y, this.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase * 0.5) * 0.004 * walkParams.bob, 'YXZ');
    const fov = walkParams.fov - this.zoom;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  pressed(code: string) { return this.keys.has(code); }
  /** Walking forward right now — keys or the touch stick pushed up (walk-in boarding, vehicles.ts). */
  get pushing() { return this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.tMove.y < -0.35; }
  get feet() { return this.surfaceY; }
}
