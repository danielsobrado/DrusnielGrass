import {
  multiplyConjugateQuaternion,
  multiplyQuaternions,
  setQuaternionFromEulerXyz,
  slerpQuaternion,
} from "../math/ActorTransformMath";
import type { ActorRigDefinition } from "../rig/ActorRigDefinition";

const IDENTITY = new Float32Array([0, 0, 0, 1]);
// Shared additive scratch. Actor updates never interleave, so one buffer is
// enough and it keeps the additive path allocation-free.
const scratchDelta = new Float32Array(4);

/**
 * One actor's local-space pose.
 *
 * A pose is packed `Float32Array` storage sized from `rigDefinition.boneCount`,
 * allocated once when the actor is created. There is no object per bone, no
 * map, and no assumption about how many bones a rig has. Rotations are always
 * quaternions — Euler interpolation is never used for blending.
 */
export class ActorPose {
  readonly boneCount: number;
  /** Local rotation quaternions, 4 elements per bone. */
  readonly rotations: Float32Array;
  /** Local translation offsets from bind, 3 elements per bone. */
  readonly translations: Float32Array;

  constructor(private readonly definition: ActorRigDefinition) {
    this.boneCount = definition.boneCount;
    this.rotations = new Float32Array(this.boneCount * 4);
    this.translations = new Float32Array(this.boneCount * 3);
    this.resetToBind();
  }

  /** Restores the rig's neutral reference pose. */
  resetToBind(): void {
    this.rotations.set(this.definition.bindRotations);
    this.translations.fill(0);
  }

  copyFrom(source: ActorPose): void {
    this.rotations.set(source.rotations);
    this.translations.set(source.translations);
  }

  /** Writes an XYZ Euler rotation for one bone. */
  setEuler(bone: number, x: number, y: number, z: number): void {
    setQuaternionFromEulerXyz(this.rotations, bone, x, y, z);
  }

  setTranslation(bone: number, x: number, y: number, z: number): void {
    const base = bone * 3;
    this.translations[base] = x;
    this.translations[base + 1] = y;
    this.translations[base + 2] = z;
  }

  /** Uniform blend of the whole pose toward `target`. */
  blendToward(target: ActorPose, weight: number): void {
    if (weight <= 0) {
      return;
    }
    if (weight >= 1) {
      this.copyFrom(target);
      return;
    }
    for (let bone = 0; bone < this.boneCount; bone += 1) {
      slerpQuaternion(
        this.rotations,
        bone,
        this.rotations,
        bone,
        target.rotations,
        bone,
        weight,
      );
      const base = bone * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const from = this.translations[base + axis];
        this.translations[base + axis] =
          from + (target.translations[base + axis] - from) * weight;
      }
    }
  }

  /**
   * Blends toward `target` through a per-bone mask.
   *
   * This is how an action layer plays over locomotion. The mask is a plain
   * weight buffer, so the same code serves a humanoid upper body and a
   * quadruped's front limbs.
   */
  blendMasked(target: ActorPose, mask: Float32Array, weight: number): void {
    if (weight <= 0) {
      return;
    }
    for (let bone = 0; bone < this.boneCount; bone += 1) {
      const maskedWeight = mask[bone] * weight;
      if (!(maskedWeight > 0)) {
        continue;
      }
      const boneWeight = maskedWeight >= 1 ? 1 : maskedWeight;
      slerpQuaternion(
        this.rotations,
        bone,
        this.rotations,
        bone,
        target.rotations,
        bone,
        boneWeight,
      );
      const base = bone * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const from = this.translations[base + axis];
        this.translations[base + axis] =
          from + (target.translations[base + axis] - from) * boneWeight;
      }
    }
  }

  /**
   * Applies an additive delta pose on top of this one.
   *
   * `delta` is authored as a normal absolute pose. Its rotation relative to the
   * bind pose is recovered in each bone's local space, then composed on top of
   * whatever locomotion and actions already produced.
   */
  addAdditive(delta: ActorPose, weight: number): void {
    if (weight <= 0) {
      return;
    }
    const scaled = Math.min(weight, 1);
    for (let bone = 0; bone < this.boneCount; bone += 1) {
      multiplyConjugateQuaternion(
        scratchDelta,
        0,
        this.definition.bindRotations,
        bone,
        delta.rotations,
        bone,
      );
      slerpQuaternion(scratchDelta, 0, IDENTITY, 0, scratchDelta, 0, scaled);
      multiplyQuaternions(
        this.rotations,
        bone,
        this.rotations,
        bone,
        scratchDelta,
        0,
      );
      const base = bone * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        this.translations[base + axis] +=
          delta.translations[base + axis] * scaled;
      }
    }
  }

  /**
   * Applies an additive delta pose through a per-bone weight mask.
   */
  addAdditiveMasked(
    delta: ActorPose,
    mask: Float32Array,
    weight: number,
  ): void {
    if (weight <= 0) {
      return;
    }
    for (let bone = 0; bone < this.boneCount; bone += 1) {
      const maskedWeight = mask[bone] * weight;
      if (!(maskedWeight > 0)) {
        continue;
      }
      const scaled = maskedWeight >= 1 ? 1 : maskedWeight;
      multiplyConjugateQuaternion(
        scratchDelta,
        0,
        this.definition.bindRotations,
        bone,
        delta.rotations,
        bone,
      );
      slerpQuaternion(scratchDelta, 0, IDENTITY, 0, scratchDelta, 0, scaled);
      multiplyQuaternions(
        this.rotations,
        bone,
        this.rotations,
        bone,
        scratchDelta,
        0,
      );
      const base = bone * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        this.translations[base + axis] +=
          delta.translations[base + axis] * scaled;
      }
    }
  }
}

