export const WATER_FLOW_FRAGMENT_FUNCTIONS = `
/**
 * Two detuned samples of the shared flow noise, taken in a flow-aligned frame.
 *
 * \`stretch\` squeezes the along-flow axis and tightens the across-flow one, so
 * fast coherent water resolves into long streaks rather than a scrolling
 * ripple. The travel term is expressed in the stretched axis's own units, which
 * keeps the world-space advection speed fixed as the domain changes shape.
 */
vec4 waterSampleAdvectedNoise(
  vec2 position,
  vec2 flowDirection,
  float time,
  float scale,
  float speed,
  float stretch
) {
  vec2 perpendicular = vec2(-flowDirection.y, flowDirection.x);
  vec2 flowSpace = vec2(
    dot(position, flowDirection),
    dot(position, perpendicular)
  );
  float alongScale = scale * 0.58 / max(1.0, stretch);
  float acrossScale = scale * 1.42 * mix(1.0, 1.28, saturate(stretch - 1.0));
  vec2 warpUv = position * scale * 0.31 + vec2(time * 0.007, -time * 0.005);
  vec2 warp = texture2D(uWaterFlowNoise, warpUv).rg * 2.0 - 1.0;
  float travel = time * speed * alongScale * 0.31;
  vec2 primaryUv =
    flowSpace * vec2(alongScale, acrossScale) +
    warp * 0.075 +
    vec2(-travel, 0.0);
  vec2 secondaryUv =
    flowSpace.yx * vec2(acrossScale * 0.78, alongScale * 1.26) +
    warp.yx * 0.052 +
    vec2(0.37, -travel * 0.61);
  vec4 primary = texture2D(uWaterFlowNoise, primaryUv);
  vec4 secondary = texture2D(uWaterFlowNoise, secondaryUv);
  return vec4(
    mix(primary.r, secondary.r, 0.34),
    mix(primary.g, secondary.g, 0.46),
    mix(primary.b, secondary.b, 0.38),
    max(primary.a, secondary.a * 0.92)
  );
}

float waterResolveStoneEdge(float obstacle) {
  return
    smoothstep(0.04, 0.42, obstacle) *
    (1.0 - smoothstep(0.72, 0.98, obstacle));
}
`;
