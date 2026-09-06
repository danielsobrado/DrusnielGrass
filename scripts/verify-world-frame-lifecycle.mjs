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
    frameSource.includes('this.runFrameSubsystem("controls"') &&
    frameSource.includes('this.runFrameSubsystem("terrain"') &&
    frameSource.includes('this.runFrameSubsystem("stones"') &&
    frameSource.includes('this.runFrameSubsystem("grass"') &&
    frameSource.includes('this.runFrameSubsystem("renderer"') &&
    frameSource.includes('this.runFrameSubsystem("hud"'),
  "Frame work must stay inside the fatal-frame boundary while named subsystems retain their independent fault isolation.",
);

console.log(
  "[world-frame-lifecycle] Fatal frame containment and post-success RAF scheduling verified.",
);
