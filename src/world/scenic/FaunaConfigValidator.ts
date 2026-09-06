import type { WorldConfig } from "../WorldConfig";

/**
 * Fauna collection is a synchronous ecology scan over the herd lattice.
 * A larger radius has quadratic cost and offers no useful gain for this PoC.
 */
export const MAX_FAUNA_STREAM_RADIUS = 512;

export function validateFaunaStreamingConfig(config: WorldConfig): void {
  if (config.faunaEnabled < 1) {
    return;
  }
  if (config.faunaStreamRadius > MAX_FAUNA_STREAM_RADIUS) {
    throw new Error(
      `faunaStreamRadius must not exceed ${MAX_FAUNA_STREAM_RADIUS} metres.`,
    );
  }
  if (config.faunaStreamRadius > config.worldSize * 0.5) {
    throw new Error("faunaStreamRadius must not exceed half of worldSize.");
  }
}
