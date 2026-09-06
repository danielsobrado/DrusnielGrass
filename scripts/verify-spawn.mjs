import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EPSILON = 1e-9;

function assert(condition, message) {
  if (!condition) throw new Error(`[spawn] ${message}`);
}

const worldAppSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/app/WorldApp.ts"),
  "utf8",
);
assert(
  worldAppSource.includes("const stoneField = new StoneField(this.field, config)") &&
    worldAppSource.includes(
      "new DenseSpawnLocator(this.field, config, stoneField).find()",
    ) &&
    /new WorldStoneSystem\([\s\S]*?stoneField,[\s\S]*?config,/.test(worldAppSource),
  "World startup must reuse one deterministic stone field for spawn clearance and streaming.",
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
  const THREE = await import("three");
  const { DenseSpawnLocator } = await server.ssrLoadModule(
    "/src/world/DenseSpawnLocator.ts",
  );
  const { CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE } = await server.ssrLoadModule(
    "/src/world/SpawnTuning.ts",
  );
  const { TerrainField } = await server.ssrLoadModule(
    "/src/world/TerrainField.ts",
  );
  const { StoneClearanceCache } = await server.ssrLoadModule(
    "/src/world/stones/StoneClearanceCache.ts",
  );
  const { StoneField } = await server.ssrLoadModule(
    "/src/world/stones/StoneField.ts",
  );
  const { WorldConfigLoader } = await server.ssrLoadModule(
    "/src/world/WorldConfigLoader.ts",
  );

  const source = readFileSync(
    resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
    "utf8",
  );
  const loader = new WorldConfigLoader();
  const config = loader.parse(source);
  const oversizedCharacterScale =
    (config.stoneCellSize + 1) / CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE;
  const oversizedSource = source.replace(
    `characterScale: ${config.characterScale}`,
    `characterScale: ${oversizedCharacterScale}`,
  );
  let rejectedOversizedClearance = false;
  try {
    loader.parse(oversizedSource);
  } catch (error) {
    rejectedOversizedClearance = /spawn stone-clearance radius/i.test(
      error instanceof Error ? error.message : String(error),
    );
  }
  assert(
    rejectedOversizedClearance,
    "Stone-enabled spawn config accepted an unbounded character clearance radius.",
  );
  loader.parse(
    oversizedSource.replace("stonesEnabled: 1", "stonesEnabled: 0"),
  );

  const locate = () => {
    const terrain = new TerrainField(config);
    const stones = new StoneField(terrain, config);
    const spawn = new DenseSpawnLocator(terrain, config, stones).find();
    return { terrain, stones, spawn };
  };

  const first = locate();
  const second = locate();
  assert(
    Math.abs(first.spawn.position.x - second.spawn.position.x) <= EPSILON &&
      Math.abs(first.spawn.position.z - second.spawn.position.z) <= EPSILON,
    "The production seed must resolve the same spawn deterministically.",
  );

  const x = first.spawn.position.x;
  const z = first.spawn.position.z;
  const height = first.terrain.sampleHeight(x, z);
  const normal = new THREE.Vector3();
  first.terrain.sampleNormal(x, z, normal);
  const suitability = first.terrain.sampleGrassSuitability(x, z, height, normal);
  const clearanceRadius =
    config.characterScale * CHARACTER_SPAWN_CLEARANCE_RADIUS_SCALE;
  const pathClearance = first.terrain.samplePathGrassMask(
    x,
    z,
    height,
    clearanceRadius,
  );
  const stoneClearance = new StoneClearanceCache(
    first.stones,
    config,
  ).sample(x, z, clearanceRadius);

  assert(suitability > 0.25, "Spawn must remain on viable grass terrain.");
  assert(pathClearance > 0.5, "Spawn must clear the worn path corridor.");
  assert(stoneClearance > 0.5, "Spawn must clear procedural stone footprints.");

  const disabledConfig = { ...config, stonesEnabled: 0 };
  const disabledTerrain = new TerrainField(disabledConfig);
  const disabledStones = new StoneField(disabledTerrain, disabledConfig);
  disabledStones.collectChunkInstances = () => {
    throw new Error("Disabled spawn clearance touched the stone field.");
  };
  const disabledSpawn = new DenseSpawnLocator(
    disabledTerrain,
    disabledConfig,
    disabledStones,
  ).find();
  assert(
    Number.isFinite(disabledSpawn.position.x) &&
      Number.isFinite(disabledSpawn.position.z),
    "Disabling stones must retain a viable spawn without stone neighborhood work.",
  );

  console.log(
    `[spawn] Deterministic cached-clearance spawn ${x.toFixed(1)}, ${z.toFixed(1)} verified.`,
  );
} finally {
  await server.close();
}
