import { WorldWindField } from "./WorldWindField";
import { WorldWindUniforms } from "./WorldWindUniforms";
import { disposeWindGradientTexture } from "./WorldWindLattice";
import { WorldWindBake, WIND_BAKE_WORLD_SIZE } from "./WorldWindBake";
import type { Vector3, WebGPURenderer } from "three/webgpu";
import type { WorldExperience } from "../../app/WorldExperience";
import { WIND_MODEL_IDS, resolveCatalogId } from "../experience/WorldExperienceCatalog";

/**
 * The world's wind: one field, advanced once, published once.
 *
 * A separate owner from the environment controller that drives it, because the
 * things that read wind are not the things that read weather — grass, and later
 * trees and leaves, want the uniforms and the CPU sampler, not the sun or the
 * cloud shadow map. Keeping it here also means the environment controller does
 * not grow a second responsibility just to hold a clock.
 *
 * The order inside `update` is the whole contract: advance, then publish, both
 * before anything draws. Every material that renders this frame then reads one
 * wind, which is what lets a gust front cross the LOD boundaries without
 * tearing at the seam.
 */
export class WorldWindSystem {
  private readonly field = new WorldWindField();
  private readonly bake?: WorldWindBake;
  readonly uniforms = new WorldWindUniforms();

  /**
   * The bake is optional so the field can still be evaluated directly.
   *
   * Without a renderer there is nothing to bake into, which is the case in the
   * node verifiers; materials then evaluate the field per vertex, which is
   * correct and slow rather than wrong.
   */
  constructor(renderer?: WebGPURenderer, private readonly focus?: () => Vector3) {
    if (renderer) {
      this.bake = new WorldWindBake(renderer);
      this.uniforms.bakedField = this.bake.texture;
      this.uniforms.bakedOriginXZ = this.bake.originUniform;
      this.uniforms.bakedWorldSize = WIND_BAKE_WORLD_SIZE;
    }
  }

  /**
   * Advances the field and re-bakes it around the current focus.
   *
   * The focus arrives as a getter rather than an argument so this satisfies the
   * optional-owner contract: the experience layer drives every optional system
   * with a delta and nothing else, and a system that needs more of the world
   * closes over it rather than widening that contract for everyone.
   */
  update(deltaSeconds: number): void {
    this.field.update(deltaSeconds);
    this.uniforms.syncFrom(this.field);
    const focus = this.focus?.();
    if (focus) {
      this.bake?.update(deltaSeconds, focus, this.field);
    }
  }

  /** For anything that needs to ask where the wind is on the CPU. */
  getField(): WorldWindField {
    return this.field;
  }

  /**
   * Releases the shared gradient lattice texture.
   *
   * The lattice itself is a module-level cache shared by every material that
   * samples it, so it is released here rather than by any one of them.
   */
  dispose(): void {
    this.bake?.dispose();
    disposeWindGradientTexture();
  }
}

/**
 * Attaches the shared wind as an optional system, or does nothing.
 *
 * Lives here rather than in the composition root so the root does not grow a
 * construction detail, and so the rule that makes this optional — no owner, no
 * update, no render target — is stated next to the thing it governs.
 */
export function attachSharedWind(experience: WorldExperience | undefined,
  renderer: WebGPURenderer, params: URLSearchParams,
  focus: () => Vector3): WorldWindSystem | undefined {
  if (resolveCatalogId(WIND_MODEL_IDS, params.get("windModel")) !== "cinematic") {
    return undefined;
  }
  let wind: WorldWindSystem | undefined;
  experience?.attach("weather", () => (wind = new WorldWindSystem(renderer, focus)));
  return wind;
}
