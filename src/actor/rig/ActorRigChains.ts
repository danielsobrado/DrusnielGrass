import type { ActorBoneIndex } from "./ActorBoneIndex";

/**
 * A resolved two-bone chain: root joint, mid joint, and end effector.
 *
 * The descriptor carries everything a solver needs, so the solver never has to
 * know whether it is bending a knee, an elbow, a front paw, or a bird leg. The
 * pole is an explicit direction in rig space rather than something inferred
 * from a bone name.
 */
export interface ActorTwoBoneChain {
  readonly name: string;
  readonly root: ActorBoneIndex;
  readonly mid: ActorBoneIndex;
  readonly end: ActorBoneIndex;
  /** Optional bone whose orientation is aligned after the solve, or -1. */
  readonly terminal: number;
  /** Rest length from root to mid. */
  readonly upperLength: number;
  /** Rest length from mid to end. */
  readonly lowerLength: number;
  /**
   * Unit direction the upper segment points in the root bone's local space,
   * and the lower segment in the mid bone's. A solver aims these rather than
   * assuming a bone's "down" axis, so a rig may lay its limbs out any way.
   */
  readonly upperAxisX: number;
  readonly upperAxisY: number;
  readonly upperAxisZ: number;
  readonly lowerAxisX: number;
  readonly lowerAxisY: number;
  readonly lowerAxisZ: number;
  /** Preferred bend direction, in the chain root's parent space. */
  readonly poleX: number;
  readonly poleY: number;
  readonly poleZ: number;
  /** Bend limits at the mid joint, in radians. */
  readonly minBendRadians: number;
  readonly maxBendRadians: number;
}

/**
 * What a chain's end effector is for. Profiles decide which effectors are
 * active; the core never solves an effector just because it was declared.
 */
export type ActorEffectorKind =
  | "groundContact"
  | "reach"
  | "look"
  | "effectOrigin"
  | "mouth";

export interface ActorEffectorDefinition {
  readonly name: string;
  readonly kind: ActorEffectorKind;
  readonly chain: string;
  /** Gait phase offset in cycles, for contact effectors. */
  readonly phaseOffset: number;
}

/** Total reach of a chain at full extension. */
export function actorChainReach(chain: ActorTwoBoneChain): number {
  return chain.upperLength + chain.lowerLength;
}
