# AAA Water Execution Plan

Status: implementation plan — implemented pending visual sign-off  
Baseline date: 2026-08-14  
Target: FluffyGrass world renderer on desktop and compact/mobile profiles

> **Implementation status as of 2026-08-15.** Phases marked ✅ are complete in
> code; ⚠️ remain manual screenshot/capture work. See per-phase annotations
> below.

## Goal

Make rivers and lakes read immediately as water rather than as gray/green moving terrain.

The target is a coherent layered water system with:

- correct depth and occlusion;
- a physically believable reflection/transmission balance;
- clear shallow water and progressively absorbed deep water;
- flow-aligned surface motion;
- a river/lake bed that is actually below the water and never overlays the character;
- wet shoreline transitions that connect water to terrain and grass;
- foam only where the flow and obstacles justify it;
- restrained caustics and highlights;
- scalable quality for browser/mobile without an expensive desktop post stack by default.

The order matters. Correct depth ownership and surface/bed separation come before adding prettier reflections.

## Current baseline: preserve what already works

Do not rebuild systems already present in `main`.

The repository already has:

- deterministic rivers/lakes through `HydrologyField.ts`, `RiverField.ts`, and `LakeField.ts`;
- water geometry produced by `WaterChunkGeometry.ts`;
- flow direction data and flow-aligned noise;
- river and lake wave logic in `WaterShader.ts`;
- Schlick-style Fresnel;
- depth-based shallow/deep color;
- shoreline/riffle/stone foam;
- procedural stone wakes/interactions;
- fake shallow caustics and sparse glints;
- a procedural riverbed texture;
- `WaterBedMaterialController.ts` and `WaterBedMaterialShader.ts` for a separate bed layer;
- `TerrainChunk.ts` support for terrain, water-bed, and water meshes;
- `TerrainStreamer.ts` creation/update/disposal of shared water and water-bed materials;
- hydrology and water-flow verification scripts;
- water art tuning in `public/config/world.yaml`.

The current water surface shader still contains legacy bed sampling/mixing. The separate bed layer means the implementation must converge on one owner for bed rendering rather than rendering the bed twice in two different ways.

## Most important visual defect

The riverbed/pebbles must never appear on top of the character.

This is not an art-tuning problem. It is a render/depth ownership problem.

The final render model must be conceptually:

```text
opaque world / character
        ↓ normal depth test
real river/lake bed
        ↓
transparent water surface
        ↓
reflection + transmission + foam
```

The bed must be a real depth-tested layer below the water surface. It must not be a decorative procedural color stamped into the transparent water fragment after scene depth has already decided what is in front.

## Engineering constraints

- Keep water/hydrology deterministic in world space.
- Keep art tuning in `public/config/world.yaml`; do not scatter tuning literals across shaders.
- Mathematical constants such as water IOR/F0 belong in focused tuning modules.
- Reuse one material controller and generated texture across streamed chunks.
- Do not create per-chunk water materials.
- Compact/mobile must not require an additional full-scene render pass.
- Do not introduce SSR as the first reflection solution.
- Do not add full fluid simulation. Surface motion remains analytic/procedural.
- Most ripple detail should remain in normals/shading; river geometry should not become an ocean displacement mesh.
- No GitHub Actions. Build and verification remain local; GitHub Pages deployment remains manual.

---

# Phase W0 — Baseline and visual contract

> **Status: ⚠️ MANUAL** — Code gates exist; repeatable screenshot/benchmark
> captures still need a local visual pass.

Capture repeatable water views before changing the render pipeline.

## TODO

- [ ] Capture a shallow river looking down at the bed.
- [ ] Capture the same river at a grazing angle.
- [ ] Capture deep lake water.
- [ ] Capture a shoreline where wet soil, grass, and water meet.
- [ ] Capture water around a protruding stone.
- [ ] Capture the character standing behind shallow water from the camera's point of view.
- [ ] Capture the character knee-deep and waist-deep where possible.
- [ ] Capture upstream and downstream views so flow direction can be judged.
- [ ] Capture desktop and compact/mobile variants.
- [ ] Record frame time, draw calls, terrain/water triangle counts, and GPU timing if available.

The character/bed occlusion views are mandatory regression references.

---

# Phase W1 — Finish the surface/bed render ownership split

> **Status: ✅ DONE** — Bed material is opaque (`transparent: false`,
> `depthWrite: true`, `depthTest: true`) with dithered coverage discard.
> Caustics live on the bed. Shared geometry bounds expand by max water depth.
> Surface shader still has no riverbed sampling.

## Objective

Make every visual element have one clear owner:

### Water surface owns

- Fresnel/reflection response;
- surface normals/ripples;
- depth absorption/color;
- specular/glints;
- foam;
- surface opacity/transmission.

### Water bed owns

- pebbles/cobbles;
- sand/silt;
- algae attached to the bed;
- shallow caustic light projected onto the bed;
- bed relief/color variation.

### Terrain/shore owns

- wet mud/damp soil;
- shoreline darkening;
- exposed sediment above the waterline;
- transition to shoreline grass.

Do not let the surface shader continue to own decorative bed color once the dedicated bed path is verified.

## Current code to converge

Relevant files:

- `src/world/hydrology/WaterShader.ts`;
- `src/world/hydrology/WaterBedShader.ts`;
- `src/world/hydrology/WaterBedMaterialShader.ts`;
- `src/world/hydrology/WaterMaterialController.ts`;
- `src/world/hydrology/WaterBedMaterialController.ts`;
- `src/world/hydrology/WaterChunkGeometry.ts`;
- `src/world/TerrainChunk.ts`;
- `src/world/TerrainStreamer.ts`.

`WaterShader.ts` currently samples/mixes the procedural riverbed into `waterSurfaceColor`. Once the separate bed path reaches visual parity, remove that legacy ownership from the surface shader.

After the migration:

- the water surface material must not require pebble/sand/algae uniforms;
- the surface controller must not own a bed texture;
- `WaterBedMaterialController` should be the only renderer-side owner of bed texture/color parameters;
- delete `WaterBedShader.ts` only if it has no remaining legitimate import after migration. Do not delete code merely to make the architecture look cleaner before parity is achieved.

## Bed geometry/depth

The visible bed must end up at the real terrain/bed depth, not at the water-surface plane.

If `WaterBedMaterialShader.ts` currently moves the shared water geometry downward in the vertex shader using depth data, verify both of these invariants:

1. the displaced position matches the carved terrain/bed position closely enough that there is no hovering layer;
2. CPU bounding boxes/spheres remain conservative after the vertex displacement.

If shader displacement makes culling bounds fragile, prefer baking explicit bed positions in a small focused geometry path rather than adding arbitrary oversized bounds.

A separate `WaterBedGeometry.ts` is justified only if shared geometry cannot express correct bed position and bounds cleanly. Do not create it pre-emptively.

## Depth state

The bed should behave like world geometry, not like a translucent overlay.

Preferred final bed material state:

- `depthTest: true`;
- `depthWrite: true` where the bed can be rendered as opaque/masked geometry;
- `transparent: false` if smooth coverage can be handled with discard/dither/alpha test;
- no blending that lets the bed render over a nearer character;
- FrontSide unless there is a proven need for double-sided rendering.

The water surface remains transparent and normally uses `depthWrite: false`.

If shoreline coverage requires a soft bed edge, prefer deterministic alpha test/dither near the boundary over putting the entire bed into a transparent sorted pass.

Do not rely on `renderOrder` alone to fix occlusion. Depth testing must produce the correct result.

## Character occlusion contract

Test all of these:

- character fully in front of shallow water: bed does not draw over character;
- submerged legs: water surface can tint/reflect over the submerged portion, but bed still stays behind the legs;
- camera looking almost vertically down: no pebble pattern appears on cape/head/body;
- stone protruding through water: stone correctly occludes bed and surface where geometry is in front.

## Acceptance

- Riverbed never appears over the character.
- There is exactly one procedural bed rendering path.
- Surface shader no longer fakes the bed as a foreground color layer.
- No z-fighting or bed hovering is visible.
- Chunk streaming/culling does not remove the bed unexpectedly.

---

# Phase W2 — Physically plausible depth absorption

> **Status: ✅ DONE** — Beer-Lambert transmittance uses `exp(-absorption * depth)`
> with `waterDepthFade` as the absorption distance and `WATER_ABSORPTION_COLOR`
> as the in-scatter hue. Surface alpha follows optical depth, not a flat mix.

## Objective

Make shallow water clear and deeper water progressively absorb light rather than just become a more opaque flat color.

The current shader already computes an exponential depth factor. Keep the cheap exponential model but make its role clearer and more physically useful.

## Preferred model

Use a Beer-Lambert-style transmittance approximation:

```glsl
vec3 transmittance = exp(-absorption * waterDepth);
```

Then combine:

- bed/scene contribution through the transmittance;
- in-scattered shallow/deep water color as depth increases;
- Fresnel reflection separately.

A full volumetric renderer is not needed.

## Configuration

Keep tuning compact. Prefer one of these approaches:

### Option A — color + distance

```yaml
waterAbsorptionDistance: 2.2
waterAbsorptionColor: "#6c9c8e"
```

### Option B — RGB coefficients

Use only if art control genuinely needs it:

```yaml
waterAbsorptionR: 0.45
waterAbsorptionG: 0.18
waterAbsorptionB: 0.12
```

Do not introduce both systems.

If the existing `waterDepthFade` can express the needed control, evolve that parameter rather than adding redundant knobs.

Any config change must update `WorldConfig.ts`, schema/validator, and config-contract verification.

## Alpha

Do not use alpha as the primary depth-color model.

Alpha should control how the transparent surface composites. Optical depth should mainly control how much of the bed/background survives and how much water color accumulates.

## Acceptance

- Very shallow water clearly reveals the bed.
- Bed visibility fades progressively with depth.
- Deep water is richer/darker but not an opaque gray plane.
- Looking straight down versus at a grazing angle produces a different reflection/transmission balance because of Fresnel, not because of arbitrary alpha changes.

---

# Phase W3 — Fresnel and reflection hierarchy

> **Status: ✅ DONE** — F0 is derived from water IOR. Fresnel mixes reflection
> into color only and no longer scales surface alpha.

## Objective

Make the water surface strongly communicate reflection at grazing angles while staying clear enough to see through from above.

`WaterShader.ts` already contains Schlick Fresnel. Preserve it.

## Work

- Derive the physical base reflectance from the existing water IOR where possible instead of treating Fresnel as an arbitrary brightness effect.
- Keep any art multiplier tightly clamped.
- Use the perturbed water normal for the visual Fresnel response.
- Ensure the normal does not become so noisy that Fresnel sparkles one pixel at a time.
- Keep reflection/environment color consistent with the world sky/environment.

## Reflection priority

Implement in this order:

1. existing environment/sky reflection through the physical material/Fresnel;
2. directional sun/specular response;
3. optional low-cost scene reflection only after profiling proves the first two are insufficient.

Do not start with SSR.

## Optional planar reflection

Only consider a planar reflection after W1–W6 are complete and screenshots still show a major quality gap.

If implemented:

- desktop/high quality only;
- 1/4 or 1/2 resolution;
- one shared target, not one per chunk;
- skip/update less often when water occupies little screen area or the camera is stable;
- compact/mobile remains on environment reflection;
- profile total frame cost before enabling by default.

## Acceptance

- Grazing water reflects strongly and reads as a surface.
- Top-down shallow water remains transmissive.
- No mirror-like river unless roughness is intentionally very low.
- No new mandatory offscreen pass on compact/mobile.

---

# Phase W4 — Multi-scale surface normals and directional flow

> **Status: ✅ DONE** — Three-band wave logic plus compact detail scaling.

## Objective

Make river motion read as flow, not as a moving gray terrain texture.

The current shader already has lake waves, river waves, micro slopes, and advected noise. Do not add a second independent normal-map system merely because “two normals” is a common water recipe.

Refactor/tune the existing system into clear frequency bands.

## Frequency bands

### Macro slope

Purpose:

- broad river/lake surface undulation;
- controls large highlight/Fresnel movement;
- low amplitude for rivers.

### Meso flow structure

Purpose:

- flow-aligned bands and breakup;
- stretched along/downstream according to `waterFlowDirection`;
- strongest in rivers.

### Micro ripple

Purpose:

- small specular breakup near the camera;
- fades with `waterDetailDistance`;
- should disappear before it aliases at distance.

## River behavior

- movement must follow `waterFlowDirection`;
- cross-flow waves may exist, but downstream advection remains dominant;
- scale/speed can vary modestly with river amount/flow strength;
- avoid large vertical-looking wave normals in shallow streams.

## Lake behavior

- use low-amplitude multidirectional wave components;
- no strong single downstream direction;
- micro ripples should remain subtle unless weather/wind systems later justify stronger waves.

## Performance

Continue using the generated shared flow-noise texture.

Do not add several sampled normal textures when the current procedural slope/noise model already provides comparable visual information.

## Acceptance

- River direction is obvious from motion/highlights without foam being required.
- Lakes look calmer and less directional.
- The surface stays smooth at distance with no crawling micro-ripple aliasing.

---

# Phase W5 — Wet shoreline and terrain transition

> **Status: ✅ MOSTLY DONE** — `TerrainSurfaceField.ts` passes
> `waterProximity` via `terrainEnvironment.z`. `TerrainMaterialShader.ts`
> darkens soil and adds `TERRAIN_WET_SHEEN` specular lobe for the wet margin.

## Objective

Remove the hard visual boundary between water and normal dry grass/terrain.

The shoreline should read approximately:

```text
water
  -> submerged sediment
  -> wet mud/dark soil
  -> damp soil / sparse short vegetation
  -> normal grass/ground
```

## Source of truth

Reuse existing hydrology water proximity/humidity and the existing river/lake bank fields.

Do not introduce a second shoreline distance texture.

Relevant terrain files:

- `src/world/terrain/TerrainSurfaceField.ts`;
- `src/world/TerrainMaterialShader.ts`;
- `src/world/TerrainMaterialController.ts`;
- hydrology data already packed/sampled by terrain generation.

Relevant grass integration is covered by the grass execution plan: grass consumes the same moisture/proximity state to change density/height/dryness.

## Terrain response

Near the waterline:

- darken albedo moderately;
- increase the sense of dampness through roughness/value changes appropriate to the existing material model;
- reveal more silt/mud before normal vegetation starts;
- avoid a perfectly constant-width dark ring;
- let bank shape, proximity, disturbance, and ecology break up the transition.

## Configuration

Add shoreline-specific keys only where existing bank/proximity parameters are not enough. Possible examples:

```yaml
waterWetShoreWidth: 3.2
waterWetShoreDarkening: 0.16
waterWetShoreVegetationSuppression: 0.48
```

Do not duplicate `riverBankWidth`, `lakeShoreWidth`, and `waterHumidityRadius` with nearly identical new parameters unless they represent a genuinely different visual band.

## Acceptance

- No abrupt grass-green-to-water line.
- Wet soil is visible where the bank is exposed.
- The transition width varies naturally with terrain/ecology rather than forming a graphic outline.
- Grass and terrain agree about which areas are wet.

---

# Phase W6 — Contextual foam and obstacle response

> **Status: ✅ MOSTLY DONE** — Shore band, riffle pattern, and CPU
> time-budgeted stone wakes (`WaterChunkInteractionResolver.ts`) are
> implemented. Foam increases roughness and modulates albedo.

## Objective

Keep foam as evidence of energy in the water, not as a decorative white border.

The current shader already has shore, riffle, and stone foam. Refine those signals rather than creating another foam renderer.

## Foam causes

Foam should strengthen from combinations of:

- shallow/fast flow;
- rapid directional change or high local slope where available;
- stone/obstacle interaction;
- narrow riffles;
- very shallow contact at selected shoreline areas.

Foam should weaken when:

- water is deep and calm;
- lake surface is calm;
- the camera is far enough that the pattern becomes sub-pixel;
- a shoreline is flat and still.

## Stone wakes

Continue using `WaterInteractionField` / `WaterChunkInteractionResolver`.

The wake should:

- align downstream;
- begin at the obstacle rather than surround it symmetrically;
- become weaker/broader downstream;
- not create foam around fully submerged tiny stones when it is visually implausible.

## Anti-flicker

- Fade small foam frequencies with `waterDetailWeight`.
- Avoid hard `smoothstep` thresholds that create isolated one-pixel white sparkles at distance.
- Prefer broad masks multiplied by a higher-frequency breakup signal.

## Acceptance

- Calm water can have almost no foam.
- Rocks/riffles create believable local foam/wakes.
- There is no continuous white shoreline ring.
- Foam does not shimmer badly while the camera moves.

---

# Phase W7 — Refraction: correctness first, extra pass second

> **Status: ✅ DONE** — Stage 1 view-ray + flow wobble offset remains the
> default. Stage 2 scene refraction is an explicit non-goal for this pass.

## Objective

Distort what is seen through the water enough to communicate refraction without forcing an expensive render architecture onto mobile.

## Stage 1 — bed-only refraction

This is the default first implementation.

Use water slope/normal to slightly distort the bed sampling/placement where it is visible.

The distortion must:

- decrease in extremely shallow water;
- remain subtle in ordinary streams;
- scale with water depth and surface slope;
- never make the riverbed “swim” across the character because the bed remains an actual depth-tested layer.

If the bed material samples a procedural texture in world space, distort the bed texture lookup based on water slope rather than moving the bed geometry horizontally.

## Stage 2 — optional scene refraction

True refraction of terrain/character behind the water requires access to rendered scene color.

Only add this if W1–W6 are complete and measured headroom exists.

Preferred options to evaluate:

1. Three.js physical transmission if it integrates cleanly with the current renderer and produces correct scene ordering;
2. one shared low-resolution opaque-scene color target sampled by water.

Constraints:

- desktop/high profile only;
- compact/mobile must not require the extra scene pass;
- no per-water-chunk targets;
- avoid recursive water rendering;
- do not make the water renderer own a general post-processing framework merely for one effect.

## Acceptance

Stage 1 is sufficient for the initial AAA pass if the water reads convincingly.

Stage 2 ships only if its visual improvement is obvious in side-by-side captures and its cost stays inside the measured frame budget.

---

# Phase W8 — Caustics belong on the bed

> **Status: ✅ DONE** — Caustics moved to `WaterBedMaterialShader.ts` and gated
> to shallow water. Lambert lighting keeps them off the character.

## Objective

Move the impression of focused sunlight to the surface receiving it instead of tinting everything seen through the water.

The current water surface shader contains a fake caustic term. Once the dedicated bed layer is stable, migrate the caustic effect to `WaterBedMaterialShader.ts` where practical.

## Behavior

- visible only in shallow water;
- tied to the same surface/flow time so it moves coherently;
- stronger with direct sun, weaker in shadow if a cheap sun/exposure signal is already available;
- low contrast;
- no caustic pattern painted over the character.

Do not add a real caustic simulation or light-space render pass.

## Acceptance

- Shallow bed receives subtle moving light.
- Character/cape are not covered by bed caustic texture.
- Deep water has little or no caustic visibility.

---

# Phase W9 — Sun glint and material response

> **Status: ✅ DONE** — Glints come from the sun half-vector on the perturbed
> normal; flow noise only breaks up the highlight. Micro glints still fade with
> `waterDetailWeight`.

## Objective

Give water a recognizable directional highlight without turning the surface into glitter.

The existing glint noise should be subordinate to the physical light response.

## Work

- Use the perturbed water normal and world sun direction for the main directional specular response.
- Keep roughness low enough for water but not uniformly mirror-like.
- Use flow noise only to break up/elongate the highlight, not to generate bright pixels everywhere.
- Make micro glints fade with distance.
- Let foam increase roughness and reduce clear reflection naturally.

Relevant files:

- `WaterShader.ts`;
- `WaterMaterialController.ts`;
- `WaterMaterialTuning.ts`;
- existing environment/sun tuning.

## Acceptance

- Turning relative to the sun changes the water highlight noticeably.
- A river can show an elongated sun streak.
- Away from the sun, the surface does not sparkle randomly.

---

# Phase W10 — Surface geometry policy

> **Status: ✅ DONE** — `WaterChunkGeometry.ts` creates smooth hydrology-driven
> water sheets with per-vertex gradient normals (`resolveWaterSurfaceGradient`)
> and no high-frequency vertex displacement.

## Objective

Keep water geometry responsible for body shape and shoreline coverage, not small waves.

For streams/lakes in this project:

- surface elevation follows the hydrology solution;
- large geometric discontinuities should be avoided;
- ordinary ripples remain shader-normal effects;
- do not vertically displace every water vertex with high-frequency waves;
- preserve conservative bounds and terrain/water continuity during chunk LOD changes.

If a future ocean system is added, it can have a different geometry policy. Do not turn the current river/lake system into an ocean renderer.

## Acceptance

- Water silhouette is smooth.
- Ripples do not visibly alter the shoreline mesh edge.
- Terrain LOD changes do not cause water sheets to pop vertically.

---

# Phase W11 — Compact/mobile quality policy

> **Status: ✅ DONE** — Compact profile scales detail distance, flow noise,
> glints, caustics, and stone wakes through the streamer, not user-agent checks.

## Objective

Preserve the water identity while scaling expensive frequency/detail work.

Compact/mobile should retain:

- correct bed occlusion;
- depth absorption;
- Fresnel;
- flow direction;
- broad wave normals;
- wet shoreline;
- basic contextual foam.

Compact/mobile may reduce or disable:

- micro ripple octave/detail distance;
- sparse procedural glints;
- detailed caustic breakup;
- expensive stone-wake detail at long range;
- any optional scene-color refraction;
- any optional planar reflection.

Do not reduce quality by changing the hydrology shape or ecological shoreline identity between profiles.

If profile-specific values are needed, expose them through the existing runtime/profile architecture rather than user-agent conditionals inside the water shader.

---

# Phase W12 — Performance and resource policy

> **Status: ✅ DONE** — `TerrainStreamer.ts` shares single material controllers
> and generated textures. No per-frame texture generation or per-chunk material
> cloning. `WaterChunkInteractionResolver` uses frame-budgeted processing.
> Shader detail falls with distance as `waterDetailWeight` reaches zero.

## Rules

- One shared `WaterMaterialController` per world/streamer.
- One shared `WaterBedMaterialController` per world/streamer.
- One shared generated flow texture and bed texture per controller.
- No per-frame texture generation.
- No per-chunk material cloning.
- No arrays/objects allocated per water fragment/update on the CPU.
- Distance-gate micro detail before it aliases.
- Keep optional render-target features desktop-only and evidence-driven.
- Do not increase terrain streaming build spikes by doing expensive water preprocessing inside every vertex more than once.

## Performance acceptance

Use W0 as the contract.

Targets:

- the surface/bed correctness fix should not materially change frame time beyond the already-present separate bed draw;
- compact/mobile remains in the same stable frame-rate tier;
- no new mandatory full-scene render pass;
- water shader cost falls with distance as detail weights reach zero;
- traversal does not leak materials, textures, render targets, or geometries.

If an optional reflection/refraction pass costs enough to threaten the frame tier, disable it before reducing correct depth, Fresnel, or absorption.

---

# Phase W13 — Verification and regression gates

> **Status: ✅ DONE** — `verify-water-render-contract.mjs` and `test:water-render`
> enforce opaque bed depth, surface/bed ownership, absorption, and compact
> quality. Hydrology assertions match the W1 depth contract. Manual screenshot
> matrix remains a visual sign-off step.

## Extend existing verification first

Prefer extending:

- `scripts/verify-hydrology.mjs`;
- `scripts/verify-water-flow.mjs`;
- `scripts/verify-config-contracts.mjs`.

Useful hydrology assertions:

- water depth is finite and non-negative where coverage is visible;
- surface height is above/equal to the resolved bed/terrain height by the expected depth;
- shoreline coverage changes continuously enough for the configured mesh resolution;
- river flow remains downhill/consistent with the field contract;
- no NaN/Infinity values enter packed water attributes.

Useful shader/render assertions:

- surface shader does not own bed pebble/sand/algae sampling after W1 completes;
- bed shader/controller is the sole owner of bed texture/color uniforms;
- water surface remains depth-tested and transparent with depth-write policy explicit;
- bed material remains depth-tested with a state that cannot blend over nearer character geometry;
- material cache keys change if compile-time shader structure changes;
- new config parameters are validated and consumed.

## Optional focused verifier

If the ownership/depth contract becomes awkward to assert inside the existing scripts, add one focused script:

`scripts/verify-water-render-contract.mjs`

It should statically verify only renderer ownership/state invariants, not duplicate hydrology math tests.

If added:

- add `test:water-render` to `package.json`;
- include it in the normal `npm run build` chain near the other water tests.

## Required commands

At minimum:

```bash
npm run test:config
npm run test:hydrology
npm run test:water-flow
npm run test:terrain-surface
npm run test:ecology
npm run test:stones
npm run test:navigation
npm run build
```

Run a new `test:water-render` too if W1 introduces that verifier.

## Manual visual matrix

For desktop and compact/mobile:

- [ ] very shallow clear water, top-down;
- [ ] shallow water, grazing angle;
- [ ] medium-depth river;
- [ ] deep lake;
- [ ] calm shoreline;
- [ ] wet muddy bank;
- [ ] grass-to-water transition;
- [ ] stone obstacle and downstream wake;
- [ ] direct sun highlight;
- [ ] view away from sun;
- [ ] character fully in front of water;
- [ ] character partly submerged;
- [ ] cape/body over visible shallow bed;
- [ ] camera moving across a terrain chunk boundary;
- [ ] camera moving from near to beyond `waterDetailDistance`;
- [ ] upstream/downstream motion comparison.

The occlusion tests are release blockers.

---

# Recommended commit sequence

Implement in small, independently reviewable commits:

1. `water: finish physical bed render ownership`
2. `water: remove legacy bed overlay from surface shader`
3. `water: refine depth absorption and Fresnel balance`
4. `water: tune flow-aligned macro and micro normals`
5. `terrain: add coherent wet shoreline response`
6. `water: refine foam and stone wakes`
7. `water: move shallow caustics to bed material`
8. `water: refine sun glint and distance detail`
9. `test: strengthen water render and hydrology contracts`
10. `perf: tune compact water quality`

Optional scene-color refraction or planar reflection should be separate later commits so they can be reverted without touching the core water correctness work.

---

# Definition of done

The water work is complete when all of the following are true:

- [ ] Water reads as water immediately in the normal third-person camera.
- [ ] The river/lake bed is a real depth-tested layer below the water surface.
- [ ] Pebbles, sand, algae, and bed caustics never render on top of the character.
- [ ] The surface shader has no duplicate legacy bed rendering path.
- [ ] Shallow water clearly exposes the bed and deep water progressively absorbs it.
- [ ] Grazing views reflect more strongly than top-down views through Fresnel.
- [ ] Rivers show directional downstream motion.
- [ ] Lakes remain calmer and less directional.
- [ ] Micro ripple detail fades before becoming noisy at distance.
- [ ] Foam appears mainly at energetic shallow flow, riffles, and obstacles rather than as a continuous decorative border.
- [ ] Shorelines transition through wet/damp ground before normal grass.
- [ ] Water, terrain, grass, and stones agree about the same hydrology state.
- [ ] Sun glints are directional and restrained.
- [ ] Compact/mobile keeps correct depth, absorption, Fresnel, and flow without requiring an additional full-scene pass.
- [ ] Chunk streaming produces no water/bed culling pop or resource leak.
- [ ] `npm run build` passes from a clean working tree.
- [ ] The complete manual screenshot matrix is reviewed.

## Explicit non-goals

Do not add these during the first execution pass:

- full fluid/CFD simulation;
- screen-space reflections as a requirement;
- per-chunk planar reflection cameras;
- mandatory full-resolution scene refraction;
- high-frequency geometric wave displacement for rivers;
- volumetric ray marching;
- physically simulated caustics;
- separate shoreline distance textures that duplicate hydrology;
- water effects that are only acceptable on desktop but destroy compact/mobile composition.

## Deployment

This repository does not use GitHub Actions.

After implementation and local verification:

```bash
npm run build
npm run deploy:pages
```

Run the manual GitHub Pages deployment only from a clean working tree.