import {
  LATTICE_KEY_OFFSET,
  STONE_CELL_SOURCE_MARGIN,
  clusterMinimumSeparation,
  maxNormalizedReach,
} from "./stones/StoneClusterTuning";
import { STONE_PATH_DISTANCE_PLATEAU } from "./stones/StonePathPlacement";
import type { WorldConfig } from "./WorldConfig";

/** Geometric proofs for the fixed macro neighborhoods used by stone placement. */
export function validateStoneClusterGeometry(config: WorldConfig): void {
  const epsilon = 1e-6;
  if (config.stoneClusterRadiusMin >= config.stoneClusterRadiusMax) {
    throw new Error("stoneClusterRadiusMin must be lower than stoneClusterRadiusMax.");
  }
  if (config.stoneClusterAspectMin > config.stoneClusterAspectMax) {
    throw new Error("stoneClusterAspect range is reversed.");
  }
  if (config.stoneClusterBudgetMin > config.stoneClusterBudgetMax) {
    throw new Error("stoneClusterBudget range is reversed.");
  }
  if (config.stoneClusterCoreRatio >= config.stoneClusterShoulderRatio) {
    throw new Error(
      "stoneClusterCoreRatio must be lower than stoneClusterShoulderRatio.",
    );
  }
  if (config.stoneClusterShoulderRatio >= config.stoneClusterHaloRatio) {
    throw new Error(
      "stoneClusterShoulderRatio must be lower than stoneClusterHaloRatio.",
    );
  }
  if (config.stoneFormationGapRatioMin > config.stoneFormationGapRatioMax) {
    throw new Error("stoneFormationGapRatio range is reversed.");
  }
  if (!Number.isInteger(config.chunkSize / config.stoneCellSize)) {
    throw new Error("chunkSize must be divisible by stoneCellSize.");
  }

  const halfWorld = config.worldSize * 0.5;
  const maxCellIndex =
    Math.ceil(halfWorld / config.stoneCellSize) + STONE_CELL_SOURCE_MARGIN;
  const maxMacroIndex =
    Math.ceil(halfWorld / config.stoneClusterSpacing) + 2;
  if (
    maxCellIndex >= LATTICE_KEY_OFFSET ||
    maxMacroIndex >= LATTICE_KEY_OFFSET
  ) {
    throw new Error(
      "World size exceeds the packed stone-lattice coordinate range.",
    );
  }

  const spacing = config.stoneClusterSpacing;
  const circularInfluence =
    config.stoneClusterRadiusMax * config.stoneClusterHaloRatio;
  if (circularInfluence > spacing * 0.5 + epsilon) {
    throw new Error(
      "stoneClusterRadiusMax * stoneClusterHaloRatio must not exceed half of stoneClusterSpacing.",
    );
  }

  const maxInfluenceRadius =
    config.stoneClusterRadiusMax *
    maxNormalizedReach(config.stoneClusterHaloRatio);
  const queryReach = maxInfluenceRadius + config.stoneCellSize * 0.5;
  const nearestUnqueriedCenter =
    spacing * (1.5 - config.stoneClusterCenterJitter);
  if (queryReach >= nearestUnqueriedCenter - epsilon) {
    throw new Error(
      "Stone cluster footprint, jitter, and cell size must stay inside the fixed 3x3 macro query.",
    );
  }

  const sourceCellHalfDiagonal = config.stoneCellSize * Math.SQRT1_2;
  if (sourceCellHalfDiagonal >= STONE_PATH_DISTANCE_PLATEAU - epsilon) {
    throw new Error(
      "stoneCellSize must keep any path crossing a source cell inside the path-distance plateau.",
    );
  }

  const nearestTwoAwayCenter =
    spacing * (2 - 2 * config.stoneClusterCenterJitter);
  const maxConflictDistance = clusterMinimumSeparation(
    spacing,
    maxInfluenceRadius,
    maxInfluenceRadius,
  );
  if (nearestTwoAwayCenter <= maxConflictDistance + epsilon) {
    throw new Error(
      "Stone cluster conflict suppression must stay inside immediate macro neighbors.",
    );
  }
}
