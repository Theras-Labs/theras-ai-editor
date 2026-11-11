// Ports bundle lines 34728-35101: the water wheel landmark (A_).
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { levelY } from '../../core/config';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { addCurveStream, SplashRing, v3, WATER_FX, WaterFxKit, waterFxMaterial } from './shared';

const WATER = `#9fdcd6`; // x_ (34728)
const FOAM = `#eef9f6`; // S_ (34729)
const ICE = `#dcecf2`; // C_ (34730)
const IRON = `#56504a`; // w_ (34731)
const WHEEL_R = 0.6; // T_ (34732)
const AXLE_Y = 0.6; // E_ (34733)
const WHEEL_Z = 0.36; // D_ (34734)
const WHEEL_HALF = 0.14; // O_ (34735)
const FLUME_Y = 1.3; // k_ (34736)

/** Wheel-footprint points (lateral, outward) that must be open water. */
const WATER_SPOTS: [number, number][] = [
  [0, WHEEL_Z],
  [0.38, WHEEL_Z],
  [-0.38, WHEEL_Z],
  [0, 0.58],
  [0, 0.21999999999999997],
];
/** Points around the wheel that must be low (height <= 0.3). */
const LOW_SPOTS: [number, number][] = [
  [0.62, WHEEL_Z],
  [-0.62, WHEEL_Z],
  [0.5, 0.5],
  [-0.5, 0.5],
  [0.5, 0.21999999999999997],
  [-0.5, 0.21999999999999997],
  [0.36, 0.63],
  [-0.36, 0.63],
  [0, 0.63],
];
/** Points behind the wheel that must be on the cliff (height > levelY(3) - 0.15). */
const CLIFF_SPOTS: [number, number][] = [
  [0, -0.15],
  [-0.22, -0.15],
  [-0.22, -0.42],
];

export const WATER_WHEEL: LandmarkDef = { // A_ (34737)
  id: `water_wheel`,
  name: `Water wheel`,
  icon: `🎡`,
  tint: `#d7e6c8`,
  blurb: `A creaky wooden water wheel turning patiently below the cliff. Splish, splosh.`,
  hint: `Build a sheer cliff, three levels or more, rising straight out of the water.`,
  priority: 35,
  max: 2,
  detect(ctx) {
    const terrain = ctx.game.terrain,
      pondSize = new Map<number, number>();
    for (const pond of ctx.ponds) pondSize.set(pond.id, pond.corners.length);
    const features = ctx.habitat.features,
      openWater = (x: number, z: number) => terrain.surfaceAt(x, z) === `water` && terrain.heightAt(x, z) <= 0.02,
      pairs: { w: number; l: number; score: number }[] = [];
    for (const c of ctx.corners) {
      if (!ctx.water(c)) continue;
      const pond = ctx.pond(c);
      if (!(!ctx.lake(c) && (pond < 0 || (pondSize.get(pond) ?? 0) < 2)))
        for (const n of ctx.nbrs(c)) {
          const h = ctx.h(n);
          if (h < 3 || ctx.rim(n) || (ctx.mat(n) === `stone` && h >= 4 && ctx.shore(n))) continue;
          pairs.push({ w: c, l: n, score: h + ctx.h01(c, n, 17) });
        }
    }
    pairs.sort((a, b) => b.score - a.score);
    const cliffOf = new Map<number, number>();
    if (pairs.length) ctx.regions((c) => ctx.h(c) >= 3).forEach((r, i) => r.forEach((c) => cliffOf.set(c, i)));
    const out: LandmarkPlacement[] = [],
      usedCliffs = new Set<number>();
    for (const { w, l } of pairs) {
      if (out.length >= 3) break;
      const cliff = cliffOf.get(l) ?? -1;
      if (usedCliffs.has(cliff)) continue;
      const land = ctx.top(l),
        water = ctx.top(w),
        topY = levelY(ctx.h(l)),
        dropY = topY - 0.3,
        toWater = Math.atan2(water.z - land.z, water.x - land.x),
        /** Distance along angle a from (x, z) to where the ground first falls below dropY, or null. */
        edge = (x: number, z: number, a: number): number | null => {
          const c = Math.cos(a),
            s = Math.sin(a);
          for (let r = 0.1; r <= 1.1; r += 0.03) if (terrain.heightAt(x + c * r, z + s * r) < dropY) return r;
          return null;
        };
      let best: { a: number; t: number } | null = null;
      for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75]) {
        const t = edge(land.x, land.z, toWater + da);
        if (t !== null && (!best || t < best.t - 0.02)) best = { a: toWater + da, t };
      }
      if (!best) continue;
      const fx = Math.cos(best.a),
        fz = Math.sin(best.a);
      let found: LandmarkPlacement | null = null;
      search: for (const off of [0, 0.2, -0.2, 0.38, -0.38]) {
        const sx = land.x + fz * off,
          sz = land.z - fx * off,
          t = edge(sx, sz, best.a);
        if (t === null) continue;
        const cx = sx + fx * (t - 0.02),
          cz = sz + fz * (t - 0.02);
        for (const m of [1, -1]) {
          const at = (u: number, v: number): [number, number] => [cx + fz * u * m + fx * v, cz - fx * u * m + fz * v];
          if (
            !WATER_SPOTS.every(([u, v]) => openWater(...at(u, v))) ||
            !LOW_SPOTS.every(([u, v]) => terrain.heightAt(...at(u, v)) <= 0.3) ||
            !CLIFF_SPOTS.every(([u, v]) => terrain.heightAt(...at(u, v)) > levelY(3) - 0.15)
          )
            continue;
          const [wx, wz] = at(0, WHEEL_Z);
          if (!features.some((f) => (f.x - wx) ** 2 + (f.z - wz) ** 2 < 0.8 ** 2)) {
            found = {
              key: `water_wheel:${w}:${l}`,
              x: cx,
              y: 0,
              z: cz,
              rotY: Math.atan2(fx, fz),
              radius: 0.5,
              clear: 0.85,
              data: { top: Math.round((topY - 0.02) * 100) / 100, m },
            };
            break search;
          }
        }
      }
      if (found) {
        usedCliffs.add(cliff);
        out.push(found);
      }
    }
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials(),
      rng = new Rng(seed ^ 14974),
      top = p.data?.top ?? 1.25,
      wood = PALETTE.wood,
      dark = PALETTE.woodDark,
      light = PALETTE.woodLight,
      frame = new MeshKit(rng);
    // Axle bearing on the cliff, A-frame trestle in the water, flume and its outlet.
    frame.box(0.28, 0.28, 0.14, 0, AXLE_Y, 0.02, dark, { bevel: 0.03, ao: false });
    frame.box(0.34, 0.07, 0.18, 0, 0.42999999999999994, 0.03, PALETTE.stoneDark, { bevel: 0.02, ao: false });
    const legZ = 0.63;
    for (const s of [-1, 1])
      frame.beam(v3(s * 0.36, -0.8, legZ), v3(s * 0.04, 0.6599999999999999, legZ), 0.08, 0.08, dark, { ao: false, extend: 0.03 });
    frame.box(0.62, 0.07, 0.07, 0, 0.12, legZ, dark, { ao: false, bevel: 0.015 });
    frame.box(0.16, 0.16, 0.12, 0, AXLE_Y, legZ, wood, { bevel: 0.025, ao: false });
    const fx = -0.22,
      fy = FLUME_Y;
    frame.box(0.24, 0.04, 0.88, fx, fy, -0.12 / 2, light, { ao: false, bevel: 0.01 });
    for (const s of [-1, 1]) frame.box(0.035, 0.11, 0.88, fx + s * 0.12, 1.345, -0.12 / 2, wood, { ao: false, bevel: 0.01 });
    frame.box(0.28, 0.1, 0.05, fx, 1.32, -0.15000000000000002, dark, { ao: false, bevel: 0.01 });
    frame.beam(v3(fx, 1.27, 0.3), v3(fx, 0.8, 0), 0.05, 0.05, dark, { ao: false, extend: 0.02 });
    if (top > 1.5) {
      frame.box(0.36, 0.3, 0.2, fx, 1.42, -0.02, PALETTE.stoneDark, { bevel: 0.04, ao: false });
      frame.box(0.18, 0.1, 0.1, fx, 1.4000000000000001, 0.06, `#3f5f5f`, { bevel: 0.02, ao: false, grad: 0 });
    } else {
      frame.blob(0.08, -0.04000000000000001, top + 0.03, -0.16, PALETTE.stone, { scale: [1.2, 0.7, 1], detail: 0 });
      frame.blob(0.07, -0.4, top + 0.03, -0.24, PALETTE.stone, { scale: [1.2, 0.7, 1], detail: 0 });
    }

    // The wheel: two rims with spokes, twelve paddles, hub and axle.
    const wheelKit = new MeshKit(rng);
    for (const s of [-1, 1]) {
      const z = s * WHEEL_HALF;
      wheelKit.ring(0.57, 0.04, 4, 20, 0, 0, z, dark, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
      wheelKit.ring(WHEEL_R * 0.45, 0.025, 4, 14, 0, 0, z, dark, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + (s > 0 ? 0 : Math.PI / 8);
        wheelKit.beam(
          v3(0, 0, z),
          v3(Math.cos(a) * 0.5599999999999999, Math.sin(a) * 0.5599999999999999, z),
          0.045,
          0.045,
          wood,
          { ao: false, extend: 0.01 },
        );
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      wheelKit.box(0.2, 0.035, 0.32, Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0, i % 2 ? light : shadeColor(light, -0.05), {
        rot: [0, 0, a],
        ao: false,
        bevel: 0.008,
        grad: 0,
      });
      const b = a + 0.2;
      wheelKit.box(0.09, 0.03, 0.32, Math.cos(b) * 0.585, Math.sin(b) * 0.585, 0, wood, {
        rot: [0, 0, b + Math.PI / 2],
        ao: false,
        bevel: 0.006,
        grad: 0,
      });
    }
    wheelKit.cyl(0.1, 0.1, 0.34, 10, 0, 0, -0.17, dark, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
    wheelKit.cyl(0.045, 0.045, 0.78, 8, 0, 0, -0.36 + 0.02, IRON, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
    for (const s of [-1, 1]) wheelKit.ring(0.1, 0.018, 3, 10, 0, 0, s * 0.17, IRON, { rot: [Math.PI / 2, 0, 0], ao: false });
    const wheel = landmarkMesh(wheelKit.build(), mats.base);
    wheel.position.set(0, AXLE_Y, WHEEL_Z);

    // Flowing water: flume sheet, the spill onto the wheel, the tail race, ripples, hops and foam.
    const flow = new WaterFxKit(rng);
    flow.part(WATER_FX.STILL, 0, (k) =>
      k.box(0.2, 0.03, 0.83, fx, 1.335, -0.12 / 2 - 0.02, WATER, { ao: false, grad: 0, jitter: 0, bevel: 0.005 }),
    );
    flow.part(WATER_FX.FALL, 0, (k) =>
      addCurveStream(k, v3(fx, 1.335, 0.35), v3(-0.24, 1.32, 0.44), v3(-0.35, 1.1, WHEEL_Z), 0.17, 0.15, 0.045, WATER, 6),
    );
    flow.part(WATER_FX.FALL, 0, (k) =>
      addCurveStream(
        k,
        v3(-0.6 + 0.16, 0.8999999999999999, WHEEL_Z),
        v3(-0.74, 0.62, WHEEL_Z),
        v3(-0.54, 0.02, WHEEL_Z),
        0.05,
        0.06,
        0.24,
        WATER,
        8,
      ),
    );
    const ripples = [
      [-0.5, WHEEL_Z, 0],
      [-0.2, 0.41, 0.3],
      [0.15, 0.31, 0.6],
      [-0.58, 0.56, 0.8],
    ];
    for (const [x, z, phase] of ripples)
      flow.part(WATER_FX.RIPPLE, phase, (k) =>
        k.ring(0.28, 0.014, 3, 16, x, 0.02, z, FOAM, {
          ao: false,
          grad: 0,
          jitter: 0,
          center: [x, 0.02, z],
          scale: [1, 0.5, 1],
        }),
      );
    for (let i = 0; i < 7; i++) {
      const x = -0.6 + 0.05 + rng.next() * 0.75,
        z = WHEEL_Z + (rng.next() - 0.5) * 0.4;
      flow.part(WATER_FX.HOP, rng.next(), (k) =>
        k.blob(0.035 + rng.next() * 0.02, x, 0.03, z, FOAM, { ao: false, grad: 0, pivot: true, detail: 0 }),
      );
    }
    for (let i = 0; i < 4; i++) {
      const x = -0.6 + 0.05 + i * 0.22;
      flow.part(WATER_FX.BUBBLE, i * 0.27, (k) =>
        k.blob(0.08, x, 0, WHEEL_Z + (i % 2 ? 0.12 : -0.1), FOAM, {
          ao: false,
          grad: 0,
          pivot: true,
          scale: [1.3, 0.35, 1],
          detail: 1,
        }),
      );
    }

    // Frozen version: ice sheet and icicles under the flume and the bearing.
    const ice = new MeshKit(rng);
    ice.box(0.2, 0.035, 0.83, fx, 1.335, -0.12 / 2 - 0.02, ICE, { ao: false, grad: 0, jitter: 0, bevel: 0.005 });
    for (let i = 0; i < 6; i++) {
      const len = 0.1 + rng.next() * 0.16;
      ice.cone(0.022, len, 4, -0.32 + i * 0.04, 1.28, 0.36, ICE, { rot: [Math.PI, 0, 0], ao: false, grad: 0 });
    }
    for (let i = 0; i < 4; i++) {
      const len = 0.08 + rng.next() * 0.1;
      ice.cone(0.02, len, 4, -0.1 + i * 0.065, 0.45999999999999996, 0.1, ICE, { rot: [Math.PI, 0, 0], ao: false, grad: 0 });
    }
    const iceMesh = landmarkMesh(ice.build(), mats.base, false);
    iceMesh.visible = false;

    const root = new THREE.Group();
    if ((p.data?.m ?? 1) < 0) root.scale.x = -1;
    root.add(landmarkMesh(frame.build(), mats.base));
    root.add(wheel);
    const flowMesh = landmarkMesh(flow.build(), waterFxMaterial(), false);
    flowMesh.renderOrder = 1;
    root.add(flowMesh);
    root.add(iceMesh);

    let speed = 0.55; // b: idle turn speed
    const drops = new SparkPoints(64, false),
      sparks = new SparkPoints(32, true),
      ring = new SplashRing(),
      ring2 = new SplashRing();
    root.add(drops.points, sparks.points, ring.mesh, ring2.mesh);
    const tilt = new Spring(170, 9),
      jolt = new Spring(140, 8);
    let angle = 0, // O
      boost = 0, // k
      dropAcc = 0, // A
      frozen = false, // j
      ring2Delay = -1; // M
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05);
        frozen = ctx.time.snow > 0.45;
        speed = damp(speed, frozen ? 0 : 0.55, 1.2, dt);
        boost *= Math.exp(-dt / 1);
        if (boost < 0.01) boost = 0;
        angle = (angle + dt * (speed + boost)) % (Math.PI * 2);
        wheel.rotation.z = angle + jolt.update(dt);
        wheel.rotation.x = tilt.update(dt);
        flowMesh.visible = !frozen;
        iceMesh.visible = frozen;
        if (boost > 0.5 && !frozen)
          for (dropAcc += dt * (6 + boost * 11); dropAcc >= 1; ) {
            --dropAcc;
            const a = -Math.PI / 2 + 0.05 + Math.random() * 0.75,
              c = Math.cos(a),
              s = Math.sin(a),
              v = Math.min(2.6, 0.5 + boost * 0.28),
              j = 0.7 + Math.random() * 0.6;
            drops.emit(
              c * 0.57,
              AXLE_Y + s * 0.57 + 0.02,
              WHEEL_Z + (Math.random() - 0.5) * WHEEL_HALF * 2.2,
              -s * v * j + c * 0.15,
              c * v * j * 0.9 + 0.5 + Math.random() * 0.6,
              (Math.random() - 0.5) * 0.35,
              0.5 + Math.random() * 0.4,
              0.038 + Math.random() * 0.03,
              0.88,
              0.97,
              1,
              { gravity: 6.2, drag: 0.15, a: 0.95 },
            );
          }
        if (ring2Delay >= 0) {
          ring2Delay -= dt;
          if (ring2Delay < 0) ring2.start(0.3, 0.03, 0.39999999999999997, 0.12, 0.5, 1, 0.7);
        }
        ring.update(dt);
        ring2.update(dt);
        drops.update(dt);
        sparks.update(dt);
      },
      poke(poke) {
        const n = Math.min(3, Math.max(1, poke.count));
        if (frozen) {
          jolt.kick((Math.random() < 0.5 ? -1 : 1) * (1.4 + n * 0.5));
          tilt.kick(0.4 + n * 0.3);
          const count = 8 + n * 6;
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2,
              r = 0.1 + Math.random() * 0.44999999999999996;
            drops.emit(
              Math.cos(a) * r,
              AXLE_Y + Math.sin(a) * r,
              WHEEL_Z + (Math.random() - 0.5) * 0.3,
              0,
              -0.1 - Math.random() * 0.25,
              0,
              0.8 + Math.random() * 0.6,
              0.06,
              0.5,
              0.78,
              1,
              { gravity: 0.3, drag: 0.6, twinkle: 0.6 },
            );
          }
          return true;
        }
        boost = Math.min(11, boost + (n === 1 ? 3.4 : n === 2 ? 5.2 : 8));
        tilt.kick((Math.random() < 0.5 ? -1 : 1) * (0.5 + n * 0.35));
        ring.start(-0.05, 0.03, WHEEL_Z, 0.1, 0.55, 1, 0.8);
        if (n > 1) ring2Delay = 0.16;
        for (let i = 0; i < 6 + n * 3; i++) {
          const a = Math.random() * Math.PI * 2,
            sp = 0.15 + Math.random() * 0.4;
          drops.emit(
            -0.05 + Math.cos(a) * 0.2,
            0.04,
            WHEEL_Z + Math.sin(a) * 0.15,
            Math.cos(a) * sp,
            1.3 + Math.random() * 1.2,
            Math.sin(a) * sp,
            0.55 + Math.random() * 0.4,
            0.045 + Math.random() * 0.03,
            0.9,
            0.98,
            1,
            { gravity: 6, drag: 0.2, a: 0.95 },
          );
        }
        return true;
      },
      dispose() {
        root.traverse((o) => {
          if (o instanceof THREE.Mesh && o !== ring.mesh && o !== ring2.mesh) o.geometry.dispose();
        });
        drops.dispose();
        sparks.dispose();
        ring.dispose();
        ring2.dispose();
      },
    };
  },
};
