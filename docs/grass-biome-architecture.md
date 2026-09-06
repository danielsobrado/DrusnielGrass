# Grass biome architecture — same principles, different looks

## Implementation status (2026-08-06)

- B1 is implemented end to end: `instanceBiome` is present on near, mid, and far geometry;
  bounded palette arrays keep biome count out of the draw-call budget.
- B2 is implemented: strictly validated JSON profiles, `WorldBiomeField`, deterministic
  world-space species picks, continuous border density, scale bands, dryness, wind damping,
  and biome-versioned placement keys all run only during builds.
- B3 gates are implemented: profile palettes run through the LOD color-parity analysis, and the
  performance gate enforces dense indices, array limits, bounds ceilings, build-only sampling,
  and unchanged batch ownership. Browser QA confirms the generated borders render without
  shader errors; the four-distance art sign-off remains a manual release capture.
- B4 shape families remain intentionally deferred until a shipping biome needs distinct
  geometry, matching the scope below.

Two things the original plan did not anticipate, both found by running the result:

1. **The field needed a rank transform and explicit world shares.** A sum of value-noise
   octaves is bell-shaped, so slicing it into equal intervals gave the *middle* biome two
   thirds of the world: the default spawn came up dry steppe and the active art preset's
   palette — which biome 0 carries — was a minority look. `WorldBiomeField` now ranks the
   field against its own distribution (one 2 048-sample table built at module load) so a
   biome's share of the world is exactly its new `worldShare`, and the loader fails a profile
   set that leaves biome 0 under 40%. The period also moved 90 m → 420 m; at 90 m the species
   changed every ten metres, which reads as patchy discolouration rather than as regions.
   Measured after the change: 62 / 20 / 18 shares, median region run 152 m along a transect.
2. **Terrain tint is not biome-aware — the one open parity gap.** `terrainGrassTint` is a
   single global uniform fed from the art preset (`TerrainStreamer.setGrassArtDirection`), so
   inside a steppe or alpine region the ground keeps the meadow green while the grass over it
   does not. Nothing shows at close range, where grass covers the ground, but it puts a colour
   step at the 270–290 m card→terrain fade in non-meadow regions — exactly the seam the rest
   of this design exists to prevent. The fix is a per-vertex biome tint on the terrain chunk
   (sample `sampleGrassBiome` in the chunk builder, interpolate the same palette rows), which
   is a terrain-side change and was left out of this scope deliberately rather than bolted on.

Purpose: define how one grass system renders visibly different biomes (meadow, dry steppe,
alpine, …) inside a bigger streamed world, **without** multiplying draw calls, materials, or
LOD code paths — and without breaking the invariants the current system is built on. This is a
design document; the status block above records what of it now ships.

The five principles that must survive biome support (they are what makes the system fast and
seam-free today):

1. **Anything that varies spatially is per-instance data, never a per-mesh uniform**
   (three uploads shared-material uniforms once per contiguous draw run).
2. **LOD rejection happens in the vertex stage on sorted dithers**, so draws are
   prefix-trimmable on the CPU (`mesh.count` / `drawRange`).
3. **One palette function at every LOD** (`grassResolvePalette`), fed identical inputs, guarded
   by `verify-lod-color-parity.mjs`.
4. **Semantic impostor atlas** (progress/shade/dryness, not baked RGB) — recolorable per
   instance, so a color change never requires a re-bake.
5. **Analytic bounds**: every scale applied to a blade is bounded by a named ceiling that the
   reserved culling bounds are computed from.

The design conclusion up front: **v1 biomes are pure per-instance data** — palette row, density,
height/width band, dryness bias, wind damping — sampled once per blade at build time. Zero new
draw calls, zero new materials, one new 4-byte attribute. Shape *families* (genuinely different
blade geometry) are a bounded v2 extension.

---

## 1. Two layers of "look", cleanly separated

Today `GrassArtDirection` mixes two concerns: global art grading (ambient, backlight, LOD
distances, wind scale) and the meadow's identity (colors, density). Split them:

| Layer | Owns | Varies | Lives in |
| --- | --- | --- | --- |
| **Art direction** (existing presets) | lighting response (`ambientBoost`, `backlightStrength`, `normalUp`), impostor grading, global wind/flutter scale, gust depth, **LOD distances**, global `densityScale` | per scene/mood, runtime-switchable | `GrassArtPresets.json` (unchanged mechanism) |
| **Biome profile** (new) | palette (base/tip/dry, `rootDarkening`, `tipColorStrength`), relative density, height/width bands, dryness bias, wind damping, clump height band | per world position, baked into instances at build | `src/grass/biome/GrassBiomeProfiles.json` (new) |

**LOD distances stay global** — this is non-negotiable. Per-biome fade distances would need
per-instance fade parameters in the keep test, would break the per-batch conservative
`drawRange` bounds from PERF-1, and would make the seam checklist unverifiable. Biomes differ in
*what* grows, not *where representations hand off*.

Composition rule: `final = artDirection ⊗ biomeProfile` — multiplicative for scalars
(`density = art.densityScale × biome.density`), biome-owned for palette, art-owned for lighting.
A world with no biome map runs biome 0 everywhere and behaves exactly like today.

## 2. Biome profile schema

New file `src/grass/biome/GrassBiomeProfiles.json` + `src/grass/biome/GrassBiomeProfile.ts`
(interface + loader with the same strict validation style as `GrassConfigLoader`):

```json
{
  "meadow": {
    "index": 0,
    "label": "Meadow",
    "baseColor": "#3f8330", "tipColor": "#a9db57", "dryColor": "#b3ac5e",
    "rootDarkening": 0.68, "tipColorStrength": 0.32,
    "density": 1.0,
    "heightBand": [0.92, 1.14],
    "widthBand": [0.9, 1.1],
    "drynessBias": 0.0,
    "windDamping": 1.0,
    "shapeFamily": "blade"
  },
  "dry-steppe": {
    "index": 1,
    "label": "Dry Steppe",
    "baseColor": "#7a7a3c", "tipColor": "#cbbf6a", "dryColor": "#c2a35a",
    "rootDarkening": 0.74, "tipColorStrength": 0.3,
    "density": 0.55,
    "heightBand": [0.78, 1.02],
    "widthBand": [0.8, 0.98],
    "drynessBias": 0.35,
    "windDamping": 0.9,
    "shapeFamily": "blade"
  },
  "alpine": {
    "index": 2,
    "label": "Alpine",
    "baseColor": "#2f6b45", "tipColor": "#7fae7a", "dryColor": "#8d9573",
    "rootDarkening": 0.72, "tipColorStrength": 0.28,
    "density": 0.7,
    "heightBand": [0.7, 0.9],
    "widthBand": [0.85, 1.0],
    "drynessBias": 0.12,
    "windDamping": 0.8,
    "shapeFamily": "blade"
  }
}
```

Validation must enforce the **bounds ceilings** (section 5): `heightBand ⊂ [0.7, 1.14]`,
`widthBand ⊂ [0.76, 1.1]`, `windDamping ∈ [0.7, 1.0]`, `density ∈ (0, 1]`, `index` dense from 0,
count ≤ `GRASS_MAX_BIOMES = 8`.

## 3. Spatial biome resolution — `WorldBiomeField`

New file `src/world/grass/WorldBiomeField.ts`, deliberately shaped like
`GrassFieldVariation.ts` (build-time-only, world-space, pure functions):

- `sampleBiome(x, z): { indexA, indexB, blend }` — v1 implementation: low-frequency value noise
  (period 420 m, its own seed), rank-transformed against its own distribution and sliced by
  `worldShare`, with a soft border measuring ~26 m median / ~44 m mean along transects; later
  replaced by an authored/worldgen biome map lookup **behind the same signature**. The signature
  is the contract; everything downstream is already correct when the map becomes real.
- Border semantics (this is the part that keeps borders natural *and* cheap):
  - **Species pick is per-blade dithered, not blended.** A blade at blend `t` belongs to biome B
    with probability `t`, decided by a build-time hash of its root position
    (`hash(x, z) < t`), exactly the interleaving real meadow↔steppe edges have. No shader blend,
    no popping (the pick is deterministic in world space), and each blade carries **one** biome
    index.
  - **Density is lerped continuously** (`density = lerp(densityA, densityB, t)`) *before* it
    feeds coverage, so bare-ground fraction ramps smoothly even where species interleave.
  - **Macro fields stay global.** Dryness/vigor noise (`GrassFieldVariation.ts`) continues to be
    sampled identically on both sides, so a dry crown crosses a biome border without a seam;
    `drynessBias` adds on top per blade, clamped as today.

Cost: one extra 2-octave noise sample (+1 hash for the pick) per blade at **build time only**
(~8 hashes ≈ the existing macro sampling; measured tile build cost +≈5 %). Zero per-frame cost.

## 4. Rendering N biomes with the same draw calls

### 4.1 Palette: uniform array + per-instance row

- Replace the three color uniforms per material with bounded arrays in every grass shader
  (`GrassNearMaterial`, `WorldGrassImpostorMaterial`):
  ```glsl
  #define GRASS_MAX_BIOMES 8
  uniform vec3 uBiomeBase[GRASS_MAX_BIOMES];
  uniform vec3 uBiomeTip[GRASS_MAX_BIOMES];
  uniform vec3 uBiomeDry[GRASS_MAX_BIOMES];
  uniform vec2 uBiomeShade[GRASS_MAX_BIOMES]; // x: rootDarkening, y: tipColorStrength
  attribute float instanceBiome;              // integer-valued row
  ```
  24 `vec3` + 8 `vec2` uniforms — trivially inside WebGL2 limits; dynamic indexing of uniform
  arrays by a per-instance value is legal in GLSL ES 3.0. `grassResolvePalette` **does not
  change** — callers index the arrays and pass the results as the existing parameters, so
  parity-by-construction is preserved (principle 3).
- `setBalancedGrassPaletteColors` runs per biome row when profiles load; the luminance balancer
  keeps cross-biome brightness compatible the same way it does across presets today.
- Vertex-palette layers index in the vertex stage; segmented layers and the impostor pass
  `instanceBiome` through a varying (`flat`-rounded in the fragment) and index there.
  The impostor's semantic atlas (principle 4) is untouched: **one atlas serves every biome**.

### 4.2 The one new attribute

`instanceBiome`: 1 float per instance (4 B). Touch points, all mechanical:

- `GrassGeometryFactory.createInstancedGeometry` — accept and attach the attribute (shared
  variant for the placement-cache path, like variation/coverage).
- `WorldSingleBladeTileFactory.advanceSampling` — write the dithered biome pick per blade;
  fold the biome into buffers/pool sizes (`+1` float per blade).
- `WorldGrassSystem.advancePatchBuild` — same for mid patch instances; propagate through
  `createFarImpostorInstances` (cards inherit the source instance's biome).
- After PERF-7 (compressed transforms) the index moves into a freed component of the packed
  attribute and the extra 4 B disappears — note the synergy, don't couple the schedules.

Memory: near base field ≈ 293 k blades × 4 B ≈ 1.2 MB. Negligible against the 25 MB matrices
(or 10 MB post-PERF-7).

### 4.3 Density, height, width, wind, dryness — all ride existing per-instance channels

| Biome parameter | Mechanism (already exists) | Where applied |
| --- | --- | --- |
| `density` | coverage feeding the dither keep + CPU prefix trim | `coverages[i] = biomeDensity` in tile sampling (today constant 1, `WorldSingleBladeTileFactory.ts:534`); `coverage ×= biomeDensity` in chunk build (`WorldGrassSystem.ts:829-841`) |
| `heightBand` | clump height scale band | replace the constant `CLUMP_HEIGHT_MIN/MAX` band with the biome band **inside** the same clamp (`WorldSingleBladeTileFactory.ts:484-493`) — vigor folding unchanged |
| `widthBand` | horizontal scale band (`:494-507`) | same treatment |
| `windDamping` | `instanceVariation.y` (per-instance wind scale) | multiply at build: `variation.y = random(0.84, 1.16) × windDamping` |
| `drynessBias` | `instanceVariation.w` build formula | add bias term before the existing clamp |

Density flows through `instanceCoverage`, so a sparse biome does draw proportionally fewer
blades. **Correction to the original plan:** that saving is raster and fragment work, *not*
submitted vertices. Coverage is tested against `grassFieldDither`, which is a different hash
from the `grassDither` the instance buffers are sorted by, so a sparse biome is not a prefix of
the sorted order and neither `updateInstanceCounts` nor PERF-1's `drawRange` can trim for it.
Both trims fold in the *governor's* density scale instead, which multiplies the LOD threshold —
the sorted key itself — and therefore does reduce submitted vertices.

Making biome density vertex-cheap too would mean folding it into the LOD threshold as well.
That is deliberately not done: the LOD threshold is a distance fade, and coupling bare-ground
placement to it would make the blades that vanish with distance be exactly the blades missing
in sparse ground, which is visible as the field thinning in a spatially correlated pattern.
The honest summary is that a steppe chunk costs the same vertices as a meadow chunk and less
fill; if a future biome is sparse enough for that to matter, give it a lower `density` *and*
fewer source blades via a shape family (§6), not a threshold hack. No LOD or material code
changes at all for v1.

### 4.4 Draw calls: unchanged

One material set (3 near + 1 mid + 1 impostor), one geometry family, one atlas. Biome count has
**zero** effect on draw calls, program switches, or per-frame uniform uploads. This is the
property to defend in review for every future biome feature.

## 5. Bounds and cache invariants (the fine print that keeps culling honest)

- `heightBand` max (1.14) × blade jitter (1.06) = 1.208 ≤ `INSTANCE_VERTICAL_SCALE_MAX` 1.22 ✔ —
  the validator enforces the band so the analytic bounds
  (`calculateGrassSingleBladeRootBoundsRadius`) stay correct without touching them.
- `windDamping ≤ 1.0` keeps `variation.y ≤ 1.16 = MAXIMUM_INSTANCE_WIND_SCALE` ✔. Windier-than-
  meadow biomes are expressed through the *art direction's* global wind scale or gust depth,
  never per-instance above 1.
- Placement cache: `createPlacementKey` (`WorldSingleBladeTileFactory.ts:932-934`) must append a
  `biomeVersion` (bumped when profiles or the biome map change) — otherwise editing a biome
  reuses stale cached tiles. Same for the PERF-5 LRU.
- Clump lattice margin (`CLUMP_MAX_CELL_OFFSET`) stays a global compile-time max; v1 biomes do
  not vary clump radius/jitter (only the height band), so the margin math is untouched.

## 6. v2 — shape families (only when a biome truly needs different geometry)

For species a scale band cannot fake (broad tropical leaves, tundra moss tufts, reeds):

- `shapeFamily` names one of ≤ 3 registered families; each family owns its single-blade
  geometries (1-seg + segmented), patch geometry + sorted dithers, and impostor atlas
  (`WorldGrassImpostorAtlasFactory` is already parameterized by blade specs — it just runs once
  per family).
- Granularity: **per near tile / per mid batch, by majority at its center** — a tile renders one
  family, families interleave at 8 m / 32 m scale across a border while per-blade *color*
  dithering keeps the transition busy. This bounds draws at `families present × current draws`
  worst case, and in practice borders are a thin ring, so the steady-state cost is one extra
  mesh set only inside border tiles' band.
- Explicitly rejected: per-blade family mixing inside one mesh (would need either merged
  mega-geometry with per-blade family masks — breaks prefix trimming — or per-blade draw
  splitting — breaks batching). If art wants per-blade interleave at a specific border, that
  border gets authored as a third "transition" family.
- v2 is gated on a real biome shipping with a real need; v1's scale bands + palette cover the
  reference meadow/steppe/alpine spread.

## 7. Gates and QA extensions

- `verify-lod-color-parity.mjs`: also enumerate `GrassBiomeProfiles.json` — each profile's
  palette goes through the identical near/mid/far checks presets go through today (it already
  loops `Object.values(presets)`; add a second loop over profiles composed with the default art
  direction).
- `verify-grass-performance.mjs`: add asserts that (a) `GRASS_MAX_BIOMES === 8` matches the
  shader define, (b) biome sampling appears only inside build stages (source-pattern check for
  `sampleBiome` absent from any `update(` path), (c) the near material has no per-biome uniform
  besides the bounded arrays.
- New micro-gate `verify-biome-bounds.mjs` (or fold into performance gate): loads profiles,
  re-computes the section-5 inequalities, fails on violation — so an artist editing JSON cannot
  silently break culling bounds.
- Visual QA: extend the seam checklist in
  [grass-aaa-look-plan.md](grass-aaa-look-plan.md) with a sixth item — walk a biome border at
  0 m, 20 m, 60 m, 200 m and confirm the species *mix ratio* reads the same at all four.
  Precisely: the pick hash and field are shared everywhere, but the sampling **position**
  differs by representation — near tiles decide per blade root, while a mid patch (and the far
  cards derived from it) decides once per 4 m patch centre. Mid↔far therefore agree exactly;
  near↔mid agree statistically but at different grain inside a border band (blade-scale vs
  patch-scale interleave, ~7 patch rows across a measured ~30 m band, which is what keeps the
  quilt smooth). A wrong *ratio* or a border that moves between LODs is a plumbing bug; a
  coarser grain past the near band is the accepted v1 trade.

## 8. Implementation order (fits between performance phases)

1. **B1 — plumbing, invisible**: `instanceBiome` attribute end-to-end (always 0), palette
   uniform arrays replacing the three color uniforms, gates updated. Ship with zero visual diff
   (screenshot-compare all six presets).
2. **B2 — profiles + field**: loader, `WorldBiomeField` noise implementation, build-time
   sampling of density/bands/bias/damping, placement-key version. First visible two-biome world.
3. **B3 — border polish**: tune border width, verify the 4-distance border QA, extend parity
   gate to profiles.
4. **B4 (later) — shape families** per section 6, only on demand.

Do B1 after PERF-1/2 land (they touch the same shader regions; merging them avoids double
review of `VERTEX_KEEP_WORLD_LOD`), and before LOOK-2 wind waves if both are in flight — wind
waves read the biome damping already being in `variation.y`, nothing more.
