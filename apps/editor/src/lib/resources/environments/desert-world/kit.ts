// Geometry helpers of the desert world (built from the world kit) and the batch
// that merges every static piece into a few meshes (one per material).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise1337 as X, noise7 as Y } from "./noise";

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Strata palettes (index = the `strata` attribute's x). Each palette is three colors. */
export const STRATA_PALETTES: [string, string, string][] = [
  ["#e7a07f", "#c97b63", "#f1c9a0"],
  ["#e6b86f", "#c98f52", "#f2d7a2"],
  ["#bea6cf", "#9c86b7", "#dccbe0"],
  ["#ec9b6b", "#d27a58", "#f6d2b0"],
  ["#b7a0bb", "#a995b0", "#d3bfd4"], // violet cliffs
  ["#d9a477", "#c98f5f", "#e9c49a"], // the giant head
  ["#eef0ea", "#cfd9e6", "#b9c8dc"] // pale towers
];

/** A tube along a Catmull-Rom curve, radius r0 to r1, with end caps. */
export function taperTube(points: THREE.Vector3[], r0: number, r1: number, segs = 14, sides = 7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(r0, r1, t);
    const nn = frames.normals[i];
    const bn = frames.binormals[i];
    for (let j = 0; j <= sides; j++) {
      const a = ((j % sides) / sides) * Math.PI * 2;
      pos.push(
        p.x + (Math.cos(a) * nn.x + Math.sin(a) * bn.x) * r,
        p.y + (Math.cos(a) * nn.y + Math.sin(a) * bn.y) * r,
        p.z + (Math.cos(a) * nn.z + Math.sin(a) * bn.z) * r
      );
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  for (const [ring, r, dir] of [
    [0, r0, -1],
    [segs, r1, 1]
  ] as const) {
    const tip = curve.getPointAt(ring / segs).addScaledVector(frames.tangents[ring], dir * r * 0.5);
    const centre = pos.length / 3;
    const base = ring * (sides + 1);
    pos.push(tip.x, tip.y, tip.z);
    for (let j = 0; j < sides; j++) idx.push(...(dir > 0 ? [centre, base + j, base + j + 1] : [centre, base + j + 1, base + j]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flattened (super-elliptic) tube along a curve: half-width w along `up`, half-depth d across. No caps. */
export function flatTube(curve: THREE.Curve<THREE.Vector3>, w: number, d: number, segs: number, up: THREE.Vector3, sides = 8): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const tan = V3();
  const side = V3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tan);
    side.crossVectors(tan, up).normalize();
    for (let j = 0; j <= sides; j++) {
      const a = ((j % sides) / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const cc = Math.sign(c) * Math.abs(c) ** 0.6;
      const ss = Math.sign(s) * Math.abs(s) ** 0.6;
      pos.push(p.x + up.x * w * cc + side.x * d * ss, p.y + up.y * w * cc + side.y * d * ss, p.z + up.z * w * cc + side.z * d * ss);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** An elliptic tube along a Catmull-Rom of the points, with flat end caps. */
export function ellipseTube(points: THREE.Vector3[], w: (t: number) => number, d: (t: number) => number, segs = 24, sides = 12): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos: number[] = [];
  const idx: number[] = [];
  const tan = V3();
  const side = V3();
  const up2 = V3();
  const up = V3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tan);
    side.crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    up2.crossVectors(side, tan).normalize();
    const pw = w(t);
    const pd = d(t);
    for (let j = 0; j <= sides; j++) {
      const a = ((j % sides) / sides) * Math.PI * 2;
      pos.push(
        p.x + side.x * Math.cos(a) * pw + up2.x * Math.sin(a) * pd,
        p.y + side.y * Math.cos(a) * pw + up2.y * Math.sin(a) * pd,
        p.z + side.z * Math.cos(a) * pw + up2.z * Math.sin(a) * pd
      );
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  for (const [ring, dir] of [
    [0, -1],
    [segs, 1]
  ] as const) {
    const p = curve.getPointAt(ring / segs);
    const centre = pos.length / 3;
    const base = ring * (sides + 1);
    pos.push(p.x, p.y, p.z);
    for (let j = 0; j < sides; j++) idx.push(...(dir > 0 ? [centre, base + j + 1, base + j] : [centre, base + j, base + j + 1]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Wobble a geometry radially (non-indexed, normals recomputed: faceted). */
export function wobble(geo: THREE.BufferGeometry, amount: number, freq = 0.3, seed = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = Math.sin(x * freq + seed) * Math.cos(z * freq * 1.3 - seed) + 0.5 * Math.sin((x + y + z) * freq * 2.1 + seed * 2);
    const l = Math.hypot(x, z) || 1;
    const dy = k * amount * 0.25;
    p.setXYZ(i, x + (x / l) * k * amount, y + (Math.abs(y) < 0.01 ? -Math.abs(dy) : dy), z + (z / l) * k * amount);
  }
  g.computeVertexNormals();
  return g;
}

/** Radial noise warp around the y axis, plus a vertical jitter. */
export function warp(geo: THREE.BufferGeometry, amount: number, freq: number, seed = 0, lift = 0): THREE.BufferGeometry {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (Math.hypot(x, z) < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 + amount * Y(Math.cos(a) * 1.7 + seed + y * freq, Math.sin(a) * 1.7 - seed + y * freq * 0.7);
    const dy = lift * X(x * 0.1 + seed, z * 0.1);
    p.setXYZ(i, x * k, y + (Math.abs(y) < 0.01 ? -Math.abs(dy) : dy), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Bulge the middle of a geometry outward. */
export function bulge(geo: THREE.BufferGeometry, amount = 0.08): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / Math.max(max.y - min.y, 1e-6);
    const k = 1 + amount * Math.sin(Math.PI * Math.min(t * 1.15, 1));
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Step a centred cylinder into `steps` terraces, each `shrink` narrower. */
export function terraces(geo: THREE.BufferGeometry, height: number, steps: number, shrink: number): THREE.BufferGeometry {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 - shrink * (Math.floor(((y + height / 2) / height) * steps * 0.999) / steps);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  return geo;
}

/** A LatheGeometry of [r, y] pairs (r at least 0.001). */
export const lathe = (profile: readonly (readonly [number, number])[], segs = 24, phiStart = 0, phiLength = Math.PI * 2) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)),
    segs,
    phiStart,
    phiLength
  );

export type PieceStyle = {
  /** Smooth normals (bones, domes). Default: faceted. */
  smooth?: boolean;
  /** Strata bands: palette index and band size in meters. */
  strata?: [number, number];
};

const tmpColor = new THREE.Color();

/**
 * Collects static pieces in world coordinates. Each piece becomes non-indexed geometry with
 * position, normal, color and strata (palette, size; palette -1 = plain color). flush() merges
 * each layer into one geometry, moved by -origin.
 */
export class Batch {
  readonly layers = new Map<string, THREE.BufferGeometry[]>();
  triangles = 0;

  add(layer: string, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, style: PieceStyle = {}) {
    let g = geo;
    if (style.smooth) {
      if (!g.attributes.normal) g.computeVertexNormals();
      g = g.index ? g.toNonIndexed() : g;
    } else {
      g = g.index ? g.toNonIndexed() : g;
      g.deleteAttribute("normal");
      g.computeVertexNormals();
    }
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
    const count = g.attributes.position.count;
    if (!g.attributes.color || color !== null) {
      tmpColor.set(color ?? "#ffffff");
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = tmpColor.r;
        arr[i * 3 + 1] = tmpColor.g;
        arr[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    }
    const strata = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      strata[i * 2] = style.strata ? style.strata[0] : -1;
      strata[i * 2 + 1] = style.strata ? style.strata[1] : 1;
    }
    g.setAttribute("strata", new THREE.BufferAttribute(strata, 2));
    if (!this.layers.has(layer)) this.layers.set(layer, []);
    this.layers.get(layer)!.push(g);
    this.triangles += count / 3;
    return this;
  }

  /** Add a mesh (its world matrix applied). */
  addMesh(layer: string, mesh: THREE.Mesh, color: THREE.ColorRepresentation | null, style: PieceStyle = {}) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    return this.add(layer, g, color, style);
  }

  flush(layer: string, origin: THREE.Vector3): THREE.BufferGeometry | null {
    const list = this.layers.get(layer);
    if (!list?.length) return null;
    const g = mergeGeometries(list)!;
    g.translate(-origin.x, -origin.y, -origin.z);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A flat color painted on a geometry (for multi-color parts merged before they go to a batch). */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  tmpColor.set(color);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = tmpColor.r;
    arr[i * 3 + 1] = tmpColor.g;
    arr[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

export function mergePainted(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts)!;
}
