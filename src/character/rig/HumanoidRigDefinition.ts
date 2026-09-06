import { ActorRigBuilder } from "../../actor/rig/ActorRigBuilder";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import { addHumanoidJointLimits } from "./HumanoidJointLimits";
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
  type SnowflowRigBones,
} from "./HumanoidRigBones";
import {
  HUMANOID_ANKLE_OFFSET_Y,
  HUMANOID_CHEST_OFFSET_Y,
  HUMANOID_ELBOW_OFFSET_X,
  HUMANOID_ELBOW_OFFSET_Y,
  HUMANOID_HEAD_OFFSET_Y,
  HUMANOID_HIP_OFFSET_X,
  HUMANOID_HIP_OFFSET_Y,
  HUMANOID_KNEE_OFFSET_Y,
  HUMANOID_NECK_OFFSET_Y,
  HUMANOID_PELVIS_HEIGHT,
  HUMANOID_SHOULDER_OFFSET_X,
  HUMANOID_SHOULDER_OFFSET_Y,
  HUMANOID_SHOULDER_OFFSET_Z,
  HUMANOID_SKIRT_OFFSET_Y,
  HUMANOID_SPINE_LOWER_FRACTION,
  HUMANOID_SPINE_UPPER_FRACTION,
  HUMANOID_TOE_OFFSET_Y,
  HUMANOID_TOE_OFFSET_Z,
  HUMANOID_WRIST_OFFSET_Y,
  HUMANOID_WRIST_OFFSET_Z,
} from "./HumanoidRigTuning";
import { addHumanoidSockets } from "./HumanoidSockets";

const KNEE_MAX_BEND = Math.PI * 0.83;
const ELBOW_MAX_BEND = Math.PI * 0.83;

export interface HumanoidRig {
  readonly definition: ActorRigDefinition;
  readonly bones: SnowflowRigBones;
}

/**
 * Builds the humanoid topology shared by the player and humanoid NPCs.
 *
 * The bind pose reproduces the original pivot-group player rig joint for joint;
 * the additions are structural only — a subdivided spine, clavicles, and toes —
 * and all sit at offsets that sum back to the recorded chest and foot
 * positions, so the character does not move when the skeleton appears beneath
 * it. Cape, hood, hair, and skirt panels are declared as secondary bones so the
 * existing cloth modules keep owning them.
 */
function buildHumanoidRig(): HumanoidRig {
  const builder = new ActorRigBuilder("humanoid");

  const actorRoot = builder.addBone({ name: "actorRoot", role: "root" });
  const pelvis = builder.addBone({
    name: "pelvis",
    parent: actorRoot,
    y: HUMANOID_PELVIS_HEIGHT,
    role: "pelvis",
    // The idle bob and the body-support solver both move the pelvis.
    allowTranslation: true,
  });
  const spineLower = builder.addBone({
    name: "spineLower",
    parent: pelvis,
    y: HUMANOID_CHEST_OFFSET_Y * HUMANOID_SPINE_LOWER_FRACTION,
    role: "spineLower",
  });
  const spineUpper = builder.addBone({
    name: "spineUpper",
    parent: spineLower,
    y: HUMANOID_CHEST_OFFSET_Y * HUMANOID_SPINE_UPPER_FRACTION,
    role: "spineUpper",
  });
  const chest = builder.addBone({
    name: "chest",
    parent: spineUpper,
    y:
      HUMANOID_CHEST_OFFSET_Y *
      (1 - HUMANOID_SPINE_LOWER_FRACTION - HUMANOID_SPINE_UPPER_FRACTION),
    role: "chest",
  });
  const neck = builder.addBone({
    name: "neck",
    parent: chest,
    y: HUMANOID_NECK_OFFSET_Y,
    role: "neck",
  });
  const head = builder.addBone({
    name: "head",
    parent: neck,
    y: HUMANOID_HEAD_OFFSET_Y,
    role: "head",
  });
  const hairLeft = builder.addBone({
    name: "hair.L",
    parent: head,
    secondary: true,
  });
  const hairRight = builder.addBone({
    name: "hair.R",
    parent: head,
    secondary: true,
  });
  const hood = builder.addBone({ name: "hood", parent: chest, secondary: true });
  const cloakBack = builder.addBone({
    name: "cloak.back",
    parent: chest,
    secondary: true,
  });
  const cloakLeft = builder.addBone({
    name: "cloak.L",
    parent: chest,
    secondary: true,
  });
  const cloakRight = builder.addBone({
    name: "cloak.R",
    parent: chest,
    secondary: true,
  });

  const arms = [-1, 1].map((side) => {
    const suffix = side < 0 ? "L" : "R";
    const clavicle = builder.addBone({
      name: `clavicle.${suffix}`,
      parent: chest,
      x: side * HUMANOID_SHOULDER_OFFSET_X,
      y: HUMANOID_SHOULDER_OFFSET_Y,
      z: HUMANOID_SHOULDER_OFFSET_Z,
      role: `clavicle.${suffix}`,
    });
    const upperArm = builder.addBone({
      name: `upperArm.${suffix}`,
      parent: clavicle,
      role: `upperArm.${suffix}`,
    });
    const forearm = builder.addBone({
      name: `forearm.${suffix}`,
      parent: upperArm,
      x: side * HUMANOID_ELBOW_OFFSET_X,
      y: HUMANOID_ELBOW_OFFSET_Y,
    });
    const hand = builder.addBone({
      name: `hand.${suffix}`,
      parent: forearm,
      y: HUMANOID_WRIST_OFFSET_Y,
      z: HUMANOID_WRIST_OFFSET_Z,
      role: `hand.${suffix}`,
    });
    return { clavicle, upperArm, forearm, hand };
  });

  const skirt = builder.addBone({
    name: "skirt",
    parent: pelvis,
    y: HUMANOID_SKIRT_OFFSET_Y,
    role: "skirt",
  });
  const skirtFront = builder.addBone({
    name: "skirt.front",
    parent: skirt,
    secondary: true,
  });
  const skirtLeft = builder.addBone({
    name: "skirt.L",
    parent: skirt,
    secondary: true,
  });
  const skirtRight = builder.addBone({
    name: "skirt.R",
    parent: skirt,
    secondary: true,
  });

  const legs = [-1, 1].map((side) => {
    const suffix = side < 0 ? "L" : "R";
    const thigh = builder.addBone({
      name: `thigh.${suffix}`,
      parent: pelvis,
      x: side * HUMANOID_HIP_OFFSET_X,
      y: HUMANOID_HIP_OFFSET_Y,
      role: `thigh.${suffix}`,
    });
    const shin = builder.addBone({
      name: `shin.${suffix}`,
      parent: thigh,
      y: HUMANOID_KNEE_OFFSET_Y,
    });
    const foot = builder.addBone({
      name: `foot.${suffix}`,
      parent: shin,
      y: HUMANOID_ANKLE_OFFSET_Y,
      role: `foot.${suffix}`,
    });
    const toe = builder.addBone({
      name: `toe.${suffix}`,
      parent: foot,
      y: HUMANOID_TOE_OFFSET_Y,
      z: HUMANOID_TOE_OFFSET_Z,
    });
    return { thigh, shin, foot, toe };
  });

  const bones: SnowflowRigBones = {
    actorRoot,
    pelvis,
    spineLower,
    spineUpper,
    chest,
    neck,
    head,
    hairLeft,
    hairRight,
    hood,
    cloakBack,
    cloakLeft,
    cloakRight,
    clavicleLeft: arms[0].clavicle,
    upperArmLeft: arms[0].upperArm,
    forearmLeft: arms[0].forearm,
    handLeft: arms[0].hand,
    clavicleRight: arms[1].clavicle,
    upperArmRight: arms[1].upperArm,
    forearmRight: arms[1].forearm,
    handRight: arms[1].hand,
    skirt,
    skirtFront,
    skirtLeft,
    skirtRight,
    thighLeft: legs[0].thigh,
    shinLeft: legs[0].shin,
    footLeft: legs[0].foot,
    toeLeft: legs[0].toe,
    thighRight: legs[1].thigh,
    shinRight: legs[1].shin,
    footRight: legs[1].foot,
    toeRight: legs[1].toe,
  };

  // Knees bend forward, elbows backward. The pole is explicit so the solver
  // never has to guess a bend plane from a bone name.
  for (const [name, leg] of [
    [HUMANOID_CHAIN_LEG_LEFT, legs[0]],
    [HUMANOID_CHAIN_LEG_RIGHT, legs[1]],
  ] as const) {
    builder.addTwoBoneChain({
      name,
      root: leg.thigh,
      mid: leg.shin,
      end: leg.foot,
      terminal: leg.foot,
      poleZ: 1,
      maxBendRadians: KNEE_MAX_BEND,
    });
  }
  for (const [name, arm] of [
    [HUMANOID_CHAIN_ARM_LEFT, arms[0]],
    [HUMANOID_CHAIN_ARM_RIGHT, arms[1]],
  ] as const) {
    builder.addTwoBoneChain({
      name,
      root: arm.upperArm,
      mid: arm.forearm,
      end: arm.hand,
      terminal: arm.hand,
      poleZ: -1,
      maxBendRadians: ELBOW_MAX_BEND,
    });
  }

  // Two feet, phase-opposed. A quadruped declares four of these with its own
  // phase table; nothing here assumes the count.
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
  builder.addEffector({
    name: "hand.L",
    kind: "reach",
    chain: HUMANOID_CHAIN_ARM_LEFT,
  });
  builder.addEffector({
    name: "hand.R",
    kind: "reach",
    chain: HUMANOID_CHAIN_ARM_RIGHT,
  });

  builder.addMask(HUMANOID_MASK_FULL_BODY, { roots: [actorRoot] });
  builder.addMask(HUMANOID_MASK_LOWER_BODY, {
    roots: [pelvis],
    exclude: [spineLower],
  });
  builder.addMask(HUMANOID_MASK_UPPER_BODY, { roots: [spineLower] });
  builder.addMask(HUMANOID_MASK_LEFT_ARM, { roots: [arms[0].clavicle] });
  builder.addMask(HUMANOID_MASK_RIGHT_ARM, { roots: [arms[1].clavicle] });
  builder.addMask(HUMANOID_MASK_HEAD_NECK, { roots: [neck] });

  addHumanoidSockets(builder, bones);
  addHumanoidJointLimits(builder, bones);

  return { definition: builder.build(), bones };
}

let sharedHumanoidRig: HumanoidRig | undefined;

/**
 * The humanoid rig definition, built once and shared by every humanoid actor.
 *
 * It is immutable structural data: sharing it between the player and NPCs costs
 * nothing per instance and is what keeps a crowd of humanoids from duplicating
 * bone tables.
 */
export function humanoidRig(): HumanoidRig {
  sharedHumanoidRig ??= buildHumanoidRig();
  return sharedHumanoidRig;
}
