# AAA World Visual Upgrade Execution Plan

Status: planned
Baseline date: 2026-08-20
Baseline branch: `main`
Baseline commit checked before writing: `2b92dc829383f7ff343c9501da6c938943931b65`

Companion documents:

- [aaa-look-audit.md](aaa-look-audit.md)
- [aaa-grass-execution-plan.md](aaa-grass-execution-plan.md)
- [tiny-glade-detail-foliage-plan.md](tiny-glade-detail-foliage-plan.md)
- [waterfall-gorge-geology-plan.md](waterfall-gorge-geology-plan.md)
- [aaa-cloud-shadow-system-plan.md](aaa-cloud-shadow-system-plan.md)

## 1. Purpose

The current world is technically much more advanced than the frame suggests. The
2026-08-20 third-person meadow capture still reads as a good stylized prototype:
foreground grass separates too clearly from the soil, some dry blades become
nearly white, the meadow loses structure with distance, the road looks laid over
the terrain, distant mountains flatten into pastel silhouettes, and the character
still needs stronger grounding in the vegetation.

This plan is the execution delta needed to make the systems that already exist
**read** as one coherent AAA-style landscape. It is deliberately not a rewrite of
grass, ecology, terrain, clouds, stones, or LOD.

The central visual rule is:

```text
terrain shape
  -> hydrology
  -> soil / moisture / exposure / disturbance / rockiness
  -> vegetation community
  -> species and maturity
  -> geometry + material representation
  -> LOD representation
```

A convincing procedural world comes primarily from correlation. A wet hollow
must simultaneously affect soil value, grass height, dry-blade frequency,
flower families, stone exposure, and haze. A worn path must affect the terrain,
vegetation, litter, and stones together. Independent random decoration is not an
acceptable substitute.

## 2. Existing systems that must be reused

Before implementing any phase, preserve these current architectural decisions.
The earlier AAA audit already established that many generic recommendations are
implemented and should not be rebuilt.

### 2.1 Shared ecology is already the source of truth

`src/world/ecology/WorldEcologyField.ts` already derives:

- `moisture`
- `fertility`
- `exposure`
- `disturbance`
- `rockiness`

from landform, hydrology, path traffic, and the world sun. It is deterministic,
world-space, allocation-free in its hot path, and shared by visible systems.
Do not create another noise-based ecology object beside it.

### 2.2 Grass habitat already maps ecology to visible grass causes

`src/world/grass/GrassHabitatField.ts` already produces:

- density
- height
- dryness
- clump scale
- underlayer
- directional lean
- accent chance

It also resolves stable tuft archetypes for dense, sparse, wet, dry, flattened,
and accent clumps. Any additional grass behavior in this plan should first be
expressed as a small extension of this mapping or as tuning of existing outputs.

### 2.3 Terrain already receives semantic grass/ecology channels

`src/world/terrain/TerrainSurfaceField.ts` already forwards habitat and biome
semantics to terrain shading. Current packed attributes include suitability,
vigor, dryness, biome density, altitude, humidity, water proximity, stone
clearance, and biome blend.

The first implementation choice for ground/grass integration must therefore be
to make better use of those channels. Add another vertex attribute only when a
visual requirement cannot be reconstructed from the current semantic data.

### 2.4 Detail foliage is already colony-based

`src/world/grass/WorldDetailFoliageDistribution.ts` already has continuous macro
colonies and smaller clump fields, plus coherent family, tint, and maturity
channels. The flower work below is an enhancement of that system, not a new
scatterer.

### 2.5 Grass shading features already exist

The existing grass stack already includes curved/tapered blades, root darkening,
backlight/transmission, multiple LOD representations, macro variation, character
bending, a persistent trail map, and an analytic grass-ground shadow. The issue
is the rendered balance and cross-system coherence, not a missing checkbox.

### 2.6 The current atmosphere has one known structural limitation

`WorldEnvironmentController` currently applies a single-color `THREE.FogExp2`.
`docs/plans/aaa-look-audit.md` already identified sky-matched aerial perspective
as the largest remaining atmosphere gap. `WorldHorizonMaterial` is currently a
cheap `MeshLambertMaterial` with coverage/sink patches but no dedicated
height-aware atmospheric response.

This is where the mountain-depth work should land.

### 2.7 Current cloud lighting is global, not spatial

`WorldCloudEnvironmentLighting` samples one cloud transmittance value projected
from the current focus toward the cloud layer, smooths it, and multiplies the
single directional-light intensity by that value. The visible cloud stack shares
a procedural field, but the ground currently does not receive a world-space
projected cloud-shadow field.

This distinction is important for the latest screenshots: the configured desktop
cloud-light floor is `0.86`, so that path cannot by itself explain a near-black
terrain region. Diagnose any black region before tuning cloud shadow strength.
The dedicated code-level execution plan is
[aaa-cloud-shadow-system-plan.md](aaa-cloud-shadow-system-plan.md).

### 2.8 Current quality/performance assumptions

The screenshot showed roughly 79 FPS, but that number is only a visual-session
observation, not a benchmark. Every phase must take a fresh baseline on the same
machine, resolution, browser, pose, runtime profile, and settled-camera period.
Never spend the apparent headroom without measurement.

## 3. Non-negotiable engineering rules

1. **Do not replace a system that already solves the problem structurally.** Tune
   or extend it.
2. **World-space determinism stays intact.** Camera movement must never move a
   biological patch or change a species identity.
3. **Art-facing tuning belongs in YAML/config.** Technical invariants and hard
   safety limits may remain in focused TypeScript tuning modules.
4. **No per-frame heap allocation in grass, terrain, horizon, ecology, or scenic
   streaming loops.** Reuse samples and vectors.
5. **No new texture fetch in the highest-overdraw grass fragment path unless a
   measured quality gain justifies it.** Prefer vertex work and existing
   attributes.
6. **Do not increase blade count to hide material or distribution defects.**
   Current density is already high enough.
7. **Do not add a draw call per species, clump type, or visual variant.** Use
   existing atlases, packed attributes, instance variation, or shader branches
   that are coherent enough to remain cheap.
8. **Desktop and compact profiles are both first-class.** Compact may simplify
   secondary layers but must keep the same macro ecological identity.
9. **No GitHub Actions.** Verification is local with the existing scripts.
10. **Deployment remains manual.** `npm run deploy:pages` only after a clean
    local build and visual sign-off.
11. **Keep commits narrow.** Each phase should be independently reviewable and
    revertible.
12. **Before every implementation tranche, fetch/check `main` again.** Do not
    overwrite a newer commit or blindly apply a stale file replacement.
13. **Cloud shadows must attenuate direct sun, never final surface color.** Sky,
    hemisphere, fog, and material color must remain present under cloud.

## 4. Visual target for the current frame

The frame should pass all of these statements from the same third-person meadow
pose:

- Foreground grass reads as tufts and plant communities, not a pile of crossed
  cards.
- Dry grass reads as muted straw/olive vegetation, never chalk-white or
  emissive.
- Soil visually continues into the grass roots instead of appearing as a flat
  plane beneath independent blades.
- Wet/fertile and dry/exposed areas are readable from a stationary camera
  without opening a debug view.
- Flower groups read as colonies with related plants around them.
- The path has a compacted core, irregular verge, and vegetation response rather
  than one uniformly colored ribbon.
- Near, mid, far, impostor, and terrain representations preserve the same macro
  clumps and color families.
- Distant mountain faces retain enough internal structure to read as terrain,
  while atmosphere progressively pushes them toward the sky color.
- Valleys carry more haze than exposed high ridges.
- The sun direction is readable from grass and terrain without crushing the
  shadows.
- Cloud shadows are broad, soft, world-anchored reductions of direct sunlight,
  never black overlays or camera-relative masks.
- Visible cloud bodies and ground modulation feel like one weather system.
- The character's feet, lower legs, and cape feel embedded in the meadow rather
  than composited over it.
- Added scenic structure creates rhythm and scale while preserving large areas
  of visual quiet.

## 5. Phase 0 - Establish a hard visual and performance baseline

Do this before changing art tuning. A visual pass without a reproducible
baseline will oscillate between unrelated improvements.

### 5.1 Add a canonical capture pose

Use the existing visual-matrix infrastructure in:

- `src/qa/WorldVisualMatrixLocations.ts`
- `src/qa/WorldVisualMatrixPoses.ts`
- `src/qa/WorldVisualMatrixRunner.ts`
- `scripts/capture-visual-matrix-poses.mjs`

Add a named pose matching the current third-person meadow composition as closely
as possible. It should include:

- character in frame
- near grass inside 0-6 m
- bridge/near grass around 6-28 m
- mid/far meadow
- a visible path
- a distant ridge/mountain skyline
- enough sky to judge atmospheric convergence

Do not use a random manually selected camera each iteration.

### 5.2 Capture a small but representative matrix

At minimum capture:

1. hero meadow / third-person
2. dry exposed meadow
3. wet or river-adjacent meadow
4. path crossing
5. elevated mountain-facing view
6. compact-profile hero meadow
7. the current cloud/black-region regression pose

Reuse existing poses when they already cover one of these cases.

### 5.3 Record performance before the first visual edit

For each hero profile record after warmup:

- average FPS
- p95 frame time if available
- CPU world-update time if available
- GPU frame time if available
- draw calls
- triangles
- visible/streamed grass counts
- horizon build state

The plan uses relative performance gates; it does not assume the screenshot's
79 FPS is repeatable.

### 5.4 Add debug evidence only where it shortens iteration

Prefer existing debug/HUD plumbing. Useful temporary or permanent overlays are:

- ecology moisture
- fertility
- exposure
- disturbance
- rockiness
- grass habitat dryness/density/height
- detail foliage colony/core
- LOD representation band
- atmospheric fog factor
- cloud weather amount
- focus cloud direct transmittance
- cloud shadow transmittance map once implemented
- directional shadow-map contribution for black-region diagnosis

A debug overlay should visualize an existing field. It must not become a second
implementation of that field.

### 5.5 Phase 0 exit gate

Do not start Phase 1 until:

- the hero pose is reproducible
- the capture process is deterministic enough for side-by-side comparison
- the baseline performance numbers are saved
- visual defects can be pointed to in a fixed image instead of remembered from
  play

The cloud-shadow diagnostic can run as part of this baseline work; do not wait
until Phase 10 to identify the source of a near-black ground patch.

## 6. Phase 1 - Foreground grass: remove the synthetic-card look

This is the highest-value pass for the current screenshot.

### 6.1 Diagnose the near-white dry grass before tuning blindly

Relevant files:

- `public/config/grass.yaml`
- `public/config/world.yaml`
- `src/grass/materials/GrassNearMaterial.ts`
- `src/grass/materials/GrassPaletteShader.ts`
- `src/grass/materials/GrassPaletteTuning.json`
- `src/grass/GrassFieldVariation.ts`
- `src/world/grass/GrassHabitatField.ts`

Current config already has a green `dryColor` and `grassDryColorStrength: 0.64`.
Therefore a nearly white patch should first be treated as a pipeline/weighting
problem, not solved by choosing an arbitrarily darker hex.

Execution:

1. Capture the pale patch and sample the final rendered color of representative
   blades.
2. Capture the same pose with dryness visualized.
3. Trace the final grass color terms in order: biome palette -> macro dryness ->
   root/tip interpolation -> lighting -> transmission -> tone mapping.
4. Verify the pale result is not coming from excessive transmission or a tip
   light term applied to dry blades.
5. Verify the dry palette in `GrassPaletteTuning.json` agrees with the base
   `grass.yaml` palette and biome profiles.
6. Fix the earliest incorrect term rather than adding a final color clamp.
7. Only then retune dry hues toward muted straw/olive if needed.

Avoid an RGB/luminance clamp in shader code. That hides the cause and breaks HDR
lighting behavior.

### 6.2 Increase silhouette diversity without increasing blade population

The world already has six stable cluster archetypes. Make the close field show
those differences more clearly.

Execution order:

1. Audit archetype frequency in the hero habitat.
2. Verify `GRASS_CLUSTER_SHORT_DRY`, `TALL_WET`, `SPARSE_OPEN`, and
   `FLATTENED` actually produce visibly different height/lean/width/radius
   signatures.
3. Reuse current blade geometry variants before adding any new geometry.
4. If four geometry variants are insufficient, add at most one or two additional
   shape variants to the existing shared geometry/atlas path, not a new mesh
   family.
5. Bias shape selection by stable archetype identity rather than independent
   per-blade random values.
6. Keep variation strongest at clump scale and weaker inside a clump.

Desired near-field composition:

- short base leaves fill the bottom silhouette
- medium leaves form most of the mass
- a minority of taller blades break the skyline
- flattened/disturbed patches lean coherently
- dry communities are shorter and more open on average
- wet communities are denser and slightly taller

### 6.3 Reduce the crossed-card impression

The screenshot shows many long blades intersecting at visually unrelated angles.
Do not solve this by making every blade face the camera.

Use this hierarchy:

```text
world wind direction
  + habitat directional lean
  + clump dominant heading
  + small radial variation
  + small per-blade noise
```

The dominant heading should be visually stronger than the independent random
term. Existing config keys such as `grassClumpDominantDirectionWeight` and
`grassClumpRadialDirectionWeight` are the first tuning surface.

### 6.4 Strengthen the root/body hierarchy

The bottom 10-25% of a tuft should be darker, denser, and visually quieter than
its tips. Existing `rootDarkening` and underlayer behavior should be tuned before
adding new shading logic.

Check specifically:

- exposed bright roots against brown soil
- root darkening disappearing under direct sun
- underlayer becoming a uniform dark disc
- different LODs disagreeing about root value

### 6.5 Phase 1 acceptance

- No large near-white dry-grass island in the hero frame unless the biome is
  explicitly intended to contain pale dead vegetation.
- Three or more tuft silhouettes are recognizable within the first 10 m.
- Dense areas read as masses with individual tips, not independent needles.
- Disturbed/flattened areas share a coherent lean direction.
- No blade-count increase is required to achieve the improvement.

## 7. Phase 2 - Make terrain and vegetation read as one surface

The architecture already sends common semantics to the terrain shader. The goal
is to make those correlations visible at gameplay distance.

Relevant files:

- `src/world/terrain/TerrainSurfaceField.ts`
- `src/world/TerrainMaterialShader.ts`
- `src/world/terrain/TerrainSurfacePalette.ts`
- `src/world/terrain/TerrainSurfaceNoiseTexture.ts`
- `src/world/ecology/WorldEcologyField.ts`
- `src/world/grass/GrassHabitatField.ts`
- `public/config/world.yaml`

### 7.1 Define the terrain response from ecological causes

Use the existing packed channels first.

Target responses:

| Cause | Terrain response | Vegetation response |
| --- | --- | --- |
| high moisture + fertility | slightly darker, richer soil; softer micro contrast | denser/taller green grass, more understory |
| dry + exposed | warmer/more olive ground; more visible soil | shorter/open grass, more dry material |
| high rockiness | cooler/mineral surface breakup | lower density, more exposed stones |
| high disturbance | compacted/darker core with dry verge | reduced height/density, directional flattening |
| dense canopy | darker root-zone/under-canopy value | stronger tuft body, fewer visible bare gaps |

The response must be subtle per pixel but strong across a 5-30 m patch.

### 7.2 Root-zone integration

Add/tune a ground darkening term driven by the same habitat density and canopy
signal already used for grass. The goal is not a fake circular blob below every
tuft. It is a low-frequency reduction in exposed bright soil where dense grass
would naturally shade and retain moisture.

Prefer:

```text
rootZone = habitatDensity * (1 - disturbance) * canopyMacroSignal
```

Then combine it with existing ground meso/micro detail. Do not sample individual
blade positions in the terrain shader.

### 7.3 Exposed soil must gain material structure when grass opens

When habitat density falls, the ground becomes more visible, so its own visual
quality has to increase.

Use the existing terrain surface noise path to vary:

- soil value
- rough mineral specks
- fine dry litter tint
- normal strength

All detail must fade with distance using existing LOD/micro-detail ranges. Avoid
adding a high-frequency texture fetch that survives into the far field.

### 7.4 Do not duplicate fertility unless it is genuinely required

`TerrainSurfaceField` does not currently pack fertility directly. First test
whether density, dryness, humidity, suitability, and biome are sufficient to
produce the desired ground relation.

Only if a necessary visual distinction cannot be expressed should the terrain
semantic packing be changed. If it is changed:

1. document the channel contract next to `TerrainSurfaceTargets`
2. update all producers/consumers together
3. add a verifier for attribute order/range
4. keep one semantic field shared across all terrain LODs

### 7.5 Phase 2 acceptance

- Bare soil is most visible exactly where habitat predicts sparse vegetation.
- Dense grass no longer appears to float over a uniformly bright plane.
- Wet and dry patches remain visible after grass geometry is temporarily hidden.
- Re-enabling grass makes the same patches stronger rather than contradictory.
- Terrain shader cost is measured before and after; no unnecessary texture fetch
  is introduced.

## 8. Phase 3 - Grass lighting: directional shape, transmission, and contact

Transmission is already implemented. This phase makes it readable without
turning pale grass into glowing grass.

Relevant files:

- `src/grass/materials/GrassNearMaterial.ts`
- `src/world/grass/WorldGrassImpostorMaterial.ts`
- `src/world/grass/WorldDetailFoliageMaterial.ts`
- `src/grass/materials/GrassPaletteShader.ts`
- `src/app/WorldEnvironmentController.ts`
- `src/app/WorldEnvironmentTuning.ts`
- `src/grass/interaction/GrassGroundShadow.ts`

### 8.1 Separate three lighting ideas

Do not use one multiplier for all brightening.

1. **Diffuse leaf light** - normal directional response.
2. **Backlight/transmission** - light traveling through a thin blade, strongest
   on backlit tips and reduced in dense/root regions.
3. **Ambient/sky fill** - cool soft contribution preventing crushed shadows.

If the pale-right patch is caused by transmission, reduce transmission there by
blade dryness/thickness rather than globally deleting the effect.

### 8.2 Use a stable transmission response

Conceptual response:

```text
backFacing = saturate(dot(-lightDirection, leafNormal))
transmission = pow(backFacing, exponent)
             * transmissionStrength
             * thinness
             * tipWeight
             * aliveWeight
```

`aliveWeight` can be derived from dryness so dead/dry blades do not become
white lanterns. Keep this calculation ALU-only and reuse current uniforms.

### 8.3 Preserve LOD lighting parity

Any material-level change must be carried through:

- near blades
- bridge/mid grass
- far/impostor grass
- detail foliage where it shares the grass palette

Do not make the near field beautiful if it creates a brightness ring at the
first LOD transition.

### 8.4 Keep contact shadow analytic

The existing analytic `GrassGroundShadow` is the correct approach for the
character. Do not turn on full shadow-map receipt for millions of grass
fragments.

Later scenic occluders may use a small bounded analytic set, but that is a
separate phase and must be profiled.

### 8.5 Move art-facing environment tuning to config before major iteration

Sun/hemisphere/fog/exposure values are currently centralized in
`WorldEnvironmentTuning.ts`. If this phase requires repeated artistic tuning,
add validated world-config values rather than proliferating new hard-coded
numbers.

Technical safety values such as shadow-camera constraints may remain constants.

### 8.6 Phase 3 acceptance

- Sun direction can be inferred from the meadow without looking at the sky.
- Backlit green tips gain life but do not wash to white.
- Dry blades remain materially dry under backlight.
- Shadow-side grass remains readable from sky fill.
- No visible LOD brightness ring appears while moving the camera through each
  transition.

## 9. Phase 4 - Build a real vegetation hierarchy using existing renderers

The world needs vertical layers, but not a renderer per layer.

Target hierarchy:

```text
L0  soil / moss / micro ground signal
L1  short undergrowth and tiny leaves
L2  main grass body
L3  tall grass / seed heads
L4  flowers and weeds
L5  sparse shrubs
L6  trees / large rocks / strong scenic anchors
```

Relevant files:

- `src/world/grass/WorldDetailFoliageField.ts`
- `src/world/grass/WorldDetailFoliageDistribution.ts`
- `src/world/grass/WorldDetailFoliageAtlasFactory.ts`
- `src/world/grass/DetailFoliageAffinity.ts`
- `src/world/grass/DetailFoliageTuning.ts`
- `src/world/scenic/WorldScenicLayer.ts`
- `src/world/scenic/WorldTreeField.ts`
- `src/world/scenic/WorldTreeSystem.ts`
- `src/world/stones/WorldStoneSystem.ts`

### 9.1 Reuse the detail-foliage atlas for L1-L4

Add diversity by atlas family/phenotype, not by draw call. Candidate families:

- low broadleaf groundcover
- small grass-like undergrowth
- dry seed head
- thin weed
- flower family variants
- sparse dead/litter accent

Each family needs an ecological affinity, not a flat probability.

### 9.2 Community selection

A community should be selected from existing ecology and colony fields.
Conceptually:

```text
communityWeight = colonyCore
                * habitatSuitability
                * familyEcologyAffinity
                * maturityResponse
```

Examples:

- wet fertile core -> broadleaf + taller green grass + flowers
- dry exposed shoulder -> short grass + seed heads + visible soil
- disturbed path verge -> flattened grass + weeds + occasional flowers
- rocky fringe -> sparse hardy plants + stone exposure

### 9.3 Shrubs must remain rare

Before creating a dedicated shrub system, test whether the existing tree/scenic
instancing can support one or two low shrub archetypes. A new renderer is only
justified if:

- shrubs need a materially different LOD path
- the existing scenic batches cannot preserve culling/performance
- the visual gain is visible in the hero frame

The default composition must retain large quiet meadow areas.

### 9.4 Phase 4 acceptance

- At least three vertical vegetation levels are readable in the first 25 m.
- The same ecology patch produces a coherent family mix.
- Sparse/dry ground gains detail without looking decorated.
- No repeated checker/grid pattern appears from colony or clump cells.
- No species adds a separate draw call solely for color/shape variation.

## 10. Phase 5 - Flower colonies that look biological

The existing detail-foliage distribution already has exactly the right macro
structure: colony, clump, family, tint, and maturity. Improve how flowers use it.

### 10.1 Replace isolated visual singles with colony composition

A visible flower should usually imply nearby related plants, but not necessarily
nearby blossoms.

Within a colony:

- dominant family stays coherent
- some members are leaf-only
- some are immature
- some are flowering
- a small number are senescent/dry
- heights vary around a family-specific mean
- edge members are fewer/smaller than core members

### 10.2 Ecology affects family and flowering state

Use `DetailFoliageAffinity` to weight families by:

- moisture
- fertility/habitat density proxy
- disturbance
- rock fringe
- path fringe

Do not directly choose species from random numbers and then merely tint them.

### 10.3 Tune existing config before adding knobs

Current config already includes:

- `detailFoliageColonyWorldSize`
- `detailFoliageClumpWorldSize`
- `detailFoliageColonyStrength`
- `detailFoliageDominantFamilyShare`
- `detailFoliageTintCoherence`
- `detailFoliageMaturePhenotypeBias`
- `detailFoliageEcologyStrength`
- `detailFoliageEdgeCompanionStrength`
- `detailFoliageStoneFringeStrength`
- `detailFoliagePathFringeStrength`

Use those first. Add a config key only when the existing controls cannot express
a required art direction.

### 10.4 Phase 5 acceptance

- Flowers are not evenly distributed across the meadow.
- A flower group contains related non-flowering companions.
- Neighboring colonies can differ in family while each colony stays coherent.
- Flower density drops naturally in hostile dry/rocky/disturbed ground.
- `npm run test:flower-variety` and `npm run test:detail-foliage` stay green.

## 11. Phase 6 - Integrate the road/path into ecology and terrain

The path already feeds `WorldEcologyField` through `pathGrassMask`, which becomes
`disturbance = 1 - pathGrassMask`. Use this existing causal signal.

Relevant files:

- path sampling code used by terrain generation
- `src/world/ecology/WorldEcologyField.ts`
- `src/world/grass/GrassHabitatField.ts`
- `src/world/terrain/TerrainSurfaceField.ts`
- `src/world/TerrainMaterialShader.ts`
- `src/world/stones/StonePathPlacement.ts`
- `public/config/world.yaml`

### 11.1 Derive path bands from one continuous mask

Do not add separate random masks for core and edge. Derive bands from the
existing path signal:

```text
core       = high disturbance
shoulder   = mid disturbance
outerVerge = low non-zero disturbance
```

Then use the same bands for terrain and vegetation.

### 11.2 Compacted core

Core behavior:

- strongest grass suppression
- short flattened survivors rather than a perfectly empty strip everywhere
- slightly darker/compacted soil
- lower micro-normal amplitude than loose soil
- sparse embedded small stones

### 11.3 Irregular verge

Verge behavior:

- grass invades locally
- dry/flattened grass increases
- weed/flower fringe gets a small affinity boost only where ecology allows it
- path stones use existing verge placement rather than a decorative border
- width variation comes from the existing rough path field, not independent
  noise in each renderer

### 11.4 Optional shallow geometry depression comes last

Only after material/vegetation integration is convincing, test a very small
path-bed displacement from the same path mask. It is optional because geometry
modification can create:

- terrain-LOD mismatches
- water/drainage artifacts
- navigation assumptions
- character foot-contact offsets

If material plus vegetation already sells compaction, keep geometry unchanged.
KISS wins.

### 11.5 Phase 6 acceptance

- The road no longer looks painted over the meadow.
- The core, shoulder, and verge are readable but not outlined.
- Grass crosses the visual edge irregularly.
- Stones near the path look displaced by use, not placed as edging.
- Path changes remain deterministic at chunk boundaries and across LODs.

## 12. Phase 7 - Give distant mountains geological structure cheaply

The current horizon shell is intentionally cheap. Preserve that property.
Do not solve distant terrain with expensive displacement or fragment textures.

Relevant files:

- `src/world/horizon/WorldHorizonGrid.ts`
- `src/world/horizon/WorldHorizonShell.ts`
- `src/world/horizon/WorldHorizonMaterial.ts`
- `src/world/horizon/WorldHorizonTuning.ts`
- `src/world/ecology/TerrainLandformField.ts`
- `src/world/TerrainField.ts`
- terrain palette/shader files

### 12.1 Put geology in build-time semantics where possible

The shell is built once. Use that opportunity to encode broad terrain character
into vertex color or a small packed attribute.

Desired signals:

- slope
- convexity/concavity
- elevation band
- exposure/aspect
- rockiness
- low-frequency ridge/erosion variation already derivable from the terrain
  field

Prefer build-time arithmetic over adding a procedural fragment-noise stack.

### 12.2 Geological color rules

Use broad, low-contrast rules:

- steep/exposed slopes -> slightly more rock/mineral contribution
- concave gullies -> slightly darker/cooler vegetation/soil
- convex ridges -> slightly drier/brighter mineral exposure
- high altitude -> progressively sparse vegetation, not a sudden biome stripe
- broad macro variation -> break one-color mountain faces without mottling

The mountain should gain internal planes, not camouflage noise.

### 12.3 Keep streamed terrain and horizon consistent

A far mountain must not change geology when a detailed chunk streams in.
Use the same landform/ecology causes for both representations. The horizon may
simplify the result, but it must not invent a different palette.

### 12.4 Phase 7 acceptance

- Mountain silhouette remains stable.
- At least two or three broad face planes/gullies are visible before haze.
- No high-frequency speckle appears on the skyline.
- Streaming a mountain from horizon to detailed terrain does not swap its basic
  dry/rock/vegetated identity.
- Existing `test:horizon`, `test:horizon-allocation`, and
  `test:terrain-surface` remain green.

## 13. Phase 8 - Sky-matched, height-aware aerial perspective

This is the highest-value distant-world improvement and the largest remaining
item already identified by the previous AAA audit.

### 13.1 Replace flat-color convergence with shared atmospheric fog logic

Current behavior uses one `FogExp2` color. Desired behavior blends distant
geometry toward the color of the sky behind it.

Create one small reusable atmosphere module, for example under:

`src/world/atmosphere/`

Responsibilities:

- own validated atmosphere parameters/uniform values
- provide shared GLSL chunks or material-patching helpers
- compute sky-gradient color from view direction
- compute distance fog factor
- add height/valley weighting
- expose no independent noise/ecology world

Do not copy slightly different fog math into every material.

### 13.2 Atmospheric model

A cheap model is sufficient:

```text
distanceFog = 1 - exp(-density^2 * viewDistance^2)
heightWeight = heightFalloff(worldY, hazeBaseHeight)
valleyFog = distanceFog * mix(1, heightWeight, valleyStrength)
skyTarget = sampleSkyGradient(viewDirection)
finalColor = mix(surfaceColor, skyTarget, valleyFog)
```

The exact function should be chosen for visual stability and low ALU cost, not
physical completeness.

### 13.3 Match the existing sky palette

Reuse the same zenith/horizon/haze colors used by `WorldSky`; do not define a
second set of almost-matching atmospheric colors.

If the sky colors are currently constants, move art-facing values into the
validated config as part of this phase so sky and fog consume one source.

### 13.4 Height behavior

Goals:

- low valleys gather more haze
- exposed high ridges retain slightly more contrast
- the effect is smooth in world height
- camera climbing does not make the haze layer visibly follow the camera

Use world height, not camera-relative height, for the valley component.

### 13.5 Material integration order

Implement and verify in this order:

1. horizon shell
2. detailed terrain
3. far/impostor grass
4. scenic trees/stones if they bypass normal Three.js fog chunks
5. water only if required by its custom shader
6. near grass last, because near geometry should receive little fog and is the
   highest-overdraw material

### 13.6 Compact profile

The compact implementation should use the same model with reduced precision or
fewer optional terms if profiling requires it. It must not fall back to a flat
unrelated fog color because that recreates the visible seam on mobile.

### 13.7 Phase 8 acceptance

- Distant geometry converges to the actual sky behind it.
- Valleys are visibly hazier than high ridges in an elevated capture.
- No horizontal fog plane follows the camera.
- Mountain silhouettes remain readable instead of disappearing into uniform
  gray-green.
- The horizon/sky boundary has no obvious color seam.

## 14. Phase 9 - Rebalance directional light after atmosphere is correct

Do not tune lighting before Phase 8 is stable. Atmosphere changes perceived
contrast and color balance.

Relevant files:

- `src/app/WorldEnvironmentController.ts`
- `src/app/WorldEnvironmentTuning.ts`
- `src/world/sky/WorldSky.ts`
- `src/app/WorldCloudEnvironmentLighting.ts`
- grass, terrain, character material files

### 14.1 Preserve the current warm/cool design

The existing palette already points in the correct direction:

- warm sun
- cool sky/hemisphere
- green ground bounce

The issue is readability, not the concept.

### 14.2 Tune ratios rather than globally increasing contrast

Adjust in this order:

1. sky/hemisphere fill
2. sun intensity
3. exposure
4. shadow bias/radius only if shadow quality is actually defective
5. material-specific response

Do not compensate for an over-bright sky by crushing material albedo.
Do not compensate for a flat grass normal by increasing sun intensity.

### 14.3 Shadow coverage caution

The current directional shadow half-extent is intentionally small enough to
preserve local resolution. Do not expand it just to make distant trees shadow
all grass. Large-scale grass occlusion should use the bounded analytic approach
described later if it proves visually valuable.

### 14.4 Phase 9 acceptance

- Terrain folds and grass masses reveal a consistent light direction.
- Shadowed vegetation stays colored, not black.
- The character retains dark costume values while separating from the meadow.
- No exposure change reintroduces white dry grass.

## 15. Phase 10 - Sky, clouds, and spatial cloud-shadow composition

There is already a dedicated sky and volumetric cloud stack. Do not create a
second cloud renderer in this plan. The missing ground piece is a spatial,
world-space transmittance field, not another visible cloud layer.

Relevant files:

- `src/world/sky/WorldSky.ts`
- `src/world/sky/WorldSkyMaterial.ts`
- `src/world/sky/WorldSkyCloudShader.ts`
- `src/world/sky/WorldSkyCloudVolumeController.ts`
- `src/world/sky/WorldCloudVolumeShader.ts`
- `src/world/sky/WorldCloudWeather.ts`
- `src/app/WorldCloudEnvironmentLighting.ts`
- new cloud-shadow modules described in
  [aaa-cloud-shadow-system-plan.md](aaa-cloud-shadow-system-plan.md)

### 15.1 Composition goal

The hero sky should normally have:

- clear negative space
- subtle high cloud structure
- one or a few larger soft formations when weather allows
- a readable horizon haze band
- cloud lighting that affects the ground softly

Do not fill the entire sky with cloud detail merely because the system can.

### 15.2 Diagnose black terrain before implementing new shadows

The current desktop cloud-light configuration only allows the global direct sun
to fall to `0.86` of authored intensity, and that global path does not project a
spatial ground mask. Therefore the large near-black region in the latest capture
must be isolated before it is treated as a cloud-shadow tuning problem.

Add/reuse a fixed regression pose and compare with:

1. cloud environment attenuation forced to `1`;
2. directional shadow map disabled;
3. path/terrain visual branches isolated;
4. grass hidden to expose the terrain result.

Fix the subsystem that actually creates the black surface. Never compensate by
raising ambient light or reducing terrain contrast globally.

### 15.3 Spatial cloud-shadow architecture

Implement the detailed companion plan in this order:

1. extract the shared cloud density/vertical-profile GLSL into one reusable
   module;
2. render one small world-space cloud-plane transmittance texture;
3. project each world point toward the cloud plane along the sun direction;
4. sample the shared transmittance map;
5. apply the result to **direct sun only**;
6. integrate terrain first;
7. integrate grass through the vertex path before considering any fragment
   texture fetch;
8. integrate horizon/scenic/water only after terrain + grass are proven;
9. fade shadow contrast with atmospheric distance;
10. debug/tune morphology only after lighting correctness is established.

The texture stores transmittance, never a black-overlay opacity. It must respect
`minimumDirectTransmittance` at generation time and consumer time.

### 15.4 World-space projection rule

The shadow map represents the cloud plane, not a flat ground plane. For a world
point `P`:

```text
heightToCloud = max(cloudBaseHeight - P.y, 0)
cloudXZ = P.xz
        + sunDirection.xz
        * heightToCloud / max(sunDirection.y, epsilon)
```

This makes hilltops and valleys receive correctly shifted projected shadows and
keeps the field stable under camera rotation.

### 15.5 Preserve ambient/sky light

The cloud value must scale only the direct directional-light term. Do not apply
it after `outgoingLight`, to `diffuseColor`, or to final terrain/grass albedo.
Otherwise cloud shadows will incorrectly remove hemisphere light and can produce
black holes.

The current global focus transmittance can remain the baseline sun intensity.
Spatial materials apply the relative correction:

```text
relativeCloudSun = localTransmittance / focusTransmittance
```

so a clear region can recover authored sunlight even while the player is under a
cloud, without double-dimming the focus area.

### 15.6 Cloud morphology and banding

The visible clouds and projected ground shadow must consume the same macro cloud
field. If the latest ring/band artifacts remain, determine whether they originate
from:

- god-ray angular banding;
- temporal volumetric upscaling/history;
- the cloud density field itself;
- tone-mapping amplification.

Improve the shared field once rather than adding shadow-only noise. Prefer domain
warp/erosion changes before increasing FBM octave count.

### 15.7 Performance strategy

The preferred cost shape is:

- one shared low-resolution cloud transmittance render target;
- no procedural cloud FBM in terrain/grass fragments;
- terrain may sample the map in fragment stage;
- grass starts with vertex-stage sampling and passes one scalar varying;
- distant shadow contrast fades with atmosphere;
- compact reduces map resolution/integration steps before disabling the feature.

Profile the small map pass separately from consumer cost.

### 15.8 Phase 10 acceptance

- The sky is no longer visually empty in normal weather, but remains spacious.
- No unexplained black terrain patch remains.
- Cloud shadows are spatial and anchored in world space.
- Rotating the camera does not move the shadow field.
- Cloud shadows never read as black overlays.
- Shadowed terrain and grass retain sky/hemisphere color.
- Grass backlight/transmission weakens under cloud shadow.
- Terrain and grass agree under the same cloud.
- Cloud/haze color is coherent with the new aerial perspective.
- Shadow contrast falls naturally with distance.
- Temporal cloud accumulation does not create flicker or ghosting in the hero
  capture.
- No rectangular shadow-map boundary or grass-tile boundary is visible.

## 16. Phase 11 - Add sparse scenic structure to the meadow

The current open field needs scale cues and rhythm, not uniform decoration.

Relevant systems:

- `src/world/scenic/WorldScenicLayer.ts`
- `src/world/scenic/WorldScenicTuning.ts`
- `src/world/scenic/WorldTreeField.ts`
- `src/world/scenic/WorldTreeSystem.ts`
- `src/world/stones/WorldStoneSystem.ts`
- detail-foliage systems
- hydrology/ecology fields

### 16.1 Scenic hierarchy

Use low densities for:

- shrub pockets
- isolated boulders or existing stone clusters
- exposed rocky shoulders
- wet depressions
- drainage-aligned vegetation
- occasional tree groups/lone trees where the biome allows

### 16.2 Placement is ecology-driven

Examples:

- shrubs: moderate moisture/fertility, low disturbance
- boulders: existing stone geology/rockiness
- wet depression plants: moisture + concavity
- trees: existing tree field plus habitat suitability
- dry open quiet zones: deliberately remain empty

### 16.3 Negative-space budget

Add an explicit composition rule: most visible meadow area should remain free of
large scenic anchors. The procedural generator needs quiet space to make rare
objects meaningful.

Do not tune by asking “how many objects can fit?” Tune by asking “how few anchors
are needed to explain scale and ecology?”

### 16.4 Phase 11 acceptance

- Large meadow areas remain open.
- Scenic objects occur in explainable habitats.
- No even-distance decorative rhythm appears.
- A distant tree/boulder gives scale without becoming a focal point in every
  direction.
- `test:scenic-runtime`, `test:tree-field-safety`, and stone verifiers stay
  green.

## 17. Phase 12 - Character grounding and grass interaction

The character already bends grass and has an analytic grass shadow. This phase
improves the remaining visual integration.

Relevant files:

- `src/grass/interaction/GrassGroundShadow.ts`
- `src/grass/interaction/GrassInteractionField.ts`
- `src/grass/interaction/GrassTrailField.ts`
- `src/world/WorldGrassSystem.ts`
- `src/character/SnowflowCharacter.ts`
- `src/character/SnowflowCharacterMaterials.ts`
- `src/character/CapeMotion.ts`
- `src/render/ActorEnvironmentResponse.ts`

### 17.1 Verify lower-body depth behavior first

Before adding effects, inspect:

- grass depth write/test settings
- alpha test/blending
- render order
- whether lower legs are correctly occluded by foreground blades

If depth ordering is wrong, fix that before adding more shadow/AO.

### 17.2 Foot contact

Existing foot contacts should create:

- immediate local bend
- a short-lived crushed wake
- stronger response at faster movement/landing
- stable recovery

Tune radius/strength from `world.yaml` only after verifying actual foot positions
from the locomotion rig are fed into the interaction system.

### 17.3 Cape/body influence

Do not collide individual cape vertices against grass. Use a KISS approximation:

- reuse the existing body-contact path
- add one swept/backward body influence representing the lower cape volume if a
  visible gap remains
- derive orientation from character/cape direction
- write into the same interaction field/trail representation

One bounded analytic shape is preferable to per-vertex interaction.

### 17.4 Character-to-grass shadow

Keep the existing analytic ground shadow. Tune footprint, strength, and fade so
it reads as occlusion from the body rather than a circular decal.

If tree/stone-to-grass shadow is added later, generalize this into a tiny bounded
array of analytic occluders rather than enabling full PCF shadow map reads in
grass fragments.

### 17.5 Character material integration

Use the existing actor environment response for:

- sky-side rim/fill
- meadow-tinted lower bounce
- controlled cape/body contact darkening

Do not add a generic screen-space AO pass solely for this character.

### 17.6 Phase 12 acceptance

- Feet disappear naturally into grass where blade height warrants it.
- Grass visibly moves around contact points while walking.
- The cape no longer appears to pass through tall grass untouched at close
  range, if the extra swept influence is required.
- Character shadow/grounding works without enabling shadow-map receipt on grass.
- Existing character motion/rig/locomotion tests stay green.

## 18. Phase 13 - Representation-preserving grass LOD

The representation ladder already exists. The remaining problem is that macro
vegetation identity weakens into a green carpet with distance.

Relevant files:

- `src/grass/GrassLodController.ts`
- `src/grass/GrassLodTuning.ts`
- `src/world/WorldGrassSystem.ts`
- `src/world/grass/WorldSingleBladeTileField.ts`
- `src/world/grass/WorldGrassImpostorMaterial.ts`
- `src/world/TerrainMaterialShader.ts`
- habitat/biome/palette files

### 18.1 Preserve macro identity, not individual blades

The transition contract is:

```text
near blades
  -> bridge blades
  -> mid clump mass
  -> far/impostor mass
  -> terrain canopy signal
```

At each step, the same world region must preserve:

- dense vs sparse identity
- wet vs dry identity
- dominant color family
- broad clump location
- disturbance/path response

Individual blade orientation may disappear; macro structure may not.

### 18.2 Strengthen the terrain-side canopy representation

When real geometry fades, the terrain shader must retain low-frequency canopy
structure derived from the same habitat/density/dryness semantics. This is not a
fake grass texture. It is the final LOD representation of the same field.

Rules:

- no high-frequency blade pattern at far distance
- no camera-facing noise
- world-space stable macro patches
- palette derived from the same biome/dryness values as grass
- fade begins before geometry becomes sub-pixel

### 18.3 Remove LOD color convergence to one green

Run color parity captures at several fixed distances through every handoff.
If far grass loses dry/wet differences, fix the shared palette inputs before
changing opacity or density.

### 18.4 Phase 13 acceptance

- Walking forward does not make a distant clump appear from a previously uniform
  green area.
- Dry and wet communities remain distinguishable into the far field.
- No brightness/density ring tracks the camera.
- Existing LOD, bridge, shape, color, impostor, and streaming verifiers remain
  green.

## 19. Phase 14 - Palette coherence and final color pass

Do this after atmosphere and LOD, otherwise later changes invalidate the grade.

### 19.1 Palette goals

Use a restrained natural range:

- moist shadow grass: slightly cooler blue-green
- ordinary live grass: mid natural green
- sunlit tips: warmer/yellower but not neon
- dry vegetation: muted olive/straw, not gray-white
- exposed soil: brown/olive with mineral variation
- distant vegetation: cooler/lower contrast through atmosphere, not by replacing
  its local albedo

### 19.2 Keep ACES as the final display transform

Do not add manual post-tone-map saturation hacks. If a material looks wrong,
correct its linear-space palette/lighting inputs first.

### 19.3 Calibrate by region

Sample representative regions from the fixed hero captures:

- live foreground grass
- dry foreground grass
- root zone
- bare soil
- path core
- mid meadow
- far meadow
- mountain
- sky horizon
- sky zenith

The goal is relative hierarchy, not matching arbitrary absolute RGB targets.

### 19.4 Phase 14 acceptance

- No area is attention-grabbing solely because it is much brighter or more
  saturated than its ecological role.
- Dry grass remains clearly different from live grass without becoming white.
- Mid/far meadow stays colorful enough to avoid a flat monochrome carpet.
- Character costume remains distinct without requiring an artificial outline.

## 20. Configuration strategy

Do not flood `world.yaml` with speculative knobs. Add a key only when a phase has
proven it needs independent tuning.

### 20.1 Existing keys to prefer

Grass/community:

- `grassClumpRadiusScaleMin/Max`
- `grassClumpAspectMin/Max`
- `grassClumpDominantDirectionWeight`
- `grassClumpRadialDirectionWeight`
- `grassMacroPatchWorldSize`
- `grassMacroPatchStrength`
- `grassWetDensityBoost`
- `grassDryDensityReduction`
- `grassRockDensityReduction`
- `grassDisturbanceDensityReduction`
- `grassWetHeightBoost`
- `grassDryHeightReduction`
- `grassDryColorStrength`
- detail-foliage colony/ecology controls

Ground/path:

- `terrainGroundMesoStrength`
- `terrainGroundMicroStrength`
- `terrainGroundNormalStrength`
- `terrainGroundCanopyDarkening`
- `terrainPathCoreDarkening`
- `terrainPathVergeDryness`
- path width/roughness/grass-clearance values

Grass material:

- `rootDarkening`
- `normalUp`
- `ambientBoost`
- `backlightStrength`
- current palette colors

Clouds:

- existing `CloudShadowStrength`
- existing `CloudMinimumDirectTransmittance`
- existing `CloudLightResponseRate`
- existing cloud coverage/softness/macro/detail/weather/wind controls

### 20.2 Candidate new keys - only add if the implementation needs them

Potential ground integration:

- `terrainGroundMoistureDarkening`
- `terrainGroundRootZoneDarkening`
- `terrainGroundDryLitterStrength`
- `terrainPathCompactionNormalReduction`

Potential atmosphere:

- `atmosphereDensityDesktop`
- `atmosphereDensityCompact`
- `atmosphereSkyMatchStrength`
- `atmosphereHazeBaseHeight`
- `atmosphereHeightFalloff`
- `atmosphereValleyStrength`

Potential horizon geology:

- `horizonRockSlopeStart`
- `horizonRockSlopeFull`
- `horizonConcavityDarkening`
- `horizonMacroVariationStrength`

Cloud-shadow technical quality, in `runtime.yaml`:

- `desktopCloudShadowMapResolution`
- `desktopCloudShadowWorldSize`
- `desktopCloudShadowSteps`
- `desktopCloudShadowEdgeFade`
- `desktopCloudShadowDistanceFadeStart`
- `desktopCloudShadowDistanceFadeEnd`
- compact equivalents

Do not add a second shadow-strength or direct-transmittance floor; reuse the
existing cloud controls.

Potential character grounding:

- only add a cape/body contact extent if the current `grassBodyContactRadius`
  cannot express the required interaction

For every added key:

1. add it to schema/type/validator
2. give it a valid range
3. fail cleanly on invalid input
4. document reload/live-update behavior
5. add or extend config verification

## 21. Performance plan

AAA here means spending detail where it survives on screen, not maximizing all
systems simultaneously.

### 21.1 Relative performance gates

For every phase, compare the same fixed pose before/after.

Target:

- less than 5% regression in settled p95 frame time for a normal visual phase
- investigate any regression above 5%
- do not accept a regression above 10% without a clearly measured and approved
  visual tradeoff
- no new steady-state allocations in world/grass streaming loops
- no accidental draw-call multiplication by species or clump type

These are implementation gates, not claims about current performance.

### 21.2 Preferred cost order

Spend budget in this order:

1. build-time/stream-time scalar calculations
2. existing vertex attributes
3. cheap vertex shader ALU
4. cheap fragment ALU
5. one shared low-resolution lookup if absolutely necessary
6. extra geometry only in the close field
7. additional draw calls only as a last resort

Cloud shadows are the deliberate exception to “lookup only if absolutely
necessary”: one shared low-resolution transmittance texture is preferable to
re-running cloud FBM inside every material. Grass still starts with vertex-stage
sampling rather than a new fragment lookup.

### 21.3 Avoid these expensive shortcuts

- full grass shadow-map receipt
- per-fragment procedural FBM in far terrain/horizon
- per-fragment procedural cloud FBM in terrain/grass
- per-blade ecology/hydrology resampling every frame
- separate material/draw call for each flower species
- screen-space AO solely to ground grass/character
- increasing grass density to cover a bad ground shader
- high-frequency far geometry that becomes sub-pixel
- a second cloud-shadow texture per material/system

### 21.4 Compact profile

Compact should primarily reduce:

- near geometry complexity/radius
- detail-foliage count
- scenic density
- cloud quality
- cloud-shadow map resolution/integration steps when required

It should preserve:

- the same ecology patches
- the same dominant communities
- the same atmosphere color logic
- the same path placement
- the same mountain geology identity
- the same macro cloud-shadow layout

## 22. Verification plan

### 22.1 Existing targeted checks to run during development

Use the relevant subset after each phase:

```text
npm run test:ecology
npm run test:terrain-surface
npm run test:horizon
npm run test:horizon-allocation
npm run test:grass-placement
npm run test:grass-shape
npm run test:grass-bridge
npm run test:lod
npm run test:lod-color
npm run test:detail-foliage
npm run test:flower-variety
npm run test:grass-performance
npm run test:grass-streaming-performance
npm run test:near-grass-lifecycle
npm run test:impostor-alpha
npm run test:impostor-lifecycle
npm run test:environment-lifecycle
npm run test:scenic-runtime
npm run test:tree-field-safety
npm run test:stones
npm run test:character-motion
npm run test:actor-rig
npm run test:humanoid-locomotion
```

### 22.2 Add focused verifiers when a new contract is introduced

Do not add tests merely to count files. Useful new contracts would be:

#### Atmosphere contract

Verify:

- fog factor is monotonic with distance for a fixed height
- lower world height receives >= high-ridge haze under equal distance when
  valley strength > 0
- sky-target color uses the same configured palette as `WorldSky`
- all atmosphere uniforms are finite and in validated ranges

Suggested script name:

`scripts/verify-atmosphere-contract.mjs`

#### Cloud field contract

Verify the reusable cloud field remains one source for analytic clouds,
volumetric clouds, and the transmittance-map shader, and that intended shared
constants stay aligned with the CPU weather sampler.

Suggested script name:

`scripts/verify-cloud-field-contract.mjs`

#### Cloud shadow contract

Verify:

- the generated value is transmittance with a configured safety floor;
- projection uses world position, sun direction, and cloud base height;
- the map edge fades toward no shadow;
- terrain/grass apply the factor only to direct sun;
- grass transmission/backlight uses the same cloud direct factor;
- the render target is created once and disposed;
- desktop/compact config fields are valid;
- no surface material contains a copied procedural cloud FBM implementation.

Suggested script name:

`scripts/verify-cloud-shadow-contract.mjs`

#### Path ecology contract

Verify:

- disturbance rises continuously toward the path core
- grass density/height response is monotonic enough to avoid an inverted verge
- chunk boundary samples agree
- stone/path verge logic remains deterministic

Suggested script name:

`scripts/verify-path-ecology-transition.mjs`

#### Grass color safety contract

Verify representative dry/live input combinations produce finite linear colors
and preserve intended ordering without a final hard clamp.

Suggested script name:

`scripts/verify-grass-palette-response.mjs`

### 22.3 Visual verification is mandatory

Static verifiers cannot prove the target look. After every visual phase:

1. build the same fixed poses
2. capture after identical warmup
3. compare before/after side-by-side
4. inspect motion through LOD transitions where relevant
5. inspect both desktop and compact at least once before phase sign-off

For cloud shadows also inspect:

- camera rotation while standing still;
- cloud motion while standing still;
- walking through a shadow boundary;
- a hill/valley crossing the same shadow;
- the shadow-field edge region;
- the black-region regression pose.

### 22.4 Full gate

Before considering this plan implemented:

```text
npm run build
```

must pass in full. The repository's build already includes TypeScript plus the
full static verification suite and built-site check.

No GitHub Action is to be introduced for this.

## 23. Recommended implementation order and commit boundaries

The phases above describe systems. Implement them in these batches so each batch
produces a visible improvement and can be reviewed independently.

### Batch A - Fix the hero foreground first

1. Phase 0 baseline/capture, including the cloud/black-region regression pose
2. Phase 1 foreground grass
3. Phase 2 ground/grass integration
4. Phase 3 grass lighting

Expected visible result: the lower half of the screenshot stops looking like
cards over a flat soil plane.

Suggested commit boundaries:

- `Add meadow visual baseline pose`
- `Refine grass habitat silhouette and dry response`
- `Strengthen terrain grass habitat coupling`
- `Rebalance grass directional lighting`

### Batch B - Fix distance, atmosphere, and weather integration

1. Phase 7 mountain geology
2. Phase 8 atmosphere
3. Phase 9 environment rebalance
4. Phase 10 cloud composition and spatial cloud shadows

Cloud-shadow internal order:

1. diagnose black region
2. extract shared cloud field
3. add/debug transmittance map
4. terrain integration
5. grass integration
6. distant/scenic integration
7. morphology + performance tuning

Expected visible result: mountains read as terrain several kilometers away rather
than flat shapes behind the meadow, and cloud cover changes direct sunlight in a
soft world-space pattern rather than as global pulsing or black overlays.

Suggested commit boundaries:

- `Add horizon geological shading cues`
- `Add sky matched height aware atmosphere`
- `Rebalance world environment for new atmosphere`
- `Diagnose cloud shadow black region`
- `Add world space cloud transmittance map`
- `Apply cloud direct lighting to terrain and grass`
- `Refine cloud composition and shadow morphology`

### Batch C - Add biological hierarchy and path coherence

1. Phase 4 vegetation hierarchy
2. Phase 5 flower colonies
3. Phase 6 path integration
4. Phase 11 sparse scenic structure

Expected visible result: the world stops feeling procedurally uniform without
becoming cluttered.

### Batch D - Character and LOD continuity

1. Phase 12 character grounding
2. Phase 13 representation-preserving LOD
3. Phase 14 final palette

Expected visible result: foreground, character, mid meadow, and horizon behave as
one rendering stack instead of separate layers.

### Batch E - Final QA/performance

1. rerun all fixed visual poses
2. profile desktop/compact
3. fix only evidenced regressions
4. run `npm run build`
5. manually inspect Git diff and working tree
6. deploy only when requested/approved with `npm run deploy:pages`

## 24. What not to do

These changes are explicitly out of scope unless a later measurement disproves
the current architecture:

- replacing `WorldEcologyField`
- adding another grass renderer
- replacing the existing grass LOD ladder
- adding full dynamic GI
- adding SSR for the meadow
- enabling shadow-map sampling on all grass fragments
- raising blade count as the primary quality fix
- adding random flowers independent of ecology
- adding decorative rocks evenly along the path
- putting procedural high-frequency noise in distant mountain fragments
- adding bloom to make grass “richer”
- increasing global saturation/contrast to compensate for flat material response
- rebuilding the visible cloud system in parallel with the existing volume stack
- multiplying final terrain/grass color by a cloud darkness mask
- adding per-material procedural cloud noise instead of one shared field

## 25. Final definition of done

This plan is complete only when all of the following are true at the same time:

### Foreground

- close grass has clear tuft/body/tip hierarchy
- dry vegetation is naturally muted rather than white
- root zones and soil visually connect
- ecological patch differences are visible without debug overlays

### Biological composition

- vegetation has multiple height layers
- flowers form coherent colonies with companions and maturity variation
- wet, dry, rocky, and disturbed communities differ for causal reasons
- large quiet areas remain quiet

### Path

- path core, shoulder, and verge are one continuous ecological transition
- grass and stones respond to the same path cause
- path no longer reads as a painted ribbon

### Distance

- far meadow preserves macro wet/dry/clump structure
- mountains have broad geological face variation
- aerial perspective converges to the actual sky gradient
- valleys haze more than ridges without a camera-following fog plane

### Lighting and weather

- sunlight direction is readable
- backlit grass transmits light without glowing white
- warm direct and cool ambient light remain balanced
- unexplained near-black terrain regions are absent
- cloud shadows are spatial and world-anchored
- cloud shadows attenuate direct sun only
- shaded terrain/grass retain sky/hemisphere light and material color
- grass and terrain agree under the same cloud field
- cloud-shadow contrast fades naturally with atmospheric distance
- cloud macro bodies and ground modulation are visually coherent

### Character

- grass depth/occlusion around legs is correct
- foot/body interaction reads at gameplay speed
- the character casts believable local grass occlusion without expensive grass
  shadow-map receipt
- cape contact gets the cheapest sufficient approximation if still required

### Engineering

- world determinism is preserved
- no visible LOD rings/pops were introduced
- no unjustified per-frame allocations were introduced
- no species-level draw-call explosion was introduced
- compact retains macro visual identity
- compact retains the same macro cloud-shadow identity
- cloud shadow uses one shared transmittance map, not copied FBM in materials
- no new high-overdraw grass fragment cloud lookup is accepted without profiling
- all added art tuning is validated/config-backed
- targeted checks pass
- `npm run build` passes
- visual matrix is signed off manually
- GitHub Pages deployment remains manual

## 26. First implementation slice

When execution starts, do not begin with all phases in parallel. The highest
value first slice is:

1. capture/lock the current hero pose and cloud/black-region regression pose
2. diagnose the source of the black region before changing cloud shadows
3. trace and fix the nearly white dry-grass response
4. strengthen existing clump/archetype silhouette differences
5. strengthen terrain root-zone/canopy correlation using current semantic
   attributes
6. verify near-to-mid color parity
7. run targeted grass/terrain/environment tests
8. capture before/after
9. proceed to atmosphere
10. execute the first cloud-shadow slice from the companion plan: shared field ->
    debug transmittance map -> terrain direct-light integration -> profile

That slice should materially improve the exact 2026-08-20 screenshots without
adding a new grass renderer, increasing grass density, hiding black regions with
ambient light, or duplicating the cloud procedural field.

## 27. Detailed cloud-shadow implementation reference

The code-level execution plan for Phase 10 is maintained in
[aaa-cloud-shadow-system-plan.md](aaa-cloud-shadow-system-plan.md).

Its key architectural decision is intentionally narrow:

```text
shared cloud density field
  -> one low-resolution cloud-plane transmittance texture
  -> world-position projection along sun direction
  -> direct-sun modulation per material
  -> distance/atmosphere fade
```

It explicitly rejects a projected black overlay, camera-space cloud-shadow
texture, procedural cloud FBM inside surface fragments, and full grass shadow-map
receipt. Terrain is the first consumer; grass follows through vertex-stage
sampling only after terrain proves the visual model and the map pass has been
profiled.