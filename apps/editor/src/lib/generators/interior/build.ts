// Interior builder: turns InteriorParams into a finished room. Floor finish, ceiling with light
// panels, walls (shell or lift core), furniture and lamps, all merged by material through
// MeshBuilder (no node for each object). Low-poly, flat-shaded and vertex-colored like the tower.
// Furniture positions come from planInterior(); each kind is drawn in its own local frame (the
// item center on the floor top, w along x, d along z, its front on +z).
import * as THREE from "three";
import type { ArchStage } from "../architecture";
import { bar, box, lathe, MeshBuilder, mix, Rand, rgb, shade, stageGeometries, type RGB } from "../architecture/mesh";
import { paletteOf, type InteriorPalette, type InteriorParams } from "./params";
import { canonicalSize, liftCount, MAIN_GROUP, planInterior, sideTurns, unionRect, type InteriorItem, type InteriorPlan } from "./plan";

export type BuiltInterior = { stages: ArchStage[]; triangles: number; plan: InteriorPlan };

/** Top of the floor finish. Furniture stands on it. */
const FY = 0.03;
const Q = Math.PI / 2;

type Pal = Record<keyof InteriorPalette, RGB>;
type Ctx = { b: MeshBuilder; p: InteriorParams; c: Pal; lights: boolean };

const BOOK_COLORS = ["#7a3b2e", "#2f4f6f", "#c9a24a", "#4f6b3a", "#d8d2c4", "#5b3a5e", "#a8552f"].map(rgb);
const BOTTLE_COLORS = ["#3f6b3a", "#8a5a1e", "#c9c3b0", "#5a1e24", "#2c3e50", "#b88a2a", "#6f8f8a"].map(rgb);

// ── Small helpers ────────────────────────────────────────────

type BoxOpts = { chamfer?: number; top?: RGB; bottom?: RGB | false };
function bx(b: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: RGB, opts: BoxOpts = {}) {
  box(b, [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], col, opts);
}

/** Horizontal quad facing up. */
function up(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, y: number, col: RGB) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col);
}

/** Horizontal quad facing down. */
function down(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, y: number, col: RGB) {
  b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col);
}

/** Vertical quad facing +z at depth z. */
function front(b: MeshBuilder, x0: number, y0: number, x1: number, y1: number, z: number, col: RGB) {
  b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col);
}

function legs(b: MeshBuilder, w: number, d: number, inset: number, h: number, t: number, col: RGB) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - inset);
      const z = sz * (d / 2 - inset);
      bx(b, x - t / 2, 0, z - t / 2, x + t / 2, h, z + t / 2, col, { bottom: false });
    }
}

function itemMatrix(it: InteriorItem) {
  return new THREE.Matrix4().makeRotationY(it.rotY).setPosition(it.x, FY, it.z);
}

// ── Floor ────────────────────────────────────────────────────

const MAX_FLOOR_QUADS = 5600;

function buildFloor(ctx: Ctx, rand: Rand) {
  const { b, p, c } = ctx;
  const hw = p.width / 2;
  const hd = p.depth / 2;
  const area = p.width * p.depth;
  b.stage("Floor");
  // Slab: the joint color shows between the finish pieces.
  bx(b, -hw, 0, -hd, hw, FY - 0.006, hd, shade(c.floorAlt, 0.82), { bottom: false });
  const tile = (x0: number, z0: number, x1: number, z1: number, col: RGB, gap: number) => {
    const a = Math.max(-hw, x0) + gap;
    const bb = Math.min(hw, x1) - gap;
    const z = Math.max(-hd, z0) + gap;
    const zz = Math.min(hd, z1) - gap;
    if (bb - a > 0.01 && zz - z > 0.01) up(b, a, z, bb, zz, FY, col);
  };
  if (p.finish === "warm-wood") {
    const s = Math.max(1, Math.sqrt(area / (MAX_FLOOR_QUADS * 0.18 * 1.6)));
    const pw = 0.18 * s;
    for (let z = -hd; z < hd - 1e-6; z += pw) {
      let x = -hw - rand.range(0, 1.6 * s);
      while (x < hw) {
        const len = rand.range(1.2, 2) * s;
        tile(x, z, x + len, z + pw, shade(c.floor, rand.range(0.94, 1.06)), 0.003);
        x += len;
      }
    }
  } else if (p.finish === "stone-brass") {
    const border = Math.min(p.width, p.depth) > 2.5 ? 0.35 : 0;
    const fx = hw - border;
    const fz = hd - border;
    const s = Math.max(1, Math.sqrt((4 * fx * fz) / (MAX_FLOOR_QUADS * 0.81)));
    const t = 0.9 * s;
    const nx = Math.ceil((2 * fx) / t);
    const nz = Math.ceil((2 * fz) / t);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x0 = Math.max(-fx, -(nx * t) / 2 + i * t);
        const z0 = Math.max(-fz, -(nz * t) / 2 + j * t);
        const x1 = Math.min(fx, -(nx * t) / 2 + (i + 1) * t);
        const z1 = Math.min(fz, -(nz * t) / 2 + (j + 1) * t);
        const col = (i + j) % 2 ? shade(c.floor, rand.range(0.97, 1.01)) : shade(c.floor, rand.range(1.0, 1.04));
        tile(x0, z0, x1, z1, col, 0.004);
      }
    if (border > 0) {
      const bc = shade(mix(c.floorAlt, c.wall, 0.25), 0.95);
      up(b, -hw, -hd, hw, -fz, FY, bc);
      up(b, -hw, fz, hw, hd, FY, bc);
      up(b, -hw, -fz, -fx, fz, FY, bc);
      up(b, fx, -fz, hw, fz, FY, bc);
      // Brass inlay line at the inner edge of the border.
      const w = 0.025;
      b.withMat("gold", () => {
        up(b, -fx, -fz, fx, -fz + w, FY + 0.001, c.accent);
        up(b, -fx, fz - w, fx, fz, FY + 0.001, c.accent);
        up(b, -fx, -fz + w, -fx + w, fz - w, FY + 0.001, c.accent);
        up(b, fx - w, -fz + w, fx, fz - w, FY + 0.001, c.accent);
      });
    }
  } else if (p.finish === "light-minimal") {
    const s = Math.max(1, Math.sqrt(area / (MAX_FLOOR_QUADS * 0.72)));
    const tw = 1.2 * s;
    const td = 0.6 * s;
    let row = 0;
    for (let z = -hd; z < hd - 1e-6; z += td, row++) {
      for (let x = -hw - (row % 2 ? tw / 2 : 0); x < hw; x += tw) tile(x, z, x + tw, z + td, shade(c.floor, rand.range(0.97, 1.03)), 0.003);
    }
  } else {
    const nx = Math.max(1, Math.round(p.width / 3));
    const nz = Math.max(1, Math.round(p.depth / 3));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x0 = -hw + (i * p.width) / nx;
        const z0 = -hd + (j * p.depth) / nz;
        tile(x0, z0, x0 + p.width / nx, z0 + p.depth / nz, shade(c.floor, rand.range(0.93, 1.05)), 0.006);
      }
  }
}

/** Entrance mat and portal frame, in the canonical frame (entrance on +z). */
function buildEntrance(ctx: Ctx) {
  const { b, p, c } = ctx;
  const [, D] = canonicalSize(p);
  const hd = D / 2;
  const k = sideTurns(p.front);
  b.with(new THREE.Matrix4().makeRotationY(k * Q), () => {
    const mz1 = hd - 0.1;
    const mz0 = Math.max(-hd + 0.1, mz1 - 1.4);
    const mat = mix(rgb("#26282a"), c.floorAlt, 0.12);
    bx(b, -1.2, FY, mz0, 1.2, FY + 0.012, mz1, shade(mat, 0.9), { top: mat, bottom: false });
    up(b, -1.05, mz0 + 0.15, 1.05, mz1 - 0.15, FY + 0.0125, shade(mat, 1.25));
    const ph = Math.min(2.6, p.height - 0.02);
    b.withMat("gold", () => {
      bx(b, -1.2, 0, hd - 0.17, -1.1, ph, hd - 0.05, c.metal, { bottom: false });
      bx(b, 1.1, 0, hd - 0.17, 1.2, ph, hd - 0.05, c.metal, { bottom: false });
      bx(b, -1.2, ph - 0.1, hd - 0.17, 1.2, ph, hd - 0.05, c.metal);
    });
  });
}

// ── Ceiling ──────────────────────────────────────────────────

function buildCeiling(ctx: Ctx, plan: InteriorPlan, rand: Rand) {
  const { b, p, c } = ctx;
  const hw = p.width / 2;
  const hd = p.depth / 2;
  const H = p.height;
  const lit = rgb(paletteOf(p.finish).light);
  b.stage("Ceiling");
  bx(b, -hw, H, -hd, hw, H + 0.12, hd, shade(c.ceiling, 0.82), { top: shade(c.ceiling, 0.75), bottom: c.ceiling });
  const panelMat = ctx.lights ? "lit" : "base";
  const industrial = p.finish === "dark-industrial";
  const cove = !industrial && Math.min(p.width, p.depth) > 2.2 ? 0.5 : 0;
  if (cove > 0) {
    const cc = shade(c.ceiling, 0.97);
    const y0 = H - 0.12;
    bx(b, -hw, y0, -hd, hw, H, -hd + cove, cc, { bottom: shade(c.ceiling, 0.94) });
    bx(b, -hw, y0, hd - cove, hw, H, hd, cc, { bottom: shade(c.ceiling, 0.94) });
    bx(b, -hw, y0, -hd + cove, -hw + cove, H, hd - cove, cc, { bottom: shade(c.ceiling, 0.94) });
    bx(b, hw - cove, y0, -hd + cove, hw, H, hd - cove, cc, { bottom: shade(c.ceiling, 0.94) });
    if (ctx.lights) {
      // A thin glowing line on the inner edge of the cove (indirect light).
      const e = 0.004;
      const ix = hw - cove - e;
      const iz = hd - cove - e;
      const ya = H - 0.035;
      b.withMat("lit", () => {
        b.quad([-ix, ya, iz], [ix, ya, iz], [ix, H, iz], [-ix, H, iz], lit);
        b.quad([ix, ya, -iz], [-ix, ya, -iz], [-ix, H, -iz], [ix, H, -iz], lit);
        b.quad([ix, ya, iz], [ix, ya, -iz], [ix, H, -iz], [ix, H, iz], lit);
        b.quad([-ix, ya, -iz], [-ix, ya, iz], [-ix, H, iz], [-ix, H, -iz], lit);
      });
    }
  }
  // Recessed light panels on a grid, about one for each 7.5 square meters.
  const fx = hw - cove - 0.2;
  const fz = hd - cove - 0.2;
  if (fx > 0.4 && fz > 0.4) {
    const sp = Math.sqrt(7.5);
    const nx = Math.max(1, Math.round((2 * fx) / sp));
    const nz = Math.max(1, Math.round((2 * fz) / sp));
    const cw = (2 * fx) / nx;
    const cd = (2 * fz) / nz;
    const pw = Math.min(1.2, cw * 0.6) / 2;
    const pd = Math.min(0.6, cd * 0.5) / 2;
    const trim = shade(c.ceiling, 0.82);
    const panel = ctx.lights ? lit : shade(c.ceiling, 1.04);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = -fx + (i + 0.5) * cw;
        const z = -fz + (j + 0.5) * cd;
        down(b, x - pw - 0.04, z - pd - 0.04, x + pw + 0.04, z + pd + 0.04, H - 0.002, trim);
        b.withMat(panelMat, () => down(b, x - pw, z - pd, x + pw, z + pd, H - 0.004, panel));
      }
  }
  if (industrial) {
    // Steel I-beams every 3 m and two light tracks with spots.
    const steel = shade(c.metal, 1.3);
    for (let z = -hd + 1.5; z < hd - 0.5; z += 3) {
      bx(b, -hw, H - 0.34, z - 0.1, hw, H - 0.31, z + 0.1, steel);
      bx(b, -hw, H - 0.31, z - 0.025, hw, H, z + 0.025, shade(steel, 0.9), { bottom: false });
    }
    if (p.depth > 2.4 && p.width > 1.6) {
      for (const sz of [-1, 1]) {
        const z = sz * (hd - 0.7);
        bx(b, -hw + 0.4, H - 0.05, z - 0.025, hw - 0.4, H, z + 0.025, steel);
        for (let x = -hw + 0.9; x < hw - 0.6; x += 1.5) {
          lathe(b, [[0, H - 0.05], [0.05, H - 0.05], [0.055, H - 0.22], [0, H - 0.22]], 6, steel, [x, 0, z]);
          b.withMat(panelMat, () => down(b, x - 0.035, z - 0.035, x + 0.035, z + 0.035, H - 0.222, ctx.lights ? lit : steel));
        }
      }
    }
  }
  if (p.finish === "warm-wood" && plan.items.length) {
    // A field of wood slats over the main seating.
    const seat = plan.items.filter((i) => i.group === "seating-group-1");
    const main = plan.items.filter((i) => i.group === MAIN_GROUP);
    const src = seat.length ? seat : main;
    if (src.length) {
      const r = unionRect(src.filter((i) => i.kind !== "pendant"));
      const lim = cove + 0.05;
      const x0 = Math.max(-hw + lim, r.x0 - 0.3);
      const x1 = Math.min(hw - lim, r.x1 + 0.3);
      const z0 = Math.max(-hd + lim, r.z0 - 0.3);
      const z1 = Math.min(hd - lim, r.z1 + 0.3);
      const alongZ = z1 - z0 >= x1 - x0;
      const span = alongZ ? x1 - x0 : z1 - z0;
      const n = Math.min(90, Math.floor(span / 0.11));
      for (let i = 0; i < n; i++) {
        const t = (alongZ ? x0 : z0) + 0.03 + i * 0.11;
        const col = shade(c.wood, rand.range(0.92, 1.08));
        if (alongZ) bx(b, t, H - 0.09, z0, t + 0.045, H - 0.005, z1, col);
        else bx(b, x0, H - 0.09, t, x1, H - 0.005, t + 0.045, col);
      }
    }
  }
  // Floor plates above the hall (a tall host shows floors from outside).
  for (let k = 1; k <= p.plates; k++) {
    const y0 = H + k * p.storey;
    bx(b, -hw, y0, -hd, hw, y0 + 0.25, hd, shade(c.floorAlt, 0.72), { top: c.floorAlt, bottom: c.ceiling });
    const nx = Math.max(1, Math.min(4, Math.round(p.width / 5)));
    const nz = Math.max(1, Math.min(3, Math.round(p.depth / 5)));
    b.withMat(panelMat, () => {
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const x = -hw + ((i + 0.5) * p.width) / nx;
          const z = -hd + ((j + 0.5) * p.depth) / nz;
          down(b, x - 0.6, z - 0.3, x + 0.6, z + 0.3, y0 - 0.004, ctx.lights ? lit : shade(c.ceiling, 1.04));
        }
    });
  }
}

// ── Walls (shell) and the lift core ──────────────────────────

type Opening = { u0: number; u1: number; v0: number; v1: number; glass: boolean };

/**
 * A wall in its own frame: u along the wall (0..L), v up, t from the inner face (0) to the
 * outer face (T, local +z). Openings share one row (all v0 and v1 equal).
 */
function wallLocal(ctx: Ctx, L: number, Hw: number, T: number, ops: Opening[]) {
  const { b, c } = ctx;
  const inner = c.wall;
  const outer = shade(c.wall, 0.86);
  const reveal = shade(c.wall, 0.78);
  const face = (u0: number, u1: number, v0: number, v1: number) => {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) return;
    b.quad([u1, v0, 0], [u0, v0, 0], [u0, v1, 0], [u1, v1, 0], inner);
    b.quad([u0, v0, T], [u1, v0, T], [u1, v1, T], [u0, v1, T], outer);
  };
  const ws = [...ops].sort((a, b2) => a.u0 - b2.u0);
  const v0 = ws.length ? ws[0].v0 : 0;
  const v1 = ws.length ? ws[0].v1 : 0;
  if (!ws.length) face(0, L, 0, Hw);
  else {
    face(0, L, 0, v0);
    face(0, L, v1, Hw);
    let u = 0;
    for (const w of ws) {
      face(u, w.u0, v0, v1);
      u = w.u1;
    }
    face(u, L, v0, v1);
  }
  b.quad([0, Hw, T], [L, Hw, T], [L, Hw, 0], [0, Hw, 0], shade(c.wall, 0.7));
  for (const w of ws) {
    b.quad([w.u0, w.v0, 0], [w.u0, w.v0, T], [w.u0, w.v1, T], [w.u0, w.v1, 0], reveal);
    b.quad([w.u1, w.v0, T], [w.u1, w.v0, 0], [w.u1, w.v1, 0], [w.u1, w.v1, T], reveal);
    b.quad([w.u0, w.v1, 0], [w.u1, w.v1, 0], [w.u1, w.v1, T], [w.u0, w.v1, T], shade(reveal, 0.8));
    if (w.v0 > 0) b.quad([w.u0, w.v0, T], [w.u1, w.v0, T], [w.u1, w.v0, 0], [w.u0, w.v0, 0], shade(reveal, 1.12));
    if (w.glass) {
      const tm = T / 2;
      b.withMat("glass", () => b.quad([w.u0, w.v0, tm], [w.u1, w.v0, tm], [w.u1, w.v1, tm], [w.u0, w.v1, tm], rgb("#8fb4c8")));
      const f = 0.05;
      const fc = c.metal;
      bx(b, w.u0, w.v0, tm - 0.03, w.u0 + f, w.v1, tm + 0.03, fc);
      bx(b, w.u1 - f, w.v0, tm - 0.03, w.u1, w.v1, tm + 0.03, fc);
      bx(b, w.u0 + f, w.v0, tm - 0.03, w.u1 - f, w.v0 + f, tm + 0.03, fc);
      bx(b, w.u0 + f, w.v1 - f, tm - 0.03, w.u1 - f, w.v1, tm + 0.03, fc);
      const um = (w.u0 + w.u1) / 2;
      bx(b, um - 0.02, w.v0 + f, tm - 0.025, um + 0.02, w.v1 - f, tm + 0.025, fc);
    }
  }
  // Baseboard on the inner face, broken at a door.
  const base = shade(c.wall, 0.72);
  let u = 0;
  for (const w of ws.filter((o) => o.v0 === 0)) {
    if (w.u0 - u > 0.02) bx(b, u, 0, -0.015, w.u0, 0.09, 0, base, { bottom: false });
    u = w.u1;
  }
  if (L - u > 0.02) bx(b, u, 0, -0.015, L, 0.09, 0, base, { bottom: false });
}

function buildShell(ctx: Ctx) {
  const { b, p } = ctx;
  const [W, D] = canonicalSize(p);
  const hw = W / 2;
  const hd = D / 2;
  const T = 0.15;
  const Hw = p.height + 0.12;
  const k = sideTurns(p.front);
  const doorTop = Math.min(2.2, p.height - 0.1);
  const windows = (L: number): Opening[] => {
    const n = Math.max(1, Math.floor((L - 1) / 3));
    const out: Opening[] = [];
    for (let i = 0; i < n; i++) {
      const uc = L / 2 + (i - (n - 1) / 2) * 3;
      if (uc - 0.7 < 0.3 || uc + 0.7 > L - 0.3) continue;
      out.push({ u0: uc - 0.7, u1: uc + 0.7, v0: 0.9, v1: Math.min(2.2, p.height - 0.1), glass: true });
    }
    return out;
  };
  const M = (rot: number, x: number, z: number) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
  b.with(new THREE.Matrix4().makeRotationY(k * Q), () => {
    const L = W + 2 * T;
    b.with(M(0, -hw - T, hd), () => wallLocal(ctx, L, Hw, T, [{ u0: T + hw - 0.8, u1: T + hw + 0.8, v0: 0, v1: doorTop, glass: false }]));
    b.with(M(Math.PI, hw + T, -hd), () => wallLocal(ctx, L, Hw, T, []));
    b.with(M(Q, hw, hd), () => wallLocal(ctx, D, Hw, T, windows(D)));
    b.with(M(-Q, -hw, -hd), () => wallLocal(ctx, D, Hw, T, windows(D)));
  });
}

function drawCore(ctx: Ctx, it: InteriorItem) {
  const { b, p, c } = ctx;
  const w = it.w;
  const d = it.d;
  const Hc = p.height - FY;
  const clad = p.finish === "warm-wood" ? c.wood : p.finish === "light-minimal" ? shade(c.wall, 0.9) : c.wall;
  bx(b, -w / 2, 0, -d / 2, w / 2, Hc, d / 2, shade(clad, 0.9), { top: clad, bottom: false });
  // Vertical cladding joints on the face.
  const zf = d / 2;
  const n = liftCount(it);
  const pitch = w / n;
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.6) {
    const near = Array.from({ length: n }, (_, i) => -w / 2 + (i + 0.5) * pitch).some((xc) => Math.abs(x - xc) < 0.8);
    if (!near) front(b, x - 0.006, 0, x + 0.006, Hc, zf + 0.002, shade(clad, 0.7));
  }
  const doorH = Math.min(2.2, Hc - 0.35);
  for (let i = 0; i < n; i++) {
    const xc = -w / 2 + (i + 0.5) * pitch;
    b.withMat("gold", () => {
      bx(b, xc - 0.68, 0, zf, xc + 0.68, doorH + 0.14, zf + 0.05, c.metal, { bottom: false });
      const leaf = mix(c.metal, rgb("#d8d8d4"), 0.35);
      bx(b, xc - 0.55, 0.01, zf + 0.05, xc - 0.01, doorH, zf + 0.07, leaf, { bottom: false });
      bx(b, xc + 0.01, 0.01, zf + 0.05, xc + 0.55, doorH, zf + 0.07, shade(leaf, 0.96), { bottom: false });
    });
    const sy = doorH + 0.24;
    if (sy + 0.1 < Hc) b.withMat(ctx.lights ? "lit" : "base", () => bx(b, xc - 0.18, sy, zf, xc + 0.18, sy + 0.1, zf + 0.04, ctx.lights ? rgb(paletteOf(p.finish).light) : c.accent));
    if (i < n - 1) {
      const xb = xc + pitch / 2;
      b.withMat("gold", () => bx(b, xb - 0.06, 1.0, zf, xb + 0.06, 1.3, zf + 0.025, c.metal));
    }
  }
  // Fascia band above the doors.
  if (Hc > 3) bx(b, -w / 2, doorH + 0.5, zf, w / 2, doorH + 0.58, zf + 0.03, c.accent);
}

// ── Furniture ────────────────────────────────────────────────

function drawSofa(ctx: Ctx, w: number, d: number, seats: number, v: number) {
  const { b, c } = ctx;
  const fab = shade(c.fabric, v);
  const cush = shade(fab, 1.1);
  legs(b, w, d, 0.1, 0.12, 0.05, c.metal);
  bx(b, -w / 2, 0.12, -d / 2, w / 2, 0.38, d / 2, shade(fab, 0.9), { chamfer: 0.03 });
  bx(b, -w / 2, 0.38, -d / 2, w / 2, 0.8, -d / 2 + 0.2, shade(fab, 0.94), { chamfer: 0.05, bottom: false });
  bx(b, -w / 2, 0.38, -d / 2 + 0.2, -w / 2 + 0.16, 0.62, d / 2, fab, { chamfer: 0.04, bottom: false });
  bx(b, w / 2 - 0.16, 0.38, -d / 2 + 0.2, w / 2, 0.62, d / 2, fab, { chamfer: 0.04, bottom: false });
  const xa = -w / 2 + 0.16;
  const cw = (w - 0.32) / seats;
  for (let i = 0; i < seats; i++) {
    const x0 = xa + i * cw + 0.008;
    const x1 = xa + (i + 1) * cw - 0.008;
    bx(b, x0, 0.38, -d / 2 + 0.2, x1, 0.5, d / 2 - 0.02, shade(cush, 1 + (i % 2) * 0.03), { chamfer: 0.035, bottom: false });
    bx(b, x0 + 0.01, 0.5, -d / 2 + 0.2, x1 - 0.01, 0.76, -d / 2 + 0.36, shade(cush, 0.96), { chamfer: 0.05, bottom: false });
  }
}

function drawPlant(ctx: Ctx, h: number, rand: Rand) {
  const { b, c, p } = ctx;
  const pot = p.finish === "dark-industrial" ? shade(c.metal, 1.6) : shade(mix(c.wall, c.floorAlt, 0.5), rand.range(0.85, 0.95));
  const soil = rgb("#3a2c22");
  lathe(b, [[0, 0], [0.19, 0], [0.25, 0.46], [0.21, 0.46], [0, 0.42]], 8, (_i, j) => (j === 3 ? soil : j === 2 ? shade(pot, 1.1) : pot));
  const leaf = c.plant;
  const tall = h >= 1.55;
  const blobs: [number, number, number, number][] = [];
  if (tall) {
    bar(b, [[0, 0.42, 0], [0.02, h * 0.55, 0.01]], 0.022, 0.022, rgb("#5a4030"));
    blobs.push([0.05, h * 0.52, 0, 0.32], [-0.14, h * 0.66, 0.08, 0.28], [0.12, h * 0.74, -0.08, 0.27], [0, h * 0.86, 0.02, 0.22]);
  } else {
    blobs.push([0, 0.5, 0, 0.36], [-0.15, 0.62 + (h - 0.9) * 0.4, 0.1, 0.3], [0.14, 0.7 + (h - 0.9) * 0.5, -0.06, 0.28], [0, h - 0.3, 0, 0.22]);
  }
  for (const [x, y, z, r] of blobs) {
    const top = Math.min(h, y + r * 2);
    const ry = top - y;
    const col = shade(leaf, rand.range(0.85, 1.12));
    lathe(b, [[0, y], [r, y + ry * 0.4], [r * 0.7, y + ry * 0.8], [0, top]], 6, (i, j) => shade(col, j === 0 ? 0.85 : 1 + (i % 2) * 0.06), [x, 0, z], rand.range(0, 1));
  }
}

function drawStorage(ctx: Ctx, it: InteriorItem, rand: Rand) {
  const { b, c } = ctx;
  const w = it.w;
  const d = it.d;
  const carcass = shade(c.wood, rand.range(0.96, 1.04));
  bx(b, -w / 2 + 0.02, 0, -d / 2, w / 2 - 0.02, 0.08, d / 2 - 0.04, shade(c.metal, 1.2), { bottom: false });
  bx(b, -w / 2, 0.08, -d / 2, -w / 2 + 0.025, 2.0, d / 2, carcass, { bottom: false });
  bx(b, w / 2 - 0.025, 0.08, -d / 2, w / 2, 2.0, d / 2, carcass, { bottom: false });
  bx(b, -w / 2, 1.975, -d / 2, w / 2, 2.0, d / 2, carcass, { bottom: false });
  bx(b, -w / 2 + 0.025, 0.08, -d / 2, w / 2 - 0.025, 1.975, -d / 2 + 0.02, shade(carcass, 0.75), { bottom: false });
  // Closed lower part with two doors.
  bx(b, -w / 2 + 0.025, 0.08, -d / 2 + 0.02, w / 2 - 0.025, 0.9, d / 2, shade(carcass, 0.9), { bottom: false });
  const door = shade(mix(c.wall, c.wood, 0.3), 1.05);
  front(b, -w / 2 + 0.03, 0.1, -0.004, 0.88, d / 2 + 0.003, door);
  front(b, 0.004, 0.1, w / 2 - 0.03, 0.88, d / 2 + 0.003, shade(door, 0.97));
  b.withMat("gold", () => {
    bx(b, -0.06, 0.72, d / 2, -0.03, 0.84, d / 2 + 0.025, c.accent);
    bx(b, 0.03, 0.72, d / 2, 0.06, 0.84, d / 2 + 0.025, c.accent);
  });
  // Open shelves with books.
  for (const y of [0.9, 1.3, 1.65]) {
    if (y > 0.95) bx(b, -w / 2 + 0.025, y - 0.025, -d / 2 + 0.02, w / 2 - 0.025, y, d / 2, carcass);
    let x = -w / 2 + 0.06 + rand.range(0, 0.15);
    const end = w / 2 - 0.08;
    while (x < end - 0.05) {
      const run = Math.min(end - x, rand.range(0.18, 0.4));
      const bh = rand.range(0.22, 0.3);
      bx(b, x, y, -d / 2 + 0.05, x + run, y + bh, d / 2 - 0.08, BOOK_COLORS[Math.floor(rand.next() * BOOK_COLORS.length)], { bottom: false });
      x += run + rand.range(0.08, 0.3);
    }
  }
}

function drawCounter(ctx: Ctx, w: number, d: number, rand: Rand) {
  const { b, c, p } = ctx;
  const body = p.finish === "stone-brass" ? shade(c.wall, 1.1) : p.finish === "dark-industrial" ? shade(c.metal, 1.4) : c.wood;
  const zf = d / 2 - 0.22;
  bx(b, -w / 2, 0, -d / 2, w / 2, 1.0, zf, shade(body, 0.9), { bottom: false });
  const top = p.finish === "warm-wood" ? shade(c.wood, 0.8) : mix(c.floor, rgb("#ffffff"), 0.25);
  bx(b, -w / 2 - 0.02, 1.0, -d / 2, w / 2 + 0.02, 1.05, d / 2, top, { chamfer: 0.012 });
  if (p.finish === "stone-brass") {
    for (let x = -w / 2; x < w / 2 - 0.05; x += 1.2) front(b, x + 0.01, 0.12, Math.min(w / 2, x + 1.2) - 0.01, 0.98, zf + 0.003, shade(body, rand.range(0.95, 1.06)));
  } else {
    const n = Math.floor(w / 0.12);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.035 + i * 0.12;
      bx(b, x, 0.12, zf, x + 0.05, 0.98, zf + 0.025, shade(body, rand.range(0.94, 1.08)), { bottom: false });
    }
  }
  b.withMat("gold", () => {
    bx(b, -w / 2, 0, -d / 2 + 0.02, w / 2, 0.12, zf - 0.03, shade(c.metal, 0.9), { bottom: false });
    bar(b, [[-w / 2 + 0.1, 0.2, d / 2 - 0.1], [w / 2 - 0.1, 0.2, d / 2 - 0.1]], 0.022, 0.022, c.accent);
  });
}

function drawFurniture(ctx: Ctx, it: InteriorItem, rand: Rand) {
  const { b, c, p } = ctx;
  const w = it.w;
  const d = it.d;
  const v = rand.range(0.95, 1.05);
  const wood = shade(c.wood, v);
  const lit = rgb(paletteOf(p.finish).light);
  switch (it.kind) {
    case "rug": {
      bx(b, -w / 2, 0, -d / 2, w / 2, 0.012, d / 2, shade(c.rug, 0.8), { top: shade(c.rug, 0.82), bottom: false });
      up(b, -w / 2 + 0.14, -d / 2 + 0.14, w / 2 - 0.14, d / 2 - 0.14, 0.0125, shade(c.rug, v));
      return;
    }
    case "sofa":
      return drawSofa(ctx, w, d, w >= 1.9 ? 3 : 2, v);
    case "armchair":
      return drawSofa(ctx, w, d, 1, v * 1.02);
    case "coffee-table": {
      legs(b, w, d, 0.06, it.h - 0.04, 0.05, c.metal);
      bx(b, -w / 2, it.h - 0.04, -d / 2, w / 2, it.h, d / 2, wood, { chamfer: 0.015 });
      bx(b, -w / 2 + 0.06, 0.12, -d / 2 + 0.06, w / 2 - 0.06, 0.15, d / 2 - 0.06, shade(wood, 0.9));
      bx(b, -0.25, it.h, -0.1, 0.02, it.h + 0.05, 0.12, c.accent, { bottom: false });
      lathe(b, [[0, it.h], [0.07, it.h], [0.09, it.h + 0.08], [0, it.h + 0.06]], 6, shade(c.fabricAlt, 1.1), [0.25, 0, 0]);
      return;
    }
    case "reception-desk": {
      const front0 = d / 2 - 0.75;
      const body = p.finish === "stone-brass" || p.finish === "dark-industrial" ? shade(mix(c.floor, c.wall, 0.2), 1.05) : c.wood;
      bx(b, -w / 2, 0.08, front0, w / 2, 1.05, d / 2 - 0.02, shade(body, 0.92), { bottom: false });
      bx(b, -w / 2 + 0.04, 0, front0 + 0.04, w / 2 - 0.04, 0.08, d / 2 - 0.08, shade(c.metal, 0.9), { bottom: false });
      const top = p.finish === "warm-wood" ? mix(c.floor, rgb("#ffffff"), 0.4) : mix(c.floor, rgb("#ffffff"), 0.3);
      bx(b, -w / 2 - 0.03, 1.05, front0 + 0.15, w / 2 + 0.03, 1.1, d / 2 + 0.03, top, { chamfer: 0.012 });
      if (p.finish === "stone-brass" || p.finish === "dark-industrial") {
        for (let x = -w / 2; x < w / 2 - 0.05; x += 0.9) front(b, x + 0.006, 0.1, Math.min(w / 2, x + 0.9) - 0.006, 1.03, d / 2 - 0.017, shade(body, rand.range(0.95, 1.07)));
        b.withMat("gold", () => bx(b, -w / 2, 0.86, d / 2 - 0.02, w / 2, 0.9, d / 2 + 0.005, c.accent));
      } else {
        const n = Math.floor(w / 0.1);
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + 0.03 + i * 0.1;
          bx(b, x, 0.1, d / 2 - 0.02, x + 0.05, 1.03, d / 2 + 0.005, shade(c.wood, rand.range(0.9, 1.1)), { bottom: false });
        }
      }
      // Lower worktop behind, on two panel legs.
      const wz0 = -d / 2;
      bx(b, -w / 2 + 0.05, 0.71, wz0, w / 2 - 0.05, 0.75, front0, shade(c.wood, 1.08), { chamfer: 0.01 });
      bx(b, -w / 2 + 0.05, 0, wz0 + 0.04, -w / 2 + 0.09, 0.71, front0, c.metal, { bottom: false });
      bx(b, w / 2 - 0.09, 0, wz0 + 0.04, w / 2 - 0.05, 0.71, front0, c.metal, { bottom: false });
      for (const sx of [-1, 1]) monitor(ctx, (sx * w) / 4, 0.75, front0 - 0.08, true);
      return;
    }
    case "task-chair": {
      const steel = shade(c.metal, 1.1);
      bx(b, -0.28, 0.02, -0.025, 0.28, 0.07, 0.025, steel);
      bx(b, -0.025, 0.02, -0.28, 0.025, 0.07, 0.28, steel);
      bx(b, -0.03, 0.07, -0.03, 0.03, 0.42, 0.03, steel, { bottom: false });
      bx(b, -0.25, 0.42, -0.24, 0.25, 0.5, 0.24, shade(c.fabricAlt, v), { chamfer: 0.03 });
      bx(b, -0.03, 0.45, -0.27, 0.03, 0.62, -0.22, steel);
      bx(b, -0.23, 0.58, -0.28, 0.23, 1.0, -0.21, shade(c.fabricAlt, v * 0.88), { chamfer: 0.03 });
      return;
    }
    case "chair": {
      const s = w / 0.5;
      const legC = p.finish === "warm-wood" || p.finish === "light-minimal" ? shade(c.wood, 0.9) : c.metal;
      legs(b, 0.44 * s, 0.44 * s, 0.03, 0.43, 0.04, legC);
      bx(b, -0.22 * s, 0.43, -0.22 * s, 0.22 * s, 0.48, 0.22 * s, shade(c.fabricAlt, v), { chamfer: 0.015 });
      bx(b, -0.2 * s, 0.24, -0.22 * s, -0.2 * s + 0.04, 0.85, -0.22 * s + 0.04, legC, { bottom: false });
      bx(b, 0.2 * s - 0.04, 0.24, -0.22 * s, 0.2 * s, 0.85, -0.22 * s + 0.04, legC, { bottom: false });
      bx(b, -0.2 * s, 0.6, -0.23 * s, 0.2 * s, 0.84, -0.22 * s + 0.045, shade(p.finish === "warm-wood" ? c.wood : c.fabricAlt, v * 0.92), { chamfer: 0.012 });
      return;
    }
    case "desk": {
      const top = p.finish === "dark-industrial" ? shade(c.wood, v) : mix(c.wood, rgb("#ffffff"), 0.25);
      bx(b, -w / 2, 0.71, -d / 2, w / 2, 0.74, d / 2, shade(top, v), { chamfer: 0.008 });
      bx(b, -w / 2 + 0.03, 0, -d / 2 + 0.06, -w / 2 + 0.07, 0.71, d / 2 - 0.06, c.metal, { bottom: false });
      bx(b, w / 2 - 0.07, 0, -d / 2 + 0.06, w / 2 - 0.03, 0.71, d / 2 - 0.06, c.metal, { bottom: false });
      bx(b, -w / 2 + 0.07, 0.4, -d / 2 + 0.08, w / 2 - 0.07, 0.68, -d / 2 + 0.1, shade(c.metal, 1.2), { bottom: false });
      bx(b, -w / 2 + 0.02, 0.74, -d / 2, w / 2 - 0.02, 1.1, -d / 2 + 0.03, shade(c.fabricAlt, rand.range(0.9, 1.05)), { chamfer: 0.01 });
      monitor(ctx, 0, 0.74, -d / 2 + 0.18, false);
      bx(b, -0.22, 0.74, 0.02, 0.22, 0.755, 0.16, rgb("#c8cacc"), { bottom: false });
      return;
    }
    case "meeting-table":
    case "dining-table": {
      const ty = it.kind === "dining-table" ? 0.72 : 0.71;
      bx(b, -w / 2, ty, -d / 2, w / 2, ty + 0.04, d / 2, wood, { chamfer: 0.015 });
      if (it.kind === "dining-table") legs(b, w, d, 0.1, ty, 0.06, shade(wood, 0.85));
      else {
        for (const sx of [-1, 1]) bx(b, sx * (w / 2 - 0.35) - 0.03, 0, -d / 2 + 0.15, sx * (w / 2 - 0.35) + 0.03, ty, d / 2 - 0.15, c.metal, { bottom: false });
        bx(b, -w / 2 + 0.35, 0.45, -0.04, w / 2 - 0.35, 0.53, 0.04, c.metal);
      }
      lathe(b, [[0, ty + 0.04], [0.06, ty + 0.04], [0.09, ty + 0.2], [0.05, ty + 0.26], [0, ty + 0.26]], 6, shade(c.accent, 1.05), [0, 0, 0]);
      return;
    }
    case "storage":
      return drawStorage(ctx, it, rand);
    case "plant":
      return drawPlant(ctx, it.h, rand);
    case "bar":
    case "bar-return":
    case "island": {
      if (it.kind === "island") {
        const body = shade(c.wood, v);
        bx(b, -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.88, d / 2 - 0.25, shade(body, 0.92), { bottom: false });
        const n = Math.max(1, Math.round(w / 0.6));
        for (let i = 0; i < n; i++) front(b, -w / 2 + 0.05 + (i * (w - 0.1)) / n + 0.004, 0.1, -w / 2 + 0.05 + ((i + 1) * (w - 0.1)) / n - 0.004, 0.84, d / 2 - 0.247, shade(body, 1 + (i % 2) * 0.04));
        bx(b, -w / 2, 0.88, -d / 2, w / 2, 0.92, d / 2, mix(c.floor, rgb("#ffffff"), 0.35), { chamfer: 0.01 });
        return;
      }
      return drawCounter(ctx, w, d, rand);
    }
    case "back-shelf": {
      const cab = shade(c.wood, 0.9);
      bx(b, -w / 2, 0, -d / 2, w / 2, 0.9, d / 2, shade(cab, 0.92), { bottom: false });
      const n = Math.max(1, Math.round(w / 0.6));
      for (let i = 0; i < n; i++) front(b, -w / 2 + (i * w) / n + 0.005, 0.08, -w / 2 + ((i + 1) * w) / n - 0.005, 0.86, d / 2 + 0.003, shade(cab, 1 + (i % 2) * 0.05));
      bx(b, -w / 2, 0.9, -d / 2, w / 2, 0.93, d / 2, mix(c.floor, rgb("#ffffff"), 0.2));
      const topY = Math.min(2.2, p.height - 0.1);
      b.withMat("glass", () => front(b, -w / 2, 0.93, w / 2, topY, -d / 2 + 0.02, shade(c.wall, 0.6)));
      bx(b, -w / 2, 0.93, -d / 2, -w / 2 + 0.04, topY, -d / 2 + 0.3, cab, { bottom: false });
      bx(b, w / 2 - 0.04, 0.93, -d / 2, w / 2, topY, -d / 2 + 0.3, cab, { bottom: false });
      for (const y of [1.35, 1.75]) {
        if (y + 0.35 > topY) continue;
        bx(b, -w / 2 + 0.04, y, -d / 2 + 0.02, w / 2 - 0.04, y + 0.03, -d / 2 + 0.28, shade(c.wood, 1.05));
        if (ctx.lights) b.withMat("lit", () => down(b, -w / 2 + 0.06, -d / 2 + 0.05, w / 2 - 0.06, -d / 2 + 0.09, y - 0.002, lit));
        let x = -w / 2 + 0.1;
        while (x < w / 2 - 0.12) {
          const bh = rand.range(0.2, 0.3);
          const col = BOTTLE_COLORS[Math.floor(rand.next() * BOTTLE_COLORS.length)];
          bx(b, x - 0.035, y + 0.03, -d / 2 + 0.1, x + 0.035, y + 0.03 + bh, -d / 2 + 0.17, col, { bottom: false });
          bx(b, x - 0.013, y + 0.03 + bh, -d / 2 + 0.122, x + 0.013, y + 0.1 + bh, -d / 2 + 0.148, shade(col, 0.8), { bottom: false });
          x += rand.range(0.09, 0.16) + (rand.next() < 0.12 ? 0.25 : 0);
        }
      }
      if (w >= 1.6) {
        const mx = -w / 2 + 0.45;
        const steel = rgb("#b8bcc0");
        b.withMat("gold", () => bx(b, mx - 0.25, 0.93, -d / 2 + 0.04, mx + 0.25, 1.38, d / 2 - 0.03, steel, { bottom: false }));
        bx(b, mx - 0.2, 1.08, d / 2 - 0.03, mx + 0.2, 1.12, d / 2 + 0.02, shade(c.metal, 1.1));
        bx(b, mx - 0.1, 0.96, d / 2 - 0.15, mx - 0.02, 1.02, d / 2 - 0.03, rgb("#2a2a2a"), { bottom: false });
        if (ctx.lights) b.withMat("lit", () => front(b, mx + 0.12, 1.28, mx + 0.2, 1.32, d / 2 - 0.028, rgb("#9fe0ff")));
      }
      return;
    }
    case "stool": {
      lathe(b, [[0, 0], [0.2, 0], [0.18, 0.03], [0, 0.03]], 8, c.metal);
      bar(b, [[0, 0.03, 0], [0, 0.72, 0]], 0.022, 0.022, c.metal);
      bx(b, -0.16, 0.28, -0.02, 0.16, 0.32, 0.02, shade(c.metal, 1.2));
      lathe(b, [[0, 0.72], [0.19, 0.72], [0.2, 0.76], [0.17, 0.79], [0, 0.79]], 8, shade(c.fabricAlt, v));
      return;
    }
    case "cafe-table": {
      lathe(b, [[0, 0], [0.25, 0], [0.22, 0.03], [0, 0.03]], 8, c.metal);
      bar(b, [[0, 0.03, 0], [0, 0.71, 0]], 0.03, 0.03, c.metal);
      lathe(b, [[0, 0.71], [0.35, 0.71], [0.35, 0.74], [0, 0.74]], 10, p.finish === "stone-brass" ? mix(c.floor, rgb("#ffffff"), 0.3) : wood);
      lathe(b, [[0, 0.74], [0.04, 0.74], [0.05, 0.84], [0, 0.84]], 5, shade(c.accent, 1.05), [0.12, 0, 0.05]);
      return;
    }
    case "booth": {
      const fab = shade(c.fabric, v * 0.96);
      bx(b, -w / 2, 0, -d / 2, w / 2, 0.42, d / 2 - 0.02, shade(wood, 0.85), { bottom: false });
      bx(b, -w / 2 + 0.02, 0.42, -d / 2 + 0.18, w / 2 - 0.02, 0.5, d / 2 - 0.02, shade(fab, 1.08), { chamfer: 0.03, bottom: false });
      bx(b, -w / 2, 0.42, -d / 2, w / 2, it.h - 0.03, -d / 2 + 0.18, fab, { chamfer: 0.04, bottom: false });
      bx(b, -w / 2, it.h - 0.03, -d / 2, w / 2, it.h, -d / 2 + 0.18, wood);
      return;
    }
    case "booth-table": {
      bx(b, -0.2, 0, -0.15, 0.2, 0.03, 0.15, c.metal);
      bar(b, [[0, 0.03, 0], [0, 0.71, 0]], 0.035, 0.035, c.metal);
      bx(b, -w / 2, 0.71, -d / 2, w / 2, 0.74, d / 2, p.finish === "stone-brass" ? mix(c.floor, rgb("#ffffff"), 0.3) : wood, { chamfer: 0.012 });
      return;
    }
    case "tv-console": {
      legs(b, w, d, 0.08, 0.1, 0.05, c.metal);
      bx(b, -w / 2, 0.1, -d / 2, w / 2, 0.5, d / 2, shade(wood, 0.9), { chamfer: 0.015 });
      for (let i = 0; i < 3; i++) front(b, -w / 2 + (i * w) / 3 + 0.01, 0.13, -w / 2 + ((i + 1) * w) / 3 - 0.01, 0.47, d / 2 + 0.003, shade(wood, 1 + (i % 2) * 0.06));
      bx(b, -0.12, 0.5, -0.12, 0.12, 0.52, 0.04, rgb("#1a1c1e"));
      bx(b, -0.03, 0.52, -0.06, 0.03, 0.6, -0.02, rgb("#1a1c1e"), { bottom: false });
      bx(b, -0.7, 0.58, -0.07, 0.7, 1.38, -0.03, rgb("#141618"));
      front(b, -0.68, 0.6, 0.68, 1.36, -0.028, rgb("#1e2a36"));
      return;
    }
    case "kitchen":
      return drawKitchen(ctx, it, rand);
    case "fridge": {
      const body = rgb("#c9ccce");
      bx(b, -w / 2 + 0.01, 0, -d / 2, w / 2 - 0.01, 2.0, d / 2, shade(body, 0.92), { top: body, bottom: false });
      front(b, -w / 2 + 0.01, 1.3, w / 2 - 0.01, 1.32, d / 2 + 0.002, shade(body, 0.6));
      b.withMat("gold", () => {
        bx(b, w / 2 - 0.1, 1.4, d / 2, w / 2 - 0.06, 1.8, d / 2 + 0.04, shade(c.metal, 1.4));
        bx(b, w / 2 - 0.1, 0.9, d / 2, w / 2 - 0.06, 1.24, d / 2 + 0.04, shade(c.metal, 1.4));
      });
      return;
    }
    case "bed": {
      legs(b, w, d, 0.08, 0.08, 0.05, c.metal);
      bx(b, -w / 2, 0.08, -d / 2 + 0.1, w / 2, 0.32, d / 2, shade(wood, 0.95), { chamfer: 0.02 });
      bx(b, -w / 2, 0, -d / 2, w / 2, it.h, -d / 2 + 0.1, shade(c.fabricAlt, v * 0.9), { chamfer: 0.04, bottom: false });
      const sheet = rgb("#ece8e0");
      bx(b, -w / 2 + 0.03, 0.32, -d / 2 + 0.12, w / 2 - 0.03, 0.52, d / 2 - 0.03, sheet, { chamfer: 0.04, bottom: false });
      bx(b, -w / 2 + 0.01, 0.5, -d / 2 + 0.75, w / 2 - 0.01, 0.56, d / 2 - 0.01, shade(c.fabric, v * 1.05), { chamfer: 0.03, bottom: false });
      bx(b, -w / 2 + 0.005, 0.56, d / 2 - 0.5, w / 2 - 0.005, 0.6, d / 2 - 0.2, shade(c.fabricAlt, v), { chamfer: 0.015, bottom: false });
      for (const sx of [-1, 1]) bx(b, sx * 0.4 - 0.33, 0.52, -d / 2 + 0.16, sx * 0.4 + 0.33, 0.66, -d / 2 + 0.52, shade(sheet, 1.02), { chamfer: 0.05, bottom: false });
      return;
    }
    case "nightstand": {
      legs(b, w, d, 0.04, 0.06, 0.04, c.metal);
      bx(b, -w / 2, 0.06, -d / 2, w / 2, 0.5, d / 2, wood, { chamfer: 0.012 });
      front(b, -w / 2 + 0.03, 0.3, w / 2 - 0.03, 0.31, d / 2 + 0.002, shade(wood, 0.7));
      lathe(b, [[0, 0.5], [0.07, 0.5], [0.06, 0.53], [0, 0.53]], 6, c.metal);
      bar(b, [[0, 0.53, 0], [0, 0.72, 0]], 0.02, 0.02, c.metal);
      const shadeCol = ctx.lights ? mix(lit, c.fabricAlt, 0.15) : shade(c.fabricAlt, 1.2);
      b.withMat(ctx.lights ? "lit" : "base", () => lathe(b, [[0.14, 0.7], [0.1, 0.9], [0, 0.9]], 8, shadeCol));
      return;
    }
    case "wardrobe": {
      const hw2 = Math.min(it.h, p.height - FY - 0.1);
      const body = shade(mix(c.wall, c.wood, 0.4), v);
      bx(b, -w / 2, 0, -d / 2, w / 2, hw2, d / 2, shade(body, 0.85), { top: body, bottom: false });
      const n = Math.max(2, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + (i * w) / n + 0.004;
        const x1 = -w / 2 + ((i + 1) * w) / n - 0.004;
        front(b, x0, 0.08, x1, hw2 - 0.04, d / 2 + 0.003, shade(body, 1 + (i % 2) * 0.04));
        const hx = i % 2 ? x0 + 0.05 : x1 - 0.05;
        b.withMat("gold", () => bx(b, hx - 0.012, 0.9, d / 2, hx + 0.012, 1.3, d / 2 + 0.03, c.accent));
      }
      return;
    }
    case "low-shelf": {
      const col = shade(wood, 1.05);
      bx(b, -w / 2, 0, -d / 2, w / 2, 0.05, d / 2, shade(col, 0.85), { bottom: false });
      bx(b, -w / 2, it.h - 0.03, -d / 2, w / 2, it.h, d / 2, col);
      bx(b, -w / 2, 0.05, -d / 2, -w / 2 + 0.03, it.h - 0.03, d / 2, col, { bottom: false });
      bx(b, w / 2 - 0.03, 0.05, -d / 2, w / 2, it.h - 0.03, d / 2, col, { bottom: false });
      bx(b, -w / 2 + 0.03, 0.5, -d / 2, w / 2 - 0.03, 0.53, d / 2, col);
      for (const x of [-w / 6, w / 6]) bx(b, x - 0.015, 0.05, -d / 2, x + 0.015, it.h - 0.03, d / 2, col, { bottom: false });
      for (const [x, y] of [[-w / 3, 0.53], [w / 3, 0.05], [0, 0.05]] as [number, number][]) {
        bx(b, x - 0.2, y, -0.1, x + 0.02, y + 0.26, 0.1, BOOK_COLORS[Math.floor(rand.next() * BOOK_COLORS.length)], { bottom: false });
      }
      lathe(b, [[0, 0.53], [0.07, 0.53], [0.09, 0.66], [0.04, 0.78], [0, 0.78]], 6, shade(c.accent, 1.05), [0, 0, 0]);
      lathe(b, [[0, it.h], [0.06, it.h], [0.08, it.h + 0.12], [0, it.h + 0.12]], 6, shade(c.fabricAlt, 1.1), [w / 3, 0, 0]);
      return;
    }
  }
}

function monitor(ctx: Ctx, x: number, y: number, z: number, small: boolean) {
  const { b } = ctx;
  const dark = rgb("#1b1e21");
  const hw = small ? 0.26 : 0.3;
  bx(b, x - 0.12, y, z - 0.08, x + 0.12, y + 0.015, z + 0.06, dark, { bottom: false });
  bx(b, x - 0.025, y + 0.015, z - 0.04, x + 0.025, y + 0.2, z - 0.01, dark, { bottom: false });
  bx(b, x - hw, y + 0.16, z - 0.01, x + hw, y + 0.5, z + 0.02, dark);
  front(b, x - hw + 0.015, y + 0.175, x + hw - 0.015, y + 0.485, z + 0.022, rgb("#2b3d4f"));
}

function drawKitchen(ctx: Ctx, it: InteriorItem, rand: Rand) {
  const { b, c, p } = ctx;
  const w = it.w;
  const d = it.d;
  const n = Math.max(1, Math.round(w / 0.6));
  const uw = w / n;
  const fronts = p.finish === "light-minimal" ? rgb("#f2f0ea") : p.finish === "stone-brass" ? shade(c.wall, 1.15) : p.finish === "dark-industrial" ? shade(c.metal, 1.6) : c.wood;
  const carcass = shade(fronts, 0.8);
  bx(b, -w / 2, 0, -d / 2, w / 2, 0.1, d / 2 - 0.06, shade(c.metal, 0.9), { bottom: false });
  bx(b, -w / 2, 0.1, -d / 2, w / 2, 0.86, d / 2 - 0.02, carcass, { bottom: false });
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * uw + 0.004;
    const x1 = -w / 2 + (i + 1) * uw - 0.004;
    front(b, x0, 0.12, x1, 0.84, d / 2 - 0.017, shade(fronts, rand.range(0.97, 1.03)));
    b.withMat("gold", () => bx(b, (x0 + x1) / 2 - 0.15, 0.76, d / 2 - 0.02, (x0 + x1) / 2 + 0.15, 0.78, d / 2 + 0.01, c.accent));
  }
  const top = mix(c.floor, rgb("#ffffff"), 0.35);
  bx(b, -w / 2 - 0.01, 0.86, -d / 2, w / 2 + 0.01, 0.9, d / 2 + 0.01, top, { chamfer: 0.008 });
  // Sink and hob marks.
  const sx = n >= 3 ? -w / 2 + uw * 1.5 : -w / 4;
  up(b, sx - 0.28, -0.18, sx + 0.28, 0.15, 0.902, rgb("#8a9096"));
  up(b, sx - 0.24, -0.14, sx + 0.24, 0.11, 0.903, rgb("#5d6368"));
  b.withMat("gold", () => bar(b, [[sx, 0.9, -d / 2 + 0.07], [sx, 1.18, -d / 2 + 0.07], [sx, 1.18, -d / 2 + 0.24]], 0.02, 0.02, shade(c.metal, 1.4)));
  const hx = n >= 3 ? w / 2 - uw * 1.5 : w / 4;
  up(b, hx - 0.3, -0.2, hx + 0.3, 0.2, 0.902, rgb("#141516"));
  for (const [ox, oz] of [[-0.13, -0.09], [0.13, -0.09], [-0.13, 0.09], [0.13, 0.09]] as [number, number][]) up(b, hx + ox - 0.07, oz - 0.07, hx + ox + 0.07, oz + 0.07, 0.903, rgb("#3a3c3e"));
  // Backsplash and wall cabinets.
  const wy0 = 1.45;
  const wy1 = Math.min(2.15, p.height - FY - 0.08);
  front(b, -w / 2, 0.9, w / 2, wy0, -d / 2 + 0.003, shade(c.floorAlt, 1.05));
  if (wy1 - wy0 > 0.3) {
    bx(b, -w / 2, wy0, -d / 2, w / 2, wy1, -d / 2 + 0.35, carcass);
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + i * uw + 0.004;
      const x1 = -w / 2 + (i + 1) * uw - 0.004;
      front(b, x0, wy0 + 0.02, x1, wy1 - 0.02, -d / 2 + 0.353, shade(fronts, rand.range(1.0, 1.06)));
    }
    if (ctx.lights) b.withMat("lit", () => down(b, -w / 2 + 0.05, -d / 2 + 0.25, w / 2 - 0.05, -d / 2 + 0.3, wy0 - 0.002, rgb(paletteOf(p.finish).light)));
    bx(b, hx - 0.3, wy0 - 0.12, -d / 2, hx + 0.3, wy0, -d / 2 + 0.45, shade(c.metal, 1.3));
  }
}

// ── Lamps ────────────────────────────────────────────────────

function drawLamp(ctx: Ctx, it: InteriorItem, rand: Rand) {
  const { b, c, p } = ctx;
  const lit = rgb(paletteOf(p.finish).light);
  if (it.kind === "pendant") {
    const ceil = p.height - FY;
    const yb = Math.max(1.75, Math.min(2.35, p.height - 0.95));
    const shadeCol = p.finish === "stone-brass" ? c.accent : p.finish === "warm-wood" ? shade(c.accent, 0.9) : shade(c.metal, 1.1);
    bar(b, [[0, yb + 0.26, 0], [0, ceil, 0]], 0.02, 0.02, shade(c.metal, 0.9));
    b.withMat(p.finish === "stone-brass" ? "gold" : "base", () => lathe(b, [[0, yb + 0.29], [0.07, yb + 0.28], [0.19, yb + 0.03], [0.2, yb]], 8, shadeCol));
    b.withMat("lit", () => lathe(b, [[0.19, yb + 0.012], [0, yb + 0.012]], 8, lit));
    down(b, -0.08, -0.08, 0.08, 0.08, ceil - 0.005, shade(c.metal, 0.9));
    return;
  }
  // Floor lamp.
  lathe(b, [[0, 0], [0.16, 0], [0.15, 0.03], [0, 0.03]], 8, c.metal);
  bar(b, [[0.0, 0.03, 0], [0.0, 1.37, 0]], 0.02, 0.02, c.metal);
  b.withMat("lit", () => lathe(b, [[0.2, 1.33], [0.16, 1.63], [0, 1.63]], 8, mix(lit, c.fabricAlt, 0.12 * rand.next())));
}

// ── Build ────────────────────────────────────────────────────

const LAMP_KINDS = new Set(["pendant", "floor-lamp"]);

export function buildInterior(p: InteriorParams): BuiltInterior {
  const plan = planInterior(p);
  const pal = paletteOf(p.finish);
  const c = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, rgb(v)])) as Pal;
  const b = new MeshBuilder();
  const ctx: Ctx = { b, p, c, lights: p.lights };
  const rand = new Rand(p.seed * 7919 + 101);

  if (p.floor) {
    buildFloor(ctx, rand);
    buildEntrance(ctx);
  }
  if (p.ceiling) buildCeiling(ctx, plan, rand);
  const cores = plan.items.filter((i) => i.kind === "lift-core");
  if (p.shell || cores.length) {
    b.stage("Walls");
    if (p.shell) buildShell(ctx);
    for (const it of cores) b.with(itemMatrix(it), () => drawCore(ctx, it));
  }
  if (p.furniture) {
    b.stage("Furniture");
    plan.items.forEach((it, i) => {
      if (it.kind === "lift-core" || LAMP_KINDS.has(it.kind)) return;
      const r = new Rand(p.seed * 31 + i * 977);
      b.with(itemMatrix(it), () => drawFurniture(ctx, it, r));
    });
  }
  if (p.lights) {
    b.stage("Lights");
    plan.items.forEach((it, i) => {
      if (!LAMP_KINDS.has(it.kind)) return;
      const r = new Rand(p.seed * 53 + i * 131);
      b.with(itemMatrix(it), () => drawLamp(ctx, it, r));
    });
  }

  const triangles = b.triangleCount();
  const stages = b.stages
    .map((s) => ({ label: s.label, minY: Number.isFinite(s.minY) ? Math.max(0, s.minY) : 0, geometries: stageGeometries(s) }))
    .filter((s) => Object.keys(s.geometries).length > 0);
  return { stages, triangles, plan };
}

