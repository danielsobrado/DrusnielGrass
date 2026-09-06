import type * as THREE from "three";
import { ActorContactIk } from "../../actor/ik/ActorContactIk";
import type { ActorTerrainContactSampler } from "../../actor/ik/ActorTerrainContact";
import { requireActorChain } from "../../actor/rig/ActorRigDefinition";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import {
  HUMANOID_CHAIN_LEG_LEFT,
  HUMANOID_CHAIN_LEG_RIGHT,
  type HumanoidRigBones,
} from "../rig/HumanoidRigBones";
import { HUMANOID_ANKLE_TO_SOLE } from "../rig/HumanoidRigTuning";

const DEGREES = Math.PI / 180;
/** How far the pelvis may drop to keep both feet reachable. */
const HUMANOID_MAX_PELVIS_DROP = 0.22;
/** How far a foot may tilt onto a slope. */
const HUMANOID_MAX_FOOT_ALIGN = 26 * DEGREES;
/** Convergence rate for the pelvis correction, per second. */
const HUMANOID_CONTACT_SMOOTHING_RATE = 12;

/**
 * Two-foot ground contact for humanoid actors.
 *
 * This is only configuration: which chains contact the ground, where their
 * soles sit, and which bone carries the body-support correction. The solving
 * itself is the shared {@link ActorContactIk}, which a quadruped uses with four
 * effectors and no changes.
 */
export function createHumanoidContactIk(
  definition: ActorRigDefinition,
  bones: HumanoidRigBones,
  sampler: ActorTerrainContactSampler,
  placement: THREE.Object3D,
): ActorContactIk {
  return new ActorContactIk({
    definition,
    placement,
    sampler,
    supportBone: bones.pelvis,
    maxSupportDrop: HUMANOID_MAX_PELVIS_DROP,
    maxAlignRadians: HUMANOID_MAX_FOOT_ALIGN,
    smoothingRate: HUMANOID_CONTACT_SMOOTHING_RATE,
    effectors: [
      {
        chain: requireActorChain(definition, HUMANOID_CHAIN_LEG_LEFT),
        gaitEffector: 0,
        soleOffset: HUMANOID_ANKLE_TO_SOLE,
        alignBone: bones.footLeft,
      },
      {
        chain: requireActorChain(definition, HUMANOID_CHAIN_LEG_RIGHT),
        gaitEffector: 1,
        soleOffset: HUMANOID_ANKLE_TO_SOLE,
        alignBone: bones.footRight,
      },
    ],
  });
}
