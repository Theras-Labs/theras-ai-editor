// Ports index-BwioI7A7.js 29224-29661: the treehouse (the first entry of ym), its constants (tm..vm), the deck
// height helper (dm) and the rounding helper (fm).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import type { HabitatTree } from '../../ecology/types';
import { SPECIES, type SpeciesId } from '../../flora/species';
import { SparkPoints, Spring, disposeSprite, envelope, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement, LandmarkUpdateContext } from '../types';
import {
  ROPE,
  TRIM,
  atan2,
  boardWall,
  flowerTuft,
  gable,
  kick,
  placementSeed,
  pokeDirLocal,
  rgb,
  rotateXZ,
  tiledRoof,
  vec3,
} from './shared';

const GROVE_RADIUS = 4.5; // tm (29224)
const SPECIES_SCORE: Record<string, number> = { oak: 1, birch: 0.75, willow: 0.55, apple: 0.6, cherry: 0.6, pine: 0.1 }; // nm (29225)
const DECK_X0 = -0.5; // rm (29226)
const DECK_X1 = 0.5; // im (29227)
const DECK_Z0 = -0.36; // am (29228)
const DECK_Z1 = 0.82; // om (29229)
const HUT_W = 0.6; // sm (29230)
const HUT_Z0 = 0.22; // cm (29231)
const HUT_Z1 = 0.66; // lm (29232)
const HUT_H = 0.42; // um (29233)

/** Deck height for a tree grown to `scale`: just under its canopy, clamped to [0.62, 1.35]. */
function deckHeight(tree: HabitatTree, scale: number): number { // dm (29234)
  const s = SPECIES[tree.species as SpeciesId];
  const under = (s.canopyY ?? s.height * 0.7) - (s.canopyRadius ?? 1) * 0.75;
  return Math.min(1.35, Math.max(0.62, (under - 0.72) * scale));
}

const round2 = (v: number): number => Math.round(v * 100) / 100; // fm (29239)
const SPRING_LEAVES = [PALETTE.leafYoung, `#c9e58a`, `#e6f2a0`, PALETTE.leafLight, PALETTE.autumnGold].map(rgb); // pm (29240)
const BLOSSOM_LEAVES = [PALETTE.blossom, PALETTE.blossomLight, PALETTE.leafYoung, `#e6f2a0`, PALETTE.blossom].map(rgb); // mm (29241)
const AUTUMN_LEAVES = [PALETTE.autumnOrange, PALETTE.autumnRed, PALETTE.autumnGold, PALETTE.autumnOrange].map(rgb); // hm (29242)
const SNOW_FLAKES = [PALETTE.snow, `#dbe6f2`, PALETTE.snow].map(rgb); // gm (29243)
const SPARK_RGB = rgb(`#ffd98a`); // _m (29244)
const pokeDir = { x: 0, z: 0 }; // vm (29245)

/** Placement data: deck height h, bridge flag b, bridge target offset (bx, by, bz) and its deck height bh. */
interface TreehouseData {
  h?: number;
  b?: number;
  bx?: number;
  bz?: number;
  by?: number;
  bh?: number;
}

export const TREEHOUSE: LandmarkDef = { // ym[0] (29247)
  id: `treehouse`,
  name: `Treehouse`,
  icon: `🛖`,
  tint: `#dfe8c4`,
  blurb: `A plank hideaway up among the leaves, with a rope ladder and a window lit at dusk.`,
  hint: `Let three trees grow up close together. The biggest might become a hideaway.`,
  priority: 45,
  max: 1,
  detect(ctx) {
    const grown = new Map<string, number>();
    for (const plant of ctx.game.ecology.plants ?? [])
      if (plant.growth >= 0.98 && SPECIES[plant.species as SpeciesId].category === `tree`) grown.set(plant.id, plant.scale);
    const trees = ctx.trees.filter((t) => grown.has(t.plantId));
    if (trees.length < 3) return [];
    const found: { p: LandmarkPlacement; s: number }[] = [];
    const dist = (a: HabitatTree, b: HabitatTree): number => Math.hypot(a.base.x - b.base.x, a.base.z - b.base.z);
    for (const tree of trees) {
      const near = trees.filter((t) => t !== tree && dist(t, tree) <= GROVE_RADIUS);
      if (near.length < 2 || ctx.flat(tree.base.x, tree.base.z, 0.95, 0.14) === null) continue;
      const deck = deckHeight(tree, grown.get(tree.plantId)!);
      let cx = 0;
      let cz = 0;
      for (const t of near) {
        cx += t.base.x / near.length;
        cz += t.base.z / near.length;
      }
      const face = atan2(tree.base.x - cx, tree.base.z - cz);
      let bx = 0;
      let bz = 0;
      let by = 0;
      let bh = 0;
      let bridge = 0;
      let best = -1 / 0;
      for (const t of near) {
        const d = dist(t, tree);
        if (d < 1.8 || d > 4.2 || rotateXZ(t.base.x - tree.base.x, t.base.z - tree.base.z, face).z > 0.2 * d) continue;
        const other = deckHeight(t, grown.get(t.plantId)!);
        const dy = t.base.y - tree.base.y + other - deck;
        if (Math.abs(dy) > 0.45) continue;
        const score = -Math.abs(d - 2.8) - Math.abs(dy) + (t.species === `pine` ? -1 : 0);
        if (score > best) {
          best = score;
          bridge = 1;
          bx = t.base.x - tree.base.x;
          bz = t.base.z - tree.base.z;
          by = t.base.y - tree.base.y;
          bh = other;
        }
      }
      found.push({
        p: {
          key: `treehouse:${tree.plantId}`,
          x: tree.base.x,
          y: tree.base.y,
          z: tree.base.z,
          rotY: face,
          radius: 0.95,
          clear: 1,
          data: { h: round2(deck), b: bridge, bx: round2(bx), bz: round2(bz), by: round2(by), bh: round2(bh) },
        },
        s:
          (SPECIES_SCORE[tree.species] ?? 0.3) * 3 +
          tree.canopyRadius +
          near.length * 0.15 +
          ctx.h01(tree.base.x * 100, tree.base.z * 100, 71) * 0.2,
      });
    }
    return found.sort((a, b) => b.s - a.s).map((f) => f.p);
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(placementSeed(seed, p, 2030));
    const data: TreehouseData = p.data ?? {};
    const deckY = data.h ?? 1;
    const hut = new MeshKit(rng);
    const glowKit = new MeshKit(rng);
    const boards = [PALETTE.woodLight, PALETTE.wood, shadeColor(PALETTE.woodLight, -0.05), shadeColor(PALETTE.wood, 0.04)];
    const dark = PALETTE.woodDark;
    for (let i = 0; i < 12; i++) {
      const z = DECK_Z0 + 1.18 * ((i + 0.5) / 12);
      hut.box(1 + (rng.next() - 0.5) * 0.05, 0.04, 1.18 / 12 - 0.01, (rng.next() - 0.5) * 0.02, deckY - 0.02, z, boards[i % 4], {
        bevel: 0.01,
        grad: 0.15,
        ao: false,
        jitter: 0.08,
      });
    }
    for (const e of [-1, 1])
      hut.box(0.06, 0.07, 1.22, e * 0.38, deckY - 0.075, 0.45999999999999996 / 2, dark, { ao: false, bevel: 0.012 });
    hut.box(1, 0.06, 0.06, 0, deckY - 0.075, 0.7799999999999999, dark, { ao: false });
    for (const e of [-1, 1]) {
      hut.beam(vec3(0, deckY - 0.62, 0.02), vec3(e * 0.38, deckY - 0.1, 0.76), 0.05, 0.05, dark, { ao: false });
      hut.beam(vec3(0, deckY - 0.5, -0.02), vec3(e * 0.38, deckY - 0.1, -0.3), 0.045, 0.045, dark, { ao: false });
    }
    hut.ring(0.17, 0.022, 4, 10, 0, deckY - 0.5, 0, ROPE, { ao: false });
    const hutZ = 0.88 / 2;
    const walls = [`#c9956a`, `#b98356`, `#d2a57a`];
    boardWall(hut, { w: HUT_W, h: HUT_H, x: 0, y: deckY, z: 0.638, rotY: 0, colors: walls });
    boardWall(hut, { w: HUT_W, h: HUT_H, x: 0, y: deckY, z: 0.242, rotY: 0, colors: walls });
    for (const e of [-1, 1])
      boardWall(hut, { w: 0.4000000000000001, h: HUT_H, x: e * (HUT_W / 2 - 0.022), y: deckY, z: hutZ, rotY: Math.PI / 2, colors: walls });
    for (const e of [-1, 1])
      for (const z of [HUT_Z0, HUT_Z1]) hut.box(0.055, 0.44, 0.055, (HUT_W / 2) * e, deckY + HUT_H / 2, z, dark, { ao: false, bevel: 0.012 });
    const ridgeY = deckY + HUT_H + 0.28;
    tiledRoof(hut, rng, {
      L: 0.8,
      d: 0.33,
      eaveY: deckY + HUT_H - 0.02,
      ridgeY,
      z: hutZ,
      rows: 3,
      tile: 0.12,
      colors: [`#c8695a`, `#d27a62`, `#b95e50`, `#d98a6c`],
      cap: `#9c4f43`,
    });
    for (const e of [-1, 1])
      gable(hut, 0.44000000000000006 / 2, deckY + HUT_H - 0.01, ridgeY - 0.04, e * (HUT_W / 2 - 0.02), hutZ, 0.04, walls[0]);
    const doorZ = 0.664;
    hut.box(0.17, 0.31, 0.03, 0.12, deckY + 0.155, doorZ, `#7f9fae`, { bevel: 0.012, grad: 0.15, ao: false });
    hut.box(0.2, 0.03, 0.035, 0.12, deckY + 0.32, doorZ, TRIM, { ao: false });
    hut.blob(0.016, 0.07, deckY + 0.16, 0.684, `#d9b35c`, { detail: 0, ao: false });
    const winX = -0.15;
    const winY = deckY + 0.23;
    glowKit.box(0.12, 0.12, 0.01, winX, winY, 0.67, PALETTE.lanternGlow);
    for (const [w, h, x, y] of [
      [0.16, 0.025, winX, winY + 0.07],
      [0.16, 0.025, winX, winY - 0.07],
      [0.025, 0.14, -0.22, winY],
      [0.025, 0.14, -0.07999999999999999, winY],
      [0.018, 0.12, winX, winY],
      [0.12, 0.018, winX, winY],
    ])
      hut.box(w, h, 0.025, x, y, 0.676, TRIM, { ao: false, grad: 0 });
    for (const e of [-1, 1])
      hut.box(0.06, 0.14, 0.02, winX + e * 0.12, winY, 0.674, `#7f9fae`, { rot: [0, e * 0.35, 0], ao: false, grad: 0.1 });
    hut.box(0.16, 0.045, 0.06, winX, winY - 0.105, 0.6940000000000001, `#a8744a`, { ao: false });
    flowerTuft(hut, rng, winX, winY - 0.09, 0.6940000000000001, 0.05, 6, [PALETTE.poppy, PALETTE.daisy, PALETTE.tulipPink]);
    glowKit.box(0.01, 0.1, 0.1, -0.304, deckY + 0.24, hutZ, PALETTE.lanternGlow);
    hut.box(0.02, 0.12, 0.018, -0.314, deckY + 0.24, hutZ, TRIM, { ao: false });
    hut.box(0.02, 0.018, 0.12, -0.314, deckY + 0.24, hutZ, TRIM, { ao: false });
    for (const e of [-1, 1]) {
      hut.box(0.024, 0.024, 0.15, -0.312, deckY + 0.24 + e * 0.062, hutZ, TRIM, { ao: false });
      hut.box(0.024, 0.15, 0.024, -0.312, deckY + 0.24, hutZ + e * 0.062, TRIM, { ao: false });
    }
    const lampX = 0.32;
    const lampZ = 0.76;
    hut.box(0.02, 0.02, 0.12, 0.3, deckY + HUT_H + 0.02, 0.71, dark, { ao: false });
    hut.cyl(0.004, 0.004, 0.08, 4, lampX, deckY + HUT_H - 0.07, lampZ, `#4f4a45`, { ao: false });
    hut.cone(0.04, 0.035, 6, lampX, deckY + HUT_H - 0.1, lampZ, `#4f5a55`, { ao: false });
    hut.cyl(0.03, 0.026, 0.012, 6, lampX, deckY + HUT_H - 0.18, lampZ, `#4f5a55`, { ao: false });
    glowKit.cyl(0.026, 0.026, 0.07, 6, lampX, deckY + HUT_H - 0.17, lampZ, PALETTE.lanternGlow);
    let gapX = 99;
    let gapZ = 99;
    if (data.b) {
      const to = rotateXZ(data.bx ?? 0, data.bz ?? 0, p.rotY ?? 0);
      const len = Math.hypot(to.x, to.z);
      const ux = to.x / len;
      const uz = to.z / len;
      const tx = ux > 0 ? DECK_X1 / ux : ux < 0 ? DECK_X0 / ux : 1 / 0;
      const tz = uz > 0 ? DECK_Z1 / uz : uz < 0 ? DECK_Z0 / uz : 1 / 0;
      const edge = Math.min(tx, tz) - 0.02;
      const start = vec3(ux * edge, deckY, uz * edge);
      const platY = (data.by ?? 0) + (data.bh ?? deckY);
      const end = vec3(to.x - ux * 0.3, platY, to.z - uz * 0.3);
      gapX = start.x;
      gapZ = start.z;
      hut.cyl(0.34, 0.34, 0.045, 8, to.x, platY - 0.045, to.z, PALETTE.woodLight, { ao: false, grad: 0.1 });
      hut.ring(0.33, 0.02, 4, 16, to.x, platY + 0.26, to.z, ROPE, { ao: false });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        hut.box(0.035, 0.28, 0.035, to.x + Math.cos(a) * 0.32, platY + 0.12, to.z + Math.sin(a) * 0.32, dark, { ao: false });
      }
      for (const a of [0.8, 2.9, 4.9])
        hut.beam(
          vec3(to.x, platY - 0.45, to.z),
          vec3(to.x + Math.cos(a) * 0.26, platY - 0.06, to.z + Math.sin(a) * 0.26),
          0.04,
          0.04,
          dark,
          { ao: false },
        );
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const span = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dz, dx);
      const sag = 0.1 + span * 0.03;
      const along = (t: number, up = 0, side = 0, sagK = 1): THREE.Vector3 => {
        const x = start.x + dx * t - (dz / span) * side;
        const z = start.z + dz * t + (dx / span) * side;
        return vec3(x, start.y + (end.y - start.y) * t - sag * sagK * 4 * t * (1 - t) + up, z);
      };
      const planks = Math.max(6, Math.round(span / 0.11));
      for (let i = 0; i < planks; i++) {
        const t = (i + 0.5) / planks;
        const at = along(t, -0.015);
        const a = along(t - 0.01);
        const b = along(t + 0.01);
        const pitch = Math.atan2(b.y - a.y, span * 0.02);
        hut.box(span / planks - 0.025, 0.025, 0.3 + (rng.next() - 0.5) * 0.03, at.x, at.y, at.z, boards[i % 4], {
          rot: [0, yaw, pitch],
          ao: false,
          bevel: 0.008,
          jitter: 0.08,
        });
      }
      for (const e of [-1, 1])
        for (let i = 0; i < 12; i++) {
          const t0 = i / 12;
          const t1 = (i + 1) / 12;
          hut.beam(along(t0, 0.3, e * 0.16, 0.6), along(t1, 0.3, e * 0.16, 0.6), 0.018, 0.018, ROPE, { ao: false, extend: 0.005 });
          hut.beam(along(t0, -0.03, e * 0.15), along(t1, -0.03, e * 0.15), 0.02, 0.02, ROPE, { ao: false, extend: 0.005 });
          if (i % 2 == 0) hut.beam(along(t0, 0.3, e * 0.16, 0.6), along(t0, -0.03, e * 0.15), 0.012, 0.012, ROPE, { ao: false });
        }
    }
    const railH = 0.25;
    const ladderX = 0.12;
    const edges = [
      [DECK_X0, DECK_Z1, DECK_X1, DECK_Z1],
      [DECK_X1, DECK_Z1, DECK_X1, DECK_Z0],
      [DECK_X1, DECK_Z0, DECK_X0, DECK_Z0],
      [DECK_X0, DECK_Z0, DECK_X0, DECK_Z1],
    ];
    for (const [x0, z0, x1, z1] of edges) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const segs = Math.max(2, Math.round(len / 0.3));
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const ax = x0 + (x1 - x0) * t0;
        const az = z0 + (z1 - z0) * t0;
        const bx = x0 + (x1 - x0) * t1;
        const bz = z0 + (z1 - z0) * t1;
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const ladderGap = z0 === DECK_Z1 && z1 === DECK_Z1 && Math.abs(mx - ladderX) < 0.14;
        const bridgeGap = Math.hypot(mx - gapX, mz - gapZ) < 0.2;
        hut.box(0.04, 0.28, 0.04, ax, deckY + railH / 2, az, dark, { ao: false, bevel: 0.01 });
        if (!(ladderGap || bridgeGap)) {
          hut.beam(vec3(ax, deckY + railH, az), vec3(bx, deckY + railH, bz), 0.04, 0.035, PALETTE.wood, { ao: false, extend: 0.02 });
          hut.beam(vec3(ax, deckY + 0.12, az), vec3(bx, deckY + 0.12, bz), 0.025, 0.025, dark, { ao: false });
        }
      }
    }
    const flagX = 0.36;
    hut.cyl(0.012, 0.014, 0.42, 5, flagX, ridgeY - 0.12, hutZ, dark, { ao: false });
    hut.blob(0.02, flagX, ridgeY + 0.31, hutZ, `#d9b35c`, { detail: 0, ao: false });
    const flagKit = new MeshKit(rng);
    flagKit.tris(
      extrudePolygon(
        [
          [0, -0.055],
          [0, 0.055],
          [0.24, 0],
        ],
        0.008,
      ),
      0,
      0,
      0,
      `#f2c14e`,
      { ao: false, grad: 0 },
    );
    const flag = landmarkMesh(flagKit.build(), mats.cloth);
    flag.position.set(flagX, ridgeY + 0.22, hutZ);
    const ladderKit = new MeshKit(rng);
    for (const e of [-1, 1])
      ladderKit.beam(vec3(e * 0.085, 0, 0), vec3(e * 0.085, -deckY + 0.03, 0.06), 0.018, 0.018, ROPE, { ao: false });
    const rungs = Math.max(3, Math.floor(deckY / 0.14));
    for (let i = 1; i <= rungs; i++) {
      const t = i / (rungs + 0.4);
      ladderKit.box(0.21, 0.024, 0.04, 0, -deckY * t + 0.02, t * 0.06, boards[i % 4], { ao: false, bevel: 0.008 });
    }
    const ladder = landmarkMesh(ladderKit.build(), mats.base);
    ladder.position.set(ladderX, deckY - 0.01, 0.84);
    const root = landmarkMesh(hut.build(), mats.base);
    root.add(landmarkMesh(glowKit.build(), mats.glow, false), flag, ladder);
    const phase = (p.x * 1.3 + p.z * 0.7) % 6.28;
    const squash = new Spring(150, 6.5);
    const rockX = new Spring(90, 5);
    const rockZ = new Spring(90, 5);
    const ladderSwingX = new Spring(38, 2.4);
    const ladderSwingZ = new Spring(38, 2.4);
    const leaves = new SparkPoints(64, false);
    const sparks = new SparkPoints(40, true);
    const windowHalo = glowSprite(3.2, 2.1, 1.1);
    const lampHalo = glowSprite(3.2, 2.1, 1.1);
    const windowAt = vec3(winX, winY, 0.7140000000000001);
    const lampAt = vec3(lampX, deckY + HUT_H - 0.16, lampZ);
    windowHalo.position.copy(windowAt);
    lampHalo.position.copy(lampAt);
    root.add(leaves.points, sparks.points, windowHalo, lampHalo);
    const pulses = [1 / 0, 1 / 0, 1 / 0];
    let lampT = 1 / 0;
    let leafBudget = 0;
    let leafRate = 0;
    let leafAcc = 0;
    let active = 0;
    const emitLeaf = (ctx: LandmarkUpdateContext): void => {
      const set =
        ctx.time.snow > 0.3
          ? SNOW_FLAKES
          : ctx.time.yearFrac > 0.5 && ctx.time.yearFrac < 0.9
            ? AUTUMN_LEAVES
            : ctx.time.yearFrac < 0.3
              ? BLOSSOM_LEAVES
              : SPRING_LEAVES;
      const c = set[Math.floor(Math.random() * set.length)];
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 0.9;
      const y = deckY + 0.5 + Math.random() * 0.7;
      const s = 0.1 + Math.random() * 0.22;
      leaves.emit(
        Math.cos(a) * r,
        y,
        Math.sin(a) * r,
        Math.cos(a) * s + (Math.random() - 0.5) * 0.25,
        0.25 + Math.random() * 0.3,
        Math.sin(a) * s + (Math.random() - 0.5) * 0.25,
        1.8 + Math.random() * 1.2,
        0.11 + Math.random() * 0.07,
        c[0] * nightDim,
        c[1] * nightDim,
        c[2] * nightDim,
        { gravity: 0.85, drag: 1.1, grow: 0.85 },
      );
    };
    let nightDim = 1;
    return {
      object: root,
      update(ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const t = ctx.realTime + phase;
        ladder.rotation.x = Math.sin(t * 1.1) * 0.035 * ctx.wind + ladderSwingX.x;
        ladder.rotation.z = Math.sin(t * 0.8 + 1) * 0.025 * ctx.wind + ladderSwingZ.x;
        const dt = ctx.dt;
        const dim = 1 - 0.5 * ctx.night;
        leaves.update(dt);
        sparks.update(dt);
        if (!active) return;
        for (let i = 0; i < 3; i++) if (pulses[i] !== 1 / 0) pulses[i] += dt;
        if (lampT !== 1 / 0) lampT += dt;
        if (leafBudget > 0)
          for (leafAcc += leafRate * dt; leafAcc >= 1 && leafBudget > 0; ) {
            --leafAcc;
            leafBudget--;
            emitLeaf(ctx);
          }
        const sy = 1 + squash.update(dt) * 0.04;
        root.scale.set(1 - (sy - 1) * 0.5, sy, 1 - (sy - 1) * 0.5);
        root.position.y = deckY * (1 - sy);
        root.rotation.x = rockX.update(dt);
        root.rotation.z = rockZ.update(dt);
        ladderSwingX.update(dt);
        ladderSwingZ.update(dt);
        let glow = 0;
        for (let i = 0; i < 3; i++) glow = Math.max(glow, envelope(pulses[i], 0.07, 0.42) * (1 - i * 0.12));
        setGlowSprite(windowHalo, 0.5 + glow * 0.5, glow * dim);
        const lamp = envelope(lampT, 0.09, 0.5) * 0.8;
        setGlowSprite(lampHalo, 0.34 + lamp * 0.3, lamp * dim);
        if (glow > 0.02 && Math.random() < dt * 14 * glow)
          sparks.emit(
            windowAt.x + (Math.random() - 0.5) * 0.12,
            windowAt.y + (Math.random() - 0.3) * 0.1,
            windowAt.z + 0.03,
            (Math.random() - 0.5) * 0.12,
            0.16 + Math.random() * 0.15,
            0.05 + Math.random() * 0.06,
            0.8 + Math.random() * 0.6,
            0.05 + Math.random() * 0.04,
            SPARK_RGB[0] * 2,
            SPARK_RGB[1] * 2,
            SPARK_RGB[2] * 2,
            { drag: 1.2, twinkle: 0.5 },
          );
        if (
          squash.settled &&
          rockX.settled &&
          rockZ.settled &&
          ladderSwingX.settled &&
          ladderSwingZ.settled &&
          leafBudget <= 0 &&
          glow < 0.02 &&
          lamp < 0.02 &&
          pulses[2] === 1 / 0
        ) {
          active = 0;
          root.scale.set(1, 1, 1);
          root.position.y = 0;
          root.rotation.set(0, 0, 0);
          ladderSwingX.set(0);
          ladderSwingZ.set(0);
        }
      },
      poke(poke, ctx) {
        nightDim = 1 - 0.6 * ctx.night;
        const n = Math.min(poke.count, 4);
        pokeDirLocal(poke, p.rotY ?? 0, pokeDir);
        kick(squash, 2.4 + n * 0.7, 9);
        kick(rockX, pokeDir.z * (0.5 + n * 0.18), 1.6);
        kick(rockZ, -pokeDir.x * (0.5 + n * 0.18), 1.6);
        kick(ladderSwingX, (Math.random() < 0.5 ? -1 : 1) * (1.4 + n * 0.5), 5);
        kick(ladderSwingZ, (Math.random() < 0.5 ? -1 : 1) * (1 + n * 0.4), 4);
        pulses[0] = 0;
        pulses[1] = poke.count >= 2 ? -0.42 : 1 / 0;
        pulses[2] = poke.count >= 3 ? -0.85 : 1 / 0;
        lampT = -0.1;
        leafBudget = Math.min(70, leafBudget + (n === 1 ? 12 : n === 2 ? 24 : 42));
        leafRate = n === 1 ? 26 : 40;
        if (n >= 3) {
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            sparks.emit(
              Math.cos(a) * 0.55,
              deckY + 0.5 + Math.random() * 0.2,
              hutZ + Math.sin(a) * 0.5,
              Math.cos(a) * 0.35,
              0.3 + Math.random() * 0.3,
              Math.sin(a) * 0.35,
              1 + Math.random() * 0.6,
              0.06 + Math.random() * 0.04,
              SPARK_RGB[0] * 2,
              SPARK_RGB[1] * 2,
              SPARK_RGB[2] * 2,
              { drag: 1.5, twinkle: 0.6 },
            );
          }
          for (let i = 0; i < 8; i++) emitLeaf(ctx);
        } else for (let i = 0; i < 4; i++) emitLeaf(ctx);
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        leaves.dispose();
        sparks.dispose();
        disposeSprite(windowHalo);
        disposeSprite(lampHalo);
      },
    };
  },
};
