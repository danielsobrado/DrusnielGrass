import type { WorldConfig } from "../WorldConfig";
import {
  GRASS_CLUSTER_ACCENT,
  GRASS_CLUSTER_DENSE_NORMAL,
  GRASS_CLUSTER_FLATTENED,
  GRASS_CLUSTER_SHORT_DRY,
  GRASS_CLUSTER_SPARSE_OPEN,
  GRASS_CLUSTER_TALL_WET,
  type GrassHabitatSample,
} from "./GrassHabitatField";
import * as Tuning from "./GrassClusterProfileTuning";

export interface GrassClusterProfile {
  heightScale: number;
  widthScale: number;
  understoryShare: number;
  accentShare: number;
  planeCoherence: number;
  asymmetry: number;
  drynessScale: number;
  drynessOffset: number;
  coverageScale: number;
  edgeCoverage: number;
  leanScale: number;
  leanTowardMax: number;
  gapStrength: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value <= minimum ? minimum : value >= maximum ? maximum : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

export function createGrassClusterProfile(): GrassClusterProfile {
  return {
    heightScale: 1,
    widthScale: 1,
    understoryShare: 0,
    accentShare: 0,
    planeCoherence: 0,
    asymmetry: Tuning.BASE_ASYMMETRY_MIN,
    drynessScale: 1,
    drynessOffset: 0,
    coverageScale: 1,
    edgeCoverage: 1,
    leanScale: 1,
    leanTowardMax: 0,
    gapStrength: 0,
  };
}

/** Resolves one stable clump morphology into caller-owned storage. */
export function resolveGrassClusterProfile(
  archetype: number,
  habitat: GrassHabitatSample,
  heightIdentity: number,
  tallIdentity: number,
  asymmetryIdentity: number,
  config: WorldConfig,
  target: GrassClusterProfile,
): GrassClusterProfile {
  target.heightScale =
    habitat.height *
    (Tuning.BASE_HEIGHT_IDENTITY_MIN +
      heightIdentity * Tuning.BASE_HEIGHT_IDENTITY_RANGE);
  target.widthScale = habitat.clumpScale;
  target.understoryShare = config.grassUnderlayerFraction;
  target.accentShare =
    tallIdentity > Tuning.NORMAL_ACCENT_IDENTITY_THRESHOLD
      ? config.grassAccentBladeShare * Tuning.NORMAL_ACCENT_SHARE_SCALE
      : 0;
  target.planeCoherence = config.grassClumpPlaneCoherence;
  target.asymmetry =
    Tuning.BASE_ASYMMETRY_MIN +
    asymmetryIdentity * Tuning.BASE_ASYMMETRY_RANGE;
  target.drynessScale = 1;
  target.drynessOffset = 0;
  target.coverageScale = 1;
  target.edgeCoverage = config.grassClumpEdgeCoverage;
  target.leanScale = 1;
  target.leanTowardMax = 0;
  target.gapStrength = Tuning.DEFAULT_GAP_STRENGTH;

  switch (archetype) {
    case GRASS_CLUSTER_SPARSE_OPEN:
      target.heightScale *= Tuning.SPARSE_HEIGHT_SCALE;
      target.widthScale *= Tuning.SPARSE_WIDTH_SCALE;
      target.understoryShare = Tuning.SPARSE_UNDERSTORY_SHARE;
      target.accentShare =
        tallIdentity > Tuning.SPARSE_ACCENT_IDENTITY_THRESHOLD
          ? config.grassAccentBladeShare * Tuning.SPARSE_ACCENT_SHARE_SCALE
          : 0;
      target.planeCoherence *= Tuning.SPARSE_PLANE_SCALE;
      target.drynessOffset = Tuning.SPARSE_DRYNESS_OFFSET;
      target.coverageScale = Tuning.SPARSE_COVERAGE_SCALE;
      target.edgeCoverage *= Tuning.SPARSE_EDGE_SCALE;
      target.leanScale = Tuning.SPARSE_LEAN_SCALE;
      target.gapStrength = Tuning.SPARSE_GAP_STRENGTH;
      break;
    case GRASS_CLUSTER_TALL_WET:
      target.heightScale *= Tuning.WET_HEIGHT_SCALE;
      target.widthScale *= Tuning.WET_WIDTH_SCALE;
      target.understoryShare = Tuning.WET_UNDERSTORY_SHARE;
      target.accentShare =
        config.grassAccentBladeShare * Tuning.WET_ACCENT_SHARE_SCALE;
      target.planeCoherence *= Tuning.WET_PLANE_SCALE;
      target.drynessScale = Tuning.WET_DRYNESS_SCALE;
      target.edgeCoverage = Math.max(
        target.edgeCoverage,
        Tuning.WET_EDGE_COVERAGE,
      );
      target.leanScale = Tuning.WET_LEAN_SCALE;
      target.gapStrength = Tuning.WET_GAP_STRENGTH;
      break;
    case GRASS_CLUSTER_SHORT_DRY:
      target.heightScale *= Tuning.DRY_HEIGHT_SCALE;
      target.widthScale *= Tuning.DRY_WIDTH_SCALE;
      target.understoryShare = Tuning.DRY_UNDERSTORY_SHARE;
      target.accentShare = 0;
      target.planeCoherence *= Tuning.DRY_PLANE_SCALE;
      target.drynessScale = Tuning.DRY_DRYNESS_SCALE;
      target.drynessOffset = Tuning.DRY_DRYNESS_OFFSET;
      target.coverageScale = Tuning.DRY_COVERAGE_SCALE;
      target.edgeCoverage *= Tuning.DRY_EDGE_SCALE;
      target.leanScale = Tuning.DRY_LEAN_SCALE;
      target.gapStrength = Tuning.DRY_GAP_STRENGTH;
      break;
    case GRASS_CLUSTER_FLATTENED:
      target.heightScale *= Tuning.FLATTENED_HEIGHT_SCALE;
      target.widthScale *= Tuning.FLATTENED_WIDTH_SCALE;
      target.understoryShare = Tuning.FLATTENED_UNDERSTORY_SHARE;
      target.accentShare = 0;
      target.planeCoherence *= Tuning.FLATTENED_PLANE_SCALE;
      target.asymmetry *= Tuning.FLATTENED_ASYMMETRY_SCALE;
      target.drynessOffset = Tuning.FLATTENED_DRYNESS_OFFSET;
      target.coverageScale = Tuning.FLATTENED_COVERAGE_SCALE;
      target.edgeCoverage *= Tuning.FLATTENED_EDGE_SCALE;
      target.leanScale = Tuning.FLATTENED_LEAN_SCALE;
      target.leanTowardMax = Tuning.FLATTENED_LEAN_TOWARD_MAX;
      target.gapStrength = Tuning.FLATTENED_GAP_STRENGTH;
      break;
    case GRASS_CLUSTER_ACCENT:
      target.heightScale *= Tuning.ACCENT_HEIGHT_SCALE;
      target.widthScale *= Tuning.ACCENT_WIDTH_SCALE;
      target.understoryShare = Tuning.ACCENT_UNDERSTORY_SHARE;
      target.accentShare =
        config.grassAccentBladeShare * Tuning.ACCENT_SHARE_SCALE;
      target.planeCoherence *= Tuning.ACCENT_PLANE_SCALE;
      target.edgeCoverage = Math.max(
        target.edgeCoverage,
        Tuning.ACCENT_EDGE_COVERAGE,
      );
      target.leanScale = Tuning.ACCENT_LEAN_SCALE;
      target.gapStrength = Tuning.ACCENT_GAP_STRENGTH;
      break;
    case GRASS_CLUSTER_DENSE_NORMAL:
    default:
      break;
  }

  target.understoryShare = lerp(
    target.understoryShare,
    habitat.underlayer,
    Tuning.HABITAT_UNDERSTORY_BLEND,
  );
  target.accentShare = clamp01(target.accentShare);
  target.understoryShare = clamp(
    target.understoryShare,
    0,
    1 - target.accentShare - Tuning.MIN_MAIN_TIER_SHARE,
  );
  target.planeCoherence = clamp(
    target.planeCoherence,
    0,
    Tuning.MAX_PLANE_COHERENCE,
  );
  target.asymmetry = clamp(target.asymmetry, 0.04, 0.3);
  target.edgeCoverage = clamp(
    target.edgeCoverage,
    Tuning.MIN_EDGE_COVERAGE,
    1,
  );
  target.coverageScale = clamp01(target.coverageScale);
  target.leanTowardMax = clamp01(target.leanTowardMax);
  target.gapStrength = clamp01(target.gapStrength);
  return target;
}

/** Stable frayed edge plus archetype-specific interior opening. */
export function resolveGrassClusterCoverage(
  profile: GrassClusterProfile,
  radialPosition: number,
  sampleAngle: number,
  gapIdentity: number,
): number {
  const edgeAmount = smoothstep(Tuning.EDGE_FADE_START, 1, radialPosition);
  const edgeCoverage = lerp(1, profile.edgeCoverage, edgeAmount);
  const interiorBand =
    smoothstep(
      Tuning.GAP_INNER_START,
      Tuning.GAP_INNER_FULL,
      radialPosition,
    ) *
    (1 -
      smoothstep(
        Tuning.GAP_OUTER_FULL,
        Tuning.GAP_OUTER_END,
        radialPosition,
      ));
  const gapWave =
    1 -
    smoothstep(
      Tuning.GAP_WAVE_START,
      Tuning.GAP_WAVE_END,
      Math.abs(Math.sin(sampleAngle * 1.5 + gapIdentity * Math.PI * 2)),
    );
  const gapActivation = smoothstep(
    Tuning.GAP_IDENTITY_START,
    Tuning.GAP_IDENTITY_END,
    gapIdentity,
  );
  const gapCoverage =
    1 - profile.gapStrength * interiorBand * gapWave * gapActivation;
  return clamp01(edgeCoverage * gapCoverage * profile.coverageScale);
}

/** Circular interpolation that never takes the long way around the unit circle. */
export function mixGrassAngle(
  independentAngle: number,
  clumpAngle: number,
  coherence: number,
): number {
  const delta = Math.atan2(
    Math.sin(clumpAngle - independentAngle),
    Math.cos(clumpAngle - independentAngle),
  );
  return independentAngle + delta * clamp01(coherence);
}
