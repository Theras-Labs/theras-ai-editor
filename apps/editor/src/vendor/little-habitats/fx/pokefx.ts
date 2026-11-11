// Ports chunk pokefx-CirJK-4b.js (lines 1-380).
// Index aliases: Ct UNIFORMS, St patchWorldMaterial, wt pokeFx.
// three.core imports: Bn Vector3, O DynamicDrawUsage (35048), U InstancedMesh, V InstancedBufferAttribute,
// gt PlaneGeometry, m Color, rt Matrix4, vn ShaderMaterial, zn Vector2.
import * as THREE from 'three';

/** Shared world uniforms. Every patched material and the poke particles share these objects. */
export const UNIFORMS = { // l (pokefx 2), Ct
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.92, 0.38) },
  uWindStrength: { value: 0.6 },
  uSnow: { value: 0 },
  uAutumn: { value: 0 },
  uBloom: { value: 1 },
  uDaylight: { value: 1 },
  uYear: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
};

const SHARED_HEADER = `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uSnow;
uniform float uAutumn;
uniform float uBloom;
uniform float uDaylight;
uniform float uYear;
uniform vec3 uSunDir;
varying vec3 vScWorldPos;
varying vec3 vScWorldNormal;
`; // u (pokefx 13)

const NOISE_GLSL = `
float sc_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float sc_noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sc_hash(i), sc_hash(i + vec2(1.0, 0.0)), u.x), mix(sc_hash(i + vec2(0.0, 1.0)), sc_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`; // d (pokefx 26)

let patchCounter = 0; // f (pokefx 34)

export interface PatchWind {
  amount: number;
  height: number;
  frequency?: number;
}

export interface PatchOptions {
  /** Snow cover amount on up-facing surfaces (0 = none). */
  snow?: number;
  /** Wind sway; the bend grows with the square of local height / `height`. */
  wind?: PatchWind;
  cacheKey?: string;
  vertexHeader?: string;
  /** GLSL inserted after begin_vertex (sc_model and sc_origin are in scope). */
  vertex?: string;
  fragmentHeader?: string;
  /** GLSL inserted after color_fragment, before snow. */
  fragment?: string;
  uniforms?: Record<string, THREE.IUniform>;
}

/**
 * Patches a built-in material with the shared world uniforms, wind sway and snow cover.
 * Chains any onBeforeCompile already set. Returns the same material.
 */
export function patchWorldMaterial<T extends THREE.Material>(material: T, opts: PatchOptions = {}): T { // p (pokefx 35), St
  const snow = opts.snow ?? 0;
  const wind = opts.wind;
  const key = `sc${patchCounter++}|${snow}|${wind ? `${wind.amount},${wind.height},${wind.frequency ?? 1}` : `-`}|${opts.cacheKey ?? ``}|${(opts.vertexHeader ?? ``) + (opts.vertex ?? ``) + (opts.fragmentHeader ?? ``) + (opts.fragment ?? ``)}`;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, UNIFORMS, opts.uniforms ?? {});
    shader.uniforms.uScSnowAmount = { value: snow };
    shader.uniforms.uScWindAmount = { value: wind?.amount ?? 0 };
    shader.uniforms.uScWindInvHeight = { value: wind ? 1 / Math.max(1e-4, wind.height) : 0 };
    shader.uniforms.uScWindFreq = { value: wind?.frequency ?? 1 };
    shader.vertexShader =
      SHARED_HEADER +
      `uniform float uScWindAmount; uniform float uScWindInvHeight; uniform float uScWindFreq;
` +
      (opts.vertexHeader ?? ``) +
      `
` +
      shader.vertexShader.replace(
        `#include <begin_vertex>`,
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 sc_model = modelMatrix * instanceMatrix;
#else
  mat4 sc_model = modelMatrix;
#endif
  vec3 sc_origin = (sc_model * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  ${
    wind
      ? `{
    float sc_h = max(0.0, transformed.y) * uScWindInvHeight;
    float sc_phase = dot(sc_origin.xz, vec2(0.37, 0.53)) + uTime * 1.7 * uScWindFreq;
    float sc_gust = sin(sc_phase) * 0.55 + sin(sc_phase * 2.31 + 1.7) * 0.25 + 0.45;
    vec3 sc_wd = transpose(mat3(sc_model)) * vec3(uWindDir.x, 0.0, uWindDir.y);
    sc_wd = normalize(sc_wd + vec3(1e-5));
    transformed += sc_wd * sc_gust * uWindStrength * uScWindAmount * sc_h * sc_h;
  }`
      : ``
  }
  ${opts.vertex ?? ``}
  vScWorldNormal = normalize(mat3(sc_model) * objectNormal);
  vScWorldPos = (sc_model * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      SHARED_HEADER +
      `uniform float uScSnowAmount;
` +
      NOISE_GLSL +
      (opts.fragmentHeader ?? ``) +
      `
` +
      shader.fragmentShader.replace(
        `#include <color_fragment>`,
        `#include <color_fragment>
  ${opts.fragment ?? ``}
  if (uScSnowAmount > 0.0 && uSnow > 0.0) {
    float sc_up = smoothstep(0.35, 0.8, normalize(vScWorldNormal).y);
    float sc_edge = sc_noise(vScWorldPos.xz * 3.1) * 0.35;
    float sc_s = smoothstep(0.0, 0.3, uSnow * uScSnowAmount * 1.15 - sc_edge) * sc_up;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), clamp(sc_s, 0.0, 1.0));
  }`,
      );
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

const MAX_PARTICLES = 192; // m (pokefx 105)

const PARTICLE_VERTEX = `
attribute vec4 aA; // x y z birth
attribute vec4 aB; // vx vy vz life
attribute vec4 aC; // size shape gravity drag
uniform float uTime;
varying vec2 vUv;
varying float vLife;
varying float vShape;
varying vec3 vCol;
varying float vSeed;
void main() {
  float age = uTime - aA.w;
  float l = age / aB.w;
  vLife = l;
  vShape = aC.y;
  vUv = uv * 2.0 - 1.0;
  vSeed = fract(sin(aA.w * 91.7 + aA.x * 12.9) * 43758.5);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  if (l < 0.0 || l > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float k = max(0.0001, aC.w);
  float T = (1.0 - exp(-k * age)) / k;
  vec3 p = aA.xyz + aB.xyz * T;
  p.y -= 0.5 * aC.z * age * age;
  float pop = min(1.0, l * 7.0);
  float grow = (1.0 - pow(1.0 - pop, 3.0)) * (1.0 + sin(pop * 3.14159) * 0.28);
  if (aC.y > 3.5 && aC.y < 4.5) grow = mix(0.4, 1.3, 1.0 - pow(1.0 - l, 2.0)); // puffs expand
  float shrink = 1.0 - smoothstep(0.72, 1.0, l) * 0.55;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float ang = (vSeed - 0.5) * 0.5 + (aC.y > 1.5 && aC.y < 2.5 ? age * (vSeed - 0.5) * 6.0 : 0.0);
  float ca = cos(ang), sa = sin(ang);
  vec2 q = vec2(ca * position.x - sa * position.y, sa * position.x + ca * position.y);
  mv.xy += q * aC.x * grow * shrink;
  gl_Position = projectionMatrix * mv;
}`; // h (pokefx 106)

const PARTICLE_FRAGMENT = `
uniform float uDaylight;
varying vec2 vUv;
varying float vLife;
varying float vShape;
varying vec3 vCol;
varying float vSeed;
float sdEllipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
void main() {
  float l = clamp(vLife, 0.0, 1.0);
  vec2 p = vUv;
  float r = length(p);
  float a = 0.0;
  vec3 c = vCol;
  float fade = smoothstep(0.0, 0.08, l) * (1.0 - smoothstep(0.6, 1.0, l));
  if (vShape < 0.5) {
    a = smoothstep(1.0, 0.55, r);
    c *= 0.85 + 0.3 * smoothstep(0.9, 0.0, r);
  } else if (vShape < 1.5) {
    // heart
    vec2 h = vec2(p.x * 1.22, p.y * 1.22 + 0.16);
    float f = pow(h.x * h.x + h.y * h.y - 1.0, 3.0) - h.x * h.x * h.y * h.y * h.y;
    a = smoothstep(0.05, -0.02, f);
    float hi = smoothstep(0.35, 0.0, length(p - vec2(-0.38, 0.4)));
    c = mix(c, vec3(1.0, 0.93, 0.95), hi * 0.6);
    c *= 0.9 + 0.12 * p.y;
  } else if (vShape < 2.5) {
    // 4-point sparkle
    vec2 s = abs(p);
    float star = pow(s.x, 0.55) + pow(s.y, 0.55);
    a = smoothstep(1.0, 0.7, star);
    a = max(a, smoothstep(0.32, 0.0, r) * 0.9);
    c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.5, 0.0, r));
  } else if (vShape < 3.5) {
    // eighth note: head + stem + flag
    float head = sdEllipse((p - vec2(-0.3, -0.55)) * mat2(0.94, 0.34, -0.34, 0.94), vec2(0.36, 0.26));
    float stem = max(abs(p.x - 0.02) - 0.085, max(p.y - 0.78, -0.5 - p.y));
    vec2 fl = p - vec2(0.36, 0.5);
    float flag = max(sdEllipse(fl * mat2(0.8, -0.6, 0.6, 0.8), vec2(0.34, 0.16)), -(p.x - 0.04));
    float d = min(min(head, stem), flag);
    a = smoothstep(0.05, -0.03, d);
  } else if (vShape < 4.5) {
    // soft dust puff
    float n = 0.85 + 0.3 * fract(sin(dot(floor(p * 3.0 + vSeed * 9.0), vec2(12.9, 78.2))) * 43758.5);
    a = smoothstep(1.0, 0.15, r * n) * 0.85;
    c *= mix(0.8, 1.0, uDaylight);
    fade = smoothstep(0.0, 0.12, l) * pow(1.0 - l, 1.4);
  } else if (vShape < 5.5) {
    // water droplet: circle with a bright highlight
    a = smoothstep(1.0, 0.8, r);
    c = mix(c, vec3(1.0), smoothstep(0.5, 0.0, length(p - vec2(-0.3, 0.35))) * 0.85);
    c *= 0.92;
  } else {
    // five-point star
    float ang = atan(p.x, p.y);
    float k = 0.5 + 0.5 * cos(5.0 * ang);
    float rad = mix(0.42, 1.0, pow(k, 1.6));
    a = smoothstep(rad, rad - 0.16, r);
    c = mix(c, vec3(1.0, 0.98, 0.85), smoothstep(0.6, 0.0, r) * 0.8);
  }
  a *= fade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`; // g (pokefx 147)

const tmpColor = new THREE.Color(); // _ (pokefx 212)

/**
 * Particle shapes (aC.y): 0 dot, 1 heart, 2 sparkle, 3 note, 4 dust puff, 5 droplet, 6 star.
 */
export class PokeFx { // v (pokefx 213)
  mesh: THREE.InstancedMesh;
  aA: THREE.InstancedBufferAttribute;
  aB: THREE.InstancedBufferAttribute;
  aC: THREE.InstancedBufferAttribute;
  next = 0;
  dirty = false;
  constructor(parent: THREE.Object3D) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(768), 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(768), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(768), 4).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.aA.setXYZW(i, 0, -1e5, 0, -1e5);
      this.aB.setXYZW(i, 0, 0, 0, 1);
      this.aC.setXYZW(i, 0.1, 0, 0, 1);
    }
    geometry.setAttribute(`aA`, this.aA);
    geometry.setAttribute(`aB`, this.aB);
    geometry.setAttribute(`aC`, this.aC);
    const material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: { uTime: UNIFORMS.uTime, uDaylight: UNIFORMS.uDaylight },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.mesh.name = `poke-fx`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, identity);
      this.mesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
    }
    parent.add(this.mesh);
  }

  /** Writes one particle into the ring buffer. `delay` shifts its birth time (seconds). */
  emit(
    shape: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: THREE.ColorRepresentation,
    gravity = 0,
    drag = 1.2,
    delay = 0,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    this.aA.setXYZW(i, x, y, z, UNIFORMS.uTime.value + delay);
    this.aB.setXYZW(i, vx, vy, vz, life);
    this.aC.setXYZW(i, size, shape, gravity, drag);
    this.mesh.setColorAt(i, tmpColor.set(color));
    this.aA.needsUpdate = this.aB.needsUpdate = this.aC.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  hearts(x: number, y: number, z: number, count = 3, spread = 0.18, size = 0.055): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * 6.283 + Math.random() * 1.2;
      const speed = spread * (0.6 + Math.random() * 0.6);
      this.emit(
        1,
        x,
        y,
        z,
        Math.cos(ang) * speed,
        0.28 + Math.random() * 0.14,
        Math.sin(ang) * speed,
        1.5 + Math.random() * 0.4,
        size * (0.85 + Math.random() * 0.3),
        i % 2 ? `#f58fa6` : `#ff7a95`,
        -0.05,
        1.6,
        i * 0.09,
      );
    }
  }

  sparkles(x: number, y: number, z: number, count = 6, spread = 0.35, size = 0.04, color: THREE.ColorRepresentation = `#fff3b0`): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * 6.283;
      const up = Math.random() * 1.2 - 0.2;
      const speed = spread * (0.5 + Math.random());
      this.emit(
        2,
        x,
        y,
        z,
        Math.cos(ang) * speed,
        0.15 + up * 0.3,
        Math.sin(ang) * speed,
        0.8 + Math.random() * 0.5,
        size * (0.7 + Math.random() * 0.6),
        color,
        0.15,
        2.4,
        Math.random() * 0.12,
      );
    }
  }

  notes(x: number, y: number, z: number, count = 2, color: THREE.ColorRepresentation = `#4a3b2f`): void {
    for (let i = 0; i < count; i++) {
      const vx = (i % 2 ? 1 : -1) * (0.06 + Math.random() * 0.06);
      this.emit(
        3,
        x,
        y,
        z,
        vx,
        0.3 + Math.random() * 0.1,
        Math.random() * 0.1 - 0.05,
        1.5 + Math.random() * 0.3,
        0.06,
        color,
        -0.02,
        1.4,
        i * 0.22,
      );
    }
  }

  puff(x: number, y: number, z: number, count = 3, size = 0.07, color: THREE.ColorRepresentation = `#efe4c8`): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * 6.283 + Math.random();
      this.emit(
        4,
        x,
        y + 0.01,
        z,
        Math.cos(ang) * 0.16,
        0.05 + Math.random() * 0.05,
        Math.sin(ang) * 0.16,
        0.55 + Math.random() * 0.25,
        size * (0.8 + Math.random() * 0.5),
        color,
        -0.1,
        3.2,
      );
    }
  }

  drops(x: number, y: number, z: number, count = 6, power = 1, color: THREE.ColorRepresentation = `#dff6f6`): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * 6.283;
      const speed = (0.2 + Math.random() * 0.35) * power;
      this.emit(
        5,
        x,
        y,
        z,
        Math.cos(ang) * speed,
        (0.9 + Math.random() * 0.9) * power,
        Math.sin(ang) * speed,
        0.55 + Math.random() * 0.25,
        0.017 + Math.random() * 0.011,
        color,
        5.2,
        0.4,
      );
    }
  }

  stars(x: number, y: number, z: number, count = 4, size = 0.05, color: THREE.ColorRepresentation = `#ffd86b`): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * 6.283 + Math.random() * 0.6;
      this.emit(
        6,
        x,
        y,
        z,
        Math.cos(ang) * 0.35,
        0.25 + Math.random() * 0.2,
        Math.sin(ang) * 0.35,
        1 + Math.random() * 0.3,
        size,
        color,
        0.5,
        1.8,
      );
    }
  }
}

/** The game fields pokeFx reads. The `Game` object satisfies it. */
export interface PokeFxHost {
  scene: THREE.Object3D;
  fauna?: { object?: THREE.Object3D } | null;
}

const instances = new WeakMap<PokeFxHost, PokeFx>(); // y (pokefx 375)

/** One shared PokeFx per game, parented to the fauna root (or the scene). */
export function pokeFx(game: PokeFxHost): PokeFx { // b (pokefx 376), wt
  let fx = instances.get(game);
  if (!fx) {
    fx = new PokeFx(game.fauna?.object ?? game.scene);
    instances.set(game, fx);
  }
  return fx;
}
