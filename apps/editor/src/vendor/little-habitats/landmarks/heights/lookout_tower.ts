// Ports index-BwioI7A7.js 30344-30619: the lookout tower landmark (eh) and its constants Xm..$m.
import * as THREE from 'three';
import { dampAngle } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashInts, hashString } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import {
  Sparkles,
  Spinner,
  Spring,
  Stopwatch,
  disposeSprite,
  envelope,
  glowSprite,
  kickSpinner,
  randomSign,
  setGlowSprite,
} from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkData, LandmarkDef } from '../types';
import {
  ROPE,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  disposeMeshes,
  distanceToPeak,
  isWildSpot,
  nearestTreeDistance,
  seededYaw,
  vec3,
} from './shared';

const DECK_Y = 1.5; // Xm (30344)
const FOOT = 0.43; // Zm (30345)
const TOP = 0.34; // Qm (30346)
/** Local x, z of the four leg feet and the ladder foot; detect samples the ground under each. */
const FEET: number[][] = [ // $m (30347)
  [-0.43, -0.43],
  [FOOT, -0.43],
  [FOOT, FOOT],
  [-0.43, FOOT],
  [0, 0.66],
];

export const LOOKOUT_TOWER: LandmarkDef = { // eh (30354)
  id: `lookout_tower`,
  name: `Lookout tower`,
  icon: `🔭`,
  tint: `#d9e8c4`,
  blurb: `A rickety little watchtower on the peak — the whole garden spread out below.`,
  hint: `Heap soil into a bare peak four levels or taller and someone will want to admire the view.`,
  priority: 40,
  max: 1,
  detect(ctx) {
    const found: { c: number; x: number; y: number; z: number; score: number }[] = [];
    for (const c of ctx.corners) {
      const h = ctx.h(c);
      if (h < 4 || ctx.mat(c) !== `soil` || ctx.nbrs(c).some((n) => ctx.h(n) > h)) continue;
      const top = ctx.top(c);
      const y = ctx.flat(top.x, top.z, 0.25, 0.12);
      if (y === null || nearestTreeDistance(ctx, top.x, top.z) < 1.2) continue;
      let score = h * 10 + ctx.nbrs(c).filter((n) => ctx.h(n) === h).length;
      if (isWildSpot(ctx, c)) score -= 4;
      if (distanceToPeak(ctx, top.x, top.z) < 0.9) score -= 3;
      score += ctx.h01(c, 61) * 0.5;
      found.push({ c, x: top.x, y, z: top.z, score });
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, 4).map((f) => {
      const yaw = seededYaw(ctx, f.c, 0.8);
      const data: LandmarkData = {};
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      FEET.forEach(([lx, lz], k) => {
        const wx = f.x + lx * cos + lz * sin;
        const wz = f.z - lx * sin + lz * cos;
        data[`g${k}`] = Math.round(Math.max(-0.9, Math.min(0.05, ctx.heightAt(wx, wz) - f.y)) * 20) / 20;
      });
      return { key: `lookout_tower:${f.c}`, x: f.x, y: f.y, z: f.z, rotY: yaw, radius: 0.66, clear: 0.55, data };
    });
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(hashInts(seed, hashString(p.key), 4108));
    const kit = new MeshKit(rng);
    const glowKit = new MeshKit(rng);
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    /** Ground offset under foot k (from detect). */
    const groundAt = (k: number) => p.data?.[`g${k}`] ?? 0;
    const footAt = (k: number, y: number) => vec3(corners[k][0] * FOOT, y, corners[k][1] * FOOT);
    const topAt = (k: number, y: number) => vec3(corners[k][0] * TOP, y, corners[k][1] * TOP);
    /** Point on leg k at height y (the legs lean in from FOOT to TOP). */
    const legAt = (k: number, y: number) => {
      const t = y / DECK_Y;
      return footAt(k, y).lerp(topAt(k, y), t).setY(y);
    };
    for (let k = 0; k < 4; k++) {
      const g = groundAt(k);
      const base = legAt(k, 0).setY(g - 0.12);
      base.x += (base.x - topAt(k, 0).x) * (g / DECK_Y) * -1;
      base.z += (base.z - topAt(k, 0).z) * (g / DECK_Y) * -1;
      kit.beam(base, topAt(k, DECK_Y), 0.1, 0.1, WOOD_DARK, { grad: 0.3 });
      kit.box(0.2, 0.12, 0.2, base.x, g + 0.03, base.z, PALETTE.stone, { bevel: 0.03 });
    }
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      kit.beam(legAt(k, 0.16), legAt(n, 0.78), 0.05, 0.05, WOOD, { ao: !1 });
      kit.beam(legAt(n, 0.16), legAt(k, 0.78), 0.05, 0.05, WOOD, { ao: !1 });
      kit.beam(legAt(k, 0.8), legAt(n, 1.4), 0.05, 0.05, WOOD, { ao: !1 });
      kit.beam(legAt(n, 0.8), legAt(k, 1.4), 0.05, 0.05, WOOD, { ao: !1 });
      kit.beam(legAt(k, 0.79), legAt(n, 0.79), 0.06, 0.06, WOOD_DARK, { ao: !1, extend: 0.03 });
      kit.beam(legAt(k, 1.4), legAt(n, 1.4), 0.08, 0.09, WOOD_DARK, { ao: !1, extend: 0.04 });
    }
    const half = 0.5;
    for (let k = 0; k < 5; k++) {
      const x = -0.5 + ((k + 0.5) * 2 * half) / 5;
      kit.box(
        (2 * half) / 5 - 0.012,
        0.06,
        2 * half + (rng.next() - 0.5) * 0.04,
        x,
        1.47,
        0,
        k % 2 ? WOOD_LIGHT : shadeColor(WOOD_LIGHT, -0.05),
        { bevel: 0.012, ao: !1, grad: 0.15 },
      );
    }
    const post = 0.44;
    for (const [cx, cz] of corners)
      kit.box(0.08, 0.8399999999999999, 0.08, cx * post, 3.82 / 2, cz * post, WOOD_DARK, { ao: !1, grad: 0.15 });
    const railing = (a: THREE.Vector3, b: THREE.Vector3) => {
      kit.beam(a.clone().setY(1.8599999999999999), b.clone().setY(1.8599999999999999), 0.06, 0.05, WOOD, {
        ao: !1,
        extend: 0.02,
      });
      kit.beam(a.clone().setY(1.69), b.clone().setY(1.69), 0.035, 0.035, WOOD_DARK, { ao: !1 });
      const n = Math.max(1, Math.round(a.distanceTo(b) / 0.2));
      for (let k = 1; k < n; k++) {
        const at = a.clone().lerp(b, k / n);
        kit.box(0.035, 0.34, 0.035, at.x, 1.68, at.z, WOOD_DARK, { ao: !1, grad: 0 });
      }
    };
    railing(vec3(-0.44, 0, -0.44), vec3(post, 0, -0.44));
    railing(vec3(-0.44, 0, -0.44), vec3(-0.44, 0, post));
    railing(vec3(post, 0, -0.44), vec3(post, 0, post));
    railing(vec3(-0.44, 0, post), vec3(-0.17, 0, post));
    railing(vec3(0.17, 0, post), vec3(post, 0, post));
    // Ladder from the ground (foot 4) up to the gap in the front railing.
    const ladderFoot = vec3(0, groundAt(4) - 0.1, 0.66 - groundAt(4) * 0.12);
    const ladderTop = vec3(0, 1.82, 0.48);
    for (const x of [-0.13, 0.13])
      kit.beam(ladderFoot.clone().setX(x), ladderTop.clone().setX(x), 0.05, 0.05, WOOD, { ao: !1, grad: 0.2 });
    for (let y = groundAt(4) + 0.14; y < 1.7; y += 0.2) {
      const t = (y - ladderFoot.y) / (ladderTop.y - ladderFoot.y);
      const at = ladderFoot.clone().lerp(ladderTop, t);
      kit.beam(vec3(-0.13, y, at.z), vec3(0.13, y, at.z), 0.035, 0.035, WOOD_LIGHT, { ao: !1, extend: 0.02 });
    }
    const roofKit = new MeshKit(new Rng(hashInts(seed, hashString(p.key), 8199)));
    roofKit.box(1.06, 0.06, 1.06, 0, 2.34, 0, WOOD_DARK, { bevel: 0.015, ao: !1 });
    roofKit.cone(0.86, 0.56, 4, 0, 2.36, 0, `#c8695a`, { rot: [0, Math.PI / 4, 0], grad: 0.25, ao: !1 });
    roofKit.cyl(0.03, 0.035, 0.78, 6, 0, 2.77, 0, WOOD_DARK, { ao: !1, grad: 0 });
    roofKit.blob(0.05, 0, 3.57, 0, PALETTE.autumnGold, { ao: !1 });
    const lanternX = 0.42;
    const lanternZ = 0.42;
    const lanternKit = new MeshKit(new Rng(hashInts(seed, hashString(p.key), 6727)));
    lanternKit.beam(vec3(0, 0, 0), vec3(0, -0.1, 0), 0.012, 0.012, `#4b4038`, { ao: !1 });
    lanternKit.cone(0.07, 0.06, 4, 0, -0.14, 0, `#4b4038`, { rot: [0, Math.PI / 4, 0], ao: !1 });
    lanternKit.box(0.1, 0.02, 0.1, 0, -0.28, 0, `#4b4038`, { ao: !1 });
    glowKit.box(0.08, 0.12, 0.08, 0, -0.21, 0, PALETTE.lanternGlow, { ao: !1, grad: 0, jitter: 0 });
    const scopeMount = vec3(-0.29, 1.8900000000000001, post);
    const scopeKit = new MeshKit(new Rng(hashInts(seed, hashString(p.key), 23561)));
    {
      const m = scopeMount;
      kit.box(0.08, 0.05, 0.08, m.x, m.y + 0.01, m.z, WOOD_DARK, { ao: !1 });
      const dir = vec3(-0.35, 0.3, 0.89).normalize();
      const back = dir.clone().multiplyScalar(-0.2);
      const front = dir.clone().multiplyScalar(0.22);
      scopeKit.beam(back, front, 0.075, 0.075, `#c9933f`, { ao: !1, bevel: 0.022, grad: 0 });
      scopeKit.beam(front, front.clone().addScaledVector(dir, 0.07), 0.1, 0.1, `#a8742f`, { ao: !1, bevel: 0.025, grad: 0 });
      scopeKit.beam(back.clone().addScaledVector(dir, -0.06), back, 0.05, 0.05, `#4b4038`, { ao: !1 });
    }
    kit.ring(0.08, 0.025, 5, 12, -0.25, 1.52, -0.25, ROPE, { ao: !1 });
    kit.ring(0.06, 0.022, 5, 12, -0.25, 1.555, -0.25, ROPE, { ao: !1 });
    const towerMesh = landmarkMesh(kit.build(), mats.base);
    const glowMesh = landmarkMesh(glowKit.build(), mats.glow, !1);
    const roofMesh = landmarkMesh(roofKit.build(), mats.base);
    const lantern = new THREE.Group(); // E
    lantern.position.set(lanternX, 2.3, lanternZ);
    lantern.add(landmarkMesh(lanternKit.build(), mats.base), glowMesh);
    const scope = new THREE.Group(); // D
    scope.position.set(scopeMount.x, scopeMount.y + 0.08, scopeMount.z);
    scope.rotation.order = `YXZ`;
    scope.add(landmarkMesh(scopeKit.build(), mats.base));
    const flagKit = new MeshKit(rng);
    const yellow = `#f4c430`;
    const red = `#e25b6f`;
    flagKit.tris(
      extrudePolygon(
        [
          [0, 0.14],
          [0.2, 0.09],
          [0.2, -0.09],
          [0, -0.14],
        ],
        0.012,
      ),
      0,
      0,
      0,
      red,
      { ao: !1, grad: 0 },
    );
    flagKit.tris(
      extrudePolygon(
        [
          [0.2, 0.09],
          [0.62, 0],
          [0.2, -0.09],
        ],
        0.012,
      ),
      0,
      0,
      0,
      yellow,
      { ao: !1, grad: 0 },
    );
    const flagMesh = landmarkMesh(flagKit.build(), mats.cloth);
    const flag = new THREE.Group(); // M
    flag.position.set(0, 3.4, 0);
    flag.add(flagMesh);
    const roof = new THREE.Group(); // N
    roof.add(roofMesh, lantern, flag);
    const root = new THREE.Group();
    root.name = `lm-heights-lookout`;
    root.add(towerMesh, scope, roof);

    const flagSpin = new Spinner(); // F
    const roofHop = new Spring(190, 8); // I
    const roofRock = new Spring(120, 5); // L
    const lanternPitch = new Spring(60, 2.2); // R
    const lanternRoll = new Spring(50, 2.4); // ee
    const scopeYaw = new Spring(26, 3.2); // z
    const scopePitch = new Spring(40, 4); // te
    const flagStretch = new Spring(120, 6); // ne
    const flash = new Stopwatch(); // re
    const sparkles = new Sparkles(56); // B
    const halo = glowSprite(2.6, 1.8, 0.8); // ie
    halo.position.set(lanternX, 2.0999999999999996, lanternZ);
    sparkles.add(roof);
    roof.add(halo);
    let confetti = 0; // ae: seconds of trickling confetti left
    let flagYaw = 0; // V
    const rotY = p.rotY ?? 0; // oe
    const colors = [new THREE.Color(yellow), new THREE.Color(red), new THREE.Color(`#7fd0d8`), new THREE.Color(`#ffffff`)]; // se
    const burst = (count: number, speed: number) => { // ce
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.6 + Math.random() * 0.9);
        const c = colors[k % colors.length];
        sparkles.emit(
          0,
          3.5999999999999996,
          0,
          Math.cos(a) * v,
          1 + Math.random() * 1.6,
          Math.sin(a) * v,
          1.1 + Math.random() * 0.8,
          0.1 + Math.random() * 0.07,
          c.r,
          c.g,
          c.b,
          { gravity: 1.7, drag: 0.9, twinkle: 0.4 },
        );
      }
    };
    return {
      object: root,
      dispose() {
        disposeMeshes(root);
        sparkles.dispose();
        disposeSprite(halo);
      },
      poke(poke) {
        const count = Math.min(3, poke.count);
        flagSpin.kick(randomSign() * (9 + count * 4));
        kickSpinner(roofHop, 2.4 + count * 0.8, 4.5);
        kickSpinner(roofRock, randomSign() * (0.9 + count * 0.3), 2);
        kickSpinner(lanternPitch, randomSign() * (2.4 + count * 0.9), 4);
        kickSpinner(lanternRoll, randomSign() * (1.6 + count * 0.6), 3.5);
        kickSpinner(scopeYaw, randomSign() * (4 + count * 1.5), 8);
        kickSpinner(scopePitch, 1.6 + count * 0.6, 3);
        kickSpinner(flagStretch, 3 + count, 5);
        flash.start();
        burst(8 + count * 4, 0.9 + count * 0.2);
        if (count >= 3) confetti = 0.9;
        return !0;
      },
      update(ctx) {
        const target = Math.atan2(-ctx.windDir.y, ctx.windDir.x) - rotY + Math.sin(ctx.realTime * 1.1) * 0.15 * ctx.wind;
        flagYaw = dampAngle(flagYaw, target, 2.5, ctx.dt);
        flag.rotation.y = flagYaw + flagSpin.update(ctx.dt, 1.2);
        flag.scale.x = 1 + Math.max(-0.4, Math.min(0.5, flagStretch.update(ctx.dt) * 0.5));
        roof.position.y = Math.max(0, roofHop.update(ctx.dt)) * 0.55 + Math.min(0, roofHop.x) * 0.05;
        roof.rotation.z = roofRock.update(ctx.dt) * 0.5;
        roof.rotation.x = roofRock.x * 0.3;
        lantern.rotation.x = lanternPitch.update(ctx.dt) * 1.4;
        lantern.rotation.z = lanternRoll.update(ctx.dt) * 1.5;
        scope.rotation.y = scopeYaw.update(ctx.dt) * 0.6;
        scope.rotation.x = -scopePitch.update(ctx.dt) * 0.7;
        if (confetti > 0) {
          confetti -= ctx.dt;
          if (Math.random() < ctx.dt * 40) burst(1, 1.1);
        }
        sparkles.update(ctx.dt);
        flash.update(ctx.dt);
        const glow = envelope(flash.t, 0.05, 0.14) + 0.7 * envelope(flash.t - 0.38, 0.05, 0.16);
        setGlowSprite(halo, 0.7 + 0.35 * glow, glow * 0.9);
      },
    };
  },
};
