import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = (path) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");

const failures = [];
const check = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(new Error(`${name}: ${error.message}`));
  }
};

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const wetness = await server.ssrLoadModule("/src/world/weather/WorldWetness.ts");
  const rainSystem = await server.ssrLoadModule("/src/world/weather/WorldRainSystem.ts");
  const tuning = await server.ssrLoadModule("/src/world/weather/WorldRainTuning.ts");
  const { WorldWaterContactField } = await server.ssrLoadModule(
    "/src/world/hydrology/WorldWaterContactField.ts",
  );

  await check("rain response is frame-rate independent", () => {
    const simulate = (step) => {
      let value = 0;
      for (let elapsed = 0; elapsed < 2 - 1e-9; elapsed += step) {
        value = rainSystem.approachRainIntensity(value, 1, Math.min(step, 2 - elapsed));
      }
      return value;
    };
    const sixty = simulate(1 / 60);
    const twenty = simulate(1 / 20);
    assert.ok(Math.abs(sixty - twenty) < 1e-12,
      `Rain gain must depend on elapsed time, not frame count; ${sixty} vs ${twenty}.`);
  });

  await check("wetting and drying honor configured time constants", () => {
    const wet = wetness.approachWetness(0, 1, 8, 8, 45);
    const dry = wetness.approachWetness(1, 0, 45, 8, 45);
    assert.ok(Math.abs(wet - (1 - Math.exp(-1))) < 1e-12);
    assert.ok(Math.abs(dry - Math.exp(-1)) < 1e-12);

    const faster = wetness.approachWetness(0, 1, 4, 4, 45);
    assert.ok(Math.abs(faster - wet) < 1e-12,
      "Changing wettingSeconds must change the response rather than being ignored.");
  });

  await check("contact field rejects dry and vertically invalid events", () => {
    const hydrology = { waterCoverage: 0, waterLevel: 3 };
    const terrain = {
      sampleHeight: () => 2,
      sampleHydrology: (_x, _z, _ground, target) => Object.assign(target, hydrology),
    };
    const field = new WorldWaterContactField(terrain, 4);
    assert.equal(field.add({ x: 0, y: 3, z: 0, time: 1, radius: 0.4, strength: 1 }), false);

    hydrology.waterCoverage = 1;
    assert.equal(field.add({ x: 0, y: 20, z: 0, time: 1, radius: 0.4, strength: 1 }), false);
    assert.equal(field.add({ x: 0, y: 3, z: 0, time: 1, radius: 0.4, strength: 1 }), true);
  });

  await check("precipitation budgets stay bounded", () => {
    assert.equal(tuning.WORLD_RAIN_AREA_METERS, 32);
    assert.equal(tuning.WORLD_RAIN_GROUND_CACHE_RESOLUTION, 32);
    assert.ok(tuning.WORLD_RAIN_GROUND_CACHE_ROWS_PER_FRAME > 0);
    assert.ok(tuning.WORLD_RAIN_GROUND_CACHE_ROWS_PER_FRAME <
      tuning.WORLD_RAIN_GROUND_CACHE_RESOLUTION);
    assert.equal(tuning.WORLD_WATER_CONTACT_CAPACITY_DESKTOP, 16);
    assert.equal(tuning.WORLD_WATER_CONTACT_CAPACITY_COMPACT, 8);
    assert.ok(tuning.WORLD_WETNESS_MAX_COLOR_DARKENING <= 0.12);
    assert.ok(tuning.WORLD_WETNESS_ROUGHNESS_FLOOR >= 0.25);
  });

  await check("rain is one pooled depth-tested instanced draw", () => {
    const nodes = source("src/world/weather/WorldRainNodes.ts");
    const runtime = source("src/world/weather/WorldRainSystem.ts");
    assert.match(runtime, /new THREE\.InstancedMesh\(this\.geometry, this\.material, options\.capacity\)/);
    assert.match(runtime, /this\.mesh\.frustumCulled = false/);
    assert.match(nodes, /material\.depthTest = true/);
    assert.match(nodes, /material\.depthWrite = false/);
    assert.doesNotMatch(runtime, /requestAnimationFrame|setInterval|setTimeout/,
      "Rain must advance only from the world's existing experience update.");
  });

  await check("the ground cache is staged and includes hydrologic water", () => {
    const cache = source("src/world/weather/WorldRainGroundCache.ts");
    assert.match(cache, /private readonly staging = new Float32Array/);
    assert.match(cache, /WORLD_RAIN_GROUND_CACHE_ROWS_PER_FRAME/);
    assert.match(cache, /this\.active\.set\(this\.staging\)/);
    assert.match(cache, /Math\.max\(ground, this\.hydrology\.waterLevel\)/);
    assert.ok(cache.indexOf("this.active.set(this.staging)") < cache.indexOf("this.center.copy(this.pendingCenter)"));
  });

  await check("runtime publishes precipitation before streamed materials are constructed", () => {
    const app = source("src/app/WorldApp.ts");
    const attach = app.indexOf("attachWorldRain(this.experience");
    const publish = app.indexOf("setWorldPrecipitation(");
    const terrain = app.indexOf("terrain = new TerrainStreamer(");
    assert.ok(attach >= 0 && publish > attach && terrain > publish,
      "Rain uniforms must be attached and published before terrain/water node graphs are built.");
    assert.match(app, /setWorldWaterContacts\(this\.rain\?\.waterContacts\)/);
    assert.match(app, /bindMaterialContext\(environment\.materialContext\)/);
    assert.match(app, /new WorldScenicLayer\([\s\S]*environment\.materialContext/);
  });

  await check("weather updates before rain in the experience owner", () => {
    const experience = source("src/app/WorldExperience.ts");
    assert.match(experience, /for \(let index = 0; index < this\.updatable\.length;\)/);
    assert.match(experience, /entry\.owner\.update\?\.\(deltaSeconds\);\s*index \+= 1;/);
    assert.match(experience, /this\.updatable\.splice\(index, 1\)/,
      "A failed owner must be removed without advancing the index and skipping its successor.");
    const app = source("src/app/WorldApp.ts");
    assert.ok(app.indexOf("attachWorldWeather(this.experience") <
      app.indexOf("attachWorldRain(this.experience"));
  });

  await check("experience config drives wetting and drying", () => {
    const runtime = source("src/world/weather/WorldRainSystem.ts");
    assert.match(runtime, /wettingSeconds: experience\.config\.wettingSeconds/);
    assert.match(runtime, /dryingSeconds: experience\.config\.dryingSeconds/);
  });

  await check("wet materials are bounded and foliage remains opaque", () => {
    const wet = source("src/render/WorldWetSurfaceNodes.ts");
    const tree = source("src/world/scenic/WorldTreeSystem.ts");
    assert.match(wet, /WORLD_WETNESS_MAX_COLOR_DARKENING/);
    assert.match(wet, /WORLD_WETNESS_ROUGHNESS_FLOOR/);
    assert.doesNotMatch(tree, /transparent\s*=\s*true|opacityNode/,
      "Tree rain response must not introduce transparent foliage overdraw.");
    assert.match(tree, /applyWorldWetStandardMaterial\(bark, context\)/);
    assert.match(tree, /applyWorldWetStandardMaterial\(leaves, context\)/);
  });

  await check("rain and contact ripples are additive to existing water slope", () => {
    const surface = source("src/world/hydrology/WaterSurfaceNodes.ts");
    assert.match(surface, /waterResolveRainSlopeNode/);
    assert.match(surface, /waterResolveContactSlopeNode/);
    const stone = surface.indexOf(".mul(stoneActivity))");
    const rain = surface.indexOf(".add(rainSlope)");
    const contact = surface.indexOf(".add(contactSlope)");
    assert.ok(stone >= 0 && rain > stone && contact > rain,
      "Precipitation ripples must layer after the existing flow/stone slope rather than replace it.");
  });

  await check("contact ripple storage is fixed capacity", () => {
    const contacts = source("src/world/hydrology/WorldWaterContactField.ts");
    assert.match(contacts, /Array\.from\([\s\S]*length: capacity/);
    assert.match(contacts, /this\.cursor = \(this\.cursor \+ 1\) % this\.capacity/);
    assert.doesNotMatch(contacts, /\.push\(/,
      "Per-event storage must overwrite the bounded pool rather than grow at runtime.");
  });
} finally {
  await server.close();
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[world-precipitation] ${failure.message}`);
  }
  throw new Error(`[world-precipitation] ${failures.length} checks failed.`);
}

console.log(
  "[world-precipitation] Rain response and wetness are frame-rate independent, "
  + "budgets are bounded, clipping includes terrain/water, opaque surfaces share "
  + "wetness, and procedural/contact ripples layer onto the existing water graph.",
);
