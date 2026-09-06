import * as THREE from "three";
import type { ActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import type { ActorPoseStage } from "../../actor/animation/ActorAnimationProfile";
import { ActorPose } from "../../actor/animation/ActorPose";
import type { ActorGait } from "../../actor/animation/ActorGait";
import {
  requireActorMask,
  type ActorRigDefinition,
} from "../../actor/rig/ActorRigDefinition";
import type { ActorRigInstance } from "../../actor/rig/ActorRigInstance";
import type { QuadrupedMotionFacts } from "./QuadrupedMotionFacts";
import type { QuadrupedRigBones } from "./QuadrupedRigDefinition";

const MAX_YAW = 0.95;
const MAX_PITCH = 0.55;
/** How the aim is divided between the two joints, neck first. */
const NECK_SHARE = 0.4;
const HEAD_SHARE = 0.6;
const AIM_RATE = 6.5;

/**
 * Turns the head toward whatever the animal has noticed.
 *
 * This runs as a pre-IK stage over the `headAim` mask, so it layers on top of
 * whatever the locomotion layer produced rather than replacing it — a walking
 * deer can watch the player without breaking stride, which a locomotion state
 * could not express. The mask starts at the neck rather than the spine on
 * purpose: reaching further back would fight the gait's own spine sway.
 *
 * Nothing here needs to be safe against wild angles, because the rig's joint
 * limits run after every stage. The clamps exist so the head never *asks* for a
 * pose the limits would have to rescue, which would look like the neck sticking
 * at its stop.
 */
export class QuadrupedHeadAim implements ActorPoseStage {
  readonly name = "quadruped-head-aim";
  private readonly target: ActorPose;
  private readonly mask: Float32Array;
  private readonly headWorld = new THREE.Vector3();
  private readonly attention = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly headLocal = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private yaw = 0;
  private pitch = 0;

  constructor(
    definition: ActorRigDefinition,
    private readonly bones: QuadrupedRigBones,
    private readonly facts: QuadrupedMotionFacts,
    private readonly placement: THREE.Object3D,
  ) {
    // Both allocated once. A stage that allocates per frame would defeat the
    // whole point of the pose buffers it writes into.
    this.target = new ActorPose(definition);
    this.mask = requireActorMask(definition, "headAim");
  }

  apply(
    _input: ActorAnimationInput,
    deltaSeconds: number,
    _gait: ActorGait,
    pose: ActorPose,
    rigInstance: ActorRigInstance,
  ): void {
    const weight = THREE.MathUtils.clamp(this.facts.alert, 0, 1);
    const approach = 1 - Math.exp(-AIM_RATE * Math.max(deltaSeconds, 0));
    if (weight <= 0.001 && Math.abs(this.yaw) < 0.001 && Math.abs(this.pitch) < 0.001) {
      return;
    }

    let desiredYaw = 0;
    let desiredPitch = 0;
    if (weight > 0.001) {
      // The attention point is in world space; the angles the pose wants are in
      // the head's own parent space, so it has to come back through placement.
      const head = rigInstance.getBone(this.bones.head);
      head.getWorldPosition(this.headWorld);
      this.attention.set(
        this.facts.attentionX,
        this.facts.attentionY,
        this.facts.attentionZ,
      );
      this.inverse.copy(this.placement.matrixWorld).invert();
      this.local.copy(this.attention).applyMatrix4(this.inverse);
      this.headLocal.copy(this.headWorld).applyMatrix4(this.inverse);
      this.local.sub(this.headLocal);
      const planar = Math.hypot(this.local.x, this.local.z);
      if (planar > 0.001) {
        desiredYaw = THREE.MathUtils.clamp(
          Math.atan2(this.local.x, this.local.z),
          -MAX_YAW,
          MAX_YAW,
        );
        desiredPitch = THREE.MathUtils.clamp(
          -Math.atan2(this.local.y, planar),
          -MAX_PITCH,
          MAX_PITCH,
        );
      }
    }

    // Eased rather than snapped, so losing the target unwinds the neck instead
    // of dropping it.
    this.yaw += (desiredYaw * weight - this.yaw) * approach;
    this.pitch += (desiredPitch * weight - this.pitch) * approach;

    this.target.copyFrom(pose);
    this.target.setEuler(
      this.bones.neck,
      this.pitch * NECK_SHARE,
      this.yaw * NECK_SHARE,
      0,
    );
    this.target.setEuler(
      this.bones.head,
      this.pitch * HEAD_SHARE,
      this.yaw * HEAD_SHARE,
      0,
    );
    pose.blendMasked(this.target, this.mask, 1);
  }

  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
  }
}
