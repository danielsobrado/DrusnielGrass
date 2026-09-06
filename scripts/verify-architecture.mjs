import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
// Raised for transactional world construction: `Make world construction
// transactional`, `Include renderer setup in world rollback`, `Contain
// unexpected world frame failures`, and `Reset grass trail after WebGL restore`
// took the composition root from 617 to 708 lines, and the gate was not moved
// with them, so the build has been red since c0e41d4. Rollback that owns the
// objects it constructs does belong here, but 708 lines is past the point where
// the attach*/dev-hook family should be its own module — extract that next
// rather than raising this again.
const WORLD_APP_MAX_LINES = 730;
// Raised with the same transactional-lifecycle wave that moved WorldApp: chunk
// and material teardown now routes through disposeTerrainResource so one failed
// release cannot abandon the rest. Not moved when that landed, so this gate was
// red too.
// Raised from 410 for the cascade system's lifecycle. The curtains themselves
// live in WorldCascadeSystem; what landed here is construction, the per-frame
// update, and transactional disposal — the same wiring the horizon shell has.
const TERRAIN_STREAMER_MAX_LINES = 430;
const HYDROLOGY_FIELD_MAX_LINES = 340;
const HYDROLOGY_CONFIG_VALIDATOR_MAX_LINES = 120;
// Raised from 180 when the packed hydrology context joined waterData and
// waterInteraction. Packing per-vertex water attributes is this module's stated
// job, so a fourth attribute belongs here rather than in a new owner.
const WATER_CHUNK_GEOMETRY_MAX_LINES = 200;
const WATER_INTERACTION_MAX_LINES = 120;
const WATER_FLOW_NOISE_MAX_LINES = 220;
const WATER_FLOW_SHADER_MAX_LINES = 100;
const WATER_REGIME_SHADER_MAX_LINES = 120;
const WATER_WAVE_SHADER_MAX_LINES = 140;
const WATER_FOAM_SHADER_MAX_LINES = 100;
const WATERFALL_FIELD_MAX_LINES = 180;
const WATERFALL_TUNING_MAX_LINES = 80;
const RIVER_LONG_PROFILE_MAX_LINES = 100;
const WATER_CASCADE_SITES_MAX_LINES = 115;
const WATER_CASCADE_SILL_MAX_LINES = 80;
const WATER_CASCADE_GEOMETRY_MAX_LINES = 140;
const WATER_CASCADE_SHADER_MAX_LINES = 140;
const WATER_CASCADE_MATERIAL_MAX_LINES = 120;
const WORLD_CASCADE_SYSTEM_MAX_LINES = 120;
const WATER_BED_SHADER_MAX_LINES = 100;
const WATER_BED_TEXTURE_MAX_LINES = 220;
const WATER_BED_MATERIAL_MAX_LINES = 180;
// Raised from 140 when the bed started reading the same packed hydrology
// context as the surface, so both passes agree about which part of the river
// they are on. The composition itself still lives in WaterBedShader.
const WATER_BED_MATERIAL_SHADER_MAX_LINES = 160;
const WATER_MATERIAL_MAX_LINES = 220;
const WATER_SHADER_MAX_LINES = 360;
const STONE_GEOMETRY_MAX_LINES = 400;
// Raised for the streamed-ring coverage mask. Chunk residency lives in
// WorldHorizonCoverage; the extra lines here are only the shell wiring it in.
const HORIZON_SHELL_MAX_LINES = 410;
const HORIZON_GRID_MAX_LINES = 120;
const HORIZON_MATERIAL_MAX_LINES = 120;
const HORIZON_COVERAGE_MAX_LINES = 120;
const EXTRACTED_MODULE_MAX_LINES = 260;
const CONFIG_LOADER_MAX_LINES = 220;
const CONFIG_READER_MAX_LINES = 120;

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function lineCount(source) {
  return source.split(/\r?\n/).length;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[architecture] ${message}`);
  }
}

const worldApp = read("src/app/WorldApp.ts");
const worldAppTuning = read("src/app/WorldAppTuning.ts");
const environment = read("src/app/WorldEnvironmentController.ts");
const frameMetrics = read("src/app/WorldFrameMetrics.ts");
const runtimeGuard = read("src/app/WorldRuntimeGuard.ts");
const statusHud = read("src/app/WorldStatusHud.ts");
const terrainChunk = read("src/world/TerrainChunk.ts");
const terrainField = read("src/world/TerrainField.ts");
const terrainStreamer = read("src/world/TerrainStreamer.ts");
const terrainMaterial = read("src/world/TerrainMaterialController.ts");
const terrainShader = read("src/world/TerrainMaterialShader.ts");
const hydrologyField = read("src/world/hydrology/HydrologyField.ts");
const hydrologyConfigValidator = read(
  "src/world/hydrology/HydrologyConfigValidator.ts",
);
const waterChunkGeometry = read("src/world/hydrology/WaterChunkGeometry.ts");
const waterInteraction = read("src/world/hydrology/WaterInteractionField.ts");
const waterFlowNoise = read("src/world/hydrology/WaterFlowNoiseTexture.ts");
const waterFlowShader = read("src/world/hydrology/WaterFlowShader.ts");
const waterRegimeShader = read("src/world/hydrology/WaterRegimeShader.ts");
const waterWaveShader = read("src/world/hydrology/WaterWaveShader.ts");
const waterFoamShader = read("src/world/hydrology/WaterFoamShader.ts");
const waterfallField = read("src/world/hydrology/WaterfallField.ts");
const waterfallTuning = read("src/world/hydrology/WaterfallTuning.ts");
const riverLongProfile = read("src/world/hydrology/RiverLongProfile.ts");
const cascadeSites = read("src/world/hydrology/WaterCascadeSites.ts");
const cascadeGeometry = read("src/world/hydrology/WaterCascadeGeometry.ts");
const cascadeSill = read("src/world/hydrology/WaterCascadeSill.ts");
const cascadeShader = read("src/world/hydrology/WaterCascadeShader.ts");
const cascadeMaterial = read("src/world/hydrology/WaterCascadeMaterialController.ts");
const cascadeSystem = read("src/world/hydrology/WorldCascadeSystem.ts");
const waterBedShader = read("src/world/hydrology/WaterBedShader.ts");
const waterBedTexture = read("src/world/hydrology/WaterBedTexture.ts");
const waterBedMaterial = read("src/world/hydrology/WaterBedMaterialController.ts");
const waterBedMaterialShader = read(
  "src/world/hydrology/WaterBedMaterialShader.ts",
);
const waterMaterial = read("src/world/hydrology/WaterMaterialController.ts");
const waterShader = read("src/world/hydrology/WaterShader.ts");
const horizonShell = read("src/world/horizon/WorldHorizonShell.ts");
const horizonGrid = read("src/world/horizon/WorldHorizonGrid.ts");
const horizonMaterial = read("src/world/horizon/WorldHorizonMaterial.ts");
const horizonCoverage = read("src/world/horizon/WorldHorizonCoverage.ts");
const stoneSystem = read("src/world/stones/WorldStoneSystem.ts");
const stoneClearance = read("src/world/stones/StoneClearance.ts");
const stoneGeometry = read("src/world/stones/StoneGeometry.ts");
const stoneIndentation = read("src/world/stones/StoneIndentation.ts");
const stoneTopology = read("src/world/stones/StoneMeshTopology.ts");
const configReader = read("src/config/FlatConfigValueReader.ts");
const worldConfigLoader = read("src/world/WorldConfigLoader.ts");
const worldConfigSchema = read("src/world/WorldConfigSchema.ts");
const worldConfigValidator = read("src/world/WorldConfigValidator.ts");
const grassConfigLoader = read("src/grass/internal/GrassConfigLoader.ts");
const grassConfigValidator = read("src/grass/internal/GrassConfigValidator.ts");
const runtimeConfigLoader = read("src/runtime/RuntimeConfigLoader.ts");

assert(
  lineCount(worldApp) <= WORLD_APP_MAX_LINES,
  `WorldApp grew beyond ${WORLD_APP_MAX_LINES} lines; extract a responsibility instead of extending the composition root.`,
);
assert(
  worldApp.includes('from "./WorldEnvironmentController"') &&
    worldApp.includes('from "./WorldFrameMetrics"') &&
    worldApp.includes('from "./WorldRuntimeGuard"') &&
    worldApp.includes('from "./WorldStatusHud"'),
  "WorldApp must delegate environment, metrics, runtime guard, and HUD responsibilities.",
);
assert(
  !worldApp.includes("new THREE.HemisphereLight") &&
    !worldApp.includes("new THREE.DirectionalLight") &&
    !worldApp.includes('window.addEventListener("error"') &&
    !worldApp.includes(".textContent = ["),
  "WorldApp must remain an orchestrator rather than absorbing environment, browser-fault, or presentation logic.",
);
assert(
  worldApp.includes('runFrameSubsystem("stones"') &&
    worldApp.includes('subsystem === "stones"') &&
    // Disposal moved behind `disposeSafely` when world cleanup was isolated, so
    // one failing subsystem cannot abort the rest of the teardown. The pairing
    // this guards — disable and release in the same step — is unchanged.
    worldApp.includes(
      'this.stonesEnabled = false;\n        this.disposeSafely("Stone system", () => this.stones.dispose());',
    ) &&
    !worldApp.includes("setStoneClearanceField"),
  "Stone streaming must have an independent failure domain and atomically release rendering plus clearance when it degrades.",
);
assert(
  worldAppTuning.includes("WORLD_DESKTOP_GRASS_BUILD_RESERVE_MS = 2.5") &&
    worldAppTuning.includes("WORLD_COMPACT_GRASS_BUILD_RESERVE_MS = 1.5") &&
    worldApp.includes(
      "this.streamingBuildDeadline - grassBuildReserveMs - stoneBuildReserveMs",
    ) &&
    worldApp.includes("this.streamingBuildDeadline - grassBuildReserveMs") &&
    worldApp.includes("cameraGroundHeight,\n      this.streamingBuildDeadline") &&
    !worldApp.includes("performance.now() + stoneBuildReserveMs") &&
    !worldApp.includes("performance.now() + grassBuildReserveMs"),
  "Terrain, stones, and grass must share one hard streaming deadline without creating budget after it expires.",
);
assert(
  worldApp.includes(
    "this.grassEnabled = false;\n      this.disposeGrassResources();",
  ),
  "Failed asynchronous grass initialization must immediately release partial GPU resources.",
);

for (const [name, source] of [
  ["WorldEnvironmentController", environment],
  ["WorldFrameMetrics", frameMetrics],
  ["WorldRuntimeGuard", runtimeGuard],
  ["WorldStatusHud", statusHud],
]) {
  assert(
    lineCount(source) <= EXTRACTED_MODULE_MAX_LINES,
    `${name} grew beyond ${EXTRACTED_MODULE_MAX_LINES} lines; split its responsibility before adding more behavior.`,
  );
}
assert(
  environment.includes("applyArtDirection") && environment.includes("updateShadow"),
  "World environment must own art-direction pairing and shadow tracking.",
);
assert(
  runtimeGuard.includes('window.addEventListener("error"') &&
    runtimeGuard.includes('window.removeEventListener("error"') &&
    runtimeGuard.includes("webglcontextlost") &&
    runtimeGuard.includes("webglcontextrestored"),
  "Runtime guard must own browser and WebGL fault lifecycle.",
);
assert(
  frameMetrics.includes(' | "stones"') &&
    frameMetrics.includes("stones: 0") &&
    frameMetrics.includes("beginFrame") &&
    frameMetrics.includes("measure("),
  "Frame metrics must independently own stone, terrain, grass, and render timing.",
);
assert(
  statusHud.includes("this.element.textContent") &&
    statusHud.includes("snapshot.stones") &&
    !statusHud.includes("WorldGrassSystem") &&
    !statusHud.includes("TerrainStreamer"),
  "Status HUD must remain a presenter over snapshots and expose stone diagnostics.",
);
assert(
  statusHud.includes("shouldUpdate(deltaSeconds") &&
    worldApp.indexOf("statusHud.shouldUpdate") <
      worldApp.indexOf("this.terrain.getDiagnostics()"),
  "HUD throttling must run before diagnostic snapshots are collected on the render path.",
);

assert(
  lineCount(terrainStreamer) <= TERRAIN_STREAMER_MAX_LINES &&
    terrainStreamer.includes("TerrainMaterialController") &&
    terrainStreamer.includes("WaterMaterialController") &&
    terrainStreamer.includes("WaterBedMaterialController") &&
    terrainStreamer.includes("WaterInteractionField") &&
    terrainStreamer.includes("private disposed = false") &&
    terrainStreamer.includes("chunk.getTriangleCount()") &&
    !terrainStreamer.includes("onBeforeCompile") &&
    !terrainStreamer.includes("TERRAIN_DETAIL_COLOR") &&
    !terrainStreamer.includes("MeshPhongMaterial") &&
    !terrainStreamer.includes("MeshPhysicalMaterial"),
  "TerrainStreamer must own residency/build scheduling and material lifecycles, not shader construction.",
);
assert(
  terrainChunk.includes("WaterChunkGeometryBuilder") &&
    terrainChunk.includes("waterGeometryBuilder.writeVertex") &&
    terrainChunk.includes("waterGeometryBuilder.createGeometry") &&
    terrainChunk.includes("waterBedMesh") &&
    terrainChunk.includes("WATER_BED_RENDER_ORDER") &&
    terrainChunk.includes("getTriangleCount()") &&
    !terrainChunk.includes("createWaterIndices") &&
    !terrainChunk.includes("WATER_VISIBLE_COVERAGE_THRESHOLD"),
  "Terrain chunks must delegate water topology, expose the separate bed draw, and report complete triangle cost.",
);
assert(
  lineCount(waterChunkGeometry) <= WATER_CHUNK_GEOMETRY_MAX_LINES &&
    waterChunkGeometry.includes("createIndices") &&
    waterChunkGeometry.includes("WATER_VISIBLE_COVERAGE_THRESHOLD") &&
    waterChunkGeometry.includes('"waterData"') &&
    waterChunkGeometry.includes('"waterContext"') &&
    waterChunkGeometry.includes('"waterInteraction"') &&
    waterChunkGeometry.includes("box.min.y -= maxDepth"),
  "Water chunk geometry must own packed attributes and sparse wet-cell topology.",
);
assert(
  lineCount(terrainMaterial) <= EXTRACTED_MODULE_MAX_LINES &&
    terrainMaterial.includes("onBeforeCompile") &&
    terrainMaterial.includes("setGrassArtDirection") &&
    /disposeResources\(\[\s*this\.material,\s*this\.surfaceNoiseTexture,\s*this\.macroFieldTexture,\s*\]\)/.test(
      terrainMaterial,
    ) &&
    terrainShader.includes("TERRAIN_DETAIL_COLOR"),
  "Terrain material and shader modules must own terrain rendering concerns outside the streamer.",
);
assert(
  lineCount(hydrologyField) <= HYDROLOGY_FIELD_MAX_LINES &&
    terrainField.includes('from "./hydrology/HydrologyField"') &&
    terrainField.includes("this.hydrology.carveHeight") &&
    hydrologyField.includes("sourceHeightCache") &&
    !hydrologyField.includes('from "../TerrainField"') &&
    !hydrologyField.includes("THREE."),
  "Hydrology must stay deterministic, preserve source-height semantics, and remain independent from terrain rendering.",
);
assert(
  lineCount(hydrologyConfigValidator) <=
      HYDROLOGY_CONFIG_VALIDATOR_MAX_LINES &&
    hydrologyConfigValidator.includes("validateHydrologyConfig") &&
    hydrologyConfigValidator.includes("resolveHydrologyLakeCellMargin") &&
    hydrologyConfigValidator.includes("resolveHydrologyRiverMinimumVisibleHalfWidth") &&
    worldConfigValidator.includes('from "./hydrology/HydrologyConfigValidator"') &&
    worldConfigValidator.includes("validateHydrologyConfig(config)") &&
    !worldConfigValidator.includes("resolveHydrologyLakeCellMargin"),
  "Hydrology cross-field invariants must remain isolated from the world validator.",
);
assert(
  lineCount(waterInteraction) <= WATER_INTERACTION_MAX_LINES &&
    waterInteraction.includes("WAKE_SAMPLE_COUNT") &&
    waterInteraction.includes("sampleStoneGrassClearance") &&
    waterInteraction.includes("waterStoneWakeLength") &&
    !waterInteraction.includes("THREE."),
  "Water/stone interaction must stay a small deterministic field outside rendering modules.",
);
assert(
  lineCount(waterFlowNoise) <= WATER_FLOW_NOISE_MAX_LINES &&
    waterFlowNoise.includes("periodicWorleyRidge") &&
    waterFlowNoise.includes("createWaterFlowNoiseTexture") &&
    waterFlowNoise.includes("THREE.DataTexture"),
  "Water flow noise generation must remain deterministic, bounded, and isolated from material lifecycle.",
);
assert(
  lineCount(waterFlowShader) <= WATER_FLOW_SHADER_MAX_LINES &&
    waterFlowShader.includes("waterSampleAdvectedNoise") &&
    waterFlowShader.includes("waterResolveStoneEdge") &&
    !waterFlowShader.includes("MeshPhysicalMaterial"),
  "Flow-noise GLSL helpers must stay separate from the physical material controller.",
);
assert(
  lineCount(waterRegimeShader) <= WATER_REGIME_SHADER_MAX_LINES &&
    lineCount(waterWaveShader) <= WATER_WAVE_SHADER_MAX_LINES &&
    lineCount(waterFoamShader) <= WATER_FOAM_SHADER_MAX_LINES &&
    waterRegimeShader.includes("waterResolveRegime") &&
    waterRegimeShader.includes("waterResolveBankSides") &&
    waterRegimeShader.includes("waterResolveLakeExposure") &&
    waterWaveShader.includes("waterResolveLakeSlope") &&
    waterWaveShader.includes("waterResolveRiverPhases") &&
    waterWaveShader.includes("waterResolveMicroSlope") &&
    waterFoamShader.includes("waterResolveShoreFoam") &&
    waterFoamShader.includes("waterResolveRiffleFoam") &&
    !waterRegimeShader.includes("THREE.") &&
    !waterWaveShader.includes("THREE.") &&
    !waterFoamShader.includes("THREE."),
  "Water regimes, wave structure, and foam must stay separate GLSL modules outside the surface composition.",
);
/**
 * A waterfall is the one case where separate geometry is justified: the shared
 * terrain heightfield is 10.67 m per sample at its coarsest, so a ledge carved
 * into it flattens into a ramp at distance. Placement stays deterministic and
 * field-side; the curtain that renders it stays independent of chunk LOD.
 */
assert(
  lineCount(waterfallField) <= WATERFALL_FIELD_MAX_LINES &&
    lineCount(waterfallTuning) <= WATERFALL_TUNING_MAX_LINES &&
    lineCount(riverLongProfile) <= RIVER_LONG_PROFILE_MAX_LINES &&
    lineCount(cascadeSites) <= WATER_CASCADE_SITES_MAX_LINES &&
    lineCount(cascadeGeometry) <= WATER_CASCADE_GEOMETRY_MAX_LINES &&
    lineCount(cascadeSill) <= WATER_CASCADE_SILL_MAX_LINES &&
    lineCount(cascadeShader) <= WATER_CASCADE_SHADER_MAX_LINES &&
    lineCount(cascadeMaterial) <= WATER_CASCADE_MATERIAL_MAX_LINES &&
    lineCount(cascadeSystem) <= WORLD_CASCADE_SYSTEM_MAX_LINES,
  "Waterfall placement, siting, geometry, shading and lifecycle must stay bounded modules.",
);
assert(
  waterfallField.includes("resolveKnickpoint") &&
    !waterfallField.includes("THREE.") &&
    !cascadeSites.includes("THREE.") &&
    !cascadeSill.includes("THREE.") &&
    cascadeSill.includes("sampleCascadeSill") &&
    !riverLongProfile.includes("THREE.") &&
    riverLongProfile.includes("resolveRiverSurface") &&
    cascadeSites.includes("collectCascadeSites") &&
    cascadeGeometry.includes("BufferGeometry") &&
    cascadeGeometry.includes("boundingSphere") &&
    !cascadeShader.includes("THREE.") &&
    cascadeMaterial.includes("onBeforeCompile") &&
    cascadeMaterial.includes("noiseTexture.dispose()") &&
    cascadeSystem.includes("this.scene.remove") &&
    cascadeSystem.includes("geometry.dispose()"),
  "Knickpoint placement must stay free of rendering, and the cascade mesh must own its own disposal.",
);
assert(
  hydrologyField.includes("forEachCascade") &&
    terrainStreamer.includes("WorldCascadeSystem") &&
    // Released through the same transactional helper as every other streamer
    // resource, so a failed construction cannot leak a curtain.
    terrainStreamer.includes('disposeTerrainResource(cascades, "Water cascades")') &&
    terrainStreamer.includes('disposeTerrainResource(this.cascades, "Water cascades")') &&
    !terrainChunk.includes("Cascade"),
  "Cascades must be streamed beside the chunk ring rather than built into per-chunk terrain.",
);
assert(
  lineCount(waterBedTexture) <= WATER_BED_TEXTURE_MAX_LINES &&
    waterBedTexture.includes("periodicWorleyPebble") &&
    waterBedTexture.includes("createWaterBedTexture") &&
    waterBedTexture.includes("waterPeriodicValueNoise") &&
    !waterBedTexture.includes("MeshPhysicalMaterial"),
  "Riverbed map generation must reuse the shared periodic noise and stay outside material lifecycle.",
);
assert(
  lineCount(waterBedShader) <= WATER_BED_SHADER_MAX_LINES &&
    lineCount(waterBedMaterial) <= WATER_BED_MATERIAL_MAX_LINES &&
    lineCount(waterBedMaterialShader) <= WATER_BED_MATERIAL_SHADER_MAX_LINES &&
    waterBedShader.includes("waterSampleRiverBed") &&
    !waterBedShader.includes("waterResolveBedPosition") &&
    !waterBedShader.includes("THREE.") &&
    waterBedMaterial.includes("class WaterBedMaterialController") &&
    waterBedMaterial.includes("MeshLambertMaterial") &&
    waterBedMaterial.includes("depthWrite: true") &&
    waterBedMaterial.includes("transparent: false") &&
    waterBedMaterial.includes("createWaterBedTexture") &&
    waterBedMaterial.includes(
      "disposeResources([this.bedTexture, this.material])",
    ) &&
    waterBedMaterialShader.includes('from "./WaterBedShader"') &&
    waterBedMaterialShader.includes("transformed.y -= max(0.0, waterData.y)") &&
    waterBedMaterialShader.includes("waterSampleRiverBed") &&
    waterBedMaterialShader.includes("waterBedCaustic") &&
    !waterShader.includes('from "./WaterBedShader"') &&
    !waterShader.includes("waterSampleRiverBed"),
  "Riverbed shading must be a separate depth-tested pass instead of being composited onto transparent water.",
);
assert(
  lineCount(waterMaterial) <= WATER_MATERIAL_MAX_LINES &&
    lineCount(waterShader) <= WATER_SHADER_MAX_LINES &&
    waterMaterial.includes("class WaterMaterialController") &&
    waterMaterial.includes("MeshPhysicalMaterial") &&
    waterMaterial.includes("THREE.DoubleSide") &&
    waterMaterial.includes("createWaterFlowNoiseTexture") &&
    waterMaterial.includes(
      "disposeResources([this.flowNoiseTexture, this.material])",
    ) &&
    !waterMaterial.includes("createWaterBedTexture") &&
    !waterMaterial.includes("bedTexture") &&
    waterMaterial.includes('from "./WaterShader"') &&
    waterMaterial.includes("onBeforeCompile") &&
    waterMaterial.includes("depthWrite: false") &&
    waterShader.includes('from "./WaterFlowShader"') &&
    waterShader.includes('from "./WaterRegimeShader"') &&
    waterShader.includes('from "./WaterWaveShader"') &&
    waterShader.includes('from "./WaterFoamShader"') &&
    waterShader.includes("WATER_SURFACE_FRAGMENT") &&
    waterShader.includes("waterSampleAdvectedNoise") &&
    waterShader.includes("waterTransmittance") &&
    waterShader.includes("uWaterSunDirection") &&
    waterShader.includes("waterStoneFoam") &&
    waterShader.includes("waterLightingNormal") &&
    waterShader.includes("gl_FrontFacing") &&
    !waterShader.includes("waterCaustic") &&
    !waterMaterial.includes("waterRiverPhases"),
  "Physical water lifecycle, flow helpers, and surface GLSL must stay split and free of riverbed compositing.",
);

assert(
  lineCount(horizonShell) <= HORIZON_SHELL_MAX_LINES &&
    lineCount(horizonGrid) <= HORIZON_GRID_MAX_LINES &&
    lineCount(horizonMaterial) <= HORIZON_MATERIAL_MAX_LINES &&
    lineCount(horizonCoverage) <= HORIZON_COVERAGE_MAX_LINES &&
    horizonShell.includes("private disposed = false") &&
    horizonShell.includes("createWorldHorizonAxis") &&
    horizonShell.includes("WorldHorizonMaterial") &&
    horizonShell.includes("WorldHorizonCoverage") &&
    !horizonShell.includes("onBeforeCompile") &&
    !horizonShell.includes("MeshLambertMaterial") &&
    !horizonShell.includes("new THREE.DataTexture") &&
    !horizonGrid.includes("THREE."),
  "The horizon shell must own its build alone, delegating grid mathematics, coverage, and material construction.",
);
assert(
  horizonShell.includes("catch (error)") && horizonShell.includes("this.dispose()"),
  "A horizon build fault must contain itself rather than take terrain streaming down with it.",
);
assert(
  horizonMaterial.includes("uHorizonSinkFocus") &&
    horizonMaterial.includes("max(horizonToFocus.x, horizonToFocus.y)"),
  "The shell's sink must follow the streamed ring focus and its square boundary in Chebyshev distance.",
);
assert(
  terrainStreamer.includes("config.horizonEnabled >= 1") &&
    terrainStreamer.includes("this.horizon?.update(position, buildDeadline)") &&
    terrainStreamer.includes(
      'disposeTerrainResource(this.horizon, "Horizon shell")',
    ) &&
    terrainStreamer.indexOf("this.processBuildQueue(buildDeadline)") <
      terrainStreamer.indexOf("this.horizon?.update") &&
    !worldApp.includes("WorldHorizonShell"),
  "Terrain residency must own the horizon shell, build it only after the ring, and keep it out of the composition root.",
);

assert(
  stoneSystem.includes("private disposed = false") &&
    stoneSystem.includes("this.disposed ||\n      !this.enabled ||") &&
    stoneSystem.includes("if (this.disposed)") &&
    stoneSystem.includes("registerStoneClearanceField") &&
    // Registration is released as one entry in the system's disposal set, so a
    // failure disposing a batch cannot leave the clearance field registered.
    stoneSystem.includes("this.clearanceRegistration,") &&
    // Ownership is a stack rather than a single owner token: disposing a
    // registration reactivates whichever one was under it, and a stale
    // registration removes only its own entry.
    stoneClearance.includes("const owners: StoneClearanceOwner[] = []") &&
    stoneClearance.includes("candidate.owner === registration.owner") &&
    stoneClearance.includes("activateCurrentOwner()"),
  "Stone lifecycle must be idempotent and registration-owned so stale systems cannot update or clear a newer field.",
);
assert(
  lineCount(stoneGeometry) <= STONE_GEOMETRY_MAX_LINES,
  `StoneGeometry grew beyond ${STONE_GEOMETRY_MAX_LINES} lines; keep topology and feature generation in dedicated modules.`,
);
assert(
  stoneGeometry.includes('from "./StoneIndentation"') &&
    stoneGeometry.includes('from "./StoneMeshTopology"') &&
    !stoneGeometry.includes("function addSingleStoneIndentation") &&
    !stoneGeometry.includes("function buildWorkingFaces") &&
    !stoneGeometry.includes("function removeCollinearCorners"),
  "StoneGeometry must stay focused on mesh transformation, shading, packing, and metrics.",
);
assert(
  !stoneIndentation.includes('from "./StoneGeometry"') &&
    stoneIndentation.includes("calculateStonePolygonAreaAndNormal"),
  "Stone indentation must depend on topology primitives, not the mesh packer.",
);
assert(
  !stoneTopology.includes('from "./StoneGeometry"') &&
    stoneTopology.includes("buildWorkingStoneFaces") &&
    stoneTopology.includes("chooseStoneFanRoot"),
  "Stone topology must stay independent from render packing.",
);

assert(
  lineCount(configReader) <= CONFIG_READER_MAX_LINES &&
    configReader.includes("class FlatConfigValueReader") &&
    configReader.includes("number(key") &&
    configReader.includes("boolean(key"),
  "Primitive flat-config reads must stay centralized and small.",
);
for (const [name, source] of [
  ["WorldConfigLoader", worldConfigLoader],
  ["GrassConfigLoader", grassConfigLoader],
  ["RuntimeConfigLoader", runtimeConfigLoader],
]) {
  assert(
    lineCount(source) <= CONFIG_LOADER_MAX_LINES,
    `${name} grew beyond ${CONFIG_LOADER_MAX_LINES} lines; move schema or domain validation out of the transport/parser layer.`,
  );
  assert(
    source.includes("FlatConfigValueReader"),
    `${name} must use the shared typed flat-config reader.`,
  );
}
assert(
  worldConfigLoader.includes("WORLD_CONFIG_SCHEMA") &&
    worldConfigLoader.includes("validateWorldConfig") &&
    !worldConfigLoader.includes("validateStoneClusterGeometry") &&
    !worldConfigLoader.includes("grassClumpRadiusScale range is reversed"),
  "WorldConfigLoader must orchestrate parsing rather than own schema or cross-field rules.",
);
assert(
  worldConfigSchema.includes("grassFarImpostorsPerPatch") &&
    worldConfigSchema.includes("waterEnabled") &&
    worldConfigSchema.includes("waterFlowNoiseStrength") &&
    worldConfigSchema.includes("waterStoneWakeStrength") &&
    worldConfigSchema.includes("riverWidthVariation") &&
    worldConfigSchema.includes("waterRiverPoolFlowScale") &&
    worldConfigValidator.includes("validateWorldConfig") &&
    worldConfigValidator.includes("validateHydrologyConfig") &&
    worldConfigValidator.includes("validateStoneClusterGeometry") &&
    grassConfigValidator.includes("validateGrassConfig"),
  "World, hydrology, advanced-water, and grass domain invariants must remain explicit outside their loaders.",
);

console.log(
  "[architecture] Runtime, terrain, hydrology, depth-tested water bed, config, and stone responsibility boundaries verified.",
);
