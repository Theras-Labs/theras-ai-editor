// Ports index-BwioI7A7.js 12556-12845 (pa buildGrid, ma Grid).
// The organic quad grid: a hex of triangles, random triangle pairs merged into quads, every polygon
// split into quads, then relaxed toward squares. Same random-call order as the original (seeded).
import { CONFIG } from './config';
import { Rng } from './rng';

export type Quad = [number, number, number, number];

export interface GridCorner {
  id: number;
  x: number;
  z: number;
  /** On the outer edge of the grid. Boundary corners never move and always stay water. */
  boundary: boolean;
  /** Corner ids that share an edge, sorted by angle around this corner. */
  neighbors: number[];
  /** Cell ids that use this corner, sorted by angle around this corner. */
  cells: number[];
}

export interface GridCell {
  id: number;
  /** Four corner ids. */
  corners: Quad;
  /** Center (mean of the four corners). */
  cx: number;
  cz: number;
  /** Cell across edge k (corners[k] -> corners[k + 1]), or -1. */
  neighbors: Quad;
}

export interface GridOptions {
  size?: number;
  edge?: number;
  relaxIterations?: number;
}

export interface GridPoint {
  x: number;
  z: number;
}

export interface GridUV {
  u: number;
  v: number;
}

export function buildGrid(seed: number, opts: GridOptions = {}): Grid { // pa (12556)
  const size = opts.size ?? CONFIG.GRID_HEX_SIZE;
  const edge = opts.edge ?? CONFIG.GRID_TRI_EDGE;
  const relaxIterations = opts.relaxIterations ?? CONFIG.GRID_RELAX_ITERATIONS;
  const rowH = (edge * Math.sqrt(3)) / 2;
  const rng = new Rng(seed);
  const hexX: number[] = [];
  const hexZ: number[] = [];
  const hexIndex = new Map<string, number>();
  for (let q = -size; q <= size; q++)
    for (let r = -size; r <= size; r++) {
      if (Math.abs(-q - r) > size) continue;
      hexIndex.set(`${q},${r}`, hexX.length);
      hexX.push((q + r / 2) * edge);
      hexZ.push(r * rowH);
    }
  const at = (q: number, r: number) => hexIndex.get(`${q},${r}`);

  // Triangles.
  const tris: [number, number, number][] = [];
  for (let q = -size; q <= size; q++)
    for (let r = -size; r <= size; r++) {
      const a = at(q, r);
      const b = at(q + 1, r);
      const c = at(q, r + 1);
      const d = at(q + 1, r + 1);
      if (a !== undefined && b !== undefined && c !== undefined) tris.push([a, b, c]);
      if (b !== undefined && d !== undefined && c !== undefined) tris.push([b, d, c]);
    }

  const edgeKey = (a: number, b: number) => (a < b ? a * 1000003 + b : b * 1000003 + a); // f
  const triByEdge = new Map<number, number[]>();
  tris.forEach((tri, t) => {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(tri[k], tri[(k + 1) % 3]);
      const list = triByEdge.get(key);
      if (list) list.push(t);
      else triByEdge.set(key, [t]);
    }
  });

  // Merge random pairs of triangles into quads.
  const mate = new Int32Array(tris.length).fill(-1);
  const polys: number[][] = [];
  const order = rng.shuffle(tris.map((_, t) => t));
  for (const t of order) {
    if (mate[t] !== -1) continue;
    const tri = tris[t];
    const options: { other: number; edge: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const list = triByEdge.get(edgeKey(tri[k], tri[(k + 1) % 3]))!;
      for (const o of list) if (o !== t && mate[o] === -1) options.push({ other: o, edge: k });
    }
    if (!options.length) continue;
    const { other, edge: k } = rng.pick(options);
    mate[t] = other;
    mate[other] = t;
    const a = tri[k];
    const b = tri[(k + 1) % 3];
    const c = tri[(k + 2) % 3];
    const d = tris[other].find((v) => v !== a && v !== b)!;
    polys.push([c, a, d, b]);
  }
  tris.forEach((tri, t) => {
    if (mate[t] === -1) polys.push(tri);
  });

  // Split every polygon into quads around its center.
  const xs = [...hexX];
  const zs = [...hexZ];
  const midpoints = new Map<number, number>();
  const midpoint = (a: number, b: number) => {
    const key = edgeKey(a, b);
    let m = midpoints.get(key);
    if (m === undefined) {
      m = xs.length;
      xs.push((xs[a] + xs[b]) / 2);
      zs.push((zs[a] + zs[b]) / 2);
      midpoints.set(key, m);
    }
    return m;
  };
  let quads: Quad[] = [];
  for (const poly of polys) {
    const n = poly.length;
    let sx = 0;
    let sz = 0;
    for (const v of poly) {
      sx += xs[v];
      sz += zs[v];
    }
    const center = xs.length;
    xs.push(sx / n);
    zs.push(sz / n);
    const mids = poly.map((v, k) => midpoint(v, poly[(k + 1) % n]));
    for (let k = 0; k < n; k++) quads.push([poly[k], mids[k], center, mids[(k - 1 + n) % n]]);
  }
  const signedArea = (q: Quad) => {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const a = q[k];
      const b = q[(k + 1) % 4];
      s += xs[a] * zs[b] - xs[b] * zs[a];
    }
    return s;
  };
  if (signedArea(quads[0]) > 0) quads = quads.map((q): Quad => [q[0], q[3], q[2], q[1]]);

  // Boundary corners: on an edge used by one quad only.
  const edgeUse = new Map<number, number>();
  for (const q of quads)
    for (let k = 0; k < 4; k++) {
      const key = edgeKey(q[k], q[(k + 1) % 4]);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  const boundary = new Uint8Array(xs.length);
  for (const q of quads)
    for (let k = 0; k < 4; k++)
      if (edgeUse.get(edgeKey(q[k], q[(k + 1) % 4])) === 1) {
        boundary[q[k]] = 1;
        boundary[q[(k + 1) % 4]] = 1;
      }

  // Relax: move each quad toward a square, averaged over the quads of each corner.
  const dx = new Float64Array(xs.length);
  const dz = new Float64Array(xs.length);
  const count = new Float64Array(xs.length);
  for (const q of quads) for (const v of q) count[v]++;
  for (let it = 0; it < relaxIterations; it++) {
    dx.fill(0);
    dz.fill(0);
    for (const q of quads) {
      const [a, b, c, d] = q;
      const mx = (xs[a] + xs[b] + xs[c] + xs[d]) / 4;
      const mz = (zs[a] + zs[b] + zs[c] + zs[d]) / 4;
      const ax = xs[a] - mx;
      const az = zs[a] - mz;
      const bx = xs[b] - mx;
      const bz = zs[b] - mz;
      const cx = xs[c] - mx;
      const cz = zs[c] - mz;
      const ex = xs[d] - mx;
      const ez = zs[d] - mz;
      const sx = (ax + -bz + -cx + ez) / 4;
      const sz = (az + bx + -cz + -ex) / 4;
      dx[a] += mx + sx - xs[a];
      dz[a] += mz + sz - zs[a];
      dx[b] += mx + sz - xs[b];
      dz[b] += mz - sx - zs[b];
      dx[c] += mx - sx - xs[c];
      dz[c] += mz - sz - zs[c];
      dx[d] += mx - sz - xs[d];
      dz[d] += mz + sx - zs[d];
    }
    for (let v = 0; v < xs.length; v++)
      if (!boundary[v]) {
        xs[v] += (dx[v] / count[v]) * 0.5;
        zs[v] += (dz[v] / count[v]) * 0.5;
      }
  }

  const corners: GridCorner[] = xs.map((x, id) => ({
    id,
    x,
    z: zs[id],
    boundary: !!boundary[id],
    neighbors: [],
    cells: [],
  }));
  const cells: GridCell[] = quads.map((q, id) => ({
    id,
    corners: [q[0], q[1], q[2], q[3]],
    cx: (xs[q[0]] + xs[q[1]] + xs[q[2]] + xs[q[3]]) / 4,
    cz: (zs[q[0]] + zs[q[1]] + zs[q[2]] + zs[q[3]]) / 4,
    neighbors: [-1, -1, -1, -1],
  }));
  const cellByEdge = new Map<number, number[]>();
  for (const cell of cells)
    for (let k = 0; k < 4; k++) {
      const a = cell.corners[k];
      const b = cell.corners[(k + 1) % 4];
      const key = edgeKey(a, b);
      const list = cellByEdge.get(key);
      if (list) list.push(cell.id);
      else cellByEdge.set(key, [cell.id]);
      corners[a].cells.push(cell.id);
      if (!corners[a].neighbors.includes(b)) corners[a].neighbors.push(b);
      if (!corners[b].neighbors.includes(a)) corners[b].neighbors.push(a);
    }
  for (const cell of cells)
    for (let k = 0; k < 4; k++) {
      const list = cellByEdge.get(edgeKey(cell.corners[k], cell.corners[(k + 1) % 4]))!;
      cell.neighbors[k] = list.find((o) => o !== cell.id) ?? -1;
    }
  for (const corner of corners) {
    const angle = (x: number, z: number) => Math.atan2(z - corner.z, x - corner.x);
    corner.neighbors.sort((a, b) => angle(corners[a].x, corners[a].z) - angle(corners[b].x, corners[b].z));
    corner.cells.sort((a, b) => angle(cells[a].cx, cells[a].cz) - angle(cells[b].cx, cells[b].cz));
  }
  return new Grid(corners, cells, size * edge, seed);
}

export class Grid { // ma (12711)
  corners: GridCorner[];
  cells: GridCell[];
  /** Hex radius in world units (size * edge). */
  radius: number;
  seed: number;
  bucketSize = 1.5;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** Corner ids per bucket (row * cols + col). */
  cornerBuckets: number[][];
  /** Cell ids per bucket; a cell is in every bucket its bounding box touches. */
  cellBuckets: number[][];
  /** Corner id -> dual polygon. */
  dualCache = new Map<number, GridPoint[]>();

  constructor(corners: GridCorner[], cells: GridCell[], radius: number, seed: number) {
    this.corners = corners;
    this.cells = cells;
    this.radius = radius;
    this.seed = seed;
    this.minX = -radius - 2;
    this.minZ = -radius - 2;
    this.cols = Math.ceil((2 * (radius + 2)) / this.bucketSize) + 1;
    this.rows = this.cols;
    this.cornerBuckets = Array.from({ length: this.cols * this.rows }, (): number[] => []);
    this.cellBuckets = Array.from({ length: this.cols * this.rows }, (): number[] => []);
    for (const c of corners) this.cornerBuckets[this.bucket(c.x, c.z)].push(c.id);
    for (const cell of cells) {
      let x0 = 1 / 0;
      let x1 = -1 / 0;
      let z0 = 1 / 0;
      let z1 = -1 / 0;
      for (const v of cell.corners) {
        x0 = Math.min(x0, corners[v].x);
        x1 = Math.max(x1, corners[v].x);
        z0 = Math.min(z0, corners[v].z);
        z1 = Math.max(z1, corners[v].z);
      }
      const c0 = this.col(x0);
      const c1 = this.col(x1);
      const r0 = this.row(z0);
      const r1 = this.row(z1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cellBuckets[r * this.cols + c].push(cell.id);
    }
  }

  col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.bucketSize)));
  }

  row(z: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.bucketSize)));
  }

  bucket(x: number, z: number): number {
    return this.row(z) * this.cols + this.col(x);
  }

  /** Nearest corner id, or -1 when the point is outside radius + 2. Searches bucket rings 0..3. */
  nearestCorner(x: number, z: number): number {
    if (x * x + z * z > (this.radius + 2) * (this.radius + 2)) return -1;
    const c0 = this.col(x);
    const r0 = this.row(z);
    let best = -1;
    let bestD = 1 / 0;
    for (let ring = 0; ring < 4; ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++)
        for (let c = c0 - ring; c <= c0 + ring; c++)
          if (!(c < 0 || r < 0 || c >= this.cols || r >= this.rows) && Math.max(Math.abs(c - c0), Math.abs(r - r0)) === ring)
            for (const id of this.cornerBuckets[r * this.cols + c]) {
              const p = this.corners[id];
              const d = (p.x - x) ** 2 + (p.z - z) ** 2;
              if (d < bestD) {
                bestD = d;
                best = id;
              }
            }
      if (best !== -1 && ring >= 1) break;
    }
    return best;
  }

  /** Cell id that contains the point, or -1. */
  cellAt(x: number, z: number): number {
    const list = this.cellBuckets[this.bucket(x, z)];
    for (const id of list) if (this.inCell(id, x, z)) return id;
    return -1;
  }

  /** Point-in-quad test (even-odd crossing). */
  inCell(id: number, x: number, z: number): boolean {
    const q = this.cells[id].corners;
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = this.corners[q[i]];
      const b = this.corners[q[j]];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }

  /** Bilinear point of the cell at (u, v). Writes into `out`. */
  cellPoint(id: number, u: number, v: number, out: GridPoint = { x: 0, z: 0 }): GridPoint {
    const [i0, i1, i2, i3] = this.cells[id].corners;
    const p0 = this.corners[i0];
    const p1 = this.corners[i1];
    const p2 = this.corners[i2];
    const p3 = this.corners[i3];
    const w0 = (1 - u) * (1 - v);
    const w1 = u * (1 - v);
    const w2 = u * v;
    const w3 = (1 - u) * v;
    out.x = p0.x * w0 + p1.x * w1 + p2.x * w2 + p3.x * w3;
    out.z = p0.z * w0 + p1.z * w1 + p2.z * w2 + p3.z * w3;
    return out;
  }

  /** Inverse of cellPoint: (u, v) of a world point, by up to 8 Newton steps from (0.5, 0.5). */
  cellUV(id: number, x: number, z: number, out: GridUV = { u: 0.5, v: 0.5 }): GridUV {
    const [i0, i1, i2, i3] = this.cells[id].corners;
    const p0 = this.corners[i0];
    const p1 = this.corners[i1];
    const p2 = this.corners[i2];
    const p3 = this.corners[i3];
    let u = 0.5;
    let v = 0.5;
    for (let it = 0; it < 8; it++) {
      const px = (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x;
      const pz = (1 - u) * (1 - v) * p0.z + u * (1 - v) * p1.z + u * v * p2.z + (1 - u) * v * p3.z;
      const ex = x - px;
      const ez = z - pz;
      if (ex * ex + ez * ez < 1e-12) break;
      const dxu = (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x);
      const dzu = (1 - v) * (p1.z - p0.z) + v * (p2.z - p3.z);
      const dxv = (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x);
      const dzv = (1 - u) * (p3.z - p0.z) + u * (p2.z - p1.z);
      const det = dxu * dzv - dxv * dzu;
      if (Math.abs(det) < 1e-12) break;
      u += (ex * dzv - dxv * ez) / det;
      v += (dxu * ez - ex * dzu) / det;
    }
    out.u = u;
    out.v = v;
    return out;
  }

  /** Polygon around a corner: centers of its cells and midpoints of its edges, sorted by angle. Cached. */
  dualPolygon(id: number): GridPoint[] {
    const cached = this.dualCache.get(id);
    if (cached) return cached;
    const c = this.corners[id];
    const pts: GridPoint[] = [];
    for (const cell of c.cells) pts.push({ x: this.cells[cell].cx, z: this.cells[cell].cz });
    for (const n of c.neighbors) pts.push({ x: (c.x + this.corners[n].x) / 2, z: (c.z + this.corners[n].z) / 2 });
    pts.sort((a, b) => Math.atan2(a.z - c.z, a.x - c.x) - Math.atan2(b.z - c.z, b.x - c.x));
    this.dualCache.set(id, pts);
    return pts;
  }
}
