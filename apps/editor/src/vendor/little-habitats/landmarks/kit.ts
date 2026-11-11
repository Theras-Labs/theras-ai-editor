// Ports index-BwioI7A7.js 26416-26660 and 26901-26955: the landmark animation kit.
// Spring (Z), Stopwatch (af), envelope (of), the point-sprite sparks (mf), the glow sprite (_f, vf, yf),
// Spinner (Df), kickSpinner (Of), hitCylinder (Af), randomSign (jf) and Sparkles (Mf).
import * as THREE from 'three';
import { clamp, dampAngle, smoothstep } from '../core/anim';

/** Damped spring toward `target`. update() integrates in sub-steps of at most 8 ms (4 at most). */
export class Spring { // Z (26416)
  k: number;
  c: number;
  target: number;
  x: number;
  v = 0;
  constructor(k = 90, c = 7, target = 0) {
    this.k = k;
    this.c = c;
    this.target = target;
    this.x = target;
  }
  kick(dv: number): this {
    this.v += dv;
    return this;
  }
  set(x: number, v = 0): this {
    this.x = x;
    this.v = v;
    return this;
  }
  update(dt: number): number {
    let steps = Math.min(4, Math.ceil(dt / 0.008));
    const h = dt / Math.max(1, steps);
    for (; steps-- > 0; ) {
      this.v += (-this.k * (this.x - this.target) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  get settled(): boolean {
    return Math.abs(this.x - this.target) < 8e-4 && Math.abs(this.v) < 0.004;
  }
}

/** Elapsed time since start(); Infinity while stopped. */
export class Stopwatch { // af (26441)
  t = 1 / 0;
  start(): this {
    this.t = 0;
    return this;
  }
  stop(): this {
    this.t = 1 / 0;
    return this;
  }
  update(dt: number): number {
    if (this.t !== 1 / 0) this.t += dt;
    return this.t;
  }
  on(duration: number): boolean {
    return this.t < duration;
  }
  /** Progress over `duration`, clamped to [0, 1]; 1 while stopped. */
  k(duration: number): number {
    return this.t === 1 / 0 ? 1 : clamp(this.t / duration);
  }
}

/** Linear attack over `attack` seconds, then exponential decay with time constant `decay`. 0 before t = 0. */
export const envelope = (t: number, attack: number, decay: number): number => // of (26459)
  t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay);

const MOTE_VERTEX = `
  attribute vec4 aCol;
  attribute float aSize;
  uniform float uScale;
  varying vec4 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = aSize * uScale / max(0.2, -mv.z);
    gl_PointSize = clamp(px, 1.5, 120.0);
    vCol = aCol;
    if (aCol.a <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`; // sf (26460)

const MOTE_FRAGMENT_GLOW = `
  varying vec4 vCol;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float core = smoothstep(0.5, 0.0, r);
    float halo = exp(-r * r * 4.0) * (1.0 - r);
    gl_FragColor = vec4(vCol.rgb * (core * 1.5 + halo * 0.8) * vCol.a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`; // cf (26473)

const MOTE_FRAGMENT_SOFT = `
  varying vec4 vCol;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = smoothstep(1.0, 0.55, r) * vCol.a;
    gl_FragColor = vec4(vCol.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`; // lf (26485)

const drawingBufferSize = new THREE.Vector2(); // uf (26496)

type MoteMaterial = THREE.ShaderMaterial & { uniforms: { uScale: THREE.IUniform<number> } };

/** Additive glow motes (glow = true) or normal-blended soft dots. */
function createMoteMaterial(glow: boolean): MoteMaterial { // df (26497)
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 } },
    vertexShader: MOTE_VERTEX,
    fragmentShader: glow ? MOTE_FRAGMENT_GLOW : MOTE_FRAGMENT_SOFT,
    transparent: true,
    depthWrite: false,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  }) as MoteMaterial;
}

let glowMoteMaterial: MoteMaterial | null = null; // ff (26507)
let softMoteMaterial: MoteMaterial | null = null; // pf (26508)

/** Per-particle options of SparkPoints.emit. */
export interface SparkOptions {
  /** Alpha. Default 1. */
  a?: number;
  /** Downward acceleration. Default 0. */
  gravity?: number;
  /** Exponential velocity drag per second. Default 0. */
  drag?: number;
  /** Size multiplier at the end of life. Default 1. */
  grow?: number;
  /** Flicker amount 0..1. Default 0. */
  twinkle?: number;
}

/** A ring buffer of point-sprite particles with velocity, drag, gravity, growth and twinkle. */
export class SparkPoints { // mf (26509)
  points: THREE.Points<THREE.BufferGeometry, MoteMaterial>;
  cap: number;
  head = 0;
  alive = 0;
  P: Float32Array;
  C: Float32Array;
  S: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  base: Float32Array;
  phys: Float32Array;
  posA: THREE.BufferAttribute;
  colA: THREE.BufferAttribute;
  szA: THREE.BufferAttribute;
  constructor(cap = 32, glow = true) {
    this.cap = cap;
    this.P = new Float32Array(cap * 3);
    this.C = new Float32Array(cap * 4);
    this.S = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.age = new Float32Array(cap).fill(1);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.base = new Float32Array(cap * 4);
    this.phys = new Float32Array(cap * 4);
    const geometry = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage);
    this.colA = new THREE.BufferAttribute(this.C, 4).setUsage(THREE.DynamicDrawUsage);
    this.szA = new THREE.BufferAttribute(this.S, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(`position`, this.posA);
    geometry.setAttribute(`aCol`, this.colA);
    geometry.setAttribute(`aSize`, this.szA);
    const material = glow ? (glowMoteMaterial ??= createMoteMaterial(true)) : (softMoteMaterial ??= createMoteMaterial(false));
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = glow ? 9 : 7;
    this.points.name = `lm-motes`;
    this.points.raycast = () => void 0;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(drawingBufferSize);
      material.uniforms.uScale.value = (drawingBufferSize.y * 0.5 * camera.projectionMatrix.elements[5]) | 0;
    };
  }
  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
    r: number, g: number, b: number,
    opts?: SparkOptions,
  ): void {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    if (this.age[i] >= this.life[i]) this.alive++;
    this.P[i * 3] = x;
    this.P[i * 3 + 1] = y;
    this.P[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = Math.max(0.05, life);
    this.size[i] = size;
    this.base[i * 4] = r;
    this.base[i * 4 + 1] = g;
    this.base[i * 4 + 2] = b;
    this.base[i * 4 + 3] = opts?.a ?? 1;
    this.phys[i * 4] = opts?.gravity ?? 0;
    this.phys[i * 4 + 1] = opts?.drag ?? 0;
    this.phys[i * 4 + 2] = opts?.grow ?? 1;
    this.phys[i * 4 + 3] = opts?.twinkle ?? 0;
    this.points.visible = true;
  }
  rnd(): number {
    return Math.random();
  }
  update(dt: number): void {
    if (this.alive <= 0) {
      if (this.points.visible) this.points.visible = false;
      return;
    }
    const { P, C, S, vel, age, life, size, base, phys } = this;
    for (let i = 0; i < this.cap; i++) {
      if (age[i] >= life[i]) continue;
      const a = (age[i] += dt);
      if (a >= life[i]) {
        C[i * 4 + 3] = 0;
        this.alive--;
        continue;
      }
      const drag = Math.exp(-phys[i * 4 + 1] * dt);
      vel[i * 3] *= drag;
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag - phys[i * 4] * dt;
      vel[i * 3 + 2] *= drag;
      P[i * 3] += vel[i * 3] * dt;
      P[i * 3 + 1] += vel[i * 3 + 1] * dt;
      P[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const k = a / life[i];
      let fade = Math.min(1, k / 0.08) * (1 - k) * (1 - k * 0);
      const twinkle = phys[i * 4 + 3];
      if (twinkle > 0) fade *= 1 - twinkle * (0.5 + 0.5 * Math.sin(a * 31 + i * 5.7));
      C[i * 4] = base[i * 4];
      C[i * 4 + 1] = base[i * 4 + 1];
      C[i * 4 + 2] = base[i * 4 + 2];
      C[i * 4 + 3] = base[i * 4 + 3] * fade;
      S[i] = size[i] * (1 + (phys[i * 4 + 2] - 1) * k);
    }
    this.posA.needsUpdate = true;
    this.colA.needsUpdate = true;
    this.szA.needsUpdate = true;
    if (this.alive <= 0) this.points.visible = false;
  }
  clear(): void {
    this.age.fill(1);
    this.C.fill(0);
    this.alive = 0;
    this.points.visible = false;
  }
  dispose(): void {
    this.points.geometry.dispose();
  }
}

let glowTexture: THREE.CanvasTexture | null = null; // hf (26623)

/** 64 x 64 white radial gradient, built once. */
function getGlowTexture(): THREE.CanvasTexture { // gf (26624)
  if (glowTexture) return glowTexture;
  const canvas = document.createElement(`canvas`);
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext(`2d`)!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, `rgba(255,255,255,1)`);
  gradient.addColorStop(0.25, `rgba(255,255,255,0.55)`);
  gradient.addColorStop(0.6, `rgba(255,255,255,0.14)`);
  gradient.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** An additive halo sprite (hidden until setGlowSprite shows it). The color is linear RGB above 1. */
export function glowSprite(r = 3, g = 2, b = 1.2): THREE.Sprite { // _f (26642)
  const material = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: new THREE.Color(r, g, b),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 10;
  sprite.name = `lm-halo`;
  sprite.raycast = () => void 0;
  sprite.userData.strength = 0;
  return sprite;
}

/** Shows the sprite at `scale` with opacity min(1, strength), or hides it when either is near 0. */
export function setGlowSprite(sprite: THREE.Sprite, scale: number, strength: number): void { // vf (26654)
  const visible = strength > 0.01 && scale > 0.001;
  if (sprite.visible !== visible) sprite.visible = visible;
  if (visible) {
    sprite.scale.set(scale, scale, 1);
    sprite.material.opacity = Math.min(1, strength);
  }
}

export function disposeSprite(sprite: THREE.Sprite): void { // yf (26658)
  sprite.material.dispose();
}

const TAU = Math.PI * 2; // Ef (26901)

/** Free spin that coasts, slows down, and then eases back to angle 0 (wrapped to [-PI, PI]). */
export class Spinner { // Df (26902)
  x = 0;
  v = 0;
  kick(dv: number, max = 32): this {
    this.v = Math.max(-max, Math.min(max, this.v + dv));
    return this;
  }
  get active(): boolean {
    return this.v !== 0 || this.x !== 0;
  }
  update(dt: number, friction = 1.25, settle = 4): number {
    if (!this.active) return 0;
    this.x += this.v * dt;
    this.v *= Math.exp(-friction * dt);
    const speed = Math.abs(this.v);
    const pull = 1 - smoothstep(0.5, 2.6, speed);
    if (pull > 0) this.x = dampAngle(this.x, 0, settle * pull, dt);
    this.x -= Math.round(this.x / TAU) * TAU;
    if (speed < 0.02 && Math.abs(this.x) < 0.002) {
      this.v = 0;
      this.x = 0;
    }
    return this.x;
  }
}

/** Adds dv to the velocity and clamps it to [-max, max]. Works on a Spring or a Spinner. */
export const kickSpinner = (s: { v: number }, dv: number, max: number): void => { // Of (26924)
  s.v = Math.max(-max, Math.min(max, s.v + dv));
};

let hitMaterial: THREE.MeshBasicMaterial | null = null; // kf (26927)

/** An invisible 8-sided cylinder for pointer picks, standing on (x, y, z). */
export function hitCylinder(radius: number, height: number, x = 0, y = 0, z = 0): THREE.Mesh { // Af (26928)
  hitMaterial ??= new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8, 1), hitMaterial);
  mesh.position.set(x, y + height / 2, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = `lm-hit`;
  return mesh;
}

export const randomSign = (): number => (Math.random() < 0.5 ? -1 : 1); // jf (26933)

/** Two SparkPoints: soft dots plus a larger additive glow copy, brightened by `boost`. */
export class Sparkles { // Mf (26934)
  boost: number;
  dots: SparkPoints;
  glow: SparkPoints;
  constructor(cap = 40, boost = 1.4) {
    this.boost = boost;
    this.dots = new SparkPoints(cap, false);
    this.glow = new SparkPoints(cap, true);
  }
  add(parent: THREE.Object3D): this {
    parent.add(this.dots.points, this.glow.points);
    return this;
  }
  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
    r: number, g: number, b: number,
    opts?: SparkOptions,
  ): void {
    this.dots.emit(x, y, z, vx, vy, vz, life, size, r, g, b, opts);
    const boost = this.boost;
    this.glow.emit(x, y, z, vx, vy, vz, life, size * 1.6, r * boost, g * boost, b * boost, opts);
  }
  update(dt: number): void {
    this.dots.update(dt);
    this.glow.update(dt);
  }
  dispose(): void {
    this.dots.dispose();
    this.glow.dispose();
  }
}
