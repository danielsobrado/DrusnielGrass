import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Build gate for procedural stone geometry, runtime behavior, and cost. */
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

const configSource = readFileSync(
  resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
  "utf8",
);
const baseline = JSON.parse(
  readFileSync(
    resolve(REPOSITORY_ROOT, "qa/stones/stone-performance-baseline.json"),
    "utf8",
  ),
);

function verifyZeroChanceVergeFastPath() {
  const source = readFileSync(
    resolve(REPOSITORY_ROOT, "src/world/stones/StoneField.ts"),
    "utf8",
  );
  const start = source.indexOf("private generateCell(");
  const end = source.indexOf("private resolveCluster(", start);
  if (start < 0 || end <= start) {
    throw new Error("[stones] Unable to inspect StoneField.generateCell().");
  }
  const generateCell = source.slice(start, end);
  const guard = generateCell.indexOf("if (this.config.stoneVergeChance > 0)");
  const geology = generateCell.indexOf(
    "this.clusterField.sampleGeologyPotential(",
  );
  const placement = generateCell.indexOf("this.addVergeStones(");
  if (guard < 0 || geology <= guard || placement <= geology) {
    throw new Error(
      "[stones] stoneVergeChance=0 must reject before verge geology and placement work.",
    );
  }
}

function verifyStoneSystemConstructionOwnership() {
  const source = readFileSync(
    resolve(REPOSITORY_ROOT, "src/world/stones/WorldStoneSystem.ts"),
    "utf8",
  );
  const helper = source.indexOf("function createStoneRuntimeResources(");
  const helperEnd = source.indexOf("function createGrainTexture()", helper);
  if (helper < 0 || helperEnd <= helper) {
    throw new Error(
      "[stones] Unable to inspect transactional stone render-resource setup.",
    );
  }
  const setup = source.slice(helper, helperEnd);
  const shaderSetup = setup.indexOf("applyStoneSurfaceShader(");
  const registration = setup.indexOf(
    "clearanceRegistration = registerStoneClearanceField(",
  );
  const rollback = setup.indexOf("disposeResources([", registration);
  if (
    !source.includes("const resources = createStoneRuntimeResources(") ||
    shaderSetup < 0 ||
    registration <= shaderSetup ||
    rollback <= registration ||
    !setup.includes("clearanceRegistration,") ||
    !setup.includes("grainTexture,") ||
    !setup.includes("detailMaterial,") ||
    !setup.includes("coarseMaterial,") ||
    !setup.includes("Stone construction cleanup failed.")
  ) {
    throw new Error(
      "[stones] Stone render resources and global clearance ownership must publish as one transaction and roll back every acquired resource on failure.",
    );
  }
}

verifyZeroChanceVergeFastPath();
verifyStoneSystemConstructionOwnership();

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
  const verification = await server.ssrLoadModule(
    "/src/world/stones/StoneVerification.ts",
  );
  const profileVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneProfileVerification.ts",
  );
  const runtimeVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneRuntimeVerification.ts",
  );
  const growthVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneGrowthVerification.ts",
  );
  const reliefVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneReliefVerification.ts",
  );
  const clearanceRegistrationVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneClearanceRegistrationVerification.ts",
  );
  const clusterConfigVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneClusterConfigVerification.ts",
  );
  const clusterVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneClusterVerification.ts",
  );
  const formationVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneFormationVerification.ts",
  );
  const silhouetteVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneSilhouetteVerification.ts",
  );
  const pathVerification = await server.ssrLoadModule(
    "/src/world/stones/StonePathPlacementVerification.ts",
  );
  const pathFootprintVerification = await server.ssrLoadModule(
    "/src/world/stones/StonePathFootprintVerification.ts",
  );
  const edgeVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneWorldEdgeVerification.ts",
  );
  const clusterPerformanceVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneClusterPerformanceVerification.ts",
  );
  const shaderVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneShaderPerformanceVerification.ts",
  );
  const performanceVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneRenderPerformanceVerification.ts",
  );
  const systemPerformanceVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneSystemPerformanceVerification.ts",
  );
  const latestRegressionVerification = await server.ssrLoadModule(
    "/src/world/stones/StoneLatestRegressionVerification.ts",
  );

  const summary = await verification.verifyStones(configSource);
  const profileSummary = profileVerification.verifyStoneProfiles();
  const runtimeSummary =
    runtimeVerification.verifyRuntimeStoneVariants(configSource);
  const growthSummary = growthVerification.verifyStoneGrowthField();
  const reliefSummary = reliefVerification.verifyStoneRelief();
  const clearanceRegistrationSummary =
    clearanceRegistrationVerification.verifyStoneClearanceRegistration();
  const clusterConfigSummary =
    clusterConfigVerification.verifyStoneClusterConfig(configSource);
  const clusterSummary = clusterVerification.verifyStoneClusters(configSource);
  const formationSummary = formationVerification.verifyStoneFormations();
  const silhouetteSummary =
    silhouetteVerification.verifyStoneSilhouetteQuality();
  const pathSummary = pathVerification.verifyStonePathPlacement();
  const pathFootprintSummary =
    pathFootprintVerification.verifyStonePathFootprints(configSource);
  const edgeSummary = edgeVerification.verifyStoneWorldEdges(configSource);
  const clusterPerformanceSummary =
    clusterPerformanceVerification.verifyStoneClusterPerformance(
      configSource,
      baseline,
    );
  const shaderSummary =
    shaderVerification.verifyStoneShaderPerformance(configSource);
  const performanceSummary =
    performanceVerification.verifyStoneRenderPerformance(configSource);
  const systemPerformanceSummary =
    systemPerformanceVerification.verifyStoneSystemPerformance(configSource);
  const latestRegressionSummary =
    latestRegressionVerification.verifyLatestStoneRegressions(configSource);

  console.log(
    `[stones] OK · ${summary} · ${profileSummary} · ${runtimeSummary} · ${growthSummary} · ${reliefSummary} · ${clearanceRegistrationSummary} · ${clusterConfigSummary} · ${clusterSummary} · ${formationSummary} · ${silhouetteSummary} · ${pathSummary} · ${pathFootprintSummary} · ${edgeSummary} · ${clusterPerformanceSummary} · ${shaderSummary} · ${performanceSummary} · ${systemPerformanceSummary} · ${latestRegressionSummary}`,
  );
} catch (error) {
  console.error(`[stones] ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await server.close();
}
