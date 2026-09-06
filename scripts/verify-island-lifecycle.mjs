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
    throw new Error(`[island-lifecycle] ${message}`);
  }
}

const island = read("src/app/IslandApp.ts");
const grassSystem = read("src/grass/GrassSystem.ts");
const grassGeometry = read("src/grass/GrassGeometryFactory.ts");
const development = read("src/dev/GrassDevelopmentController.ts");
const qaRunner = read("src/qa/GrassQaRunner.ts");
const qaDownloads = read("src/qa/GrassQaDownloads.ts");
const impostorBaker = read("src/grass/impostors/OctahedralImpostorBaker.ts");

assert(
  island.includes("createIslandRuntimeResources(") &&
    island.includes("disposeIslandRuntimeResources(resources)") &&
    island.includes('disposeSafely("Renderer construction"') &&
    island.includes('disposeSafely("Orbit controls construction"') &&
    island.includes('disposeSafely("Grass system construction"') &&
    island.includes('disposeSafely("Terrain material construction"'),
  "Island renderer, controls, grass, and terrain material must roll back together when construction fails.",
);

assert(
  grassSystem.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    grassSystem.includes("const meshes = this.meshes.splice(0)") &&
    grassSystem.includes("const sourceGeometries = this.sourceGeometries.splice(0)") &&
    grassSystem.includes("this.geometryFactory.disposeInstancedMesh(mesh)") &&
    grassSystem.includes("this.nearMaterial.material") &&
    grassSystem.includes("this.midMaterial.material"),
  "Island grass teardown must detach ownership first and attempt every mesh, shared geometry, and material cleanup.",
);

assert(
  /private createPatch\([\s\S]*?let nearMesh: THREE\.InstancedMesh \| undefined;[\s\S]*?let midMesh: THREE\.InstancedMesh \| undefined;[\s\S]*?try \{[\s\S]*?nearMesh = this\.createMesh\([\s\S]*?midMesh = this\.createMesh\([\s\S]*?return \{[\s\S]*?\} catch \(error\) \{[\s\S]*?disposeIslandGrassMesh\(this\.geometryFactory, midMesh\);[\s\S]*?disposeIslandGrassMesh\(this\.geometryFactory, nearMesh\);/.test(
    grassSystem,
  ),
  "Island patch construction must release an unpublished near mesh when mid mesh or bounds creation fails.",
);

assert(
  /private createMesh\([\s\S]*?const geometry = this\.geometryFactory\.createInstancedGeometry\([\s\S]*?let mesh: THREE\.InstancedMesh \| undefined;[\s\S]*?try \{[\s\S]*?return mesh;[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.geometryFactory\.disposeInstancedGeometry\(geometry\)/.test(
    grassSystem,
  ) &&
    grassGeometry.includes("disposeInstancedGeometry(") &&
    grassGeometry.includes("this.disposeInstancedGeometry(geometry, preserveSharedInstanceData)"),
  "Unpublished island instanced geometry must use the shared borrowed-attribute disposal contract.",
);

const patchCreation = grassSystem.indexOf("const patch = this.createPatch(bucket, variants, config)");
const patchOwnership = grassSystem.indexOf(
  "this.meshes.push(patch.nearMesh, patch.midMesh)",
  patchCreation,
);
const patchSceneAdd = grassSystem.indexOf(
  "this.dependencies.scene.add(patch.nearMesh, patch.midMesh)",
  patchCreation,
);
assert(
  patchCreation >= 0 &&
    patchOwnership > patchCreation &&
    patchSceneAdd > patchOwnership,
  "Completed island patches must enter teardown ownership before scene publication can fail.",
);

assert(
  island.includes("const ISLAND_GLTF_TIMEOUT_MS = 15_000") &&
    island.includes("function loadGltfWithTimeout(") &&
    island.includes("window.setTimeout(() =>") &&
    island.includes("request timed out after ${ISLAND_GLTF_TIMEOUT_MS} ms") &&
    island.includes("window.clearTimeout(timeoutHandle)") &&
    island.includes("disposeModelResourcesSafely(`Late GLTF ${url}`, gltf.scene)") &&
    !island.includes("this.loader.loadAsync(ISLAND_MODEL_PATH)") &&
    !island.includes("this.loader.loadAsync(DECORATIVE_TEXT_MODEL_PATH)"),
  "Island GLTF requests must fail within a bounded interval and dispose models that arrive after timeout.",
);

assert(
  island.includes("renderer.capabilities.maxTextureSize") &&
    /function addIslandLights\([\s\S]*?maxTextureSize: number[\s\S]*?Math\.min\(profile\.shadowMapSize, maxTextureSize\)[\s\S]*?sun\.shadow\.mapSize\.set\(shadowMapSize, shadowMapSize\)/.test(
      island,
    ),
  "Island shadow allocation must stay within the active GPU texture limit.",
);

assert(
  island.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    island.includes("const ownedMaterials = [...materials]") &&
    island.includes("disposeResources([...ownedMaterials, ...textures])") &&
    island.includes("disposeResources([...geometries])") &&
    island.includes("function disposeModelResourcesSafely("),
  "Island model teardown must attempt every material, texture, and geometry cleanup even if one disposer fails.",
);

assert(
  /private configureIsland\([\s\S]*?const meshes: THREE\.Mesh\[\] = \[\];[\s\S]*?root\.traverse\([\s\S]*?meshes\.push\(child\);[\s\S]*?collectMaterials\(child\.material, replacedMaterials\);[\s\S]*?bounds\.setFromObject\(child\)[\s\S]*?if \(!terrain\) \{[\s\S]*?throw new Error\([\s\S]*?for \(const mesh of meshes\) \{[\s\S]*?mesh\.material = this\.terrainMaterial;[\s\S]*?disposeSafely\("Replaced island materials"/.test(
    island,
  ),
  "Island model inspection must finish before app-owned terrain material is published, and replaced imported material cleanup must be non-fatal.",
);

assert(
  island.includes('disposeSafely("Failed island geometry"') &&
    island.includes('disposeSafely("Failed island materials"') &&
    island.includes('disposeModelResourcesSafely("Disposed island model", root)'),
  "Island initialization rollback must preserve the original failure while attempting every still-owned model cleanup.",
);

assert(
  island.includes("private developmentController?: GrassDevelopmentController") &&
    island.includes("this.developmentController = controller") &&
    island.includes('disposeSafely("Development tools"') &&
    island.indexOf('disposeSafely("Development tools"') <
      island.indexOf('disposeSafely("Orbit controls"'),
  "Island development tools must be owned by the app and disposed before their controls/renderer dependencies.",
);

assert(
  /private render = \(\): void => \{[\s\S]*?try \{[\s\S]*?this\.renderer\.render\(this\.scene, this\.camera\);[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.running = false;[\s\S]*?this\.clock\.stop\(\);[\s\S]*?this\.publishFatalFrameError\(error\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?this\.frameHandle = requestAnimationFrame\(this\.render\);/.test(
    island,
  ),
  "Island rendering must schedule the next RAF only after a successful frame and publish a fatal error when an unrelated frame fault stops the loop.",
);

assert(
  island.includes('this.canvas.addEventListener("webglcontextlost", this.handleContextLost)') &&
    island.includes('"webglcontextrestored"') &&
    island.includes('this.canvas.removeEventListener("webglcontextlost", this.handleContextLost)') &&
    /private readonly handleContextLost[\s\S]*?event\.preventDefault\(\);[\s\S]*?this\.resumeAfterContextRestore \|\|= this\.running;[\s\S]*?cancelAnimationFrame\(this\.frameHandle\);/.test(
      island,
    ) &&
    /private readonly handleContextRestored[\s\S]*?this\.contextLost = false;[\s\S]*?if \(!this\.resumeAfterContextRestore\)[\s\S]*?this\.start\(\);/.test(
      island,
    ),
  "Island WebGL context loss must pause the loop, preserve restart intent, resume after restoration, and remove listeners during teardown.",
);

assert(
  /private async loadDecorativeText[\s\S]*?const meshes: THREE\.Mesh\[\] = \[\];[\s\S]*?root\.traverse\([\s\S]*?meshes\.push\(child\);[\s\S]*?collectMaterials\(child\.material, originalMaterials\);[\s\S]*?for \(const mesh of meshes\) \{[\s\S]*?mesh\.material = replacementMaterial;[\s\S]*?disposeSafely\("Replaced decorative materials"[\s\S]*?this\.scene\.add\(root\);/.test(
    island,
  ) &&
    island.includes('disposeSafely("Failed decorative geometry"') &&
    island.includes('disposeSafely("Failed decorative material"') &&
    island.includes('disposeModelResourcesSafely("Disposed decorative model", root)'),
  "Decorative model publication must collect ownership before replacement, tolerate imported-material cleanup faults, and preserve the original publication failure during rollback.",
);

assert(
  development.includes("private readonly abortController = new AbortController()") &&
    development.includes("private bakePanel?: ImpostorDownloadPanel") &&
    development.includes("private qaRunner?: GrassQaRunner") &&
    development.includes("this.abortController.abort()") &&
    development.includes("this.qaRunner?.dispose()") &&
    development.includes("this.bakePanel?.dispose()") &&
    development.includes("this.abortController.signal") &&
    development.includes("delete windowWithResults.__FLUFFY_GRASS_IMPOSTOR_BAKE__") &&
    development.includes("delete windowWithResults.__FLUFFY_GRASS_QA__") &&
    /const result = await baker\.bake\([\s\S]*?if \(this\.disposed\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?createDownloadLinks/.test(
      development,
    ) &&
    /finally \{[\s\S]*?if \(!this\.disposed\) \{[\s\S]*?setLodBakeOverride\(false\)/.test(
      development,
    ),
  "Island development tools must own/abort QA, dispose bake downloads, clean published debug state, suppress late publication, and avoid touching disposed dependencies.",
);

assert(
  /async run\([\s\S]*?signal\?: AbortSignal[\s\S]*?\): Promise<GrassQaReport>/.test(
    qaRunner,
  ) &&
    qaRunner.includes("sampleFrames(options.warmupSeconds, false, signal)") &&
    /sampleFrames\([\s\S]*?options\.sampleSeconds,[\s\S]*?true,[\s\S]*?signal/.test(
      qaRunner,
    ) &&
    qaRunner.includes("this.throwIfUnavailable(signal)") &&
    qaRunner.includes("this.downloads.dispose()") &&
    qaRunner.includes("!signal?.aborted && !this.disposed") &&
    qaRunner.includes('new DOMException("Grass QA aborted.", "AbortError")'),
  "Island grass QA must honor cancellation/disposal before rendering or publishing and own its download resources.",
);

assert(
  qaDownloads.includes("private readonly objectUrls = new Set<string>()") &&
    qaDownloads.includes("private readonly timeoutHandles = new Set<number>()") &&
    qaDownloads.includes("URL.revokeObjectURL(objectUrl)") &&
    qaDownloads.includes("window.clearTimeout(handle)") &&
    qaDownloads.includes("this.panel?.remove()") &&
    qaDownloads.includes("signal?: AbortSignal") &&
    qaDownloads.includes("this.disposed || signal?.aborted"),
  "Grass QA downloads must revoke blob URLs, cancel scheduled clicks, remove their panel, and reject captures after teardown.",
);

assert(
  impostorBaker.includes("export interface ImpostorDownloadPanel") &&
    impostorBaker.includes("const objectUrls = new Set<string>()") &&
    impostorBaker.includes("const timeoutHandles = new Set<number>()") &&
    impostorBaker.includes("URL.revokeObjectURL(objectUrl)") &&
    impostorBaker.includes("window.clearTimeout(handle)") &&
    /dispose: \(\): void => \{[\s\S]*?panel\.remove\(\);/.test(impostorBaker),
  "Impostor bake download panels must own and revoke every blob URL and delayed revocation timer.",
);

console.log(
  "[island-lifecycle] Transactional island/grass construction, bounded asset loading, GPU-limited shadows, context recovery, non-masking rollback, and disposable QA/impostor ownership verified.",
);
