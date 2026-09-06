# Detail foliage plan — channel-packed accent atlas (ferns, flowers, seed heads)

> Composition follow-up: plant communities, negative space, and the shrub/broadleaf
> replacements are specified in [tiny-glade-detail-foliage-plan.md](plans/tiny-glade-detail-foliage-plan.md).

Origin: the 80.lv stylized-cave article's foliage section packs several species into one
texture's channels — R opacity cutout, G wind mask, B color-blend mask — and scatters cheap
cards whose species "individually might not look very good [but] when mixed, the result looks
nice". This document is the implementation plan for adopting what is good about that idea in
this codebase, written to be executed as specified without re-deriving decisions.

## Verdict first

**Adopt** the two transferable ideas:

1. **One channel-packed atlas, many species, one material** — this is our own principle
   (per-instance data, bounded uniforms, zero draw-call growth per look) applied to accents.
2. **Mixed low-density species read as richness** — ferns + flowers + seed heads sprinkled
   through blade grass is the missing LOOK-7 layer, and the reference hillside shot is exactly
   the target: the flowers are a few pixels each; it is the *mixture* that reads.

**Reject** two parts, deliberately:

1. **Do not replace blade grass with alpha-tested cards.** The article's grass is cutout cards;
   ours is real geometry with vertex-stage LOD collapse and no fragment `discard` — that is why
   the near field survives 290 k resident blades. `verify-grass-performance.mjs` asserts the
   no-discard property for the near material. Cards are for the *accent* layer only, where
   instance counts are three orders of magnitude smaller.
2. **Do not extract shapes or channels from the article's images.** They are the artist's
   copyrighted work, and article screenshots are low-resolution derivatives anyway. Two clean
   sources instead:
   - **Procedural (recommended):** bake our own atlas with Canvas 2D at init, exactly like
     `WorldGrassImpostorAtlasFactory` already does for impostors. Deterministic, seedable,
     recolorable through the shared palette, no binary assets in the repo, no license text to
     carry. The species below are all drawable with a dozen canvas paths each.
   - **CC0 fallback (only if art rejects the procedural look):** Kenney's foliage packs and
     OpenGameArt CC0 silhouette sets are license-safe; import as a single pre-packed PNG under
     `public/textures/` with a note in THIRD_PARTY_NOTICES.md. Nothing CC-BY or
     screenshot-derived.

## Channel mapping, translated to this codebase

The article packs *display* data; we pack *semantic* data and resolve display at runtime — the
same philosophy as the impostor atlas (progress/shade/dryness, recolored by
`grassResolvePalette`), which is what keeps every layer preset- and biome-consistent for free.

| Article channel | Ours | Why the change |
| --- | --- | --- |
| R opacity cutout | **A** (premultiplied alpha, mips on) | Real alpha filters/mips correctly; reuse the impostor's distance-compensated cutoff so far accents do not erode. |
| G wind mask (per-texel) | **Per-species wind weight × `uv.y` ramp in the vertex stage**, driven by the shared gust-noise field | A texel mask cannot act in a vertex shader on an 8-vertex card; a species scalar × height ramp is the honest equivalent, and using `uGrassWindNoise` keeps accents bending with the same wind as everything else. |
| B color-blend mask | **B accent-tint mask** (1 on petals/seed heads, 0 on stems/leaves) | Same idea, but the tint color is **per instance** (biome-driven), not a material parameter — so one atlas yields white/red/yellow/pink flowers with zero extra draws. |
| — | **R blade progress, G shade** | Freed by the alpha move: feed `grassResolvePalette` so leaves/stems match the surrounding grass palette in every preset and biome, guarded by the same parity reasoning as the impostor atlas. |

## Implementation spec

### 1. Atlas — `src/world/grass/WorldDetailFoliageAtlasFactory.ts` (new)

Canvas-baked at init, mirroring `WorldGrassImpostorAtlasFactory` structure:

- Layout: 8 columns × 2 rows of 112 px cells + 8 px padding → 1024 × 256 canvas.
  `CanvasTexture`, `premultiplyAlpha: true`, `NoColorSpace`, `LinearMipmapLinearFilter`,
  `generateMipmaps: true`, `anisotropy 4` — copy the impostor atlas settings verbatim.
- Species cells (seeded `SeededRandom`, one drawing routine each, ~30 lines apiece):
  0. grass tuft: 9–12 tapered triangles fanned from a root point, progress gradient R 0→1.
  1. tall tuft: same, taller and narrower.
  2. fern frond: central stem curve + 8–10 pinnae pairs (tapered ellipses shrinking toward
     the tip), B = 0, shade G slightly darker than tufts.
  3. small fern: 2 crossed fronds.
  4. daisy: 8–10 petal ellipses around a disc; petals B = 1, disc B = 0.6.
  5. round bloom (poppy-like): 5 overlapping petal circles, B = 1.
  6. seed head: thin stem, cluster of 6–8 small ellipses at the tip, B = 1 on the cluster.
  7. sprig: 3 stems with tiny leaf pairs, B = 0.
- Export per species: `{ cellX, cellY, aspect, windWeight }` — `windWeight` in [0.3, 1]
  (ferns low, seed heads high).

### 2. Material — `src/world/grass/WorldDetailFoliageMaterial.ts` (new)

One `ShaderMaterial` for the whole layer, modeled on `WorldGrassImpostorMaterial`:

- Vertex: instanced card (two stacked quads, 8 vertices, so ferns bend mid-frond); billboard
  around the instance yaw only (upright cards, no full camera facing — accents anchored in the
  field, like the article's); wind = `uGrassWindNoise` fetch at the root ×
  `uSpeciesWind[species] * uv.y` ramp, same scale/speed uniforms as every other layer
  (`GRASS_WIND_NOISE_SCALE/SPEED`), sine fallback for compact profiles; per-instance LOD
  dither fade against a 24–30 m radius reusing the `instanceCoverage` pattern.
- Per-instance attributes: `instanceMatrix`, one packed float `instanceAccent`
  (`species * 16 + tintRow`), `instanceBiome`, `instanceCoverage`, `instanceVariation`
  (reuse the standard quartet where possible).
- Fragment: atlas fetch → distance-compensated alpha cutoff (`discard` is acceptable here and
  only here — bounded instance count, and cutout cards cannot avoid it) → `grassResolvePalette(
  uBiomeBase[row]…, atlas.r /*progress*/, atlas.g /*shade*/, dryness, ao, …)` → `mix(color,
  uAccentTint[tintRow], atlas.b)` → `GRASS_LIGHT_MIX_GLSL` stylization + fog. `uAccentTint` is
  a bounded `vec3[8]` uniform array: white, cream, buttercup yellow, poppy red, pink, lavender,
  straw, sky-blue.

### 3. Placement — `src/world/grass/WorldDetailFoliageField.ts` (new)

Clone the shape of `WorldSingleBladeTileField` + a slim factory (reuse `TerrainHeightLattice`,
suitability, path mask, biome sampling — same call order as the blade factory):

- 8 m tiles, visibility radius 28 m + margin, `reconcileEveryFrame: false` (tile-crossing
  reconcile is enough at this radius), instances sorted by dither for `mesh.count` trimming.
- Density: `0.35 / m²` base (≈ 22 instances/tile, ≈ 1.6 k resident) scaled by the biome's
  `accentDensity` and gated by the macro fields: flowers where
  `sampleGrassMacroVigor > 0.55`, seed heads where `sampleGrassMacroDryness > 0.5`, ferns near
  low `suitability` slopes — the article's "mixed" look comes from these gates disagreeing
  with each other spatially.
- Species/tint choice: per-instance hash → weighted pick from the biome's `accentSpecies`
  list; deterministic in world space (same `positionHash` idiom as the biome pick).
- Scale bands within the existing analytic ceilings; bounds padding via
  `calculateGrassSingleBladeRootBoundsRadius` with card height as blade height.
- No far representation: dither out by 30 m entirely (accents are sub-pixel past that; the
  reference image's distant flowers are literally 2–3 px sprinkles, which the mid band's
  dryness/vigor color variation already provides).

### 4. Biome integration — `GrassBiomeProfiles.json` (+ loader)

New optional fields per profile, validated like the rest:

```json
"accentDensity": 1.0,
"accentSpecies": [
  { "species": "daisy", "tint": "white", "weight": 3 },
  { "species": "round-bloom", "tint": "poppy-red", "weight": 1 },
  { "species": "fern", "tint": "none", "weight": 2 },
  { "species": "grass-tuft", "tint": "none", "weight": 4 }
]
```

meadow: daisies/poppies/ferns as above; dry-steppe: seed heads + straw tufts + sparse yellow
blooms, `accentDensity 0.6`; alpine: white tufts + lavender blooms, `accentDensity 0.5`.
Defaults (absent fields) = meadow's set, so existing profiles keep validating.

### 5. Budgets and gates

- Budget: ≤ 2.5 k resident cards, ≤ 30 extra draws (per-tile meshes; merge per 2×2 tiles only
  if `renderer.info` shows it mattering), ≤ 0.1 M vertices — noise next to the mid layer.
  Governor: tie the layer to tiers — T2 halves `accentDensity`, T3 disables the field
  (`setEnabled(false)`), through the same ramped density-scale mechanism.
- `verify-grass-performance.mjs`: assert the accent material is the **only** grass material
  containing `discard` for alpha (the near-material no-discard assert must keep passing);
  assert density ceiling ≤ 0.5/m²; assert biome accent sampling appears only in build paths.
- `verify-lod-color-parity.mjs`: no change — the green parts resolve through the shared
  palette by construction; tints are deliberate accents like the backlight tint and stay
  outside the parity budget.
- Visual QA: reference-match check against the target hillside look — flowers must read as
  scattered color at 10–25 m and disappear before the mid→far handoff; a biome border must
  swap accent sets across the same fringe the species swap uses.

### 6. Phases (each its own commit, `npm run build` green after each)

1. **F1 atlas**: factory + a `?accentAtlas=1` debug route that draws the canvas to the page
   (same pattern as `?grassImpostorBake=1`). Eyeball all 8 cells.
2. **F2 material + field**: place with a single hardcoded species over meadow only; verify
   draw count and dither fade in/out at 24–30 m.
3. **F3 species mix + macro gating**: all 8 species, vigor/dryness gates, tint array.
4. **F4 biome wiring**: profile fields + loader validation + per-biome sets.
5. **F5 gates + governor tie-in + docs**: assertions above; update
   [grass-aaa-look-plan.md](grass-aaa-look-plan.md) LOOK-7 to point here.

Estimated total: ~700 lines of new code, no changes to existing grass materials, zero effect
on the blade-layer budgets.

## Implementation status — shipped

All five phases are implemented and `npm run build` is green (TypeScript, all three gates,
Vite). No existing grass material changed. New modules:

- `src/grass/biome/GrassAccentSpecies.ts` — the species and tint catalogue, shared by the
  atlas, the material, the placement field, and the biome loader. It is a fifth module the
  plan did not name: the four consumers each needed the same species keys, aspects, wind
  weights, height bands, and macro categories, and duplicating them across layers is exactly
  the drift this codebase gates against elsewhere.
- `src/world/grass/WorldDetailFoliageAtlasFactory.ts` — the Canvas-baked 1024 × 256 atlas.
- `src/world/grass/WorldDetailFoliageMaterial.ts` — one `ShaderMaterial` for the layer.
- `src/world/grass/WorldDetailFoliageField.ts` — placement, residency, and the draw trim.

Measured at the spawn point: 21 resident tiles, 1 890 resident cards, 1 488 drawn, against a
gated worst-case ceiling of 2 070 cards / 22 draws / 12 420 vertices.

### Deviations from the spec above, and why

1. **16 m tiles, not 8 m.** The plan budgeted ≤ 30 extra draws but also 8 m tiles; at 8 m the
   32 m residency disc holds ~73 tiles, so those two numbers cannot both hold. This takes the
   plan's own "merge per 2×2 tiles" escape hatch up front rather than after a trace: culling
   granularity buys nothing for a tile that is ~90 six-vertex cards.
2. **Six-vertex card, not eight.** Two stacked quads sharing their middle row. The shared row
   is what allows the mid-frond bend the plan asked for; duplicating it would cost two more
   vertices for an identical silhouette.
3. **Yaw-only billboard, not a fixed-facing card.** A card anchored to its instance yaw
   vanishes edge-on, which at this density reads as flowers blinking out as the camera turns.
   The card stays upright — it never pitches towards the camera — and rotates about world up
   only, which is the only orientation that avoids both failures.
4. **The atlas's second row is a second silhouette per species**, selected by a per-instance
   variant bit packed beside the species and tint. The plan specified an 8 × 2 layout without
   saying what the second row was for; this is the use that costs nothing.
5. **The governor's accent scale is ramped** like `densityScale`, rather than stepping at the
   tier change. A step would dither half the layer out in one frame at 25 m, which is exactly
   the pop the ramp exists to prevent.
6. **The gate assertion is narrower than the plan's wording.** "The accent material is the
   only grass material containing `discard`" is not achievable: the impostor material already
   discards for its own alpha cutout. What is asserted instead is stronger where it matters —
   the accent material contains *exactly one* `discard`, it is the alpha test, its coverage
   rejection is still a vertex-stage clip, and the near material still contains none.

### Not implemented (deliberate)

- CC0 art fallback: the procedural atlas is the shipped source, and no third-party asset is
  imported, so `THIRD_PARTY_NOTICES.md` is unchanged.
- Accents do not respond to the trail/interaction field. They are outside the reserved
  interaction bounds by construction (`maximumInteractionStrength: 0`), which is what keeps
  their culling bound honest; adding trail bend later means widening that bound with it.
