import * as THREE from "three";
import type { ActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import type { ActorSecondaryMotion } from "../../actor/animation/ActorAnimationProfile";
import { ActorDampedSpring } from "../../actor/math/ActorDampedSpring";
import type { ActorBoneIndex } from "../../actor/rig/ActorBoneIndex";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import type { ActorRigInstance } from "../../actor/rig/ActorRigInstance";
import type { QuadrupedMotionFacts } from "./QuadrupedMotionFacts";
import type { QuadrupedRigBones } from "./QuadrupedRigDefinition";

const TAIL_SWING_FREQUENCY = 1.7;
const TAIL_SWING_DAMPING = 0.55;
const TAIL_LIFT_FREQUENCY = 2.6;
const TAIL_LIFT_DAMPING = 0.85;
const EAR_FREQUENCY = 3.4;
const EAR_DAMPING = 0.6;

/** How much of a turn reaches the tail, and how it thins along the segments. */
const TAIL_YAW_GAIN = 0.85;
const TAIL_SEGMENT_FALLOFF = [1, 0.62, 0.34] as const;
const TAIL_MAX_SWING = 0.5;
/** How far the tail rises when the animal is alarmed, showing the white. */
const TAIL_ALERT_LIFT = 1.15;
const TAIL_IDLE_SWISH = 0.11;
const TAIL_IDLE_FREQUENCY = 0.55;
const TAIL_WALK_BOB = 0.09;

const EAR_ALERT_FORWARD = 0.5;
const EAR_GRAZE_OUTWARD = 0.55;
const EAR_FLICK = 0.42;
const EAR_FLICK_INTERVAL = 3.1;
const EAR_FLICK_DURATION = 0.22;

/**
 * The parts of a deer that never stop moving.
 *
 * The tail and ears are declared secondary in the rig, which means the pose
 * pipeline deliberately never touches them — so before this existed they sat at
 * their bind rotation forever, and a "walking" animal was rigid from the hips
 * back. That reads as a prop, not an animal: stillness in the extremities is
 * what the eye uses to decide something is not alive.
 *
 * Everything here is driven off facts the actor already has — how fast it is
 * turning, how fast it is moving, whether it is alarmed or feeding — so it costs
 * five scalar springs and no new state. Rotations are composed onto the bind
 * pose rather than replacing it, so the tail's resting droop survives.
 */
export class QuadrupedSecondaryMotion implements ActorSecondaryMotion {
  private readonly tail: readonly ActorBoneIndex[];
  private readonly ears: readonly ActorBoneIndex[];
  private readonly bindRotations: THREE.Quaternion[] = [];
  private readonly boneOrder: ActorBoneIndex[] = [];
  private readonly tailSwing = new ActorDampedSpring(0);
  private readonly tailLift = new ActorDampedSpring(0);
  private readonly earSwivel = [new ActorDampedSpring(0), new ActorDampedSpring(0)];
  private readonly offset = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private clock = 0;
  private previousFacing = 0;
  private hasFacing = false;

  constructor(
    definition: ActorRigDefinition,
    bones: QuadrupedRigBones,
    private readonly facts: QuadrupedMotionFacts,
  ) {
    this.tail = bones.tail;
    this.ears = bones.ears;
    // The bind rotation carries the tail's resting droop and the ears' outward
    // set. Capturing it once means every frame can express itself as an offset
    // from rest instead of having to reconstruct rest.
    for (const bone of [...this.tail, ...this.ears]) {
      this.boneOrder.push(bone);
      const base = bone * 4;
      this.bindRotations.push(
        new THREE.Quaternion(
          definition.bindRotations[base],
          definition.bindRotations[base + 1],
          definition.bindRotations[base + 2],
          definition.bindRotations[base + 3],
        ),
      );
    }
  }

  update(
    deltaSeconds: number,
    input: ActorAnimationInput,
    rigInstance: ActorRigInstance,
  ): void {
    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      0.1,
    );
    this.clock += delta;
    const speed01 = THREE.MathUtils.clamp(input.normalizedSpeed, 0, 1);
    const alert = THREE.MathUtils.clamp(this.facts.alert, 0, 1);
    const grazing = THREE.MathUtils.clamp(this.facts.grazing, 0, 1);

    // A tail trails a turn rather than leading it, so the target is the turn
    // itself and the spring supplies the lag.
    const yawRate = this.readYawRate(input.facing, delta);
    const swingTarget = THREE.MathUtils.clamp(
      -yawRate * TAIL_YAW_GAIN,
      -TAIL_MAX_SWING,
      TAIL_MAX_SWING,
    );
    const idleSwish =
      Math.sin(this.clock * TAIL_IDLE_FREQUENCY * Math.PI * 2) *
      TAIL_IDLE_SWISH *
      (1 - alert);
    const swing = this.tailSwing.update(
      swingTarget + idleSwish,
      delta,
      TAIL_SWING_FREQUENCY,
      TAIL_SWING_DAMPING,
    );

    // Alarm lifts the tail; feeding lets it hang slack.
    const liftTarget = alert * TAIL_ALERT_LIFT - grazing * 0.12;
    const lift = this.tailLift.update(
      liftTarget,
      delta,
      TAIL_LIFT_FREQUENCY,
      TAIL_LIFT_DAMPING,
    );
    const walkBob =
      Math.sin(input.distanceTravelled * 3.1) * TAIL_WALK_BOB * speed01;

    for (let index = 0; index < this.tail.length; index += 1) {
      const falloff = TAIL_SEGMENT_FALLOFF[Math.min(index, TAIL_SEGMENT_FALLOFF.length - 1)];
      this.euler.set(
        (lift + walkBob) * falloff,
        swing * falloff,
        swing * falloff * 0.3,
      );
      this.applyOffset(rigInstance, index, this.tail[index]);
    }

    this.updateEars(delta, rigInstance, alert, grazing);
  }

  reset(): void {
    this.clock = 0;
    this.previousFacing = 0;
    this.hasFacing = false;
    this.tailSwing.reset(0);
    this.tailLift.reset(0);
    this.earSwivel[0].reset(0);
    this.earSwivel[1].reset(0);
  }

  dispose(): void {
    this.reset();
  }

  /**
   * Ears point at what the animal cares about, and flick when it does not.
   *
   * The two ears are deliberately not symmetric: one flicks on a slower cycle
   * than the other, which is enough asymmetry to stop a grazing deer from
   * looking mechanical.
   */
  private updateEars(
    delta: number,
    rigInstance: ActorRigInstance,
    alert: number,
    grazing: number,
  ): void {
    for (let index = 0; index < this.ears.length; index += 1) {
      const side = index === 0 ? -1 : 1;
      const phase = this.clock / (EAR_FLICK_INTERVAL + index * 0.7);
      const flicking = phase - Math.floor(phase) < EAR_FLICK_DURATION;
      const target =
        alert * EAR_ALERT_FORWARD +
        grazing * EAR_GRAZE_OUTWARD * -1 +
        (flicking ? EAR_FLICK : 0);
      const swivel = this.earSwivel[index].update(
        target,
        delta,
        EAR_FREQUENCY,
        EAR_DAMPING,
      );
      this.euler.set(-swivel * 0.6, side * swivel * 0.35, side * swivel * 0.5);
      this.applyOffset(rigInstance, this.tail.length + index, this.ears[index]);
    }
  }

  private applyOffset(
    rigInstance: ActorRigInstance,
    slot: number,
    bone: ActorBoneIndex,
  ): void {
    const bind = this.bindRotations[slot];
    if (bind === undefined) {
      return;
    }
    this.offset.setFromEuler(this.euler);
    rigInstance.getBone(bone).quaternion.copy(bind).multiply(this.offset);
  }

  /** Turn rate in radians per second, taking the short way around the circle. */
  private readYawRate(facing: number, delta: number): number {
    if (!Number.isFinite(facing)) {
      return 0;
    }
    if (!this.hasFacing) {
      this.previousFacing = facing;
      this.hasFacing = true;
      return 0;
    }
    let difference = facing - this.previousFacing;
    while (difference > Math.PI) {
      difference -= Math.PI * 2;
    }
    while (difference < -Math.PI) {
      difference += Math.PI * 2;
    }
    this.previousFacing = facing;
    return delta > 0 ? difference / delta : 0;
  }
}
