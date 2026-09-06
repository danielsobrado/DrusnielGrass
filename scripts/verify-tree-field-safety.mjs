import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/scenic/WorldTreeField.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[tree-field-safety] ${message}`);
  }
}

const collectStart = source.indexOf("collect(centerX: number, centerZ: number, radius: number)");
const sampleStart = source.indexOf("private sampleCell(", collectStart);
const collectSource = source.slice(collectStart, sampleStart);

assert(
  collectStart >= 0 &&
    sampleStart > collectStart &&
    collectSource.includes("!Number.isFinite(centerX)") &&
    collectSource.includes("!Number.isFinite(centerZ)") &&
    collectSource.includes("!Number.isFinite(radius)") &&
    collectSource.includes("radius <= 0") &&
    collectSource.indexOf("return []") < collectSource.indexOf("const minX = Math.floor"),
  "Tree collection must reject invalid bounds before deriving lattice limits, preventing Infinity-based non-advancing loops.",
);

console.log(
  "[tree-field-safety] Non-finite tree lattice bounds are rejected before cell iteration.",
);
