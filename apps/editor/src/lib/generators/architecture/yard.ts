// Surroundings of a building: a stone yard (raised paved platform with a coping, front steps and
// two stone lanterns) or a garden (low platform, raked gravel, stepping stones, lanterns, rocks).
// The front (+z) stays open: the steps and the path are there. No plants: the compose
// generator places vegetation.
import { box, lathe, rgb, shade, surface, type MeshBuilder, type Rand, type RGB, type V3 } from "./mesh";
import type { ArchParams } from "./params";

/** Japanese stone lantern (ishi-doro, kasuga type), height h, standing at (x, y, z). */
export function stoneLantern(b: MeshBuilder, at: V3, h: number, stone: RGB, glow: RGB) {
  const s = h;
  const [x, y, z] = at;
  const c = [x, y, z] as V3;
  const st = shade(stone, 1.05);
  // Base, pole, platform, fire box, roof, jewel. Six-sided where it is round in stone.
  lathe(b, [[0, 0], [s * 0.2, 0], [s * 0.2, s * 0.06], [s * 0.13, s * 0.1], [0, s * 0.1]], 6, st, c);
  lathe(b, [[s * 0.065, s * 0.1], [s * 0.06, s * 0.48], [0, s * 0.48]], 8, st, c);
  lathe(b, [[0, s * 0.48], [s * 0.1, s * 0.48], [s * 0.17, s * 0.53], [s * 0.17, s * 0.56], [0, s * 0.56]], 6, shade(st, 1.04), c);
  box(b, [x - s * 0.11, y + s * 0.56, z - s * 0.11], [x + s * 0.11, y + s * 0.73, z + s * 0.11], st);
  b.withMat("gold", () => {
    box(b, [x - s * 0.06, y + s * 0.59, z + s * 0.108], [x + s * 0.06, y + s * 0.7, z + s * 0.116], glow, { bottom: false });
    box(b, [x - s * 0.06, y + s * 0.59, z - s * 0.116], [x + s * 0.06, y + s * 0.7, z - s * 0.108], glow, { bottom: false });
  });
  lathe(b, [[0, s * 0.72], [s * 0.27, s * 0.74], [s * 0.25, s * 0.78], [s * 0.06, s * 0.9], [0, s * 0.9]], 6, shade(stone, 0.95), c);
  lathe(b, [[0, s * 0.89], [s * 0.05, s * 0.92], [s * 0.04, s * 0.97], [0, s * 1.0]], 6, shade(stone, 1.0), c);
}

/** A low-poly rock (an irregular, flattened octahedron-like lump). */
function rock(b: MeshBuilder, at: V3, r: number, stone: RGB, rand: Rand) {
  const prof: [number, number][] = [[0, 0], [r * rand.range(0.9, 1.1), 0], [r * rand.range(0.8, 1.0), r * 0.35], [r * rand.range(0.4, 0.6), r * 0.62], [0, r * rand.range(0.66, 0.8)]];
  lathe(b, prof, 5, (i, j) => shade(stone, 0.88 + ((i * 3 + j) % 4) * 0.05), at, rand.next() * 6);
}

export function buildYard(b: MeshBuilder, p: ArchParams, half: [number, number], rand: Rand): { half: [number, number]; height: number } {
  b.stage("Surroundings");
  const W = p.footprint;
  const stone = rgb(p.colors.base);
  const paving = shade(stone, 1.12);
  const glow = rgb("#ffd98a");
  const garden = p.surround === "garden";
  const h = garden ? Math.max(0.08, W * 0.012) : Math.max(0.15, W * 0.04);
  const m = Math.max(1.2, Math.max(half[0], half[1]) * (garden ? 0.55 : 0.45));
  const X = half[0] + m;
  const Zb = half[1] + m * 0.6; // back edge
  const Zf = half[1] + m * (garden ? 1.6 : 1.15); // front edge (more space toward the camera)
  const cop = Math.min(0.35, W * 0.03);

  // Platform with a coping band and a paved top in slabs.
  box(b, [-X, 0, -Zb], [X, h - cop * 0.25, Zf], shade(stone, 0.95), { chamfer: Math.min(0.05, h * 0.2) });
  const nx = Math.max(4, Math.round((2 * X) / Math.max(0.8, W * 0.12)));
  const nz = Math.max(4, Math.round((Zf + Zb) / Math.max(0.8, W * 0.12)));
  const top = h - cop * 0.25 + 0.004;
  if (garden) {
    // Raked gravel: light sand with stripes, and stepping stones on the front axis.
    const sand = rgb("#e6dcc4");
    surface(b, nx * 2, 1, (u, v) => [-X + 2 * X * u, top, Zf - (Zf + Zb) * v], (i) => shade(sand, i % 2 ? 0.95 : 1.0));
    const steps = Math.max(3, Math.round((Zf - half[1]) / 0.9));
    for (let k = 0; k < steps; k++) {
      const zz = half[1] + 0.5 + ((Zf - half[1] - 0.7) * (k + 0.5)) / steps;
      const r = rand.range(0.28, 0.36);
      lathe(b, [[0, top], [r, top], [r * 0.92, top + 0.06], [0, top + 0.07]], 7, shade(stone, rand.range(1.0, 1.15)), [rand.range(-0.15, 0.15), 0, zz], rand.next() * 3);
    }
    // Rocks in the back corners (vegetation is placed by the compose generator).
    for (const sx of [-1, 1]) {
      rock(b, [sx * (X - m * 0.4), top, -Zb + m * 0.4], Math.max(0.3, W * 0.05), stone, rand);
      rock(b, [sx * (X - m * 0.25), top, -Zb + m * 0.75], Math.max(0.2, W * 0.03), stone, rand);
    }
  } else {
    surface(
      b,
      nx,
      nz,
      (u, v) => [-X + 2 * X * u, top, Zf - (Zf + Zb) * v],
      (i, j) => shade(paving, ((i * 7 + j * 13) % 5) * 0.02 + 0.92 + ((i + j) % 2) * 0.03)
    );
    // Coping stones along the edge.
    const c = cop;
    const edge = shade(stone, 1.05);
    box(b, [-X, h - c * 0.25, Zf - c], [-half[0] * 0.3 - 0.02, h + c * 0.15, Zf], edge, { chamfer: c * 0.15, bottom: false });
    box(b, [half[0] * 0.3 + 0.02, h - c * 0.25, Zf - c], [X, h + c * 0.15, Zf], edge, { chamfer: c * 0.15, bottom: false });
    box(b, [-X, h - c * 0.25, -Zb], [X, h + c * 0.15, -Zb + c], edge, { chamfer: c * 0.15, bottom: false });
    box(b, [-X, h - c * 0.25, -Zb + c], [-X + c, h + c * 0.15, Zf - c], edge, { chamfer: c * 0.15, bottom: false });
    box(b, [X - c, h - c * 0.25, -Zb + c], [X, h + c * 0.15, Zf - c], edge, { chamfer: c * 0.15, bottom: false });
  }
  // Front steps (center of the +z edge).
  const sw = Math.max(1.0, half[0] * 0.3);
  const nSteps = Math.max(2, Math.round(h / 0.15));
  const tread = Math.max(0.25, Math.min(0.4, h * 0.8));
  for (let k = 0; k < nSteps; k++) {
    const y1 = (h * (nSteps - k)) / (nSteps + 0.0) - cop * 0.25;
    box(b, [-sw, 0, Zf - 0.01], [sw, Math.max(0.03, y1), Zf + tread * (k + 1)], shade(stone, 1.0 + k * 0.03), { chamfer: 0.015, bottom: false });
  }
  // Two stone lanterns flanking the approach.
  const lh = Math.max(0.9, Math.min(2.2, W * 0.16));
  for (const sx of [-1, 1]) stoneLantern(b, [sx * (sw + lh * 0.45), top, Zf - lh * 0.45], lh, stone, glow);
  return { half: [X, Math.max(Zb, Zf + tread * nSteps)], height: h + lh };
}
