import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = readFileSync(
  resolve(REPOSITORY_ROOT, "src/app/WorldRuntimeGuard.ts"),
  "utf8",
);
const trail = readFileSync(
  resolve(REPOSITORY_ROOT, "src/grass/interaction/GrassTrailField.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[runtime-guard-lifecycle] ${message}`);
  }
}

assert(
  /constructor\([\s\S]*?try \{[\s\S]*?window\.addEventListener\("resize"[\s\S]*?this\.canvas\.addEventListener\("webglcontextrestored"[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.unbindEvents\(\);[\s\S]*?throw error;/.test(
    source,
  ),
  "Runtime guard construction must roll back partially registered listeners before rethrowing.",
);

assert(
  /dispose\(\): void \{[\s\S]*?this\.disposed = true;[\s\S]*?this\.unbindEvents\(\);[\s\S]*?this\.fatalErrorElement\?\.remove\(\);[\s\S]*?this\.fatalErrorElement = undefined;/.test(
    source,
  ),
  "Runtime guard disposal must converge on listener cleanup and remove fatal-error UI ownership.",
);

assert(
  source.includes("private rendererFaulted = false") &&
    /recordSubsystemFailure\([\s\S]*?if \(subsystem === "renderer"\) \{[\s\S]*?this\.rendererFaulted = true;/.test(
      source,
    ) &&
    /handleContextRestored[\s\S]*?if \(!this\.rendererFaulted\) \{[\s\S]*?this\.onRendererEnabledChange\(true\);/.test(
      source,
    ),
  "A WebGL context restore must not resurrect a renderer that was permanently disabled by a real frame failure.",
);

assert(
  /render\(deltaSeconds: number\): void \{[\s\S]*?renderer\.getContext\(\)\.isContextLost\(\)[\s\S]*?this\.resetPendingFrame\(\);[\s\S]*?return;/.test(
    trail,
  ) &&
    trail.indexOf("renderer.getContext().isContextLost()") <
      trail.indexOf("renderer.setRenderTarget(targets[writeTarget])"),
  "Grass trail feedback rendering must discard pending contacts and avoid GPU calls while the shared WebGL context is lost.",
);

assert(
  source.includes('if (subsystem === "frame")') &&
    source.includes("this.publishFatalFrameError(message)") &&
    source.includes('output.className = "startup-error"') &&
    source.includes('output.setAttribute("role", "alert")') &&
    source.includes("Reload the page to restart.") &&
    source.includes("private fatalErrorElement?: HTMLPreElement"),
  "A fatal whole-frame failure must surface a single owned alert instead of leaving a silently frozen canvas.",
);

for (const listener of [
  'window.removeEventListener("resize", this.handleResize)',
  'window.removeEventListener("error", this.handleWindowError)',
  'window.removeEventListener("unhandledrejection", this.handleUnhandledRejection)',
  'this.canvas.removeEventListener("webglcontextlost", this.handleContextLost)',
  'this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored)',
]) {
  assert(source.includes(listener), `Missing cleanup contract: ${listener}.`);
}

console.log(
  "[runtime-guard-lifecycle] Transactional listeners, fatal-error presentation, persistent renderer-fault state, and context-safe trail rendering verified.",
);