// Ports index-BwioI7A7.js 28559-28934: the potting shed (qp) and its constants (Rp..Kp).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, envelope, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import {
  POT_SOIL,
  QUARTER_TURN,
  TERRACOTTA,
  TRIM,
  atan2,
  flowerPot,
  flowerTuft,
  gable,
  kick,
  nearestTreeDist,
  pivotMesh,
  placementSeed,
  plankWall,
  pokeDirLocal,
  rgb,
  sprout,
  tiledRoof,
  vec3,
  wateringCan,
} from './shared';

const WIDTH = 0.92; // Rp (28559)
const DEPTH = 0.72; // zp (28560)
const FLOOR_Y = 0.08; // Bp (28561)
const WALL_H = 0.7; // Vp (28562)
const RIDGE_Y = 1.12; // Hp (28563)
const PAINTS: [string, string][] = [
  [`#8fb09a`, `#e0b24f`],
  [`#86a7bd`, `#d9776a`],
  [`#c9b28a`, `#6f9fa8`],
]; // Up (28564)
const DUST_RGB = [`#e3d5b8`, `#d6c4a0`, `#efe4cc`].map(rgb); // Wp (28569)
const PETAL_RGB = [PALETTE.poppy, PALETTE.tulipPink, PALETTE.daisy, PALETTE.sunflower].map(rgb); // Gp (28570)
const SPARK_RGB = rgb(`#ffd98a`); // Kp (28571)

export const GARDEN_SHED: LandmarkDef = { // qp (28572)
  id: `garden_shed`,
  name: `Potting shed`,
  icon: `🧺`,
  tint: `#e6dcc3`,
  blurb: `A cosy potting shed full of seed packets, twine and a well-loved watering can.`,
  hint: `A gardener needs a spot by the path, between flower beds, in the shade of a grown tree.`,
  priority: 30,
  max: 1,
  detect(ctx) {
    const grown = ctx.trees.filter((t) => t.mature);
    if (!grown.length) return [];
    const found: { p: LandmarkPlacement; s: number }[] = [];
    for (const corner of ctx.corners) {
      if (ctx.mat(corner) !== `soil` || ctx.sown(corner)) continue;
      const h = ctx.h(corner);
      if (h < 1 || h > 2) continue;
      const nbrs = ctx.nbrs(corner);
      if (!nbrs.every((n) => ctx.land(n))) continue;
      const beds = nbrs.filter((n) => ctx.sown(n) && ctx.mat(n) === `soil`).length;
      if (beds < 2) continue;
      const paths = nbrs.filter((n) => ctx.mat(n) === `stone` && ctx.h(n) <= h);
      if (!paths.length) continue;
      const top = ctx.top(corner);
      if (!grown.some((t) => Math.hypot(t.base.x - top.x, t.base.z - top.z) <= 3) || nearestTreeDist(ctx, top.x, top.z) < 1.05)
        continue;
      const y = ctx.flat(top.x, top.z, 0.45, 0.08);
      if (y === null) continue;
      let face = 0;
      let best = -1 / 0;
      for (const n of paths) {
        const a = ctx.angle(corner, n);
        const d = Math.cos(a) * Math.cos(QUARTER_TURN) + Math.sin(a) * Math.sin(QUARTER_TURN);
        if (d > best) {
          best = d;
          face = a;
        }
      }
      found.push({
        p: {
          key: `garden_shed:${corner}`,
          x: top.x,
          y,
          z: top.z,
          rotY: atan2(Math.cos(face), Math.sin(face)),
          radius: 0.8,
          clear: 0.72,
        },
        s: beds + paths.length * 0.5 + ctx.h01(corner, 701),
      });
    }
    return found.sort((a, b) => b.s - a.s).map((f) => f.p);
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(placementSeed(seed, p, 23533));
    const body = new MeshKit(rng);
    const windowGlow = new MeshKit(rng);
    const doorKit = new MeshKit(rng);
    const lampKit = new MeshKit(rng);
    const lampGlow = new MeshKit(rng);
    const [wall, trim] = PAINTS[Math.floor(rng.next() * PAINTS.length)];
    const planks = [wall, shadeColor(wall, 0.03), shadeColor(wall, -0.03)];
    const halfW = WIDTH / 2;
    const halfD = DEPTH / 2;
    for (const e of [-1, 1])
      for (const t of [-1, 1])
        body.box(0.13, 0.09, 0.13, e * 0.42000000000000004, 0.045, t * 0.32, shadeColor(PALETTE.stone, (rng.next() - 0.5) * 0.08), {
          bevel: 0.02,
          grad: 0.3,
        });
    body.box(WIDTH, 0.04, DEPTH, 0, 0.07, 0, PALETTE.woodDark, { ao: false });
    const doorL = -0.36;
    const winL = 0.1;
    const winR = 0.36;
    {
      const count = Math.round(WIDTH / 0.12);
      const pw = WIDTH / count;
      for (let i = 0; i < count; i++) {
        const x = -0.46 + pw * (i + 0.5);
        const color = planks[i % 3];
        const opts = { bevel: 0.008, grad: 0.22, jitter: 0.06 };
        if (x > doorL && x < -0.07) body.box(0.10700000000000001, 0.12, 0.04, x, 0.72, 0.33999999999999997, color, opts);
        else if (x > winL && x < winR) {
          body.box(0.10700000000000001, 0.24, 0.04, x, 0.4 / 2, 0.33999999999999997, color, opts);
          body.box(0.10700000000000001, 0.21999999999999986, 0.04, x, 1.3399999999999999 / 2, 0.33999999999999997, color, opts);
        } else {
          const h = WALL_H + (rng.next() - 0.5) * 0.015;
          body.box(0.10700000000000001, h, 0.04, x, FLOOR_Y + h / 2, 0.33999999999999997, color, opts);
        }
      }
    }
    plankWall(body, rng, { w: WIDTH, h: WALL_H, x: 0, y: FLOOR_Y, z: -0.36 + 0.02, rotY: 0, colors: planks });
    for (const e of [-1, 1])
      plankWall(body, rng, { w: 0.6599999999999999, h: WALL_H, x: e * 0.44, y: FLOOR_Y, z: 0, rotY: Math.PI / 2, colors: planks });
    for (const e of [-1, 1])
      for (const t of [-1, 1]) body.box(0.05, 0.72, 0.05, e * halfW, 0.43, t * halfD, TRIM, { ao: false, bevel: 0.012, grad: 0.1 });
    for (const e of [-1, 1]) gable(body, halfD, 0.7699999999999999, 1.09, e * 0.44, 0, 0.04, wall);
    for (const e of [-1, 1]) {
      body.cyl(0.055, 0.055, 0.02, 10, e * 0.465, 0.9199999999999999, 0, TRIM, { rot: [0, 0, Math.PI / 2], ao: false });
      body.cyl(0.035, 0.035, 0.024, 10, e * 0.466, 0.9199999999999999, 0, `#4a3b36`, {
        rot: [0, 0, Math.PI / 2],
        ao: false,
      });
    }
    tiledRoof(body, rng, {
      L: 1.1400000000000001,
      d: 0.49,
      eaveY: 0.7399999999999999,
      ridgeY: RIDGE_Y,
      rows: 4,
      tile: 0.13,
      colors: [`#c07a5a`, `#b5654a`, `#cf8a64`, `#b8705a`],
      cap: `#8d4f3c`,
    });
    const doorZ = 0.365;
    const doorX = -0.43 / 2;
    const doorW = 0.29;
    for (let i = 0; i < 3; i++)
      doorKit.box(doorW / 3 - 0.006, 0.5, 0.03, doorL + (doorW / 3) * (i + 0.5), 0.33, doorZ, shadeColor(trim, (i - 1) * 0.03), {
        bevel: 0.006,
        grad: 0.15,
        ao: false,
      });
    doorKit.box(0.26999999999999996, 0.04, 0.035, doorX, 0.16999999999999998, 0.377, shadeColor(trim, -0.08), { ao: false });
    doorKit.box(0.26999999999999996, 0.04, 0.035, doorX, 0.5, 0.377, shadeColor(trim, -0.08), { ao: false });
    doorKit.beam(vec3(-0.32999999999999996, 0.18, 0.379), vec3(-0.1, 0.49, 0.379), 0.03, 0.035, shadeColor(trim, -0.08), { ao: false });
    doorKit.blob(0.018, -0.12000000000000001, 0.35000000000000003, 0.395, `#d9b35c`, { detail: 0, ao: false });
    body.box(0.35, 0.035, 0.04, doorX, 0.64, halfD, TRIM, { ao: false });
    for (const x of [-0.372, -0.05800000000000001]) body.box(0.03, 0.54, 0.04, x, 0.35000000000000003, halfD, TRIM, { ao: false });
    const winX = 0.45999999999999996 / 2;
    const winY = 0.8800000000000001 / 2;
    const winW = 0.26;
    const winH = 0.24000000000000005;
    windowGlow.box(0.25, 0.23000000000000004, 0.01, winX, winY, 0.348, PALETTE.lanternGlow);
    for (const [w, h, x, y] of [
      [0.3, 0.035, winX, 0.56],
      [0.32, 0.035, winX, 0.32],
      [0.035, winH, winL, winY],
      [0.035, winH, winR, winY],
      [0.022, winH, winX, winY],
      [winW, 0.022, winX, winY],
    ])
      body.box(w, h, 0.035, x, y, halfD, TRIM, { ao: false, grad: 0 });
    body.box(0.3, 0.07, 0.08, winX, 0.26, 0.41, PALETTE.wood, { ao: false, bevel: 0.01 });
    body.box(winW, 0.02, 0.06, winX, 0.295, 0.41, POT_SOIL, { ao: false, grad: 0 });
    flowerTuft(body, rng, winX, 0.28500000000000003, 0.41, 0.1, 9, [PALETTE.poppy, PALETTE.tulipPink, PALETTE.daisy, PALETTE.sunflower]);
    const lampX = -0.43;
    body.box(0.02, 0.02, 0.09, lampX, 0.6799999999999999, 0.40499999999999997, PALETTE.woodDark, { ao: false });
    lampKit.cone(0.045, 0.04, 6, lampX, 0.6399999999999999, 0.44999999999999996, `#4f5a55`, { ao: false });
    lampKit.cyl(0.035, 0.03, 0.012, 6, lampX, 0.5599999999999999, 0.44999999999999996, `#4f5a55`, { ao: false });
    lampGlow.cyl(0.03, 0.03, 0.07, 6, lampX, 0.57, 0.44999999999999996, PALETTE.lanternGlow);
    body.box(0.42, 0.03, 0.14, -0.2, 0.44, -0.25, PALETTE.woodLight, { ao: false, bevel: 0.008 });
    for (const e of [-1, 1]) body.box(0.03, 0.34, 0.03, -0.2 + e * 0.19, 0.27, -0.25, PALETTE.wood, { ao: false });
    for (let i = 0; i < 3; i++) {
      const soil = flowerPot(body, 0.04, -0.34 + i * 0.14, 0.455, -0.25, i === 1 ? `#b9c9c2` : TERRACOTTA);
      if (i !== 1) sprout(body, rng, -0.34 + i * 0.14, soil, -0.25, 0.1, PALETTE.leafLight);
    }
    body.blob(0.1, -0.29, 0.18, -0.02, `#cdb88f`, { scale: [1, 1.15, 0.9], ao: false });
    body.blob(0.04, -0.29, 0.32, -0.02, `#b89f72`, { detail: 0, ao: false });
    body.box(0.17, 0.13, 0.17, -0.11, 0.155, -0.07, PALETTE.wood, { ao: false, bevel: 0.015, rot: [0, 0.4, 0] });
    body.box(0.15, 0.03, 0.03, -0.11, 0.22999999999999998, -0.07, PALETTE.woodDark, { ao: false, rot: [0, 0.4, 0] });
    body.box(0.34, 0.06, 0.16, doorX, 0.03, 0.45999999999999996, PALETTE.stone, { bevel: 0.02, grad: 0.25 });
    wateringCan(body, -0.52, 0, 0.48, 2.2);
    for (let i = 0; i < 3; i++)
      body.lathe(
        [
          [0.001, 0.1],
          [0.07, 0.1],
          [0.056, 0],
          [0.001, 0],
        ],
        8,
        0.6000000000000001 + i * 0.006,
        i * 0.045,
        0.3,
        shadeColor(TERRACOTTA, i * 0.03),
        { grad: 0.2 },
      );
    sprout(body, rng, 0.6200000000000001, flowerPot(body, 0.055, 0.6200000000000001, 0, 0.47, TERRACOTTA), 0.47, 0.16, PALETTE.leafLight);
    const barrowX = -0.66;
    body.cyl(0.085, 0.085, 0.04, 12, -0.68, 0.085, 0.33999999999999997, `#4f4a45`, {
      rot: [0, 0, Math.PI / 2],
      ao: false,
    });
    body.cyl(0.03, 0.03, 0.05, 8, -0.685, 0.085, 0.33999999999999997, `#8f877d`, { rot: [0, 0, Math.PI / 2], ao: false });
    body.box(0.24, 0.13, 0.32, barrowX, 0.22, 0.02, `#6fa35a`, { rot: [0.12, 0, 0], bevel: 0.03, grad: 0.3 });
    body.box(0.2, 0.03, 0.27, barrowX, 0.28, 0.02, POT_SOIL, { rot: [0.12, 0, 0], ao: false, grad: 0 });
    sprout(body, rng, barrowX, 0.28, 0, 0.14, PALETTE.leafYoung);
    for (const e of [-1, 1]) {
      body.beam(vec3(barrowX + e * 0.09, 0.15, 0.32), vec3(barrowX + e * 0.1, 0.26, -0.36 + 0.02), 0.03, 0.03, PALETTE.wood, { ao: false });
      body.beam(vec3(barrowX + e * 0.1, 0.18, -0.14), vec3(barrowX + e * 0.1, 0, -0.16), 0.03, 0.03, PALETTE.wood, { ao: false });
    }
    body.beam(vec3(0.53, 0.05, -0.12), vec3(0.49, 0.66, -0.02), 0.028, 0.028, PALETTE.woodLight, { ao: false });
    body.box(0.1, 0.03, 0.02, 0.49, 0.68, -0.02, PALETTE.woodLight, { rot: [0, Math.PI / 2, 0], ao: false });
    body.box(0.1, 0.13, 0.015, 0.535, 0.08, -0.13, `#a9b4b8`, { rot: [0.16, Math.PI / 2, 0], bevel: 0.005, ao: false });
    const root = landmarkMesh(body.build(), mats.base);
    root.add(landmarkMesh(windowGlow.build(), mats.glow, false));
    const door = pivotMesh(doorKit, mats.base, doorL, 0, doorZ);
    const lamp = pivotMesh(lampKit, mats.base, lampX, 0.6799999999999999, 0.44999999999999996, false);
    const bulb = landmarkMesh(lampGlow.build(), mats.glow, false);
    bulb.position.set(0.43, -0.6799999999999999, -0.44999999999999996);
    lamp.add(bulb);
    root.add(door, lamp);
    const doorSwing = new Spring(26, 3.4);
    const squash = new Spring(160, 7);
    const rock = new Spring(90, 5);
    const lampSwingZ = new Spring(34, 2.4);
    const lampSwingX = new Spring(34, 2.4);
    const dust = new SparkPoints(56, false);
    const sparks = new SparkPoints(24, true);
    const windowHalo = glowSprite(3.2, 2.1, 1.1);
    const doorHalo = glowSprite(3, 2, 1);
    const lampHalo = glowSprite(3.2, 2.1, 1.1);
    windowHalo.position.set(winX, winY, 0.41);
    doorHalo.position.set(doorX, 0.36000000000000004, 0.24);
    lampHalo.position.set(lampX, 0.57, 0.48);
    root.add(dust.points, sparks.points, windowHalo, doorHalo, lampHalo);
    let doorHold = 0;
    let flashT = 1 / 0;
    let active = 0;
    let slams = 0;
    const pokeDir = { x: 0, z: 0 };
    const emitDust = (count: number, speed: number): void => {
      for (let i = 0; i < count; i++) {
        const c = DUST_RGB[Math.floor(Math.random() * DUST_RGB.length)];
        const a = Math.random() * Math.PI * 2;
        dust.emit(
          doorX + (Math.random() - 0.5) * 0.3,
          0.12,
          0.52 + Math.random() * 0.1,
          Math.cos(a) * speed,
          0.1 + Math.random() * 0.14,
          Math.abs(Math.sin(a)) * speed * 0.9,
          0.9 + Math.random() * 0.7,
          0.1 + Math.random() * 0.08,
          c[0] * nightDim,
          c[1] * nightDim,
          c[2] * nightDim,
          { a: 0.55, drag: 2.2, grow: 2.4, gravity: -0.05 },
        );
      }
    };
    let nightDim = 1;
    return {
      object: root,
      update(ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const dt = ctx.dt;
        const dim = 1 - 0.5 * ctx.night;
        dust.update(dt);
        sparks.update(dt);
        if (!active) return;
        flashT += dt;
        if (doorHold > 0) doorHold -= dt;
        else doorSwing.target = 0;
        doorSwing.update(dt);
        if (doorSwing.x < 0) {
          const slam = -doorSwing.v;
          doorSwing.x = 0;
          doorSwing.v = Math.abs(doorSwing.v) * 0.3;
          if (slam > 0.9) {
            kick(squash, Math.min(2.2, slam * 0.8), 4);
            kick(rock, (Math.random() - 0.5) * 1.6, 3);
            emitDust(slam > 2 ? 9 : 5, 0.22);
            kick(lampSwingZ, (Math.random() < 0.5 ? -1 : 1) * Math.min(2.5, slam * 0.8), 4);
            slams++;
          }
        }
        door.rotation.y = -doorSwing.x;
        const sq = squash.update(dt);
        root.scale.set(1 - sq * 0.012, 1 + sq * 0.03, 1 - sq * 0.012);
        root.rotation.z = rock.update(dt) * 0.03;
        lamp.rotation.z = lampSwingZ.update(dt);
        lamp.rotation.x = lampSwingX.update(dt);
        const glow = envelope(flashT, 0.07, 0.4);
        setGlowSprite(windowHalo, 0.45 + glow * 0.4, glow * dim);
        setGlowSprite(lampHalo, 0.34 + glow * 0.25, glow * 0.8 * dim);
        const doorLight = Math.min(1, doorSwing.x / 0.6) * 0.16;
        setGlowSprite(doorHalo, 0.55, doorLight * dim);
        if (glow > 0.15 && Math.random() < dt * 8 * glow)
          sparks.emit(
            winX + (Math.random() - 0.5) * 0.2,
            winY + (Math.random() - 0.4) * 0.12,
            0.42,
            (Math.random() - 0.5) * 0.1,
            0.14 + Math.random() * 0.14,
            0.05,
            0.9 + Math.random() * 0.5,
            0.05 + Math.random() * 0.03,
            SPARK_RGB[0] * 2,
            SPARK_RGB[1] * 2,
            SPARK_RGB[2] * 2,
            { drag: 1, twinkle: 0.5 },
          );
        if (
          doorSwing.target === 0 &&
          doorSwing.settled &&
          squash.settled &&
          rock.settled &&
          lampSwingZ.settled &&
          lampSwingX.settled &&
          glow < 0.02
        ) {
          active = 0;
          doorSwing.set(0);
          door.rotation.y = 0;
          root.scale.set(1, 1, 1);
          root.rotation.z = 0;
          lamp.rotation.set(0, 0, 0);
          lampSwingZ.set(0);
          lampSwingX.set(0);
          setGlowSprite(doorHalo, 0.55, 0 * dim);
        }
      },
      poke(poke, ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const n = Math.min(poke.count, 4);
        pokeDirLocal(poke, p.rotY ?? 0, pokeDir);
        flashT = 0;
        kick(lampSwingZ, (Math.random() < 0.5 ? -1 : 1) * (1.6 + n * 0.5), 4);
        kick(lampSwingX, (Math.random() - 0.5) * 2, 3);
        kick(squash, 0.5 + n * 0.25, 3);
        kick(rock, -pokeDir.x * 0.6, 2);
        const isOpen = doorSwing.x > 0.35 && doorSwing.target > 0;
        doorSwing.target = n >= 3 ? 1.5 : 1.25;
        doorHold = 1.6 + n * 0.4;
        if (isOpen) {
          kick(doorSwing, -2 - n * 0.6, 6);
          emitDust(3 + n * 2, 0.2);
        } else {
          kick(doorSwing, 0.7 + n * 0.25, 5);
          emitDust(4 + n * 2, 0.16);
        }
        if (n >= 2)
          for (let i = 0; i < 5 + n * 5; i++) {
            const c = PETAL_RGB[Math.floor(Math.random() * PETAL_RGB.length)];
            dust.emit(
              winX + (Math.random() - 0.5) * 0.24,
              0.3,
              0.44,
              (Math.random() - 0.5) * 0.3,
              0.3 + Math.random() * 0.35,
              0.1 + Math.random() * 0.25,
              1.4 + Math.random() * 0.9,
              0.06 + Math.random() * 0.04,
              c[0] * nightDim,
              c[1] * nightDim,
              c[2] * nightDim,
              { gravity: 0.5, drag: 1 },
            );
          }
        if (n >= 3)
          for (let i = 0; i < 12; i++)
            sparks.emit(
              doorX + (Math.random() - 0.5) * 0.25,
              0.38 + Math.random() * 0.25,
              0.45999999999999996,
              (Math.random() - 0.5) * 0.25,
              0.25 + Math.random() * 0.3,
              0.2 + Math.random() * 0.2,
              1 + Math.random() * 0.6,
              0.06 + Math.random() * 0.04,
              SPARK_RGB[0] * 2,
              SPARK_RGB[1] * 2,
              SPARK_RGB[2] * 2,
              { drag: 1.2, twinkle: 0.6 },
            );
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        dust.dispose();
        sparks.dispose();
        disposeSprite(windowHalo);
        disposeSprite(doorHalo);
        disposeSprite(lampHalo);
      },
    };
  },
};
