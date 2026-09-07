# Required WebGPU/TSL foundation for both projects

Updated 2026-09-06 following the user's renderer decision. This is a required first phase of `grass-test-integration-plan.md`, not an optional renderer experiment.

## 1. Final architecture and execution order

Both applications use **Three.js WebGPURenderer + node materials/TSL**, preferring WebGPU and falling back to its **WebGL 2 backend**. TSL describes the shared shaders; the selected backend generates WGSL or GLSL. The ordinary fallback is not the old `THREE.WebGLRenderer` and does not require a second hand-written shader system.

Keep DrusnielGrass's world, grass placement/LOD algorithms, ecology, terrain, water, characters, streaming budgets and application ownership. Migrate their rendering implementations before importing new visible features. Port useful source TSL directly after adapting contracts; do not translate source TSL to GLSL and then back to TSL.

Execute in this order:

1. **T00** from the main plan: freeze current evidence and capture both existing applications.
2. **G00–G01 here, in grass-test:** prove and harden its current WebGPU/TSL and fallback, then align the Three.js version.
3. **G02–G06 here, in DrusnielGrass:** establish the renderer session, migrate all existing rendering features, verify both backends and make auto selection the production default.
4. **T01–T16** from the main plan: integrate the source experiences using the common TSL rendering foundation.
5. Optional **R01** from the main plan: additional measured GPU occlusion/cascaded-shadow optimization. Neither optimization is needed to provide WebGPU support.

The legacy Drusniel renderer is a temporary development comparison path during G02–G05. Remove it from the shipped route in G06. Archive its baseline revision for comparison; do not retain a permanently duplicated runtime architecture.

## 2. What is already implemented and what has not been proved

Inspected local source:

- `F:/Development/grass-test/src/world/createWorld.js` already imports `three/webgpu`, constructs `WebGPURenderer({forceWebGL: Boolean(config.renderer.forceWebGL)})` and awaits `renderer.init()` before creating dependent resources.
- Its active grass, wind, rain, ground, sky, clouds and cinematic shaders use TSL/node materials. Ordinary materials are also present; validate their actual node conversion when used by this renderer.
- `src/rendering/GpuOcclusion.js` guards its custom backend hooks with `isWebGPUBackend`, but depends on r180 internal backend resources and native compute/indirect APIs.
- `src/rendering/CinematicLighting.js` gates multiple cascades on a WebGPU backend. The current configured default is one cascade.
- Source `src/main.js` catches failed startup and replaces the UI with an error. It does not establish transactional cleanup/retry of a partially constructed `GrassDemo`. `createWorld` likewise has several awaited allocations without an encompassing rollback owner. G00 must address these paths.
- Installed source Three.js is **0.180.0**; installed destination Three.js is **0.185.1**. Destination exports both `RenderPipeline` and a `PostProcessing` compatibility export. Inspect installed implementation/types when updating the source pipeline; do not assume all r180 APIs remain equivalent.
- Destination currently constructs `WebGLRenderer` and has many GLSL/onBeforeCompile custom materials and WebGL-specific diagnostic/pass types. Changing its constructor/import alone will not migrate it.

This inspection establishes implementation structure, **not** browser-tested fallback, device-loss recovery or a performance win. Record those results during the tickets below.

Primary documentation checked during planning:

- [Three.js WebGPURenderer migration guide](https://threejs.org/manual/en/webgpurenderer.html): backend fallback, TSL portability, and unsupported legacy shader/postprocessing approaches.
- [WebGPURenderer API](https://threejs.org/docs/pages/WebGPURenderer.html): `forceWebGL` and initialization options.
- Installed destination `node_modules/three/src/renderers/webgpu/WebGPURenderer.js`, `common/Renderer.js`, and `webgpu/WebGPUBackend.js`: actual pinned-version fallback and loss callbacks.

The guide explicitly requires custom ShaderMaterial/RawShaderMaterial/onBeforeCompile effects to move to node materials, and legacy EffectComposer passes to move to node postprocessing. Those restrictions also apply when WebGPURenderer is using its WebGL backend.

## 3. Backend and capability contract

### 3.1 Selection

Both projects expose `?renderer=auto|webgpu|webgl`:

| Requested mode | Behavior |
| --- | --- |
| `auto` (default) | Prefer WebGPU. Allow initialization fallback to WebGL 2. Report actual selected backend and fallback reason in diagnostics. |
| `webgpu` | Request WebGPU and require that the actual initialized backend is WebGPU. Used for tests; fail visibly if it fell back instead of silently recording a WebGL test as WebGPU. |
| `webgl` | Construct WebGPURenderer with `forceWebGL:true`. Run the same portable TSL feature set. |

Source's existing `config.renderer.forceWebGL:true` maps to forced WebGL unless a valid explicit URL selection overrides it. Missing or invalid query selection falls back to configuration/default with one diagnostic. Destination uses its own strict config conventions; do not copy source deep-merge loaders.

Do not decide success from `navigator.gpu` alone. Adapter acquisition, device creation, limits, canvas setup and required shader compilation can still fail. Check the actual backend after `await renderer.init()` and finish representative mandatory shader warmup before calling the session ready. `renderer.isWebGPURenderer` identifies the renderer class, not its selected backend.

In `auto`, allow one controlled WebGL retry if mandatory WebGPU setup fails after initialization and the error is plausibly backend-specific. Dispose the candidate renderer/world before creating the retry with a fresh canvas. Report both errors if both fail. Do not loop forever, swallow general programming errors or label missing assets as GPU incompatibility.

### 3.2 One public adapter, no distributed backend inspection

Proposed source files: `src/rendering/RendererSession.js`, `RendererCapabilities.js`, `RendererRecovery.js`.

Proposed destination files: `src/render/RendererSession.ts`, `RendererCapabilities.ts`, `RendererRecovery.ts`, `GpuTimingAdapter.ts`.

Source may retain its current JavaScript style. Destination ports use strict TypeScript. Do not introduce a shared npm package or a monorepo migration: keep the small adapter contract equivalent, record the source revision, and use equivalent contract fixtures in both projects.

```ts
type RendererRequest = 'auto' | 'webgpu' | 'webgl';
type ActualBackend = 'webgpu' | 'webgl2';

interface RendererCapabilities {
  readonly backend: ActualBackend;
  readonly maxTextureSize: number;
  readonly maxSamples: number;
  readonly gpuTiming: boolean;
  readonly nativeCompute: boolean;
  readonly indirectDraw: boolean;
  readonly colorTargetHalfFloat: boolean;
  readonly sampledDepth: boolean;
}
```

These are **new application fields**, not claims that identical Three.js properties exist. The adapter maps the pinned public API and isolated capability probes into them. Native compute/indirect draw are false on WebGL 2 even if a particular renderer helper can emulate some operations. Do not assume device timestamp support merely because WebGPU initialization succeeded.

Material factories receive the renderer's portable context/capabilities and typed feature uniforms. Only adapter code and explicitly isolated optimization modules may inspect backend internals. If an internal query is unavoidable, pin it, document it and give it a failing fixture on version mismatch.

### 3.3 Portable rendering and optional acceleration

| Feature | Both backends | WebGPU-only enhancement allowed |
| --- | --- | --- |
| All grass LODs / deformation / atlas sampling | TSL node materials and instanced attributes | Optional compute placement/culling after equality/budget proof |
| Terrain / ecology / paths / stones | Same CPU fields and TSL materials | Optional upload scheduling improvements |
| Sky / cloud shadows / volume | TSL raster passes at profile-compatible resolution | Optional compute passes only with raster equivalent |
| Trails / authoring / local ripple data | CPU arrays/textures or TSL ping-pong raster passes | Optional compute updates with identical semantics |
| Water / bed / cascades / refraction | Portable TSL pass graph and correct depth | Optional measured quality increases |
| Bloom / grade / AA / fog | Node postprocessing supported by the active backend | Optional AO/reflection quality where supported |
| General Hi-Z indirect culling | Existing CPU/frustum/terrain-horizon culling fallback | Source-style native compute and indirect arguments |
| GPU timing | Backend-supported timing; otherwise unavailable | Timestamp queries when supported |

WebGL 2 fallback must retain the scene and interactions. It may lower documented optional effects/resource budgets. A plain-colored fallback material that removes grass wind, stone growth or water optics is not feature parity.

### 3.4 Initialization, frame submission and recovery

- Await renderer initialization before capabilities, render-target allocation, compile, PMREM, atlas GPU bake, readback or rendering. Do not run synchronous constructors that assume an initialized device.
- Keep exactly one frame scheduler. Destination may retain its guarded RAF after awaited init, preserving heartbeat semantics. Do not add `setAnimationLoop` beside it. Source may retain its one `setAnimationLoop`.
- Make asynchronous diagnostics/readbacks single-flight. Never await GPU completion synchronously in the gameplay frame loop or leave multiple readbacks piling up.
- Initialization fallback is not automatic hot recovery from later device loss. Use the pinned renderer's loss/error hooks through the adapter. Preserve any callback behavior needed by Three.js; restore/unsubscribe on disposal.
- On runtime loss, stop rendering and input, snapshot logical session state, abort pending uploads/loads, and discard GPU resources. Preserve world seed, character/camera pose, selected settings and authoring data; never serialize native GPU objects.
- Attempt one reconstruction on the same backend when recoverable; in `auto`, if it fails, reconstruct once on forced WebGL. Forced `webgpu` tests surface the failure rather than changing backend silently. Use a fresh canvas if context ownership prevents a different context type on the old canvas. Rebind canvas-dependent input/listeners after replacement.
- If both backends fail, present a readable retry/error state. Do not restart on every frame. Generation tokens prevent callbacks from the old session from publishing into the new one.
- Visibility suspension is not device loss. BFCache, resize and ordinary pause must not needlessly reconstruct a world. Audio/DOM teardown and resumption must preserve browser-gesture rules.

### 3.5 Performance selection policy

Default is WebGPU when successfully available. Support explicit WebGL testing and a user-facing renderer preference applied by a controlled session restart, not mid-frame backend mutation.

Maximum performance is a measured objective, not a promise that WebGPU wins every scene/device. Compare WebGPU, the TSL WebGL fallback, and the old destination baseline at identical density, camera, draw distance, effects and render scale. Disable unproductive optional occlusion/AO/cascades before cutting scene quality. Do not run a hidden startup benchmark, persist hardware fingerprints or switch backends repeatedly based on noisy short samples.

## 4. Required migration tickets

### G00 — Harden and validate grass-test's existing renderer path

**Depends on T00. Work in `F:/Development/grass-test`.**

**Read/modify:** `src/world/createWorld.js`, `src/app/GrassDemo.js`, `src/main.js`, `src/rendering/CinematicPipeline.js`, `GpuOcclusion.js`, `CinematicLighting.js`, configuration validation, loading UI. **Create:** source adapter files in 3.2 and `test/rendererSession.test.js`, `test/rendererRecovery.test.js`, a local browser backend matrix script under `scripts/gpu/`.

1. Keep Three 0.180.0 for this baseline ticket. Add renderer selection and actual-backend diagnostics. Unit tests inject fake init results for missing adapter, device failure and forced modes; they do not fake a successful GPU browser test.
2. Make `createWorld` rollback every allocated renderer/environment/terrain/material/pass when a later await throws. Make bootstrap retain the candidate GrassDemo for disposal on startup failure. Make GrassDemo disposal idempotent and late loads disposal-aware.
3. Run all seven presets, both grass render families/four shapes, painter, character, water, rain and cinematic output on explicitly forced WebGPU and explicitly forced WebGL 2. Assert actual backend in screenshot metadata.
4. Disable native GPU occlusion on WebGL before allocating native buffers/pipelines. Confirm shadow/reflection cameras never inherit main-view indirect visibility.
5. Test the source AO depth-copy workaround, cutout MSAA and color output on both backends. Keep a portable lean output available if an optional pass fails. Mandatory grass/water shader failures must fail the run, not silently remove those systems.
6. Implement bounded renderer recovery using 3.4. A fake loss event tests app logic; a separate real device/context-loss scenario must be labeled and captured where supported. Do not infer real recovery success from only a mock.
7. Source verification: `rtk npm run lint`, `rtk npm test`, `rtk npm run check:docs`, `rtk npm run build`, plus browser matrix. These existing scripts can regenerate leaf variants; inspect/preserve generated and pre-existing audio changes. Add no automated deployment or Actions workflow.

**Acceptance:** both source backends render the actual feature matrix; correct fallback diagnostics; no partial-startup leak; bounded recovery; documented performance and optional-pass limitations. Existing source TSL stays the primary rendering implementation.

### G01 — Align grass-test with destination Three.js before reusing it

**Depends on G00. Work in grass-test.**

1. Pin source Three.js to the destination's inspected **0.185.1**, update its lockfile through npm and record before/after. Keep source Vite/tooling versions unless a demonstrated compatibility failure requires another change. Destination remains on its current Three/types versions; no downgrade to r180.
2. Audit renamed/deprecated node, postprocessing, render-target, shadow and texture APIs against installed 0.185.1. Prefer its `RenderPipeline` for the source node post stack where applicable; verify behavior before removing compatibility APIs.
3. Revisit the source's r180-specific AO depth workaround and material-uniform refresh workaround. Remove only if a regression fixture proves the workaround is no longer needed; keep the reason if still required.
4. Disable the old private `GpuOcclusion` bridge during initial upgrade verification. Port/re-enable it only after all accessed backend attributes, buffer ownership, draw interception and indirect argument layouts are verified against 0.185.1. Gate the optimization off if unavailable; normal draws are valid, missing objects are not.
5. Confirm there is one installed Three.js version with `rtk npm ls three`. Keep intentional imports of `three/webgpu`, `three/tsl`, core math/loaders and addons compatible; do not add blind global import aliases or another vendor bundle.
6. Repeat G00 source checks and compare pinned r180 vs r185.1 fixed-camera captures/timings. Record version-transition regressions separately from backend differences.
7. Refresh integration reference hashes deliberately after these authorized source edits. Keep the initial snapshot/revision available as evidence and identify the stabilized source commit/working-tree hashes the destination port uses.

**Acceptance:** a pinned, working source reference on both backends at the same Three version as destination. This is the reusable renderer/material reference; copying r180 private hooks is no longer an implementation shortcut.

### G02 — Destination renderer session and migration comparison harness

**Depends on G01. Work in `F:/Development/DrusnielGrass`.**

**Create:** destination adapter files in 3.2, `src/dev/RendererMigrationHarness.ts`, `src/render/WorldNodeMaterialContext.ts`, `scripts/verify-renderer-session.mjs` and `scripts/verify-renderer-capabilities.mjs`.

**Modify:** `src/main.ts`, `src/app/WorldApp.ts`, `IslandApp.ts`, `WorldRuntimeGuard.ts`, `GpuFrameTimer.ts`, stats/QA context interfaces, runtime config/diagnostics and affected verification scripts.

1. Adapt source's proven renderer contract to strict TypeScript. Treat renderer creation/init as an async factory; renderer-dependent world construction happens afterward. Keep constructor rollback ownership intact.
   Keep the existing WorldApp architecture line cap. If renderer-session wiring exceeds it, extract the existing development hooks/initialization helpers now; T01 then reuses that extraction rather than repeating it. Do not defer lifecycle fixes or raise the cap merely because feature integration comes later.
2. During migration only, keep legacy world startup as the default working application; add a development-only explicit node-renderer harness. `renderer=webgl` in the node harness means WebGPURenderer forced WebGL, **never** the legacy renderer. Label legacy captures distinctly.
3. The harness first renders a minimal terrain/lighting/material fixture, not the entire old world with incompatible shaders. Add subsystems as G03–G05 migrate them. An incomplete harness must not be presented as the production fallback.
4. Enumerate WebGL coupling with `rg`: `WebGLRenderer`, `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `getContext`, `WebGLRenderTarget`, `PMREMGenerator`, timer queries, framebuffer copies and readbacks. Save the inventory with one owner/status per occurrence.
5. Introduce typed node-material/pass factories that preserve existing public configure/update/dispose contracts. Legacy and node implementations may exist temporarily for A/B, but callers do not access private shader chunks or cast a node renderer to WebGLRenderer.
6. Adapt capability sizing and GPU stats. Replace raw WebGL timer assumptions with the timing adapter; if unavailable, show unavailable rather than zero GPU milliseconds. Preserve active-query cleanup and disjoint/loss handling for fallback where applicable.
7. Add a node pipeline identity fixture with color chart, instancing, alpha cutouts, depth, render target, texture update and screenshots. Test both forced backends before migrating scenery.

**Acceptance:** both node backends initialize/dispose safely in destination; capabilities and backend metadata correct; old application still works during migration; no weakening of legacy behavior/lifecycle tests.

### G03 — Terrain, horizon, sky, cloud lighting and cloud shadows in TSL

**Depends on G02.**

**Migrate:** `TerrainMaterialController.ts`, `TerrainMaterialShader.ts`, `src/world/terrain/TerrainSurface*`, `WorldHorizonMaterial.ts`, `WorldHorizonShader.ts`, `WorldSkyMaterial.ts`, `WorldSky.ts`, cloud pass/volume/temporal/shadow modules, `WorldCloudEnvironmentLighting.ts`, `WorldCloudShadowMaterialPatch.ts`, `WorldCloudShadowSceneIntegrator.ts`.

1. Preserve CPU heightfield, lattice, ecology and vertex attributes byte-for-byte. Port material evaluation and deformation into `*Nodes.ts` helpers and standard/physical/basic node materials, keeping palette compensation and field sampling units.
2. Convert terrain and horizon lighting/fog first. Then port analytic sky. Adapt PMREM using the **node-renderer-compatible** generator/API from the pinned build; legacy generator imports cannot be assumed interchangeable. Verify compact no-environment behavior.
3. Port cloud field math once as composable TSL functions. Keep equivalent CPU reference functions for cloud shadow/transmittance tests. Preserve noise coordinates, world offsets, temporal weights, sun convention and compact analytic fallback.
4. Implement cloud volume, shadow map and temporal reprojection using portable node raster passes, not mandatory native compute. Preserve depth conventions, UV orientation, history invalidation, transparent/opaque ordering and camera-dependent transforms across both backends.
5. Replace global `onBeforeCompile` cloud shadow patches with explicit node composition supplied by `WorldNodeMaterialContext`. Materials created after streaming must receive the same context immediately. Do not keep material callbacks that only worked on legacy WebGL.
6. Retain current appearance/sun constants during this ticket. Weather dynamic sun and palette changes remain T03 in the main plan; isolate renderer equivalence from new art behavior.

**Acceptance:** terrain/sky/horizon/cloud fixtures match the legacy baseline within documented visual tolerance on both node backends; cloud shadow CPU/reference tests pass; no changed world samples, target leaks or wrong history after camera cuts/loss.

### G04 — Every grass representation, interaction texture and foliage in TSL

**Depends on G03.**

**Migrate:** `GrassNearMaterial.ts`, `GrassPaletteShader.ts`, `WorldGrassImpostorMaterial.ts`, `WorldDetailFoliageMaterial.ts`, trail/ground-contact rendering, grass/QA GPU atlas bakers, and their renderer types. Keep existing near/patch/CPU Canvas atlas geometry algorithms.

1. Port segmented ultra-near, single-triangle near, boost, bridge-entry/exit and mid material variants. Preserve instanced transforms, shape bytes, sorted dither coverage, root arc, blade shading, micro-detail fade, ground contact and interaction deformation. Do not replace them with source camera-tiled grass.
2. Keep topology/placement/reference-counting unchanged. Material factories select node features explicitly; source-code string injection becomes shared TSL functions with typed inputs, not one giant pasted WGSL/GLSL function.
3. Port far hemi-octahedral view selection/blending, four subpatch cards, alpha stability, footprint scale, world coverage, terrain/horizon matching and wind. The production atlas is CPU Canvas-generated; preserve it. The island/QA GPU bakers need separate node-compatible camera/material/target/readback paths.
4. Convert grass trail ping-pong updates to portable TSL raster passes, preserving recovery, body/foot/landing channels, scrolling coordinates and exactly-once update order. Do not require storage-buffer compute for interaction to work on WebGL.
5. Share position/deformation and alpha logic with shadow/depth node paths. Check instancing transform order so roots are transformed exactly once. Test negative coordinates, quantized attributes and per-camera bounds.
6. Port detail foliage, legacy island grass and development captures too. A main-world-only port does not satisfy the existing supported scene matrix.
7. Current wind appearance is retained here. Source's more elaborate shared cinematic wind is T02 later, using the now-common TSL material context.

**Acceptance:** existing grass placement, LOD, color, allocation, lifecycle, interaction and impostor contracts pass; both node backends render all LOD bands continuously; same candidate IDs/geometry counts; source-like grass replacement is not used to hide an incomplete migration.

### G05 — Stones, water, actors, scenic materials and remaining render passes

**Depends on G04.**

**Migrate:** stone growth/material shader composition, `WaterMaterialController.ts`, `WaterBedMaterialController.ts`, `WaterCascadeMaterialController.ts`, flow/wave/foam/optics helpers, `WaterRefractionPass.ts`, `ActorEnvironmentResponse.ts`, tree/actor materials, remaining WebGL-specific render utilities.

1. Preserve procedural stone geometry, packing, palettes, growth/wetness and interaction/clearance fields. Port their shader treatment into TSL shared helpers.
2. Port the separate depth-tested water bed, physical surface and waterfall cascade passes. Preserve water coverage/depth/flow/morphology attributes, stone wakes, caustics/foam and lake/river distinctions. Keep hydrology deterministic and unchanged.
3. Adapt refraction color/depth capture to node renderer targets. Prove sampled depth linearization, near/far/projection conventions, y orientation, resize and multi-camera rendering on both backends. Use renderer APIs rather than directly binding WebGL framebuffers.
4. Make every offscreen pass save/restore target, viewport/scissor, clear state and visibility in finally. Prevent recursive water capture and duplicate beauty rendering. Omit native-WebGL-specific state mutations on WebGPU.
5. Convert actor/tree standard materials to node-compatible material/context factories, preserving skinning, vertex colors, texture maps, shadow responses and procedural animation. Asset loaders can remain shared core utilities if compatible with the pinned build.
6. Port diagnostics, isolation hooks, screenshot/readback and renderer-dependent dev tools. Async readback must not stall gameplay or write after disposal. Review automatic mobile GPU compatibility patching and remove/limit WebGL-only driver workarounds where inapplicable.
7. Scan the inventory from G02. Every production renderer dependency is migrated or documented as an optional capability with a correct fallback. No ShaderMaterial/onBeforeCompile effect may remain reachable in the node production route.

**Acceptance:** all existing world and island visual features render correctly on both node backends, including water depth/refraction/cascades, stones and characters. Full required local build passes with appropriately migrated behavior verifiers.

### G06 — Make the shared node renderer production default in both projects

**Depends on G05. Both projects are release candidates.**

1. Set production default selection to `auto` in both applications. Keep explicit forced backends for diagnostics/preferences. Remove legacy WebGLRenderer code from production imports; store baseline evidence in revision/captures. Old GLSL strings retained as documentation must not ship as a second active material implementation.
2. Run complete source checks and destination `rtk npm run build`. Update source-structure verifiers with equivalent node behavior checks; do not delete assertions about deterministic data, allocation, frame ownership or lifecycle because implementation names changed.
3. Browser matrix: actual hardware WebGPU; forced WebGL on that device; unavailable adapter; init rejection; post-init warmup failure; real or explicitly mocked runtime loss; device without usable WebGPU; unsupported optional timing/MSAA; desktop/compact; world/island; pagehide/BFCache/resize.
4. Compare identical scenes across all three recorded baselines: old destination WebGLRenderer, new WebGPU, new TSL WebGL 2. Record warmed median/p95 frame time, GPU timing availability, draw/triangle counts, memory, resolution and active effects. See main plan performance gates; a fallback performance regression remains visible even if WebGPU improves.
5. Verify source compute occlusion is capability-gated on the aligned version and cannot affect portable correctness. Destination uses its existing visibility logic until R01 is explicitly evaluated; WebGPU support is already complete without indirect culling.
6. Test controlled recovery reconstructs a playable world on forced WebGL after WebGPU failure, retains logical state, and does not leak old listeners/targets/canvases. Keep current runtime guards and meaningful error UI.
7. Record both stabilized revisions and shader/pass migration inventory. Only now start main plan T01 feature integration. A successful minimal node-renderer demo is not sufficient for this gate.

**Acceptance:** both applications default to a usable WebGPU renderer and reliably fall back to the same TSL implementation on WebGL 2. All destination pre-existing features survive. Migration performance is measured, all required checks pass, and the old renderer is no longer the production fallback.

## 5. Changes to later feature work

- T02 wind: reuse/adapt source TSL and CPU functions; keep one common wind field. No new GLSL-only material.
- T03 weather: extend migrated node material contexts, sky/PMREM and cloud state.
- T05 rain: adapt source node material directly, preserving its GPU-instanced behavior on both backends with ordinary instanced draws on WebGL.
- T07–T09 foliage/shapes: extend migrated material/geometry contracts, including shadow/depth nodes and atlas consumer paths.
- T10 authoring: shared texture atlas/lookup with TSL sampling; portable CPU/raster updates; compute is optional acceleration only.
- T15 cinematic: use the node postprocessing pipeline; reuse stabilized source pass logic. No EffectComposer, UnrealBloomPass or GTAOPass as the final architecture. Use pinned-version bloom/AO/AA node equivalents, with the main plan's depth, color, mask, quality and performance gates.
- R01: only additional GPU occlusion/cascade optimization. Required WebGPU migration has already shipped at G06.

The main plan's data semantics, feature acceptance checks, asset provenance, user interaction, streaming and deployment policy remain in force. Run every later feature on both forced backends as it lands; do not postpone fallback verification until the end.
