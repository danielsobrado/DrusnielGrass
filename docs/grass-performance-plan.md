# Grass performance plan

## Implementation status (2026-08-06)

| Item | Status | Verification |
| --- | --- | --- |
| PERF-0 | Implemented | HUD exposes submitted mid vertices, submitted far instances, renderer calls/triangles, and quality tier state. Target-hardware traces remain a release profiling task. |
| PERF-1 | Implemented | Mid blades are descending-dither sorted and each batch uses a conservative `drawRange`; performance gate asserts the invariant. |
| PERF-2 | Implemented | Mid density falloff, CPU trim parity, sub-pixel width compensation, and viewport forwarding are active. |
| PERF-3 | Implemented (option A) | The secondary card dissolves through the mid crossfade; the primary card owns full coverage past it. |
| PERF-4 | Implemented | 64 px frames, 8 px padding, mipmaps, anisotropy, and distance-compensated alpha cutoff are active. |
| PERF-5 | Implemented | 0.75-tile eviction hysteresis and a 12-entry placement LRU are active. |
| PERF-6 | Implemented | One world wind clock drives near/mid/far; the root transform and shared lighting mix are applied. |
| PERF-7 | Deferred | Optional compressed transforms remain gated on a mobile vertex-fetch trace, as specified. |
| PERF-8 | Implemented | Far instances are merged into one mesh per streamed chunk with chunk bounds, fade, culling, and disposal. |
| PERF-9 | Implemented | Four monotone tiers, hysteretic governor, ramps, `?tier=` override, CPU prefix trimming, and HUD state are active. |

Automated status: `npm run build` passes the continuity, color-parity, performance, TypeScript,
and Vite gates. A headless WebGL (SwiftShader) pass of `zelda-field` at pinned tier 0 reports no
shader or runtime errors and renders the field coherently.

First measured numbers, from that pass standing in dense grass at stream radius 5 (SwiftShader,
so treat the *counts* as real and the frame time as meaningless):

- **submitted mid vertices 1.16 M**, against the 3.5–5.5 M the untrimmed mid layer was
  estimated at, and inside the 0.9–1.3 M this plan predicted for post-PERF-1/2.
- **192 total draw calls** with 960 far cards resident — the far band alone would previously
  have been 150–480 of them.

Real before/after frame times still need representative desktop and compact hardware; the
counters to capture them are in the HUD (`Grass submit …` line).

Two deviations from the plan as written, both deliberate:

- **PERF-9 does not fold `uGrassArtDensityScale` into the CPU trims** the way item 2 of that
  section specifies. It cannot: that uniform gates on `grassFieldDither`, a different hash from
  the `grassDither` the instance buffers are sorted by, so folding it in would drop blades the
  shader keeps. The governor instead owns a new `uGrassLodDensityScale` that multiplies the LOD
  keep threshold — the sorted key itself — which both trims reproduce exactly, so a tier drop
  is still a near-linear *submitted*-vertex saving as intended.
- **PERF-9's near-distance reduction applies only at tier 3.** Shrinking the near band changes
  the tile visibility radius, which forces a reconcile and a fresh build wave — the last thing
  a frame already missing its budget needs. It is kept for the bottom tier, where the rebuild
  cost is worth paying once.

Ordered by measured leverage. Each item lists exact files, edits, expected effect, and how to
verify. Findings referenced from [grass-code-review.md](grass-code-review.md). Keep every phase
its own commit; run `npm run build` (which runs all three verify gates) plus the visual check
workflow (headless Edge + vite dev server) after each.

Context for sizing: this grass will live inside a bigger streamed world with multiple biomes
([grass-biome-architecture.md](grass-biome-architecture.md)). Every item below is therefore
judged on how it *scales* — with stream radius, with biome count, with competing streaming
systems — not just on today's demo scene. The budget model below is the yardstick; biome
readiness is called out per item where it matters. Biome v1 adds zero draw calls and zero
per-frame cost by design, so this plan and the biome plan compose without trade-offs.

Baseline numbers to capture first (PERF-0), so every later claim is measured, not guessed:

- Add two lines to `WorldGrassDiagnostics` (`src/world/WorldGrassSystem.ts:113-129`):
  `submittedMidVertices` (sum over visible `midMesh` of `instanceCount × midBladesPerPatch × 3`)
  and `submittedFarInstances`. Surface them in the existing diagnostics HUD.
- Record `renderer.info.render.triangles` and `.calls` in the same HUD.
- Capture one desktop and one compact-profile trace standing in dense grass, one while walking,
  one from the fly camera at 40 m. These are the before/after fixtures for every phase.

---

## World-scale budget model

Costs as functions of the tunables, evaluated at today's desktop defaults
(`density = 72/m²`, near 24 m + 10 transition, mid 54 + 10, far 280, `chunkSize 64`,
`grassRadiusDesktop 5`, 32 m batches, 2 cards/patch). Use these formulas when the bigger world
changes any input; they are also the sanity check for every PERF item's claimed win.

**Vertex invocations / frame (before this plan):**

| Layer | Formula | Today |
| --- | --- | --- |
| Near (trimmed) | `3 × density × Σ_tiles keptPrefix(dist)` ≈ `3 × density × π × (near² + ½((near+2t)² − near²))` | ≈ 0.45 M |
| Ultra + detail | `3–9 × 2 × density × π × ultra²` | ≈ 0.09 M |
| Mid (untrimmed) | `3 456 × 64 × visibleBatches` (all blades, kept or collapsed) | ≈ 3.5–5.5 M |
| Far cards | `6 × 2 × patchesInBand` ≈ `12 × π(far² − mid²)/16` | ≈ 0.35 M |

Mid dominates at ~85 % — hence PERF-1/2 first. After PERF-1/2 the mid term becomes
`3 × keptBlades ≈ 3 × density × falloffAvg × π(mid² − near²)` ≈ 0.9–1.3 M, and the *system total*
drops ≈ 2.5–4×. Nothing else on this list matters until that lands.

**Draw calls / frame (steady state, camera at ground level):** near tiles ≈ 63 + 14 + 7, mid
batches ≈ 10–25, far batches ≈ 150–480 (frustum-dependent; all 484 resident batches sit in the
44–290 m far band). **The far band owns ~75 % of grass draw calls**, ≈ 1.5–3 ms of render-loop
CPU at radius 5 — and it grows quadratically with stream radius. That is finding R12 and
PERF-8's job. Post-PERF-8: far draws ≈ 40–121 (per chunk), total grass draws ≈ 150–220.

**Memory (GPU + mirrored build buffers):** near placements ≈ 24 MB (base) + 2.7 MB (ultra;
detail shares base buffers); mid instances ≈ 2.6 MB; far instances ≈ 5.2 MB; atlas ≈ 1.2 MB
per shape family after PERF-4. Scaling: near memory ∝ (near radius)², far instances ∝ (stream
radius)². PERF-7 halves the two placement terms. Budget line for the bigger world: **≤ 48 MB
grass total at radius 5, ≤ 8 MB additional per extra stream-radius step** — check against these
formulas in review whenever a radius or density constant moves.

**Build-time CPU:** one near tile ≈ 4 608 blades × (height + suitability + biome + macro
samples); the biome sample (B2) adds ≈ 5 %. All build work is already deadline-sliced; the
bigger-world requirement is only that `buildDeadline` comes from one **shared frame-budget
arbiter** across terrain, grass, and future prop streaming — `WorldGrassSystem.update` already
accepts the deadline parameter, so the arbiter is an app-level change, not a grass change.
Reserve: grass may consume at most 3 ms of any frame's build budget when other streamers are
active (today it can take 4–6 ms via `CENTER_BUILD_BUDGET_MS`; make the arbiter, not grass,
own that number).

---

## PERF-1 — Prefix-trimmable mid layer (fixes R1, biggest win)

**Problem.** Mid batches submit all 1 152 blades × 64 instances (~221 k verts) whenever any part
of the batch is past the 14 m near-fade start; blades the shader collapses still cost full vertex
work. ~3.5–5.5 M verts/frame.

**Key fact.** The mid keep test (`GrassNearMaterial.ts:111-115`, world path) keeps a blade when
`dither > nearCoverage && dither > farEntry`, i.e. the survivors are a **suffix** of the blades
ordered by ascending dither — equivalently a **prefix in descending dither order**. `nearCoverage`
and `farEntry` are monotone in camera distance, so a per-batch bound computed at the batch's
closest/farthest points is conservative for every blade in it.

**Edits.**

1. `src/world/grass/WorldGrassPatchGeometryFactory.ts`
   - In `createLodVariants` (`:67-85`), before building the mid geometry, sort the blade specs by
     **descending shader dither**, not by `lodRank`. Reproduce the shader's dither exactly the way
     the near path already does (`WorldSingleBladeTileFactory.ts:171-173` documents the pattern):
     `dither(spec) = fract(spec.shade * 0.754877666 + spec.phase * 0.569840296 + I + seed)` —
     note the per-*instance* term `instanceVariation.x` and `uGrassDitherSeed` are unknown at
     geometry build time, so the geometry-side dither must drop them. To make that valid, remove
     the instance term from the **mid material's** dither instead: in `GrassNearMaterial`, add an
     option `instanceFreeDither: boolean` that compiles `grassDither` without
     `instanceVariation.x` (keep `uGrassDitherSeed`); set it only for the mid material created at
     `WorldGrassSystem.ts:174-184`. Per-blade shade/phase already decorrelate neighbours; the
     instance term only decorrelated *patches*, which the patch-level dither seed constant
     already does.
   - Export alongside each mid geometry a `Float32Array sortedDescendingDithers` (one per blade,
     matching triangle order) on the returned variants object.
2. `src/grass/GrassGeometryFactory.ts` — no change; `InstancedBufferGeometry` shares the source
   index, and `drawRange` applies to it.
3. `src/world/WorldGrassSystem.ts`
   - Store `midSortedDithers` next to `midGeometries` at init (`:376-379`).
   - **Do not** set `drawRange` on the shared source geometry — each batch owns its
     `InstancedBufferGeometry` wrapper (`createMesh`, `:1161-1200`), so set it per mesh.
4. `src/grass/GrassLodController.ts`
   - In `updateThreeStagePatch` (`:58-106`), when `midMesh.visible` is true, compute:
     `maxKeepCoverage = 1 - min(nearCoverage(farthestDistance), 0)`… concretely:
     - `nearCovAtFarthest = resolveNearCoverage(farthestDistance)` (smallest nearCoverage in the
       batch → largest keep),
     - `farEntryAtNearest = resolveFarEntry(patch.distance)` (smallest farEntry in the batch),
     - shader keeps `dither > max(nearCovAtFarthest, farEntryAtNearest)`; call it `cut`.
     Binary-search the patch's `sortedDescendingDithers` for the first entry `<= cut + 1/1024`
     (reuse the `upperBound` + `DITHER_SAFETY_MARGIN` pattern from
     `WorldSingleBladeTileField.ts:53,64-76`, inverted for descending order) → `keptBlades`.
     Set `midMesh.geometry.setDrawRange(0, keptBlades * 3)` (3 indices per blade).
   - The controller needs access to the dither array: add it to `GrassPatch` when the patch is
     created (`WorldGrassSystem.createRenderPatch`).
   - Reset `drawRange` to full when a batch's `cut` is 0.
5. Gates: `verify-grass-performance.mjs` asserts mid geometry retains the full source set
   (`:320`) — still true; add a new assertion that the controller calls `setDrawRange` (mirror
   the style of the existing source-pattern asserts) so the trim cannot silently regress.

**Effect.** The batch under the camera drops from ~221 k to near-0 submitted mid verts; batches
straddling the near fade submit only their fading suffix. Expect **–40…–60 % total vertex
invocations** in the standing-in-grass fixture.

**Verify.** `submittedMidVertices` before/after at the three fixtures; `npm run test:lod` and
`test:lod-color` unchanged; walk the near→mid boundary at 14–34 m watching for popping (there
must be none — the trim is strictly conservative; if any appears, the dither reproduction is
wrong, not the idea).

## PERF-2 — Distance density falloff with width compensation (rest of R1)

At 40–64 m a 1-triangle blade is 1–2 px wide; drawing all 72/m² is invisible density. Ghost of
Tsushima / Horizon thin with distance and widen survivors; the sub-pixel machinery for this
already exists (`VERTEX_SUBPIXEL_WIDTH`, `GrassNearMaterial.ts:319-334`).

**Edits (all in `src/grass/materials/GrassNearMaterial.ts`, mid material only).**

1. New uniforms `uGrassDensityFalloffStart` (default 30), `uGrassDensityFalloffEnd` (default 64),
   `uGrassDensityFloor` (default 0.35, fraction kept at the end distance).
2. In `VERTEX_KEEP_WORLD_LOD` for the inverted (mid) path, raise the cut:
   ```glsl
   float grassFalloff = mix(1.0, uGrassDensityFloor,
     smoothstep(uGrassDensityFalloffStart, uGrassDensityFalloffEnd, grassCameraDistance));
   // keep when dither > 1 - falloff * (1 - max(nearCoverage, farEntry))  — still a suffix
   ```
   Formulate the final threshold so the keep set stays `dither > threshold(distance)`; then the
   PERF-1 drawRange bound just uses the same formula at the batch's extreme points.
3. Compensate coverage: enable `subPixelWidth` for the mid material
   (`WorldGrassSystem.ts:174-184`) and extend the widen target with
   `1/sqrt(grassFalloff)` so surviving blades gain the area the dropped ones surrendered, with
   the existing canopy-color payback keeping average brightness flat (that is the mechanism
   `verify-lod-color-parity` relies on — this is why the falloff must go through the same
   coverage-payback path, not a plain thinning). The mid material's `setBladeHalfWidth` must then
   be called with the patch blade mean half-width (`(bladeWidthMin+bladeWidthMax)*0.25`), same as
   `WorldNearGrassField.ts:273-276` does for the base layer, and
   `WorldGrassSystem.setViewportPixelScale` must forward to the mid material too.
4. Expose `densityFloor`/falloff distances per art preset later if art wants (optional field,
   default in code).

**Effect.** Another **–30…–50 % of the remaining mid vertex load**, and (because widened blades
replace several thin ones) measurably less quad overdraw at grazing angles.

**Verify.** LOD color parity gate (it samples exactly this band); A/B screenshots at 35/50/64 m;
`submittedMidVertices`.

## PERF-3 — Far impostor card cost (fixes R2)

Pick **option A** unless the A/B clearly loses:

- **A. One card per patch past the crossfade.** Keep `grassFarImpostorsPerPatch: 2` only for the
  44–64 m crossfade band. Implementation: in `createFarImpostorInstances`
  (`WorldGrassSystem.ts:1095-1159`) write cards interleaved `[patch0-card0, patch0-card1, …]` —
  already true — and give card 1 of each patch coverage that fades to 0 past
  `midMaxDistance + transition` in the impostor vertex shader: add uniform `uSecondCardFadeEnd`,
  multiply `vFieldCoverage` by `step`/`smoothstep` keyed on `instanceVariation` marking card
  index. Cheaper and simpler: add a per-instance `cardIndex` in the free `.y` slot of the
  existing variation write (`:1137-1147`) — it currently duplicates the source `.y`; far cards
  never read `.y` (check `WorldGrassImpostorMaterial` — only `.x/.z/.w` are consumed, so `.y` is
  free for this).
  Then give card 0 full `coverage` (not `coverage/2`) beyond the fade and let card 1 carry the
  other half only inside the crossfade. Past 64 m the far field becomes single full-coverage
  cards → **no steady-state dither discard at all**, half the far vertex/raster load.
- **B. (fallback) Keep 2 cards but set `grassFarImpostorsPerPatch: 1` in `public/config/world.yaml`**
  and bump `GRASS_IMPOSTOR_FOOTPRINT_SCALE` 1.12 → 1.22 (`src/grass/GrassLodTuning.ts`) to
  restore silhouette fill. One-line experiment; try it first to size the win before building A.

**Verify.** `submittedFarInstances`; horizon screenshot diff for density; check the 44–64 m
crossfade for popping (card 1's fade must use the same transition width as `vFarEntry`).

## PERF-4 — Atlas mips back on (fixes R3, mostly a quality fix that also helps texture cache)

In `public/config/grass.yaml`: `impostorFrameResolution: 44 → 64`, `impostorPadding: 3 → 8`
(atlas 300 → 480 px, still trivial). In `WorldGrassImpostorMaterial` constructor (`:355-358`)
delete the three override lines so the factory's
`LinearMipmapLinearFilter` + `generateMipmaps = true` (`WorldGrassImpostorAtlasFactory.ts:110-117`)
stand. Because the atlas is premultiplied, mip levels darken coverage correctly, but the
`uAlphaCutoff 0.16` test erodes silhouettes at high mip levels — compensate by scaling the cutoff
with distance: `float cutoff = uAlphaCutoff * mix(1.0, 0.55, smoothstep(uMidDistance, uFarDistance, cameraDistance));`
(vertex-computed distance already exists as a varying candidate — pass `cameraDistance` out in a
free varying component, e.g. pack into `vLocalViewDirection` w by making it a `vec4`).
8 px padding supports ~3 safe mip levels before frame bleed; clamp with
`texture.anisotropy = min(4, renderer.capabilities.getMaxAnisotropy())`.

**Verify.** Slow orbit at 150 m: shimmer gone; parity gates unchanged (atlas is semantic, palette
untouched).

## PERF-5 — Near tile churn (fixes R6)

1. Eviction hysteresis: in `WorldSingleBladeTileField.reconcile` (`:295-345`) keep tiles until
   `distance > visibilityRadius + tileSize * 0.75` while continuing to *request* only inside
   `visibilityRadius`. Two constants, no allocation change. Kills rebuild thrash while strafing a
   boundary.
2. Placement LRU: in `WorldSingleBladeTileFactory.disposeTile` (`:893-908`), when refcount hits 0
   move the placement into a `Map`-based LRU (capacity **12**, ~5 MB at desktop density:
   4 608 blades × (64+16+4) B ≈ 0.4 MB each) instead of deleting; `beginBuild` already checks
   `placementCache` first — have it also probe the LRU and promote. Release GPU buffers only on
   LRU eviction (`disposeInstancedMesh(mesh, keepShared=true)` path already exists for shared
   placements).

**Verify.** Walk a 20 m circle across tile boundaries; `nearTileBuildMs` in diagnostics should
drop to ~0 on the second lap.

## PERF-6 — Small fixes, one commit

a. **Single wind clock (R4).** Delete `WorldNearGrassField`'s `WindField` (`:62,115`); change
   `WorldNearGrassField.update` signature to accept `elapsedSeconds` and pass it from
   `WorldGrassSystem.update` (`:251-263`). Update the three material `.update()` calls. Also move
   the `material.update` calls *above* the `nearFieldsEnabled` early-return so time never freezes.
b. **Root transform micro-fix (R7).** `GrassNearMaterial.ts:164` →
   `vec4 grassWorldRoot = modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);`
c. **Shared lighting constant (R8).** Export `GRASS_LIGHT_MIX = 0.38` from
   `GrassPaletteShader.ts`, template it into both shaders, and read it in
   `verify-lod-color-parity.mjs` from the same file.

## PERF-7 — Compressed instance transforms (optional, mobile-focused, do last)

Replace the mat4 `instanceMatrix` on single-blade layers with two vec4 attributes:
`iPosScale = (x, y, z, uniformXZScale)` and `iOrient = (yawSin, yawCos, scaleY, tiltPacked)`
(terrain tilt packed as two 8-bit snorm components; blades tilt < 25°). Reconstruct in
`begin_vertex`. Wins: instance fetch 80 B → 32 B per vertex, tile CPU buffers –60 %
(radix reorder moves 8 floats not 16), GPU memory ~25 MB → ~10 MB for the base field.
Cost: `GrassNearMaterial` must bypass three's `#include <project_vertex>` instancing
(override `USE_INSTANCING` by *not* using `InstancedMesh` — switch tiles to `Mesh` +
`InstancedBufferGeometry` with `instanceCount`, which three renders instanced without the
`instanceMatrix` plumbing), and the trail/wind code paths that read `grassInstanceBasis`
(`GrassNearMaterial.ts:224-227, 262-265, 381-384`) must be rewritten against the reconstructed
basis (they become cheaper: scales are now literals from attributes, no `length()` calls).
Only attempt after PERF-1/2 land and only if a mobile trace still shows vertex-fetch bound.
**Biome synergy:** the packed encoding reserves one component for `instanceBiome`
(see biome doc §4.2), removing that attribute's 4 B/instance again — design the packing with
that slot from the start even though B1 ships it as a separate attribute first.

## PERF-8 — Far draw-call consolidation (fixes R12; the world-scale item)

**Problem.** Far cards inherit the mid layer's 32 m batch granularity: 484 resident batches at
radius 5, essentially all inside the 44–290 m far band, ≈ 150–480 instanced draws per frame just
for cards a few pixels tall. Grows quadratically with stream radius — at the bigger world's
radius 7 it would be ~950 resident far meshes. Fine culling granularity buys nothing out there:
a 64 m chunk is angularly small at 100 m+.

**Edits.**

1. `src/world/WorldGrassSystem.ts` — build far instances **per chunk, not per batch**:
   in `advancePatchFinalize`/`createRenderPatch` (`:908-1057`), keep mid meshes per batch
   exactly as now, but accumulate the four batches' far instance arrays and emit **one**
   `farMesh` per chunk (origin at chunk center, bounds = union of batch bounds + impostor
   padding). `WorldGrassPatch.farMesh` moves to the chunk record (`WorldGrassChunk`), with
   per-patch `farCoverage` diagnostics summed at chunk level.
2. `src/grass/GrassLodController.ts` — accept the far mesh separately from patches: iterate
   chunks for far visibility (distance band + frustum against the chunk bound), patches for
   near/mid as today. The controller's per-entity work drops fourfold for the far ring.
3. `applyStreamCoverage` fade (`WorldGrassSystem.ts:136-147, 553-577`) — the chunk-level far
   mesh fades as one unit (it already streams as one chunk), so the fade loop touches 1 buffer
   instead of 4.
4. Leave near tiles and mid batches at their current granularity — they need it (depth sort,
   tight frustum culls at close range).

**Effect.** Far draws ÷ 4 (484 → 121 worst case, ~40–60 typical), ≈ 1–2 ms render-loop CPU at
radius 5, and the win *scales*: draw calls now grow with chunk count, not batch count. Also
shrinks `patches` set iteration and the retirement queue's work.

**Verify.** `renderer.info.render.calls` before/after at the three fixtures; orbit at 150 m for
any culling regression (chunk bounds are looser — expect a few more instances shaded, offset by
far fewer draws); `test:lod` unchanged.

**Biome readiness:** chunk-level far meshes carry `instanceBiome` like any instance data; with
v2 shape families the split becomes per `(chunk, family)`, which is exactly why family count is
capped at 3 in the biome doc.

## PERF-9 — Adaptive quality governor (ships the "very performant" guarantee)

Fixed budgets cannot hold 60 fps across the device spread a bigger world targets. Add a small
closed loop that trades the *least visible* quality first. All knobs below already exist and are
crossfade-safe (they move through the same dither/coverage machinery as LOD fades — no popping).

**Edits.**

1. New `src/runtime/GrassQualityGovernor.ts`: consumes the existing rolling-FPS diagnostic,
   2 s evaluation window, hysteresis (drop tier after 2 s under 90 % of target, raise after
   6 s over 105 %), four tiers:
   - T0 (full): everything at preset values.
   - T1: `uGrassArtDensityScale × 0.85`, PERF-2 `uGrassDensityFloor × 0.8`.
   - T2: + ultra-near density multiplier 2 → 1.5 (`grassUltraNearDensityMultiplier` is read at
     field construction — expose a runtime multiplier on `WorldNearGrassField` instead of
     rebuilding), sheen off on the base material.
   - T3 (compact-like): + near distance −20 % via `setArtDirection`'s existing LOD path,
     `blendViews` off on impostors.
2. Tighten the CPU trim to follow the governor: `updateInstanceCounts`
   (`WorldSingleBladeTileField.ts:233-262`) currently binary-searches with coverage only; fold
   the active density scale into the searched threshold
   (`upperBound(sortedDithers, coverage × densityScale + margin)`) so a lowered tier reduces
   *submitted* vertices, not just shaded ones. Same fold in PERF-1's per-batch `drawRange`
   bound. (Without this fold the governor only saves fragment work; with it, tier drops are
   near-linear vertex savings.)
3. Governor state into the diagnostics HUD (`tier`, seconds in tier) so QA fixtures can pin a
   tier explicitly (`?tier=0` query override for reproducible captures).

**Effect.** Worst-case frames degrade density ~15–40 % instead of dropping frames; all
transitions ride existing dither fades. **Not a license to skip PERF-1/2/8** — the governor is
the safety net, the static wins are the product.

**Verify.** Throttle GPU (chrome `--force-gpu-mem-available-mb` / DevTools perf emulation),
watch tier transitions for visible pops at each boundary; assert in
`verify-grass-performance.mjs` that tier scales only ever *lower* density (governor can never
exceed preset budgets).

## Sequencing and exit criteria

| Phase | Items | Exit criterion (desktop fixture) |
| --- | --- | --- |
| 0 | PERF-0 | Baselines + budget-model numbers recorded in this doc |
| 1 | PERF-1, PERF-6 | ≥ 40 % fewer submitted vertices, no visual diff beyond noise |
| 2 | PERF-2, PERF-3 | ≥ 60 % total vertex reduction vs baseline; crossfades clean in orbit test |
| 3 | PERF-8 | Grass draw calls ≤ 220 typical at radius 5; ≥ 1 ms render-loop CPU back |
| 4 | PERF-4, PERF-5 | No horizon shimmer; second-lap tile builds ≈ 0 ms |
| 5 | Biome B1–B2 ([biome doc](grass-biome-architecture.md) §8) | Two-biome world, zero draw-call delta, zero visual diff with single biome |
| 6 | PERF-9 | Tier transitions invisible in throttled capture; 60 fps held on target hardware |
| 7 | PERF-7 | Only if mobile profile still shows vertex-fetch bound |

Phase gates for the bigger world: after phase 3, re-evaluate the budget model at the intended
stream radius (7?) and biome count before green-lighting world-side scope; the formulas make
that a ten-minute exercise instead of a prototype.

Never merge a phase that moves `test:lod-color` deltas; the seamless-LOD guarantee is the
product, the frame time is the budget.
