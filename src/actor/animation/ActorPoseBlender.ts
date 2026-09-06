import type { ActorRigDefinition } from "../rig/ActorRigDefinition";
import { ActorPose } from "./ActorPose";

export type ActorEasing = "linear" | "smooth" | "easeOut";

/**
 * Locomotion transition blending.
 *
 * When a transition starts the blender freezes the current locomotion pose,
 * then blends that frozen source toward a continuously regenerated destination.
 * That lets a transition be interrupted mid-blend without a snap while keeping
 * post-locomotion stages such as IK outside the transition source.
 */
export class ActorPoseBlender {
  /** Pose captured when the current transition started. */
  private readonly source: ActorPose;
  private duration = 0;
  private elapsed = 0;
  private easing: ActorEasing = "smooth";
  private blending = false;

  constructor(definition: ActorRigDefinition) {
    this.source = new ActorPose(definition);
  }

  get isBlending(): boolean {
    return this.blending;
  }

  /**
   * Starts a transition away from `current`.
   *
   * Interrupting an in-flight blend is safe and allocates nothing: the current
   * blended locomotion pose becomes the new source.
   */
  begin(current: ActorPose, durationSeconds: number, easing: ActorEasing): void {
    if (!(durationSeconds > 0)) {
      this.blending = false;
      return;
    }
    this.source.copyFrom(current);
    this.duration = durationSeconds;
    this.elapsed = 0;
    this.easing = easing;
    this.blending = true;
  }

  /**
   * Blends `destination` back toward the frozen source by the remaining
   * transition weight, writing the visible result into `destination`.
   */
  apply(destination: ActorPose, deltaSeconds: number): void {
    if (!this.blending) {
      return;
    }
    this.elapsed += deltaSeconds;
    if (this.elapsed >= this.duration) {
      this.blending = false;
      return;
    }
    const progress = ease(this.elapsed / this.duration, this.easing);
    // Pull the destination back toward the frozen source by the remaining
    // weight. Blending in this direction leaves the source untouched, so the
    // next frame still has the pose the transition actually started from.
    destination.blendToward(this.source, 1 - progress);
  }

  reset(): void {
    this.blending = false;
    this.elapsed = 0;
    this.duration = 0;
    this.source.resetToBind();
  }
}

function ease(progress: number, easing: ActorEasing): number {
  const clamped = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  switch (easing) {
    case "linear":
      return clamped;
    case "easeOut":
      return 1 - (1 - clamped) * (1 - clamped);
    case "smooth":
    default:
      return clamped * clamped * (3 - 2 * clamped);
  }
}
