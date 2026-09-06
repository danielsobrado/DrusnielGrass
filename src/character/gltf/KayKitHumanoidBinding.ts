import type * as THREE from "three";
import {
  draftActorRigFromBones,
  type ImportedRigBinding,
} from "../../actor/rig/ActorRigFromSkeleton";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import {
  HUMANOID_CHAIN_ARM_LEFT,
  HUMANOID_CHAIN_ARM_RIGHT,
  HUMANOID_CHAIN_LEG_LEFT,
  HUMANOID_CHAIN_LEG_RIGHT,
  HUMANOID_EFFECTOR_FOOT_LEFT,
  HUMANOID_EFFECTOR_FOOT_RIGHT,
  HUMANOID_MASK_FULL_BODY,
  HUMANOID_MASK_HEAD_NECK,
  HUMANOID_MASK_LEFT_ARM,
  HUMANOID_MASK_LOWER_BODY,
  HUMANOID_MASK_RIGHT_ARM,
  HUMANOID_MASK_UPPER_BODY,
  type HumanoidRigBones,
} from "../rig/HumanoidRigBones";
import { addHumanoidJointLimits } from "../rig/HumanoidJointLimits";
import {
  HUMANOID_SOCKET_HAND_LEFT,
  HUMANOID_SOCKET_HAND_RIGHT,
  HUMANOID_SOCKET_HEAD,
} from "../rig/HumanoidSockets";

const KNEE_MAX_BEND = Math.PI * 0.83;
const ELBOW_MAX_BEND = Math.PI * 0.83;

/**
 * Bone names in the KayKit character rigs.
 *
 * Kept as one table so the mapping is inspectable in a single place. A pack
 * with different names needs a different table and nothing else.
 */
const KAYKIT_ROLE_BY_BONE: ReadonlyMap<string, string> = new Map([
  ["root", "root"],
  ["hips", "pelvis"],
  ["spine", "spineLower"],
  ["chest", "chest"],
  ["head", "head"],
  ["upperarm.l", "upperArm.L"],
  ["upperarm.r", "upperArm.R"],
  ["hand.l", "hand.L"],
  ["hand.r", "hand.R"],
  ["upperleg.l", "thigh.L"],
  ["upperleg.r", "thigh.R"],
  ["foot.l", "foot.L"],
  ["foot.r", "foot.R"],
]);

/**
 * Authoring controls that ship inside the skin's joint list.
 *
 * These drive the pack's own baked clips; they deform nothing and must not
 * become part of a pose. Their subtrees go with them.
 */
function isKayKitControlBone(boneName: string): boolean {
  return (
    boneName.includes("IK") ||
    boneName.startsWith("control-") ||
    boneName.startsWith("handslot")
  );
}

export interface KayKitHumanoidRig {
  readonly definition: ActorRigDefinition;
  readonly bones: HumanoidRigBones;
  /** Imported bones, ordered to match the definition's indexes. */
  readonly orderedBones: THREE.Bone[];
}

/**
 * Derives a humanoid actor rig from an imported KayKit skeleton.
 *
 * This is the real test of the shared rig contract: a skeleton nobody here
 * authored, with its own proportions, its own naming, and limbs running along
 * `+Y` where the procedural rigs run theirs along `-Y`. Nothing about that needs
 * a special case — the chain descriptors record each segment's axis from the
 * imported bind offsets, and the shared solvers read it.
 *
 * The rig has no neck, no clavicles, and no cloth bones. Those roles are
 * genuinely absent rather than faked, which the humanoid profile now allows.
 */
export function buildKayKitHumanoidRig(
  skinBones: readonly THREE.Bone[],
  rigName: string,
): KayKitHumanoidRig {
  const binding: ImportedRigBinding = {
    name: rigName,
    resolveRole: (boneName) => KAYKIT_ROLE_BY_BONE.get(boneName.toLowerCase()),
    isExcluded: isKayKitControlBone,
    allowsTranslation: (boneName) => boneName.toLowerCase() === "hips",
  };
  const draft = draftActorRigFromBones(skinBones, binding);

  const bones: HumanoidRigBones = {
    actorRoot: draft.requireIndex("root"),
    pelvis: draft.requireIndex("hips"),
    chest: draft.requireIndex("chest"),
    head: draft.requireIndex("head"),
    spineLower: draft.indexOf("spine"),
    upperArmLeft: draft.requireIndex("upperarm.l"),
    forearmLeft: draft.requireIndex("lowerarm.l"),
    // The pack's wrist joint is the arm chain's end effector; `hand` hangs off
    // it and follows.
    handLeft: draft.requireIndex("wrist.l"),
    upperArmRight: draft.requireIndex("upperarm.r"),
    forearmRight: draft.requireIndex("lowerarm.r"),
    handRight: draft.requireIndex("wrist.r"),
    thighLeft: draft.requireIndex("upperleg.l"),
    shinLeft: draft.requireIndex("lowerleg.l"),
    footLeft: draft.requireIndex("foot.l"),
    toeLeft: draft.indexOf("toes.l"),
    thighRight: draft.requireIndex("upperleg.r"),
    shinRight: draft.requireIndex("lowerleg.r"),
    footRight: draft.requireIndex("foot.r"),
    toeRight: draft.indexOf("toes.r"),
  };

  const builder = draft.builder;
  for (const [name, thigh, shin, foot] of [
    [HUMANOID_CHAIN_LEG_LEFT, bones.thighLeft, bones.shinLeft, bones.footLeft],
    [
      HUMANOID_CHAIN_LEG_RIGHT,
      bones.thighRight,
      bones.shinRight,
      bones.footRight,
    ],
  ] as const) {
    builder.addTwoBoneChain({
      name,
      root: thigh,
      mid: shin,
      end: foot,
      terminal: foot,
      poleZ: 1,
      maxBendRadians: KNEE_MAX_BEND,
    });
  }
  for (const [name, upper, lower, hand] of [
    [
      HUMANOID_CHAIN_ARM_LEFT,
      bones.upperArmLeft,
      bones.forearmLeft,
      bones.handLeft,
    ],
    [
      HUMANOID_CHAIN_ARM_RIGHT,
      bones.upperArmRight,
      bones.forearmRight,
      bones.handRight,
    ],
  ] as const) {
    builder.addTwoBoneChain({
      name,
      root: upper,
      mid: lower,
      end: hand,
      terminal: hand,
      poleZ: -1,
      maxBendRadians: ELBOW_MAX_BEND,
    });
  }

  builder.addEffector({
    name: HUMANOID_EFFECTOR_FOOT_LEFT,
    kind: "groundContact",
    chain: HUMANOID_CHAIN_LEG_LEFT,
    phaseOffset: 0,
  });
  builder.addEffector({
    name: HUMANOID_EFFECTOR_FOOT_RIGHT,
    kind: "groundContact",
    chain: HUMANOID_CHAIN_LEG_RIGHT,
    phaseOffset: 0.5,
  });

  builder.addMask(HUMANOID_MASK_FULL_BODY, { roots: [bones.actorRoot] });
  builder.addMask(HUMANOID_MASK_LOWER_BODY, {
    roots: [bones.pelvis],
    exclude: bones.spineLower === undefined ? undefined : [bones.spineLower],
  });
  builder.addMask(HUMANOID_MASK_UPPER_BODY, {
    roots: [bones.spineLower ?? bones.chest],
  });
  builder.addMask(HUMANOID_MASK_LEFT_ARM, { roots: [bones.upperArmLeft] });
  builder.addMask(HUMANOID_MASK_RIGHT_ARM, { roots: [bones.upperArmRight] });
  builder.addMask(HUMANOID_MASK_HEAD_NECK, { roots: [bones.head] });

  builder.addSocket({ key: HUMANOID_SOCKET_HEAD, parent: bones.head, y: 0.2 });
  builder.addSocket({ key: HUMANOID_SOCKET_HAND_LEFT, parent: bones.handLeft });
  builder.addSocket({
    key: HUMANOID_SOCKET_HAND_RIGHT,
    parent: bones.handRight,
  });

  addHumanoidJointLimits(builder, bones);

  const finished = draft.finish();
  return {
    definition: finished.definition,
    bones,
    orderedBones: finished.bones,
  };
}
