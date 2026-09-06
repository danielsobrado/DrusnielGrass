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
    throw new Error(`[runtime-safety] ${message}`);
  }
}

const main = read("src/main.ts");
const world = read("src/app/WorldApp.ts");
const statsPanel = read("src/app/WorldStatsPanel.ts");
const island = read("src/app/IslandApp.ts");
const islandGrass = read("src/grass/GrassSystem.ts");
const seededRandom = read("src/grass/internal/SeededRandom.ts");
const interactionField = read("src/grass/interaction/GrassInteractionField.ts");
const trailField = read("src/grass/interaction/GrassTrailField.ts");
const windNoise = read("src/grass/wind/WindNoiseTexture.ts");
const qualityGovernor = read("src/runtime/GrassQualityGovernor.ts");
const diagnosticsController = read("src/runtime/WorldDiagnosticsController.ts");
const workloadProbe = read("src/runtime/GrassWorkloadProbe.ts");
const workloadHud = read("src/runtime/WorldDiagnosticsHud.ts");
const viewportSizing = read("src/runtime/ViewportSizing.ts");
const qaMetrics = read("src/qa/GrassQaMetrics.ts");
const qaRunner = read("src/qa/GrassQaRunner.ts");
const stoneField = read("src/world/stones/StoneField.ts");
const stoneClusterTuning = read("src/world/stones/StoneClusterTuning.ts");
const nearField = read("src/world/grass/WorldNearGrassField.ts");
const tileField = read("src/world/grass/WorldSingleBladeTileField.ts");
const scenicLayer = read("src/world/scenic/WorldScenicLayer.ts");
const faunaSystem = read("src/world/scenic/WorldFaunaSystem.ts");
const thirdPersonController = read("src/controls/ThirdPersonController.ts");
const thirdPersonInput = read("src/controls/ThirdPersonInput.ts");
const flyController = read("src/controls/FlyController.ts");
const uiController = read("src/runtime/UiVisibilityController.ts");
const worldConfigSchema = read("src/world/WorldConfigSchema.ts");

assert(
  main.includes('params.get("diagnostics") === "1"') &&
    /await import\(\s*"\.\/runtime\/WorldDiagnosticsController"\s*\)/.test(main) &&
    !main.includes('import { WorldDiagnosticsController }'),
  "Deep world diagnostics must remain opt-in and outside the default bundle path.",
);
assert(
  main.includes('params.get("qa") === "visual-matrix"') &&
    /await import\(\s*"\.\/qa\/WorldVisualMatrixRunner"\s*\)/.test(main) &&
    !main.includes('import { WorldVisualMatrixRunner }') &&
    world.includes("attachVisualMatrix()"),
  "World visual-matrix QA must remain opt-in and outside the default bundle path.",
);
assert(
  world.includes('params.get("riverTuning") === "1"') &&
    /await import\(\s*"\.\.\/dev\/RiverDevelopmentConfig"\s*\)/.test(world) &&
    /await import\(\s*"\.\/RiverArtMenu"\s*\)/.test(world) &&
    !world.includes('import { RiverArtMenu }') &&
    !world.includes('import { applyRiverDevelopmentConfig }'),
  "River tuning must remain opt-in and outside the default bundle path.",
);
assert(
  world.includes("Optional river tuning unavailable.") &&
    /try \{[\s\S]*?await app\.attachRiverArtMenu\(\);[\s\S]*?\} catch \(error\) \{/.test(world),
  "Optional river tuning failures must not abort the world startup path.",
);
assert(
  main.includes('statsPanelEnabled: params.get("stats") === "1"') &&
    world.includes("attachWorldStatsPanel") &&
    world.includes("this.stats?.update()") &&
    statsPanel.includes('await import("stats-gl")') &&
    statsPanel.includes("Optional stats panel unavailable") &&
    diagnosticsController.includes("options.gpuTiming && !options.statsPanelEnabled"),
  "The lazy stats-gl panel and custom GPU timer must not issue overlapping GPU timing queries.",
);
assert(
  workloadProbe.includes('near?.bridgeField, "near-bridge"') &&
    workloadProbe.includes('case "near-bridge"') &&
    workloadProbe.includes("nearBridgeInstances") &&
    workloadHud.includes("snapshot.nearBridgeInstances"),
  "Grass workload diagnostics must count bridge submissions through collection and presentation.",
);
assert(
  main.includes("app?.dispose()") &&
    main.includes("uiController.dispose()") &&
    main.includes("if (event.persisted || disposed)") &&
    main.includes("catch (error)"),
  "Bootstrap must release partially-created runtime resources and preserve bfcache restores.",
);
assert(
  world.includes("private disposed = false") &&
    world.includes("Number.isFinite(rawDeltaSeconds)") &&
    statsPanel.includes("Optional stats panel unavailable") &&
    /await import\(\s*"\.\.\/world\/grass\/WorldDetailFoliageAtlasDebug"\s*\)/.test(world) &&
    !world.includes('import { appendDetailFoliageAtlasDebugCanvas }'),
  "World runtime must be idempotent, frame-safe, and keep optional diagnostics off the default path.",
);
assert(
  world.includes("this.notifyFrameObservers(deltaSeconds)") &&
    world.includes("this.frameObservers.delete(observer)") &&
    world.includes('this.runtimeGuard.recordSubsystemFailure("frame-observer", error)'),
  "A failing optional frame observer must be detached without aborting later frame subsystems.",
);
assert(
  scenicLayer.includes("private treesEnabled = true") &&
    scenicLayer.includes("private faunaEnabled = true") &&
    scenicLayer.includes("this.disposeTrees()") &&
    scenicLayer.includes("this.disposeFauna()") &&
    scenicLayer.includes("Trees disabled after a fault") &&
    scenicLayer.includes("Fauna disabled after a fault"),
  "Tree and fauna failures must stay inside their scenic failure domains.",
);
assert(
  faunaSystem.includes("const rosterRebuilt =") &&
    /if \(!slot\.active\) \{[\s\S]*?this\.recycle\(slot, focus\)[\s\S]*?continue;/.test(
      faunaSystem,
    ) &&
    !faunaSystem.includes("behaviorClock") &&
    faunaSystem.includes(
      "(index / Math.max(count, 1)) * this.behaviorInterval",
    ) &&
    faunaSystem.includes('disposeActor(slot.actor, "Deer actor")') &&
    faunaSystem.includes('disposeActor(villager.actor, "Villager actor")') &&
    /catch \(error\) \{[\s\S]*?this\.dispose\(\);[\s\S]*?throw error;/.test(
      faunaSystem,
    ),
  "Fauna recycling must reactivate bounded pool slots, keep decisions evenly staggered, and clean partial construction safely.",
);
assert(
  viewportSizing.includes("Math.max(1, window.innerWidth)") &&
    viewportSizing.includes("Math.max(1, window.innerHeight)") &&
    viewportSizing.includes("Number.isFinite(devicePixelRatio)") &&
    world.includes("this.pixelRatio = resolvePixelRatio(this.profile.maxPixelRatio)") &&
    world.includes("this.camera.aspect = resolveViewportSize().aspect") &&
    island.includes("this.renderer.setPixelRatio(resolvePixelRatio(this.profile.maxPixelRatio))") &&
    island.includes("this.applyViewportSize()"),
  "World and island renderers must refresh safe viewport dimensions and the current device pixel ratio on resize.",
);
assert(
  island.includes('revisionedAssetPath("./island.glb")') &&
    island.includes('revisionedAssetPath("./fluffy_grass_text.glb")') &&
    island.includes("encodeURIComponent(APP_VERSION)"),
  "Island public GLB assets must be revision-busted with the deployed source version.",
);
assert(
  island.includes("ISLAND_MAX_DELTA_SECONDS") &&
    island.includes("Number.isFinite(rawDeltaSeconds)") &&
    island.includes("THREE.MathUtils.clamp("),
  "Island rendering must clamp resumed or invalid frame deltas before updating grass animation.",
);
assert(
  /else if \(subsystem === "stones"\) \{[\s\S]*?this\.stonesEnabled = false;[\s\S]*?this\.disposeSafely\("Stone system"/.test(
    world,
  ) &&
    /else if \(subsystem === "grass"\) \{[\s\S]*?this\.grassEnabled = false;[\s\S]*?this\.disposeGrassResources\(\);[\s\S]*?\}/.test(
      world,
    ) &&
    /private disposeGrassResources\(\): void \{[\s\S]*?this\.disposeSafely\("Grass system"[\s\S]*?this\.grass\.dispose\(\)[\s\S]*?this\.disposeSafely\("Grass trail field"[\s\S]*?grassTrailField\.dispose\(\)/.test(
      world,
    ),
  "Failed stone and grass frames must isolate cleanup faults while releasing their owned resources.",
);
assert(
  world.includes("private disposeSafely(label: string, dispose: () => void): void") &&
    world.includes('this.disposeSafely("Runtime guard"') &&
    world.includes('this.disposeSafely("Scenic layer"') &&
    world.includes('this.disposeSafely("Renderer"'),
  "World teardown must continue releasing later owners when an earlier cleanup fails.",
);
assert(
  /await import\(\s*"\.\.\/dev\/GrassDevelopmentController"\s*\)/.test(island) &&
    !island.includes('import { GrassDevelopmentController }') &&
    island.includes("private disposed = false") &&
    island.includes("disposeObjectGeometry") &&
    island.includes("disposeObjectMaterials") &&
    island.includes("disposeMaterialResources") &&
    island.includes("value instanceof THREE.Texture") &&
    island.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    island.includes("disposeResources([...ownedMaterials, ...textures])"),
  "Island QA code must stay lazy and loaded assets must release geometry, materials, and textures through complete resource disposal.",
);
assert(
  islandGrass.includes("private disposed = false") &&
    islandGrass.includes("this.assertNotDisposed()") &&
    islandGrass.includes("if (this.disposed)") &&
    islandGrass.includes('throw new Error("GrassSystem has been disposed.")'),
  "Island grass initialization must not resurrect resources after disposal.",
);
assert(
  seededRandom.includes(
    "this.state = (this.state + 0x6d2b79f5) >>> 0;",
  ),
  "Seeded procedural random state must wrap to uint32 every step instead of growing past JavaScript's exact integer range.",
);
assert(
  qaMetrics.includes('document.addEventListener("visibilitychange"') &&
    qaMetrics.includes('document.removeEventListener("visibilitychange"') &&
    qaMetrics.includes("previousTime = undefined") &&
    qaMetrics.includes("elapsedMs += frameDuration"),
  "QA frame sampling must exclude hidden-tab suspension and release its visibility listener.",
);
assert(
  qaRunner.includes("position: [camera.position.x") &&
    qaRunner.includes("target: [controls.target.x") &&
    qaRunner.includes("const previousEnableDamping = controls.enableDamping") &&
    qaRunner.includes("controls.enableDamping = false") &&
    qaRunner.includes("controls.enableDamping = previousEnableDamping"),
  "QA captures must report the actual camera pose and eliminate OrbitControls damping drift while sampling.",
);
assert(
  stoneClusterTuning.includes("STONE_CELL_SOURCE_MARGIN = 1") &&
    stoneField.includes("Math.floor(minX / this.cellSize) - STONE_CELL_SOURCE_MARGIN") &&
    stoneField.includes("Math.floor((maxX - 1e-3) / this.cellSize) + STONE_CELL_SOURCE_MARGIN"),
  "Stone chunk collection must inspect neighboring source cells for split, satellite, and verge roots displaced across chunk edges.",
);
assert(
  interactionField.includes("validateConfig(config)") &&
    interactionField.includes("Number.isFinite(deltaSeconds)") &&
    interactionField.includes("Number.isFinite(normalizedImpact)") &&
    interactionField.includes("Number.isFinite(pose.distanceTravelled)"),
  "Grass interaction state must reject invalid configuration and runtime input.",
);
assert(
  trailField.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
    trailField.includes("validateConfig(next)") &&
    trailField.includes("areFinite(") &&
    trailField.includes("Number.isFinite(deltaSeconds)") &&
    trailField.includes("renderer.setRenderTarget(previousRenderTarget)") &&
    trailField.includes("this.resetPendingFrame()") &&
    trailField.includes("const pendingTargets: THREE.WebGLRenderTarget[] = []") &&
    trailField.includes("let pendingGeometry: THREE.PlaneGeometry | undefined") &&
    trailField.includes("Pending grass trail target cleanup failed.") &&
    trailField.includes("Grass trail attach cleanup failed.") &&
    /private releaseTargets\(\): void \{[\s\S]*?const quad = this\.quad;[\s\S]*?this\.quad = undefined;[\s\S]*?this\.material = undefined;[\s\S]*?this\.targets = undefined;[\s\S]*?disposeResources\(\[/.test(
      trailField,
    ) &&
    /new WorldRuntimeGuard\([\s\S]*?\(enabled\) => \{[\s\S]*?this\.rendererEnabled = enabled;[\s\S]*?if \(enabled && !useFlyControls\) \{[\s\S]*?this\.disposeSafely\("Grass trail context restore"[\s\S]*?grassTrailField\.configure\(\{\}\)/.test(
      world,
    ),
  "Grass trail feedback must reject invalid inputs, restore renderer state, roll back partial attachment, clear singleton ownership before complete resource disposal, and rebuild neutral feedback targets after WebGL restoration.",
);
const windOwnershipClear = windNoise.indexOf("sharedTexture = undefined;");
const windDispose = windNoise.indexOf("texture?.dispose();", windOwnershipClear);
assert(
  windNoise.includes("const texture = sharedTexture;") &&
    windOwnershipClear >= 0 &&
    windDispose > windOwnershipClear,
  "Shared grass wind ownership must clear before texture disposal so cleanup failure cannot poison recreation.",
);
assert(
  qualityGovernor.includes("Number.isFinite(deltaSeconds)") &&
    qualityGovernor.includes("MAX_SAMPLE_DELTA_SECONDS") &&
    qualityGovernor.includes("this.resetSamplingWindow()") &&
    qualityGovernor.includes("private nearDistanceScale = 1") &&
    qualityGovernor.includes("nearDistance !== this.nearDistanceScale") &&
    qualityGovernor.includes("this.nearDistanceScale = pinned.nearDistanceScale") &&
    qualityGovernor.includes("return this.nearDistanceScale"),
  "Grass quality control must reject invalid samples and ramp near-distance changes without breaking pinned QA tiers.",
);
assert(
  nearField.includes("private nearDistanceScale = 1") &&
    nearField.includes("this.nearDistanceScale = nearDistanceScale") &&
    nearField.includes("direction.nearDistance * nearDistanceScale") &&
    nearField.includes("this.nearDistanceScale,") &&
    nearField.includes("NEAR_FIELD_ALTITUDE_MARGIN"),
  "Aerial near-field suspension must follow the applied quality-scaled near radius.",
);
assert(
  tileField.includes("tile.mesh.count = count") &&
    tileField.includes("tile.mesh.visible = count > 0") &&
    tileField.includes("enabled && tile.mesh.count > 0"),
  "Zero-count near-grass tiles must not remain visible draw submissions.",
);
assert(
  thirdPersonController.includes("Number.isFinite(deltaSeconds)") &&
    thirdPersonController.includes("private disposed = false") &&
    thirdPersonController.includes("if (this.disposed)"),
  "Third-person movement must reject invalid frame deltas and be disposal-safe.",
);
assert(
  flyController.includes("Number.isFinite(deltaSeconds)") &&
    flyController.includes("private disposed = false") &&
    flyController.includes("this.canvas.style.touchAction = this.previousTouchAction") &&
    flyController.includes('event.code === "KeyF" && !event.repeat') &&
    flyController.includes("normalizeWheelDeltaPixels(event)") &&
    flyController.includes("event.deltaMode") &&
    flyController.includes("WHEEL_PIXELS_PER_SPEED_DOUBLING") &&
    flyController.includes("deltaPixels === 0"),
  "Flight input must reject invalid frame deltas, restore canvas state, normalize wheel speed changes, ignore horizontal wheel events, and ignore repeated reset keys.",
);
assert(
  thirdPersonInput.includes("private disposed = false") &&
    thirdPersonInput.includes("this.clearTransientInput()") &&
    thirdPersonInput.includes("this.canvas.style.touchAction = this.previousTouchAction") &&
    thirdPersonInput.includes("normalizeWheelDeltaPixels(event)") &&
    thirdPersonInput.includes("event.deltaMode") &&
    thirdPersonInput.includes('event.code === "KeyF" && !event.repeat') &&
    /private clearTransientInput\(\): void \{[\s\S]*?this\.resetRequested = false;[\s\S]*?this\.zoomDelta = 0;[\s\S]*?\}/.test(
      thirdPersonInput,
    ),
  "Third-person input must clear queued state, restore canvas state, normalize wheel units, and ignore repeated reset keys.",
);
assert(
  uiController.includes("removeEventListener") &&
    uiController.includes("private initialized = false"),
  "UI visibility controls must be disposable and initialization-idempotent.",
);
assert(
  worldConfigSchema.includes(
    "grassFarImpostorsPerPatch: { minimum: 1, maximum: 1, integer: true }",
  ),
  "World config must enforce the one-instance/four-card far-impostor contract.",
);

console.log("[runtime-safety] Production runtime lifecycle and hot-path guards verified.");
