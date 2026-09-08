import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EXPECTED_IDS = [
  "drusniel",
  "sunny",
  "goldenHour",
  "rainy",
  "windy",
  "calm",
  "bowed",
  "moonlight",
];
const EXPECTED_SOURCE = {
  sunny: { label: "Highfield", coverage: 0.35, wind: 1 },
  goldenHour: { label: "Emberfall", coverage: 0.30, wind: 0.625 },
  rainy: { label: "Greyrain", coverage: 0.92, wind: 0.833333 },
  windy: { label: "Galewind", coverage: 0.50, wind: 1.166667 },
  calm: { label: "Stillmeadow", coverage: 0.25, wind: 0.270833 },
  bowed: { label: "Lowsway", coverage: 0.30, wind: 0.25 },
  moonlight: { label: "Moonrise", coverage: 0.20, wind: 0.333333 },
};

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll("\r\n", "\n");
}

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}.`);
}

function lightingSnapshot(lighting) {
  const rgb = (color) => [color.r, color.g, color.b];
  return {
    presetId: lighting.presetId,
    label: lighting.label,
    baseline: lighting.baseline,
    sunDirection: lighting.sunDirection.toArray(),
    sunColor: rgb(lighting.sunColor),
    sunIntensity: lighting.sunIntensity,
    hemisphereSkyColor: rgb(lighting.hemisphereSkyColor),
    hemisphereGroundColor: rgb(lighting.hemisphereGroundColor),
    hemisphereIntensity: lighting.hemisphereIntensity,
    ambientColor: rgb(lighting.ambientColor),
    ambientIntensity: lighting.ambientIntensity,
    fogColor: rgb(lighting.fogColor),
    fogDensity: lighting.fogDensity,
    environmentIntensity: lighting.environmentIntensity,
    cloudThreshold: lighting.cloudThreshold,
    skyZenithColor: rgb(lighting.skyZenithColor),
    skyHorizonColor: rgb(lighting.skyHorizonColor),
    skyHazeColor: rgb(lighting.skyHazeColor),
    skySunHaloColor: rgb(lighting.skySunHaloColor),
    skySunDiskColor: rgb(lighting.skySunDiskColor),
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

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const catalog = await server.ssrLoadModule("/src/world/experience/WorldExperienceCatalog.ts");
  const sourceModule = await server.ssrLoadModule("/src/world/weather/WorldEnvironmentPresets.ts");
  const resolver = await server.ssrLoadModule("/src/world/weather/WorldEnvironmentPresetResolver.ts");
  const { WorldLightingState } = await server.ssrLoadModule("/src/render/WorldLightingState.ts");
  const { WorldWeatherState } = await server.ssrLoadModule("/src/world/weather/WorldWeatherState.ts");
  const { WorldWindSystem } = await server.ssrLoadModule("/src/world/weather/WorldWindSystem.ts");

  assert.deepEqual([...catalog.WEATHER_PRESET_IDS], EXPECTED_IDS,
    "The public weather catalog must keep the seven source presets plus drusniel.");
  assert.equal(catalog.DEFAULT_WEATHER_PRESET, "drusniel");

  const sourcePresets = sourceModule.WORLD_SOURCE_ENVIRONMENT_PRESETS;
  assert.deepEqual(Object.keys(sourcePresets), EXPECTED_IDS.slice(1));
  for (const [id, expected] of Object.entries(EXPECTED_SOURCE)) {
    const source = sourcePresets[id];
    assert.equal(source.label, expected.label, `${id} must preserve its source label.`);
    close(source.cloudCoverageTarget, expected.coverage);
    close(source.windGain, expected.wind);
    const resolved = resolver.resolveWorldEnvironmentPreset(id);
    assert.equal(resolved.id, id);
    assert.equal(resolved.label, expected.label);
    close(Math.hypot(...resolved.sunDirection), 1, 1e-12);
    assert.ok(resolved.cloudThreshold >= 0.38 && resolved.cloudThreshold <= 0.70,
      `${id} cloud threshold must stay inside the exercised destination range.`);
    close(resolved.cloudCoverageTarget, expected.coverage);
    close(resolved.windIntensity, expected.wind);
    assert.ok(resolved.paletteMultiplier.every((value) =>
      Number.isFinite(value) && value >= 0.65 && value <= 1.35));
  }

  const baseline = resolver.resolveWorldEnvironmentPreset("drusniel");
  assert.equal(baseline.baseline, true);
  assert.deepEqual(baseline.paletteMultiplier, [1, 1, 1]);
  assert.equal(baseline.rainIntensity, 0);
  assert.equal(baseline.windIntensity, 1);
  assert.equal(baseline.restBendGain, 0);
  assert.ok(resolver.resolveWorldEnvironmentPreset("bowed").restBendGain > 0,
    "Lowsway must preserve a static lean independently of dynamic wind.");
  assert.equal(resolver.resolveWorldEnvironmentPreset("calm").restBendGain, 0);
  assert.equal(resolver.resolveWorldEnvironmentPreset("rainy").rainIntensity, 1);

  let previousThreshold = Number.POSITIVE_INFINITY;
  for (let coverage = 0; coverage <= 1.00001; coverage += 0.05) {
    const threshold = resolver.resolveDestinationCloudThreshold(coverage);
    assert.ok(threshold <= previousThreshold + 1e-12,
      "More artistic cloud coverage must never raise the density threshold.");
    previousThreshold = threshold;
  }
  assert.ok(
    resolver.resolveWorldEnvironmentPreset("rainy").cloudThreshold <
      resolver.resolveWorldEnvironmentPreset("sunny").cloudThreshold,
    "Greyrain must resolve to more cloud than Highfield under the destination convention.",
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
    assert.equal(moonLighting.presetId, "moonlight");
    assert.equal(moonLighting.baseline, false);

    assert.equal(weather.setPreset("rainy"), true);
    assert.equal(weather.getSnapshot().rainIntensity, 1);
    assert.equal(weather.setPreset("moonlight"), true);
    assert.deepEqual(lightingSnapshot(lighting), moonLighting,
      "A→B→A must restore the complete render-lighting state numerically.");
    assert.deepEqual(windSnapshot(wind), moonWind,
      "A→B→A must restore wind gain, direction, speed, noise and rest bend without compounding.");

    assert.equal(weather.setPreset("not-a-weather"), false);
    assert.equal(weather.getPresetId(), "moonlight",
      "Invalid commands must leave the active preset untouched.");

    assert.equal(weather.setPreset("drusniel"), true);
    assert.deepEqual(lightingSnapshot(lighting).presetId, "drusniel");
    assert.equal(lighting.baseline, true);
    assert.equal(lighting.cloudThreshold, profile.cloud.coverage,
      "Drusniel must restore the destination profile's original cloud threshold.");
  } finally {
    weather.dispose();
  }

  const app = read("src/app/WorldApp.ts");
  const weatherAttach = app.indexOf("attachWorldWeather(this.experience");
  const terrainConstruction = app.indexOf("terrain = new TerrainStreamer(");
  assert.ok(weatherAttach >= 0 && terrainConstruction > weatherAttach,
    "Initial weather must resolve before terrain and grass materials are constructed.");
  assert.ok(app.includes("setGrassWeatherPaletteMultiplier(preset.paletteMultiplier)"));
  assert.ok(app.includes("environment?.applyWeatherPreset()"));
  assert.ok(app.includes("terrain?.setGrassArtDirection(direction)"));
  assert.ok(app.includes("grass?.setArtDirection(direction)"));
  assert.ok(app.includes("this.weather?.windUniforms"),
    "Grass must receive the weather owner's shared cinematic wind table.");

  const palette = read("src/grass/materials/GrassPaletteShader.ts");
  assert.ok(palette.includes("weatherPaletteMultiplier"));
  assert.ok(palette.includes("baseTarget.multiply(weatherPaletteMultiplier)"));
  assert.ok(palette.includes("tipTarget.multiply(weatherPaletteMultiplier)"));
  assert.ok(palette.includes("dryTarget.multiply(weatherPaletteMultiplier)"));

  const environment = read("src/app/WorldEnvironmentController.ts");
  assert.ok(environment.includes("this.rebuildShadowBasis()") &&
    environment.includes("this.invalidateShadowFocus()"),
  "A preset cut must recompute the shadow basis even when the player does not move.");
  assert.ok(environment.includes("this.sky.applyLightingState()"));
  assert.ok(environment.includes("grassGroundShadow.setSunDirection(this.lighting.sunDirection)"));
  assert.ok(environment.includes("handleContextRestore(): void") &&
    environment.includes("this.applyWeatherPreset()"),
  "Context restoration must rebuild the selected preset rather than the baseline.");

  const cloudLighting = read("src/app/WorldCloudEnvironmentLighting.ts");
  assert.ok(cloudLighting.includes("if (!this.lighting.baseline)"));
  assert.ok(cloudLighting.includes("this.sun.color.copy(this.lighting.sunColor)"));
  assert.ok(cloudLighting.includes("this.hemisphere.color.copy(this.lighting.hemisphereSkyColor)"));
  assert.ok(cloudLighting.includes("this.ambient.color.copy(this.lighting.ambientColor)"));
  assert.ok(cloudLighting.includes("fog.color.copy(this.lighting.fogColor)"),
    "Cloud lighting must start each non-baseline frame from the active preset instead of old globals.");

  const sky = read("src/world/sky/WorldSkyNode.ts");
  assert.ok(sky.includes("this.volume?.resetHistory()"),
    "A weather cut must invalidate temporal cloud history.");
  assert.ok(sky.includes("this.queueEnvironmentRefresh()"));
  assert.ok(sky.includes("environmentRefreshQueued"));
  assert.ok(sky.includes("this.scene.environmentIntensity = this.lighting.environmentIntensity"));
  assert.ok(sky.includes("previous?.dispose()"),
    "A successful staged IBL swap must release the superseded target.");

  const horizon = read("src/world/horizon/WorldHorizonNodeMaterial.ts");
  assert.ok(horizon.includes("context?.worldSunDirection()"));
  assert.ok(horizon.includes("context?.worldHazeColor()"));

  const water = read("src/world/hydrology/WaterMaterialController.ts");
  assert.ok(water.includes("context?.worldSunDirection()"),
    "Water highlights must borrow the mutable render sun rather than the ecology reference sun.");

  const groundShadow = read("src/grass/interaction/GrassGroundShadow.ts");
  assert.ok(groundShadow.includes("setSunDirection(direction: THREE.Vector3)"));

  const nearMaterial = read("src/grass/materials/GrassNearNodeMaterial.ts");
  const context = read("src/render/WorldNodeMaterialContext.ts");
  const farMaterial = read("src/world/grass/WorldGrassImpostorNodeMaterial.ts");
  assert.ok(nearMaterial.includes("context.setWorldWindUniforms(wind)"),
    "The per-world material context must receive the already-owned cinematic wind table.");
  assert.ok(context.includes("worldWindUniforms(): WorldWindUniforms | undefined"));
  assert.ok(farMaterial.includes("context.worldWindUniforms()"),
    "Far cards must resolve the same cinematic wind table as near and mid blades.");

  const nearNodes = read("src/grass/materials/GrassNearNodes.ts");
  const farNodes = read("src/world/grass/WorldGrassImpostorNodes.ts");
  assert.ok(nearNodes.includes("cinematic.restBendGain") &&
    nearNodes.includes("cinematic.directionDegrees"));
  assert.ok(farNodes.includes("createBakedWorldWindNodes") &&
    farNodes.includes("field.gust") && farNodes.includes("cinematic.restBendGain"),
  "Far cards must share the broad gust and Lowsway rest bend instead of falling back to legacy sway.");

  const ecology = read("src/world/ecology/WorldEcologyField.ts");
  const canopy = read("src/world/ecology/CanopyShadeField.ts");
  assert.ok(ecology.includes("WORLD_SUN_DIRECTION"));
  assert.ok(canopy.includes("WORLD_SUN_DIRECTION"));
  for (const relativePath of [
    "src/world/weather/WorldWeatherState.ts",
    "src/world/weather/WorldEnvironmentPresets.ts",
    "src/world/weather/WorldEnvironmentPresetResolver.ts",
  ]) {
    const source = read(relativePath);
    assert.ok(!/from\s+["'][^"']*(ecology|hydrology|TerrainField)/i.test(source),
      `${relativePath} must not gain authority over ecology, hydrology or terrain placement.`);
  }

  const development = read("src/app/WorldDevelopmentHooks.ts");
  assert.ok(development.includes("__drusnielWeather"));
  assert.ok(development.includes("attachWeatherPresetHook(): void"));
  assert.ok(development.includes("setPreset: (value) => this.host.setWeatherPreset(value)"));
} finally {
  await server.close();
}

console.log(
  "[weather-presets] Eight-preset catalog, source identities, cloud adapter, atomic A/B/A state, "
  + "shared LOD wind, dynamic render-sun consumers, PMREM/context recovery and fixed ecology verified.",
);
