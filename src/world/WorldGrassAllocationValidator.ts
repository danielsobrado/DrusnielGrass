import { resolveGrassPlacementGrid } from "./grass/GrassClumpLattice";
import { resolveGrassRosetteExpansion } from "./grass/GrassRuntimeMath";
import type { WorldConfig } from "./WorldConfig";

/**
 * Absolute allocation ceilings for valid-but-pathological world tuning.
 *
 * The shipped world uses 1,344 source blades per patch and reserves a worst
 * near-field stack of 20,967 blade slots per tile after rosette expansion.
 * These limits leave tuning headroom while preventing a large patch/tile from
 * turning one build job or draw stack into an unbounded allocation.
 */
export const MAX_GRASS_SOURCE_BLADES_PER_PATCH = 8_192;
export const MAX_GRASS_MID_TRIANGLES_PER_RENDER_BATCH = 500_000;
export const MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE = 40_000;

export function validateWorldGrassAllocationConfig(config: WorldConfig): void {
  const patchDensity = Math.max(
    config.grassBladesPerSquareMeterDesktop,
    config.grassBladesPerSquareMeterCompact,
  );
  const sourceBladesPerPatch = Math.max(
    1,
    Math.round(config.grassPatchSize ** 2 * patchDensity),
  );
  if (sourceBladesPerPatch > MAX_GRASS_SOURCE_BLADES_PER_PATCH) {
    throw new Error(
      `A grass patch would allocate ${sourceBladesPerPatch} source blades, above the ${MAX_GRASS_SOURCE_BLADES_PER_PATCH} safety ceiling.`,
    );
  }

  const patchesPerChunkAxis = config.chunkSize / config.grassPatchSize;
  const patchesPerBatchAxis =
    patchesPerChunkAxis / config.grassRenderBatchesPerAxis;
  const patchesPerBatch = patchesPerBatchAxis ** 2;
  const midBladesPerPatch = Math.max(
    1,
    Math.round(sourceBladesPerPatch * config.grassMidBladeFraction),
  );
  const midTrianglesPerBatch = midBladesPerPatch * patchesPerBatch;
  if (midTrianglesPerBatch > MAX_GRASS_MID_TRIANGLES_PER_RENDER_BATCH) {
    throw new Error(
      `A grass render batch would submit ${midTrianglesPerBatch} mid triangles, above the ${MAX_GRASS_MID_TRIANGLES_PER_RENDER_BATCH} safety ceiling.`,
    );
  }

  const desktopNearStack = resolveNearStackedBladeCount(
    config.grassNearTileSize,
    config.grassNearBladesPerSquareMeterDesktop,
    config.grassUltraNearDensityMultiplier,
    config.grassRosetteChance,
  );
  const compactNearStack = resolveNearStackedBladeCount(
    config.grassNearTileSize,
    config.grassNearBladesPerSquareMeterCompact,
    config.grassUltraNearDensityMultiplierCompact,
    config.grassRosetteChance,
  );
  const nearStackedBlades = Math.max(desktopNearStack, compactNearStack);
  if (nearStackedBlades > MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE) {
    throw new Error(
      `A near-grass tile stack would reserve ${nearStackedBlades} blade slots, above the ${MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE} safety ceiling.`,
    );
  }
}

function resolveNearStackedBladeCount(
  tileSize: number,
  density: number,
  ultraMultiplier: number,
  rosetteChance: number,
): number {
  const baseCapacity = resolveNearPopulationCapacity(
    tileSize,
    density,
    1,
    rosetteChance,
  );
  const additionalMultiplier = Math.max(0, ultraMultiplier - 1);
  if (additionalMultiplier === 0) {
    return baseCapacity;
  }

  // The extra population is visible in both the segmented ultra-near layer and
  // the one-triangle density-boost layer during their handoff. Charge both draw
  // representations even though they reuse the same placement data.
  const additionalCapacity = resolveNearPopulationCapacity(
    tileSize,
    density,
    additionalMultiplier,
    rosetteChance,
  );
  return baseCapacity + additionalCapacity * 2;
}

function resolveNearPopulationCapacity(
  tileSize: number,
  density: number,
  densityMultiplier: number,
  rosetteChance: number,
): number {
  const requestedCount = resolveGrassPlacementGrid(
    tileSize,
    density,
    densityMultiplier,
  ).requestedCount;
  return Math.ceil(
    requestedCount * resolveGrassRosetteExpansion(rosetteChance),
  );
}
