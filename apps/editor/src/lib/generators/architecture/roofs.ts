// Roof builders: the curved hip skirt (with upturned eaves), the hip-and-gable top roof
// (irimoya), triangular dormer gables (chidori-hafu), curved gables (kara-hafu),
// the pyramid roof and the shachihoko ornament.
//
// Side frames: each roof side is built in a local frame (p = along the side, q = outward,
// y = up) and turned by s * 90 degrees about y. Side 0 faces +z, side 1 faces +x,
// side 2 faces -z, side 3 faces -x.
import * as THREE from "three";
import { bar, mix, poly, shade, surface, tube, type MeshBuilder, type RGB, type V3 } from "./mesh";

export const sideMatrix = (s: number) => new THREE.Matrix4().makeRotationY((s * Math.PI) / 2);

export type RoofColors = {
  roof: RGB;
  /** Underside of the eaves (plaster). */
  soffit: RGB;
  /** Front edge of the eaves below the tile ends. */
  fascia: RGB;
  /** Hip ridges and tile ends. */
  ridge: RGB;
};

export type SkirtSpec = {
  /** Half sizes (x, z) of the eave line before the corner flare. */
  outer: [number, number];
  /** Half sizes (x, z) of the top edge (where the roof meets the wall above, or a gable). */
  inner: [number, number];
  /** Height of the eave top at the middle of a side. */
  eaveY: number;
  /** Height from the eave to the top edge. */
  rise: number;
  /** Corners: extra reach outward (m) and extra lift (m). */
  cornerOut: number;
  cornerLift: number;
  /** Profile exponent: 1 = straight, 1.4..1.8 = flat at the eave and steep at the top (Japanese). */
  sag: number;
  /** Eave thickness. */
  thickness: number;
  /** Wall below the eave: the underside runs back to its top. */
  wall?: { half: [number, number]; y: number };
  colors: RoofColors;
  /** Segments along a side and up the slope. */
  nu: number;
  nt: number;
  /** Hip ridges on the 4 corner lines. */
  hips?: boolean;
};

const liftShape = (u: number) => 0.22 * u * u + 0.78 * Math.pow(Math.abs(u), 5);

/** Point of a skirt side in the side frame. u in -1..1 along the side, t in 0..1 from eave to top. */
export function skirtPoint(sp: SkirtSpec, s: number, u: number, t: number): V3 {
  const even = s % 2 === 0;
  const A = even ? sp.outer[0] : sp.outer[1];
  const O = even ? sp.outer[1] : sp.outer[0];
  const a = even ? sp.inner[0] : sp.inner[1];
  const o = even ? sp.inner[1] : sp.inner[0];
  const au = Math.abs(u);
  const c = sp.cornerOut;
  const po = u * (A + c * Math.pow(au, 3));
  const qo = O + c * Math.pow(au, 4);
  const p = po + (u * a - po) * t;
  const q = qo + (o - qo) * t;
  const y = sp.eaveY + sp.cornerLift * liftShape(u) * (1 - t) * (1 - t) + sp.rise * Math.pow(t, sp.sag);
  return [p, y, q];
}

/** Height of the skirt top surface at side-frame point (u, t). */
export function skirtY(sp: SkirtSpec, u: number, t: number) {
  return sp.eaveY + sp.cornerLift * liftShape(u) * (1 - t) * (1 - t) + sp.rise * Math.pow(t, sp.sag);
}

/** The curved roof skirt with eave thickness, tile-end band and plaster underside. */
export function skirt(b: MeshBuilder, sp: SkirtSpec) {
  const { roof, soffit, fascia, ridge } = sp.colors;
  const stripe = (i: number, j: number) => {
    const f = i % 2 === 0 ? 1 : 0.93;
    return shade(roof, f * (0.97 + 0.06 * (j / sp.nt)));
  };
  for (let s = 0; s < 4; s++) {
    b.with(sideMatrix(s), () => {
      // Top (tiles).
      surface(b, sp.nu, sp.nt, (uu, tt) => skirtPoint(sp, s, -1 + 2 * uu, tt), stripe);
      const eave = (uu: number, dy: number): V3 => {
        const p = skirtPoint(sp, s, -1 + 2 * uu, 0);
        return [p[0], p[1] + dy, p[2]];
      };
      const th = sp.thickness;
      // Eave edge: tile ends (upper band) and plaster fascia (lower band). Faces outward (+q).
      surface(b, sp.nu, 1, (uu, v) => eave(uu, -th * 0.45 * (1 - v)), () => shade(ridge, 0.9));
      surface(b, sp.nu, 1, (uu, v) => eave(uu, -th + th * 0.55 * v), () => fascia);
      // Underside: from the wall top out to the eave bottom. Faces down.
      if (sp.wall) {
        const even = s % 2 === 0;
        const wa = even ? sp.wall.half[0] : sp.wall.half[1];
        const wo = even ? sp.wall.half[1] : sp.wall.half[0];
        const wy = sp.wall.y;
        surface(
          b,
          sp.nu,
          1,
          (uu, v) => {
            const u = -1 + 2 * uu;
            const e = eave(uu, -th);
            const inner: V3 = [u * wa, wy, wo];
            return [inner[0] + (e[0] - inner[0]) * v, inner[1] + (e[1] - inner[1]) * v, inner[2] + (e[2] - inner[2]) * v];
          },
          (i) => shade(soffit, i % 2 === 0 ? 0.9 : 0.86)
        );
      }
      // Hip ridge on the corner at u = +1 (between this side and the next).
      if (sp.hips) {
        const pts: V3[] = [];
        const n = Math.max(4, sp.nt);
        for (let k = 0; k <= n; k++) {
          const t = (k / n) * 0.985;
          const p = skirtPoint(sp, s, 1, t);
          pts.push([p[0], p[1] + sp.thickness * 0.35, p[2]]);
        }
        bar(b, pts, sp.thickness * 0.38, sp.thickness * 0.35, ridge, [0, 1, 0]);
      }
    });
  }
}

export type GableTrim = { face: RGB; board: RGB; gold: RGB; lattice?: RGB };

/**
 * Triangular dormer gable (chidori-hafu) on skirt side s, centered at along-position p0 (m).
 * halfW = half width at the base, h = height of the triangle. Returns ornament builders
 * (gold) for the caller to place in the ornament stage.
 */
export function chidori(b: MeshBuilder, sp: SkirtSpec, s: number, p0: number, halfW: number, h: number, colors: RoofColors, trim: GableTrim): (() => void)[] {
  const even = s % 2 === 0;
  const A = even ? sp.outer[0] : sp.outer[1];
  const tf = 0.16;
  const u0 = p0 / A;
  const front = skirtPoint(sp, s, u0, tf);
  const yb = front[1];
  // Keep the dormer inside the roof: its ridge must end under the roof top.
  const maxH = sp.eaveY + sp.rise * 0.92 - yb;
  const H = Math.min(h, maxH);
  if (H <= 0.05) return [];
  const yp = yb + H;
  const tBack = Math.min(1, Math.pow(Math.max(0, (yp + sp.thickness - sp.eaveY) / sp.rise), 1 / sp.sag) + 0.04);
  const back = skirtPoint(sp, s, u0, tBack);
  const qf = front[2] + sp.thickness * 1.2; // front face a little outward of the slope
  const ov = sp.thickness * 1.6; // the dormer roof overhangs its face
  const qb = back[2];
  const we = halfW * 1.12;
  const th = sp.thickness * 0.8;
  const orn: (() => void)[] = [];
  b.with(sideMatrix(s), () => {
    // Face (vertical, faces +q).
    poly(b, [[p0 - halfW, yb - th, qf], [p0 + halfW, yb - th, qf], [p0, yp - th * 1.2, qf]], trim.face);
    if (trim.lattice) {
      // Lattice lines on the gable face (kitsune-goshi).
      for (let k = 1; k <= 3; k++) {
        const yy = yb + (H - th * 1.2) * (k / 4.2);
        const hw = halfW * (1 - (yy - yb + th) / (H)) * 0.92;
        if (hw > 0.02) bar(b, [[p0 - hw, yy, qf + 0.004], [p0 + hw, yy, qf + 0.004]], 0.006 + H * 0.01, 0.002, trim.lattice);
      }
    }
    // Two roof slopes. Right slope: from the ridge down to the right eave, front to back.
    const right = (uu: number, vv: number): V3 => [p0 + we * uu, yp - (H + th * 0.6) * uu, qf + ov - (qf + ov - qb) * vv];
    const left = (uu: number, vv: number): V3 => [p0 - we * uu, yp - (H + th * 0.6) * uu, qf + ov - (qf + ov - qb) * (1 - vv)];
    surface(b, 3, 2, right, (i) => shade(colors.roof, i % 2 ? 0.92 : 1));
    surface(b, 3, 2, left, (i) => shade(colors.roof, i % 2 ? 0.92 : 1));
    // Undersides (seen from below at the front overhang).
    const down = (f: (u: number, v: number) => V3) => (uu: number, vv: number): V3 => {
      const p = f(uu, 1 - vv);
      return [p[0], p[1] - th * 0.5, p[2]];
    };
    surface(b, 1, 1, down(right), () => colors.soffit);
    surface(b, 1, 1, down(left), () => colors.soffit);
    // Bargeboards along the front edges (white or wood), and a ridge cap.
    bar(b, [[p0, yp - th * 0.1, qf + ov * 0.75], [p0 + we, yp - H - th * 0.75, qf + ov * 0.75]], th * 0.4, th * 0.6, trim.board);
    bar(b, [[p0, yp - th * 0.1, qf + ov * 0.75], [p0 - we, yp - H - th * 0.75, qf + ov * 0.75]], th * 0.4, th * 0.6, trim.board);
    bar(b, [[p0, yp + th * 0.25, qf + ov], [p0, yp + th * 0.25, qb]], th * 0.5, th * 0.45, colors.ridge);
  });
  orn.push(() =>
    b.with(sideMatrix(s), () =>
      b.withMat("gold", () => {
        // Gegyo: the hanging gold ornament under the apex, and gold tips on the bargeboards.
        gegyo(b, [p0, yp - th * 0.8, qf + ov * 0.6 + th * 0.6], H * 0.2, trim.gold);
        for (const sx of [-1, 1]) {
          const tip: V3 = [p0 + sx * we * 0.97, yp - H * 0.97 - th * 0.4, qf + ov * 0.6 + th * 0.5];
          poly(b, [[tip[0] - th, tip[1] - th, tip[2]], [tip[0] + th, tip[1] - th, tip[2]], [tip[0] + th, tip[1] + th, tip[2]], [tip[0] - th, tip[1] + th, tip[2]]], trim.gold);
        }
      })
    )
  );
  return orn;
}

/** Bell curve of the kara-hafu: convex top, concave flaring ends. s in -1..1, 0..1 out. */
const karaBell = (s: number) => (Math.exp(-3.4 * s * s) - Math.exp(-3.4)) / (1 - Math.exp(-3.4));

/**
 * Curved gable (kara-hafu) on the eave of skirt side s at along-position p0.
 * halfW = half width, h = height of the hump above the eave.
 */
export function karaHafu(b: MeshBuilder, sp: SkirtSpec, s: number, p0: number, halfW: number, h: number, colors: RoofColors, trim: GableTrim): (() => void)[] {
  const even = s % 2 === 0;
  const A = even ? sp.outer[0] : sp.outer[1];
  const u0 = p0 / A;
  const eave = skirtPoint(sp, s, u0, 0);
  const H = Math.min(h, sp.rise * 0.7);
  if (H <= 0.04) return [];
  const yb = eave[1] - sp.thickness * 0.2;
  const th = sp.thickness * 0.9;
  const tBack = Math.min(1, Math.pow((H + th * 2 - (yb - sp.eaveY)) / sp.rise, 1 / sp.sag) + 0.05);
  const back = skirtPoint(sp, s, u0, tBack);
  const qf = eave[2] + sp.thickness * 0.8;
  const qb = back[2];
  const n = 14;
  const curve = (k: number): [number, number] => {
    const sx = -1 + (2 * k) / n;
    const flare = 1 + 0.08 * Math.abs(sx); // the ends reach out a little
    return [p0 + sx * halfW * flare, yb + H * karaBell(sx)];
  };
  const orn: (() => void)[] = [];
  b.with(sideMatrix(s), () => {
    // Curved roof top: across (left to right) and from the front to the back.
    surface(
      b,
      n,
      2,
      (uu, vv) => {
        const k = uu * n;
        const [p, y] = curve(k);
        return [p, y + th, qf + th * 1.2 - (qf + th * 1.2 - qb) * vv];
      },
      (i) => shade(colors.roof, i % 2 ? 0.92 : 1)
    );
    // Underside of the curved roof (seen from below).
    surface(
      b,
      n,
      1,
      (uu, vv) => {
        const [p, y] = curve(uu * n);
        return [p, y, qf + th * 1.2 - (qf + th * 1.2 - qb) * (1 - vv)];
      },
      () => colors.soffit
    );
    for (let k = 0; k < n; k++) {
      const [p0a, y0a] = curve(k);
      const [p1a, y1a] = curve(k + 1);
      const qe = qf + th * 1.2;
      // Thick curved front edge (bargeboard), then the gable face below it.
      b.quad([p0a, y0a, qe], [p1a, y1a, qe], [p1a, y1a + th, qe], [p0a, y0a + th, qe], trim.board);
      b.quad([p1a, y1a, qe], [p0a, y0a, qe], [p0a, y0a, qf], [p1a, y1a, qf], shade(trim.board, 0.75));
      b.quad([p0a, yb - th * 0.4, qf], [p1a, yb - th * 0.4, qf], [p1a, y1a, qf], [p0a, y0a, qf], trim.face);
    }
  });
  orn.push(() =>
    b.with(sideMatrix(s), () =>
      b.withMat("gold", () => {
        gegyo(b, [p0, yb + H - th * 0.2, qf + th * 1.3], H * 0.32, trim.gold);
        // Gold band along the curved edge.
        const pts: V3[] = [];
        for (let k = 0; k <= n; k++) {
          const [p, y] = curve(k);
          pts.push([p, y + th * 0.5, qf + th * 1.25]);
        }
        bar(b, pts, 0.0015 + th * 0.12, th * 0.18, trim.gold, [0, 0, 1], false);
      })
    )
  );
  return orn;
}

/** Gegyo: a small gold ornament plate (a flattened diamond with wings), facing +z. */
export function gegyo(b: MeshBuilder, at: V3, size: number, gold: RGB) {
  const [x, y, z] = at;
  const s = size;
  const g2 = shade(gold, 0.85);
  poly(b, [[x, y + s * 0.5, z], [x - s * 0.35, y, z], [x, y - s * 0.6, z], [x + s * 0.35, y, z]], gold);
  // Wings.
  b.tri([x - s * 0.3, y + s * 0.1, z - 0.001], [x - s * 0.95, y - s * 0.05, z - 0.001], [x - s * 0.3, y - s * 0.25, z - 0.001], g2);
  b.tri([x + s * 0.3, y + s * 0.1, z - 0.001], [x + s * 0.3, y - s * 0.25, z - 0.001], [x + s * 0.95, y - s * 0.05, z - 0.001], g2);
}

export type IrimoyaSpec = {
  wall: [number, number];
  wallTopY: number;
  overhang: number;
  slope: number;
  thickness: number;
  cornerOut: number;
  cornerLift: number;
  colors: RoofColors;
  trim: GableTrim;
  nu: number;
  nt: number;
};

/**
 * Hip-and-gable roof (irimoya): a curved hip skirt, then two gable slopes to a ridge along x,
 * gable triangles at both ends. Returns the ridge ends (for ornaments) and the ridge height.
 */
export function irimoya(b: MeshBuilder, sp: IrimoyaSpec): { ridgeEnds: V3[]; top: number; skirt: SkirtSpec; orn: (() => void)[] } {
  const [X, Z] = sp.wall;
  const o = sp.overhang;
  const bg = Z * 0.48;
  const ag = Math.max(X - Z + bg, X * 0.5);
  const run = Z + o - bg;
  const rise1 = run * sp.slope;
  const eaveY = sp.wallTopY + sp.thickness * 1.6;
  const sk: SkirtSpec = {
    outer: [X + o, Z + o],
    inner: [ag, bg],
    eaveY,
    rise: rise1,
    cornerOut: sp.cornerOut,
    cornerLift: sp.cornerLift,
    sag: 1.5,
    thickness: sp.thickness,
    wall: { half: [X, Z], y: sp.wallTopY },
    colors: sp.colors,
    nu: sp.nu,
    nt: sp.nt,
    hips: true
  };
  skirt(b, sk);
  const y1 = eaveY + rise1;
  const k = (1.9 * rise1) / run; // a little steeper than the skirt's top tangent
  const y2 = y1 + bg * k;
  const gov = X * 0.1 + sp.thickness * 1.5;
  const xe = ag + gov;
  const th = sp.thickness;
  const be = bg + gov * 0.05; // the low edge of a gable slope (a little outside the skirt top)
  const slopeY = (q: number) => y1 + (bg - q) * k;
  // Gable slopes (both sides; side 2 is side 0 turned 180 degrees), as slabs: top, underside, edges.
  for (const s of [0, 2]) {
    b.with(sideMatrix(s), () => {
      const nu = Math.max(6, Math.round(sp.nu * 0.6));
      const at = (uu: number, vv: number, dy: number): V3 => {
        const q = be - be * vv;
        return [-xe + 2 * xe * uu, slopeY(q) + dy, q];
      };
      surface(b, nu, 3, (uu, vv) => at(uu, vv, 0), (i, j) => shade(sp.colors.roof, (i % 2 ? 0.93 : 1) * (0.98 + (0.04 * j) / 3)));
      surface(b, 1, 3, (uu, vv) => at(1 - uu, vv, -th), () => shade(sp.colors.soffit, 0.85));
      // Low edge (tile ends) and the two end edges.
      b.quad(at(0, 0, -th), at(1, 0, -th), at(1, 0, 0), at(0, 0, 0), shade(sp.colors.ridge, 0.9));
      b.quad(at(1, 0, -th), at(1, 1, -th), at(1, 1, 0), at(1, 0, 0), shade(sp.colors.ridge, 0.9));
      b.quad(at(0, 1, -th), at(0, 0, -th), at(0, 0, 0), at(0, 1, 0), shade(sp.colors.ridge, 0.9));
    });
  }
  // Gable ends: a white triangle under the bargeboards, on a board that reaches down to the hip roof.
  const orn: (() => void)[] = [];
  const qf = xe - th * 1.1;
  const tHip = Math.max(0, Math.min(1, (X + o - qf) / (X + o - ag)));
  const yHip = skirtY(sk, 0, tHip);
  for (const s of [1, 3]) {
    b.with(sideMatrix(s), () => {
      // Side frame 1: p = -z, q = x.
      const yb = slopeY(be) - th;
      poly(b, [[-be, yb, qf], [be, yb, qf], [0, y2 - th, qf]], sp.trim.face);
      b.quad([-be, yHip - th, qf], [be, yHip - th, qf], [be, yb, qf], [-be, yb, qf], shade(sp.trim.face, 0.88));
      if (sp.trim.lattice) {
        for (let kk = 1; kk <= 3; kk++) {
          const yy = yb + (y2 - yb) * (kk / 4.4);
          const hw = be * (1 - (yy - yb) / (y2 - th - yb)) * 0.9;
          if (hw > th) bar(b, [[-hw, yy, qf + 0.004], [hw, yy, qf + 0.004]], th * 0.1, th * 0.05, sp.trim.lattice);
        }
      }
      // Bargeboards follow the slope edges at the outer end of the gable roof.
      const q = xe - th * 0.45;
      bar(b, [[0, y2 + th * 0.05, q], [be, slopeY(be) - th * 0.4, q]], th * 0.5, th * 0.9, sp.trim.board);
      bar(b, [[0, y2 + th * 0.05, q], [-be, slopeY(be) - th * 0.4, q]], th * 0.5, th * 0.9, sp.trim.board);
    });
    orn.push(() =>
      b.with(sideMatrix(s), () =>
        b.withMat("gold", () => {
          gegyo(b, [0, y2 - th * 1.4, xe + th * 0.15], (y2 - y1) * 0.36, sp.trim.gold);
          for (const sx of [-1, 1]) {
            const p = sx * be;
            const yy = slopeY(be) - th * 0.4;
            b.quad([p - th * 0.8, yy - th * 1.1, xe + th * 0.1], [p + th * 0.8, yy - th * 1.1, xe + th * 0.1], [p + th * 0.8, yy + th * 0.7, xe + th * 0.1], [p - th * 0.8, yy + th * 0.7, xe + th * 0.1], sp.trim.gold);
          }
        })
      )
    );
  }
  // Main ridge.
  const rh = th * 0.9;
  bar(b, [[-xe - th * 0.5, y2 + rh * 0.3, 0], [xe + th * 0.5, y2 + rh * 0.3, 0]], th * 0.75, rh, sp.colors.ridge);
  const topY = y2 + rh * 1.3;
  return { ridgeEnds: [[-xe + th * 2.5, topY, 0], [xe - th * 2.5, topY, 0]], top: topY, skirt: sk, orn };
}

/**
 * Shachihoko: a gold tiger-fish standing on its head at a ridge end, head toward the ridge
 * center, body arched up, tail fin spread at the top.
 * at = foot point on the ridge top, dir = +1 at the +x end, size = height.
 */
export function shachihoko(b: MeshBuilder, at: V3, dir: number, size: number, gold: RGB, segs = 7) {
  const s = size;
  const P = (x: number, y: number, z = 0): V3 => [at[0] + dir * x * s, at[1] + y * s, at[2] + z * s];
  const path: V3[] = [P(-0.4, 0.13), P(-0.33, 0.14), P(-0.21, 0.16), P(-0.07, 0.25), P(0.02, 0.42), P(0.02, 0.6), P(-0.04, 0.74), P(-0.08, 0.8)];
  const radii = [0.03, 0.1, 0.14, 0.15, 0.12, 0.08, 0.045, 0.02].map((r) => r * s);
  const head = mix(gold, [1, 0.9, 0.55], 0.15);
  tube(b, path, radii, segs, (i) => (i < 2 ? head : i % 2 ? shade(gold, 0.92) : gold));
  // Tail fin: two lobes in a V at the top (both faces).
  const t0 = P(-0.08, 0.79);
  const lobes: [V3, V3, V3][] = [
    [t0, P(-0.34, 1.0), P(-0.16, 0.84)],
    [t0, P(0.14, 1.02), P(0.0, 0.84)]
  ];
  for (const [a, c, d] of lobes) {
    b.tri(a, c, d, gold);
    b.tri(a, d, c, gold);
  }
  // Dorsal fin (on the outer side of the arch) and pectoral fins.
  b.tri(P(0.08, 0.36), P(0.24, 0.5), P(0.1, 0.58), shade(gold, 0.9));
  b.tri(P(0.08, 0.36), P(0.1, 0.58), P(0.24, 0.5), shade(gold, 0.9));
  for (const sz of [-1, 1]) {
    const f0 = P(-0.2, 0.2, sz * 0.1);
    const f1 = P(-0.1, 0.1, sz * 0.26);
    const f2 = P(-0.06, 0.28, sz * 0.12);
    b.tri(f0, f1, f2, shade(gold, 0.95));
    b.tri(f0, f2, f1, shade(gold, 0.95));
  }
  // Pedestal on the ridge.
  bar(b, [P(-0.36, 0.0), P(0.1, 0.0)], 0.11 * s, 0.06 * s, shade(gold, 0.8));
}
