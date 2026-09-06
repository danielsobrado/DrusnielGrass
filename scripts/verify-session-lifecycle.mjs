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
    throw new Error(`[session-lifecycle] ${message}`);
  }
}

const main = read("src/main.ts");
const world = read("src/app/WorldApp.ts");
const statsPanel = read("src/app/WorldStatsPanel.ts");
const visualMatrix = read("src/qa/WorldVisualMatrixRunner.ts");
const metrics = read("src/qa/GrassQaMetrics.ts");
const diagnostics = read("src/runtime/WorldDiagnosticsController.ts");
const resourceDisposal = read("src/render/ResourceDisposal.ts");
const terrainStreamer = read("src/world/TerrainStreamer.ts");
const terrainChunk = read("src/world/TerrainChunk.ts");
const terrainMaterial = read("src/world/TerrainMaterialController.ts");
const waterMaterial = read("src/world/hydrology/WaterMaterialController.ts");
const waterBedMaterial = read("src/world/hydrology/WaterBedMaterialController.ts");
const horizon = read("src/world/horizon/WorldHorizonShell.ts");
const deerAssets = read("src/creatures/deer/DeerAssets.ts");
const villagerAssets = read("src/character/npc/VillagerAssets.ts");

assert(
  main.includes("let visualMatrix: Disposable | undefined") &&
    main.includes("visualMatrix = runner") &&
    main.includes("disposeRuntimeSafely(") &&
    main.includes('disposeSafely("Application", () => app?.dispose())') &&
    main.includes('disposeSafely("UI controller", () => uiController.dispose())'),
  "Bootstrap must own optional visual QA and isolate cleanup so one failing owner cannot block the application teardown.",
);

assert(
  world.includes("private readonly reveal: WorldRevealController;") &&
    !world.includes("private readonly reveal = new WorldRevealController()") &&
    /try \{[\s\S]*?this\.renderer\.outputColorSpace = THREE\.SRGBColorSpace;[\s\S]*?this\.applyRendererSize\(\);[\s\S]*?this\.field = new TerrainField\(config\)/.test(
      world,
    ) &&
    world.includes('disposeConstructionSafely("Scenic layer", () => scenic?.dispose())') &&
    world.includes('disposeConstructionSafely("Minimap", () => minimap?.dispose())') &&
    world.includes('disposeConstructionSafely("World controls", () => controls?.dispose())') &&
    world.includes('disposeConstructionSafely("Grass trail field", () => grassTrailField.dispose())') &&
    world.includes('disposeConstructionSafely("Terrain streamer", () => terrain?.dispose())') &&
    world.includes('disposeConstructionSafely("Environment", () => environment?.dispose())') &&
    world.includes('disposeConstructionSafely("Renderer", () => this.renderer.dispose())'),
  "World construction must include renderer setup, delay the reveal owner, and roll back every successfully-created runtime owner when a later constructor step fails.",
);

assert(
  resourceDisposal.includes("for (const resource of resources)") &&
    resourceDisposal.includes("resource.dispose()") &&
    resourceDisposal.includes("if (!failed)") &&
    resourceDisposal.includes("throw firstError"),
  "Owned-resource cleanup must attempt every resource and only rethrow after the complete cleanup pass.",
);

assert(
  terrainStreamer.includes("let materialController: TerrainMaterialController | undefined") &&
    terrainStreamer.includes("let waterMaterialController: WaterMaterialController | undefined") &&
    terrainStreamer.includes("let waterBedMaterialController: WaterBedMaterialController | undefined") &&
    terrainStreamer.includes('disposeTerrainResource(horizon, "Horizon shell")') &&
    terrainStreamer.includes('disposeTerrainResource(waterBedMaterialController, "Water bed material")') &&
    terrainStreamer.includes('disposeTerrainResource(waterMaterialController, "Water material")') &&
    terrainStreamer.includes('disposeTerrainResource(materialController, "Terrain material")') &&
    terrainStreamer.includes("Terrain chunk cleanup failed."),
  "Terrain streaming must roll back partially constructed render owners and isolate normal teardown failures.",
);

const commitChunkStart = terrainStreamer.indexOf("private commitChunk(chunk: TerrainChunk): void");
const removeChunkStart = terrainStreamer.indexOf("private removeChunk(", commitChunkStart);
const commitChunkSource = terrainStreamer.slice(commitChunkStart, removeChunkStart);
const removeChunkSource = terrainStreamer.slice(removeChunkStart);
const publishMesh = commitChunkSource.indexOf("this.scene.add(chunk.mesh)");
const publishCoverage = commitChunkSource.indexOf(
  "this.horizon?.setChunkCovered(chunk.chunkX, chunk.chunkZ, true)",
);
const publishMap = commitChunkSource.indexOf("this.chunks.set(chunk.key, chunk)");
const retireExisting = commitChunkSource.indexOf("this.removeChunk(existing, false)");
assert(
  commitChunkStart >= 0 &&
    removeChunkStart > commitChunkStart &&
    publishMesh >= 0 &&
    publishCoverage > publishMesh &&
    publishMap > publishCoverage &&
    retireExisting > publishMap &&
    commitChunkSource.includes("this.removeChunk(chunk, !existing)") &&
    commitChunkSource.includes("Unpublished terrain chunk rollback failed.") &&
    removeChunkSource.includes("let firstError: unknown") &&
    removeChunkSource.includes("const attempt = (cleanup: () => void): void =>") &&
    removeChunkSource.includes("attempt(() => this.horizon?.setChunkCovered") &&
    removeChunkSource.includes("attempt(() => this.scene.remove(chunk.mesh))") &&
    removeChunkSource.includes("attempt(() => chunk.dispose())") &&
    removeChunkSource.includes("throw firstError"),
  "Terrain replacement must publish before retiring the last good chunk and attempt every rollback/removal action before surfacing cleanup failure.",
);

assert(
  /private finalize\(\): TerrainChunk \{[\s\S]*?const geometry = new THREE\.BufferGeometry\(\);[\s\S]*?let waterGeometry: THREE\.BufferGeometry \| undefined;[\s\S]*?try \{[\s\S]*?const chunk = new TerrainChunk\([\s\S]*?return chunk;[\s\S]*?\} catch \(error\) \{[\s\S]*?waterGeometry\?\.dispose\(\);[\s\S]*?geometry\.dispose\(\)/.test(
    terrainChunk,
  ),
  "Failed terrain chunk finalization must release unpublished terrain and water geometry.",
);

assert(
  terrainMaterial.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    terrainMaterial.includes(
      "disposeResources([material, surfaceNoiseTexture, macroFieldTexture])",
    ) &&
    /disposeResources\(\[\s*this\.material,\s*this\.surfaceNoiseTexture,\s*this\.macroFieldTexture,\s*\]\)/.test(
      terrainMaterial,
    ) &&
    terrainMaterial.includes("Terrain material construction cleanup failed.") &&
    terrainMaterial.includes("private disposed = false"),
  "Terrain material setup and teardown must attempt every texture it owns — surface noise and the compact profile's baked macro field — even when one disposer fails.",
);

for (const [name, source, constructionCleanup, normalCleanup, cleanupLog] of [
  [
    "Water material",
    waterMaterial,
    "disposeResources([material, flowNoiseTexture])",
    "disposeResources([this.flowNoiseTexture, this.material])",
    "Water material construction cleanup failed.",
  ],
  [
    "Water bed material",
    waterBedMaterial,
    "disposeResources([material, bedTexture])",
    "disposeResources([this.bedTexture, this.material])",
    "Water bed material construction cleanup failed.",
  ],
]) {
  assert(
    source.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
      source.includes("private disposed = false") &&
      source.includes("let material:") &&
      source.includes(constructionCleanup) &&
      source.includes(normalCleanup) &&
      source.includes(cleanupLog),
    `${name} setup and teardown must isolate texture/material disposal failures without masking the original setup error.`,
  );
}

assert(
  horizon.includes("let coverage: WorldHorizonCoverage | undefined") &&
    horizon.includes("let materialController: WorldHorizonMaterial | undefined") &&
    horizon.includes('disposeHorizonResource(materialController, "Horizon material")') &&
    horizon.includes('disposeHorizonResource(coverage, "Horizon coverage")') &&
    /private finalize\(\): void \{[\s\S]*?const geometry = new THREE\.BufferGeometry\(\);[\s\S]*?try \{[\s\S]*?this\.scene\.add\(mesh\);[\s\S]*?this\.mesh = mesh;[\s\S]*?\} catch \(error\) \{[\s\S]*?mesh\?\.removeFromParent\(\);[\s\S]*?geometry\.dispose\(\)/.test(
      horizon,
    ),
  "Horizon construction and final geometry publication must roll back resources that never reach normal ownership.",
);

assert(
  statsPanel.includes("let stats: Stats | undefined") &&
    statsPanel.includes("bindStatsLifetime(stats)") &&
    statsPanel.includes("const dispose = stats.dispose.bind(stats)") &&
    statsPanel.includes("const removeDom = stats.dom.remove.bind(stats.dom)") &&
    statsPanel.includes("stats.dispose = (): void =>") &&
    statsPanel.includes("stats.dom.remove = (): void =>") &&
    /catch \(error\) \{[\s\S]*?stats\?\.dispose\(\);[\s\S]*?Optional stats panel unavailable/.test(
      statsPanel,
    ),
  "Stats panel attachment, normal DOM removal, and explicit disposal must converge on one idempotent profiler cleanup.",
);

assert(
  visualMatrix.includes("private readonly abortController = new AbortController()") &&
    visualMatrix.includes("this.abortController.abort()") &&
    visualMatrix.includes("delete windowWithQa.__FLUFFY_WORLD_VISUAL_QA__") &&
    visualMatrix.includes("this.abortController.signal") &&
    visualMatrix.includes("private disposed = false"),
  "Visual matrix QA must be disposable, abort pending samples, and release its published window API.",
);

assert(
  metrics.includes("signal?: AbortSignal") &&
    metrics.includes("cancelAnimationFrame(frameHandle)") &&
    metrics.includes('signal?.addEventListener("abort", handleAbort, { once: true })') &&
    metrics.includes('signal?.removeEventListener("abort", handleAbort)') &&
    metrics.includes('document.removeEventListener("visibilitychange", handleVisibilityChange)'),
  "QA frame sampling must cancel its RAF and listeners immediately when its owner is disposed.",
);

assert(
  diagnostics.includes("let probe: GrassWorkloadProbe | undefined") &&
    diagnostics.includes("let gpuTimer: GpuFrameTimer | undefined") &&
    diagnostics.includes("let hud: WorldDiagnosticsHud | undefined") &&
    /catch \(error\) \{[\s\S]*?disposeSafely\(hud, "Diagnostics HUD"\);[\s\S]*?disposeSafely\(gpuTimer, "GPU frame timer"\);[\s\S]*?disposeSafely\(probe, "Grass workload probe"\)/.test(
      diagnostics,
    ) &&
    /dispose\(\): void \{[\s\S]*?this\.restoreRenderer\(\);[\s\S]*?disposeSafely\(this\.probe[\s\S]*?disposeSafely\(this\.hud[\s\S]*?disposeSafely\(this\.gpuTimer/.test(
      diagnostics,
    ),
  "Optional diagnostics must roll back partial attachment and isolate teardown failures.",
);

for (const [name, source] of [
  ["Deer assets", deerAssets],
  ["Villager assets", villagerAssets],
]) {
  assert(
    /try \{[\s\S]*?applyActorEnvironmentResponse\(material\);[\s\S]*?return material;[\s\S]*?\} catch \(error\) \{[\s\S]*?material\.dispose\(\);[\s\S]*?throw error;/.test(
      source,
    ) &&
      /try \{[\s\S]*?slots\.set\(slot, mergeActorParts\(list\)\);[\s\S]*?\} finally \{[\s\S]*?part\.geometry\.dispose\(\)/.test(
        source,
      ) &&
      /catch \(error\) \{[\s\S]*?disposeGeometries\(slots\.values\(\)\);[\s\S]*?slots\.clear\(\);[\s\S]*?throw error;/.test(
        source,
      ),
    `${name} must release failed materials, primitive scaffolding, and partially merged geometry.`,
  );
}

console.log(
  "[session-lifecycle] Bootstrap, world/terrain construction and publication, isolated material/terrain cleanup, diagnostics, QA, stats, and actor asset ownership verified.",
);
