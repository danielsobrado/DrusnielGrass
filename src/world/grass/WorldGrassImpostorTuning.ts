import {
  GRASS_IMPOSTOR_MAX_ATLAS_SIZE,
  GRASS_IMPOSTOR_SUBPATCHES_PER_AXIS,
} from "../../grass/GrassImpostorLimits";

export const IMPOSTOR_ALPHA_CUTOFF = 0.16;
/**
 * Tiny cards need a conventional hard alpha test instead of stochastic edge
 * coverage. A 0.5 cut rejects mip-averaged blade fragments before they turn
 * into isolated pixels against the sky.
 */
export const IMPOSTOR_MINIFIED_ALPHA_CUTOFF = 0.5;
/** Atlas texels covered by one screen pixel when alpha hardening begins. */
export const IMPOSTOR_MINIFICATION_START_TEXELS_PER_PIXEL = 1.5;
/** Atlas texels covered by one screen pixel when stochastic pixel cuts stop. */
export const IMPOSTOR_MINIFICATION_FULL_TEXELS_PER_PIXEL = 4;
/** View-selection dither resolution relative to the configured atlas frame. */
export const IMPOSTOR_VIEW_DITHER_GRID_SCALE = 0.75;
export const IMPOSTOR_ALPHA_DITHER_SEED = 0.61;
/** Stable hash terms for the coherent far-to-terrain subpatch fade. */
export const IMPOSTOR_TERRAIN_DITHER_INSTANCE_SCALE = 53;
export const IMPOSTOR_TERRAIN_DITHER_SUBPATCH_SCALE = 0.41421356237;
export const IMPOSTOR_TERRAIN_DITHER_SEED_SCALE = 1.32471795724;
/** Stable subpatch distribution used once fragment coverage is strongly minified. */
export const IMPOSTOR_MINIFIED_COVERAGE_SUBPATCH_SCALE = 0.61803398875;
export const IMPOSTOR_MINIFIED_COVERAGE_SEED_OFFSET = 0.43;
export const IMPOSTOR_SUBPATCHES_PER_AXIS = GRASS_IMPOSTOR_SUBPATCHES_PER_AXIS;
export const IMPOSTOR_MAX_ATLAS_SIZE = GRASS_IMPOSTOR_MAX_ATLAS_SIZE;
export const IMPOSTOR_TERRAIN_UP_BLEND = 0.35;
export const IMPOSTOR_AERIAL_BLEND_START = 0.22;
export const IMPOSTOR_AERIAL_BLEND_END = 0.48;
export const IMPOSTOR_HORIZON_ATLAS_ELEVATION = 0.1;

// Retained as color-matching thresholds. Coverage itself must stay independent
// of elevation so it remains complementary to the mid-blade distance fade.
// Semantic atlas recoloring already matches real blades. Keep only a subtle
// base bias for sub-pixel stability instead of flattening the tip gradient.
export const IMPOSTOR_BASE_COLOR_BLEND = 0;
export const IMPOSTOR_COLOR_SCALE = 1;
/** Decorrelates the card coverage dither from the real-blade LOD dither. */
export const IMPOSTOR_DITHER_SEED = 0.3819660112501051;
