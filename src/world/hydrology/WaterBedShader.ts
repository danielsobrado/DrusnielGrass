export const WATER_BED_FRAGMENT_FUNCTIONS = `
vec3 waterSampleRiverBed(
  vec2 bedPosition,
  vec2 flowDirection,
  float time,
  float riverAmount,
  float bedRiffle,
  float bedPool,
  float bedBank,
  float bedChannelCore,
  vec3 bedZones,
  out float relief
) {
  // (inner bend, outer bend, still water) — the three places where a bed stops
  // looking like the reach it sits in.
  float bedInnerBank = bedZones.x;
  float bedOuterBank = bedZones.y;
  float bedStill = bedZones.z;
  vec4 bed = texture2D(uWaterBedNoise, bedPosition * uWaterBedScale);
  float pebble = bed.r;
  float shade = bed.a;
  // A point bar on the inside of a bend is where the coarse bedload piles up;
  // the scoured outer side and a still basin are where the fines settle out.
  float coarseBias =
    bedRiffle * 0.24 +
    bedChannelCore * 0.04 +
    bedInnerBank * 0.28 -
    bedPool * 0.16;
  pebble = saturate(pebble + coarseBias);
  float fineDeposition = saturate(
    bedPool * 0.20 +
    bedBank * 0.12 +
    bedOuterBank * 0.24 +
    bedStill * 0.55
  );
  pebble *= 1.0 - fineDeposition;

  vec3 stone = mix(uWaterPebbleDark, uWaterPebbleLight, bed.g);
  vec3 sand = mix(uWaterPebbleLight, uWaterSand, 0.62) * (0.9 + bed.g * 0.2);
  // Never a full commit to stone. At 1.0 every cobble reached its own albedo
  // and the bed became a cobble mosaic with sand only in the gaps, which is
  // what made the channel read as gravel rather than as a riverbed.
  vec3 color = mix(sand, stone, pebble * 0.82);
  // Baked cobble shading may only take light away. The old 1.30 ceiling let a
  // lit cobble top exceed its own albedo, which is where the snow read began.
  // The floor rose from 0.42 because that range put more contrast into the bed
  // than the water above it had, so the eye read the bed as the subject.
  color *= 0.58 + shade * 0.42;

  float sway = sin(time * 0.9 + bedPosition.x * 0.4 + bedPosition.y * 0.27);
  vec2 algaeDrift = flowDirection * sway * (0.06 + 0.22 * riverAmount);
  float algae = texture2D(
    uWaterBedNoise,
    (bedPosition + algaeDrift) * uWaterBedScale * 0.45
  ).b;
  algae = smoothstep(0.66, 0.93, algae) * uWaterAlgaeStrength;
  algae *= mix(1.0, 0.55, pebble);
  algae *= clamp(
    1.0 + bedBank * 0.24 + bedStill * 0.4 - bedRiffle * 0.28,
    0.58,
    1.42
  );
  color = mix(color, uWaterAlgae * (0.68 + shade * 0.5), algae);

  relief = pebble * (1.0 - algae * 0.5);
  return color;
}
`;
