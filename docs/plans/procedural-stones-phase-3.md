# Procedural Stylized Stones — Phase 3 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Target branch: `main`
- Phase: 3 — semantic regions and sparse geometric detail
- Document authority: implementation contract
- Current state: completed
- Scope owner: stone semantics, region coordinates, sparse surface-detail recipes, and bounded silhouette chips

This document removes implementation choices from Phase 3. The implementer must follow the file layout, public APIs, semantic taxonomy, configuration values, deterministic algorithms, geometry-delta rules, attribute schema, verification matrix, and completion criteria below. A different semantic model, detail representation, geometry strategy, configuration format, or retry strategy requires this document to be changed first.

## Phase objective

Add a stable semantic and detail layer to accepted Phase 2 archetype stones.

Phase 3 must deliver four things:

1. Every final polygon face is classified into a deterministic semantic region.
2. Every structural polygon edge is classified and given a stable key.
3. Sparse surface details are resolved as immutable analytic descriptors bound to stable region keys.
4. Optional broad edge chips are added through the existing convex half-space system without changing the stone into noisy or fragmented geometry.

The output must be ready for the Phase 4 material system. Phase 3 does not implement the final stone shader, colours, palette, or lighting model.

A Phase 3 stone rendered with a neutral material should show only the broad geometric chips. Grooves, bands, cracks, and shallow recesses are represented as analytic detail descriptors and region-space attributes. They become visible when Phase 4 consumes them.

## Required dependency state

Phase 3 starts only after both existing verification gates pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
```

The implementation must consume these existing contracts without replacing them:

- `StoneConfig`
- `StoneCoreGenerator`
- `StoneRecipe`
- `StoneGenerationResult`
- `StoneGeometryMetrics`
- `StoneGeometryFingerprint`
- `StoneArchetypeConfig`
- `StoneArchetypeGenerator`
- `StoneArchetypeGenerationResult`
- `StoneArchetypeRecipe`
- `StoneArchetypeGeometryAnalyzer`
- `StoneArchetypeEvaluator`
- `StoneArchetypeEvaluationResult`
- `STONE_ARCHETYPE_IDS`
- `StoneArchetypeId`
- `StoneRandom`

The Phase 1 recipe version remains `1`.

The Phase 2 archetype recipe version remains `1`.

The Phase 3 detail recipe version is `1`.

## Compatibility contract

Phase 3 must preserve all previous output paths.

The following calls must produce the same recipes, positions, normals, indices, metrics, and fingerprints they produced before Phase 3:

```ts
new StoneCoreGenerator(coreConfig).generate(seed)
```

```ts
new StoneArchetypeGenerator(
  coreGenerator,
  archetypeConfig,
).generate(archetypeId, seed)
```

The Phase 1 and Phase 2 verification suites remain mandatory build gates.

Phase 3 may refactor the internal Phase 1 build pipeline only as specified in this document. The refactor must be behavior-preserving and must not change existing public return types or geometry metadata.

## Frozen architectural decisions

The following decisions are final for Phase 3:

1. Phase 3 is a layer above accepted Phase 2 archetype generation.
2. The existing Phase 1 half-space clipper remains the only geometric cutting implementation.
3. Phase 3 does not introduce general CSG, voxel meshing, marching cubes, SDF extraction, displacement subdivision, or boolean subtraction.
4. Every Phase 3 stone remains one connected, closed, convex mesh.
5. True concave grooves, holes, undercuts, caves, and recessed topology are out of scope.
6. Broad edge damage is implemented by appending at most two additional convex cut planes to the accepted archetype core recipe.
7. Surface grooves, painted bands, hairline cracks, and shallow recesses are analytic descriptors, not additional mesh topology.
8. Surface descriptors bind to stable polygon plane IDs, not transient triangle numbers.
9. Each source polygon is one semantic region.
10. Region IDs are deterministic runtime indices. Region keys are stable strings used across generation stages and future LODs.
11. Structural edges come from polygon boundaries, not triangulation diagonals.
12. Semantic classification uses Phase 1 plane roles and plane IDs as the primary source of truth.
13. Normal direction, area, height, and adjacency provide secondary flags and eligibility scores.
14. The Phase 1 geometry fingerprint continues to represent shape only.
15. Phase 3 adds separate semantic, detail, and combined asset fingerprints.
16. Phase 3 geometry adds namespaced attributes only. It does not add generic `uv` or `color` attributes.
17. Semantic attributes are split at polygon-region boundaries so integer-like attributes do not interpolate across unrelated faces.
18. The existing authored position and normal values are copied exactly into the decorated geometry.
19. Phase 3 does not recalculate vertex normals.
20. Phase 3 does not add a runtime material, shader, palette, texture, lighting model, LOD, impostor, terrain placement, cache, instancing, worker, editor, collision, or biome selection system.
21. Detail generation uses deterministic named random substreams.
22. Phase 3 owns a bounded detail-attempt loop separate from the Phase 2 archetype-attempt loop.
23. A failed detail attempt disposes all temporary Three.js geometries before trying again.
24. No logging occurs inside semantic, detail, or generator classes. Failures use typed errors and immutable structured issue lists.
25. Verification uses Vite SSR and adds no test framework or production dependency.
26. Wall-clock timings are recorded but are not pass/fail gates.
27. No automatic plain-stone fallback is introduced. Deterministic fallback policy belongs to Phase 5.
28. Surface-detail descriptors are limited to fixed production maxima so Phase 4 can use bounded shader arrays.
29. The committed archetype detail catalogue is exact. Do not add random detail kinds outside the catalogue.
30. A generated stone must remain recognisable as its requested Phase 2 archetype after geometric details are applied.

## In scope

Phase 3 includes:

- A behavior-preserving internal core-artifact path.
- Polygon-to-triangle and rendered-vertex topology mappings.
- A canonical face semantic taxonomy.
- Semantic region construction.
- Stable region-space UV coordinates under a namespaced attribute.
- Polygon-edge reconstruction and edge classification.
- Dominant face and ridge selection.
- Deterministic broad edge-chip generation.
- Archetype-specific detail templates.
- Deterministic broad groove descriptors.
- Deterministic weathering-band descriptors.
- Deterministic hairline-crack descriptors.
- Deterministic shallow-recess descriptors.
- CPU reference evaluation of all analytic detail fields.
- Geometry-delta validation against the accepted Phase 2 base stone.
- Detail coverage and minimum-feature validation.
- Decorated `THREE.BufferGeometry` creation.
- Semantic, detail, and asset fingerprints.
- Determinism, validity, coverage, differentiation, and compatibility tests.
- A production-build verification gate.

## Explicitly out of scope

Do not implement any of the following in Phase 3:

- Final stone colours or palettes.
- A stone material or shader.
- Baked ambient occlusion.
- Texture baking or texture atlases.
- Generic UV unwrapping.
- Tri-planar mapping.
- Normal maps, height maps, or displacement maps.
- Shader parallax.
- Concave channels or boolean-subtracted recesses.
- Branching crack networks.
- More than four crack polyline segments.
- Micro-pitting, pores, grain, sand, lichen, moss, wetness, snow, or mineral veins.
- Separate fragments or attached secondary masses.
- Broken blocks made from multiple components.
- Stone clusters.
- Stepped shelves requiring concavity.
- LOD generation or semantic remapping across LODs.
- Runtime batching, cache keys, instancing, or streaming.
- Terrain contact blending or terrain embedding.
- Physics and collision.
- A stone bench, gallery renderer, or editor UI.
- Export to glTF.
- Screenshot-based acceptance tests.
- Runtime fallback to a less detailed stone after detail retries fail.

## Required file changes

### New files

Create exactly these files:

```text
public/config/stone-details.yaml

src/stones/core/StoneCoreBuildArtifact.ts

src/stones/details/StoneDetailTypes.ts
src/stones/details/StoneDetailConfig.ts
src/stones/details/StoneDetailConfigLoader.ts
src/stones/details/StoneDetailErrors.ts
src/stones/details/StoneDetailCatalog.ts
src/stones/details/StoneSemanticClassifier.ts
src/stones/details/StoneRegionUvBuilder.ts
src/stones/details/StoneEdgeClassifier.ts
src/stones/details/StoneSemanticFingerprint.ts
src/stones/details/StoneGeometricDetailBuilder.ts
src/stones/details/StoneSurfaceDetailResolver.ts
src/stones/details/StoneSurfaceDetailField.ts
src/stones/details/StoneDetailValidator.ts
src/stones/details/StoneDetailGeometryDecorator.ts
src/stones/details/StoneDetailFingerprint.ts
src/stones/details/StoneDetailedGenerator.ts
src/stones/details/index.ts

src/stones/qa/StoneDetailVerification.ts
scripts/verify-stone-details.mjs
```

### Existing files to modify

Modify only these existing Phase 1 files for the core-artifact extension:

```text
src/stones/core/StoneCoreTypes.ts
src/stones/core/StoneNormalBuilder.ts
src/stones/core/StoneTriangulator.ts
src/stones/core/StoneCoreGenerator.ts
src/stones/core/index.ts
```

Modify:

```text
package.json
```

Do not modify the Phase 2 recipe-resolution algorithms or committed Phase 2 numeric configuration as part of Phase 3.

## Package script changes

Add:

```json
"test:stone-details": "node scripts/verify-stone-details.mjs"
```

Update the build command so the Phase 3 gate runs after the Phase 2 gate and before grass verification:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add dependencies.

## Core build-artifact extension

Phase 3 requires polygon ownership information that is intentionally absent from compact runtime geometry. Add an internal artifact without changing existing Phase 1 or Phase 2 results.

### New core types

`StoneCoreBuildArtifact.ts` must define:

```ts
import type {
  StoneGeometryMetadata,
  StoneGeometryMetrics,
  StoneMeshFace,
  StoneRecipe,
  StoneRenderMeshData,
} from "./StoneCoreTypes";

export interface StoneCoreFaceTopology {
  readonly faceIndex: number;
  readonly planeId: string;
  readonly planeRole: StonePlaneRole;
  readonly sharedIndices: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface StoneCoreTopology {
  readonly sharedPositions: Float64Array;
  readonly sharedFaces: readonly Readonly<StoneCoreFaceTopology>[];
  readonly sharedTriangleIndices: Uint16Array | Uint32Array;
  readonly renderedVertexSharedIndices: Uint16Array | Uint32Array;
  readonly renderedTriangleFaceIndices: Uint16Array | Uint32Array;
}

export interface StoneCoreBuildArtifact {
  readonly recipe: Readonly<StoneRecipe>;
  readonly renderMesh: Readonly<StoneRenderMeshData>;
  readonly topology: Readonly<StoneCoreTopology>;
  readonly metrics: Readonly<StoneGeometryMetrics>;
  readonly metadata: Readonly<StoneGeometryMetadata>;
  readonly fingerprint: string;
}
```

Import `StonePlaneRole` explicitly in the real file.

The artifact is an internal build product. Do not store its large arrays in `geometry.userData`.

### Triangulation mapping

Extend deterministic triangulation so it returns:

- the existing triangle index stream;
- one source face index for every emitted triangle.

`renderedTriangleFaceIndices[triangleIndex]` must identify the source polygon face.

The mapping order must match final index order exactly.

### Rendered-vertex mapping

Extend every normal mode so it returns one shared geometric vertex index for each rendered vertex.

`renderedVertexSharedIndices[renderedVertexIndex]` must identify the source shared vertex from `StoneSharedMeshData`.

The existing position, normal, and index arrays must remain byte-identical.

### Core generator API extension

Add this method to `StoneCoreGenerator`:

```ts
buildArtifactFromRecipe(
  recipe: Readonly<StoneRecipe>,
): StoneCoreBuildArtifact;
```

Requirements:

1. Perform the same recipe validation, clipping, cleanup, triangulation, normal generation, metrics, validation, metadata, and fingerprint work used by `generateFromRecipe`.
2. Create no `THREE.BufferGeometry`.
3. Perform no retry.
4. Throw the same typed errors as `generateFromRecipe`.
5. `generateFromRecipe` must delegate to `buildArtifactFromRecipe` and then call the existing `StoneBufferGeometryAdapter`.
6. Existing output arrays and fingerprints must remain unchanged.
7. Do not duplicate the geometry pipeline in two methods.
8. The Phase 1 verification suite must add exact array comparisons before and after this refactor.

### Topology face construction

For each shared polygon face:

- preserve original face order;
- preserve `planeId` and `planeRole`;
- preserve polygon shared indices;
- collect emitted triangle indices belonging to the face;
- use zero-based face and triangle indices;
- deeply freeze ordinary arrays and objects;
- do not attempt to freeze typed-array elements.

Typed arrays are owned by the artifact and must never be mutated after construction.

## Coordinate and identity conventions

### Coordinate system

- X: local width.
- Y: vertical.
- Z: local depth.
- Ground plane: `y = 0`.
- Final stone origin: Phase 1 ground-contact centroid.
- All region coordinates are derived from final transformed local positions.

### Stable region key

Every source polygon becomes one region.

Use this exact region key:

```ts
const regionKey = `plane:${planeId}`;
```

Plane IDs are already unique inside one core recipe.

Do not include face index, triangle index, or runtime region ID in the stable key.

### Runtime region ID

Assign runtime region IDs in final shared-face order:

```text
regionId = faceIndex
```

Phase 1 limits polygon count to `48`, so `Uint8Array` is sufficient.

Reject an artifact with more than `255` regions even if a future Phase 1 budget changes.

### Stable edge key

For two adjacent region keys `a` and `b`, order them lexicographically and use:

```ts
const edgeKey = `${first}|${second}|${minimumSharedIndex}:${maximumSharedIndex}`;
```

The shared-index suffix distinguishes multiple edges between the same pair of regions.

Triangulation diagonals must never appear in the structural edge list.

## Semantic taxonomy

### Face semantic IDs

Use this exact canonical order and numeric encoding:

```ts
export const STONE_FACE_SEMANTICS = [
  "underside",
  "contact",
  "side",
  "upper",
  "top",
  "cut",
  "detail-cut",
] as const;

export type StoneFaceSemantic =
  (typeof STONE_FACE_SEMANTICS)[number];
```

Numeric codes are the array indices:

| Code | Semantic |
| --- | --- |
| `0` | `underside` |
| `1` | `contact` |
| `2` | `side` |
| `3` | `upper` |
| `4` | `top` |
| `5` | `cut` |
| `6` | `detail-cut` |

Do not reorder or add semantic values in Phase 3.

### Face flags

Use this exact bit layout:

```ts
export const STONE_FACE_FLAG_GROUND_CONTACT = 1 << 0;
export const STONE_FACE_FLAG_TOP_FACING = 1 << 1;
export const STONE_FACE_FLAG_SIDE_FACING = 1 << 2;
export const STONE_FACE_FLAG_PRIMARY_CUT = 1 << 3;
export const STONE_FACE_FLAG_DETAIL_CUT = 1 << 4;
export const STONE_FACE_FLAG_DOMINANT = 1 << 5;
export const STONE_FACE_FLAG_DETAIL_ELIGIBLE = 1 << 6;
```

Bit `7` remains unused in Phase 3.

### Edge flags

Use this exact bit layout:

```ts
export const STONE_EDGE_FLAG_CONTACT = 1 << 0;
export const STONE_EDGE_FLAG_CUT_BOUNDARY = 1 << 1;
export const STONE_EDGE_FLAG_RIDGE = 1 << 2;
export const STONE_EDGE_FLAG_OUTER_PROFILE = 1 << 3;
export const STONE_EDGE_FLAG_TOP_BOUNDARY = 1 << 4;
export const STONE_EDGE_FLAG_DETAIL_ELIGIBLE = 1 << 5;
```

`outer-profile` is a view-independent structural candidate. It does not mean the edge is a silhouette from every camera direction.

### Plane-role classification

Classify a face using this exact priority:

1. `planeRole === "bottom"` → `underside`.
2. `planeRole === "contact-bevel"` → `contact`.
3. `planeRole === "top"` → `top`.
4. `planeRole === "top-bevel"` → `upper`.
5. `planeRole === "side"` → `side`.
6. `planeRole === "cut"` and `planeId.startsWith("detail-cut:")` → `detail-cut`.
7. `planeRole === "cut"` → `cut`.
8. `planeRole === "seed-bound"` → generation error.

Do not reclassify a cut face as top merely because it points upward. Orientation is represented by flags.

### Orientation flags

Let `normalY` be the final unit face normal Y component.

- Set `TOP_FACING` when `normalY >= stoneDetailTopNormalMinimum`.
- Set `SIDE_FACING` when `abs(normalY) <= stoneDetailSideNormalMaximum`.
- Set `GROUND_CONTACT` only for `underside`.
- Set `PRIMARY_CUT` for `cut`.
- Set `DETAIL_CUT` for `detail-cut`.

The default side-normal maximum is defined in configuration.

## Public Phase 3 types

`StoneDetailTypes.ts` must define the semantic and detail contracts below.

```ts
export interface StoneVec2Readonly {
  readonly x: number;
  readonly y: number;
}

export interface StoneRegionBasis {
  readonly origin: StoneVec3;
  readonly tangent: StoneVec3;
  readonly bitangent: StoneVec3;
  readonly minimumU: number;
  readonly maximumU: number;
  readonly minimumV: number;
  readonly maximumV: number;
}

export interface StoneSemanticRegion {
  readonly regionId: number;
  readonly regionKey: string;
  readonly faceIndex: number;
  readonly planeId: string;
  readonly planeRole: StonePlaneRole;
  readonly semantic: StoneFaceSemantic;
  readonly semanticCode: number;
  readonly flags: number;
  readonly area: number;
  readonly areaRatio: number;
  readonly centroid: StoneVec3;
  readonly normal: StoneVec3;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly basis: Readonly<StoneRegionBasis>;
  readonly sharedIndices: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface StoneSemanticEdge {
  readonly edgeKey: string;
  readonly sharedIndexA: number;
  readonly sharedIndexB: number;
  readonly regionIdA: number;
  readonly regionIdB: number;
  readonly regionKeyA: string;
  readonly regionKeyB: string;
  readonly midpoint: StoneVec3;
  readonly direction: StoneVec3;
  readonly length: number;
  readonly dihedralAngleDegrees: number;
  readonly flags: number;
  readonly detailScore: number;
}

export interface StoneSemanticModel {
  readonly version: 1;
  readonly regions: readonly Readonly<StoneSemanticRegion>[];
  readonly edges: readonly Readonly<StoneSemanticEdge>[];
  readonly dominantTopRegionKey: string | null;
  readonly dominantSideRegionKey: string | null;
  readonly dominantCutRegionKey: string | null;
  readonly dominantRidgeEdgeKey: string | null;
  readonly fingerprint: string;
}
```

### Detail kind union

Use:

```ts
export type StoneSurfaceDetailKind =
  | "broad-groove"
  | "weathering-band"
  | "hairline-crack"
  | "shallow-recess";

export type StoneGeometricDetailKind =
  | "edge-chip"
  | "corner-chip"
  | "end-chip"
  | "top-chip"
  | "crown-chip";

export type StoneDetailOrientation =
  | "horizontal"
  | "vertical"
  | "long-axis"
  | "cross-axis"
  | "ridge-parallel"
  | "diagonal-positive"
  | "diagonal-negative"
  | "random";
```

### Common descriptor fields

```ts
export interface StoneSurfaceDetailBase {
  readonly id: string;
  readonly kind: StoneSurfaceDetailKind;
  readonly targetRegionKey: string;
  readonly targetRegionId: number;
  readonly strength: number;
}
```

### Broad groove

```ts
export interface StoneBroadGrooveDetail
  extends StoneSurfaceDetailBase {
  readonly kind: "broad-groove";
  readonly centreUv: StoneVec2Readonly;
  readonly directionUv: StoneVec2Readonly;
  readonly lengthUv: number;
  readonly widthUv: number;
  readonly featherUv: number;
}
```

### Weathering band

```ts
export interface StoneWeatheringBandDetail
  extends StoneSurfaceDetailBase {
  readonly kind: "weathering-band";
  readonly centreUv: StoneVec2Readonly;
  readonly directionUv: StoneVec2Readonly;
  readonly widthUv: number;
  readonly featherUv: number;
}
```

### Hairline crack

```ts
export interface StoneHairlineCrackDetail
  extends StoneSurfaceDetailBase {
  readonly kind: "hairline-crack";
  readonly pointsUv: readonly StoneVec2Readonly[];
  readonly widthUv: number;
  readonly featherUv: number;
}
```

### Shallow recess

```ts
export interface StoneShallowRecessDetail
  extends StoneSurfaceDetailBase {
  readonly kind: "shallow-recess";
  readonly centreUv: StoneVec2Readonly;
  readonly radiusU: number;
  readonly radiusV: number;
  readonly rotationRadians: number;
  readonly featherRatio: number;
}
```

### Geometric detail

```ts
export interface StoneGeometricDetail {
  readonly id: string;
  readonly kind: StoneGeometricDetailKind;
  readonly sourceEdgeKey: string | null;
  readonly sourceRegionKey: string | null;
  readonly normal: StoneVec3;
  readonly depthFraction: number;
}
```

### Detail recipe

```ts
export interface StoneDetailRecipe {
  readonly version: 1;
  readonly seed: number;
  readonly archetypeId: StoneArchetypeId;
  readonly archetypeAttempt: number;
  readonly detailAttempt: number;
  readonly geometricDetails:
    readonly Readonly<StoneGeometricDetail>[];
  readonly surfaceDetails:
    readonly Readonly<StoneSurfaceDetail>[];
}
```

Define `StoneSurfaceDetail` as the union of the four descriptor interfaces.

Every returned object and ordinary array must be deeply frozen.

## Configuration contract

### File

Create:

```text
public/config/stone-details.yaml
```

Parse it through:

```ts
FlatConfig.parse(source, "stone-details")
```

The configuration is strict flat YAML. Every key must be consumed exactly once.

### Exact committed values

Create the file with exactly these values and section comments:

```yaml
# Phase 3 schema and retries
stoneDetailConfigVersion: 1
stoneDetailRecipeVersion: 1
stoneDetailMaximumAttempts: 4
stoneDetailMaximumSurfaceDetails: 6
stoneDetailMaximumGeometricDetails: 2

# Semantic classification
stoneDetailTopNormalMinimum: 0.72
stoneDetailSideNormalMaximum: 0.35
stoneDetailRegionMinimumAreaRatio: 0.03
stoneDetailRegionUvPadding: 0.08
stoneDetailRegionMinimumUvSpan: 0.05
stoneDetailDominantRegionMinimumAreaRatio: 0.08

# Edge classification
stoneDetailRidgeAngleMinimumDegrees: 32
stoneDetailRidgeAngleMaximumDegrees: 145
stoneDetailRidgeMinimumLengthRatio: 0.10
stoneDetailEdgeGroundClearanceRatio: 0.08
stoneDetailOuterProfileHorizontalNormalMinimum: 0.30

# Geometric-detail cuts
stoneDetailGeometricDepthMin: 0.025
stoneDetailGeometricDepthMax: 0.075
stoneDetailGeometricNormalYMin: 0.15
stoneDetailGeometricNormalYMax: 0.72
stoneDetailGeometricUpwardBiasMin: 0.08
stoneDetailGeometricUpwardBiasMax: 0.22
stoneDetailGeometricNormalSeparationDotMaximum: 0.94
stoneDetailExistingCutSeparationDotMaximum: 0.97

# Geometry identity preservation
stoneDetailVolumeRetentionMinimum: 0.88
stoneDetailFootprintRetentionMinimum: 0.90
stoneDetailHeightRetentionMinimum: 0.88
stoneDetailMaximumBoundsCentreShiftRatio: 0.08
stoneDetailMaximumTopSilhouetteAreaDelta: 0.12
stoneDetailMaximumFrontSilhouetteAreaDelta: 0.12
stoneDetailMaximumSideSilhouetteAreaDelta: 0.12

# Broad grooves
stoneDetailGrooveLengthMin: 0.42
stoneDetailGrooveLengthMax: 0.82
stoneDetailGrooveWidthMin: 0.05
stoneDetailGrooveWidthMax: 0.11
stoneDetailGrooveFeatherRatioMin: 0.35
stoneDetailGrooveFeatherRatioMax: 0.65
stoneDetailGrooveStrengthMin: 0.20
stoneDetailGrooveStrengthMax: 0.45
stoneDetailGrooveMinimumWorldWidth: 0.025

# Weathering bands
stoneDetailBandWidthMin: 0.14
stoneDetailBandWidthMax: 0.28
stoneDetailBandFeatherRatioMin: 0.25
stoneDetailBandFeatherRatioMax: 0.50
stoneDetailBandStrengthMin: 0.10
stoneDetailBandStrengthMax: 0.28
stoneDetailBandMinimumWorldWidth: 0.05

# Hairline cracks
stoneDetailCrackSegmentCountMin: 2
stoneDetailCrackSegmentCountMax: 4
stoneDetailCrackLengthMin: 0.35
stoneDetailCrackLengthMax: 0.75
stoneDetailCrackWidthMin: 0.008
stoneDetailCrackWidthMax: 0.018
stoneDetailCrackPointJitterMin: 0.04
stoneDetailCrackPointJitterMax: 0.11
stoneDetailCrackFeatherRatioMin: 0.25
stoneDetailCrackFeatherRatioMax: 0.50
stoneDetailCrackStrengthMin: 0.45
stoneDetailCrackStrengthMax: 0.80
stoneDetailCrackMinimumWorldWidth: 0.008

# Shallow recesses
stoneDetailRecessRadiusUMin: 0.10
stoneDetailRecessRadiusUMax: 0.22
stoneDetailRecessRadiusVMin: 0.08
stoneDetailRecessRadiusVMax: 0.18
stoneDetailRecessFeatherRatioMin: 0.30
stoneDetailRecessFeatherRatioMax: 0.60
stoneDetailRecessStrengthMin: 0.15
stoneDetailRecessStrengthMax: 0.35
stoneDetailRecessMinimumWorldDiameter: 0.06

# Coverage and numeric validation
stoneDetailSafeBorder: 0.08
stoneDetailMaximumTotalCoverage: 0.34
stoneDetailMaximumCrackCoverage: 0.08
stoneDetailCoverageGridResolution: 32
stoneDetailAnalysisEpsilon: 0.00001
stoneDetailFingerprintQuantization: 0.000001

# Archetype counts and geometric scale
stoneRoundedBoulderGeometricKind: edge-chip
stoneRoundedBoulderGeometricCountMin: 0
stoneRoundedBoulderGeometricCountMax: 1
stoneRoundedBoulderGeometricDepthScale: 1.00
stoneRoundedBoulderGrooveCountMin: 1
stoneRoundedBoulderGrooveCountMax: 1
stoneRoundedBoulderBandCountMin: 1
stoneRoundedBoulderBandCountMax: 1
stoneRoundedBoulderCrackCountMin: 0
stoneRoundedBoulderCrackCountMax: 1
stoneRoundedBoulderRecessCountMin: 0
stoneRoundedBoulderRecessCountMax: 1

stoneSquashedPebbleGeometricKind: none
stoneSquashedPebbleGeometricCountMin: 0
stoneSquashedPebbleGeometricCountMax: 0
stoneSquashedPebbleGeometricDepthScale: 1.00
stoneSquashedPebbleGrooveCountMin: 0
stoneSquashedPebbleGrooveCountMax: 1
stoneSquashedPebbleBandCountMin: 1
stoneSquashedPebbleBandCountMax: 2
stoneSquashedPebbleCrackCountMin: 0
stoneSquashedPebbleCrackCountMax: 0
stoneSquashedPebbleRecessCountMin: 0
stoneSquashedPebbleRecessCountMax: 1

stoneFlatGroundStoneGeometricKind: edge-chip
stoneFlatGroundStoneGeometricCountMin: 0
stoneFlatGroundStoneGeometricCountMax: 1
stoneFlatGroundStoneGeometricDepthScale: 0.90
stoneFlatGroundStoneGrooveCountMin: 0
stoneFlatGroundStoneGrooveCountMax: 1
stoneFlatGroundStoneBandCountMin: 1
stoneFlatGroundStoneBandCountMax: 1
stoneFlatGroundStoneCrackCountMin: 1
stoneFlatGroundStoneCrackCountMax: 1
stoneFlatGroundStoneRecessCountMin: 0
stoneFlatGroundStoneRecessCountMax: 1

stoneBroadSlabGeometricKind: end-chip
stoneBroadSlabGeometricCountMin: 1
stoneBroadSlabGeometricCountMax: 1
stoneBroadSlabGeometricDepthScale: 1.00
stoneBroadSlabGrooveCountMin: 1
stoneBroadSlabGrooveCountMax: 1
stoneBroadSlabBandCountMin: 1
stoneBroadSlabBandCountMax: 1
stoneBroadSlabCrackCountMin: 1
stoneBroadSlabCrackCountMax: 1
stoneBroadSlabRecessCountMin: 0
stoneBroadSlabRecessCountMax: 0

stoneWeatheredBlockGeometricKind: corner-chip
stoneWeatheredBlockGeometricCountMin: 1
stoneWeatheredBlockGeometricCountMax: 2
stoneWeatheredBlockGeometricDepthScale: 1.15
stoneWeatheredBlockGrooveCountMin: 0
stoneWeatheredBlockGrooveCountMax: 1
stoneWeatheredBlockBandCountMin: 1
stoneWeatheredBlockBandCountMax: 1
stoneWeatheredBlockCrackCountMin: 1
stoneWeatheredBlockCrackCountMax: 2
stoneWeatheredBlockRecessCountMin: 1
stoneWeatheredBlockRecessCountMax: 1

stoneTaperedBlockGeometricKind: top-chip
stoneTaperedBlockGeometricCountMin: 1
stoneTaperedBlockGeometricCountMax: 1
stoneTaperedBlockGeometricDepthScale: 1.00
stoneTaperedBlockGrooveCountMin: 1
stoneTaperedBlockGrooveCountMax: 1
stoneTaperedBlockBandCountMin: 0
stoneTaperedBlockBandCountMax: 1
stoneTaperedBlockCrackCountMin: 1
stoneTaperedBlockCrackCountMax: 1
stoneTaperedBlockRecessCountMin: 0
stoneTaperedBlockRecessCountMax: 1

stoneWedgeGeometricKind: end-chip
stoneWedgeGeometricCountMin: 0
stoneWedgeGeometricCountMax: 1
stoneWedgeGeometricDepthScale: 0.95
stoneWedgeGrooveCountMin: 1
stoneWedgeGrooveCountMax: 1
stoneWedgeBandCountMin: 1
stoneWedgeBandCountMax: 1
stoneWedgeCrackCountMin: 1
stoneWedgeCrackCountMax: 1
stoneWedgeRecessCountMin: 0
stoneWedgeRecessCountMax: 0

stoneLeaningShardGeometricKind: crown-chip
stoneLeaningShardGeometricCountMin: 1
stoneLeaningShardGeometricCountMax: 1
stoneLeaningShardGeometricDepthScale: 1.10
stoneLeaningShardGrooveCountMin: 1
stoneLeaningShardGrooveCountMax: 1
stoneLeaningShardBandCountMin: 0
stoneLeaningShardBandCountMax: 1
stoneLeaningShardCrackCountMin: 1
stoneLeaningShardCrackCountMax: 2
stoneLeaningShardRecessCountMin: 0
stoneLeaningShardRecessCountMax: 0

stoneTallMonolithGeometricKind: edge-chip
stoneTallMonolithGeometricCountMin: 0
stoneTallMonolithGeometricCountMax: 1
stoneTallMonolithGeometricDepthScale: 1.00
stoneTallMonolithGrooveCountMin: 1
stoneTallMonolithGrooveCountMax: 2
stoneTallMonolithBandCountMin: 1
stoneTallMonolithBandCountMax: 1
stoneTallMonolithCrackCountMin: 1
stoneTallMonolithCrackCountMax: 1
stoneTallMonolithRecessCountMin: 0
stoneTallMonolithRecessCountMax: 1

stoneTriangularPeakGeometricKind: crown-chip
stoneTriangularPeakGeometricCountMin: 0
stoneTriangularPeakGeometricCountMax: 1
stoneTriangularPeakGeometricDepthScale: 0.85
stoneTriangularPeakGrooveCountMin: 1
stoneTriangularPeakGrooveCountMax: 1
stoneTriangularPeakBandCountMin: 0
stoneTriangularPeakBandCountMax: 1
stoneTriangularPeakCrackCountMin: 1
stoneTriangularPeakCrackCountMax: 1
stoneTriangularPeakRecessCountMin: 0
stoneTriangularPeakRecessCountMax: 0

stoneBroadPlatformGeometricKind: edge-chip
stoneBroadPlatformGeometricCountMin: 1
stoneBroadPlatformGeometricCountMax: 1
stoneBroadPlatformGeometricDepthScale: 0.90
stoneBroadPlatformGrooveCountMin: 1
stoneBroadPlatformGrooveCountMax: 1
stoneBroadPlatformBandCountMin: 1
stoneBroadPlatformBandCountMax: 1
stoneBroadPlatformCrackCountMin: 1
stoneBroadPlatformCrackCountMax: 1
stoneBroadPlatformRecessCountMin: 1
stoneBroadPlatformRecessCountMax: 1

stoneTaperedPillarGeometricKind: top-chip
stoneTaperedPillarGeometricCountMin: 0
stoneTaperedPillarGeometricCountMax: 1
stoneTaperedPillarGeometricDepthScale: 1.00
stoneTaperedPillarGrooveCountMin: 1
stoneTaperedPillarGrooveCountMax: 1
stoneTaperedPillarBandCountMin: 1
stoneTaperedPillarBandCountMax: 1
stoneTaperedPillarCrackCountMin: 1
stoneTaperedPillarCrackCountMax: 1
stoneTaperedPillarRecessCountMin: 0
stoneTaperedPillarRecessCountMax: 1
```

### Configuration types

`StoneDetailConfig.ts` must group values into immutable sections:

```ts
export interface StoneDetailSemanticConfig { /* semantic keys */ }
export interface StoneDetailEdgeConfig { /* edge keys */ }
export interface StoneDetailGeometricConfig { /* cut and delta keys */ }
export interface StoneGrooveConfig { /* groove keys */ }
export interface StoneBandConfig { /* band keys */ }
export interface StoneCrackConfig { /* crack keys */ }
export interface StoneRecessConfig { /* recess keys */ }
export interface StoneDetailValidationConfig { /* coverage keys */ }

export interface StoneArchetypeDetailCounts {
  readonly geometricKind: StoneGeometricDetailKind | "none";
  readonly geometricCountMinimum: number;
  readonly geometricCountMaximum: number;
  readonly geometricDepthScale: number;
  readonly grooveCount: Readonly<StoneIntegerRange>;
  readonly bandCount: Readonly<StoneIntegerRange>;
  readonly crackCount: Readonly<StoneIntegerRange>;
  readonly recessCount: Readonly<StoneIntegerRange>;
}

export interface StoneDetailConfig {
  readonly version: 1;
  readonly recipeVersion: 1;
  readonly maximumAttempts: number;
  readonly maximumSurfaceDetails: number;
  readonly maximumGeometricDetails: number;
  readonly semantic: Readonly<StoneDetailSemanticConfig>;
  readonly edge: Readonly<StoneDetailEdgeConfig>;
  readonly geometric: Readonly<StoneDetailGeometricConfig>;
  readonly groove: Readonly<StoneGrooveConfig>;
  readonly band: Readonly<StoneBandConfig>;
  readonly crack: Readonly<StoneCrackConfig>;
  readonly recess: Readonly<StoneRecessConfig>;
  readonly validation: Readonly<StoneDetailValidationConfig>;
  readonly archetypes:
    Readonly<Record<StoneArchetypeId, StoneArchetypeDetailCounts>>;
}
```

Define explicit fields in the real interfaces. Do not use index signatures for numeric configuration groups.

### Configuration loader requirements

`StoneDetailConfigLoader` must:

- expose `load(url = "./config/stone-details.yaml")`;
- expose `parse(source: string)` publicly for verification;
- use `FlatConfig`;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- return a recursively frozen configuration;
- reject non-finite values;
- reject non-integer integer fields;
- reject invalid enum strings;
- identify the key or relationship in every error.

Apply these cross-field validations exactly:

1. Config and recipe versions equal `1`.
2. Maximum attempts is an integer from `1` through `16`.
3. Maximum surface details is an integer from `1` through `16`.
4. Maximum geometric details is an integer from `0` through `4`.
5. Top-normal minimum is greater than `0` and at most `1`.
6. Side-normal maximum is from `0` through `1` and less than top-normal minimum.
7. Region area ratios are greater than `0` and less than `1`.
8. UV padding is at least `0` and less than `0.25`.
9. Minimum UV span is positive and less than `1 - 2 * padding`.
10. Ridge minimum angle is greater than `0`.
11. Ridge maximum angle is less than `180` and greater than the minimum.
12. Ridge length ratio and ground-clearance ratio are from `0` through `1`.
13. Outer-profile horizontal-normal minimum is from `0` through `1`.
14. Geometric depth range is positive and maximum is at most `0.15`.
15. Geometric normal Y range satisfies `0 <= min <= max < 1`.
16. Upward-bias range is non-negative and maximum is at most `1`.
17. Both separation-dot maxima are greater than `0` and less than `1`.
18. Existing-cut separation maximum is greater than or equal to geometric-detail separation maximum.
19. Every retention minimum is greater than `0` and at most `1`.
20. Every silhouette delta and centre-shift maximum is greater than or equal to `0` and less than `0.5`.
21. Every scalar minimum is less than or equal to its paired maximum.
22. Groove, band, crack, and recess normalized widths and radii are positive and less than `0.5`.
23. Groove and crack lengths are positive and at most `1`.
24. Crack segment counts are integers satisfying `2 <= min <= max <= 4`.
25. Feather ratios are greater than `0` and at most `1`.
26. Strengths are from `0` through `1`.
27. Minimum world feature values are positive.
28. Safe border is at least UV padding and less than `0.25`.
29. Maximum total coverage is greater than `0` and less than `0.6`.
30. Maximum crack coverage is greater than `0` and less than maximum total coverage.
31. Coverage-grid resolution is an integer from `8` through `128`.
32. Analysis epsilon and fingerprint quantization are positive.
33. Fingerprint quantization is not smaller than analysis epsilon divided by `100`.
34. Every archetype count range contains non-negative integers.
35. Every per-kind maximum is at most the global surface-detail maximum.
36. Sum of each archetype's four surface-detail maxima is at most the global surface-detail maximum.
37. Geometric count maximum is at most the global geometric-detail maximum.
38. `geometricKind === "none"` requires both geometric counts to be zero.
39. A non-`none` geometric kind requires geometric count maximum greater than zero.
40. Geometric depth scale is positive and at most `2`.
41. All twelve canonical archetype IDs have one configuration entry.

## Archetype detail catalogue

`StoneDetailCatalog.ts` contains non-numeric artistic intent. Numeric ranges remain in YAML.

Use this exact catalogue:

| Archetype | Groove target / orientation | Band target / orientation | Crack target / orientation | Recess target |
| --- | --- | --- | --- | --- |
| rounded-boulder | `side, upper, cut` / `ridge-parallel` | `side, upper` / `horizontal` | `top, cut, upper` / `random` | `side, upper` |
| squashed-pebble | `top, upper` / `long-axis` | `top, upper` / `long-axis` | none | `top, upper` |
| flat-ground-stone | `top, upper, side` / `long-axis` | `top, upper` / `long-axis` | `top, cut` / `cross-axis` | `side, upper` |
| broad-slab | `top, side` / `long-axis` | `side, upper` / `long-axis` | `top, cut` / `cross-axis` | none |
| weathered-block | `side, cut` / `vertical` | `side, upper` / `horizontal` | `top, side, cut` / `random` | `side, cut` |
| tapered-block | `side, upper` / `vertical` | `upper, side` / `horizontal` | `top, cut` / `random` | `side, upper` |
| wedge | `top, cut, side` / `long-axis` | `side, upper` / `diagonal-positive` | `top, cut` / `cross-axis` | none |
| leaning-shard | `side, cut` / `vertical` | `side, upper` / `vertical` | `side, cut` / `vertical` | none |
| tall-monolith | `side, cut` / `vertical` | `side, upper` / `horizontal` | `side, cut` / `vertical` | `side, cut` |
| triangular-peak | `side, cut, upper` / `vertical` | `upper, side` / `ridge-parallel` | `cut, side` / `ridge-parallel` | none |
| broad-platform | `top, upper` / `long-axis` | `top, upper` / `long-axis` | `top, cut` / `cross-axis` | `top, upper` |
| tapered-pillar | `side, cut` / `vertical` | `side, upper` / `horizontal` | `side, cut` / `vertical` | `side, cut` |

Requirements:

- Target semantic lists are ordered priorities.
- `none` means the configured count must be zero.
- Do not randomly choose a semantic outside the ordered list.
- Use later priority entries only when earlier entries have no eligible region.
- Reuse of one region by multiple detail kinds is allowed.
- Two details of the same kind should use different eligible regions when at least two exist.

## Semantic region construction

`StoneSemanticClassifier` consumes a validated `StoneCoreBuildArtifact`.

### Per-face metrics

For every source face:

1. Read the shared polygon positions in face order.
2. Calculate the final face normal with Newell's method.
3. Calculate polygon area.
4. Calculate the area-weighted 3D centroid by triangulating from the first polygon vertex only for metric calculation.
5. Calculate minimum and maximum Y.
6. Calculate area ratio as `faceArea / totalSurfaceArea`.
7. Classify semantic by plane role and ID.
8. Set orientation and cut flags.
9. Build the region basis.
10. Set detail eligibility after all global metrics are available.

Do not use rendered normals for semantic classification.

### Detail eligibility

A region is detail eligible when all conditions are true:

- semantic is not `underside`;
- semantic is not `contact`;
- area ratio is at least `regionMinimumAreaRatio`;
- both unpadded region coordinate spans are at least `regionMinimumUvSpan` metres;
- the region polygon has at least three vertices;
- no position or metric is non-finite.

Set `DETAIL_ELIGIBLE` when these pass.

### Dominant regions

Candidate regions must have area ratio at least `dominantRegionMinimumAreaRatio`.

Select:

- dominant top: largest area among `top`, then `upper`, then top-facing `cut` or `detail-cut`;
- dominant side: largest area among `side`, then side-facing `cut` or `detail-cut`;
- dominant cut: largest area among `cut` and `detail-cut`.

Use semantic priority before area. Break area ties within epsilon by region key lexicographic order.

Set `DOMINANT` on every selected dominant region. One region may satisfy more than one dominant category.

Use `null` when no candidate exists.

## Region-space coordinates

`StoneRegionUvBuilder` creates one planar basis per polygon.

### Side-like regions

For `contact`, `side`, `upper`, `cut`, and `detail-cut`:

1. Project world up `(0, 1, 0)` onto the face plane:

```ts
const projectedUp = up - normal * dot(up, normal);
```

2. When projected-up length is greater than analysis epsilon, normalize it as `bitangent`.
3. Otherwise use the top-like fallback below.
4. Calculate `tangent = normalize(cross(bitangent, normal))`.
5. If `dot(bitangent, up) < 0`, negate both tangent and bitangent.
6. If `abs(dot(tangent, +X)) > analysisEpsilon`, require `dot(tangent, +X) >= 0`; otherwise require `dot(tangent, +Z) >= 0`. When the requirement fails, negate tangent only and recalculate `bitangent = cross(normal, tangent)`.

### Top-like regions

For `top`, `underside`, and the side-like fallback:

1. Project `+X` onto the face plane.
2. If its length is too small, project `+Z`.
3. Normalize the projection as tangent.
4. Require tangent to point toward `+X` when possible, otherwise toward `+Z`.
5. Calculate `bitangent = normalize(cross(normal, tangent))`.
6. For `underside`, preserve the same X/Z orientation used by top faces. Do not mirror it merely because the normal points down.

### Origin and extents

- Region origin is the face centroid.
- Project every polygon vertex relative to origin onto tangent and bitangent.
- Store exact unpadded minimum and maximum U and V.
- Require both spans to exceed analysis epsilon.

### Vertex UV conversion

For projected coordinate `u`:

```ts
const normalizedU =
  padding +
  ((u - minimumU) / (maximumU - minimumU)) *
    (1 - 2 * padding);
```

Use the same formula for V.

Clamp only values within `analysisEpsilon` of `[0, 1]`. Larger excursions are errors.

The final attribute uses normalized padded values.

## Structural edge reconstruction

`StoneEdgeClassifier` uses polygon boundary loops from `StoneCoreTopology.sharedFaces`.

### Edge collection

For each polygon edge:

1. Use consecutive shared indices with wraparound.
2. Build an undirected numeric key from the sorted pair.
3. Record the owning face index.
4. Require exactly two distinct owning faces for every edge.
5. Ignore repeated ownership from malformed duplicate face edges by reporting an error rather than repairing it.

### Edge metrics

For every valid edge:

- calculate endpoint positions;
- calculate length;
- calculate midpoint;
- direction is normalized from lower shared index endpoint toward higher shared index endpoint;
- calculate adjacent face-normal dot product;
- calculate dihedral angle in degrees with clamped `acos`;
- calculate height ratio as `midpoint.y / stoneHeight`;
- calculate length ratio as `length / max(width, height, depth)`.

### Edge flags

Set `CONTACT` when either adjacent semantic is `underside` or `contact`.

Set `CUT_BOUNDARY` when either adjacent semantic is `cut` or `detail-cut`.

Set `RIDGE` when:

- angle is inside the configured inclusive ridge range;
- neither adjacent semantic is `underside`;
- neither adjacent semantic is `contact`;
- length ratio meets the configured minimum.

Set `OUTER_PROFILE` when:

- neither face is `underside`;
- at least one adjacent face has horizontal normal magnitude at least the configured minimum;
- length ratio meets the configured minimum.

Set `TOP_BOUNDARY` when one adjacent region is `top` or `upper` and the other is not `underside` or `contact`.

Set `DETAIL_ELIGIBLE` when:

- `RIDGE` or `OUTER_PROFILE` is set;
- `CONTACT` is not set;
- height ratio is at least configured ground clearance;
- both adjacent regions exist;
- edge length is finite and positive.

### Detail score

Calculate:

```ts
const angleScore = clamp(
  (dihedralAngleDegrees - ridgeMinimumDegrees) /
    (ridgeMaximumDegrees - ridgeMinimumDegrees),
  0,
  1,
);

const detailScore =
  lengthRatio * 0.45 +
  heightRatio * 0.35 +
  angleScore * 0.20;
```

Clamp to `[0, 1]`.

### Dominant ridge

Select the detail-eligible edge with the highest detail score.

Break ties within analysis epsilon by edge key lexicographic order.

Use `null` when no edge is eligible.

## Geometric detail resolution

`StoneGeometricDetailBuilder` resolves optional extra cuts from the accepted Phase 2 base semantic model.

### Random root

Use exactly:

```ts
const attemptRandom = new StoneRandom(seed)
  .fork("phase-3-details")
  .fork(archetypeId)
  .fork(`archetype-attempt:${archetypeAttempt}`)
  .fork(`detail-attempt:${detailAttempt}`);
```

Create named children:

```text
geometric-count
geometric:0
geometric:1
surface-counts
surface:groove:0
surface:band:0
surface:crack:0
surface:recess:0
```

Adding one detail kind must not change random values for another kind.

### Count

Resolve the inclusive geometric count from the archetype configuration.

The count must not exceed the global maximum.

When the configured kind is `none`, return an empty geometric array without consuming edge-selection random values.

### Candidate ordering

Start with detail-eligible edges or regions required by the geometric pattern.

For every candidate calculate:

```ts
selectionScore = baseDetailScore + random.nextFloat() * 0.08;
```

Sort descending by selection score, then edge or region key lexicographically.

Do not use weighted roulette.

### Normal Y clamping

Given a raw outward normal:

1. Normalize it.
2. Clamp Y to the configured geometric normal range.
3. Normalize the horizontal XZ direction.
4. When horizontal magnitude is too small, use the normalized candidate midpoint XZ direction.
5. When that is also too small, use positive X.
6. Reconstruct unit normal with horizontal magnitude `sqrt(1 - y²)`.

### `edge-chip`

Candidates are detail-eligible edges.

For a selected edge with adjacent face normals `n0` and `n1`:

```ts
rawNormal = normalize(
  n0 + n1 + up * resolvedUpwardBias,
);
```

Use the highest-ranked unused edge.

### `corner-chip`

Candidates must additionally satisfy:

- dihedral angle at least `55` degrees;
- both adjacent regions are one of `side`, `upper`, `top`, `cut`, or `detail-cut`;
- at least one adjacent region is `side` or `cut`.

Use the same normal formula as `edge-chip`.

### `end-chip`

Candidates are detail-eligible regions with semantic `side`, `cut`, or `detail-cut`.

Score end preference with:

```ts
endScore =
  abs(region.centroid.x) /
  max(abs(bounds.min.x), abs(bounds.max.x), analysisEpsilon);
```

Use:

```ts
selectionScore =
  region.areaRatio * 0.45 +
  endScore * 0.45 +
  random.nextFloat() * 0.10;
```

Raw normal is:

```ts
region.normal + up * resolvedUpwardBias
```

### `top-chip`

Candidates are detail-eligible edges with `TOP_BOUNDARY`.

Identify the non-top adjacent face normal as `sideNormal`. When both are top-like, use the face with smaller normal Y.

Use:

```ts
rawNormal = sideNormal * 0.72 + up * 0.28;
```

Then apply the resolved upward bias before Y clamping.

### `crown-chip`

Candidates are detail-eligible ridge edges.

Prefer midpoint height through:

```ts
selectionScore =
  edge.detailScore * 0.55 +
  heightRatio * 0.35 +
  random.nextFloat() * 0.10;
```

Use adjacent-normal sum plus upward bias.

### Depth

Resolve base depth uniformly from the global geometric depth range.

Multiply by the archetype depth scale.

Clamp to the global configured range after scaling.

### Normal separation

A new geometric normal may not have dot product greater than:

- `geometricNormalSeparationDotMaximum` with another Phase 3 geometric normal;
- `existingCutSeparationDotMaximum` with an existing Phase 2 core cut normal.

When separation fails:

1. Rotate the normal horizontal azimuth by the golden angle `2.399963229728653`.
2. Preserve Y.
3. Retry at most three rotations.
4. If still invalid, reject the current detail attempt when the resolved detail count would fall below the archetype minimum.
5. Otherwise omit the optional detail.

### IDs and recipe application

Use IDs:

```text
detail-cut:0
detail-cut:1
```

Append Phase 3 cuts after all Phase 2 cuts.

Clone the accepted Phase 2 core recipe as plain serializable data and replace only the `cuts` array.

Preserve:

- core recipe version;
- seed;
- attempt;
- dimensions;
- profile;
- normal mode;
- crease angle.

Deep-freeze the resulting core recipe before passing it to the core generator.

## Final geometric candidate validation

For each detail attempt:

1. Build final core artifact from the augmented core recipe.
2. Create a temporary standard Phase 1 `BufferGeometry` through the existing adapter.
3. Run Phase 2 geometry analysis.
4. Evaluate against the requested Phase 2 archetype.
5. Require Phase 2 evaluation to remain valid.
6. Build the final semantic model.
7. Calculate geometry-delta metrics against the accepted Phase 2 base result.
8. Reject the detail attempt when any required delta fails.

### Delta metrics

Define:

```ts
export interface StoneDetailGeometryDeltaMetrics {
  readonly volumeRetention: number;
  readonly footprintRetention: number;
  readonly heightRetention: number;
  readonly boundsCentreShiftRatio: number;
  readonly topSilhouetteAreaDelta: number;
  readonly frontSilhouetteAreaDelta: number;
  readonly sideSilhouetteAreaDelta: number;
}
```

Use:

```text
volumeRetention = finalVolume / baseVolume
footprintRetention = finalFootprintArea / baseFootprintArea
heightRetention = finalHeight / baseHeight
```

Bounds centre is the midpoint of the exact AABB.

```text
boundsCentreShiftRatio =
  distance3(finalBoundsCentre, baseBoundsCentre) /
  max(baseWidth, baseHeight, baseDepth)
```

Projected silhouette areas are:

```text
topArea = topFillRatio * width * depth
frontArea = frontFillRatio * width * height
sideArea = sideFillRatio * depth * height
```

Relative delta is:

```text
abs(finalArea - baseArea) / max(baseArea, analysisEpsilon)
```

Require:

- volume retention at least configured minimum;
- footprint retention at least configured minimum;
- height retention at least configured minimum;
- centre shift at most configured maximum;
- every silhouette delta at most its configured maximum;
- final Phase 2 archetype evaluation valid;
- final Phase 1 validation valid.

Do not accept a geometrically detailed stone merely because its detail is visible. Archetype identity and stable contact take priority.

## Surface detail resolution

Surface details resolve only after the final geometric candidate and final semantic model exist.

### Count order

Resolve counts in this exact order using independent child streams:

1. broad grooves;
2. weathering bands;
3. hairline cracks;
4. shallow recesses.

Resolve each inclusive count from the archetype configuration.

Require total count not to exceed the global maximum.

### Eligible target selection

For each detail kind:

1. Read ordered target semantics and orientation from `StoneDetailCatalog`.
2. Find detail-eligible regions matching the first semantic.
3. If none exist, try the next semantic.
4. Sort candidates by area descending, then region key.
5. Add deterministic selection jitter:

```ts
selectionScore =
  areaRatio * 0.75 +
  normalizedHeight * 0.17 +
  random.nextFloat() * 0.08;
```

6. Sort descending by selection score, then region key.
7. Avoid reusing a region for the same detail kind until all candidates have been used once.
8. When no valid target exists and count minimum is greater than zero, reject the detail attempt.
9. When only an optional count cannot be placed, omit that optional descriptor.

`normalizedHeight` is region centroid Y divided by stone height.

### Orientation vectors

Return a normalized 2D direction.

- `horizontal`: `(1, 0)`.
- `vertical`: `(0, 1)`.
- `long-axis`: choose `(1, 0)` when region U world span is at least V span, otherwise `(0, 1)`.
- `cross-axis`: the perpendicular of `long-axis`.
- `diagonal-positive`: normalize `(1, 1)`.
- `diagonal-negative`: normalize `(1, -1)`.
- `random`: resolve angle uniformly from `0` through `2π`.
- `ridge-parallel`: project the dominant ridge edge direction into the target region tangent and bitangent basis. If no dominant ridge exists or projected length is too small, use `long-axis`.

For multiple descriptors of the same kind on one region, rotate the second direction by exactly `π / 5` before normalization.

### Safe interior

All detail centres and crack points must remain inside:

```text
[safeBorder, 1 - safeBorder]
```

The descriptor footprint must also remain inside this range, except a weathering band may cross the region border along its length because it is conceptually clipped by the polygon.

Reject rather than silently shrink a required descriptor below minimum world feature size.

## Broad groove algorithm

For each groove:

1. Select target region and orientation.
2. Resolve length, width, feather ratio, and strength from configured ranges.
3. Set `featherUv = widthUv * featherRatio`.
4. Resolve centre U and V so the oriented segment plus half width remains inside the safe interior.
5. Try centre placement at most four times using child streams `placement:0` through `placement:3`.
6. Reject the detail attempt when a required groove cannot be placed.
7. Use ID `surface:broad-groove:<index>`.

World width is:

```text
widthUv * min(regionWorldSpanU, regionWorldSpanV)
```

Require it to meet `grooveMinimumWorldWidth`.

## Weathering band algorithm

For each band:

1. Select target region and orientation.
2. Resolve width, feather ratio, and strength.
3. Set `featherUv = widthUv * featherRatio`.
4. Resolve a centre inside the safe interior.
5. Band length is implicit and covers the complete polygon in the direction axis.
6. Use ID `surface:weathering-band:<index>`.

Require world width to meet `bandMinimumWorldWidth`.

## Hairline crack algorithm

For each crack:

1. Select target region and orientation.
2. Resolve segment count inclusively.
3. Resolve total length, width, point jitter, feather ratio, and strength.
4. Set `pointCount = segmentCount + 1`.
5. Resolve a centre that allows the complete unjittered line to remain inside safe borders.
6. For point index `i`, use fraction `i / segmentCount`.
7. Base point runs from `centre - direction * length / 2` to `centre + direction * length / 2`.
8. Endpoints receive zero perpendicular jitter.
9. Interior points receive independent signed perpendicular jitter.
10. Multiply interior jitter by `sin(π * fraction)` so it fades toward endpoints.
11. Clamp only excursions within analysis epsilon. Larger border violations cause a placement retry.
12. Attempt at most four placements.
13. Set `featherUv = widthUv * featherRatio`.
14. Use ID `surface:hairline-crack:<index>`.

Cracks do not branch in Phase 3.

Require world width to meet `crackMinimumWorldWidth`.

## Shallow recess algorithm

For each recess:

1. Select target region.
2. Resolve radius U, radius V, feather ratio, strength, and rotation uniformly.
3. Resolve centre so the rotated ellipse bounding radius remains inside safe borders.
4. Try placement at most four times.
5. Use ID `surface:shallow-recess:<index>`.

World diameter is:

```text
2 * min(
  radiusU * regionWorldSpanU,
  radiusV * regionWorldSpanV,
)
```

Require it to meet `recessMinimumWorldDiameter`.

A shallow recess is a material-space depression descriptor. It must not alter positions or create concavity in Phase 3.

## CPU reference detail fields

`StoneSurfaceDetailField.ts` provides the canonical CPU equations that Phase 4 must port to shader code.

Export:

```ts
export interface StoneSurfaceFieldSample {
  readonly groove: number;
  readonly band: number;
  readonly crack: number;
  readonly recess: number;
  readonly combined: number;
}

export function evaluateStoneSurfaceDetails(
  details: readonly Readonly<StoneSurfaceDetail>[],
  regionId: number,
  uv: Readonly<StoneVec2Readonly>,
): StoneSurfaceFieldSample;
```

### Helpers

Use exact clamped smoothstep:

```ts
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
```

### Segment distance

Use the standard closest-point distance to a finite 2D segment with clamped parameter.

### Broad groove mask

Let `d` be normalized direction and `p = uv - centre`.

```text
along = abs(dot(p, d))
across = abs(dot(p, perpendicular(d)))
```

```text
sideMask =
  1 - smoothstep(width / 2, width / 2 + feather, across)

endMask =
  1 - smoothstep(length / 2, length / 2 + feather, along)

mask = sideMask * endMask * strength
```

### Weathering band mask

Use only distance across the band:

```text
mask =
  (1 - smoothstep(width / 2, width / 2 + feather, across)) *
  strength
```

### Hairline crack mask

Calculate minimum distance to every crack segment.

```text
mask =
  (1 - smoothstep(width / 2, width / 2 + feather, minimumDistance)) *
  strength
```

### Shallow recess mask

Rotate `uv - centre` by negative descriptor rotation.

```text
radius = sqrt((x / radiusU)^2 + (y / radiusV)^2)
mask =
  (1 - smoothstep(1 - featherRatio, 1, radius)) *
  strength
```

### Channel combination

For matching region ID descriptors:

- each kind channel is the maximum mask of that kind;
- `combined` is the maximum of all four channels;
- do not sum masks;
- clamp every channel to `[0, 1]`.

Descriptors targeting other regions contribute zero.

## Detail validation

`StoneDetailValidator` returns all detectable issues in deterministic order.

### Validation issue codes

Use:

```ts
export type StoneDetailValidationCode =
  | "INVALID_SEMANTIC_MODEL"
  | "DUPLICATE_REGION_KEY"
  | "DUPLICATE_EDGE_KEY"
  | "UNMAPPED_TRIANGLE"
  | "INVALID_REGION_BASIS"
  | "INVALID_REGION_UV"
  | "INVALID_DETAIL_TARGET"
  | "INVALID_DETAIL_VALUE"
  | "DETAIL_OUTSIDE_SAFE_BORDER"
  | "FEATURE_TOO_SMALL"
  | "SURFACE_DETAIL_BUDGET_EXCEEDED"
  | "GEOMETRIC_DETAIL_BUDGET_EXCEEDED"
  | "TOTAL_COVERAGE_EXCEEDED"
  | "CRACK_COVERAGE_EXCEEDED"
  | "ARCHETYPE_IDENTITY_LOST"
  | "GEOMETRY_DELTA_EXCEEDED";
```

### Semantic checks

Check in this order:

1. Region count is positive and at most `255`.
2. Region IDs are contiguous from zero.
3. Region keys are unique.
4. Every source face has exactly one region.
5. Every source triangle maps to exactly one region.
6. Exactly one `underside` region exists.
7. At least one non-underside, non-contact region exists.
8. Every region area, centroid, normal, and basis value is finite.
9. Every region normal is unit length within Phase 1 tolerance.
10. Every region basis is orthonormal within `0.0005`.
11. Every structural edge has exactly two different adjacent regions.
12. Edge keys are unique.

### Descriptor checks

For each descriptor in array order:

- target region ID exists;
- target region key matches that ID;
- target region is detail eligible;
- kind-specific values are finite and within configured ranges;
- direction vectors are unit length within `0.0005`;
- points and centres satisfy safe-border rules;
- world feature size meets the configured minimum;
- IDs are unique and match canonical prefixes.

### Coverage checks

For each region containing surface details:

1. Sample a square grid of configured resolution at cell centres.
2. Evaluate canonical detail fields.
3. Count a sample as covered when `combined >= 0.1`.
4. Count crack coverage when `crack >= 0.1`.
5. Divide by total grid samples.
6. Require total coverage at most configured maximum.
7. Require crack coverage at most configured maximum.

Coverage checks use the padded `[0, 1]` region square. Samples outside the polygon are still counted because region UV bounds represent the shader domain; this makes the check conservative.

### Geometry checks

Require every geometry-delta threshold and final Phase 2 evaluation to pass.

Do not downgrade a failed required geometric detail to surface-only detail inside validation.

## Decorated geometry

`StoneDetailGeometryDecorator` creates the Phase 3 `THREE.BufferGeometry` from the final core artifact and semantic model.

### Vertex splitting key

For every final indexed triangle corner, use:

```text
<sourceRenderedVertexIndex>:<sourceFaceIndex>
```

Triangles from the same polygon face share decorated vertices.

Triangles from different polygon faces never share decorated vertices, even when Phase 1 selective normals are equal.

This guarantees constant semantic and region attributes inside every triangle.

### Copied attributes

Copy exactly:

- position from final core render mesh;
- normal from final core render mesh.

Do not change, normalize, average, or recalculate them.

### Added attributes

Add exactly these names:

```text
stoneRegionId
stoneSemantic
stoneRegionUv
stoneFaceNormal
stoneFaceFlags
```

Use:

- `stoneRegionId`: `Uint8BufferAttribute`, item size `1`, normalized `false`.
- `stoneSemantic`: `Uint8BufferAttribute`, item size `1`, normalized `false`.
- `stoneRegionUv`: `Float32BufferAttribute`, item size `2`.
- `stoneFaceNormal`: `Float32BufferAttribute`, item size `3`.
- `stoneFaceFlags`: `Uint8BufferAttribute`, item size `1`, normalized `false`.

Do not add generic `uv` or `color`.

### Index type

Use `Uint16Array` when decorated vertex count is at most `65535`, otherwise `Uint32Array`.

### Geometry metadata

Copy existing compact metadata:

```ts
geometry.userData.stone
geometry.userData.stoneArchetype
```

Add only:

```ts
geometry.userData.stoneDetails = Object.freeze({
  configVersion: 1,
  recipeVersion: 1,
  semanticFingerprint,
  detailFingerprint,
  assetFingerprint,
  regionCount,
  surfaceDetailCount,
  geometricDetailCount,
});
```

Do not store full recipes, semantic region arrays, edge arrays, or detail descriptors in `userData`.

### Bounds

Call:

```ts
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
```

Require bounds to match the final standard core geometry within Phase 1 epsilon.

## Fingerprints

### Semantic fingerprint

`StoneSemanticFingerprint` serializes:

1. semantic schema version;
2. regions in region-ID order;
3. region key;
4. semantic code;
5. flags;
6. quantized area, centroid, normal, and basis vectors;
7. shared indices in polygon order;
8. edges in edge-key order;
9. edge flags and quantized metrics;
10. dominant region and edge keys, using empty string for null.

Use Phase 1's two-accumulator FNV-1a byte strategy and configured quantization.

Return sixteen lowercase hexadecimal digits.

### Detail fingerprint

`StoneDetailFingerprint` serializes:

1. detail recipe version;
2. seed;
3. canonical archetype index;
4. archetype attempt;
5. detail attempt;
6. geometric details in array order;
7. surface details in array order;
8. all strings and quantized numeric values;
9. crack points in point order.

Use the same two-accumulator FNV-1a strategy.

### Asset fingerprint

Calculate from UTF-8 bytes of:

```text
<finalGeometryFingerprint>|<semanticFingerprint>|<detailFingerprint>
```

Use the same dual FNV-1a hash and return sixteen lowercase hexadecimal digits.

The final Phase 1 geometry fingerprint remains available separately.

## Generator result and API

`StoneDetailedGenerator.ts` must export:

```ts
export interface StoneDetailedGenerationResult {
  readonly geometry: THREE.BufferGeometry;
  readonly archetypeRecipe: Readonly<StoneArchetypeRecipe>;
  readonly detailRecipe: Readonly<StoneDetailRecipe>;
  readonly semanticModel: Readonly<StoneSemanticModel>;
  readonly coreMetrics: Readonly<StoneGeometryMetrics>;
  readonly archetypeMetrics:
    Readonly<StoneArchetypeGeometryMetrics>;
  readonly archetypeEvaluation:
    Readonly<StoneArchetypeEvaluationResult>;
  readonly detailDeltaMetrics:
    Readonly<StoneDetailGeometryDeltaMetrics>;
  readonly baseFingerprint: string;
  readonly geometryFingerprint: string;
  readonly semanticFingerprint: string;
  readonly detailFingerprint: string;
  readonly assetFingerprint: string;
  readonly archetypeAttemptsUsed: number;
  readonly detailAttemptsUsed: number;
}

export class StoneDetailedGenerator {
  constructor(
    coreGenerator: StoneCoreGenerator,
    archetypeGenerator: StoneArchetypeGenerator,
    archetypeAnalyzer: StoneArchetypeGeometryAnalyzer,
    archetypeEvaluator: StoneArchetypeEvaluator,
    detailConfig: Readonly<StoneDetailConfig>,
  );

  generate(
    archetypeId: StoneArchetypeId,
    seed: number,
  ): StoneDetailedGenerationResult;
}
```

Do not expose partially resolved mutable builder state.

## Complete generation flow

`generate` must perform this exact sequence:

1. Validate archetype ID and seed through existing contracts.
2. Call Phase 2 `archetypeGenerator.generate(archetypeId, seed)` once.
3. Treat the returned Phase 2 geometry as owned by Phase 3.
4. Record accepted base recipe, metrics, evaluation, fingerprint, and attempts.
5. Build a core artifact from the accepted base core recipe.
6. Verify its fingerprint exactly equals the Phase 2 base fingerprint.
7. Build the base semantic model.
8. Iterate detail attempts from zero through `maximumAttempts - 1`.
9. Resolve geometric detail descriptors from the base semantic model.
10. Clone and augment the core recipe.
11. Build the final core artifact.
12. Create temporary standard core geometry.
13. Analyze and evaluate final archetype identity.
14. Build final semantic model.
15. Calculate geometry-delta metrics.
16. Resolve surface detail descriptors against final semantic model.
17. Build complete deeply frozen detail recipe.
18. Validate semantic model, details, coverage, budgets, deltas, and identity.
19. Decorate final geometry.
20. Calculate fingerprints.
21. Apply compact archetype and detail metadata.
22. Dispose temporary Phase 2 base and temporary standard final geometries.
23. Return the first valid detail result.

On every failed detail attempt:

- dispose the temporary final geometry when created;
- retain no geometry or mutable array from the failed attempt;
- record one immutable structured summary;
- continue to the next deterministic detail attempt.

After all attempts fail, dispose the owned Phase 2 base geometry and throw a retry-limit error.

On success, ownership of only the returned decorated geometry transfers to the caller.

## Error contract

`StoneDetailErrors.ts` must define:

```ts
export type StoneDetailGenerationErrorCode =
  | "INVALID_DETAIL_CONFIG"
  | "INVALID_CORE_ARTIFACT"
  | "SEMANTIC_CLASSIFICATION_FAILED"
  | "EDGE_CLASSIFICATION_FAILED"
  | "GEOMETRIC_DETAIL_FAILED"
  | "SURFACE_DETAIL_FAILED"
  | "DETAIL_VALIDATION_FAILED"
  | "DETAIL_DECORATION_FAILED"
  | "DETAIL_RETRY_LIMIT_EXCEEDED";

export class StoneDetailGenerationError extends Error {
  readonly code: StoneDetailGenerationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- set `name = "StoneDetailGenerationError"`;
- include archetype ID, seed, archetype attempt, and detail attempt when available;
- preserve unexpected original errors as `cause`;
- do not log;
- freeze details and attempt summaries;
- retry-limit details contain exactly one summary per attempted detail recipe.

## Verification architecture

### Script

`scripts/verify-stone-details.mjs` must use Vite SSR in the same style as previous stone verification scripts.

Load:

```text
/src/stones/qa/StoneDetailVerification.ts
```

Call exactly:

```ts
await verification.verifyStoneDetails();
```

Prefix failures with:

```text
[stone-details]
```

Print one success line containing:

- archetype count;
- generated case count;
- unique asset fingerprints;
- maximum detail attempts used;
- maximum region count;
- maximum decorated vertex count;
- maximum surface detail count;
- maximum geometric detail count.

Do not write snapshots or temporary files.

### Verification export

`StoneDetailVerification.ts` must export exactly:

```ts
export async function verifyStoneDetails(): Promise<void>;
```

Use local assertion helpers. Do not add test-only production APIs.

## Mandatory verification matrix

### Previous-phase compatibility

Verify:

1. Run representative Phase 1 seeds `0`, `1`, `42`, `1337`, `0xdeadbeef`, and `0xffffffff`.
2. Generate each through existing `generateFromRecipe` and new `buildArtifactFromRecipe` plus adapter.
3. Require exact equality of recipe JSON, position arrays, normal arrays, index arrays, metrics, and shape fingerprints.
4. Run every Phase 2 fixed gallery case through the unchanged Phase 2 generator.
5. Require Phase 2 generation to remain deterministic.
6. The existing Phase 1 and Phase 2 verification scripts pass without modified expected thresholds.

### Configuration tests

Verify:

- committed YAML parses;
- parsed configuration is recursively frozen;
- removing one key fails;
- duplicating one key fails;
- adding an unknown key fails;
- replacing a number with `NaN` fails;
- maximum attempts `0` fails;
- top-normal minimum below side-normal maximum fails;
- ridge maximum below ridge minimum fails;
- geometric depth maximum above `0.15` fails;
- retention above `1` fails;
- safe border below UV padding fails;
- crack segment minimum below `2` fails;
- sum of one archetype's surface maxima above global maximum fails;
- `none` geometric kind with non-zero count fails;
- non-`none` geometric kind with zero maximum fails;
- coverage grid below `8` fails.

### Core artifact mapping tests

For Phase 1 seed `42` in each normal mode:

- artifact build succeeds;
- standard generated geometry is byte-identical;
- rendered-vertex mapping length equals rendered vertex count;
- rendered-triangle mapping length equals triangle count;
- every rendered shared index is valid;
- every triangle face index is valid;
- every source face owns at least one triangle;
- union of face triangle lists covers every triangle exactly once;
- no topology mapping array is mutated by semantic classification.

### Semantic tests

For every archetype using seeds `0`, `42`, and `1337`:

- classification succeeds;
- semantic model is deeply frozen except owned typed arrays;
- region count equals source polygon count;
- region IDs are contiguous;
- region keys are unique;
- exactly one underside region exists;
- no seed-bound region exists;
- every triangle maps to one region;
- every region basis is orthonormal;
- every polygon vertex converts to UV inside `[0, 1]` within epsilon;
- every structural edge has exactly two owners;
- triangulation diagonals do not appear as structural edges;
- edge keys are unique;
- semantic fingerprint is deterministic;
- at least one region is detail eligible;
- dominant side or dominant top exists;
- all numeric metrics are finite.

### Field-equation fixture tests

Create deterministic hand-authored descriptors and verify:

- groove sample at centre returns groove strength;
- groove sample beyond half width plus feather returns zero;
- groove sample beyond half length plus feather returns zero;
- weathering band centre returns band strength;
- crack sample on a segment midpoint returns crack strength;
- crack sample farther than half width plus feather returns zero;
- recess centre returns recess strength;
- recess sample outside normalized radius one returns zero;
- descriptors targeting another region return zero;
- combined channel uses maximum rather than sum;
- every channel remains in `[0, 1]`.

Use tolerance `0.000001`.

### Single-case determinism

Use:

```text
archetype: weathered-block
seed: 42
```

Generate twice and require exact equality of:

- archetype recipe JSON;
- detail recipe JSON;
- final position attribute;
- final normal attribute;
- final index;
- all five Phase 3 attributes;
- semantic fingerprint;
- detail fingerprint;
- asset fingerprint;
- core metrics;
- archetype metrics;
- delta metrics;
- attempts used.

Dispose both geometries.

### Attribute tests

For the same case:

- generic `uv` is undefined;
- generic `color` is undefined;
- all required namespaced attributes exist;
- position, normal, region ID, semantic, UV, face normal, and flags counts match;
- every triangle has one constant region ID;
- every triangle has one constant semantic code;
- every triangle has one constant face normal within epsilon;
- region UV values are finite and inside `[0, 1]`;
- face-normal values are unit length;
- bounding box and sphere exist;
- compact metadata exists;
- full recipes are not stored in `userData`.

### Archetype template tests

For each archetype and seeds `0` through `31`:

- generation succeeds within detail-attempt limit;
- geometric count is inside its configured range;
- every surface kind count is inside its configured range;
- total counts remain within global budgets;
- every descriptor targets an allowed semantic from the catalogue;
- every descriptor orientation follows the catalogue, except documented fallback from missing ridge to long axis;
- every required minimum count is present;
- semantic, detail, and asset fingerprints are deterministic;
- Phase 2 identity evaluation remains valid;
- every geometry-delta threshold passes;
- coverage thresholds pass;
- minimum feature sizes pass;
- every detail ID is unique;
- every target region key matches target region ID;
- all returned objects are frozen.

This produces `384` successful generated cases.

### Diversity requirements

Across the 384-case batch:

- at least `370` unique asset fingerprints;
- at least `360` unique detail fingerprints;
- every geometric detail kind used by the catalogue appears at least once;
- all four surface detail kinds appear;
- at least one output uses two geometric details;
- at least one output uses six surface details only when an archetype maximum permits six;
- at least one output contains a detail-cut semantic region;
- at least one output has no geometric detail by design;
- at least one output requires more than one detail attempt.

The last condition may be fulfilled by a dedicated boundary fixture when normal production ranges happen to pass first attempt for all batch seeds.

### Geometry-preservation tests

For every batch case:

- final Phase 1 geometry validation has zero issues;
- contact remains exact at `y = 0`;
- one underside polygon remains;
- contact ratio remains valid;
- volume, footprint, and height retention pass;
- centre shift passes;
- projected silhouette deltas pass;
- final archetype evaluation remains valid;
- final shape fingerprint differs from base only when at least one geometric detail cut was applied;
- when geometric detail count is zero, final shape fingerprint equals base fingerprint exactly.

### Failure-path tests

Verify:

- unsupported detail recipe version fails;
- invalid semantic code fails;
- duplicate region key fails;
- duplicate edge key fails;
- unmapped triangle fails;
- zero-length basis vector fails;
- descriptor targeting a missing region fails;
- descriptor targeting an ineligible region fails;
- non-unit direction fails;
- crack with fewer than three points fails;
- feature below minimum world size fails;
- descriptor outside safe border fails;
- total coverage above maximum fails;
- crack coverage above maximum fails;
- geometry retention below minimum fails;
- invalid final archetype evaluation fails;
- impossible required geometric detail reaches retry limit after exactly configured attempts;
- retry-limit details contain one summary per attempt;
- every temporary geometry is disposed on failure, verified with a test adapter spy rather than GPU memory inspection.

### Mutation tests

Verify:

- attempted mutation of frozen ordinary recipe arrays fails or has no effect;
- source core artifact arrays remain unchanged after classification;
- source Phase 2 geometry remains unchanged until the generator disposes it;
- decorating one result does not change another result generated from the same base recipe;
- caller disposal of the returned decorated geometry does not mutate recipes or semantic data.

## Fixed Phase 3 gallery manifest

Add this constant to `StoneDetailCatalog.ts` for later Phase 9 tooling:

```ts
export const STONE_DETAIL_GALLERY_CASES = [
  ["rounded-boulder", 42],
  ["rounded-boulder", 1337],
  ["squashed-pebble", 7],
  ["squashed-pebble", 9001],
  ["flat-ground-stone", 19],
  ["flat-ground-stone", 2048],
  ["broad-slab", 11],
  ["broad-slab", 4096],
  ["weathered-block", 42],
  ["weathered-block", 8192],
  ["tapered-block", 31],
  ["tapered-block", 12345],
  ["wedge", 73],
  ["wedge", 54321],
  ["leaning-shard", 101],
  ["leaning-shard", 22222],
  ["tall-monolith", 151],
  ["tall-monolith", 33333],
  ["triangular-peak", 211],
  ["triangular-peak", 44444],
  ["broad-platform", 271],
  ["broad-platform", 55555],
  ["tapered-pillar", 331],
  ["tapered-pillar", 65535],
] as const;
```

The manifest is data only. Phase 3 does not create a gallery scene.

## Implementation sequence

Implement in this exact order. Keep TypeScript compiling after each step.

### Step 1 — Core artifact refactor

Files:

- `StoneCoreBuildArtifact.ts`
- `StoneCoreTypes.ts`
- `StoneTriangulator.ts`
- `StoneNormalBuilder.ts`
- `StoneCoreGenerator.ts`
- `core/index.ts`

Checks:

- `npx tsc` passes;
- Phase 1 geometry arrays remain exact;
- Phase 1 verifier passes;
- Phase 2 verifier passes.

### Step 2 — Configuration and catalogue

Files:

- `public/config/stone-details.yaml`
- `StoneDetailConfig.ts`
- `StoneDetailConfigLoader.ts`
- `StoneDetailCatalog.ts`

Checks:

- committed YAML parses;
- all cross-field validations exist;
- configuration is frozen.

### Step 3 — Types and errors

Files:

- `StoneDetailTypes.ts`
- `StoneDetailErrors.ts`

Checks:

- no Three.js import in pure type and error files;
- no import cycle.

### Step 4 — Region basis and semantics

Files:

- `StoneRegionUvBuilder.ts`
- `StoneSemanticClassifier.ts`

Checks:

- all Phase 2 archetypes classify;
- exact one-to-one face-to-region mapping;
- UV basis tests pass.

### Step 5 — Structural edges

File:

- `StoneEdgeClassifier.ts`

Checks:

- every polygon edge has two owners;
- no triangulation diagonals;
- edge flags and dominant ridge deterministic.

### Step 6 — Semantic fingerprint

File:

- `StoneSemanticFingerprint.ts`

Checks:

- repeated semantic models hash identically;
- one semantic or basis mutation changes fingerprint.

### Step 7 — Geometric detail builder

File:

- `StoneGeometricDetailBuilder.ts`

Checks:

- all five geometric patterns resolve;
- normal and depth rules pass;
- separation rules pass;
- augmented recipes remain serializable and frozen.

### Step 8 — Surface detail resolver

File:

- `StoneSurfaceDetailResolver.ts`

Checks:

- all four detail kinds resolve;
- target priorities and orientation rules pass;
- safe-border and minimum-feature rules pass.

### Step 9 — CPU field evaluator

File:

- `StoneSurfaceDetailField.ts`

Checks:

- analytic fixture tests pass;
- no dependency on Three.js.

### Step 10 — Validation and fingerprints

Files:

- `StoneDetailValidator.ts`
- `StoneDetailFingerprint.ts`

Checks:

- coverage grid tests pass;
- failure fixtures report expected ordered codes;
- fingerprints are deterministic.

### Step 11 — Geometry decorator

File:

- `StoneDetailGeometryDecorator.ts`

Checks:

- copied positions and normals are exact;
- semantic boundaries are split;
- namespaced attributes validate;
- bounds match source.

### Step 12 — Detailed generator

File:

- `StoneDetailedGenerator.ts`
- `details/index.ts`

Checks:

- ownership and disposal paths are correct;
- all returned data is immutable;
- compact metadata only.

### Step 13 — Verification gate

Files:

- `StoneDetailVerification.ts`
- `verify-stone-details.mjs`
- `package.json`

Checks:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run build
```

All commands must pass.

## Completion report

When implementation finishes, append a completion section to this document containing:

- implementation commit SHA;
- configuration version;
- generated batch case count;
- unique geometry, semantic, detail, and asset fingerprint counts;
- first-attempt detail pass rate per archetype;
- maximum attempts used;
- maximum region and edge counts;
- maximum standard and decorated vertex counts;
- maximum surface and geometric detail counts;
- minimum observed geometry-retention metrics;
- maximum observed silhouette deltas;
- maximum observed surface and crack coverage;
- p50 and p95 generation time, recorded but not gated;
- any approved deviations with explicit reason.

Do not mark Phase 3 complete without this report.

## Definition of done

Phase 3 is complete only when all conditions below are true:

- The core artifact refactor preserves Phase 1 output exactly.
- The Phase 2 generator remains unchanged in behavior.
- Every final polygon maps to one stable semantic region.
- Every triangle maps to exactly one source region.
- Structural edges exclude triangulation diagonals.
- Region-space coordinates are deterministic and valid.
- All four analytic surface-detail kinds are implemented.
- All configured archetype templates generate within bounded attempts.
- Geometric details use only existing convex clipping.
- No result becomes concave, disconnected, non-manifold, or unstable.
- Final stones retain valid Phase 2 archetype identity.
- Contact and silhouette delta budgets pass.
- Detail coverage and minimum-feature budgets pass.
- Decorated geometry contains all five required namespaced attributes.
- Generic `uv` and `color` remain absent.
- Geometry metadata remains compact.
- Shape, semantic, detail, and asset fingerprints are deterministic.
- Required batch diversity thresholds pass.
- All temporary geometries are disposed on success and failure paths.
- Phase 1, Phase 2, Phase 3, TypeScript, and production build gates pass.
- No Phase 4 material or later-phase system has been implemented prematurely.
