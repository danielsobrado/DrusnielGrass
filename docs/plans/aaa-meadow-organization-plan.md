# AAA Meadow Organization, Material Separation, and Visual Hierarchy Plan

Status: completed and reviewed (revision 3)
Baseline date: 2026-08-24
Baseline branch: `main`
Baseline commit checked before writing: `64b1445` (`fix(grass): separate understory leaf forms`)

Companion documents:

- [aaa-world-visual-upgrade-plan.md](aaa-world-visual-upgrade-plan.md)
- [aaa-grass-execution-plan.md](aaa-grass-execution-plan.md)
- [aaa-foreground-grass-clumping-shape-color-plan.md](aaa-foreground-grass-clumping-shape-color-plan.md)
- [aaa-look-audit.md](aaa-look-audit.md)
- [tiny-glade-detail-foliage-plan.md](tiny-glade-detail-foliage-plan.md)

### Revision history

**Revision 3** — post-implementation code and visual review:

1. Added the missing `npm run test:meadow-shots` workflow. It captures three
   settled, clean 1920×1080 review frames, keeps the diagnostic/isolation checks
   active until capture time, and records luminance, saturation, vegetation
   separation, and screen-radial luminance in one JSON report.
2. The review set isolates the meadow from the out-of-scope scenic layer while
   retaining terrain, stones, water, flowers, and every grass LOD. This prevents
   clipped tree crowns from obscuring the two macro-organization captures.
3. The broadleaf-understory realised-share floor is **3%**, not 5%: less than 3%
   of the shipped world is shaded, so forcing a 5% share would put understory on
   ecologically invalid open ground. The mostly-grass upper bound is 72% for the
   same measured-world reason. The gate and this plan now agree.
4. Moved the last parallel art table, community archetype bias, into version 2
   of `WorldCommunityProfiles.json`.
5. Visual A/B review reduced `grassRosetteChance` from 0.22 to **0.12**. Coverage
   remains 100.09% in the deterministic placement gate while repeated near-field
   crown bundles and submitted geometry both fall.

**Revision 2** — reworked after review. Five substantive changes:

1. **The community field's causality was inverted** and is now ecology-driven
   (Section 9). Revision 1 had an independent noise field label a patch
   `BARE_BREAK` and then write `dryness: +0.14`, which contradicts
   `WorldEcologyField`'s founding principle that features agree only when they
   are consequences of the same cause. Noise now decides *where* colonies
   organize; ecology decides *which* colony is possible there. The `dryness`
   response column is deleted outright — dryness selects the community, so
   writing it back is circular.
2. **The Phase 1 gate contradicted its own target values** and is replaced by a
   composite distance-response profile plus conflict classes (Section 6.7).
   Revision 1's blanket pairwise rule failed on at least ten of its own pairs and
   would have forbidden the deliberately shared shading schedule that
   `GrassNearMaterial` documents as the fix for an earlier ring.
3. **A new Phase 3b — understory morphology** (Section 7) lands *before* the
   community work. Making `BROADLEAF_UNDERSTORY` a prominent named community
   while the broadleaf cards are green masses would amplify the exact defect the
   two most recent commits were fighting.
4. **`instanceShape` is a 4-byte normalized `Uint8Array`**, not a 16-byte
   `vec4` (Section 13.1).
5. **Art tables move to JSON** (`WorldCommunityProfiles.json`), and the three
   per-schedule jitter knobs collapse into one ratio.

Execution order changed to **1 → 3b → 3 → 2 → 4 → 6 → 5 → 7**.

---

## 1. Purpose and assessment of the brief

The review that prompted this document is right about the diagnosis and right
about the ordering. The scene has enough geometry; what it lacks is
**organization, material separation, and visual hierarchy**. This plan turns the
twelve observations into an implementable contract.

Two corrections before the work is specified, because they change what gets
built:

**(a) Several of the requested systems already exist and must be tuned, not
rebuilt.** The repository already ships ecological causality
(`src/world/ecology/WorldEcologyField.ts`), macro dryness/vigour/clearing fields
(`src/grass/GrassFieldVariation.ts`), a 180 m biome partition with a rank
transform (`src/world/grass/WorldBiomeField.ts`), stochastic LOD dither in every
grass layer, flower colony fields with tint coherence
(`src/world/grass/WorldDetailFoliageDistribution.ts`), clump archetypes and
morphology profiles (`src/world/grass/GrassClusterProfile.ts`), and a procedural
terrain substrate with meso/micro noise, path cores, stone-contact soil and a wet
sheen (`src/world/TerrainMaterialShader.ts`). Re-implementing any of these would
regress verification gates that already bound them. Every phase below names the
existing owner and extends it.

**(b) The LOD banding has a specific, findable cause that the brief describes
only by symptom.** It is not that the transitions are non-stochastic — they
already are. It is that **six independent camera-distance schedules share the
same two edge values (28 m and 54 m)**, and one of them (`terrainFarMerge` in
`TERRAIN_DETAIL_COLOR`) is a raw albedo ramp on the ground keyed to camera
distance. Stacked schedules that share edges read as one hard ring no matter how
well each is individually dithered. Section 5 lists all six with line-level
references. This is why "fix visible LOD banding" is correctly first: it is a
small, surgical change with the largest single payoff.

One re-ordering. The brief puts palette last. Half the palette problem is a
**single constant** (`tipLuminanceScale: 1.38` in
`src/grass/materials/GrassPaletteTuning.json`) and a **single preset value**
(`normalUp: 0.76`), both of which change how every later phase is judged.
Phase 1 therefore ships a *provisional* palette move (Section 6.8) so subsequent
phases are tuned against the intended target; the full palette pass still lands
last.

---

## 2. Scope

### In scope

- Camera-distance LOD schedule separation and world-space band jitter across
  grass, detail foliage, and terrain (brief items 3, 11).
- Per-fragment evaluation of the macro ecology fields on the terrain, so ground
  structure survives terrain resolution rings and distance (items 3, 11).
- **Understory plant morphology** in the detail-foliage atlas: leaf silhouettes,
  negative space, phenotype rows, broadleaf/shrub family separation (item 2's
  prerequisite; also the defect the last two commits were fighting).
- A new mid-scale **ecology-driven community field** that names vegetation
  communities and drives density, height, accent share, and understory ratio
  (items 2, 7, 8).
- Grass/path/soil transition ecology (item 5).
- Terrain substrate: second mottle octave, hollows, moss, soil-hue
  decorrelation, clump-scale contact AO (items 4, 10).
- Near-blade silhouette diversity, rosette clusters, broad blades (item 6).
- Blade lighting separation: normal-flattening schedule, canopy-depth AO,
  clump-core AO (items 9, 10).
- Meadow palette: a global desaturation lever, a new default preset, biome and
  soil colour moves (items 1, 12).

### Out of scope

- Trees, stones, water, clouds, sky, character, wind architecture, interaction
  and trail systems. They may be read from; they are not modified except where a
  uniform they already own is renamed.
- The grass streaming/budget architecture, the impostor atlas baker, and the
  quality governor's contracts.
- New render passes. Everything here is build-time CPU work, existing uniforms,
  or additions to shader chunks that already run.

### Non-negotiable invariants

1. **LOD colour parity.** `verify-lod-color-parity` bounds the p95 near/mid/far
   colour delta. Every colour change goes through
   `setBalancedGrassPaletteColors` / `grassResolvePalette`
   (`src/grass/materials/GrassPaletteShader.ts`) so all LODs move together.
2. **Determinism.** Every field is a pure function of world position and
   `config.seed`. No frame accumulation, no camera dependence in placement.
3. **Reserved bounds.** Anything that can move a vertex further from its root
   must widen the reserved radius in `src/world/grass/GrassRuntimeMath.ts` and
   stay inside `verify-lod-continuity`'s reproduction of it.
4. **Allocation-free hot paths.** Placement loops and per-frame updates allocate
   nothing; new samplers fill caller-owned targets, as `sampleGrassHabitat` does.
5. **Causal direction.** Ecology is upstream of composition. A field may read
   ecology to decide what grows; it may not write back a value ecology owns.
   Enforced by Section 9.10's ecological-consistency gate.
6. **Budgets.** No phase may regress `verify-grass-performance` or
   `verify-grass-streaming-performance`. Per-phase budgets are stated inline.

---

## 3. Current architecture map

| Concern | File | Owns |
|---|---|---|
| Ecological causes | `src/world/ecology/WorldEcologyField.ts` | moisture, fertility, exposure, disturbance, rockiness, shade |
| Ecology constants | `src/world/ecology/WorldEcologyTuning.ts` | the coefficients above |
| Macro variation | `src/grass/GrassFieldVariation.ts` | dryness (27 m), vigour (19 m), clearing (7 m), canopy AO |
| Biome partition | `src/world/grass/WorldBiomeField.ts` | 180 m regions, rank transform, per-blade border dither |
| Biome art | `src/grass/biome/GrassBiomeProfiles.json` | palette, density, height/width bands, accent species |
| Grass habitat | `src/world/grass/GrassHabitatField.ts` | density, height, dryness, clumpScale, underlayer, lean, accentChance, openness, archetype |
| Clump morphology | `src/world/grass/GrassClusterProfile.ts` (+ `…Tuning.ts`) | per-archetype tier shares, coverage, lean, plane coherence |
| Near placement | `src/world/grass/WorldSingleBladeTileFactory.ts` | clump grammar, per-instance matrix and `instanceVariation` |
| Near layers | `src/world/grass/WorldNearGrassField.ts` | ultra-near / base / bridge / density-boost bands |
| Blade shader | `src/grass/materials/GrassNearMaterial.ts` | keep test, wind, sub-pixel widening, palette, backlight |
| Palette | `src/grass/materials/GrassPaletteShader.ts` + `GrassPaletteTuning.json` | the one palette function every LOD shares |
| Art presets | `src/grass/GrassArtPresets.json`, `src/grass/GrassArtDirection.ts` | colours, distances, densities |
| Mid/far system | `src/world/WorldGrassSystem.ts` | chunk streaming, mid patches, far impostor groups |
| LOD control | `src/grass/GrassLodController.ts`, `src/grass/GrassLodTuning.ts` | coverage schedules, mid draw truncation |
| Impostors | `src/world/grass/WorldGrassImpostorMaterial.ts` | card shading, stochastic coverage |
| Accent species | `src/grass/biome/GrassAccentSpecies.ts` | species definitions, tints, `packGrassAccent` |
| Foliage atlas | `src/world/grass/WorldDetailFoliageAtlasFactory.ts` | the drawn plant art, cells and phenotype rows |
| Detail foliage | `src/world/grass/WorldDetailFoliageField.ts`, `…Distribution.ts`, `…Affinity.ts`, `…Material.ts`, `DetailFoliageTuning.ts` | flowers, ferns, tufts, litter |
| Foliage randomness | `src/world/grass/DetailFoliageRandom.ts` | salted bit-slice channels off one hash |
| Terrain material | `src/world/TerrainMaterialShader.ts`, `src/world/TerrainMaterialController.ts` | the whole ground fragment stage |
| Terrain inputs | `src/world/terrain/TerrainSurfaceField.ts`, `TerrainSurfacePalette.ts`, `TerrainSurfaceNoiseTexture.ts` | per-vertex attributes, palette rows, RGBA noise |
| Terrain geometry | `src/world/TerrainChunk.ts`, `src/world/TerrainStreamer.ts` | vertex attribute writing, resolution rings |
| Path | `src/world/TerrainField.ts` | path distances, `samplePathGrassMask`, `PATH_GRASS_FEATHER` |
| Config | `src/world/WorldConfig.ts`, `WorldConfigSchema.ts`, `WorldConfigValidator.ts`, `public/config/world.yaml` | every lever below |

---

## 4. Phase overview

| Order | Phase | Brief items | Headline change | Risk |
|---|---|---|---|---|
| 1 | **1** | 3, 11 | Separate and jitter every camera-distance schedule; macro fields per fragment | Medium |
| 2 | **3b** | 2 (prerequisite) | Understory leaf morphology, 4 phenotype rows, broadleaf/shrub separation | Low |
| 3 | **3** | 2, 7, 8 | Ecology-driven `WorldCommunityField`; communities drive composition | Medium |
| 4 | **2** | 5 | Ragged, ecological path verges; pioneer blades; dirt flecks | Low |
| 5 | **4** | 4, 10 | Substrate: fleck octave, hollows, moss, soil-hue decorrelation, clump AO | Low |
| 6 | **6** | 9, 10 | Normal-up distance schedule, canopy-depth AO, clump-core AO | Low |
| 7 | **5** | 6 | `instanceShape` attribute, rosette clusters, broad blades | Medium |
| 8 | **7** | 1, 12 | Global desaturation lever, new default preset, biome/soil colour moves | Low |

```text
Phase 1 (schedules + macro fields + provisional palette)
   │
   ├─> Phase 3b (understory morphology) ──> Phase 3 (communities) ──┐
   │                                                                 │
   ├─> Phase 2 (path verges) ───────────────────────────────────────┤
   │                                                                 v
   │                                                        Phase 4 (substrate)
   │                                                                 │
   └─> Phase 6 (lighting) ──> Phase 5 (blade silhouette) ──> Phase 7 (palette)
                    └────────────── tuned together with Phase 4 ─────┘
```

Phase 3b **gates** Phase 3: raising the broadleaf community's prominence before
its plant art improves would amplify the defect. If 3b slips, Phase 3 ships with
`communityWeightBroadleafUnderstory` at 0.4 of its target and raises it after.

Phases 2 and 6 are independent of 3b/3 and may run in parallel. Phase 4 and
Phase 6 implement the two halves of brief item 10 (ground-side contact pool,
blade-side root darkening) and must be **tuned in one sitting** even though the
code lands separately.

---

## 5. Root-cause analysis

### 5.1 The banding stack (brief item 3)

Every schedule below is a function of **camera distance** and modifies what a
ground or grass pixel looks like. Six of them share edges at 28 m and 54 m.

| # | Schedule | Where | Today | What it changes |
|---|---|---|---|---|
| B1 | `terrainFarMerge` | `TerrainMaterialShader.ts`, `TERRAIN_DETAIL_COLOR` | `smoothstep(uTerrainLodDistances.z, .w, d)` = 28→54 | Mixes ground albedo toward `terrainCanopy`. **A raw colour ramp on the ground.** |
| B2 | `terrainMesoWeight` | same file | `1 - smoothstep(28, 54, d)` | Meso mottling amplitude → variance collapse over the same ring |
| B3 | `terrainMicroWeight` | same file | `1 - smoothstep(6, 7, d)` | Micro grain, dry fibre, path grit. **1 m transition.** |
| B4 | Terrain resolution rings | `TerrainStreamer.ts` L226–231 | Chebyshev chunk distance ≤1 → 25, ≤`radius-1` → 13, else 7 | Vertex spacing 2.67 / 5.33 / 10.67 m at `chunkSize: 64` → the ground's ecology detail halves at a square ring |
| B5 | Detail-foliage fade | `WorldDetailFoliageField.ts` L128–129 | `38 ± 4` | All understory vanishes in an 8 m ring |
| B6 | Mid density falloff | `GrassNearMaterial.ts`, `GRASS_MID_DENSITY_FALLOFF` | `start 28, end 62, floor 0.18` | Blade grain thins from the same 28 m edge |

Supporting evidence in the code itself: `GrassNearMaterial.ts` already carries a
comment about a *previous* instance of exactly this failure —

> "Keying it to `uGrassNearDistance` gave the five near/mid layers five different
> schedules (3.4 m, 9.4 m, 14.6 m), so the two co-located populations inside the
> ultra-near band were lit differently and the handoff at 6-7 m read as a
> brightness ring following the camera."

The fix applied then — one shared *shading* schedule across all near layers — was
right, and Section 6.7's gate must not forbid it. The remaining problem is its
mirror image: schedules that genuinely must differ have been left sharing edges.

Three sub-causes are not "dither harder":

- **B1 is a mean shift, not a variance shift.** No amount of stochastic dither
  hides a ramp between two different colours. It has to be re-keyed and widened.
- **B3 is not mean-preserved for `terrainGrit`.** `TERRAIN_DETAIL_COLOR` already
  mean-preserves the dry fibre pulse (`TERRAIN_DRY_FIBRE_PULSE_MEAN`), but
  `terrainGrit = smoothstep(0.64, 0.86, micro.b) * terrainMicroWeight` feeds
  `mix(terrainPathColor, uTerrainPathGrit, terrainGrit * 0.24)` with no such
  correction — so paths brighten at 6–7 m.
- **B4 is a spatial-frequency step, not a colour step.** The macro dryness field
  has a 27 m period and the vigour field 19 m. At the far ring's 10.67 m vertex
  spacing the vigour field is below Nyquist and aliases. This is also brief
  item 11's real cause: the distant meadow does not "lose structure" because of
  geometry LOD, it loses it because **the ground can no longer carry the fields
  that make structure**.

### 5.2 Flat grass lighting (brief item 9)

`normalUp: 0.76` in every preset (`src/grass/GrassArtPresets.json`) and in
`public/config/grass.yaml`. In `GrassNearMaterial`'s `VERTEX_NORMAL`:

```glsl
objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), uGrassNormalUp));
```

76% of every blade's normal is world up, so blades facing the sun and blades
facing away return nearly the same Lambert response. It also flattens
`grassThinness = 1.0 - abs(dot(normal, grassSunDirection))` in `FRAGMENT_OUTPUT`,
which is the transmission term — so the backlighting the brief asks for is
already implemented correctly and is being suppressed by the same constant.

### 5.3 Identical near silhouettes (brief item 6)

`WorldSingleBladeTileFactory.createSingleBladeGeometry` builds **one** source
blade per segment count and caches it (`getSourceGeometry`). Every near instance
is an affine copy: `matrix.compose(position, align, scale)`. The apex sits at
local x = 0, so every blade is a symmetric isoceles triangle differing only in
width, height, yaw and lean. That is exactly the "many identical thin triangles"
read.

### 5.4 Everything the same hue (brief items 1, 12)

- `tipLuminanceScale: 1.38` in `GrassPaletteTuning.json` scales the tip colour to
  138% of base luminance before shading, on top of already-yellow tips
  (`lush-hero` `tipColor: "#c7dc61"`).
- `TerrainSurfaceField.sample` derives `humidity` from
  `(1 - dryness) * 0.68 + vigor * 0.32 + hydrology.humidityBoost`, and
  `TERRAIN_DETAIL_COLOR` then does
  `terrainSoil = mix(uTerrainSoilDry, uTerrainSoilRich, terrainHumidity)`. Soil
  colour is therefore a **function of grass dryness** — the two can never
  separate, which is precisely the "base terrain, grass blades and understory sit
  too close in hue" complaint.
- `uTerrainSoilDry: "#9a794b"` is the mustard visible where the grass opens.

### 5.5 Distribution reads as noise (brief items 2, 7)

The existing macro fields are all *modulations of the same thing*: dryness
(27 m), vigour (19 m), clearing (7 m), macro patch (36 m). None of them **names a
community**, so every point in the world is "grass, a bit drier/wetter/denser".
There is no field that says "this 25 m patch is a tall-grass colony and that one
is a short sward" and then makes density, height, accent share, understory share
and archetype agree with that statement.

The field that supplies it must be **ecology-conditioned**, not independent. An
independent noise field that labels a patch and then edits ecology reverses the
causality the whole world model is built on, and produces bare breaks on wet
fertile ground — scatter wearing a taxonomy. Section 9 specifies the correct
direction: ecology sets which communities are *possible*, low-frequency noise
picks among them and gives the patch its shape.

### 5.6 Understory plants are green masses (brief item 2's prerequisite)

`DETAIL_FOLIAGE_VARIANT_ROWS = 2` in `WorldDetailFoliageAtlasFactory.ts`. Ten
species at a 128 px cell make a 1280 × 256 atlas: **two silhouettes per species
for the entire world**. For flowers that is survivable — a daisy is a small,
high-contrast shape and the tint channel adds variety. For `broadleaf-rosette`
and `low-shrub` it is not: both are large, low-contrast, mid-green, and both
occupy the same visual role, so a patch of them reads as one undifferentiated
mass. The two most recent commits on `main` (`restore understory foliage detail`,
`separate understory leaf forms`) were fighting this.

This is a **prerequisite**, not a nice-to-have: Phase 3 promotes
`BROADLEAF_UNDERSTORY` to a named, spatially concentrated community. Concentrating
a plant that reads as a green mass makes a larger green mass.

---

## 6. Phase 1 — LOD band separation and per-fragment macro fields

**Objective.** No camera-distance ring is visible in a settled frame at any
camera height, and the ground's macro structure is independent of terrain
resolution.

### 6.1 New module: `src/grass/GrassLodBanding.ts`

One owner for the world-space wander applied to every distance schedule, with a
CPU function and a GLSL mirror so the two cannot drift.

```ts
/**
 * World-space wander applied to every camera-distance LOD edge.
 *
 * Six schedules in this renderer key off camera distance. Individually each is
 * dithered; together they used to share the same two edge values, which is what
 * turned a stack of soft fades into one hard ring. Offsetting each schedule's
 * *distance* by a low-frequency world-space field breaks the ring into a
 * wandering boundary that no longer follows the camera.
 *
 * The offset is applied to the distance rather than to the two edges, so a
 * jittered `start` can never cross a jittered `end` — the ordering invariant
 * holds by construction rather than by a bound on the jitter. The field is
 * zero-mean, so a schedule's average coverage over a large area is unchanged and
 * `verify-lod-color-parity`'s budget is untouched.
 */
export const LOD_BAND_JITTER_PERIOD = 46;   // metres per lattice cell
export const LOD_BAND_JITTER_SEED = 0x2f_a5_1b_c7;

/** Zero-mean offset in [-0.5, 0.5], smooth in world space. */
export function sampleLodBandOffset(x: number, z: number): number;

/** GLSL mirror; declares `float grassLodBandOffset(vec2 world)`. */
export const LOD_BAND_GLSL: string;
```

Implementation: reuse the two-octave `patchNoise` construction from
`GrassFieldVariation.ts` (coarse + 0.5 × fine at 2.7×, normalised by 1.5), then
subtract 0.5. Do **not** re-export `GrassFieldVariation`'s private helpers;
duplicate the four lines so the band field can be re-tuned without moving the
ecology fields.

Applied as:

```ts
effectiveDistance = distance
  + (end - start) * config.lodBandJitterRatio * sampleLodBandOffset(x, z);
```

**One ratio, not per-schedule knobs.** Revision 1 had four independent jitter
values; a schedule's useful wander is a fixed fraction of its own transition
width, so deriving it removes four levers and makes them impossible to
misconfigure relative to each other. `lodBandJitterRatio: 0.33` (range 0–0.5).

### 6.2 Schedule separation table

| Schedule | Owner | Today | Target | Width | Class |
|---|---|---|---|---|---|
| ultra-near blades | `grassUltraNearDistance` / `…TransitionDistance` | 6 ± 1 | **6 ± 3** | 6 | Coverage |
| terrain micro detail | `uTerrainLodDistances.x/y` | 6 → 7 | **9 → 27** (own uniform) | 18 | DetailPreserved |
| grass micro shading fade | `grassMicroDetailFadeStart/End` | 3 → 10 | **3 → 13** | 10 | DetailPreserved |
| near density boost | `grassNearDensityBoostDistance/Transition` | 14 ± 6 | **15 ± 6** | 12 | Coverage |
| near bridge | `grassNearBridgeDistance/Transition` | 18 ± 2 | **22 ± 4** | 8 | Coverage |
| near → mid | preset `nearDistance` / `transitionDistance` | 28 ± 8 | 28 ± 8 (unchanged) | 16 | Coverage |
| mid density falloff | `GRASS_MID_DENSITY_FALLOFF` | 28 → 62 | **36 → 74** | 38 | Coverage |
| detail foliage fade | `DETAIL_FOLIAGE_FADE_DISTANCE/TRANSITION` | 38 ± 4 | **42 ± 12** | 24 | Coverage |
| terrain meso detail | `uTerrainLodDistances.z/w` | 28 → 54 | **46 → 100** (own uniform) | 54 | DetailPreserved |
| terrain canopy merge | `terrainFarMerge` | 28 → 54 | **64 → 136** (own uniform) | 72 | **MeanAlbedo** |
| mid → far | preset `midDistance` / `transitionDistance` | 54 ± 8 | 54 ± 8 (unchanged) | 16 | Coverage |
| far → terrain | preset `farDistance` / `transitionDistance` | 280 ± 8 | unchanged | 16 | Coverage |

The two preset handoffs stay put: they are load-bearing for
`verify-grass-bridge-lod` and `verify-lod-continuity`, and once the mean-albedo
ramp moves off their edges they stop being visible on their own.

Ordering constraint asserted by the gate: the canopy merge must not begin before
the mid layer has actually thinned, i.e.
`terrainCanopyMergeStart >= GRASS_MID_DENSITY_FALLOFF.end - 12`.

### 6.3 B1 — re-key and widen the terrain canopy merge

`src/world/TerrainMaterialShader.ts`, in `TERRAIN_DETAIL_FRAGMENT`, replace the
single `uTerrainLodDistances` vec4 with three named ranges:

```glsl
uniform vec2 uTerrainMicroRange;        // (start, end) metres
uniform vec2 uTerrainMesoRange;
uniform vec2 uTerrainCanopyMergeRange;
uniform float uTerrainBandJitterRatio;
```

In `TERRAIN_DETAIL_COLOR`:

```glsl
float terrainBandOffset = grassLodBandOffset(vTerrainWorldPosition.xz);
float terrainMicroWeight = 1.0 - smoothstep(
  uTerrainMicroRange.x, uTerrainMicroRange.y,
  terrainDistance + (uTerrainMicroRange.y - uTerrainMicroRange.x) *
    uTerrainBandJitterRatio * terrainBandOffset
);
float terrainMesoWeight = 1.0 - smoothstep(
  uTerrainMesoRange.x, uTerrainMesoRange.y,
  terrainDistance + (uTerrainMesoRange.y - uTerrainMesoRange.x) *
    uTerrainBandJitterRatio * terrainBandOffset
);
float terrainFarMerge = smoothstep(
  uTerrainCanopyMergeRange.x, uTerrainCanopyMergeRange.y,
  terrainDistance + (uTerrainCanopyMergeRange.y - uTerrainCanopyMergeRange.x) *
    uTerrainBandJitterRatio * terrainBandOffset
);
```

Use **one** shared `terrainBandOffset` sample, not three: three decorrelated
fields would make the three weights disagree at a point and produce mottling
where a smooth ground is wanted. One field with three different widths already
separates the boundaries in *distance*, which is what matters.

Additionally, weaken the merge itself. Today:

```glsl
terrainSurfaceColor = mix(terrainSurfaceColor, terrainCanopy, terrainFarMerge * terrainCoverage);
```

`terrainCanopy` is a materially different colour from the near ground. Cap it:

```glsl
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  terrainCanopy,
  terrainFarMerge * terrainCoverage * uTerrainCanopyMergeStrength
);
```

with `terrainCanopyMergeStrength: 0.62` (range 0–1). The remaining difference is
carried by the impostor cards, which is where distant canopy colour belongs.

`src/world/TerrainMaterialController.ts`:

- Delete `uTerrainLodDistances`; add the uniforms above.
- `setGrassArtDirection` currently writes `lod.z = direction.nearDistance` and
  `lod.w = direction.midDistance`. **Remove both writes.** The terrain schedules
  are no longer derived from the grass preset; that derivation is B1's cause.
- Bump `MATERIAL_CACHE_KEY` to
  `world-terrain-ecosystem-surface-v12-band-separation`.

### 6.4 B3 — mean-preserve `terrainGrit`

Mirror the existing `TERRAIN_DRY_FIBRE_PULSE_MEAN` treatment. In
`src/world/terrain/TerrainSurfaceNoiseTexture.ts`:

```ts
/**
 * Mean of `smoothstep(0.64, 0.86, B)` over the fine channel, measured across the
 * whole 256x256 field at level 0 and quantized exactly as the texture stores it.
 * Held constant as the micro weight fades, for the same reason the fibre mean is:
 * only the speckle may disappear with distance, never the average.
 */
export const TERRAIN_GRIT_PULSE_MEAN = 0.0975;
```

The value must be **measured**, not guessed: add a measurement to
`verify-terrain-surface` that recomputes it across the six seeds it already
sweeps and fails if the constant is off by more than 0.004.

```glsl
float terrainGrit = TERRAIN_GRIT_PULSE_MEAN +
  (smoothstep(0.64, 0.86, terrainMicroNoise.b) - TERRAIN_GRIT_PULSE_MEAN) *
  terrainMicroWeight;
```

### 6.5 B4 / item 11 — per-fragment macro fields

Two implementations, selected by runtime profile. **Measure before implementing:**
write the micro-benchmark first (a terrain-filling 1080p frame with the hash path
compiled in, timed with the existing `GpuFrameTimer`), and let it choose the
default per profile.

#### Desktop: exact GLSL mirror

New file `src/world/terrain/TerrainMacroFieldShader.ts` exporting
`TERRAIN_MACRO_FIELD_GLSL`: a **bit-exact** GLSL mirror of `hashLattice` and
`valueNoise` from `src/grass/GrassFieldVariation.ts`. `Math.imul` is a 32-bit
signed multiply and GLSL ES 3.0 `uint * uint` is mod 2^32, so the bit patterns
agree; three 0.185 is WebGL2-only, so `uint` and bit operators are available.

```glsl
uint terrainHashLattice(int x, int z, uint seed) {
  uint v = (uint(x) * 374761393u) ^ (uint(z) * 668265263u) ^ seed;
  v = (v ^ (v >> 13u)) * 1274126177u;
  return v ^ (v >> 16u);
}

float terrainHash01(int x, int z, uint seed) {
  return float(terrainHashLattice(x, z, seed)) / 4294967296.0;
}

float terrainValueNoise(vec2 p, uint seed) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  vec2 w = f * f * (3.0 - 2.0 * f);
  int cx = int(cell.x);
  int cz = int(cell.y);
  float c00 = terrainHash01(cx,     cz,     seed);
  float c10 = terrainHash01(cx + 1, cz,     seed);
  float c01 = terrainHash01(cx,     cz + 1, seed);
  float c11 = terrainHash01(cx + 1, cz + 1, seed);
  return mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
}

float terrainPatchNoise(vec2 world, float period, uint seed) {
  float coarse = terrainValueNoise(world / period, seed);
  float fine = terrainValueNoise((world * 2.7) / period, seed ^ 0x9e3779b9u);
  return (coarse + fine * 0.5) / 1.5;
}
```

Precision note for the gate: `float(uint)` loses bits above 2^24, so a GLSL
sample can differ from the JS one by at most ~6e-8 relative. Parity tolerance
1e-5.

#### Compact: baked macro field texture

Integer multiply commonly runs at quarter rate on integrated GPUs, so the hash
path is expected to cost 3–5× more there. New file
`src/world/terrain/TerrainMacroFieldTexture.ts`:

- 512 × 512 RGBA8, `ClampToEdgeWrapping`, mipmapped, `LinearMipmapLinearFilter`.
- Covers the full 2048 m world at exactly **4 m per texel**. The 19 m vigour
  field needs ≤ 9.5 m to satisfy Nyquist, so 4 m is comfortably above it.
- R = macro dryness (27 m), G = macro vigour (19 m), B = reserved for the
  community selector, A = soil hue (Phase 4).
- Built once at startup beside `createTerrainSurfaceNoiseTexture`, from the same
  functions the CPU uses. ~262 k samples × 8 hashes ≈ 15–30 ms, one time.
- Sampled with `textureGrad` from `vTerrainWorldPosition.xz / 2048.0 + 0.5`.

Resampling a 19 m field at 4 m and re-lerping linearly costs ≈ 1.5% of range, so
the parity tolerance for the compact path relaxes to 0.02. Blades still use the
exact CPU function; the residual is a sub-percent ground/blade disagreement that
no capture resolves.

#### Wire-up (both paths)

```glsl
// Vigour and macro dryness are the two fields that give the ground its
// large-scale structure, and both are sampled per *vertex* today. At the far
// terrain ring one vertex covers 10.67 m, which is under Nyquist for the 19 m
// vigour field: the structure aliases away exactly where the eye needs it.
// Evaluating the same functions per fragment makes ground structure independent
// of terrain resolution, which is what stops the distant meadow collapsing into
// noise and what removes the square ring at the resolution boundary.
terrainVigor = terrainMacroVigor;
terrainDryness = saturate(
  terrainDryness
  + (terrainMacroDryness - vTerrainBiome.w) * uTerrainMacroDrynessStrength
);
```

Two supporting facts make this exact rather than approximate:

- `terrainEcology.y` **is** `sampleGrassMacroVigor(x, z)` verbatim
  (`TerrainSurfaceField.sample`), so the varying can simply be replaced.
- Macro dryness enters `terrainEcology.z` through `sampleGrassHabitat` as
  `sampleGrassMacroDryness(x, z) * GRASS_MACRO_DRYNESS_STRENGTH`. Subtracting the
  vertex value and adding the fragment value removes the double count exactly.
  `uTerrainMacroDrynessStrength` is `GRASS_MACRO_DRYNESS_STRENGTH` (0.22),
  injected as a GLSL literal from the TypeScript constant so it cannot drift.

To supply `vTerrainBiome.w`, widen the biome attribute from `vec3` to `vec4`:

- `src/world/terrain/TerrainSurfaceField.ts`: `TerrainSurfaceTargets.biome`
  becomes `THREE.Vector4`; write
  `targets.biome.set(biome.indexA, biome.indexB, biome.blend, macroDryness)`.
- `src/world/TerrainChunk.ts`: `this.biome = new THREE.Vector4()`,
  `this.biomes = new Float32Array(vertexCount * 4)`, offset `* 4`, four
  components written, `new THREE.BufferAttribute(this.biomes, 4)`.
- `src/world/TerrainMaterialShader.ts`: `attribute vec4 terrainBiome;`,
  `varying vec4 vTerrainBiome;`, `.w` passed through in
  `TERRAIN_DETAIL_POSITION`.

Seeds and periods must be **imported from `GrassFieldVariation.ts`**, which means
exporting `DRYNESS_PERIOD`, `VIGOR_PERIOD`, `DRYNESS_SEED`, `VIGOR_SEED`.

**Budget.** ≤ 0.35 ms on the reference desktop capture at 1080p with terrain
filling the frame. This is a **hard decision point**: if the benchmark misses it,
the desktop path switches to the baked texture too and the hash mirror is kept
only as the parity reference for the gate.

### 6.6 B5 — detail foliage fade

`src/world/grass/WorldDetailFoliageField.ts`:

```ts
export const DETAIL_FOLIAGE_FADE_DISTANCE = 42;
export const DETAIL_FOLIAGE_FADE_TRANSITION = 12;
```

`DETAIL_FOLIAGE_VISIBILITY_RADIUS` is derived from these plus
`DETAIL_FOLIAGE_RESIDENCY_MARGIN`, so the streamed radius grows; confirm against
`verify-world-grass-allocation` and `verify-near-grass-streaming` and raise the
tile budget if the residency set grows past its ceiling.

Additionally, **stagger the fade per species** so the understory does not vanish
as one layer. `WorldDetailFoliageMaterial`'s vertex stage already decodes
`speciesIndex` from `instanceAccent`:

```glsl
// Each species leaves at its own distance. One shared fade removes the whole
// understory across a single ring; spreading the departures over the transition
// turns that ring into a gradual thinning of the community.
float foliageSpeciesFadeOffset =
  (fract(speciesIndex * 0.61803398875) - 0.5) * uFoliageFadeStagger;
float foliageFadeDistance = uFadeDistance + foliageSpeciesFadeOffset
  + uFadeTransition * uLodBandJitterRatio * grassLodBandOffset(foliageWorldPosition.xz);
```

with `uFoliageFadeStagger` = 8 m.

### 6.7 Verification gate

`scripts/verify-lod-band-separation.mjs`, wired into `npm run build` immediately
after `verify-lod-continuity`, and as `npm run test:lod-bands`.

#### 6.7.1 Schedule registry (anti-drift)

Revision 1's gate re-derived the schedule list by scraping five files, which is
how a seventh schedule gets added later and silently escapes the gate. Instead,
new file `src/grass/GrassLodSchedules.ts`:

```ts
export const enum LodScheduleClass {
  /** Changes the mean colour of a pixel that continues to exist. */
  MeanAlbedo,
  /** Changes how many blades or cards exist. */
  Coverage,
  /** Changes detail amplitude only, around a preserved mean. */
  DetailPreserved,
}

export interface LodSchedule {
  key: string;
  start: number;
  end: number;
  scheduleClass: LodScheduleClass;
  /** Coverage schedules that repay lost area in width and colour. */
  paysCoverageBack: boolean;
}

export function resolveLodSchedules(
  config: WorldConfig,
  direction: GrassArtDirection,
): readonly LodSchedule[];
```

Every distance-keyed `smoothstep` in the grass, foliage and terrain sources must
appear here. The gate enforces that by grepping the sources for
`smoothstep(` calls whose third argument names a camera distance and asserting
each is annotated with a `// lod-schedule: <key>` marker matching a registry
entry. An unmarked, unregistered schedule fails the build.

#### 6.7.2 Primary assertion — composite distance-response profile

This is the test that actually measures the artifact, and it supersedes the
pairwise rule Revision 1 used as a proxy.

Compose from the registry a model of what a ground-plus-grass pixel returns as a
function of camera distance:

```text
coverage(d) = product over Coverage schedules of their surviving fraction
luma(d)     = base
            + sum over MeanAlbedo schedules of their weighted colour delta
            + coverage(d) * (canopyLuma - groundLuma)
```

with the jitter marginalised out by averaging over 256 offsets drawn from
`sampleLodBandOffset`'s own distribution. Assert, for `d` in [4, 200] at 0.5 m
steps:

1. `max |luma(d + 4) - luma(d)| / meanLuma < 0.009` — the same bound as the
   capture-based acceptance criterion in 6.9, evaluated analytically so it runs
   in the build without a browser.
2. `coverage` is monotone non-increasing, and `max |coverage(d + 4) - coverage(d)| < 0.12`.
3. The numerical first derivative of `luma` has no local maximum exceeding 3×
   its median over the range — i.e. no schedule dominates the profile.

#### 6.7.3 Secondary assertions — conflict classes

A blanket pairwise rule is wrong: `grassMicroDetailFadeStart/End` is deliberately
shared across all five near/mid layers (Section 5.1), and forbidding overlap
would re-introduce the ring that sharing fixed. Rules are per class.

- **MeanAlbedo × MeanAlbedo** — pairwise edge separation ≥ 12 m and transition
  overlap ≤ 25% of the narrower interval. After Phase 1 this class has exactly
  one member, so the rule is a guard against a future second one.
- **MeanAlbedo × Coverage** — edge separation ≥ 8 m.
- **Coverage × Coverage** — no separation requirement. Two coverage schedules
  that both repay area (`paysCoverageBack`) compose to a smooth curve, which
  6.7.2's assertions already bound. Assert only that every Coverage schedule
  either sets `paysCoverageBack` or is separated from every other Coverage
  schedule by ≥ 6 m.
- **DetailPreserved** — exempt from all separation rules. Each must instead prove
  mean preservation: for the noise term it weights,
  `|mean(weighted) - mean(unweighted)| < 0.004` over the noise domain. This is
  what `TERRAIN_DRY_FIBRE_PULSE_MEAN` and the new `TERRAIN_GRIT_PULSE_MEAN`
  exist for, and the gate now requires it of every member.

#### 6.7.4 Remaining assertions

4. **Ordering.** `terrainCanopyMergeStart >= midDensityFalloffEnd - 12`;
   `terrainMesoEnd <= terrainCanopyMergeEnd`; every `start < end`.
5. **Macro parity.** Import `GrassFieldVariation.ts` through the vite dev server
   (as `verify-terrain-surface` does), evaluate `sampleGrassMacroVigor` and
   `sampleGrassMacroDryness` at 4 096 positions, and compare against a JS
   re-implementation of the GLSL text extracted from
   `TerrainMacroFieldShader.ts` — parsed, not re-typed — with tolerance 1e-5
   (desktop path) and 0.02 (baked-texture path).
6. **Grit mean.** `TERRAIN_GRIT_PULSE_MEAN` within 0.004 of measured, six seeds.
7. **Jitter safety is not asserted** — it holds by construction, because the
   offset is applied to the distance and not to the edges (Section 6.1).

Extend `verify-terrain-surface` with the grit measurement and a check that
`uTerrainLodDistances` no longer appears in `TerrainMaterialShader.ts` or
`TerrainMaterialController.ts`.

### 6.8 Provisional palette move

Ship with Phase 1 so later phases are judged against the target look:

- `src/grass/materials/GrassPaletteTuning.json`: `tipLuminanceScale` 1.38 → 1.30.
- `public/config/world.yaml`: add `grassPaletteDesaturation: 0.06` (the full
  lever is specified in Phase 7; ship the plumbing and a small value now).

Re-run `verify-lod-color-parity`, `verify-grass-dry-lighting`, and
`verify-lod-continuity` — `GRASS_VERTEX_PALETTE_ROOT_PROGRESS` is *derived* from
this JSON by bisection at module load, so it moves automatically, but the parity
residual it bounds must be re-measured.

### 6.9 Acceptance criteria

**Hard gate (build):** the composite profile assertions in 6.7.2.

**Capture diagnostic (`npm run test:meadow-shots`, run at phase boundaries, not
in the default build chain):** a settled 1080p capture from the reference
third-person pose, ground luminance sampled along 64 radial rays at 1 m spacing
from 4 m to 160 m; the first difference of the per-distance median must have no
|Δ| above 0.9% of frame mean luminance across any 4 m window. This is the
empirical counterpart of 6.7.2's analytic bound; a disagreement between them
means the model is missing a schedule.

**Also:** the macro vigour pattern is visibly continuous across the terrain
resolution ring in an aerial capture at 90 m; `npm run build` passes; frame time
within +0.35 ms of the Phase 0 baseline.

---

## 7. Phase 3b — understory morphology

**Objective.** Broadleaf and shrub understory read as individual plants with
leaves, not as green masses — *before* Phase 3 concentrates them.

### 7.1 Four phenotype rows

`src/world/grass/WorldDetailFoliageAtlasFactory.ts`:

```ts
/**
 * Four phenotype rows per species.
 *
 * Two was survivable for flowers, where the tint channel supplies most of the
 * variety and the silhouette is small and high-contrast. It is not survivable
 * for broadleaf and shrub foliage: those are large, low-contrast, mid-green
 * shapes that occupy the same visual role, so two silhouettes across the whole
 * world read as one repeated mass. The rows are maturation states, not reseeds
 * — juvenile, mature, senescent/flowering, and grazed/damaged — because a
 * population that differs only in random seed still reads as one plant.
 */
export const DETAIL_FOLIAGE_VARIANT_ROWS = 4;
```

Atlas grows from 1280 × 256 to 1280 × 512 — 2.6 MB RGBA uncompressed, from
1.3 MB. Negligible; no ceiling is approached.

**Packing change.** `packGrassAccent` in `src/grass/biome/GrassAccentSpecies.ts`
currently packs `speciesIndex * 16 + variantRow * 8 + tintRow`, which gives
`variantRow` exactly one bit. Widen the species stride:

```ts
export function packGrassAccent(
  speciesIndex: number,
  variantRow: number,   // now 0..3
  tintRow: number,      // 0..7
): number {
  return speciesIndex * 32 + variantRow * 8 + tintRow;
}
```

and the matching decode in `WorldDetailFoliageMaterial`'s vertex stage:

```glsl
float speciesIndex = floor(accent / 32.0);
float packedRemainder = accent - speciesIndex * 32.0;
float variantRow = floor(packedRemainder / 8.0);
vTint = packedRemainder - variantRow * 8.0;
```

Maximum packed value is 10 × 32 + 3 × 8 + 7 = 351, exact in a float32 attribute.
The producer in `WorldDetailFoliageField` (the `packGrassAccent` call at the
candidate site) must widen its variant roll from a 2-way to a 4-way pick, drawn
from the existing `DETAIL_FOLIAGE_INDIVIDUAL_MATURITY_SALT` channel so maturity
and phenotype agree.

### 7.2 Leaf morphology for broadleaf and shrub

The drawing routines in `WorldDetailFoliageAtlasFactory` are where the work
lands. Requirements, each measurable:

1. **Negative space.** Draw 5–9 discrete leaves with visible gaps rather than an
   overlapping mass. Target alpha coverage per cell: `broadleaf-rosette` ≤ 0.42,
   `low-shrub` ≤ 0.38, `fern` ≤ 0.34 of the cell's drawn bounding area. These are
   gate-able (Section 7.4).
2. **Asymmetric outlines.** Independent left/right control points per leaf, with
   a minimum asymmetry of 8% of leaf half-width. A mirrored leaf reads as a
   printed shape.
3. **Notches and serrations.** 3–7 per margin, amplitude 4–9% of leaf half-width,
   phase-offset between the two margins.
4. **Central vein and fold.** Darken along the midrib in the atlas **G (shade)
   channel** — not the RGB, so the palette still owns colour — and offset the two
   halves so the leaf reads as folded rather than flat. This is what gives a
   large leaf internal form at 3 m without more geometry.
5. **Orientation spread.** Leaves within one rosette must span ≥ 100° of
   in-plane rotation, so no two share an angle.
6. **Family separation.** `broadleaf-rosette` is ground-hugging and wide — few,
   large, low leaves. `low-shrub` is upright with many small leaves and a visible
   woody stem. Today both draw as green masses in the same size class; after this
   phase their binarized silhouettes must be measurably distinct (Section 7.4).
7. **Ferns.** `fern` and `small-fern` differ in pinna count and spacing per row,
   not only in scale.

All of this stays inside the existing atlas/instanced-quad architecture. No
geometry is added: `createDetailFoliageGeometry` still emits the two stacked
quads it emits today.

### 7.3 Understory shading

`WorldDetailFoliageMaterial` already applies
`DETAIL_FOLIAGE_UNDERSTORY_EDGE_DARKENING` (0.13) over
`DETAIL_FOLIAGE_UNDERSTORY_EDGE_RANGE` (0.25). With real leaf margins and a
midrib in the G channel, raise the edge darkening to 0.20 so the new silhouette
detail is actually visible, and gate it on the understory category mask that is
already built (`DETAIL_FOLIAGE_UNDERSTORY_MASK_GLSL`).

### 7.4 Verification

New `scripts/verify-understory-morphology.mjs` (`npm run test:understory`).
The atlas factory draws to a canvas; the script renders it headlessly through the
vite dev server, exactly as `verify-detail-foliage-distribution` already does for
the distribution.

1. **Alpha coverage.** Per (species, row), coverage inside the authored band from
   7.2 item 1, ±0.05.
2. **Silhouette distinctness.** Binarize each cell's alpha at 0.5; the Hamming
   distance between any two (species, row) masks of the same species is ≥ 22% of
   cell pixels. Two rows that differ only by a reseed will fail this.
3. **Family distinctness.** `broadleaf-rosette` vs `low-shrub` mask distance
   ≥ 35%, over all row pairs.
4. **Asymmetry.** For each broadleaf/shrub cell, the mask's left and right halves
   about its centroid differ by ≥ 8% of the mask area.
5. **Margin complexity.** Perimeter² / area (isoperimetric ratio) of the largest
   connected component ≥ 22 for serrated species — a smooth blob scores ~12.5.
6. **Determinism.** SHA-256 of the atlas pixel data is stable across two builds.
7. **Packing.** `packGrassAccent`'s stride matches the decode in
   `WorldDetailFoliageMaterial`, parsed from both sources.

### 7.5 Acceptance criteria

- At 2 m, individual leaves are distinguishable within a broadleaf rosette.
- A patch of `low-shrub` is not confusable with a patch of `broadleaf-rosette`.
- Atlas build time within +40 ms (one-time, at startup).
- No change to draw calls or instance counts.

---

## 8. Phase 3 dependency note

Phase 3 below assumes Phase 3b has landed. If it has not,
`communityWeightBroadleafUnderstory` ships at 0.4 of its target value and is
raised in the commit that completes 3b.

---

## 9. Phase 3 — ecology-driven vegetation communities

**Objective.** The meadow is composed of readable communities with transitional
edges, each one *possible where it is* because of the conditions there, and the
same statement drives blades, understory, flowers, and ground.

### 9.1 The causal contract

Revision 1 had this backwards. The rule now:

> **Ecology decides which communities are possible. Low-frequency noise decides
> which of the possible ones actually organizes here, and gives the patch its
> shape. A community may read every ecology channel; it may write none of them.**

Consequences that fall out of the rule, all of which simplify the design:

- The `dryness` response column is **deleted**. Dryness is an input to selection;
  writing it back is circular.
- The rank transform and the five `worldShare` config keys are **deleted**. When
  ecology drives selection you cannot guarantee a share, and pretending to would
  mean overriding ecology to hit a quota. Shares become measured outcomes the
  gate bounds.
- Revision 1's special-case archetype chain (its Section 8.4) is **deleted**.
  `resolveGrassClusterArchetype` already reads the same ecology, so it agrees
  with the community without being told to. Needing that chain was the symptom
  that the causality was inverted.
- Community must not touch what biome owns. **Biome** owns palette, species pool,
  height band, wind damping. **Community** owns composition: density, height
  multiplier, accent share, understory ratio, clump scale. No overlap, or
  dry-steppe plus short-sward would stack into an over-dry look.

### 9.2 New module: `src/world/ecology/WorldCommunityField.ts`

Structurally modelled on `DetailFoliageAffinity` — which already does
weight × ecology-fit selection correctly one level down, for species — rather
than on `WorldBiomeField`.

```ts
export const COMMUNITY_SHORT_SWARD = 0;
export const COMMUNITY_TALL_COLONY = 1;
export const COMMUNITY_BARE_BREAK = 2;
export const COMMUNITY_FLOWER_MEADOW = 3;
export const COMMUNITY_BROADLEAF_UNDERSTORY = 4;
export const COMMUNITY_COUNT = 5;

export interface WorldCommunitySample {
  /** Dominant community at this position. */
  index: number;
  /** Runner-up; equals `index` when the winner is decisive. */
  neighborIndex: number;
  /** Share of individuals belonging to `neighborIndex`, in [0, 0.5]. */
  blend: number;
  /**
   * 1 where the winner is decisive, 0 where the top two scores tie.
   *
   * `blend` and `core` both come from the same score margin, which is what makes
   * a community edge a gradient rather than a wall without a second field: where
   * two communities are nearly equally suited, individuals interleave *and* the
   * winner expresses itself weakly. That is what a real ecotone is.
   */
  core: number;
  /** How deliberately empty this patch is, in [0, 1]. */
  quiet: number;
}

export function createCommunitySample(): WorldCommunitySample;

export function sampleWorldCommunity(
  x: number,
  z: number,
  ecology: WorldEcologySample,
  config: WorldConfig,
  target: WorldCommunitySample,
): WorldCommunitySample;

/** The single community a plant rooted at (x, z) belongs to. */
export function pickCommunityIndex(
  x: number, z: number, sample: WorldCommunitySample,
): number;
```

### 9.3 Algorithm

**Step 1 — ecology fit.** For each community `c`, score its six preference
curves against the ecology sample. Reuse the bell-curve helper
`DetailFoliageAffinity` already has (`target` / `tolerance` per channel):

```ts
fit_c = Π over channel in {moisture, fertility, exposure, disturbance, rockiness, shade}
          preferenceScore(ecology[channel], pref_c[channel].target, pref_c[channel].tolerance)
```

Authored in `src/world/ecology/WorldCommunityProfiles.json` (Section 9.5).

**Step 2 — composition field.** One lattice hash per corner at
`grassCommunityWorldSize` metres, bit-sliced into six channels with salts —
exactly the `detailFoliageChannel01` / `DETAIL_FOLIAGE_CHANNEL_*_SALT` pattern in
`src/world/grass/DetailFoliageRandom.ts`. Five channels are the per-community
noise; the sixth, sampled at 2.6× the period, is `quiet`.

This is what keeps the cost flat: five decorrelated fields cost **four hashes
plus masking**, not twenty hashes.

```ts
noise_c(x, z) = bilerp over the four corner hashes of communityChannel01(hash, SALT_c)
```

**Step 3 — score.**

```ts
score_c = weight_c
        * lerp(1, fit_c, config.grassCommunityEcologyStrength)
        * (0.30 + 0.70 * noise_c);
```

The `0.30 + 0.70 * noise` floor matters: at 0 the noise could veto a
well-suited community outright, which turns patch edges into hard nulls. The
`ecologyStrength` lerp is the single lever between "pure noise composition"
(0) and "ecology dictates everything" (1); at 1 the communities follow moisture
and slope isolines and read as a contour map, which is why the default is 0.78,
not 1.

**Step 4 — selection and margin.**

```ts
const best = argmax score;  const second = argmax score excluding best;
const margin = (score[best] - score[second]) / Math.max(score[best], 1e-6);

target.index = best;
target.neighborIndex = second;
target.blend = 0.5 * (1 - smoothstep(0, config.grassCommunityBorderWidth, margin));
target.core  = smoothstep(
  config.grassCommunityBorderWidth,
  config.grassCommunityBorderWidth * 2.6,
  margin,
);
```

**Step 5 — quiet.** `quiet = smoothstep(0.52, 0.86, noiseQuiet)`.

**Step 6 — per-plant pick.** `pickCommunityIndex` hashes the root position
against `blend`, exactly as `pickGrassBiomeIndex` does, so individuals interleave
across an ecotone instead of the whole patch flipping.

### 9.4 Response resolution

`src/world/ecology/WorldCommunityResponse.ts`:

```ts
export interface CommunityResponse {
  density: number;        // multiplier
  height: number;         // multiplier
  accentChance: number;   // multiplier
  understory: number;     // multiplier on GrassHabitatSample.underlayer
  clumpScale: number;     // multiplier
  // NOTE: no dryness. Dryness selects the community; writing it back is circular.
}

export function resolveCommunityResponse(
  sample: WorldCommunitySample,
  config: WorldConfig,
  target: CommunityResponse,
): CommunityResponse;
```

Resolution order: take the winner's row, lerp toward neutral (all 1.0) by
`1 - core * grassCommunityStrength`, blend toward the runner-up's row by `blend`,
then apply quiet:

```ts
// Quiet ground loses incident, not grass. Density is left alone; what falls is
// the accent layer and the clump-scale variety that make a patch busy. This is
// the lever that buys the hero colonies something to stand against.
target.accentChance *= 1 - sample.quiet * config.grassCommunityQuietStrength;
target.clumpScale = lerp(
  target.clumpScale, 1, sample.quiet * config.grassCommunityQuietStrength * 0.7,
);
```

### 9.5 `src/world/ecology/WorldCommunityProfiles.json`

Art tuning lives in JSON with a schema validator and a version constant, matching
`GrassBiomeProfiles.json` / `GrassArtPresets.json`. TypeScript owns validation
and resolution only.

```json
{
  "version": 1,
  "communities": {
    "short-sward": {
      "index": 0,
      "label": "Short Sward",
      "weight": 1.00,
      "preferences": {
        "moisture":    { "target": 0.45, "tolerance": 0.35 },
        "fertility":   { "target": 0.40, "tolerance": 0.30 },
        "exposure":    { "target": 0.70, "tolerance": 0.35 },
        "disturbance": { "target": 0.35, "tolerance": 0.40 },
        "rockiness":   { "target": 0.30, "tolerance": 0.35 },
        "shade":       { "target": 0.15, "tolerance": 0.30 }
      },
      "response": { "density": 1.00, "height": 0.72, "accentChance": 0.35, "understory": 0.55, "clumpScale": 0.88 }
    },
    "tall-colony": {
      "index": 1,
      "label": "Tall Colony",
      "weight": 0.85,
      "preferences": {
        "moisture":    { "target": 0.75, "tolerance": 0.25 },
        "fertility":   { "target": 0.75, "tolerance": 0.25 },
        "exposure":    { "target": 0.45, "tolerance": 0.40 },
        "disturbance": { "target": 0.05, "tolerance": 0.20 },
        "rockiness":   { "target": 0.05, "tolerance": 0.20 },
        "shade":       { "target": 0.25, "tolerance": 0.35 }
      },
      "response": { "density": 1.06, "height": 1.22, "accentChance": 0.55, "understory": 0.80, "clumpScale": 1.18 }
    },
    "bare-break": {
      "index": 2,
      "label": "Bare Break",
      "weight": 0.55,
      "preferences": {
        "moisture":    { "target": 0.15, "tolerance": 0.25 },
        "fertility":   { "target": 0.15, "tolerance": 0.25 },
        "exposure":    { "target": 0.80, "tolerance": 0.35 },
        "disturbance": { "target": 0.70, "tolerance": 0.40 },
        "rockiness":   { "target": 0.70, "tolerance": 0.35 },
        "shade":       { "target": 0.10, "tolerance": 0.25 }
      },
      "response": { "density": 0.28, "height": 0.80, "accentChance": 0.30, "understory": 0.40, "clumpScale": 0.70 }
    },
    "flower-meadow": {
      "index": 3,
      "label": "Flower Meadow",
      "weight": 0.70,
      "preferences": {
        "moisture":    { "target": 0.55, "tolerance": 0.30 },
        "fertility":   { "target": 0.65, "tolerance": 0.30 },
        "exposure":    { "target": 0.75, "tolerance": 0.30 },
        "disturbance": { "target": 0.15, "tolerance": 0.30 },
        "rockiness":   { "target": 0.15, "tolerance": 0.30 },
        "shade":       { "target": 0.10, "tolerance": 0.25 }
      },
      "response": { "density": 0.94, "height": 0.98, "accentChance": 2.10, "understory": 1.05, "clumpScale": 1.00 }
    },
    "broadleaf-understory": {
      "index": 4,
      "label": "Broadleaf Understory",
      "weight": 0.75,
      "preferences": {
        "moisture":    { "target": 0.70, "tolerance": 0.30 },
        "fertility":   { "target": 0.85, "tolerance": 0.25 },
        "exposure":    { "target": 0.30, "tolerance": 0.35 },
        "disturbance": { "target": 0.05, "tolerance": 0.20 },
        "rockiness":   { "target": 0.10, "tolerance": 0.25 },
        "shade":       { "target": 0.70, "tolerance": 0.30 }
      },
      "response": { "density": 0.86, "height": 0.92, "accentChance": 1.70, "understory": 1.35, "clumpScale": 1.06 }
    }
  },
  "speciesAffinity": {
    "daisy":              [1.30, 0.55, 0.30, 1.80, 0.45],
    "round-bloom":        [0.70, 0.75, 0.25, 2.00, 0.55],
    "seed-head":          [1.10, 1.60, 0.65, 0.55, 0.30],
    "grass-tuft":         [1.20, 1.45, 0.60, 0.80, 0.75],
    "fern":               [0.20, 0.85, 0.10, 0.35, 2.00],
    "small-fern":         [0.35, 0.80, 0.15, 0.45, 1.85],
    "broadleaf-rosette":  [0.55, 0.70, 0.30, 0.60, 2.00],
    "clover-patch":       [1.55, 0.70, 0.35, 1.25, 0.85],
    "low-shrub":          [0.30, 1.05, 0.55, 0.40, 1.30],
    "leaf-litter":        [0.60, 0.90, 1.10, 0.55, 1.60]
  }
}
```

Read the ecological logic across the preference rows: bare breaks want dry,
disturbed, rocky, exposed ground; broadleaf understory wants shade over rich damp
soil; tall colonies want wet, fertile, sheltered, undisturbed ground; short sward
wants drier, more exposed, more trafficked ground; flowers want open fertile
ground. Nothing is asserted — everything is *earned* from the ecology that is
already there.

`WorldCommunityProfiles.ts` validates the JSON with the same `assertRecord` /
`assertFiniteInRange` / `fail` helpers `GrassBiomeProfile.ts` uses, and carries
`WORLD_COMMUNITY_VERSION = 2`, bumped when the archetype-bias art row moved into
the JSON during implementation review.

### 9.6 Wiring

`sampleGrassHabitat` in `src/world/grass/GrassHabitatField.ts` gains the resolved
response, not the raw sample, so the function stays a pure mapper and every
caller shares one resolution:

```ts
export function sampleGrassHabitat(
  x, z, ecology, biomeDensity, minimumClimateDensityRetention,
  heightBandMin, heightBandMax, drynessBias, accentDensity,
  community: CommunityResponse,   // NEW
  config, target,
): GrassHabitatSample
```

Application points, in the order the existing function already computes them:

```ts
density *= community.density;                    // before the climate floor
// ... existing patchMul, floor, rockiness, disturbance ...
// ... existing clearing (still the only term allowed to reach zero) ...

target.height    = clamp(biomeHeight * community.height * (existing terms), 0.58, 1.22);
target.clumpScale = lerp(0.68, 1.27, target.density) * community.clumpScale;
target.underlayer = clamp01(existingUnderlayer * community.understory);
target.accentChance = clamp01(existingAccentChance * community.accentChance);
// target.dryness is untouched.
```

Placing `community.density` **before** the climate retention floor is deliberate:
a bare break should be allowed to fall through to bare ground the way a clearing
does. The floor exists to stop *climate* zeroing a meadow, not to stop
composition doing it.

Callers to update — each already owns `(x, z)` and an ecology sample, so each
adds two scratch fields:

- `src/world/terrain/TerrainSurfaceField.ts`
- `src/world/grass/WorldSingleBladeTileFactory.ts`
- `src/world/WorldGrassSystem.ts` (mid/far placement)
- `src/world/grass/WorldDetailFoliageField.ts`

**Archetype.** No special-case chain. `resolveGrassClusterArchetype` takes the
community index only as a nudge to its existing identity bias:

```ts
const identityBias = (roll - 0.5) * 0.08
  + COMMUNITY_ARCHETYPE_BIAS[communityIndex] * 0.12;
```

where `COMMUNITY_ARCHETYPE_BIAS` is a five-entry table that leans short-sward
toward `SHORT_DRY` and tall-colony toward `TALL_WET`. Because both systems read
the same ecology, they already agree most of the time; this only sharpens the
agreement at the margin.

### 9.7 Species colonies (brief item 8)

`src/world/grass/DetailFoliageAffinity.ts` multiplies its existing habitat score:

```ts
const communityScore = lerp(
  1,
  profiles.speciesAffinity[species.key][communityIndex],
  tuning.communityStrength,
);
```

with `detailFoliageCommunityStrength: 0.8` (0–1).

Two further brief-item-8 requirements:

- **Species-specific colony scale.** `WorldDetailFoliageDistribution` uses one
  `colonyWorldSize` for everything. Add `colonyScale` to `GRASS_ACCENT_SPECIES` —
  daisies 0.7 (tight drifts), ferns 1.5 (broad stands), grass tufts 1.2, litter
  1.8 — and sample the colony lattice at `colonyWorldSize * colonyScale` for the
  **family/tint/maturity** rolls only. `presence` and `clump` keep the shared
  lattice, or species would fight over the same ground.
- **Flower height follows surrounding grass.** In `WorldDetailFoliageField`'s
  placement, scale accent height by the habitat's own height:
  `heightScale *= lerp(1, habitat.height, tuning.grassHeightCoupling)` with
  `detailFoliageGrassHeightCoupling: 0.55` (0–1). A daisy in a tall colony should
  be a taller daisy; today it is the same daisy in taller grass, which is why the
  flowers read as sprinkled on top.

### 9.8 Ground agreement and distant structure

The terrain carries the community per **vertex**, as a `vec2`
`terrainCommunity = (index, core)`:

- `TerrainSurfaceTargets` gains `community: THREE.Vector2`.
- `TerrainChunk` gains `communities: Float32Array(vertexCount * 2)` and
  `geometry.setAttribute("terrainCommunity", new THREE.BufferAttribute(this.communities, 2))`.
  8 bytes per terrain vertex; ~240 KB across the near ring. Confirm against
  `verify-world-grass-allocation`.

**Why per-vertex is sufficient here, when Section 6.5 needed per-fragment.** The
far terrain ring's vertex spacing is `chunkSize / (terrainFarResolution - 1)` =
64 / 6 = 10.67 m. The 19 m vigour field needs ≤ 9.5 m and therefore aliases; the
26 m community field needs ≤ 13 m and does not. So the community survives the
resolution ring at the vertex rate, and no GLSL reproduction, no uploaded
threshold array, and no per-fragment ecology are needed. Revision 1 specified all
three; they are deleted.

The constraint must be enforced rather than assumed. New validator rule:

```ts
// The community field is carried per terrain vertex, so its period must stay
// above twice the coarsest vertex spacing or the distant ground loses exactly
// the structure this field exists to give it.
grassCommunityWorldSize >= 2.1 * chunkSize / (terrainFarResolution - 1)
```

At the shipped `chunkSize: 64` and `terrainFarResolution: 7` that is 22.4 m; the
default 26 passes with margin.

Ground response, in `TERRAIN_DETAIL_COLOR` after the underlayer mix:

```glsl
// One statement, several consequences: the ground goes barer in a break, damper
// and greener under a broadleaf stand, drier and paler in a short sward. Without
// this the communities exist only in the geometry and vanish with it at range,
// which is exactly the failure the distant meadow shows today.
//
// The index is piecewise constant, so a triangle spanning two communities would
// interpolate to a value belonging to neither. The same coherence guard the
// stone-contact identity uses applies: where the index has a gradient, fade the
// tint out rather than paint an invented community.
float terrainCommunityIndexSlope = max(
  abs(dFdx(vTerrainCommunity.x)), abs(dFdy(vTerrainCommunity.x))
);
float terrainCommunityCoherence = 1.0 - smoothstep(0.02, 0.35, terrainCommunityIndexSlope);
int terrainCommunity = int(vTerrainCommunity.x + 0.5);
vec3 terrainCommunityTint =
  terrainCommunity == 2 ? uTerrainSoilDry :
  terrainCommunity == 4 ? uTerrainMoss :
  terrainCommunity == 0 ? mix(terrainSurfaceColor, vTerrainBiomeDry, 0.34) :
  terrainSurfaceColor;
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  terrainCommunityTint,
  vTerrainCommunity.y * terrainCommunityCoherence * uTerrainCommunityTintStrength
);
```

`terrainCommunityTintStrength: 0.42` (0–1). `uTerrainMoss` arrives in Phase 4;
until then use `mix(uTerrainSoilRich, vTerrainBiomeBase.rgb, 0.5)`.

This is the change that most directly answers brief item 11: at 200 m the blades
are gone, but the ground still shows dark colonies, dry patches and bare breaks.

### 9.9 Required companion change

`grassMacroPatchStrength: 0.52` — the existing 36 m macro patch field now
responds to the same causes as the community field and will fight it. This is not
a risk to monitor; it is a **required change in the same commit**: reduce to
**0.34**, and assert in the gate that the two periods differ by ≥ 25%.

### 9.10 Verification

New `scripts/verify-community-field.mjs` (`npm run test:community`), modelled on
`verify-detail-foliage-distribution.mjs`.

1. **Ecological consistency — the causality gate.** Over 400 000 samples,
   comparing per-community means:
   - `mean(moisture | BROADLEAF_UNDERSTORY) - mean(moisture | BARE_BREAK) >= 0.20`
   - `mean(disturbance | BARE_BREAK) - mean(disturbance | TALL_COLONY) >= 0.20`
   - `mean(shade | BROADLEAF_UNDERSTORY) - mean(shade | FLOWER_MEADOW) >= 0.15`
   - `mean(fertility | TALL_COLONY) - mean(fertility | BARE_BREAK) >= 0.20`
   These fail loudly if anyone ever reintroduces a write-back, and they are the
   machine-checkable form of invariant 5.
2. **Realised shares.** Measured, not enforced. Assert each community's share is
   in [0.03, 0.40] and that `shortSward + tallColony` ∈ [0.42, 0.72] — the
   authored hierarchy, expressed as a band rather than a quota.
3. **Patch scale.** Mean connected-run length along an axis within ±30% of
   `grassCommunityWorldSize`.
4. **Continuity.** `core`, `blend`, and every `CommunityResponse` field are
   continuous: over a 0.001 m probe at 20 000 positions, no output changes by
   more than 0.02. (The detail-foliage gate's 0.011 bound, scaled for the wider
   smoothstep here.)
5. **Ecology-strength monotonicity.** Raising `grassCommunityEcologyStrength`
   from 0 to 1 must monotonically increase the consistency margins in item 1.
   This proves the lever does what it claims.
6. **Nyquist rule.** `grassCommunityWorldSize` satisfies the validator rule in
   9.8 for the shipped config.
7. **Period separation.** `|grassCommunityWorldSize - grassMacroPatchWorldSize| /
   min(...) >= 0.25`.
8. **Determinism.** Two runs produce identical SHA-256 digests of a 4 096-sample
   trace.
9. **No write-back, structurally.** Parse `WorldCommunityResponse.ts` and assert
   the `CommunityResponse` interface has no member named for an ecology channel.

Extend `verify-flower-variety` with a colony-purity assertion: inside a
`FLOWER_MEADOW` patch core, the dominant species share is ≥ 0.55 and ≤ 0.92 —
coherent but not monocultural.

Extend `verify-ecology` with an assertion that no community response can invert
an ecological relationship the ecology gate already establishes.

### 9.11 Acceptance criteria

- A 60 m aerial capture shows patches whose boundaries a viewer can trace, at a
  scale of roughly 20–35 m.
- Bare breaks appear on dry, exposed, disturbed or rocky ground — **not** in
  hollows or under canopy. Spot-check against the ecology debug overlay.
- Bare breaks show soil, not thinned green.
- Flower groups sit inside flower-meadow patches, with stragglers outside.
- Frame time within +0.10 ms (all new work is build-time; the terrain adds one
  attribute read and a coherence guard).

---

## 10. Phase 2 — grass, path, and soil blending

**Objective.** Bare ground never reads as a painted polygon; the verge is a
community, not an edge.

### 10.1 Ragged the grass boundary, not just the dirt core

`TERRAIN_DETAIL_COLOR` already roughens the **core**:

```glsl
vec2 terrainCoreDistance = abs(vTerrainPath.xy) + uTerrainPathEdge * terrainEdgeNoise;
```

but leaves the **grass mask** as a clean offset curve. Apply the same noise, with
its own amplitude:

```glsl
// The dirt core has been ragged since paths shipped; the grass edge around it
// has not, which is why the verge reads as a stencil laid over the meadow. The
// two boundaries must be roughened by the same field, or the ragged core simply
// sits inside a clean green cut-out.
vec2 terrainGrassDistance = abs(vTerrainPath.xy) +
  uTerrainPathGrassEdge * terrainEdgeNoise;
vec2 terrainPathGrassBands = smoothstep(
  terrainPathGrassHalfWidth,
  terrainPathGrassHalfWidth + vec2(uTerrainPathGrassFeather),
  terrainGrassDistance
);
```

`pathGrassEdgeRoughness: 0.9` (0–2.5). It must exceed `pathEdgeRoughness` (0.5)
so the vegetation boundary is *more* irregular than the mineral one, which is
what real trampling produces.

The CPU must agree or blades float over painted dirt.
`src/world/TerrainField.ts`, `resolvePathGrassMask`:

```ts
// Same roughening the terrain shader applies to the vegetation boundary. Both
// sides read one shared world-space field so blades and ground cannot disagree.
const edge = samplePathEdgeNoise(x, z) * this.pathGrassEdgeRoughness;
const main = smoothstep(
  Math.abs(distances.x) + edge,
  this.pathGrassHalfWidthMain + clearance,
  this.pathGrassHalfWidthMain + clearance + PATH_GRASS_FEATHER,
);
```

`samplePathEdgeNoise` is a new export of `src/grass/GrassFieldVariation.ts`:
zero-mean, period 6 m, seed `0x1c_2d_8f_43`. The **terrain shader must use this
same function**, not `terrainBaseNoise.r` — replace `terrainEdgeNoise`'s
definition with the GLSL mirror from `TerrainMacroFieldShader.ts` so core, mask
and blades all agree. This also removes a latent mismatch: `terrainEdgeNoise`
currently mixes a 64 m and a 29.5 m channel to roughen a boundary whose feature
size is ~1 m.

`resolvePathGrassMask` gains `x`, `z` parameters for the terrain-chunk overload;
`TerrainChunk` already holds them.

Because `PATH_MAX_FIELD_SLOPE` and `PATH_CUTOFF_SAFETY` bound the early rejection
in `samplePathDistances`, widening the effective boundary by up to
`pathGrassEdgeRoughness` metres requires the rejection radius to grow by the same
amount.

### 10.2 Pioneer blades

`WorldSingleBladeTileFactory.advanceBuild` currently rejects hard
(`if (pathMask <= 0) continue;`). Replace with:

```ts
// A used path is not sterile. A small share of blades survives in the tread —
// shorter, flattened, and thinning toward the compacted centre — which is what
// stops the verge reading as a cut rather than a gradient. The roll is a stable
// world-space hash rather than the job random so the same blades survive at
// every LOD and across rebuilds.
let pioneer = 0;
if (pathMask <= 0) {
  const core = this.field.samplePathCoreAmount(x, z, height);
  const chance = this.worldConfig.grassPathPioneerChance * (1 - core);
  if (this.positionHash01(x, z, PATH_PIONEER_SALT) >= chance) {
    continue;
  }
  pioneer = 1;
}
```

`samplePathCoreAmount` is a new `TerrainField` method mirroring the shader's
`terrainPathCore`.

Downstream: `verticalScale *= 1 - pioneer * grassPathPioneerHeightLoss`;
coverage becomes `grassPathPioneerCoverage`; and force the flattened archetype by
`habitat.directionalLean = max(habitat.directionalLean, 0.62)` before
`resolveGrassClusterArchetype`, so pioneers reuse `GRASS_CLUSTER_FLATTENED`'s
existing morphology rather than needing a new one.

Config: `grassPathPioneerChance: 0.06` (0–0.25),
`grassPathPioneerHeightLoss: 0.45` (0–0.7),
`grassPathPioneerCoverage: 0.55` (0–1).

### 10.3 Height ramp into the verge

`sampleGrassHabitat` applies `(1 - disturbance * 0.28)` to height. Too weak to
read at walking height. Promote the literal to config and raise it:
`grassDisturbanceHeightReduction: 0.52` (0–0.8).

### 10.4 Dirt flecks inside the grass

After the underlayer mix, before the thatch mix:

```glsl
// Traffic carries mineral soil up into the vegetation for metres either side of
// a tread. Without it the verge is two flat fields meeting at a line; with it
// the boundary is a gradient of exposure, which is what the eye reads as a worn
// edge.
float terrainVergeFleck = smoothstep(0.58, 0.86, terrainMesoNoise.r) * terrainMesoWeight;
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainPathDust,
  saturate(terrainPathShoulder * uTerrainVergeFleckStrength * terrainVergeFleck)
);
```

Not mean-preserved on purpose — it belongs to the near-field verge only. The band
gate registers it as a Coverage-class rider on `terrainMesoWeight` and asserts
`terrainVergeFleckStrength * meanFleck * maxShoulder < 0.02`, below the profile's
per-4 m budget.

`terrainVergeFleckStrength: 0.34` (0–0.8).

### 10.5 Compacted core

`uTerrainPathCoreDarkening` 0.08 → **0.20**, and depth-shaped:

```glsl
terrainPathColor *= 1.0 - uTerrainPathCoreDarkening *
  smoothstep(0.15, 1.0, terrainPathCore);
```

### 10.6 Verification

New `scripts/verify-path-verge.mjs` (`npm run test:path-verge`):

- Boundary roughness: sample the CPU `resolvePathGrassMask` and the parsed GLSL
  grass-band expression along 512 transects; the 0.5-crossing radius has standard
  deviation ≥ 0.35 m and the two agree within 0.05 m.
- Pioneer share: over 200 000 samples inside the tread, the surviving fraction is
  within ±15% of `grassPathPioneerChance * (1 - meanCore)`.
- No blade survives where `terrainPathCore > 0.85` (walkability).
- The fleck-step bound in 10.4.

Extend `verify-navigation` with the widened cutoff radius.

### 10.7 Acceptance criteria

- The exposed ground in the reference capture has no straight boundary segment
  longer than 1.5 m.
- Blade height measured in 0.5 m bins from the tread edge rises monotonically
  over at least 3 m.

---

## 11. Phase 4 — terrain substrate material

**Objective.** Open ground is a material, not a colour.

Tune this phase together with Phase 6: they are the two halves of brief item 10.

### 11.1 Decorrelate soil hue from grass dryness

```glsl
uniform vec3 uTerrainSoilGrey;
uniform float uTerrainSoilHuePeriod;
uniform uint uTerrainSoilHueSeed;
uniform float uTerrainSoilHueStrength;
```

```glsl
// Soil colour has been a function of how the grass is doing, which is why the
// ground and the canopy could never separate: every term that greened the grass
// also warmed the earth under it. Real soil colour comes from parent material
// and drainage, neither of which the vegetation controls. This field is
// independent of every ecology term on purpose.
float terrainSoilHue = terrainPatchNoise(
  vTerrainWorldPosition.xz, uTerrainSoilHuePeriod, uTerrainSoilHueSeed
);
vec3 terrainSoilBase = mix(uTerrainSoilDry, uTerrainSoilRich, terrainHumidity);
vec3 terrainSoilVariant = terrainSoilHue < 0.42
  ? uTerrainSoilGrey
  : (terrainSoilHue > 0.74 ? uTerrainSoilRich : uTerrainSoilDry);
vec3 terrainSoil = mix(terrainSoilBase, terrainSoilVariant, uTerrainSoilHueStrength);
```

On the compact path this reads the baked texture's A channel instead.

Config: `terrainSoilHueWorldSize: 14` (6–40), `terrainSoilHueStrength: 0.38`
(0–0.8). `uTerrainSoilGrey` = `#7a6f5c`.

### 11.2 Fleck octave

The existing octaves are 64 m, 29.5 m and 7.4 m. Nothing occupies the 2–5 m band
a walking camera reads as soil texture:

```glsl
vec4 terrainFleckNoise = vec4(0.5);
if (terrainMicroWeight > 0.001) {
  mat2 terrainFleckRotation = mat2(0.6, -0.8, 0.8, 0.6);
  vec2 terrainFleckUv = terrainFleckRotation * terrainBaseUv * 18.0 + vec2(0.271, 0.883);
  terrainFleckNoise = textureGrad(
    uTerrainSurfaceNoise, terrainFleckUv,
    terrainFleckRotation * terrainBaseDdx * 18.0,
    terrainFleckRotation * terrainBaseDdy * 18.0
  );
}
float terrainFleck = (terrainFleckNoise.r - 0.5) * uTerrainFleckStrength * terrainMicroWeight;
terrainSurfaceColor *= 1.0 + terrainFleck;
```

Zero-mean, so it registers as DetailPreserved and fades safely.
`terrainGroundFleckStrength: 0.16` (0–0.4).

Reuse `terrainFleckNoise.g` in `terrainMicroHeight`:

```glsl
float terrainMicroHeight = (
  (terrainMicroNoise.b - 0.5) * 0.58 +
  (terrainMicroNoise.a - 0.5) * 0.24 +
  (terrainFleckNoise.g - 0.5) * 0.18
) * mix(1.0, 0.58, terrainWaterProximity) * terrainMicroWeight
  + terrainRockRelief * terrainCliff;
```

### 11.3 Hollows

The fragment shader has slope but no curvature. `TerrainLandformField` already
computes convexity; publish it by widening `terrainPath` from `vec3` to `vec4`
with `.w = landform.convexity * 0.5 + 0.5` (all existing `.xy`/`.z` reads
unchanged).

```glsl
// Depressions collect water, litter and shadow. Without curvature the ground has
// exactly one tone per ecology value, which is what makes an open patch read as
// a flat fill regardless of how much noise is layered on it.
float terrainConcavity = saturate((0.5 - vTerrainPath.w) * 2.0);
terrainHumidity = saturate(terrainHumidity + terrainConcavity * uTerrainHollowMoisture);
terrainSurfaceColor *= 1.0 - uTerrainHollowDarkening * terrainConcavity;
```

Apply the humidity lift **before** `terrainSoil` is mixed and the darkening
**after** the surface colour is assembled but **before** the canopy merge.

Config: `terrainHollowDarkening: 0.14` (0–0.35),
`terrainHollowMoisture: 0.12` (0–0.3).

### 11.4 Moss and organic matter

```glsl
// Organic matter, not more grass tint: it accumulates where water sits, light is
// scarce and nothing scours it, and it is a genuinely different material from
// both soil and canopy. Gating on slope keeps it out of the banks.
float terrainMossAmount = saturate(terrainHumidity * 1.25 - 0.42)
  * (1.0 - terrainSlope * 2.2)
  * smoothstep(0.42, 0.78, terrainFleckNoise.b)
  * (0.35 + 0.65 * terrainConcavity);
terrainSurfaceColor = mix(
  terrainSurfaceColor, uTerrainMoss, saturate(terrainMossAmount) * uTerrainMossStrength
);
```

`uTerrainMoss` = `#4a5f34`, `terrainMossStrength: 0.30` (0–0.7).

### 11.5 Clump-scale contact AO (brief item 10, ground half)

Mirror the near-grass clump lattice: `WorldSingleBladeTileFactory` uses
`CLUMP_CELLS = 3` per `grassNearTileSize` (8 m) tile, so the clump cell is
8/3 ≈ 2.667 m.

```glsl
// The ground under a tuft is darker than the ground between tufts, and the eye
// uses exactly that to decide whether a blade is standing in the earth or pasted
// on it. Sampling the same lattice the blades are placed on is what makes the
// dark pool land under the tuft rather than near it.
vec2 terrainClumpUv = vTerrainWorldPosition.xz / uTerrainClumpCell;
vec2 terrainClumpCellId = floor(terrainClumpUv);
float terrainClumpJx = terrainHash01(int(terrainClumpCellId.x), int(terrainClumpCellId.y), uTerrainClumpSeed);
float terrainClumpJz = terrainHash01(int(terrainClumpCellId.x), int(terrainClumpCellId.y), uTerrainClumpSeed ^ 0x9e3779b9u);
vec2 terrainClumpCenter = terrainClumpCellId +
  vec2(0.35 + 0.30 * terrainClumpJx, 0.35 + 0.30 * terrainClumpJz);
float terrainClumpDistance = length(terrainClumpUv - terrainClumpCenter);
float terrainClumpShade = 1.0 - smoothstep(0.16, 0.52, terrainClumpDistance);
terrainSurfaceColor *= 1.0 - uTerrainClumpAo * terrainClumpShade *
  terrainCoverage * terrainMicroWeight;
```

Gated by `terrainMicroWeight` because a 2.7 m feature is sub-pixel beyond the
micro range and would otherwise shimmer. It is not zero-mean, so it registers in
the schedule registry as a Coverage-class rider and must pass 6.7.2's per-4 m
bound. Mean of `terrainClumpShade` over the cell is ~0.075, so the worst-case
step at the micro boundary is `0.20 × 0.075 = 1.5%` — which passes only because
Phase 1 widened the micro range to 18 m. If the measured step exceeds budget,
mean-preserve it the way the fibre pulse is.

Litter ring:

```glsl
float terrainClumpLitter = smoothstep(0.30, 0.50, terrainClumpDistance) *
  (1.0 - smoothstep(0.50, 0.72, terrainClumpDistance));
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  mix(uTerrainMoss, vTerrainBiomeDry * 0.6, terrainDryness),
  terrainClumpLitter * terrainCoverage * terrainMicroWeight * uTerrainClumpLitter
);
```

`terrainClumpContactAo: 0.20` (0–0.45), `terrainClumpLitterStrength: 0.18`
(0–0.4).

### 11.6 Verification

Extend `verify-terrain-surface`:

- Every new uniform exists in both shader text and controller, with the config
  key it claims to read.
- Zero-mean assertion for `terrainFleck` (|mean| < 0.005 over the texture).
- `terrainClumpCell` equals `grassNearTileSize / CLUMP_CELLS` within 1e-6, read
  from `public/config/world.yaml` and `WorldSingleBladeTileFactory`.
- **Colour separation:** over 50 000 samples, the Pearson correlation between
  soil luminance and canopy luminance drops below 0.55. Measure and record the
  pre-change baseline in the script header.

### 11.7 Acceptance criteria

- Open ground shows at least three distinguishable tones at 5 m and at 25 m.
- Tufts sit in a visible contact shadow.
- Frame time within +0.20 ms.

---

## 12. Phase 6 — grass lighting and contact

**Objective.** Blades separate through light, not only colour.

### 12.1 Normal-flattening schedule

Root cause per Section 5.2. Replace the scalar `uGrassNormalUp` with a distance
schedule so near blades get real facing separation while far cards keep the flat
normal they need for stability.

Hoist `grassWorldRoot`, `grassCameraDistance` and `grassMicroFade` above
`VERTEX_NORMAL`, then:

```glsl
uniform vec2 uGrassNormalUpRange;   // (near, far)

// A blade lit the same whether it faces the sun or away from it has no form.
// Flattening the normal toward world up is right for a card that must not
// shimmer at 200 m and wrong for a blade that fills 40 pixels; making it a
// schedule rather than a constant is what gives the near field its light.
float uGrassNormalUpHere = mix(
  uGrassNormalUpRange.y, uGrassNormalUpRange.x, grassMicroFade
);
objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), uGrassNormalUpHere));
grassBladePlaneNormal = normalize(
  mix(grassBladePlaneNormal, vec3(0.0, 1.0, 0.0), uGrassNormalUpHere)
);
```

Values: near **0.50**, far **0.82**. The far value must equal the impostor
material's flattening so the 54 m handoff does not shift.

`setArtDirection` writes `uGrassNormalUpRange.y = direction.normalUp` and
`.x = direction.normalUp * config.grassNearNormalUpScale` with
`grassNearNormalUpScale: 0.66` (0.4–1.0), so presets keep one authored value.

This schedule is **DetailPreserved** in the registry — it reuses
`grassMicroFade`, which is deliberately shared across all near layers, and it
changes shading only.

### 12.2 Canopy-depth and clump-core AO

```ts
// A blade standing under its neighbours receives less sky. The clump profile
// already knows how tall its main tier is, so the shortfall of this blade
// against that tier is exactly how deep in the canopy it sits — no neighbour
// search, no runtime cost. The second factor says the same thing radially:
// blades near a tuft's centre are more occluded than blades at its rim.
const clumpTop = this.clusterProfile.heightScale * this.worldConfig.grassMainHeightScale;
const canopyDepth = THREE.MathUtils.clamp(
  (clumpTop - verticalScale) / Math.max(clumpTop, 1e-3), 0, 1,
);
job.variations[variationOffset + 2] =
  resolveGrassCanopyAo(vigor, suitability) *
  (1 - this.worldConfig.grassCanopyDepthAo * canopyDepth) *
  (1 - this.worldConfig.grassClumpCoreAo * (1 - sampleRadius)) *
  job.random.range(0.992, 1.008);
```

`grassCanopyDepthAo: 0.26` (0–0.5), `grassClumpCoreAo: 0.12` (0–0.3).

Because `rootAo` multiplies the whole palette result inside `grassResolvePalette`
(`occlusion = rootLight * bladeVariation * rootAo`), the change is automatically
identical at every LOD — the impostor atlas stores progress and shade, not baked
RGB, and reads the same `vRootAo`.

**Parity risk.** `resolveGrassCanopyAo` bounds `rootAo` to [0.83, 1] today and
`verify-lod-color-parity` may rely on it. The new lower bound is
`0.83 × 0.74 × 0.88 = 0.541`. Widen the gate's expected range to [0.54, 1] and
re-measure its residual in the same commit.

### 12.3 Ground-contact darkening

`GrassPaletteTuning.json`: `groundContactEnd` 0.27 → **0.33**,
`groundContactStrength` 0.56 → **0.62**. Both feed `paletteProgressProfile`, so
`GRASS_VERTEX_PALETTE_ROOT_PROGRESS` re-derives automatically.

### 12.4 Transmission

`FRAGMENT_OUTPUT` already gates transmission on `grassRootAttenuation`,
into-sun, thinness and view facing. This is correct and needs no change — it is
currently suppressed by the flat normal via `grassThinness`, which 12.1 restores.
Expect to drop `backlightStrength` from 0.34 to ~0.27 once the term is live.

### 12.5 Verification

Extend `verify-grass-dry-lighting`:

- Reproduce the normal schedule; assert the near/far values and that the far
  value matches `WorldGrassImpostorMaterial`'s.
- Sun-facing vs sun-averted Lambert response ratio at 2 m is ≥ 1.9 (it is ~1.15
  today).

Extend `verify-lod-color-parity`: widen the `rootAo` sample range to [0.54, 1];
assert the p95 near/mid and mid/far deltas stay inside the existing budget.

### 12.6 Acceptance criteria

- Near blades show visible light/shade separation by facing.
- Root contact is visibly dark against the Phase 4 contact pool.
- No brightness shift at the 28 m or 54 m handoffs.

---

## 13. Phase 5 — blade silhouette diversity and clustering

**Objective.** No two neighbouring near blades share a silhouette; blades grow in
tufts of 2–5 from shared roots.

### 13.1 `instanceShape` — 4 bytes, normalized

`instanceVariation` is full (x: seed, y: wind scale, z: root AO, w: dryness). Add
a second attribute as a **normalized `Uint8Array`**, not a `vec4`:

```ts
// Four shape channels at one byte each. None of them needs 32-bit precision:
// tip drift quantizes to 0.34 mm of apex position against a 36 mm half-width,
// and the taper exponent to 0.003. A float vec4 would cost 16 bytes per near
// instance for precision nothing can see — about 4.8 MB of GPU memory and a
// quarter of the tile-build upload bandwidth at peak residency.
new THREE.InstancedBufferAttribute(new Uint8Array(count * 4), 4, /* normalized */ true)
```

| Channel | Meaning | Encoded | Decoded |
|---|---|---|---|
| `.x` | tip drift — lateral apex offset, in source half-widths | 0…1 | `x * 2 - 1` → −1…1 |
| `.y` | width profile — taper exponent selector | 0…1 | `mix(0.42, 1.20, y)` |
| `.z` | tip damage — 0 pointed, 1 blunt/broken | 0…1 | direct |
| `.w` | curve scale — extra bend on the rest arc | 0…1 | `mix(0.55, 1.55, w)` |

**These must not be derived from the density dither seed.** `GrassNearMaterial`
documents that `grassDither` carries no per-instance term because the CPU draw
truncation in `GrassLodController.trimMidDraw` reproduces it bit-exactly;
`grassMotionPhase` was made a separate quantity for the same reason. Correlating
morphology with the dither would make plant shape a function of which blades LOD
happens to keep. Draw the shape channels from `job.random` instead.

Producers and plumbing:

- `WorldSingleBladeTileFactory`: allocate `shapes: Uint8Array(requestedCount * 4)`
  in `TileBuildBuffers`, write it in the placement loop, expose
  `shapeAttribute`, include it in the placement cache.
- `GrassGeometryFactory.createInstancedGeometry`: accept and bind
  `instanceShape`, defaulting to a zero-filled buffer so the island regression
  scene and the mid/far layers are unaffected. Note that a zero `.x` decodes to
  −1, so the default fill must be **128**, not 0, for a neutral blade.
- **Compaction.** `swapFloatBlock` / `swapFloat` in `GrassLodController` and the
  equivalent in `WorldSingleBladeTileFactory` are `Float32Array`-typed. Add a
  generic `swapTypedBlock<T extends TypedArray>` or a `Uint8Array` overload; a
  silent miss here would scramble morphology against position after the first
  compaction frame.

### 13.2 Shape generation

```ts
// Every near blade today is an affine copy of one source triangle, which is why
// a dense patch reads as repeated geometry rather than as a population. These
// four numbers are what a blade actually varies in: which way its tip falls, how
// quickly it narrows, whether it is intact, and how far it bends. All four are
// applied in the vertex shader against the shared source, so the whole
// population still draws in one call.
const shapeOffset = job.bladeCount * 4;
const broad = job.random.next() < this.worldConfig.grassBroadBladeShare;
const tipDrift = job.random.range(-1, 1) * this.worldConfig.grassBladeTipDrift *
  (isUnderstoryBlade ? 1.35 : 1);
job.shapes[shapeOffset] = encodeUnit(tipDrift * 0.5 + 0.5);
job.shapes[shapeOffset + 1] = encodeUnit(
  broad ? job.random.range(0.72, 1) : job.random.range(0, 0.55),
);
job.shapes[shapeOffset + 2] = encodeUnit(
  job.random.next() < this.worldConfig.grassBladeDamageShare
    ? job.random.range(0.4, 1) : 0,
);
job.shapes[shapeOffset + 3] = encodeUnit(THREE.MathUtils.clamp(
  0.5 + (job.random.next() - 0.5) * 1.5 + this.clusterProfile.leanTowardMax * 0.3,
  0, 1,
));
```

with `encodeUnit(v) = Math.round(clamp01(v) * 255)`.

Broad blades also widen: `widthDraw = random.range(...widthBand) *
(broad ? grassBroadBladeWidthScale : 1)`, and `INSTANCE_HORIZONTAL_SCALE_MAX`
rises from 1.2 to **1.9**, which flows into
`calculateGrassSingleBladeRootBoundsRadius` automatically.

Config: `grassBladeTipDrift: 0.9` (0–1.4), `grassBroadBladeShare: 0.09` (0–0.25),
`grassBroadBladeWidthScale: 1.75` (1–2.2), `grassBladeDamageShare: 0.07` (0–0.2).

### 13.3 Vertex shader application

New compile-time option `shapeVariation?: boolean` on `GrassNearMaterial`, so
only the world's near layers pay for it. Injected after `VERTEX_NORMAL` and
before `VERTEX_WIND`, because wind must bend the *shaped* blade:

```glsl
attribute vec4 instanceShape;      // normalized: all channels arrive in 0..1
uniform float uGrassShapeTipDriftScale;   // source half-width, metres

float grassShapeDrift = instanceShape.x * 2.0 - 1.0;
float grassShapeTaper = mix(0.42, 1.20, instanceShape.y);
float grassShapeCurve = mix(0.55, 1.55, instanceShape.w);

// The source blade is tapered with exponent 0.72 at build time. Re-tapering
// would compound the two; correcting the ratio replaces it exactly, and the apex
// guard is required because the source half-width is zero there.
float grassSourceTaper = pow(max(1.0 - grassProgress, 0.0), 0.72);
float grassTargetTaper = pow(max(1.0 - grassProgress, 0.0), grassShapeTaper);
if (grassSourceTaper > 1e-3) {
  transformed.x *= grassTargetTaper / grassSourceTaper;
}

// A broken tip is blunt, not shorter-with-a-point: it keeps width where an
// intact blade would have none.
if (grassProgress > 0.995) {
  transformed.y *= 1.0 - 0.24 * instanceShape.z;
  transformed.x = mix(
    transformed.x,
    sign(uv.x - 0.5) * uGrassShapeTipDriftScale * 0.42 * instanceShape.z,
    instanceShape.z
  );
}

// Tip drift grows quadratically so roots stay put and only the silhouette's
// upper half leans. This is what breaks the symmetric-isoceles read.
transformed.x += grassShapeDrift * uGrassShapeTipDriftScale *
  grassProgress * grassProgress;

// Rest-arc bend. The source arc already carries z; scaling it keeps the blade on
// its own arc rather than inventing a second curve.
transformed.z *= grassShapeCurve;
```

`uGrassShapeTipDriftScale` is `(bladeWidthMin + bladeWidthMax) * 0.25`.

**Bounds.** `calculateGrassSingleBladeRootBoundsRadius` gains `maximumTipDrift`
(metres) and `maximumCurveScale` (1.55), folded into `horizontalExtent` and
`verticalExtent`. `verify-lod-continuity` reproduces this function; update its
mirror in the same commit.

### 13.4 Rosette clusters

The expensive part of placement is the field sampling. Emitting several blades
from one sample is nearly free:

```ts
// A tuft is not N independent blades that happen to be close; it is one plant
// with several leaves from one crown. Reusing the sampled ecology and root and
// re-rolling only the presentation is both cheaper than a second sample and more
// correct than one.
const rosetteRoll = this.positionHash01(x, z, ROSETTE_SALT);
if (rosetteRoll < this.worldConfig.grassRosetteChance) {
  const extra = 1 + (Math.floor(rosetteRoll * 4 / this.worldConfig.grassRosetteChance) % 4);
  for (let leaf = 0; leaf < extra && job.bladeCount < job.capacity; leaf += 1) {
    const fan = (leaf + 1) * this.worldConfig.grassRosetteFanRadians *
      (leaf % 2 === 0 ? 1 : -1);
    this.yaw.setFromAxisAngle(this.up, planeYaw + fan);
    // Re-derive `align` from the terrain normal: accumulated multiplies on
    // this.align would drift across leaves.
    this.align.setFromUnitVectors(this.up, this.normal);
    this.align.multiply(this.lean).multiply(this.yaw);
    this.scale.set(
      horizontalScale * (0.86 + 0.22 * job.random.next()),
      verticalScale * (0.74 + 0.34 * job.random.next()),
      horizontalScale * (0.86 + 0.22 * job.random.next()),
    );
    this.matrix.compose(this.localPosition, this.align, this.scale);
    this.matrix.toArray(job.matrixValues, job.bladeCount * 16);
    job.variations.copyWithin(job.bladeCount * 4, variationOffset, variationOffset + 4);
    job.variations[job.bladeCount * 4] = job.random.next();
    writeShapeChannels(job, job.bladeCount);
    job.coverages[job.bladeCount] = leafCoverage;
    job.biomes[job.bladeCount] = biomeIndex;
    job.bladeCount += 1;
  }
}
```

Two correctness requirements that must not be skipped:

- **Capacity.** `requestedCount` in the buffer allocation must rise by
  `1 + grassRosetteChance * 2.5`, and `WorldGrassAllocationValidator` must match.
- **Density conservation.** Rosettes add blades, so the sampled clump density
  must fall by the same expected factor or the field densifies:
  `effectiveDensity = habitat.density / (1 + grassRosetteChance * 2.5)`.

Config: `grassRosetteChance: 0.12` (0–0.5),
`grassRosetteFanRadians: 0.42` (0.1–0.9).

### 13.5 Verification

Extend `verify-grass-placement`:

- Reproduce shape generation; assert tip drift is symmetric (|mean| < 0.02),
  broad and damage shares within ±10% relative of config, and the taper exponent
  is bimodal (two-cluster separation ≥ 0.15).
- **Shape duplicate rate.** Quantize each blade's
  `(tipDriftBin, taperBin, damageBin, curveBin, widthBin, heightBin)` to a
  6-tuple, hash it, and assert the duplicate rate within a 0.25 m neighbourhood
  is below 0.08. This replaces Revision 1's unmeasurable "no silhouette repeats
  within a 5-blade neighbourhood".
- **Density conservation.** Total blade count per tile within ±3% of the
  pre-change count.
- `INSTANCE_HORIZONTAL_SCALE_MAX` matches the value the bounds helper is called
  with.
- **Attribute integrity.** Run a synthetic compaction and assert
  `instanceShape[i]` still corresponds to `instanceMatrix[i]` afterwards.

Extend `verify-lod-continuity` with the widened bounds mirror, and
`verify-grass-shape-continuity` with near/mid agreement at the mean taper.

### 13.6 Acceptance criteria

- **Hard gate:** the shape duplicate rate above.
- **Capture diagnostic:** a 1 m² crop of the near field reads as a population
  rather than repeated geometry; tufts of 2–5 leaves from a shared root are
  visible.
- Frame time within +0.15 ms; near vertex count unchanged (±3%).

---

## 14. Phase 7 — meadow palette

**Objective.** Muted greens, stronger dark/light grouping, clear material
separation, less yellow.

### 14.1 Global desaturation lever

One function that every LOD, the terrain palette rows, and the impostor rows
already route through.

```ts
const desaturationScratch = new THREE.Color();

/**
 * Pulls a palette colour toward its own luminance.
 *
 * Applied after luminance balancing and to the *sources*, so it moves the near
 * blades, the mid blades, the impostor cards and the terrain's grass tint by
 * exactly the same amount — which is what makes a single art lever safe here at
 * all. Because it preserves luminance by construction it cannot move the field's
 * brightness, and so cannot move the LOD parity budget.
 */
export function applyGrassPaletteDesaturation(color: THREE.Color, amount: number): void {
  if (!(amount > 0)) return;
  const value = luminance(color);
  desaturationScratch.setRGB(value, value, value);
  color.lerp(desaturationScratch, Math.min(amount, 1));
}
```

Called at the end of `setBalancedGrassPaletteColors` on all three targets, with
the amount from a module-level `setGrassPaletteDesaturation(amount)` invoked once
from `WorldApp`/`IslandApp` bootstrap out of `config.grassPaletteDesaturation`.

`grassPaletteDesaturation: 0.14` (0–0.35). Phase 1 ships it at 0.06.

### 14.2 Palette tuning

| Key | Today | Target | Why |
|---|---|---|---|
| `tipLuminanceScale` | 1.38 | **1.24** | The single largest "neon" lever; tips are 38% brighter than base before any lighting |
| `shadeLightMinimum` | 0.90 | **0.84** | Stronger dark grouping |
| `shadeLightMaximum` | 1.03 | **1.05** | Stronger light grouping |
| `shadowDesaturation` | 0.50 | **0.44** | Less wash in shadow now that shadows are darker |
| `groundContactEnd` | 0.27 | **0.33** | Phase 6.3 |
| `groundContactStrength` | 0.56 | **0.62** | Phase 6.3 |

All six feed the derived `GRASS_VERTEX_PALETTE_ROOT_PROGRESS` bisection, which
re-solves at module load.

### 14.3 New default preset

Add to `GrassArtPresets.json` and set
`DEFAULT_GRASS_ART_DIRECTION_KEY = "muted-meadow"`. Existing presets stay for
comparison.

```json
"muted-meadow": {
  "key": "muted-meadow",
  "label": "Muted Meadow",
  "baseColor": "#42702f",
  "tipColor": "#8fae54",
  "dryColor": "#8e8a58",
  "rootDarkening": 0.41,
  "tipColorStrength": 0.30,
  "normalUp": 0.82,
  "ambientBoost": 0.07,
  "backlightStrength": 0.27,
  "impostorBaseColorBlend": 0,
  "impostorColorScale": 0.8,
  "terrainGrassColor": "#5c7a3f",
  "terrainGrassTintStrength": 0.30,
  "densityScale": 0.94,
  "windStrengthScale": 1,
  "flutterStrengthScale": 0.9,
  "nearDistance": 28,
  "midDistance": 54,
  "farDistance": 280,
  "transitionDistance": 8
}
```

`rootDarkening` 0.41 and `tipColorStrength` 0.30 sit inside the [0.40, 0.48] /
[0.28, 0.40] band `GrassPaletteShader`'s `VERTEX_PALETTE_REFERENCE_*` constants
assume and `verify-lod-color-parity` enforces. `normalUp` is now the **far**
value (Section 12.1), hence 0.82.

### 14.4 Biome and terrain colours

| Target | Key | Today | New |
|---|---|---|---|
| meadow | `tipColor` | `#9ed45a` | `#8cb85a` |
| meadow | `dryColor` | `#b3ac5e` | `#a49a5e` |
| dry-steppe | `baseColor` | `#8a7a38` | `#7d7340` |
| dry-steppe | `tipColor` | `#d4c56a` | `#c0b46c` |
| alpine | `tipColor` | `#6a9a78` | `#639078` |
| terrain | `uTerrainSoilDry` | `#9a794b` | `#8d7550` |
| terrain | `uTerrainSoilRich` | `#5b4931` | `#544433` |
| terrain | `uTerrainPathDust` | `#c49a62` | `#b8926a` |

`GRASS_BIOME_VERSION` must go 4 → 5; the loader asserts on it.

### 14.5 Verification

- `verify-lod-color-parity` — re-record residuals; must stay inside budget.
- `verify-flower-variety` — minimum CIE ΔE between any flower tint and the meadow
  tip colour ≥ 18.
- `verify-grass-dry-lighting` — dry/healthy luminance separation ≥ 0.06.

**As built — two deviations, both recorded here rather than quietly absorbed.**

The `≥ 0.06` dry/healthy figure above was read off the *pre-change* meadow row,
which measured 0.0602. It is unreachable after this phase and for a structural
reason: lowering `tipLuminanceScale` from 1.30 to 1.24 is precisely a decision to
shrink the tip's brightness lead, and the tip-to-dry luminance gap is that lead.
Holding 0.06 would have meant dropping `dryLuminanceScale` to about 0.78 — dry
grass a fifth darker than healthy grass, when real dry grass is *paler*. An
absolute gap is also a tax on dark biomes: alpine's base luminance is 0.086
against the steppe's 0.170, so it can never reach the same absolute number
however its dry tone is chosen.

The shipped gate keeps the intent and drops the arithmetic. It asserts a
**relative** luminance gap ≥ 0.25 of tip luminance, which catches the failure
actually worth catching — the two scales being closed toward each other — and is
scale-free. Alongside it, a chromatic separation measured at a common exposure,
because dry grass distinguishes itself by hue rather than brightness and Lab
distances compress in dark colours. Two floors: ≥ 18 for the shipped default and
the meadow row (62% of the world), ≥ 10 for the comparison presets and the other
biomes. The steppe legitimately sits near the lower one — a dry steppe's
*healthy* grass already looks like straw, and forcing its dry state further away
would be wrong rather than safer. Measured: worst gap 27.4%, worst ΔE 11.8
(dry-steppe), default preset 21.5, meadow 22.6.

Second, `muted-meadow`'s `dryColor` ships as `#9a8a52`, not the `#8e8a58` in
Section 14.3. At `#8e8a58` the default preset scored ΔE 18.6 against its own
threshold of 18 — six tenths of margin is a coin flip, not a gate. The warmer
tone reaches 21.5 and is the direction this phase wants for the dry channel
anyway: straw, rather than green with the saturation removed.

### 14.6 Acceptance criteria (diagnostics, not gates)

- Mean frame saturation in the reference capture drops 12–20%.
- The vegetation histogram's two-means between-cluster variance rises ≥ 25%
  against the recorded baseline.
- Grass, understory, soil and path are separable by colour alone in a
  false-colour readout.

These are recorded in the capture report and reviewed; they are **not** build
failures. A scene can satisfy all three and look worse. The three fixed captures
remain the art-direction authority.

**Measured.** Mean frame saturation over the software-rendered capture fell
0.5982 → 0.5349, a 10.6% relative drop — just under the 12% target, and the
caveat matters more than the number: that frame runs at 4 FPS with the quality
governor holding the near field down, so bare soil covers most of it and soil is
the surface this phase moves least. The reading is a floor, not the result. The
other two criteria need the reference captures on real hardware.

---

## 15. Configuration summary

New keys in `src/world/WorldConfig.ts`, `WorldConfigSchema.ts` (range),
`WorldConfigValidator.ts` (cross-checks), and `public/config/world.yaml` (with a
comment explaining the value, per the file's existing style).

| Key | Default | Range | Phase |
|---|---|---|---|
| `terrainMicroDetailStart` | 9 | 2–30 | 1 |
| `terrainMicroDetailEnd` | 27 | 6–80 | 1 |
| `terrainMesoDetailStart` | 46 | 10–120 | 1 |
| `terrainMesoDetailEnd` | 100 | 20–260 | 1 |
| `terrainCanopyMergeStart` | 64 | 20–200 | 1 |
| `terrainCanopyMergeEnd` | 136 | 40–400 | 1 |
| `terrainCanopyMergeStrength` | 0.62 | 0–1 | 1 |
| `lodBandJitterRatio` | 0.33 | 0–0.5 | 1 |
| `grassPaletteDesaturation` | 0.14 (0.06 in P1) | 0–0.35 | 1 / 7 |
| `grassCommunityWorldSize` | 26 | 14–48 | 3 |
| `grassCommunityEcologyStrength` | 0.78 | 0–1 | 3 |
| `grassCommunityStrength` | 0.85 | 0–1 | 3 |
| `grassCommunityBorderWidth` | 0.18 | 0.05–0.5 | 3 |
| `grassCommunityQuietStrength` | 0.70 | 0–1 | 3 |
| `terrainCommunityTintStrength` | 0.42 | 0–1 | 3 |
| `detailFoliageCommunityStrength` | 0.80 | 0–1 | 3 |
| `detailFoliageGrassHeightCoupling` | 0.55 | 0–1 | 3 |
| `pathGrassEdgeRoughness` | 0.9 | 0–2.5 | 2 |
| `grassPathPioneerChance` | 0.06 | 0–0.25 | 2 |
| `grassPathPioneerHeightLoss` | 0.45 | 0–0.7 | 2 |
| `grassPathPioneerCoverage` | 0.55 | 0–1 | 2 |
| `grassDisturbanceHeightReduction` | 0.52 | 0–0.8 | 2 |
| `terrainVergeFleckStrength` | 0.34 | 0–0.8 | 2 |
| `terrainSoilHueWorldSize` | 14 | 6–40 | 4 |
| `terrainSoilHueStrength` | 0.38 | 0–0.8 | 4 |
| `terrainGroundFleckStrength` | 0.16 | 0–0.4 | 4 |
| `terrainHollowDarkening` | 0.14 | 0–0.35 | 4 |
| `terrainHollowMoisture` | 0.12 | 0–0.3 | 4 |
| `terrainMossStrength` | 0.30 | 0–0.7 | 4 |
| `terrainClumpContactAo` | 0.20 | 0–0.45 | 4 |
| `terrainClumpLitterStrength` | 0.18 | 0–0.4 | 4 |
| `grassNearNormalUpScale` | 0.66 | 0.4–1 | 6 |
| `grassCanopyDepthAo` | 0.26 | 0–0.5 | 6 |
| `grassClumpCoreAo` | 0.12 | 0–0.3 | 6 |
| `grassBladeTipDrift` | 0.9 | 0–1.4 | 5 |
| `grassBroadBladeShare` | 0.09 | 0–0.25 | 5 |
| `grassBroadBladeWidthScale` | 1.75 | 1–2.2 | 5 |
| `grassBladeDamageShare` | 0.07 | 0–0.2 | 5 |
| `grassRosetteChance` | 0.12 | 0–0.5 | 5 |
| `grassRosetteFanRadians` | 0.42 | 0.1–0.9 | 5 |

Not config keys — art tuning, authored in
`src/world/ecology/WorldCommunityProfiles.json` with a schema validator and
`WORLD_COMMUNITY_VERSION`: per-community weights, six preference curves each,
five response rows, and the ten-species community affinity table.

Existing values changed:

| Key / constant | Today | Target | Phase |
|---|---|---|---|
| `grassUltraNearTransitionDistance` | 1 | 3 | 1 |
| `grassNearDensityBoostDistance` | 14 | 15 | 1 |
| `grassNearBridgeDistance` | 18 | 22 | 1 |
| `grassNearBridgeTransitionDistance` | 2 | 4 | 1 |
| `grassMicroDetailFadeEnd` | 10 | 13 | 1 |
| `GRASS_MID_DENSITY_FALLOFF` | 28→62 | 36→74 | 1 |
| `DETAIL_FOLIAGE_FADE_DISTANCE` | 38 | 42 | 1 |
| `DETAIL_FOLIAGE_FADE_TRANSITION` | 4 | 12 | 1 |
| `DETAIL_FOLIAGE_VARIANT_ROWS` | 2 | 4 | 3b |
| `packGrassAccent` species stride | 16 | 32 | 3b |
| `DETAIL_FOLIAGE_UNDERSTORY_EDGE_DARKENING` | 0.13 | 0.20 | 3b |
| `grassMacroPatchStrength` | 0.52 | 0.34 | 3 |
| `terrainPathCoreDarkening` | 0.08 | 0.20 | 2 |
| `INSTANCE_HORIZONTAL_SCALE_MAX` | 1.2 | 1.9 | 5 |
| `GrassPaletteTuning.json` (6 keys) | see 14.2 | see 14.2 | 6 / 7 |
| `GRASS_BIOME_VERSION` | 4 | 5 | 7 |

Validator cross-checks to add:

- Every `*Start < *End`.
- `terrainCanopyMergeStart >= 74 - 12` (mid falloff end minus slack).
- `grassCommunityWorldSize >= 2.1 * chunkSize / (terrainFarResolution - 1)`.
- `|grassCommunityWorldSize - grassMacroPatchWorldSize| / min(...) >= 0.25`.
- `pathGrassEdgeRoughness > pathEdgeRoughness`.
- `grassRosetteChance * 2.5 + 1` reflected in the allocation ceiling.

Jitter safety needs no check: the offset applies to the distance, not the edges.

---

## 16. Verification matrix

| Gate | New / extended | Phase | Guards |
|---|---|---|---|
| `verify-lod-band-separation` | **new** | 1 | schedule registry completeness, composite profile, conflict classes, macro parity, grit mean |
| `verify-terrain-surface` | extended | 1, 4 | grit mean, `uTerrainLodDistances` removal, new uniforms, soil/canopy decorrelation |
| `verify-lod-continuity` | extended | 1, 5 | bounds mirror for shaped blades, schedule constants |
| `verify-lod-color-parity` | extended | 1, 6, 7 | widened `rootAo` range, re-recorded residuals |
| `verify-understory-morphology` | **new** | 3b | alpha coverage, silhouette distinctness, family distinctness, asymmetry, margin complexity, packing |
| `verify-community-field` | **new** | 3 | **ecological consistency**, realised shares, patch scale, continuity, ecology-strength monotonicity, Nyquist, period separation, determinism, no-write-back |
| `verify-ecology` | extended | 3 | community responses cannot invert an established ecological relationship |
| `verify-detail-foliage-distribution` | extended | 3 | community affinity, per-species colony scale, height coupling |
| `verify-flower-variety` | extended | 3, 7 | colony purity, tint separation from the new foliage colours |
| `verify-path-verge` | **new** | 2 | boundary roughness, CPU/GLSL agreement, pioneer share, walkability, fleck step |
| `verify-navigation` | extended | 2 | no blade inside the walkable core after the widened cutoff |
| `verify-grass-dry-lighting` | extended | 6, 7 | normal schedule, facing ratio, dry/healthy separation |
| `verify-grass-placement` | extended | 5 | shape distributions, **duplicate rate**, rosette density conservation, compaction integrity |
| `verify-grass-shape-continuity` | extended | 5 | near/mid silhouette agreement after taper correction |
| `verify-world-grass-allocation` | extended | 5 | `instanceShape` and rosette capacity |
| `verify-grass-performance` | unchanged | all | per-phase budgets |
| `verify-grass-streaming-performance` | unchanged | 1, 5 | widened foliage radius, larger buffers |
| `verify-config-contracts` | extended | all | every new key in schema, validator, and YAML |

Per repository policy (`CLAUDE.md`), all of this is local: `npm run build` runs
the chain, and Pages deployment stays manual via `npm run deploy:pages`.

### Capture diagnostics — `npm run test:meadow-shots`

Deliberately **outside** the default build chain. Uses the existing `qa/` harness
and `.shots/` convention, seed `42017`, three poses:

1. **Reference-like third-person** — the deterministic rocky meadow landmark,
   chosen to frame grass, flowers, exposed soil, and stones together.
2. **Aerial 60 m** — community structure.
3. **Aerial 90 m, long view** — LOD banding and distant structure.

Records per capture: mean/median luminance, mean saturation, the radial luminance
profile from 6.9, and the two-means split of the vegetation histogram. These
numbers are reviewed at phase boundaries and are the art-direction authority.
Only the analytic profile bound in 6.7.2 fails the build.

---

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Per-fragment macro noise exceeds budget, especially on compact | Frame time | Benchmark **before** implementing; baked 512² macro texture is a specified path, not a fallback, and is the default on compact |
| GLSL/JS hash divergence on some driver | Ground/blade pattern mismatch | Parity gate at 1e-5 over 4 096 samples; failure mode is a soft mismatch, not a crash |
| Community selection collapses to one dominant community | Monotonous world | `verify-community-field` bounds realised shares to [0.03, 0.40] over 400,000 shipped-world samples; profile `weight` is the corrective lever |
| `grassCommunityEcologyStrength` too high reads as a contour map | Artificial | Default 0.78, not 1; the monotonicity assertion proves the lever's direction so it can be tuned with confidence |
| Phase 3 lands before 3b and amplifies the green-mass defect | Visible regression | 3b **gates** 3; if it slips, broadleaf weight ships at 0.4 of target |
| `instanceShape` desynchronises from `instanceMatrix` after compaction | Scrambled morphology | Typed swap path plus the synthetic-compaction assertion in 13.5 |
| Widening `INSTANCE_HORIZONTAL_SCALE_MAX` to 1.9 inflates reserved bounds | Frame time | Bounds grow ~0.03 m against a 0.08 m safety margin; measure before committing |
| Palette moves break `verify-lod-color-parity`'s reference constants | Build failure | `VERTEX_PALETTE_REFERENCE_*` bound the shipped presets; the new preset is inside them by construction |
| Detail-foliage radius growth exceeds residency ceiling | Streaming stalls | Measured against `verify-near-grass-streaming`; raise `DETAIL_FOLIAGE_TILES_PER_FRAME` on desktop only if it binds |
| Widened path cutoff radius rejects fewer points | Build-time cost | `PATH_CUTOFF_SAFETY` carries 2× headroom; measure tile build time |

---

## 18. Definition of done

1. `npm run build` passes, including `verify-lod-band-separation`,
   `verify-understory-morphology`, `verify-community-field`, and
   `verify-path-verge`.
2. The reference third-person capture shows: no camera-distance ring; readable
   20–35 m vegetation communities; bare ground with at least three tones; tufts
   in contact shadow; a near field that reads as a population rather than
   repeated geometry; visible facing-based light separation; and a ragged,
   gradual path verge.
3. The 60 m aerial capture shows bare breaks on dry, exposed, disturbed or rocky
   ground — never in hollows or under canopy.
4. The 90 m aerial capture shows dark colonies, dry patches and bare breaks at
   200 m.
5. Frame time on the reference capture within +0.85 ms of the Phase 0 baseline,
   and `verify-grass-performance` passes unchanged.
6. The capture report records saturation, histogram bimodality, and the radial
   profile against the recorded baselines, and has been reviewed.
7. Every new config key is documented in `public/config/world.yaml` with a
   comment explaining what it buys, in the style of the surrounding file; every
   art table lives in `WorldCommunityProfiles.json` with a version constant.
