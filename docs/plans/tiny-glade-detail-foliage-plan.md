# Tiny Glade-Inspired Detail Foliage Implementation Plan

## Status

- Target branch: `main`
- Scope: small bushes, flowers, ferns, broadleaf plants, seed heads, clustered distribution, ecology, deterministic tuning, verification, and performance protection
- Renderer: preserve the current atlas/material/instancing architecture
- Runtime dependencies: none added
- Deployment: manual GitHub Pages only; no GitHub Actions
- Principles: KISS, SOLID, deterministic, bounded, allocation-light, configuration-backed, build-time composition only

This is the final implementation specification. Do not redesign it during implementation unless a deterministic verifier, profiling result, or concrete visual defect proves a decision invalid.

---

# Objective

Make detail foliage read as small authored plant communities rather than an even decorative scatter.

Target hierarchy:

```text
glade
  -> colony
      -> clump
          -> individual plant
```

Target rhythm:

```text
quiet grass
  -> coherent daisy pocket
  -> quiet grass
  -> fern/broadleaf pocket beside stone
  -> occasional low-shrub anchor
  -> quiet grass
  -> sparse seed-head pocket
```

The improvement must come from:

1. negative space;
2. correlated local plant families;
3. coherent local flower tint;
4. clearly different silhouettes;
5. ecological agreement;
6. subtle internal age/height hierarchy;
7. fewer unrelated accents, not more rendered cards.

A visually dense colony is dense **relative to surrounding quiet grass**. This design never raises a candidate's survival probability above the current baseline. Saved cards are not literally moved into colony cores.

---

# Non-Goals

Do not:

- add 3D shrub meshes;
- increase detail-foliage render radius;
- add accent shadows;
- add another material;
- add another runtime texture;
- increase the eight-species shader ceiling;
- add instance attributes for colony data;
- use Poisson-disc placement;
- use neighbor searches;
- use physics or iterative relaxation;
- add per-frame colony/ecology work;
- add foliage trail interaction;
- add new flower colors before distribution is proven;
- increase production density above 0.35 cards/m²;
- widen analytical culling bounds to accommodate the new plants.

---

# Existing Renderer Contract to Preserve

```text
tile size                         16 m
candidate density                 0.35 / m²
candidates per full tile          90
detail fade midpoint              27 m
detail fade half-width            3 m
visibility radius                 32 m
card topology                     upright yaw billboard
card geometry                     6 vertices / 4 triangles
species slots                     8
phenotype rows                    2
atlas cell                        112 px + 8 px padding
atlas size                        1024 x 256
materials                         1
detail shadows                    off
detail tiles built per frame      1
normal per-frame distribution     none
```

The geometry is one upright yaw billboard formed by two stacked quads sharing the middle row. It is not a crossed-card shrub mesh. New shrub/rosette art must therefore read correctly from one silhouette.

Current reviewed workload ceiling:

```text
reference resident cards          ~1,890
reference drawn cards             ~1,488
reviewed worst-case cards          <= 2,070
reviewed detail draws              <= 22
reviewed detail vertices           <= 12,420
```

Wall-clock milliseconds remain manual profiling data, not deterministic build gates.

---

# Final Architecture Decisions

1. `WorldDetailFoliageMaterial` remains the only detail-foliage material.
2. Keep one procedural atlas.
3. Keep exactly eight species columns and two phenotype rows.
4. Keep six-vertex cards, current fade distances, 16 m tiles, and current residency.
5. Keep `castShadow = false` and `receiveShadow = false`.
6. Keep the quality-governor accent density multiplier.
7. Keep existing hard terrain/path/stone rejection.
8. Keep the current stratified candidate grid.
9. Colony/composition runs only during tile construction.
10. Add only two continuous distribution fields: macro colony + local clump.
11. The macro field also supplies correlated family/tint/maturity channels.
12. Use one candidate identity hash for all candidate-local random decisions.
13. Separate candidate-position PRNG use from acceptance/appearance randomness.
14. Pre-resolve species/tint indices during biome-profile loading.
15. Production art controls live in flat `world.yaml`.
16. Biome species/tint weights remain in `GrassBiomeProfiles.json`.
17. Species habitat semantics remain source constants.
18. Diagnostics use the current native DOM GUI pattern; do not add `lil-gui` or `dat.gui`.
19. Tuning changes invalidate detail tiles only and rebuild at one tile/frame.
20. Density is tuned last and may only stay equal or decrease.
21. `colonyStrength` is the master control for all new spatial correlation.

---

# Non-Negotiable Performance Contract

```text
new normal-frame distribution work                 0
new materials                                      0
new runtime textures                               0
new normal draw-call classes                       0
new accent shadows                                 0
new required instance attributes                   0
render-radius increase                             0
physics / Poisson / relaxation                     0
neighbor searches                                  0
unbounded loops                                    0
species ceiling                                    8
atlas dimension increase                           0
production density                                 <= 0.35 / m²
production candidates per 16 m tile                <= 90
detail tiles built per frame                       1
reviewed worst-case cards                          <= 2,070
reviewed detail draws                              <= 22
reviewed detail vertices                           <= 12,420
```

For a candidate that has already survived existing terrain/path/stone gates, new work is bounded by:

```text
continuous distribution fields                     2
lattice corners per field                          4
lattice-coordinate hashes                          8
candidate identity hashes                          1
new terrain samples                                0
new hydrology samples                              0
new ecology samples                                0
new neighbor queries                               0
new allocations introduced by colony logic         0
```

Channel scrambling from an already-computed integer hash is allowed and is not another world-position hash.

Do not rewrite the existing candidate-buffer system as part of this work.

---

# Exact Species Set

Keep:

```ts
GRASS_MAX_ACCENT_SPECIES = 8;
```

Use exactly:

```text
0  grass-tuft
1  low-shrub              replaces tall-tuft
2  fern
3  small-fern
4  daisy
5  round-bloom
6  seed-head
7  broadleaf-rosette      replaces sprig
```

## Categories

```ts
export type GrassAccentCategory =
  | "tuft"
  | "shrub"
  | "fern"
  | "broadleaf"
  | "flower"
  | "seed";
```

No shader impact.

## Replacement definitions

Keep the six unchanged species as they are today.

Use these starting values:

```text
low-shrub
    category               shrub
    aspect                 1.08
    windWeight             0.35
    canopyHeightBand       [0.76, 1.20]

broadleaf-rosette
    category               broadleaf
    aspect                 1.15
    windWeight             0.42
    canopyHeightBand       [0.62, 0.90]
```

Reason for these heights: the earlier lower proposal risked burying the shrub and rosette almost completely inside the grass canopy. The shrub must read as a small anchor without becoming a bush/tree layer; the rosette remains lower than normal flower tops.

Do not tune species geometry through the diagnostics menu.

## Bounds invariants

Keep catalogue ceilings at or below the current maxima:

```text
maximum canopy-height multiplier    <= 1.72
maximum canopy-width multiplier     <= 1.314
```

The replacements remain below them:

```text
low-shrub width ceiling             1.20 * 1.08 = 1.296
broadleaf width ceiling             0.90 * 1.15 = 1.035
```

Do not enlarge culling bounds for this work.

---

# Deterministic Randomness Model

## Problem

The current tile `SeededRandom` drives both candidate jitter and accepted-card appearance. Accepted candidates consume extra random values, so changing an acceptance rule can shift later candidate positions.

That makes visual A/B tuning noisy and couples unrelated behavior.

## Position stream

In `WorldDetailFoliageField.ts`, rename the tile PRNG to `positionRandom`.

For **every requested candidate**, regardless of later rejection, consume exactly:

```text
1 draw for x jitter
1 draw for z jitter
```

Never use this PRNG for:

- biome-density acceptance;
- distribution acceptance;
- species;
- tint;
- height;
- phenotype;
- yaw;
- dither;
- wind;
- AO.

At unchanged density, candidate positions must remain stable when composition settings change after this migration.

This migration intentionally causes a **one-time deterministic placement revision** relative to the old PRNG-coupled implementation. Do not require root-by-root parity with the pre-change baseline. After migration, composition tuning must not move the underlying candidate positions.

## New file: `src/world/grass/DetailFoliageRandom.ts`

Use:

```ts
export function detailFoliageHashInt2(
  x: number,
  z: number,
  seed: number,
): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function detailFoliagePositionHash(
  x: number,
  z: number,
  seed: number,
  salt: number,
): number {
  return detailFoliageHashInt2(
    Math.round(x * 100),
    Math.round(z * 100),
    (seed ^ salt) >>> 0,
  );
}

export function detailFoliageChannel01(
  hash: number,
  salt: number,
): number {
  let value = hash ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 4294967296;
}
```

Candidate identity:

```ts
const candidateHash = detailFoliagePositionHash(
  x,
  z,
  worldConfig.seed,
  CANDIDATE_SALT,
);
```

Use these fixed domains:

```ts
export const CANDIDATE_SALT = 0x517cc1b7;
export const BIOME_DENSITY_CHANNEL_SALT = 0xa24baed5;
export const DISTRIBUTION_KEEP_CHANNEL_SALT = 0x9fb21c65;
export const DOMINANT_DECISION_SALT = 0x68e31da4;
export const COMPANION_PICK_SALT = 0xb5297a4d;
export const TINT_COHERENCE_SALT = 0x1b56c4e9;
export const TINT_PICK_SALT = 0xd3a2646c;
export const HEIGHT_SALT = 0xfd7046c5;
export const INDIVIDUAL_MATURITY_SALT = 0xb55a4f09;
export const PHENOTYPE_SALT = 0x7f4a7c15;
export const YAW_SALT = 0x94d049bb;
export const DITHER_SALT = 0x369dea0f;
export const WIND_SALT = 0xdb4f0b91;
export const AO_SALT = 0xbb67ae85;
```

Keep the current tile-position seed domain for `positionRandom`; only its usage changes.

These salts are deterministic world identity, not YAML art tuning. Once shipped, changing them must change the reviewed selection golden.

---

# Runtime Tuning Contract

## New file: `src/world/grass/DetailFoliageTuning.ts`

```ts
export interface DetailFoliageTuning {
  density: number;
  colonyWorldSize: number;
  clumpWorldSize: number;
  colonyStrength: number;
  dominantFamilyShare: number;
  tintCoherence: number;
  quietZoneThreshold: number;
  backgroundSuppression: number;
  coreHeightBias: number;
  maturePhenotypeBias: number;
  ecologyStrength: number;
  edgeCompanionStrength: number;
  stoneFringeStrength: number;
  pathFringeStrength: number;
}
```

Define one shared limits table:

```ts
export const DETAIL_FOLIAGE_TUNING_LIMITS = {
  density: { min: 0.10, max: 0.35, step: 0.01 },
  colonyWorldSize: { min: 6, max: 16, step: 0.5 },
  clumpWorldSize: { min: 1, max: 4, step: 0.25 },
  colonyStrength: { min: 0, max: 1, step: 0.02 },
  dominantFamilyShare: { min: 0.50, max: 0.90, step: 0.01 },
  tintCoherence: { min: 0.50, max: 1, step: 0.01 },
  quietZoneThreshold: { min: 0, max: 0.70, step: 0.02 },
  backgroundSuppression: { min: 0, max: 0.90, step: 0.02 },
  coreHeightBias: { min: 0, max: 0.25, step: 0.01 },
  maturePhenotypeBias: { min: 0, max: 1, step: 0.02 },
  ecologyStrength: { min: 0, max: 1, step: 0.02 },
  edgeCompanionStrength: { min: 0, max: 0.80, step: 0.02 },
  stoneFringeStrength: { min: 0, max: 1, step: 0.02 },
  pathFringeStrength: { min: 0, max: 1, step: 0.02 },
} as const;
```

Use this single table from schema validation, diagnostics UI, runtime normalization, and tests.

Provide:

```ts
createDetailFoliageTuning(config)
normalizeDetailFoliageTuning(tuning)
detailFoliageTuningEquals(left, right)
```

Live normalization:

1. clamp every value;
2. enforce `clumpWorldSize <= colonyWorldSize * 0.5`;
3. return a copy.

Production YAML still fails closed; normalization exists for diagnostics/live input only.

---

# Production Configuration

Add these flat keys near the existing macro-grass settings:

```yaml
# Detail foliage composition. Tile topology, material, atlas, LOD and radius stay fixed.
detailFoliageDensity: 0.35
detailFoliageColonyWorldSize: 11
detailFoliageClumpWorldSize: 2.25
detailFoliageColonyStrength: 0.80
detailFoliageDominantFamilyShare: 0.80
detailFoliageTintCoherence: 0.94
detailFoliageQuietZoneThreshold: 0.34
detailFoliageBackgroundSuppression: 0.68
detailFoliageCoreHeightBias: 0.12
detailFoliageMaturePhenotypeBias: 0.62
detailFoliageEcologyStrength: 0.72
detailFoliageEdgeCompanionStrength: 0.30
detailFoliageStoneFringeStrength: 0.38
detailFoliagePathFringeStrength: 0.18
```

The stronger family/tint defaults are intentional. With the master-correlation response below, they leave useful margin above the deterministic local-correlation gates while still preserving roughly one quarter companion plants in a typical colony.

These are starting production values. Final values may change after fixed-pose visual tuning, inside the allowed limits.

---

# Exact Distribution Algorithm

## New file: `src/world/grass/WorldDetailFoliageDistribution.ts`

No Three.js, terrain, hydrology, ecology, renderer, or tile-coordinate dependency.

API:

```ts
export interface DetailFoliageDistributionSample {
  colony: number;
  clump: number;
  core: number;
  keepMultiplier: number;
  familyRoll: number;
  tintRoll: number;
  maturityRoll: number;
}

export function createDetailFoliageDistributionSample():
  DetailFoliageDistributionSample;

export class WorldDetailFoliageDistribution {
  constructor(seed: number, tuning: DetailFoliageTuning);
  setTuning(tuning: DetailFoliageTuning): void;
  sample(
    x: number,
    z: number,
    target: DetailFoliageDistributionSample,
  ): DetailFoliageDistributionSample;
}
```

`sample()` allocates nothing.

## Hash domains

```ts
const COLONY_SALT = 0x6d2b79f5;
const CLUMP_SALT = 0x1b873593;

const CHANNEL_PRESENCE_SALT = 0x27d4eb2f;
const CHANNEL_FAMILY_SALT = 0x9e3779b9;
const CHANNEL_TINT_SALT = 0x85ebca6b;
const CHANNEL_MATURITY_SALT = 0xc2b2ae35;
const CHANNEL_CLUMP_SALT = 0x165667b1;
```

Use:

```text
macro seed = worldSeed ^ COLONY_SALT
clump seed = worldSeed ^ CLUMP_SALT
```

## Multi-channel macro field

At each of four macro lattice corners:

1. call `detailFoliageHashInt2()` once;
2. derive presence, family, tint, and maturity with four channel salts.

At each of four clump lattice corners:

1. call `detailFoliageHashInt2()` once;
2. derive the clump channel.

Total lattice-coordinate hashes:

```text
4 macro + 4 clump = 8
```

Do not create separate world-noise fields for family/tint/maturity.

## Value interpolation

For field size `S`:

```text
u  = x / S
v  = z / S
ix = floor(u)
iz = floor(v)
fx = u - ix
fz = v - iz

wx = fx² * (3 - 2fx)
wz = fz² * (3 - 2fz)

lower = lerp(c00, c10, wx)
upper = lerp(c01, c11, wx)
value = lerp(lower, upper, wz)
```

No extra octave, sine noise, coordinate warp, or texture in the first implementation. If fixed-pose QA later exposes visible lattice alignment, a fixed coordinate rotation is the first fallback; do not add another noise field.

## Shape equations

Let:

```text
M = macro presence
C = clump channel
Q = quietZoneThreshold
S = colonyStrength
B = backgroundSuppression
```

Use exactly:

```text
macroBand = smoothstep(Q, min(1, Q + 0.40), M)
clumpBand = smoothstep(0.28, 0.72, C)

structured =
    macroBand *
    (0.60 + 0.40 * clumpBand)

core =
    mix(0.50, structured, S)

structuredKeep =
    mix(1 - B, 1, structured)

keepMultiplier =
    mix(1, structuredKeep, S)
```

Clamp outputs to `[0,1]`.

Set:

```text
sample.colony         = macroBand
sample.clump          = clumpBand
sample.core           = core
sample.keepMultiplier = keepMultiplier
sample.familyRoll     = macro family channel
sample.tintRoll       = macro tint channel
sample.maturityRoll   = macro maturity channel
```

## Master spatial-correlation response

Do **not** multiply every correlation directly by `colonyStrength`. At the shipped `0.80`, that weakens family/tint coherence enough to conflict with the document's own deterministic correlation gates.

Use one exact response for family, tint, height, and maturity:

```text
spatialCorrelation =
    smoothstep(
      0.0,
      0.75,
      clamp01(tuning.colonyStrength)
    )
```

Properties:

```text
colonyStrength = 0      -> spatialCorrelation = 0
colonyStrength >= 0.75  -> spatialCorrelation = 1
```

The upper quarter of the `colonyStrength` range still affects macro/core density shaping through the distribution equations, but family/tint/age coherence is already fully enabled. This avoids requiring maximum density suppression just to obtain coherent plant communities.

At `colonyStrength = 0`:

- `keepMultiplier = 1`;
- dominant-family correlation = 0;
- colony tint coherence contribution = 0;
- macro maturity contribution = 0;
- core height shift = 0.

---

# Biome Profile Runtime Resolution

## File: `src/grass/biome/GrassBiomeProfile.ts`

Separate source and runtime shapes:

```ts
interface GrassBiomeAccentSpeciesSource {
  species: string;
  tint?: string;
  weight: number;
}

export interface GrassBiomeAccentSpecies {
  species: string;
  speciesIndex: number;
  tint: string;
  tintRow: number;
  weight: number;
}
```

Rename fallback source data to:

```text
DEFAULT_ACCENT_SPECIES_SOURCE
```

Route JSON and fallback entries through one resolver:

1. validate species;
2. resolve species index;
3. fail if absent;
4. validate tint;
5. resolve tint row;
6. validate positive finite weight;
7. freeze the resolved runtime entry.

Add a bounded scan-cost contract:

```ts
export const GRASS_MAX_ACCENT_PROFILE_ENTRIES = 16;
```

Reject a biome profile with more than 16 accent entries. The planned meadow profile has 13, leaving useful art headroom while keeping every candidate weighted scan tightly bounded.

After profile resolution, candidate loops must not call:

```text
GRASS_ACCENT_SPECIES.find(...)
resolveGrassAccentTintRow(...)
```

---

# Exact Affinity Algorithm

## New file: `src/world/grass/DetailFoliageAffinity.ts`

No renderer imports and no candidate-loop allocations.

Reusable output:

```ts
export interface DetailFoliageSelection {
  speciesIndex: number;
  tintRow: number;
}

export function createDetailFoliageSelection():
  DetailFoliageSelection;
```

Main API:

```ts
export function resolveDetailFoliageSelection(
  profile: GrassBiomeProfile,
  ecology: WorldEcologySample,
  habitatDryness: number,
  pathMask: number,
  stoneMask: number,
  distribution: DetailFoliageDistributionSample,
  candidateHash: number,
  tuning: DetailFoliageTuning,
  target: DetailFoliageSelection,
): boolean;
```

Return `false` only if no positive legal selection exists.

## Habitat preference

```ts
function preference(
  value: number,
  target: number,
  tolerance: number,
): number {
  return clamp01(1 - Math.abs(value - target) / tolerance);
}
```

Importance weights:

```text
moisture       1.0
fertility      1.0
exposure       0.7
rockiness      0.7
disturbance    1.2
sum            4.6
```

Targets are `target/tolerance`:

| Species | Moisture | Fertility | Exposure | Rockiness | Disturbance |
| --- | --- | --- | --- | --- | --- |
| grass-tuft | .50/1.00 | .50/1.00 | .50/1.00 | .50/1.00 | .40/1.00 |
| low-shrub | .55/.55 | .65/.50 | .55/.55 | .35/.55 | .10/.35 |
| fern | .82/.42 | .55/.60 | .25/.45 | .45/.55 | .05/.25 |
| small-fern | .72/.50 | .52/.65 | .30/.50 | .60/.45 | .10/.35 |
| daisy | .55/.55 | .75/.42 | .65/.50 | .25/.60 | .10/.40 |
| round-bloom | .58/.52 | .68/.48 | .55/.55 | .20/.55 | .10/.40 |
| seed-head | .22/.45 | .35/.65 | .80/.45 | .50/.65 | .25/.60 |
| broadleaf-rosette | .72/.45 | .80/.38 | .35/.50 | .20/.50 | .08/.30 |

Compute:

```text
raw =
  (
    pref(moisture)    * 1.0 +
    pref(fertility)   * 1.0 +
    pref(exposure)    * 0.7 +
    pref(rockiness)   * 0.7 +
    pref(disturbance) * 1.2
  ) / 4.6

habitatScore = 0.15 + 0.85 * raw
```

The 0.15 floor prevents ecological hard walls.

Per profile entry:

```text
weight =
    entry.weight *
    mix(1, habitatScore, tuning.ecologyStrength)
```

## Edge signals

Current path/stone values are grass-clearance masks: near zero inside excluded cores and one on clear ground.

Only after hard rejection:

```text
pathFringe  = clamp01(4 * pathMask  * (1 - pathMask))
stoneFringe = clamp01(4 * stoneMask * (1 - stoneMask))
```

Apply:

```text
fern / small-fern / broadleaf:
  weight *= 1 +
      stoneFringe *
      tuning.stoneFringeStrength *
      tuning.edgeCompanionStrength

low-shrub:
  weight *= 1 +
      stoneFringe *
      0.5 *
      tuning.stoneFringeStrength *
      tuning.edgeCompanionStrength

daisy / round-bloom:
  weight *= 1 +
      pathFringe *
      tuning.pathFringeStrength *
      tuning.edgeCompanionStrength

seed-head:
  weight *= 1 +
      pathFringe *
      habitatDryness *
      tuning.pathFringeStrength *
      tuning.edgeCompanionStrength
```

Grass-tuft receives no edge boost.

Edge weighting never changes hard placement clearances or candidate survival.

---

# Exact Weighted Pick

Do not allocate arrays.

```text
total = sum(positive finite weights)
if total <= 0:
    return no selection

target = clamp01(roll) * total
lastPositive = none

for entries in stable profile order:
    if weight <= 0:
        continue
    lastPositive = entry
    target -= weight
    if target <= 0:
        return entry

return lastPositive
```

`lastPositive` protects against floating-point tail error near roll 1.

At most 16 profile entries may be scanned.

---

# Exact Colony Dominance Algorithm

Weighted-pick the dominant profile entry using `distribution.familyRoll` and the ecology/edge-adjusted weights.

Because `familyRoll` is a continuous macro field, nearby candidates tend to resolve the same dominant species.

Use:

```text
localCoherence =
    mix(0.90, 1.00, distribution.core)

pDominant =
    clamp01(
      tuning.dominantFamilyShare *
      spatialCorrelation *
      localCoherence
    )
```

Individual decision:

```text
if channel(candidateHash, DOMINANT_DECISION_SALT) < pDominant:
    selected = dominant
else:
    selected = compatible companion
```

Starting category compatibility:

| Dominant -> Candidate | tuft | shrub | fern | broadleaf | flower | seed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tuft | 1.00 | .65 | .65 | .75 | .70 | .70 |
| shrub | .90 | 1.00 | .65 | .90 | .30 | .25 |
| fern | .80 | .55 | 1.00 | .90 | .25 | .15 |
| broadleaf | .85 | .75 | .85 | 1.00 | .45 | .20 |
| flower | .85 | .25 | .30 | .65 | .55 | .30 |
| seed | .90 | .30 | .15 | .20 | .30 | 1.00 |

Companion weight:

```text
companionWeight =
    ecologyAndEdgeAdjustedWeight *
    compatibility(dominantCategory, candidateCategory)
```

Use `COMPANION_PICK_SALT` for the companion weighted-pick roll.

If no companion weight is positive, fall back to the normal ecology/edge-adjusted profile weighted pick.

Do not add a species-pair matrix in the first implementation.

---

# Exact Tint Algorithm

Tint remains owned by `GrassBiomeProfiles.json`.

For a selected flower species:

1. scan entries with matching `speciesIndex`;
2. sum positive **raw `entry.weight`** values;
3. weighted-pick `colonyTintRow` using `distribution.tintRoll`;
4. do not allocate a filtered list.

Using raw weights is intentional. Once species is already selected, habitat and edge factors are identical across that species' tint entries and cancel from the tint ratio.

Use:

```text
effectiveTintCoherence =
    tuning.tintCoherence * spatialCorrelation
```

Then:

```text
if channel(candidateHash, TINT_COHERENCE_SALT)
    < effectiveTintCoherence:
    tintRow = colonyTintRow
else:
    tintRow = independently weighted tint for this species
```

Use `TINT_PICK_SALT` for the independent tint roll.

At `colonyStrength = 0`, tint becomes individual again.

Non-flower species use tint row `0`.

---

# Exact Height and Maturity Algorithm

Never scale above a species' declared `canopyHeightBand`.

## Height

```text
baseHeightRoll = channel(candidateHash, HEIGHT_SALT)

heightShift =
    tuning.coreHeightBias *
    spatialCorrelation *
    (distribution.core - 0.50)

heightRoll = clamp01(baseHeightRoll + heightShift)

cardHeight =
    lerp(
      species.canopyHeightBand[0],
      species.canopyHeightBand[1],
      heightRoll
    ) * canopyHeight
```

This changes where a plant lands **inside** its existing band. It does not enlarge analytical bounds.

## Maturity

```text
individual = channel(candidateHash, INDIVIDUAL_MATURITY_SALT)

spatialMaturity =
    clamp01(
      0.75 * distribution.maturityRoll +
      0.25 * distribution.core
    )

maturity =
    mix(
      individual,
      0.70 * spatialMaturity + 0.30 * individual,
      spatialCorrelation
    )

pMatureRow =
    clamp01(
      tuning.maturePhenotypeBias *
      (0.35 + 0.65 * maturity)
    )

variantRow =
    channel(candidateHash, PHENOTYPE_SALT) < pMatureRow
      ? 1
      : 0
```

At `colonyStrength = 0`, maturity is candidate-local only.

No age attribute is added.

---

# Existing Appearance Rolls

Accepted-card appearance must stop consuming `positionRandom`.

Use candidate channels:

```text
yaw = channel(YAW_SALT) * TWO_PI

dither = channel(DITHER_SALT)

windScale =
    lerp(0.84, 1.16, channel(WIND_SALT)) *
    profile.windDamping

rootAo =
    resolveGrassCanopyAo(vigor, suitability) *
    lerp(0.99, 1.01, channel(AO_SALT))
```

Keep:

```text
coverage = habitatSample.density * pathMask * stoneMask
```

Keep packed instance data:

```text
packGrassAccent(speciesIndex, variantRow, tintRow)
```

Keep dither sorting and `mesh.count` prefix trimming unchanged.

---

# Exact Candidate Pipeline

## File: `src/world/grass/WorldDetailFoliageField.ts`

Move production density out of `DETAIL_FOLIAGE_DENSITY`; use `tuning.density`.

Keep structural constants such as tile size, fade, residency, bounds safety, and movement thresholds in source.

Candidate count:

```ts
const requested = Math.max(
  1,
  Math.round(
    DETAIL_FOLIAGE_TILE_SIZE *
      DETAIL_FOLIAGE_TILE_SIZE *
      tuning.density,
  ),
);
```

At 16 m and 0.35/m² this is 90.

Required order:

```text
1   consume exactly two positionRandom values for x/z
2   sample terrain height
3   sample suitability without slope
4   reject below MIN_SUITABILITY
5   sample path grass mask
6   reject hard path core
7   sample stone grass-clearance mask
8   reject hard stone clearance
9   sample terrain normal
10  compute complete suitability
11  reject below MIN_SUITABILITY
12  sample biome/profile
13  sample existing ecology once
14  fill existing reusable GrassHabitatSample
15  reject existing accentChance minimum
16  calculate candidateHash once
17  apply biome accentDensity gate via candidate channel
18  distribution.sample(x, z)
19  apply distribution keep gate via candidate channel
20  resolve species/tint through affinity module
21  resolve height inside species band
22  resolve phenotype row
23  resolve yaw/dither/wind/AO from candidate channels
24  write existing matrix and packed attributes
```

Biome-density gate:

```text
if channel(candidateHash, BIOME_DENSITY_CHANNEL_SALT)
    >= profile.accentDensity:
    reject
```

Distribution gate:

```text
if channel(candidateHash, DISTRIBUTION_KEEP_CHANNEL_SALT)
    >= distribution.keepMultiplier:
    reject
```

Because `keepMultiplier <= 1`, composition never creates extra candidates.

Factory owns one reused distribution sample and one reused affinity-selection target.

No distribution sampling before hard placement gates.

No extra terrain/hydrology/ecology sampling.

No candidate neighbor query.

---

# Exact Shrub Art Algorithm

## File: `src/world/grass/WorldDetailFoliageAtlasFactory.ts`

Replace `tall-tuft` with `drawLowShrub()`.

The shrub must read as a leafy miniature mass on one billboard, not a round sprite.

### Row 0: compact / young

```text
main branch groups                 5
horizontal centers                 -0.32 .. +0.32 cell width
branch tops                        0.55 .. 0.86 cell height
leaves                             14 .. 20
leaf length                        0.08 .. 0.16 cell height
leaf width/length                  0.38 .. 0.58
intentional silhouette holes       1
center density                     high
```

### Row 1: mature / open

```text
main branch groups                 6 .. 7
horizontal centers                 -0.45 .. +0.45
branch tops                        0.48 .. 0.92
leaves                             12 .. 18
leaf length                        0.10 .. 0.18
leaf width/length                  0.38 .. 0.60
intentional silhouette holes       2
center density                     medium
lateral breaker leaves             1 .. 2
```

Rules:

- asymmetric branch placement;
- no mirrored halves;
- no circle clusters;
- tapered elliptical leaves;
- preserve transparent holes large enough to survive mip reduction;
- darker root/center, slightly lighter outer tips;
- tint mask = 0;
- keep semantic R/G channels compatible with `grassResolvePalette`;
- do not draw one-pixel details that disappear before the fade.

---

# Exact Broadleaf-Rosette Art Algorithm

Replace `sprig` with `drawBroadleafRosette()`.

### Row 0: compact

```text
leaves                             7
base spacing                       2π / 7
angle jitter                       ±0.18 rad
leaf length                        0.30 .. 0.46 cell height
leaf width/length                  0.22 .. 0.34
root offset radius                 0.00 .. 0.04
center mass                        compact/dark
```

### Row 1: mature / asymmetric

```text
leaves                             6 .. 9
base spacing                       2π / leafCount
angle jitter                       ±0.28 rad
leaf length                        0.28 .. 0.52
leaf width/length                  0.22 .. 0.36
one-side length multiplier         0.78 .. 0.92
opposite-side multiplier           1.00 .. 1.10
center mass                        visible, less compact
```

Each leaf:

- tapers at root;
- widens through the lower/middle section;
- tapers to tip;
- has slight curvature;
- varies shade along length;
- uses no tint mask.

Avoid a flower-petal-ring look by varying length, width, angle, root offset, and overlap.

---

# Atlas Contract

Do not change:

```text
DETAIL_FOLIAGE_CELL_RESOLUTION     112
DETAIL_FOLIAGE_CELL_PADDING        8
DETAIL_FOLIAGE_VARIANT_ROWS        2
species columns                    8
atlas width                        1024
atlas height                       256
LinearMipmapLinearFilter
LinearFilter
generateMipmaps                    true
anisotropy                         4
premultiplyAlpha                   true
colorSpace                         NoColorSpace
```

No third-party assets.

---

# Exact Biome Starting Weights

Keep non-accent biome fields unchanged.

## Meadow

```json
[
  { "species": "daisy", "tint": "white", "weight": 1.20 },
  { "species": "daisy", "tint": "cream", "weight": 0.70 },
  { "species": "daisy", "tint": "sky-blue", "weight": 0.25 },
  { "species": "round-bloom", "tint": "pink", "weight": 0.35 },
  { "species": "round-bloom", "tint": "lavender", "weight": 0.25 },
  { "species": "round-bloom", "tint": "buttercup", "weight": 0.15 },
  { "species": "round-bloom", "tint": "poppy-red", "weight": 0.10 },
  { "species": "fern", "tint": "none", "weight": 1.70 },
  { "species": "small-fern", "tint": "none", "weight": 1.00 },
  { "species": "grass-tuft", "tint": "none", "weight": 3.60 },
  { "species": "broadleaf-rosette", "tint": "none", "weight": 1.70 },
  { "species": "low-shrub", "tint": "none", "weight": 0.55 },
  { "species": "seed-head", "tint": "straw", "weight": 0.25 }
]
```

## Dry steppe

```json
[
  { "species": "seed-head", "tint": "straw", "weight": 4.00 },
  { "species": "grass-tuft", "tint": "none", "weight": 2.50 },
  { "species": "low-shrub", "tint": "none", "weight": 0.65 },
  { "species": "broadleaf-rosette", "tint": "none", "weight": 0.25 },
  { "species": "round-bloom", "tint": "buttercup", "weight": 0.50 },
  { "species": "round-bloom", "tint": "cream", "weight": 0.20 },
  { "species": "round-bloom", "tint": "poppy-red", "weight": 0.08 }
]
```

## Alpine

```json
[
  { "species": "grass-tuft", "tint": "none", "weight": 4.00 },
  { "species": "small-fern", "tint": "none", "weight": 1.20 },
  { "species": "broadleaf-rosette", "tint": "none", "weight": 0.70 },
  { "species": "low-shrub", "tint": "none", "weight": 0.12 },
  { "species": "daisy", "tint": "white", "weight": 0.65 },
  { "species": "daisy", "tint": "cream", "weight": 0.30 },
  { "species": "daisy", "tint": "sky-blue", "weight": 0.30 },
  { "species": "round-bloom", "tint": "lavender", "weight": 0.55 },
  { "species": "round-bloom", "tint": "pink", "weight": 0.20 }
]
```

Green forms stay dominant in meadow; dry forms dominate steppe; shrubs remain rare alpine.

---

# Diagnostics Invalidation and Wiring

## `WorldDetailFoliageField.invalidate()`

Add:

```ts
invalidate(): void;
```

It must:

1. remove existing detail meshes from the scene;
2. dispose each tile through the current factory disposal path;
3. clear built tiles;
4. clear empty-tile cache;
5. clear desired requests;
6. clear queue;
7. clear reusable request state as needed;
8. mark count diagnostics dirty;
9. reset center/reconciliation/count-focus sentinels;
10. preserve enabled state;
11. preserve quality-governor density scale;
12. never synchronously rebuild.

The next normal update rebuilds at one tile/frame.

Equal normalized tuning must not invalidate.

## `WorldNearGrassField`

Own the current normalized tuning copy.

Expose:

```ts
getDetailFoliageTuning(): DetailFoliageTuning;
setDetailFoliageTuning(tuning: DetailFoliageTuning): void;
```

Setter:

```text
normalize
-> equality check
-> store copy
-> factory.setTuning()
-> detailFoliageField.invalidate()
```

Do not recreate atlas/material.

## `WorldGrassSystem`

Expose copy-safe delegating getter/setter only. Keep distribution/tuning logic out of `update()`.

---

# Diagnostics Tuning Menu

## New file: `src/app/DetailFoliageTuningMenu.ts`

Use the same native DOM approach as `GrassArtMenu`.

Create only when:

```text
profile.showGui && diagnostics=1
```

Controls use `DETAIL_FOLIAGE_TUNING_LIMITS`.

Labels:

```text
Density
Colony size
Clump size
Colony strength
Dominant family
Tint coherence
Quiet threshold
Background suppression
Core height bias
Mature phenotype
Ecology influence
Edge companions
Stone fringe
Path fringe
```

Behavior:

```text
input  -> update displayed value only
change -> normalize, resync, equality-check, apply once
```

Do not rebuild on every slider pixel.

`Reset to YAML` restores an immutable snapshot created from loaded production config.

YAML export uses the production flat key names and the same clipboard/download fallback as `GrassArtMenu`.

---

# Exact File Change Map

## New files

### `src/world/grass/DetailFoliageRandom.ts`

- integer hash primitives;
- position hash;
- candidate channel salts;
- channel scrambler.

### `src/world/grass/DetailFoliageTuning.ts`

- tuning interface;
- shared limits;
- config mapping;
- normalization;
- equality.

### `src/world/grass/WorldDetailFoliageDistribution.ts`

- two-scale continuous distribution;
- macro presence/family/tint/maturity channels;
- clump channel;
- allocation-free sampling.

### `src/world/grass/DetailFoliageAffinity.ts`

- habitat table;
- habitat scoring;
- edge weighting;
- weighted pick;
- dominant/companion selection;
- tint selection;
- reusable output target.

### `src/app/DetailFoliageTuningMenu.ts`

- diagnostics-only native controls;
- apply on `change`;
- Reset to YAML;
- YAML export.

### `scripts/verify-detail-foliage-distribution.mjs`

- deterministic distribution/selection tests.

## Modified files

### `public/config/world.yaml`

Add the fourteen flat production settings.

### `src/world/WorldConfig.ts`

Add fourteen required numeric fields.

### `src/world/WorldConfigSchema.ts`

Use the shared tuning limits.

### `src/world/WorldConfigValidator.ts`

Require:

```text
detailFoliageClumpWorldSize <= detailFoliageColonyWorldSize * 0.5
```

### `src/grass/biome/GrassAccentSpecies.ts`

- add shrub/broadleaf categories;
- replace slots 1 and 7;
- keep eight species.

### `src/grass/biome/GrassBiomeProfile.ts`

- split source/resolved accent shapes;
- pre-resolve `speciesIndex`/`tintRow`;
- enforce `GRASS_MAX_ACCENT_PROFILE_ENTRIES = 16`;
- route defaults through the same resolver.

### `src/grass/biome/GrassBiomeProfiles.json`

Use the starting weights above.

### `src/world/grass/WorldDetailFoliageAtlasFactory.ts`

- replace tall-tuft with low shrub;
- replace sprig with broadleaf rosette;
- preserve atlas dimensions/settings.

### `src/world/grass/WorldDetailFoliageField.ts`

- consume tuning;
- remove hardcoded production density;
- split position PRNG from acceptance/appearance;
- use one candidate hash;
- integrate distribution/affinity after hard gates;
- use reusable output targets;
- remove candidate-loop catalogue lookups;
- keep current buffers/material/render path.

### `src/world/grass/WorldNearGrassField.ts`

- create/store tuning;
- pass tuning to factory;
- expose tuning getter/setter;
- invalidate detail only when normalized tuning changes.

### `src/world/WorldGrassSystem.ts`

- delegate tuning getter/setter.

### `src/app/WorldApp.ts`

- create/dispose diagnostics detail-foliage menu.

### `scripts/verify-flower-variety.mjs`

- new species/category/art/bounds/profile-entry checks.

### `scripts/verify-grass-performance.mjs`

- workload, RNG separation, render-contract, scan-bound, and build-only checks.

### `scripts/verify-config-contracts.mjs`

- new config success/rejection cases.

### `package.json`

Add:

```json
"test:detail-foliage": "node scripts/verify-detail-foliage-distribution.mjs"
```

Run it from `build` before flower-variety and grass-performance verification.

### `docs/grass-detail-foliage-plan.md`

After implementation only, add a short shipped-status pointer to this plan. Do not duplicate the specification.

---

# Deterministic Verification

Do not freeze golden digests before the implementation is visually accepted.

During implementation, repeatability tests compare two runs directly. After visual tuning, freeze two reviewed SHA-256 values.

## Test 1: distribution repeatability + final golden

Use:

```text
64 x 64 = 4,096 points
x = -128 + ix * 4
z = -128 + iz * 4
ix, iz = 0..63
```

Serialize in fixed order at six decimals:

```text
colony
clump
core
keepMultiplier
familyRoll
tintRoll
maturityRoll
```

SHA-256 twice and require equality.

After visual acceptance freeze `DISTRIBUTION_GOLDEN_SHA256`.

## Test 2: full-selection repeatability + final golden

Use the same grid, real meadow profile, and fixed synthetic ecology:

```text
moisture       0.62
fertility      0.72
exposure       0.55
disturbance    0.08
rockiness      0.22
habitatDryness 0.28
pathMask       0.88
stoneMask      0.92
```

Serialize:

```text
keep flag
speciesIndex or -1
tintRow or -1
```

Require repeated SHA-256 equality.

After visual acceptance freeze `SELECTION_GOLDEN_SHA256`.

## Test 3: tile-boundary continuity

For `k = -8..8`, several fixed orthogonal coordinates, and epsilon `0.001 m`, sample both sides of every x/z 16 m boundary.

For all continuous distribution outputs require:

```text
abs(left - right) <= 0.011
```

Document the mathematical derivative bound next to the test. Do not use screenshot-derived tolerance.

Statically assert the distribution API has no tile-coordinate input.

## Test 4: output bounds

Across deterministic grids:

```text
all distribution outputs finite
all normalized distribution outputs in [0,1]
all selection weights finite and >= 0
```

## Test 5: negative space

Analyze fixed 256 x 256 m, divided into 8 m analysis cells. Sample each cell on a fixed 4 x 4 subgrid.

Quiet cell:

```text
mean keepMultiplier < 0.55
```

Starting production tuning must satisfy:

```text
quiet cells          20% .. 60%
mean keepMultiplier  0.58 .. 0.82
```

If starting values miss the gates, tune configuration; do not weaken the gates without reviewing the visual objective.

## Test 6: family correlation

Use fixed 128 x 128 grid at 1 m spacing with synthetic meadow ecology.

For right/down neighboring kept samples:

```text
same category ratio >= 0.60
clustered same-species ratio >= independent baseline + 0.10
```

Independent baseline uses the same ecology-adjusted weights but candidate-local rolls instead of the macro family channel.

The shipped `dominantFamilyShare = 0.80` and saturated spatial correlation at `colonyStrength = 0.80` are intentionally chosen to leave margin above this gate. The verifier is authoritative; do not lower the gate to accommodate weaker defaults.

## Test 7: tint correlation

For neighboring kept flower pairs:

```text
same tint row ratio >= 0.65
clustered same-tint ratio >= independent baseline + 0.12
```

Use a fixed region large enough to yield at least 100 flower pairs. Do not adapt region size at runtime.

The starting `tintCoherence = 0.94` is intentional; local flower color should read as a patch, with rare individual exceptions.

## Test 8: master off-switch

With identical inputs and `colonyStrength = 0`:

```text
keepMultiplier == 1
pDominant == 0
effectiveTintCoherence == 0
heightShift == 0
maturity uses individual roll only
```

## Test 9: ecology direction

Verify direction only:

```text
fern(wet,sheltered)           > fern(dry,exposed)
smallFern(wet,rocky)          > smallFern(dry,smooth)
broadleaf(fertile,moist)      > broadleaf(dry,poor)
lowShrub(lowDisturbance)      > lowShrub(highDisturbance)
seedHead(dry,exposed)         > seedHead(wet,sheltered)
daisy(fertile,open)           > daisy(poor,disturbed)
```

## Test 10: legal selections and bounded scans

```text
speciesIndex 0..7
tintRow inside current tint ceiling
selected species exists in active profile
non-flower tint row = 0
weighted-pick deterministic fallback works
GRASS_MAX_ACCENT_PROFILE_ENTRIES == 16
every biome accentSpecies.length <= 16
```

## Test 11: tuning normalization

```text
clump > colony/2 normalizes in live tuning
production loader rejects the same invalid relationship
equal normalized tuning does not trigger invalidation
```

## Test 12: RNG separation

For a fixed tile and fixed density:

1. generate all candidate x/z positions with composition disabled;
2. generate again with extreme quiet/background/ecology/tint settings;
3. require the complete x/z candidate sequence to be bit-identical.

This directly verifies the reason for separating `positionRandom`.

---

# Config Verification

Add explicit rejection tests:

```text
detailFoliageDensity: 0.36                         reject
detailFoliageColonyWorldSize: 5                    reject
detailFoliageClumpWorldSize: 5                     reject
clump > colony * 0.5                               reject
detailFoliageDominantFamilyShare: 0.95             reject
detailFoliageCoreHeightBias: 0.30                  reject
detailFoliageSomethingElse: 1                      reject unknown key
```

Assert all shipped values parse exactly.

---

# Structural Verification

Extend `verify-flower-variety.mjs`:

```text
low-shrub exists at index 1
broadleaf-rosette exists at index 7
tall-tuft absent
sprig absent
species count = 8
category union includes shrub and broadleaf
GRASS_MAX_ACCENT_PROFILE_ENTRIES = 16
every profile accentSpecies.length <= 16
maximum canopy height <= 1.72
maximum canopy width <= 1.314
low-shrub aspect > seed-head aspect
broadleaf max height < daisy max height
broadleaf max height < seed-head max height
drawLowShrub exists
drawBroadleafRosette exists
both routines structurally branch by phenotype row
atlas columns = 8
variant rows = 2
atlas size = 1024 x 256
```

Do not try to prove subjective beauty with regex.

---

# Grass Performance Verification

Extend `verify-grass-performance.mjs`.

Assert:

```text
detailFoliageDensity <= 0.35
round(16 * 16 * density) <= 90
DETAIL_FOLIAGE_TILE_SIZE === 16
DETAIL_FOLIAGE_VARIANT_ROWS === 2
GRASS_MAX_ACCENT_SPECIES === 8
DETAIL_FOLIAGE_TILES_PER_FRAME === 1
```

Renderer contract:

```text
one detail material
castShadow = false
receiveShadow = false
same 6-vertex / 4-triangle card
same fade/residency constants
same instanceMatrix
same instanceVariation
same instanceCoverage
same instanceBiome
same instanceAccent
no colony/clump/age/tint-family attribute
```

Build-only contract:

```text
WorldDetailFoliageDistribution referenced from factory/build path
no distribution.sample in WorldGrassSystem.update
no distribution.sample in material update
no distribution.sample in controller/render loop
```

RNG contract:

```text
positionRandom used only for x/z jitter
exactly two positionRandom draws per requested candidate
accepted-card appearance uses candidate channels
no accepted-card positionRandom.next/range calls
candidate-position stability test passes
```

Lookup/scan contract:

```text
candidate loop contains no GRASS_ACCENT_SPECIES.find
candidate loop contains no resolveGrassAccentTintRow
resolved profile entries contain speciesIndex + tintRow
profile accent entry count <= 16
no temporary weight-array allocation in candidate selection
```

Do not loosen the current card/draw/vertex envelope.

---

# Manual Baseline Before Implementation

Before F1, record current `main` at fixed deterministic locations.

Pin:

```text
world config
grass art preset
quality tier = 0
viewport
device profile
camera pose
```

Record:

```text
accentCards
accentTiles
renderer draw calls
renderer triangles/vertices if available
nearTileBuildMs
maxNearTileBuildMs
desktop frame stats
compact-device frame stats
```

Capture meadow, path verge, rocky patch, water edge, dry steppe, alpine, one close low-angle accent shot, and one 10-25 m medium-distance field.

The F5 RNG-separation migration intentionally changes some old candidate positions once. The baseline remains valid for visual quality and workload comparison, but **not** for root-by-root positional parity.

---

# Manual Visual Acceptance

## Meadow

- obvious quiet regions;
- coherent flower pockets;
- broadleaf pockets visible through grass;
- occasional low shrub visibly breaks the canopy;
- green forms dominate overall;
- no rainbow confetti;
- no 16 m tile rhythm;
- no obvious 11 m lattice squares.

## Rock

- fern/broadleaf preference in believable transition areas;
- hard stone clearance preserved;
- no circular plant rings.

## Path

- interrupted flower pockets;
- no continuous border ribbon;
- shrubs absent from hard tread.

## Water edge

- moisture-loving plants increase gradually;
- no abrupt species wall.

## Dry steppe

- seed heads dominate;
- shrubs sparse;
- broadleaf rare;
- flowers sparse/muted;
- negative space preserved.

## Alpine

- low green forms dominate;
- pale flowers restrained;
- shrubs rare;
- no copied meadow composition.

## Close shrub/rosette

- shrub reads as irregular leafy mass, not a circle;
- silhouette holes survive;
- rosette reads as leaves, not petals;
- neither disappears completely inside the ordinary grass canopy;
- no visible defect from current yaw-billboard behavior.

## Medium distance

At 10-25 m:

- colony reads before individual cards;
- flower color reads as local patches;
- accents disappear naturally into grass before the fade.

---

# Manual Performance Acceptance

At identical before/after poses:

```text
normal per-frame distribution CPU        none
detail material count                    unchanged
atlas allocation                         unchanged
instance attribute count                 unchanged
detail draw architecture                 unchanged
reviewed worst-case cards                <= 2,070
reviewed detail draws                    <= 22
reviewed detail vertices                 <= 12,420
```

Expected resident/drawn cards should normally be lower because the new distribution only removes candidates. If a single fixed pose moves slightly because of the one-time RNG migration, review the deterministic workload envelope and multi-pose average rather than weakening architectural gates.

A small detail-tile build-time increase is acceptable only if:

- the existing near build deadline is respected;
- detail remains one tile/frame;
- no visible compact-device spike appears;
- deterministic operation bounds remain satisfied.

Do not add automated millisecond pass/fail gates.

---

# Tuning Order

Tune one dimension at a time.

## 1. Negative space

```text
Quiet threshold
Background suppression
Colony size
```

Target:

```text
quiet cells          20-60%
mean keepMultiplier  0.58-0.82
```

## 2. Colony shape

```text
Colony strength
Clump size
```

Goal: irregular pockets, not smooth circles or procedural speckle.

## 3. Family coherence

```text
Dominant family
```

Goal: recognizable communities with meaningful companion plants.

## 4. Tint coherence

```text
Tint coherence
```

Only then adjust biome tint weights if necessary.

## 5. Ecology/edges

```text
Ecology influence
Edge companions
Stone fringe
Path fringe
```

Goal: environment explains composition without decorative borders.

## 6. Internal hierarchy

```text
Core height bias
Mature phenotype
```

Goal: subtle relationships inside existing species bounds.

## 7. Density last

If visual richness is sufficient, reduce density.

Never exceed 0.35.

---

# Implementation Phases

Each phase should leave the static build green. Do not introduce temporary compatibility logic that is removed in the next phase.

## F0: baseline

No code changes.

Record fixed-pose visual/performance baseline.

## F1: config + deterministic random/tuning infrastructure

Change/add:

- `public/config/world.yaml`;
- `WorldConfig.ts`;
- `WorldConfigSchema.ts`;
- `WorldConfigValidator.ts`;
- `DetailFoliageRandom.ts`;
- `DetailFoliageTuning.ts`.

Pass:

```text
npm run test:config
npm run build
```

No placement/render behavior change yet.

## F2: pure distribution

Add:

- `WorldDetailFoliageDistribution.ts`;
- initial `verify-detail-foliage-distribution.mjs`.

Pass repeatability, continuity, output bounds, negative-space, and master-off tests.

No renderer integration yet.

## F3: species/profile/atlas model

Change together:

- `GrassAccentSpecies.ts`;
- `GrassBiomeProfile.ts`;
- `GrassBiomeProfiles.json`;
- `WorldDetailFoliageAtlasFactory.ts`;
- `verify-flower-variety.mjs`.

This order avoids implementing affinity against species/categories that do not exist yet.

Pass:

- exactly eight species;
- source/resolved profile validation;
- profile entries <= 16;
- analytical bounds unchanged;
- atlas dimensions/settings unchanged;
- shrub/rosette structural tests;
- atlas debug visually readable;
- `npm run build`.

The existing field may temporarily treat the two new categories with its current default category weighting; no temporary compatibility code is required because distribution/affinity is not integrated yet.

## F4: pure affinity/selection

Add:

- `DetailFoliageAffinity.ts`;
- extend `verify-detail-foliage-distribution.mjs`.

Pass:

- ecology-direction tests;
- deterministic weighted picks;
- family correlation;
- tint correlation;
- bounded-scan tests;
- repeated selection digest equality.

No world placement integration yet.

## F5: field integration + RNG separation

Change:

- `WorldDetailFoliageField.ts`.

Remove the old independent `pickSpecies()` / category weighting path rather than keeping two selection systems.

Pass:

- <= 90 candidates/tile;
- exactly two position-random draws/candidate;
- candidate positions independent of composition settings;
- no new instance attributes;
- no extra terrain/hydrology/ecology samples;
- distribution after hard gates only;
- no hot-loop species/tint catalogue lookup;
- workload envelope equal or lower;
- fixed-pose world visuals materially improved;
- `npm run test:grass-performance`;
- `npm run build`.

## F6: diagnostics tuning

Change:

- `WorldNearGrassField.ts`;
- `WorldGrassSystem.ts`;
- `DetailFoliageTuningMenu.ts`;
- `WorldApp.ts`.

Pass:

- diagnostics-only panel;
- `input` does not rebuild;
- `change` applies once;
- equal tuning does not invalidate;
- rebuild remains one tile/frame;
- Reset to YAML works;
- YAML export valid.

Tune in the documented order.

After visual acceptance:

- commit final YAML values;
- freeze both deterministic SHA-256 goldens.

## F7: final gates + shipped-status documentation

Finish:

- `verify-grass-performance.mjs`;
- `verify-config-contracts.mjs`;
- `package.json`;
- short shipped-status pointer in `docs/grass-detail-foliage-plan.md`.

Run:

```text
npm run test:detail-foliage
npm run test:flower-variety
npm run test:config
npm run test:grass-performance
npm run test:grass-placement
npm run build
```

Then run fixed-pose visual/performance comparison on desktop and compact hardware.

No GitHub Actions. Deploy manually only after acceptance.

---

# Definition of Done

```text
[ ] visible colonies replace uniform sprinkle
[ ] meaningful quiet grass regions exist
[ ] local flower tint is coherent
[ ] low shrub visibly breaks the grass canopy as a small anchor
[ ] broadleaf rosette reads as a low/wide plant
[ ] ecology explains local family distribution
[ ] hard path/stone clearances unchanged
[ ] no visible 16 m tile rhythm
[ ] no obvious macro lattice squares

[ ] species count exactly 8
[ ] atlas remains 1024 x 256
[ ] variant rows remain 2
[ ] maximum height multiplier <= 1.72
[ ] maximum width multiplier <= 1.314
[ ] material count unchanged
[ ] draw-call architecture unchanged
[ ] no detail shadows
[ ] no new instance attribute
[ ] render radius unchanged

[ ] production density <= 0.35/m²
[ ] candidates <= 90/tile
[ ] only two continuous noise fields
[ ] eight lattice hashes/sample
[ ] one candidate identity hash
[ ] position RNG consumes exactly two draws/candidate
[ ] appearance/acceptance do not consume position RNG
[ ] candidate positions stable across composition tuning
[ ] distribution sampler allocates nothing
[ ] affinity selection allocates nothing
[ ] no new terrain/hydrology/ecology samples
[ ] composition runs only during tile build
[ ] height correlation stays within declared species bands
[ ] colonyStrength=0 disables all new spatial correlation

[ ] source/resolved biome profile split implemented
[ ] speciesIndex/tintRow pre-resolved
[ ] accent profile entries <= 16
[ ] candidate loop has no species/tint catalogue lookup

[ ] repeatability tests pass before goldens are frozen
[ ] distribution golden passes after visual acceptance
[ ] selection golden passes after visual acceptance
[ ] tile continuity passes
[ ] negative-space gates pass
[ ] family correlation passes
[ ] tint correlation passes
[ ] master off-switch test passes
[ ] ecology direction passes
[ ] tuning normalization passes
[ ] RNG separation test passes
[ ] config rejection tests pass
[ ] plant structural verifier passes
[ ] grass performance verifier passes
[ ] full npm build passes

[ ] fixed-pose visuals materially better than baseline
[ ] workload remains inside reviewed card/draw/vertex ceilings
[ ] compact-device profiling shows no meaningful regression
```

---

# Final Priority

Implement in this order:

```text
1  baseline
2  deterministic random/tuning infrastructure
3  continuous colony/negative-space field
4  species/profile/atlas model
5  ecology + dominant-family/tint selection
6  field integration with stable candidate positions
7  diagnostics tuning
8  density reduction only if visually safe
9  freeze deterministic goldens after visual acceptance
```

The intended result is:

> Fewer unrelated decorations. Larger quiet spaces. Small coherent plant communities that look authored while costing the same or less to render.
