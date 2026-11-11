// Architecture generator core: parametric tiered buildings from ArchParams.
// buildArchitecture() returns stage geometries (base, tier 1..n, ornaments) for the reveal,
// plus the measured size. Pure: three.js geometry only, no scene, no DOM.
import type * as THREE from "three";
import { buildJapaneseCastle, buildPagoda, buildShrine, type BuildInfo } from "./japanese";
import { MAT_IDS, MeshBuilder, Rand, stageGeometries, type MatId } from "./mesh";
import type { ArchParams } from "./params";
import { buildModernTower } from "./tower";
import { buildMedievalKeep } from "./western";
import { buildYard } from "./yard";

export * from "./params";

export type ArchStage = { label: string; minY: number; geometries: Partial<Record<MatId, THREE.BufferGeometry>> };

export type BuiltArchitecture = {
  stages: ArchStage[];
  /** Total height in meters (after the height param). */
  height: number;
  /** Half sizes of the footprint (local x, z). */
  half: [number, number];
  /** Footprint radius (circle around the footprint). */
  radius: number;
  triangles: number;
  tiers: number;
};

/** Height range accepted for params.height, as a factor of the style's own height. */
export const HEIGHT_RANGE: [number, number] = [0.75, 1.35];

function buildInto(b: MeshBuilder, p: ArchParams): BuildInfo {
  const rand = new Rand(p.seed * 7919 + p.tiers);
  switch (p.style) {
    case "japanese-castle":
      return buildJapaneseCastle(b, p, rand);
    case "pagoda":
      return buildPagoda(b, p);
    case "torii-and-shrine":
      return buildShrine(b, p);
    case "medieval-keep":
      return buildMedievalKeep(b, p, rand);
    case "modern-tower":
      return buildModernTower(b, p, rand);
  }
}

/** Scales y of every vertex (keeps the building on y = 0). */
function scaleY(b: MeshBuilder, f: number) {
  if (Math.abs(f - 1) < 1e-6) return;
  for (const s of b.stages) {
    s.minY *= f;
    for (const m of MAT_IDS) {
      const pos = s.buckets[m].pos;
      for (let i = 1; i < pos.length; i += 3) pos[i] *= f;
    }
  }
}

/** The building's own height for these params (before params.height). */
export function naturalHeight(p: ArchParams): number {
  const b = new MeshBuilder();
  return buildInto(b, { ...p, detail: 0 }).height;
}

export function buildArchitecture(p: ArchParams): BuiltArchitecture {
  const b = new MeshBuilder();
  const info = buildInto(b, p);
  let f = 1;
  // The modern tower builds at its world height itself; the other styles scale within HEIGHT_RANGE.
  if (p.height > 0 && p.style !== "modern-tower") f = Math.max(HEIGHT_RANGE[0], Math.min(HEIGHT_RANGE[1], p.height / info.height));
  scaleY(b, f);
  const triangles = b.triangleCount();
  const stages = b.stages
    .map((s) => ({ label: s.label, minY: Number.isFinite(s.minY) ? Math.max(0, s.minY) : 0, geometries: stageGeometries(s) }))
    .filter((s) => Object.keys(s.geometries).length > 0);
  return {
    stages,
    height: info.height * f,
    half: info.half,
    radius: Math.hypot(info.half[0], info.half[1]),
    triangles,
    tiers: p.tiers
  };
}

export type BuiltYard = { stages: ArchStage[]; half: [number, number]; radius: number; triangles: number; height: number };

/** The surroundings (stone yard or garden) for a building of these params, or null for "none". */
export function buildSurroundings(p: ArchParams, building: { half: [number, number] }): BuiltYard | null {
  if (p.surround === "none") return null;
  const b = new MeshBuilder();
  const info = buildYard(b, p, building.half, new Rand(p.seed * 31 + 7));
  return {
    stages: b.stages.map((s) => ({ label: s.label, minY: Math.max(0, s.minY), geometries: stageGeometries(s) })),
    half: info.half,
    radius: Math.hypot(info.half[0], info.half[1]),
    triangles: b.triangleCount(),
    height: info.height
  };
}

/** Reveal timeline (ms from the start) of each stage: base first, then each tier, then ornaments. */
export function stageTimeline(stages: { label: string }[]): { start: number; duration: number }[] {
  let t = 0;
  return stages.map((s) => {
    const duration = /base/i.test(s.label) ? 700 : /ornament/i.test(s.label) ? 600 : 480;
    const slot = { start: t, duration };
    t += duration * 0.8;
    return slot;
  });
}
