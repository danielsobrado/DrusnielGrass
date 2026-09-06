# Procedural Stylized Stones — Phase 2 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Target branch: `main`
- Phase: 2 — archetype shape grammar
- Document authority: implementation contract
- Current state: completed
- Scope owner: art-directed single-body stone archetypes

This document removes implementation choices from Phase 2. The implementer must follow the file layout, public APIs, archetype catalogue, configuration values, deterministic algorithms, evaluation rules, verification matrix, and completion criteria below. A different archetype set, recipe strategy, scoring system, or configuration format requires this document to be changed first.

## Phase objective

Build a deterministic archetype layer on top of the Phase 1 convex stone core.

Phase 2 must turn the generic Phase 1 volume generator into a coherent library of recognisable stone families. Each family must remain visually identifiable from its silhouette and proportions when rendered with one neutral material. The same archetype and seed must always resolve to the same core recipe and geometry.

Phase 2 is successful when the generator produces controlled families rather than unrelated random rocks.

## Required Phase 1 dependency

Phase 2 starts only after Phase 1 is complete and its verifier passes.

The implementation must consume these Phase 1 contracts without replacing them:

- `StoneRandom`
- `StoneRecipe`
- `StoneCoreGenerator.resolveRecipe`
- `StoneCoreGenerator.generateFromRecipe`
- `StoneGenerationResult`
- `StoneGeometryMetrics`
- `StoneGenerationError`
- `StoneConfig`
- `StoneConfigLoader`

The Phase 1 recipe version remains `1`.

Phase 2 must not change the geometry or fingerprint produced by:

```ts
new StoneCoreGenerator(coreConfig).generate(seed)
```

for any seed. The Phase 1 verifier remains the compatibility gate.

## Frozen architectural decisions

The following decisions are final for Phase 2:

1. Phase 2 is a data-driven archetype layer above the Phase 1 core generator.
2. Phase 2 does not fork, duplicate, or replace the half-space clipper.
3. Every Phase 2 stone is one closed, connected, convex core mesh.
4. Compound stones, disconnected fragments, concave shelves, recesses, and clusters are deferred.
5. Every archetype resolves a complete immutable Phase 1 `StoneRecipe` and calls `generateFromRecipe` exactly once per archetype attempt.
6. Phase 2 does not call `StoneCoreGenerator.generate`, because nested retry loops would make attempt accounting unclear.
7. Phase 2 owns its own bounded deterministic retry loop.
8. Archetype random streams are domain-separated by archetype ID, attempt, and responsibility.
9. Archetype definitions are stored in strict flat YAML.
10. The archetype catalogue and canonical order are code constants; tunable numeric values remain in YAML.
11. Archetype selection by biome, environment, or probability is out of scope.
12. The caller must request a specific archetype ID.
13. All local stones use X as width, Y as height, and Z as depth.
14. Placement yaw is deferred to the world-placement phase. Phase 2 recipes do not add a random whole-stone yaw.
15. Shape evaluation is mathematical and deterministic. It does not depend on browser screenshots, GPU rendering, or image comparison.
16. Evaluation uses dimensions, horizontal cross-sections, projected convex silhouettes, lean, top slope, and applied-cut count.
17. Evaluation failure is a generation-attempt failure and causes the next deterministic attempt.
18. Phase 2 does not add materials, colours, UVs, semantic face attributes, LODs, caching, instancing, terrain placement, collision, or editor UI.
19. Phase 2 does not add a testing framework or production dependency.
20. Verification runs through Vite SSR in the same style as Phase 1.
21. No logging occurs inside archetype resolution or evaluation. Failures use typed errors and structured issues.
22. The geometry metadata created by Phase 1 remains unchanged. Phase 2 stores separate archetype metadata under `geometry.userData.stoneArchetype`.

## In scope

Phase 2 includes:

- A canonical set of twelve single-body archetypes.
- Strict archetype configuration.
- Deterministic archetype recipe resolution.
- Organic and rectilinear side-profile grammars.
- Archetype-specific dimension correlations.
- Archetype-specific taper, top profile, contact profile, lean, skew, and tilt ranges.
- Seven controlled cut patterns.
- Archetype geometry analysis.
- Archetype acceptance scoring.
- Bounded retries when a resolved candidate does not match its family.
- Fixed gallery seeds and gallery manifest data.
- Determinism, differentiation, classification, and acceptance tests.
- A production-build verification gate.

## Explicitly out of scope

Do not implement these items in Phase 2:

- Stepped shelf rock.
- Broken block made from separated pieces.
- Two-stone cluster.
- Primary rock with attached fragment.
- Small grouped scatter cluster.
- Concave geometry.
- Boolean subtraction, recesses, cracks, grooves, or notches.
- Surface semantic classification.
- Vertex colours, materials, palettes, texture masks, or shaders.
- LOD generation or impostors.
- Biome weighting or random archetype selection.
- Terrain embedding or terrain-normal alignment.
- Runtime cache, worker, streaming, batching, or instancing.
- Physics or collision geometry.
- A stone bench or editing UI.
- Automatic fallback assets after all attempts fail.
- Wall-clock performance gates. Timings are recorded but not used as pass/fail criteria.

The deferred compound families belong to later phases because they require multiple components or non-convex detail. Do not fake them by producing unstable single convex shapes.

## Canonical archetype catalogue

Use this exact ID union and order:

```ts
export const STONE_ARCHETYPE_IDS = [
  "rounded-boulder",
  "squashed-pebble",
  "flat-ground-stone",
  "broad-slab",
  "weathered-block",
  "tapered-block",
  "wedge",
  "leaning-shard",
  "tall-monolith",
  "triangular-peak",
  "broad-platform",
  "tapered-pillar",
] as const;

export type StoneArchetypeId = (typeof STONE_ARCHETYPE_IDS)[number];
```

Do not rename IDs, add aliases, or change their order in Phase 2.

### Archetype intent

| ID | Required visual identity |
| --- | --- |
| `rounded-boulder` | Balanced organic boulder with broad curved-faceted mass and restrained asymmetry. |
| `squashed-pebble` | Low rounded stone with a wide footprint and soft top profile. |
| `flat-ground-stone` | Broad low field stone that appears partly settled into the ground. |
| `broad-slab` | Long rectangular slab with readable end faces and a mostly level top. |
| `weathered-block` | Chamfered block with broad orthogonal faces and controlled corner damage. |
| `tapered-block` | Block-like lower mass narrowing clearly toward the top. |
| `wedge` | Long low stone with one dominant sloped upper face. |
| `leaning-shard` | Tall narrow asymmetric shard with a strong lean and broken top. |
| `tall-monolith` | Upright substantial stone with restrained lean and block-like stability. |
| `triangular-peak` | Upright pointed stone whose upper area collapses strongly toward an apex. |
| `broad-platform` | Wide stable platform stone with a large readable top plane. |
| `tapered-pillar` | Narrow vertical pillar with controlled taper and a smaller upper section. |

## Required file layout

Create exactly these files:

```text
public/config/stone-archetypes.yaml

src/stones/archetypes/StoneArchetypeTypes.ts
src/stones/archetypes/StoneArchetypeConfig.ts
src/stones/archetypes/StoneArchetypeConfigLoader.ts
src/stones/archetypes/StoneArchetypeCatalog.ts
src/stones/archetypes/StoneArchetypeErrors.ts
src/stones/archetypes/StoneArchetypeProfileBuilder.ts
src/stones/archetypes/StoneArchetypeCutBuilder.ts
src/stones/archetypes/StoneArchetypeRecipeResolver.ts
src/stones/archetypes/StoneCrossSectionAnalyzer.ts
src/stones/archetypes/StoneProjectedSilhouetteAnalyzer.ts
src/stones/archetypes/StoneArchetypeGeometryAnalyzer.ts
src/stones/archetypes/StoneArchetypeEvaluator.ts
src/stones/archetypes/StoneArchetypeGenerator.ts
src/stones/archetypes/index.ts

src/stones/qa/StoneArchetypeVerification.ts
scripts/verify-stone-archetypes.mjs
```

Do not create one large file containing configuration, resolution, analysis, scoring, and generation.

## Package script changes

Add:

```json
"test:stone-archetypes": "node scripts/verify-stone-archetypes.mjs"
```

Update the build command so the Phase 2 gate runs after the Phase 1 gate and before grass verification:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add a dependency.

## Public types

`StoneArchetypeTypes.ts` must define:

```ts
export type StoneSideProfileMode = "organic" | "rectilinear";

export type StoneTopTiltMode =
  | "none"
  | "random"
  | "width"
  | "lean";

export type StoneCutPattern =
  | "weathered"
  | "top-chip"
  | "corner-chip"
  | "end-bevel"
  | "wedge-slope"
  | "shard"
  | "peak-three";

export interface StoneNumberRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface StoneArchetypeDefinition {
  readonly id: StoneArchetypeId;
  readonly enabled: boolean;
  readonly dimensions: Readonly<{
    width: Readonly<StoneNumberRange>;
    depth: Readonly<StoneNumberRange>;
    height: Readonly<StoneNumberRange>;
  }>;
  readonly sideProfileMode: StoneSideProfileMode;
  readonly sideRadiusVariation: Readonly<StoneNumberRange>;
  readonly taper: Readonly<StoneNumberRange>;
  readonly topBevelHeight: Readonly<StoneNumberRange>;
  readonly topScale: Readonly<StoneNumberRange>;
  readonly topTiltMode: StoneTopTiltMode;
  readonly topTilt: Readonly<StoneNumberRange>;
  readonly contactInset: Readonly<StoneNumberRange>;
  readonly contactBevelHeight: Readonly<StoneNumberRange>;
  readonly lean: Readonly<StoneNumberRange>;
  readonly skewMaximum: number;
  readonly cutPattern: StoneCutPattern;
  readonly cutCountMinimum: number;
  readonly cutCountMaximum: number;
  readonly cutDepth: Readonly<StoneNumberRange>;
  readonly cutNormalY: Readonly<StoneNumberRange>;
  readonly evaluation: Readonly<StoneArchetypeEvaluationProfile>;
}

export interface StoneArchetypeRecipe {
  readonly version: 1;
  readonly archetypeId: StoneArchetypeId;
  readonly seed: number;
  readonly attempt: number;
  readonly coreRecipe: Readonly<StoneRecipe>;
}

export interface StoneCrossSectionMetrics {
  readonly yFraction: number;
  readonly area: number;
  readonly centroidX: number;
  readonly centroidZ: number;
  readonly width: number;
  readonly depth: number;
  readonly pointCount: number;
}

export interface StoneArchetypeGeometryMetrics {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly heightFootprintRatio: number;
  readonly widthDepthRatio: number;
  readonly lowerSection: Readonly<StoneCrossSectionMetrics>;
  readonly middleSection: Readonly<StoneCrossSectionMetrics>;
  readonly upperSection: Readonly<StoneCrossSectionMetrics>;
  readonly upperAreaRatio: number;
  readonly middleAreaRatio: number;
  readonly leanRatio: number;
  readonly topSlopeRatio: number;
  readonly topFillRatio: number;
  readonly frontFillRatio: number;
  readonly sideFillRatio: number;
  readonly appliedCutCount: number;
}

export interface StoneArchetypeMetricRange {
  readonly minimum: number;
  readonly maximum: number;
  readonly weight: number;
}

export interface StoneArchetypeEvaluationProfile {
  readonly heightFootprintRatio: Readonly<StoneArchetypeMetricRange>;
  readonly widthDepthRatio: Readonly<StoneArchetypeMetricRange>;
  readonly upperAreaRatio: Readonly<StoneArchetypeMetricRange>;
  readonly middleAreaRatio: Readonly<StoneArchetypeMetricRange>;
  readonly leanRatio: Readonly<StoneArchetypeMetricRange>;
  readonly topSlopeRatio: Readonly<StoneArchetypeMetricRange>;
  readonly topFillRatio: Readonly<StoneArchetypeMetricRange>;
  readonly appliedCutCountMinimum: number;
  readonly appliedCutCountMaximum: number;
}

export type StoneArchetypeEvaluationCode =
  | "INVALID_BOUNDS"
  | "MISSING_CROSS_SECTION"
  | "HEIGHT_FOOTPRINT_OUT_OF_RANGE"
  | "WIDTH_DEPTH_OUT_OF_RANGE"
  | "UPPER_AREA_OUT_OF_RANGE"
  | "MIDDLE_AREA_OUT_OF_RANGE"
  | "LEAN_OUT_OF_RANGE"
  | "TOP_SLOPE_OUT_OF_RANGE"
  | "TOP_FILL_OUT_OF_RANGE"
  | "APPLIED_CUT_COUNT_OUT_OF_RANGE";

export interface StoneArchetypeEvaluationIssue {
  readonly code: StoneArchetypeEvaluationCode;
  readonly message: string;
  readonly actual: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface StoneArchetypeEvaluationResult {
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly StoneArchetypeEvaluationIssue[];
  readonly metrics: Readonly<StoneArchetypeGeometryMetrics>;
}
```

Every returned config, recipe, array, issue list, and result must be deeply frozen.

## Configuration contract

### File format

Create `public/config/stone-archetypes.yaml` as strict flat YAML and parse it through `FlatConfig.parse(source, "stone-archetypes")`.

Use one scalar key per value. Do not encode arrays or comma-separated mini-languages inside scalar values.

Global keys:

```yaml
stoneArchetypeConfigVersion: 1
stoneArchetypeMaximumAttempts: 6
stoneArchetypeLowerSectionFraction: 0.12
stoneArchetypeMiddleSectionFraction: 0.5
stoneArchetypeUpperSectionFraction: 0.85
stoneArchetypeAnalysisEpsilon: 0.00001
stoneArchetypeFirstAttemptPassRateMinimum: 0.8
stoneArchetypeOverallClassificationMinimum: 0.85
stoneArchetypePerTypeClassificationMinimum: 0.75
stoneArchetypeUniqueFingerprintMinimum: 250
```

### Archetype key naming

Use these exact configuration prefixes:

| ID | Prefix |
| --- | --- |
| `rounded-boulder` | `stoneRoundedBoulder` |
| `squashed-pebble` | `stoneSquashedPebble` |
| `flat-ground-stone` | `stoneFlatGroundStone` |
| `broad-slab` | `stoneBroadSlab` |
| `weathered-block` | `stoneWeatheredBlock` |
| `tapered-block` | `stoneTaperedBlock` |
| `wedge` | `stoneWedge` |
| `leaning-shard` | `stoneLeaningShard` |
| `tall-monolith` | `stoneTallMonolith` |
| `triangular-peak` | `stoneTriangularPeak` |
| `broad-platform` | `stoneBroadPlatform` |
| `tapered-pillar` | `stoneTaperedPillar` |

For every prefix, create these exact keys:

```text
<Prefix>Enabled
<Prefix>WidthMin
<Prefix>WidthMax
<Prefix>DepthMin
<Prefix>DepthMax
<Prefix>HeightMin
<Prefix>HeightMax
<Prefix>SideProfileMode
<Prefix>SideRadiusVariationMin
<Prefix>SideRadiusVariationMax
<Prefix>TaperMin
<Prefix>TaperMax
<Prefix>TopBevelHeightMin
<Prefix>TopBevelHeightMax
<Prefix>TopScaleMin
<Prefix>TopScaleMax
<Prefix>TopTiltMode
<Prefix>TopTiltMin
<Prefix>TopTiltMax
<Prefix>ContactInsetMin
<Prefix>ContactInsetMax
<Prefix>ContactBevelHeightMin
<Prefix>ContactBevelHeightMax
<Prefix>LeanMin
<Prefix>LeanMax
<Prefix>SkewMaximum
<Prefix>CutPattern
<Prefix>CutCountMin
<Prefix>CutCountMax
<Prefix>CutDepthMin
<Prefix>CutDepthMax
<Prefix>CutNormalYMin
<Prefix>CutNormalYMax
<Prefix>EvalHeightFootprintMin
<Prefix>EvalHeightFootprintMax
<Prefix>EvalWidthDepthMin
<Prefix>EvalWidthDepthMax
<Prefix>EvalUpperAreaMin
<Prefix>EvalUpperAreaMax
<Prefix>EvalMiddleAreaMin
<Prefix>EvalMiddleAreaMax
<Prefix>EvalLeanMin
<Prefix>EvalLeanMax
<Prefix>EvalTopSlopeMin
<Prefix>EvalTopSlopeMax
<Prefix>EvalTopFillMin
<Prefix>EvalTopFillMax
<Prefix>EvalAppliedCutsMin
<Prefix>EvalAppliedCutsMax
```

All twelve archetypes are enabled in the committed configuration.

### Required generation values

Ranges are inclusive.

| Archetype | Width | Depth | Height | Side mode | Radius variation | Taper | Top bevel | Top scale | Tilt mode / range |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rounded-boulder | 0.90–1.35 | 0.85–1.30 | 0.78–1.18 | organic | 0.08–0.14 | 0.06–0.10 | 0.24–0.34 | 0.74–0.82 | random 0.00–0.035 |
| squashed-pebble | 0.75–1.20 | 0.70–1.15 | 0.45–0.62 | organic | 0.06–0.12 | 0.06–0.09 | 0.20–0.28 | 0.78–0.82 | random 0.00–0.020 |
| flat-ground-stone | 1.05–1.60 | 0.85–1.40 | 0.45–0.58 | organic | 0.07–0.13 | 0.06–0.10 | 0.18–0.24 | 0.72–0.80 | random 0.00–0.030 |
| broad-slab | 1.20–1.60 | 0.55–0.85 | 0.45–0.72 | rectilinear | 0.02–0.05 | 0.06–0.09 | 0.18–0.24 | 0.76–0.82 | width 0.015–0.025 |
| weathered-block | 0.80–1.25 | 0.75–1.20 | 0.72–1.20 | rectilinear | 0.02–0.05 | 0.06–0.09 | 0.18–0.24 | 0.78–0.82 | random 0.00–0.020 |
| tapered-block | 0.75–1.15 | 0.68–1.05 | 0.85–1.35 | rectilinear | 0.02–0.05 | 0.14–0.18 | 0.22–0.30 | 0.60–0.68 | random 0.00–0.020 |
| wedge | 1.00–1.50 | 0.60–0.95 | 0.62–1.00 | rectilinear | 0.03–0.06 | 0.07–0.11 | 0.18–0.24 | 0.72–0.80 | width 0.060–0.080 |
| leaning-shard | 0.45–0.68 | 0.45–0.65 | 1.25–1.60 | organic | 0.04–0.08 | 0.14–0.18 | 0.24–0.34 | 0.58–0.64 | lean 0.040–0.070 |
| tall-monolith | 0.55–0.78 | 0.52–0.76 | 1.25–1.60 | rectilinear | 0.02–0.05 | 0.08–0.12 | 0.20–0.28 | 0.68–0.78 | random 0.00–0.030 |
| triangular-peak | 0.75–1.05 | 0.68–1.00 | 1.05–1.50 | organic | 0.04–0.09 | 0.16–0.18 | 0.28–0.34 | 0.58–0.60 | random 0.020–0.040 |
| broad-platform | 1.30–1.60 | 1.15–1.60 | 0.45–0.65 | rectilinear | 0.02–0.05 | 0.06–0.08 | 0.18–0.22 | 0.80–0.82 | none 0.000–0.000 |
| tapered-pillar | 0.45–0.62 | 0.45–0.62 | 1.10–1.60 | rectilinear | 0.02–0.04 | 0.12–0.17 | 0.24–0.32 | 0.62–0.70 | random 0.00–0.025 |

| Archetype | Contact inset | Contact bevel | Lean | Skew max | Cut pattern | Count | Depth | Normal Y |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rounded-boulder | 0.06–0.10 | 0.12–0.18 | 0.00–0.045 | 0.030 | weathered | 1–2 | 0.04–0.08 | 0.20–0.55 |
| squashed-pebble | 0.07–0.11 | 0.10–0.15 | 0.00–0.025 | 0.025 | top-chip | 1–1 | 0.04–0.06 | 0.55–0.72 |
| flat-ground-stone | 0.08–0.12 | 0.08–0.12 | 0.00–0.020 | 0.030 | weathered | 1–2 | 0.04–0.07 | 0.18–0.48 |
| broad-slab | 0.05–0.08 | 0.08–0.12 | 0.00–0.015 | 0.015 | end-bevel | 1–2 | 0.06–0.10 | 0.18–0.35 |
| weathered-block | 0.05–0.08 | 0.08–0.12 | 0.00–0.020 | 0.015 | corner-chip | 2–3 | 0.05–0.10 | 0.15–0.38 |
| tapered-block | 0.05–0.08 | 0.10–0.15 | 0.00–0.030 | 0.020 | top-chip | 1–2 | 0.05–0.09 | 0.50–0.72 |
| wedge | 0.05–0.08 | 0.08–0.12 | 0.00–0.020 | 0.015 | wedge-slope | 1–2 | 0.04–0.12 | 0.18–0.72 |
| leaning-shard | 0.05–0.07 | 0.12–0.18 | 0.13–0.16 | 0.050 | shard | 2–3 | 0.05–0.12 | 0.20–0.62 |
| tall-monolith | 0.05–0.08 | 0.12–0.17 | 0.03–0.08 | 0.020 | weathered | 1–2 | 0.04–0.08 | 0.20–0.50 |
| triangular-peak | 0.05–0.08 | 0.12–0.18 | 0.02–0.06 | 0.030 | peak-three | 3–3 | 0.10–0.12 | 0.38–0.58 |
| broad-platform | 0.05–0.07 | 0.08–0.11 | 0.00–0.010 | 0.015 | corner-chip | 1–2 | 0.04–0.07 | 0.15–0.30 |
| tapered-pillar | 0.05–0.07 | 0.12–0.18 | 0.02–0.06 | 0.020 | top-chip | 1–2 | 0.05–0.09 | 0.50–0.72 |

### Required evaluation values

Use the exact metric weights below for every archetype:

| Metric | Weight |
| --- | --- |
| Height/footprint ratio | 3 |
| Width/depth ratio | 2 |
| Upper/lower section area | 3 |
| Middle/lower section area | 1 |
| Lean ratio | 2 |
| Top slope ratio | 2 |
| Top-view fill ratio | 1 |

Use these exact hard ranges:

| Archetype | H/footprint | W/D | Upper area | Middle area | Lean | Top slope | Top fill | Applied cuts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rounded-boulder | 0.58–1.25 | 0.75–1.50 | 0.28–0.75 | 0.65–1.00 | 0.00–0.10 | 0.00–0.12 | 0.68–0.92 | 0–2 |
| squashed-pebble | 0.32–0.70 | 0.65–1.75 | 0.42–0.88 | 0.75–1.05 | 0.00–0.08 | 0.00–0.10 | 0.70–0.94 | 0–1 |
| flat-ground-stone | 0.28–0.52 | 0.70–1.90 | 0.35–0.82 | 0.72–1.05 | 0.00–0.08 | 0.00–0.12 | 0.68–0.94 | 0–2 |
| broad-slab | 0.30–0.78 | 1.35–3.10 | 0.42–0.90 | 0.75–1.05 | 0.00–0.07 | 0.00–0.15 | 0.72–0.98 | 1–2 |
| weathered-block | 0.55–1.50 | 0.65–1.75 | 0.50–0.92 | 0.78–1.05 | 0.00–0.07 | 0.00–0.12 | 0.78–0.99 | 1–3 |
| tapered-block | 0.72–1.85 | 0.65–1.75 | 0.18–0.58 | 0.55–0.88 | 0.00–0.10 | 0.00–0.12 | 0.76–0.99 | 0–2 |
| wedge | 0.42–1.05 | 1.15–2.60 | 0.15–0.72 | 0.55–0.95 | 0.00–0.12 | 0.07–0.35 | 0.72–0.99 | 1–2 |
| leaning-shard | 1.75–3.60 | 0.65–1.55 | 0.05–0.42 | 0.42–0.85 | 0.10–0.38 | 0.04–0.30 | 0.66–0.94 | 1–3 |
| tall-monolith | 1.45–3.00 | 0.70–1.55 | 0.28–0.80 | 0.65–0.98 | 0.02–0.20 | 0.00–0.18 | 0.76–0.99 | 0–2 |
| triangular-peak | 0.90–2.00 | 0.70–1.60 | 0.02–0.30 | 0.35–0.75 | 0.00–0.14 | 0.02–0.25 | 0.65–0.94 | 2–3 |
| broad-platform | 0.26–0.55 | 0.75–1.50 | 0.52–0.95 | 0.78–1.05 | 0.00–0.05 | 0.00–0.08 | 0.78–0.99 | 0–2 |
| tapered-pillar | 1.65–3.60 | 0.75–1.35 | 0.12–0.55 | 0.50–0.88 | 0.01–0.18 | 0.00–0.18 | 0.76–0.99 | 0–2 |

### Configuration validation

`StoneArchetypeConfigLoader` must:

- Expose `load(url = "./config/stone-archetypes.yaml")`.
- Expose public `parse(source: string)` for verification.
- Consume every key exactly once.
- Call `assertFullyConsumed()`.
- Return a recursively frozen config.
- Build a `Readonly<Record<StoneArchetypeId, StoneArchetypeDefinition>>`.
- Reject disabled committed archetypes.
- Reject non-finite values.
- Reject invalid booleans, integers, and enum values.

Apply these cross-field rules:

1. Config version equals `1`.
2. Maximum attempts is an integer from 1 through 16.
3. Section fractions satisfy `0 < lower < middle < upper < 1`.
4. Analysis epsilon is positive.
5. Pass-rate and classification thresholds are inside `(0, 1]`.
6. Unique fingerprint minimum is an integer from 1 through 256.
7. Every minimum is less than or equal to its maximum.
8. Every dimension is inside the Phase 1 global safety interval `0.45` through `1.60`.
9. Side-radius variation is inside `0` through `0.14`.
10. Taper is inside `0.06` through `0.18`.
11. Top-bevel height is inside `0.18` through `0.34`.
12. Top scale is inside `0.58` through `0.82`.
13. Top tilt is non-negative and at most `0.08`.
14. `none` tilt requires both tilt values to equal zero.
15. Contact inset is inside `0.05` through `0.12`.
16. Contact-bevel height is inside `0.08` through `0.18`.
17. Lean is inside `0` through `0.16`.
18. Skew maximum is inside `0` through `0.08`.
19. Cut counts are integers satisfying `0 <= min <= max <= 3`.
20. Cut depth is inside `0.04` through `0.12`.
21. Cut normal Y is inside `0.15` through `0.72`.
22. `peak-three` requires cut count exactly `3`.
23. `wedge-slope`, `end-bevel`, and `shard` require at least one cut.
24. Every evaluation metric range has non-zero width except integer cut count.
25. Evaluation weights are the fixed values in this document and are not configurable.
26. Applied-cut evaluation bounds are integers from 0 through 3.
27. Every archetype ID from the canonical catalogue has exactly one definition.

Error messages must include the archetype ID, key, or failed relationship.

## Deterministic archetype recipe resolution

### Public API

`StoneArchetypeRecipeResolver.ts` must export:

```ts
export class StoneArchetypeRecipeResolver {
  constructor(
    coreGenerator: StoneCoreGenerator,
    archetypeConfig: Readonly<StoneArchetypeConfig>,
  );

  resolve(
    archetypeId: StoneArchetypeId,
    seed: number,
    attempt?: number,
  ): Readonly<StoneArchetypeRecipe>;
}
```

### Root streams

Resolve the base Phase 1 recipe first:

```ts
const baseRecipe = coreGenerator.resolveRecipe(seed, attempt);
```

Create the archetype attempt stream with:

```ts
const random = new StoneRandom(seed)
  .fork(`archetype:${archetypeId}`)
  .fork(`attempt:${attempt}`);
```

Use these exact child labels:

```text
dimensions
side-profile
side-angles
side-radii
primary-profile
lean
skew
top-tilt
cuts
cut:0
cut:1
cut:2
```

Do not consume one shared sequential stream across responsibilities.

### Base recipe usage

The resolver must create a new plain recipe object. Do not mutate `baseRecipe`.

Preserve from the base recipe:

- `version`
- `seed`
- `attempt`
- `normalMode`
- `selectiveCreaseAngleDegrees`

Replace dimensions, profile values, and cuts with archetype-controlled values.

### Dimensions

Resolve width, depth, and height independently and uniformly from the archetype ranges.

After resolving, enforce the archetype evaluation dimension ratios before geometry generation:

- Calculate `height / max(width, depth)`.
- Calculate `width / depth`.
- If either is outside the archetype hard evaluation range, deterministically project the value to the nearest valid boundary by changing only height for the first ratio and only depth for the second ratio.
- Clamp the adjusted dimension to `0.45` through `1.60`.
- If both constraints cannot be satisfied after one projection pass, throw `INVALID_ARCHETYPE_RECIPE` for the current attempt.

Do not loop while adjusting dimensions.

### Organic side profile

Use the Phase 1 side count from `baseRecipe.profile.sideAnglesRadians.length`.

1. Resolve one angle offset uniformly from `0` through `2π / N`.
2. Use the Phase 1 configured side-angle jitter maximum.
3. Generate regular angles plus independent jitter.
4. Apply the same cyclic-gap rule and retry labels as Phase 1.
5. Resolve one variation amplitude from the archetype variation range.
6. Generate raw radii around Phase 1 base radius.
7. Apply the Phase 1 cyclic `0.25 / 0.5 / 0.25` smoothing pass.
8. Clamp to `baseRadius * 0.86` through `baseRadius * 1.14`.

### Rectilinear side profile

Use exactly eight side angles:

```ts
angle[i] = i * Math.PI * 0.25;
```

The Phase 1 core must already use eight side planes for the committed configuration. Reject config loading if it does not.

For even indices, which are cardinal normals:

```ts
radius = 0.5 + random.signed(variationAmplitude * 0.35);
```

For odd indices, which are diagonal normals:

```ts
radius = 0.55 + random.signed(variationAmplitude * 0.25);
```

Clamp every rectilinear radius to `0.47` through `0.57`.

Do not smooth rectilinear radii. The alternating support distances create broad orthogonal faces with controlled corner chamfers.

### Primary profile

Resolve uniformly from the configured ranges:

- taper
- top bevel height
- top scale
- contact inset
- contact bevel height

Resolve skew as:

```ts
const skewXZ = skewRandom.signed(definition.skewMaximum);
const skewZX = skewRandom.signed(definition.skewMaximum);
```

Reject when:

```text
1 - skewXZ * skewZX <= 0.5
```

### Lean

Resolve:

```ts
const leanAngle = leanRandom.range(0, Math.PI * 2);
const leanMagnitude = definition.lean.minimum +
  (definition.lean.maximum - definition.lean.minimum) *
  Math.pow(leanRandom.nextFloat(), 1.25);
const leanX = Math.cos(leanAngle) * leanMagnitude;
const leanZ = Math.sin(leanAngle) * leanMagnitude;
```

Store the lean angle locally for `lean` top tilt and shard cuts. Do not add it to the serializable wrapper outside the core recipe.

### Top tilt

Resolve one magnitude uniformly from the configured range.

- `none`: `topTiltX = 0`, `topTiltZ = 0`.
- `random`: choose an independent azimuth and multiply by magnitude.
- `width`: choose sign with `chance(0.5)`, set X to signed magnitude, set Z to zero.
- `lean`: normalize the resolved horizontal lean and multiply by magnitude. If lean magnitude is below analysis epsilon, use positive X.

### Cut pattern algorithms

`StoneArchetypeCutBuilder` must use these exact patterns.

#### `weathered`

- Resolve inclusive configured count.
- Each cut uses independent random azimuth, normal Y, and depth.
- Apply the Phase 1 `dot <= 0.96` separation rule with golden-angle rotations.

#### `top-chip`

- Resolve inclusive configured count.
- Each cut uses random azimuth.
- Resolve normal Y from the configured range.
- Resolve depth from the configured range.
- For a second cut, add the golden angle to its initial azimuth before jitter.

#### `corner-chip`

- Resolve inclusive configured count.
- Shuffle corner indices `0, 1, 2, 3` deterministically.
- Use one unique corner per cut.
- Base azimuth is `π/4 + corner * π/2`.
- Add jitter in `[-0.12, +0.12]` radians.
- Resolve normal Y and depth from configured ranges.

#### `end-bevel`

- Resolve inclusive configured count.
- First cut azimuth is either `0` or `π`.
- If a second cut exists, its azimuth is the opposite end.
- Add jitter in `[-0.08, +0.08]`.
- Resolve normal Y and depth from configured ranges.

#### `wedge-slope`

- Resolve inclusive configured count.
- Main cut azimuth is either `0` or `π`.
- Main cut normal Y is resolved from the upper half of the configured Y range.
- Main cut depth is resolved from the upper half of the configured depth range.
- If a second cut exists, use the opposite azimuth, the lower half of the Y range, and the lower half of the depth range.
- Add no azimuth jitter to the main cut and at most `0.06` radians to the secondary cut.

#### `shard`

- Resolve inclusive configured count.
- Main cut azimuth is `leanAngle + π` wrapped to `[0, 2π)`.
- Main cut uses the upper half of the configured Y and depth ranges.
- Additional cuts use `mainAzimuth ± 2.399963229728653` with jitter in `[-0.08, +0.08]`.
- Additional cuts use the full configured Y and depth ranges.

#### `peak-three`

- Create exactly three cuts.
- Resolve one base azimuth uniformly from `0` through `2π / 3`.
- Cut azimuths are `base`, `base + 2π/3`, and `base + 4π/3`.
- Add independent jitter in `[-0.08, +0.08]`.
- Resolve normal Y and depth from configured ranges.

### Cut construction

For every cut:

```ts
const horizontalMagnitude = Math.sqrt(1 - normalY * normalY);
const normal = {
  x: Math.cos(azimuth) * horizontalMagnitude,
  y: normalY,
  z: Math.sin(azimuth) * horizontalMagnitude,
};
```

Use IDs `cut:0`, `cut:1`, and `cut:2` in final order.

### Resolved recipe

Build a Phase 1 core recipe with:

- version `1`
- original seed and attempt
- resolved dimensions
- resolved side angles and radii
- resolved primary profile
- resolved cuts
- `normalMode: "selective"`
- Phase 1 selective crease angle

Wrap it in `StoneArchetypeRecipe`, deeply freeze it, and return it.

## Geometry analysis

Analysis uses the indexed `THREE.BufferGeometry` produced by Phase 1. It must not modify the geometry.

### Input requirements

- Position attribute exists and has item size 3.
- Index exists.
- Bounding box exists or is computed locally.
- All values are finite.
- Bounds have positive width, height, and depth.

Invalid input throws a typed archetype error. Do not silently return zero metrics.

### Horizontal cross sections

`StoneCrossSectionAnalyzer` evaluates sections at the configured Y fractions `0.12`, `0.50`, and `0.85` of final height.

For every indexed triangle and section plane:

1. Calculate signed Y distances from each vertex to the section plane.
2. Include a vertex exactly on the plane when absolute distance is at most analysis epsilon.
3. Intersect an edge when endpoint signs differ.
4. Interpolate with `t = distanceA / (distanceA - distanceB)`.
5. Collect XZ intersection points.
6. Deduplicate through epsilon quantization.
7. Build an XZ convex hull using the Phase 1 `convexHull2` utility.
8. Require at least three hull points.
9. Calculate area, area-weighted centroid, width, and depth.

Because the core mesh is convex, one convex hull is the complete section. Do not attempt contour stitching or support multiple components.

### Projected silhouettes

`StoneProjectedSilhouetteAnalyzer` projects all unique position values into:

- top view: XZ
- front view: XY
- side view: ZY

For each projection:

1. Deduplicate points using analysis epsilon.
2. Build the 2D convex hull.
3. Calculate hull area.
4. Calculate projected AABB area.
5. Return fill ratio `hullArea / aabbArea`.

Reject zero projected area.

### Derived metrics

Use exact formulas:

```text
heightFootprintRatio = height / max(width, depth)
widthDepthRatio = width / depth
upperAreaRatio = upperSection.area / lowerSection.area
middleAreaRatio = middleSection.area / lowerSection.area
leanRatio = distanceXZ(lower centroid, upper centroid) / max(width, depth)
topFillRatio = top hull area / (width * depth)
frontFillRatio = front hull area / (width * height)
sideFillRatio = side hull area / (depth * height)
```

Top slope ratio:

1. Split unique positions using the bounds-centre X.
2. Find maximum Y on the left and right side.
3. Require at least one point on each side.
4. Calculate:

```text
topSlopeRatio = abs(maxYLeft - maxYRight) / height
```

Copy `appliedCutCount` from Phase 1 geometry metrics.

## Archetype evaluation

### Metric pass rule

A continuous metric passes when:

```text
minimum <= actual <= maximum
```

Applied cut count passes when it is an integer inside its configured inclusive range.

All hard metrics must pass for `valid` to be true.

### Score formula

For each continuous metric range:

```ts
const centre = (minimum + maximum) * 0.5;
const halfWidth = (maximum - minimum) * 0.5;
const normalizedDistance = Math.abs(actual - centre) / halfWidth;
const componentScore = Math.max(0, 1 - normalizedDistance);
```

Multiply by the fixed metric weight and divide the sum by total weight.

Applied cut count contributes weight `2`:

- Score `1` when inside range.
- Score `0` when outside range.

Clamp final score to `[0, 1]`.

Issue ordering must match the metric order in `StoneArchetypeEvaluationProfile`, followed by applied cut count.

### Classification

For QA classification only:

1. Evaluate one generated metric set against every enabled archetype profile.
2. Choose the highest score.
3. Break ties by canonical archetype order.
4. The predicted ID is diagnostic and must not be stored in production geometry metadata.

## Generator API

`StoneArchetypeGenerator.ts` must export:

```ts
export interface StoneArchetypeGenerationResult {
  readonly geometry: THREE.BufferGeometry;
  readonly archetypeRecipe: Readonly<StoneArchetypeRecipe>;
  readonly coreMetrics: Readonly<StoneGeometryMetrics>;
  readonly archetypeMetrics: Readonly<StoneArchetypeGeometryMetrics>;
  readonly evaluation: Readonly<StoneArchetypeEvaluationResult>;
  readonly fingerprint: string;
  readonly attemptsUsed: number;
}

export class StoneArchetypeGenerator {
  constructor(
    coreGenerator: StoneCoreGenerator,
    archetypeConfig: Readonly<StoneArchetypeConfig>,
  );

  listArchetypes(): readonly StoneArchetypeId[];

  resolveRecipe(
    archetypeId: StoneArchetypeId,
    seed: number,
    attempt?: number,
  ): Readonly<StoneArchetypeRecipe>;

  generate(
    archetypeId: StoneArchetypeId,
    seed: number,
  ): StoneArchetypeGenerationResult;
}
```

### Generate flow

For attempts from `0` through `maximumAttempts - 1`:

1. Resolve the archetype recipe for the exact attempt.
2. Call `coreGenerator.generateFromRecipe(coreRecipe)`.
3. Analyze the geometry.
4. Evaluate metrics against the requested archetype.
5. Return immediately when evaluation is valid.
6. Dispose the generated geometry before continuing after an evaluation failure.
7. Record a structured attempt summary for core-generation and evaluation failures.

On success:

- `attemptsUsed = attempt + 1`.
- Do not alter `geometry.userData.stone`.
- Add deeply frozen metadata:

```ts
geometry.userData.stoneArchetype = {
  configVersion: 1,
  archetypeId,
  seed,
  attempt,
  score: evaluation.score,
};
```

After all attempts fail, throw `StoneArchetypeGenerationError` with code `ARCHETYPE_RETRY_LIMIT_EXCEEDED` and one summary per attempt.

Do not return a best-effort invalid stone.

## Error contract

`StoneArchetypeErrors.ts` must define:

```ts
export type StoneArchetypeGenerationErrorCode =
  | "UNKNOWN_ARCHETYPE"
  | "INVALID_ARCHETYPE_CONFIG"
  | "INVALID_ARCHETYPE_RECIPE"
  | "ARCHETYPE_ANALYSIS_FAILED"
  | "ARCHETYPE_EVALUATION_FAILED"
  | "ARCHETYPE_RETRY_LIMIT_EXCEEDED";

export class StoneArchetypeGenerationError extends Error {
  readonly code: StoneArchetypeGenerationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- Set `name = "StoneArchetypeGenerationError"`.
- Include archetype ID, seed, and attempt when available.
- Preserve wrapped errors as `cause`.
- Deep-freeze structured details.
- Do not log from the error class.

## Gallery contract

Phase 2 uses these exact gallery seeds:

```text
0
1
2
5
8
13
21
42
```

The Phase 0 gallery harness must render every archetype and seed with:

- neutral grey material
- no texture
- fixed world scale marker
- front view
- three-quarter view
- side view
- identical camera projection and lighting

Phase 2 code only supplies the canonical archetype order, labels, seeds, geometry, metrics, and recipe metadata. Do not add a Phase 9-style editing interface.

Manual gallery approval requires:

- Every family is recognisable from silhouette without labels.
- No family contains obvious out-of-family candidates.
- All families appear to belong to one coherent asset set.
- Rectilinear families remain stylized rather than looking like perfect primitives.
- Organic families do not look like noise-displaced spheres.
- Ground contact remains broad and stable.

## Verification architecture

Create `scripts/verify-stone-archetypes.mjs` using the same Vite SSR structure as Phase 1.

Load:

```text
/src/stones/qa/StoneArchetypeVerification.ts
```

Export exactly:

```ts
export async function verifyStoneArchetypes(): Promise<void>;
```

Prefix failures with `[stone-archetypes]`.

Print one concise success line containing:

- archetype count
- seed count per archetype
- overall first-attempt pass rate
- overall top-one classification rate
- minimum per-archetype classification rate
- minimum unique fingerprint count
- maximum attempts used

Do not write snapshots or temporary files into the repository.

## Mandatory verification matrix

### Configuration tests

Verify:

1. The committed YAML parses successfully.
2. The config and all nested definitions are frozen.
3. All canonical IDs exist exactly once and are enabled.
4. Removing one key fails.
5. Duplicating one key fails.
6. Adding an unknown key fails.
7. An unknown side-profile mode fails.
8. An unknown top-tilt mode fails.
9. An unknown cut pattern fails.
10. A dimension below `0.45` fails.
11. A dimension above `1.60` fails.
12. Reversed min/max values fail.
13. Invalid section ordering fails.
14. `peak-three` with a cut count other than three fails.
15. `none` tilt with a non-zero value fails.
16. A non-integer cut count fails.
17. An evaluation range with zero width fails.
18. A classification threshold above one fails.

### Catalogue tests

Verify:

- `STONE_ARCHETYPE_IDS` exactly matches the order in this document.
- `listArchetypes()` returns the same frozen order.
- No duplicate ID exists.
- Unknown IDs fail with `UNKNOWN_ARCHETYPE`.

### Recipe determinism tests

For every archetype and these seeds:

```text
0
1
2
42
1337
65535
0xdeadbeef
0xffffffff
```

Verify:

- Resolving twice gives deeply equal recipes.
- Recipe and nested arrays are frozen.
- Core recipe version remains one.
- Core recipe seed and attempt match the request.
- Dimensions remain inside archetype ranges after deterministic projection.
- Side arrays contain exactly eight values.
- Organic angles satisfy cyclic-gap rules.
- Rectilinear angles equal exact 45-degree increments.
- Rectilinear radii stay inside `0.47` through `0.57`.
- Profile values remain inside archetype ranges.
- Cut count and pattern rules are satisfied.
- Cut normals are unit length.
- Attempt zero and attempt one differ.
- Parent-stream consumption does not change child-stream results.

### Fixed generation tests

For each archetype with seed `42`:

1. Generate twice.
2. Require identical archetype recipes.
3. Require identical fingerprints.
4. Require exact equality of positions, normals, and indices.
5. Require valid archetype evaluation.
6. Require no Phase 1 validation issues.
7. Require `geometry.userData.stone` to remain present and unchanged in shape.
8. Require `geometry.userData.stoneArchetype.archetypeId` to match.
9. Require metadata attempt to equal `attemptsUsed - 1`.
10. Dispose both geometries.

### Analyzer tests

Create deterministic synthetic indexed meshes for:

- axis-aligned box
- low slab
- tall rectangular prism
- tapered frustum
- X-sloped wedge

Verify exact or tolerance-bounded values for:

- bounds
- three section areas
- section centroids
- height/footprint ratio
- width/depth ratio
- upper and middle area ratios
- lean ratio
- top slope ratio
- top, front, and side fill ratios

Also verify:

- Missing index fails.
- Empty section fails.
- Non-finite position fails.
- Zero-height bounds fail.
- Analysis does not mutate attributes or indices.

### Evaluation tests

For every archetype profile:

- Midpoint metrics pass with score one.
- Each minimum boundary passes.
- Each maximum boundary passes.
- A value immediately outside every boundary fails with the matching issue code.
- Issue order is stable.
- Applied-cut count outside range fails.
- Classification ties resolve by canonical order.

### Batch generation tests

Generate seeds `0` through `255` for every archetype.

For every result:

- Generation succeeds within six attempts.
- Core geometry remains valid.
- Archetype evaluation is valid.
- A second generation has the same fingerprint and recipe.
- All values are finite.
- No geometry exceeds Phase 1 budgets.
- Ground minimum Y remains zero within Phase 1 tolerance.
- Metadata is correct.
- Geometry is disposed after metrics are recorded.

For each archetype:

- First-attempt pass rate is at least `0.80`.
- Unique fingerprint count is at least `250`.
- Top-one classification accuracy is at least `0.75`.
- At least one result uses the configured minimum cut count.
- At least one result uses the configured maximum cut count when min and max differ.

Across all archetypes:

- Overall top-one classification accuracy is at least `0.85`.
- No two different archetypes produce the same fingerprint for the same seed.
- Maximum attempts used is at most six.
- Record p50 and p95 resolution, core generation, analysis, and total times without gating.

### Pattern-specific tests

Verify:

- `corner-chip` never repeats a corner in one recipe.
- `end-bevel` uses opposite ends when two cuts are present.
- `wedge-slope` main cut uses the upper halves of Y and depth ranges.
- `shard` main cut faces opposite the resolved lean direction within epsilon.
- `peak-three` azimuth separation remains close to 120 degrees after jitter and never violates the Phase 1 normal-similarity rule.
- `top-chip` cut normal Y stays in the configured upper range.

### Failure-path tests

Verify:

- Unknown archetype throws `UNKNOWN_ARCHETYPE`.
- Invalid seed is rejected through the Phase 1 seed contract.
- Attempt below zero or above fifteen fails.
- An impossible evaluation profile reaches `ARCHETYPE_RETRY_LIMIT_EXCEEDED` after exactly six attempts.
- Every failed-attempt summary identifies whether failure came from core generation, analysis, or evaluation.
- Evaluation-failed geometries are disposed before retry.
- No invalid best-effort geometry is returned.

### Backward-compatibility tests

The Phase 2 verifier must run the Phase 1 verifier first or rely on the build order that does so.

Additionally, resolve and generate the Phase 1 seeds:

```text
0
1
42
1337
0xdeadbeef
0xffffffff
```

through the generic Phase 1 generator and assert that Phase 2 imports and catalogue initialization do not change their fingerprints within the same build.

## Implementation sequence

Implement in this exact order. Keep `npx tsc` passing after each step.

### Step 1 — Types, catalogue, and errors

Files:

- `StoneArchetypeTypes.ts`
- `StoneArchetypeCatalog.ts`
- `StoneArchetypeErrors.ts`

Completion checks:

- Canonical ID order is frozen.
- No Three.js import exists in catalogue or config types.
- No import cycle exists.

### Step 2 — Configuration

Files:

- `public/config/stone-archetypes.yaml`
- `StoneArchetypeConfig.ts`
- `StoneArchetypeConfigLoader.ts`

Completion checks:

- Committed YAML parses.
- Every key is consumed.
- Returned config is deeply frozen.

### Step 3 — Profile grammar

File:

- `StoneArchetypeProfileBuilder.ts`

Completion checks:

- Organic and rectilinear golden recipes pass.
- Phase 1 recipe objects are never mutated.

### Step 4 — Cut grammar

File:

- `StoneArchetypeCutBuilder.ts`

Completion checks:

- All seven pattern tests pass.
- Cut normals are finite and unit length.

### Step 5 — Recipe resolver

File:

- `StoneArchetypeRecipeResolver.ts`

Completion checks:

- All catalogue IDs resolve.
- Recipe determinism matrix passes.
- Attempt zero and one differ.

### Step 6 — Cross-section and silhouette analysis

Files:

- `StoneCrossSectionAnalyzer.ts`
- `StoneProjectedSilhouetteAnalyzer.ts`
- `StoneArchetypeGeometryAnalyzer.ts`

Completion checks:

- Synthetic mesh metrics pass.
- Analysis does not mutate geometry.

### Step 7 — Evaluation

File:

- `StoneArchetypeEvaluator.ts`

Completion checks:

- Boundary tests pass.
- Score and issue ordering are deterministic.

### Step 8 — Generator orchestration

File:

- `StoneArchetypeGenerator.ts`

Completion checks:

- Seed-42 matrix passes.
- Retry disposal is proven.
- Metadata is added under the separate key.

### Step 9 — Exports

File:

- `src/stones/archetypes/index.ts`

Export only public catalogue, config, types, generator, resolver, evaluator result types, and errors. Do not export internal builders or analyzers unless QA requires a direct test import.

### Step 10 — Verification and build gate

Files:

- `StoneArchetypeVerification.ts`
- `scripts/verify-stone-archetypes.mjs`
- `package.json`

Completion checks:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run build
```

All must pass.

### Step 11 — Gallery review

Use the fixed gallery seeds and Phase 0 harness.

Completion checks:

- Gallery is complete for all twelve archetypes.
- Manual visual acceptance is recorded in the implementation report.
- No parameter is changed only to hide a verifier failure without updating the committed YAML.

## Required implementation report

The implementing AI must add a completion section to its pull request or final response containing:

- Files created and changed.
- Final commit SHA.
- `npm run test:stone-core` result.
- `npm run test:stone-archetypes` result.
- `npm run build` result.
- First-attempt pass rate per archetype.
- Unique fingerprints per archetype.
- Classification accuracy per archetype and overall.
- Maximum attempts used.
- p50 and p95 generation timings, clearly marked as non-gating.
- Gallery location and manual approval result.
- Any deviation from this contract. A deviation must not be hidden.

## Definition of done

Phase 2 is complete only when all conditions below are true:

- [ ] All twelve canonical archetypes are implemented.
- [ ] Every archetype is configuration-driven.
- [ ] The Phase 1 generic generator output remains unchanged.
- [ ] Archetype and seed reproduce the same recipe and geometry exactly.
- [ ] Every generated candidate is one closed connected convex stone.
- [ ] Every accepted candidate passes Phase 1 validation.
- [ ] Every accepted candidate passes its archetype evaluation.
- [ ] First-attempt pass rate is at least 80% for each archetype.
- [ ] At least 250 unique fingerprints exist per 256-seed batch.
- [ ] Overall top-one classification accuracy is at least 85%.
- [ ] Per-archetype top-one classification accuracy is at least 75%.
- [ ] No same-seed fingerprint collision occurs between different archetypes.
- [ ] All fixed gallery seeds are reviewed.
- [ ] Archetypes are visually recognisable with a neutral material.
- [ ] No Phase 3 feature was introduced early.
- [ ] `npm run test:stone-core` passes.
- [ ] `npm run test:stone-archetypes` passes.
- [ ] `npm run build` passes.

## Phase 2 exit criteria

Phase 2 may be marked complete when a reviewer can identify every family from silhouette alone, the deterministic verification gates pass, the gallery reads as one coherent asset library, and the implementation has introduced no material, detail, LOD, placement, or runtime-system concerns.
