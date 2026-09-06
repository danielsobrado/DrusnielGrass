import {
  WATER_BEND_END,
  WATER_BEND_START,
  WATER_LAKE_OPEN_EDGE,
  WATER_LAKE_SHORE_BAND_START,
  WATER_LAKE_SHORE_EDGE,
  WATER_RAPID_STREAK_BREAKUP,
  WATER_REGIME_RAPID_END,
  WATER_REGIME_RAPID_START,
  WATER_REGIME_RIFFLE_END,
  WATER_REGIME_RIFFLE_START,
  WATER_REGIME_RUN_END,
  WATER_REGIME_RUN_START,
  WATER_STREAK_MAX_STRETCH,
} from "./WaterMaterialTuning";

/** GLSL has no integer-to-float promotion in literals, so 1 must ship as `1.0`. */
function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

/**
 * Water-regime helpers shared by the surface pass.
 *
 * Every regime here is a weight rather than a branch. Pool, run, riffle and
 * rapid always sum to one and slide into one another, and the bank split
 * collapses to zero on a straight reach, so the whole continuum stays inside
 * one material with nothing for a seam to appear along.
 */
export const WATER_REGIME_FRAGMENT_FUNCTIONS = `
/**
 * Splits one energy scalar into pool/run/riffle/rapid weights. The bands are
 * carved from the fastest downwards, so each regime only claims what the one
 * above it left behind and the four always sum to one.
 */
vec4 waterResolveRegime(float energy) {
  float rapid = smoothstep(
    ${glsl(WATER_REGIME_RAPID_START)},
    ${glsl(WATER_REGIME_RAPID_END)},
    energy
  );
  float riffle = smoothstep(
    ${glsl(WATER_REGIME_RIFFLE_START)},
    ${glsl(WATER_REGIME_RIFFLE_END)},
    energy
  ) * (1.0 - rapid);
  float run = smoothstep(
    ${glsl(WATER_REGIME_RUN_START)},
    ${glsl(WATER_REGIME_RUN_END)},
    energy
  ) * max(0.0, 1.0 - rapid - riffle);
  return vec4(max(0.0, 1.0 - rapid - riffle - run), run, riffle, rapid);
}

/**
 * Outer and inner bank weights for a bend, as (outer, inner). The channel
 * deepens toward -sign(bend), so a vertex sits on the outer bank when its
 * lateral offset opposes the curvature. Both sides are gated on river
 * coverage, because a lake vertex still carries whichever lane happened to be
 * nearest and its lateral value saturates at the channel edge.
 */
vec2 waterResolveBankSides(float bend, float lateral, float riverAmount) {
  float strength =
    smoothstep(${glsl(WATER_BEND_START)}, ${glsl(WATER_BEND_END)}, abs(bend)) *
    riverAmount;
  float side = -bend * lateral;
  return vec2(saturate(side), saturate(-side)) * strength;
}

/**
 * How far the surface pattern stretches along the flow. A coherent run draws
 * long streaks; a rapid tears them back apart. This is what makes the
 * direction of a river readable with foam turned off entirely.
 */
float waterResolveStreakStretch(vec4 regime) {
  return mix(1.0, ${glsl(WATER_STREAK_MAX_STRETCH)}, saturate(regime.y + regime.z * 0.55)) *
    (1.0 - regime.w * ${glsl(WATER_RAPID_STREAK_BREAKUP)});
}

/**
 * Open-water exposure inside a lake: 1 well inside the basin, 0 along the
 * lobed shoreline. A cove is where a shoreline lobe pushes inward, so it
 * reads as near-shore everywhere and stays glassy without a second field.
 */
float waterResolveLakeExposure(float normalizedDistance) {
  return 1.0 - smoothstep(
    ${glsl(WATER_LAKE_OPEN_EDGE)},
    ${glsl(WATER_LAKE_SHORE_EDGE)},
    normalizedDistance
  );
}

/** The shallow margin where wind waves give way to small tight wavelets. */
float waterResolveLakeShoreBand(float normalizedDistance) {
  return smoothstep(
    ${glsl(WATER_LAKE_SHORE_BAND_START)},
    1.0,
    normalizedDistance
  );
}
`;
