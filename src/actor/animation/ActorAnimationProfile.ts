import type { ActorRigDefinition } from "../rig/ActorRigDefinition";
import type { ActorRigInstance } from "../rig/ActorRigInstance";
import type { ActorAnimationInput } from "./ActorAnimationInput";
import type { ActorEasing } from "./ActorPoseBlender";
import type { ActorGait } from "./ActorGait";
import type { ActorPose } from "./ActorPose";

/**
 * How one actor family turns facts into a base pose.
 *
 * A humanoid gait and a quadruped gait share no equations, so they are separate
 * implementations of this contract rather than branches inside one locomotion
 * class. The shared runtime owns the pose buffers and the blending; the layer
 * only decides how its own bones move.
 */
export interface ActorLocomotionLayer {
  /** Number of locomotion states this layer can be in. */
  readonly stateCount: number;
  /** Advances retained locomotion clocks once for this runtime frame. */
  advanceTime(deltaSeconds: number): void;
  /** Chooses the state for this frame, given the state it is currently in. */
  selectState(
    input: ActorAnimationInput,
    currentState: number,
    stateTimeSeconds: number,
  ): number;
  /** Blend duration into `toState`, in seconds. */
  transitionDuration(fromState: number, toState: number): number;
  transitionEasing(fromState: number, toState: number): ActorEasing;
  /** Writes the base pose for `state` into `target`. */
  generatePose(
    input: ActorAnimationInput,
    state: number,
    stateTimeSeconds: number,
    gait: ActorGait,
    target: ActorPose,
  ): void;
  reset(): void;
  /** Debug-only name. Never called in a frame. */
  stateName(state: number): string;
}

/**
 * A stage the runtime runs after the base pose, if the family supports it.
 *
 * Contact IK, reach IK, and look IK are all installed this way, so an actor
 * with no hands simply has no reach stage rather than a disabled one.
 */
export interface ActorPoseStage {
  readonly name: string;
  apply(
    input: ActorAnimationInput,
    deltaSeconds: number,
    gait: ActorGait,
    pose: ActorPose,
    rigInstance: ActorRigInstance,
  ): void;
  reset(): void;
}

/**
 * Secondary motion consumes the final primary pose.
 *
 * Cape, hair, skirt, and a quadruped tail all implement this; none of them is
 * known to the runtime beyond this hook.
 */
export interface ActorSecondaryMotion {
  update(
    deltaSeconds: number,
    input: ActorAnimationInput,
    rigInstance: ActorRigInstance,
  ): void;
  reset(): void;
  dispose(): void;
}

/**
 * Everything one actor family installs on the shared runtime.
 *
 * Absent capabilities are absent fields. There is no `hasCrouch` boolean and no
 * unreachable state — a deer profile simply has no reach stage and no action
 * layers.
 */
export interface ActorAnimationProfile {
  readonly definition: ActorRigDefinition;
  readonly locomotion: ActorLocomotionLayer;
  readonly gait: ActorGait;
  /** Constraints enforced before IK reads the pose. */
  readonly preIkStages?: readonly ActorPoseStage[];
  /** Contact, reach, and look solving, in the order the family wants them. */
  readonly ikStages?: readonly ActorPoseStage[];
  readonly secondaryMotion?: readonly ActorSecondaryMotion[];
  /** Applied last, after every stage has written the pose. */
  readonly enforceJointLimits: boolean;
}
