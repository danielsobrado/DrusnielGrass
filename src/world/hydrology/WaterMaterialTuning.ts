import * as THREE from "three";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
export { WATER_VISIBLE_COVERAGE_THRESHOLD } from "./HydrologyCoverage";

export const WATER_MATERIAL_CACHE_KEY = "world-water-hydrology-v11-optics";
export const WATER_BED_MATERIAL_CACHE_KEY = "world-water-bed-v5";
export const WATER_FLOW_NOISE_SEED_SALT = 0x6c8e9cf5;
export const WATER_BED_NOISE_SEED_SALT = 0x3b1f7a2d;
export const WATER_CASCADE_CACHE_KEY = "world-water-cascade-v2-sill";
export const WATER_CASCADE_NOISE_SEED_SALT = 0x51c3ab77;
export const WATER_SHALLOW_COLOR = new THREE.Color("#55949d");
export const WATER_DEEP_COLOR = new THREE.Color("#244f63");
export const WATER_REFLECTION_COLOR = new THREE.Color("#a8cad5");
export const WATER_FOAM_COLOR = new THREE.Color("#d8e7df");

/**
 * The curtain's palette is derived from the river's, never declared beside it.
 *
 * A waterfall is the same water as the reach that feeds it. It is brighter
 * because it is thin and full of entrained air, scattering from every side
 * instead of absorbing over a depth — not because it is a different colour.
 * Giving it its own turquoise, as this file used to, is most of why the fall and
 * the river read as two adjacent effects rather than one system: the eye can
 * find the exact line where one palette stops and the other starts.
 *
 * So clear falling water is the shallow river tone carrying more sky, its
 * whitewater is the river's own foam, and the mist above the plunge is that
 * foam thinned toward colourless. Cloned because material controllers own their
 * uniform values and must not be able to mutate the shared basis.
 */
export const WATER_CASCADE_WATER_COLOR = WATER_SHALLOW_COLOR.clone().lerp(
  WATER_REFLECTION_COLOR,
  0.3,
);
export const WATER_CASCADE_FOAM_COLOR = WATER_FOAM_COLOR.clone();
export const WATER_CASCADE_MIST_COLOR = WATER_FOAM_COLOR.clone().lerp(
  new THREE.Color("#ffffff"),
  0.45,
);
export const WATER_SPECULAR_COLOR = new THREE.Color("#e4f4f5");
/**
 * Bed cobbles are permanently submerged, so they carry wet-rock reflectance —
 * roughly six tenths of the same stone dry. Dry values here read as snow from
 * any distance, because the sheet above is nearly transparent where a river is
 * shallow and the bed is what the eye actually sees.
 */
export const WATER_PEBBLE_DARK_COLOR = new THREE.Color("#38332a");
export const WATER_PEBBLE_LIGHT_COLOR = new THREE.Color("#7b7466");
export const WATER_SAND_COLOR = new THREE.Color("#433d31");
export const WATER_ALGAE_COLOR = new THREE.Color("#33531f");
/** In-scatter hue for the Beer-Lambert optical-depth model. */
export const WATER_ABSORPTION_COLOR = new THREE.Color("#6c9c8e");
/**
 * Sunlight crosses the water column twice before the bed is seen — down to the
 * cobbles and back to the eye — so the bed is attenuated over twice its depth
 * by the same absorption the surface already uses. This is what separates a
 * dark pool from a bright riffle without a second depth model.
 */
export const WATER_BED_PATH_LENGTH_SCALE = 2;
/**
 * Held below 1 because the surface sheet already applies its own transmittance
 * on top; the full physical extinction on both layers closes shallow water
 * completely.
 */
export const WATER_BED_EXTINCTION_SCALE = 0.62;
export const WATER_IOR = 1.333;
export const WATER_F0 = ((WATER_IOR - 1) / (WATER_IOR + 1)) ** 2;
export const WATER_SUN_DIRECTION = new THREE.Vector3(
  ...WORLD_SUN_DIRECTION,
).normalize();
/** Compact profiles keep identity but drop micro glint/caustic/wake energy. */
export const WATER_COMPACT_DETAIL_SCALE = 0.55;
export const WATER_RIVER_POOL_FREQUENCY_SCALE = 0.9;
export const WATER_RIVER_RIFFLE_FREQUENCY_SCALE = 1.14;
export const WATER_RIVER_SHALLOW_ENERGY_WEIGHT = 0.86;
export const WATER_RIVER_SLOPE_ENERGY_WEIGHT = 0.14;
export const WATER_RIVER_BANK_FLOW_SCALE = 0.75;
/**
 * Energy knees for the pool -> run -> riffle -> rapid continuum. They overlap
 * on purpose: a reach is never only one regime, and the weights are carved
 * from the fastest downwards so they always sum to one.
 */
export const WATER_REGIME_RUN_START = 0.12;
export const WATER_REGIME_RUN_END = 0.38;
export const WATER_REGIME_RIFFLE_START = 0.42;
export const WATER_REGIME_RIFFLE_END = 0.72;
export const WATER_REGIME_RAPID_START = 0.74;
export const WATER_REGIME_RAPID_END = 0.97;
/**
 * How much morphology and bank position move a reach along that continuum.
 * Negative morphology is the shallow half of the meander, and the inner bank
 * of a bend is the slack shallow side, so both push toward riffle.
 */
export const WATER_REGIME_MORPHOLOGY_WEIGHT = 0.26;
export const WATER_REGIME_INNER_BANK_WEIGHT = 0.2;
export const WATER_REGIME_OUTER_BANK_WEIGHT = 0.13;
/** A bend has to actually curve before either bank claims any weight. */
export const WATER_BEND_START = 0.14;
export const WATER_BEND_END = 0.78;
/** Outer bank runs faster and deeper; the inner bank slackens over its bar. */
export const WATER_BEND_FLOW_GAIN = 0.26;
export const WATER_BEND_FLOW_LOSS = 0.19;
export const WATER_BEND_DARKEN = 0.07;
export const WATER_BEND_LIGHTEN = 0.045;
/**
 * Along-flow stretch of the surface pattern. A run draws long anisotropic
 * streaks that read as direction even with foam disabled; a rapid tears them
 * back into short broken structures.
 */
/**
 * Held at 1.9. At 3.1 the along-flow domain shrank far enough that the 128 px
 * flow noise went nearly constant along the current and its tile boundaries
 * showed as hard straight diagonals across the channel — streaks made of
 * texture seams rather than of water.
 */
export const WATER_STREAK_MAX_STRETCH = 1.9;
export const WATER_RAPID_STREAK_BREAKUP = 0.55;
/** Lake interior vs shoreline, in the same units as the lobed basin distance. */
export const WATER_LAKE_OPEN_EDGE = 0.2;
export const WATER_LAKE_SHORE_EDGE = 0.88;
export const WATER_LAKE_SHORE_BAND_START = 0.6;
/** A sheltered cove keeps this fraction of the open lake's wind ripple. */
export const WATER_LAKE_COVE_WAVE_SCALE = 0.34;
/** Shore wavelets: tighter and livelier than the wind waves they replace. */
export const WATER_LAKE_SHORE_WAVE_FREQUENCY = 4.6;
export const WATER_LAKE_SHORE_WAVE_WEIGHT = 0.36;
/**
 * Foam floor for a shoreline with no energy behind it. Without this the shore
 * band outlined every waterline in white, including a flat sheltered cove
 * where nothing is breaking.
 */
export const WATER_SHORE_FOAM_ENERGY_FLOOR = 0.12;
export const WATER_LAKE_SHORE_FOAM_EXPOSURE = 0.62;
/** A rapid's foam connects because its cutoff drops, not because it is louder. */
export const WATER_RIFFLE_FOAM_CUTOFF = 0.82;
export const WATER_RAPID_FOAM_CUTOFF = 0.46;
