# Procedural Stylized Stones — Phase 7 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Phase 3 contract: `docs/plans/procedural-stones-phase-3.md`
- Phase 4 contract: `docs/plans/procedural-stones-phase-4.md`
- Phase 5 contract: `docs/plans/procedural-stones-phase-5.md`
- Phase 6 contract: `docs/plans/procedural-stones-phase-6.md`
- Target branch: `main`
- Phase: 7 — world placement, terrain integration, geology, and biome presets
- Document authority: implementation contract
- Current state: completed
- Scope owner: deterministic world-space placement, environmental classification, geology correlation, terrain fitting, streamed chunk ownership, exclusion rules, collision descriptors, and world-renderer integration

This document removes implementation choices from Phase 7. The implementer must follow the file layout, public APIs, environment fields, biome catalogue, exact weights, placement-cell algorithm, cluster grammars, terrain-fitting rules, chunk ownership, exclusion contract, metadata, verification matrix, lifecycle rules, and completion criteria below. A different biome set, distribution model, ownership rule, terrain-fitting strategy, or world integration requires this document to be changed first.

## Phase objective

Place accepted Phase 6 stone LOD sets throughout the procedural world in believable, deterministic geological populations.

Phase 7 must deliver:

1. Environment sampling from terrain height, normal, path distance, altitude, moisture, drainage, coast proximity, and exposed-rock conditions.
2. Seven canonical stone biomes.
3. Biome-specific archetype, palette, density, scale, and distribution-mode weights.
4. Deterministic isolated, paired, cluster, scree, outcrop, and landmark placement grammars.
5. Shared geology direction and palette family across nearby placements.
6. Terrain fitting with controlled slope alignment and deterministic embed depth.
7. Path, gameplay-zone, and construction-zone exclusions.
8. Stable chunk ownership with no boundary duplicates or load-order dependence.
9. World-origin rebasing compatibility.
10. Collision descriptors and a deterministic query index.
11. A basic streamed runtime renderer using Phase 6 `StoneLodGroup` assets.
12. Automated placement, terrain-contact, streaming, and biome-distribution verification.
13. A fixed browser placement gallery and a world integration mode.

Phase 7 must make stones look placed by geology rather than scattered by uniform random points.

## Required dependency state

Phase 7 starts only after these gates pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
npm run test:stone-lod
```

The implementation consumes these contracts without replacing them:

- `StoneRandom`
- `mixStoneUint32`
- `StoneArchetypeId`
- `STONE_ARCHETYPE_IDS`
- `StonePaletteId`
- `STONE_PALETTE_IDS`
- `StoneLodGenerator`
- `StoneLodAssetSet`
- `StoneLodGroup`
- `StoneLodBlendState`
- `StoneProductionGenerationResult`
- `StoneQualityEvaluationResult`
- all compact Phase 1–6 metadata contracts
- `TerrainField`
- `TERRAIN_NORMAL_STEP`
- `WorldConfig`
- `RuntimeProfile`

Versions remain:

- Phase 1 core recipe: `1`
- Phase 2 archetype recipe: `1`
- Phase 3 detail recipe: `1`
- Phase 4 material recipe: `1`
- Phase 4 shader: `1`
- Phase 5 quality profile: `1`
- Phase 6 LOD recipe: `1`
- Phase 7 placement recipe: `1`
- Phase 7 environment field: `1`

## Compatibility contract

Phase 7 is additive.

Direct Phase 1–6 calls must remain unchanged. Phase 7 must not alter:

- geometry generation;
- archetype selection when explicitly requested;
- quality fallback rules;
- palette resolution;
- material shader equations;
- LOD geometry or transition thresholds;
- existing terrain height, normal, colour, path, or grass suitability results;
- existing world or island scene behavior when stones are disabled;
- existing world seed interpretation.

Phase 7 may modify `WorldApp` only to load stone placement configuration, construct `WorldStoneSystem`, update it each frame, expose diagnostics, and dispose it.

No Phase 1–6 configuration value may be changed as part of Phase 7.

## Frozen architectural decisions

1. Placement is deterministic from world seed and global placement-cell coordinates.
2. Placement does not depend on camera position, frame order, chunk load order, browser timing, or prior chunk history.
3. The placement lattice uses global 16-metre square cells.
4. Every cell resolves at most one anchor candidate.
5. Multi-stone groups are produced by one anchor through a placement-mode grammar.
6. Candidate conflict resolution is order-independent and uses deterministic priority comparisons against neighbouring cells.
7. A final stone is owned by the world chunk containing its final world-space XZ position.
8. Cluster members may be owned by different chunks.
9. Every chunk planner evaluates the expanded anchor neighbourhood required to reproduce cross-boundary members.
10. World coordinates are stored as JavaScript numbers and never derived from local rebased scene positions.
11. Scene-local position equals world position minus the current world origin.
12. Origin rebasing changes only chunk-group transforms. It never regenerates placement.
13. Phase 7 defines seven biome IDs and six placement-mode IDs. Do not add aliases.
14. Biome classification is deterministic and uses fixed score equations and canonical tie order.
15. Geology cells are 128 metres square and provide shared strike direction, palette choice bias, scale bias, and weathering bias.
16. Nearby stones in one geology cell share palette family and dominant direction but not identical archetypes or seeds.
17. Stone archetype and palette are selected through explicit integer weight tables.
18. Palette selection happens before Phase 6 generation and remains fixed across all LODs.
19. Each final placement gets one unique 32-bit generation seed.
20. Whole-stone yaw, uniform scale, embed depth, and terrain-alignment strength are placement data and do not modify the procedural asset recipe.
21. Terrain fitting never changes geometry vertices.
22. Tall archetypes preserve intentional vertical character and receive little terrain-normal alignment.
23. Small and flat archetypes align more strongly to terrain.
24. Placement is rejected rather than forced when terrain contact, slope, path clearance, exclusion, or overlap rules fail.
25. No retry loop changes a rejected placement. The planner simply omits that member.
26. Runtime generation uses Phase 6 `StoneLodGenerator` and `StoneLodGroup`.
27. Phase 7 does not cache or share generated LOD assets. Phase 8 owns caching, pooling, and instancing.
28. Every loaded placement owns one `StoneLodGroup` and its complete Phase 6 asset set.
29. Chunk unload disposes every owned LOD group.
30. The basic runtime system builds at most the configured number of stone groups per frame.
31. Collision output is a descriptor and query index. Character collision response is not added in Phase 7.
32. Collision descriptors are deterministic and derived from final world transform and LOD0 bounds.
33. Gameplay and construction exclusions use an injected pure query interface.
34. The default exclusion provider excludes nothing.
35. Walking paths are always excluded using current `TerrainField.samplePathDistances`.
36. The Phase 7 drainage field is a stable procedural field intended to be reused by future water systems. It does not render water.
37. Coast classification is based on configured sea level and terrain elevation.
38. Automated tests use CPU planning and do not require GPU rendering.
39. Browser gallery and world mode provide the real-renderer check.
40. No logging occurs in pure placement, environment, fitting, or planner classes.
41. Runtime system logs only one concise initialization summary and unexpected terminal errors.
42. No production dependency or testing framework is added.
43. Phase 7 does not implement caching, instancing, workers, impostor atlases, occlusion culling, physics response, asset export, or an authoring UI.

## In scope

- strict placement configuration;
- environmental and hydrology-like procedural fields;
- canonical biome classification;
- geology-cell correlation;
- archetype and palette weighted selection;
- placement-mode weighted selection;
- cell activation and priority;
- deterministic anchor conflict resolution;
- six group grammars;
- member seed, scale, yaw, and placement resolution;
- terrain sampling and fitting;
- path and injected-zone exclusion;
- overlap rejection;
- chunk ownership and expanded planning;
- immutable placement recipes;
- placement and chunk fingerprints;
- streamed world chunk lifecycle;
- Phase 6 LOD group update integration;
- origin rebasing API;
- collision descriptor index;
- fixed gallery and automated verification.

## Explicitly out of scope

- Phase 8 caches, shared materials, instancing, batching, workers, or streaming optimization;
- modifying procedural stone geometry for terrain contact;
- terrain decals, contact AO, dirt rings, grass bending, or vegetation removal textures;
- rendered rivers, oceans, lakes, or water shaders;
- erosion simulation;
- cave or underground placement;
- compound geological cliffs;
- destructible stones;
- player collision response;
- navmesh integration;
- construction-game placement blocking beyond the exclusion interface;
- server authority or network replication;
- save-game persistence;
- glTF export;
- manual per-stone editing;
- biome painting UI;
- screenshot-diff build gates.

## Required file changes

### New files

Create exactly:

```text
public/config/stone-placement.yaml

src/stones/placement/StonePlacementTypes.ts
src/stones/placement/StonePlacementConfig.ts
src/stones/placement/StonePlacementConfigLoader.ts
src/stones/placement/StonePlacementErrors.ts
src/stones/placement/StonePlacementCatalog.ts
src/stones/placement/StonePlacementNoise.ts
src/stones/placement/StoneEnvironmentField.ts
src/stones/placement/StoneTerrainSampler.ts
src/stones/placement/WorldTerrainStoneSampler.ts
src/stones/placement/StoneGeologyResolver.ts
src/stones/placement/StonePlacementCandidateResolver.ts
src/stones/placement/StonePlacementModeBuilder.ts
src/stones/placement/StoneTerrainFitter.ts
src/stones/placement/StonePlacementExclusionProvider.ts
src/stones/placement/StonePlacementValidator.ts
src/stones/placement/StonePlacementFingerprint.ts
src/stones/placement/StoneChunkPlanner.ts
src/stones/placement/StoneCollisionIndex.ts
src/stones/placement/StoneWorldChunk.ts
src/stones/placement/WorldStoneSystem.ts
src/stones/placement/index.ts

src/stones/qa/StonePlacementVerification.ts
src/app/StonePlacementGalleryApp.ts
scripts/verify-stone-placement.mjs
```

### Existing files to modify

Modify only:

```text
src/app/WorldApp.ts
src/main.ts
package.json
```

Do not modify `TerrainField`, `WorldConfig`, or any Phase 1–6 production file.

## Package scripts

Add:

```json
"test:stone-placement": "node scripts/verify-stone-placement.mjs"
```

Update build order:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-stone-quality.mjs && node scripts/verify-stone-lod.mjs && node scripts/verify-stone-placement.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add dependencies.

## Canonical IDs

### Biomes

Use this exact order:

```ts
export const STONE_BIOME_IDS = [
  "meadow",
  "upland",
  "mountain",
  "scree",
  "coast",
  "riverbank",
  "pathside",
] as const;

export type StoneBiomeId =
  (typeof STONE_BIOME_IDS)[number];
```

### Placement modes

Use this exact order:

```ts
export const STONE_PLACEMENT_MODE_IDS = [
  "isolated",
  "pair",
  "cluster",
  "scree",
  "outcrop",
  "landmark",
] as const;

export type StonePlacementModeId =
  (typeof STONE_PLACEMENT_MODE_IDS)[number];
```

Do not rename, reorder, or add values in Phase 7.

## Public types

`StonePlacementTypes.ts` must define:

```ts
export interface StoneWorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StoneChunkKey {
  readonly x: number;
  readonly z: number;
}

export interface StoneEnvironmentSample {
  readonly worldX: number;
  readonly worldZ: number;
  readonly height: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly slopeDegrees: number;
  readonly altitudeNormalized: number;
  readonly moisture: number;
  readonly rockExposure: number;
  readonly coastDistance: number;
  readonly riverDistance: number;
  readonly pathDistance: number;
  readonly pathVisibility: number;
  readonly biomeId: StoneBiomeId;
  readonly biomeScores: Readonly<Record<StoneBiomeId, number>>;
}

export interface StoneGeologyCell {
  readonly cellX: number;
  readonly cellZ: number;
  readonly strikeRadians: number;
  readonly scaleBias: number;
  readonly weatheringBias: number;
  readonly paletteId: StonePaletteId;
  readonly fingerprint: string;
}

export interface StonePlacementAnchor {
  readonly cellX: number;
  readonly cellZ: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly activation: number;
  readonly priority: number;
  readonly biomeId: StoneBiomeId;
  readonly modeId: StonePlacementModeId;
  readonly geology: Readonly<StoneGeologyCell>;
}

export type StoneCollisionPolicy =
  | "none"
  | "step"
  | "solid";

export interface StoneCollisionDescriptor {
  readonly placementId: string;
  readonly policy: StoneCollisionPolicy;
  readonly centreX: number;
  readonly centreZ: number;
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
  readonly height: number;
  readonly yawRadians: number;
}

export interface StonePlacementRecipe {
  readonly version: 1;
  readonly placementId: string;
  readonly anchorCellX: number;
  readonly anchorCellZ: number;
  readonly memberIndex: number;
  readonly ownerChunkX: number;
  readonly ownerChunkZ: number;
  readonly biomeId: StoneBiomeId;
  readonly modeId: StonePlacementModeId;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly stoneSeed: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly yawRadians: number;
  readonly tiltAxisX: number;
  readonly tiltAxisZ: number;
  readonly tiltRadians: number;
  readonly uniformScale: number;
  readonly embedDepth: number;
  readonly footprintRadius: number;
  readonly environment: Readonly<StoneEnvironmentSample>;
  readonly collision: Readonly<StoneCollisionDescriptor>;
  readonly fingerprint: string;
}

export interface StoneChunkPlan {
  readonly version: 1;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly worldMinimumX: number;
  readonly worldMinimumZ: number;
  readonly worldMaximumX: number;
  readonly worldMaximumZ: number;
  readonly placements: readonly Readonly<StonePlacementRecipe>[];
  readonly fingerprint: string;
}
```

Runtime diagnostics:

```ts
export interface StoneWorldRuntimeStats {
  readonly loadedChunkCount: number;
  readonly queuedChunkCount: number;
  readonly loadedPlacementCount: number;
  readonly queuedPlacementCount: number;
  readonly visibleLod0Count: number;
  readonly visibleLod1Count: number;
  readonly visibleLod2Count: number;
  readonly visibleLod3Count: number;
  readonly transitioningCount: number;
  readonly collisionDescriptorCount: number;
}
```

Every ordinary result object and array must be deeply frozen. Runtime scene objects are mutable by design and are not frozen.

## Configuration contract

Create `public/config/stone-placement.yaml` with exactly these values.

```yaml
# Phase 7 schema and world partitioning
stonePlacementConfigVersion: 1
stonePlacementRecipeVersion: 1
stonePlacementCellSize: 16
stonePlacementGeologyCellSize: 128
stonePlacementExpandedCellRadius: 2
stonePlacementBaseActivationProbability: 0.20
stonePlacementAnchorJitterFraction: 0.38
stonePlacementMinimumAnchorSpacing: 12
stonePlacementMaximumAnchorRadius: 18
stonePlacementAnalysisEpsilon: 0.00001
stonePlacementFingerprintQuantization: 0.000001

# Runtime chunk streaming
stonePlacementChunkRadiusDesktop: 3
stonePlacementChunkRadiusCompact: 2
stonePlacementChunkBuildsPerFrame: 1
stonePlacementStoneBuildsPerFrame: 2
stonePlacementUnloadMarginChunks: 1
stonePlacementEnabledByDefault: true

# Environment fields
stonePlacementSeaLevel: 0
stonePlacementCoastHalfWidth: 18
stonePlacementCoastFeather: 14
stonePlacementRiverSpacing: 480
stonePlacementRiverWidth: 9
stonePlacementRiverFeather: 16
stonePlacementRiverWarpScale: 0.0011
stonePlacementRiverWarpStrength: 190
stonePlacementMoistureScale: 0.0016
stonePlacementRockExposureSlopeStart: 18
stonePlacementRockExposureSlopeEnd: 42
stonePlacementRockExposureAltitudeStart: 55
stonePlacementRockExposureAltitudeEnd: 120
stonePlacementAltitudeNormalizationMinimum: -20
stonePlacementAltitudeNormalizationMaximum: 180

# Terrain fitting and rejection
stonePlacementMaximumSlopeDegrees: 54
stonePlacementPathClearance: 2.5
stonePlacementFitSampleRadiusScale: 0.82
stonePlacementMaximumGroundGapScale: 0.16
stonePlacementMaximumGroundPenetrationScale: 0.24
stonePlacementMinimumNormalY: 0.58
stonePlacementMinimumMemberSpacingScale: 0.72
stonePlacementMaximumExternalOverlapScale: 0.82
stonePlacementMaximumFitAttempts: 1

# Scale ranges by placement mode
stonePlacementIsolatedScaleMin: 0.72
stonePlacementIsolatedScaleMax: 1.12
stonePlacementPairScaleMin: 0.62
stonePlacementPairScaleMax: 1.00
stonePlacementClusterScaleMin: 0.48
stonePlacementClusterScaleMax: 0.88
stonePlacementScreeScaleMin: 0.28
stonePlacementScreeScaleMax: 0.62
stonePlacementOutcropScaleMin: 0.90
stonePlacementOutcropScaleMax: 1.32
stonePlacementLandmarkScaleMin: 1.35
stonePlacementLandmarkScaleMax: 1.85

# Group member counts
stonePlacementPairCount: 2
stonePlacementClusterCountMin: 3
stonePlacementClusterCountMax: 5
stonePlacementScreeCountMin: 6
stonePlacementScreeCountMax: 10
stonePlacementOutcropCountMin: 2
stonePlacementOutcropCountMax: 4
stonePlacementLandmarkCount: 1

# Group radii in metres before member scale
stonePlacementPairSpacingMin: 1.4
stonePlacementPairSpacingMax: 2.4
stonePlacementClusterRadiusMin: 2.2
stonePlacementClusterRadiusMax: 4.8
stonePlacementScreeLengthMin: 5.5
stonePlacementScreeLengthMax: 11
stonePlacementScreeWidthMin: 2
stonePlacementScreeWidthMax: 4.5
stonePlacementOutcropLengthMin: 3.5
stonePlacementOutcropLengthMax: 7.5

# Alignment and embedding
stonePlacementFlatAlignmentStrength: 0.82
stonePlacementFlatTiltMaximumDegrees: 24
stonePlacementOrganicAlignmentStrength: 0.55
stonePlacementOrganicTiltMaximumDegrees: 18
stonePlacementBlockAlignmentStrength: 0.38
stonePlacementBlockTiltMaximumDegrees: 12
stonePlacementTallAlignmentStrength: 0.16
stonePlacementTallTiltMaximumDegrees: 6
stonePlacementEmbedDepthMin: 0.035
stonePlacementEmbedDepthMax: 0.11
stonePlacementTallEmbedScale: 0.55
stonePlacementScreeEmbedScale: 1.25

# Biome density multipliers
stoneMeadowDensity: 0.55
stoneUplandDensity: 0.78
stoneMountainDensity: 0.95
stoneScreeDensity: 1.35
stoneCoastDensity: 0.82
stoneRiverbankDensity: 0.72
stonePathsideDensity: 0.42

# QA
stonePlacementVerificationChunkRadius: 5
stonePlacementVerificationWorldSeedCount: 8
stonePlacementGalleryTileSize: 42
stonePlacementGalleryColumns: 4
stonePlacementUniqueFingerprintMinimum: 1800
```

### Weight keys

For every biome prefix below, create one integer weight key for every canonical archetype, palette, and placement mode.

Prefixes:

| Biome | Prefix |
| --- | --- |
| meadow | `stoneMeadow` |
| upland | `stoneUpland` |
| mountain | `stoneMountain` |
| scree | `stoneScree` |
| coast | `stoneCoast` |
| riverbank | `stoneRiverbank` |
| pathside | `stonePathside` |

Archetype suffixes:

```text
RoundedBoulderWeight
SquashedPebbleWeight
FlatGroundStoneWeight
BroadSlabWeight
WeatheredBlockWeight
TaperedBlockWeight
WedgeWeight
LeaningShardWeight
TallMonolithWeight
TriangularPeakWeight
BroadPlatformWeight
TaperedPillarWeight
```

Palette suffixes:

```text
SlateWeight
LimestoneWeight
SandstoneWeight
VolcanicWeight
MossTintedWeight
MineralBlueWeight
WeatheredTealWeight
FantasyAmethystWeight
```

Mode suffixes:

```text
IsolatedWeight
PairWeight
ClusterWeight
ScreeWeight
OutcropWeight
LandmarkWeight
```

### Exact archetype weights

| Biome | rounded | pebble | flat | slab | weathered | tapered block | wedge | shard | monolith | peak | platform | pillar |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| meadow | 30 | 20 | 20 | 8 | 10 | 0 | 5 | 0 | 0 | 0 | 7 | 0 |
| upland | 18 | 6 | 12 | 10 | 18 | 10 | 12 | 0 | 8 | 4 | 4 | 4 |
| mountain | 8 | 0 | 0 | 4 | 12 | 8 | 10 | 12 | 18 | 14 | 4 | 10 |
| scree | 5 | 10 | 15 | 10 | 10 | 5 | 20 | 10 | 0 | 10 | 0 | 5 |
| coast | 25 | 25 | 20 | 10 | 8 | 0 | 7 | 0 | 0 | 0 | 5 | 0 |
| riverbank | 25 | 20 | 20 | 8 | 12 | 0 | 5 | 0 | 0 | 0 | 10 | 0 |
| pathside | 20 | 25 | 25 | 10 | 10 | 0 | 5 | 0 | 0 | 0 | 5 | 0 |

### Exact palette weights

| Biome | slate | limestone | sandstone | volcanic | moss | mineral blue | weathered teal | amethyst |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| meadow | 10 | 25 | 15 | 0 | 35 | 0 | 15 | 0 |
| upland | 25 | 15 | 15 | 10 | 15 | 0 | 20 | 0 |
| mountain | 35 | 10 | 0 | 25 | 5 | 10 | 10 | 5 |
| scree | 35 | 10 | 10 | 35 | 0 | 0 | 10 | 0 |
| coast | 10 | 25 | 20 | 0 | 0 | 20 | 25 | 0 |
| riverbank | 15 | 20 | 0 | 0 | 25 | 15 | 25 | 0 |
| pathside | 20 | 25 | 20 | 0 | 20 | 0 | 15 | 0 |

### Exact placement-mode weights

| Biome | isolated | pair | cluster | scree | outcrop | landmark |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| meadow | 55 | 25 | 20 | 0 | 0 | 0 |
| upland | 30 | 25 | 25 | 0 | 15 | 5 |
| mountain | 15 | 15 | 20 | 15 | 25 | 10 |
| scree | 5 | 10 | 25 | 50 | 10 | 0 |
| coast | 25 | 30 | 30 | 0 | 15 | 0 |
| riverbank | 30 | 30 | 30 | 0 | 10 | 0 |
| pathside | 55 | 30 | 15 | 0 | 0 | 0 |

Write every table value as its own flat YAML key.

## Configuration types and validation

`StonePlacementConfig.ts` must define explicit immutable groups for partitioning, runtime, environment, fitting, mode scales, mode geometry, alignment, density, QA, and biome weights.

Use:

```ts
export interface StoneIntegerWeights<T extends string> {
  readonly values: Readonly<Record<T, number>>;
  readonly total: number;
}

export interface StoneBiomePlacementProfile {
  readonly densityMultiplier: number;
  readonly archetypes: Readonly<StoneIntegerWeights<StoneArchetypeId>>;
  readonly palettes: Readonly<StoneIntegerWeights<StonePaletteId>>;
  readonly modes: Readonly<StoneIntegerWeights<StonePlacementModeId>>;
}
```

The loader must:

- use `FlatConfig.parse(source, "stone-placement")`;
- expose `load(url = "./config/stone-placement.yaml")`;
- expose `parse(source: string)` publicly;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- return recursively frozen configuration;
- reject invalid booleans, numbers, integers, weights, and relationships;
- include the invalid key or relationship in every error.

Apply these validations exactly:

1. Config and recipe versions equal `1`.
2. Cell size is a positive integer and divides the runtime world chunk size supplied to `validateWorldCompatibility`.
3. Geology cell size is a positive integer multiple of cell size.
4. Expanded radius is an integer from `1` through `4`.
5. Base activation probability is greater than `0` and at most `0.5`.
6. Anchor jitter is from `0` through `0.49`.
7. Minimum anchor spacing is positive and no larger than cell size.
8. Maximum anchor radius is positive and no larger than `expandedRadius * cellSize`.
9. Epsilon and fingerprint quantization are positive.
10. Runtime radii and build counts are positive integers.
11. Desktop radius is at least compact radius.
12. Unload margin is an integer from `0` through `4`.
13. Coast, river, moisture, exposure, and altitude ranges are finite and correctly ordered.
14. River width and feather are positive and smaller than half river spacing.
15. Maximum slope is greater than `0` and below `90`.
16. Path clearance and all fitting scales are non-negative.
17. Minimum normal Y is greater than `0` and at most `1`.
18. Fit attempt count equals `1`.
19. Every scale minimum is positive and no larger than its maximum.
20. Landmark maximum is at most `2`.
21. Pair and landmark counts equal `2` and `1`.
22. Cluster, scree, and outcrop count ranges contain positive integers.
23. Every group dimension minimum is positive and no larger than maximum.
24. Alignment strengths are from `0` through `1`.
25. Tilt maxima are greater than `0` and below `45` degrees.
26. Tall alignment and tilt are smaller than flat equivalents.
27. Embed values are positive and maximum is below `0.25`.
28. Density multipliers are positive and at most `2`.
29. Every biome has exactly twelve archetype weights, eight palette weights, and six mode weights.
30. Every weight is a non-negative integer.
31. Every archetype, palette, and mode total is positive.
32. Scree mode weight is zero outside mountain and scree biomes.
33. Landmark weight is zero outside upland and mountain.
34. Every canonical ID appears exactly once.
35. Verification counts and unique-fingerprint threshold are positive integers.

## Deterministic noise

`StonePlacementNoise.ts` implements pure allocation-free 2D value noise and FBM.

Use the same hash arithmetic as `TerrainField`:

```ts
let value = Math.imul(x, 374761393) +
  Math.imul(z, 668265263) + seed;
value = Math.imul(value ^ (value >>> 13), 1274126177);
return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
```

Use smoothstep interpolation and FBM frequency multiplier `2.03`, amplitude multiplier `0.5`.

Do not import or expose `TerrainField` private methods.

## Terrain sampler contract

`StoneTerrainSampler.ts` defines:

```ts
export interface StoneTerrainSampleTarget {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  pathDistanceMain: number;
  pathDistanceBranch: number;
  pathVisibility: number;
}

export interface StoneTerrainSampler {
  sample(
    worldX: number,
    worldZ: number,
    target: StoneTerrainSampleTarget,
  ): StoneTerrainSampleTarget;
}
```

`WorldTerrainStoneSampler` wraps `TerrainField` and reuses one internal `THREE.Vector2` and one `THREE.Vector3` scratch value.

It must call exactly:

- `sampleHeight` once;
- `sampleNormal` once;
- `samplePathDistances` once;
- `samplePathVisibility` once.

Path distance is the minimum absolute main or branch distance.

The adapter must not call grass suitability or terrain colour.

## Environment field

`StoneEnvironmentField` combines terrain samples with Phase 7 fields.

### Moisture

```text
broadMoisture = fbm(
  x * moistureScale,
  z * moistureScale,
  4,
  worldSeed + 1701
)
```

Calculate:

```text
riverMoisture = 1 - smoothstep(
  riverDistance,
  riverWidth,
  riverWidth + riverFeather
)

coastMoisture = 1 - smoothstep(
  coastDistance,
  coastHalfWidth,
  coastHalfWidth + coastFeather
)

moisture = clamp(
  broadMoisture * 0.55 +
  riverMoisture * 0.30 +
  coastMoisture * 0.15,
  0,
  1
)
```

### Coast distance

```text
coastDistance = abs(height - seaLevel)
```

### Drainage river field

Use one domain-warped zero contour.

```text
warpX = valueNoise(x * riverWarpScale, z * riverWarpScale, seed + 1801)
warpZ = valueNoise(x * riverWarpScale, z * riverWarpScale, seed + 1807)
warpedX = x + (warpX - 0.5) * riverWarpStrength
warpedZ = z + (warpZ - 0.5) * riverWarpStrength
riverValue = fbm(
  warpedX / riverSpacing,
  warpedZ / riverSpacing,
  2,
  seed + 1811
) - 0.5
```

Approximate distance by central differences with a fixed `3` metre step:

```text
riverDistance = abs(riverValue) /
  max(length(gradient), 0.000001)
```

Clamp distance to `riverWidth + riverFeather * 2`.

### Rock exposure

```text
slopeExposure = smoothstep(
  slopeDegrees,
  exposureSlopeStart,
  exposureSlopeEnd
)

altitudeExposure = smoothstep(
  height,
  exposureAltitudeStart,
  exposureAltitudeEnd
)

rockExposure = max(slopeExposure, altitudeExposure)
```

### Biome scores

Calculate exact scores:

```text
pathside =
  pathVisibility *
  (1 - smoothstep(pathDistance, 5, 11)) *
  (1 - smoothstep(slopeDegrees, 24, 42))

coast =
  (1 - smoothstep(
    coastDistance,
    coastHalfWidth,
    coastHalfWidth + coastFeather
  )) *
  (1 - smoothstep(slopeDegrees, 30, 50))

riverbank =
  (1 - smoothstep(
    riverDistance,
    riverWidth,
    riverWidth + riverFeather
  )) *
  smoothstep(coastDistance, coastHalfWidth * 0.75, coastHalfWidth * 1.5)

scree =
  smoothstep(slopeDegrees, 24, 38) *
  rockExposure *
  smoothstep(height, 48, 92)

mountain = max(
  smoothstep(height, 76, 125),
  smoothstep(slopeDegrees, 30, 48)
) * (0.65 + rockExposure * 0.35)

upland =
  smoothstep(height, 28, 76) *
  (1 - smoothstep(height, 105, 145)) *
  (1 - scree * 0.75)

meadow =
  (1 - smoothstep(height, 38, 78)) *
  (1 - smoothstep(slopeDegrees, 18, 34)) *
  (0.65 + moisture * 0.35)
```

Clamp all scores to `[0, 1]`.

Select the highest score. Tie order is canonical biome order. When every score is below `0.05`, use `meadow`.

## Geology cells

`StoneGeologyResolver` uses:

```text
geologyCellX = floor(worldX / geologyCellSize)
geologyCellZ = floor(worldZ / geologyCellSize)
```

Random root:

```ts
const root = new StoneRandom(worldSeed)
  .fork("phase-7-geology")
  .fork(`${geologyCellX}:${geologyCellZ}`);
```

Resolve:

```text
strikeRadians = root.fork("strike").range(0, π)
scaleBias = root.fork("scale").range(0.90, 1.10)
weatheringBias = root.fork("weathering").range(0.85, 1.15)
```

Palette selection uses the biome palette weights and `root.fork("palette:<biomeId>")`.

The geology palette is the default palette for every member in the cell. Individual members do not reroll palette.

Fingerprint includes version, cell coordinates, strike, biases, and palette.

## Weighted selection

Use integer cumulative selection.

```ts
const ticket = random.integer(1, totalWeight);
```

Iterate canonical IDs and return the first cumulative total greater than or equal to ticket.

Never normalize to floating probabilities.

## Placement-cell anchors

For one global placement cell:

```text
cellMinimumX = cellX * cellSize
cellMinimumZ = cellZ * cellSize
cellCentreX = cellMinimumX + cellSize / 2
cellCentreZ = cellMinimumZ + cellSize / 2
```

Root:

```ts
const root = new StoneRandom(worldSeed)
  .fork("phase-7-placement")
  .fork(`cell:${cellX}:${cellZ}`);
```

Jitter:

```text
jitterMaximum = cellSize * anchorJitterFraction
worldX = centreX + signed(jitterMaximum)
worldZ = centreZ + signed(jitterMaximum)
```

Sample environment at the jittered point.

Activation threshold:

```text
activationThreshold = clamp(
  baseActivationProbability * biomeDensityMultiplier,
  0,
  0.55
)
```

The anchor is active when:

```text
activation = root.fork("activation").nextFloat()
activation < activationThreshold
```

Priority:

```text
priority = root.fork("priority").nextFloat()
```

Mode selection uses biome mode weights and `root.fork("mode")`.

Landmark anchors are additionally active only when their priority is the highest among the 4×4 placement-cell block containing the cell. Block boundaries use mathematical floor division for negative coordinates.

## Anchor conflict resolution

An active anchor survives only when no active neighbour within the configured expanded cell radius has both:

- world-space distance smaller than `minimumAnchorSpacing`;
- a higher deterministic priority.

Priority comparison:

1. higher priority wins;
2. ties within epsilon use smaller cell X;
3. remaining tie uses smaller cell Z.

All neighbour anchors are resolved independently from global coordinates. Do not depend on planner iteration order.

## Placement-mode grammars

`StonePlacementModeBuilder` resolves member-local XZ offsets before terrain fitting.

### Isolated

- one member;
- offset `(0, 0)`;
- yaw equals geology strike plus jitter in `[-0.45, 0.45]` radians.

### Pair

- exactly two members;
- spacing uniformly in configured range;
- pair axis equals geology strike plus jitter in `[-0.22, 0.22]`;
- offsets are `±spacing / 2` on the pair axis;
- perpendicular jitter per member is at most `spacing * 0.12`;
- scale of member 1 is member 0 scale multiplied by `[0.76, 0.94]`.

### Cluster

- inclusive configured member count;
- radius uniformly in configured range;
- use golden angle `2.399963229728653`;
- member fraction is `(index + 0.5) / count`;
- radial distance is `sqrt(fraction) * radius`;
- angle is `index * goldenAngle + geologyStrike + randomSigned(0.25)`;
- centre member is not forced;
- scale decreases by up to `18%` with radial fraction.

### Scree

- inclusive configured member count;
- resolve length and width;
- downslope direction is the normalized negative XZ terrain gradient at the anchor;
- when gradient length is below epsilon, use geology strike plus `π / 2`;
- member longitudinal coordinate uses sorted random values in `[-0.5, 0.5]`;
- lateral coordinate is signed random in `[-0.5, 0.5]`;
- offsets form an ellipse of configured length and width;
- scale decreases linearly by `25%` from uphill to downhill;
- yaw follows downslope direction plus jitter `[-0.35, 0.35]`.

### Outcrop

- inclusive configured member count;
- resolve length;
- members are distributed along geology strike from `-length / 2` through `+length / 2`;
- endpoint positions are included when count is greater than one;
- perpendicular jitter maximum is `0.35` metres;
- central members are up to `18%` larger than endpoints;
- yaw follows geology strike plus jitter `[-0.12, 0.12]`.

### Landmark

- exactly one member;
- offset `(0, 0)`;
- scale from landmark range;
- yaw follows geology strike plus jitter `[-0.10, 0.10]`;
- archetype selection is restricted to `tall-monolith`, `triangular-peak`, `broad-platform`, and `tapered-pillar` using their biome archetype weights;
- when the restricted total is zero, use `tall-monolith`.

## Member identity and asset selection

For member index `i`:

```ts
const memberRoot = new StoneRandom(worldSeed)
  .fork("phase-7-placement")
  .fork(`cell:${anchorCellX}:${anchorCellZ}`)
  .fork(`member:${i}`);
```

Resolve:

- archetype from biome weights, except landmark restriction;
- stone seed from `memberRoot.fork("stone-seed").nextUint32()`;
- base scale from mode range;
- final scale equals base scale multiplied by geology scale bias and grammar scale factor;
- embed fraction from configured embed range;
- yaw from grammar;
- palette from geology cell.

Clamp final scale to `[0.25, 2]`.

Placement ID:

```text
<anchorCellX>:<anchorCellZ>:<memberIndex>
```

## Terrain alignment categories

Use these exact categories.

### Flat

- `squashed-pebble`
- `flat-ground-stone`
- `broad-platform`

Use flat alignment strength and tilt maximum.

### Organic

- `rounded-boulder`

Use organic alignment values.

### Block

- `broad-slab`
- `weathered-block`
- `tapered-block`
- `wedge`

Use block alignment values.

### Tall

- `leaning-shard`
- `tall-monolith`
- `triangular-peak`
- `tapered-pillar`

Use tall alignment values.

## Terrain fitting

`StoneTerrainFitter` receives the member's intended XZ, archetype, yaw, scale, and source LOD0 bounds.

### Footprint estimate

```text
halfWidth = lod0Width * scale * 0.5
halfDepth = lod0Depth * scale * 0.5
footprintRadius = hypot(halfWidth, halfDepth)
```

### Samples

Use nine local XZ points:

```text
(0, 0)
(+rX, 0)
(-rX, 0)
(0, +rZ)
(0, -rZ)
(+rX * 0.7071, +rZ * 0.7071)
(+rX * 0.7071, -rZ * 0.7071)
(-rX * 0.7071, +rZ * 0.7071)
(-rX * 0.7071, -rZ * 0.7071)
```

where:

```text
rX = halfWidth * fitSampleRadiusScale
rZ = halfDepth * fitSampleRadiusScale
```

Rotate samples by yaw before world sampling.

### Terrain normal and tilt

Use the centre terrain normal.

Reject when:

- slope exceeds maximum slope;
- normal Y is below minimum normal Y.

Calculate full tilt from world up to terrain normal.

```text
resolvedTilt = min(
  fullTilt * alignmentStrength,
  tiltMaximumRadians
)
```

Tilt axis is normalized:

```text
axis = normalize(cross(worldUp, terrainNormal))
```

When full tilt is below epsilon, use axis `(1, 0, 0)` and tilt `0`.

### Vertical placement

Transform the nine local support points by yaw and tilt, but not translation.

For each point calculate:

```text
requiredY = sampledTerrainHeight - transformedLocalY
```

Set:

```text
worldY = max(requiredY) - embedDepth
```

Embed depth:

```text
embedDepth =
  uniformScale *
  random.range(embedDepthMin, embedDepthMax) *
  archetypeEmbedScale *
  modeEmbedScale
```

Archetype embed scale is `tallEmbedScale` for tall category, otherwise `1`.

Mode embed scale is `screeEmbedScale` for scree mode, otherwise `1`.

### Contact validation

For every support sample after placement:

```text
gap = transformedWorldY - terrainHeight
```

Track maximum positive gap and maximum negative penetration magnitude.

Require:

```text
maximumGap <= maximumGroundGapScale * uniformScale
maximumPenetration <= maximumGroundPenetrationScale * uniformScale
```

Require centre terrain height to remain within the transformed vertical bounds of the stone.

No second fitting attempt is allowed.

## Exclusion provider

`StonePlacementExclusionProvider.ts` defines:

```ts
export interface StonePlacementExclusionQuery {
  readonly worldX: number;
  readonly worldZ: number;
  readonly radius: number;
  readonly height: number;
  readonly archetypeId: StoneArchetypeId;
}

export interface StonePlacementExclusionProvider {
  isExcluded(query: Readonly<StonePlacementExclusionQuery>): boolean;
}

export class NoStonePlacementExclusions
  implements StonePlacementExclusionProvider {
  isExcluded(): boolean;
}
```

The default implementation always returns `false`.

The planner must call the provider exactly once per fitted member.

## Placement validation

Reject a member when any condition is true:

1. terrain fitting failed;
2. path visibility is positive and path distance is less than `pathClearance + footprintRadius`;
3. exclusion provider returns true;
4. member lies outside configured world bounds supplied by the planner;
5. member overlaps an earlier member from the same anchor below `minimumMemberSpacingScale * combinedFootprintRadius`;
6. member overlaps a surviving member from another anchor below `maximumExternalOverlapScale * combinedFootprintRadius` and loses deterministic placement priority;
7. any final value is non-finite;
8. uniform scale is outside `[0.25, 2]`.

Internal member ordering is member index. Earlier members win same-anchor overlap conflicts.

External priority uses anchor priority, then placement ID lexicographic order.

## Chunk planning and ownership

`StoneChunkPlanner` constructor receives world seed, world size, chunk size, placement config, terrain sampler, environment field, exclusion provider, and Phase 6 LOD bounds provider.

API:

```ts
export class StoneChunkPlanner {
  plan(chunkX: number, chunkZ: number): StoneChunkPlan;
}
```

### World bounds

Use the existing finite world extent centred on zero:

```text
minimum = -worldSize / 2
maximum = +worldSize / 2
```

Reject placements whose footprint exceeds the world extent.

### Expanded anchor range

For a requested chunk, calculate the placement-cell range covering the chunk and expand it by `expandedCellRadius` on every side.

Resolve all anchors in that range, including their neighbour conflict checks.

Build every surviving anchor's members.

Owner chunk:

```text
ownerChunkX = floor(worldX / chunkSize)
ownerChunkZ = floor(worldZ / chunkSize)
```

Include only members owned by the requested chunk.

Sort final placements by placement ID lexicographically.

No chunk may contain duplicate placement IDs.

Planning the same chunk twice must return deeply equal recipes and identical fingerprints.

Planning adjacent chunks in either order must produce the same union.

## Placement fingerprint

Use the established dual FNV-1a byte strategy.

Placement fingerprint order:

1. recipe version;
2. placement ID;
3. anchor and owner coordinates;
4. biome canonical index;
5. mode canonical index;
6. archetype canonical index;
7. palette canonical index;
8. stone seed;
9. quantized world position;
10. quantized yaw, tilt axis, and tilt;
11. quantized scale, embed depth, and footprint;
12. collision policy and quantized descriptor;
13. environment biome scores in canonical order;
14. geology fingerprint.

Chunk fingerprint order:

1. version;
2. chunk coordinates;
3. placements in placement-ID order;
4. every placement fingerprint.

Return sixteen lowercase hexadecimal digits.

## Collision policy

Derive scaled dimensions from LOD0 bounds.

Use:

- `none` when scaled height is below `0.28`;
- `step` when height is below `0.58` and archetype is `squashed-pebble`, `flat-ground-stone`, `broad-slab`, or `broad-platform`;
- `solid` otherwise.

Descriptor:

```text
halfExtentX = width * scale * 0.42
halfExtentZ = depth * scale * 0.42
height = lod0Height * scale - embedDepth
```

Clamp height to non-negative.

`StoneCollisionIndex` uses a 16-metre spatial hash.

API:

```ts
export class StoneCollisionIndex {
  add(descriptor: Readonly<StoneCollisionDescriptor>): void;
  remove(placementId: string): void;
  queryCircle(
    worldX: number,
    worldZ: number,
    radius: number,
  ): readonly Readonly<StoneCollisionDescriptor>[];
  clear(): void;
}
```

Return descriptors sorted by placement ID. Do not resolve movement or penetration.

## Runtime world chunks

`StoneWorldChunk` extends `THREE.Group` and owns one `StoneChunkPlan`.

It stores:

- planned placement recipes;
- a build cursor;
- zero or more built `StoneLodGroup` children;
- collision descriptors for built placements;
- immutable chunk fingerprint.

Methods:

```ts
buildNext(
  lodGenerator: StoneLodGenerator,
  collisionIndex: StoneCollisionIndex,
): boolean;

update(
  camera: THREE.Camera,
  viewportHeightPixels: number,
): void;

setWorldOrigin(originX: number, originZ: number): void;

dispose(collisionIndex: StoneCollisionIndex): void;
```

`buildNext` builds one placement and returns `true` when more remain.

For each placement:

1. call Phase 6 generator with archetype, stone seed, and palette;
2. create `StoneLodGroup`;
3. apply uniform scale;
4. apply yaw around local Y;
5. apply tilt around the resolved horizontal axis in world space using quaternion composition `tilt * yaw`;
6. set group local position from world placement minus current world origin;
7. copy compact placement metadata to the group;
8. add collision descriptor to the index.

Do not modify child LOD mesh transforms.

## WorldStoneSystem

Constructor:

```ts
export class WorldStoneSystem {
  constructor(
    scene: THREE.Scene,
    terrainField: TerrainField,
    worldConfig: Readonly<WorldConfig>,
    runtimeProfile: Readonly<RuntimeProfile>,
    placementConfig: Readonly<StonePlacementConfig>,
    lodGenerator: StoneLodGenerator,
    exclusionProvider?: StonePlacementExclusionProvider,
  );

  update(
    camera: THREE.Camera,
    cameraWorldX: number,
    cameraWorldZ: number,
    viewportHeightPixels: number,
  ): void;

  setWorldOrigin(originX: number, originZ: number): void;

  getStats(): Readonly<StoneWorldRuntimeStats>;

  getCollisionIndex(): StoneCollisionIndex;

  dispose(): void;
}
```

### Runtime chunk selection

Use desktop or compact radius from placement config.

Target chunks form a square radius around camera chunk.

Queue missing chunks sorted by:

1. squared distance from camera chunk;
2. chunk X;
3. chunk Z.

Build at most `chunkBuildsPerFrame` new chunk plans and `stoneBuildsPerFrame` stone groups per update.

Unload chunks outside target radius plus unload margin.

On unload:

- remove chunk group from scene;
- dispose all LOD groups;
- remove collision descriptors;
- remove queue entries.

### Per-frame LOD update

Update all built `StoneLodGroup` objects with camera and viewport height.

Do not allocate a new stats object per stone. Aggregate counts and freeze one stats snapshot only when `getStats()` is called.

### World origin

Store origin X and Z.

Every chunk recomputes child local positions from immutable placement world coordinates when origin changes.

Calling `setWorldOrigin` repeatedly with the same values performs no work.

## WorldApp integration

`WorldApp.create` loads:

```text
./config/stone-placement.yaml?v=<APP_VERSION>
```

Construct the Phase 1–6 stone pipeline through the existing production loaders and create `WorldStoneSystem` only when placement is enabled.

Initialization must not block first world render. Start stone configuration and pipeline initialization asynchronously in the same style as grass initialization.

Until ready, world rendering continues without stones.

Frame order:

1. controls;
2. terrain streaming;
3. grass streaming;
4. stone streaming and LOD update;
5. renderer;
6. HUD.

Add `stones` to the internal frame subsystem timing union.

HUD diagnostics add one compact line with:

```text
stones <placements> · chunks <loaded>/<queued> · lod <0>/<1>/<2>/<3> · blends <count>
```

A stone initialization failure is reported separately and does not stop terrain, controls, grass, or rendering.

Dispose stones before renderer disposal.

## Fixed placement gallery

Add scene mode:

```text
?scene=stone-placement-gallery
```

Update `main.ts` scene union without changing existing modes.

The gallery contains seven terrain tiles in canonical biome order.

Each tile:

- size from config;
- one synthetic analytic height function chosen to exercise the target biome;
- one fixed world seed `42017 + biomeIndex * 101`;
- a 3×3 chunk planning area;
- visible chunk boundaries;
- placement IDs optionally shown through DOM labels;
- Phase 6 LOD groups updated from the gallery camera.

Layout uses configured column count.

Renderer:

- WebGLRenderer;
- sRGB output;
- ACES filmic tone mapping;
- directional and hemisphere lights;
- shadows enabled;
- fixed pixel ratio `1`;
- camera FOV `42`;
- no fog;
- neutral background.

Manual checklist:

- biome populations are visibly distinct;
- stones in one geology cell share directional character;
- palettes are coherent within each tile;
- no path intersections;
- no obvious grid pattern;
- pairs and clusters read as groups;
- scree elongates downslope;
- outcrops follow geology strike;
- landmarks remain sparse;
- stones sit in terrain without visible floating;
- tall stones stay mostly upright;
- chunk boundaries contain no duplicates or discontinuities;
- unload and reload preserves exact placements;
- LOD transitions remain stable while moving the camera.

## Verification script

`scripts/verify-stone-placement.mjs` uses Vite SSR.

Load:

```text
/src/stones/qa/StonePlacementVerification.ts
```

Call exactly:

```ts
await verification.verifyStonePlacement();
```

Prefix failures with:

```text
[stone-placement]
```

Print one success line containing:

- planned chunk count;
- accepted placement count;
- unique placement fingerprints;
- biome counts;
- placement-mode counts;
- maximum ground gap;
- maximum penetration;
- boundary duplicate count;
- canonical reload mismatch count.

Do not write screenshots or reports.

## Mandatory verification matrix

### Previous-phase compatibility

Run Phase 1–6 verifiers unchanged.

Importing Phase 7 modules must not change representative direct Phase 6 generation outputs, fingerprints, materials, or LOD selection states.

### Configuration tests

Verify:

- committed YAML parses;
- recursively frozen output;
- missing, duplicate, unknown, and `NaN` keys fail;
- cell size not dividing world chunk size fails compatibility validation;
- geology size not multiple of cell size fails;
- activation above `0.5` fails;
- jitter at or above `0.5` fails;
- invalid count ranges fail;
- landmark maximum above `2` fails;
- tall tilt above flat tilt fails;
- negative weight fails;
- zero weight total fails;
- scree weight outside mountain or scree fails;
- landmark weight outside upland or mountain fails;
- missing canonical weight fails;
- unique fingerprint threshold above possible verification population fails.

### Noise tests

Verify exact golden values for value noise and FBM at fixed coordinates and seeds. Record the golden values from the committed implementation in the verifier and treat any future change as a placement-version change.

Verify negative coordinates, integer boundaries, and repeated calls.

### Environment tests

Use analytic terrain samplers to verify:

- flat low moist terrain selects meadow;
- medium altitude selects upland;
- high altitude selects mountain;
- high exposed slope selects scree;
- near sea level selects coast;
- near drainage contour selects riverbank;
- near visible path selects pathside;
- canonical tie order is respected;
- every score remains in `[0, 1]`;
- all values are finite.

### Weighted selection tests

Verify:

- only positive-weight IDs can be selected;
- one non-zero entry always wins;
- ticket boundaries select exact canonical entries;
- repeated roots return identical sequences;
- all seven biome tables return valid archetypes, palettes, and modes.

### Anchor tests

For world seeds:

```text
0
1
42
42017
0xdeadbeef
0xffffffff
```

Across cells `[-8, 8]` in both axes:

- anchor resolution is deterministic;
- coordinates remain inside the configured jittered cell bounds;
- activation obeys threshold;
- priority remains in `[0, 1)`;
- landmark local-maximum rule is deterministic;
- conflict resolution is independent of iteration order;
- no surviving conflicting pair is below minimum anchor spacing.

### Placement grammar tests

For every biome, mode, and seeds `0` through `31`:

- member count is exact or inside configured range;
- IDs are unique;
- all values are finite;
- scale is inside final bounds;
- pair symmetry and spacing pass;
- cluster radii pass;
- scree elongation ratio passes;
- outcrop members align to strike;
- landmark archetype restriction passes;
- repeated generation is exact.

### Terrain-fitting fixtures

Use flat, planar slope, convex hill, concave dip, sharp ridge, and excessive-slope analytic terrain.

Verify:

- flat terrain produces zero tilt;
- tilt axis and angle match planar slope;
- flat stones align more than tall stones;
- tilt clamps at category maximum;
- embed scale differs for tall and scree;
- accepted fixtures meet gap and penetration limits;
- excessive slope rejects;
- low normal Y rejects;
- sharp ridge rejects when contact limits fail;
- no second fitting attempt occurs.

### Path and exclusion tests

Verify:

- path clearance includes footprint radius;
- invisible high-altitude paths do not exclude;
- visible paths exclude;
- default provider excludes nothing;
- custom provider called exactly once per fitted member;
- custom exclusion rejects deterministically.

### Chunk ownership tests

Plan chunks in a `[-5, 5]` square for each of eight world seeds.

Require:

- planning twice is deeply equal;
- reverse planning order gives the same union;
- each placement appears in exactly one owner chunk;
- owner coordinates equal floor division of final world coordinates;
- no duplicate placement IDs;
- every member crossing a chunk edge appears in the correct adjacent chunk;
- chunk fingerprints deterministic;
- world-boundary placements stay inside bounds;
- at least `1800` unique placement fingerprints across the full verification population;
- all seven biomes and all six modes appear;
- every archetype with a positive configured weight appears;
- every palette with a positive configured weight appears.

### Contact and overlap batch

For every accepted verification placement:

- slope and normal constraints pass;
- path and exclusion constraints pass;
- maximum gap and penetration pass;
- no invalid same-anchor overlap remains;
- no invalid external overlap remains;
- tall archetypes remain within tall tilt maximum;
- placement fingerprint matches a second calculation;
- collision policy and dimensions are valid.

### Origin rebasing tests

Build fixed chunks, then apply origins:

```text
(0, 0)
(1024, -2048)
(-4096, 8192)
(0, 0)
```

Require:

- immutable world coordinates never change;
- scene-local positions equal world minus origin;
- final return to zero is exact within epsilon;
- placement and chunk fingerprints never change;
- no asset regeneration occurs.

### Runtime lifecycle tests

Use planner and LOD-group spies.

Verify:

- nearest chunks queue first;
- chunk and stone per-frame build budgets are respected;
- existing chunks are not replanned;
- unload margin works;
- unload disposes every built group exactly once;
- collision descriptors are added and removed;
- repeated disposal is safe;
- initialization failure leaves world renderer usable;
- stats counts are correct.

### Collision index tests

Verify add, remove, clear, cell-boundary queries, negative coordinates, duplicate ID rejection, deterministic sort order, and policy filtering by caller.

## Implementation sequence

Implement in this exact order and keep TypeScript compiling after each step.

### Step 1 — Configuration, catalogue, and public types

Files:

- `stone-placement.yaml`
- `StonePlacementTypes.ts`
- `StonePlacementConfig.ts`
- `StonePlacementConfigLoader.ts`
- `StonePlacementCatalog.ts`
- `StonePlacementErrors.ts`

Checks:

- config parses;
- all exact weights consumed;
- world compatibility validation passes for chunk size `64`.

### Step 2 — Noise and terrain adapter

Files:

- `StonePlacementNoise.ts`
- `StoneTerrainSampler.ts`
- `WorldTerrainStoneSampler.ts`

Checks:

- golden noise vectors pass;
- adapter call counts exact.

### Step 3 — Environment and geology

Files:

- `StoneEnvironmentField.ts`
- `StoneGeologyResolver.ts`

Checks:

- seven biome fixtures pass;
- geology correlation and fingerprints deterministic.

### Step 4 — Anchors and group grammars

Files:

- `StonePlacementCandidateResolver.ts`
- `StonePlacementModeBuilder.ts`

Checks:

- activation and conflict resolution order-independent;
- every grammar passes its geometry constraints.

### Step 5 — Terrain fitting and exclusions

Files:

- `StoneTerrainFitter.ts`
- `StonePlacementExclusionProvider.ts`
- `StonePlacementValidator.ts`

Checks:

- terrain fixtures pass;
- path and zone exclusions exact;
- no retry added.

### Step 6 — Fingerprints and chunk planner

Files:

- `StonePlacementFingerprint.ts`
- `StoneChunkPlanner.ts`

Checks:

- chunk-order independence;
- no boundary duplicates;
- stable negative-coordinate ownership.

### Step 7 — Collision and runtime chunks

Files:

- `StoneCollisionIndex.ts`
- `StoneWorldChunk.ts`

Checks:

- collision queries pass;
- asset ownership and disposal pass.

### Step 8 — World system integration

Files:

- `WorldStoneSystem.ts`
- `src/app/WorldApp.ts`

Checks:

- asynchronous initialization;
- frame budgets respected;
- existing subsystems continue after stone failure.

### Step 9 — Gallery and verification gate

Files:

- `StonePlacementGalleryApp.ts`
- `src/main.ts`
- `StonePlacementVerification.ts`
- `scripts/verify-stone-placement.mjs`
- `package.json`

Checks:

```bash
npx tsc
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
npm run test:stone-lod
npm run test:stone-placement
npm run build
```

## Definition of done

Phase 7 is complete only when:

- all required files exist;
- all previous verification gates pass unchanged;
- exact configuration and weight tables parse strictly;
- every placement is deterministic from world seed and global coordinates;
- no chunk boundary duplicates or load-order differences exist;
- all seven biomes and six modes appear in verification;
- geology cells produce coherent palette and strike direction;
- terrain contact, tilt, gap, penetration, path, overlap, and exclusion rules pass;
- origin rebasing preserves world placement exactly;
- runtime chunk and stone build budgets are enforced;
- unload disposes all owned Phase 6 assets;
- collision descriptors and index are deterministic;
- world rendering remains functional when stone initialization fails;
- fixed gallery passes manual visual review;
- production build includes the Phase 7 gate;
- no Phase 8–10 functionality is introduced.

## Required completion report

The implementation completion note must include:

- commit hash;
- files added and modified;
- all verification commands and results;
- total verification chunks and placements;
- biome, mode, archetype, and palette counts;
- unique placement and chunk fingerprint counts;
- maximum terrain gap and penetration;
- maximum accepted slope and tilt per alignment category;
- boundary duplicate count;
- reload mismatch count;
- origin-rebase mismatch count;
- runtime lifecycle and disposal results;
- manual gallery checklist result;
- confirmation that Phase 1–6 outputs remained unchanged;
- confirmation that no caching, instancing, workers, physics response, or authoring UI was added.
