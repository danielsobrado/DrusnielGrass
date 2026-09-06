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
    throw new Error(`[bootstrap-lifecycle] ${message}`);
  }
}

const source = read("src/main.ts");
const isolationHarness = read("src/runtime/WorldIsolationHarness.ts");
const listener = source.indexOf('window.addEventListener("pagehide", handlePageHide)');
const runtimeConfigLoad = source.indexOf("await new RuntimeConfigLoader().load(");
const islandImport = source.indexOf('await import("./app/IslandApp")');
const worldImport = source.indexOf('await import("./app/WorldApp")');
const appStart = source.indexOf("app.start()");

assert(
  source.includes("let disposed = false") &&
    source.includes("const handlePageHide = (event: PageTransitionEvent): void =>") &&
    source.includes("if (event.persisted || disposed)") &&
    source.includes("disposed = true") &&
    source.includes("disposeRuntime()") &&
    listener >= 0 &&
    runtimeConfigLoad > listener &&
    listener < islandImport &&
    listener < worldImport &&
    listener < appStart &&
    /await new RuntimeConfigLoader\(\)\.load\([\s\S]*?\);[\s\S]*?if \(disposed\) \{[\s\S]*?return;/.test(
      source,
    ),
  "Non-BFCache pagehide cleanup must own bootstrap before the first async config load and every later application setup boundary.",
);

assert(
  /const world = await WorldApp\.create\(canvas, profile\);[\s\S]*?app = world;[\s\S]*?if \(disposed\) \{[\s\S]*?disposeRuntime\(\);[\s\S]*?return;/.test(
    source,
  ) &&
    /await island\.initialize\(\);[\s\S]*?if \(disposed\) \{[\s\S]*?return;/.test(
      source,
    ),
  "Applications resolving after pagehide must not continue bootstrap or start without an owner.",
);

for (const modulePath of [
  "./runtime/WorldIsolationHarness",
  "./runtime/AnimationBlendingHud",
  "./runtime/WorldDiagnosticsController",
  "./qa/WorldVisualMatrixRunner",
  "./dev/ActorExtensibilityProof",
]) {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert(
    new RegExp(`await import\\(\\s*"${escaped}"\\s*\\)`).test(source),
    `Expected optional import ${modulePath} to remain asynchronous.`,
  );
}
assert(
  source.includes('params.get("debug") === "1"') &&
    !source.includes('import { installWorldIsolationHarness }') &&
    /await import\(\s*"\.\/runtime\/WorldIsolationHarness"\s*\)[\s\S]*?if \(disposed\) \{[\s\S]*?return;[\s\S]*?installWorldIsolationHarness\(params\)/.test(
      source,
    ),
  "Isolation diagnostics must stay debug-only, lazy, and re-check bootstrap ownership before installing a global scene hook.",
);
assert(
  isolationHarness.includes("private readonly hiddenObjects = new Map<THREE.Object3D, boolean>()") &&
    isolationHarness.includes("private readonly originalCameraNear = new Map<THREE.PerspectiveCamera, number>()") &&
    isolationHarness.includes("private readonly overriddenScenes = new Map<") &&
    isolationHarness.includes("this.restoreVisibility()") &&
    isolationHarness.includes("this.restoreCameraNearOverrides()") &&
    isolationHarness.includes("this.restoreOverrideMaterials()") &&
    isolationHarness.includes("const beforeRenderWasOwn = Object.prototype.hasOwnProperty.call(") &&
    isolationHarness.includes("const afterRenderWasOwn = Object.prototype.hasOwnProperty.call(") &&
    isolationHarness.includes("delete (prototype as Partial<ScenePrototype>)[key]") &&
    isolationHarness.includes("restorePatchFlag(prototype, originalPatchDescriptor)") &&
    /const state = new IsolationState\(options\);[\s\S]*?let disposed = false;[\s\S]*?dispose: \(\) => \{[\s\S]*?if \(disposed\) \{[\s\S]*?return;[\s\S]*?disposed = true;/.test(
      isolationHarness,
    ),
  "Isolation diagnostics must be idempotent and restore scene, camera, visibility, and prototype ownership when disposed.",
);
assert(
  (source.match(/if \(disposed\) \{/g)?.length ?? 0) >= 8,
  "Optional asynchronous runtime modules must re-check bootstrap ownership before publishing resources.",
);

assert(
  /catch \(error\) \{[\s\S]*?disposed = true;[\s\S]*?window\.removeEventListener\("pagehide", handlePageHide\);[\s\S]*?disposeRuntime\(\);[\s\S]*?throw error;/.test(
    source,
  ),
  "Failed bootstrap must remove its navigation listener and release all partially created owners.",
);

console.log(
  "[bootstrap-lifecycle] First-await navigation ownership, lazy diagnostics, reversible idempotent isolation state, async setup checks, and startup rollback verified.",
);
