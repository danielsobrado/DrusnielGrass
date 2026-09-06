import * as THREE from "three";
import type { ActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import type { ActorLocomotionLayer } from "../../actor/animation/ActorAnimationProfile";
import type { ActorGait } from "../../actor/animation/ActorGait";
import type { ActorPose } from "../../actor/animation/ActorPose";
import type { ActorEasing } from "../../actor/animation/ActorPoseBlender";
import type { QuadrupedMotionFacts } from "./QuadrupedMotionFacts";
import type { QuadrupedRigBones } from "./QuadrupedRigDefinition";

export const QUADRUPED_STATE_IDLE = 0;
export const QUADRUPED_STATE_WALK = 1;
export const QUADRUPED_STATE_GRAZE = 2;
export const QUADRUPED_STATE_ALERT = 3;

const STATE_NAMES = ["idle", "walk", "graze", "alert"] as const;
const IDLE_SPEED_THRESHOLD = 0.06;
const LIMB_SWING = 0.52;
const LIMB_FOLD = 0.42;
const BREATH_FREQUENCY = 1.1;
const BREATH_AMPLITUDE = 0.008;

/** Neck and head angles per standing state, in radians. */
/**
 * Feeding, spread across four joints.
 *
 * A deer's neck is not long enough to put its mouth on the ground on its own —
 * it drops its shoulders as well. Loading the whole angle into the neck instead
 * either leaves the muzzle at chest height or curls it back under the animal's
 * own throat, and both were visible before this was split up. The four pitches
 * sum to roughly a right angle, which is what points the muzzle down.
 */
const GRAZE_SPINE_PITCH = 0.12;
const GRAZE_CHEST_PITCH = 0.3;
const GRAZE_NECK_PITCH = 1.05;
const GRAZE_HEAD_PITCH = 0.15;
const GRAZE_BODY_DROP = 0.06;
const ALERT_NECK_PITCH = -0.42;
const ALERT_HEAD_PITCH = 0.3;
/** A slow jaw bob while feeding. */
const CHEW_FREQUENCY = 2.6;
const CHEW_AMPLITUDE = 0.035;
const ALERT_BREATH_FREQUENCY = 2.1;
/**
 * How long a standing state must hold before another can take it.
 *
 * Without this an animal on the boundary between feeding and watching flips
 * between the two every frame, which is far more obviously wrong than either
 * pose being slightly late.
 */
const STANDING_STATE_DWELL_SECONDS = 0.65;

/**
 * A four-legged walk.
 *
 * It shares no equations with the humanoid layer — the point of the shared
 * runtime is that it does not have to. Each limb reads its own phase from the
 * gait table and folds in the direction its chain's pole selects, and the whole
 * thing writes into the same pose buffers the player uses.
 */
export class QuadrupedLocomotionLayer implements ActorLocomotionLayer {
  readonly stateCount = STATE_NAMES.length;
  private animationTime = 0;

  constructor(
    private readonly bones: QuadrupedRigBones,
    private readonly facts: QuadrupedMotionFacts,
  ) {}

  stateName(state: number): string {
    return STATE_NAMES[state] ?? "idle";
  }

  /**
   * Moving wins outright; standing is decided by what the animal is doing.
   *
   * Alarm outranks feeding, because an animal that has noticed something stops
   * eating rather than the other way round.
   */
  selectState(
    input: ActorAnimationInput,
    currentState: number,
    stateTimeSeconds: number,
  ): number {
    if (input.speed >= IDLE_SPEED_THRESHOLD) {
      return QUADRUPED_STATE_WALK;
    }
    const standing =
      this.facts.alert > 0.5
        ? QUADRUPED_STATE_ALERT
        : this.facts.grazing > 0.5
          ? QUADRUPED_STATE_GRAZE
          : QUADRUPED_STATE_IDLE;
    if (
      currentState !== QUADRUPED_STATE_WALK &&
      standing !== currentState &&
      stateTimeSeconds < STANDING_STATE_DWELL_SECONDS
    ) {
      return currentState;
    }
    return standing;
  }

  /**
   * How fast a head moves depends on which way it is going.
   *
   * A head coming up out of the grass is a slow, heavy movement; a head snapping
   * up because something moved is not. Using one duration for both makes the
   * alarm read as mild surprise.
   */
  transitionDuration(fromState: number, toState: number): number {
    if (toState === QUADRUPED_STATE_ALERT) {
      return 0.14;
    }
    if (toState === QUADRUPED_STATE_GRAZE || fromState === QUADRUPED_STATE_GRAZE) {
      return 0.45;
    }
    return 0.22;
  }

  transitionEasing(): ActorEasing {
    return "smooth";
  }

  reset(): void {
    this.animationTime = 0;
  }

  advanceTime(deltaSeconds: number): void {
    this.animationTime += deltaSeconds;
  }

  generatePose(
    input: ActorAnimationInput,
    state: number,
    _stateTimeSeconds: number,
    gait: ActorGait,
    target: ActorPose,
  ): void {
    const bones = this.bones;
    const speed01 = THREE.MathUtils.clamp(input.normalizedSpeed, 0, 1);
    const gaitBlend =
      state === QUADRUPED_STATE_WALK && input.grounded
        ? THREE.MathUtils.smoothstep(speed01, 0.02, 0.2)
        : 0;

    target.resetToBind();

    // Body bob rides the doubled cycle: four footfalls per stride give two
    // support peaks, so the body dips twice per cycle rather than once.
    const cyclePhase = gait.getPhase() * Math.PI * 2;
    const breathFrequency =
      state === QUADRUPED_STATE_ALERT ? ALERT_BREATH_FREQUENCY : BREATH_FREQUENCY;
    const grazing = state === QUADRUPED_STATE_GRAZE;
    const bob =
      -Math.abs(Math.sin(cyclePhase * 2)) * 0.018 * gaitBlend +
      Math.sin(this.animationTime * breathFrequency) *
        BREATH_AMPLITUDE *
        (1 - gaitBlend) -
      (grazing ? GRAZE_BODY_DROP : 0);
    target.setTranslation(bones.bodyCenter, 0, bob, 0);
    target.setEuler(
      bones.spine,
      Math.sin(cyclePhase) * 0.03 * gaitBlend + (grazing ? GRAZE_SPINE_PITCH : 0),
      0,
      0,
    );
    if (grazing) {
      target.setEuler(bones.chest, GRAZE_CHEST_PITCH, 0, 0);
    }
    this.poseNeckAndHead(target, state, speed01);

    this.poseLimbPair(target, gait, gaitBlend, 0, 1, bones.frontUpper, bones.frontLower, -1);
    this.poseLimbPair(target, gait, gaitBlend, 2, 3, bones.hindUpper, bones.hindLower, 1);
  }

  /**
   * Where the head is, which is the whole difference between these states.
   *
   * Grazing and alert use the same two joints as walking; the blender moves
   * between them, so there is no separate head system and nothing to keep in
   * sync. Splitting the pitch across neck and head rather than folding it all
   * into one joint is what keeps the muzzle pointing at the ground instead of
   * at the animal's own chest.
   */
  private poseNeckAndHead(
    target: ActorPose,
    state: number,
    speed01: number,
  ): void {
    const bones = this.bones;
    if (state === QUADRUPED_STATE_GRAZE) {
      const chew =
        Math.sin(this.animationTime * CHEW_FREQUENCY * Math.PI * 2) *
        CHEW_AMPLITUDE;
      target.setEuler(bones.neck, GRAZE_NECK_PITCH, 0, 0);
      target.setEuler(bones.head, GRAZE_HEAD_PITCH + chew, 0, 0);
      return;
    }
    if (state === QUADRUPED_STATE_ALERT) {
      target.setEuler(bones.neck, ALERT_NECK_PITCH, 0, 0);
      target.setEuler(bones.head, ALERT_HEAD_PITCH, 0, 0);
      return;
    }
    target.setEuler(bones.neck, -0.12 - speed01 * 0.06, 0, 0);
    target.setEuler(bones.head, 0.1, 0, 0);
  }

  /**
   * Swings one pair of limbs from their own gait phases.
   *
   * `foldSign` is which way the mid joint folds: front limbs fold backward,
   * hind limbs forward.
   */
  private poseLimbPair(
    target: ActorPose,
    gait: ActorGait,
    gaitBlend: number,
    leftEffector: number,
    rightEffector: number,
    upper: readonly number[],
    lower: readonly number[],
    foldSign: number,
  ): void {
    for (let index = 0; index < 2; index += 1) {
      const effector = index === 0 ? leftEffector : rightEffector;
      const planted = gait.getPlantWeight(effector);
      const stance = gait.getStanceProgress(effector);
      const swing = gait.getSwingProgress(effector);
      // Stance and swing traverse the same arc in opposite directions. Contact
      // weight is only a blend factor and must not be used as phase progress.
      const stride = gait.isInStance(effector)
        ? Math.cos(Math.PI * (1 - stance)) * 0.5
        : Math.cos(Math.PI * (1 - swing)) * -0.5;
      target.setEuler(upper[index], stride * LIMB_SWING * gaitBlend, 0, 0);
      const fold = (1 - planted) * (1 - Math.abs(swing * 2 - 1));
      target.setEuler(
        lower[index],
        foldSign * fold * LIMB_FOLD * gaitBlend,
        0,
        0,
      );
    }
  }
}
