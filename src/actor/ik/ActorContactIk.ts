import * as THREE from "three";
import type { ActorAnimationInput } from "../animation/ActorAnimationInput";
import type { ActorPoseStage } from "../animation/ActorAnimationProfile";
import type { ActorGait } from "../animation/ActorGait";
import type { ActorPose } from "../animation/ActorPose";
import { ActorPoseSpace } from "../animation/ActorPoseSpace";
import type { ActorRigDefinition } from "../rig/ActorRigDefinition";
import type { ActorTwoBoneChain } from "../rig/ActorRigChains";
import {
  createActorContactSample,
  type ActorContactSample,
  type ActorTerrainContactSampler,
} from "./ActorTerrainContact";
import { TwoBoneIk } from "./TwoBoneIk";

export interface ActorContactEffectorConfig {
  readonly chain: ActorTwoBoneChain;
  /** Index of this effector in the profile's gait table. */
  readonly gaitEffector: number;
  /** Distance from the end bone's origin down to the contact surface. */
  readonly soleOffset: number;
  /** Bone oriented to the ground normal after the solve, or -1. */
  readonly alignBone: number;
}

export interface ActorContactIkOptions {
  readonly definition: ActorRigDefinition;
  readonly effectors: readonly ActorContactEffectorConfig[];
  readonly sampler: ActorTerrainContactSampler;
  /** The object whose world matrix maps actor model space into the world. */
  readonly placement: THREE.Object3D;
  /** Bone lowered so planted contacts stay reachable — a shared body support. */
  readonly supportBone: number;
  /** Largest downward support correction, in actor units. */
  readonly maxSupportDrop: number;
  /** Largest terminal alignment to the ground normal, in radians. */
  readonly maxAlignRadians: number;
  /** Rate the support correction and alignment converge, per second. */
  readonly smoothingRate: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();

/**
 * Profile-driven ground contact for any number of limbs.
 *
 * Nothing here is anatomical. A profile hands over a set of contact effectors —
 * two for a humanoid, four for a quadruped — each naming a chain, a gait phase,
 * and how far its sole sits below the end bone. The stage samples the ground
 * under each effector's animated position, lowers the shared support bone for
 * weighted planted contacts, and then solves each chain by the amount the gait
 * says that limb is planted, so swinging limbs are never pinned to the ground.
 */
export class ActorContactIk implements ActorPoseStage {
  readonly name = "contactIk";
  private readonly space: ActorPoseSpace;
  private readonly solver: TwoBoneIk;
  private readonly sample: ActorContactSample = createActorContactSample();
  private readonly worldPoint = new THREE.Vector3();
  private readonly modelPoint = new THREE.Vector3();
  private readonly targetPoint = new THREE.Vector3();
  private readonly groundNormal = new THREE.Vector3();
  private readonly toWorld = new THREE.Matrix4();
  private readonly toModel = new THREE.Matrix4();
  private readonly normalToModel = new THREE.Matrix3();
  private readonly alignRotation = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();
  private readonly localRotation = new THREE.Quaternion();
  private readonly currentLocal = new THREE.Quaternion();
  /** Per-effector contact target in actor model space, 3 elements each. */
  private readonly contactTargets: Float32Array;
  /** Per-effector ground normal in actor model space, 3 elements each. */
  private readonly contactNormals: Float32Array;
  private supportOffset = 0;
  private gaitValidated = false;

  constructor(private readonly options: ActorContactIkOptions) {
    validateOptions(options);
    this.space = new ActorPoseSpace(options.definition);
    this.solver = new TwoBoneIk(options.definition);
    this.contactTargets = new Float32Array(options.effectors.length * 3);
    this.contactNormals = new Float32Array(options.effectors.length * 3);
  }

  apply(
    input: ActorAnimationInput,
    deltaSeconds: number,
    gait: ActorGait,
    pose: ActorPose,
  ): void {
    if (!this.gaitValidated) {
      validateGaitEffectors(this.options.effectors, gait.effectorCount);
      this.gaitValidated = true;
    }

    const effectors = this.options.effectors;
    if (!input.grounded) {
      // Airborne actors have no ground to solve against. Release the support
      // correction smoothly so landing does not snap the body.
      this.supportOffset = approach(
        this.supportOffset,
        0,
        deltaSeconds,
        this.options.smoothingRate,
      );
      this.applySupport(pose);
      return;
    }

    this.toWorld.copy(this.options.placement.matrixWorld);
    this.toModel.copy(this.toWorld).invert();
    // World normals transform back to model space by the transpose of the
    // model-to-world linear transform. This also handles the player's slope
    // placement and non-uniform scale correctly.
    this.normalToModel.setFromMatrix4(this.toWorld).transpose();
    this.space.update(pose);

    // 1. What the ground wants from each contact, in model space.
    let deepestLift = 0;
    for (let index = 0; index < effectors.length; index += 1) {
      const effector = effectors[index];
      const endBone = effector.chain.end;
      this.modelPoint.fromArray(this.space.positions, endBone * 3);
      this.worldPoint.copy(this.modelPoint).applyMatrix4(this.toWorld);
      this.options.sampler.sampleContact(
        this.worldPoint.x,
        this.worldPoint.z,
        this.sample,
      );

      // Project the animated contact vertically onto the sampled world surface,
      // then keep the complete transformed model-space point. Under a tilted
      // placement, a world-vertical correction has model-space X/Z components;
      // discarding them moves the solved contact away from the sampled point.
      this.worldPoint.y = this.sample.height;
      this.modelPoint.copy(this.worldPoint).applyMatrix4(this.toModel);
      this.modelPoint.y += effector.soleOffset;
      const contactBase = index * 3;
      this.contactTargets[contactBase] = this.modelPoint.x;
      this.contactTargets[contactBase + 1] = this.modelPoint.y;
      this.contactTargets[contactBase + 2] = this.modelPoint.z;

      const animatedY = this.space.positions[endBone * 3 + 1];
      const lift = this.modelPoint.y - animatedY;

      this.groundNormal
        .set(this.sample.normalX, this.sample.normalY, this.sample.normalZ)
        .applyMatrix3(this.normalToModel);
      if (this.groundNormal.lengthSq() < 1e-8) {
        this.groundNormal.copy(UP);
      } else {
        this.groundNormal.normalize();
      }
      this.contactNormals[contactBase] = this.groundNormal.x;
      this.contactNormals[contactBase + 1] = this.groundNormal.y;
      this.contactNormals[contactBase + 2] = this.groundNormal.z;

      // Swinging effectors are not support constraints. Fade their influence in
      // with the same plant weight used by the chain solve to avoid body snaps.
      const supportLift = lift * gait.getPlantWeight(effector.gaitEffector);
      if (supportLift < deepestLift) {
        deepestLift = supportLift;
      }
    }

    // 2. Lower the support bone so the weighted planted contacts stay inside
    // their chains' reach, then re-resolve model space beneath it.
    const desiredSupport = Math.max(deepestLift, -this.options.maxSupportDrop);
    this.supportOffset = approach(
      this.supportOffset,
      Math.min(desiredSupport, 0),
      deltaSeconds,
      this.options.smoothingRate,
    );
    this.applySupport(pose);
    this.space.update(pose);

    // 3. Solve each chain by how planted the gait says that limb is.
    for (let index = 0; index < effectors.length; index += 1) {
      const effector = effectors[index];
      const plant = gait.getPlantWeight(effector.gaitEffector);
      if (plant <= 0) {
        continue;
      }
      const endBone = effector.chain.end;
      this.modelPoint.fromArray(this.space.positions, endBone * 3);
      this.targetPoint.fromArray(this.contactTargets, index * 3);
      this.modelPoint.lerp(this.targetPoint, plant);
      this.solver.solve(effector.chain, this.modelPoint, this.space, pose);
      // Alignment reads the solved parent transforms, and any later chain must
      // see the complete pose produced by both solve and alignment.
      this.space.update(pose);
      if (effector.alignBone >= 0) {
        this.alignToGround(effector, index, plant, pose);
        if (index + 1 < effectors.length) {
          this.space.update(pose);
        }
      }
    }
  }

  reset(): void {
    this.supportOffset = 0;
    this.contactTargets.fill(0);
    this.contactNormals.fill(0);
  }

  /**
   * Tilts a terminal toward the surface it is standing on.
   *
   * The alignment is scaled by the plant weight and clamped, so a limb only
   * follows terrain while it is actually carrying weight.
   */
  private alignToGround(
    effector: ActorContactEffectorConfig,
    index: number,
    plant: number,
    pose: ActorPose,
  ): void {
    this.groundNormal.fromArray(this.contactNormals, index * 3);
    if (this.groundNormal.lengthSq() < 1e-8) {
      return;
    }
    this.groundNormal.normalize();
    this.alignRotation.setFromUnitVectors(UP, this.groundNormal);
    // Clamp how far the terminal may tilt, then scale by how planted it is.
    const angle = 2 * Math.acos(Math.min(Math.abs(this.alignRotation.w), 1));
    const limit = this.options.maxAlignRadians;
    const weight = plant * (angle > limit ? limit / angle : 1);
    this.alignRotation.slerp(IDENTITY, 1 - weight);

    const bone = effector.alignBone;
    const parent = this.options.definition.parents[bone];
    if (parent < 0) {
      return;
    }
    // The alignment is a model-space swing applied on top of whatever the pose
    // already holds: newLocal = parent^-1 * swing * parent * currentLocal.
    this.parentRotation.fromArray(this.space.rotations, parent * 4);
    this.currentLocal.fromArray(pose.rotations, bone * 4);
    this.localRotation
      .copy(this.parentRotation)
      .invert()
      .multiply(this.alignRotation)
      .multiply(this.parentRotation)
      .multiply(this.currentLocal);
    pose.rotations[bone * 4] = this.localRotation.x;
    pose.rotations[bone * 4 + 1] = this.localRotation.y;
    pose.rotations[bone * 4 + 2] = this.localRotation.z;
    pose.rotations[bone * 4 + 3] = this.localRotation.w;
  }

  private applySupport(pose: ActorPose): void {
    const bone = this.options.supportBone;
    const base = bone * 3;
    pose.translations[base + 1] += this.supportOffset;
  }
}

function validateOptions(options: ActorContactIkOptions): void {
  const boneCount = options.definition.boneCount;
  if (
    !Number.isInteger(options.supportBone) ||
    options.supportBone < 0 ||
    options.supportBone >= boneCount
  ) {
    throw new Error("Actor contact IK support bone is out of range.");
  }
  if (options.definition.translatableFlags[options.supportBone] !== 1) {
    throw new Error("Actor contact IK support bone must allow translation.");
  }
  if (!Number.isFinite(options.maxSupportDrop) || options.maxSupportDrop < 0) {
    throw new Error("Actor contact IK maxSupportDrop must be finite and non-negative.");
  }
  if (!Number.isFinite(options.maxAlignRadians) || options.maxAlignRadians < 0) {
    throw new Error("Actor contact IK maxAlignRadians must be finite and non-negative.");
  }
  if (!Number.isFinite(options.smoothingRate) || options.smoothingRate < 0) {
    throw new Error("Actor contact IK smoothingRate must be finite and non-negative.");
  }

  for (let index = 0; index < options.effectors.length; index += 1) {
    const effector = options.effectors[index];
    if (!Number.isInteger(effector.gaitEffector) || effector.gaitEffector < 0) {
      throw new Error(`Actor contact IK effector ${index} has an invalid gait index.`);
    }
    if (!Number.isFinite(effector.soleOffset)) {
      throw new Error(`Actor contact IK effector ${index} has a non-finite sole offset.`);
    }
    if (
      effector.alignBone !== -1 &&
      (!Number.isInteger(effector.alignBone) ||
        effector.alignBone < 0 ||
        effector.alignBone >= boneCount)
    ) {
      throw new Error(`Actor contact IK effector ${index} has an invalid align bone.`);
    }
    if (options.definition.chains.get(effector.chain.name) !== effector.chain) {
      throw new Error(`Actor contact IK effector ${index} uses a foreign chain definition.`);
    }
  }
}

function validateGaitEffectors(
  effectors: readonly ActorContactEffectorConfig[],
  gaitEffectorCount: number,
): void {
  for (let index = 0; index < effectors.length; index += 1) {
    if (effectors[index].gaitEffector >= gaitEffectorCount) {
      throw new Error(`Actor contact IK effector ${index} references a missing gait effector.`);
    }
  }
}

function approach(
  current: number,
  target: number,
  deltaSeconds: number,
  rate: number,
): number {
  if (!(deltaSeconds > 0) || !(rate > 0)) {
    return target;
  }
  const blend = 1 - Math.exp(-rate * deltaSeconds);
  return current + (target - current) * blend;
}
