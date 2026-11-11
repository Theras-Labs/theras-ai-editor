// Ports index-BwioI7A7.js 36774-37367: festival prop colours (wv..Nv) and the cached prop prefabs
// (posts, torches, lanterns, bulbs, candles, pumpkins, hay, crates, barrels, stalls, signs, balloons, pots,
// paper boats, lotus candles, sky lanterns, wreaths).
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import { extrudePolygon, shadeColor } from '../ecology/meshKit';
import { cachedPrefab, type PrefabKits } from './assembly';
import type { InstanceGeometries } from './instances';

export const WOOD = `#a8744a`; // wv (36774)
export const WOOD_DARK = `#7d5234`; // Tv (36775)
export const WOOD_LIGHT = `#c99a6b`; // Ev (36776)
export const ROPE = `#d8c396`; // Dv (36777)
export const CREAM = `#f4ead6`; // Ov (36778)
export const HAY = `#e6c67a`; // kv (36779)
export const HAY_DARK = `#cfa75c`; // Av (36780)
export const FLAME = `#ffb54f`; // jv (36781)
export const IRON = `#4d4640`; // Mv (36782)

/** Hex string of a colour, for prefab cache keys. */
export const hexKey = (color: THREE.ColorRepresentation): string => new THREE.Color(color).getHexString(); // Nv (36783)

/** Wooden post with a round cap; its base stands at y = 0. */
export function post(height: number, color: string = WOOD): InstanceGeometries { // Pv (36784)
  return cachedPrefab(`post:${height.toFixed(2)}:${hexKey(color)}`, ({ base: n }) => {
    n.blob(0.1, 0, 0, 0, PALETTE.earthDark, { scale: [1, 0.35, 1], detail: 0, ao: false });
    n.cyl(0.045, 0.055, height, 6, 0, -0.05, 0, color, { grad: 0.35, rot: [0, 0.3, 0] });
    n.cyl(0.062, 0.062, 0.04, 6, 0, height - 0.13, 0, shadeColor(color, -0.1), { grad: 0, rot: [0, 0.3, 0], ao: false });
    n.blob(0.068, 0, height + 0.02, 0, shadeColor(color, -0.12), { scale: [1, 0.85, 1], detail: 1, ao: false });
  });
}

/** Post with a burning torch bowl on top. */
export function torchPost(height: number, color: string = WOOD_DARK): InstanceGeometries { // Fv (36792)
  return cachedPrefab(`torch:${height.toFixed(2)}:${hexKey(color)}`, ({ base: n, glow: r }) => {
    n.blob(0.1, 0, 0, 0, PALETTE.earthDark, { scale: [1, 0.35, 1], detail: 0, ao: false });
    n.cyl(0.04, 0.052, height, 6, 0, -0.05, 0, color, { grad: 0.35 });
    n.cyl(0.1, 0.055, 0.1, 7, 0, height - 0.02, 0, IRON, { grad: 0.2, ao: false });
    n.ring(0.1, 0.014, 3, 7, 0, height + 0.08, 0, `#6a5f55`, { ao: false, grad: 0 });
    r.blob(0.075, 0, height + 0.14, 0, `#ffa54a`, { scale: [0.9, 1.5, 0.9], detail: 1, ao: false, grad: 0 });
    r.blob(0.045, 0.02, height + 0.25, -0.01, `#ffd27a`, { scale: [0.8, 1.5, 0.8], detail: 1, ao: false, grad: 0 });
  });
}

/** Post with an arm that reaches `arm` along +z (a lantern hangs at its end). */
export function armPost(height: number, arm: number, color: string = WOOD_DARK): InstanceGeometries { // Iv (36802)
  return cachedPrefab(`armpost:${height.toFixed(2)}:${arm.toFixed(2)}:${hexKey(color)}`, ({ base: r }) => {
    r.blob(0.1, 0, 0, 0, PALETTE.earthDark, { scale: [1, 0.35, 1], detail: 0, ao: false });
    r.cyl(0.04, 0.05, height, 6, 0, -0.05, 0, color, { grad: 0.35 });
    r.blob(0.055, 0, height, 0, shadeColor(color, -0.1), { detail: 1, ao: false });
    r.beam({ x: 0, y: height - 0.04, z: -0.02 }, { x: 0, y: height - 0.04, z: arm + 0.03 }, 0.045, 0.045, color, { ao: false });
    r.beam({ x: 0, y: height - 0.3, z: 0 }, { x: 0, y: height - 0.05, z: arm * 0.55 }, 0.03, 0.03, color, { ao: false });
    r.cyl(0.008, 0.008, 0.06, 4, 0, height - 0.14, arm, IRON, { ao: false });
  });
}

/** Triangular bunting flag hanging down from y = 0. */
export function pennant(color: string, w = 0.22, h = 0.28): InstanceGeometries { // Lv (36812)
  return cachedPrefab(`pennant:${hexKey(color)}:${w}:${h}`, ({ flag: r }) => {
    r.tris([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0], 0, 0, 0, color, { grad: 0.18, ao: false, jitter: 0.03 });
  });
}

/** Round paper lantern hanging from y = 0. */
export function lantern(color: string, frame: string = WOOD_DARK, s = 1): InstanceGeometries { // Rv (36817)
  return cachedPrefab(`lantern:${hexKey(color)}:${hexKey(frame)}:${s}`, ({ base: r, glow: i }) => {
    r.cyl(0.006 * s, 0.006 * s, 0.08 * s, 4, 0, -0.08 * s, 0, `#5a4630`, { ao: false, grad: 0 });
    r.cyl(0.05 * s, 0.056 * s, 0.035 * s, 8, 0, -0.105 * s, 0, frame, { ao: false, grad: 0.1 });
    r.cyl(0.056 * s, 0.05 * s, 0.035 * s, 8, 0, -0.39 * s, 0, frame, { ao: false, grad: 0.1 });
    i.lathe(
      [
        [0.05 * s, 0],
        [0.105 * s, 0.035 * s],
        [0.13 * s, 0.1 * s],
        [0.128 * s, 0.17 * s],
        [0.1 * s, 0.23 * s],
        [0.052 * s, 0.26 * s],
      ],
      9,
      0,
      -0.36 * s,
      0,
      color,
      { ao: false, grad: -0.12 },
    );
  });
}

/** Ribbed paper lantern with gold caps and a red tassel. */
export function ribbedLantern(color: string, s = 1): InstanceGeometries { // zv (36840)
  return cachedPrefab(`ribbed:${hexKey(color)}:${s}`, ({ base: n, glow: r }) => {
    const gold = `#d9a441`;
    n.cyl(0.006 * s, 0.006 * s, 0.07 * s, 4, 0, -0.07 * s, 0, `#5a4630`, { ao: false, grad: 0 });
    n.cyl(0.07 * s, 0.07 * s, 0.035 * s, 10, 0, -0.1 * s, 0, gold, { ao: false, grad: 0.1 });
    n.cyl(0.07 * s, 0.07 * s, 0.035 * s, 10, 0, -0.395 * s, 0, gold, { ao: false, grad: 0.1 });
    n.cone(0.035 * s, 0.14 * s, 6, 0, -0.53 * s, 0, `#e2574c`, { ao: false, rot: [Math.PI, 0, 0] });
    r.lathe(
      [
        [0.07 * s, 0],
        [0.13 * s, 0.04 * s],
        [0.165 * s, 0.1 * s],
        [0.165 * s, 0.17 * s],
        [0.13 * s, 0.225 * s],
        [0.07 * s, 0.26 * s],
      ],
      8,
      0,
      -0.36 * s,
      0,
      color,
      { ao: false, grad: -0.15 },
    );
  });
}

/** Fairy-light bulb hanging from y = 0. */
export function bulb(color: string, s = 1): InstanceGeometries { // Bv (36865)
  return cachedPrefab(`bulb:${hexKey(color)}:${s}`, ({ base: n, glow: r }) => {
    n.cyl(0.016 * s, 0.016 * s, 0.03 * s, 4, 0, -0.03 * s, 0, `#3e4a38`, { ao: false, grad: 0 });
    r.blob(0.042 * s, 0, -0.07 * s, 0, color, { scale: [1, 1.3, 1], detail: 0, ao: false, grad: 0, jitter: 0.02 });
  });
}

/** One lit candle of the given height. */
export function candle(height: number, wax = `#f6ecd8`, s = 1): InstanceGeometries { // Vv (36871)
  return cachedPrefab(`candle:${height.toFixed(2)}:${hexKey(wax)}:${s}`, ({ base: r, glow: i }) => {
    r.cyl(0.034 * s, 0.037 * s, height * s, 7, 0, 0, 0, wax, { grad: 0.2, ao: false });
    r.blob(0.02 * s, 0.02 * s, height * s - 0.01 * s, 0.015 * s, wax, { scale: [1, 1.8, 1], detail: 0, ao: false });
    r.cyl(0.004 * s, 0.004 * s, 0.03 * s, 3, 0, height * s, 0, `#3a302a`, { ao: false, grad: 0 });
    i.blob(0.03 * s, 0, height * s + 0.055 * s, 0, FLAME, { scale: [0.75, 1.7, 0.75], detail: 0, ao: false, grad: 0 });
  });
}

/** Three candles on a dish. `variant` picks the dish colour and the cache key. */
export function candleCluster(variant: number, s = 1): InstanceGeometries { // Hv (36879)
  return cachedPrefab(`candles:${variant}:${s}`, ({ base: n, glow: r, rng: i }) => {
    const waxes = [`#f6ecd8`, `#f3dfc4`, `#f7e7e0`, `#efe6d2`];
    n.cyl(0.13 * s, 0.14 * s, 0.03 * s, 9, 0, 0, 0, variant % 2 ? PALETTE.stoneLight : `#c9a67a`, { grad: 0.2, ao: false });
    for (const [e, o, h] of [
      [-0.05, -0.03, 0.26],
      [0.06, -0.02, 0.18],
      [0, 0.07, 0.13],
    ]) {
      const c = h * (0.85 + i.next() * 0.3) * s;
      const l = i.pick(waxes);
      n.cyl(0.03 * s, 0.033 * s, c, 7, e * s, 0.03 * s, o * s, l, { grad: 0.2, ao: false });
      n.cyl(0.004 * s, 0.004 * s, 0.025 * s, 3, e * s, 0.03 * s + c, o * s, `#3a302a`, { ao: false, grad: 0 });
      r.blob(0.026 * s, e * s, 0.03 * s + c + 0.048 * s, o * s, FLAME, {
        scale: [0.75, 1.7, 0.75],
        detail: 0,
        ao: false,
        grad: 0,
      });
    }
  });
}

/** Ribbed pumpkin of radius r. */
export function pumpkin(r: number, color: string): InstanceGeometries { // Uv (36901)
  return cachedPrefab(`pumpkin:${r.toFixed(2)}:${hexKey(color)}`, ({ base: n, rng }) => {
    const i = r * 0.72;
    n.blob(r * 0.62, 0, i, 0, shadeColor(color, -0.04), { detail: 1, grad: 0.25 });
    for (let a = 0; a < 7; a++) {
      const o = (a / 7) * Math.PI * 2 + rng.next() * 0.2;
      n.blob(r * 0.52, Math.cos(o) * r * 0.46, i, Math.sin(o) * r * 0.46, a % 2 ? color : shadeColor(color, 0.03), {
        rot: [0, -o, 0],
        scale: [0.78, 0.92, 1.05],
        detail: 1,
        grad: 0.3,
      });
    }
    const a = rng.next() - 0.5;
    n.cyl(r * 0.1, r * 0.15, r * 0.5, 5, 0, i + r * 0.4, 0, `#6f7a3c`, { rot: [a * 0.5, 0, a * 0.6], ao: false });
    n.blob(r * 0.28, r * 0.35, i + r * 0.62, 0, PALETTE.leaf, { scale: [1.2, 0.25, 0.9], detail: 0, ao: false });
  });
}

/** Carved, glowing pumpkin facing +z. */
export function jackOLantern(e: number, t = `#ec8a3a`): InstanceGeometries { // Wv (36919)
  return cachedPrefab(`jack:${e.toFixed(2)}:${hexKey(t)}`, ({ base: n, glow: r }) => {
    const i = e * 0.72;
    n.blob(e * 0.62, 0, i, 0, shadeColor(t, -0.04), { detail: 1, grad: 0.25 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.2;
      n.blob(e * 0.52, Math.cos(a) * e * 0.46, i, Math.sin(a) * e * 0.46, k % 2 ? t : shadeColor(t, 0.03), {
        rot: [0, -a, 0],
        scale: [0.78, 0.92, 1.05],
        detail: 1,
        grad: 0.3,
      });
    }
    n.cyl(e * 0.1, e * 0.15, e * 0.5, 5, 0, i + e * 0.4, 0, `#6f7a3c`, { rot: [0.2, 0, 0.25], ao: false });
    const a = e * 0.93;
    const eye = (side: number) =>
      r.tris(
        extrudePolygon(
          [
            [-0.13 * e, 0],
            [0.13 * e, 0],
            [0, 0.17 * e],
          ],
          0.08 * e,
        ),
        side * 0.24 * e,
        i + 0.1 * e,
        a,
        `#ffc45a`,
        { ao: false, grad: 0, rot: [-0.15, side * 0.25, 0] },
      );
    eye(-1);
    eye(1);
    r.tris(
      extrudePolygon(
        [
          [0, 0.06 * e],
          [0.08 * e, -0.03 * e],
          [-0.08 * e, -0.03 * e],
        ],
        0.08 * e,
      ),
      0,
      i - 0.02 * e,
      a + 0.02 * e,
      `#ffc45a`,
      { ao: false, grad: 0 },
    );
    const s: [number, number][] = [];
    for (let k = 0; k <= 8; k++) {
      const n2 = k / 8 - 0.5;
      s.push([n2 * 0.62 * e, -0.2 * e - Math.cos(n2 * Math.PI) * 0.1 * e]);
    }
    for (let k = 0; k < 8; k++) {
      const [x0, y0] = s[k];
      const [x1, y1] = s[k + 1];
      const u = k % 3 == 1 ? 0.06 * e : 0.11 * e;
      r.box(x1 - x0 + 0.005, u, 0.08 * e, (x0 + x1) / 2, i + (y0 + y1) / 2 + u / 2 - 0.02 * e, a - 0.02 * e, `#ffb347`, {
        ao: false,
        grad: 0,
        bevel: 0,
        rot: [-0.25, ((x0 + x1) * 1.4) / e, 0],
      });
    }
  });
}

/** Hay bale; every third variant (variant % 3 == 1) carries a small pumpkin. */
export function hayBale(variant: number): InstanceGeometries { // Gv (36985)
  return cachedPrefab(`hay:${variant}`, ({ base: t, rng: n }) => {
    const r = 0.62;
    const i = 0.34;
    const a = 0.42;
    t.box(r, i, a, 0, i / 2, 0, HAY, { bevel: 0.07, grad: 0.3 });
    for (const e of [-1, 1])
      t.box(0.026, 0.35200000000000004, 0.432, e * 0.16, i / 2, 0, HAY_DARK, { bevel: 0.01, grad: 0.2, ao: false });
    for (let e = 0; e < 6; e++)
      t.box(
        0.025,
        0.05,
        0.14,
        n.range(-0.62 / 2, r / 2) * 0.9,
        0.34500000000000003,
        n.range(-0.42 / 2, a / 2) * 0.8,
        shadeColor(HAY, n.range(-0.05, 0.08)),
        { rot: [n.range(-0.5, 0.5), n.next() * 3, n.range(-0.4, 0.4)], ao: false, bevel: 0.005 },
      );
    if (variant % 3 == 1) {
      const e = 0.15;
      const c = `#ec8a3a`;
      const y = 0.44200000000000006;
      t.blob(e * 0.62, 0.05, y, 0, shadeColor(c, -0.04), { detail: 1 });
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2;
        t.blob(e * 0.52, 0.05 + Math.cos(ang) * e * 0.46, y, Math.sin(ang) * e * 0.46, k % 2 ? c : shadeColor(c, 0.03), {
          rot: [0, -ang, 0],
          scale: [0.78, 0.92, 1.05],
          detail: 1,
          ao: false,
        });
      }
      t.cyl(e * 0.1, e * 0.15, e * 0.5, 5, 0.05, 0.502, 0, `#6f7a3c`, { ao: false });
    }
  });
}

/** Wooden crate heaped with fruit of the given colours. */
export function fruitCrate(colors: readonly string[], variant = 0): InstanceGeometries { // Kv (37022)
  return cachedPrefab(`crate:${colors.map(hexKey).join(`-`)}:${variant}`, ({ base: t, rng: n }) => {
    const r = 0.2;
    t.box(0.44, r, 0.32, 0, r / 2, 0, WOOD_LIGHT, { bevel: 0.02, grad: 0.3 });
    for (const e of [0.05, 0.14]) t.box(0.45, 0.035, 0.33, 0, e, 0, shadeColor(WOOD_LIGHT, -0.08), { bevel: 0.008, ao: false, grad: 0 });
    for (let k = 0; k < 4; k++)
      for (let j = 0; j < 3; j++) {
        const a = -0.15 + k * 0.1 + n.range(-0.01, 0.01);
        const o = -0.09 + j * 0.09 + n.range(-0.01, 0.01);
        t.blob(0.056, a, 0.22 + n.next() * 0.02, o, shadeColor(n.pick(colors), n.range(-0.05, 0.05)), {
          detail: 1,
          ao: false,
          grad: 0.15,
        });
      }
    t.blob(0.056, 0.02, 0.29000000000000004, 0, shadeColor(n.pick(colors), 0.03), { detail: 1, ao: false });
  });
}

export function barrel(variant = 0): InstanceGeometries { // qv (37040)
  return cachedPrefab(`barrel:${variant}`, ({ base: t }) => {
    t.lathe(
      [
        [0.001, 0],
        [0.15, 0],
        [0.18, 0.12],
        [0.185, 0.2],
        [0.18, 0.28],
        [0.15, 0.4],
        [0.001, 0.4],
      ],
      10,
      0,
      0,
      0,
      variant ? WOOD : WOOD_LIGHT,
      { grad: 0.3 },
    );
    for (const e of [0.06, 0.32]) t.ring(0.172, 0.014, 3, 12, 0, e, 0, IRON, { ao: false, grad: 0 });
    t.cyl(0.02, 0.02, 0.06, 5, 0.17, 0.1, 0, WOOD_DARK, { rot: [0, 0, Math.PI / 2], ao: false });
  });
}

export type GoodsKind = 'pumpkins' | 'jams' | 'apples' | 'lemonade';

/** Draws the goods on a stall counter (top of the counter at y = 0). */
function drawGoods(e: PrefabKits, t: GoodsKind): void { // Jv (37063)
  const { base: n, rng: r } = e;
  if (t === `pumpkins`) {
    const cols = [`#e8843a`, `#f09a45`, `#dd7430`, `#efe0bb`];
    (
      [
        [-0.38, 0, 0.13],
        [-0.12, 0.04, 0.1],
        [0.14, -0.02, 0.12],
        [0.38, 0.03, 0.09],
      ] as const
    ).forEach(([px, pz, rad], a) => {
      const o = cols[a % cols.length];
      const s = rad * 0.72;
      n.blob(rad * 0.62, px, s, pz, shadeColor(o, -0.04), { detail: 1, ao: false });
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2;
        n.blob(rad * 0.52, px + Math.cos(ang) * rad * 0.46, s, pz + Math.sin(ang) * rad * 0.46, k % 2 ? o : shadeColor(o, 0.03), {
          rot: [0, -ang, 0],
          scale: [0.78, 0.92, 1.05],
          detail: 1,
          ao: false,
        });
      }
      n.cyl(rad * 0.1, rad * 0.15, rad * 0.5, 5, px, s + rad * 0.4, pz, `#6f7a3c`, { ao: false });
    });
  } else if (t === `jams`) {
    const cols = [`#c8384a`, `#e9a23a`, `#7b3f7f`, `#e7753a`];
    for (let k = 0; k < 7; k++)
      for (let i = 0; i < 2; i++) {
        const a = -0.42 + k * 0.14;
        const o = -0.06 + i * 0.12;
        const s = 0.1 + r.next() * 0.03;
        n.cyl(0.043, 0.045, s, 7, a, 0, o, cols[(k + i * 3) % cols.length], { grad: 0.3, ao: false });
        n.cyl(0.05, 0.05, 0.022, 7, a, s, o, (k + i) % 2 ? `#e06b6b` : `#f2ece0`, { grad: 0, ao: false });
      }
    n.lathe(
      [
        [0.001, 0],
        [0.08, 0],
        [0.1, 0.07],
        [0.085, 0.14],
        [0.05, 0.16],
        [0.055, 0.19],
        [0.001, 0.19],
      ],
      9,
      0.02,
      0,
      0.02,
      `#e9a23a`,
      { grad: 0.3, ao: false },
    );
  } else if (t === `apples`)
    for (const [px, cols] of [
      [-0.3, [`#d9483b`, `#e0643e`, `#c8413a`]],
      [0.05, [`#a8c64e`, `#c2d25a`, `#e9c24b`]],
      [0.36, [`#d9483b`, `#f0a23a`, `#e9c24b`]],
    ] as const) {
      n.cyl(0.14, 0.11, 0.1, 9, px, 0, 0, `#c99a5b`, { grad: 0.3, ao: false });
      n.ring(0.14, 0.014, 3, 12, px, 0.1, 0, `#b3834a`, { ao: false, grad: 0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r.next() * 0.4;
        n.blob(
          0.052,
          px + Math.cos(a) * 0.065,
          0.12 + r.next() * 0.02,
          Math.sin(a) * 0.065,
          shadeColor(r.pick(cols), r.range(-0.05, 0.05)),
          { detail: 1, ao: false },
        );
      }
      n.blob(0.054, px, 0.17, 0, shadeColor(cols[0], 0.04), { detail: 1, ao: false });
    }
  else if (t === `lemonade`) {
    n.lathe(
      [
        [0.001, 0],
        [0.085, 0],
        [0.1, 0.1],
        [0.09, 0.2],
        [0.06, 0.25],
        [0.07, 0.28],
        [0.001, 0.28],
      ],
      10,
      -0.38,
      0,
      0,
      `#f6e27a`,
      { grad: -0.15, ao: false },
    );
    n.ring(0.05, 0.012, 3, 8, -0.28, 0.16, 0, `#e8e2cf`, { rot: [Math.PI / 2, 0, 0], ao: false });
    for (let e = 0; e < 3; e++) {
      n.cyl(0.035, 0.03, 0.1, 7, -0.18 + e * 0.09, 0, 0.1, `#f8eca0`, { grad: -0.1, ao: false });
      n.blob(0.02, -0.18 + e * 0.09 + 0.028, 0.1, 0.1, `#f2d64a`, { scale: [0.4, 1, 1], detail: 0, ao: false });
    }
    for (let e = 0; e < 5; e++)
      n.blob(0.045, -0.2 + (e % 3) * 0.07, 0.04 + Math.floor(e / 3) * 0.05, -0.08, `#f2d64a`, {
        scale: [1.25, 1, 1],
        detail: 1,
        ao: false,
      });
    n.cyl(0.02, 0.03, 0.08, 6, 0.26, 0, 0, `#f2ece0`, { ao: false, grad: 0 });
    n.cyl(0.14, 0.14, 0.02, 12, 0.26, 0.08, 0, `#f2ece0`, { ao: false, grad: 0 });
    n.cyl(0.12, 0.12, 0.08, 12, 0.26, 0.1, 0, `#f6c2cf`, { ao: false, grad: 0.15 });
    n.cyl(0.123, 0.123, 0.02, 12, 0.26, 0.15, 0, `#fbf5e9`, { ao: false, grad: 0 });
    n.cyl(0.09, 0.09, 0.07, 12, 0.26, 0.17, 0, `#f6c2cf`, { ao: false, grad: 0.15 });
    n.cyl(0.093, 0.093, 0.02, 12, 0.26, 0.22, 0, `#fbf5e9`, { ao: false, grad: 0 });
    n.blob(0.03, 0.26, 0.26, 0, `#d9384a`, { detail: 1, ao: false });
    for (let e = 0; e < 2; e++) {
      const x = 0.46;
      const z = -0.07 + e * 0.14;
      n.cyl(0.045, 0.035, 0.05, 8, x, 0, z, e ? `#a9d4f2` : `#c7b3ea`, { ao: false, grad: 0.1 });
      n.blob(0.05, x, 0.07, z, `#fbf0f4`, { scale: [1, 0.75, 1], detail: 1, ao: false });
      n.blob(0.016, x, 0.11, z, `#d9384a`, { detail: 0, ao: false });
    }
  }
}

/** Market stall with a striped awning of colours a and b. `kind` only keys the cache. */
export function stall(kind: string, t: string, n: string): InstanceGeometries { // Yv (37179)
  return cachedPrefab(`stall:${kind}:${hexKey(t)}:${hexKey(n)}`, (e) => {
    const { base: r, flag: i, rng: a } = e;
    const o = 1.12;
    r.box(o, 0.5, 0.36, 0, 0.25, 0.1, shadeColor(WOOD_LIGHT, -0.02), { bevel: 0.02, grad: 0.3 });
    for (let k = 0; k < 6; k++)
      r.box(o / 6 - 0.01, 0.46, 0.03, -1.12 / 2 + (o / 6) * (k + 0.5), 0.25, 0.29, shadeColor(WOOD_LIGHT, a.range(-0.06, 0.05)), {
        bevel: 0.008,
        grad: 0.3,
        ao: false,
      });
    r.box(1.2200000000000002, 0.05, 0.46, 0, 0.525, 0.1, WOOD_DARK, { bevel: 0.015, grad: 0.1, ao: false });
    for (let k = 0; k < 5; k++) {
      const x = -0.44 + k * 0.22;
      i.tris([-0.11, 0, 0, 0.11, 0, 0, 0, -0.12, 0], x, 0.53, 0.34, k % 2 ? n : t, { ao: false, grad: 0.1 });
    }
    for (const side of [-1, 1]) {
      r.cyl(0.035, 0.042, 1.24, 6, side * 0.58, 0, 0.3, WOOD, { grad: 0.3 });
      r.cyl(0.035, 0.042, 1.48, 6, side * 0.58, 0, -0.3, WOOD, { grad: 0.3 });
    }
    r.box(o, 0.04, 0.16, 0, 0.8, -0.26, WOOD_DARK, { bevel: 0.01, ao: false });
    const s = Math.hypot(0.92, -0.30000000000000004);
    const c = Math.atan2(0.30000000000000004, 0.92);
    const l = 1.3800000000000001;
    for (let k = 0; k < 7; k++) {
      const x = -1.3800000000000001 / 2 + (l / 7) * (k + 0.5);
      r.box(0.20114285714285715, 0.035, s, x, 2.7 / 2, 0.12 / 2, k % 2 ? n : t, {
        rot: [c, 0, 0],
        bevel: 0.01,
        grad: 0.05,
        ao: false,
      });
    }
    for (let k = 0; k < 8; k++) {
      const x = -1.3800000000000001 / 2 + (l / 8) * (k + 0.5);
      const w = l / 8;
      const tri: number[] = [];
      for (let j = 0; j < 4; j++) {
        const a0 = Math.PI + (j / 4) * Math.PI;
        const a1 = Math.PI + ((j + 1) / 4) * Math.PI;
        tri.push(0, 0, 0, Math.cos(a0) * w * 0.5, Math.sin(a0) * 0.11, 0, Math.cos(a1) * w * 0.5, Math.sin(a1) * 0.11, 0);
      }
      i.tris(tri, x, 1.19, 0.525, k % 2 ? n : t, { ao: false, grad: 0.1 });
    }
  });
}

export function goods(kind: GoodsKind): InstanceGeometries { // Xv (37224)
  return cachedPrefab(`goods:${kind}`, (t) => drawGoods(t, kind));
}

/** Chalkboard A-frame sign with a dab of the given colour. */
export function chalkSign(color: string): InstanceGeometries { // Zv (37227)
  return cachedPrefab(`sign:${hexKey(color)}`, ({ base: t }) => {
    for (const e of [-1, 1]) {
      t.box(0.3, 0.38, 0.03, 0, 0.19, e * 0.07, WOOD_DARK, { rot: [e * 0.22, 0, 0], bevel: 0.01 });
      t.box(0.24, 0.26, 0.012, 0, 0.21, e * 0.086, `#3f4a44`, { rot: [e * 0.22, 0, 0], bevel: 0.004, ao: false });
    }
    t.blob(0.03, -0.05, 0.3, 0.1, color, { scale: [1.4, 1, 0.3], detail: 0, ao: false });
    t.blob(0.02, 0.05, 0.24, 0.1, `#fbf5e9`, { scale: [2.2, 0.5, 0.3], detail: 0, ao: false });
  });
}

/** Three balloons on strings tied at the origin. */
export function balloons(colors: readonly string[], variant = 0): InstanceGeometries { // Qv (37236)
  return cachedPrefab(`balloons:${colors.map(hexKey).join(`-`)}:${variant}`, ({ base: t }) => {
    (
      [
        [-0.16, 0.7, 0.05],
        [0.15, 0.86, -0.06],
        [0, 1.02, 0.15],
      ] as const
    ).forEach(([n, r, i], a) => {
      const o = colors[a % colors.length];
      t.beam({ x: 0, y: 0, z: 0 }, { x: n, y: r - 0.2, z: i }, 0.01, 0.01, `#f2ece0`, { ao: false, bevel: 0.002 });
      t.blob(0.19, n, r, i, o, { scale: [1, 1.18, 1], detail: 2, ao: false, grad: 0.22, smooth: true });
      t.cone(0.04, 0.05, 5, n, r - 0.25, i, shadeColor(o, -0.1), { ao: false });
      t.blob(0.045, n - 0.06, r + 0.08, i + 0.13, shadeColor(o, 0.25), { detail: 0, ao: false, scale: [0.6, 1, 0.6] });
    });
  });
}

/** Terracotta pot of flowers. */
export function flowerPot(colors: readonly string[], variant = 0): InstanceGeometries { // $v (37251)
  return cachedPrefab(`pot:${colors.map(hexKey).join(`-`)}:${variant}`, ({ base: t, rng: n }) => {
    t.cyl(0.13, 0.1, 0.18, 8, 0, 0, 0, `#cf7d55`, { grad: 0.3 });
    t.cyl(0.145, 0.145, 0.04, 8, 0, 0.16, 0, `#d98c64`, { grad: 0, ao: false });
    t.blob(0.13, 0, 0.21, 0, PALETTE.leafDark, { scale: [1, 0.5, 1], detail: 1, ao: false });
    for (let k = 0; k < 9; k++) {
      const r = n.next() * Math.PI * 2;
      const i = n.next() * 0.1;
      t.blob(0.045, Math.cos(r) * i, 0.26 + n.next() * 0.06, Math.sin(r) * i, n.pick(colors), {
        detail: 0,
        ao: false,
        grad: 0.1,
      });
    }
    t.blob(0.02, 0, 0.33, 0, `#f7e08a`, { detail: 0, ao: false });
  });
}

/** Paper boat with a candle, pointing along +x. */
export function paperBoat(color: string): InstanceGeometries { // ey (37268)
  return cachedPrefab(`boat:${hexKey(color)}`, ({ base: t, glow: n }) => {
    const r = 0.3;
    const i = 0.11;
    t.tris(
      extrudePolygon(
        [
          [-0.3, i],
          [r, i],
          [r * 0.52, -0.02],
          [-0.156, -0.02],
        ],
        0.2,
      ),
      0,
      0,
      0,
      color,
      { ao: false, grad: 0.2 },
    );
    t.tris(
      extrudePolygon(
        [
          [-0.15, i],
          [0.15, i],
          [0, 0.32],
        ],
        0.03,
      ),
      0,
      0,
      0,
      shadeColor(color, 0.03),
      { ao: false, grad: 0.1 },
    );
    t.cyl(0.03, 0.032, 0.1, 6, 0.21, 0.1, 0, `#f6ecd8`, { ao: false, grad: 0.1 });
    n.blob(0.03, 0.21, 0.26, 0, FLAME, { scale: [0.75, 1.7, 0.75], detail: 1, ao: false, grad: 0 });
  });
}

/** Lotus flower on a lily pad with a candle. */
export function lotusCandle(color: string): InstanceGeometries { // ty (37307)
  return cachedPrefab(`lotus:${hexKey(color)}`, ({ base: t, glow: n }) => {
    t.cyl(0.2, 0.2, 0.02, 10, 0, -0.005, 0, PALETTE.leaf, { ao: false, grad: 0 });
    for (let k = 0; k < 8; k++) {
      const r = (k / 8) * Math.PI * 2;
      t.blob(0.07, Math.cos(r) * 0.08, 0.05, Math.sin(r) * 0.08, k % 2 ? color : shadeColor(color, 0.06), {
        rot: [0, -r, 0.6],
        scale: [1.3, 0.5, 0.7],
        detail: 1,
        ao: false,
      });
    }
    t.cyl(0.03, 0.032, 0.06, 6, 0, 0.02, 0, `#f6ecd8`, { ao: false });
    n.blob(0.026, 0, 0.13, 0, FLAME, { scale: [0.75, 1.7, 0.75], detail: 1, ao: false, grad: 0 });
  });
}

/** Paper sky lantern (glow layer only). */
export function skyLantern(): InstanceGeometries { // ny (37323)
  return cachedPrefab(`skylantern`, ({ glow: e }) => {
    e.lathe(
      [
        [0.13, 0],
        [0.17, 0.14],
        [0.19, 0.3],
        [0.17, 0.4],
        [0.001, 0.43],
      ],
      6,
      0,
      0,
      0,
      `#ffd9a0`,
      { ao: false, grad: -0.9 },
    );
    e.ring(0.13, 0.012, 3, 6, 0, 0, 0, `#ff9c4a`, { ao: false, grad: 0 });
    e.blob(0.045, 0, 0.03, 0, `#ffb44a`, { scale: [0.8, 1.4, 0.8], detail: 1, ao: false, grad: 0 });
  });
}

/** Flat leaf wreath of radius r with flowers of the given colours, lying in the XZ plane. */
export function wreath(r: number, colors: readonly string[], offset = 0): InstanceGeometries { // ry (37344)
  return cachedPrefab(`wreath:${r}:${colors.map(hexKey).join(`-`)}:${offset}`, ({ base: b }) => {
    const count = Math.max(10, Math.round((r * Math.PI * 2) / 0.055));
    for (let a = 0; a < count; a++) {
      const o = (a / count) * Math.PI * 2;
      const s = Math.cos(o) * r;
      const c = Math.sin(o) * r;
      b.blob(0.045, s, 0, c, a % 2 ? PALETTE.leaf : PALETTE.leafLight, {
        scale: [1.2, 0.55, 0.8],
        rot: [0.4, -o, 0],
        detail: 0,
        ao: false,
      });
      if (a % 2 == 0)
        b.blob(0.04, s * 1.04, 0.025, c * 1.04, colors[(a / 2 + offset) % colors.length], {
          detail: 0,
          ao: false,
          grad: 0.1,
          jitter: 0.04,
        });
      if (a % 4 == 0) b.blob(0.015, s * 1.08, 0.05, c * 1.08, `#f7e08a`, { detail: 0, ao: false });
    }
  });
}
