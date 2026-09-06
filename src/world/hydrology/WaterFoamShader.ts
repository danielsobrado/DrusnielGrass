import {
  WATER_LAKE_SHORE_FOAM_EXPOSURE,
  WATER_RAPID_FOAM_CUTOFF,
  WATER_RIFFLE_FOAM_CUTOFF,
  WATER_SHORE_FOAM_ENERGY_FLOOR,
} from "./WaterMaterialTuning";

/**
 * Foam as hydrological evidence.
 *
 * The geometry of a shoreline says only where water meets land; it says
 * nothing about whether anything is breaking there. Both helpers below take
 * the energy of the reach as an input, so a slack pool edge and a sheltered
 * cove stay dark while a rapid or a cut bank whitens — rather than every
 * waterline in the world being outlined the same way.
 */
export const WATER_FOAM_FRAGMENT_FUNCTIONS = `
/**
 * The shoreline band, weighted by what is happening at that waterline. A lake
 * margin has no directional energy to read from, so it rides the lake wave
 * strength and leaves rocky shores to the separate stone term.
 */
float waterResolveShoreFoam(
  float coverageRaw,
  float depth,
  float riverAmount,
  float lakeAmount,
  float energy,
  float outerBank,
  float lakeWaveStrength
) {
  float band =
    (1.0 - smoothstep(0.16, 0.66, coverageRaw)) *
    smoothstep(0.025, 0.11, coverageRaw) *
    (1.0 - smoothstep(0.28, 0.9, depth));
  float shoreEnergy = saturate(
    riverAmount * (0.3 + energy * 0.85 + outerBank * 0.45) +
    lakeAmount * lakeWaveStrength * ${WATER_LAKE_SHORE_FOAM_EXPOSURE}
  );
  return band * mix(${WATER_SHORE_FOAM_ENERGY_FLOOR}, 1.0, shoreEnergy);
}

/**
 * Whitewater built from the river's own crest phases, so the foam sits on the
 * waves rather than beside them. A rapid connects because its cutoff drops far
 * enough for neighbouring crests to merge, not because the term is turned up.
 */
float waterResolveRiffleFoam(
  vec3 phases,
  vec4 regime,
  float turbulence,
  float riverAmount,
  float channelCore,
  float detailWeight,
  float shallowEnergy,
  float innerBank
) {
  float energy =
    riverAmount * channelCore * detailWeight * shallowEnergy *
    saturate(regime.z + regime.w * 1.35 + innerBank * 0.25);
  float pattern = 0.5 + 0.5 * sin(
    phases.x * 1.43 + sin(phases.y) * 0.86 + (turbulence - 0.5) * 2.2
  );
  float cutoff = mix(
    ${WATER_RIFFLE_FOAM_CUTOFF},
    ${WATER_RAPID_FOAM_CUTOFF},
    regime.w
  );
  // A wide band on purpose. At 0.15 the riffle crests came out as hard-edged
  // white slashes painted on the river rather than as water breaking over it.
  return smoothstep(cutoff, cutoff + 0.3, pattern) * energy;
}
`;
