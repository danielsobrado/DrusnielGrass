import type { ActorAnimationInput } from "../animation/ActorAnimationInput";
import type { ActorPoseStage } from "../animation/ActorAnimationProfile";
import type { ActorGait } from "../animation/ActorGait";
import type { ActorPose } from "../animation/ActorPose";
import {
  multiplyQuaternions,
  setQuaternionFromEulerXyz,
} from "../math/ActorTransformMath";
import type { ActorRigDefinition } from "../rig/ActorRigDefinition";
import type { ActorRigInstance } from "../rig/ActorRigInstance";

export interface ActorLookSegment {
  readonly bone: number;
  readonly weight: number;
}

export interface ActorLookIkOptions {
  readonly definition: ActorRigDefinition;
  readonly segments: readonly ActorLookSegment[];
  readonly maxYawRadians?: number;
  readonly maxPitchRadians?: number;
  readonly smoothingRate?: number;
}

const scratchRotation = new Float32Array(4);

/**
 * Generic look solver.
 *
 * Distributes yaw and pitch across an ordered chain of bones with fractional
 * contributions and angular limits. Because it operates on declared indexes,
 * the same solver serves a humanoid looking over its shoulder and an animal
 * tracking prey.
 *
 * Allocates nothing in per-frame hot paths.
 */
export class ActorLookIk implements ActorPoseStage {
  readonly name = "look-ik";
  private readonly segments: readonly ActorLookSegment[];
  private readonly maxYaw: number;
  private readonly maxPitch: number;
  private readonly smoothingRate: number;

  private active = false;
  private targetDirX = 0;
  private targetDirY = 0;
  private targetDirZ = 1;
  private currentYaw = 0;
  private currentPitch = 0;

  constructor(options: ActorLookIkOptions) {
    this.segments = options.segments;
    this.maxYaw = options.maxYawRadians ?? Math.PI * 0.42;
    this.maxPitch = options.maxPitchRadians ?? Math.PI * 0.25;
    this.smoothingRate = options.smoothingRate ?? 10;
  }

  setLookDirection(x: number, y: number, z: number): void {
    const length = Math.hypot(x, y, z);
    if (length < 1e-4) {
      this.clear();
      return;
    }
    this.targetDirX = x / length;
    this.targetDirY = y / length;
    this.targetDirZ = z / length;
    this.active = true;
  }

  setLookTarget(
    actorWorldX: number,
    actorWorldY: number,
    actorWorldZ: number,
    targetWorldX: number,
    targetWorldY: number,
    targetWorldZ: number,
  ): void {
    this.setLookDirection(
      targetWorldX - actorWorldX,
      targetWorldY - actorWorldY,
      targetWorldZ - actorWorldZ,
    );
  }

  clear(): void {
    this.active = false;
  }

  apply(
    input: ActorAnimationInput,
    deltaSeconds: number,
    _gait: ActorGait,
    pose: ActorPose,
    _rigInstance: ActorRigInstance,
  ): void {
    let desiredYaw = 0;
    let desiredPitch = 0;

    if (this.active) {
      // Rotate world look vector into actor heading space (around Y by -facing)
      const facing = input.facing;
      const cosF = Math.cos(-facing);
      const sinF = Math.sin(-facing);
      const localX = cosF * this.targetDirX - sinF * this.targetDirZ;
      const localZ = sinF * this.targetDirX + cosF * this.targetDirZ;
      const localY = this.targetDirY;

      // Only engage if target is in the front hemisphere
      if (localZ > 0.05) {
        desiredYaw = Math.atan2(localX, localZ);
        const horizontalDistance = Math.hypot(localX, localZ);
        desiredPitch = -Math.atan2(localY, Math.max(horizontalDistance, 1e-4));

        desiredYaw = Math.max(-this.maxYaw, Math.min(this.maxYaw, desiredYaw));
        desiredPitch = Math.max(
          -this.maxPitch,
          Math.min(this.maxPitch, desiredPitch),
        );
      }
    }

    const blend = 1 - Math.exp(-this.smoothingRate * deltaSeconds);
    this.currentYaw += (desiredYaw - this.currentYaw) * blend;
    this.currentPitch += (desiredPitch - this.currentPitch) * blend;

    if (Math.abs(this.currentYaw) < 1e-4 && Math.abs(this.currentPitch) < 1e-4) {
      return;
    }

    const segments = this.segments;
    const count = segments.length;
    for (let index = 0; index < count; index += 1) {
      const seg = segments[index];
      const weight = seg.weight;
      if (weight <= 0) {
        continue;
      }
      const segYaw = this.currentYaw * weight;
      const segPitch = this.currentPitch * weight;

      setQuaternionFromEulerXyz(scratchRotation, 0, segPitch, segYaw, 0);
      multiplyQuaternions(
        pose.rotations,
        seg.bone,
        pose.rotations,
        seg.bone,
        scratchRotation,
        0,
      );
    }
  }

  reset(): void {
    this.active = false;
    this.currentYaw = 0;
    this.currentPitch = 0;
  }
}
