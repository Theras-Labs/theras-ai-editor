export interface PoseBuffer {
  readonly boneCount: number;
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly scales: Float32Array;
}

export interface RigDefinition {
  readonly boneNames: string[];
  readonly parentIndices: Int16Array;
  readonly rootBoneIndex: number;
  readonly bindTranslations: Float32Array;
  readonly bindRotations: Float32Array;
  readonly bindScales: Float32Array;
}

export interface BoneMask {
  readonly weights: Float32Array;
}

export interface RootMotionDelta {
  readonly translation: Float32Array;
  yaw: number;
}

export interface AnimationTrack {
  boneIndex: number;
  translationTimes?: Float32Array;
  translationValues?: Float32Array;
  rotationTimes?: Float32Array;
  rotationValues?: Float32Array;
  scaleTimes?: Float32Array;
  scaleValues?: Float32Array;
}

export interface AnimationClipAsset {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly rootBoneIndex?: number;
  readonly tracks: AnimationTrack[];
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}
