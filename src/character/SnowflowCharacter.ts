import * as THREE from "three";
import { createActorAnimationInput } from "../actor/animation/ActorAnimationInput";
import { ActorAnimationRuntime } from "../actor/animation/ActorAnimationRuntime";
import type { ActorTerrainContactSampler } from "../actor/ik/ActorTerrainContact";
import { createHumanoidContactIk } from "./animation/HumanoidContactIk";
import { addDrowCharacterFeatures } from "./DrowCharacterFeatures";
import {
  createHumanoidAnimationProfile,
  type HumanoidAnimationProfile,
} from "./animation/HumanoidAnimationProfile";
import { createHumanoidLocomotionFacts } from "./animation/HumanoidLocomotionLayer";
import { HUMANOID_STRIDE_LENGTH_METERS } from "./animation/HumanoidLocomotionTuning";
import { SnowflowClothMotion } from "./secondary/SnowflowClothMotion";
import {
  buildSnowflowCharacter,
  type SnowflowCharacterRig,
} from "./SnowflowCharacterGeometry";

const UP = new THREE.Vector3(0, 1, 0);
/** Metres of travel per full gait cycle. The grass trail stamps feet from it. */
export const STRIDE_LENGTH_METERS = HUMANOID_STRIDE_LENGTH_METERS;
const MAX_SLOPE_TILT_RADIANS = THREE.MathUtils.degToRad(18);

export interface SnowflowCharacterPose {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  groundNormal: THREE.Vector3;
  facing: number;
  speed: number;
  runSpeed: number;
  acceleration: number;
  distanceTravelled: number;
  grounded: boolean;
  verticalVelocity: number;
  jumpStarted: boolean;
  landed: boolean;
  landingImpact: number;
  crouched?: boolean;
  rollStarted?: boolean;
}

interface SnowflowCharacterResources {
  rig: SnowflowCharacterRig;
  profile: HumanoidAnimationProfile;
  runtime: ActorAnimationRuntime;
  cloth: SnowflowClothMotion;
}

/**
 * The player character.
 *
 * This class is orchestration: it owns world placement and slope alignment,
 * translates the controller's pose into actor animation facts, and hands them
 * to the shared runtime. It contains no pose equations — those belong to the
 * humanoid locomotion layer, which a humanoid NPC uses the same way without
 * going anywhere near a player controller.
 */
export class SnowflowCharacter {
  private readonly rig: SnowflowCharacterRig;
  private readonly profile: HumanoidAnimationProfile;
  private readonly runtime: ActorAnimationRuntime;
  private readonly cloth: SnowflowClothMotion;
  private readonly desiredSlope = new THREE.Quaternion();
  private readonly limitedNormal = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldVelocity = new THREE.Vector3();
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly animationInput = createActorAnimationInput(
    this.worldPosition,
    this.worldVelocity,
    this.groundNormal,
  );
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    scale: number,
    landingRecoverySeconds: number,
    terrainContact?: ActorTerrainContactSampler,
  ) {
    const resources = createSnowflowCharacterResources(
      scene,
      scale,
      landingRecoverySeconds,
      terrainContact,
    );
    this.rig = resources.rig;
    this.profile = resources.profile;
    this.runtime = resources.runtime;
    this.cloth = resources.cloth;
  }

  update(deltaSeconds: number, pose: SnowflowCharacterPose): void {
    if (this.disposed) {
      return;
    }
    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      0.1,
    );
    if (delta <= 0) {
      this.cloth.reset();
    }
    this.rig.root.position.copy(pose.position);
    this.rig.heading.rotation.y = pose.facing;
    this.updateSlope(pose.grounded ? pose.groundNormal : UP, delta);
    // Contact IK reads the placement matrix to move between actor and world
    // space, so placement is resolved before the pose pipeline runs.
    this.rig.root.updateMatrixWorld(true);
    this.syncAnimationInput(pose);
    this.runtime.update(delta, this.animationInput);
  }

  reset(pose: SnowflowCharacterPose): void {
    if (this.disposed) {
      return;
    }
    this.rig.root.position.copy(pose.position);
    this.rig.heading.rotation.y = pose.facing;
    this.updateSlope(pose.grounded ? pose.groundNormal : UP, 0, true);
    this.rig.root.updateMatrixWorld(true);
    this.syncAnimationInput(pose);
    this.profile.facts.jumpStarted = false;
    this.profile.facts.landed = false;
    this.profile.facts.landingImpact = 0;
    this.profile.facts.crouched = false;
    this.profile.facts.rollStarted = false;
    this.animationInput.teleported = true;
    this.runtime.reset(this.animationInput);
    this.animationInput.teleported = false;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeSafely("animation runtime", () => this.runtime.dispose());
    disposeSnowflowRig(this.rig);
  }

  getState(): string {
    return this.runtime.getStateName();
  }

  setCrouch(crouched: boolean): void {
    if (!this.disposed) {
      this.profile.facts.crouched = crouched;
    }
  }

  isCrouched(): boolean {
    return this.profile.locomotion.isCrouched();
  }

  triggerRoll(): void {
    if (!this.disposed) {
      this.profile.facts.rollStarted = true;
    }
  }

  isRolling(): boolean {
    return this.profile.locomotion.isRolling();
  }

  setLookTarget(target: THREE.Vector3 | null): void {
    if (this.disposed) {
      return;
    }
    if (target === null) {
      this.profile.lookIk.clear();
    } else {
      this.profile.lookIk.setLookTarget(
        this.worldPosition.x,
        this.worldPosition.y + 1.2,
        this.worldPosition.z,
        target.x,
        target.y,
        target.z,
      );
    }
  }

  setLookDirection(dirX: number, dirY: number, dirZ: number): void {
    if (!this.disposed) {
      this.profile.lookIk.setLookDirection(dirX, dirY, dirZ);
    }
  }

  clearLookTarget(): void {
    if (!this.disposed) {
      this.profile.lookIk.clear();
    }
  }

  setAdditiveWeight(name: string, weight: number): void {
    if (!this.disposed) {
      this.profile.additive.setWeight(name, weight);
    }
  }

  getAdditiveWeight(name: string): number {
    return this.profile.additive.getWeight(name);
  }

  fadeAdditiveWeight(
    name: string,
    targetWeight: number,
    durationSeconds: number,
  ): void {
    if (!this.disposed) {
      this.profile.additive.fadeTo(name, targetWeight, durationSeconds);
    }
  }

  getLocomotionBlendWeights() {
    return this.profile.locomotion.getBlendWeights();
  }

  setExplicitLocomotionWeights(
    weights: { idle?: number; walk?: number; run?: number } | null,
  ): void {
    if (!this.disposed) {
      this.profile.locomotion.setExplicitWeights(weights);
    }
  }

  private syncAnimationInput(pose: SnowflowCharacterPose): void {
    const input = this.animationInput;
    this.worldPosition.copy(pose.position);
    this.worldVelocity.copy(pose.velocity);
    this.groundNormal.copy(pose.groundNormal);
    input.facing = pose.facing;
    input.grounded = pose.grounded;
    input.speed = pose.speed;
    input.referenceSpeed = pose.runSpeed;
    input.normalizedSpeed =
      pose.runSpeed > 0 ? THREE.MathUtils.clamp(pose.speed / pose.runSpeed, 0, 1) : 0;
    input.acceleration = pose.acceleration;
    input.verticalVelocity = pose.verticalVelocity;
    input.distanceTravelled = pose.distanceTravelled;
    this.profile.facts.jumpStarted = pose.jumpStarted;
    this.profile.facts.landed = pose.landed;
    this.profile.facts.landingImpact = pose.landingImpact;
    this.profile.facts.crouched = pose.crouched === true;
    if (this.profile.locomotion.isRolling()) {
      this.profile.facts.rollStarted = false;
    } else if (pose.rollStarted) {
      this.profile.facts.rollStarted = true;
    }
  }

  private updateSlope(
    normal: THREE.Vector3,
    deltaSeconds: number,
    immediate = false,
  ): void {
    this.limitedNormal.copy(normal);
    const slopeAngle = Math.acos(
      THREE.MathUtils.clamp(this.limitedNormal.dot(UP), -1, 1),
    );
    if (slopeAngle > MAX_SLOPE_TILT_RADIANS) {
      this.limitedNormal
        .lerp(UP, 1 - MAX_SLOPE_TILT_RADIANS / slopeAngle)
        .normalize();
    }
    this.desiredSlope.setFromUnitVectors(UP, this.limitedNormal);
    if (immediate) {
      this.rig.slope.quaternion.copy(this.desiredSlope);
      return;
    }
    const blend = 1 - Math.exp(-9 * deltaSeconds);
    this.rig.slope.quaternion.slerp(this.desiredSlope, blend);
  }
}

function createSnowflowCharacterResources(
  scene: THREE.Scene,
  scale: number,
  landingRecoverySeconds: number,
  terrainContact?: ActorTerrainContactSampler,
): SnowflowCharacterResources {
  const rig = buildSnowflowCharacter(scene, scale);
  let cloth: SnowflowClothMotion | undefined;
  try {
    addDrowCharacterFeatures(rig);
    const facts = createHumanoidLocomotionFacts();
    cloth = new SnowflowClothMotion(rig, facts);
    const profile = createHumanoidAnimationProfile({
      definition: rig.humanoid.definition,
      bones: rig.humanoid.bones,
      landingRecoverySeconds,
      facts,
      secondaryMotion: [cloth],
      ikStages:
        terrainContact === undefined
          ? undefined
          : [
              createHumanoidContactIk(
                rig.humanoid.definition,
                rig.humanoid.bones,
                terrainContact,
                rig.heading,
              ),
            ],
    });
    const runtime = new ActorAnimationRuntime(profile, rig.rigInstance);
    return { rig, profile, runtime, cloth };
  } catch (error) {
    disposeSafely("cloth construction", () => cloth?.dispose());
    disposeSnowflowRig(rig);
    throw error;
  }
}

function disposeSnowflowRig(rig: SnowflowCharacterRig): void {
  disposeSafely("rig instance", () => rig.rigInstance.dispose());
  disposeSafely("character root", () => rig.root.removeFromParent());
  for (const geometry of rig.geometries) {
    disposeSafely("character geometry", () => geometry.dispose());
  }
  for (const material of rig.materials) {
    disposeSafely("character material", () => material.dispose());
  }
}

function disposeSafely(label: string, dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    console.warn(`[Drusniel World] Snowflow ${label} cleanup failed.`, error);
  }
}
