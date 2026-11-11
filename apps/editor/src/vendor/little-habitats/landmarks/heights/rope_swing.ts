// Ports index-BwioI7A7.js 30620-30870: the rope swing landmark (ch), its constants th..ah and the detect helpers
// oh (branch spot) and sh (lone hilltop).
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { levelY } from '../../core/config';
import { PALETTE } from '../../core/palette';
import { Rng, hashInts, hashString } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { SPECIES } from '../../flora/species';
import { Sparkles, Spring, kickSpinner, randomSign } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkDetectContext, LandmarkPlacement } from '../types';
import { BASE_YAW, ROPE, WOOD_LIGHT, disposeMeshes, vec3 } from './shared';

type Tree = LandmarkDetectContext['habitat']['trees'][number];

/** Branch height above the tree base, per tree species (unscaled). Only these species get a swing. */
const BRANCH_HEIGHT: Record<string, number> = { oak: 1.55, birch: 1.75, cherry: 1.48, apple: 1.18 }; // th (30620)
const BRANCH_BARK: Record<string, string> = { oak: `#6b4c3a`, birch: `#d8d1c4`, cherry: `#5c3c35`, apple: `#634836` }; // nh (30621)
const SEAT_HEIGHT = 0.34; // rh (30622)
const SWING_RADIUS = 0.45; // ih (30623)
const DIRECTIONS = 16; // ah (30624)

/** The best spot under a branch of `tree` for the swing seat, or null. */
function findSwingSpot(ctx: LandmarkDetectContext, tree: Tree, scale: number): LandmarkPlacement | null { // oh (30625)
  const species = SPECIES[tree.species];
  const branchH = (BRANCH_HEIGHT[tree.species] ?? 1.5) * scale;
  const canopy = (species.canopyRadius ?? 1) * scale;
  const reach = Math.min(1.2, Math.max(0.92, canopy * 0.75));
  const birdhouses = ctx.habitat.features.filter(
    (f) => f.type === `birdhouse` && Math.hypot(f.x - tree.base.x, f.z - tree.base.z) < 0.5,
  );
  const viewX = Math.cos(BASE_YAW);
  const viewZ = Math.sin(BASE_YAW);
  let best: LandmarkPlacement | null = null;
  let bestScore = -1 / 0;
  for (let k = 0; k < DIRECTIONS; k++) {
    const a = (k / DIRECTIONS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    if (
      birdhouses.some((f) => {
        const d = Math.hypot(f.x - tree.base.x, f.z - tree.base.z) || 1;
        return ((f.x - tree.base.x) * dx + (f.z - tree.base.z) * dz) / d > 0.45;
      })
    )
      continue;
    const x = tree.base.x + dx * reach;
    const z = tree.base.z + dz * reach;
    let ground = -1 / 0;
    let wet = !1;
    for (const s of [-0.45, 0, 0.45]) {
      const h = ctx.heightAt(x - dz * s, z + dx * s);
      if (h < 0.08) wet = !0;
      ground = Math.max(ground, h);
    }
    if (wet) continue;
    const drop = tree.base.y + branchH - 0.05 - (ground + SEAT_HEIGHT);
    if (
      drop < 0.55 ||
      drop > 2.2 ||
      ctx.habitat.features.some(
        (f) => Math.hypot(f.x - x, f.z - z) < (f.type === `fence` || f.type === `bridge` ? 0.9 : 0.55) + SWING_RADIUS + 0.02,
      )
    )
      continue;
    const fall = tree.base.y - ctx.heightAt(tree.base.x + dx * 1.35, tree.base.z + dz * 1.35);
    const facing = dx * viewX + dz * viewZ;
    const score =
      Math.min(fall, 0.3) * 1.5 + (1 - Math.abs(facing)) * 0.9 + Math.min(0, facing + 0.2) * 1.5 + (drop < 1.6 ? 0.2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = {
        key: `rope_swing:${tree.plantId}`,
        x,
        y: ground,
        z,
        rotY: Math.atan2(dx, dz),
        radius: SWING_RADIUS,
        clear: 0.36,
        data: {
          d: +reach.toFixed(2),
          hb: +(tree.base.y + branchH - ground).toFixed(2),
          sp: Object.keys(BRANCH_HEIGHT).indexOf(tree.species),
        },
      };
    }
  }
  return best;
}

/** True when the corner tops a small hill: its level region (under 14 corners) has no higher neighbour. */
function isLoneHilltop(ctx: LandmarkDetectContext, corner: number): boolean { // sh (30682)
  const h = ctx.h(corner);
  if (h < 2) return !1;
  const seen = new Set([corner]);
  const stack = [corner];
  while (stack.length) {
    const c = stack.pop() as number;
    for (const n of ctx.nbrs(c))
      if (!(seen.has(n) || ctx.h(n) < h)) {
        if (ctx.h(n) > h || seen.size >= 14) return !1;
        seen.add(n);
        stack.push(n);
      }
  }
  return !0;
}

export const ROPE_SWING: LandmarkDef = { // ch (30697)
  id: `rope_swing`,
  name: `Rope swing`,
  icon: `🌳`,
  tint: `#cfe3b0`,
  blurb: `A plank swing on a lone hilltop tree. Kick your heels and watch the lake go by.`,
  hint: `A single leafy tree alone on a hilltop, two levels up or more, has room for something fun.`,
  priority: 30,
  max: 2,
  detect(ctx) {
    const out: LandmarkPlacement[] = [];
    const minY = levelY(2) - 0.1;
    let plants: LandmarkDetectContext['game']['ecology']['plants'] | null = null;
    for (const tree of ctx.habitat.trees) {
      if (
        !tree.mature ||
        !(tree.species in BRANCH_HEIGHT) ||
        tree.base.y < minY ||
        ctx.habitat.trees.some((o) => o !== tree && Math.hypot(o.base.x - tree.base.x, o.base.z - tree.base.z) < 3)
      )
        continue;
      let clearAround = !0;
      for (let k = 0; k < 8 && clearAround; k++) {
        const a = (k / 8) * Math.PI * 2;
        for (const r of [0.8, 1.6])
          if (ctx.heightAt(tree.base.x + Math.cos(a) * r, tree.base.z + Math.sin(a) * r) > tree.base.y + 0.1)
            clearAround = !1;
      }
      if (!clearAround) continue;
      plants ??= ctx.game.ecology.plants;
      const plant = plants.find((pl: any) => pl.id === tree.plantId); // Theras: Game stub types ecology as any
      if (!plant || plant.growth < 0.95 || !isLoneHilltop(ctx, plant.cornerId)) continue;
      const spot = findSwingSpot(ctx, tree, plant.scale);
      if (spot) out.push(spot);
    }
    out.sort((a, b) => (a.key < b.key ? -1 : 1));
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(hashInts(seed, hashString(p.key), 22295));
    const reach = p.data?.d ?? 1; // i
    const branchY = p.data?.hb ?? 1.6; // a
    const species = Object.keys(BRANCH_HEIGHT)[p.data?.sp ?? 0] ?? `oak`;
    const bark = BRANCH_BARK[species] ?? PALETTE.bark;
    const kit = new MeshKit(rng);
    /** Point on the branch at local z (from the trunk at z = -reach to the tip at z = 0.3). */
    const branchAt = (z: number) => { // l
      const t = (z + reach) / (reach + 0.3);
      return vec3(Math.sin(t * Math.PI * 1.1) * 0.04, branchY - 0.24 * (1 - t) * (1 - t) + 0.08 * t * t, z);
    };
    for (let k = 0; k < 6; k++) {
      const z0 = -reach + ((reach + 0.3) * k) / 6;
      const z1 = -reach + ((reach + 0.3) * (k + 1)) / 6;
      const w = 0.14 - (k / 6) * 0.08;
      kit.beam(branchAt(z0), branchAt(z1), w, w * 0.92, k % 2 ? bark : shadeColor(bark, -0.03), {
        ao: !1,
        grad: 0.1,
        extend: 0.02,
        bevel: w * 0.3,
      });
    }
    const twig = branchAt(0.3);
    kit.beam(twig, twig.clone().add(vec3(0.08, 0.16, 0.1)), 0.05, 0.05, bark, { ao: !1 });
    kit.beam(twig, twig.clone().add(vec3(-0.07, 0.08, 0.13)), 0.04, 0.04, bark, { ao: !1 });
    kit.beam(branchAt(-reach * 0.35), branchAt(-reach * 0.35).add(vec3(-0.16, 0.26, 0.06)), 0.05, 0.05, bark, { ao: !1 });
    const ropeTop = branchAt(0).y - 0.06; // d
    for (const z of [-0.2, 0.2])
      kit.ring(0.05, 0.018, 4, 8, 0, branchAt(z).y, z, ROPE, { rot: [0, 0, Math.PI / 2], ao: !1, grad: 0 });
    const branchMesh = landmarkMesh(kit.build(), mats.base);
    const seatKit = new MeshKit(rng);
    const ropeLen = ropeTop - SEAT_HEIGHT; // m
    for (const z of [-0.2, 0.2]) {
      seatKit.beam(vec3(0, 0, z), vec3(0, -ropeLen + 0.02, z), 0.028, 0.028, ROPE, { ao: !1, grad: 0 });
      seatKit.blob(0.028, 0, -ropeLen + 0.03, z, ROPE, { ao: !1, detail: 0 });
    }
    seatKit.box(0.2, 0.05, 0.56, 0, -ropeLen - 0.01, 0, WOOD_LIGHT, { bevel: 0.016, ao: !1, grad: 0.15 });
    seatKit.box(0.2, 0.02, 0.5, 0, -ropeLen - 0.045, 0, shadeColor(WOOD_LIGHT, -0.08), { bevel: 0.006, ao: !1 });
    const seat = new THREE.Group(); // h
    seat.position.set(0, ropeTop - branchY, reach);
    seat.add(landmarkMesh(seatKit.build(), mats.base));
    const branch = new THREE.Group(); // g: pivots at the trunk
    branch.position.set(0, branchY, -reach);
    branchMesh.position.set(0, -branchY, reach);
    branch.add(branchMesh, seat);
    const root = new THREE.Group();
    root.name = `lm-heights-swing`;
    root.add(branch);

    let wind = 0.6; // v
    const phase = rng.next() * 6; // y
    const freq = Math.sqrt(9.8 / Math.max(0.5, ropeLen)) * 0.72; // b
    const swingFreq = 2.3; // x
    const swing = new Spring(swingFreq * swingFreq, 0.5); // S
    const twist = new Spring(40, 3); // C
    const bough = new Spring(120, 5); // T
    const puffs = new Sparkles(40).add(root); // E
    const leaves = new Sparkles(40).add(root); // D
    const leafColor = new THREE.Color(); // O
    const leafTint = // k
      species === `cherry` ? `#f5a9c0` : species === `birch` ? `#e6d45c` : species === `apple` ? `#8ec95a` : `#7cbf4a`;
    let pumpLeft = 0; // A: seconds of pumping left
    let pumpAmp = 0.6; // j
    let lastPosSign = 0; // M
    let lastVelSign = 0; // N
    const dropLeaves = (count: number) => { // P
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.5;
        leaves.emit(
          Math.cos(a) * r,
          branchY + 0.35 + Math.random() * 0.4,
          -reach * 0.4 + Math.sin(a) * r,
          (Math.random() - 0.5) * 0.4,
          -0.05 - Math.random() * 0.2,
          (Math.random() - 0.5) * 0.4,
          1.6 + Math.random() * 0.9,
          0.09 + Math.random() * 0.05,
          leafColor.r,
          leafColor.g,
          leafColor.b,
          { gravity: 0.35, drag: 1.4, twinkle: 0.15, grow: 0.9 },
        );
      }
    };
    return {
      object: root,
      dispose() {
        disposeMeshes(root);
        puffs.dispose();
        leaves.dispose();
      },
      poke(poke, ctx) {
        const count = Math.min(3, poke.count);
        const season = ctx.time.season;
        leafColor.set(season === `winter` ? `#f2f7ff` : season === `autumn` ? `#e8a13a` : leafTint);
        pumpAmp = 0.62 + count * 0.16;
        pumpLeft = 1.2 + count * 1.1;
        const dir = Math.abs(swing.v) > 0.25 ? Math.sign(swing.v) : Math.sign(swing.x) || randomSign();
        kickSpinner(swing, dir * (1.9 + count * 0.55), swingFreq * (0.95 + count * 0.1));
        kickSpinner(twist, randomSign() * (2 + count), 6);
        kickSpinner(bough, -(1.3 + count * 0.35), 3.5);
        dropLeaves(6 + count * 4);
        return !0;
      },
      update(ctx) {
        wind = damp(wind, ctx.wind, 0.4, ctx.dt);
        const t = ctx.realTime * freq + phase;
        swing.c = pumpLeft > 0 ? 0.18 : 0.55;
        swing.update(ctx.dt);
        const posSign = Math.sign(swing.x);
        if (posSign !== 0 && posSign !== lastPosSign) {
          if (pumpLeft > 0 && lastPosSign !== 0)
            swing.v = Math.sign(swing.v) * Math.min(Math.abs(swing.v) + 0.55, pumpAmp * swingFreq * 1.05);
          lastPosSign = posSign;
        }
        const velSign = Math.sign(swing.v);
        if (velSign !== 0 && velSign !== lastVelSign) {
          if (lastVelSign !== 0 && Math.abs(swing.x) > 0.4) {
            // Top of a big swing: a puff of dust under the seat, sometimes a few leaves.
            const angle = swing.x;
            const dy = -ropeLen * Math.cos(angle);
            const dx = ropeLen * Math.sin(angle);
            for (let k = 0; k < 4; k++)
              puffs.emit(
                dx,
                ropeTop + dy + 0.05,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
                0.2 + Math.random() * 0.4,
                (Math.random() - 0.5) * 0.3,
                0.8,
                0.09 + Math.random() * 0.05,
                1,
                0.9,
                0.5,
                { gravity: 0.6, drag: 1.5, twinkle: 0.4 },
              );
            if (Math.random() < 0.6) dropLeaves(2);
          }
          lastVelSign = velSign;
        }
        pumpLeft = Math.max(0, pumpLeft - ctx.dt);
        seat.rotation.z = (0.07 + 0.2 * wind) * Math.sin(t) + 0.03 * Math.sin(t * 0.37 + 1) + swing.x;
        seat.rotation.x = 0.03 * wind * Math.sin(t * 0.61 + 2);
        seat.rotation.y = twist.update(ctx.dt) * 0.12;
        branch.rotation.x = bough.update(ctx.dt) * 0.03 * (1 + Math.abs(swing.x) * 0.5);
        puffs.update(ctx.dt);
        leaves.update(ctx.dt);
      },
    };
  },
};
