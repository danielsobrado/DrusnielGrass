import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[world-frame-lifecycle] ${message}`);
  }
}

const source = read("src/app/WorldApp.ts");
const renderStart = source.indexOf("private render = (): void =>");
const frameStart = source.indexOf("private renderFrame(): void", renderStart);
const observerStart = source.indexOf("private notifyFrameObservers", frameStart);
const renderSource = source.slice(renderStart, frameStart);
const frameSource = source.slice(frameStart, observerStart);

assert(
  renderStart >= 0 &&
    frameStart > renderStart &&
    observerStart > frameStart &&
    renderSource.includes("try {") &&
    renderSource.includes("this.renderFrame()") &&
    renderSource.includes("this.running = false") &&
    renderSource.includes("this.clock.stop()") &&
    renderSource.includes("window.clearInterval(this.watchdogHandle)") &&
    renderSource.includes('this.runtimeGuard.recordSubsystemFailure("frame", error)') &&
    renderSource.indexOf("requestAnimationFrame(this.render)") >
      renderSource.indexOf("this.renderFrame()"),
  "Unexpected world-frame failures must stop the loop and watchdog before any next frame is scheduled.",
);

assert(
  !frameSource.includes("requestAnimationFrame(this.render)") &&
    frameSource.includes("this.frameMetrics.beginFrame(deltaSeconds)") &&
    frameSource.includes("this.subsystems.run(deltaSeconds") &&
    ["controls", "terrain", "environment", "stones", "grass", "renderer",
      "experience", "hud"].every((phase) =>
      new RegExp('name: "' + phase + '",[^]*?onFailure:').test(source)),
  "Frame work must stay inside the fatal-frame boundary while named subsystems retain their independent fault isolation.",
);

const experienceConstruction = source.indexOf(
  "this.experience = new WorldExperience(experienceConfig, profile.compact)",
);
const weatherAttachment = source.indexOf("attachWorldWeather(this.experience");
assert(
  experienceConstruction >= 0 && weatherAttachment > experienceConstruction,
  "The experience owner must exist before weather and shared wind are attached.",
);

const registrationStart = source.indexOf("private registerFrameSubsystems(): void");
const registrationEnd = source.indexOf("private disposeGrassResources", registrationStart);
const registrationSource = source.slice(registrationStart, registrationEnd);
const phaseOrder = [
  "controls",
  "experience",
  "environment",
  "terrain",
  "stones",
  "grass",
  "renderer",
  "hud",
];
let previousPhaseIndex = -1;
for (const phase of phaseOrder) {
  const phaseIndex = registrationSource.indexOf(`name: "${phase}"`);
  assert(
    phaseIndex > previousPhaseIndex,
    `Frame phase ${phase} must remain after ${phaseOrder[Math.max(0, phaseOrder.indexOf(phase) - 1)]}.`,
  );
  previousPhaseIndex = phaseIndex;
}

console.log(
  "[world-frame-lifecycle] Fatal frame containment, weather ownership, "
  + "weather-before-render ordering and post-success RAF scheduling verified.",
);
