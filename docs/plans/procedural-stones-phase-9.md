# Procedural Stylized Stones — Phase 9 Implementation Specification

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
- Target branch: `main`
- Phase: 9 — authoring, debugging, reproducibility, and tuning tools
- Document authority: implementation contract
- Current state: completed
- Scope owner: browser stone bench, immutable inspection views, semantic/debug overlays, deterministic URL state, configuration workbench, preset export, contact-sheet generation, LOD comparison, placement inspection, runtime diagnostics, and authoring verification

This document removes implementation choices from Phase 9. The implementer must follow the scene contract, file layout, state schema, URL encoding, control ranges, panel order, debug overlay rules, export schemas, contact-sheet rules, configuration validation workflow, performance diagnostics, lifecycle rules, keyboard shortcuts, verification matrix, and completion criteria below. A different editor framework, state model, URL contract, export format, overlay representation, configuration editing strategy, or contact-sheet renderer requires this document to be changed first.

## Phase objective

Make the complete procedural stone pipeline inspectable and tunable without requiring an artist or developer to step through generator internals or edit TypeScript source files.

Phase 9 must deliver one browser-based **Stone Bench** that can reproduce, inspect, compare, validate, and export every important state produced by Phases 1–8.

The bench must provide:

1. Deterministic stone reproduction from archetype, requested seed, palette, and pipeline stage.
2. Direct navigation to any generated stone through a stable URL.
3. Full resolved recipe, fingerprints, validation results, quality metrics, and fallback trace inspection.
4. Semantic face visualization and region inspection.
5. Ground contact, bounds, centre of mass, support polygon, collision shape, and terrain-contact visualization.
6. Side-by-side LOD0–LOD3 comparison and transition scrubbing.
7. Phase 7 placement and biome preview for a selected world coordinate or chunk.
8. Phase 8 runtime cache, worker, batch, culling, memory, and draw-call diagnostics.
9. In-browser YAML configuration editing, validation, and hot preview using the real production parsers.
10. Safe export of edited YAML without automatically mutating repository files.
11. Copy actions for reproduction URLs, recipes, debug bundles, and fingerprints.
12. Deterministic PNG contact sheets and JSON manifests for fixed seed ranges.
13. Clear actionable validation errors that identify the configuration domain and offending key.
14. Strict separation between authoring/debug code and normal world runtime behavior.

Phase 9 is a tooling phase. It must not change how production stones are generated, validated, placed, LOD-selected, cached, or rendered when the bench is not active.

## Required dependency state

Phase 9 starts only after these commands pass:

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
```

The implementation consumes these existing contracts without replacing them:

- every Phase 1–8 configuration loader and parsed configuration type;
- `StoneCoreGenerator`;
- `StoneArchetypeGenerator`;
- `StoneDetailedGenerator`;
- `StoneMaterialGenerator`;
- `StoneProductionGenerator`;
- `StoneLodGenerator`;
- `StoneLodAssetSet`;
- `StoneLodLevel`;
- `StoneLodGroup`;
- `StoneQualityEvaluationResult`;
- `StoneQualityCandidateTrace`;
- `StoneSemanticModel`;
- `StoneSemanticRegion`;
- `StoneSemanticEdge`;
- `StoneDetailRecipe`;
- `StoneMaterialRecipe`;
- `StoneResolvedPalette`;
- `StoneChunkPlanner`;
- `StoneChunkPlan`;
- `StonePlacementRecipe`;
- `StoneCollisionDescriptor`;
- `StoneEnvironmentField`;
- `StoneGeologyCell`;
- `StoneRuntimeRequestResolver`;
- `StoneRuntimeAssetCache`;
- `StoneRuntimeRegistry`;
- `StoneRuntimeStats`;
- `WorldStoneRuntimeSystem`;
- `StoneArchetypeId` and `STONE_ARCHETYPE_IDS`;
- `StonePaletteId` and `STONE_PALETTE_IDS`;
- `StoneBiomeId` and `STONE_BIOME_IDS`;
- all Phase 1–8 compact metadata and fingerprint contracts;
- `TerrainField`;
- `WorldConfig`;
- `RuntimeProfile`.

Versions remain unchanged for Phases 1–8.

Phase 9 introduces:

- authoring state version: `1`;
- preset export version: `1`;
- debug bundle version: `1`;
- contact-sheet manifest version: `1`.

## Compatibility contract

Phase 9 is additive and must be inert outside the authoring scene.

The following production behavior must remain unchanged:

- normal `world` scene startup;
- `island` scene startup;
- all Phase 4, Phase 6, Phase 7, and Phase 8 gallery/benchmark scene modes;
- Phase 1–8 generator outputs;
- configuration file contents;
- production build configuration values;
- world placement decisions;
- runtime cache keys and library mappings;
- Phase 8 instancing behavior;
- Phase 8 worker protocol;
- all production fingerprints.

Phase 9 must not add a global singleton, DOM listener, render-loop callback, worker, cache, or configuration mutation when `scene !== "stone-bench"`.

The Stone Bench may construct independent generator/runtime objects using either committed configuration or validated in-memory authoring drafts. Those objects are owned by the bench and must be disposed when the bench is disposed.

## Frozen architectural decisions

The following decisions are final for Phase 9:

1. The authoring tool is a dedicated browser scene selected by `?scene=stone-bench`.
2. No third-party UI framework, state library, editor library, syntax highlighter, or test framework is added.
3. The UI uses TypeScript, standard DOM elements, CSS, and existing Three.js.
4. The bench uses one canonical immutable state object and one reducer-like state controller.
5. UI controls never mutate generator configuration objects.
6. Committed YAML remains the baseline source of truth.
7. Configuration editing occurs in in-memory text drafts.
8. Every draft is parsed by the real production loader for that configuration domain.
9. A draft is applied to preview only after all edited domains validate successfully as one configuration set.
10. The browser does not write repository files directly.
11. Edited YAML is exported through explicit download actions.
12. Presets and debug bundles are exported as JSON.
13. URLs contain only authoring state required to reproduce the view, never full YAML text or large recipes.
14. URL state is canonical and deterministic.
15. Changing a control updates the URL through `history.replaceState`; it does not create a history entry per slider movement.
16. Explicit seed stepping and preset navigation use `history.pushState`.
17. Bench generation is debounced for text and slider input but immediate for discrete buttons.
18. Only the newest generation request may update the viewport.
19. Stale generation results are disposed immediately.
20. Direct single-stone bench generation uses the exact production pipeline by default.
21. Intermediate-stage inspection may stop after Phase 1, 2, 3, 4, 5, or 6, but it does not modify those stages.
22. Phase 7 placement inspection uses CPU planning and generates only the selected placement asset unless the user selects chunk preview.
23. Phase 8 runtime diagnostics use an isolated bench runtime scene, not the live world instance.
24. Semantic debug overlays are separate render objects and never alter production geometry attributes or material shader code.
25. Geometry overlays use deterministic colours defined in Phase 9 configuration.
26. Selection highlight uses an overlay/wireframe object, not a modification to the production material.
27. Contact, support, bounds, centre, and collision visualizers use helper geometry owned by the bench.
28. The bench can render only one primary stone at a time in single mode.
29. LOD comparison mode shows exactly four stones, one per LOD.
30. Placement chunk preview has a configurable hard maximum number of rendered placements and defaults to `128`.
31. Contact-sheet rendering is deterministic and uses a fixed offscreen renderer size, camera, lighting, tone mapping, and pixel ratio.
32. Contact-sheet output is manual authoring output, not a Phase 9 regression-test artifact.
33. Contact-sheet PNG data is never committed automatically.
34. Contact-sheet manifests contain exact state and fingerprints for every tile.
35. Copy actions use the Clipboard API with a textarea fallback.
36. Export actions use `Blob` and object URLs; no server endpoint is required.
37. Import supports only Phase 9 preset JSON. It does not import arbitrary Three.js geometry or glTF.
38. Imported preset JSON is schema-validated before application.
39. Configuration hot preview does not affect the Phase 8 committed pre-baked library. When an edited dependency invalidates the library fingerprint, runtime-library preview is disabled and the UI explains why.
40. Exact generation remains available while library preview is disabled.
41. Phase 9 does not rebake the complete Phase 8 library inside the browser.
42. A single selected library asset may be inspected from the committed pack.
43. Performance diagnostics are observational. The bench does not auto-tune production thresholds.
44. Performance measurements are clearly separated into CPU generation, main-thread upload, render, and runtime counters.
45. No configuration value is silently clamped by the authoring UI before parsing unless the control contract explicitly says so.
46. Numeric fields preserve user-entered text until validation, so invalid values can be diagnosed rather than silently corrected.
47. All configuration validation errors contain domain, key or relationship, error code, and message.
48. Authoring classes do not use `console.log` for normal state changes.
49. One concise startup line and unexpected terminal errors may be logged by `StoneBenchApp`.
50. Every helper geometry, material, texture, render target, event listener, object URL, and generated asset is disposed or revoked when replaced or on bench disposal.
51. Phase 9 adds no production dependency.
52. Phase 9 does not implement Phase 10 rollout flags, visual regression approval, CI screenshot baselines, device performance gates, or migration tests.

## In scope

Phase 9 includes:

- dedicated Stone Bench scene;
- authoring configuration;
- canonical state and URL codec;
- single-stone preview;
- intermediate pipeline-stage preview;
- reproducible seed controls;
- recipe and fingerprint inspection;
- semantic-region and semantic-edge inspection;
- face picking;
- quality/fallback diagnostics;
- ground contact and support visualization;
- bounds and centre-of-mass visualization;
- collision visualization;
- LOD side-by-side comparison;
- LOD transition scrubber;
- Phase 7 world coordinate, chunk, biome, geology, and placement inspection;
- Phase 8 cache/library/worker/batch/runtime diagnostics;
- strict YAML configuration workbench;
- in-memory config hot preview;
- preset JSON import/export;
- reproduction URL copy;
- debug bundle copy/export;
- contact-sheet generation and manifest export;
- authoring keyboard shortcuts;
- deterministic verification of state, exports, overlays, and configuration workflows.

## Explicitly out of scope

Do not implement:

- direct GitHub commits from the browser;
- direct filesystem writes from the browser;
- arbitrary code evaluation;
- JavaScript expression fields;
- custom shader source editing;
- geometry vertex dragging;
- hand sculpting;
- CSG editing;
- manual semantic painting;
- manual LOD mesh editing;
- biome painting on terrain;
- in-world placement dragging;
- runtime library rebaking in the browser;
- full asset-library mutation;
- glTF import/export;
- texture painting;
- screenshot regression approval;
- CI baseline mutation;
- network sharing service;
- accounts or permissions;
- save-game integration;
- server-side preset storage;
- Phase 10 rollout controls.

## Required file changes

### New configuration

Create:

```text
public/config/stone-authoring.yaml
```

### New authoring files

Create exactly:

```text
src/stones/authoring/StoneAuthoringTypes.ts
src/stones/authoring/StoneAuthoringConfig.ts
src/stones/authoring/StoneAuthoringConfigLoader.ts
src/stones/authoring/StoneAuthoringErrors.ts
src/stones/authoring/StoneAuthoringCatalog.ts
src/stones/authoring/StoneAuthoringState.ts
src/stones/authoring/StoneAuthoringStateController.ts
src/stones/authoring/StoneAuthoringUrlCodec.ts
src/stones/authoring/StoneAuthoringPipeline.ts
src/stones/authoring/StoneAuthoringGenerationQueue.ts
src/stones/authoring/StoneAuthoringSelection.ts
src/stones/authoring/StoneAuthoringDebugBundle.ts
src/stones/authoring/StoneAuthoringPreset.ts
src/stones/authoring/StoneAuthoringClipboard.ts
src/stones/authoring/StoneAuthoringDownload.ts
src/stones/authoring/StoneAuthoringFormat.ts
src/stones/authoring/StoneAuthoringConfigWorkspace.ts
src/stones/authoring/StoneAuthoringConfigValidator.ts
src/stones/authoring/StoneAuthoringContactSheet.ts
src/stones/authoring/StoneAuthoringContactSheetManifest.ts
src/stones/authoring/StoneAuthoringPerformance.ts
src/stones/authoring/index.ts
```

### New debug-render files

Create exactly:

```text
src/stones/authoring/debug/StoneDebugOverlayRoot.ts
src/stones/authoring/debug/StoneSemanticOverlay.ts
src/stones/authoring/debug/StoneEdgeOverlay.ts
src/stones/authoring/debug/StoneBoundsOverlay.ts
src/stones/authoring/debug/StoneContactOverlay.ts
src/stones/authoring/debug/StoneMassOverlay.ts
src/stones/authoring/debug/StoneCollisionOverlay.ts
src/stones/authoring/debug/StoneNormalOverlay.ts
src/stones/authoring/debug/StoneSelectionOverlay.ts
src/stones/authoring/debug/StoneTerrainContactOverlay.ts
```

### New UI files

Create exactly:

```text
src/stones/authoring/ui/StoneBenchUi.ts
src/stones/authoring/ui/StoneBenchHeader.ts
src/stones/authoring/ui/StoneBenchControlPanel.ts
src/stones/authoring/ui/StoneBenchInspectorPanel.ts
src/stones/authoring/ui/StoneBenchConfigPanel.ts
src/stones/authoring/ui/StoneBenchPerformancePanel.ts
src/stones/authoring/ui/StoneBenchContactSheetPanel.ts
src/stones/authoring/ui/StoneBenchStatusBar.ts
src/stones/authoring/ui/StoneBenchTable.ts
src/stones/authoring/ui/StoneBenchJsonView.ts
src/stones/authoring/ui/StoneBenchYamlEditor.ts
src/stones/authoring/ui/StoneBenchStyles.ts
```

### New app and QA files

Create:

```text
src/app/StoneBenchApp.ts
src/stones/qa/StoneAuthoringVerification.ts
scripts/verify-stone-authoring.mjs
```

### Existing files to modify

Modify only:

```text
src/main.ts
package.json
```

Do not modify Phase 1–8 production source files or committed Phase 1–8 YAML values as part of Phase 9.

## Package scripts

Add:

```json
"test:stone-authoring": "node scripts/verify-stone-authoring.mjs"
```

Update build order so the authoring verifier runs after the runtime verifier:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-stone-quality.mjs && node scripts/verify-stone-lod.mjs && node scripts/verify-stone-placement.mjs && node scripts/verify-stone-library.mjs && node scripts/verify-stone-runtime.mjs && node scripts/verify-stone-authoring.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add dependencies.

## Scene contract

`src/main.ts` must recognize `stone-bench` in the canonical scene union after all existing Phase 4, 6, 7, and 8 scene values.

The final union must include at least:

```ts
type SceneMode =
  | "world"
  | "island"
  | "stone-material-gallery"
  | "stone-lod-gallery"
  | "stone-placement-gallery"
  | "stone-runtime-benchmark"
  | "stone-bench";
```

Do not remove or rename an existing scene value.

When:

```text
?scene=stone-bench
```

load `StoneBenchApp` dynamically.

Normal world and island startup must not import Phase 9 authoring modules eagerly.

Set:

```text
document.body.dataset.scene = "stone-bench"
```

and use document title:

```text
Drusniel World · Stone Bench
```

## Canonical authoring modes

Use this exact order:

```ts
export const STONE_AUTHORING_MODES = [
  "single",
  "lod-compare",
  "placement",
  "runtime",
  "contact-sheet",
  "config",
] as const;

export type StoneAuthoringMode =
  (typeof STONE_AUTHORING_MODES)[number];
```

Use this exact pipeline-stage order:

```ts
export const STONE_AUTHORING_STAGES = [
  "core",
  "archetype",
  "details",
  "material",
  "quality",
  "lod",
] as const;
```

`single` mode may select any stage.

All other modes force stage `lod` except `config`, which keeps the previous preview stage but shows the config workbench.

## Public authoring state

`StoneAuthoringState.ts` must define:

```ts
export interface StoneAuthoringCameraState {
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly distance: number;
  readonly targetHeight: number;
}

export interface StoneAuthoringOverlayState {
  readonly semanticFaces: boolean;
  readonly semanticEdges: boolean;
  readonly bounds: boolean;
  readonly contact: boolean;
  readonly centreOfMass: boolean;
  readonly collision: boolean;
  readonly faceNormals: boolean;
  readonly terrainContact: boolean;
  readonly wireframeSelection: boolean;
}

export interface StoneAuthoringPlacementState {
  readonly worldX: number;
  readonly worldZ: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly previewWholeChunk: boolean;
  readonly selectedPlacementId: string | null;
}

export interface StoneAuthoringContactSheetState {
  readonly seedStart: number;
  readonly seedCount: number;
  readonly columns: number;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly lodLevel: StoneLodLevel;
  readonly includeLabels: boolean;
}

export interface StoneAuthoringState {
  readonly version: 1;
  readonly mode: StoneAuthoringMode;
  readonly stage: StoneAuthoringStage;
  readonly archetypeId: StoneArchetypeId;
  readonly requestedSeed: number;
  readonly paletteId: StonePaletteId;
  readonly lodLevel: StoneLodLevel;
  readonly transitionProjectedRadiusPixels: number;
  readonly seedLocked: boolean;
  readonly selectedRegionKey: string | null;
  readonly selectedEdgeKey: string | null;
  readonly camera: Readonly<StoneAuthoringCameraState>;
  readonly overlays: Readonly<StoneAuthoringOverlayState>;
  readonly placement: Readonly<StoneAuthoringPlacementState>;
  readonly contactSheet: Readonly<StoneAuthoringContactSheetState>;
  readonly activeConfigDomain: StoneAuthoringConfigDomain;
}
```

All state objects are immutable and deeply frozen.

The state controller must expose:

```ts
export type StoneAuthoringListener = (
  state: Readonly<StoneAuthoringState>,
  reason: StoneAuthoringStateChangeReason,
) => void;

export class StoneAuthoringStateController {
  getState(): Readonly<StoneAuthoringState>;
  replace(state: Readonly<StoneAuthoringState>, reason: StoneAuthoringStateChangeReason): void;
  patch(patch: StoneAuthoringStatePatch, reason: StoneAuthoringStateChangeReason): void;
  subscribe(listener: StoneAuthoringListener): () => void;
  dispose(): void;
}
```

No UI component owns an independent copy of canonical state.

## Phase 9 configuration

Create `public/config/stone-authoring.yaml` with exactly:

```yaml
# Phase 9 schema
stoneAuthoringConfigVersion: 1
stoneAuthoringStateVersion: 1
stoneAuthoringPresetVersion: 1
stoneAuthoringDebugBundleVersion: 1
stoneAuthoringContactSheetManifestVersion: 1

# Generation behavior
stoneAuthoringGenerationDebounceMs: 120
stoneAuthoringMaximumQueuedGenerations: 1
stoneAuthoringSeedStep: 1
stoneAuthoringSeedPageStep: 100
stoneAuthoringDefaultSeed: 42
stoneAuthoringDefaultArchetype: rounded-boulder
stoneAuthoringDefaultPalette: slate
stoneAuthoringDefaultStage: lod
stoneAuthoringDefaultMode: single
stoneAuthoringDefaultLod: 0

# Camera
stoneAuthoringCameraFovDegrees: 42
stoneAuthoringCameraNear: 0.05
stoneAuthoringCameraFar: 1000
stoneAuthoringCameraYawDegrees: 35
stoneAuthoringCameraPitchDegrees: 18
stoneAuthoringCameraDistance: 6
stoneAuthoringCameraTargetHeight: 0.7
stoneAuthoringCameraDistanceMin: 1.2
stoneAuthoringCameraDistanceMax: 28
stoneAuthoringCameraOrbitSensitivity: 0.004
stoneAuthoringCameraZoomSensitivity: 0.0025

# Preview renderer
stoneAuthoringRendererPixelRatioMaximum: 2
stoneAuthoringGridSize: 20
stoneAuthoringGridDivisions: 20
stoneAuthoringGroundSize: 30
stoneAuthoringGroundColor: "#747474"
stoneAuthoringBackgroundColor: "#b7c0c7"
stoneAuthoringDirectionalLightIntensity: 3
stoneAuthoringHemisphereLightIntensity: 1.4
stoneAuthoringShadowMapSize: 1024

# Semantic debug colours
stoneAuthoringSemanticUndersideColor: "#39424e"
stoneAuthoringSemanticContactColor: "#665c4c"
stoneAuthoringSemanticSideColor: "#4f7fc9"
stoneAuthoringSemanticUpperColor: "#70a95a"
stoneAuthoringSemanticTopColor: "#e0c451"
stoneAuthoringSemanticCutColor: "#d97942"
stoneAuthoringSemanticDetailCutColor: "#b34f80"
stoneAuthoringSelectedColor: "#ffffff"
stoneAuthoringEdgeColor: "#202020"
stoneAuthoringContactColor: "#38d46a"
stoneAuthoringBoundsColor: "#f2df5d"
stoneAuthoringMassColor: "#ff4fd8"
stoneAuthoringCollisionColor: "#ff5b45"
stoneAuthoringNormalColor: "#71e8ff"
stoneAuthoringTerrainContactColor: "#a6ff80"

# Debug overlay geometry
stoneAuthoringOverlayOpacity: 0.55
stoneAuthoringEdgeLineWidthLogical: 1
stoneAuthoringNormalLengthScale: 0.18
stoneAuthoringMarkerRadiusScale: 0.035
stoneAuthoringSupportLineHeight: 0.008
stoneAuthoringBoundsPadding: 0.005

# Placement preview
stoneAuthoringPlacementMaximumRenderedStones: 128
stoneAuthoringPlacementDefaultWorldX: 0
stoneAuthoringPlacementDefaultWorldZ: 0
stoneAuthoringPlacementChunkRadius: 0

# Contact sheet
stoneAuthoringContactSheetWidth: 2048
stoneAuthoringContactSheetTileSize: 256
stoneAuthoringContactSheetDefaultColumns: 8
stoneAuthoringContactSheetDefaultSeedCount: 32
stoneAuthoringContactSheetMaximumSeedCount: 128
stoneAuthoringContactSheetPixelRatio: 1
stoneAuthoringContactSheetPaddingPixels: 12
stoneAuthoringContactSheetLabelHeightPixels: 28
stoneAuthoringContactSheetBackgroundColor: "#b7c0c7"
stoneAuthoringContactSheetGroundColor: "#747474"

# Inspector and runtime diagnostics
stoneAuthoringInspectorDecimalPlaces: 6
stoneAuthoringPerformanceRefreshHz: 4
stoneAuthoringPerformanceHistorySeconds: 20
stoneAuthoringMaximumInspectorRows: 512

# URL and exports
stoneAuthoringUrlMaximumLength: 1800
stoneAuthoringPresetFilePrefix: stone-preset
stoneAuthoringDebugFilePrefix: stone-debug
stoneAuthoringContactSheetFilePrefix: stone-contact-sheet
```

### Configuration validation

`StoneAuthoringConfigLoader` must:

- expose `load(url = "./config/stone-authoring.yaml")`;
- expose public `parse(source: string)`;
- use `FlatConfig`;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- return recursively frozen values;
- validate every colour with `^#[0-9a-fA-F]{6}$`;
- reject non-finite values;
- reject non-integer integer fields;
- identify every invalid key or relationship.

Cross-field rules:

1. All five versions equal `1`.
2. Generation debounce is an integer from `0` through `1000`.
3. Maximum queued generations equals `1`.
4. Seed step and page step are positive integers.
5. Page step is at least seed step.
6. Default seed passes Phase 1 seed validation.
7. Default archetype, palette, stage, mode, and LOD are canonical values.
8. FOV is from `20` through `90` degrees.
9. Camera near is positive and below camera far.
10. Pitch default is between `-80` and `80` degrees.
11. Camera distance minimum is positive and less than default distance.
12. Default distance is less than maximum distance.
13. Sensitivities are positive.
14. Renderer pixel ratio maximum is from `1` through `3`.
15. Grid size and divisions are positive.
16. Ground size is at least grid size.
17. Light intensities are non-negative.
18. Shadow map size is one of `512`, `1024`, or `2048`.
19. Overlay opacity is greater than `0` and at most `1`.
20. Overlay scale values are positive.
21. Placement maximum is an integer from `1` through `1024`.
22. Contact-sheet width, tile size, padding, and label height are positive integers.
23. Contact-sheet width is divisible by tile size.
24. Default columns is positive and at most `width / tileSize`.
25. Default seed count is positive and no larger than maximum.
26. Maximum seed count is at most `512`.
27. Contact-sheet pixel ratio equals `1` in Phase 9.
28. Inspector decimal places is an integer from `0` through `9`.
29. Performance refresh is greater than `0` and at most `30` Hz.
30. Performance history is from `1` through `120` seconds.
31. Maximum inspector rows is an integer from `64` through `4096`.
32. URL maximum length is an integer from `512` through `4096`.
33. Export prefixes contain only lowercase letters, digits, and hyphens.

## Configuration domains

Use this exact order:

```ts
export const STONE_AUTHORING_CONFIG_DOMAINS = [
  "core",
  "archetypes",
  "details",
  "materials",
  "quality",
  "lod",
  "placement",
  "runtime",
  "authoring",
] as const;
```

Map to files exactly:

```text
core        -> public/config/stone-core.yaml
archetypes  -> public/config/stone-archetypes.yaml
details     -> public/config/stone-details.yaml
materials   -> public/config/stone-materials.yaml
quality     -> public/config/stone-quality.yaml
lod         -> public/config/stone-lod.yaml
placement   -> public/config/stone-placement.yaml
runtime     -> public/config/stone-runtime.yaml
authoring   -> public/config/stone-authoring.yaml
```

Use the real corresponding loader's `parse` method.

Do not duplicate Phase 1–8 parsing logic inside Phase 9.

## Default authoring state

When the URL contains no Phase 9 parameters, use:

```text
mode = single
stage = lod
archetype = rounded-boulder
seed = 42
palette = slate
lod = 0
transitionProjectedRadiusPixels = 120
seedLocked = false
selectedRegionKey = null
selectedEdgeKey = null
camera yaw = 35
camera pitch = 18
camera distance = 6
camera targetHeight = 0.7
all overlays = false
placement worldX = 0
placement worldZ = 0
placement chunkX = 0
placement chunkZ = 0
placement previewWholeChunk = false
placement selectedPlacementId = null
contactSheet seedStart = 0
contactSheet seedCount = 32
contactSheet columns = 8
contactSheet archetype = rounded-boulder
contactSheet palette = slate
contactSheet lod = 0
contactSheet includeLabels = true
activeConfigDomain = core
```

## URL contract

`StoneAuthoringUrlCodec` owns URL decoding and encoding.

### Canonical query keys

Use only these Phase 9 keys:

```text
scene
benchMode
stage
archetype
seed
palette
lod
radius
seedLocked
region
edge
camYaw
camPitch
camDist
camTarget
overlays
worldX
worldZ
chunkX
chunkZ
wholeChunk
placement
sheetStart
sheetCount
sheetCols
sheetArchetype
sheetPalette
sheetLod
sheetLabels
configDomain
```

Do not add aliases.

### Encoding rules

- `scene=stone-bench` is always first.
- Other keys are emitted in the order listed above.
- Omit a key when its value equals the committed Phase 9 default, except `scene`.
- Numbers use shortest finite decimal representation that round-trips through `Number`.
- Seed uses unsigned decimal integer form.
- Booleans encode as `1` for true and are omitted for false defaults.
- `overlays` is a comma-separated canonical list in this order:

```text
semanticFaces,semanticEdges,bounds,contact,centreOfMass,collision,faceNormals,terrainContact,wireframeSelection
```

- Region, edge, and placement IDs use `encodeURIComponent` through `URLSearchParams`.
- Unknown keys are ignored by the Phase 9 codec but remain untouched only when they are not Phase 9 keys.
- Invalid canonical values fall back to defaults and produce one non-fatal URL diagnostic.
- Encoded URL length must not exceed configured maximum. If it would, selected region, edge, and placement keys are omitted in that order and a warning is shown.

### History behavior

Use `history.replaceState` for:

- sliders;
- checkboxes;
- camera movement;
- selection;
- mode tab changes;
- config domain changes.

Use `history.pushState` for:

- Previous Seed;
- Next Seed;
- Previous 100;
- Next 100;
- Regenerate when seed is not locked;
- importing a preset.

`popstate` must fully restore canonical state and regenerate the view.

## Seed behavior

Buttons:

```text
-100
-1
Regenerate
+1
+100
Lock Seed
```

Rules:

- seed arithmetic wraps in unsigned 32-bit space;
- `-1` and `+1` use configured seed step;
- `-100` and `+100` use configured page step;
- when seed is locked, `Regenerate` regenerates the same requested seed;
- when seed is unlocked, `Regenerate` sets seed to `mixStoneUint32(currentSeed + 0x9e3779b9)`;
- seed text input accepts decimal or `0x` hexadecimal;
- on blur/Enter, normalize to unsigned decimal in the UI and URL;
- invalid seed text remains visible with an error state until corrected and does not trigger generation.

## StoneAuthoringPipeline

`StoneAuthoringPipeline` owns one complete set of parsed configurations and generators.

It must expose:

```ts
export interface StoneAuthoringPipelineConfigs {
  readonly core: Readonly<StoneConfig>;
  readonly archetypes: Readonly<StoneArchetypeConfig>;
  readonly details: Readonly<StoneDetailConfig>;
  readonly materials: Readonly<StoneMaterialConfig>;
  readonly quality: Readonly<StoneQualityConfig>;
  readonly lod: Readonly<StoneLodConfig>;
  readonly placement: Readonly<StonePlacementConfig>;
  readonly runtime: Readonly<StoneRuntimeConfig>;
  readonly authoring: Readonly<StoneAuthoringConfig>;
}

export class StoneAuthoringPipeline {
  static async createCommitted(...): Promise<StoneAuthoringPipeline>;
  static createFromParsedConfigs(...): StoneAuthoringPipeline;

  generateSingle(state: Readonly<StoneAuthoringState>): StoneAuthoringSingleResult;
  generatePlacement(state: Readonly<StoneAuthoringState>): StoneAuthoringPlacementResult;
  createRuntimePreview(state: Readonly<StoneAuthoringState>): Promise<StoneAuthoringRuntimePreview>;
  dispose(): void;
}
```

Do not reuse mutable generator instances between the committed pipeline and a draft-config pipeline.

### Single-stage generation

Use the exact requested stage:

- `core`: call Phase 1 only.
- `archetype`: call Phase 2 only.
- `details`: call Phase 3 only.
- `material`: call Phase 3 then Phase 4.
- `quality`: call Phase 5 production generator.
- `lod`: call Phase 6 LOD generator.

Every result includes the complete upstream data available at that stage.

When a later stage owns and disposes an earlier geometry according to its existing contract, Phase 9 must not retain a dead geometry reference. Inspection data must be copied or retained only through immutable recipe/metric contracts.

## Generation queue

`StoneAuthoringGenerationQueue` allows one in-flight logical request and one newest pending request.

Requirements:

- every request gets a monotonically increasing request ID;
- text/slider changes use configured debounce;
- button actions bypass debounce;
- a new request supersedes any pending request;
- synchronous CPU generation cannot be forcibly interrupted; its result is marked stale if a newer request ID exists;
- stale geometries/materials/LOD sets are disposed before returning control;
- runtime worker preview uses existing Phase 8 cancellation where available;
- only the newest successful request updates the viewport and inspectors;
- queue errors include request ID and stage.

## Single preview scene

`StoneBenchApp` creates one canonical preview root.

Renderer:

- `THREE.WebGLRenderer`;
- antialias enabled;
- alpha false;
- highp precision;
- high-performance preference;
- output `THREE.SRGBColorSpace`;
- `THREE.ACESFilmicToneMapping`;
- shadows enabled;
- `THREE.PCFShadowMap`;
- pixel ratio `min(devicePixelRatio, configuredMaximum)`.

Scene:

- configured background colour;
- no fog;
- configured grey ground plane;
- configured grid helper;
- one directional light at normalized direction `(0.55, 0.80, 0.35)` multiplied by position distance `12`;
- one hemisphere light;
- directional shadow camera half extent `6`;
- configured shadow map size.

Camera:

- perspective camera;
- configured FOV/near/far;
- orbit target `(0, targetHeight, 0)`;
- yaw around world Y;
- pitch clamped to `[-80, 80]`;
- wheel zoom clamped to configured distance range.

Input:

- left mouse drag: orbit;
- wheel: zoom;
- double click empty ground: reset camera to config defaults;
- no pointer lock.

Do not share WorldApp controls.

## Viewport layout

Desktop layout is fixed:

```text
+---------------------------------------------------------------+
| Header                                                        |
+----------------------+------------------------+---------------+
| Control panel        | Three.js viewport      | Inspector     |
| 320 px               | flexible               | 380 px        |
|                      |                        |               |
+----------------------+------------------------+---------------+
| Status bar                                                   |
+---------------------------------------------------------------+
```

Minimum viewport width is `480` px.

When browser width is below `1180` px:

- control panel becomes a left slide-over panel;
- inspector becomes a right slide-over panel;
- viewport uses full width;
- header buttons toggle panels;
- do not create a separate mobile authoring implementation.

The bench is primarily desktop tooling, but it must remain functional on compact screens.

## Header

Header control order is exact:

1. mode selector;
2. archetype selector;
3. seed input;
4. `-100`;
5. `-1`;
6. `Regenerate`;
7. `+1`;
8. `+100`;
9. `Lock Seed` toggle;
10. palette selector;
11. pipeline stage selector;
12. LOD selector;
13. `Copy URL`;
14. `Copy Debug`;
15. `Export Preset`;
16. `Import Preset`.

Disable controls that do not apply to the current mode, but keep their layout position.

## Control panel sections

Render sections in this order:

1. **Preview**
2. **Overlays**
3. **LOD Transition**
4. **Placement**
5. **Contact Sheet**
6. **Configuration**

Collapsed state is UI-only and is not encoded in canonical authoring state.

### Preview section

Show read-only:

- requested seed;
- effective seed when available;
- candidate kind/index when available;
- archetype;
- palette;
- current stage;
- production fingerprint when available;
- LOD-set fingerprint when available.

### Overlay controls

Checkboxes in exact order:

```text
Semantic Faces
Semantic Edges
Bounds
Ground Contact
Centre of Mass
Collision
Face Normals
Terrain Contact
Selection Wireframe
```

Overlays that lack data at the current stage are disabled with tooltip text naming the required stage.

### LOD transition controls

Visible in `lod-compare` and `single/lod` mode.

Controls:

- projected radius slider: `0` through `180` px, step `0.5`;
- read-only primary level;
- read-only high/low levels;
- read-only high/low coverage;
- read-only shadow level.

The slider calls the real Phase 6 `StoneLodSelector` with persistent hysteresis state.

A `Reset transition state` button resets hysteresis to LOD0 before resolving the current slider value.

## Inspector panel tabs

Tabs in exact order:

1. `Summary`
2. `Recipe`
3. `Semantics`
4. `Quality`
5. `LOD`
6. `Placement`
7. `Runtime`
8. `Fingerprints`
9. `Errors`

Tabs remain visible even when unavailable. Unavailable tabs show the minimum stage/mode needed.

## Summary inspector

Display rows in this order where available:

```text
Requested Seed
Effective Seed
Archetype
Palette
Stage
Candidate Kind
Candidate Index
Fallback Used
Quality Score
Geometry Vertices
Geometry Triangles
Regions
Surface Details
Geometric Details
LOD0 Triangles
LOD1 Triangles
LOD2 Triangles
LOD3 Triangles
World X
World Y
World Z
Uniform Scale
Biome
Placement Mode
```

Numbers use configured inspector decimal places but trailing zeroes are trimmed.

Do not round raw copied/exported data.

## Recipe inspector

Display canonical JSON blocks, in this order when available:

1. core recipe;
2. archetype recipe;
3. detail recipe;
4. material recipe;
5. quality candidate trace;
6. LOD summary recipe/data;
7. placement recipe;
8. runtime request identity.

Each block has:

- `Copy` button;
- collapsed/expanded toggle;
- canonical JSON stringification with two-space indentation;
- no syntax-highlighting dependency.

Canonical JSON recursively sorts object keys lexicographically only for display/copy in Phase 9. It does not change production fingerprint serialization.

## Semantic face overlay

`StoneSemanticOverlay` creates one non-indexed debug mesh from the displayed geometry.

Requirements:

- use the displayed geometry positions;
- group triangles by `stoneSemantic` attribute;
- use the exact Phase 9 semantic debug colours;
- use `MeshBasicMaterial` with `transparent = true`, configured opacity, `depthWrite = false`, `polygonOffset = true`, and deterministic polygon offset;
- render order above the production mesh;
- never modify the source geometry;
- construct a new overlay geometry;
- preserve triangle positions exactly;
- dispose overlay geometry and materials when disabled or regenerated.

When `stoneSemantic` does not exist at the current stage, derive source-face semantic only when the current immutable semantic model and exact source-face mapping are available. Otherwise the overlay is unavailable.

## Semantic picking

Face picking uses `THREE.Raycaster` against the production preview mesh, not the transparent overlay.

On click without orbit drag:

1. raycast visible preview meshes;
2. resolve clicked triangle;
3. read `stoneRegionId` when available;
4. map to region key;
5. update `selectedRegionKey`;
6. clear `selectedEdgeKey`;
7. show selection overlay.

When region data is unavailable, selection remains null.

Selected region inspector displays:

```text
regionId
regionKey
planeId
planeRole
semantic
flags
area
areaRatio
centroid
normal
minimumY
maximumY
sharedIndices
triangleIndices
```

Show human-readable flag names in canonical Phase 3 flag order.

## Semantic edge overlay

`StoneEdgeOverlay` renders structural edges from the semantic model.

Use line segments and one shared `LineBasicMaterial`.

Default edge colour is configured edge colour.

When an edge is selected, render a second overlay for only that edge using selected colour.

Edge picking is performed by selecting the nearest projected structural edge within `8` CSS pixels of pointer position after face picking fails.

Selected edge inspector displays all `StoneSemanticEdge` fields.

## Bounds overlay

Render one `THREE.Box3Helper`-equivalent line box using a Phase 9-owned `BufferGeometry` and `LineBasicMaterial` rather than mutating a global helper.

Bounds are exact displayed-asset bounds plus configured visual padding.

Also render the bounding sphere as three orthogonal great-circle line loops only when the `Bounds` overlay is enabled.

## Ground contact overlay

When an underside/contact polygon is available:

- render the support polygon as a closed line loop at `y = supportLineHeight`;
- render support centroid as a small disk or sphere marker;
- use configured contact colour;
- render no filled polygon.

For LOD comparison, each column shows its own support polygon.

## Centre-of-mass overlay

Available at Phase 5 and later.

Render:

- one sphere marker at centre of mass;
- one vertical line from centre of mass to `(x, 0, z)`;
- one ground marker at the projected point;
- configured mass colour.

The overlay is diagnostic only and does not run physics.

## Collision overlay

Available for a Phase 7 placement recipe or runtime instance.

Render the exact Phase 7 oriented collision descriptor as a wireframe box:

- XZ centre from collision descriptor;
- Y bottom at placement world Y;
- height from descriptor;
- yaw around Y;
- no tilt, matching the Phase 7 descriptor contract.

Use configured collision colour.

Show collision policy in inspector.

## Face normal overlay

Render one line per semantic region, not one per rendered triangle.

Line:

```text
start = region.centroid
end = centroid + normal * maxStoneDimension * normalLengthScale
```

Use configured normal colour.

Do not generate vertex-normal hairs.

## Terrain-contact overlay

Available only in placement mode.

Render the same nine sample positions used by `StoneTerrainFitter`.

For each sample:

- terrain point marker;
- transformed support-point marker;
- line segment connecting them.

Line colour:

- configured terrain-contact colour when absolute gap is within allowed gap/penetration limits;
- collision colour when outside limits.

Inspector shows per-sample gap values in canonical sample order.

## LOD comparison mode

Show exactly four viewport roots arranged left-to-right:

```text
LOD0 | LOD1 | LOD2 | LOD3
```

All four use:

- same camera yaw/pitch/distance relative to local bounds;
- same lighting;
- same ground height;
- same palette;
- same object rotation;
- coverage `1`;
- no dither transition unless `Preview transition` is explicitly enabled.

Each column label displays:

```text
LOD level
triangle count
active plane count
retained detail count
asset fingerprint
```

Camera orbit and zoom are synchronized across all columns.

Clicking one column makes it the active selection target but does not hide other levels.

## Transition preview

In single LOD mode, transition preview uses the real Phase 6 coverage and dither patch.

At transition:

- show exactly high and low levels;
- use the exact Phase 6 complementary coverage;
- show shadow level indicator in inspector;
- do not modify the configured Phase 6 threshold values.

A `Cycle boundaries` button steps projected radius through:

```text
138
120
102
56
48
40
22
18
14
```

and wraps.

## Placement mode

Placement panel controls:

```text
World X
World Z
Chunk X
Chunk Z
Preview Whole Chunk
Plan Chunk
Previous Placement
Next Placement
Copy Placement ID
```

Rules:

- changing world X/Z updates chunk X/Z using Phase 7 chunk-size rules;
- changing chunk X/Z moves world coordinate to that chunk centre;
- `Plan Chunk` calls the real `StoneChunkPlanner`;
- when `previewWholeChunk = false`, select the placement nearest requested world X/Z;
- when `previewWholeChunk = true`, render up to configured maximum placements in placement-ID order;
- when plan exceeds the maximum, render the first maximum placements and show a truncation warning;
- placement navigation follows placement-ID order;
- selected placement updates archetype, seed, palette, and selected placement ID in the inspector, but does not overwrite header fields until `Adopt Placement` is pressed;
- `Adopt Placement` copies selected placement archetype, seed, and palette into canonical single-preview controls.

Placement inspector displays:

- environment sample;
- all seven biome scores in canonical order;
- geology cell values;
- placement mode;
- archetype/palette selection;
- transform;
- embed depth;
- footprint radius;
- collision descriptor;
- placement fingerprint;
- chunk fingerprint.

## Runtime mode

Runtime mode creates an isolated Phase 8 runtime preview scene.

It must not attach to `WorldApp`.

Controls:

```text
Runtime Radius: 1..4 chunks
Freeze Camera
Flush Unreferenced Cache
Clear Negative Cache
Reset Counters
```

Do not expose a destructive `clear everything` while live references exist.

Show these diagnostics, when provided by Phase 8 runtime stats:

### Streaming

- loaded chunks;
- queued chunks;
- registered placements;
- pending registrations;
- exact dynamic requests;
- library requests;
- placeholder instances;
- degraded dynamic instances.

### Workers and queue

- worker count;
- workers busy;
- pending generation requests;
- completed payload backlog;
- cancelled requests;
- worker failures;
- worker retry count;
- average and maximum worker generation milliseconds.

### Cache

- request-cache hits;
- request-cache misses;
- resolved-asset hits;
- decoded entry count;
- referenced entry count;
- unreferenced entry count;
- decoded bytes;
- configured byte budget;
- evictions;
- negative entries;
- library transport bytes.

### Rendering

- visible instances;
- culled by distance;
- culled by frustum;
- culled by projected size;
- LOD0/1/2/3 visible counts;
- transition count;
- proxy count;
- draw calls;
- shadow draw calls;
- visible triangles;
- active batch count;
- empty batch count.

### Main-thread timing

- last upload milliseconds;
- maximum upload milliseconds since reset;
- upload item count;
- runtime update milliseconds;
- render milliseconds when the bench measures its own renderer;
- frame milliseconds;
- p50/p95/p99 frame milliseconds over configured history window.

When one metric is not exposed by Phase 8, display `n/a`. Do not invent it from unrelated counters.

## Performance history

`StoneAuthoringPerformance` stores a fixed-size ring buffer.

Capacity:

```text
performanceRefreshHz * performanceHistorySeconds
```

Samples are taken at configured refresh rate, not every render frame.

Store:

```ts
export interface StoneAuthoringPerformanceSample {
  readonly timestampSeconds: number;
  readonly frameMs: number;
  readonly renderMs: number;
  readonly runtimeUpdateMs: number | null;
  readonly uploadMs: number | null;
  readonly drawCalls: number | null;
  readonly visibleInstances: number | null;
  readonly decodedBytes: number | null;
}
```

Charts use one HTML canvas and plain 2D drawing. Do not add a chart dependency.

The chart has four selectable series:

```text
Frame ms
Runtime update ms
Draw calls
Decoded MB
```

No automatic threshold colouring is added in Phase 9.

## Configuration workbench

`StoneAuthoringConfigWorkspace` loads all nine YAML sources as text.

For each domain store:

```ts
export interface StoneAuthoringConfigDocument {
  readonly domain: StoneAuthoringConfigDomain;
  readonly sourceUrl: string;
  readonly committedText: string;
  readonly draftText: string;
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly diagnostics: readonly StoneAuthoringConfigDiagnostic[];
}
```

The workbench owns text only. Parsed config objects are produced by validation and passed into a new draft pipeline.

### Editor

`StoneBenchYamlEditor` uses a plain `<textarea>` with:

- monospace font;
- line numbers in a separate synchronized gutter;
- Tab inserts two spaces;
- Shift+Tab removes up to two leading spaces on selected lines;
- Ctrl/Cmd+Enter validates active domain;
- no syntax-highlighting engine;
- no auto-formatting;
- no automatic correction.

### Buttons

In exact order:

```text
Validate Domain
Validate All
Apply Preview
Revert Domain
Revert All
Export Domain
Export All
```

Rules:

- `Validate Domain` parses only the active domain and reports its errors;
- `Validate All` parses all domains, then performs cross-domain compatibility checks;
- `Apply Preview` is enabled only after a successful `Validate All` of the current draft revision;
- `Apply Preview` constructs a completely new `StoneAuthoringPipeline` and swaps it atomically after successful construction;
- old draft pipeline is disposed after the new one becomes active;
- `Revert Domain` restores committed text for one domain;
- `Revert All` restores all committed text;
- `Export Domain` downloads the exact draft text, whether valid or invalid, using the production filename;
- `Export All` downloads one JSON bundle containing all nine exact YAML strings; Phase 9 does not create ZIP files because no ZIP dependency is added.

### Cross-domain validation

After all individual parsers succeed, validate exactly:

1. Phase 3 maximum surface details equals Phase 4 maximum surface details.
2. Phase 4 maximum surface details is compatible with Phase 6 retained detail maxima.
3. Phase 5 canonical fallback seeds remain valid against Phase 3 gallery pairs.
4. Phase 6 LOD boundaries remain compatible with Phase 8 runtime projected-size culling minimum.
5. Phase 7 placement cell size divides active world chunk size.
6. Phase 7 geology cell size is a multiple of placement cell size.
7. Phase 8 runtime library variant count remains exactly eight.
8. Phase 8 dependency fingerprint differs from the committed library manifest dependency fingerprint when any generation-affecting domain changed.
9. When the dependency fingerprint differs, set `libraryCompatible = false`; this is a warning, not a parse error.
10. Authoring config validates against itself.

Do not invent additional hidden compatibility rules.

### Config diagnostics

Use:

```ts
export type StoneAuthoringConfigDiagnosticSeverity =
  | "warning"
  | "error";

export interface StoneAuthoringConfigDiagnostic {
  readonly severity: StoneAuthoringConfigDiagnosticSeverity;
  readonly domain: StoneAuthoringConfigDomain;
  readonly code: string;
  readonly key: string | null;
  readonly relationship: string | null;
  readonly message: string;
}
```

Order diagnostics by:

1. domain canonical order;
2. severity with errors before warnings;
3. key lexicographically, null last;
4. code lexicographically.

## Library compatibility behavior

When draft configuration changes any dependency covered by the Phase 8 library fingerprint:

- show warning: `Committed stone library does not match the active draft configuration.`;
- disable runtime library preview;
- disable `Inspect library asset`;
- keep exact direct generation enabled;
- keep placement planning enabled;
- runtime mode uses exact local generation only when the draft pipeline supports it without the committed library; otherwise runtime mode shows unavailable state;
- never use stale library geometry while claiming it represents the draft configuration.

Reverting to matching committed dependencies restores library compatibility.

## Preset format

`StoneAuthoringPreset.ts` defines:

```ts
export interface StoneAuthoringPresetV1 {
  readonly version: 1;
  readonly name: string;
  readonly state: Readonly<{
    readonly mode: StoneAuthoringMode;
    readonly stage: StoneAuthoringStage;
    readonly archetypeId: StoneArchetypeId;
    readonly requestedSeed: number;
    readonly paletteId: StonePaletteId;
    readonly lodLevel: StoneLodLevel;
    readonly transitionProjectedRadiusPixels: number;
    readonly overlays: Readonly<StoneAuthoringOverlayState>;
    readonly placement: Readonly<StoneAuthoringPlacementState>;
    readonly camera: Readonly<StoneAuthoringCameraState>;
  }>;
  readonly expected: Readonly<{
    readonly effectiveSeed: number | null;
    readonly productionFingerprint: string | null;
    readonly lodSetFingerprint: string | null;
    readonly placementFingerprint: string | null;
  }>;
}
```

Preset filename:

```text
<configured-prefix>-<archetype>-<seed>-<palette>.json
```

Sanitize name only for filename; preserve `name` text inside JSON.

Preset JSON uses two spaces and final newline.

### Import rules

- maximum file size: `1 MiB`;
- UTF-8 JSON only;
- exact version `1`;
- no unknown top-level keys;
- canonical enums only;
- seed valid;
- finite numeric camera and placement values;
- state values clamped only to the same safe camera limits used by the bench;
- expected fingerprints are advisory.

After generation, compare advisory expected fingerprints with actual values and show warnings for mismatches. Do not reject an otherwise valid preset solely because a fingerprint changed.

## Debug bundle

`StoneAuthoringDebugBundle.ts` creates one deterministic JSON object:

```ts
export interface StoneAuthoringDebugBundleV1 {
  readonly version: 1;
  readonly reproductionUrl: string;
  readonly authoringState: Readonly<StoneAuthoringState>;
  readonly configFingerprints: Readonly<Record<StoneAuthoringConfigDomain, string>>;
  readonly libraryCompatible: boolean;
  readonly summary: Readonly<Record<string, string | number | boolean | null>>;
  readonly recipes: Readonly<Record<string, unknown>>;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly fingerprints: Readonly<Record<string, string>>;
  readonly validationIssues: readonly Readonly<Record<string, unknown>>[];
  readonly candidateTrace: readonly Readonly<Record<string, unknown>>[];
  readonly selectedRegion: Readonly<Record<string, unknown>> | null;
  readonly selectedEdge: Readonly<Record<string, unknown>> | null;
  readonly placement: Readonly<Record<string, unknown>> | null;
  readonly runtimeStats: Readonly<Record<string, number | string | boolean | null>> | null;
}
```

Rules:

- no timestamps;
- no browser user agent;
- no hostname except what naturally appears in reproduction URL;
- no absolute local filesystem path;
- no mutable Three.js objects;
- no typed array dumps larger than 256 scalar values;
- geometry arrays are represented by counts and fingerprints, not raw positions;
- canonical JSON with two spaces and final newline;
- same state/config/result produces byte-identical debug JSON.

`Copy Debug` copies the JSON text.

Inspector also provides `Download Debug` with filename:

```text
stone-debug-<archetype>-<requestedSeed>-<palette>.json
```

## Clipboard behavior

`StoneAuthoringClipboard`:

1. use `navigator.clipboard.writeText` when available and page is in a permitted context;
2. otherwise create hidden textarea, select, execute `document.execCommand("copy")`, then remove textarea;
3. return a typed success/failure result;
4. never leave the temporary textarea in DOM;
5. status bar shows result for `2.5` seconds.

Copy URL copies the canonical absolute URL based on `window.location` with canonical query string.

## Contact-sheet mode

Contact-sheet mode renders a deterministic seed range for one archetype, palette, and LOD.

### Controls

```text
Archetype
Palette
LOD
Seed Start
Seed Count
Columns
Include Labels
Generate Sheet
Download PNG
Download Manifest
```

Validation:

- start seed is valid unsigned 32-bit;
- count from `1` through configured maximum;
- columns from `1` through maximum tiles per row;
- LOD canonical;
- generation disabled while invalid.

Seeds wrap unsigned 32-bit.

### Tile ordering

Tile index `i`:

```text
seed = (seedStart + i) >>> 0
```

Row-major order.

### Render dimensions

```text
tileSize = configured tile size
columns = requested columns
rows = ceil(seedCount / columns)
width = columns * tileSize
height = rows * tileSize
```

Configured contact-sheet width is an upper bound. Reject a columns value causing calculated width to exceed it.

### Tile renderer

Use one dedicated offscreen WebGL renderer with:

- pixel ratio `1`;
- tile viewport and scissor;
- sRGB output;
- ACES filmic tone mapping;
- same background and ground colours from contact-sheet config;
- fixed directional and hemisphere lighting matching Stone Bench preview;
- shadows enabled;
- camera FOV `42`;
- yaw `35` degrees;
- pitch `18` degrees.

For each generated stone:

1. obtain requested LOD;
2. calculate exact bounding sphere;
3. set camera target to `(0, height * 0.45, 0)`;
4. calculate camera distance so bounding-sphere diameter occupies `62%` of tile height using exact perspective projection;
5. clamp distance only to avoid camera near-plane intersection;
6. render stone and ground;
7. dispose generated stone resources before moving to the next tile unless a shared Phase 8 cached asset is intentionally used and ref-counted.

### Labels

When enabled, draw labels after WebGL readback onto the 2D output canvas.

Label line:

```text
<seed> · <effectiveSeed> · <shortFingerprint>
```

`shortFingerprint` is first eight hex characters of LOD-set fingerprint.

Use:

- `12px monospace`;
- white text;
- semi-transparent black rectangle behind label;
- configured label-height region at tile bottom.

No other text appears on the PNG.

### PNG determinism

Given the same browser/GPU driver, state, committed code, and configuration, tile layout/cameras/content must be deterministic. Pixel equality across different GPU vendors is not promised in Phase 9.

## Contact-sheet manifest

For every tile:

```ts
export interface StoneContactSheetTileV1 {
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly archetypeId: StoneArchetypeId;
  readonly paletteId: StonePaletteId;
  readonly requestedSeed: number;
  readonly effectiveSeed: number;
  readonly lodLevel: StoneLodLevel;
  readonly productionFingerprint: string;
  readonly lodSetFingerprint: string;
  readonly lodAssetFingerprint: string;
  readonly qualityScore: number;
}
```

Manifest:

```ts
export interface StoneContactSheetManifestV1 {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly includeLabels: boolean;
  readonly configFingerprints: Readonly<Record<StoneAuthoringConfigDomain, string>>;
  readonly tiles: readonly Readonly<StoneContactSheetTileV1>[];
}
```

No timestamp.

Manifest JSON is deterministic, two-space formatted, final newline.

Filenames:

```text
stone-contact-sheet-<archetype>-<palette>-<seedStart>-<count>-lod<level>.png
stone-contact-sheet-<archetype>-<palette>-<seedStart>-<count>-lod<level>.json
```

## Error panel

The `Errors` inspector aggregates:

1. URL diagnostics;
2. generation errors;
3. quality warnings/errors;
4. config diagnostics;
5. preset import warnings;
6. library compatibility warnings;
7. runtime degraded-generation diagnostics.

Order by source category above, then original deterministic order.

Each row displays:

```text
Severity | Source | Code | Key/ID | Message
```

Do not expose raw stack traces by default.

An expandable `Technical details` section may show error name, typed details, and stack when available.

## Status bar

Display, left to right:

```text
Generation state
Generation ms
Current mode
Requested seed
Effective seed
Selected region/placement
Config state
Clipboard/export result
```

Generation states:

```text
Idle
Waiting
Generating
Ready
Error
```

Do not animate a progress percentage for synchronous generation because progress is unknown.

## Keyboard shortcuts

Use exactly:

```text
R          regenerate
L          toggle seed lock
[          previous seed
]          next seed
Shift+[    previous 100 seeds
Shift+]    next 100 seeds
1          LOD0
2          LOD1
3          LOD2
4          LOD3
F          frame selected stone/reset camera distance
S          toggle semantic faces
E          toggle semantic edges
B          toggle bounds
C          toggle ground contact
M          toggle centre of mass
N          toggle face normals
Ctrl/Cmd+C copy reproduction URL when focus is not in an input/editor
Ctrl/Cmd+Enter validate active YAML when focus is in config editor
Escape     clear selected region/edge or close compact side panel
```

Do not intercept shortcuts while typing in normal text/number inputs except the explicit config-editor shortcut.

## Frame selected

`F` computes camera distance from current displayed bounds:

```text
radius = boundingSphere.radius
verticalFovRadians = degToRad(cameraFov)
distance = radius / sin(verticalFovRadians / 2) * 1.18
```

Clamp to configured camera min/max.

Set target height to bounds centre Y.

Preserve current yaw and pitch.

## Authoring configuration fingerprints

For every config domain, calculate one authoring-only fingerprint from exact UTF-8 YAML draft text normalized only by converting CRLF to LF.

Use established dual FNV-1a hashing and return sixteen lowercase hex characters.

This fingerprint is for the debug bundle/config workspace only. It does not replace production parsed-config fingerprints.

Whitespace-only YAML changes therefore intentionally change the authoring text fingerprint.

## Configuration export-all format

Use:

```ts
export interface StoneAuthoringConfigBundleV1 {
  readonly version: 1;
  readonly documents: readonly Readonly<{
    readonly domain: StoneAuthoringConfigDomain;
    readonly filename: string;
    readonly text: string;
    readonly fingerprint: string;
  }>[];
}
```

Order documents by canonical config domain order.

Filename:

```text
stone-config-bundle.json
```

No ZIP and no timestamp.

## Stone Bench application lifecycle

`StoneBenchApp` implements:

```ts
export class StoneBenchApp {
  constructor(canvas: HTMLCanvasElement, profile: RuntimeProfile);
  initialize(): Promise<void>;
  start(): void;
  dispose(): void;
}
```

### Initialize sequence

Perform exactly:

1. load authoring config;
2. load committed Phase 1–8 configuration texts and parse configs;
3. build committed authoring pipeline;
4. build config workspace;
5. decode URL state;
6. construct renderer, scene, camera, lights, and ground;
7. construct debug overlay root;
8. construct UI;
9. bind resize, pointer, wheel, keyboard, popstate, and file-input events;
10. request initial generation;
11. render one startup frame.

### Render loop

The render loop:

1. updates camera orbit inertia only if implemented without new configuration; default implementation has no inertia;
2. updates runtime preview when active;
3. updates performance accumulator;
4. renders active viewport mode;
5. refreshes UI diagnostics only at configured performance refresh frequency;
6. schedules next animation frame.

Do not regenerate stones every frame.

### Disposal

Dispose/revoke:

- active single-stage geometry/material;
- all four LOD comparison assets;
- placement preview assets;
- runtime preview;
- contact-sheet renderer and render targets;
- all overlay geometries/materials;
- ground/grid materials/geometries owned by bench;
- renderer;
- UI listeners;
- window/document listeners;
- state subscriptions;
- config workspace subscriptions;
- outstanding object URLs;
- pending timers/debounce handles;
- file input element if dynamically created.

Repeated `dispose()` must be tolerated.

## Verification architecture

Create `scripts/verify-stone-authoring.mjs` using Vite SSR in the same style as earlier stone verification scripts.

Load:

```text
/src/stones/qa/StoneAuthoringVerification.ts
```

Call exactly:

```ts
await verification.verifyStoneAuthoring();
```

Prefix failures with:

```text
[stone-authoring]
```

Automated SSR verification must test pure authoring logic and production-pipeline integration that does not require a browser DOM/WebGL context.

Browser-only interaction and shader rendering are covered by the manual bench checklist below.

Print one success line containing:

- canonical state case count;
- URL round-trip case count;
- preset round-trip case count;
- debug-bundle determinism case count;
- config-domain validation count;
- production reproduction case count;
- contact-sheet manifest case count.

Do not write files during the verifier.

## Mandatory verification matrix

### Previous-phase compatibility

Run every Phase 1–8 verifier unchanged.

Importing Phase 9 modules must not alter direct Phase 1–8 outputs.

For representative fixed cases, require exact equality before and after Phase 9 imports for:

- core recipe and geometry fingerprint;
- archetype recipe/evaluation;
- detail recipe and asset fingerprint;
- material recipe and material-asset fingerprint;
- Phase 5 effective seed and production fingerprint;
- Phase 6 LOD-set fingerprint;
- Phase 7 placement/chunk fingerprints;
- Phase 8 request key and library variant mapping.

### Authoring config tests

Verify:

- committed YAML parses;
- parsed config is recursively frozen;
- missing key fails;
- duplicate key fails;
- unknown key fails;
- malformed colour fails;
- invalid default archetype fails;
- invalid default palette fails;
- FOV outside range fails;
- camera min above max fails;
- contact-sheet width not divisible by tile size fails;
- default seed count above maximum fails;
- URL maximum below minimum fails;
- invalid export prefix fails.

### Default-state tests

Verify exact default values from this document.

Require deep freeze and no shared mutable nested objects between independently created default states.

### State-controller tests

Verify:

- subscribers receive new state exactly once per successful replace/patch;
- no notification for disposed controller;
- original state is not mutated;
- selected region can be cleared independently;
- patching nested overlay state creates a new frozen overlay object;
- listener unsubscribe works;
- listener order equals subscription order.

### URL round-trip tests

At minimum test:

1. default state;
2. every authoring mode;
3. every pipeline stage;
4. all twelve archetypes;
5. all eight palettes;
6. seeds `0`, `1`, `42`, `0xdeadbeef`, `0xffffffff`;
7. every LOD;
8. every overlay individually;
9. all overlays simultaneously;
10. selected region and edge keys containing punctuation;
11. negative world coordinates;
12. non-default camera;
13. contact-sheet configuration;
14. invalid enum fallback;
15. invalid numeric fallback;
16. overlong URL selection omission.

Require:

```text
decode(encode(state)) == canonicalize(state)
```

and repeated encoding is byte-identical.

### Seed tests

Verify:

- `0 - 1` wraps to `0xffffffff`;
- `0xffffffff + 1` wraps to `0`;
- page stepping wraps;
- unlocked regenerate uses exact `mixStoneUint32(seed + 0x9e3779b9)`;
- locked regenerate preserves seed;
- decimal and hexadecimal inputs normalize to same seed.

### Config workspace tests

Use committed text for all nine domains.

Verify:

- all validate successfully;
- all are initially clean;
- changing one character marks only that domain dirty;
- revert domain restores exact committed text;
- revert all restores every domain;
- invalid numeric value produces error with domain and key;
- unknown key produces actionable diagnostic;
- Validate All produces deterministic diagnostic ordering;
- Apply Preview is disabled after any text mutation until Validate All succeeds again;
- changing generation-affecting config marks library incompatible;
- reverting restores library compatibility;
- whitespace-only text changes change authoring text fingerprint;
- exported bundle document order is canonical;
- export-all JSON is byte-identical across repeated calls.

### Cross-domain compatibility tests

Verify fixtures for each exact relationship:

- Phase 3/4 surface-detail mismatch;
- Phase 4/6 detail incompatibility;
- invalid Phase 5 gallery fallback pair;
- invalid Phase 6/8 projected-size relationship;
- Phase 7 placement cell not dividing world chunk;
- invalid geology multiple;
- Phase 8 variant count not eight;
- dependency fingerprint mismatch produces warning, not parser error.

### Pipeline reproduction tests

Use these exact cases:

```text
rounded-boulder / 42 / slate
weathered-block / 42 / sandstone
leaning-shard / 101 / volcanic
broad-platform / 271 / limestone
tapered-pillar / 331 / mineral-blue
```

For every case:

- single/core matches direct Phase 1 result;
- single/archetype matches direct Phase 2 result;
- single/details matches direct Phase 3 result;
- single/material matches direct Phase 4 result;
- single/quality matches direct Phase 5 result;
- single/lod matches direct Phase 6 result;
- no Phase 9 fingerprint replaces production fingerprints;
- resources are disposable after inspection.

### Preset tests

Verify:

- export then import preserves canonical state;
- JSON output deterministic;
- unknown top-level key fails;
- wrong version fails;
- invalid archetype fails;
- invalid seed fails;
- non-finite camera fails;
- file above 1 MiB fails;
- advisory fingerprint match yields no warning;
- advisory mismatch yields warning but applies state.

### Debug-bundle tests

For the five reproduction cases:

- same result produces byte-identical JSON;
- bundle contains reproduction URL;
- no timestamp field exists;
- no user agent exists;
- no absolute path exists;
- geometry raw arrays are absent;
- config fingerprints exist in canonical domain order;
- recipes/metrics/fingerprints correspond to active stage;
- selected region/edge inclusion is deterministic.

### Semantic overlay source tests

Using Phase 3 detailed geometry fixtures:

- every source triangle is copied exactly once;
- semantic code determines configured colour index;
- source geometry attributes are unchanged;
- enabling/disabling overlay does not change production fingerprint;
- overlay resource disposal is idempotent.

Actual WebGL transparency rendering is manual-browser QA.

### Selection tests

Using deterministic ray/triangle fixtures:

- triangle maps to correct region ID;
- region ID maps to correct stable key;
- selection clears edge selection;
- invalid/missing region attribute leaves selection null;
- selected-region debug object contains exact immutable source values.

### Overlay geometry fixture tests

Verify pure geometry outputs for:

- support polygon closed order;
- bounds padding;
- centre-of-mass vertical line;
- region-normal line lengths;
- collision box dimensions and yaw;
- nine terrain-contact sample ordering.

### LOD comparison tests

For all Phase 3 fixed gallery cases:

- exactly four level descriptors are produced;
- levels ordered `0,1,2,3`;
- camera state shared;
- all coverage values equal one in static compare;
- labels use correct triangle/plane/detail counts;
- no resource is shared in a way that violates Phase 6 ownership when using direct LOD assets.

### Transition-controller tests

Verify exact boundary cycle sequence:

```text
138,120,102,56,48,40,22,18,14
```

Require resolved coverage from real Phase 6 selector and sum-to-one tolerance.

### Placement inspection tests

Use world seed fixtures and chunk coordinates including negatives.

Require:

- bench chunk plan equals direct Phase 7 plan;
- nearest-placement selection deterministic;
- placement navigation follows ID order;
- Adopt Placement copies archetype/seed/palette only;
- environment and geology values are exact;
- whole-chunk truncation keeps first placement IDs;
- placement fingerprint unchanged by Phase 9 inspection.

### Runtime diagnostic adapter tests

Use fake Phase 8 stats snapshots.

Verify:

- every supported field maps to the correct display row;
- missing optional metrics display `n/a`;
- reset clears Phase 9 history only plus explicitly supported Phase 8 resettable counters;
- history ring capacity exact;
- p50/p95/p99 deterministic;
- no sample is taken faster than configured refresh rate.

### Contact-sheet manifest tests

Use a pure fake tile generator for `32` seeds.

Require:

- seed order exact and wraps uint32;
- row/column mapping exact;
- rows calculated correctly;
- tile list immutable;
- manifest has no timestamp;
- repeated serialization byte-identical;
- filename deterministic;
- width limit validation exact;
- count above maximum fails.

### Contact-sheet camera math tests

For known sphere radii:

- camera distance follows exact perspective equation;
- target height equals `height * 0.45`;
- FOV fixed at 42 degrees;
- projected fill target is 62% within numeric tolerance.

No GPU pixel comparison occurs in SSR verification.

### Clipboard fallback tests

Abstract browser calls behind a small testable adapter.

Verify:

- modern clipboard success;
- modern clipboard rejection falls back;
- fallback textarea removed on success;
- fallback textarea removed on failure;
- copied text unchanged.

### Lifecycle tests

Use spies for disposable resources.

Verify:

- stale generation result disposed;
- replacing preview disposes previous preview;
- switching to LOD compare disposes single preview;
- switching from LOD compare disposes all four comparison resources;
- replacing config pipeline disposes old draft pipeline;
- contact-sheet temporary resources disposed per tile;
- generated object URLs revoked;
- repeated bench dispose is safe;
- no state notification occurs after disposal.

## Manual browser acceptance checklist

Open:

```text
?scene=stone-bench
```

Confirm all of the following before Phase 9 is marked complete.

### Reproduction

- Copy URL, open it in a new tab, and get the same archetype, requested seed, palette, stage, LOD, camera, overlays, and selections.
- Production/effective fingerprints match where expected.
- Seed stepping and lock behavior are predictable.

### Shape inspection

- All twelve archetypes can be selected.
- All eight palettes can be selected.
- Semantic face colours clearly distinguish top, side, cuts, contact, and underside.
- Face selection matches the clicked polygon.
- Structural edges can be inspected.
- Bounds, contact polygon, COM, and normals align visually with the mesh.

### Quality inspection

- A fallback case shows requested seed, effective seed, candidate index/kind, and complete trace.
- Quality warnings/errors can be read without opening developer tools.
- Debug bundle contains enough data to reproduce the case.

### LOD inspection

- LOD0–LOD3 compare side-by-side.
- Camera remains synchronized.
- Transition slider shows complementary dithering with no flash.
- Ground contact does not visually jump.

### Placement inspection

- A world coordinate resolves the expected chunk.
- Environment, biome, geology, placement mode, and collision descriptor are visible.
- Whole-chunk preview does not duplicate placements.
- Terrain contact markers explain floating/intersection issues when present.

### Runtime diagnostics

- Cache hit/miss, worker, batch, LOD, proxy, draw-call, culling, and memory counters update.
- History charts update at the configured rate, not every frame.
- Runtime preview can be disposed/recreated without leaking visible meshes.

### Configuration tuning

- Editing a YAML value and validating shows the real parser result.
- Invalid keys and relationships identify the offending domain/key.
- Apply Preview changes only the bench preview.
- Revert restores committed behavior.
- Library incompatibility warning appears after a generation-affecting edit.
- Export Domain downloads exact draft YAML.
- No repository file changes automatically.

### Contact sheet

- A 32-seed sheet renders in deterministic row-major order.
- Labels contain requested seed, effective seed, and short fingerprint.
- PNG and JSON manifest download successfully.
- Repeating without changes produces identical manifest JSON.

## Implementation sequence

Implement in this exact order. Keep TypeScript compiling after each step.

### Step 1 — Authoring config, types, and catalog

Files:

- `stone-authoring.yaml`
- `StoneAuthoringTypes.ts`
- `StoneAuthoringConfig.ts`
- `StoneAuthoringConfigLoader.ts`
- `StoneAuthoringErrors.ts`
- `StoneAuthoringCatalog.ts`

Checks:

- config parses;
- defaults exact;
- canonical orders frozen.

### Step 2 — State and URL

Files:

- `StoneAuthoringState.ts`
- `StoneAuthoringStateController.ts`
- `StoneAuthoringUrlCodec.ts`

Checks:

- immutable state;
- URL round trips;
- history-change reasons defined.

### Step 3 — Production pipeline adapter

Files:

- `StoneAuthoringPipeline.ts`
- `StoneAuthoringGenerationQueue.ts`

Checks:

- fixed reproduction cases match direct Phase 1–6 outputs;
- stale resource disposal works.

### Step 4 — Formatting, presets, clipboard, downloads, debug bundle

Files:

- `StoneAuthoringFormat.ts`
- `StoneAuthoringPreset.ts`
- `StoneAuthoringClipboard.ts`
- `StoneAuthoringDownload.ts`
- `StoneAuthoringDebugBundle.ts`

Checks:

- deterministic JSON;
- import validation;
- fallback clipboard cleanup.

### Step 5 — Debug overlays and picking

Files:

- all files under `authoring/debug/`;
- `StoneAuthoringSelection.ts`.

Checks:

- overlay geometry fixtures;
- production geometry never mutated;
- selection mapping exact.

### Step 6 — Configuration workspace

Files:

- `StoneAuthoringConfigWorkspace.ts`
- `StoneAuthoringConfigValidator.ts`
- `StoneBenchYamlEditor.ts`
- `StoneBenchConfigPanel.ts`

Checks:

- all real parsers wired;
- Apply Preview gating;
- cross-domain diagnostics;
- library compatibility detection.

### Step 7 — Core UI and inspectors

Files:

- `StoneBenchUi.ts`
- `StoneBenchHeader.ts`
- `StoneBenchControlPanel.ts`
- `StoneBenchInspectorPanel.ts`
- `StoneBenchStatusBar.ts`
- `StoneBenchTable.ts`
- `StoneBenchJsonView.ts`
- `StoneBenchStyles.ts`

Checks:

- fixed panel/tab order;
- no duplicate canonical state;
- unavailable controls clearly disabled.

### Step 8 — Performance and runtime diagnostics

Files:

- `StoneAuthoringPerformance.ts`
- `StoneBenchPerformancePanel.ts`

Checks:

- ring buffer and percentiles;
- Phase 8 stats mapping;
- missing values show `n/a`.

### Step 9 — Contact-sheet tooling

Files:

- `StoneAuthoringContactSheet.ts`
- `StoneAuthoringContactSheetManifest.ts`
- `StoneBenchContactSheetPanel.ts`

Checks:

- exact seed/tile ordering;
- camera math;
- deterministic manifest;
- per-tile disposal.

### Step 10 — Stone Bench app and scene integration

Files:

- `StoneBenchApp.ts`
- `src/main.ts`

Checks:

- lazy scene import;
- normal world startup unchanged;
- pointer/keyboard lifecycle;
- all modes switch cleanly.

### Step 11 — Verification gate

Files:

- `StoneAuthoringVerification.ts`
- `scripts/verify-stone-authoring.mjs`
- `package.json`

Run:

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
npm run test:stone-authoring
npm run build
```

Then complete the manual browser acceptance checklist.

## Definition of done

Phase 9 is complete only when:

- every required file exists in the specified location;
- all Phase 1–8 verifiers pass unchanged;
- Stone Bench loads only for `?scene=stone-bench`;
- default state and canonical URL contract match this document;
- all twelve archetypes and eight palettes are reproducible;
- every pipeline stage can be inspected without changing production logic;
- recipe, metric, fingerprint, and fallback data are visible without developer tools;
- semantic face/edge selection is correct;
- contact, bounds, COM, collision, normals, and terrain-contact overlays are correct;
- LOD0–LOD3 compare mode and transition scrubber work;
- Phase 7 chunk/placement inspection reproduces direct planner output;
- Phase 8 runtime diagnostics are visible and accurate for exposed counters;
- all nine YAML configuration domains validate through real production parsers;
- draft config can be hot-applied only after successful full validation;
- stale Phase 8 library usage is prevented when draft dependencies differ;
- preset import/export, Copy URL, Copy Debug, and debug download work;
- contact-sheet PNG generation and deterministic manifest export work;
- all authoring resources are disposed correctly;
- build includes the Phase 9 verifier;
- no Phase 10 rollout or regression-baseline system is introduced.

## Required completion report

The implementation completion note must include:

- commit hash;
- files added and modified;
- all verification commands and results;
- manual Stone Bench URL used for review;
- confirmation that all twelve archetypes and eight palettes were inspected;
- one reproduction URL example;
- one debug-bundle filename example;
- one preset export/import round-trip result;
- semantic picking result;
- LOD comparison and transition result;
- placement inspection result;
- runtime diagnostics result;
- configuration hot-preview result;
- library-incompatibility warning result;
- contact-sheet PNG dimensions and manifest tile count;
- lifecycle/disposal verification result;
- confirmation that Phase 1–8 outputs remained unchanged;
- confirmation that no repository file is mutated automatically by the browser authoring tool;
- confirmation that no Phase 10 functionality was added.
