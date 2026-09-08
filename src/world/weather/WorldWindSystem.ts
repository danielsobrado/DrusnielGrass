import { WorldWindField } from "./WorldWindField";
import { WorldWindUniforms } from "./WorldWindUniforms";
import { disposeWindGradientTexture } from "./WorldWindLattice";
import { WorldWindBake, WIND_BAKE_WORLD_SIZE } from "./WorldWindBake";
import type { Vector3, WebGPURenderer } from "three/webgpu";
import type { WorldExperience } from "../../app/WorldExperience";
import {
  DEFAULT_WIND_MODEL, WIND_MODEL_IDS, resolveCatalogId,
} from "../experience/WorldExperienceCatalog";

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

  dispose(): void {
    this.bake?.dispose();
    disposeWindGradientTexture();
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
      this.bakeFailureReported = false;
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

/** Legacy comparison attachment retained for `windModel=legacy|cinematic` harnesses. */
export function attachSharedWind(experience: WorldExperience,
  renderer: WebGPURenderer, params: URLSearchParams,
  focus: () => Vector3): WorldWindSystem | undefined {
  const model = resolveCatalogId(WIND_MODEL_IDS, params.get("windModel"))
    ?? DEFAULT_WIND_MODEL;
  if (model !== "cinematic") {
    return undefined;
  }
  let wind: WorldWindSystem | undefined;
  experience.attach("weather", () => (wind = new WorldWindSystem(renderer, focus)));
  return wind;
}
