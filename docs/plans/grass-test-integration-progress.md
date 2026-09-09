# Integration progress

Implementation started 2026-09-06. Full scope is authorized; deployment is not requested.

## Starting state

- Destination HEAD: `5a2200558672e13c7fef55e7bc249a599d0b3479`; three untracked planning/reference documents.
- Source HEAD: `f43f8638313fa74b0d72504c8c227fef3c4b802a`; clean working tree. The audio work reported in the earlier planning snapshot has since been committed externally; preserve this newer state.
- Required order: T00 → G00–G01 → G02–G06 → T01–T16. R01 is optional optimization.
- Original planning build: destination exit 0 with documented Vite diagnostics. New implementation checks are recorded separately below.

## Ticket status

| Ticket | Status | Evidence / remaining work |
| --- | --- | --- |
| T00 | In progress | Revisions recorded. The pre-migration `WebGLRenderer` baseline capture is still owed: this tree no longer contains that route, so it has to be measured from the archived revision. |
| G00 | Implemented foundation; acceptance incomplete | Source selection, actual-backend diagnostics, startup rollback, bounded recovery, cancellation and logical-state restoration. The destination side of the interaction/performance matrix is now covered by `check-renderer-matrix.mjs`; the source-side matrix and the late asset ownership audit remain. |
| G01 | Upgrade implemented; acceptance incomplete | Source pinned to Three 0.185.1; RenderPipeline; private r180 occlusion disabled; portable AO depth/normal workaround validated. Fixed-clock performance comparison remains outstanding. |
| G02 | Complete | Typed session/capability/recovery/timing adapters, and both applications now run on a `RendererSession` created by the bootstrap. `createFrameTimingSource` picks the timing mechanism by backend and reports the shipped timer's statistics; held by `verify-gpu-timing-parity.mjs`. |
| G03 | Complete | Horizon, terrain, analytic sky, cloud field, raster shadows, explicit lighting, volume/history and the PMREM owner are all in the production route. The scene-walking cloud shadow integrator is replaced by construction-time injection through one `WorldNodeMaterialContext`. Gated by the `scenery`, `volume`, `terrain` and `cloudresponse` fixtures on both backends. |
| G04 | Complete | Near/mid blade, far impostor card, accent foliage, the trail interaction pass and the octahedral impostor exporter are the production materials in both scenes. Grass geometry is packed to fit WebGPU's eight-buffer limit. Gated by `grass`, `impostor`, `foliage`, `trail` and `bake`. |
| G05 | Complete | Stone surfaces, river bed, water surface, cascades, the refraction pass and the actors are all ported, gated and shipped. Directional grass transmission/sheen and stone custom lighting have their own numerical coverage; the stone shader performance check now reads the generated program. |
| G06 | Complete | Both applications default to `auto` and reach a usable WebGPU renderer, falling back to the same TSL implementation on WebGL 2. `check-renderer-matrix.mjs` passes 13/13 across both scenes, both profiles, both backends, resize, BFCache, teardown, a failed adapter and automatic fallback. No legacy shader route is reachable from production or present in any bundle, enforced by `verify-built-site.mjs`. |
| T01 | Complete | Development attachments live in `WorldDevelopmentHooks`; experience config, identifier catalogs, versioned HUD settings and `WorldViewState` are in the production route. Optional owners allocate nothing when empty. Environment/scenic/reveal are separate frame fault domains from controls. Held by `verify-experience-config.mjs` and `verify-experience-lifecycle.mjs`. WorldApp remains under the 730-line architecture cap. |
| T02 | Complete | Shared cinematic wind is the default (`DEFAULT_WIND_MODEL`). The field matches the source model over 960 samples; CPU/GPU gusts share one gradient lattice. Near/mid/far grass consume the same cinematic gust and Lowsway rest bend. `?windModel=legacy` remains the comparison baseline. Held by `verify-world-wind.mjs`. |
| T03 | Complete | Eight presets (`drusniel`, Highfield, Emberfall, Greyrain, Galewind, Stillmeadow, Lowsway, Moonrise) owned by `WorldWeatherState`. Ordinary switching is now the T04 Settings selector; `?diagnostics=1` still exposes `window.__drusnielWeather`. Browser/dev-hook visual pass recorded 2026-09-08. Ecology and river placement were not retuned. |
| T04 | Complete | Iris, Start gate, Scene Settings, modal/minimap isolation and capture/QA bypass. Local `npm run build`, renderer-matrix 13/13, production-renderers 8/8, wind-cost convergence and an interactive WebGPU/WebGL 2 / compact pass recorded 2026-09-09. Live GPU-loss while Start/Settings owns input was not injected; that path stays on the bootstrap-recovery mocks. |
| T05–T16 | Pending | Next is T05 (rain, wetness and local water impacts). Deployment is not requested. |

**Renderer inventory: 0 pending.** 98 ported and comparison-gated, 94
development comparison locations, 7 exempt, and 4 shipped-GLSL modules retained
as comparison references — listed as finished rather than outstanding, because
nothing in the production route imports them and the built-site check fails if
their shader text reaches a bundle.

## Verification log

No complete integration milestone has yet been marked complete. Browser/backend tests record actual backend; mocks and build success do not establish visual parity.

- Source r180 initial checks: lint, 140 tests, 322 documentation assertions, production build passed. Browser preset/shape matrix rendered on WebGPU and WebGL2 but logged known TSL vec3 warnings. Initial numeric results preserved in `.shots/source-r180-results.json`; original screenshots were not frozen reliably and must not be used for pixel-difference claims.
- Source r185.1: lint, 141 tests, 322 documentation assertions and production build pass. Large bundle warning remains.
- Source `.shots/source-r185-verified/results.json`: seven presets and four grass shapes on each forced backend; zero console/page errors. Screenshots are moving scenes, not fixed-clock performance measurements.
- Direct multisampled GTAO depth still fails in r185 on WebGPU. Retained R32F depth conversion and added explicit scalar-depth normal reconstruction; both backends now compile/render without the prior vec3 error. No node_modules patches.
- Source `.shots/source-recovery/results.json`: unavailable WebGPU auto fallback, forced-WebGPU rejection, real WebGL context loss, and explicit WebGPU device destruction plus injected loss notification pass. The last case is **not** a spontaneous hardware-loss test. Expected loss/fatal diagnostics remain in the report. Preset, shape, old-owner disposal and single canvas are asserted. Full state/mask equivalence remains to be extended.
- Source recovery exposed random-audio cleanup timers disconnecting already released nodes. Disposal now cancels those timers; footstep one-shots are also owned and stopped.
- Destination original production build passed before material edits, with existing Vite dependency-scan shutdown diagnostics and bundle warning.
- Destination `scripts/verify-renderer-session.mjs` passes injected selection/init/cancellation/loss/capability, bounded recovery, and single-flight timing checks.
- Destination `.shots/renderer-harness/results.json`: both node backends pass with zero console/page errors; color chart, instancing, alpha cutout, texture updates, postprocessing and resize exercised. This fixture is reached only in development with `?rendererHarness=1&renderer=webgpu|webgl`; it is not the production world.
- Destination `npm run build` passes end to end, including every verifier and the built-site check. The production switch is done: both scenes run on the node renderer on both backends with zero console errors.
- Renderer inventory records 203 coupling locations in `renderer-migration-inventory.json` with **no pending entries**. The four retained GLSL modules are classified as comparison references rather than outstanding work.
- Destination `.shots/renderer-matrix/results.json`: 13/13 application-level checks across both scenes, both profiles and both backends, plus resize, BFCache, teardown, a failed WebGPU adapter and automatic fallback. Warmed frame time on the desktop world is 7.00 ms median on WebGPU against 20.80 ms on WebGL 2; the other cases sit on the frame cap.
- Destination full build passes with the adapter/initial scenery changes (existing Vite shutdown diagnostics persist). Later volume additions pass TypeScript and browser checks; rerun the full build after the next material checkpoint.
- `check-renderer-harness.mjs scenery desktop|compact`: cloud density, vertical profile and FBM sampled into a 96x64 GPU target match the original GLSL output exactly (RGBA8) on both backends. The fixture also renders horizon coverage and direct-light cloud composition. This numerical check covers the cloud field, not the complete terrain/sky appearance.
- `check-renderer-harness.mjs volume desktop`: matched 8-step raymarch comparison at 72x48 and fixed camera/time/frame has 1331 nonzero cloud pixels. WebGPU max difference 1/255, mean 0.000072 byte; WebGL max difference 6/255, mean 0.001302 byte. Gate is max 8 bytes / mean 0.02 byte to allow the measured rare hash/coordinate precision outlier. Screenshots and resize render without console errors. Temporal accumulation renders, but camera-cut/history equivalence still needs dedicated validation.
- `RenderTargetReadback.ts` strips r185 WebGPU's 256-byte row padding. Unit fixture verifies padding removal and tightly packed WebGL data. Readback orientation remains explicit in each comparison.

### 2026-09-07 terrain and sky checkpoint

- Added the portable terrain controller and typed TSL helpers for detail sampling, exact uint lattice fields, macro ecology correction, paths, biome/soil/community colors, coherent stone contact/occlusion, clump litter, shoreline, rock relief, surface normals and wet sheen. Existing CPU textures and palette inputs are reused.
- WebGPU validation exposed 11 terrain vertex buffers against the portable limit of 8. `prepareTerrainNodeGeometry` interleaves the eight custom fields into one buffer without changing their names or values. A contract test verifies every component and shared storage. Production chunk creation must call this before its first node upload when G06 wiring lands.
- Visual inspection exposed incorrectly typed Color arrays; they now upload as `color`, then swizzle to shader vec3. Numerical comparison exposed TSL numeric matrix constructors' row ordering; explicit vector columns preserve the original texture rotations.
- Terrain comparison uses a deterministic 192x128 geometry/attribute fixture, raw albedo and encoded surface normals against the original GLSL material. (The normal half of this comparison was isolated through a material that ignores `normalNode`; see the correction in the stone entry below. It was re-measured and the conclusion held.) It covers 18,284 visible pixels, including paths, wetness, two biomes, community weights, stone contact and steep rock. It is not a complete production-world screenshot comparison.
- Desktop albedo: WebGPU maximum 1 byte, mean 0.000556 byte; WebGL2 maximum 1 byte, mean 0.000027 byte. Compact albedo: WebGPU maximum 1 byte, mean 0.000353 byte; WebGL2 exact. Desktop normals: maximum 1 byte on both, mean about 0.0102 byte. (The normal figure predates the isolation fix; re-measured through the real material it is maximum 1 byte, mean 0.0046, with no pixel differing by more than a step.) Browser gates enforce max 1 byte, with mean <=0.001 for albedo and <=0.02 for normals. Compact normal check is included in the final checkpoint matrix.
- Both terrain backends render without console/page errors and survive resize. `dumpTerrainShader=1` exposes generated shader text only in the development harness for inspecting branch placement and upload types.
- Added `WorldSkyNode` for sky/volume ownership, an explicit pre-beauty history update, analytic fallback and a cloud-free node PMREM bake. Scenery fixture now exercises this owner. Production reconstruction remains the renderer session owner's responsibility.
- Shared renderer state scope restores target/cube face/mip, viewport/scissor, clear state and autoClear after synchronous offscreen failures. Cloud constructor rollback now releases all completed allocations.
- Added renderer session/readback/terrain-buffer contracts to the required build command. Full build is rerun after this checkpoint; earlier build passed before the final fixes, with the existing Vite shutdown diagnostics and bundle warning.
- G03 and the full integration remain incomplete. No production renderer switch, deployment or completion claim has been made.

### 2026-09-07 grass blade material checkpoint

- `GrassNearNodes.ts` ports the whole near/mid blade vertex and colour path: per-blade dither and the two LOD keep tests, detail split, silhouette variation, sub-pixel width clamp with its colour payback, noise and sine gusts, tuft phase, weather envelope, flutter, wind and trail rotation about the root, contact occlusion, micro-detail normal fade and both the per-vertex and per-fragment palette paths. `GrassNearNodeMaterial` adds the fragment response — Lambert mix, transmission and the gust-gated waxy lobe — by overriding the lighting setup rather than patching a shader string.
- No second copy of grass state: the node material reads the `IUniform` objects `GrassNearMaterial` already writes, through `reference`/`uniformArray`, so `configure`, art direction, LOD, quality and trail setters drive both implementations. The legacy file gained only a uniform accessor, a sampler-refresh hook and the feature record; every text-asserted declaration is unchanged.
- `check-renderer-harness.mjs grass desktop|compact`: four comparisons (desktop and compact feature sets, deformation and albedo) against the shipped GLSL material over a deterministic 484-blade instanced field at 256x176. WebGL2 is exact in all four. WebGPU is exact in three and differs by one RGBA8 step with mean 0.0000074 byte on compact albedo. Deformation is compared as the offset from the undeformed instanced vertex at 1.5 per metre, so one step is 2.6 mm of blade movement. Both backends render the lit field with zero console or page errors.
- The comparison isolates albedo and deformation through a basic material. **Lit output parity is not established**: the two implementations light through different models, exactly as recorded for terrain. A full-scene comparison of the lit blade field remains outstanding.
- Attribute budget: a blade needs position, normal, uv, four per-vertex fields, four per-instance fields and the instance transform. As separate buffers that is twelve, over WebGPU's eight-buffer floor, and nineteen locations once the transform is a vertex attribute. `prepareGrassNodeGeometry` packs the blade fields and the instance fields into one buffer each, and the material's own position setup suppresses three's built-in instancing so only one instance matrix is bound: six buffers, fifteen locations. Production geometry must call the packing before its first node upload, and callers that share instance buffers across tiles must pack the shared source once — G04 wiring work.
- Three exposes no accessor for the instance matrix node, so `InstanceMatrixNode.ts` mirrors three's own interleaved construction, keyed per instanced attribute and re-synced per object so streaming rewrites still upload. Below three's uniform-buffer limit this is a second view of the same array rather than the same GPU buffer; removing that duplication needs an upstream accessor and is recorded as remaining migration work, not worked around by re-deriving the transform.
- Two defects found by the checks rather than by inspection. `instancedBufferAttribute` in r185.1 applies the instanced flag only on its whole-matrix branch and drops it for an explicit component type, which bound the transform per vertex; the columns are now constructed directly. And `modelViewMatrix` is a lazily declared shared variable whose only readers were the wind and trail branches, so it was declared inside their scope and every blade that skipped them projected through an uninitialized matrix — the whole field collapsed onto the camera. It is now forced to initialize before the branches, the same hazard the terrain surface normal hit.
- The grass palette fixture was previously unverified. It differs from the CPU baker by at most one RGBA8 step, mean 0.0326 byte, identically on both backends: float32 and float64 rounding to different sides of a byte boundary. The gate keeps the one-step maximum, which any formula error would break, and records the measured mean.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Terrain, scenery, volume and palette harness fixtures still pass on both backends.
- G04 is not complete. Impostors, detail foliage, the trail ping-pong passes, the GPU atlas bakers, island grass and all production wiring remain, and no production renderer switch or deployment has been made.

### 2026-09-07 grass impostor card checkpoint

- `WorldGrassImpostorNodes.ts` ports the far-grass card: the cylindrical/spherical billboard blend, subpatch placement, the LOD and canopy-transfer coverage terms with the terrain dither, the wind shear, hemi-octahedral view selection, packed-atlas addressing with capped mip gradients, the stochastic view, alpha and coverage dithers with their discards, the palette and the transmission term. `WorldGrassImpostorNodeMaterial` resolves the billboard in world space and brings it back through the model transform, so view position, fog and clip position stay on the pipeline's own path.
- The cards light themselves in the vertex stage rather than through a lighting model, so `WorldNodeMaterialContext.vertexIrradiance` now sums ambient, hemisphere and directional irradiance the way three's uniform blocks carry them, including the hemisphere light's world position used as a direction. That means this comparison covers the **complete lit output**, not only albedo as the terrain and blade checks do.
- `check-renderer-harness.mjs impostor desktop|compact`: both feature sets — view blending with the noise gust, and the compact single-view sine-gust path — against the shipped GLSL over a deterministic 81-patch receding field at 288x192, with the sun placed beyond the cards so the transmission term is actually driven. **On WebGL 2 the node card is bit-exact: same 2,986 pixels, zero colour difference, on both variants.** On WebGPU 39 of 2,963 shared pixels differ in coverage and 54 of ~8,900 channels differ in colour.
- The WebGPU residual is a property of the comparison, not of the port: the reference always renders through a `WebGLRenderer`, so a stochastic material is being compared across an API boundary. Last-bit differences in attribute interpolation and in backend mipmap generation move a dither one side of its threshold, and a flipped discard is a whole card colour away from the sky. The gate therefore demands exactness where both sides are WebGL 2 and bounds the cross-API run as a fraction of the cards.
- The check found that the shipped shader's `flat` qualifiers are load-bearing. Interpolating a value that is constant across a card still carries barycentric float error, and the subpatch index addresses an atlas page while the instance seed keys all three hashes — so a last-bit wobble picked a different atlas cell and a different threshold per pixel. Before the flat varyings 11,631 dither channels differed; after them, zero. Only the transmission term stays interpolated, as the shipped shader declares it.
- The card's backlight dots a world-space normal with a view-space light direction in the shipped shader. That space mismatch is part of the current appearance, so the port reproduces it deliberately rather than correcting it; changing it is an art decision, not a migration one.
- Attribute budget: the packer now also folds `grassSubpatchOffset` and `grassSubpatchIndex`, bringing a card to position, uv, one packed vertex buffer, one packed instance buffer and the instance transform.
- Diagnosis order, for the record: silhouettes, uv, irradiance, frame index, minification and effective coverage were each verified equal before the dither was isolated, so the fix addressed the measured cause rather than a guess.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Grass, impostor, terrain, scenery, volume and palette harness fixtures all pass on both backends and both profiles.
- G04 remains incomplete: detail foliage, legacy island grass, the trail ping-pong passes, the GPU atlas bakers and every production wiring step are outstanding, and no production renderer switch or deployment has been made.

### 2026-09-07 accent foliage checkpoint

- `WorldDetailFoliageNodes.ts` ports the accent layer: the packed species/variant/tint decode, the species-staggered distance fade with its world-space band wander, the density early-out, the groundcover splay against the upright yaw billboard, the per-species wind ramp, atlas cell addressing, the distance-loosened cutout discard, the understory contrast and edge-darkening terms, the phenotype-varied petal tint, irradiance and transmission. `WorldDetailFoliageNodeMaterial` keeps the alpha (cutout times distance fade) and reproduces the vertex early-out by sending rejected cards out of clip space through `vertexNode`, rather than collapsing them to a point that would still rasterize.
- `check-renderer-harness.mjs foliage desktop|compact` runs each feature set twice against the shipped GLSL over a deterministic 121-card receding patch covering every species, variant row and tint. **With one pass per renderer the node card is bit-exact — maximum 0, zero coverage mismatch — on both backends and both variants.**
- Under production settings the same comparison differs on 198 of 10,863 channels with zero coverage mismatch, identically on both backends. The cause was measured, not assumed: forcing single-pass on the node material alone makes the comparison exact, while forcing it on the reference alone changes nothing. Three's node renderer honours the two-pass back-then-front order for double-sided transparent materials where the WebGL reference draws once, so an overlapping accent can resolve to a different card at the same pixel. That is a renderer behaviour difference — arguably the node renderer being the more correct of the two — not a port defect, and the check keeps measuring it rather than hiding it behind the single-pass mode.
- Diagnosis order, again recorded: uv, atlas cell, traits, irradiance and palette each differed under production settings and each became exact once the card was rendered with depth writes or a single pass, which is what isolated the difference to fragment ordering rather than to any term in the shader.
- The packer now also folds `instanceAccent`, so an accent card is position, uv, one packed instance buffer and the instance transform.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Grass, impostor, foliage, terrain and palette harness fixtures pass on both backends and both profiles.
- G04 remains incomplete: legacy island grass, the trail ping-pong passes, the GPU atlas bakers and every production wiring step are outstanding, and no production renderer switch or deployment has been made.

### 2026-09-07 trail interaction pass checkpoint

> **Superseded in part.** The orientation reasoning in the last bullet of this
> entry is wrong, and the fix it describes mirrored the field. See "review
> findings and corrections" at the end of this document.

- `GrassTrailNodes.ts` ports the feedback update — reprojection through the scroll delta, exponential decay with its linear recovery floor, the bounded contact loop with the disc and ring falloffs, the directional blend and the authority mix — and `GrassTrailNodePass.ts` owns the portable targets, choosing half float where the backend can render it and bytes otherwise, the same precision policy the WebGL pass takes from its extension probe.
- The pass is injected rather than duplicated. `GrassTrailField` keeps one owner for the covered square, the contact packing, the 30 Hz accumulation and the ping-pong index; `attachNodePass` hands a factory this field's own uniform table, so the node update reads the very objects `render` writes. Every existing lifecycle assertion in `verify-runtime-safety`, `verify-grass-performance`, `verify-session-lifecycle` and `verify-runtime-guard-lifecycle` still passes unchanged.
- `check-renderer-harness.mjs trail desktop|compact` drives both passes through the field itself over a twenty-four step scripted walk — scrolling and stationary, with two feet, a body, a periodic landing ring and steps carrying no contact at all — and reads each result through the field's public texture. **Both walks are bit-exact on both backends: maximum 0 across all four channels.** A feedback loop compounds any divergence, so twenty-four steps agreeing exactly is a strong statement about the update itself.
- The comparison found two real defects rather than confirming a guess.
  - The shipped WebGL priming bound `uPrevious` to the target it was drawing into. That is a feedback loop, so WebGL dropped the draw and the first target kept its clear instead of neutral: every texel started with a crush direction of (-1, -1) rather than zero. It is mostly masked in play, because a contact overwrites the direction at full authority while crush is still zero, but a weak contact over already-crushed grass could bias the lay near the very first footfalls. Priming now binds the other target; the node pass does the same.
  - ~~Three's full-screen quad carries v increasing downwards, the opposite of the convention every grass material samples this field with. Written at the raw quad coordinate the trail was stored mirrored.~~ **Wrong, and corrected below.** Three normalizes render-target sampling, so writing and reprojecting at the quad's own coordinate is what agrees with every material; the mapping this bullet added is what mirrored the field. The check now probes the contract end to end instead of comparing raw row order.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Trail, grass, impostor, foliage, terrain, scenery, volume and palette fixtures pass on both backends and both profiles.
- G04 remains incomplete: the GPU atlas bakers, legacy island grass and every production wiring step are outstanding, and no production renderer switch or deployment has been made.

### 2026-09-07 impostor exporter checkpoint

- `OctahedralImpostorNodeBaker` bakes the hemi-octahedral atlas through the node renderer: portable render target, per-view camera, viewport and scissor, and an async readback whose row order is resolved from the renderer's coordinate system rather than assumed. The blob encoder and the bake manifest are now shared functions rather than a second copy, so both exporters describe an atlas identically, and the WebGL exporter keeps every lifecycle assertion it had.
- `check-renderer-harness.mjs bake desktop` bakes the same source — a six-colour cube with an offset cone, so no two views look alike — through both exporters and compares the raw atlases. **The node atlas is texel-identical on both backends: maximum 0, identical covered area, identical manifest, and the encoded PNGs come out the same size.**
- Three API differences had to be found and handled, each of which silently produced a wrong atlas rather than an error.
  - With a render target bound, the node renderer takes the viewport and the scissor *rectangle* from the target, not from the renderer; only the scissor test still comes from the renderer. Setting them on the renderer alone drew every view over the whole atlas.
  - `clear()` builds its own render context from the target's dimensions and never applies the scissor, so the per-view clear the WebGL exporter does wiped the whole atlas and left only the last view. The cells are disjoint and each is written once, so a single clear before the loop is both correct and sufficient.
  - A render target's viewport counts rows from the top on both node backends, where the WebGL exporter counts them from the bottom. The node exporter therefore addresses cells at the row its own manifest already documents.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Bake, trail, grass, impostor, foliage and terrain fixtures pass on both backends.
- G04 remains incomplete. Every grass material, the interaction pass and the exporter are ported and verified, but the island application still constructs a `WebGLRenderer` and the legacy materials, and no production wiring or renderer switch has been made in either scene.

### 2026-09-07 island grass variants, stone surface, and a correction

- The blade comparison now covers all four shipped configurations. The island regression scene resolves LOD from one scene-wide threshold rather than per-blade camera distance, and its mid layer inverts that threshold; both are compiled branches, so they were ported but never verified. Added as their own variants, **both are bit-exact on both backends**, deformation and albedo alike.
- `StoneSurfaceNodes` ports the stone surface: the weathering crust and stain, the broken bedding partings with their derivative antialias, the moss and lichen colonies with breakup and runoff, the triplanar grain in both albedo and normal-bump form, and the wet darkening. `StoneSurfaceNodeMaterial` adds the three terms the shipped shader applies around the lit result — sky-side fill, ambient floor and sheen — in that order, and `StoneCoarseNodeMaterial` covers the far batches.
- **The shipped stone vertex packing cannot be bound on WebGPU at all.** WebGPU has no three-component 8- or 16-bit vertex format, and the batch stores normals, the growth position and three colours exactly that way; pipeline creation fails with "vertex format not supported". `prepareStoneNodeGeometry` re-views the same two interleaved streams through four-component windows that land on legal offsets, and the surface nodes reassemble the channels. No data moves: the batch keeps its forty bytes per vertex and its three vertex streams, and the WebGL path keeps binding the original attributes.
- `check-renderer-harness.mjs stone desktop|compact` compares one stone body carrying every baked channel. On WebGL 2, where both sides render through the same API, the coarse surface is exact, the derivative-built normal bump agrees to one quantization step with zero pixels differing by more than that, and the detail albedo differs on 33 of 150,528 channels by at most 4. On WebGPU the screen-space derivatives are being compared across an API boundary, which moves individual facet-edge pixels; that run is bounded on the average and still measured, with the same-API run holding the port exact.
- **Correction to an earlier entry.** The terrain normal comparison recorded on 2026-09-07 isolated through `MeshBasicNodeMaterial`, whose `setupNormal` returns the geometry normal and ignores `normalNode` outright (three #28839). It was therefore comparing the shipped *perturbed* normal against an *unperturbed* node normal and reporting the difference as agreement; the recorded mean of 0.0102 byte was that difference, not a parity result. Both the terrain and stone comparisons now isolate through the real material with an output override. Re-measured, the terrain normal port stands: maximum 1 byte, mean 0.0046, zero pixels differing by more than a step — so the conclusion held, but it had not actually been tested until now.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Stone, terrain, grass, impostor, foliage, trail, bake and scenery fixtures pass on both backends and both profiles.

### 2026-09-07 review findings and corrections

A review of the migration working tree raised eight findings. Seven were real and are fixed; one was not reachable. The first one invalidated a claim recorded earlier the same day.

- **The portable trail pass stored the field mirrored, and the earlier checkpoint said the opposite.** The previous entry recorded that three's full-screen quad carries v downwards and that writing at the raw quad coordinate would store the trail mirrored. That reasoning was backwards. Three normalizes render-target sampling across the backends, so a pass that writes at `uv()` and reprojects at `uv()` is consistent with every material that samples the finished field; the flip that entry added is what mirrored it. The bit-exact agreement reported against the WebGL reference was real but proved the wrong thing: both passes agreed on raw row order, and raw row order is not the contract.
  - The check now asks the contract directly. One contact is submitted well off centre in +Z, and the finished texture is sampled at a constant `(world - centre) / coverage + 0.5` — the coordinate a blade uses. Before the fix that probe read 0 at the contact and 255 at its mirror; it now reads 255 and 0 on both backends. Had this shipped, blades would have bent on the wrong side of the character.
  - With the flip removed, the two passes store the square in opposite row order and each is correct for its own materials, so the row comparison now runs through that reversal and keeps the unreversed mapping as a guard that the reversal is measured rather than assumed. The twenty-four step walks stay bit-exact.
- `readRendererCapabilities` probed only `EXT_color_buffer_float` for renderable half float, while the legacy trail pass accepts `EXT_color_buffer_half_float` as well. On a device offering only the latter the portable pass would have silently dropped to bytes — a different decay floor, not merely a different precision — and the two passes would have disagreed about it. Both extensions are now accepted.
- `GrassNearMaterial.update` notified its uniform observers before writing the frame's trail and contact uniforms, so a node material syncing samplers would have bound the previous frame's ping-pong target. The notification now runs after the writes on every path.
- `GrassTrailField.attach` guarded on its own targets alone, so attaching the WebGL pass over an attached node pass built a second, unused pass and leaked the first. It is now symmetric with `attachNodePass`.
- `RendererRecovery` released the owner in the per-attempt catch and again in the outer catch, so a throwing release could swallow the failure the owner has to present. The exhausted-backends path now reports directly. The related claim that the message could come out empty is not reachable: the loop always records at least one failure before it ends.
- The node trail pass constructed its two targets in one `push`, so a throw from the second left the first outside the array the rollback disposes.
- The impostor exporter handed an `async` callback to the synchronous renderer-state scope, which restores state when the promise is created rather than when it settles. The readback now starts outside the scope.
- `GrassTrailField.isPrecise` reported half-float precision with no pass attached at all, despite being the gate for comparing the two passes.

All fixtures pass on both backends after the fixes, and the full build passes.

Documentation caught up with the code in the same pass:

- The two superseded entries above are marked in place, so neither reads as current: the trail entry's orientation reasoning is struck through with a pointer to the correction, and the terrain normal figure carries the note that it predates the isolation fix along with the re-measured value.
- `renderer-migration-inventory.json` was regenerated with a real status per occurrence instead of a blanket "pending". A coupling counts as ported only when a portable implementation exists *and* a named check compares it against the shipped one; the file records which check. Of 186 locations, 24 are ported and gated, 57 are the development comparison harnesses themselves, and 105 remain genuinely unmigrated.
- `webgpu-node-renderer-notes.md` collects the node-renderer behaviours this migration had to discover — instanced attribute binding, the vertex budget and WebGPU's vertex formats, lazily declared shared variables, flat interpolation, `MeshBasicNodeMaterial` ignoring `normalNode`, target-owned viewport and scissor, clear ignoring the scissor, normalized render-target sampling, feedback loops, and two-pass double-sided transparency. Each entry names the check that holds it. Every one of them failed silently, so the note exists to stop the remaining G05 and G06 work rediscovering them one wrong image at a time.

### 2026-09-07 river bed checkpoint

- `WaterRegimeNodes` ports the shared regime helpers — the pool/run/riffle/rapid split, the bank sides, the streak stretch and the two lake bands — as the surface pass will need the same set. `WaterBedNodes` ports the bed itself: the depth-lowered position, the refraction and wobble offsets, the riffle/pool/bank classification from depth ratio and meander morphology, the bedload and fines distribution, algae drift, depth extinction, caustics, and the two hard discards plus the screen-space stipple.
- `check-renderer-harness.mjs water desktop|compact` renders a meandering reach that carries every regime the bed distinguishes: coverage falling to both banks so the stipple margin is reached, depth crossing the reference on both sides, a bend so the bank split is non-zero either way, and a still corner. **The node bed is exact on both backends: maximum one quantization step, no pixel differing by more than that, and zero coverage mismatch.**
- Two residuals had to be separated before that held, and neither was cross-API — both showed identically on WebGL 2 and WebGPU.
  - Ordered dithering is an output detail both materials apply from the fragment coordinate. Left on, it put a plus or minus one on a quarter of the reach and buried the colour comparison; it is disabled on both sides, since its pattern is not what the port owns.
  - `screenCoordinate` counts rows from the top on both node backends, where `gl_FragCoord` counts them from the bottom, so the bed's 4x4 stipple dissolved an equivalent but different set of margin pixels — 592 of them. Flipping against `screenSize.y` reproduces the shipped coordinate exactly and takes the mismatch to zero. Equivalent-looking was not good enough: only the identical form keeps the check strict enough to catch the next mistake.
- The coupling inventory now records 25 ported and gated locations against 104 still pending, and the portability notes carry the fragment-coordinate finding.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Water, stone, terrain, grass and trail fixtures pass on both backends and both profiles.

### 2026-09-07 water surface checkpoint

- `WaterSurfaceNodes` ports the largest shader in the project — the 358-line surface fragment plus its flow, wave, foam and optics function blocks. `WaterOpticsNodes` carries the Beer-Lambert transmittance, the shore-to-deep blend, the depth-authoritative refraction lookup and the Schlick balance; `WaterSurfaceHelperNodes` carries the advected flow noise, the lake and river slopes, the river crest phases, the micro chop, the stone edge and the two foam terms. `WaterSurfaceNodeMaterial` is a `MeshPhysicalNodeMaterial` writing the same four things the GLSL patch does at `<normal_fragment_maps>`: the view-space normal, the albedo, the roughness and the alpha.
- The four outputs are separate nodes over **one** shared graph rather than four independent chains. The slope the normal bends by is the same node object the refraction offset samples with, and the transmittance the alpha reads is the same one the colour was mixed from — which the shipped fragment guarantees only by writing them in order, and its optics function only by returning an out-parameter.
- `check-renderer-harness.mjs water` now runs six surface comparisons alongside the two bed ones: albedo and alpha on both optics presets, plus the normal and the roughness. Each is isolated through the real material with an output override, over a reach carrying a meander, both bank sides, a still lake band with its exposure and shore wavelets, a tilted geometric normal, and a stone with a wake. **On WebGL 2, where both sides are the same API, every channel is exact: maximum one quantization step, zero pixels differing by more than that, zero coverage mismatch.** On WebGPU the flow noise's mip selection crosses an API boundary, moving at most 26 of 66,702 channels; that run is bounded and still measured.
- The comparison found two real defects, neither of which would have shown as an obviously wrong image.
  - **The node material was shading at a different base roughness.** `materialRoughness` reads the node material's own `roughness` property — a second copy of a value `WaterMaterialController.setLiveVisuals` owns and writes on the shipped material. The two were a flat 0.08 apart across the whole reach. The controller now mirrors it into the uniform table as `uWaterRoughness`, written wherever `material.roughness` is, and the node path reads it with `reference` like every other input. This is exactly the failure the "one owner" rule exists to prevent, and it took a numerical check to see it.
  - **The alpha channel could not be isolated the way the others could.** `NodeMaterial.setupDiffuseColor` applies the OPAQUE clamp — alpha forced to one on a non-transparent material — inside its own setup, so an opaque node material has already discarded the alpha by the time `outputNode` reads it. The GLSL clamp is in `<opaque_fragment>`, after the patch's insert point, so the legacy side can stay opaque where the node side cannot. The first run reported a mean difference of 146 bytes and 268 mismatched fragments; both go to zero once the node material is transparent for that run.
- `verify-architecture`'s line budget for `WaterMaterialController` is raised from 220 to 240, with the reason recorded beside the constant. The additions are the uniform-table accessor and the roughness mirror; the surface composition still lives entirely in `WaterShader`.
- The coupling inventory now records 26 ported and gated locations against 103 still pending, and the portability notes carry both findings above.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning. Water, stone, terrain, grass, impostor, foliage, trail and bake fixtures pass on both backends.
- G05 remains incomplete. The water cascades, the refraction pass, `ActorEnvironmentResponse`, the tree and actor materials and the remaining render utilities are still unported, and no production renderer switch has been made in either application.

### 2026-09-07 cascade checkpoint

- `WaterCascadeNodes` and `WaterCascadeNodeMaterial` port the falling-water curtain: the square-root fall age the strands advect by, the two detuned noise taps, the tear-jittered breakup, the strand gaps, the crest, impact and aeration bands, the squared edge falloff and the three-branch sill weighting. It stays the cheap unlit double-sided material the shipped one is; only the colour and the alpha are node graphs.
- The comparison builds its curtains through `createWaterCascadeGeometry` itself rather than a hand-rolled quad, because the `cascade` and `cascadeCrest` attributes are a contract between the geometry and the shader and a port that reads them differently is exactly what has to be caught. Two falls of very different drop, with sill profiles straddling the centreline in opposite directions, cover both ends of the fall mapping and both sides of the sill weighting.
- **The curtain is exact on WebGL 2 — maximum 0 on both the albedo and the alpha — and within one quantization step on WebGPU.** Nothing in it selects a mip or reads a derivative, so there is no API boundary to bound here; the WebGPU run is held to the same strict gate.
- The alpha run covers far fewer pixels than the albedo one and that is the material working: most of a curtain is genuinely see-through, so its alpha rounds to zero at byte precision while its colour never does. The two thresholds are separate for that reason rather than the lower one being a concession.
- Float addition order was matched term for term rather than rearranged for readability. The shipped brightening is `0.96 + sheet*0.16 + crest*0.24`, and starting the node chain from the sheet term instead would have been algebraically identical and numerically one bit apart — enough to lose the exact gate for no benefit.
- The coupling inventory now records 27 ported and gated locations against 102 still pending. Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning; the water fixture's twelve comparisons — two bed, six surface, four cascade — pass on both backends.

### 2026-09-07 refraction capture checkpoint

- `WaterRefractionNodePass` ports the high-preset refraction capture. It keeps the shipped pass's layer — what the water may look through is a property of the scene, not of the renderer, so the two must agree about membership or the preset would show different things on different backends — and keeps the half-scale target, the depth attachment and the restore-on-throw discipline. `autoClear` is saved and restored alongside the layer mask and the bound target, because the node renderer's clear is a separate step from its render.
- The comparison measures two things, because two different failures are possible and only one of them shows in the colour.
  - **The capture** proves the layer mask, the clear and the target sizing agree. Three boxes, two refractable and one excluded and placed so a pass that ignored the layer would occlude a box that belongs. Both renderers draw the same scene through the same classic materials, so this isolates the pass rather than a material.
  - **The coverage mask** proves the depth attachment means the same thing on both paths. The surface treats depth 1 as "no refractable geometry here" and keeps its own colour, so a capture whose depth read as near-1 everywhere would blend an empty target into the water — the failure that produced pure-black grazing-angle water before the depth test existed. The mask is produced by sampling the depth texture through the same 0.9999 threshold the material applies, on each renderer's own side, and the two masks are compared.
- **Both are bit-exact on both backends: maximum 0 on the capture and on the coverage mask, with 2,361 of 12,288 pixels marked as refractable on either path.** No tolerance was needed anywhere in this pass.
- The coupling inventory now records 32 ported and gated locations against 98 still pending. Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning, and the water fixture's fourteen comparisons pass on both backends.
- G05 still has `ActorEnvironmentResponse`, the tree and actor materials and the remaining render utilities outstanding, and no production renderer switch has been made in either application.

### 2026-09-07 actor environment response checkpoint

- `ActorEnvironmentNodeResponse` ports the skyward rim and the ground bounce the player, the villagers and the deer all share. It hooks `setupOutput`, which is the documented node counterpart of the GLSL insertion point: both add to the lit result immediately after it is assembled from the diffuse, specular and emissive totals, and both land before fog and premultiplied alpha. The colours and strengths are now exported from the shipped module and read through `uniform` bound to those very objects, so the two responses cannot be tuned apart.
- **Overriding `outputNode` instead would have discarded the lighting entirely and still produced a plausible image**, which is why the comparison deliberately does not isolate a channel here. It renders a lit torus knot and sphere — the knot presents every normal orientation at once — and runs twice: once unpatched, once responded.
- The unpatched run is the control, and it turned out to be the strongest result in the checkpoint: **`MeshStandardNodeMaterial` and `MeshStandardMaterial` light this scene bit-identically on WebGL 2, maximum 0 across 46,128 channels.** Against that baseline the response itself is exact to a quantization step: maximum 1, zero channels differing by more than that, identical silhouette. On WebGPU both runs sit at maximum 2 with two or three channels moving, so the response adds nothing measurable to the backend's own difference.
- The gate is written against the control rather than against an absolute, so it keeps meaning if the two lighting implementations ever drift: the responded run must not move the image measurably further apart than the unpatched one already is.
- The coupling inventory now records 33 ported and gated locations against 97 still pending. Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning.

### 2026-09-07 source divergence resolved on both sides

Two of the destination's renderer files were ported from the source during G00, and two defects came across with them. Both are now fixed in **both** repositories, and — this is the part that was missing — both are now held by a check in each, every one of which was confirmed to fail against the unfixed code before being kept.

- **The half-float capability probe.** `EXT_color_buffer_float` alone was probed, so a device exposing only `EXT_color_buffer_half_float` reported no renderable half-float target. Fixed here earlier in the migration; the fix was not held by anything, and `verify-renderer-session` was in fact asserting through a stub whose `getExtension` always returned null, which could never have caught it. It now asserts both the negative and the half-float-only case. The source is fixed in `src/rendering/RendererCapabilities.js` and held by a new case in `test/rendererSession.test.js`.
- **The double release on the exhausted-backends path.** Throwing into the shared catch released a second time, and a release that throws there replaces the recovery failure the owner has to present with the cleanup error. Fixed here earlier; likewise unheld. Both repositories now assert the exact release count on a forced-WebGPU recovery — two, one for the renderer being replaced and one for the failed attempt — and that the failure still reaches `onFailure`.
- Writing that test caught an error in my own first attempt at it: I asserted a single release on an `auto` recovery, which is wrong, because two backends mean two legitimate per-attempt releases. Forced WebGPU is the case that makes the count exact.
- The source's full suite passes (143 tests) and lints clean; the destination's `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning.

The divergence is recorded in the integration plan as section 2.2b, with an explicit instruction not to re-import `RendererCapabilities`, `RendererRecovery` or `RendererSession` from source when the T-tickets pull its features across — the destination copies are the corrected ones.

The section also records what is **not** shared, so later work does not go looking for it:

- The trail priming feedback loop was the destination's own. The source's interaction map is a CPU `Uint8Array` and `DataTexture`, with no ping-pong target to bind as both attachment and sampler.
- The source has no render-target readback helper, so the row-padding finding does not apply to it.
- None of the defects found while porting water, cascades, refraction and the actor response are source defects. All of them are artifacts of running a node implementation beside a GLSL one and comparing them numerically, which the source never does: it sets `roughnessNode` from an explicit uniform and has no GLSL reference to match against.

### 2026-09-07 actor and tree material coverage

G05 item 5 asks for actor and tree materials preserving skinning, vertex colours, texture maps and side. The response itself was already ported; what was unproven was that it composes correctly with each of those.

- **Tree materials need no port.** `WorldTreeSystem` builds plain `MeshStandardMaterial` bark and leaves with no shader patch at all, so the node renderer already handles them. The `flat` actor run below is that exact material shape, and it is the strongest evidence in the checkpoint.
- The actor comparison now runs five features — `flat`, `vertexColors` (villagers and deer), `map` (the GLTF atlas the loader assigns), `skinned` (every imported character) and `backSide` (the cloak lining) — each paired with an unpatched control at the same feature. **All ten runs pass on both backends**, with the responded run never further from the reference than that feature's own unpatched baseline. On WebGL 2 the controls are largely bit-identical and no responded run differs by more than one quantization step, with zero channels differing by more than that and no silhouette change.
- The `skinned` run is the one that matters most, because skinning moves the normal as well as the position and the response reads the normal. A node path that skinned the geometry but left the response reading a bind-pose normal would pass every other run here.
- Two harness errors of my own surfaced while building it, both corrected before the run was kept.
  - The skeleton was constructed from already-posed bones, so its inverses came from the pose and the bind transform cancelled the bend. The subject was displaced rather than deformed, and the run would have reported agreement about nothing in particular. It is now bound in the rest pose and posed afterwards.
  - The geometry was shared between the node mesh and the reference mesh, as every other comparison does. **That does not survive skinning attributes**: with the node renderer on WebGPU the reference drew nothing at all, while the identical shared geometry rendered correctly when both sides were WebGL 2. Each side now builds its own; deterministic construction keeps the two byte-identical, so nothing is given up. Recorded in the portability notes, since it presents as a port failure and is not one.
- **The three actor call sites are deliberately not converted yet.** `verify-character-lifecycle` and `verify-session-lifecycle` assert on the exact text of those construction blocks, including the `applyActorEnvironmentResponse` call inside their cleanup guards. Reshaping them into a shared factory now would break assertions that G06 item 2 already schedules for replacement with equivalent node behaviour checks. The evidence that the conversion is safe is what this checkpoint delivers; the conversion itself belongs in the same pass that updates those verifiers.
- Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning.

### 2026-09-07 diagnostics, dev tools and an inventory correction

G05 item 6 covers diagnostics, isolation hooks, readback and renderer-dependent dev tools. Most of what the inventory flagged there turned out not to be renderer coupling at all.

- **Four diagnostics were typed against the concrete WebGL renderer class without using anything specific to it.** Between them `WorldVisibilityProbe`, `GrassQaMetrics`, `GrassQaDownloads` and `GrassQaRunner` read four counters under `info.render`, call `render`, and take a blob off the canvas. Both renderers provide all of it — the node renderer's `info.render` carries `calls`, `triangles`, `points` and `lines` as a superset — so `RendererDiagnosticsTypes` names only those members and the four now serve either backend with no second copy. The types are deliberately narrow rather than a union of the two renderer classes, so a future edit reaching for a backend-specific API fails the type check instead of compiling against one of them.
- **`GrassWorkloadProbe` was deliberately left alone.** Its runtime feeds `GpuFrameTimer`, which is the WebGL-only timer, so widening it would only move the coupling one file along. The timer's portable counterpart `GpuTimingAdapter` already exists and is held by `verify-renderer-session`; selecting between them is a G06 production change.
- No verifier asserts on the text of the widened files, which was checked before touching them.

The inventory itself was materially wrong, in the direction that matters most — it overstated how much remains.

- **Eight G03 sky and cloud files were ported and measured during the sky and cloud checkpoints, but the inventory never recorded which check held them**, so 47 locations sat in "pending" while passing named assertions the whole time. `WorldSky`, `WorldSkyMaterial`, `WorldSkyCloudVolumeController`, `WorldCloudPassMaterials`, `WorldCloudShadowMap`, `WorldCloudShadowMaterialPatch`, `WorldCloudTemporalPass` and `WorldHorizonMaterial` are now listed against the scenery and volume fixtures. The scenery and volume checks were re-run on both backends and pass before anything was recorded — a listing added on the strength of a memory would be exactly the bookkeeping this file exists to avoid.
- **Six locations are not renderer couplings.** The scan pattern is broad on purpose, so it also catches a 2D canvas context in the minimap and in the two atlas factories, and the portable readback helper's own name. They are now classified with a reason rather than counted as outstanding work.
- `WorldSkyNode` is the portable route driving the node `PMREMGenerator`, not a coupling to migrate; it is held by the harness's `data-sky-environment` assertion.

The counts move from 86 pending / 36 ported to **30 pending / 90 ported and gated**, with 6 exempt and 87 being the comparison harnesses themselves. What genuinely remains is `WorldIsolationHarness` (7 locations, the largest real item), `StoneShaderPerformanceVerification`, the cloud shadow scene integrator and controller, and the production wiring in `WorldApp` and `IslandApp` — which is G06's subject by definition.

Full `npm run build` passes with the existing Vite dependency-scan diagnostic and bundle-size warning.

### 2026-09-07 review of the continued G05 checkpoint

Reviewed and corrected the handoff implementation. Full findings, named checks
and remaining acceptance work are in `webgpu-migration-review-2026-09-07.md`.

- Confirmed the backend-neutral isolation/diagnostics work and cloud-shadow
  response comparison; the cloud scene-integrator inventory entry was already
  present, so it was not duplicated. `cloudresponse` passes on both backends.
- Added failure-path contracts for optional texture detachment, refraction
  state restoration, asynchronous bake state ownership and trail rollback.
- Found and fixed three consumer-side water defects the former isolated checks
  missed: depth binding type, inverted refraction UVs and nearest-only compiled
  sampling. A real capture now feeds a previously warmed surface comparison.
- Added ambient-only grass lighting comparisons and fixed the missing colour
  mix. The compact volume matrix exposed and held a separate noise-octave fix.
- Fixed cleanup-error reporting and reentrant loss coalescing in both copies of
  `RendererRecovery`; source tests increased from 143 to 145 and pass with lint
  and build. These are shared utility fixes; the visual defects were in new
  destination ports, not in either shipped baseline effect.
- The local browser matrix now covers all 14 fixtures, both profiles and both
  forced backends: 28/28 fixture/profile pairs pass after fixes. No tolerance
  was loosened. The old Vite dep-scan diagnostic was traced to the SSR-only
  terrain-horizon verifier and fixed without changing its assertions.
- Inventory: **22 pending / 93 ported and comparison-gated / 6 exempt /
  95 development comparison locations**. Counts describe occurrences, not
  completed ticket acceptance or production reachability.

G05 acceptance remains open and G06 production wiring/recovery/performance
validation is not done. The user conditioned a commit on completion of the G
tasks, so this review does not create a commit. T01–T16 remain unstarted.

### 2026-09-07 directional grass and stone lighting coverage (G05 item 3)

Closed the third item of the review's remaining acceptance list: the lighting
terms that the existing albedo, normal, deformation and ambient comparisons
could not reach.

- **Grass gained a `directional` mode** and stone a `lit` mode. Both run the
  shipped materials unpatched against their node counterparts, so they are the
  only runs that reach transmission, sheen and the stone's custom lighting.
- **The directional run immediately found a real defect in the node grass
  port.** An assigned `normalNode` is returned verbatim by
  `NodeMaterial.setupNormal`, so it never receives the `faceDirection` flip the
  shipped GLSL gets from `normal_fragment_begin` on this double-sided material.
  Every back-facing blade fragment was lit from the opposite hemisphere.
  Ambient light is normal-independent, which is why the previous run passed at
  maximum 0 with the normal wrong. The fix is in `GrassNearNodeMaterial`; the
  bisection and the audit of the other three custom-normal materials are in
  `webgpu-node-renderer-notes.md`.
- **All sixteen grass runs are now exact** — four variants x four modes, on
  both profiles and both backends. Sheen is covered on the one variant whose
  feature set enables it; transmission on all four.
- **Stone lit passes on both profiles and backends.** Same-API it is nearly
  exact; its two new bounds are set from measurement and no existing tolerance
  was changed.
- Gate counts moved from 12 to 16 grass reports and 3 to 5 stone reports.
  `npm run build` passes with the known bundle-size warning. The inventory is
  unchanged at 22 pending / 93 ported and comparison-gated / 6 exempt / 95
  development comparison locations.

Acceptance items 1, 2, 4 and 5 — the production wiring, the timing adapter
swap, the G06 backend/fallback/recovery matrix and the legacy route removal —
remain open. T01-T16 remain unstarted.

### 2026-09-07 portable frame timing and diagnostics contexts (G05 item 2)

Closed the second item of the review's acceptance list. The GPU timing swap was
the named blocker on four pending inventory entries.

- **A parity check between the two timers found a real disagreement.** Both are
  pure once samples land, so `verify-gpu-timing-parity.mjs` drives them from
  source over nineteen sample counts instead of inferring agreement from a HUD.
  The medians matched everywhere; the p95 was one sample high in the adapter for
  seven counts, including the 120-sample ring the HUD actually settles at. The
  adapter now uses the shipped `percentile` rather than a second rule.
- **`createFrameTimingSource` picks the mechanism by backend** — the disjoint
  timer query for a classic renderer, the backend's timestamp pool for a node
  one — behind one `FrameTimingSource` contract, so the diagnostics no longer
  branch. `trackTimestamp` is a backend construction parameter, so the factory
  requires it *and* the capability; otherwise a renderer built without it would
  report "active" against zero samples forever. The check fails if that
  conjunction is weakened.
- **The workload probe, diagnostics controller and visual matrix context no
  longer name a renderer class.** They carry `DiagnosticsRenderer` and
  `RendererWithFrameInfo` instead, which is what they actually use.
- **The stats panel declines what it cannot measure.** stats-gl 2.0.1 only
  patches a classic `WebGLRenderer`, and a WebGPU canvas has no WebGL 2 context
  to fall back to, so it would have shown a GPU row reading zero. It now returns
  undefined and names `?gpuTiming=1`, which works on both backends.
- **The stone shader performance check was ported by changing what it reads.**
  TSL emits none of the marker strings the GLSL check greps for, so a literal
  port would have passed by matching nothing. The node check compiles both
  materials through `renderer.debug.getShaderAsync` and asserts against the real
  program: the coarse one runs no derivatives, samples no grain, and measures
  about 0.17 of the detail program on both backends.
- One verifier assertion was updated rather than worked around:
  `verify-session-lifecycle.mjs` pinned the timer's concrete class name, where
  its actual contract is that the handle is declared before the try block and so
  reachable from the catch. It now tests that.
- Inventory: **11 pending / 102 ported and comparison-gated / 6 exempt / 95
  development comparison locations**, from 22 pending at the start of the
  session. Everything still pending is `WorldApp`, `IslandApp`, the cloud shadow
  controller and debug panel, the environment controller and the portable debug
  info's own WebGL branch — G06's production wiring by definition.
- `npm run build` passes, as do the grass and stone harness gates on both
  profiles and both backends.

Acceptance items 1, 4 and 5 — production wiring, the G06 backend/fallback/
recovery/resize/BFCache matrix with matched performance measurements, and the
legacy route removal — remain open. T01-T16 remain unstarted.

### 2026-09-08 G06 production wiring, acceptance matrix and legacy removal

The remaining three acceptance items are closed. Both applications now default
to the node renderer, every world material is its portable counterpart, and the
legacy shader routes are gone from the shipped bundle.

**Production wiring (item 1).** `WorldApp` and `IslandApp` both run on a
`RendererSession` the bootstrap owns, because the bootstrap is what has to
replace it: `RendererRecovery` releases the scene, builds a fresh session on a
forced backend and reconstructs a playable world. Every material moved to its
node counterpart — grass blades, foliage cards, impostors, terrain, water
surface, bed and cascades, stones, horizon, sky and the actors. The
scene-walking `WorldCloudShadowSceneIntegrator` is gone by design: a node
material receives the cloud shadow field when it is constructed, through one
`WorldNodeMaterialContext` built in the environment controller, so a material
built later cannot miss the injection and none can be patched twice.

**Three real defects that only WebGPU exposes.** None were visible on WebGL 2,
and none were reachable before the world actually ran on a node backend:

- **Terrain could not create a pipeline at all.** Eleven vertex attributes meant
  eleven vertex buffers; WebGPU allows eight. Interleaving them into one buffer
  fixed it without renaming an attribute or touching either shader, so the
  comparison stayed a comparison of shading.
- **Every instanced draw carried an infinite instance count.** Three defaults
  `InstancedBufferGeometry.instanceCount` to `Infinity` and the WebGL renderer
  never reads it — it derives the count from the instanced attributes. The node
  renderer passes it to the draw call, which rejects it and loses the frame.
- **Grass blades hit the same buffer limit at twelve.** `prepareGrassNodeGeometry`
  had been written during G04 for exactly this and was never called from the
  production factories. Packing the blade fields on the shared source geometry
  and the instance fields per geometry brings a blade to six buffers.

**Acceptance matrix (item 4).** `check-renderer-matrix.mjs` measures the running
application rather than an isolated fixture: both scenes x both profiles x both
backends, resize, the BFCache persisted-pagehide path, teardown, a forced
WebGPU request on a device whose adapter acquisition fails, and automatic
selection falling back to WebGL 2. **13/13 pass.** Each case gets its own
browser — repeatedly dropping WebGPU contexts inside one browser loses the
renderer process mid-measurement and reports as a destroyed execution context,
which says nothing about the application.

Warmed frame time, headless Chrome, medians over a six-second window:

| case | backend | median | p95 |
| --- | --- | --- | --- |
| world desktop | WebGPU | 7.00 ms | 13.90 ms |
| world desktop | WebGL 2 | 20.80 ms | 34.70 ms |
| world compact | WebGPU | 6.90 ms | 10.30 ms |
| world compact | WebGL 2 | 7.00 ms | 13.90 ms |
| island (both profiles) | either | 6.90 ms | 7.00 ms |

The desktop world is the only case not sitting on the frame cap, and there
WebGPU is roughly three times faster at the median and holds a materially better
p95. The island and the compact world are cap-bound, so those rows say the
backends both keep up rather than that they are equal.

**Legacy removal (item 5).** Each shipped GLSL route moved into a module only
`src/dev` and the verifiers import — `GrassNearLegacyMaterial`,
`WaterSurfaceLegacyMaterial`, `WaterBedLegacyMaterial`,
`WaterCascadeLegacyMaterial`, plus the foliage and impostor factories. The
shader text stays executable, so the comparisons still measure the port against
real code rather than a quotation, and it stays out of the bundle:
`verify-built-site.mjs` now fails if a legacy GLSL function, varying or chunk
name appears in any chunk. Uniform names are deliberately not used as markers —
both implementations read one shared uniform table, so a uniform name proves
nothing about which shading path shipped. The `WorldApp` chunk fell from
645.92 kB to 559.51 kB (gzip 190.80 to 171.49).

**Verification.** All 14 harness fixtures pass on both backends; the 13 matrix
checks pass; `npm run build` passes with every verifier. About twenty verifier
assertions were updated rather than deleted: each kept the property it was
testing — blend state, depth behaviour, single-pass drawing, the dielectric
BRDF, rollback ordering, allocation and frame ownership — and changed only where
that property now lives. Where an assertion pinned a class name that the
migration deliberately changed, it now tests the shape of the contract instead.

**Inventory: 0 pending.** 98 ported and comparison-gated, 94 development
comparison locations, 7 exempt, and 4 shipped-GLSL modules kept as comparison
references and listed as finished rather than outstanding.

Two items remain before the G tickets are closed, both bookkeeping: recording
the stabilized revisions in both repositories, and measuring the pre-migration
`WebGLRenderer` baseline from the archived revision, since this tree no longer
contains that route. T01-T16 remain unstarted.

### 2026-09-08 T01–T03 checkpoint

T01 and T02 landed earlier on `main` (merge `3aab6c1` and follow-up wind/weather wiring). T03's remaining source-gate and architecture cleanup is `ff001d39fe64`. Full `npm run build` passes, including `verify-weather-presets.mjs`. No deployment.

**T01.** Experience configuration, catalogs, versioned settings, view-state save/restore, optional-owner slots and split frame fault domains are in production. Development-only attachments stay in `WorldDevelopmentHooks`. The architecture cap on `WorldApp` (730 lines) still holds after T03 extracted the `?accentAtlas=1` debug attach into those hooks.

**T02.** Shared cinematic wind is no longer opt-in: `DEFAULT_WIND_MODEL` is `cinematic`. The original merge left it behind `?windModel=cinematic` until cost was explained; later measurement and T03 LOD wiring made the shared field the production path. Legacy remains selectable. Numerical gates: source-model agreement over 960 samples, shared lattice, bounded field, phase-preserving speed changes. Far cards read the same baked gust and rest bend as near/mid blades.

**T03 implementation.** Atomic `setPreset` commits lighting, palette, clouds, wind publication (bake invalidate without advancing phase) and staged PMREM. Context restore reapplies the selected preset. Ordinary wind-bake failures keep the last valid texture. Non-Drusniel URL presets skip an initial clear-sky frame; `drusniel` keeps its eased startup.

**T03 browser/dev-hook visual pass.** Desktop world, `?diagnostics=1&view=aerial`, hook `window.__drusnielWeather`. Camera held at spawn focus `608 / 52 / 428` except for a later idle fly drift on one URL reload. Grass logical count stayed `22.18M` / `23,591` patches on every cut.

| Preset | Hook id | Observed identity |
| --- | --- | --- |
| Drusniel | `drusniel` | Cool daylight baseline, pale sky, green meadow. |
| Highfield | `sunny` | Warmer, brighter, more golden grass. |
| Emberfall | `goldenHour` | Amber/low-sun grade, brown-gold meadow. |
| Greyrain | `rainy` | Immediate teal fog, short visibility, muted grass. |
| Galewind | `windy` | Bright again after rain; not a leftover overcast cut. |
| Stillmeadow | `calm` | Soft, desaturated, gentler than Highfield. |
| Lowsway | `bowed` | Muted overcast grade. Static lean was not judged at blade scale from 50 m AGL. |
| Moonrise | `moonlight` | Stylized night, blue key; water did not stay daytime-bright. |

Also checked:

- Invalid id `not-a-weather` returned `false` and left the current preset.
- A→B→A: `moonlight` → `rainy` cut to teal fog with no leftover night; restoring `moonlight` returned the night grade.
- `?weather=moonlight` revealed as night, not a clear-sky first look.
- Terrain residency stayed 169 chunks; spawn focus did not jump when switching presets.

`?diagnostics=1` also opens grass-art and foliage tuners. Those "Muted Meadow" controls are art direction, not T03 weather.

### 2026-09-09 T04 runtime acceptance

Head `28dc0bf`. Full `npm run build` exit 0 after three verifier regex updates for compacted `WorldApp` / bootstrap / navigation source. No deployment.

**Start and Settings.** Ordinary WebGPU Start used the 2.8 s degraded copy and released the gate on **Enter the world**. Forced `?renderer=webgl` bound `webgl2`. Compact 390×844 hid Settings until Start, kept **M** inert during the gate, then inset the panel; control rows met 44 px height. Escape closed Settings from select, range and checkbox focus. Settings disabled **M** and closed an open map; HUD minimize closed Settings. Capture (`?capture=1`) and QA (`?qa=t04`) skipped the click and left `soundEnabled: true`.

**Weather / iris.** Settings Moonrise → Greyrain → Moonrise closed the iris (radius ~0) on each cut and restored night. Reduced-motion emulation kept the iris radius at 120 vmax.

**Automation.** `test:renderer-matrix` 13/13 and `test:production-renderers` 8/8 screenshots are the world, not the Start card. `test:wind-cost` converged on both backends with capture bypass. `test:bootstrap-recovery` passed the mocked loss/cancel cases.

T05 is not started. Deployment is not requested.
