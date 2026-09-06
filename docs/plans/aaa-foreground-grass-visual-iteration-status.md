# AAA Foreground Grass Visual Iteration Status

Status: complete and visually signed off  
Date: 2026-08-21  
Primary plan: `aaa-foreground-grass-clumping-shape-color-plan.md`

## Plan audit

| Plan item | Current implementation | Status | Evidence / action |
| --- | --- | --- | --- |
| Stable, deterministic clump profiles | Six config-backed archetypes share deterministic tuft identity and placement inputs | Complete | `verify-grass-cluster-profile.mjs`, `verify-grass-placement.mjs` |
| Irregular clump shape and tiered height | Frayed coverage, interior openings, understory/main/accent tiers, aspect and radius variation | Complete | Close meadow, grazing, dry, sparse, and elevated captures |
| Blade-plane coherence without radial starbursts | Tuft direction, radial influence, and independent azimuth are blended | Complete | Close meadow and grazing captures |
| Ground contact and dry colour | Dark roots, bounded dryness mixing, reduced backlight, and subtle tip-only sheen | Complete | Baseline/final contact sheet and deterministic dry-lighting gate |
| Biome-aware distant coverage | Widened sub-pixel blades resolve their own healthy/dry biome canopy colour | Complete | Meadow, dry, sparse, path-edge, and compact captures |
| Viable biome density retention | Climate floors apply before rock and disturbance loss; sparse selection uses relative retention | Complete | Ecology gate and dry/sparse captures |
| Dry versus sparse morphology | Short/dry classification precedes sparse-open fallback | Complete | Iteration 06 dry/sparse before-after sheet |
| 6-10 m normal handoff | Micro trough and segmented normals converge on a wind/trail-aware blade-plane normal, never world-up | Complete | Iteration 06 6/10/14/18/22 m sheet; `glError=NO_ERROR` |
| Geometry handoff width | Existing 1 m transition remains visually continuous after the normal correction | Complete | No widening retained; the 6-22 m ladder shows no abrupt step |
| Performance budget | No density, segment, material, texture-fetch, or draw-call increase | Complete | 144 FPS, 6.94-6.95 ms mean across the handoff ladder |

## Retained corrections

- Biome- and dryness-aware canopy compensation replaced the generic meadow tint on widened blades.
- Climate-density floors prevent viable meadow, dry-steppe, and alpine ground from being globally underfilled while preserving rock, disturbance, path, shore, and stone suppression.
- Sheen strength is 0.035 and is weighted toward blade tips, preventing pale lower-blade bands.
- The normal fade now removes transverse trough and longitudinal segment detail while retaining the blade plane's macro orientation through wind and trail bends.
- `SHORT_DRY` is resolved before `SPARSE_OPEN`, so dry habitat is not routed through the aggressive sparse morphology merely because density is reduced.
- The capture runner uses exact pose matching, waits for stable terrain/stone/grass residency, records telemetry, resolves pose indices by name after HMR, and rejects mismatched captures.

## Rejected experiments

- Raising the minimum sub-pixel blade width from 1.15 to 1.45 did not materially improve the extreme elevated view and was reverted.
- Widening `grassUltraNearTransitionDistance` from 1 m to 2 m was not needed after the macro-normal fix; retaining the shorter band avoids extra overlapping geometry.
- Global density increases were not used because biome retention floors recover viable habitat without filling intentionally open ground.

## Visual and runtime sign-off

The final matrix covers close meadow, gameplay meadow, grazing, path edge, dry habitat, sparse alpine habitat, water edge, elevated view, compact profile, and the 6/10/14/18/22 m handoff ladder. The grass retains dark contact, distinct clump masses, readable fine blades, biome identity, and smooth distance behaviour. A faint pattern remains visible only in the deliberately extreme top-down elevated diagnostic; it is not apparent at gameplay or grazing angles and did not improve under the rejected width experiment.

Objective pale-pixel and luminance measurements are in `qa/aaa-look/foreground-grass/final/visual-metrics.json`. Runtime telemetry is in `performance-report.json` and the per-pose capture reports. GPU timing was unavailable, so the report records CPU/frame/draw telemetry without inventing a GPU number.
