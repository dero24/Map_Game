const d = {
    maxUnits: 131072,
    mapW: 1600,
    mapH: 900,
    gridCell: 4,
    flowCell: 8,
    simHz: 15,
    attackRange: 36,
    specialMinArmy: 500,
    giantEvery: 2500,
    mix: { scout: 0.12, mlrs: 0.03, destroyer: 0.05, drone: 0.08 },
    separationRadius: 2.8,
    wallAvoidDist: 4,
    neighborCap: 8,
    marchFlowDist: 120,
    retargetBuckets: 8,
    flowRefreshTicks: 4,
    eventCapacity: 4096,
    defaultRed: 3e4,
    defaultBlue: 3e4,
    seed: 1337,
  },
  O = 1 / d.simHz,
  B = [
    {
      radius: 1.2,
      hp: 100,
      speed: 8,
      turn: 1.9,
      turretRate: 1.5,
      range: 36,
      cooldown: 45,
      damage: 34,
      projSpeed: 80,
      aoe: 0,
      volley: 1,
      fly: 0,
      kite: 0,
      hitRun: 0,
      muzzle: 3.4,
    },
    {
      radius: 3,
      hp: 1e3,
      speed: 6,
      turn: 0.8,
      turretRate: 0.55,
      range: 70,
      cooldown: 90,
      damage: 130,
      projSpeed: 55,
      aoe: 14,
      volley: 1,
      fly: 0,
      kite: 0,
      hitRun: 0,
      muzzle: 9.3,
    },
    {
      radius: 1,
      hp: 36,
      speed: 15,
      turn: 4,
      turretRate: 3,
      range: 28,
      cooldown: 15,
      damage: 8,
      projSpeed: 95,
      aoe: 0,
      volley: 1,
      fly: 0,
      kite: 0,
      hitRun: 1,
      muzzle: 1.2,
    },
    {
      radius: 1.4,
      hp: 70,
      speed: 7,
      turn: 1.6,
      turretRate: 0.9,
      range: 58,
      cooldown: 80,
      damage: 26,
      projSpeed: 42,
      aoe: 6,
      volley: 6,
      fly: 0,
      kite: 0.5,
      hitRun: 0,
      muzzle: 1.3,
    },
    {
      radius: 1.3,
      hp: 60,
      speed: 7.5,
      turn: 1.6,
      turretRate: 1.2,
      range: 55,
      cooldown: 55,
      damage: 85,
      projSpeed: 300,
      aoe: 0,
      volley: 1,
      fly: 0,
      kite: 0.55,
      hitRun: 0,
      muzzle: 3.6,
    },
    {
      radius: 0.9,
      hp: 30,
      speed: 16,
      turn: 3,
      turretRate: 6,
      range: 30,
      cooldown: 27,
      damage: 13,
      projSpeed: 95,
      aoe: 0,
      volley: 1,
      fly: 1,
      kite: 0,
      hitRun: 0,
      muzzle: 0.5,
    },
  ],
  ot = new Uint8Array(B.map((h) => h.fly)),
  I = {
    TICK: 0,
    FRONT: 1,
    COUNT: 2,
    ALIVE_RED: 3,
    ALIVE_BLUE: 4,
    SIM_MS_X100: 5,
    SPEED_X100: 6,
    REQ_RED: 7,
    REQ_BLUE: 8,
    REQ_RESTART: 9,
    RESTART_ACK: 10,
    EV_DROPPED: 11,
    SIZE: 16,
  },
  P = { SHOT: 1, DEATH: 2, GSHOT: 3, RSHOT: 4, BEAM: 5, DSHOT: 6 },
  K = 10,
  G = 6;
function xt(h, t) {
  const e = I.SIZE * 4,
    n = h * K * 4,
    i = e + n,
    s = i + n,
    r = s + 8;
  return {
    total: r + t * G * 4,
    offsets: { header: 0, snap0: e, snap1: i, evHead: s, ev: r },
  };
}
function ut(h, t, e) {
  const n = xt(t, e).offsets;
  return {
    header: new Int32Array(h, n.header, I.SIZE),
    snaps: [
      new Float32Array(h, n.snap0, t * K),
      new Float32Array(h, n.snap1, t * K),
    ],
    evHead: new Int32Array(h, n.evHead, 2),
    evI32: new Int32Array(h, n.ev, e * G),
    evF32: new Float32Array(h, n.ev, e * G),
  };
}
class yt {
  constructor(t, e, n, i, s) {
    ((this.head = t),
      (this.i32 = e),
      (this.f32 = n),
      (this.cap = i),
      (this.header = s));
  }
  push(t, e, n, i, s, r) {
    const o = Atomics.load(this.head, 0);
    if (o - Atomics.load(this.head, 1) >= this.cap)
      return (this.header[I.EV_DROPPED]++, !1);
    const l = (o % this.cap) * G;
    return (
      (this.i32[l] = t),
      (this.f32[l + 1] = e),
      (this.f32[l + 2] = n),
      (this.f32[l + 3] = i),
      (this.f32[l + 4] = s),
      (this.f32[l + 5] = r),
      Atomics.store(this.head, 0, o + 1),
      !0
    );
  }
}
function Mt(h) {
  let t = h | 0 || 2654435769,
    e = 608135816 ^ h,
    n = 3084996962,
    i = (3735928559 + h) | 0;
  function s() {
    const r = i,
      o = t;
    ((i = n), (n = e), (e = o));
    let l = r ^ (r << 11);
    return ((l ^= l >>> 8), (t = (l ^ o ^ (o >>> 19)) | 0), t >>> 0);
  }
  for (let r = 0; r < 8; r++) s();
  return {
    u32: s,
    float: () => s() / 4294967296,
    range: (r, o) => r + (o - r) * (s() / 4294967296),
  };
}
const C = Math.ceil(d.mapW / d.gridCell),
  V = Math.ceil(d.mapH / d.gridCell),
  mt = 360;
function kt(h) {
  const t = Mt(h ^ 24301),
    e = new Uint8Array(C * V),
    n = { rocks: [], walls: [] },
    i = d.mapW - mt - 40;
  for (let r = 0; r < 26; r++)
    n.rocks.push({
      x: t.range(400, i),
      z: t.range(60, d.mapH - 60),
      r: t.range(8, 22),
    });
  for (let r = 0; r < 8; r++) {
    const o = t.float() < 0.5;
    n.walls.push({
      x: t.range(400, i),
      z: t.range(80, d.mapH - 80),
      w: o ? t.range(50, 110) : 7,
      h: o ? 7 : t.range(50, 110),
    });
  }
  for (let r = 0; r < V; r++)
    for (let o = 0; o < C; o++) {
      const l = (o + 0.5) * d.gridCell,
        w = (r + 0.5) * d.gridCell;
      let c = 0;
      for (const f of n.rocks) {
        const p = l - f.x,
          a = w - f.z;
        if (p * p + a * a < f.r * f.r) {
          c = 1;
          break;
        }
      }
      if (!c) {
        for (const f of n.walls)
          if (Math.abs(l - f.x) < f.w / 2 && Math.abs(w - f.z) < f.h / 2) {
            c = 1;
            break;
          }
      }
      e[r * C + o] = c;
    }
  const s = Math.floor(mt / d.gridCell);
  for (let r = 0; r < V; r++)
    for (let o = 0; o < C; o++) {
      if (o === 0 || r === 0 || o === C - 1 || r === V - 1) {
        e[r * C + o] = 1;
        continue;
      }
      (o < s || o >= C - s) && (e[r * C + o] = 0);
    }
  return { blocked: e, shapes: n };
}
const wt = 1e9;
class dt {
  nextId = 1;
  count = 0;
  constructor(t) {
    this.cap = t;
    const e = () => new Float32Array(t),
      n = () => new Int32Array(t),
      i = () => new Uint8Array(t);
    ((this.posX = e()),
      (this.posZ = e()),
      (this.heading = e()),
      (this.turretYaw = e()),
      (this.prevX = e()),
      (this.prevZ = e()),
      (this.prevHeading = e()),
      (this.prevTurretYaw = e()),
      (this.hp = e()),
      (this.cooldown = e()),
      (this.orderX = e()),
      (this.orderZ = e()),
      (this.recoil = e()),
      (this.targetIdx = n()),
      (this.targetId = n()),
      (this.ids = n()),
      (this.team = i()),
      (this.state = i()),
      (this.holding = i()),
      (this.kind = i()),
      (this.selected = i()),
      (this.order = i()));
  }
  static composition(t) {
    if (t < d.specialMinArmy)
      return { giant: 0, scout: 0, mlrs: 0, destroyer: 0, drone: 0, tank: t };
    const e = Math.max(1, Math.round(t / d.giantEvery)),
      n = Math.round(t * d.mix.scout),
      i = Math.round(t * d.mix.mlrs),
      s = Math.round(t * d.mix.destroyer),
      r = Math.round(t * d.mix.drone);
    return {
      giant: e,
      scout: n,
      mlrs: i,
      destroyer: s,
      drone: r,
      tank: t - e - n - i - r - s,
    };
  }
  spawnArmies(t, e, n) {
    ((this.count = 0),
      this.spawnSide(t, 0, n),
      this.spawnSide(e, 1, n),
      this.nextIdCheck());
  }
  spawnSide(t, e, n) {
    const i = (l) => (e === 0 ? 320 - l : d.mapW - 320 + l),
      s = dt.composition(t),
      r = this.spawnBlock(s.tank, 0, e, i(0), n, 3.4, "block");
    (this.spawnBlock(s.scout, 2, e, i(-90), n, 5, "strip"),
      this.spawnBlock(s.drone, 5, e, i(15), n, 7, "strip"));
    let o = r + 10;
    ((o += this.spawnBlock(s.destroyer, 4, e, i(o), n, 5, "strip") + 10),
      (o += this.spawnBlock(s.mlrs, 3, e, i(o), n, 6, "strip") + 12),
      this.spawnBlock(s.giant, 1, e, i(o), n, 18, "strip"));
  }
  spawnBlock(t, e, n, i, s, r, o) {
    if (t <= 0) return 0;
    const l = d.mapH - 40,
      w = Math.max(2, Math.min(r, Math.sqrt((310 * l) / t) * 0.98));
    let c = Math.min(
      o === "strip" ? t : Math.ceil(Math.sqrt(t * 2.2)),
      Math.floor(l / w),
    );
    Math.ceil(t / c) * w > 310 && (c = Math.ceil(t / Math.floor(310 / w)));
    const f = n === 0 ? -1 : 1,
      p = B[e];
    for (let a = 0; a < t; a++) {
      const g = (a / c) | 0,
        M = a % c,
        u = this.count++,
        x = i + f * g * w + s.range(-0.6, 0.6),
        m = d.mapH / 2 + (M - c / 2) * w + s.range(-0.6, 0.6);
      ((this.posX[u] = Math.min(Math.max(x, 6), d.mapW - 6)),
        (this.posZ[u] = Math.min(Math.max(m, 6), d.mapH - 6)),
        (this.heading[u] = n === 0 ? 0 : Math.PI),
        (this.turretYaw[u] = this.heading[u]),
        (this.prevX[u] = this.posX[u]),
        (this.prevZ[u] = this.posZ[u]),
        (this.prevHeading[u] = this.heading[u]),
        (this.prevTurretYaw[u] = this.turretYaw[u]),
        (this.hp[u] = p.hp),
        (this.cooldown[u] = a % 16),
        (this.targetIdx[u] = -1),
        (this.targetId[u] = 0),
        (this.team[u] = n),
        (this.state[u] = 0),
        (this.holding[u] = 0),
        (this.kind[u] = e),
        (this.ids[u] = this.nextId++));
    }
    return Math.ceil(t / c) * w;
  }
  nextIdCheck() {
    this.nextId > 2e9 && (this.nextId = 1);
  }
  hasValidTarget(t) {
    const e = this.targetIdx[t];
    return e >= 0 && e < this.count && this.ids[e] === this.targetId[t];
  }
  kill(t) {
    const e = --this.count;
    t !== e &&
      ((this.posX[t] = this.posX[e]),
      (this.posZ[t] = this.posZ[e]),
      (this.heading[t] = this.heading[e]),
      (this.turretYaw[t] = this.turretYaw[e]),
      (this.prevX[t] = this.prevX[e]),
      (this.prevZ[t] = this.prevZ[e]),
      (this.prevHeading[t] = this.prevHeading[e]),
      (this.prevTurretYaw[t] = this.prevTurretYaw[e]),
      (this.hp[t] = this.hp[e]),
      (this.cooldown[t] = this.cooldown[e]),
      (this.targetIdx[t] = this.targetIdx[e]),
      (this.targetId[t] = this.targetId[e]),
      (this.team[t] = this.team[e]),
      (this.state[t] = this.state[e]),
      (this.holding[t] = this.holding[e]),
      (this.kind[t] = this.kind[e]),
      (this.selected[t] = this.selected[e]),
      (this.order[t] = this.order[e]),
      (this.orderX[t] = this.orderX[e]),
      (this.orderZ[t] = this.orderZ[e]),
      (this.recoil[t] = this.recoil[e]),
      (this.ids[t] = this.ids[e]));
  }
}
class zt {
  constructor(t, e, n, i) {
    ((this.cellSize = n),
      (this.cellsX = Math.ceil(t / n)),
      (this.cellsZ = Math.ceil(e / n)),
      (this.nCells = this.cellsX * this.cellsZ),
      (this.inv = 1 / n),
      (this.cellStart = new Int32Array(this.nCells + 1)),
      (this.cursor = new Int32Array(this.nCells)),
      (this.indices = new Int32Array(i)),
      (this.cellOf = new Int32Array(i)));
  }
  cellX(t) {
    const e = (t * this.inv) | 0;
    return e < 0 ? 0 : e >= this.cellsX ? this.cellsX - 1 : e;
  }
  cellZ(t) {
    const e = (t * this.inv) | 0;
    return e < 0 ? 0 : e >= this.cellsZ ? this.cellsZ - 1 : e;
  }
  build(t, e, n) {
    this.cursor.fill(0);
    for (let s = 0; s < n; s++) {
      const r = this.cellZ(e[s]) * this.cellsX + this.cellX(t[s]);
      ((this.cellOf[s] = r), this.cursor[r]++);
    }
    let i = 0;
    for (let s = 0; s < this.nCells; s++)
      ((this.cellStart[s] = i),
        (i += this.cursor[s]),
        (this.cursor[s] = this.cellStart[s]));
    this.cellStart[this.nCells] = i;
    for (let s = 0; s < n; s++) this.indices[this.cursor[this.cellOf[s]]++] = s;
  }
  queryCircle(t, e, n, i, s, r) {
    const o = s * s,
      l = this.cellX(n - s),
      w = this.cellX(n + s),
      c = this.cellZ(i - s),
      f = this.cellZ(i + s);
    for (let p = c; p <= f; p++)
      for (let a = l; a <= w; a++) {
        const g = p * this.cellsX + a;
        for (let M = this.cellStart[g]; M < this.cellStart[g + 1]; M++) {
          const u = this.indices[M],
            x = t[u] - n,
            m = e[u] - i;
          x * x + m * m <= o && r.push(u);
        }
      }
  }
}
class vt {
  constructor(t, e, n, i) {
    ((this.w = t), (this.h = e), (this.cell = n), (this.invCell = 1 / n));
    const s = new Float32Array(t * e).fill(1e9);
    for (let l = 0; l < t * e; l++) i[l] && (s[l] = 0);
    const r = n,
      o = n * Math.SQRT2;
    for (let l = 0; l < e; l++)
      for (let w = 0; w < t; w++) {
        const c = l * t + w;
        let f = s[c];
        (w > 0 && (f = Math.min(f, s[c - 1] + r)),
          l > 0 && (f = Math.min(f, s[c - t] + r)),
          w > 0 && l > 0 && (f = Math.min(f, s[c - t - 1] + o)),
          w < t - 1 && l > 0 && (f = Math.min(f, s[c - t + 1] + o)),
          (s[c] = f));
      }
    for (let l = e - 1; l >= 0; l--)
      for (let w = t - 1; w >= 0; w--) {
        const c = l * t + w;
        let f = s[c];
        (w < t - 1 && (f = Math.min(f, s[c + 1] + r)),
          l < e - 1 && (f = Math.min(f, s[c + t] + r)),
          w < t - 1 && l < e - 1 && (f = Math.min(f, s[c + t + 1] + o)),
          w > 0 && l < e - 1 && (f = Math.min(f, s[c + t - 1] + o)),
          (s[c] = f));
      }
    this.dist = s;
  }
  sample(t, e) {
    let n = (t * this.invCell) | 0,
      i = (e * this.invCell) | 0;
    return (
      n < 0 ? (n = 0) : n >= this.w && (n = this.w - 1),
      i < 0 ? (i = 0) : i >= this.h && (i = this.h - 1),
      this.dist[i * this.w + n]
    );
  }
  grad(t, e, n) {
    const i = this.cell,
      s = this.sample(t + i, e) - this.sample(t - i, e),
      r = this.sample(t, e + i) - this.sample(t, e - i),
      o = Math.hypot(s, r);
    if (o < 1e-6) {
      ((n.x = 0), (n.z = 0));
      return;
    }
    ((n.x = s / o), (n.z = r / o));
  }
}
function At(h, t, e, n, i) {
  const s = new Uint8Array(e * n);
  for (let r = 0; r < n; r++)
    for (let o = 0; o < e; o++) {
      const l = r * e + o;
      if (h[l]) {
        s[l] = 255;
        continue;
      }
      s[l] = t.sample((o + 0.5) * i, (r + 0.5) * i) <= i ? 6 : 1;
    }
  return s;
}
class gt {
  heapSize = 0;
  constructor(t, e, n) {
    ((this.w = t), (this.h = e), (this.cell = n));
    const i = t * e;
    ((this.dist = new Float32Array(i)),
      (this.dirX = new Float32Array(i)),
      (this.dirZ = new Float32Array(i)),
      (this.heapId = new Int32Array(i * 8)),
      (this.heapKey = new Float32Array(i * 8)),
      (this.inv = 1 / n));
  }
  push(t, e) {
    let n = this.heapSize++;
    const i = this.heapId,
      s = this.heapKey;
    for (; n > 0; ) {
      const r = (n - 1) >> 1;
      if (s[r] <= e) break;
      ((i[n] = i[r]), (s[n] = s[r]), (n = r));
    }
    ((i[n] = t), (s[n] = e));
  }
  pop() {
    const t = this.heapId,
      e = this.heapKey,
      n = t[0],
      i = t[--this.heapSize],
      s = e[this.heapSize];
    let r = 0;
    for (;;) {
      let o = r * 2 + 1;
      if (
        o >= this.heapSize ||
        (o + 1 < this.heapSize && e[o + 1] < e[o] && o++, e[o] >= s)
      )
        break;
      ((t[r] = t[o]), (e[r] = e[o]), (r = o));
    }
    return ((t[r] = i), (e[r] = s), n);
  }
  compute(t, e, n, i) {
    const { w: s, h: r, dist: o } = this;
    (o.fill(wt), (this.heapSize = 0));
    for (let p = 0; p < i; p++) {
      let a = (e[p] * this.inv) | 0,
        g = (n[p] * this.inv) | 0;
      (a < 0 ? (a = 0) : a >= s && (a = s - 1),
        g < 0 ? (g = 0) : g >= r && (g = r - 1));
      const M = g * s + a;
      t[M] === 255 || o[M] === 0 || ((o[M] = 0), this.push(M, 0));
    }
    const l = this.cell,
      w = this.cell * Math.SQRT2;
    for (; this.heapSize > 0; ) {
      const p = this.pop(),
        a = o[p],
        g = p % s,
        M = (p / s) | 0;
      for (let u = -1; u <= 1; u++)
        for (let x = -1; x <= 1; x++) {
          if (x === 0 && u === 0) continue;
          const m = g + x,
            y = M + u;
          if (m < 0 || m >= s || y < 0 || y >= r) continue;
          const k = y * s + m;
          if (t[k] === 255) continue;
          const A = a + (x !== 0 && u !== 0 ? w : l) * t[k];
          A < o[k] && ((o[k] = A), this.push(k, A));
        }
    }
    const { dirX: c, dirZ: f } = this;
    for (let p = 0; p < r; p++)
      for (let a = 0; a < s; a++) {
        const g = p * s + a;
        if (o[g] >= wt) {
          ((c[g] = 0), (f[g] = 0));
          continue;
        }
        let M = o[g],
          u = 0,
          x = 0;
        for (let y = -1; y <= 1; y++)
          for (let k = -1; k <= 1; k++) {
            const A = a + k,
              v = p + y;
            if (A < 0 || A >= s || v < 0 || v >= r) continue;
            const b = o[v * s + A];
            b < M && ((M = b), (u = k), (x = y));
          }
        const m = Math.hypot(u, x);
        m > 0 ? ((c[g] = u / m), (f[g] = x / m)) : ((c[g] = 0), (f[g] = 0));
      }
  }
  sample(t, e, n) {
    let i = (t * this.inv) | 0,
      s = (e * this.inv) | 0;
    (i < 0 ? (i = 0) : i >= this.w && (i = this.w - 1),
      s < 0 ? (s = 0) : s >= this.h && (s = this.h - 1));
    const r = s * this.w + i;
    ((n.x = this.dirX[r]), (n.z = this.dirZ[r]));
  }
  sampleDist(t, e) {
    let n = (t * this.inv) | 0,
      i = (e * this.inv) | 0;
    return (
      n < 0 ? (n = 0) : n >= this.w && (n = this.w - 1),
      i < 0 ? (i = 0) : i >= this.h && (i = this.h - 1),
      this.dist[i * this.w + n]
    );
  }
}
const rt = (h) =>
    ((((h + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI,
  W = { x: 0, z: 0 },
  et = { x: 0, z: 0 };
function Rt(h, t, e, n) {
  const {
      posX: i,
      posZ: s,
      heading: r,
      turretYaw: o,
      team: l,
      state: w,
      targetIdx: c,
    } = h,
    f = d.separationRadius,
    p = f * f;
  for (let a = 0; a < h.count; a++) {
    if (w[a] === 2) continue;
    let g = 0,
      M = 0,
      u = 0,
      x = 0;
    const m = B[h.kind[a]],
      y = m.fly === 1,
      k = n[l[a]].sampleDist(i[a], s[a]);
    if (h.order[a] === 1) {
      ((g = h.orderX[a] - i[a]), (M = h.orderZ[a] - s[a]));
      const R = Math.hypot(g, M);
      R < 6 ? ((h.order[a] = 2), (u = +!y)) : ((g /= R), (M /= R));
    } else if (h.order[a] === 2) u = +!y;
    else if (w[a] === 1 && h.hasValidTarget(a)) {
      const R = c[a];
      ((g = i[R] - i[a]), (M = s[R] - s[a]));
      const S = Math.hypot(g, M);
      S > 0.001 && ((g /= S), (M /= S));
      const U = (m.hitRun === 1 || m.kite > 0) && h.hp[a] < m.hp * 0.28;
      if (!y && m.hitRun === 1 && (U || h.cooldown[a] > m.cooldown * 0.45))
        ((g = -g), (M = -M));
      else if (!y && m.kite > 0 && (U || S < m.range * m.kite)) x = 1;
      else {
        const L = k <= d.attackRange * (h.holding[a] === 1 ? 1.15 : 0.9);
        !y && (S <= m.range * 0.92 || L) && (u = 1);
      }
    } else if (!y && k <= d.attackRange * 0.65) u = 1;
    else {
      const R = n[l[a]];
      R.sample(i[a], s[a], W);
      const S = l[a] === 0 ? 1 : -1;
      W.x * S > 0.3 &&
      R.sampleDist(i[a], s[a]) > d.marchFlowDist &&
      (y ||
        (e.sample(i[a] + S * 6, s[a]) > 2 && e.sample(i[a] + S * 12, s[a]) > 2))
        ? ((g = S), (M = 0))
        : ((g = W.x), (M = W.z));
    }
    let A = 0,
      v = 0,
      b = 0;
    const X = t.cellX(i[a]),
      H = t.cellZ(s[a]);
    t: for (let R = -1; R <= 1; R++)
      for (let S = -1; S <= 1; S++) {
        const U = (H + R) * t.cellsX + (X + S);
        if (!(U < 0 || U >= t.nCells))
          for (let L = t.cellStart[U]; L < t.cellStart[U + 1]; L++) {
            const Q = t.indices[L];
            if (Q === a || ot[h.kind[Q]] !== m.fly) continue;
            const J = i[a] - i[Q],
              $ = s[a] - s[Q],
              tt = J * J + $ * $;
            if (tt > p || tt < 1e-6) continue;
            const ft = Math.sqrt(tt),
              pt = (1 - ft / f) / ft;
            if (((A += J * pt), (v += $ * pt), ++b >= d.neighborCap)) break t;
          }
      }
    if (!y) {
      const R = e.sample(i[a], s[a]);
      if (R < d.wallAvoidDist) {
        e.grad(i[a], s[a], et);
        const S = 1 - R / d.wallAvoidDist;
        ((g += et.x * S * 2), (M += et.z * S * 2));
      }
    }
    const T = Math.hypot(A, v);
    (T > 0.8 && ((A *= 0.8 / T), (v *= 0.8 / T)), (g += A), (M += v));
    let E = 0;
    if (Math.hypot(g, M) > 0.05 && !u) {
      const R = rt(Math.atan2(M, g) - r[a]),
        S = m.turn * O;
      ((r[a] += Math.abs(R) <= S ? R : Math.sign(R) * S),
        (E = x
          ? -m.speed * 0.55 * Math.max(0, Math.cos(R))
          : m.speed * Math.max(y ? 0.5 : 0, Math.cos(R))));
    }
    ((i[a] += Math.cos(r[a]) * E * O),
      (s[a] += Math.sin(r[a]) * E * O),
      (h.holding[a] = u));
    let _ = r[a];
    if (h.hasValidTarget(a)) {
      const R = c[a];
      _ = Math.atan2(s[R] - s[a], i[R] - i[a]);
    }
    const F = rt(_ - o[a]),
      D = m.turretRate * O;
    o[a] += Math.abs(F) <= D ? F : Math.sign(F) * D;
  }
}
const st = { x: 0, z: 0 },
  j = 0.6;
function It(h, t, e, n) {
  const { posX: i, posZ: s, state: r, holding: o, kind: l } = h;
  for (let w = 0; w < n; w++)
    for (let c = 0; c < h.count; c++) {
      if (r[c] === 2) continue;
      const f = ot[l[c]],
        p = B[l[c]].radius,
        a = p > 2 ? 2 : 1,
        g = t.cellX(i[c]),
        M = t.cellZ(s[c]);
      for (let u = -a; u <= a; u++)
        for (let x = -a; x <= a; x++) {
          const m = (M + u) * t.cellsX + (g + x);
          if (!(m < 0 || m >= t.nCells))
            for (let y = t.cellStart[m]; y < t.cellStart[m + 1]; y++) {
              const k = t.indices[y];
              if (k <= c || r[k] === 2 || ot[l[k]] !== f) continue;
              const A = i[k] - i[c],
                v = s[k] - s[c],
                b = A * A + v * v,
                X = p + B[l[k]].radius;
              if (b >= X * X || b < 1e-9) continue;
              const H = Math.sqrt(b),
                T = Math.min((X - H) * 0.5, j),
                E = A / H,
                _ = v / H,
                F = o[c];
              if (F === o[k])
                ((i[c] -= E * T),
                  (s[c] -= _ * T),
                  (i[k] += E * T),
                  (s[k] += _ * T));
              else if (F) {
                const D = Math.min(T * 2, j);
                ((i[k] += E * D), (s[k] += _ * D));
              } else {
                const D = Math.min(T * 2, j);
                ((i[c] -= E * D), (s[c] -= _ * D));
              }
            }
        }
      if (!f) {
        const u = e.sample(i[c], s[c]);
        if (u < p) {
          e.grad(i[c], s[c], st);
          const x = Math.min(p - u, j);
          ((i[c] += st.x * x), (s[c] += st.z * x));
        }
      }
      (i[c] < 2 ? (i[c] = 2) : i[c] > d.mapW - 2 && (i[c] = d.mapW - 2),
        s[c] < 2 ? (s[c] = 2) : s[c] > d.mapH - 2 && (s[c] = d.mapH - 2));
    }
}
function St(h, t, e, n) {
  const { posX: i, posZ: s, team: r, state: o } = h;
  for (let l = n; l < h.count; l += d.retargetBuckets) {
    if (o[l] === 2) continue;
    const w = B[h.kind[l]].range,
      c = w * w;
    if (h.hasValidTarget(l)) {
      const x = h.targetIdx[l],
        m = i[x] - i[l],
        y = s[x] - s[l];
      if (m * m + y * y < c) continue;
    }
    if (e[r[l]].sampleDist(i[l], s[l]) > w * 2) {
      ((h.targetIdx[l] = -1), (o[l] = 0));
      continue;
    }
    const f = Math.ceil(w / d.gridCell) + 1,
      p = t.cellX(i[l]),
      a = t.cellZ(s[l]);
    let g = -1,
      M = c,
      u = -1;
    for (let x = 0; x <= f && !(u >= 0 && x > u + 1); x++) {
      const m = p - x,
        y = p + x,
        k = a - x,
        A = a + x;
      for (let v = k; v <= A; v++) {
        if (v < 0 || v >= t.cellsZ) continue;
        const b = v === k || v === A;
        for (let X = m; X <= y; X += b ? 1 : y - m || 1) {
          if (X < 0 || X >= t.cellsX) continue;
          const H = v * t.cellsX + X;
          for (let T = t.cellStart[H]; T < t.cellStart[H + 1]; T++) {
            const E = t.indices[T];
            if (r[E] === r[l] || o[E] === 2) continue;
            const _ = i[E] - i[l],
              F = s[E] - s[l],
              D = _ * _ + F * F;
            D < M && ((M = D), (g = E), u < 0 && (u = x));
          }
        }
      }
    }
    g >= 0
      ? ((h.targetIdx[l] = g), (h.targetId[l] = h.ids[g]), (o[l] = 1))
      : ((h.targetIdx[l] = -1), (o[l] = 0));
  }
}
class Xt {
  head = 0;
  tail = 0;
  constructor(t) {
    ((this.cap = t),
      (this.dueTick = new Int32Array(t)),
      (this.tIdx = new Int32Array(t)),
      (this.tId = new Int32Array(t)),
      (this.dmg = new Float32Array(t)),
      (this.isAoe = new Uint8Array(t)),
      (this.ax = new Float32Array(t)),
      (this.az = new Float32Array(t)),
      (this.aTeam = new Uint8Array(t)),
      (this.aR = new Float32Array(t)));
  }
  push(t, e, n, i) {
    if (this.tail - this.head >= this.cap) return !1;
    const s = this.tail++ % this.cap;
    return (
      (this.dueTick[s] = t),
      (this.tIdx[s] = e),
      (this.tId[s] = n),
      (this.dmg[s] = i),
      (this.isAoe[s] = 0),
      !0
    );
  }
  pushAoe(t, e, n, i, s, r) {
    if (this.tail - this.head >= this.cap) return !1;
    const o = this.tail++ % this.cap;
    return (
      (this.dueTick[o] = t),
      (this.dmg[o] = s),
      (this.isAoe[o] = 1),
      (this.ax[o] = e),
      (this.az[o] = n),
      (this.aTeam[o] = i),
      (this.aR[o] = r),
      !0
    );
  }
  kill(t, e, n) {
    ((e.state[t] = 2),
      n.push(
        P.DEATH,
        e.posX[t],
        e.posZ[t],
        e.heading[t],
        e.team[t],
        e.kind[t],
      ));
  }
  resolve(t, e, n, i) {
    for (; this.head < this.tail; ) {
      const s = this.head % this.cap;
      if (this.dueTick[s] > t) break;
      if ((this.head++, this.isAoe[s])) {
        const o = this.aR[s],
          l = o * o,
          w = this.ax[s],
          c = this.az[s],
          f = Math.ceil(o / d.gridCell),
          p = n.cellX(w),
          a = n.cellZ(c);
        for (let g = -f; g <= f; g++)
          for (let M = -f; M <= f; M++) {
            const u = (a + g) * n.cellsX + (p + M);
            if (!(u < 0 || u >= n.nCells))
              for (let x = n.cellStart[u]; x < n.cellStart[u + 1]; x++) {
                const m = n.indices[x];
                if (e.team[m] === this.aTeam[s] || e.state[m] === 2) continue;
                const y = e.posX[m] - w,
                  k = e.posZ[m] - c,
                  A = y * y + k * k;
                A > l ||
                  ((e.hp[m] -= this.dmg[s] * (1 - (0.7 * Math.sqrt(A)) / o)),
                  e.hp[m] <= 0 && this.kill(m, e, i));
              }
          }
        continue;
      }
      let r = this.tIdx[s];
      if (r >= e.count || e.ids[r] !== this.tId[s]) {
        r = -1;
        for (let o = 0; o < e.count; o++)
          if (e.ids[o] === this.tId[s]) {
            r = o;
            break;
          }
      }
      r < 0 ||
        e.state[r] === 2 ||
        ((e.hp[r] -= this.dmg[s]), e.hp[r] <= 0 && this.kill(r, e, i));
    }
  }
}
function Tt(h, t, e, n, i, s) {
  const {
    posX: r,
    posZ: o,
    turretYaw: l,
    state: w,
    cooldown: c,
    recoil: f,
  } = h;
  for (let p = 0; p < h.count; p++) {
    if (
      w[p] === 2 ||
      (f[p] > 0 && ((f[p] *= 0.55), f[p] < 0.04 && (f[p] = 0)),
      c[p] > 0 && c[p]--,
      w[p] !== 1 || c[p] > 0 || !h.hasValidTarget(p))
    )
      continue;
    const a = h.targetIdx[p],
      g = r[a] - r[p],
      M = o[a] - o[p],
      u = g * g + M * M,
      x = h.kind[p],
      m = B[x];
    if (u > m.range * m.range || Math.abs(rt(Math.atan2(M, g) - l[p])) > 0.25)
      continue;
    const y = Math.max(1, Math.ceil(Math.sqrt(u) / m.projSpeed / O));
    ((c[p] = m.cooldown + (s.u32() & 7)), (f[p] = 1));
    const k = r[p] + Math.cos(l[p]) * m.muzzle,
      A = o[p] + Math.sin(l[p]) * m.muzzle;
    if (m.aoe > 0)
      for (let v = 0; v < m.volley; v++) {
        const b = m.volley > 1 ? s.range(-5, 5) : 0,
          X = m.volley > 1 ? s.range(-5, 5) : 0,
          H = y + v * 3;
        (e.pushAoe(i + H, r[a] + b, o[a] + X, h.team[p], m.damage, m.aoe),
          n.push(x === 1 ? P.GSHOT : P.RSHOT, k, A, r[a] + b, o[a] + X, H * O));
      }
    else {
      e.push(i + y, a, h.targetId[p], m.damage);
      const v = x === 4 ? P.BEAM : x === 5 ? P.DSHOT : P.SHOT;
      n.push(v, k, A, r[a], o[a], y * O);
    }
  }
  e.resolve(i, h, t, n);
}
function Et(h) {
  for (let t = h.count - 1; t >= 0; t--) h.state[t] === 2 && h.kill(t);
}
const bt = { push: () => !0 };
class Ct {
  tick = 0;
  stats = { grid: 0, flow: 0, steer: 0, collide: 0, combat: 0, total: 0 };
  constructor({ red: t, blue: e, seed: n, events: i }) {
    ((this.state = new dt(d.maxUnits)),
      (this.rng = Mt(n)),
      (this.map = kt(n)),
      (this.sdf = new vt(C, V, d.gridCell, this.map.blocked)),
      (this.grid = new zt(d.mapW, d.mapH, d.gridCell, d.maxUnits)));
    const s = Math.ceil(d.mapW / d.flowCell),
      r = Math.ceil(d.mapH / d.flowCell),
      o = new Uint8Array(s * r);
    for (let l = 0; l < r; l++)
      for (let w = 0; w < s; w++) {
        const c = w * 2,
          f = l * 2;
        o[l * s + w] =
          this.map.blocked[f * C + c] &
          this.map.blocked[f * C + c + 1] &
          this.map.blocked[(f + 1) * C + c] &
          this.map.blocked[(f + 1) * C + c + 1];
      }
    ((this.flowCost = At(o, this.sdf, s, r, d.flowCell)),
      (this.flow = [new gt(s, r, d.flowCell), new gt(s, r, d.flowCell)]),
      (this.srcX = new Float32Array(d.maxUnits)),
      (this.srcZ = new Float32Array(d.maxUnits)),
      (this.events = i ?? null),
      (this.dmgQueue = new Xt(65536)),
      this.state.spawnArmies(t, e, this.rng),
      this.refreshFlow(0),
      this.refreshFlow(1));
  }
  rebuildFlow() {
    (this.refreshFlow(0), this.refreshFlow(1));
  }
  refreshFlow(t) {
    const e = this.state;
    let n = 0;
    const i = +(t === 0);
    for (let s = 0; s < e.count; s++)
      e.team[s] === i &&
        e.state[s] !== 2 &&
        ((this.srcX[n] = e.posX[s]), (this.srcZ[n] = e.posZ[s]), n++);
    n > 0 && this.flow[t].compute(this.flowCost, this.srcX, this.srcZ, n);
  }
  step() {
    const t = this.state,
      e = performance.now();
    this.tick++;
    let n = performance.now();
    (this.grid.build(t.posX, t.posZ, t.count),
      (this.stats.grid = performance.now() - n),
      (n = performance.now()),
      this.tick % d.flowRefreshTicks === 0 && this.refreshFlow(0),
      this.tick % d.flowRefreshTicks === d.flowRefreshTicks >> 1 &&
        this.refreshFlow(1),
      (this.stats.flow = performance.now() - n),
      (n = performance.now()),
      Rt(t, this.grid, this.sdf, this.flow),
      (this.stats.steer = performance.now() - n),
      (n = performance.now()),
      It(t, this.grid, this.sdf, 2),
      (this.stats.collide = performance.now() - n),
      (n = performance.now()),
      St(t, this.grid, this.flow, this.tick % d.retargetBuckets),
      Tt(t, this.grid, this.dmgQueue, this.events ?? bt, this.tick, this.rng),
      Et(t),
      (this.stats.combat = performance.now() - n),
      (this.stats.total = performance.now() - e));
  }
  publish(t) {
    const e = this.state,
      n = e.count;
    for (let i = 0; i < n; i++) {
      const s = i * K;
      ((t[s] = e.prevX[i]),
        (t[s + 1] = e.prevZ[i]),
        (t[s + 2] = e.prevHeading[i]),
        (t[s + 3] = e.prevTurretYaw[i]),
        (t[s + 4] = e.posX[i]),
        (t[s + 5] = e.posZ[i]),
        (t[s + 6] = e.heading[i]),
        (t[s + 7] = e.turretYaw[i]),
        (t[s + 8] =
          e.team[i] +
          e.kind[i] * 2 +
          (e.ids[i] & 63) / 256 +
          (e.selected[i] ? 0.5 : 0)),
        (t[s + 9] =
          Math.round((e.hp[i] / B[e.kind[i]].hp) * 31) +
          Math.min(e.recoil[i], 0.96)));
    }
    return (
      e.prevX.set(e.posX.subarray(0, n)),
      e.prevZ.set(e.posZ.subarray(0, n)),
      e.prevHeading.set(e.heading.subarray(0, n)),
      e.prevTurretYaw.set(e.turretYaw.subarray(0, n)),
      n
    );
  }
  aliveByTeam() {
    let t = 0,
      e = 0;
    for (let n = 0; n < this.state.count; n++)
      this.state.team[n] === 0 ? t++ : e++;
    return [t, e];
  }
  armyGap() {
    let t = 0,
      e = 0,
      n = 0,
      i = 0;
    const s = this.state;
    for (let r = 0; r < s.count; r++)
      s.team[r] === 0 ? ((t += s.posX[r]), e++) : ((n += s.posX[r]), i++);
    return Math.abs(n / Math.max(i, 1) - t / Math.max(e, 1));
  }
}
function Zt(h, t) {
  if ((h.selected.fill(0, 0, h.count), t.length < 8)) return;
  const e = [0, 0],
    n = new Uint8Array(h.count);
  for (let s = 0; s < h.count; s++) {
    const r = h.posX[s],
      o = h.posZ[s];
    let l = 0,
      w = 0;
    for (let c = 0; c < 4; c++) {
      const f = t[c * 2],
        p = t[c * 2 + 1],
        a = t[((c + 1) & 3) * 2],
        g = t[((c + 1) & 3) * 2 + 1];
      (a - f) * (o - p) - (g - p) * (r - f) >= 0 ? l++ : w++;
    }
    (l === 4 || w === 4) && ((n[s] = 1), e[h.team[s]]++);
  }
  const i = e[0] >= e[1] ? 0 : 1;
  for (let s = 0; s < h.count; s++)
    n[s] && h.team[s] === i && (h.selected[s] = 1);
}
function Ht(h, t, e) {
  let n = 0,
    i = 0,
    s = 0;
  for (let o = 0; o < h.count; o++)
    h.selected[o] && (n++, (i += h.posX[o]), (s += h.posZ[o]));
  if (n === 0) return;
  ((i /= n), (s /= n));
  const r = Math.max(10, Math.sqrt(n) * 1.4);
  for (let o = 0; o < h.count; o++) {
    if (!h.selected[o]) continue;
    const l = h.posX[o] - i,
      w = h.posZ[o] - s,
      c = Math.hypot(l, w),
      f = c > r ? r / c : 1;
    ((h.orderX[o] = Math.min(Math.max(t + l * f, 6), d.mapW - 6)),
      (h.orderZ[o] = Math.min(Math.max(e + w * f, 6), d.mapH - 6)),
      (h.order[o] = 1));
  }
}
let z,
  Z,
  it = 0,
  N = d.defaultRed,
  q = d.defaultBlue,
  at = d.seed,
  ht = "sab",
  Y = null,
  nt = 0;
function lt() {
  return new Ct({
    red: N,
    blue: q,
    seed: at,
    events: new yt(z.evHead, z.evI32, z.evF32, d.eventCapacity, z.header),
  });
}
function ct() {
  const h = z.header[I.SPEED_X100] / 100;
  z.header[I.REQ_RESTART] !== it &&
    ((it = z.header[I.REQ_RESTART]),
    (N = Math.min(Math.max(z.header[I.REQ_RED], 1), d.maxUnits - 1)),
    (q = Math.min(Math.max(z.header[I.REQ_BLUE], 1), d.maxUnits - N)),
    Atomics.store(z.evHead, 0, 0),
    Atomics.store(z.evHead, 1, 0),
    (z.header[I.EV_DROPPED] = 0),
    (Z = lt()),
    (z.header[I.RESTART_ACK] = it));
  const t = performance.now();
  if (h > 0) {
    Z.step();
    const s = 1 - z.header[I.FRONT],
      r = Z.publish(z.snaps[s]),
      [o, l] = Z.aliveByTeam();
    ((z.header[I.COUNT] = r),
      (z.header[I.ALIVE_RED] = o),
      (z.header[I.ALIVE_BLUE] = l),
      (z.header[I.FRONT] = s),
      Atomics.store(z.header, I.TICK, Z.tick),
      ht === "copy" && Dt());
  }
  const e = performance.now() - t;
  ((z.header[I.SIM_MS_X100] = Math.round(e * 100)),
    Z.tick % 30 === 0 &&
      self.postMessage({ kind: "sim-stats", stats: { ...Z.stats } }),
    (nt = nt * 0.9 + e * 0.1));
  const n = Math.min(Math.max(nt / ((1e3 / d.simHz) * 0.8), 1), 2),
    i = ((1e3 / d.simHz) * n) / Math.max(h, 0.25);
  setTimeout(ct, Math.max(0, i - e));
}
function Dt() {
  if (!Y) return;
  const h = Y;
  ((Y = null),
    new Uint8Array(h).set(new Uint8Array(z.header.buffer)),
    Atomics.store(z.evHead, 1, Atomics.load(z.evHead, 0)),
    self.postMessage({ kind: "snapshot", buf: h }, [h]));
}
self.onmessage = (h) => {
  const t = h.data;
  if (t.kind === "init-sab")
    ((ht = "sab"),
      (z = ut(t.sab, d.maxUnits, d.eventCapacity)),
      (N = t.red),
      (q = t.blue),
      (at = t.seed),
      (z.header[I.SPEED_X100] = 100),
      (Z = lt()),
      ct(),
      self.postMessage({ ready: !0 }));
  else if (t.kind === "init-copy") {
    ht = "copy";
    const e = xt(d.maxUnits, d.eventCapacity).total;
    ((z = ut(new ArrayBuffer(e), d.maxUnits, d.eventCapacity)),
      (Y = new ArrayBuffer(e)),
      (N = t.red),
      (q = t.blue),
      (at = t.seed),
      (z.header[I.SPEED_X100] = 100),
      (Z = lt()),
      ct(),
      self.postMessage({ ready: !0 }));
  } else if (t.kind === "cmd") {
    const e = t.cmd;
    (e.speedX100 !== void 0 && (z.header[I.SPEED_X100] = e.speedX100),
      e.restart &&
        ((z.header[I.REQ_RED] = e.restart.red),
        (z.header[I.REQ_BLUE] = e.restart.blue),
        z.header[I.REQ_RESTART]++));
  } else
    t.kind === "return"
      ? (Y = t.buf)
      : t.kind === "select"
        ? Z && Zt(Z.state, t.quad)
        : t.kind === "move" && Z && Ht(Z.state, t.x, t.z);
};
