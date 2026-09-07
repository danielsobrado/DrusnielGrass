import type { Node } from "three/webgpu";
import { Fn, float, max, mix, smoothstep, vec2, vec4 } from "three/tsl";
import {
  WATER_BEND_END, WATER_BEND_START, WATER_LAKE_OPEN_EDGE, WATER_LAKE_SHORE_BAND_START,
  WATER_LAKE_SHORE_EDGE, WATER_RAPID_STREAK_BREAKUP, WATER_REGIME_RAPID_END,
  WATER_REGIME_RAPID_START, WATER_REGIME_RIFFLE_END, WATER_REGIME_RIFFLE_START,
  WATER_REGIME_RUN_END, WATER_REGIME_RUN_START, WATER_STREAK_MAX_STRETCH,
} from "./WaterMaterialTuning";

/**
 * Water-regime helpers, shared by the bed and the surface exactly as the GLSL
 * pair is. Every regime is a weight rather than a branch: pool, run, riffle and
 * rapid always sum to one and slide into one another, and the bank split
 * collapses to zero on a straight reach, so the whole continuum stays inside
 * one material with nothing for a seam to appear along.
 */

/**
 * Splits one energy scalar into pool/run/riffle/rapid weights. The bands are
 * carved from the fastest downwards, so each regime only claims what the one
 * above it left behind and the four always sum to one.
 */
export const waterResolveRegimeNode = Fn(([energy]: [Node<"float">]) => {
  const rapid = smoothstep(WATER_REGIME_RAPID_START, WATER_REGIME_RAPID_END, energy).toVar();
  const riffle = smoothstep(WATER_REGIME_RIFFLE_START, WATER_REGIME_RIFFLE_END, energy)
    .mul(rapid.oneMinus()).toVar();
  const run = smoothstep(WATER_REGIME_RUN_START, WATER_REGIME_RUN_END, energy)
    .mul(max(float(0), float(1).sub(rapid).sub(riffle))).toVar();
  return vec4(max(float(0), float(1).sub(rapid).sub(riffle).sub(run)), run, riffle, rapid);
});

/**
 * Outer and inner bank weights for a bend, as (outer, inner). The channel
 * deepens toward -sign(bend), so a vertex sits on the outer bank when its
 * lateral offset opposes the curvature. Both sides are gated on river coverage,
 * because a lake vertex still carries whichever lane happened to be nearest and
 * its lateral value saturates at the channel edge.
 */
export const waterResolveBankSidesNode = Fn(([bend, lateral, riverAmount]:
  [Node<"float">, Node<"float">, Node<"float">]) => {
  const strength = smoothstep(WATER_BEND_START, WATER_BEND_END, bend.abs()).mul(riverAmount);
  const side = bend.negate().mul(lateral);
  return vec2(side.clamp(0, 1), side.negate().clamp(0, 1)).mul(strength);
});

/**
 * How far the surface pattern stretches along the flow. A coherent run draws
 * long streaks; a rapid tears them back apart. This is what makes the direction
 * of a river readable with foam turned off entirely.
 */
export const waterResolveStreakStretchNode = Fn(([regime]: [Node<"vec4">]) =>
  mix(float(1), float(WATER_STREAK_MAX_STRETCH), regime.y.add(regime.z.mul(0.55)).clamp(0, 1))
    .mul(regime.w.mul(WATER_RAPID_STREAK_BREAKUP).oneMinus()));

/**
 * Open-water exposure inside a lake: 1 well inside the basin, 0 along the lobed
 * shoreline. A cove is where a shoreline lobe pushes inward, so it reads as
 * near-shore everywhere and stays glassy without a second field.
 */
export const waterResolveLakeExposureNode = Fn(([normalizedDistance]: [Node<"float">]) =>
  smoothstep(WATER_LAKE_OPEN_EDGE, WATER_LAKE_SHORE_EDGE, normalizedDistance).oneMinus());

/** The shallow margin where wind waves give way to small tight wavelets. */
export const waterResolveLakeShoreBandNode = Fn(([normalizedDistance]: [Node<"float">]) =>
  smoothstep(WATER_LAKE_SHORE_BAND_START, 1, normalizedDistance));
