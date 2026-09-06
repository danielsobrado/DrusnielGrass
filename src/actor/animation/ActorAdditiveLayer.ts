import type { ActorAnimationInput } from "./ActorAnimationInput";
import type { ActorPoseStage } from "./ActorAnimationProfile";
import type { ActorGait } from "./ActorGait";
import { ActorPose } from "./ActorPose";
import type { ActorRigDefinition } from "../rig/ActorRigDefinition";
import type { ActorRigInstance } from "../rig/ActorRigInstance";

export interface ActorAdditiveTrackOptions {
  readonly name: string;
  readonly initialWeight?: number;
  readonly mask?: Float32Array;
  readonly update?: (
    deltaSeconds: number,
    input: ActorAnimationInput,
    elapsedSeconds: number,
    target: ActorPose,
  ) => void;
}

interface InternalAdditiveTrack {
  readonly name: string;
  readonly pose: ActorPose;
  readonly mask?: Float32Array;
  readonly update?: (
    deltaSeconds: number,
    input: ActorAnimationInput,
    elapsedSeconds: number,
    target: ActorPose,
  ) => void;
  weight: number;
  targetWeight: number;
  fadeDuration: number;
  fadeElapsed: number;
  fadeStartingWeight: number;
}

/**
 * Generic additive animation stage.
 *
 * Layers any number of additive delta poses onto the working actor pose with
 * independent weights and smooth fading. Authored delta poses are evaluated in
 * `preIkStages` so that additive postures and gestures compose cleanly over base
 * locomotion before IK solvers and joint limits are enforced.
 *
 * Sized and allocated once at actor creation, allocating zero memory in hot paths.
 */
export class ActorAdditiveLayer implements ActorPoseStage {
  readonly name: string;
  private readonly tracks = new Map<string, InternalAdditiveTrack>();
  private readonly trackList: InternalAdditiveTrack[] = [];
  private elapsedSeconds = 0;

  constructor(
    private readonly definition: ActorRigDefinition,
    name = "additive-blending",
  ) {
    this.name = name;
  }

  addTrack(options: ActorAdditiveTrackOptions): ActorPose {
    const existing = this.tracks.get(options.name);
    if (existing !== undefined) {
      return existing.pose;
    }
    const pose = new ActorPose(this.definition);
    const initialWeight = options.initialWeight ?? 0;
    const clampedWeight = Math.max(0, Math.min(1, initialWeight));
    const track: InternalAdditiveTrack = {
      name: options.name,
      pose,
      mask: options.mask,
      update: options.update,
      weight: clampedWeight,
      targetWeight: clampedWeight,
      fadeDuration: 0,
      fadeElapsed: 0,
      fadeStartingWeight: clampedWeight,
    };
    this.tracks.set(options.name, track);
    this.trackList.push(track);
    return pose;
  }

  setWeight(name: string, weight: number): void {
    const track = this.tracks.get(name);
    if (track === undefined) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, Number.isFinite(weight) ? weight : 0));
    track.weight = clamped;
    track.targetWeight = clamped;
    track.fadeDuration = 0;
  }

  getWeight(name: string): number {
    return this.tracks.get(name)?.weight ?? 0;
  }

  fadeTo(name: string, targetWeight: number, durationSeconds: number): void {
    const track = this.tracks.get(name);
    if (track === undefined) {
      return;
    }
    const clamped = Math.max(
      0,
      Math.min(1, Number.isFinite(targetWeight) ? targetWeight : 0),
    );
    if (!(durationSeconds > 0)) {
      track.weight = clamped;
      track.targetWeight = clamped;
      track.fadeDuration = 0;
      return;
    }
    track.fadeStartingWeight = track.weight;
    track.targetWeight = clamped;
    track.fadeDuration = durationSeconds;
    track.fadeElapsed = 0;
  }

  getTrackPose(name: string): ActorPose | undefined {
    return this.tracks.get(name)?.pose;
  }

  apply(
    input: ActorAnimationInput,
    deltaSeconds: number,
    _gait: ActorGait,
    pose: ActorPose,
    _rigInstance: ActorRigInstance,
  ): void {
    this.elapsedSeconds += deltaSeconds;
    const tracks = this.trackList;
    const count = tracks.length;

    for (let index = 0; index < count; index += 1) {
      const track = tracks[index];

      // Update fade transition
      if (track.fadeDuration > 0) {
        track.fadeElapsed += deltaSeconds;
        if (track.fadeElapsed >= track.fadeDuration) {
          track.weight = track.targetWeight;
          track.fadeDuration = 0;
        } else {
          const progress = track.fadeElapsed / track.fadeDuration;
          const eased = progress * progress * (3 - 2 * progress);
          track.weight =
            track.fadeStartingWeight +
            (track.targetWeight - track.fadeStartingWeight) * eased;
        }
      }

      if (track.weight <= 0 && track.update === undefined) {
        continue;
      }

      // Update dynamic / procedural generator if provided
      if (track.update !== undefined) {
        track.update(
          deltaSeconds,
          input,
          this.elapsedSeconds,
          track.pose,
        );
      }

      if (track.weight > 0) {
        if (track.mask !== undefined) {
          pose.addAdditiveMasked(track.pose, track.mask, track.weight);
        } else {
          pose.addAdditive(track.pose, track.weight);
        }
      }
    }
  }

  reset(): void {
    this.elapsedSeconds = 0;
    const tracks = this.trackList;
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      track.weight = 0;
      track.targetWeight = 0;
      track.fadeDuration = 0;
      track.fadeElapsed = 0;
      track.fadeStartingWeight = 0;
      track.pose.resetToBind();
    }
  }
}
