# Waterfall Gorge Geology and Budget Plan

Status: implementation plan — not started
Baseline date: 2026-08-17
Target: the knickpoint gorge pose, desktop profile, seed 42017

## Goal

The curtain itself is finished: strands, aerated crest, whitewater base, real
vertical silhouette. Three things around it are not, and one QA gap has been
carried for several sessions:

1. the gorge walls shade as wet gravel instead of rock;
2. the plunge pool bed reads flat;
3. the gorge frame runs ~24 FPS against 34–45 elsewhere;
4. no visual-matrix pose has ever landed on a real river bend.

This plan fixes those four. It deliberately adds **no new waterfall effects** —
the fall is convincing, and everything below either corrects a classification,
adds geology, or buys frame time back.

The governing idea, which is worth stating once because four separate fixes
follow from it:

> Water decides erosion and wetness. It must not decide what the geology **is**.

And for the budget:

> Make one surface look complicated rather than stacking complicated surfaces.

## 0. What the code actually does today

This section is verification, not description. Several assumptions in the
review that prompted this plan are wrong, and the corrections change the work.

### 0.1 The tree is mid-merge and does not compile — blocking

`.git/MERGE_HEAD` is present. Three paths are `UU` with live conflict markers:

- [src/world/hydrology/RiverField.ts:74](src/world/hydrology/RiverField.ts:74)
- [src/world/TerrainStreamer.ts:81](src/world/TerrainStreamer.ts:81) and `:180`
- `qa/stones/stone-performance-baseline.json`

`RiverField.ts` carries `<<<<<<< HEAD` inside the module body, so `tsc` cannot
parse it and `npm run build` cannot pass. `HEAD` also moved from `b3ee6a4` to
`d2e4604` during this session — another session is committing into this working
tree. **Nothing below can be measured or verified until the merge is resolved.**
Resolve it in a worktree against pristine `origin/main` before starting.

### 0.2 The gorge walls: there is no rock material to promote

`TERRAIN_DETAIL_COLOR` in
[src/world/TerrainMaterialShader.ts:96](src/world/TerrainMaterialShader.ts:96)
has **no slope input and no rock class at all**. Its whole palette is soil,
biome underlayer, thatch, canopy, path, shore-mud and shore-gravel. The review
recommends a priority of `cliff rock > exposed bedrock > river sediment > soil >
vegetation`; four of those five classes do not exist yet. This is new material
work, not a re-ordering.

The gravel on the wall is exactly these lines
([TerrainMaterialShader.ts:267](src/world/TerrainMaterialShader.ts:267)):

```glsl
float shoreBand = smoothstep(0.94, 1.0, terrainWaterProximity);
float shoreGravel = shoreExposure * smoothstep(0.68, 0.84, shorePatch);
terrainSurfaceColor = mix(terrainSurfaceColor, uTerrainPathGrit, shoreGravel);
```

And the reason the whole wall qualifies is that `terrainWaterProximity` is a
**purely horizontal** function. In
[RiverField.ts:394](src/world/hydrology/RiverField.ts:394) proximity ramps on
`lane.distance` — lateral distance to the centreline — against
`localHalfWidth + waterHumidityRadius` (34 m in `world.yaml`). There is no
vertical term anywhere in it. So a 20 m gorge wall standing 8 m back from the
bank reads `proximity ≈ 1` **at every height up its face**, and the shore band
paints it top to bottom.

That gives the fix two independent halves, and the cheap half lands first:

- **height falloff on proximity** — a few lines, no new attributes, and it stops
  the wall being classified as shoreline at all;
- **a slope-driven rock class** — the real work.

Slope is already computed CPU-side: `TerrainField.sampleLandform` returns
`{ slope, convexity, gradientX, gradientZ }` and the QA locator already reads it
([WorldVisualMatrixLocations.ts:219](src/qa/WorldVisualMatrixLocations.ts:219)).
It is simply never packed into a vertex attribute — `terrainEnvironment` is
`(altitude, humidity, waterProximity, stoneClearance)`
([TerrainChunk.ts:244](src/world/TerrainChunk.ts:244)). Two routes exist, and the
second is nearly free: `TERRAIN_DETAIL_NORMAL` already takes `dFdx`/`dFdy` of the
world position ([TerrainMaterialShader.ts:372](src/world/TerrainMaterialShader.ts:372)),
so a geometric world normal — and therefore slope — costs one cross product.

Note for whoever implements this: per-mesh uniforms set from `onBeforeRender` are
silently dropped on shared materials in this three version. Use attributes or
derive in-shader, which is what the codebase already does everywhere.

### 0.3 The plunge pool: the profile is 1-D and deliberately level

[WaterfallField.sample](src/world/hydrology/WaterfallField.ts:109) produces a
**long profile only** — a short face, a level plunge reach, a long recovery —
and `HydrologyField.carveHeight` subtracts `river.incisionDepth + fallStep`
([HydrologyField.ts:149](src/world/hydrology/HydrologyField.ts:149)). There is no
bowl, no scour, no lateral shaping and no boulders. `WATERFALL_PLUNGE_LENGTH` is
26 m of **level** reach; level is precisely why it reads flat. The review is
right, and the cause is that the pool was never excavated in the first place.

One useful consequence: depth attenuation is **already implemented** in the bed
shader — `exp(-uWaterBedExtinction * waterBedDepth)` at
[WaterBedMaterialShader.ts:121](src/world/hydrology/WaterBedMaterialShader.ts:121),
with caustics already gated to shallow water at `:124`. So the review's whole
"deeper = stronger absorption, bottom detail disappears, caustics strongest in
the shallows" list needs **no shader work at all**. Excavate the bowl and the
water-appearance half arrives for free. That materially reduces the cost of this
item.

The bed's material classes are riffle / pool / bank / still, derived from depth
ratio and morphology ([WaterBedMaterialShader.ts:67](src/world/hydrology/WaterBedMaterialShader.ts:67)).
There is no bedrock or boulder class and no waterfall-specific input.

### 0.4 Performance: the overdraw model in the review is wrong

The review describes five stacked transparent surfaces — curtain, sheet, foam,
water, bed. Measured against the code, there are **two**:

| Layer | Material | Transparent | depthWrite |
|---|---|---|---|
| Water sheet | `MeshPhysicalMaterial` | yes | **false** |
| Cascade curtain | `MeshBasicMaterial` | yes | **false** |
| River bed | `MeshLambertMaterial` | **no** | true |
| Terrain | Lambert-derived | no | true |

The bed is opaque with depth writes
([WaterBedMaterialController.ts:63](src/world/hydrology/WaterBedMaterialController.ts:63)).
Foam is a colour term inside the surface shader
([WaterShader.ts:329](src/world/hydrology/WaterShader.ts:329)), not a layer. And
there is **no spray or mist particle system anywhere in the project** — mist is a
single colour mix in the curtain shader
([WaterCascadeShader.ts:97](src/world/hydrology/WaterCascadeShader.ts:97)). So
"reduce mist particle count" and "aggressive mist LOD" have no target, and
"remove redundant transparent surfaces" has nothing to remove: both layers are
load-bearing.

Curtain geometry is already at the architecture the review recommends — up to 24
sites merged into **one mesh, one draw call**, 10×8 quads each, ≈3.8k triangles
([WorldCascadeSystem.ts:23](src/world/hydrology/WorldCascadeSystem.ts:23),
[WaterCascadeGeometry.ts:13](src/world/hydrology/WaterCascadeGeometry.ts:13)).
Geometry is not the problem.

The actual cost is fragment work with no depth rejection:

- the water sheet is a **`MeshPhysicalMaterial`** — transparent, `DoubleSide`,
  `forceSinglePass` — covering most of the gorge frame
  ([WaterMaterialController.ts:59](src/world/hydrology/WaterMaterialController.ts:59)).
  Physical's BRDF is far heavier than what this shader actually consumes;
- on top of it the shader runs several advected-noise samples, wave phases,
  regime resolution and foam per fragment;
- **neither transparent layer writes depth**, so every water fragment behind the
  curtain is shaded and then blended over, and the curtain draws at
  `renderOrder = 4` — *after* the sheet
  ([WorldCascadeSystem.ts:78](src/world/hydrology/WorldCascadeSystem.ts:78)).

That last point is the lever. The review's item 4 — give the curtain an
opaque, depth-writing core — is the highest-value change available here, and it
is the one item in the whole review that removes work rather than moving it.

### 0.5 The bend: curvature is already analytic, and bends are everywhere

The review recommends computing signed curvature per spline segment, finding
local maxima, and adding a `Teleport → Strongest River Bend` command. **All of
the mathematics already exists.** `RiverField.resolveSelectedLane` computes the
first and second derivatives of the meander analytically and normalises signed
curvature into `bend`
([RiverField.ts:333](src/world/hydrology/RiverField.ts:333)). It is already
surfaced through `HydrologySample.riverBend` and already read by the QA point as
`riverBend`.

More importantly, the premise that strong bends are rare on this seed is false.
Reproducing the field's own curvature maths against `world.yaml`
(`riverSpacing: 640`, `riverMeander: 105`, seed 42017):

| Lane | Amplitude | Peak \|bend\| | Share of length with \|bend\| ≥ 0.45 | Nearest qualifying x |
|---|---|---|---|---|
| 0 | 91 m | 1.00 | 31.3% | 68 m |
| 1 | 91 m | 1.00 | 31.0% | 37 m |
| −1 | 111 m | 1.00 | 26.9% | 12 m |

Roughly **a third of every river's length is a strong bend**, and the nearest one
is a few dozen metres from the origin. Nothing is wrong with the world.

The locator is what misses them.
[findWorldVisualLocations](src/qa/WorldVisualMatrixLocations.ts:104) steps
**16 m**. The channel is 21 m wide. And `riverInsideBendScore` /
`riverOutsideBendScore` additionally demand `|lateral| ∈ [0.4, 0.8]`
([WorldVisualMatrixLocations.ts:471](src/qa/WorldVisualMatrixLocations.ts:471)) —
a band **4.2 m wide on each side**. Expected hits per scan row: **0.26**. The
grid steps straight over the band, every time, on every seed.

This is the same bug class that `refineStoneFormation` was added to fix one
commit ago, for the same reason, with the same 16 m grid
([WorldVisualMatrixLocations.ts:261](src/qa/WorldVisualMatrixLocations.ts:261)).
The fix is a refinement pass, not a dev teleport command and not more wandering.

### 0.6 The P_Malin Shadertoy reference

`shadertoy.com/view/MdlXD4` is **CC BY-NC-SA 3.0**. This repository is MIT
(`LICENSE`), and `scripts/verify-legal-notices.mjs` enforces CC0-or-MIT terms for
everything bundled. Pasting that GLSL into the render path would attach a viral
NonCommercial licence to it. Techniques are not copyrightable; the expression is.
So: **reimplement ideas from it, do not copy its code, and do not vendor its
iChannel textures.**

Vendoring those textures would also cut against the architecture. Every texture
in this project is generated in code — `WaterFlowNoiseTexture`,
`TerrainSurfaceNoiseTexture`, `WaterBedTexture` — and the merge currently in
progress is *deleting* the last bitmaps (`public/grass.jpeg`, `public/grass1.jpeg`,
`public/grassLODs.glb`). iChannel0/1 are stock rock and lichen photos, which is
precisely what §1.3 below replaces procedurally.

What is worth taking, mapped to the problems above:

| Idea in the shader | Where it helps | Cost |
|---|---|---|
| `GetTerrainTexture` — cliffs use a *vertical* cylindrical unwrap blended against the ground projection by `normal.y²` | §1.3 cliff projection: two samples, not full triplanar's three | cheap |
| `ApplyAtmosphere` — plunge mist as an analytic **sphere of optical depth**, `1 - exp2(-opticalDepth)` from a ray/sphere hit | §4.1: volumetric mist with **no particles and no new transparent geometry** | very cheap |
| `GetRainbowRGBA` — rainbow as a pure function of the view/sun angle (peaks ≈137.7°, 129.5°) times mist amount | §4.2: the single highest visual payoff per cycle in the whole reference | ~free |
| `fShade = 0.3 + sqrt(depthIntoSlab) * 0.5` — shade the curtain by how deep the fragment sits in the water volume | §3.1: an analytic stand-in for thickness, supporting the opaque core | ~free |

Explicitly **not** taken: the raymarched SDF scene, the 12-step volumetric
curtain trace, and the lens droplets. All three are per-pixel loops, and we are
trying to *recover* frame time in exactly the frame they would cost the most.

### 0.7 A live defect found while prototyping: the curtain runs backwards

`WaterCascadeShader.ts` scrolls the curtain like this
([WaterCascadeShader.ts:56](src/world/hydrology/WaterCascadeShader.ts:56)):

```glsl
float cascadeSpeed = 0.55 + 2.4 * cascadeFall;
float cascadeStretch = mix(1.0, 3.2, cascadeFall);
float cascadeFlowUv =
  cascadeFall * cascadeDrop * uCascadeNoiseScale * 2.6 / cascadeStretch -
  uCascadeTime * cascadeSpeed;
```

The scroll rate is a function of position and it multiplies **absolute** time.
Differentiate the coordinate along the fall and the second term contributes
`-uCascadeTime * dSpeed/dFall`, which grows without bound. Two consequences,
both confirmed in the lab by reproducing the same expression:

- the strand pattern **compresses further every second** the session runs;
- once the time term overtakes the spatial one — a few seconds in — the sign of
  the spatial gradient flips and **the curtain visibly runs upward**.

It is not a tuning problem and no constant fixes it. Acceleration belongs in the
mapping, not in a position-dependent multiplier on absolute time. A parcel in
free fall has covered distance proportional to the square of its age, so its age
goes as the square root of the fall; advecting by that age and scrolling at one
constant rate gives the same accelerating, base-stretched look and is stable for
any run length:

```glsl
float fallAge = sqrt(cascadeFall);
float cascadeFlowUv = fallAge * cascadeDrop * 0.34 - uCascadeTime * 1.55;
```

This is a **Phase 1 correctness fix**, not a Phase 3 polish item. It is the one
thing in this document that is currently wrong on screen in the shipped world
rather than merely unfinished.

A sweep for the same shape found one milder instance, at
[WaterBedMaterialShader.ts:63](src/world/hydrology/WaterBedMaterialShader.ts:63):

```glsl
float waterBedWobble = sin(
  dot(vWaterBedWorldPosition.xz, waterBedFlowPerpendicular) * 0.18 +
  uWaterTime * mix(0.12, 0.34, waterBedRiverAmount)
);
```

The phase rate varies with `waterBedRiverAmount`, so wherever that quantity has a
spatial gradient — the lake-to-river transition — the wobble's spatial frequency
climbs without bound as the session runs. It is confined to those boundaries and
far less visible than the curtain, but it is the same defect and should be fixed
in the same pass. The grass and foliage wind terms were checked and are clean:
their rates are genuine constants.

### 0.8 The lab

`waterfall-lab.html` + `tools/waterfall-lab/` build the gorge in isolation, in
the repository's existing standalone-probe convention (`stone-gallery.html`,
`ecology-map.html`, …). Its purpose is to make the expensive parts of this plan
cheap to get wrong. Every toggle is a numbered phase; everything is generated in
code, so the question of whether to source real rock textures stays open.

Measured on the reference machine (Intel HD 620 through D3D11, 1254x627): **~28–34
fps, 7 draw calls, 61.4k triangles**, with mist, rainbow, splash, scour and the
opaque curtain core all enabled.

What it has already established:

- **The wall-aligned projection works.** Projecting cliff faces along the
  surface's own horizontal tangent, blended against the ground projection by
  `normal.y²`, removes the vertical smearing. Two samples, not triplanar's three.
- **Ambient was hiding the geology.** The first captures read as pale cardboard
  not because the rock shader was wrong but because the hemisphere term was
  strong enough to lift every unlit face to mid-grey. A gorge needs one wall lit
  and one in shade; that contrast does more for the rock than any albedo detail.
- **Excavating the pool is enough.** With absorption already exponential in
  depth, toggling the scour on and off is the whole difference between a flat
  grey floor and a pool that hides its bed. No shader change, confirming §0.3.
- **The mist volume needs no particles.** One analytic sphere of optical depth,
  clamped against scene depth, in the composite pass.
- **The rainbow is nearly free and worth it.** A dot product and a few
  smoothsteps on top of the mist term. Alexander's dark band between the bows is
  what stops it looking painted on.
- **Splash is the one place a particle earns its cost.** 900 points, one draw
  call, whole ballistic arc evaluated in the vertex shader from a seed, no CPU
  work per frame. Thrown droplets have silhouettes a volume cannot fake.
- **Straight lines are the enemy, and they come from the geometry.** Three
  separate defects in the lab were all the curtain mesh's rectangle showing
  through: a ruled top edge at the lip, a horizontal line where whitewater
  began, and a pale skirt either side of the strands. The fixes generalise —
  jitter the breakup height per column so the sheet tears where it is thinnest
  rather than on a contour; dissolve the lip with noise; and make the edge
  falloff square and close it *before* the geometry boundary, because a long
  linear ramp leaves a wide skirt of individually-invisible fragments that
  collectively redraw the mesh outline.
- **Aeration was too high everywhere.** Starting it at 0.28 made the entire
  curtain read as foam with no water in it. A clean lip is green-grey and
  translucent; only broken and landing water goes white.

### 0.10 Correction: the gorge is real, and it is vertical

Section 0.9 below concluded from a slope histogram that there was almost no
steep ground. **That inference was wrong**, and the cross-section says why.
Carved section at the pose, sampled every metre across the channel:

```
 -34..-10 m   plateau ~12.0 m
 -10 -> -7 m   12.06 -> -0.48    12.5 m of drop in 3 m
  -7 .. +7 m  floor ~ -2.4 m     14 m wide
  +7 -> +10 m  -1.46 -> 11.43    12.9 m of rise in 3 m
 +10..+34 m   plateau ~12.2 m
```

Steepest rise across one metre is **5.65 m** — slope 0.83, comfortably past the
0.66 at which rock applies in full. The knickpoint there drops 13.27 m and the
local half width is 6.92 m, so `resolveRiverFallStep` concentrates the whole
step into the 3.45 m between half width and corridor. That is a genuine slot.

The histogram was not false, it was answering the wrong question. A ±60 m box
around a gorge some 20 m wide is mostly plateau, and two 3 m walls in a 120 m
span is 5% of the samples — which is precisely the 4.73% measured. "How much of
this area is steep" is not "is there a cliff".

So macro geology is **not** the blocking item, and the terrain does not need
reshaping. Two real problems remain, both narrower and both surgical:

- ~~Ecology cannot see the wall.~~ **Wrong, checked.** `TerrainLandformField`
  does read 0.023 there, but landform slope is not what gates grass. Placement
  uses `TerrainField.sampleNormal`, whose `TERRAIN_NORMAL_STEP` is 1.5 m — a 3 m
  central difference, which resolves a 3 m wall fine. On the measured wall that
  gives `normal.y = 0.233`, and `sampleGrassSlopeMask` with
  `grassMaxSlopeDegrees: 44` (limit 0.719, fade end 0.919) returns exactly
  **0.000**. Every placement path applies it — `WorldGrassSystem`,
  `WorldSingleBladeTileFactory`, `WorldDetailFoliageField`, `DenseSpawnLocator`
  — and `WorldNearGrassField` consumes tiles from the factory that does. There
  is no grass on the wall and no signal to add.
- ~~The walls do not render as rock.~~ **Wrong, settled with a debug view.**
  Writing `terrainSlope` and `terrainCliff` straight to the output shows the
  gorge walls rendering **yellow** — slope near 1, cliff 1 — so the rock branch
  fires at full strength exactly where it should. The earlier "green dominant,
  so not rock" reading came from sampling screen regions picked by eye, and
  those regions were the **water surface**, not the walls. Sampled at the
  coordinates the debug view proves are terrain, the walls read `#343b34`,
  `#414b43`, `#2a2c26` and `#444d41`: dark, near neutral, entirely consistent
  with the rock albedo `#4a453e` under shadowed ambient rather than with grass.

  Three separate wrong conclusions in this section came from inferring instead
  of measuring the specific thing — twice from aggregate statistics, once from
  eyeballed screen regions. The debug view answered it in a single capture.

- **The wall is about one sample wide.** At near resolution the terrain samples
  every 2.67 m, so a 3 m wall spans barely one quad; at mid (5.3 m) and far
  (10.7 m) it is narrower than a single sample and collapses into a ramp. This
  is the same reasoning that justified giving the cascade its own geometry, and
  it applies to the gorge walls at range.

### 0.9 Measured: there is almost no gorge to shade

The cliff rock from Phase 1 is in the world and compiles, and the walls still
render as grass and soil. Sampling the real field code around the waterfall pose
(focus 198 / 4 / 585, ±60 m) says why.

**Rendered face slope**, taken at the near-LOD spacing of 2.67 m — which is what
the shader's own derivatives see:

| face slope | share of samples |
|---|---|
| < 0.1 (flat) | **93.57%** |
| 0.1 – 0.38 | 1.89% |
| ≥ 0.38 (rock begins) | 4.73% |
| ≥ 0.66 (rock full) | 2.17% |

Peak is 0.787, so genuinely steep ground exists — but it is a thin band along the
incision, and it is mostly under water or behind grass. The large "walls" filling
the frame are below 0.1: they are hillsides, not cliffs. The gorge reads as a
gorge because the channel is full of water, not because the terrain is steep.

**And ecology cannot see the incision at all.** `TerrainLandformField` samples on
an 8 m lattice with a ring measurement, so a cut roughly 16 m wide and a few
metres deep smooths away: `landform.slope` peaks at **0.023** over the same area.
Nothing in the ecology chain knows a gorge exists, which is why grass is planted
down what walls there are.

Two consequences worth stating plainly:

- The rock material is not wrong; it has nearly nothing to apply to. Further
  albedo, joint and relief work will keep paying almost nothing until the
  terrain has real relief. **Macro geology is now the blocking item, not a
  Phase 2 nicety.**
- Lowering the cliff threshold is not the fix. It would paint rock across
  ordinary rolling meadow everywhere in the world to catch a band near the
  river.

This is measured, not inferred, and it supersedes the assumption in the opening
brief that the walls were "steep enough now".

## Phasing

The review's ordering puts rendering before performance. This plan inverts that
for the atmosphere work: adding mist to a 24 FPS frame is backwards. It also
hoists the cheapest half of the wall fix to the very front, because it is a few
lines and removes the most visible defect in the screenshot.

### Phase 0 — Unblock and instrument

- **0.1** Resolve the three-way merge in a worktree against pristine
  `origin/main`; confirm `npm run build` is green *before* any of this work
  lands, so later breakage is attributable. Do not junction `node_modules` into
  the worktree.
- **0.2** Add the gorge benchmark pose (review item 10) — this is a prerequisite,
  not a closing step, because every later phase is judged against it. Record
  FPS, CPU frame time, GPU frame time where available, draw calls, triangles and
  transparent object count. A second pose looking *through* the curtain into the
  pool maximises overdraw and belongs in the same commit.
- **0.3** Extend `scripts/verify-river-performance-contract.mjs` with the gorge
  budget so a regression fails the build rather than a screenshot.

**Exit:** build green; gorge pose reproducible; ~24 FPS recorded as the baseline.

### Phase 1 — Correctness (cheap, highest visible payoff)

- **1.1 Height falloff on water proximity.** Attenuate `RiverField.proximity`
  (and the lake equivalent) by height above the local water line. A wall 20 m up
  stops being shoreline. *Few lines; fixes the screenshot's worst defect on its
  own, before any rock material exists.*
- **1.2 Slope into the terrain shader.** Derive the geometric world normal from
  the world-position derivatives already taken in `TERRAIN_DETAIL_NORMAL`, or
  pack `landform.slope` into a spare attribute channel. Establish the priority
  `cliff rock > exposed bedrock > river sediment > soil > vegetation`, with
  humidity demoted to a **modifier** — darken, drop roughness, raise specular
  wetness, add moss in concave shelter. Gravel/shoreline must additionally
  require low slope and depositional ground.
- **1.3 Slope-independent cliff projection.** Ground projection blended against a
  vertical unwrap by `normal.y²`, per §0.6. This removes the vertical smearing
  that currently makes the wall read as stretched terrain texture.
- **1.4 Fix the curtain's flow direction.** Replace the
  `uCascadeTime * cascadeSpeed(fall)` scroll with the free-fall age mapping from
  §0.7. Currently the shipped curtain compresses over time and reverses. Proven
  in the lab.
- **1.5 Dissolve the curtain's silhouette.** Per-column breakup jitter, a noisy
  lip, and a squared edge falloff that closes before the mesh boundary (§0.8).
  Cheap, and it removes three straight lines the eye locks onto immediately.
- **1.6 Deterministic bend refinement.** Add `refineRiverBend` beside
  `refineStoneFormation`: take the coarse winner's lane, walk its centreline
  analytically to the local curvature maximum, then step **across** the channel
  at ~1 m to land inside the `|lateral| ∈ [0.4, 0.8]` band. Fully deterministic;
  no teleport command needed.

**Acceptance:** with humidity forced to maximum in the gorge, cliff faces stay
rock and only their wetness changes. The inside/outside bend poses resolve to a
genuine bend on seed 42017 — and, given §0.5, on any seed.

### Phase 2 — Geology

- **2.1 Plunge scour.** Replace the level 26 m plunge reach with a procedural
  excavation kernel centred slightly downstream of impact: deepest at the impact
  point, irregular rather than circular, asymmetric along the inflow/outflow
  axis, shallowing into the exit channel.
- **2.2 Sediment sorting.** Bed classes from impact outward: exposed bedrock →
  fractured blocks → coarse cobble → gravel → fine sediment in low-energy
  pockets. This replaces the single cobble distribution over the whole floor.
  Per §0.3, the depth-driven absorption and shallow-gated caustics that make this
  read correctly through the water are already implemented.
- **2.3 Cliff macrostructure.** A secondary fracture pass above the cliff slope
  threshold: ledges, fracture planes, vertical joints, occasional undercuts,
  differing recession rates. **Metre-scale forms only** — high-frequency noise
  here would just restore the procedural-terrain look Phase 1 removed.
- **2.4 Couple the fall to its gorge.** Drive pool depth, cliff exposure,
  downstream boulder concentration, bank vegetation suppression and moss zones
  from one waterfall erosion-intensity term, so the whole feature shares a single
  explanation.

**Acceptance:** the pool reads as excavated by the fall; no uniform grey floor
visible through it; bed character changes with distance from impact.

### Phase 3 — Budget recovery

Ordered by measured value, not by the review's ordering.

- **3.1 Opaque, depth-writing curtain core.** Where the curtain is dense
  whitewater, render alpha-tested/dithered with `depthWrite: true`, drawn
  **before** the transparent sheet — which means changing `renderOrder` from its
  current 4. Thin strands and edges stay transparent. This is the only change
  here that lets the GPU reject fragments instead of shading them, and it should
  also make the curtain centre feel physically thicker.
- **3.2 Demote the water sheet from `MeshPhysicalMaterial`.** The shader already
  computes its own Fresnel, specular lobe, reflection mix and absorption;
  transmission, clearcoat, iridescence and sheen are unused. It does feed
  `roughnessFactor`, so this is a real change — measure Standard and Lambert
  variants against the Phase 0 pose before committing.
- **3.3 Early discard on negligible contribution.** `waterAlpha` is computed at
  the very end of `WATER_SURFACE_FRAGMENT`, *after* all noise work. Hoist the
  cheap coverage/depth part and discard first. The noise sampling is already
  gated on `waterDetailWeight` and `waterRiverAmount`; the alpha gate is the
  missing one.
- **3.4 Screen-coverage LOD for the curtain.** `uCascadeDetailDistance` is
  distance-only, which is exactly the failure the review identifies — a fall can
  fill the frame from a distance. Drive turbulence octaves and strand detail from
  projected pixel area, with hysteresis.

**Target:** the gorge pose reaches the ~34 FPS lower bound seen elsewhere,
without visible degradation at that camera.

### Phase 4 — Atmosphere (only once Phase 3 has paid for it)

- **4.1 Analytic plunge mist** — the sphere-of-optical-depth approach from §0.6.
  No particle system, no new transparent geometry. Prototyped in §0.8. Note it
  needs scene depth, so it wants a composite pass the world does not have yet;
  that cost is the open question this phase has to answer.
- **4.2 Rainbow in the spray** — a dot product and a few smoothsteps riding on
  4.1's mist term. Highest payoff-per-cycle item available, and the natural
  finish for a AAA waterfall.
- **4.3 Impact foam as its own zone** — a local lobed, boiling mask over the pool
  at the strike, dissipating downstream, rather than the bottom of the curtain
  doing the work. Keeps the violence where the jet actually lands.
- **4.4 Splash droplets** — seed-driven ballistic points, one draw call, no CPU
  update per frame. The only particle system this plan adds, and the only effect
  here whose silhouette a volume cannot fake.

## Risks

- **Concurrent sessions.** Another agent commits into this tree. Prove blame
  against pristine `origin/main` before attributing any red build to this work.
- **Terrain LOD divisibility.** Chunk-edge divisibility couples near/mid/far
  resolution; Phase 2.3's macrostructure must not assume far resolution can be
  raised on its own.
- **Never re-cut river geometry mid visual pass.** Every QA pose moves if you do,
  and the whole matrix has to be re-shot.
- **Phase 3.2 is a measurement, not a decision.** If Standard costs the same as
  Physical on this GPU, keep Physical and spend the effort on 3.1 and 3.3.
