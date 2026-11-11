// Ports index-BwioI7A7.js 23041-23630: the build functions of the ecology features (bench, birdbath, beehive,
// birdhouse, lantern, bridge, stepping stones, log pile, leaf pile, insect hotel, fence, rose arch, rowboat).
// Each one seeds its own Rng; the order of rng calls is the original's (MeshKit.addRaw takes one per part).
import * as THREE from 'three';
import { PALETTE as K } from '../core/palette';
import { Rng } from '../core/rng';
import { MeshKit, extrudePolygon, shadeColor as X } from './meshKit';
import type { ClearSpot, FeatureModel } from './types';

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z); // Fu (23041)
const CREAM = `#efe4cf`; // Iu (23042)
const ROPE = `#d8c396`; // Lu (23043)
const HOLE = `#3d2c22`; // Ru (23044)
const PICKET_TIP = extrudePolygon( // zu (23045)
  [
    [-0.026, 0],
    [0.026, 0],
    [0, 0.045],
  ],
  0.022,
);

export function buildBench(seed: number): FeatureModel { // Bu (23053)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const dark = K.woodDark;
  const slats = [K.woodLight, X(K.woodLight, -0.04), X(K.wood, 0.04)];
  for (const side of [-1, 1]) {
    const x = side * 0.39;
    k.box(0.075, 0.42, 0.075, x, 0.21, 0.14, dark, { grad: 0.35 });
    k.beam(v3(x, 0, -0.13), v3(x, 0.84, -0.26), 0.075, 0.075, dark, { grad: 0.3 });
    k.box(0.065, 0.055, 0.44, x, 0.4, -0.01, dark);
    k.box(0.08, 0.045, 0.42, x, 0.6, 0.01, K.wood, { bevel: 0.015 });
    k.box(0.055, 0.17, 0.055, x, 0.5, 0.15, dark);
  }
  for (let i = 0; i < 3; i++)
    k.box(0.94, 0.05, 0.112, (rng.next() - 0.5) * 0.01, 0.45, 0.13 - i * 0.125, slats[i % 3], {
      bevel: 0.016,
      grad: 0.15,
      jitter: 0.07,
    });
  k.box(0.9099999999999999, 0.095, 0.035, 0, 0.6, -0.2, slats[1], { rot: [-0.18, 0, 0], bevel: 0.014, grad: 0.1 });
  k.box(0.9099999999999999, 0.095, 0.035, 0, 0.74, -0.225, slats[0], { rot: [-0.18, 0, 0], bevel: 0.014, grad: 0.1 });
  return { geometry: k.build(), perches: [v3(-0.39, 0.64, 0.02), v3(0.39, 0.64, 0.02), v3(0, 0.8, -0.235)], anim: `pop` };
}

export function buildBirdbath(seed: number): FeatureModel { // Vu (23078)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const stone = X(K.stoneLight, -0.03 + rng.next() * 0.04);
  k.lathe(
    [
      [0.001, 0],
      [0.21, 0],
      [0.22, 0.035],
      [0.19, 0.075],
      [0.12, 0.095],
      [0.08, 0.14],
      [0.068, 0.3],
      [0.085, 0.36],
      [0.15, 0.395],
      [0.27, 0.43],
      [0.315, 0.475],
      [0.3, 0.505],
      [0.262, 0.505],
      [0.235, 0.47],
      [0.001, 0.448],
    ],
    10,
    0,
    0,
    0,
    stone,
    { grad: 0.35 },
  );
  k.cyl(0.236, 0.236, 0.012, 14, 0, 0.452, 0, K.waterShallow, { grad: 0, ao: false, jitter: 0 });
  for (let i = 0; i < 4; i++) {
    const a = rng.next() * Math.PI * 2;
    k.blob(0.05 + rng.next() * 0.03, Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17, K.leafDark, {
      scale: [1.3, 0.45, 1.1],
      detail: 0,
    });
  }
  const perches: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    perches.push(v3(Math.cos(a) * 0.285, 0.51, Math.sin(a) * 0.285));
  }
  return { geometry: k.build(), perches, anim: `pop` };
}

export function buildBeehive(seed: number): FeatureModel { // Hu (23122)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  k.cyl(0.19, 0.24, 0.27, 9, 0, 0, 0, K.bark, { grad: 0.4 });
  k.cyl(0.185, 0.185, 0.02, 9, 0, 0.265, 0, K.woodLight, { grad: 0 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng.next() * 0.6;
    k.beam(
      v3(Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14),
      v3(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3),
      0.07,
      0.06,
      K.bark,
      { grad: 0.2 },
    );
  }
  const straw = `#e3c177`;
  const strawDark = `#cfa75c`;
  const baseY = 0.3;
  let topY = baseY;
  k.cyl(0.1, 0.2, 0.4, 12, 0, baseY, 0, strawDark, { grad: 0.1 });
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const r = 0.215 * Math.sqrt(Math.max(0.05, 1 - t * t * 0.95));
    const y = 0.33999999999999997 + i * 0.07;
    k.ring(r, 0.046, 5, 16, 0, y, 0, i % 2 ? straw : X(straw, -0.03), { grad: 0.25, jitter: 0.05 });
    topY = y;
  }
  k.blob(0.1, 0, topY + 0.03, 0, straw, { scale: [1, 0.7, 1] });
  k.cyl(0.02, 0.03, 0.05, 6, 0, topY + 0.08, 0, strawDark);
  k.box(0.1, 0.05, 0.03, 0, 0.33499999999999996, 0.205, HOLE, { grad: 0, ao: false });
  k.box(0.15, 0.018, 0.07, 0, 0.303, 0.23, K.woodLight, { grad: 0 });
  return { geometry: k.build(), perches: [v3(0, topY + 0.13, 0)], anim: `pop` };
}

export function buildBirdhouse(seed: number): FeatureModel { // Uu (23157)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const bodies = [`#e9d6b4`, `#a9cfc9`, `#f2c9a8`, `#cfdca9`, `#d9c6e6`];
  const roofs = [`#c8695a`, `#5e8fa6`, `#7a9a5a`, `#b5654a`];
  const body = bodies[Math.floor(rng.next() * bodies.length)];
  const roof = roofs[Math.floor(rng.next() * roofs.length)];
  k.box(0.07, 0.36, 0.035, 0, 0, 0, K.woodDark, { ao: false });
  k.box(0.18, 0.21, 0.17, 0, 0, 0.11, body, { ao: false, grad: 0.15, bevel: 0.015 });
  k.tris(
    extrudePolygon(
      [
        [-0.09, 0.105],
        [0.09, 0.105],
        [0, 0.19],
      ],
      0.16,
    ),
    0,
    0,
    0.11,
    body,
    { ao: false, grad: 0 },
  );
  k.box(0.145, 0.026, 0.22, -0.058, 0.155, 0.11, roof, { rot: [0, 0, 0.72], ao: false, bevel: 0.01 });
  k.box(0.145, 0.026, 0.22, 0.058, 0.155, 0.11, X(roof, -0.04), { rot: [0, 0, -0.72], ao: false, bevel: 0.01 });
  k.cyl(0.036, 0.036, 0.012, 10, 0, 0.03, 0.195, HOLE, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
  k.cyl(0.011, 0.011, 0.07, 6, 0, -0.04, 0.195, K.woodDark, { rot: [Math.PI / 2, 0, 0], ao: false });
  return { geometry: k.build(), perches: [v3(0, -0.025, 0.26), v3(0, 0.215, 0.11)], anim: `pop` };
}

export function buildLantern(seed: number): FeatureModel { // Wu (23189)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const glow = new MeshKit(rng);
  const stone = X(K.stone, rng.next() * 0.04 - 0.02);
  const light = K.stoneLight;
  const moss = K.leafDark;
  const turn = Math.PI / 6;
  k.cyl(0.19, 0.23, 0.07, 6, 0, 0, 0, stone, { rot: [0, turn, 0], grad: 0.3 });
  k.cyl(0.07, 0.09, 0.3, 6, 0, 0.07, 0, light, { rot: [0, turn, 0], grad: 0.25 });
  k.cyl(0.17, 0.11, 0.075, 6, 0, 0.37, 0, stone, { rot: [0, turn, 0], grad: 0.2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.box(0.035, 0.16, 0.035, Math.cos(a) * 0.118, 0.525, Math.sin(a) * 0.118, light, { rot: [0, -a, 0], grad: 0.1 });
  }
  glow.cyl(0.108, 0.108, 0.15, 6, 0, 0.445, 0, K.lanternGlow, { ao: false, grad: 0, jitter: 0 });
  k.cyl(0.285, 0.285, 0.03, 6, 0, 0.6, 0, stone, { rot: [0, turn, 0], grad: 0 });
  k.cyl(0.05, 0.27, 0.13, 6, 0, 0.628, 0, stone, { rot: [0, turn, 0], grad: 0.15 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + turn;
    k.blob(0.035, Math.cos(a) * 0.28, 0.64, Math.sin(a) * 0.28, stone, { detail: 0 });
    if (rng.next() < 0.5)
      k.blob(0.05, Math.cos(a) * 0.17, 0.7, Math.sin(a) * 0.17, moss, { scale: [1.2, 0.4, 1], detail: 0 });
  }
  k.cyl(0.03, 0.045, 0.04, 6, 0, 0.755, 0, light);
  k.blob(0.05, 0, 0.815, 0, light, { scale: [1, 1.15, 1] });
  for (let i = 0; i < 3; i++) {
    const a = rng.next() * Math.PI * 2;
    k.blob(0.06, Math.cos(a) * 0.2, 0.035, Math.sin(a) * 0.2, moss, { scale: [1.3, 0.45, 1.1], detail: 0 });
  }
  return {
    geometry: k.build(),
    glow: glow.build(),
    perches: [v3(0, 0.87, 0)],
    anim: `pop`,
    glowDisc: 1.35,
    light: v3(0, 0.52, 0),
  };
}

/** Arched plank bridge along x from -half to +half; y0 and y1 are the bank heights at each end. */
export function buildBridge(seed: number, half: number, y0: number, y1: number): FeatureModel { // Gu (23227)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const width = 0.64;
  const arch = 0.22 + half * 0.05;
  const yAt = (t: number): number => y0 + (y1 - y0) * t + arch * 4 * t * (1 - t);
  const xAt = (t: number): number => -half + 2 * half * t;
  const planks = Math.max(8, Math.round((2 * half) / 0.125));
  const woods = [K.woodLight, K.wood, X(K.woodLight, -0.05)];
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    const x = xAt(t);
    const slope = (yAt(t + 0.01) - yAt(t - 0.01)) / (xAt(t + 0.01) - xAt(t - 0.01));
    const w = (2 * half) / planks - 0.012;
    k.box(w, 0.045, width + (rng.next() - 0.5) * 0.04, x, yAt(t) - 0.022, (rng.next() - 0.5) * 0.02, woods[i % 3], {
      rot: [0, (rng.next() - 0.5) * 0.05, Math.atan(slope)],
      bevel: 0.012,
      grad: 0.2,
      ao: false,
      jitter: 0.08,
    });
  }
  for (const side of [-1, 1]) {
    const z = side * (width / 2 - 0.06);
    for (let i = 0; i < 10; i++) {
      const t0 = i / 10;
      const t1 = (i + 1) / 10;
      k.beam(v3(xAt(t0), yAt(t0) - 0.08, z), v3(xAt(t1), yAt(t1) - 0.08, z), 0.07, 0.09, K.woodDark, {
        ao: false,
        extend: 0.01,
      });
    }
  }
  const postTs = [0, 0.25, 0.5, 0.75, 1];
  const perches: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const z = side * (width / 2 - 0.01);
    for (const pt of postTs) {
      const t = Math.min(0.97, Math.max(0.03, pt));
      const end = pt === 0 || pt === 1;
      const h = end ? 0.4 : 0.33;
      const w = end ? 0.075 : 0.055;
      const bottom = yAt(t) - (end ? 0.25 : 0.06);
      k.box(w, h + (end ? 0.25 : 0.06), w, xAt(t), bottom + (h + (end ? 0.25 : 0.06)) / 2, z, K.woodDark, {
        ao: false,
        bevel: 0.012,
        grad: 0.2,
      });
      k.box(w + 0.02, 0.025, w + 0.02, xAt(t), yAt(t) + h + 0.012, z, K.wood, { ao: false });
      perches.push(v3(xAt(t), yAt(t) + h + 0.03, z));
    }
    for (let i = 0; i < 12; i++) {
      const t0 = 0.03 + (0.94 * i) / 12;
      const t1 = 0.03 + (0.94 * (i + 1)) / 12;
      k.beam(v3(xAt(t0), yAt(t0) + 0.3, z), v3(xAt(t1), yAt(t1) + 0.3, z), 0.045, 0.04, K.wood, {
        ao: false,
        extend: 0.008,
      });
      k.beam(v3(xAt(t0), yAt(t0) + 0.15, z), v3(xAt(t1), yAt(t1) + 0.15, z), 0.03, 0.03, K.woodDark, {
        ao: false,
        extend: 0.006,
      });
    }
  }
  return { geometry: k.build(), perches, anim: `rise` };
}

export function buildSteppingStones(seed: number, stones: ClearSpot[]): FeatureModel { // Ku (23284)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const perches: THREE.Vector3[] = [];
  for (const s of stones) {
    const col = X(K.stone, (rng.next() - 0.5) * 0.08);
    const rot = [0, rng.next() * Math.PI, 0];
    k.cyl(s.r * 0.95, s.r * 1.05, 0.62, 7, s.x, -0.58, s.z, X(col, -0.08), { rot, grad: 0.5, ao: false });
    k.blob(s.r, s.x, 0.03, s.z, col, { rot, scale: [1.05, 0.32, 0.9], detail: 1, ao: false, grad: 0.1 });
    if (rng.next() < 0.45) {
      const a = rng.next() * Math.PI * 2;
      k.blob(s.r * 0.35, s.x + Math.cos(a) * s.r * 0.5, 0.075, s.z + Math.sin(a) * s.r * 0.5, K.leafDark, {
        scale: [1.3, 0.35, 1],
        detail: 0,
        ao: false,
      });
    }
    perches.push(v3(s.x, 0.1, s.z));
  }
  return { geometry: k.build(), perches, anim: `pop` };
}

export function buildLogPile(seed: number): FeatureModel { // qu (23307)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const logs: { z: number; y: number }[] = [];
  const radius = 0.08;
  for (const z of [-0.165, 0, 0.165]) logs.push({ z, y: radius });
  for (const z of [-0.083, 0.083]) logs.push({ z, y: 0.21760000000000002 });
  logs.push({ z: 0, y: 0.3552 });
  let top = 0;
  for (const log of logs) {
    const r = radius * (0.9 + rng.next() * 0.18);
    const len = 0.6 + rng.next() * 0.12;
    const off = (rng.next() - 0.5) * 0.08;
    const bark = X(K.bark, (rng.next() - 0.5) * 0.08);
    k.cyl(r, r, len, 8, off + len / 2, log.y, log.z, bark, { rot: [rng.next() * 3, 0, Math.PI / 2], grad: 0, ao: true });
    for (const end of [-1, 1]) {
      const x = off + (end * len) / 2 + end * 0.004;
      k.cyl(r * 0.9, r * 0.9, 0.014, 8, x + (end > 0 ? 0 : 0.014), log.y, log.z, K.woodLight, {
        rot: [0, 0, Math.PI / 2],
        grad: 0,
      });
      k.cyl(r * 0.4, r * 0.4, 0.018, 8, x + (end > 0 ? 0.002 : 0.016), log.y, log.z, K.wood, {
        rot: [0, 0, Math.PI / 2],
        grad: 0,
      });
    }
    top = Math.max(top, log.y + r);
  }
  k.blob(0.07, 0.05, top - 0.01, 0, K.leafDark, { scale: [1.6, 0.35, 1.1], detail: 0 });
  for (let i = 0; i < 2; i++) {
    const x = 0.2 + rng.next() * 0.1;
    const z = 0.2 + i * 0.05;
    k.cyl(0.012, 0.016, 0.05, 6, x, 0, z, K.daisy);
    k.blob(0.032, x, 0.055, z, K.poppy, { scale: [1, 0.55, 1], detail: 1 });
  }
  return { geometry: k.build(), perches: [v3(0, top + 0.02, 0), v3(0.25, top - 0.08, 0.08)], anim: `pop` };
}

export function buildLeafPile(seed: number): FeatureModel { // Ju (23344)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const cols = [K.autumnOrange, K.autumnRed, K.autumnGold, `#d9913f`, `#c7703a`];
  for (let i = 0; i < 11; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next()) * 0.22;
    const r = 0.1 + rng.next() * 0.07;
    k.blob(r, Math.cos(a) * d, 0.03 + (0.22 - d) * 0.35, Math.sin(a) * d, cols[i % cols.length], {
      scale: [1.2, 0.55, 1.1],
      detail: 1,
      grad: 0.3,
      jitter: 0.1,
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = 0.28 + rng.next() * 0.32;
    k.box(0.075, 0.012, 0.05, Math.cos(a) * d, 0.012, Math.sin(a) * d, cols[Math.floor(rng.next() * cols.length)], {
      rot: [(rng.next() - 0.5) * 0.3, rng.next() * 3, (rng.next() - 0.5) * 0.3],
      grad: 0,
      ao: false,
      jitter: 0.1,
    });
  }
  return { geometry: k.build(), perches: [v3(0, 0.2, 0)], anim: `pop` };
}

export function buildInsectHotel(seed: number): FeatureModel { // Yu (23371)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const wood = K.wood;
  const w = 0.46;
  const d = 0.2;
  const h = 0.48;
  for (const s of [-1, 1]) k.box(0.055, 0.24, 0.055, s * 0.17, 0.24 / 2, 0, K.woodDark, { grad: 0.3 });
  k.box(w, h, 0.03, 0, 0.45999999999999996, -0.085, K.woodDark, { ao: false });
  for (const s of [-1, 1]) k.box(0.04, h, d, s * (w / 2 - 0.02), 0.45999999999999996, 0, wood, { ao: false, grad: 0.1 });
  for (const y of [0, 0.16, 0.32, 0.45999999999999996])
    k.box(w, 0.035, d, 0, 0.22 + y + 0.0175, 0, wood, { ao: false, grad: 0.05 });
  k.box(0.035, 0.16, d, 0, 0.45999999999999996, 0, wood, { ao: false });
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 2; j++) {
      const x = -0.16 + i * 0.08;
      const y = 0.29000000000000004 + j * 0.065;
      k.cyl(0.03, 0.03, 0.1, 7, x, y, -0.035, `#d7bd84`, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
      k.cyl(0.016, 0.016, 0.012, 6, x, y, 0.066, HOLE, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
    }
  for (let i = 0; i < 3; i++) {
    const x = -0.17 + (i % 2) * 0.07 + (i === 2 ? 0.035 : 0);
    const y = 0.435 + (i === 2 ? 0.055 : 0);
    k.cyl(0.036, 0.036, 0.05, 8, x, y, 0.035, K.woodLight, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
    k.cyl(0.013, 0.013, 0.006, 6, x, y, 0.08600000000000001, K.wood, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
  }
  for (let i = 0; i < 3; i++) {
    const x = 0.06 + i * 0.055;
    const y = 0.435 + (i % 2) * 0.05;
    k.cone(0.03, 0.08, 6, x, y, 0.015, `#8a5a3a`, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0.4 });
  }
  for (let i = 0; i < 9; i++) {
    const y = 0.58 + (i % 3) * 0.03 + rng.next() * 0.01;
    const z = 0.045 - Math.floor(i / 3) * 0.03;
    k.beam(v3(-0.2, y, z), v3(0.2, y + (rng.next() - 0.5) * 0.02, z), 0.018, 0.018, i % 2 ? `#e2c27b` : `#c7a05a`, {
      ao: false,
    });
  }
  k.box(0.3, 0.035, 0.30000000000000004, -0.12, 0.7899999999999999, 0, K.woodDark, {
    rot: [0, 0, 0.62],
    ao: false,
    bevel: 0.01,
  });
  k.box(0.3, 0.035, 0.30000000000000004, 0.12, 0.7899999999999999, 0, X(K.woodDark, 0.03), {
    rot: [0, 0, -0.62],
    ao: false,
    bevel: 0.01,
  });
  k.tris(
    extrudePolygon(
      [
        [-0.22, 0],
        [w / 2 - 0.01, 0],
        [0, 0.16],
      ],
      0.18000000000000002,
    ),
    0,
    0.7,
    0,
    wood,
    { ao: false, grad: 0 },
  );
  k.blob(0.05, -0.08, 0.85, 0.05, K.leafDark, { scale: [1.5, 0.4, 1.2], detail: 0, ao: false });
  return { geometry: k.build(), perches: [v3(0, 0.8999999999999999, 0)], anim: `pop` };
}

/** One fence run, relative to the fence origin. */
export interface FenceSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
}

export function buildFence(seed: number, segments: FenceSegment[]): FeatureModel { // Xu (23439)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const paint = X(CREAM, (rng.next() - 0.5) * 0.03);
  const posts = new Set<string>();
  const perches: THREE.Vector3[] = [];
  const post = (x: number, z: number, y: number): void => {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (posts.has(key)) return;
    posts.add(key);
    k.box(0.07, 0.4, 0.07, x, y + 0.2 - 0.04, z, paint, { bevel: 0.012, grad: 0.25, ao: false });
    k.cone(0.058, 0.06, 4, x, y + 0.36, z, paint, { rot: [0, Math.PI / 4, 0], ao: false, grad: 0 });
    perches.push(v3(x, y + 0.42, z));
  };
  for (const seg of segments) {
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const spans = Math.max(1, Math.ceil(len / 0.6));
    for (let i = 0; i <= spans; i++) post(seg.ax + (dx * i) / spans, seg.az + (dz * i) / spans, seg.y);
    for (const h of [0.1, 0.25])
      k.beam(v3(seg.ax, seg.y + h, seg.az), v3(seg.bx, seg.y + h, seg.bz), 0.024, 0.045, X(paint, -0.03), { ao: false });
    const rotY = Math.atan2(-dz, dx);
    const pickets = Math.max(1, Math.floor(len / 0.1));
    for (let i = 0; i < pickets; i++) {
      const t = (i + 0.5) / pickets;
      const x = seg.ax + dx * t;
      const z = seg.az + dz * t;
      const h = 0.25 + (rng.next() - 0.5) * 0.02;
      k.box(0.052, h, 0.022, x, seg.y + h / 2 - 0.01, z, paint, {
        rot: [0, rotY, 0],
        bevel: 0.006,
        grad: 0.3,
        ao: false,
        jitter: 0.03,
      });
      k.tris(PICKET_TIP, x, seg.y + h - 0.01, z, paint, { rot: [0, rotY, 0], ao: false, grad: 0 });
    }
  }
  return { geometry: k.build(), perches, anim: `rise` };
}

/** Rose arch of half-width `half` along x. */
export function buildRoseArch(seed: number, half: number): FeatureModel { // Zu (23481)
  const rng = new Rng(seed);
  const k = new MeshKit(rng);
  const r = half;
  const h = 0.95;
  const paint = CREAM;
  const slots: THREE.Vector3[] = [];
  for (const z of [-0.075, 0.075]) {
    for (const s of [-1, 1]) k.box(0.04, h, 0.04, s * r, h / 2, z, paint, { grad: 0.2, bevel: 0.008 });
    for (let i = 0; i < 10; i++) {
      const a0 = Math.PI - (Math.PI * i) / 10;
      const a1 = Math.PI - (Math.PI * (i + 1)) / 10;
      k.beam(
        v3(Math.cos(a0) * r, h + Math.sin(a0) * r * 0.85, z),
        v3(Math.cos(a1) * r, h + Math.sin(a1) * r * 0.85, z),
        0.04,
        0.04,
        paint,
        { ao: false, extend: 0.01 },
      );
    }
  }
  for (const s of [-1, 1]) {
    for (let y = 0.2; y < h; y += 0.19) k.box(0.03, 0.03, 0.19, s * r, y, 0, paint, { ao: false });
    for (let y = 0.12; y <= h; y += 0.1) slots.push(v3(s * r, y, 0));
  }
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (Math.PI * i) / 12;
    const p = v3(Math.cos(a) * r, h + Math.sin(a) * r * 0.85, 0);
    k.box(0.03, 0.03, 0.19, p.x, p.y, 0, paint, { ao: false });
    slots.push(p);
  }
  const leaves = new MeshKit(rng);
  const blooms = new MeshKit(rng);
  const greens = [K.leafDark, K.leaf, X(K.leafDark, -0.03)];
  const roses = [K.rose, K.blossom, `#f08aa0`, `#e8697e`];
  for (const p of slots) {
    for (let i = 0; i < 2; i++) {
      const o = v3((rng.next() - 0.5) * 0.12, (rng.next() - 0.5) * 0.08, (rng.next() - 0.5) * 0.22);
      leaves.blob(0.065 + rng.next() * 0.04, p.x + o.x, p.y + o.y, p.z + o.z, greens[Math.floor(rng.next() * 3)], {
        detail: 0,
        ao: false,
        grad: 0.15,
        jitter: 0.08,
        pivot: true,
      });
    }
    if (rng.next() < 0.55) {
      const side = rng.next() < 0.5 ? -1 : 1;
      blooms.blob(
        0.038,
        p.x + (rng.next() - 0.5) * 0.08,
        p.y + (rng.next() - 0.5) * 0.06,
        p.z + side * (0.1 + rng.next() * 0.04),
        roses[Math.floor(rng.next() * 4)],
        { detail: 1, ao: false, grad: 0.1, pivot: true },
      );
    }
  }
  for (const s of [-1, 1]) {
    k.blob(0.1, s * r, 0.05, 0, K.woodDark, { scale: [1, 0.5, 1.1], detail: 0 });
    leaves.blob(0.14, s * r, 0.08, 0, K.leafDark, { scale: [1, 0.7, 1.2], detail: 1, pivot: true });
  }
  return {
    geometry: k.build(),
    leaves: leaves.build(),
    blooms: blooms.build(),
    perches: [v3(0, h + r * 0.85 + 0.1, 0)],
    anim: `pop`,
  };
}

/** Rowboat at the origin, tied to a mooring post at `post` (local to the boat). */
export function buildRowboat(seed: number, post: THREE.Vector3): FeatureModel { // Qu (23550)
  const rng = new Rng(seed);
  const hull = new MeshKit(rng);
  const dock = new MeshKit(rng);
  const paints = [`#6fa3a8`, `#e58f65`, `#8fb3ea`, `#d9624f`, `#88b07a`];
  const paint = paints[Math.floor(rng.next() * paints.length)];
  const beamW = 0.42;
  const halfWidth = (t: number): number => {
    const a = Math.abs(t);
    return t >= 0
      ? (beamW / 2) * Math.max(0, 1 - a ** 2.1) ** 0.6
      : (beamW / 2) * Math.max(0.52, Math.max(0, 1 - a ** 3.2) ** 0.45);
  };
  const rimY = (t: number): number => 0.11 + 0.06 * t * t + (t > 0 ? 0.03 * t * t : 0);
  const depth = (t: number): number => 0.2 * (1 - 0.3 * t * t);
  const hullPt = (i: number, j: number, inner: boolean): THREE.Vector3 => {
    const t = -1 + (2 * i) / 12;
    const x = (t * 1) / 2;
    const a = -Math.PI / 2 + (Math.PI * j) / 8;
    const shrink = inner ? 0.86 : 1;
    const w = halfWidth(t) * shrink;
    return v3(x, rimY(t) - (inner ? 0.012 : 0) - depth(t) * (inner ? 0.82 : 1) * Math.cos(a), w * Math.sin(a));
  };
  const shell = (inner: boolean, j0: number, j1: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 12; i++)
      for (let j = j0; j < j1; j++) {
        const p00 = hullPt(i, j, inner);
        const p10 = hullPt(i + 1, j, inner);
        const p11 = hullPt(i + 1, j + 1, inner);
        const p01 = hullPt(i, j + 1, inner);
        const c = p00.clone().add(p10).add(p11).add(p01).multiplyScalar(0.25);
        const outward = v3(0, c.y - 0.15, c.z).multiplyScalar(inner ? -1 : 1);
        const quad =
          p10.clone().sub(p00).cross(p01.clone().sub(p00)).dot(outward) >= 0
            ? [p00, p10, p11, p00, p11, p01]
            : [p00, p11, p10, p00, p01, p11];
        for (const p of quad) out.push(p.x, p.y, p.z);
      }
    return out;
  };
  hull.tris(shell(false, 1, 7), 0, 0, 0, paint, { ao: false, grad: 0.35 });
  const rims = [...shell(false, 0, 1), ...shell(false, 7, 8)];
  hull.tris(rims, 0, 0, 0, CREAM, { ao: false, grad: 0 });
  hull.tris(shell(true, 0, 8), 0, 0, 0, K.woodLight, { ao: false, grad: 0.3 });
  for (const j of [0, 8])
    for (let i = 0; i < 12; i++) {
      const a = hullPt(i, j, false);
      const b = hullPt(i + 1, j, false);
      a.y += 0.01;
      b.y += 0.01;
      hull.beam(a, b, 0.035, 0.028, K.woodDark, { ao: false, extend: 0.01 });
    }
  const stern: number[] = [];
  for (let j = 0; j < 8; j++) {
    const a = hullPt(0, j, false);
    const b = hullPt(0, j + 1, false);
    const c = v3(a.x, rimY(-1) - 0.02, 0);
    stern.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z);
    stern.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  hull.tris(stern, 0, 0, 0, paint, { ao: false, grad: 0 });
  for (const t of [-0.35, 0.25]) {
    const len = halfWidth(t) * 1.7;
    hull.box(0.07, 0.025, len, (t * 1) / 2, rimY(t) - 0.06, 0, K.wood, { ao: false });
  }
  for (const s of [-1, 1]) {
    const y = rimY(0) - 0.035;
    hull.beam(v3(-0.38, y + 0.01, s * 0.07), v3(0.34, y, s * 0.1), 0.022, 0.022, K.woodLight, { ao: false });
    hull.box(0.16, 0.012, 0.06, 0.4, y - 0.002, s * 0.105, K.woodLight, { rot: [0, s * 0.05, 0], ao: false });
  }
  dock.cyl(0.05, 0.06, 0.42, 7, post.x, post.y - 0.08, post.z, K.woodDark, { grad: 0.35 });
  dock.ring(0.055, 0.015, 4, 10, post.x, post.y + 0.24, post.z, ROPE, { ao: false });
  const bow = v3(1 / 2 - 0.02, rimY(1) - 0.02, 0);
  const knot = v3(post.x, post.y + 0.24, post.z);
  let prev = knot.clone();
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const p = knot.clone().lerp(bow, t);
    p.y -= Math.sin(Math.PI * t) * 0.09;
    dock.beam(prev, p, 0.014, 0.014, ROPE, { ao: false, extend: 0.004 });
    prev = p;
  }
  return {
    geometry: dock.build(),
    moving: hull.build(),
    perches: [v3(1 / 2 - 0.03, rimY(1) + 0.02, 0), v3(post.x, post.y + 0.36, post.z)],
    anim: `pop`,
  };
}
