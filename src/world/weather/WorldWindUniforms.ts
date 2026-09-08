import { uniform } from "three/tsl";
import type { Texture } from "three/webgpu";
import type { WindBakeOrigin } from "./WorldWindBake";
import type { WorldWindField } from "./WorldWindField";

/**
 * The one uniform table every wind-driven material reads.
 *
 * A single table rather than a copy per material: coherence across LODs is the
 * ticket's whole point, and two tables written at slightly different moments in
 * the frame is exactly how a near blade and a far card end up a frame apart —
 * which reads as the gust front tearing at the LOD boundary.
 */
export class WorldWindUniforms {
  readonly time = uniform(0);
  /**
   * The baked field, when one exists.
   *
   * A material built while this is set samples the bake; one built without it
   * evaluates the field directly. Both are the same field — see `WorldWindBake`
   * for what the bake keeps and what it leaves analytic.
   */
  bakedField?: Texture;
  bakedOriginXZ?: WindBakeOrigin;
  bakedWorldSize = 0;
  readonly directionDegrees = uniform(0);
  readonly intensity = uniform(1);
  readonly noiseScale = uniform(1);

  /**
   * Publishes the field's state for this frame.
   *
   * Called once, before anything draws. Every material samples the values that
   * were current when the frame began, so the whole world agrees on where the
   * wind is even though it is drawn in many passes.
   */
  syncFrom(field: WorldWindField): void {
    this.time.value = field.getPhaseSeconds();
    this.directionDegrees.value = field.getDirectionDegrees();
    this.intensity.value = field.getIntensity();
    this.noiseScale.value = field.getNoiseScale();
  }
}
