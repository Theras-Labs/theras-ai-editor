// Western styles: medieval stone keep (square or round). The modern tower is in tower.ts.
import { box, boxAt, lathe, mix, rgb, shade, wallWithOpenings, type MeshBuilder, type Rand, type RGB, type V3, type WindowRect } from "./mesh";
import type { BuildInfo } from "./japanese";
import { stoneBase } from "./japanese";
import type { ArchParams } from "./params";
import { sideMatrix, skirt, type SkirtSpec } from "./roofs";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Stone courses: horizontal bands with slightly different tones (cheap masonry look). */
function courses(rand: Rand, height: number, course: number, stone: RGB, from = 0): { v0: number; v1: number; col: RGB }[] {
  const out: { v0: number; v1: number; col: RGB }[] = [];
  for (let v = from; v < height - 1e-6; v += course) {
    const t = rand.range(0.9, 1.08);
    out.push({ v0: v, v1: Math.min(height, v + course), col: mix(shade(stone, t), [stone[0] * 1.04, stone[1], stone[2] * 0.95], rand.next() * 0.4) });
  }
  return out;
}

/** A pennant flag on a pole (both faces). */
function flag(b: MeshBuilder, base: V3, poleH: number, size: number, cloth: RGB, pole: RGB) {
  lathe(b, [[size * 0.035, 0], [size * 0.03, poleH], [0, poleH + size * 0.05]], 6, pole, base);
  const yTop = base[1] + poleH - size * 0.04;
  const hh = size * 0.55;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    const w = (u: number) => Math.sin(u * Math.PI * 1.6) * size * 0.08;
    // A pennant: top and bottom edges meet toward the tip.
    const P = (u: number, top: boolean): V3 => [base[0] + u * size * 1.1, top ? yTop - hh * 0.4 * u : yTop - hh + hh * 0.4 * u, base[2] + w(u)];
    const a = P(u0, false);
    const bb = P(u1, false);
    const c = P(u1, true);
    const d = P(u0, true);
    const col = shade(cloth, i % 2 ? 0.92 : 1);
    b.quad(a, bb, c, d, col);
    b.quad(bb, a, d, c, shade(col, 0.9));
  }
}

// ── Medieval keep ────────────────────────────────────────────

/**
 * One coherent stone keep: battered plinth, walls with stone courses and arrow slits,
 * an arched wooden door on the front, string courses between stories, machicolation corbels,
 * a crenellated parapet, an inner turret with a conical (round plan) or pyramidal (square plan)
 * slate roof, and a flag.
 */
export function buildMedievalKeep(b: MeshBuilder, p: ArchParams, rand: Rand): BuildInfo {
  const W = p.footprint;
  const n = p.tiers;
  const d = p.detail;
  const stone = rgb(p.colors.walls);
  const plinthCol = rgb(p.colors.base);
  const slate = rgb(p.colors.roof);
  const cloth = rgb(p.colors.accent);
  const wood = rgb(p.colors.timber);
  const dark = rgb("#262321");
  const round = p.plan === "round";
  const a = W * 0.42; // body half size (or radius)
  const plinthH = W * 0.12;
  const storyH = W * 0.3;
  const course = W * 0.05;

  b.stage("Stone base");
  if (round) {
    const seg = Math.round(lerp(12, 22, d));
    lathe(b, [[0, 0], [W * 0.5, 0], [W * 0.47, plinthH * 0.5], [a * 1.02, plinthH], [a * 1.02, plinthH + W * 0.01], [0, plinthH + W * 0.01]], seg, (i, j) => shade(plinthCol, j === 0 ? 0.95 + 0.08 * ((i * 7) % 3) / 2 : 1), [0, 0, 0]);
  } else {
    stoneBase(b, rand, [W / 2, W / 2], [a * 1.02, a * 1.02], plinthH, plinthCol, d);
  }

  const seg = Math.round(lerp(14, 26, d));
  let y = plinthH;
  for (let i = 0; i < n; i++) {
    b.stage(`Tier ${i + 1}`);
    const h = storyH * (i === 0 ? 1.1 : 1);
    if (round) {
      const rows = Math.max(2, Math.round(h / course));
      const prof: [number, number][] = [];
      for (let r = 0; r <= rows; r++) prof.push([a, y + (h * r) / rows]);
      const tones = Array.from({ length: rows }, () => rand.range(0.9, 1.08));
      lathe(b, prof, seg, (_i, j) => shade(stone, tones[j]), [0, 0, 0]);
      // Arrow slits (thin dark boxes set into the wall) and the door.
      const slits = d < 0.2 ? 0 : i === 0 ? 3 : 4;
      for (let k = 0; k < slits; k++) {
        const ang = ((k + (i % 2) * 0.5) / slits) * Math.PI * 2 + (i === 0 ? Math.PI / 3 : 0);
        boxAt(b, [Math.sin(ang) * (a - W * 0.004), y + h * 0.55, Math.cos(ang) * (a - W * 0.004)], [W * 0.012, h * 0.2, W * 0.012], ang, dark);
      }
      if (i === 0) door(b, [0, y, a], W, h, wood, stone, dark, true);
    } else {
      for (let s = 0; s < 4; s++) {
        b.with(sideMatrix(s), () => {
          const len = 2 * a;
          const wins: WindowRect[] = [];
          const slits = d < 0.2 ? 0 : i === 0 ? (s === 0 ? 0 : 1) : 2;
          for (let k = 0; k < slits; k++) {
            const cu = ((k + 0.5) / slits) * len;
            wins.push({ u0: cu - W * 0.014, u1: cu + W * 0.014, v0: h * 0.36, v1: h * 0.74 });
          }
          // The door opening (front, ground story): the leaves sit at the back of the recess.
          if (i === 0 && s === 0) wins.push({ u0: a - DOOR_W * W, u1: a + DOOR_W * W, v0: 0, v1: h * DOOR_H });
          wallWithOpenings(b, [-a, y, a], [1, 0], len, h, wins, W * 0.03, { wall: stone, recess: shade(stone, 0.8), back: dark, bands: courses(rand, h, course, stone) });
          if (i === 0 && s === 0) door(b, [0, y, a], W, h, wood, stone, dark, false);
        });
      }
    }
    // String course between stories.
    if (i < n - 1 && d >= 0.3) {
      if (round) lathe(b, [[a, y + h - W * 0.012], [a + W * 0.018, y + h - W * 0.008], [a + W * 0.018, y + h + W * 0.008], [a, y + h + W * 0.012]], seg, shade(stone, 1.1));
      else box(b, [-a - W * 0.016, y + h - W * 0.01, -a - W * 0.016], [a + W * 0.016, y + h + W * 0.01, a + W * 0.016], shade(stone, 1.1), { chamfer: W * 0.004 });
    }
    y += h;
  }

  b.stage("Roof ornaments");
  // Machicolations: corbels under an overhanging parapet.
  const over = W * 0.05;
  const parH = W * 0.1;
  const corbelH = W * 0.07;
  const yP = y; // parapet floor
  const merlonH = W * 0.075;
  const thick = W * 0.05;
  if (round) {
    const ro = a + over;
    const corbels = Math.round(lerp(10, 18, d));
    for (let k = 0; k < corbels; k++) {
      const ang = (k / corbels) * Math.PI * 2;
      boxAt(b, [Math.sin(ang) * (a + over * 0.5), yP - corbelH / 2, Math.cos(ang) * (a + over * 0.5)], [W * 0.02, corbelH / 2, over / 2], ang, shade(stone, 0.95), { chamfer: W * 0.003 });
    }
    lathe(b, [[a, yP], [ro, yP], [ro, yP + parH], [ro - thick, yP + parH], [ro - thick, yP + W * 0.01], [0, yP + W * 0.01]], seg, (_i, j) => shade(stone, j === 1 ? 1.02 : 0.96));
    const merlons = Math.round(lerp(10, 16, d));
    for (let k = 0; k < merlons; k++) {
      const ang = (k / merlons) * Math.PI * 2;
      const r = ro - thick / 2;
      boxAt(b, [Math.sin(ang) * r, yP + parH + merlonH / 2, Math.cos(ang) * r], [((Math.PI * ro) / merlons) * 0.5, merlonH / 2, thick / 2], ang, shade(stone, rand.range(0.95, 1.05)), { chamfer: W * 0.004 });
    }
  } else {
    const ro = a + over;
    const corbels = Math.round(lerp(4, 7, d));
    for (let s = 0; s < 4; s++) {
      b.with(sideMatrix(s), () => {
        for (let k = 0; k <= corbels; k++) {
          const pp = -a + (2 * a * k) / corbels;
          box(b, [pp - W * 0.018, yP - corbelH, a - 0.001], [pp + W * 0.018, yP, a + over], shade(stone, 0.95), { chamfer: W * 0.003 });
        }
        // Parapet wall (outer face, top, inner face) on this side.
        box(b, [-ro, yP, ro - thick], [ro - thick, yP + parH, ro], shade(stone, 1.0), { chamfer: W * 0.004 });
        const merlons = Math.max(3, Math.round(lerp(3, 5, d) * (a / (W * 0.42))));
        const step = (2 * ro) / (merlons * 2 + 1);
        for (let k = 0; k < merlons; k++) {
          const x0 = -ro + step * (2 * k + 1);
          box(b, [x0, yP + parH, ro - thick], [x0 + step, yP + parH + merlonH, ro], shade(stone, rand.range(0.95, 1.05)), { chamfer: W * 0.004 });
        }
        // Corner merlon.
        box(b, [ro - thick, yP + parH, ro - thick], [ro, yP + parH + merlonH, ro], shade(stone, 1.02), { chamfer: W * 0.004 });
      });
    }
    // Walkway floor.
    box(b, [-ro + thick, yP - W * 0.01, -ro + thick], [ro - thick, yP + W * 0.01, ro - thick], shade(stone, 0.85), { bottom: false });
  }
  // Inner turret and roof.
  const ta = a * 0.62;
  const tH = W * 0.22;
  const yT = yP + W * 0.01;
  const roofH = W * (round ? 0.62 : 0.55);
  const ov = W * 0.05;
  let top: number;
  if (round) {
    lathe(b, [[ta, yT], [ta, yT + tH], [0, yT + tH]], seg, (_i, j) => shade(stone, 0.98 + j * 0.02));
    // Cone with a slight flare at the eave.
    const prof: [number, number][] = [];
    const rows = 6;
    prof.push([ta, yT + tH - W * 0.01]);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      prof.push([(ta + ov) * (1 - t) * (1 - 0.18 * Math.sin(t * Math.PI * 0.5) * (1 - t)), yT + tH + roofH * Math.pow(t, 0.92)]);
    }
    lathe(b, prof, seg, (i, j) => shade(slate, (i % 2 ? 0.94 : 1) * (0.92 + j * 0.02)));
    top = yT + tH + roofH;
  } else {
    box(b, [-ta, yT, -ta], [ta, yT + tH, ta], shade(stone, 1.0), { chamfer: W * 0.005, bottom: false });
    // Small dormer-free pyramid: a straight skirt with a slight flare, closed by a finial.
    const sp: SkirtSpec = {
      outer: [ta + ov, ta + ov],
      inner: [W * 0.012, W * 0.012],
      eaveY: yT + tH,
      rise: roofH,
      cornerOut: 0,
      cornerLift: 0,
      sag: 1.08,
      thickness: W * 0.015,
      wall: { half: [ta, ta], y: yT + tH },
      colors: { roof: slate, soffit: shade(wood, 0.8), fascia: shade(slate, 0.8), ridge: shade(slate, 0.8) },
      nu: 6,
      nt: 4,
      hips: d >= 0.3
    };
    skirt(b, sp);
    top = yT + tH + roofH;
  }
  // Finial and flag.
  lathe(b, [[W * 0.02, top - W * 0.02], [W * 0.025, top + W * 0.01], [0, top + W * 0.03]], 6, shade(slate, 0.7));
  if (d >= 0.15) flag(b, [0, top, 0], W * 0.22, W * 0.16, cloth, rgb("#4a3b2f"));
  return { half: [W / 2, W / 2], height: top + (d >= 0.15 ? W * 0.24 : W * 0.03), front: "+z" };
}

/** Arched wooden door in the local side frame (face at z = at[2], facing +z). */
const DOOR_W = 0.075;
const DOOR_H = 0.42;

function door(b: MeshBuilder, at: V3, W: number, h: number, wood: RGB, stone: RGB, dark: RGB, round: boolean) {
  const dw = W * DOOR_W;
  const dh = h * DOOR_H;
  const z = at[2] + (round ? W * 0.004 : 0.002);
  const y0 = at[1];
  // Door leaves (planks) with an arched top, slightly set in.
  const n = 8;
  const arch = (u: number) => y0 + dh + Math.sqrt(Math.max(0, 1 - u * u)) * dw * 0.9;
  // Square wall: the leaves fill the back of the opening (recess depth 0.03 W). Round: on the face.
  const zIn = round ? z - W * 0.002 : at[2] - W * 0.03 + 0.002;
  for (let k = 0; k < n; k++) {
    const u0 = -1 + (2 * k) / n;
    const u1 = -1 + (2 * (k + 1)) / n;
    const c = shade(wood, k % 2 ? 0.92 : 1);
    b.quad([at[0] + u0 * dw, y0, zIn], [at[0] + u1 * dw, y0, zIn], [at[0] + u1 * dw, y0 + dh, zIn], [at[0] + u0 * dw, y0 + dh, zIn], c);
    // The arched head sits on the wall face (the opening below it is rectangular).
    const zA = round ? zIn : z + 0.003;
    b.quad([at[0] + u0 * dw, y0 + dh, zA], [at[0] + u1 * dw, y0 + dh, zA], [at[0] + u1 * dw, arch(u1), zA], [at[0] + u0 * dw, arch(u0), zA], shade(c, 0.85));
  }
  // Stone arch (voussoirs) around the opening.
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI - (Math.PI * k) / n;
    const a1 = Math.PI - (Math.PI * (k + 1)) / n;
    const r0 = dw;
    const r1 = dw * 1.28;
    const P = (a: number, r: number): V3 => [at[0] + Math.cos(a) * r, y0 + dh + Math.sin(a) * r * 0.9, z + W * 0.006];
    b.quad(P(a0, r0), P(a1, r0), P(a1, r1), P(a0, r1), shade(stone, k % 2 ? 1.12 : 1.04));
  }
  // Jambs.
  for (const sx of [-1, 1]) box(b, [at[0] + sx * dw - (sx > 0 ? 0 : dw * 0.28), y0, zIn], [at[0] + sx * dw + (sx > 0 ? dw * 0.28 : 0), y0 + dh, z + W * 0.006], shade(stone, 1.08));
  // Iron bands.
  for (const yy of [0.3, 0.7]) box(b, [at[0] - dw * 0.95, y0 + dh * yy, zIn], [at[0] + dw * 0.95, y0 + dh * yy + W * 0.008, zIn + W * 0.004], dark);
}
