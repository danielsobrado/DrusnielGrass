# AAA Cloud Shadow System Execution Plan

Status: planned
Date: 2026-08-20
Target branch: `main`
Baseline commit checked before writing: `1b1961dacb1e58447d277b5552889b86ebe1337c`

Companion to:

- [aaa-world-visual-upgrade-plan.md](aaa-world-visual-upgrade-plan.md)
- [aaa-look-audit.md](aaa-look-audit.md)

## 1. Why this needs its own implementation plan

The latest third-person captures expose two separate problems that should not be
mixed together:

1. the visible clouds and their large-scale ground lighting need more natural
   spatial coherence, softer transitions, and less obvious banding/repetition;
2. a very dark/black ground region appears in the captures and must be diagnosed
   before it is blamed on cloud shadows.

The second point matters because the current cloud-lighting code cannot, by
itself, explain a near-black terrain patch. `WorldCloudEnvironmentLighting`
samples one cloud transmittance value near the player and applies it globally to
the directional-light intensity. In the current desktop runtime config the cloud
shadow strength is `0.14` and the direct-transmittance floor is `0.86`; compact is
`0.10` and `0.90`. That path can only reduce direct sun modestly. It does not
project a spatial black mask over part of the terrain.

Therefore the first execution step is a diagnosis gate. Do not tune a new cloud
shadow system around a bug whose actual source may be path shading, terrain
lighting, a material branch, a render-target fault, or another shadow path.

After that diagnosis, the clean target architecture is a single low-resolution,
world-space **cloud transmittance field** shared by all important sun-lit world
materials. It must modulate the direct sun contribution only; it must not paint a
black overlay over final material color.

## 2. Current architecture to preserve

### 2.1 Visible clouds already share a procedural field

`src/world/sky/WorldSkyCloudShader.ts` exports `WORLD_CLOUD_FIELD_GLSL`, used by
both the analytic sky cloud path and `WorldCloudVolumeShader`.

That field already includes:

- deterministic value noise
- two/three-octave FBM depending on profile
- macro cloud coverage
- a warp term
- detail noise
- a slower weather field
- world-space wind motion

Do not build a second independent cloud-noise function for shadows.

### 2.2 Desktop volumetric clouds already have their own temporal render pass

`WorldSkyCloudVolumeController` and `WorldCloudTemporalPass` render the desktop
cloud volume at reduced resolution and temporally accumulate it.

The cloud-shadow implementation must remain independent of the camera-facing
cloud temporal texture. The screen-space temporal texture is not suitable for
world-space ground projection because:

- it only covers the current view;
- it is camera-relative;
- it stores radiance/opacity rather than sun transmittance;
- using it on terrain would cause shadows to swim with the camera.

Reuse the *cloud density field*, not the screen-space cloud render target.

### 2.3 Global weather lighting is useful and should stay

`WorldCloudEnvironmentLighting` currently provides two useful global effects:

- slowly changing weather grade for sun/hemisphere/fog/exposure;
- player-local direct-sun transmittance.

Keep the weather-grade behavior. Do not remove it just because spatial shadows
are added.

The local direct-sun value can remain as the baseline light intensity around the
player. Spatial consumers can then apply a relative local correction:

```text
baseSun       = authoredSunIntensity
focusSun      = baseSun * focusTransmittance
localSun      = baseSun * localTransmittance
relativeScale = localTransmittance / max(focusTransmittance, epsilon)
```

This avoids double-darkening the player area and lets already-unpatched materials
near the player continue to look correct during staged rollout.

## 3. Non-negotiable visual rules

1. Cloud shadows modulate **direct sun only**.
2. Hemisphere/sky light remains visible under clouds.
3. Fog/aerial perspective remains visible under clouds.
4. No cloud field is allowed to multiply final surface color toward zero.
5. `minimumDirectTransmittance` remains a hard safety floor.
6. Shadow boundaries are broad and soft in normal/fair weather.
7. Shadow contrast decreases with atmospheric distance.
8. The projected shadow moves in stable world space with cloud wind.
9. Camera motion does not move the shadow field.
10. Cloud shadow geometry/scale must agree with visible cloud masses well enough
    that the sky and ground read as one weather system.
11. Compact keeps the same macro shadow layout, at lower technical quality if
    required.
12. No per-fragment procedural FBM is added to grass or terrain.

## 4. Phase CS0 - Diagnose the black-region bug before changing shadows

This is a hard gate.

### 4.1 Add temporary diagnostics

Use existing runtime/HUD diagnostics plumbing. Add debug modes for:

- `cloud weather amount`
- `focus cloud direct transmittance`
- `cloud shadow field` once it exists
- `directional shadow-map contribution`
- terrain/path mask if the black region overlaps a path/river feature
- final terrain albedo before lighting if available cheaply

Do not keep multiple duplicate debug implementations. Expose the actual values
already used by the render path.

### 4.2 Reproduce the exact failing pose

Add or reuse a deterministic visual-matrix pose that contains:

- the large black ground area;
- enough sky to see cloud structure;
- terrain, grass, and character together;
- the same desktop profile as the screenshot.

Capture variants with these systems toggled one at a time:

1. clouds disabled;
2. `WorldCloudEnvironmentLighting` direct attenuation forced to `1`;
3. sun shadow map disabled;
4. path visual contribution disabled;
5. terrain custom color block disabled/reduced to base material if practical;
6. grass hidden so terrain can be inspected directly.

The smallest toggle that removes the black area identifies the subsystem to fix.

### 4.3 Expected diagnostic conclusion

If the black region persists while cloud direct attenuation is forced to `1`, it
is not a cloud shadow. Fix that bug independently before continuing.

If it disappears only when the directional shadow map is disabled, inspect
shadow-map bias/frustum/material receive behavior.

If it disappears only when path/terrain branches are disabled, fix the terrain
material branch.

Do not continue by raising ambient light globally. That would conceal the bug and
flatten the entire scene.

### 4.4 CS0 exit gate

- source of the black region is identified;
- no cloud-specific code is blamed without evidence;
- a fixed capture pose exists for regression testing;
- cloud-shadow work starts from a frame with no unexplained black surface.

## 5. Phase CS1 - Extract one reusable cloud-density shader module

The current density functions live in `WorldSkyCloudShader.ts`, while the volume
shader imports them from there. Shadows will become a third consumer. Split the
field from sky-specific cloud lighting before adding more consumers.

### 5.1 Add

`src/world/sky/WorldCloudFieldShader.ts`

Move/export:

- `cloudHash12`
- `cloudValueNoise`
- `cloudFbm`
- `cloudWeather`
- `cloudDensity`
- the weather thresholds/constants required by those functions

Also extract the vertical profile currently declared inside
`WorldCloudVolumeShader.ts`:

- `cloudVerticalProfile`

Expose two GLSL strings:

```ts
export const WORLD_CLOUD_FIELD_GLSL = /* glsl */ `...`;
export const WORLD_CLOUD_VERTICAL_PROFILE_GLSL = /* glsl */ `...`;
```

### 5.2 Modify

- `src/world/sky/WorldSkyCloudShader.ts`
- `src/world/sky/WorldCloudVolumeShader.ts`

They should import the shared field instead of owning/copying it.

### 5.3 CPU parity

`WorldCloudWeather.ts` currently contains a CPU implementation of approximately
the same field for weather and focus transmittance. Keep the CPU path because it
is cheap and useful for environment control.

Do not attempt to execute GLSL on the CPU.

Add a verifier that checks shared mathematical constants and representative
samples remain close enough between CPU and GPU-source definitions where a
constant is intended to match. Exact bit parity is not required; macro cloud
identity is.

Suggested verifier:

`scripts/verify-cloud-field-contract.mjs`

### 5.4 CS1 acceptance

- analytic sky clouds render unchanged;
- volumetric desktop clouds render unchanged;
- no duplicated cloud density function remains in the new shadow shader;
- build and environment/cloud lifecycle checks stay green.

## 6. Phase CS2 - Create the world-space cloud transmittance map

### 6.1 Add the renderer

Add:

`src/world/sky/WorldCloudShadowMap.ts`

Responsibilities only:

- own one low-resolution `WebGLRenderTarget`;
- own the fullscreen scene/camera/material used to populate it;
- track the cloud-plane world-space origin;
- update uniforms from `RuntimeCloudConfig`;
- render transmittance;
- expose texture + transform uniforms to consumers;
- dispose all GPU resources safely;
- recover cleanly if render-target creation fails.

Do not let it know about terrain, grass, trees, character, or HUD.

### 6.2 Add the shadow-map shader

Add:

`src/world/sky/WorldCloudShadowShader.ts`

Reuse:

- `WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER`
- `WORLD_CLOUD_FIELD_GLSL`
- `WORLD_CLOUD_VERTICAL_PROFILE_GLSL`

The fragment output stores **transmittance**, not darkness.

Conceptual shader:

```glsl
vec2 cloudPlaneXZ = uShadowOriginXZ +
  (vUv - 0.5) * uShadowWorldSize;

float opticalDepth = 0.0;
for (int i = 0; i < CLOUD_SHADOW_STEPS; ++i) {
  float h = (float(i) + 0.5) / float(CLOUD_SHADOW_STEPS);
  vec2 sampleXZ = cloudPlaneXZ +
    uSkySunDirection.xz *
    ((h * uCloudThickness) / max(uSkySunDirection.y, 0.08));

  float weather = 0.0;
  float detail = 0.0;
  float horizontal = cloudDensity(sampleXZ, weather, detail);
  float vertical = cloudVerticalProfile(sampleXZ, h);
  opticalDepth += horizontal * vertical;
}

opticalDepth /= float(CLOUD_SHADOW_STEPS);
float physicalT = exp(-opticalDepth * uCloudExtinction);
float authoredT = mix(1.0, physicalT, uCloudShadowStrength);
float transmittance = max(
  uCloudMinimumDirectTransmittance,
  authoredT
);

gl_FragColor = vec4(transmittance, 0.0, 0.0, 1.0);
```

The exact calibration between `shadowStrength` and extinction must be tuned so
existing config values remain intuitive. Do not make `shadowStrength` secretly
multiply darkness after the safety floor.

### 6.3 Texture format

Prefer the simplest format that is reliable across the browsers/devices already
supported.

Start with an RGBA8 render target storing transmittance in `.r` because it is the
least surprising WebGL compatibility path. Only move to a single-channel target
if profiling shows a meaningful benefit and compatibility is verified.

Texture settings:

- `LinearFilter`
- `ClampToEdgeWrapping`
- no mipmaps
- no depth buffer
- no stencil buffer

### 6.4 World-space anchoring

The map represents the **cloud plane**, not the ground plane.

For the player/focus position:

```text
heightToCloud = cloudBaseHeight - focus.y
focusCloudXZ = focus.xz
             + sunDirection.xz
             * heightToCloud / sunDirection.y
```

Center the shadow texture around `focusCloudXZ`.

Snap its origin to whole shadow texels:

```text
worldTexelSize = shadowWorldSize / shadowResolution
snappedOrigin = round(focusCloudXZ / worldTexelSize) * worldTexelSize
```

This prevents tiny camera motion from resampling the entire projected field and
causing crawling.

### 6.5 Sampling from a surface

Every consumer gets its own world position `P` and projects that point upward to
the cloud plane:

```glsl
float cloudHeight = max(uCloudBaseHeight - P.y, 0.0);
vec2 projectedCloudXZ = P.xz +
  uCloudSunDirection.xz *
  (cloudHeight / max(uCloudSunDirection.y, 0.08));

vec2 uv =
  (projectedCloudXZ - uCloudShadowOriginXZ) / uCloudShadowWorldSize + 0.5;
```

This is why mountains and valleys receive correctly shifted cloud shadows even
though the transmittance texture itself is only 2D.

### 6.6 Edge fade

The shadow map must never end as a rectangular line.

Compute an interior coverage factor from UV and fade shadow influence back to
`1.0` near the border. Outside the map, return `1.0`.

Example concept:

```glsl
vec2 edge = min(uv, 1.0 - uv);
float coverage = smoothstep(0.0, uCloudShadowEdgeFadeUv, min(edge.x, edge.y));
return mix(1.0, texture2D(uCloudShadowMap, uv).r, coverage);
```

### 6.7 Initial technical quality tiers

Add YAML-backed values to `runtime.yaml`, then validate them in
`RuntimeConfigLoader` and type them in `RuntimeCloudConfig`.

Candidate keys:

```text
desktopCloudShadowMapResolution
desktopCloudShadowWorldSize
desktopCloudShadowSteps
desktopCloudShadowEdgeFade
compactCloudShadowMapResolution
compactCloudShadowWorldSize
compactCloudShadowSteps
compactCloudShadowEdgeFade
```

Initial implementation targets, to be confirmed by profiling rather than treated
as permanent constants:

- desktop resolution: 192-256
- compact resolution: 96-128
- desktop world size: enough to cover the detailed terrain + useful far meadow,
  roughly 1-1.5 km
- compact world size: same macro area or slightly smaller if the atmosphere
  already hides the edge
- desktop shadow integration: 3-4 vertical samples
- compact: 1-2 samples

Do not expose update cadence as config until profiling proves a need.

### 6.8 Update cadence

Start by rendering the small shadow map every frame because the implementation is
simpler and avoids stepping. Measure GPU cost independently.

If the pass costs more than its budget, optimize in this order:

1. reduce resolution;
2. reduce shadow integration steps;
3. update every second frame;
4. only then add temporal interpolation/double buffering.

Do not begin with a complicated temporal shadow cache before a measured need.

Target budget:

- desktop shadow-map generation ideally <= 0.25 ms GPU in the hero pose;
- compact ideally <= 0.15 ms or disabled only if proven necessary.

These are engineering targets, not claims about current hardware.

### 6.9 CS2 acceptance

- the debug view shows a stable world-space transmittance field;
- moving the camera without moving through the world does not move the field;
- wind moves the field continuously;
- the field has no rectangular edge in normal view;
- texture values never fall below configured minimum transmittance;
- no material consumes the map yet, so scene output remains unchanged.

## 7. Phase CS3 - Add one shared cloud-shadow sampling contract

Add:

`src/world/sky/WorldCloudShadowUniforms.ts`

and, if helpful for custom shaders:

`src/world/sky/WorldCloudShadowSamplerShader.ts`

### 7.1 Shared uniform contract

Consumers need only:

```text
uCloudShadowMap
uCloudShadowOriginXZ
uCloudShadowWorldSize
uCloudShadowEdgeFadeUv
uCloudBaseHeight
uCloudSunDirection
uCloudFocusTransmittance
uCloudShadowDistanceFadeStart
uCloudShadowDistanceFadeEnd
```

Do not expose all cloud-generation uniforms to every world material. Only the
shadow-map renderer needs those.

### 7.2 Shared sampling function

Provide one GLSL helper:

```glsl
float sampleWorldCloudTransmittance(
  vec3 worldPosition,
  float cameraDistance
)
```

Responsibilities:

- project the surface point to the cloud plane;
- sample the transmittance map;
- edge-fade to `1`;
- distance/fog-fade the shadow contrast;
- return finite `0..1` transmittance.

Distance fade should reduce **contrast**, not overall brightness:

```glsl
float distanceFade = smoothstep(fadeStart, fadeEnd, cameraDistance);
localT = mix(localT, 1.0, distanceFade);
```

### 7.3 Relative direct-light helper

Provide:

```glsl
float resolveRelativeCloudDirectLight(float localTransmittance) {
  return localTransmittance / max(uCloudFocusTransmittance, 0.001);
}
```

Do not clamp this to `1.0`. A locally clear region must be able to recover the
base sun when the player is standing under a cloud.

A technical upper safety clamp around the mathematically possible ratio is fine
if required for malformed inputs, but normal config should never hit it.

## 8. Phase CS4 - Integrate terrain first

Terrain is the best first consumer because it makes the spatial effect obvious
and has far fewer fragments than the grass overdraw stack.

Relevant files:

- `src/world/TerrainMaterialShader.ts`
- terrain material factory/controller that injects uniforms

### 8.1 Direct-light-only integration

Do **not** append this after `outgoingLight` or multiply `diffuseColor`.
That would also darken hemisphere/ambient contribution.

Patch the Lambert directional-light contribution before it is accumulated.
The implementation should assume the one authored world sun directional light,
but document that contract.

Conceptually inside the directional-light branch:

```glsl
float localCloudT = sampleWorldCloudTransmittance(
  vTerrainWorldPosition,
  terrainDistance
);
float cloudDirectScale = resolveRelativeCloudDirectLight(localCloudT);

// Apply only to the world directional direct-light term.
directLight.color *= cloudDirectScale;
```

If Three.js chunk structure makes direct mutation awkward, add the multiplier at
the smallest possible direct-diffuse term, not after ambient/indirect light.

### 8.2 Terrain acceptance

- clear and shaded areas are visible spatially across hills;
- shaded terrain retains color and sky fill;
- no black region is possible from the cloud factor;
- moving the camera sideways does not drag shadow shapes with it;
- moving uphill shifts projection naturally because `worldY` is used;
- far cloud-shadow contrast fades into atmosphere.

## 9. Phase CS5 - Integrate grass without adding a fragment texture fetch first

Grass is fill/overdraw sensitive. The first implementation must avoid a new
per-fragment cloud-shadow lookup.

Relevant files:

- `src/grass/materials/GrassNearMaterial.ts`
- bridge/mid grass material code
- `src/world/grass/WorldGrassImpostorMaterial.ts`
- `src/world/grass/WorldDetailFoliageMaterial.ts`

### 9.1 First attempt: vertex-stage transmittance

Sample the cloud shadow map in the vertex shader using the blade/instance world
position and pass one scalar varying to the fragment stage.

Because cloud shadows vary over tens/hundreds of metres, interpolation across a
blade is visually safe.

Use the blade root/world anchor where available so all vertices of a single
blade ideally resolve the same large-scale lighting value. If the current shader
structure would redundantly sample once per vertex, implement it first and
profile before introducing complexity.

### 9.2 Apply to direct grass lighting only

Grass already has conceptually separate diffuse, ambient, and transmission
responses. Apply cloud transmittance to:

- direct diffuse sun;
- direct-sun transmission/backlight;
- sun glint if any.

Do **not** reduce:

- ambient/sky fill;
- root AO/contact darkening;
- character analytic occlusion.

Transmission under a cloud must reduce with the sun; otherwise shaded grass will
still glow at the tips.

### 9.3 Fallback if vertex texture sampling is too expensive

Do not move the lookup into the fragment shader by default.

Optimize in this order:

1. sample only on the dominant grass layers and reuse/interpolate the value;
2. sample once per coarse patch/impostor where that representation already has a
   patch anchor;
3. for ultra-near segmented blades, use a coarser per-draw/batch cloud value if
   profiling shows the repeated vertex fetch dominates;
4. only consider a fragment fetch if measurements show it is cheaper on the
   target GPU and visual parity is better.

A per-render-batch fallback is acceptable because cloud shadows are intentionally
broad; a hard 32 m block is not. If a batch method is used, interpolate between
multiple batch samples or ensure the sampled shadow field is smooth enough that
boundaries cannot be seen.

### 9.4 Grass acceptance

- grass and terrain darken together under the same cloud;
- grass remains colored and readable under cloud;
- backlight/transmission fades correctly under shadow;
- no tile/batch boundaries appear;
- no new LOD brightness ring appears;
- p95/GPU cost is measured before accepting the vertex-sampling approach.

## 10. Phase CS6 - Integrate horizon, scenic objects, stones, water, and actor

Do this only after terrain + grass prove the architecture.

### 10.1 Horizon

`WorldHorizonMaterial` is cheap and far away. Apply a reduced-strength cloud
shadow response and fade it aggressively with atmosphere.

The horizon does not need full local contrast. Its purpose is to preserve broad
weather variation without painting sharp distant blotches.

### 10.2 Trees and stones

Patch their standard materials through one reusable helper if they use compatible
Three.js lighting chunks.

Add:

`src/render/WorldCloudShadowMaterialPatch.ts`

Responsibilities:

- inject shared uniforms;
- inject the sampler helper;
- multiply only the world directional direct-light contribution;
- keep `customProgramCacheKey` stable and explicit;
- update no per-frame allocations;
- support clean disposal/unpatch lifecycle where required.

Do not create one almost-identical cloud patch class per scenic system.

### 10.3 Character

The character stays near the focus, and the global sun is already scaled by the
focus transmittance. Therefore the character does not need spatial correction in
the first rollout.

Only add local character sampling if later cameras allow the actor to move far
from the environment-lighting focus or if visual testing shows a mismatch.

### 10.4 Water

Water needs special treatment because its strongest sun cues are specular/glint,
not only diffuse.

Apply cloud transmittance to:

- direct sun glint;
- sun-driven caustic intensity if appropriate;
- directional highlight.

Do not multiply Fresnel sky reflection by cloud shadow. The sky is still visible
under a cloud shadow.

Water integration is lower priority than terrain/grass and can ship later if the
visual mismatch is small.

## 11. Phase CS7 - Improve shadow morphology and remove synthetic patterns

Only tune morphology after the lighting architecture is correct.

### 11.1 Preserve macro cloud bodies

Current density already uses macro FBM + warp + detail. The shadow map should
keep most of its energy in the macro field.

Do not amplify detail noise until the ground becomes speckled.

Target ground shadow hierarchy:

```text
weather region: hundreds to thousands of metres
cloud body:     hundreds of metres
broken edge:    tens of metres
micro detail:   mostly invisible in ground shadow
```

### 11.2 Penumbra

The shadow-map generation already gains softness from:

- low map resolution;
- linear filtering;
- multi-sample integration through cloud thickness;
- `cloud.softness` in the density field.

Do not add a separate blur pass unless those are insufficient.

If a blur is eventually necessary, use one tiny separable blur on the shadow map,
not per-material PCF.

### 11.3 Avoid banding/repetition

Investigate the visible cloud bands separately from shadow darkness.

Checks:

- disable god rays to rule out the `rayAngle` band pattern;
- inspect temporal volumetric render target directly;
- compare analytic and volumetric cloud modes;
- inspect low-resolution temporal upscaling for contouring;
- inspect value-noise/FBM scale at the exact screenshot direction;
- verify tone mapping is not expanding tiny radiance differences into visible
  bands.

If the banding is in the cloud density field, improve the field once in
`WorldCloudFieldShader` so analytic clouds, volume clouds, and shadows all share
the fix.

Candidate field improvements, in order:

1. stronger two-axis domain warp using existing noise calls;
2. decorrelate detail from macro wind/scale;
3. replace one value-noise octave with gradient/simplex-style noise only if
   visual improvement justifies added ALU;
4. add a second low-frequency erosion term before increasing octave count.

Do not simply increase octaves everywhere.

## 12. Phase CS8 - HUD/debug controls

Cloud shadow tuning must be inspectable without editing source constants.

Add a compact Cloud/Environment diagnostic area to the existing HUD settings,
only for debug/art tuning if the current HUD policy supports it.

Useful controls/readouts:

- cloud shadows enabled
- shadow strength
- minimum direct transmittance
- shadow map debug overlay
- focus direct transmittance readout
- weather regime/readout
- optional shadow-map resolution readout

Keep technical resolution/steps read-only at runtime unless live reallocation is
already safely supported. Avoid GUI-driven GPU resource churn for art controls
that do not need it.

## 13. Configuration changes

Extend `RuntimeCloudConfig` only with parameters the implementation actually
needs.

### 13.1 Required new fields

Proposed:

```ts
shadowMapResolution: number;
shadowWorldSize: number;
shadowSteps: number;
shadowEdgeFade: number;
shadowDistanceFadeStart: number;
shadowDistanceFadeEnd: number;
```

### 13.2 YAML naming

```text
desktopCloudShadowMapResolution
desktopCloudShadowWorldSize
desktopCloudShadowSteps
desktopCloudShadowEdgeFade
desktopCloudShadowDistanceFadeStart
desktopCloudShadowDistanceFadeEnd

compactCloudShadowMapResolution
compactCloudShadowWorldSize
compactCloudShadowSteps
compactCloudShadowEdgeFade
compactCloudShadowDistanceFadeStart
compactCloudShadowDistanceFadeEnd
```

Keep existing:

- `CloudShadowStrength`
- `CloudMinimumDirectTransmittance`
- `CloudLightResponseRate`

Do not add a second competing strength/floor pair.

### 13.3 Validation

In `RuntimeConfigLoader`:

- map resolution: integer, bounded to a small safe range; power-of-two is not
  required unless implementation/driver evidence gives a reason;
- world size: positive and comfortably larger than one terrain chunk;
- steps: integer 1-6;
- edge fade: bounded `0..0.25` as UV fraction or equivalent world units;
- distance fade start/end: positive and end > start.

If `FlatConfigValueReader` cannot express the cross-field `end > start` rule,
validate immediately after reading both values and throw a clear error.

## 14. Runtime ownership and lifecycle

### 14.1 Controller ownership

Recommended ownership:

`WorldEnvironmentController`

owns:

- `WorldCloudEnvironmentLighting`
- `WorldCloudShadowMap`
- `WorldSky`

This keeps sun/cloud environment state in one place without making
`WorldCloudEnvironmentLighting` responsible for GPU render targets.

### 14.2 Update order

Per frame:

```text
WorldEnvironmentController.update()
  -> update smoothed global cloud weather/transmittance
  -> update cloud shadow map time/origin
  -> update sky/cloud temporal state
  -> update sun shadow focus
```

The exact order can be arranged around current rendering callbacks, but the same
`elapsedSeconds` and focus must feed both global cloud lighting and the shadow
map so they cannot drift in time.

### 14.3 Shared state exposure

Do not make consumers reach into `scene.userData` for the shadow texture every
frame.

Create a small immutable/stable state object or uniform bundle owned by the
shadow map/controller and pass references into materials when they are created.
The texture object and vectors remain stable; only their values update.

`scene.userData` may expose read-only diagnostic state, as the existing weather
system does, but it should not be the primary render dependency.

## 15. Tests and static verification

### 15.1 Add `verify-cloud-shadow-contract.mjs`

Verify source/config contracts such as:

- shadow transmittance is clamped/floored;
- consumer code uses transmittance, not `1 - transmittance` as a final color
  multiplier;
- terrain/grass direct-light hooks reference the shared sampler;
- ambient/hemisphere term is not multiplied by cloud shadow;
- map edge fades to no shadow;
- projection uses world position and cloud base height;
- config ranges are valid;
- compact and desktop both define the required fields;
- lifecycle disposal exists for the shadow render target/material/geometry.

### 15.2 Extend existing environment lifecycle verification

Add checks that:

- the shadow map is created once;
- update does not allocate a render target per frame;
- dispose releases it;
- render faults disable/fallback cleanly instead of breaking the world loop.

### 15.3 Visual regression poses

At minimum:

1. clear/fair hero meadow;
2. player under cloud with clear ground visible in distance;
3. player in clear sun with a cloud shadow crossing distant terrain;
4. elevated mountain-facing view;
5. compact hero view;
6. black-region regression pose from CS0.

### 15.4 Motion verification

Record or manually inspect:

- standing still while clouds move;
- walking perpendicular to shadow edge;
- rotating camera without moving;
- climbing a hill through a cloud shadow;
- LOD handoffs while a shadow crosses grass.

Failure signs:

- shadow sticks to camera;
- rectangular map edge;
- grass/terrain mismatch;
- block boundaries;
- shadow pops when origin snaps;
- bright transmission remains under dark cloud;
- entire world brightness pulses because global and local terms double-apply.

## 16. Performance verification

Measure separately:

- shadow-map pass GPU time;
- terrain material delta;
- grass material delta;
- total frame delta.

Do not infer cost from FPS alone when the capture is already running at a high
frame rate.

### 16.1 Preferred performance strategy

1. one tiny GPU map generation pass;
2. one cached texture sampled by consumers;
3. terrain fragment lookup;
4. grass vertex lookup;
5. far/horizon shadow contrast reduced/faded;
6. no procedural cloud FBM in surface materials.

### 16.2 Performance exit gates

- no new draw call per terrain/grass chunk solely for cloud shadows;
- no per-frame heap allocations in world/grass loops;
- no shadow render target resize during normal play;
- no more than one shared cloud-shadow map per world/profile;
- total settled p95 regression remains within the visual-plan budget;
- compact stays inside its GPU budget or uses a reduced map/step count before
  disabling the feature.

## 17. Commit sequence

Implement as small commits directly on a freshly checked `main`:

1. `Add cloud shadow diagnostics and regression pose`
2. `Extract shared cloud density shader field`
3. `Add world space cloud transmittance map`
4. `Add shared cloud shadow sampling contract`
5. `Apply cloud direct lighting to terrain`
6. `Apply cloud direct lighting to grass`
7. `Apply cloud lighting to distant and scenic materials`
8. `Refine cloud shadow morphology and debug controls`
9. `Add cloud shadow verification contracts`

Before each commit/tranche, fetch `main` again and rebase the change logically on
what is actually there. Do not overwrite later work.

## 18. Recommended first implementation slice

Do not implement the full list in one pass.

First slice:

1. reproduce and diagnose the black region;
2. extract `WorldCloudFieldShader` without changing output;
3. add `WorldCloudShadowMap` and debug-view it only;
4. prove world-space stability and minimum-transmittance safety;
5. integrate terrain direct light;
6. capture before/after and profile;
7. only then integrate grass.

This slice gives a clear stop point: a correct, soft, spatial cloud shadow on
terrain with no risk of hiding the existing black-region bug behind a new
lighting system.

## 19. Definition of done

The cloud-shadow work is complete only when:

- unexplained black terrain patches are gone or proven unrelated and fixed;
- cloud shadows are spatial, world-anchored, and move with wind;
- visible cloud macro bodies and ground shadows are recognizably correlated;
- shaded surfaces retain sky/ambient light and material color;
- `minimumDirectTransmittance` is never violated;
- terrain and grass agree under the same cloud;
- grass transmission/backlight weakens under cloud shadow;
- shadow contrast fades naturally with distance/aerial perspective;
- mountains do not receive hard dark decals;
- no camera-relative swimming or rectangular field edge is visible;
- desktop and compact preserve the same macro shadow identity;
- no per-fragment procedural cloud FBM was added to surface materials;
- targeted cloud/environment/config tests pass;
- full `npm run build` passes;
- deployment remains manual via the existing GitHub Pages deploy script.