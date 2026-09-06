import {
  GRASS_ACCENT_SPECIES,
  GRASS_MAX_ACCENT_TINTS,
  type GrassAccentCategory,
} from "../../grass/biome/GrassAccentSpecies";
import type {
  GrassBiomeAccentSpecies,
  GrassBiomeProfile,
} from "../../grass/biome/GrassBiomeProfile";
import type { WorldEcologySample } from "../ecology/WorldEcologyField";
import {
  DETAIL_FOLIAGE_COMPANION_PICK_SALT,
  DETAIL_FOLIAGE_DOMINANT_DECISION_SALT,
  DETAIL_FOLIAGE_HEIGHT_SALT,
  DETAIL_FOLIAGE_INDEPENDENT_TINT_SALT,
  DETAIL_FOLIAGE_INDIVIDUAL_MATURITY_SALT,
  DETAIL_FOLIAGE_PHENOTYPE_SALT,
  DETAIL_FOLIAGE_TINT_COHERENCE_SALT,
  detailFoliageChannel01,
} from "./DetailFoliageRandom";
import { COMMUNITY_SPECIES_AFFINITY } from "../ecology/WorldCommunityProfiles";
import type { DetailFoliageTuning } from "./DetailFoliageTuning";
import type { DetailFoliageDistributionSample } from "./WorldDetailFoliageDistribution";
import {
  FOLIAGE_PHENOTYPE_GRAZED,
  FOLIAGE_PHENOTYPE_JUVENILE,
  FOLIAGE_PHENOTYPE_MATURE,
  FOLIAGE_PHENOTYPE_SENESCENT,
} from "./WorldDetailFoliageAtlasFactory";

/**
 * Share of plants drawn from the grazed row.
 *
 * Small, and independent of maturity: a plant is eaten or trodden by accident,
 * not by age. Large enough that a stand is not uniformly intact, which is the
 * tell that a population was generated rather than grown.
 */
const DETAIL_FOLIAGE_GRAZED_SHARE = 0.11;

export interface DetailFoliageSelection {
  speciesIndex: number;
  tintRow: number;
}

export function createDetailFoliageSelection(): DetailFoliageSelection {
  return { speciesIndex: 0, tintRow: 0 };
}

const HABITAT_WEIGHT_SUM = 5.5;

/**
 * Each entry is [preferred value, tolerance]: a species scores best where the
 * channel matches its first number and falls off across the second.
 *
 * `shade` carries most of the separation between the fern-and-broadleaf group
 * and the flower group, which no other channel could give it. On terrain alone
 * those two groups want nearly the same ground — moist, fertile, undisturbed,
 * off the rocks — so before this channel existed they were competing for the
 * same cells and the tie was broken by noise. Overhead cover is the real
 * divider between them, and it splits them cleanly: shade tolerance is why one
 * group lives under crowns and the other cannot.
 */
interface HabitatPreference {
  moisture: readonly [number, number];
  fertility: readonly [number, number];
  exposure: readonly [number, number];
  rockiness: readonly [number, number];
  disturbance: readonly [number, number];
  shade: readonly [number, number];
}

const HABITAT_BY_KEY: Readonly<Record<string, HabitatPreference>> = Object.freeze({
  "grass-tuft": {
    moisture: [0.5, 1],
    fertility: [0.5, 1],
    exposure: [0.5, 1],
    rockiness: [0.5, 1],
    disturbance: [0.4, 1],
    shade: [0.35, 1],
  },
  "low-shrub": {
    moisture: [0.55, 0.55],
    fertility: [0.65, 0.5],
    exposure: [0.55, 0.55],
    rockiness: [0.35, 0.55],
    disturbance: [0.1, 0.35],
    shade: [0.34, 0.62],
  },
  fern: {
    moisture: [0.82, 0.42],
    fertility: [0.55, 0.6],
    exposure: [0.25, 0.45],
    rockiness: [0.45, 0.55],
    disturbance: [0.05, 0.25],
    shade: [0.74, 0.46],
  },
  "small-fern": {
    moisture: [0.72, 0.5],
    fertility: [0.52, 0.65],
    exposure: [0.3, 0.5],
    rockiness: [0.6, 0.45],
    disturbance: [0.1, 0.35],
    shade: [0.62, 0.52],
  },
  daisy: {
    moisture: [0.55, 0.55],
    fertility: [0.75, 0.42],
    exposure: [0.65, 0.5],
    rockiness: [0.25, 0.6],
    disturbance: [0.1, 0.4],
    shade: [0.1, 0.44],
  },
  "round-bloom": {
    moisture: [0.58, 0.52],
    fertility: [0.68, 0.48],
    exposure: [0.55, 0.55],
    rockiness: [0.2, 0.55],
    disturbance: [0.1, 0.4],
    shade: [0.14, 0.5],
  },
  "seed-head": {
    moisture: [0.22, 0.45],
    fertility: [0.35, 0.65],
    exposure: [0.8, 0.45],
    rockiness: [0.5, 0.65],
    disturbance: [0.25, 0.6],
    shade: [0.05, 0.4],
  },
  "broadleaf-rosette": {
    moisture: [0.72, 0.45],
    fertility: [0.8, 0.38],
    exposure: [0.35, 0.5],
    rockiness: [0.2, 0.5],
    disturbance: [0.08, 0.3],
    shade: [0.6, 0.5],
  },
  "clover-patch": {
    moisture: [0.68, 0.6],
    fertility: [0.72, 0.55],
    exposure: [0.5, 0.75],
    rockiness: [0.25, 0.6],
    disturbance: [0.3, 0.6],
    shade: [0.4, 0.75],
  },
  "leaf-litter": {
    moisture: [0.5, 0.7],
    fertility: [0.35, 0.7],
    exposure: [0.4, 0.7],
    rockiness: [0.55, 0.7],
    disturbance: [0.55, 0.7],
    shade: [0.72, 0.55],
  },
});

const CATEGORY_INDEX: Record<GrassAccentCategory, number> = {
  tuft: 0,
  shrub: 1,
  fern: 2,
  broadleaf: 3,
  flower: 4,
  seed: 5,
  groundcover: 6,
};

/**
 * How welcome a species is beside an already-chosen neighbour, indexed
 * [dominant][candidate] by {@link CATEGORY_INDEX}.
 *
 * Row and column 6 are the ground layer, and it is the one category that
 * competes with nothing: it occupies the space *under* every other silhouette
 * rather than beside it, so it stays welcome next to all of them and is itself
 * largely indifferent to what stands over it. Its one reservation is seed
 * heads, which mark the dry, thin ground a closed mat of clover is not on.
 */
const COMPATIBILITY = [
  [1, 0.65, 0.65, 0.75, 0.7, 0.7, 0.95],
  [0.9, 1, 0.65, 0.9, 0.3, 0.25, 0.9],
  [0.8, 0.55, 1, 0.9, 0.25, 0.15, 1],
  [0.85, 0.75, 0.85, 1, 0.45, 0.2, 0.95],
  [0.85, 0.25, 0.3, 0.65, 0.55, 0.3, 0.9],
  [0.9, 0.3, 0.15, 0.2, 0.3, 1, 0.8],
  [0.95, 0.85, 0.95, 0.9, 0.85, 0.7, 1],
];

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (value <= edge0) {
    return 0;
  }
  if (value >= edge1) {
    return 1;
  }
  const amount = (value - edge0) / (edge1 - edge0);
  return amount * amount * (3 - 2 * amount);
}

function preference(value: number, target: number, tolerance: number): number {
  return clamp01(1 - Math.abs(value - target) / tolerance);
}

export function scoreDetailFoliageHabitat(
  speciesIndex: number,
  ecology: WorldEcologySample,
): number {
  const species = GRASS_ACCENT_SPECIES[speciesIndex];
  const habitat = species ? HABITAT_BY_KEY[species.key] : undefined;
  if (!habitat) {
    return 0.15;
  }
  const raw =
    (preference(ecology.moisture, habitat.moisture[0], habitat.moisture[1]) *
      1 +
      preference(ecology.fertility, habitat.fertility[0], habitat.fertility[1]) *
        1 +
      preference(ecology.exposure, habitat.exposure[0], habitat.exposure[1]) *
        0.7 +
      preference(ecology.rockiness, habitat.rockiness[0], habitat.rockiness[1]) *
        0.7 +
      preference(
        ecology.disturbance,
        habitat.disturbance[0],
        habitat.disturbance[1],
      ) *
        1.2 +
      // Weighted above aspect exposure and rockiness because it is the only
      // channel that describes a habitat rather than a surface, and because
      // the ground it marks out is rare: crowns cover a small share of the
      // meadow, so a weak weight here would let the open-ground species win
      // under trees on the strength of the other four.
      preference(ecology.shade, habitat.shade[0], habitat.shade[1]) * 0.9) /
    HABITAT_WEIGHT_SUM;
  return 0.15 + 0.85 * raw;
}

function edgeBoost(
  key: string,
  pathFringe: number,
  stoneFringe: number,
  habitatDryness: number,
  openness: number,
  tuning: DetailFoliageTuning,
): number {
  const edge = tuning.edgeCompanionStrength;
  // The ground layer follows the gaps the blades left. Without this the two
  // systems disagree: clearings open, and the species that should be lying in
  // them stay scattered evenly across the closed canopy instead, which reads
  // as bare mud rather than as meadow floor. Litter answers hardest because it
  // is the one species with no stake in the canopy at all.
  if (key === "leaf-litter") {
    return 1 + openness * 2.6;
  }
  if (key === "clover-patch") {
    return 1 + openness * 1.7;
  }
  if (key === "fern" || key === "small-fern" || key === "broadleaf-rosette") {
    return 1 + stoneFringe * tuning.stoneFringeStrength * edge;
  }
  if (key === "low-shrub") {
    return 1 + stoneFringe * 0.5 * tuning.stoneFringeStrength * edge;
  }
  if (key === "daisy" || key === "round-bloom") {
    return 1 + pathFringe * tuning.pathFringeStrength * edge;
  }
  if (key === "seed-head") {
    return 1 + pathFringe * habitatDryness * tuning.pathFringeStrength * edge;
  }
  return 1;
}

function adjustedWeight(
  entry: GrassBiomeAccentSpecies,
  ecology: WorldEcologySample,
  habitatDryness: number,
  pathFringe: number,
  stoneFringe: number,
  openness: number,
  communityIndex: number,
  tuning: DetailFoliageTuning,
): number {
  const species = GRASS_ACCENT_SPECIES[entry.speciesIndex];
  const habitatScore = scoreDetailFoliageHabitat(entry.speciesIndex, ecology);
  // The community this plant stands in, multiplied into the ecology score
  // rather than replacing it: a species becomes *common* in a community
  // without becoming unconditional there, which is the same shape the ecology
  // term beside it already has.
  const communityScore = lerp(
    1,
    COMMUNITY_SPECIES_AFFINITY[entry.speciesIndex]?.[communityIndex] ?? 1,
    tuning.communityStrength,
  );
  const weight =
    entry.weight * lerp(1, habitatScore, tuning.ecologyStrength) * communityScore;
  if (!(weight > 0) || !Number.isFinite(weight) || !species) {
    return 0;
  }
  return (
    weight *
    edgeBoost(
      species.key,
      pathFringe,
      stoneFringe,
      habitatDryness,
      openness,
      tuning,
    )
  );
}

function companionScaledWeight(
  entry: GrassBiomeAccentSpecies,
  ecology: WorldEcologySample,
  habitatDryness: number,
  pathFringe: number,
  stoneFringe: number,
  openness: number,
  communityIndex: number,
  tuning: DetailFoliageTuning,
  dominantCategory: GrassAccentCategory | undefined,
): number {
  const weight = adjustedWeight(
    entry,
    ecology,
    habitatDryness,
    pathFringe,
    stoneFringe,
    openness,
    communityIndex,
    tuning,
  );
  if (weight <= 0 || dominantCategory === undefined) {
    return weight;
  }
  const species = GRASS_ACCENT_SPECIES[entry.speciesIndex];
  if (!species) {
    return 0;
  }
  return (
    weight *
    COMPATIBILITY[CATEGORY_INDEX[dominantCategory]][
      CATEGORY_INDEX[species.category]
    ]
  );
}

function pickWeightedEntry(
  profile: GrassBiomeProfile,
  ecology: WorldEcologySample,
  habitatDryness: number,
  pathFringe: number,
  stoneFringe: number,
  openness: number,
  communityIndex: number,
  tuning: DetailFoliageTuning,
  roll: number,
  dominantCategory: GrassAccentCategory | undefined,
): GrassBiomeAccentSpecies | undefined {
  let total = 0;
  for (const entry of profile.accentSpecies) {
    const weight = companionScaledWeight(
      entry,
      ecology,
      habitatDryness,
      pathFringe,
      stoneFringe,
      openness,
      communityIndex,
      tuning,
      dominantCategory,
    );
    if (weight > 0) {
      total += weight;
    }
  }
  if (total <= 0) {
    return undefined;
  }

  let target = clamp01(roll) * total;
  let lastPositive: GrassBiomeAccentSpecies | undefined;
  for (const entry of profile.accentSpecies) {
    const weight = companionScaledWeight(
      entry,
      ecology,
      habitatDryness,
      pathFringe,
      stoneFringe,
      openness,
      communityIndex,
      tuning,
      dominantCategory,
    );
    if (weight <= 0) {
      continue;
    }
    lastPositive = entry;
    target -= weight;
    if (target <= 0) {
      return entry;
    }
  }
  return lastPositive;
}

function pickTintRow(
  profile: GrassBiomeProfile,
  speciesIndex: number,
  roll: number,
  fallback: number,
): number {
  let total = 0;
  for (const entry of profile.accentSpecies) {
    if (entry.speciesIndex === speciesIndex && entry.weight > 0) {
      total += entry.weight;
    }
  }
  if (total <= 0) {
    return fallback;
  }

  let target = clamp01(roll) * total;
  let lastPositive = fallback;
  for (const entry of profile.accentSpecies) {
    if (entry.speciesIndex !== speciesIndex || entry.weight <= 0) {
      continue;
    }
    lastPositive = entry.tintRow;
    target -= entry.weight;
    if (target <= 0) {
      return entry.tintRow;
    }
  }
  return lastPositive;
}

export function detailFoliageCorrelation(tuning: DetailFoliageTuning): number {
  return smoothstep(0, 0.75, clamp01(tuning.colonyStrength));
}

export function detailFoliageDominantProbability(
  distribution: DetailFoliageDistributionSample,
  tuning: DetailFoliageTuning,
): number {
  const localCoherence = lerp(0.9, 1, distribution.core);
  return clamp01(
    tuning.dominantFamilyShare *
      detailFoliageCorrelation(tuning) *
      localCoherence,
  );
}

export function detailFoliageEffectiveTintCoherence(
  tuning: DetailFoliageTuning,
): number {
  return tuning.tintCoherence * detailFoliageCorrelation(tuning);
}

export function detailFoliageHeightShift(
  distribution: DetailFoliageDistributionSample,
  tuning: DetailFoliageTuning,
): number {
  return (
    tuning.coreHeightBias *
    detailFoliageCorrelation(tuning) *
    (distribution.core - 0.5)
  );
}

export function detailFoliageHeightRoll(
  distribution: DetailFoliageDistributionSample,
  candidateHash: number,
  tuning: DetailFoliageTuning,
): number {
  return clamp01(
    detailFoliageChannel01(candidateHash, DETAIL_FOLIAGE_HEIGHT_SALT) +
      detailFoliageHeightShift(distribution, tuning),
  );
}

export function detailFoliageMaturity(
  distribution: DetailFoliageDistributionSample,
  candidateHash: number,
  tuning: DetailFoliageTuning,
): number {
  const correlation = detailFoliageCorrelation(tuning);
  const individual = detailFoliageChannel01(
    candidateHash,
    DETAIL_FOLIAGE_INDIVIDUAL_MATURITY_SALT,
  );
  const spatialMaturity = clamp01(
    0.75 * distribution.maturityRoll + 0.25 * distribution.core,
  );
  return lerp(
    individual,
    0.7 * spatialMaturity + 0.3 * individual,
    correlation,
  );
}

/**
 * Which phenotype row a plant grows into.
 *
 * The atlas carries four maturation states rather than two reseeds, so this
 * picks along that axis instead of flipping a bit. Maturity biases the choice
 * toward the fuller rows; the roll then decides, so a colony holds a spread of
 * ages rather than one age everywhere — which is what a stand of one species
 * actually looks like.
 *
 * The grazed row is deliberately rare and deliberately not maturity-driven: a
 * plant is eaten or trodden by accident, not by age.
 */
export function detailFoliageVariantRow(
  distribution: DetailFoliageDistributionSample,
  candidateHash: number,
  tuning: DetailFoliageTuning,
): number {
  const maturity = detailFoliageMaturity(distribution, candidateHash, tuning);
  const roll = detailFoliageChannel01(
    candidateHash,
    DETAIL_FOLIAGE_PHENOTYPE_SALT,
  );
  if (roll < DETAIL_FOLIAGE_GRAZED_SHARE) {
    return FOLIAGE_PHENOTYPE_GRAZED;
  }
  const remaining =
    (roll - DETAIL_FOLIAGE_GRAZED_SHARE) / (1 - DETAIL_FOLIAGE_GRAZED_SHARE);
  const pFull = clamp01(tuning.maturePhenotypeBias * (0.35 + 0.65 * maturity));
  if (remaining >= pFull) {
    return FOLIAGE_PHENOTYPE_JUVENILE;
  }
  // Inside the full-grown share, senescence is the tail of maturity: an old
  // stand carries more of it than a young one.
  return remaining < pFull * clamp01(0.24 + 0.36 * maturity)
    ? FOLIAGE_PHENOTYPE_SENESCENT
    : FOLIAGE_PHENOTYPE_MATURE;
}

export function pickDetailFoliageWeightedIndex(
  weights: ArrayLike<number>,
  roll: number,
): number {
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index];
    if (weight > 0 && Number.isFinite(weight)) {
      total += weight;
    }
  }
  if (total <= 0) {
    return -1;
  }

  let target = clamp01(roll) * total;
  let lastPositive = -1;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index];
    if (!(weight > 0) || !Number.isFinite(weight)) {
      continue;
    }
    lastPositive = index;
    target -= weight;
    if (target <= 0) {
      return index;
    }
  }
  return lastPositive;
}

export function resolveDetailFoliageSelection(
  profile: GrassBiomeProfile,
  ecology: WorldEcologySample,
  habitatDryness: number,
  openness: number,
  pathMask: number,
  stoneMask: number,
  stoneSkirt: number,
  distribution: DetailFoliageDistributionSample,
  candidateHash: number,
  communityIndex: number,
  tuning: DetailFoliageTuning,
  target: DetailFoliageSelection,
): boolean {
  const pathFringe = clamp01(4 * pathMask * (1 - pathMask));
  // Two readings of the same seam. The mask hump is where clearance is midway
  // through releasing the ground, which is narrow and moves with the feather;
  // the skirt is the authored planted band outside it, which keeps its width
  // whatever the feather does. Taking the stronger of the two lets the band
  // carry the fringe out to its full reach without losing the tight line right
  // against the contact.
  const stoneFringe = Math.max(
    clamp01(4 * stoneMask * (1 - stoneMask)),
    clamp01(stoneSkirt),
  );
  const dominant = pickWeightedEntry(
    profile,
    ecology,
    habitatDryness,
    pathFringe,
    stoneFringe,
    openness,
    communityIndex,
    tuning,
    distribution.familyRoll,
    undefined,
  );
  if (!dominant) {
    return false;
  }

  const pDominant = detailFoliageDominantProbability(distribution, tuning);
  const useDominant =
    detailFoliageChannel01(candidateHash, DETAIL_FOLIAGE_DOMINANT_DECISION_SALT) <
    pDominant;
  let selected = dominant;
  if (!useDominant) {
    const companionRoll = detailFoliageChannel01(
      candidateHash,
      DETAIL_FOLIAGE_COMPANION_PICK_SALT,
    );
    const companion = pickWeightedEntry(
      profile,
      ecology,
      habitatDryness,
      pathFringe,
      stoneFringe,
      openness,
      communityIndex,
      tuning,
      companionRoll,
      GRASS_ACCENT_SPECIES[dominant.speciesIndex]?.category,
    );
    selected =
      companion ??
      pickWeightedEntry(
        profile,
        ecology,
        habitatDryness,
        pathFringe,
        stoneFringe,
        openness,
        communityIndex,
        tuning,
        companionRoll,
        undefined,
      ) ??
      dominant;
  }

  const species = GRASS_ACCENT_SPECIES[selected.speciesIndex];
  if (!species) {
    return false;
  }
  target.speciesIndex = selected.speciesIndex;
  if (species.category !== "flower") {
    target.tintRow = selected.tintRow;
    return true;
  }

  const colonyTintRow = pickTintRow(
    profile,
    selected.speciesIndex,
    distribution.tintRoll,
    selected.tintRow,
  );
  if (
    detailFoliageChannel01(candidateHash, DETAIL_FOLIAGE_TINT_COHERENCE_SALT) <
    detailFoliageEffectiveTintCoherence(tuning)
  ) {
    target.tintRow = colonyTintRow;
  } else {
    target.tintRow = pickTintRow(
      profile,
      selected.speciesIndex,
      detailFoliageChannel01(candidateHash, DETAIL_FOLIAGE_INDEPENDENT_TINT_SALT),
      selected.tintRow,
    );
  }
  if (target.tintRow < 0 || target.tintRow >= GRASS_MAX_ACCENT_TINTS) {
    target.tintRow = 0;
  }
  return true;
}
