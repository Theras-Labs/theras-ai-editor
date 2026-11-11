// Ports index-BwioI7A7.js 27804-28072: the maypole (Op) and its constants (xp..Dp).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { TRIM, gardenMaterials, kick, nearestTreeDist, placementSeed, pokeDirLocal, rgb, vec3 } from './shared';

const POLE_H = 2.35; // xp (27804)
const RIBBON_COLORS = [
  PALETTE.rose,
  PALETTE.autumnGold,
  PALETTE.bluebell,
  PALETTE.leafLight,
  PALETTE.lavender,
  PALETTE.tulipOrange,
  PALETTE.blossom,
  `#7fcfc9`,
]; // Sp (27805)
const PETAL_RGB = [
  PALETTE.blossom,
  PALETTE.blossomLight,
  PALETTE.daisy,
  PALETTE.tulipPink,
  PALETTE.lavender,
  PALETTE.sunflower,
  PALETTE.blossom,
].map(rgb); // Cp (27806)
const SPARK_RGB = rgb(`#ffd98a`); // wp (27807)
const pokeDir = { x: 0, z: 0 }; // Tp (27808)
const SPRING_WINDOW = [0.02, 0.24]; // Ep (27809)
const BED_SIZE = [5, 9]; // Dp (27810)

export const MAYPOLE: LandmarkDef = { // Op (27811)
  id: `maypole`,
  name: `Maypole`,
  icon: `🎀`,
  tint: `#f6d5e0`,
  blurb: `Ribbons, a crown of blossoms and a pole to dance around: spring has properly arrived.`,
  hint: `In spring, sow a small round flower bed on open, dry ground. Its heart is the spot for a dance.`,
  priority: 35,
  max: 1,
  detect(ctx) {
    const year = ctx.time.yearFrac;
    if (year < SPRING_WINDOW[0] || year > SPRING_WINDOW[1]) return [];
    const found: { p: LandmarkPlacement; s: number }[] = [];
    for (const region of ctx.regions((c) => ctx.mat(c) === `soil` && ctx.sown(c))) {
      if (
        region.length < BED_SIZE[0] ||
        region.length > BED_SIZE[1] ||
        region.some((c) => ctx.nbrs(c).some((n) => ctx.water(n)))
      )
        continue;
      const inside = new Set(region);
      const mid = ctx.centroid(region);
      let best = -1;
      let bestScore = -1 / 0;
      let bestY = 0;
      for (const c of region) {
        const h = ctx.h(c);
        if (!ctx.nbrs(c).every((n) => inside.has(n) && ctx.h(n) === h)) continue;
        const top = ctx.top(c);
        if (nearestTreeDist(ctx, top.x, top.z) < 1.35) continue;
        const y = ctx.flat(top.x, top.z, 0.3, 0.05);
        if (y === null) continue;
        const score = -Math.hypot(top.x - mid.x, top.z - mid.z) + ctx.h01(c, 602) * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = c;
          bestY = y;
        }
      }
      if (best < 0) continue;
      const top = ctx.top(best);
      found.push({
        p: {
          key: `maypole:${best}`,
          x: top.x,
          y: bestY,
          z: top.z,
          rotY: ctx.h01(best, 601) * Math.PI * 2,
          radius: 0.6,
          clear: 0.34,
        },
        s: region.length + ctx.h01(best, 603),
      });
    }
    return found.sort((a, b) => b.s - a.s).map((f) => f.p);
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const garden = gardenMaterials();
    const rng = new Rng(placementSeed(seed, p, 935));
    const pole = new MeshKit(rng);
    const radiusAt = (h: number): number => 0.066 - (h / POLE_H) * 0.02;
    pole.cyl(0.1, 0.12, 0.09, 10, 0, 0, 0, PALETTE.woodDark, { grad: 0.3 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.next() * 0.4;
      pole.blob(
        0.045 + rng.next() * 0.02,
        Math.cos(a) * 0.19,
        0.02,
        Math.sin(a) * 0.19,
        shadeColor(PALETTE.stoneLight, (rng.next() - 0.5) * 0.08),
        { scale: [1.2, 0.6, 1], detail: 0 },
      );
    }
    pole.cyl(radiusAt(POLE_H), radiusAt(0), POLE_H, 10, 0, 0, 0, TRIM, { grad: 0.15 });
    for (const [start, color] of [
      [0, `#d9574a`],
      [Math.PI, `#6fa35a`],
    ] as const) {
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= 90; i++) {
        const t = i / 90;
        const y = 0.12 + 2.03 * t;
        const a = start + t * 6.5 * Math.PI * 2;
        const r = radiusAt(y) + 0.003;
        const at = vec3(Math.cos(a) * r, y, Math.sin(a) * r);
        if (prev) {
          const m = prev.clone().add(at).multiplyScalar(0.5);
          pole.beam(prev, at, 0.045, 0.01, color, { up: vec3(m.x, 0, m.z), ao: false, extend: 0.004, bevel: 0.003, grad: 0 });
        }
        prev = at;
      }
    }
    pole.ring(0.18, 0.03, 5, 18, 0, 2.23, 0, PALETTE.leafDark, { ao: false });
    const crown = [PALETTE.blossom, PALETTE.daisy, PALETTE.sunflower, PALETTE.tulipPink, PALETTE.lavender, PALETTE.daisy];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pole.blob(
        0.052 + rng.next() * 0.014,
        Math.cos(a) * 0.19,
        2.25 + (rng.next() - 0.5) * 0.03,
        Math.sin(a) * 0.19,
        crown[i % crown.length],
        { detail: 1, ao: false, grad: 0.1 },
      );
      pole.blob(0.036, Math.cos(a + 0.22) * 0.2, 2.205, Math.sin(a + 0.22) * 0.2, i % 2 ? PALETTE.leaf : PALETTE.leafLight, {
        scale: [1.3, 0.6, 1],
        rot: [0, -a, 0],
        detail: 0,
        ao: false,
      });
    }
    pole.cyl(0.11, 0.07, 0.05, 10, 0, 2.15, 0, PALETTE.wood, { ao: false });
    pole.blob(0.055, 0, 2.39, 0, `#e8b84a`, { detail: 1, ao: false });
    pole.cyl(0.008, 0.008, 0.2, 4, 0, 2.41, 0, PALETTE.woodDark, { ao: false });
    const ribbons = new MeshKit(rng);
    const count = RIBBON_COLORS.length;
    const worldUp = vec3(0, 1, 0);
    for (let e = 0; e < count; e++) {
      const a0 = (e / count) * Math.PI * 2 + rng.next() * 0.15;
      const endR = 1.12 + rng.next() * 0.22;
      const endY = 0.42 + rng.next() * 0.26;
      const twist = 0.75 + rng.next() * 0.25;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const r = 0.16 + (endR - 0.16) * t;
        const y = 2.19 - (2.19 - endY) * t ** 1.15 - 0.14 * Math.sin(Math.PI * t);
        const a = a0 - twist * t;
        pts.push(vec3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const tris: number[] = [];
      let lastA: THREE.Vector3 | null = null;
      let lastB: THREE.Vector3 | null = null;
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const tangent = pts[Math.min(18, i + 1)]
          .clone()
          .sub(pts[Math.max(0, i - 1)])
          .normalize();
        const side = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
        const normal = new THREE.Vector3().crossVectors(tangent, side).normalize();
        const roll = 0.9 * Math.sin(t * 4.2 + a0 * 2);
        side.multiplyScalar(Math.cos(roll)).addScaledVector(normal, Math.sin(roll));
        const half = 0.052 - 0.01 * t;
        const pa = pts[i].clone().addScaledVector(side, -half);
        const pb = pts[i].clone().addScaledVector(side, half);
        if (lastA && lastB)
          tris.push(
            lastA.x, lastA.y, lastA.z, lastB.x, lastB.y, lastB.z, pb.x, pb.y, pb.z,
            lastA.x, lastA.y, lastA.z, pb.x, pb.y, pb.z, pa.x, pa.y, pa.z,
          );
        lastA = pa;
        lastB = pb;
      }
      ribbons.tris(tris, 0, 0, 0, RIBBON_COLORS[e], { ao: false, grad: 0.12, jitter: 0.04 });
      const end = pts[18];
      ribbons.blob(0.022, end.x, end.y, end.z, shadeColor(RIBBON_COLORS[e], -0.06), { detail: 0, ao: false });
    }
    const ribbonMesh = landmarkMesh(ribbons.build(), garden.ribbon);
    const spinner = new THREE.Group();
    spinner.add(ribbonMesh);
    const pennantKit = new MeshKit(rng);
    pennantKit.tris(
      extrudePolygon(
        [
          [0, -0.045],
          [0, 0.045],
          [0.2, 0],
        ],
        0.008,
      ),
      0,
      0,
      0,
      PALETTE.rose,
      { ao: false, grad: 0 },
    );
    const pennant = landmarkMesh(pennantKit.build(), mats.cloth);
    pennant.position.set(0, 2.5500000000000003, 0);
    const root = landmarkMesh(pole.build(), mats.base);
    root.add(spinner, pennant);
    const phase = (p.x * 0.9 + p.z * 1.7) % 6.28;
    let spinV = 0;
    let spin = 0;
    const tipX = new Spring(70, 3.5);
    const tipZ = new Spring(70, 3.5);
    const petals = new SparkPoints(96, false);
    const sparks = new SparkPoints(40, true);
    const halo = glowSprite(2.8, 1.5, 2);
    halo.position.set(0, 2.28, 0);
    root.add(petals.points, sparks.points, halo);
    let flashT = 1 / 0;
    let petalBudget = 0;
    let petalRate = 0;
    let petalAcc = 0;
    let active = 0;
    const emitPetal = (speed: number, rise: number): void => {
      const c = PETAL_RGB[Math.floor(Math.random() * PETAL_RGB.length)];
      const a = Math.random() * Math.PI * 2;
      const r = 0.12 + Math.random() * 0.1;
      const s = speed * (0.5 + Math.random());
      petals.emit(
        Math.cos(a) * r,
        2.25 + Math.random() * 0.06,
        Math.sin(a) * r,
        Math.cos(a) * s - Math.sin(a) * 0.3,
        rise * (0.4 + Math.random() * 0.8),
        Math.sin(a) * s + Math.cos(a) * 0.3,
        2 + Math.random() * 1.3,
        0.09 + Math.random() * 0.06,
        c[0] * nightDim,
        c[1] * nightDim,
        c[2] * nightDim,
        { gravity: 0.45, drag: 0.9, grow: 0.85 },
      );
    };
    let nightDim = 1;
    return {
      object: root,
      update(ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const dt = ctx.dt;
        const dim = 1 - 0.5 * ctx.night;
        if (spinV > 0.001) {
          spin += spinV * dt;
          spinV *= Math.exp(-dt / 1.5);
        }
        spinner.rotation.y = -(ctx.realTime * 0.28 + phase) - spin;
        pennant.rotation.y = Math.atan2(ctx.windDir.y, ctx.windDir.x) * -1 - (p.rotY ?? 0);
        petals.update(dt);
        sparks.update(dt);
        if (!active) return;
        const swing = Math.min(1, spinV / 7);
        spinner.scale.set(1 + swing * 0.22, 1 - swing * 0.06, 1 + swing * 0.22);
        root.rotation.x = tipX.update(dt);
        root.rotation.z = tipZ.update(dt);
        flashT += dt;
        const glow = flashT < 0 ? 0 : Math.exp(-flashT * 3.2);
        setGlowSprite(halo, 0.7 + glow * 0.5, glow * 0.8 * dim);
        if (petalBudget > 0)
          for (petalAcc += petalRate * dt; petalAcc >= 1 && petalBudget > 0; ) {
            --petalAcc;
            petalBudget--;
            emitPetal(0.35, 0.5);
          }
        if (spinV < 0.02 && petalBudget <= 0 && tipX.settled && tipZ.settled && glow < 0.02) {
          active = 0;
          spinV = 0;
          spinner.scale.set(1, 1, 1);
          root.rotation.x = 0;
          root.rotation.z = 0;
        }
      },
      poke(poke, ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const n = Math.min(poke.count, 4);
        pokeDirLocal(poke, p.rotY ?? 0, pokeDir);
        spinV = Math.min(13, spinV + 4.5 + n * 2.2);
        kick(tipX, pokeDir.z * (0.35 + n * 0.1), 1.2);
        kick(tipZ, -pokeDir.x * (0.35 + n * 0.1), 1.2);
        flashT = 0;
        petalBudget = Math.min(90, petalBudget + (n === 1 ? 14 : n === 2 ? 28 : 46));
        petalRate = 40 + n * 12;
        const burst = n >= 3 ? 24 : 8;
        for (let i = 0; i < burst; i++) emitPetal(n >= 3 ? 0.9 : 0.5, n >= 3 ? 1 : 0.6);
        for (let i = 0; i < 4 + n * 4; i++) {
          const a = Math.random() * Math.PI * 2;
          sparks.emit(
            Math.cos(a) * 0.12,
            2.37 + Math.random() * 0.1,
            Math.sin(a) * 0.12,
            Math.cos(a) * 0.25,
            0.3 + Math.random() * 0.5,
            Math.sin(a) * 0.25,
            0.9 + Math.random() * 0.8,
            0.06 + Math.random() * 0.04,
            SPARK_RGB[0] * 2,
            SPARK_RGB[1] * 2,
            SPARK_RGB[2] * 2,
            { drag: 1.2, twinkle: 0.6, gravity: 0.1 },
          );
        }
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        petals.dispose();
        sparks.dispose();
        disposeSprite(halo);
      },
    };
  },
};
