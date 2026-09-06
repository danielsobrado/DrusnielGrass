import type { WorldConfig } from "../WorldConfig";

export interface DetailFoliageTuning {
  density: number;
  colonyWorldSize: number;
  clumpWorldSize: number;
  colonyStrength: number;
  dominantFamilyShare: number;
  tintCoherence: number;
  quietZoneThreshold: number;
  backgroundSuppression: number;
  coreHeightBias: number;
  maturePhenotypeBias: number;
  ecologyStrength: number;
  edgeCompanionStrength: number;
  stoneFringeStrength: number;
  pathFringeStrength: number;
  /** How far the community decides whether a species belongs here. */
  communityStrength: number;
  /** How far an accent takes its height from the grass around it. */
  grassHeightCoupling: number;
}

export const DETAIL_FOLIAGE_TUNING_LIMITS = {
  density: { min: 0.1, max: 20, step: 0.05 },
  colonyWorldSize: { min: 6, max: 16, step: 0.5 },
  clumpWorldSize: { min: 1, max: 4, step: 0.25 },
  colonyStrength: { min: 0, max: 1, step: 0.02 },
  dominantFamilyShare: { min: 0.5, max: 0.9, step: 0.01 },
  tintCoherence: { min: 0.5, max: 1, step: 0.01 },
  quietZoneThreshold: { min: 0, max: 0.7, step: 0.02 },
  backgroundSuppression: { min: 0, max: 0.9, step: 0.02 },
  coreHeightBias: { min: 0, max: 0.25, step: 0.01 },
  maturePhenotypeBias: { min: 0, max: 1, step: 0.02 },
  ecologyStrength: { min: 0, max: 1, step: 0.02 },
  edgeCompanionStrength: { min: 0, max: 0.8, step: 0.02 },
  stoneFringeStrength: { min: 0, max: 1, step: 0.02 },
  pathFringeStrength: { min: 0, max: 1, step: 0.02 },
  communityStrength: { min: 0, max: 1, step: 0.02 },
  grassHeightCoupling: { min: 0, max: 1, step: 0.02 },
} as const;

export type DetailFoliageTuningKey = keyof DetailFoliageTuning;

const TUNING_KEYS = Object.keys(
  DETAIL_FOLIAGE_TUNING_LIMITS,
) as DetailFoliageTuningKey[];

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function copyTuning(tuning: DetailFoliageTuning): DetailFoliageTuning {
  return {
    density: tuning.density,
    colonyWorldSize: tuning.colonyWorldSize,
    clumpWorldSize: tuning.clumpWorldSize,
    colonyStrength: tuning.colonyStrength,
    dominantFamilyShare: tuning.dominantFamilyShare,
    tintCoherence: tuning.tintCoherence,
    quietZoneThreshold: tuning.quietZoneThreshold,
    backgroundSuppression: tuning.backgroundSuppression,
    coreHeightBias: tuning.coreHeightBias,
    maturePhenotypeBias: tuning.maturePhenotypeBias,
    ecologyStrength: tuning.ecologyStrength,
    edgeCompanionStrength: tuning.edgeCompanionStrength,
    stoneFringeStrength: tuning.stoneFringeStrength,
    pathFringeStrength: tuning.pathFringeStrength,
    communityStrength: tuning.communityStrength,
    grassHeightCoupling: tuning.grassHeightCoupling,
  };
}

export function createDetailFoliageTuning(
  config: WorldConfig,
): DetailFoliageTuning {
  return copyTuning({
    density: config.detailFoliageDensity,
    colonyWorldSize: config.detailFoliageColonyWorldSize,
    clumpWorldSize: config.detailFoliageClumpWorldSize,
    colonyStrength: config.detailFoliageColonyStrength,
    dominantFamilyShare: config.detailFoliageDominantFamilyShare,
    tintCoherence: config.detailFoliageTintCoherence,
    quietZoneThreshold: config.detailFoliageQuietZoneThreshold,
    backgroundSuppression: config.detailFoliageBackgroundSuppression,
    coreHeightBias: config.detailFoliageCoreHeightBias,
    maturePhenotypeBias: config.detailFoliageMaturePhenotypeBias,
    ecologyStrength: config.detailFoliageEcologyStrength,
    edgeCompanionStrength: config.detailFoliageEdgeCompanionStrength,
    stoneFringeStrength: config.detailFoliageStoneFringeStrength,
    pathFringeStrength: config.detailFoliagePathFringeStrength,
    communityStrength: config.detailFoliageCommunityStrength,
    grassHeightCoupling: config.detailFoliageGrassHeightCoupling,
  });
}

export function normalizeDetailFoliageTuning(
  tuning: DetailFoliageTuning,
): DetailFoliageTuning {
  const normalized = copyTuning(tuning);
  for (const key of TUNING_KEYS) {
    const limit = DETAIL_FOLIAGE_TUNING_LIMITS[key];
    normalized[key] = clamp(normalized[key], limit.min, limit.max);
  }
  const clumpCeiling = normalized.colonyWorldSize * 0.5;
  if (normalized.clumpWorldSize > clumpCeiling) {
    normalized.clumpWorldSize = Math.max(
      DETAIL_FOLIAGE_TUNING_LIMITS.clumpWorldSize.min,
      clumpCeiling,
    );
  }
  return normalized;
}

export function detailFoliageTuningEquals(
  left: DetailFoliageTuning,
  right: DetailFoliageTuning,
): boolean {
  for (const key of TUNING_KEYS) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}
