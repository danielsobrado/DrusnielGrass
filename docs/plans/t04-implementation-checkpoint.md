# T04 implementation checkpoint

Recorded: 2026-09-09

## Revision

- Pre-T04 base: `71d2fcc6c316a1ffed862e9e1e99c66ac2b04604`
- T04 checkpoint head before this document: `ed44b660da327a80659a5374083dd713a227015f`
- Deployment: not requested and not performed.

## Implementation status

T04 implementation is complete at code/static-contract level. Runtime acceptance remains pending until the repository can be executed locally and in a browser.

Implemented:

- Source-style iris transition with per-key request coalescing, reduced-motion cuts, 0.45 s close / 0.6 s open timing, 120 vmax radius and power4-in-out easing.
- Truthful startup presentation over the existing `WorldRevealController`, retaining hero-ring readiness and the bounded degraded-start timeout.
- Start gate with saved sound preference, QA/capture click bypass and session-local silent automation behavior.
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

## Verification still required before marking T04 accepted

Run from a clean checkout of the current `main` head:

```text
npm run test:runtime-ui-input
npm run test:experience-ui
npm run test:architecture
npm run build
```

Then perform browser checks on both WebGPU and forced WebGL 2, desktop and compact:

- normal Start flow and degraded timeout flow;
- QA/capture bypass without changing the persisted sound preference;
- keyboard-only Settings, including Escape from every control type;
- portrait/compact layout and 44 px touch targets;
- rapid weather changes and rejected optional-owner commands;
- Settings while minimap is open, M while Settings/Start is open, and HUD minimize while Settings is open;
- renderer recovery while Start or Settings owns input;
- reduced-motion iris behavior;
- weather changes followed by A -> B -> A state restoration;
- interaction off -> trail recovery -> interaction on at the current gameplay pose.

This session could not execute those commands because the execution environment cannot resolve `github.com` to obtain a checkout. That limitation is not a passing-build result.

## Next ticket

Do not start T05 until the T04 local build and browser acceptance above pass. T05 is rain, wetness and local water impacts.
