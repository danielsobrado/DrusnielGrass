# grass-test → DrusnielGrass implementation plan

Planning date: 2026-09-06. This is an implementation specification, not a record of completed integration.

**Decision, revised following user direction:** both projects will use **WebGPURenderer with TSL/node materials**, prefer WebGPU when usable, and fall back to its **WebGL 2 backend using the same TSL implementation**. First harden grass-test's existing node-renderer path and align its Three.js version; then migrate DrusnielGrass's existing rendering systems before adding source features. Preserve Drusniel's world/LOD/gameplay architecture throughout.

**Required reading and order:** [WebGPU/TSL migration plan](./webgpu-tsl-migration-plan.md). Execute **T00 → G00–G01 in grass-test → G02–G06 in DrusnielGrass → T01–T16 below**. G00–G06 are required core work, not optional experiments. WebGPU preference is the default policy; measured backend/effect benchmarks determine actual performance.

The desired result is Drusniel's streamed, ecologically varied world, dense continuous grass LODs, paths, stones, rivers, waterfalls, procedural characters and mobile support, enriched with selectable weather, coherent wind, rain, wet surfaces, spatial audio, richer trees, falling leaves, birds, grass shapes and painting, scenic tours, character selection, cinematic presentation and a usable settings panel.

## 1. Instructions for the implementing AI

1. Read this document and `docs/plans/webgpu-tsl-migration-plan.md` completely before editing runtime code. Follow the combined order above. Complete one ticket before starting the next.
2. All destination-relative paths in this document are rooted at `F:/Development/DrusnielGrass`. All paths prefixed `SOURCE:` are rooted at `F:/Development/grass-test`. A file labeled **new** is a proposed file to create; its API does not exist yet.
3. Source files are references. Do not copy an entire directory, dependency manifest, lockfile, stylesheet, configuration file or application class.
4. Use TypeScript with the destination's strict compiler settings. Source hardening can retain source JavaScript conventions. Do not introduce `any`, `@ts-ignore`, a second Three.js copy, or destination `allowJs` to make source code compile.
5. Keep destination Three.js `0.185.1`, its matching types, Vite and Node policy. G01 explicitly upgrades and pins source Three.js from installed `0.180.0` to `0.185.1`, validating both backends. Source Vite 7, Rapier and js-yaml do not replace destination tooling/config/movement dependencies.
6. Prefix shell commands with `rtk`, following `C:/Users/User/.codex/RTK.md`. Run commands from the correct repository. Use `rtk proxy` for commands without a direct RTK wrapper.
7. Preserve existing changes in both repositories. G00–G01 intentionally edit source renderer-related files; do not overwrite unrelated audio/assets. Do not reset, clean, stash, commit or move source work as an integration shortcut.
8. Build and verify locally with `rtk npm run build`. Do not add, configure or use GitHub Actions. Do not import Wrangler or Cloudflare deployment files.
9. Do not weaken existing verification assertions to make a feature pass. If a refactor invalidates an assertion about source structure, replace it with an equivalent or stronger assertion about the intended behavior and document the reason.
10. Every new system needs an explicit owner, failure handling, finite input validation, bounded allocation, and idempotent disposal. Optional system failure must leave movement and base rendering available.
11. Do not claim visual or performance improvement based only on a successful build. Run the fixed-camera and movement checks in section 7.
12. Commit-sized tickets are work boundaries, not permission to publish. Publishing is a separate final operation using `npm run deploy:pages` from a clean working tree when deployment is requested.

## 2. Evidence and baseline

### 2.1 Revisions inspected

| Repository | HEAD when inspected | Working tree when inspection started |
| --- | --- | --- |
| Destination | `5a2200558672e13c7fef55e7bc249a599d0b3479` | Clean |
| Source | `97db53662d4239f02a0f9a883fe1ba8a7602ed4f` | Modified audio and untracked sound-bank assets/scripts/cache |

The source revision alone does **not** reproduce all local source content. In particular, `public/Assets/Audio/insect2_alt.mp3` was modified, and `CATALOG.md`, the `ambient`, `footsteps`, `water`, `wildlife`, and `transitions` directories and several audio preparation scripts were untracked. Inventory the current state again before implementation.

Follow-up renderer inspection confirmed source already constructs `WebGPURenderer`, awaits `init()` and supports `forceWebGL`. G00 verifies/hardens those paths; it does not begin by rewriting an imagined legacy source renderer. See the migration plan for pinned-code findings and official Three.js references.

The destination's `npm run build` was run during planning and exited **0**, including its local verification chain and production build. Output also contained Vite dependency-scan messages saying the server was restarting/closed and requests were outdated, plus the large-chunk warning. Record these as existing diagnostics; this plan does not diagnose or repair them. No source application build, browser visual comparison, audio listening test or GPU benchmark was performed during planning.

### 2.2 Trust executable code over stale documentation

Observed contradictions that matter:

- Source `src/main.js` starts `GrassDemo`, not `NatureApp`. Old source `docs/architecture.md` describes the latter and incorrectly says the active world has no external assets.
- Source `src/config/loadConfig.js` loads **nine** YAML layers, ending in `characters.yaml`. README/runtime-lifecycle descriptions list fewer layers.
- Source `EnvironmentController` applies a hard cut behind `IrisTransition`; it does not interpolate the visual environment each frame.
- Source `characters.yaml` currently offers Drusniel, Enanillo and Paladin. The README's Samurai description is historical.
- Source `cinematic-look.yaml` substantially overrides Emberfall. Its current merged sun offset is `[-28, 65, -30]`, fog density is `0.0015`, and base/tip grass colors are `#50852b` / `#a6bf65`; older preset documentation differs.
- Destination's current default grass art key is `muted-meadow` in `src/grass/GrassArtDirection.ts`, despite older README passages describing `lush-hero` as default. Preserve the executable default for the integration baseline.

See the companion `grass-test-integration-reference.json` for the source's merged preset, wind, rain, presentation and roster data captured during planning. This is reference data under `docs`, not a runtime import. It includes source paths/hashes so later changes can be detected. Runtime defaults in source code can augment YAML; for example WindField's warp defaults must be obtained through `resolveWindConfig`, not inferred from the YAML alone.

### 2.2b Renderer files where the two repositories have diverged

The destination's `src/render/RendererCapabilities.ts`, `RendererRecovery.ts` and
`RendererSession.ts` were ported from the source's `src/rendering/*.js`
counterparts during G00. Two defects came across with them, were found by the
G04/G05 comparison work, and have now been fixed **on both sides**. Both fixes
are held by a check in each repository, and both checks were confirmed to fail
against the unfixed code:

| File | Defect | Destination | Source |
| --- | --- | --- | --- |
| `RendererCapabilities` | The WebGL 2 branch probed only `EXT_color_buffer_float`, so a device exposing only `EXT_color_buffer_half_float` reported no renderable half-float target | Fixed; held by `scripts/verify-renderer-session.mjs` | Fixed; held by `test/rendererSession.test.js` |
| `RendererRecovery` | The exhausted-backends path threw into the shared catch, which released a second time. A throwing release there replaces the recovery failure the owner must present with the cleanup error | Fixed; held by `scripts/verify-renderer-session.mjs` | Fixed; held by `test/rendererRecovery.test.js` |

Two consequences for the T-tickets:

- **Do not re-import these three files from source when pulling its features
  across.** The destination copies are the corrected ones and carry comments
  explaining why. Re-syncing a whole directory would silently reintroduce
  either defect if the source is ever rolled back.
- The half-float probe is latent in source rather than actively wrong: nothing
  there reads `colorTargetHalfFloat`. In the destination it is load-bearing,
  because the grass trail pass selects its precision from it, and a byte target
  is a different decay floor rather than a lower precision.

The remaining renderer findings from the migration are **not** shared. The trail
priming feedback loop was the destination's own: the source's interaction map is
a CPU `Uint8Array` and `DataTexture`, with no ping-pong target to bind as both
attachment and sampler. The source has no render-target readback helper, so the
row-padding finding does not apply to it either.

The defects found while porting the destination's water, cascade, refraction and
actor materials are likewise not source defects. All of them — the second copy
of the base roughness, the OPAQUE alpha clamp, float addition order — are
artifacts of running a node implementation beside a GLSL one and comparing them
numerically, which the source never does. The source sets `roughnessNode` from
an explicit uniform and has no GLSL reference to match.

### 2.3 Existing destination responsibilities to preserve

| Responsibility | Current owner(s) | Integration rule |
| --- | --- | --- |
| Startup / world-vs-island routing | `src/main.ts` | Keep one bootstrap and existing lazy development hooks. |
| Scene, renderer, frame loop, construction rollback | `src/app/WorldApp.ts` | Remains composition root; extract small helpers before growing it. |
| Runtime fault isolation | `WorldRuntimeGuard.ts`, `WorldFrameMetrics.ts` | New systems get separate failure domains. |
| Terrain truth | `src/world/TerrainField.ts`, `TerrainHeightLattice.ts` | Keep deterministic height, surface, path and water queries. |
| Terrain / water / horizon residency | `src/world/TerrainStreamer.ts` | Remains the owner; avoid duplicate scenery terrain. |
| Near, bridge, mid, far grass | `WorldGrassSystem.ts`, `WorldNearGrassField.ts`, tile/patch/atlas factories | Preserve placement identity and complementary handoffs. |
| Biome/community color | `GrassPaletteShader.ts`, `TerrainSurfacePalette.ts`, community/biome modules | Weather is an appearance modifier, not a replacement ecology system. |
| Footfall, body and landing deformation | `src/grass/interaction/GrassInteractionField.ts`, `GrassTrailField.ts` | Preserve this interaction field; painter is separate persistent authoring. |
| Sky and cloud lighting/shadows | `WorldEnvironmentController.ts`, `WorldCloudEnvironmentLighting.ts`, `src/world/sky/` | Extend one environment; never overlay a second sky/cloud implementation. |
| Trees / ecology crowns | `WorldTreeField.ts`, `CanopyShadeField.ts`, `WorldTreeSystem.ts` | Tree appearance may change; tree identity and ecology must remain stable. |
| Deer and villagers | `WorldFaunaSystem.ts`, actor runtime | Retain; add birds alongside them. |
| Player movement, jumps, camera and water traversal | `src/controls/ThirdPersonController.ts` | Keep movement authority; add narrow presentation/event APIs. |
| Imported rig proof | `src/character/gltf/`, `src/dev/ActorExtensibilityProof.ts` | Useful infrastructure, not a ready-made playable source-GLB adapter. |
| Settings and visibility | `HudSettingsStore.ts`, `HudSettingsController.ts`, `UiVisibilityController.ts` | Extend existing ownership and preserve movement inversion. |
| Visual regression locations | `src/qa/WorldVisualMatrixLocations.ts`, `WorldVisualMatrixPoses.ts` | Extend these rather than introducing unrelated camera fixtures. |

## 3. Feature disposition: what “best from both” means

Every substantive source feature has a destination decision below. “Adapt” means reproduce the useful behavior in the destination architecture, not source scene parity.

| Source capability | Decision | Ticket | Specific reason |
| --- | --- | --- | --- |
| Seven environment presets | Adapt all seven; retain an eighth `drusniel` baseline | T03 | Weather is missing as a coordinated user control. |
| Circle iris transitions | Port DOM behavior to TypeScript | T04 | Renderer-independent and already handles coalescing/reduced motion. |
| Loading / Start presentation | Adapt to real destination readiness | T04 | Source progress percentages do not match streamed startup. |
| Cinematic multi-scale wind | Port equations + shared wind state | T02 | Trees/leaves/rain/grass should respond to the same moving field. |
| GPU-instanced rain | Adapt source TSL/node material | G06, T05 | Destination has the same node-renderer architecture before integration. |
| Rain wetness / water ripples | Extend existing materials and water | T05 | Keep river flow, physical water, cascades and stone wetness. |
| Ambient, random positional, footstep, transition audio | Adapt all categories | T06 | Use world ecology/hydrology and procedural gait instead of source masks/mixer. |
| Rich tree foliage and far trees | Adapt geometry/LOD ideas to existing tree field | T07 | Existing tree silhouettes are primitive; ecology already defines placement. |
| Zone-aware falling leaves and leaf variants | Adapt using canopy/habitat lookup and deterministic pools | T08 | Named GLB zones do not exist in the procedural world. |
| Deterministic animated birds | Adapt to bounded streamed bird groups | T08 | Existing fauna does not replace airborne birds. |
| Meadow flowers / understory | Merge missing visual variety into existing detail foliage | T07 | Destination already has ecology-aware flowers and understory. No duplicate meadow layer. |
| Four grass silhouettes | Adapt as an appearance choice across every destination LOD | T09 | Source blade/billboard families are not destination LODs. |
| Grass Painter, brush height, preview, export | Build on a sparse world-coordinate authoring layer | T10–T11 | A single static mesh UV mask cannot represent the streamed world. |
| Interaction on/off control | Add an explicit grass-deformation setting | T04 | Toggle deformation independently from movement, audio and persistent painting. |
| Scenic Tour | Port camera experience with terrain/water-aware route generation | T12 | Source route assumes a finite authored scene and one water plane. |
| Character picker / three source character appearances | Add playable appearance abstraction, then vetted GLBs | T13 | Keep procedural ranger and locomotion; source rigs require their own adapter. |
| Shoulder framing / zoom / procedural locomotion | Retain destination behavior; add normalized framing metadata | T13 | Most capability already exists. Do not replace jumping/mobile/navigation. |
| Lanterns and authored world props | Add a small procedural prop vocabulary and placement records | T14 | Source transforms and hidden mesh-name collision metadata are scene-specific. |
| Rapier capsule / terrain collisions | Preserve destination terrain motion; add bounded solid-prop collision | T14 | Copying Rapier creates competing movement authorities and expensive streamed colliders. |
| Terrain PBR blend / shared meadow palette | Extend destination surface palette and optional detail texture hooks | T03, T07 | Retain procedural paths, ecology, terrain lattice and scale. |
| Geometric water, reflection, rain response | Keep destination water; adapt weather and optional local reflection | T05, T15 | Source global water plane is a regression for rivers and waterfalls. |
| Bloom, grading, vignette, AA, height fog | Shared TSL node pipeline with quality caps | G01, T15 | Reuse stabilized source node passes on both backends. |
| GTAO | Prototype as an opt-in high-quality pass with correct deformed depth | T15 | A naive override-material pass renders the wrong grass geometry. |
| Cascaded shadows | Keep stable single shadow region; optional measured optimization | R01 | Source's active default is also one region; cascades multiply vegetation work. |
| GPU Hi-Z / indirect occlusion | Verify source bridge during upgrade; optionally adapt destination acceleration | G01, R01 | Native compute/indirect support needs capability checks and ordinary-draw fallback. |
| WebGPU with WebGL fallback | Required foundation for both applications before feature integration | G00–G06 | One portable TSL implementation; preserve destination algorithms while migrating custom materials. |
| Config dump, focused tests, lifecycle checks | Add integration reference dump and focused destination verifiers | T00, T16 | Preserve destination strict config/build conventions. |
| Source Cloudflare deployment | Do not port | — | Destination policy is manual GitHub Pages only. |
| Reference terrain/sky plane/old Samurai path | Do not load into main world | — | Preserve destination terrain; useful assets must be individually vetted and adapted. |

G00–G06 are part of the core definition of done. R01 only adds optional GPU occlusion/cascaded-shadow optimizations after backend correctness and performance have been established. No core feature may require native compute or indirect draw support to work on WebGL 2.

## 4. Shared design contracts

These contracts are **proposed additions**. Implement them in T01 and the owning feature ticket. Do not write callers against imaginary existing methods.

### 4.1 Ownership and frame order

`WorldApp` keeps ownership of the renderer and one animation loop. New owners:

- **new** `src/app/WorldExperience.ts`: constructs/disposes optional presentation, audio, painter, tour and settings controllers; coordinates their narrow public APIs. It must not own terrain generation or duplicate the frame loop.
- **new** `src/runtime/WorldViewState.ts`: the active camera/input mode, gameplay position, view focus, saved camera/controller state and temporary mode exit handling.
- **new** `src/world/weather/WorldWeatherState.ts`: runtime preset, continuous weather values, phase clock and shared read-only snapshot. Data + pure math; no scene traversal.
- **new** `src/world/authoring/WorldAuthoringField.ts`: persistent editor overlay. Never owned by an evictable render tile.

Use explicit typed calls between owners. Do not add a generic plugin/event-bus framework. Callbacks for footsteps and setting changes are sufficient.

After integration, frame phases must be:

1. Sanitize/clamp delta with the existing destination policy; begin frame metrics.
2. Apply queued UI commands. At most one transactional expensive appearance change in progress.
3. Update the active controller. Resolve view mode, camera, gameplay pose and streaming focus.
4. Advance weather/wind once. Update environment, sunlight, cloud shadows and cloud volume from that snapshot. Run registered actor/QA observers in their documented position.
5. Update terrain, stones and grass using the existing shared build deadline and reserved budgets. The grass trail texture updates exactly once before grass draws.
6. Update scenic trees/fauna, rain, leaves, birds, contact ripples and audio using the same phase/pose snapshot. Lightweight visual systems have their own guard entries.
7. Render water refraction with the active camera. Render the scene directly or through the cinematic pipeline. Update GPU statistics around the complete intended render workload.
8. Update HUD/minimap/loading readiness.

Do not tie environment progression or reveal readiness to `controlsEnabled`. Currently they live inside `WorldApp.updateControls`; move them into explicit phases while preserving lifecycle checks. Pausing gameplay for a tour or painter must not freeze clouds or break streaming.

`WorldFrameSubsystem` and failure dispatch must recognize added names. The current fallback branch disables HUD; adding `audio` without updating that branch would disable the wrong system.

At all awaits: check disposal/generation before publishing loaded assets; dispose a late result. Teardown order: stop callbacks/input → optional presentation/audio/effects → scenic/controller/streamed systems → environment → renderer. Cleanup failure in one owner must not abandon the remaining owners. Required renderer session/recovery ownership from G00–G06 takes precedence over the old WebGL-only construction assumptions.

### 4.2 Gameplay position versus rendering focus

Proposed `WorldViewState` modes: `play`, `fly`, `tour`, `paint`, `qa`. A modal settings/map overlay blocks movement without changing the underlying camera mode.

- `gameplayPosition`: actual controlled character feet; used for footsteps, interaction and collision.
- `streamingFocus`: terrain subject/camera-local focus for the active view. Terrain, stones, trees, leaves, birds, cloud shadows, rain and nearby water must use it consistently.
- `camera.position`: remains the distance/frustum input for grass LOD.
- `listenerPosition`: actual camera, because that is where the user hears from.

Tour/painter use their view focus without teleporting the player through the world. Entering a temporary mode snapshots camera transform, orbit yaw/pitch/distance, actor visibility and enabled state. Exit restores those values, resets stale input and resettles camera collision. Capturing only camera quaternion is insufficient: the next third-person update would overwrite it.

Add narrow controller methods in T01: `setEnabled(boolean)`, `saveViewState()`, `restoreViewState(state)`, `getGameplayPose(target)`, `setCharacterVisible(boolean)`. Implement for fly controls with meaningful no-character results. Keep `getStreamingPosition`, `captureLookAt` and `teleport` semantics compatible with existing QA.

### 4.3 Weather, ecology, art and quality are separate

Proposed preset IDs: `drusniel`, `sunny`, `goldenHour`, `rainy`, `windy`, `calm`, `bowed`, `moonlight`.

- **Ecology** decides species, placement, intrinsic palettes, moisture/rock/path/water suitability. It is a pure function of destination world configuration and coordinates.
- **Grass art** retains destination art presets and LOD schedules.
- **Weather preset** controls illumination, sky, cloud weather, wind response, rain, material wetness and audio mix. It does not regenerate the world.
- **User modifiers** control wind gain, blade height gain and simulation speed. They start at 1, apply after the preset, and reset to 1 on selecting another preset. This matches the useful source reset behavior without mutable deep-merged config.
- **Quality** changes resource budgets. Selecting a weather or silhouette must not silently select quality or reduce density.

Use immutable configuration plus a mutable per-world runtime state. Destination runtime profiles are frozen; do not mutate `profile.cloud` or use module-global setters as the long-term state owner.

Proposed snapshot data:

```ts
type WeatherPresetId = 'drusniel' | 'sunny' | 'goldenHour' | 'rainy'
  | 'windy' | 'calm' | 'bowed' | 'moonlight';

interface WeatherSnapshot {
  readonly revision: number;
  readonly presetId: WeatherPresetId;
  readonly simulationSeconds: number;
  readonly sunDirection: Readonly<{ x: number; y: number; z: number }>;
  readonly windDirection: Readonly<{ x: number; z: number }>;
  readonly windGain: number;
  readonly restBendGain: number;
  readonly rainIntensity: number; // [0, 1], visual precipitation
  readonly wetness: number;      // [0, 1], accumulated material response
}
```

Keep detailed color/light/sky preset data in a separate typed `WorldEnvironmentPreset` passed at preset changes. Avoid allocating color objects or configuration copies each frame. Consumers may borrow snapshots for the frame; persistent consumers must copy scalar values.

### 4.4 Configuration and settings

Add **new** `public/config/experience.yaml`, `src/runtime/ExperienceConfig.ts`, `ExperienceConfigLoader.ts`, `ExperienceConfigValidator.ts`. Use existing `fetchConfigText`, `FlatConfig`, `FlatConfigValueReader` and `assertFullyConsumed`. Do not introduce js-yaml runtime merging.

Store structured built-in catalogs in typed TS or imported JSON under `src/` (the existing grass art JSON is the precedent). Flat runtime YAML contains feature switches and budgets, not nested preset dictionaries. Use the flat parser's actual boolean syntax and validate the file in T01.

Initial proposed YAML keys; these are implementation defaults, not measured performance claims:

| Key | Default | Validation / meaning |
| --- | --- | --- |
| `weatherEnabled` | true | Baseline preset still available when false. |
| `rainEnabled` | true | No rain buffers allocated until a rainy state is requested. |
| `audioEnabled` | true | Playback requires a browser gesture and user sound setting. |
| `leavesEnabled` | true | Allocate only when appropriate habitat is nearby. |
| `birdsEnabled` | true | Independent of deer/villager counts. |
| `painterEnabled` | true | Authoring textures allocated on demand. |
| `tourEnabled` | true | Explicit user action starts tour. |
| `cinematicEnabled` | true | Uses lean baseline pipeline until T15 passes gates. |
| `desktopRainCount` / `compactRainCount` | 4000 / 1000 | Integer, 0–10000. |
| `desktopLeafCount` / `compactLeafCount` | 192 / 48 | Integer, 0–512. |
| `desktopBirdCount` / `compactBirdCount` | 12 / 4 | Integer, 0–32. |
| `desktopAudioVoices` / `compactAudioVoices` | 16 / 8 | Integer, 1–32, includes loops and one-shots. |
| `desktopPostSamples` / `compactPostSamples` | 4 / 0 | Integer, one of 0/2/4; clamp to GPU support. |
| `authoringTileSize` | 32 | Metres; initially require exactly 32. |
| `authoringTileResolution` | 128 | Initially require exactly 128; 0.25 m per texel. |
| `authoringMaxTiles` | 1024 | Integer, 1–1024. Reject further edits visibly when full. |
| `tourDurationSeconds` | 30 | Finite, 10–120. |
| `wettingSeconds` / `dryingSeconds` | 8 / 45 | Finite and >0, ≤300. |

Add source-of-truth catalogs for preset IDs, silhouettes and character IDs. Do not cram strings into a number reader. Built-in default selection is `drusniel`; validated URL overrides are `weather`, `shape`, `character`, `quality`, `post`, and `windModel`. Preserve existing query parameters (`grassArt`, `profile`, `tier`, `control`, `view`, `qa`, etc.). Invalid optional query values fall back with one diagnostic; malformed required YAML fails with the existing readable config error.

Precedence: built-in default → valid stored user setting → explicit valid URL override. Also preserve the required `renderer=auto|webgpu|webgl` selection from the migration plan; a renderer preference change performs a controlled session restart. Existing `profile`/`tier` testing overrides remain authoritative over the ordinary quality selector. A manual quality selection clears only the session tier override that it replaces; do not rewrite unrelated query parameters.

Extend `HudSettingsStore` with a versioned schema for weather, shape, character ID, quality, render scale, master/ambient/effects volume and existing inversion. Validate each property; ignore unknown stored fields; migrate existing inversion value. Store painter documents in IndexedDB, not localStorage. Test unavailable/quota-exceeded storage.

## 5. Non-negotiable integration details

### 5.1 Shared renderer and TSL boundary

Use `WebGPURenderer` from `three/webgpu`, with `three/tsl` helpers and node materials. The normal WebGL 2 fallback is a backend of that renderer, not a switch to `THREE.WebGLRenderer`. Await renderer initialization before allocating dependent passes/material resources. Test both actual backends for every feature.

Source `src/world/RainSystem.js`, `src/app/NatureApp.js`, and old grass shader files are not proof of the active rendering path. Follow imports from `GrassDemo`.

The initial plan inventoried legacy `EffectComposer`/WebGL passes; **do not use them for this revised architecture**. Use pinned-version node postprocessing (`RenderPipeline` and TSL pass/effect nodes). G01 verifies source's r180-specific workarounds and backend hooks against 0.185.1 before reuse. Native compute/indirect acceleration remains optional and isolated; portable scene materials use shared TSL.

### 5.2 Sun direction has several owners today

T03 must replace fixed *rendering* sun direction consumers together:

- `src/app/WorldEnvironmentController.ts`: sun position, shadow axes, snapped focus cache.
- `src/app/WorldCloudEnvironmentLighting.ts`: lighting baseline and cloud transmittance sampling.
- `src/world/sky/WorldSkyMaterial.ts`, `WorldCloudPassMaterials.ts`, `WorldCloudShadowMap.ts`: sky sun and volume/shadow ray direction.
- `src/world/horizon/WorldHorizonMaterial.ts`: horizon lighting.
- `src/world/hydrology/WaterMaterialTuning.ts` and `WaterMaterialController.ts`: water lighting direction.
- `src/grass/interaction/GrassGroundShadow.ts`: projected actor contact shadow direction.

`CanopyShadeField.ts` and `WorldEcologyField.ts` also import `WORLD_SUN_DIRECTION`, but these represent long-term ecological exposure. **Keep their reference direction deterministic.** Otherwise a weather selection moves vegetation/biome boundaries. Name/document this distinction explicitly.

QA's `WorldVisualMatrixLocations.ts` uses a fixed sun for capture framing. Keep baseline fixtures fixed; add preset-aware fixtures explicitly rather than letting screenshots silently rotate when weather changes.

When direction changes, recompute the shadow basis and invalidate `shadowFocusX/Y/Z`, even if the player did not move. Normalize vectors and choose a stable fallback axis for nearly vertical light. Invalidate cloud temporal history and cloud-shadow cached projections before the first newly lit frame. Reapply environment state after WebGPU device reconstruction or WebGL context restoration through the renderer session.

### 5.3 Wetness is not water depth or ecology moisture

Rain accumulates visual wetness. It must not change procedural lake levels, river discharge, erosion, collision ground, biome identities or stone placement. Preserve all existing water/stone-specific wetness effects and combine visual amounts as `1 - (1 - existingWetness) * (1 - rainWetness)`, rather than summing beyond 1.

### 5.4 Persistent painting is not a grass footprint texture

`GrassTrailField` moves with the character and recovers over time. Do not use it for painting. Painted edits use stable world coordinates, survive render-tile eviction, and are explicitly saved/exported. Section T10 defines the data format and exact meaning of Add/Erase/Reset.

### 5.5 Asset provenance is an actual source constraint

The source README states it includes copied reference assets, while its old asset-policy document says the app has no external assets. Source `CATALOG.md` claims 61 CC0 sounds but does not itself establish per-file origins. This plan does not certify those claims.

For each imported asset record relative path, byte size, SHA-256, source record/URL, author/vendor, license text, acquisition date if available, transformations and attribution. Use the source sound preparation records as leads. If provenance is missing, implement the feature with procedural visuals/synthesized sound or already-cleared assets and mark that individual asset pending. Do not block unrelated integration work.

Do not transfer `.cache`, downloaded source packs, obsolete GLBs, debugging screenshots, root-relative URLs, or entire `public/Assets`. Use a destination **new** `public/assets/experience/` directory and extend `THIRD_PARTY_NOTICES.md` plus the existing legal/built-site checks when actual assets are added.

## 6. Implementation tickets

Each ticket must produce a reviewable diff, a short verification record and a passing local build. New `verify-*.mjs` files should follow the existing scripts' way of loading TypeScript. Test semantics and real failure cases; avoid tests that merely search for the newly written method name.

### T00 — Freeze evidence and create comparable captures

**Depends on:** nothing. **Risk:** low.

1. Record both current HEADs and `rtk git status --short`. Do not assume the planning revisions are still current.
2. Read source configuration through `scripts/mergedConfig.mjs` / `loadMergedConfig`, which follows `CONFIG_FILES`. Record source code defaults separately through `resolveWindConfig`.
3. Recheck the companion reference JSON against current source file hashes. Update it deliberately if source changes are relevant; explain differences in the work log.
4. Create **new** `docs/plans/grass-test-integration-progress.md` with each ticket pending, current revisions, baseline build result and capture locations.
5. Run destination build once. Record exit status and diagnostics. Do not “fix” baseline appearance while collecting reference data.
6. Capture destination desktop/compact, world/fly/island using existing visual QA tooling. Capture source in its own dev server for the seven presets, four shapes, painter, tour, characters and rain. Source build/pretest hooks regenerate leaf files, so record any generated changes if those commands are used; do not clean them automatically.
7. Hold viewport, camera pose, quality, render scale, world seed, art key and animation time fixed for A/B shots. Use source screenshots as a visual brief, not a demand for coordinate-identical authored terrain.

**Acceptance:** baseline artifacts can be regenerated; both repositories' original changes are preserved; no production code changed in this ticket.

### T01 — Add configuration, view ownership and optional-system lifecycle

**Depends on:** T00 and required G00–G06 renderer migration. **Risk:** medium; perform before adding visible effects.

**New:** files named in 4.1/4.4, `src/app/WorldDevelopmentHooks.ts`, `scripts/verify-experience-lifecycle.mjs`, `scripts/verify-experience-config.mjs`.

**Modify:** `WorldApp.ts`, `WorldController.ts`, `ThirdPersonController.ts`, `FlyWorldController.ts`, `WorldFrameMetrics.ts`, relevant runtime guard and existing lifecycle verification scripts.

1. Extract development attachment work (`attachActorProof`, visual-matrix support, lazy menus) from `WorldApp` into `WorldDevelopmentHooks` while preserving the existing public façade expected by bootstrap. Extract additional orchestration helpers if needed; the architecture gate caps WorldApp at 730 lines. Do not raise the cap to accommodate this integration.
2. Add experience config loading before constructing `WorldExperience`; use the existing cancellation/disposal checks after awaited loads.
3. Implement view-state APIs from 4.2. Initially all calls retain normal play/fly behavior. Implement input enable/disable by delegating into actual input listeners/state; skipping `update()` alone leaves keys stuck.
4. Separate environment/scenic/reveal work from the controls fault domain. Preserve default ordering where meaningful; prove terrain build deadlines and observer semantics remain correct.
5. Provide optional-owner slots and safe disposal. A missing optional owner does no work and allocates no GPU resources. Avoid a placeholder timer/RAF in any new system.
6. Extend frame metrics and failure handling explicitly for optional effects/audio/presentation.
7. Add versioned settings decoding while preserving the old inversion setting. URL validation must occur once at bootstrap, not in hot loops.

**Verification:** startup throws after each new construction point; disposal during load; repeated dispose; late results; controls disabled while clouds continue; fly/QA/minimap behavior; all config keys consumed; invalid numeric values rejected. Existing bootstrap/frame/session/streaming checks stay active.

**Acceptance:** baseline screenshots remain equivalent with all feature flags off; WorldApp remains under its line cap; no duplicate loop or renderer.

### T02 — Share coherent cinematic wind

**Depends on:** T01. **Risk:** high because LOD wind discontinuity is conspicuous.

**Read source:** `src/weather/WindField.js`, `public/cinematic-wind.yaml`, `test/windField.test.js`; inspect both CPU and TSL functions.

**New:** `src/world/weather/WorldWindField.ts`, `WorldWindMath.ts`, `WorldWindNodes.ts`, `WorldWindUniforms.ts`, `scripts/verify-world-wind.mjs`.

**Modify:** `src/grass/wind/WindField.ts`, `WindNoiseTexture.ts`, `GrassNearMaterial.ts`, `WorldGrassImpostorMaterial.ts`, `WorldGrassSystem.ts`, `WorldNearGrassField.ts`, detail foliage material; T07 later connects tree materials.

1. Keep `windModel=legacy` as the baseline comparison. `WorldWeatherState` advances one wind clock per frame; existing grass WindField becomes a delegate or is removed from world ownership after all its callers are migrated. Island mode retains a compatible clock.
2. Adapt source bounded domain-warp, direction variation, large/medium gust and flutter TSL functions, plus pure TS CPU helpers. Use the captured resolved defaults. Preserve static rest bend versus time-varying wind. Both backends consume the same node functions; no separate GLSL port.
3. Define world-space metres and positive direction convention. The inspected source uses `(x,z) = (cos(theta), sin(theta))`, where theta is degrees × PI/180. Convert once and use this convention everywhere. Do not transpose x/z independently in different shaders.
4. Evaluate broad gusts at stationary blade roots. All near/bridge/mid layers use the same gust phase and deformation envelope. Far cards use the same broad gust with less microflutter, not a different wave speed.
5. Apply gain to the original per-material response; do not compound values on every preset switch. A0→B→A must recover A0 numerically.
6. Do not run expensive multi-octave noise redundantly per grass fragment. Start with shared shader functions per root/vertex; measure. If too expensive, bake a bounded shared wind texture at a reduced cadence and sample it across representations, preserving one mapping and CPU-query contract. Choose this optimization only after a measured failed budget; record implementation choice.
7. Simulation speed 0 freezes dynamic phase without removing rest bend. Use integrated phase when speed changes, not `elapsed * newSpeed`, which jumps. Use periodic sampling or phase-preserving rebasing for long sessions; a simple clock reset is not seamless.
8. Update conservative wind bounds for maximum supported gain, shape height and tree displacement. Shadow/depth materials must use identical deformation when those passes are introduced.

**Verification:** source CPU reference vs translated TS over a fixed sample grid; CPU/GPU gust direction, strength and phase agreement; negative coordinates; long elapsed values; 0/NaN delta; no phase jump on speed adjustment; every active near/mid/far handoff during Galewind. The source's `fract(sin(dot(...))*largeNumber)` gradient hash is sensitive to CPU/GPU precision. If it prevents numerical agreement, precompute a periodic gradient lattice once with the source CPU hash, store the same values in a nearest-filtered texture and CPU array, and make both samplers use that lattice. Record the period and repeat-distance tradeoff. After gradients agree, start the normalized-output tolerance at `2e-3`; do not enlarge it to hide different noise fields. Retain original source CPU fixtures separately from destination shared-lattice fixtures.

**Acceptance:** visible gust fronts travel coherently through all LODs; baseline mode still reproduces old wind; performance caps in section 7 pass.

### T03 — Add complete weather presets without changing ecology

**Depends on:** T02. **Risk:** high.

**Read source:** `EnvironmentController.js`, `MeadowPalette.js`, effective preset JSON, `SkySystem.js`, `CloudSystem.js` for the different coverage convention.

**New:** `WorldEnvironmentPresets.ts`, `WorldEnvironmentPresetResolver.ts`, `WorldWeatherState.ts` implementation, `src/render/WorldLightingState.ts`, `scripts/verify-weather-presets.mjs`.

**Modify:** the full list in 5.2; cloud configuration/uniform setters, temporal pass reset, terrain/grass palette controllers, environment context restore.

1. Implement `drusniel` by capturing the existing destination defaults and cloud behavior exactly. It has unit appearance modifiers, zero forced rain, and the original art key.
2. Build all seven source-named presets from the companion reference. Maintain the source's visual identities and ordering. Retain source values as reference metadata; the destination's unit scale and lighting model need explicit conversion.
3. Normalize source sun offsets into a direction; retain destination shadow distance/frustum sizing. Do not move the light by source world coordinates.
4. Replace rendering sun constants with shared lighting state. Keep ecological reference sun fixed as specified in 5.2. Refactor `WorldCloudEnvironmentLighting.apply` to start from the active preset rather than reapplying global defaults every frame.
5. Give cloud render, CPU transmittance and cloud-shadow sampling one effective cloud parameter set. Construct it from profile quality limits plus preset appearance. Do not change ray-step count/map resolution during a weather cut.
6. Source cloudCoverage is a noise threshold, not physical cloud percentage. Use this initial **destination artistic mapping**, then validate it against target shots: Highfield 0.35, Emberfall 0.30, Greyrain 0.92, Galewind 0.50, Stillmeadow 0.25, Lowsway 0.30, Moonrise 0.20. These are normalized coverage targets; implement a tested adapter into destination cloud configuration rather than blindly assigning the threshold. Baseline `drusniel` keeps current cloud settings.
7. Preserve biome color relationships: weather supplies multiplicative color/illumination modifiers applied consistently to existing balanced terrain and grass palette rows. Do not replace all biome colors with the source's single base/tip pair. Preserve the existing near one-triangle palette compensation.
8. Initial wind gains relative to source sunny: Highfield 1, Emberfall 0.625, Greyrain 0.833333, Galewind 1.166667, Stillmeadow 0.270833, Lowsway 0.25, Moonrise 0.333333. Apply to a destination-calibrated reference amplitude from T02, not directly to the destination's raw displacement in metres. Lowsway gets a separately calibrated static lean; calm is not rigid grass.
9. For scene lighting, first use the source color and relative intensity ratios, scaled so Highfield's direct light is the destination baseline intensity. Explicitly add an owned ambient light for source ambient response; do not hide it by arbitrarily increasing all material emissive values. Preserve current hemisphere behavior for `drusniel`.
10. Use destination-distance fog density as the anchor: each preset's source density divided by `0.005` times the destination profile baseline density. Apply profile fog scaling once. T15 can later add height dependence. Keep fog color, sky horizon and horizon-shell color coordinated.
11. Preserve source labels, but describe Emberfall according to its current cinematic look rather than obsolete orange-sunset docs. Moonrise is a stylized night preset with a positive-y key light; a full astronomical day/night simulation is not part of this work.
12. Expose `setPreset(id)` as an atomic command. Until T04, tests may call it directly. Commit sky, sunlight, palette, cloud state and target precipitation together; reset all affected temporal history. Rain/wetness/audio may ease after the visual cut.
13. Update image-based lighting too. Destination `WorldSky.initializeEnvironment()` currently bakes a PMREM environment from the sky only at construction/context restore. A changed visible sky with the old daytime environment makes Moonrise water and metal stay bright. Add a staged per-preset sky-only environment bake; swap its target with the preset, release the prior target safely, and set `scene.environmentIntensity` from the resolved preset. Keep the compact no-IBL fallback. Budget at most active + staging targets, coalesce rapid requests, and never rebake every frame. Rebuild the selected environment after context restore. This intentionally differs from source's fixed HDR content because the destination environment is generated from its own sky.

**Verification:** A→B→A restores baseline; switching without moving updates shadows; no next-frame reversion from cloud lighting; frozen world samples/placement IDs are identical for every preset; terrain and all grass LOD color parity; preset invalid ID handling; context restore while in Moonrise.

**Acceptance:** all eight presets work through a dev hook; visually distinct weather reaches every lighting consumer; no plant redistribution or river-height change.

### T04 — Add iris, truthful loading presentation and usable settings

**Depends on:** T03. **Risk:** medium.

**Read source:** `IrisTransition.js`, `LoadingUi.js`, `loadingStages.js`, `DemoUi.js`, relevant CSS and UI tests.

**New:** `src/ui/WorldIrisTransition.ts`, `WorldExperiencePanel.ts`, `WorldLoadingPresentation.ts`, `world-experience.css`; focused DOM verifier.

**Modify:** existing HUD settings/visibility controllers, `WorldRevealController.ts`, `index.html`, `WorldExperience.ts`. Import scoped CSS via the destination entry path.

1. Port iris key-coalescing semantics: requests for one setting collapse to its latest value; distinct setting keys are retained. Use the inspected source timings: 0.45 s close, 0.6 s open, 120vmax open radius and power4-in-out easing. Stage expensive assets before closing; close, await the short commit, and reopen in `finally`. A rejected load must not leave a black or input-blocking overlay. Dispose resolves pending animation promises and removes listeners/DOM.
2. Respect reduced motion with an immediate cut. Keep UI hidden state, keyboard focus and pointer-lock exit coordinated; exiting a panel must not automatically seize pointer lock.
3. Extend existing reveal ownership instead of adding two independent loading overlays. Stages reflect actual config, world, character, near-grass, optional-media and readiness work. Show indeterminate progress where no true total exists. Retain the hero-ring readiness condition and bounded degraded-start path.
4. Provide Start and a sound preference; sound failure never blocks entering the world. QA/query-driven captures bypass the click gate but remain silent. Do not wait for every optional bird/audio/character asset before rendering the base world.
5. Panel sections: Weather; Grass shape; Wind/Height/Simulation sliders; Quality/Render scale; Sound; Tour; Painter; Character; Help. Keep existing minimap and invert-horizontal setting accessible.
6. Controls not implemented by later tickets must be omitted or explicitly unavailable; do not ship buttons that silently do nothing. Add them as their tickets land.
7. Slider proposed ranges: wind gain 0–2, height gain 0.5–2, speed 0–2; render scale 0.5–1 relative to profile max pixel ratio, still capped by device support. Height stays hidden until T09 implements bounds across LODs.
8. Use semantic buttons, labels, visible focus, Escape-to-close and comfortable touch targets (at least 44 CSS pixels). Opening UI clears movement/look state. Do not intercept text-input keys as gameplay shortcuts.
9. Preserve destination branding “Drusniel World”; borrow source layout rhythm, transitions and restrained styling rather than source wordmarks.
10. Add the source-style grass interaction toggle through an explicit interaction-field enable API. Disabling clears transient body/landing contact and stops new grass-trail submissions; existing trails may recover normally. Re-enabling resets contact phase/focus to the current actor without a stale landing pulse. It must not mute footsteps, stop locomotion, erase painter edits or disable water contacts. Persist the setting and test both transitions.

**Verification:** rapid preset/shape requests, rejected async swap, dispose mid-wipe, reduced motion, keyboard-only use, touch, portrait resize, hidden UI, pagehide, missing optional audio. No first-frame bare-hole flash on a normal resident hero ring.

**Acceptance:** ordinary users can select weather and settings without diagnostics mode; world remains controllable after every panel/transition path.

### T05 — Rain, surface wetness and local water impacts

**Depends on:** T03–T04. **Risk:** medium/high.

**Read source:** `src/weather/RainSystem.js`, `EnvironmentController.js` rain helpers, `WaterSurface.js` rain response.

**New:** `src/world/weather/WorldRainSystem.ts`, `WorldRainNodes.ts`, `WorldWetness.ts`, `WorldRainGroundCache.ts`, `src/world/hydrology/WorldWaterContactField.ts`.

**Modify:** terrain/stone/tree/actor material owners; `WaterMaterialController.ts`, `WaterWaveShader.ts`, `WorldExperience.ts`; add a precipitation verifier to build.

1. Adapt source's seeded instanced streak quads with a basic node material and shared TSL position/color/opacity functions, depth test on, depth write off. One pooled batch per active world view. Use ordinary instanced attributes/draws on WebGL; no mandatory compute. Shader uses shared wind/weather time, never `Date.now()` or its own clock.
2. Proposed local volume is 32×32 m with vertical range 2–24 m above a conservative local ground envelope. Use speed in metres/second with an explicit downward sign. Do not copy source's 200-unit range and opacity 2 into destination settings.
3. Center around active view focus; initialize offsets deterministically. Wrap with positive modulo, including negative coordinates. Hide below cached ground/water surface and fade at volume edges; teleports reseed/recenter without sweeping streaks across the world.
4. Build a 32×32 local ground/water height cache when focus moves ≥4 m, not by querying terrain for every raindrop each frame. Use conservative clipping near cliffs and rebuild budgeted rows. Keep old valid cache until the replacement completes.
5. Smooth rain intensity toward preset target with frame-rate-independent exponential easing. Allocate capacity from profile; vary instance count/intensity without buffer reallocation on every fade. Zero rain hides the mesh and skips its work.
6. Wetness approaches rain intensity using 8 s wetting and 45 s drying constants. Read baseline roughness/color once; compute current values from baseline plus wetness. Start with roughness floor 0.25 for appropriate opaque materials and at most 12% diffuse darkening; tune against captures. Do not alter metalness or make leaves transparent.
7. Compose wetness through the migrated shared node-material context alongside cloud shadows and environment response. Preserve stable graph/cache identity; update uniform values without rebuilding graphs every frame. Apply active wetness to newly streamed chunks and loaded assets immediately; do not reintroduce onBeforeCompile patches.
8. Add an independent bounded contact-ripple field to existing water rendering. Initial cap 16 active events desktop / 8 compact, each event `{x,z,time,radius,strength}`. It is distinct from the existing `WaterInteractionField`, which models stone wakes. Feed real footstep/landing events in T06; rain uses a low-cost procedural ripple normal in the shader.
9. Validate contact points using `sampleHydrology` and local water level. Respect river/lake coverage; never spawn a flat world-wide rain water plane. Existing flow, riffle, shore foam, waterfalls, bed/refraction remain authoritative.

**Verification:** dry→rain→dry values recover baseline; 30/60/120 Hz produces the same envelope; hillside and river shots; sky-facing camera; fog; teleports; compact counts; zero-rain allocations; context restore and disposal. Confirm existing stone-wetness behavior still appears without rain.

**Acceptance:** rain falls locally, responds to gusts and weather, wets appropriate surfaces and adds water detail without changing hydrology or destroying water optics.

### T06 — Complete environmental audio with procedural foot contacts

**Depends on:** T04–T05. **Risk:** medium.

**Read source:** all `src/audio/` modules, especially mixer-specific `FootstepAudioSystem`; source catalog and sound preparation records.

**New:** `src/audio/WorldAudioSystem.ts`, `WorldAudioBank.ts`, `WorldAmbientMixer.ts`, `WorldSpatialEmitters.ts`, `WorldFootstepAudio.ts`, `WorldSurfaceClassifier.ts`, `WorldAudioCatalog.ts`; `src/controls/WorldFootContactTracker.ts`; audio verifier.

**Modify:** `ThirdPersonController.ts`, shared gait/contact extraction where needed, `WorldExperience.ts`, settings panel/store, notices for imported media.

1. Audit and selectively stage approved sounds from the local sound bank. Catalog every actual imported file. Start with wind, light/heavy rain, one forest/wetland/lake bed, several bird/insect calls, at least four variants per footstep surface, water splashes and one quiet transition cue. Add the remainder only when intentionally used.
2. Create one listener attached to the camera, one per-world buffer cache and a capped voice pool. Decode selected preset essentials first; lazy-load optional habitat cues. Failed media produces a once-per-file diagnostic and a silent missing entry.
3. Resume audio context directly from Start/sound-toggle gesture. No autoplay before interaction. Store mute preference; visibility loss pauses/fades owned sources; visibility return resumes only if the context is already allowed. Never close a shared Three.js AudioContext owned by another application instance.
4. Ambient gains derive from preset wind/rain plus habitat near listener: open meadow, woodland canopy, wetland, lake/river proximity. Update habitat at 5 Hz and interpolate gains each frame. Source fixed scene emitter positions are not reusable world positions.
5. Place spatial birds/insects/water emitters from deterministic nearby habitat/landmark samples; recycle a bounded pool as focus moves. Use mono sources for positional cues and stereo only for broad ambient beds. Avoid immediate repeats when a group has multiple clips; cap gain sum and simultaneous voices.
6. Source footsteps require `controls.mixer` and `activeAction`; destination's procedural player does not provide these. Implement `WorldFootContactTracker` from the same stride phase/distance used by destination gait. First extract/inspect the contact phase math in `GrassInteractionField.submitFootContacts` and character gait; do not independently guess cadence.
7. Emit one discrete contact event per foot stance entry, with monotonically increasing sequence, foot, world foot position, grounded speed and landing impact. Do not emit once per frame while the foot remains planted. Clamp pathological deltas and reset on teleport, capture, re-enable and character replacement. Walking backwards/sideways still emits planted steps; airborne/fly/tour camera motion does not.
8. Surface classifier priority: valid local shallow-water contact → stone/gravel support → authored bare/soil patch or procedural path (mud when wet) → dry canopy litter where appropriate → grass → soil fallback. Use terrain/ecology/hydrology/stone fields, not source terrain-blend image pixels. A bridge/solid prop support in T14 must override water under the bridge.
9. Footstep event drives both sound and T05 contact ripple. Landing emits a separate bounded impact. Keep persistent grass contact deformation unchanged until a shared discrete event extraction is proved equivalent; continuous deformation and one-shot audio are different consumers.
10. Preset audio crossfades from the **current gain vector**, including interrupted transitions, to target over 1.5 s. Repeated A→B→C cannot accumulate hidden loops. Transition cues obey effects/master volume and are suppressed for initial load.
11. `dispose()` stops/disconnects only owned sources/listener, cancels fades and ignores late loads. Record decoded PCM memory, not just compressed download size. Initial bank cache ceiling: 64 MiB desktop / 24 MiB compact; LRU evict unreferenced decoded buffers.

**Verification:** mocked/synthetic audio buffers test gating, voice stealing, missing files, transitions, volume, disposal; gait fixtures test 30/60/120 Hz, idle, backward strafe, jump, landing, teleports; browser listening checks test positional cues, loop seams, clipping and muting.

**Acceptance:** all source audio categories have a working destination equivalent; procedural footsteps follow visible contacts; no autoplay errors, loop leaks or airborne footsteps.

### T07 — Upgrade trees and integrate meadow detail

**Depends on:** T02–T05. **Risk:** medium/high.

**Read source:** `TreeSystem.js`, `TreeLeafMaterial.js`, `MeadowDetails.js`, `MeadowGeometry.js`, `MeadowPalette.js`, tree/foliage verification fixtures.

**New:** `src/world/scenic/WorldTreeGeometry.ts`, `WorldTreeMaterial.ts`, `WorldTreeLod.ts`, `WorldTreeAtlas.ts` as needed for ownership separation.

**Modify:** `WorldTreeSystem.ts`, `WorldScenicLayer.ts`, existing detail foliage atlas/distribution/material modules and biome/community profiles only when adding a missing species.

1. Keep `WorldTreeField.sampleCell` and `collect` as placement truth. Add a stable tree ID derived from integer cell coordinates/seed, not render-array position. Rendering counts/quality must not affect ecology crown lookup.
2. Replace primitive close crowns with clustered branches/leaf cards and trunk taper using procedural geometry first. If source meshes/textures are cleared, normalize individual prototypes around root origin and fit destination tree `height`/`canopyScale`; never import `tree-world.json` positions.
3. Proposed LODs: detailed tree inside 35 m; cluster representation 35–90 m; atlas/billboard beyond 90 m to existing tree radius. Use 8 m complementary crossfade bands and stable ID dither. Clamp bands to the existing compact radius rather than expanding it implicitly.
4. Build per-cell/per-batch conservative bounds including maximum wind. Cull per camera, retaining correctness for shadow/refraction cameras. Do not set `visible=false` globally based only on the main camera.
5. Apply shared wind: trunk/branch response is slow and small, leaf flutter faster; root remains anchored. Detailed and far representations share canopy palette, wetness, sun direction and broad sway phase. Atlas generation should store relightable color/coverage, not a baked noon highlight that stays bright at night.
6. Keep existing procedural trees as load-failure and compact fallback. Dispose reference-counted geometry/material/atlas only after all owners release them.
7. Inventory current `WorldDetailFoliageAtlasFactory`, `WorldDetailFoliageDistribution`, `WorldCommunityProfiles.json`, flower/understory verifiers before adding meadow species. Map source flower/fern/mushroom visual families to existing slots; add only visually missing families.
8. Placement stays deterministic and ecology-aware: dry/open flora, moist bank flora, shaded canopy flora. Respect path/stone/water masks and future authoring overlay. Preserve current density caps; do not add source's independent 3200-instance MeadowDetails layer on top.
9. Source ground texture blending becomes optional fine normal/roughness detail in destination terrain material. Preserve destination world-space surface palette, bare path/rock/water terms and LOD palette matching. Asset-free procedural detail remains valid.

**Verification:** same tree IDs/crowns before/after and across quality; windy shadow silhouettes; LOD A/B under all key lighting states; no tree popping or leaf edge halos; existing meadow/flower/ecology gates; compact performance.

**Acceptance:** richer trees and useful source meadow variety appear without changed world placement, duplicate foliage populations or mismatched far lighting.

### T08 — Add canopy-aware falling leaves and birds

**Depends on:** T06–T07. **Risk:** medium.

**New:** `WorldLeafSystem.ts`, `WorldLeafAtlas.ts`, `WorldBirdField.ts`, `WorldBirdSystem.ts`, `WorldScenicHabitat.ts` under `src/world/scenic/`; scenic-effects verifier.

1. Source `ZoneIndex` reads named scene zones. Replace its role with a destination habitat adapter using ecology samples and deterministic nearby tree crowns. Return tree/canopy category, leaf palette and suitable emission volume. Do not scan Three.js scene names each frame.
2. Build a single leaf atlas of green/yellow/pale variations procedurally or from individually approved textures. Store atlas frame per instance; a single global material texture swap would recolor every already-falling leaf during a zone change.
3. Use capped typed-array leaf state and seeded PRNG. Recycle slots; do not allocate vectors per leaf/frame. Spawn beneath/around actual crowns, carry leaves with shared CPU wind, settle/fade on terrain and fade at water. Keep each live leaf's variant until it dies.
4. Zone/habitat changes blend spawn weights over 1 s; they do not teleport or retint live leaves. Teleports explicitly clear/reseed the local pool. Respect dry open meadows where falling canopy leaves make no sense.
5. Adapt BirdSystem's deterministic orbit, bob and direction logic. New bird field uses stable coarse cells and seed; select only nearby groups, cap counts and recycle outside the active radius. Do not allocate birds across the entire world.
6. Start with procedural wing silhouettes and shared geometry/material. Optional cleared bird models use explicit wing clips per model, not `clips[0]` from a terrain GLB. Use terrain-relative height along the route so hills do not swallow orbiting birds. Shared wind can influence banking; it must not make route identity depend on frame rate.
7. Coordinate bird audio with actual nearby bird groups where possible; ambient distant calls may still exist. Preserve deer and villagers' existing update/ownership.

**Verification:** same seed/routes at different frame rates; no leaves in empty open terrain; zone transitions retain old variants; counts remain bounded through travel/teleports; disposal mid-texture load; compact reduced pools; no unnecessary per-frame scene traversal.

**Acceptance:** convincing local airborne life, shared wind response and audio, with bounded draw calls and memory.

### T09 — Four silhouettes and safe appearance switching

**Depends on:** T02–T04, T07. **Risk:** high; do not stop after modifying near geometry.

**Read source:** `grassShapes.js`, `GrassGeometryFactory.js`, `test/grassShapes.test.js`.

**New:** `src/grass/GrassShapeProfile.ts`, `src/world/grass/WorldGrassAppearance.ts`, `WorldGrassAppearanceTransaction.ts`; shape/transaction verifier.

**Modify:** `GrassGeometryFactory.ts`, `GrassRuntimeMath.ts`, `WorldSingleBladeTileFactory.ts`, `WorldGrassPatchGeometryFactory.ts`, `WorldGrassImpostorAtlasFactory.ts`, near/impostor materials and owning systems.

1. IDs: `slender`, `reed`, `broadleaf`, `tufted`. Default `slender` preserves destination baseline morphology. These IDs never replace `GrassLodLevel` or biome/community IDs.
2. Reference half-width profiles at normalized height `r`: slender `1-r`; reed `0.55*(1-r^5)`; broadleaf `0.85*sqrt(max(0,1-r*r))`. Use the source area ratio cap of 1.35× slender as a coverage target, then measure actual pixel overdraw. This cap is not a promise of equal GPU cost.
3. Apply chosen profile as a modifier on destination per-species variation. Ultra-near segmented geometry can show curved width. One-triangle LOD cannot represent a reed tip/broadleaf curve accurately: define and test an area/tip-preserving triangle approximation, or introduce a bounded extra-segment representation for these shapes. Do not silently claim exact profile parity from changing only base width.
4. Choose the bounded extra-segment representation for reed/broadleaf where the triangle approximation fails the visible handoff test. Gate its use by existing detail distances and budget; keep standard single-triangle topology for slender. This is a measured representation decision recorded in the ticket, not permission to lower density.
5. Tufted means a clumped silhouette in the same near→bridge→mid→far pipeline. Preserve base root identities and coverage; derive a tuft envelope/lean around stable clump centers. Do not switch the entire near field to source billboard cards. Reuse current rosette/clump infrastructure where compatible.
6. Extend shared blade specification/arc/width sampling into patch geometry and the **CPU Canvas atlas baker**. The destination atlas is not currently a GPU scene bake. Include shape/height/profile version in geometry/atlas cache keys and conservative bounds.
7. Height modifier 0.5–2 scales blade/tuft form consistently, preserving rooted positions and recalculating bounds. Separate user height modifier from source physical blade heights (which are in a differently scaled scene).
8. Implement appearance transactions: latest requested revision wins; build new shared geometry/atlas and hero ring without destroying the active set; validate resources; commit under iris; retire old resources after users release them. Do not keep more than active + one staging shared resource set. If allocation fails, retain old shape, reopen UI and report failure.
9. Appearance-only changes reuse deterministic placement data. Invalidate shape-dependent render data, not placement randomness. Existing sorted dither arrays/reference-counted placements must stay paired; never reorder one array without its matrices/attributes.

**Verification:** all shapes at each distance handoff, low/high camera angles, Galewind, Moonrise, height extremes, rapid switches, quality change while staging, dispose mid-build; root IDs and population caps stable; no atlas/canvas leak; existing shape, placement, geometry, color and impostor gates.

**Acceptance:** each choice remains identifiable and stable across distance; no missing grass or density collapse when switching; resource failures roll back cleanly.

### T10 — Persistent world-coordinate authoring field

**Depends on:** T09. **Risk:** high. Implement data semantics before interactive UI.

**New:** `src/world/authoring/WorldAuthoringField.ts`, `WorldAuthoringTile.ts`, `WorldAuthoringMath.ts`, `WorldAuthoringCodec.ts`, `WorldAuthoringStore.ts`, `WorldAuthoringInvalidation.ts`, `WorldAuthoringTexture.ts`; authoring-data verifier.

**Modify:** grass tile/patch coverage, near/mid/impostor shader hooks, detail foliage coverage, terrain surface blending; add narrow invalidate-region methods to existing streaming owners.

**Exact v1 semantics:**

- Unedited texel: natural destination vegetation and height.
- Erase: suppress natural grass/detail flora and display a bare-ground authoring patch.
- Add: restore natural vegetation allowed by the destination at that point; optional brush height modifier applies there. It does **not** make grass grow in deep water, through rocks, on forbidden slopes, or across the existing procedural path tread.
- Reset brush / Reset document: remove the authoring override, including height, and return to natural world behavior.
- Painting creates visual meadow clearings, not a new navigation/path-generation network. A later path-authoring feature would need its own domain contract.

1. Tiles are 32 m square, 128×128 texels. `tileX=floor(x/32)`, `tileZ=floor(z/32)`; local texel coordinates derive from `x-tileX*32`, `z-tileZ*32`. Handle negative world coordinates without truncation or `%` bugs.
2. Two Uint8 channels per texel: R stores vegetation mode (`0=inherit`, `1=erase`, `2=add`); G stores height (`0=inherit`; `1..255` maps linearly to 0.5..2.0). Since Add respects natural suitability, its value records intent and height without bypassing protected masks. Never linearly interpolate categorical R modes; sample nearest. Height interpolation, if used, must resolve inheritance first.
3. Fixed orientation: row 0 corresponds to minimum world Z, column 0 to minimum world X. Data textures use `flipY=false`. Codec/PNG preview explicitly flip screen rows as needed. Test four labeled corners on CPU and GPU before drawing any grass.
4. Keep only touched tiles in a Map; remove a tile if Reset leaves it entirely inherited. Maximum 1024 tiles means 32 MiB raw two-channel authoring data, before overhead. Enforce the cap before allocating and show a useful “export/reset to continue” message. No silent eviction of unsaved edits.
5. Brush stamps evaluate world-space squared distance ≤ radius² at texel centers. Hard-circle brush is source behavior. Interpolate stroke centers with spacing ≤ radius/4 to avoid gaps. Radius range 0.25–16 m; zero-length stroke still makes one stamp. Return changed tile keys, integer dirty rectangles and incremented revisions.
6. `sample(x,z)` resolves `{coverageMultiplier,heightMultiplier,soilReveal}`. Effective vegetation equals the existing full natural suitability/clearance multiplied by this authoring coverage. Keep immutable ecological samples untouched. Terrain raw palette blends toward existing bare soil using soilReveal, rather than inventing an unrelated path tint.
7. Provide immediately updated resident authoring textures with a bounded residency matching visible terrain/grass. Avoid a global world-resolution texture and avoid binding one independent sampler per tile in a shared material. Use a bounded texture atlas plus world-tile lookup indirection; define missing lookup as inherit. Pad atlas slots if filtering is used; sample categorical channel nearest.
8. Near and patch shaders evaluate overlay at planted roots; far cards require world-projected coverage at their subpatch footprint. Apply erase in the fragment coverage too so an erased stripe does not become a whole missing far card. Height can use the subpatch's representative height beyond the detail band with a continuous fade; document this far-distance approximation.
9. Rebuild only intersecting tile/patch render data under the existing build deadline. Include maximum blade reach/brush edge in invalidation expansion. Add/remove/height changes invalidate corresponding near layers, bridge data, far subpatch coverage and detail foliage. Terrain authoring shading reads the texture immediately; do not regenerate terrain height or hydrology.
10. Each async job records authoring revision. Discard and requeue a stale result before publishing it. Invalidate cached empty tiles too, so Add restores previously erased grass after streaming. Deterministic candidate IDs/seeds must not depend on prior erased counts.
11. Undo/redo stores changed byte rectangles, not entire world snapshots. Bound history to 32 operations **and** 16 MiB; evict oldest undo entries only, never current document edits. A long stroke is one undo operation. Show when oldest history is dropped.
12. Persist after stroke completion using debounced IndexedDB transactions. Document key includes world seed, generation version and authoring format. Quota errors leave edits live and mark unsaved state. Do not overwrite a different seed's authoring.

**JSON export contract:**

```json
{
  "format": "drusniel-world-authoring",
  "version": 1,
  "worldSeed": 123,
  "worldGenerationVersion": "explicit-destination-generation-id",
  "tileSize": 32,
  "resolution": 128,
  "orientation": "row0-min-z",
  "channels": "mode,height",
  "tiles": [
    { "x": -1, "z": 0, "revision": 1, "encoding": "base64-u8", "data": "..." }
  ]
}
```

`123` and the generation string above are schema examples, not runtime defaults. Use actual world values. Each tile decodes to exactly 32768 bytes; tile coordinates must be bounded safe integers inside the world. Reject duplicate tiles, invalid mode bytes, unknown versions, oversized imports and seed/generation mismatch. Validate the **whole** document before replacing live state; keep old edits on failure. Export sorts by tile z then x for stable diffs/hashes.

**Verification:** negative coordinates and seams; stamp/stroke determinism; CPU/GPU orientation; undo/redo limits; import/export byte roundtrip; malformed/oversized import; eviction→reload preserves edits; edit during pending tile build; clear→Add after empty-tile cache; all LODs and terrain agree.

**Acceptance:** programmatic edits survive travel and reload, remain spatially aligned, respect protected terrain and update within bounded frame work.

### T11 — Interactive Grass Painter

**Depends on:** T10. **Risk:** medium.

**Read source:** `GrassPainter.js`, `painterMath.js`, `GrassPainterUi.js`, `GrassMask.js` export behavior.

**New:** `src/ui/WorldGrassPainter.ts`, `WorldGrassPainterPanel.ts`, `src/world/authoring/WorldTerrainRaycast.ts`.

1. Enter exclusive paint mode through `WorldViewState`; stop tour, disable gameplay look/movement, clear input and release pointer lock. Use an orbit camera state without losing saved gameplay state.
2. Source raycasts one terrain mesh and takes its UV. Destination must raycast registered **resident terrain surface meshes**, excluding water/grass/props/horizon, and convert hit world x/z to authoring coordinates. Add a TerrainStreamer query/registry API; do not traverse the entire scene per pointer event.
3. If surface mesh is unavailable, either use a bounded ray/heightfield intersection (coarse march + bisection, world extent and max distance checked) or report no paintable hit. Choose resident-mesh-only for v1 to keep exact visible-surface placement; show a waiting cursor until terrain streams in. Never paint using stale last-hit coordinates when no hit exists.
4. Cursor follows sampled terrain slope, is slightly offset to avoid z-fighting and shows the true world radius. Preview depicts current local authoring area and identifies its bounds. Keep cursor out of shadow/refraction and normal gameplay captures.
5. Controls: LMB/Add or Erase brush; RMB orbit; Shift+RMB pan; wheel zoom; `1` Add; `2` Erase; `[`/`]` radius; `8` Export; `P` continuous stamping toggle; Escape exit. Provide visible buttons for touch and keyboard users, including Undo/Redo, Reset brush, Reset document, Height and Import.
6. Pointer capture guarantees a stroke terminates outside canvas; pointercancel/blur closes the stroke safely. Ignore shortcuts in input fields. Mobile needs explicit paint vs orbit tools so one drag is never interpreted both ways.
7. Export canonical JSON plus an optional local grayscale PNG preview and bounds metadata. The PNG is an inspection/interchange aid, not a complete multi-tile document. Explain the destination mode/height encoding; do not pretend source's white=empty mask PNG can be imported without conversion.
8. Queue at most one dirty-region flush per frame. Render immediate erase feedback via texture; show a small rebuilding indicator while Add waits for missing instance data. Do not block the pointer handler rebuilding all grass.

**Verification:** desktop/touch interaction, zero hit, seam painting, distant camera, missing residency, imported document errors, pointer loss, exit restores camera/controls, persistent reload, all shader LOD views of a painted clearing.

**Acceptance:** complete Add/Erase/Height/Reset/Undo/Redo/preview/save/load experience with unambiguous world coordinates and no gameplay-input conflicts.

### T12 — Scenic tour over the procedural world

**Depends on:** T08, T11. **Risk:** medium.

**Read source:** `src/rendering/ScenicTour.js`.

**New:** `src/controls/WorldScenicTour.ts`, `WorldScenicRoute.ts`, `src/world/scenic/WorldLandmarkLocator.ts`.

1. Extract reusable *pure* landmark queries from QA where appropriate, with QA still consuming them; do not import the full visual QA runner into production.
2. Pick a nearby meadow, tree grove, shore/river bend and optional waterfall within 180 m of start. Search in bounded batches under a time/sample budget; use seeded candidates and deterministic tie-breaking. If no water/grove qualifies, choose terrain-safe meadow vistas.
3. Construct a centripetal Catmull-Rom route and a separate look-target route. Pre-sample at ≤2 m intervals and raise the camera to at least 4 m above max(terrain, local water). Clamp inside world bounds; account for solid prop collision once T14 lands. Do not point the final shot at a nonexistent global water mesh.
4. Use arc-length progression over configured 30 s rather than raw curve parameter speed. Ease entry/exit; freeze hidden player simulation and footsteps while tour runs. Ambient listener and local effects follow the camera.
5. Stream at the tour subject/focus and bound lookahead to the normal resident ring. Use existing build budgets. If a target area is not ready, slow/hold at the last safe view for at most 2 s, then use a closer fallback route or stop cleanly. Do not queue the entire path as fully resident terrain.
6. Escape/Stop/movement input exits; photo-friendly HUD hide is reversible. Restore actor visibility, exact controller view state and local streaming readiness before reveal if returning far from camera.

**Verification:** no nearby water, cliff path, world edge, repeated start/stop, interrupt with painter, terrain stalls, compact, fly mode, return after a long tour, no footstep/contact trail caused by camera movement.

**Acceptance:** tour showcases destination landmarks smoothly and exits into a stable playable scene.

### T13 — Character appearance selection without replacing locomotion

**Depends on:** T06, T12. **Risk:** high; source GLB compatibility is not established by matching humanoid labels.

**Read source:** `characterRoster.js`, `characters.yaml`, `PlayerController.js`, `CharacterMotion.js`, character test fixtures.

**New:** `src/character/PlayableCharacter.ts`, `ProceduralPlayableCharacter.ts`, `PlayableCharacterCatalog.ts`, `ImportedPlayableCharacter.ts`, `ImportedCharacterBinding.ts`, `PlayableCharacterLoader.ts`; playable-character verifier.

**Modify:** ThirdPersonController construction/pose/view coupling, WorldApp character diagnostics compatibility, picker, actor environment response.

1. Extract the narrow appearance interface actually used by ThirdPersonController: root/visibility, pose update, motion reset, dimensions/framing, look direction, `isRolling`, `triggerRoll`, state diagnostics and dispose. Keep a wrapper for current Snowflow/Drow character and preserve its exact behavior first. The destination already has rolling and crouching; these must survive even though the source feature inventory emphasizes walking/running.
2. Remove the controller's need to know concrete mesh construction. Preserve `WorldApp.getThirdPersonCharacter()` compatibility for existing development tools with an optional procedural diagnostic view; adapt diagnostics to report imported characters explicitly rather than casting them to SnowflowCharacter.
3. Add catalog entries for current procedural ranger plus individually cleared source Drusniel, Enanillo and Paladin models. Until an asset is cleared/validated, it is not selectable. The procedural ranger always works with zero external downloads.
4. Inspect actual GLB hierarchy, bind transforms, embedded textures, scale and clip tracks using source inspect tooling or destination loader. Source says these models share a 24-joint armature; verify per file. Existing destination `KayKitHumanoidBinding` is specific to KayKit and must not be reused blindly.
5. Normalize root to feet at y=0 and destination scale. Initial height metadata: imported elf/paladin match current procedural player's measured standing height; dwarf is 0.68× that height, matching the source 3.4/5 ratio. Do not make a 5 m player simply because source config uses targetHeight 5.
6. Prefer destination procedural animation on a correctly mapped imported rig. If source authored walk/run clips are necessary for a particular appearance, put them behind the same appearance interface and update them from destination speed/gait, with root translation removed and explicit clip names. Idle may be absent; use a stable bind/procedural idle fallback. Do not apply two full-body animation systems to the same bones simultaneously.
7. Preserve terrain contact IK, jumping, landing, crouching, rolling and secondary motion when supported by the rig. Movement/action state must remain consistent even if an imported appearance uses a simpler roll/crouch pose. Missing joints/features degrade locally. No source Rapier player or source input listener is instantiated.
8. Character replacement loads/stages/validates asynchronously, swaps at a safe stopped/grounded state under iris, resets gait/contact trackers, fits camera and only then disposes old appearance. Failed loading retains the old appearance and selection. Queued choices coalesce by latest revision.
9. Character dimensions may alter camera framing, water-depth thresholds and prop-clearance radii through one metadata source. Preserve movement speed in destination metres/second initially; do not introduce per-character speed changes accidentally through source height-based controls.

**Verification:** existing procedural actor tests unchanged; each model idle/walk/run/backward/strafe/jump/landing/slopes/shallow water; feet don't slide excessively; unknown clip/joint fallback; rapid selections; disposal during load; return from tour/painter; no duplicated collision or animation owner.

**Acceptance:** a working procedural default and every cleared/validated source appearance, with functional destination gameplay and correct framing. List unavailable individual assets explicitly rather than claiming they shipped.

### T14 — Scenic props and solid-object collision

**Depends on:** T13. **Risk:** medium/high.

**Read source:** `WorldPropSystem.js`, `world-props.json`, `WorldCollisionSystem.js`, `PlayerPhysics.js` for behavior reference only.

**New:** `src/world/props/WorldPropField.ts`, `WorldPropSystem.ts`, `WorldPropCatalog.ts`, `WorldSolidField.ts`, `src/controls/WorldSolidCollision.ts`.

1. Add a small procedural vocabulary: lantern posts, simple benches/markers and optional cleared decorative props. Existing stones remain owned by WorldStoneSystem. Default placement is sparse near suitable dry paths/groves; never place in water, on steep slopes or across the walking tread.
2. Stable prop records contain ID, prototype ID, world root transform, scale and simple collider dimensions. Placement uses seeded cells or small explicit destination-relative landmark records. Do not copy authored source positions or depend on hidden GLB object names.
3. Normalize imported prototype transforms and extract approved simple collision bounds once. Share geometry/materials and pool instances by prototype. Only a few nearest lanterns may use real point lights (initial cap 2 desktop / 0 compact); distant lamps use emissive material with night/rain-aware intensity.
4. Add broadphase queries for tree trunks and solid props from deterministic fields, not just currently rendered meshes. Collider behavior cannot disappear when rendering chooses a lower LOD or compact profile.
5. Keep ThirdPersonController's existing heightfield/jump/water motion. Resolve horizontal swept player-capsule/circle motion against upright cylinders/boxes before accepting the candidate position. Use broadphase cell query, maximum 4 slide iterations, and re-query terrain after correction. Camera segment collision queries the same solids with a camera margin.
6. Support capsule radius/standing height from T13 metadata. Include depenetration on a spawn/teleport inside a solid; do not move indefinitely or return NaNs. Initially disallow climbing on props; benches/logs are obstacles. Bridge/walkable-prop support is deferred until an explicit surface-support contract is implemented, so do not ship a bridge that looks traversable but lacks support.
7. Do not install Rapier for this initial scope. If later requirements include rigid-body pushing, arbitrary walkable meshes or bridges, a separate physics adapter must replace the relevant movement authority transactionally; it cannot run alongside the old solver on the same body.

**Verification:** sprint through thin posts, slide along box corners, two adjacent obstacles, tall/dwarf radius, camera clipping, teleport inside solid, low frame rate, collider persists across renderer eviction and quality change; existing navigation/jump/water tests.

**Acceptance:** source-style points of interest enrich the world and solid props/trunks have predictable collision without importing a second terrain/physics world.

### T15 — Shared TSL cinematic rendering and water reflection

**Depends on:** T05, T07–T14. **Risk:** high; develop and measure each pass separately.

**Read source:** stabilized G01 `CinematicPipeline.js`, `CinematicLighting.js`, `atmosphereMaterials.js`, `WaterSurface.js`. Inspect pinned-version node postprocessing APIs; test actual WebGPU and forced WebGL backends.

**New:** `src/render/WorldCinematicPipeline.ts`, `WorldColorGradeNodes.ts`, `WorldHeightFogNodes.ts`, `WorldMaterialPassRegistry.ts`, optional `WorldAmbientOcclusionPass.ts`, `src/world/hydrology/WorldWaterReflectionPass.ts`.

**Modify:** WorldApp render delegation, renderer sizing, material shader patch composition, water refraction target sizing, GPU timing/diagnostics and quality control.

1. Extend G06's node renderer with a pipeline interface: `render`, `resize`, `setQuality`, `dispose`, and renderer-session reconstruction. Disabled post calls the initialized WebGPURenderer directly. Exactly one owner submits the final beauty image; do not render the same main view directly and through the node pipeline.
2. Adapt source's node graph: linear beauty pass → restrained grading/vignette → one explicit tone/display transform → display-space FXAA. Use pinned-version `RenderPipeline`/TSL pass/effect equivalents, not EffectComposer/OutputPass. Start saturation 1.02, vignette 0.045. `drusniel` grade is identity and supports `post=off`.
3. Verify migrated beauty node materials write linear working color into offscreen targets without extra manual sRGB conversion. Disable automatic pipeline output conversion if the graph already performs it, using the installed API. Compare a neutral gray/color chart; do not compensate for double tone mapping with lighting changes.
4. Add MSAA samples 4 for supported desktop targets, 0 compact. Enable alpha-to-coverage only on suitable cutout materials when the active target is multisampled; it is not a replacement for destination stochastic LOD coverage. Validate alpha edges and dither handoffs explicitly.
5. Add the stabilized source/pinned-version TSL bloom node only on high quality: strength 0.09, threshold 2.1 in the intended linear range. Weather/lanterns must not wash out grass tips. Removing bloom from the active graph must remove its pass work, not only set strength to zero.
6. Add height fog through shared TSL material/scene fog functions with a stable analytic exponential-height ray integral and horizontal-ray limit. Start height 10 m and falloff 0.05/m, anchoring density to T03. Do not apply exponential fog twice. Sky, terrain, grass, trees, props, stones, actors and water converge to the same directional horizon color on both backends.
7. Extend G03–G05's node material/pass registry: deformation, cloud shadows, wetness and fog compose without legacy shader injection. Depth/shadow nodes match corresponding vertex deformation and alpha test. Inspect unknown materials explicitly instead of claiming parity with a plain fallback material.
8. AO is optional. Adapt the source's node AO only after proving valid deformed depth/normal inputs on both backends. Prefer opaque terrain/stone/trunk/prop depth with thin foliage/water excluded, reconstruct normals, and composite only onto matching opaque surfaces. Compare beauty and AO surface depth to avoid painting terrain AO onto foreground grass. If this contract cannot be proved, keep AO disabled and record the limitation.
9. Cap AO to half-resolution desktop, strength 0.18 and radius 0.85 m, off compact/performance. Reuse only G01-validated depth resolve/sampling logic for the pinned version. Do not retain the r180 workaround automatically, and do not introduce legacy GTAOPass. Capability-gate AO separately from core node rendering.
10. Preserve the migrated `terrain.renderWaterRefraction(renderer,scene,camera)` **before** main beauty rendering. Its node pass restores targets, viewport/scissor, clear state and visibility through try/finally. Pipeline resolution changes propagate to depth/refraction sizes. No direct WebGL framebuffer operations on the portable path.
11. Optional high-quality water reflection: use one nearby lake/slow pool probe at 256 resolution desktop, refresh no more often than 0.75 s and only after significant camera/light movement. Baseline env/sky reflection remains the fallback. Hide water/effect/editor overlays during probe capture, preserve state and avoid recursive refraction/reflection. Never create a cube probe per streamed water chunk.
12. Reflect active sky/weather and invalidate on preset changes. Rivers retain flow normals and directional optics; a local probe must fade out outside its influence instead of reflecting the same grove everywhere.
13. Quality definitions below control this pipeline. Update display resolution, all passes, cloud targets and grass viewport scale together after render-scale changes. Use a hysteretic effects downgrade if measured budget is exceeded; do not silently lower grass density to pay for bloom/AO.

**Verification:** gray chart and identity pass; all presets, grass LODs, cutout trees, transparent water/rain, wet stones, sky/horizon silhouettes; render-target restoration on thrown passes; resize/DPR/compact/context restore; GPU timings of each pass enabled/disabled; reflections disabled and enabled.

**Acceptance:** lean cinematic output works across profiles on WebGPU and forced WebGL 2; high-cost passes are individually measured and reversible; water refraction, grass continuity and cloud shadows still pass. AO/reflection that fail their correctness/budget gate stay clearly opt-in or unavailable, with the reason recorded.

### T16 — Final integration matrix, defaults, documentation and release preparation

**Depends on:** T00, required G00–G06, and T01–T15. **Risk:** medium.

1. Add relevant deterministic/config/lifecycle verifiers to the existing `npm run build` chain. Run the complete local build. Keep browser screenshot/performance collection as explicit local commands where unsuitable for the deterministic build.
2. Extend existing visual matrix with feature state and expected selected IDs. Save JSON metadata beside screenshots: revisions, seed, profile, quality/tier, render scale, viewport, art, weather, shape, character, phase, authoring hash, feature toggles and hardware/browser information.
3. Run the matrix in section 7, listen to audio scenarios and inspect captures; record actual pass/fail and measured performance. A screenshot saved to disk is not evidence it was inspected.
4. Confirm unrelated source changes remain untouched and G00–G01 renderer changes are recorded; every imported asset has a record and is used. Production bundles exclude reference snapshots, caches, packs and the temporary legacy comparison renderer. Both applications default to `renderer=auto` with verified WebGL 2 fallback.
   Keep runtime assets same-origin and relative to the Pages base. Inspect the existing CSP (`connect-src 'self'`, local/data/blob image allowance) when adding audio loading and painter import/export; use fetch + AudioBuffer and File APIs so broad external/network/eval permissions are unnecessary. Extend built-site checks for actual new assets and any narrowly required directive rather than removing CSP verification.
5. Default experience: `drusniel` weather/art baseline, automatic quality, slender appearance, procedural ranger, coherent wind only after its A/B gate, weather/birds/leaves available, no painter/tour automatically active. Sound follows the Start gesture/preference. Users can choose source-style presets immediately. Set cinematic defaults according to measured quality gates, not the source's Ultra default.
6. Update README with actual features, controls, config and supported limitations. Keep detailed integration progress and validation in the progress document. Remove stale claims relevant to changed defaults.
7. Prepare a concise change summary and manual Pages release checklist. Do not deploy during implementation unless requested. When deployment is requested, use a clean committed destination tree and `rtk npm run deploy:pages`; never add an Actions workflow.

**Acceptance:** required WebGPU/TSL migration and all core feature rows have completed equivalents or explicit individual asset/optional-pass limitations with working fallback; full local builds and both-backend visual/lifecycle checks pass; defaults meet measured budgets. Missing core WebGL fallback behavior is not an optional-pass limitation.

### R01 — Optional GPU occlusion / cascaded-shadow optimization

**Depends on:** T16; not part of the core merge. **Risk:** very high.

The required renderer migration is already complete in G00–G06. This ticket only evaluates extra acceleration. Source's original `GpuOcclusion` targets r180 internals; reuse only the G01-validated version. Its recorded culling results do not establish a universal frame-time improvement.

If pursued, use a focused `codex/gpu-visibility-optimization` branch:

1. Use the existing G06 renderer session/capabilities. Production remains WebGPU-preferred with WebGL 2 fallback. Add an independent `gpuOcclusion` toggle, not a second renderer architecture.
2. Preserve the now-migrated node materials and all CPU placement/streaming algorithms. Native compute/indirect resources are allocated only on a supported backend; WebGL retains ordinary draws and existing CPU/horizon/frustum culling.
3. Reproduce T16 screenshots/interactions before enabling compute occlusion. Pin to installed Three; verify every unavoidable private hook and lifecycle against that revision.
4. Port conservative Hi-Z semantics: solid opaque occluders only; padded deformed bounds; near-plane intersections visible; odd-sized mip padding represents far depth; same-frame indirect results; secondary cameras bypass main-view culling; no visibility dependency on delayed CPU readback; painter bypass until coverage correctness is demonstrated.
5. Add camera/depth/indirect-buffer GPU fixtures and readback purely for diagnostics. Measure total GPU frame time including depth pyramid and compute, not just “culled triangles”. Disable automatically in unproductive open views.
6. Evaluate cascaded shadows separately, initially two desktop cascades, preserving matched vegetation depth deformation, stable snapping, atlas limits and compact single-cascade fallback. Measure the extra shadow draws independently from occlusion.
7. Enable the optimization by default only if feature parity, fallback/loss behavior and repeatable target-hardware total-frame-time wins are demonstrated. Otherwise keep the optimization opt-in or omitted. This result does not undo the required WebGPU/TSL architecture.

## 7. Verification, budgets and rollout gates

### 7.1 Quality mapping

Introduce one **new** `src/runtime/WorldExperienceQuality.ts` resolver. It combines existing viewport profile, existing grass governor state, manual selection and explicit QA overrides. It does not replace the existing grass governor with another competing density controller.

| Setting | Grass | Effects | Post |
| --- | --- | --- | --- |
| Auto | Existing governor / profile | Profile caps; downgrade optional effects first | Balanced desktop; lean compact |
| Performance | Existing governor, conservative cap | Rain 50%, leaf/bird 50%; no extra prop lights | Direct/lean FXAA, no AO/bloom/reflection |
| Balanced | Existing governor, normal cap | Full profile pools | FXAA + supported MSAA + mild grade; no AO; reflection off |
| High | Existing profile-supported grass tier | Full profile pools | Bloom; AO/reflection only if their independent gates pass |

In compact mode High still obeys compact absolute allocation caps and does not enable desktop AO/real prop lights. `tier` and `profile` QA overrides can lock grass for comparisons. Show selected/effective quality and any cap in diagnostics; do not tell a user they have High effects while silently allocating Performance without explanation.

### 7.2 Proposed performance acceptance targets

Targets below are acceptance criteria to measure, not observed frame rates:

- Desktop target 60 FPS where the baseline meets it; compact target 30 FPS where baseline meets it.
- Compare actual WebGPU and forced TSL WebGL 2 at the same settings, plus the archived legacy destination baseline during migration. Record requested and actual backend. Availability alone is not evidence that one backend is faster.
- At identical grass density, draw distance, profile, viewport and render scale, added core effects should increase warmed median frame time by no more than 10% or 1.5 ms (whichever is larger), and p95 by no more than 15% or 3 ms. High cinematic effects get a separate report and must remain optional if over budget.
- If baseline is already slower than target, report the actual baseline and relative delta; never claim target performance by lowering unreported grass density or resolution.
- Warm up until streaming/shader compilation settles, then capture at least 30 s per scenario. Repeat A/B three times and compare medians/p95 with the same camera path. Report GPU time only where available; otherwise say CPU frame time.
- No routine brush/preset command should perform an unbounded whole-world rebuild. Expensive jobs use the destination's existing deadline; initial extra authoring work budget ≤1 ms desktop / 0.5 ms compact per frame, carved out explicitly rather than added to an already exhausted frame.
- No unbounded allocation over 20 weather switches, 20 shape switches, 10 character switches, 5 tour/painter cycles and a 10-minute traversal. Count live textures/geometries/listeners/voices and confirm a plateau after caches fill.
- Resident authoring GPU atlas, rain cache, post targets, tree atlases and wind textures need explicit byte accounting in diagnostics. Test against `maxTextureSize` and relevant framebuffer/sample support.

### 7.3 Mandatory scenario matrix

| Scenario | Required checks |
| --- | --- |
| Backend matrix | Each feature on actual WebGPU and forced WebGL 2; automatic unavailable-adapter fallback; failed warmup; bounded device/context-loss recovery; both source and destination. |
| Baseline world | Current muted-meadow art, `drusniel`, post off, no edits: placement/LOD/terrain/water behavior retained. |
| Regression island | Starts, renders, interacts and disposes without world-only feature assumptions. |
| Seven presets | Fixed meadow/grove/river cameras; sky/light/shadows/fog/grass/audio all correspond; A→B→A restoration. |
| Wind extremes | Stillmeadow, Galewind, Lowsway; no zero-wind loss of rest bend; no camera-radius gust rings. |
| Grass shapes | Four shapes × three heights (0.5/1/2) at ultra-near/bridge/mid/far transitions. |
| Rain | Slope, dense grass, bare soil, stone, water, sky; no subterranean streaks or changed hydrology. |
| Sound | Start muted/unmuted, rejected context resume, missing file, rapid presets, habitat boundaries, positional water/birds. |
| Movement | Walk/run/strafe/backward/jump/land/water, actual foot contacts, no steps during fly/tour. |
| Trees / leaves / birds | Grove entry/exit, LOD crossings, gusts, night, rain, camera above terrain, streaming eviction. |
| Painting | Negative tile boundary, four-corner orientation, Add/Erase/Height/Reset, undo/redo, export/import/reload, distant LOD. |
| Tour | Meadow-only world region, river/waterfall region, world edge, stop, interrupted by painter, return to player. |
| Characters / props | Every available appearance, collision corners/teleport, camera clipping, missing asset fallback. |
| Rendering | Post on/off, reflection on/off, dynamic sun, cloud history reset, water refraction, foliage depth/alpha. |
| UI | Keyboard, mouse, mobile touch, reduced motion, portrait/landscape, text inputs, minimap, hidden HUD. |
| Lifecycle | Dispose during each load/transaction, duplicate dispose, pagehide/BFCache behavior, context loss/restore, zero delta/invalid inputs. |
| Shipping | Relative asset paths work beneath Pages subpath; legal files present; no source-only cache/pack/debug asset; no Actions. |

Use existing `scripts/capture-meadow-shots.mjs`, stone capture tooling and `src/qa/WorldVisualMatrixRunner.ts` as foundations. Extend them to control feature state deterministically. Preserve their existing browser session/disposal ownership instead of spawning orphaned browser processes.

### 7.4 How to handle failed gates

1. Reproduce with the feature individually toggled off/on at the same camera/seed/settings.
2. Identify the owning ticket and smallest failed contract. Do not compensate for a sun/shader/mask error by adjusting unrelated exposure or grass density.
3. Correct the issue, rerun its focused checks, then the complete required local build. Repeat broader captures only where the change can affect them.
4. Optional expensive effects stay disabled if their correctness/performance gate fails. Core feature work remains incomplete until its required behavior works; an inert flag or placeholder button is not completion.
5. Record unavoidable asset limitations per file and use the specified fallback. Do not silently omit a whole capability because one source asset is unavailable.

## 8. Suggested delivery sequence and implementation handoff

| Delivery | Tickets | Reviewable outcome |
| --- | --- | --- |
| Foundation A | T00, G00–G01 | Stabilized grass-test WebGPU/TSL + WebGL 2 fallback on pinned Three 0.185.1 |
| Foundation B | G02–G06 | All existing Drusniel features migrated to TSL; both backends verified; auto production default |
| A | T01 | Safe feature extension points on the shared node-renderer foundation |
| B | T02–T04 | Coherent wind, eight weather choices, iris and settings/loading presentation |
| C | T05–T06 | Rain/wetness/water impacts and complete environmental audio |
| D | T07–T08 | Rich trees, meadow details, falling leaves and birds |
| E | T09 | Four silhouettes and safe appearance/height switching |
| F | T10–T11 | Persistent streamed-world Grass Painter |
| G | T12–T14 | Scenic tour, character appearances, props and collision |
| H | T15–T16 | Measured cinematic rendering, complete QA and release-ready documentation |

No time estimate is supplied: rendering changes and asset compatibility need measured evidence. Highest-risk foundation work is G01 (version-sensitive source APIs), G04 (all grass representations) and G05 (water/depth/pass compatibility). Later high-risk work remains T03, T09, T10, T13 and T15. Keep each migration ticket independently reviewable.

Use this handoff prompt for the implementing AI:

> Read AGENTS.md, docs/plans/grass-test-integration-plan.md and docs/plans/webgpu-tsl-migration-plan.md in F:/Development/DrusnielGrass. Track work in docs/plans/grass-test-integration-progress.md. Execute T00, then G00–G01 in F:/Development/grass-test, then G02–G06 in DrusnielGrass, then T01–T16. Both applications must use WebGPURenderer + TSL, prefer usable WebGPU and fall back to the same node implementation on WebGL 2. Harden source's existing renderer first; do not rebuild it as GLSL. Preserve unrelated changes and Drusniel's grass LOD algorithms, terrain, ecology, hydrology, locomotion and deployment setup while migrating rendering. Keep destination strict TypeScript and equivalent verification contracts. Run relevant local checks/builds through RTK, validate actual backends and record exact results/limitations. Keep diffs reviewable; do not call an untested fallback complete. Do not deploy unless deployment has been requested.
