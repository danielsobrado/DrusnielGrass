# Mobile grass naturalness and performance implementation plan

## Status

**Implemented.** G0-G6 are in `main`; `npm run build` is green, including the new
`verify-grass-placement` gate. What shipped, and where it differs from the plan above:

| Phase | State |
| --- | --- |
| G0 diagnostics + GPU timer | Implemented (`GrassWorkloadProbe`, `WorldDiagnosticsHud`, `GpuFrameTimer`). The accent layer was added to the probe afterwards, so the HUD's Mid/Far line now also carries `Accents N cards`. |
| G1 root distribution | Implemented. Seven `grassClump*` values in `world.yaml`, schema-checked and cross-validated; per-tuft radius/aspect/ellipse/dominant heading hashed from global clump coordinates; `Math.pow(u, 0.58)` radial sample; lattice margin recomputed from the configured maximum reach; `GRASS_PLACEMENT_VERSION = 2` in the placement cache key. |
| G2 direction blending | Implemented, allocation-free and scalar inside the sampling loop. |
| G3 motion decorrelation | Implemented as `grassMotionPhase = fract(grassPhase + instanceVariation.x)`, used by flutter and stiffness only. Both dither expressions still read `grassPhase`, and the gate now asserts that they do. Material program cache keys bumped to v20. |
| G4 independent plane and lean | Implemented. The near source blade is straight and lean is a transform rotation about the axis perpendicular to the blended heading; the plane azimuth is drawn independently. The rotation angle is scaled by `INSTANCE_HORIZONTAL_SCALE_MAX / INSTANCE_VERTICAL_SCALE_MAX` so worst-case tip displacement is exactly the `bladeLeanMax x horizontal scale` the reserved bounds already charge, rather than 2% over it. |
| G5 compact density | **40 blades/m², not 32.** See below. |
| G6 compact wind | Implemented. `grassCompactGustGlsl()` in `WindNoiseTexture.ts` is the single source of the two-wave compact gust, used by the near/mid, impostor, and accent materials. Weights sum to one, so the envelope stays in [0, 1] and the reserved wind displacement is unchanged. |

### G5 result: 40 blades/m², ultra x1.5

The A/B was captured at the plan's third-person framing (6 m back, 28 degrees
down) on the compact profile, against the G1-G4 placement:

| Compact density | Logical blades | Verdict |
| --- | ---: | --- |
| 48 (previous) | 5.63 M | Continuous, but denser than the silhouette needs. |
| 40 | 4.69 M | Continuous at every distance in frame. **Selected.** |
| 32 (plan candidate) | 3.75 M | Bare ground reads through the near foreground — the acceptance criterion's ground holes. |

32 is too thin *because of* G1: spreading roots over the tuft area instead of
piling them on its centre lowers apparent coverage at equal blade count, so the
density floor moved up while the field got more natural. The ultra-near
multiplier went to 1.5 as the plan proposed, but through a new
`grassUltraNearDensityMultiplierCompact` — the existing key is shared with
desktop, and lowering it would have silently thinned the desktop near band that
the plan explicitly excludes from this change.

Frame-rate confirmation on the reference phone is still outstanding: these
captures are SwiftShader at desktop resolution, which can judge coverage but not
FPS or GPU time.

### Verification

`scripts/verify-grass-placement.mjs` (wired into `npm run build`) reproduces the
tuft maths against the shipped configuration and asserts determinism, cross-tile
agreement on shared tufts, roots inside the configured ellipse, the radius
histogram (30.4% inside half-radius against the old rule's ~50%), and heading
statistics at both ends — per-tuft spread 0.083 against 0.980 across the field,
so tufts stay locally coherent without a global bias.

`verify-grass-performance.mjs` gained the plan's source-level invariants: compact
density band, clump config validation, placement version in the cache key, motion
phase not touching either dither, no allocation in the placement loop, one shared
compact gust expression across all four materials, and the honest-diagnostics
HUD wording.

---

Original plan follows.

The review is based on the compact/mobile build shown on 2026-08-06 and the current `main` implementation in:

- `src/world/WorldGrassSystem.ts`
- `src/world/grass/WorldNearGrassField.ts`
- `src/world/grass/WorldSingleBladeTileFactory.ts`
- `src/world/grass/WorldSingleBladeTileField.ts`
- `src/world/grass/WorldGrassPatchGeometryFactory.ts`
- `src/grass/materials/GrassNearMaterial.ts`
- `src/grass/GrassLodController.ts`
- `src/runtime/GrassQualityGovernor.ts`
- `public/config/grass.yaml`
- `public/config/world.yaml`
- `public/config/runtime.yaml`

## Executive summary

The compact build is already holding approximately 60 FPS at quality tier T0, with 143-144 draw calls and 539k-595k rendered triangles in the two captures. The current performance architecture is generally sound: near instances are prefix-trimmed, mid geometry uses `drawRange`, far cards are consolidated by chunk, compact shadows are disabled, and compact pixel ratio is capped.

The two important problems are different:

1. The HUD reports approximately 6.3 million "blades", but that value is a logical density estimate combining resident near buffers, coverage-weighted mid patches, and far-card equivalents. It is not the number of blades submitted to the GPU.
2. The grass looks aligned because random values are being fed into a repeated structural grammar: fixed 3x3 clumps, strongly centre-weighted roots, radial blade headings, one canonical near-blade shape, shared source phase, and a compact sine gust field.

The implementation order must be:

1. Correct the diagnostics.
2. Remove the repeated radial/clump structure without increasing draw calls.
3. Decorrelate motion phase and stiffness.
4. A/B a lower compact density.
5. Only then consider transform compression or more invasive shape data.

## Captured baseline

| Metric | Capture A | Capture B |
| --- | ---: | ---: |
| FPS | 59.1 | 60.0 |
| Quality tier | T0, scale 1.00 | T0, scale 1.00 |
| Draw calls | 144 | 143 |
| Scene triangles | 595,233 | 539,052 |
| HUD logical blades | 6,329,573 | 6,343,482 |
| Resident patch instances | 10,260 | 10,260 |
| Submitted mid vertices | 1,068,672 | 776,064 |
| Submitted mid one-triangle blades | 356,224 | 258,688 |
| Submitted far cards | 5,056 | 4,608 |
| Near tiles | 116 | 119 |
| Grass CPU update | 0.23 ms | 0.32 ms |
| Renderer call CPU duration | 1.97 ms | 2.85 ms |

`submitted mid one-triangle blades` is `submittedMidVertices / 3` because the current mid representation is one triangle per blade.

The renderer duration displayed by the HUD is CPU time around `renderer.render()`. It is not reliable GPU time and must not be used as proof of GPU headroom.

## Why the 6.3 million blade number is misleading

The compact world configuration uses 48 blades per square metre and a 4 m x 4 m grass patch:

```text
16 m² x 48 blades/m² = 768 source blades per patch instance
```

With 10,260 resident patch instances, full source capacity is:

```text
10,260 x 768 = 7,879,680 source blade equivalents
```

The HUD reports less than that because it weights patch instances by current mid/far coverage and adds the separate near-field count. This is a useful art-density estimate, but it is not render work.

Current problems in `WorldGrassSystem.getDiagnostics()`:

- Near grass uses resident `bladeCount`, not current `mesh.count`.
- Mid and far values are logical coverage estimates rather than exact submissions.
- The patch blade estimate is accumulated for resident patches even when a patch is outside the frustum.
- Far cards are converted back into source-blade equivalents.
- The single `blades` label hides the difference between CPU residency, GPU submissions, visible logical density, and far-card representation.

## Target diagnostics model

Replace the ambiguous value with explicit counters. Keep the old field temporarily as a compatibility alias if tests or UI code still consume it.

### Required `WorldGrassDiagnostics` fields

```ts
export interface WorldGrassDiagnostics {
  // Existing lifecycle and build fields remain.

  residentPatchInstances: number;
  logicalBladeEquivalents: number;
  visibleLogicalBladeEquivalents: number;

  nearResidentUniqueInstances: number;
  nearSubmittedDrawInstances: number;
  nearSubmittedTriangles: number;

  midSubmittedBlades: number;
  midSubmittedVertices: number;
  farSubmittedCards: number;

  gpuFrameMs?: number;
}
```

Definitions:

- `residentPatchInstances`: sum of streamed patch `instanceCount`; this is what the current HUD calls patches/clumps.
- `logicalBladeEquivalents`: current all-resident estimate, renamed honestly.
- `visibleLogicalBladeEquivalents`: same estimate, but only for patches passing the visibility test.
- `nearResidentUniqueInstances`: base placement instances plus additional ultra-near instances. Do not count the base detail mesh again because it shares the base placement.
- `nearSubmittedDrawInstances`: sum of current `mesh.count` across base, base-detail, and ultra-near draw meshes. Shared placement is counted twice here when it is submitted twice because this metric measures GPU draw work, not unique plants.
- `nearSubmittedTriangles`: submitted draw instances multiplied by triangles in each source blade geometry.
- `midSubmittedBlades`: `GrassLodController.getSubmittedMidVertices() / 3` while the mid blade remains one triangle.
- `farSubmittedCards`: current `submittedFarInstances` renamed.

### `WorldSingleBladeTileField` implementation

Add a diagnostics method rather than repeatedly scanning tiles from different owners:

```ts
export interface SingleBladeFieldDiagnostics {
  residentInstances: number;
  submittedDrawInstances: number;
  submittedTriangles: number;
}

getDiagnostics(): SingleBladeFieldDiagnostics {
  const trianglesPerBlade =
    this.options.bladeSegments === 1
      ? 1
      : this.options.bladeSegments * 2;

  let residentInstances = 0;
  let submittedDrawInstances = 0;

  for (const tile of this.tiles.values()) {
    residentInstances += tile.bladeCount;
    if (tile.mesh.visible) {
      submittedDrawInstances += tile.mesh.count;
    }
  }

  return {
    residentInstances,
    submittedDrawInstances,
    submittedTriangles: submittedDrawInstances * trianglesPerBlade,
  };
}
```

The base field can deliberately submit a full prefix inside its detail guard while the shader rejects the complementary subset. That is still GPU submission work, so `mesh.count` is the correct value for this counter.

### `WorldNearGrassField` aggregation

Aggregate the three fields with two different meanings:

```ts
const base = this.baseField?.getDiagnostics();
const detail = this.baseDetailedField?.getDiagnostics();
const ultra = this.ultraNearField?.getDiagnostics();

nearResidentUniqueInstances =
  (base?.residentInstances ?? 0) +
  (ultra?.residentInstances ?? 0);

nearSubmittedDrawInstances =
  (base?.submittedDrawInstances ?? 0) +
  (detail?.submittedDrawInstances ?? 0) +
  (ultra?.submittedDrawInstances ?? 0);

nearSubmittedTriangles =
  (base?.submittedTriangles ?? 0) +
  (detail?.submittedTriangles ?? 0) +
  (ultra?.submittedTriangles ?? 0);
```

### HUD layout

Replace the single grass line with compact, unambiguous lines:

```text
Grass logical 6.34M visible 1.82M · patch inst 10,260
Near resident 420k · submit 168k inst / 312k tris
Mid submit 258,688 blades · Far submit 4,608 cards
```

Exact formatting may be shortened on compact screens, but the terms must remain explicit.

### GPU timing

Add an optional `GpuFrameTimer` around the renderer using `EXT_disjoint_timer_query_webgl2`.

Requirements:

- Never call `getQueryParameter(...QUERY_RESULT...)` until `QUERY_RESULT_AVAILABLE` is true.
- Check `GPU_DISJOINT_EXT`; discard invalid samples.
- Keep several queries in flight and poll old queries to avoid a synchronous stall.
- Report `undefined` when unsupported.
- Display a rolling median and p95 in QA output; do not rely on one frame.
- Keep CPU renderer duration as a separate metric.

Suggested file:

```text
src/runtime/GpuFrameTimer.ts
```

Do not make GPU timing a runtime dependency of rendering. Failure or lack of extension support must degrade to `N/A`.

## Root cause of the aligned appearance

### 1. Repeated canonical near blade

`WorldSingleBladeTileFactory.createSingleBladeGeometry()` builds one average blade. Every near instance receives the same source:

- Average configured height.
- Average configured width.
- Average configured lean.
- `grassPhase = 0.5`.
- `grassBladeShade = 0.5`.
- The same taper and curve.

Per-instance scaling changes dimensions, but every silhouette is structurally identical.

### 2. Fixed clump grammar

Every clump uses the same:

- 3 x 3 cell footprint.
- Radius scale.
- Centre-jitter envelope.
- Fan spread.
- Radial heading rule.

The global clump coordinates correctly prevent tile seams, but the repeated shape is visible at field scale.

### 3. Incorrect radial distribution for the stated intent

The current root offset uses:

```ts
const bladeRadius = random.next();
```

A radius sampled uniformly in `[0, 1]` is not uniform over disc area. It produces area density proportional to approximately `1 / radius`, creating a strong centre concentration. The nearby comment describes a linear density falloff, but the implementation does not produce that distribution.

Uniform disc area uses:

```ts
const bladeRadius = Math.sqrt(random.next());
```

A mildly centre-weighted tuft can use an exponent slightly above `0.5`, for example `0.58`. The current exponent is effectively `1.0`, which is too concentrated.

### 4. Radial heading dominates orientation

The instance yaw is derived from the vector from the clump centre to the blade. Random spread is only added around this radial direction. This creates repeated starburst tufts.

### 5. Compact motion is too coherent

Compact mode uses a sine gust fallback instead of the desktop noise texture. This is appropriate for cost, but the near source phase is constant, so stiffness and part of flutter timing remain overly synchronized.

## Natural placement implementation

The first visual fix must stay CPU-build-only and must not add draw calls, materials, textures, or per-frame work.

### Configuration

Add a small group to `WorldConfig`, `WorldConfigLoader`, and `public/config/world.yaml`:

```yaml
# Natural near-grass tuft distribution.
grassClumpRadiusScaleMin: 0.32
grassClumpRadiusScaleMax: 0.48
grassClumpAspectMin: 0.76
grassClumpAspectMax: 1.28
grassClumpRadialExponent: 0.58
grassClumpDominantDirectionWeight: 0.55
grassClumpRadialDirectionWeight: 0.20
```

Validation:

```text
0.20 <= radius min <= radius max <= 0.50
0.60 <= aspect min <= 1.00
1.00 <= aspect max <= 1.50
0.50 <= radial exponent <= 0.75
0 <= dominant direction weight <= 1
0 <= radial direction weight <= 1
sum of direction weights <= 0.90
```

The remaining direction weight belongs to independent per-blade randomness.

Keep `CLUMP_CELLS = 3` for this phase. Making topology configurable is unnecessary and would complicate cross-tile bounds and cache keys.

Add the new values to the placement cache key through a version bump. The existing `GRASS_BIOME_VERSION` is not enough because this change modifies placement independently of biome data. Introduce:

```ts
const GRASS_PLACEMENT_VERSION = 2;
```

and include it in `createPlacementKey()`.

### Per-clump hashed parameters

Derive these from global `clumpColumn` and `clumpRow`, not the sequential tile RNG:

```ts
const radiusScale = lerp(
  config.grassClumpRadiusScaleMin,
  config.grassClumpRadiusScaleMax,
  clumpValue(clumpColumn, clumpRow, RADIUS_SALT),
);

const aspect = lerp(
  config.grassClumpAspectMin,
  config.grassClumpAspectMax,
  clumpValue(clumpColumn, clumpRow, ASPECT_SALT),
);

const ellipseAngle =
  clumpValue(clumpColumn, clumpRow, ELLIPSE_ANGLE_SALT) * TWO_PI;

const dominantAngle =
  clumpValue(clumpColumn, clumpRow, DIRECTION_SALT) * TWO_PI;
```

This gives every tuft a different radius, ellipse, orientation, and dominant growth direction while remaining deterministic across tile boundaries.

### Root sampling

Replace the current circular radial sample with a rotated ellipse:

```ts
const sampleAngle = job.random.range(0, TWO_PI);
const sampleRadius = Math.pow(
  job.random.next(),
  config.grassClumpRadialExponent,
);

const localX =
  Math.cos(sampleAngle) * sampleRadius * radiusScale * clumpSpanX * aspect;
const localZ =
  Math.sin(sampleAngle) * sampleRadius * radiusScale * clumpSpanZ / aspect;

const ellipseCos = Math.cos(ellipseAngle);
const ellipseSin = Math.sin(ellipseAngle);
const offsetX = localX * ellipseCos - localZ * ellipseSin;
const offsetZ = localX * ellipseSin + localZ * ellipseCos;
```

Use the resulting `offsetX` and `offsetZ` for the world root. This removes the severe centre spike and prevents every tuft from being a circle.

The maximum configured radius and aspect must be included in the terrain-height lattice margin. Compute the real maximum from configuration instead of leaving `CLUMP_MAX_CELL_OFFSET` tied to the old fixed radius.

### Direction blending

Do not use radial angle plus a fixed random spread. Blend three unit vectors:

- A clump-wide dominant direction.
- The radial direction away from the centre.
- A fully random blade direction.

```ts
const radial = normalize2(offsetX, offsetZ, dominantAngle);
const dominant = direction2(dominantAngle);
const independent = direction2(job.random.range(0, TWO_PI));

const dominantWeight = config.grassClumpDominantDirectionWeight;
const radialWeight = config.grassClumpRadialDirectionWeight;
const independentWeight = 1 - dominantWeight - radialWeight;

const heading = normalize2(
  dominant.x * dominantWeight +
    radial.x * radialWeight +
    independent.x * independentWeight,
  dominant.z * dominantWeight +
    radial.z * radialWeight +
    independent.z * independentWeight,
  dominantAngle,
);

const facingAngle = Math.atan2(heading.x, heading.z);
```

This preserves the visual idea that a tuft grew together without making every blade radiate from its centre.

Create a small allocation-free helper using scalar numbers or a reused `THREE.Vector2`. Do not allocate vectors in the per-blade loop.

### Optional per-clump occupancy

Do not add random rejection in the first patch. It changes density and complicates the interpretation of configured blades/m². Radius variation and ellipse shape already produce irregular gaps.

Add occupancy only if screenshots still look uniformly filled after the first implementation. If added, compensate requested density so the expected surviving blades/m² remains correct.

## Independent plane facing and lean

The direction-blending patch above is the low-risk correction. It still uses one transform yaw, so blade plane and built-in source lean remain coupled.

A second patch can fully separate them without adding a per-instance attribute.

### Transform-based approach

1. Make the single-blade source geometry vertically straight in `createSingleBladeGeometry()`.
2. Choose `facingAngle` independently for the blade plane.
3. Choose `leanAngle` from the clump direction blend.
4. Choose lean magnitude from configured `bladeLeanMin`/`bladeLeanMax`.
5. Build an instance orientation from:
   - Terrain normal alignment.
   - Lean rotation around a horizontal axis perpendicular to `leanAngle`.
   - Plane-facing yaw.
6. Compose the existing instance matrix with the same scale values.

Conceptually:

```ts
const leanAngleRadians = Math.atan2(leanDistance, sourceHeight);

facingYaw.setFromAxisAngle(up, facingAngle);
leanAxis.set(Math.cos(leanAngle), 0, -Math.sin(leanAngle)).normalize();
leanRotation.setFromAxisAngle(leanAxis, leanAngleRadians);

orientation
  .copy(terrainAlignment)
  .multiply(leanRotation)
  .multiply(facingYaw);
```

The exact multiplication order must be verified with a slope fixture. The invariant is:

- Root remains fixed.
- Terrain alignment is preserved.
- Plane azimuth can differ from lean direction.
- Maximum horizontal tip displacement remains within configured `bladeLeanMax`.

`calculateGrassSingleBladeRootBoundsRadius()` already reserves configured maximum lean. Keep the displacement equivalent to that value so bounds remain valid.

### LOD risk

Mid geometry still has baked per-blade lean. Near and mid silhouettes therefore need screenshot verification across the near-to-mid fade. Do not change both representations in one commit; isolate the near change so any continuity regression is easy to identify.

## Motion phase and stiffness decorrelation

This is a shader-only correction with no new attribute and no new texture fetch.

In `GrassNearMaterial.ts`, derive motion phase from existing per-instance randomness:

```glsl
float grassMotionPhase = fract(grassPhase + instanceVariation.x);
```

Use `grassMotionPhase` only for motion and stiffness:

```glsl
float grassFlutter = sin(
  dot(grassWorldRoot.xz, perpendicularWind) /
    (uGrassGustScale * 0.37) +
  uGrassTime * uGrassFlutterSpeed +
  grassMotionPhase * 6.28318530718
);

float grassStiffness = mix(
  0.76,
  1.12,
  fract(grassMotionPhase * 1.61803398875)
);
```

Do not replace `grassPhase` inside the LOD dither formula. Mid CPU draw truncation depends on reproducing that exact dither and deliberately compiles out the per-instance term. Motion phase and LOD selection must remain independent.

This change is especially important on compact mode, where the gust source is a coherent sine wave.

## Compact density A/B

Current compact density is:

```text
Base near density: 48 blades/m²
Additional ultra-near density: 48 blades/m²
Total inside ultra-near radius: 96 blades/m²
```

The broad opaque blade silhouette does not need that density on the captured phone.

Test this candidate in `public/config/world.yaml`:

```yaml
grassBladesPerSquareMeterCompact: 32
grassNearBladesPerSquareMeterCompact: 32
grassUltraNearDensityMultiplier: 1.5
```

Resulting target:

```text
Base near density: 32 blades/m²
Additional ultra-near density: 16 blades/m²
Total inside ultra-near radius: 48 blades/m²
```

Do not immediately make this the final value. Capture fixed-tier A/B results at 32, 36, 40, and current 48 blades/m².

For each density, capture:

- Standing at ground level.
- Walking forward through dense grass.
- Sideways strafe, where alignment is easiest to see.
- Third-person camera looking down at approximately 25-35 degrees.
- Fly camera at 20 m and 40 m altitude.
- Near-to-mid transition at approximately 14-34 m.

Record:

- FPS p50/p95/p99.
- GPU frame time p50/p95 when supported.
- Near submitted draw instances and triangles.
- Mid submitted blades.
- Draw calls.
- Memory estimate for resident near placement arrays.
- Screenshot contact sheet.

Pin quality tier T0 during comparisons. An adaptive tier makes density comparisons invalid.

## Compact wind follow-up

Only tune compact wind after placement and phase are corrected.

The current single sine fallback can remain, but add a second cheap nonparallel component if broad stripes are still visible:

```glsl
float primary = sin(
  dot(root, windDirection) * scaleA - time * speedA
);
float secondary = sin(
  dot(root, perpendicularWind) * scaleB + time * speedB + phase
);
float grassGustNoise = 0.5 + 0.5 * (primary * 0.72 + secondary * 0.28);
```

Requirements:

- Keep values bounded before using them as the gust envelope.
- Use the same compact formula for near, mid, and impostor layers.
- Keep scale/speed constants in `WindNoiseTexture.ts` or another shared tuning module.
- Do not add a texture fetch to compact mode unless measurement shows the arithmetic path is worse.

## Memory review

Each current near candidate stores approximately:

```text
instanceMatrix       16 floats = 64 bytes
instanceVariation     4 floats = 16 bytes
instanceCoverage      1 float  =  4 bytes
instanceBiome         1 float  =  4 bytes
------------------------------------------
                                  88 bytes
```

CPU placement data also retains sorted dither values and object/map overhead. GPU buffers mirror the active attributes.

This is acceptable for the current visual patch, but transform compression remains the largest structural memory opportunity.

### Deferred compressed-transform direction

Do not combine compression with the naturalness patch. It changes shader input layout, bounds, cache behavior, and disposal behavior at once.

A later design can replace `instanceMatrix` with packed root/orientation/scale attributes, for example:

```text
instanceRoot       vec4: local x, local y, local z, packed orientation
instanceScale      vec2: horizontal and vertical scale
instanceVariation  existing vec4
instanceCoverage   existing float
instanceBiome      normalized unsigned byte or packed field
```

This requires custom instance transform code in the shader and a separate performance plan. Acceptance must include memory snapshots and vertex-cost measurements because saving bandwidth can add shader arithmetic.

## Implementation phases

### Phase G0 - Diagnostics first

- [ ] Add explicit near resident/submitted counters.
- [ ] Rename logical blade estimate.
- [ ] Add visible-only logical estimate.
- [ ] Rename far instances to cards in the HUD.
- [ ] Add optional GPU timer.
- [ ] Update QA JSON output with the same fields.
- [ ] Preserve a temporary `blades` alias if required by existing consumers.

Acceptance:

- HUD no longer implies that 6.3 million blades are being rendered.
- Mid submitted blades equal `submittedMidVertices / 3`.
- Near submitted counts change immediately with quality tier and LOD fade.
- No rendering output changes.

### Phase G1 - Natural root distribution and clump shape

- [ ] Add validated clump tuning to world YAML/config loader.
- [ ] Vary clump radius, aspect, ellipse angle, and dominant direction by global clump hash.
- [ ] Replace raw uniform radius with configurable exponent sampling.
- [ ] Recompute lattice margin from maximum configured offset.
- [ ] Bump placement cache version.
- [ ] Add deterministic unit/verification checks.

Acceptance:

- No visible tile seams.
- Same seed produces byte-stable placement arrays.
- Different tiles do not repeat one obvious circular tuft shape.
- Build slice peak does not regress by more than 10% on the same fixture.

### Phase G2 - Direction blending

- [ ] Replace radial angle plus fixed spread with dominant/radial/independent vector blending.
- [ ] Keep the implementation allocation-free inside the sampling loop.
- [ ] Verify bounds and slope alignment.

Acceptance:

- Starburst alignment is no longer visible from the captured camera angle.
- Tufts retain local coherence rather than becoming white noise.
- Draw calls and buffer sizes are unchanged.

### Phase G3 - Motion decorrelation

- [ ] Derive `grassMotionPhase` from `grassPhase + instanceVariation.x`.
- [ ] Use it for flutter and stiffness only.
- [ ] Keep LOD dither formulas byte-identical.
- [ ] Apply the same logic to every material path using the shared wind block.

Acceptance:

- Compact grass no longer bends in obvious synchronized rows.
- `npm run test:lod` and `npm run test:lod-color` remain unchanged.
- Mid CPU trim verification still passes.

### Phase G4 - Independent plane and lean

- [ ] Make near source blade straight.
- [ ] Build separate facing and lean rotations in the instance transform.
- [ ] Verify terrain-normal composition.
- [ ] Verify near-to-mid silhouette continuity.

Acceptance:

- Blade planes no longer reveal one repeated orientation/lean pairing.
- Root positions do not move.
- Culling bounds remain conservative.
- No new per-instance attribute is introduced.

### Phase G5 - Compact density decision

- [ ] Capture 32/36/40/48 blades/m² at pinned T0.
- [ ] Compare 1.5 and 2.0 ultra-near multipliers.
- [ ] Select the lowest density that does not expose ground holes at normal third-person distance.
- [ ] Commit the selected compact-only values.

Acceptance:

- Ground-level coverage remains visually continuous.
- Submitted near and mid work decreases materially.
- No change to desktop density unless separately reviewed.

### Phase G6 - Optional compact wind refinement

- [ ] Add a second arithmetic wave only if stripes remain after G1-G5.
- [ ] Share the formula across all LOD representations.
- [ ] Measure compact GPU time before and after.

## Verification changes

Extend `scripts/verify-grass-performance.mjs` with source-level invariants:

- New diagnostics fields exist and old ambiguous HUD wording is absent.
- Compact density stays within the approved maximum.
- Clump radius/weight config validation is present.
- Placement cache key contains the placement version.
- Motion phase does not alter the LOD dither expression.
- No new per-frame allocations are introduced in the placement loop.

Add deterministic placement verification, either in the existing script or a focused new script:

```text
scripts/verify-grass-placement.mjs
```

It should validate:

- Same seed/tile/config produces identical transform buffers.
- Adjacent tiles use consistent global clump parameters.
- Root offsets stay inside the configured maximum ellipse.
- Radius histogram no longer matches the old severe centre concentration.
- Direction histogram contains both local coherence and broad world-space variation.
- Bounds contain every generated root plus configured blade displacement.

Run for every implementation phase:

```bash
npm run test:lod
npm run test:lod-color
npm run test:grass-performance
npm run build
```

If a new placement script is added, wire it into `npm run build` so it cannot drift.

## Visual acceptance checklist

Review at native compact pixel ratio and at desktop resolution:

- [ ] No regular rows or repeated starburst clumps.
- [ ] No circular cookie-cutter tuft boundary repeated across tiles.
- [ ] Bare ground appears in irregular, plausible gaps.
- [ ] Blade headings have local coherence without global alignment.
- [ ] Compact gust motion does not form obvious synchronized stripes.
- [ ] Near/detail/mid handoffs do not blink or change colour.
- [ ] Density reduction does not expose square tile boundaries.
- [ ] Character trail interaction still bends all reachable near layers.
- [ ] Terrain slopes do not make blades lean into the ground.

## Performance acceptance checklist

Use a fixed camera route and pinned quality tier:

- [ ] Compact p95 frame time does not regress after naturalness changes.
- [ ] Grass CPU update remains below 0.5 ms p95 while idle on the reference phone.
- [ ] Incremental near tile build peak stays below the current practical ceiling or improves.
- [ ] Draw calls do not increase for G1-G5.
- [ ] Per-instance bytes do not increase for G1-G5.
- [ ] Density selection reduces submitted near/mid work by a measured amount.
- [ ] No query-based GPU timer causes stalls when enabled.

## Recommended commit sequence

Keep commits independently revertible:

1. `docs/diagnostics`: explicit grass workload counters and GPU timer.
2. `feat/grass-placement`: ellipse/radius clump variation.
3. `feat/grass-direction`: non-radial direction blending.
4. `fix/grass-motion`: per-instance motion phase.
5. `feat/grass-shape`: independent facing and lean transform.
6. `perf/compact-grass-density`: selected compact density values.
7. `perf/compact-grass-wind`: optional second compact wave.

Do not combine diagnostics, appearance changes, density changes, and transform compression in one commit. A visual regression must be attributable to one mechanism.

## Final recommendation

The current field does not need more blades. It needs less repeated structure and more honest measurement.

The highest-value implementation is:

1. Expose real submissions in the HUD.
2. Replace centre-heavy circular roots with deterministic elliptical clumps.
3. Blend clump-wide, radial, and independent directions instead of forcing radial fans.
4. Derive motion phase from existing instance randomness.
5. Reduce compact density after a fixed-tier A/B.

These changes improve naturalness while preserving the current draw-call architecture and avoiding additional per-instance memory.