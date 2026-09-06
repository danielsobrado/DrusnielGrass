import type { ActorRigBuilder } from "../../actor/rig/ActorRigBuilder";
import {
  HUMANOID_ANKLE_TO_SOLE,
  HUMANOID_WRIST_OFFSET_Z,
} from "./HumanoidRigTuning";
import type { HumanoidRigBones } from "./HumanoidRigBones";

/** Humanoid socket keys. Consumers must ask for these by name. */
export const HUMANOID_SOCKET_HEAD = "head";
export const HUMANOID_SOCKET_MOUTH = "mouth";
export const HUMANOID_SOCKET_CHEST = "chest";
export const HUMANOID_SOCKET_HAND_LEFT = "hand.L";
export const HUMANOID_SOCKET_HAND_RIGHT = "hand.R";
export const HUMANOID_SOCKET_PALM_LEFT = "palm.L";
export const HUMANOID_SOCKET_PALM_RIGHT = "palm.R";
export const HUMANOID_SOCKET_BACK = "backWeapon";
export const HUMANOID_SOCKET_EFFECT_PRIMARY = "effect.primary";
export const HUMANOID_SOCKET_SOLE_LEFT = "sole.L";
export const HUMANOID_SOCKET_SOLE_RIGHT = "sole.R";

/**
 * Attachment points for effects, equipment, and contact IK.
 *
 * The hand offsets match where the existing hand mesh sits, so a spell attached
 * to a palm socket lands in the hand rather than at the wrist joint. The sole
 * sockets are what contact IK targets against the ground.
 */
export function addHumanoidSockets(
  builder: ActorRigBuilder,
  bones: HumanoidRigBones,
): void {
  builder.addSocket({ key: HUMANOID_SOCKET_HEAD, parent: bones.head, y: 0.06 });
  builder.addSocket({
    key: HUMANOID_SOCKET_MOUTH,
    parent: bones.head,
    y: -0.06,
    z: 0.09,
  });
  builder.addSocket({
    key: HUMANOID_SOCKET_CHEST,
    parent: bones.chest,
    y: 0.2,
    z: 0.1,
  });

  for (const [handKey, palmKey, bone] of [
    [HUMANOID_SOCKET_HAND_LEFT, HUMANOID_SOCKET_PALM_LEFT, bones.handLeft],
    [HUMANOID_SOCKET_HAND_RIGHT, HUMANOID_SOCKET_PALM_RIGHT, bones.handRight],
  ] as const) {
    builder.addSocket({ key: handKey, parent: bone, y: -0.055, z: 0.025 });
    builder.addSocket({
      key: palmKey,
      parent: bone,
      y: -0.085,
      z: 0.025 + HUMANOID_WRIST_OFFSET_Z,
    });
  }

  builder.addSocket({
    key: HUMANOID_SOCKET_BACK,
    parent: bones.chest,
    y: 0.22,
    z: -0.12,
  });
  // Casting effects originate from the primary hand rather than a bone origin.
  builder.addSocket({
    key: HUMANOID_SOCKET_EFFECT_PRIMARY,
    parent: bones.handRight,
    y: -0.1,
    z: 0.05,
  });

  builder.addSocket({
    key: HUMANOID_SOCKET_SOLE_LEFT,
    parent: bones.footLeft,
    y: -HUMANOID_ANKLE_TO_SOLE,
  });
  builder.addSocket({
    key: HUMANOID_SOCKET_SOLE_RIGHT,
    parent: bones.footRight,
    y: -HUMANOID_ANKLE_TO_SOLE,
  });
}
