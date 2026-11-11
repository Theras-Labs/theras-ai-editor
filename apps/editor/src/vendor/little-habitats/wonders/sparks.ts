// Ports index-BwioI7A7.js 35805-36233: the wonder random generator (V_), the spark particle field (U_)
// and the firework shells (W_, G_, K_).
import * as THREE from 'three';

/** Xorshift32 generator. Returns floats in [0, 1). */
export class XorShift { // V_ (35805)
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let e = this.s;
    e ^= e << 13;
    e >>>= 0;
    e ^= e >>> 17;
    e ^= e << 5;
    e >>>= 0;
    this.s = e;
    return e / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}

const bufferSize = new THREE.Vector2(); // H_ (35818)

/**
 * Spark flags (bit mask, `flags` argument of SparkField.spawn):
 * 1 trail, 2 glitter flicker, 4 shimmer, 8 shrink with age, 16 hot white start, 32 wander, 64 slow twinkle.
 */
export class SparkField { // U_ (35819)
  points: THREE.Points;
  cap: number;
  fixed: number;
  head: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  cr: Float32Array;
  cg: Float32Array;
  cb: Float32Array;
  drag: Float32Array;
  grav: Float32Array;
  ph: Float32Array;
  tacc: Float32Array;
  flags: Uint8Array;
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  sz: THREE.BufferAttribute;
  mat: THREE.ShaderMaterial;
  rnd: XorShift;
  trailEvery = 0.03;
  trailLife = 0.4;
  gain = 1;

  /** cap: slot count. fixed: slots 0..fixed-1 are set by setFixed and never spawned into. */
  constructor(cap: number, fixed = 0, seed = 1) {
    this.cap = cap;
    this.fixed = fixed;
    this.head = fixed;
    this.rnd = new XorShift(seed);
    const make = () => new Float32Array(cap);
    this.px = make();
    this.py = make();
    this.pz = make();
    this.vx = make();
    this.vy = make();
    this.vz = make();
    this.age = make();
    this.life = make();
    this.size = make();
    this.cr = make();
    this.cg = make();
    this.cb = make();
    this.drag = make();
    this.grav = make();
    this.ph = make();
    this.tacc = make();
    this.flags = new Uint8Array(cap);
    for (let t = 0; t < cap; t++) {
      this.age[t] = 1;
      this.life[t] = 0;
      this.ph[t] = this.rnd.next() * 100;
    }
    const geometry = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sz = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(`position`, this.pos);
    geometry.setAttribute(`aCol`, this.col);
    geometry.setAttribute(`aSize`, this.sz);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: `
        attribute vec4 aCol;
        attribute float aSize;
        uniform float uScale;
        varying vec4 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = aSize * uScale / max(0.2, -mv.z);
          gl_PointSize = clamp(px, 1.8, 96.0);
          // keep tiny far sparks from flickering: fade what can't be resolved instead of shrinking it
          vCol = aCol * vec4(1.0, 1.0, 1.0, clamp(px / 1.8, 0.25, 1.0));
          if (aCol.a <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        varying vec4 vCol;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          float core = smoothstep(0.42, 0.0, r);
          float halo = exp(-r * r * 4.5) * (1.0 - r);
          vec3 c = vCol.rgb * (core * 1.6 + halo * 0.9) * vCol.a;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.name = `wonder-sparks`;
  }

  /** Returns the slot index. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    r: number,
    g: number,
    b: number,
    flags = 0,
    drag = 0,
    grav = 0,
  ): number {
    const m = this.head;
    this.head++;
    if (this.head >= this.cap) this.head = this.fixed;
    this.px[m] = x;
    this.py[m] = y;
    this.pz[m] = z;
    this.vx[m] = vx;
    this.vy[m] = vy;
    this.vz[m] = vz;
    this.age[m] = 0;
    this.life[m] = life;
    this.size[m] = size;
    this.cr[m] = r;
    this.cg[m] = g;
    this.cb[m] = b;
    this.flags[m] = flags;
    this.drag[m] = drag;
    this.grav[m] = grav;
    this.tacc[m] = this.rnd.next() * this.trailEvery;
    return m;
  }

  setFixed(i: number, x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    const l = this.pos.array as Float32Array;
    const u = this.col.array as Float32Array;
    l[i * 3] = x;
    l[i * 3 + 1] = y;
    l[i * 3 + 2] = z;
    u[i * 4] = r;
    u[i * 4 + 1] = g;
    u[i * 4 + 2] = b;
    u[i * 4 + 3] = a * this.gain;
    (this.sz.array as Float32Array)[i] = size;
  }

  get fixedCount(): number {
    return this.fixed;
  }

  update(dt: number, time: number, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(bufferSize);
    this.mat.uniforms.uScale.value = bufferSize.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const posArr = this.pos.array as Float32Array;
    const colArr = this.col.array as Float32Array;
    const szArr = this.sz.array as Float32Array;
    const cap = this.cap;
    for (let n = this.fixed; n < cap; n++) {
      const life = this.life[n];
      if (this.age[n] >= life) {
        if (colArr[n * 4 + 3] !== 0) colArr[n * 4 + 3] = 0;
        continue;
      }
      const age = this.age[n] + dt;
      this.age[n] = age;
      if (age >= life) {
        colArr[n * 4 + 3] = 0;
        continue;
      }
      const c = this.flags[n];
      const l = Math.exp(-this.drag[n] * dt);
      let u = this.vx[n] * l;
      let d = this.vy[n] * l - this.grav[n] * dt;
      let f = this.vz[n] * l;
      if (c & 32) {
        const ph = this.ph[n];
        u += Math.sin(time * 0.9 + ph) * 0.9 * dt;
        f += Math.cos(time * 0.77 + ph * 1.3) * 0.9 * dt;
        d += Math.sin(time * 1.3 + ph * 0.7) * 0.5 * dt;
      }
      this.vx[n] = u;
      this.vy[n] = d;
      this.vz[n] = f;
      const p = this.px[n] + u * dt;
      this.px[n] = p;
      const m = this.py[n] + d * dt;
      this.py[n] = m;
      const h = this.pz[n] + f * dt;
      this.pz[n] = h;
      const g = age / life;
      let alpha = Math.min(1, g / 0.06) * (1 - g) ** 1.3;
      let v = this.cr[n];
      let y = this.cg[n];
      let b = this.cb[n];
      let x = this.size[n];
      if (c & 16) {
        const e = 1 - Math.min(1, g / 0.18);
        v += (3.2 - v) * e;
        y += (3 - y) * e;
        b += (2.6 - b) * e;
      }
      if (c & 2) {
        const e = 0.5 + 0.5 * Math.sin(time * 27 + this.ph[n] * 7.1);
        alpha *= 1 - Math.min(1, g * 1.6) * 0.75 * e;
      }
      if (c & 4) alpha *= 0.7 + 0.3 * Math.sin(time * 13 + this.ph[n]);
      if (c & 64) {
        const e = 0.5 + 0.5 * Math.sin(time * 1.9 + this.ph[n] * 5.3);
        alpha *= 0.15 + 0.85 * e * e;
      }
      if (c & 8) x *= 1 - 0.65 * g;
      if (c & 1) {
        let t = this.tacc[n] - dt;
        for (; t <= 0; ) {
          t += this.trailEvery;
          this.spawn(
            p,
            m,
            h,
            u * 0.08,
            d * 0.08 - 0.15,
            f * 0.08,
            this.trailLife * (0.7 + this.rnd.next() * 0.6),
            this.size[n] * 0.62,
            v * 0.75,
            y * 0.62,
            b * 0.5,
            10,
            1.5,
            0.6,
          );
        }
        this.tacc[n] = t;
      }
      posArr[n * 3] = p;
      posArr[n * 3 + 1] = m;
      posArr[n * 3 + 2] = h;
      colArr[n * 4] = v;
      colArr[n * 4 + 1] = y;
      colArr[n * 4 + 2] = b;
      colArr[n * 4 + 3] = alpha * this.gain;
      szArr[n] = x;
    }
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.sz.needsUpdate = true;
  }

  clear(): void {
    const e = this.col.array as Float32Array;
    for (let t = this.fixed; t < this.cap; t++) {
      this.age[t] = 1;
      this.life[t] = 0;
      e[t * 4 + 3] = 0;
    }
    this.col.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/** Firework shell colours (HDR rgb). */
export const SHELL_COLORS: readonly (readonly [number, number, number])[] = [ // W_ (36046)
  [3.4, 2.3, 0.9],
  [3.4, 1.25, 1.9],
  [1.2, 3.1, 2],
  [2.3, 1.5, 3.6],
  [1.3, 2.3, 3.6],
  [3.6, 1.6, 0.6],
  [3, 3, 3.2],
];

const SHELL_GRAVITY = 2.4; // G_ (36055)

export type ShellType = 'peony' | 'glitter' | 'ring' | 'heart' | 'willow';

export interface Shell {
  live: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  type: ShellType;
  c1: number;
  c2: number;
  big: boolean;
  tacc: number;
}

export type BurstHandler = (x: number, y: number, z: number, big: boolean) => void;

export class Fireworks { // K_ (36056)
  sparks: SparkField;
  onBurst: BurstHandler;
  shells: Shell[] = [];
  rnd: XorShift;
  constructor(sparks: SparkField, onBurst: BurstHandler, seed = 7) {
    this.sparks = sparks;
    this.onBurst = onBurst;
    this.rnd = new XorShift(seed);
    for (let e = 0; e < 12; e++)
      this.shells.push({
        live: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        fuse: 0,
        type: `peony`,
        c1: 0,
        c2: 0,
        big: false,
        tacc: 0,
      });
  }

  get active(): boolean {
    return this.shells.some((e) => e.live);
  }

  /** Launches a shell from (x0, y0, z0) that reaches (x1, y1, z1) after `flight` seconds. */
  launch(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    flight: number,
    type: ShellType,
    c1: number,
    c2: number,
    big = true,
  ): void {
    const d = this.shells.find((e) => !e.live);
    if (!d) return;
    d.live = true;
    d.x = x0;
    d.y = y0;
    d.z = z0;
    d.vx = (x1 - x0) / flight;
    d.vz = (z1 - z0) / flight;
    d.vy = (y1 - y0) / flight + 0.5 * SHELL_GRAVITY * flight;
    d.fuse = flight;
    d.type = type;
    d.c1 = c1;
    d.c2 = c2;
    d.big = big;
    d.tacc = 0;
  }

  update(dt: number): void {
    const t = this.rnd;
    const n = this.sparks;
    for (const r of this.shells)
      if (r.live) {
        for (
          r.vy -= SHELL_GRAVITY * dt, r.x += r.vx * dt, r.y += r.vy * dt, r.z += r.vz * dt, r.fuse -= dt, r.tacc -= dt;
          r.tacc <= 0;

        ) {
          r.tacc += 0.018;
          n.spawn(
            r.x,
            r.y,
            r.z,
            t.range(-0.2, 0.2),
            t.range(-0.9, -0.3),
            t.range(-0.2, 0.2),
            t.range(0.25, 0.5),
            0.085,
            3.2,
            2.1,
            0.9,
            10,
            1.2,
            1,
          );
        }
        if (r.fuse <= 0) {
          r.live = false;
          this.burst(r);
        }
      }
  }

  burst(e: Shell): void {
    const t = this.rnd;
    const n = this.sparks;
    const r = SHELL_COLORS[e.c1 % SHELL_COLORS.length];
    const i = SHELL_COLORS[e.c2 % SHELL_COLORS.length];
    const a = e.big ? 1 : 0.62;
    n.spawn(e.x, e.y, e.z, 0, 0, 0, 0.16, 1.1 * a, 2.6, 2.2, 1.7, 0, 0, 0);
    n.spawn(e.x, e.y, e.z, 0, 0, 0, 0.45, 0.9 * a, r[0] * 0.8, r[1] * 0.8, r[2] * 0.8, 0, 0, 0);
    const star = (
      dx: number,
      dy: number,
      dz: number,
      speed: number,
      col: readonly number[],
      life: number,
      flags: number,
      drag: number,
      grav: number,
      size = 0.13,
    ) =>
      n.spawn(
        e.x,
        e.y,
        e.z,
        dx * speed,
        dy * speed,
        dz * speed,
        life,
        size * (0.85 + t.next() * 0.3) * (e.big ? 1 : 0.85),
        col[0],
        col[1],
        col[2],
        flags,
        drag,
        grav,
      );
    const s = Math.round((e.type === `willow` ? 70 : e.type === `ring` ? 56 : e.type === `heart` ? 60 : 86) * a);
    if (e.type === `peony` || e.type === `glitter`) {
      for (let k = 0; k < s; k++) {
        const c = (k + 0.5) / s;
        const l = Math.acos(1 - 2 * c);
        const u = k * 2.39996 + t.next() * 0.2;
        const d = Math.sin(l) * Math.cos(u);
        const f = Math.cos(l);
        const p = Math.sin(l) * Math.sin(u);
        const m = e.type === `glitter`;
        const h = t.next() < 0.72 ? r : i;
        star(d, f, p, (m ? 3 : 3.7) * a * (0.92 + t.next() * 0.16), h, t.range(1.4, 2.1), 16 | (m ? 3 : 1), 1.45, 1.1);
      }
      for (let k = 0; k < 14 * a; k++) {
        const ang = t.next() * Math.PI * 2;
        const y = t.range(-1, 1);
        const rr = Math.sqrt(1 - y * y);
        star(Math.cos(ang) * rr, y, Math.sin(ang) * rr, 1.3 * a, i, t.range(0.8, 1.2), 18, 1.6, 0.5, 0.11);
      }
    } else if (e.type === `ring`) {
      const tiltA = t.range(-0.8, 0.8);
      const tiltB = t.range(-0.8, 0.8);
      const c = Math.sin(tiltA);
      const l = Math.cos(tiltA) * Math.cos(tiltB);
      const u = Math.sin(tiltB);
      let d = l;
      let f = -c;
      let p = 0;
      const m = Math.hypot(d, f, p) || 1;
      d /= m;
      f /= m;
      p /= m;
      const h = l * p - u * f;
      const g = u * d - c * p;
      const _ = c * f - l * d;
      for (let k = 0; k < s; k++) {
        const ang = (k / s) * Math.PI * 2;
        const ci = Math.cos(ang);
        const si = Math.sin(ang);
        star(d * ci + h * si, f * ci + g * si, p * ci + _ * si, 4 * a, r, t.range(1.5, 2), 17, 1.5, 0.9);
      }
      for (let k = 0; k < 26 * a; k++) {
        const ang = t.next() * Math.PI * 2;
        const y = t.range(-1, 1);
        const rr = Math.sqrt(1 - y * y);
        star(Math.cos(ang) * rr, y, Math.sin(ang) * rr, 1.9 * a, i, t.range(1, 1.5), 18, 1.5, 0.8);
      }
    } else if (e.type === `heart`) {
      const hx = -Math.SQRT1_2;
      const hz = Math.SQRT1_2;
      for (let k = 0; k < s; k++) {
        const l = (k / s) * Math.PI * 2;
        const u = (16 * Math.sin(l) ** 3) / 16;
        const d = (13 * Math.cos(l) - 5 * Math.cos(2 * l) - 2 * Math.cos(3 * l) - Math.cos(4 * l)) / 16;
        star(hx * u, d + 0.1, hz * u, 3.3 * a, t.next() < 0.85 ? r : i, t.range(1.5, 1.9), 17, 1.6, 0.35);
      }
    } else {
      const gold = [3.3, 2.2, 0.8];
      for (let k = 0; k < s; k++) {
        const ii = (k + 0.5) / s;
        const c = Math.acos(1 - 2 * ii);
        const l = k * 2.39996;
        star(
          Math.sin(c) * Math.cos(l),
          Math.cos(c) * 0.8 + 0.25,
          Math.sin(c) * Math.sin(l),
          2.6 * a,
          t.next() < 0.8 ? gold : r,
          t.range(2.4, 3.2),
          19,
          1,
          1.25,
          0.12,
        );
      }
    }
    this.onBurst(e.x, e.y, e.z, e.big);
  }

  clear(): void {
    for (const e of this.shells) e.live = false;
  }
}
