import { ActorRigBuilder } from "../../actor/rig/ActorRigBuilder";
import type { ActorBoneIndex } from "../../actor/rig/ActorBoneIndex";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import { QUADRUPED_PHASE_OFFSETS } from "./QuadrupedGaitProfile";

const DEGREES = Math.PI / 180;

/**
 * Body proportions, in actor units.
 *
 * These are deer proportions rather than the original dog-like block: taller at
 * the shoulder, narrower across the chest, and longer in the limb. A deer is
 * mostly leg, and that ratio is most of what makes the silhouette readable at
 * the distance these animals are usually seen from.
 */
export const QUADRUPED_BODY_HEIGHT = 0.7;
export const QUADRUPED_BODY_HALF_LENGTH = 0.36;
export const QUADRUPED_LIMB_HALF_WIDTH = 0.11;
export const QUADRUPED_UPPER_LIMB = 0.32;
export const QUADRUPED_LOWER_LIMB = 0.3;
export const QUADRUPED_PAW_DROP = 0.05;

export const QUADRUPED_CHAIN_FRONT_LEFT = "front.L";
export const QUADRUPED_CHAIN_FRONT_RIGHT = "front.R";
export const QUADRUPED_CHAIN_HIND_LEFT = "hind.L";
export const QUADRUPED_CHAIN_HIND_RIGHT = "hind.R";

/** Contact effectors, in the order the gait table lists them. */
export const QUADRUPED_CONTACT_CHAINS = [
  QUADRUPED_CHAIN_FRONT_LEFT,
  QUADRUPED_CHAIN_FRONT_RIGHT,
  QUADRUPED_CHAIN_HIND_LEFT,
  QUADRUPED_CHAIN_HIND_RIGHT,
] as const;

export interface QuadrupedRigBones {
  readonly actorRoot: ActorBoneIndex;
  readonly bodyCenter: ActorBoneIndex;
  readonly pelvis: ActorBoneIndex;
  readonly spine: ActorBoneIndex;
  readonly chest: ActorBoneIndex;
  readonly neck: ActorBoneIndex;
  readonly head: ActorBoneIndex;
  /** Left then right, in that order. */
  readonly ears: readonly ActorBoneIndex[];
  readonly tail: readonly ActorBoneIndex[];
  readonly frontUpper: readonly ActorBoneIndex[];
  readonly frontLower: readonly ActorBoneIndex[];
  readonly frontPaw: readonly ActorBoneIndex[];
  readonly hindUpper: readonly ActorBoneIndex[];
  readonly hindLower: readonly ActorBoneIndex[];
  readonly hindPaw: readonly ActorBoneIndex[];
}

export interface QuadrupedRig {
  readonly definition: ActorRigDefinition;
  readonly bones: QuadrupedRigBones;
}

/**
 * A deliberately small quadruped topology.
 *
 * This is the architecture's validation subject: four contact limbs, a spine
 * that bends, a neck and head, and an optional tail — and no hands, no arms, no
 * crouch, no roll, and no spell concepts anywhere. If the shared actor layer
 * ever needs one of those to make this walk, the shared layer is wrong.
 *
 * The bind pose is a standing quadruped, not a humanoid T-pose. Species are
 * allowed genuinely different neutral postures.
 */
function buildQuadrupedRig(): QuadrupedRig {
  const builder = new ActorRigBuilder("quadruped");

  const actorRoot = builder.addBone({ name: "actorRoot", role: "root" });
  const bodyCenter = builder.addBone({
    name: "bodyCenter",
    parent: actorRoot,
    y: QUADRUPED_BODY_HEIGHT,
    role: "center",
    // The four-contact body-support solver lowers this rather than a pelvis.
    allowTranslation: true,
  });
  const pelvis = builder.addBone({
    name: "pelvis",
    parent: bodyCenter,
    z: -QUADRUPED_BODY_HALF_LENGTH,
    role: "pelvis",
  });
  const spine = builder.addBone({
    name: "spine",
    parent: bodyCenter,
    z: QUADRUPED_BODY_HALF_LENGTH * 0.5,
    role: "spine",
  });
  const chest = builder.addBone({
    name: "chest",
    parent: spine,
    z: QUADRUPED_BODY_HALF_LENGTH * 0.5,
    role: "chest",
  });
  const neck = builder.addBone({
    name: "neck",
    parent: chest,
    y: 0.12,
    z: 0.16,
    role: "neck",
  });
  const head = builder.addBone({
    name: "head",
    parent: neck,
    y: 0.115,
    z: 0.115,
    role: "head",
  });

  // Ears and tail are secondary: the pose pipeline leaves them alone and a
  // secondary-motion module owns them outright. That is what lets an ear flick
  // while the head is being aimed by an IK stage without the two fighting.
  const ears: ActorBoneIndex[] = [];
  for (const side of [-1, 1] as const) {
    ears.push(
      builder.addBone({
        name: `ear.${side < 0 ? "L" : "R"}`,
        parent: head,
        x: side * 0.055,
        y: 0.06,
        z: -0.02,
        secondary: true,
      }),
    );
  }

  // A short tail that hangs rather than a rod pointing straight back. The bind
  // droop matters: these bones are secondary, so the pose pipeline never touches
  // them and whatever the bind says is what a resting animal shows.
  const tail: ActorBoneIndex[] = [];
  let tailParent = pelvis;
  for (let segment = 0; segment < 3; segment += 1) {
    tailParent = builder.addBone({
      name: `tail.0${segment + 1}`,
      parent: tailParent,
      y: segment === 0 ? 0.07 : 0,
      z: segment === 0 ? -0.05 : -0.085,
      rotationX: segment === 0 ? -0.95 : -0.3,
      secondary: true,
    });
    tail.push(tailParent);
  }

  const frontUpper: ActorBoneIndex[] = [];
  const frontLower: ActorBoneIndex[] = [];
  const frontPaw: ActorBoneIndex[] = [];
  const hindUpper: ActorBoneIndex[] = [];
  const hindLower: ActorBoneIndex[] = [];
  const hindPaw: ActorBoneIndex[] = [];

  // Front limbs bend backward at the elbow, hind limbs forward at the stifle.
  // Opposite poles on the same generic chain primitive is the whole point.
  for (const side of [-1, 1] as const) {
    const suffix = side < 0 ? "L" : "R";
    const upper = builder.addBone({
      name: `frontUpper.${suffix}`,
      parent: chest,
      x: side * QUADRUPED_LIMB_HALF_WIDTH,
      role: `frontUpper.${suffix}`,
    });
    const lower = builder.addBone({
      name: `frontLower.${suffix}`,
      parent: upper,
      y: -QUADRUPED_UPPER_LIMB,
    });
    const paw = builder.addBone({
      name: `frontPaw.${suffix}`,
      parent: lower,
      y: -QUADRUPED_LOWER_LIMB,
      role: `frontPaw.${suffix}`,
    });
    frontUpper.push(upper);
    frontLower.push(lower);
    frontPaw.push(paw);
  }
  for (const side of [-1, 1] as const) {
    const suffix = side < 0 ? "L" : "R";
    const upper = builder.addBone({
      name: `hindUpper.${suffix}`,
      parent: pelvis,
      x: side * QUADRUPED_LIMB_HALF_WIDTH,
      role: `hindUpper.${suffix}`,
    });
    const lower = builder.addBone({
      name: `hindLower.${suffix}`,
      parent: upper,
      y: -QUADRUPED_UPPER_LIMB,
    });
    const paw = builder.addBone({
      name: `hindPaw.${suffix}`,
      parent: lower,
      y: -QUADRUPED_LOWER_LIMB,
      role: `hindPaw.${suffix}`,
    });
    hindUpper.push(upper);
    hindLower.push(lower);
    hindPaw.push(paw);
  }

  const bones: QuadrupedRigBones = {
    actorRoot,
    bodyCenter,
    pelvis,
    spine,
    chest,
    neck,
    head,
    ears,
    tail,
    frontUpper,
    frontLower,
    frontPaw,
    hindUpper,
    hindLower,
    hindPaw,
  };

  for (let index = 0; index < 2; index += 1) {
    builder.addTwoBoneChain({
      name: index === 0 ? QUADRUPED_CHAIN_FRONT_LEFT : QUADRUPED_CHAIN_FRONT_RIGHT,
      root: frontUpper[index],
      mid: frontLower[index],
      end: frontPaw[index],
      terminal: frontPaw[index],
      poleZ: -1,
      maxBendRadians: 140 * DEGREES,
    });
    builder.addTwoBoneChain({
      name: index === 0 ? QUADRUPED_CHAIN_HIND_LEFT : QUADRUPED_CHAIN_HIND_RIGHT,
      root: hindUpper[index],
      mid: hindLower[index],
      end: hindPaw[index],
      terminal: hindPaw[index],
      poleZ: 1,
      maxBendRadians: 140 * DEGREES,
    });
  }

  QUADRUPED_CONTACT_CHAINS.forEach((chain, index) => {
    builder.addEffector({
      name: chain,
      kind: "groundContact",
      chain,
      phaseOffset: QUADRUPED_PHASE_OFFSETS[index],
    });
  });

  // Only masks something actually blends through. The earlier limb and tail
  // masks had no consumer, and the tail one could never have worked: its bones
  // are secondary, so the pose pipeline skips them and a blend weight over them
  // decides nothing. `headAim` is narrow on purpose — it starts below the spine
  // so aiming the head never fights the locomotion layer's spine sway.
  builder.addMask("fullBody", { roots: [actorRoot] });
  builder.addMask("headAim", { roots: [neck] });

  builder.addSocket({ key: "head", parent: head, y: 0.06 });
  builder.addSocket({ key: "mouth", parent: head, y: -0.04, z: 0.12 });
  builder.addSocket({ key: "back", parent: bodyCenter, y: 0.12 });
  if (tail.length > 0) {
    builder.addSocket({ key: "tailTip", parent: tail[tail.length - 1], z: -0.1 });
  }

  // Which way a limb bends is the chain's pole, not a limit — front elbows fold
  // back and hind stifles fold forward because their poles say so. The limits
  // only stop twist and hyperextension.
  for (const lower of [...frontLower, ...hindLower]) {
    builder.addJointLimit({
      bone: lower,
      minX: -145 * DEGREES,
      maxX: 145 * DEGREES,
      minY: -12 * DEGREES,
      maxY: 12 * DEGREES,
      minZ: -12 * DEGREES,
      maxZ: 12 * DEGREES,
    });
  }
  for (const joint of [spine, chest]) {
    builder.addJointLimit({
      bone: joint,
      minX: -40 * DEGREES,
      maxX: 40 * DEGREES,
      minY: -45 * DEGREES,
      maxY: 45 * DEGREES,
      minZ: -25 * DEGREES,
      maxZ: 25 * DEGREES,
    });
  }
  // The neck and head need far more forward travel than the trunk does, because
  // feeding is the one thing this animal does that puts its mouth on the floor.
  // Held to the trunk's 40° the graze pose was silently clamped and the muzzle
  // stopped at chest height, which reads as a stiff neck rather than as eating.
  builder.addJointLimit({
    bone: neck,
    minX: -55 * DEGREES,
    maxX: 100 * DEGREES,
    minY: -45 * DEGREES,
    maxY: 45 * DEGREES,
    minZ: -25 * DEGREES,
    maxZ: 25 * DEGREES,
  });
  builder.addJointLimit({
    bone: head,
    minX: -50 * DEGREES,
    maxX: 65 * DEGREES,
    minY: -45 * DEGREES,
    maxY: 45 * DEGREES,
    minZ: -25 * DEGREES,
    maxZ: 25 * DEGREES,
  });

  return { definition: builder.build(), bones };
}

let sharedQuadrupedRig: QuadrupedRig | undefined;

/** The quadruped rig definition, built once and shared by every instance. */
export function quadrupedRig(): QuadrupedRig {
  sharedQuadrupedRig ??= buildQuadrupedRig();
  return sharedQuadrupedRig;
}
