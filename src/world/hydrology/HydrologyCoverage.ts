/** First hydrology coverage that the water topology and shader render. */
export const WATER_VISIBLE_COVERAGE_THRESHOLD = 0.012;

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

/**
 * Vegetation may feather only through coverage that is still visually dry.
 * Once the transparent water surface is rendered, grass must already be gone
 * or the surface tints it into a camera-facing cyan shoreline band. The caller
 * supplies the water-grid clearance as a share of the humidity radius so this
 * also covers the interpolation footprint between coarse shoreline vertices.
 */
export function resolveGrassWaterMask(
  waterCoverage: number,
  waterProximity: number,
  clearanceToHumidityRadius: number,
): number {
  const coverageMask =
    1 - smoothstep(waterCoverage, 0, WATER_VISIBLE_COVERAGE_THRESHOLD);
  const proximityAtClearance =
    1 - smoothstep(clearanceToHumidityRadius, 0, 1);
  const proximityAtFeather =
    1 - smoothstep(clearanceToHumidityRadius * 2, 0, 1);
  const shorelineMask =
    1 - smoothstep(waterProximity, proximityAtFeather, proximityAtClearance);
  return Math.min(coverageMask, shorelineMask);
}
