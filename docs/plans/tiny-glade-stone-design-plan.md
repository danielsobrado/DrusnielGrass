# Tiny Glade-Inspired Stone Design, Distribution, and Performance Plan

## Status

- Target branch: `main`
- Status: **implementation-ready after final review**
- Scope: stone distribution, composition, variety, grounding, weathering, tuning, deterministic verification, and performance protection
- Renderer: preserve the current renderer, batching, materials, LOD radii, and packed vertex layout unless an existing verifier proves a defect
- Runtime dependencies: **no new dependencies**
- Tool UI: use the repository's existing native DOM tuning pattern; do not add `lil-gui`/`dat.gui`
- Deployment: manual GitHub Pages deployment; no GitHub Actions
- Principles: KISS, SOLID, deterministic, bounded, cacheable, YAML-driven, no per-frame procedural generation

## Objective

Move the procedural stone system toward a cozy, authored, miniature-diorama look similar to Tiny Glade while keeping the PoC at the same or lower rendering cost.

The current system already has the expensive pieces needed for a good result:

- six procedural archetypes: `pebble`, `boulder`, `slab`, `block`, `shard`, `outcrop`;
- deterministic variants;
- detailed/coarse geometry;
- shape-quality scoring;
- biome palettes;
- terrain embedding and grass clearance;
- split masses;
- moss and lichen;
- deterministic caches;
- frame-budgeted batched rendering.

The main weakness is **composition**, not mesh complexity.

The target hierarchy is:

```text
geological potential
    -> macro formation
        -> process
            -> anchor/source
            -> secondary family
            -> debris
```

The visual improvement must come mainly from:

1. stronger negative space;
2. small authored-looking formations;
3. clear size hierarchy;
4. family resemblance;
5. agreement with macro landform/ecology;
6. better grounding;
7. correlated weathering;
8. restrained silhouettes.

Do not solve this by increasing stone count, polygon count, render distance, shader cost, textures, materials, or LOD complexity.

---

# Final Review Corrections

These corrections override earlier drafts of this plan.

## 1. Landform gradient semantics must be made explicit

`TerrainLandformField` currently computes the mathematical height gradient: it points toward **increasing elevation**. `WorldEcologyField` already reconstructs the surface normal with `-gradientX/-gradientZ`, which confirms that interpretation.

The interface comment currently calls it a downhill gradient. Fix that comment during implementation so future code cannot accidentally reverse scree/fan direction.

Use:

```text
uphillGradient = (landform.gradientX, landform.gradientZ)
downhill = -normalize(uphillGradient)
```

Do not alter the actual landform math.

## 2. Do not sample macro landform twice

`TerrainField.resolveEcology()` currently samples landform internally. The cluster generator also needs the same landform sample for process classification and direction.

Add a narrow overload/helper to `TerrainField`:

```ts
resolveEcologyFromLandform(
  height,
  landform,
  hydrology,
  pathDistances,
  target,
)
```

`resolveEcology()` should delegate to it after performing its existing `sampleLandform()` call.

`StoneClusterField` must:

```text
sample landform once
sample hydrology once
sample path distances once
resolve ecology from that already-sampled landform
```

This keeps macro sampling internally consistent and avoids duplicate bilinear landform lookup.

## 3. Fixed 3x3 lookup now has an explicit geometric invariant

The plan relies on querying exactly nine macro descriptors for each stone cell. This must be guaranteed for every valid YAML configuration, not only for the shipped values.

Define:

```text
C = stoneCellSize
S = stoneClusterSpacing
J = stoneClusterCenterJitter
R = stoneClusterRadiusMax * stoneClusterHaloRatio
```

Required invariants:

```text
R <= 0.5 * S

0.5 * C + R + J * S < 1.5 * S
```

The second inequality proves that a formation whose macro index differs by two on one axis cannot reach the queried stone cell even after maximum center jitter.

The validator must enforce both.

The tuning menu must clamp values so both remain true.

## 4. Randomness is isolated by semantic label, not consumption order

The existing `StoneRandom` supports labeled forks specifically so unrelated future random decisions do not shift existing results.

Therefore every semantic choice gets its own fork.

Good:

```text
memberRoot.fork("family").next()
memberRoot.fork("radius").next()
memberRoot.fork("angle-jitter").signed(...)
memberRoot.fork("scale").range(...)
memberRoot.fork("yaw").signed(...)
memberRoot.fork("variant").integer(...)
memberRoot.fork("moss").range(...)
```

Avoid:

```text
memberRoot.next()
memberRoot.next()
memberRoot.next()
```

for unrelated decisions.

Use predeclared member labels for indices `0..11` so the maximum configured budget does not allocate template strings repeatedly during cluster resolution.

## 5. Deterministic test domain stays inside the current world

The current production world is 2,048 m wide. A `-18..18` macro domain at 56 m spacing reaches outside the world.

Use:

```text
gx = -12 .. 12
gz = -12 .. 12
```

This gives `25 * 25 = 625` macro cells:

- comfortably inside the current world;
- larger than the 512-entry raw/descriptor caches;
- enough to exercise cache eviction;
- large enough to cover multiple biome/landform regions.

Add separate explicit world-edge tests instead of making the main determinism domain cross the world boundary.

## 6. Existing shader-performance verifier must actually run

`StoneShaderPerformanceVerification.ts` exists, but the current `scripts/verify-stones.mjs` does not load it directly.

When modifying `verify-stones.mjs`, include it together with the new cluster verifiers so the coarse shader cannot silently regress while this work is underway.

---

# Non-Negotiable Performance Contract

These are implementation constraints, not art suggestions.

```text
new normal-frame cluster work                     0
macro descriptors considered per stone cell       <= 9
raw conflict neighbors considered per descriptor  <= 8
candidate members per formation                   <= stoneClusterBudgetMax
shipped default candidate members                 <= 8
overlap correction moves per member               <= 1
unbounded rejection loops                         0
Poisson-disc / relaxation iterations              0
physics-based placement                           0
new textures                                      0
new materials                                     0
new draw calls                                    0
new stone LODs                                    0
stone render-radius changes                       0
```

`WorldStoneSystem.update()` must not gain:

- procedural noise sampling;
- process classification;
- cluster simulation;
- ecology sampling;
- per-frame cluster maintenance.

Cluster generation occurs only while deterministic stone content is collected/built and is then cached.

Existing renderer contracts remain authoritative:

```text
desktop production stone draws: 49
detailed desktop draws:          9
coarse desktop draws:            40
compact maximum batches:         16
```

Existing manual build reserves remain:

```text
desktop stone build reserve: 2.00 ms
compact stone build reserve: 1.25 ms
```

Milliseconds are manual hardware acceptance metrics, not deterministic automated gates.

---

# Exact Files to Add

## `src/world/stones/StoneClusterTypes.ts`

Types only.

Define:

```text
StoneClusterProcess = compact | ridge | scree | fan
StoneClusterRole = anchor | secondary | debris
StoneClusterCandidate
StoneClusterDescriptor
StoneClusterMemberSpec
StoneResolvedMember
StoneResolvedCluster
```

No Three.js renderer state. No algorithms.

## `src/world/stones/StoneClusterTuning.ts`

Algorithm constants and static tables only.

Put here:

- hash domains;
- process thresholds;
- family relationship tables;
- biome/process multipliers;
- orientation spreads;
- conflict constants;
- overlap constants;
- cache limits;
- cache trim ratio;
- golden angle;
- member labels;
- numerical epsilons.

Recommended constants:

```text
RIDGE_CONVEXITY_MIN = 0.25
FAN_CONVEXITY_MAX = -0.25
FAN_SLOPE_MIN = 0.08
CLUSTER_MIN_SPACING_RATIO = 0.68
CLUSTER_INFLUENCE_SEPARATION_RATIO = 0.88
CLUSTER_PRIORITY_RANDOM_SHARE = 0.18
GOLDEN_ANGLE = 2.399963229728653
RAW_CANDIDATE_CACHE_LIMIT = 512
DESCRIPTOR_CACHE_LIMIT = 512
RESOLVED_CLUSTER_CACHE_LIMIT = 256
CACHE_TRIM_RATIO = 0.60
QUERY_EPSILON = 1e-6
```

Keep production art knobs in YAML, not this file.

## `src/world/stones/StoneClusterField.ts`

Own macro geology and final descriptor generation.

Responsibilities:

1. macro lattice;
2. deterministic center jitter;
3. geological potential;
4. one shared environment sample per uncached candidate;
5. biome sample;
6. suitability;
7. raw activation;
8. process classification;
9. strike/downhill direction;
10. radius/aspect/budget;
11. cluster palette/value/moss DNA;
12. deterministic conflict suppression;
13. bounded raw and final descriptor caches;
14. pure neighbor enumeration helpers used by production and verification.

Must not import renderer/material/batch classes.

## `src/world/stones/StoneClusterComposition.ts`

Pure formation composition.

Input:

```text
StoneClusterDescriptor
```

Output:

```text
readonly StoneClusterMemberSpec[]
```

Responsibilities:

- roles;
- compact/ridge/scree/fan local coordinates;
- family-aware archetype selection;
- scale hierarchy;
- variant non-repetition;
- yaw hierarchy;
- member color/moss variation;
- split-secondary slot ownership.

It must not sample terrain, paths, scene state, materials, or WebGL.

## `src/world/stones/StoneClusterVerification.ts`

Deterministic correctness tests.

## `src/world/stones/StoneClusterPerformanceVerification.ts`

Deterministic generation-cost contracts only.

No wall-clock assertions.

## `scripts/capture-stone-performance-baseline.mjs`

Manual deterministic pre-change baseline capture.

## `qa/stones/stone-performance-baseline.json`

Captured from current pre-cluster `main` before placement behavior changes.

## `qa/stones/stone-cluster-golden.json`

Create only after final tuning is accepted.

Store final shipped layout digests for regression protection:

```json
{
  "descriptorDigest": "00000000",
  "resolvedRootDigest": "00000000",
  "activeClusters": 0,
  "resolvedRoots": 0
}
```

Values above are schema examples only. Generate real values from the accepted implementation.

## `tools/stone-world/StoneClusterTuningMenu.ts`

Development-only native DOM tuner.

## `tools/stone-world/StoneWorldProbeController.ts`

Stone probe lifecycle/rebuild controller.

## `tools/stone-world/stone-world.css`

Stone probe/tuner styles.

---

# Exact Files to Modify

## `src/world/ecology/TerrainLandformField.ts`

Comment-only semantic correction:

```text
old meaning: downhill gradient
correct meaning: height gradient toward increasing elevation
```

Do not change the math.

## `src/world/TerrainField.ts`

Add:

```ts
resolveEcologyFromLandform(
  height,
  landform,
  hydrology,
  pathDistances,
  target,
)
```

Existing `resolveEcology()` becomes:

```text
sampleLandform(...)
-> resolveEcologyFromLandform(...)
```

This preserves every existing caller while allowing `StoneClusterField` to reuse its macro landform sample.

## `src/world/stones/StoneField.ts`

Keep as orchestration and final physical validation.

Add ownership of:

```text
StoneClusterField
StoneClusterComposition
resolved-cluster cache
```

Ordinary geological placement becomes:

```text
get stone cell
-> enumerate exactly 3x3 macro coordinates
-> get final descriptors
-> reject inactive
-> descriptor/cell broad phase
-> resolve/cache complete formation only after broad-phase hit
-> filter resolved geological roots by final stone-cell ownership
-> if no active halo intersects the cell, evaluate singleton once
-> add existing path-verge source-cell stones
```

Keep final validation here:

- world bounds;
- actual terrain height;
- actual local terrain normal;
- `SLOPE_REJECT_NY`;
- footprint-aware path clearance;
- footprint overlap;
- one-pass overlap correction;
- sink;
- grass clearance;
- granite blend;
- tilt;
- final `StoneInstance`.

Remove after migration:

```text
FIELD_STONE_CHANCE
ordinary expected-count stones-per-cell placement
generic parent satellites
recursive near-path satellite spawning
StoneField-owned macro rockiness field ownership
StoneField-owned macro strike ownership
```

Keep `addVergeStones()` as the only path-verge mechanism.

### Stone-cell ownership rule

Geological cluster roots must be canonicalized to the cell containing their **final corrected root**:

```text
ownerCellX = floor(finalX / stoneCellSize)
ownerCellZ = floor(finalZ / stoneCellSize)
```

A geological root appears only when those coordinates match the requested cell.

The existing chunk source-cell margin may remain for path-verge source cells because verge candidates can cross their source-cell edge. Do not reintroduce a source-cell margin requirement for geological cluster roots.

## `src/world/WorldConfig.ts`

Add all new production tuning fields as required numbers.

## `src/world/WorldConfigSchema.ts`

Add primitive range/integer rules exactly as specified below.

## `src/world/WorldConfigValidator.ts`

Add all relational constraints, including the fixed-3x3 proof inequality.

## `public/config/world.yaml`

Add shipped production values.

## `scripts/verify-stones.mjs`

Load and run:

```text
StoneClusterVerification.ts
StoneClusterPerformanceVerification.ts
StoneShaderPerformanceVerification.ts
```

alongside the existing stone verification modules.

Keep `npm run test:stones` as the single normal local stone gate.

## `package.json`

Add only:

```json
"capture:stone-baseline": "node scripts/capture-stone-performance-baseline.mjs"
```

No GUI dependency. No GitHub Actions.

## `tools/stone-world/main.ts`

Refactor to orchestration only.

## `stone-world.html`

Move inline style to the new CSS file.

## `tsconfig.stone-tools.json`

Leave unchanged unless TypeScript proves imported tool files are not followed transitively.

If needed, use:

```json
"tools/stone-world/**/*.ts"
```

Do not change it pre-emptively.

## Optional later: `src/world/stones/StoneShapeQuality.ts`

Only after distribution is accepted.

## Optional later: `src/world/stones/StoneRecipe.ts`

Only after before/after gallery captures justify shape changes.

## Do not modify unless an existing verifier fails

```text
src/world/stones/WorldStoneSystem.ts
src/world/stones/StoneRenderBatchBuilder.ts
src/world/stones/StoneRenderPacking.ts
src/world/stones/StoneRenderInstanceWriter.ts
src/world/stones/StoneGrowthShader.ts
src/world/stones/StoneGrowthField.ts
```

---

# Production YAML

Add under the existing procedural-stones section:

```yaml
# Procedural stones.
stonesEnabled: 1
stoneCellSize: 16

# Formation activation. Density adds/removes complete geological formations;
# it does not independently thin every stone inside a formation.
stoneDensity: 0.17
stoneClusterChance: 0.82
stoneSingletonChance: 0.10

# Macro formation lattice.
stoneClusterSpacing: 56
stoneClusterCenterJitter: 0.26

# Formation footprint.
stoneClusterRadiusMin: 10
stoneClusterRadiusMax: 22
stoneClusterAspectMin: 0.58
stoneClusterAspectMax: 0.92

# Formation composition.
stoneClusterBudgetMin: 4
stoneClusterBudgetMax: 8
stoneClusterCoreRatio: 0.42
stoneClusterShoulderRatio: 0.78
stoneClusterHaloRatio: 1.12
stoneClusterDensityResponse: 6

# Existing variety/render controls remain authoritative.
stoneVariantsPerArchetype: 10
stoneGrassClearanceFeather: 0.4
stoneRadiusDesktop: 6
stoneRadiusCompact: 3
stoneDetailRadius: 2
stoneDetailRadiusCompact: 1
stoneRenderBatchChunksPerAxis: 2
stoneChunksPerFrame: 1
stoneVergeChance: 0.62
stoneGrainStrength: 0
```

New semantics:

```text
stoneDensity
    controls macro activation response

stoneClusterChance
    global multiplier on eligible formation activation

stoneSingletonChance
    rare isolated-stone probability only outside active formation halos
```

`stoneClusterChance` no longer means parent-satellite spawning.

## Primitive schema ranges

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

## Cross-field validation

Require:

```text
stoneClusterRadiusMin < stoneClusterRadiusMax
stoneClusterAspectMin <= stoneClusterAspectMax
stoneClusterBudgetMin <= stoneClusterBudgetMax
stoneClusterCoreRatio < stoneClusterShoulderRatio
stoneClusterShoulderRatio < stoneClusterHaloRatio
```

Negative-space / conflict bound:

```text
stoneClusterRadiusMax * stoneClusterHaloRatio
  <= stoneClusterSpacing * 0.5
```

Fixed 3x3 query bound:

```text
stoneCellSize * 0.5
+ stoneClusterRadiusMax * stoneClusterHaloRatio
+ stoneClusterCenterJitter * stoneClusterSpacing
< stoneClusterSpacing * 1.5
```

Use a tiny numerical epsilon in code so a floating-point edge cannot make the proof equality ambiguous.

---

# Stable Random Stream Contract

## Cluster seed

```text
seed = hashStoneCell(
  gridX,
  gridZ,
  config.seed XOR STONE_CLUSTER_DOMAIN
)
clusterRoot = StoneRandom.fromSeed(seed)
```

Every cluster-level semantic decision uses a named fork:

```text
center-x
center-z
activation
priority
strike
radius
aspect
budget
value-base
moss-bias
mossy-palette
composition-phase
```

## Member root

Predeclare:

```text
member:0
member:1
...
member:11
```

Then:

```text
memberRoot = clusterRoot.fork(MEMBER_LABELS[index])
```

Every unrelated member decision forks again:

```text
family
radius
angle-jitter
lateral
jitter-u
jitter-v
scale
scale-jitter
variant
yaw
value
moss
split
split-angle
split-gap
```

One future visual feature must not shift unrelated existing decisions.

---

# Data Contracts

## `StoneClusterCandidate`

Readonly-by-contract fields:

```text
gridX
gridZ
seed
centerX
centerZ
height
geologyPotential
moisture
fertility
exposure
disturbance
surfaceRockiness
landformSlope
landformConvexity
landformGradientX
landformGradientZ
suitability
rawActive
priority
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
mossBase
mossBias
```

Do not runtime-`Object.freeze()` every candidate; TypeScript readonly ownership is enough in this build-time hot path.

## `StoneClusterDescriptor`

Candidate data plus:

```text
active
```

## `StoneClusterMemberSpec`

```text
index
role
archetype
variantIndex
u
v
rotationY
scale
valueScale
environmentMoss
splitOwner
```

`u/v` are normalized process-local coordinates. They are not terrain coordinates.

## `StoneResolvedMember`

Final corrected physical intent before `StoneInstance` conversion:

```text
memberIndex
x
z
height
normal
footprint
sink
clearRadius
memberSpec
```

Keep it internal to `StoneField`/verification.

---

# Exact Algorithm 1 — Stone Cell to Macro 3x3

For requested stone cell `(cellX, cellZ)`:

```text
C = stoneCellSize
S = stoneClusterSpacing

cellCenterX = (cellX + 0.5) * C
cellCenterZ = (cellZ + 0.5) * C

macroX = floor(cellCenterX / S)
macroZ = floor(cellCenterZ / S)
```

Enumerate exactly:

```text
for dz = -1 .. 1
  for dx = -1 .. 1
    (macroX + dx, macroZ + dz)
```

Use one pure helper shared with verification.

Do not dynamically grow the search radius in normal operation. Invalid YAML must be rejected by the validator instead.

---

# Exact Algorithm 2 — Jittered Macro Center

```text
J = stoneClusterCenterJitter

centerX = (
  gridX + 0.5 + clusterRoot.fork("center-x").signed(J)
) * S

centerZ = (
  gridZ + 0.5 + clusterRoot.fork("center-z").signed(J)
) * S
```

Shipped maximum center movement:

```text
56 * 0.26 = 14.56 m per axis
```

---

# Exact Algorithm 3 — Geological Potential

Move the current low-frequency stone field into `StoneClusterField` without changing its first implementation:

```text
coarse = valueNoise(x / 240, z / 240, rockSeed)

fine = valueNoise(
  (x * 2.7) / 240,
  (z * 2.7) / 240,
  rockSeed XOR 0x9e3779b9
)

field = (coarse + fine * 0.4) / 1.4
geologyPotential = smoothstep(field, 0.52, 0.78)
```

Meaning:

```text
geologyPotential = plausible rocky substrate
```

It is not surface exposure. Surface exposure belongs to ecology.

---

# Exact Algorithm 4 — Shared Environment Sample

Each uncached macro candidate uses reusable scratch objects:

```text
height = field.sampleHeight(centerX, centerZ)
landform = field.sampleLandform(centerX, centerZ, landformScratch)
hydrology = field.sampleHydrology(centerX, centerZ, height, hydrologyScratch)
pathDistances = field.samplePathDistances(centerX, centerZ, pathScratch)

ecology = field.resolveEcologyFromLandform(
  height,
  landform,
  hydrology,
  pathDistances,
  ecologyScratch
)

biomeSample = sampleGrassBiome(centerX, centerZ, biomeScratch)
biomeIndex = pickGrassBiomeIndex(centerX, centerZ, biomeSample)
```

Copy numeric values into candidate data immediately.

Do not create a stone-specific second model of moisture, slope, soil, or disturbance.

---

# Exact Algorithm 5 — Suitability

```text
surfaceVisibility = 0.18 + 0.82 * ecology.rockiness
pathSurvival = 1 - 0.90 * ecology.disturbance

suitability = clamp01(
  geologyPotential
  * surfaceVisibility
  * pathSurvival
)
```

The `0.18` floor deliberately keeps occasional partly buried meadow formations.

---

# Exact Algorithm 6 — Raw Activation

```text
densityResponse =
  1 - exp(-stoneClusterDensityResponse * stoneDensity)

suitabilityResponse =
  smoothstep(suitability, 0.14, 0.72)

activationProbability = clamp01(
  stoneClusterChance
  * densityResponse
  * suitabilityResponse
)

rawActive = clusterRoot
  .fork("activation")
  .chance(activationProbability)
```

No retry and no replacement formation.

---

# Exact Algorithm 7 — Process Classification

Use the already-sampled macro landform.

Reuse `ECOLOGY_ROCK_SLOPE_START` for scree.

Classification order:

```text
if landform.slope >= ECOLOGY_ROCK_SLOPE_START:
    process = scree
else if landform.convexity >= RIDGE_CONVEXITY_MIN:
    process = ridge
else if landform.convexity <= FAN_CONVEXITY_MAX
     and landform.slope >= FAN_SLOPE_MIN:
    process = fan
else:
    process = compact
```

Order matters. A steep convex shoulder is scree first.

---

# Exact Algorithm 8 — Strike and Downhill Direction

Strike remains a `PI`-periodic geological axis:

```text
strike = valueNoise(
  centerX / 130,
  centerZ / 130,
  rockSeed XOR 0x5bd1e995
) * PI
```

Macro landform gradient is uphill:

```text
gradientLength = hypot(
  landform.gradientX,
  landform.gradientZ
)

if gradientLength >= 0.02:
  downhillAngle = atan2(
    -landform.gradientZ,
    -landform.gradientX
  )
else:
  downhillAngle = strike
```

Final formation axis/direction:

```text
compact = strike
        + clusterRoot.fork("direction").signed(0.35)

ridge = strike
scree = downhillAngle
fan = downhillAngle
```

Do not call `sampleNormal()` for macro direction.

---

# Exact Algorithm 9 — Radius, Aspect, Budget

## Radius

```text
radiusT = smoothstep(suitability, 0.20, 0.85)
baseRadius = lerp(
  stoneClusterRadiusMin,
  stoneClusterRadiusMax,
  radiusT
)

majorRadius = clamp(
  baseRadius
    * clusterRoot.fork("radius").range(0.90, 1.10),
  stoneClusterRadiusMin,
  stoneClusterRadiusMax
)
```

## Aspect

```text
aspect = clusterRoot.fork("aspect").range(
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
influenceRadius = majorRadius * stoneClusterHaloRatio
```

## Budget

```text
budgetT = smoothstep(suitability, 0.25, 0.80)

budget = round(
  lerp(
    stoneClusterBudgetMin,
    stoneClusterBudgetMax,
    budgetT
  )
)

budget = clamp(
  budget,
  stoneClusterBudgetMin,
  stoneClusterBudgetMax
)
```

Do not retry rejected terrain/path members to refill the budget.

---

# Exact Algorithm 10 — Deterministic Conflict Suppression

Purpose: stop neighboring jittered formations from collapsing into one rock carpet.

Priority:

```text
priorityRandom = clusterRoot.fork("priority").next()

priority =
  suitability * (1 - CLUSTER_PRIORITY_RANDOM_SHARE)
  + priorityRandom * CLUSTER_PRIORITY_RANDOM_SHARE
```

For a raw-active candidate inspect exactly the eight adjacent macro cells.

For each raw-active neighbor:

```text
distance = hypot(
  centerX - neighbor.centerX,
  centerZ - neighbor.centerZ
)

minimumSeparation = max(
  S * CLUSTER_MIN_SPACING_RATIO,
  (influenceRadius + neighbor.influenceRadius)
    * CLUSTER_INFLUENCE_SEPARATION_RATIO
)
```

No conflict when:

```text
distance >= minimumSeparation
```

On conflict, candidate wins only when:

```text
priority > neighbor.priority
```

Tie-break exactly:

```text
lower gridX wins
then lower gridZ wins
```

Call graph:

```text
getDescriptor(self)
    -> getRawCandidate(self)
    -> getRawCandidate(8 neighbors)
    -> resolve conflict
```

`getRawCandidate()` must never call `getDescriptor()`.

### Why eight neighbors are sufficient

With valid configuration:

```text
influenceRadius <= 0.5S
J <= 0.35
```

Two macro cells separated by two indices on one axis have minimum possible center separation:

```text
2S - 2JS
>= 1.30S
```

Maximum influence-derived conflict threshold is:

```text
(0.5S + 0.5S) * 0.88
= 0.88S
```

Therefore a two-away macro cell cannot conflict.

Add a deterministic verifier for this bound rather than relying only on the explanation.

---

# Exact Algorithm 11 — Descriptor/Stone-Cell Broad Phase

For stone-cell AABB:

```text
[minX,maxX] x [minZ,maxZ]
```

Compute:

```text
dx = max(minX - centerX, 0, centerX - maxX)
dz = max(minZ - centerZ, 0, centerZ - maxZ)
```

Reject descriptor when:

```text
dx*dx + dz*dz
  > influenceRadius*influenceRadius
```

Order is mandatory:

```text
lookup descriptor
-> inactive? skip
-> broad-phase miss? skip
-> only now resolve/cache members
```

Do not resolve member arrays for broad-phase misses.

---

# Exact Algorithm 12 — Roles

```text
anchorCount = 1

secondaryCount = clamp(
  floor((budget - 1) * 0.35),
  1,
  2
)

debrisCount =
  budget - anchorCount - secondaryCount
```

Examples:

```text
budget 4 -> 1 anchor + 1 secondary + 2 debris
budget 6 -> 1 anchor + 1 secondary + 4 debris
budget 8 -> 1 anchor + 2 secondary + 5 debris
```

Member `0` is always the anchor.

---

# Exact Algorithm 13 — Local Coordinates

```text
core = stoneClusterCoreRatio
shoulder = stoneClusterShoulderRatio
halo = stoneClusterHaloRatio
```

World transform:

```text
dirX = cos(direction)
dirZ = sin(direction)
perpX = -dirZ
perpZ = dirX

worldX = centerX
       + dirX * (u * majorRadius)
       + perpX * (v * minorRadius)

worldZ = centerZ
       + dirZ * (u * majorRadius)
       + perpZ * (v * minorRadius)
```

## Anchor

Compact/ridge:

```text
u = memberRoot.fork("anchor-u").signed(0.06)
v = memberRoot.fork("anchor-v").signed(0.06)
```

Scree/fan source is slightly upslope because positive `u` is downhill:

```text
u = -0.16
  + memberRoot.fork("anchor-u").signed(0.04)

v = memberRoot.fork("anchor-v").signed(0.05)
```

## Secondary radial band

```text
r = lerp(
  core * 0.55,
  shoulder * 0.92,
  memberRoot.fork("radius").next()
)
```

## Debris radial band

```text
t = sqrt(memberRoot.fork("radius").next())
r = lerp(core, halo, t)
```

Square-root radial sampling distributes debris over area rather than piling everything near the center.

---

# Exact Algorithm 14 — Process Composition

Resolve once per cluster:

```text
phase = clusterRoot
  .fork("composition-phase")
  .range(0, 2*PI)
```

## Compact

```text
angle = phase
      + memberIndex * GOLDEN_ANGLE
      + memberRoot
          .fork("angle-jitter")
          .signed(0.28)

u = cos(angle) * r
v = sin(angle) * r
```

This gives irregular arcs/triangles without relaxation.

## Ridge

```text
side = memberIndex % 2 == 0 ? 1 : -1
u = side * r
```

Secondary:

```text
v = memberRoot.fork("lateral").signed(0.18 * r)
```

Debris:

```text
v = memberRoot.fork("lateral").signed(0.34 * r)
```

## Scree

Positive `u` is downhill.

Secondary:

```text
u = r
v = memberRoot.fork("lateral").signed(
  r * lerp(0.16, 0.30, r / halo)
)
```

Debris:

```text
u = r
v = memberRoot.fork("lateral").signed(
  r * lerp(0.22, 0.48, r / halo)
)
```

## Fan

Secondary:

```text
u = r
v = memberRoot.fork("lateral").signed(
  r * lerp(0.24, 0.46, r / halo)
)
```

Debris:

```text
u = r
v = memberRoot.fork("lateral").signed(
  r * lerp(0.32, 0.68, r / halo)
)
```

## Final local breakup

```text
u += memberRoot.fork("jitter-u").signed(0.035)
v += memberRoot.fork("jitter-v").signed(0.035)
```

Do not add another world-noise sample per member.

---

# Archetype Family Rules

Keep all six archetypes.

The world should get variety from context and composition, not from adding more shape families.

Anchor weight order:

```text
pebble, boulder, slab, block, shard, outcrop
```

## Biome multipliers for anchors

```text
meadow: 0.0, 1.20, 1.15, 0.65, 0.15, 0.75
steppe: 0.0, 1.00, 1.15, 1.05, 0.75, 0.95
alpine: 0.0, 0.85, 1.00, 1.10, 1.20, 1.25
```

Start from the current `LEVEL_WEIGHTS` or `SLOPE_WEIGHTS` as appropriate, multiply, then use the existing weighted-pick approach.

## Process multipliers

```text
compact:
  unchanged

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

## Secondary family table

| Anchor | Secondary weights |
|---|---|
| `boulder` | boulder 0.55, slab 0.20, block 0.15, shard 0.10 |
| `slab` | slab 0.50, block 0.20, boulder 0.20, shard 0.10 |
| `block` | block 0.50, shard 0.20, boulder 0.20, slab 0.10 |
| `outcrop` | block 0.35, shard 0.30, slab 0.20, boulder 0.15 |
| `shard` | shard 0.50, block 0.25, boulder 0.15, slab 0.10 |

Apply biome multipliers before final pick.

## Debris family table

| Anchor | Debris weights |
|---|---|
| `boulder` | pebble 0.70, boulder 0.30 |
| `slab` | pebble 0.55, slab 0.25, shard 0.20 |
| `block` | pebble 0.45, block 0.30, shard 0.25 |
| `outcrop` | pebble 0.35, shard 0.35, block 0.30 |
| `shard` | pebble 0.45, shard 0.55 |

Family selection uses:

```text
memberRoot.fork("family")
```

not the same stream as scale/yaw/variant.

---

# Scale Hierarchy

Keep the current archetype scale bands as the base source.

## Anchor

For `[minScale,maxScale]`:

```text
anchorScale = lerp(
  minScale,
  maxScale,
  memberRoot.fork("scale").range(0.62, 0.92)
)
```

Rare landmark boulder only when:

```text
role == anchor
archetype == boulder
suitability >= 0.70
memberRoot.fork("landmark").chance(0.06)
```

Keep current multiplier:

```text
1.7 .. 2.4
```

Never apply landmark scaling to secondary/debris members.

## Secondary

```text
normalizedRadius = min(1, r / halo)
radialScale = lerp(0.70, 0.46, normalizedRadius)

desired = anchorScale
        * radialScale
        * memberRoot.fork("scale-jitter").range(0.90, 1.08)

secondaryScale = clamp(
  desired,
  max(0.30, selectedBandMin * 0.45),
  selectedBandMax * 0.82
)
```

## Debris

```text
normalizedRadius = min(1, r / halo)
radialScale = lerp(0.36, 0.16, normalizedRadius)

desired = anchorScale
        * radialScale
        * memberRoot.fork("scale-jitter").range(0.85, 1.15)

debrisScale = clamp(
  desired,
  0.22,
  selectedBandMax * 0.55
)
```

---

# Variant Non-Repetition

For each archetype inside one formation maintain a tiny used-index list.

```text
start = memberRoot
  .fork("variant")
  .integer(0, variantCount - 1)
```

Then bounded linear probe:

```text
for attempt = 0 .. variantCount - 1:
  index = (start + attempt) % variantCount
  if index unused for this archetype:
    choose index
    mark used
    stop
```

If all are used, use `start`.

No random retry loop.

With shipped `10` variants and max default `8` members, normal formations should not repeat the same variant inside one archetype family.

---

# Orientation Hierarchy

Role spread:

```text
anchor    0.00
secondary 0.10
debris    0.28
```

Archetype yaw:

```text
outcrop:
  strike + signed(0.18 + roleSpread)

slab:
  strike + signed(0.22 + roleSpread)

block:
  strike + signed(0.28 + roleSpread)

boulder:
  axisLerp(strike, direction, 0.35)
  + signed(0.42 + roleSpread)

shard:
  direction + signed(0.38 + roleSpread)

pebble:
  random angle in [0, PI)
```

All non-pebble yaw randomness uses:

```text
memberRoot.fork("yaw")
```

Implement `axisLerp()` with `PI` periodicity so the shortest geological-axis path is used.

---

# Cluster Color and Weathering DNA

Resolve once per formation:

```text
valueBase = clusterRoot
  .fork("value-base")
  .range(0.97, 1.03)

mossBias = clusterRoot
  .fork("moss-bias")
  .range(0.90, 1.10)
```

Base palette comes from the selected cluster-center biome.

Meadow-only mossy palette chance:

```text
mossyChance = clamp01(
  0.10
  + ecology.moisture * 0.22
  - ecology.exposure * 0.08
)
```

Only when:

```text
basePalette == meadowSage
ecology.moisture >= 0.42
```

and:

```text
clusterRoot
  .fork("mossy-palette")
  .chance(mossyChance)
```

then choose `mossy` for the complete family.

Per-member value:

```text
valueScale = clamp(
  valueBase
    + memberRoot.fork("value").signed(0.015),
  0.92,
  1.06
)
```

## Environment moss

Use cluster-center ecology as shared microclimate.

```text
altitudeFade =
  smoothstep(
    height,
    grassMinAltitude - 4,
    grassMinAltitude + 10
  )
  *
  (1 - smoothstep(
    height,
    grassMaxAltitude - 45,
    grassMaxAltitude + 5
  ))

moisture = smoothstep(ecology.moisture, 0.16, 0.72)
shadeRetention = lerp(1.12, 0.78, ecology.exposure)
drainage = lerp(1.00, 0.72, ecology.rockiness)

mossBase = clamp01(
  moisture
  * shadeRetention
  * drainage
  * altitudeFade
)

environmentMoss = clamp01(
  mossBase
  * mossBias
  * memberRoot.fork("moss").range(0.95, 1.05)
)
```

Keep `StoneGrowthField` and `StoneGrowthShader` unchanged. They still handle face susceptibility, exposure, lichen competition, and close-range colony breakup.

---

# Final Terrain Validation

`StoneClusterComposition` generates intent. `StoneField` decides whether each member physically survives.

Resolve members in index order.

For every member:

1. transform `(u,v)` to world `(x,z)`;
2. reject outside world margin;
3. sample actual terrain height;
4. sample actual 1.5 m local normal;
5. preserve `SLOPE_REJECT_NY`;
6. resolve variant metrics and footprint;
7. preserve footprint-aware path rejection;
8. perform at most one overlap correction;
9. compute sink/tilt/clearance;
10. assign final owner stone cell from corrected root;
11. append resolved member.

If member `0` fails world/slope/path validation:

```text
reject entire formation
```

Do not leave source-less debris.

---

# One-Pass Overlap Correction

Use physical footprint radii, not grass-clearance radii.

For each already accepted member:

```text
minimumDistance =
  0.78 * (candidateFootprint + existingFootprint)
  + 0.12
```

Use squared distances for the initial checks.

When correction is necessary:

```text
push = normalize(candidate - existing)
```

If distance is almost zero, use the member's process-local outward direction.

Move once:

```text
needed = minimumDistance - currentDistance + 0.04
candidate += push * needed
```

Then exactly once:

- resample height;
- resample normal;
- rerun path validation;
- recheck all accepted-member overlaps.

Reject if still invalid.

No second movement and no relaxation loop.

---

# Grounding and Grass Integration

Keep current archetype embed metric and slope sink, but make grounding role-aware.

## Embed multiplier

```text
pebble debris -> 1.25
anchor        -> 1.08
secondary     -> 1.03
other debris  -> 1.00
```

Final sink:

```text
sink =
  variant.metrics.embed
  * variant.metrics.height
  * scale
  * embedMultiplier
  + (1 - normal.y) * 0.55 * scale
```

## Grass clearance

```text
contact = variant.metrics.contactRadius * scale
```

Then:

```text
if scale < 0.50:
  clearRadius = 0

else if anchor:
  clearRadius = contact * 0.88 + 0.08

else if secondary:
  clearRadius = contact * 0.72 + 0.06

else if debris and scale < 0.70:
  clearRadius = 0

else:
  clearRadius = contact * 0.45
```

Keep existing `stoneGrassClearanceFeather`.

Small debris should often be partly hidden by grass.

---

# Tilt

Keep current archetype tilt strengths initially:

```text
pebble  0.85
shard   0.22
outcrop 0.65
slab    0.65
other   0.45
```

Do not add process-level random tilt during this implementation. Macro yaw plus actual terrain normal is enough.

---

# Split Masses

Keep existing broken boulder/block behavior but make it budget-safe.

Rules:

1. only anchor `boulder` or `block` may split;
2. split chance remains `0.28`;
3. both halves use the same variant;
4. both halves share formation palette/value/moss DNA;
5. successful split consumes the first secondary slot;
6. if split half fails validation, generate the normal first secondary instead;
7. total candidate members never exceeds descriptor budget.

Use labeled forks:

```text
memberRoot.fork("split")
memberRoot.fork("split-angle")
memberRoot.fork("split-gap")
```

Keep:

```text
breakAngle = strike + PI/2 + signed(0.35)
gap base = 0.08 .. 0.30 m + footprint separation
```

---

# Singleton Fallback

Evaluate only when the requested stone cell intersects **no final active formation halo**.

Use the same macro descriptor 3x3 already queried for the cell. Do not perform another search.

At stone-cell center sample/reuse geological/ecology data as cheaply as practical.

```text
singletonSuitability =
  geologyPotential
  * (0.25 + 0.75 * ecology.rockiness)

singletonProbability =
  stoneSingletonChance
  * lerp(0.35, 1.0, singletonSuitability)
```

One deterministic roll only.

Family:

```text
70% pebble
22% boulder
8% slab
```

Position:

```text
x = cellOriginX
  + singletonRoot.fork("x").range(0.20, 0.80)
    * stoneCellSize

z = cellOriginZ
  + singletonRoot.fork("z").range(0.20, 0.80)
    * stoneCellSize
```

Use the same final terrain/path validation as a cluster member.

Remove `FIELD_STONE_CHANCE = 0.52`.

---

# Path Verge Stones

`addVergeStones()` remains separate because it represents human disturbance rather than geology.

Preserve:

- path-distance sampling;
- tangent calculation;
- footprint-aware tread clearance;
- bounded verge stepping;
- current small-stone family;
- path-aligned yaw;
- overlap checks;
- existing source-cell margin behavior.

Change only regional density input:

```text
regionalStonePotential =
  0.45 * geologyPotential
  + 0.55 * ecology.rockiness

chance = stoneVergeChance
       * (0.35 + 0.65 * regionalStonePotential)
```

Do not add another path-edge generator.

---

# Cache Contract

Use bounded deterministic caches:

```text
raw candidate cache:       512
descriptor cache:          512
resolved cluster cache:    256
stone-cell cache:          keep current policy
variant cache:             keep current policy
```

At capacity:

```text
trim oldest insertion-order entries
until approximately 60% capacity remains
```

Eviction changes recomputation frequency only, never results.

## Cache key guidance

Correctness is more important than shaving a tiny string allocation from a cache miss.

For signed macro coordinate pairs, a readable stable key such as:

```text
"gx:gz"
```

is acceptable at these cache sizes.

Do not use a lossy hash as the sole map key unless collision handling exists.

Do not redesign the existing stone-cell cache keying as part of this task without measured need.

---

# Allocation Guidelines

On cache-hit / member-resolution hot paths:

- reuse landform/hydrology/ecology/path/normal scratch objects;
- do not allocate `Vector2`/`Vector3` per member;
- keep descriptor/member arrays bounded by config budget;
- predeclare member RNG labels `0..11`;
- use squared distances until a true distance is required;
- perform descriptor broad phase before member resolution;
- never generate a mesh per placed stone;
- continue using archetype/variant mesh cache;
- no extra per-member world noise octaves;
- do not runtime-freeze descriptor objects;
- do not add diagnostic counters to normal-frame code solely for tooling.

---

# Deterministic Pre-Change Performance Baseline

This baseline protects against making the world more expensive while changing placement style.

## Capture order

Before modifying `StoneField` placement:

1. add the capture script;
2. add package command;
3. run capture on current pre-cluster `main` + current `world.yaml`;
4. commit the JSON;
5. only then change placement behavior.

Command:

```bash
npm run capture:stone-baseline
```

Fixed chunk domain:

```text
chunkX = -6 .. 6
chunkZ = -6 .. 6
```

This is `13 * 13 = 169` production chunks centered safely inside the world.

## Exact baseline fields

```json
{
  "seed": 42017,
  "chunkMin": -6,
  "chunkMax": 6,
  "includeSmallRoots": 0,
  "farRoots": 0,
  "maxRootsInChunk": 0,
  "detailedTrianglePotential": 0,
  "coarseTrianglePotential": 0
}
```

The zeros are schema placeholders only.

The capture script writes the actual `config.seed` rather than hardcoding `42017`.

## Exact metric definitions

For every chunk in the fixed domain:

### `includeSmallRoots`

Sum:

```text
collectChunkInstances(chunkX, chunkZ, true)
```

root count.

### `farRoots`

Sum:

```text
collectChunkInstances(chunkX, chunkZ, false)
```

root count.

### `maxRootsInChunk`

Maximum `includeSmall=true` root count across one sampled chunk.

### `detailedTrianglePotential`

For every `includeSmall=true` root:

```text
getVariant(
  archetype,
  variantIndex,
  true
).indices.length / 3
```

Sum all triangles.

This intentionally models the conservative cost if sampled roots were represented by detailed geometry.

### `coarseTrianglePotential`

For every `includeSmall=false` root:

```text
getVariant(
  archetype,
  variantIndex,
  false
).indices.length / 3
```

Sum all triangles.

This models far-field retained-root geometry potential.

Do not record:

```text
performance.now()
FPS
CPU time
GPU time
timestamp
host name
```

---

# Deterministic Performance Gates After Implementation

Require:

```text
new includeSmallRoots <= baseline includeSmallRoots
new farRoots <= baseline farRoots
new detailedTrianglePotential <= baseline detailedTrianglePotential
new coarseTrianglePotential <= baseline coarseTrianglePotential
```

Local concentration gate:

```text
new maxRootsInChunk
  <= baseline.maxRootsInChunk
   + stoneClusterBudgetMax
```

The `+ one formation budget` allowance is deliberate: clustering may concentrate roots locally while total roots and total geometry fall.

Do not silently raise the baseline.

A baseline update requires an explicit reason and manual visual/performance approval.

Existing renderer performance verifiers remain separate and authoritative for draw calls, packing, batches, shader paths, and detail footprint.

---

# Deterministic Verification Domain

Main macro domain:

```text
gx = -12 .. 12
gz = -12 .. 12
```

Total:

```text
625 potential macro cells
```

This is intentionally larger than the 512-entry caches.

Also test explicit edge points near all four world sides/corners.

---

# Deterministic Verification — Exact Tests

## A. Raw candidate determinism

Construct two independent:

```text
TerrainField + StoneClusterField
```

graphs from identical shipped config.

Require canonical equality for all 625 raw candidates.

## B. Final descriptor determinism

Require canonical equality after conflict suppression.

## C. Query-order independence

Query descriptors in:

1. row-major;
2. reverse row-major;
3. deterministic shuffled order.

Require identical canonical descriptor data.

## D. Cache-eviction independence

The 625-cell domain exceeds the 512-entry raw/descriptor caches.

After full traversal, re-query the first fixed subset and require exact canonical equality.

Then query additional out-of-domain valid coordinates to force more eviction and repeat.

## E. RNG semantic isolation contract

Test at least one representative active descriptor/member by resolving semantic fields independently from labeled forks in different call orders.

Require equal values.

This verifies the implementation is actually using independent named forks rather than one sequential member stream.

## F. Conflict invariant

For every neighboring pair of final active descriptors:

```text
distance >= production minimumSeparation
```

## G. Conflict-neighborhood completeness

For valid min/max tuning boundaries, enumerate relative macro offsets in:

```text
-2 .. 2
```

and prove any offset outside the immediate 3x3 cannot satisfy the production conflict threshold.

This guards the eight-neighbor assumption.

## H. Stone-cell 3x3 completeness

For boundary combinations of:

```text
stoneCellSize
spacing
jitter
radiusMax
halo
```

that satisfy validation, test cells at phase extremes against the macro lattice.

Require every descriptor whose influence circle can intersect the stone cell to be included in the production 3x3 enumeration helper.

Do not duplicate neighbor math in the verifier; call the production pure helper.

## I. Budget invariant

For every active formation:

```text
memberSpecs.length <= descriptor.budget
resolvedMembers.length <= descriptor.budget
```

## J. Anchor invariant

Every non-empty resolved formation has:

```text
member 0 role == anchor
exactly one anchor
```

If anchor validation fails, resolved formation is empty.

## K. Split-budget invariant

Successful split consumes the first secondary slot and never raises candidate count above descriptor budget.

## L. Variant uniqueness

When occurrences of one archetype are:

```text
<= stoneVariantsPerArchetype
```

all variant indices for that archetype inside the formation are unique.

## M. Final cell ownership

Every resolved geological root maps to exactly one stone cell from its **final corrected root**.

Collecting neighboring chunks must not duplicate that root.

## N. Query complexity

Per requested stone cell:

```text
macro descriptor coordinates considered == 9
```

except world-edge descriptors may resolve inactive/out-of-bounds after lookup.

Per descriptor:

```text
conflict neighbors considered <= 8
```

Test the production enumeration helpers directly.

## O. Cold-chunk descriptor bound

For all phase alignments of the shipped:

```text
chunkSize = 64
stoneCellSize = 16
stoneClusterSpacing = 56
```

plus the existing one-cell source margin, calculate the union of macro coordinates touched by a cold chunk.

Require:

```text
unique macro descriptor coordinates <= 25
```

If an implementation change makes this false, do not casually raise the number: first verify whether geological cells are being queried redundantly.

## P. One-pass overlap invariant

Test the pure correction helper with deliberate overlap.

Require at most one movement.

Do not add a runtime counter merely for this test.

## Q. Path contract

No accepted non-pebble geological member may overlap the protected tread according to the existing footprint-aware path check.

## R. World-edge contract

At cells near all four world sides and corners:

- no accepted root may lie outside the world margin;
- no duplicate root appears from clipped neighboring formations;
- anchor failure correctly removes source-less debris;
- descriptor queries stay bounded.

## S. No lattice-lock sanity

Across active descriptors/roots:

- center jitter is not constant;
- roots are not all quantized to 16 m boundaries;
- roots are not all quantized to 56 m boundaries;
- roots are not all quantized to 64 m boundaries.

Keep this as a sanity check, not a fragile beauty statistic.

## T. Far-small-stone contract

For fixed test chunks:

```text
collectChunkInstances(..., false)
```

must be a subset of:

```text
collectChunkInstances(..., true)
```

Every removed root must be below the existing small-stone cutoff.

## U. Baseline count/triangle gates

Run the exact fixed-domain metrics above and compare to `stone-performance-baseline.json`.

## V. Existing renderer contracts

Continue running:

- `StoneRenderPerformanceVerification.ts`;
- `StoneSystemPerformanceVerification.ts`;
- `StoneShaderPerformanceVerification.ts`;
- runtime verification;
- geometry verification;
- profile verification;
- growth verification.

Do not duplicate their assertions inside the new cluster verifier.

---

# Canonical Serialization

Serialize fields in fixed order.

Quantize only derived floating point values:

```text
position / height / radius  1e-4
angles                      1e-6
scale / moss / value        1e-6
```

Keep enums/integers exact.

Use local FNV-1a 32-bit only for compact reporting/golden digests.

Determinism tests compare canonical strings, not only hashes.

No hashing dependency.

---

# Final Shipped Golden Regression

After art tuning is accepted and YAML values are final:

1. serialize all final descriptors in the `-12..12` domain;
2. serialize resolved geological roots for the same deterministic probe domain;
3. compute FNV-1a digest for each canonical stream;
4. write `qa/stones/stone-cluster-golden.json`;
5. make `StoneClusterVerification` compare against it.

This golden is intentionally created **after** final tuning, unlike the pre-change performance baseline.

Meaning:

```text
performance baseline = do not become more expensive than old placement
golden layout        = do not accidentally change accepted new placement
```

Intentional future YAML/algorithm changes must explicitly regenerate the golden after review.

---

# Stone-World Tuning Tool

## UI architecture

Use the same native DOM style as `GrassArtMenu`:

```text
<details>
range inputs
number inputs
outputs
buttons
```

No GUI dependency.

The tool exists only in `tools/stone-world` and is never imported by `WorldApp`.

## Folder: Distribution

| UI label | Config key | Default | Min | Max | Step |
|---|---|---:|---:|---:|---:|
| Formation density | `stoneDensity` | 0.17 | 0.05 | 0.40 | 0.01 |
| Formation chance | `stoneClusterChance` | 0.82 | 0.20 | 1.00 | 0.02 |
| Singleton chance | `stoneSingletonChance` | 0.10 | 0.00 | 0.25 | 0.01 |
| Formation spacing | `stoneClusterSpacing` | 56 | 40 | 96 | 2 |
| Center jitter | `stoneClusterCenterJitter` | 0.26 | 0.00 | 0.35 | 0.01 |

Tune this folder first.

## Folder: Footprint

| UI label | Config key | Default | Min | Max | Step |
|---|---|---:|---:|---:|---:|
| Radius min | `stoneClusterRadiusMin` | 10 | 4 | 30 | 1 |
| Radius max | `stoneClusterRadiusMax` | 22 | 8 | 40 | 1 |
| Aspect min | `stoneClusterAspectMin` | 0.58 | 0.45 | 0.90 | 0.01 |
| Aspect max | `stoneClusterAspectMax` | 0.92 | 0.60 | 1.00 | 0.01 |
| Halo | `stoneClusterHaloRatio` | 1.12 | 0.90 | 1.25 | 0.01 |

## Folder: Composition

| UI label | Config key | Default | Min | Max | Step |
|---|---|---:|---:|---:|---:|
| Members min | `stoneClusterBudgetMin` | 4 | 4 | 8 | 1 |
| Members max | `stoneClusterBudgetMax` | 8 | 4 | 12 | 1 |
| Core | `stoneClusterCoreRatio` | 0.42 | 0.20 | 0.60 | 0.01 |
| Shoulder | `stoneClusterShoulderRatio` | 0.78 | 0.50 | 0.90 | 0.01 |
| Density response | `stoneClusterDensityResponse` | 6 | 1 | 12 | 0.25 |

## Folder: Context

| UI label | Config key | Default | Min | Max | Step |
|---|---|---:|---:|---:|---:|
| Path verge chance | `stoneVergeChance` | 0.62 | 0.00 | 1.00 | 0.02 |

Do not expose renderer radii, variant count, batch size, shader detail, or material controls in this composition tuner.

## Actions

Add:

```text
Apply now
Reset YAML
Export YAML
Copy probe URL
```

Slider/number changes schedule a stone-only rebuild after `120 ms`.

`Apply now` flushes the pending debounce immediately.

`Reset YAML` restores the immutable config loaded when the probe opened.

`Export YAML` copies and downloads only:

```text
stoneDensity
stoneClusterChance
stoneSingletonChance
stoneClusterSpacing
stoneClusterCenterJitter
stoneClusterRadiusMin
stoneClusterRadiusMax
stoneClusterAspectMin
stoneClusterAspectMax
stoneClusterBudgetMin
stoneClusterBudgetMax
stoneClusterCoreRatio
stoneClusterShoulderRatio
stoneClusterHaloRatio
stoneClusterDensityResponse
stoneVergeChance
```

`Copy probe URL` stores current camera/probe state:

```text
x
z
h
d
span
growth
```

plus the same tuning keys as query parameters.

Production config loader never reads these query parameters.

---

# Tool Validation and Normalization

The menu normalizes for UX, but `validateWorldConfig()` remains the authority.

Before every rebuild:

```text
merged = { ...baseYamlConfig, ...toolOverrides }
validateWorldConfig(merged)
```

Only rebuild if valid.

Normalize the user-edited control first, then resync all UI values.

Required relationships:

```text
radiusMin <= radiusMax - 1
aspectMin <= aspectMax
budgetMin <= budgetMax
coreRatio <= shoulderRatio - 0.01
shoulderRatio <= haloRatio - 0.01
```

Maximum radius from negative-space bound:

```text
maxRadiusByHalo =
  spacing * 0.5 / haloRatio
```

Maximum radius from fixed 3x3 proof:

```text
maxInfluenceByQuery =
  spacing * 1.5
  - stoneCellSize * 0.5
  - centerJitter * spacing

maxRadiusByQuery =
  maxInfluenceByQuery / haloRatio
```

Final:

```text
radiusMax = min(
  radiusMax,
  maxRadiusByHalo,
  maxRadiusByQuery
)

radiusMin = min(radiusMin, radiusMax - 1)
```

If the user changes spacing/jitter/halo, dependent radius fields may shrink automatically and must update visibly.

Never let the tool construct a config that production validation rejects.

---

# Stone Probe Rebuild Lifecycle

`StoneWorldProbeController` receives:

```text
base WorldConfig
stone overrides
existing terrain field/scene terrain
```

On a stone-only tuning change:

1. merge + validate config;
2. dispose old `WorldStoneSystem`;
3. release old stone-only geometries/material resources through existing disposal path;
4. construct a new `StoneField` with reused `TerrainField` and new immutable config;
5. construct a new `WorldStoneSystem`;
6. drain static probe build;
7. update diagnostics;
8. render.

Do not rebuild terrain geometry because none of the exposed stone tuning values alter terrain.

Preserve `growth=natural|moss|lichen` behavior.

---

# Probe Diagnostics

Keep existing visible diagnostics:

```text
stone roots
active chunks
triangles
build peak ms
```

Add tool-only, non-production diagnostics only if they can be derived without adding counters to normal gameplay hot paths.

Useful optional probe-only values:

```text
active macro formations in shown span
compact/ridge/scree/fan counts
singleton roots
```

Do not add per-frame production telemetry solely for the tuner.

---

# Manual Performance Acceptance

Run the normal game, not only the static stone-world probe.

Desktop:

```text
stone build slice p95 <= 2.00 ms
no repeated >4 ms stone spikes during normal traversal
queue drains after crossing a terrain chunk
no sustained queue growth
49-draw desktop stone contract unchanged
```

Compact:

```text
stone build slice p95 <= 1.25 ms
no sustained queue growth
compact batch contract unchanged
```

If deterministic tests pass but timings regress:

1. profile first;
2. inspect cluster cache hit rate;
3. inspect duplicated terrain/ecology sampling;
4. verify broad-phase happens before member resolution;
5. inspect allocations;
6. inspect repeated cross-cell cluster resolution;
7. do not increase frame budget before finding the cause.

---

# Performance Tuning Order

If too expensive:

```text
1. reduce stoneSingletonChance
2. reduce stoneClusterBudgetMax
3. reduce stoneClusterChance
4. reduce stoneDensity
5. reduce stoneClusterRadiusMax if too many cells touch formations
```

Do not first reduce renderer quality.

If visually too empty:

```text
1. raise stoneClusterChance slightly
2. raise stoneDensity slightly
3. raise stoneClusterDensityResponse slightly
4. only then raise budget
```

If it becomes a rock carpet:

```text
1. lower singleton chance
2. increase spacing
3. lower radius/halo
4. lower cluster chance
5. keep conflict suppression enabled
```

If formations look repetitive:

```text
adjust center jitter / aspect range / spacing
```

Do not add members merely to create variety.

---

# Visual QA Matrix

Reuse existing fixed QA viewpoints where possible.

Required scenes:

```text
quiet meadow
meadow compact formation
dry/steppe formation
alpine formation
ridge
moderate slope
steep scree
fan/hollow edge
path verge
water edge
high-altitude exposed rock
split anchor
close moss formation
wide world view
```

Verify:

- large areas of intentional empty grass remain;
- one dominant mass reads first;
- secondary stones support rather than compete;
- debris generally becomes smaller away from source;
- members share family resemblance;
- meadow shards are rare;
- ridge members share geological strike;
- scree/fan follows macro downhill;
- no 16 m / 56 m / 64 m lattice is visible;
- bases are buried rather than placed on top;
- small debris can disappear into grass;
- grass holes are not identical circles;
- weathering reads as one local microclimate;
- no chunk-border duplicate/discontinuity appears;
- detail/coarse representation preserves formation identity.

Use existing `qa/aaa-look` meadow/dry/alpine/rocky/path/water locations before inventing new camera coordinates.

---

# Optional Shape Pass — Only After Distribution Acceptance

Do not mix mesh tuning into macro-placement debugging.

## `StoneShapeQuality.ts`

Add isolated silhouette-spike penalty.

For every footprint side:

```text
neighborMean =
  (previousRadius + nextRadius) * 0.5

spike =
  abs(currentRadius - neighborMean)
  / meanRadius
```

Free threshold by archetype:

```text
pebble   0.12
boulder  0.16
slab     0.18
block    0.24
shard    0.34
outcrop  0.22
```

```text
excess = max(0, spike - threshold)
spikePenalty = average(excess)
score -= spikePenalty * 3.2
```

Keep best-of-four attempts.

## `StoneRecipe.ts`

Only apply after before/after gallery comparison.

Boulder starting range:

```text
radiusJitter        0.14 .. 0.24
silhouetteAsymmetry 0.08 .. 0.15
cutCount            1 .. 2
cutDepth            0.06 .. 0.13
sideCount           keep 10 .. 12
```

Slab:

```text
topScale    0.76 .. 0.92
heightRatio 0.36 .. 0.52
embed       0.26 .. 0.40
```

Outcrop:

```text
heightRatio 0.38 .. 0.58
depthRatio  1.15 .. 1.75
embed       0.32 .. 0.48
```

Keep pebble/block/shard geometry initially.

Keep `stoneGrainStrength: 0`.

---

# Exact Local Test Commands

After each implementation pass:

```bash
npm run test:stones
```

When config changes:

```bash
npm run test:config
npm run test:stones
```

When probe tooling changes:

```bash
npm run test:stone-tools
```

Before implementation is considered complete:

```bash
npm run test:config
npm run test:stones
npm run test:stone-tools
npm run build
```

Manual visual/performance test:

```bash
npm run dev
```

Deployment after manual acceptance only:

```bash
npm run deploy:pages
```

No GitHub Actions.

---

# Implementation Order

## Pass 0 — Freeze pre-change cost

Before changing placement behavior:

1. add baseline capture script;
2. add `capture:stone-baseline` package command;
3. run it against current pre-cluster `main`;
4. commit `qa/stones/stone-performance-baseline.json`;
5. capture current fixed visual QA screenshots;
6. record current stone-world diagnostics.

No placement code changes before this baseline exists.

## Pass 1 — Shared-field/config foundations

Modify/add:

- `TerrainLandformField.ts` comment correction;
- `TerrainField.resolveEcologyFromLandform()`;
- `WorldConfig.ts`;
- `WorldConfigSchema.ts`;
- `WorldConfigValidator.ts`;
- `public/config/world.yaml`;
- config verification for all new relational invariants.

Run:

```bash
npm run test:config
npm run test:ecology
npm run test:stones
```

## Pass 2 — Macro descriptor field

Add:

- `StoneClusterTypes.ts`;
- `StoneClusterTuning.ts`;
- `StoneClusterField.ts`.

Implement:

- stable labeled RNG;
- fixed 3x3 helper;
- environment reuse;
- activation;
- process;
- direction;
- radius/aspect/budget;
- conflict suppression;
- caches.

Add descriptor determinism and geometric query-bound tests before integrating with `StoneField`.

## Pass 3 — Composition

Add `StoneClusterComposition.ts`:

- roles;
- process layouts;
- family tables;
- scale hierarchy;
- variant non-repetition;
- yaw hierarchy;
- color/moss DNA;
- split-slot ownership.

Keep it pure.

## Pass 4 — `StoneField` integration

Replace ordinary independent geological placement with:

```text
3x3 descriptor lookup
-> broad phase
-> cached whole-formation resolution
-> final cell ownership
-> singleton fallback
-> existing path verge
```

Remove:

```text
FIELD_STONE_CHANCE
generic parent satellites
recursive path-near satellites
```

Preserve final physical/path/slope validation.

## Pass 5 — Deterministic performance gates

Add:

- `StoneClusterPerformanceVerification.ts`;
- baseline root/triangle comparison;
- fixed-complexity tests;
- far-small-stone test;
- max local concentration gate.

Modify `verify-stones.mjs` to run:

```text
new cluster verifier
new cluster performance verifier
existing shader performance verifier
```

## Pass 6 — Grounding and weathering tuning

Apply:

- role-aware sink;
- role-aware grass clearance;
- cluster-level mossy palette;
- ecology-derived cluster moss base.

Do not change growth shader/material architecture.

## Pass 7 — Stone-world tuner

Add:

- `StoneClusterTuningMenu.ts`;
- `StoneWorldProbeController.ts`;
- `stone-world.css`;
- refactored tool `main.ts`;
- URL overrides;
- YAML export;
- validated stone-only rebuild.

Tune production YAML using fixed QA locations.

## Pass 8 — Optional shape pass

Only if distribution is already visually correct and gallery screenshots show a remaining shape problem.

## Pass 9 — Freeze accepted layout

After final YAML/art tuning:

1. generate `qa/stones/stone-cluster-golden.json`;
2. enable golden descriptor/root digest checks;
3. run full local verification/build;
4. manual desktop traversal;
5. manual compact traversal;
6. fixed visual QA matrix.

Deploy manually only after all pass.

---

# Definition of Done

All must be true:

1. ordinary geological stones are formation-driven rather than independently scattered by 16 m cells;
2. quiet meadow has substantial negative space;
3. compact/ridge/scree/fan formations read differently;
4. every non-empty formation has one clear anchor hierarchy;
5. nearby members visibly belong to related geology;
6. meadow strongly favors boulder/slab/pebble language;
7. shards are contextual instead of globally common;
8. macro downhill uses the negated height gradient from the existing 44 m landform field;
9. the misleading landform gradient comment is corrected;
10. macro ecology reuses one sampled landform rather than resampling it;
11. the fixed 3x3 stone-cell lookup is guaranteed by validator math and tested at boundary configurations;
12. conflict suppression examines only eight neighbors and its completeness is proven/tested;
13. unrelated random choices are isolated by labeled forks;
14. small stones nestle into grass;
15. weathering agrees with shared ecology;
16. cluster/member results survive query-order changes and cache eviction;
17. world-edge behavior is deterministic and bounded;
18. no geological root is duplicated across stone cells/chunks;
19. candidate member count never exceeds YAML budget;
20. overlap correction never moves a member more than once;
21. fixed-domain include-small root count does not exceed frozen pre-change baseline;
22. fixed-domain far root count does not exceed frozen pre-change baseline;
23. detailed/coarse triangle potentials do not exceed frozen pre-change baseline;
24. max local root concentration remains within baseline + one configured formation budget;
25. existing 49 desktop draw contract remains intact;
26. detail/coarse split remains 9/40;
27. compact batching remains within the existing verifier contract;
28. existing coarse shader performance verifier is actually included in `test:stones`;
29. normal-frame cluster work remains zero;
30. stone render radii remain unchanged;
31. no new textures/materials/runtime GUI dependencies are added;
32. no GitHub Actions are added;
33. `npm run test:config` passes;
34. `npm run test:stones` passes;
35. `npm run test:stone-tools` passes;
36. `npm run build` passes;
37. manual desktop build slices remain within the existing 2.00 ms reserve;
38. manual compact build slices remain within the existing 1.25 ms reserve;
39. fixed visual QA views are accepted;
40. final accepted layout golden is committed.

The expected result is a **smarter formation generator producing fewer, better-related stones with stronger negative space and grounding**, not a more expensive renderer.