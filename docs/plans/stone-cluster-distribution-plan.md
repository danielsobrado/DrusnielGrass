# Stone Cluster Distribution and Look-and-Feel Implementation Plan

## Status

- Target branch: `main`
- State: **final implementation specification**
- Scope: stone distribution, geological coherence, cluster composition, grounding, deterministic tuning, and performance protection
- Renderer: unchanged unless an existing defect is discovered
- Runtime dependencies: unchanged
- Deployment: manual GitHub Pages deployment; no GitHub Actions
- Performance target: same or fewer draw calls, same or fewer representative triangles, no new per-frame procedural work
- Design rules: deterministic, bounded, KISS, SOLID, cacheable, no physics simulation, no unbounded searches

This document is authoritative for the implementation. If code needs to deviate from an invariant or cost ceiling below, update the plan first rather than silently changing the contract.

---

# Objective

Make stones read as a consequence of geology, terrain exposure, and erosion rather than as individually good rocks scattered by 16 m cells.

Target hierarchy:

```text
geological region
    -> geological cluster/process
        -> anchor/source
        -> secondary stones
        -> debris
    -> clean terrain again
```

The improvement must come from **correlation and redistribution**, not more geometry.

---

# Final decisions

1. Keep `WorldStoneSystem`, `StoneRenderBatchBuilder`, render packing, materials, detailed/coarse geometry, streaming radii, and deadline-sliced building unchanged.
2. Do not add another stone LOD.
3. Do not add more stone mesh archetypes. Pebble, boulder, slab, block, shard, and outcrop are sufficient.
4. Use four terrain-derived processes only: `compact`, `ridge`, `scree`, and `fan`.
5. Replace normal independent per-cell stone placement with deterministic macro clusters plus a low-rate singleton fallback.
6. `WorldEcologyField` is authoritative for **surface exposure**. The existing low-frequency stone noise becomes **geological potential** only.
7. Keep `addVergeStones` as the only path-verge generator. Remove the recursive near-path satellite path from ordinary placement.
8. Remove generic 2-4 satellites once macro clustering is active.
9. Preserve split boulder/block masses, but a split consumes one logical secondary slot.
10. Do not add cluster-wide grass decals or a second clearance field in this iteration. Existing real stone clearances should provide grounding naturally.
11. Preserve determinism across cache eviction, source-cell order, chunk order, streaming order, and reload.
12. Do not add lil-gui/dat.gui or another UI dependency. The project already uses a lightweight native `<details>` tuning UI pattern.
13. Production YAML remains the source of truth. The stone tuning menu is an authoring tool and only exports/overrides values.
14. Keep `CHUNK_SOURCE_CELL_MARGIN = 1` for now because path-verge stones can cross one source-cell edge. Macro-cluster members themselves use final root-cell ownership and do not depend on the margin.
15. Before replacing the old placement algorithm, capture its deterministic root/triangle baseline over the exact fixed domain described below. The new system must not silently spend more geometry.

---

# Current problems to remove

## Quiet-cell repopulation

The current:

```text
FIELD_STONE_CHANCE = 0.52
```

repopulates too many cells that the regional rock field left empty. It weakens the contrast between clean terrain and actual formations.

Replace it with the singleton algorithm below.

## Duplicate path-edge generation

There are currently two path-edge mechanisms:

- `addVergeStones`;
- recursive `placeCandidate(... isSatellite = true)` near a path.

Keep only `addVergeStones`.

## Local satellites become redundant

The current large-parent satellite rule creates useful local groups, but once macro clusters own anchor/secondary/debris relationships it would create clusters inside clusters and make geometry cost hard to reason about.

Remove it after cluster integration tests pass.

---

# Hard performance contract

The implementation must satisfy all of these:

- no new steady-state work in `WorldStoneSystem.update` beyond existing reconciliation/build work;
- no new draw calls;
- no new textures;
- no new material instances;
- no new shader feature for clustering;
- no physics;
- no Poisson-disc generation;
- no unbounded rejection or relaxation loops;
- no per-frame cluster sampling;
- exactly 3x3 macro descriptor checks per generated stone source cell;
- fixed maximum logical members per cluster;
- maximum one generic overlap-correction move per normal member;
- bounded descriptor and resolved-cluster caches;
- representative visible roots <= legacy baseline;
- representative detailed/coarse triangles <= legacy baseline;
- stone vertex payload remains <= 36 bytes/vertex using the existing three streams;
- desktop production batching remains 49 stone draw calls at shipped settings;
- desktop material split remains 9 detailed + 40 coarse draws;
- compact maximum batching remains 16 draws at shipped settings;
- existing `StoneRenderPerformanceVerification` batching ratios remain unchanged;
- do not increase `stoneRadiusDesktop`, `stoneRadiusCompact`, `stoneDetailRadius`, or `stoneDetailRadiusCompact` to compensate for distribution changes.

The visual improvement must come from better placement.

---

# Existing frame-time budgets

Respect the current world streaming/build reserves:

```text
desktop total streaming build budget: 8.00 ms
desktop stone reserve:                2.00 ms
compact total streaming build budget: 5.00 ms
compact stone reserve:                1.25 ms
```

Cluster work belongs only in stone collection/build work. It must never migrate into the normal frame hot path.

Wall-clock timings are hardware dependent and must **not** become deterministic build assertions.

Manual hardware acceptance:

```text
desktop stone build p95 <= 2.00 ms
compact stone build p95 <= 1.25 ms
no repeated > 4 ms stone spikes during normal traversal
no sustained stone queue growth after crossing one terrain chunk
```

Compare the same build/browser/profile/route at least three times before declaring a timing regression.

---

# Files and exact responsibilities

## New: `src/world/stones/StonePlacementProfile.ts`

Move reusable placement data currently private in `StoneField.ts` here so cluster composition does not duplicate it.

Move/export:

```text
LEVEL_WEIGHTS
SLOPE_WEIGHTS
SCALE_BANDS
BIOME_PALETTE
BIOME_MOSS
```

`BIOME_DENSITY` becomes obsolete when independent ordinary-stone counts are removed and should be deleted unless another caller still genuinely uses it.

This file contains data only. No terrain sampling and no renderer imports.

## New: `src/world/stones/StoneClusterTuning.ts`

Algorithm constants only:

- cluster hash domain;
- process/role identifiers;
- `STRIKE_PERIOD` moved from `StoneField.ts`;
- process-classification constants;
- family relationship tables;
- orientation spreads;
- member positional jitter;
- maximum fan lateral factor;
- split constants;
- overlap factors;
- cache limits;
- small pure angle/reach helpers.

Production art knobs belong in YAML, not this file.

Recommended cache limits:

```text
descriptor cache:       512
resolved-cluster cache: 256
```

Trim oldest-first to about 60% when a limit is reached. Eviction may change recomputation frequency only, never output.

## New: `src/world/stones/StoneClusterField.ts`

Pure deterministic macro geology.

Responsibilities:

- own the macro lattice;
- derive jittered potential cluster centers;
- own low-frequency geological potential and strike sampling moved out of `StoneField`;
- sample terrain landform/ecology once per uncached descriptor;
- decide activation;
- classify process;
- resolve strike/downhill direction;
- resolve radius/aspect/budget;
- resolve cluster DNA;
- compute conservative `influenceRadius`;
- expose descriptor lookup by macro coordinates;
- hold the descriptor cache.

Do not import scene, renderer, materials, or `WorldStoneSystem`.

## New: `src/world/stones/StoneClusterComposition.ts`

Pure composition from a `StoneClusterDescriptor`.

Responsibilities:

- assign logical member slots;
- assign `anchor`, `secondary`, and `debris` roles;
- generate process-specific local offsets;
- choose family-related archetypes;
- derive scale hierarchy;
- derive orientation hierarchy;
- derive correlated material variation;
- mark the first secondary slot as split-eligible when the deterministic split roll succeeds;
- provide an independent fallback-secondary specification for that slot.

It returns immutable member specifications. It does **not** sample terrain and does not create `StoneInstance` objects.

## Modify: `src/world/stones/StoneField.ts`

Keep this class as orchestration/final placement validation.

Do exactly this:

1. construct one `StoneClusterField`;
2. construct one `StoneClusterComposition`;
3. add a bounded resolved-cluster cache keyed by macro coordinates;
4. keep the existing 16 m cell cache;
5. replace normal independent stone counts with macro descriptor lookup;
6. query exactly the surrounding 3x3 macro coordinates for each generated source cell;
7. perform descriptor broad-phase rejection before resolving members;
8. resolve a complete intersecting cluster once through `getResolvedCluster(gx, gz)`;
9. filter accepted cluster roots by final `[min,max)` ownership into the current 16 m cell;
10. evaluate the singleton fallback once only when no active cluster influence intersects the source cell;
11. run `addVergeStones` after geological placement;
12. preserve world bounds, slope rejection, path clearance, sinking, tilt, variant selection, granite blend, and grass clearance;
13. remove recursive near-path satellite placement;
14. remove generic parent satellites;
15. resolve split slots using the special split rules below;
16. keep `CHUNK_SOURCE_CELL_MARGIN = 1` for verge coverage;
17. update class/module comments so they describe macro clusters rather than the removed independent placement model.

`getResolvedCluster` must resolve the complete family before any source-cell filtering. Otherwise overlap correction, anchor validity, and split behavior can depend on which cell was queried first.

## Modify: `src/world/WorldConfig.ts`

Add every production cluster field listed in the YAML section below.

No optional values.

## Modify: `src/world/WorldConfigSchema.ts`

Add primitive range/integer validation using the exact ranges below.

## Modify: `src/world/WorldConfigValidator.ts`

Add all cross-field invariants, including the **exact 3x3 coverage invariant** below.

Do not put cross-field validation in `WorldConfigLoader`.

## Modify: `public/config/world.yaml`

Add the shipped cluster values in the procedural-stone section.

This is the production source of truth.

## New: `src/world/stones/StoneClusterVerification.ts`

Own:

- descriptor/member determinism;
- neighborhood completeness;
- cache independence;
- source-cell/chunk ownership;
- budget/attempt bounds;
- process statistics;
- singleton behavior;
- deterministic distribution summary;
- legacy root/triangle baseline comparison.

Do not duplicate geometry watertightness tests already owned by `StoneVerification.ts`.

## Modify: `scripts/verify-stones.mjs`

Load/run `StoneClusterVerification.ts` with the existing stone verifiers.

`npm run test:stones` remains the single local stone gate.

## New: `tools/stone-world/StoneClusterTuningMenu.ts`

Authoring-only native DOM tuning UI using `<details>`, labels, inputs, and buttons, matching the existing `GrassArtMenu` style rather than adding a GUI package.

Responsibilities:

- expose only approved production cluster parameters;
- enforce primitive UI limits;
- normalize dependent values;
- call `validateWorldConfig()` on the complete merged config before rebuilding;
- debounce rebuilds;
- reset to loaded YAML;
- export YAML;
- copy a reproducible probe URL.

Never import this from production `WorldApp`.

## New: `tools/stone-world/stone-world.css`

Move the stone-world probe's inline styling here and add authoring-menu styling.

Do not grow production `src/style.css` for this tool.

## Modify: `stone-world.html`

Replace inline styles with:

```html
<link rel="stylesheet" href="/tools/stone-world/stone-world.css" />
```

## Modify: `tools/stone-world/main.ts`

Refactor into small responsibilities:

```text
load config asynchronously
parse tool-only query overrides
build terrain once
validate merged stone config
create/recreate stone probe
update diagnostics
render frame
```

Use `WorldConfigLoader.load()` rather than keeping the current synchronous XHR.

When tuning changes:

- keep terrain/scene/camera unchanged;
- dispose the previous `WorldStoneSystem`;
- create a new immutable merged `WorldConfig` object;
- call `validateWorldConfig()` before construction;
- create a new `StoneField` and `WorldStoneSystem`;
- drain the static probe build exactly as today;
- refresh diagnostics;
- rebuild after a 120 ms debounce while sliders move;
- never rebuild every animation frame.

Preserve `growth=natural|moss|lichen` behavior.

## No change: production app/render files

Do not change unless a real existing defect is discovered:

```text
src/app/WorldApp.ts
src/world/stones/WorldStoneSystem.ts
src/world/stones/StoneRenderBatchBuilder.ts
src/world/stones/StoneRenderPacking.ts
src/world/stones/StoneRenderInstanceWriter.ts
stone shader/material files
```

---

# Exact production YAML

Add:

```yaml
# Macro stone geology. 56 m intentionally does not divide the 16 m stone cell
# or 64 m terrain chunk, avoiding visible lattice lock.
stoneClusterSpacing: 56
stoneClusterCenterJitter: 0.26
stoneClusterRadiusMin: 10
stoneClusterRadiusMax: 22
stoneClusterAspectMin: 0.58
stoneClusterAspectMax: 0.92
stoneClusterBudgetMin: 4
stoneClusterBudgetMax: 8
stoneClusterCoreRatio: 0.42
stoneClusterShoulderRatio: 0.78
stoneClusterHaloRatio: 1.12
stoneClusterDensityResponse: 6
stoneSingletonChance: 0.10
```

Keep:

```yaml
stoneDensity: 0.17
stoneClusterChance: 0.82
```

New semantics:

- `stoneDensity`: global macro-formation frequency input; reducing it removes whole formations instead of thinning every cell.
- `stoneClusterChance`: final macro activation multiplier; it no longer controls parent satellites.

## Schema ranges

```text
stoneClusterSpacing          40 .. 96
stoneClusterCenterJitter     0 .. 0.35
stoneClusterRadiusMin        4 .. 30
stoneClusterRadiusMax        8 .. 40
stoneClusterAspectMin        0.45 .. 0.90
stoneClusterAspectMax        0.60 .. 1.00
stoneClusterBudgetMin        integer 4 .. 8
stoneClusterBudgetMax        integer 4 .. 12
stoneClusterCoreRatio        0.20 .. 0.60
stoneClusterShoulderRatio    0.50 .. 0.90
stoneClusterHaloRatio        0.90 .. 1.25
stoneClusterDensityResponse  1 .. 12
stoneSingletonChance         0 .. 0.25
```

Existing `stoneDensity` and `stoneClusterChance` keep their existing schema ranges.

---

# Exact cross-field validation

Require:

```text
stoneClusterRadiusMin < stoneClusterRadiusMax
stoneClusterAspectMin <= stoneClusterAspectMax
stoneClusterBudgetMin <= stoneClusterBudgetMax
stoneClusterCoreRatio < stoneClusterShoulderRatio
stoneClusterShoulderRatio < stoneClusterHaloRatio
```

The old simplified rule:

```text
radiusMax * halo <= spacing * 0.5
```

is **not** the authoritative 3x3 proof because it ignores member lateral spread, member jitter, center jitter, and stone-cell width.

Use these named algorithm constants in `StoneClusterTuning.ts`:

```text
STONE_CLUSTER_MEMBER_JITTER = 0.035
STONE_CLUSTER_FAN_MAX_LATERAL = 0.68
```

The maximum normalized root reach is:

```text
maxNormalizedReach(halo) = hypot(
  halo + STONE_CLUSTER_MEMBER_JITTER,
  halo * STONE_CLUSTER_FAN_MAX_LATERAL + STONE_CLUSTER_MEMBER_JITTER
)
```

This is conservative because `minorRadius <= majorRadius` and `fan` has the widest lateral rule.

Then:

```text
maxInfluenceRadius =
  stoneClusterRadiusMax * maxNormalizedReach(stoneClusterHaloRatio)
```

For a source cell whose center chooses the base macro coordinate, any unqueried macro cell is at least two macro indices away on one axis. A 3x3 query is complete only if:

```text
maxInfluenceRadius + stoneCellSize * 0.5
  < stoneClusterSpacing * (1.5 - stoneClusterCenterJitter)
```

`validateWorldConfig` must enforce this exact invariant.

This makes the 3x3 lookup mathematically valid across all accepted YAML combinations, not just the shipped values.

---

# Data contracts

## `StoneClusterProcess`

```text
compact | ridge | scree | fan
```

## `StoneClusterRole`

```text
anchor | secondary | debris
```

## `StoneClusterDescriptor`

Immutable value fields:

```text
gridX
gridZ
seed
active
centerX
centerZ
height
geologyPotential
surfaceRockiness
suitability
process
strike
direction
majorRadius
minorRadius
influenceRadius
budget
biomeIndex
paletteKey
valueBase
mossBias
```

No mutable scratch-object references may escape into a descriptor.

## `StoneClusterMemberSpec`

Immutable logical composition fields:

```text
index
role
archetype
localU
localV
normalizedRadius
scale
rotationY
variantIndex
valueScale
mossScale
splitEligible
```

`normalizedRadius` is the authored radial coordinate used for size hierarchy. Do not recompute it from a position after overlap correction.

For the split-eligible secondary, composition also stores an independent deterministic fallback-secondary specification for the same logical slot.

## Internal accepted-member record in `StoneField`

While resolving one cluster keep:

```text
instance: StoneInstance
footprintRadius: number
memberIndex: number
role: StoneClusterRole
isSplitHalf: boolean
```

Do not use `clearRadius` as a physical-overlap proxy. Pebbles can have `clearRadius = 0` while still having a real footprint.

---

# Exact deterministic cluster algorithm

## 1. Macro lattice

```text
S = stoneClusterSpacing
base macro cell for source-cell center:
baseGx = floor(sourceCellCenterX / S)
baseGz = floor(sourceCellCenterZ / S)
```

Each source cell queries exactly:

```text
gx = baseGx - 1 .. baseGx + 1
gz = baseGz - 1 .. baseGz + 1
```

For macro cell `(gx, gz)`:

```text
seed = hashStoneCell(gx, gz, config.seed XOR STONE_CLUSTER_DOMAIN)
rng  = StoneRandom.fromSeed(seed)
```

There is at most one potential macro cluster per macro cell.

## 2. Jittered center

```text
j = stoneClusterCenterJitter
centerX = (gx + 0.5 + rng.fork("center-x").signed(j)) * S
centerZ = (gz + 0.5 + rng.fork("center-z").signed(j)) * S
```

Use labeled forks so adding unrelated random fields later cannot move existing formations.

## 3. Geological potential

Move the existing two-octave field from `StoneField` and keep its first implementation mathematically unchanged:

```text
coarse = valueNoise(x / 240, z / 240, rockSeed)
fine   = valueNoise((x * 2.7) / 240, (z * 2.7) / 240, rockSeed XOR 0x9e3779b9)
field  = (coarse + 0.4 * fine) / 1.4
geologyPotential = smoothstep(field, 0.52, 0.78)
```

Meaning:

```text
underlying formation is likely rocky here
```

not:

```text
rock must be exposed on the surface here
```

Expose this pure sampler from `StoneClusterField` because singleton/verge logic also reuses it.

## 4. Shared terrain/ecology sample

For an uncached descriptor sample once at the cluster center:

```text
height        = field.sampleHeight(centerX, centerZ)
landform      = field.sampleLandform(centerX, centerZ, scratch)
hydrology     = field.sampleHydrology(centerX, centerZ, height, scratch)
pathDistances = field.samplePathDistances(centerX, centerZ, scratch)
ecology       = field.resolveEcology(
                  centerX,
                  centerZ,
                  height,
                  hydrology,
                  pathDistances,
                  scratch
                )
biome          = sampleGrassBiome(centerX, centerZ)
biomeIndex     = pickGrassBiomeIndex(centerX, centerZ, biome)
```

Do not create another moisture/slope/soil model in the stone system.

## 5. Suitability

```text
surfaceVisibility = 0.18 + 0.82 * ecology.rockiness
pathSurvival      = 1 - 0.90 * ecology.disturbance
suitability       = clamp01(
                      geologyPotential
                      * surfaceVisibility
                      * pathSurvival
                    )
```

The `0.18` floor keeps rare partly buried meadow formations possible.

## 6. Activation

```text
densityResponse =
  1 - exp(-stoneClusterDensityResponse * stoneDensity)

suitabilityResponse = smoothstep(suitability, 0.14, 0.72)

activationProbability =
  stoneClusterChance
  * densityResponse
  * suitabilityResponse
```

One activation roll only:

```text
active = rng.fork("activation").chance(activationProbability)
```

Inactive descriptors are cached too.

No fallback cluster attempts.

## 7. Process classification

Apply in this order:

```text
if landform.slope >= ECOLOGY_ROCK_SLOPE_START:
    scree
else if landform.convexity >= 0.25:
    ridge
else if landform.convexity <= -0.25 and landform.slope >= 0.08:
    fan
else:
    compact
```

Reuse `ECOLOGY_ROCK_SLOPE_START` from ecology rather than duplicating its value.

Keep `0.25` and `0.08` as named cluster algorithm constants.

## 8. Direction

```text
strike = sampleStrike(centerX, centerZ)
normal = field.sampleNormal(centerX, centerZ, scratch)
downhillAngle = atan2(normal.z, normal.x)
```

Then:

```text
compact -> strike + rng.fork("direction").signed(0.35)
ridge   -> strike
scree   -> downhillAngle
fan     -> downhillAngle
```

Do not compute another terrain gradient.

## 9. Radius

```text
radiusT = smoothstep(suitability, 0.20, 0.85)
baseRadius = lerp(stoneClusterRadiusMin, stoneClusterRadiusMax, radiusT)
majorRadius = clamp(
  baseRadius * rng.fork("radius").range(0.90, 1.10),
  stoneClusterRadiusMin,
  stoneClusterRadiusMax
)
```

## 10. Aspect

```text
aspect = rng.fork("aspect").range(
  stoneClusterAspectMin,
  stoneClusterAspectMax
)
```

Process bias:

```text
compact -> lerp(aspect, 0.95, 0.55)
ridge   -> aspect
scree   -> lerp(aspect, stoneClusterAspectMin, 0.45)
fan     -> lerp(aspect, 0.88, 0.45)
```

Then:

```text
minorRadius = majorRadius * aspect
```

## 11. Logical budget

```text
budgetT = smoothstep(suitability, 0.25, 0.80)
budget = round(lerp(stoneClusterBudgetMin, stoneClusterBudgetMax, budgetT))
budget = clamp(budget, stoneClusterBudgetMin, stoneClusterBudgetMax)
```

This is a **logical slot budget**.

For `budget >= 4`:

```text
anchorCount = 1
secondaryCount = clamp(floor((budget - 1) * 0.35), 1, 2)
debrisCount = budget - anchorCount - secondaryCount
```

Examples:

```text
budget 4 -> 1 anchor, 1 secondary, 2 debris
budget 6 -> 1 anchor, 1 secondary, 4 debris
budget 8 -> 1 anchor, 2 secondaries, 5 debris
```

The anchor is logical slot/member `0`.

Use independent labeled random forks:

```text
member:0
member:1
...
```

No retry loop fills rejected members.

---

# Exact composition geometry

Define:

```text
core     = stoneClusterCoreRatio
shoulder = stoneClusterShoulderRatio
halo     = stoneClusterHaloRatio
```

Local `(u,v)` coordinates transform to world space with:

```text
dirX  = cos(direction)
dirZ  = sin(direction)
perpX = -dirZ
perpZ = dirX

worldX = centerX + dirX * (u * majorRadius) + perpX * (v * minorRadius)
worldZ = centerZ + dirZ * (u * majorRadius) + perpZ * (v * minorRadius)
```

## Anchor

`compact` and `ridge`:

```text
u = signed(0.06)
v = signed(0.06)
normalizedRadius = hypot(u, v)
```

`scree` and `fan`:

```text
u = -0.16 + signed(0.04)
v = signed(0.05)
normalizedRadius = hypot(u, v)
```

## Secondary radial coordinate

```text
r = lerp(core * 0.55, shoulder * 0.92, random.next())
normalizedRadius = r
```

## Debris radial coordinate

```text
t = sqrt(random.next())
r = lerp(core, halo, t)
normalizedRadius = r
```

`sqrt` intentionally gives the shoulder/halo more area without rejection sampling.

## Compact

```text
angle = random.range(0, 2*pi)
u = cos(angle) * r
v = sin(angle) * r
```

## Ridge

```text
side = random.chance(0.5) ? -1 : 1
u = side * r
```

Secondary:

```text
v = random.signed(0.18 * r)
```

Debris:

```text
v = random.signed(0.34 * r)
```

## Scree

Downhill is positive `u`.

Secondary:

```text
u = r
v = random.signed(r * lerp(0.16, 0.30, r / halo))
```

Debris:

```text
u = r
v = random.signed(r * lerp(0.22, 0.48, r / halo))
```

## Fan

Downhill is positive `u`.

Secondary:

```text
u = r
v = random.signed(r * lerp(0.24, 0.46, r / halo))
```

Debris:

```text
u = r
v = random.signed(r * lerp(0.32, 0.68, r / halo))
```

## Positional breakup

After process placement:

```text
u += random.fork("jitter-u").signed(STONE_CLUSTER_MEMBER_JITTER)
v += random.fork("jitter-v").signed(STONE_CLUSTER_MEMBER_JITTER)
```

Do not sample another world-space noise field per member.

---

# Conservative influence radius and broad phase

The broad phase must include every possible root generated by the formulas above.

Do **not** use only:

```text
majorRadius * halo
```

because fan/scree lateral spread can put a valid root outside that circle.

For every descriptor compute:

```text
normalizedReach = maxNormalizedReach(stoneClusterHaloRatio)
influenceRadius = majorRadius * normalizedReach
```

For the source-cell AABB `[minX,maxX] x [minZ,maxZ]`:

```text
dx = max(minX - centerX, 0, centerX - maxX)
dz = max(minZ - centerZ, 0, centerZ - maxZ)
```

Skip member resolution only when:

```text
dx*dx + dz*dz > influenceRadius*influenceRadius
```

Exact order:

```text
lookup descriptor
-> inactive? skip
-> broad-phase miss? skip
-> resolve/cache whole cluster
-> filter accepted roots to source cell
```

The verifier must prove that every generated normal member root lies within `influenceRadius`.

---

# Archetype relationships

## Anchor base table

Use:

```text
compact -> LEVEL_WEIGHTS[biomeIndex]
ridge   -> LEVEL_WEIGHTS[biomeIndex]
scree   -> SLOPE_WEIGHTS
fan     -> LEVEL_WEIGHTS[biomeIndex]
```

Set pebble weight to zero before normalization.

Then apply process modifiers:

```text
ridge:
  slab    *= 1.35
  outcrop *= 1.35
  boulder *= 0.70

scree:
  shard   *= 1.25
  outcrop *= 1.15

fan:
  boulder *= 1.25
  slab    *= 1.10
  shard   *= 0.75
  outcrop *= 0.70
```

`compact` has no additional modifier.

## Secondary family table

| Anchor | Secondary weights |
|---|---|
| boulder | boulder 0.55, slab 0.20, block 0.15, shard 0.10 |
| slab | slab 0.50, block 0.20, boulder 0.20, shard 0.10 |
| block | block 0.50, shard 0.20, boulder 0.20, slab 0.10 |
| outcrop | block 0.35, shard 0.30, slab 0.20, boulder 0.15 |
| shard | shard 0.50, block 0.25, boulder 0.15, slab 0.10 |

## Debris family table

| Anchor | Debris weights |
|---|---|
| boulder | pebble 0.70, boulder 0.30 |
| slab | pebble 0.55, slab 0.25, shard 0.20 |
| block | pebble 0.45, block 0.30, shard 0.25 |
| outcrop | pebble 0.35, shard 0.35, block 0.30 |
| shard | pebble 0.45, shard 0.55 |

Secondary/debris archetypes are never chosen independently from their anchor family.

---

# Scale hierarchy

## Anchor

From the selected archetype scale band `[minScale,maxScale]`:

```text
anchorScale = lerp(minScale, maxScale, random.range(0.62, 0.92))
```

The existing rare landmark-boulder multiplier is allowed only for:

- a boulder anchor with `suitability >= 0.72`; or
- a true singleton boulder satisfying the existing geological restriction.

Never apply it to secondaries, debris, or split halves.

## Secondary

Use the authored `normalizedRadius` from composition:

```text
radiusT = min(1, normalizedRadius / halo)
radialScale = lerp(0.72, 0.48, radiusT)
secondaryScale = anchorScale * radialScale * random.range(0.90, 1.08)
```

Clamp to the selected secondary archetype's existing scale band.

## Debris

```text
radiusT = min(1, normalizedRadius / halo)
radialScale = lerp(0.38, 0.18, radiusT)
debrisScale = anchorScale * radialScale * random.range(0.85, 1.15)
```

Clamp lower bound to `0.22` and upper bound to the selected archetype maximum.

Overlap correction must not change the scale because scale follows the authored composition, not the accidental corrected position.

---

# Orientation model

Treat bedding orientation as an axis with period `pi` where appropriate.

Role spread additions:

```text
anchor    0.00
secondary 0.10
debris    0.28
```

Per archetype:

```text
outcrop: yaw = strike + signed(0.18 + roleExtra)
slab:    yaw = strike + signed(0.22 + roleExtra)
block:   yaw = strike + signed(0.28 + roleExtra)
boulder: yaw = axisLerp(strike, direction, 0.35) + signed(0.42 + roleExtra)
shard:   yaw = direction + signed(0.38 + roleExtra)
pebble:  yaw = random.range(0, pi)
```

Implement `axisLerp` using the shortest difference modulo `pi`, not ordinary heading interpolation.

---

# Cluster DNA and material correlation

Resolve once per active cluster:

```text
clusterValueBase = rng.fork("value").range(0.96, 1.03)
clusterMossBias  = rng.fork("moss").range(0.88, 1.12)
```

Base palette comes from `BIOME_PALETTE[biomeIndex]`.

For meadow clusters preserve the current mossy-palette idea at cluster level:

```text
if biomeIndex == meadow
   and surfaceRockiness < 0.35
   and rng.fork("palette-mossy").chance(0.22):
    paletteKey = mossy
```

otherwise use the biome palette.

Per member:

```text
valueScale = clamp(
  clusterValueBase + memberRandom.fork("value").signed(0.018),
  0.92,
  1.06
)
```

Refactor the existing moss function into a deterministic base calculation without its large independent random multiplier:

```text
mossBase =
  BIOME_MOSS[biomeIndex]
  * altitudeFade(height)
  * (1 - 0.35 * surfaceRockiness)
```

Cluster member:

```text
moss = clamp01(
  mossBase
  * clusterMossBias
  * memberRandom.fork("moss").range(0.94, 1.06)
)
```

Use cluster-center `surfaceRockiness` for cluster members so one family shares weathering conditions without an extra ecology sample per member.

Keep `graniteBlend` per member because actual member height can vary across a formation.

---

# Terrain/path validation and normal-member overlap

Resolve logical members in index order.

For every normal candidate:

1. resolve archetype/scale/variant and physical `footprintRadius`;
2. transform authored local offset to world coordinates;
3. reject outside the existing world margin;
4. sample actual height and normal;
5. preserve `SLOPE_REJECT_NY`;
6. preserve current footprint-aware path rejection;
7. preserve current sinking/tilt/clearance rules;
8. test physical overlap against already accepted cluster members.

## Anchor invariant

If logical member `0` fails world/terrain/path/slope validation, reject the entire cluster:

```text
resolved cluster = []
```

Never render source-less debris.

## Physical overlap

Use physical variant footprint radii:

```text
minimumDistance =
  0.78 * (candidateFootprint + existingFootprint) + 0.12
```

If overlapping, perform at most one correction:

```text
pushDirection = normalize(candidatePosition - existingPosition)
```

If almost coincident, use the authored process-local radial direction.

Move outward by:

```text
needed = minimumDistance - currentDistance + 0.04
```

Then resample terrain/path once and recheck all accepted members once.

If still invalid/overlapping, reject the candidate.

No second correction.

---

# Split-mass rule

Split masses are the one intentional exception to normal overlap handling.

Rules:

1. only an anchor `boulder` or `block` can split;
2. preserve current `SPLIT_CHANCE` and same-variant identity;
3. composition marks the **first secondary logical slot** as split-eligible;
4. `StoneField` resolves the real split offset only after the anchor variant/footprint is known;
5. a successful split half is tagged `role=secondary` and consumes that logical slot;
6. the anchor/split pair does **not** run through generic overlap correction;
7. the split half still checks every other already accepted member normally;
8. preserve the current terrain-height/slope/path validation for the split half;
9. if the split attempt is invalid, use the precomputed normal fallback-secondary spec for the same logical slot;
10. no additional logical slot is created.

Desired split root distance:

```text
desiredGap =
  random.range(SPLIT_GAP_MIN, SPLIT_GAP_MAX)
  + anchorFootprint * 1.05
```

To keep the split root inside the descriptor's guaranteed influence envelope, only allow a split if:

```text
desiredGap <= majorRadius * core * 0.60
```

Otherwise use the fallback secondary directly.

## Budget accounting

Distinguish logical slots from validation attempts:

```text
logical member slots <= stoneClusterBudgetMax
```

A split can fail and then validate one fallback for the same slot, therefore:

```text
placement validation attempts <= logical budget + 1
```

under shipped and all valid configurations because only one anchor split is possible.

Do not write tests claiming validation attempts can never exceed logical budget.

---

# Singleton algorithm

Consider one singleton only when the source-cell AABB does not intersect the `influenceRadius` of any **active** queried macro descriptor.

At the source-cell center sample:

- geological potential;
- height;
- shared ecology once.

```text
singletonSuitability =
  geologyPotential * (0.25 + 0.75 * ecology.rockiness)

singletonProbability =
  stoneSingletonChance
  * lerp(0.35, 1.0, singletonSuitability)
```

One deterministic roll:

```text
random.fork("singleton").chance(singletonProbability)
```

Family:

```text
70% pebble
22% boulder
 8% slab
```

The root is generated inside the source cell and uses normal world/path/slope validation.

Preserve the rare landmark boulder rule only when the singleton's geology is sufficiently rocky, matching the existing restriction.

With `stoneSingletonChance = 0.10`, raw probability is approximately 3.5%-10%, far below the old 52% quiet-cell fallback.

---

# Path-verge stones

`addVergeStones` remains separate because it represents human disturbance rather than geology-cluster composition.

Keep its existing:

- path-distance sampling;
- path tangent alignment;
- iterative verge-line refinement;
- footprint-aware tread clearance;
- small archetype/scale behavior;
- local overlap check;
- one-source-cell-edge coverage assumption.

Replace the old regional `rockiness` argument with **geological potential**, not cluster activation and not another random field.

Keep its probability shape exactly:

```text
stoneVergeChance * (0.35 + 0.65 * geologyPotential)
```

This preserves the existing story: a path through rocky substrate turns up more kicked-aside stones, but even softer ground can have an occasional one.

Do not add another path-edge spawning mechanism.

---

# Source-cell ownership and cache behavior

For macro-cluster members, ownership is based only on final root position:

```text
x >= cellMinX && x < cellMaxX
z >= cellMinZ && z < cellMaxZ
```

Each source cell independently queries/resolves the same nearby macro clusters, then keeps only roots it owns.

This means a cluster crossing 16 m or 64 m boundaries remains deterministic and duplicate-free.

Keep the existing `CHUNK_SOURCE_CELL_MARGIN = 1` because verge stones are still generated from a source cell and may cross one edge. Do not use that margin as cluster ownership.

Under shipped settings a 64 m chunk contains 4x4 owned stone cells, while collection touches a 6x6 source-cell window because of the one-cell margin. Those 6 source-cell centers span only 80 m per axis, so at 56 m macro spacing they cover at most three base macro indices per axis. Expanding each by the required ±1 descriptor neighborhood touches at most:

```text
5 x 5 = 25 unique macro descriptor keys
```

per cold shipped chunk collection.

This `<=25` bound is a shipped-config performance gate, not a universal theorem for arbitrary future `stoneCellSize`/spacing values.

---

# Algorithmic cost ceilings

For shipped configuration:

```text
stone cell:                         16 m
terrain chunk:                      64 m
macro cluster spacing:              56 m
macro descriptor checks/source cell: 9
max logical cluster budget:          8
max validation attempts/cluster:     9
max generic overlap corrections:     one per normal candidate
max unique macro descriptors/cold chunk: 25
```

Do not resolve all potential descriptors into member arrays blindly.

Descriptor-first order is mandatory:

```text
descriptor cache lookup
-> inactive skip
-> influence-circle/AABB skip
-> resolved-cluster cache lookup/generation
-> root ownership filter
```

---

# Tuning menu

The menu is an authoring aid for `stone-world.html`, not part of production gameplay.

Use nested `<details>` sections so primary controls stay readable.

## Primary: distribution

Expose:

```text
stoneDensity
stoneClusterChance
stoneSingletonChance
stoneClusterSpacing
```

Authoring ranges:

```text
Density            0.00 .. 0.40  step 0.01
Cluster chance     0.00 .. 1.00  step 0.02
Singleton chance   0.00 .. 0.25  step 0.01
Cluster spacing    40   .. 96    step 2 m
```

Allow zero in the authoring UI so cluster/singleton layers can be isolated during A/B inspection.

## Primary: footprint

Expose:

```text
stoneClusterRadiusMin
stoneClusterRadiusMax
stoneClusterAspectMin
stoneClusterAspectMax
stoneClusterCenterJitter
```

Authoring ranges:

```text
Radius min      4.0 .. 30.0  step 1 m
Radius max      8.0 .. 40.0  step 1 m
Aspect min     0.45 .. 0.90 step 0.01
Aspect max     0.60 .. 1.00 step 0.01
Center jitter  0.00 .. 0.35 step 0.01
```

## Advanced: composition

Expose:

```text
stoneClusterBudgetMin
stoneClusterBudgetMax
stoneClusterCoreRatio
stoneClusterShoulderRatio
stoneClusterHaloRatio
stoneClusterDensityResponse
```

Authoring ranges:

```text
Budget min       4 .. 8     step 1
Budget max       4 .. 12    step 1
Core ratio     0.20 .. 0.60 step 0.01
Shoulder ratio 0.50 .. 0.90 step 0.01
Halo ratio     0.90 .. 1.25 step 0.01
Density curve  1.00 .. 12.0 step 0.25
```

## Do not expose

Keep these algorithmic:

- ridge/fan classification thresholds;
- minimum fan slope;
- member jitter;
- fan lateral coefficients;
- orientation spreads;
- family-weight tables;
- overlap coefficients;
- split coefficients;
- hash domains;
- cache sizes.

If one of these is wrong across many seeds, fix the algorithm and test it rather than turning it into another art knob.

## Menu normalization

After any input, normalize in this order:

```text
budgetMin <= budgetMax
aspectMin <= aspectMax
core < shoulder < halo
radiusMin < radiusMax
```

Then calculate the exact maximum radius allowed by 3x3 coverage:

```text
safeRadiusMax =
  (spacing * (1.5 - centerJitter) - stoneCellSize * 0.5 - 1e-6)
  / maxNormalizedReach(halo)
```

Clamp `radiusMax <= safeRadiusMax`, then ensure `radiusMin <= radiusMax - 1` for the integer-metre authoring control.

Finally call `validateWorldConfig(mergedConfig)` before rebuilding. UI normalization is convenience; validator logic remains authoritative.

## Buttons

Add exactly:

```text
Apply now
Reset YAML
Export YAML
Copy probe URL
```

- `Apply now`: bypass 120 ms debounce.
- `Reset YAML`: restore loaded production values.
- `Export YAML`: copy/download only the complete stone cluster block, including `stoneDensity` and `stoneClusterChance`.
- `Copy probe URL`: include location/camera/growth and all current tuning values as tool-only query parameters.

Use exact world-config key names in query parameters. The tool parser must whitelist them and reject unknown/invalid numeric values.

Production `WorldConfigLoader` must never read these overrides.

---

# Deterministic verification

## General rule

Deterministic tests must not depend on:

- WebGL;
- camera timing;
- wall-clock speed;
- random test order;
- visual judgment.

Use real production `TerrainField`, config, `StoneClusterField`, composition, and `StoneField` through Vite SSR, following the existing stone verifier pattern.

## Canonical serialization

Serialize descriptor/member/instance values in fixed field order.

Quantize only floating values produced by terrain/trigonometry:

```text
position/height/radius: 1e-4
angles:                 1e-6
scale/moss/value:       1e-6
```

Enums/integers/strings remain exact.

Use a local FNV-1a 32-bit helper for compact reporting, but equality tests compare canonical strings too so a hash collision cannot hide a failure.

## Primary macro domain

Use shipped seed/config:

```text
gx = -18 .. 18
gz = -18 .. 18
```

That is 1,369 potential descriptors.

For source-cell/chunk tests use at least:

```text
chunkX = -6 .. 6
chunkZ = -6 .. 6
```

## Secondary process-coverage domain

If the primary macro domain contains no accepted example of one geological process, scan one fixed larger domain:

```text
gx = -32 .. 32
gz = -32 .. 32
```

If the process is still absent, fail with a clear message. Do **not** expand indefinitely.

---

# Required deterministic tests

## A. Descriptor determinism

Construct two independent `TerrainField` + `StoneClusterField` pairs.

All 1,369 primary descriptors must serialize identically.

## B. Composition determinism

For every active primary descriptor, compose twice through independent objects and require identical logical member specs.

## C. Influence-radius completeness

For every composed normal member in primary + secondary process domains, transform its authored root and assert:

```text
distance(root, descriptor.center) <= descriptor.influenceRadius + 1e-6
```

For a valid split, separately assert its constrained root offset is also within `influenceRadius`.

This catches future changes to fan/scree geometry that forget to update broad-phase reach math.

## D. 3x3 neighborhood completeness

For a deterministic set of source cells across positive/negative macro phase boundaries:

1. collect cluster roots using production 3x3 lookup;
2. collect again using a verifier-only brute-force 5x5 macro lookup;
3. canonicalize roots owned by the same source cell;
4. require exact equality.

Run this with:

- shipped configuration;
- at least three synthetic boundary-valid configs combining low spacing, high center jitter, high halo, and different legal `stoneCellSize` values.

The test must use `validateWorldConfig()` first; invalid combinations are not test cases.

## E. Query-order independence

Collect the same fixed chunk set in:

```text
row-major
reverse row-major
deterministic shuffled order using seed 0x51c1a57e
```

Map:

```text
chunkKey -> canonical StoneInstance signature
```

All maps must match.

## F. Cache-eviction independence

1. capture a fixed central descriptor/cluster/chunk set;
2. query enough distant coordinates to exceed descriptor, resolved-cluster, and existing source-cell cache limits;
3. query the original set again;
4. require identical canonical signatures.

## G. Boundary ownership

For adjacent source cells/chunks around the origin and several negative-coordinate boundaries:

- each macro-cluster root belongs to exactly one 16 m cell by `[min,max)` ownership;
- each rendered root belongs to exactly one chunk;
- no duplicate `(x,z,archetype,variantIndex)` cluster root occurs across adjacent chunks;
- results do not depend on which side is queried first.

Verge roots are allowed to originate from a neighboring source cell; chunk collection must still contain them exactly once after final chunk filtering.

## H. Anchor invariant

Inject or deterministically locate an anchor that fails terrain/world/path/slope validation.

Resolved cluster must be empty.

## I. Budget and attempt bounds

Across the full primary domain require:

```text
logical member slots <= configured budget
configured budget <= stoneClusterBudgetMax
accepted instances <= logical slots
```

For split handling track validation attempts separately:

```text
validation attempts <= logical slots + 1
```

Only one logical secondary slot may be split-eligible.

## J. Split behavior

For deterministic valid split cases require:

- same archetype and variant as anchor;
- split consumes first secondary slot;
- split root obeys its maximum core offset;
- generic anchor/split overlap correction is not applied;
- failed split uses exactly one deterministic fallback-secondary attempt;
- no extra logical slot appears.

## K. Process-direction statistics

For active accepted clusters with at least three members:

```text
scree: mean debris u > anchor u
fan:   outer-half mean |v/u| >= inner-half mean |v/u|
ridge: variance along u > variance along v
compact: both axes have non-zero spread
```

Require at least one tested cluster of each process across the bounded primary/secondary domains.

## L. Size hierarchy

Across all tested clusters with all roles:

```text
mean anchor scale > mean secondary scale
mean secondary scale > mean debris scale
```

Also require at least 65% of individual three-role clusters to satisfy the same ordering. Archetype-band clamps can create legitimate exceptions.

## M. Singleton probability behavior

Collect at least 512 eligible non-cluster source cells.

For each, compute its deterministic `singletonProbability` and roll.

Require:

```text
abs(observedRollRate - meanProbability) <= 0.025
observedRollRate <= 0.15
```

This verifies the implementation follows the probability field without freezing an exact terrain-rejected visible singleton count.

If 512 eligible cells are not available in the primary chunk domain, use one fixed larger source-cell domain. Do not search indefinitely.

## N. Complexity counters

Verification-only counters/derivations must require, for shipped config:

```text
macro descriptor checks per generated source cell == 9
unique macro descriptor keys per cold 64 m chunk <= 25
logical slots per cluster <= 8
validation attempts per cluster <= 9
generic overlap corrections <= normal candidate count
```

## O. Existing renderer contracts

`StoneRenderPerformanceVerification` and `StoneSystemPerformanceVerification` must pass **without changing their expected values**:

```text
49 desktop batched stone draws
9 detailed + 40 coarse desktop draws
16 compact maximum batches
<= 36 bytes/vertex
3 vertex streams
packed normalized Int16/Uint8 streams retained
precomputed bounding box/sphere retained
```

---

# Legacy baseline capture before replacement

Before Step 4 changes normal placement, capture the old deterministic cost on `main`.

Use the same fixed chunk domain the new verifier will use:

```text
chunkX = -6 .. 6
chunkZ = -6 .. 6
includeSmall = true
```

Record:

```text
total roots
archetype counts
detailed representative triangles
coarse representative triangles
maximum roots in one chunk
```

Store these values as test-only constants in `StoneClusterVerification.ts` with a comment stating they are the pre-cluster deterministic cost baseline.

After integration require:

```text
new total roots <= legacy total roots
new representative detailed triangles <= legacy detailed triangles
new representative coarse triangles <= legacy coarse triangles
```

Do not update the legacy baseline because the new distribution exceeded it. An intentional budget increase requires a separate plan decision.

---

# Distribution regression summary

`StoneClusterVerification.ts` should print, but initially not freeze, this deterministic shipped-config summary:

```text
potential macro cells
active clusters
active-cluster percentage
compact/ridge/scree/fan counts
logical member slots
validation attempts
accepted cluster members
anchors/secondaries/debris
split successes/fallbacks
singleton rolls/accepted
mean accepted members per active cluster
mean anchor/secondary/debris scale
max accepted members in one cluster
legacy/new root ratio
legacy/new representative triangle ratio
```

After visual approval, commit one compact canonical fingerprint for the shipped distribution. Later intentional YAML/algorithm art changes update that fingerprint in the same commit.

Do not freeze every percentage as a permanent contract.

---

# Performance verification workflow

## Deterministic local gate

Run:

```bash
npm run test:stones
```

It must cover:

```text
geometry
profiles
runtime variants
growth
cluster determinism/distribution
legacy cost comparison
render packing/performance
production stone-system batching
```

Then:

```bash
npm run build
```

No GitHub Actions.

## Authoring probe

Run:

```bash
npm run dev
```

Open:

```text
/stone-world.html?tune=1&x=0&z=0&span=320
```

Probe output should show at minimum:

```text
focus x/z
growth mode
stone roots
active render batches
draw calls
triangles
latest/peak build ms
active macro clusters in probe bounds
compact/ridge/scree/fan counts
accepted cluster members
split count
singletons
```

Generate the cluster/process summary only on probe rebuild/inspection, never per animation frame.

## Real-world manual route

After candidate YAML is committed, test:

```text
?diagnostics=1&control=fly
```

Traverse repeatedly through:

- quiet meadow;
- rocky area;
- slope/scree;
- alpine;
- path edge;
- water edge.

Observe existing HUD:

```text
Stones ... tris ... Build last/peak ms
Frame ... stone ... ms
Draws ... Triangles ...
```

Acceptance:

- no higher steady-state stone draw count;
- no continually growing stone queue;
- no repeated stone build spikes beyond the intended reserve;
- no meaningful FPS regression versus the same pre-change route/profile.

---

# Visual tuning sequence

Tune one level at a time.

## Pass 1: macro rhythm

Change only:

```text
stoneDensity
stoneClusterChance
stoneSingletonChance
stoneClusterSpacing
```

Goal:

- clear meadow intervals;
- recognizable rocky regions;
- no visible macro lattice rhythm from aerial view;
- singleton rocks feel exceptional.

## Pass 2: footprint

Tune:

```text
radius min/max
aspect min/max
center jitter
```

Goal:

- formations are readable;
- no obvious circles;
- ridge/scree direction is visible;
- neighboring formations do not become a continuous carpet.

## Pass 3: composition

Tune:

```text
budget min/max
core/shoulder/halo ratios
density response
```

Goal:

- one readable anchor;
- secondaries support the silhouette;
- debris thins outward;
- no decorative pebble ring.

## Pass 4: algorithm QA

Inspect many examples of:

```text
compact
ridge
scree
fan
```

If one process is consistently wrong across locations/seeds, fix the algorithm in `StoneClusterTuning.ts`/`StoneClusterComposition.ts` and strengthen its deterministic test. Do not compensate with global density.

## Pass 5: production verification

Export/copy chosen values into `public/config/world.yaml`, then run:

```bash
npm run test:config
npm run test:stones
npm run build
```

Finally verify the real world route.

---

# Deterministic visual locations

Reuse `WorldVisualMatrixLocations` instead of permanently inventing camera points.

Inspect at minimum:

```text
meadow
pathEdge
rocky
slope
dry
steppe
alpine
waterEdge
```

The stone-world probe can then preserve useful exact `x/z` positions in shareable URLs/screenshots.

Expected visual matrix:

```text
meadow:       mostly clean, occasional field stone
rocky:        compact/ridge hierarchy clearly visible
slope:        scree travels downhill
alpine:       exposed slab/outcrop families
steppe/dry:   angular sparse formations
pathEdge:     dedicated verge behavior, no tread blockage
waterEdge:    no floating/submerged placement regression
```

---

# Implementation sequence

## Step 0 - capture old deterministic baseline

Before changing normal placement:

```bash
npm run test:stones
npm run build
```

Capture the fixed `-6..6` chunk baseline described above.

## Step 1 - config contract

Change:

```text
public/config/world.yaml
src/world/WorldConfig.ts
src/world/WorldConfigSchema.ts
src/world/WorldConfigValidator.ts
```

Add/test exact 3x3 coverage validation.

Run:

```bash
npm run test:config
```

## Step 2 - shared placement profile + cluster descriptor field

Add:

```text
src/world/stones/StonePlacementProfile.ts
src/world/stones/StoneClusterTuning.ts
src/world/stones/StoneClusterField.ts
```

Move existing geological potential/strike and placement tables without changing old visible placement yet.

Add descriptor determinism and influence-radius tests.

Run:

```bash
npm run test:stones
```

## Step 3 - pure composition

Add:

```text
src/world/stones/StoneClusterComposition.ts
```

Implement roles, process offsets, family selection, scale/orientation, DNA, split-eligible/fallback specs.

Test independently.

## Step 4 - `StoneField` integration

Modify:

```text
src/world/stones/StoneField.ts
```

Wire:

- 3x3 descriptors;
- conservative broad phase;
- resolved-cluster cache;
- final root-cell ownership;
- anchor rejection;
- bounded overlap correction;
- split/fallback slot;
- singleton fallback;
- exact geological-potential verge input;
- satellite/recursive-verge removal.

Immediately add query-order, cache-eviction, 3x3-vs-5x5, and boundary tests.

## Step 5 - complete deterministic/performance gates

Complete:

```text
src/world/stones/StoneClusterVerification.ts
scripts/verify-stones.mjs
```

Confirm existing renderer verifiers remain unchanged/passing.

## Step 6 - authoring tool

Add/modify:

```text
tools/stone-world/StoneClusterTuningMenu.ts
tools/stone-world/stone-world.css
tools/stone-world/main.ts
stone-world.html
```

Use async config load, validated merged overrides, 120 ms debounced stone-only rebuild, YAML export, and reproducible URLs.

## Step 7 - visual tuning

Tune only through the menu, then commit chosen production values to:

```text
public/config/world.yaml
```

Do not bake tuned art values into TypeScript.

## Step 8 - full validation

Run:

```bash
npm run test:config
npm run test:stones
npm run build
```

Then perform the real-world diagnostics route and deterministic visual matrix.

---

# Acceptance criteria

## Visual

1. Quiet meadows contain substantially larger genuinely clean areas.
2. Rocky terrain reads as formations rather than uniform scatter.
3. Major formations show anchor/secondary/debris hierarchy.
4. Scree reads downhill.
5. Ridge clusters read along strike.
6. Fan clusters widen downhill.
7. Nearby stones share material/weathering character without becoming identical.
8. Singleton stones remain possible but uncommon.
9. Paths retain irregular kicked-aside verge stones without decorative kerbs.
10. No cluster renders debris after anchor rejection.

## Deterministic

11. Independent fields produce identical descriptors/compositions/instances.
12. Influence radius contains every possible generated root.
13. Production 3x3 lookup exactly matches verifier 5x5 brute force for owned roots.
14. Chunk/source-cell query order does not affect output.
15. Cache eviction does not affect output.
16. Root ownership is unique across boundaries.
17. Logical member count never exceeds configured budget.
18. Validation attempts never exceed logical budget + 1.
19. Generic overlap correction occurs at most once per normal candidate.
20. Split/fallback behavior consumes one secondary logical slot only.
21. Shipped deterministic summary/fingerprint is reproducible after visual approval.

## Performance

22. No new per-frame cluster work.
23. No new draws/materials/textures.
24. Desktop batching remains 49 draws, 9 detailed + 40 coarse.
25. Compact batching remains at most 16 draws.
26. Vertex payload remains <= 36 bytes/vertex and three streams.
27. New representative roots/triangles do not exceed captured legacy baseline.
28. Cold shipped chunk descriptor keys remain <=25.
29. Production streaming queue remains bounded during traversal.
30. Hardware checks show no meaningful frame-time regression under the same route/profile.

## Maintainability

31. `StoneField.ts` does not absorb the new macro algorithms/tables directly and should become materially easier to read.
32. Reusable placement tables live in `StonePlacementProfile.ts`, not duplicated.
33. Production art knobs live in YAML.
34. Algorithm constants live in `StoneClusterTuning.ts`.
35. Authoring UI remains out of production `WorldApp`.
36. Comments explain stable invariants/reasons, not this revision history.
37. No GitHub Actions are added.
38. Manual GitHub Pages deployment remains unchanged.

---

# Final target

The world should stop reading as:

```text
grass + randomly scattered good stone assets
```

and read as:

```text
terrain geology
-> exposed formation
-> anchor rock mass
-> related fragments
-> erosion/debris
-> clean terrain again
```

Prefer the result with the **same or fewer rendered stones** than today. Every stone should earn its cost by contributing to a coherent geological story.