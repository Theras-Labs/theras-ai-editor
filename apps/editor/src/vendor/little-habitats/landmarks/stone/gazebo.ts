// Ports index-BwioI7A7.js 31890-32263: the gazebo landmark (og) and its colours ng..ag.
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashString } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { BASE_YAW, KitFrame, TAU, groundGlow } from './shared';

const CREAM = `#efe4cf`; // ng (31890)
const ROOF_COLORS = [`#68a893`, `#6a96bf`, `#cf8068`]; // rg (31891)
const GOLD = `#d8b45a`; // ig (31892)
const IRON = `#4f4a52`; // ag (31893)

export const GAZEBO: LandmarkDef = { // og (31894)
  id: `gazebo`,
  name: `Gazebo`,
  icon: `🏛️`,
  tint: `#d7ead9`,
  blurb: `A breezy little pavilion on a stone terrace — the perfect spot for tea and a view.`,
  hint: `Raise a broad, flat terrace of stone at least two levels high, and something may settle on top.`,
  priority: 40,
  max: 2,
  detect(ctx) {
    const found: (LandmarkPlacement & { score: number })[] = [];
    for (const c of ctx.corners) {
      if (ctx.mat(c) !== `stone`) continue;
      const h = ctx.h(c);
      if (h < 2) continue;
      const nbrs = ctx.nbrs(c);
      if (nbrs.length < 3 || !nbrs.every((n) => !ctx.rim(n) && ctx.mat(n) === `stone` && ctx.h(n) === h)) continue;
      let ring = 0;
      for (const n of nbrs) for (const m of ctx.nbrs(n)) if (m !== c && ctx.mat(m) === `stone` && ctx.h(m) === h) ring++;
      const top = ctx.top(c);
      const y = ctx.flat(top.x, top.z, 0.72, 0.09);
      if (y !== null)
        found.push({
          key: `gazebo:${c}`,
          x: top.x,
          y,
          z: top.z,
          rotY: BASE_YAW,
          radius: 0.8,
          clear: 0.9,
          score: ring + ctx.h01(c, 4502) * 0.5,
        });
    }
    found.sort((a, b) => b.score - a.score);
    return found;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(seed ^ hashString(p.key));
    const kit = new MeshKit(rng);
    const f = new KitFrame(kit);
    const roofColor = rng.pick(ROOF_COLORS);
    const trim = shadeColor(roofColor, -0.1);
    const stone = PALETTE.stoneLight;
    const oct = Math.PI / 8;
    // Octagonal plinth, floor inlay and front step.
    f.cyl(0.8, 0.86, 0.1, 8, 0, -0.02, 0, shadeColor(stone, -0.04), { yaw: oct, grad: 0.35 });
    f.cyl(0.73, 0.73, 0.03, 8, 0, 0.07, 0, `#e6dccb`, { yaw: oct, grad: 0, ao: !1 });
    f.ring(0.42, 0.018, 3, 8, 0, 0.1, 0, `#cbbba2`, { yaw: oct, grad: 0, ao: !1 });
    f.cyl(0.1, 0.1, 0.02, 8, 0, 0.09, 0, `#cbbba2`, { yaw: oct, grad: 0, ao: !1 });
    f.box(0.44, 0.06, 0.18, 0, 0.03, 0.86, shadeColor(stone, -0.02), { bevel: 0.02 });
    const postR = 0.66;
    const beamY = 1.12;
    const angleOf = (k: number) => (TAU / 8) * k + oct;
    const px = (k: number, r = postR) => Math.sin(angleOf(k)) * r;
    const pz = (k: number, r = postR) => Math.cos(angleOf(k)) * r;
    // Eight columns with base and capital.
    for (let k = 0; k < 8; k++) {
      const x = px(k);
      const z = pz(k);
      f.box(0.11, 0.06, 0.11, x, 0.12, z, CREAM, { yaw: angleOf(k), bevel: 0.015 });
      f.cyl(0.036, 0.044, 1, 8, x, 0.12, z, CREAM, { grad: 0.12 });
      f.box(0.1, 0.05, 0.1, x, 1.1, z, CREAM, { yaw: angleOf(k), bevel: 0.012 });
    }
    // Top beams with corner braces.
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      f.tube(px(k), beamY, pz(k), px(n), beamY, pz(n), 0.03, 0.03, 5, CREAM, { ao: !1 });
      const mx = (px(k) + px(n)) / 2;
      const mz = (pz(k) + pz(n)) / 2;
      for (const [j, t] of [
        [k, 0.62],
        [n, 0.62],
      ]) {
        const bx = px(j) + (mx - px(j)) * t;
        const bz = pz(j) + (mz - pz(j)) * t;
        f.tube(px(j), 0.9200000000000002, pz(j), bx, 1.11, bz, 0.013, 0.013, 4, CREAM, { ao: !1 });
      }
    }
    // Balustrade on seven sides (the front stays open) and benches on five.
    const bench = PALETTE.woodLight;
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      if (k !== 7) {
        f.tube(px(k), 0.46, pz(k), px(n), 0.46, pz(n), 0.024, 0.024, 5, CREAM, { ao: !1 });
        f.tube(px(k), 0.17, pz(k), px(n), 0.17, pz(n), 0.018, 0.018, 5, CREAM, { ao: !1 });
        for (let b = 1; b <= 3; b++) {
          const t = b / 4;
          const bx = px(k) + (px(n) - px(k)) * t;
          const bz = pz(k) + (pz(n) - pz(k)) * t;
          f.lathe(
            [
              [0.001, 0],
              [0.018, 0],
              [0.024, 0.07],
              [0.014, 0.15],
              [0.02, 0.24],
              [0.001, 0.28],
            ],
            6,
            bx,
            0.17,
            bz,
            CREAM,
            { grad: 0.1, ao: !1 },
          );
        }
        if (k >= 1 && k <= 5) {
          const bx = (px(k, 0.53) + px(n, 0.53)) / 2;
          const bz = (pz(k, 0.53) + pz(n, 0.53)) / 2;
          const yaw = (angleOf(k) + angleOf(n)) / 2 + Math.PI / 2;
          const len = Math.hypot(px(n, 0.53) - px(k, 0.53), pz(n, 0.53) - pz(k, 0.53));
          f.box(len * 0.98, 0.035, 0.15, bx, 0.3, bz, shadeColor(bench, rng.range(-0.04, 0.03)), {
            yaw,
            bevel: 0.012,
            grad: 0.1,
          });
          f.box(0.05, 0.2, 0.1, bx, 0.19, bz, PALETTE.wood, { yaw, bevel: 0.01 });
        }
      }
    }
    // Roof: ceiling disc, octagonal lathe dome, trim rings, ribs and a finial base.
    const roofY = 1.1400000000000001;
    f.cyl(0.9, 0.9, 0.035, 8, 0, 1.1300000000000001, 0, shadeColor(PALETTE.wood, 0.05), { yaw: oct, grad: 0, ao: !1 });
    const roofProfile = [
      [0.98, 0],
      [0.86, 0.07],
      [0.68, 0.17],
      [0.5, 0.3],
      [0.33, 0.45],
      [0.18, 0.6],
      [0.001, 0.72],
    ];
    f.lathe(roofProfile, 8, 0, roofY, 0, roofColor, { phi: oct, grad: 0.2, ao: !1, jitter: 0.03 });
    /** Roof radius at height y above the roof base. */
    const roofRadius = (y: number) => {
      for (let k = 0; k < roofProfile.length - 1; k++) {
        const [r0, y0] = roofProfile[k];
        const [r1, y1] = roofProfile[k + 1];
        if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      return 0.001;
    };
    for (const y of [0.035, 0.12, 0.235, 0.37, 0.52])
      f.ring(roofRadius(y) + 0.008, 0.017, 3, 8, 0, roofY + y, 0, trim, { yaw: -oct + Math.PI / 2, grad: 0, ao: !1 });
    for (let k = 0; k < 8; k++) {
      const a = angleOf(k);
      for (let j = 0; j < roofProfile.length - 2; j++) {
        const [r0, y0] = roofProfile[j];
        const [r1, y1] = roofProfile[j + 1];
        f.tube(
          Math.sin(a) * (r0 + 0.006),
          roofY + y0 + 0.012,
          Math.cos(a) * (r0 + 0.006),
          Math.sin(a) * (r1 + 0.006),
          roofY + y1 + 0.012,
          Math.cos(a) * (r1 + 0.006),
          0.019,
          0.017,
          5,
          trim,
          { ao: !1, grad: 0 },
        );
      }
    }
    f.cyl(0.07, 0.1, 0.06, 8, 0, 1.8000000000000003, 0, trim, { ao: !1 });
    // Climbing roses up two columns.
    for (const k of [rng.int(1, 2), rng.int(5, 6)]) {
      const cx = px(k);
      const cz = pz(k);
      for (let j = 0; j < 9; j++) {
        const y = 0.16 + j * 0.105;
        const a = j * 1.9 + rng.next();
        const x = cx + Math.sin(a) * 0.055;
        const z = cz + Math.cos(a) * 0.055;
        f.blob(0.05 + rng.next() * 0.02, x, y, z, j % 3 == 2 ? PALETTE.leafLight : PALETTE.leaf, { detail: 0, grad: 0.1, ao: !1 });
        if (j % 2 == 1)
          f.blob(
            0.03,
            x + Math.sin(a) * 0.04,
            y + 0.02,
            z + Math.cos(a) * 0.04,
            rng.chance(0.5) ? PALETTE.blossom : PALETTE.rose,
            { detail: 0, grad: 0, ao: !1 },
          );
      }
    }
    // Two potted shrubs by the step.
    for (const side of [-1, 1]) {
      const x = side * 0.36;
      const z = 0.9;
      f.lathe(
        [
          [0.001, 0],
          [0.07, 0],
          [0.095, 0.14],
          [0.105, 0.16],
          [0.09, 0.17],
          [0.001, 0.15],
        ],
        8,
        x,
        0,
        z,
        `#c9774f`,
        { grad: 0.3 },
      );
      f.blob(0.12, x, 0.26, z, PALETTE.leafDark, { detail: 1, grad: 0.3 });
      f.blob(0.03, x + 0.05, 0.33, 0.96, PALETTE.daisy, { detail: 0, grad: 0 });
      f.blob(0.03, x - 0.06, 0.3, 0.9400000000000001, PALETTE.daisy, { detail: 0, grad: 0 });
    }
    const root = new THREE.Group(); // y
    root.add(landmarkMesh(kit.build(), mats.base));
    const finialKit = new MeshKit(rng);
    finialKit.cyl(0.018, 0.026, 0.2, 6, 0, 0, 0, GOLD, { ao: !1, grad: 0.1 });
    finialKit.blob(0.06, 0, 0.16, 0, GOLD, { ao: !1, detail: 1, grad: 0.05 });
    finialKit.cone(0.025, 0.12, 6, 0, 0.2, 0, GOLD, { ao: !1 });
    const finial = landmarkMesh(finialKit.build(), mats.base, !1); // x
    finial.position.set(0, 1.84, 0);
    root.add(finial);
    const ballKit = new MeshKit(rng);
    for (let k = 0; k < 8; k++) ballKit.blob(0.04, Math.sin(angleOf(k)), 0, Math.cos(angleOf(k)), GOLD, { detail: 0, ao: !1 });
    const balls = landmarkMesh(ballKit.build(), mats.base, !1); // C
    balls.position.set(0, 1.1800000000000002, 0);
    root.add(balls);
    // Hanging lantern.
    const lanternKit = new MeshKit(rng);
    const lf = new KitFrame(lanternKit);
    lf.cyl(0.008, 0.008, 0.1, 4, 0, -0.1, 0, IRON, { ao: !1 });
    lf.cone(0.085, 0.07, 6, 0, -0.17, 0, IRON, { ao: !1, grad: 0 });
    lf.cyl(0.07, 0.07, 0.015, 6, 0, -0.18, 0, IRON, { ao: !1 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      lf.box(0.014, 0.13, 0.014, Math.sin(a) * 0.058, -0.25, Math.cos(a) * 0.058, IRON, { ao: !1, bevel: 0.003 });
    }
    lf.cyl(0.066, 0.06, 0.02, 6, 0, -0.33, 0, IRON, { ao: !1 });
    lf.blob(0.016, 0, -0.35, 0, IRON, { ao: !1, detail: 0 });
    const lantern = new THREE.Group(); // D
    lantern.position.set(0, 1.12, 0.7);
    lantern.scale.setScalar(1.15);
    lantern.add(landmarkMesh(lanternKit.build(), mats.base, !1));
    const flameKit = new MeshKit(rng);
    flameKit.cyl(0.05, 0.05, 0.12, 6, 0, -0.31, 0, PALETTE.lanternGlow, { ao: !1, grad: 0, jitter: 0 });
    const flame = landmarkMesh(flameKit.build(), mats.glow, !1); // k
    lantern.add(flame);
    root.add(lantern);
    const halo = glowSprite(3, 2.1, 0.9); // A
    halo.position.set(0, -0.32, 0);
    lantern.add(halo);
    const floorGlow = groundGlow(1.25, PALETTE.lanternGlow, 0.11); // j
    floorGlow.position.z = 0.25;
    root.add(floorGlow);
    const swingX = new Spring(20, 1.7); // M
    const swingZ = new Spring(20, 1.7); // N
    const finialHop = new Spring(120, 9); // P
    const finialSquash = new Spring(160, 8); // F
    const finialSpin = new Spring(34, 10.5); // I
    const ballPop = new Spring(150, 5); // L
    const sparks = new SparkPoints(80, !0); // R
    const petals = new SparkPoints(40, !1); // ee
    root.add(sparks.points, petals.points);
    let flash = 0; // z
    let ringTime = 1 / 0; // te: time since the ball ripple started, Infinity when idle
    let ringIndex = 0; // ne
    let ringRepeats = 0; // re
    const rotY = p.rotY ?? 0; // B
    const cosY = Math.cos(rotY); // ie
    const sinY = Math.sin(rotY); // ae
    const ballX = new Float32Array(8); // V
    const ballZ = new Float32Array(8); // oe
    for (let k = 0; k < 8; k++) {
      ballX[k] = Math.sin(angleOf(k));
      ballZ[k] = Math.cos(angleOf(k));
    }
    const phase = rng.next() * TAU; // se
    let dusk = 0; // ce
    return {
      object: root,
      update(ctx) {
        const time = ctx.realTime;
        const dt = Math.min(ctx.dt, 0.05);
        const breeze = 0.3 + ctx.wind * 0.7;
        lantern.rotation.x =
          Math.sin(time * 1.3 + phase) * 0.07 * breeze + Math.sin(time * 2.9 + phase) * 0.015 + swingX.update(dt);
        lantern.rotation.z = Math.sin(time * 1.05 + phase * 1.7) * 0.06 * breeze + swingZ.update(dt);
        const hop = Math.max(0, finialHop.update(dt));
        const squash = finialSquash.update(dt);
        finial.position.y = 1.84 + hop;
        finial.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
        finial.rotation.y = finialSpin.update(dt);
        const pop = ballPop.update(dt);
        balls.scale.set(1 + pop * 0.5, 1 + pop * 1.5, 1 + pop * 0.5);
        balls.position.y = 1.1800000000000002 + Math.max(0, pop) * 0.05;
        flash *= Math.exp(-dt / 0.4);
        setGlowSprite(halo, 0.45 + flash * 0.5, flash);
        if (ringTime !== 1 / 0) {
          for (ringTime += dt; ringIndex < 8 && ringTime >= ringIndex * 0.055; ) {
            const k = ringIndex++;
            const bx = ballX[k];
            const bz = ballZ[k];
            for (let j = 0; j < 3; j++)
              sparks.emit(
                bx,
                1.2000000000000002,
                bz,
                bx * 0.12 + (sparks.rnd() - 0.5) * 0.25,
                0.25 + sparks.rnd() * 0.35,
                bz * 0.12 + (sparks.rnd() - 0.5) * 0.25,
                0.8 + sparks.rnd() * 0.5,
                0.06 + sparks.rnd() * 0.04,
                2.3,
                1.8,
                0.7,
                { gravity: 0.25, drag: 1.2, twinkle: 0.5 },
              );
          }
          if (ringIndex >= 8) {
            if (ringRepeats > 1) {
              ringRepeats--;
              ringTime = 0;
              ringIndex = 0;
            } else ringTime = 1 / 0;
          }
        }
        sparks.update(dt);
        petals.update(dt);
        dusk = damp(dusk, Math.max(0, (ctx.night - 0.3) / 0.6), 2, ctx.dt);
        floorGlow.visible = dusk > 0.01;
        floorGlow.material.opacity = Math.min(1, dusk) * 0.55 * (0.94 + 0.06 * Math.sin(time * 5.3 + phase));
      },
      poke(poke) {
        const count = Math.min(3, Math.max(1, poke.count));
        let dx = poke.point.x - poke.from.x;
        let dz = poke.point.z - poke.from.z;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        // The poke direction in the gazebo's local frame.
        const lx = dx * cosY - dz * sinY;
        const lz = dx * sinY + dz * cosY;
        const push = 1.7 + 0.5 * count;
        swingZ.kick(lx * push + (Math.abs(lx) < 0.2 ? push * 0.4 : 0));
        swingX.kick(-lz * push);
        swingX.v = Math.max(-4.5, Math.min(4.5, swingX.v));
        swingZ.v = Math.max(-4.5, Math.min(4.5, swingZ.v));
        finialHop.kick(1.1 + 0.3 * count);
        finialSquash.kick(-2 - 0.4 * count);
        if (Math.abs(finialSpin.x) < TAU * 2.5) finialSpin.x += TAU * (count === 3 ? 2 : 1);
        ballPop.kick(1.6 + 0.6 * count);
        flash = Math.min(2, flash + 0.9 + 0.3 * count);
        ringTime = 0;
        ringIndex = 0;
        ringRepeats = count === 3 ? 2 : 1;
        const n = count === 1 ? 8 : count === 2 ? 14 : 26;
        for (let k = 0; k < n; k++) {
          const a = sparks.rnd() * TAU;
          const v = 0.25 + sparks.rnd() * 0.45;
          sparks.emit(
            0,
            2.04 + sparks.rnd() * 0.1,
            0,
            Math.sin(a) * v,
            0.5 + sparks.rnd() * 0.6,
            Math.cos(a) * v,
            0.9 + sparks.rnd() * 0.7,
            0.05 + sparks.rnd() * 0.05,
            2.4,
            1.9,
            0.7,
            { gravity: 0.9, drag: 0.8, twinkle: 0.5 },
          );
        }
        {
          const m = count === 1 ? 4 : count === 2 ? 9 : 18;
          for (let k = 0; k < m; k++) {
            const a = petals.rnd() * TAU;
            const r = 0.55 + petals.rnd() * 0.35;
            const y = 1.34 + petals.rnd() * 0.2;
            const tint = petals.rnd();
            petals.emit(
              Math.sin(a) * r,
              y,
              Math.cos(a) * r,
              Math.sin(a) * 0.08,
              0.05 + petals.rnd() * 0.1,
              Math.cos(a) * 0.08,
              1.8 + petals.rnd() * 1,
              0.045 + petals.rnd() * 0.03,
              tint < 0.5 ? 0.95 : tint < 0.8 ? 0.98 : 0.9,
              tint < 0.5 ? 0.62 : tint < 0.8 ? 0.78 : 0.85,
              tint < 0.5 ? 0.72 : tint < 0.8 ? 0.82 : 0.6,
              { gravity: 0.35, drag: 1.1, grow: 0.8 },
            );
          }
        }
        return !0;
      },
      dispose() {
        for (const obj of [root.children[0], finial, balls, lantern.children[0], flame]) (obj as THREE.Mesh).geometry.dispose();
        disposeSprite(halo);
        sparks.dispose();
        petals.dispose();
        floorGlow.material.dispose();
      },
    };
  },
};
