# Procedural Stylized Stones — Implementation Plan

## Status

- Target branch: `main`
- Scope: planning and implementation contract
- Current state: completed — all phases 1 through 10 implemented, integrated with world chunk streaming, collision/foot placement, and fully verified by automated build gates (`verify-stones.mjs`, `verify-navigation.mjs`)
- Goal: generate large families of art-directed procedural stones with the same shape language, surface detail, and stylized rendering characteristics as the approved references, without reproducing any individual stone pixel-for-pixel.

## Product goal

Build a deterministic procedural stone system that produces game-ready stones with:

- Strong, readable silhouettes.
- Large planar or gently curved faces.
- Controlled low-poly faceting.
- Stable flattened bases.
- Broad, deliberate cuts instead of noisy displacement.
- Stylized grooves, highlight bands, cavities, and face colour regions.
- Consistent appearance across archetypes, biomes, lighting conditions, and LOD levels.
- Efficient caching, instancing, streaming, and rendering for large worlds.

The system must be procedural but art-directed. It must not behave as an unrestricted random rock generator.

## Visual contract

### Required shape language

Generated stones should use combinations of these traits:

- Squashed, tapered, leaning, stepped, wedged, slab-like, block-like, shard-like, or rounded primary masses.
- A limited number of large faces.
- Asymmetric silhouettes with clear mass and balance.
- One dominant form with optional secondary cuts or attached forms.
- Deliberate top planes, side planes, cut faces, recessed faces, and ridges.
- Ground contact that looks stable and intentional.

### Required surface language

Surface treatment should favour:

- Two to five broad colour values per stone.
- Top-facing highlights.
- Darker cut faces and cavities.
- Large directional streaks or bands.
- Sparse stylized cracks or grooves.
- Low-frequency variation only.
- Minimal or no photographic texture noise.

### Prohibited results

The generator must reject or prevent:

- Uniformly noise-displaced spheres.
- Crystalline forms unless explicitly requested by an archetype.
- Excessive micro-faceting.
- Thin unsupported shelves.
- Concave or floating undersides.
- Tiny triangles and fragmented faces.
- Accidental symmetry.
- Unstable contact areas.
- Self-intersections or inverted geometry.
- LODs that change the apparent stone identity.

## Architectural principles

1. **Archetype first** — use multiple controlled generators rather than one universal random function.
2. **Deterministic seeds** — the same recipe and seed must reproduce the same stone.
3. **Separate concerns** — shape, semantic regions, material styling, placement, and LOD remain independent systems.
4. **Shared recipe across LODs** — every representation derives from the same primary planes and parameters.
5. **Bounded randomness** — each parameter uses curated ranges and correlations.
6. **Reject bad outputs** — validation is part of generation, not a later manual cleanup step.
7. **Cache and instance** — avoid generating or uploading duplicate meshes at runtime.
8. **Configuration driven** — tuning belongs in validated YAML rather than hardcoded gameplay code.

## Proposed high-level pipeline

1. Select a stone archetype and style preset.
2. Resolve a deterministic recipe from the seed.
3. Build a coarse primary volume.
4. Apply directional scale, taper, lean, and asymmetry.
5. Flatten and shape the ground contact region.
6. Apply a small number of controlled clipping planes or shape operations.
7. Add optional secondary cuts, steps, grooves, or attached masses.
8. Clean topology and validate geometry.
9. Identify semantic faces and regions.
10. Generate vertex colours and shader masks.
11. Build LODs from the same recipe.
12. Cache the generated asset and render it through instancing or batching.

## Initial archetype library

The first production library should include these archetypes:

1. Rounded boulder.
2. Squashed pebble.
3. Flat ground stone.
4. Broad slab.
5. Rectangular weathered block.
6. Tapered block.
7. Wedge.
8. Leaning shard.
9. Tall monolith.
10. Triangular peak.
11. Stepped shelf rock.
12. Broken block.
13. Embedded ground rock.
14. Broad platform rock.
15. Tapered pillar.
16. Two-stone cluster.
17. Primary rock with attached fragment.
18. Small grouped scatter cluster.

Each archetype must define:

- Allowed aspect-ratio ranges.
- Height and footprint distributions.
- Taper and lean limits.
- Primary cut directions.
- Maximum secondary cut count.
- Corner softness.
- Contact-area constraints.
- Allowed detail types.
- LOD silhouette priorities.

## Phase 0 — Reference contract and baseline harness

### Goal

Create an objective visual and technical baseline before production geometry is implemented.

### Work

- [ ] Define the visual contract in code-facing terms.
- [ ] Create a fixed reference gallery covering the required silhouette families.
- [ ] Define standard preview lighting, camera angles, scale markers, and backgrounds.
- [ ] Create deterministic preview seeds for every archetype.
- [ ] Add a stone gallery or isolated look-development scene.
- [ ] Record baseline frame time, draw calls, triangle counts, generation time, and memory.
- [ ] Define asset budgets for hero, common, small, and distant stones.
- [ ] Define supported rendering backends and minimum device class.
- [ ] Document non-goals and out-of-scope realism features.

### Deliverables

- Reference matrix by archetype.
- Fixed seed set.
- Preview harness.
- Initial geometry and rendering budgets.
- Visual acceptance checklist.

### Exit criteria

- The same camera and lighting setup can compare every later phase.
- Performance metrics can be captured deterministically.
- Every required stone family has at least one approved silhouette target.

## Phase 1 — Deterministic core geometry

### Goal

Implement a stable base generator that produces clean, grounded low-poly volumes without surface decoration.

### Work

- [ ] Add a deterministic seeded random source dedicated to stone recipes.
- [ ] Define the common stone recipe schema.
- [ ] Generate a coarse convex primary volume.
- [ ] Support directional scale, taper, lean, skew, and bounded asymmetry.
- [ ] Flatten and reshape the underside for terrain contact.
- [ ] Add controlled clipping-plane operations.
- [ ] Preserve large faces while removing tiny or degenerate faces.
- [ ] Generate flat, weighted, or selectively smoothed normals.
- [ ] Add topology validation and generation retry limits.
- [ ] Add deterministic geometry unit tests.

### Technical notes

Pure vertex noise is not the primary shape mechanism. Large planes should come from clipping, half-space intersection, low-resolution SDF extraction, or another operation that creates intentional broad faces.

The first implementation should prefer the simplest reliable representation. Do not introduce a general-purpose runtime CSG framework unless the limited clipping approach proves insufficient.

### Exit criteria

- Repeated generation with the same seed is byte-stable or geometrically equivalent.
- Stones have valid indices, normals, bounds, and non-zero ground contact.
- No output contains inverted faces, invalid values, or tiny disconnected islands.
- The base generator already looks intentionally shaped without material detail.

## Phase 2 — Archetype shape grammar

### Goal

Replace generic variation with recognisable, art-directed stone families.

### Work

- [ ] Implement the first archetype set.
- [ ] Give each archetype an explicit parameter schema and curated ranges.
- [ ] Correlate parameters so random values remain visually plausible.
- [ ] Add primary and secondary cut templates.
- [ ] Add optional stepped, split, recessed, and attached-mass operations.
- [ ] Add silhouette scoring and archetype-specific validation.
- [ ] Add weighted archetype selection by environment preset.
- [ ] Produce gallery captures for the fixed seed set.

### Suggested parameter groups

- Primary dimensions.
- Footprint shape.
- Vertical profile.
- Taper.
- Lean direction and strength.
- Dominant ridge direction.
- Cut count, angle, depth, and position.
- Corner treatment.
- Secondary mass probability.
- Embed depth.

### Exit criteria

- A reviewer can identify each archetype from silhouette alone.
- Random seeds remain within the intended family.
- At least 80% of generated candidates pass without retries for each production archetype.
- The complete gallery resembles one coherent asset set rather than unrelated generators.

## Phase 3 — Semantic regions and geometric details

### Goal

Identify meaningful surfaces and add sparse, deliberate secondary detail.

### Work

- [ ] Classify top, side, underside, cut, recessed, ridge, and contact faces.
- [ ] Store semantic data as face metadata, vertex attributes, or generated masks.
- [ ] Add broad grooves and directional channels.
- [ ] Add optional stylized cracks with strict count and scale limits.
- [ ] Add shallow recesses and edge notches where appropriate.
- [ ] Add archetype-specific detail templates.
- [ ] Ensure details never create high-frequency silhouette noise.
- [ ] Validate details against minimum feature sizes for every LOD.

### Implementation rule

Most visual bands and streaks should not become geometry. Geometry is reserved for details that materially affect silhouette, occlusion, or close-range parallax.

### Exit criteria

- Semantic regions remain stable across generated LODs.
- Details reinforce the primary form instead of obscuring it.
- No detail creates tiny triangles or expensive topology growth.
- Close-range stones show clear intentional planes, cuts, and sparse accents.

## Phase 4 — Stylized material and colour system

### Goal

Match the illustrated visual style using procedural colour regions and controlled lighting response.

### Work

- [ ] Define palette presets such as slate, limestone, sandstone, volcanic, moss-tinted, mineral-blue, and fantasy variants.
- [ ] Generate base, top, side, cut, cavity, and accent colours from each palette.
- [ ] Add per-face or per-vertex colour variation.
- [ ] Add broad highlight bands and darker channels from semantic masks.
- [ ] Add optional sparse streaks and graphic cracks.
- [ ] Implement a stylized diffuse ramp or controlled light quantisation.
- [ ] Add cavity and contact darkening without excessive baked-looking AO.
- [ ] Keep metallic response at zero unless a dedicated mineral preset requires otherwise.
- [ ] Keep roughness high and bounded.
- [ ] Verify appearance under the world renderer, fog, shadows, and tone mapping.

### Material requirements

- Large readable values must survive at gameplay distance.
- Colour must not rely on high-resolution unique textures.
- Generated vertex data and shared lookup textures are preferred.
- Lighting must not destroy the authored colour hierarchy.
- Palette variation must preserve cohesion within a biome.

### Exit criteria

- Stones retain the approved style in neutral preview lighting and production lighting.
- Broad colour regions remain readable at middle distance.
- No texture swimming or world-origin precision issues are visible.
- Palette presets can be changed without regenerating topology.

## Phase 5 — Quality control and rejection system

### Goal

Prevent bad procedural outputs from reaching runtime or baked asset libraries.

### Work

- [ ] Calculate contact-area ratio and centre-of-mass plausibility.
- [ ] Detect excessive thinness and unsupported overhangs.
- [ ] Detect self-intersection, non-manifold edges, and disconnected fragments.
- [ ] Reject tiny faces and extreme edge-length ratios.
- [ ] Measure silhouette complexity from standard views.
- [ ] Detect accidental symmetry where the archetype requires asymmetry.
- [ ] Detect excessive concavity on the underside.
- [ ] Add bounded retries with deterministic fallback recipes.
- [ ] Emit structured diagnostics for rejected candidates.
- [ ] Add a batch generation audit report.

### Exit criteria

- Runtime never loops indefinitely while searching for a valid result.
- Every failed recipe has a deterministic fallback.
- Batch audits identify failure reason and archetype.
- Approved presets remain within configured rejection-rate limits.

## Phase 6 — LOD generation and visual continuity

### Goal

Keep each stone visually identifiable while reducing cost with distance.

### LOD model

- **LOD0:** primary form, all major cuts, selected geometric details, full semantic masks.
- **LOD1:** primary form, major cuts, reduced secondary geometry, full silhouette character.
- **LOD2:** silhouette and dominant planes only, simplified material masks.
- **LOD3:** very low-poly proxy, cluster proxy, or baked impostor depending on use case.

### Work

- [ ] Generate all LODs from the same recipe and primary plane definitions.
- [ ] Assign per-archetype silhouette preservation priorities.
- [ ] Preserve footprint, height, lean, dominant ridges, and largest cuts.
- [ ] Simplify or remove details by semantic priority rather than triangle count alone.
- [ ] Maintain compatible bounds and ground contact.
- [ ] Add dithered or otherwise stable LOD transitions.
- [ ] Add shadow LOD policy.
- [ ] Add optional impostor baking for distant hero rocks or dense clusters.
- [ ] Add visual delta captures at transition distances.

### Exit criteria

- No visible identity swap occurs during LOD transitions.
- Ground contact does not move between LODs.
- Dominant silhouette points remain stable.
- Lighting and palette remain visually compatible across representations.

## Phase 7 — World placement, terrain integration, and biome presets

### Goal

Place stones in believable groups without repetition, floating, clipping, or biome mismatch.

### Work

- [ ] Define biome-specific archetype and palette weights.
- [ ] Add terrain slope, elevation, moisture, coast, river, path, and substrate rules.
- [ ] Align or partially align stones to terrain normals based on archetype.
- [ ] Add configurable embed depth and contact blending.
- [ ] Prevent placement in invalid gameplay or construction zones.
- [ ] Add isolated, paired, clustered, scree, outcrop, and landmark distribution modes.
- [ ] Correlate nearby stones by geology preset, palette, and dominant direction.
- [ ] Add deterministic chunk-based placement.
- [ ] Add origin-rebasing and streaming compatibility.
- [ ] Add collision policy by size and gameplay relevance.

### Placement principles

- Small stones may align more strongly to terrain.
- Tall stones and monoliths should preserve intentional vertical character.
- Clusters should share a geological direction and palette family.
- Embed depth should hide flat undersides without burying the silhouette.
- Distribution must avoid obvious uniform spacing and repeated rotations.

### Exit criteria

- No visible floating stones appear across the QA seed set.
- Chunk boundaries do not change placement or duplicate instances.
- Biomes produce distinct but coherent stone populations.
- Placement remains deterministic after streaming out and back in.

## Phase 8 — Runtime performance, caching, and instancing

### Goal

Support large stone populations without unnecessary generation, memory, or draw-call cost.

### Work

- [ ] Define a canonical cache key from generator version, recipe, archetype, style, and LOD.
- [ ] Cache generated geometry and material variants.
- [ ] Instance identical meshes wherever practical.
- [ ] Group palette and shader variants to limit material count.
- [ ] Add generation queues and per-frame work budgets.
- [ ] Support pre-baked libraries for common seeds.
- [ ] Release unused chunk assets safely.
- [ ] Track triangles, instances, draw calls, generation time, cache hits, and memory.
- [ ] Add distance and screen-size culling.
- [ ] Add cluster proxies where large small-stone fields would otherwise be expensive.

### Exit criteria

- Generation work does not create visible frame hitches within the target streaming budget.
- Repeated recipes reuse cache entries.
- Draw calls scale primarily with material and archetype batches, not instance count.
- Performance remains inside the Phase 0 budgets on target devices.

## Phase 9 — Authoring, debugging, and tuning tools

### Goal

Make the procedural system inspectable and practical to tune.

### Work

- [ ] Add a stone bench or gallery with archetype, seed, palette, and LOD controls.
- [ ] Show the resolved recipe and validation scores.
- [ ] Visualise semantic regions and face classifications.
- [ ] Visualise ground contact, bounds, centre, and collision shape.
- [ ] Add regenerate, lock seed, copy recipe, and export preset actions.
- [ ] Add batch contact sheets for fixed seed ranges.
- [ ] Add side-by-side LOD comparison.
- [ ] Add performance diagnostics.
- [ ] Add configuration validation with actionable errors.

### Exit criteria

- An artist or developer can reproduce any reported stone from its seed and preset.
- Bad outputs can be diagnosed without stepping through generator internals.
- Archetype and palette tuning does not require source-code edits.

## Phase 10 — QA, rollout, and production hardening

### Goal

Prove visual quality, determinism, stability, and performance before replacing or expanding existing stone content.

### Work

- [ ] Add unit tests for recipes, geometry validity, classification, and fallback behaviour.
- [ ] Add deterministic snapshot tests for selected geometry metrics.
- [ ] Add visual regression captures for fixed seeds and camera poses.
- [ ] Add LOD transition captures and movement tests.
- [ ] Add batch fuzz testing across archetypes and parameter boundaries.
- [ ] Add streaming and floating-origin tests.
- [ ] Add performance-envelope tests.
- [ ] Add configuration migration/versioning tests.
- [ ] Roll out behind a configuration flag.
- [ ] Compare procedural populations against the existing world baseline.
- [ ] Enable biome by biome after visual approval.

### Exit criteria

- No blocker geometry failures occur in the approved fuzz-test range.
- Fixed seeds remain deterministic across supported builds.
- Visual regressions are reviewed and intentional.
- Performance tests pass on the defined target devices.
- Rollback remains possible through configuration.

## Configuration model

Stone generation should be configured through validated YAML. Exact file names may follow the repository's existing configuration conventions, but the model should separate:

- Global generation limits.
- Archetype definitions.
- Style and palette presets.
- LOD policy.
- Biome selection weights.
- Placement rules.
- Runtime budgets.
- QA seed sets.

Example structure:

```yaml
version: 1

generation:
  maxRetries: 4
  minContactRatio: 0.18
  minFaceArea: 0.002

lod:
  lod0Distance: 18
  lod1Distance: 48
  lod2Distance: 110
  impostorDistance: 220
  transitionDistance: 6

runtime:
  generationBudgetMs: 1.5
  maxCachedMeshes: 512

biomes:
  coast:
    palettes: [limestone, sandstone]
    archetypes: [flat-ground, rounded-boulder, broad-slab]
```

All values require schema validation, bounded ranges, duplicate-key rejection, and cross-field validation.

## Suggested module boundaries

The final source layout should remain small and responsibility-focused. A possible structure is:

```text
src/world/stones/
  StoneSystem.ts
  StoneConfig.ts
  StoneConfigLoader.ts
  StoneRecipe.ts
  StoneRecipeFactory.ts
  StoneGeometryGenerator.ts
  StoneGeometryValidator.ts
  StoneSemanticClassifier.ts
  StoneMaterialFactory.ts
  StoneLodFactory.ts
  StoneAssetCache.ts
  StonePlacement.ts
  StoneDiagnostics.ts

src/world/stones/archetypes/
  StoneArchetype.ts
  RoundedBoulderArchetype.ts
  FlatSlabArchetype.ts
  WedgeArchetype.ts
  MonolithArchetype.ts
  SteppedRockArchetype.ts
  StoneClusterArchetype.ts

public/config/
  stones.yaml
```

This is a planning boundary, not a requirement to create every listed file immediately. Files should only be added when their responsibility exists.

## Testing strategy

### Unit tests

- Seed determinism.
- Parameter range enforcement.
- Recipe fallback.
- Geometry validity.
- Stable bounds and contact area.
- Semantic face classification.
- LOD recipe consistency.
- Cache-key stability.

### Batch tests

- Thousands of seeds per archetype.
- Boundary values for every parameter.
- Rejection-rate reporting.
- Triangle and memory distribution reports.
- Duplicate cache-key detection.

### Visual tests

- Standard turntable views.
- Top, side, and low-angle silhouettes.
- Neutral and production lighting.
- All LODs at transition distances.
- Biome population views.
- Contact and embed-depth checks.

### Performance tests

- Cold generation time.
- Cached generation time.
- Main-thread cost.
- GPU upload cost.
- Draw calls and instance counts.
- Streaming churn.
- Memory after repeated chunk traversal.

## Initial performance budgets

Exact numbers must be validated in Phase 0. Until then, use these as provisional guardrails rather than final requirements:

| Asset class | LOD0 target | LOD1 target | LOD2 target | Typical use |
| --- | ---: | ---: | ---: | --- |
| Small stone | 24–80 triangles | 16–40 | 8–20 | Dense scatter |
| Common stone | 80–240 triangles | 40–120 | 16–48 | General world placement |
| Large rock | 200–600 triangles | 100–280 | 32–100 | Outcrops and landmarks |
| Hero formation | 500–1,500 triangles | 220–700 | 80–240 | Close focal content |

The generator should prioritise silhouette quality over hitting the bottom of a range. Dense scatter counts, not isolated hero stones, will determine the strictest runtime limits.

## Risks and mitigations

### Risk: outputs look generic

Mitigation: archetype-specific shape grammar, correlated parameters, fixed visual references, and rejection scoring.

### Risk: excessive procedural complexity

Mitigation: begin with plane clipping and simple deterministic operations; add SDF or broader CSG only when a documented archetype cannot be represented cleanly.

### Risk: stylized detail disappears in production lighting

Mitigation: preserve authored colour regions in the material model and verify in the full renderer from Phase 4 onward.

### Risk: LODs appear to be different rocks

Mitigation: derive every LOD from the same recipe and preserve semantic silhouette priorities.

### Risk: too many unique meshes

Mitigation: curated seed libraries, cache keys, instancing, palette batching, and cluster proxies.

### Risk: bad outputs appear rarely in the world

Mitigation: deterministic fuzz testing, geometry validation, bounded retries, and guaranteed fallback recipes.

### Risk: stones float or clip on terrain

Mitigation: explicit contact-region generation, embed rules, terrain-aware placement, and contact QA overlays.

## Definition of done

The procedural stone system is complete when:

- It produces all approved archetype families from deterministic seeds.
- The gallery reads as a coherent stylized asset set.
- Shapes use broad intentional planes rather than generic surface noise.
- Semantic surface details match the approved graphic style.
- Stones remain visually consistent across LODs and lighting conditions.
- Invalid outputs are rejected or replaced deterministically.
- Placement is stable across streaming, terrain variation, and floating-origin movement.
- Runtime budgets pass on the agreed target devices.
- The system is configurable, testable, inspectable, and safe to roll back.

## Recommended implementation order

Execute the phases in order. Do not begin biome-scale population or optimisation before the core archetypes pass the gallery review. The critical quality gates are:

1. Phase 1 geometry stability.
2. Phase 2 silhouette quality.
3. Phase 4 material style.
4. Phase 6 LOD identity preservation.
5. Phase 8 production performance.

A fast generic noise-rock implementation would create throwaway work and should not be used as the production foundation.
