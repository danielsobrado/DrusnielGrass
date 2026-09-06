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
    throw new Error(`[cloud-shadow] ${message}`);
  }
}

function yamlNumber(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(-?[0-9.]+)\\s*$`, "m"));
  assert(match, `Missing numeric runtime key ${key}.`);
  const value = Number(match[1]);
  assert(Number.isFinite(value), `Runtime key ${key} must be finite.`);
  return value;
}

const runtime = read("public/config/runtime.yaml");
const runtimeType = read("src/runtime/RuntimeConfig.ts");
const loader = read("src/runtime/RuntimeConfigLoader.ts");
const cloudConfigReader = read("src/runtime/RuntimeCloudConfigReader.ts");
const weather = read("src/world/sky/WorldCloudWeather.ts");
const shadowMap = read("src/world/sky/WorldCloudShadowMap.ts");
const shadowShader = read("src/world/sky/WorldCloudShadowShader.ts");
const sampler = read("src/world/sky/WorldCloudShadowSamplerShader.ts");
const uniforms = read("src/world/sky/WorldCloudShadowUniforms.ts");
const patch = read("src/render/WorldCloudShadowMaterialPatch.ts");
const integrator = read("src/world/sky/WorldCloudShadowSceneIntegrator.ts");
const controller = read("src/app/WorldCloudShadowController.ts");
const environment = read("src/app/WorldEnvironmentController.ts");
const lighting = read("src/app/WorldCloudEnvironmentLighting.ts");
const diagnostics = read("src/app/WorldCloudShadowDebugPanel.ts");
const diagnosticVisibility = read("src/app/WorldCloudShadowDebugVisibility.ts");
const poses = read("src/qa/WorldVisualMatrixPoses.ts");
const isolation = read("src/runtime/WorldIsolationHarness.ts");

for (const prefix of ["desktop", "compact"]) {
  const strength = yamlNumber(runtime, `${prefix}CloudShadowStrength`);
  const minimum = yamlNumber(runtime, `${prefix}CloudMinimumDirectTransmittance`);
  const resolution = yamlNumber(runtime, `${prefix}CloudShadowMapResolution`);
  const worldSize = yamlNumber(runtime, `${prefix}CloudShadowWorldSize`);
  const steps = yamlNumber(runtime, `${prefix}CloudShadowSteps`);
  const edgeFade = yamlNumber(runtime, `${prefix}CloudShadowEdgeFade`);
  const fadeStart = yamlNumber(runtime, `${prefix}CloudShadowDistanceFadeStart`);
  const fadeEnd = yamlNumber(runtime, `${prefix}CloudShadowDistanceFadeEnd`);
  const darkestAuthored = Math.max(minimum, 1 - strength);
  assert(strength >= 0 && strength <= 0.35, `${prefix} shadow strength is unsafe.`);
  assert(minimum >= 0.65 && minimum <= 1, `${prefix} minimum transmittance is unsafe.`);
  assert(darkestAuthored >= minimum, `${prefix} authored transmittance violates its floor.`);
  assert(resolution >= 64 && resolution <= 512, `${prefix} resolution is outside the bounded range.`);
  assert(worldSize >= 256 && worldSize <= 4096, `${prefix} world footprint is invalid.`);
  assert(steps >= 1 && steps <= 6, `${prefix} integration steps are invalid.`);
  assert(edgeFade >= 0 && edgeFade <= 0.25, `${prefix} edge fade is invalid.`);
  assert(fadeEnd > fadeStart, `${prefix} distance fade must be ordered.`);
}

for (const key of [
  "shadowMapResolution",
  "shadowWorldSize",
  "shadowSteps",
  "shadowEdgeFade",
  "shadowDistanceFadeStart",
  "shadowDistanceFadeEnd",
]) {
  assert(runtimeType.includes(`${key}: number`), `RuntimeCloudConfig must expose ${key}.`);
}
assert(
  loader.includes('import { readRuntimeCloudConfig } from "./RuntimeCloudConfigReader"') &&
    loader.includes("cloud: Object.freeze(readRuntimeCloudConfig(reader, prefix))") &&
    cloudConfigReader.includes('key("ShadowMapResolution")') &&
    cloudConfigReader.includes('key("ShadowWorldSize")') &&
    cloudConfigReader.includes('key("ShadowSteps")') &&
    cloudConfigReader.includes("shadowDistanceFadeEnd <= shadowDistanceFadeStart"),
  "Cloud shadow config must be delegated to and validated by the cloud config reader.",
);
assert(
  shadowShader.includes("physicalTransmittance = exp(-opticalDepth * uCloudExtinction)") &&
    shadowShader.includes("uCloudMinimumDirectTransmittance") &&
    shadowShader.includes("gl_FragColor = vec4(transmittance, clamp(opticalDepth"),
  "The target must store bounded direct-sun transmittance plus diagnostic density, not overlay darkness.",
);
assert(
  weather.includes("sampleCloudShadowTransmittance(") &&
    weather.includes("sampleCloudPointDirectTransmittance(") &&
    weather.includes("worldY >= cloudTop") &&
    weather.includes("startFraction") &&
    weather.includes("remainingFraction") &&
    weather.includes("sampleHeight - worldY") &&
    weather.includes("config.shadowSteps") &&
    weather.includes("sampleCloudVerticalProfile(") &&
    weather.includes("resolveAuthoredTransmittance(config, opticalDepth)") &&
    weather.includes("config.minimumDirectTransmittance"),
  "CPU transmittance must mirror the GPU full-layer field while handling points inside or above the cloud layer.",
);
assert(
  shadowMap.includes("THREE.RGBAFormat") &&
    shadowMap.includes("THREE.UnsignedByteType") &&
    shadowMap.includes("THREE.LinearFilter") &&
    shadowMap.includes("THREE.ClampToEdgeWrapping") &&
    shadowMap.includes("depthBuffer: false") &&
    shadowMap.includes("generateMipmaps = false") &&
    shadowMap.includes("Math.round(focusCloudX / texelSize) * texelSize") &&
    shadowMap.includes("sampleCloudPointDirectTransmittance(") &&
    shadowMap.includes("focus.x,") &&
    shadowMap.includes("focus.y,") &&
    shadowMap.includes("focus.z,") &&
    shadowMap.includes("renderer.getViewport(this.viewport)") &&
    shadowMap.includes("renderer.getScissor(this.scissor)") &&
    shadowMap.includes("renderer.getScissorTest()") &&
    shadowMap.includes("renderer.setScissorTest(false)") &&
    shadowMap.includes("renderer.setRenderTarget(previousTarget)") &&
    shadowMap.includes("renderer.setViewport(this.viewport)") &&
    shadowMap.includes("renderer.setScissor(this.scissor)") &&
    shadowMap.includes("renderer.setScissorTest(previousScissorTest)") &&
    shadowMap.includes("private isContextLost(): boolean") &&
    shadowMap.includes("this.renderer.getContext().isContextLost()") &&
    shadowMap.includes("this.suspendSpatialShadows();") &&
    shadowMap.includes("this.consumerUniforms.uCloudShadowEnabled.value = 1;") &&
    shadowMap.includes("this.isContextLost() ||") &&
    shadowMap.includes("let renderTarget: THREE.WebGLRenderTarget | undefined") &&
    shadowMap.includes("geometry?.dispose()") &&
    shadowMap.includes("material?.dispose()") &&
    shadowMap.includes("renderTarget?.dispose()") &&
    shadowMap.includes("private releaseGpuResources(): void"),
  "The transmittance target must be cheap, altitude-correct, filtered, texel-snapped, context-loss safe, transactional, and restore render target/viewport/scissor state.",
);
assert(
  sampler.includes("uCloudBaseHeight - worldPosition.y") &&
    sampler.includes("projectedCloudXZ") &&
    sampler.includes("return 1.0;") &&
    sampler.includes("edgeCoverage") &&
    sampler.includes("uCloudShadowDistanceFadeStart") &&
    sampler.includes("uCloudFocusTransmittance") &&
    sampler.includes("resolveRelativeCloudDirectLight"),
  "Consumers must project world height, fade map edges/distance to clear light, and normalize spatial contrast.",
);
assert(
  uniforms.includes("uCloudShadowMap") &&
    uniforms.includes("uCloudShadowOriginXZ") &&
    uniforms.includes("uCloudFocusTransmittance"),
  "Every consumer must share one stable cloud-shadow uniform bundle.",
);
assert(
  patch.includes("reflectedLight.directDiffuse *=") &&
    patch.includes("reflectedLight.directSpecular *=") &&
    !patch.includes("diffuseColor *= worldCloudDirectScale") &&
    !patch.includes("outgoingLight *= worldCloudDirectScale") &&
    patch.includes("directionalLights[0].color * worldCloudDirectScale") &&
    patch.includes("waterGlintBreakup * waterCloudDirectScale") &&
    patch.includes("uWaterCausticStrength * waterBedCloudDirectScale"),
  "Spatial shadows must affect direct diffuse/specular, terrain wet sheen, water glint, and bed caustics without darkening ambient/final color.",
);
assert(
  patch.includes("patchGrassBladeCloudShadowMaterial") &&
    patch.includes("grassWorldRoot.xyz") &&
    patch.includes("vWorldCloudDirectScale") &&
    patch.includes("grassBackLight *= vWorldCloudDirectScale") &&
    patch.includes("grassSheen *= vWorldCloudDirectScale"),
  "Blade grass must sample at the root/vertex path and attenuate direct transmission and sheen.",
);
assert(
  patch.includes("patchGrassVertexLitShaderMaterial") &&
    patch.includes("directionalLights[i].color * worldCloudDirectScale") &&
    patch.includes("vGrassBackLight = worldCloudDirectScale * pow("),
  "Impostor/detail foliage vertex lighting must share spatial direct-light modulation.",
);
assert(
  integrator.includes("HORIZON_RESPONSE_STRENGTH = 0.35") &&
    integrator.includes('object.name.startsWith("world-tree-")') &&
    integrator.includes('name.startsWith("world-stone-")') &&
    integrator.includes('name === "world-hydrology-water-bed-material"') &&
    integrator.includes("for (let index = 0; index < mesh.material.length; index += 1)") &&
    integrator.includes("this.patchOnce(object, mesh.material)") &&
    !integrator.includes("const materials = Array.isArray"),
  "Horizon, trees, stones, water bed, and allocation-free material scanning must participate in one integrator.",
);
assert(
  environment.includes("new WorldCloudShadowController(") &&
    controller.includes("new WorldCloudShadowMap(renderer, profile)") &&
    controller.includes("new WorldCloudShadowSceneIntegrator(") &&
    controller.includes("this.map.update(focus, elapsedSeconds)") &&
    controller.includes("this.integrator.update(deltaSeconds)") &&
    controller.includes('disposeSafely(this.map, "Cloud shadow map")') &&
    lighting.includes("sampleCloudPointDirectTransmittance(") &&
    lighting.includes("focus.x,") &&
    lighting.includes("focus.y,") &&
    lighting.includes("focus.z,") &&
    lighting.includes("SUN_DIRECTION,") &&
    !lighting.includes("sampleCloudDirectTransmittance") &&
    !lighting.includes("sampleCloudShadowTransmittance") &&
    lighting.includes("getAppliedDirectTransmittance(): number") &&
    lighting.includes("getWeatherState(): Readonly<WorldCloudWeatherState>"),
  "Environment ownership must update/dispose one cloud-shadow wrapper while global and spatial direct light share altitude-aware focus transmittance.",
);
assert(
  diagnostics.includes("Spatial cloud shadow") &&
    diagnostics.includes("Global cloud direct") &&
    diagnostics.includes("Sun shadow map") &&
    diagnostics.includes("Terrain") &&
    diagnostics.includes("Grass") &&
    diagnostics.includes("Water") &&
    diagnostics.includes("global/applied T:") &&
    diagnostics.includes("weather:") &&
    diagnostics.includes("T range:") &&
    diagnostics.includes("density:") &&
    diagnostics.includes("readPixels") &&
    diagnosticVisibility.includes("material.visible = false") &&
    !diagnosticVisibility.includes("object.visible ="),
  "Diagnostics must binary-search lighting/visibility and show live spatial/global weather values without overriding runtime object culling.",
);
for (const pose of [
  "cs0-black-region-water-regression",
  "cs2-cloud-shadow-meadow",
  "cs3-cloud-shadow-slope",
  "cs6-cloud-shadow-elevated",
  "cs6-cloud-shadow-water",
]) {
  assert(poses.includes(`\"${pose}\"`), `Missing deterministic cloud-shadow visual pose ${pose}.`);
}
assert(
  diagnostics.includes('params.get("cloudShadows") !== "off"') &&
    diagnostics.includes('params.get("cloudDirect") !== "off"') &&
    diagnostics.includes('params.get("sunShadows") !== "off"') &&
    isolation.includes('params.get("noGrass") === "1"') &&
    isolation.includes('params.get("basicMaterials") === "1"'),
  "CS0 must retain deterministic poses plus independent lighting, grass, and base-material isolation toggles.",
);

console.log(
  "[cloud-shadow] Bounded world-space transmittance, altitude-aware focus normalization, direct-only terrain/grass/water/scenic integration, context-loss-safe offscreen rendering, full renderer-state restoration, diagnostics, lifecycle, and CS0 isolation tooling verified.",
);
