// Ports index-BwioI7A7.js 30871-30919 (constants lh..vh, the wall-panel helper yh, the yaw picker bh) and the windmill
// entry inline in xh (30922-31185).
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashInts, hashString } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Sparkles, Spring, Stopwatch, disposeSprite, envelope, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkDetectContext, LandmarkPlacement } from '../types';
import {
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  cornersWithin,
  disposeMeshes,
  distanceToPeak,
  isWildSpot,
  nearestTreeDistance,
  seededYaw,
  vec3,
} from './shared';

const TOWER_BASE_Y = 0.16; // lh (30871)
const TOWER_HEIGHT = 1.42; // uh (30872)
const TOWER_BOTTOM_R = 0.5; // dh (30873)
const TOWER_TOP_R = 0.35; // fh (30874)
/** The octagonal tower is turned so that a flat face looks along +z. */
const OCT_YAW = Math.PI / 8; // ph (30875)
/** Inward lean of the tower walls. */
const WALL_LEAN = Math.atan(0.15000000000000002 / TOWER_HEIGHT); // mh (30876)
const HUB_Y = 1.7799999999999998; // hh (30877)
const HUB_Z = 0.56; // gh (30878)
const SAIL_LENGTH = 1.28; // _h (30879)
/** Tower radius (to a corner of the octagon) at height y. */
const towerRadius = (y: number): number => // vh (30880)
  TOWER_BOTTOM_R - 0.15000000000000002 * Math.min(1, Math.max(0, (y - TOWER_BASE_Y) / TOWER_HEIGHT));

/**
 * Adds a w x h panel (depth d) flat on the tower wall facing `yaw`, centred at height y, `out` in front of the wall.
 */
function wallPanel( // yh (30881)
  kit: MeshKit,
  yaw: number,
  y: number,
  w: number,
  h: number,
  d: number,
  out: number,
  color: THREE.ColorRepresentation,
  opts: { bevel?: number } = {},
): void {
  const outward = vec3(Math.sin(yaw), 0, Math.cos(yaw));
  const normal = outward
    .clone()
    .multiplyScalar(Math.cos(WALL_LEAN))
    .add(vec3(0, Math.sin(WALL_LEAN), 0));
  const up = vec3(0, Math.cos(WALL_LEAN), 0).addScaledVector(outward, -Math.sin(WALL_LEAN));
  const across = vec3(Math.cos(yaw), 0, -Math.sin(yaw));
  const centre = outward
    .clone()
    .multiplyScalar(towerRadius(y) * Math.cos(OCT_YAW))
    .setY(y)
    .addScaledVector(normal, out + d / 2);
  kit.beam(centre.clone().addScaledVector(across, -w / 2), centre.clone().addScaledVector(across, w / 2), d, h, color, {
    up,
    bevel: opts.bevel ?? Math.min(w, h, d) * 0.3,
    ao: !1,
    grad: 0.1,
  });
}

/** Yaw near the seeded default that turns the sails away from nearby trees. */
function clearYaw(ctx: LandmarkDetectContext, corner: number, x: number, z: number): number { // bh (30901)
  const base = seededYaw(ctx, corner, 0.4);
  let best = base;
  let bestCost = 1 / 0;
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.3, -1.3]) {
    const yaw = base + off;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let cost = Math.abs(off) * 0.3;
    for (const tree of ctx.habitat.trees) {
      const dx = tree.base.x - x;
      const dz = tree.base.z - z;
      const d = Math.hypot(dx, dz);
      if (!(d > 3.4 || d < 0.001)) cost += Math.max(0, (dx * fx + dz * fz) / d + 0.35) * (3.4 - d);
    }
    if (cost < bestCost - 1e-6) {
      bestCost = cost;
      best = yaw;
    }
  }
  return best;
}

export const WINDMILL: LandmarkDef = { // xh[1] (30922)
  id: `windmill`,
  name: `Windmill`,
  icon: `🌾`,
  tint: `#f3e3c3`,
  blurb: `A cream windmill on a breezy hilltop, sails turning lazily with every gust.`,
  hint: `A broad, bare hilltop exactly three levels high catches the best breeze. Who’d build there?`,
  priority: 45,
  max: 1,
  detect(ctx) {
    const found: { c: number; x: number; y: number; z: number; score: number }[] = [];
    for (const c of ctx.corners) {
      if (ctx.h(c) !== 3 || ctx.mat(c) !== `soil` || ctx.nbrs(c).some((n) => ctx.h(n) !== 3)) continue;
      const top = ctx.top(c);
      const y = ctx.flat(top.x, top.z, 0.62, 0.06);
      if (y === null) continue;
      const treeDist = nearestTreeDistance(ctx, top.x, top.z);
      if (treeDist < 1.6) continue;
      let score = cornersWithin(ctx, c, 2).filter((n) => ctx.h(n) === 3).length;
      if (ctx.nbrs(c).some((n) => isWildSpot(ctx, n)) || isWildSpot(ctx, c)) score -= 6;
      if (distanceToPeak(ctx, top.x, top.z) < 0.95) score -= 30;
      score += Math.min(treeDist, 4) * 0.15 + ctx.h01(c, 51) * 0.3;
      found.push({ c, x: top.x, y, z: top.z, score });
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, 4).map(
      (f): LandmarkPlacement => ({
        key: `windmill:${f.c}`,
        x: f.x,
        y: f.y,
        z: f.z,
        rotY: clearYaw(ctx, f.c, f.x, f.z),
        radius: 0.74,
        clear: 0.62,
      }),
    );
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(hashInts(seed, hashString(p.key), 14865));
    const kit = new MeshKit(rng);
    const glowKit = new MeshKit(rng);
    const cream = `#f3ead6`;
    const stone = PALETTE.stone;
    const cap = `#8f5f3d`;
    const green = `#7f9f68`;
    kit.cyl(0.6, 0.64, 0.26, 8, 0, -0.1, 0, stone, { rot: [0, OCT_YAW, 0], grad: 0.35 });
    kit.cyl(TOWER_TOP_R, TOWER_BOTTOM_R, TOWER_HEIGHT, 8, 0, TOWER_BASE_Y, 0, cream, { rot: [0, OCT_YAW, 0], grad: 0.22 });
    for (const y of [0.62, 1.1])
      kit.cyl(towerRadius(y + 0.03) + 0.012, towerRadius(y) + 0.012, 0.035, 8, 0, y, 0, shadeColor(cream, -0.07), {
        rot: [0, OCT_YAW, 0],
        grad: 0,
        ao: !1,
      });
    kit.cyl(0.41, 0.41, 0.08, 8, 0, 1.5599999999999998, 0, WOOD_DARK, { rot: [0, OCT_YAW, 0], grad: 0.1, ao: !1 });
    kit.lathe(
      [
        [0.001, 0],
        [0.44, 0],
        [0.45, 0.07],
        [0.41, 0.2],
        [0.31, 0.34],
        [0.16, 0.44],
        [0.001, 0.47],
      ],
      10,
      0,
      1.63,
      0,
      cap,
      { scale: [1, 1, 1.18], grad: 0.25, ao: !1 },
    );
    kit.box(0.07, 0.07, 1, 0, 2.08, 0, shadeColor(cap, -0.06), { ao: !1 });
    kit.blob(0.075, 0, 2.15, 0, WOOD_LIGHT, { ao: !1 });
    kit.cyl(0.065, 0.075, 0.34, 8, 0, HUB_Y, 0.26, WOOD_DARK, { rot: [Math.PI / 2, 0, 0], ao: !1, grad: 0 });
    // Tail pole and its wheel at the back.
    kit.beam(vec3(0, 1.71, -0.34), vec3(0, 0.34, -0.8), 0.07, 0.07, WOOD, { ao: !1, grad: 0.2 });
    kit.beam(vec3(-0.18, 0.7, -0.66), vec3(0, 1.68, -0.38), 0.045, 0.045, WOOD_DARK, { ao: !1 });
    kit.beam(vec3(0.18, 0.7, -0.66), vec3(0, 1.68, -0.38), 0.045, 0.045, WOOD_DARK, { ao: !1 });
    kit.beam(vec3(-0.2, 0.62, -0.68), vec3(0.2, 0.62, -0.68), 0.05, 0.05, WOOD_DARK, { ao: !1 });
    kit.cyl(0.12, 0.12, 0.05, 10, 0, 0.3, -0.8, WOOD_DARK, { rot: [0, 0, Math.PI / 2], ao: !1, grad: 0 });
    // Front door with its frame, step light and lamp.
    wallPanel(kit, 0, 0.38, 0.32, 0.46, 0.03, 0, WOOD_DARK);
    wallPanel(kit, 0, 0.37, 0.24, 0.4, 0.03, 0.02, green, { bevel: 0.012 });
    wallPanel(kit, 0, 0.59, 0.25, 0.05, 0.035, 0.02, shadeColor(green, -0.08));
    wallPanel(kit, 0, 0.36, 0.035, 0.035, 0.03, 0.05, `#e9b949`);
    wallPanel(glowKit, 0, 0.49, 0.1, 0.08, 0.02, 0.04, PALETTE.lanternGlow);
    wallPanel(kit, 0, 0.49, 0.12, 0.018, 0.02, 0.05, WOOD_DARK);
    {
      const yaw = 0.42;
      const wallR = (towerRadius(0.68) * Math.cos(OCT_YAW)) / Math.cos(yaw - (Math.PI / 4) * Math.round(yaw / (Math.PI / 4)));
      const bx = Math.sin(yaw) * (wallR + 0.02);
      const bz = Math.cos(yaw) * (wallR + 0.02);
      kit.beam(
        vec3(bx, 0.7300000000000001, bz),
        vec3(Math.sin(yaw) * (wallR + 0.11), 0.7300000000000001, Math.cos(yaw) * (wallR + 0.11)),
        0.02,
        0.02,
        `#4b4038`,
        { ao: !1 },
      );
      const lx = Math.sin(yaw) * (wallR + 0.12);
      const lz = Math.cos(yaw) * (wallR + 0.12);
      kit.cone(0.055, 0.05, 4, lx, 0.7000000000000001, lz, `#4b4038`, { rot: [0, Math.PI / 4, 0], ao: !1 });
      kit.box(0.075, 0.018, 0.075, lx, 0.5800000000000001, lz, `#4b4038`, { ao: !1 });
      glowKit.box(0.058, 0.09, 0.058, lx, 0.635, lz, PALETTE.lanternGlow, { ao: !1, grad: 0, jitter: 0 });
    }
    kit.box(0.42, 0.07, 0.2, 0, 0.1, towerRadius(0.1) * Math.cos(OCT_YAW) + 0.1, PALETTE.stoneLight, { bevel: 0.02 });
    // Windows: frame, lit pane, cross bars and a sill.
    const windows: [number, number][] = [
      [0, 1.08],
      [Math.PI / 2, 0.72],
      [-Math.PI / 2, 0.9],
      [Math.PI, 0.8],
    ];
    for (const [yaw, y] of windows) {
      wallPanel(kit, yaw, y, 0.27, 0.27, 0.03, 0, WOOD_DARK);
      wallPanel(glowKit, yaw, y, 0.2, 0.2, 0.02, 0.022, PALETTE.lanternGlow);
      wallPanel(kit, yaw, y, 0.026, 0.21, 0.02, 0.04, WOOD_DARK);
      wallPanel(kit, yaw, y, 0.21, 0.026, 0.02, 0.04, WOOD_DARK);
      wallPanel(kit, yaw, y + 0.16, 0.32, 0.05, 0.05, 0, `#9fb7c9`, { bevel: 0.012 });
    }
    wallPanel(kit, 0, 0.9, 0.3, 0.08, 0.09, 0.02, WOOD);
    for (let k = 0; k < 4; k++) {
      const x = -0.1 + k * 0.066;
      const color = k % 2 ? PALETTE.tulipPink : `#f4c430`;
      kit.blob(0.04, x, 0.97, towerRadius(0.97) * Math.cos(OCT_YAW) + 0.09, color, { detail: 0, ao: !1 });
    }
    // Grain sacks.
    const sack = `#dcc594`;
    for (const [x, z, s, yaw] of [
      [0.37, 0.4, 1, 0.3],
      [0.52, 0.22, 0.85, -0.4],
      [-0.4, 0.36, 0.8, 0.2],
    ]) {
      kit.blob(0.12 * s, x, 0.11 * s, z, sack, { scale: [1.05, 1, 0.9], smooth: !0, detail: 2, rot: [0, yaw, 0] });
      kit.blob(0.075 * s, x, 0.22 * s, z, shadeColor(sack, 0.03), { scale: [1, 0.8, 0.9], smooth: !0, detail: 1, ao: !1 });
      kit.cyl(0.03 * s, 0.04 * s, 0.05 * s, 7, x, 0.26 * s, z, `#b8995e`, { ao: !1 });
      kit.blob(0.04 * s, x, 0.32 * s, z, shadeColor(sack, 0.05), { scale: [1.2, 0.7, 1], smooth: !0, ao: !1 });
    }
    const towerMesh = landmarkMesh(kit.build(), mats.base);
    const glowMesh = landmarkMesh(glowKit.build(), mats.glow, !1);

    // Sails: four lattice arms with a canvas each, in the XY plane around the hub.
    const sailKit = new MeshKit(rng);
    const zUp = vec3(0, 0, 1);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      const along = vec3(Math.cos(a), Math.sin(a), 0);
      const across = vec3(-Math.sin(a), Math.cos(a), 0);
      const at = (s: number, t: number, z = 0) => along.clone().multiplyScalar(s).addScaledVector(across, t).setZ(z);
      sailKit.beam(at(0.05, 0), at(SAIL_LENGTH, 0), 0.075, 0.075, WOOD_DARK, { up: zUp, ao: !1, grad: 0 });
      const s0 = 0.3;
      const s1 = 1.22;
      const width = 0.36;
      sailKit.beam(at(s0, width), at(s1, width), 0.04, 0.045, WOOD_LIGHT, { up: zUp, ao: !1, grad: 0 });
      for (const t of [width * 0.36, width * 0.68])
        sailKit.beam(at(s0, t, -0.005), at(s1, t, -0.005), 0.022, 0.03, WOOD_LIGHT, { up: zUp, ao: !1, grad: 0 });
      for (let i = 0; i <= 8; i++) {
        const s = s0 + (0.9199999999999999 * i) / 8;
        sailKit.beam(at(s, -0.03), at(s, 0.38), 0.03, 0.036, WOOD_LIGHT, { up: zUp, ao: !1, grad: 0, extend: 0.005 });
      }
      const c = along
        .clone()
        .multiplyScalar(0.88)
        .addScaledVector(across, width / 2)
        .setZ(-0.028);
      sailKit.box(0.6599999999999999, 0.31, 0.014, c.x, c.y, c.z, `#f6eedd`, {
        rot: [0, 0, a],
        bevel: 0.004,
        ao: !1,
        grad: 0,
        jitter: 0.03,
      });
    }
    sailKit.cyl(0.11, 0.13, 0.12, 10, 0, 0, -0.06, WOOD_DARK, { rot: [Math.PI / 2, 0, 0], ao: !1, grad: 0 });
    sailKit.blob(0.075, 0, 0, 0.08, WOOD, { ao: !1 });
    const sailMesh = landmarkMesh(sailKit.build(), mats.base);
    const sails = new THREE.Group(); // _
    sails.position.set(0, HUB_Y, HUB_Z);
    sails.add(sailMesh);
    const body = new THREE.Group(); // v
    body.add(towerMesh, glowMesh, sails);
    const root = new THREE.Group();
    root.name = `lm-heights-windmill`;
    root.add(body);

    const squash = new Spring(210, 8); // b
    const chaff = new SparkPoints(48, !1); // x
    const sparkles = new Sparkles(28); // S
    const halo = glowSprite(2.4, 1.9, 1); // C
    halo.position.set(0, HUB_Y, 0.81);
    root.add(chaff.points, halo);
    sparkles.add(root);
    const flash = new Stopwatch(); // T
    let boost = 0; // E: extra sail speed
    let boostTarget = 0; // D
    let chaffLeft = 0; // O
    let chaffTimer = 0; // k
    const puff = (x: number, y: number, z: number, count: number, spread: number) => { // A
      for (let i = 0; i < count; i++) {
        const shade = 0.94 + Math.random() * 0.06;
        chaff.emit(
          x + (Math.random() - 0.5) * 0.1,
          y,
          z + (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * spread,
          0.15 + Math.random() * 0.3,
          (Math.random() - 0.3) * spread,
          1.3 + Math.random() * 0.9,
          0.13 + Math.random() * 0.12,
          shade,
          shade * 0.97,
          shade * 0.88,
          { a: 0.75, gravity: -0.05, drag: 1.3, grow: 2.6 },
        );
      }
    };
    let baseSpeed = 0.8; // j
    let angle = rng.next() * Math.PI * 2; // M
    return {
      object: root,
      dispose() {
        disposeMeshes(root);
        chaff.dispose();
        sparkles.dispose();
        disposeSprite(halo);
      },
      poke(poke) {
        const count = Math.min(3, poke.count);
        boostTarget = Math.min(boostTarget + 5 + count * 2.5, 15 + count * 2);
        chaffLeft = 1.2 + count * 0.6;
        squash.v = Math.max(-3.5, squash.v - (1.6 + count * 0.4));
        flash.start();
        puff(0, 2.13, 0, 6 + count * 2, 0.7);
        for (let i = 0; i < 4 + count * 4; i++) {
          const a = Math.random() * Math.PI * 2;
          sparkles.emit(
            Math.cos(a) * 0.2,
            HUB_Y + Math.sin(a) * 0.2,
            0.8600000000000001,
            Math.cos(a) * 0.8,
            Math.sin(a) * 0.8 + 0.3,
            0.3 + Math.random() * 0.4,
            0.7 + Math.random() * 0.4,
            0.1 + Math.random() * 0.06,
            1,
            0.82,
            0.4,
            { gravity: 0.8, drag: 1.5, twinkle: 0.5 },
          );
        }
        return !0;
      },
      update(ctx) {
        baseSpeed = damp(baseSpeed, 0.35 + 1.25 * ctx.wind, 0.8, ctx.dt);
        boostTarget *= Math.exp(-ctx.dt / (1.5 + (0.2 * Math.min(boostTarget, 12)) / 3));
        if (boostTarget < 0.02) boostTarget = 0;
        boost = damp(boost, boostTarget, boostTarget > boost ? 5 : 3, ctx.dt);
        angle += (baseSpeed + boost) * ctx.dt;
        sails.rotation.z = angle;
        if (chaffLeft > 0)
          for (chaffLeft -= ctx.dt, chaffTimer -= ctx.dt * Math.min(1.5, boost / 8); chaffTimer <= 0 && boost > 2; ) {
            chaffTimer += 0.07;
            const a = angle + 0.3 + Math.floor(Math.random() * 4) * (Math.PI / 2);
            const r = 0.5 + Math.random() * 0.7;
            puff(Math.cos(a) * r, HUB_Y + Math.sin(a) * r, 0.6200000000000001, 1, 0.3);
          }
        const s = squash.update(ctx.dt);
        body.scale.set(1 - s * 0.15, 1 + s * 0.35, 1 - s * 0.15);
        chaff.update(ctx.dt);
        sparkles.update(ctx.dt);
        flash.update(ctx.dt);
        const glow = envelope(flash.t, 0.05, 0.2);
        setGlowSprite(halo, 0.9 + 0.5 * glow, glow * 0.7);
      },
    };
  },
};
