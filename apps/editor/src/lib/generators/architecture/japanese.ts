// Japanese styles: castle keep (tenshu), pagoda, shrine with torii gate.
import * as THREE from "three";
import { bar, box, boxAt, lathe, mix, poly, rgb, shade, surface, wallWithOpenings, type MeshBuilder, type Rand, type RGB, type V3, type WindowRect } from "./mesh";
import type { ArchParams } from "./params";
import { chidori, irimoya, karaHafu, shachihoko, sideMatrix, skirt, skirtY, type GableTrim, type RoofColors, type SkirtSpec } from "./roofs";

export type BuildInfo = {
  /** Half sizes of the ground footprint (before facing). */
  half: [number, number];
  /** Height before the vertical scale. */
  height: number;
  /** Sides kept open for the approach (front = +z). */
  front: "+z";
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Shared parts ─────────────────────────────────────────────

/**
 * Battered stone base (ishigaki): concave walls (steep at the top, flaring at the foot),
 * courses of large stones with their own tone, slightly raised in the middle (faceted),
 * and long corner stones laid in alternate directions.
 */
export function stoneBase(
  b: MeshBuilder,
  rand: Rand,
  bottom: [number, number],
  top: [number, number],
  height: number,
  stone: RGB,
  detail: number,
  y0 = 0
) {
  const rows = Math.max(4, Math.round(lerp(4, 9, detail) * Math.min(1.6, height / 1.6) ** 0.5));
  const half = (y: number): [number, number] => {
    const f = Math.pow(1 - (y - y0) / height, 1.8);
    return [top[0] + (bottom[0] - top[0]) * f, top[1] + (bottom[1] - top[1]) * f];
  };
  const light = shade(stone, 1.12);
  for (let s = 0; s < 4; s++) {
    const even = s % 2 === 0;
    b.with(sideMatrix(s), () => {
      for (let r = 0; r < rows; r++) {
        const ya = y0 + (height * r) / rows;
        const yb = y0 + (height * (r + 1)) / rows;
        const ha = half(ya);
        const hb = half(yb);
        const Aa = even ? ha[0] : ha[1];
        const Oa = even ? ha[1] : ha[0];
        const Ab = even ? hb[0] : hb[1];
        const Ob = even ? hb[1] : hb[0];
        // Stone joints along the row, as fractions 0..1 of the face width.
        const cuts: number[] = [0];
        const cornerLong = (r + s) % 2 === 0;
        const c0 = cornerLong ? 0.16 : 0.08;
        const c1 = cornerLong ? 0.08 : 0.16;
        cuts.push(c0);
        let f = c0;
        const target = Math.max(3, Math.round(lerp(4, 11, detail) * (Aa / 3) ** 0.5));
        for (;;) {
          f += ((1 - c0 - c1) / target) * rand.range(0.65, 1.35);
          if (f >= 1 - c1 - 0.04) break;
          cuts.push(f);
        }
        cuts.push(1 - c1);
        cuts.push(1);
        for (let k = 0; k < cuts.length - 1; k++) {
          const f0 = cuts[k];
          const f1 = cuts[k + 1];
          const P = (fx: number, lower: boolean): V3 => (lower ? [-Aa + 2 * Aa * fx, ya, Oa] : [-Ab + 2 * Ab * fx, yb, Ob]);
          const a = P(f0, true);
          const bb = P(f1, true);
          const c = P(f1, false);
          const d = P(f0, false);
          const corner = k === 0 || k === cuts.length - 2;
          const tone = corner ? shade(light, rand.range(0.96, 1.04)) : shade(stone, rand.range(0.82, 1.1));
          const tint = mix(tone, [tone[0] * 1.05, tone[1], tone[2] * 0.93], rand.next() * 0.5);
          if (detail >= 0.35) {
            // Raised center: four faceted triangles.
            const bulge = Math.min(0.06, (yb - ya) * 0.12) * rand.range(0.6, 1.2);
            const m: V3 = [(a[0] + bb[0] + c[0] + d[0]) / 4, (a[1] + c[1]) / 2, (a[2] + bb[2] + c[2] + d[2]) / 4 + bulge];
            b.tri(a, bb, m, shade(tint, 0.9));
            b.tri(bb, c, m, shade(tint, 0.97));
            b.tri(c, d, m, shade(tint, 1.06));
            b.tri(d, a, m, shade(tint, 0.95));
          } else b.quad(a, bb, c, d, tint);
        }
      }
    });
  }
  // Bottom (seen only when the ground is lower than the base).
  b.quad([-bottom[0], y0, -bottom[1]], [bottom[0], y0, -bottom[1]], [bottom[0], y0, bottom[1]], [-bottom[0], y0, bottom[1]], shade(stone, 0.6));
  // Top: a flat stone cap with a thin lip.
  const yt = y0 + height;
  const lip = Math.min(top[0], top[1]) * 0.015;
  box(b, [-top[0] - lip, yt - lip * 1.5, -top[1] - lip], [top[0] + lip, yt + lip * 0.5, top[1] + lip], shade(stone, 1.15), { chamfer: lip * 0.5, bottom: false });
}

/** Four walls of a rectangular story with a row of inset windows and chamfered corners. */
function storyWalls(
  b: MeshBuilder,
  half: [number, number],
  y0: number,
  y1: number,
  win: { count: (len: number) => number; width: number; v0: number; v1: number } | null,
  colors: { wall: RGB; recess: RGB; back: RGB; bands: { v0: number; v1: number; col: RGB }[] },
  chamfer: number,
  depth: number
) {
  const [X, Z] = half;
  const h = y1 - y0;
  const c = chamfer;
  for (let s = 0; s < 4; s++) {
    const even = s % 2 === 0;
    const A = even ? X : Z;
    const O = even ? Z : X;
    b.with(sideMatrix(s), () => {
      const len = 2 * A - 2 * c;
      const wins: WindowRect[] = [];
      if (win) {
        const n = Math.max(0, win.count(len));
        const w = Math.min(win.width, (len / Math.max(1, n)) * 0.55);
        for (let i = 0; i < n; i++) {
          const cu = ((i + 0.5) / n) * len;
          wins.push({ u0: cu - w / 2, u1: cu + w / 2, v0: win.v0, v1: win.v1 });
        }
      }
      wallWithOpenings(b, [-A + c, y0, O], [1, 0], len, h, wins, depth, colors);
      if (c > 0) {
        // Corner bevel between this side (end at p = A - c) and the next side (start at q = O - c).
        const col = shade(colors.wall, 0.94);
        b.quad([A - c, y0, O], [A, y0, O - c], [A, y1, O - c], [A - c, y1, O], col);
      }
    });
  }
}

function trimOf(c: ArchParams["colors"], gold: RGB): GableTrim {
  return { face: rgb(c.walls), board: shade(rgb(c.walls), 0.97), gold, lattice: shade(rgb(c.timber), 1.0) };
}

// ── Japanese castle keep (tenshu) ────────────────────────────

/**
 * Proportions (W = footprint): stone base 0.22 W high, flaring from 1.0 W to 0.86 W.
 * Stories step in so that the top story is about 40 % of the first. Each story has a
 * curved hip roof skirt with upturned corners; dormer gables alternate between triangular
 * (chidori) and curved (kara) from story to story. The top story has a balcony and a
 * hip-and-gable roof with gold shachihoko on the ridge.
 */
export function buildJapaneseCastle(b: MeshBuilder, p: ArchParams, rand: Rand): BuildInfo {
  const n = p.tiers;
  const W = p.footprint;
  const D = W * 0.88;
  const d = p.detail;
  const walls = rgb(p.colors.walls);
  const roof = rgb(p.colors.roof);
  const stone = rgb(p.colors.base);
  const gold = rgb(p.colors.accent);
  const timber = rgb(p.colors.timber);
  const rc: RoofColors = { roof, soffit: shade(walls, 0.92), fascia: walls, ridge: shade(roof, 0.82) };
  const trim = trimOf(p.colors, gold);

  // Stone base.
  b.stage("Stone base");
  const baseH = W * 0.22;
  const topHalf: [number, number] = [W * 0.43, D * 0.43];
  stoneBase(b, rand, [W / 2, D / 2], topHalf, baseH, stone, d);

  // Story sizes.
  const rTop: Record<number, number> = { 3: 0.55, 4: 0.48, 5: 0.43, 6: 0.4, 7: 0.37 };
  const k = Math.pow(rTop[n] ?? 0.43, 1 / (n - 1));
  const a0 = topHalf[0] * 0.92;
  const b0 = topHalf[1] * 0.92;
  const hf: Record<number, number> = { 3: 0.2, 4: 0.175, 5: 0.155, 6: 0.138, 7: 0.125 };
  const halfs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 * Math.pow(k, i);
    halfs.push([a, a * lerp(b0 / a0, 0.94, i / (n - 1))]);
  }
  const th = W * 0.017;
  const slope = 0.6;
  const nu = Math.round(lerp(10, 22, d));
  const nt = Math.round(lerp(3, 6, d));
  const ornaments: (() => void)[] = [];

  let vis = baseH; // visible bottom of the current story
  let wallBottom = baseH;
  let top = 0;
  for (let i = 0; i < n; i++) {
    b.stage(`Tier ${i + 1}`);
    const [X, Z] = halfs[i];
    const last = i === n - 1;
    const h = W * (hf[n] ?? 0.15) * (0.82 + 0.18 * Math.pow(k, i)) * (last ? 1.12 : 1);
    let floor = vis;
    if (last) {
      // Balcony (mawari-en) with a railing around the top story.
      const bw = W * 0.032;
      floor = vis + W * 0.015;
      const ft = W * 0.012;
      box(b, [-X - bw, floor - ft, -Z - bw], [X + bw, floor, Z + bw], shade(timber, 1.25), { chamfer: ft * 0.3 });
      const railH = W * 0.045;
      const posts = Math.max(3, Math.round(lerp(4, 9, d) * (X / (W * 0.18))));
      const railCol = shade(timber, 1.05);
      const rw = W * 0.0035;
      for (const [s, A, O] of [[0, X, Z], [1, Z, X], [2, X, Z], [3, Z, X]] as const) {
        b.with(sideMatrix(s), () => {
          const q = O + bw - rw * 2;
          for (let j = 0; j <= posts; j++) {
            const pp = -A - bw + rw * 2 + ((2 * (A + bw) - rw * 4) * j) / posts;
            box(b, [pp - rw, floor, q - rw], [pp + rw, floor + railH, q + rw], railCol);
          }
          bar(b, [[-A - bw + rw, floor + railH, q], [A + bw - rw, floor + railH, q]], rw * 1.4, rw * 1.2, railCol);
          bar(b, [[-A - bw + rw, floor + railH * 0.45, q], [A + bw - rw, floor + railH * 0.45, q]], rw, rw * 0.8, railCol);
        });
      }
    }
    const wallTop = floor + h;
    const winW = W * (last ? 0.05 : 0.04) * (0.8 + 0.2 * Math.pow(k, i));
    const v0 = floor - wallBottom + h * (last ? 0.22 : 0.3);
    const v1 = floor - wallBottom + h * (last ? 0.72 : 0.64);
    const bands = [
      { v0: v1 + h * 0.06, v1: v1 + h * 0.1, col: shade(timber, 1.1) },
      { v0: v0 - h * 0.08, v1: v0 - h * 0.05, col: shade(timber, 1.1) }
    ];
    if (last) bands.push({ v0: wallTop - wallBottom - h * 0.12, v1: wallTop - wallBottom, col: shade(gold, 0.95) });
    if (i === 0) bands.push({ v0: 0, v1: floor - wallBottom + h * 0.1, col: shade(timber, 1.0) });
    storyWalls(
      b,
      [X, Z],
      wallBottom,
      wallTop,
      d < 0.15 ? null : { count: (len) => Math.max(2, Math.round(len / (W * (last ? 0.12 : 0.1)))), width: winW, v0, v1 },
      { wall: walls, recess: shade(timber, 1.2), back: shade(timber, 0.45), bands },
      W * 0.006,
      W * 0.012
    );

    if (!last) {
      const [nx, nz] = halfs[i + 1];
      const o = W * 0.075 * (0.55 + 0.45 * Math.pow(k, i));
      const run = (X + o - nx + Z + o - nz) / 2;
      const rise = run * slope;
      const sp: SkirtSpec = {
        outer: [X + o, Z + o],
        inner: [nx * 0.985, nz * 0.985],
        eaveY: wallTop + th * 1.6,
        rise,
        cornerOut: o * 0.28,
        cornerLift: o * 0.8,
        sag: 1.55,
        thickness: th,
        wall: { half: [X, Z], y: wallTop },
        colors: rc,
        nu,
        nt,
        hips: d >= 0.3
      };
      skirt(b, sp);
      // Dormer gables: alternate triangular and curved from story to story.
      if (d >= 0.25) {
        const kind = i % 2 === 0 ? "chidori" : "kara";
        for (const s of [0, 2, 1, 3]) {
          const even = s % 2 === 0;
          const A = even ? X : Z;
          const sideKind = even ? kind : kind === "chidori" ? "kara" : "chidori";
          if (!even && (d < 0.55 || i === n - 2)) continue;
          if (sideKind === "chidori") {
            const two = A > W * 0.3 && even;
            const hw = A * (two ? 0.2 : 0.3);
            for (const p0 of two ? [-A * 0.42, A * 0.42] : [0]) ornaments.push(...chidori(b, sp, s, p0, hw, hw * 0.95, rc, trim));
          } else {
            const hw = A * 0.36;
            ornaments.push(...karaHafu(b, sp, s, 0, hw, hw * 0.42, rc, trim));
          }
        }
      }
      vis = sp.eaveY + rise;
      wallBottom = sp.eaveY + rise * 0.8;
      // Hip-end tiles (onigawara) at the eave corners.
      ornaments.push(() => {
        for (let s = 0; s < 4; s++) {
          b.with(sideMatrix(s), () => {
            const u = 1;
            const pt = [
              (sp.outer[s % 2 === 0 ? 0 : 1] + sp.cornerOut) * u,
              skirtY(sp, 1, 0.02) + th * 0.5,
              (sp.outer[s % 2 === 0 ? 1 : 0] + sp.cornerOut)
            ] as V3;
            b.withMat("gold", () => boxAt(b, [pt[0] - th * 0.6, pt[1], pt[2] - th * 0.6], [th * 0.55, th * 0.55, th * 0.55], Math.PI / 4, shade(gold, 0.9)));
          });
        }
      });
    } else {
      const o = W * 0.07;
      const r = irimoya(b, {
        wall: [X, Z],
        wallTopY: wallTop,
        overhang: o,
        slope: 0.62,
        thickness: th,
        cornerOut: o * 0.3,
        cornerLift: o * 0.85,
        colors: rc,
        trim,
        nu,
        nt
      });
      ornaments.push(...r.orn);
      const size = (r.top - wallTop) * 0.42;
      ornaments.push(() =>
        b.withMat("gold", () => {
          shachihoko(b, r.ridgeEnds[1], 1, size, gold, d > 0.5 ? 8 : 6);
          shachihoko(b, r.ridgeEnds[0], -1, size, gold, d > 0.5 ? 8 : 6);
        })
      );
      top = r.top + size * 1.15;
    }
  }

  b.stage("Roof ornaments");
  for (const f of ornaments) f();
  return { half: [W / 2, D / 2], height: top, front: "+z" };
}

// ── Pagoda ───────────────────────────────────────────────────

/** Square pagoda: stone platform, 3 or 5 stories with deep curved eaves, sorin finial with 9 rings. */
export function buildPagoda(b: MeshBuilder, p: ArchParams): BuildInfo {
  const n = p.tiers;
  const W = p.footprint;
  const d = p.detail;
  const body = rgb(p.colors.walls);
  const roof = rgb(p.colors.roof);
  const stone = rgb(p.colors.base);
  const gold = rgb(p.colors.accent);
  const panel = rgb(p.colors.timber);
  const rc: RoofColors = { roof, soffit: shade(body, 0.85), fascia: shade(body, 0.9), ridge: shade(roof, 0.8) };
  b.stage("Stone base");
  const baseH = W * 0.1;
  const bodyHalf = W * 0.26;
  box(b, [-W * 0.42, 0, -W * 0.42], [W * 0.42, baseH, W * 0.42], stone, { chamfer: W * 0.01 });
  // Steps on the front.
  for (let s = 0; s < 3; s++) {
    const h = (baseH * (3 - s)) / 3;
    box(b, [-W * 0.1, 0, W * 0.42 + s * W * 0.04 - 0.001], [W * 0.1, h, W * 0.42 + (s + 1) * W * 0.04], shade(stone, 1.05 - s * 0.03));
  }
  const k = n === 3 ? 0.84 : 0.88;
  const th = W * 0.024;
  const nu = Math.round(lerp(10, 20, d));
  const nt = Math.round(lerp(3, 5, d));
  let y = baseH;
  let top = 0;
  const ornaments: (() => void)[] = [];
  for (let i = 0; i < n; i++) {
    b.stage(`Tier ${i + 1}`);
    const a = bodyHalf * Math.pow(k, i);
    const h = W * (i === 0 ? 0.3 : 0.2) * Math.pow(0.96, i);
    const v0 = h * (i === 0 ? 0.08 : 0.25);
    const v1 = h * (i === 0 ? 0.62 : 0.7);
    storyWalls(
      b,
      [a, a],
      y,
      y + h,
      { count: () => (i === 0 ? 3 : 1), width: a * (i === 0 ? 0.42 : 0.6), v0, v1 },
      { wall: body, recess: shade(body, 0.8), back: i === 0 ? rgb("#3b2a22") : shade(body, 0.45), bands: [{ v0: h * 0.85, v1: h, col: panel }, { v0: 0, v1: h * 0.06, col: shade(body, 0.8) }] },
      W * 0.008,
      W * 0.015
    );
    // Bracket band under the eaves (dark, stepped out).
    const bt = h * 0.12;
    box(b, [-a - th * 0.6, y + h - bt * 0.2, -a - th * 0.6], [a + th * 0.6, y + h + bt, a + th * 0.6], shade(body, 0.7), { chamfer: th * 0.2 });
    const o = W * 0.24 * Math.pow(0.95, i);
    const last = i === n - 1;
    const next = last ? a * 0.18 : a * k * 0.985;
    const run = a + o - next;
    const sp: SkirtSpec = {
      outer: [a + o, a + o],
      inner: [next, next],
      eaveY: y + h + bt + th * 0.8,
      rise: run * (last ? 0.55 : 0.36),
      cornerOut: o * 0.18,
      cornerLift: o * 0.42,
      sag: last ? 1.6 : 1.8,
      thickness: th,
      wall: { half: [a + th * 0.6, a + th * 0.6], y: y + h + bt },
      colors: rc,
      nu,
      nt,
      hips: d >= 0.3
    };
    skirt(b, sp);
    if (last) {
      const yt = sp.eaveY + sp.rise;
      box(b, [-next, yt - th, -next], [next, yt + th * 0.6, next], rc.ridge, { chamfer: th * 0.2 });
      // Sorin (finial): base, bowl, 9 rings on a pole, water flame, jewel.
      b.stage("Roof ornaments");
      const H = (sp.eaveY + sp.rise - baseH) * (n === 3 ? 0.45 : 0.34);
      const y0 = yt + th * 0.6;
      const r0 = Math.max(next * 0.9, W * 0.06);
      b.withMat("gold", () => {
        const g = gold;
        lathe(b, [[r0, 0], [r0, H * 0.06], [r0 * 0.6, H * 0.08], [0, H * 0.08]], 8, shade(g, 0.8), [0, y0, 0], Math.PI / 8);
        lathe(b, [[r0 * 0.25, H * 0.08], [r0 * 0.75, H * 0.12], [r0 * 0.7, H * 0.17], [0, H * 0.17]], 10, g, [0, y0, 0]);
        lathe(b, [[r0 * 0.08, H * 0.17], [r0 * 0.08, H * 0.95], [0, H * 0.95]], 6, shade(g, 0.9), [0, y0, 0]);
        for (let r = 0; r < 9; r++) {
          const yy = H * (0.22 + r * 0.06);
          const rr = r0 * (0.55 - r * 0.025);
          lathe(b, [[r0 * 0.08, yy], [rr, yy + H * 0.008], [rr, yy + H * 0.022], [r0 * 0.08, yy + H * 0.03]], 10, r % 2 ? shade(g, 0.92) : g, [0, y0, 0]);
        }
        // Water flame: a ring of four flat flame plates.
        for (let f = 0; f < 4; f++) {
          const ang = (f * Math.PI) / 2;
          const m = new THREE.Matrix4().makeRotationY(ang).setPosition(0, y0 + H * 0.78, 0);
          b.with(m, () => {
            const pts: V3[] = [[r0 * 0.06, 0, 0], [r0 * 0.42, H * 0.04, 0], [r0 * 0.3, H * 0.1, 0], [r0 * 0.12, H * 0.14, 0]];
            poly(b, pts, shade(g, 1.05));
            poly(b, [...pts].reverse(), shade(g, 1.05));
          });
        }
        lathe(b, [[0, H * 0.94], [r0 * 0.14, H * 0.97], [r0 * 0.12, H * 1.0], [0, H * 1.04]], 8, shade(g, 1.1), [0, y0, 0]);
      });
      top = y0 + H * 1.04;
    } else {
      y = sp.eaveY + sp.rise * 0.82;
    }
  }
  for (const f of ornaments) f();
  return { half: [W * 0.42, W * 0.42 + W * 0.12], height: top, front: "+z" };
}

// ── Shrine with torii gate ───────────────────────────────────

/** Shinto shrine hall on a raised floor, gabled roof with chigi and katsuogi; a torii gate in front. */
export function buildShrine(b: MeshBuilder, p: ArchParams): BuildInfo {
  const L = p.footprint; // whole composition depth
  const d = p.detail;
  const plaster = rgb(p.colors.walls);
  const roof = rgb(p.colors.roof);
  const stone = rgb(p.colors.base);
  const red = rgb(p.colors.accent);
  const wood = rgb(p.colors.timber);
  const gold: RGB = rgb("#d9a93a");
  const hallW = L * 0.46;
  const hallD = L * 0.34;
  const hz = -L * 0.2; // hall center z
  b.stage("Stone base");
  const ph = L * 0.05;
  box(b, [-hallW * 0.62, 0, hz - hallD * 0.62], [hallW * 0.62, ph, hz + hallD * 0.62], stone, { chamfer: L * 0.006 });
  // Approach path to the torii.
  box(b, [-L * 0.06, 0, hz + hallD * 0.62 - 0.001], [L * 0.06, ph * 0.3, L * 0.5], shade(stone, 1.08), { chamfer: L * 0.003 });

  b.stage("Tier 1");
  const floorY = ph + L * 0.06;
  const X = hallW / 2;
  const Z = hallD / 2;
  // Posts under the raised floor and the floor deck with a veranda.
  const postR = L * 0.012;
  for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) box(b, [sx * X - postR, ph, hz + sz * Z - postR], [sx * X + postR, floorY, hz + sz * Z + postR], wood);
  box(b, [-X - L * 0.04, floorY - L * 0.012, hz - Z - L * 0.04], [X + L * 0.04, floorY, hz + Z + L * 0.04], shade(wood, 1.1), { chamfer: L * 0.003 });
  // Front stairs.
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    const y1 = ph + ((floorY - ph) * (s + 1)) / steps;
    const z1 = hz + Z + L * 0.04 + (steps - s) * L * 0.025;
    box(b, [-X * 0.35, ph, hz + Z + L * 0.04 - 0.001], [X * 0.35, y1, z1], shade(wood, 1.05 - s * 0.02));
  }
  // Walls: timber frame with white panels.
  const wallH = L * 0.17;
  b.with(new THREE.Matrix4().makeTranslation(0, 0, hz), () => storyWalls(
    b,
    [X, Z],
    floorY,
    floorY + wallH,
    { count: (len) => Math.max(1, Math.round(len / (L * 0.16))), width: L * 0.09, v0: wallH * 0.0, v1: wallH * 0.78 },
    { wall: plaster, recess: wood, back: shade(wood, 0.6), bands: [{ v0: 0, v1: wallH * 0.1, col: wood }, { v0: wallH * 0.78, v1: wallH, col: wood }] },
    L * 0.004,
    L * 0.01
  ));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, [sx * X - postR * 1.2, floorY, hz + sz * Z - postR * 1.2], [sx * X + postR * 1.2, floorY + wallH, hz + sz * Z + postR * 1.2], wood);
  // Gabled roof (kirizuma) with curved slopes; ridge along x, gables on the sides.
  const ov = L * 0.07;
  const rr = Z + ov * 1.4;
  const yE = floorY + wallH + L * 0.01;
  const rise = Z * 1.15;
  const xe = X + ov;
  const th = L * 0.015;
  for (const s of [0, 2]) {
    const m = new THREE.Matrix4().makeRotationY((s * Math.PI) / 2).setPosition(0, 0, hz);
    b.with(m, () => {
      const roofPt = (uu: number, vv: number, dy = 0): V3 => [-xe + 2 * xe * uu, yE + rise * Math.pow(vv, 1.35) + dy, rr * (1 - vv)];
      surface(b, 12, 6, (uu, vv) => roofPt(uu, vv), (i) => shade(roof, i % 2 ? 0.93 : 1));
      // Underside (wood), seen under the eaves and at the gable overhangs.
      surface(b, 2, 6, (uu, vv) => roofPt(1 - uu, vv, -th), () => shade(wood, 0.8));
      b.quad([-xe, yE - th, rr], [xe, yE - th, rr], [xe, yE, rr], [-xe, yE, rr], shade(roof, 0.8));
      // Frieze board: closes the gap between the wall top and the roof underside.
      const yZ = roofPt(0, 1 - Z / rr)[1] - th * 0.5;
      b.quad([-X, floorY + wallH - 0.01, Z], [X, floorY + wallH - 0.01, Z], [X, yZ, Z], [-X, yZ, Z], shade(wood, 0.95));
      for (const ex of [-1, 1]) {
        // Roof edge at the gable end.
        for (let k = 0; k < 6; k++) {
          const a = roofPt(ex > 0 ? 1 : 0, k / 6);
          const c = roofPt(ex > 0 ? 1 : 0, (k + 1) / 6);
          if (ex > 0) b.quad([a[0], a[1] - th, a[2]], [c[0], c[1] - th, c[2]], c, a, shade(roof, 0.8));
          else b.quad([c[0], c[1] - th, c[2]], [a[0], a[1] - th, a[2]], a, c, shade(roof, 0.8));
        }
      }
    });
  }
  // Gable faces and bargeboards.
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationY(sx > 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(0, 0, hz);
    b.with(m, () => {
      // Face: vertical at q = X.
      const yAt = (zz: number) => yE + rise * Math.pow(Math.max(0, 1 - Math.abs(zz) / rr), 1.35);
      for (let k = 0; k < 8; k++) {
        const z0 = -Z + (2 * Z * k) / 8;
        const z1 = -Z + (2 * Z * (k + 1)) / 8;
        b.quad([z0, floorY + wallH, X], [z1, floorY + wallH, X], [z1, yAt(z1) - th, X], [z0, yAt(z0) - th, X], shade(wood, 1.05));
      }
      const edge: V3[] = [];
      for (let k = 0; k <= 10; k++) {
        const zz = -rr + (2 * rr * k) / 10;
        edge.push([zz, yAt(zz) - th * 0.3, xe - th * 0.3]);
      }
      bar(b, edge, th * 0.5, th * 1.1, shade(wood, 0.95), [0, 0, 1]);
    });
  }
  const ridgeY = yE + rise;
  bar(b, [[-xe - th, ridgeY + th * 0.6, hz], [xe + th, ridgeY + th * 0.6, hz]], th * 1.2, th * 1.3, shade(roof, 0.75));

  b.stage("Roof ornaments");
  // Katsuogi: short logs across the ridge. Chigi: crossed boards at both ridge ends.
  const logs = Math.max(3, Math.round(lerp(3, 6, d)));
  for (let i = 0; i < logs; i++) {
    const x = -xe * 0.7 + (1.4 * xe * i) / (logs - 1);
    bar(b, [[x, ridgeY + th * 2.2, hz - L * 0.04], [x, ridgeY + th * 2.2, hz + L * 0.04]], L * 0.012, L * 0.012, shade(wood, 0.85));
    b.withMat("gold", () => {
      for (const sz of [-1, 1]) box(b, [x - L * 0.013, ridgeY + th * 2.2 - L * 0.013, hz + sz * L * 0.04 - (sz > 0 ? 0 : L * 0.006)], [x + L * 0.013, ridgeY + th * 2.2 + L * 0.013, hz + sz * L * 0.04 + (sz > 0 ? L * 0.006 : 0)], gold);
    });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (xe + th * 0.2);
      bar(b, [[x, ridgeY - rise * 0.15, hz + sz * rr * 0.15], [x, ridgeY + L * 0.07, hz - sz * L * 0.05]], th * 0.35, th * 0.9, shade(wood, 0.9), [0, 0, 1]);
    }
  }
  // Torii gate at the front.
  const tz = L * 0.4;
  const tH = L * 0.36;
  const tW = L * 0.18;
  const pr = L * 0.018;
  for (const sx of [-1, 1]) {
    lathe(b, [[0, 0], [pr * 1.15, 0], [pr * 1.15, L * 0.02], [pr, L * 0.022], [pr * 0.9, tH], [0, tH]], 10, red, [sx * tW, 0, tz]);
    lathe(b, [[0, 0], [pr * 1.4, 0], [pr * 1.4, L * 0.025], [0, L * 0.025]], 10, shade(stone, 0.6), [sx * tW, 0, tz]);
  }
  // Nuki (tie beam), gakuzuka (center strut), shimaki and kasagi (top lintels with upturned ends).
  box(b, [-tW * 1.25, tH * 0.72, tz - pr * 0.55], [tW * 1.25, tH * 0.78, tz + pr * 0.55], red, { chamfer: pr * 0.1 });
  box(b, [-pr * 0.6, tH * 0.78, tz - pr * 0.4], [pr * 0.6, tH * 0.92, tz + pr * 0.4], red);
  box(b, [-tW * 1.32, tH * 0.92, tz - pr * 0.75], [tW * 1.32, tH * 0.98, tz + pr * 0.75], red, { chamfer: pr * 0.1 });
  const kas: V3[] = [];
  for (let k = 0; k <= 12; k++) {
    const u = -1 + (2 * k) / 12;
    kas.push([u * tW * 1.5, tH * 1.02 + Math.pow(Math.abs(u), 3) * tH * 0.07, tz]);
  }
  bar(b, kas, pr * 1.0, tH * 0.035, shade(rgb("#2f2b28"), 1), [0, 1, 0]);
  return { half: [Math.max(hallW * 0.62, tW * 1.5), L * 0.5], height: Math.max(ridgeY + L * 0.07, tH * 1.1), front: "+z" };
}
