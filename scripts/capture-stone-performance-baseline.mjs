import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Deterministic stone placement cost snapshot. */
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  "qa/stones/stone-performance-baseline.json",
);
const CHUNK_MIN = -6;
const CHUNK_MAX = 6;
const ALLOW_INCREASE_FLAG = "--allow-increase";
const COST_KEYS = [
  "includeSmallRoots",
  "farRoots",
  "maxRootsInChunk",
  "detailedTrianglePotential",
  "coarseTrianglePotential",
];

const configSource = readFileSync(
  resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
  "utf8",
);

function readExistingBaseline() {
  if (!existsSync(OUTPUT_PATH)) {
    return undefined;
  }
  return JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
}

function assertSafeBaselineUpdate(previous, next) {
  if (!previous) {
    return;
  }
  const allowIncrease = process.argv.includes(ALLOW_INCREASE_FLAG);
  const domainChanged =
    previous.seed !== next.seed ||
    previous.chunkMin !== next.chunkMin ||
    previous.chunkMax !== next.chunkMax;
  const increases = COST_KEYS.filter(
    (key) =>
      Number.isFinite(previous[key]) &&
      Number.isFinite(next[key]) &&
      next[key] > previous[key],
  );
  if (!domainChanged && increases.length === 0) {
    return;
  }
  if (allowIncrease) {
    return;
  }

  const details = [];
  if (domainChanged) {
    details.push(
      `domain ${previous.seed}:${previous.chunkMin}..${previous.chunkMax} -> ` +
        `${next.seed}:${next.chunkMin}..${next.chunkMax}`,
    );
  }
  for (const key of increases) {
    details.push(`${key} ${previous[key]} -> ${next[key]}`);
  }
  throw new Error(
    `Refusing to weaken the committed stone baseline (${details.join(", ")}). ` +
      `Review the regression first; rerun with ${ALLOW_INCREASE_FLAG} only when the increase is intentional.`,
  );
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
  const { WorldConfigLoader } = await server.ssrLoadModule(
    "/src/world/WorldConfigLoader.ts",
  );
  const { TerrainField } = await server.ssrLoadModule(
    "/src/world/TerrainField.ts",
  );
  const { StoneField } = await server.ssrLoadModule(
    "/src/world/stones/StoneField.ts",
  );

  const config = new WorldConfigLoader().parse(configSource);
  const terrain = new TerrainField(config);
  const stones = new StoneField(terrain, config);
  const includeSmallScratch = [];
  const farScratch = [];

  let includeSmallRoots = 0;
  let farRoots = 0;
  let maxRootsInChunk = 0;
  let detailedTrianglePotential = 0;
  let coarseTrianglePotential = 0;

  for (let chunkZ = CHUNK_MIN; chunkZ <= CHUNK_MAX; chunkZ += 1) {
    for (let chunkX = CHUNK_MIN; chunkX <= CHUNK_MAX; chunkX += 1) {
      const includeSmall = stones.collectChunkInstances(
        chunkX,
        chunkZ,
        true,
        includeSmallScratch,
      );
      includeSmallRoots += includeSmall.length;
      maxRootsInChunk = Math.max(maxRootsInChunk, includeSmall.length);
      for (const instance of includeSmall) {
        detailedTrianglePotential +=
          stones.getInstanceVariant(instance, true).indices.length / 3;
      }

      const far = stones.collectChunkInstances(
        chunkX,
        chunkZ,
        false,
        farScratch,
      );
      farRoots += far.length;
      for (const instance of far) {
        coarseTrianglePotential +=
          stones.getInstanceVariant(instance, false).indices.length / 3;
      }
    }
  }

  const baseline = {
    seed: config.seed,
    chunkMin: CHUNK_MIN,
    chunkMax: CHUNK_MAX,
    includeSmallRoots,
    farRoots,
    maxRootsInChunk,
    detailedTrianglePotential,
    coarseTrianglePotential,
  };

  assertSafeBaselineUpdate(readExistingBaseline(), baseline);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `[stones-baseline] wrote ${OUTPUT_PATH} · ${includeSmallRoots} near roots · ${farRoots} far roots`,
  );
} catch (error) {
  console.error(`[stones-baseline] ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await server.close();
}
