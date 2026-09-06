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
    throw new Error(`[environment-lifecycle] ${message}`);
  }
}

const sky = read("src/world/sky/WorldSky.ts");
const cloudMaterial = read("src/world/sky/WorldSkyMaterial.ts");
const cloudField = read("src/world/sky/WorldCloudFieldShader.ts");
const cloudShader = read("src/world/sky/WorldSkyCloudShader.ts");
const cloudWeather = read("src/world/sky/WorldCloudWeather.ts");
const cloudLighting = read("src/app/WorldCloudEnvironmentLighting.ts");
const cloudVolumeController = read(
  "src/world/sky/WorldSkyCloudVolumeController.ts",
);
const cloudVolumePass = read("src/world/sky/WorldCloudTemporalPass.ts");
const cloudVolumeShader = read("src/world/sky/WorldCloudVolumeShader.ts");
const cloudTemporalShader = read("src/world/sky/WorldCloudTemporalShader.ts");
const cloudVolumeQuality = read("src/world/sky/WorldCloudVolumeQuality.ts");
const cloudShadowMap = read("src/world/sky/WorldCloudShadowMap.ts");
const cloudShadowShader = read("src/world/sky/WorldCloudShadowShader.ts");
const cloudShadowSampler = read(
  "src/world/sky/WorldCloudShadowSamplerShader.ts",
);
const cloudShadowIntegrator = read(
  "src/world/sky/WorldCloudShadowSceneIntegrator.ts",
);
const cloudShadowPatch = read("src/render/WorldCloudShadowMaterialPatch.ts");
const cloudShadowController = read("src/app/WorldCloudShadowController.ts");
const cloudShadowDebug = read("src/app/WorldCloudShadowDebugPanel.ts");
const cloudShadowDebugVisibility = read(
  "src/app/WorldCloudShadowDebugVisibility.ts",
);
const environment = read("src/app/WorldEnvironmentController.ts");
const runtimeConfig = read("src/runtime/RuntimeConfig.ts");
const runtimeYaml = read("public/config/runtime.yaml");
const worldApp = read("src/app/WorldApp.ts");

assert(
  sky.includes("vSkyDirection = worldPosition.xyz - cameraPosition;") &&
    !sky.includes("vSkyDirection = worldPosition.xyz;"),
  "The sky direction must stay camera-relative.",
);
assert(
  sky.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
    sky.includes("private environmentTarget?: THREE.WebGLRenderTarget") &&
    sky.includes("environmentTarget = pmrem.fromScene") &&
    sky.includes("this.environmentTarget = environmentTarget") &&
    sky.includes("this.scene.environment = environmentTarget.texture") &&
    !sky.includes("environmentTexture?.dispose()"),
  "The PMREM output must remain target-owned.",
);
assert(
  sky.includes("this.mesh = createSkyMesh(this.scene)") &&
    sky.includes("function createSkyMesh(") &&
    sky.includes("let material: THREE.ShaderMaterial | undefined") &&
    sky.includes("let geometry: THREE.SphereGeometry | undefined") &&
    sky.includes("Sky construction cleanup failed.") &&
    /catch \(error\) \{[\s\S]*?disposeResources\(\[[\s\S]*?mesh\?\.removeFromParent\(\)[\s\S]*?geometry,[\s\S]*?material,[\s\S]*?\]\);[\s\S]*?throw error;/.test(
      sky,
    ),
  "Sky construction must roll back partially-created GPU resources.",
);
assert(
  sky.includes("private initializeEnvironment(): void") &&
    sky.includes("new THREE.PMREMGenerator(this.renderer)") &&
    sky.includes("let environmentTarget: THREE.WebGLRenderTarget | undefined") &&
    sky.includes("Sky environment bake unavailable; continuing without IBL.") &&
    sky.includes("disposeResources([environmentTarget])") &&
    sky.includes("bakeMaterial.dispose()") &&
    /finally \{[\s\S]*?pmrem\.dispose\(\)/.test(sky) &&
    !sky.includes("private pmrem?: THREE.PMREMGenerator"),
  "Each PMREM bake must release temporary resources and fail soft.",
);
assert(
  sky.includes("private readonly environmentEnabled: boolean") &&
    sky.includes("webglcontextrestored") &&
    sky.includes("private readonly handleContextRestored") &&
    sky.includes("const previousTarget = this.environmentTarget") &&
    sky.includes("previousTarget.dispose()") &&
    sky.includes("this.initializeEnvironment()"),
  "Desktop sky IBL must recover after WebGL restoration.",
);
assert(
  sky.includes("private disposed = false") &&
    /dispose\(\): void \{[\s\S]*?if \(this\.disposed\)[\s\S]*?this\.disposed = true/.test(
      sky,
    ) &&
    sky.includes("this.scene.environment === environmentTarget.texture") &&
    sky.includes("this.environmentTarget = undefined") &&
    sky.includes("{ dispose: () => this.mesh.removeFromParent() }") &&
    sky.includes("this.mesh.geometry") &&
    sky.includes("this.mesh.material"),
  "Sky teardown must be idempotent and ownership-safe.",
);
assert(
  sky.includes("disableWorldSkyCloudsForEnvironmentBake(bakeMaterial)") &&
    cloudMaterial.includes("material.defines = {}") &&
    cloudMaterial.includes("material.needsUpdate = true"),
  "The PMREM bake must not pay animated cloud work.",
);

assert(
  cloudField.includes("float cloudFbm(vec2 p)") &&
    cloudField.includes("WORLD_CLOUD_COMPACT") &&
    cloudField.includes("float cloudDensity(") &&
    cloudField.includes("WORLD_CLOUD_VERTICAL_PROFILE_GLSL") &&
    cloudField.includes("vec2 macroPosition = worldPosition + uCloudWind * uTime;") &&
    cloudField.includes("vec2 detailPosition = worldPosition + uCloudDetailWind * uTime;") &&
    cloudShader.includes("WORLD_CLOUD_GOD_RAYS") &&
    cloudShader.includes("float horizonFade") &&
    cloudShader.includes("float silverEdge") &&
    cloudShader.includes("float cloudSelfShadow(") &&
    cloudShader.includes("opticalTransmittance = exp(") &&
    cloudShader.includes("uCloudSilverLiningStrength") &&
    cloudShader.includes("float cloudRayBreakup(") &&
    !cloudShader.includes("sin(rayAngle * 17.0"),
  "Visible clouds must retain shared wind-coherent morphology and irregular god rays.",
);
assert(
  cloudMaterial.includes("uCloudThickness") &&
    cloudMaterial.includes("uCloudExtinction") &&
    cloudMaterial.includes("uCloudSelfShadowStrength") &&
    cloudMaterial.includes("uCloudSilverLiningStrength") &&
    runtimeConfig.includes("shadowSampleRadius: number") &&
    runtimeConfig.includes("shadowMapResolution: number") &&
    runtimeConfig.includes("shadowWorldSize: number") &&
    runtimeConfig.includes("shadowSteps: number") &&
    runtimeConfig.includes("shadowDistanceFadeStart: number") &&
    runtimeConfig.includes("weatherGradeStrength: number") &&
    runtimeYaml.includes("desktopCloudShadowSampleRadius: 24") &&
    runtimeYaml.includes("desktopCloudShadowMapResolution: 256") &&
    runtimeYaml.includes("compactCloudShadowMapResolution: 128") &&
    runtimeYaml.includes("compactCloudMinimumDirectTransmittance: 0.90"),
  "Cloud body, spatial quality, and weather grade must stay config-backed.",
);
assert(
  runtimeConfig.includes("volumetricEnabled: boolean") &&
    runtimeConfig.includes("volumetricResolutionScale: number") &&
    runtimeConfig.includes("volumetricSteps: number") &&
    runtimeConfig.includes("temporalBlend: number") &&
    runtimeYaml.includes("desktopCloudVolumetricEnabled: true") &&
    runtimeYaml.includes("desktopCloudVolumetricResolutionScale: 0.50") &&
    runtimeYaml.includes("desktopCloudVolumetricSteps: 12") &&
    runtimeYaml.includes("desktopCloudTemporalBlend: 0.84") &&
    runtimeYaml.includes("compactCloudVolumetricEnabled: false") &&
    cloudMaterial.includes("WORLD_CLOUD_TEMPORAL") &&
    cloudMaterial.includes("uCloudTemporalTexture") &&
    cloudVolumeController.includes("new WorldCloudTemporalPass") &&
    cloudVolumeController.includes("disableWorldSkyTemporalClouds") &&
    cloudVolumePass.includes("uPreviousViewProjection") &&
    cloudVolumePass.includes("this.historyTargets") &&
    cloudTemporalShader.includes("previousParcel.xz += uCloudWind * uDeltaSeconds") &&
    cloudTemporalShader.includes("colorDifference") &&
    cloudTemporalShader.includes("grazingConfidence") &&
    cloudVolumeShader.includes("WORLD_CLOUD_VOLUME_STEPS") &&
    cloudVolumeShader.includes("WORLD_CLOUD_VERTICAL_PROFILE_GLSL") &&
    cloudVolumeShader.includes("cloudStepJitter") &&
    cloudVolumeShader.includes("cloudPreviewDensityAt") &&
    cloudVolumeShader.includes("1.0 - exp(-opticalDepth)") &&
    cloudVolumeQuality.includes('"desktop" | "medium" | "mobile"') &&
    cloudVolumeQuality.includes("MEDIUM_MAX_STEPS = 8"),
  "Desktop clouds must retain anti-banded temporal volumetrics and compact fallbacks.",
);
assert(
  cloudVolumeController.includes("uCloudViewportInverse") &&
    sky.includes("mesh.renderOrder = 900") &&
    cloudVolumePass.includes("renderer.getRenderTarget()") &&
    cloudVolumePass.includes("renderer.setRenderTarget(previousTarget)"),
  "The cloud volume must depth-compose through sky fragments and restore renderer state.",
);

assert(
  cloudWeather.includes('CloudWeatherRegime = "clear" | "fair" | "overcast" | "storm"') &&
    cloudWeather.includes("resolveCloudWeatherRegime(") &&
    cloudLighting.includes("this.weatherState.regime = resolveCloudWeatherRegime(this.weatherAmount)") &&
    cloudLighting.includes("this.scene.userData.worldCloudWeather = this.weatherState") &&
    cloudLighting.includes("getWeatherState(): Readonly<WorldCloudWeatherState>") &&
    cloudLighting.includes("delete this.scene.userData.worldCloudWeather"),
  "Cloud weather must publish one stable allocation-free state for rendering and diagnostics.",
);
assert(
  cloudWeather.includes("sampleCloudPointDirectTransmittance(") &&
    cloudWeather.includes("worldY >= cloudTop") &&
    cloudWeather.includes("remainingFraction") &&
    cloudWeather.includes("sampleHeight - worldY") &&
    cloudWeather.includes("resolveAuthoredTransmittance(config, opticalDepth)") &&
    cloudLighting.includes("sampleCloudPointDirectTransmittance(") &&
    cloudLighting.includes("focus.y,"),
  "Global focus lighting must integrate only the cloud volume above the actual focus altitude.",
);
assert(
  cloudWeather.includes("sampleCloudShadowTransmittance(") &&
    cloudWeather.includes("config.shadowSteps") &&
    cloudWeather.includes("sampleCloudVerticalProfile(") &&
    cloudWeather.includes("Math.exp(-opticalDepth * config.extinction)"),
  "Cloud-plane sampling must retain the same integrated volume shape as the GPU map.",
);
assert(
  cloudShadowShader.includes("WORLD_CLOUD_FIELD_GLSL") &&
    cloudShadowShader.includes("WORLD_CLOUD_VERTICAL_PROFILE_GLSL") &&
    cloudShadowShader.includes("physicalTransmittance = exp(") &&
    cloudShadowShader.includes("uCloudMinimumDirectTransmittance") &&
    cloudShadowMap.includes("new THREE.WebGLRenderTarget") &&
    cloudShadowMap.includes("THREE.LinearFilter") &&
    cloudShadowMap.includes("THREE.ClampToEdgeWrapping") &&
    cloudShadowMap.includes("Math.round(focusCloudX / texelSize) * texelSize") &&
    cloudShadowMap.includes("sampleCloudPointDirectTransmittance(") &&
    cloudShadowMap.includes("focus.y,") &&
    cloudShadowMap.includes("private isContextLost(): boolean") &&
    cloudShadowMap.includes("this.suspendSpatialShadows();") &&
    cloudShadowMap.includes("renderer.getViewport(this.viewport)") &&
    cloudShadowMap.includes("renderer.getScissor(this.scissor)") &&
    cloudShadowMap.includes("renderer.setRenderTarget(previousTarget)") &&
    cloudShadowMap.includes("renderer.setViewport(this.viewport)") &&
    cloudShadowMap.includes("renderer.setScissor(this.scissor)") &&
    cloudShadowMap.includes("renderer.setScissorTest(previousScissorTest)") &&
    cloudShadowMap.includes("geometry?.dispose()") &&
    cloudShadowMap.includes("private releaseGpuResources(): void"),
  "Spatial shadows must be one filtered, altitude-aware, context-loss-safe, texel-snapped transmittance field with transactional construction and full renderer-state restoration.",
);
assert(
  cloudShadowSampler.includes("uCloudBaseHeight - worldPosition.y") &&
    cloudShadowSampler.includes("edgeCoverage") &&
    cloudShadowSampler.includes("uCloudShadowDistanceFadeEnd") &&
    cloudShadowSampler.includes("uCloudFocusTransmittance") &&
    cloudShadowPatch.includes("reflectedLight.directDiffuse *=") &&
    cloudShadowPatch.includes("patchGrassBladeCloudShadowMaterial") &&
    cloudShadowPatch.includes("grassWorldRoot.xyz") &&
    cloudShadowPatch.includes("waterBedCloudDirectScale") &&
    cloudShadowIntegrator.includes("HORIZON_RESPONSE_STRENGTH = 0.35") &&
    cloudShadowIntegrator.includes('name === "world-hydrology-water-bed-material"'),
  "Surface consumers must share height projection, safe fades, direct-only modulation, grass vertex sampling, and water-bed sunlight response.",
);

assert(
  environment.includes('from "./WorldCloudShadowController"') &&
    environment.includes("new WorldCloudShadowController(") &&
    environment.includes("this.cloudLighting.update(safeDelta, focus, this.elapsedSeconds)") &&
    environment.includes("this.cloudShadow.update(safeDelta, focus, this.elapsedSeconds)") &&
    cloudShadowController.includes("new WorldCloudShadowMap(renderer, profile)") &&
    cloudShadowController.includes("new WorldCloudShadowSceneIntegrator(") &&
    cloudShadowController.includes("this.map.update(focus, elapsedSeconds)") &&
    cloudShadowController.includes("this.integrator.update(deltaSeconds)") &&
    cloudShadowController.includes("WorldCloudShadowDebugPanel.createIfRequested") &&
    cloudLighting.includes("getAppliedDirectTransmittance(): number") &&
    cloudLighting.includes("this.hemisphere.intensity = WORLD_DEFAULT_HEMISPHERE_INTENSITY") &&
    worldApp.includes("this.environment.update(deltaSeconds, focus);"),
  "Environment ownership must keep global weather, spatial correction, diagnostics, and ambient fill coherent.",
);
assert(
  cloudShadowDebug.includes("Spatial cloud shadow") &&
    cloudShadowDebug.includes("Global cloud direct") &&
    cloudShadowDebug.includes("Sun shadow map") &&
    cloudShadowDebug.includes("global/applied T:") &&
    cloudShadowDebug.includes("weather:") &&
    cloudShadowDebug.includes("readPixels") &&
    cloudShadowDebugVisibility.includes("material.visible = false") &&
    cloudShadowDebugVisibility.includes("this.hiddenMaterials") &&
    !cloudShadowDebugVisibility.includes("object.visible ="),
  "Diagnostics must isolate cloud paths without fighting runtime object visibility.",
);

assert(
  environment.includes("private readonly shadowMapSize: number") &&
    /this\.shadowMapSize = Math\.max\([\s\S]*?Math\.min\([\s\S]*?this\.profile\.shadowMapSize,[\s\S]*?this\.renderer\.capabilities\.maxTextureSize/.test(
      environment,
    ) &&
    environment.includes("(2 * WORLD_SUN_SHADOW_HALF_EXTENT) / this.shadowMapSize") &&
    environment.includes("this.sun.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize)"),
  "Directional shadow allocation and snapping must use the GPU-clamped map size.",
);
assert(
  environment.includes("private disposed = false") &&
    /sky = new WorldSky\([\s\S]*?this\.sky = sky;[\s\S]*?this\.scene\.add\(this\.hemisphere, this\.sun, this\.sun\.target\)/.test(
      environment,
    ) &&
    /catch \(error\) \{[\s\S]*?disposeSafely\(sky, "Sky"\);[\s\S]*?disposeSafely\(this\.cloudShadow, "Cloud shadow system"\);[\s\S]*?disposeSafely\(this\.cloudLighting, "Cloud lighting"\);[\s\S]*?disposeSafely\(this\.sun\.shadow, "Sun shadow"\);[\s\S]*?this\.scene\.remove\(this\.hemisphere, this\.sun, this\.sun\.target\);[\s\S]*?throw error;/.test(
      environment,
    ),
  "Environment construction must roll back the cloud wrapper, lighting, sky, and local shadow resources.",
);
assert(
  /dispose\(\): void \{[\s\S]*?if \(this\.disposed\)[\s\S]*?this\.disposed = true;[\s\S]*?disposeSafely\(this\.sky, "Sky"\);[\s\S]*?disposeSafely\(this\.cloudShadow, "Cloud shadow system"\);[\s\S]*?disposeSafely\(this\.cloudLighting, "Cloud lighting"\);[\s\S]*?disposeSafely\(this\.sun\.shadow, "Sun shadow"\)/.test(
    environment,
  ) &&
    cloudShadowController.includes('disposeSafely(this.debug, "Cloud shadow diagnostics")') &&
    cloudShadowController.includes('disposeSafely(this.integrator, "Cloud shadow integration")') &&
    cloudShadowController.includes('disposeSafely(this.map, "Cloud shadow map")'),
  "Environment teardown must release every cloud/debug/shadow owner and remain idempotent.",
);

console.log(
  "[environment-lifecycle] Camera-relative sky, wind-coherent anti-banded temporal clouds, altitude-aware bounded spatial direct-light shadows, context-safe diagnostics, coherent weather grade, GPU-safe local shadows, restored PMREM, and fail-soft ownership verified.",
);
