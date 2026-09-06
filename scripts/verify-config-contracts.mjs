import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

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
    throw new Error(`[config] ${message}`);
  }
}

async function expectReject(action, pattern, message) {
  try {
    await action();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(pattern.test(text), `${message} Received: ${text}`);
    return;
  }
  throw new Error(`[config] ${message} Expected configuration to be rejected.`);
}

const worldSource = read("public/config/world.yaml");
const grassSource = read("public/config/grass.yaml");
const runtimeSource = read("public/config/runtime.yaml");
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
  const { GrassConfigLoader } = await server.ssrLoadModule(
    "/src/grass/internal/GrassConfigLoader.ts",
  );
  const { RuntimeConfigLoader } = await server.ssrLoadModule(
    "/src/runtime/RuntimeConfigLoader.ts",
  );

  const originalFetch = globalThis.fetch;
  let responseSource = "";
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => responseSource,
  });

  try {
    const worldLoader = new WorldConfigLoader();
    const grassLoader = new GrassConfigLoader();
    const runtimeLoader = new RuntimeConfigLoader();
    const load = async (loader, source) => {
      responseSource = source;
      return loader.load("memory://config");
    };

    const world = await load(worldLoader, worldSource);
    const grass = await load(grassLoader, grassSource);
    const runtime = await load(runtimeLoader, runtimeSource);

    assert(
      world.detailFoliageDensity === 20 &&
        world.detailFoliageColonyWorldSize === 11 &&
        world.detailFoliageClumpWorldSize === 2.25 &&
        world.detailFoliageColonyStrength === 0.94 &&
        world.detailFoliageDominantFamilyShare === 0.9 &&
        world.detailFoliageTintCoherence === 1 &&
        world.detailFoliageQuietZoneThreshold === 0.34 &&
        world.detailFoliageBackgroundSuppression === 0.5 &&
        world.detailFoliageCoreHeightBias === 0.12 &&
        world.detailFoliageMaturePhenotypeBias === 0.62 &&
        world.detailFoliageEcologyStrength === 0.72 &&
        world.detailFoliageEdgeCompanionStrength === 0.3 &&
        world.detailFoliageStoneFringeStrength === 0.38 &&
        world.detailFoliagePathFringeStrength === 0.18,
      "Shipped detail-foliage production values must parse exactly.",
    );

    assert(
      world.riverWidthVariation === 0.08 &&
        world.riverBendBankAsymmetry === 0.04 &&
        world.riverDepthVariation === 0.22 &&
        world.riverBendChannelShift === 0.2 &&
        world.waterRiverPoolFlowScale === 0.8 &&
        world.waterRiverRiffleFlowScale === 1.2 &&
        world.waterShoreFoamWeight === 0.14 &&
        world.waterRiffleFoamWeight === 0.4 &&
        world.waterStoneFoamWeight === 0.56,
      "Shipped river morphology and foam-balance production values must parse exactly.",
    );
    assert(
      world.stoneDensity === 0.3 &&
        world.stoneClusterChance === 0.82 &&
        world.stoneClusterSpacing === 56 &&
        world.stoneClusterCenterJitter === 0.26 &&
        world.stoneClusterRadiusMin === 10 &&
        world.stoneClusterRadiusMax === 22 &&
        world.stoneClusterAspectMin === 0.58 &&
        world.stoneClusterAspectMax === 0.92 &&
        world.stoneClusterBudgetMin === 4 &&
        world.stoneClusterBudgetMax === 8 &&
        world.stoneClusterCoreRatio === 0.42 &&
        world.stoneClusterShoulderRatio === 0.78 &&
        world.stoneClusterHaloRatio === 1.12 &&
        world.stoneClusterDensityResponse === 6 &&
        world.stoneSingletonChance === 0.17,
      "Shipped stone cluster production values must parse exactly.",
    );
    assert(
      world.grassFarImpostorsPerPatch === 1,
      "World config must retain the one-instance/four-card far-impostor contract.",
    );
    assert(
      world.grassSparseDensityRetentionThreshold === 0.55,
      "World config must parse the shipped biome-relative sparse threshold exactly.",
    );
    assert(grass.material.baseColor.startsWith("#"), "Grass colors must parse.");
    assert(
      runtime.desktop.shadowMapSize > 0 && runtime.compact.shadowMapSize > 0,
      "Runtime shadow-map sizes must parse.",
    );

    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "grassSparseDensityRetentionThreshold: 0.55",
            "grassSparseDensityRetentionThreshold: 1",
          ),
        ),
      /grassSparseDensityRetentionThreshold must be at most 0.95/,
      "Sparse density retention threshold must remain a fractional biome-relative value.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "grassRosetteFanRadians: 0.42",
            `grassRosetteFanRadians: ${Math.PI / 4}`,
          ),
        ),
      /grassRosetteFanRadians must be lower than/,
      "A four-leaf rosette fan must stay strictly inside a half turn.",
    );
    await expectReject(
      () => load(worldLoader, `${worldSource}\nunknownProductionSetting: 1\n`),
      /Unknown world config value: unknownProductionSetting/,
      "Unknown world keys must fail closed.",
    );
    await expectReject(
      () =>
        load(worldLoader, `${worldSource}\ndetailFoliageSomethingElse: 1\n`),
      /Unknown world config value: detailFoliageSomethingElse/,
      "Unknown detail-foliage keys must fail closed.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "detailFoliageDensity: 20.0",
            "detailFoliageDensity: 20.1",
          ),
        ),
      /detailFoliageDensity must be at most 20/,
      "Detail foliage density must stay at or below the 4 cards/m² ceiling.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "detailFoliageColonyWorldSize: 11",
            "detailFoliageColonyWorldSize: 5",
          ),
        ),
      /detailFoliageColonyWorldSize must be at least 6/,
      "Detail foliage colony size must stay inside the shared limits.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "detailFoliageClumpWorldSize: 2.25",
            "detailFoliageClumpWorldSize: 5",
          ),
        ),
      /detailFoliageClumpWorldSize must be at most 4/,
      "Detail foliage clump size must stay inside the shared limits.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource
            .replace(
              "detailFoliageColonyWorldSize: 11",
              "detailFoliageColonyWorldSize: 6",
            )
            .replace(
              "detailFoliageClumpWorldSize: 2.25",
              "detailFoliageClumpWorldSize: 4",
            ),
        ),
      /detailFoliageClumpWorldSize must be at most half of detailFoliageColonyWorldSize/,
      "Clump size must not exceed half the colony size in production config.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "detailFoliageDominantFamilyShare: 0.90",
            "detailFoliageDominantFamilyShare: 0.95",
          ),
        ),
      /detailFoliageDominantFamilyShare must be at most 0.9/,
      "Dominant-family share must stay inside the shared limits.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "detailFoliageCoreHeightBias: 0.12",
            "detailFoliageCoreHeightBias: 0.30",
          ),
        ),
      /detailFoliageCoreHeightBias must be at most 0.25/,
      "Core height bias must stay inside the shared limits.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "grassNearBridgeDistance: 18",
            "grassNearBridgeDistance: 22",
          ),
        ),
      /bridge LOD handoff must complete before the near-to-mid fade starts/i,
      "Bridge entry must not overlap the patch LOD fade.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("lakeSpacing: 480", "lakeSpacing: 180"),
        ),
      /largest lake, shoreline, and humidity halo/i,
      "Lake cells must contain their complete basin and humidity footprint.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("riverMeander: 105", "riverMeander: 220"),
        ),
      /worst-case meanders and humidity bands separated/i,
      "River tuning must reject corridors that can collide after meandering.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          // The narrowest lane is now a fraction of the nominal width, so the
          // far-LOD floor bites at a much larger configured value than before.
          worldSource.replace("riverWidth: 21", "riverWidth: 16"),
        ),
      /far-terrain LOD sampling/i,
      "River width must remain visible on the coarsest terrain grid.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "riverWidthVariation: 0.08",
            "riverWidthVariation: 0.12",
          ).replace(
            "riverBendBankAsymmetry: 0.04",
            "riverBendBankAsymmetry: 0.07",
          ),
        ),
      /2\.3 safety envelope/,
      "Combined river width tuning must stay inside the global safety envelope.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "waterRiverPoolFlowScale: 0.80",
            "waterRiverPoolFlowScale: 0.50",
          ),
        ),
      /waterRiverPoolFlowScale must be at least 0.65/,
      "Pool flow scale must stay inside the artist range.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("seed: 42017", "seed: 9007199254740992"),
        ),
      /seed must be a safe integer/,
      "Integer configuration must reject values that cannot be represented exactly.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("seed: 42017", "seed: 4294967296"),
        ),
      /seed must be at most 4294967295/,
      "World procedural seeds must stay inside the uint32 generator domain.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("faunaMinimalDistance: 90", "faunaMinimalDistance: 20"),
        ),
      /fauna animation LOD distances must increase/i,
      "Fauna animation quality bands must be a ladder an actor can resolve.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("terrainRadiusDesktop: 6", "terrainRadiusDesktop: 17"),
        ),
      /terrainRadiusDesktop must be at most 16/,
      "Terrain streaming radius must stay inside the reviewed chunk budget.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource
            .replace("worldSize: 2048", "worldSize: 1024")
            .replace("terrainRadiusDesktop: 6", "terrainRadiusDesktop: 9"),
        ),
      /terrainRadiusDesktop must not exceed half of the world chunk count/,
      "Terrain streaming radius must not iterate beyond the finite world grid.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("horizonApronRings: 16", "horizonApronRings: 0"),
        ),
      /horizon apron must extend at least 448 metres beyond the world edge/i,
      "An enabled horizon shell must cover the complete streamed ring.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("terrainNearResolution: 25", "terrainNearResolution: 257"),
        ),
      /terrainNearResolution must be at most 129/,
      "Terrain topology must reject pathological per-chunk allocations.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("grassPatchSize: 4", "grassPatchSize: 1"),
        ),
      /must not contain more than 32 grass patches per axis/,
      "World grass patches must cap per-chunk grid cardinality.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("grassNearTileSize: 8", "grassNearTileSize: 1"),
        ),
      /must not contain more than 32 near-grass tiles per axis/,
      "Near-grass streaming must cap per-chunk tile cardinality.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace(
            "stoneClusterRadiusMin: 10",
            "stoneClusterRadiusMin: 24",
          ),
        ),
      /stoneClusterRadiusMin must be lower than stoneClusterRadiusMax/,
      "Stone cluster radius range must stay ordered.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource
            .replace("stoneClusterSpacing: 56", "stoneClusterSpacing: 40")
            .replace(
              "stoneClusterCenterJitter: 0.26",
              "stoneClusterCenterJitter: 0.35",
            )
            .replace("stoneClusterRadiusMax: 22", "stoneClusterRadiusMax: 30")
            .replace("stoneClusterHaloRatio: 1.12", "stoneClusterHaloRatio: 1.25"),
        ),
      /must not exceed half of stoneClusterSpacing/,
      "Cluster influence radius must not exceed half of stoneClusterSpacing.",
    );
    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("spawnSearchStep: 24", "spawnSearchStep: 1"),
        ),
      /spawnSearchRadius must not exceed 64 spawnSearchStep intervals/,
      "Spawn discovery must cap synchronous search granularity.",
    );
    await expectReject(
      () => load(grassLoader, grassSource.replace("#2f7c35", "green")),
      /baseColor must be a six-digit hex color/,
      "Invalid grass colors must fail before rendering.",
    );
    await expectReject(
      () =>
        load(
          grassLoader,
          grassSource.replace("seed: 1337", "seed: 4294967296"),
        ),
      /seed must be at most 4294967295/,
      "Island grass seeds must stay inside the uint32 generator domain.",
    );
    await expectReject(
      () =>
        load(
          grassLoader,
          grassSource.replace("instanceCount: 1400", "instanceCount: 100001"),
        ),
      /instanceCount must not exceed 100000/,
      "Standalone grass allocation must reject pathological instance counts.",
    );
    await expectReject(
      () =>
        load(
          grassLoader,
          grassSource
            .replace("instanceCount: 1400", "instanceCount: 100000")
            .replace("bladesPerClump: 12", "bladesPerClump: 20"),
        ),
      /Configured near-grass workload must not exceed 5000000/,
      "Standalone grass allocation must cap the combined instance/topology workload.",
    );
    await expectReject(
      () =>
        load(
          runtimeLoader,
          runtimeSource.replace(
            "desktopShadowMapSize: 1024",
            "desktopShadowMapSize: 1000",
          ),
        ),
      /desktopShadowMapSize must be a power of two/,
      "Runtime shadow maps must remain power-of-two sized.",
    );
    await expectReject(
      () =>
        load(
          runtimeLoader,
          runtimeSource.replace(
            "desktopShadowMapSize: 1024",
            "desktopShadowMapSize: 32768",
          ),
        ),
      /desktopShadowMapSize must be at most 16384/,
      "Runtime shadow maps must stay within the product allocation ceiling.",
    );
    await expectReject(
      () =>
        load(
          runtimeLoader,
          runtimeSource.replace(
            "desktopShadowMapSize: 1024",
            "desktopShadowMapSize: 4294967297",
          ),
        ),
      /desktopShadowMapSize must be a power of two/,
      "Power-of-two validation must not be bypassed by 32-bit integer truncation.",
    );
    await expectReject(
      () =>
        load(
          runtimeLoader,
          runtimeSource.replace(
            "desktopShadowMapSize: 1024",
            "desktopShadowMapSize: 4503599627370495",
          ),
        ),
      /desktopShadowMapSize must be a power of two/,
      "Power-of-two validation must reject large integers whose logarithm rounds to an integer.",
    );

    await expectReject(
      () =>
        load(
          worldLoader,
          worldSource.replace("stoneClusterSpacing: 56", "stoneClusterSpacing: 40")
            .replace("stoneClusterHaloRatio: 1.12", "stoneClusterHaloRatio: 1.25")
            .replace("stoneClusterRadiusMax: 22", "stoneClusterRadiusMax: 16")
            .replace("stoneClusterCenterJitter: 0.26", "stoneClusterCenterJitter: 0.35")
            .replace("stoneCellSize: 16", "stoneCellSize: 64"),
        ),
      /must stay inside the fixed 3x3 macro query/,
      "Cluster footprint, jitter, and cell size must remain inside the fixed 3x3 query.",
    );

    console.log("[config] World, grass, and runtime configuration contracts verified.");
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  await server.close();
}
