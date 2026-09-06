/**
 * Numerical constants for the humanoid locomotion layer.
 *
 * Most values preserve the recorded player baseline. Locomotion-specific
 * articulation values may be refined when shared player/NPC motion needs a
 * more natural result without changing rig topology or animation ownership.
 */

/** Metres of travel per full gait cycle. The grass trail stamps feet from it. */
export const HUMANOID_STRIDE_LENGTH_METERS = 1.55;
/** Fraction of the cycle each foot spends planted. */
export const HUMANOID_STANCE_DUTY_FACTOR = 0.62;

export const HUMANOID_TAKEOFF_DURATION_SECONDS = 0.11;
export const HUMANOID_APEX_VELOCITY_THRESHOLD = 1.15;
export const HUMANOID_IDLE_SPEED_THRESHOLD = 0.08;
export const HUMANOID_RUN_SPEED_FRACTION = 0.72;

// A positive arm rotation swings the hand behind the hip, and the cloak side
// panels only sweep clear of the body once the character is running — so an
// even arc pushed the hands through the cloth at walking pace. Damp the back
// half of the swing and bias the whole arc forward instead of shortening it.
export const HUMANOID_ARM_BACKSWING_SCALE = 0.55;
export const HUMANOID_ARM_FORWARD_BIAS = 0.09;

export const HUMANOID_THIGH_SWING = 0.68;
// Peak knee flex needs to remain clearly readable after the locomotion blend
// scales the pose at normal walking speeds. The prior value left moving
// humanoids close to a straight-legged gait, especially for NPCs below run pace.
export const HUMANOID_SHIN_SWING = 1.05;
export const HUMANOID_IDLE_BREATH_FREQUENCY = 1.7;
export const HUMANOID_IDLE_BREATH_AMPLITUDE = 0.004;

/** Transition durations between locomotion states, in seconds. */
export const HUMANOID_TRANSITION_DEFAULT_SECONDS = 0.16;
export const HUMANOID_TRANSITION_AIRBORNE_SECONDS = 0.09;
export const HUMANOID_TRANSITION_LANDING_SECONDS = 0.06;

/** AAA Multi-Segment Spine & Pelvic Kinematics Tuning */
export const HUMANOID_PELVIS_SWAY_AMPLITUDE = 0.024;
export const HUMANOID_PELVIS_YAW_AMPLITUDE = 0.038;
export const HUMANOID_SPINE_TWIST_AMPLITUDE = 0.055;
export const HUMANOID_CLAVICLE_SWING_AMPLITUDE = 0.065;
export const HUMANOID_FOOT_ROLL_HEEL_PITCH = 0.16;
export const HUMANOID_FOOT_ROLL_TOE_PITCH = -0.32;
export const HUMANOID_TOE_FLEX_AMPLITUDE = 0.42;

/** Crouch & Roll Action Tuning */
export const HUMANOID_CROUCH_PELVIS_DROP = 0.28;
export const HUMANOID_CROUCH_TORSO_LEAN = 0.22;
export const HUMANOID_CROUCH_THIGH_BEND = 0.58;
export const HUMANOID_CROUCH_SHIN_BEND = 0.78;
export const HUMANOID_CROUCH_STRIDE_SCALE = 0.75;
export const HUMANOID_ROLL_DURATION_SECONDS = 0.68;

