# T04 implementation checkpoint

Recorded: 2026-09-09

## Revision

- Pre-T04 base: `71d2fcc6c316a1ffed862e9e1e99c66ac2b04604`
- First T04 checkpoint head: `ed44b660da327a80659a5374083dd713a227015f`
- Follow-up review head: `6cf6ae7d4bc66118f2a595ef681ecf4ae4e3d6f6`
- Runtime-acceptance head: `28dc0bf4c86688933caac89d5bcf54218ca3425f`
- Deployment: not requested and not performed.

## Implementation status

T04 is accepted at code, static-contract, local-build and browser/backend level on this machine. T05 has not started.

Implemented:

- Source-style iris transition with per-key request coalescing, reduced-motion cuts, 0.45 s close / 0.6 s open timing, 120 vmax radius and power4-in-out easing.
- Truthful startup presentation over the existing `WorldRevealController`, retaining hero-ring readiness and the bounded degraded-start timeout.
- Start gate with saved sound preference, QA/capture click bypass and session-local silent automation behavior.
- Start acceptance is page-lifetime state: renderer recovery before first entry still gates, while recovery after entry keeps truthful loading readiness without asking for a second click.
- Ordinary-user Scene Settings panel for weather, live wind gain, wind simulation speed, render scale, grass interaction, horizontal movement inversion and sound preference.
- Explicit unavailable states for T09/T10/T11/T12/T13 controls rather than dead buttons.
- Stored weather precedence: explicit valid URL > stored preference > built-in default.
- Explicit grass interaction enable/disable lifecycle without stopping trail recovery.
- Renderer-recovery UI detach/rebind ownership.
- Runtime capability reporting so disposed weather and legacy wind disable only controls that cannot apply.
- Weather selector rollback and wind/speed resync after rejected optional-owner commands.
- Startup/Settings modal isolation: Settings is hidden for the Start-gate lifetime and any pre-host open Settings panel is closed before the gate claims input.
- Settings Escape handling works from select/range/checkbox focus.
- Minimap modal isolation: Settings/Start disable the global M shortcut and close an already-open map; closing the modal restores map availability without reopening it.
- HUD minimization closes Settings before hiding its DOM.
- Transactional Start-gate rollback records modal ownership before publication and continues cleanup if modal release itself reports a failure.
- Automated production-world renderer captures, renderer-matrix runs, bootstrap recovery and the wind-cost benchmark explicitly bypass the interactive Start gate. The visual-matrix capture path already uses `qa=visual-matrix` and therefore already bypasses it.
- Bootstrap-recovery mocks expose the same narrow T04 experience-panel/reveal façade that production bootstrap now consumes.
- Focused `scripts/verify-world-experience-ui.mjs` is included in `npm run build` and covers the contracts above.
- Existing `scripts/verify-runtime-ui-input.mjs` remains compatible with the new UI owner.
- `WorldApp` remains below the architecture limit and preserves the single shared terrain/stone/grass streaming deadline.

## Review fixes made after the first T04 implementation

The review found and fixed these concrete defects:

1. The old runtime-UI verifier still asserted deleted HUD DOM ownership.
2. Grass streaming formatting no longer matched the architecture gate's shared-deadline assertion.
3. QA/capture silence incorrectly persisted `soundEnabled=false` into user settings.
4. Optional weather or legacy wind could leave enabled controls that silently did nothing.
5. A failed weather commit could leave the selector showing a value that was not live.
6. Mid-session weather failure could leave live sliders stale until the panel reopened.
7. Settings could overlap the Start gate and release gameplay input before Start.
8. The global minimap shortcut remained active behind modal UI.
9. Escape did not close Settings when a form control had focus.
10. Settings opened before world construction could reappear after Start without owning modal input.
11. Start-gate rollback marked modal ownership too late if the host publication call threw.
12. `UiVisibilityController` could skip `reveal()` if its fail-open modal rollback threw.
13. Renderer-matrix and production-renderer screenshots could capture the Start presentation instead of the world.
14. The wind performance benchmark could include full-screen Start-presentation compositing in its measurements.
15. The bootstrap-recovery `WorldApp` mock no longer implemented the T04 UI façade required by `main.ts`.
16. Renderer recovery after a successful Start asked the user to enter the world a second time.
17. Replacing a loading presentation could leave a stale disposed instance retained when construction of its replacement failed.

## Verification executed 2026-09-09

All named gates from a working tree at `28dc0bf` plus three local verifier-regex updates (`scripts/verify-runtime-safety.mjs`, `scripts/verify-bootstrap-lifecycle.mjs`, `scripts/verify-navigation.mjs`) required after T04 compacted `WorldApp` control flow. Those regexes were not reverted; they now match the shipped source.

```text
npm run test:runtime-ui-input          # pass
npm run test:experience-ui             # pass
npm run test:architecture              # pass
npm run test:bootstrap-recovery        # pass (mocked device-loss / cancel)
npm run test:renderer-matrix           # 13/13
npm run test:production-renderers      # 8/8
npm run test:wind-cost                 # all rounds converged, 0 page errors
npm run build                          # exit 0, including verify-world-experience-ui and verify-built-site
```

Interactive browser on `http://localhost:5173/` (long-lived Vite still labelled `v0.9.6+8160bdb218d1`; HMR served the current T04 UI):

- Ordinary Start on WebGPU: veil copy was the degraded timeout text (“Ready — background detail is still settling”), sound checkbox on, **Enter the world** enabled; click released `data-world-start-gate` and revealed the world.
- Forced WebGL 2 (`?renderer=webgl`): canvas `data-renderer=webgl2`, same Start then Settings path.
- Compact portrait (`?profile=compact`, 390×844): Start still hid Settings; **M** during the gate left the minimap closed; after entry the panel inset to 12 px and Settings/close/select/range heights were 44 px (native checkboxes remain 22×22 inside a 44 px label row).
- Settings Escape from weather `<select>`, wind `<input type=range>` and interaction checkbox all closed the panel.
- Minimap isolation: **M** while Settings open did nothing; **M** after close opened the map; opening Settings while the map was open closed it without reopening on Settings close; **M** during Start left the map closed.
- HUD minimize while Settings was open closed the panel and set `data-ui-minimized=true`.
- Weather A→B→A from Settings: Moonrise → Greyrain → Moonrise, iris radius reached ~0 on each cut (~2.2–2.5 s), live select restored Moonrise and the night grade.
- Reduced-motion emulation: `prefers-reduced-motion: reduce` kept `--world-iris-radius` at 120 vmax through a moonlight→sunny swap.
- `?capture=1` and `?qa=t04` skipped the click, left overlay opacity 0, and did not write `soundEnabled=false` (`drusniel-world-hud-settings` stayed `soundEnabled: true`).
- Interaction checkbox was turned off then on at the current pose; trail appearance at blade scale was not scored.
- `.shots/renderer-matrix/world-*-*.png` and `.shots/production-renderers/world-*-*.png` show the grass world and HUD chrome, not the Start card.

Not executed as a live GPU loss in this browser:

- renderer recovery before first Start still presenting the gate;
- renderer recovery after Start without a second click;
- renderer recovery while Settings owns input.

Those ownership paths remain held by `scripts/check-bootstrap-recovery.mjs` (capture-bypass mocks) and `scripts/verify-world-experience-ui.mjs`. A live optional-weather reject was not forced in-session; the experience-ui verifier still covers selector rollback.

## Next ticket

T05 may start. T05 is rain, wetness and local water impacts. Deployment is still not requested.
