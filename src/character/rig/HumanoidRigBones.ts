import type { ActorBoneIndex } from "../../actor/rig/ActorBoneIndex";

/**
 * Resolved bone indexes for the humanoid topology.
 *
 * Every humanoid actor — the player and any humanoid NPC — shares one immutable
 * rig definition, so these indexes are resolved once when the definition is
 * built and then stored directly. No animation frame looks a bone up by name.
 */
/**
 * Bones every humanoid rig must provide.
 *
 * These are the joints the locomotion layer cannot express a walk without. A
 * rig that cannot fill one of them is not a humanoid as far as this profile is
 * concerned, and fails at initialization rather than animating a missing joint.
 */
export interface HumanoidRequiredBones {
  readonly actorRoot: ActorBoneIndex;
  readonly pelvis: ActorBoneIndex;
  readonly chest: ActorBoneIndex;
  readonly head: ActorBoneIndex;
  readonly upperArmLeft: ActorBoneIndex;
  readonly forearmLeft: ActorBoneIndex;
  readonly handLeft: ActorBoneIndex;
  readonly upperArmRight: ActorBoneIndex;
  readonly forearmRight: ActorBoneIndex;
  readonly handRight: ActorBoneIndex;
  readonly thighLeft: ActorBoneIndex;
  readonly shinLeft: ActorBoneIndex;
  readonly footLeft: ActorBoneIndex;
  readonly thighRight: ActorBoneIndex;
  readonly shinRight: ActorBoneIndex;
  readonly footRight: ActorBoneIndex;
}

/**
 * Joints a humanoid rig may or may not have.
 *
 * The Snowflow rig is authored with all of them; an imported pack rig commonly
 * has no clavicles, no subdivided spine, no neck, and no cloth bones at all.
 * Absence is valid and must stay valid — the alternative is inventing fake
 * bones so a pose can address them, which the architecture rules out.
 */
export interface HumanoidOptionalBones {
  readonly spineLower?: ActorBoneIndex;
  readonly spineUpper?: ActorBoneIndex;
  readonly neck?: ActorBoneIndex;
  readonly clavicleLeft?: ActorBoneIndex;
  readonly clavicleRight?: ActorBoneIndex;
  readonly toeLeft?: ActorBoneIndex;
  readonly toeRight?: ActorBoneIndex;
  readonly hairLeft?: ActorBoneIndex;
  readonly hairRight?: ActorBoneIndex;
  readonly hood?: ActorBoneIndex;
  readonly cloakBack?: ActorBoneIndex;
  readonly cloakLeft?: ActorBoneIndex;
  readonly cloakRight?: ActorBoneIndex;
  readonly skirt?: ActorBoneIndex;
  readonly skirtFront?: ActorBoneIndex;
  readonly skirtLeft?: ActorBoneIndex;
  readonly skirtRight?: ActorBoneIndex;
}

export type HumanoidRigBones = HumanoidRequiredBones & HumanoidOptionalBones;

/**
 * The Snowflow rig fills every optional joint, so player code that legitimately
 * depends on cloth and spine bones can keep reading them without guards.
 */
export type SnowflowRigBones = HumanoidRequiredBones &
  Required<HumanoidOptionalBones>;

/** Chain names the humanoid profile solves. */
export const HUMANOID_CHAIN_LEG_LEFT = "leg.L";
export const HUMANOID_CHAIN_LEG_RIGHT = "leg.R";
export const HUMANOID_CHAIN_ARM_LEFT = "arm.L";
export const HUMANOID_CHAIN_ARM_RIGHT = "arm.R";

/** Contact effector names, consumed by gait and contact IK. */
export const HUMANOID_EFFECTOR_FOOT_LEFT = "foot.L";
export const HUMANOID_EFFECTOR_FOOT_RIGHT = "foot.R";

/** Mask names the humanoid profile resolves once at initialization. */
export const HUMANOID_MASK_FULL_BODY = "fullBody";
export const HUMANOID_MASK_LOWER_BODY = "lowerBody";
export const HUMANOID_MASK_UPPER_BODY = "upperBody";
export const HUMANOID_MASK_LEFT_ARM = "leftArm";
export const HUMANOID_MASK_RIGHT_ARM = "rightArm";
export const HUMANOID_MASK_HEAD_NECK = "headNeck";
