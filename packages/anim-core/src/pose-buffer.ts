import type { PoseBuffer, RigDefinition } from "./types";

export function createPoseBuffer(boneCount: number): PoseBuffer {
  return {
    boneCount,
    translations: new Float32Array(boneCount * 3),
    rotations: new Float32Array(boneCount * 4),
    scales: new Float32Array(boneCount * 3)
  };
}

export function createPoseBufferFromRig(rig: RigDefinition): PoseBuffer {
  const pose = createPoseBuffer(rig.boneNames.length);
  copyRigBindPose(rig, pose);
  return pose;
}

export function copyPose(source: PoseBuffer, target: PoseBuffer): PoseBuffer {
  target.translations.set(source.translations);
  target.rotations.set(source.rotations);
  target.scales.set(source.scales);
  return target;
}

export function copyRigBindPose(rig: RigDefinition, target: PoseBuffer): PoseBuffer {
  target.translations.set(rig.bindTranslations);
  target.rotations.set(rig.bindRotations);
  target.scales.set(rig.bindScales);
  return target;
}

export function setBoneTranslation(
  pose: PoseBuffer,
  boneIndex: number,
  x: number,
  y: number,
  z: number
): void {
  const offset = boneIndex * 3;
  pose.translations[offset] = x;
  pose.translations[offset + 1] = y;
  pose.translations[offset + 2] = z;
}

export function setBoneRotation(
  pose: PoseBuffer,
  boneIndex: number,
  x: number,
  y: number,
  z: number,
  w: number
): void {
  const offset = boneIndex * 4;
  pose.rotations[offset] = x;
  pose.rotations[offset + 1] = y;
  pose.rotations[offset + 2] = z;
  pose.rotations[offset + 3] = w;
}

export function setBoneScale(
  pose: PoseBuffer,
  boneIndex: number,
  x: number,
  y: number,
  z: number
): void {
  const offset = boneIndex * 3;
  pose.scales[offset] = x;
  pose.scales[offset + 1] = y;
  pose.scales[offset + 2] = z;
}

export function createRigDefinition(input: {
  boneNames: string[];
  parentIndices: number[] | Int16Array;
  rootBoneIndex: number;
  bindTranslations: number[] | Float32Array;
  bindRotations: number[] | Float32Array;
  bindScales: number[] | Float32Array;
}): RigDefinition {
  return {
    boneNames: [...input.boneNames],
    parentIndices: Int16Array.from(input.parentIndices),
    rootBoneIndex: input.rootBoneIndex,
    bindTranslations: Float32Array.from(input.bindTranslations),
    bindRotations: Float32Array.from(input.bindRotations),
    bindScales: Float32Array.from(input.bindScales)
  };
}
