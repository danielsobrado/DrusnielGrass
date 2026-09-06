# AAA Foreground Grass Completion Status

Status: implementation complete; runtime visual sign-off complete  
Date: 2026-08-21  
Companion plan: `aaa-foreground-grass-clumping-shape-color-plan.md`

## Implemented

The foreground grass implementation now includes:

- config-backed clump radius, aspect, directional balance, blade-plane coherence, edge coverage, tier shares, tier heights, and blade-height jitter;
- a focused allocation-free `GrassClusterProfile` resolver with constants separated into `GrassClusterProfileTuning`;
- distinct dense, sparse, tall/wet, short/dry, flattened, and accent morphologies;
- continuous frayed clump edges and archetype-specific interior openings rather than a repeated hard circular hole;
- stable clump-level blade-plane orientation mixed with per-blade azimuth diversity;
- flattened clumps bias their stable rest lean toward the configured maximum rather than relying on a multiplier that weakens low-lean clumps;
- config-backed understory/main/accent tiering in the near field and the shared mid/far blade source;
- reduced per-blade height, canopy-AO, and dryness noise so clump identity dominates micro variation;
- placement cache version 9 for the changed stable transforms and morphology;
- the earlier dry-palette, root-grounding, blade-shape, and backlight tuning;
- deterministic dry-lighting and clump-morphology guards wired into the normal build verification chain.

## Performance constraints preserved

The pass does not increase configured blade density, grass segment count, ultra-near radius, material count, or draw calls. New morphology work runs while tiles are built and reuses existing per-instance channels; it adds no per-frame clump allocation and no new fragment texture fetch.

## Verification state

Static/source contracts cover configuration bounds, tier relationships, deterministic placement, clump morphology relationships, absolute flattened-rest lean, near-to-mid/far tier-source parity, placement-cache versioning, dry-palette limits, dryness-aware transmission, and the absence of final-output luminance clamps.

A local production build, runtime performance capture, and before/after visual-matrix pass are complete. The signed-off matrix covers meadow, dry, sparse, path-edge, water-edge, low-camera, compact, elevated, and the 6/10/14/18/22 m handoff ladder. See `aaa-foreground-grass-visual-iteration-status.md` for the plan audit and `qa/aaa-look/foreground-grass/final/` for the evidence bundle.
