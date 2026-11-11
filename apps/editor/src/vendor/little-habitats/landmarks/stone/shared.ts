// Ports index-BwioI7A7.js 31190-31514: helpers shared by the stone landmarks (campfire, gazebo, hot spring,
// standing stones, sundial): time-of-year curves, the wind helper, the KitFrame part placer (Uh) with its tube (Fh),
// the instanced billboard pool (Kh) with its smoke (qh) and ember (Jh) shaders, the ground glow disc (Xh) and the
// xorshift generator (Zh).
import * as THREE from 'three';
import { MeshKit, type MeshKitOptions, roundedBox } from '../../ecology/meshKit';
import { sharedNoise } from '../../ecology/noise';
import type { LandmarkUpdateContext } from '../types';

export const TAU = Math.PI * 2; // Sh (31190)
/** The default facing of a stone landmark: 45 degrees. */
export const BASE_YAW = Math.PI / 4; // Ch (31191)

export const smoothstep = (edge0: number, edge1: number, x: number): number => { // wh (31192)
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
/** 1 around midsummer (year fraction 0.31..0.39), 0 elsewhere. */
export const midsummer = (yearFrac: number): number => smoothstep(0.27, 0.31, yearFrac) * (1 - smoothstep(0.39, 0.43, yearFrac)); // Th (31196)
/** 0 at midsummer (year fraction 0.375), 1 at midwinter. */
export const wintriness = (yearFrac: number): number => 0.5 - 0.5 * Math.cos(TAU * (yearFrac - 0.375)); // Eh (31197)
/** 1 from dusk to dawn (day fraction after 0.735 or before 0.235), 0 by day. */
export const nightness = (dayFrac: number): number => Math.max(smoothstep(0.685, 0.735, dayFrac), 1 - smoothstep(0.235, 0.285, dayFrac)); // Dh (31198)

/** Wind vector (direction times strength) turned into the local frame of a landmark with yaw `rotY`. */
export function localWind(ctx: LandmarkUpdateContext, rotY: number, out: { x: number; z: number }): { x: number; z: number } { // Oh (31199)
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const wx = ctx.windDir.x * ctx.wind;
  const wz = ctx.windDir.y * ctx.wind;
  out.x = wx * c - wz * s;
  out.z = wx * s + wz * c;
  return out;
}

interface CachedShape {
  pos: ArrayLike<number>;
  nor: ArrayLike<number>;
}

const shapeCache = new Map<string, CachedShape>(); // kh (31206)

/** Non-indexed positions and normals of a three.js geometry, built once per key. */
function cachedShape(key: string, make: () => THREE.BufferGeometry): CachedShape { // Ah (31207)
  let shape = shapeCache.get(key);
  if (!shape) {
    let g = make();
    if (g.index) g = g.toNonIndexed();
    g.computeVertexNormals();
    shape = { pos: g.attributes.position.array, nor: g.attributes.normal.array };
    shapeCache.set(key, shape);
  }
  return shape;
}

/** Options that the KitFrame methods read, on top of the MeshKit options. */
export interface KitFrameOptions extends MeshKitOptions {
  /** Part scale (KitFrame.m); blob multiplies it by its radius. */
  sc?: readonly number[];
  /** Part rotation, Euler YXZ. */
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** lathe: start angle. */
  phi?: number;
  /** ring: arc length. Default TAU. */
  arc?: number;
  /** tube: roll of the cross-section around the tube axis. */
  spin?: number;
}

const _tubeBasis = new THREE.Matrix4(); // jh (31218)
const _tubeX = new THREE.Vector3(); // Mh (31219)
const _tubeAxis = new THREE.Vector3(); // Nh (31220)
const _tubeZ = new THREE.Vector3(); // Ph (31221)

/** Adds a tapered cylinder from `a` (radius r0) to `b` (radius r1) to the kit, in kit space. */
function addTube( // Fh (31222)
  kit: MeshKit,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r0: number,
  r1: number,
  segments: number,
  color: THREE.ColorRepresentation,
  opts: KitFrameOptions = {},
): void {
  _tubeAxis.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = _tubeAxis.length();
  if (len < 1e-5) return;
  _tubeAxis.divideScalar(len);
  _tubeX.set(1, 0, 0);
  if (Math.abs(_tubeX.dot(_tubeAxis)) > 0.95) _tubeX.set(0, 0, 1);
  _tubeZ.crossVectors(_tubeX, _tubeAxis).normalize();
  _tubeX.crossVectors(_tubeAxis, _tubeZ).normalize();
  if (opts.spin) {
    const c = Math.cos(opts.spin);
    const s = Math.sin(opts.spin);
    const x = _tubeX.x * c + _tubeZ.x * s;
    const y = _tubeX.y * c + _tubeZ.y * s;
    const z = _tubeX.z * c + _tubeZ.z * s;
    _tubeZ.set(_tubeZ.x * c - _tubeX.x * s, _tubeZ.y * c - _tubeX.y * s, _tubeZ.z * c - _tubeX.z * s);
    _tubeX.set(x, y, z);
  }
  const shape = cachedShape(`sc-cyl:${r0}:${r1}:${segments}`, () =>
    new THREE.CylinderGeometry(r1, r0, 1, segments, 1).translate(0, 0.5, 0),
  );
  _tubeBasis.makeBasis(_tubeX.multiplyScalar(1), _tubeAxis.multiplyScalar(len), _tubeZ);
  _tubeBasis.setPosition(a.x, a.y, a.z);
  kit.addRaw(shape.pos, shape.nor, _tubeBasis, color, opts);
}

const _euler = new THREE.Euler(0, 0, 0, `YXZ`); // Ih (31246)
const _quat = new THREE.Quaternion(); // Lh (31247)
const _scale = new THREE.Vector3(); // Rh (31248)
const _pos = new THREE.Vector3(); // zh (31249)
const _local = new THREE.Matrix4(); // Bh (31250)
const _world = new THREE.Matrix4(); // Vh (31251)
const boxCache = new Map<string, Float32Array>(); // Hh (31252)
const _tubeA = new THREE.Vector3(); // Wh (31313)
const _tubeB = new THREE.Vector3(); // Gh (31314)

/**
 * Places MeshKit parts inside a movable frame (position plus YXZ rotation). Each part takes yaw, pitch, roll and a
 * scale `sc` of its own.
 */
export class KitFrame { // Uh (31253)
  g: MeshKit;
  F = new THREE.Matrix4();

  constructor(kit: MeshKit) {
    this.g = kit;
  }

  /** Sets the frame. With no arguments it resets to the identity. */
  frame(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0): this {
    _euler.set(pitch, yaw, roll, `YXZ`);
    _quat.setFromEuler(_euler);
    this.F.compose(_pos.set(x, y, z), _quat, _scale.set(1, 1, 1));
    return this;
  }

  /** Frame matrix times the part matrix. */
  m(x: number, y: number, z: number, opts: KitFrameOptions, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
    _euler.set(opts.pitch ?? 0, opts.yaw ?? 0, opts.roll ?? 0, `YXZ`);
    _quat.setFromEuler(_euler);
    const sc = opts.sc ?? [1, 1, 1];
    _local.compose(_pos.set(x, y, z), _quat, _scale.set(sx * sc[0], sy * sc[1], sz * sc[2]));
    return _world.multiplyMatrices(this.F, _local);
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts: KitFrameOptions = {}): this {
    const bevel = opts.bevel ?? Math.min(w, h, d) * 0.18;
    const key = `${w}:${h}:${d}:${bevel}`;
    let tris = boxCache.get(key);
    if (!tris) {
      tris = roundedBox(w, h, d, bevel);
      boxCache.set(key, tris);
    }
    this.g.addRaw(tris, null, this.m(x, y, z, opts), color, opts);
    return this;
  }

  cyl(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    opts: KitFrameOptions = {},
  ): this {
    const shape = cachedShape(`k-cyl:${radiusTop}:${radiusBottom}:${height}:${segments}`, () =>
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1).translate(0, height / 2, 0),
    );
    this.g.addRaw(shape.pos, shape.nor, this.m(x, y, z, opts), color, opts);
    return this;
  }

  cone(radius: number, height: number, segments: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts: KitFrameOptions = {}): this {
    const shape = cachedShape(`k-cone:${radius}:${height}:${segments}`, () =>
      new THREE.ConeGeometry(radius, height, segments).translate(0, height / 2, 0),
    );
    this.g.addRaw(shape.pos, shape.nor, this.m(x, y, z, opts), color, opts);
    return this;
  }

  blob(radius: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts: KitFrameOptions = {}): this {
    const detail = opts.detail ?? 1;
    const shape = cachedShape(`k-ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    this.g.addRaw(shape.pos, shape.nor, this.m(x, y, z, opts, radius, radius, radius), color, { grad: 0.2, ...opts });
    return this;
  }

  lathe(
    points: readonly (readonly number[])[],
    segments: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    opts: KitFrameOptions = {},
  ): this {
    const phi = opts.phi ?? 0;
    const shape = cachedShape(
      `k-lathe:${segments}:${phi}:${points.map((p) => p.join(`,`)).join(`;`)}`,
      () =>
        new THREE.LatheGeometry(
          points.map(([px, py]) => new THREE.Vector2(px, py)),
          segments,
          phi,
        ),
    );
    this.g.addRaw(shape.pos, shape.nor, this.m(x, y, z, opts), color, opts);
    return this;
  }

  ring(
    radius: number,
    tube: number,
    radialSegments: number,
    tubularSegments: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    opts: KitFrameOptions = {},
  ): this {
    const arc = opts.arc ?? TAU;
    const shape = cachedShape(`k-torus:${radius}:${tube}:${radialSegments}:${tubularSegments}:${arc}`, () =>
      new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc).rotateX(Math.PI / 2),
    );
    this.g.addRaw(shape.pos, shape.nor, this.m(x, y, z, opts), color, opts);
    return this;
  }

  /** Tapered tube from (x0, y0, z0) radius r0 to (x1, y1, z1) radius r1, both points in frame space. */
  tube(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    r0: number,
    r1: number,
    segments: number,
    color: THREE.ColorRepresentation,
    opts: KitFrameOptions = {},
  ): this {
    _tubeA.set(x0, y0, z0).applyMatrix4(this.F);
    _tubeB.set(x1, y1, z1).applyMatrix4(this.F);
    addTube(this.g, _tubeA, _tubeB, r0, r1, segments, color, opts);
    return this;
  }
}

/**
 * A pool of camera-facing quads drawn as one InstancedMesh. The caller moves the particles itself and writes each one
 * with write(); a dead slot sits far below the ground with alpha 0.
 */
export class Billboards { // Kh (31315)
  n: number;
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  rnd: Float32Array;
  alpha: THREE.InstancedBufferAttribute;
  mat: THREE.ShaderMaterial;
  geo: THREE.BufferGeometry;

  constructor(count: number, geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial) {
    this.n = count;
    this.geo = geo;
    this.mat = mat;
    const make = () => new Float32Array(count);
    this.x = make();
    this.y = make();
    this.z = make();
    this.vx = make();
    this.vy = make();
    this.vz = make();
    this.age = make();
    this.life = make();
    this.size = make();
    this.rnd = make();
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(`aAlpha`, this.alpha);
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = !1;
    this.mesh.castShadow = !1;
    this.mesh.receiveShadow = !1;
    for (let i = 0; i < count; i++) {
      this.age[i] = 1;
      this.life[i] = 1;
      this.write(i, 0, -50, 0, 0, 0);
    }
    this.flush();
  }

  alive(i: number): boolean {
    return this.age[i] < this.life[i];
  }

  /** Index of a dead slot, or -1. */
  free(): number {
    for (let i = 0; i < this.n; i++) if (this.age[i] >= this.life[i]) return i;
    return -1;
  }

  /** Writes slot i as a uniform scale s at (x, y, z) with alpha a. */
  write(i: number, x: number, y: number, z: number, s: number, a: number): void {
    const m = this.mesh.instanceMatrix.array;
    const o = i * 16;
    m[o] = s;
    m[o + 1] = 0;
    m[o + 2] = 0;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = s;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = 0;
    m[o + 9] = 0;
    m[o + 10] = s;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    this.alpha.array[i] = a;
  }

  kill(i: number): void {
    this.age[i] = this.life[i] = 1;
    this.write(i, 0, -50, 0, 0, 0);
  }

  flush(): void {
    this.mesh.instanceMatrix.needsUpdate = !0;
    this.alpha.needsUpdate = !0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Soft lumpy smoke or steam puffs (normal blending), stretched by uStretch. */
export function smokePuffs(count: number, color: THREE.ColorRepresentation, stretch = 1.25, soft = 1.35): Billboards { // qh (31393)
  const pool = new Billboards(
    count,
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 },
        uStretch: { value: stretch },
        uSoft: { value: soft },
      },
      vertexShader: `
      attribute float aAlpha;
      uniform float uStretch;
      varying vec2 vUv;
      varying float vA;
      varying float vSeed;
      void main() {
        vUv = uv - 0.5;
        vA = aAlpha;
        vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vSeed = fract(float(gl_InstanceID) * 0.6180339 + 0.13);
        vec4 mv = viewMatrix * wp;
        float s = length((modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz);
        mv.xy += position.xy * s * vec2(1.0, uStretch);
        gl_Position = projectionMatrix * mv;
        if (aAlpha <= 0.001) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      }`,
      fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSoft;
      varying vec2 vUv;
      varying float vA;
      varying float vSeed;
      void main() {
        float ang = atan(vUv.y, vUv.x + 1e-6); // atan(0,0) is NaN on some GPUs (a black square through bloom)
        float lump = 0.1 * sin(ang * 3.0 + vSeed * 6.28) + 0.06 * sin(ang * 5.0 - vSeed * 11.0);
        float d = length(vUv) * 2.0 * (1.0 + lump);
        if (d > 1.0) discard;
        float a = pow(1.0 - d, uSoft);
        // a touch brighter towards the top-left (lit side) so the puffs read as volumes
        vec3 c = uColor * (0.9 + 0.18 * clamp(-vUv.x + vUv.y + 0.5, 0.0, 1.0));
        gl_FragColor = vec4(c, a * vA * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent: !0,
      depthWrite: !1,
    }),
  );
  pool.mesh.renderOrder = 6;
  return pool;
}

/** Additive glowing sparks (embers, wisps). minScale keeps far sparks at least that fraction of the view depth. */
export function emberSparks( // Jh (31441)
  count: number,
  color: THREE.ColorRepresentation,
  hot: THREE.ColorRepresentation,
  minScale = 0.006,
): Billboards {
  const pool = new Billboards(
    count,
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uHot: { value: new THREE.Color(hot) }, uGain: { value: 1 } },
      vertexShader: `
      attribute float aAlpha;
      varying vec2 vUv;
      varying float vA;
      void main() {
        vUv = uv - 0.5;
        vA = aAlpha;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length((modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz);
        s = max(s, -mv.z * ${minScale.toFixed(4)});
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
        if (aAlpha <= 0.001) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      }`,
      fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHot;
      uniform float uGain;
      varying vec2 vUv;
      varying float vA;
      void main() {
        float d = length(vUv) * 2.0;
        if (d > 1.0) discard;
        float core = smoothstep(0.22, 0.0, d);
        float halo = exp(-d * d * 7.0) * (1.0 - d);
        vec3 c = mix(uColor, uHot, core) * (core * 5.0 + halo * 1.1) * vA * uGain;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent: !0,
      depthWrite: !1,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.mesh.renderOrder = 7;
  return pool;
}

const discCache = new Map<number, THREE.BufferGeometry>(); // Yh (31484)

/** An additive glow disc lying on the ground (hidden, opacity 0 until the caller lights it). */
export function groundGlow(radius: number, color: THREE.ColorRepresentation, y = 0.03): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> { // Xh (31485)
  let geo = discCache.get(radius);
  if (!geo) {
    geo = new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2);
    discCache.set(radius, geo);
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: sharedNoise(),
      color: new THREE.Color(color),
      transparent: !0,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: !1,
      polygonOffset: !0,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: !1,
    }),
  );
  mesh.position.y = y;
  mesh.renderOrder = 2;
  mesh.visible = !1;
  return mesh;
}

/** Xorshift32 generator. Returns floats in [0, 1). */
export class XorShift { // Zh (31505)
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
}
