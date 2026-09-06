# Stone reference match: closing the gap to a weathered boulder formation

## Status

- Target branch: `main`
- Status: **phases 0-6 landed; meaningful-corner measurement added before any ring-count rewrite**
- Baseline: `06e5174`
- Scope: stone body massing, formation fracture, ground integration, dry sheen, palette, macro mineral zoning
- Renderer: no new materials, textures, draws, or runtime dependencies
- Judged with: `npm run shots:stones`, `scripts/diagnose-stone-shape.mjs`, `scripts/diagnose-stone-shading.mjs`

## Why

A reference-image review proposed silhouette penalties, sector-specific massing, dominant
planes, fracture splitting, mineral zoning, contact cleanup and selective growth. The
instrumentation repeatedly showed that the largest visual defects were not where the first
intuition put them. This plan records measurements rather than preserving hypotheses that
were already disproved.

## Defects found by instrumenting

**The art-direction scorer judged a body that never ships.** `scoreStoneShape` originally
read the unit polyhedron even though `generateStoneMesh` applies lean shear and anisotropic
scale after clipping. The scorer now evaluates that shipped transform, and the verification
contains an explicit regression proving a transform-only recipe change moves the score.

**Boundary healing perturbed the mated-fragment rim.** `healBoundaryGaps` once selected
representatives according to face-list insertion order, which differs between the two
halves. Fracture points are pinned and the existing formation gate checks both outlines.

**Probe grain creation disagreed with production.** The gallery used to create the grain
texture only when albedo grain was enabled, while production correctly enables it when
albedo *or normal* grain is non-zero. The probe now uses the production condition.

## What the measurements corrected

| Hypothesis | Measured |
| --- | --- |
| Edge chamfers round the silhouette | Removing all 12.2 `edge-bevel` planes moves the score 0.005 |
| Sector count is the dome | 8-10 -> 5-7 moved silhouette -0.162 -> -0.150 only |
| Concavity clamp suppresses the massing | Relaxing it moved nothing on its own |
| Something makes a hard tonal band | No step in any baked channel; the belt was `heightShade` ramping over 0.6 of body height |

The original silhouette diagnostic reported about **21 raw hull corners per view**, with
circularity dominating the score. Raw hull count is now treated only as a source metric:
`StoneSilhouetteQuality.measureStoneSilhouetteComplexity` collapses projected points whose
removal changes the outline by <=1% of that view's perimeter and reports **raw -> meaningful**
corners. Ring-count changes are intentionally gated on that number instead of on topology
alone.

`MAJOR_SHARE` was **not** widened. A wider range had already been tried and reverted because
it left the minor fragment as a thin wedge instead of a companion mass.

## Landed changes

**Massing** (`StoneRecipe.ts`, `StoneProfile.ts`) -- fewer sectors, flatter belly, broad
tilted crown, stronger asymmetric lean and family-specific profile controls. The scorer
selects against radial regularity on the transformed body that actually renders.

**Fracture** (`StoneFormation.ts`, `StoneClusterTuning.ts`, `StoneClipper.ts`) -- broader
viable fracture tilt, readable crack width, larger minimum structural cut, pinned mated rim,
and complementary fragments instead of duplicated nearby stones.

**Tone** (`StoneVertexShading.ts`, `StoneGeometryTuning.ts`) -- shallow contact-only height
shade plus downward-tone compression, removing the painted dark lower belt.

**Macro mineral zoning** (`StoneVertexShading.ts`, `StoneGeometry.ts`, `StonePalette.ts`) --
mineral identity is now its own body-relative 3D signal instead of being encoded inside
weathering. Two low-frequency fields produce a handful of cross-facet regions and blend the
palette toward pale mineral or iron-rich mineral endpoints. Weathering is independently
weaker and driven by local exposure/noise/contact rather than a broad height climb.

Split fragments sample the mineral field in their original parent coordinates even though
each pooled mesh is re-centred on its own contact polygon. `StoneFormationVerification`
checks matched rim vertices so a mated formation cannot silently acquire a color jump at
the crack.

**Formation weathering parity** (`StoneRenderInstanceWriter.ts`, `StonePalette.ts`) -- the
formation-wide weathering bias now affects baked vertex color as well as the close shader's
packed weathering channel, so near and coarse representations no longer age differently.

**Material** (`StoneGrowthShader.ts`, `world.yaml`) -- broad weak dry sheen plus subtle
normal grain; albedo grain remains zero. The measured-inert widened sky-side fill experiment
was reverted to its conservative baseline rather than kept as unexplained shader energy.

**Ground** (`StoneRecipe.ts`) -- deeper boulder embed, with existing clearance/skirt ecology
left as the single ground-integration system.

**Probe and diagnostics** -- the gallery consumes the same mineral array as production;
`diagnose-stone-shading.mjs` reports mineral and weathering separately; the silhouette gate
prints raw -> meaningful corner counts but does not impose an uncalibrated threshold.
`StoneRuntimeVerification` now checks mineral, weathering and cavity stream sizes and ranges.

## Current budgets

The last measured bodies were ~341 verts / 276 tris against budgets of 1500 / 1000, with
49 desktop draws. Geometry density is not the constraint; visible plane placement and
material organization are.

## Next decision points

1. **Run the updated diagnostics locally.** The material pass should show mineral means no
   longer tracking height in lockstep with weathering. Gallery/world captures decide whether
   `STONE_MINERAL_COLOR_STRENGTH` and region ratios need tuning.
2. **Read meaningful, not raw, silhouette corners.** If boulders remain materially above the
   reference's ~6-9 visible turns after simplification, introduce per-archetype profile ring
   counts. If they simplify near that range already, do not pay structural churn for hidden
   vertices.
3. **Shaded flank lift remains a world-lighting decision.** Sun 4.15 against hemisphere 0.34
   leaves too little fill for stone-local sky-side ramps to materially raise a shadowed face.
   Do not fake that with emissive-looking stone albedo.
