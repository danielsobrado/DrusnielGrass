import { WorldWindField } from "./WorldWindField";
import { WorldWindUniforms } from "./WorldWindUniforms";
import { disposeWindGradientTexture } from "./WorldWindLattice";

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
  readonly uniforms = new WorldWindUniforms();

  update(deltaSeconds: number): void {
    this.field.update(deltaSeconds);
    this.uniforms.syncFrom(this.field);
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
    disposeWindGradientTexture();
  }
}
