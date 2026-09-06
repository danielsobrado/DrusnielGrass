/**
 * Bind-pose geometry for the humanoid actor rig.
 *
 * These numbers were extracted verbatim from the original pivot-group player
 * rig so the skeletal migration can be proven to leave the bind pose alone.
 * They are structural rig contracts rather than product tuning, so they stay in
 * TypeScript instead of `world.yaml` (see the actor rig plan, section 31).
 *
 * All offsets are local to the parent joint, in unscaled character units.
 * `+Y` is up, `+Z` is actor forward, `+X` is actor right.
 */

/** Pelvis height above the actor root. */
export const HUMANOID_PELVIS_HEIGHT = 0.9;
/** Pelvis to chest. The spine chain subdivides this without moving the chest. */
export const HUMANOID_CHEST_OFFSET_Y = 0.28;
/** Fractions of the pelvis-to-chest offset held by each spine joint. */
export const HUMANOID_SPINE_LOWER_FRACTION = 0.36;
export const HUMANOID_SPINE_UPPER_FRACTION = 0.36;
/** Chest to neck. */
export const HUMANOID_NECK_OFFSET_Y = 0.43;
/** Neck to head. */
export const HUMANOID_HEAD_OFFSET_Y = 0.14;
/** Pelvis to skirt root. */
export const HUMANOID_SKIRT_OFFSET_Y = 0.08;

/** Chest to clavicle. The upper arm sits on the clavicle at zero offset. */
export const HUMANOID_SHOULDER_OFFSET_X = 0.215;
export const HUMANOID_SHOULDER_OFFSET_Y = 0.33;
export const HUMANOID_SHOULDER_OFFSET_Z = 0.03;
/** Upper arm to forearm. */
export const HUMANOID_ELBOW_OFFSET_X = 0.038;
export const HUMANOID_ELBOW_OFFSET_Y = -0.29;
/** Forearm to hand. */
export const HUMANOID_WRIST_OFFSET_Y = -0.275;
export const HUMANOID_WRIST_OFFSET_Z = 0.012;

/** Pelvis to thigh. */
export const HUMANOID_HIP_OFFSET_X = 0.1;
export const HUMANOID_HIP_OFFSET_Y = -0.02;
/** Thigh to shin. */
export const HUMANOID_KNEE_OFFSET_Y = -0.44;
/** Shin to foot. */
export const HUMANOID_ANKLE_OFFSET_Y = -0.37;
/** Foot to toe. The boot mesh stays on the foot; the toe only bends. */
export const HUMANOID_TOE_OFFSET_Y = -0.06;
export const HUMANOID_TOE_OFFSET_Z = 0.1;

/** Sole height below the ankle, used by contact IK to place the foot. */
export const HUMANOID_ANKLE_TO_SOLE = 0.09;

/** Rest lengths of the two-bone chains, derived from the bind offsets. */
export const HUMANOID_THIGH_LENGTH = -HUMANOID_KNEE_OFFSET_Y;
export const HUMANOID_SHIN_LENGTH = -HUMANOID_ANKLE_OFFSET_Y;
export const HUMANOID_UPPER_ARM_LENGTH = Math.hypot(
  HUMANOID_ELBOW_OFFSET_X,
  HUMANOID_ELBOW_OFFSET_Y,
);
export const HUMANOID_FOREARM_LENGTH = Math.hypot(
  HUMANOID_WRIST_OFFSET_Y,
  HUMANOID_WRIST_OFFSET_Z,
);
