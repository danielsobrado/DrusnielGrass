export const WORLD_TREE_SPECIES = ["oak", "birch", "evergreen"] as const;
export type WorldTreeSpecies = (typeof WORLD_TREE_SPECIES)[number];

export const TREE_MAX_COUNT_DESKTOP = 96;
export const TREE_MAX_COUNT_COMPACT = 36;
export const TREE_NEAR_RADIUS_DESKTOP = 46;
export const TREE_NEAR_RADIUS_COMPACT = 28;
export const TREE_LOD_OVERLAP_METERS = 6;
export const TREE_LOD_UPDATE_STEP = 0.1;
export const TREE_LOD_VISIBLE_THRESHOLD = 0.015;
export const TREE_WOOD_HORIZONTAL_SCALE = 0.48;
export const TREE_WIND_SWAY_LOCAL = 0.018;
export const TREE_WIND_FAR_SCALE = 0.45;
export const TREE_WIND_PHASE_SPEED = 1.15;
export const TREE_WIND_SECONDARY_SPEED = 1.73;
export const TREE_WIND_SECONDARY_GAIN = 0.22;
export const TREE_WIND_HEIGHT_START = 0.42;
export const TREE_WIND_MAX_INTENSITY = 1.6;
export const TREE_PHASE_X_SCALE = 0.037;
export const TREE_PHASE_Z_SCALE = 0.061;
export const TREE_LEAF_ALPHA_TEST = 0.38;
export const TREE_FAR_ALPHA_TEST = 0.34;
export const TREE_ATLAS_COLUMNS = 4;
export const TREE_ATLAS_ROWS = 2;
export const TREE_ATLAS_TILE_SIZE = 256;
export const TREE_ATLAS_ANISOTROPY = 8;
export const TREE_ATLAS_UV_INSET_PIXELS = 2;

export const TREE_EVERGREEN_BASE_SHARE = 0.1;
export const TREE_EVERGREEN_ROCKINESS_GAIN = 0.2;
export const TREE_EVERGREEN_EXPOSURE_GAIN = 0.12;
export const TREE_EVERGREEN_MOISTURE_REDUCTION = 0.08;
export const TREE_EVERGREEN_MIN_SHARE = 0.08;
export const TREE_EVERGREEN_MAX_SHARE = 0.28;
export const TREE_BIRCH_BASE_SHARE = 0.3;
export const TREE_BIRCH_MOISTURE_GAIN = 0.24;
export const TREE_BIRCH_EXPOSURE_GAIN = 0.08;
export const TREE_BIRCH_FERTILITY_REDUCTION = 0.12;
export const TREE_BIRCH_MIN_SHARE = 0.2;
export const TREE_BIRCH_MAX_SHARE = 0.58;

export const TREE_SPECIES_CANOPY_RADIUS: Readonly<Record<WorldTreeSpecies, number>> =
  Object.freeze({ oak: 1, birch: 0.78, evergreen: 0.82 });

export const TREE_ATLAS_COLORS = Object.freeze({
  barkDark: "#3b2d24",
  barkBase: "#5d4938",
  barkLight: "#80654b",
  oakDark: "#294b28",
  oakBase: "#426f35",
  oakLight: "#76a34d",
  birchDark: "#35572e",
  birchBase: "#5b8241",
  birchLight: "#9dbb66",
  evergreenDark: "#1f4634",
  evergreenBase: "#315f42",
  evergreenLight: "#5e8b58",
  birchBark: "#d6d1bd",
  birchBarkShade: "#aaa697",
  birchMark: "#514b43",
});
