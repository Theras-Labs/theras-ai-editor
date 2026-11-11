// Ports index-BwioI7A7.js 33201-33250 (constants Tg..jg, the hidden-lawn finder Mg) and the sundial entry inline in
// Ng (33255-33558).
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashString } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkDetectContext, LandmarkPlacement } from '../types';
import { KitFrame, TAU, smoothstep } from './shared';

const BRASS = `#c9a24e`; // Tg (33201)
const BRASS_DARK = `#8a6a35`; // Eg (33202)
const DIAL_RADIUS = 0.19; // Dg (33203)
const DIAL_Y = 0.585; // Og (33204)
/** Fixed sun azimuth (radians) that the gnomon is built to point along. */
const GNOMON_AZIMUTH = 0.6; // kg (33205)
const DIAL_SCALE = 1.3; // Ag (33206)
const DIAL_SPACING = 0.2; // jg (33207)

interface HiddenLawn {
  corners: number[];
  h: number;
}

/**
 * Small unsown soil patches (2 to 5 corners at one level) that are fenced in on every side by sown soil at the same
 * level (at least two such corners) or by higher ground.
 */
function hiddenLawns(ctx: LandmarkDetectContext): HiddenLawn[] { // Mg (33208)
  const out: HiddenLawn[] = [];
  const seen = new Set<number>();
  for (const start of ctx.corners) {
    if (seen.has(start) || ctx.mat(start) !== `soil` || ctx.sown(start)) continue;
    const h = ctx.h(start);
    const patch: number[] = [];
    const stack = [start];
    seen.add(start);
    let tooBig = !1;
    while (stack.length) {
      const c = stack.pop() as number;
      patch.push(c);
      if (patch.length > 5) tooBig = !0;
      for (const n of ctx.nbrs(c))
        if (!(seen.has(n) || ctx.rim(n) || ctx.mat(n) !== `soil` || ctx.sown(n) || ctx.h(n) !== h)) {
          seen.add(n);
          stack.push(n);
        }
    }
    if (tooBig || patch.length < 2) continue;
    const inPatch = new Set(patch);
    let flowers = 0;
    let enclosed = !0;
    for (const c of patch) {
      for (const n of ctx.nbrs(c)) {
        if (inPatch.has(n)) continue;
        if (ctx.rim(n) || !ctx.land(n)) {
          enclosed = !1;
          break;
        }
        const nh = ctx.h(n);
        if (!(nh > h)) {
          if (nh === h && ctx.mat(n) === `soil` && ctx.sown(n)) {
            flowers++;
            continue;
          }
          enclosed = !1;
          break;
        }
      }
      if (!enclosed) break;
    }
    if (enclosed && flowers >= 2) out.push({ corners: patch, h });
  }
  return out;
}

export const SUNDIAL: LandmarkDef = { // Ng[3] (33255)
  id: `sundial`,
  name: `Sundial`,
  icon: `🕰️`,
  tint: `#f3e3b8`,
  blurb: `A secret lawn hidden among the flowers, where an old sundial quietly keeps the hours.`,
  hint: `Hide a tiny lawn of a few grassy corners, completely enclosed by flower beds or higher ground.`,
  priority: 35,
  max: 1,
  detect(ctx) {
    const out: (LandmarkPlacement & { score: number })[] = [];
    const blockers = ctx.habitat.features.map((f) => ({
      x: f.x,
      z: f.z,
      r: f.type === `fence` || f.type === `bridge` ? 0.9 : 0.55,
    }));
    const blocked = (x: number, z: number, r: number) => blockers.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + r) ** 2);
    for (const lawn of hiddenLawns(ctx)) {
      const centre = ctx.centroid(lawn.corners);
      // Candidate spots: the centroid, every corner and the middle of every inner edge.
      const spots: { x: number; z: number }[] = [centre];
      const inLawn = new Set(lawn.corners);
      for (const c of lawn.corners) {
        const top = ctx.top(c);
        spots.push({ x: top.x, z: top.z });
        for (const n of ctx.nbrs(c)) {
          if (n <= c || !inLawn.has(n)) continue;
          const nt = ctx.top(n);
          spots.push({ x: (top.x + nt.x) / 2, z: (top.z + nt.z) / 2 });
        }
      }
      let spot: { x: number; z: number } | null = null;
      let spotY: number | null = null;
      let best = -1 / 0;
      for (const s of spots) {
        if (blocked(s.x, s.z, 0.24000000000000002)) continue;
        const y = ctx.flat(s.x, s.z, 0.42, 0.06);
        if (y === null) continue;
        let treeDist = 9;
        for (const tree of ctx.habitat.trees) treeDist = Math.min(treeDist, Math.hypot(tree.base.x - s.x, tree.base.z - s.z));
        const score = Math.min(treeDist, 1.2) - Math.hypot(s.x - centre.x, s.z - centre.z) * 0.15;
        if (score > best + 1e-6) {
          best = score;
          spot = { x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100 };
          spotY = y;
        }
      }
      if (!spot || spotY === null) continue;
      // Turn the front (local +z, where the stepping stones go) towards a lawn corner: prefer the +x+z direction,
      // a long run and a clear path.
      let faceScore = -1 / 0;
      let face = { x: 0.7071, z: 0.7071 };
      for (const c of lawn.corners) {
        const top = ctx.top(c);
        const dx = top.x - spot.x;
        const dz = top.z - spot.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) continue;
        const score = ((dx + dz) * 0.7071) / d + d * 0.2 - (blocked(spot.x + dx * 0.6, spot.z + dz * 0.6, 0.05) ? 3 : 0);
        if (score > faceScore) {
          faceScore = score;
          face = { x: dx / d, z: dz / d };
        }
      }
      const key = Math.min(...lawn.corners);
      out.push({
        key: `sundial:${key}`,
        x: spot.x,
        y: spotY,
        z: spot.z,
        rotY: Math.round(Math.atan2(face.x, face.z) * 100) / 100,
        radius: DIAL_SPACING,
        clear: 0.58,
        score: ctx.h01(key, 4504),
      });
    }
    out.sort((a, b) => a.score - b.score);
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(seed ^ hashString(p.key));
    const kit = new MeshKit(rng);
    const f = new KitFrame(kit);
    const rotY = p.rotY ?? 0; // o
    const stone = shadeColor(PALETTE.stoneLight, rng.range(-0.03, 0.02));
    // Base, moss, plinth, baluster, dial plate with hour marks.
    f.cyl(0.3, 0.33, 0.05, 9, 0, -0.02, 0, shadeColor(PALETTE.stone, 0.02), { grad: 0.3, yaw: rng.next() });
    for (let k = 0; k < 4; k++) {
      const a = rng.next() * TAU;
      f.blob(0.04 + rng.next() * 0.02, Math.sin(a) * 0.28, 0.03, Math.cos(a) * 0.28, `#6f9a4a`, {
        detail: 1,
        sc: [1.4, 0.35, 1.1],
      });
    }
    f.box(0.26, 0.07, 0.26, 0, 0.065, 0, stone, { bevel: 0.02, grad: 0.3 });
    f.lathe(
      [
        [0.001, 0],
        [0.1, 0],
        [0.1, 0.03],
        [0.07, 0.06],
        [0.055, 0.12],
        [0.075, 0.24],
        [0.058, 0.36],
        [0.05, 0.4],
        [0.08, 0.42],
        [0.001, 0.43],
      ],
      8,
      0,
      0.1,
      0,
      stone,
      { grad: 0.25 },
    );
    f.box(0.36, 0.055, 0.36, 0, 0.545, 0, stone, { bevel: 0.022, grad: 0.1, ao: !1 });
    f.cyl(DIAL_RADIUS, 0.198, 0.014, 24, 0, 0.571, 0, BRASS, { grad: 0.1, ao: !1 });
    f.ring(0.17, 0.005, 3, 24, 0, DIAL_Y, 0, BRASS_DARK, { grad: 0, ao: !1 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const major = k % 3 == 0;
      const r = DIAL_RADIUS - (major ? 0.05 : 0.04);
      f.box(0.012, 0.006, major ? 0.05 : 0.028, Math.sin(a) * r, 0.587, Math.cos(a) * r, BRASS_DARK, {
        yaw: a,
        bevel: 0.002,
        grad: 0,
        ao: !1,
      });
    }
    // Ivy up the baluster.
    const ivyStart = rng.next() * TAU;
    for (let k = 0; k < 7; k++) {
      const a = ivyStart + k * 0.5;
      const y = 0.12 + k * 0.055;
      const r = 0.07 + (k % 2) * 0.01;
      f.blob(0.03 + rng.next() * 0.012, Math.sin(a) * r, y, Math.cos(a) * r, k % 3 ? PALETTE.leaf : PALETTE.leafLight, {
        detail: 0,
        grad: 0.1,
        sc: [1, 0.7, 1],
      });
    }
    // Gnomon: a brass triangle, turned so that its shadow is right for the fixed azimuth.
    const gnomonYaw = Math.atan2(-Math.cos(GNOMON_AZIMUTH), -Math.sin(GNOMON_AZIMUTH)) - rotY; // l
    const gnomonKit = new MeshKit(rng); // u
    gnomonKit.addRaw(
      extrudePolygon(
        [
          [0, -0.07],
          [0, 0.12],
          [0.13, 0.12],
          [0.13, 0.1],
        ].map(([a, b]) => [b, a]),
        0.012,
      ),
      null,
      new THREE.Matrix4().makeRotationY(-Math.PI / 2),
      BRASS,
      { grad: 0.15, ao: !1 },
    );
    new KitFrame(gnomonKit).blob(0.016, 0, 0.012, -0.075, BRASS_DARK, { detail: 0, ao: !1 });
    // Stepping stones towards the front.
    let z = 0.42;
    for (let k = 0; k < 3; k++) {
      const r = 0.11 + rng.next() * 0.03;
      const x = (k % 2 ? 1 : -1) * rng.range(0.02, 0.07);
      f.cyl(r * 0.95, r, 0.2, 7, x, -0.18, z, shadeColor(PALETTE.stone, -0.08), { yaw: rng.next() * 3, grad: 0.4, ao: !1 });
      f.blob(r, x, 0.02, z, shadeColor(PALETTE.stone, rng.range(-0.04, 0.04)), {
        yaw: rng.next() * 3,
        sc: [1.05, 0.3, 0.9],
        grad: 0.1,
      });
      if (rng.chance(0.5)) f.blob(r * 0.35, x + r * 0.4, 0.05, z - r * 0.3, PALETTE.leafDark, { sc: [1.3, 0.35, 1], detail: 0 });
      z += r * 2 + 0.05;
    }
    // Daisies round about, kept off the path.
    for (let k = 0; k < 6; k++) {
      const a = rng.next() * TAU;
      const r = 0.36 + rng.next() * 0.12;
      const x = Math.sin(a) * r;
      const dz = Math.cos(a) * r;
      if (dz > 0.25 && Math.abs(x) < 0.2) continue;
      f.cyl(0.005, 0.006, 0.06, 4, x, 0, dz, PALETTE.leafDark, { grad: 0 });
      f.cyl(0.028, 0.028, 0.01, 7, x, 0.06, dz, PALETTE.daisy, { grad: 0, ao: !1 });
      f.cyl(0.011, 0.011, 0.014, 6, x, 0.062, dz, PALETTE.pollen, { grad: 0, ao: !1 });
    }
    const root = new THREE.Group(); // f
    root.scale.setScalar(DIAL_SCALE);
    root.add(landmarkMesh(kit.build(), mats.base));
    const gnomon = new THREE.Group(); // p
    gnomon.position.y = DIAL_Y;
    gnomon.rotation.y = gnomonYaw;
    const gnomonMesh = landmarkMesh(gnomonKit.build(), mats.base); // m
    gnomon.add(gnomonMesh);
    root.add(gnomon);
    // The live shadow: a thin wedge on the dial that follows the real sun.
    const shadowGeo = new THREE.BufferGeometry(); // h
    shadowGeo.setAttribute(
      `position`,
      new THREE.Float32BufferAttribute([-0.022, 0, 0, 0.022, 0, 0, 0.008, 0, 1, -0.022, 0, 0, 0.008, 0, 1, -0.008, 0, 1], 3),
    );
    const shadowMat = new THREE.MeshBasicMaterial({ // g
      color: `#4a4262`,
      transparent: !0,
      opacity: 0,
      depthWrite: !1,
      side: THREE.DoubleSide,
      polygonOffset: !0,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat); // _
    shadow.renderOrder = 3;
    const shadowPivot = new THREE.Group(); // v
    shadowPivot.position.y = 0.588;
    shadowPivot.add(shadow);
    root.add(shadowPivot);
    const hop = new Spring(150, 9); // y
    const squash = new Spring(180, 8); // b
    const tipX = new Spring(220, 3.2); // x
    const tipZ = new Spring(220, 3.2); // S
    const spin = new Spring(30, 9.5); // C: shadow spin offset
    const halo = glowSprite(2.6, 1.9, 0.7); // T
    halo.position.set(0, 0.645, 0);
    root.add(halo);
    const sparks = new SparkPoints(110, !0); // D
    root.add(sparks.points);
    let flash = 0; // O
    let chimeTime = 1 / 0; // k: time since the hour-mark ripple started, Infinity when idle
    let chimeIndex = 0; // A
    let chimeRepeats = 0; // j
    let ringTime = 1 / 0; // M: time until the next ring burst, Infinity when idle
    let ringsLeft = 0; // N
    let spinShadow = 0; // P
    const ringBurst = (r: number, n: number, up: number) => { // F
      const start = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        const a = start + (i / n) * TAU;
        sparks.emit(
          Math.sin(a) * r,
          0.6,
          Math.cos(a) * r,
          Math.sin(a) * 0.5,
          up,
          Math.cos(a) * 0.5,
          0.8 + Math.random() * 0.3,
          0.05 + Math.random() * 0.03,
          2.6,
          1.9,
          0.6,
          { gravity: 0.5, drag: 1.5, twinkle: 0.4 },
        );
      }
    };
    let sunShadow = 0; // I
    return {
      object: root,
      update(ctx) {
        const clock = ctx.time;
        const elevation = clock.sunElevation;
        const height = elevation > 0.42 ? elevation : 0.26 + 0.16 * smoothstep(0, 0.42, elevation);
        const length = Math.min(0.175, 0.12 / Math.tan(Math.max(0.2, height)));
        const dt = Math.min(ctx.dt, 0.05);
        const s = spin.update(dt);
        shadowPivot.rotation.y = Math.atan2(-Math.cos(clock.sunAzimuth), -Math.sin(clock.sunAzimuth)) - rotY + s;
        shadow.scale.set(1, 1, length * (1 + 0.25 * Math.min(1, Math.abs(s) / 3)));
        sunShadow = damp(sunShadow, 0.6 * smoothstep(0, 0.14, elevation) * clock.daylight, 3, ctx.dt);
        spinShadow = Math.min(0.55, Math.abs(s) * 0.5);
        const opacity = Math.max(sunShadow, spinShadow);
        shadowMat.opacity = opacity;
        shadow.visible = opacity > 0.01;
        gnomon.position.y = DIAL_Y + Math.max(0, hop.update(dt));
        const q = squash.update(dt);
        gnomon.scale.set(1 - q * 0.4, 1 + q, 1 - q * 0.4);
        gnomon.rotation.x = tipX.update(dt);
        gnomon.rotation.z = tipZ.update(dt);
        if (chimeTime !== 1 / 0) {
          for (chimeTime += dt; chimeIndex < 12 && chimeTime >= chimeIndex * 0.05; ) {
            const a = (chimeIndex / 12) * TAU;
            for (let k = 0; k < 2; k++)
              sparks.emit(
                Math.sin(a) * 0.15,
                0.595,
                Math.cos(a) * 0.15,
                (Math.random() - 0.5) * 0.06,
                0.3 + Math.random() * 0.25,
                (Math.random() - 0.5) * 0.06,
                0.6 + Math.random() * 0.4,
                0.045 + Math.random() * 0.03,
                2.7,
                2,
                0.7,
                { gravity: 0.15, drag: 1, twinkle: 0.5 },
              );
            chimeIndex++;
          }
          if (chimeIndex >= 12) {
            if (chimeRepeats > 1) {
              chimeRepeats--;
              chimeTime = 0;
              chimeIndex = 0;
            } else chimeTime = 1 / 0;
          }
        }
        if (ringTime !== 1 / 0)
          for (ringTime += dt; ringsLeft > 0 && ringTime >= 0; ) {
            ringBurst(DIAL_RADIUS * 0.6, 16, 0.25);
            ringsLeft--;
            ringTime -= 0.2;
            if (ringsLeft === 0) ringTime = 1 / 0;
          }
        flash *= Math.exp(-dt / 0.4);
        setGlowSprite(halo, 0.55 + flash * 0.5, flash * 0.5);
        sparks.update(dt);
      },
      poke(poke) {
        const count = Math.min(3, Math.max(1, poke.count));
        hop.kick(1.3 + 0.5 * count);
        squash.kick(-2.4 - 0.6 * count);
        tipX.kick((Math.random() - 0.5) * 3 + 1.8);
        tipZ.kick((Math.random() - 0.5) * 4);
        if (Math.abs(spin.x) < TAU * 2.2) spin.x += TAU * (count === 3 ? 2 : 1);
        flash = Math.min(2, flash + 0.8 + 0.3 * count);
        chimeTime = 0;
        chimeIndex = 0;
        chimeRepeats = count === 3 ? 2 : 1;
        ringTime = -0.08;
        ringsLeft = count === 1 ? 1 : count === 2 ? 2 : 3;
        return !0;
      },
      dispose() {
        disposeSprite(halo);
        sparks.dispose();
        gnomonMesh.geometry.dispose();
        (root.children[0] as THREE.Mesh).geometry.dispose();
        shadowGeo.dispose();
        shadowMat.dispose();
      },
    };
  },
};
