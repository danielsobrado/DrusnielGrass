export const MIN_MAIN_TIER_SHARE = 0.22;
export const MIN_EDGE_COVERAGE = 0.4;
export const MAX_PLANE_COHERENCE = 0.5;
export const BASE_HEIGHT_IDENTITY_MIN = 0.94;
export const BASE_HEIGHT_IDENTITY_RANGE = 0.12;
export const BASE_ASYMMETRY_MIN = 0.05;
export const BASE_ASYMMETRY_RANGE = 0.2;
export const EDGE_FADE_START = 0.72;
export const GAP_INNER_START = 0.18;
export const GAP_INNER_FULL = 0.34;
export const GAP_OUTER_FULL = 0.58;
export const GAP_OUTER_END = 0.82;
export const GAP_WAVE_START = 0.05;
export const GAP_WAVE_END = 0.2;
export const GAP_IDENTITY_START = 0.55;
export const GAP_IDENTITY_END = 0.95;

/**
 * Blade width by archetype. These used to span 0.94 to 1.08 -- a seven per cent
 * spread that read as one silhouette everywhere no matter how the habitat
 * varied -- and they ran backwards: the wet archetype was the narrowest and the
 * dry one the broadest. Lush ground grows broad leaves and dry ground grows
 * narrow wiry ones, so wet and dry have been swapped and pulled apart to span
 * 0.74 to 1.26. The spread is free: it is a scale on geometry that is already
 * instanced, so it buys silhouette variety at no fill or draw cost, which
 * matters because the accent layer has most of the GPU frame.
 */
export const SPARSE_HEIGHT_SCALE = 0.96;
export const SPARSE_WIDTH_SCALE = 0.86;
export const SPARSE_UNDERSTORY_SHARE = 0.3;
export const SPARSE_PLANE_SCALE = 0.65;
export const SPARSE_DRYNESS_OFFSET = 0.015;
export const SPARSE_COVERAGE_SCALE = 0.56;
export const SPARSE_EDGE_SCALE = 0.72;
export const SPARSE_LEAN_SCALE = 0.95;
export const SPARSE_GAP_STRENGTH = 0.62;

export const WET_HEIGHT_SCALE = 1.14;
export const WET_WIDTH_SCALE = 1.26;
export const WET_UNDERSTORY_SHARE = 0.28;
export const WET_PLANE_SCALE = 1.25;
export const WET_DRYNESS_SCALE = 0.5;
export const WET_EDGE_COVERAGE = 0.94;
export const WET_LEAN_SCALE = 0.78;
export const WET_GAP_STRENGTH = 0.03;

export const DRY_HEIGHT_SCALE = 0.78;
export const DRY_WIDTH_SCALE = 0.74;
export const DRY_UNDERSTORY_SHARE = 0.56;
export const DRY_PLANE_SCALE = 0.64;
export const DRY_DRYNESS_SCALE = 1.02;
export const DRY_DRYNESS_OFFSET = 0.1;
export const DRY_COVERAGE_SCALE = 0.88;
export const DRY_EDGE_SCALE = 0.7;
export const DRY_LEAN_SCALE = 1.42;
export const DRY_GAP_STRENGTH = 0.54;

export const FLATTENED_HEIGHT_SCALE = 0.8;
export const FLATTENED_WIDTH_SCALE = 1.12;
export const FLATTENED_UNDERSTORY_SHARE = 0.56;
export const FLATTENED_PLANE_SCALE = 1.12;
export const FLATTENED_ASYMMETRY_SCALE = 1.18;
export const FLATTENED_DRYNESS_OFFSET = 0.04;
export const FLATTENED_COVERAGE_SCALE = 0.9;
export const FLATTENED_EDGE_SCALE = 0.74;
export const FLATTENED_LEAN_SCALE = 1;
export const FLATTENED_LEAN_TOWARD_MAX = 0.55;
export const FLATTENED_GAP_STRENGTH = 0.46;

export const ACCENT_HEIGHT_SCALE = 1.1;
export const ACCENT_WIDTH_SCALE = 1.16;
export const ACCENT_UNDERSTORY_SHARE = 0.34;
export const ACCENT_PLANE_SCALE = 1.08;
export const ACCENT_EDGE_COVERAGE = 0.9;
export const ACCENT_LEAN_SCALE = 0.95;
export const ACCENT_GAP_STRENGTH = 0.08;

export const NORMAL_ACCENT_IDENTITY_THRESHOLD = 0.62;
export const SPARSE_ACCENT_IDENTITY_THRESHOLD = 0.84;
export const NORMAL_ACCENT_SHARE_SCALE = 1.8;
export const SPARSE_ACCENT_SHARE_SCALE = 1.35;
export const WET_ACCENT_SHARE_SCALE = 2.7;
export const ACCENT_SHARE_SCALE = 3.2;
// Healthy meadow cores should read as one canopy. Dry, flattened, and sparse
// archetypes retain their much stronger authored interior openings below.
export const DEFAULT_GAP_STRENGTH = 0.05;
// Preserve the authored meadow carpet. Habitat still opens or thickens it,
// but should not pull a healthy 58% baseline back into the mid-forties.
export const HABITAT_UNDERSTORY_BLEND = 0.3;
