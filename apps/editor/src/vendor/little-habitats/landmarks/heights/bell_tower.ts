// Ports index-BwioI7A7.js 29715-29916: the bell tower landmark (Hm) and its constants Pm..Vm.
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashInts, hashString } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import { Sparkles, Spring, Stopwatch, disposeSprite, envelope, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { WOOD_DARK, bump, disposeMeshes, distanceToPeak, seededYaw } from './shared';

const PILLAR_OFFSET = 0.29; // Pm (29715)
const PILLAR_SIZE = 0.16; // Fm (29716)
const ARCH_RADIUS = PILLAR_OFFSET - PILLAR_SIZE / 2; // Im (29717)
const ARCH_Y = 0.5; // Lm (29718)
const ARCH_TOP = 0.84; // Rm (29719)
const ARCH_DEPTH = 0.12; // zm (29720)
const BELL_Y = 0.78; // Bm (29721)
/** Width (in day fractions) of the dawn, noon and dusk chime windows. */
const CHIME_WIDTH = 0.024; // Vm (29722)

export const BELL_TOWER: LandmarkDef = { // Hm (29723)
  id: `bell_tower`,
  name: `Bell tower`,
  icon: `🔔`,
  tint: `#e6dcc9`,
  blurb: `A little stone belfry whose bronze bell rings in the dawn, the noon and the dusk.`,
  hint: `Stack stone five levels high, well away from the lake. Listen at dawn, noon and dusk.`,
  priority: 50,
  max: 1,
  detect(ctx) {
    const found: { c: number; x: number; y: number; z: number; score: number }[] = [];
    for (const c of ctx.corners) {
      if (ctx.h(c) !== 5 || ctx.mat(c) !== `stone` || ctx.shore(c)) continue;
      const top = ctx.top(c);
      const y = ctx.flat(top.x, top.z, 0.3, 0.12);
      if (y === null) continue;
      let score = ctx.h01(c, 71);
      if (distanceToPeak(ctx, top.x, top.z) < 0.9) score -= 2;
      found.push({ c, x: top.x, y, z: top.z, score });
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, 3).map(
      (f): LandmarkPlacement => ({
        key: `bell_tower:${f.c}`,
        x: f.x,
        y: f.y,
        z: f.z,
        rotY: seededYaw(ctx, f.c, 0.4),
        radius: 0.56,
        clear: 0,
      }),
    );
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(hashInts(seed, hashString(p.key), 48657));
    const kit = new MeshKit(rng);
    const stoneLight = PALETTE.stoneLight;
    const stone = shadeColor(PALETTE.stone, -0.02);
    kit.box(0.86, 0.16, 0.86, 0, 0.020000000000000004, 0, stone, { bevel: 0.035, grad: 0.3 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        kit.box(PILLAR_SIZE, 0.74, PILLAR_SIZE, sx * PILLAR_OFFSET, 0.94 / 2, sz * PILLAR_OFFSET, stoneLight, {
          bevel: 0.025,
          grad: 0.25,
          ao: !1,
        });
        kit.box(0.2, 0.045, 0.2, sx * PILLAR_OFFSET, 0.48, sz * PILLAR_OFFSET, stone, { bevel: 0.012, ao: !1 });
      }
    // Arch: half circle from left to right; each side face fills the spandrels up to ARCH_TOP.
    const arc: number[][] = [];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI - (k / 10) * Math.PI;
      arc.push([ARCH_RADIUS * Math.cos(a), ARCH_Y + ARCH_RADIUS * Math.sin(a)]);
    }
    const topLeft = [-0.21099999999999997, ARCH_TOP];
    const topRight = [0.21099999999999997, ARCH_TOP];
    for (let side = 0; side < 4; side++) {
      const yaw = (side * Math.PI) / 2;
      const ox = Math.sin(yaw) * PILLAR_OFFSET;
      const oz = Math.cos(yaw) * PILLAR_OFFSET;
      const tri = (pts: number[][]) =>
        kit.tris(extrudePolygon(pts, ARCH_DEPTH), ox, 0, oz, stoneLight, { rot: [0, yaw, 0], ao: !1, grad: 0.1 });
      for (let k = 0; k < 5; k++) tri([topLeft, arc[k], arc[k + 1]]);
      for (let k = 5; k < 10; k++) tri([topRight, arc[k], arc[k + 1]]);
      tri([topLeft, arc[5], topRight]);
      const kx = Math.sin(yaw) * 0.3;
      const kz = Math.cos(yaw) * 0.3;
      kit.box(0.075, 0.1, 0.15, kx, 0.73, kz, stone, { rot: [0, yaw, 0], bevel: 0.015, ao: !1 });
    }
    kit.box(0.88, 0.09, 0.88, 0, 0.88, 0, stone, { bevel: 0.03, ao: !1, grad: 0.15 });
    kit.box(0.8, 0.05, 0.8, 0, 0.94, 0, stoneLight, { bevel: 0.015, ao: !1 });
    kit.cone(0.72, 0.8, 4, 0, 0.96, 0, `#6fa39a`, { rot: [0, Math.PI / 4, 0], grad: 0.3, ao: !1 });
    kit.cyl(0.018, 0.022, 0.2, 6, 0, 1.7, 0, `#b8863a`, { ao: !1, grad: 0 });
    kit.blob(0.06, 0, 1.8399999999999999, 0, PALETTE.autumnGold, { ao: !1 });
    kit.cone(0.022, 0.1, 6, 0, 1.88, 0, PALETTE.autumnGold, { ao: !1 });
    for (let k = 0; k < 4; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = 0.36 + rng.next() * 0.06;
      kit.blob(0.05 + rng.next() * 0.03, Math.cos(a) * r, 0.94, Math.sin(a) * r, PALETTE.leafDark, {
        scale: [1.3, 0.5, 1.1],
        detail: 0,
        ao: !1,
      });
    }
    kit.beam({ x: -0.29, y: BELL_Y, z: 0 }, { x: PILLAR_OFFSET, y: BELL_Y, z: 0 }, 0.04, 0.04, `#4b4038`, { ao: !1 });
    const tower = landmarkMesh(kit.build(), mats.base);

    const bellKit = new MeshKit(rng);
    bellKit.box(0.24, 0.07, 0.09, 0, -0.01, 0, WOOD_DARK, { bevel: 0.015, ao: !1 });
    bellKit.lathe(
      [
        [0.001, 0.25],
        [0.1, 0.22],
        [0.13, 0.08],
        [0.16, 0],
        [0.185, 0.018],
        [0.17, 0.07],
        [0.13, 0.17],
        [0.112, 0.26],
        [0.095, 0.31],
        [0.05, 0.335],
        [0.001, 0.34],
      ],
      12,
      0,
      -0.39,
      0,
      `#c9933f`,
      { grad: 0.35, ao: !1 },
    );
    bellKit.ring(0.172, 0.014, 4, 14, 0, -0.36, 0, `#e2b764`, { ao: !1, grad: 0 });
    bellKit.cyl(0.012, 0.012, 0.22, 5, 0, -0.33, 0, `#5a4630`, { ao: !1 });
    bellKit.blob(0.04, 0, -0.34, 0, `#8a6232`, { ao: !1 });
    const bell = new THREE.Group();
    bell.position.y = BELL_Y;
    bell.add(landmarkMesh(bellKit.build(), mats.base));

    const root = new THREE.Group();
    root.name = `lm-heights-bell`;
    root.add(tower, bell);

    let chime = 0; // m
    const swingFreq = 4.2; // h
    const swing = new Spring(swingFreq * swingFreq, 0.7); // g
    const squash = new Spring(260, 9); // _
    const flash = new Stopwatch(); // v
    const motes = new Sparkles(56); // y
    const halo = glowSprite(2.6, 1.7, 0.6); // b
    halo.position.set(0, 0.5800000000000001, 0);
    motes.add(root);
    root.add(halo);
    let ringLeft = 0; // x: seconds of pumped ringing left
    let ringAmp = 0.55; // S
    let lastVelSign = 0; // C
    let lastPosSign = 0; // T
    const emitMotes = (count: number, lift = 1) => { // E
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.22;
        const speed = 0.35 + Math.random() * 0.45;
        const warm = Math.random();
        motes.emit(
          Math.cos(a) * r,
          0.53,
          Math.sin(a) * r,
          Math.cos(a) * speed,
          (0.45 + Math.random() * 0.7) * lift,
          Math.sin(a) * speed,
          1 + Math.random() * 0.7,
          0.1 + Math.random() * 0.07,
          1,
          0.78 + warm * 0.15,
          0.3 + warm * 0.4,
          { gravity: -0.1, drag: 1.4, twinkle: 0.5, grow: 0.6 },
        );
      }
    };
    return {
      object: root,
      dispose() {
        disposeMeshes(root);
        motes.dispose();
        disposeSprite(halo);
      },
      poke(poke) {
        const count = Math.min(3, poke.count);
        ringLeft = Math.max(ringLeft, [0, 1.3, 2.3, 4.2][count]);
        ringAmp = 0.5 + count * 0.18;
        const dir = Math.abs(swing.v) > 0.3 ? Math.sign(swing.v) : Math.sign(swing.x) || 1;
        const maxV = swingFreq * (0.65 + 0.25 * count);
        swing.v = Math.max(-maxV, Math.min(maxV, swing.v + dir * (2.4 + count * 0.6)));
        squash.v = Math.min(2, squash.v + 0.9 + count * 0.3);
        flash.start();
        emitMotes(6 + count * 3);
        return !0;
      },
      update(ctx) {
        const day = ctx.time.dayFrac;
        const window = Math.max(bump(day - 0.25, CHIME_WIDTH), bump(day - 0.5, CHIME_WIDTH), bump(day - 0.75, CHIME_WIDTH));
        chime = damp(chime, window * 0.55, 1.6, ctx.dt);
        const t = ctx.realTime;
        swing.c = ringLeft > 0 ? 0.35 : 0.9;
        swing.update(ctx.dt);
        const velSign = Math.sign(swing.v);
        if (velSign !== 0 && velSign !== lastVelSign) {
          const amp = Math.abs(swing.x);
          if (lastVelSign !== 0 && amp > 0.22) {
            squash.v = Math.min(2, squash.v + 0.5 * Math.min(1, amp));
            emitMotes(Math.min(6, 2 + Math.round(amp * 4)));
            flash.t = Math.min(flash.t, 0.1);
          }
          lastVelSign = velSign;
        }
        const posSign = Math.sign(swing.x);
        if (posSign !== 0 && posSign !== lastPosSign) {
          if (ringLeft > 0 && lastPosSign !== 0)
            swing.v = Math.sign(swing.v) * Math.min(Math.abs(swing.v) + 0.9, ringAmp * swingFreq);
          lastPosSign = posSign;
        }
        ringLeft = Math.max(0, ringLeft - ctx.dt);
        bell.rotation.x = chime * Math.sin(t * 4.2) + 0.012 * ctx.wind * Math.sin(t * 1.3) + swing.x;
        tower.scale.y = 1 + squash.update(ctx.dt) * 0.2;
        motes.update(ctx.dt);
        flash.update(ctx.dt);
        const glow = envelope(flash.t, 0.05, 0.16) * Math.min(1, 0.4 + Math.abs(swing.x) * 1.4);
        setGlowSprite(halo, 0.85 + 0.25 * glow, glow);
      },
    };
  },
};
