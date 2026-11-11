import type { BoneMask, RigDefinition } from "./types";

export function createBoneMask(boneCount: number, fill = 1): BoneMask {
  const weights = new Float32Array(boneCount);
  weights.fill(fill);
  return { weights };
}

export function cloneBoneMask(mask: BoneMask): BoneMask {
  return { weights: Float32Array.from(mask.weights) };
}

export function createBoneMaskFromBranch(
  rig: RigDefinition,
  rootBoneIndex: number,
  weight = 1,
  fill = 0
): BoneMask {
  const mask = createBoneMask(rig.boneNames.length, fill);
  const queue: number[] = [rootBoneIndex];

  while (queue.length > 0) {
    const current = queue.shift()!;
    mask.weights[current] = weight;

    for (let index = 0; index < rig.parentIndices.length; index += 1) {
      if (rig.parentIndices[index] === current) {
        queue.push(index);
      }
    }
  }

  return mask;
}

export function findBoneIndexByName(rig: RigDefinition, boneName: string): number {
  return rig.boneNames.indexOf(boneName);
}
