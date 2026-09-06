import * as THREE from "three";
import type { ActorGeometryPart } from "../../actor/geometry/ActorPartMerge";
import {
  HUMANOID_ANKLE_OFFSET_Y,
  HUMANOID_ELBOW_OFFSET_Y,
  HUMANOID_KNEE_OFFSET_Y,
  HUMANOID_WRIST_OFFSET_Y,
} from "../rig/HumanoidRigTuning";
import type { VillagerPalette } from "./VillagerPalette";

/** One mesh per slot; limb slots are shared by the left and right side. */
export type VillagerPartSlot =
  | "pelvis"
  | "chest"
  | "head"
  | "upperArm"
  | "forearm"
  | "thigh"
  | "shin"
  | "boot"
  | "tabard";

/**
 * A person, built by subtraction from the hero.
 *
 * The previous NPC was a stack of bare cylinders with a sphere for a head, which
 * is the one thing in the frame that could not be read as anything at all. This
 * is still simple — no cloth simulation, no hair, no face, one material — but it
 * has the four things that make a silhouette read as a person at a distance: a
 * hood, shoulders, a waist, and boots.
 *
 * Everything a bone carries merges into one buffer, so the collar, the hood
 * brim, the face shadow and the belt cost nothing beyond the mesh that was going
 * to be drawn anyway.
 */
export function buildVillagerParts(
  palette: VillagerPalette,
): Map<VillagerPartSlot, ActorGeometryPart[]> {
  const hood = new THREE.Color(palette.hood);
  const tunic = new THREE.Color(palette.tunic);
  const belt = new THREE.Color(palette.belt);
  const trouser = new THREE.Color(palette.trouser);
  const boot = new THREE.Color(palette.boot);
  const mitten = new THREE.Color(palette.mitten);
  const skin = new THREE.Color(palette.skin);
  const faceShadow = new THREE.Color(palette.faceShadow);

  const parts = new Map<VillagerPartSlot, ActorGeometryPart[]>();

  // A waist, sized to the torso that passes through it. The torso itself is
  // built on the chest bone and runs down past the hips, so this bone carries
  // only the belt — a separate pelvis cylinder left a hand's width of daylight
  // between the hips and the chest.
  parts.set("pelvis", [
    {
      geometry: new THREE.TorusGeometry(0.132, 0.019, 6, 16),
      color: belt,
      y: 0.03,
      rotationX: Math.PI * 0.5,
      scaleZ: 0.86,
    },
  ]);

  parts.set("chest", [
    // One continuous torso from hips to shoulders. Narrower front-to-back than
    // side-to-side, which is what stops a person reading as a barrel.
    {
      geometry: new THREE.CylinderGeometry(0.148, 0.128, 0.63, 14, 4),
      color: tunic,
      y: 0.012,
      scaleZ: 0.82,
    },
    // Shoulders as a yoke, wide enough to meet the arms. Without it the arms
    // hang beside the body with daylight between them and the shoulder.
    {
      geometry: new THREE.SphereGeometry(1, 14, 10),
      color: hood,
      y: 0.312,
      scaleX: 0.238,
      scaleY: 0.098,
      scaleZ: 0.115,
    },
    { geometry: new THREE.CylinderGeometry(0.058, 0.07, 0.1, 10), color: hood, y: 0.4 },
  ]);

  parts.set("head", [
    { geometry: new THREE.SphereGeometry(0.098, 12, 10), color: skin, z: 0.004 },
    // The hood: a dome with a brim ring, and a dark recess where a face would
    // be. Shadow instead of features is what keeps a background figure in the
    // background.
    {
      geometry: new THREE.SphereGeometry(0.122, 14, 11),
      color: hood,
      y: 0.012,
      z: -0.014,
      scaleZ: 1.06,
    },
    {
      geometry: new THREE.TorusGeometry(0.084, 0.026, 6, 14),
      color: hood,
      y: -0.012,
      z: 0.062,
      rotationX: 0.32,
    },
    {
      geometry: new THREE.CircleGeometry(0.072, 12),
      color: faceShadow,
      y: -0.008,
      z: 0.078,
      rotationX: 0.18,
    },
    { geometry: new THREE.SphereGeometry(0.017, 6, 5), color: skin, y: -0.014, z: 0.086 },
  ]);

  // The hand merges into the forearm as a mitten, which saves two draw calls per
  // villager and loses nothing: nobody reads fingers on a background figure.
  parts.set("upperArm", [
    {
      geometry: new THREE.CylinderGeometry(0.052, 0.045, 0.3, 10),
      color: tunic,
      y: HUMANOID_ELBOW_OFFSET_Y * 0.5,
    },
  ]);
  parts.set("forearm", [
    {
      geometry: new THREE.CylinderGeometry(0.043, 0.038, 0.27, 10),
      color: tunic,
      y: HUMANOID_WRIST_OFFSET_Y * 0.5,
    },
    {
      geometry: new THREE.SphereGeometry(0.05, 9, 7),
      color: mitten,
      y: HUMANOID_WRIST_OFFSET_Y,
      scaleZ: 0.86,
    },
  ]);

  parts.set("thigh", [
    {
      geometry: new THREE.CylinderGeometry(0.082, 0.066, 0.44, 10),
      color: trouser,
      y: HUMANOID_KNEE_OFFSET_Y * 0.5,
    },
  ]);
  parts.set("shin", [
    {
      geometry: new THREE.CylinderGeometry(0.062, 0.05, 0.36, 10),
      color: trouser,
      y: HUMANOID_ANKLE_OFFSET_Y * 0.5,
    },
  ]);
  parts.set("boot", [
    {
      geometry: new THREE.BoxGeometry(0.105, 0.075, 0.23),
      color: boot,
      y: -0.04,
      z: 0.055,
    },
    {
      geometry: new THREE.CylinderGeometry(0.062, 0.058, 0.1, 8),
      color: boot,
      y: 0.02,
    },
  ]);

  // A short tabard on a cloth bone the pose pipeline never touches, so it hangs
  // rigid at bind. It gives the figure a front panel and a hint of a cloak
  // without a single spring.
  parts.set("tabard", [
    {
      geometry: new THREE.BoxGeometry(0.2, 0.34, 0.028),
      color: hood,
      y: -0.16,
      z: 0.005,
    },
  ]);

  return parts;
}
