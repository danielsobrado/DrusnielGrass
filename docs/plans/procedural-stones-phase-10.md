# Procedural Stylized Stones — Phase 10 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Phase 3 contract: `docs/plans/procedural-stones-phase-3.md`
- Phase 4 contract: `docs/plans/procedural-stones-phase-4.md`
- Phase 5 contract: `docs/plans/procedural-stones-phase-5.md`
- Phase 6 contract: `docs/plans/procedural-stones-phase-6.md`
- Phase 7 contract: `docs/plans/procedural-stones-phase-7.md`
- Phase 8 contract: `docs/plans/procedural-stones-phase-8.md`
- Phase 9 contract: `docs/plans/procedural-stones-phase-9.md`
- Target branch: `main`
- Phase: 10 — QA, regression protection, rollout, and production hardening
- Document authority: final implementation and release contract
- Current state: completed
- Scope owner: deterministic snapshots, visual regression, fuzzing, streaming/origin stress, performance envelopes, configuration compatibility, rollout controls, rollback, CI automation, and release evidence

This document removes implementation choices from the final production-hardening phase. The implementer must follow the file layout, configuration values, regression cases, snapshot schemas, browser capture settings, pixel-comparison rules, fuzz ranges, streaming routes, performance gates, rollout stages, rollback behavior, CI jobs, baseline-update rules, release-report schema, and completion criteria below. Any different rollout policy, baseline set, fuzz population, visual threshold, performance threshold, migration policy, or release gate requires this document to be changed first.

## Phase objective

Prove that the complete Phase 1–9 stone system is deterministic, visually stable, structurally safe, performant, reversible, and ready for controlled production activation.

Phase 10 must deliver:

1. Immutable deterministic regression snapshots for core generation, production assets, LOD sets, placement, and runtime mapping.
2. Automated browser visual regression using a fixed Chromium software-rendering environment.
3. Explicit visual-baseline update tooling that can never update baselines during verification.
4. Fast build-time fuzz tests and a much larger explicit full-fuzz suite.
5. Configuration boundary and version-compatibility tests for every stone YAML domain.
6. Streaming, chunk-order, unload/reload, and floating-origin stress tests.
7. LOD movement and transition regression tests.
8. World baseline comparisons with stones disabled, Phase 7 reference rendering, and Phase 8 optimized rendering.
9. Performance-envelope verification using the Phase 8 budgets without weakening them.
10. One rollout configuration above the Phase 7/8 systems with an immediate stones-off rollback path.
11. Exact staged biome activation rules.
12. Graceful failure behavior that never prevents the world from starting when stones fail to initialize.
13. CI jobs for pull requests and scheduled full hardening.
14. A deterministic release-readiness report containing all machine-verifiable evidence.
15. A manual approval checklist for visual and hardware-dependent checks that cannot be made portable in CI.

Phase 10 must not improve art by changing the generator. If a regression test exposes a genuine Phase 1–9 defect, fix that defect under its owning phase contract and update the appropriate specification before changing a Phase 10 baseline.

## Required dependency state

Phase 10 starts only when all previous phase implementation gates pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run test:stone-quality
npm run test:stone-lod
npm run test:stone-placement
npm run test:stone-library
npm run test:stone-runtime
npm run test:stone-authoring
```

The committed Phase 8 stone library must exist and pass validation:

```text
public/assets/stones/stone-library-v1.manifest.json
public/assets/stones/stone-library-v1.bin
```

Phase 10 consumes every public Phase 1–9 generator, loader, fingerprint, placement, LOD, runtime, authoring, and QA contract without replacing them.

Versions from Phase 1–9 remain unchanged.

Phase 10 introduces:

- hardening config version: `1`;
- rollout policy version: `1`;
- deterministic snapshot version: `1`;
- visual regression manifest version: `1`;
- release report version: `1`.

## Compatibility contract

Phase 10 is additive except for the explicit production rollout gate.

The following must remain unchanged when called directly:

- every Phase 1–9 generator output;
- every Phase 1–9 fingerprint;
- Phase 7 chunk plans and placement IDs;
- Phase 8 library mapping and cache keys;
- Phase 8 runtime asset payloads;
- Phase 9 authoring state and export formats;
- terrain generation and grass behavior;
- island scene behavior;
- all previous gallery, benchmark, and bench scenes.

The rollout layer decides only whether a planned stone biome is rendered and whether the Phase 7 reference or Phase 8 optimized renderer is used. It must not alter placement recipes, geometry, material, LOD, collision, cache identity, or quality decisions.

With rollout disabled, the world must behave as it did before procedural stones were activated.

## Frozen architectural decisions

1. Phase 10 does not tune Phase 1–9 artistic or numeric generation values.
2. Regression baselines are committed files and are changed only by explicit update commands.
3. Verification scripts never create, replace, or modify baseline files.
4. Deterministic numeric snapshots are the primary cross-platform contract.
5. Visual pixel regression is run in one pinned Playwright Chromium environment using SwiftShader.
6. Visual regression is not exact-byte PNG comparison.
7. Visual comparison uses fixed RGB error metrics defined below.
8. Baseline PNGs remain human-reviewable artifacts.
9. Browser captures use a dedicated non-animated `stone-regression` scene.
10. Visual regression uses pixel ratio `1`, fixed render size, fixed camera, fixed lighting, fixed tone mapping, and `preserveDrawingBuffer`.
11. Pull-request CI runs fast fuzzing but not the complete 49,152-case fuzz suite.
12. Full fuzz runs explicitly and in the scheduled hardening job.
13. Full fuzz is deterministic and resumable by archetype index but its canonical complete result always covers the entire defined population.
14. Performance frame-time gates are never enforced under SwiftShader.
15. CI still enforces structural performance budgets: draw calls, triangles, memory, cache reuse, visibility counts, and upload limits.
16. Real frame-time gates are enforced by an explicit hardware benchmark command using the Phase 8 desktop/compact budgets.
17. No Phase 8 performance threshold may be increased in Phase 10 merely to make tests pass.
18. Phase 10 introduces no automatic performance threshold tuning.
19. All current stone configuration domains remain schema version `1`.
20. Phase 10 implements no speculative migration from v1 to v2.
21. Unsupported past or future schema versions fail loudly and deterministically.
22. Version migration becomes mandatory only when a real v2 schema is introduced in a future change.
23. Rollout is controlled by one strict `stone-rollout.yaml` file.
24. The committed initial rollout state is master-disabled at stage `0`.
25. The same implementation commit must not silently enable production stones.
26. Production activation is a later configuration-only change after QA evidence is approved.
27. Rollout stages are cumulative and have fixed biome membership.
28. A master disable overrides every stage and biome switch.
29. A per-biome emergency switch may disable a biome inside an otherwise enabled stage.
30. Optimized Phase 8 runtime is the production renderer.
31. Phase 7 reference rendering exists only for QA comparison and emergency diagnostic use, not automatic fallback.
32. If optimized stone runtime initialization fails, the world continues with stones disabled.
33. A stone-system failure must never make `WorldApp.create` fail after terrain and controls can otherwise start.
34. Collision descriptors are disabled together with a disabled stone placement; invisible disabled rollout stones must not keep collision.
35. Development-only URL overrides are allowed only when `import.meta.env.DEV` is true.
36. Production builds ignore rollout query overrides.
37. CI uses Playwright only for regression capture and browser functional QA.
38. Phase 10 adds exactly one new dev dependency: `playwright` pinned to `1.55.0`.
39. Do not add Jest, Vitest, Mocha, image-diff packages, PNG-decoding packages, or a second browser automation library.
40. Visual comparison is executed inside the browser using Canvas 2D pixel data.
41. CI browser launch uses Chromium with SwiftShader.
42. Full hardware benchmarks are separate from browser visual CI.
43. QA output under `qa-runs/` is disposable and is not used as an input baseline.
44. Baselines under `qa/baselines/stones/` are committed inputs.
45. Every baseline update records a manifest fingerprint and case fingerprint.
46. Baseline update commands require the explicit `--accept` flag.
47. No baseline updater runs from `npm run build`.
48. Release reporting never changes configuration or baselines.
49. The release report fails when any machine-verifiable mandatory gate is missing or failed.
50. Manual approval fields remain explicitly `pending` until a human edits the approval JSON.
51. Phase 10 does not fake visual or hardware approval.
52. Rollback requires changing only the rollout master switch to `false` and redeploying.
53. Phase 10 adds no production runtime dependency.
54. Phase 10 does not add save-game migrations, network replication, telemetry upload, or remote feature-flag services.

## In scope

- rollout and hardening configuration;
- deterministic snapshot manifest and validation;
- snapshot update script;
- regression-browser scene;
- Playwright capture harness;
- committed visual baselines;
- visual comparison metrics;
- transition/movement captures;
- fast and full fuzz suites;
- configuration mutation and version tests;
- streaming and floating-origin stress;
- world-mode A/B metrics;
- Phase 8 performance-contract enforcement;
- local hardware benchmark evidence;
- rollout policy and biome-stage gating;
- graceful runtime failure fallback to no stones;
- PR and scheduled CI workflows;
- release report generation;
- manual approval schema;
- rollback verification.

## Explicitly out of scope

Do not implement:

- new stone archetypes;
- new palettes;
- generator tuning;
- new LOD levels;
- new placement modes;
- new biome classification rules;
- different Phase 8 library variants;
- new runtime caching algorithms;
- WebGPU-specific rendering;
- automatic baseline approval;
- AI-based image comparison;
- cloud screenshot services;
- external telemetry systems;
- remote kill-switch services;
- A/B user analytics;
- production percentages by user identity;
- live server configuration;
- database-backed rollout state;
- automatic GitHub commits;
- automatic release deployment;
- save migration;
- network synchronization.

## Required file changes

### New configuration

Create:

```text
public/config/stone-rollout.yaml
```

### New hardening source files

Create exactly:

```text
src/stones/hardening/StoneHardeningTypes.ts
src/stones/hardening/StoneRolloutConfig.ts
src/stones/hardening/StoneRolloutConfigLoader.ts
src/stones/hardening/StoneRolloutErrors.ts
src/stones/hardening/StoneRolloutPolicy.ts
src/stones/hardening/StoneConfigVersionRegistry.ts
src/stones/hardening/StoneRegressionCatalog.ts
src/stones/hardening/StoneDeterminismSnapshot.ts
src/stones/hardening/StoneDeterminismSnapshotVerifier.ts
src/stones/hardening/StoneFuzzCaseResolver.ts
src/stones/hardening/StoneFuzzRunner.ts
src/stones/hardening/StoneStreamingStress.ts
src/stones/hardening/StoneWorldBaseline.ts
src/stones/hardening/StonePerformanceGate.ts
src/stones/hardening/StoneVisualRegressionManifest.ts
src/stones/hardening/StoneReleaseApproval.ts
src/stones/hardening/StoneReleaseReport.ts
src/stones/hardening/index.ts
```

### New QA and browser files

Create exactly:

```text
src/app/StoneRegressionApp.ts
src/stones/qa/StoneHardeningVerification.ts
src/stones/qa/StoneRegressionBrowserBridge.ts
```

### New scripts

Create exactly:

```text
scripts/verify-stone-hardening.mjs
scripts/verify-stone-fuzz.mjs
scripts/verify-stone-visual.mjs
scripts/update-stone-snapshots.mjs
scripts/update-stone-visual-baselines.mjs
scripts/verify-stone-world-regression.mjs
scripts/benchmark-stone-production.mjs
scripts/report-stone-release.mjs
```

### New committed baseline files

Generate and commit:

```text
qa/baselines/stones/stone-determinism-v1.json
qa/baselines/stones/stone-visual-v1.manifest.json
qa/baselines/stones/visual/*.png
qa/baselines/stones/stone-release-approval-v1.json
```

The PNG file names are defined by the visual case IDs below.

### New CI workflow

Create:

```text
.github/workflows/stone-production-qa.yml
```

### Existing files to modify

Modify only these existing production/project files:

```text
src/app/WorldApp.ts
src/main.ts
package.json
package-lock.json
```

Do not modify Phase 1–9 stone source or YAML values unless an actual defect is discovered and the owning phase contract is updated first.

## Package dependency

Add exactly:

```json
"playwright": "1.55.0"
```

under `devDependencies`.

No other dependency may be added by Phase 10.

## Package scripts

Add exactly:

```json
"test:stone-hardening": "node scripts/verify-stone-hardening.mjs",
"test:stone-fuzz": "node scripts/verify-stone-fuzz.mjs --mode smoke",
"test:stone-fuzz:full": "node scripts/verify-stone-fuzz.mjs --mode full",
"test:stone-visual": "node scripts/verify-stone-visual.mjs",
"test:stone-world-regression": "node scripts/verify-stone-world-regression.mjs",
"update:stone-snapshots": "node scripts/update-stone-snapshots.mjs --accept",
"update:stone-visual-baselines": "node scripts/update-stone-visual-baselines.mjs --accept",
"qa:stone-performance": "node scripts/benchmark-stone-production.mjs",
"report:stone-release": "node scripts/report-stone-release.mjs"
```

The normal build adds only the portable hardening verifier after Phase 9:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-stone-quality.mjs && node scripts/verify-stone-lod.mjs && node scripts/verify-stone-placement.mjs && node scripts/verify-stone-library.mjs && node scripts/verify-stone-runtime.mjs && node scripts/verify-stone-authoring.mjs && node scripts/verify-stone-hardening.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Playwright visual tests are CI/release gates but are not part of ordinary `npm run build`.

## Rollout configuration

Create `public/config/stone-rollout.yaml` with exactly:

```yaml
# Phase 10 versions
stoneRolloutConfigVersion: 1
stoneRolloutPolicyVersion: 1
stoneRolloutSnapshotVersion: 1
stoneRolloutVisualManifestVersion: 1
stoneRolloutReleaseReportVersion: 1

# Production rollout state
stoneRolloutMasterEnabled: false
stoneRolloutStage: 0
stoneRolloutRenderer: optimized
stoneRolloutRuntimeFailurePolicy: disable-stones
stoneRolloutAllowDevelopmentQueryOverride: true

# Emergency biome switches
stoneRolloutMeadowEnabled: true
stoneRolloutUplandEnabled: true
stoneRolloutMountainEnabled: true
stoneRolloutScreeEnabled: true
stoneRolloutCoastEnabled: true
stoneRolloutRiverbankEnabled: true
stoneRolloutPathsideEnabled: true

# Deterministic regression sizes
stoneRolloutSnapshotProductionSeedCount: 4
stoneRolloutSnapshotPlacementWorldSeedCount: 4
stoneRolloutFuzzSmokeSeedCount: 64
stoneRolloutFuzzFullSeedCount: 4096
stoneRolloutStreamingWorldSeedCount: 3

# Visual regression
stoneRolloutVisualWidth: 512
stoneRolloutVisualHeight: 512
stoneRolloutVisualPixelRatio: 1
stoneRolloutVisualRgbThreshold: 12
stoneRolloutVisualMismatchRatioMaximum: 0.015
stoneRolloutVisualMeanAbsoluteErrorMaximum: 1.5
stoneRolloutVisualP99ChannelErrorMaximum: 24

# World comparison
stoneRolloutWorldRegressionWarmupSeconds: 4
stoneRolloutWorldRegressionDurationSeconds: 20
stoneRolloutWorldFrameP95DeltaMaximumDesktopMs: 4
stoneRolloutWorldFrameP95DeltaMaximumCompactMs: 7
stoneRolloutWorldDrawCallDeltaMaximumDesktop: 220
stoneRolloutWorldDrawCallDeltaMaximumCompact: 120

# Release requirements
stoneRolloutRequireVisualApproval: true
stoneRolloutRequireDesktopPerformanceApproval: true
stoneRolloutRequireCompactPerformanceApproval: true
stoneRolloutRequireFullFuzzApproval: true
stoneRolloutRequireRollbackVerification: true
```

### Rollout configuration validation

`StoneRolloutConfigLoader` must:

- expose `load(url = "./config/stone-rollout.yaml")`;
- expose public `parse(source: string)`;
- use `FlatConfig`;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- return recursively frozen values;
- reject non-finite values;
- reject non-integer integer fields;
- identify the invalid key or relationship.

Validate exactly:

1. All five versions equal `1`.
2. Stage is an integer from `0` through `3`.
3. Renderer is exactly `optimized` or `reference`.
4. Runtime failure policy is exactly `disable-stones`.
5. Snapshot and fuzz counts are positive integers.
6. Snapshot production seed count equals `4`.
7. Fuzz smoke count equals `64`.
8. Fuzz full count equals `4096`.
9. Streaming world seed count equals `3`.
10. Visual width and height equal `512`.
11. Visual pixel ratio equals `1`.
12. RGB threshold is an integer from `1` through `64`.
13. Mismatch ratio is greater than `0` and at most `0.1`.
14. Mean error is greater than `0` and at most `10`.
15. P99 error is greater than RGB threshold and at most `128`.
16. World warmup and duration are positive.
17. Frame-delta maxima are positive.
18. Draw-call delta maxima are positive integers.
19. All release requirement values are booleans.
20. Every canonical Phase 7 biome has exactly one emergency boolean.

## Rollout stages

`StoneRolloutPolicy` uses these exact cumulative stage memberships:

| Stage | Enabled biomes before emergency mask |
| --- | --- |
| `0` | none |
| `1` | `meadow`, `pathside` |
| `2` | stage 1 plus `upland`, `coast`, `riverbank` |
| `3` | stage 2 plus `mountain`, `scree` |

Resolution order:

1. If master enabled is false, every biome is disabled.
2. Resolve stage membership.
3. Apply emergency per-biome boolean.
4. Return final enabled/disabled decision.

API:

```ts
export interface StoneRolloutDecision {
  readonly masterEnabled: boolean;
  readonly stage: 0 | 1 | 2 | 3;
  readonly renderer: "optimized" | "reference";
  readonly enabledBiomes: readonly StoneBiomeId[];
  readonly disabledBiomes: readonly StoneBiomeId[];
}

export class StoneRolloutPolicy {
  constructor(config: Readonly<StoneRolloutConfig>);
  resolve(): Readonly<StoneRolloutDecision>;
  isBiomeEnabled(biomeId: StoneBiomeId): boolean;
}
```

Canonical biome order is always `STONE_BIOME_IDS`.

### Development query override

Only when both are true:

```text
import.meta.env.DEV === true
stoneRolloutAllowDevelopmentQueryOverride === true
```

accept:

```text
?stones=off
?stones=reference
?stones=optimized
?stoneStage=0|1|2|3
```

Rules:

- `stones=off` forces master disabled.
- `reference` forces master enabled and renderer `reference`.
- `optimized` forces master enabled and renderer `optimized`.
- `stoneStage` replaces stage only when master is enabled by committed config or `stones` override.
- invalid values are ignored and reported once to the development console by `WorldApp`, not by pure policy code.
- production builds ignore all four query parameters.

## World integration and rollback

`WorldApp` loads rollout configuration after world configuration and before creating a stone runtime.

Sequence:

1. Load and validate `stone-rollout.yaml`.
2. Resolve rollout decision.
3. When no biome can render, do not construct Phase 7 or Phase 8 stone runtime.
4. When renderer is `reference`, construct the Phase 7 `WorldStoneSystem` with a rollout-aware placement filter.
5. When renderer is `optimized`, construct Phase 8 `WorldStoneRuntimeSystem` with the same rollout-aware placement filter.
6. The filter removes disabled-biome placements before visual registration and collision registration.
7. Existing placement recipes remain unchanged when planned directly for QA.
8. Runtime initialization is inside a stone-specific `try/catch`.
9. On runtime initialization failure, log one error and continue world initialization with no stones.
10. A failure must not disable terrain, grass, controls, renderer, or HUD.
11. `dispose()` disposes the active stone system when present.

Rollback procedure is exactly:

```yaml
stoneRolloutMasterEnabled: false
```

No library rebuild, cache-version change, or code rollback is required.

The hardening verifier must prove that master-disabled world startup does not instantiate a stone worker, asset cache, stone chunk planner, or stone scene group.

## Configuration version registry

`StoneConfigVersionRegistry.ts` lists these domains in exact order:

```text
core
archetypes
details
materials
quality
lod
placement
runtime
authoring
rollout
```

Current version for every domain is `1`.

For each domain, the registry stores:

- file path;
- current schema version key;
- current version;
- loader factory name.

Phase 10 migration policy:

- version `1`: parse normally;
- missing version: reject;
- version `0`: reject as unsupported legacy schema;
- version `2` or larger: reject as unsupported future schema;
- negative or non-integer version: reject as invalid schema version.

Do not add a migration function that simply relabels versions.

## Deterministic snapshot baseline

Create `qa/baselines/stones/stone-determinism-v1.json` through the update script only.

Schema:

```ts
export interface StoneDeterminismBaseline {
  readonly version: 1;
  readonly dependencyFingerprint: string;
  readonly coreCases: readonly StoneCoreSnapshotCase[];
  readonly productionCases: readonly StoneProductionSnapshotCase[];
  readonly placementCases: readonly StonePlacementSnapshotCase[];
  readonly runtimeCases: readonly StoneRuntimeSnapshotCase[];
  readonly baselineFingerprint: string;
}
```

### Core snapshot cases

Use exactly these six seeds:

```text
0
1
42
1337
0xdeadbeef
0xffffffff
```

Store:

- seed;
- core recipe JSON fingerprint;
- geometry fingerprint;
- rendered vertex count;
- triangle count;
- quantized width, height, depth, volume, footprint area;
- validation issue count.

### Production snapshot cases

Use every archetype and these four requested seeds:

```text
0
42
1337
0xffffffff
```

This creates `48` cases.

Palette index:

```text
(archetypeIndex + seedSlot * 3) mod 8
```

Store:

- archetype ID;
- requested seed;
- palette ID;
- effective seed;
- quality candidate index and kind;
- production fingerprint;
- quality fingerprint;
- Phase 4 material-asset fingerprint;
- Phase 6 LOD-set fingerprint;
- quality score quantized to `0.000001`;
- LOD0–LOD3 triangle counts;
- LOD0 width/height/depth quantized to `0.000001`;
- retained surface-detail counts per LOD;
- semantic-region counts per LOD.

### Placement snapshot cases

Use world seeds:

```text
1
42
42017
0xdeadbeef
```

and chunk coordinates in this exact order:

```text
(0, 0)
(1, 0)
(0, 1)
(-1, 0)
(0, -1)
(1, 1)
(-1, 1)
(1, -1)
(-1, -1)
```

This creates `36` placement cases.

Store:

- world seed;
- chunk coordinates;
- chunk fingerprint;
- placement count;
- sorted placement IDs;
- sorted placement fingerprints.

### Runtime snapshot cases

For the same `48` production archetype/seed/palette triples, resolve Phase 8 request identity for one synthetic ordinary placement:

```text
placementId = snapshot:<archetypeIndex>:<seedSlot>
mode = isolated
uniformScale = 1
```

Store:

- request key;
- origin;
- library variant index;
- resolved library seed when applicable;
- dependency fingerprint.

### Snapshot comparison

`verify-stone-hardening.mjs` regenerates the complete structure and requires deep equality after canonical JSON serialization.

No tolerance is applied to fingerprints or integer counts.

All floating values are quantized before serialization.

A snapshot mismatch is a build failure and prints the first twenty JSON-pointer differences.

## Snapshot update command

`scripts/update-stone-snapshots.mjs`:

- refuses to run without `--accept`;
- loads every committed stone config;
- runs every previous stone verifier before writing;
- generates the full deterministic snapshot;
- writes UTF-8 JSON with two-space indentation and final newline;
- writes atomically through a sibling temporary file and rename;
- prints old and new baseline fingerprints when replacing an existing baseline;
- never edits any YAML file.

## Fast fuzz suite

Smoke fuzz uses:

```text
12 archetypes × seeds 0..63 = 768 requested production cases
```

Palette index:

```text
(seed + archetypeIndex * 5) mod 8
```

For every case:

- Phase 5 production generation succeeds;
- Phase 6 LOD generation succeeds;
- no quality errors exist;
- all geometry values are finite;
- all four LODs validate;
- every LOD has exact ground contact;
- all continuity checks pass;
- every material palette is valid;
- all fingerprints are sixteen lowercase hexadecimal digits;
- generation terminates within fixed retry limits;
- all created resources are disposed.

Smoke fuzz is called by `test:stone-hardening`.

## Full fuzz suite

Full fuzz uses:

```text
12 archetypes × seeds 0..4095 = 49,152 requested production cases
```

Palette index uses the same formula as smoke fuzz.

The complete run must report:

- total cases;
- successful cases;
- primary quality acceptance count;
- reroll count;
- canonical fallback count;
- per-archetype failure count;
- maximum archetype attempts;
- maximum detail attempts;
- maximum quality candidate index;
- minimum quality score;
- maximum LOD continuity deltas;
- unique production fingerprint count;
- unique LOD-set fingerprint count;
- elapsed wall time for diagnostics only.

Hard requirements:

- successful cases exactly `49,152`;
- terminal generation failures exactly `0`;
- invalid LOD sets exactly `0`;
- non-finite metrics exactly `0`;
- resource-leak spy failures exactly `0`.

The script accepts optional:

```text
--archetype <canonical-id>
```

for diagnosis, but the release gate accepts only a complete all-archetype report.

## Configuration mutation suite

For every configuration domain, construct mutations in memory and require deterministic rejection of:

1. missing version key;
2. version `0`;
3. version `2`;
4. version `-1`;
5. version `1.5`;
6. one removed required key;
7. one duplicated required key;
8. one unknown key;
9. one numeric key replaced by `NaN`;
10. one numeric key replaced by `Infinity`;
11. one boolean replaced by `yes`;
12. one representative cross-field violation defined by that phase contract.

Use the first canonical scalar key after the version section for generic numeric/boolean mutation when applicable.

The Phase 10 suite must not duplicate every earlier loader test; it proves consistent schema/version behavior across the complete configuration set.

## Streaming and floating-origin stress

Use exact world seeds:

```text
1
42017
0xdeadbeef
```

Use this exact camera/chunk route in world XZ metres:

```text
(0, 0)
(63.5, 0)
(64.5, 0)
(127.5, 63.5)
(128.5, 64.5)
(255.5, 255.5)
(256.5, 256.5)
(-63.5, 255.5)
(-64.5, 255.5)
(-255.5, -255.5)
(-256.5, -256.5)
(0, 0)
```

At every route point:

- update chunk targets until queues are drained using deterministic synthetic frames;
- record loaded chunk keys;
- record sorted placement IDs;
- record collision IDs;
- record runtime request keys;
- record asset reference counts.

Apply world origins in this exact sequence during the same logical route:

```text
(0, 0)
(256, 0)
(256, 256)
(-256, 256)
(-256, -256)
(0, 0)
```

Requirements:

- world-space placement recipes never change;
- placement IDs never duplicate;
- collision IDs equal visible/registered placement ownership expectations;
- unloading and returning to `(0,0)` reproduces the initial chunk fingerprints;
- runtime request keys for the same placement are identical after reload;
- origin changes do not alter placement or asset fingerprints;
- instance world transforms reconstructed from root origin plus local matrix remain equal within `0.00001` metres;
- no positive cache reference remains after complete disposal.

## LOD movement regression

Use one stone:

```text
archetype = weathered-block
seed = 42
palette = sandstone
```

Feed projected radii through this exact sequence:

```text
160, 139, 138, 121, 120, 103, 102, 90,
60, 57, 56, 49, 48, 41, 40, 34,
24, 23, 22, 19, 18, 15, 14, 10,
14, 15, 18, 19, 22, 23, 40, 41,
48, 49, 56, 57, 102, 103, 120, 121,
138, 139, 160
```

For every sample store and verify:

- primary LOD;
- high and low levels;
- high and low coverage;
- transitioning flag;
- shadow level.

Requirements:

- adjacent-level rule is never violated;
- transition coverage sums to one within `0.000001`;
- primary hysteresis follows Phase 6 exactly;
- shadow level never equals LOD3;
- no one-step jump crosses more than one primary LOD;
- repeating the sequence produces exact state equality.

## Visual regression scene

Add scene:

```text
?scene=stone-regression&case=<case-id>
```

`StoneRegressionApp` must be dynamically imported only for this scene.

Renderer settings are fixed:

```text
width = 512
height = 512
pixelRatio = 1
antialias = false
alpha = false
precision = highp
preserveDrawingBuffer = true
outputColorSpace = sRGB
toneMapping = ACESFilmicToneMapping
toneMappingExposure = 1
shadowMap.enabled = true
shadowMap.type = PCFShadowMap
```

Use:

- fixed perspective FOV `42`;
- camera near `0.05`;
- camera far `1000`;
- fixed neutral background `#b7c0c7`;
- directional light intensity `3` at normalized direction `(0.45, 0.78, 0.43)`;
- hemisphere light intensity `1.4`;
- neutral ground `#747474` when the case requires ground;
- no animation;
- no time-dependent shader values;
- no stats UI;
- no authoring overlays;
- no text inside the captured canvas.

The app exposes only in development/QA scene scope:

```ts
window.__STONE_REGRESSION__ = {
  ready: Promise<void>,
  getCaseId(): string,
  getCaseFingerprint(): string,
  getCanvas(): HTMLCanvasElement,
};
```

No bridge exists in normal world mode.

## Canonical visual cases

Use these exact case IDs and definitions.

### Archetype closeups — 12

Use each archetype's first Phase 3 gallery seed and palette by archetype index modulo eight:

```text
arch-rounded-boulder
arch-squashed-pebble
arch-flat-ground-stone
arch-broad-slab
arch-weathered-block
arch-tapered-block
arch-wedge
arch-leaning-shard
arch-tall-monolith
arch-triangular-peak
arch-broad-platform
arch-tapered-pillar
```

Render LOD0 on neutral ground with three-quarter camera.

### Palette closeups — 8

Use:

```text
archetype = rounded-boulder
seed = 42
```

IDs:

```text
palette-slate
palette-limestone
palette-sandstone
palette-volcanic
palette-moss-tinted
palette-mineral-blue
palette-weathered-teal
palette-fantasy-amethyst
```

### Static LODs — 4

Use:

```text
archetype = weathered-block
seed = 42
palette = sandstone
```

IDs:

```text
lod-static-0
lod-static-1
lod-static-2
lod-static-3
```

### LOD transition captures — 9

Use the same stone and force exact projected radii:

```text
transition-01-high  radius 138
transition-01-mid   radius 120
transition-01-low   radius 102
transition-12-high  radius 56
transition-12-mid   radius 48
transition-12-low   radius 40
transition-23-high  radius 22
transition-23-mid   radius 18
transition-23-low   radius 14
```

### Biome population captures — 7

Use world seed `42017` and the fixed Phase 7 biome gallery tile for each biome:

```text
biome-meadow
biome-upland
biome-mountain
biome-scree
biome-coast
biome-riverbank
biome-pathside
```

All rollout biomes are forced enabled inside the regression app independently of committed production rollout stage.

Total visual baseline count is exactly `40`.

## Visual manifest

`qa/baselines/stones/stone-visual-v1.manifest.json` contains:

```ts
export interface StoneVisualBaselineCase {
  readonly id: string;
  readonly file: string;
  readonly width: 512;
  readonly height: 512;
  readonly caseFingerprint: string;
  readonly baselinePngSha256: string;
}

export interface StoneVisualBaselineManifest {
  readonly version: 1;
  readonly chromiumRevision: string;
  readonly dependencyFingerprint: string;
  readonly cases: readonly StoneVisualBaselineCase[];
  readonly manifestFingerprint: string;
}
```

Cases are stored in the canonical order above.

PNG path:

```text
qa/baselines/stones/visual/<case-id>.png
```

## Browser launch contract

Both visual update and verification scripts launch Playwright Chromium with exactly these additional arguments:

```text
--use-angle=swiftshader
--enable-webgl
--ignore-gpu-blocklist
--disable-background-timer-throttling
--disable-renderer-backgrounding
```

Use:

```text
viewport = 512 × 512
deviceScaleFactor = 1
colorScheme = light
locale = en-US
timezoneId = UTC
reducedMotion = reduce
```

The script starts Vite programmatically on loopback with an ephemeral available port.

Wait for `window.__STONE_REGRESSION__.ready` and then wait two animation frames before capture.

## Pixel comparison

Verification reads the committed baseline PNG as base64 and passes it into the browser.

Inside the page:

1. draw baseline PNG to a 512×512 Canvas 2D buffer;
2. draw the regression WebGL canvas to a second 512×512 Canvas 2D buffer;
3. read both through `getImageData`;
4. compare RGB only;
5. ignore alpha;
6. for each pixel calculate maximum channel absolute difference;
7. count a mismatch when maximum channel error is greater than `12`;
8. calculate mean absolute RGB channel error across all RGB samples;
9. sort per-pixel maximum-channel errors and take nearest-rank p99.

A case passes only when all are true:

```text
mismatchRatio <= 0.015
meanAbsoluteError <= 1.5
p99ChannelError <= 24
```

On failure, write diagnostic current PNG and JSON metrics only under:

```text
qa-runs/stone-visual/<case-id>/
```

Do not overwrite the baseline.

## Visual baseline update

`scripts/update-stone-visual-baselines.mjs`:

- refuses to run without `--accept`;
- runs `npm run test:stone-hardening` first;
- captures all 40 cases using the exact browser contract;
- writes every PNG atomically;
- computes SHA-256 for PNG files using Node `crypto`;
- writes the manifest atomically;
- prints previous and new manifest fingerprints;
- never changes rollout YAML;
- never changes deterministic numeric snapshots.

A baseline update must be reviewed as image changes in the pull request. It is never an automatic response to a failed regression test.

## World regression comparison

`scripts/verify-stone-world-regression.mjs` compares three modes using the same world seed `42017`, viewport, camera route, and duration:

```text
stones-off
reference
optimized
```

Logical desktop viewport:

```text
1920 × 1080, pixel ratio 1
```

Logical compact viewport:

```text
390 × 844, pixel ratio 1
```

Use the existing deterministic world movement QA route. If the Phase 7/8 implementation exposes a newer deterministic route, Phase 10 must still use a fixed route ID named `stone-rollout-route-v1` and must not use free camera input.

For each mode record:

- frame dt p50/p95/p99/max;
- main-thread hitch count above `33.4 ms` desktop and `50 ms` compact;
- terrain chunk count;
- grass counters;
- stone visible count;
- stone LOD counts;
- stone proxy count;
- draw calls;
- visible triangles;
- GPU bytes estimated by Phase 8 accounting;
- decoded CPU bytes;
- cache hit rate;
- worker queue maximum;
- upload-frame maximum;
- collision descriptor count.

Hard rules:

1. Terrain and grass deterministic counters are identical between off/reference/optimized where stone systems do not intentionally affect them.
2. Optimized draw calls do not exceed Phase 8 profile maximum.
3. Optimized visible triangles do not exceed Phase 8 profile maximum.
4. Optimized GPU bytes do not exceed Phase 8 profile maximum.
5. Optimized cache hit rate meets Phase 8 minimum.
6. Optimized upload-frame maximum meets Phase 8 profile maximum on hardware-gated runs.
7. Optimized p95 meets Phase 8 frame maximum on hardware-gated runs.
8. Optimized p95 minus stones-off p95 is at most `4 ms` desktop and `7 ms` compact on hardware-gated runs.
9. Optimized draw calls minus stones-off draw calls are at most the configured Phase 10 draw-call delta.
10. Reference mode exists for comparison but is not required to beat optimized performance.

Under SwiftShader/CI, enforce rules 1–5 and 9 only. Mark frame-time rules `not-applicable-software-renderer`, never passed by pretending software timing is target-device timing.

## Hardware performance benchmark

`scripts/benchmark-stone-production.mjs` accepts exactly:

```text
--profile desktop|compact
--output <file>
--headless 0|1
```

Defaults:

```text
--profile desktop
--output qa-runs/stone-performance/<profile>.json
--headless 0
```

The script uses the installed Chrome/Chromium selected by Playwright without SwiftShader unless `--headless 1` is explicitly requested.

A release-approved hardware result must have:

```text
softwareRenderer = false
```

and pass the exact Phase 8 profile budgets:

Desktop:

```text
drawCalls <= 220
triangles <= 1,200,000
gpuBytes <= 268,435,456
frameP95Ms <= 20
uploadFrameMaximumMs <= 4
```

Compact:

```text
drawCalls <= 120
triangles <= 350,000
gpuBytes <= 100,663,296
frameP95Ms <= 33.4
uploadFrameMaximumMs <= 2.5
```

Also require the Phase 10 world p95 delta limit against the stones-off run on the same machine and browser session.

The result JSON records browser version, renderer string, profile, exact budgets, measured values, dependency fingerprint, pass/fail, and route fingerprint.

Do not include a fabricated device name. An optional user-supplied note may be separate from machine-verifiable fields.

## Performance structural gate

`StonePerformanceGate` exposes one pure evaluation function that consumes Phase 8 stats and profile budgets.

It must distinguish:

- portable structural gates;
- hardware frame-time gates.

A software-rendered run may satisfy structural gates but can never satisfy the release requirement for desktop or compact performance approval.

## Release approval file

Create initial committed file:

```text
qa/baselines/stones/stone-release-approval-v1.json
```

with exactly:

```json
{
  "version": 1,
  "visualApproval": "pending",
  "desktopPerformanceApproval": "pending",
  "compactPerformanceApproval": "pending",
  "fullFuzzApproval": "pending",
  "rollbackApproval": "pending",
  "notes": []
}
```

Allowed approval values are:

```text
pending
approved
rejected
```

The implementation must not set any field to `approved` merely because code was written.

## Release report

`scripts/report-stone-release.mjs` reads:

- deterministic snapshot verification result;
- visual regression result;
- smoke fuzz result;
- optional full fuzz report;
- streaming/origin result;
- world regression result;
- optional desktop hardware benchmark;
- optional compact hardware benchmark;
- rollout config;
- release approval file;
- Phase 8 library verification result.

Write:

```text
qa-runs/stone-release/stone-release-report.json
qa-runs/stone-release/stone-release-report.md
```

Report schema contains:

- report version;
- dependency fingerprint;
- git commit when available, otherwise `unknown`;
- rollout master state and stage;
- every machine-verifiable gate with `pass`, `fail`, or `missing`;
- every manual approval state;
- hardening summary counts;
- performance measurements;
- visual manifest fingerprint;
- deterministic snapshot fingerprint;
- full fuzz population count;
- rollback-verification result;
- final readiness: `ready`, `not-ready`, or `blocked`.

Final readiness is `ready` only when:

- every mandatory machine gate passes;
- every configured required manual approval equals `approved`;
- rollout config itself validates;
- full fuzz population is exactly `49,152` when full fuzz is required;
- desktop and compact hardware reports are present and pass when required;
- rollback verification passes.

The report command exits code `1` when readiness is not `ready`.

## CI workflow

Create `.github/workflows/stone-production-qa.yml`.

Triggers:

```text
pull_request
workflow_dispatch
schedule: daily at 03:17 UTC
```

Use Node `20`.

### Job 1 — portable

Runs on every trigger:

```bash
npm ci
npm run build
npm run test:stone-fuzz
```

### Job 2 — visual

Runs on every trigger after portable:

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:stone-visual
```

Upload `qa-runs/stone-visual/` only on failure.

### Job 3 — world-regression

Runs on every trigger after portable:

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:stone-world-regression -- --software-renderer 1
```

This job enforces structural budgets only.

### Job 4 — full-fuzz

Runs only for `schedule` and explicit `workflow_dispatch`:

```bash
npm ci
npm run test:stone-fuzz:full
```

Upload the full fuzz JSON report.

Do not run hardware frame-time approval in GitHub-hosted CI.

## Rollback verification

`StoneHardeningVerification` must instantiate the world startup dependency graph with rollout master disabled and spy factories.

Require:

- zero Phase 7 stone system constructions;
- zero Phase 8 runtime system constructions;
- zero worker constructions;
- zero stone asset-library requests;
- zero stone cache entries;
- zero stone scene objects;
- zero collision descriptors;
- terrain/grass/control initialization remains reachable.

Also validate a config mutation where stage is `3` but master remains false. Stones must still remain completely disabled.

## Mandatory Phase 10 verification matrix

### Previous-phase gates

Run all Phase 1–9 verifiers unchanged.

### Rollout config tests

Verify:

- committed config parses;
- config is frozen;
- missing/duplicate/unknown key rejection;
- invalid stage rejection;
- invalid renderer rejection;
- invalid failure policy rejection;
- all seven emergency switches exist;
- stage membership exactly matches the table;
- master disable overrides stage three;
- emergency switch removes only its biome;
- canonical ordering is stable.

### Determinism tests

Verify complete equality against `stone-determinism-v1.json`.

Then regenerate every production snapshot case twice in one process and once after reconstructing all generators. Require exact fingerprints and quantized metrics.

### Fuzz smoke

Run all 768 smoke cases and require zero terminal failures.

### Configuration version tests

Run all twelve mutations for all ten configuration domains.

### LOD movement tests

Run the exact projected-radius sequence twice and require exact equality.

### Streaming/origin tests

Run all three world seeds and exact routes. Require no duplicate placement IDs, stable reload fingerprints, stable collision ownership, and zero retained references after disposal.

### Runtime failure test

Inject failures at:

- rollout config load;
- Phase 8 manifest load;
- worker initialization;
- runtime cache construction.

Rollout config load failure is startup-fatal because the production gate cannot be interpreted safely.

All failures after a valid rollout decision and inside stone runtime initialization must degrade to stones-disabled world startup.

### Browser visual tests

All 40 cases must meet all three pixel thresholds.

### Browser structural world regression

Both logical profiles must meet portable structural performance gates under SwiftShader.

## Manual release checklist

The final manual review uses Phase 9 Stone Bench and Phase 10 captures.

A reviewer must explicitly verify:

- all twelve archetypes still match the approved reference shape language;
- all eight palettes remain coherent;
- broad details are readable without noisy texture;
- no obvious holes or invalid silhouettes;
- LOD transitions do not produce identity swaps;
- LOD ground contact does not pop;
- shadows do not double during transition;
- cluster proxies do not create obvious group replacement pops;
- all seven biome populations look geologically coherent;
- coast and riverbank stones fit their terrain context;
- tall archetypes remain upright enough on slopes;
- no visible floating stones are found in the fixed world route;
- no stones obstruct protected path/exclusion zones;
- desktop hardware performance report passes;
- compact hardware performance report passes;
- master-disable rollback was tested in a production build.

Only after this review may the corresponding fields in `stone-release-approval-v1.json` be changed from `pending` to `approved` in a separate reviewed commit.

## Production rollout procedure

The code implementation commit leaves:

```yaml
stoneRolloutMasterEnabled: false
stoneRolloutStage: 0
```

After release readiness is `ready`, activate through configuration-only commits in this exact order:

### Rollout commit A

```yaml
stoneRolloutMasterEnabled: true
stoneRolloutStage: 1
```

Enabled:

```text
meadow
pathside
```

### Rollout commit B

After visual and performance review of stage 1:

```yaml
stoneRolloutStage: 2
```

Adds:

```text
upland
coast
riverbank
```

### Rollout commit C

After visual and performance review of stage 2:

```yaml
stoneRolloutStage: 3
```

Adds:

```text
mountain
scree
```

Each rollout commit reruns:

```bash
npm run build
npm run test:stone-visual
npm run test:stone-world-regression -- --software-renderer 1
```

A stage promotion never modifies Phase 1–9 configuration.

Emergency rollback at any stage sets master enabled to false and redeploys.

## Implementation sequence

Implement in this exact order.

### Step 1 — Rollout config and policy

Files:

- `stone-rollout.yaml`
- `StoneRolloutConfig.ts`
- `StoneRolloutConfigLoader.ts`
- `StoneRolloutErrors.ts`
- `StoneRolloutPolicy.ts`

Checks:

- strict parse;
- exact stage membership;
- master-disable behavior.

### Step 2 — Version registry and regression catalogue

Files:

- `StoneConfigVersionRegistry.ts`
- `StoneRegressionCatalog.ts`
- `StoneHardeningTypes.ts`

Checks:

- all ten domains registered;
- all current versions equal one;
- canonical case ordering stable.

### Step 3 — Deterministic snapshots

Files:

- `StoneDeterminismSnapshot.ts`
- `StoneDeterminismSnapshotVerifier.ts`
- `update-stone-snapshots.mjs`

Generate the initial committed baseline only after all previous verifiers pass.

### Step 4 — Fuzz and configuration mutation

Files:

- `StoneFuzzCaseResolver.ts`
- `StoneFuzzRunner.ts`
- `verify-stone-fuzz.mjs`

Checks:

- smoke population exactly 768;
- full population exactly 49,152;
- diagnostic archetype filter does not alter canonical all-suite behavior.

### Step 5 — Streaming and world baseline analyzers

Files:

- `StoneStreamingStress.ts`
- `StoneWorldBaseline.ts`
- `StonePerformanceGate.ts`

Checks:

- route deterministic;
- origin sequence deterministic;
- software-renderer gate distinction correct.

### Step 6 — Regression browser scene

Files:

- `StoneRegressionApp.ts`
- `StoneRegressionBrowserBridge.ts`
- `src/main.ts`

Checks:

- exactly 40 canonical cases;
- no animation;
- normal world path does not import the regression app.

### Step 7 — Playwright visual harness

Files:

- `StoneVisualRegressionManifest.ts`
- `verify-stone-visual.mjs`
- `update-stone-visual-baselines.mjs`
- package dependency and lockfile

Checks:

- SwiftShader launch exact;
- update requires `--accept`;
- verifier never mutates baselines;
- diagnostics written only on failure.

### Step 8 — World regression and hardware benchmark

Files:

- `verify-stone-world-regression.mjs`
- `benchmark-stone-production.mjs`

Checks:

- off/reference/optimized use the same route;
- structural CI gates pass;
- hardware results correctly distinguish software renderer.

### Step 9 — World rollout integration

Modify:

- `WorldApp.ts`

Checks:

- stage zero creates no stone runtime;
- stage filtering is by biome only;
- runtime init failure degrades to no stones;
- collision follows rollout visibility;
- world remains operational.

### Step 10 — Hardening verifier

Files:

- `StoneHardeningVerification.ts`
- `verify-stone-hardening.mjs`
- `package.json`

Run:

```bash
npx tsc
npm run test:stone-hardening
npm run build
```

### Step 11 — Baselines

Run explicitly:

```bash
npm run update:stone-snapshots
npx playwright install chromium
npm run update:stone-visual-baselines
```

Inspect the generated 40 PNGs before committing them.

### Step 12 — CI

Create:

- `.github/workflows/stone-production-qa.yml`

Verify pull-request and workflow-dispatch syntax.

### Step 13 — Release reporting

Files:

- `StoneReleaseApproval.ts`
- `StoneReleaseReport.ts`
- `report-stone-release.mjs`
- initial pending approval JSON

Do not mark approvals as approved during implementation.

## Definition of done

Phase 10 implementation is complete only when:

- every required source, script, config, baseline manifest, approval file, and workflow exists;
- all previous Phase 1–9 verifiers pass unchanged;
- rollout master is committed disabled at stage zero;
- rollback verification proves zero stone runtime construction;
- deterministic snapshot baseline is generated and passes exact verification;
- smoke fuzz completes all 768 cases with zero terminal failures;
- full fuzz tooling resolves exactly 49,152 canonical cases;
- all ten configuration domains pass version/mutation hardening;
- LOD movement sequence passes exactly;
- all three streaming/origin world seeds pass;
- all 40 visual baseline images are generated and the visual verifier passes;
- CI structural world regression passes desktop and compact logical profiles;
- Phase 8 library validation still passes;
- normal production `npm run build` passes;
- no Phase 1–9 production fingerprint changes unexpectedly;
- no baseline updater is called by build or verification scripts;
- initial release approval file remains pending until human review;
- the release report correctly returns not-ready while mandatory manual or hardware evidence is pending;
- one-key rollback remains available through `stoneRolloutMasterEnabled: false`.

Production activation is not part of the implementation commit. It occurs only through the separate rollout commits defined above after release approval.

## Required completion report

The implementation completion note must include:

- commit hash;
- files added and modified;
- `npm run build` result;
- previous Phase 1–9 verification results;
- deterministic snapshot baseline fingerprint;
- visual manifest fingerprint;
- all 40 visual case results;
- 768-case smoke fuzz summary;
- full-fuzz result if executed, otherwise explicitly `not executed`;
- streaming/origin stress summary for all three world seeds;
- rollout master/stage values;
- rollback verification result;
- desktop/compact structural world regression results;
- desktop hardware benchmark result if executed, otherwise `pending`;
- compact hardware benchmark result if executed, otherwise `pending`;
- release readiness result;
- manual approval states;
- confirmation that rollout remains disabled in the implementation commit;
- confirmation that no Phase 1–9 numeric generation configuration was changed unless separately documented as an approved defect fix.
