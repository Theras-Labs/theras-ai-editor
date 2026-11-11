// Ports index-BwioI7A7.js 28935-29223: the snowman (em), its constants (Jp..Qp) and its melt weight ($p).
import * as THREE from 'three';
import { clamp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import {
  COAL,
  QUARTER_TURN,
  gardenMaterials,
  kick,
  nearestTreeDist,
  pivotMesh,
  placementSeed,
  pokeDirLocal,
  rgb,
  vec3,
} from './shared';

const SNOW_WHITE = `#f1f4fa`; // Jp (28935)
const PUFF_RGB = rgb(`#d3e3f7`); // Yp (28936)
const SPARK_RGB = rgb(`#dff0ff`); // Xp (28937)
const pokeDir = { x: 0, z: 0 }; // Zp (28938)
const SCARVES: [string, string][] = [
  [`#d9574a`, `#f3ead8`],
  [`#5f8fb8`, `#f3ead8`],
  [`#e0a53f`, `#c9574a`],
  [`#7aa35a`, `#f3ead8`],
]; // Qp (28939)

/** 1 while there is snow (or in deep winter); in the winter window it fades out with the snow cover. */
function snowHold(yearFrac: number, snow: number): number { // $p (28945)
  return yearFrac > 0.9 || yearFrac < 0.1 ? clamp((snow - 0.03) / 0.6) : 1;
}

export const SNOWMAN: LandmarkDef = { // em (28948)
  id: `snowman`,
  name: `Snowman`,
  icon: `⛄`,
  tint: `#dfeaf5`,
  blurb: `Someone rolled a snowman on the lawn, and lent it their very best scarf.`,
  hint: `When snow lies thick, an open lawn well away from the trees makes for good rolling.`,
  priority: 20,
  max: 2,
  detect(ctx) {
    const time = ctx.time;
    if (!(time.snow > 0.5 || ((time.yearFrac > 0.9 || time.yearFrac < 0.1) && time.snow > 0.03))) return [];
    const spots: { c: number; x: number; y: number; z: number; s: number }[] = [];
    for (const corner of ctx.corners) {
      if (ctx.mat(corner) !== `soil` || ctx.sown(corner)) continue;
      const h = ctx.h(corner);
      if (h < 1) continue;
      const nbrs = ctx.nbrs(corner);
      if (!nbrs.every((n) => ctx.land(n) && ctx.h(n) === h)) continue;
      const top = ctx.top(corner);
      if (nearestTreeDist(ctx, top.x, top.z) < 1.5) continue;
      const y = ctx.flat(top.x, top.z, 0.4, 0.05);
      if (y === null) continue;
      const lawn = nbrs.filter((n) => ctx.mat(n) === `soil` && !ctx.sown(n)).length;
      spots.push({ c: corner, x: top.x, y, z: top.z, s: lawn * 0.25 + ctx.h01(corner, 501) });
    }
    spots.sort((a, b) => b.s - a.s);
    const out: LandmarkPlacement[] = [];
    for (const s of spots)
      if (
        !out.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 5) &&
        (out.push({
          key: `snowman:${s.c}`,
          x: s.x,
          y: s.y,
          z: s.z,
          rotY: QUARTER_TURN + (ctx.h01(s.c, 502) - 0.5) * 0.9,
          radius: 0.45,
          clear: 0.4,
        }),
        out.length >= 6)
      )
        break;
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const garden = gardenMaterials();
    const rng = new Rng(placementSeed(seed, p, 22273));
    const [scarfA, scarfB] = SCARVES[Math.floor(rng.next() * SCARVES.length)];
    const body = new MeshKit(rng);
    const noseKit = new MeshKit(rng);
    const armKits: Record<number, MeshKit> = { [-1]: new MeshKit(rng), 1: new MeshKit(rng) };
    body.blob(0.3, 0, 0, 0, SNOW_WHITE, { scale: [1.25, 0.2, 1.2], detail: 1, grad: 0.1 });
    const balls: [number, number][] = [
      [0.25, 0.22],
      [0.185, 0.54],
      [0.135, 0.8],
    ];
    for (const [r, y] of balls)
      body.blob(r, (rng.next() - 0.5) * 0.015, y, 0, SNOW_WHITE, { scale: [1, 0.96, 1], detail: 2, grad: 0.22, jitter: 0.02 });
    const surfaceZ = (r: number, cy: number, x: number, y: number, off = 0): number =>
      Math.sqrt(Math.max(0, r * r - x * x - (y - cy) ** 2)) + off;
    const [headR, headY] = balls[2];
    for (const e of [-1, 1])
      body.blob(0.021, e * 0.047, headY + 0.035, surfaceZ(headR, headY, e * 0.047, headY + 0.035, -0.005), COAL, {
        scale: [1, 1.1, 0.7],
        detail: 1,
        ao: false,
      });
    noseKit.cone(0.03, 0.15, 6, 0, headY - 0.005, headR - 0.02, PALETTE.tulipOrange, {
      rot: [Math.PI / 2, 0, 0],
      ao: false,
      grad: 0.2,
    });
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.028;
      const y = headY - 0.055 + i * i * 0.005;
      body.blob(0.012, x, y, surfaceZ(headR, headY, x, y, -0.003), COAL, { detail: 0, ao: false });
    }
    const [midR, midY] = balls[1];
    for (let i = 0; i < 3; i++) {
      const y = midY - 0.08 + i * 0.07;
      body.blob(0.02, 0, y, surfaceZ(midR, midY, 0, y, -0.004), COAL, { scale: [1, 1, 0.7], detail: 1, ao: false });
    }
    for (const e of [-1, 1]) {
      const from = vec3(e * 0.15, midY + 0.04, 0);
      const elbow = vec3(e * 0.43, midY + 0.2 + rng.next() * 0.05, 0.03);
      armKits[e].beam(from, elbow, 0.024, 0.024, PALETTE.woodDark, { ao: false });
      armKits[e].beam(elbow, vec3(e * 0.49, elbow.y + 0.09, 0.03), 0.016, 0.016, PALETTE.woodDark, { ao: false });
      armKits[e].beam(elbow, vec3(e * 0.51, elbow.y - 0.03, 0.06), 0.016, 0.016, PALETTE.woodDark, { ao: false });
      armKits[e].beam(vec3(e * 0.33, midY + 0.15, 0.025), vec3(e * 0.36, midY + 0.23, 0), 0.014, 0.014, PALETTE.woodDark, { ao: false });
    }
    const scarfKit = new MeshKit(rng);
    const scarfY = midY + midR - 0.035;
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = ((i + 1) / 12) * Math.PI * 2;
      const r = 0.12;
      scarfKit.beam(
        vec3(Math.cos(a0) * r, scarfY, Math.sin(a0) * r),
        vec3(Math.cos(a1) * r, scarfY, Math.sin(a1) * r),
        0.06,
        0.07,
        i % 2 ? scarfA : scarfB,
        { ao: false, extend: 0.012, bevel: 0.015 },
      );
    }
    const hatKit = new MeshKit(rng);
    hatKit.blob(headR * 0.98, 0, headY + 0.045, 0, scarfA, { scale: [1, 0.8, 1], detail: 1, ao: false, grad: 0.1 });
    hatKit.ring(headR * 0.93, 0.032, 5, 16, 0, headY + 0.06, 0, scarfB, { ao: false });
    hatKit.ring(headR * 0.8, 0.018, 4, 16, 0, headY + 0.13, 0, scarfB, { ao: false });
    hatKit.blob(0.05, 0.01, headY + headR + 0.055, 0, scarfB, { detail: 1, ao: false });
    const figure = new THREE.Group();
    figure.add(landmarkMesh(body.build(), mats.base), landmarkMesh(scarfKit.build(), garden.knit));
    const hat = pivotMesh(hatKit, garden.knit, 0, headY, 0);
    const nose = pivotMesh(noseKit, mats.base, 0, headY - 0.005, headR - 0.02, false);
    const arms: Record<number, THREE.Mesh> = {
      [-1]: pivotMesh(armKits[-1], mats.base, -0.14, midY + 0.04, 0, false),
      1: pivotMesh(armKits[1], mats.base, 0.14, midY + 0.04, 0, false),
    };
    figure.add(hat, nose, arms[-1], arms[1]);
    const tailKit = new MeshKit(rng);
    for (let i = 0; i < 3; i++)
      tailKit.box(0.078, 0.072, 0.014, 0.04 + i * 0.078, 0, 0, i % 2 ? scarfB : scarfA, { ao: false, grad: 0, bevel: 0.004 });
    for (let i = 0; i < 4; i++) tailKit.box(0.04, 0.01, 0.01, 0.255, -0.027 + i * 0.018, 0, scarfA, { ao: false, grad: 0 });
    const tail = landmarkMesh(tailKit.build(), mats.cloth);
    tail.position.set(0.075, scarfY - 0.01, 0.1);
    tail.rotation.set(0, -0.7, -Math.PI / 2 + 0.45);
    figure.add(tail);
    const puddleKit = new MeshKit(rng);
    puddleKit.cyl(0.34, 0.34, 0.012, 22, 0, 0.004, 0, `#ffffff`, { ao: false, scale: [1.12, 1, 0.9] });
    puddleKit.cyl(0.16, 0.16, 0.012, 12, 0.3, 0.004, 0.12, `#ffffff`, { ao: false });
    const puddle = landmarkMesh(puddleKit.build(), mats.water, false);
    puddle.visible = false;
    const root = new THREE.Group();
    root.add(puddle, figure);
    root.scale.setScalar(1.18);
    const hop = new Spring(200, 9);
    const squash = new Spring(230, 8.5);
    const leanX = new Spring(90, 5.5);
    const leanZ = new Spring(90, 5.5);
    const armL = new Spring(60, 2.4);
    const armR = new Spring(60, 2.4);
    const hatPop = new Spring(80, 5);
    const hatTipZ = new Spring(70, 3.2);
    const hatTipX = new Spring(70, 3.2);
    const noseStretch = new Spring(150, 5);
    const noseNod = new Spring(110, 3);
    let hatSpin = 0;
    let hatSpinTarget = 0;
    const puffs = new SparkPoints(80, false);
    const sparks = new SparkPoints(32, true);
    const halo = glowSprite(1.6, 2, 3);
    halo.position.set(0, headY + 0.1, 0.05);
    let flashT = 1 / 0;
    figure.add(puffs.points, sparks.points, halo);
    let active = 0;
    const emitPuff = (x: number, y: number, z: number, count: number, spread: number, rise: number): void => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        puffs.emit(
          x + (Math.random() - 0.5) * 0.12,
          y + (Math.random() - 0.5) * 0.06,
          z + (Math.random() - 0.5) * 0.12,
          Math.cos(a) * spread * (0.3 + Math.random()),
          rise * (0.3 + Math.random()),
          Math.sin(a) * spread * (0.3 + Math.random()),
          0.9 + Math.random() * 0.9,
          0.07 + Math.random() * 0.06,
          PUFF_RGB[0] * nightDim,
          PUFF_RGB[1] * nightDim,
          PUFF_RGB[2] * nightDim,
          { gravity: 0.9, drag: 1.4, grow: 0.7 },
        );
      }
    };
    let nightDim = 1;
    return {
      object: root,
      update(ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const melt = 1 - snowHold(ctx.time.yearFrac, ctx.time.snow);
        let sx = 1 - 0.3 * melt;
        let sy = 1 - 0.62 * melt;
        let sz = sx;
        figure.rotation.z = melt * 0.16;
        figure.rotation.x = melt * 0.08;
        puddle.visible = melt > 0.02;
        puddle.scale.setScalar(0.4 + melt * 0.75);
        const dt = ctx.dt;
        const dim = 1 - 0.5 * ctx.night;
        puffs.update(dt);
        sparks.update(dt);
        if (active) {
          flashT += dt;
          const h = hop.update(dt);
          if (h < 0) {
            hop.x = 0;
            hop.v = Math.abs(hop.v) * 0.2;
          }
          figure.position.y = Math.max(0, h) * 0.22 * (1 - melt);
          const sq = squash.update(dt);
          sy *= 1 + sq * 0.14;
          sx *= 1 - sq * 0.08;
          sz *= 1 - sq * 0.08;
          figure.rotation.x += leanX.update(dt);
          figure.rotation.z += leanZ.update(dt);
          arms[-1].rotation.z = -armL.update(dt);
          arms[1].rotation.z = armR.update(dt);
          let pop = hatPop.update(dt);
          if (pop < 0) {
            hatPop.x = 0;
            hatPop.v = Math.abs(hatPop.v) * 0.3;
            pop = 0;
          }
          hat.position.y = headY + pop * 0.2;
          hat.rotation.z = hatTipZ.update(dt);
          hat.rotation.x = hatTipX.update(dt);
          hatSpin += (hatSpinTarget - hatSpin) * (1 - Math.exp(-5.5 * dt));
          hat.rotation.y = hatSpin;
          const stretch = noseStretch.update(dt);
          nose.scale.set(1, 1, 1 + stretch * 0.9);
          nose.rotation.x = noseNod.update(dt) * 0.45;
          nose.rotation.y = noseNod.v * 0.02;
          const glow = flashT < 0 ? 0 : Math.exp(-flashT * 4);
          setGlowSprite(halo, 0.5 + glow * 0.35, glow * 0.7 * dim);
          if (
            hop.settled &&
            squash.settled &&
            leanX.settled &&
            leanZ.settled &&
            armL.settled &&
            armR.settled &&
            hatPop.settled &&
            hatTipZ.settled &&
            hatTipX.settled &&
            noseStretch.settled &&
            noseNod.settled &&
            Math.abs(hatSpinTarget - hatSpin) < 0.002 &&
            glow < 0.02
          ) {
            active = 0;
            figure.position.y = 0;
            arms[-1].rotation.z = 0;
            arms[1].rotation.z = 0;
            hat.position.y = headY;
            hat.rotation.set(0, 0, 0);
            hatSpin = 0;
            hatSpinTarget = 0;
            nose.scale.set(1, 1, 1);
            nose.rotation.set(0, 0, 0);
          }
        }
        figure.scale.set(sx, sy, sz);
      },
      poke(poke, ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const n = Math.min(poke.count, 4);
        pokeDirLocal(poke, p.rotY ?? 0, pokeDir);
        kick(hop, 3.4 + n * 0.9, 9);
        kick(squash, 3.2 + n * 0.6, 9);
        kick(leanX, pokeDir.z * (0.5 + n * 0.14), 1.4);
        kick(leanZ, -pokeDir.x * (0.5 + n * 0.14), 1.4);
        kick(armR, 5.5 + n * 1.5, 14);
        kick(armL, 4.2 + n * 1.5, 14);
        kick(hatPop, 2.4 + n * 1, 9);
        kick(hatTipZ, (Math.random() < 0.5 ? -1 : 1) * (4 + n), 11);
        kick(hatTipX, (Math.random() - 0.5) * 6, 8);
        if (n >= 3) hatSpinTarget += Math.PI * 2;
        kick(noseStretch, 1.8 + n * 0.6, 6);
        kick(noseNod, (Math.random() < 0.5 ? -1 : 1) * (3 + n), 8);
        emitPuff(0, headY + headR + 0.05, 0, 5 + n * 4, 0.35, 0.5);
        emitPuff(0, midY + midR * 0.8, 0, 4 + n * 3, 0.5, 0.25);
        emitPuff(0.3, midY + 0.15, 0, 2 + n * 2, 0.4, 0.4);
        emitPuff(-0.3, midY + 0.15, 0, 2 + n * 2, 0.4, 0.4);
        flashT = 0;
        for (let i = 0; i < 4 + n * 4; i++) {
          const a = Math.random() * Math.PI * 2;
          sparks.emit(
            Math.cos(a) * 0.2,
            headY + 0.05 + Math.random() * 0.4,
            Math.sin(a) * 0.2,
            Math.cos(a) * 0.3,
            0.2 + Math.random() * 0.4,
            Math.sin(a) * 0.3,
            0.7 + Math.random() * 0.7,
            0.05 + Math.random() * 0.04,
            SPARK_RGB[0] * 2,
            SPARK_RGB[1] * 2,
            SPARK_RGB[2] * 2,
            { drag: 1.2, twinkle: 0.6, gravity: 0.3 },
          );
        }
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        puffs.dispose();
        sparks.dispose();
        disposeSprite(halo);
      },
    };
  },
};
