# Drusniel World

Drusniel World is a Three.js grass-rendering and third-person character demo focused on dense vegetation, smooth grass LOD transitions, procedural animation, and mobile-friendly performance.

The default experience places an articulated Drow ranger inside a very dense interactive grass field. The closest grass is made from individual blades, while progressively cheaper patch and impostor representations maintain visual density at distance.

## Live demo

- GitHub Pages: [https://danielsobrado.github.io/FluffyGrass/](https://danielsobrado.github.io/FluffyGrass/)
- Add a cache-busting query when testing a new deployment, for example `?v=<commit>`.
- Add `?control=fly` to use the flight controller instead of the third-person character.

## Current feature set

- Extra individually instanced grass in the ultra-near camera band: 2× total density on desktop and 1.5× on compact devices.
- Curved segmented blades in the ultra-near band and curved one-triangle silhouettes throughout the wider near field.
- Dense individually instanced grass throughout the normal near LOD.
- Multi-blade patch geometry for the middle LOD.
- Hemi-octahedral atlas impostors for the far LOD.
- Dithered cross-fades between grass representations.
- Streamed terrain, grass, and procedural stones.
- Procedural walking ways: bare dirt paths worn through the grass field.
- Persistent character footfalls, body contact, and grass recovery.
- Landing shockwave that briefly pushes and flattens nearby grass.
- Third-person walking, running, jumping, camera orbit, zoom, and mobile controls.
- Procedural Drow ranger with layered clothing, cloak, hair, and secondary spring motion.
- Rolling average FPS diagnostics instead of a total frame counter.
- Strict flat YAML configuration with duplicate and unknown-key rejection.

## Grass rendering architecture

The grass system deliberately uses a different representation for each distance band. Dense individual blades are reserved for the closest LODs. Multi-blade patches and impostors are used only when individual blades become too expensive.

The default transition distances come from the `lush-hero` art preset. The ultra-near detail radius comes from the world configuration.

| Distance from camera | Representation | Purpose |
| --- | --- | --- |
| `0–6 m` | Normal single-blade field plus segmented base detail, at doubled density | Maximum close-range density, curvature, and bend detail. |
| `6–7 m` | Segmented detail dithering out to one-triangle blades | Swaps blade *form* only. Density does not change here. |
| `8–20 m` | Doubled density decaying to single density | Carries the extra population out on one-triangle blades instead of ending it with the segmented detail. |
| `7–16 m` | Dense curved one-triangle individual blades | Maintains close-range density and interaction at lower cost. |
| `16–20 m` | Individual blades handing off to the bridge layer | Exact placements are preserved across the handoff. |
| `20–36 m` | Individual blades crossfading to full-density patch geometry | Preserves density through the near/mid transition. |
| `36–46 m` | Full-density patch geometry | Avoids redundant impostor overdraw in the middle band. |
| `46–62 m` | Patch geometry crossfading to impostors | Smoothly enters the far representation. |
| `62–272 m` | Hemi-octahedral impostors | Maintains view-dependent silhouettes near the streamed horizon. |
| `272–288 m` | Impostors fading into terrain | Avoids a hard grass cutoff at the world edge. |

The table shows the default `lush-hero` preset. Runtime preset values in `src/grass/GrassArtPresets.json` select the active near, mid, far, and transition distances. The values in `public/config/world.yaml` provide validated world and streaming limits:

```yaml
grassNearDistance: 28
grassMidDistance: 80
grassFarDistance: 280
grassTransitionDistance: 8

# Where the doubled blade population decays, and the world-space range over
# which a blade stops being shaded as an individual leaf. Neither is a LOD
# boundary; see "Near-field shading and density schedule" below.
grassNearDensityBoostDistance: 14
grassNearDensityBoostTransition: 6
grassMicroDetailFadeStart: 3
grassMicroDetailFadeEnd: 10
```

### Ultra-near LOD

The first 6 m uses the segmented form of the normal blade set plus an independently seeded single-blade layer. The normal near field remains present, but inside the detail radius its matching one-triangle blades are partitioned out while the segmented representation carries them. The additional layer contributes extra density without duplicating blades at identical positions.

```yaml
grassUltraNearDistance: 6
grassUltraNearTransitionDistance: 1
grassUltraNearDensityMultiplier: 2
grassUltraNearDensityMultiplierCompact: 1.5
```

The extra density and segmented detail are fully visible through 6 m and use a stochastic fade from 6–7 m. The very close layers are streamed only around the camera and are prioritized after spawn and tile crossings.

### Normal near LOD: individual blades

The normal near LOD is owned by `WorldNearGrassField` and uses individually instanced blades in streamed 8 m tiles.

Default densities:

```yaml
grassNearBladesPerSquareMeterDesktop: 84
grassNearBladesPerSquareMeterCompact: 40
```

The production `WorldGrassSystem` initializes and updates `WorldNearGrassField` directly. `ThirdPersonController` only drives character motion and the shared interaction field, preventing a duplicate grass allocation. The older streamed multi-blade near mesh remains disabled, so close grass is not represented by patches.

Both close single-blade layers receive the full character interaction deformation. Roots remain planted while blade tips bend and flatten around the character. All near blade forms use the configured rest arc, so switching between segmented and one-triangle geometry does not change the blade tip model.

### Middle LOD: full-density patches

The middle LOD uses procedural multi-blade patch geometry and retains every source blade. The patch blades use the same configured rest-curve model as the near blades. Because that geometry provides full density, far impostors remain out of the middle band and enter only during the mid-to-far crossfade. The production impostor footprint is widened by 12% to overlap neighboring patch cells and hide exposed terrain seams.

```ts
export const GRASS_MID_IMPOSTOR_UNDERFILL = 0;
export const GRASS_IMPOSTOR_FOOTPRINT_SCALE = 1.12;
```

This removes redundant middle-distance overdraw while patch geometry provides the full blade density, local volume, and parallax.

### Far LOD: hemi-octahedral impostors

The production renderer bakes a multi-view grass atlas and selects a view through hemi-octahedral direction encoding. One far instance represents four 2×2 m subpatch cards, and the atlas allocation is capped at 2048 pixels per axis. The bake uses the same curved blade-tip model as the real geometry, and its conservative bounds include the curve's horizontal reach.

The impostor shader includes:

- View-dependent atlas frame selection.
- Optional blending between adjacent atlas frames.
- Wind motion.
- Stochastic coverage dithering.
- Field suitability coverage.
- Terrain-color matching for elevated camera angles.
- Stream fade and terrain-horizon fade.

### Near-field shading and density schedule

Two schedules run across the near field that are deliberately *not* LOD boundaries.

**Micro-detail fade** (`grassMicroDetailFadeStart` / `End`, 3–10 m) is where a blade
stops being shaded as an individual leaf: the troughed normal flattens toward world
up, per-blade tone variation collapses, and flutter stops. Every near and mid
material is given the identical range.

It used to be derived from each material's own `nearMaxDistance`, which made it five
different schedules — the ultra-near layer finished flattening at 3.4 m, the base
layer at 9.4 m, the mid at 14.6 m. Inside the ultra-near band two co-located blade
populations were therefore lit differently (0.78 against 0.46 flattening), so the
field dipped as the brighter half faded out and recovered over the next three metres.
That dip and recovery rode at a fixed radius around the camera and read as a
brightness ring while walking. `verify-lod-continuity` now fails if the range is
derived from any LOD distance, or if the layers are given different ranges.

**Density boost** (`grassNearDensityBoostDistance` / `Transition`) carries the doubled
blade population out on one-triangle geometry, at full strength to 8 m and decaying to
20 m. The doubling used to end where the segmented silhouette ended, so density halved
across a single metre at the same radius the shading stepped. Detail is worth six
triangles per blade only where a blade is large on screen; coverage is not, and
coverage is what stops the ground showing through.

**One-triangle palette lift.** Base, bridge and mid blades are a single triangle whose
only progress values are 0 and 1, and those layers resolve the palette per vertex — so
the rasteriser draws a chord under a curve that is strongly concave, because
`rootLight` and `groundContact` both saturate in the bottom half of a blade. Measured
area-weighted over the tapering triangle, that chord was **22.8% darker** than the
per-fragment path the segmented blades use, and the step landed at exactly the radius
where the two representations swap. The root vertices now evaluate the palette at
`GRASS_VERTEX_PALETTE_ROOT_PROGRESS`, derived from the palette tuning so the chord
carries the true area-weighted mean; the residual is 1.5%. This costs no triangles.
`verify-lod-color-parity` re-derives the constant and bounds the residual across every
preset and biome.

**Ground under the canopy.** `terrainGroundCanopyDarkening` is 0.34, and the dark
dry-fibre speckle holds its *mean* as terrain micro detail fades so only the variance
disappears — otherwise the ground brightened at the micro-detail cutoff, which sits at
the same 6–7 m radius. That mean is `TERRAIN_DRY_FIBRE_PULSE_MEAN`, measured over the
noise field rather than estimated: the fibre channel is a carrier-modulated sine, so
the knee positions do not predict it (0.082 measured against 0.155 for a uniform).
`verify-terrain-surface` re-measures it across seeds and fails on drift.

#### Measured result

Captured from a fixed open-meadow pose (`ab-ring-eye`, x=588 z=372, chosen for full
grass suitability and no water or path within 40 m) against the commit before these
changes, same seed and camera. Mean luminance by ground distance:

| Band | Before | After | Change |
| --- | --- | --- | --- |
| 4–6.5 m ultra | 0.4018 | 0.3974 | −1.1% |
| 6.5–10 m ring zone | 0.4023 | 0.4042 | +0.5% |
| 10–16 m base | 0.3635 | 0.3888 | +7.0% |
| 16–28 m bridge | 0.3434 | 0.3821 | +11.2% |
| 28–45 m mid | 0.3483 | 0.3836 | +10.1% |

Near-to-far spread across the bands fell from 0.0588 to 0.0221 — **flattened by 62%**.
The near band is essentially unchanged; everything past the handoff came up to meet it.

Ground coverage over the same pair, measured as the fraction of green-dominant pixels:
78.3% → 87.1% in the mid band, and 33.0% → 43.2% looking down from 7 m, the worst case
for vertical blades. Resident near blades rose from 216k to 386k.

The fixed A/B poses live in `src/qa/WorldVisualMatrixPoses.ts` (`ab-ring-eye`,
`ab-ring-side`, `ab-ring-down`) with hardcoded coordinates, because a comparison is
only meaningful if both trees frame identical ground — the scanned landmark poses in
this seed all land on the riverbank.

### LOD continuity rules

The grass LOD system follows these rules:

1. The additional ultra-near layer only adds density; it does not replace the normal blade population.
2. Individual blades never remain as a world-wide distant representation.
3. Multi-blade patches do not render as the closest character-level grass.
4. Full-density patches carry the middle band without a redundant impostor layer.
5. Every transition overlaps through stochastic coverage rather than switching meshes abruptly.
6. Color, wind response, blade rest shape, height, and root placement must remain visually compatible across representations.
7. Terrain and grass streaming radii must be large enough to contain the configured LOD fades.
8. Shading schedules are keyed to world distance, never to a LOD boundary. A blade at a given distance must be lit the same way whichever layer draws it.
9. Density changes and representation changes must not share a boundary. Stacking them makes a single radius carry every discontinuity at once.

Run the LOD and blade-shape continuity verification with:

```bash
npm run test:lod
npm run test:grass-shape
```

## Walking ways

Bare dirt paths are worn through the grassland. A way is the zero contour of a domain-warped value-noise field. Two fields at different scales — a main way and a finer branch — give a network whose ways cross each other. Ways fade out as the ground climbs out of the rolling grassland onto a mountain flank.

`TerrainField.samplePathDistances` reports the signed distance in metres to each way's centreline. The terrain uses that distance for shading and grass placement uses the same field to keep blades off the tread. Near blades and accent foliage preserve the same path and stone feather as density coverage so the verge does not grow when a closer LOD streams in.

```yaml
pathWidth: 3
pathBranchWidth: 1.7
pathSpacing: 640
pathEdgeRoughness: 0.5
pathGrassClearance: 0.15
```

## Interactive grass physics

The closest grass samples a persistent GPU crush texture centred on the character. The simulation stores contact direction, crush amount, and recency, then decays them over time.

### Walking and running contacts

The controller submits both feet and a body contact. Foot positions follow the character stride and movement direction, so footprints remain visible after the character passes instead of following one temporary capsule.

```yaml
grassInteractionStrength: 0.94
grassInteractionSpeedForFullEffect: 4
grassTrailResolution: 256
grassTrailCoverage: 24
grassTrailRecoveryRate: 0.5
grassTrailFreshnessRate: 1.4
grassFootContactRadius: 0.32
grassFootContactStrength: 1
grassBodyContactRadius: 0.4
grassBodyContactStrength: 0.5
```

### Landing pulse

A sufficiently strong landing adds an expanding radial pulse to the same persistent interaction field.

```yaml
grassLandingPulseRadius: 2.4
grassLandingPulseStrength: 1.05
grassLandingPulseDecay: 5.2
```

## Procedural stones

Stone placement and geometry are deterministic and configuration-driven. The current stone set includes pebbles, boulders, slabs, blocks, shards, and outcrops. Close variants add sparse chips and larger archetypes can receive shallow faceted recesses without changing the underlying watertight polyhedron contract.

World configuration controls density, clustering, grass clearance, streaming radius, close-detail radius, batching, and biological surface growth. Stone verification checks deterministic generation, topology, metrics, and configured runtime limits as part of every production build.

## Drow character

The original Snowflow-inspired character was rebuilt as Drusniel, a stylized Drow ranger.

Visual elements include:

- Grey-violet skin.
- Long white hair.
- Long pointed ears.
- Bright eyes.
- Folded-back hood.
- Fur shoulder mantle.
- Layered tunic and split skirt.
- Rear and side cloak panels.
- Leather harness, waist wrap, belt, bracers, medallion, and dagger.

### Rig type

The character uses a hierarchy of `THREE.Group` transform joints rather than a conventional skinned skeletal mesh. This is suitable for the current stylized movement and jump animation. A skinned glTF humanoid rig would be a better long-term choice for complex combat, climbing, hand poses, facial animation, or animation-clip retargeting.

## Jump system

Jumping uses terrain-aware controller physics rather than moving the model with a visual-only animation.

Features:

- Vertical velocity and configurable gravity.
- Stronger gravity while falling.
- Variable jump height while the jump input is held.
- Reduced air control.
- Coyote time after leaving the ground.
- Buffered jump input before landing.
- Terrain collision and landing detection.
- Impact-dependent landing recovery.
- Landing grass pulse.

Default jump configuration:

```yaml
characterJumpSpeed: 7.4
characterGravity: 23
characterFallGravityMultiplier: 1.42
characterAirControl: 0.38
characterCoyoteTime: 0.13
characterJumpBufferTime: 0.14
characterJumpHoldTime: 0.17
characterJumpHoldGravityScale: 0.42
characterLandingRecoveryTime: 0.3
characterLandingImpactForFullEffect: 10.5
```

### Procedural animation state machine

The character transitions through:

```text
idle → walk/run → takeoff → rise → apex → fall → land
```

### Secondary motion

Cloak and hair groups use damped procedural springs. Movement, local acceleration, vertical velocity, and landing impulses drive the cape and hair. Frame deltas and spring inputs are bounded so stalls or invalid values cannot poison the motion state.

## Controls

### Desktop

| Input | Action |
| --- | --- |
| `WASD` or arrow keys | Move |
| `Shift` | Run |
| `Space` | Jump; hold briefly for additional height |
| Mouse movement | Orbit while pointer-locked |
| Mouse wheel | Zoom |
| `F` | Reset to spawn |

### Mobile

- Drag on the left side to move.
- Drag on the right side to orbit the camera.
- `JUMP` jumps and supports short hold duration.
- `RUN` enables sprinting.
- `⌂` resets the character.

### Flight mode

Append `?control=fly` to the URL to disable the third-person controller and use the flight controller.

## Diagnostics

The normal HUD reports rolling FPS and high-level world state, including separate terrain, stone, grass, and draw timings. Deeper workload instrumentation is opt-in so it does not wrap the production render path by default.

Use query flags only when needed:

- `?diagnostics=1` enables workload diagnostics.
- `?gpuTiming=1` requests GPU timing when supported.
- `?stats=1` enables the optional `stats-gl` panel.
- `?accentAtlas=1` shows the generated detail-foliage atlas debug view.

## Configuration

Main world tuning is stored in `public/config/world.yaml`. Grass geometry, material, wind, distribution, QA, and impostor-atlas settings are stored in `public/config/grass.yaml`. Responsive rendering settings are stored in `public/config/runtime.yaml`.

Configuration loading is strict:

- Unknown keys fail startup.
- Duplicate keys fail startup.
- Missing values fail startup.
- Invalid number ranges fail startup.
- Grass material colors must be six-digit hex values.
- Cross-field LOD, streaming, camera, movement, clump-shape, and density constraints are validated.
- The far-impostor path requires exactly one instance per 4 m patch; that instance contains four subpatch cards.
- The ultra-near transition must be shorter than the ultra-near distance.
- The ultra-near band must end before the normal near-to-middle fade begins.

When adding a world configuration value:

1. Add the typed field to `src/world/WorldConfig.ts`.
2. Add its primitive validation rule to `src/world/WorldConfigSchema.ts`.
3. Add it to `public/config/world.yaml`.
4. If it depends on another setting, add the cross-field invariant to `src/world/WorldConfigValidator.ts`.

`WorldConfigLoader` is intentionally only the transport/parsing orchestrator and normally does not need to change when a numeric world setting is added.

## Local development

Requirements:

- Node.js 22.20.0+ on the 22.x LTS line, or Node.js 24.18.1+ on the 24.x LTS line, with npm. `.nvmrc` pins Node.js 24.18.1 for local development and production builds.
- A browser with WebGL support.

Install and start the development server:

```bash
npm ci
npm run dev
```

Create a production build:

```bash
npm run build
```

The build command runs:

1. The patched-Node runtime security gate.
2. Application TypeScript compilation.
3. Stone-tool TypeScript compilation.
4. Repository production-policy verification, including the no-GitHub-Actions rule.
5. Runtime lifecycle and safety verification.
6. Architecture responsibility-boundary verification.
7. Shipped world, grass, and runtime configuration contract verification.
8. Grass LOD, blade-shape, color, streaming, placement, and performance verification.
9. Character, actor-rig, navigation, terrain, hydrology, water, ecology, scenic, and stone verification.
10. Vite production bundling with source maps disabled.
11. Generated GitHub Pages artifact verification, including relative paths, CSP/referrer policy, byte-identical public/legal assets, and source-map rejection.

Preview the generated build:

```bash
npm run preview
```

## GitHub Pages deployment

The generated site is published manually to the `gh-pages` branch. GitHub Actions are prohibited in this repository, and `npm run build` fails if a workflow YAML file appears under `.github/workflows`.

Configure GitHub Pages:

1. Open **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Select the `gh-pages` branch.
4. Select the `/ (root)` folder.

Publish from a clean, synchronized `main` checkout using the single hardened deployment entry point:

```bash
npm run deploy:pages
```

The deployment script first rejects unsupported or unpatched Node runtimes. It then requires a clean `main` checkout that exactly matches remote `main`, installs the committed dependency graph with `npm ci`, rejects high/critical npm audit findings, runs the complete production build and generated-site verification, rechecks source state, copies `dist/` into a temporary Git worktree, commits the generated site, rechecks source state again, and pushes it to `gh-pages` without force.

Optional environment variables:

- `GITHUB_PAGES_BRANCH`: deployment branch, defaults to `gh-pages`.
- `GITHUB_PAGES_SOURCE_BRANCH`: source branch, defaults to `main`.
- `GITHUB_PAGES_REMOTE`: Git remote, defaults to `origin`.

## Attribution

The initial procedural character direction was adapted from the character implementation in [Noniv/snowflow_demo](https://github.com/Noniv/snowflow_demo/tree/main/src/character). Drusniel World ports and extends the concept into a native Three.js transform rig with a different character design, controller, animation state machine, clothing geometry, grass interaction, and jump system.
