# T05 implementation checkpoint

Recorded: 2026-09-09

## Revision

- Runtime-acceptance head: `59f31b824c08f021cf49f490a100798b67784166`
- Deployment: not requested and not performed.

## Implementation status

T05 is accepted at code, precipitation-contract, local-build and browser/backend level on this machine. T06 has not started.

Shipped behaviour matching the ticket:

- Seeded instanced rain streaks in one pooled `world-rain` batch, node material, depth test on / depth write off, ordinary instanced draws on both backends.
- Local 32×32 m volume, 0.2–24 m above a conservative ground/water cache, shared weather clock, wind-driven tilt/drift, teleport recenter without a world-wide streak sweep.
- Intensity eases toward the preset with a 0.55 s constant; zero rain hides the mesh and sets instance count to 0. Desktop capacity 4000, compact 1000.
- Wetness eases with 8 s wetting / 45 s drying, at most 12% diffuse darkening and roughness floor 0.25, through `WorldNodeMaterialContext` rather than `onBeforeCompile`.
- Bounded hydrology-validated water-contact field (16 desktop / 8 compact), distinct from stone wakes. Rain itself uses a cheap procedural ripple normal; foot/landing impulses remain T06.
- No global rain water plane. Existing flow, foam, cascades, bed and refraction stay authoritative.

## Verification executed 2026-09-09

Correctness gates were already green on this head (`npm run test:world-precipitation` is part of `npm run build`). This checkpoint is the remaining visual pass. `test:wind-cost` was not rerun.

Interactive world: `http://localhost:5173/` (Vite label `v0.9.6+b425715f0c2c`). QA bypass + fly + visual-matrix poses, weather hook, and live `world-rain` mesh inspection.

- Dry Highfield meadow, then Greyrain: rain mesh 4000 and visible; fog/overcast; modest surface darkening.
- River grazing showed local pale streaks; lake top-down showed extra concentric ripple detail on existing water.
- Hillside pose after a ~400 m teleport kept rain at 4000 / visible.
- 42 m look-down showed local fogged meadow, not a world-wide water plane.
- Greyrain → Highfield: rain count eased then hid (`visible=false`, `count=0`). Waterfall and stone-wake optics remained; inland stones were not globally wet.
- Compact WebGPU: rain count 1000, visible.
- Forced WebGL 2: `data-renderer=webgl2`, rain 4000 while rainy and hidden while sunny; 0 page errors.

Frame times while raining stayed interactive (typically 55–144 FPS in fly). No rain-pass performance problem was observed that would justify `test:wind-cost`.

## Next ticket

T06 may start. T06 is complete environmental audio with procedural foot contacts. Deployment is still not requested.
