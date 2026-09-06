import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = readFileSync(
  resolve(REPOSITORY_ROOT, "src/qa/WorldVisualMatrixRunner.ts"),
  "utf8",
);
const captureScript = readFileSync(
  resolve(REPOSITORY_ROOT, "scripts/capture-visual-matrix-poses.mjs"),
  "utf8",
);
const stoneMeasurementScript = readFileSync(
  resolve(REPOSITORY_ROOT, "scripts/measure-stone-areas.mjs"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[visual-qa-lifecycle] ${message}`);
  }
}

assert(
  source.includes("private applying = false") &&
    /private async apply\(index: number\)[\s\S]*?if \(this\.applying\) \{[\s\S]*?capture is already in progress[\s\S]*?this\.applying = true;[\s\S]*?try \{[\s\S]*?return await this\.capture\(pose, index\);[\s\S]*?\} finally \{[\s\S]*?this\.applying = false;/.test(
      source,
    ),
  "Visual matrix captures must serialize camera/sample ownership and release the busy flag on every exit path.",
);

assert(
  source.includes("private readonly abortController = new AbortController()") &&
    source.includes("this.abortController.abort()") &&
    source.includes("this.abortController.signal") &&
    source.includes("delete windowWithQa.__FLUFFY_WORLD_VISUAL_QA__"),
  "Visual matrix disposal must abort pending sampling and remove its published window API.",
);

assert(
  captureScript.includes('params.get("debug")') === false &&
    captureScript.includes("&debug=1") &&
    captureScript.includes("const PROFILE_TAG = `chrome-profile-capture-${PORT}-owned`") &&
    captureScript.includes("Where-Object { $_.CommandLine -like '*${PROFILE_TAG}*' }") &&
    captureScript.includes('isolationHud.includes("hook=active")') &&
    !captureScript.includes("'*chrome-profile-capture*'"),
  "Visual pose captures must enable isolation diagnostics, prove the render hook is active, and scope browser cleanup to the owning CDP port.",
);

assert(
  stoneMeasurementScript.includes('"/src/world/DenseSpawnLocator.ts"') &&
    stoneMeasurementScript.includes('"/src/world/stones/StoneField.ts"') &&
    stoneMeasurementScript.includes(
      "new DenseSpawnLocator(field, config, stoneField).find()",
    ) &&
    stoneMeasurementScript.includes("const originX = spawn.position.x") &&
    stoneMeasurementScript.includes("const originZ = spawn.position.z") &&
    !/const ORIGIN_[XZ]\s*=\s*-?\d/.test(stoneMeasurementScript),
  "Stone truth measurements must derive their origin from the same spawn locator and stone field as the running world.",
);

console.log(
  "[visual-qa-lifecycle] Capture serialization, disposal ownership, isolation diagnostics, browser-session ownership, and stone-truth spawn parity verified.",
);
