# Procedural Stylized Stones — Phase 1 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Target branch: `main`
- Phase: 1 — deterministic core geometry
- Document authority: implementation contract
- Current state: completed
- Scope owner: procedural stone core only

This document removes implementation choices from Phase 1. The implementer should follow the file layout, APIs, algorithms, configuration values, validation rules, test matrix, and completion criteria below. Do not substitute a different geometry strategy unless this document is changed first.

## Phase objective

Implement a deterministic, configuration-driven, low-poly convex stone generator that produces clean, grounded geometry with broad readable faces.

Phase 1 must deliver the reusable geometry foundation for later archetypes, semantic regions, materials, LODs, placement, and runtime batching. It must not attempt to finish those later phases.

The generated stone must already look intentionally shaped when rendered with a plain neutral material. It must not look like a noise-displaced sphere.

## Frozen architectural decisions

The following decisions are final for Phase 1:

1. The core shape is produced by intersecting a bounded convex polyhedron with ordered half-spaces.
2. The implementation uses a small custom convex half-space clipper.
3. The implementation does not add a general-purpose CSG dependency.
4. The implementation does not use vertex noise as the primary shape mechanism.
5. The implementation does not use marching cubes, voxel extraction, SDF meshing, or runtime remeshing.
6. The mathematical core remains independent of Three.js.
7. A separate adapter converts validated core mesh data into `THREE.BufferGeometry`.
8. All random decisions are resolved into an immutable, serializable recipe before geometry construction.
9. Random substreams are domain-separated by name so adding a random call in one area does not change unrelated recipe fields.
10. Geometry generation is Y-up and right-handed.
11. The final ground-contact plane is exactly `y = 0` within the configured snap tolerance.
12. The stone origin is the centroid of the final ground-contact polygon projected onto XZ.
13. The final core mesh is closed, convex, manifold, connected, and consistently outward-wound.
14. The default rendered normal mode is selective smoothing with structural hard-edge rules.
15. Configuration is stored in strict flat YAML and parsed through the existing `FlatConfig` utility.
16. Phase 1 is not connected to world placement or rendering systems.
17. No background worker, cache, instancing system, LOD system, material system, or debug UI is introduced in this phase.
18. No logging occurs inside core geometry code. Failures are reported through typed errors and structured validation results.
19. The verification suite runs through Vite SSR using the existing Vite dependency. Do not add a test framework solely for this phase.
20. Existing grass random utilities remain unchanged. Do not move or refactor `src/grass/internal/SeededRandom.ts` during Phase 1.

## In scope

Phase 1 includes:

- Strict stone core configuration.
- A deterministic stone-specific random source.
- A versioned common stone recipe.
- Recipe resolution from a 32-bit seed.
- Convex half-space clipping.
- Controlled scale, taper, lean, skew, asymmetry, top bevel, contact bevel, and broad cuts.
- Ground-contact normalization.
- Polygon cleanup.
- Deterministic triangulation.
- Flat, weighted, and selective normals.
- Conversion to `THREE.BufferGeometry`.
- Geometry metrics and validation.
- Bounded deterministic retries.
- Determinism, validity, diversity, and configuration tests.
- A build gate for the stone core verifier.

## Explicitly out of scope

Do not implement any of the following in Phase 1:

- Named stone archetypes such as slab, shard, monolith, or cluster.
- Archetype selection or biome weighting.
- Surface cracks, grooves, recesses, attached fragments, or secondary masses.
- Vertex colours, UVs, texture coordinates, material masks, palettes, or shaders.
- LOD generation or simplification.
- Impostors.
- Terrain placement, terrain-normal alignment, embedding, streaming, or floating-origin integration.
- Runtime asset caching or instancing.
- Collision meshes.
- Editor controls or a stone bench.
- Export to glTF or other asset formats.
- Concave shapes.
- Automatic fallback assets after all retries fail. Phase 1 throws a structured error after the retry limit; deterministic fallbacks belong to Phase 5.
- Performance gates based on wall-clock time. Phase 1 records timings but gates only deterministic algorithmic budgets.

## Required file layout

Create exactly these files:

```text
public/config/stones.yaml

src/stones/config/StoneConfig.ts
src/stones/config/StoneConfigLoader.ts

src/stones/core/StoneCoreTypes.ts
src/stones/core/StoneErrors.ts
src/stones/core/StoneMath.ts
src/stones/core/StoneRandom.ts
src/stones/core/StoneRecipeResolver.ts
src/stones/core/StonePlaneBuilder.ts
src/stones/core/StoneHalfSpaceClipper.ts
src/stones/core/StoneMeshCleanup.ts
src/stones/core/StoneTriangulator.ts
src/stones/core/StoneNormalBuilder.ts
src/stones/core/StoneGeometryMetrics.ts
src/stones/core/StoneGeometryValidator.ts
src/stones/core/StoneGeometryFingerprint.ts
src/stones/core/StoneBufferGeometryAdapter.ts
src/stones/core/StoneCoreGenerator.ts
src/stones/core/index.ts

src/stones/qa/StoneCoreVerification.ts
scripts/verify-stone-core.mjs
```

Do not create a single large `StoneGenerator.ts` containing all responsibilities.

## Package script changes

Update `package.json` as follows:

1. Add this script:

```json
"test:stone-core": "node scripts/verify-stone-core.mjs"
```

2. Run the verifier during production build immediately after `tsc` and before the grass verification scripts:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add a new dependency for testing.

## Coordinate, numeric, and topology conventions

### Coordinate system

- X: local width axis.
- Y: vertical axis.
- Z: local depth axis.
- Ground plane: `y = 0`.
- Normalized construction height: `0 <= y <= 1` before final scale.
- Final dimensions are expressed in metres.
- The local origin after final normalization is `(0, 0, 0)` at the ground-contact centroid.

### Plane convention

Use this exact plane representation:

```ts
export interface StonePlane {
  readonly normal: StoneVec3;
  readonly constant: number;
  readonly id: string;
  readonly role: StonePlaneRole;
}
```

A point is inside a half-space when:

```text
dot(plane.normal, point) <= plane.constant
```

Every stored plane normal must be unit length within validation tolerance.

### Winding

- Polygon vertices are ordered counter-clockwise when viewed from outside the stone.
- Triangle vertices follow the same rule.
- Signed volume must be positive.
- Do not silently reverse the completed mesh inside validation. Incorrect winding is a generation failure.

### Core mesh representation

The mathematical core must not use `THREE.Vector2`, `THREE.Vector3`, or `THREE.Plane`.

Use these plain types:

```ts
export interface StoneVec2 {
  readonly x: number;
  readonly y: number;
}

export interface StoneVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type StonePlaneRole =
  | "seed-bound"
  | "bottom"
  | "top"
  | "side"
  | "contact-bevel"
  | "top-bevel"
  | "cut";

export interface StonePolygon {
  readonly planeId: string;
  readonly planeRole: StonePlaneRole;
  readonly vertices: readonly StoneVec3[];
}

export interface StonePolyhedron {
  readonly polygons: readonly StonePolygon[];
}

export interface StoneSharedMeshData {
  readonly positions: Float64Array;
  readonly faces: readonly StoneMeshFace[];
}

export interface StoneMeshFace {
  readonly planeId: string;
  readonly planeRole: StonePlaneRole;
  readonly indices: readonly number[];
}

export interface StoneRenderMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}
```

Use `Float64` arithmetic through clipping, cleanup, metrics, and validation. Convert to `Float32Array` only in the final render-mesh conversion.

## Configuration contract

### `public/config/stones.yaml`

Create this file with exactly these initial values and comments:

```yaml
# Procedural stone core recipe
stoneRecipeVersion: 1
stoneMaximumGenerationAttempts: 4
stoneSidePlaneCount: 8
stoneSeedBoundExtent: 2

# Final dimensions in metres
stoneWidthMin: 0.85
stoneWidthMax: 1.35
stoneDepthRatioMin: 0.76
stoneDepthRatioMax: 1.16
stoneHeightRatioMin: 0.68
stoneHeightRatioMax: 1.18
stoneDimensionMin: 0.45
stoneDimensionMax: 1.6

# Normalized primary profile
stoneBaseRadius: 0.5
stoneSideAngleJitterRadians: 0.1
stoneSideRadiusVariationMin: 0.04
stoneSideRadiusVariationMax: 0.14
stoneTaperMin: 0.06
stoneTaperMax: 0.18
stoneTopBevelHeightMin: 0.18
stoneTopBevelHeightMax: 0.34
stoneTopScaleMin: 0.58
stoneTopScaleMax: 0.82
stoneTopTiltMax: 0.08
stoneContactInsetMin: 0.05
stoneContactInsetMax: 0.12
stoneContactBevelHeightMin: 0.08
stoneContactBevelHeightMax: 0.18
stoneLeanMax: 0.16
stoneSkewMax: 0.08

# Broad clipping cuts
stoneCutCountMin: 1
stoneCutCountMax: 3
stoneCutDepthMin: 0.04
stoneCutDepthMax: 0.12
stoneCutNormalYMin: 0.15
stoneCutNormalYMax: 0.72
stoneCutGroundClearance: 0.002
stoneCutMinimumEffectiveDepth: 0.012

# Cleanup and triangulation
stonePlaneEpsilon: 0.000001
stoneVertexMergeEpsilon: 0.00001
stoneGroundSnapEpsilon: 0.00002
stoneCollinearEpsilon: 0.00001
stoneMinimumEdgeLength: 0.0015
stoneMinimumPolygonArea: 0.00002
stoneMinimumTriangleArea: 0.00001

# Validation budgets
stoneMinimumVolume: 0.025
stoneMinimumContactArea: 0.015
stoneMinimumContactRatio: 0.12
stoneMaximumVertexCount: 128
stoneMaximumPolygonCount: 48
stoneMaximumTriangleCount: 192
stoneConvexityTolerance: 0.00005
stoneNormalLengthTolerance: 0.0005
stoneSelectiveCreaseAngleDegrees: 50
stoneFingerprintQuantization: 0.000001
```

### Configuration types

`src/stones/config/StoneConfig.ts` must define these immutable groups:

```ts
export interface StoneRecipeConfig {
  readonly version: number;
  readonly maximumGenerationAttempts: number;
  readonly sidePlaneCount: number;
  readonly seedBoundExtent: number;
  readonly widthMin: number;
  readonly widthMax: number;
  readonly depthRatioMin: number;
  readonly depthRatioMax: number;
  readonly heightRatioMin: number;
  readonly heightRatioMax: number;
  readonly dimensionMin: number;
  readonly dimensionMax: number;
  readonly baseRadius: number;
  readonly sideAngleJitterRadians: number;
  readonly sideRadiusVariationMin: number;
  readonly sideRadiusVariationMax: number;
  readonly taperMin: number;
  readonly taperMax: number;
  readonly topBevelHeightMin: number;
  readonly topBevelHeightMax: number;
  readonly topScaleMin: number;
  readonly topScaleMax: number;
  readonly topTiltMax: number;
  readonly contactInsetMin: number;
  readonly contactInsetMax: number;
  readonly contactBevelHeightMin: number;
  readonly contactBevelHeightMax: number;
  readonly leanMax: number;
  readonly skewMax: number;
  readonly cutCountMin: number;
  readonly cutCountMax: number;
  readonly cutDepthMin: number;
  readonly cutDepthMax: number;
  readonly cutNormalYMin: number;
  readonly cutNormalYMax: number;
  readonly cutGroundClearance: number;
  readonly cutMinimumEffectiveDepth: number;
}

export interface StoneCleanupConfig {
  readonly planeEpsilon: number;
  readonly vertexMergeEpsilon: number;
  readonly groundSnapEpsilon: number;
  readonly collinearEpsilon: number;
  readonly minimumEdgeLength: number;
  readonly minimumPolygonArea: number;
  readonly minimumTriangleArea: number;
}

export interface StoneValidationConfig {
  readonly minimumVolume: number;
  readonly minimumContactArea: number;
  readonly minimumContactRatio: number;
  readonly maximumVertexCount: number;
  readonly maximumPolygonCount: number;
  readonly maximumTriangleCount: number;
  readonly convexityTolerance: number;
  readonly normalLengthTolerance: number;
  readonly selectiveCreaseAngleDegrees: number;
  readonly fingerprintQuantization: number;
}

export interface StoneConfig {
  readonly recipe: Readonly<StoneRecipeConfig>;
  readonly cleanup: Readonly<StoneCleanupConfig>;
  readonly validation: Readonly<StoneValidationConfig>;
}
```

### Configuration loader

`StoneConfigLoader` must:

- Use `FlatConfig.parse(source, "stones")`.
- Expose `load(url = "./config/stones.yaml")`.
- Expose `parse(source: string)` publicly for verification.
- Consume every key exactly once.
- Call `values.assertFullyConsumed()`.
- Return a recursively frozen configuration object.
- Reject non-finite numbers.
- Reject non-integer integer fields.
- Reject missing, duplicate, and unknown keys through `FlatConfig`.

Apply these cross-field validations exactly:

1. `version === 1`.
2. `maximumGenerationAttempts` is an integer from 1 through 16.
3. `sidePlaneCount` is an integer from 6 through 12.
4. `seedBoundExtent >= 1.5`.
5. Every `Min` value is less than or equal to its paired `Max` value.
6. `dimensionMin > 0` and `dimensionMax <= 100`.
7. `widthMin` and `widthMax` are inside the dimension range.
8. Depth and height ratios are positive.
9. `baseRadius` is from 0.25 through 1.
10. `sideAngleJitterRadians` is non-negative and less than half the regular side-plane angular spacing.
11. Side radius variations are from 0 through 0.3.
12. `taperMin >= 0`.
13. `baseRadius * (1 - sideRadiusVariationMax) - taperMax >= 0.16`.
14. Top bevel heights are greater than 0 and less than 0.5.
15. Top scales are greater than 0.35 and less than or equal to 1.
16. Contact insets are non-negative and less than `baseRadius * 0.5`.
17. Contact bevel heights are greater than 0 and less than 0.4.
18. Lean and skew maxima are each from 0 through 0.3.
19. Cut counts are integers, with `0 <= min <= max <= 6`.
20. Cut depths are greater than 0 and less than 0.25.
21. Cut normal Y bounds satisfy `0 <= min <= max < 1`.
22. `cutGroundClearance >= planeEpsilon`.
23. `cutMinimumEffectiveDepth > 0` and is less than or equal to `cutDepthMax`.
24. Every epsilon is positive.
25. `vertexMergeEpsilon > planeEpsilon`.
26. `groundSnapEpsilon >= vertexMergeEpsilon`.
27. `minimumEdgeLength > vertexMergeEpsilon`.
28. Polygon and triangle minimum areas are positive.
29. Validation count budgets are positive integers.
30. `maximumPolygonCount >= sidePlaneCount + 2`.
31. `maximumTriangleCount >= maximumPolygonCount`.
32. `minimumContactRatio` is greater than 0 and less than 1.
33. Selective crease angle is from 1 through 179 degrees.
34. Fingerprint quantization is positive and not smaller than `planeEpsilon`.

Error messages must identify the invalid key or cross-field relationship.

## Stone-specific deterministic random source

### Public API

`src/stones/core/StoneRandom.ts` must export:

```ts
export class StoneRandom {
  constructor(seed: number);

  nextUint32(): number;
  nextFloat(): number;
  range(minimum: number, maximum: number): number;
  integer(minimumInclusive: number, maximumInclusive: number): number;
  signed(magnitude: number): number;
  chance(probability: number): boolean;
  fork(label: string): StoneRandom;
}

export function normalizeStoneSeed(seed: number): number;
export function hashStoneLabel(label: string): number;
export function mixStoneUint32(value: number): number;
```

### Seed rules

- Public seeds must be finite integers from `0` through `4294967295`.
- Invalid seeds throw `RangeError`.
- Do not silently truncate fractions.
- `0` is a valid seed.

### Hash and PRNG algorithms

Use these exact constants and operations.

```ts
const STONE_RANDOM_DOMAIN = 0x53544f4e;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
```

`hashStoneLabel` must calculate UTF-8 FNV-1a. Use `TextEncoder` so non-ASCII labels have an explicit byte representation.

`mixStoneUint32` must use:

```ts
let mixed = value >>> 0;
mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
return (mixed ^ (mixed >>> 16)) >>> 0;
```

The constructor initializes the internal root seed and state with:

```ts
const normalized = normalizeStoneSeed(seed);
const initialized = mixStoneUint32(normalized ^ STONE_RANDOM_DOMAIN);
```

`nextUint32` uses the existing Mulberry32 arithmetic pattern:

```ts
this.state = (this.state + MULBERRY_INCREMENT) >>> 0;
let value = this.state;
value = Math.imul(value ^ (value >>> 15), value | 1);
value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
return (value ^ (value >>> 14)) >>> 0;
```

`nextFloat` returns `nextUint32() / 4294967296`.

`fork(label)` must depend on the immutable root seed, not the current stream state:

```ts
const childSeed = mixStoneUint32(
  this.rootSeed ^ hashStoneLabel(label) ^ STONE_RANDOM_DOMAIN,
);
return StoneRandom.fromInitializedSeed(childSeed);
```

The internal initialized-seed constructor must remain private.

### Required golden random vectors

The verification suite must assert these first five `nextUint32()` values:

| Seed | Expected values |
| --- | --- |
| `0` | `0x6b4e98b6`, `0xd321bab1`, `0xe920a785`, `0xcfca6851`, `0xa81c461e` |
| `1` | `0x1755fa8b`, `0x9867cd8d`, `0xc05d7eb0`, `0x283b2c09`, `0x8daefff9` |
| `0xdeadbeef` | `0xd407663f`, `0xe0348cfb`, `0x61ae8c36`, `0xfb8b947e`, `0xe4ec471f` |

The label hash verification must assert:

| Label | FNV-1a hash |
| --- | --- |
| `dimensions` | `0xc6f8c0b0` |
| `profile` | `0x4674caee` |
| `cuts` | `0x79a9ec10` |
| `attempt:0` | `0x2b491da4` |
| `attempt:1` | `0x2c491f37` |

## Recipe contract

### Recipe types

Add these types to `StoneCoreTypes.ts`:

```ts
export type StoneNormalMode = "flat" | "weighted" | "selective";

export interface StoneDimensionsRecipe {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface StoneProfileRecipe {
  readonly angleOffsetRadians: number;
  readonly sideAnglesRadians: readonly number[];
  readonly sideRadii: readonly number[];
  readonly taper: number;
  readonly topBevelHeight: number;
  readonly topScale: number;
  readonly topTiltX: number;
  readonly topTiltZ: number;
  readonly contactInset: number;
  readonly contactBevelHeight: number;
  readonly leanX: number;
  readonly leanZ: number;
  readonly skewXZ: number;
  readonly skewZX: number;
}

export interface StoneCutRecipe {
  readonly id: string;
  readonly normal: StoneVec3;
  readonly depthFraction: number;
}

export interface StoneRecipe {
  readonly version: 1;
  readonly seed: number;
  readonly attempt: number;
  readonly dimensions: Readonly<StoneDimensionsRecipe>;
  readonly profile: Readonly<StoneProfileRecipe>;
  readonly cuts: readonly Readonly<StoneCutRecipe>[];
  readonly normalMode: StoneNormalMode;
  readonly selectiveCreaseAngleDegrees: number;
}
```

The recipe must contain only plain serializable values. Do not place class instances, typed arrays, Three.js values, functions, maps, or sets in it.

Deep-freeze every resolved recipe and its arrays before returning it.

### Attempt seed

`StoneRecipeResolver.resolve(seed, attempt)` must create the attempt stream with:

```ts
const attemptRandom = new StoneRandom(seed).fork(`attempt:${attempt}`);
```

Then create named child streams from that attempt stream:

```text
dimensions
profile
side-angles
side-radii
lean
skew
cuts
cut:0
cut:1
cut:2
...
```

Do not consume one shared sequential stream for unrelated fields.

### Dimension resolution

Use the following exact sequence and formulas:

```ts
const width = dimensionsRandom.range(config.widthMin, config.widthMax);
const depthRatio = dimensionsRandom.range(
  config.depthRatioMin,
  config.depthRatioMax,
);
const heightRatio = dimensionsRandom.range(
  config.heightRatioMin,
  config.heightRatioMax,
);

const depth = clamp(
  width * depthRatio,
  config.dimensionMin,
  config.dimensionMax,
);
const height = clamp(
  Math.sqrt(width * depth) * heightRatio,
  config.dimensionMin,
  config.dimensionMax,
);
```

Store width, height, and depth without rounding.

### Side angles

For `N = sidePlaneCount`:

1. Resolve `angleOffsetRadians` uniformly from `0` through `2π / N`.
2. For each side index `i`, calculate the regular angle `angleOffset + i * 2π / N`.
3. Add independent jitter in `[-sideAngleJitterRadians, +sideAngleJitterRadians]`.
4. Wrap every angle into `[0, 2π)`.
5. Sort angles ascending.
6. Verify every cyclic angular gap is at least `0.35 * 2π / N`.
7. If the gap check fails, retry only the angle jitter using child streams `side-angles:retry:1` through `side-angles:retry:3`.
8. If all angle jitter retries fail, use the regular unjittered angles with the resolved angle offset.

### Side radii

1. Resolve one variation amplitude uniformly between the configured variation minimum and maximum.
2. For each side, create:

```ts
rawRadius[i] = baseRadius * (1 + random.signed(variationAmplitude));
```

3. Apply one cyclic smoothing pass:

```ts
smoothed[i] =
  rawRadius[previous] * 0.25 +
  rawRadius[i] * 0.5 +
  rawRadius[next] * 0.25;
```

4. Clamp each radius to:

```text
baseRadius * (1 - sideRadiusVariationMax)
baseRadius * (1 + sideRadiusVariationMax)
```

5. Store radii in the same sorted order as side angles.

### Profile values

Resolve profile fields with these rules:

- `taper`: uniform configured range.
- `topBevelHeight`: uniform configured range.
- `topScale`: uniform configured range.
- `topTiltX`: signed configured maximum.
- `topTiltZ`: signed configured maximum.
- `contactInset`: uniform configured range.
- `contactBevelHeight`: uniform configured range.

Lean:

```ts
const leanAngle = leanRandom.range(0, Math.PI * 2);
const leanStrength =
  Math.pow(leanRandom.nextFloat(), 1.5) * config.leanMax;
const leanX = Math.cos(leanAngle) * leanStrength;
const leanZ = Math.sin(leanAngle) * leanStrength;
```

Skew:

```ts
const skewXZ = skewRandom.signed(config.skewMax);
const skewZX = skewRandom.signed(config.skewMax);
```

Reject the recipe before geometry generation when:

```text
1 - skewXZ * skewZX <= 0.5
```

This determinant guard prevents an unstable horizontal transform.

### Cuts

Resolve an inclusive integer cut count from the configured minimum and maximum.

For each cut index:

1. Use child stream `cut:<index>`.
2. Resolve `normalY` uniformly in the configured range.
3. Resolve azimuth uniformly from `0` through `2π`.
4. Calculate horizontal magnitude as `sqrt(1 - normalY²)`.
5. Construct the unit normal:

```ts
{
  x: Math.cos(azimuth) * horizontalMagnitude,
  y: normalY,
  z: Math.sin(azimuth) * horizontalMagnitude,
}
```

6. Resolve `depthFraction` uniformly in the configured range.
7. Set ID to `cut:<index>`.

No two cut normals may have a dot product greater than `0.96`. When a new cut violates this rule, rotate its azimuth by exactly the golden angle `2.399963229728653` radians and recompute the normal. Repeat at most three times. If all three remain too similar, omit that cut. Do not increase the requested count to replace an omitted cut.

### Normal mode

Every Phase 1 resolved recipe uses:

```ts
normalMode: "selective"
selectiveCreaseAngleDegrees: config.validation.selectiveCreaseAngleDegrees
```

Flat and weighted modes are supported by `generateFromRecipe` and tests, but are not randomly selected.

## Plane construction

`StonePlaneBuilder` converts a recipe into an ordered list of normalized-space clipping planes.

### Seed bounding polyhedron

Start with one axis-aligned box:

```text
x: [-seedBoundExtent, +seedBoundExtent]
y: [-0.5, 1.5]
z: [-seedBoundExtent, +seedBoundExtent]
```

Represent it as six outward-wound polygons with `seed-bound` role. The box exists only to provide a finite starting polyhedron.

### Plane order

Apply planes in exactly this order:

1. Bottom plane.
2. Top plane.
3. Side planes in side-index order.
4. Contact-bevel planes in side-index order.
5. Top-bevel planes in side-index order.
6. Cut planes in recipe order.

Do not sort planes after construction.

### Bottom plane

```text
normal = (0, -1, 0)
constant = 0
id = bottom
role = bottom
```

This keeps `y >= 0`.

### Top plane

Use the resolved tilt directly:

```text
normal before normalization = (topTiltX, 1, topTiltZ)
constant before normalization = 1
id = top
role = top
```

Normalize both normal and constant by the same normal length.

### Side planes

For each side angle `a`, radius `r`, and taper `t`:

```text
normal before normalization = (cos(a), t, sin(a))
constant before normalization = r
id = side:<index>
role = side
```

Normalize normal and constant together.

The unnormalized equation is:

```text
cos(a) * x + sin(a) * z + taper * y <= radius
```

This makes the upper profile narrower than the base profile.

### Contact-bevel planes

For each side:

```ts
const slope = contactInset / contactBevelHeight;
```

Use:

```text
normal before normalization = (cos(a), -slope, sin(a))
constant before normalization = radius - contactInset
id = contact-bevel:<index>
role = contact-bevel
```

At `y = 0`, this creates an inset contact footprint. At the configured contact-bevel height, the regular side plane becomes the limiting plane.

### Top-bevel planes

For each side:

```ts
const bevelStartY = 1 - topBevelHeight;
const radiusAtBevelStart = radius - taper * bevelStartY;
const radiusAtTop = (radius - taper) * topScale;
const slope =
  (radiusAtBevelStart - radiusAtTop) / topBevelHeight;
const constant = radiusAtBevelStart + slope * bevelStartY;
```

Use:

```text
normal before normalization = (cos(a), slope, sin(a))
constant before normalization = constant
id = top-bevel:<index>
role = top-bevel
```

Normalize normal and constant together.

Before returning the plane, assert:

- `radiusAtBevelStart > 0`.
- `radiusAtTop >= 0.12`.
- `slope >= taper`.

A failure is a recipe-build validation issue and causes the current generation attempt to fail.

### Cut planes

Cuts are resolved sequentially because each cut depth is measured against the polyhedron produced by previous planes.

For each cut recipe:

1. Calculate `minimumProjection` and `maximumProjection` across all current vertices.
2. Calculate candidate constant:

```ts
const span = maximumProjection - minimumProjection;
const candidate = maximumProjection - depthFraction * span;
```

3. Collect all current vertices with `abs(y) <= groundSnapEpsilon`.
4. Calculate maximum ground projection.
5. Guard the contact area:

```ts
const guardedConstant = Math.max(
  candidate,
  maximumGroundProjection + cutGroundClearance,
);
```

6. Calculate effective depth:

```ts
const effectiveDepth =
  (maximumProjection - guardedConstant) / Math.max(span, planeEpsilon);
```

7. If effective depth is smaller than `cutMinimumEffectiveDepth`, skip the cut without error.
8. Otherwise apply a normalized plane using the guarded constant, recipe ID, and `cut` role.

The output metrics must record requested and applied cut counts separately.

## Half-space clipping algorithm

### Required algorithm

Use Sutherland-Hodgman polygon clipping for each existing polygon and construct one cap polygon from all edge intersections.

For a point `p` and clipping plane:

```ts
const distance = dot(plane.normal, p) - plane.constant;
const inside = distance <= planeEpsilon;
```

For an edge from `a` to `b`, when one endpoint is inside and the other is outside, calculate:

```ts
const denominator = distanceA - distanceB;
const t = clamp(distanceA / denominator, 0, 1);
const intersection = a + (b - a) * t;
```

If `abs(denominator) <= planeEpsilon`, do not calculate an intersection. Retain only an inside endpoint according to normal polygon-clipping rules.

### Per-polygon cleanup during clipping

After clipping each polygon:

1. Remove adjacent duplicate vertices using `vertexMergeEpsilon`.
2. Remove a duplicated closing vertex when first and last are within the merge epsilon.
3. Remove collinear vertices using the configured collinear epsilon.
4. Discard polygons with fewer than three vertices.
5. Preserve the original polygon plane ID and role.

Never discard a small but valid polygon solely because of area during clipping. Minimum-area validation occurs after the complete polyhedron is built so an invalid closed surface triggers a retry rather than creating a hole.

### Cap point collection

- Collect every generated edge intersection from all clipped polygons.
- Deduplicate cap points in 3D using the vertex merge epsilon.
- If fewer than three unique cap points exist, the clipping plane did not create a face. Return the clipped existing polygons without a cap.
- If all existing polygons were removed, throw `StoneGenerationError` with code `EMPTY_POLYHEDRON`.

### Cap ordering

1. Calculate cap centroid as the arithmetic mean of cap points.
2. Select the world axis least parallel to the plane normal by choosing the axis with the smallest absolute normal component.
3. Calculate:

```ts
const tangent = normalize(cross(referenceAxis, plane.normal));
const bitangent = cross(plane.normal, tangent);
```

4. Sort cap points by:

```ts
atan2(
  dot(point - centroid, bitangent),
  dot(point - centroid, tangent),
)
```

5. Break equal-angle ties by squared distance from centroid, then lexicographic X, Y, Z order.
6. Run adjacent duplicate and collinear cleanup again.
7. Confirm the Newell polygon normal has a positive dot product with the clipping-plane normal. Reverse the cap order if necessary.
8. Add the cap with the clipping plane ID and role.

### Convexity guarantee

The clipper only intersects convex half-spaces starting from a convex box. Do not add a generic self-intersection repair path. A self-intersection indicates a bug and must fail verification.

## Final affine shape transform

After all normalized clipping is complete, transform every vertex using the original unmodified normalized coordinates:

```ts
const transformedX =
  recipe.dimensions.width *
  (x + recipe.profile.leanX * y + recipe.profile.skewXZ * z);

const transformedY = recipe.dimensions.height * y;

const transformedZ =
  recipe.dimensions.depth *
  (z + recipe.profile.leanZ * y + recipe.profile.skewZX * x);
```

Do not feed transformed X into the Z formula or transformed Z into the X formula.

This transform preserves the bottom plane because lean is multiplied by Y.

## Ground-contact normalization

After the affine transform:

1. Snap every vertex with `abs(y) <= groundSnapEpsilon` to exactly `0`.
2. Fail validation if any vertex has `y < -groundSnapEpsilon`.
3. Collect all unique bottom vertices with `y === 0`.
4. Build their 2D XZ convex hull using the monotonic-chain algorithm.
5. Require at least three hull points.
6. Calculate the area-weighted polygon centroid in XZ.
7. Subtract that centroid X and Z from every vertex.
8. Snap bottom vertices to `y = 0` again.
9. Do not recenter vertically.

The resulting local origin must remain stable regardless of top cuts or lean.

## Mesh cleanup

`StoneMeshCleanup` converts polygon vertex data into a shared indexed polygon mesh.

### Global vertex merge

Use deterministic epsilon quantization:

```ts
const qx = Math.round(x / vertexMergeEpsilon);
const qy = Math.round(y / vertexMergeEpsilon);
const qz = Math.round(z / vertexMergeEpsilon);
const key = `${qx}:${qy}:${qz}`;
```

Process polygons in existing order and vertices in polygon order. The first vertex encountered for a key becomes the shared vertex.

After merging:

- Remove adjacent duplicate indices from each face.
- Remove a repeated closing index.
- Remove collinear face vertices by examining the shared positions.
- Reject faces with fewer than three indices.
- Do not merge polygons with different plane IDs.
- Do not merge coplanar neighbouring polygons. The half-space construction already produces one polygon per active plane.

### Face normal

Calculate each polygon normal with Newell's method in Float64 arithmetic and normalize it.

Confirm the normal points outward by comparing it with the source plane normal before the affine transform only where that comparison remains valid. After the affine transform, preserve winding and calculate the final face normal from transformed positions.

### Polygon area

Calculate polygon area by summing cross products around the polygon and projecting onto the final face normal. Reject polygon area below the configured minimum.

## Deterministic triangulation

Every face is convex.

For a face with exactly three indices, emit it unchanged.

For a face with more than three indices:

1. Evaluate every existing face vertex as a possible fan anchor.
2. For each anchor, calculate all fan triangle areas.
3. Score the anchor by its minimum triangle area.
4. Choose the anchor with the greatest minimum triangle area.
5. Break score ties within `planeEpsilon` by choosing the lowest shared vertex index.
6. Emit `vertexCount - 2` triangles in polygon order from that anchor.
7. Verify every emitted triangle normal has positive dot product with the face normal.
8. Reject any triangle below the configured minimum triangle area.

Do not add a face-centroid vertex. Do not use a generic ear-clipping library.

Choose `Uint16Array` when the rendered vertex count is at most `65535`; otherwise use `Uint32Array`. Phase 1 budgets should always produce `Uint16Array`, but the adapter must remain correct for larger future meshes.

## Normal generation

`StoneNormalBuilder` must support all three modes.

### Flat mode

- Duplicate positions per face corner.
- Use the final polygon face normal for every duplicated corner.
- Preserve triangle indices relative to the duplicated face vertices.
- A triangulation diagonal must not create a visible normal seam inside one polygon.

### Weighted mode

- Use shared geometric vertices.
- Accumulate each adjacent triangle normal weighted by triangle area multiplied by the corner angle.
- Normalize the accumulated vector.
- Reject zero-length results.

### Selective mode

Selective mode is the production default.

Create smoothing components around each shared geometric vertex.

Two adjacent face corners may share one rendered vertex only when both conditions are true:

1. Their face-normal dot product is greater than or equal to the cosine of the configured crease angle.
2. The structural hard-edge rules below do not force a split.

Structural hard-edge rules:

- `bottom` is hard against every non-bottom face.
- `top` is hard against every non-top face.
- A `cut` face is hard against every face with a different plane ID.
- Two different `cut` faces are hard against each other.
- `contact-bevel` may smooth with `side` when the crease test passes.
- `top-bevel` may smooth with `side` when the crease test passes.
- Adjacent `side` faces may smooth when the crease test passes.
- Adjacent faces with the same plane ID always share one component.

Build connected components, not pairwise one-pass groups. This avoids order-dependent smoothing.

For each component, calculate an area-angle-weighted normal from all component face corners.

Rendered vertex order must be deterministic:

1. Shared geometric vertex index ascending.
2. Component minimum face index ascending.

### Normal validation

Every final normal must:

- Contain finite values.
- Have length within `normalLengthTolerance` of `1`.
- Point generally outward. For every triangle corner, require dot product with its triangle face normal greater than `-normalLengthTolerance`.

## Geometry metrics

`StoneGeometryMetrics.ts` must calculate and return:

```ts
export interface StoneGeometryMetrics {
  readonly sharedVertexCount: number;
  readonly renderedVertexCount: number;
  readonly polygonCount: number;
  readonly triangleCount: number;
  readonly requestedCutCount: number;
  readonly appliedCutCount: number;
  readonly volume: number;
  readonly surfaceArea: number;
  readonly footprintArea: number;
  readonly contactArea: number;
  readonly contactRatio: number;
  readonly minimumEdgeLength: number;
  readonly minimumPolygonArea: number;
  readonly minimumTriangleArea: number;
  readonly bounds: Readonly<StoneBounds>;
}
```

Use these definitions:

- Volume: absolute tetrahedral signed-volume sum, while separately validating that the signed result is positive.
- Surface area: sum of final triangle areas.
- Footprint area: area of the XZ convex hull of every final shared vertex.
- Contact area: area of the bottom polygon or polygons projected to XZ. Phase 1 should have exactly one active bottom polygon.
- Contact ratio: `contactArea / footprintArea`.
- Minimum edge length: unique undirected triangle edges.
- Bounds: exact axis-aligned bounds from final positions.

Do not calculate centre-of-mass stability in Phase 1.

## Validation

### Result model

Use structured issues:

```ts
export type StoneValidationCode =
  | "NON_FINITE_VALUE"
  | "EMPTY_MESH"
  | "INVALID_INDEX"
  | "DEGENERATE_TRIANGLE"
  | "DEGENERATE_POLYGON"
  | "EDGE_TOO_SHORT"
  | "NON_MANIFOLD_EDGE"
  | "DISCONNECTED_MESH"
  | "NEGATIVE_OR_ZERO_VOLUME"
  | "VOLUME_TOO_SMALL"
  | "INVALID_GROUND_CONTACT"
  | "CONTACT_AREA_TOO_SMALL"
  | "CONTACT_RATIO_TOO_SMALL"
  | "NON_CONVEX_MESH"
  | "INVALID_NORMAL"
  | "VERTEX_BUDGET_EXCEEDED"
  | "POLYGON_BUDGET_EXCEEDED"
  | "TRIANGLE_BUDGET_EXCEEDED";

export interface StoneValidationIssue {
  readonly code: StoneValidationCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, number | string>>;
}

export interface StoneValidationResult {
  readonly valid: boolean;
  readonly issues: readonly StoneValidationIssue[];
  readonly metrics: Readonly<StoneGeometryMetrics>;
}
```

Return all detectable issues from one validation pass. Do not stop at the first failure unless continuing would access invalid indices or non-finite data.

### Required checks

Perform checks in this order:

1. Positions, normals, and numeric metadata are finite.
2. Mesh contains positions, faces, and triangles.
3. Every index is an integer inside range.
4. Every face has at least three distinct indices.
5. Every triangle has three distinct indices.
6. Polygon and triangle areas meet configured minima.
7. Every unique edge meets minimum length.
8. Every undirected triangle edge has exactly two incident triangles.
9. Triangle adjacency forms one connected component.
10. Signed volume is positive.
11. Absolute volume meets minimum volume.
12. Bounds have positive width, height, and depth.
13. Bounds minimum Y is within ground snap tolerance of zero.
14. No position is below negative ground snap tolerance.
15. Exactly one bottom-role polygon exists.
16. Bottom polygon has at least three vertices at exact `y = 0`.
17. Contact area and contact ratio meet minima.
18. Every vertex lies inside every final face plane within convexity tolerance. Reconstruct each face plane from the final face normal and first face point.
19. Normals meet length and outward checks.
20. Vertex, polygon, and triangle counts remain within budgets.

### Manifold edge identity

Use sorted geometric shared-vertex index pairs for edge keys. Triangulation diagonals occur twice inside one polygon and therefore still satisfy the closed triangle-edge incidence check.

### Connectedness

Build triangle adjacency through shared undirected edges and perform breadth-first traversal. The visited triangle count must equal total triangle count.

## Fingerprint

`StoneGeometryFingerprint` creates a deterministic shape fingerprint from the validated shared polygon mesh, independent of rendered normal mode.

Canonical payload order:

1. Recipe version.
2. Shared positions in shared-index order.
3. Face plane ID.
4. Face role.
5. Face indices in face order.

Quantize each coordinate with:

```ts
Math.round(value / fingerprintQuantization)
```

Serialize integers in signed little-endian 32-bit form and strings as UTF-8 preceded by their byte length.

Maintain two 32-bit FNV-1a accumulators:

- First offset basis: `0x811c9dc5`.
- Second offset basis: `0x9e3779b9`.

Update both with every payload byte. Return sixteen lowercase hexadecimal digits by concatenating both eight-character zero-padded hashes.

The fingerprint is diagnostic, not cryptographic.

## Three.js adapter

`StoneBufferGeometryAdapter` is the only Phase 1 core file that imports Three.js.

API:

```ts
export class StoneBufferGeometryAdapter {
  create(
    renderMesh: StoneRenderMeshData,
    metadata: StoneGeometryMetadata,
  ): THREE.BufferGeometry;
}
```

It must:

1. Create a new `THREE.BufferGeometry`.
2. Set `position` from the supplied `Float32Array`, item size 3.
3. Set `normal` from the supplied `Float32Array`, item size 3.
4. Set the supplied index typed array.
5. Call `computeBoundingBox()`.
6. Call `computeBoundingSphere()`.
7. Store only this compact metadata in `geometry.userData.stone`:

```ts
{
  recipeVersion: number;
  seed: number;
  attempt: number;
  fingerprint: string;
}
```

8. Do not call `computeVertexNormals()` because normals are already authored.
9. Do not add UV or colour attributes.
10. Do not retain references to mutable core arrays after geometry construction beyond the BufferAttributes themselves.

## Generator API and retry behaviour

### Public API

`StoneCoreGenerator.ts` must export:

```ts
export interface StoneGenerationResult {
  readonly geometry: THREE.BufferGeometry;
  readonly recipe: Readonly<StoneRecipe>;
  readonly metrics: Readonly<StoneGeometryMetrics>;
  readonly fingerprint: string;
  readonly attemptsUsed: number;
}

export class StoneCoreGenerator {
  constructor(config: Readonly<StoneConfig>);

  resolveRecipe(seed: number, attempt?: number): Readonly<StoneRecipe>;

  generate(seed: number): StoneGenerationResult;

  generateFromRecipe(
    recipe: Readonly<StoneRecipe>,
  ): StoneGenerationResult;
}
```

### `generate(seed)`

1. Validate the public seed.
2. Iterate attempts from `0` through `maximumGenerationAttempts - 1`.
3. Resolve a recipe for that exact seed and attempt.
4. Build and validate the core geometry.
5. Return immediately on the first valid result.
6. Set `attemptsUsed` to `attempt + 1`.
7. Dispose no previously returned geometry because failed attempts must fail before Three.js geometry creation.
8. Collect structured failure summaries for each failed attempt.
9. After all attempts fail, throw `StoneGenerationError` with code `RETRY_LIMIT_EXCEEDED` and all attempt summaries.

### `generateFromRecipe(recipe)`

- Validate recipe version and all finite values.
- Do not change its seed, attempt, or fields.
- Do not retry.
- Throw `StoneGenerationError` when the recipe cannot produce valid geometry.
- Return `attemptsUsed: 1`.

### `resolveRecipe(seed, attempt = 0)`

- Validate seed.
- Require attempt to be an integer from 0 through 15.
- Return the deeply frozen recipe.
- Perform no geometry construction.

## Error types

`StoneErrors.ts` must define:

```ts
export type StoneGenerationErrorCode =
  | "INVALID_RECIPE"
  | "INVALID_PLANE"
  | "EMPTY_POLYHEDRON"
  | "CONTACT_NORMALIZATION_FAILED"
  | "TRIANGULATION_FAILED"
  | "GEOMETRY_VALIDATION_FAILED"
  | "RETRY_LIMIT_EXCEEDED";

export class StoneGenerationError extends Error {
  readonly code: StoneGenerationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- Set `name = "StoneGenerationError"`.
- Preserve the original error as `cause` when wrapping an unexpected error.
- Do not expose mutable issue arrays.
- Do not log from the constructor.
- Error messages must include seed and attempt when available.

## Math utility requirements

`StoneMath.ts` must contain only reusable pure functions needed by this phase:

- `add3`
- `subtract3`
- `scale3`
- `dot3`
- `cross3`
- `length3`
- `lengthSquared3`
- `normalize3`
- `distanceSquared3`
- `lerp3`
- `clamp`
- `wrapRadians`
- `newellNormal`
- `polygonArea3`
- `polygonAreaAndCentroid2`
- `convexHull2`
- `triangleArea3`
- `triangleNormal3`
- `nearlyEqual`

Rules:

- Functions return new plain values and do not mutate inputs.
- `normalize3` throws `StoneGenerationError` for length at or below the supplied epsilon.
- Convex hull uses lexicographic X then Y sort and removes duplicate quantized points.
- Polygon centroid handles only non-degenerate polygons and throws otherwise.
- Do not introduce a generic matrix class.

## Verification architecture

### `scripts/verify-stone-core.mjs`

Use the existing Vite dependency to load TypeScript through SSR:

```js
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const verification = await server.ssrLoadModule(
    "/src/stones/qa/StoneCoreVerification.ts",
  );
  await verification.verifyStoneCore();
} finally {
  await server.close();
}
```

Wrap failures with a `[stone-core]` prefix and set `process.exitCode = 1`. Print one concise success line containing seed count, unique fingerprints, maximum attempts used, maximum vertices, and maximum triangles.

Do not write generated snapshots or temporary files into the repository.

### Verification helper style

`StoneCoreVerification.ts` must export exactly:

```ts
export async function verifyStoneCore(): Promise<void>;
```

Use local `assert` and `assertThrows` helpers. Do not add test-only methods to production classes.

## Mandatory verification matrix

### Configuration tests

Verify:

1. The committed YAML parses successfully.
2. The parsed object is frozen recursively.
3. Removing one key fails.
4. Duplicating one key fails.
5. Adding an unknown key fails.
6. Replacing a numeric value with `NaN` fails.
7. Setting `stoneSidePlaneCount` to `5` fails.
8. Setting `stoneMaximumGenerationAttempts` to `0` fails.
9. Setting merge epsilon below plane epsilon fails.
10. Setting minimum contact ratio to `1` fails.
11. Setting top scale above `1` fails.
12. Setting taper so the minimum top radius becomes invalid fails.

### Random tests

Verify:

- All golden vectors in this document.
- All golden label hashes.
- `fork` output is independent of parent stream consumption.
- Two forks with the same root and label match.
- Two different labels produce different first eight values.
- Invalid seeds `-1`, `0.5`, `NaN`, `Infinity`, and `4294967296` throw.
- `integer(min, max)` is inclusive and rejects invalid ranges.
- `chance` rejects probabilities outside `[0, 1]`.

### Recipe tests

Use seeds:

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

For every seed:

- Resolving twice returns deeply equal values.
- Returned recipe and nested arrays are frozen.
- Side angle and radius array lengths equal configured side-plane count.
- Angles are ascending and cyclic gaps satisfy the minimum.
- Every side radius remains in configured bounds.
- Every dimension remains in configured bounds.
- Every cut normal is unit length.
- Every cut depth remains in configured bounds.
- Normal mode is selective.
- Attempt `0` and attempt `1` produce different recipes.

### Single-seed geometry tests

For seed `42`:

1. Generate twice with the same generator.
2. Require identical recipe JSON.
3. Require identical fingerprints.
4. Require exact equality of shared positions after Float64 generation.
5. Require exact equality of final Float32 positions, normals, and indices.
6. Generate from the returned recipe and require exact equality again.
7. Verify bounding box minimum Y equals zero within ground snap epsilon.
8. Verify contact centroid X and Z are within ground snap epsilon of zero.
9. Verify validation returns no issues.
10. Verify `geometry.getAttribute("uv")` is undefined.
11. Verify `geometry.getAttribute("color")` is undefined.
12. Verify position and normal counts match.
13. Verify bounding box and sphere exist.
14. Dispose created Three.js geometries at the end of the test.

### Normal-mode tests

Clone the seed `42` recipe as plain data and set each mode in turn:

- `flat`
- `weighted`
- `selective`

For each mode:

- Generation succeeds.
- Shape fingerprint remains identical.
- Geometry validates.
- Flat mode has rendered vertex count greater than or equal to selective mode.
- Selective mode has rendered vertex count greater than or equal to weighted mode.
- Every normal is unit length within tolerance.
- Bottom-face normals point downward.
- Top-face normals point generally upward.

### Batch generation tests

Generate seeds `0` through `255`.

For every seed:

- Generation succeeds within configured retry limit.
- Validation has zero issues.
- Fingerprint matches a second generation of the same seed.
- `generateFromRecipe` returns the same fingerprint.
- Shared and rendered counts remain within budgets.
- Signed volume is positive.
- Contact area and ratio meet configured minima.
- Minimum edge and area metrics meet configured minima.
- Bounds minimum Y is zero within tolerance.
- Width, height, and depth are positive.

Across the batch:

- At least `250` unique fingerprints must exist.
- At least `240` unique rounded dimension triplets at `0.001` precision must exist.
- At least one seed must apply one cut.
- At least one seed must apply two cuts.
- At least one seed must apply three cuts when the configured maximum remains three.
- Maximum attempts used must not exceed the configured limit.
- Record, but do not gate, p50 and p95 generation time.
- Dispose every created Three.js geometry immediately after collecting metrics.

### Failure-path tests

Verify:

- Unsupported recipe version throws `INVALID_RECIPE`.
- A recipe containing `NaN` throws `INVALID_RECIPE`.
- A recipe with an empty side-angle array throws `INVALID_RECIPE`.
- A recipe with side-angle and side-radius length mismatch throws `INVALID_RECIPE`.
- A zero cut normal throws `INVALID_RECIPE`.
- An invalid determinant from skew throws `INVALID_RECIPE`.
- A deliberately impossible config with excessive minimum contact ratio reaches `RETRY_LIMIT_EXCEEDED` after exactly the configured number of attempts.
- Retry-limit error details contain one entry per attempted recipe.

## Implementation sequence

Implement in this exact order. Keep the branch compiling after each numbered step.

### Step 1 — Configuration

Files:

- `public/config/stones.yaml`
- `src/stones/config/StoneConfig.ts`
- `src/stones/config/StoneConfigLoader.ts`

Completion check:

- `npx tsc` passes.
- A temporary local call to `parse` accepts the committed configuration.

### Step 2 — Core types and errors

Files:

- `StoneCoreTypes.ts`
- `StoneErrors.ts`

Completion check:

- No import cycle exists.
- Three.js is not imported.

### Step 3 — Math and deterministic random

Files:

- `StoneMath.ts`
- `StoneRandom.ts`

Completion check:

- Golden random vectors pass.
- Math functions reject degenerate inputs.

### Step 4 — Recipe resolver

File:

- `StoneRecipeResolver.ts`

Completion check:

- Recipe tests pass for the fixed seed set.
- Recipe output is deeply frozen.

### Step 5 — Plane builder and clipper

Files:

- `StonePlaneBuilder.ts`
- `StoneHalfSpaceClipper.ts`

Completion check:

- A no-cut recipe produces a non-empty closed convex polyhedron.
- Every cap winding matches its clipping plane.

### Step 6 — Transform and cleanup

Files:

- `StoneMeshCleanup.ts`
- supporting additions to `StoneMath.ts`

Completion check:

- Ground origin is normalized.
- Shared indexed polygon mesh has no duplicate adjacent indices.

### Step 7 — Triangulation and normals

Files:

- `StoneTriangulator.ts`
- `StoneNormalBuilder.ts`

Completion check:

- All three normal modes produce finite arrays.
- Triangulation does not create sub-threshold triangles.

### Step 8 — Metrics, validation, and fingerprint

Files:

- `StoneGeometryMetrics.ts`
- `StoneGeometryValidator.ts`
- `StoneGeometryFingerprint.ts`

Completion check:

- Seed `42` validates.
- An intentionally corrupted edge incidence fails manifold validation.

### Step 9 — Adapter and generator

Files:

- `StoneBufferGeometryAdapter.ts`
- `StoneCoreGenerator.ts`
- `index.ts`

Completion check:

- Public generator API returns a valid `BufferGeometry`.
- Core files other than the adapter and generator remain free of Three.js imports.

### Step 10 — Verification and build gate

Files:

- `src/stones/qa/StoneCoreVerification.ts`
- `scripts/verify-stone-core.mjs`
- `package.json`

Completion check:

```bash
npm run test:stone-core
npm run build
```

Both commands must pass.

## Public exports

`src/stones/core/index.ts` must export only the intended Phase 1 API:

```ts
export type {
  StoneGenerationResult,
  StoneGeometryMetrics,
  StoneNormalMode,
  StoneRecipe,
  StoneValidationIssue,
  StoneValidationResult,
} from "./StoneCoreTypes";

export { StoneCoreGenerator } from "./StoneCoreGenerator";
export { StoneGenerationError } from "./StoneErrors";
```

Do not export clipper internals, cleanup helpers, random internals, or plane builders from the package barrel.

## Code quality constraints

- TypeScript strict mode must remain enabled.
- No `any` is permitted.
- Do not use non-null assertions unless an invariant is checked immediately before use.
- No `console.log`, `console.warn`, or `console.error` in core files.
- No hidden mutable module-level state.
- No mutable singleton generator.
- Do not mutate recipe inputs.
- Do not mutate caller-owned arrays.
- Avoid allocating Three.js objects inside core loops.
- Constants belong at module scope or in YAML, not inside repeated loops.
- Comments should explain mathematical invariants and non-obvious decisions, not narrate the current revision.
- Every TODO must describe a real deferred task and name its target phase.
- Do not add TODOs for Phase 1 requirements.
- Keep source files focused. Split a file before it exceeds roughly 350 lines unless the extra length is predominantly type declarations.
- All thrown messages must be actionable and include the relevant seed, attempt, plane, face, or validation code where applicable.

## Determinism contract

Phase 1 determinism means:

- Same committed configuration.
- Same recipe version.
- Same public seed.
- Same attempt number.
- Same JavaScript engine and architecture.

Under those conditions, recipe values, polygon order, shared vertex order, triangle order, rendered arrays, and fingerprint must be exactly equal.

Across standards-compliant JavaScript engines, minor trigonometric differences are allowed, but the quantized fingerprint should remain stable at the configured precision. If cross-engine fingerprint stability cannot be achieved without reducing quality, preserve geometric equivalence and document the observed engine difference in this file before merging.

Do not use object-key enumeration, unordered sets, or map insertion from nondeterministic sources to decide geometry order.

## Performance and memory constraints

Phase 1 does not enforce device-time budgets, but the implementation must follow these algorithmic constraints:

- No recursion proportional to seed count.
- Retry count is strictly bounded.
- Plane count is bounded by configuration.
- Polygon clipping is proportional to planes multiplied by current polygon vertices.
- No voxel grids.
- No dense spatial acceleration structure.
- No per-generation retained cache.
- Failed attempts must not create `THREE.BufferGeometry`.
- Temporary arrays become unreachable after generation returns.
- The batch verifier disposes all generated geometries.
- Count budgets are hard validation failures.

The verifier should report approximate total batch duration, p50, and p95 for diagnostics only.

## Visual acceptance checklist

Render several Phase 1 outputs locally with a neutral grey material before completion. A dedicated checked-in gallery is not required until Phase 0 or Phase 9 tooling exists.

The reviewer must be able to confirm:

- The silhouette is asymmetric.
- The top is narrower than the lower body.
- The bottom sits flat.
- The stone has a stable visible footprint.
- Faces are broad and deliberate.
- Cuts create large planes rather than noisy dents.
- Lean and skew do not make the stone appear to float.
- Selective normals keep major cuts readable.
- No tiny spikes, slivers, holes, inverted triangles, or disconnected pieces are visible.
- A plain material is enough to read the shape.

Reject the implementation if the typical output resembles a deformed sphere, crystal, or random triangulated blob.

## Phase completion criteria

Phase 1 is complete only when all conditions below are true:

- Every required file exists in the specified path.
- The committed YAML matches this document unless this document is updated in the same commit.
- The random golden vectors pass.
- The complete configuration test matrix passes.
- Seeds `0` through `255` generate valid stones.
- At least `250` unique fingerprints exist in that batch.
- Same-seed generation is exactly deterministic.
- Recipe replay produces exactly the same geometry.
- Flat, weighted, and selective normal modes validate.
- Every generated mesh is closed, convex, connected, manifold, outward-wound, and grounded.
- No mesh exceeds configured geometry budgets.
- Core mathematics remains independent of Three.js.
- No Phase 2 or later functionality has been mixed into this implementation.
- `npm run test:stone-core` passes.
- `npm run build` passes.
- The working tree is clean after verification.

## Definition of done report

The implementing AI must include this exact information in its final report:

1. Commit SHA.
2. Files added and changed.
3. `npm run test:stone-core` result.
4. `npm run build` result.
5. Batch seed count.
6. Unique fingerprint count.
7. Maximum attempts used.
8. Maximum shared vertex count.
9. Maximum rendered vertex count.
10. Maximum triangle count.
11. Any deviations from this specification.

A deviation must be explained and must not be hidden behind a passing test.