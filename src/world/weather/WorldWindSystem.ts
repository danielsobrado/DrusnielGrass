import { WorldWindField } from "./WorldWindField";
import { WorldWindUniforms } from "./WorldWindUniforms";
import { WorldWindBake, WIND_BAKE_WORLD_SIZE } from "./WorldWindBake";
import type { Vector3, WebGPURenderer } from "three/webgpu";

/** One shared wind field, clock and optional GPU bake for the whole world. */
export class WorldWindSystem {
  private readonly field = new WorldWindField();
  private readonly bake?: WorldWindBake;
  private bakeFailureReported = false;
  readonly uniforms = new WorldWindUniforms();

  constructor(renderer?: WebGPURenderer, private readonly focus?: () => Vector3) {
    if (renderer) {
      this.bake = new WorldWindBake(renderer);
      this.uniforms.bakedField = this.bake.texture;
      this.uniforms.bakedOriginXZ = this.bake.originUniform;
      this.uniforms.bakedWorldSize = WIND_BAKE_WORLD_SIZE;
    }
  }

  /** Advances the integrated phase once, publishes it, then updates the bake. */
  update(deltaSeconds: number): void {
    this.field.update(deltaSeconds);
    this.publish(deltaSeconds, false);
  }

  /**
   * Publishes a changed preset immediately without advancing the phase.
   * Preset cuts are rare and atomic; ordinary frames retain the reduced bake cadence.
   */
  refresh(): void {
    this.publish(0, true);
  }

  getField(): WorldWindField {
    return this.field;
  }

  /**
   * Releases what this system owns, which is the bake and nothing else.
   *
   * The shared gradient lattice is deliberately not released here. It is a
   * module-level immutable texture that every already-compiled cinematic grass
   * material samples, and this is an optional owner: `WorldExperience` releases
   * it on a single failed frame while the grass keeps drawing. Freeing the
   * lattice from here would leave those materials reading a released texture —
   * the same hazard `publish` already refuses for the bake. The world releases
   * the lattice at teardown, after the materials that read it are gone.
   */
  dispose(): void {
    this.bake?.dispose();
  }

  private publish(deltaSeconds: number, forceBake: boolean): void {
    this.uniforms.syncFrom(this.field);
    const focus = this.focus?.();
    if (!focus || !this.bake) {
      return;
    }

    if (forceBake) {
      this.bake.invalidate();
      this.bake.update(deltaSeconds, focus, this.field);
      this.bakeFailureReported = false;
      return;
    }

    try {
      this.bake.update(deltaSeconds, focus, this.field);
    } catch (error) {
      // Keep the last valid texture alive. Disposing this optional owner would
      // leave already-compiled cinematic grass sampling a released texture.
      if (!this.bakeFailureReported) {
        console.warn(
          "[Drusniel World] Wind bake unavailable; retaining the previous field.",
          error,
        );
        this.bakeFailureReported = true;
      }
    }
  }
}
