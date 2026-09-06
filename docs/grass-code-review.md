# Grass generator — code review

Scope: the streamed world grass path (`src/world/WorldGrassSystem.ts`, `src/world/grass/*`,
`src/grass/materials/*`, `src/grass/GrassLodController.ts`, LOD/impostor tuning and presets).
Companion documents: [grass-performance-plan.md](grass-performance-plan.md) and
[grass-aaa-look-plan.md](grass-aaa-look-plan.md) carry the exact remediation steps; findings
below reference them as `PERF-n` / `LOOK-n`.

## Resolution status (2026-08-06)

Every finding except the two explicitly deferred items has been addressed; the architecture
table below describes the system **as reviewed**, not as it now stands (far cards are one mesh
per 64 m chunk, and the mid band is prefix-trimmed per batch).

| Finding | Status |
| --- | --- |
| R1 mid vertex waste | Fixed — descending-dither mid geometry + per-batch `drawRange`, plus distance density falloff. Measured 1.16 M submitted mid vertices against a 3.5–5.5 M baseline. |
| R2 far-card discard tax | Fixed — the second card dissolves through the crossfade and card 0 takes full coverage past it, so the steady-state far field is single, undithered cards. |
| R3 atlas mips disabled | Fixed — 64 px frames, 8 px padding, mips and anisotropy on, alpha cutoff compensated with distance. |
| R4 two wind clocks | Fixed — one `WindField` in `WorldGrassSystem` drives every layer, and material time updates now run before the altitude early-return. |
| R5 per-layer wind functions | Fixed — one scrolling noise field, shared scale/speed/direction, with cards shearing root-to-tip instead of translating. |
| R6 near tile churn | Fixed — 0.75-tile eviction hysteresis and a 12-entry placement LRU that retains the sampled/sorted CPU arrays. |
| R7 hot-shader micro-costs | Partly fixed — the root transform is now a column read; the compressed instance encoding stays deferred with PERF-7. |
| R8 duplicated lighting constant | Fixed — `GRASS_LIGHT_MIX` is exported once and templated into both shaders; the gate reads it from that file. |
| R9 legacy island path | Unchanged, as planned — the threshold-LOD path was deliberately not touched. |
| R10 small per-frame allocations | Unchanged — still below the noise floor. |
| R11 gates constrain the solution space | Held — both trims are runtime, so the density and full-blade-set assertions still pass as written. |
| R12 far draw-call granularity | Fixed — one far mesh per chunk; 192 total grass draws measured at stream radius 5. |

Two defects were found in the *plans* while implementing them, and are recorded where they
belong: the impostor shear bound arithmetic (see the look plan's LOOK-4.4 correction) and the
claim that sparse biomes are automatically vertex-cheap (see the biome doc, §4.3).

## Second-pass review findings (2026-08-06)

A deeper review of the implementation itself, after the gates were green. These are new
findings against the *new* code, not against the system as originally reviewed.

### N1 (H) — The sub-pixel width clamp was silently disabled

`MAXIMUM_BLADE_WIDEN_METRES` was a bare `0.02` with nothing tying it to the blade. LOOK-5
widened the blades to 0.026/0.058, which puts the source half-width at 0.021 — *above* the
ceiling. `max(source, min(target, ceiling))` then collapses to `source`, so `grassCoverage`
was pinned at exactly 1 and the clamp did nothing at all. That cost two things at once:

- the anti-sparkle widening the near band relies on at low resolutions (at 720p a blade needs
  0.031 at 34 m and got 0.021), and
- **PERF-2's entire coverage payback**: the mid layer was dropping up to 65 % of its blades at
  30–64 m with nothing given back, which is the exact "field goes bald with distance" failure
  the widening exists to prevent.

No gate could see it, because every gate checks the *inputs* rather than the resolved ceiling.
Fixed by deriving the ceiling from the configured half-width (`half × 3`, absolute backstop
0.06 so the widen delta always stays inside the 0.08 bounds safety margin), plus a new
performance-gate assertion that fails when the resolved ceiling drops to or below the source
half-width. That assertion was negative-tested: it fails on the old value and passes on the new.

### N2 (M) — Unclamped biome row indexed a uniform array

Both shaders did `int(biome + 0.5)` and indexed `uBiomeBase[row]` with it. Out-of-range indexing
of a uniform array is undefined behaviour in GLSL ES 3.0. The data is in range today, so this
was latent, but a future profile-count mismatch would have become a driver-dependent failure
instead of a wrong colour. Both shaders now clamp, and the row is a `flat` varying — it is
constant per instance, so interpolating it was both wasted work and a source of the fractional
drift the clamp guards against.

### N3 (M) — Placement LRU leaked GPU buffers

The first implementation preserved shared instance data on *every* tile disposal, so nothing
ever released an evicted placement's attribute buffers (three only frees them from
`WebGLGeometries.onGeometryDispose`; `BufferAttribute.dispose()` is a WebGPU-only no-op here).
The LRU now retains only the expensive half — the sampled, sorted CPU arrays — and rebuilds
four attribute objects on revival, which still skips the resample and radix sort that made the
LRU worth having.

### N4 (L) — Biome sampled before the placement early-outs

`sampleGrassBiome` ran for every *enumerated* near-tile blade, ahead of the suitability and
path masks that reject most of them on broken ground. It now runs only for blades that survive
placement, and the performance gate pins that ordering.

### N5 (L) — Constants that must not drift were duplicated again

The gust tip boost, the wind-noise scale/speed, and the sine-fallback gust constants were each
written as literals in both the blade and card shaders — the same R8 pattern this review already
flagged once. All three are now single exported constants, and `verify-lod-continuity` asserts
both shaders reference the shared symbol and apply the tip lift with the same formula.

### N6 (L) — Dead state and a redundant per-frame sweep

`fadingPatches` survived the move to chunk-level fading; the submission counters re-walked every
patch after the LOD pass had already visited them; two biome helpers and the wind texture's
disposal were unreferenced. The counters now accumulate inside the passes that already run, the
dead members are gone, and the shared wind texture is released on teardown so a context-loss
restart does not strand it.

## Architecture (as built)

| Band (lush-hero) | Representation | Source |
| --- | --- | --- |
| 0–5 m | 2× density segmented blades (ultra-near + base-detail fields) | `WorldNearGrassField.ts:332-393` |
| 0–34 m | Base field: 1-triangle instanced blades, 8 m tiles, dither-prefix trimmed | `WorldSingleBladeTileField.ts` |
| 14–64 m | Mid: instanced 4 m patch geometry (1 152 blades/patch), 64 per 32 m batch | `WorldGrassSystem.ts:999-1009` |
| 44–290 m | Hemi-octahedral impostor cards, 2 per patch | `WorldGrassSystem.ts:1095-1159` |

All layers resolve one shared palette (`GrassPaletteShader.ts`) and one macro-variation field
(`GrassFieldVariation.ts`), guarded by `verify-lod-color-parity.mjs` / `verify-lod-continuity.mjs`
/ `verify-grass-performance.mjs` as build gates.

## Strengths (keep these; the gates assert several of them)

- Vertex-stage LOD rejection with zero-area collapse instead of fragment `discard`
  (`GrassNearMaterial.ts:207-215`) keeps the near/mid layers early-Z friendly. Asserted by
  `verify-grass-performance.mjs:394-396`.
- Per-instance coverage instead of per-mesh uniforms sidesteps three's shared-material uniform
  collapse (the r159 pitfall) everywhere it used to bite (`GrassNearMaterial.ts:199-205`,
  `WorldGrassImpostorMaterial.ts:108-112`).
- Dither-sorted instance buffers + `mesh.count` prefix truncation
  (`WorldSingleBladeTileField.ts:233-262`, radix sort in `WorldSingleBladeTileFactory.ts:541-705`)
  means the near band never submits blades the shader would drop. This is the pattern the mid
  layer is missing (finding R1).
- Budget-sliced incremental builds everywhere (lattice → sampling → sort → reorder → mesh), with
  placement sharing between the base and base-detail fields (`WorldSingleBladeTileFactory.ts:248-283`).
- Terrain-height lattice caching (~18 000 samples → a few hundred per tile,
  `WorldSingleBladeTileFactory.ts:294-309`).
- Color parity across representations is engineered, not hoped for: semantic impostor atlas
  (progress/shade/dryness, not baked RGB) recolored by the same palette GLSL.

## Findings

Severity: **H** = measurable frame cost or visible artifact, **M** = worth fixing, **L** = polish.

### R1 (H) — Mid layer pays full vertex cost for blades it collapses
`GrassLodController.ts:96-99` shows `midMesh.visible` whenever any corner of a batch is past the
near fade start (14 m), so the batch the camera stands in draws all 64 instances × 3 456 verts
(~221 k verts) mostly to `transformed = vec3(0.0)`. With ~16–25 batches in range this is
**~3.5–5.5 M vertex invocations/frame for the mid layer alone**, ~10× the near band's trimmed
draw, and it is the dominant GPU cost of the scene. The keep set (`dither > nearCoverage && dither > farEntry`,
`GrassNearMaterial.ts:111-115`) is a *suffix* in dither order, so today nothing can be trimmed.
Fix: sort patch-geometry blades by descending dither and trim per batch with `drawRange`
(→ PERF-1), then add distance density falloff with width compensation (→ PERF-2).

### R2 (H) — Far cards permanently discard ~50 % of their texels
`WorldGrassSystem.ts:1148-1149` gives each of the 2 cards per patch `coverage / cardsPerPatch`
(= 0.5 max), and `WorldGrassImpostorMaterial.ts:245-248` dithers `discard` against it. Every far
pixel therefore pays two overlapping half-dissolved cards — double vertex/raster work and a
permanent fine-grain checkerboard that fights early-Z, purely to buy crossfade parallax.
Fix options in PERF-3.

### R3 (M) — Impostor atlas mipmaps are built, then disabled
`WorldGrassImpostorAtlasFactory.ts:110-117` configures `LinearMipmapLinearFilter` +
`generateMipmaps = true`; `WorldGrassImpostorMaterial.ts:356-358` immediately overrides with
`generateMipmaps = false; minFilter = LinearFilter`. Cards at 100–290 m undersample a 44 px frame
→ shimmer/sparkle in motion at the horizon, visible as crawling noise in the BotW-style wide shot.
The two settings contradict each other; whichever is intended should be stated once. Fix: PERF-4
(padding + mips + alpha-mip compensation).

### R4 (M) — Two independent `WindField` clocks drift after near-field suspension
`WorldGrassSystem.ts:186` and `WorldNearGrassField.ts:62` each own a `WindField`. While the near
fields are suspended at altitude (`WorldNearGrassField.ts:103-113` returns before
`wind.update`), the near clock freezes while the mid/impostor clock keeps running. After landing,
near and mid blades gust with different phases through the whole dither crossfade — the "same"
blade bends two ways during the handoff. Fix: delete the near field's `WindField`, pass
`elapsedSeconds` down from `WorldGrassSystem.update` (PERF-6a).

### R5 (M) — Mid blades and far cards animate with unrelated wind functions
Near/mid gust: `sin(dot(xz, dir) / 0.08 + t·0.65 + phase)` modulated by a gust front at scale
0.085 / speed 0.55 (`GrassNearMaterial.ts:234-256`). Impostor: a single
`sin(dot(xz, dir) · 0.045 + t·0.7 + phase)` translating the whole card
(`WorldGrassImpostorMaterial.ts:73-79`). During the 44–64 m crossfade the two representations
sway against each other. Fix: share the gust-front constants via uniforms and shear the card top
instead of translating the center (LOOK-4).

### R6 (M) — Near tiles are rebuilt from scratch when re-entered
`WorldSingleBladeTileField.ts:332-340` disposes a tile the moment it leaves `visibilityRadius`,
and `WorldSingleBladeTileFactory.disposeTile` (`:893-908`) drops the placement when its refcount
hits zero. Walking back and forth across a tile boundary re-samples ~4 608 blades (height
lattice, suitability, radix sort) each crossing. Amortized by the build budget, but it shows up
as continuous background build load during normal traversal. Fix: eviction hysteresis ring +
small placement LRU (PERF-5).

### R7 (L) — Hot-shader micro-costs
- `GrassNearMaterial.ts:164`: `modelMatrix * instanceMatrix * vec4(0,0,0,1)` is a full mat4·mat4
  per vertex; `modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)` is identical and ~8× cheaper.
  Same pattern is fine in the impostor shader (it needs the full basis anyway).
- `mat3(instanceMatrix)` + three `length()` calls per vertex to recover scales
  (`GrassNearMaterial.ts:224-227`) — candidates for a compressed instance encoding that stores
  scales directly (PERF-7, larger change, also halves instance fetch bandwidth).

### R8 (L) — Duplicated lighting constant across two shaders
The stylization mix `mix(diffuseColor, lambertLight, 0.38)` appears in
`GrassNearMaterial.ts:540-541` and `WorldGrassImpostorMaterial.ts:330-331`. Color parity across
LODs depends on these staying byte-identical; today that is manual. Extract to a shared constant
module the way `GRASS_PALETTE_GLSL` already is (e.g. `GRASS_LIGHT_MIX` exported next to the
palette), and have `verify-lod-color-parity` read it from one place.

### R9 (L) — Legacy island path doubles the LOD surface
`GrassLodController.updateLegacyPatch` (`GrassLodController.ts:108-123`), threshold-LOD shader
branch (`VERTEX_KEEP_THRESHOLD_LOD`), and `src/grass/GrassSystem.ts` exist only for the island
regression scene. Every change to the material must reason about both paths. Not urgent, but the
plans below deliberately avoid touching the threshold path; consider isolating it behind its own
material subclass when it next causes friction.

### R10 (L) — Small per-frame allocations
`WorldSingleBladeTileField.reconcile` allocates a `TileRequest` object per missing tile per
reconcile (`:327`); `getDiagnostics` builds a fresh object per frame (`WorldGrassSystem.ts:278-321`).
Neither shows in profiles today; listed so they are not accidentally multiplied by future work.

### R12 (M today, H at larger stream radius) — Far draw calls inherit mid-batch granularity
Far card meshes exist per 32 m render batch (`WorldGrassSystem.ts:1017-1027`), so the resident
set at `grassRadiusDesktop 5` is 121 chunks × 4 = 484 far meshes, essentially all inside the
44–290 m far band — ≈ 150–480 instanced draws per frame for cards a few pixels tall, ≈ 1.5–3 ms
of render-loop CPU, growing quadratically with stream radius. Fine culling granularity buys
nothing at that distance. Fix: emit far instances per *chunk* (÷ 4 draws) — PERF-8 in the
performance plan; this is the item that matters most for the bigger-world roadmap.

### R11 (info) — Gates constrain the solution space
`verify-grass-performance.mjs:300-320` hard-asserts 72/48 blades/m² and
`midBladesPerPatch === bladesPerPatch` (mid geometry must retain the full source blade set), and
`:385-396` asserts one-triangle base blades, vertex-stage rejection, and no fragment `discard` in
the near material. PERF-1/2 below are designed to satisfy these as written (runtime trims, not
geometry thinning). Any strategy that thins the *source geometry* instead must change the gate in
the same commit, deliberately.

## Verdict

This is an unusually disciplined grass system: the LOD-parity engineering, per-instance-everything
discipline, and incremental builders are already at or above shipping-game quality. The gap to
"AAA look, seamless LODs, very performant" is concentrated in five places: mid-layer vertex waste
(R1), far-card discard tax (R2), far draw-call scaling (R12), far-field shimmer (R3), and wind
that is periodic and per-layer-inconsistent (R4/R5 + look plan). All five have mechanical fixes
in the plan documents. For the bigger-world roadmap, R1 and R12 are the two that scale with
radius; the biome design that keeps future variety free of new draw calls is in
[grass-biome-architecture.md](grass-biome-architecture.md).
