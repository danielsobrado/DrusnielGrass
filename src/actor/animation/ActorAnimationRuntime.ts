import { applyActorJointLimits } from "../rig/ActorJointLimits";
import type { ActorRigInstance } from "../rig/ActorRigInstance";
import type { ActorAnimationInput } from "./ActorAnimationInput";
import type { ActorAnimationProfile } from "./ActorAnimationProfile";
import { ActorPose } from "./ActorPose";
import { ActorPoseBlender } from "./ActorPoseBlender";

/**
 * Composes one actor's pose, in one stable order, for every actor family.
 *
 * The runtime owns pose buffers and blending but generates nothing itself: the
 * profile's locomotion layer writes the base pose and the profile's stages
 * write everything after it. A family may skip any stage it does not support,
 * but no family may reorder the pipeline.
 *
 * All buffers are allocated here, once, when the actor is created. A steady
 * frame allocates nothing.
 */
export class ActorAnimationRuntime {
  private readonly pose: ActorPose;
  /** Last blended locomotion pose, before stages that are reapplied every frame. */
  private readonly locomotionPose: ActorPose;
  private readonly blender: ActorPoseBlender;
  private state = 0;
  private stateTime = 0;
  private started = false;
  private disposed = false;

  constructor(
    private readonly profile: ActorAnimationProfile,
    private readonly rigInstance: ActorRigInstance,
  ) {
    if (rigInstance.definition !== profile.definition) {
      throw new Error(
        `Actor rig "${profile.definition.name}" runtime received an instance from a different definition.`,
      );
    }
    validateStateCount(profile.locomotion.stateCount, profile.definition.name);
    this.pose = new ActorPose(profile.definition);
    this.locomotionPose = new ActorPose(profile.definition);
    this.blender = new ActorPoseBlender(profile.definition);
  }

  private runIk = true;
  private runSecondary = true;

  getState(): number {
    return this.state;
  }

  getStateName(): string {
    return this.profile.locomotion.stateName(this.state);
  }

  update(deltaSeconds: number, input: ActorAnimationInput): void {
    if (this.disposed) {
      return;
    }
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? deltaSeconds
      : 0;
    this.stateTime += delta;
    this.profile.locomotion.advanceTime(delta);

    // 1-3. Locomotion state selection, base pose, and transition blending.
    const nextState = this.profile.locomotion.selectState(
      input,
      this.state,
      this.stateTime,
    );
    validateState(
      nextState,
      this.profile.locomotion.stateCount,
      this.profile.definition.name,
    );
    if (nextState !== this.state) {
      if (this.started) {
        // Stages are reapplied below, so transition from the previous blended
        // locomotion pose rather than baking prior IK/support into the source.
        const duration = this.profile.locomotion.transitionDuration(
          this.state,
          nextState,
        );
        if (!Number.isFinite(duration) || duration < 0) {
          throw new Error(
            `Actor rig "${this.profile.definition.name}" returned an invalid locomotion transition duration.`,
          );
        }
        this.blender.begin(
          this.locomotionPose,
          duration,
          this.profile.locomotion.transitionEasing(this.state, nextState),
        );
      }
      this.state = nextState;
      this.stateTime = 0;
    }
    this.started = true;

    this.profile.gait.setFromDistance(input.distanceTravelled);
    this.profile.locomotion.generatePose(
      input,
      this.state,
      this.stateTime,
      this.profile.gait,
      this.pose,
    );
    this.blender.apply(this.pose, delta);
    this.locomotionPose.copyFrom(this.pose);

    // 4-6. Action layers and additives are profile stages; constraints that
    // must hold before IK reads the pose run here.
    if (this.runIk) {
      this.runStages(this.profile.preIkStages, input, delta);
    }

    // 7-9. Contact, reach, and look solving, in the family's declared order.
    if (this.runIk) {
      this.runStages(this.profile.ikStages, input, delta);
    }

    // 10-11. Final limits, then the pose reaches the bones.
    if (this.profile.enforceJointLimits) {
      applyActorJointLimits(
        this.pose.rotations,
        this.profile.definition.jointLimits,
      );
    }
    this.rigInstance.applyPose(this.pose.rotations, this.pose.translations);

    // 12-13. One world-matrix boundary, then secondary motion on the final pose.
    this.rigInstance.updateWorldMatrices();
    const secondary = this.profile.secondaryMotion;
    if (this.runSecondary && secondary !== undefined) {
      for (let index = 0; index < secondary.length; index += 1) {
        secondary[index].update(delta, input, this.rigInstance);
      }
    }
  }

  /**
   * Turns off work this actor is currently too far away to be worth.
   *
   * The runtime is told what to skip, never how far away anything is: distance
   * policy belongs to whoever owns the population. Both flags default to on, so
   * the player and any actor nobody has an opinion about keep full fidelity.
   */
  setQuality(runIk: boolean, runSecondaryMotion: boolean): void {
    this.runIk = runIk;
    this.runSecondary = runSecondaryMotion;
  }

  /**
   * Clears every piece of retained motion state.
   *
   * Called on spawn, teleport, and reactivation. No solver may keep a target
   * from before the reset, and no transition may blend across it.
   */
  reset(input: ActorAnimationInput): void {
    if (this.disposed) {
      return;
    }
    this.state = 0;
    this.stateTime = 0;
    this.started = false;
    this.pose.resetToBind();
    this.locomotionPose.resetToBind();
    this.blender.reset();
    this.profile.gait.reset();
    this.profile.locomotion.reset();
    this.resetStages(this.profile.preIkStages);
    this.resetStages(this.profile.ikStages);
    const secondary = this.profile.secondaryMotion;
    if (secondary !== undefined) {
      for (let index = 0; index < secondary.length; index += 1) {
        secondary[index].reset();
      }
    }
    this.update(0, input);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const secondary = this.profile.secondaryMotion;
    if (secondary !== undefined) {
      for (let index = 0; index < secondary.length; index += 1) {
        secondary[index].dispose();
      }
    }
  }

  private runStages(
    stages: ActorAnimationProfile["ikStages"],
    input: ActorAnimationInput,
    deltaSeconds: number,
  ): void {
    if (stages === undefined) {
      return;
    }
    for (let index = 0; index < stages.length; index += 1) {
      stages[index].apply(
        input,
        deltaSeconds,
        this.profile.gait,
        this.pose,
        this.rigInstance,
      );
    }
  }

  private resetStages(stages: ActorAnimationProfile["ikStages"]): void {
    if (stages === undefined) {
      return;
    }
    for (let index = 0; index < stages.length; index += 1) {
      stages[index].reset();
    }
  }
}

function validateStateCount(stateCount: number, rigName: string): void {
  if (!Number.isInteger(stateCount) || stateCount <= 0) {
    throw new Error(
      `Actor rig "${rigName}" locomotion stateCount must be a positive integer.`,
    );
  }
}

function validateState(state: number, stateCount: number, rigName: string): void {
  if (!Number.isInteger(state) || state < 0 || state >= stateCount) {
    throw new Error(
      `Actor rig "${rigName}" selected locomotion state ${state} outside 0..${stateCount - 1}.`,
    );
  }
}
