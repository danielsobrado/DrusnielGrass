import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const SEED = 42017;
const POINT_COUNT = 250_000;
const WARMUP_ITERATIONS = 2;
const MEASURED_ITERATIONS = 7;
const GRID = Math.round(Math.sqrt(POINT_COUNT));

function percentile(sorted, fraction) {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
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
  const { RiverField, createRiverSample } = await server.ssrLoadModule(
    "/src/world/hydrology/RiverField.ts",
  );
  const { WORLD_CONFIG_SCHEMA } = await server.ssrLoadModule(
    "/src/world/WorldConfigSchema.ts",
  );
  const { validateWorldConfig } = await server.ssrLoadModule(
    "/src/world/WorldConfigValidator.ts",
  );

  const worldSource = readFileSync(
    resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
    "utf8",
  );
  const config = Object.fromEntries(
    worldSource
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim(), Number(line.slice(separator + 1))];
      }),
  );
  config.seed = SEED;
  for (const key of Object.keys(WORLD_CONFIG_SCHEMA)) {
    if (!Number.isFinite(config[key])) {
      throw new Error(`World config is missing ${key}.`);
    }
  }
  validateWorldConfig(config);

  const field = new RiverField(config);
  const sample = createRiverSample();
  const xs = new Float64Array(POINT_COUNT);
  const zs = new Float64Array(POINT_COUNT);
  let index = 0;
  for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      xs[index] = (x - GRID * 0.5) * 1.7;
      zs[index] = (z - GRID * 0.5) * 1.7;
      index += 1;
    }
  }

  const runWorkload = () => {
    for (let point = 0; point < POINT_COUNT; point += 1) {
      field.sample(xs[point], zs[point], 18, sample);
    }
  };

  for (let warmup = 0; warmup < WARMUP_ITERATIONS; warmup += 1) {
    runWorkload();
  }

  const times = [];
  for (let iteration = 0; iteration < MEASURED_ITERATIONS; iteration += 1) {
    const started = performance.now();
    runWorkload();
    times.push(performance.now() - started);
  }

  times.sort((left, right) => left - right);
  console.log(
    `[bench:river] seed ${SEED} points ${POINT_COUNT} median ${percentile(times, 0.5).toFixed(2)}ms p95 ${percentile(times, 0.95).toFixed(2)}ms`,
  );
} finally {
  await server.close();
}
