// Parametric library entries: roads. Each entry builds its object from opts.params (the node's
// metadata.params), so one entry can be a river of any shape or an object of any parts list.
//
// City pieces for the city generator (src/lib/generators/city/), in the low-poly look of the
// Kenney city kits (flat colors from the kit's cool grey palette, no textures):
// - gen:city-street: one street. Asphalt with lighter worn lanes, dashed center line, solid edge
//   lines, zebra crossings and stop lines, raised sidewalks with a beveled curb, rounded curb
//   corners at the intersections it owns, an optional planted median and parking bays.
// - gen:city-ground: the slab under the city: block lots, park lawn and paths, grass verge.
// - gen:street-lamp: a street lamp with one or two arms.
// One street is one node: few nodes, and the build reveal shows the network street by street.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ASPHALT_Y, CURB_Y, GROUND_ENTRY_ID, LAMP_ENTRY_ID, MARKING_Y, STREET_ENTRY_ID } from "@/lib/generators/city/ids";
import type { ResourceEntry, ResourceInstance } from "../types";

// ── Palette (sits with the Kenney city colormap: cool greys, white, warm yellow) ──

const C = {
  asphalt: new THREE.Color("#464a57"),
  asphaltWorn: new THREE.Color("#53576a"),
  sidewalk: new THREE.Color("#c4c7d3"),
  curb: new THREE.Color("#e3e5ec"),
  curbSide: new THREE.Color("#a9adbd"),
  white: new THREE.Color("#eef0f5"),
  yellow: new THREE.Color("#f2c14e"),
  median: new THREE.Color("#63ad78"),
  lot: new THREE.Color("#d3d5de"),
  lotIndustrial: new THREE.Color("#cbc6bc"),
  lawn: new THREE.Color("#6ab47d"),
  path: new THREE.Color("#e2d6bd"),
  verge: new THREE.Color("#78b585"),
  plinth: new THREE.Color("#8e8a80"),
  lampBody: new THREE.Color("#4d5060"),
  lampGlow: new THREE.Color("#ffe3a6")
};

// ── Mesh builder ──────────────────────────────────────────────

type V2 = [number, number];
type V3 = [number, number, number];

class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  /** One triangle; the winding is fixed so its normal points along want. */
  tri(a: V3, b: V3, c: V3, color: THREE.Color, want: V3) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) {
      [b, c] = [c, b];
      n = [-n[0], -n[1], -n[2]];
    }
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color, want: V3) {
    this.tri(a, b, c, color, want);
    this.tri(a, c, d, color, want);
  }

  /** Flat horizontal rectangle at height y (x0..x1, z0..z1). */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.Color) {
    if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color, [0, 1, 0]);
  }

  /** Horizontal polygon at height y. */
  polygon(points: V2[], y: number, color: THREE.Color) {
    if (points.length < 3) return;
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [i, j, k] of tris) this.tri([points[i][0], y, points[i][1]], [points[j][0], y, points[j][1]], [points[k][0], y, points[k][1]], color, [0, 1, 0]);
  }

  /** Axis-aligned box: top and four sides (no bottom). */
  box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, top: THREE.Color, side: THREE.Color) {
    this.rect(x0, z0, x1, z1, y1, top);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], side, [0, 0, -1]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side, [0, 0, 1]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side, [-1, 0, 0]);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], side, [1, 0, 0]);
  }

  /**
   * Curb along a polyline: vertical face, a 45 degree bevel, then a flat top band. inside is a
   * point on the sidewalk side.
   */
  curb(line: V2[], inside: V2, closed = false) {
    if (line.length < 2) return;
    const pts = closed ? [...line, line[0]] : line;
    // Side: + when inside lies left of the first segment.
    const [p0, p1] = [pts[0], pts[1]];
    const cross = (p1[0] - p0[0]) * (inside[1] - p0[1]) - (p1[1] - p0[1]) * (inside[0] - p0[0]);
    const side = cross >= 0 ? 1 : -1;
    // Offset direction toward the sidewalk at each vertex (mitered).
    const segN = (a: V2, b: V2): V2 => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      // Left normal of (dx, dz) in the x-z plane, as the cross test above defines "left".
      return [(-dz / l) * side, (dx / l) * side];
    };
    const normals: V2[] = pts.map((_, k) => {
      const prev = k > 0 ? segN(pts[k - 1], pts[k]) : closed ? segN(pts[pts.length - 2], pts[0]) : null;
      const next = k < pts.length - 1 ? segN(pts[k], pts[k + 1]) : closed ? segN(pts[0], pts[1]) : null;
      const a = prev ?? next!;
      const b = next ?? prev!;
      let nx = a[0] + b[0];
      let nz = a[1] + b[1];
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      const cos = Math.max(0.35, nx * a[0] + nz * a[1]);
      return [nx / cos, nz / cos];
    });
    const top = CURB_Y + 0.008;
    const profile: { o: number; y: number }[] = [
      { o: 0, y: ASPHALT_Y - 0.005 },
      { o: 0, y: CURB_Y - 0.035 },
      { o: 0.04, y: top },
      { o: 0.22, y: top }
    ];
    const colors = [C.curbSide, C.curb, C.curb];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [a, b] = [pts[k], pts[k + 1]];
      const [na, nb] = [normals[k], normals[k + 1]];
      const sn = segN(a, b);
      for (let q = 0; q + 1 < profile.length; q++) {
        const [s, t] = [profile[q], profile[q + 1]];
        const P = (p: V2, n: V2, pr: { o: number; y: number }): V3 => [p[0] + n[0] * pr.o, pr.y, p[1] + n[1] * pr.o];
        // Profile normal: toward the road (-sn) and up.
        const dO = t.o - s.o;
        const dY = t.y - s.y;
        const want: V3 = [-sn[0] * dY, dO, -sn[1] * dY];
        this.quad(P(a, na, s), P(b, nb, s), P(b, nb, t), P(a, na, t), colors[q], want);
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  get empty() {
    return this.pos.length === 0;
  }
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, segments = 8): V2[] {
  const out: V2[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = a0 + ((a1 - a0) * k) / segments;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

// ── Materials (shared by all city pieces) ─────────────────────

let mats: { base: THREE.MeshStandardMaterial; marks: THREE.MeshStandardMaterial; lamp: THREE.MeshStandardMaterial; glow: THREE.MeshStandardMaterial } | null = null;
function materials() {
  mats ??= {
    base: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
    marks: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    lamp: new THREE.MeshStandardMaterial({ color: C.lampBody, roughness: 0.55, metalness: 0.35 }),
    glow: new THREE.MeshStandardMaterial({ color: C.lampGlow, emissive: C.lampGlow, emissiveIntensity: 1.6, roughness: 0.4 })
  };
  return mats;
}

function meshGroup(parts: { builder: MeshBuilder; material: THREE.Material; shadow: boolean }[]): ResourceInstance {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    if (p.builder.empty) continue;
    const g = p.builder.geometry();
    geometries.push(g);
    const mesh = new THREE.Mesh(g, p.material);
    mesh.receiveShadow = true;
    mesh.castShadow = p.shadow;
    group.add(mesh);
  }
  return { object: group, dispose: () => geometries.forEach((g) => g.dispose()) };
}

// ── Params ────────────────────────────────────────────────────

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

type CrossingParams = { at: number; row: number; carriage: number; owned: boolean; arms: [boolean, boolean, boolean, boolean] };
type StreetParams = { len: number; carriage: number; sidewalk: number; median: number; parking: number; crossings: CrossingParams[] };

function readStreet(params: Record<string, unknown> | undefined): StreetParams {
  const p = params ?? {};
  const len = Math.max(4, num(p.len, 40));
  const crossings = Array.isArray(p.crossings)
    ? (p.crossings as Record<string, unknown>[]).map((c) => ({
        at: num(c.at, 0),
        row: Math.max(1, num(c.row, 13)),
        carriage: Math.max(1, num(c.carriage, 7)),
        owned: c.owned === true,
        arms: (Array.isArray(c.arms) && c.arms.length === 4 ? c.arms.map((a) => a === true) : [true, true, true, true]) as [boolean, boolean, boolean, boolean]
      }))
    : [];
  return {
    len,
    carriage: Math.max(3, num(p.carriage, 7)),
    sidewalk: Math.max(0.5, num(p.sidewalk, 3)),
    median: Math.max(0, num(p.median, 0)),
    parking: Math.max(0, num(p.parking, 0)),
    crossings: crossings.sort((a, b) => a.at - b.at)
  };
}

// ── Street ────────────────────────────────────────────────────

/** Street in its node frame: u = local x along the street, v = local z across. */
function buildStreet(p: StreetParams): ResourceInstance {
  const base = new MeshBuilder();
  const marks = new MeshBuilder();
  const hc = p.carriage / 2;
  const hr = hc + p.sidewalk;
  const m = p.median / 2;
  const L = p.len / 2;
  const my = MARKING_Y;
  const zones: [number, number][] = p.crossings.map((c) => [c.at - c.row / 2, c.at + c.row / 2]);
  if (zones.length === 0) zones.push([-L, -L], [L, L]);
  const segments: [number, number][] = [];
  for (let k = 0; k + 1 < zones.length; k++) if (zones[k + 1][0] - zones[k][1] > 0.5) segments.push([zones[k][1], zones[k + 1][0]]);

  // Asphalt band across one lane group: darker at the edges, a lighter worn strip in the middle.
  const band = (u0: number, u1: number, v0: number, v1: number, worn: boolean) => {
    const lo = Math.min(v0, v1);
    const hi = Math.max(v0, v1);
    if (!worn) return base.rect(u0, lo, u1, hi, ASPHALT_Y, C.asphalt);
    const e = (hi - lo) * 0.3;
    base.rect(u0, lo, u1, lo + e, ASPHALT_Y, C.asphalt);
    base.rect(u0, lo + e, u1, hi - e, ASPHALT_Y, C.asphaltWorn);
    base.rect(u0, hi - e, u1, hi, ASPHALT_Y, C.asphalt);
  };

  for (const [a, b] of segments) {
    // Carriageway (and asphalt under the median, which stops before the crossings).
    if (m > 0) band(a, b, -m, m, false);
    for (const s of [-1, 1]) {
      const inner = s * m;
      const outer = s * hc;
      if (p.parking > 0) {
        band(a, b, s * (hc - p.parking), outer, false);
        band(a, b, inner, s * (hc - p.parking), true);
      } else band(a, b, inner, outer, true);
    }
    // Sidewalks with curbs.
    for (const s of [-1, 1]) {
      base.rect(a, Math.min(s * hc, s * hr), b, Math.max(s * hc, s * hr), CURB_Y, C.sidewalk);
      base.curb([[a, s * hc], [b, s * hc]], [(a + b) / 2, s * hr]);
    }
    // Median island with rounded ends.
    const mStart = a + 4.6;
    const mEnd = b - 4.6;
    if (m > 0 && mEnd - mStart > 2 * m + 1) {
      const outline: V2[] = [...arc(mEnd - m, 0, m, -Math.PI / 2, Math.PI / 2, 8), ...arc(mStart + m, 0, m, Math.PI / 2, (3 * Math.PI) / 2, 8)];
      base.polygon(outline, CURB_Y, C.median);
      base.curb(outline, [(mStart + mEnd) / 2, 0], true);
    }

    // Markings.
    const l0 = a + 4.5;
    const l1 = b - 4.5;
    // Zebra crossings at both ends, stripes along the street.
    for (const [z0, z1] of [
      [a + 0.6, a + 3.6],
      [b - 3.6, b - 0.6]
    ]) {
      for (let v = -hc + 0.45; v + 0.5 <= hc - 0.4; v += 1.05) {
        if (m > 0 && v + 0.5 > -m - 0.1 && v < m + 0.1) continue;
        marks.rect(z0, v, z1, v + 0.5, my, C.white);
      }
    }
    // Stop lines (right-hand traffic: +u traffic on +v stops at b, -u traffic on -v stops at a).
    marks.rect(a + 4.0, -hc + 0.3, a + 4.35, -Math.max(m, 0.12), my, C.white);
    marks.rect(b - 4.35, Math.max(m, 0.12), b - 4.0, hc - 0.3, my, C.white);
    if (l1 - l0 > 1) {
      if (m === 0) {
        // Dashed center line.
        for (let u = l0; u < l1; u += 6) marks.rect(u, -0.08, Math.min(u + 3, l1), 0.08, my, C.yellow);
      } else {
        for (const s of [-1, 1]) {
          const v = s * (m + 0.3);
          marks.rect(l0, Math.min(v, v + s * 0.12), l1, Math.max(v, v + s * 0.12), my, C.white);
        }
      }
      for (const s of [-1, 1]) {
        if (p.parking > 0) {
          // Parking lane line and bay ticks.
          const v = s * (hc - p.parking);
          marks.rect(l0, Math.min(v, v + s * 0.12), l1, Math.max(v, v + s * 0.12), my, C.white);
          const bays = Math.floor((l1 - l0) / 5.6);
          const start = (l0 + l1) / 2 - (bays * 5.6) / 2;
          for (let k = 0; k <= bays; k++) {
            const u = start + k * 5.6;
            marks.rect(u - 0.06, Math.min(v, s * (hc - 0.15)), u + 0.06, Math.max(v, s * (hc - 0.15)), my, C.white);
          }
        } else {
          const v = s * (hc - 0.35);
          marks.rect(l0, Math.min(v, v - s * 0.12), l1, Math.max(v, v - s * 0.12), my, C.white);
        }
      }
    }
  }

  // Intersections this street owns: asphalt square and the four corners.
  for (const c of p.crossings) {
    if (!c.owned) continue;
    const hu = c.row / 2;
    const cu = c.carriage / 2;
    const crossWalk = hu - cu;
    base.rect(c.at - hu, -hr, c.at + hu, hr, ASPHALT_Y, C.asphalt);
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) {
        const armU = su < 0 ? c.arms[0] : c.arms[1];
        const armV = sv < 0 ? c.arms[2] : c.arms[3];
        const map = (pt: V2): V2 => [c.at + su * pt[0], sv * pt[1]];
        let poly: V2[];
        let curbLine: V2[];
        let inside: V2;
        if (armU && armV) {
          const r = Math.max(0.6, Math.min(1.8, p.sidewalk * 0.6, crossWalk * 0.6));
          const fillet = arc(cu + r, hc + r, r, (3 * Math.PI) / 2, Math.PI, 6);
          poly = [[hu, hc], [hu, hr], [cu, hr], ...[...fillet].reverse()];
          curbLine = [[hu, hc], ...fillet, [cu, hr]];
          inside = [hu - 0.01, hr - 0.01];
        } else if (armU) {
          poly = [[0, hc], [hu, hc], [hu, hr], [0, hr]];
          curbLine = [[0, hc], [hu, hc]];
          inside = [hu / 2, hr];
        } else if (armV) {
          poly = [[cu, 0], [hu, 0], [hu, hr], [cu, hr]];
          curbLine = [[cu, 0], [cu, hr]];
          inside = [hu, hr / 2];
        } else {
          const rt = Math.min(cu, hc) * 0.95;
          const corner = arc(cu - rt, hc - rt, rt, Math.PI / 2, 0, 8);
          poly = [[0, hc], ...corner, [cu, 0], [hu, 0], [hu, hr], [0, hr]];
          curbLine = [[0, hc], ...corner, [cu, 0]];
          inside = [hu, hr];
        }
        base.polygon(poly.map(map), CURB_Y, C.sidewalk);
        base.curb(curbLine.map(map), map(inside));
      }
  }

  return meshGroup([
    { builder: base, material: materials().base, shadow: false },
    { builder: marks, material: materials().marks, shadow: false }
  ]);
}

// ── Ground ────────────────────────────────────────────────────

type GroundParams = {
  rect: [number, number, number, number];
  streets: [number, number, number, number];
  /** x0, z0, x1, z1, kind (0 lot, 1 park, 2 industrial lot, 3 paved plaza), optional radius of the round center plaza. */
  lots: number[][];
  plaza: [number, number, number] | null;
  path: number;
  thickness: number;
};

function readGround(params: Record<string, unknown> | undefined): GroundParams {
  const p = params ?? {};
  const quad = (v: unknown, fallback: [number, number, number, number]) =>
    Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number") ? (v as [number, number, number, number]) : fallback;
  const rect = quad(p.rect, [-20, -20, 20, 20]);
  return {
    rect,
    streets: quad(p.streets, rect),
    lots: Array.isArray(p.lots)
      ? (p.lots as unknown[]).filter((l): l is number[] => Array.isArray(l) && (l.length === 5 || l.length === 6) && l.every((n) => typeof n === "number"))
      : [],
    plaza: Array.isArray(p.plaza) && p.plaza.length === 3 ? (p.plaza as [number, number, number]) : null,
    path: num(p.path, 3),
    thickness: Math.max(0.2, num(p.thickness, 0.4))
  };
}

function buildGround(p: GroundParams): ResourceInstance {
  const base = new MeshBuilder();
  const marks = new MeshBuilder();
  const [x0, z0, x1, z1] = p.rect;
  const [sx0, sz0, sx1, sz1] = p.streets;
  const bottom = -p.thickness;
  // Slab under the streets (hidden by the asphalt) and its plinth sides.
  base.box(x0, z0, x1, z1, bottom, 0, C.asphalt, C.plinth);
  // Grass verge around the street grid, up to the sidewalk height.
  base.box(x0, z0, x1, sz0, bottom, CURB_Y, C.verge, C.plinth);
  base.box(x0, sz1, x1, z1, bottom, CURB_Y, C.verge, C.plinth);
  base.box(x0, sz0, sx0, sz1, bottom, CURB_Y, C.verge, C.plinth);
  base.box(sx1, sz0, x1, sz1, bottom, CURB_Y, C.verge, C.plinth);
  for (const [lx0, lz0, lx1, lz1, kind, plazaR] of p.lots) {
    const top = kind === 1 ? C.lawn : kind === 2 ? C.lotIndustrial : kind === 3 ? C.path : C.lot;
    base.box(lx0, lz0, lx1, lz1, 0, CURB_Y, top, C.curbSide);
    if (kind === 1) {
      // Park: cross paths from each edge to a round plaza.
      const cx = (lx0 + lx1) / 2;
      const cz = (lz0 + lz1) / 2;
      const h = p.path / 2;
      const y = CURB_Y + 0.004;
      marks.rect(lx0, cz - h, lx1, cz + h, y, C.path);
      marks.rect(cx - h, lz0, cx + h, cz - h, y, C.path);
      marks.rect(cx - h, cz + h, cx + h, lz1, y, C.path);
      // The round plaza: from the lot's own radius, else the older single plaza param.
      const circle: [number, number, number] | null = plazaR !== undefined ? [cx, cz, plazaR] : p.plaza;
      if (circle) marks.polygon(arc(circle[0], circle[1], circle[2], 0, Math.PI * 2, 28).slice(0, 28), y + 0.002, C.path);
    }
  }
  return meshGroup([
    { builder: base, material: materials().base, shadow: false },
    { builder: marks, material: materials().marks, shadow: false }
  ]);
}

// ── Street lamp ───────────────────────────────────────────────

const lampGeometry: Record<string, { body: THREE.BufferGeometry; glow: THREE.BufferGeometry }> = {};

/** A lamp 6 m tall; the arm reaches over the street along local -z (and +z when double). */
function lampParts(double: boolean) {
  const key = double ? "double" : "single";
  if (lampGeometry[key]) return lampGeometry[key];
  const body: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    list.push(g.index ? g.toNonIndexed() : g);
  };
  add(body, new THREE.CylinderGeometry(0.15, 0.19, 0.5, 8), 0, 0.25, 0);
  add(body, new THREE.CylinderGeometry(0.06, 0.08, 5.6, 8), 0, 0.5 + 2.8, 0);
  add(body, new THREE.SphereGeometry(0.09, 8, 6), 0, 6.1, 0);
  for (const s of double ? [-1, 1] : [-1]) {
    add(body, new THREE.BoxGeometry(0.08, 0.08, 1.35), 0, 5.95, s * 0.68);
    add(body, new THREE.BoxGeometry(0.36, 0.14, 0.8), 0, 5.92, s * 1.45);
    add(glow, new THREE.BoxGeometry(0.28, 0.03, 0.66), 0, 5.84, s * 1.45);
  }
  const merged = { body: mergeGeometries(body)!, glow: mergeGeometries(glow)! };
  body.forEach((g) => g.dispose());
  glow.forEach((g) => g.dispose());
  lampGeometry[key] = merged;
  return merged;
}

function buildLamp(double: boolean): ResourceInstance {
  const parts = lampParts(double);
  const group = new THREE.Group();
  const body = new THREE.Mesh(parts.body, materials().lamp);
  body.castShadow = true;
  body.receiveShadow = true;
  const glow = new THREE.Mesh(parts.glow, materials().glow);
  group.add(body, glow);
  // Geometry is shared by all lamps: nothing to dispose here.
  return { object: group };
}

// ── Entries ───────────────────────────────────────────────────

const CREDIT = { source: "local" as const, origin: "Theras", license: "MIT", category: "City: streets" };

export const ROADS_ENTRIES: ResourceEntry[] = [
  {
    id: STREET_ENTRY_ID,
    name: "City street",
    kind: "feature",
    ...CREDIT,
    tags: ["city", "street", "road", "asphalt", "sidewalk", "crosswalk", "avenue", "generated"],
    description:
      "A generated city street (asphalt, lane markings, zebra crossings, raised sidewalks with curbs, rounded corners). Built by the city generator from params; not for placing by hand.",
    footprint: 0,
    nameFor: () => "Street",
    create: (_seed, opts) => buildStreet(readStreet(opts?.params))
  },
  {
    id: GROUND_ENTRY_ID,
    name: "City ground",
    kind: "feature",
    ...CREDIT,
    tags: ["city", "ground", "slab", "plinth", "lot", "park", "generated"],
    description: "The ground slab under a generated city: paved lots, park lawn and paths, grass verge. Built by the city generator.",
    footprint: 0,
    create: (_seed, opts) => buildGround(readGround(opts?.params))
  },
  {
    id: LAMP_ENTRY_ID,
    name: "Street lamp",
    kind: "feature",
    ...CREDIT,
    tags: ["city", "street", "lamp", "light", "streetlight", "lantern", "urban", "modern"],
    description: "A modern street lamp, about 6 m tall, with an arm over the street (params.double = two arms, for a median).",
    footprint: 0.35,
    create: (_seed, opts) => buildLamp(opts?.params?.double === true)
  }
];
