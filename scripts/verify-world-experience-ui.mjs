import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const read = (path) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8").replaceAll("\r\n", "\n");

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { power4InOut } = await server.ssrLoadModule("/src/ui/WorldIrisTransition.ts");
  assert.equal(power4InOut(0), 0);
  assert.equal(power4InOut(0.5), 0.5);
  assert.equal(power4InOut(1), 1);
  assert.ok(power4InOut(0.25) < 0.25 && power4InOut(0.75) > 0.75,
    "The iris must retain the source power4-in-out timing curve.");

  const { decodeHudSettings } = await server.ssrLoadModule("/src/runtime/HudSettingsStore.ts");
  const oldDocument = decodeHudSettings({ invertHorizontalMovement: true });
  assert.equal(oldDocument.invertHorizontalMovement, true);
  assert.equal(oldDocument.interactionEnabled, true);
  assert.equal(oldDocument.soundEnabled, true);
  const disabled = decodeHudSettings({ interactionEnabled: false, soundEnabled: false });
  assert.equal(disabled.interactionEnabled, false);
  assert.equal(disabled.soundEnabled, false);
  const wrongTypes = decodeHudSettings({ interactionEnabled: "no", soundEnabled: 1 });
  assert.equal(wrongTypes.interactionEnabled, true);
  assert.equal(wrongTypes.soundEnabled, true);

  const iris = read("src/ui/WorldIrisTransition.ts");
  assert.ok(iris.includes("private readonly pending = new Map<string, WorldIrisSwap>()"));
  assert.ok(iris.includes("this.pending.set(key, swap)"), "Same-key requests must replace pending work.");
  assert.ok(iris.includes("IRIS_CLOSE_SECONDS = 0.45"));
  assert.ok(iris.includes("IRIS_OPEN_SECONDS = 0.6"));
  assert.ok(iris.includes("IRIS_RADIUS_VMAX = 120"));
  assert.ok(iris.includes("prefers-reduced-motion: reduce"));
  assert.ok(/try \{[\s\S]*?commitNext\(\)[\s\S]*?\} finally \{[\s\S]*?animate\(IRIS_RADIUS_VMAX/.test(iris),
    "A failed swap must still reopen the iris.");
  assert.ok(iris.includes("this.finishAnimation?.()") && iris.includes("this.element.remove()"),
    "Disposal must settle animation waiters and remove the overlay.");

  const css = read("src/ui/world-experience.css");
  assert.ok(css.includes("transparent 0 var(--world-iris-radius)")
    && css.includes("#000 calc(var(--world-iris-radius) + 1px)"),
  "The iris must use the source's punched-out radial mask, not a normal clip circle.");
  assert.ok(css.includes("min-height: 44px"), "Interactive controls must retain 44px touch targets.");
  assert.ok(css.includes('html[data-ui-minimized="true"] .world-experience-root'));
  assert.ok(css.includes('html[data-world-start-gate="true"] .world-experience-root'),
    "Scene settings must not overlap the Start gate and release its modal input block.");
  assert.ok(css.includes(".world-loading-presentation") && css.includes("z-index: 1300"),
    "The Start presentation must remain above ordinary experience controls.");
  assert.ok(css.includes(".world-experience-panel :disabled"),
    "Runtime-unavailable controls must read visibly disabled rather than silently ignore input.");

  const panel = read("src/ui/WorldExperiencePanel.ts");
  assert.ok(panel.includes("Audio arrives in T06") === false,
    "T06 must replace the deferred-audio placeholder with live volume controls.");
  for (const live of ["weather", "wind", "speed", "renderScale", "interaction", "invert", "sound", "masterVolume", "ambientVolume", "effectsVolume"]) {
    assert.ok(panel.includes(`data-setting=\"${live}\"`), `Missing usable T04 control ${live}.`);
  }
  for (const future of ["Grass shape", "Grass height", "Quality", "Scenic tour", "Grass painter", "Character"]) {
    assert.ok(panel.includes(`unavailable(\"${future}\"`), `${future} must be explicit rather than a dead control.`);
  }
  assert.ok(panel.includes("document.pointerLockElement") && panel.includes("document.exitPointerLock()"));
  assert.ok(panel.includes("this.host?.setModalOverlay(true)") && panel.includes("this.host?.setModalOverlay(false)"));
  assert.ok(panel.includes('document.addEventListener("keydown", this.handleKeyDown)')
    && panel.includes('document.removeEventListener("keydown", this.handleKeyDown)'));
  assert.ok(panel.includes('event.key !== "Escape" || this.panel.hidden'),
    "Escape must close Settings even when a select, range or checkbox owns focus.");
  assert.ok(!panel.includes("isTextEditingTarget"),
    "The Settings Escape command must not be suppressed merely because a form control has focus.");
  assert.ok(panel.includes("this.setDisabled(setting, !this.host)"),
    "World-bound controls must not act on a missing world.");
  assert.ok(panel.includes('this.setDisabled("weather", !live.weatherAvailable)')
    && panel.includes('this.setDisabled("wind", !live.windControlsAvailable)')
    && panel.includes('this.setDisabled("speed", !live.windControlsAvailable)'),
    "Optional weather and legacy-wind failure modes must disable only controls that cannot apply.");
  assert.ok(panel.includes('data-runtime-status="weather"')
    && panel.includes('data-runtime-status="wind"'),
    "Runtime-unavailable controls must explain why they are disabled.");
  assert.ok(/try \{[\s\S]*?setWeatherPreset\(id\)[\s\S]*?\} finally \{[\s\S]*?this\.sync\(\);/.test(panel),
    "Rejected weather commits must restore the selector to live state before the iris reopens.");
  assert.ok(panel.includes("!this.host?.setWindGain(value)")
    && panel.includes("!this.host?.setSimulationSpeed(value)"),
    "A mid-session weather failure must resync live sliders instead of leaving no-op controls enabled.");
  assert.ok(/if \(open\) \{[\s\S]*?this\.sync\(\);[\s\S]*?setModalOverlay\(true\)/.test(panel),
    "Opening settings must refresh optional-system availability before input is handed to the panel.");

  const reveal = read("src/runtime/WorldRevealController.ts");
  assert.ok(reveal.includes("REVEAL_TIMEOUT_MS = 2800") && reveal.includes("HERO_NEAR_TILES = 4"));
  assert.ok(reveal.includes("heldForStart") && reveal.includes("markReady(true)"));
  assert.ok(reveal.includes("Settling nearby grass") && reveal.includes("Growing the near meadow"));
  assert.ok(reveal.includes("if (!this.heldForStart) this.reveal()"),
    "The old automatic reveal path must remain when no Start gate owns it.");

  const loading = read("src/ui/WorldLoadingPresentation.ts");
  assert.ok(loading.includes("reveal.holdForStart()") && loading.includes("options.setModalOverlay(true)"));
  assert.ok(/reveal\.holdForStart\(\);[\s\S]*?this\.blockedInput = true;[\s\S]*?options\.setModalOverlay\(true\)/.test(loading),
    "Rollback ownership must be recorded before the host is asked to publish modal state.");
  assert.ok(loading.includes('document.documentElement.dataset.worldStartGate = "true"')
    && loading.includes("delete document.documentElement.dataset.worldStartGate"),
    "The Start gate must hide competing settings ownership for exactly its input-blocking lifetime.");
  assert.ok(/constructor\([\s\S]*?try \{[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.releaseInput\(\)/.test(loading),
    "Loading presentation construction must roll back modal input and startup UI state if publication fails.");
  assert.ok(/try \{[\s\S]*?this\.options\.setModalOverlay\(false\);[\s\S]*?\} catch \(error\) \{[\s\S]*?Modal input release failed/.test(loading),
    "Modal release failure must not prevent presentation disposal or reveal cleanup from continuing.");
  assert.ok(loading.includes("this.releaseInput()") && loading.includes("this.reveal.reveal()"));
  assert.ok(loading.includes("this.progress.removeAttribute(\"value\")"),
    "Unknown startup work must be shown as indeterminate rather than fake percentages.");
  assert.ok(loading.includes("this.options.bypassStartGate || !this.element"),
    "QA and a missing reveal DOM must not trap the world behind a Start gate.");
  assert.ok(loading.includes("onStartAccepted?: () => void")
    && loading.includes("this.options.onStartAccepted?.()")
    && loading.includes("this.acceptStartGate()"),
    "Interactive Start acceptance must be reportable once so renderer recovery does not ask twice.");
  assert.ok(loading.includes("if (!this.options.bypassStartGate) this.acceptStartGate()"),
    "A missing Start DOM that fails open must count as accepted for later recovery.");
  assert.ok(!loading.includes("hudSettingsStore.setSoundEnabled(false)"),
    "Silent QA must be session-local and must not overwrite the user's persisted sound preference.");

  const ui = read("src/runtime/UiVisibilityController.ts");
  assert.ok(ui.includes("this.settingsController.attachWorld(host)"));
  assert.ok(ui.includes("setModalOverlay: (open) => host.setModalOverlay(open)"));
  assert.ok(/catch \(error\) \{[\s\S]*?try \{[\s\S]*?host\.setModalOverlay\(false\);[\s\S]*?\} catch \(cleanupError\) \{[\s\S]*?Loading modal rollback failed[\s\S]*?\}[\s\S]*?reveal\.reveal\(\);/.test(ui),
    "Loading construction failure must reveal even when modal rollback itself fails.");
  assert.ok(ui.includes("private startGateAccepted = false")
    && ui.includes("const gateBypassed = bypassStartGate || this.startGateAccepted")
    && ui.includes("onStartAccepted: this.handleStartAccepted"),
    "The Start gate must remain accepted across renderer recovery in the same page lifetime.");
  assert.ok(ui.includes("if (!bypassStartGate) this.startGateAccepted = true"),
    "A failed-open interactive Start presentation must not reappear on recovery.");
  assert.ok(ui.includes("if (this.minimized) this.settingsController.close()"),
    "Minimizing the HUD must close settings before hiding its DOM so input cannot remain trapped.");
  assert.ok(/attachWorld\([\s\S]*?this\.loading\?\.dispose\(\);[\s\S]*?this\.settingsController\.close\(\);[\s\S]*?this\.settingsController\.attachWorld\(host\)/.test(ui),
    "A Settings panel opened before world construction must close before the Start gate takes modal ownership.");

  const main = read("src/main.ts");
  assert.ok(main.includes("uiController.detachWorld()"));
  assert.ok(main.includes("world.getExperiencePanelHost()") && main.includes("world.getRevealController()"));
  assert.ok(main.includes("shouldBypassStartGate(params)"));
  assert.ok(main.includes('params.has("qa")') && main.includes('params.get("capture") === "1"'));

  const rendererMatrix = read("scripts/check-renderer-matrix.mjs");
  assert.ok(rendererMatrix.includes('new URLSearchParams({ capture: "1", ...params })'),
    "Renderer-matrix screenshots must bypass the interactive Start gate.");
  const productionRenderers = read("scripts/check-production-renderers.mjs");
  assert.ok(productionRenderers.includes("&capture=1"),
    "Production renderer screenshots must bypass the interactive Start gate.");
  const bootstrapRecovery = read("scripts/check-bootstrap-recovery.mjs");
  assert.ok(bootstrapRecovery.includes("getExperiencePanelHost()")
    && bootstrapRecovery.includes("getRevealController()"),
    "Bootstrap recovery's WorldApp mock must expose the T04 UI façade used by main.");
  assert.ok(bootstrapRecovery.includes("&capture=1"),
    "Bootstrap recovery must bypass the interactive Start gate.");
  const windCost = read("scripts/check-wind-cost.mjs");
  assert.ok(windCost.includes('BASE + "?capture=1&" + query'),
    "Wind performance measurements must not include the Start presentation compositor.");

  const weather = read("src/world/weather/WorldWeatherState.ts");
  assert.ok(weather.includes("urlPreset ?? options.storedPreset ?? DEFAULT_WEATHER_PRESET"),
    "Weather precedence must be built-in, then stored, then explicit URL.");
  assert.ok(weather.includes("setWindIntensity(value: number)") && weather.includes("setSimulationSpeed(value: number)"));
  assert.ok(weather.includes("isAvailable(): boolean") && weather.includes("hasWindControls(): boolean"),
    "Optional weather disposal and legacy wind must expose usable UI capabilities.");

  const interaction = read("src/grass/interaction/GrassInteractionField.ts");
  assert.ok(interaction.includes("setInteractionEnabled(enabled: boolean)"));
  assert.ok(interaction.includes("grassTrailField.setFocus(pose.position.x, pose.position.z)"));
  assert.ok(/if \(!this\.interactionEnabled\) \{[\s\S]*?grassGroundShadow\.clear\(\);[\s\S]*?return;/.test(interaction),
    "Disabled interaction must preserve trail focus/recovery while preventing new contacts.");
  assert.ok(interaction.includes("!this.interactionEnabled || !config"),
    "Landing pulses must not enqueue while interaction is disabled.");

  const minimap = read("src/app/WorldMinimap.ts");
  assert.ok(minimap.includes("setEnabled(enabled: boolean)"));
  assert.ok(/this\.enabled = enabled;[\s\S]*?if \(!enabled && this\.open\) \{[\s\S]*?this\.setOpen\(false\)/.test(minimap),
    "Disabling modal map input must close an already-open map without reopening it later.");
  assert.ok(minimap.includes("if (!this.enabled || isTypingTarget(event.target))"),
    "The global M shortcut must not open the minimap behind Start or Settings overlays.");
  assert.ok(minimap.includes("(open && !this.enabled)"),
    "All minimap open paths must reject publication while modal UI owns input.");

  const host = read("src/app/WorldExperiencePanelHost.ts");
  assert.ok(host.includes("grassInteractionField.setInteractionEnabled(enabled)"));
  assert.ok(host.includes("this.options.viewState.getGameplayPose(this.pose)"));
  assert.ok(host.includes("grassInteractionField.reset(gameplay.position)"),
    "Re-enabling interaction must restart from the current gameplay pose.");
  assert.ok(host.includes("weatherOwner?.isAvailable()") && host.includes("weatherOwner?.hasWindControls()"),
    "The panel host must report optional-system capabilities from the actual owner.");
  assert.ok(/setWindGain\(value: number\): boolean[\s\S]*?setWindIntensity\(value\)/.test(host)
    && /setSimulationSpeed\(value: number\): boolean[\s\S]*?setSimulationSpeed\(value\)/.test(host),
    "Live wind controls must propagate rejection back to the UI.");
  assert.ok(/setModalOverlay\(open: boolean\)[\s\S]*?minimap\.setEnabled\(!open\)[\s\S]*?viewState\.setModalOverlay\(open\)/.test(host),
    "One modal boundary must disable both the minimap shortcut and player controls.");

  const app = read("src/app/WorldApp.ts");
  assert.ok(app.includes("this.renderScale = hudSettingsStore.getRenderScale()"));
  assert.ok(app.includes("storedPreset: hudSettingsStore.getWeather()"));
  assert.ok(app.includes("grassInteractionField.setInteractionEnabled(hudSettingsStore.getInteractionEnabled())"));
  assert.ok(app.includes("this.profile.maxPixelRatio * this.renderScale"));
  assert.ok(/minimap = new WorldMinimap[\s\S]*?this\.minimap = minimap[\s\S]*?new WorldExperiencePanelHostAdapter\([\s\S]*?minimap: this\.minimap/.test(app),
    "The modal host must receive the fully constructed minimap it is responsible for gating.");
} finally {
  await server.close();
}

console.log(
  "[world-experience-ui] Iris coalescing/mask, truthful reveal/one-shot Start gate, modal input/minimap isolation, "
  + "settings migration, capture/recovery compatibility, optional-weather availability, live controls and interaction lifecycle verified.",
);
