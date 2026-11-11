// Ports index-BwioI7A7.js 29917-30343: the kite landmark (Ym) and its constants Um..Jm.
import * as THREE from 'three';
import { clamp, damp, dampAngle, easeInOutSine } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashInts, hashString } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import { Sparkles, Spinner, Spring, Stopwatch, hitCylinder, randomSign } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import {
  BASE_YAW,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  disposeMeshes,
  distanceToPeak,
  seededYaw,
  treeWithin,
  vec3,
} from './shared';

/** Kite colour sets: four sail panels, then the tail. */
const KITE_PALETTES = [ // Um (29917)
  [`#ef7aa0`, `#f4c430`, `#5fb3c4`, `#f28c38`, `#ef7aa0`],
  [`#e25b6f`, `#fbf0d9`, `#6f8fe0`, `#f4c430`, `#f4c430`],
  [`#9b87d4`, `#f6b8c8`, `#86bb5c`, `#f4c430`, `#e25b6f`],
];
const LINE_SEGMENTS = 22; // Wm (29922)
const LINE_SIDES = 3; // Gm (29923)
const LINE_RADIUS = 0.016; // Km (29924)
/** Top of the tether stake. */
const STAKE_TOP = vec3(0.05, 0.3, 0.02); // qm (29925)
const KITE_SCALE = 1.3; // Jm (29926)

export const KITE: LandmarkDef = { // Ym (29927)
  id: `kite`,
  name: `Kite`,
  icon: `🪁`,
  tint: `#f9d3dc`,
  blurb: `Someone left a kite tethered on the clifftop. It dips and soars all afternoon.`,
  hint: `On a spring or summer day, leave a grassy clifftop above the lake unplanted. Then look up!`,
  priority: 20,
  max: 1,
  detect(ctx) {
    const time = ctx.time;
    if ((time.season !== `spring` && time.season !== `summer`) || time.daylight < 0.55) return [];
    const regions = ctx
      .regions((c) => ctx.mat(c) === `soil` && !ctx.sown(c) && ctx.h(c) >= 2)
      .filter((r) => r.length >= 5)
      .map((r) => ({ r, edge: r.filter((c) => ctx.shore(c)) }))
      .filter((g) => g.edge.length >= 2)
      .sort((a, b) => b.r.length - a.r.length || Math.min(...a.r) - Math.min(...b.r));
    const out: LandmarkPlacement[] = [];
    for (const { r: region, edge } of regions) {
      const score = (c: number) => {
        const corner = ctx.grid.corners[c];
        let d = 1 / 0;
        for (const e of edge)
          d = Math.min(d, Math.hypot(ctx.grid.corners[e].x - corner.x, ctx.grid.corners[e].z - corner.z));
        return Math.abs(d - 1.3) + ctx.h01(c, 81) * 0.2;
      };
      const ranked = region.map((c) => ({ c, s: score(c) })).sort((a, b) => a.s - b.s || a.c - b.c);
      let taken = 0;
      for (const { c } of ranked) {
        const top = ctx.top(c);
        const y = ctx.flat(top.x, top.z, 0.42, 0.08);
        if (y === null || treeWithin(ctx, top.x, top.z, 0.95) || distanceToPeak(ctx, top.x, top.z) < 0.8) continue;
        out.push({ key: `kite:${c}`, x: top.x, y, z: top.z, rotY: seededYaw(ctx, c, 1.2), radius: 0.5, clear: 0.48 });
        if (++taken >= 4) break;
      }
      if (out.length >= 8) break;
    }
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(hashInts(seed, hashString(p.key), 24947));
    const colors = KITE_PALETTES[Math.floor(rng.next() * KITE_PALETTES.length)];
    const ground = new MeshKit(rng);
    const cell = 0.17;
    // Picnic blanket.
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        const bx = -0.1 - (3 * cell) / 2 + i * cell;
        const bz = 0.12 - (2 * cell) / 2 + j * cell;
        ground.box(
          0.17200000000000001,
          0.025,
          0.17200000000000001,
          bx,
          0.015,
          bz,
          (i + j) % 2 ? `#e2685f` : `#fbf0dc`,
          { bevel: 0.004, grad: 0, ao: !1, jitter: 0.03, rot: [0, 0, 0] },
        );
      }
    ground.box(0.2, 0.12, 0.14, -0.28, 0.09, 0.14, `#c99a5b`, { bevel: 0.02, grad: 0.2 });
    ground.beam(vec3(-0.36, 0.15, 0.14), vec3(-0.28, 0.25, 0.14), 0.02, 0.02, WOOD);
    ground.beam(vec3(-0.28, 0.25, 0.14), vec3(-0.2, 0.15, 0.14), 0.02, 0.02, WOOD);
    ground.blob(0.04, -0.25, 0.17, 0.12, PALETTE.apple, { detail: 0 });
    ground.box(0.06, 0.34, 0.06, STAKE_TOP.x, 0.13, STAKE_TOP.z, WOOD_DARK, { bevel: 0.012, grad: 0.3 });
    ground.cone(0.045, 0.06, 4, STAKE_TOP.x, 0.3, STAKE_TOP.z, WOOD_DARK, { rot: [0, Math.PI / 4, 0] });
    ground.ring(0.035, 0.012, 4, 8, STAKE_TOP.x, STAKE_TOP.y - 0.02, STAKE_TOP.z, `#f3ead8`, { ao: !1 });
    ground.cyl(0.075, 0.075, 0.03, 10, 0.2, 0.06, -0.1, WOOD_LIGHT, { rot: [Math.PI / 2, 0, 0.4] });
    ground.cyl(0.05, 0.05, 0.09, 10, 0.2, 0.06, -0.07, `#f3ead8`, { rot: [Math.PI / 2, 0, 0.4] });
    ground.blob(0.08, -0.05, 0.03, -0.25, PALETTE.stone, { scale: [1.2, 0.6, 1], detail: 0 });
    const groundMesh = landmarkMesh(ground.build(), mats.base);

    // Kite sail: a diamond of four panels, spars and a frame.
    const sail = new MeshKit(rng);
    const nose = [0, 0.62];
    const right = [0.44, 0.14];
    const tail = [0, -0.56];
    const left = [-0.44, 0.14];
    const mid = [0, 0.14];
    const yOff = -0.08;
    const zOff = -0.12;
    const panel = (pts: number[][], color: string) =>
      sail.tris(extrudePolygon(pts, 0.018), 0, yOff, zOff, color, { ao: !1, grad: 0.08, jitter: 0.03 });
    panel([nose, left, mid], colors[0]);
    panel([nose, mid, right], colors[1]);
    panel([left, tail, mid], colors[2]);
    panel([mid, tail, right], colors[3]);
    const spar = (pt: number[]) => vec3(pt[0], pt[1] + yOff, -0.13999999999999999);
    sail.beam(spar(nose), spar(tail), 0.03, 0.03, WOOD, { up: vec3(0, 0, 1), ao: !1, grad: 0 });
    sail.beam(spar(left), spar(right), 0.03, 0.03, WOOD, { up: vec3(0, 0, 1), ao: !1, grad: 0 });
    const rim = (pt: number[]) => vec3(pt[0], pt[1] + yOff, zOff);
    for (const [a, b] of [
      [nose, right],
      [right, tail],
      [tail, left],
      [left, nose],
    ])
      sail.beam(rim(a), rim(b), 0.03, 0.026, shadeColor(colors[1], -0.25), { up: vec3(0, 0, 1), ao: !1, grad: 0, extend: 0.01 });
    sail.beam(vec3(0, 0, 0), spar([0, 0.42]), 0.008, 0.008, `#6b5a4a`, { ao: !1 });
    sail.beam(vec3(0, 0, 0), spar([0, -0.3]), 0.008, 0.008, `#6b5a4a`, { ao: !1 });
    const sailGroup = new THREE.Group();
    sailGroup.add(landmarkMesh(sail.build(), mats.base));
    sailGroup.scale.setScalar(KITE_SCALE);
    /** Where the tail hangs from the sail (sail space). */
    const tailAnchor = vec3(0, tail[1] + yOff, zOff);

    // Tail ribbon (cloth material flutters along +x) with bows.
    const tailKit = new MeshKit(rng);
    const tailLen = 1.9;
    const sag = (x: number) => -0.1 * (x / tailLen) ** 2;
    for (let i = 0; i < 10; i++) {
      const x0 = (i / 10) * tailLen;
      const x1 = ((i + 1) / 10) * tailLen;
      const w0 = 0.035 * (1 - (0.4 * i) / 10);
      const w1 = 0.035 * (1 - (0.4 * (i + 1)) / 10);
      const color = shadeColor(colors[4], i % 2 ? 0.08 : 0);
      tailKit.tris(
        extrudePolygon(
          [
            [x0, sag(x0) + w0],
            [x0, sag(x0) - w0],
            [x1, sag(x1) - w1],
            [x1, sag(x1) + w1],
          ],
          0.01,
        ),
        0,
        0,
        0,
        color,
        { ao: !1, grad: 0, jitter: 0 },
      );
      tailKit.tris(
        extrudePolygon(
          [
            [x0, w0],
            [x0, -w0],
            [x1, -w1],
            [x1, w1],
          ],
          0.01,
        ),
        0,
        sag((x0 + x1) / 2),
        0,
        color,
        { rot: [Math.PI / 2, 0, 0], ao: !1, grad: 0, jitter: 0 },
      );
    }
    const bowColors = [colors[0], colors[1], colors[2], colors[3]];
    for (let i = 0; i < 4; i++) {
      const x = 0.35 + i * 0.42;
      const y = sag(x);
      const color = bowColors[i % 4];
      for (const roll of [0, Math.PI / 2]) {
        tailKit.tris(
          extrudePolygon(
            [
              [x, 0],
              [x - 0.07, 0.11],
              [x + 0.07, 0.11],
            ],
            0.012,
          ),
          0,
          y,
          0,
          color,
          { rot: [roll, 0, 0], ao: !1, grad: 0 },
        );
        tailKit.tris(
          extrudePolygon(
            [
              [x, 0],
              [x + 0.07, -0.11],
              [x - 0.07, -0.11],
            ],
            0.012,
          ),
          0,
          y,
          0,
          color,
          { rot: [roll, 0, 0], ao: !1, grad: 0 },
        );
      }
    }
    const tailGroup = new THREE.Group();
    tailGroup.add(landmarkMesh(tailKit.build(), mats.cloth, !1));
    tailGroup.scale.setScalar(KITE_SCALE);

    // Kite line: a thin 3-sided tube along a quadratic curve, rebuilt every frame.
    const linePos = new Float32Array(1188);
    const lineNor = new Float32Array(1188);
    const lineCol = new Float32Array(1188);
    const lineColor = new THREE.Color(`#6b5a4a`);
    for (let k = 0; k < 396; k++) {
      lineCol[k * 3] = lineColor.r;
      lineCol[k * 3 + 1] = lineColor.g;
      lineCol[k * 3 + 2] = lineColor.b;
    }
    const lineGeo = new THREE.BufferGeometry();
    const linePosAttr = new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage);
    const lineNorAttr = new THREE.BufferAttribute(lineNor, 3).setUsage(THREE.DynamicDrawUsage);
    lineGeo.setAttribute(`position`, linePosAttr);
    lineGeo.setAttribute(`normal`, lineNorAttr);
    lineGeo.setAttribute(`color`, new THREE.BufferAttribute(lineCol, 3));
    const line = landmarkMesh(lineGeo, mats.base, !1);
    line.frustumCulled = !1;
    line.raycast = () => void 0;
    line.receiveShadow = !1;

    const kite = new THREE.Group(); // L
    kite.add(sailGroup);
    const root = new THREE.Group();
    root.name = `lm-heights-kite`;
    root.add(groundMesh, kite, tailGroup, line, hitCylinder(0.5, 0.55, -0.05, 0, 0.05));

    const rotY = p.rotY ?? 0;
    const facingX = Math.cos(BASE_YAW + rotY); // z
    const facingZ = Math.sin(BASE_YAW + rotY); // te
    const phase = rng.next() * 10; // ne
    let wind = 0.6; // re
    let windAngle = 0; // B
    let first = !0; // ie
    const up = vec3(0, 1, 0); // ae
    const downwind = new THREE.Vector3(); // V
    const side = new THREE.Vector3(); // oe
    const ax = new THREE.Vector3(); // se
    const ay = new THREE.Vector3(); // ce
    const az = new THREE.Vector3(); // le
    const basis = new THREE.Matrix4(); // ue
    const tmp = new THREE.Vector3(); // de
    const anchor = STAKE_TOP.clone(); // fe
    const kitePos = new THREE.Vector3(); // pe
    const control = new THREE.Vector3(); // me
    const pa = new THREE.Vector3(); // he
    const pb = new THREE.Vector3(); // ge
    const tangent = new THREE.Vector3(); // _e
    const normal = new THREE.Vector3(); // ve
    const binormal = new THREE.Vector3(); // ye
    const dip = new Spring(22, 2.6); // be
    const sway = new Spring(16, 2.2); // xe
    const surge = new Spring(14, 2.4); // Se
    const roll = new Spring(34, 2.6); // Ce
    const spin = new Spinner(); // we
    const loop = new Stopwatch(); // Te
    let loopTime = 2.3; // Ee
    const sparkles = new Sparkles(48).add(root); // De
    const sparkColors = colors.slice(0, 4).map((c) => new THREE.Color(c)); // Oe
    const offset = new THREE.Vector3(); // ke
    const lastOffset = new THREE.Vector3(); // Ae
    const offsetVel = new THREE.Vector3(); // je
    const quat = new THREE.Quaternion(); // Me
    const zAxis = vec3(0, 0, 1); // Ne
    let trailTimer = 0; // Pe
    const burst = (count: number, speed: number) => { // Fe
      const at = kite.position;
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = Math.random() * 2 - 1;
        const c = sparkColors[k % sparkColors.length];
        sparkles.emit(
          at.x,
          at.y,
          at.z,
          Math.cos(a) * speed * (1 - Math.abs(v) * 0.3),
          v * speed,
          Math.sin(a) * speed * (1 - Math.abs(v) * 0.3),
          0.9 + Math.random() * 0.7,
          0.12 + Math.random() * 0.08,
          c.r,
          c.g,
          c.b,
          { gravity: 1.1, drag: 1.3, twinkle: 0.35 },
        );
      }
    };
    const ringPos = Array.from({ length: 69 }, () => new THREE.Vector3()); // Ie
    const ringNor = Array.from({ length: 69 }, () => new THREE.Vector3()); // H
    const curve = (t: number, out: THREE.Vector3) => { // Le: quadratic Bezier anchor -> control -> kite
      const u = 1 - t;
      return out
        .copy(anchor)
        .multiplyScalar(u * u)
        .addScaledVector(control, 2 * u * t)
        .addScaledVector(kitePos, t * t);
    };
    let cursor = 0; // Re
    const pushVertex = (seg: number, k: number) => { // ze
      const idx = seg * LINE_SIDES + (k % LINE_SIDES);
      const pv = ringPos[idx];
      const nv = ringNor[idx];
      linePos[cursor] = pv.x;
      linePos[cursor + 1] = pv.y;
      linePos[cursor + 2] = pv.z;
      lineNor[cursor] = nv.x;
      lineNor[cursor + 1] = nv.y;
      lineNor[cursor + 2] = nv.z;
      cursor += 3;
    };
    const rebuildLine = () => { // Be
      for (let i = 0; i <= LINE_SEGMENTS; i++) {
        const t = i / LINE_SEGMENTS;
        curve(Math.max(0, t - 0.01), pa);
        curve(Math.min(1, t + 0.01), pb);
        tangent.subVectors(pb, pa).normalize();
        normal.crossVectors(tangent, up);
        if (normal.lengthSq() < 1e-4) normal.set(1, 0, 0);
        normal.normalize();
        binormal.crossVectors(tangent, normal);
        curve(t, pa);
        for (let k = 0; k < LINE_SIDES; k++) {
          const a = (k / LINE_SIDES) * Math.PI * 2;
          const n = ringNor[i * LINE_SIDES + k].copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
          ringPos[i * LINE_SIDES + k].copy(pa).addScaledVector(n, LINE_RADIUS);
        }
      }
      cursor = 0;
      for (let i = 0; i < LINE_SEGMENTS; i++)
        for (let k = 0; k < LINE_SIDES; k++) {
          pushVertex(i, k);
          pushVertex(i + 1, k + 1);
          pushVertex(i + 1, k);
          pushVertex(i, k);
          pushVertex(i, k + 1);
          pushVertex(i + 1, k + 1);
        }
      linePosAttr.needsUpdate = !0;
      lineNorAttr.needsUpdate = !0;
    };
    return {
      object: root,
      dispose() {
        disposeMeshes(root);
        sparkles.dispose();
      },
      poke(poke) {
        const count = Math.min(3, poke.count);
        dip.v = clamp(dip.v - (5 + count * 1.2), -8.5, 8.5);
        sway.v = clamp(sway.v + randomSign() * (2.4 + count * 0.8), -5, 5);
        surge.v = clamp(surge.v + randomSign() * (1.5 + count * 0.6), -4, 4);
        roll.v = clamp(roll.v + randomSign() * (5 + count * 1.5), -12, 12);
        if (count === 2) spin.kick(randomSign() * 11);
        if (count >= 3 && !loop.on(loopTime * 0.6)) {
          loop.start();
          loopTime = 2.4;
          dip.v = clamp(dip.v - 1.5, -8.5, 8.5);
        }
        burst(8 + count * 4, 0.9 + count * 0.25);
        return !0;
      },
      update(ctx) {
        const target = Math.atan2(ctx.windDir.y, ctx.windDir.x) + rotY;
        if (first) {
          windAngle = target;
          wind = ctx.wind;
          first = !1;
        }
        wind = damp(wind, ctx.wind, 0.35, ctx.dt);
        windAngle = dampAngle(windAngle, target, 0.25, ctx.dt);
        downwind.set(Math.cos(windAngle), 0, Math.sin(windAngle));
        side.set(-downwind.z, 0, downwind.x);
        const t = ctx.realTime;
        const strength = clamp((wind - 0.3) / 0.8);
        const height = 5 + 3 * strength + 0.35 * Math.sin(t * 0.53 + phase) + 0.16 * Math.sin(t * 1.37 + phase) * (0.5 + wind);
        const reach = 3 + 1.1 * strength;
        const drift = 1.3 * Math.sin(t * 0.29 + phase) + 0.45 * Math.sin(t * 0.71 + phase * 2);
        const driftVel = 0.377 * Math.cos(t * 0.29 + phase) + 0.3195 * Math.cos(t * 0.71 + phase * 2);
        kite.position.copy(downwind).multiplyScalar(reach).addScaledVector(side, drift).setY(height);
        offset.set(0, 0, 0);
        offset.y += Math.max(-2.4, dip.update(ctx.dt));
        offset.addScaledVector(side, sway.update(ctx.dt));
        offset.addScaledVector(downwind, surge.update(ctx.dt));
        loop.update(ctx.dt);
        let loopAngle = 0;
        if (loop.t < loopTime) {
          loopAngle = easeInOutSine(loop.t / loopTime) * Math.PI * 2;
          offset.addScaledVector(downwind, 1.15 * Math.sin(loopAngle)).addScaledVector(up, 1.15 * (1 - Math.cos(loopAngle)));
        }
        kite.position.add(offset);
        if (ctx.dt > 0) offsetVel.subVectors(offset, lastOffset).multiplyScalar(1 / ctx.dt);
        lastOffset.copy(offset);
        const speed = offsetVel.length();
        // Sail orientation: face back along the line, tilted up, banking with the drift.
        az.copy(downwind)
          .multiplyScalar(-0.35)
          .addScaledVector(up, 0.45)
          .addScaledVector(side, -drift * 0.06);
        az.x += facingX * 0.75;
        az.z += facingZ * 0.75;
        az.normalize();
        ay.copy(up).addScaledVector(az, -az.y).normalize();
        ax.crossVectors(ay, az);
        const bank = -driftVel * 0.9 + 0.12 * Math.sin(t * 1.9 + phase);
        const cb = Math.cos(bank);
        const sb = Math.sin(bank);
        tmp.copy(ax).multiplyScalar(cb).addScaledVector(ay, sb);
        ay.multiplyScalar(cb).addScaledVector(ax, -sb);
        ax.copy(tmp);
        basis.makeBasis(ax, ay, az);
        sailGroup.quaternion.setFromRotationMatrix(basis);
        const spun = spin.update(ctx.dt, 1.3);
        if (roll.x !== 0 || spun !== 0) sailGroup.quaternion.multiply(quat.setFromAxisAngle(zAxis, roll.update(ctx.dt) * 0.35 + spun));
        else roll.update(ctx.dt);
        if (loopAngle > 0 && loopAngle < Math.PI * 2 - 0.001)
          sailGroup.quaternion.premultiply(quat.setFromAxisAngle(side, loopAngle));
        // Tail: hangs from the sail, streaming downwind and down, trailing the kite's motion.
        tmp.copy(tailAnchor).multiplyScalar(KITE_SCALE).applyQuaternion(sailGroup.quaternion);
        tailGroup.position.copy(kite.position).add(tmp);
        ax.copy(downwind)
          .multiplyScalar(0.6)
          .addScaledVector(up, -0.85)
          .addScaledVector(side, 0.25 * Math.sin(t * 0.9 + phase) - driftVel * 0.3);
        if (speed > 0.01) ax.addScaledVector(offsetVel, -0.22);
        ax.normalize();
        ay.crossVectors(side, ax);
        if (ay.lengthSq() < 1e-4) ay.set(0, 1, 0);
        ay.normalize();
        az.crossVectors(ax, ay);
        basis.makeBasis(ax, ay, az);
        tailGroup.quaternion.setFromRotationMatrix(basis);
        kitePos.copy(kite.position);
        const span = anchor.distanceTo(kitePos);
        control
          .addVectors(anchor, kitePos)
          .multiplyScalar(0.5)
          .addScaledVector(up, -span * (0.13 - 0.06 * strength))
          .addScaledVector(downwind, span * 0.05);
        rebuildLine();
        sparkles.update(ctx.dt);
        if (speed > 2.2)
          for (trailTimer -= ctx.dt; trailTimer <= 0; ) {
            trailTimer += 0.045;
            const c = sparkColors[(Math.random() * 4) | 0];
            const at = kite.position;
            sparkles.emit(
              at.x + (Math.random() - 0.5) * 0.4,
              at.y + (Math.random() - 0.5) * 0.5,
              at.z + (Math.random() - 0.5) * 0.4,
              (Math.random() - 0.5) * 0.4,
              -0.1 - Math.random() * 0.3,
              (Math.random() - 0.5) * 0.4,
              0.8 + Math.random() * 0.4,
              0.1 + Math.random() * 0.07,
              c.r,
              c.g,
              c.b,
              { gravity: 0.6, drag: 1.5, twinkle: 0.4 },
            );
          }
      },
    };
  },
};
