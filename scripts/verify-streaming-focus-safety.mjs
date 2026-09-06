import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(path) {
  return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[streaming-focus-safety] ${message}`);
  }
}

const terrain = read("src/world/TerrainStreamer.ts");
const stones = read("src/world/stones/WorldStoneSystem.ts");
const environment = read("src/app/WorldEnvironmentController.ts");

for (const [name, source, methodPattern, downstreamPattern] of [
  [
    "Terrain streamer",
    terrain,
    "update(\n    position: THREE.Vector3",
    "const chunkX = Math.floor(position.x / this.config.chunkSize)",
  ],
  [
    "Stone streamer",
    stones,
    "update(position: THREE.Vector3, buildDeadline: number)",
    "const chunkX = Math.floor(position.x / this.config.chunkSize)",
  ],
]) {
  const start = source.indexOf(methodPattern);
  const downstream = source.indexOf(downstreamPattern, start);
  const body = source.slice(start, downstream);
  assert(
    start >= 0 &&
      downstream > start &&
      body.includes("!Number.isFinite(position.x)") &&
      body.includes("!Number.isFinite(position.y)") &&
      body.includes("!Number.isFinite(position.z)") &&
      body.includes("return;"),
    `${name} must reject non-finite focus before deriving chunk residency.`,
  );
}

const shadowStart = environment.indexOf("updateShadow(focus: THREE.Vector3): void");
const shadowMath = environment.indexOf("const snappedX =", shadowStart);
const shadowBody = environment.slice(shadowStart, shadowMath);
assert(
  shadowStart >= 0 &&
    shadowMath > shadowStart &&
    shadowBody.includes("!Number.isFinite(focus.x)") &&
    shadowBody.includes("!Number.isFinite(focus.y)") &&
    shadowBody.includes("!Number.isFinite(focus.z)"),
  "Shadow snapping must reject non-finite focus before publishing light matrices.",
);

console.log(
  "[streaming-focus-safety] Terrain, stones, and shadow focus reject non-finite coordinates before residency/matrix publication.",
);
