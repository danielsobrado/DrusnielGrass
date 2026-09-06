import {
  DRYNESS_PERIOD,
  DRYNESS_SEED,
  GRASS_MACRO_DRYNESS_STRENGTH,
  VIGOR_PERIOD,
  VIGOR_SEED,
} from "../../grass/GrassFieldVariation";
import {
  GRASS_LATTICE_NOISE_GLSL,
  GRASS_LOD_BAND_GLSL,
} from "../../grass/GrassLodBanding";
import {
  TERRAIN_HUMIDITY_DRYNESS_WEIGHT,
  TERRAIN_HUMIDITY_VIGOR_WEIGHT,
} from "./TerrainSurfaceTuning";

/**
 * The macro ecology fields, evaluated per fragment on the ground.
 *
 * Dryness (27 m) and vigour (19 m) are what give the meadow its large-scale
 * structure -- the dry crowns, the vigorous hollows, the bands that let a
 * viewer read a hillside as terrain rather than as texture. Both are sampled
 * per *vertex* today, through `TerrainSurfaceField`.
 *
 * That works near the camera and fails at range, for a reason that is arithmetic
 * rather than art. `TerrainStreamer` picks a chunk's resolution from its
 * Chebyshev distance in chunks: 25, then 13, then 7 across a 64 m chunk, which
 * is a vertex every 2.67 m, 5.33 m, and 10.67 m. The 19 m vigour field needs a
 * sample at least every 9.5 m to survive Nyquist, so at the outermost ring it
 * aliases away entirely -- and it does so at a square boundary, which is the
 * other half of the banding the plan set out to remove.
 *
 * Evaluating the same functions per fragment makes ground structure independent
 * of terrain resolution. That is what stops the distant meadow collapsing into
 * noise, and it is why the fix for "the far field looks flat" lives in the
 * terrain shader rather than in the vegetation.
 *
 * Two paths exist because the cost is not the same everywhere. The GLSL mirror
 * below is bit-exact against the CPU functions and costs sixteen integer hashes
 * per fragment; integrated GPUs commonly run integer multiply at a quarter rate,
 * so the compact profile reads a baked texture instead
 * ({@link ./TerrainMacroFieldTexture}). Both are wired through the same
 * `terrainSampleMacroField` signature so the rest of the shader cannot tell
 * which one it is using.
 */

/** Injected once per shader; carries the lattice noise and the band wander. */
export const TERRAIN_MACRO_FIELD_FUNCTIONS = `
${GRASS_LATTICE_NOISE_GLSL}
${GRASS_LOD_BAND_GLSL}
#ifdef TERRAIN_MACRO_FIELD_TEXTURE
uniform sampler2D uTerrainMacroField;
uniform vec2 uTerrainMacroFieldExtent;
#endif

/**
 * Returns (dryness, vigour) at a world position.
 *
 * The texture path resamples a 4 m grid, so it differs from the exact field by
 * about 1.5% of range at the 19 m period. Blades still use the exact CPU
 * function; the residual is a sub-percent ground/blade disagreement no capture
 * resolves, and it buys back the integer-multiply cost on hardware that cannot
 * afford it.
 */
vec2 terrainSampleMacroField(vec2 world) {
#ifdef TERRAIN_MACRO_FIELD_TEXTURE
  vec2 macroUv = world / uTerrainMacroFieldExtent + 0.5;
  vec4 macroSample = texture(uTerrainMacroField, macroUv);
  return macroSample.rg;
#else
  return vec2(
    grassPatchNoise(world, ${DRYNESS_PERIOD.toFixed(1)}, ${DRYNESS_SEED}u),
    grassPatchNoise(world, ${VIGOR_PERIOD.toFixed(1)}, ${VIGOR_SEED}u)
  );
#endif
}
`;

/**
 * Replaces the vertex-interpolated macro terms with the per-fragment ones.
 *
 * Vigour is a straight substitution: `terrainEcology.y` *is*
 * `sampleGrassMacroVigor(x, z)` verbatim, so the varying has no other job.
 *
 * Dryness is not, because the attribute carries habitat dryness with the macro
 * term already folded in by `sampleGrassHabitat`. Subtracting the vertex value
 * the shader was given and adding the fragment evaluation of the same function
 * removes the double count exactly, which is the only reason
 * `vTerrainMacroDryness` is carried at all.
 *
 * Humidity is derived from both values by `TerrainSurfaceField`. Correct it by
 * the same deltas so soil colour does not keep the aliased vertex-level macro
 * pattern after dryness and vigour have moved to fragment resolution.
 */
export const TERRAIN_MACRO_FIELD_APPLY = `
vec2 terrainMacroField = terrainSampleMacroField(vTerrainWorldPosition.xz);
float terrainVertexVigor = terrainVigor;
float terrainVertexDryness = terrainDryness;
terrainVigor = terrainMacroField.y;
terrainDryness = saturate(
  terrainDryness +
    (terrainMacroField.x - vTerrainMacroDryness) *
      ${GRASS_MACRO_DRYNESS_STRENGTH.toFixed(4)}
);
terrainHumidity = saturate(
  terrainHumidity +
    (terrainVertexDryness - terrainDryness) *
      ${TERRAIN_HUMIDITY_DRYNESS_WEIGHT.toFixed(4)} +
    (terrainVigor - terrainVertexVigor) *
      ${TERRAIN_HUMIDITY_VIGOR_WEIGHT.toFixed(4)}
);
`;
