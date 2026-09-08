# WebGPU migration review — 2026-09-07

Reviewed the uncommitted migration checkpoint supplied in the G05 handoff,
including renderer ownership, recovery, optional textures, offscreen work and
the numerical comparison gates. Fixed the reproduced defects below. This is
not approval of the G06 production switch: that work remains incomplete.

## Corrected findings

| Priority | Finding and correction | Regression evidence |
| --- | --- | --- |
| P1 | Water's initially empty depth sampler compiled as a colour texture; the first live depth capture then failed WebGPU bind-group validation. Use a depth-typed placeholder from construction. | `water`: compile without a capture, attach a real captured colour/depth pair, sync and render. |
| P1 | Water refraction sampled portable targets upside down. Convert the bottom-origin GLSL screen coordinate and slope offset to top-origin target UVs together. | Integrated `water` run: WebGL maximum error fell from 179 to 0. |
| P2 | The empty colour texture used nearest filtering, causing WebGPU to compile `textureLoad`; later linear-filtered captures stayed nearest-sampled. Give the placeholder a filterable sampling path. | Integrated `water`: residual WebGPU maximum 85/mean 0.061 fell to 19/0.00363, within the existing surface tolerance. No tolerance was relaxed. |
| P2 | Nulling an optional texture retained the previous, potentially disposed owner texture. Detach to an owned fallback; dispose that fallback exactly once. | `verify-node-port-lifecycle`: detach, reattach and ownership checks. |
| P2 | Refraction capture inherited scissoring and did not restore the original cube face/mip. Use the complete renderer-state scope, with camera-layer restoration outside it. | Injected draw failure restores target, face, mip, layers, scissor and auto-clear. |
| P2 | Async impostor baking held scene visibility/layers across readback and later overwrote newer clear state. Restore borrowed scene/render state before the first await, including partial traversal failure. | Deferred readback rejection checks state while pending and after failure; `bake` compares the atlas on both backends. |
| P2 | Trail backend priming failure left the attached pass allocated. Roll back the failed attachment and dispose it once. | Injected priming failure plus repeated disposal. |
| P1 | Recovery cleanup failure could trigger another release and suppress the UI failure report. Stop after failed cleanup and retain both restart and cleanup errors. | New contract in destination and source tests: two legitimate releases, one failure report containing both errors. |
| P2 | Synchronous loss during recovery capture could start another reconstruction before the pending promise existed. Publish the promise before owner callbacks run. | Nested recovery receives the same promise and starts reconstruction once, in both repositories. |
| P2 | Grass without a directional context skipped the always-on legacy albedo/Lambert mix. Apply the mix in the ambient-only path too. | New real-material `ambient` channel across desktop, compact, island near and island mid: maximum 13 before, exact after, on both backends. |
| P2 | Compact cloud-volume nodes used two noise octaves, while the shipped volume pass uses three. Keep three for volume; preserve two for compact analytic sky/shadows. | `volume compact`: maximum 87/mean about 2.08 before; after, WebGPU is exact and WebGL maximum 5/mean 0.00109, within the unchanged volume tolerance. |

The water/grass/cloud and pass findings are defects in the new destination
ports, not defects in grass-test's shipped effects. Recovery defects affected
the shared utility and were fixed in both repositories. The previous
half-float-only capability fix remains intact and tested on both sides.

Also corrected comparison-harness pixel-ratio restoration and disposed unused
grass comparison uniform bindings. The pre-existing Vite dependency-scan
diagnostic was independently reproduced in `verify-terrain-horizon.mjs` and
removed by disabling browser dependency discovery for that SSR-only verifier;
its assertions are unchanged.

## Verification

- Destination: `rtk npm run build`, including the added lifecycle/recovery checks.
  Final build exits 0 with only the existing bundle-size warning; the former
  dependency-scan error is gone.
- Source: `rtk npm test` (145 tests), `rtk npm run lint`, `rtk npm run build`.
- Browser: all 14 fixtures, desktop and compact, forced WebGPU and forced
  WebGL 2: 28 fixture/profile pairs, 56 backend runs. The expanded grass check
  was rerun after its fix; the failed compact volume check was rerun after its
  fix. Actual backend and absence of browser/GPU errors are asserted.
- Reproduce with Vite bound to `127.0.0.1:5192`, then
  `rtk proxy node scripts/check-renderer-matrix.mjs`. The optional
  `--retry-failed` switch retries failures from the existing local result file.
  Logs/results live under `.shots/renderer-matrix/`; each fixture also keeps
  screenshots and detailed numerical results under `.shots/renderer-harness-*`.
- `git diff --check` passes in both repositories.

These are shader/pass fixtures and injected lifecycle failures. They do not
prove complete-world performance, hardware coverage or playable-world recovery.

## Why the G tasks are not ready to commit

The regenerated inventory has 22 pending locations, 93 ported/comparison-gated
locations, 6 exemptions and 95 development comparison locations. A ported entry
means a counterpart and named check exist; it does not mean production uses it.

The remaining acceptance work includes:

1. ~~Wire `WorldApp` and `IslandApp` to initialized node sessions and portable
   material/pass factories.~~ Done. Both apps run on a `RendererSession` created
   by the bootstrap, every material is its node counterpart, the cloud-shadow
   scene integrator is replaced by construction-time injection through one
   `WorldNodeMaterialContext`, and the actor call sites are converted.
2. ~~Replace production `GpuFrameTimer` consumers with `GpuTimingAdapter`, and
   migrate remaining stats, workload and diagnostics contexts. Replace the
   legacy string-based stone shader performance check with a node equivalent.~~
   Done. `createFrameTimingSource` picks the mechanism by backend and is held by
   `verify-gpu-timing-parity.mjs`, which found and fixed a p95 disagreement
   between the two timers. The workload probe, diagnostics controller and visual
   matrix context no longer name a renderer class; the stats panel declines a
   renderer stats-gl cannot patch; the stone check now reads the generated
   program. See the 2026-09-07 entry in `grass-test-integration-progress.md`.
3. ~~Add numerical coverage for directional grass transmission/sheen and stone
   custom lighting.~~ Done. The grass `directional` and stone `lit` modes now
   compare those terms; the grass run found and held a real defect, an assigned
   `normalNode` never receiving the double-sided `faceDirection` flip. See the
   2026-09-07 entry in `grass-test-integration-progress.md`.
4. ~~Complete G06's actual world/island backend/fallback/recovery/resize/BFCache
   matrix and matched performance measurements.~~ Done for the two shipped
   backends: `check-renderer-matrix.mjs` runs 13 checks and all pass. The third
   baseline (the pre-migration `WebGLRenderer`) has to be measured from the
   archived revision recorded below rather than from this tree, which no longer
   contains that route.
5. ~~Remove reachable legacy production shader routes.~~ Done. No legacy
   shader route is reachable from production and none of its text reaches a
   bundle; `verify-built-site.mjs` fails if one returns. The stabilized
   revisions still need recording in both repositories.

All five items are closed. What remains before the G tickets can be called
finished is bookkeeping rather than engineering: recording the stabilized
revision in both repositories, and measuring the pre-migration WebGLRenderer
baseline from the archived revision for the three-way performance comparison. No commit or deployment has been made.
