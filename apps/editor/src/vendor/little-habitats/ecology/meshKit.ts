// Ports index-BwioI7A7.js 22794-23040: the vertex-colour geometry builder (Y MeshKit) used by ecology
// features, landmarks and wonders, with roundedBox (Nu), shadeColor (X) and extrudePolygon (Pu).
import * as THREE from 'three';

/** A flat list of vertex positions or normals: x0, y0, z0, x1, y1, z1, ... */
export type FloatList = ArrayLike<number>;

/** Anything with x, y, z (a THREE.Vector3 or a plain object). */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** Options that the MeshKit methods read. Each method reads only some of them. */
export interface MeshKitOptions {
  /** Darkening from top to bottom of the part (addRaw). Default 0.25 (0.2 for blob). */
  grad?: number;
  /** Random brightness change of the part, +-jitter (addRaw). Default 0.06. */
  jitter?: number;
  /** Darken vertices near the ground (world y below about 0.22). Default true. */
  ao?: boolean;
  /** Keep the source normals instead of flat face normals (only when normals are given). */
  smooth?: boolean;
  /** Writes this point into the aCenter attribute of every vertex of the part. */
  center?: readonly number[];
  /** blob: use the blob position as the aCenter point. */
  pivot?: boolean;
  /** Euler XYZ rotation of the part (matrix). */
  rot?: readonly number[];
  /** Scale of the part (matrix; blob multiplies it by its radius). */
  scale?: readonly number[];
  /** Corner bevel of box and beam. */
  bevel?: number;
  /** cyl: open ended. */
  open?: boolean;
  /** blob: icosahedron detail. Default 1. */
  detail?: number;
  /** beam: the up direction of the cross-section. Default (0, 1, 0). */
  up?: { x?: number; y?: number; z?: number };
  /** beam: extra length at each end. */
  extend?: number;
}

const _m4 = new THREE.Matrix4(); // yu (22794)
const _quat = new THREE.Quaternion(); // bu (22795)
const _euler = new THREE.Euler(); // xu (22796)
const _scale = new THREE.Vector3(); // Su (22797)
const _offset = new THREE.Vector3(); // Cu (22798)
const _p = new THREE.Vector3(); // wu (22799)
const _n = new THREE.Vector3(); // Tu (22800)
const _a = new THREE.Vector3(); // Eu (22801)
const _b = new THREE.Vector3(); // Du (22802)
const _c = new THREE.Vector3(); // Ou (22803)
const _nm = new THREE.Matrix3(); // ku (22804)
const _col = new THREE.Color(); // Au (22805)

interface CachedShape {
  pos: FloatList;
  nor: FloatList;
}

const shapeCache = new Map<string, CachedShape>(); // ju (22806)

/** Non-indexed positions and normals of a three.js geometry, built once per key. */
function cachedShape(key: string, make: () => THREE.BufferGeometry): CachedShape { // Mu (22807)
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

/**
 * Triangle positions of a box of size w x h x d centred on the origin, with chamfered (bevelled) edges and corners.
 * Every face winds outwards.
 */
export function roundedBox(w: number, h: number, d: number, bevel: number): Float32Array { // Nu (22818)
  const half = [w / 2, h / 2, d / 2];
  const b = Math.max(0, Math.min(bevel, half[0] * 0.45, half[1] * 0.45, half[2] * 0.45));
  const out: number[] = [];
  const face = (pts: number[][]): void => {
    const c = [0, 0, 0];
    for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
    const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
    const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) pts = [...pts].reverse();
    for (let k = 1; k < pts.length - 1; k++) out.push(...pts[0], ...pts[k], ...pts[k + 1]);
  };
  const vert = (
    a0: number, s0: number, e0: number,
    a1: number, s1: number, e1: number,
    a2: number, s2: number, e2: number,
  ): number[] => {
    const p = [0, 0, 0];
    p[a0] = s0 * e0;
    p[a1] = s1 * e1;
    p[a2] = s2 * e2;
    return p;
  };
  for (let ax = 0; ax < 3; ax++) {
    const a1 = (ax + 1) % 3;
    const a2 = (ax + 2) % 3;
    for (const s of [-1, 1])
      face([
        vert(ax, s, half[ax], a1, -1, half[a1] - b, a2, -1, half[a2] - b),
        vert(ax, s, half[ax], a1, 1, half[a1] - b, a2, -1, half[a2] - b),
        vert(ax, s, half[ax], a1, 1, half[a1] - b, a2, 1, half[a2] - b),
        vert(ax, s, half[ax], a1, -1, half[a1] - b, a2, 1, half[a2] - b),
      ]);
    if (!(b <= 0))
      for (const s of [-1, 1])
        for (const t of [-1, 1])
          face([
            vert(ax, s, half[ax], a1, t, half[a1] - b, a2, -1, half[a2] - b),
            vert(ax, s, half[ax], a1, t, half[a1] - b, a2, 1, half[a2] - b),
            vert(ax, s, half[ax] - b, a1, t, half[a1], a2, 1, half[a2] - b),
            vert(ax, s, half[ax] - b, a1, t, half[a1], a2, -1, half[a2] - b),
          ]);
  }
  if (b > 0)
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1])
          face([
            [sx * half[0], sy * (half[1] - b), sz * (half[2] - b)],
            [sx * (half[0] - b), sy * half[1], sz * (half[2] - b)],
            [sx * (half[0] - b), sy * (half[1] - b), sz * half[2]],
          ]);
  return new Float32Array(out);
}

/**
 * Collects coloured, transformed triangles into one non-indexed BufferGeometry with position, normal, color
 * (and aCenter when a part asked for it). Each added part takes one rng value for its brightness jitter.
 */
export class MeshKit { // Y (22866)
  rng: { next(): number };
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  cen: number[] = [];
  hasCenter = false;

  constructor(rng: { next(): number }) {
    this.rng = rng;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Adds triangles (positions, optional normals) transformed by `matrix`, tinted by `color`. */
  addRaw(
    positions: FloatList,
    normals: FloatList | null,
    matrix: THREE.Matrix4,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): void {
    let minY = 1 / 0;
    let maxY = -1 / 0;
    for (let k = 1; k < positions.length; k += 3) {
      if (positions[k] < minY) minY = positions[k];
      if (positions[k] > maxY) maxY = positions[k];
    }
    const span = Math.max(1e-5, maxY - minY);
    const grad = opts.grad ?? 0.25;
    const jitter = 1 + (this.rng.next() - 0.5) * 2 * (opts.jitter ?? 0.06);
    const ao = opts.ao ?? true;
    _col.set(color);
    const r = _col.r * jitter;
    const g = _col.g * jitter;
    const b = _col.b * jitter;
    _nm.getNormalMatrix(matrix);
    const smooth = !!opts.smooth && !!normals;
    const start = this.pos.length;
    const center = opts.center;
    if (center) this.hasCenter = true;
    for (let k = 0; k < positions.length; k += 3) {
      _p.set(positions[k], positions[k + 1], positions[k + 2]).applyMatrix4(matrix);
      this.pos.push(_p.x, _p.y, _p.z);
      if (center) this.cen.push(center[0], center[1], center[2]);
      else this.cen.push(_p.x, _p.y, _p.z);
      let shade = 1 - grad * (1 - (positions[k + 1] - minY) / span);
      if (ao) {
        const t = Math.max(0, Math.min(1, (_p.y + 0.02) / 0.24));
        shade *= 0.74 + 0.26 * t * t * (3 - 2 * t);
      }
      this.col.push(r * shade, g * shade, b * shade);
      if (smooth) {
        const nl = normals as FloatList;
        _n.set(nl[k], nl[k + 1], nl[k + 2]).applyMatrix3(_nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      }
    }
    if (!smooth) {
      const p = this.pos;
      for (let k = start; k < p.length; k += 9) {
        _a.set(p[k], p[k + 1], p[k + 2]);
        _b.set(p[k + 3], p[k + 4], p[k + 5]);
        _c.set(p[k + 6], p[k + 7], p[k + 8]);
        _b.sub(_a);
        _c.sub(_a);
        _n.crossVectors(_b, _c).normalize();
        for (let v = 0; v < 3; v++) this.nor.push(_n.x, _n.y, _n.z);
      }
    }
  }

  /** The shared part matrix: translate (x, y, z), rotate opts.rot (Euler XYZ), scale opts.scale. */
  matrix(x: number, y: number, z: number, opts: MeshKitOptions): THREE.Matrix4 {
    const rot = opts.rot ?? [0, 0, 0];
    _euler.set(rot[0], rot[1], rot[2]);
    _quat.setFromEuler(_euler);
    const s = opts.scale ?? [1, 1, 1];
    _scale.set(s[0], s[1], s[2]);
    _offset.set(x, y, z);
    return _m4.compose(_offset, _quat, _scale);
  }

  /** Bevelled box of size w x h x d centred on (x, y, z). */
  box(
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    const tris = roundedBox(w, h, d, opts.bevel ?? Math.min(w, h, d) * 0.18);
    this.addRaw(tris, null, this.matrix(x, y, z, opts), color, opts);
    return this;
  }

  /** Cylinder standing on (x, y, z) (its base, not its centre). */
  cyl(
    radiusTop: number, radiusBottom: number, height: number, segments: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    const shape = cachedShape(`cyl:${radiusTop}:${radiusBottom}:${height}:${segments}:${+!!opts.open}`, () =>
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, !!opts.open).translate(0, height / 2, 0),
    );
    this.addRaw(shape.pos, shape.nor, this.matrix(x, y, z, opts), color, opts);
    return this;
  }

  /** Cone standing on (x, y, z). */
  cone(
    radius: number, height: number, segments: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    const shape = cachedShape(`cone:${radius}:${height}:${segments}`, () =>
      new THREE.ConeGeometry(radius, height, segments).translate(0, height / 2, 0),
    );
    this.addRaw(shape.pos, shape.nor, this.matrix(x, y, z, opts), color, opts);
    return this;
  }

  /** Icosahedron of the given radius centred on (x, y, z). opts.scale stretches it; opts.pivot sets aCenter. */
  blob(
    radius: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    if (opts.pivot) opts = { ...opts, center: [x, y, z] };
    const detail = opts.detail ?? 1;
    const shape = cachedShape(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    const s = opts.scale ?? [1, 1, 1];
    this.addRaw(
      shape.pos,
      shape.nor,
      this.matrix(x, y, z, { ...opts, scale: [s[0] * radius, s[1] * radius, s[2] * radius] }),
      color,
      { grad: 0.2, ...opts },
    );
    return this;
  }

  /** Torus lying flat (axis = y) centred on (x, y, z). */
  ring(
    radius: number, tube: number, radialSegments: number, tubularSegments: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    const shape = cachedShape(`torus:${radius}:${tube}:${radialSegments}:${tubularSegments}`, () =>
      new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments).rotateX(Math.PI / 2),
    );
    this.addRaw(shape.pos, shape.nor, this.matrix(x, y, z, opts), color, opts);
    return this;
  }

  /** Lathe of [radius, y] points around the y axis, placed at (x, y, z). */
  lathe(
    points: readonly (readonly number[])[], segments: number,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    const shape = cachedShape(
      `lathe:${segments}:${points.map((p) => p.join(`,`)).join(`;`)}`,
      () =>
        new THREE.LatheGeometry(
          points.map(([px, py]) => new THREE.Vector2(px, py)),
          segments,
        ),
    );
    this.addRaw(shape.pos, shape.nor, this.matrix(x, y, z, opts), color, opts);
    return this;
  }

  /** Raw triangle positions (flat normals), placed at (x, y, z). */
  tris(
    positions: FloatList,
    x: number, y: number, z: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    this.addRaw(positions, null, this.matrix(x, y, z, opts), color, opts);
    return this;
  }

  /**
   * Bevelled bar from `a` to `b`. `width` is the size across (perpendicular to the up direction), `height` the size
   * along opts.up.
   */
  beam(
    a: XYZ, b: XYZ,
    width: number, height: number,
    color: THREE.ColorRepresentation,
    opts: MeshKitOptions = {},
  ): this {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return this;
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    const up = new THREE.Vector3(opts.up?.x ?? 0, opts.up?.y ?? 1, opts.up?.z ?? 0);
    if (Math.abs(up.dot(dir)) > 0.98) up.set(1, 0, 0);
    const side = up.sub(dir.clone().multiplyScalar(up.dot(dir))).normalize();
    const third = new THREE.Vector3().crossVectors(dir, side);
    const tris = roundedBox(len + (opts.extend ?? 0) * 2, height, width, opts.bevel ?? Math.min(height, width) * 0.2);
    const m = new THREE.Matrix4().makeBasis(dir, side, third);
    m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.addRaw(tris, null, m, color, opts);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute(`position`, new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute(`normal`, new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute(`color`, new THREE.Float32BufferAttribute(this.col, 3));
    if (this.hasCenter) g.setAttribute(`aCenter`, new THREE.Float32BufferAttribute(this.cen, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Copy of `color` with lightness moved by dl, hue by dh and saturation by ds (HSL, clamped). */
export function shadeColor(color: THREE.ColorRepresentation, dl: number, dh = 0, ds = 0): THREE.Color { // X (23002)
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + dh + 1) % 1, Math.min(1, Math.max(0, hsl.s + ds)), Math.min(1, Math.max(0, hsl.l + dl)));
  return c;
}

/**
 * Triangle positions of a 2D polygon ([x, y] points in the XY plane) extruded `depth` along z, centred on z = 0.
 * Caps and sides wind outwards from the polygon centroid.
 */
export function extrudePolygon(poly: readonly (readonly number[])[], depth: number): number[] { // Pu (23011)
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  for (const [px, py] of poly) {
    cx += px / poly.length;
    cy += py / poly.length;
  }
  const face = (pts: number[][]): void => {
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (const p of pts) {
      fx += p[0] / pts.length;
      fy += p[1] / pts.length;
      fz += p[2] / pts.length;
    }
    const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
    const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * (fx - cx) + n[1] * (fy - cy) + n[2] * fz < 0) pts = [...pts].reverse();
    for (let k = 1; k < pts.length - 1; k++) out.push(...pts[0], ...pts[k], ...pts[k + 1]);
  };
  const hz = depth / 2;
  face(poly.map(([px, py]) => [px, py, hz]));
  face(poly.map(([px, py]) => [px, py, -hz]));
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k];
    const [x1, y1] = poly[(k + 1) % poly.length];
    face([
      [x0, y0, -hz],
      [x1, y1, -hz],
      [x1, y1, hz],
      [x0, y0, hz],
    ]);
  }
  return out;
}
