# Procedural Stylized Stones — Phase 5 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Phase 3 contract: `docs/plans/procedural-stones-phase-3.md`
- Phase 4 contract: `docs/plans/procedural-stones-phase-4.md`
- Target branch: `main`
- Phase: 5 — production quality control, rejection, deterministic fallback, and audit
- Document authority: implementation contract
- Current state: completed
- Scope owner: end-to-end production acceptance, advanced geometric quality metrics, material readability checks, deterministic fallback selection, structured diagnostics, and batch audit reporting

This document removes implementation choices from Phase 5. The implementer must follow the file layout, APIs, thresholds, candidate sequence, metric definitions, rejection rules, fallback catalogue, diagnostics schema, audit format, verification matrix, lifecycle rules, and completion criteria below. A different fallback policy, quality metric, threshold model, report schema, or candidate order requires this document to be changed first.

## Phase objective

Prevent invalid, unstable, visually weak, or stylistically broken procedural stones from reaching runtime systems or baked asset libraries.

Phase 5 wraps the completed Phase 1–4 pipeline with one production acceptance layer. It must:

1. Generate a normal Phase 4 material-ready candidate.
2. Measure structural, support, thickness, overhang, topology, silhouette, symmetry, underside, and material-readability quality.
3. Reject candidates that violate the requested archetype's hard quality profile.
4. Try a finite deterministic sequence of replacement candidates.
5. Use approved same-archetype canonical fallback seeds when normal deterministic rerolls fail.
6. Return one accepted production asset with an immutable quality report and compact metadata.
7. Throw a structured terminal error only when every normal and canonical fallback candidate fails.
8. Produce deterministic machine-readable and human-readable batch audit reports.

The phase must never spin until a random candidate happens to pass. Every candidate seed and every stopping condition is predetermined.

## Required dependency state

Phase 5 starts only after these gates pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
```

The implementation consumes these contracts without replacing them:

- `StoneRandom`
- `hashStoneLabel`
- `mixStoneUint32`
- `StoneDetailedGenerator`
- `StoneDetailedGenerationResult`
- `StoneSemanticModel`
- `StoneDetailRecipe`
- `StoneArchetypeId`
- `STONE_ARCHETYPE_IDS`
- `StoneMaterialGenerator`
- `StoneMaterialGenerationResult`
- `StoneMaterialRecipe`
- `StoneResolvedPalette`
- `StonePaletteId`
- `STONE_PALETTE_IDS`
- `StoneStylizedMaterial`
- Phase 1 geometry validation, metrics, and fingerprints
- Phase 2 archetype evaluation and metrics
- Phase 3 semantic and detail fingerprints
- Phase 4 material and material-asset fingerprints

Versions remain:

- Phase 1 core recipe: `1`
- Phase 2 archetype recipe: `1`
- Phase 3 detail recipe: `1`
- Phase 4 material recipe: `1`
- Phase 4 shader: `1`
- Phase 5 quality profile: `1`
- Phase 5 audit report: `1`

## Compatibility contract

Phase 5 is a wrapper. It must not alter earlier generators.

These calls must remain byte-for-byte and value-for-value compatible with their previous contracts:

```ts
new StoneCoreGenerator(coreConfig).generate(seed)
```

```ts
new StoneArchetypeGenerator(
  coreGenerator,
  archetypeConfig,
).generate(archetypeId, seed)
```

```ts
new StoneDetailedGenerator(
  coreGenerator,
  archetypeGenerator,
  archetypeAnalyzer,
  archetypeEvaluator,
  detailConfig,
).generate(archetypeId, seed)
```

```ts
new StoneMaterialGenerator(materialConfig).create(
  detailedResult,
  paletteId,
)
```

Phase 5 must not change committed Phase 1–4 numeric configuration or their generation algorithms.

Phase 5 may add compact frozen metadata to the accepted Phase 4 geometry and material under `userData.stoneQuality`. It must not change geometry attributes, indices, bounds, material uniforms, shader source, gradient texture, earlier metadata, or earlier fingerprints.

## Frozen architectural decisions

The following decisions are final:

1. Phase 5 runs after Phase 4 generation and does not replace any earlier validation stage.
2. Existing Phase 1–4 failures remain failures. Phase 5 does not weaken, suppress, or reinterpret them.
3. Advanced geometry quality is evaluated before creating a Phase 4 material whenever possible.
4. Material readability is evaluated after Phase 4 material recipe and palette resolution.
5. Quality evaluation is CPU-only and deterministic.
6. Automated quality acceptance does not depend on GPU rendering, screenshots, browser timing, or frame rate.
7. Phase 5 does not use machine learning, image similarity, OCR, or an external service.
8. Every accepted candidate keeps the requested archetype and requested palette.
9. A fallback may change only the effective generation seed.
10. Phase 5 never silently substitutes another archetype or palette.
11. Candidate order is fixed: requested seed, two deterministic reroll seeds, canonical fallback A, canonical fallback B.
12. At most five candidates are evaluated for one request.
13. Candidate seeds are resolved before candidate generation begins.
14. A candidate is accepted only when every hard quality rule passes.
15. Canonical fallback candidates pass the same quality gate as normal candidates.
16. No fallback bypass or reduced threshold profile exists.
17. A terminal failure throws after the fifth candidate. It does not return an unvalidated stone.
18. Validated committed configuration and canonical fallback seeds must make terminal failure exceptional and indicative of an implementation regression or corrupted configuration.
19. All quality thresholds are configuration-driven through strict flat YAML.
20. Canonical archetype and palette orders remain code constants from earlier phases.
21. Canonical fallback seeds are configuration values and are validated at startup and in verification.
22. Quality metrics use final Phase 3 geometry and final Phase 4 palette/material recipe data.
23. Uniform-density closed-mesh mass properties are sufficient for Phase 5.
24. The support polygon is the final exact ground-contact polygon in XZ.
25. The centre-of-mass projection must lie inside the support polygon with an archetype-specific safety margin.
26. Thickness checks are archetype-specific so legitimate slabs, pebbles, shards, and pillars are not judged by one generic ratio.
27. Overhang checks use deterministic horizontal sections and support-polygon distances.
28. Silhouette complexity uses orthographic convex projections from one top view and eight horizontal azimuths.
29. Symmetry uses support-function reflection comparisons, not vertex-index pairing.
30. Underside concavity is measured from contact polygon area against its XZ convex hull.
31. Material quality evaluates linear working-space colour before lighting and tone mapping.
32. Phase 5 does not alter the Phase 4 shader to fix a rejected material.
33. Rejection diagnostics are structured immutable data.
34. Internal classes do not log.
35. The explicit audit CLI is the only Phase 5 code that writes files or prints detailed reports.
36. The normal production build verifier writes no report files.
37. Phase 5 adds no production dependency and no testing framework.
38. Phase 5 does not add LODs, impostors, world placement, terrain integration, streaming, caching, instancing, workers, collision, export, or authoring UI.
39. Wall-clock generation times are recorded in audits but are not hard acceptance criteria in this phase.
40. Resource ownership and disposal are tested through spies and object state, not inferred from GPU memory.

## In scope

Phase 5 includes:

- strict quality configuration;
- twelve archetype-specific quality profiles;
- exact mass and uniform-density centre-of-mass calculation;
- support-polygon and stability-margin analysis;
- axis and fixed-direction thickness analysis;
- horizontal-section overhang analysis;
- stricter topology-quality metrics above Phase 1 validity;
- multi-view silhouette complexity analysis;
- deterministic symmetry and asymmetry analysis;
- underside-planarity and underside-concavity checks;
- CPU material-readability evaluation;
- hard rejection and near-limit warning issues;
- deterministic candidate-seed resolution;
- two deterministic reroll candidates;
- two canonical fallback candidates per archetype;
- end-to-end production generation;
- quality and production fingerprints;
- compact accepted-asset metadata;
- deterministic batch audit aggregation;
- JSON and Markdown audit writers;
- compatibility, rejection, fallback, determinism, audit, and disposal verification;
- a production-build verification gate.

## Explicitly out of scope

Do not implement:

- changes to Phase 1 clipping or normals;
- changes to Phase 2 archetype ranges or scoring;
- changes to Phase 3 detail recipes or semantic classification;
- changes to Phase 4 palettes, shader, or material response;
- alternative archetype substitution;
- alternative palette substitution;
- unvalidated emergency geometry;
- a static hand-authored mesh fallback;
- a lower-quality fallback profile;
- infinite or probability-based retry loops;
- runtime background auditing;
- automatic remote telemetry;
- GPU screenshot comparison;
- photometric calibration of the world renderer;
- LOD quality checks;
- impostor checks;
- terrain stability or slope placement checks;
- collision stability;
- physical density variation;
- fracture simulation;
- concave or compound stone support;
- editor controls or a stone bench;
- automatic commits of generated audit reports;
- audit timestamps inside deterministic report content.

## Required file changes

### New files

Create exactly:

```text
public/config/stone-quality.yaml

src/stones/quality/StoneQualityTypes.ts
src/stones/quality/StoneQualityConfig.ts
src/stones/quality/StoneQualityConfigLoader.ts
src/stones/quality/StoneQualityErrors.ts
src/stones/quality/StoneQualityCatalog.ts
src/stones/quality/StoneMassPropertiesAnalyzer.ts
src/stones/quality/StoneSupportAnalyzer.ts
src/stones/quality/StoneThicknessAnalyzer.ts
src/stones/quality/StoneTopologyQualityAnalyzer.ts
src/stones/quality/StoneSilhouetteQualityAnalyzer.ts
src/stones/quality/StoneSymmetryAnalyzer.ts
src/stones/quality/StoneUndersideAnalyzer.ts
src/stones/quality/StoneMaterialReferenceEvaluator.ts
src/stones/quality/StoneMaterialQualityAnalyzer.ts
src/stones/quality/StoneQualityEvaluator.ts
src/stones/quality/StoneQualityCandidateResolver.ts
src/stones/quality/StoneQualityFingerprint.ts
src/stones/quality/StoneProductionGenerator.ts
src/stones/quality/StoneQualityAudit.ts
src/stones/quality/StoneQualityAuditWriter.ts
src/stones/quality/index.ts

src/stones/qa/StoneQualityVerification.ts
scripts/verify-stone-quality.mjs
scripts/audit-stone-quality.mjs
```

### Existing files to modify

Modify only:

```text
package.json
```

Do not modify Phase 1–4 production files as part of Phase 5.

## Package scripts

Add:

```json
"test:stone-quality": "node scripts/verify-stone-quality.mjs",
"audit:stone-quality": "node scripts/audit-stone-quality.mjs"
```

Update build order:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-stone-quality.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add a dependency.

## Public quality types

`StoneQualityTypes.ts` must define these exact unions and interfaces.

```ts
export type StoneQualitySeverity = "warning" | "error";

export type StoneQualityStage =
  | "generation"
  | "mass"
  | "support"
  | "thickness"
  | "topology"
  | "silhouette"
  | "symmetry"
  | "underside"
  | "material";

export type StoneQualityIssueCode =
  | "UPSTREAM_GENERATION_FAILED"
  | "NON_FINITE_METRIC"
  | "INVALID_MASS_PROPERTIES"
  | "CENTRE_OF_MASS_OUTSIDE_SUPPORT"
  | "SUPPORT_MARGIN_TOO_SMALL"
  | "CENTRE_OF_MASS_TOO_HIGH"
  | "AXIS_THICKNESS_TOO_SMALL"
  | "DIRECTIONAL_THICKNESS_TOO_SMALL"
  | "OVERHANG_TOO_LARGE"
  | "UPPER_SUPPORT_OFFSET_TOO_LARGE"
  | "FACE_AREA_RATIO_TOO_SMALL"
  | "TRIANGLE_QUALITY_TOO_LOW"
  | "EDGE_LENGTH_RATIO_TOO_HIGH"
  | "FACE_EDGE_RATIO_TOO_HIGH"
  | "SILHOUETTE_VERTEX_COUNT_TOO_HIGH"
  | "SILHOUETTE_COMPACTNESS_TOO_HIGH"
  | "SILHOUETTE_EDGE_TOO_SHORT"
  | "ACCIDENTAL_SYMMETRY"
  | "EXCESSIVE_ASYMMETRY"
  | "INVALID_UNDERSIDE"
  | "UNDERSIDE_CONCAVITY_TOO_HIGH"
  | "MATERIAL_LUMINANCE_OUT_OF_RANGE"
  | "MATERIAL_SEMANTIC_CONTRAST_TOO_LOW"
  | "MATERIAL_DETAIL_CONTRAST_TOO_LOW"
  | "MATERIAL_CLAMP_RATE_TOO_HIGH";

export interface StoneQualityIssue {
  readonly severity: StoneQualitySeverity;
  readonly stage: StoneQualityStage;
  readonly code: StoneQualityIssueCode;
  readonly message: string;
  readonly actual: number;
  readonly limit: number;
  readonly comparator: "minimum" | "maximum" | "inside";
  readonly details?: Readonly<Record<string, number | string>>;
}
```

Metrics:

```ts
export interface StoneMassProperties {
  readonly signedVolume: number;
  readonly volume: number;
  readonly centreOfMass: Readonly<StoneVec3>;
}

export interface StoneSupportMetrics {
  readonly supportArea: number;
  readonly supportHullArea: number;
  readonly supportMargin: number;
  readonly supportMarginRatio: number;
  readonly centreOfMassHeightRatio: number;
  readonly centreOfMassHorizontalOffsetRatio: number;
  readonly maximumOverhangRatio: number;
  readonly upperSupportOffsetRatio: number;
}

export interface StoneThicknessMetrics {
  readonly axisThicknessRatio: number;
  readonly directionalThicknessRatio: number;
  readonly thinnestDirection: Readonly<StoneVec3>;
}

export interface StoneTopologyQualityMetrics {
  readonly minimumFaceAreaRatio: number;
  readonly minimumTriangleQuality: number;
  readonly maximumEdgeLengthRatio: number;
  readonly maximumFaceEdgeRatio: number;
}

export interface StoneSilhouetteViewMetrics {
  readonly viewId: string;
  readonly hullVertexCount: number;
  readonly area: number;
  readonly perimeter: number;
  readonly compactness: number;
  readonly minimumEdgeRatio: number;
}

export interface StoneSilhouetteQualityMetrics {
  readonly views:
    readonly Readonly<StoneSilhouetteViewMetrics>[];
  readonly maximumHullVertexCount: number;
  readonly maximumCompactness: number;
  readonly minimumSilhouetteEdgeRatio: number;
}

export interface StoneSymmetryMetrics {
  readonly topReflectionX: number;
  readonly topReflectionZ: number;
  readonly frontReflectionX: number;
  readonly sideReflectionZ: number;
  readonly averageReflectionSymmetry: number;
  readonly strongestAsymmetry: number;
}

export interface StoneUndersideMetrics {
  readonly undersideRegionCount: number;
  readonly maximumPlaneDeviation: number;
  readonly concavityRatio: number;
  readonly hullVertexCount: number;
}

export interface StoneMaterialQualityMetrics {
  readonly minimumLuminance: number;
  readonly maximumLuminance: number;
  readonly luminanceSpan: number;
  readonly topSideContrast: number;
  readonly sideCutContrast: number;
  readonly cutDetailCutContrast: number;
  readonly crackBaseContrast: number;
  readonly meanVisibleDetailContrast: number;
  readonly clampedSampleRatio: number;
  readonly sampleCount: number;
}
```

Aggregate result:

```ts
export interface StoneQualityMetrics {
  readonly mass: Readonly<StoneMassProperties>;
  readonly support: Readonly<StoneSupportMetrics>;
  readonly thickness: Readonly<StoneThicknessMetrics>;
  readonly topology: Readonly<StoneTopologyQualityMetrics>;
  readonly silhouette: Readonly<StoneSilhouetteQualityMetrics>;
  readonly symmetry: Readonly<StoneSymmetryMetrics>;
  readonly underside: Readonly<StoneUndersideMetrics>;
  readonly material: Readonly<StoneMaterialQualityMetrics> | null;
}

export interface StoneQualityEvaluationResult {
  readonly valid: boolean;
  readonly qualityScore: number;
  readonly issues: readonly Readonly<StoneQualityIssue>[];
  readonly metrics: Readonly<StoneQualityMetrics>;
  readonly qualityFingerprint: string;
}
```

Candidate types:

```ts
export type StoneQualityCandidateKind =
  | "requested"
  | "reroll"
  | "canonical";

export interface StoneQualityCandidate {
  readonly candidateIndex: number;
  readonly kind: StoneQualityCandidateKind;
  readonly requestedSeed: number;
  readonly effectiveSeed: number;
  readonly archetypeId: StoneArchetypeId;
}

export interface StoneQualityCandidateTrace {
  readonly candidate: Readonly<StoneQualityCandidate>;
  readonly accepted: boolean;
  readonly stage: StoneQualityStage;
  readonly qualityFingerprint: string | null;
  readonly issueCodes: readonly StoneQualityIssueCode[];
  readonly errorCode: string | null;
}

export interface StoneProductionGenerationResult {
  readonly geometry: THREE.BufferGeometry;
  readonly material: StoneStylizedMaterial;
  readonly materialRecipe: Readonly<StoneMaterialRecipe>;
  readonly palette: Readonly<StoneResolvedPalette>;
  readonly materialFingerprints: Readonly<StoneMaterialFingerprints>;
  readonly requestedSeed: number;
  readonly effectiveSeed: number;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly candidateIndex: number;
  readonly candidateKind: StoneQualityCandidateKind;
  readonly fallbackUsed: boolean;
  readonly quality: Readonly<StoneQualityEvaluationResult>;
  readonly candidateTrace:
    readonly Readonly<StoneQualityCandidateTrace>[];
  readonly productionFingerprint: string;
}
```

Import Three.js and Phase 4 runtime types only in files that need them. Keep analyzers and configuration types free of Three.js where possible.

Every returned ordinary object and array must be deeply frozen. Owned typed arrays are treated as immutable after construction.

## Configuration contract

### File

Create:

```text
public/config/stone-quality.yaml
```

Parse with:

```ts
FlatConfig.parse(source, "stone-quality")
```

### Exact committed global values

```yaml
# Phase 5 schema and candidate limits
stoneQualityConfigVersion: 1
stoneQualityProfileVersion: 1
stoneQualityAuditVersion: 1
stoneQualityRerollCandidateCount: 2
stoneQualityCanonicalFallbackCount: 2
stoneQualityMaximumCandidateCount: 5
stoneQualityWarningMarginRatio: 0.10
stoneQualityAnalysisEpsilon: 0.00001
stoneQualityFingerprintQuantization: 0.000001

# Horizontal sections and directional sampling
stoneQualitySectionCount: 5
stoneQualitySectionFraction0: 0.10
stoneQualitySectionFraction1: 0.25
stoneQualitySectionFraction2: 0.50
stoneQualitySectionFraction3: 0.75
stoneQualitySectionFraction4: 0.90
stoneQualityDirectionalThicknessDirectionCount: 13
stoneQualitySilhouetteAzimuthCount: 8
stoneQualitySymmetrySampleCount: 64

# Topology quality
stoneQualityMinimumFaceAreaRatio: 0.0015
stoneQualityMinimumTriangleQuality: 0.035
stoneQualityMaximumEdgeLengthRatio: 32
stoneQualityMaximumFaceEdgeRatio: 24
stoneQualityMinimumSilhouetteEdgeRatio: 0.018
stoneQualityMaximumSilhouetteCompactness: 5.25

# Underside quality
stoneQualityMaximumUndersidePlaneDeviation: 0.00002
stoneQualityMaximumUndersideConcavityRatio: 0.002
stoneQualityMaximumUndersideHullVertices: 16

# Material sampling and readability
stoneQualityMaterialGridResolution: 16
stoneQualityMaterialMinimumLuminance: 0.006
stoneQualityMaterialMaximumLuminance: 1.25
stoneQualityMaterialMinimumLuminanceSpan: 0.045
stoneQualityMaterialMinimumTopSideContrast: 0.018
stoneQualityMaterialMinimumSideCutContrast: 0.012
stoneQualityMaterialMinimumCrackBaseContrast: 0.025
stoneQualityMaterialMinimumVisibleDetailContrast: 0.010
stoneQualityMaterialMaximumClampRate: 0.01
stoneQualityMaterialDetailMaskThreshold: 0.20

# Audit population and acceptance
stoneQualityAuditSeedCount: 64
stoneQualityVerificationSeedCount: 32
stoneQualityOverallSuccessMinimum: 1.00
stoneQualityPrimaryAcceptanceMinimum: 0.85
stoneQualityPerArchetypePrimaryAcceptanceMinimum: 0.75
stoneQualityMaximumRerollRate: 0.15
stoneQualityMaximumCanonicalFallbackRate: 0.03
stoneQualityCanonicalFallbackSuccessMinimum: 1.00
stoneQualityMaximumWarningRate: 0.30
stoneQualityAuditUniqueProductionFingerprintMinimum: 740
```

### Per-archetype keys

Use the Phase 2 configuration prefixes and append these exact suffixes:

```text
<Prefix>SupportMarginMin
<Prefix>CentreOfMassHeightMax
<Prefix>CentreOfMassOffsetMax
<Prefix>AxisThicknessMin
<Prefix>DirectionalThicknessMin
<Prefix>OverhangMax
<Prefix>UpperSupportOffsetMax
<Prefix>SilhouetteVertexMax
<Prefix>SymmetryPolicy
<Prefix>SymmetryThreshold
<Prefix>FallbackSeedA
<Prefix>FallbackSeedB
```

`SymmetryPolicy` values are exactly:

```text
unrestricted
balanced
asymmetric
```

### Exact archetype quality values

| Archetype | Support margin min | COM height max | COM offset max | Axis thickness min | Directional thickness min | Overhang max | Upper offset max | Silhouette vertices max | Symmetry policy | Threshold | Fallback A | Fallback B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| rounded-boulder | 0.030 | 0.62 | 0.10 | 0.52 | 0.38 | 0.23 | 0.10 | 14 | balanced | 0.48 | 42 | 1337 |
| squashed-pebble | 0.045 | 0.58 | 0.08 | 0.34 | 0.25 | 0.22 | 0.08 | 14 | balanced | 0.52 | 7 | 9001 |
| flat-ground-stone | 0.045 | 0.57 | 0.08 | 0.26 | 0.20 | 0.24 | 0.09 | 14 | unrestricted | 0.00 | 19 | 2048 |
| broad-slab | 0.040 | 0.60 | 0.09 | 0.27 | 0.20 | 0.23 | 0.08 | 14 | balanced | 0.55 | 11 | 4096 |
| weathered-block | 0.035 | 0.62 | 0.10 | 0.48 | 0.34 | 0.24 | 0.10 | 15 | asymmetric | 0.08 | 42 | 8192 |
| tapered-block | 0.030 | 0.64 | 0.11 | 0.44 | 0.31 | 0.25 | 0.12 | 14 | unrestricted | 0.00 | 31 | 12345 |
| wedge | 0.025 | 0.64 | 0.12 | 0.34 | 0.24 | 0.28 | 0.14 | 14 | asymmetric | 0.12 | 73 | 54321 |
| leaning-shard | 0.012 | 0.66 | 0.18 | 0.26 | 0.18 | 0.34 | 0.22 | 15 | asymmetric | 0.18 | 101 | 22222 |
| tall-monolith | 0.020 | 0.64 | 0.14 | 0.30 | 0.21 | 0.29 | 0.16 | 14 | unrestricted | 0.00 | 151 | 33333 |
| triangular-peak | 0.018 | 0.66 | 0.15 | 0.38 | 0.26 | 0.31 | 0.18 | 15 | asymmetric | 0.14 | 211 | 44444 |
| broad-platform | 0.055 | 0.58 | 0.07 | 0.27 | 0.21 | 0.20 | 0.07 | 14 | balanced | 0.58 | 271 | 55555 |
| tapered-pillar | 0.020 | 0.65 | 0.14 | 0.27 | 0.19 | 0.30 | 0.17 | 14 | unrestricted | 0.00 | 331 | 65535 |

Write all values as flat YAML scalars using the exact prefixes from Phase 2.

### Configuration types

`StoneQualityConfig.ts` must define explicit immutable groups:

```ts
export type StoneSymmetryPolicy =
  | "unrestricted"
  | "balanced"
  | "asymmetric";

export interface StoneQualitySamplingConfig {
  readonly sectionFractions: readonly number[];
  readonly directionalThicknessDirectionCount: number;
  readonly silhouetteAzimuthCount: number;
  readonly symmetrySampleCount: number;
}

export interface StoneQualityTopologyConfig {
  readonly minimumFaceAreaRatio: number;
  readonly minimumTriangleQuality: number;
  readonly maximumEdgeLengthRatio: number;
  readonly maximumFaceEdgeRatio: number;
  readonly minimumSilhouetteEdgeRatio: number;
  readonly maximumSilhouetteCompactness: number;
}

export interface StoneQualityUndersideConfig {
  readonly maximumPlaneDeviation: number;
  readonly maximumConcavityRatio: number;
  readonly maximumHullVertices: number;
}

export interface StoneQualityMaterialConfig {
  readonly gridResolution: number;
  readonly minimumLuminance: number;
  readonly maximumLuminance: number;
  readonly minimumLuminanceSpan: number;
  readonly minimumTopSideContrast: number;
  readonly minimumSideCutContrast: number;
  readonly minimumCrackBaseContrast: number;
  readonly minimumVisibleDetailContrast: number;
  readonly maximumClampRate: number;
  readonly detailMaskThreshold: number;
}

export interface StoneQualityAuditConfig {
  readonly auditSeedCount: number;
  readonly verificationSeedCount: number;
  readonly overallSuccessMinimum: number;
  readonly primaryAcceptanceMinimum: number;
  readonly perArchetypePrimaryAcceptanceMinimum: number;
  readonly maximumRerollRate: number;
  readonly maximumCanonicalFallbackRate: number;
  readonly canonicalFallbackSuccessMinimum: number;
  readonly maximumWarningRate: number;
  readonly uniqueProductionFingerprintMinimum: number;
}

export interface StoneArchetypeQualityProfile {
  readonly supportMarginMinimum: number;
  readonly centreOfMassHeightMaximum: number;
  readonly centreOfMassOffsetMaximum: number;
  readonly axisThicknessMinimum: number;
  readonly directionalThicknessMinimum: number;
  readonly overhangMaximum: number;
  readonly upperSupportOffsetMaximum: number;
  readonly silhouetteVertexMaximum: number;
  readonly symmetryPolicy: StoneSymmetryPolicy;
  readonly symmetryThreshold: number;
  readonly fallbackSeedA: number;
  readonly fallbackSeedB: number;
}

export interface StoneQualityConfig {
  readonly version: 1;
  readonly profileVersion: 1;
  readonly auditVersion: 1;
  readonly rerollCandidateCount: number;
  readonly canonicalFallbackCount: number;
  readonly maximumCandidateCount: number;
  readonly warningMarginRatio: number;
  readonly analysisEpsilon: number;
  readonly fingerprintQuantization: number;
  readonly sampling: Readonly<StoneQualitySamplingConfig>;
  readonly topology: Readonly<StoneQualityTopologyConfig>;
  readonly underside: Readonly<StoneQualityUndersideConfig>;
  readonly material: Readonly<StoneQualityMaterialConfig>;
  readonly audit: Readonly<StoneQualityAuditConfig>;
  readonly archetypes:
    Readonly<Record<StoneArchetypeId, StoneArchetypeQualityProfile>>;
}
```

### Configuration loader requirements

`StoneQualityConfigLoader` must:

- expose `load(url = "./config/stone-quality.yaml")`;
- expose `parse(source: string)` publicly for verification;
- use `FlatConfig`;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- reject non-finite numbers;
- reject non-integer integer fields;
- parse symmetry policies from the exact union only;
- validate seeds through the existing Phase 1 seed rules;
- return a recursively frozen config;
- include the invalid key or relationship in every error.

Apply these cross-field validations exactly:

1. All three versions equal `1`.
2. Reroll candidate count equals `2`.
3. Canonical fallback count equals `2`.
4. Maximum candidate count equals `1 + reroll + canonical` and equals `5`.
5. Warning margin ratio is greater than `0` and less than `0.5`.
6. Analysis epsilon and fingerprint quantization are positive.
7. Fingerprint quantization is not smaller than analysis epsilon divided by `100`.
8. Section count equals `5`.
9. Exactly five section fractions are present.
10. Section fractions are strictly ascending and inside `(0, 1)`.
11. Direction count equals `13`.
12. Silhouette azimuth count equals `8`.
13. Symmetry sample count equals `64`.
14. Topology minima are positive.
15. Triangle quality is at most `1`.
16. Maximum ratios exceed `1`.
17. Maximum silhouette compactness is at least `1`.
18. Underside plane deviation and concavity limits are non-negative.
19. Maximum underside hull vertices is an integer from `3` through `32`.
20. Material grid resolution is an integer from `8` through `64`.
21. Material luminance minimum is non-negative and less than maximum.
22. Every contrast minimum is non-negative.
23. Clamp rate is from `0` through `1`.
24. Detail mask threshold is greater than `0` and at most `1`.
25. Audit and verification seed counts are positive integers.
26. Audit seed count is at least verification seed count.
27. Every audit rate is inside `[0, 1]`.
28. Overall success minimum and canonical fallback success minimum equal `1`.
29. Unique fingerprint minimum is positive and at most `auditSeedCount * archetypeCount`.
30. Every archetype profile exists exactly once.
31. Support margins and thickness minima are positive and less than `1`.
32. COM, overhang, and upper-offset maxima are positive and less than `1`.
33. Silhouette vertex maxima are integers from `6` through `24`.
34. `unrestricted` requires symmetry threshold equal `0`.
35. `balanced` and `asymmetric` require threshold greater than `0` and less than `1`.
36. Fallback seeds A and B are valid and different.
37. The pair of fallback seeds is unique inside each archetype profile.
38. Every fallback seed matches the fixed Phase 3 gallery seed pair for that archetype.

## Candidate resolution

`StoneQualityCandidateResolver` resolves all candidates before generation.

API:

```ts
export class StoneQualityCandidateResolver {
  constructor(config: Readonly<StoneQualityConfig>);

  resolve(
    archetypeId: StoneArchetypeId,
    requestedSeed: number,
  ): readonly Readonly<StoneQualityCandidate>[];
}
```

### Exact sequence

Candidate `0`:

```text
kind = requested
effectiveSeed = requestedSeed
```

Reroll candidate `i`, where `i` is `1` or `2`:

```ts
const random = new StoneRandom(requestedSeed)
  .fork("phase-5-quality")
  .fork(archetypeId)
  .fork(`reroll:${i}`);

let effectiveSeed = random.nextUint32();
```

When the reroll seed duplicates any earlier effective seed, apply:

```ts
effectiveSeed = mixStoneUint32(
  effectiveSeed + 0x9e3779b9,
);
```

Repeat duplicate correction at most four times. A remaining duplicate is a configuration error.

Canonical candidates `3` and `4` use the profile fallback seeds A and B in that order.

If a canonical seed duplicates an earlier effective seed, retain it. Canonical seeds are approved assets and are not remapped. The candidate still appears in the trace.

Return exactly five frozen candidates in candidate-index order.

Palette ID does not affect candidate seeds.

## Mass properties

`StoneMassPropertiesAnalyzer` reads the final indexed Phase 3 geometry before it is disposed by Phase 4.

For every outward-wound indexed triangle `(a, b, c)` use the origin as tetrahedron reference:

```text
signedVolume = dot(a, cross(b, c)) / 6
```

Tetrahedron centroid:

```text
(a + b + c) / 4
```

Accumulate signed-volume-weighted centroids.

After all triangles:

```text
centreOfMass = weightedCentroidSum / totalSignedVolume
```

Requirements:

- positions and indices are finite and valid;
- signed volume is positive;
- absolute volume exceeds Phase 1 minimum volume;
- calculated volume matches Phase 1 metrics within relative tolerance `0.0005`;
- centre of mass is finite;
- centre of mass lies inside the final convex mesh within Phase 1 convexity tolerance.

Do not use duplicated rendered vertices to deduplicate triangles. Evaluate each indexed triangle once.

## Support and overhang analysis

`StoneSupportAnalyzer` consumes the detailed result, mass properties, and archetype quality profile.

### Support polygon

Use the Phase 3 semantic region whose semantic is `underside`.

Read its polygon shared positions from the final core topology exposed through the detailed generation result's retained semantic data contract. When the implementation cannot access shared positions directly, reconstruct the exact polygon from all Phase 3 geometry vertices with:

```text
stoneSemantic == underside
abs(y) <= analysisEpsilon
```

Deduplicate XZ points by epsilon quantization and build a monotonic-chain convex hull.

Require at least three points and positive area.

### Point-to-support margin

The support polygon is counter-clockwise.

For every directed edge, calculate the signed inward distance from the centre-of-mass projection to the edge line.

`supportMargin` is the minimum signed distance.

- Negative means outside.
- Zero means on the boundary.
- Positive means inside.

Normalize:

```text
supportMarginRatio = supportMargin / max(width, depth)
```

Horizontal COM offset:

```text
centreOfMassHorizontalOffsetRatio =
  distanceXZ(centreOfMass, supportHullCentroid) /
  max(width, depth)
```

COM height:

```text
centreOfMassHeightRatio = centreOfMass.y / height
```

### Horizontal sections

Use the five configured height fractions.

Intersect final indexed triangles with each horizontal plane using the same deterministic rules as Phase 2 cross-section analysis.

Deduplicate points and build one XZ convex hull.

For each section hull vertex calculate its signed distance to the support polygon. Distance outside is positive overhang; inside is zero.

```text
maximumOverhangRatio =
  maximumOutsideDistance / max(width, depth)
```

Upper support offset uses the area-weighted centroid of the `0.90` section:

```text
upperSupportOffsetRatio =
  distanceXZ(upperSectionCentroid, supportHullCentroid) /
  max(width, depth)
```

Missing required sections are hard errors.

## Thickness analysis

`StoneThicknessAnalyzer` calculates two metrics.

### Axis thickness

```text
axisThicknessRatio = min(width, height, depth) / max(width, height, depth)
```

### Fixed-direction thickness

Use exactly these thirteen normalized directions in this order:

```text
(1, 0, 0)
(0, 1, 0)
(0, 0, 1)
(1, 1, 0)
(1, -1, 0)
(1, 0, 1)
(1, 0, -1)
(0, 1, 1)
(0, 1, -1)
(1, 1, 1)
(1, 1, -1)
(1, -1, 1)
(-1, 1, 1)
```

Normalize each diagonal before use.

For each direction:

```text
thickness = max(dot(position, direction)) -
            min(dot(position, direction))
```

Normalize each thickness by exact AABB diagonal length.

`directionalThicknessRatio` is the minimum normalized thickness. Store the first direction producing the minimum within epsilon.

Do not use random directions or PCA in Phase 5.

## Topology quality

`StoneTopologyQualityAnalyzer` applies stricter quality metrics without replacing Phase 1 validity.

### Face area ratio

For each Phase 3 semantic region:

```text
faceAreaRatio = region.area / totalSurfaceArea
```

Store the minimum.

### Triangle quality

For triangle side lengths `a`, `b`, `c` and area `A`:

```text
quality = 4 * sqrt(3) * A /
          (a² + b² + c²)
```

An equilateral triangle has quality `1`.

Store the minimum.

### Edge length ratio

Build unique undirected triangle edges from index pairs.

```text
maximumEdgeLengthRatio = longestEdge / shortestEdge
```

### Face edge ratio

For every semantic polygon boundary, calculate longest boundary edge divided by shortest boundary edge. Store the maximum across faces.

Triangulation diagonals do not participate in face edge ratio.

## Silhouette quality

`StoneSilhouetteQualityAnalyzer` uses unique final position values.

### Views

Create exactly nine projections in this order:

1. `top`
2. `azimuth-0`
3. `azimuth-45`
4. `azimuth-90`
5. `azimuth-135`
6. `azimuth-180`
7. `azimuth-225`
8. `azimuth-270`
9. `azimuth-315`

Top projects to XZ.

For azimuth `a`:

```text
viewDirection = (cos(a), 0, sin(a))
screenHorizontal = (-sin(a), 0, cos(a))
screenVertical = (0, 1, 0)
```

Project each position to dot products against horizontal and vertical axes.

Deduplicate, build the convex hull, and require at least three points.

### Metrics

For every hull:

- vertex count;
- area;
- perimeter;
- compactness;
- minimum edge ratio.

Use:

```text
compactness = perimeter² / (4 * π * area)
```

A circle is `1`; larger values are less compact.

```text
minimumEdgeRatio = shortestHullEdge / sqrt(area)
```

Aggregate maximum vertex count, maximum compactness, and minimum edge ratio.

Do not simplify hulls before metrics.

## Symmetry analysis

`StoneSymmetryAnalyzer` uses support-function samples and does not assume matching vertices.

### Projections

Analyze these four reflections:

- top X reflection on XZ hull;
- top Z reflection on XZ hull;
- front X reflection on XY hull;
- side Z reflection on ZY hull.

Centre every hull at its area-weighted centroid.

### Support samples

For `64` equally spaced angles:

```text
angle = index * 2π / 64
support(angle) = max(dot(point, direction(angle)))
```

For reflection across the local vertical axis, compare `support(angle)` to `support(π - angle)`.

For reflection across the local horizontal axis, compare `support(angle)` to `support(-angle)`.

Normalize mean absolute difference by mean positive support radius:

```text
reflectionError =
  mean(abs(left - reflected)) /
  max(meanRadius, analysisEpsilon)

reflectionSymmetry = clamp(1 - reflectionError, 0, 1)
```

Aggregate:

```text
averageReflectionSymmetry = mean(four scores)
strongestAsymmetry = 1 - min(four scores)
```

Policy:

- `unrestricted`: no hard symmetry issue.
- `balanced`: require `averageReflectionSymmetry >= threshold`.
- `asymmetric`: require `strongestAsymmetry >= threshold`.

## Underside analysis

`StoneUndersideAnalyzer` requires:

- exactly one `underside` semantic region;
- at least three unique underside XZ points;
- every underside vertex Y within configured plane deviation of zero;
- no final position below negative Phase 1 ground tolerance;
- positive underside polygon area;
- positive convex hull area.

Calculate:

```text
concavityRatio =
  1 - undersidePolygonArea / undersideConvexHullArea
```

Clamp only values within analysis epsilon of zero.

Phase 1–3 geometry should remain convex, so valid Phase 5 assets are expected to have concavity near zero. Do not repair or replace an invalid underside.

## CPU material reference evaluation

`StoneMaterialReferenceEvaluator` ports the Phase 4 pre-lighting colour logic to TypeScript.

It must use:

- the resolved linear palette;
- Phase 4 material response configuration;
- the Phase 4 material recipe's per-region multipliers;
- the Phase 3 semantic model;
- the Phase 3 detail recipe;
- `evaluateStoneSurfaceDetails` from Phase 3.

API:

```ts
export interface StoneMaterialReferenceSample {
  readonly color: Readonly<StoneLinearColor>;
  readonly baseColor: Readonly<StoneLinearColor>;
  readonly luminance: number;
  readonly baseLuminance: number;
  readonly detailMask: number;
  readonly clamped: boolean;
}

export class StoneMaterialReferenceEvaluator {
  evaluate(
    detailedResult: Readonly<StoneDetailedGenerationResult>,
    materialResult: Readonly<StoneMaterialGenerationResult>,
    region: Readonly<StoneSemanticRegion>,
    uv: Readonly<StoneVec2Readonly>,
  ): Readonly<StoneMaterialReferenceSample>;
}
```

Apply the Phase 4 CPU-equivalent order exactly:

1. select semantic palette colour;
2. apply top-orientation blend;
3. apply dominant-face boost;
4. apply saturation multiplier;
5. apply value multiplier;
6. evaluate Phase 3 detail fields;
7. apply band colour;
8. apply groove colour;
9. apply recess colour;
10. apply crack colour;
11. clamp to Phase 4 configured linear limits;
12. calculate linear luminance.

The evaluator excludes toon-gradient lighting, shadows, fog, tone mapping, and output encoding.

## Material quality

`StoneMaterialQualityAnalyzer` samples every non-underside semantic region on a `16 × 16` grid at cell centres.

For every sample:

- evaluate reference colour with details;
- evaluate the same point with an empty detail list for base comparison;
- record luminance;
- record clamping;
- when detail mask meets configured threshold, record absolute luminance difference from base.

Semantic contrast values use resolved palette role luminances after global value and saturation scale but before per-region variation:

```text
topSideContrast = abs(top - side)
sideCutContrast = abs(side - cut)
cutDetailCutContrast = abs(cut - detailCut)
crackBaseContrast = abs(side - crack)
```

`meanVisibleDetailContrast` is the mean detail-vs-base luminance difference over samples whose combined detail mask meets the threshold. When a stone has no surface details, set it to positive infinity for acceptance and store `0` in metrics with a separate internal `detailSampleCount = 0`.

`clampedSampleRatio` is clamped samples divided by all samples.

## Evaluation and warning rules

`StoneQualityEvaluator` exposes:

```ts
export interface StoneQualityEvaluatorContract {
  evaluateGeometry(
    detailedResult: Readonly<StoneDetailedGenerationResult>,
    profile: Readonly<StoneArchetypeQualityProfile>,
  ): StoneQualityEvaluationResult;

  evaluateComplete(
    detailedResult: Readonly<StoneDetailedGenerationResult>,
    materialResult: Readonly<StoneMaterialGenerationResult>,
    profile: Readonly<StoneArchetypeQualityProfile>,
  ): StoneQualityEvaluationResult;
}
```

`evaluateGeometry` returns `material: null` and checks all non-material metrics.

`evaluateComplete` recalculates or reuses immutable non-material metrics, adds material metrics, and returns the final fingerprint.

### Hard checks

Perform checks in this deterministic order:

1. all numeric metrics finite;
2. mass properties valid;
3. COM projection inside support polygon;
4. support margin meets archetype minimum;
5. COM height meets archetype maximum;
6. COM horizontal offset meets archetype maximum;
7. axis thickness meets archetype minimum;
8. directional thickness meets archetype minimum;
9. overhang meets archetype maximum;
10. upper support offset meets archetype maximum;
11. face area ratio meets global minimum;
12. triangle quality meets global minimum;
13. edge length ratio meets global maximum;
14. face edge ratio meets global maximum;
15. silhouette vertex count meets archetype maximum;
16. silhouette compactness meets global maximum;
17. silhouette edge ratio meets global minimum;
18. symmetry policy passes;
19. underside is valid;
20. underside concavity meets maximum;
21. material luminance is inside configured range;
22. luminance span meets minimum;
23. top-side contrast meets minimum;
24. side-cut contrast meets minimum;
25. crack-base contrast meets minimum;
26. visible detail contrast meets minimum when details exist;
27. material clamp rate meets maximum.

Return every detectable issue in this order. Do not stop after the first issue unless the input cannot be safely analyzed.

### Warnings

For a minimum threshold, emit a warning when:

```text
actual >= minimum
actual < minimum * (1 + warningMarginRatio)
```

For a maximum threshold, emit a warning when:

```text
actual <= maximum
actual > maximum * (1 - warningMarginRatio)
```

Warnings use the same issue code and stage but severity `warning`.

Do not emit both a warning and an error for one check.

### Quality score

For every hard scalar check calculate one normalized margin score:

Minimum rule:

```text
clamp(actual / minimum, 0, 2) / 2
```

Maximum rule:

```text
clamp(maximum / max(actual, epsilon), 0, 2) / 2
```

Boolean validity checks contribute `1` when valid and `0` when invalid.

`qualityScore` is the arithmetic mean of all applicable component scores, clamped to `[0, 1]`.

A result is valid only when it contains zero error-severity issues. Score alone never accepts a failed candidate.

## Quality fingerprint

`StoneQualityFingerprint` uses the Phase 1 dual FNV-1a strategy.

Serialize in this exact order:

1. quality profile version;
2. archetype canonical index;
3. Phase 3 asset fingerprint;
4. Phase 4 material-asset fingerprint or empty string for geometry-only evaluation;
5. all quality metrics in interface declaration order;
6. silhouette views in declared view order;
7. issue count;
8. issues in deterministic order;
9. severity, stage, code, comparator;
10. quantized actual and limit values;
11. quantized quality score.

Return sixteen lowercase hexadecimal digits.

Production fingerprint hashes UTF-8 bytes of:

```text
v1|<requestedSeed>|<effectiveSeed>|<candidateIndex>|<candidateKind>|<materialAssetFingerprint>|<qualityFingerprint>
```

Use the same dual FNV-1a strategy.

## Production generator

`StoneProductionGenerator` constructor:

```ts
export class StoneProductionGenerator {
  constructor(
    detailedGenerator: StoneDetailedGenerator,
    materialGenerator: StoneMaterialGenerator,
    qualityEvaluator: StoneQualityEvaluatorContract,
    qualityConfig: Readonly<StoneQualityConfig>,
  );

  generate(
    archetypeId: StoneArchetypeId,
    seed: number,
    paletteId: StonePaletteId,
  ): StoneProductionGenerationResult;
}
```

### Complete generation flow

1. Validate archetype ID, public seed, and palette ID through existing contracts.
2. Resolve all five quality candidates.
3. Create an empty immutable trace builder owned by the current call.
4. For each candidate in order:
5. Call `detailedGenerator.generate(archetypeId, effectiveSeed)`.
6. Evaluate geometry quality.
7. If geometry quality fails, dispose the detailed geometry, append a rejected trace, and continue.
8. Call `materialGenerator.create(detailedResult, paletteId)`.
9. Phase 4 takes and disposes the detailed geometry on success.
10. Evaluate complete material quality using immutable detailed semantic/detail data and the new Phase 4 result.
11. If complete quality fails, dispose Phase 4 geometry and material, append a rejected trace, and continue.
12. Calculate production fingerprint.
13. Create compact frozen quality metadata.
14. Assign identical metadata to `geometry.userData.stoneQuality` and `material.userData.stoneQuality`.
15. Append an accepted trace.
16. Return the frozen production result immediately.

### Exception handling and ownership

When detailed generation throws:

- append a generation-stage trace with the upstream error code;
- continue to the next candidate.

When material generation throws:

- call `detailedResult.geometry.dispose()` defensively;
- Phase 4 remains responsible for any resources it took ownership of;
- append a material-stage trace;
- continue.

Repeated Three.js geometry disposal is tolerated. Do not reuse a candidate result after any failure.

When quality analysis itself throws unexpectedly:

- dispose all candidate-owned resources;
- wrap as `StoneQualityGenerationError` with code `QUALITY_ANALYSIS_FAILED`;
- do not continue because analyzer failure is an implementation fault, not candidate quality.

After all five candidates reject or fail, throw `QUALITY_FALLBACK_EXHAUSTED` with exactly five trace entries.

### Compact metadata

Use:

```ts
const metadata = Object.freeze({
  configVersion: 1,
  profileVersion: 1,
  requestedSeed,
  effectiveSeed,
  candidateIndex,
  candidateKind,
  fallbackUsed: candidateIndex > 0,
  qualityScore: quality.qualityScore,
  qualityFingerprint: quality.qualityFingerprint,
  productionFingerprint,
});
```

Do not store metrics, issue arrays, candidate traces, recipes, or palettes in `userData`.

## Error contract

`StoneQualityErrors.ts` must define:

```ts
export type StoneQualityGenerationErrorCode =
  | "INVALID_QUALITY_CONFIG"
  | "INVALID_QUALITY_INPUT"
  | "QUALITY_ANALYSIS_FAILED"
  | "QUALITY_FALLBACK_EXHAUSTED"
  | "QUALITY_AUDIT_FAILED"
  | "QUALITY_REPORT_WRITE_FAILED";

export class StoneQualityGenerationError extends Error {
  readonly code: StoneQualityGenerationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- set `name = "StoneQualityGenerationError"`;
- preserve unexpected errors as `cause`;
- include archetype, requested seed, effective seed, palette, and candidate index when available;
- freeze details and nested ordinary arrays;
- never log in the constructor;
- fallback-exhausted details contain exactly five frozen traces.

## Audit model

`StoneQualityAudit.ts` must define:

```ts
export interface StoneQualityAuditCase {
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly requestedSeed: number;
  readonly success: boolean;
  readonly effectiveSeed: number | null;
  readonly candidateIndex: number | null;
  readonly candidateKind: StoneQualityCandidateKind | null;
  readonly productionFingerprint: string | null;
  readonly qualityScore: number | null;
  readonly warningCodes: readonly StoneQualityIssueCode[];
  readonly trace: readonly StoneQualityCandidateTrace[];
}

export interface StoneQualityAuditBucket {
  readonly caseCount: number;
  readonly successCount: number;
  readonly primaryAcceptanceCount: number;
  readonly rerollCount: number;
  readonly canonicalFallbackCount: number;
  readonly warningCount: number;
  readonly successRate: number;
  readonly primaryAcceptanceRate: number;
  readonly rerollRate: number;
  readonly canonicalFallbackRate: number;
  readonly warningRate: number;
  readonly qualityScoreMinimum: number;
  readonly qualityScoreP50: number;
  readonly qualityScoreP95: number;
  readonly qualityScoreMaximum: number;
}

export interface StoneQualityAuditReport {
  readonly version: 1;
  readonly configFingerprint: string;
  readonly caseCount: number;
  readonly uniqueProductionFingerprintCount: number;
  readonly overall: Readonly<StoneQualityAuditBucket>;
  readonly byArchetype:
    Readonly<Record<StoneArchetypeId, StoneQualityAuditBucket>>;
  readonly byPalette:
    Readonly<Record<StonePaletteId, StoneQualityAuditBucket>>;
  readonly issueCodeCounts:
    Readonly<Record<StoneQualityIssueCode, number>>;
  readonly cases: readonly Readonly<StoneQualityAuditCase>[];
  readonly thresholdIssues: readonly string[];
}
```

### Audit population

Default audit creates exactly:

```text
12 archetypes × 64 seeds = 768 cases
```

For archetype canonical index `a` and seed index `s`:

```text
requestedSeed = s
paletteIndex = (s + a * 3) mod 8
```

This rotates all palettes across every archetype without multiplying geometry generation by eight.

Case order is archetype canonical order, then requested seed ascending.

The report contains no timestamp, host name, path, random identifier, or wall-clock duration. The same code and configuration must produce byte-identical JSON report content.

### Percentiles

Sort finite scores ascending.

Use nearest-rank indexing:

```ts
const index = Math.ceil(percentile * count) - 1;
```

Clamp index to valid array bounds.

### Audit thresholds

Add threshold issues when:

- overall success rate is below configured minimum;
- overall primary acceptance is below configured minimum;
- any archetype primary acceptance is below per-archetype minimum;
- reroll rate exceeds maximum;
- canonical fallback rate exceeds maximum;
- canonical fallback seed verification is below minimum;
- warning rate exceeds maximum;
- unique production fingerprints are below configured minimum.

The report is valid only when `thresholdIssues` is empty.

## Audit writer and CLI

`StoneQualityAuditWriter` writes two files:

```text
qa-runs/stone-quality/stone-quality-audit.json
qa-runs/stone-quality/stone-quality-audit.md
```

The directory is created when absent. Existing files are replaced atomically through temporary sibling files followed by rename.

JSON requirements:

- UTF-8;
- two-space indentation;
- final newline;
- object field order follows `StoneQualityAuditReport` declaration order;
- case and bucket order is deterministic.

Markdown sections in exact order:

1. title;
2. configuration fingerprint;
3. overall summary table;
4. archetype table;
5. palette table;
6. issue-code table;
7. threshold failures;
8. fallback cases;
9. failed cases.

Do not include successful primary cases individually in Markdown.

`scripts/audit-stone-quality.mjs`:

- uses Vite SSR;
- loads all committed stone configuration through production loaders;
- creates the production pipeline;
- runs the 768-case default audit;
- writes both reports;
- prints one concise summary line;
- exits with code `1` when threshold issues exist;
- prefixes failures with `[stone-quality-audit]`.

Accepted CLI options are exactly:

```text
--output <directory>
--seed-count <integer>
--fail-on-threshold <0|1>
```

Defaults:

```text
--output qa-runs/stone-quality
--seed-count 64
--fail-on-threshold 1
```

Reject unknown options, missing values, duplicate options, non-integer seed counts, seed counts below `1`, and seed counts above `4096`.

Changing seed count changes only population size and the fingerprint threshold is scaled proportionally:

```text
ceil(configuredUniqueMinimum * actualSeedCount / 64)
```

## Verification script

`scripts/verify-stone-quality.mjs` uses Vite SSR in the same style as earlier stone verifiers.

Load:

```text
/src/stones/qa/StoneQualityVerification.ts
```

Call exactly:

```ts
await verification.verifyStoneQuality();
```

Prefix failures with:

```text
[stone-quality]
```

Print one success line containing:

- generated case count;
- primary acceptance count;
- reroll count;
- canonical fallback count;
- unique production fingerprints;
- maximum warnings on one accepted case;
- minimum accepted quality score.

Do not write audit files during verification.

## Mandatory verification matrix

### Previous-phase compatibility

Run all earlier stone verification scripts unchanged.

Additionally verify representative Phase 4 gallery cases before and after importing Phase 5 modules. Require exact equality of:

- Phase 3 detailed recipe JSON;
- geometry positions, normals, indices, and namespaced attributes;
- Phase 3 fingerprints;
- Phase 4 material recipe JSON;
- resolved palette values;
- material fingerprints;
- shader cache key;
- material-ready geometry attributes.

### Configuration tests

Verify:

- committed YAML parses;
- result is recursively frozen;
- missing key fails;
- duplicate key fails;
- unknown key fails;
- `NaN` fails;
- maximum candidate count other than five fails;
- unsorted section fractions fail;
- direction count other than thirteen fails;
- symmetry sample count other than sixty-four fails;
- triangle quality above one fails;
- material clamp rate above one fails;
- unrestricted symmetry with non-zero threshold fails;
- asymmetric symmetry with zero threshold fails;
- invalid fallback seed fails;
- equal fallback seeds fail;
- fallback seed differing from the fixed gallery pair fails;
- audit success minimum below one fails;
- unique fingerprint minimum above population size fails.

### Analyzer fixtures

Use hand-authored closed meshes to verify:

- unit tetrahedron mass and centroid;
- unit cube mass and centroid;
- translated cube centroid translation;
- COM outside a small support polygon rejects;
- COM on support boundary rejects through zero margin;
- broad valid support produces positive margin;
- exact axis thickness ratios;
- all thirteen directions are evaluated;
- equilateral triangle quality equals one;
- degenerate triangle quality equals zero;
- edge ratio calculations;
- square silhouette compactness equals `4 / π` within tolerance;
- reflection-perfect rectangle symmetry equals one;
- deliberately asymmetric hull has positive strongest asymmetry;
- convex underside concavity equals zero;
- concave hand-authored underside produces positive concavity.

### Material reference fixtures

Create one semantic region and deterministic Phase 3 detail descriptors.

Verify CPU Phase 5 colour output against manually calculated expected values for:

- side semantic colour;
- top orientation blend;
- dominant-face boost;
- value and saturation variation;
- band only;
- groove only;
- recess only;
- crack only;
- complete detail order with crack last;
- final clamp detection;
- linear luminance.

Tolerance: `0.000001`.

### Single-case determinism

Use:

```text
archetype: weathered-block
seed: 42
palette: sandstone
```

Generate twice through `StoneProductionGenerator` and require exact equality of:

- effective seed;
- candidate index and kind;
- quality metrics;
- issue arrays;
- quality fingerprint;
- production fingerprint;
- material recipe;
- palette;
- material fingerprints;
- geometry arrays and attributes;
- compact quality metadata;
- complete candidate trace.

Dispose both geometries and materials.

### Production batch

Generate:

```text
12 archetypes × seeds 0 through 31 = 384 cases
```

Use palette rotation:

```text
(seed + archetypeIndex * 3) mod 8
```

For every case:

- production generation succeeds;
- accepted quality has no error issues;
- every metric is finite;
- requested and effective seeds are valid;
- candidate index is from zero through four;
- candidate kind matches index;
- fallback flag matches candidate index;
- accepted trace is last and marked accepted;
- all prior traces are rejected;
- production fingerprint is deterministic;
- geometry and material quality metadata match;
- Phase 4 material-asset fingerprint remains unchanged;
- no earlier metadata is removed;
- geometry attributes remain unchanged;
- returned geometry and material can be disposed exactly once by caller.

Across the batch:

- overall success rate equals one;
- primary acceptance meets configured minimum;
- each archetype primary acceptance meets configured minimum;
- reroll rate meets maximum;
- canonical fallback rate meets maximum;
- warning rate meets maximum;
- at least `370` unique production fingerprints exist;
- every archetype and palette appears;
- at least one accepted primary candidate exists for every archetype.

A naturally zero fallback rate is valid. Dedicated fixtures below test fallback behavior.

### Canonical fallback verification

For every archetype, generate both configured canonical fallback seeds across all eight palettes.

This produces:

```text
12 × 2 × 8 = 192 cases
```

Require:

- every case passes the complete quality gate as candidate data;
- no quality threshold is relaxed;
- material contrast passes for every palette;
- fingerprints are deterministic;
- success rate equals configured canonical fallback minimum.

### Candidate-order and fallback fixtures

Use a production-compatible fake evaluator implementing `StoneQualityEvaluatorContract`.

Verify:

1. Accept candidate zero: only one detailed and material candidate is created.
2. Reject candidate zero and accept candidate one: trace contains two entries and kind is `reroll`.
3. Reject through candidate two and accept candidate three: kind is `canonical`, fallback A seed used.
4. Reject through candidate three and accept candidate four: fallback B seed used.
5. Reject all five: terminal error contains exactly five traces.
6. Candidate seeds match the exact resolver algorithm.
7. Palette does not affect candidate seeds.
8. Archetype ID does affect reroll seeds.
9. Duplicate reroll correction is deterministic.
10. Canonical duplicate seeds are retained rather than remapped.

### Rejection-path tests

Create deterministic fixture inputs that trigger each issue code at least once.

Require:

- issue ordering follows the hard-check order;
- warnings appear only inside warning margins;
- errors suppress the equivalent warning;
- one candidate may report multiple independent issues;
- invalid result has `valid: false` regardless of score;
- quality fingerprint changes when one issue or metric changes;
- non-finite metrics cause rejection;
- analyzer exceptions become `QUALITY_ANALYSIS_FAILED`, not candidate rejection;
- upstream generation errors remain candidate traces and permit the next candidate.

### Resource lifecycle tests

Use injected generator and material spies.

Verify:

- rejected geometry-only candidate disposes detailed geometry once;
- rejected complete candidate disposes Phase 4 geometry and material once;
- material failure defensively disposes remaining detailed geometry;
- accepted candidate is not disposed by the production generator;
- all earlier rejected candidates are disposed before return;
- terminal failure leaves no owned geometry, material, or gradient texture;
- repeated caller disposal of accepted material follows the Phase 4 idempotent texture-disposal contract.

### Audit tests

Run a small audit with four seeds per archetype.

Require:

- case order deterministic;
- palette rotation exact;
- bucket counts sum to total;
- percentiles use nearest-rank rules;
- issue-code counts match traces;
- JSON serialization is byte-identical across two runs;
- Markdown serialization is byte-identical across two runs;
- no timestamp or absolute path appears;
- threshold failures are ordered;
- output writer replaces files atomically;
- unknown CLI options fail;
- duplicate CLI options fail;
- invalid seed counts fail;
- `--fail-on-threshold 0` writes reports and exits successfully even with threshold issues.

## Implementation sequence

Implement in this exact order and keep TypeScript compiling after each step.

### Step 1 — Configuration and catalogue

Files:

- `public/config/stone-quality.yaml`
- `StoneQualityConfig.ts`
- `StoneQualityConfigLoader.ts`
- `StoneQualityCatalog.ts`

Checks:

- committed config parses;
- all twelve profiles exist;
- canonical fallback seeds match Phase 3 gallery pairs;
- config is recursively frozen.

### Step 2 — Public types and errors

Files:

- `StoneQualityTypes.ts`
- `StoneQualityErrors.ts`

Checks:

- no import cycle;
- pure types avoid unnecessary Three.js imports.

### Step 3 — Mass and support analysis

Files:

- `StoneMassPropertiesAnalyzer.ts`
- `StoneSupportAnalyzer.ts`

Checks:

- tetrahedron and cube fixtures pass;
- support margin signs are correct;
- section overhang metrics deterministic.

### Step 4 — Thickness and topology quality

Files:

- `StoneThicknessAnalyzer.ts`
- `StoneTopologyQualityAnalyzer.ts`

Checks:

- all thirteen directions used;
- exact triangle-quality fixture passes;
- polygon edges exclude triangulation diagonals.

### Step 5 — Silhouette, symmetry, and underside

Files:

- `StoneSilhouetteQualityAnalyzer.ts`
- `StoneSymmetryAnalyzer.ts`
- `StoneUndersideAnalyzer.ts`

Checks:

- nine views produced in exact order;
- symmetry fixtures pass;
- convex and concave underside fixtures separate correctly.

### Step 6 — Material reference and quality

Files:

- `StoneMaterialReferenceEvaluator.ts`
- `StoneMaterialQualityAnalyzer.ts`

Checks:

- Phase 4 CPU equations reproduced;
- all eight palettes pass canonical fallback cases;
- detail order and clamp detection exact.

### Step 7 — Evaluator and fingerprints

Files:

- `StoneQualityEvaluator.ts`
- `StoneQualityFingerprint.ts`

Checks:

- issue order deterministic;
- warnings and errors correct;
- repeated evaluation hashes identically.

### Step 8 — Candidate resolver and production generator

Files:

- `StoneQualityCandidateResolver.ts`
- `StoneProductionGenerator.ts`

Checks:

- five-candidate sequence exact;
- fallback fixtures pass;
- resource ownership tests pass.

### Step 9 — Audit aggregation and writing

Files:

- `StoneQualityAudit.ts`
- `StoneQualityAuditWriter.ts`
- `scripts/audit-stone-quality.mjs`

Checks:

- deterministic JSON and Markdown;
- default population is 768;
- CLI validation complete.

### Step 10 — Verification gate

Files:

- `StoneQualityVerification.ts`
- `scripts/verify-stone-quality.mjs`
- `package.json`

Checks:

```bash
npx tsc
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
npm run build
```

## Definition of done

Phase 5 is complete only when:

- all required files exist in the specified locations;
- all previous phase verifiers pass unchanged;
- the quality configuration is strict and fully validated;
- every requested production call evaluates no more than five predetermined candidates;
- accepted assets pass every hard quality rule;
- canonical fallback seeds pass the same rules across all palettes;
- no rejected candidate leaks geometry, material, or gradient texture ownership;
- accepted metadata is compact and identical on geometry and material;
- quality and production fingerprints are deterministic;
- the 384-case verification batch satisfies acceptance and diversity thresholds;
- the 192-case canonical fallback matrix succeeds completely;
- the audit CLI writes deterministic JSON and Markdown reports;
- the default 768-case audit satisfies configured rejection-rate limits;
- production build includes the Phase 5 gate;
- no Phase 6–10 functionality is introduced.

## Required completion report

The implementation completion note must include:

- commit hash;
- files added and modified;
- all verification commands and results;
- 384-case verification acceptance summary;
- primary, reroll, and canonical fallback rates;
- minimum accepted quality score;
- warning rate;
- canonical fallback matrix result;
- unique production fingerprint count;
- default audit report paths;
- issue-code frequency table;
- any thresholds that required correction before final approval;
- confirmation that Phase 1–4 outputs remained unchanged;
- confirmation that no runtime, LOD, placement, caching, or authoring work was added.
