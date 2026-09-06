import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[horizon-allocation] ${message}`);
  }
}

const server = await createServer({
  configFile: false,
  root: REPOSITORY_ROOT,
  appType: "custom",
  logLevel: "silent",
  server: {
    middlewareMode: true,
    watch: null,
  },
  optimizeDeps: { noDiscovery: true },
});

try {
  const {
    MAX_HORIZON_AXIS_SAMPLES,
    createWorldHorizonAxis,
  } = await server.ssrLoadModule("/src/world/horizon/WorldHorizonGrid.ts");

  const spacing = 16;
  const accepted = createWorldHorizonAxis(
    (MAX_HORIZON_AXIS_SAMPLES - 1) * spacing,
    spacing,
    0,
    1.25,
  );
  assert(
    accepted.size === MAX_HORIZON_AXIS_SAMPLES,
    "The exact horizon allocation ceiling must remain valid.",
  );

  let rejected = false;
  try {
    createWorldHorizonAxis(
      MAX_HORIZON_AXIS_SAMPLES * spacing,
      spacing,
      0,
      1.25,
    );
  } catch {
    rejected = true;
  }
  assert(
    rejected,
    "An oversized horizon axis must fail before allocating its positions array.",
  );

  console.log(
    `[horizon-allocation] Axis allocation capped at ${MAX_HORIZON_AXIS_SAMPLES} samples.`,
  );
} finally {
  await server.close();
}
