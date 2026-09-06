import type { ActorRigBuilder } from "../../actor/rig/ActorRigBuilder";
import type { HumanoidRigBones } from "./HumanoidRigBones";

const DEGREES = Math.PI / 180;

/**
 * Humanoid joint limits.
 *
 * The generic constraint engine knows nothing about knees or elbows; these are
 * the humanoid family's values for the bones it named. Limits are deliberately
 * loose enough to leave the shipped locomotion poses untouched — they exist to
 * catch inverted knees and hyper-extended elbows once IK starts writing joints.
 */
export function addHumanoidJointLimits(
  builder: ActorRigBuilder,
  bones: HumanoidRigBones,
): void {
  // Knees bend one way only. This is what stops contact IK inverting a leg.
  for (const shin of [bones.shinLeft, bones.shinRight]) {
    builder.addJointLimit({
      bone: shin,
      minX: 0,
      maxX: 150 * DEGREES,
      minY: -10 * DEGREES,
      maxY: 10 * DEGREES,
      minZ: -10 * DEGREES,
      maxZ: 10 * DEGREES,
    });
  }
  // Elbows likewise, in the opposite direction.
  for (const forearm of [bones.forearmLeft, bones.forearmRight]) {
    builder.addJointLimit({
      bone: forearm,
      minX: -150 * DEGREES,
      maxX: 5 * DEGREES,
      minY: -20 * DEGREES,
      maxY: 20 * DEGREES,
      minZ: -20 * DEGREES,
      maxZ: 20 * DEGREES,
    });
  }
  for (const hip of [bones.thighLeft, bones.thighRight]) {
    builder.addJointLimit({
      bone: hip,
      minX: -75 * DEGREES,
      maxX: 110 * DEGREES,
      minY: -45 * DEGREES,
      maxY: 45 * DEGREES,
      minZ: -45 * DEGREES,
      maxZ: 45 * DEGREES,
    });
  }
  for (const ankle of [bones.footLeft, bones.footRight]) {
    builder.addJointLimit({
      bone: ankle,
      minX: -55 * DEGREES,
      maxX: 55 * DEGREES,
      minY: -25 * DEGREES,
      maxY: 25 * DEGREES,
      minZ: -25 * DEGREES,
      maxZ: 25 * DEGREES,
    });
  }
  // Neck and the subdivided spine are optional joints; a rig without them is a
  // valid humanoid and simply has fewer limits to enforce.
  if (bones.neck !== undefined) {
    builder.addJointLimit({
      bone: bones.neck,
      minX: -40 * DEGREES,
      maxX: 40 * DEGREES,
      minY: -55 * DEGREES,
      maxY: 55 * DEGREES,
      minZ: -30 * DEGREES,
      maxZ: 30 * DEGREES,
    });
  }
  builder.addJointLimit({
    bone: bones.head,
    minX: -35 * DEGREES,
    maxX: 35 * DEGREES,
    minY: -50 * DEGREES,
    maxY: 50 * DEGREES,
    minZ: -25 * DEGREES,
    maxZ: 25 * DEGREES,
  });
  const spineJoints = [bones.spineLower, bones.spineUpper, bones.chest].filter(
    (bone): bone is NonNullable<typeof bone> => bone !== undefined,
  );
  for (const spine of spineJoints) {
    builder.addJointLimit({
      bone: spine,
      minX: -35 * DEGREES,
      maxX: 45 * DEGREES,
      minY: -30 * DEGREES,
      maxY: 30 * DEGREES,
      minZ: -30 * DEGREES,
      maxZ: 30 * DEGREES,
    });
  }
}
