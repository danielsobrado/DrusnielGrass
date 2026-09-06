import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[world-grass-allocation] ${message}`);
  }
}

function expectReject(action, pattern, message) {
  try {
    action();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(pattern.test(text), `${message} Received: ${text}`);
    return;
  }
  throw new Error(
    `[world-grass-allocation] ${message} Expected allocation to be rejected.`,
  );
}

function resolvePlacementCount(tileSize, density, multiplier) {
  return Math.max(1, Math.round(tileSize ** 2 * density * multiplier));
}

function resolvePopulationCapacity(
  tileSize,
  density,
  multiplier,
  rosetteChance,
) {
  const expansion = 1 + rosetteChance * 2.5;
  return Math.ceil(
    resolvePlacementCount(tileSize, density, multiplier) * expansion,
  );
}

function resolveNearStackCapacity(world, density, ultraMultiplier) {
  const base = resolvePopulationCapacity(
    world.grassNearTileSize,
    density,
    1,
    world.grassRosetteChance,
  );
  const additionalMultiplier = Math.max(0, ultraMultiplier - 1);
  if (additionalMultiplier === 0) {
    return base;
  }
  const additional = resolvePopulationCapacity(
    world.grassNearTileSize,
    density,
    additionalMultiplier,
    world.grassRosetteChance,
  );
  return base + additional * 2;
}

const worldSource = readFileSync(
  resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
  "utf8",
);
const loaderSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/WorldConfigLoader.ts"),
  "utf8",
);
const validatorSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/WorldGrassAllocationValidator.ts"),
  "utf8",
);
assert(
  loaderSource.includes(
    'import { validateWorldGrassAllocationConfig } from "./WorldGrassAllocationValidator"',
  ) &&
    loaderSource.includes("validateWorldGrassAllocationConfig(config)"),
  "Every production world config load must enforce the grass allocation ceilings.",
);
assert(
  validatorSource.includes(
    'import { resolveGrassPlacementGrid } from "./grass/GrassClumpLattice"',
  ) &&
    validatorSource.includes("Math.ceil(") &&
    validatorSource.includes("resolveNearPopulationCapacity("),
  "The near allocation ceiling must reuse runtime placement rounding and capacity ceiling rules.",
);

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
  const limits = await server.ssrLoadModule(
    "/src/world/WorldGrassAllocationValidator.ts",
  );
  const {
    MAX_GRASS_SOURCE_BLADES_PER_PATCH,
    MAX_GRASS_MID_TRIANGLES_PER_RENDER_BATCH,
    MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE,
    validateWorldGrassAllocationConfig,
  } = limits;
  const world = new WorldConfigLoader().parse(worldSource);

  validateWorldGrassAllocationConfig(world);
  assert(
    Math.round(
      world.grassPatchSize ** 2 *
        world.grassBladesPerSquareMeterDesktop,
    ) === 1344,
    "The shipped desktop source patch must remain the reviewed 1,344 blades.",
  );
  const shippedNearStack = resolveNearStackCapacity(
    world,
    world.grassNearBladesPerSquareMeterDesktop,
    world.grassUltraNearDensityMultiplier,
  );
  assert(
    shippedNearStack === 20967,
    `The shipped desktop near-tile stack must reserve 20,967 blade slots, received ${shippedNearStack}.`,
  );

  expectReject(
    () =>
      validateWorldGrassAllocationConfig({
        ...world,
        grassPatchSize: 16,
      }),
    new RegExp(`above the ${MAX_GRASS_SOURCE_BLADES_PER_PATCH} safety ceiling`),
    "Oversized source patches must fail before shared geometry allocation.",
  );

  expectReject(
    () =>
      validateWorldGrassAllocationConfig({
        ...world,
        chunkSize: 128,
        grassRenderBatchesPerAxis: 1,
      }),
    new RegExp(
      `above the ${MAX_GRASS_MID_TRIANGLES_PER_RENDER_BATCH} safety ceiling`,
    ),
    "Oversized mid render batches must fail before streaming starts.",
  );

  expectReject(
    () =>
      validateWorldGrassAllocationConfig({
        ...world,
        grassNearTileSize: 16,
        grassNearBladesPerSquareMeterDesktop: 180,
        grassUltraNearDensityMultiplier: 3,
      }),
    new RegExp(`above the ${MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE} safety ceiling`),
    "Oversized near-tile stacks must fail before near-field residency begins.",
  );

  // This is the rounding boundary that the old one-shot formula missed:
  // round(total * expansion) is 40,000, while the runtime's separately rounded
  // populations and separately ceiled buffers reserve 40,001 slots.
  expectReject(
    () =>
      validateWorldGrassAllocationConfig({
        ...world,
        grassNearTileSize: 5,
        grassNearBladesPerSquareMeterDesktop: 153,
        grassUltraNearDensityMultiplier: 2.85,
        grassRosetteChance: 0.49,
      }),
    new RegExp(`above the ${MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE} safety ceiling`),
    "Near allocation validation must reject values that cross the ceiling only after runtime rounding.",
  );

  console.log(
    `[world-grass-allocation] Patch ${MAX_GRASS_SOURCE_BLADES_PER_PATCH}, batch ${MAX_GRASS_MID_TRIANGLES_PER_RENDER_BATCH}, near stack ${MAX_NEAR_GRASS_STACKED_BLADES_PER_TILE} ceilings, exact runtime rounding, and loader integration verified.`,
  );
} finally {
  await server.close();
}
