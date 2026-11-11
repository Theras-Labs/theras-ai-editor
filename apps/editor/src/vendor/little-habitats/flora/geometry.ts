// Ports bundle lines 19870-20299 (part kinds, PlantBuilder, shape and colour helpers), plus the helpers that sit
// between the plant recipes: 20796-20807 (vl), 21025-21055 (wl), 21445-21468 (jl), 21687-21716 (Il, Ll).
// Bundle 19804-19869 (Oc) is three's mergeVertices: imported from 'three/addons/utils/BufferGeometryUtils.js'.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../core/rng';
import { createNoise3D } from '../lib/simplex';

/** Part kinds. The vertex shader reads the kind from aPart.w. TURN (10) is added to a kind for the sunflower head. */
export const PART = { // q (19870)
  WOOD: 0,
  LEAF: 1,
  EVER: 2,
  BLOSSOM: 3,
  FRUIT: 4,
  PETAL: 5,
  HEAD: 6,
  BUD: 7,
  HERB: 8,
  STEM: 9,
  TURN: 10,
} as const;

const _p = new THREE.Vector3(); // kc (19871)
const _n = new THREE.Vector3(); // Ac (19872)
const _color = new THREE.Color(); // jc (19873)
// Bundle 19874 creates a Box3 and discards it (`new Me()`): no effect, not included.
const _anchor = new THREE.Vector3(); // Mc (19875)
const _faceCenter = new THREE.Vector3(); // Nc (19876)

/** Colour callback: position, normal, output colour. */
export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => unknown;
export type FlexFn = (p: THREE.Vector3) => number;

export interface PartOptions {
  kind: number;
  color: THREE.Color | ColorFn;
  anchor?: THREE.Vector3;
  flex?: number | FlexFn;
  phase?: number;
  flat?: boolean;
  faceColor?: boolean;
  vertexPhase?: boolean;
  doubleSide?: boolean;
}

/** Collects non-indexed triangles with per-vertex colour, part anchor/kind and wind data. */
export class PlantBuilder { // Pc (19877)
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  part: number[] = [];
  fx: number[] = [];
  rnd: () => number;

  constructor(seed = 1) {
    this.rnd = seededRandom(seed);
  }

  random(): number {
    return this.rnd();
  }

  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, opts: PartOptions): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (opts.flat || !g.getAttribute('normal')) g.computeVertexNormals();
    const position = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    if (opts.anchor) _anchor.copy(opts.anchor);
    else {
      g.computeBoundingBox();
      g.boundingBox!.getCenter(_anchor);
    }
    const phase = opts.phase ?? this.rnd();
    const colorFn = typeof opts.color == 'function' ? opts.color : null;
    const count = position.count;
    const emit = (i: number, back: boolean) => {
      _p.fromBufferAttribute(position, i);
      _n.fromBufferAttribute(normal, i);
      if (back) _n.negate();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      if (colorFn) {
        if (opts.faceColor) {
          const first = i - (i % 3);
          _faceCenter.set(0, 0, 0);
          for (let k = 0; k < 3; k++) {
            _faceCenter.x += position.getX(first + k) / 3;
            _faceCenter.y += position.getY(first + k) / 3;
            _faceCenter.z += position.getZ(first + k) / 3;
          }
          colorFn(_faceCenter, _n, _color);
        } else colorFn(_p, _n, _color);
      } else _color.copy(opts.color as THREE.Color);
      this.col.push(_color.r, _color.g, _color.b);
      this.part.push(_anchor.x, _anchor.y, _anchor.z, opts.kind);
      const flex = typeof opts.flex == 'function' ? opts.flex(_p) : (opts.flex ?? 0);
      const vertexPhase = opts.vertexPhase
        ? fract(Math.sin(_p.x * 12.9898 + _p.y * 78.233 + _p.z * 37.719) * 43758.5453)
        : phase;
      this.fx.push(flex, vertexPhase);
    };
    for (let i = 0; i < count; i++) emit(i, false);
    if (opts.doubleSide) for (let i = 0; i < count; i += 3) (emit(i, true), emit(i + 2, true), emit(i + 1, true));
    g.dispose();
    return this;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  build(scale = 1): THREE.BufferGeometry {
    if (scale !== 1) {
      for (let i = 0; i < this.pos.length; i++) this.pos[i] *= scale;
      for (let i = 0; i < this.part.length; i += 4) {
        this.part[i] *= scale;
        this.part[i + 1] *= scale;
        this.part[i + 2] *= scale;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 4));
    geometry.setAttribute('aFx', new THREE.Float32BufferAttribute(this.fx, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export const fract = (x: number): number => x - Math.floor(x); // Fc (19946)
export const toColor = (hex: THREE.ColorRepresentation): THREE.Color => new THREE.Color(hex); // Ic (19947)

/** Samples a colour ramp at t (0..1) into out. */
export function sampleRamp(colors: THREE.Color[], t: number, out: THREE.Color): THREE.Color { // Lc (19948)
  const f = Math.min(1, Math.max(0, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(f));
  return out.copy(colors[i]).lerp(colors[i + 1], f - i);
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x)); // Rc (19953)
export const noise3 = createNoise3D(seededRandom(90210)); // zc (19954)

export interface BlobOptions {
  detail?: number;
  lumps?: number;
  freq?: number;
  seed?: number;
  fine?: number;
  fineFreq?: number;
  sy?: number;
}

/** Lumpy icosphere of the given radius. */
export function blobGeometry(radius: number, opts: BlobOptions = {}): THREE.BufferGeometry { // Bc (19955)
  const detail = opts.detail ?? 2;
  const lumps = opts.lumps ?? 0.14;
  const freq = opts.freq ?? 1.6;
  const seed = opts.seed ?? 0;
  const fine = opts.fine ?? 0.05;
  const fineFreq = opts.fineFreq ?? 5.5;
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 1e-4);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    _p.fromBufferAttribute(position, i).normalize();
    const k =
      1 +
      lumps * noise3(_p.x * freq + seed * 7.1, _p.y * freq + seed * 3.3, _p.z * freq - seed * 5.7) +
      fine * noise3(_p.x * fineFreq - seed * 2.1, _p.y * fineFreq + seed * 9.4, _p.z * fineFreq + seed);
    _p.multiplyScalar(radius * k);
    _p.y *= opts.sy ?? 1;
    position.setXYZ(i, _p.x, _p.y, _p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function ellipsoid(sx: number, sy: number, sz: number, widthSegments = 8, heightSegments = 6): THREE.BufferGeometry { // Vc (19975)
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  geometry.deleteAttribute('uv');
  geometry.scale(sx, sy, sz);
  return geometry;
}

/** Tube along points (parallel-transport frames), radius per point, optional tip cap. */
export function tube(points: THREE.Vector3[], radii: number[], sides = 6, cap = true): THREE.BufferGeometry { // Hc (19979)
  const positions: number[] = [];
  const rings: THREE.Vector3[][] = [];
  let normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const prevTangent = new THREE.Vector3();
  for (let r = 0; r < points.length; r++) {
    const prev = points[Math.max(0, r - 1)];
    const next = points[Math.min(points.length - 1, r + 1)];
    tangent.subVectors(next, prev).normalize();
    if (r === 0) {
      const up = Math.abs(tangent.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      normal.crossVectors(tangent, up).normalize();
    } else {
      const axis = new THREE.Vector3().crossVectors(prevTangent, tangent);
      const length = axis.length();
      if (length > 1e-6) {
        axis.divideScalar(length);
        const angle = Math.acos(Math.min(1, Math.max(-1, prevTangent.dot(tangent))));
        normal.applyAxisAngle(axis, angle);
      }
    }
    prevTangent.copy(tangent);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const p = new THREE.Vector3()
        .copy(normal)
        .multiplyScalar(Math.cos(a) * radii[r])
        .addScaledVector(binormal, Math.sin(a) * radii[r])
        .add(points[r]);
      ring.push(p);
    }
    rings.push(ring);
    normal = normal.clone();
  }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let e = 0; e < rings.length - 1; e++)
    for (let t = 0; t < sides; t++) {
      const a = rings[e][t];
      const b = rings[e][(t + 1) % sides];
      const c = rings[e + 1][(t + 1) % sides];
      const d = rings[e + 1][t];
      tri(a, c, b);
      tri(a, d, c);
    }
  if (cap) {
    const last = rings[rings.length - 1];
    const tip = points[points.length - 1];
    for (let e = 0; e < sides; e++) tri(last[e], tip, last[(e + 1) % sides]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Quadratic Bezier from a through b to c, segments + 1 points. */
export function quadBezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, segments: number): THREE.Vector3[] { // Uc (20031)
  const points: THREE.Vector3[] = [];
  for (let o = 0; o <= segments; o++) {
    const s = o / segments;
    const u = 1 - s;
    points.push(
      new THREE.Vector3(
        u * u * a.x + 2 * u * s * b.x + s * s * c.x,
        u * u * a.y + 2 * u * s * b.y + s * s * c.y,
        u * u * a.z + 2 * u * s * b.z + s * s * c.z,
      ),
    );
  }
  return points;
}

export interface RibbonOptions {
  up?: THREE.Vector3;
  fold?: number;
  simple?: boolean;
}

/** Flat (optionally folded) strip along points; width(t) gives the half width at t in 0..1. */
export function ribbon(points: THREE.Vector3[], width: (t: number) => number, opts: RibbonOptions = {}): THREE.BufferGeometry { // Wc (20046)
  const positions: number[] = [];
  const up = (opts.up ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  const fold = opts.fold ?? 0;
  const left: THREE.Vector3[] = [];
  const mid: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  const tangent = new THREE.Vector3();
  for (let n = 0; n < points.length; n++) {
    const t = n / (points.length - 1);
    const prev = points[Math.max(0, n - 1)];
    const next = points[Math.min(points.length - 1, n + 1)];
    tangent.subVectors(next, prev).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    const lift = new THREE.Vector3().crossVectors(side, tangent).normalize();
    const w = width(t);
    const folded = lift.clone().multiplyScalar(w * fold);
    mid.push(points[n].clone());
    left.push(points[n].clone().addScaledVector(side, -w).add(folded));
    right.push(points[n].clone().addScaledVector(side, w).add(folded));
  }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let t = 0; t < points.length - 1; t++) {
    if (opts.simple) {
      tri(left[t], right[t], right[t + 1]);
      tri(left[t], right[t + 1], left[t + 1]);
      continue;
    }
    tri(left[t], mid[t], mid[t + 1]);
    tri(left[t], mid[t + 1], left[t + 1]);
    tri(mid[t], right[t], right[t + 1]);
    tri(mid[t], right[t + 1], mid[t + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal');
  let facing = 0;
  for (let e = 0; e < normal.count; e++) facing += normal.getX(e) * up.x + normal.getY(e) * up.y + normal.getZ(e) * up.z;
  if (facing < 0) {
    const position = geometry.getAttribute('position');
    for (let t = 0; t < position.count; t += 3) {
      const x = position.getX(t + 1);
      const y = position.getY(t + 1);
      const z = position.getZ(t + 1);
      position.setXYZ(t + 1, position.getX(t + 2), position.getY(t + 2), position.getZ(t + 2));
      position.setXYZ(t + 2, x, y, z);
    }
    geometry.computeVertexNormals();
  }
  return smoothNormals(geometry);
}

/** Averages the normals of vertices that share a position (key rounded to 4 decimals). */
export function smoothNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry { // Gc (20093)
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
  for (let e = 0; e < position.count; e++) {
    const k = key(e);
    const sum = sums.get(k) ?? new THREE.Vector3();
    sum.x += normal.getX(e);
    sum.y += normal.getY(e);
    sum.z += normal.getZ(e);
    sums.set(k, sum);
  }
  for (let e = 0; e < position.count; e++) {
    const sum = sums.get(key(e))!;
    const length = sum.length() || 1;
    normal.setXYZ(e, sum.x / length, sum.y / length, sum.z / length);
  }
  return geometry;
}

/** LatheGeometry from [radius, y] pairs (radius at least 1e-4), no uv. */
export function lathe(profile: [number, number][], segments = 10, phiStart = 0): THREE.BufferGeometry { // Kc (20110)
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y));
  const geometry = new THREE.LatheGeometry(points, segments, phiStart);
  geometry.deleteAttribute('uv');
  return geometry;
}

export interface CupOptions {
  segments?: number;
  rings?: number;
  lobes?: number;
  lobeDepth?: number;
  lobeFlare?: number;
}

/** Lobed petal cup: profile(t) returns [radius, height] for ring t in 0..1. */
export function cup(profile: (t: number) => [number, number], opts: CupOptions = {}): THREE.BufferGeometry { // qc (20115)
  const segments = opts.segments ?? 18;
  const ringCount = opts.rings ?? 5;
  const lobes = opts.lobes ?? 6;
  const lobeDepth = opts.lobeDepth ?? 0.3;
  const lobeFlare = opts.lobeFlare ?? 0;
  const rings: THREE.Vector3[][] = [];
  for (let t = 0; t <= ringCount; t++) {
    const v = t / ringCount;
    const ring: THREE.Vector3[] = [];
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const lobe = Math.abs(Math.cos((a * lobes) / 2)) ** 1.5;
      let [radius, y] = profile(v);
      const k = v ** 2.2;
      y -= lobeDepth * (1 - lobe) * k * y;
      radius *= 1 + lobeFlare * lobe * k;
      ring.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
    }
    rings.push(ring);
  }
  const positions: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let e = 0; e < ringCount; e++)
    for (let t = 0; t < segments; t++) {
      const a = rings[e][t];
      const b = rings[e][t + 1];
      const c = rings[e + 1][t + 1];
      const d = rings[e + 1][t];
      tri(a, c, b);
      tri(a, d, c);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  orientOutward(geometry);
  return smoothNormals(geometry);
}

/** Flips the winding when the normals point toward the Y axis on average. */
export function orientOutward(geometry: THREE.BufferGeometry): void { // Jc (20147)
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  let facing = 0;
  for (let e = 0; e < position.count; e++) facing += normal.getX(e) * position.getX(e) + normal.getZ(e) * position.getZ(e);
  if (!(facing >= 0)) {
    for (let e = 0; e < position.count; e += 3) {
      const x = position.getX(e + 1);
      const y = position.getY(e + 1);
      const z = position.getZ(e + 1);
      position.setXYZ(e + 1, position.getX(e + 2), position.getY(e + 2), position.getZ(e + 2));
      position.setXYZ(e + 2, x, y, z);
    }
    geometry.computeVertexNormals();
  }
}

/** Box with rounded, slightly noisy edges. */
export function roundedBlock( // Yc (20162)
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments: number,
  noise = 0.02,
  seed = 0,
): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 1e-4);
  const position = geometry.getAttribute('position');
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  const hz = depth / 2 - radius;
  const inner = new THREE.Vector3();
  for (let e = 0; e < position.count; e++) {
    _p.fromBufferAttribute(position, e);
    inner.set(Math.max(-hx, Math.min(hx, _p.x)), Math.max(-hy, Math.min(hy, _p.y)), Math.max(-hz, Math.min(hz, _p.z)));
    _n.subVectors(_p, inner);
    if (_n.lengthSq() < 1e-10) _n.set(0, 1, 0);
    _n.normalize();
    const r = radius * (1 + (noise / radius) * noise3(_p.x * 9 + seed, _p.y * 9 - seed, _p.z * 9 + seed * 2));
    _p.copy(inner).addScaledVector(_n, r);
    position.setXYZ(e, _p.x, _p.y, _p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const _quat = new THREE.Quaternion(); // Xc (20181)
const _euler = new THREE.Euler(); // Zc (20182)
const _scale = new THREE.Vector3(); // Qc (20183)
const _pos = new THREE.Vector3(); // $c (20184)

/** Translation, YXZ rotation and scale as a new Matrix4. */
export function trs(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 { // el (20185)
  _euler.set(rx, ry, rz, 'YXZ');
  _quat.setFromEuler(_euler);
  return new THREE.Matrix4().compose(_pos.set(x, y, z), _quat, _scale.set(sx, sy, sz));
}

/** Matrix that moves +Y onto dir, twisted about +Y first, at position p with uniform scale. */
export function alignY(p: THREE.Vector3, dir: THREE.Vector3, scale = 1, twist = 0): THREE.Matrix4 { // tl (20188)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const t = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);
  q.multiply(t);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(scale, scale, scale));
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z); // J (20193)
export const TAU = Math.PI * 2; // nl (20194)
export const palette = (...hex: string[]): THREE.Color[] => hex.map((h) => toColor(h)); // rl (20195)

/** Leaf canopy ramp: lighter up and out, with soft noise. */
export function canopyColor(colors: THREE.Color[], center: THREE.Vector3, radius: number, noise = 0.12, bias = 0): ColorFn { // il (20196)
  return (p, n, out) => {
    const h = (p.y - center.y) / (radius * 2);
    const dx = p.x - center.x;
    const dz = p.z - center.z;
    const d = Math.min(1, Math.sqrt(dx * dx + dz * dz) / radius);
    sampleRamp(colors, 0.42 + bias + n.y * 0.28 + h * 0.55 + d * 0.12 + noise3(p.x * 2.7, p.y * 2.7, p.z * 2.7) * noise, out);
  };
}

export interface BarkOptions {
  stripes?: number;
  furrows?: number;
}

/** Bark ramp with optional stripes (birch-like) or furrows, darker at the root. */
export function barkColor(colors: THREE.Color[], height: number, opts: BarkOptions = {}): ColorFn { // al (20205)
  return (p, n, out) => {
    let t = 0.25 + (p.y / height) * 0.5 + noise3(p.x * 7, p.y * 2.5, p.z * 7) * 0.18 + n.y * 0.12;
    if (opts.stripes) t += Math.sin(p.y * opts.stripes * TAU) > 0.82 ? 0.22 : 0;
    if (opts.furrows) t += noise3(Math.atan2(p.z, p.x) * opts.furrows, p.y * 1.5, 0) * 0.2;
    if (p.y < 0.12) t -= (0.12 - p.y) * 2;
    sampleRamp(colors, t, out);
  };
}

/** Ramp by height between y0 and y1, with optional noise. */
export function heightRamp(colors: THREE.Color[], y0: number, y1: number, noise = 0): ColorFn { // ol (20214)
  return (p, _n, out) =>
    sampleRamp(colors, (p.y - y0) / (y1 - y0) + (noise ? noise3(p.x * 20, p.y * 20, p.z * 20) * noise : 0), out);
}

/** Ramp by distance from center, plus a height bias. */
export function distanceRamp(colors: THREE.Color[], center: THREE.Vector3, dist: number, yBias = 0): ColorFn { // sl (20217)
  return (p, _n, out) => sampleRamp(colors, p.distanceTo(center) / dist + (p.y - center.y) * yBias, out);
}

/** Makes the normals face away from center in XZ (negates normals and flips the winding when needed). */
export function faceAwayFrom(geometry: THREE.BufferGeometry, center: THREE.Vector3): void { // cl (20220)
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  let facing = 0;
  for (let e = 0; e < position.count; e++)
    facing += normal.getX(e) * (position.getX(e) - center.x) + normal.getZ(e) * (position.getZ(e) - center.z);
  if (!(facing >= 0)) {
    for (let e = 0; e < normal.count; e++) normal.setXYZ(e, -normal.getX(e), -normal.getY(e), -normal.getZ(e));
    for (let e = 0; e < position.count; e += 3) {
      const x = position.getX(e + 1);
      const y = position.getY(e + 1);
      const z = position.getZ(e + 1);
      position.setXYZ(e + 1, position.getX(e + 2), position.getY(e + 2), position.getZ(e + 2));
      position.setXYZ(e + 2, x, y, z);
    }
  }
}

export interface Blob {
  c: THREE.Vector3;
  r: number;
  sy?: number;
}

export interface Spot {
  p: THREE.Vector3;
  n: THREE.Vector3;
}

/** Random points on the outer surface of a set of blobs (not inside another blob, spaced apart). */
export function scatterOnBlobs(b: PlantBuilder, blobs: Blob[], count: number, minY: number, inflate = 0): Spot[] { // ll (20235)
  const spots: Spot[] = [];
  let tries = 0;
  for (; spots.length < count && tries++ < count * 60; ) {
    const blob = blobs[Math.floor(b.random() * blobs.length)];
    const y = b.random() * 2 - 1;
    const a = b.random() * TAU;
    const ring = Math.sqrt(1 - y * y);
    const dir = v3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    if (dir.y < minY) continue;
    const p = blob.c.clone().add(v3(dir.x * blob.r, dir.y * blob.r * (blob.sy ?? 1), dir.z * blob.r).multiplyScalar(0.93 + inflate));
    let inside = false;
    for (const other of blobs)
      if (
        other !== blob &&
        v3((p.x - other.c.x) / other.r, (p.y - other.c.y) / (other.r * (other.sy ?? 1)), (p.z - other.c.z) / other.r).length() < 0.92
      )
        inside = true;
    if (!inside && !spots.some((s) => s.p.distanceTo(p) < 0.12 * (blobs[0].r > 0.4 ? 1 : 0.4))) spots.push({ p, n: dir });
  }
  return spots;
}

export interface AddBlobsOptions {
  scale?: number;
  detail?: number;
  lumps?: number;
  fine?: number;
  seed?: number;
  flex?: number;
}

/** Adds one lumpy blob per entry (leaf masses). */
export function addBlobs(b: PlantBuilder, blobs: Blob[], kind: number, color: ColorFn, opts: AddBlobsOptions = {}): void { // ul (20255)
  blobs.forEach((blob, index) => {
    const radius = blob.r * (opts.scale ?? 1);
    const detail = opts.detail ?? (radius < 0.3 ? 1 : 2);
    const geometry = blobGeometry(radius, {
      detail,
      lumps: opts.lumps ?? 0.14,
      fine: (opts.fine ?? 0.04) * (detail < 2 ? 0.5 : 1),
      seed: (opts.seed ?? 0) + index * 1.7,
      sy: blob.sy ?? 1,
    });
    b.add(geometry, trs(blob.c.x, blob.c.y, blob.c.z), { kind, color, anchor: blob.c, flex: opts.flex ?? 1, vertexPhase: true });
  });
}

/** Curved branch from p0 through p1 to p2 with child branches (depth) and twigs at the end. */
export function addBranch( // dl (20269)
  b: PlantBuilder,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  r0: number,
  r1: number,
  color: ColorFn,
  twigs = 2,
  twigLength = 0.35,
  depth = 1,
): void {
  const points = quadBezier(p0, p1, p2, 4);
  const radii = points.map((_p, t) => r0 + (r1 - r0) * (t / (points.length - 1)));
  b.add(tube(points, radii, 5), null, { kind: PART.WOOD, color, flat: true });
  const dir = p2.clone().sub(p1).normalize();
  const length = p0.distanceTo(p2);
  if (depth > 0 && length > 0.35)
    for (let t = 0; t < 2; t++) {
      const start = points[t === 0 ? 2 : 3];
      const jitter = v3(b.random() - 0.5, b.random() * 0.5 + 0.15, b.random() - 0.5).normalize();
      const childDir = dir.clone().multiplyScalar(0.55).add(jitter).normalize();
      const childLength = length * (0.38 + b.random() * 0.14);
      const end = start.clone().addScaledVector(childDir, childLength);
      const mid = start
        .clone()
        .lerp(end, 0.5)
        .add(v3(0, childLength * 0.12, 0));
      const radius = radii[t === 0 ? 2 : 3] * 0.62;
      addBranch(b, start, mid, end, radius, radius * 0.5, color, twigs, twigLength * 0.85, depth - 1);
    }
  for (let t = 0; t < twigs; t++) {
    const jitter = v3(b.random() - 0.5, b.random() * 0.6 + 0.2, b.random() - 0.5).normalize();
    const twigDir = dir.clone().multiplyScalar(0.6).add(jitter).normalize();
    const end = p2.clone().addScaledVector(twigDir, twigLength * (0.7 + b.random() * 0.6));
    const mid = p2
      .clone()
      .lerp(end, 0.5)
      .add(v3(0, 0.05, 0));
    b.add(tube(quadBezier(p2, mid, end, 2), [r1 * 0.9, r1 * 0.55, r1 * 0.25], 4), null, { kind: PART.WOOD, color, flat: true });
  }
}

/** Thin woody stems fanning out from the base of a shrub. */
export function addTwigs(b: PlantBuilder, count: number, height: number, spread: number, color: ColorFn, radius = 0.016): void { // vl (20796)
  for (let o = 0; o < count; o++) {
    const a = (o / count) * TAU + b.random();
    const r = spread * (0.5 + b.random() * 0.5);
    const tip = v3(Math.cos(a) * r, height * (0.75 + b.random() * 0.3), Math.sin(a) * r);
    b.add(
      tube(quadBezier(v3(0, -0.02, 0), v3(tip.x * 0.3, height * 0.6, tip.z * 0.3), tip, 3), [radius, radius * 0.8, radius * 0.55, radius * 0.3], 4),
      null,
      { kind: PART.WOOD, color, flat: true },
    );
  }
}

export interface LeafBladeOptions {
  segs?: number;
  jag?: number;
  fold?: number;
  kind?: number;
  phase?: number;
}

/** A basal leaf from the origin at angle a: length, half width, rise. */
export function addLeafBlade( // wl (21025)
  b: PlantBuilder,
  angle: number,
  length: number,
  width: number,
  rise: number,
  colors: THREE.Color[],
  opts: LeafBladeOptions = {},
): void {
  const dir = v3(Math.cos(angle), 0, Math.sin(angle));
  const points = quadBezier(
    dir.clone().multiplyScalar(0.005),
    dir
      .clone()
      .multiplyScalar(length * 0.4)
      .setY(length * rise),
    dir
      .clone()
      .multiplyScalar(length)
      .setY(length * rise * 0.55),
    opts.segs ?? 5,
  );
  const jag = opts.jag ?? 0;
  b.add(
    ribbon(points, (t) => width * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) ** 0.7 * (1 - jag + jag * Math.abs(Math.sin(t * 14))), {
      up: v3(0, 1, 0),
      fold: opts.fold ?? 0.3,
    }),
    null,
    {
      kind: opts.kind ?? PART.HERB,
      color: (p, _n, out) => sampleRamp(colors, 0.2 + (p.distanceTo(v3(0, 0, 0)) / length) * 0.8, out),
      anchor: v3(0, 0, 0),
      flex: (p) => clamp01(p.distanceTo(v3(0, 0, 0)) / length) * 0.6,
      doubleSide: true,
      phase: opts.phase,
    },
  );
}

/** Three-triangle grass blade over the points [base, mid, tip], with normals bent up by bend. */
export function bladeGeometry(points: THREE.Vector3[], width: number, bend = 0.9): THREE.BufferGeometry { // jl (21445)
  const [base, mid, tip] = points;
  const run = tip.clone().sub(base);
  const side = v3(-run.z, 0, run.x);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  const bl = base.clone().addScaledVector(side, -width);
  const br = base.clone().addScaledVector(side, width);
  const ml = mid.clone().addScaledVector(side, -width * 0.62);
  const mr = mid.clone().addScaledVector(side, width * 0.62);
  const positions: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  tri(bl, br, mr);
  tri(bl, mr, ml);
  tri(ml, mr, tip);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal');
  for (let e = 0; e < normal.count; e++) {
    const x = normal.getX(e);
    const y = normal.getY(e);
    const z = normal.getZ(e);
    const n = v3(x, y + bend * (Math.sign(y) || 1), z).normalize();
    normal.setXYZ(e, n.x, n.y, n.z);
  }
  return geometry;
}

/** Lily pad disc of radius r with a notch of half angle notch. */
export function lilyPadGeometry(radius: number, notch = 0.32, segments = 22): THREE.BufferGeometry { // Il (21687)
  const positions: number[] = [];
  v3(0, 0.008, 0); // bundle 21689: a discarded vector (no effect)
  const outer: THREE.Vector3[] = [];
  for (let r = 0; r <= segments; r++) {
    const a = notch + (r / segments) * (TAU - 2 * notch);
    const rr = radius * (1 + Math.sin(a * 5) * 0.02);
    outer.push(v3(Math.cos(a) * rr, 0.016, Math.sin(a) * rr));
  }
  const inner = outer.map((p) => v3(p.x * 0.6, 0.012, p.z * 0.6));
  const hub = v3(radius * 0.06, 0.01, 0);
  for (let e = 0; e < segments; e++) {
    positions.push(hub.x, hub.y, hub.z, inner[e + 1].x, inner[e + 1].y, inner[e + 1].z, inner[e].x, inner[e].y, inner[e].z);
    positions.push(inner[e].x, inner[e].y, inner[e].z, inner[e + 1].x, inner[e + 1].y, inner[e + 1].z, outer[e + 1].x, outer[e + 1].y, outer[e + 1].z);
    positions.push(inner[e].x, inner[e].y, inner[e].z, outer[e + 1].x, outer[e + 1].y, outer[e + 1].z, outer[e].x, outer[e].y, outer[e].z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Lily pad colour: radial ramp, light veins, brown rim. */
export function lilyPadColor(radius: number, cx = 0, cz = 0): ColorFn { // Ll (21705)
  const colors = palette(`#3f7a35`, `#5a9443`, `#7fb35a`, `#9cc86a`);
  return (p, _n, out) => {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz) / radius;
    const a = Math.atan2(dz, dx);
    sampleRamp(colors, 0.9 - d * 0.7 + noise3(dx * 20, dz * 20, 3) * 0.12, out);
    if (Math.abs(Math.sin(a * 5)) < 0.12 && d > 0.2) out.multiplyScalar(1.12);
    if (d > 0.92) out.lerp(toColor(`#8a6a3a`), 0.35);
  };
}
