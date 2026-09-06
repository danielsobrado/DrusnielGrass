// Mid geometry already retains every source blade. Keep far cards out of the
// mid band and crossfade them only at the mid-to-far boundary; this removes a
// full-screen layer of redundant overdraw without reducing blade density.
export const GRASS_MID_IMPOSTOR_UNDERFILL = 0;
/**
 * The mid layer's distance thinning. `floor` is the fraction of blades still
 * submitted at `end` metres; the survivors are widened by `1/sqrt(floor)` and
 * pay the invented coverage back in colour, so the field's average brightness —
 * which is what `verify-lod-color-parity` bounds — does not move.
 *
 * Moved out from 28→62. Those edges were the grass preset's own near and mid
 * distances, so the thinning of the blade grain happened across exactly the
 * radii where the ground's colour, its mottling, and the near/mid handoff were
 * all also changing. Six soft fades sharing two edges read as one hard ring;
 * this is one of the six, and it now shares an edge with none of them.
 *
 * Lives here rather than beside the material that reads it because the world
 * config validator has to check the ground's canopy merge against it, and
 * pulling a THREE material into config validation to learn two numbers would be
 * the wrong dependency.
 */
export const GRASS_MID_DENSITY_FALLOFF: Readonly<{
  start: number;
  end: number;
  floor: number;
}> = Object.freeze({
  start: 36,
  end: 74,
  floor: 0.18,
});

export const GRASS_IMPOSTOR_FOOTPRINT_SCALE = 1.12;
export const GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE = 1.1;
export const GRASS_IMPOSTOR_MAX_VERTICAL_SCALE = 1.2;
/**
 * How far a card's top edge shears along the wind, as a fraction of the wind
 * strength. Cards bend from root to tip like the real blades they stand in for
 * rather than sliding sideways as a whole, which is what keeps the 44-64 m
 * crossfade from showing two representations moving differently.
 *
 * The reserved displacement below must cover the worst case this can produce:
 * `windStrength x maxArtWindScale x shearFactor x maxVerticalScale`, which at
 * the configured 0.11 and the windiest preset's 1.65 is 0.0763.
 * `verify-lod-continuity` recomputes that product from these constants, so the
 * two cannot drift apart.
 */
export const GRASS_IMPOSTOR_WIND_SHEAR_FACTOR = 0.35;
/**
 * How far a gust crest lifts blade colour towards the tip colour. Real blades
 * and impostor cards must apply it with the same value and the same formula, or
 * a crest brightens one representation and not the other and the 44-64 m
 * crossfade pulses against itself. Shared here so neither can drift.
 */
export const GRASS_GUST_TIP_BOOST = 0.07;
export const GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT = 0.08;
export const GRASS_IMPOSTOR_BOUNDS_SAFETY_MARGIN = 0.15;
