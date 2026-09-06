/**
 * The four-legged walk cycle, in one place the verifier can read.
 *
 * These numbers used to sit as private constants inside the actor, which meant
 * the static gait re-simulation had to hardcode copies of them and could pass
 * while testing a stride nobody was walking. Exporting them is what makes that
 * check honest.
 *
 * A four-beat walk: each limb plants a quarter cycle after the last, in the
 * lateral sequence hind-left, front-left, hind-right, front-right.
 *
 * The duty factor must stay at or above 0.5. Four evenly spaced phases put
 * exactly two limbs on the ground at 0.5 and only one below it, and the verifier
 * requires two — so this rig walks and does not trot. A faster deer is a faster
 * walk, not a different gait: the phase is driven by distance travelled, so the
 * legs cycle correctly at any speed without a second table.
 */
export const QUADRUPED_STRIDE_LENGTH_METERS = 1.35;
export const QUADRUPED_STANCE_DUTY_FACTOR = 0.68;
export const QUADRUPED_PHASE_OFFSETS = [0.25, 0.75, 0, 0.5];
