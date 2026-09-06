# River Look and Feel Performance Plan

Status: **final implementation specification**  
Revision: **4 — pre-implementation review complete**  
Baseline date: 2026-08-15  
Target: FluffyGrass procedural rivers on desktop and compact/mobile profiles

## Goal

Improve river realism and game feel without materially increasing runtime rendering cost.

The renderer already has the expensive fundamentals: depth absorption, Fresnel, flow-aligned surface motion, contextual foam, stone wakes, shallow caustics, a depth-correct bed, wet terrain response, distance detail fading, and compact/mobile scaling.

The remaining weakness is structural. The river channel is still more regular than the water material rendered over it.

The governing rule is:

> one continuous deterministic river morphology drives width, depth, bend asymmetry, apparent flow, riffles, sediment, and bank character.

Do not create unrelated noise fields for each visible effect.

---

# 1. Final review decisions

These decisions supersede earlier revisions of this document.

1. **Do not add a hydraulic simulation.** Keep the existing analytic river field and water-sheet architecture.
2. **Do not add another river noise octave.** Reuse the sine/cosine values already required by the two existing centreline phases.
3. **Normalize the morphology signal.** The previous weighted product had a theoretical amplitude of only `0.72`, so an art value such as `riverWidthVariation: 0.08` could never actually produce an 8% morphology contribution. Revision 4 fixes that.
4. **Leave width-safety headroom.** The previous defaults landed at approximately `1.17936` against the existing `1.18` maximum. That is needlessly tight. Revision 4 narrows the per-lane base range and defaults to a safer combined envelope.
5. **Preserve existing downhill-flow resolution.** `RiverField.flowSign` is only a provisional tangent orientation. `WaterChunkInteractionResolver` already calls `resolveDownhillWaterFlow()` after the water sheet exists and rewrites packed flow/wake direction downhill. Do not replace or duplicate that mechanism.
6. **Do not solve river-surface hydraulics in this pass.** The current surface level follows the existing terrain/hydrology model. The new cross-section changes depth beneath that surface. Add a regression measurement for cross-channel surface tilt; if the baseline itself proves unacceptable, solve water-surface elevation as a separate hydrology task rather than hiding it inside this visual pass.
7. **Reduce new YAML knobs.** Structural implementation coefficients stay in tuning modules. YAML contains only values an artist should reasonably tune.
8. **Use the existing native tuning-menu pattern.** Do not add lil-gui/dat.gui runtime dependencies.
9. **Static performance contracts are deterministic; browser timing is not.** Build gates prevent architectural regressions. Production browser measurements use fixed scenes and repeated medians/p95.

---

# 2. Existing architecture that must remain authoritative

Do not rebuild systems that already solve the problem correctly.

## Downhill flow

Current path:

```text
RiverField
  -> provisional normalized tangent
  -> WaterChunkGeometry waterData.zw
  -> WaterChunkInteractionResolver
  -> resolveDownhillWaterFlow()
  -> packed tangent is flipped if it points uphill
  -> stone wakes use the same settled downhill direction
```

`WaterFlowDirection.ts` also ignores dry-bank heights when resolving the water-sheet gradient. Preserve this contract.

## Water ownership

```text
terrain/character: opaque depth ownership
riverbed: opaque/depth-writing bed layer
water surface: transparent/depth-tested surface
```

No bed colour, pebbles, or caustics may be reintroduced as a foreground surface overlay.

## Shared resources

Keep:

- one `WaterMaterialController` per `TerrainStreamer`;
- one `WaterBedMaterialController` per `TerrainStreamer`;
- one flow texture;
- one bed texture;
- shared materials across chunks;
- `waterData` as four floats;
- `waterInteraction` as two floats.

---

# 3. Hard performance contract

These are release constraints.

## R1-R12 rendering budget

- 0 new mandatory render passes;
- 0 SSR;
- 0 planar reflection camera;
- 0 scene-colour refraction pass;
- 0 dynamic tessellation;
- 0 new river normal texture;
- 0 new per-chunk water/bed materials;
- 0 new water draw calls;
- 0 new bed draw calls;
- 0 new water vertex attributes or varyings;
- 0 additional surface-water sampler uniforms;
- 0 additional bed sampler uniforms;
- same macro hydrology on desktop and compact/mobile.

Optional character ripples are the only later phase allowed one small instanced draw.

## CPU generation budget

`RiverField.sample()` is a hot chunk-build path.

Requirements:

- no allocations per sample;
- no arrays/objects/closures/vectors created per sample;
- reuse lane/sample scratch objects;
- two centreline `Math.sin()` calls per candidate lane, no third octave;
- calculate `Math.cos()` only for the selected lane;
- no Perlin/simplex/value-noise call added to river morphology;
- `WAKE_SAMPLE_COUNT` remains `3`;
- do not increase streaming frame budgets to hide slower generation.

## Production frame budget

Compare the same production build scene/profile/viewport before and after.

For the completed R1-R12 pass:

```text
visual-matrix frame p50        <= baseline + 3%
visual-matrix frame p95        <= baseline + 5%
renderer draw calls            unchanged for equivalent pose
surface water sampler count    unchanged
riverbed sampler count         unchanged
persistent material/texture count unchanged
```

Water triangle count can change because local width changes wet-cell topology. Investigate a sustained increase above 5% at the same river pose.

Do not compensate for a regression by lowering grass quality, terrain radius, water detail distance, resolution, or another unrelated system.

## CPU microbenchmark

Add a **manual**, non-build-gating benchmark:

`scripts/benchmark-river-generation.mjs`

It should:

- use seed `42017`;
- warm up twice;
- sample a fixed 250,000-point workload;
- run 7 measured iterations;
- report median and p95 iteration time;
- perform no console output inside the measured loop.

Add:

```json
"bench:river": "node scripts/benchmark-river-generation.mjs"
```

Do not put a stopwatch threshold in `npm run build`; machine scheduling is not deterministic. Use the benchmark for before/after engineering review.

---

# 4. Exact file map

## River structure

| File | Change |
| --- | --- |
| `src/world/hydrology/RiverTuning.ts` | **new** — structural constants and safe envelopes only. |
| `src/world/hydrology/RiverField.ts` | morphology, bend driver, local width, lateral coordinate, cross-section depth. |
| `src/world/hydrology/HydrologyField.ts` | carve using explicit incision; expose CPU-only morphology semantics. |
| `src/world/TerrainField.ts` | normally no algorithm change; only expose a helper if deterministic QA genuinely requires it. Do not duplicate hydrology math. |

## Water surface

| File | Change |
| --- | --- |
| `src/world/hydrology/WaterMaterialTuning.ts` | fixed shader coefficients/frequency endpoints. |
| `src/world/hydrology/WaterMaterialController.ts` | new uniform values and live visual setters. |
| `src/world/hydrology/WaterShader.ts` | depth/coverage-driven energy, local river speed, riffle gating, foam balance, subtle tint. |
| `src/world/hydrology/WaterFlowDirection.ts` | **verify only** unless a regression is found. Preserve downhill resolver. |
| `src/world/hydrology/WaterChunkInteractionResolver.ts` | **verify only** for downhill packing/order. |

## Riverbed

| File | Change |
| --- | --- |
| `src/world/hydrology/WaterBedMaterialController.ts` | reference depth and live bed setters. |
| `src/world/hydrology/WaterBedMaterialShader.ts` | derive channel/riffle/pool/bank masks. |
| `src/world/hydrology/WaterBedShader.ts` | reinterpret existing sampled channels; no additional samples. |

## Shore and stones

| File | Change |
| --- | --- |
| `src/world/TerrainMaterialShader.ts` | irregular mud/gravel shore composition using existing terrain samples. |
| `src/world/TerrainMaterialController.ts` | only add a dedicated shore-gravel colour if existing palette is insufficient. |
| `src/world/hydrology/WaterInteractionField.ts` | broaden/weaken the existing three-sample wake downstream. |

## Configuration

| File | Change |
| --- | --- |
| `public/config/world.yaml` | persistent approved art values; source of truth. |
| `src/world/WorldConfig.ts` | typed fields. |
| `src/world/WorldConfigSchema.ts` | parser/default contract. |
| `src/world/WorldConfigValidator.ts` | ranges and combined width-envelope validation. |
| `scripts/verify-config-contracts.mjs` | every YAML value parsed, validated, and consumed. |

## Development tuning

| File | Change |
| --- | --- |
| `src/app/RiverArtMenu.ts` | **new** native tuning panel, YAML export, deterministic QA shortcuts. |
| `src/dev/RiverDevelopmentConfig.ts` | **new** allowlisted session overrides and immutable merged config. |
| `src/app/WorldApp.ts` | dynamically load/apply tuning only under `?riverTuning=1`; create/dispose menu. |
| `src/world/TerrainStreamer.ts` | forward live visual values to the two shared water controllers. |
| `src/style.css` | reuse the existing GrassArtMenu visual pattern. |
| `package.json` | focused river test/benchmark aliases. No GUI dependency. |

## QA

| File | Change |
| --- | --- |
| `scripts/verify-hydrology.mjs` | numeric morphology/width/bend/depth/determinism tests. |
| `scripts/verify-water-flow.mjs` | preserve downhill flow and add local visual-flow equations where appropriate. |
| `scripts/verify-water-render-contract.mjs` | sampler/varying/material ownership contracts. |
| `scripts/verify-terrain-surface.mjs` | shore-material contract. |
| `scripts/verify-stones.mjs` | three-sample downstream wake contract. |
| `scripts/verify-river-performance-contract.mjs` | **new** static performance architecture guard. |
| `scripts/benchmark-river-generation.mjs` | **new** manual fixed-workload CPU benchmark. |
| `src/qa/WorldVisualMatrixLocations.ts` | deterministic pool/riffle/bend landmarks. |
| `src/qa/WorldVisualMatrixPoses.ts` | repeatable river cameras. |
| `src/qa/WorldVisualMatrixRunner.ts` | use the added poses; keep existing frame-stat collection. |

---

# 5. YAML: final new artist controls

Add only these new persistent values:

```yaml
# Channel morphology — reload required while tuning.
riverWidthVariation: 0.08
riverBendBankAsymmetry: 0.04
riverDepthVariation: 0.16
riverBendChannelShift: 0.20

# River visual velocity — live uniform tuning.
waterRiverPoolFlowScale: 0.80
waterRiverRiffleFlowScale: 1.20

# Foam cause balance. Overall amount remains waterFoamStrength.
waterShoreFoamWeight: 0.14
waterRiffleFoamWeight: 0.40
waterStoneFoamWeight: 0.56
```

Do **not** add YAML fields for:

- bank shoulder incision coefficient;
- morphology weights/normalization;
- shelf/channel cross-section coefficients;
- pool/riffle frequency endpoints;
- shader energy mix constants.

Those describe the algorithm rather than art direction and belong in tuning modules.

## Validation ranges

```text
riverWidthVariation          0.00 .. 0.12
riverBendBankAsymmetry       0.00 .. 0.07
riverDepthVariation          0.00 .. 0.25
riverBendChannelShift        0.00 .. 0.30
waterRiverPoolFlowScale      0.65 .. 1.00
waterRiverRiffleFlowScale    1.00 .. 1.35
waterShoreFoamWeight         0.00 .. 0.35
waterRiffleFoamWeight        0.00 .. 0.75
waterStoneFoamWeight         0.00 .. 1.00
```

Existing water controls remain available for tuning where useful:

```text
waterOpacity
waterRippleStrength
waterRippleScale
waterFlowSpeed
waterFoamStrength
waterFresnelStrength
waterDepthFade
waterDetailDistance
waterRoughness
waterFlowNoiseScale
waterFlowNoiseStrength
waterCausticStrength
waterGlintStrength
waterStoneWakeStrength
waterStoneWakeLength
waterBedStrength
waterBedScale
waterBedRefraction
waterAlgaeStrength
```

---

# 6. Structural constants

Create `src/world/hydrology/RiverTuning.ts`:

```text
RIVER_BASE_MIN_WIDTH_SCALE = 0.95
RIVER_BASE_MAX_WIDTH_SCALE = 1.03
RIVER_GLOBAL_MIN_WIDTH_SCALE = 0.82
RIVER_GLOBAL_MAX_WIDTH_SCALE = 1.18

RIVER_SECONDARY_AMPLITUDE = 0.30

RIVER_MORPH_PRIMARY_WEIGHT = 0.72
RIVER_MORPH_SECONDARY_WEIGHT = 0.28
RIVER_MORPH_MAX_ABS = 0.72

RIVER_SHELF_DEPTH_SHARE = 0.20
RIVER_CHANNEL_DEPTH_SHARE = 0.80
RIVER_SHELF_START = 0.68
RIVER_CHANNEL_INNER = 0.10
RIVER_CHANNEL_OUTER = 0.72
RIVER_DEPTH_EDGE_START = 0.90
RIVER_BANK_INCISION_SCALE = 0.08
```

`WaterMaterialTuning.ts` owns fixed visual endpoints:

```text
WATER_RIVER_POOL_FREQUENCY_SCALE = 0.90
WATER_RIVER_RIFFLE_FREQUENCY_SCALE = 1.14
WATER_RIVER_SHALLOW_ENERGY_WEIGHT = 0.86
WATER_RIVER_SLOPE_ENERGY_WEIGHT = 0.14
WATER_RIVER_BANK_FLOW_SCALE = 0.75
```

Do not expose these until visual review proves a real need.

---

# 7. Width safety contract

With the new base range:

```text
maxWidthScale =
  RIVER_BASE_MAX_WIDTH_SCALE *
  (1 + riverWidthVariation) *
  (1 + riverBendBankAsymmetry)

minWidthScale =
  RIVER_BASE_MIN_WIDTH_SCALE *
  (1 - riverWidthVariation) *
  (1 - riverBendBankAsymmetry)
```

Require:

```text
maxWidthScale <= 1.18
minWidthScale >= 0.82
```

Defaults now leave meaningful headroom:

```text
max = 1.03 * 1.08 * 1.04 = 1.156896
min = 0.95 * 0.92 * 0.96 = 0.83904
```

Update existing minimum-visible/wet-width safety helpers only if their constants are no longer conservative. Prefer keeping the existing global `0.82/1.18` envelope as the shared bound.

---

# 8. R1 — richer lane sample without extra octave

Extend the reused lane scratch object:

```ts
signedDistance: number;
primarySin: number;
secondarySin: number;
```

In `sampleLane()`:

```ts
const primarySin = Math.sin(primaryPhase);
const secondarySin = Math.sin(secondaryPhase);

const centerZ =
  shape.laneOffset +
  primarySin * shape.amplitude +
  secondarySin * shape.amplitude * RIVER_SECONDARY_AMPLITUDE;

const signedDistance = z - centerZ;

target.signedDistance = signedDistance;
target.distance = Math.abs(signedDistance);
target.primarySin = primarySin;
target.secondarySin = secondarySin;
```

Rename lane `halfWidth` to `baseHalfWidth`:

```ts
const baseWidthScale = lerp(
  RIVER_BASE_MIN_WIDTH_SCALE,
  RIVER_BASE_MAX_WIDTH_SCALE,
  hash(index, seed + 1361),
);

shape.baseHalfWidth = config.riverWidth * baseWidthScale * 0.5;
```

Pick the nearest lane before calculating cosines.

---

# 9. R2 — normalized longitudinal morphology

For the selected lane, calculate the cosines already needed by the tangent:

```ts
const primaryCos = Math.cos(lane.primaryPhase);
const secondaryCos = Math.cos(lane.secondaryPhase);
```

One morphology signal:

```ts
const morphologyRaw =
  lane.primarySin * lane.secondarySin * RIVER_MORPH_PRIMARY_WEIGHT +
  primaryCos * secondaryCos * RIVER_MORPH_SECONDARY_WEIGHT;

const morphology = clamp(
  morphologyRaw / RIVER_MORPH_MAX_ABS,
  -1,
  1,
);
```

The weighted expression is equivalent to a dominant long beat plus a weaker shorter beat generated from the existing phases; no new noise/trig is required.

Interpretation:

```text
+1 = pool tendency: wider, deeper, calmer
 0 = run
-1 = riffle tendency: narrower, shallower, more energetic
```

QA classification only:

```text
pool candidate    morphology >= +0.50
riffle candidate  morphology <= -0.50
run               otherwise
```

Never quantize carving or rendering to these classes.

---

# 10. R3 — bend driver and provisional tangent

Use the existing analytic centreline.

```ts
const firstDerivative =
  primaryCos * amplitude * primaryFrequency +
  secondaryCos * amplitude * RIVER_SECONDARY_AMPLITUDE * secondaryFrequency;

const secondDerivative =
  -lane.primarySin * amplitude * primaryFrequency * primaryFrequency -
  lane.secondarySin * amplitude * RIVER_SECONDARY_AMPLITUDE *
    secondaryFrequency * secondaryFrequency;

const secondDerivativeReference = Math.max(
  1e-9,
  amplitude * (
    primaryFrequency * primaryFrequency +
    RIVER_SECONDARY_AMPLITUDE * secondaryFrequency * secondaryFrequency
  ),
);

const bend = clamp(
  secondDerivative / secondDerivativeReference,
  -1,
  1,
);
```

Interpretation:

```text
bend > 0: inside bank toward +z
bend < 0: inside bank toward -z
```

Keep the provisional normalized tangent:

```ts
const tangentLength = Math.sqrt(1 + firstDerivative * firstDerivative);

target.flowX = flowSign / tangentLength;
target.flowZ = flowSign * firstDerivative / tangentLength;
```

**Important:** do not describe this as final downstream orientation. The existing water-chunk interaction stage settles it downhill after water surface heights are known.

Do not multiply `bend` by `flowSign`; geometric inside/outside does not change when downstream orientation flips.

---

# 11. R4 — local width and bank asymmetry

```ts
const side =
  lane.signedDistance > 0 ? 1 :
  lane.signedDistance < 0 ? -1 : 0;

const morphologyWidth =
  1 + config.riverWidthVariation * morphology;

const bendSide = bend * side;
// bendSide > 0 is the inside bank.
const bendWidth =
  1 + config.riverBendBankAsymmetry * bendSide;

const localHalfWidth =
  lane.shape.baseHalfWidth * morphologyWidth * bendWidth;
```

Use this exact local half-width for:

- coverage;
- bank mask;
- water proximity;
- normalized lateral coordinate.

No separate ecology width equation.

---

# 12. R5 — asymmetric cross-section

```ts
const lateral = clamp(
  lane.signedDistance / Math.max(localHalfWidth, 1e-6),
  -1,
  1,
);
const absLateral = Math.abs(lateral);

const channelCenter =
  -bend * config.riverBendChannelShift;

const edgeMask =
  1 - smoothstep(absLateral, RIVER_DEPTH_EDGE_START, 1);

const shelf =
  RIVER_SHELF_DEPTH_SHARE *
  (1 - smoothstep(absLateral, RIVER_SHELF_START, 1));

const channelDistance = Math.abs(lateral - channelCenter);
const channel =
  RIVER_CHANNEL_DEPTH_SHARE *
  (1 - smoothstep(
    channelDistance,
    RIVER_CHANNEL_INNER,
    RIVER_CHANNEL_OUTER,
  ));

const section = clamp((shelf + channel) * edgeMask, 0, 1);

const depthScale =
  1 + config.riverDepthVariation * morphology;

const bedDepth =
  config.riverDepth * section * depthScale * altitudeMask;
```

Expected result:

```text
pool       wider + deeper
riffle     narrower + shallower
inside     wider shallow shelf
outside    active channel shifted toward cut bank
bank edge  depth approaches zero continuously
```

Extend reused `RiverSample` with:

```ts
morphology: number;
bend: number;
lateral: number;
localHalfWidth: number;
bedDepth: number;
incisionDepth: number;
```

Expose CPU-only semantic values from `HydrologySample`:

```ts
riverMorphology: number;
riverBend: number;
riverLateral: number;
```

Do not pack them into GPU attributes in this pass.

---

# 13. R6 — carve one explicit depth; preserve current surface model

Replace arbitrary coverage-weighted river incision.

```ts
const shoulderIncision =
  config.riverDepth *
  RIVER_BANK_INCISION_SCALE *
  river.bank *
  (1 - river.coverage);

river.incisionDepth = river.bedDepth + shoulderIncision;

let carved = sourceHeight - river.incisionDepth;
```

Lake carving remains unchanged.

For the river surface, preserve the current architecture:

```ts
const riverWaterLevel =
  carvedHeight + river.incisionDepth + config.waterSurfaceOffset;
```

Equivalent conceptual form:

```text
riverWaterLevel = sourceHeight + waterSurfaceOffset
```

This means:

- the **new bed depth is explicit and coherent**;
- `waterData.y` becomes the generated incision depth plus the existing small surface offset;
- this pass does **not** pretend to solve hydraulic water-surface elevation.

Do not add an extra raw-terrain centreline sample per terrain sample just to flatten the sheet; that would be expensive and mixes a separate hydrology problem into this pass.

### Surface-slope guard

Before implementation, record the existing fixed-seed cross-flow surface-slope distribution at deterministic river points. After R1-R6:

- it must remain finite;
- it must remain continuous across chunks;
- p95 absolute cross-flow slope must not regress by more than 5% plus a small numeric tolerance;
- visual-matrix bend/straight views must not show a new obvious bank-to-bank water ramp.

If the **baseline** itself fails visual review, create a separate river-surface-elevation plan after this pass. Do not patch it with arbitrary local flattening constants here.

---

# 14. R7 — local visual flow energy, no new GPU data

Add controller uniforms only for artist values:

```text
uWaterRiverReferenceDepth
uWaterRiverPoolFlowScale
uWaterRiverRiffleFlowScale
uWaterShoreFoamWeight
uWaterRiffleFoamWeight
uWaterStoneFoamWeight
```

Use:

```text
uWaterRiverReferenceDepth = riverDepth + waterSurfaceOffset
```

In `WaterShader.ts`:

```glsl
float waterRiverDepthRatio =
  waterDepth / max(0.1, uWaterRiverReferenceDepth);

float waterChannelCore = smoothstep(
  0.35,
  0.88,
  waterCoverageRaw
);

float waterShallowEnergy = 1.0 - smoothstep(
  0.68,
  1.02,
  waterRiverDepthRatio
);

float waterSurfaceSlopeEnergy = saturate(
  (1.0 - waterGeometricNormal.y) * 6.0
);

float waterEnergy01 = saturate(
  (
    waterShallowEnergy * WATER_RIVER_SHALLOW_ENERGY_WEIGHT +
    waterSurfaceSlopeEnergy * WATER_RIVER_SLOPE_ENERGY_WEIGHT
  ) * waterChannelCore
);

float waterLocalFlowScale = mix(
  uWaterRiverPoolFlowScale,
  uWaterRiverRiffleFlowScale,
  waterEnergy01
);

waterLocalFlowScale *= mix(
  WATER_RIVER_BANK_FLOW_SCALE,
  1.0,
  waterChannelCore
);

float waterLocalFlowSpeed =
  uWaterFlowSpeed * waterLocalFlowScale;

float waterRiverFrequencyScale = mix(
  WATER_RIVER_POOL_FREQUENCY_SCALE,
  WATER_RIVER_RIFFLE_FREQUENCY_SCALE,
  waterEnergy01
);
```

In practice the TypeScript tuning constants are interpolated into shader source or exposed as compile-time literals using the existing material-tuning pattern. Do not create uniforms for fixed implementation coefficients.

Use `waterLocalFlowSpeed` and `waterRiverFrequencyScale` only for river components:

- advected river noise timing;
- river phases A/B/C;
- river flow sheen;
- riffle motion.

Lake timing stays unchanged.

---

# 15. R8 — riffle/foam hierarchy

Prevent shallow banks from being mistaken for riffles:

```glsl
float waterRiffleEnergy =
  waterRiverAmount *
  waterChannelCore *
  waterDetailWeight *
  waterShallowEnergy *
  smoothstep(0.50, 0.86, waterEnergy01);
```

Gate the existing procedural riffle pattern with this value.

Final foam cause balance:

```glsl
float waterFoamAmount = saturate(
  (
    waterShoreBand * uWaterShoreFoamWeight +
    waterRiverFoam * uWaterRiffleFoamWeight +
    waterStoneFoam * uWaterStoneFoamWeight
  ) * uWaterFoamStrength
);
```

Required hierarchy:

```text
stone/obstacle > energetic riffle > quiet shoreline
```

A calm bank must not become a white outline.

---

# 16. R9 — bed composition with unchanged samples

Add only the reference-depth uniform to the bed controller.

```glsl
float bedDepthRatio =
  waterBedDepth / max(0.1, uWaterRiverReferenceDepth);

float bedChannelCore = smoothstep(
  0.40,
  0.88,
  waterBedCoverageRaw
);

float bedRiffle =
  waterBedRiverAmount *
  bedChannelCore *
  (1.0 - smoothstep(0.68, 1.02, bedDepthRatio));

float bedPool =
  waterBedRiverAmount *
  bedChannelCore *
  smoothstep(1.05, 1.24, bedDepthRatio);

float bedBank =
  waterBedRiverAmount *
  (1.0 - smoothstep(0.42, 0.86, waterBedCoverageRaw));
```

Reinterpret the already sampled bed channels:

```glsl
float coarseBias =
  bedRiffle * 0.24 +
  bedChannelCore * 0.04 -
  bedPool * 0.16;

pebble = saturate(pebble + coarseBias);

float fineDeposition = saturate(
  bedPool * 0.20 +
  bedBank * 0.12
);

pebble *= 1.0 - fineDeposition;

algae *= clamp(
  1.0 + bedBank * 0.24 - bedRiffle * 0.28,
  0.58,
  1.24
);
```

Deep-pool darkening remains subtle:

```glsl
waterBedColor *= 1.0 - bedPool * 0.05;
```

No new bed sample.

---

# 17. R10 — shoreline composition from existing terrain samples

Reuse values already present in `TerrainMaterialShader.ts`:

```text
terrainWaterProximity
terrainCoverage
terrainBaseNoise
terrainMesoNoise
terrainMicroNoise
```

No shoreline mesh/texture.

```glsl
float shoreBand = smoothstep(
  0.94,
  1.0,
  terrainWaterProximity
);

float shoreExposure =
  shoreBand * (1.0 - terrainCoverage * 0.75);

float shorePatch = clamp(
  0.55 +
  (terrainBaseNoise.r - 0.5) * 0.90 +
  (terrainMesoNoise.g - 0.5) * 0.65,
  0.0,
  1.0
);

float shoreMud =
  shoreExposure *
  (1.0 - smoothstep(0.46, 0.63, shorePatch));

float shoreGravel =
  shoreExposure *
  smoothstep(0.68, 0.84, shorePatch);
```

Keep wet sheen on exposed ground, not grass.

Expected sequence:

```text
water -> submerged sediment/gravel -> irregular mud/gravel -> damp short vegetation -> normal grass
```

---

# 18. R11 — stone wakes, still three samples

Keep `WAKE_SAMPLE_COUNT = 3`.

Broaden radius downstream:

```ts
for (let index = 1; index <= WAKE_SAMPLE_COUNT; index += 1) {
  const progress = index / WAKE_SAMPLE_COUNT;
  const distance = config.waterStoneWakeLength * progress;

  const wakeRadius =
    STONE_INTERACTION_EXTRA_RADIUS *
    (0.70 + progress * 0.80);

  const upstreamClearance = sampleStoneGrassClearance(
    x - flowX * distance,
    z - flowZ * distance,
    wakeRadius,
  );

  const upstreamObstacle = clamp01(1 - upstreamClearance);
  const strength = lerp(0.85, 0.55, progress);
  wake = Math.max(wake, upstreamObstacle * strength);
}
```

The **input `flowX/flowZ` here is already the settled downhill flow** from `WaterChunkInteractionResolver`. Preserve that call order.

---

# 19. R12 — restrained context tint

Depth remains dominant.

```glsl
float waterPoolTint =
  waterRiverAmount *
  waterChannelCore *
  smoothstep(1.05, 1.26, waterRiverDepthRatio);

float waterRiffleTint =
  waterRiverAmount *
  waterChannelCore *
  waterShallowEnergy *
  waterEnergy01;

waterSurfaceColor *=
  1.0 - waterPoolTint * 0.03 +
  waterRiffleTint * 0.02;
```

Do not add another palette/texture unless final screenshots prove the current shallow/deep colours cannot express the result.

---

# 20. River tuning menu

Use a native `RiverArtMenu.ts`, patterned after `GrassArtMenu.ts`.

Activation:

```text
?riverTuning=1
```

Only create it when `profile.showGui` is true. Normal production visits create no menu objects.

## Geometry section — reload required

```text
Width variation      riverWidthVariation
Bend asymmetry       riverBendBankAsymmetry
Depth variation      riverDepthVariation
Channel shift        riverBendChannelShift
```

When changed:

1. validate the value;
2. validate combined width envelope;
3. show `Geometry changes pending`;
4. do not mutate existing chunks;
5. `Apply geometry + reload` stores an allowlisted override in `sessionStorage`;
6. reload;
7. load frozen `world.yaml` config normally;
8. clone it with only allowlisted development overrides;
9. call `validateWorldConfig()` on the clone;
10. `Object.freeze()` the merged config;
11. construct a fresh `TerrainField`/`TerrainStreamer` from that one config.

Use:

```text
fluffygrass:river-tuning:v2
```

Use `sessionStorage`, not `localStorage`.

`RiverDevelopmentConfig.ts` must never mutate the frozen object returned by `WorldConfigLoader`.

Prefer a dynamic import from `WorldApp.create()` under the tuning query so normal startup does not load development code.

## Motion section — live

```text
Base flow          waterFlowSpeed
Pool flow          waterRiverPoolFlowScale
Riffle flow        waterRiverRiffleFlowScale
Ripple strength    waterRippleStrength
Ripple scale       waterRippleScale
Flow breakup       waterFlowNoiseStrength
```

## Foam/wake section

Live:

```text
Foam strength      waterFoamStrength
Shore foam         waterShoreFoamWeight
Riffle foam        waterRiffleFoamWeight
Stone foam         waterStoneFoamWeight
Wake strength      waterStoneWakeStrength
```

Reload required:

```text
Wake length        waterStoneWakeLength
```

Wake length affects the already generated interaction buffer. Do not create a special rebuild system solely for tuning.

## Bed section — live

```text
Bed visibility     waterBedStrength
Bed scale          waterBedScale
Bed refraction     waterBedRefraction
Algae              waterAlgaeStrength
Caustics           waterCausticStrength
```

## Optics section — live

```text
Opacity            waterOpacity
Depth absorption   waterDepthFade
Fresnel            waterFresnelStrength
Roughness          waterRoughness
Glint              waterGlintStrength
```

## QA buttons

```text
Go: Pool
Go: Riffle
Go: Straight
Go: Inside bend
Go: Outside bend
Go: Wet bank
Go: Stone wake
```

Use the same deterministic landmark resolver as automated QA. No coordinates hardcoded in the menu.

## Export

`Export YAML` outputs only persistent world-config keys, in the same order as `world.yaml`.

Approved values must be copied into `public/config/world.yaml`; the session override is never production state.

---

# 21. Deterministic tests

Canonical seed:

```text
42017
```

No `Math.random()` in river code or tests.

## Hydrology fixed grid

At minimum:

```text
x = -768 .. +768, step 8 m
z = -768 .. +768, step 8 m
```

Also test exact chunk edges and altitude-fade source heights.

Assert repeated identical inputs produce identical:

```text
coverage
bank
proximity
provisional flowX/flowZ
morphology
bend
lateral
localHalfWidth
bedDepth
incisionDepth
```

## Morphology range

Require:

```text
-1 <= morphology <= 1
```

Across the fixed grid, require samples to populate both:

```text
morphology >= +0.50
morphology <= -0.50
```

This catches accidental loss of normalization/dynamic range.

## Width envelope

```text
0.82 - epsilon <= localWidthScale <= 1.18 + epsilon
```

Also test boundary configs near validator limits.

## Bend geometry

For near-straight samples:

```text
abs(bend) < 0.05
```

mirrored cross-section depth at `|lateral| = 0.45` and `0.70` should be nearly equal.

For strong positive bend:

```text
bend >= 0.45
outside = negative lateral
inside  = positive lateral
```

At equal absolute lateral distance, outside-channel depth should exceed inside-channel depth where the active-channel mask applies. Reverse sides for negative bend.

## Pool/riffle statistics

Across the deterministic set:

```text
mean local width(pool candidates) > mean local width(riffle candidates)
mean centre depth(pool candidates) > mean centre depth(riffle candidates)
```

Use aggregate assertions rather than demanding every bend sample obey an oversimplified local rule.

## Continuity

Sample selected lanes every `1 m` for at least `512 m`.

Require finite bounded neighboring changes in:

```text
morphology
localHalfWidth
bedDepth
```

No hard pool/run/riffle classification may feed carving.

## Chunk seam

Sample exact chunk boundaries and `±1e-6` around them. River identity must not depend on chunk index/build order.

## Final downhill flow

Extend the existing `verify-water-flow.mjs` contract rather than creating another flow implementation.

For generated/synthetic water sheets:

```text
dot(surfaceGradient, settledFlow) <= epsilon
```

Require normalized direction where river coverage is active.

## Cross-channel surface regression

Add a deterministic measurement helper to `verify-hydrology.mjs` or a focused helper script only if the existing verifier becomes unwieldy.

At fixed active river points:

1. sample water levels at small offsets along the flow-perpendicular direction;
2. use only points that remain visibly wet;
3. calculate absolute cross-flow slope;
4. record baseline p50/p95 before R1 implementation;
5. after R1-R6, require p95 not to increase by more than 5% plus numeric tolerance.

This is a regression guard, not a claim that the current surface model is physically perfect.

---

# 22. Static performance contract

Create `scripts/verify-river-performance-contract.mjs` and include it in `npm run build`.

It should statically assert:

- no third river centreline sine octave in `sampleLane()`;
- cosine work remains selected-lane work;
- no river noise texture/sampler was introduced;
- `WAKE_SAMPLE_COUNT === 3`;
- `waterData` item size remains `4`;
- `waterInteraction` item size remains `2`;
- no `riverMorphology`, `riverBend`, or `riverLateral` GPU attribute/varying exists;
- surface-water sampler set is unchanged;
- bed sampler set is unchanged;
- water surface remains `forceSinglePass`;
- `TerrainStreamer` owns shared water/bed controllers rather than per-chunk materials;
- downhill resolution still occurs before stone interaction sampling.

Keep this verifier structural. Do not encode fragile formatting or line-count limits unrelated to performance.

Add:

```json
"test:river-perf-contract": "node scripts/verify-river-performance-contract.mjs"
```

and:

```json
"test:river": "npm run test:config && npm run test:hydrology && npm run test:water-flow && npm run test:water-render && npm run test:terrain-surface && npm run test:stones && npm run test:river-perf-contract"
```

---

# 23. Deterministic visual landmarks

Extend `WorldVisualMatrixLocations.ts` with:

```text
riverPool
riverRiffle
riverStraight
riverInsideBend
riverOutsideBend
```

Suggested candidate rules:

## Pool

```text
riverCoverage >= 0.35
riverMorphology >= +0.50
waterDepth >= 0.70
```

## Riffle

```text
riverCoverage >= 0.35
riverMorphology <= -0.50
0.08 <= waterDepth <= 1.00
```

## Straight

```text
riverCoverage >= 0.35
abs(riverBend) <= 0.08
abs(riverMorphology) <= 0.25
```

## Inside bend

```text
riverCoverage >= 0.20
abs(riverBend) >= 0.45
0.40 <= abs(riverLateral) <= 0.80
sign(riverLateral) == sign(riverBend)
```

## Outside bend

Same, except:

```text
sign(riverLateral) != sign(riverBend)
```

Use deterministic fallback ordering.

`WorldVisualMatrixPoses.ts` should add:

- top-down pool;
- grazing pool;
- top-down riffle;
- grazing/upstream riffle;
- inside bend;
- outside bend;
- straight cross-channel view.

Orient river cameras from the resolved flow vector rather than fixed world axes.

---

# 24. Repeatable production performance test

Use production output:

```bash
npm run build
npm run preview
```

Recommended query:

```text
?qa=visual-matrix&profile=desktop&gpuTiming=1
?qa=visual-matrix&profile=compact&gpuTiming=1
```

Do not combine `stats=1` with GPU timing; the current diagnostics controller intentionally disables GPU timing when the stats panel is active.

Controlled run:

1. same machine/browser/browser version;
2. same power mode;
3. close unrelated GPU-heavy applications/tabs;
4. browser zoom 100%;
5. fixed desktop viewport `1920x1080`;
6. fixed compact viewport documented for the run, recommended `412x915`;
7. same DPR between compared runs;
8. same deterministic visual-matrix pose;
9. warm up 4 seconds after camera/streaming stabilizes;
10. collect at least 3 seconds of frames;
11. run the complete river pose set 5 times;
12. discard first complete run only if it is an obvious shader/cache warm-up outlier;
13. compare median p50 and median p95 of the remaining runs;
14. record draw calls and triangles beside timing.

Use the existing visual-matrix frame statistics (`p50Ms`, `p95Ms`, etc.) rather than inventing a second browser timing format.

If timing regresses with unchanged shader architecture, inspect transparent pixel coverage first: wider water can increase fragment cost without changing draw/sampler counts.

---

# 25. Manual tuning order

Do not tune everything simultaneously.

## A. Geometry

Tune only:

```text
riverWidthVariation
riverBendBankAsymmetry
riverDepthVariation
riverBendChannelShift
```

Inspect Pool, Riffle, Straight, Inside bend, Outside bend.

## B. Motion

Tune:

```text
waterFlowSpeed
waterRiverPoolFlowScale
waterRiverRiffleFlowScale
waterRippleStrength
waterRippleScale
waterFlowNoiseStrength
```

Acceptance: downstream direction is obvious without foam; pool is calmer; riffle is tighter without aliasing.

## C. Optics

Tune:

```text
waterDepthFade
waterOpacity
waterFresnelStrength
waterRoughness
waterGlintStrength
```

Do not fake depth by simply increasing opacity.

## D. Bed

Tune:

```text
waterBedStrength
waterBedScale
waterBedRefraction
waterAlgaeStrength
waterCausticStrength
```

## E. Foam/wakes last

Tune:

```text
waterFoamStrength
waterShoreFoamWeight
waterRiffleFoamWeight
waterStoneFoamWeight
waterStoneWakeStrength
waterStoneWakeLength
```

If flow only becomes readable after increasing foam, return to motion/depth.

## F. Commit values

Export YAML, paste approved values into `public/config/world.yaml`, clear session overrides, reload without `riverTuning`, and run deterministic tests from committed YAML.

---

# 26. Implementation sequence

## Commit 0 — measurement/contract scaffolding

Before changing river algorithms:

- add `benchmark-river-generation.mjs`;
- add static river performance-contract skeleton;
- record fixed-seed cross-flow surface baseline;
- capture baseline visual-matrix river locations available in the current system;
- record desktop/compact production frame stats.

Do not change visuals in this commit.

## Commit 1 — config + morphology + width

Files:

- YAML/config/schema/validator;
- `RiverTuning.ts`;
- `RiverField.ts`;
- config/hydrology verification.

Implement R1-R4.

Gate before continuing:

- morphology reaches both QA bands;
- width envelope passes;
- continuity passes;
- benchmark within review budget.

## Commit 2 — cross-section/depth

Files:

- `RiverField.ts`;
- `HydrologyField.ts`;
- hydrology tests;
- CPU semantics for QA.

Implement R5-R6.

Gate:

- outside/inside depth relation passes;
- pool/riffle statistics pass;
- no chunk seam;
- cross-flow surface regression guard passes.

## Commit 3 — visual flow + foam + tint

Files:

- `WaterMaterialController.ts`;
- `WaterMaterialTuning.ts`;
- `WaterShader.ts`;
- flow/render verifiers.

Implement R7, R8, R12.

Gate:

- no sampler/varying/draw increase;
- downhill resolver still authoritative;
- quiet bank does not foam continuously.

## Commit 4 — bed

Files:

- bed controller/shaders;
- water render verifier.

Implement R9.

## Commit 5 — shore + wakes

Files:

- terrain material shader/controller only as needed;
- `WaterInteractionField.ts`;
- terrain/stones verification.

Implement R10-R11.

## Commit 6 — tuning and deterministic visual QA

Files:

- `RiverArtMenu.ts`;
- `RiverDevelopmentConfig.ts`;
- `WorldApp.ts`;
- `TerrainStreamer.ts`;
- style;
- visual locations/poses/runner;
- package aliases.

The menu is tooling, not a prerequisite for the core algorithm. Keep it out of earlier commits so geometry/render regressions remain easy to isolate.

## Optional Commit 7 — character-water feedback

Only after R1-R12 is signed off.

Maximum:

```text
1 InstancedMesh
4 active ripples desktop
2 compact
analytic ring shader
no ripple texture
```

Audio remains a separate optional task when suitable assets exist.

---

# 27. Required commands

Focused during implementation:

```bash
npm run test:config
npm run test:hydrology
npm run test:water-flow
npm run test:water-render
npm run test:terrain-surface
npm run test:stones
npm run test:river-perf-contract
npm run bench:river
```

Integrated:

```bash
npm run test:river
npm run build
```

Manual deployment only after visual/performance sign-off:

```bash
npm run build
npm run deploy:pages
```

No GitHub Actions.

---

# 28. Explicit non-goals

Do not add in this pass:

- SSR;
- planar reflections;
- scene-colour refraction;
- fluid/compute simulation;
- Gerstner geometry waves for rivers;
- tessellated water;
- shoreline decals;
- shoreline distance textures;
- pool/riffle textures;
- extra bed textures;
- extra river normal maps;
- a third centreline sine octave;
- explicit morphology/bend GPU attributes;
- new per-chunk material state;
- lil-gui/dat.gui runtime dependency;
- a centreline terrain-resampling system for hydraulic surface leveling.

---

# 29. Definition of done

The river pass is complete when:

- [ ] one normalized continuous morphology signal drives pool/run/riffle structure;
- [ ] morphology provides real `-1..1` tuning semantics and reaches both QA bands;
- [ ] local width always remains inside the `0.82..1.18` global safety envelope;
- [ ] default width tuning leaves safety headroom rather than sitting on the limit;
- [ ] strong bends have a broader inside shelf and deeper outside active channel;
- [ ] carving uses explicit cross-section depth rather than arbitrary coverage weights;
- [ ] current water-surface model does not regress in cross-channel slope or seams;
- [ ] the existing downhill flow resolver remains authoritative for final flow and wakes;
- [ ] pools look calmer/longer and riffles faster/tighter without a simulation;
- [ ] quiet banks are nearly foam-free;
- [ ] riffles read from depth + bed + motion before foam;
- [ ] riverbed composition changes with depth/energy with no new texture samples;
- [ ] shoreline mud/gravel uses existing terrain samples;
- [ ] stone wakes improve while retaining exactly three stone-field samples;
- [ ] bed/pebbles/caustics never overlay the character;
- [ ] R1-R12 adds no mandatory draw, texture, render pass, sampler, vertex attribute, or varying;
- [ ] desktop and compact/mobile share identical macro river geometry;
- [ ] deterministic tests pass from committed YAML;
- [ ] static performance-contract test passes;
- [ ] manual CPU benchmark does not show a material regression;
- [ ] production visual-matrix p50/p95 remain within the stated budgets;
- [ ] RiverArtMenu can preview safely, export YAML, and clear all session overrides;
- [ ] running without `?riverTuning=1` reproduces committed `world.yaml` behavior;
- [ ] `npm run build` passes;
- [ ] final desktop and compact/mobile visual matrix is reviewed.

The highest-value stopping point remains R1-R12. Character ripples and audio are secondary to coherent structure, depth, downstream motion, bed, and banks.
