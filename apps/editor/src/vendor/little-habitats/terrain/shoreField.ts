// Island kit terrain: signed distance to the level-1 coastline, baked into a texture (bundle 18608-18776).
//
// Texture channels: r = coarse signed distance ((d + 1) / 9), g = fine signed distance ((d + 0.5) / 2),
// b = 255 for enclosed water (ponds not connected to the open lake). Distance is negative on land.
import * as THREE from 'three';
import type { Grid } from '../core/grid';
import type { World } from '../core/world';
import { ISO, smooth01, blendField, blendFieldGradient, type FieldGradient } from './surface';

/** Texels nearer than this to the analytic coastline seed the distance transform. */
const SEED_MAX_DIST = 0.45; // dc (18608)

export class ShoreField { // fc (18609)
  grid: Grid;
  world: World;
  size: number;
  min: number;
  span: number;
  texel: number;
  texture: THREE.DataTexture;
  /** (min x, min z, 1 / span, 1 / span): world xz -> texture uv. */
  xf: THREE.Vector4;
  data: Uint8Array;
  seed: Float32Array;
  inside: Uint8Array;
  dist: Float32Array;
  signed: Float32Array;
  pond: Uint8Array;
  uv = { u: 0, v: 0 };
  grad: FieldGradient = { fu: 0, fv: 0 };

  constructor(grid: Grid, world: World, size = 192) {
    this.grid = grid;
    this.world = world;
    this.size = size;
    const half = grid.radius + 2.5;
    this.min = -half;
    this.span = half * 2;
    this.texel = this.span / size;
    const count = size * size;
    this.data = new Uint8Array(count * 4);
    this.seed = new Float32Array(count);
    this.inside = new Uint8Array(count);
    this.dist = new Float32Array(count);
    this.signed = new Float32Array(count);
    this.pond = new Uint8Array(count);
    this.texture = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.generateMipmaps = false;
    this.xf = new THREE.Vector4(this.min, this.min, 1 / this.span, 1 / this.span);
    this.sampleRegion(-Infinity, -Infinity, Infinity, Infinity);
    this.propagate();
  }

  /** Bilinear signed distance at world (x, z); 8 outside the texture. */
  distanceAt(x: number, z: number): number {
    const fx = (x - this.min) / this.texel - 0.5,
      fz = (z - this.min) / this.texel - 0.5,
      n = this.size;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return 8;
    const c0 = Math.floor(fx),
      r0 = Math.floor(fz),
      tx = fx - c0,
      tz = fz - r0,
      c1 = Math.min(n - 1, c0 + 1),
      r1 = Math.min(n - 1, r0 + 1),
      d = this.signed;
    return (d[r0 * n + c0] * (1 - tx) + d[r0 * n + c1] * tx) * (1 - tz) + (d[r1 * n + c0] * (1 - tx) + d[r1 * n + c1] * tx) * tz;
  }

  /** Re-samples inside flags and coastline seeds for texels in the world rectangle (plus one texel). */
  sampleRegion(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const n = this.size,
      c0 = Math.max(0, Math.floor((minX - this.min) / this.texel - 1)),
      c1 = Math.min(n - 1, Math.ceil((maxX - this.min) / this.texel + 1)),
      r0 = Math.max(0, Math.floor((minZ - this.min) / this.texel - 1)),
      r1 = Math.min(n - 1, Math.ceil((maxZ - this.min) / this.texel + 1)),
      grid = this.grid,
      wc = this.world.corners;
    for (let row = r0; row <= r1; row++) {
      const z = this.min + (row + 0.5) * this.texel;
      for (let col = c0; col <= c1; col++) {
        const x = this.min + (col + 0.5) * this.texel,
          k = row * n + col,
          cell = grid.cellAt(x, z);
        if (cell < 0) {
          this.inside[k] = 0;
          this.seed[k] = -1;
          continue;
        }
        const ids = grid.cells[cell].corners,
          a = +(wc[ids[0]].height >= 1),
          b = +(wc[ids[1]].height >= 1),
          c = +(wc[ids[2]].height >= 1),
          d = +(wc[ids[3]].height >= 1),
          count = a + b + c + d;
        if (count === 0 || count === 4) {
          this.inside[k] = +(count === 4);
          this.seed[k] = -1;
          continue;
        }
        grid.cellUV(cell, x, z, this.uv);
        const u = Math.min(1, Math.max(0, this.uv.u)),
          v = Math.min(1, Math.max(0, this.uv.v)),
          f = blendField(a, b, c, d, smooth01(u), smooth01(v));
        this.inside[k] = +(f >= 0.5);
        const g = blendFieldGradient(a, b, c, d, u, v, this.grad),
          pts = grid.corners,
          p0 = pts[ids[0]],
          p1 = pts[ids[1]],
          p2 = pts[ids[2]],
          p3 = pts[ids[3]],
          xu = (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x),
          zu = (1 - v) * (p1.z - p0.z) + v * (p2.z - p3.z),
          xv = (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x),
          zv = (1 - u) * (p3.z - p0.z) + u * (p2.z - p1.z),
          det = xu * zv - zu * xv,
          gx = (g.fu * zv - zu * g.fv) / det,
          gz = (xu * g.fv - g.fu * xv) / det,
          glen = Math.hypot(gx, gz),
          dist = glen > 1e-6 ? Math.abs(f - ISO) / glen : Infinity;
        this.seed[k] = dist < SEED_MAX_DIST ? dist : -1;
      }
    }
  }

  /** Two-pass chamfer distance transform from the seeds, pond flood fill, and texture upload. */
  propagate(): void {
    const n = this.size,
      dist = this.dist,
      step = this.texel,
      diag = step * Math.SQRT2,
      FAR = 1e6;
    for (let k = 0; k < n * n; k++) dist[k] = this.seed[k] >= 0 ? this.seed[k] : FAR;
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++) {
        const k = row * n + col;
        if (dist[k] < FAR) continue;
        const s = this.inside[k];
        if (
          (col > 0 && this.inside[k - 1] !== s) ||
          (col < n - 1 && this.inside[k + 1] !== s) ||
          (row > 0 && this.inside[k - n] !== s) ||
          (row < n - 1 && this.inside[k + n] !== s)
        )
          dist[k] = step * 0.5;
      }
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++) {
        const k = row * n + col;
        let d = dist[k];
        if (col > 0 && dist[k - 1] + step < d) d = dist[k - 1] + step;
        if (row > 0) {
          if (dist[k - n] + step < d) d = dist[k - n] + step;
          if (col > 0 && dist[k - n - 1] + diag < d) d = dist[k - n - 1] + diag;
          if (col < n - 1 && dist[k - n + 1] + diag < d) d = dist[k - n + 1] + diag;
        }
        dist[k] = d;
      }
    for (let row = n - 1; row >= 0; row--)
      for (let col = n - 1; col >= 0; col--) {
        const k = row * n + col;
        let d = dist[k];
        if (col < n - 1 && dist[k + 1] + step < d) d = dist[k + 1] + step;
        if (row < n - 1) {
          if (dist[k + n] + step < d) d = dist[k + n] + step;
          if (col < n - 1 && dist[k + n + 1] + diag < d) d = dist[k + n + 1] + diag;
          if (col > 0 && dist[k + n - 1] + diag < d) d = dist[k + n - 1] + diag;
        }
        dist[k] = d;
      }
    const pond = this.pond;
    pond.fill(1);
    const stack: number[] = [],
      visit = (k: number): void => {
        if (pond[k] && !this.inside[k]) {
          pond[k] = 0;
          stack.push(k);
        }
      };
    for (let k = 0; k < n; k++) {
      visit(k);
      visit((n - 1) * n + k);
      visit(k * n);
      visit(k * n + n - 1);
    }
    while (stack.length) {
      const k = stack.pop()!,
        col = k % n;
      if (col > 0) visit(k - 1);
      if (col < n - 1) visit(k + 1);
      if (k >= n) visit(k - n);
      if (k < n * (n - 1)) visit(k + n);
    }
    const data = this.data;
    for (let k = 0; k < n * n; k++) {
      const s = this.inside[k] ? -dist[k] : dist[k];
      this.signed[k] = s;
      data[k * 4] = Math.round(Math.min(1, Math.max(0, (s + 1) / 9)) * 255);
      data[k * 4 + 1] = Math.round(Math.min(1, Math.max(0, (s + 0.5) / 2)) * 255);
      data[k * 4 + 2] = pond[k] && !this.inside[k] ? 255 : 0;
      data[k * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }
}
