import { multiplyQuaternions } from "../math/ActorTransformMath";
import type { ActorRigDefinition } from "../rig/ActorRigDefinition";
import type { ActorPose } from "./ActorPose";

/**
 * Model-space transforms resolved from a local-space pose.
 *
 * IK solvers need to know where a joint actually is, but a pose stores only
 * local transforms. This runs one forward pass over the bone table — which is
 * possible in a single loop because rig definitions are topologically ordered —
 * and writes packed model-space positions and rotations. It allocates once, per
 * actor, and never in a frame.
 */
export class ActorPoseSpace {
  /** Model-space positions, 3 elements per bone. */
  readonly positions: Float32Array;
  /** Model-space rotations, 4 elements per bone. */
  readonly rotations: Float32Array;

  constructor(private readonly definition: ActorRigDefinition) {
    this.positions = new Float32Array(definition.boneCount * 3);
    this.rotations = new Float32Array(definition.boneCount * 4);
  }

  /** Recomputes every bone's model transform from `pose`. */
  update(pose: ActorPose): void {
    const { boneCount, parents, bindPositions, translatableFlags } =
      this.definition;
    const positions = this.positions;
    const rotations = this.rotations;
    for (let bone = 0; bone < boneCount; bone += 1) {
      const parent = parents[bone];
      const base = bone * 3;
      let localX = bindPositions[base];
      let localY = bindPositions[base + 1];
      let localZ = bindPositions[base + 2];
      if (translatableFlags[bone] === 1) {
        localX += pose.translations[base];
        localY += pose.translations[base + 1];
        localZ += pose.translations[base + 2];
      }
      const rotationBase = bone * 4;
      if (parent < 0) {
        positions[base] = localX;
        positions[base + 1] = localY;
        positions[base + 2] = localZ;
        rotations[rotationBase] = pose.rotations[rotationBase];
        rotations[rotationBase + 1] = pose.rotations[rotationBase + 1];
        rotations[rotationBase + 2] = pose.rotations[rotationBase + 2];
        rotations[rotationBase + 3] = pose.rotations[rotationBase + 3];
        continue;
      }
      const parentBase = parent * 3;
      const parentRotation = parent * 4;
      const qx = rotations[parentRotation];
      const qy = rotations[parentRotation + 1];
      const qz = rotations[parentRotation + 2];
      const qw = rotations[parentRotation + 3];
      // Rotate the local offset by the parent's model rotation:
      // v' = v + 2 * qv x (qv x v + qw * v)
      const tx = 2 * (qy * localZ - qz * localY);
      const ty = 2 * (qz * localX - qx * localZ);
      const tz = 2 * (qx * localY - qy * localX);
      positions[base] =
        positions[parentBase] + localX + qw * tx + (qy * tz - qz * ty);
      positions[base + 1] =
        positions[parentBase + 1] + localY + qw * ty + (qz * tx - qx * tz);
      positions[base + 2] =
        positions[parentBase + 2] + localZ + qw * tz + (qx * ty - qy * tx);
      multiplyQuaternions(rotations, bone, rotations, parent, pose.rotations, bone);
    }
  }
}
