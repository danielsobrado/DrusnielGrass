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

  const panel = read("src/ui/WorldExperiencePanel.ts");
  for (const live of ["weather", "wind", "speed", "renderScale", "interaction", "invert", "sound"]) {
    assert.ok(panel.includes(`data-setting=\"${live}\"`), `Missing usable T04 control ${live}.`);
  }
  for (const future of ["Grass shape", "Grass height", "Quality", "Scenic tour", "Grass painter", "Character"]) {
    assert.ok(panel.includes(`unavailable(\"${future}\"`), `${future} must be explicit rather than a dead control.`);
  }
  assert.ok(panel.includes("document.pointerLockElement") && panel.includes("document.exitPointerLock()"));
  assert.ok(panel.includes("this.host?.setModalOverlay(true)") && panel.includes("this.host?.setModalOverlay(false)"));
  assert.ok(panel.includes('document.addEventListener("keydown", this.handleKeyDown)')
    && panel.includes('document.removeEventListener("keydown", this.handleKeyDown)'));
  assert.ok(panel.includes('event.key !== "Escape"') && panel.includes("isTextEditingTarget(event.target)"));
  assert.ok(panel.includes("input.disabled = !this.host"), "World-bound controls must not act on a missing world.");

  const reveal = read("src/runtime/WorldRevealController.ts");
  assert.ok(reveal.includes("REVEAL_TIMEOUT_MS = 2800") && reveal.includes("HERO_NEAR_TILES = 4"));
  assert.ok(reveal.includes("heldForStart") && reveal.includes("markReady(true)"));
  assert.ok(reveal.includes("Settling nearby grass") && reveal.includes("Growing the near meadow"));
  assert.ok(reveal.includes("if (!this.heldForStart) this.reveal()"),
    "The old automatic reveal path must remain when no Start gate owns it.");

  const loading = read("src/ui/WorldLoadingPresentation.ts");
  assert.ok(loading.includes("reveal.holdForStart()") && loading.includes("options.setModalOverlay(true)"));
  assert.ok(loading.includes("this.releaseInput()") && loading.includes("this.reveal.reveal()"));
  assert.ok(loading.includes("this.progress.removeAttribute(\"value\")"),
    "Unknown startup work must be shown as indeterminate rather than fake percentages.");
  assert.ok(loading.includes("this.options.bypassStartGate || !this.element"),
    "QA and a missing reveal DOM must not trap the world behind a Start gate.");
  assert.ok(!loading.includes("hudSettingsStore.setSoundEnabled(false)"),
    "Silent QA must be session-local and must not overwrite the user's persisted sound preference.");

  const ui = read("src/runtime/UiVisibilityController.ts");
  assert.ok(ui.includes("this.settingsController.attachWorld(host)"));
  assert.ok(ui.includes("setModalOverlay: (open) => host.setModalOverlay(open)"));
  assert.ok(ui.includes("host.setModalOverlay(false)") && ui.includes("reveal.reveal()"),
    "Optional loading construction failure must fail open.");

  const main = read("src/main.ts");
  assert.ok(main.includes("uiController.detachWorld()"));
  assert.ok(main.includes("world.getExperiencePanelHost()") && main.includes("world.getRevealController()"));
  assert.ok(main.includes("shouldBypassStartGate(params)"));
  assert.ok(main.includes('params.has("qa")') && main.includes('params.get("capture") === "1"'));

  const weather = read("src/world/weather/WorldWeatherState.ts");
  assert.ok(weather.includes("urlPreset ?? options.storedPreset ?? DEFAULT_WEATHER_PRESET"),
    "Weather precedence must be built-in, then stored, then explicit URL.");
  assert.ok(weather.includes("setWindIntensity(value: number)") && weather.includes("setSimulationSpeed(value: number)"));

  const interaction = read("src/grass/interaction/GrassInteractionField.ts");
  assert.ok(interaction.includes("setInteractionEnabled(enabled: boolean)"));
  assert.ok(interaction.includes("grassTrailField.setFocus(pose.position.x, pose.position.z)"));
  assert.ok(/if \(!this\.interactionEnabled\) \{[\s\S]*?grassGroundShadow\.clear\(\);[\s\S]*?return;/.test(interaction),
    "Disabled interaction must preserve trail focus/recovery while preventing new contacts.");
  assert.ok(interaction.includes("!this.interactionEnabled || !config"),
    "Landing pulses must not enqueue while interaction is disabled.");

  const host = read("src/app/WorldExperiencePanelHost.ts");
  assert.ok(host.includes("grassInteractionField.setInteractionEnabled(enabled)"));
  assert.ok(host.includes("this.options.viewState.getGameplayPose(this.pose)"));
  assert.ok(host.includes("grassInteractionField.reset(gameplay.position)"),
    "Re-enabling interaction must restart from the current gameplay pose.");

  const app = read("src/app/WorldApp.ts");
  assert.ok(app.includes("this.renderScale = hudSettingsStore.getRenderScale()"));
  assert.ok(app.includes("storedPreset: hudSettingsStore.getWeather()"));
  assert.ok(app.includes("grassInteractionField.setInteractionEnabled(hudSettingsStore.getInteractionEnabled())"));
  assert.ok(app.includes("this.profile.maxPixelRatio * this.renderScale"));
} finally {
  await server.close();
}

console.log(
  "[world-experience-ui] Iris coalescing/mask, truthful reveal/start gate, modal input, "
  + "settings migration, weather precedence, live controls and interaction lifecycle verified.",
);
