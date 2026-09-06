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
    throw new Error(`[config-fetch] ${message}`);
  }
}

const fetchLoader = read("src/config/ConfigTextLoader.ts");
const runtimeLoader = read("src/runtime/RuntimeConfigLoader.ts");
const worldLoader = read("src/world/WorldConfigLoader.ts");
const grassLoader = read("src/grass/internal/GrassConfigLoader.ts");

assert(
  fetchLoader.includes("const CONFIG_FETCH_TIMEOUT_MS = 15_000") &&
    fetchLoader.includes("const controller = new AbortController()") &&
    fetchLoader.includes("controller.abort()") &&
    fetchLoader.includes("fetch(url, { signal: controller.signal })") &&
    fetchLoader.includes("if (!response.ok)") &&
    fetchLoader.includes("return await response.text()") &&
    fetchLoader.includes("globalThis.clearTimeout(timeoutHandle)") &&
    fetchLoader.includes("request timed out after"),
  "Shared config fetching must bound the complete response, validate HTTP status, and always release its timeout.",
);

for (const [name, source, label] of [
  ["Runtime", runtimeLoader, "runtime config"],
  ["World", worldLoader, "world config"],
  ["Grass", grassLoader, "grass config"],
]) {
  assert(
    source.includes("fetchConfigText") &&
      source.includes(`fetchConfigText(url, "${label}")`) &&
      !source.includes("await fetch(url)"),
    `${name} configuration must use the shared bounded fetch path.`,
  );
}

console.log(
  "[config-fetch] Runtime, world, and grass startup configuration fetches are bounded and fail closed.",
);
