import {
  clamp,
  getEulerXyzFromQuaternion,
  setQuaternionFromEulerXyz,
} from "../math/ActorTransformMath";
import type { ActorBoneIndex } from "./ActorBoneIndex";

/**
 * A per-axis rotation limit on one bone, in radians.
 *
 * The constraint engine is deliberately anatomy-free: it clamps XYZ Euler
 * ranges on whatever bone a rig definition names. Which joints have limits, and
 * what those limits are, is family data.
 */
export interface ActorJointLimit {
  readonly bone: ActorBoneIndex;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const scratchEuler = new Float32Array(3);

/**
 * Clamps one bone's local rotation into its declared range.
 *
 * Runs on the handful of limited joints a profile declares rather than the
 * whole skeleton, and allocates nothing.
 */
export function applyActorJointLimit(
  rotations: Float32Array,
  limit: ActorJointLimit,
): void {
  getEulerXyzFromQuaternion(rotations, limit.bone, scratchEuler);
  const x = clamp(scratchEuler[0], limit.minX, limit.maxX);
  const y = clamp(scratchEuler[1], limit.minY, limit.maxY);
  const z = clamp(scratchEuler[2], limit.minZ, limit.maxZ);
  if (x === scratchEuler[0] && y === scratchEuler[1] && z === scratchEuler[2]) {
    return;
  }
  setQuaternionFromEulerXyz(rotations, limit.bone, x, y, z);
}

/** Clamps every declared limit on a pose's rotation buffer. */
export function applyActorJointLimits(
  rotations: Float32Array,
  limits: readonly ActorJointLimit[],
): void {
  for (let index = 0; index < limits.length; index += 1) {
    applyActorJointLimit(rotations, limits[index]);
  }
}

export function isActorJointLimitOrdered(limit: ActorJointLimit): boolean {
  return (
    Number.isFinite(limit.minX) &&
    Number.isFinite(limit.maxX) &&
    Number.isFinite(limit.minY) &&
    Number.isFinite(limit.maxY) &&
    Number.isFinite(limit.minZ) &&
    Number.isFinite(limit.maxZ) &&
    limit.minX <= limit.maxX &&
    limit.minY <= limit.maxY &&
    limit.minZ <= limit.maxZ
  );
}
