import * as THREE from "three";
import type { ActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import type { ActorLocomotionLayer } from "../../actor/animation/ActorAnimationProfile";
import type { ActorGait } from "../../actor/animation/ActorGait";
import type { ActorPose } from "../../actor/animation/ActorPose";
import type { ActorEasing } from "../../actor/animation/ActorPoseBlender";
import type { HumanoidRigBones } from "../rig/HumanoidRigBones";
import {
  HUMANOID_APEX_VELOCITY_THRESHOLD,
  HUMANOID_ARM_BACKSWING_SCALE,
  HUMANOID_ARM_FORWARD_BIAS,
  HUMANOID_CLAVICLE_SWING_AMPLITUDE,
  HUMANOID_CROUCH_PELVIS_DROP,
  HUMANOID_CROUCH_SHIN_BEND,
  HUMANOID_CROUCH_THIGH_BEND,
  HUMANOID_CROUCH_TORSO_LEAN,
  HUMANOID_FOOT_ROLL_HEEL_PITCH,
  HUMANOID_FOOT_ROLL_TOE_PITCH,
  HUMANOID_IDLE_BREATH_AMPLITUDE,
  HUMANOID_IDLE_BREATH_FREQUENCY,
  HUMANOID_IDLE_SPEED_THRESHOLD,
  HUMANOID_PELVIS_SWAY_AMPLITUDE,
  HUMANOID_PELVIS_YAW_AMPLITUDE,
  HUMANOID_ROLL_DURATION_SECONDS,
  HUMANOID_RUN_SPEED_FRACTION,
  HUMANOID_SHIN_SWING,
  HUMANOID_SPINE_TWIST_AMPLITUDE,
  HUMANOID_TAKEOFF_DURATION_SECONDS,
  HUMANOID_THIGH_SWING,
  HUMANOID_TOE_FLEX_AMPLITUDE,
  HUMANOID_TRANSITION_AIRBORNE_SECONDS,
  HUMANOID_TRANSITION_DEFAULT_SECONDS,
  HUMANOID_TRANSITION_LANDING_SECONDS,
} from "./HumanoidLocomotionTuning";

/** Locomotion states, indexed. Nothing outside this family sees these values. */
export const HUMANOID_STATE_IDLE = 0;
export const HUMANOID_STATE_WALK = 1;
export const HUMANOID_STATE_RUN = 2;
export const HUMANOID_STATE_TAKEOFF = 3;
export const HUMANOID_STATE_RISE = 4;
export const HUMANOID_STATE_APEX = 5;
export const HUMANOID_STATE_FALL = 6;
export const HUMANOID_STATE_LAND = 7;
export const HUMANOID_STATE_CROUCH_IDLE = 8;
export const HUMANOID_STATE_CROUCH_WALK = 9;
export const HUMANOID_STATE_ROLL = 10;

const STATE_NAMES = [
  "idle",
  "walk",
  "run",
  "takeoff",
  "rise",
  "apex",
  "fall",
  "land",
  "crouch_idle",
  "crouch_walk",
  "roll",
] as const;

/**
 * Jump, landing, crouch, and roll facts the humanoid family adds to the shared snapshot.
 */
export interface HumanoidLocomotionFacts {
  jumpStarted: boolean;
  landed: boolean;
  landingImpact: number;
  crouched?: boolean;
  rollStarted?: boolean;
}

export interface HumanoidLocomotionBlendWeights {
  idle: number;
  walk: number;
  run: number;
}

export function createHumanoidLocomotionFacts(): HumanoidLocomotionFacts {
  return {
    jumpStarted: false,
    landed: false,
    landingImpact: 0,
    crouched: false,
    rollStarted: false,
  };
}

/**
 * AAA-grade Humanoid Locomotion Layer.
 *
 * Articulates the full humanoid skeletal hierarchy with:
 * - Continuous 3-way multi-action blending (idle, walk, run).
 * - Multi-segment spine flexion and counter-rotation.
 * - Dynamic pelvic sway, tilt, and counter-yaw.
 * - Organic foot-roll kinematics (heel-strike to toe-off with toe articulation).
 * - Coordinated clavicle and arm swing dynamics.
 * - Seamless crouch stance and deterministic dodge roll action.
 */
export class HumanoidLocomotionLayer implements ActorLocomotionLayer {
  readonly stateCount = STATE_NAMES.length;
  private animationTime = 0;
  private landingStrength = 0;
  private crouchAmount = 0;
  private rolling = false;
  private rollTime = 0;
  private readonly blendWeights: HumanoidLocomotionBlendWeights = {
    idle: 1,
    walk: 0,
    run: 0,
  };
  private explicitWeights: HumanoidLocomotionBlendWeights | null = null;

  constructor(
    private readonly bones: HumanoidRigBones,
    private readonly facts: HumanoidLocomotionFacts,
    private readonly landingRecoverySeconds: number,
  ) {}

  getBlendWeights(): Readonly<HumanoidLocomotionBlendWeights> {
    return this.blendWeights;
  }

  setExplicitWeights(
    weights: Partial<HumanoidLocomotionBlendWeights> | null,
  ): void {
    if (weights === null) {
      this.explicitWeights = null;
      return;
    }
    const idle = Math.max(0, weights.idle ?? 0);
    const walk = Math.max(0, weights.walk ?? 0);
    const run = Math.max(0, weights.run ?? 0);
    const total = idle + walk + run;
    if (total > 0) {
      this.explicitWeights = {
        idle: idle / total,
        walk: walk / total,
        run: run / total,
      };
    } else {
      this.explicitWeights = { idle: 1, walk: 0, run: 0 };
    }
  }

  isRolling(): boolean {
    return this.rolling;
  }

  isCrouched(): boolean {
    return this.crouchAmount > 0.5;
  }

  stateName(state: number): string {
    return STATE_NAMES[state] ?? "idle";
  }

  selectState(
    input: ActorAnimationInput,
    currentState: number,
    stateTimeSeconds: number,
  ): number {
    if (this.facts.rollStarted && !this.rolling && input.grounded) {
      this.rolling = true;
      this.rollTime = 0;
      this.facts.rollStarted = false;
      return HUMANOID_STATE_ROLL;
    }
    if (this.rolling) {
      if (this.rollTime < HUMANOID_ROLL_DURATION_SECONDS) {
        return HUMANOID_STATE_ROLL;
      }
      this.rolling = false;
    }

    if (this.facts.landed) {
      this.landingStrength = this.facts.landingImpact;
      return HUMANOID_STATE_LAND;
    }
    if (this.facts.jumpStarted) {
      return HUMANOID_STATE_TAKEOFF;
    }
    if (
      currentState === HUMANOID_STATE_TAKEOFF &&
      stateTimeSeconds < HUMANOID_TAKEOFF_DURATION_SECONDS
    ) {
      return HUMANOID_STATE_TAKEOFF;
    }
    if (!input.grounded) {
      if (input.verticalVelocity > HUMANOID_APEX_VELOCITY_THRESHOLD) {
        return HUMANOID_STATE_RISE;
      }
      if (input.verticalVelocity < -HUMANOID_APEX_VELOCITY_THRESHOLD) {
        return HUMANOID_STATE_FALL;
      }
      return HUMANOID_STATE_APEX;
    }
    if (
      currentState === HUMANOID_STATE_LAND &&
      stateTimeSeconds < this.landingRecoverySeconds
    ) {
      return HUMANOID_STATE_LAND;
    }

    const isCrouched = this.facts.crouched === true;
    if (input.speed < HUMANOID_IDLE_SPEED_THRESHOLD) {
      return isCrouched ? HUMANOID_STATE_CROUCH_IDLE : HUMANOID_STATE_IDLE;
    }
    if (isCrouched) {
      return HUMANOID_STATE_CROUCH_WALK;
    }
    if (input.speed > input.referenceSpeed * HUMANOID_RUN_SPEED_FRACTION) {
      return HUMANOID_STATE_RUN;
    }
    return HUMANOID_STATE_WALK;
  }

  transitionDuration(_fromState: number, toState: number): number {
    if (toState === HUMANOID_STATE_LAND) {
      return HUMANOID_TRANSITION_LANDING_SECONDS;
    }
    if (
      toState === HUMANOID_STATE_TAKEOFF ||
      toState === HUMANOID_STATE_RISE ||
      toState === HUMANOID_STATE_APEX ||
      toState === HUMANOID_STATE_FALL
    ) {
      return HUMANOID_TRANSITION_AIRBORNE_SECONDS;
    }
    return HUMANOID_TRANSITION_DEFAULT_SECONDS;
  }

  transitionEasing(_fromState: number, toState: number): ActorEasing {
    return toState === HUMANOID_STATE_LAND ? "easeOut" : "smooth";
  }

  reset(): void {
    this.animationTime = 0;
    this.landingStrength = 0;
    this.crouchAmount = 0;
    this.rolling = false;
    this.rollTime = 0;
  }

  generatePose(
    input: ActorAnimationInput,
    state: number,
    stateTimeSeconds: number,
    gait: ActorGait,
    target: ActorPose,
  ): void {
    const bones = this.bones;
    const speed01 = THREE.MathUtils.clamp(input.normalizedSpeed, 0, 1);
    const moving = THREE.MathUtils.smoothstep(speed01, 0.015, 0.12);
    const stridePhase = gait.getPhase() * Math.PI * 2;
    const stride = Math.sin(stridePhase);
    const oppositeStride = Math.sin(stridePhase + Math.PI);
    const doubleStep = 0.5 - 0.5 * Math.cos(stridePhase * 2);

    // Crouch smooth blend transition
    const targetCrouch =
      state === HUMANOID_STATE_CROUCH_IDLE ||
      state === HUMANOID_STATE_CROUCH_WALK ||
      this.facts.crouched === true
        ? 1
        : 0;
    this.crouchAmount += (targetCrouch - this.crouchAmount) * 0.18;

    // Compute continuous 3-way blend weights across Idle, Walk, and Run
    if (this.explicitWeights !== null) {
      this.blendWeights.idle = this.explicitWeights.idle;
      this.blendWeights.walk = this.explicitWeights.walk;
      this.blendWeights.run = this.explicitWeights.run;
    } else if (
      !input.grounded ||
      state === HUMANOID_STATE_LAND ||
      state === HUMANOID_STATE_TAKEOFF ||
      state === HUMANOID_STATE_ROLL
    ) {
      this.blendWeights.idle = 0;
      this.blendWeights.walk = 0;
      this.blendWeights.run = 0;
    } else {
      const isMoving = speed01 > 0.015;
      if (!isMoving) {
        this.blendWeights.idle = 1;
        this.blendWeights.walk = 0;
        this.blendWeights.run = 0;
      } else if (speed01 <= HUMANOID_RUN_SPEED_FRACTION) {
        const walkFraction = THREE.MathUtils.smoothstep(speed01, 0.015, 0.25);
        this.blendWeights.walk = walkFraction;
        this.blendWeights.idle = 1 - walkFraction;
        this.blendWeights.run = 0;
      } else {
        const runFraction = THREE.MathUtils.smoothstep(
          speed01,
          HUMANOID_RUN_SPEED_FRACTION,
          1.0,
        );
        this.blendWeights.run = runFraction;
        this.blendWeights.walk = 1 - runFraction;
        this.blendWeights.idle = 0;
      }
    }

    const gaitBlend =
      input.grounded && state !== HUMANOID_STATE_LAND && state !== HUMANOID_STATE_ROLL
        ? (this.explicitWeights !== null
            ? (this.explicitWeights.walk + this.explicitWeights.run) *
              (0.35 + speed01 * 0.65)
            : moving * (0.35 + speed01 * 0.65))
        : 0;

    const accelerationLean = THREE.MathUtils.clamp(
      input.acceleration / 20,
      -0.18,
      0.32,
    );

    // 1. Pelvis Kinematics (Sway, Drop, Counter-Yaw)
    const pelvisSwayX = Math.sin(stridePhase) * HUMANOID_PELVIS_SWAY_AMPLITUDE * gaitBlend;
    const pelvisYaw = stride * HUMANOID_PELVIS_YAW_AMPLITUDE * gaitBlend;
    const pelvisRoll = stride * 0.018 * gaitBlend;
    let pelvisY =
      -doubleStep * 0.032 * gaitBlend +
      Math.sin(this.animationTime * HUMANOID_IDLE_BREATH_FREQUENCY) *
        HUMANOID_IDLE_BREATH_AMPLITUDE *
        (1 - moving) -
      this.crouchAmount * HUMANOID_CROUCH_PELVIS_DROP;

    // 2. Multi-Segment Spine Flexion & Counter-Twist
    const totalSpineLean =
      0.055 * speed01 + accelerationLean + this.crouchAmount * HUMANOID_CROUCH_TORSO_LEAN;
    const spineLowerLean = totalSpineLean * 0.3;
    const spineUpperLean = totalSpineLean * 0.35;
    const chestLean = totalSpineLean * 0.35;

    const spineTwist = -stride * HUMANOID_SPINE_TWIST_AMPLITUDE * gaitBlend;
    const torsoZ = -stride * 0.035 * gaitBlend;

    // 3. Leg Kinematics & Crouch Flexion
    let leftThighX =
      oppositeStride * HUMANOID_THIGH_SWING * gaitBlend +
      this.crouchAmount * HUMANOID_CROUCH_THIGH_BEND;
    let rightThighX =
      stride * HUMANOID_THIGH_SWING * gaitBlend +
      this.crouchAmount * HUMANOID_CROUCH_THIGH_BEND;
    // Planted-leg correction belongs to contact IK. Locomotion bends a knee
    // through the airborne effector's swing arc, independent of side or duty factor.
    let leftShinX =
      kneeSwingWeight(gait, 0) * HUMANOID_SHIN_SWING * gaitBlend +
      this.crouchAmount * HUMANOID_CROUCH_SHIN_BEND;
    let rightShinX =
      kneeSwingWeight(gait, 1) * HUMANOID_SHIN_SWING * gaitBlend +
      this.crouchAmount * HUMANOID_CROUCH_SHIN_BEND;

    // 4. Foot-Roll Kinematics (Heel-Strike to Toe-Off)
    const leftHeelStrike =
      Math.max(0, oppositeStride - 0.25) * HUMANOID_FOOT_ROLL_HEEL_PITCH * gaitBlend;
    const leftToeOff =
      Math.min(0, oppositeStride + 0.25) * HUMANOID_FOOT_ROLL_TOE_PITCH * gaitBlend;
    const leftFootX =
      -leftThighX * 0.22 - leftShinX * 0.5 + leftHeelStrike + leftToeOff;
    const leftToeX =
      Math.max(0, -oppositeStride - 0.3) * HUMANOID_TOE_FLEX_AMPLITUDE * gaitBlend;

    const rightHeelStrike =
      Math.max(0, stride - 0.25) * HUMANOID_FOOT_ROLL_HEEL_PITCH * gaitBlend;
    const rightToeOff =
      Math.min(0, stride + 0.25) * HUMANOID_FOOT_ROLL_TOE_PITCH * gaitBlend;
    const rightFootX =
      -rightThighX * 0.22 - rightShinX * 0.5 + rightHeelStrike + rightToeOff;
    const rightToeX =
      Math.max(0, -stride - 0.3) * HUMANOID_TOE_FLEX_AMPLITUDE * gaitBlend;

    // 5. Clavicle & Arm Swing Dynamics
    const armGaitBlend = gaitBlend * (1 - this.crouchAmount * 0.45);
    const leftArmX = armSwing(stride, armGaitBlend);
    const rightArmX = armSwing(oppositeStride, armGaitBlend);
    let leftArmZ = -this.crouchAmount * 0.12;
    let rightArmZ = this.crouchAmount * 0.12;

    const leftClavicleY = -stride * HUMANOID_CLAVICLE_SWING_AMPLITUDE * gaitBlend;
    const rightClavicleY = stride * HUMANOID_CLAVICLE_SWING_AMPLITUDE * gaitBlend;
    const leftClavicleX = leftArmX * 0.15;
    const rightClavicleX = rightArmX * 0.15;

    let forearmLeftX = -0.12 - Math.max(0, -leftArmX) * 0.25;
    let forearmRightX = -0.12 - Math.max(0, -rightArmX) * 0.25;
    let wristLeftX = Math.sin(stridePhase - 0.5) * 0.08 * gaitBlend;
    let wristRightX = Math.sin(stridePhase + Math.PI - 0.5) * 0.08 * gaitBlend;

    let skirtX = -stride * 0.025 * gaitBlend;
    const skirtZ = stride * 0.018 * gaitBlend;

    // 6. Airborne / Jump States
    if (state === HUMANOID_STATE_TAKEOFF) {
      const phase = THREE.MathUtils.clamp(
        stateTimeSeconds / HUMANOID_TAKEOFF_DURATION_SECONDS,
        0,
        1,
      );
      const crouch = Math.sin(phase * Math.PI) * 0.72;
      pelvisY -= crouch * 0.1;
      leftThighX += crouch * 0.42;
      rightThighX += crouch * 0.42;
      leftShinX += crouch * 0.72;
      rightShinX += crouch * 0.72;
      forearmLeftX = -0.34;
      forearmRightX = -0.34;
    } else if (state === HUMANOID_STATE_RISE) {
      leftThighX = 0.48;
      rightThighX = 0.28;
      leftShinX = 0.52;
      rightShinX = 0.4;
      leftArmZ = -0.18;
      rightArmZ = 0.18;
      forearmLeftX = -0.34;
      forearmRightX = -0.34;
      skirtX = -0.08;
    } else if (state === HUMANOID_STATE_APEX) {
      leftThighX = 0.32;
      rightThighX = 0.32;
      leftShinX = 0.56;
      rightShinX = 0.56;
      leftArmZ = -0.32;
      rightArmZ = 0.32;
      forearmLeftX = -0.2;
      forearmRightX = -0.2;
      pelvisY += 0.025;
    } else if (state === HUMANOID_STATE_FALL) {
      leftThighX = -0.08;
      rightThighX = -0.08;
      leftShinX = 0.16;
      rightShinX = 0.16;
      leftArmZ = -0.12;
      rightArmZ = 0.12;
      forearmLeftX = -0.05;
      forearmRightX = -0.05;
      wristLeftX = 0.12;
      wristRightX = 0.12;
      skirtX = 0.08;
    } else if (state === HUMANOID_STATE_LAND) {
      const recovery = Math.max(this.landingRecoverySeconds, 0.01);
      const phase = THREE.MathUtils.clamp(stateTimeSeconds / recovery, 0, 1);
      const crouch = Math.sin(phase * Math.PI) * this.landingStrength;
      pelvisY -= crouch * 0.13;
      leftThighX = crouch * 0.5;
      rightThighX = crouch * 0.5;
      leftShinX = crouch * 0.82;
      rightShinX = crouch * 0.82;
      leftArmZ = -crouch * 0.1;
      rightArmZ = crouch * 0.1;
      skirtX = -crouch * 0.08;
    } else if (state === HUMANOID_STATE_ROLL) {
      // 7. Deterministic 4-Phase Dodge Roll Somersault
      const progress = THREE.MathUtils.clamp(
        stateTimeSeconds / HUMANOID_ROLL_DURATION_SECONDS,
        0,
        1,
      );
      const tuck = Math.sin(progress * Math.PI);
      const rollRotation = progress * Math.PI * 2;

      pelvisY = -0.35 * tuck;
      leftThighX = 1.15 * tuck;
      rightThighX = 1.15 * tuck;
      leftShinX = 1.35 * tuck;
      rightShinX = 1.35 * tuck;
      forearmLeftX = -0.65 * tuck;
      forearmRightX = -0.65 * tuck;

      target.resetToBind();
      target.setTranslation(bones.pelvis, 0, pelvisY, 0);
      target.setEuler(bones.pelvis, rollRotation, 0, 0);
      target.setEuler(bones.chest, 0.45 * tuck, 0, 0);
      target.setEuler(bones.thighLeft, leftThighX, 0, 0);
      target.setEuler(bones.thighRight, rightThighX, 0, 0);
      target.setEuler(bones.shinLeft, leftShinX, 0, 0);
      target.setEuler(bones.shinRight, rightShinX, 0, 0);
      target.setEuler(bones.upperArmLeft, -0.6 * tuck, 0, -0.2);
      target.setEuler(bones.upperArmRight, -0.6 * tuck, 0, 0.2);
      target.setEuler(bones.forearmLeft, forearmLeftX, 0, 0);
      target.setEuler(bones.forearmRight, forearmRightX, 0, 0);
      return;
    }

    target.resetToBind();
    target.setTranslation(bones.pelvis, pelvisSwayX, pelvisY, 0);
    target.setEuler(bones.pelvis, 0, pelvisYaw, pelvisRoll);

    // Articulate multi-segment spine
    if (bones.spineLower !== undefined) {
      target.setEuler(bones.spineLower, spineLowerLean, spineTwist * 0.3, torsoZ * 0.3);
    }
    if (bones.spineUpper !== undefined) {
      target.setEuler(bones.spineUpper, spineUpperLean, spineTwist * 0.35, torsoZ * 0.35);
    }
    target.setEuler(bones.chest, chestLean, spineTwist * 0.35, torsoZ * 0.35);

    // Articulate clavicles if present
    if (bones.clavicleLeft !== undefined) {
      target.setEuler(bones.clavicleLeft, leftClavicleX, leftClavicleY, -0.04);
    }
    if (bones.clavicleRight !== undefined) {
      target.setEuler(bones.clavicleRight, rightClavicleX, rightClavicleY, 0.04);
    }

    // Legs & Foot-Roll
    target.setEuler(bones.thighLeft, leftThighX, 0, 0);
    target.setEuler(bones.thighRight, rightThighX, 0, 0);
    target.setEuler(bones.shinLeft, leftShinX, 0, 0);
    target.setEuler(bones.shinRight, rightShinX, 0, 0);
    target.setEuler(bones.footLeft, leftFootX, 0, 0);
    target.setEuler(bones.footRight, rightFootX, 0, 0);
    if (bones.toeLeft !== undefined) {
      target.setEuler(bones.toeLeft, leftToeX, 0, 0);
    }
    if (bones.toeRight !== undefined) {
      target.setEuler(bones.toeRight, rightToeX, 0, 0);
    }

    // Arms
    target.setEuler(bones.upperArmLeft, leftArmX, 0, leftArmZ);
    target.setEuler(bones.upperArmRight, rightArmX, 0, rightArmZ);
    target.setEuler(bones.forearmLeft, forearmLeftX, 0, 0);
    target.setEuler(bones.forearmRight, forearmRightX, 0, 0);
    target.setEuler(bones.handLeft, wristLeftX, 0, 0);
    target.setEuler(bones.handRight, wristRightX, 0, 0);

    // Cloth skirt
    if (bones.skirt !== undefined) {
      target.setEuler(bones.skirt, skirtX, 0, skirtZ);
    }
  }

  /** Advances the animation clock. Called once per frame by the profile. */
  advanceTime(deltaSeconds: number): void {
    this.animationTime += deltaSeconds;
    if (this.rolling) {
      this.rollTime += deltaSeconds;
    }
  }
}

function armSwing(stride: number, gaitBlend: number): number {
  const swing = stride * 0.5 * gaitBlend;
  return (
    (swing > 0 ? swing * HUMANOID_ARM_BACKSWING_SCALE : swing) -
    HUMANOID_ARM_FORWARD_BIAS * gaitBlend
  );
}

function kneeSwingWeight(gait: ActorGait, effector: number): number {
  if (gait.isInStance(effector)) {
    return 0;
  }
  return Math.sin(gait.getSwingProgress(effector) * Math.PI);
}
