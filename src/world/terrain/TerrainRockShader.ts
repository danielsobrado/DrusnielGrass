/**
 * Cliff rock: lithology, joints, cavities and relief.
 *
 * Split out of the terrain surface shader, which was already carrying ecology,
 * paths, shoreline, wetness and normals. Rock is decided by slope alone and has
 * its own internal logic, so it belongs in its own unit.
 *
 * Two things separate rock that reads as rock from rock that reads as marble.
 *
 * The first is that variation must follow the geology rather than a continuous
 * noise field. A wall is built of beds, each with its own tone, meeting at sharp
 * partings; a smooth noise laid over the top gives cloudy swirls. So the bed
 * tone dominates, the continuous term is demoted to surface character, and the
 * tones stay close together: wide endpoints exaggerate every wisp of noise into
 * a marble vein.
 *
 * The second is that the painted structure has to move the surface normal.
 * Seams and partings drawn into the albedo alone read exactly as what they are,
 * flat geometry with dark lines on it, so terrainResolveRock returns a relief
 * height alongside the colour and the caller folds it into the normal it
 * already perturbs.
 */
const PRIMARY_JOINT_UV_FREQUENCY = 1.49;
const SECONDARY_JOINT_UV_FREQUENCY = 6.49;

export const TERRAIN_ROCK_FUNCTIONS = `
uniform vec3 uTerrainRockBase;
uniform vec3 uTerrainRockWarm;
uniform float uTerrainRockReliefStrength;

/** Discrete beds rather than a sine wash, warped so they pinch and thicken. */
vec2 terrainResolveBed(float height, float warp) {
  float coordinate = height * 0.135 + warp * 0.42;
  return vec2(floor(coordinate), fract(coordinate));
}

/**
 * Joints in two scales. wallUv is already world-scaled by the terrain shader,
 * so these frequencies are in that UV space rather than raw world frequency.
 */
float terrainResolveJoint(float along, float seed, float frequency, float sharpness) {
  float ridge = 1.0 - abs(fract(along * frequency + seed * 3.0) * 2.0 - 1.0);
  return pow(clamp(ridge, 0.0, 1.0), sharpness);
}

/**
 * Rock colour and relief. wallUv is projected along the face's own horizontal
 * tangent so it does not stretch on a near-vertical surface; relief comes back
 * in the same units as the terrain's micro relief.
 */
vec3 terrainResolveRock(
  vec2 wallUv,
  float worldHeight,
  float bedWarp,
  vec4 wallNoise,
  vec4 hashNoise,
  float wetness,
  out float relief
) {
  vec2 bed = terrainResolveBed(worldHeight, bedWarp);
  float bedTone = hashNoise.r;
  float parting =
    smoothstep(0.0, 0.05, bed.y) * (1.0 - smoothstep(0.93, 1.0, bed.y));

  float primaryJoint = terrainResolveJoint(
    wallUv.x,
    hashNoise.g,
    ${PRIMARY_JOINT_UV_FREQUENCY.toFixed(2)},
    12.0
  );
  float secondaryJoint = terrainResolveJoint(
    wallUv.x,
    hashNoise.b,
    ${SECONDARY_JOINT_UV_FREQUENCY.toFixed(2)},
    7.0
  ) * 0.45;
  float joint = max(primaryJoint, secondaryJoint);

  // Lithology leads; reversing these weights is what produced the marbled wall.
  float lithology = bedTone * 0.7 + wallNoise.b * 0.2 + wallNoise.r * 0.1;

  vec3 rock = mix(uTerrainRockBase, uTerrainRockWarm, bedTone);
  rock *= mix(0.74, 1.16, lithology);
  rock *= 1.0 + primaryJoint * 0.08;

  // Cracks and bedding planes hold shadow and grime. Broad, or it bakes in dirt.
  float cavity = max(joint * 0.8, (1.0 - parting) * 0.5);
  rock *= 1.0 - cavity * 0.42;

  // Wetness as streaks: water runs down a cliff in channels and pools in its
  // cracks, so darkening the whole humidity halo together still reads as a tint.
  float streak = smoothstep(0.45, 0.82, wallNoise.g);
  float wet = wetness * mix(0.3, 1.0, streak) * mix(0.75, 1.0, 1.0 - cavity);
  rock *= 1.0 - wet * 0.3;

  relief =
    ((wallNoise.b - 0.5) * 0.55 - joint * 0.75 - (1.0 - parting) * 0.45) *
    uTerrainRockReliefStrength;
  return rock;
}
`;
