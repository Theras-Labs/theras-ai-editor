// Richer builders of the object modeler (Phase A of the procedural quality plan): sweep,
// corrugated sheet, panel face, rounded box and a lathe with hard edges. They follow the port
// kit's rule "large relief is real geometry, vertices only where the form changes": each builder
// places vertices at the break points of its profile and nowhere else.
// Every builder returns a non-indexed geometry with position and normal. The normals are the
// shading the shape wants (creases hard, curves soft); build.ts keeps them where it should.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Axis, Part, SweepStation } from "./spec";

type V3 = [number, number, number];

/** A triangle soup: three vertices per triangle, one normal per vertex. */
class Soup {
  pos: number[] = [];
  nrm: number[] = [];

  /** Adds one triangle. Without normals each vertex gets the face normal. */
  tri(a: V3, b: V3, c: V3, na?: V3, nb?: V3, nc?: V3) {
    const f = faceNormal(a, b, c);
    if (!f) return; // degenerate: it adds nothing but cost
    this.pos.push(...a, ...b, ...c);
    this.nrm.push(...(na ?? f), ...(nb ?? f), ...(nc ?? f));
  }

  /** Adds a triangle wound so that its face normal points along `hint`. */
  triFacing(a: V3, b: V3, c: V3, hint: V3) {
    const f = faceNormal(a, b, c);
    if (f && f[0] * hint[0] + f[1] * hint[1] + f[2] * hint[2] < 0) this.tri(a, c, b);
    else this.tri(a, b, c);
  }

  /** Adds a quad a-b-c-d as two triangles, wound so that the face normal points along `hint`. */
  quad(a: V3, b: V3, c: V3, d: V3, hint: V3) {
    const f = faceNormal(a, b, c) ?? faceNormal(a, c, d);
    if (f && f[0] * hint[0] + f[1] * hint[1] + f[2] * hint[2] < 0) {
      this.tri(a, c, b);
      this.tri(a, d, c);
    } else {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    return g;
  }
}

function faceNormal(a: V3, b: V3, c: V3): V3 | null {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const l = Math.hypot(x, y, z);
  return l > 1e-12 ? [x / l, y / l, z / l] : null;
}

/**
 * Maps a geometry built in the canonical frame (u = x, v = y, w = z) onto an axis: w is the
 * path (sweep) or the facing direction (corrugated). "x": u -> z, w -> x. "y": v -> z, w -> y.
 * Both are a swap of two axes, a reflection, so the winding is flipped to keep faces outward.
 */
function mapAxis(g: THREE.BufferGeometry, axis: Axis): THREE.BufferGeometry {
  if (axis === "z") return g;
  for (const name of ["position", "normal"]) {
    const arr = (g.attributes[name] as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const [u, v, w] = [arr[i]!, arr[i + 1]!, arr[i + 2]!];
      if (axis === "x") arr.set([w, v, u], i);
      else arr.set([u, w, v], i);
    }
    // Swap the 2nd and 3rd vertex of each triangle.
    for (let i = 0; i + 9 <= arr.length; i += 9)
      for (let k = 0; k < 3; k++) {
        const t = arr[i + 3 + k]!;
        arr[i + 3 + k] = arr[i + 6 + k]!;
        arr[i + 6 + k] = t;
      }
  }
  return g;
}

/**
 * Crease-angle normals of a triangle soup: a vertex averages the face normals of the triangles
 * that meet at its position and turn less than `deg` from its own face. Edges that turn more
 * stay hard. This is what a modeler's "auto smooth" does.
 */
function autoSmooth(s: Soup, deg: number) {
  const cos = Math.cos(deg * (Math.PI / 180));
  const n = s.pos.length / 9;
  const faces: V3[] = [];
  for (let t = 0; t < n; t++) {
    const p = s.pos;
    const o = t * 9;
    faces.push(faceNormal([p[o]!, p[o + 1]!, p[o + 2]!], [p[o + 3]!, p[o + 4]!, p[o + 5]!], [p[o + 6]!, p[o + 7]!, p[o + 8]!]) ?? [0, 1, 0]);
  }
  const key = (i: number) => `${Math.round(s.pos[i]! * 1e5)},${Math.round(s.pos[i + 1]! * 1e5)},${Math.round(s.pos[i + 2]! * 1e5)}`;
  const at = new Map<string, number[]>();
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 3; k++) {
      const kk = key(t * 9 + k * 3);
      const list = at.get(kk);
      if (list) list.push(t);
      else at.set(kk, [t]);
    }
  for (let t = 0; t < n; t++) {
    const f = faces[t]!;
    for (let k = 0; k < 3; k++) {
      let x = 0, y = 0, z = 0;
      for (const o of at.get(key(t * 9 + k * 3))!) {
        const g = faces[o]!;
        if (f[0] * g[0] + f[1] * g[1] + f[2] * g[2] < cos) continue;
        x += g[0];
        y += g[1];
        z += g[2];
      }
      const l = Math.hypot(x, y, z) || 1;
      s.nrm.splice(t * 9 + k * 3, 3, x / l, y / l, z / l);
    }
  }
}

// ── sweep ─────────────────────────────────────────────────────

/** The profile as a counter-clockwise polygon (closing duplicate removed). */
function ccw(pts: [number, number][]): [number, number][] {
  const out = pts.slice();
  const a = out[0]!;
  const b = out[out.length - 1]!;
  if (out.length > 3 && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) out.pop();
  let area = 0;
  for (let i = 0; i < out.length; i++) {
    const [x1, y1] = out[i]!;
    const [x2, y2] = out[(i + 1) % out.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return area < 0 ? out.reverse() : out;
}

/**
 * A closed profile [u, v] swept along `axis` over `length`, centered on the part. Each station
 * scales and shifts the section (taper, bulge, a hull that narrows to the bow). Caps are closed.
 * Triangles: 2 x points x (stations - 1) on the sides, 2 x (points - 2) for the caps.
 */
export function sweepGeometry(p: Part): THREE.BufferGeometry {
  const prof = ccw(p.profile!);
  const L = p.length!;
  const stations: SweepStation[] = p.stations ?? [
    { t: 0, s: [1, 1], d: [0, 0] },
    { t: 1, s: [1, 1], d: [0, 0] }
  ];
  const ring = (st: SweepStation): V3[] => prof.map(([u, v]) => [u * st.s[0] + st.d[0], v * st.s[1] + st.d[1], (st.t - 0.5) * L]);
  const rings = stations.map(ring);
  const s = new Soup();
  const n = prof.length;
  for (let j = 0; j + 1 < rings.length; j++) {
    const r0 = rings[j]!;
    const r1 = rings[j + 1]!;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      // For a counter-clockwise profile, (a, b, c) faces out: (b - a) x (path direction).
      s.tri(r0[i]!, r0[k]!, r1[k]!);
      s.tri(r0[i]!, r1[k]!, r1[i]!);
    }
  }
  // Caps: the section triangulated once, used at both ends.
  const capTris = THREE.ShapeUtils.triangulateShape(
    prof.map(([u, v]) => new THREE.Vector2(u, v)),
    []
  );
  const first = rings[0]!;
  const last = rings[rings.length - 1]!;
  for (const [a, b, c] of capTris) {
    s.triFacing(first[a]!, first[b]!, first[c]!, [0, 0, -1]);
    s.triFacing(last[a]!, last[b]!, last[c]!, [0, 0, 1]);
  }
  // Hard where the section or the path turns more than 30 degrees, soft elsewhere.
  autoSmooth(s, 30);
  return mapAxis(s.geometry(), p.axis ?? "y");
}

// ── corrugated ────────────────────────────────────────────────

/** Default wave of an ISO container side: 278 mm pitch, 72 mm outer flat, 68 mm slope. */
export const CORRUGATION = { pitch: 0.278, flat: 72 / 278, slope: 68 / 278 } as const;

/**
 * A corrugated sheet [width, height], centered, facing +axis. The width holds a whole number of
 * trapezoid waves (the pitch is stretched a little to fit). Vertices only at the four break
 * points of each wave; each strip between two break points spans the full height.
 * Triangles: 4 strips per wave x 2 = 8 x waves. One-sided (the material is double-sided).
 */
export function corrugatedGeometry(p: Part): THREE.BufferGeometry {
  const [W, H, D] = p.size!;
  const waves = Math.max(1, Math.round(W / (p.pitch ?? CORRUGATION.pitch)));
  const pitch = W / waves;
  let flat = p.flat ?? CORRUGATION.flat;
  let slope = p.slope ?? CORRUGATION.slope;
  // The inner flat is what is left; it cannot be negative.
  const sum = flat * 2 + slope * 2;
  if (sum > 1) {
    flat /= sum;
    slope /= sum;
  }
  // Break points of one wave as [u offset, w]: outer flat, slope down, inner flat, slope up.
  const one: [number, number][] = [
    [0, D / 2],
    [flat, D / 2],
    [flat + slope, -D / 2],
    [1 - slope, -D / 2]
  ];
  const us: [number, number][] = [];
  for (let k = 0; k < waves; k++) for (const [f, w] of one) us.push([-W / 2 + (k + f) * pitch, w]);
  us.push([W / 2, D / 2]);
  const s = new Soup();
  for (let i = 0; i + 1 < us.length; i++) {
    const [ua, wa] = us[i]!;
    const [ub, wb] = us[i + 1]!;
    if (ub - ua < 1e-9 && wa === wb) continue;
    s.quad([ua, -H / 2, wa], [ub, -H / 2, wb], [ub, H / 2, wb], [ua, H / 2, wa], [0, 0, 1]);
  }
  return mapAxis(s.geometry(), p.axis ?? "z");
}

// ── panel ─────────────────────────────────────────────────────

type Rect = [number, number, number, number]; // x0, y0, x1, y1

/**
 * A box whose front face (+z) carries relief: a grid of raised or sunk panels, vertical ribs, or
 * louvre slats. The body is the chamfered box of `bevel`; its flat front face is replaced by
 * the relief. The frame around the relief is split only along the relief's own edges.
 */
export function panelGeometry(p: Part, bevel: number): THREE.BufferGeometry {
  const [X, Y, Z] = p.size!;
  const z0 = Z / 2;
  const raw = bevel > 1e-4 ? new RoundedBoxGeometry(X, Y, Z, 1, bevel) : new THREE.BoxGeometry(X, Y, Z);
  // RoundedBoxGeometry is already non-indexed; BoxGeometry is not.
  const body = raw.index ? raw.toNonIndexed() : raw;
  if (body !== raw) raw.dispose();
  const bp = body.attributes.position as THREE.BufferAttribute;
  const bn = body.attributes.normal as THREE.BufferAttribute;
  const s = new Soup();
  // Keep the body except the flat center of the front face (all three vertices on it).
  for (let i = 0; i < bp.count; i += 3) {
    let front = true;
    for (let k = 0; k < 3; k++) if (bp.getZ(i + k) < z0 - 1e-6 || bn.getZ(i + k) < 0.999) front = false;
    if (front) continue;
    for (let k = 0; k < 3; k++) {
      s.pos.push(bp.getX(i + k), bp.getY(i + k), bp.getZ(i + k));
      s.nrm.push(bn.getX(i + k), bn.getY(i + k), bn.getZ(i + k));
    }
  }
  body.dispose();

  const b = bevel > 1e-4 ? Math.min(bevel, X / 2, Y / 2, Z / 2) : 0;
  const face: Rect = [-X / 2 + b, -Y / 2 + b, X / 2 - b, Y / 2 - b];
  // The relief keeps a margin off the chamfer, so the chamfer stays a clean frame.
  const margin = Math.min(Math.max(p.inset ?? Math.min(X, Y) * 0.1, b + 0.002), Math.min(X, Y) * 0.45);
  const inner: Rect = [-X / 2 + margin, -Y / 2 + margin, X / 2 - margin, Y / 2 - margin];
  const iw = inner[2] - inner[0];
  const ih = inner[3] - inner[1];

  const cells: Rect[] = [];
  let louvre: Rect | null = null;
  let relief = p.relief ?? 0.012;
  if (p.louvres) louvre = inner;
  else if (p.ribs) {
    relief = p.relief ?? 0.015;
    const pitch = iw / p.ribs;
    for (let i = 0; i < p.ribs; i++) {
      const c = inner[0] + (i + 0.5) * pitch;
      cells.push([c - pitch * 0.25, inner[1], c + pitch * 0.25, inner[3]]);
    }
  } else {
    const cols = p.cols ?? 1;
    const rows = p.rows ?? 1;
    // The stiles between panels are as wide as the margin, but never wider than the panels.
    const gap = Math.min(margin, (iw / cols) * 0.5, (ih / rows) * 0.5);
    const cw = (iw - gap * (cols - 1)) / cols;
    const ch = (ih - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x0 = inner[0] + c * (cw + gap);
        const y0 = inner[1] + r * (ch + gap);
        cells.push([x0, y0, x0 + cw, y0 + ch]);
      }
  }
  const fields = Math.abs(relief) < 1e-5 ? [] : cells;
  const holes = louvre ? [louvre] : fields;

  // Flat frame: a grid on the face split at the relief edges; the cells of the relief are left out.
  const xs = [...new Set([face[0], face[2], ...holes.flatMap((r) => [r[0], r[2]])])].sort((a, c) => a - c);
  const ys = [...new Set([face[1], face[3], ...holes.flatMap((r) => [r[1], r[3]])])].sort((a, c) => a - c);
  const FWD: V3 = [0, 0, 1];
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (holes.some((r) => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3])) continue;
      s.quad([xs[i]!, ys[j]!, z0], [xs[i + 1]!, ys[j]!, z0], [xs[i + 1]!, ys[j + 1]!, z0], [xs[i]!, ys[j + 1]!, z0], FWD);
    }

  // Raised or sunk fields: a frustum with 45 degree sides (or less, on a small cell).
  for (const [x0, y0, x1, y1] of fields) {
    const sl = Math.max(1e-4, Math.min(Math.abs(relief), (x1 - x0) * 0.25, (y1 - y0) * 0.25));
    const zt = z0 + relief;
    const o: V3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
    const t: V3[] = [[x0 + sl, y0 + sl, zt], [x1 - sl, y0 + sl, zt], [x1 - sl, y1 - sl, zt], [x0 + sl, y1 - sl, zt]];
    // With a slope wider than zero, every face of the field has a +z part, raised or sunk.
    s.quad(t[0]!, t[1]!, t[2]!, t[3]!, FWD);
    for (let k = 0; k < 4; k++) s.quad(o[k]!, o[(k + 1) % 4]!, t[(k + 1) % 4]!, t[k]!, FWD);
  }

  // Louvres: a sawtooth of slats. Each slat leans back by `tilt` from the face, then a riser
  // under the next slat's lip steps back out to the face. Side walls close the ends.
  if (louvre && p.louvres) {
    const [x0, y0, x1, y1] = louvre;
    const pitch = (y1 - y0) / p.louvres;
    const drop = Math.min(pitch * Math.tan((p.tilt ?? 40) * (Math.PI / 180)), Z * 0.8);
    for (let i = 0; i < p.louvres; i++) {
      const ya = y0 + i * pitch;
      const yb = ya + pitch;
      const zb = z0 - drop;
      s.quad([x0, ya, z0], [x1, ya, z0], [x1, yb, zb], [x0, yb, zb], FWD);
      s.quad([x0, yb, zb], [x1, yb, zb], [x1, yb, z0], [x0, yb, z0], [0, -1, 0]);
      s.tri([x0, ya, z0], [x0, yb, z0], [x0, yb, zb]);
      s.tri([x1, ya, z0], [x1, yb, zb], [x1, yb, z0]);
    }
  }
  return s.geometry();
}

// ── rounded ───────────────────────────────────────────────────

/** Corner radius of a rounded part: the spec's, else 12% of the thinnest side; 1% at least. */
export function roundedRadius(p: Part): number {
  const m = Math.min(...p.size!);
  return Math.max(m * 0.01, Math.min(p.radius ?? m * 0.12, m / 2));
}

/**
 * A box with every edge rounded by `radius`, smooth normals. Each face is a grid that is pushed
 * onto the rounded surface (the vertex moves to the inner box plus radius x its direction).
 * The corner samples are spaced for even angles: each 90 degree edge gets 2 segments, or 4 when
 * the radius is 10 cm or more, where 2 facets show in the silhouette. (This construction always
 * puts a vertex at 45 degrees, so the count is even.) With `dish` the top face gets six inner
 * rows and columns and a cosine dip that meets the flat rim with zero slope.
 */
export function roundedGeometry(p: Part): THREE.BufferGeometry {
  const size = p.size!;
  const r = roundedRadius(p);
  const half: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const inner: V3 = [half[0] - r, half[1] - r, half[2] - r];
  const k = r >= 0.1 ? 2 : 1;
  const dish = p.dish ?? 0;
  const coords = (a: number): number[] => {
    const out: number[] = [];
    const h = half[a]!;
    const c = inner[a]!;
    if (r < 1e-5) return [-h, h];
    for (let j = k; j >= 1; j--) out.push(-c - r * Math.tan((Math.PI / 4) * (j / k)));
    out.push(-c);
    if (dish > 0 && a !== 1) for (let j = 1; j < 7; j++) out.push(-c + (2 * c * j) / 7);
    out.push(c);
    for (let j = 1; j <= k; j++) out.push(c + r * Math.tan((Math.PI / 4) * (j / k)));
    // A radius of half the side leaves no flat: the two inner coordinates are the same.
    return out.filter((x, i) => i === 0 || x - out[i - 1]! > 1e-7);
  };
  const axes = [coords(0), coords(1), coords(2)];
  const push = (q: V3): { p: V3; n: V3 } => {
    const ci: V3 = [0, 0, 0];
    const d: V3 = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      ci[a] = Math.max(-inner[a]!, Math.min(inner[a]!, q[a]!));
      d[a] = q[a]! - ci[a]!;
    }
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    const n: V3 = [d[0] / l, d[1] / l, d[2] / l];
    const pos: V3 = r < 1e-5 ? [q[0], q[1], q[2]] : [ci[0] + n[0] * r, ci[1] + n[1] * r, ci[2] + n[2] * r];
    // The dish: only on the flat of the top face.
    if (dish > 0 && n[1] > 0.9999 && inner[0] > 0 && inner[2] > 0) {
      const tx = pos[0] / inner[0];
      const tz = pos[2] / inner[2];
      if (Math.abs(tx) < 1 && Math.abs(tz) < 1) {
        const cx = 0.5 + 0.5 * Math.cos(Math.PI * tx);
        const cz = 0.5 + 0.5 * Math.cos(Math.PI * tz);
        pos[1] -= dish * cx * cz;
        // Normal of y = top - dip(x, z): (d dip/dx, 1, d dip/dz), normalized.
        const gx = dish * cz * (-0.5 * Math.PI * Math.sin(Math.PI * tx)) / inner[0];
        const gz = dish * cx * (-0.5 * Math.PI * Math.sin(Math.PI * tz)) / inner[2];
        const gl = Math.hypot(gx, 1, gz);
        return { p: pos, n: [gx / gl, 1 / gl, gz / gl] };
      }
    }
    return { p: pos, n };
  };
  const s = new Soup();
  for (let a = 0; a < 3; a++)
    for (const sign of [-1, 1]) {
      const b = (a + 1) % 3;
      const c = (a + 2) % 3;
      const A = axes[b]!;
      const B = axes[c]!;
      const pt = (i: number, j: number): V3 => {
        const q: V3 = [0, 0, 0];
        q[a] = sign * half[a]!;
        q[b] = A[i]!;
        q[c] = B[j]!;
        return q;
      };
      // (b x c) = +a, so the order (i,j) (i+1,j) (i+1,j+1) faces +a; flip it for the -a face.
      for (let i = 0; i + 1 < A.length; i++)
        for (let j = 0; j + 1 < B.length; j++) {
          const q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)].map(push);
          const order = sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
          for (let t = 0; t < 6; t += 3) {
            const [x, y, z] = [q[order[t]!]!, q[order[t + 1]!]!, q[order[t + 2]!]!];
            s.tri(x.p, y.p, z.p, x.n, y.n, z.n);
          }
        }
    }
  return s.geometry();
}

// ── lathe ─────────────────────────────────────────────────────

/**
 * A lathe (profile [radius, along] turned about +Y) with `sides` segments. Two equal consecutive
 * profile points make a hard edge: the bands on each side keep their own normals there. The
 * points that code adds on the axis to close the ends are hard edges too. Elsewhere the normal
 * is the mean of the two bands (used only when the part is smooth; flat parts get face normals).
 */
export function latheGeometry(profile: [number, number][], sides: number): THREE.BufferGeometry {
  let prof = profile.slice();
  if (prof[0]![1] > prof[prof.length - 1]![1]) prof = prof.reverse();
  const pts: { r: number; y: number; hard: boolean }[] = [];
  for (const [r0, y] of prof) {
    const r = Math.max(0, r0);
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev.r - r) < 1e-7 && Math.abs(prev.y - y) < 1e-7) prev.hard = true;
    else pts.push({ r, y, hard: false });
  }
  if (pts[0]!.r > 1e-4) {
    pts[0]!.hard = true;
    pts.unshift({ r: 0, y: pts[0]!.y, hard: false });
  }
  if (pts[pts.length - 1]!.r > 1e-4) {
    pts[pts.length - 1]!.hard = true;
    pts.push({ r: 0, y: pts[pts.length - 1]!.y, hard: false });
  }
  // 2D normal (dr, dy) of each band: (dy, -dr) points out for a profile that rises.
  const band = pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1]!;
    const dr = b.r - a.r;
    const dy = b.y - a.y;
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l] as [number, number];
  });
  const normalAt = (i: number, seg: number): [number, number] => {
    const own = band[seg]!;
    const other = seg === i ? band[i - 1] : band[i];
    if (!other || pts[i]!.hard) return own;
    const x = own[0] + other[0];
    const y = own[1] + other[1];
    const l = Math.hypot(x, y);
    return l > 1e-6 ? [x / l, y / l] : own;
  };
  const s = new Soup();
  const n = Math.max(3, sides);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const na = normalAt(i, i);
    const nb = normalAt(i + 1, i);
    for (let j = 0; j < n; j++) {
      const f0 = (j / n) * Math.PI * 2;
      const f1 = ((j + 1) / n) * Math.PI * 2;
      const P = (r: number, y: number, f: number): V3 => [r * Math.sin(f), y, r * Math.cos(f)];
      const N = (q: [number, number], f: number): V3 => [q[0] * Math.sin(f), q[1], q[0] * Math.cos(f)];
      const A0 = P(a.r, a.y, f0), A1 = P(a.r, a.y, f1), B0 = P(b.r, b.y, f0), B1 = P(b.r, b.y, f1);
      // On the axis two of the four corners meet: one triangle is enough.
      if (a.r > 1e-7) s.tri(A0, A1, B0, N(na, f0), N(na, f1), N(nb, f0));
      if (b.r > 1e-7) s.tri(B0, A1, B1, N(nb, f0), N(na, f1), N(nb, f1));
    }
  }
  return s.geometry();
}
