import { disposeResources } from "../../render/ResourceDisposal";
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
  private bake?: WorldWindBake;
  private bakePublished = false;
  private bakeFailureReported = false;
  readonly uniforms = new WorldWindUniforms();

  constructor(renderer?: WebGPURenderer, private readonly focus?: () => Vector3) {
    if (renderer) {
      this.bake = new WorldWindBake(renderer);
    }
  }

  /** Advances the integrated phase once, publishes it, then updates the bake. */
  update(deltaSeconds: number): void {
    this.field.update(deltaSeconds);
    this.publish(deltaSeconds, false);
  }

  /** Requests a changed preset without advancing the phase. */
  refresh(): void {
    this.publish(0, true);
  }

  getField(): WorldWindField {
    return this.field;
  }

  dispose(): void {
    disposeResources([
      this.bake,
      { dispose: disposeWindGradientTexture },
    ]);
    this.bake = undefined;
  }

  private publish(deltaSeconds: number, forceBake: boolean): void {
    this.uniforms.syncFrom(this.field);
    const focus = this.focus?.();
    const bake = this.bake;
    if (!focus || !bake) {
      return;
    }

    if (forceBake) {
      bake.invalidate();
    }

    try {
      const baked = bake.update(deltaSeconds, focus, this.field);
      if (baked) {
        if (!this.bakePublished) {
          // The graph chooses baked versus analytic wind when a material is
          // constructed. Publish only a texture that has actually rendered.
          this.uniforms.bakedField = bake.texture;
          this.uniforms.bakedOriginXZ = bake.originUniform;
          this.uniforms.bakedWorldSize = WIND_BAKE_WORLD_SIZE;
          this.bakePublished = true;
        }
        this.bakeFailureReported = false;
      } else if (forceBake && !this.bakePublished) {
        // Initial material construction follows immediately after the first
        // refresh. If no valid bake exists at that boundary, keep every material
        // on the analytic path for the session instead of mixing graph types.
        this.disableUnpublishedBake();
      }
    } catch (error) {
      if (!this.bakePublished) {
        this.disableUnpublishedBake();
      }
      if (!this.bakeFailureReported) {
        console.warn(
          this.bakePublished
            ? "[Drusniel World] Wind bake unavailable; retaining the previous field."
            : "[Drusniel World] Wind bake unavailable; using the analytic field.",
          error,
        );
        this.bakeFailureReported = true;
      }
    }
  }

  private disableUnpublishedBake(): void {
    const bake = this.bake;
    if (!bake || this.bakePublished) {
      return;
    }
    this.bake = undefined;
    try {
      bake.dispose();
    } catch (error) {
      console.warn("[Drusniel World] Unpublished wind bake cleanup failed.", error);
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
