import { GRASS_MID_DENSITY_FALLOFF } from "../grass/GrassLodTuning";
import { validateHydrologyConfig } from "./hydrology/HydrologyConfigValidator";
import { createWorldHorizonAxis } from "./horizon/WorldHorizonGrid";
import { validateStoneClusterGeometry } from "./WorldConfigStoneCluster";
import type { WorldConfig } from "./WorldConfig";

const MAX_GRASS_PATCHES_PER_CHUNK_AXIS = 32;
const MAX_NEAR_GRASS_TILES_PER_CHUNK_AXIS = 32;
const MAX_SPAWN_SEARCH_STEPS_PER_RADIUS = 64;
/**
 * Triangle ceiling for the horizon shell.
 *
 * The shell is one static draw call whose whole argument is that it costs less
 * than the pop-in it removes, and the shipped 2 km world spends about 46,000
 * triangles on its streamed ring. A shell allowed to grow past this stops being
 * the cheap layer and starts competing with the terrain it backs.
 */
const MAX_HORIZON_TRIANGLES = 120000;
/**
 * Metres the canopy merge may begin before the mid density falloff completes.
 * Both schedules wander, so a hard boundary between them would fail on the tail
 * rather than on the intent.
 */
const CANOPY_MERGE_FALLOFF_SLACK = 12;

export function validateWorldConfig(config: WorldConfig): void {
  const worldChunks = config.worldSize / config.chunkSize;
  if (worldChunks < 8) {
    throw new Error("worldSize must contain at least eight terrain chunks.");
  }
  if (!Number.isInteger(worldChunks) || worldChunks % 2 !== 0) {
    throw new Error("worldSize must contain an even whole number of terrain chunks.");
  }
  if (config.terrainRadiusDesktop > worldChunks * 0.5) {
    throw new Error(
      "terrainRadiusDesktop must not exceed half of the world chunk count.",
    );
  }
  validateHorizonShell(config);

  const patchesPerChunk = config.chunkSize / config.grassPatchSize;
  if (!Number.isInteger(patchesPerChunk)) {
    throw new Error("chunkSize must be divisible by grassPatchSize.");
  }
  if (patchesPerChunk > MAX_GRASS_PATCHES_PER_CHUNK_AXIS) {
    throw new Error(
      `A chunk must not contain more than ${MAX_GRASS_PATCHES_PER_CHUNK_AXIS} grass patches per axis.`,
    );
  }
  const nearTilesPerChunk = config.chunkSize / config.grassNearTileSize;
  if (!Number.isInteger(nearTilesPerChunk)) {
    throw new Error("chunkSize must be divisible by grassNearTileSize.");
  }
  if (nearTilesPerChunk > MAX_NEAR_GRASS_TILES_PER_CHUNK_AXIS) {
    throw new Error(
      `A chunk must not contain more than ${MAX_NEAR_GRASS_TILES_PER_CHUNK_AXIS} near-grass tiles per axis.`,
    );
  }
  if (config.grassClumpRadiusScaleMin > config.grassClumpRadiusScaleMax) {
    throw new Error("grassClumpRadiusScale range is reversed.");
  }
  if (config.grassClumpAspectMin > config.grassClumpAspectMax) {
    throw new Error("grassClumpAspect range is reversed.");
  }
  if (
    config.grassClumpDominantDirectionWeight +
      config.grassClumpRadialDirectionWeight >
    0.9
  ) {
    throw new Error(
      "Clump dominant and radial direction weights must leave at least 10% " +
        "of a blade's heading to independent randomness.",
    );
  }
  if (config.grassUnderlayerFraction + config.grassAccentBladeShare > 0.78) {
    throw new Error(
      "Grass understory and accent shares must leave at least 22% for the main tier.",
    );
  }
  if (
    !(
      config.grassUnderstoryHeightScale < config.grassMainHeightScale &&
      config.grassMainHeightScale < config.grassAccentHeightScale
    )
  ) {
    throw new Error(
      "Grass tier height scales must increase from understory to main to accent.",
    );
  }
  if (
    config.detailFoliageClumpWorldSize >
    config.detailFoliageColonyWorldSize * 0.5
  ) {
    throw new Error(
      "detailFoliageClumpWorldSize must be at most half of detailFoliageColonyWorldSize.",
    );
  }
  if (config.grassRenderBatchesPerAxis > patchesPerChunk) {
    throw new Error(
      "grassRenderBatchesPerAxis must not exceed the patches per chunk axis.",
    );
  }
  if (
    config.terrainNearResolution <= config.terrainMidResolution ||
    config.terrainMidResolution <= config.terrainFarResolution
  ) {
    throw new Error("Terrain resolutions must decrease from near to far.");
  }
  const nearCells = config.terrainNearResolution - 1;
  const midCells = config.terrainMidResolution - 1;
  const farCells = config.terrainFarResolution - 1;
  if (nearCells % midCells !== 0 || midCells % farCells !== 0) {
    throw new Error(
      "Terrain LOD cell counts must divide evenly to preserve chunk edges.",
    );
  }
  if (config.terrainRadiusCompact > config.terrainRadiusDesktop) {
    throw new Error("Compact terrain radius must not exceed the desktop radius.");
  }
  if (config.grassRadiusCompact > config.grassRadiusDesktop) {
    throw new Error("Compact grass radius must not exceed the desktop radius.");
  }
  if (
    config.grassRadiusDesktop > config.terrainRadiusDesktop ||
    config.grassRadiusCompact > config.terrainRadiusCompact
  ) {
    throw new Error("Grass streaming radius must not exceed terrain radius.");
  }
  if (config.pathGrassEdgeRoughness <= config.pathEdgeRoughness) {
    throw new Error(
      "pathGrassEdgeRoughness must exceed pathEdgeRoughness: trampling makes the vegetation boundary more irregular than the mineral one, not less.",
    );
  }
  if (config.pathBranchWidth > config.pathWidth) {
    throw new Error("pathBranchWidth must not exceed pathWidth.");
  }
  if (config.stoneRadiusCompact > config.stoneRadiusDesktop) {
    throw new Error("Compact stone radius must not exceed the desktop radius.");
  }
  if (
    config.stoneRadiusDesktop > config.terrainRadiusDesktop ||
    config.stoneRadiusCompact > config.terrainRadiusCompact
  ) {
    throw new Error("Stone streaming radius must not exceed terrain radius.");
  }
  if (config.stoneDetailRadius > config.stoneRadiusDesktop) {
    throw new Error("stoneDetailRadius must not exceed stoneRadiusDesktop.");
  }
  if (
    config.stoneDetailRadiusCompact > config.stoneDetailRadius ||
    config.stoneDetailRadiusCompact > config.stoneRadiusCompact
  ) {
    throw new Error(
      "stoneDetailRadiusCompact must fit inside compact and desktop stone detail radii.",
    );
  }
  validateStoneClusters(config);
  if (config.pathWidth >= config.pathSpacing * 0.05) {
    throw new Error("pathWidth must stay far below pathSpacing.");
  }

  validateHydrologyConfig(config);

  if (config.grassMinAltitude >= config.grassMaxAltitude) {
    throw new Error("grassMinAltitude must be lower than grassMaxAltitude.");
  }
  if (
    config.grassNearDistance >= config.grassMidDistance ||
    config.grassMidDistance >= config.grassFarDistance
  ) {
    throw new Error("Grass LOD distances must increase from near to far.");
  }
  if (config.grassTransitionDistance >= config.grassNearDistance) {
    throw new Error("grassTransitionDistance must be lower than grassNearDistance.");
  }
  if (
    config.grassHysteresisDistance >=
    config.grassNearDistance - config.grassTransitionDistance
  ) {
    throw new Error("grassHysteresisDistance is too large for the near band.");
  }
  if (
    config.grassUltraNearTransitionDistance >= config.grassUltraNearDistance
  ) {
    throw new Error(
      "grassUltraNearTransitionDistance must be lower than grassUltraNearDistance.",
    );
  }
  if (
    config.grassUltraNearDistance + config.grassUltraNearTransitionDistance >
    config.grassNearDistance - config.grassTransitionDistance
  ) {
    throw new Error(
      "The complete ultra-near fade must end before the normal near-LOD fade begins.",
    );
  }
  if (
    config.grassNearDensityBoostTransition >=
    config.grassNearDensityBoostDistance
  ) {
    throw new Error(
      "grassNearDensityBoostTransition must be lower than grassNearDensityBoostDistance.",
    );
  }
  if (
    config.grassNearDensityBoostDistance -
      config.grassNearDensityBoostTransition <
    config.grassUltraNearDistance + config.grassUltraNearTransitionDistance
  ) {
    throw new Error(
      "The density boost must still be at full strength where the ultra-near layer ends.",
    );
  }
  if (
    config.grassNearDensityBoostDistance +
      config.grassNearDensityBoostTransition >
    config.grassNearDistance - config.grassTransitionDistance
  ) {
    throw new Error(
      "The density boost must decay away before the near-to-mid fade begins.",
    );
  }
  if (
    config.grassNearBridgeTransitionDistance >= config.grassNearBridgeDistance
  ) {
    throw new Error(
      "grassNearBridgeTransitionDistance must be lower than grassNearBridgeDistance.",
    );
  }
  if (
    config.grassNearBridgeDistance - config.grassNearBridgeTransitionDistance <
    config.grassUltraNearDistance + config.grassUltraNearTransitionDistance
  ) {
    throw new Error(
      "The bridge LOD must start after the ultra-near detail fade has completed.",
    );
  }
  if (
    config.grassNearBridgeDistance + config.grassNearBridgeTransitionDistance >
    config.grassNearDistance - config.grassTransitionDistance
  ) {
    throw new Error(
      "The bridge LOD handoff must complete before the near-to-mid fade starts.",
    );
  }

  if (config.grassMicroDetailFadeStart >= config.grassMicroDetailFadeEnd) {
    throw new Error(
      "grassMicroDetailFadeStart must be lower than grassMicroDetailFadeEnd.",
    );
  }
  if (config.grassMicroDetailFadeEnd >= config.grassNearBridgeDistance) {
    throw new Error(
      "The micro-detail fade must complete inside the exact-placement near band.",
    );
  }

  validateTerrainDistanceSchedules(config);
  validateCommunityField(config);

  validateGrassStreamRadius("desktop", config.grassRadiusDesktop, config);
  validateGrassStreamRadius("compact", config.grassRadiusCompact, config);

  if (
    config.flyMinSpeed > config.flySpeed ||
    config.flySpeed > config.flyMaxSpeed
  ) {
    throw new Error("flySpeed must be between flyMinSpeed and flyMaxSpeed.");
  }
  if (config.spawnSearchStep > config.spawnSearchRadius) {
    throw new Error("spawnSearchStep must not exceed spawnSearchRadius.");
  }
  if (
    config.spawnSearchRadius / config.spawnSearchStep >
    MAX_SPAWN_SEARCH_STEPS_PER_RADIUS
  ) {
    throw new Error(
      `spawnSearchRadius must not exceed ${MAX_SPAWN_SEARCH_STEPS_PER_RADIUS} spawnSearchStep intervals.`,
    );
  }
  if (config.spawnNeighborhoodRadius >= config.chunkSize * 0.5) {
    throw new Error("spawnNeighborhoodRadius must be lower than half a chunk.");
  }
  if (config.spawnSearchRadius > config.worldSize * 0.5 - config.chunkSize) {
    throw new Error("spawnSearchRadius must remain inside the world bounds.");
  }
  if (
    config.grassBladesPerSquareMeterCompact >
    config.grassBladesPerSquareMeterDesktop
  ) {
    throw new Error("Compact grass patch density must not exceed desktop density.");
  }
  if (
    config.grassNearBladesPerSquareMeterCompact >
    config.grassNearBladesPerSquareMeterDesktop
  ) {
    throw new Error(
      "Compact single-blade density must not exceed desktop density.",
    );
  }
  if (
    config.grassNearBladesPerSquareMeterDesktop !==
      config.grassBladesPerSquareMeterDesktop ||
    config.grassNearBladesPerSquareMeterCompact !==
      config.grassBladesPerSquareMeterCompact
  ) {
    throw new Error(
      "Single-blade and patch LOD densities must match for a continuous handoff.",
    );
  }
  if (patchesPerChunk % config.grassRenderBatchesPerAxis !== 0) {
    throw new Error(
      "grassRenderBatchesPerAxis must divide the patches per chunk axis evenly.",
    );
  }
  if (
    config.grassLandingPulseRadius >= config.grassNearDistance ||
    config.grassFootContactRadius >= config.grassNearDistance ||
    config.grassBodyContactRadius >= config.grassNearDistance
  ) {
    throw new Error("Grass interaction radii must be lower than grassNearDistance.");
  }
  if (config.grassLandingPulseRadius >= config.grassTrailCoverage * 0.5) {
    throw new Error(
      "grassLandingPulseRadius must fit inside half of grassTrailCoverage.",
    );
  }
  if (
    config.grassTrailCoverage * 0.5 >=
    config.grassNearDistance - config.characterCameraMaxDistance
  ) {
    throw new Error(
      "Half of grassTrailCoverage must stay inside the interactive near band " +
        "(grassNearDistance minus characterCameraMaxDistance).",
    );
  }
  const trailTexelSize = config.grassTrailCoverage / config.grassTrailResolution;
  if (config.grassFootContactRadius < trailTexelSize) {
    throw new Error(
      "grassFootContactRadius must be at least one grass trail texel " +
        "(grassTrailCoverage / grassTrailResolution).",
    );
  }
  if (config.characterWalkSpeed >= config.characterRunSpeed) {
    throw new Error("characterWalkSpeed must be lower than characterRunSpeed.");
  }
  if (
    config.characterJumpHoldGravityScale >= config.characterFallGravityMultiplier
  ) {
    throw new Error(
      "Jump-hold gravity must remain below the falling gravity multiplier.",
    );
  }
  if (
    config.characterCameraMinDistance > config.characterCameraDistance ||
    config.characterCameraDistance > config.characterCameraMaxDistance
  ) {
    throw new Error(
      "characterCameraDistance must be between its minimum and maximum.",
    );
  }
  if (config.characterCameraDistance + 1.5 > config.grassUltraNearDistance) {
    throw new Error(
      "characterCameraDistance must keep the hero inside the ultra-near grass band.",
    );
  }
  if (
    config.characterCameraMinElevationDegrees >=
    config.characterCameraElevationDegrees ||
    config.characterCameraElevationDegrees >=
    config.characterCameraMaxElevationDegrees
  ) {
    throw new Error(
      "Character camera elevation must be between its minimum and maximum.",
    );
  }
  validateFauna(config);
}

/**
 * Formation lookup is a fixed 3x3 of macro cells. These inequalities are the
 * geometric proof that a formation two indices away cannot reach a stone cell
 * even after maximum center jitter, so production never needs a wider search.
 */
function validateStoneClusters(config: WorldConfig): void {
  validateStoneClusterGeometry(config);
}

/**
 * The quality bands have to be a ladder, or an actor can never resolve a level.
 *
 * Culling also has to happen inside the radius herds are collected over —
 * otherwise animals are streamed in already too far away to animate, and the
 * population silently costs more than it shows.
 */
function validateFauna(config: WorldConfig): void {
  if (config.faunaEnabled < 1) {
    return;
  }
  if (
    !(config.faunaFullDistance < config.faunaReducedDistance) ||
    !(config.faunaReducedDistance < config.faunaMinimalDistance) ||
    !(config.faunaMinimalDistance < config.faunaCullDistance)
  ) {
    throw new Error(
      "fauna animation LOD distances must increase from full to culled.",
    );
  }
  if (config.faunaCullDistance > config.faunaStreamRadius) {
    throw new Error("faunaCullDistance must not exceed faunaStreamRadius.");
  }
  if (config.faunaMinimalUpdateHz > config.faunaReducedUpdateHz) {
    throw new Error(
      "faunaMinimalUpdateHz must not exceed faunaReducedUpdateHz.",
    );
  }
}

/**
 * The shell's grid lines must land on the same coordinates the streamed chunks
 * sample, so that where the two meshes share a vertex they agree exactly rather
 * than to within a rounding error. The remaining checks bound cost and enforce
 * minimum coverage.
 */
/**
 * The ground's distance schedules, and the ordering that keeps them from
 * stacking back into the ring they were separated to remove.
 *
 * `verify-lod-band-separation` enforces the full conflict-class rules across
 * every schedule in the renderer; these are the ones expressible from world
 * config alone, so they fail at load rather than at build.
 */
function validateTerrainDistanceSchedules(config: WorldConfig): void {
  const ranges: readonly [string, number, number][] = [
    ["terrainMicroDetail", config.terrainMicroDetailStart, config.terrainMicroDetailEnd],
    ["terrainMesoDetail", config.terrainMesoDetailStart, config.terrainMesoDetailEnd],
    ["terrainCanopyMerge", config.terrainCanopyMergeStart, config.terrainCanopyMergeEnd],
  ];
  for (const [label, start, end] of ranges) {
    if (start >= end) {
      throw new Error(`${label}Start must be lower than ${label}End.`);
    }
  }
  if (config.terrainMicroDetailEnd > config.terrainMesoDetailStart) {
    throw new Error(
      "The terrain micro-detail fade must complete before meso detail begins to fade.",
    );
  }
  if (config.terrainMesoDetailEnd > config.terrainCanopyMergeEnd) {
    throw new Error(
      "Meso mottling must not outlive the canopy merge that replaces the ground it varies.",
    );
  }
  // The ground may only start reading as canopy once the blades have actually
  // thinned. Keyed to the mid layer's density falloff rather than to the near
  // handoff, which is the mistake this whole separation exists to undo. The
  // slack absorbs the falloff's own jittered tail.
  if (
    config.terrainCanopyMergeStart <
    GRASS_MID_DENSITY_FALLOFF.end - CANOPY_MERGE_FALLOFF_SLACK
  ) {
    throw new Error(
      "terrainCanopyMergeStart must not precede the mid density falloff's completion.",
    );
  }
}

/**
 * The community field is carried to the ground one value per terrain vertex, so
 * its period has to stay above twice the coarsest vertex spacing, or the distant
 * ground loses exactly the structure the field exists to give it.
 *
 * This is the same Nyquist argument that moved the 19 m vigour field to a
 * per-fragment evaluation. The community field does not need that treatment: at
 * the shipped 64 m chunk and far resolution 7 the vertex spacing is 10.67 m
 * against a 26 m period, which resolves comfortably. But that holds only while
 * the numbers stay in that relationship, and nothing else would notice if they
 * stopped.
 */
function validateCommunityField(config: WorldConfig): void {
  const farVertexSpacing =
    config.chunkSize / Math.max(1, config.terrainFarResolution - 1);
  const required = 2.1 * farVertexSpacing;
  if (config.grassCommunityWorldSize < required) {
    throw new Error(
      `grassCommunityWorldSize must be at least ${required.toFixed(1)} m to survive the far terrain ring's ${farVertexSpacing.toFixed(2)} m vertex spacing.`,
    );
  }
  // Two structural fields at nearby scales read as mud rather than as either.
  const macro = config.grassMacroPatchWorldSize;
  const separation =
    Math.abs(config.grassCommunityWorldSize - macro) /
    Math.max(1, Math.min(config.grassCommunityWorldSize, macro));
  if (separation < 0.25) {
    throw new Error(
      "grassCommunityWorldSize and grassMacroPatchWorldSize must differ by at least 25%.",
    );
  }
  if (
    config.grassCommunityWarpDistance >=
    config.grassCommunityWorldSize * 0.75
  ) {
    throw new Error(
      "grassCommunityWarpDistance must stay below 75% of grassCommunityWorldSize.",
    );
  }
}

function validateHorizonShell(config: WorldConfig): void {
  if (config.horizonEnabled < 1) {
    return;
  }
  const axis = createWorldHorizonAxis(
    config.worldSize,
    config.horizonSpacing,
    config.horizonApronRings,
    config.horizonApronGrowth,
  );
  const cells = axis.size - 1;
  const triangles = cells * cells * 2;
  if (triangles > MAX_HORIZON_TRIANGLES) {
    throw new Error(
      `The horizon shell would cost ${triangles} triangles, above the ${MAX_HORIZON_TRIANGLES} ceiling.`,
    );
  }
  const requiredApronReach =
    (Math.max(config.terrainRadiusDesktop, config.terrainRadiusCompact) + 1) *
    config.chunkSize;
  const apronReach = axis.outerHalfExtent - config.worldSize * 0.5;
  if (apronReach < requiredApronReach - 1e-3) {
    throw new Error(
      `The horizon apron must extend at least ${requiredApronReach} metres beyond the world edge.`,
    );
  }
}

function validateGrassStreamRadius(
  profile: "desktop" | "compact",
  radius: number,
  config: WorldConfig,
): void {
  const fadeEnd = radius * config.chunkSize;
  if (fadeEnd - config.grassTransitionDistance <= config.grassMidDistance) {
    throw new Error(
      `${profile} grass radius is too small for the configured mid LOD and transition.`,
    );
  }
}
