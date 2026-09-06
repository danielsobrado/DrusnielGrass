import { ActorAdditiveLayer } from "../../actor/animation/ActorAdditiveLayer";
import type { ActorPose } from "../../actor/animation/ActorPose";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import {
  HUMANOID_MASK_HEAD_NECK,
  type HumanoidRigBones,
} from "../rig/HumanoidRigBones";

export const ADDITIVE_ACTION_SNEAK = "sneak_pose";
export const ADDITIVE_ACTION_SAD = "sad_pose";
export const ADDITIVE_ACTION_AGREE = "agree";
export const ADDITIVE_ACTION_HEAD_SHAKE = "headShake";

export type HumanoidAdditiveActionName =
  | typeof ADDITIVE_ACTION_SNEAK
  | typeof ADDITIVE_ACTION_SAD
  | typeof ADDITIVE_ACTION_AGREE
  | typeof ADDITIVE_ACTION_HEAD_SHAKE;

/**
 * Humanoid additive animation layer implementing the Three.js additive blending
 * suite (sneak pose, sad pose, agree nod, head shake).
 *
 * Each additive action authors delta rotations/translations relative to the bind
 * pose into dedicated buffers and layers them with independent weights onto the
 * underlying locomotion pose before IK.
 */
export class HumanoidAdditiveLayer {
  readonly stage: ActorAdditiveLayer;
  private readonly bones: HumanoidRigBones;

  constructor(
    definition: ActorRigDefinition,
    bones: HumanoidRigBones,
  ) {
    this.bones = bones;
    this.stage = new ActorAdditiveLayer(definition, "humanoid-additive-layer");

    // 1. Sneak Pose (Stealth / Crouch-Hunch Additive)
    const sneakPose = this.stage.addTrack({
      name: ADDITIVE_ACTION_SNEAK,
      initialWeight: 0,
    });
    this.authorSneakPose(sneakPose);

    // 2. Sad Pose (Dejected / Slumping Additive)
    const sadPose = this.stage.addTrack({
      name: ADDITIVE_ACTION_SAD,
      initialWeight: 0,
    });
    this.authorSadPose(sadPose);

    // 3. Agree / Head Nod (Periodic Nodding Gesture)
    const headNeckMask = definition.masks.get(HUMANOID_MASK_HEAD_NECK);
    this.stage.addTrack({
      name: ADDITIVE_ACTION_AGREE,
      initialWeight: 0,
      mask: headNeckMask,
      update: (_delta, _input, time, target) => {
        this.updateAgreeGesture(time, target);
      },
    });

    // 4. Head Shake (Periodic Lateral Turn / Shake Gesture)
    this.stage.addTrack({
      name: ADDITIVE_ACTION_HEAD_SHAKE,
      initialWeight: 0,
      mask: headNeckMask,
      update: (_delta, _input, time, target) => {
        this.updateHeadShakeGesture(time, target);
      },
    });
  }

  setWeight(action: HumanoidAdditiveActionName | string, weight: number): void {
    this.stage.setWeight(action, weight);
  }

  getWeight(action: HumanoidAdditiveActionName | string): number {
    return this.stage.getWeight(action);
  }

  fadeTo(
    action: HumanoidAdditiveActionName | string,
    targetWeight: number,
    durationSeconds: number,
  ): void {
    this.stage.fadeTo(action, targetWeight, durationSeconds);
  }

  reset(): void {
    this.stage.reset();
  }

  private authorSneakPose(target: ActorPose): void {
    const bones = this.bones;
    target.resetToBind();

    // Lowered pelvis and forward stealth lean
    target.setTranslation(bones.pelvis, 0, -0.16, 0.08);

    // Spine and chest hunched forward
    if (bones.spineLower !== undefined) {
      target.setEuler(bones.spineLower, 0.12, 0, 0);
    }
    if (bones.spineUpper !== undefined) {
      target.setEuler(bones.spineUpper, 0.1, 0, 0);
    }
    target.setEuler(bones.chest, 0.14, 0, 0);

    // Head raised slightly to keep eyes forward while crouching
    if (bones.neck !== undefined) {
      target.setEuler(bones.neck, -0.15, 0, 0);
    }
    target.setEuler(bones.head, -0.12, 0, 0);

    // Legs bent slightly to absorb crouching posture
    target.setEuler(bones.thighLeft, 0.28, 0, 0);
    target.setEuler(bones.thighRight, 0.28, 0, 0);
    target.setEuler(bones.shinLeft, 0.38, 0, 0);
    target.setEuler(bones.shinRight, 0.38, 0, 0);
    target.setEuler(bones.footLeft, -0.28, 0, 0);
    target.setEuler(bones.footRight, -0.28, 0, 0);

    // Arms pulled in closer and tense
    target.setEuler(bones.upperArmLeft, -0.15, 0, -0.18);
    target.setEuler(bones.upperArmRight, -0.15, 0, 0.18);
    target.setEuler(bones.forearmLeft, -0.25, 0, 0);
    target.setEuler(bones.forearmRight, -0.25, 0, 0);
  }

  private authorSadPose(target: ActorPose): void {
    const bones = this.bones;
    target.resetToBind();

    // Pelvis slightly back
    target.setTranslation(bones.pelvis, 0, -0.04, -0.02);

    // Slumped torso and drooping shoulders
    if (bones.spineLower !== undefined) {
      target.setEuler(bones.spineLower, 0.08, 0, 0);
    }
    if (bones.spineUpper !== undefined) {
      target.setEuler(bones.spineUpper, 0.1, 0, 0);
    }
    target.setEuler(bones.chest, 0.12, 0, 0);

    // Drooping neck and downcast head
    if (bones.neck !== undefined) {
      target.setEuler(bones.neck, 0.3, 0, 0);
    }
    target.setEuler(bones.head, 0.25, 0, 0);

    // Loose, limp arms hanging downward
    target.setEuler(bones.upperArmLeft, 0.08, 0, -0.05);
    target.setEuler(bones.upperArmRight, 0.08, 0, 0.05);
    target.setEuler(bones.forearmLeft, 0.1, 0, 0);
    target.setEuler(bones.forearmRight, 0.1, 0, 0);
  }

  private updateAgreeGesture(time: number, target: ActorPose): void {
    const bones = this.bones;
    target.resetToBind();
    // Cyclic nod (approx 1.5 Hz)
    const nod = Math.sin(time * 7) * 0.22;
    if (bones.neck !== undefined) {
      target.setEuler(bones.neck, nod * 0.45, 0, 0);
    }
    target.setEuler(bones.head, nod * 0.55, 0, 0);
  }

  private updateHeadShakeGesture(time: number, target: ActorPose): void {
    const bones = this.bones;
    target.resetToBind();
    // Cyclic horizontal turn / shake (approx 1.2 Hz)
    const shake = Math.sin(time * 6) * 0.35;
    if (bones.neck !== undefined) {
      target.setEuler(bones.neck, 0, shake * 0.4, 0);
    }
    target.setEuler(bones.head, 0, shake * 0.6, 0);
  }
}
