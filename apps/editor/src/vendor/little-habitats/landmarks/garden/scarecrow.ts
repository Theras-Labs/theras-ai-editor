// Ports index-BwioI7A7.js 28073-28558: the scarecrow (Lp) and its constants (kp..Ip).
import * as THREE from 'three';
import { easeOutCubic } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import {
  INK,
  QUARTER_TURN,
  STRAW,
  STRAW_DARK,
  gardenMaterials,
  kick,
  pivotMesh,
  placementSeed,
  pokeDirLocal,
  pumpkinSeason,
  rgb,
  vec3,
} from './shared';

const MIN_FIELD = 10; // kp (28073)
const SHIRT_COLORS = [`#7f9fc4`, `#c9725f`, `#8fb39a`, `#b58fc4`]; // Ap (28074)
const PATCH_COLORS = [`#e6b54f`, `#9cc29a`, `#e98f7a`, `#f0dcb0`, `#8fb3ea`]; // jp (28075)
const STRAW_RGB = [STRAW, STRAW_DARK, `#f0d998`].map(rgb); // Mp (28076)
const SPARK_RGB = rgb(`#ffd98a`); // Np (28077)
const ARM_X = 0.17; // Pp (28078)
const ARM_Y = 0.945; // Fp (28079)
const pokeDir = { x: 0, z: 0 }; // Ip (28080)

export const SCARECROW: LandmarkDef = { // Lp (28081)
  id: `scarecrow`,
  name: `Scarecrow`,
  icon: `🎃`,
  tint: `#f6d9b4`,
  blurb: `A cheerful scarecrow keeps watch over the field. Come autumn, pumpkins gather at its feet.`,
  hint: `Sow a really big field of seeds, well away from the water, and someone will come to keep watch.`,
  priority: 30,
  max: 1,
  detect(ctx) {
    const found: { p: LandmarkPlacement; s: number }[] = [];
    const waterTops: THREE.Vector3[] = [];
    for (const c of ctx.corners) if (ctx.water(c)) waterTops.push(ctx.top(c));
    for (const region of ctx.regions((c) => ctx.mat(c) === `soil` && ctx.sown(c))) {
      if (region.length < MIN_FIELD) continue;
      const inside = new Set(region);
      const mid = ctx.centroid(region);
      let best = -1;
      let bestScore = -1 / 0;
      let bestY = 0;
      for (const c of region) {
        const h = ctx.h(c);
        if (!ctx.nbrs(c).every((n) => inside.has(n) && ctx.h(n) === h)) continue;
        const top = ctx.top(c);
        let water = 1 / 0;
        for (const w of waterTops) water = Math.min(water, Math.hypot(w.x - top.x, w.z - top.z));
        if (water < 1.9) continue;
        const y = ctx.flat(top.x, top.z, 0.5, 0.06);
        if (y === null) continue;
        const score = -Math.hypot(top.x - mid.x, top.z - mid.z) + ctx.h01(c, 301) * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = c;
          bestY = y;
        }
      }
      if (best < 0) continue;
      const top = ctx.top(best);
      found.push({
        p: {
          key: `scarecrow:${best}`,
          x: top.x,
          y: bestY,
          z: top.z,
          rotY: QUARTER_TURN + (ctx.h01(best, 302) - 0.5) * 0.7,
          radius: 0.7,
          clear: 0.82,
        },
        s: region.length + ctx.h01(best, 303),
      });
    }
    return found.sort((a, b) => b.s - a.s).map((f) => f.p);
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const garden = gardenMaterials();
    const rng = new Rng(placementSeed(seed, p, 23714));
    const body = new MeshKit(rng);
    const shirt = SHIRT_COLORS[Math.floor(rng.next() * SHIRT_COLORS.length)];
    const cuff = shadeColor(shirt, -0.08);
    const arms: Record<number, MeshKit> = { [-1]: new MeshKit(rng), 1: new MeshKit(rng) };
    const hatKit = new MeshKit(rng);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng.next() * 0.5;
      const r = 0.08 + rng.next() * 0.08;
      body.blob(0.075 + rng.next() * 0.03, Math.cos(a) * r, 0, Math.sin(a) * r, shadeColor(PALETTE.earthDark, (rng.next() - 0.5) * 0.08), {
        scale: [1.3, 0.45, 1.1],
        rot: [0, a, 0],
        detail: 0,
        grad: 0.2,
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 0.12 + rng.next() * 0.12;
      body.box(0.1, 0.012, 0.014, Math.cos(a) * r, 0.035, Math.sin(a) * r, i % 2 ? STRAW : STRAW_DARK, {
        rot: [0, rng.next() * 3, 0.1],
        ao: false,
        grad: 0,
      });
    }
    body.box(0.065, 1.14, 0.065, 0, 0.57, 0, PALETTE.woodDark, { grad: 0.35, bevel: 0.015 });
    for (const e of [-1, 1]) {
      const arm = arms[e];
      arm.beam(vec3(e * 0.08, 0.945 + e * 0.0017, -0.01), vec3(e * 0.47, 0.945 + e * 0.01, -0.01), 0.042, 0.042, PALETTE.wood, {
        bevel: 0.012,
      });
      arm.beam(vec3(e * 0.44, 0.95, 0), vec3(e * 0.56, 1.03, 0.01), 0.022, 0.022, PALETTE.wood, { ao: false });
      arm.beam(vec3(e * 0.45, 0.94, 0), vec3(e * 0.55, 0.88, 0.03), 0.02, 0.02, PALETTE.wood, { ao: false });
    }
    body.box(0.34, 0.37, 0.21, 0, 0.845, 0, shirt, { bevel: 0.045, grad: 0.22 });
    for (const e of [-1, 1]) {
      arms[e].box(0.25, 0.12, 0.13, e * 0.285, 0.942, 0, shirt, { rot: [0, 0, e * -0.04], bevel: 0.03, grad: 0.15 });
      arms[e].box(0.035, 0.135, 0.145, e * 0.415, 0.936, 0, cuff, { bevel: 0.012, ao: false });
      for (let t = 0; t < 4; t++) {
        const a = (t / 4) * Math.PI * 2 + rng.next();
        arms[e].cone(
          0.022,
          0.09 + rng.next() * 0.04,
          4,
          e * 0.43,
          0.936 + Math.cos(a) * 0.035,
          Math.sin(a) * 0.04,
          t % 2 ? STRAW : STRAW_DARK,
          { rot: [0, 0, (e * -Math.PI) / 2 + (rng.next() - 0.5) * 0.5], ao: false, grad: 0.1 },
        );
      }
    }
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * 1.1;
      let x: number;
      let z: number;
      if (t < 0.34) {
        x = -0.15 + (t / 0.34) * 0.3;
        z = 0.09;
      } else if (t < 0.55) {
        x = 0.15;
        z = 0.09 - ((t - 0.34) / 0.21) * 0.18;
      } else if (t < 0.89) {
        x = 0.15 - ((t - 0.55) / 0.34) * 0.3;
        z = -0.09;
      } else {
        x = -0.15;
        z = -0.09 + ((t - 0.89) / 0.21) * 0.18;
      }
      body.cone(0.025, 0.1 + rng.next() * 0.05, 4, x, 0.69, z, i % 2 ? STRAW : STRAW_DARK, {
        rot: [Math.PI + (rng.next() - 0.5) * 0.4, 0, (rng.next() - 0.5) * 0.4],
        ao: false,
        grad: 0.1,
      });
    }
    const patch = (
      x: number,
      y: number,
      z: number,
      size: number,
      rotZ: number,
      color: THREE.ColorRepresentation,
      rotY = 0,
    ): void => {
      body.box(size, size, 0.014, x, y, z, color, { rot: [0, rotY, rotZ], bevel: 0.004, ao: false, grad: 0 });
      for (const [sx, sy] of [
        [-1, 0],
        [1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const c = Math.cos(rotZ);
        const s = Math.sin(rotZ);
        const dx = (size / 2) * sx;
        const dy = (size / 2) * sy;
        body.box(sx ? 0.008 : 0.028, sx ? 0.028 : 0.008, 0.01, x + dx * c - dy * s, y + dx * s + dy * c, z + 0.006, INK, {
          rot: [0, rotY, rotZ],
          bevel: 0.002,
          ao: false,
          grad: 0,
        });
      }
    };
    patch(0.075, 0.79, 0.107, 0.085, 0.18, PATCH_COLORS[Math.floor(rng.next() * PATCH_COLORS.length)]);
    patch(-0.085, 0.93, 0.107, 0.07, -0.12, PATCH_COLORS[Math.floor(rng.next() * PATCH_COLORS.length)]);
    for (let i = 0; i < 3; i++)
      body.blob(0.014, -0.005, 0.74 + i * 0.085, 0.108, `#f3ead8`, { scale: [1, 1, 0.5], detail: 0, ao: false });
    for (const e of [-1, 1])
      body.box(0.1, 0.022, 0.075, e * 0.055, 1.02, 0.065, `#f3ead8`, { rot: [0.35, 0, e * 0.45], bevel: 0.006, ao: false });
    body.ring(0.06, 0.016, 4, 12, 0, 1.04, 0, `#b99762`, { ao: false });
    const headY = 1.175;
    const headR = 0.148;
    body.blob(headR, 0, headY, 0, `#e6d2a2`, { scale: [1, 1.05, 0.95], detail: 2, grad: 0.15 });
    const faceZ = (x: number, y: number, off: number): number => {
      const q = 1 - (x / headR) ** 2 - ((y - headY) / (headR * 1.05)) ** 2;
      return headR * 0.95 * Math.sqrt(Math.max(0, q)) + off;
    };
    for (const e of [-1, 1]) {
      const ex = e * 0.052;
      const ey = 1.193;
      body.blob(0.024, ex, ey, faceZ(ex, ey, -0.006), INK, { scale: [1, 1.1, 0.6], detail: 1, ao: false });
      body.blob(0.007, ex + 0.008, 1.202, faceZ(ex, ey, 0.009), `#fbf5e9`, { detail: 0, ao: false });
      const cx = e * 0.085;
      const cy = 1.145;
      body.blob(0.026, cx, cy, faceZ(cx, cy, -0.008), `#f0a393`, { scale: [1, 0.62, 0.35], detail: 1, ao: false });
    }
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.019;
      const y = 1.123 + i * i * 0.0038;
      body.box(0.017, 0.006, 0.012, x, y, faceZ(x, y, 0.001), `#6b4d33`, {
        rot: [0, 0, i * 0.28],
        bevel: 0.002,
        ao: false,
        grad: 0,
      });
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + (i / 6) * 0.9) + Math.PI;
      const x = Math.cos(a) * 0.13;
      const z = -Math.abs(Math.sin(a)) * 0.07 - 0.02;
      body.cone(0.02, 0.09, 4, x, 1.245, z, i % 2 ? STRAW : STRAW_DARK, { rot: [-0.9, 0, -Math.sign(x) * 1.2], ao: false });
    }
    const hatTilt = new THREE.Euler(-0.1, 0, 0.14);
    const hatUp = vec3(0, 1, 0).applyEuler(hatTilt);
    const hatSide = vec3(1, 0, 0).applyEuler(hatTilt);
    const hatBase = vec3(0, 1.26, -0.005);
    const onHat = (up: number, side = 0): THREE.Vector3 =>
      hatBase.clone().addScaledVector(hatUp, up).addScaledVector(hatSide, side);
    const hatRot = [hatTilt.x, hatTilt.y, hatTilt.z];
    hatKit.cyl(0.25, 0.26, 0.024, 16, hatBase.x, hatBase.y, hatBase.z, STRAW, { rot: hatRot, ao: false, grad: 0.15 });
    const crownAt = onHat(0.02);
    hatKit.cyl(0.105, 0.126, 0.13, 12, crownAt.x, crownAt.y, crownAt.z, STRAW, { rot: hatRot, ao: false, grad: 0.2 });
    const topAt = onHat(0.148);
    hatKit.blob(0.106, topAt.x, topAt.y, topAt.z, shadeColor(STRAW, 0.03), { rot: hatRot, scale: [1, 0.25, 1], detail: 1, ao: false });
    const bandAt = onHat(0.024);
    hatKit.cyl(0.128, 0.128, 0.034, 12, bandAt.x, bandAt.y, bandAt.z, `#c8574a`, { rot: hatRot, ao: false, grad: 0 });
    const flowerAt = onHat(0.045, 0.132);
    hatKit.blob(0.036, flowerAt.x, flowerAt.y, flowerAt.z + 0.03, PALETTE.sunflower, { scale: [0.45, 1, 1], detail: 1, ao: false });
    hatKit.blob(0.017, flowerAt.x + 0.012, flowerAt.y, flowerAt.z + 0.03, `#7a4a2a`, { scale: [0.5, 1, 1], detail: 0, ao: false });
    const figure = new THREE.Group();
    figure.add(landmarkMesh(body.build(), mats.base));
    const hat = pivotMesh(hatKit, mats.base, hatBase.x, hatBase.y, hatBase.z);
    const armMesh: Record<number, THREE.Mesh> = {
      [-1]: pivotMesh(arms[-1], mats.base, -0.17, ARM_Y, 0),
      1: pivotMesh(arms[1], mats.base, ARM_X, ARM_Y, 0),
    };
    figure.add(hat, armMesh[-1], armMesh[1]);
    const hankyKit = new MeshKit(rng);
    for (let i = 0; i < 2; i++) {
      const color = i ? `#e8604f` : `#d94f45`;
      hankyKit.box(0.2 - i * 0.04, 0.045, 0.008, 0.1 - i * 0.02, (i - 0.5) * 0.035, 0, color, {
        rot: [0, 0, (i - 0.5) * 0.3],
        ao: false,
        grad: 0,
      });
    }
    hankyKit.blob(0.028, 0, 0, 0, `#d94f45`, { scale: [1, 0.8, 0.8], detail: 0, ao: false });
    const hanky = landmarkMesh(hankyKit.build(), mats.cloth);
    hanky.position.set(-0.18999999999999997, -0.0050000000000000044, 0.07);
    hanky.rotation.set(0, -0.3, -Math.PI / 2 + 0.25);
    armMesh[-1].add(hanky);
    const pumpkinKit = new MeshKit(rng);
    const pumpkinColors = [`#e8843a`, `#f09a45`, `#dd7430`, `#eb8f3c`, `#efe0bb`];
    const pumpkins = [
      { a: 1.3, d: 0.54, r: 0.2 },
      { a: 2.5, d: 0.52, r: 0.14 },
      { a: 0.25, d: 0.56, r: 0.16 },
      { a: 3.75, d: 0.5, r: 0.12 },
      { a: 5.3, d: 0.54, r: 0.145 },
    ]
      .map((pk, i) => {
        const a = pk.a + (rng.next() - 0.5) * 0.3;
        return {
          a,
          x: Math.cos(a) * pk.d,
          z: Math.sin(a) * pk.d,
          r: pk.r * (0.92 + rng.next() * 0.16),
          col: i === 3 ? pumpkinColors[4] : pumpkinColors[i % 4],
        };
      })
      .sort((a, b) => a.a - b.a);
    pumpkins.forEach(({ a: ang, x, z, r, col }, i) => {
      const center = [x, 0, z];
      const cy = r * 0.72;
      pumpkinKit.blob(r * 0.62, x, cy, z, shadeColor(col, -0.04), { center, detail: 1, grad: 0.25 });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rng.next() * 0.2;
        pumpkinKit.blob(r * 0.52, x + Math.cos(a) * r * 0.46, cy, z + Math.sin(a) * r * 0.46, k % 2 ? col : shadeColor(col, 0.03), {
          center,
          rot: [0, -a, 0],
          scale: [0.78, 0.92, 1.05],
          detail: 1,
          grad: 0.3,
        });
      }
      const lean = rng.next() - 0.5;
      pumpkinKit.cyl(r * 0.1, r * 0.15, r * 0.5, 5, x, cy + r * 0.4, z, `#6f7a3c`, {
        center,
        rot: [lean * 0.5, 0, lean * 0.6],
        ao: false,
      });
      for (let k = 0; k < 2; k++) {
        const a = ang + (k ? 0.8 : -0.8) + rng.next() * 0.3;
        pumpkinKit.blob(
          0.06 + rng.next() * 0.025,
          x + Math.cos(a) * r * 1.3,
          0.018,
          z + Math.sin(a) * r * 1.3,
          k ? PALETTE.leaf : PALETTE.leafDark,
          { center, rot: [0, -a, 0], scale: [1.15, 0.2, 1], detail: 1, ao: false },
        );
      }
      const next = pumpkins[i + 1];
      if (next) {
        let prev = vec3(x, 0.02, z);
        const mid = [(x + next.x) / 2, 0, (z + next.z) / 2];
        for (let k = 1; k <= 6; k++) {
          const t = k / 6;
          const a = ang + (next.a - ang) * t;
          const d = Math.hypot(x, z) * (1 - t) + Math.hypot(next.x, next.z) * t + Math.sin(t * Math.PI * 2) * 0.05;
          const at = vec3(Math.cos(a) * d, 0.02, Math.sin(a) * d);
          pumpkinKit.beam(prev, at, 0.018, 0.016, `#6e9a45`, { center: mid, ao: false, extend: 0.004 });
          prev = at;
        }
        pumpkinKit.blob(0.04, mid[0] * 1.1, 0.02, mid[2] * 1.1, PALETTE.leafLight, {
          center: mid,
          scale: [1.2, 0.2, 1],
          detail: 1,
          ao: false,
        });
      }
    });
    const pumpkinMesh = landmarkMesh(pumpkinKit.build(), garden.pumpkin, false);
    const root = new THREE.Group();
    root.add(figure, pumpkinMesh);
    const phase = (p.x * 1.7 + p.z * 0.9) % 6.28;
    const hop = new Spring(170, 8);
    const leanX = new Spring(80, 5);
    const leanZ = new Spring(80, 5);
    const armL = new Spring(60, 2.8);
    const armR = new Spring(60, 2.8);
    const hatPop = new Spring(75, 5);
    const hatTipZ = new Spring(70, 3.2);
    const hatTipX = new Spring(70, 3.2);
    let hatSpin = 0;
    let hatSpinTarget = 0;
    const straw = new SparkPoints(64, false);
    const sparks = new SparkPoints(24, true);
    const halo = glowSprite(3, 2.2, 1.2);
    halo.position.set(0, 1.18, 0.05);
    let flashT = 1 / 0;
    figure.add(straw.points, sparks.points, halo);
    let active = 0;
    const crowKit = new MeshKit(rng);
    const crowColor = `#3a3848`;
    crowKit.blob(0.065, 0, 0, 0, crowColor, { scale: [0.9, 0.85, 1.35], ao: false, grad: 0.1 });
    crowKit.blob(0.04, 0, 0.045, 0.085, crowColor, { ao: false, grad: 0.1 });
    crowKit.cone(0.015, 0.055, 5, 0, 0.04, 0.11, `#e8a94a`, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
    for (const e of [-1, 1]) crowKit.blob(0.009, e * 0.03, 0.056, 0.098, `#f4efe6`, { detail: 0, ao: false, grad: 0 });
    crowKit.box(0.07, 0.012, 0.1, 0, -0.005, -0.12, `#2f2d3a`, { rot: [-0.2, 0, 0], ao: false, grad: 0 });
    const crow = landmarkMesh(crowKit.build(), mats.base, false);
    const wings: THREE.Mesh[] = [];
    for (const e of [-1, 1]) {
      const wingKit = new MeshKit(rng);
      wingKit.box(0.17, 0.012, 0.09, e * 0.085, 0, 0, `#2f2d3a`, { ao: false, grad: 0, bevel: 0.004 });
      wingKit.box(0.09, 0.012, 0.07, e * 0.19, 0, -0.01, `#3a3848`, { ao: false, grad: 0, bevel: 0.004 });
      const wing = landmarkMesh(wingKit.build(), mats.base, false);
      wing.position.set(e * 0.04, 0.03, 0);
      crow.add(wing);
      wings.push(wing);
    }
    crow.visible = false;
    figure.add(crow);
    let crowT = 1 / 0;
    let crowLanded = false;
    const crowFrom = vec3(-1.7, 2, -1.5);
    const crowPerch = vec3(0.62, 1.16, 0.12);
    const crowTo = vec3(2.3, 2.7, -2);
    const crowAt = vec3(0, 0, 0);
    const emitStraw = (x: number, y: number, z: number, count: number, spread: number, rise: number): void => {
      for (let i = 0; i < count; i++) {
        const c = STRAW_RGB[Math.floor(Math.random() * STRAW_RGB.length)];
        const a = Math.random() * Math.PI * 2;
        straw.emit(
          x + (Math.random() - 0.5) * 0.06,
          y + (Math.random() - 0.5) * 0.05,
          z + (Math.random() - 0.5) * 0.06,
          Math.cos(a) * spread * (0.4 + Math.random()),
          rise * (0.5 + Math.random()),
          Math.sin(a) * spread * (0.4 + Math.random()),
          0.9 + Math.random() * 0.9,
          0.055 + Math.random() * 0.05,
          c[0] * nightDim,
          c[1] * nightDim,
          c[2] * nightDim,
          { gravity: 0.7, drag: 1.3, grow: 0.8 },
        );
      }
    };
    let nightDim = 1;
    return {
      object: root,
      update(ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const t = ctx.realTime + phase;
        figure.rotation.z = Math.sin(t * 0.9) * 0.022 * ctx.wind;
        figure.rotation.x = Math.sin(t * 0.63 + 1.3) * 0.012 * ctx.wind;
        const season = pumpkinSeason(ctx.time.yearFrac);
        pumpkinMesh.visible = season > 0.001;
        pumpkinMesh.castShadow = season > 0.6;
        const dt = ctx.dt;
        const dim = 1 - 0.5 * ctx.night;
        straw.update(dt);
        sparks.update(dt);
        if (!active) return;
        flashT += dt;
        const h = hop.update(dt);
        figure.position.y = Math.max(0, h) * 0.3;
        if (h < 0) {
          hop.x = 0;
          hop.v = Math.abs(hop.v) * 0.25;
        }
        figure.rotation.x += leanX.update(dt);
        figure.rotation.z += leanZ.update(dt);
        armMesh[-1].rotation.z = -armL.update(dt);
        armMesh[1].rotation.z = armR.update(dt);
        let pop = hatPop.update(dt);
        if (pop < 0) {
          hatPop.x = 0;
          hatPop.v = Math.abs(hatPop.v) * 0.3;
          pop = 0;
        }
        hat.position.y = hatBase.y + pop * 0.22;
        hat.rotation.z = hatTipZ.update(dt);
        hat.rotation.x = hatTipX.update(dt);
        hatSpin += (hatSpinTarget - hatSpin) * (1 - Math.exp(-5.5 * dt));
        hat.rotation.y = hatSpin;
        if (crowT !== 1 / 0) {
          crowT += dt;
          const ct = crowT;
          if (ct < 0.95) {
            const k = easeOutCubic(ct / 0.95);
            crowAt.copy(crowFrom).lerp(crowPerch, k);
            crowAt.y += Math.sin(k * Math.PI) * 0.35;
          } else if (ct < 1.3) {
            crowAt.copy(crowPerch);
            crowAt.y += Math.sin((ct - 0.95) * 20) * 0.03;
          } else {
            const k = Math.min(1, (ct - 1.3) / 1.5);
            const e = k * k * (0.6 + 0.4 * k);
            crowAt.copy(crowPerch).lerp(crowTo, e);
            crowAt.y += Math.sin(k * Math.PI) * 0.25;
          }
          if (ct >= 0.95 && !crowLanded) {
            crowLanded = true;
            kick(armR, 9, 18);
            kick(armL, 6, 18);
            kick(hop, 4, 9);
            kick(hatPop, 3.5, 9);
            kick(hatTipZ, 7, 11);
            emitStraw(0.5, 0.94, 0, 6, 0.6, 0.5);
          }
          crow.position.copy(crowAt);
          const heading =
            ct < 1.3
              ? Math.atan2(crowPerch.x - crowFrom.x, crowPerch.z - crowFrom.z)
              : Math.atan2(crowTo.x - crowPerch.x, crowTo.z - crowPerch.z);
          crow.rotation.y = heading;
          crow.rotation.x = ct < 0.95 ? 0.25 : ct < 1.3 ? -0.5 : -0.3;
          const flap = ct < 0.95 ? Math.sin(ct * 26) * 0.9 : ct < 1.3 ? Math.sin(ct * 40) * 1 : Math.sin(ct * 28) * 0.95;
          wings[0].rotation.z = -flap;
          wings[1].rotation.z = flap;
          const size = ct < 0.15 ? easeOutCubic(ct / 0.15) : ct > 2.4 ? Math.max(0.001, 1 - (ct - 2.4) / 0.4) : 1;
          crow.scale.setScalar(size);
          crow.visible = true;
          if (ct > 2.8) {
            crowT = 1 / 0;
            crow.visible = false;
          }
        }
        const glow = flashT < 0 ? 0 : Math.exp(-flashT * 4.5);
        setGlowSprite(halo, 0.5 + glow * 0.4, glow * 0.9 * dim);
        if (
          hop.settled &&
          leanX.settled &&
          leanZ.settled &&
          armL.settled &&
          armR.settled &&
          hatPop.settled &&
          hatTipZ.settled &&
          hatTipX.settled &&
          Math.abs(hatSpinTarget - hatSpin) < 0.002 &&
          glow < 0.02 &&
          crowT === 1 / 0
        ) {
          active = 0;
          figure.position.y = 0;
          armMesh[-1].rotation.z = 0;
          armMesh[1].rotation.z = 0;
          hat.position.y = hatBase.y;
          hat.rotation.set(0, 0, 0);
          hatSpin = 0;
          hatSpinTarget = 0;
        }
      },
      poke(poke, ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const n = Math.min(poke.count, 4);
        pokeDirLocal(poke, p.rotY ?? 0, pokeDir);
        kick(hop, 3.6 + n * 0.8, 9);
        kick(leanX, pokeDir.z * (0.5 + n * 0.15), 1.5);
        kick(leanZ, -pokeDir.x * (0.5 + n * 0.15), 1.5);
        kick(armR, 5.5 + n * 1.6, 16);
        kick(armL, 4.5 + n * 1.6, 16);
        kick(hatPop, 2.6 + n * 1, 9);
        kick(hatTipZ, (Math.random() < 0.5 ? -1 : 1) * (4 + n), 11);
        kick(hatTipX, (Math.random() - 0.5) * 6, 8);
        if (n >= 3) hatSpinTarget += Math.PI * 2;
        if (n >= 2 && crowT === 1 / 0) {
          crowT = 0;
          crowLanded = false;
        }
        emitStraw(0.5, 0.94, 0, 3 + n * 2, 0.5, 0.35);
        emitStraw(-0.5, 0.94, 0, 3 + n * 2, 0.5, 0.35);
        emitStraw(0, 0.7, 0, 3 + n * 3, 0.45, 0.2);
        emitStraw(0, 1.3, 0, 2 + n * 2, 0.4, 0.7);
        if (n >= 2) {
          flashT = 0;
          for (let i = 0; i < 4 + n * 3; i++) {
            const a = Math.random() * Math.PI * 2;
            sparks.emit(
              Math.cos(a) * 0.15,
              1.2 + Math.random() * 0.2,
              Math.sin(a) * 0.15,
              Math.cos(a) * 0.3,
              0.4 + Math.random() * 0.4,
              Math.sin(a) * 0.3,
              0.8 + Math.random() * 0.6,
              0.05 + Math.random() * 0.04,
              SPARK_RGB[0] * 2,
              SPARK_RGB[1] * 2,
              SPARK_RGB[2] * 2,
              { drag: 1.3, twinkle: 0.5, gravity: 0.3 },
            );
          }
        }
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        straw.dispose();
        sparks.dispose();
        disposeSprite(halo);
      },
    };
  },
};
