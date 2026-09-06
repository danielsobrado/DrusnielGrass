# AAA look: what is already built, and what is actually missing

Status: audit + revised plan
Date: 2026-08-14
Companion to [aaa-grass-execution-plan.md](aaa-grass-execution-plan.md) and
[../grass-aaa-look-plan.md](../grass-aaa-look-plan.md).

## Why this document exists

A screenshot-derived review of this project proposed a 23-item programme:
ecological grass distribution, clumping, curved blades, transmission, layered
colour, ground/grass coupling, a representation-changing LOD ladder, character
interaction, water Fresnel, depth absorption, multi-scale normals, contextual
foam, refraction, caustics, aerial perspective, ACES, and character integration.

The advice is sound as generic direction. It is also, in this codebase, mostly a
description of what already ships. Executing it as written would mean rebuilding
tuned systems and calling the result progress.

This document records what was verified present, so that the next look pass
spends its effort on the parts that are genuinely absent.

## Audit

Verified by reading the implementation, not by inference from behaviour.

| Proposed item | Status here | Evidence |
| --- | --- | --- |
| Macro ecological distribution | Built | `WorldEcologyField` derives moisture, fertility, exposure, disturbance, and rockiness from landform, hydrology, and traffic; terrain colour, grass placement, and stone placement all read the one sampler |
| Grass clumps, not scattered blades | Built | `WorldSingleBladeTileFactory` places 3×3 `CLUMP_CELLS` tufts with per-clump radius, aspect, ellipse angle, and heading |
| Curved, tapered blades | Built | `uGrassBladeCurvature`, width taper, segmented ultra-near tier, gated by `verify-grass-shape-continuity` |
| Translucency / transmission | Built | `backlightStrength` shared by near, impostor, and detail-foliage materials so the LODs cannot disagree |
| Layered colour | Built | `GRASS_PALETTE_GLSL` over base/tip/dry × progress × shade × dryness × root AO, plus `GrassFieldVariation` macro fields and per-biome palette rows |
| Ground and grass as one ecosystem | Built | `TerrainMaterialShader` blends soil, biome underlayer, and canopy from the same attributes the grass reads, and merges to canopy colour at distance |
| LOD changes representation | Built | 6 m ultra-near → 18 m bridge → 28 m near → 80 m mid → 280 m far → octahedral impostors → horizon shell |
| Character grass interaction | Built (bend only) | `GrassTrailField` ping-pongs a world-space crush and direction map with per-blade stiffness and recovery |
| Water surface / volume / bed separated | Built | The bed is its own mesh, pushed to `y - depth` in its vertex shader, with its own material |
| Water Fresnel | Built | Schlick, `uWaterFresnelStrength` |
| Multi-scale normals | Built | Lake waves, river waves, micro slope, and flow-advected noise — four scales, not two |
| Depth absorption | Built | `1 - exp(-depth / fade)` driving both colour and opacity |
| Contextual foam | Built | Shore band, riffle pattern, and stone wake, each depth-masked |
| Bed refraction | Built | View-ray offset scaled by depth and grazing angle |
| Reflections | Built at the recommended tier | Sky PMREM on desktop, Fresnel, flat reflection tint; no SSR or planar, which is what the review also recommended |
| Sun specular | Built | `MeshPhysicalMaterial` at roughness 0.12 |
| Caustics | Built | `uWaterCausticStrength`, gated on shallow depth |
| Smooth water geometry | Built | No vertex displacement on the surface; all movement is in the shader |
| ACES and exposure | Built | `WorldApp` sets ACES; exposure 1.15 |
| Aerial perspective | Partial | `FogExp2` in one flat colour, which cannot match a sky that runs from `#8ec0e8` at zenith to `#d5e4c8` at the horizon |
| Shoreline transition | Partial | Terrain darkens and dries by water proximity, but had no gloss response |
| Character integration | Absent | Near-silhouette palette, no rim, and the shadow it casts never reaches the grass |

Nineteen of twenty-two substantive items were already present, several built
further than the review described.

## Correction: the audit was right about the code and wrong about the frame

Everything above is true of the source. It is not true of what the renderer was
putting on screen. A settled capture at 7.2 M blades showed the same flat green
carpet, speckled horizon, and murky sky the review complained about — so the
review's *diagnosis* was fair even where its prescription was redundant.

The lesson is that "the system exists" and "the system reads" are different
claims, and only the second one is about the look. What follows was found by
sampling rendered pixels, not by reading code.

### The sky was never the colour it was configured to be

Measured at frame centre, climbing: `#5b8447`, `#5a8455`, `#507a60`, `#477268` —
a dark olive-teal. The palette plus ACES says that band should read `#d6dcd1`
fading to `#b3cfdf`: a pale blue-white haze.

Two defects in `WorldSky`, compounding:

1. `linearColor()` did `new THREE.Color(hex).convertSRGBToLinear()`. Colour
   management is on, so the constructor had already taken the literal into the
   linear working space; the explicit call applied the transfer function a
   second time.
2. The dome is a `ShaderMaterial`, which gets none of the output pipeline
   automatically, and its fragment shader ended at `gl_FragColor = ...`. No
   `<tonemapping_fragment>`, no `<colorspace_fragment>` — so it wrote linear
   radiance straight into an sRGB framebuffer and skipped the ACES curve every
   other material in the scene is graded through.

Reproducing both in plain JS predicts `#598244` and `#5b8448` where the frame
measured `#5b8447` and `#5a8455` — within 3/255 per channel, which is what
turned this from a suspicion into a diagnosis. The horizon shell and the reveal
overlay were both ruled out first by disabling them and re-measuring.

The blast radius is larger than the sky, because the PMREM environment is baked
from a clone of this same material: every reflection in the world — water,
metal, and the character's environment light — was being handed a dark green
sky. After the fix the same band measures `#d0dad9`–`#d6dcd1`.

**This brightens the whole scene's ambient.** The exposure grade was tuned
against the broken sky, so `WORLD_DEFAULT_EXPOSURE` deserves a fresh look now
that it is lit by the intended one.

## The gaps that were real

### 1. Nothing the character does reaches the grass

`WorldGrassSystem` clears `castShadow` and `receiveShadow` on every mesh it
builds. The character's shadow lands on terrain and stops there; grass in its
shadow stays fully lit. Of everything in the audit this is the one that most
makes the frame look composited, and it is invisible in a still screenshot
review because it presents as "the character looks pasted on" rather than as a
missing feature.

Shipped: `GrassGroundShadow`, an analytic contact disc evaluated per blade in
the vertex stage. No texture fetch, no draw call, no fragment cost on the
highest-overdraw layer in the frame, and no LOD shimmer.

Not attempted: real shadow-map receipt on grass. A PCF lookup per fragment on
the near layer costs more than the rest of the shadow pass together, and the
performance work this project has already done exists specifically to avoid
that class of cost.

### 2. The water's edge could not glisten

Wet ground reads as wet through gloss. The terrain is `MeshLambertMaterial`,
which has no specular lobe at all, so proximity to water could only ever darken
the albedo — which produces mud, not wetness.

Shipped: a narrow lobe taken off the directional light's own view-space
direction, cut from the top of the water-proximity ramp and cancelled by grass
cover.

### 3. The character carried no environment light

A near-black costume in a bright meadow, with no rim and no bounce. The sky IBL
covers part of this on desktop and does not exist on the compact profile.

Shipped: a skyward rim and a meadow-tinted ground bounce, the bounce scaled by
the surface's own colour so it does not grey out the costume's blacks.

## Still open, in the order I would take them

1. **Sky-matched aerial perspective.** Replace the flat `FogExp2` colour with a
   view-direction sample of the sky gradient. Distant geometry currently
   converges on a colour the sky behind it does not share, which is most
   noticeable on a skyline seen against the upper sky. This is the largest
   remaining atmospheric item and the one the review was right to name. It
   touches every material's fog chunk, so it wants its own pass.
2. **Stone and tree shadows onto grass.** The same absence as the character, at
   larger scale. The `GrassGroundShadow` disc generalises to a small bounded set
   of occluders before anything as expensive as a shadow map is warranted.
3. **Wet band from the bank field, not the humidity halo.** `RiverField` already
   computes `bank` on a `riverBankWidth` falloff, which is the honest signal for
   wetness; it is not currently forwarded into the terrain's environment
   attribute. The shipped sheen cuts the top off `proximity` instead, which is a
   good approximation and not the real field.
4. **Grass colour response to the trail.** The crush map drives bending only.
   Trampled grass is also darker, and the sample is already being taken.

## What not to do

Raising saturation and contrast, adding bloom, or increasing blade counts.
Density is not the problem — the field streams past 8 M blades — and the palette
is already luminance-balanced across presets by `setBalancedGrassPaletteColors`.
Every one of those changes would cost frame time and move the look away from the
reference rather than towards it.
