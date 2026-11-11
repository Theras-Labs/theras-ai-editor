// Ports index-BwioI7A7.js 27095-27373: colours, geometry helpers, garden materials (ip/ap) and poke helpers shared
// by the garden landmarks (greenhouse, maypole, scarecrow, garden shed, snowman, treehouse).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { hashInts } from '../../core/rng';
import { MeshKit, extrudePolygon, shadeColor } from '../../ecology/meshKit';
import { patchWorldMaterial } from '../../fx/pokefx';
import type { Spring } from '../kit';
import { landmarkMesh } from '../materials';
import type { LandmarkDetectContext, LandmarkPlacement, LandmarkPoke } from '../types';

export const vec3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z); // Pf (27095)

export const TRIM = `#f1e8d6`; // Ff (27096)
export const ROPE = `#d8c396`; // If (27097)
export const STRAW = `#e6c67a`; // Lf (27098)
export const STRAW_DARK = `#cfa75c`; // Rf (27099)
export const TERRACOTTA = `#cf7d55`; // zf (27100)
export const COAL = `#3f3a44`; // Bf (27101)
export const INK = `#4a3b2f`; // Vf (27102)
export const POT_SOIL = `#6f4a33`; // Hf (27103)

/** Build seed of a placement: hashInts(seed, x * 100, z * 100, salt). */
export function placementSeed(seed: number, p: LandmarkPlacement, salt: number): number { // Uf (27104)
  return hashInts(seed, Math.round(p.x * 100), Math.round(p.z * 100), salt);
}

export const QUARTER_TURN = Math.PI / 4; // Wf (27107)
export const atan2 = (y: number, x: number): number => Math.atan2(y, x); // Gf (27108)

/** Rotates (x, z) by angle a. */
export function rotateXZ(x: number, z: number, a: number): { x: number; z: number } { // Kf (27109)
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - z * s, z: x * s + z * c };
}

/** Distance from (x, z) to the nearest habitat tree (Infinity when there is none). */
export function nearestTreeDist(ctx: LandmarkDetectContext, x: number, z: number): number { // qf (27114)
  let best = 1 / 0;
  for (const tree of ctx.habitat.trees) best = Math.min(best, Math.hypot(tree.base.x - x, tree.base.z - z));
  return best;
}

export interface PlankWallOptions {
  w: number;
  h: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  colors: readonly THREE.ColorRepresentation[];
  plank?: number;
  thick?: number;
  /** Leave out the plank whose centre offset along the wall is s. */
  skip?: (s: number) => boolean;
}

/** A wall of vertical planks with slightly uneven heights. */
export function plankWall(kit: MeshKit, rng: { next(): number }, o: PlankWallOptions): void { // Jf (27119)
  const count = Math.max(2, Math.round(o.w / (o.plank ?? 0.12)));
  const pw = o.w / count;
  const c = Math.cos(o.rotY);
  const s = Math.sin(o.rotY);
  for (let i = 0; i < count; i++) {
    const off = -o.w / 2 + pw * (i + 0.5);
    if (o.skip?.(off)) continue;
    const h = o.h + (rng.next() - 0.5) * 0.018;
    kit.box(pw - 0.008, h, o.thick ?? 0.04, o.x + off * c, o.y + h / 2, o.z - off * s, o.colors[i % o.colors.length], {
      rot: [0, o.rotY, 0],
      bevel: 0.008,
      grad: 0.22,
      jitter: 0.06,
    });
  }
}

export interface BoardWallOptions {
  w: number;
  h: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  colors: readonly THREE.ColorRepresentation[];
  board?: number;
  thick?: number;
}

/** A wall of stacked horizontal boards with alternating widths. */
export function boardWall(kit: MeshKit, o: BoardWallOptions): void { // Yf (27136)
  const count = Math.max(2, Math.round(o.h / (o.board ?? 0.085)));
  const bh = o.h / count;
  for (let i = 0; i < count; i++)
    kit.box(
      o.w + ((i % 2) - 0.5) * 0.02,
      bh - 0.006,
      o.thick ?? 0.045,
      o.x,
      o.y + bh * (i + 0.5),
      o.z,
      o.colors[i % o.colors.length],
      { rot: [0, o.rotY, 0], bevel: 0.012, grad: 0.25, jitter: 0.07, ao: false },
    );
}

/** A triangular gable that faces along x (from eaveY at +-halfW up to ridgeY). */
export function gable( // Xf (27151)
  kit: MeshKit,
  halfW: number,
  eaveY: number,
  ridgeY: number,
  x: number,
  z: number,
  thick: number,
  color: THREE.ColorRepresentation,
): void {
  kit.tris(
    extrudePolygon(
      [
        [-halfW, eaveY],
        [halfW, eaveY],
        [0, ridgeY],
      ],
      thick,
    ),
    x,
    0,
    z,
    color,
    { rot: [0, Math.PI / 2, 0], grad: 0.12, ao: false },
  );
}

export interface TiledRoofOptions {
  /** Roof length along x. */
  L: number;
  /** Half depth: the eaves are at z +- d. */
  d: number;
  eaveY: number;
  ridgeY: number;
  x?: number;
  z?: number;
  rows?: number;
  tile?: number;
  colors: readonly THREE.ColorRepresentation[];
  under?: THREE.ColorRepresentation;
  cap?: THREE.ColorRepresentation;
}

/** A gabled roof with a rafter board and staggered tile rows on each slope, and a ridge cap. */
export function tiledRoof(kit: MeshKit, rng: { next(): number }, o: TiledRoofOptions): void { // Zf (27168)
  const x0 = o.x ?? 0;
  const z0 = o.z ?? 0;
  const rows = o.rows ?? 4;
  const tile = o.tile ?? 0.15;
  const rise = o.ridgeY - o.eaveY;
  const slope = Math.hypot(rise, o.d);
  for (const side of [-1, 1]) {
    const eave = vec3(x0, o.eaveY, z0 + side * o.d);
    const ridge = vec3(x0, o.ridgeY, z0);
    const up = vec3(0, o.d / slope, (side * rise) / slope);
    kit.beam(eave, ridge, o.L, 0.035, o.under ?? PALETTE.woodDark, { up, ao: false, bevel: 0.01, grad: 0 });
    for (let row = 0; row < rows; row++) {
      const t0 = row / rows - 0.015;
      const t1 = (row + 1) / rows + 0.05;
      const lo = eave.clone().lerp(ridge, t0).addScaledVector(up, 0.042);
      const hi = eave.clone().lerp(ridge, Math.min(1.02, t1)).addScaledVector(up, 0.022);
      const shift = row % 2 ? tile / 2 : 0;
      const count = Math.ceil(o.L / tile) + 1;
      for (let i = 0; i < count; i++) {
        let a = -o.L / 2 - shift + i * tile;
        let b = a + tile;
        a = Math.max(a, -o.L / 2);
        b = Math.min(b, o.L / 2);
        if (b - a < 0.035) continue;
        const cx = x0 + (a + b) / 2;
        const dy = (rng.next() - 0.5) * 0.012;
        const color = o.colors[Math.floor(rng.next() * o.colors.length)];
        kit.beam(vec3(cx, lo.y + dy, lo.z), vec3(cx, hi.y, hi.z), b - a - 0.014, 0.024, color, {
          up,
          ao: false,
          bevel: 0.007,
          grad: 0.3,
          jitter: 0.07,
        });
      }
    }
  }
  kit.box(o.L + 0.03, 0.055, 0.1, x0, o.ridgeY + 0.045, z0, o.cap ?? shadeColor(o.colors[0], -0.1), {
    ao: false,
    bevel: 0.02,
    grad: 0.1,
  });
}

/** A lathed flower pot of radius r standing on (x, y, z) with a soil disc. Returns the soil top y. */
export function flowerPot( // Qf (27210)
  kit: MeshKit,
  r: number,
  x: number,
  y: number,
  z: number,
  color: THREE.ColorRepresentation = TERRACOTTA,
): number {
  const h = r * 1.35;
  kit.lathe(
    [
      [0.001, 0],
      [r * 0.72, 0],
      [r * 0.95, h * 0.72],
      [r * 1.12, h * 0.74],
      [r * 1.12, h],
      [r * 0.92, h],
      [0.001, h * 0.9],
    ],
    8,
    x,
    y,
    z,
    color,
    { grad: 0.3 },
  );
  kit.cyl(r * 0.9, r * 0.9, 0.01, 8, x, y + h * 0.88, z, POT_SOIL, { grad: 0, ao: false });
  return y + h * 0.9;
}

/** A small leafy sprout of height `size` on (x, y, z). */
export function sprout( // $f (27234)
  kit: MeshKit,
  rng: { next(): number },
  x: number,
  y: number,
  z: number,
  size: number,
  color: THREE.ColorRepresentation = PALETTE.leafLight,
): void {
  kit.cyl(0.008, 0.01, size * 0.6, 4, x, y, z, PALETTE.leafDark, { ao: false, grad: 0 });
  const leaves = 3 + Math.floor(rng.next() * 2);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rng.next();
    const r = size * 0.28;
    kit.blob(
      size * 0.26,
      x + Math.cos(a) * r,
      y + size * (0.45 + rng.next() * 0.25),
      z + Math.sin(a) * r,
      i % 2 ? color : shadeColor(color, -0.06),
      { scale: [1.2, 0.5, 0.9], rot: [0, -a, 0.3], detail: 0, ao: false, grad: 0.15 },
    );
  }
  kit.blob(size * 0.22, x, y + size * 0.72, z, shadeColor(color, 0.05), { scale: [1, 0.7, 1], detail: 0, ao: false });
}

/** A watering can on (x, y, z), its spout turned by rotY. */
export function wateringCan( // ep (27251)
  kit: MeshKit,
  x: number,
  y: number,
  z: number,
  rotY: number,
  color: THREE.ColorRepresentation = `#9fb6c2`,
): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (u: number, h: number, w: number): THREE.Vector3 => vec3(x + u * c + w * s, y + h, z - u * s + w * c);
  kit.cyl(0.07, 0.075, 0.13, 10, x, y, z, color, { grad: 0.25 });
  kit.cyl(0.06, 0.07, 0.015, 10, x, y + 0.13, z, shadeColor(color, 0.06), { ao: false });
  kit.beam(at(0.05, 0.04, 0), at(0.19, 0.17, 0), 0.026, 0.026, color, { ao: false });
  const rose = at(0.2, 0.18, 0);
  kit.blob(0.026, rose.x, rose.y, rose.z, shadeColor(color, -0.08), { scale: [0.7, 1, 1], detail: 0, ao: false });
  let prev = at(-0.06, 0.12, 0);
  for (let i = 1; i <= 6; i++) {
    const a = Math.PI - (Math.PI * i) / 6;
    const next = at(Math.cos(a) * 0.06, 0.13 + Math.sin(a) * 0.07, 0);
    kit.beam(prev, next, 0.018, 0.018, shadeColor(color, -0.04), { ao: false, extend: 0.004 });
    prev = next;
  }
}

/** `count` leaf blobs scattered in a disc of `radius`, two of every three topped with a flower. */
export function flowerTuft( // tp (27267)
  kit: MeshKit,
  rng: { next(): number },
  x: number,
  y: number,
  z: number,
  radius: number,
  count: number,
  colors: readonly THREE.ColorRepresentation[],
): void {
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * radius;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    kit.blob(0.035 + rng.next() * 0.015, px, y + 0.03, pz, i % 3 == 0 ? PALETTE.leafDark : PALETTE.leaf, {
      scale: [1.2, 0.6, 1.2],
      detail: 0,
      ao: false,
    });
    if (i % 3 != 0)
      kit.blob(0.026 + rng.next() * 0.01, px, y + 0.07 + rng.next() * 0.03, pz, colors[i % colors.length], {
        detail: 0,
        ao: false,
        grad: 0.1,
      });
  }
}

/** Pumpkin season weight from the year fraction (same curve as the pumpkin vertex shader). */
export function pumpkinSeason(yearFrac: number): number { // rp (27287)
  const ss = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return ss(0.49, 0.58, yearFrac) * (1 - ss(0.84, 0.92, yearFrac));
}

function createGardenMaterials() { // ip (27294)
  return {
    warmGlass: patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: `#e2f3ef`,
        transparent: true,
        opacity: 0.3,
        roughness: 0.06,
        metalness: 0.15,
        depthWrite: false,
        emissive: new THREE.Color(PALETTE.lanternGlow),
        emissiveIntensity: 1.3,
        side: THREE.DoubleSide,
      }),
      {
        vertexHeader: `varying vec3 vGhLocal;`,
        vertex: `vGhLocal = transformed;`,
        fragmentHeader: `varying vec3 vGhLocal;`,
        fragment: `
        float ghNight = 1.0 - smoothstep(0.08, 0.6, uDaylight);
        float ghNear = clamp(1.25 - length((vGhLocal - vec3(0.08, 0.72, 0.0)) * vec3(1.0, 1.2, 1.3)) * 1.35, 0.18, 1.0);
        totalEmissiveRadiance *= ghNight * ghNear * (0.85 + 0.15 * sin(uTime * 1.3 + vScWorldPos.x * 2.0));
        diffuseColor.a = mix(diffuseColor.a, 0.24 + 0.3 * ghNear, ghNight);`,
        cacheKey: `lm-garden-glass`,
      },
    ),
    pumpkin: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 }),
      {
        snow: 1,
        vertexHeader: `attribute vec3 aCenter;`,
        vertex: `
      float pkY = smoothstep(0.49, 0.58, uYear) * (1.0 - smoothstep(0.84, 0.92, uYear));
      float pkD = fract(sin(dot(aCenter.xz, vec2(12.9898, 78.233))) * 43758.5453) * 0.45;
      float pkK = clamp(pkY * 1.45 - pkD, 0.0, 1.0);
      pkK = pkK * pkK * (3.0 - 2.0 * pkK);
      transformed = aCenter + (transformed - aCenter) * pkK;`,
        cacheKey: `lm-garden-pumpkin`,
      },
    ),
    ribbon: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, flatShading: true }),
      {
        snow: 0.5,
        vertex: `
      float rbR = length(transformed.xz);
      float rbK = max(0.0, rbR - 0.12);
      float rbA = atan(transformed.z, transformed.x + 1e-6);
      vec2 rbT = vec2(-transformed.z, transformed.x) / max(rbR, 1e-3);
      float rbW = (0.45 + uWindStrength);
      transformed.xz += rbT * sin(uTime * 3.6 + rbR * 5.5 + rbA * 3.0) * 0.07 * rbK * rbW;
      transformed.y += sin(uTime * 2.9 + rbR * 4.5 + rbA * 2.0) * 0.06 * rbK * rbW;`,
        cacheKey: `lm-garden-ribbon`,
      },
    ),
    knit: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
      {
        snow: 0.22,
        cacheKey: `lm-garden-knit`,
      },
    ),
  };
}

export type GardenMaterials = ReturnType<typeof createGardenMaterials>;

let gardenCache: GardenMaterials | null = null; // np (27286)

/** Garden landmark materials: warmGlass, pumpkin, ribbon, knit. Built on first use. */
export function gardenMaterials(): GardenMaterials { // ap (27349)
  return (gardenCache ??= createGardenMaterials());
}

/** Linear RGB triple of a colour. */
export function rgb(color: THREE.ColorRepresentation): [number, number, number] { // op (27352)
  const c = new THREE.Color(color);
  return [c.r, c.g, c.b];
}

/** Adds dv to a spring's velocity and clamps it to [-max, max]. */
export function kick(spring: Spring, dv: number, max: number): void { // sp (27356)
  spring.v = Math.max(-max, Math.min(max, spring.v + dv));
}

/** Builds the kit, recentres it on (x, y, z) and returns a mesh placed there, so it turns about that pivot. */
export function pivotMesh( // cp (27359)
  kit: MeshKit,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  castShadow = true,
): THREE.Mesh {
  const geometry = kit.build();
  geometry.translate(-x, -y, -z);
  const mesh = landmarkMesh(geometry, material, castShadow);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Unit poke direction (from the poker to the hit point) in the landmark's local frame; (0, -1) when degenerate. */
export function pokeDirLocal(poke: LandmarkPoke, rotY: number, out: { x: number; z: number }): void { // lp (27365)
  let dx = poke.point.x - poke.from.x;
  let dz = poke.point.z - poke.from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) {
    dx = 0;
    dz = -1;
  } else {
    dx /= len;
    dz /= len;
  }
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
}
