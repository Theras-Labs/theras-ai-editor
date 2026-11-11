// Ports index-BwioI7A7.js 27374-27803: the glasshouse (bp) and its constants (up..yp).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, envelope, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import {
  POT_SOIL,
  TERRACOTTA,
  atan2,
  flowerPot,
  flowerTuft,
  gardenMaterials,
  kick,
  pivotMesh,
  placementSeed,
  pokeDirLocal,
  rgb,
  sprout,
  vec3,
} from './shared';

const LENGTH = 1.22; // up (27374)
const DEPTH = 0.86; // dp (27375)
const WALL_H = 0.15; // fp (27376)
const EAVE_Y = 0.66; // pp (27377)
const RIDGE_Y = 1.02; // mp (27378)
const WHITE_FRAME = `#f5f0e6`; // hp (27379)
const VENT_HALF = LENGTH / 2 / 3 - 0.02; // gp (27380)
const POLLEN_RGB = rgb(PALETTE.pollen); // _p (27381)
const PETAL_RGB = [PALETTE.blossom, PALETTE.blossomLight, PALETTE.daisy, PALETTE.tulipPink].map(rgb); // vp (27382)
const pokeDir = { x: 0, z: 0 }; // yp (27383)

interface Vent {
  sz: number;
  grp: THREE.Group;
  open: Spring;
  hold: number;
}

export const GREENHOUSE: LandmarkDef = { // bp (27384)
  id: `greenhouse`,
  name: `Glasshouse`,
  icon: `🪴`,
  tint: `#d4ecdf`,
  blurb: `A snug glasshouse where seedlings sleep warm. After dark it glows like a lantern.`,
  hint: `Seedlings need somewhere warm. What if you sowed seeds on a low stone patch?`,
  priority: 42,
  max: 2,
  detect(ctx) {
    const found: { p: LandmarkPlacement; s: number }[] = [];
    for (const corner of ctx.corners) {
      if (ctx.mat(corner) !== `stone` || !ctx.sown(corner)) continue;
      const h = ctx.h(corner);
      if (h < 1 || h > 2) continue;
      const top = ctx.top(corner);
      const y = ctx.flat(top.x, top.z, 0.5, 0.08);
      if (y === null) continue;
      const out = Math.atan2(top.z, top.x);
      let face = out;
      let best = 1 / 0;
      for (const n of ctx.nbrs(corner)) {
        const a = ctx.angle(corner, n);
        const d = Math.abs(((a - out + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < best) {
          best = d;
          face = a;
        }
      }
      const stoneNbrs = ctx.nbrs(corner).filter((n) => ctx.mat(n) === `stone`).length;
      found.push({
        p: {
          key: `greenhouse:${corner}`,
          x: top.x,
          y,
          z: top.z,
          rotY: atan2(Math.cos(face), Math.sin(face)),
          radius: 0.8,
          clear: 0.75,
        },
        s: stoneNbrs + ctx.h01(corner, 401),
      });
    }
    return found.sort((a, b) => b.s - a.s).map((f) => f.p);
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const garden = gardenMaterials();
    const rng = new Rng(placementSeed(seed, p, 24997));
    const body = new MeshKit(rng);
    const glass = new MeshKit(rng);
    const lampGlow = new MeshKit(rng);
    const seedlings = new MeshKit(rng);
    const tomato = new MeshKit(rng);
    const lamp = new MeshKit(rng);
    const halfL = LENGTH / 2;
    const halfD = DEPTH / 2;
    body.box(1.18, 0.03, 0.82, 0, 0.015, 0, PALETTE.stoneLight, { grad: 0, bevel: 0.01 });
    const bricks = [`#d0906f`, `#c9825f`, `#d99c7a`, `#c48a6c`];
    const brickWall = (len: number, x: number, z: number, rotY: number, skip?: (s: number) => boolean): void => {
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      for (let course = 0; course < 2; course++) {
        const bw = 0.19;
        const shift = course ? bw / 2 : 0;
        const count = Math.ceil((len + shift) / bw) + 1;
        for (let i = 0; i < count; i++) {
          let a = -len / 2 - shift + i * bw;
          let b = a + bw;
          a = Math.max(a, -len / 2);
          b = Math.min(b, len / 2);
          if (b - a < 0.04) continue;
          const mid = (a + b) / 2;
          if (!skip?.(mid))
            body.box(
              b - a - 0.012,
              WALL_H / 2 - 0.008,
              0.075,
              x + mid * c,
              (course + 0.5) * (WALL_H / 2),
              z - mid * s,
              bricks[Math.floor(rng.next() * bricks.length)],
              { rot: [0, rotY, 0], bevel: 0.012, grad: 0.18 },
            );
        }
      }
    };
    brickWall(LENGTH, 0, 0.39, 0);
    brickWall(LENGTH, 0, -0.39, 0);
    brickWall(0.7, 0.57, 0, Math.PI / 2, (s) => Math.abs(s) < 0.2);
    brickWall(0.7, -0.57, 0, Math.PI / 2);
    for (const e of [-1, 1]) body.box(1.25, 0.03, 0.11, 0, 0.162, e * 0.39, WHITE_FRAME, { ao: false, grad: 0 });
    body.box(0.11, 0.03, 0.76, -0.57, 0.162, 0, WHITE_FRAME, { ao: false, grad: 0 });
    for (const e of [-1, 1]) body.box(0.11, 0.03, 0.19, 0.57, 0.162, e * 0.315, WHITE_FRAME, { ao: false, grad: 0 });
    const postXs = [-0.61, -0.61 / 3, halfL / 3, halfL];
    const post = 0.048;
    for (const e of postXs) {
      for (const t of [-1, 1]) {
        const x = e - Math.sign(e) * 0.02;
        const z = t * 0.4;
        body.box(post, 0.51, post, x, 0.81 / 2, z, WHITE_FRAME, { ao: false, grad: 0.08, bevel: 0.01 });
      }
      for (const t of [-1, 1])
        body.beam(
          vec3(e - Math.sign(e) * 0.02, EAVE_Y, t * 0.45),
          vec3(e - Math.sign(e) * 0.02, RIDGE_Y, 0),
          0.045,
          0.045,
          WHITE_FRAME,
          { ao: false, extend: 0.02, grad: 0 },
        );
    }
    for (const e of [-1, 1]) {
      body.box(1.28, 0.055, 0.07, 0, EAVE_Y, e * 0.41, WHITE_FRAME, { ao: false, grad: 0, bevel: 0.012 });
      body.box(LENGTH, 0.028, 0.03, 0, 0.42, e * 0.4, WHITE_FRAME, { ao: false, grad: 0 });
    }
    for (const e of [-1, 1]) body.box(0.07, 0.055, DEPTH, e * 0.59, EAVE_Y, 0, WHITE_FRAME, { ao: false, grad: 0, bevel: 0.012 });
    body.box(1.32, 0.055, 0.07, 0, 1.03, 0, WHITE_FRAME, { ao: false, grad: 0, bevel: 0.015 });
    for (const e of [-1, 1]) body.blob(0.04, e * 0.66, 1.08, 0, WHITE_FRAME, { detail: 1, ao: false });
    for (let e = 0; e < 7; e++) body.cone(0.018, 0.05, 4, -0.51 + (e * 1.02) / 6, 1.055, 0, WHITE_FRAME, { ao: false, grad: 0 });
    body.box(post, 0.87, post, -0.59, 1.17 / 2, 0, WHITE_FRAME, { ao: false, grad: 0 });
    for (const e of [-1, 1]) body.box(post, 0.64, post, 0.59, 0.32, e * 0.19, WHITE_FRAME, { ao: false, grad: 0.05 });
    body.box(0.06, 0.05, 0.44, 0.59, 0.64, 0, WHITE_FRAME, { ao: false });
    body.box(0.055, 0.2, 0.33, 0.6, 0.12, 0, WHITE_FRAME, { ao: false, grad: 0.1, bevel: 0.012 });
    body.blob(0.018, 0.64, 0.34, -0.11, `#d9b35c`, { detail: 0, ao: false });
    const ventKits: { sz: number; glass: MeshKit; frame: MeshKit }[] = [];
    const white = `#ffffff`;
    for (const e of [-1, 1]) {
      glass.box(1.19, 0.49, 0.012, 0, 0.81 / 2, e * 0.4, white);
      const slope = Math.hypot(0.36, halfD);
      const up = vec3(0, halfD / slope, (e * 0.36) / slope);
      for (const [a, b] of [
        [-0.6, -0.61 / 3 - 0.02],
        [0.22333333333333333, LENGTH / 2 - 0.01],
      ])
        glass.beam(
          vec3((a + b) / 2, EAVE_Y, e * 0.45).addScaledVector(up, 0.01),
          vec3((a + b) / 2, RIDGE_Y, 0).addScaledVector(up, 0.01),
          b - a,
          0.012,
          white,
          { up },
        );
      const ventGlass = new MeshKit(rng);
      const ventFrame = new MeshKit(rng);
      const lo = vec3(0, EAVE_Y, e * 0.45);
      const hi = vec3(0, RIDGE_Y, 0);
      ventGlass.beam(lo.clone().addScaledVector(up, 0.01), hi.clone().addScaledVector(up, 0.01), VENT_HALF * 2, 0.012, white, {
        up,
      });
      for (const s of [-1, 1])
        ventFrame.beam(
          lo
            .clone()
            .addScaledVector(up, 0.016)
            .setX(s * 0.17533333333333334),
          hi
            .clone()
            .addScaledVector(up, 0.016)
            .setX(s * 0.17533333333333334),
          0.024,
          0.022,
          WHITE_FRAME,
          { up, ao: false, grad: 0 },
        );
      for (const t of [0.03, 0.5, 0.97]) {
        const at = lo.clone().lerp(hi, t).addScaledVector(up, 0.016);
        ventFrame.beam(at.clone().setX(-0.18333333333333335), at.clone().setX(VENT_HALF), 0.024, 0.022, WHITE_FRAME, {
          up,
          ao: false,
          grad: 0,
        });
      }
      const handle = lo.clone().lerp(hi, 0.08).addScaledVector(up, 0.04);
      ventFrame.blob(0.016, 0, handle.y, handle.z, `#d9b35c`, { detail: 0, ao: false });
      ventKits.push({ sz: e, glass: ventGlass, frame: ventFrame });
    }
    glass.box(0.012, 0.49, 0.8, -0.59, 0.81 / 2, 0, white);
    for (const e of [-1, 1]) glass.box(0.012, 0.49, 0.21, 0.59, 0.81 / 2, e * 0.305, white);
    glass.box(0.012, 0.42, 0.33, 0.6, 0.43, 0, white);
    for (const e of [-1, 1])
      glass.tris(
        extrudePolygon(
          [
            [-0.43, EAVE_Y],
            [halfD, EAVE_Y],
            [0, RIDGE_Y],
          ],
          0.012,
        ),
        e * 0.59,
        0,
        0,
        white,
        { rot: [0, Math.PI / 2, 0] },
      );
    const benchZ = -0.26;
    const benchTop = PALETTE.woodLight;
    body.box(0.9, 0.035, 0.2, -0.02, 0.36, benchZ, benchTop, { ao: false, bevel: 0.01, grad: 0 });
    body.box(0.9, 0.025, 0.18, -0.02, 0.13, benchZ, PALETTE.wood, { ao: false, bevel: 0.008 });
    for (const e of [-1, 1])
      for (const t of [-0.08, 0.08]) body.box(0.03, 0.36, 0.03, -0.02 + e * 0.42, 0.18, benchZ + t, PALETTE.wood, { grad: 0.3 });
    const potColors = [TERRACOTTA, shadeColor(TERRACOTTA, 0.05), shadeColor(TERRACOTTA, -0.04), `#b9c9c2`];
    const budColors = [PALETTE.poppy, PALETTE.tulipPink, PALETTE.sunflower, PALETTE.lavender];
    for (let e = 0; e < 5; e++) {
      const x = -0.4 + e * 0.19 + (rng.next() - 0.5) * 0.03;
      const soil = flowerPot(body, 0.045 + rng.next() * 0.015, x, 0.378, benchZ + (rng.next() - 0.5) * 0.04, potColors[e % potColors.length]);
      sprout(seedlings, rng, x, soil, benchZ, 0.12 + rng.next() * 0.08, e % 2 ? PALETTE.leafLight : PALETTE.leafYoung);
      if (e % 2 == 0) seedlings.blob(0.028, x + 0.01, soil + 0.14, -0.25, budColors[(e / 2) % budColors.length], { detail: 0, ao: false });
    }
    for (let e = 0; e < 3; e++) flowerPot(body, 0.04, 0.2 + e * 0.012, 0.145 + e * 0.03, benchZ, shadeColor(TERRACOTTA, e * 0.03));
    flowerPot(body, 0.045, -0.25, 0.145, benchZ, TERRACOTTA);
    const trayZ = 0.26;
    body.box(0.5, 0.03, 0.17, 0.18, 0.25, trayZ, benchTop, { ao: false, bevel: 0.01, grad: 0 });
    for (const e of [-1, 1]) body.box(0.03, 0.25, 0.03, 0.18 + e * 0.22, 0.125, trayZ, PALETTE.wood, { grad: 0.3 });
    for (const e of [0.06, 0.3]) {
      body.box(0.21, 0.04, 0.14, e, 0.285, trayZ, PALETTE.woodDark, { ao: false, bevel: 0.008 });
      body.box(0.19, 0.012, 0.12, e, 0.303, trayZ, POT_SOIL, { ao: false, grad: 0 });
      for (let t = 0; t < 4; t++)
        for (let n = 0; n < 3; n++)
          body.blob(0.018, e - 0.07 + t * 0.047, 0.325, 0.22 + n * 0.04, n % 2 ? PALETTE.leafYoung : PALETTE.leafLight, {
            scale: [1.2, 0.7, 1.2],
            detail: 0,
            ao: false,
          });
    }
    const tomX = -0.36;
    const tomZ = 0.14;
    const tomSoil = flowerPot(body, 0.075, tomX, 0.03, tomZ, TERRACOTTA);
    tomato.cyl(0.008, 0.01, 0.62, 4, -0.32999999999999996, tomSoil - 0.02, tomZ, PALETTE.woodLight, { ao: false });
    for (let e = 0; e < 6; e++) {
      const a = e * 2.3;
      const y = tomSoil + 0.1 + e * 0.075;
      tomato.blob(0.06 - e * 0.004, tomX + Math.cos(a) * 0.05, y, tomZ + Math.sin(a) * 0.05, e % 2 ? PALETTE.leaf : PALETTE.leafDark, {
        scale: [1.3, 0.8, 1.1],
        detail: 0,
        ao: false,
      });
      if (e > 0 && e < 5)
        tomato.blob(
          0.026,
          tomX + Math.cos(a + 1.6) * 0.075,
          y - 0.02,
          tomZ + Math.sin(a + 1.6) * 0.075,
          e % 2 ? `#e0513b` : `#e8773f`,
          { detail: 1, ao: false },
        );
    }
    const lampX = 0.08;
    lamp.cyl(0.006, 0.006, 0.16000000000000003, 4, lampX, 0.86, 0, `#6b5a4a`, { ao: false });
    lamp.cone(0.05, 0.035, 8, lampX, 0.835, 0, `#5f6f68`, { ao: false });
    lamp.cyl(0.035, 0.03, 0.012, 8, lampX, 0.755, 0, `#5f6f68`, { ao: false });
    lampGlow.cyl(0.036, 0.036, 0.07, 8, lampX, 0.765, 0, PALETTE.lanternGlow);
    body.box(0.16, 0.05, 0.36, 0.71, 0.025, 0, PALETTE.stone, { bevel: 0.015, grad: 0.2 });
    for (const e of [-1, 1])
      flowerTuft(
        body,
        rng,
        0.71,
        flowerPot(body, 0.06, 0.71, 0, e * 0.32, TERRACOTTA) - 0.02,
        e * 0.32,
        0.05,
        5,
        e > 0 ? [PALETTE.tulipPink, PALETTE.daisy] : [PALETTE.sunflower, PALETTE.tulipOrange],
      );
    const root = landmarkMesh(body.build(), mats.base);
    const glassMesh = landmarkMesh(glass.build(), garden.warmGlass, false);
    glassMesh.renderOrder = 2;
    root.add(glassMesh);
    const shelf = pivotMesh(seedlings, mats.base, 0, 0.44, benchZ);
    const tomatoMesh = pivotMesh(tomato, mats.base, -0.33999999999999997, tomSoil, tomZ);
    const lampMesh = pivotMesh(lamp, mats.base, lampX, RIDGE_Y, 0, false);
    const bulb = landmarkMesh(lampGlow.build(), mats.glow, false);
    bulb.position.set(-0.08, -1.02, 0);
    lampMesh.add(bulb);
    const halo = glowSprite(3.2, 2.1, 1.1);
    halo.position.set(0, -0.21999999999999997, 0);
    lampMesh.add(halo);
    root.add(shelf, tomatoMesh, lampMesh);
    const vents: Vent[] = ventKits.map((v) => {
      const grp = new THREE.Group();
      const pane = landmarkMesh(v.glass.build(), garden.warmGlass, false);
      pane.renderOrder = 2;
      grp.add(pane, landmarkMesh(v.frame.build(), mats.base, false));
      root.add(grp);
      return { sz: v.sz, grp, open: new Spring(55, 4.5), hold: 0 };
    });
    const shelfSquash = new Spring(120, 6);
    const tomatoSquash = new Spring(120, 6);
    const shelfTipX = new Spring(70, 3.2);
    const shelfTipZ = new Spring(70, 3.2);
    const tomatoTipX = new Spring(60, 2.6);
    const tomatoTipZ = new Spring(60, 2.6);
    const lampTipX = new Spring(30, 2);
    const lampTipZ = new Spring(30, 2);
    const pollen = new SparkPoints(72, true);
    const petals = new SparkPoints(40, false);
    root.add(pollen.points, petals.points);
    let flashT = 1 / 0;
    let active = 0;
    const phase = (p.x * 1.1 + p.z * 0.6) % 6.28;
    const emitPollen = (side: number, count: number, rise: number): void => {
      for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 0.36;
        const t = 0.25 + Math.random() * 0.6;
        const y = EAVE_Y + 0.36 * t + 0.03;
        const z = side * halfD * (1 - t) * 0.85;
        const a = Math.random() * Math.PI * 2;
        pollen.emit(
          x,
          y,
          z,
          Math.cos(a) * 0.1,
          rise * (0.5 + Math.random() * 0.7),
          side * (0.05 + Math.random() * 0.12),
          1.3 + Math.random() * 1.2,
          0.05 + Math.random() * 0.05,
          POLLEN_RGB[0] * 1.8,
          POLLEN_RGB[1] * 1.8,
          POLLEN_RGB[2] * 1.8,
          { drag: 1.1, gravity: -0.05, twinkle: 0.45 },
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
        pollen.update(dt);
        petals.update(dt);
        const t = ctx.realTime + phase;
        lampMesh.rotation.z = Math.sin(t * 0.9) * 0.015 * ctx.wind + lampTipZ.x;
        lampMesh.rotation.x = Math.sin(t * 0.7 + 1.3) * 0.01 * ctx.wind + lampTipX.x;
        if (!active) return;
        flashT += dt;
        let moving = false;
        for (const v of vents) {
          const s = v.open;
          if (v.hold > 0) v.hold -= dt;
          else s.target = 0;
          s.update(dt);
          if (s.x < 0) {
            if (s.v < -0.5) kick(lampTipZ, 0.5, 2);
            s.x = 0;
            s.v = Math.abs(s.v) * 0.32;
          }
          const ang = -v.sz * s.x;
          v.grp.rotation.x = ang;
          v.grp.position.set(0, RIDGE_Y * (1 - Math.cos(ang)), -1.02 * Math.sin(ang));
          if (!s.settled || s.target > 0) moving = true;
        }
        const sq = shelfSquash.update(dt);
        shelf.scale.set(1 - sq * 0.1, 1 + sq * 0.28, 1 - sq * 0.1);
        shelf.rotation.x = shelfTipX.update(dt) * 0.28;
        shelf.rotation.z = shelfTipZ.update(dt) * 0.12;
        const tq = tomatoSquash.update(dt);
        tomatoMesh.scale.set(1 - tq * 0.06, 1 + tq * 0.16, 1 - tq * 0.06);
        tomatoMesh.rotation.x = tomatoTipX.update(dt) * 0.3;
        tomatoMesh.rotation.z = tomatoTipZ.update(dt) * 0.3;
        lampTipX.update(dt);
        lampTipZ.update(dt);
        const glow = envelope(flashT, 0.08, 0.55);
        setGlowSprite(halo, 0.55 + glow * 0.4, glow * dim);
        if (
          !moving &&
          glow < 0.02 &&
          shelfSquash.settled &&
          tomatoSquash.settled &&
          shelfTipX.settled &&
          shelfTipZ.settled &&
          tomatoTipX.settled &&
          tomatoTipZ.settled &&
          lampTipX.settled &&
          lampTipZ.settled
        ) {
          active = 0;
          shelf.scale.set(1, 1, 1);
          shelf.rotation.set(0, 0, 0);
          tomatoMesh.scale.set(1, 1, 1);
          tomatoMesh.rotation.set(0, 0, 0);
          lampTipX.set(0);
          lampTipZ.set(0);
        }
      },
      poke(poke, ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const n = Math.min(poke.count, 4);
        pokeDirLocal(poke, p.rotY ?? 0, pokeDir);
        const near = pokeDir.z > 0 ? -1 : 1;
        for (const v of vents) {
          const facing = v.sz === near;
          if (!facing && n < 2) continue;
          v.open.target = n >= 3 ? 1.15 : 0.95;
          v.hold = 1.5 + n * 0.45;
          kick(v.open, facing ? 2.6 : 1.8, 6);
          emitPollen(v.sz, facing ? 9 + n * 6 : 5 + n * 4, 1);
        }
        if (n >= 2)
          for (let i = 0; i < n * 5; i++) {
            const c = PETAL_RGB[Math.floor(Math.random() * PETAL_RGB.length)];
            const side = Math.random() < 0.5 ? -1 : 1;
            petals.emit(
              (Math.random() - 0.5) * 0.4,
              0.97,
              side * 0.1,
              (Math.random() - 0.5) * 0.3,
              0.4 + Math.random() * 0.4,
              side * (0.1 + Math.random() * 0.25),
              1.6 + Math.random() * 1,
              0.07 + Math.random() * 0.04,
              c[0] * nightDim,
              c[1] * nightDim,
              c[2] * nightDim,
              { gravity: 0.5, drag: 1 },
            );
          }
        kick(shelfSquash, 2.4 + n * 0.5, 7);
        kick(tomatoSquash, 2 + n * 0.5, 7);
        kick(shelfTipX, (Math.random() < 0.5 ? -1 : 1) * (3 + n), 9);
        kick(shelfTipZ, (Math.random() < 0.5 ? -1 : 1) * (3 + n), 9);
        kick(tomatoTipX, (Math.random() < 0.5 ? -1 : 1) * (3.5 + n), 10);
        kick(tomatoTipZ, (Math.random() < 0.5 ? -1 : 1) * (3.5 + n), 10);
        kick(lampTipX, (Math.random() - 0.5) * 3, 3);
        kick(lampTipZ, (Math.random() < 0.5 ? -1 : 1) * (2 + n * 0.6), 4);
        flashT = 0;
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        pollen.dispose();
        petals.dispose();
        disposeSprite(halo);
      },
    };
  },
};
