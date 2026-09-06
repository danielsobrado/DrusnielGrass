import {
  GRASS_MACRO_DRYNESS_STRENGTH,
  resolveGrassClearingThreshold,
  sampleGrassMacroClearing,
  sampleGrassMacroDryness,
  sampleGrassMacroVigor,
} from "../../grass/GrassFieldVariation";
import type { WorldEcologySample } from "../ecology/WorldEcologyField";
import {
  COMMUNITY_PROFILES,
  type CommunityResponse,
} from "../ecology/WorldCommunityProfiles";
import type { WorldConfig } from "../WorldConfig";

/**
 * Grass-specific habitat derived from ecology, biome, and one low-frequency
 * patch signal. Callers already own ecology and biome values; this mapper does
 * not resample terrain, hydrology, or ecology.
 */
export interface GrassHabitatSample {
  density: number;
  /** Final density as a retained share of this biome's expected baseline. */
  densityRetention: number;
  height: number;
  dryness: number;
  clumpScale: number;
  underlayer: number;
  directionalLean: number;
  accentChance: number;
  /**
   * How open this ground is, in [0, 1]: 0 is closed canopy, 1 is the core of a
   * clearing where no blade survives. Published because the accent layer needs
   * the same number the blades were thinned by -- a clearing is where the
   * ground layer belongs, and recomputing the field there would risk the two
   * disagreeing about where the gap is.
   */
  openness: number;
}

export const GRASS_CLUSTER_DENSE_NORMAL = 0;
export const GRASS_CLUSTER_SPARSE_OPEN = 1;
export const GRASS_CLUSTER_TALL_WET = 2;
export const GRASS_CLUSTER_SHORT_DRY = 3;
export const GRASS_CLUSTER_FLATTENED = 4;
export const GRASS_CLUSTER_ACCENT = 5;
export const GRASS_CLUSTER_ARCHETYPE_COUNT = 6;

const ARCHETYPE_SALT = 0xa3;
const GRASS_DENSITY_EPSILON = 0.0001;

export function createGrassHabitatSample(): GrassHabitatSample {
  return {
    density: 1,
    densityRetention: 1,
    height: 1,
    dryness: 0,
    clumpScale: 1,
    underlayer: 0.34,
    directionalLean: 0,
    accentChance: 0,
    openness: 0,
  };
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const fractionX = x - cellX;
  const fractionZ = z - cellZ;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  const corner00 = hashLattice(cellX, cellZ, seed);
  const corner10 = hashLattice(cellX + 1, cellZ, seed);
  const corner01 = hashLattice(cellX, cellZ + 1, seed);
  const corner11 = hashLattice(cellX + 1, cellZ + 1, seed);
  const lower = corner00 + (corner10 - corner00) * weightX;
  const upper = corner01 + (corner11 - corner01) * weightX;
  return lower + (upper - lower) * weightZ;
}

function sampleMacroPatch(x: number, z: number, config: WorldConfig): number {
  const period = Math.max(config.grassMacroPatchWorldSize, 1);
  const seed = (config.seed ^ 0x4f1b_2c8d) >>> 0;
  const coarse = valueNoise(x / period, z / period, seed);
  const fine = valueNoise((x * 2.15) / period, (z * 2.15) / period, seed ^ 0x9e3779b9);
  return (coarse + fine * 0.45) / 1.45;
}

/**
 * Maps existing ecological causes onto grass placement and shading.
 * `target` is filled in place so placement loops allocate nothing.
 */
export function sampleGrassHabitat(
  x: number,
  z: number,
  ecology: WorldEcologySample,
  biomeDensity: number,
  minimumClimateDensityRetention: number,
  heightBandMin: number,
  heightBandMax: number,
  drynessBias: number,
  accentDensity: number,
  /**
   * What the vegetation community here does to composition.
   *
   * Resolved by the caller rather than sampled here, so this stays a pure
   * mapper and every layer shares one resolution instead of four call sites
   * each deciding how to read a community.
   *
   * It carries no dryness, and that absence is the contract: dryness is one of
   * the ecology channels that *selected* the community, so writing it back
   * would close a loop. See `WorldCommunityProfiles`.
   */
  community: CommunityResponse,
  config: WorldConfig,
  target: GrassHabitatSample,
): GrassHabitatSample {
  const moisture = clamp01(ecology.moisture);
  const fertility = clamp01(ecology.fertility);
  const exposure = clamp01(ecology.exposure);
  const disturbance = clamp01(ecology.disturbance);
  const rockiness = clamp01(ecology.rockiness);
  const vigor = sampleGrassMacroVigor(x, z);
  const hostile = Math.max(disturbance, rockiness, 1 - moisture);
  const patch = sampleMacroPatch(x, z, config);
  const patchMul =
    1 + (patch * 2 - 1) * config.grassMacroPatchStrength * (1 - hostile * 0.85);

  let density = biomeDensity;
  // Applied before the climate retention floor below, deliberately. A bare
  // break should be allowed to fall through to bare ground the way a clearing
  // is; the floor exists to stop *climate* zeroing a meadow, not to stop
  // composition doing it.
  density *= community.density;
  // Ecology decides whether a community belongs here, but ordinary moisture
  // variation is only a bounded suitability bias. Letting the full wet boost
  // draw coverage made every contour of the landform visible from the air.
  density *=
    1 +
    (moisture * fertility - 0.5) *
      Math.min(config.grassWetDensityBoost, 0.1) *
      2;
  // Genuine dry stress still opens the meadow, but the independent macro field
  // perturbs its onset. The edge therefore meanders through the terrain instead
  // of tracing one moisture isoline around an entire hill.
  const dryStress = smoothstep(
    0.48 + (patch - 0.5) * 0.2,
    0.88 + (patch - 0.5) * 0.12,
    1 - moisture,
  );
  density *=
    1 -
    dryStress *
      config.grassDryDensityReduction *
      (0.62 + 0.38 * exposure);
  density *= patchMul;
  density = Math.max(
    density,
    biomeDensity * clamp01(minimumClimateDensityRetention),
  );
  density *= 1 - rockiness * config.grassRockDensityReduction;
  density *= 1 - disturbance * config.grassDisturbanceDensityReduction;
  // Clearings are applied last, after the climate retention floor above, and
  // are the only term permitted to reach zero. Everything before this point is
  // a statement about how well grass grows; this one is a statement about
  // whether it is there at all, which is what lets the substrate show through.
  // The same density lands in the terrain shader's grass-tint amount through
  // TerrainSurfaceField, so a gap in the blades uncovers soil rather than a
  // green patch of ground pretending to be grass.
  // The ramp is centred on the threshold rather than starting at it, so the
  // half-open contour lands exactly on the measured quantile and the coverage
  // lever stays truthful; the width is what keeps clearing edges ragged
  // instead of stamping a hard circle into the canopy.
  const clearingThreshold = resolveGrassClearingThreshold(
    clamp01(config.grassClearingCoverage),
  );
  const rawOpenness = smoothstep(
    clearingThreshold - 0.07,
    clearingThreshold + 0.07,
    sampleGrassMacroClearing(x, z),
  );
  // Small clearings are subordinate to the community instead of interrupting
  // every habitat equally. The 20% floor preserves occasional pioneers and
  // raggedness in closed colonies without perforating them from the air.
  const clearingExpression = lerp(
    0.2,
    1,
    clamp01(community.clearingAffinity),
  );
  const openness = rawOpenness * clearingExpression;
  const clearingBorder = clamp01(4 * openness * (1 - openness));
  // Kept before the clearing is applied, because a clearing is bare of blades
  // and not of ground: the sub-canopy species are what should still be
  // standing in one. This does not bind in a fertile meadow, where
  // accentChance clears the field's 0.06 cutoff either way, but it is load
  // bearing on marginal ground -- a dry-steppe clearing computes about 0.031
  // against that cutoff and would lose its ground layer entirely.
  const canopyDensity = clamp01(density);
  density *= 1 - openness * clamp01(config.grassClearingStrength);
  target.density = clamp01(density);
  target.openness = openness;
  target.densityRetention = clamp01(
    target.density / Math.max(biomeDensity, GRASS_DENSITY_EPSILON),
  );

  const biomeHeight = lerp(heightBandMin, heightBandMax, vigor * 0.55 + 0.45 * patch);
  target.height = Math.max(
    0.58,
    Math.min(
      1.22,
      biomeHeight *
        community.height *
        (1 + moisture * fertility * config.grassWetHeightBoost) *
        (1 - (1 - moisture) * config.grassDryHeightReduction) *
        (1 - disturbance * config.grassDisturbanceHeightReduction) *
        (1 - rockiness * 0.16),
    ),
  );
  // Ecotones carry short pioneers before the canopy gives way completely.
  target.height *= 1 - clearingBorder * 0.22;

  target.dryness = clamp01(
    (1 - moisture) * 0.58 +
      exposure * 0.14 +
      rockiness * 0.2 +
      disturbance * 0.16 +
      drynessBias +
      sampleGrassMacroDryness(x, z) * GRASS_MACRO_DRYNESS_STRENGTH +
      (1 - moisture) * config.grassDryColorStrength * 0.72,
  );
  // Dense habitats grow fuller clumps, while sparse ground opens enough that
  // the soil can visually participate instead of every surviving blade keeping
  // the same footprint.
  target.clumpScale = lerp(0.68, 1.27, target.density) * community.clumpScale;
  target.underlayer = clamp01(
    lerp(0.34, 0.6, 1.1 - target.height) *
      (1 - disturbance * 0.68) *
      community.understory,
  );
  target.directionalLean = clamp01(disturbance * 0.76 + exposure * 0.16);
  target.accentChance = clamp01(
    community.accentChance *
      accentDensity *
      fertility *
      (1 - disturbance) *
      (0.35 + moisture * 0.65) *
      (0.4 + canopyDensity * 0.6),
  );
  return target;
}

/**
 * Stable tuft identity shared by every LOD that can name the same clump cell.
 * A small identity bias softens hard habitat thresholds without inventing a
 * second random scatter field.
 */
export function resolveGrassClusterArchetype(
  habitat: GrassHabitatSample,
  /**
   * The community this clump stands in, as a nudge rather than an override.
   *
   * A first draft of the community work special-cased this chain -- if the
   * community is a short sward, return SHORT_DRY, and so on -- and needing that
   * was the symptom that the causality was inverted. Now that a community is
   * itself selected by the ecology these thresholds already read, the two agree
   * most of the time on their own; this only sharpens the agreement at the
   * margin, where the thresholds are close to indifferent anyway.
   */
  communityIndex: number,
  clumpColumn: number,
  clumpRow: number,
  config: WorldConfig,
): number {
  const roll = hashLattice(
    clumpColumn,
    clumpRow,
    (config.seed ^ ARCHETYPE_SALT) >>> 0,
  );
  const identityBias = (roll - 0.5) * 0.08;
  /**
   * The community's nudge, applied only to the two thresholds it has an
   * unambiguous direction for.
   *
   * A first attempt folded this into `identityBias` and added the result to all
   * four comparisons, which cannot work: they do not point the same way. A
   * positive bias makes ground read drier *and* less sparse, because dryness is
   * compared above its threshold and retention below its own. `verify-ecology`
   * caught it as a degraded biome that stopped being sparse.
   *
   * Positive means drier and shorter. Sparseness and flattening are left to
   * ecology alone: those are consequences of disturbance and thin ground, which
   * are among the conditions that selected this community in the first place,
   * so leaning on them here would be the same circularity in miniature.
   */
  // Positive profile values lean toward the drier/shorter/sparser end of the
  // chain below; negative values lean taller/wetter. The art value lives beside
  // the rest of its community profile so tuning never requires a TS edit.
  const communityLean =
    (COMMUNITY_PROFILES[communityIndex]?.archetypeBias ?? 0) * 0.12;
  if (habitat.directionalLean + identityBias > 0.45) {
    return GRASS_CLUSTER_FLATTENED;
  }
  if (
    habitat.dryness + identityBias + communityLean > 0.4 &&
    habitat.height < 1
  ) {
    return GRASS_CLUSTER_SHORT_DRY;
  }
  if (
    habitat.densityRetention + identityBias <
    config.grassSparseDensityRetentionThreshold
  ) {
    return GRASS_CLUSTER_SPARSE_OPEN;
  }
  if (
    habitat.height + identityBias - communityLean > 1.01 &&
    habitat.dryness < 0.36
  ) {
    return GRASS_CLUSTER_TALL_WET;
  }
  if (habitat.accentChance > 0.2 && roll > 0.64) return GRASS_CLUSTER_ACCENT;
  return GRASS_CLUSTER_DENSE_NORMAL;
}
