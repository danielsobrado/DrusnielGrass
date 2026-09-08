import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const PRESET_IDS = [
  "drusniel", "sunny", "goldenHour", "rainy",
  "windy", "calm", "bowed", "moonlight",
];
const SOURCE_EXPECTATIONS = Object.freeze({
  sunny: ["Highfield", 0.35, 1],
  goldenHour: ["Emberfall", 0.30, 0.625],
  rainy: ["Greyrain", 0.92, 0.833333],
  windy: ["Galewind", 0.50, 1.166667],
  calm: ["Stillmeadow", 0.25, 0.270833],
  bowed: ["Lowsway", 0.30, 0.25],
  moonlight: ["Moonrise", 0.20, 0.333333],
});

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8")
    .replaceAll("\r\n", "\n");
}

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}.`);
}

function colorTuple(color) {
  return [color.r, color.g, color.b];
}

function lightingSnapshot(lighting) {
  return {
    presetId: lighting.presetId,
    label: lighting.label,
    baseline: lighting.baseline,
    sunDirection: lighting.sunDirection.toArray(),
    sunColor: colorTuple(lighting.sunColor),
    sunIntensity: lighting.sunIntensity,
    hemisphereSkyColor: colorTuple(lighting.hemisphereSkyColor),
    hemisphereGroundColor: colorTuple(lighting.hemisphereGroundColor),
    hemisphereIntensity: lighting.hemisphereIntensity,
    ambientColor: colorTuple(lighting.ambientColor),
    ambientIntensity: lighting.ambientIntensity,
    fogColor: colorTuple(lighting.fogColor),
    fogDensity: lighting.fogDensity,
    environmentIntensity: lighting.environmentIntensity,
    cloudThreshold: lighting.cloudThreshold,
    skyZenithColor: colorTuple(lighting.skyZenithColor),
    skyHorizonColor: colorTuple(lighting.skyHorizonColor),
    skyHazeColor: colorTuple(lighting.skyHazeColor),
    skySunHaloColor: colorTuple(lighting.skySunHaloColor),
    skySunDiskColor: colorTuple(lighting.skySunDiskColor),
    skyHaloPower: lighting.skyHaloPower,
    skyDiskPower: lighting.skyDiskPower,
  };
}

function windSnapshot(wind) {
  const field = wind.getField();
  return {
    phase: field.getPhaseSeconds(),
    direction: field.getDirectionDegrees(),
    intensity: field.getIntensity(),
    noiseScale: field.getNoiseScale(),
    speed: field.getSimulationSpeed(),
    restBend: wind.uniforms.restBendGain.value,
  };
}

function assertContains(source, fragments, message) {
  assert.ok(fragments.every((fragment) => source.includes(fragment)), message);
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const catalog = await server.ssrLoadModule(
    "/src/world/experience/WorldExperienceCatalog.ts",
  );
  const sourceModule = await server.ssrLoadModule(
    "/src/world/weather/WorldEnvironmentPresets.ts",
  );
  const resolver = await server.ssrLoadModule(
    "/src/world/weather/WorldEnvironmentPresetResolver.ts",
  );
  const { WorldLightingState } = await server.ssrLoadModule(
    "/src/render/WorldLightingState.ts",
  );
  const { WorldWeatherState } = await server.ssrLoadModule(
    "/src/world/weather/WorldWeatherState.ts",
  );
  const { WorldWindSystem } = await server.ssrLoadModule(
    "/src/world/weather/WorldWindSystem.ts",
  );

  assert.deepEqual([...catalog.WEATHER_PRESET_IDS], PRESET_IDS);
  assert.equal(catalog.DEFAULT_WEATHER_PRESET, "drusniel");

  const sourcePresets = sourceModule.WORLD_SOURCE_ENVIRONMENT_PRESETS;
  assert.deepEqual(Object.keys(sourcePresets), PRESET_IDS.slice(1));
  for (const [id, [label, coverage, windGain]] of Object.entries(SOURCE_EXPECTATIONS)) {
    const source = sourcePresets[id];
    const resolved = resolver.resolveWorldEnvironmentPreset(id);
    assert.equal(source.label, label);
    close(source.cloudCoverageTarget, coverage);
    close(source.windGain, windGain);
    assert.equal(resolved.label, label);
    close(Math.hypot(...resolved.sunDirection), 1, 1e-12);
    close(resolved.cloudCoverageTarget, coverage);
    close(resolved.windIntensity, windGain);
    assert.ok(resolved.cloudThreshold >= 0.38 && resolved.cloudThreshold <= 0.70);
    assert.ok(resolved.paletteMultiplier.every((value) =>
      Number.isFinite(value) && value >= 0.65 && value <= 1.35));
  }

  const baseline = resolver.resolveWorldEnvironmentPreset("drusniel");
  assert.equal(baseline.baseline, true);
  assert.deepEqual(baseline.paletteMultiplier, [1, 1, 1]);
  assert.equal(baseline.rainIntensity, 0);
  assert.equal(baseline.windIntensity, 1);
  assert.equal(baseline.restBendGain, 0);
  assert.equal(resolver.resolveWorldEnvironmentPreset("rainy").rainIntensity, 1);
  assert.ok(resolver.resolveWorldEnvironmentPreset("bowed").restBendGain > 0);
  assert.equal(resolver.resolveWorldEnvironmentPreset("calm").restBendGain, 0);

  let previousThreshold = Number.POSITIVE_INFINITY;
  for (let coverage = 0; coverage <= 1; coverage += 0.05) {
    const threshold = resolver.resolveDestinationCloudThreshold(coverage);
    assert.ok(threshold <= previousThreshold + 1e-12,
      "Higher artistic coverage must never raise the destination density threshold.");
    previousThreshold = threshold;
  }
  assert.ok(
    resolver.resolveWorldEnvironmentPreset("rainy").cloudThreshold <
      resolver.resolveWorldEnvironmentPreset("sunny").cloudThreshold,
  );

  const profile = { compact: false, cloud: { coverage: 0.57 } };
  const lighting = new WorldLightingState(profile);
  const wind = new WorldWindSystem();
  const applied = [];
  const weather = new WorldWeatherState(
    lighting,
    wind,
    "drusniel",
    (preset) => applied.push(preset.id),
  );
  try {
    assert.equal(weather.getPresetId(), "drusniel");
    assert.equal(applied.at(-1), "drusniel");

    assert.equal(weather.setPreset("moonlight"), true);
    const moonLighting = lightingSnapshot(lighting);
    const moonWind = windSnapshot(wind);
    assert.equal(moonLighting.baseline, false);

    assert.equal(weather.setPreset("rainy"), true);
    assert.equal(weather.getSnapshot().rainIntensity, 1);
    assert.equal(weather.setPreset("moonlight"), true);
    assert.deepEqual(lightingSnapshot(lighting), moonLighting,
      "A -> B -> A must restore the complete render-lighting state.");
    assert.deepEqual(windSnapshot(wind), moonWind,
      "A -> B -> A must restore wind state without compounding gain.");

    assert.equal(weather.setPreset("not-a-weather"), false);
    assert.equal(weather.getPresetId(), "moonlight");
    assert.equal(weather.setPreset("drusniel"), true);
    assert.equal(lighting.baseline, true);
    assert.equal(lighting.cloudThreshold, profile.cloud.coverage);
  } finally {
    weather.dispose();
  }

  const app = read("src/app/WorldApp.ts");
  const weatherAttach = app.indexOf("attachWorldWeather(this.experience");
  const terrainConstruction = app.indexOf("terrain = new TerrainStreamer(");
  assert.ok(weatherAttach >= 0 && terrainConstruction > weatherAttach,
    "Initial weather must resolve before streamed material construction.");
  assertContains(app, [
    "setGrassWeatherPaletteMultiplier(preset.paletteMultiplier)",
    "environment?.applyWeatherPreset()",
    "environment.materialContext.setWorldWindUniforms(this.weather?.windUniforms)",
    "terrain?.setGrassArtDirection(direction)",
    "grass?.setArtDirection(direction)",
    "this.weather?.windUniforms",
  ], "WorldApp must commit palette, environment and shared wind from one preset owner.");

  const palette = read("src/grass/materials/GrassPaletteShader.ts");
  assertContains(palette, [
    "weatherPaletteMultiplier",
    "baseTarget.multiply(weatherPaletteMultiplier)",
    "tipTarget.multiply(weatherPaletteMultiplier)",
    "dryTarget.multiply(weatherPaletteMultiplier)",
  ], "Weather tint must remain multiplicative over every balanced grass palette row.");

  const environment = read("src/app/WorldEnvironmentController.ts");
  assertContains(environment, [
    "this.rebuildShadowBasis()",
    "this.invalidateShadowFocus()",
    "this.sky.applyLightingState()",
    "grassGroundShadow.setSunDirection(this.lighting.sunDirection)",
    "handleContextRestore(): void",
  ], "Preset cuts must reach shadows, sky, contact shading and context recovery.");

  const cloudLighting = read("src/app/WorldCloudEnvironmentLighting.ts");
  assertContains(cloudLighting, [
    "if (!this.lighting.baseline)",
    "this.sun.color.copy(this.lighting.sunColor)",
    "this.hemisphere.color.copy(this.lighting.hemisphereSkyColor)",
    "this.ambient.color.copy(this.lighting.ambientColor)",
    "fog.color.copy(this.lighting.fogColor)",
    "this.sampleTargets(this.lastFocus, this.lastElapsedSeconds)",
    "!hadFocus && !this.lighting.baseline",
  ], "Cloud lighting must cut to the active preset without a stale or clear-frame flash.");

  const sky = read("src/world/sky/WorldSkyNode.ts");
  assertContains(sky, [
    "this.volume?.resetHistory()",
    "this.queueEnvironmentRefresh()",
    "environmentRefreshQueued",
    "this.scene.environmentIntensity = this.lighting.environmentIntensity",
    "previous?.dispose()",
  ], "Sky cuts must reset history and coalesce staged PMREM swaps.");

  assertContains(read("src/world/horizon/WorldHorizonNodeMaterial.ts"), [
    "context?.worldSunDirection()", "context?.worldHazeColor()",
  ], "Horizon lighting and haze must follow the render weather state.");
  assert.ok(read("src/world/hydrology/WaterMaterialController.ts")
    .includes("context?.worldSunDirection()"),
  "Water highlights must follow the mutable render sun.");
  assert.ok(read("src/grass/interaction/GrassGroundShadow.ts")
    .includes("setSunDirection(direction: THREE.Vector3)"));

  const context = read("src/render/WorldNodeMaterialContext.ts");
  const farMaterial = read("src/world/grass/WorldGrassImpostorNodeMaterial.ts");
  assert.ok(context.includes("worldWindUniforms(): WorldWindUniforms | undefined"));
  assert.ok(farMaterial.includes("context.worldWindUniforms()"));

  const weatherSource = read("src/world/weather/WorldWeatherState.ts");
  const windSystem = read("src/world/weather/WorldWindSystem.ts");
  const windBake = read("src/world/weather/WorldWindBake.ts");
  assert.ok(weatherSource.includes("this.wind.refresh()"),
    "A preset cut must publish the changed wind before the next rendered frame.");
  assertContains(windSystem, ["refresh(): void", "this.bake.invalidate()"],
    "Forced wind publication must invalidate the reduced-cadence GPU bake.");
  assert.ok(windBake.includes("invalidate(): void"));

  const nearNodes = read("src/grass/materials/GrassNearNodes.ts");
  const farNodes = read("src/world/grass/WorldGrassImpostorNodes.ts");
  assertContains(nearNodes, ["cinematic.restBendGain", "cinematic.directionDegrees"],
    "Near and mid blades must consume Lowsway's static lean.");
  assertContains(farNodes, [
    "createBakedWorldWindNodes", "field.gust", "cinematic.restBendGain",
  ], "Far cards must share the broad gust and Lowsway lean.");

  const ecology = read("src/world/ecology/WorldEcologyField.ts");
  const canopy = read("src/world/ecology/CanopyShadeField.ts");
  assert.ok(ecology.includes("WORLD_SUN_DIRECTION"));
  assert.ok(canopy.includes("WORLD_SUN_DIRECTION"));
  for (const relativePath of [
    "src/world/weather/WorldWeatherState.ts",
    "src/world/weather/WorldEnvironmentPresets.ts",
    "src/world/weather/WorldEnvironmentPresetResolver.ts",
  ]) {
    assert.ok(!/from\s+["'][^"']*(ecology|hydrology|TerrainField)/i.test(read(relativePath)),
      `${relativePath} must not own ecology, hydrology or terrain placement.`);
  }

  const development = read("src/app/WorldDevelopmentHooks.ts");
  assertContains(development, [
    "__drusnielWeather",
    "attachWeatherPresetHook(): void",
    "setPreset: (value) => this.host.setWeatherPreset(value)",
  ], "All eight presets must remain reachable through the T03 diagnostics hook.");
} finally {
  await server.close();
}

console.log(
  "[weather-presets] Eight presets, source identities, atomic cloud/wind cuts, "
  + "shared render lighting, PMREM recovery, LOD coherence and fixed ecology verified.",
);
