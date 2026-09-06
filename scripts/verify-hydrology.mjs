import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const SAMPLE_STEP = 12;
const EPSILON = 1e-8;

function assert(condition, message) {
  if (!condition) throw new Error(`[hydrology] ${message}`);
}

function assertClose(actual, expected, message, epsilon = EPSILON) {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${message} Expected ${expected}, received ${actual}.`,
  );
}

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
  const THREE = await import("three");
  const { TerrainField } = await server.ssrLoadModule(
    "/src/world/TerrainField.ts",
  );
  const { TerrainChunkBuilder } = await server.ssrLoadModule(
    "/src/world/TerrainChunk.ts",
  );
  const { TerrainSurfaceField } = await server.ssrLoadModule(
    "/src/world/terrain/TerrainSurfaceField.ts",
  );
  const { createHydrologySample } = await server.ssrLoadModule(
    "/src/world/hydrology/HydrologyField.ts",
  );
  const { resolveGrassWaterMask } = await server.ssrLoadModule(
    "/src/world/hydrology/HydrologyCoverage.ts",
  );
  const { RiverField, createRiverSample } = await server.ssrLoadModule(
    "/src/world/hydrology/RiverField.ts",
  );
  const { RIVER_GLOBAL_MAX_WIDTH_SCALE, RIVER_GLOBAL_MIN_WIDTH_SCALE } =
    await server.ssrLoadModule("/src/world/hydrology/RiverTuning.ts");
  const { LakeField, createLakeSample } = await server.ssrLoadModule(
    "/src/world/hydrology/LakeField.ts",
  );
  const { WaterInteractionField, createWaterInteractionSample } =
    await server.ssrLoadModule("/src/world/hydrology/WaterInteractionField.ts");
  const { WATER_FLOW_NOISE_SIZE, sampleWaterFlowNoisePixel } =
    await server.ssrLoadModule("/src/world/hydrology/WaterFlowNoiseTexture.ts");
  const { WATER_BED_NOISE_SIZE, sampleWaterBedPixel } =
    await server.ssrLoadModule("/src/world/hydrology/WaterBedTexture.ts");
  const { WaterBedMaterialController } = await server.ssrLoadModule(
    "/src/world/hydrology/WaterBedMaterialController.ts",
  );
  const { WaterMaterialController } = await server.ssrLoadModule(
    "/src/world/hydrology/WaterMaterialController.ts",
  );
  const { WATER_VISIBLE_COVERAGE_THRESHOLD } = await server.ssrLoadModule(
    "/src/world/hydrology/WaterMaterialTuning.ts",
  );
  assert(
    typeof resolveGrassWaterMask === "function",
    "Hydrology must expose the water-to-grass shoreline mask for regression coverage.",
  );
  assertClose(
    resolveGrassWaterMask(0, 0, 0.1),
    1,
    "Dry ground must retain grass coverage.",
  );
  assert(
    resolveGrassWaterMask(WATER_VISIBLE_COVERAGE_THRESHOLD * 0.5, 0, 0.1) > 0 &&
      resolveGrassWaterMask(WATER_VISIBLE_COVERAGE_THRESHOLD * 0.5, 0, 0.1) < 1,
    "Grass must feather through the sub-visible shoreline interval.",
  );
  assertClose(
    resolveGrassWaterMask(WATER_VISIBLE_COVERAGE_THRESHOLD, 0, 0.1),
    0,
    "Grass must be fully cleared where the transparent water surface becomes visible.",
  );
  assertClose(
    resolveGrassWaterMask(1, 0, 0.1),
    0,
    "Open water must fully reject grass.",
  );
  assertClose(
    resolveGrassWaterMask(0, 1, 0.1),
    0,
    "The shoreline edge must reject grass even between coarse water vertices.",
  );
  assertClose(
    resolveGrassWaterMask(0, 0.98, 0.1),
    0,
    "The full water-cell clearance footprint must reject grass.",
  );
  assertClose(
    resolveGrassWaterMask(0, 0.85, 0.1),
    1,
    "Grass outside the shoreline feather must remain unchanged.",
  );
  const { setStoneClearanceField } = await server.ssrLoadModule(
    "/src/world/stones/StoneClearance.ts",
  );
  const { WORLD_CONFIG_SCHEMA } = await server.ssrLoadModule(
    "/src/world/WorldConfigSchema.ts",
  );
  const { validateWorldConfig } = await server.ssrLoadModule(
    "/src/world/WorldConfigValidator.ts",
  );

  const worldSource = readFileSync(
    resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
    "utf8",
  );
  const config = Object.fromEntries(
    worldSource
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return [
          line.slice(0, separator).trim(),
          Number(line.slice(separator + 1)),
        ];
      }),
  );
  for (const key of Object.keys(WORLD_CONFIG_SCHEMA)) {
    assert(Number.isFinite(config[key]), `World config is missing ${key}.`);
  }
  validateWorldConfig(config);
  assert(config.waterEnabled === 1, "Production hydrology must be enabled.");

  const noiseA = new Float64Array(4);
  const noiseB = new Float64Array(4);
  sampleWaterFlowNoisePixel(17, 29, config.seed, noiseA);
  sampleWaterFlowNoisePixel(
    17 + WATER_FLOW_NOISE_SIZE,
    29 - WATER_FLOW_NOISE_SIZE,
    config.seed,
    noiseB,
  );
  for (let channel = 0; channel < 4; channel += 1) {
    assertClose(
      noiseA[channel],
      noiseB[channel],
      `Water noise channel ${channel} must tile exactly.`,
    );
  }

  // The bed map repeats across open water, so a seam would draw a visible grid
  // of pebbles on the riverbed.
  const bedA = new Float64Array(4);
  const bedB = new Float64Array(4);
  sampleWaterBedPixel(23, 91, config.seed, bedA);
  sampleWaterBedPixel(
    23 + WATER_BED_NOISE_SIZE,
    91 - WATER_BED_NOISE_SIZE,
    config.seed,
    bedB,
  );
  for (let channel = 0; channel < 4; channel += 1) {
    assertClose(
      bedA[channel],
      bedB[channel],
      `Water bed channel ${channel} must tile exactly.`,
    );
  }
  let bedRelief = 0;
  let bedAlgae = 0;
  const bedPixel = new Float64Array(4);
  for (let y = 0; y < WATER_BED_NOISE_SIZE; y += 4) {
    for (let x = 0; x < WATER_BED_NOISE_SIZE; x += 4) {
      sampleWaterBedPixel(x, y, config.seed, bedPixel);
      if (bedPixel[0] > 0.5) bedRelief += 1;
      if (bedPixel[2] > 0.66) bedAlgae += 1;
    }
  }
  const bedPixels = (WATER_BED_NOISE_SIZE / 4) ** 2;
  assert(
    bedRelief > bedPixels * 0.15 && bedRelief < bedPixels * 0.7,
    `Riverbed must carry cobbles standing in crevices, not flat sand or solid stone (${bedRelief}/${bedPixels}).`,
  );
  assert(
    bedAlgae > bedPixels * 0.05 && bedAlgae < bedPixels * 0.5,
    `Riverbed algae must clump into mats rather than vanish or wash over everything (${bedAlgae}/${bedPixels}).`,
  );

  const terrain = new TerrainField(config);
  const dryTerrain = new TerrainField({ ...config, waterEnabled: 0 });
  const hydrology = createHydrologySample();
  const surface = new TerrainSurfaceField(config);
  const targets = {
    ecology: new THREE.Vector4(),
    environment: new THREE.Vector4(),
    biome: new THREE.Vector3(),
    stoneContact: new THREE.Vector4(),
    stoneOcclusionRadius: 0,
  };
  const halfWorld = config.worldSize * 0.5;
  let riverSamples = 0;
  let lakeSamples = 0;
  let carvedSamples = 0;
  let normalizedFlowSamples = 0;
  let wetPoint;
  let riverPoint;
  const lakeLevels = new Map();

  for (let z = -halfWorld; z <= halfWorld; z += SAMPLE_STEP) {
    for (let x = -halfWorld; x <= halfWorld; x += SAMPLE_STEP) {
      const height = terrain.sampleHeight(x, z);
      const dryHeight = dryTerrain.sampleHeight(x, z);
      assert(
        height <= dryHeight + EPSILON,
        `Hydrology raised terrain at ${x}, ${z}.`,
      );
      if (dryHeight - height > 0.05) carvedSamples += 1;

      terrain.sampleHydrology(x, z, height, hydrology);
      if (hydrology.riverCoverage > 0.65) {
        riverSamples += 1;
        const flowLength = Math.hypot(hydrology.flowX, hydrology.flowZ);
        assert(
          Math.abs(flowLength - 1) < 1e-6,
          `River flow must stay normalized, received ${flowLength}.`,
        );
        normalizedFlowSamples += 1;
        if (!riverPoint && hydrology.lakeCoverage < 0.01) {
          riverPoint = { x, z, dryHeight };
        }
      }
      if (hydrology.lakeCoverage > 0.65) {
        lakeSamples += 1;
        const levelKey = hydrology.waterLevel.toFixed(5);
        lakeLevels.set(levelKey, (lakeLevels.get(levelKey) ?? 0) + 1);
      }
      if (!wetPoint && hydrology.waterCoverage > 0.65)
        wetPoint = { x, z, height };

      if (hydrology.waterCoverage > 0.65) {
        assert(
          hydrology.waterLevel > height,
          "Open-water surface must remain above its carved bed.",
        );
        assert(
          terrain.sampleGrassSuitabilityWithoutSlope(x, z, height) < 0.08,
          "Open water must reject normal grass placement.",
        );
      }

      if (hydrology.waterProximity > 0.5 && hydrology.waterCoverage < 0.2) {
        const suitability = terrain.sampleGrassSuitabilityWithoutSlope(
          x,
          z,
          height,
        );
        const ecology = terrain.sampleEcologyAt(x, z, height);
        surface.sample(x, z, height, suitability, hydrology, ecology, targets);
        assert(
          targets.environment.z > 0.49 && targets.environment.y > 0,
          "Wet banks must carry water proximity and humidity semantics.",
        );
      }
    }
  }

  assert(
    carvedSamples > 100,
    "Hydrology must materially carve the production map.",
  );
  assert(
    riverSamples > 20,
    "Production seed must contain visible river water.",
  );
  assert(lakeSamples > 20, "Production seed must contain visible lake water.");
  assert(
    normalizedFlowSamples === riverSamples,
    "Every strong river sample must expose normalized downstream flow.",
  );
  assert(
    [...lakeLevels.values()].some((count) => count >= 4),
    "A lake must expose multiple samples at one exactly flat water level.",
  );
  assert(
    wetPoint,
    "Hydrology verification needs at least one open-water point.",
  );
  assert(riverPoint, "Hydrology verification needs a river-only sample.");

  const CONTAINMENT_CELL_RANGE = 12;
  const CONTAINMENT_STEP = 2;
  const CONTAINMENT_NUDGE = 1e-6;
  let containedLakeSamples = 0;
  for (const seed of [config.seed, 7, 5150]) {
    const lakeConfig = { ...config, seed };
    const lakes = new LakeField(lakeConfig);
    const lakeSample = createLakeSample();
    const spacing = lakeConfig.lakeSpacing;
    const bedHeight = lakeConfig.baseHeight - lakeConfig.lakeDepth;
    const extent = CONTAINMENT_CELL_RANGE * spacing;

    for (
      let cell = -CONTAINMENT_CELL_RANGE;
      cell <= CONTAINMENT_CELL_RANGE;
      cell += 1
    ) {
      const boundary = cell * spacing;
      for (let offset = -extent; offset <= extent; offset += CONTAINMENT_STEP) {
        for (const side of [-CONTAINMENT_NUDGE, CONTAINMENT_NUDGE]) {
          for (const [x, z] of [
            [boundary + side, offset],
            [offset, boundary + side],
          ]) {
            lakes.sample(x, z, bedHeight, lakeSample);
            assert(
              lakeSample.coverage === 0 &&
                lakeSample.basin === 0 &&
                lakeSample.proximity === 0,
              `Lake ${lakeSample.coverage > 0 ? "water" : lakeSample.basin > 0 ? "shoreline" : "humidity"} ` +
                `is still ${lakeSample.coverage || lakeSample.basin || lakeSample.proximity} at its own ` +
                `cell edge (${x}, ${z}, seed ${seed}), so the neighbouring cell cuts it off.`,
            );
          }
        }
      }
    }

    for (let z = -extent; z <= extent; z += 40) {
      for (let x = -extent; x <= extent; x += 40) {
        lakes.sample(x, z, bedHeight, lakeSample);
        if (lakeSample.proximity > 0) containedLakeSamples += 1;
      }
    }
  }
  assert(
    containedLakeSamples > 1000,
    `Lake containment sweep only saw ${containedLakeSamples} wet samples, so it proves nothing.`,
  );

  const sensitiveConfig = {
    ...config,
    lakeChance: 0,
    riverMaxAltitude: riverPoint.dryHeight + 9,
  };
  const sensitiveTerrain = new TerrainField(sensitiveConfig);
  const sensitiveHeight = sensitiveTerrain.sampleHeight(
    riverPoint.x,
    riverPoint.z,
  );
  const beforeNormal = createHydrologySample();
  sensitiveTerrain.sampleHydrology(
    riverPoint.x,
    riverPoint.z,
    sensitiveHeight,
    beforeNormal,
  );
  assert(
    beforeNormal.riverCoverage > 0.05 && beforeNormal.riverCoverage < 0.95,
    "Call-order regression must exercise the river altitude fade, not a saturated mask.",
  );
  sensitiveTerrain.sampleNormal(
    riverPoint.x,
    riverPoint.z,
    new THREE.Vector3(),
  );
  const afterNormal = createHydrologySample();
  sensitiveTerrain.sampleHydrology(
    riverPoint.x,
    riverPoint.z,
    sensitiveHeight,
    afterNormal,
  );
  for (const key of [
    "waterCoverage",
    "waterProximity",
    "humidityBoost",
    "grassMask",
    "waterLevel",
    "riverCoverage",
    "lakeCoverage",
    "flowX",
    "flowZ",
    "riverMorphology",
    "riverBend",
    "riverLateral",
  ]) {
    assertClose(
      afterNormal[key],
      beforeNormal[key],
      `Hydrology ${key} must not depend on intervening normal samples.`,
    );
  }

  const riverConfig = { ...config, lakeChance: 0 };
  const riverTerrain = new TerrainField(riverConfig);
  const riverSurface = new TerrainSurfaceField(riverConfig);
  const waterInteractionField = new WaterInteractionField(riverConfig);
  const chunkX = Math.floor(riverPoint.x / config.chunkSize);
  const chunkZ = Math.floor(riverPoint.z / config.chunkSize);
  const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const waterMaterial = new THREE.MeshBasicMaterial({ transparent: true });
  const waterBedMaterial = new THREE.MeshBasicMaterial({ transparent: true });
  const builder = new TerrainChunkBuilder(
    chunkX,
    chunkZ,
    config.chunkSize,
    config.terrainNearResolution,
    riverTerrain,
    riverSurface,
    waterInteractionField,
    terrainMaterial,
    waterMaterial,
    false,
    waterBedMaterial,
  );
  let chunk;
  while (!chunk) chunk = builder.advance(1000);
  assert(
    chunk.waterMesh && chunk.waterBedMesh,
    "A river terrain chunk must build both the surface and depth-tested bed passes.",
  );
  assert(
    chunk.waterMesh.geometry === chunk.waterBedMesh.geometry,
    "Water surface and bed must share one sparse wet-cell geometry allocation.",
  );
  assert(
    chunk.mesh.geometry.getAttribute("terrainEnvironment")?.itemSize === 4,
    "Terrain must carry altitude/humidity/water/stone environment channels.",
  );
  const terrainIndexCount = chunk.mesh.geometry.getIndex()?.count ?? 0;
  const waterIndexCount = chunk.waterMesh.geometry.getIndex()?.count ?? 0;
  const waterBedIndexCount = chunk.waterBedMesh.geometry.getIndex()?.count ?? 0;
  assert(
    waterIndexCount > 0 && waterIndexCount < terrainIndexCount,
    "River water must submit only wet cells instead of the complete terrain grid.",
  );
  assert(
    waterBedIndexCount === waterIndexCount,
    "Riverbed and surface topology must match.",
  );
  assertClose(
    chunk.getTriangleCount(),
    (terrainIndexCount + waterIndexCount + waterBedIndexCount) / 3,
    "Terrain diagnostics must include both streamed water draws.",
  );

  const waterData = chunk.waterMesh.geometry.getAttribute("waterData");
  const waterInteraction =
    chunk.waterMesh.geometry.getAttribute("waterInteraction");
  assert(
    waterData?.itemSize === 4,
    "Water mesh must pack coverage, depth, and downstream flow in one vec4.",
  );
  assert(
    waterInteraction?.itemSize === 2,
    "Water mesh must pack stone-edge and downstream-wake interaction masks.",
  );
  let positiveDepthSamples = 0;
  for (let index = 0; index < waterData.array.length; index += 4) {
    const coverage = waterData.array[index];
    const depth = waterData.array[index + 1];
    const flowLength = Math.hypot(
      waterData.array[index + 2],
      waterData.array[index + 3],
    );
    assert(depth >= 0, "Packed water depth must never be negative.");
    assert(
      flowLength <= coverage + 1e-5,
      "Packed flow magnitude must not exceed visible water coverage.",
    );
    if (coverage > 0.1 && depth > 0.05) positiveDepthSamples += 1;
  }
  assert(
    positiveDepthSamples > 0,
    "A wet chunk must carry real bed-to-surface depth for water absorption.",
  );
  chunk.dispose();
  terrainMaterial.dispose();
  waterMaterial.dispose();
  waterBedMaterial.dispose();

  const fakeStoneField = {
    sampleGrassClearance(x, z) {
      return Math.abs(x) < 0.75 && Math.abs(z) < 0.75 ? 0 : 1;
    },
  };
  setStoneClearanceField(fakeStoneField);
  try {
    const interactionField = new WaterInteractionField(config);
    const interactionHydrology = createHydrologySample();
    interactionHydrology.riverCoverage = 1;
    interactionHydrology.flowX = 1;
    interactionHydrology.flowZ = 0;
    const interaction = createWaterInteractionSample();
    interactionField.sample(0, 0, interactionHydrology, 0, interaction);
    assert(
      interaction.obstacle > 0.99,
      "Stone centers must drive water obstacle foam.",
    );
    interactionField.sample(
      config.waterStoneWakeLength,
      0,
      interactionHydrology,
      1,
      interaction,
    );
    assert(
      interaction.wake > 0.5 && interaction.wake < 1,
      "River stone wakes must remain present but taper downstream.",
    );
  } finally {
    setStoneClearanceField(undefined);
  }

  const riverField = new RiverField(config);
  const riverA = createRiverSample();
  const riverB = createRiverSample();
  const MORPH_MIN = -768;
  const MORPH_MAX = 768;
  const MORPH_STEP = 8;
  const WIDTH_EPSILON = 1e-4;
  let poolSamples = 0;
  let riffleSamples = 0;
  let poolWidthSum = 0;
  let riffleWidthSum = 0;
  let poolCenterDepthSum = 0;
  let riffleCenterDepthSum = 0;
  let poolCenterCount = 0;
  let riffleCenterCount = 0;
  let wetMorphologySamples = 0;
  const straightInside = { 45: [], 70: [] };
  const straightOutside = { 45: [], 70: [] };
  const positiveInside = { 45: [], 70: [] };
  const positiveOutside = { 45: [], 70: [] };
  const negativeInside = { 45: [], 70: [] };
  const negativeOutside = { 45: [], 70: [] };
  const referenceHalfWidth = config.riverWidth * 0.5;

  const pushBand = (target, absLateral, depth) => {
    if (Math.abs(absLateral - 0.45) <= 0.06) target[45].push(depth);
    if (Math.abs(absLateral - 0.7) <= 0.06) target[70].push(depth);
  };

  for (let z = MORPH_MIN; z <= MORPH_MAX; z += MORPH_STEP) {
    for (let x = MORPH_MIN; x <= MORPH_MAX; x += MORPH_STEP) {
      riverField.sample(x, z, 18, riverA);
      riverField.sample(x, z, 18, riverB);
      for (const key of [
        "coverage",
        "bank",
        "proximity",
        "flowX",
        "flowZ",
        "morphology",
        "bend",
        "lateral",
        "localHalfWidth",
        "bedDepth",
        "incisionDepth",
      ]) {
        assertClose(
          riverA[key],
          riverB[key],
          `River ${key} must be deterministic at ${x}, ${z}.`,
        );
      }
      assert(
        riverA.morphology >= -1 && riverA.morphology <= 1,
        `Morphology must stay in -1..1, received ${riverA.morphology}.`,
      );
      if (riverA.coverage <= 0.02) continue;
      wetMorphologySamples += 1;
      const widthScale = riverA.localHalfWidth / referenceHalfWidth;
      assert(
        widthScale >= RIVER_GLOBAL_MIN_WIDTH_SCALE - WIDTH_EPSILON &&
          widthScale <= RIVER_GLOBAL_MAX_WIDTH_SCALE + WIDTH_EPSILON,
        `Local width scale ${widthScale} left the 0.82..1.18 envelope at ${x}, ${z}.`,
      );
      if (riverA.morphology >= 0.5) {
        poolSamples += 1;
        poolWidthSum += riverA.localHalfWidth;
        if (Math.abs(riverA.lateral) <= 0.12) {
          poolCenterDepthSum += riverA.bedDepth;
          poolCenterCount += 1;
        }
      } else if (riverA.morphology <= -0.5) {
        riffleSamples += 1;
        riffleWidthSum += riverA.localHalfWidth;
        if (Math.abs(riverA.lateral) <= 0.12) {
          riffleCenterDepthSum += riverA.bedDepth;
          riffleCenterCount += 1;
        }
      }
      const absLateral = Math.abs(riverA.lateral);
      if (Math.abs(riverA.bend) < 0.05) {
        if (riverA.lateral >= 0)
          pushBand(straightInside, absLateral, riverA.bedDepth);
        else pushBand(straightOutside, absLateral, riverA.bedDepth);
      }
      if (riverA.bend >= 0.45) {
        if (Math.sign(riverA.lateral) === Math.sign(riverA.bend)) {
          pushBand(positiveInside, absLateral, riverA.bedDepth);
        } else {
          pushBand(positiveOutside, absLateral, riverA.bedDepth);
        }
      }
      if (riverA.bend <= -0.45) {
        if (Math.sign(riverA.lateral) === Math.sign(riverA.bend)) {
          pushBand(negativeInside, absLateral, riverA.bedDepth);
        } else {
          pushBand(negativeOutside, absLateral, riverA.bedDepth);
        }
      }
    }
  }

  assert(
    wetMorphologySamples > 200,
    "Morphology sweep must find wet river samples.",
  );
  assert(
    poolSamples > 20,
    "Normalized morphology must reach the pool QA band.",
  );
  assert(
    riffleSamples > 20,
    "Normalized morphology must reach the riffle QA band.",
  );
  assert(
    poolWidthSum / poolSamples > riffleWidthSum / riffleSamples,
    "Pool candidates must be wider than riffle candidates on average.",
  );
  assert(
    poolCenterCount > 5 && riffleCenterCount > 5,
    "Pool/riffle centre-depth statistics need centreline samples.",
  );
  assert(
    poolCenterDepthSum / poolCenterCount >
      riffleCenterDepthSum / riffleCenterCount,
    "Pool candidates must be deeper on the centreline than riffle candidates.",
  );

  const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  for (const band of [45, 70]) {
    if (straightInside[band].length > 8 && straightOutside[band].length > 8) {
      assert(
        Math.abs(mean(straightInside[band]) - mean(straightOutside[band])) <
          0.12,
        `Near-straight rivers must stay nearly symmetric at |lateral|=0.${band}.`,
      );
    }
  }
  for (const band of [45, 70]) {
    if (positiveOutside[band].length > 4 && positiveInside[band].length > 4) {
      assert(
        mean(positiveOutside[band]) > mean(positiveInside[band]),
        `Positive bends must cut a deeper outside channel at |lateral|=0.${band}.`,
      );
    }
    if (negativeOutside[band].length > 4 && negativeInside[band].length > 4) {
      assert(
        mean(negativeOutside[band]) > mean(negativeInside[band]),
        `Negative bends must cut a deeper outside channel at |lateral|=0.${band}.`,
      );
    }
  }

  const tightConfig = {
    ...config,
    riverWidthVariation: 0.12,
    riverBendBankAsymmetry: 0.07,
  };
  let envelopeRejected = false;
  try {
    validateWorldConfig(tightConfig);
  } catch {
    envelopeRejected = true;
  }
  assert(
    envelopeRejected,
    "Validator must reject combined width tuning that exceeds the 1.18 envelope.",
  );

  const continuityOriginX = riverPoint.x;
  const continuityOriginZ = riverPoint.z;
  riverField.sample(continuityOriginX, continuityOriginZ, 18, riverA);
  let walkX = continuityOriginX;
  let walkZ = continuityOriginZ;
  let previous;
  for (let distance = 0; distance <= 512; distance += 1) {
    riverField.sample(walkX, walkZ, 18, riverA);
    if (previous) {
      assert(
        Number.isFinite(riverA.morphology) &&
          Number.isFinite(riverA.localHalfWidth) &&
          Number.isFinite(riverA.bedDepth),
        "Longitudinal river fields must stay finite.",
      );
      assert(
        Math.abs(riverA.morphology - previous.morphology) < 0.35 &&
          Math.abs(riverA.localHalfWidth - previous.localHalfWidth) < 1.6 &&
          Math.abs(riverA.bedDepth - previous.bedDepth) < 0.85,
        `River morphology must change continuously along ${walkX}, ${walkZ}.`,
      );
    }
    previous = {
      morphology: riverA.morphology,
      localHalfWidth: riverA.localHalfWidth,
      bedDepth: riverA.bedDepth,
    };
    walkX += riverA.flowX;
    walkZ += riverA.flowZ;
  }

  const chunkSize = config.chunkSize;
  const seamX = Math.round(riverPoint.x / chunkSize) * chunkSize;
  const seamZ = Math.round(riverPoint.z / chunkSize) * chunkSize;
  for (const [x, z] of [
    [seamX, seamZ],
    [seamX + 1e-6, seamZ],
    [seamX - 1e-6, seamZ],
    [seamX, seamZ + 1e-6],
    [seamX, seamZ - 1e-6],
  ]) {
    const height = terrain.sampleHeight(x, z);
    const left = createHydrologySample();
    const right = createHydrologySample();
    terrain.sampleHydrology(x, z, height, left);
    terrain.sampleHydrology(x, z, height, right);
    for (const key of [
      "riverCoverage",
      "flowX",
      "flowZ",
      "riverMorphology",
      "riverBend",
      "riverLateral",
      "waterLevel",
    ]) {
      assertClose(
        left[key],
        right[key],
        `Chunk-seam ${key} must not depend on call order.`,
      );
    }
  }

  const CROSS_FLOW_OFFSET = 0.75;
  const CROSS_FLOW_BASELINE_P95 = 0.3353356786874997;
  /**
   * Re-baselined when rivers gained a discharge hierarchy. The old limit was
   * captured when every lane was 12 m wide; lanes now reach 41 m, and this
   * probe steps a fixed 0.75 m perpendicular to the flow, so its two samples
   * also separate along the channel and the reading now carries the long-profile
   * gradient as well as any cross-channel tilt.
   *
   * The tilt this guard exists to catch went the right way: taking the surface
   * from the river's own centreline instead of from each sample's local ground
   * dropped the measured p95 from 0.400 to 0.364 even as the channels tripled in
   * width. What remains is the clamp holding the sheet above bars that stand
   * proud of the centreline surface. 0.385 keeps roughly a 5% guard over that.
   */
  const CROSS_FLOW_P95_LIMIT = 0.385;
  const crossFlowSlopes = [];
  const crossHydrology = createHydrologySample();
  const leftHydrology = createHydrologySample();
  const rightHydrology = createHydrologySample();
  for (let z = MORPH_MIN; z <= MORPH_MAX; z += MORPH_STEP) {
    for (let x = MORPH_MIN; x <= MORPH_MAX; x += MORPH_STEP) {
      const height = terrain.sampleHeight(x, z);
      terrain.sampleHydrology(x, z, height, crossHydrology);
      if (
        crossHydrology.riverCoverage < 0.35 ||
        crossHydrology.lakeCoverage > 0.05
      ) {
        continue;
      }
      const flowLength = Math.hypot(crossHydrology.flowX, crossHydrology.flowZ);
      if (!(flowLength > 1e-6)) continue;
      const perpX = -crossHydrology.flowZ / flowLength;
      const perpZ = crossHydrology.flowX / flowLength;
      const leftX = x + perpX * CROSS_FLOW_OFFSET;
      const leftZ = z + perpZ * CROSS_FLOW_OFFSET;
      const rightX = x - perpX * CROSS_FLOW_OFFSET;
      const rightZ = z - perpZ * CROSS_FLOW_OFFSET;
      const leftHeight = terrain.sampleHeight(leftX, leftZ);
      const rightHeight = terrain.sampleHeight(rightX, rightZ);
      terrain.sampleHydrology(leftX, leftZ, leftHeight, leftHydrology);
      terrain.sampleHydrology(rightX, rightZ, rightHeight, rightHydrology);
      if (
        leftHydrology.riverCoverage < 0.35 ||
        rightHydrology.riverCoverage < 0.35
      ) {
        continue;
      }
      // A knickpoint face is a near-vertical water surface on purpose. This
      // guard exists to catch a sheet ramping bank to bank on an ordinary
      // reach, so measuring it across a waterfall would only ever report the
      // waterfall working.
      if (
        leftHydrology.riverFallFace > 0.01 ||
        rightHydrology.riverFallFace > 0.01
      ) {
        continue;
      }
      const slope =
        Math.abs(leftHydrology.waterLevel - rightHydrology.waterLevel) /
        (2 * CROSS_FLOW_OFFSET);
      assert(
        Number.isFinite(slope),
        "Cross-flow surface slope must stay finite.",
      );
      crossFlowSlopes.push(slope);
    }
  }
  crossFlowSlopes.sort((left, right) => left - right);
  const crossFlowP95 =
    crossFlowSlopes[
      Math.min(
        crossFlowSlopes.length - 1,
        Math.max(0, Math.ceil(0.95 * crossFlowSlopes.length) - 1),
      )
    ];
  assert(
    crossFlowSlopes.length > 100,
    "Cross-flow regression needs enough wet river samples.",
  );
  assert(
    crossFlowP95 <= CROSS_FLOW_P95_LIMIT,
    `Cross-flow p95 slope ${crossFlowP95} exceeded the ${CROSS_FLOW_P95_LIMIT} regression limit.`,
  );

  const waterController = new WaterMaterialController(config);
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <normal_fragment_maps>",
  };
  waterController.material.onBeforeCompile(shader, {});
  assert(
    shader.vertexShader.includes("attribute vec4 waterData") &&
      shader.vertexShader.includes("attribute vec4 waterContext") &&
      shader.vertexShader.includes("attribute vec2 waterInteraction"),
    "Water shader must consume hydrology, river/lake context, and stone-interaction attributes.",
  );
  for (const token of [
    "waterFlowDirection",
    "vWaterWorldNormal",
    "waterTransmittance",
    "waterFresnel",
    "waterShoreBand",
    "waterRiverFoam",
    "waterDetailWeight",
    "waterLightingNormal",
    "gl_FrontFacing",
    "waterSampleAdvectedNoise",
    "uWaterSunDirection",
    "waterGlint",
    "waterStoneFoam",
    "waterLocalFlowSpeed",
    "waterResolveRiffleFoam",
    "uWaterShoreFoamWeight",
    "waterResolveRegime",
    "waterResolveBankSides",
    "waterResolveLakeExposure",
    "waterResolveLakeSlope",
    "waterResolveRiverPhases",
    "waterStreakStretch",
  ]) {
    assert(
      shader.fragmentShader.includes(token),
      `Water shader is missing ${token}.`,
    );
  }
  assert(
    !shader.fragmentShader.includes("waterSampleRiverBed") &&
      !shader.fragmentShader.includes("uWaterBedNoise"),
    "The transparent water surface must never composite riverbed pebbles over scene geometry.",
  );
  assert(
    shader.uniforms.uWaterFlowNoise?.value?.isDataTexture === true,
    "Water must bind the generated deterministic flow-noise texture.",
  );
  assert(
    shader.fragmentShader.includes(
      `waterCoverageRaw < ${WATER_VISIBLE_COVERAGE_THRESHOLD}`,
    ),
    "CPU water topology and shader clipping must share one coverage threshold.",
  );
  assert(
    !shader.fragmentShader.includes("dFdx(vWaterWorldPosition)") &&
      !shader.fragmentShader.includes("dFdy(vWaterWorldPosition)"),
    "Water shading must not rebuild the surface normal from screen-space derivatives.",
  );
  assert(
    shader.vertexShader.includes(
      "vWaterWorldNormal = (modelMatrix * vec4(objectNormal",
    ),
    "The water sheet must forward its per-vertex normal to the fragment stage.",
  );
  assert(
    waterController.material.isMeshPhysicalMaterial === true &&
      Math.abs(waterController.material.ior - 1.333) < 1e-6 &&
      Math.abs(waterController.material.roughness - config.waterRoughness) <
        1e-9 &&
      waterController.material.transmission === 0,
    "Water must use the physical dielectric BRDF without transmission overhead.",
  );
  assert(
    waterController.material.depthWrite === false &&
      waterController.material.transparent === true &&
      waterController.material.side === THREE.DoubleSide,
    "Water must be transparent, avoid depth writes, and remain visible from below.",
  );

  const waterBedController = new WaterBedMaterialController(config);
  const bedShader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>",
  };
  waterBedController.material.onBeforeCompile(bedShader, {});
  assert(
    bedShader.vertexShader.includes("attribute vec4 waterData") &&
      bedShader.vertexShader.includes("transformed.y -= max(0.0, waterData.y)"),
    "The riverbed pass must move shared water topology down to the real bed depth.",
  );
  assert(
    bedShader.fragmentShader.includes("waterSampleRiverBed") &&
      bedShader.fragmentShader.includes("waterBedCaustic") &&
      bedShader.fragmentShader.includes("uWaterBedRefraction") &&
      bedShader.fragmentShader.includes("discard"),
    "The riverbed pass must own cobble, caustic, refraction, and opaque coverage shading.",
  );
  assert(
    bedShader.uniforms.uWaterBedNoise?.value?.isDataTexture === true &&
      bedShader.uniforms.uWaterBedNoise.value.wrapS === THREE.RepeatWrapping &&
      bedShader.uniforms.uWaterBedNoise.value.wrapT === THREE.RepeatWrapping,
    "Riverbed shading must bind its deterministic repeating bed texture.",
  );
  assert(
    waterBedController.material.transparent === false &&
      waterBedController.material.depthWrite === true &&
      waterBedController.material.depthTest === true &&
      waterBedController.material.polygonOffset === true,
    `Riverbed shading must depth-test and depth-write as opaque world geometry. Received transparent=${waterBedController.material.transparent} depthWrite=${waterBedController.material.depthWrite} depthTest=${waterBedController.material.depthTest}.`,
  );

  waterBedController.dispose();
  waterController.dispose();

  console.log(
    `[hydrology] Rivers ${riverSamples}, lakes ${lakeSamples}, carved ${carvedSamples}; flow noise, absorption, glints, stone wakes, opaque depth-tested riverbed, and physical water verified.`,
  );
} finally {
  await server.close();
}
