import {
  WATER_LAKE_COVE_WAVE_SCALE,
  WATER_LAKE_SHORE_WAVE_FREQUENCY,
  WATER_LAKE_SHORE_WAVE_WEIGHT,
} from "./WaterMaterialTuning";

/**
 * The wave structure of the surface, as pure functions of position.
 *
 * Lakes and rivers build their slope from the same directional cosines; what
 * separates them is only which zone weights are handed in. Keeping the phases
 * out of the composition pass also lets the foam reuse the river's own crests
 * instead of inventing a second pattern that drifts away from the waves.
 */
export const WATER_WAVE_FRAGMENT_FUNCTIONS = `
/**
 * Lake slope across three zones. \`openLake\` fades the two broad wind waves
 * out toward a sheltered lobe; \`shore\` tightens and lifts the shortest wave
 * in the shallow margin. A cove ends up glassy, the middle rippled, and the
 * waterline broken into small wavelets — with no boundary between them.
 */
vec2 waterResolveLakeSlope(
  vec2 position,
  float scale,
  float time,
  float openLake,
  float shore
) {
  vec2 directionA = normalize(vec2(0.86, 0.51));
  vec2 directionB = normalize(vec2(-0.39, 0.92));
  vec2 directionC = normalize(vec2(0.21, -0.98));
  float openWave = mix(${WATER_LAKE_COVE_WAVE_SCALE}, 1.0, openLake);
  float phaseA = dot(position, directionA) * scale * 1.12 + time * 0.46;
  float phaseB = dot(position, directionB) * scale * 1.83 - time * 0.31;
  float phaseC =
    dot(position, directionC) *
      scale * mix(2.71, ${WATER_LAKE_SHORE_WAVE_FREQUENCY}, shore) +
    time * mix(0.22, 0.54, shore);
  return
    (directionA * cos(phaseA) * 0.52 + directionB * cos(phaseB) * 0.31) *
      openWave +
    directionC * cos(phaseC) *
      mix(0.17, ${WATER_LAKE_SHORE_WAVE_WEIGHT}, shore);
}

/**
 * The three river crest phases, in a flow-aligned frame.
 *
 * \`stretch\` squeezes the along-flow axis and tightens the across-flow one, so
 * a coherent run resolves into long elongated structures rather than a ripple
 * travelling downstream — the river's direction stays readable with foam off.
 * \`rapidBreak\` is a noise offset that fragments those crests once the reach
 * is fast enough to be broken water.
 */
vec3 waterResolveRiverPhases(
  vec2 position,
  vec2 flowDirection,
  vec2 flowPerpendicular,
  float scale,
  float frequencyScale,
  float stretch,
  float time,
  float flowSpeed,
  float rapidBreak
) {
  float acrossScale =
    scale * frequencyScale * mix(1.0, 1.28, saturate(stretch - 1.0));
  float alongScale = scale * frequencyScale / max(1.0, stretch);
  float along = dot(position, flowDirection);
  float across = dot(position, flowPerpendicular);
  return vec3(
    across * acrossScale * 2.85 + along * alongScale * 0.34 -
      time * flowSpeed * 2.2 + rapidBreak,
    across * acrossScale * 5.1 - along * alongScale * 0.18 -
      time * flowSpeed * 3.65 + rapidBreak * 1.7,
    along * alongScale * 1.35 + across * acrossScale * 0.72 -
      time * flowSpeed * 1.15
  );
}

vec2 waterResolveRiverSlope(
  vec3 phases,
  vec2 flowDirection,
  vec2 flowPerpendicular
) {
  return
    flowPerpendicular * (cos(phases.x) * 0.64 + cos(phases.y) * 0.27) +
    flowDirection * cos(phases.z) * 0.16;
}

/** Distance-faded micro chop, shared by every regime. */
vec2 waterResolveMicroSlope(
  vec2 position,
  float scale,
  float time,
  float detailWeight
) {
  vec2 directionA = normalize(vec2(0.94, -0.34));
  vec2 directionB = normalize(vec2(-0.62, -0.78));
  float phaseA = dot(position, directionA) * scale * 7.4 + time * 1.34;
  float phaseB = dot(position, directionB) * scale * 10.1 - time * 1.08;
  return
    (directionA * cos(phaseA) * 0.16 + directionB * cos(phaseB) * 0.11) *
    detailWeight;
}
`;
