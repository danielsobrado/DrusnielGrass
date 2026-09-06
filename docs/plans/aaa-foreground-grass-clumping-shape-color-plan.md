# AAA Foreground Grass Clumping, Shape, and Color Plan

Status: planned  
Baseline date: 2026-08-20  
Baseline branch: `main`  
Baseline commit checked before writing: `2bb39aaf9bb6595340b9ad056ab66502b7aa844e`

Companion documents:

- [aaa-world-visual-upgrade-plan.md](aaa-world-visual-upgrade-plan.md)
- [aaa-grass-execution-plan.md](aaa-grass-execution-plan.md)
- [aaa-look-audit.md](aaa-look-audit.md)

## 1. Purpose

This document is the focused implementation plan for the highest-value defect in
the current third-person meadow frame: the first roughly 0-12 metres of grass
still read too strongly as many independent crossed blades, with some pale/dry
areas becoming too bright and some tufts lacking enough internal structure.

The goal is not to add more grass. The near field is already dense and already
contains most of the systems an AAA grass solution needs. The goal is to make the
existing population read as a small number of coherent plant clumps with causal
shape and colour variation.

The target visual hierarchy is:

```text
ecology / biome
  -> clump habitat
  -> stable clump archetype
  -> clump morphology
  -> blade tier within clump
  -> small blade variation
  -> root/tip palette
  -> lighting / transmission
```

The weakest terms must be the independent per-blade ones. If the eye notices
random blade variation before it notices a tuft, the implementation has failed.

## 2. Scope

This plan covers only foreground grass:

- clump spatial structure;
- clump silhouette diversity;
- blade height/width/tier distribution inside a clump;
- coherent rest lean and blade-plane orientation;
- root/body/tip silhouette balance;
- dry/wet colour behaviour;
- clump-level colour coherence;
- root grounding and near-field depth;
- preserving the same identity through the near/bridge/mid handoff;
- verification, screenshots, and performance gates.

This plan does **not** redesign:

- world ecology;
- biome placement;
- terrain materials except where needed to verify grass colour grounding;
- flowers/detail foliage;
- wind architecture;
- character interaction;
- far horizon vegetation;
- the cloud or atmosphere systems.

Those systems may provide inputs, but this work must not duplicate them.

## 3. Current implementation that must be preserved

Before editing code, preserve the architecture already present in `main`.

### 3.1 Habitat is already causal

`src/world/grass/GrassHabitatField.ts` already derives:

- `density`;
- `height`;
- `dryness`;
- `clumpScale`;
- `underlayer`;
- `directionalLean`;
- `accentChance`.

It uses the shared ecology sample rather than inventing a second ecological
system. Continue to use it as the source of habitat meaning.

Do not add another world-space noise field just to make the foreground look more
varied unless a missing scale cannot be expressed through the existing habitat
and stable clump identity.

### 3.2 Six stable clump archetypes already exist

`GrassHabitatField.ts` currently resolves:

1. `GRASS_CLUSTER_DENSE_NORMAL`;
2. `GRASS_CLUSTER_SPARSE_OPEN`;
3. `GRASS_CLUSTER_TALL_WET`;
4. `GRASS_CLUSTER_SHORT_DRY`;
5. `GRASS_CLUSTER_FLATTENED`;
6. `GRASS_CLUSTER_ACCENT`.

The fix is not to create more categories immediately. First make these six
produce more clearly different silhouettes and internal composition.

### 3.3 Near grass is already tufted in world space

`src/world/grass/WorldSingleBladeTileFactory.ts` already uses:

- global clump coordinates;
- `CLUMP_CELLS = 3`;
- stable clump centre jitter;
- stable radius/aspect/orientation;
- a dominant growth direction;
- a small internal hole mechanism;
- habitat-aware archetypes;
- understory/main/accent blade tiers;
- clump asymmetry;
- biome width and wind damping;
- habitat dryness;
- path and stone coverage feathering.

The current placement architecture is therefore sound. Work should refine its
morphology, not replace it.

### 3.4 Current foreground density is already high

`public/config/world.yaml` currently uses:

```yaml
grassNearBladesPerSquareMeterDesktop: 72
grassNearBladesPerSquareMeterCompact: 40
grassUltraNearDistance: 6
grassUltraNearDensityMultiplier: 2
grassUltraNearDensityMultiplierCompact: 1.5
```

Do not increase these values to hide clump or shading defects.

### 3.5 Current clump controls are already art-facing

`public/config/world.yaml` currently exposes:

```yaml
grassClumpRadiusScaleMin: 0.32
grassClumpRadiusScaleMax: 0.48
grassClumpAspectMin: 0.76
grassClumpAspectMax: 1.28
grassClumpRadialExponent: 0.58
grassClumpDominantDirectionWeight: 0.55
grassClumpRadialDirectionWeight: 0.2
```

These are the first tuning surface. Do not hardcode alternative values in the
tile factory while the same concept exists in YAML.

### 3.6 Current blade shape is already curved and segmented in the ultra-near field

`public/config/grass.yaml` currently defines:

```yaml
bladeSegments: 3
bladeHeightMin: 0.50
bladeHeightMax: 0.95
bladeWidthMin: 0.045
bladeWidthMax: 0.090
bladeLeanMin: 0.025
bladeLeanMax: 0.30
bladeCurve: 0.8
rootSink: 0.02
variantCount: 4
```

`GrassGeometryFactory.ts` already biases the curve toward the upper blade and
uses tapering width. Do not raise segment count before proving the current shape
cannot achieve the target.

### 3.7 Current palette path is shared and LOD-aware

`GrassPaletteShader.ts` already provides one palette model used by the real grass
and the impostor path. Current important values include:

```text
GRASS_LIGHT_MIX = 0.62
tipLuminanceScale = 1.48
dryLuminanceScale = 1.02
drynessMaximum = 0.58
rootFadeEnd = 0.48
groundContactStrength = 0.52
shadowDesaturation = 0.55
```

`public/config/grass.yaml` currently uses:

```yaml
baseColor: "#2f7c35"
tipColor: "#91dc63"
dryColor: "#83a653"
rootDarkening: 0.72
backlightStrength: 0.22
```

A nearly white dry patch must therefore be diagnosed through the complete colour
and lighting chain. Do not add a final luminance clamp to hide the source.

### 3.8 Existing instance channels are already heavily used

Near blades currently carry:

- `instanceVariation.x`: stable per-instance variation / dither input;
- `instanceVariation.y`: wind scale;
- `instanceVariation.z`: canopy AO;
- `instanceVariation.w`: dryness;
- `instanceCoverage`;
- `instanceBiome`.

Do not repurpose one of these channels without auditing every shader and LOD
consumer first. Prefer recomputing cheap clump-level values during tile creation
or using the instance transform before adding GPU attributes.

### 3.9 Placement cache versioning matters

`WorldSingleBladeTileFactory.ts` currently uses `GRASS_PLACEMENT_VERSION = 7`.
Any change that alters stable placement geometry, transform composition, tier
selection, or heading rules must bump this version so old cached placements
cannot coexist with new ones.

## 4. Visual defects to remove

The current frame exposes these foreground defects.

### 4.1 Too many equally important blades

The eye sees individual bright linear blades rather than a mass with a few tips
breaking out of it.

Likely causes:

- too little contrast between understory, main, and accent tiers in some habitats;
- too much independent plane orientation;
- width/height variation still reads per blade instead of per clump;
- insufficiently quiet lower canopy;
- too many similarly bright tips.

### 4.2 Clumps are present structurally but not always obvious visually

The placement is tufted, but some tufts still dissolve into the surrounding
population because neighbouring tufts have similar:

- radius;
- height distribution;
- orientation;
- colour;
- canopy AO;
- tier ratio.

The plan must increase **between-clump** variation more than **within-clump**
variation.

### 4.3 Dry grass can become too pale

The screenshot contains grass on the right that approaches grey-white. That is
not explained by the configured green dry colour alone.

Potential contributors that must be isolated:

- tip luminance lift;
- dry palette balancing;
- transmission/backlight;
- normal orientation;
- exposure/tone mapping;
- per-blade palette interpolation;
- a high dry amount combined with a bright tip term;
- LOD-specific canopy compensation.

### 4.4 Too much crossed-card energy

Even though lean direction is clump-aware, blade planes use fully independent
`planeYaw`. At current width and density, this can create a high-frequency set of
crossed light-catching planes.

The plane orientation must remain non-camera-facing, but it can be slightly more
coherent inside a tuft.

### 4.5 Root region is not quiet enough everywhere

The lower 10-25% of the canopy should read as a darker, denser body. Bright roots
or bright lower blades expose the independent-card construction.

## 5. Non-negotiable engineering constraints

1. Keep deterministic world-space placement.
2. Do not add per-frame allocations to grass update or streaming hot paths.
3. Do not add a draw call per clump/archetype/shape.
4. Do not increase blade density as the primary fix.
5. Keep art-facing tuning in YAML/JSON rather than scattered TypeScript literals.
6. Keep mathematical safety limits and bounds constants in focused TypeScript.
7. Preserve one shared ecology field and one habitat mapper.
8. Preserve near/mid/far colour parity.
9. Preserve compact/mobile macro identity.
10. Keep `WorldSingleBladeTileFactory` orchestration understandable; if morphology
    logic becomes large, extract one small pure resolver rather than growing the
    sampling loop indefinitely.
11. No GitHub Actions. Verification remains local.
12. Deployment remains manual.
13. Before each implementation tranche, re-check `main` and do not overwrite a
    newer change.

## 6. Target foreground composition

At normal third-person camera height, inside roughly 0-6 m:

- the first read is clumps;
- the second read is short/medium/tall structure inside those clumps;
- only the third read is individual blade detail.

A healthy normal tuft should usually contain:

```text
short understory     35-50%
main body            43-58%
tall accents          3-8%
```

These are visual target ranges, not mandatory constants. Wet, dry, sparse, and
flattened archetypes should deliberately move away from them.

A useful silhouette rule is:

```text
70-85% of visible canopy mass below the tuft top line
15-30% of blades allowed to approach/break the top line
```

This prevents the entire population from creating one equally noisy skyline.

## 7. Phase FG0 - Lock the foreground baseline

### Objective

Create one reproducible hero pose and several diagnostic poses before changing
art tuning.

### Work

Use the existing visual-matrix infrastructure. Add or reuse poses that include:

1. hero third-person meadow matching the current screenshot;
2. dry/exposed grass patch;
3. lush/wet grass patch;
4. path verge;
5. compact-profile hero frame;
6. low camera at roughly blade-body height;
7. near-to-mid handoff view around 10-24 m.

For the hero frame, record:

- resolution;
- runtime profile;
- camera position/rotation;
- sun state;
- FPS after warmup;
- draw calls;
- triangles;
- active near blade count;
- active ultra-near blade count;
- visible grass tile count.

### Add focused debug evidence

Use existing debug/HUD infrastructure where possible. Add only debug views that
speed diagnosis:

- clump cell/archetype colour;
- blade tier: understory/main/accent;
- dryness;
- canopy AO;
- final palette without lighting;
- lighting-only multiplier;
- transmission/backlight contribution.

Do not ship expensive diagnostic texture work in the production material. A
developer-only material mode or compile-time/debug branch is sufficient.

### Exit gate

Do not begin tuning until the pale patch and at least three foreground tuft types
can be reproduced at stable poses.

## 8. Phase FG1 - Extract clump morphology from the placement loop

### Objective

Make clump behaviour explicit and testable without creating a second grass
system.

`WorldSingleBladeTileFactory.advanceSampling()` currently owns habitat,
archetype, heading, tier ratios, height scaling, width scaling, asymmetry, colour
variation, and transform composition in one hot loop. The current code works, but
adding more morphology directly there will make future visual tuning risky.

### Proposed structure

Add one small pure module:

`src/world/grass/GrassClusterProfile.ts`

It should contain no Three.js objects and allocate nothing in the hot path.

Suggested responsibilities:

```ts
export interface GrassClusterProfile {
  radiusScale: number;
  heightScale: number;
  widthScale: number;
  understoryShare: number;
  accentShare: number;
  understoryHeightScale: number;
  mainHeightScale: number;
  accentHeightScale: number;
  leanCoherence: number;
  planeCoherence: number;
  asymmetry: number;
  drynessOffset: number;
  drynessScale: number;
  coverageScale: number;
}
```

The exact interface should be reduced to only values the implementation actually
needs. Do not create fields speculatively.

Inputs:

- stable archetype;
- `GrassHabitatSample`;
- a small set of already-computed stable clump hash values;
- art config.

Output is filled into a caller-owned object.

### Why extract it

This gives one place to answer:

- what makes a wet tuft visually wet;
- what makes a dry tuft visually dry;
- how sparse differs from short dry;
- what flattened does besides lean;
- which values are shared at clump scale;
- which values remain blade-specific.

### Keep technical invariants outside art tuning

Bounds ceilings such as:

- `INSTANCE_VERTICAL_SCALE_MAX`;
- `INSTANCE_HORIZONTAL_SCALE_MAX`;
- wind reach;
- culling safety margins;

stay in TypeScript.

Art choices such as tier shares or coherence strength should move to YAML when
new tuning is required.

### Tests

Add a deterministic unit/static verifier that samples representative habitat
inputs and asserts:

- all shares are finite and in [0,1];
- `understoryShare + accentShare <= 1`;
- scale outputs stay within the limits expected by transform/bounds code;
- same clump id + same seed => same profile;
- archetypes produce intentionally different profiles.

## 9. Phase FG2 - Strengthen clump spatial grammar

### Objective

Make neighbouring blades visibly belong to the same root mass without producing
obvious repeated circles or starbursts.

### 9.1 Preserve current global clump coordinates

Do not revert to tile-local random placement. Current global clump coordinates
correctly keep a tuft continuous across an 8 m tile boundary.

### 9.2 Tune core/shoulder/edge occupancy

Current radial placement uses a single exponent:

```yaml
grassClumpRadialExponent: 0.58
```

This is close to area-uniform and deliberately avoids a starburst. The next step
is not simply lowering it to pile all blades at the centre.

Instead, evaluate a restrained three-zone distribution:

```text
core       0.00-0.35 radius: full acceptance
shoulder   0.35-0.78 radius: normal acceptance
edge       0.78-1.00 radius: reduced acceptance / more irregularity
```

Implementation preference:

- keep the sampled point continuous;
- modulate acceptance or local radial scale using a stable clump profile;
- do not enumerate a second blade population;
- do not introduce visible concentric rings.

The edge should look frayed, not geometrically clipped.

### 9.3 Make holes biologically tied to archetype

The existing rare hole logic is useful, but its probability and size should
respond to clump type.

Suggested behaviour:

- dense normal: rare, small hole;
- tall wet: almost no central hole;
- short dry: more open interior and edge gaps;
- sparse open: several missing sectors rather than one perfect central hole;
- flattened: directional gap on the lee/disturbed side;
- accent: mostly dense body with a few tall breakouts.

Do not make every archetype use a unique geometric pattern. The effect should be
subtle enough that a player cannot name the procedural rule.

### 9.4 Add rare satellites only if clumps still look isolated

If tuning the existing clump does not produce enough natural overlap, add a rare
stable satellite shoulder rather than a second scatter system.

Example concept:

```text
primary tuft
  + 0-1 small shoulder offset 20-45 cm
```

This should be limited to some dense/wet/accent tufts and must use the same
clump identity. Do not create separate satellite meshes.

### Acceptance

- no visible regular 3x3 tuft lattice;
- no circular cookie-cutter edges;
- close blades form groups with darker inter-clump channels;
- sparse/dry tufts expose more ground naturally;
- the field still looks continuous at normal camera height.

## 10. Phase FG3 - Make archetypes visually distinct

### Objective

Turn the six existing archetypes into six different **morphologies**, not only a
few scalar adjustments.

### Recommended morphology contract

| Archetype | Density/body | Height structure | Width | Rest lean | Gaps | Dryness |
| --- | --- | --- | --- | --- | --- | --- |
| dense normal | full body | balanced 3-tier | normal | coherent mild | rare | habitat |
| sparse open | reduced | mostly main + some short | slightly broader survivors | mild | frequent edge gaps | habitat + small dry bias |
| tall wet | dense | fewer short, more tall | slightly narrow/tall | upright | minimal | strongly reduced |
| short dry | open | many short, few tall | slightly broader/stiffer | moderate exposed | more interior gaps | increased |
| flattened | medium/open | mostly short/main | normal | strong common direction | directional gaps | habitat + disturbance bias |
| accent | normal/dense | normal body + visible tall minority | mixed | mild | rare | habitat, tall accents can dry |

The table defines relative behaviour. Exact art values must be tuned from the
hero captures.

### Important distinction: sparse vs dry

Do not make `SPARSE_OPEN` and `SHORT_DRY` visually equivalent.

- sparse open = fewer plants, but survivors can still be healthy;
- short dry = stressed morphology and colour, not necessarily the lowest density.

This distinction is important for ecological readability.

### Important distinction: flattened vs windy

`FLATTENED` should not simply mean stronger animated wind. It represents a stable
rest pose caused by disturbance/exposure. Its common rest lean must remain even
when the gust envelope is calm.

### Exit gate

At a paused frame with wind near a lull, an experienced viewer should be able to
identify at least four of the six archetype families from shape alone in the
first 10 m.

## 11. Phase FG4 - Rebalance blade tiers inside each clump

### Objective

Reduce the needle-field appearance by making the lower canopy a mass and using
tall blades as punctuation.

### Current implementation

`WorldSingleBladeTileFactory.ts` currently uses:

```text
BLADE_TIER_UNDERSTORY_SHARE = 0.42
BLADE_TIER_ACCENT_SHARE = 0.07
BLADE_TIER_UNDERSTORY_SCALE = 0.48
BLADE_TIER_MAIN_SCALE = 0.84
BLADE_TIER_ACCENT_SCALE = 1.2
```

and modifies shares by archetype.

These are art-facing values. As part of this pass, move only the values that need
active art tuning into config. Keep hard transform ceilings in code.

### Desired changes

1. Increase between-tier separation slightly before increasing total height
   variation.
2. Keep understory blades short enough to fill roots but not create a second
   obvious flat height band.
3. Reduce the number of tall accents in normal grass if too many tips compete.
4. Make tall accents occur in stable small groups inside selected tufts rather
   than uniformly across all tufts.
5. Bias dry/flattened archetypes toward short and main tiers.
6. Bias wet/accent archetypes toward a minority of tall blades.

### Avoid discrete height shelves

Tier selection must remain softened by:

- clump height scale;
- side asymmetry;
- small blade height jitter;
- biome height band.

The result should not expose three exact horizontal levels.

### Proposed art config only if needed

Prefer a small set of keys rather than one key per archetype x tier combination.
Candidate values:

```yaml
grassUnderstoryShare: 0.42
grassAccentBladeShare: 0.06
grassUnderstoryHeightScale: 0.46
grassMainHeightScale: 0.84
grassAccentHeightScale: 1.18
grassClusterHeightCoherence: 0.82
```

Archetype deltas can remain in one focused profile resolver if they are semantic
rules rather than artist-tuned free parameters.

Do not add these keys until the implementation actually uses them.

### Acceptance

- clump body is visually denser/darker than its top line;
- tall blades are a minority;
- no obvious three-level shelf pattern;
- no increase in blade count;
- no bounds regression.

## 12. Phase FG5 - Rework blade plane orientation and lean coherence

### Objective

Reduce the crossed-card look while preserving natural azimuth diversity.

### Current behaviour

Lean heading is already a weighted mixture of:

```text
clump dominant direction
+ radial direction
+ independent direction
```

with current YAML weights:

```yaml
grassClumpDominantDirectionWeight: 0.55
grassClumpRadialDirectionWeight: 0.2
```

This is structurally correct.

However, the blade plane itself currently gets:

```ts
const planeYaw = job.random.range(0, TWO_PI);
```

for every blade.

### Rework plane orientation, not camera facing

Add a mild clump-level plane orientation basis:

```text
planeYaw = mixAngle(
  independentPlaneYaw,
  clumpPlaneBasis + localSpread,
  planeCoherence
)
```

Requirements:

- never rotate blades to face the camera;
- preserve enough azimuth diversity to avoid flat fan clumps;
- use stable clump identity;
- keep `planeCoherence` lower than rest-lean coherence;
- let sparse/dry tufts be a little more chaotic;
- let tall/wet tufts be slightly more coherent/upright.

A likely useful coherence range is 0.15-0.35. Treat this only as a tuning start,
not a fixed requirement.

### Rest lean hierarchy

Keep the directional hierarchy explicit:

```text
habitat directional lean
  -> clump shared rest direction
  -> archetype rest-lean strength
  -> small blade deviation
  -> animated wind on top
```

Do not merge rest lean and animated wind into one term.

### Verify transform/bounds math

Any change to maximum rest lean must update or prove compatible with:

- `calculateBoundsPadding()`;
- `INSTANCE_HORIZONTAL_SCALE_MAX`;
- `INSTANCE_VERTICAL_SCALE_MAX`;
- wind reach;
- culling regression tests.

If only orientation coherence changes and the maximum lean remains unchanged,
there should be no bounds change.

## 13. Phase FG6 - Improve the actual blade silhouette without adding segments

### Objective

Make the closest grass read more like leaves and less like long flat triangles.

### Work in the existing geometry path

Audit:

- `GrassGeometryFactory.ts`;
- the single-blade source geometry used by `WorldSingleBladeTileFactory`;
- `public/config/grass.yaml`.

Tune in this order:

1. width/height ratio;
2. taper profile;
3. upper-half curve;
4. tip sharpness;
5. rest lean;
6. only then segment count.

### Target shape families

Use the existing geometry variant mechanism first. The near field does not need
six species meshes. It needs several believable blade silhouettes.

A useful four-family target is:

1. medium narrow curved;
2. broader shorter leaf;
3. tall narrow bent leaf;
4. slightly asymmetric/drooped leaf.

If the current four variants cannot express this because they only change random
seed, change the variant generator so each index has a restrained shape bias.
Do not increase `variantCount` before making the existing variants semantically
different.

### Shape variation rules

- root width should not become hair-thin;
- tip should remain pointed;
- curvature should begin mostly above the lower third;
- dry blades may be slightly narrower/stiffer;
- wet blades may be slightly taller/upright;
- the source geometry should remain shared;
- no texture alpha cutout is required for the main opaque blades.

### Keep geometry cost flat by default

`bladeSegments: 3` is already enough for a visible arc at ultra-near distance.
Do not move to 4-5 segments unless a fixed close-up capture proves the silhouette
requires it and the triangle budget remains acceptable.

## 14. Phase FG7 - Diagnose and fix pale dry grass at the earliest wrong term

### Objective

Remove the grey/white dry-grass patch without destroying backlight, HDR response,
or biome colour variety.

### 14.1 Build a controlled colour breakdown

For one representative dry blade and one healthy blade in the same lighting,
capture these stages:

1. raw biome/art base, tip, and dry colours;
2. palette-balanced colours after `setBalancedGrassPaletteColors()`;
3. result of `grassResolvePalette` without direct lighting;
4. root/tip gradient contribution;
5. canopy AO;
6. direct + indirect light;
7. transmission/backlight;
8. final tone-mapped result.

The debug capture should report numeric RGB/luminance for a few selected samples
if practical. Do not rely only on visual guessing.

### 14.2 Inspect palette balancing

Current dry luminance balancing uses:

```text
dryLuminanceScale = 1.02
```

which places dry albedo near base luminance. That is not inherently wrong.
However, if the dry colour is then strongly mixed into a tip already lifted by:

```text
tipLuminanceScale = 1.48
```

and receives transmission, the final result may exceed the intended dry value.

Determine whether the brightness comes from:

- balanced albedo;
- tip lift;
- lighting;
- transmission;
- a combination.

### 14.3 Dryness should reduce chlorophyll, not create chalk

The target dry family should move toward:

- muted olive;
- straw green;
- restrained yellow-brown where the biome supports it.

It should not move toward neutral grey-white unless a biome explicitly represents
bleached dead vegetation.

### 14.4 Keep dry lighting physically plausible

Dry blades can still catch strong sunlight. Do not globally darken every dry blade.
Instead:

- reduce excessive green tip lift on high dryness if that is the cause;
- reduce transmission contribution for very dry material if appropriate;
- keep specular/sheen narrow rather than brightening the whole blade;
- keep root darkening intact;
- preserve direct-light response.

### 14.5 No final-output clamps

Do not add code such as:

```glsl
color = min(color, vec3(...));
```

or a luminance clamp based on dryness. That will break exposure and sun-angle
behaviour and hide the actual issue.

### Acceptance

Under the same sun/exposure:

- a dry clump may be warmer/lighter in albedo than a lush clump;
- it must not look emissive;
- it must retain clear root/body/tip structure;
- no large patch should approach white unless the sun highlight itself is near
  white and spatially narrow.

## 15. Phase FG8 - Make colour coherent at clump scale

### Objective

Move visible colour variation from independent blade noise to shared clump state.

### Current good behaviour

`instanceVariation.w` already uses habitat dryness plus only about +/-0.012 random
jitter. Keep independent dryness jitter small.

### Add shared clump colour identity only if needed

A tuft should share a small stable colour bias caused by:

- habitat dryness;
- vigor;
- archetype;
- biome;
- stable maturity-like clump variation.

Do not add random RGB offsets.

The shared bias should be semantic, for example:

```text
wet/tall -> slightly deeper green, lower dry mix
normal -> habitat result
short/dry -> more olive/straw
flattened/disturbed -> slightly muted
accent -> mostly normal body, tall minority can dry
```

### Reuse existing channels before adding one

Audit whether the desired bias can be derived in the vertex shader from values
already encoded in:

- dryness;
- canopy AO;
- biome;
- transform scale;

If not, consider folding the bias into the final CPU-computed dryness rather than
adding another attribute.

Only add a new attribute if the colour variation cannot be represented without
corrupting an existing semantic.

### Keep per-blade shade variation subordinate

`grassBladeShade`, canopy AO jitter, and palette shade variation should create
micro detail, not visible salt-and-pepper colour.

Target rule:

```text
clump-to-clump value/hue change > blade-to-blade value/hue change
```

## 16. Phase FG9 - Strengthen root mass and grounding

### Objective

Make blades appear to emerge from one tuft body and from the soil rather than
hover above it.

### Existing mechanisms to tune first

- `rootDarkening`;
- `groundContactStrength`;
- `groundContactBaseScale`;
- `groundContactDryScale`;
- canopy AO;
- understory tier;
- `rootSink`;
- analytic grass-ground shadow.

### Desired root hierarchy

Approximate visual bands:

```text
0-10%   darkest / most occluded
10-25%  rapid transition into body
25-70%  main body
70-100% tip/sun/transmission emphasis
```

Do not implement these as hard bands. Use the existing smooth progress functions.

### Avoid the black-disc failure mode

Increasing root darkening must not create a uniform dark ring or disc under every
tuft. Root darkness should come from overlapping short blades plus gradual
progress shading, not a decal-like circle.

### Ground integration test

At 1-3 m camera distance:

- no bright line should appear between blade roots and soil;
- individual root cards should be difficult to isolate;
- dry/sparse tufts should reveal plausible soil between bodies;
- wet/dense tufts should hide more soil naturally.

## 17. Phase FG10 - Preserve clump identity through foreground LODs

### Objective

Do not make the improved 0-6 m grass collapse back into a uniform field at
6-30 m.

The system currently has:

- ultra-near segmented blades;
- regular near single blades;
- bridge layer;
- mid patch geometry;
- far impostors.

### Required parity

At minimum preserve across the first handoffs:

- clump density;
- clump location;
- broad height family;
- wet/dry identity;
- dominant lean direction where visible;
- canopy value;
- biome palette.

### Geometry differences are allowed

The mid layer does not need the exact near blade silhouette. It needs the same
**mass**.

For example:

```text
near: individual tiered blades
mid: one simplified clump body with same height/dryness/coverage
```

is correct if the handoff does not change the apparent tuft.

### Extend existing parity verifiers

Use/extend:

- `verify-lod-continuity`;
- `verify-lod-color-parity`;
- grass placement verification;
- visual-matrix captures.

Add assertions for any new morphology field that must survive the handoff.

### No brightness ring

The current renderer already contains detailed work to avoid brightness changes
at density/LOD handoffs. Any clump colour or width change must preserve that.

## 18. Phase FG11 - Configuration and code ownership

### Objective

Keep the implementation tunable without scattering constants.

### `public/config/world.yaml`

Own world-scale grass structure:

- clump radius/aspect distribution;
- clump directional weights;
- habitat response;
- optional new clump coherence/tier art controls.

### `public/config/grass.yaml`

Own blade-level art:

- blade base geometry;
- width/height ranges;
- curve;
- lean limits;
- root sink;
- base/tip/dry colours;
- lighting art controls.

### `GrassPaletteTuning.json`

Keep focused palette-shape constants that are shared by CPU/GLSL parity logic.
Do not duplicate these values in YAML if doing so creates two sources of truth.

### TypeScript tuning/constants

Keep only:

- safety maxima;
- bounds math;
- cache version;
- hashes/salts;
- mathematical thresholds that are not art controls.

### Config contract threading

Any new YAML key must be wired through the existing config contract:

- config type;
- schema;
- loader;
- validator where semantic bounds matter;
- `scripts/verify-config-contracts.mjs`.

No unused config key is acceptable.

## 19. Phase FG12 - Performance constraints

### Baseline rule

The screenshot's roughly 79 FPS is not a licence to spend blindly. Measure the
same pose before and after every tranche.

### Preferred cost profile

Spend in this order:

1. CPU placement math at tile-build time;
2. existing per-instance data;
3. vertex shader arithmetic;
4. only then fragment work;
5. avoid new texture fetches in the near grass fragment path.

### Explicit budget rules

- no blade count increase;
- no new draw call per archetype;
- no new material per archetype;
- no per-frame clump recomputation;
- no new per-fragment noise texture for clump colour;
- no increase in ultra-near radius as part of this task;
- no extra shadow-casting grass geometry.

### Performance gate

For the fixed hero pose, target:

- <= 3% average frame-time regression from the complete foreground pass;
- no meaningful increase in draw calls;
- near/ultra-near blade counts unchanged unless the accepted visual design
  deliberately **reduces** them;
- no new streaming spikes above existing bounds.

If the pass costs more than this, first remove fragment work before sacrificing
macro clump quality.

## 20. Phase FG13 - Verification plan

### Static/config verification

Run the existing full verification suite plus targeted grass checks.

At minimum verify:

- TypeScript compile;
- config contracts;
- grass shape/bounds tests;
- LOD continuity;
- LOD colour parity;
- deterministic placement;
- streaming/cache behaviour;
- built-site verification.

### Add targeted morphology verifier

Add a small headless script if current tests do not cover these properties.
Suggested checks across thousands of deterministic clumps:

- radius/aspect remain inside configured limits;
- tier shares are valid;
- vertical/horizontal scale never exceeds bounds assumptions;
- archetype frequencies are sane;
- `SHORT_DRY` mean height < `DENSE_NORMAL`;
- `TALL_WET` mean height > `DENSE_NORMAL`;
- `SPARSE_OPEN` mean coverage < `DENSE_NORMAL`;
- `FLATTENED` mean rest lean > `DENSE_NORMAL`;
- dry clump mean dryness > wet clump mean dryness;
- same seed produces byte-equivalent or numerically identical placement results
  where the existing contract requires it.

Do not make the verifier assert exact art values that will change during tuning.
Assert relationships and safety bounds.

### Visual acceptance matrix

Capture before/after for:

| Pose | What must improve |
| --- | --- |
| hero third-person | clumps dominate over individual blades |
| 1-3 m close-up | better root/body/tip hierarchy |
| dry exposed | no chalk-white mass, more open/short morphology |
| wet lush | taller coherent dense tufts, deeper healthy colour |
| path edge | sparse/disturbed clumps retain believable lean/gaps |
| 8-20 m handoff | no clump disappearance or brightness ring |
| compact hero | same macro clumps with reduced detail only |

### Manual motion test

Walk and rotate the camera slowly through the hero area.

Look for:

- shimmer from plane orientation;
- clump lattice becoming visible while moving;
- LOD colour pop;
- LOD density pop;
- camera-facing behaviour;
- culling at highly leaned blades;
- dry colour flashing under changing normal direction.

A still screenshot is not sufficient for sign-off.

## 21. Recommended implementation order

Keep commits narrow and independently reviewable.

### Commit FG-A - Baseline/debug only

- hero/diagnostic poses;
- optional clump/archetype/tier debug mode;
- no visual production changes.

### Commit FG-B - Morphology resolver

- add focused `GrassClusterProfile` resolver;
- move existing archetype scalar logic into it without changing output first;
- add deterministic tests;
- verify output parity before tuning.

This commit should ideally be a refactor with no intended screenshot change.

### Commit FG-C - Clump spatial/tier tuning

- core/edge irregularity;
- archetype-specific gap behaviour;
- tier balance;
- clump height coherence;
- bump `GRASS_PLACEMENT_VERSION`.

### Commit FG-D - Orientation/silhouette

- mild clump plane coherence;
- shape-family biases using existing variants;
- no density increase;
- bounds verification.

### Commit FG-E - Dry colour pipeline fix

- diagnose earliest incorrect colour/lighting term;
- correct palette/transmission/tip interaction;
- extend colour parity tests.

Keep this separate from morphology so colour regressions are easy to bisect.

### Commit FG-F - Root grounding and final art tuning

- root/body/tip balance;
- final YAML tuning;
- compact tuning;
- visual matrix update.

### Commit FG-G - Final verification only

- full local build;
- all verifiers;
- screenshots;
- performance record;
- no unrelated feature work.

## 22. Failure modes and rollback strategy

### Failure: clumps become obvious blobs

Symptoms:

- circular dark spots;
- repeated island pattern;
- visible empty channels around every tuft.

Rollback/tune:

- reduce core bias;
- increase shoulder overlap;
- reduce hole frequency;
- increase radius/aspect variation before adding density.

### Failure: clumps become starbursts

Symptoms:

- blades fan radially from obvious centres.

Rollback/tune:

- do not increase radial direction weight;
- keep dominant direction stronger than radial;
- preserve independent plane yaw component.

### Failure: field becomes too groomed

Symptoms:

- every tuft leans similarly;
- too many parallel blade planes;
- lawn-like repetition.

Rollback/tune:

- reduce plane coherence;
- retain stable clump-to-clump direction variation;
- increase local spread, not random per-blade height.

### Failure: dry grass becomes muddy/dark

Symptoms:

- dry area loses sunlight response;
- all stressed grass becomes brown-black.

Rollback/tune:

- restore direct light;
- reduce only excessive tip/transmission lift;
- keep dry albedo near plausible straw/olive value;
- do not solve brightness by multiplying final colour down.

### Failure: LOD ring returns

Symptoms:

- brightness/density band follows camera around 6-18 m.

Rollback/tune:

- compare shared morphology inputs across layers;
- verify widened-blade colour payback;
- verify micro-detail fade remains independent from LOD threshold;
- extend parity test before retuning visually.

### Failure: performance drops

Remove in this order:

1. debug-only production remnants;
2. extra fragment arithmetic;
3. unnecessary per-instance attribute;
4. expensive placement computations that can be reduced to stable hashes;
5. optional satellite logic.

Do not remove clump identity first. That is the visual objective of the task.

## 23. Final acceptance criteria

The foreground pass is complete only when all of the following are true.

### Visual

- Foreground grass reads as tufts before blades.
- At least four distinct clump morphologies are visible in the hero area without
  debug overlays.
- Tall blades are a minority that break the silhouette rather than define every
  blade.
- The lower canopy reads as a darker body.
- Sparse and dry habitats are visibly different concepts.
- Flattened grass has coherent rest direction without looking like a wind shader.
- No large near-white dry island remains unless explicitly intended by biome art.
- Dry grass stays muted olive/straw and responds normally to direct sunlight.
- Blade planes do not visibly face the camera.
- No obvious circular tuft stamps, 3x3 lattice, or radial starbursts.
- No bright root line against soil.

### LOD

- The same macro clump stays in the same place through ultra-near/near/bridge/mid.
- Wet/dry colour identity does not change at the handoff.
- No brightness ring follows the camera.
- No density ring follows the camera.

### Engineering

- deterministic world-space output preserved;
- `GRASS_PLACEMENT_VERSION` bumped when required;
- no per-frame allocation added to hot paths;
- no per-archetype draw calls/materials;
- config keys have one source of truth;
- static verifiers green;
- production build green;
- compact profile green;
- no >3% hero-pose frame-time regression without an explicitly accepted reason.

## 24. First implementation tranche

When implementation starts, do **not** change every visual axis at once.

The first production tranche should contain only:

1. extract the current archetype/tier logic into a pure clump-profile resolver
   with output parity;
2. strengthen between-clump height/tier coherence while reducing independent
   height noise;
3. introduce mild clump-level blade-plane coherence;
4. make dry/sparse/wet/flattened tier profiles more visibly different;
5. bump placement version;
6. capture the hero frame;
7. stop and review before touching palette values.

After morphology is visually correct, perform the dry-colour pipeline diagnosis
as a separate tranche. This separation is important: otherwise a better silhouette
can hide a worse material or vice versa, and it becomes difficult to know which
change actually improved the scene.
