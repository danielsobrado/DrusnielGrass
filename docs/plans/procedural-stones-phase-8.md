# Procedural Stylized Stones — Phase 8 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Phase 3 contract: `docs/plans/procedural-stones-phase-3.md`
- Phase 4 contract: `docs/plans/procedural-stones-phase-4.md`
- Phase 5 contract: `docs/plans/procedural-stones-phase-5.md`
- Phase 6 contract: `docs/plans/procedural-stones-phase-6.md`
- Phase 7 contract: `docs/plans/procedural-stones-phase-7.md`
- Target branch: `main`
- Phase: 8 — runtime performance, asset caching, worker generation, instancing, and dense-field proxies
- Document authority: implementation contract
- Current state: completed
- Scope owner: canonical runtime asset identity, pre-baked libraries, worker protocol, asynchronous generation, shared GPU resources, instanced LOD rendering, cache eviction, visibility, cluster proxies, streaming integration, performance metrics, and benchmark QA

This document removes implementation choices from Phase 8. The implementer must follow the file layout, configuration values, cache-key formats, asset-library format, worker messages, queue priorities, cache ownership, instancing data layout, shader patches, culling equations, proxy rules, world integration, metrics, verification matrix, and completion criteria below. A different cache identity, runtime seed policy, worker architecture, batch model, proxy strategy, memory policy, or benchmark requires this document to be changed first.

## Phase objective

Make the completed procedural stone system practical for large streamed worlds.

Phase 8 must replace the Phase 7 one-asset-per-placement runtime path with a production runtime that:

1. Reuses a deterministic pre-baked variant library for ordinary world stones.
2. Preserves exact generated assets for landmarks, outcrops, and oversized stones.
3. Generates uncached exact assets outside the main thread.
4. Deduplicates concurrent requests for the same asset.
5. Shares geometry, materials, gradient textures, and detail payloads safely.
6. Renders repeated assets through `THREE.InstancedMesh`.
7. Preserves Phase 6 projected-size LOD selection and complementary dithering per instance.
8. Performs per-instance distance, frustum, and projected-size culling.
9. Replaces distant dense cluster and scree groups with approved instanced cluster proxies.
10. Keeps chunk streaming, collision descriptors, and origin rebasing deterministic.
11. Evicts unused decoded assets within fixed CPU and GPU memory budgets.
12. Records cache, queue, worker, instance, triangle, draw-call, culling, memory, and timing statistics.
13. Provides a deterministic library baker and a fixed real-renderer benchmark.

The runtime must avoid visible frame hitches caused by stone generation or GPU resource creation. Draw calls must depend mainly on visible asset variants and LODs, not raw stone count.

## Required dependency state

Phase 8 starts only after these commands pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
npm run test:stone-lod
npm run test:stone-placement
```

The implementation consumes these contracts without replacing them:

- `StoneRandom`
- `mixStoneUint32`
- all Phase 1–6 generation and fingerprint contracts
- `StoneArchetypeId` and `STONE_ARCHETYPE_IDS`
- `StonePaletteId` and `STONE_PALETTE_IDS`
- `StoneLodGenerator`
- `StoneLodAssetSet`
- `StoneLodLevel`
- `StoneLodBlendState`
- `StoneLodSelector`
- `StoneStylizedMaterial`
- Phase 6 LOD dither equations
- `StoneProductionGenerationResult`
- `StoneChunkPlanner`
- `StoneChunkPlan`
- `StonePlacementRecipe`
- `StonePlacementModeId`
- `StoneCollisionIndex`
- `StonePlacementExclusionProvider`
- `StonePlacementConfig`
- `StoneTerrainSampler`
- `TerrainField`
- `WorldConfig`
- `RuntimeProfile`

Versions remain:

- Phase 1 core recipe: `1`
- Phase 2 archetype recipe: `1`
- Phase 3 detail recipe: `1`
- Phase 4 material recipe and shader: `1`
- Phase 5 quality profile: `1`
- Phase 6 LOD recipe and transition shader: `1`
- Phase 7 placement recipe and environment field: `1`
- Phase 8 runtime config: `1`
- Phase 8 cache key: `1`
- Phase 8 library: `1`
- Phase 8 worker protocol: `1`
- Phase 8 instancing shader: `1`
- Phase 8 cluster proxy: `1`

## Compatibility contract

Phase 8 is additive and replaces only the default world-rendering path for Phase 7 placements.

Direct Phase 1–7 APIs must remain unchanged. In particular:

- Phase 7 chunk plans and placement fingerprints remain byte-stable.
- Placement `stoneSeed`, archetype, palette, transform, collision descriptor, and owner chunk remain unchanged.
- Direct `WorldStoneSystem` behavior remains available for Phase 7 verification.
- Direct Phase 6 generation with a requested archetype, seed, and palette remains exact.
- Phase 8 does not change geometry, quality, material, LOD, or placement configuration values.
- Phase 8 does not change terrain sampling or world-seed interpretation.

The optimized world runtime may choose an approved library seed for ordinary placement rendering. The original Phase 7 `stoneSeed` remains the deterministic source for variant selection and remains stored in placement metadata. Exact-generation classes always use the original seed.

When `stoneRuntimeEnabledByDefault` is `false`, `WorldApp` must use the Phase 7 `WorldStoneSystem` without any Phase 8 optimization. This is the compatibility and rollback path.

## Frozen architectural decisions

1. Ordinary world stones use a pre-baked library with exactly eight variants per archetype and palette.
2. The library contains `12 × 8 × 8 = 768` ordinary stone asset sets.
3. `outcrop` and `landmark` placements always request exact dynamic assets.
4. Any placement with `uniformScale > 1.35` requests an exact dynamic asset regardless of mode.
5. All other placements use a library variant.
6. Library mapping changes only rendered asset seed; it never changes placement transform, archetype, palette, collision, ownership, or placement fingerprint.
7. Library seeds are generated by one fixed algorithm and are not hand-selected.
8. Every library entry is generated and quality-approved through the full Phase 5 and Phase 6 pipeline for its archetype, requested seed, and palette.
9. Library assets are stored as deterministic manifest JSON plus one deterministic little-endian binary pack.
10. Runtime library loading supports HTTP byte ranges and a full-file fallback.
11. Exact dynamic generation runs in Web Workers.
12. Desktop uses two workers; compact uses one worker.
13. No more than two generation workers are created.
14. Workers return serializable runtime payloads, not Three.js class instances.
15. GPU resource creation remains on the main thread.
16. Every cache request is deduplicated before dispatch.
17. Cache identity includes all Phase 1–8 dependency configuration fingerprints.
18. Different requests resolving to the same Phase 6 LOD-set fingerprint share one decoded asset entry.
19. Cache entries are reference-counted.
20. An entry with positive references is never evicted.
21. Eviction is deterministic least-recently-used with a cache-key tie break.
22. Ordinary library entries and dynamic entries are both evictable after reference count reaches zero.
23. The manifest and binary transport cache are separate from decoded GPU asset cache.
24. Each decoded asset owns four immutable geometries and four instanced materials.
25. All instances of one asset and LOD share its geometry and material.
26. One global batch exists per decoded asset key and LOD level when that level has visible instances.
27. Batches are `THREE.InstancedMesh` objects with packed slots and swap-remove deletion.
28. Batch meshes are CPU-frustum-culled per instance and therefore set `frustumCulled = false`.
29. Per-instance LOD coverage, inversion, dither phase, and shadow eligibility are attributes.
30. Phase 6 complementary Bayer dithering is preserved exactly.
31. Exactly one LOD casts a shadow per stone; LOD3 never casts.
32. Shadow eligibility is enforced by custom instanced depth and distance materials.
33. Visible batches do not duplicate draw calls solely for shadow selection.
34. Instance matrices contain global world coordinates.
35. One runtime root group applies the negative world-origin translation.
36. Origin rebasing never rewrites instance matrices.
37. Runtime culling uses distance, camera frustum, and projected radius.
38. Screen-size culling occurs below the configured projected-radius threshold.
39. Dense `cluster` and `scree` anchors with at least four eligible members use a canonical far proxy.
40. Cluster proxies are pre-baked and instanced.
41. Proxies replace individuals only at small projected size and use complementary dither transitions.
42. Collision descriptors remain active independently of visual culling or proxy replacement.
43. Exact dynamic placements use a library variant as a temporary placeholder until their exact worker asset is ready.
44. Placeholder-to-exact replacement uses a fixed 0.35-second complementary dither.
45. A terminal dynamic-generation failure retains the approved placeholder and records a degraded-runtime diagnostic.
46. The runtime never blocks the frame waiting for generation.
47. Main-thread asset upload is limited by both item count and elapsed-time budget.
48. Queue priority is deterministic and camera-aware.
49. Requests with no remaining consumers are cancelled before dispatch or discarded after completion.
50. Library baking is an explicit script and is not repeated during normal production build.
51. The generated library files are committed production assets.
52. The normal verifier validates the committed library; it does not rebake all 768 entries.
53. A separate library verification mode may rebake the complete library.
54. Internal cache, queue, worker, culling, batch, and proxy classes do not log.
55. The runtime system logs one initialization summary and unexpected terminal failures only.
56. Phase 8 adds no third-party production dependency and no testing framework.
57. Phase 8 does not add authoring controls, stone editing, biome painting, export, network replication, save persistence, or gameplay collision response.

## In scope

- strict runtime configuration;
- dependency and cache fingerprints;
- ordinary-library variant mapping;
- deterministic full asset-library baking;
- manifest and binary pack writing;
- byte-range library loading;
- runtime payload serialization;
- Web Worker protocol and pool;
- generation request prioritization and cancellation;
- request and resolved-asset deduplication;
- decoded CPU/GPU cache budgets and LRU eviction;
- shared geometry and material lifetime;
- instanced shader patching;
- custom instanced shadow materials;
- packed instance batches;
- batch growth and empty-batch retirement;
- per-instance projected LOD state;
- per-instance distance, frustum, and screen-size culling;
- deterministic dynamic placeholders;
- distant cluster and scree proxies;
- optimized chunk streaming and origin rebasing;
- runtime diagnostics and memory accounting;
- deterministic benchmark scene;
- automated correctness and budget verification.

## Explicitly out of scope

Do not implement:

- changes to procedural stone art direction;
- changes to Phase 1–7 generation or placement decisions;
- more than eight ordinary variants per archetype and palette;
- texture-atlas baking for albedo or normal maps;
- billboard or impostor atlas rendering;
- WebGPU-only render paths;
- GPU-driven indirect draw commands;
- multi-draw extensions;
- mesh shaders;
- occlusion-query systems;
- hierarchical Z-buffer occlusion;
- persistent IndexedDB asset caches;
- service workers;
- CDN-specific transport logic;
- server-side generation;
- runtime library mutation;
- dynamic quality-threshold changes;
- per-instance palette changes for one asset entry;
- physics response or character collision resolution;
- destructible stones;
- editor UI or debug tuning panels;
- screenshot-diff build gates.

## Required file changes

### New source files

Create exactly:

```text
public/config/stone-runtime.yaml

src/stones/runtime/StoneRuntimeTypes.ts
src/stones/runtime/StoneRuntimeConfig.ts
src/stones/runtime/StoneRuntimeConfigLoader.ts
src/stones/runtime/StoneRuntimeErrors.ts
src/stones/runtime/StoneRuntimeCatalog.ts
src/stones/runtime/StoneRuntimeFingerprint.ts
src/stones/runtime/StoneRuntimeRequestResolver.ts
src/stones/runtime/StoneRuntimePayload.ts
src/stones/runtime/StoneRuntimePayloadCodec.ts
src/stones/runtime/StoneLibraryManifest.ts
src/stones/runtime/StoneLibraryLoader.ts
src/stones/runtime/StoneRuntimeWorkerProtocol.ts
src/stones/runtime/StoneRuntimeGenerationWorker.ts
src/stones/runtime/StoneRuntimeWorkerPool.ts
src/stones/runtime/StoneRuntimeGenerationQueue.ts
src/stones/runtime/StoneRuntimeAssetCache.ts
src/stones/runtime/StoneRuntimeResourceFactory.ts
src/stones/runtime/StoneInstancedDitherShader.ts
src/stones/runtime/StoneInstancedShadowShader.ts
src/stones/runtime/StoneInstancedMaterialPatcher.ts
src/stones/runtime/StoneInstancedShadowMaterial.ts
src/stones/runtime/StoneInstanceBatch.ts
src/stones/runtime/StoneInstanceBatchManager.ts
src/stones/runtime/StoneRuntimeVisibilityResolver.ts
src/stones/runtime/StoneRuntimeLodResolver.ts
src/stones/runtime/StoneRuntimeProxyCatalog.ts
src/stones/runtime/StoneRuntimeProxyResolver.ts
src/stones/runtime/StoneRuntimeChunk.ts
src/stones/runtime/StoneRuntimeRegistry.ts
src/stones/runtime/StoneRuntimeStats.ts
src/stones/runtime/WorldStoneRuntimeSystem.ts
src/stones/runtime/index.ts

src/stones/qa/StoneRuntimeVerification.ts
src/app/StoneRuntimeBenchmarkApp.ts

scripts/bake-stone-library.mjs
scripts/verify-stone-library.mjs
scripts/verify-stone-runtime.mjs
```

### Generated production assets

The implementation must generate and commit:

```text
public/assets/stones/stone-library-v1.manifest.json
public/assets/stones/stone-library-v1.bin
```

Do not hand-edit these files.

### Existing files to modify

Modify only:

```text
src/app/WorldApp.ts
src/main.ts
package.json
```

Do not modify Phase 1–7 production files.

## Package scripts

Add exactly:

```json
"bake:stone-library": "node scripts/bake-stone-library.mjs",
"test:stone-library": "node scripts/verify-stone-library.mjs",
"test:stone-runtime": "node scripts/verify-stone-runtime.mjs"
```

Update build order:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-stone-quality.mjs && node scripts/verify-stone-lod.mjs && node scripts/verify-stone-placement.mjs && node scripts/verify-stone-library.mjs && node scripts/verify-stone-runtime.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Normal `build` validates the committed library and must not rebake it.

## Configuration contract

Create `public/config/stone-runtime.yaml` with exactly these values:

```yaml
# Phase 8 versions
stoneRuntimeConfigVersion: 1
stoneRuntimeCacheKeyVersion: 1
stoneRuntimeLibraryVersion: 1
stoneRuntimeWorkerProtocolVersion: 1
stoneRuntimeInstancingShaderVersion: 1
stoneRuntimeClusterProxyVersion: 1

# Feature switches
stoneRuntimeEnabledByDefault: true
stoneRuntimeUsePrebakedLibrary: true
stoneRuntimeUseWorkers: true
stoneRuntimeUseClusterProxies: true

# Ordinary library selection
stoneRuntimeLibraryVariantCount: 8
stoneRuntimeExactScaleThreshold: 1.35
stoneRuntimeExactIsolated: false
stoneRuntimeExactPair: false
stoneRuntimeExactCluster: false
stoneRuntimeExactScree: false
stoneRuntimeExactOutcrop: true
stoneRuntimeExactLandmark: true

# Worker pool and queue
stoneRuntimeWorkerCountDesktop: 2
stoneRuntimeWorkerCountCompact: 1
stoneRuntimeWorkerCountMaximum: 2
stoneRuntimeWorkerUnexpectedRetryCount: 1
stoneRuntimeMaximumPendingRequests: 512
stoneRuntimeMaximumCompletedPayloads: 32
stoneRuntimeQueuePriorityDistanceMaximum: 1000000

# Main-thread upload budgets
stoneRuntimeUploadBudgetMsDesktop: 2.5
stoneRuntimeUploadBudgetMsCompact: 1.25
stoneRuntimeUploadCountDesktop: 2
stoneRuntimeUploadCountCompact: 1
stoneRuntimePlacementRegistrationDesktop: 64
stoneRuntimePlacementRegistrationCompact: 32
stoneRuntimeChunkPlanCountPerFrame: 1

# Decoded asset cache
stoneRuntimeDecodedByteBudgetDesktop: 268435456
stoneRuntimeDecodedByteBudgetCompact: 100663296
stoneRuntimeDynamicEntryMaximumDesktop: 128
stoneRuntimeDynamicEntryMaximumCompact: 48
stoneRuntimeNegativeEntryMaximum: 32
stoneRuntimeEvictionTargetRatio: 0.85
stoneRuntimeEmptyBatchRetireFrames: 120

# Instance batches
stoneRuntimeBatchInitialCapacity: 32
stoneRuntimeBatchGrowthFactor: 2
stoneRuntimeBatchMaximumCapacity: 1024
stoneRuntimeBatchMaximumDesktop: 512
stoneRuntimeBatchMaximumCompact: 256
stoneRuntimeInstanceAttributeStrideBytes: 84

# Visibility and culling
stoneRuntimeDistanceCullDesktop: 320
stoneRuntimeDistanceCullCompact: 180
stoneRuntimeProjectedRadiusCullDesktop: 1.25
stoneRuntimeProjectedRadiusCullCompact: 1.5
stoneRuntimeFrustumRadiusScale: 1.08
stoneRuntimeVisibilityMaximumDesktop: 4096
stoneRuntimeVisibilityMaximumCompact: 1536

# Dynamic placeholder replacement
stoneRuntimePlaceholderTransitionSeconds: 0.35
stoneRuntimePlaceholderMinimumCoverage: 0
stoneRuntimePlaceholderMaximumCoverage: 1

# Cluster and scree proxies
stoneRuntimeClusterProxyVariantCount: 4
stoneRuntimeProxyMemberMinimum: 4
stoneRuntimeProxyMemberMaximum: 10
stoneRuntimeProxyMemberHeightMaximum: 0.9
stoneRuntimeProxyEnterProjectedRadiusPixels: 12
stoneRuntimeProxyExitProjectedRadiusPixels: 16
stoneRuntimeProxyTransitionHalfWidthPixels: 2
stoneRuntimeProxyMaximumBoundsDelta: 0.18
stoneRuntimeProxyMaximumCentroidShiftRatio: 0.10

# Library transport and format
stoneRuntimeLibraryManifestPath: "./assets/stones/stone-library-v1.manifest.json"
stoneRuntimeLibraryBinaryPath: "./assets/stones/stone-library-v1.bin"
stoneRuntimeLibraryBinaryAlignment: 4
stoneRuntimeLibraryRangeMergeGapBytes: 4096
stoneRuntimeLibraryMaximumRangeBytes: 1048576

# Diagnostics and benchmark budgets
stoneRuntimeStatsIntervalSeconds: 0.25
stoneRuntimeBenchmarkPlacementCount: 4096
stoneRuntimeBenchmarkWarmupSeconds: 4
stoneRuntimeBenchmarkDurationSeconds: 20
stoneRuntimeBenchmarkDrawCallMaximumDesktop: 220
stoneRuntimeBenchmarkDrawCallMaximumCompact: 120
stoneRuntimeBenchmarkTriangleMaximumDesktop: 1200000
stoneRuntimeBenchmarkTriangleMaximumCompact: 350000
stoneRuntimeBenchmarkGpuByteMaximumDesktop: 268435456
stoneRuntimeBenchmarkGpuByteMaximumCompact: 100663296
stoneRuntimeBenchmarkFrameP95MaximumDesktopMs: 20
stoneRuntimeBenchmarkFrameP95MaximumCompactMs: 33.4
stoneRuntimeBenchmarkUploadFrameMaximumDesktopMs: 4
stoneRuntimeBenchmarkUploadFrameMaximumCompactMs: 2.5

# Automated verification
stoneRuntimeVerificationPlacementCount: 2048
stoneRuntimeVerificationLibrarySampleCount: 32
stoneRuntimeUniqueRequestKeyMinimum: 1800
stoneRuntimeCacheHitRateMinimum: 0.70
stoneRuntimeInstanceReuseMinimum: 0.65
stoneRuntimeAnalysisEpsilon: 0.00001
stoneRuntimeFingerprintQuantization: 0.000001
```

### Configuration types

`StoneRuntimeConfig.ts` must group every value into explicit immutable interfaces:

```ts
export interface StoneRuntimeFeatureConfig { /* feature switches */ }
export interface StoneRuntimeLibrarySelectionConfig { /* variant and exact rules */ }
export interface StoneRuntimeWorkerConfig { /* workers and queue */ }
export interface StoneRuntimeUploadConfig { /* frame budgets */ }
export interface StoneRuntimeCacheConfig { /* bytes and eviction */ }
export interface StoneRuntimeBatchConfig { /* capacities */ }
export interface StoneRuntimeVisibilityConfig { /* distance and screen culling */ }
export interface StoneRuntimePlaceholderConfig { /* replacement transition */ }
export interface StoneRuntimeProxyConfig { /* dense-group proxies */ }
export interface StoneRuntimeTransportConfig { /* manifest and binary */ }
export interface StoneRuntimeBenchmarkConfig { /* benchmark values */ }
export interface StoneRuntimeVerificationConfig { /* automated values */ }
```

Top-level:

```ts
export interface StoneRuntimeConfig {
  readonly version: 1;
  readonly cacheKeyVersion: 1;
  readonly libraryVersion: 1;
  readonly workerProtocolVersion: 1;
  readonly instancingShaderVersion: 1;
  readonly clusterProxyVersion: 1;
  readonly features: Readonly<StoneRuntimeFeatureConfig>;
  readonly librarySelection: Readonly<StoneRuntimeLibrarySelectionConfig>;
  readonly workers: Readonly<StoneRuntimeWorkerConfig>;
  readonly upload: Readonly<StoneRuntimeUploadConfig>;
  readonly cache: Readonly<StoneRuntimeCacheConfig>;
  readonly batches: Readonly<StoneRuntimeBatchConfig>;
  readonly visibility: Readonly<StoneRuntimeVisibilityConfig>;
  readonly placeholder: Readonly<StoneRuntimePlaceholderConfig>;
  readonly proxies: Readonly<StoneRuntimeProxyConfig>;
  readonly transport: Readonly<StoneRuntimeTransportConfig>;
  readonly benchmark: Readonly<StoneRuntimeBenchmarkConfig>;
  readonly verification: Readonly<StoneRuntimeVerificationConfig>;
  readonly analysisEpsilon: number;
  readonly fingerprintQuantization: number;
}
```

### Loader validation

`StoneRuntimeConfigLoader` must:

- expose `load(url = "./config/stone-runtime.yaml")`;
- expose `parse(source: string)` publicly;
- use strict `FlatConfig` parsing;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- return recursively frozen configuration;
- reject invalid booleans, strings, numbers, integers, and relationships;
- identify the invalid key or relationship in every error.

Apply these validations exactly:

1. All six versions equal `1`.
2. Library variant count equals `8`.
3. Exact scale threshold is greater than `1` and at most `2`.
4. Exact mode flags match the committed values.
5. Worker counts are positive integers and do not exceed maximum.
6. Desktop worker count is at least compact count.
7. Worker maximum equals `2`.
8. Unexpected retry count equals `1`.
9. Pending and completed limits are positive integers.
10. Upload budgets are positive and desktop is at least compact.
11. Upload and registration counts are positive integers.
12. Chunk plan count equals `1`.
13. Byte budgets are positive integers and desktop exceeds compact.
14. Dynamic-entry limits are positive integers and desktop exceeds compact.
15. Negative-entry maximum is from `1` through `128`.
16. Eviction target is greater than `0.5` and less than `1`.
17. Empty retirement frames are an integer from `1` through `3600`.
18. Batch initial capacity is a positive power of two.
19. Growth factor equals `2`.
20. Maximum capacity is a power of two and at least initial capacity.
21. Batch maxima are positive integers.
22. Instance stride equals `84`.
23. Distance culls and projected-radius culls are positive.
24. Desktop limits are at least compact limits where applicable.
25. Frustum scale is at least `1` and at most `2`.
26. Visibility maxima are positive integers.
27. Placeholder transition is positive and at most `2` seconds.
28. Placeholder coverage range equals `[0, 1]`.
29. Proxy variant count equals `4`.
30. Proxy member range is `4` through `10`.
31. Proxy enter threshold is smaller than exit threshold.
32. Proxy half-width is positive and no larger than half the enter/exit gap.
33. Proxy bounds and centroid limits are positive and less than `1`.
34. Manifest and binary paths are non-empty relative paths without `..`.
35. Binary alignment equals `4`.
36. Range merge gap and maximum range are positive integers.
37. Maximum range exceeds merge gap.
38. Stats interval is positive and at most `2` seconds.
39. Benchmark counts and durations are positive.
40. Draw-call, triangle, byte, and frame budgets are positive.
41. Verification counts and minima are valid.
42. Hit and reuse minima are inside `[0, 1]`.
43. Analysis epsilon and fingerprint quantization are positive.
44. Fingerprint quantization is not smaller than epsilon divided by `100`.

## Canonical runtime IDs and public types

`StoneRuntimeCatalog.ts` must define:

```ts
export const STONE_RUNTIME_ASSET_ORIGINS = [
  "library",
  "dynamic",
  "proxy",
] as const;

export type StoneRuntimeAssetOrigin =
  (typeof STONE_RUNTIME_ASSET_ORIGINS)[number];

export type StoneRuntimeRequestState =
  | "queued"
  | "loading"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";
```

`StoneRuntimeTypes.ts` must define at least these exact public contracts:

```ts
export interface StoneRuntimeAssetRequest {
  readonly requestKey: string;
  readonly origin: StoneRuntimeAssetOrigin;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly requestedSeed: number;
  readonly libraryVariantIndex: number | null;
  readonly placementId: string;
}

export interface StoneRuntimeAssetReference {
  readonly requestKey: string;
  readonly assetKey: string;
  readonly origin: StoneRuntimeAssetOrigin;
  readonly lodSetFingerprint: string;
}

export interface StoneRuntimePlacementHandle {
  readonly placementId: string;
  readonly ownerChunkX: number;
  readonly ownerChunkZ: number;
}

export interface StoneRuntimeCacheStats {
  readonly requestEntryCount: number;
  readonly resolvedAssetCount: number;
  readonly referencedAssetCount: number;
  readonly decodedCpuBytes: number;
  readonly gpuBytes: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly deduplicatedCount: number;
  readonly evictionCount: number;
  readonly failedCount: number;
}

export interface StoneRuntimeStatsSnapshot {
  readonly loadedChunkCount: number;
  readonly registeredPlacementCount: number;
  readonly visiblePlacementCount: number;
  readonly culledDistanceCount: number;
  readonly culledFrustumCount: number;
  readonly culledProjectedSizeCount: number;
  readonly transitioningPlacementCount: number;
  readonly proxyGroupCount: number;
  readonly visibleProxyCount: number;
  readonly activeBatchCount: number;
  readonly activeInstanceCount: number;
  readonly visibleTriangleCount: number;
  readonly estimatedDrawCallCount: number;
  readonly pendingRequestCount: number;
  readonly inFlightRequestCount: number;
  readonly completedPayloadCount: number;
  readonly degradedPlacementCount: number;
  readonly cache: Readonly<StoneRuntimeCacheStats>;
  readonly lastUploadMilliseconds: number;
  readonly maximumUploadMilliseconds: number;
  readonly averageWorkerMilliseconds: number;
}
```

Runtime scene and cache classes are mutable. Immutable requests, payload metadata, fingerprints, and snapshots must be frozen.

## Dependency fingerprint

`StoneRuntimeFingerprint.ts` must create one `dependencyFingerprint` from the validated configuration objects used by the generator:

- Phase 1 core config;
- Phase 2 archetype config;
- Phase 3 detail config;
- Phase 4 material config;
- Phase 5 quality config;
- Phase 6 LOD config;
- Phase 7 placement config;
- Phase 8 runtime config.

Canonical serialization rules:

1. object keys sorted lexicographically;
2. array order preserved;
3. finite numbers serialized with `Number.prototype.toString()`;
4. booleans as `true` or `false`;
5. strings as UTF-8 length plus bytes;
6. `undefined`, functions, class instances, maps, sets, and cycles reject;
7. no whitespace or locale formatting.

Hash through the established dual FNV-1a strategy.

## Library seed algorithm

The ordinary library has eight requested seeds per archetype.

For archetype and variant index `0` through `7`:

```ts
const random = new StoneRandom(0x8f31a2c7)
  .fork("phase-8-library")
  .fork(archetypeId)
  .fork(`variant:${variantIndex}`);

let seed = random.nextUint32();
```

When a seed duplicates an earlier seed for the same archetype, repeatedly apply:

```ts
seed = mixStoneUint32(seed + 0x9e3779b9);
```

Allow at most four corrections. A remaining duplicate is an implementation error.

The same eight requested seeds are used across all palettes for one archetype. Effective Phase 5 fallback seeds may differ by palette and are stored in each library entry.

## Runtime request resolution

`StoneRuntimeRequestResolver` receives a Phase 7 placement and dependency fingerprint.

Exact dynamic request when either condition is true:

- placement mode is `outcrop` or `landmark`;
- `uniformScale > exactScaleThreshold`.

Otherwise use library.

### Library variant

```ts
const variantRandom = new StoneRandom(placement.stoneSeed)
  .fork("phase-8-runtime-variant")
  .fork(placement.archetypeId)
  .fork(placement.paletteId);

const variantIndex = variantRandom.integer(0, 7);
```

Use the canonical library seed for archetype and variant index.

### Request-key formats

Library:

```text
stone-request:v1|dep:<dependencyFingerprint>|origin:library|library:<libraryFingerprint>|archetype:<archetypeIndex>|palette:<paletteIndex>|variant:<variantIndex>
```

Dynamic:

```text
stone-request:v1|dep:<dependencyFingerprint>|origin:dynamic|archetype:<archetypeIndex>|palette:<paletteIndex>|seed:<eightLowercaseHexDigits>
```

Proxy:

```text
stone-request:v1|dep:<dependencyFingerprint>|origin:proxy|proxy:<proxyModeIndex>|palette:<paletteIndex>|variant:<variantIndex>
```

Do not include placement ID, transform, scale, chunk, camera state, or world origin in asset keys.

Resolved asset key:

```text
stone-asset:v1|<lodSetFingerprint>
```

Proxy asset key:

```text
stone-proxy:v1|<proxyFingerprint>
```

## Runtime payload format

Workers and the binary library use the same logical payload schema.

```ts
export type StoneRuntimeComponentType =
  | "float32"
  | "uint8"
  | "uint16"
  | "uint32";

export interface StoneRuntimeArrayPayload {
  readonly componentType: StoneRuntimeComponentType;
  readonly itemSize: number;
  readonly normalized: boolean;
  readonly elementCount: number;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface StoneRuntimeAttributePayload
  extends StoneRuntimeArrayPayload {
  readonly name: string;
}

export interface StoneRuntimeLodPayload {
  readonly level: StoneLodLevel;
  readonly attributes:
    readonly Readonly<StoneRuntimeAttributePayload>[];
  readonly index: Readonly<StoneRuntimeArrayPayload>;
  readonly boundingBox: readonly [number, number, number, number, number, number];
  readonly boundingSphere: readonly [number, number, number, number];
  readonly surfaceDetailCount: number;
  readonly detailHeader: readonly number[];
  readonly detailData0: readonly number[];
  readonly detailData1: readonly number[];
  readonly detailData2: readonly number[];
  readonly compactMetadata: Readonly<Record<string, unknown>>;
  readonly geometryFingerprint: string;
  readonly materialFingerprint: string;
  readonly assetFingerprint: string;
}

export interface StoneRuntimeAssetPayload {
  readonly version: 1;
  readonly requestKey: string;
  readonly assetKey: string;
  readonly origin: StoneRuntimeAssetOrigin;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly requestedSeed: number;
  readonly effectiveSeed: number;
  readonly productionFingerprint: string;
  readonly lodSetFingerprint: string;
  readonly levels: readonly [
    Readonly<StoneRuntimeLodPayload>,
    Readonly<StoneRuntimeLodPayload>,
    Readonly<StoneRuntimeLodPayload>,
    Readonly<StoneRuntimeLodPayload>,
  ];
  readonly byteLength: number;
  readonly payloadFingerprint: string;
}
```

The actual typed-array bytes live in one transferable `ArrayBuffer` or one binary-pack range. Offsets are relative to that buffer.

Attributes are sorted by exact name. Required names are the Phase 6 geometry attributes. Prohibit generic `uv`, `color`, and `tangent` unless a future version changes this specification.

Every array begins at a four-byte-aligned offset. Zero padding bytes must be zero.

## Payload codec

`StoneRuntimePayloadCodec` must:

- serialize one Phase 6 asset set into payload metadata plus one contiguous `ArrayBuffer`;
- copy all geometry data; never retain references to disposable Three.js arrays;
- serialize levels in `0, 1, 2, 3` order;
- serialize attributes in name order;
- preserve component types, item sizes, normalization, and exact bytes;
- include fixed-size detail arrays for every level;
- include compact Phase 1–6 metadata only;
- calculate payload fingerprint from metadata and raw bytes;
- decode without changing bytes;
- reject overlap, out-of-range offsets, unknown component types, invalid counts, non-zero padding, or fingerprint mismatch.

Decoded payloads are immutable views until `StoneRuntimeResourceFactory` copies them into Three.js-owned arrays.

## Pre-baked library

### Manifest

`stone-library-v1.manifest.json` must contain:

```ts
export interface StoneLibraryManifest {
  readonly version: 1;
  readonly dependencyFingerprint: string;
  readonly entryCount: 768;
  readonly proxyEntryCount: 64;
  readonly binaryByteLength: number;
  readonly binaryFingerprint: string;
  readonly libraryFingerprint: string;
  readonly entries: readonly Readonly<StoneLibraryManifestEntry>[];
  readonly proxies: readonly Readonly<StoneLibraryManifestEntry>[];
}
```

Entry fields:

```ts
export interface StoneLibraryManifestEntry {
  readonly requestKey: string;
  readonly assetKey: string;
  readonly archetypeId: StoneArchetypeId | null;
  readonly paletteId: StonePaletteId;
  readonly requestedSeed: number;
  readonly effectiveSeed: number;
  readonly variantIndex: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly payloadFingerprint: string;
  readonly lodSetFingerprint: string;
}
```

Entries sort by archetype canonical order, palette canonical order, then variant index. Proxy entries sort by proxy mode, palette, then variant.

Manifest JSON:

- two-space indentation;
- final newline;
- no timestamp, host, absolute path, or tool version;
- stable declaration field order.

### Binary pack

Binary file:

1. eight ASCII bytes `STLIBV01`;
2. little-endian `uint32` library version;
3. little-endian `uint32` entry count including proxies;
4. little-endian `uint32` reserved zero;
5. payloads in manifest entry order;
6. each payload starts at four-byte alignment;
7. all inter-payload padding is zero.

Manifest offsets point to payload starts after the fixed header.

Binary fingerprint hashes every byte.

Library fingerprint hashes:

```text
v1|<dependencyFingerprint>|<binaryFingerprint>|<ordered request keys and payload fingerprints>
```

### Bake script

`bake-stone-library.mjs` must:

1. load every Phase 1–8 configuration through production loaders;
2. calculate dependency fingerprint;
3. generate all 768 ordinary entries;
4. generate all 64 proxy entries;
5. serialize payloads;
6. validate every payload by decoding it;
7. write binary and manifest to temporary files;
8. atomically replace final files;
9. print entry count, total bytes, unique asset count, and fingerprints;
10. fail on duplicate request keys, duplicate ordinary payload fingerprints within one archetype/palette, or any quality/LOD failure.

Accepted CLI options are exactly:

```text
--output <directory>
--verify-only <0|1>
```

Defaults:

```text
--output public/assets/stones
--verify-only 0
```

`--verify-only 1` builds in memory, compares fingerprints to committed files, and writes nothing.

## Library loader

`StoneLibraryLoader` performs:

1. fetch manifest;
2. strict schema validation;
3. dependency-fingerprint equality check;
4. canonical entry-order validation;
5. duplicate-key validation;
6. binary-size validation through `HEAD` when available;
7. lazy payload loading.

For one request:

- merge adjacent pending ranges when the byte gap is at most configured merge gap and merged length is at most maximum range;
- send `Range: bytes=start-end`;
- accept `206` with exact `Content-Range`;
- if server returns `200`, retain the complete binary buffer and serve future requests locally;
- reject all other response statuses;
- validate payload fingerprint after extraction.

Concurrent requests for the same range share one promise.

The loader does not create Three.js resources.

## Worker protocol

`StoneRuntimeWorkerProtocol.ts` defines exact discriminated messages.

Main to worker:

```ts
export type StoneRuntimeWorkerRequest =
  | StoneRuntimeWorkerInitialize
  | StoneRuntimeWorkerGenerate
  | StoneRuntimeWorkerCancel
  | StoneRuntimeWorkerDispose;
```

Initialize contains:

- protocol version;
- dependency fingerprint;
- serialized validated Phase 1–6 configuration objects;
- runtime payload configuration needed by codec.

Generate contains:

```ts
{
  type: "generate";
  requestId: number;
  requestKey: string;
  archetypeId: StoneArchetypeId;
  paletteId: StonePaletteId;
  requestedSeed: number;
}
```

Cancel contains request ID.

Worker to main:

```ts
export type StoneRuntimeWorkerResponse =
  | { type: "initialized"; protocolVersion: 1; dependencyFingerprint: string }
  | { type: "progress"; requestId: number; stage: string }
  | { type: "completed"; requestId: number; metadata: StoneRuntimeAssetPayload; buffer: ArrayBuffer; elapsedMilliseconds: number }
  | { type: "failed"; requestId: number; code: string; message: string; details: Readonly<Record<string, unknown>>; elapsedMilliseconds: number };
```

Completed buffers transfer ownership.

Worker generation:

1. build Phase 6 asset set through production generators;
2. serialize it immediately;
3. dispose all four geometries and materials;
4. post metadata and transferred buffer;
5. retain no completed asset state.

Cancellation is cooperative between major generation stages. A cancelled request disposes temporary resources and sends no completion.

## Worker pool and generation queue

### Worker pool

- create configured worker count after library initialization;
- initialize workers sequentially and require matching dependency fingerprint;
- dispatch one request per idle worker;
- assign monotonically increasing unsigned request IDs starting at `1`;
- wrap at `0xffffffff` and skip IDs still active;
- restart one worker after an unexpected crash;
- retry an affected request exactly once on another initialized worker;
- typed generation failures are not retried;
- after the unexpected retry is exhausted, fail the request.

### Queue priority

Each queued consumer supplies camera and placement data.

Calculate integer priority tuple:

1. visible-now flag descending;
2. placeholder-active flag descending;
3. owner chunk squared distance ascending;
4. placement squared distance clamped to configured maximum ascending;
5. request key lexicographic ascending.

Use tuple comparison. Do not combine values into a floating score.

When several placements share a request, use the best tuple among active consumers.

Queue size may not exceed configured maximum. When full, reject the worst un-dispatched request only if the new request has better priority. Otherwise reject the new request. Never evict an in-flight request.

Requests with zero consumers:

- are removed when queued;
- receive cancellation when in flight;
- have completed payloads discarded if cancellation arrives too late.

## Asset cache

`StoneRuntimeAssetCache` maintains:

- request entries keyed by request key;
- resolved assets keyed by asset key;
- negative entries for typed terminal failures;
- cache statistics.

### Request entry states

```text
queued → loading/generating → completed
queued/loading/generating → cancelled
loading/generating → failed
```

A request entry contains consumer count, promise, state, asset key when complete, and failure when terminal.

### Resolved asset entry

A decoded entry contains:

- asset reference;
- origin;
- decoded CPU payload metadata;
- four geometries;
- four materials;
- four custom depth materials;
- four custom distance materials;
- CPU byte estimate;
- GPU byte estimate;
- reference count;
- last-used frame;
- empty-batch frame count;
- disposal state.

### Reference rules

- acquiring an existing request increments consumer count;
- completing a request acquires the resolved asset once per active placement consumer;
- placement release decrements its asset reference exactly once;
- placeholder and exact assets have independent references during replacement;
- batch existence does not add a separate placement reference;
- an asset remains resident while reference count is positive;
- negative reference counts are fatal errors.

### Deduplication

When two request keys decode to the same asset key:

- keep the first resolved asset entry;
- dispose newly created duplicate resources;
- point both request entries to the first asset;
- increment deduplication statistics.

### Memory estimation

CPU bytes:

```text
sum of raw payload typed-array byte lengths
+ JSON metadata UTF-8 byte length
```

GPU bytes:

```text
sum of geometry attribute and index byte lengths
+ 20 bytes per owned 5×1 RGBA8 gradient texture
+ batch capacity × 84 bytes for every active batch using the asset
```

Do not count shader programs because Three.js shares them outside this cache's ownership.

### Eviction

Trigger after upload, placement release, or empty-batch retirement when:

- total decoded bytes exceed profile byte budget; or
- dynamic entry count exceeds profile maximum.

Candidates require:

- reference count `0`;
- no active instances;
- not currently uploading;
- not already disposed.

Sort by:

1. last-used frame ascending;
2. asset key lexicographic ascending.

Evict until decoded bytes are at or below `budget × evictionTargetRatio` and dynamic count is within limit.

Disposal order:

1. remove and dispose empty batches;
2. dispose four geometries;
3. dispose four visible materials;
4. dispose depth and distance materials;
5. release CPU payload buffer and metadata references;
6. mark disposed;
7. remove asset entry.

Negative-cache entries keep only frozen error metadata. Keep at most configured maximum and evict oldest by last-used frame, then request key.

## Main-thread resource creation

`StoneRuntimeResourceFactory` creates resources from a validated payload.

For each LOD:

1. allocate new typed arrays of exact component type;
2. copy payload bytes;
3. create `THREE.BufferGeometry`;
4. create attributes with exact names and flags;
5. set index;
6. set supplied bounding box and sphere, then verify against computed values within epsilon;
7. create one `StoneStylizedMaterial` equivalent to the Phase 6 material payload;
8. patch it for Phase 8 instanced dither attributes;
9. create instanced custom depth and distance materials;
10. attach compact Phase 1–8 metadata.

Do not call `computeVertexNormals()`.

A failed upload disposes all resources already created for the payload.

Upload processing stops when either:

- profile upload-count maximum is reached; or
- elapsed time is at least profile upload budget.

Check time after every completed payload, not in the middle of one asset.

## Instanced visible-material patch

`StoneInstancedMaterialPatcher` patches the Phase 6/Phase 4 stylized material.

Required per-instance attributes:

```text
stoneInstanceCoverage       float
stoneInstanceInvert         float
stoneInstanceDitherPhase    vec2
stoneInstanceShadowEnabled  float
```

`stoneInstanceShadowEnabled` is declared in the visible vertex shader for consistent buffer layout but is unused by visible fragment colour.

Required varyings:

```glsl
varying float vStoneInstanceCoverage;
varying float vStoneInstanceInvert;
varying vec2 vStoneInstanceDitherPhase;
```

The fragment dither equation must match Phase 6 exactly, replacing uniforms with varyings.

Patch order:

1. call existing Phase 4 material `onBeforeCompile`;
2. do not apply the Phase 6 uniform dither patch;
3. inject Phase 8 attributes and varyings;
4. inject the Phase 6 Bayer helper;
5. inject discard before `<dithering_fragment>`.

Program cache key:

```text
<phase4OriginalKey>|stone-runtime-instanced:v1
```

Coverage `1` keeps all fragments. Coverage `0` discards all fragments.

## Instanced shadow materials

`StoneInstancedShadowMaterial` creates:

- one `THREE.MeshDepthMaterial` with `RGBADepthPacking`;
- one `THREE.MeshDistanceMaterial`.

Both support instancing and patch:

```text
stoneInstanceShadowEnabled
```

Pass one varying and discard fragments when value is below `0.5`.

Program cache keys:

```text
stone-runtime-depth:v1
stone-runtime-distance:v1
```

LOD3 visible batches use `castShadow = false` and do not require shadow materials at runtime, but the payload/resource tuple keeps four aligned slots with `null` for level 3.

## Instance batch layout

`StoneInstanceBatch` owns one `THREE.InstancedMesh` for one asset key and LOD level.

Slot data:

- `instanceMatrix`: 16 float32 values;
- coverage: one float32;
- invert: one float32;
- dither phase: two float32 values;
- shadow enabled: one float32.

Total is `84` bytes per capacity slot.

### Capacity

- start at `32`;
- grow by factor `2`;
- maximum `1024`;
- reject growth above maximum;
- replacement mesh copies active matrices and attributes exactly;
- replace old mesh in the runtime root at the same child index;
- old InstancedMesh does not dispose shared geometry or material.

### Packed slots

Maintain:

- dense slot array from `0` through `count - 1`;
- placement ID by slot;
- slot by placement ID.

Removal:

1. find removed slot;
2. copy last active slot into removed slot when different;
3. update moved placement mapping;
4. decrement count;
5. mark matrix and all attributes dirty.

Duplicate placement IDs are errors.

### Batch state

- `frustumCulled = false`;
- `receiveShadow = true`;
- `castShadow = level !== 3`;
- custom depth and distance materials assigned for levels 0–2;
- render order remains default;
- mesh transform is identity;
- runtime root carries origin translation.

An empty batch is removed after configured consecutive empty frames. Its shared asset remains cache-owned.

## Runtime LOD resolution

`StoneRuntimeLodResolver` ports Phase 6 projected-size and hysteresis equations exactly but stores state per placement record instead of per `StoneLodGroup`.

For every visible placement:

1. calculate world-space bounding-sphere centre from placement transform and LOD0 sphere;
2. scale radius by uniform scale;
3. calculate projected radius in pixels with Phase 6 equation;
4. update primary LOD with exact Phase 6 hysteresis;
5. calculate exact Phase 6 transition coverage;
6. calculate exact Phase 6 shadow level.

Dither phase derives from the asset's production fingerprint exactly as Phase 6, stored per placement because placeholder and exact assets may differ.

The placement is inserted into:

- one batch when not transitioning;
- two adjacent batches during transition.

No other batch may contain it.

## Visibility and culling

`StoneRuntimeVisibilityResolver` is allocation-free after construction.

### Distance

Use squared horizontal XZ distance from camera world position to placement world position.

Cull when greater than profile distance-cull squared.

### Frustum

Build one `THREE.Frustum` from camera projection and world matrix each update.

Use transformed LOD0 bounding sphere multiplied by configured radius scale.

Cull when sphere does not intersect frustum.

### Projected size

After passing distance and frustum checks, calculate projected radius.

Cull when below profile projected-radius threshold, except a proxy candidate may still render when its group projected radius passes proxy threshold.

### Maximum visible records

When more records pass than profile maximum:

1. sort by squared camera distance;
2. tie by placement ID;
3. retain the first configured maximum;
4. count the rest as projected-size culls for diagnostics.

Use preallocated arrays sized to profile maximum plus one chunk's maximum planned placements. Grow only when a new high-water mark exceeds capacity and record the growth.

## Dynamic placeholders

Exact dynamic placements immediately acquire:

- one library placeholder selected by the ordinary variant algorithm;
- one queued dynamic request using original placement seed.

When exact asset becomes ready:

- start transition time at the current runtime clock;
- placeholder coverage is `1 - t`;
- exact coverage is `t`;
- clamp `t = elapsed / 0.35`;
- use complementary dither inversion;
- retain normal LOD selection independently for each asset, but force both to the lower-detail of their two resolved primary levels during replacement to avoid four simultaneous visible batches;
- after `t = 1`, remove and release placeholder.

At most two asset representations are visible for one placement during replacement.

When exact generation fails terminally, retain placeholder permanently, mark placement degraded, and do not retry until it unloads and is loaded in a new runtime session.

## Proxy library and rules

### Proxy modes

Only:

```text
cluster
scree
```

Each mode has four variants per palette, producing `2 × 4 × 8 = 64` proxy entries.

### Canonical proxy geometry

Proxy assets are baked from LOD3 ordinary-library entries.

Cluster proxy:

- five members;
- normalized radius `3.2` metres;
- golden-angle positions;
- scale sequence `1.00, 0.88, 0.76, 0.70, 0.62`;
- archetype sequence `rounded-boulder`, `flat-ground-stone`, `weathered-block`, `squashed-pebble`, `wedge`.

Scree proxy:

- eight members;
- normalized ellipse length `8` metres and width `3` metres;
- sorted deterministic longitudinal coordinates;
- scale linearly from `0.72` to `0.42`;
- archetype sequence cycles `wedge`, `flat-ground-stone`, `squashed-pebble`, `weathered-block`.

Variant changes source library variant indices and fixed phase rotation only.

Merge transformed LOD3 geometry into one proxy geometry. Preserve semantic and material attributes. All members use the proxy palette.

### Runtime group eligibility

Group placements by:

```text
anchorCellX:anchorCellZ
```

Eligible when:

- mode is cluster or scree;
- surviving loaded member count is at least `4` and at most `10`;
- every member's scaled LOD0 height is at most `0.9` metres;
- all members use the same palette;
- no member is an exact dynamic placement;
- no member is currently in placeholder replacement.

### Proxy transform

- centre is the arithmetic mean of member world X, Y, and Z;
- horizontal principal axis is the normalized vector from first to last placement in placement-ID order for scree;
- cluster axis is geology strike reconstructed from the member yaw circular mean;
- yaw aligns proxy positive X to that axis;
- scale X and Z independently to match group world AABB extent, clamped to `[0.75, 1.35]` relative to canonical proxy bounds;
- scale Y uniformly by mean member scale, clamped to `[0.75, 1.25]`;
- proxy matrix is stored as a normal instance matrix.

### Proxy validation

Before use, require:

```text
relative AABB extent delta <= 0.18
centroid shift / max(group width, group depth) <= 0.10
```

When validation fails, render individuals at all distances.

### Proxy transition

Use group projected radius.

- individual state above `16` pixels;
- proxy state below `12` pixels;
- complementary transition from `12` through `16` pixels;
- proxy uses invert `1`, individuals use invert `0` with complementary coverage;
- individual members are forced to LOD3 during proxy transition;
- proxy never casts shadows;
- individual LOD3 never casts shadows.

Collision descriptors remain unchanged.

## Runtime registry and chunks

`StoneRuntimeChunk` stores one immutable `StoneChunkPlan` and registration cursor. It owns no geometry or material.

Registration:

- at most profile placement-registration count per update;
- add collision descriptor immediately;
- resolve asset request;
- register placement in `StoneRuntimeRegistry`;
- acquire placeholder or library request;
- queue exact request when needed.

Unload:

- release every placement asset reference;
- remove instances from all batches;
- remove collision descriptors;
- cancel pending consumers;
- remove proxy membership;
- dispose no shared asset directly.

`StoneRuntimeRegistry` stores mutable placement records keyed by placement ID. Records contain immutable placement recipe, current asset references, LOD state, visibility state, batch memberships, replacement state, and proxy group key.

No placement record is duplicated across chunks.

## WorldStoneRuntimeSystem

Constructor:

```ts
export class WorldStoneRuntimeSystem {
  constructor(
    scene: THREE.Scene,
    terrainField: TerrainField,
    worldConfig: Readonly<WorldConfig>,
    runtimeProfile: Readonly<RuntimeProfile>,
    placementConfig: Readonly<StonePlacementConfig>,
    runtimeConfig: Readonly<StoneRuntimeConfig>,
    dependencies: Readonly<StoneRuntimeGenerationDependencies>,
    exclusionProvider?: StonePlacementExclusionProvider,
  );

  initialize(): Promise<void>;

  update(
    camera: THREE.Camera,
    cameraWorldX: number,
    cameraWorldZ: number,
    viewportHeightPixels: number,
    elapsedSeconds: number,
  ): void;

  setWorldOrigin(originX: number, originZ: number): void;

  getStats(): Readonly<StoneRuntimeStatsSnapshot>;

  getCollisionIndex(): StoneCollisionIndex;

  dispose(): void;
}
```

### Initialization

1. validate world compatibility through Phase 7 config;
2. calculate dependency fingerprint;
3. initialize library loader;
4. validate committed library dependency fingerprint;
5. create worker pool when enabled;
6. create runtime root group and add to scene;
7. create planner, registry, cache, queue, batch manager, visibility resolver, and proxy resolver;
8. print one concise summary.

A missing or invalid library is a terminal initialization error when pre-baked library is enabled. Do not silently generate all ordinary assets dynamically.

### Chunk streaming

Use Phase 7 desktop or compact chunk radius and unload margin.

Target chunks and queue order match Phase 7 exactly.

Per update:

1. unload out-of-range chunks;
2. plan at most one missing chunk;
3. register placements within profile count;
4. refresh request priorities;
5. dispatch worker tasks;
6. process completed library/worker payloads within upload budget;
7. resolve proxy groups;
8. perform visibility and LOD resolution;
9. update instance batches;
10. retire empty batches;
11. enforce cache budgets;
12. update diagnostic accumulators.

### World origin

Instance matrices remain global.

Set runtime root position to:

```text
(-originX, 0, -originZ)
```

No placement, cache entry, batch slot, or proxy is regenerated.

### Disposal

1. stop updates;
2. cancel queued and in-flight requests;
3. terminate workers;
4. unload all chunks and release consumers;
5. clear collision index;
6. remove and dispose batches;
7. dispose all decoded cache assets;
8. release library buffers and manifest;
9. remove runtime root from scene;
10. tolerate repeated calls.

## WorldApp integration

`WorldApp.create` must load `stone-runtime.yaml` with existing stone configs.

When both placement and runtime are enabled:

- create `WorldStoneRuntimeSystem`;
- await only its library-manifest initialization, not individual assets;
- use it instead of Phase 7 `WorldStoneSystem`.

When runtime is disabled:

- create Phase 7 `WorldStoneSystem` exactly as specified in Phase 7.

Update, origin, stats, collision-index access, and disposal must be routed through one small interface shared by both systems.

Do not change terrain or grass initialization order beyond what is required to construct stones.

## Runtime fingerprints and metadata

Runtime asset metadata on every decoded geometry and material:

```ts
Object.freeze({
  configVersion: 1,
  cacheKeyVersion: 1,
  libraryVersion: 1,
  requestKey,
  assetKey,
  origin,
  dependencyFingerprint,
  payloadFingerprint,
});
```

Instance placement metadata is not stored on `InstancedMesh.userData` per slot. Registry records are the source of truth.

Batch `userData.stoneRuntimeBatch` contains only:

```ts
Object.freeze({
  assetKey,
  lodLevel,
  capacity,
});
```

Update capacity metadata when the batch grows.

## Runtime errors

`StoneRuntimeErrors.ts` must define:

```ts
export type StoneRuntimeErrorCode =
  | "INVALID_RUNTIME_CONFIG"
  | "DEPENDENCY_FINGERPRINT_FAILED"
  | "LIBRARY_MANIFEST_FAILED"
  | "LIBRARY_RANGE_FAILED"
  | "LIBRARY_PAYLOAD_FAILED"
  | "WORKER_INITIALIZATION_FAILED"
  | "WORKER_GENERATION_FAILED"
  | "WORKER_PROTOCOL_FAILED"
  | "GENERATION_QUEUE_FULL"
  | "ASSET_UPLOAD_FAILED"
  | "CACHE_REFERENCE_FAILED"
  | "CACHE_BUDGET_FAILED"
  | "BATCH_CAPACITY_EXCEEDED"
  | "BATCH_STATE_FAILED"
  | "INSTANCED_SHADER_PATCH_FAILED"
  | "PROXY_VALIDATION_FAILED"
  | "RUNTIME_INITIALIZATION_FAILED";

export class StoneRuntimeError extends Error {
  readonly code: StoneRuntimeErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- set name to `StoneRuntimeError`;
- freeze details;
- preserve unexpected errors as `cause`;
- include request key, asset key, placement ID, worker ID, or chunk when available;
- do not log in constructor.

## Statistics

`StoneRuntimeStats` uses mutable numeric counters internally and creates one frozen snapshot on request.

Draw-call estimate:

```text
number of visible non-empty InstancedMesh batches
+ number of visible proxy batches
```

Do not include shadow-map passes in this value. Expose a separate internal shadow-batch count for the benchmark report.

Visible triangles:

```text
sum(batch geometry triangle count × visible instance count)
```

Cache hit rate:

```text
hits / max(1, hits + misses)
```

Instance reuse rate:

```text
1 - activeBatchCount / max(1, activeInstanceCount)
```

Worker average uses completed worker tasks only.

Stats update interval controls HUD snapshots, not internal counters.

## Fixed runtime benchmark

`StoneRuntimeBenchmarkApp.ts` is selected with:

```text
?scene=stone-runtime-benchmark
```

Update scene union to include:

```ts
type SceneMode =
  | "world"
  | "island"
  | "stone-material-gallery"
  | "stone-lod-gallery"
  | "stone-placement-gallery"
  | "stone-runtime-benchmark";
```

### Benchmark population

Use a synthetic deterministic `64 × 64` placement grid for exactly `4096` placement records.

- grid spacing: `5` metres;
- centred at origin;
- archetype index: `(x + z * 3) mod 12`;
- palette index: `(x * 5 + z * 7) mod 8`;
- mode: cluster for rows divisible by `5`, scree for rows divisible by `7`, otherwise isolated;
- scale: `0.55 + hash01(x, z) * 0.75`;
- yaw: `hash01(z, x) * 2π`;
- height: zero;
- use library assets except forced exact landmark fixtures at the four corners.

Camera follows a fixed 20-second loop:

```text
(0, 24, 110)
(90, 32, 20)
(0, 55, -130)
(-100, 28, 0)
(0, 24, 110)
```

Use Catmull-Rom interpolation with fixed look-at origin.

### Renderer

- WebGL renderer;
- pixel ratio `1`;
- resolution `1600 × 900` desktop benchmark;
- resolution `960 × 540` compact benchmark;
- ACES tone mapping;
- sRGB output;
- one directional and one hemisphere light;
- shadows enabled;
- neutral ground;
- fog disabled;
- fixed camera FOV `48`.

### Report

After warmup, collect for configured duration:

- frame p50, p95, p99, maximum;
- draw-call p50 and maximum;
- visible triangles p50 and maximum;
- visible instances maximum;
- active batches maximum;
- worker task count and average;
- upload frame maximum;
- cache hit rate;
- instance reuse rate;
- cache bytes maximum;
- proxy visible count maximum;
- degraded count.

Expose report on `window.__STONE_RUNTIME_BENCHMARK__` and optionally download JSON when query `download=1`.

The browser report is the authority for frame-time budgets. SSR verification checks logic and structural budgets only.

## Verification scripts

### Library verifier

`verify-stone-library.mjs`:

- load committed manifest;
- validate schema and dependency fingerprint;
- validate binary header and size;
- validate binary fingerprint;
- decode the configured sample count distributed evenly across ordinary and proxy entries;
- reconstruct Three.js geometry for samples;
- verify fingerprints, attributes, bounds, and disposal;
- print entry counts, binary bytes, and library fingerprint.

Use `--full=1` to decode every entry. Default is sampled verification.

### Runtime verifier

`verify-stone-runtime.mjs` uses Vite SSR and calls exactly:

```ts
await verification.verifyStoneRuntime();
```

Prefix failures with:

```text
[stone-runtime]
```

Print one success line containing:

- simulated placement count;
- unique request keys;
- cache hit rate;
- instance reuse rate;
- maximum active batches;
- maximum simulated draw calls;
- maximum decoded bytes;
- proxy count;
- worker protocol fixture count.

Do not write benchmark files.

## Mandatory verification matrix

### Previous-phase compatibility

Run all Phase 1–7 verification scripts unchanged.

For fixed Phase 7 plans:

- planning output remains exact before and after importing Phase 8;
- placement recipes and fingerprints remain exact;
- direct Phase 7 world system remains constructible;
- direct Phase 6 generation remains exact.

### Configuration tests

Verify:

- committed YAML parses and freezes;
- missing, duplicate, and unknown keys fail;
- NaN fails;
- library count other than eight fails;
- exact mode flag mismatch fails;
- worker count above two fails;
- compact worker count above desktop fails;
- non-power-of-two batch capacity fails;
- stride other than eighty-four fails;
- proxy enter above exit fails;
- invalid relative library paths fail;
- cache target outside range fails;
- benchmark or verification threshold outside valid range fails.

### Fingerprint and request tests

For every archetype and palette:

- eight library seeds are deterministic and unique;
- variant mapping is deterministic;
- placement ID does not affect request key;
- transform and scale below threshold do not affect library key;
- scale above threshold switches to dynamic key;
- outcrop and landmark are dynamic;
- palette changes request key;
- dependency fingerprint changes request key;
- request key uses lowercase seed hex;
- asset key depends only on LOD-set fingerprint.

### Payload codec tests

For representative Phase 6 assets:

- encode-decode preserves all raw geometry bytes;
- level and attribute order exact;
- offsets aligned;
- padding zero;
- detail arrays exact;
- bounds exact;
- payload fingerprint deterministic;
- corrupted byte fails;
- overlapping range fails;
- unknown component type fails;
- decoded resources match direct Phase 6 arrays.

### Manifest and transport tests

Use a fake fetch provider:

- valid `206` range succeeds;
- invalid content range fails;
- `200` full-file fallback caches complete buffer;
- overlapping concurrent ranges merge once;
- excessive merged range stays separate;
- manifest duplicate key fails;
- wrong dependency fingerprint fails;
- wrong binary length or fingerprint fails;
- entry order mismatch fails.

### Worker protocol tests

Use a fake worker and one real worker-compatible module fixture:

- initialization handshake exact;
- dependency mismatch fails;
- one request per worker;
- transferred buffer received;
- typed generation failure not retried;
- unexpected crash retried once;
- second crash fails;
- queued cancellation prevents dispatch;
- in-flight cancellation discards late result;
- request-ID wrap skips active IDs;
- worker disposal terminates all workers.

### Queue tests

- priority tuple ordering exact;
- shared request uses best consumer priority;
- zero-consumer queued request removed;
- full queue rejects worst according to rule;
- in-flight request never evicted;
- tie breaks by request key;
- repeated operations deterministic.

### Cache tests

- concurrent identical requests create one load or generation;
- different request keys resolving same asset deduplicate resources;
- references increment and decrement exactly;
- referenced entry never evicts;
- zero-reference LRU order exact;
- asset-key tie break exact;
- byte and dynamic-entry limits enforced;
- eviction reaches target ratio;
- negative cache bounded;
- disposal calls each owned resource exactly once;
- repeated cache disposal tolerated;
- no negative reference count allowed.

### Batch tests

- capacity starts at thirty-two;
- growth doubles and preserves exact values;
- growth beyond 1024 fails;
- duplicate placement fails;
- swap-remove updates moved mapping;
- matrices and all four attributes remain aligned;
- empty retirement occurs at exact frame count;
- shared geometry and material are not disposed by batch retirement;
- draw-call estimate equals non-empty visible batch count.

### Shader tests

- all required anchors present;
- missing anchor throws typed error;
- Phase 4 shader patch runs first;
- Phase 6 Bayer matrix values and complement preserved;
- coverage zero and one edge cases correct;
- custom cache keys exact;
- shadow materials discard disabled instances;
- LOD3 does not cast shadows.

### Visibility and LOD parity

For fixed cameras and placements:

- projected radius equals Phase 6 helper;
- primary LOD and hysteresis equal `StoneLodSelector`;
- transition coverage equals Phase 6;
- one or two batch memberships only;
- shadow level exact;
- distance cull boundary exact;
- frustum sphere boundary deterministic;
- screen-size cull boundary exact;
- visibility maximum retains nearest placements with placement-ID tie break.

### Placeholder tests

- dynamic request acquires library placeholder immediately;
- exact completion starts 0.35-second transition;
- coverages complement;
- only two representations visible;
- exact completion releases placeholder at end;
- terminal dynamic failure retains placeholder and increments degraded count;
- unload during transition releases both assets.

### Proxy tests

- only cluster and scree groups eligible;
- member count and height limits exact;
- mixed palette rejects;
- dynamic member rejects;
- canonical proxy mapping deterministic;
- transform and AABB validation exact;
- proxy transition thresholds exact;
- individuals forced to LOD3 during transition;
- proxy and individual coverage complement;
- proxy never casts shadow;
- collision descriptors remain registered.

### Streaming and origin tests

Simulate repeated camera paths across chunk boundaries:

- chunk plan order matches Phase 7;
- registrations respect budget;
- unload releases all consumers and instances;
- adjacent chunk load order yields identical registry union;
- reload produces same request mapping;
- origin shift changes only root transform;
- instance matrices remain byte-identical after origin shift;
- collision results remain world-space stable;
- no placement appears twice.

### Structural performance simulation

Generate `2048` deterministic placement recipes without GPU rendering.

Require:

- unique request-key count meets configured minimum;
- cache hit rate meets minimum after unload/reload cycle;
- instance reuse rate meets minimum;
- active batch count does not exceed profile limit;
- decoded byte estimate stays within profile budget after eviction;
- queue never exceeds maximum;
- all placements either have an approved asset, active placeholder, or explicit degraded placeholder;
- no uncaught generation failure.

Record timings but do not make wall-clock values SSR pass/fail gates.

### Resource lifecycle tests

Using spies, verify:

- worker payload source Phase 6 assets disposed after encoding;
- upload failure disposes partial resources;
- cache dedup disposes duplicate resources;
- batch retirement preserves shared resources;
- cache eviction disposes shared resources only after all references release;
- chunk unload removes all batch slots;
- runtime disposal leaves no workers, batches, cache assets, or collision descriptors;
- repeated runtime disposal is safe.

## Implementation sequence

Implement in this exact order and keep TypeScript compiling after every step.

### Step 1 — Configuration, types, and fingerprints

Files:

- `stone-runtime.yaml`
- `StoneRuntimeTypes.ts`
- `StoneRuntimeConfig.ts`
- `StoneRuntimeConfigLoader.ts`
- `StoneRuntimeErrors.ts`
- `StoneRuntimeCatalog.ts`
- `StoneRuntimeFingerprint.ts`
- `StoneRuntimeRequestResolver.ts`

Checks:

- strict config passes;
- request and dependency fingerprints deterministic;
- library seed fixtures pass.

### Step 2 — Payload codec

Files:

- `StoneRuntimePayload.ts`
- `StoneRuntimePayloadCodec.ts`

Checks:

- direct Phase 6 assets round-trip exactly;
- corruption and alignment tests pass.

### Step 3 — Library format and baker

Files:

- `StoneLibraryManifest.ts`
- `scripts/bake-stone-library.mjs`
- generated manifest and binary.

Checks:

- all 832 entries generate;
- output deterministic;
- no duplicate request keys;
- every payload decodes.

### Step 4 — Library loader

File:

- `StoneLibraryLoader.ts`

Checks:

- range and full-file fixtures pass;
- dependency and payload validation complete.

### Step 5 — Worker protocol, worker, and pool

Files:

- `StoneRuntimeWorkerProtocol.ts`
- `StoneRuntimeGenerationWorker.ts`
- `StoneRuntimeWorkerPool.ts`

Checks:

- handshake and transfer pass;
- cancellation and crash retry pass;
- worker resources dispose.

### Step 6 — Queue and cache

Files:

- `StoneRuntimeGenerationQueue.ts`
- `StoneRuntimeAssetCache.ts`

Checks:

- priority deterministic;
- request and asset dedup pass;
- reference, eviction, and disposal tests pass.

### Step 7 — Resource factory and shaders

Files:

- `StoneRuntimeResourceFactory.ts`
- `StoneInstancedDitherShader.ts`
- `StoneInstancedShadowShader.ts`
- `StoneInstancedMaterialPatcher.ts`
- `StoneInstancedShadowMaterial.ts`

Checks:

- decoded resources equal direct Phase 6 data;
- visible and shadow shader source checks pass.

### Step 8 — Instance batches

Files:

- `StoneInstanceBatch.ts`
- `StoneInstanceBatchManager.ts`

Checks:

- packed slot and growth tests pass;
- empty retirement and ownership correct.

### Step 9 — Visibility, LOD, placeholders, and proxies

Files:

- `StoneRuntimeVisibilityResolver.ts`
- `StoneRuntimeLodResolver.ts`
- `StoneRuntimeProxyCatalog.ts`
- `StoneRuntimeProxyResolver.ts`

Checks:

- Phase 6 parity passes;
- culling boundaries pass;
- replacement and proxy transitions pass.

### Step 10 — Registry, chunks, and world runtime

Files:

- `StoneRuntimeChunk.ts`
- `StoneRuntimeRegistry.ts`
- `StoneRuntimeStats.ts`
- `WorldStoneRuntimeSystem.ts`
- `runtime/index.ts`

Checks:

- streaming and origin tests pass;
- collision descriptors stable;
- cache and batch lifecycle complete.

### Step 11 — World and benchmark integration

Files:

- `WorldApp.ts`
- `main.ts`
- `StoneRuntimeBenchmarkApp.ts`

Checks:

- rollback path uses Phase 7 system;
- optimized world starts asynchronously;
- benchmark report produced.

### Step 12 — Verification gates

Files:

- `StoneRuntimeVerification.ts`
- `verify-stone-library.mjs`
- `verify-stone-runtime.mjs`
- `package.json`

Commands:

```bash
npx tsc
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
npm run test:stone-lod
npm run test:stone-placement
npm run test:stone-library
npm run test:stone-runtime
npm run build
```

## Definition of done

Phase 8 is complete only when:

- all required source and generated files exist;
- all Phase 1–7 verifiers pass unchanged;
- the committed library contains exactly 768 ordinary and 64 proxy entries;
- library output is deterministic and dependency-fingerprint matched;
- ordinary placements map to exactly eight approved variants per archetype and palette;
- exact placements generate outside the main thread;
- concurrent requests deduplicate;
- decoded assets share geometry and material safely;
- instance batches preserve exact Phase 6 LOD and dither behavior;
- custom shadow materials enforce one shadow LOD per instance;
- distance, frustum, and screen-size culling work deterministically;
- cluster and scree proxies obey all eligibility and continuity limits;
- chunk unload and cache eviction release all resources correctly;
- origin rebasing does not rewrite or regenerate instance data;
- structural verification meets cache-hit and instance-reuse thresholds;
- decoded memory remains inside profile budgets after eviction;
- the browser benchmark meets desktop and compact draw-call, triangle, memory, frame-p95, and upload-frame budgets;
- rollback to Phase 7 runtime remains functional;
- no Phase 9 or Phase 10 authoring and rollout functionality is introduced.

## Required completion report

The implementation completion note must include:

- commit hash;
- files added and modified;
- generated manifest and binary sizes and fingerprints;
- ordinary and proxy library counts;
- dependency fingerprint;
- all verification commands and results;
- cache hit and deduplication rates;
- instance reuse rate;
- maximum active batches and estimated draw calls;
- maximum visible triangles;
- decoded CPU and GPU byte high-water marks;
- worker task count and average generation time;
- maximum main-thread upload time;
- placeholder and degraded placement counts;
- proxy eligibility and visible-proxy counts;
- desktop and compact browser benchmark summaries;
- confirmation that Phase 1–7 outputs and placement plans remained unchanged;
- confirmation that rollback mode uses the original Phase 7 system;
- confirmation that no authoring, export, persistence, or gameplay collision response was added.
