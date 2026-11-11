// Island kit terrain: per-cell mesher for caps and walls on the relaxed quad grid (bundle 18031-18607).
//
// Each cell is sampled on an 8 x 8 (u, v) lattice. For every level 1..maxHeight the corner in/out flags are
// blended into a field (surface.ts); caps are the field >= 0.5 region, clipped into rounding bands, and walls
// are extruded down along the 0.5 contour.
//
// Output vertex (20 floats, interleaved):
//   0-2  position          3-5  normal
//   6-9  aSurf: stone weight, wall flag, cap rim factor / wall u, lip amount (walls: lip / LIP_OUT)
//  10-13 aInfo: shade, top y, level (caps) or wall bottom y (walls), cell random
//  14-17 aPop:  pivot y, birth time, amplitude, weight
//  18-19 aPopC: squash center x, z (1e5 = none)
import { CONFIG, levelY } from '../core/config';
import { hash01 } from '../core/rng';
import type { Grid } from '../core/grid';
import type { World } from '../core/world';
import {
  ISO,
  ROUND_STOPS,
  LIP_OUT,
  LIP_DROP,
  WALL_FLOOR_Y,
  smooth01,
  roundDrop,
  rimTopY,
  blendField,
  blendFieldGradient,
  offIso,
  type FieldGradient,
} from './surface';

/** Lattice samples per cell side. */
const SUB = 8; // rc (18031)
/** Lattice samples per cell. */
const SUB2 = SUB * SUB; // ic (18032)
/** Floats per clip polygon vertex: u, v, field, field above, stone weight. */
const POLY_STRIDE = 5; // ac (18033)
/** Maximum clip polygon vertices. */
const POLY_MAX = 16; // oc (18034)

/** Pop animation for a rebuilt cell (or the island reveal). */
export interface PopSpec {
  /** Per-corner weight of the changed corners (corner order of the cell). */
  flags: number[];
  pivot: number;
  birth: number;
  amp: number;
  center?: { x: number; z: number };
  reveal?: { t0: number; rate: number };
}

interface WallNode {
  u: number;
  v: number;
  /** Field of the level above at this node. */
  b: number;
  /** Stone weight. */
  m: number;
  segs: number[];
  boundary: boolean;
}

/** Growable Float32Array of output vertices. */
export class FloatBuffer { // sc (18035)
  buf = new Float32Array(32768);
  len = 0;
  reset(): void {
    this.len = 0;
  }
  reserve(count: number): void {
    if (this.len + count <= this.buf.length) return;
    let size = this.buf.length * 2;
    for (; size < this.len + count; ) size *= 2;
    const next = new Float32Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  take(): Float32Array {
    return this.buf.slice(0, this.len);
  }
}

export class CellMesher { // cc (18052)
  grid: Grid;
  world: World;
  out = new FloatBuffer();
  x0 = 0;
  x1 = 0;
  x2 = 0;
  x3 = 0;
  z0 = 0;
  z1 = 0;
  z2 = 0;
  z3 = 0;
  h = [0, 0, 0, 0];
  stone = [0, 0, 0, 0];
  cellRnd = 0;
  g: Float64Array[] = [];
  mat: Float64Array[] = [];
  us = new Float64Array(SUB2);
  vs = new Float64Array(SUB2);
  sus = new Float64Array(SUB2);
  svs = new Float64Array(SUB2);
  polyA = new Float64Array(80);
  polyB = new Float64Array(80);
  band = new Float64Array(80);
  tmp = new Float64Array(80);
  r0 = new Float64Array(20);
  r1 = new Float64Array(20);
  r2 = new Float64Array(20);
  r3 = new Float64Array(20);
  pop: PopSpec | null = null;
  grad: FieldGradient = { fu: 0, fv: 0 };
  nrm = { x: 0, z: 0 };

  constructor(grid: Grid, world: World) {
    this.grid = grid;
    this.world = world;
    for (let k = 0; k < CONFIG.MAX_HEIGHT + 1; k++) {
      this.g.push(new Float64Array(SUB2));
      this.mat.push(new Float64Array(SUB2));
    }
    for (let row = 0; row < SUB; row++)
      for (let col = 0; col < SUB; col++) {
        const k = row * SUB + col;
        this.us[k] = col / 7;
        this.vs[k] = row / 7;
        this.sus[k] = smooth01(col / 7);
        this.svs[k] = smooth01(row / 7);
      }
  }

  /** Builds the vertex data of one cell. Returns an empty array for an all-water cell. */
  build(cellId: number, pop: PopSpec | null): Float32Array {
    const ids = this.grid.cells[cellId].corners,
      pts = this.grid.corners;
    this.x0 = pts[ids[0]].x;
    this.z0 = pts[ids[0]].z;
    this.x1 = pts[ids[1]].x;
    this.z1 = pts[ids[1]].z;
    this.x2 = pts[ids[2]].x;
    this.z2 = pts[ids[2]].z;
    this.x3 = pts[ids[3]].x;
    this.z3 = pts[ids[3]].z;
    let maxH = 0;
    for (let k = 0; k < 4; k++) {
      const c = this.world.get(ids[k]);
      this.h[k] = c.height;
      this.stone[k] = +(c.material === `stone`);
      if (c.height > maxH) maxH = c.height;
    }
    this.out.reset();
    if (maxH === 0) return new Float32Array();
    this.cellRnd = hash01(cellId, 911);
    this.pop = pop;
    const h = this.h;
    for (let level = 1; level <= maxH; level++) {
      const in0 = +(h[0] >= level),
        in1 = +(h[1] >= level),
        in2 = +(h[2] >= level),
        in3 = +(h[3] >= level),
        field = this.g[level - 1],
        below = level > 1 ? this.g[level - 2] : null,
        matField = this.mat[level - 1],
        s0 = this.stone[0] * in0,
        s1 = this.stone[1] * in1,
        s2 = this.stone[2] * in2,
        s3 = this.stone[3] * in3,
        count = in0 + in1 + in2 + in3,
        avg = count ? (s0 + s1 + s2 + s3) / count : 0;
      for (let k = 0; k < SUB2; k++) {
        const u = this.sus[k],
          v = this.svs[k];
        let f = blendField(in0, in1, in2, in3, u, v);
        if (below && below[k] < f) f = below[k];
        field[k] = offIso(f);
        const w0 = (1 - u) * (1 - v) * in0,
          w1 = u * (1 - v) * in1,
          w2 = u * v * in2,
          w3 = (1 - u) * v * in3,
          sum = w0 + w1 + w2 + w3;
        matField[k] = sum > 1e-9 ? (w0 * s0 + w1 * s1 + w2 * s2 + w3 * s3) / sum : avg;
      }
    }
    for (let level = 1; level <= maxH; level++) this.buildLevel(level, maxH);
    return this.out.take();
  }

  inside(level: number, corner: number): number {
    return +(this.h[corner] >= level);
  }

  buildLevel(level: number, maxH: number): void {
    const h = this.h,
      mask = +(h[0] >= level) | (h[1] >= level ? 2 : 0) | (h[2] >= level ? 4 : 0) | (h[3] >= level ? 8 : 0),
      maskAbove =
        level < maxH
          ? +(h[0] >= level + 1) | (h[1] >= level + 1 ? 2 : 0) | (h[2] >= level + 1 ? 4 : 0) | (h[3] >= level + 1 ? 8 : 0)
          : 0;
    if (mask === 0) return;
    const topY = levelY(level);
    if (maskAbove !== mask) {
      const field = this.g[level - 1],
        above = maskAbove ? this.g[level] : null,
        matField = this.mat[level - 1];
      let sameStone = true,
        first = -1;
      for (let k = 0; k < 4; k++) {
        if (h[k] < level) continue;
        if (first < 0) first = this.stone[k];
        else if (this.stone[k] !== first) sameStone = false;
      }
      if (mask === 15 && maskAbove === 0 && sameStone) this.flatFan(level, topY);
      else {
        const us = this.us,
          vs = this.vs;
        for (let row = 0; row < 7; row++)
          for (let col = 0; col < 7; col++) {
            const a = row * SUB + col,
              b = a + 1,
              c = a + SUB,
              d = c + 1;
            if ((col + row) & 1) {
              this.capTri(a, b, c, field, above, matField, us, vs, level, topY);
              this.capTri(b, d, c, field, above, matField, us, vs, level, topY);
            } else {
              this.capTri(a, b, d, field, above, matField, us, vs, level, topY);
              this.capTri(a, d, c, field, above, matField, us, vs, level, topY);
            }
          }
      }
    }
    if (mask !== 15) this.walls(level, maskAbove);
  }

  /** Full flat cap of one material: a 28-segment fan around the cell center. */
  flatFan(level: number, topY: number): void {
    const stone = this.stone[0],
      center = this.r0,
      prev = this.r1,
      next = this.r2;
    this.capVertex(center, 0.5, 0.5, 1, 0, stone, level, topY);
    const ring = (k: number, out: Float64Array): void => {
      const side = Math.floor(k / 7) % 4,
        t = (k % 7) / 7;
      let u = 0,
        v = 0;
      if (side === 0) {
        u = t;
        v = 0;
      } else if (side === 1) {
        u = 1;
        v = t;
      } else if (side === 2) {
        u = 1 - t;
        v = 1;
      } else {
        u = 0;
        v = 1 - t;
      }
      this.capVertex(out, u, v, 1, 0, stone, level, topY);
    };
    ring(0, prev);
    for (let k = 0; k < 28; k++) {
      ring((k + 1) % 28, next);
      this.emitTri(center, prev, next);
      prev.set(next);
    }
  }

  capTri(
    a: number,
    b: number,
    c: number,
    field: Float64Array,
    above: Float64Array | null,
    matField: Float64Array,
    us: Float64Array,
    vs: Float64Array,
    level: number,
    topY: number,
  ): void {
    const fa = field[a],
      fb = field[b],
      fc = field[c];
    if (fa < 0.5 && fb < 0.5 && fc < 0.5) return;
    const pa = above ? above[a] : 0,
      pb = above ? above[b] : 0,
      pc = above ? above[c] : 0;
    if (pa > 0.5 && pb > 0.5 && pc > 0.5) return;
    let poly = this.polyA;
    poly[0] = us[a];
    poly[1] = vs[a];
    poly[2] = fa;
    poly[3] = pa;
    poly[4] = matField[a];
    poly[5] = us[b];
    poly[6] = vs[b];
    poly[7] = fb;
    poly[8] = pb;
    poly[9] = matField[b];
    poly[10] = us[c];
    poly[11] = vs[c];
    poly[12] = fc;
    poly[13] = pc;
    poly[14] = matField[c];
    let n = 3;
    if (fa < 0.5 || fb < 0.5 || fc < 0.5) {
      n = clipPolygon(poly, n, 2, ISO, true, this.polyB);
      poly = this.polyB;
      if (n < 3) return;
    }
    if (above && (pa > 0.5 || pb > 0.5 || pc > 0.5)) {
      const dst = poly === this.polyA ? this.polyB : this.polyA;
      n = clipPolygon(poly, n, 3, ISO, false, dst);
      poly = dst;
      if (n < 3) return;
    }
    let minField = Infinity;
    for (let k = 0; k < n; k++) minField = Math.min(minField, poly[k * POLY_STRIDE + 2]);
    if (minField >= ROUND_STOPS[3]) {
      this.emitPoly(poly, n, level, topY);
      return;
    }
    for (let bandIdx = 0; bandIdx < 4; bandIdx++) {
      const lo = ROUND_STOPS[bandIdx],
        hi = bandIdx < 3 ? ROUND_STOPS[bandIdx + 1] : Infinity;
      let src = poly,
        m = n;
      if (bandIdx > 0) {
        m = clipPolygon(src, m, 2, lo, true, this.tmp);
        src = this.tmp;
        if (m < 3) continue;
      }
      if (hi !== Infinity) {
        m = clipPolygon(src, m, 2, hi, false, this.band);
        src = this.band;
        if (m < 3) continue;
      }
      this.emitPoly(src, m, level, topY);
    }
  }

  emitPoly(poly: Float64Array, n: number, level: number, topY: number): void {
    const a = this.r0,
      b = this.r1,
      c = this.r2;
    this.capVertex(a, poly[0], poly[1], poly[2], poly[3], poly[4], level, topY);
    this.capVertex(b, poly[POLY_STRIDE], poly[6], poly[7], poly[8], poly[9], level, topY);
    for (let k = 2; k < n; k++) {
      const o = k * POLY_STRIDE;
      this.capVertex(c, poly[o], poly[o + 1], poly[o + 2], poly[o + 3], poly[o + 4], level, topY);
      this.emitTri(a, b, c);
      b.set(c);
    }
  }

  px(u: number, v: number): number {
    return (1 - v) * (this.x0 + (this.x1 - this.x0) * u) + v * (this.x3 + (this.x2 - this.x3) * u);
  }

  pz(u: number, v: number): number {
    return (1 - v) * (this.z0 + (this.z1 - this.z0) * u) + v * (this.z3 + (this.z2 - this.z3) * u);
  }

  /** Lip overhang for a rim point, from the field of the level above (no lip under a higher level). */
  lipAmount(fieldAbove: number): number {
    const t = Math.min(1, Math.max(0, (fieldAbove - 0.3) / 0.2));
    return LIP_OUT * (1 - t * t * (3 - 2 * t));
  }

  capVertex(
    out: Float64Array,
    u: number,
    v: number,
    field: number,
    fieldAbove: number,
    stoneW: number,
    level: number,
    topY: number,
  ): void {
    let x = this.px(u, v),
      z = this.pz(u, v);
    if (field === 0.5) {
      const lip = this.lipAmount(fieldAbove);
      if (lip > 0) {
        this.contourNormal(u, v, level, this.nrm);
        x += this.nrm.x * lip;
        z += this.nrm.z * lip;
      }
    }
    out[0] = x;
    out[1] = topY - roundDrop(field);
    out[2] = z;
    out[6] = stoneW;
    out[7] = 0;
    out[8] = Math.min(1, Math.max(0, (field - ISO) / 0.42));
    out[9] = 0;
    const s = Math.min(1, Math.max(0, (fieldAbove - 0.12) / 0.38));
    out[10] = 1 - 0.55 * s * s * (3 - 2 * s);
    out[11] = topY;
    out[12] = level;
    out[13] = this.cellRnd;
    this.popAttrs(out, u, v, x, z);
  }

  popAttrs(out: Float64Array, u: number, v: number, x: number, z: number): void {
    const pop = this.pop;
    if (!pop) {
      out[14] = -10;
      out[15] = -100;
      out[16] = 0;
      out[17] = 0;
      out[18] = 1e5;
      out[19] = 0;
      return;
    }
    out[14] = pop.pivot;
    out[16] = pop.amp;
    out[18] = pop.center ? pop.center.x : 1e5;
    out[19] = pop.center ? pop.center.z : 0;
    if (pop.reveal) {
      out[15] = pop.reveal.t0 + pop.reveal.rate * Math.hypot(x, z);
      out[17] = 1;
      return;
    }
    out[15] = pop.birth;
    const su = smooth01(u),
      sv = smooth01(v),
      flags = pop.flags;
    out[17] = Math.min(1, (1 - su) * (1 - sv) * flags[0] + su * (1 - sv) * flags[1] + su * sv * flags[2] + (1 - su) * sv * flags[3]);
  }

  /** Outward (land -> water) unit normal of the level's contour at (u, v), in world xz. */
  contourNormal(u: number, v: number, level: number, out: { x: number; z: number }): { x: number; z: number } {
    const eps = 1e-7;
    let ca = -1,
      cb = -1;
    if (v < eps) {
      ca = 0;
      cb = 1;
    } else if (u > 0.9999999) {
      ca = 1;
      cb = 2;
    } else if (v > 0.9999999) {
      ca = 3;
      cb = 2;
    } else if (u < eps) {
      ca = 0;
      cb = 3;
    }
    if (ca >= 0) {
      const ia = this.inside(level, ca),
        ib = this.inside(level, cb);
      if (ia !== ib) {
        const ax = this.cx(ca),
          az = this.cz(ca),
          bx = this.cx(cb),
          bz = this.cz(cb);
        let dx = bx - ax,
          dz = bz - az;
        if (ia < ib) {
          dx = -dx;
          dz = -dz;
        }
        const len = Math.hypot(dx, dz) || 1;
        out.x = dx / len;
        out.z = dz / len;
        return out;
      }
    }
    const su = smooth01(u),
      sv = smooth01(v);
    let best = Infinity,
      lvl = level;
    for (let k = 1; k <= level; k++) {
      const f = blendField(this.inside(k, 0), this.inside(k, 1), this.inside(k, 2), this.inside(k, 3), su, sv);
      if (f < best - 1e-9) {
        best = f;
        lvl = k;
      }
    }
    const grad = blendFieldGradient(
        this.inside(lvl, 0),
        this.inside(lvl, 1),
        this.inside(lvl, 2),
        this.inside(lvl, 3),
        u,
        v,
        this.grad,
      ),
      fu = grad.fu,
      fv = grad.fv,
      xu = (1 - v) * (this.x1 - this.x0) + v * (this.x2 - this.x3),
      zu = (1 - v) * (this.z1 - this.z0) + v * (this.z2 - this.z3),
      xv = (1 - u) * (this.x3 - this.x0) + u * (this.x2 - this.x1),
      zv = (1 - u) * (this.z3 - this.z0) + u * (this.z2 - this.z1),
      det = xu * zv - zu * xv,
      gx = (fu * zv - zu * fv) / det,
      gz = (xu * fv - fu * xv) / det,
      len = Math.hypot(gx, gz);
    if (len > 1e-9) {
      out.x = -gx / len;
      out.z = -gz / len;
    } else {
      out.x = 0;
      out.z = 0;
    }
    return out;
  }

  cx(corner: number): number {
    return corner === 0 ? this.x0 : corner === 1 ? this.x1 : corner === 2 ? this.x2 : this.x3;
  }

  cz(corner: number): number {
    return corner === 0 ? this.z0 : corner === 1 ? this.z1 : corner === 2 ? this.z2 : this.z3;
  }

  /** Traces the level's 0.5 contour through the lattice triangles and extrudes walls along each chain. */
  walls(level: number, maskAbove: number): void {
    const field = this.g[level - 1],
      above = maskAbove ? this.g[level] : null,
      matField = this.mat[level - 1],
      us = this.us,
      vs = this.vs,
      nodes = new Map<number, WallNode>(),
      segs: [number, number][] = [],
      nodeOn = (p: number, q: number): number => {
        const lo = p < q ? p : q,
          hi = p < q ? q : p,
          key = lo * SUB2 + hi;
        if (!nodes.has(key)) {
          const t = (ISO - field[lo]) / (field[hi] - field[lo]),
            u = us[lo] + (us[hi] - us[lo]) * t,
            v = vs[lo] + (vs[hi] - vs[lo]) * t,
            b = above ? above[lo] + (above[hi] - above[lo]) * t : 0,
            m = matField[lo] + (matField[hi] - matField[lo]) * t,
            boundary =
              (us[lo] === 0 && us[hi] === 0) ||
              (us[lo] === 1 && us[hi] === 1) ||
              (vs[lo] === 0 && vs[hi] === 0) ||
              (vs[lo] === 1 && vs[hi] === 1);
          nodes.set(key, { u: boundary ? clamp01(u) : u, v: boundary ? clamp01(v) : v, b, m, segs: [], boundary });
        }
        return key;
      },
      tri = (a: number, b: number, c: number): void => {
        const ia = field[a] >= ISO,
          ib = field[b] >= ISO,
          ic = field[c] >= ISO;
        if (ia === ib && ib === ic) return;
        const cut: number[] = [];
        if (ia !== ib) cut.push(nodeOn(a, b));
        if (ib !== ic) cut.push(nodeOn(b, c));
        if (ic !== ia) cut.push(nodeOn(c, a));
        if (cut.length !== 2) return;
        const idx = segs.length;
        segs.push([cut[0], cut[1]]);
        nodes.get(cut[0])!.segs.push(idx);
        nodes.get(cut[1])!.segs.push(idx);
      };
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 7; col++) {
        const a = row * SUB + col,
          b = a + 1,
          c = a + SUB,
          d = c + 1;
        if ((col + row) & 1) {
          tri(a, b, c);
          tri(b, d, c);
        } else {
          tri(a, b, d);
          tri(a, d, c);
        }
      }
    if (!segs.length) return;
    const used = new Uint8Array(segs.length),
      chains: number[][] = [],
      walk = (start: number): number[] => {
        const chain = [start];
        let cur = start;
        for (;;) {
          const node = nodes.get(cur)!;
          let next = -1;
          for (const s of node.segs)
            if (!used[s]) {
              next = s;
              break;
            }
          if (next < 0) break;
          used[next] = 1;
          const [p, q] = segs[next];
          cur = p === cur ? q : p;
          chain.push(cur);
        }
        return chain;
      },
      keys = [...nodes.keys()].sort((p, q) => p - q);
    for (const key of keys) {
      const node = nodes.get(key)!;
      if (node.segs.length === 1 && !used[node.segs[0]]) chains.push(walk(key));
    }
    for (let s = 0; s < segs.length; s++) if (!used[s]) chains.push(walk(segs[s][0]));
    for (const chain of chains)
      if (chain.length >= 2)
        this.wallChain(
          chain.map((key) => nodes.get(key)!),
          level,
        );
  }

  wallChain(chain: WallNode[], level: number): void {
    const n = chain.length,
      xs = new Float64Array(n),
      zs = new Float64Array(n),
      nx = new Float64Array(n),
      nz = new Float64Array(n),
      dist = new Float64Array(n),
      lip = new Float64Array(n);
    let total = 0;
    for (let k = 0; k < n; k++) {
      const node = chain[k];
      xs[k] = this.px(node.u, node.v);
      zs[k] = this.pz(node.u, node.v);
      if (k > 0) total += Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
      dist[k] = total;
      this.contourNormal(node.u, node.v, level, this.nrm);
      nx[k] = this.nrm.x;
      nz[k] = this.nrm.z;
      lip[k] = this.lipAmount(node.b);
    }
    for (let k = 0; k < n; k++) {
      if (nx[k] !== 0 || nz[k] !== 0) continue;
      const p = Math.max(0, k - 1),
        q = Math.min(n - 1, k + 1),
        dx = xs[q] - xs[p],
        dz = zs[q] - zs[p],
        len = Math.hypot(dx, dz) || 1;
      nx[k] = dz / len;
      nz[k] = -dx / len;
    }
    const bricks = Math.max(1, Math.round(total / 0.42)),
      uScale = total > 1e-9 ? bricks / total : 0,
      top = rimTopY(level),
      bottom = level === 1 ? WALL_FLOOR_Y : rimTopY(level - 1),
      ys = [top, top - LIP_DROP, bottom],
      lipK = [1, 0, 0],
      rows = ys.length,
      v0 = this.r0,
      v1 = this.r1,
      v2 = this.r2,
      v3 = this.r3;
    for (let k = 0; k < n - 1; k++) {
      const dx = xs[k + 1] - xs[k],
        dz = zs[k + 1] - zs[k];
      if (dx * dx + dz * dz < 1e-14) continue;
      const flip = -dz * (nx[k] + nx[k + 1]) + dx * (nz[k] + nz[k + 1]) < 0;
      for (let r = 0; r < rows - 1; r++) {
        this.wallVertex(v0, chain[k], xs[k], zs[k], nx[k], nz[k], lipK[r] * lip[k], ys[r], dist[k] * uScale, lip[k], top, bottom);
        this.wallVertex(
          v1,
          chain[k + 1],
          xs[k + 1],
          zs[k + 1],
          nx[k + 1],
          nz[k + 1],
          lipK[r] * lip[k + 1],
          ys[r],
          dist[k + 1] * uScale,
          lip[k + 1],
          top,
          bottom,
        );
        this.wallVertex(
          v2,
          chain[k + 1],
          xs[k + 1],
          zs[k + 1],
          nx[k + 1],
          nz[k + 1],
          lipK[r + 1] * lip[k + 1],
          ys[r + 1],
          dist[k + 1] * uScale,
          lip[k + 1],
          top,
          bottom,
        );
        this.wallVertex(
          v3,
          chain[k],
          xs[k],
          zs[k],
          nx[k],
          nz[k],
          lipK[r + 1] * lip[k],
          ys[r + 1],
          dist[k] * uScale,
          lip[k],
          top,
          bottom,
        );
        const smooth = r > 0;
        if (flip) {
          this.emitTri(v0, v2, v3, smooth);
          this.emitTri(v0, v1, v2, smooth);
        } else {
          this.emitTri(v0, v3, v2, smooth);
          this.emitTri(v0, v2, v1, smooth);
        }
      }
    }
  }

  wallVertex(
    out: Float64Array,
    node: WallNode,
    x: number,
    z: number,
    nx: number,
    nz: number,
    push: number,
    y: number,
    wallU: number,
    lip: number,
    top: number,
    bottom: number,
  ): void {
    const fx = x + nx * push,
      fz = z + nz * push;
    out[0] = fx;
    out[1] = y;
    out[2] = fz;
    out[3] = nx;
    out[4] = 0;
    out[5] = nz;
    out[6] = node.m;
    out[7] = 1;
    out[8] = wallU;
    out[9] = lip / LIP_OUT;
    out[10] = 1;
    out[11] = top;
    out[12] = bottom;
    out[13] = this.cellRnd;
    this.popAttrs(out, node.u, node.v, fx, fz);
  }

  /** Appends one triangle. `smooth` keeps the vertex normals; otherwise the face normal is used. */
  emitTri(a: Float64Array, b: Float64Array, c: Float64Array, smooth = false): void {
    const e1x = b[0] - a[0],
      e1y = b[1] - a[1],
      e1z = b[2] - a[2],
      e2x = c[0] - a[0],
      e2y = c[1] - a[1],
      e2z = c[2] - a[2];
    let fnx = e1y * e2z - e1z * e2y,
      fny = e1z * e2x - e1x * e2z,
      fnz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(fnx, fny, fnz);
    if (len < 1e-12) return;
    fnx /= len;
    fny /= len;
    fnz /= len;
    const out = this.out;
    out.reserve(60);
    const buf = out.buf;
    let o = out.len;
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      buf[o] = v[0];
      buf[o + 1] = v[1];
      buf[o + 2] = v[2];
      if (smooth) {
        buf[o + 3] = v[3];
        buf[o + 4] = v[4];
        buf[o + 5] = v[5];
      } else {
        buf[o + 3] = fnx;
        buf[o + 4] = fny;
        buf[o + 5] = fnz;
      }
      for (let j = 6; j < 20; j++) buf[o + j] = v[j];
      o += 20;
    }
    out.len = o;
  }
}

function clamp01(t: number): number { // lc (18578)
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Sutherland-Hodgman clip of a polygon (POLY_STRIDE floats per vertex) against `src[comp] >= level`
 * (keepAbove) or `src[comp] <= level`. Edge points are interpolated from the lower (u, v) endpoint so
 * shared edges cut identically in both neighbours. Returns the output vertex count.
 */
function clipPolygon( // uc (18581)
  src: Float64Array,
  n: number,
  comp: number,
  level: number,
  keepAbove: boolean,
  dst: Float64Array,
): number {
  let m = 0;
  for (let k = 0; k < n; k++) {
    const cur = k * POLY_STRIDE,
      prev = ((k + n - 1) % n) * POLY_STRIDE,
      cv = src[cur + comp],
      pv = src[prev + comp],
      curIn = keepAbove ? cv >= level : cv <= level;
    if (curIn !== (keepAbove ? pv >= level : pv <= level) && m < POLY_MAX) {
      let p = prev,
        q = cur;
      if (src[p] > src[q] || (src[p] === src[q] && src[p + 1] > src[q + 1])) {
        p = cur;
        q = prev;
      }
      const vp = src[p + comp],
        vq = src[q + comp],
        t = (level - vp) / (vq - vp),
        o = m * POLY_STRIDE;
      for (let j = 0; j < POLY_STRIDE; j++) dst[o + j] = src[p + j] + (src[q + j] - src[p + j]) * t;
      dst[o + comp] = level;
      m++;
    }
    if (curIn && m < POLY_MAX) {
      const o = m * POLY_STRIDE;
      for (let j = 0; j < POLY_STRIDE; j++) dst[o + j] = src[cur + j];
      m++;
    }
  }
  return m;
}
