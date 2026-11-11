import type { QuatLike, RootMotionDelta, Vec3Like } from "./types";

export type RootMotionMode = "none" | "full" | "xz" | "xz-yaw";

export function createRootMotionDelta(): RootMotionDelta {
  return {
    translation: new Float32Array(3),
    yaw: 0
  };
}

export function resetRootMotionDelta(delta: RootMotionDelta): RootMotionDelta {
  delta.translation[0] = 0;
  delta.translation[1] = 0;
  delta.translation[2] = 0;
  delta.yaw = 0;
  return delta;
}

export function extractRootMotionDelta(
  previousTranslation: Vec3Like,
  previousRotation: QuatLike,
  nextTranslation: Vec3Like,
  nextRotation: QuatLike,
  mode: RootMotionMode,
  out: RootMotionDelta = createRootMotionDelta()
): RootMotionDelta {
  resetRootMotionDelta(out);

  if (mode === "none") {
    return out;
  }

  out.translation[0] = nextTranslation.x - previousTranslation.x;
  out.translation[1] = nextTranslation.y - previousTranslation.y;
  out.translation[2] = nextTranslation.z - previousTranslation.z;

  if (mode === "xz" || mode === "xz-yaw") {
    out.translation[1] = 0;
  }

  if (mode === "xz-yaw" || mode === "full") {
    out.yaw = getYawFromQuaternion(nextRotation) - getYawFromQuaternion(previousRotation);
  }

  return out;
}

export function getYawFromQuaternion(rotation: QuatLike): number {
  const { x, y, z, w } = rotation;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}
