# Procedural Stylized Stones — Phase 6 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Phase 3 contract: `docs/plans/procedural-stones-phase-3.md`
- Phase 4 contract: `docs/plans/procedural-stones-phase-4.md`
- Phase 5 contract: `docs/plans/procedural-stones-phase-5.md`
- Target branch: `main`
- Phase: 6 — LOD generation and visual continuity
- Document authority: implementation contract
- Current state: completed
- Scope owner: recipe-linked mesh LODs, semantic and material continuity, projected-size selection, dithered transitions, shadow policy, deterministic validation, and LOD gallery QA

This document removes implementation choices from Phase 6. The implementer must follow the file layout, public APIs, source reconstruction rules, plane-reduction algorithm, semantic remapping, detail-reduction policy, material reuse policy, continuity thresholds, runtime selection equations, dither shader, shadow policy, verification matrix, lifecycle rules, and completion criteria below. A different simplifier, LOD count, transition strategy, threshold model, material policy, or QA scene requires this document to be changed first.

## Phase objective

Generate four deterministic visual representations of every accepted Phase 5 production stone while preserving its identity, ground contact, dominant planes, palette, and material hierarchy.

Phase 6 must deliver:

1. **LOD0** — the exact Phase 5 accepted production asset.
2. **LOD1** — a reduced mesh that keeps the major silhouette, major cuts, all important semantic regions, and up to four surface details.
3. **LOD2** — a compact mesh that keeps the footprint, dimensions, dominant planes, major palette regions, and up to two broad surface details.
4. **LOD3** — a very low-poly mesh proxy that keeps the footprint, overall proportions, lean, top character, and semantic palette, with no analytic surface details.
5. A projected-screen-size runtime selector.
6. Complementary dithered transitions between adjacent levels.
7. A deterministic shadow-LOD policy.
8. Automated geometry, semantic, material, and transition continuity checks.
9. A fixed browser gallery for real-renderer inspection.

All levels must be derived from the same accepted effective seed and the same final Phase 3 stone recipe. LODs must not be generated as independent random stones.

## Required dependency state

Phase 6 starts only after these gates pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
```

The implementation consumes these contracts without replacing them:

- `StoneCoreGenerator`
- `StoneCoreBuildArtifact`
- `StoneHalfSpaceClipper`
- `StoneMeshCleanup`
- `StoneTriangulator`
- `StoneNormalBuilder`
- `StoneGeometryValidator`
- `StoneGeometryMetrics`
- `StoneRecipe`
- `StonePlane`
- `StonePlaneRole`
- `StoneRandom`
- `StoneDetailedGenerator`
- `StoneDetailedGenerationResult`
- `StoneDetailRecipe`
- `StoneSurfaceDetail`
- `StoneSemanticModel`
- `StoneSemanticRegion`
- `StoneSemanticClassifier`
- `StoneRegionUvBuilder`
- `StoneSurfaceDetailUniformPacker`
- `StonePaletteId`
- `STONE_PALETTE_IDS`
- `StoneMaterialConfig`
- `StoneMaterialRecipe`
- `StoneMaterialFingerprints`
- `StoneResolvedPalette`
- `StoneStylizedMaterial`
- `createStoneToonGradientTexture`
- `StoneProductionGenerator`
- `StoneProductionGenerationResult`
- `StoneQualityEvaluationResult`
- `StoneArchetypeId`
- `STONE_ARCHETYPE_IDS`
- all compact Phase 1–5 metadata contracts

Versions remain:

- Phase 1 core recipe: `1`
- Phase 2 archetype recipe: `1`
- Phase 3 detail recipe: `1`
- Phase 4 material recipe: `1`
- Phase 4 shader: `1`
- Phase 5 quality profile: `1`
- Phase 6 LOD recipe: `1`
- Phase 6 transition shader: `1`

## Compatibility contract

Phase 6 is additive.

The existing Phase 1–5 APIs must produce exactly the same outputs when called directly. Phase 6 must not change:

- accepted effective seed selection;
- production quality evaluation;
- LOD0 positions, normals, indices, attributes, bounds, material recipe, palette, shader, quality metrics, or fingerprints;
- Phase 1–5 configuration values;
- Phase 1–5 retry and fallback behavior;
- Phase 3 semantic and detail recipes;
- Phase 4 material response equations.

Phase 6 may wrap the accepted LOD0 material with the Phase 6 dither-transition patch. The patch must be inert when coverage is `1`, so a standalone LOD0 render remains visually identical to the Phase 5 asset.

Phase 6 adds only `geometry.userData.stoneLod` and `material.userData.stoneLod` to generated LOD assets. It must preserve all earlier compact metadata objects.

## Frozen architectural decisions

The following decisions are final:

1. Every stone has exactly four mesh LODs numbered `0` through `3`.
2. LOD0 is the exact accepted Phase 5 geometry and material. It is not regenerated or simplified.
3. LOD1–LOD3 are generated from the accepted final Phase 3 convex core recipe and semantic model.
4. LOD1–LOD3 are not generated from independent seeds.
5. LOD generation is deterministic and CPU-side.
6. The simplifier is a semantic-aware convex plane reducer.
7. Do not use generic QEM decimation, meshoptimizer, vertex clustering, marching cubes, SDF remeshing, voxel extraction, or a third-party simplification dependency.
8. The reducer reconstructs final-space source face planes, selects a bounded semantic subset, intersects those half-spaces, then applies deterministic anchored dimension normalization.
9. Selected LOD faces retain their source plane ID, source semantic, source region key, and source material variation.
10. A lower LOD never invents a new semantic category.
11. A lower LOD region key is always a stable source region key from LOD0.
12. LOD-local region IDs remain contiguous and may differ between levels.
13. Surface details are filtered by source region key and importance. They are never randomly regenerated for a lower LOD.
14. LOD1 supports at most four surface details.
15. LOD2 supports at most two broad details and never keeps hairline cracks.
16. LOD3 supports no surface details.
17. The same resolved palette and the same global material value and saturation scales are used at every level.
18. Per-region material variation is copied by stable region key from the LOD0 material recipe.
19. No lower LOD resolves new material random values.
20. All lower LOD materials use the Phase 4 `StoneStylizedMaterial` and the same five-step toon gradient.
21. Every LOD material owns its gradient texture in Phase 6. Texture sharing is deferred to Phase 8.
22. Every LOD geometry is a separate owned `THREE.BufferGeometry`.
23. LOD3 is a mesh proxy. Phase 6 does not bake or use impostors.
24. Impostor evaluation is deferred until Phase 8 has real world-density and performance measurements.
25. LOD selection is based on projected bounding-sphere radius in pixels, not fixed world distance.
26. Only adjacent LODs may be visible simultaneously.
27. Transitions use one fixed 4×4 Bayer threshold function and complementary coverage.
28. No alpha blending or transparency is used.
29. Visible materials are dithered; shadow materials are not dithered.
30. Exactly one level casts a shadow at a time.
31. LOD3 never casts a shadow.
32. LOD0–LOD2 continue to receive shadows.
33. Crossfade state does not change geometry transforms.
34. All LODs share the same object transform and local origin.
35. Every LOD has exact `minY = 0` within Phase 1 ground tolerance.
36. Every lower LOD is recentered so its support-polygon centroid is `(0, 0)` in XZ.
37. Lower LOD dimensions are normalized to the LOD0 width, height, and depth.
38. Dimension normalization is anchored at `y = 0` and never moves the ground plane.
39. Plane-reduction candidates are tried in a fixed finite order.
40. Failure to build a valid lower LOD is a typed generation error. Phase 6 does not return a missing level.
41. Runtime LOD selection does not regenerate assets.
42. Phase 6 does not add world placement, terrain alignment, biome selection, streaming, caches, instancing, workers, collision, export, or authoring controls.
43. Wall-clock timings are recorded in verification but are not hard build gates.
44. Internal LOD generation classes do not log.
45. Automated verification does not depend on screenshots or GPU timing.
46. The browser gallery is required for shader compilation and real-renderer visual review.
47. Phase 6 adds no production dependency and no testing framework.

## In scope

Phase 6 includes:

- strict LOD configuration;
- accepted-source reconstruction from the Phase 5 effective seed;
- exact final core recipe reconstruction;
- final-space source-plane extraction;
- semantic plane salience scoring;
- protected plane selection;
- bounded plane budgets and shrink attempts;
- convex half-space proxy generation;
- anchored dimension normalization;
- local support-centroid recentering;
- LOD semantic model creation;
- stable source-region mapping;
- source-region UV projection;
- deterministic surface-detail filtering and region remapping;
- lower-LOD geometry decoration;
- lower-LOD material creation with exact palette and variation continuity;
- per-level geometry, semantic, detail, material, and asset fingerprints;
- LOD-set fingerprint;
- projected-size selection;
- transition-state calculation;
- shader dither patching;
- shadow selection;
- runtime LOD group ownership and disposal;
- continuity analysis and validation;
- fixed LOD gallery scene;
- production build verification gate.

## Explicitly out of scope

Do not implement:

- impostor baking;
- billboard rendering;
- atlas generation;
- runtime asset caching;
- shared gradient textures;
- material pooling;
- instancing;
- multi-draw;
- WebGPU-specific LOD code;
- worker-thread generation;
- asynchronous background simplification;
- chunk streaming;
- terrain placement;
- terrain-normal alignment;
- origin rebasing;
- biome or geology presets;
- collision meshes;
- occlusion culling;
- distance culling;
- screen-space outlines;
- alpha blending;
- temporal reprojection;
- stochastic temporal transitions;
- screenshot-diff build gates;
- LOD authoring UI;
- manual per-stone LOD overrides;
- changes to Phase 1–5 algorithms or configuration.

## Required file changes

### New files

Create exactly:

```text
public/config/stone-lod.yaml

src/stones/lod/StoneLodTypes.ts
src/stones/lod/StoneLodConfig.ts
src/stones/lod/StoneLodConfigLoader.ts
src/stones/lod/StoneLodErrors.ts
src/stones/lod/StoneLodCatalog.ts
src/stones/lod/StoneLodSourceResolver.ts
src/stones/lod/StoneLodPlaneExtractor.ts
src/stones/lod/StoneLodPlaneScorer.ts
src/stones/lod/StoneLodPlaneSelector.ts
src/stones/lod/StoneLodPlaneReducer.ts
src/stones/lod/StoneLodGeometryNormalizer.ts
src/stones/lod/StoneLodSemanticBuilder.ts
src/stones/lod/StoneLodDetailReducer.ts
src/stones/lod/StoneLodGeometryDecorator.ts
src/stones/lod/StoneLodMaterialBuilder.ts
src/stones/lod/StoneLodContinuityAnalyzer.ts
src/stones/lod/StoneLodValidator.ts
src/stones/lod/StoneLodFingerprint.ts
src/stones/lod/StoneLodGenerator.ts
src/stones/lod/StoneLodDitherShader.ts
src/stones/lod/StoneLodMaterialPatcher.ts
src/stones/lod/StoneProjectedSize.ts
src/stones/lod/StoneLodSelector.ts
src/stones/lod/StoneLodGroup.ts
src/stones/lod/index.ts

src/stones/qa/StoneLodVerification.ts
src/app/StoneLodGalleryApp.ts
scripts/verify-stone-lod.mjs
```

### Existing files to modify

Modify only:

```text
src/main.ts
package.json
```

Do not modify Phase 1–5 production files.

## Package scripts

Add:

```json
"test:stone-lod": "node scripts/verify-stone-lod.mjs"
```

Update build order:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-stone-quality.mjs && node scripts/verify-stone-lod.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add a dependency.

## Public types

`StoneLodTypes.ts` must define these exact contracts.

```ts
export type StoneLodLevel = 0 | 1 | 2 | 3;

export interface StoneLodPlaneSource {
  readonly faceIndex: number;
  readonly planeId: string;
  readonly planeRole: StonePlaneRole;
  readonly sourceRegionId: number;
  readonly sourceRegionKey: string;
  readonly semantic: StoneFaceSemantic;
  readonly semanticCode: number;
  readonly flags: number;
  readonly normal: Readonly<StoneVec3>;
  readonly constant: number;
  readonly area: number;
  readonly areaRatio: number;
  readonly centroid: Readonly<StoneVec3>;
  readonly salience: number;
  readonly protectedOrder: number | null;
}

export interface StoneLodRegion {
  readonly regionId: number;
  readonly sourceRegionId: number;
  readonly regionKey: string;
  readonly sourcePlaneId: string;
  readonly semantic: StoneFaceSemantic;
  readonly semanticCode: number;
  readonly flags: number;
  readonly area: number;
  readonly areaRatio: number;
  readonly centroid: Readonly<StoneVec3>;
  readonly normal: Readonly<StoneVec3>;
  readonly sharedIndices: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface StoneLodSemanticModel {
  readonly version: 1;
  readonly level: StoneLodLevel;
  readonly regions: readonly Readonly<StoneLodRegion>[];
  readonly sourceRegionKeys: readonly string[];
  readonly fingerprint: string;
}

export interface StoneLodGeometryMetrics {
  readonly activePlaneCount: number;
  readonly sharedVertexCount: number;
  readonly renderedVertexCount: number;
  readonly polygonCount: number;
  readonly triangleCount: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly volume: number;
  readonly footprintArea: number;
  readonly supportCentroidX: number;
  readonly supportCentroidZ: number;
}

export interface StoneLodContinuityMetrics {
  readonly widthRelativeDelta: number;
  readonly heightRelativeDelta: number;
  readonly depthRelativeDelta: number;
  readonly volumeRelativeDelta: number;
  readonly footprintAreaRelativeDelta: number;
  readonly supportCentroidShiftRatio: number;
  readonly topSilhouetteAreaRelativeDelta: number;
  readonly frontSilhouetteAreaRelativeDelta: number;
  readonly sideSilhouetteAreaRelativeDelta: number;
  readonly maximumSilhouetteHausdorffRatio: number;
  readonly dominantTopNormalDot: number;
  readonly dominantSideNormalDot: number;
  readonly dominantCutNormalDot: number | null;
}

export interface StoneLodFingerprints {
  readonly geometryFingerprint: string;
  readonly semanticFingerprint: string;
  readonly detailFingerprint: string;
  readonly materialFingerprint: string;
  readonly assetFingerprint: string;
}

export interface StoneLodLevelAsset {
  readonly level: StoneLodLevel;
  readonly geometry: THREE.BufferGeometry;
  readonly material: StoneStylizedMaterial;
  readonly semanticModel:
    Readonly<StoneLodSemanticModel> | Readonly<StoneSemanticModel>;
  readonly surfaceDetails:
    readonly Readonly<StoneSurfaceDetail>[];
  readonly geometryMetrics: Readonly<StoneLodGeometryMetrics>;
  readonly continuity:
    Readonly<StoneLodContinuityMetrics> | null;
  readonly fingerprints: Readonly<StoneLodFingerprints>;
}

export interface StoneLodAssetSet {
  readonly version: 1;
  readonly requestedSeed: number;
  readonly effectiveSeed: number;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly productionFingerprint: string;
  readonly lodSetFingerprint: string;
  readonly quality: Readonly<StoneQualityEvaluationResult>;
  readonly levels: readonly [
    StoneLodLevelAsset,
    StoneLodLevelAsset,
    StoneLodLevelAsset,
    StoneLodLevelAsset,
  ];
}

export interface StoneLodBlendState {
  readonly highLevel: StoneLodLevel;
  readonly lowLevel: StoneLodLevel;
  readonly highCoverage: number;
  readonly lowCoverage: number;
  readonly transitioning: boolean;
  readonly primaryLevel: StoneLodLevel;
  readonly shadowLevel: StoneLodLevel | null;
  readonly projectedRadiusPixels: number;
}
```

Import Three.js and runtime classes only where required. Pure geometry and configuration modules must not import Three.js.

Every returned ordinary object and ordinary array must be deeply frozen. Typed arrays are owned and treated as immutable after construction.

## Configuration contract

### File

Create:

```text
public/config/stone-lod.yaml
```

Parse through:

```ts
FlatConfig.parse(source, "stone-lod")
```

### Exact committed values

```yaml
# Phase 6 schema
stoneLodConfigVersion: 1
stoneLodRecipeVersion: 1
stoneLodTransitionShaderVersion: 1
stoneLodLevelCount: 4
stoneLodSourceBoundsMarginScale: 2.5
stoneLodAnalysisEpsilon: 0.00001
stoneLodFingerprintQuantization: 0.000001

# Deterministic inward-shift attempts
stoneLodShrinkAttemptCount: 5
stoneLodShrinkFraction0: 0
stoneLodShrinkFraction1: 0.004
stoneLodShrinkFraction2: 0.008
stoneLodShrinkFraction3: 0.012
stoneLodShrinkFraction4: 0.016

# LOD1 active-plane candidates
stoneLod1PlaneBudgetCount: 4
stoneLod1PlaneBudget0: 20
stoneLod1PlaneBudget1: 22
stoneLod1PlaneBudget2: 24
stoneLod1PlaneBudget3: 26
stoneLod1TriangleMaximum: 92
stoneLod1SurfaceDetailMaximum: 4

# LOD2 active-plane candidates
stoneLod2PlaneBudgetCount: 5
stoneLod2PlaneBudget0: 11
stoneLod2PlaneBudget1: 12
stoneLod2PlaneBudget2: 13
stoneLod2PlaneBudget3: 14
stoneLod2PlaneBudget4: 15
stoneLod2TriangleMaximum: 48
stoneLod2SurfaceDetailMaximum: 2

# LOD3 active-plane candidates
stoneLod3PlaneBudgetCount: 4
stoneLod3PlaneBudget0: 7
stoneLod3PlaneBudget1: 8
stoneLod3PlaneBudget2: 9
stoneLod3PlaneBudget3: 10
stoneLod3TriangleMaximum: 28
stoneLod3SurfaceDetailMaximum: 0

# LOD1 continuity limits
stoneLod1VolumeDeltaMaximum: 0.08
stoneLod1FootprintDeltaMaximum: 0.03
stoneLod1SupportCentroidShiftMaximum: 0.02
stoneLod1SilhouetteAreaDeltaMaximum: 0.04
stoneLod1SilhouetteHausdorffMaximum: 0.035
stoneLod1DominantNormalDotMinimum: 0.98

# LOD2 continuity limits
stoneLod2VolumeDeltaMaximum: 0.15
stoneLod2FootprintDeltaMaximum: 0.06
stoneLod2SupportCentroidShiftMaximum: 0.035
stoneLod2SilhouetteAreaDeltaMaximum: 0.08
stoneLod2SilhouetteHausdorffMaximum: 0.065
stoneLod2DominantNormalDotMinimum: 0.95

# LOD3 continuity limits
stoneLod3VolumeDeltaMaximum: 0.25
stoneLod3FootprintDeltaMaximum: 0.10
stoneLod3SupportCentroidShiftMaximum: 0.06
stoneLod3SilhouetteAreaDeltaMaximum: 0.14
stoneLod3SilhouetteHausdorffMaximum: 0.11
stoneLod3DominantNormalDotMinimum: 0.90

# Source-region UV tolerance
stoneLodRegionUvExcursionMaximum: 0.08

# Projected-radius boundaries in pixels
stoneLodBoundary01Pixels: 120
stoneLodBoundary12Pixels: 48
stoneLodBoundary23Pixels: 18
stoneLodTransition01HalfWidthPixels: 18
stoneLodTransition12HalfWidthPixels: 8
stoneLodTransition23HalfWidthPixels: 4
stoneLodHysteresis01Pixels: 6
stoneLodHysteresis12Pixels: 3
stoneLodHysteresis23Pixels: 1.5

# Runtime and QA
stoneLodDitherMatrixSize: 4
stoneLodGalleryColumns: 5
stoneLodVerificationSeedCount: 32
stoneLodUniqueSetFingerprintMinimum: 370
```

### Configuration types

`StoneLodConfig.ts` must define explicit immutable groups:

```ts
export interface StoneLodPlaneBudgetConfig {
  readonly budgets: readonly number[];
  readonly triangleMaximum: number;
  readonly surfaceDetailMaximum: number;
}

export interface StoneLodContinuityLimit {
  readonly volumeDeltaMaximum: number;
  readonly footprintDeltaMaximum: number;
  readonly supportCentroidShiftMaximum: number;
  readonly silhouetteAreaDeltaMaximum: number;
  readonly silhouetteHausdorffMaximum: number;
  readonly dominantNormalDotMinimum: number;
}

export interface StoneLodTransitionConfig {
  readonly boundary01Pixels: number;
  readonly boundary12Pixels: number;
  readonly boundary23Pixels: number;
  readonly transition01HalfWidthPixels: number;
  readonly transition12HalfWidthPixels: number;
  readonly transition23HalfWidthPixels: number;
  readonly hysteresis01Pixels: number;
  readonly hysteresis12Pixels: number;
  readonly hysteresis23Pixels: number;
  readonly ditherMatrixSize: number;
}

export interface StoneLodConfig {
  readonly version: 1;
  readonly recipeVersion: 1;
  readonly transitionShaderVersion: 1;
  readonly levelCount: 4;
  readonly sourceBoundsMarginScale: number;
  readonly analysisEpsilon: number;
  readonly fingerprintQuantization: number;
  readonly shrinkFractions: readonly number[];
  readonly levels: Readonly<{
    readonly 1: Readonly<StoneLodPlaneBudgetConfig>;
    readonly 2: Readonly<StoneLodPlaneBudgetConfig>;
    readonly 3: Readonly<StoneLodPlaneBudgetConfig>;
  }>;
  readonly continuity: Readonly<{
    readonly 1: Readonly<StoneLodContinuityLimit>;
    readonly 2: Readonly<StoneLodContinuityLimit>;
    readonly 3: Readonly<StoneLodContinuityLimit>;
  }>;
  readonly regionUvExcursionMaximum: number;
  readonly transition: Readonly<StoneLodTransitionConfig>;
  readonly galleryColumns: number;
  readonly verificationSeedCount: number;
  readonly uniqueSetFingerprintMinimum: number;
}
```

### Loader requirements

`StoneLodConfigLoader` must:

- expose `load(url = "./config/stone-lod.yaml")`;
- expose `parse(source: string)` publicly for verification;
- use `FlatConfig`;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- reject non-finite numbers;
- reject non-integer integer fields;
- return a recursively frozen config;
- identify the invalid key or relationship in every error.

Apply these validations exactly:

1. All versions equal `1`.
2. Level count equals `4`.
3. Source-bounds margin scale is greater than `1` and at most `10`.
4. Analysis epsilon and fingerprint quantization are positive.
5. Fingerprint quantization is not smaller than analysis epsilon divided by `100`.
6. Shrink attempt count equals `5`.
7. Exactly five shrink fractions are consumed.
8. Shrink fractions are ascending, non-negative, and at most `0.05`.
9. The first shrink fraction equals `0`.
10. Each plane-budget count matches the number of consumed budget values.
11. Plane budgets are strictly ascending integers.
12. LOD1 budgets are from `12` through `32`.
13. LOD2 budgets are from `8` through `20`.
14. LOD3 budgets are from `6` through `12`.
15. Every LOD3 budget is smaller than every LOD2 maximum budget.
16. Every LOD2 budget is smaller than every LOD1 maximum budget.
17. Triangle maxima are positive integers.
18. LOD1 triangle maximum is greater than LOD2 maximum.
19. LOD2 triangle maximum is greater than LOD3 maximum.
20. Surface-detail maxima equal `4`, `2`, and `0` for LOD1–LOD3.
21. All continuity deltas and shifts are greater than `0` and less than `1`.
22. Dominant-normal dot minima are greater than `0` and at most `1`.
23. LOD1 continuity is stricter than LOD2 for every maximum-delta field.
24. LOD2 continuity is stricter than LOD3 for every maximum-delta field.
25. LOD1 normal-dot minimum is greater than LOD2.
26. LOD2 normal-dot minimum is greater than LOD3.
27. UV excursion maximum is non-negative and at most `0.25`.
28. Boundaries are strictly descending and positive.
29. Transition half-widths are positive and smaller than half the adjacent boundary separation.
30. Hysteresis values are non-negative and smaller than the corresponding transition half-width.
31. Dither matrix size equals `4`.
32. Gallery columns equals `5`.
33. Verification seed count is an integer from `1` through `256`.
34. Unique set fingerprint minimum is positive and at most `verificationSeedCount * 12`.

## Source reconstruction

`StoneLodSourceResolver` owns the accepted-source reconstruction contract.

API:

```ts
export interface StoneLodSource {
  readonly production: StoneProductionGenerationResult;
  readonly detailed: StoneDetailedGenerationResult;
  readonly finalCoreRecipe: Readonly<StoneRecipe>;
  readonly finalCoreArtifact: Readonly<StoneCoreBuildArtifact>;
}

export class StoneLodSourceResolver {
  constructor(
    productionGenerator: StoneProductionGenerator,
    detailedGenerator: StoneDetailedGenerator,
    coreGenerator: StoneCoreGenerator,
  );

  resolve(
    archetypeId: StoneArchetypeId,
    requestedSeed: number,
    paletteId: StonePaletteId,
  ): StoneLodSource;
}
```

Perform this exact sequence:

1. Generate the accepted Phase 5 production result.
2. Read its effective seed.
3. Regenerate one Phase 3 detailed result with the same archetype and effective seed.
4. Require the detailed result asset fingerprint to equal the Phase 4 material recipe source asset fingerprint from the production result.
5. Reconstruct the final core recipe from `detailed.archetypeRecipe.coreRecipe`.
6. Copy the base cuts in original order.
7. Append every Phase 3 geometric detail in detail-recipe order as a core cut with its existing ID, normal, and depth fraction.
8. Preserve dimensions, profile, normal mode, crease angle, seed, attempt, and recipe version.
9. Deep-freeze the reconstructed recipe.
10. Build a core artifact through `coreGenerator.buildArtifactFromRecipe`.
11. Require its fingerprint to equal `detailed.geometryFingerprint`.
12. Require its metrics to match the detailed result core metrics within Phase 1 tolerance.
13. Return the source.

Ownership:

- the production geometry and material become LOD0 and remain owned by the returned LOD set;
- the regenerated detailed geometry is temporary and must be disposed after all lower-LOD source data has been copied;
- immutable detailed recipes and semantic data remain valid after geometry disposal.

A mismatch is `SOURCE_RECONSTRUCTION_FAILED`. Do not continue with an approximate source.

## Final-space plane extraction

`StoneLodPlaneExtractor` consumes the final core artifact and Phase 3 semantic model.

For every shared source face:

1. Read polygon positions in face order.
2. Calculate the final outward Newell normal.
3. Normalize it.
4. Calculate `constant = dot(normal, firstPosition)`.
5. Verify every polygon point lies on the plane within analysis epsilon.
6. Verify every source shared position is inside the half-space within Phase 1 convexity tolerance.
7. Resolve source region by `plane:${planeId}`.
8. Copy semantic code, flags, area, area ratio, centroid, source region ID, and region key.
9. Create one `StoneLodPlaneSource`.

Reject:

- surviving `seed-bound` faces;
- duplicate plane IDs;
- missing source semantic regions;
- non-unit normals;
- non-convex source relationships.

Plane-source order equals final core shared-face order.

## Protected plane order

`StoneLodPlaneScorer` resolves one protected order per source plane.

Create the protected list in this exact order, deduplicating by plane ID while preserving first occurrence:

1. the `underside` region;
2. the dominant top region, or the largest-area `top`, then `upper`, then top-facing `cut` region;
3. the horizontal support owner for direction `+X`;
4. the horizontal support owner for direction `-X`;
5. the horizontal support owner for direction `+Z`;
6. the horizontal support owner for direction `-Z`;
7. the dominant side region;
8. the dominant cut region;
9. the first region adjacent to the dominant ridge edge;
10. the second region adjacent to the dominant ridge edge;
11. the positive-Y support owner.

Null entries are skipped.

### Support-owner resolution

For one direction:

1. Find the maximum shared-position projection.
2. Collect all shared vertices within analysis epsilon of that maximum.
3. Collect incident source faces containing any collected vertex.
4. Exclude `underside` for horizontal and positive-Y directions.
5. Score each candidate face by:

```text
normalAlignment * 0.60 + areaRatio * 0.40
```

where `normalAlignment = max(0, dot(faceNormal, direction))`.

6. Choose the highest score.
7. Break ties within analysis epsilon by region key lexicographic order.

For horizontal directions, require selected normal horizontal magnitude greater than `0.20`.

## Plane salience

Calculate salience for every source plane:

Semantic base score:

| Semantic | Base |
| --- | ---: |
| underside | 100 |
| top | 9 |
| cut | 8 |
| upper | 7 |
| detail-cut | 6.5 |
| side | 5 |
| contact | 4 |

Add:

```text
areaScore = areaRatio * 10
```

Add `4` when the region has the Phase 3 dominant flag.

Add `1` when the region has the Phase 3 top-facing flag.

Add ridge adjacency:

```text
maximumAdjacentEligibleEdgeDetailScore * 3
```

Add `0.75` for every one of the five support-owner directions selecting this face.

Add `1.5` when at least one retained LOD0 surface detail targets the region.

Protected planes receive their protected order but retain the numeric salience for diagnostics.

Non-protected sort order:

1. salience descending;
2. area descending;
3. region key lexicographic ascending.

## Plane selection

`StoneLodPlaneSelector` selects one prefix for a requested active-plane budget.

1. Add protected planes in protected-order sequence until the list ends or budget is reached.
2. Add non-protected planes in salience order until budget is reached.
3. Never add the same plane twice.
4. Require one underside plane.
5. Require one plane with normal Y greater than `0.35`.
6. Require horizontal directional coverage:

```text
max dot(normalXZ, +X) >= 0.45
max dot(normalXZ, -X) >= 0.45
max dot(normalXZ, +Z) >= 0.45
max dot(normalXZ, -Z) >= 0.45
```

7. When a coverage condition fails, replace the lowest-salience non-protected plane with the best omitted plane for that direction.
8. Process replacement directions in `+X`, `-X`, `+Z`, `-Z` order.
9. Revalidate all coverage after replacements.
10. If a required replacement would remove a protected plane or still fails, reject this budget candidate.

Do not exceed the requested budget.

## Plane-reduction candidate construction

`StoneLodPlaneReducer` tries candidates in this exact nested order:

1. active-plane budgets ascending;
2. shrink fractions ascending.

The first candidate passing all Phase 1 geometry checks and Phase 6 continuity checks is accepted.

### Starting polyhedron

Build one axis-aligned box around the LOD0 exact bounds.

For each axis:

```text
margin = sourceMaxDimension * sourceBoundsMarginScale
minimum = sourceMinimum - margin
maximum = sourceMaximum + margin
```

Use `seed-bound` role only for the starting-box polygons.

No seed-bound polygon may survive the completed candidate.

### Shifted planes

For every selected source plane:

```text
shiftDistance = shrinkFraction * sourceMaxDimension
```

Use:

- underside plane: original constant unchanged;
- every other plane: `shiftedConstant = originalConstant - shiftDistance`.

Preserve source plane ID and plane role.

Apply selected planes in this exact order:

1. underside;
2. contact roles in source-face order;
3. side roles in source-face order;
4. upper/top-bevel roles in source-face order;
5. top role;
6. primary cuts in source-face order;
7. detail cuts in source-face order;
8. any remaining selected role in source-face order.

Use the existing Phase 1 half-space clipper and cleanup tolerances.

### Candidate rejection before normalization

Reject when:

- the polyhedron is empty;
- any seed-bound polygon survives;
- no underside polygon exists;
- more than one underside polygon exists;
- polygon count exceeds the selected plane count;
- any polygon is below Phase 1 minimum area;
- candidate bounds are non-finite or non-positive;
- any vertex is below negative Phase 1 ground tolerance.

## Anchored dimension normalization

`StoneLodGeometryNormalizer` normalizes every valid reduced candidate.

1. Snap vertices within Phase 1 ground tolerance to exact `y = 0`.
2. Calculate candidate exact bounds.
3. Calculate source exact width, height, and depth from LOD0.
4. Calculate:

```text
scaleX = sourceWidth / candidateWidth
scaleY = sourceHeight / candidateHeight
scaleZ = sourceDepth / candidateDepth
```

5. Apply:

```text
x = x * scaleX
y = y * scaleY
z = z * scaleZ
```

6. Scaling is anchored at origin and `y = 0`.
7. Snap ground vertices again.
8. Build the exact XZ convex hull of underside vertices.
9. Calculate its area-weighted centroid.
10. Subtract that centroid X and Z from every vertex.
11. Do not recenter Y.
12. Snap ground vertices again.
13. Rebuild shared mesh cleanup, triangulation, selective normals, metrics, and Phase 1 validation.

After normalization require:

- width, height, and depth relative deltas at most `0.000001`;
- exact ground minimum Y within Phase 1 tolerance;
- support centroid X and Z within analysis epsilon of zero;
- positive signed volume;
- closed, connected, convex, manifold mesh;
- triangle count at most the level maximum.

Do not rotate the candidate.

## LOD semantic construction

`StoneLodSemanticBuilder` maps every normalized reduced face to its selected source plane.

1. Match by preserved plane ID.
2. Reject an unmatched or duplicate plane ID.
3. Preserve source region key, source region ID, semantic, semantic code, and semantic flags.
4. Recalculate final area, area ratio, centroid, normal, shared indices, and triangle indices.
5. Assign LOD-local region IDs in final face order from zero.
6. Store source region keys in local-region order.
7. Preserve dominant and orientation flags from source regions.
8. Clear no Phase 3 flag.
9. A selected source detail-cut remains `detail-cut` even when no surface detail survives on it.

The lower LOD semantic fingerprint serializes:

- version;
- level;
- local region ID;
- source region ID;
- source region key;
- semantic code;
- flags;
- quantized area, centroid, and normal;
- polygon indices;
- source plane ID.

Use the Phase 1 dual FNV-1a strategy.

## Region UV continuity

Lower LOD UVs use the LOD0 source-region basis and extents.

For every lower-LOD vertex on a mapped face:

1. Read the LOD0 semantic region basis by source region key.
2. Project the normalized lower-LOD position relative to the LOD0 basis origin.
3. Convert to normalized padded UV using the LOD0 stored minimum and maximum U and V and the Phase 3 padding formula.
4. Do not recompute per-LOD UV extents.
5. Allow values inside:

```text
[-regionUvExcursionMaximum, 1 + regionUvExcursionMaximum]
```

6. Clamp accepted values to `[0, 1]` for the final attribute.
7. Reject larger excursions.

This keeps surviving detail coordinates and broad material features anchored to the same source region space.

## Surface-detail reduction

`StoneLodDetailReducer` filters the final Phase 3 surface-detail array.

### Allowed kinds

| Level | Allowed kinds | Maximum |
| --- | --- | ---: |
| 0 | all Phase 3 kinds | 6 |
| 1 | all Phase 3 kinds | 4 |
| 2 | `weathering-band`, `broad-groove` | 2 |
| 3 | none | 0 |

A detail is eligible only when its target source region key exists in the lower LOD semantic model.

### Importance score

Kind base score:

| Kind | Base |
| --- | ---: |
| weathering-band | 4 |
| broad-groove | 3 |
| shallow-recess | 2 |
| hairline-crack | 1 |

Calculate normalized feature size:

- groove: `lengthUv * max(sourceRegionSpanU, sourceRegionSpanV) / sourceMaxDimension`;
- band: `widthUv * min(sourceRegionSpanU, sourceRegionSpanV) / sourceMaxDimension`;
- crack: polyline endpoint distance in world-scaled region space divided by source max dimension;
- recess: `2 * min(radiusU * spanU, radiusV * spanV) / sourceMaxDimension`.

Clamp feature size to `[0, 1]`.

Score:

```text
kindBase + strength * 2 + featureSize
```

Add `1` when the target source region has the dominant flag.

Sort:

1. score descending;
2. original Phase 3 descriptor index ascending.

Take the configured maximum.

Return descriptors in original Phase 3 array order, not score order.

### Region remapping

Clone each retained descriptor as plain data and replace only:

```text
targetRegionId = LOD-local region ID
```

Preserve:

- ID;
- kind;
- target region key;
- strength;
- UV coordinates;
- directions;
- dimensions;
- crack points.

Deep-freeze the reduced array.

LOD1 must keep at least one descriptor when the source contains at least one descriptor whose target region survives. LOD2 may keep zero when no allowed target survives. LOD3 always keeps zero.

## Lower-LOD geometry decoration

`StoneLodGeometryDecorator` creates the lower-LOD `THREE.BufferGeometry`.

Triangles from different polygon faces must not share rendered vertices.

Use vertex split key:

```text
<sharedVertexIndex>:<lodRegionId>
```

Add exactly:

```text
position
normal
stoneRegionId
stoneSemantic
stoneRegionUv
stoneFaceNormal
stoneFaceFlags
stoneMaterialVariation
```

Do not add:

```text
uv
color
tangent
stoneBarycentric
```

Attribute contracts match Phase 3 and Phase 4:

- `position`: `Float32BufferAttribute`, item size `3`;
- `normal`: `Float32BufferAttribute`, item size `3`;
- `stoneRegionId`: `Uint8BufferAttribute`, item size `1`, not normalized;
- `stoneSemantic`: `Uint8BufferAttribute`, item size `1`, not normalized;
- `stoneRegionUv`: `Float32BufferAttribute`, item size `2`;
- `stoneFaceNormal`: `Float32BufferAttribute`, item size `3`;
- `stoneFaceFlags`: `Uint8BufferAttribute`, item size `1`, not normalized;
- `stoneMaterialVariation`: `Float32BufferAttribute`, item size `2`.

### Material variation mapping

For every LOD-local region:

1. Find the Phase 4 LOD0 material recipe variation by source region key.
2. Require exactly one match.
3. Copy its value and saturation multipliers to every vertex in the local region.

Do not resolve new random values.

Call bounding-box and bounding-sphere computation.

Copy compact metadata:

```text
stone
stoneArchetype
stoneDetails
stoneMaterial
stoneQuality
```

Then add compact LOD metadata after fingerprints are calculated.

## Lower-LOD material construction

`StoneLodMaterialBuilder` creates one `StoneStylizedMaterial` per lower LOD.

Use:

- the exact resolved LOD0 palette object;
- the exact Phase 4 material configuration;
- reduced detail uniform payload;
- a new owned five-step gradient texture;
- the same shader version;
- a white base material colour;
- the same Phase 4 semantic and detail response uniforms.

Do not rerun palette resolution or material recipe randomness.

The lower-LOD material recipe view is:

```ts
export interface StoneLodMaterialRecipeView {
  readonly sourceMaterialRecipeFingerprint: string;
  readonly sourceMaterialAssetFingerprint: string;
  readonly level: StoneLodLevel;
  readonly sourceRegionKeys: readonly string[];
  readonly retainedSurfaceDetailIds: readonly string[];
}
```

It is diagnostic and fingerprinted but is not stored in material `userData`.

## Continuity analysis

`StoneLodContinuityAnalyzer` compares each lower LOD to LOD0.

### Dimension deltas

```text
abs(lodDimension - sourceDimension) /
max(sourceDimension, analysisEpsilon)
```

### Volume and footprint

Use absolute relative delta against LOD0 Phase 1 metrics.

### Support-centroid shift

Calculate the lower LOD underside hull centroid before final recentering and normalize its distance from the LOD0 origin by source max horizontal dimension.

Store the pre-recenter shift metric. The final geometry centroid must be zero.

### Projected silhouettes

Use unique positions and convex-hull projections:

- top: XZ;
- front: XY;
- side: ZY.

Area delta is absolute relative difference.

### Bidirectional silhouette Hausdorff ratio

For each of the same three 2D hulls:

1. For every source hull vertex, calculate minimum distance to every lower-LOD hull segment.
2. Take the maximum source-to-LOD distance.
3. Repeat lower-LOD to source.
4. Take the larger direction.
5. Normalize top by `max(width, depth)`.
6. Normalize front by `max(width, height)`.
7. Normalize side by `max(depth, height)`.
8. Store the maximum of the three normalized values.

### Dominant normal continuity

For dominant top, side, and optional cut source region keys:

1. Find the lower-LOD region with the same source region key.
2. When missing, find the lower-LOD region of the same semantic with the greatest normal dot product.
3. Calculate clamped normal dot.
4. A missing required top or side match is `-1` and fails.
5. When LOD0 has no dominant cut, store `null`.

## LOD validation

`StoneLodValidator` validates in this order:

1. level is `1`, `2`, or `3`;
2. geometry is finite and indexed;
3. Phase 1 topology validation passes;
4. triangle count is within level maximum;
5. active plane count is inside the attempted budget;
6. no seed-bound face survives;
7. exactly one underside region exists;
8. minimum Y equals zero within Phase 1 tolerance;
9. final support centroid is zero within analysis epsilon;
10. dimensions match source within `0.000001` relative delta;
11. source region keys are unique;
12. every local region maps to one source region;
13. every triangle has constant local region ID, semantic, face normal, flags, and material variation;
14. every region UV is finite and inside `[0, 1]`;
15. retained detail count is within level budget;
16. retained detail kinds are allowed for the level;
17. every retained detail targets a local region and retains its source key;
18. palette ID equals LOD0 palette ID;
19. global material value and saturation scales equal LOD0;
20. region variations equal source values by key;
21. continuity metrics pass all level thresholds;
22. lower LOD triangle count is not greater than the previous level;
23. lower LOD active plane count is not greater than the previous lower-LOD level;
24. fingerprints are present and deterministic.

Candidate rejection continues to the next shrink fraction or plane budget. Once all candidates fail, throw `LOD_LEVEL_GENERATION_FAILED` with one frozen summary per attempted candidate.

## Fingerprints

`StoneLodFingerprint` uses the Phase 1 dual FNV-1a strategy.

### Geometry fingerprint

Serialize:

1. LOD recipe version;
2. level;
3. active selected plane IDs in clipping order;
4. quantized shrink fraction;
5. normalized shared positions;
6. polygon plane IDs and indices;
7. triangle indices.

### Detail fingerprint

Serialize:

1. level;
2. retained detail IDs in original order;
3. retained descriptor values;
4. remapped local region IDs.

LOD3 detail fingerprint still hashes the empty array.

### Material fingerprint

Hash UTF-8 bytes of:

```text
v1|<level>|<sourcePhase4MaterialFingerprint>|<lodDetailFingerprint>|<sourceRegionKeysJoined>
```

### Asset fingerprint

Hash:

```text
<geometryFingerprint>|<semanticFingerprint>|<detailFingerprint>|<materialFingerprint>
```

### LOD-set fingerprint

Hash:

```text
v1|<productionFingerprint>|<lod0AssetFingerprint>|<lod1AssetFingerprint>|<lod2AssetFingerprint>|<lod3AssetFingerprint>
```

LOD0 asset fingerprint is the Phase 4 material-asset fingerprint from the Phase 5 result.

Return sixteen lowercase hexadecimal digits.

## LOD generator API

`StoneLodGenerator.ts` must export:

```ts
export class StoneLodGenerator {
  constructor(
    sourceResolver: StoneLodSourceResolver,
    lodConfig: Readonly<StoneLodConfig>,
    materialConfig: Readonly<StoneMaterialConfig>,
  );

  generate(
    archetypeId: StoneArchetypeId,
    seed: number,
    paletteId: StonePaletteId,
  ): StoneLodAssetSet;
}
```

### Complete generation flow

1. Resolve the Phase 5 production source and reconstructed detailed source.
2. Adopt production geometry and material as LOD0.
3. Patch LOD0 material for Phase 6 dither with initial coverage `1` and non-inverted mode.
4. Build the LOD0 level wrapper without changing its geometry or material values.
5. Extract final source planes.
6. Score and protect planes once.
7. For level `1`, try configured plane budgets and shrink fractions in exact order.
8. Normalize, rebuild topology and normals, map semantics, reduce details, decorate geometry, build material, analyze continuity, validate, and fingerprint.
9. Repeat independently for level `2` and level `3` from the same LOD0 source. Do not simplify LOD2 from LOD1 or LOD3 from LOD2.
10. Validate cross-level triangle and active-plane monotonicity.
11. Calculate the LOD-set fingerprint.
12. Apply compact metadata to every level geometry and material.
13. Dispose the temporary regenerated Phase 3 source geometry.
14. Return the frozen asset set.

When any lower level fails terminally:

- dispose every already-created lower-LOD geometry and material;
- dispose LOD0 geometry and material;
- dispose temporary detailed geometry;
- throw a typed error.

Ownership of all four geometries and all four materials transfers to the caller only on success.

### Compact LOD metadata

For each level:

```ts
const metadata = Object.freeze({
  configVersion: 1,
  recipeVersion: 1,
  transitionShaderVersion: 1,
  level,
  lodSetFingerprint,
  geometryFingerprint,
  semanticFingerprint,
  detailFingerprint,
  materialFingerprint,
  assetFingerprint,
  triangleCount,
  activePlaneCount,
});
```

Assign the same object to:

```text
geometry.userData.stoneLod
material.userData.stoneLod
```

Do not store source planes, semantic models, details, continuity metrics, or recipes in `userData`.

## Error contract

`StoneLodErrors.ts` must define:

```ts
export type StoneLodGenerationErrorCode =
  | "INVALID_LOD_CONFIG"
  | "SOURCE_RECONSTRUCTION_FAILED"
  | "SOURCE_PLANE_EXTRACTION_FAILED"
  | "PLANE_SELECTION_FAILED"
  | "LOD_REDUCTION_FAILED"
  | "LOD_NORMALIZATION_FAILED"
  | "LOD_SEMANTIC_MAPPING_FAILED"
  | "LOD_DETAIL_REDUCTION_FAILED"
  | "LOD_GEOMETRY_DECORATION_FAILED"
  | "LOD_MATERIAL_CREATION_FAILED"
  | "LOD_CONTINUITY_FAILED"
  | "LOD_LEVEL_GENERATION_FAILED"
  | "LOD_SET_GENERATION_FAILED"
  | "LOD_SHADER_PATCH_FAILED";

export class StoneLodGenerationError extends Error {
  readonly code: StoneLodGenerationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- set `name = "StoneLodGenerationError"`;
- preserve unexpected causes;
- include archetype, requested seed, effective seed, palette, level, plane budget, and shrink fraction when available;
- deeply freeze ordinary details and candidate summaries;
- do not log;
- level-generation failure contains one summary for every attempted budget and shrink combination.

## Projected-size calculation

`StoneProjectedSize.ts` exports:

```ts
export function calculateStoneProjectedRadiusPixels(
  sphere: Readonly<THREE.Sphere>,
  objectMatrixWorld: Readonly<THREE.Matrix4>,
  camera: THREE.Camera,
  viewportHeightPixels: number,
): number;
```

### World radius

Extract maximum absolute world scale from the matrix basis-vector lengths.

```text
worldRadius = sphere.radius * maximumWorldScale
```

Transform sphere centre to world space.

### Perspective camera

```text
distance = length(cameraPosition - worldCentre)
fovRadians = verticalFovDegrees * π / 180
radiusPixels =
  worldRadius * viewportHeightPixels /
  (2 * tan(fovRadians / 2) * max(distance, worldRadius, epsilon))
```

Do not subtract radius from distance.

### Orthographic camera

```text
visibleWorldHeight = (top - bottom) / zoom
radiusPixels = worldRadius * viewportHeightPixels / visibleWorldHeight
```

Reject unsupported camera types, non-positive viewport height, missing sphere, or non-finite values.

## Runtime LOD selection

`StoneLodSelector` is stateful only for the primary-level hysteresis.

Constructor:

```ts
export class StoneLodSelector {
  constructor(config: Readonly<StoneLodConfig>);

  reset(level?: StoneLodLevel): void;

  resolve(projectedRadiusPixels: number): StoneLodBlendState;
}
```

### Primary-level hysteresis

Initial primary level is resolved without hysteresis:

- radius `>= 120` → `0`;
- radius `>= 48` → `1`;
- radius `>= 18` → `2`;
- otherwise → `3`.

Subsequent transitions:

- `0 → 1` when radius `< 114`;
- `1 → 0` when radius `> 126`;
- `1 → 2` when radius `< 45`;
- `2 → 1` when radius `> 51`;
- `2 → 3` when radius `< 16.5`;
- `3 → 2` when radius `> 19.5`.

Apply at most one primary-level change per `resolve` call.

### Blend bands

Blend state is calculated directly from radius, independent of primary hysteresis.

Boundary `B`, half-width `H`:

```text
lowCoverage = clamp((B + H - radius) / (2 * H), 0, 1)
highCoverage = 1 - lowCoverage
```

Use boundaries in this order:

1. when radius is within `[102, 138]`, blend LOD0 and LOD1;
2. else when within `[40, 56]`, blend LOD1 and LOD2;
3. else when within `[14, 22]`, blend LOD2 and LOD3;
4. otherwise show one level with coverage `1`.

At an exact overlap of numeric ranges, the earlier boundary wins. Committed ranges do not overlap.

When not transitioning:

```text
highLevel = lowLevel = resolved visible level
highCoverage = 1
lowCoverage = 0
```

### Shadow level

- outside transition: primary visible level when it is `0`, `1`, or `2`; `null` for `3`;
- during transition: high level when `lowCoverage < 0.5`, otherwise low level;
- any resolved shadow level `3` becomes `null`.

Coverage values must sum to exactly `1` within `0.000001` during transitions.

## Dither shader

`StoneLodDitherShader.ts` exports:

```ts
export const STONE_LOD_DITHER_GLSL: string;
```

Use one 4×4 Bayer matrix with values normalized to cell centres:

```text
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Threshold:

```text
(matrixValue + 0.5) / 16
```

GLSL must implement the matrix without a texture and without integer bitwise operations.

Use uniforms:

```text
uStoneLodCoverage
uStoneLodInvert
uStoneLodPhaseX
uStoneLodPhaseY
```

Fragment rule:

```glsl
float threshold = stoneLodBayerThreshold(
  gl_FragCoord.xy + vec2(uStoneLodPhaseX, uStoneLodPhaseY)
);

if (uStoneLodInvert < 0.5) {
  if (threshold >= uStoneLodCoverage) {
    discard;
  }
} else {
  if (threshold < 1.0 - uStoneLodCoverage) {
    discard;
  }
}
```

Coverage `1` must keep every fragment. Coverage `0` must discard every fragment.

For a transition:

- high LOD uses `coverage = highCoverage`, `invert = 0`;
- low LOD uses `coverage = lowCoverage`, `invert = 1`.

This produces complementary Bayer cells.

## Material patching

`StoneLodMaterialPatcher` wraps an existing `StoneStylizedMaterial`.

Require fragment anchors:

```text
#include <common>
#include <dithering_fragment>
```

1. Save the original `onBeforeCompile` callback.
2. Call the original callback first.
3. Inject uniforms and `STONE_LOD_DITHER_GLSL` after `<common>`.
4. Inject the discard call immediately before `<dithering_fragment>`.
5. Store the compiled uniform references.
6. Keep pending coverage values before first compilation.
7. Replace `customProgramCacheKey` with a wrapper returning:

```text
<originalKey>|stone-lod-dither:v1
```

8. Do not patch vertex shader.
9. Do not alter Phase 4 palette or detail shader source.
10. Repeated patch calls on one material are errors.

### Dither phase

Derive one integer from the production fingerprint:

```text
phaseValue = parseInt(first four hex digits, 16) mod 16
phaseX = phaseValue mod 4
phaseY = floor(phaseValue / 4)
```

Every level of one asset set uses the same phase.

## StoneLodGroup

`StoneLodGroup` extends `THREE.Group` and owns one successful `StoneLodAssetSet`.

API:

```ts
export class StoneLodGroup extends THREE.Group {
  constructor(assetSet: StoneLodAssetSet);

  update(
    camera: THREE.Camera,
    viewportHeightPixels: number,
  ): StoneLodBlendState;

  dispose(): void;
}
```

### Mesh setup

Create four `THREE.Mesh` children in level order.

For every mesh:

- `frustumCulled = true`;
- `receiveShadow = true`;
- initial visible state resolved from projected size on first update;
- all meshes use local position `(0, 0, 0)`, identity rotation, and unit scale;
- parent group carries the world transform.

### Update behavior

1. Calculate projected radius from LOD0 bounding sphere.
2. Resolve blend state.
3. Hide all meshes.
4. When not transitioning, show only the resolved level at coverage `1`, non-inverted.
5. During transition, show high and low levels.
6. Apply complementary coverage and invert values.
7. Set `castShadow = true` only on `shadowLevel`.
8. Set every other mesh `castShadow = false`.
9. LOD3 always has `castShadow = false`.
10. Return the frozen blend state.

Do not allocate new vectors, matrices, or arrays per frame after construction.

### Disposal

`dispose()` must:

1. tolerate repeated calls;
2. remove all meshes from the group;
3. dispose each of four geometries exactly once;
4. dispose each of four materials exactly once;
5. rely on Phase 4 material disposal to dispose each owned gradient texture;
6. clear internal references;
7. perform no scene traversal outside the group.

## Shadow policy

The visible transition shader is not applied to depth or distance shadow materials.

Exactly one visible LOD casts a shadow:

- LOD0 or LOD1 near the camera;
- LOD2 at middle distance;
- no shadow for LOD3.

Do not assign custom depth or distance materials in Phase 6.

This avoids doubled or dithered shadow silhouettes and keeps Phase 6 compatible with the current world renderer.

## Fixed LOD gallery

`StoneLodGalleryApp.ts` is selected with:

```text
?scene=stone-lod-gallery
```

Update `main.ts` scene resolution to support:

```ts
type SceneMode =
  | "world"
  | "island"
  | "stone-material-gallery"
  | "stone-lod-gallery";
```

Do not change behavior of existing modes.

### Gallery cases

Use the exact 24 Phase 3 detail gallery archetype and seed pairs.

Palette index:

```text
(caseIndex * 3 + archetypeIndex) mod 8
```

### Layout

Use five columns:

1. LOD0;
2. LOD1;
3. LOD2;
4. LOD3;
5. animated transition sample.

Rows follow gallery-case order.

Static columns force coverage `1` and show the named level only.

The transition sample oscillates projected radius through this exact sequence over a 12-second loop:

```text
150 → 90 → 62 → 34 → 24 → 10 → 24 → 34 → 62 → 90 → 150
```

Use piecewise linear interpolation with equal time per segment.

### Renderer setup

Use:

- `WebGLRenderer`;
- sRGB output;
- ACES filmic tone mapping;
- one directional light;
- one hemisphere light;
- shadows enabled;
- neutral grey ground;
- production fog disabled for static inspection;
- fixed camera FOV `42` degrees;
- fixed renderer pixel ratio `1` for repeatable review.

### Gallery labels

Display:

- archetype;
- requested and effective seed;
- palette;
- level;
- triangle count;
- active plane count;
- retained detail count;
- asset fingerprint;
- LOD-set fingerprint.

The gallery is non-authoring. Do not add sliders for configuration values.

### Manual visual checklist

A reviewer must confirm:

- no obvious identity swap;
- no vertical ground pop;
- no large horizontal centroid jump;
- wedge and peak top character survives;
- leaning shard and monolith lean survives;
- broad slab and platform proportions survive;
- major cuts remain represented through LOD2 when budget permits;
- LOD3 reads as the same family;
- palette values remain stable;
- no random face-colour reshuffle;
- broad bands do not jump between unrelated faces;
- transitions contain no full-frame flash;
- shadows do not double;
- LOD3 shadow removal occurs only at small projected size.

## Verification script

`scripts/verify-stone-lod.mjs` uses Vite SSR.

Load:

```text
/src/stones/qa/StoneLodVerification.ts
```

Call exactly:

```ts
await verification.verifyStoneLod();
```

Prefix failures with:

```text
[stone-lod]
```

Print one success line containing:

- generated set count;
- unique LOD-set fingerprints;
- maximum LOD1 triangles;
- maximum LOD2 triangles;
- maximum LOD3 triangles;
- maximum LOD1 Hausdorff ratio;
- maximum LOD2 Hausdorff ratio;
- maximum LOD3 Hausdorff ratio;
- maximum source reconstruction attempts.

Do not write screenshots or temporary files.

## Mandatory verification matrix

### Previous-phase compatibility

Run all Phase 1–5 verifiers unchanged.

For representative Phase 5 cases, import Phase 6 modules and require direct Phase 5 generation to remain exact in:

- accepted effective seed;
- geometry arrays and attributes;
- material recipe and palette;
- material fingerprints;
- quality metrics and fingerprints;
- production fingerprint;
- shader cache key before Phase 6 patching.

### Configuration tests

Verify:

- committed YAML parses;
- config is recursively frozen;
- missing key fails;
- duplicate key fails;
- unknown key fails;
- `NaN` fails;
- level count other than four fails;
- non-ascending shrink fractions fail;
- first shrink fraction other than zero fails;
- non-ascending plane budgets fail;
- LOD3 budget above LOD2 maximum fails;
- detail maxima other than four, two, zero fail;
- LOD1 continuity looser than LOD2 fails;
- non-descending boundaries fail;
- transition half-width spanning another boundary fails;
- hysteresis greater than transition width fails;
- dither size other than four fails;
- unique fingerprint minimum above population fails.

### Source reconstruction tests

For every Phase 3 gallery case:

- Phase 5 source generation succeeds;
- reconstructed detailed asset fingerprint equals Phase 4 source fingerprint;
- reconstructed final core recipe is deeply frozen;
- geometric detail cuts are appended in exact order;
- final core artifact fingerprint equals detailed geometry fingerprint;
- core metrics match;
- temporary detailed geometry is not mutated before disposal.

### Plane extraction and selection tests

For every gallery case:

- one plane source per final shared face;
- plane IDs unique;
- every plane normal unit length;
- every source vertex lies inside every source plane;
- protected list starts with underside;
- top and four horizontal support owners resolve;
- salience deterministic;
- selection never exceeds budget;
- selection has required directional coverage;
- selected plane IDs repeat exactly across runs;
- no seed-bound face survives accepted reductions.

### Geometry fixture tests

Use hand-authored convex box, wedge, tapered prism, and leaning prism sources.

Verify:

- half-space reduction remains closed and convex;
- inward shift moves constants in the correct direction;
- underside constant is unchanged;
- dimension normalization restores exact dimensions;
- `y = 0` is preserved;
- support centroid recentering reaches zero;
- winding remains outward;
- triangle upper bound follows selected-plane count;
- wedge top normal survives when protected;
- leaning prism bounds and lean remain visible.

### Single-set determinism

Use:

```text
archetype: weathered-block
seed: 42
palette: sandstone
```

Generate twice and require exact equality of:

- Phase 5 production fingerprint;
- effective seed;
- every selected plane ID and shrink fraction;
- every lower-LOD position, normal, index, and namespaced attribute;
- semantic model JSON;
- retained detail JSON;
- continuity metrics;
- all per-level fingerprints;
- LOD-set fingerprint;
- compact metadata;
- material shader cache keys.

Dispose both sets.

### LOD0 identity tests

For every verification case:

- LOD0 geometry object is the accepted Phase 5 geometry object;
- LOD0 material object is the accepted Phase 5 material object;
- positions, normals, indices, attributes, bounds, metadata, recipe, palette, and fingerprints are unchanged;
- Phase 6 dither coverage `1` produces no discard in CPU threshold fixtures;
- original Phase 4 shader patch callback runs before the Phase 6 patch;
- cache key gains only the Phase 6 suffix after patching.

### Batch generation

Generate:

```text
12 archetypes × seeds 0 through 31 = 384 LOD sets
```

Palette rotation:

```text
(seed + archetypeIndex * 3) mod 8
```

For every set:

- generation succeeds;
- exactly four levels exist;
- level numbers are ordered `0, 1, 2, 3`;
- LOD0 is exact Phase 5 output;
- lower LOD Phase 1 validation has zero issues;
- triangle counts are non-increasing;
- active-plane counts for LOD1–LOD3 are non-increasing;
- triangle maxima pass;
- exact dimensions pass;
- exact ground contact passes;
- final support centroid is zero;
- semantic source keys are subsets of LOD0 keys;
- every lower local region ID is contiguous;
- every material variation matches LOD0 by source key;
- palette ID is unchanged;
- detail budgets and allowed kinds pass;
- detail IDs are subsets of LOD0 IDs;
- every continuity threshold passes;
- every per-level fingerprint is deterministic;
- LOD-set fingerprint is deterministic;
- compact metadata matches between geometry and material;
- no generic `uv`, `color`, or `tangent` attribute exists.

Across the batch:

- at least `370` unique LOD-set fingerprints;
- every archetype and palette appears;
- every level reaches its configured maximum detail budget in at least one case when source data permits;
- at least one LOD1 candidate requires a non-zero shrink fraction;
- at least one LOD2 candidate requires a larger plane budget than its minimum;
- at least one LOD3 uses ten planes;
- no lower LOD exceeds its triangle maximum.

Dedicated boundary fixtures may satisfy the last three conditions when production seeds all pass earlier candidates.

### Detail continuity tests

For every source detail retained at a lower level:

- ID unchanged;
- source region key unchanged;
- local region ID correctly remapped;
- descriptor values unchanged except region ID;
- target region UV basis is the LOD0 source basis;
- all final UV values lie in `[0, 1]`;
- LOD2 contains no crack or recess;
- LOD3 contains no detail;
- retained-array order follows original Phase 3 order.

### Material continuity tests

For every lower LOD:

- resolved palette object values equal LOD0;
- global value and saturation scales equal LOD0;
- region multipliers equal source region values;
- detail uniforms pack retained descriptors exactly;
- Phase 4 semantic response settings unchanged;
- gradient bytes equal LOD0 gradient bytes;
- material base properties match Phase 4;
- only material and asset fingerprints differ by LOD identity;
- visible colour CPU samples on shared source regions match when no removed detail affects the sample.

### Continuity-metric fixtures

Verify:

- identical hulls have zero area and Hausdorff deltas;
- translated hulls have expected Hausdorff distance;
- scaled hull relative area delta is correct;
- bidirectional calculation catches an inward-only difference;
- dominant normal dot handles missing cut as null;
- missing required top or side returns failure;
- support-centroid shift is measured before recentering.

### Selector tests

Verify exact primary states at:

```text
200, 126, 120, 114, 100,
56, 51, 48, 45, 40,
22, 19.5, 18, 16.5, 14, 8
```

Verify:

- initial thresholds exact;
- hysteresis transitions exact;
- at most one primary change per call;
- blend endpoints produce coverage `1/0` and `0/1`;
- midpoint produces `0.5/0.5`;
- coverages sum to one;
- only adjacent levels blend;
- shadow level switches at half coverage;
- LOD3 never casts shadow.

### Projected-size tests

Use deterministic perspective and orthographic cameras.

Verify:

- doubling viewport height doubles pixel radius;
- doubling distance halves perspective pixel radius;
- doubling world scale doubles radius;
- changing horizontal aspect without vertical FOV does not change result;
- orthographic zoom scales result linearly;
- unsupported camera fails;
- missing sphere fails;
- non-positive viewport fails.

### Dither tests

Verify the exact sixteen normalized Bayer thresholds.

For coverage values:

```text
0, 0.0625, 0.25, 0.5, 0.75, 0.9375, 1
```

Require:

- kept-cell count matches expected quantization;
- high and low complementary modes partition all sixteen cells;
- no cell is in both sets;
- no cell is absent from both sets;
- phase shifts permute but do not change counts;
- coverage zero keeps none;
- coverage one keeps all;
- GLSL string contains no texture sampling and no integer bitwise operation.

### Shader patch tests

Use fixture shader strings.

Verify:

- original Phase 4 callback invoked first;
- required anchors patched once;
- uniforms added with pending values;
- repeated patching fails;
- missing common anchor fails;
- missing dithering anchor fails;
- cache-key suffix exact;
- Phase 4 palette and detail snippets remain present;
- visible material remains opaque and depth-writing.

### Resource lifecycle tests

Use material, geometry, and gradient-texture spies.

Verify:

- successful set transfers all eight resources to caller;
- failed LOD1 disposes LOD0 and temporary source;
- failed LOD2 disposes LOD0 and LOD1 resources;
- failed LOD3 disposes LOD0–LOD2 resources;
- temporary regenerated detailed geometry is always disposed;
- `StoneLodGroup.dispose()` disposes four geometries and four materials once;
- repeated group disposal is safe;
- material disposal releases each gradient texture once;
- group update allocates no arrays or Three.js vectors after construction.

## Implementation sequence

Implement in this exact order and keep TypeScript compiling after every step.

### Step 1 — Configuration, catalogue, types, and errors

Files:

- `public/config/stone-lod.yaml`
- `StoneLodConfig.ts`
- `StoneLodConfigLoader.ts`
- `StoneLodCatalog.ts`
- `StoneLodTypes.ts`
- `StoneLodErrors.ts`

Checks:

- committed YAML parses;
- config is frozen;
- no import cycle;
- all validations implemented.

### Step 2 — Source reconstruction

File:

- `StoneLodSourceResolver.ts`

Checks:

- effective seed reused;
- final core recipe exact;
- final artifact fingerprint matches Phase 3.

### Step 3 — Plane extraction and scoring

Files:

- `StoneLodPlaneExtractor.ts`
- `StoneLodPlaneScorer.ts`
- `StoneLodPlaneSelector.ts`

Checks:

- source planes valid;
- protected order exact;
- directional coverage exact;
- selection deterministic.

### Step 4 — Plane reduction and normalization

Files:

- `StoneLodPlaneReducer.ts`
- `StoneLodGeometryNormalizer.ts`

Checks:

- candidate order exact;
- no seed-bound face survives;
- dimensions and support origin exact;
- Phase 1 validation passes.

### Step 5 — Semantic and detail continuity

Files:

- `StoneLodSemanticBuilder.ts`
- `StoneLodDetailReducer.ts`

Checks:

- source keys preserved;
- local IDs contiguous;
- details filtered and remapped exactly.

### Step 6 — Geometry and material construction

Files:

- `StoneLodGeometryDecorator.ts`
- `StoneLodMaterialBuilder.ts`

Checks:

- required attributes exact;
- palette and variation continuity exact;
- bounds and ownership correct.

### Step 7 — Continuity, validation, and fingerprints

Files:

- `StoneLodContinuityAnalyzer.ts`
- `StoneLodValidator.ts`
- `StoneLodFingerprint.ts`

Checks:

- fixtures pass;
- candidate rejection deterministic;
- all fingerprints stable.

### Step 8 — LOD generation

File:

- `StoneLodGenerator.ts`

Checks:

- four-level set generated;
- LOD0 exact;
- failure disposal complete;
- set fingerprint stable.

### Step 9 — Runtime transition system

Files:

- `StoneLodDitherShader.ts`
- `StoneLodMaterialPatcher.ts`
- `StoneProjectedSize.ts`
- `StoneLodSelector.ts`
- `StoneLodGroup.ts`

Checks:

- Bayer fixtures pass;
- selector boundaries exact;
- complementary transitions exact;
- shadow policy exact;
- no per-frame allocations.

### Step 10 — Gallery and verification gate

Files:

- `StoneLodGalleryApp.ts`
- `StoneLodVerification.ts`
- `scripts/verify-stone-lod.mjs`
- `src/main.ts`
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
npm run build
```

Open:

```text
?scene=stone-lod-gallery
```

Complete the manual visual checklist.

## Definition of done

Phase 6 is complete only when:

- all required files exist in the specified locations;
- all previous phase verifiers pass unchanged;
- LOD0 is exactly the Phase 5 accepted asset;
- LOD1–LOD3 are derived from the same accepted final core recipe;
- no independent LOD randomness exists;
- lower LODs are valid, closed, manifold, convex meshes;
- triangle and active-plane counts decrease monotonically;
- ground plane and support origin remain stable;
- dimensions remain exact;
- dominant silhouette and plane thresholds pass;
- semantic source keys remain stable;
- palette and per-region material variation remain stable;
- detail reduction follows the exact allowed-kind and priority policy;
- projected-size selection and hysteresis pass exact boundary tests;
- dither coverage is complementary;
- only one non-LOD3 mesh casts a shadow;
- all four geometries and materials have deterministic fingerprints and compact metadata;
- the 384-set verification batch passes;
- the fixed browser gallery compiles and passes manual review;
- production build includes the Phase 6 gate;
- no Phase 7–10 functionality is introduced.

## Required completion report

The implementation completion note must include:

- commit hash;
- files added and modified;
- all verification commands and results;
- 384-set batch result;
- maximum triangle count per lower LOD;
- average and maximum triangle reduction per level;
- maximum silhouette area and Hausdorff deltas per level;
- maximum footprint and volume deltas per level;
- plane-budget and shrink-attempt distribution;
- retained-detail count distribution per level;
- unique LOD-set fingerprint count;
- selector and dither fixture results;
- gallery URL and manual acceptance result;
- confirmation that LOD0 and Phase 1–5 outputs remained unchanged;
- confirmation that no impostor, placement, caching, instancing, streaming, or authoring work was added.
