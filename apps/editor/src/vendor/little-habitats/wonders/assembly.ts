// Ports index-BwioI7A7.js 36606-36773: the merge buffer (pv), the festival assembly that merges every placed
// prefab into one mesh per layer (mv..yv scratch objects, bv), the prefab cache (xv, Sv) and the glow pools (Cv).
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MeshKit } from '../ecology/meshKit';
import type { InstanceGeometries } from './instances';
import type { Point3 } from './types';

/** Collects transformed triangles with a per-vertex pivot (aPivot) for the pop-in and sway shaders. */
export class MergeBuffer { // pv (36606)
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  piv: number[] = [];

  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, normalMatrix: THREE.Matrix3 | null, pivot: Point3): void {
    const i = geometry.attributes.position.array;
    const a = (geometry.attributes.normal as THREE.BufferAttribute | undefined)?.array;
    const o = (geometry.attributes.color as THREE.BufferAttribute | undefined)?.array;
    const s = matrix?.elements;
    const c = normalMatrix?.elements;
    for (let e = 0; e < i.length; e += 3) {
      const t = i[e];
      const n = i[e + 1];
      const l = i[e + 2];
      if (s)
        this.pos.push(
          s[0] * t + s[4] * n + s[8] * l + s[12],
          s[1] * t + s[5] * n + s[9] * l + s[13],
          s[2] * t + s[6] * n + s[10] * l + s[14],
        );
      else this.pos.push(t, n, l);
      if (a) {
        const nx = a[e];
        const ny = a[e + 1];
        const nz = a[e + 2];
        if (c) {
          let x = c[0] * nx + c[3] * ny + c[6] * nz;
          let y = c[1] * nx + c[4] * ny + c[7] * nz;
          let z = c[2] * nx + c[5] * ny + c[8] * nz;
          const len = Math.hypot(x, y, z) || 1;
          x /= len;
          y /= len;
          z /= len;
          this.nor.push(x, y, z);
        } else this.nor.push(nx, ny, nz);
      } else this.nor.push(0, 1, 0);
      if (o) this.col.push(o[e], o[e + 1], o[e + 2]);
      else this.col.push(1, 1, 1);
      this.piv.push(pivot.x, pivot.y, pivot.z);
    }
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const e = new THREE.BufferGeometry();
    e.setAttribute(`position`, new THREE.Float32BufferAttribute(this.pos, 3));
    e.setAttribute(`normal`, new THREE.Float32BufferAttribute(this.nor, 3));
    e.setAttribute(`color`, new THREE.Float32BufferAttribute(this.col, 3));
    e.setAttribute(`aPivot`, new THREE.Float32BufferAttribute(this.piv, 3));
    e.computeBoundingSphere();
    if (e.boundingSphere) e.boundingSphere.radius += 1.5;
    return e;
  }
}

const tmpMatrix = new THREE.Matrix4(); // mv (36659)
const tmpNormalMatrix = new THREE.Matrix3(); // hv (36660)
const tmpQuat = new THREE.Quaternion(); // gv (36661)
const tmpEuler = new THREE.Euler(0, 0, 0, `YXZ`); // _v (36662)
const tmpScale = new THREE.Vector3(); // vv (36663)
const tmpPos = new THREE.Vector3(); // yv (36664)

/** The five merged layers of a festival, in build order. */
export type LayerName = 'base' | 'sway' | 'flag' | 'glow' | 'glowSway';

export interface PlaceOptions {
  scale?: number | [number, number, number];
  pitch?: number;
  roll?: number;
  /** Pivot for pop-in and sway; default the placed position. */
  pivot?: Point3;
  /** Put base into the sway layer and glow into glowSway. */
  sway?: boolean;
}

export class Assembly { // bv (36665)
  origin: THREE.Vector3;
  m: Record<LayerName, MergeBuffer> = {
    base: new MergeBuffer(),
    sway: new MergeBuffer(),
    flag: new MergeBuffer(),
    glow: new MergeBuffer(),
    glowSway: new MergeBuffer(),
  };
  maxReach = 0;

  constructor(origin: THREE.Vector3) {
    this.origin = origin;
  }

  reach(p: Point3): void {
    const t = Math.hypot(p.x - this.origin.x, p.z - this.origin.z);
    if (t > this.maxReach) this.maxReach = t;
  }

  place(prefab: InstanceGeometries, x: number, y: number, z: number, yaw = 0, opts: PlaceOptions = {}): void {
    const o = opts.scale ?? 1;
    if (typeof o == `number`) tmpScale.set(o, o, o);
    else tmpScale.set(o[0], o[1], o[2]);
    tmpEuler.set(opts.pitch ?? 0, yaw, opts.roll ?? 0, `YXZ`);
    tmpQuat.setFromEuler(tmpEuler);
    tmpPos.set(x, y, z);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    tmpNormalMatrix.getNormalMatrix(tmpMatrix);
    const s = opts.pivot ?? tmpPos;
    this.reach(s);
    if (prefab.base) this.m[opts.sway ? `sway` : `base`].add(prefab.base, tmpMatrix, tmpNormalMatrix, s);
    if (prefab.flag) this.m.flag.add(prefab.flag, tmpMatrix, tmpNormalMatrix, s);
    if (prefab.glow) this.m[opts.sway ? `glowSway` : `glow`].add(prefab.glow, tmpMatrix, tmpNormalMatrix, s);
  }

  /** Builds geometry in world space with a fresh MeshKit and merges it into one layer. */
  world(layer: LayerName, pivot: Point3, draw: (kit: MeshKit) => void, seed = 1): void {
    const i = new MeshKit(new Rng(seed));
    draw(i);
    if (!i.vertexCount) return;
    const a = i.build();
    this.reach(pivot);
    this.m[layer].add(a, null, null, pivot);
    a.dispose();
  }

  build(mats: Record<LayerName, THREE.Material>): THREE.Mesh[] {
    const t: THREE.Mesh[] = [];
    for (const n of Object.keys(this.m) as LayerName[]) {
      const r = this.m[n].build();
      if (!r) continue;
      const i = new THREE.Mesh(r, mats[n]);
      i.name = `wonder-${n}`;
      i.castShadow = false;
      i.receiveShadow = n !== `glow` && n !== `glowSway`;
      i.userData.shadow = n === `base` || n === `sway` || n === `flag`;
      t.push(i);
    }
    return t;
  }
}

/** The kits a prefab builder draws into. All three share one Rng seeded from the cache key. */
export interface PrefabKits {
  base: MeshKit;
  flag: MeshKit;
  glow: MeshKit;
  rng: Rng;
}

const prefabCache = new Map<string, InstanceGeometries>(); // xv (36711)

/** Builds a prefab once per key and caches its geometries. */
export function cachedPrefab(key: string, draw: (kits: PrefabKits) => void): InstanceGeometries { // Sv (36712)
  let n = prefabCache.get(key);
  if (n) return n;
  let r = 2166136261;
  for (let t = 0; t < key.length; t++) r = Math.imul(r ^ key.charCodeAt(t), 16777619);
  const i = new Rng(r >>> 0);
  const a: PrefabKits = { base: new MeshKit(i), flag: new MeshKit(i), glow: new MeshKit(i), rng: i };
  draw(a);
  n = {};
  if (a.base.vertexCount) n.base = a.base.build();
  if (a.flag.vertexCount) n.flag = a.flag.build();
  if (a.glow.vertexCount) n.glow = a.glow.build();
  prefabCache.set(key, n);
  return n;
}

/** Soft additive light pools on the ground under lanterns and candles. */
export class GlowPools { // Cv (36729)
  pos: number[] = [];
  col: number[] = [];

  add(x: number, y: number, z: number, radius: number, color: THREE.ColorRepresentation, intensity = 1): void {
    const o = new THREE.Color(color).multiplyScalar(intensity);
    const s = [0, 0.35, 0.7, 1];
    const c = [1, 0.55, 0.18, 0];
    for (let i = 0; i < s.length - 1; i++)
      for (let a = 0; a < 20; a++) {
        const l = (a / 20) * Math.PI * 2;
        const u = ((a + 1) / 20) * Math.PI * 2;
        const d = [
          [s[i], l, c[i]],
          [s[i + 1], l, c[i + 1]],
          [s[i + 1], u, c[i + 1]],
          [s[i], u, c[i]],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [rr, ang, f] = d[k];
          this.pos.push(x + Math.cos(ang) * rr * radius, y + 0.035, z + Math.sin(ang) * rr * radius);
          this.col.push(o.r * f, o.g * f, o.b * f);
        }
      }
  }

  build(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null {
    if (!this.pos.length) return null;
    const e = new THREE.BufferGeometry();
    e.setAttribute(`position`, new THREE.Float32BufferAttribute(this.pos, 3));
    e.setAttribute(`color`, new THREE.Float32BufferAttribute(this.col, 3));
    e.computeBoundingSphere();
    const t = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    const n = new THREE.Mesh(e, t);
    n.name = `wonder-pools`;
    n.renderOrder = 2;
    n.frustumCulled = false;
    return n;
  }
}
