import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = readFileSync(
  resolve(REPOSITORY_ROOT, "src/runtime/GpuFrameTimer.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[gpu-timer-lifecycle] ${message}`);
  }
}

assert(
  /endFrame\(\): void \{[\s\S]*?const query = this\.activeQuery;[\s\S]*?this\.gl\.endQuery\(this\.extension\.TIME_ELAPSED_EXT\);[\s\S]*?this\.activeQuery = undefined;[\s\S]*?this\.inFlight\.push\(query\);/.test(
    source,
  ),
  "A query must stay owned as active until endQuery succeeds.",
);

assert(
  /private releaseQueries\(\): void \{[\s\S]*?if \(this\.activeQuery\) \{[\s\S]*?this\.safeEndActiveQuery\(\);[\s\S]*?this\.safeDeleteQuery\(this\.activeQuery\);[\s\S]*?this\.activeQuery = undefined;/.test(
    source,
  ),
  "Teardown must end an active timer target before deleting its query object.",
);

assert(
  /private safeEndActiveQuery\(\): void \{[\s\S]*?this\.gl\.endQuery\(this\.extension\.TIME_ELAPSED_EXT\);[\s\S]*?catch/.test(
    source,
  ),
  "GPU timer cleanup must tolerate lost/reset contexts while attempting to close query state.",
);

console.log(
  "[gpu-timer-lifecycle] Active query state is ended before deletion and failure cleanup stays idempotent.",
);
