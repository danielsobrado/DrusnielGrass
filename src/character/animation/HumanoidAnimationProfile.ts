import type {
  ActorAnimationProfile,
  ActorPoseStage,
  ActorSecondaryMotion,
} from "../../actor/animation/ActorAnimationProfile";
import { ActorGait } from "../../actor/animation/ActorGait";
import type { ActorRigDefinition } from "../../actor/rig/ActorRigDefinition";
import type { HumanoidRigBones } from "../rig/HumanoidRigBones";
import {
  createHumanoidLocomotionFacts,
  HumanoidLocomotionLayer,
  type HumanoidLocomotionFacts,
} from "./HumanoidLocomotionLayer";
import {
  HUMANOID_STANCE_DUTY_FACTOR,
  HUMANOID_STRIDE_LENGTH_METERS,
} from "./HumanoidLocomotionTuning";
import { ActorLookIk } from "../../actor/ik/ActorLookIk";
import { HumanoidAdditiveLayer } from "./HumanoidAdditiveLayer";

export interface HumanoidAnimationProfileOptions {
  readonly definition: ActorRigDefinition;
  readonly bones: HumanoidRigBones;
  readonly landingRecoverySeconds: number;
  /**
   * The jump and landing facts this actor's mover writes into. Callers create
   * it first when a secondary module needs to read the same impulses.
   */
  readonly facts?: HumanoidLocomotionFacts;
  readonly secondaryMotion?: readonly ActorSecondaryMotion[];
  readonly ikStages?: readonly ActorPoseStage[];
  readonly preIkStages?: readonly ActorPoseStage[];
  readonly additive?: HumanoidAdditiveLayer;
  readonly lookIk?: ActorLookIk;
}

/**
 * Everything a humanoid actor installs on the shared runtime.
 *
 * The player and any humanoid NPC build this the same way. What differs between
 * them is which stages and secondary modules they pass in — an NPC with no cape
 * simply supplies no cloth module, rather than disabling one.
 */
export interface HumanoidAnimationProfile extends ActorAnimationProfile {
  readonly locomotion: HumanoidLocomotionLayer;
  readonly facts: HumanoidLocomotionFacts;
  readonly additive: HumanoidAdditiveLayer;
  readonly lookIk: ActorLookIk;
}

export function createHumanoidAnimationProfile(
  options: HumanoidAnimationProfileOptions,
): HumanoidAnimationProfile {
  const facts = options.facts ?? createHumanoidLocomotionFacts();
  const locomotion = new HumanoidLocomotionLayer(
    options.bones,
    facts,
    options.landingRecoverySeconds,
  );
  const additive =
    options.additive ??
    new HumanoidAdditiveLayer(options.definition, options.bones);
  const preIkStages = [
    additive.stage,
    ...(options.preIkStages ?? []),
  ];

  const lookSegments = [
    ...(options.bones.spineUpper !== undefined
      ? [{ bone: options.bones.spineUpper, weight: 0.12 }]
      : []),
    ...(options.bones.neck !== undefined
      ? [{ bone: options.bones.neck, weight: 0.38 }]
      : []),
    {
      bone: options.bones.head,
      weight: options.bones.neck !== undefined ? 0.5 : 0.88,
    },
  ];
  const lookIk =
    options.lookIk ??
    new ActorLookIk({
      definition: options.definition,
      segments: lookSegments,
      maxYawRadians: Math.PI * 0.42,
      maxPitchRadians: Math.PI * 0.25,
      smoothingRate: 12,
    });

  const ikStages = [...(options.ikStages ?? []), lookIk];

  // Two feet, phase-opposed. The same gait object with a four-entry table is
  // what a quadruped walks on.
  const gait = new ActorGait({
    strideLengthMeters: HUMANOID_STRIDE_LENGTH_METERS,
    effectors: [
      { phaseOffset: 0, dutyFactor: HUMANOID_STANCE_DUTY_FACTOR },
      { phaseOffset: 0.5, dutyFactor: HUMANOID_STANCE_DUTY_FACTOR },
    ],
  });
  return {
    definition: options.definition,
    locomotion,
    gait,
    facts,
    additive,
    lookIk,
    preIkStages,
    ikStages,
    secondaryMotion: options.secondaryMotion,
    enforceJointLimits: true,
  };
}

