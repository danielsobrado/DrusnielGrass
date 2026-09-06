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

/**
 * Strips comments so a shader contract reads code, not prose.
 *
 * These modules explain at length which techniques they deliberately avoid, and
 * a bare substring check will happily match the warning against a technique as
 * though it were the technique itself.
 */
function stripComments(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function fail(message) {
  throw new Error(`[grass-performance] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readYamlNumber(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*([0-9.]+)$`, "m"));
  const value = Number(match?.[1]);
  if (!Number.isFinite(value)) {
    fail(`Unable to read ${key}.`);
  }
  return value;
}

function readSourceNumber(source, key) {
  const match = source.match(new RegExp(`const ${key}\\s*=\\s*([0-9.]+)`));
  const value = Number(match?.[1]);
  if (!Number.isFinite(value)) {
    fail(`Unable to read source constant ${key}.`);
  }
  return value;
}

function distanceToTile(x, z, originX, originZ, tileSize) {
  const distanceX = Math.max(originX - x, 0, x - (originX + tileSize));
  const distanceZ = Math.max(originZ - z, 0, z - (originZ + tileSize));
  return Math.hypot(distanceX, distanceZ);
}

function countTiles(radius, tileSize, focusX, focusZ) {
  const centerTileX = Math.floor(focusX / tileSize);
  const centerTileZ = Math.floor(focusZ / tileSize);
  const offset = Math.max(1, Math.ceil(radius / tileSize));
  let count = 0;
  for (let dz = -offset; dz <= offset; dz += 1) {
    for (let dx = -offset; dx <= offset; dx += 1) {
      const tileX = centerTileX + dx;
      const tileZ = centerTileZ + dz;
      if (
        distanceToTile(
          focusX,
          focusZ,
          tileX * tileSize,
          tileZ * tileSize,
          tileSize,
        ) <= radius
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function requestedBladesPerTile(tileSize, density, multiplier) {
  return Math.max(1, Math.round(tileSize ** 2 * density * multiplier));
}

function evaluateNearField(
  focusX,
  focusZ,
  density,
  parameters,
  legacy = false,
) {
  const segmentedTriangles = parameters.bladeSegments * 2;
  if (legacy) {
    const baseTiles = countTiles(
      parameters.legacyBaseRadius,
      parameters.tileSize,
      focusX,
      focusZ,
    );
    const ultraTiles = countTiles(
      parameters.ultraRadius,
      parameters.tileSize,
      focusX,
      focusZ,
    );
    return (
      baseTiles *
        requestedBladesPerTile(parameters.tileSize, density, 1) *
        segmentedTriangles +
      ultraTiles *
        requestedBladesPerTile(
          parameters.tileSize,
          density,
          parameters.ultraMultiplier - 1,
        ) *
        segmentedTriangles
    );
  }

  const baseTiles = countTiles(
    parameters.baseRadius,
    parameters.tileSize,
    focusX,
    focusZ,
  );
  const detailTiles = countTiles(
    parameters.detailRadius,
    parameters.tileSize,
    focusX,
    focusZ,
  );
  const ultraTiles = countTiles(
    parameters.ultraRadius,
    parameters.tileSize,
    focusX,
    focusZ,
  );
  const boostTiles = countTiles(
    parameters.boostRadius,
    parameters.tileSize,
    focusX,
    focusZ,
  );
  return (
    baseTiles * requestedBladesPerTile(parameters.tileSize, density, 1) +
    detailTiles *
      requestedBladesPerTile(parameters.tileSize, density, 1) *
      segmentedTriangles +
    ultraTiles *
      requestedBladesPerTile(
        parameters.tileSize,
        density,
        parameters.ultraMultiplier - 1,
      ) *
      segmentedTriangles +
    boostTiles *
      requestedBladesPerTile(
        parameters.tileSize,
        density,
        parameters.ultraMultiplier - 1,
      )
  );
}

function sampleNearField(density, parameters) {
  const values = [];
  const phaseSamples = 64;
  for (let iz = 0; iz < phaseSamples; iz += 1) {
    for (let ix = 0; ix < phaseSamples; ix += 1) {
      values.push(
        evaluateNearField(
          (ix * parameters.tileSize) / phaseSamples,
          (iz * parameters.tileSize) / phaseSamples,
          density,
          parameters,
        ),
      );
    }
  }
  for (const [focusX, focusZ] of [
    [0, 0],
    [parameters.tileSize * 0.5, parameters.tileSize * 0.5],
    [parameters.tileSize * 0.5, parameters.tileSize * 0.375],
    [parameters.tileSize * 0.375, parameters.tileSize * 0.5],
  ]) {
    values.push(
      evaluateNearField(focusX, focusZ, density, parameters),
    );
  }

  const legacyValues = [];
  for (let iz = 0; iz < phaseSamples; iz += 1) {
    for (let ix = 0; ix < phaseSamples; ix += 1) {
      legacyValues.push(
        evaluateNearField(
          (ix * parameters.tileSize) / phaseSamples,
          (iz * parameters.tileSize) / phaseSamples,
          density,
          parameters,
          true,
        ),
      );
    }
  }

  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    maximum: Math.max(...values),
    legacyAverage:
      legacyValues.reduce((sum, value) => sum + value, 0) /
      legacyValues.length,
  };
}

function estimateSubmittedLodTriangles(
  direction,
  bladeDensity,
  patchSize,
  farInstances,
  farSubpatches,
) {
  const farTriangleDensity =
    (farInstances * farSubpatches * 2) / patchSize ** 2;
  const midInnerRadius = Math.max(
    0,
    direction.nearDistance - direction.transitionDistance,
  );
  const midOuterRadius =
    direction.midDistance + direction.transitionDistance;
  const farInnerRadius = Math.max(
    0,
    direction.midDistance - direction.transitionDistance,
  );
  const farOuterRadius =
    direction.farDistance + direction.transitionDistance;
  const midArea =
    Math.PI * (midOuterRadius ** 2 - midInnerRadius ** 2);
  const farArea =
    Math.PI * (farOuterRadius ** 2 - farInnerRadius ** 2);
  // This deliberately charges full geometry anywhere a mesh can be visible.
  // Shader dithering/degeneration can reduce raster and ALU cost, but it does
  // not reduce submitted indices or vertex invocations.
  return midArea * bladeDensity + farArea * farTriangleDensity;
}

const worldConfig = read("public/config/world.yaml");
const grassConfig = read("public/config/grass.yaml");
const presets = JSON.parse(read("src/grass/GrassArtPresets.json"));
const nearField = read("src/world/grass/WorldNearGrassField.ts");
const tileFactory = read("src/world/grass/WorldSingleBladeTileFactory.ts");
const tileField = read("src/world/grass/WorldSingleBladeTileField.ts");
const terrainChunk = read("src/world/TerrainChunk.ts");
const nearMaterial = read("src/grass/materials/GrassNearMaterial.ts");
const worldGrassSystem = read("src/world/WorldGrassSystem.ts");
const lodController = read("src/grass/GrassLodController.ts");
const lodTuning = read("src/grass/GrassLodTuning.ts");
const patchGeometryFactory = read(
  "src/world/grass/WorldGrassPatchGeometryFactory.ts",
);
const impostorMaterial = read(
  "src/world/grass/WorldGrassImpostorMaterial.ts",
);
const impostorTuning = read(
  "src/world/grass/WorldGrassImpostorTuning.ts",
);
const impostorLimits = read("src/grass/GrassImpostorLimits.ts");
const trailField = read("src/grass/interaction/GrassTrailField.ts");
const interactionField = read(
  "src/grass/interaction/GrassInteractionField.ts",
);
const worldApp = read("src/app/WorldApp.ts");
const terrainStreamer = read("src/world/TerrainStreamer.ts");
const terrainMaterialShader = read("src/world/TerrainMaterialShader.ts");
const terrainField = read("src/world/TerrainField.ts");
const denseSpawnLocator = read("src/world/DenseSpawnLocator.ts");
const terrainHeightLattice = read("src/world/TerrainHeightLattice.ts");
const geometryFactory = read("src/grass/GrassGeometryFactory.ts");
const biomeProfileSource = read("src/grass/biome/GrassBiomeProfile.ts");
const biomeProfiles = JSON.parse(read("src/grass/biome/GrassBiomeProfiles.json"));
const biomeField = read("src/world/grass/WorldBiomeField.ts");
const qualityGovernor = read("src/runtime/GrassQualityGovernor.ts");
const impostorAtlasFactory = read(
  "src/world/grass/WorldGrassImpostorAtlasFactory.ts",
);
const accentSpeciesSource = read("src/grass/biome/GrassAccentSpecies.ts");
const detailFoliageField = read("src/world/grass/WorldDetailFoliageField.ts");
const detailFoliageMaterial = read(
  "src/world/grass/WorldDetailFoliageMaterial.ts",
);
const detailFoliageAtlasFactory = read(
  "src/world/grass/WorldDetailFoliageAtlasFactory.ts",
);

const bladeSegments = readYamlNumber(grassConfig, "bladeSegments");
const tileSize = readYamlNumber(worldConfig, "grassNearTileSize");
const desktopDensity = readYamlNumber(
  worldConfig,
  "grassNearBladesPerSquareMeterDesktop",
);
const compactDensity = readYamlNumber(
  worldConfig,
  "grassNearBladesPerSquareMeterCompact",
);
const patchDesktopDensity = readYamlNumber(
  worldConfig,
  "grassBladesPerSquareMeterDesktop",
);
const patchCompactDensity = readYamlNumber(
  worldConfig,
  "grassBladesPerSquareMeterCompact",
);
const nearDistance = readYamlNumber(worldConfig, "grassNearDistance");
const transitionDistance = readYamlNumber(
  worldConfig,
  "grassTransitionDistance",
);
const ultraDistance = readYamlNumber(worldConfig, "grassUltraNearDistance");
const ultraTransition = readYamlNumber(
  worldConfig,
  "grassUltraNearTransitionDistance",
);
const ultraMultiplier = readYamlNumber(
  worldConfig,
  "grassUltraNearDensityMultiplier",
);
const compactUltraMultiplier = readYamlNumber(
  worldConfig,
  "grassUltraNearDensityMultiplierCompact",
);
const boostDistance = readYamlNumber(
  worldConfig,
  "grassNearDensityBoostDistance",
);
const boostTransition = readYamlNumber(
  worldConfig,
  "grassNearDensityBoostTransition",
);
const midBladeFraction = readYamlNumber(worldConfig, "grassMidBladeFraction");
const farCards = readYamlNumber(worldConfig, "grassFarImpostorsPerPatch");
const farSubpatchesPerAxis = readSourceNumber(
  impostorLimits,
  "GRASS_IMPOSTOR_SUBPATCHES_PER_AXIS",
);
const farSubpatches = farSubpatchesPerAxis ** 2;
const batchesPerAxis = readYamlNumber(
  worldConfig,
  "grassRenderBatchesPerAxis",
);
const patchSize = readYamlNumber(worldConfig, "grassPatchSize");
const chunkSize = readYamlNumber(worldConfig, "chunkSize");
const boundsMargin = readSourceNumber(
  nearField,
  "SINGLE_BLADE_BOUNDS_MARGIN",
);
const maximumPresetNearFade = Math.max(
  ...Object.values(presets).map(
    (direction) => direction.nearDistance + direction.transitionDistance,
  ),
);

assert(desktopDensity === 84 && patchDesktopDensity === 84, "Desktop LOD density must remain 84 blades/m².");
// Compact density is now a reviewed ceiling rather than a fixed value: the
// mobile plan's A/B lowered it from 48 to 40 blades/m² (32 opened visible
// ground holes at third-person distance). Desktop stays exact after its own
// reviewed canopy-closure pass.
assert(
  compactDensity === patchCompactDensity &&
    compactDensity <= 48 &&
    compactDensity >= 32,
  `Compact LOD density must stay within the reviewed 32-48 blades/m² band and match across layers: ${compactDensity}/${patchCompactDensity}.`,
);
assert(midBladeFraction === 1, "The performance path must retain every mid blade.");
assert(farCards === 1, "The far path must retain exactly one instance per source patch.");
assert(farSubpatchesPerAxis === 2 && farSubpatches === 4, "Each far instance must contain a 2x2 genuine subpatch layout.");
assert(batchesPerAxis === 2, "Grass chunks must retain exactly four 32 m render batches.");
assert(chunkSize % patchSize === 0, "Chunk size must be divisible by patch size.");
const patchesPerAxis = chunkSize / patchSize;
assert(patchesPerAxis % batchesPerAxis === 0, "Patch rows must divide evenly into render batches.");
const patchesPerBatch = (patchesPerAxis / batchesPerAxis) ** 2;
assert(patchesPerBatch === 64, "Each render batch must contain at most 64 source patches.");

for (const [profile, density, expectedBladesPerPatch] of [
  ["desktop", patchDesktopDensity, 1344],
  ["compact", patchCompactDensity, Math.round(patchSize ** 2 * patchCompactDensity)],
]) {
  const bladesPerPatch = Math.round(patchSize ** 2 * density);
  const midBladesPerPatch = Math.round(bladesPerPatch * midBladeFraction);
  const farInstancesPerBatch = patchesPerBatch * farCards;
  const farTrianglesPerBatch =
    farInstancesPerBatch * farSubpatches * 2;
  const midTrianglesPerBatch = midBladesPerPatch * patchesPerBatch;
  assert(bladesPerPatch === expectedBladesPerPatch, `${profile} patch blade count changed.`);
  assert(midBladesPerPatch === bladesPerPatch, `${profile} mid blades no longer retain the full patch source.`);
  assert(farInstancesPerBatch === 64, `${profile} far-instance batch count changed.`);
  assert(farTrianglesPerBatch === 512, `${profile} far-subpatch triangle count changed.`);
  assert(midTrianglesPerBatch + farTrianglesPerBatch <= (profile === "desktop" ? 87000 : 49664), `${profile} mid/far batch triangle ceiling exceeded.`);
}

const nearParameters = {
  tileSize,
  bladeSegments,
  baseRadius: maximumPresetNearFade + boundsMargin,
  detailRadius: ultraDistance + ultraTransition + boundsMargin,
  ultraRadius: ultraDistance + ultraTransition,
  boostRadius: boostDistance + boostTransition + boundsMargin,
  ultraMultiplier,
  legacyBaseRadius:
    nearDistance + transitionDistance + tileSize * Math.SQRT2,
};
const desktopNear = sampleNearField(desktopDensity, nearParameters);
// Compact carries its own ultra-near multiplier, so charging it the desktop
// stack would overstate the phone's near band by the difference — conservative,
// but it would also hide a real reduction from the summary below.
const compactNear = sampleNearField(compactDensity, {
  ...nearParameters,
  ultraMultiplier: compactUltraMultiplier,
});
const maximumNearBaselineRatio = Math.max(
  desktopNear.average / desktopNear.legacyAverage,
  compactNear.average / compactNear.legacyAverage,
);
// The density-boost layer carries the extra population out to 20 m on
// one-triangle blades (residency 14 + 6 + 2 = 22 m). That is the cost of
// closing the 6-7 m density cliff without spending six-triangle silhouettes
// past 7 m. The canopy-closure pass raises the reviewed desktop ceiling to
// 1,450,000; compact stays at 600,000.
assert(desktopNear.maximum <= 1_450_000, `Desktop near-field triangle ceiling exceeded: ${desktopNear.maximum}.`);
assert(compactNear.maximum <= 600_000, `Compact near-field triangle ceiling exceeded: ${compactNear.maximum}.`);
assert(desktopNear.average / desktopNear.legacyAverage <= 0.36, "Desktop near-field optimization regressed.");
assert(compactNear.average / compactNear.legacyAverage <= 0.36, "Compact near-field optimization regressed.");

const baselineMidDistances = {
  "muted-meadow": 80,
  "lush-hero": 80,
  "natural-meadow": 72,
  "golden-hour": 68,
  "cool-highland": 86,
  "dense-emerald": 92,
  "zelda-field": 82,
  windswept: 78,
};
const submissionRatios = [];
for (const [key, direction] of Object.entries(presets)) {
  for (const [profile, density, baselineDensity] of [
    ["desktop", patchDesktopDensity, 36],
    ["compact", patchCompactDensity, 26],
  ]) {
    const baselineDirection = {
      ...direction,
      midDistance: baselineMidDistances[key],
    };
    const currentSubmission = estimateSubmittedLodTriangles(
      direction,
      density,
      patchSize,
      farCards,
      farSubpatches,
    );
    const baselineSubmission = estimateSubmittedLodTriangles(
      baselineDirection,
      baselineDensity,
      patchSize,
      farCards,
      farSubpatches,
    );
    const ratio = currentSubmission / baselineSubmission;
    submissionRatios.push(ratio);
    assert(
      Number.isFinite(ratio) && ratio <= 1.18,
      `${direction.label} ${profile} mid/far submission ratio ${ratio.toFixed(3)} exceeds 1.18.`,
    );
  }
}

assert(nearField.includes("bladeSegments: 1"), "The non-ultra base field must use one-triangle blades.");
assert(
  nearField.includes("world-grass-near-density-boost") &&
    nearField.includes("seedSalt: ULTRA_NEAR_SEED_SALT") &&
    /namePrefix:\s*"world-grass-near-density-boost"[\s\S]{0,600}?bladeSegments:\s*1/.test(
      nearField,
    ),
  "The density boost layer must continue the ultra-near placement on one-triangle blades.",
);
assert(nearField.includes("world-grass-ultra-near-base-detail") && nearField.includes("bladeSegments: grassConfig.geometry.bladeSegments"), "Ultra-near must retain configured segmented geometry.");
assert(
  nearField.includes("resolveBaseVisibilityRadius") &&
    nearField.includes("setVisibilityRadius") &&
    nearField.includes("reconcileEveryFrame: true"),
  "The base tile shell must follow camera movement and the active preset fade.",
);
assert(tileFactory.includes("calculateGrassSingleBladeRootBoundsRadius") && !tileFactory.includes("const BOUNDS_PADDING = 1.5"), "Near bounds must be configuration-derived.");
assert(nearMaterial.includes("bool grassKeepBlade") && nearMaterial.includes("transformed = vec3(0.0)"), "Rejected blades must skip rasterization and wind work.");
assert(!worldGrassSystem.includes("world-grass-near-") && !worldGrassSystem.includes("nearGeometries") && !patchGeometryFactory.includes("near.push("), "The redundant streamed near clump mesh and its geometry must not be built at all.");
assert(!nearMaterial.includes("discard;"), "The near/mid keep test must stay in the vertex stage so the fragment shader remains early-Z friendly.");
// The rejection is branchless: rather than early-returning with an off-screen
// gl_Position, a rejected card multiplies its corner offset by zero so all four
// vertices collapse onto the centre. That is still a vertex-stage rejection —
// the primitive has zero area and never reaches fragment shading — but it keeps
// every vertex emitting the same output set, which some mobile tile renderers
// require. Pin the collapse, not the old early-out.
assert(impostorMaterial.includes("step(0.001, effectiveCoverage)") && impostorMaterial.includes("cardOffset * cardVisibility"), "Zero-coverage far cards must be clipped in the vertex stage.");
assert(worldGrassSystem.includes("mesh.matrixAutoUpdate = false") && tileFactory.includes("mesh.matrixAutoUpdate = false"), "Static grass meshes must not recompose their matrix every frame.");
assert(
  worldGrassSystem.includes(
    "mesh.instanceMatrix = new THREE.InstancedBufferAttribute",
  ) &&
    tileFactory.includes("const instanceMatrix = new THREE.InstancedBufferAttribute") &&
    tileFactory.includes("mesh.instanceMatrix = placement.instanceMatrix"),
  "Instance matrices must be adopted or shared, not copied into a second allocation.",
);
assert(
  tileFactory.includes(
    "new THREE.InstancedMesh(geometry, options.material.material, 0)",
  ) &&
    worldGrassSystem.includes(
      "new THREE.InstancedMesh(geometry, material, 0)",
    ),
  "Prefilled instanced meshes must not allocate and initialize a throwaway matrix buffer.",
);
assert(
  tileFactory.includes("beginBuild(") &&
    tileFactory.includes("advanceBuild(") &&
    tileField.includes("buildDeadline") &&
    terrainHeightLattice.includes("advanceBuild(deadline") &&
    tileFactory.includes('job.stage === "lattice"'),
  "Dense near-tile setup and placement must remain incremental and deadline-bound.",
);
assert(
  tileFactory.includes('job.stage === "radix-count"') &&
    tileFactory.includes('job.stage === "radix-scatter"') &&
    tileFactory.includes("advanceInPlaceReorder") &&
    tileFactory.includes("reorderCycleTarget") &&
    tileFactory.includes("processed % DEADLINE_CHECK_INTERVAL === 0") &&
    !tileFactory.includes("order.sort("),
  "Near-tile finalization must use deadline-sliced radix sorting and reordering without full-buffer copies.",
);
assert(
  patchGeometryFactory.includes("midSortedDithers") &&
    lodController.includes("setDrawRange(0, keptBlades * INDICES_PER_BLADE)") &&
    lodController.includes("compactMidInstances") &&
    lodController.includes("mesh.count = keepCount") &&
    lodController.includes("if (patch.distance > nearFadeStart)") &&
    lodController.includes("if (swapped)") &&
    lodController.includes("Math.min(farthestDistance, this.compactFarthest)"),
  "Mid geometry must stay descending-dither sorted, instance-culled inside the near band, and prefix-trimmed with drawRange.",
);

const bladeWidthMin = readYamlNumber(grassConfig, "bladeWidthMin");
const bladeWidthMax = readYamlNumber(grassConfig, "bladeWidthMax");
const sourceHalfWidth = (bladeWidthMin + bladeWidthMax) * 0.25;
const widenRatio = readSourceNumber(nearMaterial, "MAXIMUM_BLADE_WIDEN_RATIO");
const widenCeiling = readSourceNumber(nearMaterial, "MAXIMUM_BLADE_WIDEN_METRES");
const boundsSafetyMargin = readSourceNumber(tileFactory, "BOUNDS_SAFETY_MARGIN");
assert(
  nearMaterial.includes("uGrassMaxWidenDistance.value = Math.min(") &&
    nearMaterial.includes("resolved * MAXIMUM_BLADE_WIDEN_RATIO"),
  "The sub-pixel widen ceiling must be derived from the configured blade half-width.",
);
const resolvedWidenCeiling = Math.min(
  sourceHalfWidth * widenRatio,
  widenCeiling,
);
assert(
  resolvedWidenCeiling > sourceHalfWidth,
  `The widen ceiling ${resolvedWidenCeiling.toFixed(4)} m is at or below the source ` +
    `half-width ${sourceHalfWidth.toFixed(4)} m, which disables the sub-pixel clamp entirely.`,
);
assert(
  widenCeiling - 0 < boundsSafetyMargin,
  "The absolute widen ceiling must stay inside the near-bounds safety margin.",
);
assert(
  tileField.includes("EVICTION_HYSTERESIS_TILES = 0.75") &&
    tileFactory.includes("PLACEMENT_LRU_LIMIT = 12") &&
    tileFactory.includes("placementLru"),
  "Near tiles must retain eviction hysteresis and the bounded placement LRU.",
);
// Coverage is remapped from the atlas alpha itself, which is already geometric
// coverage from rasterization and mip filtering. Differentiating the stochastic
// view sample would measure view noise as silhouette width, so the cutoff rides
// minification instead — assert that mechanism rather than a derivative call.
const impostorMaterialCode = stripComments(impostorMaterial);
assert(
  impostorAtlasFactory.includes("THREE.LinearMipmapLinearFilter") &&
    impostorAtlasFactory.includes("texture.generateMipmaps = true") &&
    impostorAtlasFactory.includes("grassSubpatchOffset") &&
    impostorAtlasFactory.includes("partitionBlades") &&
    impostorMaterialCode.includes("IMPOSTOR_MINIFIED_ALPHA_CUTOFF") &&
    impostorMaterialCode.includes("float cutoff = mix(") &&
    impostorMaterialCode.includes("minification") &&
    impostorMaterialCode.includes("cylindricalRight") &&
    impostorMaterialCode.includes("atlasElevation"),
  "Far atlases must use genuine subpatch cards, upright horizon billboards, and minification-aware alpha coverage.",
);
assert(
  !impostorMaterialCode.includes("fwidth(atlasColor.a)"),
  "Impostor coverage must not differentiate the stochastic view sample; that measures view noise as silhouette width.",
);

const maxBiomes = Number(
  biomeProfileSource.match(/GRASS_MAX_BIOMES = (\d+)/)?.[1],
);
assert(
  maxBiomes === 8 &&
    nearMaterial.includes("#define GRASS_MAX_BIOMES ${GRASS_MAX_BIOMES}") &&
    impostorMaterial.includes("uBiomeBase[${GRASS_MAX_BIOMES}]"),
  "The biome loader and both shaders must share the eight-row palette ceiling.",
);
const orderedBiomes = Object.values(biomeProfiles).sort(
  (left, right) => left.index - right.index,
);
assert(
  orderedBiomes.length <= maxBiomes &&
    orderedBiomes.every((profile, index) => profile.index === index),
  "Biome indices must be dense and fit the shader palette arrays.",
);
for (const profile of orderedBiomes) {
  assert(
    profile.density > 0 &&
      profile.density <= 1 &&
      profile.heightBand[0] >= 0.7 &&
      profile.heightBand[1] <= 1.14 &&
      profile.widthBand[0] >= 0.76 &&
      profile.widthBand[1] <= 1.1 &&
      profile.windDamping >= 0.7 &&
      profile.windDamping <= 1,
    `Biome ${profile.label} exceeds density or analytical bounds ceilings.`,
  );
}
assert(
  biomeField.includes("sampleGrassBiome") &&
    // Build-time callers may pass a reused sample object as a third argument,
    // so match the call rather than one exact argument list.
    tileFactory.includes("sampleGrassBiome(x, z") &&
    worldGrassSystem.includes("sampleGrassBiome(x, z") &&
    !lodController.includes("BiomeField") &&
    !lodController.includes("sampleGrassBiome") &&
    !nearMaterial.includes("sampleGrassBiome") &&
    !impostorMaterial.includes("sampleGrassBiome"),
  "Biome resolution must remain build-time-only, never on a per-frame path.",
);
const suitabilityRejection = tileFactory.indexOf(
  "if (suitability < MIN_SUITABILITY",
);
const nearBiomeSample = tileFactory.indexOf(
  "const biomeSample = sampleGrassBiome(x, z",
);
assert(
  suitabilityRejection >= 0 &&
    nearBiomeSample >= 0 &&
    suitabilityRejection < nearBiomeSample,
  "Near tiles must sample the biome only for blades that survive placement.",
);
const totalWorldShare = orderedBiomes.reduce(
  (sum, profile) => sum + profile.worldShare,
  0,
);
assert(
  orderedBiomes.every((profile) => profile.worldShare > 0) &&
    orderedBiomes[0].worldShare / totalWorldShare >= 0.4,
  "Biome 0 must hold at least 40% of the world.",
);
assert(
  biomeField.includes("RANK_TABLE") && biomeField.includes("uniformField("),
  "The biome field must be remapped to a uniform variable before slicing.",
);

const accentTileSize = readSourceNumber(
  detailFoliageField,
  "DETAIL_FOLIAGE_TILE_SIZE",
);
const accentDensity = readSourceNumber(
  detailFoliageField,
  "DETAIL_FOLIAGE_DENSITY",
);
const accentDensityCeiling = readSourceNumber(
  detailFoliageField,
  "DETAIL_FOLIAGE_DENSITY_CEILING",
);
const accentFadeDistance = readSourceNumber(
  detailFoliageField,
  "DETAIL_FOLIAGE_FADE_DISTANCE",
);
const accentFadeTransition = readSourceNumber(
  detailFoliageField,
  "DETAIL_FOLIAGE_FADE_TRANSITION",
);
const accentResidencyMargin = readSourceNumber(
  detailFoliageField,
  "DETAIL_FOLIAGE_RESIDENCY_MARGIN",
);
const accentVisibilityRadius =
  accentFadeDistance + accentFadeTransition + accentResidencyMargin;
assert(
  accentDensity <= accentDensityCeiling && accentDensityCeiling <= 20,
  `Accent density ${accentDensity}/m² exceeds the ${accentDensityCeiling}/m² ceiling.`,
);
assert(
  accentFadeDistance + accentFadeTransition <= 42,
  "Accents must be gone by 42 m; past that they are sub-pixel sprinkles the mid band already provides.",
);
const accentCardsPerTile = Math.round(accentTileSize ** 2 * accentDensity);
let accentResidentTiles = 0;
let accentDrawnTiles = 0;
for (let iz = 0; iz < 64; iz += 1) {
  for (let ix = 0; ix < 64; ix += 1) {
    const focusX = (ix * accentTileSize) / 64;
    const focusZ = (iz * accentTileSize) / 64;
    accentResidentTiles = Math.max(
      accentResidentTiles,
      countTiles(accentVisibilityRadius, accentTileSize, focusX, focusZ),
    );
    accentDrawnTiles = Math.max(
      accentDrawnTiles,
      countTiles(
        accentFadeDistance + accentFadeTransition,
        accentTileSize,
        focusX,
        focusZ,
      ),
    );
  }
}
const accentResidentCards = accentResidentTiles * accentCardsPerTile;
const accentVertices = accentResidentCards * 6;
// Card and vertex ceilings raised together with the density, because the old
// pair no longer described one budget: the card ceiling bound at 2 500 while
// the vertex ceiling it was supposed to express still allowed 16 666, so the
// layer was held to a seventh of its own stated budget by the tighter of two
// numbers that were meant to agree. They are now derived from one another.
const ACCENT_CARD_CEILING = 210_000;
assert(
  accentResidentCards <= ACCENT_CARD_CEILING,
  `Accent resident card ceiling exceeded: ${accentResidentCards}.`,
);
// Raised from 30 with the fade distance, which is what actually sets it: the
// drawn set is a disc, so the tile count grows with the square of the range.
// Seven extra draws is the honest price of the mid-ground, and the alternative
// — larger tiles — is worse, because a tile is built in a single frame slice
// and 24 m tiles at this density would be a 2 300-candidate build spike.
assert(
  accentDrawnTiles <= 40,
  `Accent draw ceiling exceeded: ${accentDrawnTiles} tiles can draw at once.`,
);
assert(
  accentVertices <= ACCENT_CARD_CEILING * 6,
  `Accent vertex ceiling exceeded: ${accentVertices}.`,
);
assert(
  detailFoliageField.includes("tile.mesh.visible = count > 0"),
  "Trimmed-to-empty accent tiles must stop submitting a draw entirely.",
);
assert(
  detailFoliageField.includes(
    "candidates.sort((left, right) => left.dither - right.dither)",
  ) &&
    detailFoliageField.includes("upperBound(") &&
    detailFoliageField.includes("DITHER_SAFETY_MARGIN"),
  "Accent tiles must stay dither-sorted so the draw can be trimmed to a prefix.",
);
const accentDiscards = detailFoliageMaterial.match(/discard;/g) ?? [];
assert(
  accentDiscards.length === 1 &&
    detailFoliageMaterial.includes("if (atlasColor.a < cutoff)") &&
    detailFoliageMaterial.includes("gl_Position = vec4(2.0, 2.0, 2.0, 1.0)"),
  "The accent material may discard only for the alpha cutout; coverage must be rejected in the vertex stage.",
);
assert(
  !nearMaterial.includes("discard;"),
  "The near/mid keep test must stay in the vertex stage even with accents shipped.",
);
assert(
  detailFoliageAtlasFactory.includes("THREE.LinearMipmapLinearFilter") &&
    detailFoliageAtlasFactory.includes("texture.generateMipmaps = true") &&
    detailFoliageMaterial.includes("smoothstep(uFadeDistance * 0.4, uFadeDistance"),
  "The accent atlas must keep mipmaps and compensate its alpha cutoff with distance.",
);
assert(
  detailFoliageField.includes("sampleGrassBiome(x, z)") &&
    !detailFoliageMaterial.includes("sampleGrassBiome") &&
    !detailFoliageMaterial.includes("sampleGrassMacro"),
  "Accent biome and macro sampling must remain in the build path.",
);
const maxAccentSpecies = Number(
  accentSpeciesSource.match(/GRASS_MAX_ACCENT_SPECIES = (\d+)/)?.[1],
);
const maxAccentTints = Number(
  accentSpeciesSource.match(/GRASS_MAX_ACCENT_TINTS = (\d+)/)?.[1],
);
const declaredSpecies = [
  ...accentSpeciesSource.matchAll(/key: "([a-z-]+)",\s+category:/g),
].map((match) => match[1]);
const declaredTints = [
  ...accentSpeciesSource.matchAll(/\{ key: "([a-z-]+)", color:/g),
].map((match) => match[1]);
assert(
  maxAccentSpecies === 10 &&
    maxAccentTints === 8 &&
    declaredSpecies.length === maxAccentSpecies &&
    declaredTints.length === maxAccentTints &&
    detailFoliageMaterial.includes(
      "uSpeciesWind[${GRASS_MAX_ACCENT_SPECIES}]",
    ) &&
    detailFoliageMaterial.includes("uAccentTint[${GRASS_MAX_ACCENT_TINTS}]"),
  "The accent catalogue and its shader uniform arrays must share one bounded size.",
);
for (const profile of orderedBiomes) {
  assert(
    profile.accentDensity === undefined ||
      (profile.accentDensity >= 0 && profile.accentDensity <= 1),
    `Biome ${profile.label} accentDensity must stay within [0, 1].`,
  );
  for (const entry of profile.accentSpecies ?? []) {
    assert(
      declaredSpecies.includes(entry.species) &&
        (entry.tint === "none" || declaredTints.includes(entry.tint)),
      `Biome ${profile.label} names an unknown accent species or tint.`,
    );
  }
}
assert(
  (detailFoliageField.match(/new THREE\.InstancedMesh\(/g) ?? []).length === 1 &&
    detailFoliageField.includes("this.material.material") &&
    (detailFoliageMaterial.match(/new THREE\.ShaderMaterial\(/g) ?? [])
      .length === 1,
  "Every accent tile must share the one accent material.",
);
const accentTierScales = [
  ...qualityGovernor.matchAll(/accentDensityScale:\s*([0-9.]+)/g),
].map((match) => Number(match[1]));
assert(
  accentTierScales.length === 4 &&
    accentTierScales.every(
      (scale, index) =>
        scale <= 1 && (index === 0 || scale <= accentTierScales[index - 1]),
    ) &&
    accentTierScales[accentTierScales.length - 1] === 0 &&
    qualityGovernor.includes("this.accentDensityScale,"),
  "Accent tiers must only lower coverage, end at zero, and ramp like every other tier scalar.",
);

const yamlAccentDensity = Number(
  worldConfig.match(/^detailFoliageDensity:\s*([0-9.]+)$/m)?.[1],
);
// The candidate cap now follows the density ceiling instead of restating the
// old 90. It is still a cap and still worth having: a tile is built in one
// frame slice, so candidates per tile is a frame-time number, not a memory one.
const ACCENT_CANDIDATES_PER_TILE_CEILING = Math.round(
  16 * 16 * accentDensityCeiling,
);
assert(
  yamlAccentDensity <= accentDensityCeiling &&
    Math.round(16 * 16 * yamlAccentDensity) <=
      ACCENT_CANDIDATES_PER_TILE_CEILING &&
    accentTileSize === 16 &&
    maxAccentSpecies === 10 &&
    nearField.includes("DETAIL_FOLIAGE_TILES_PER_FRAME = 1"),
  `Detail foliage must keep 16 m tiles, 10 species, one tile/frame, and ≤ ${ACCENT_CANDIDATES_PER_TILE_CEILING} candidates.`,
);
// The phenotype row count is not a runtime cost -- it changes neither
// candidates, tiles, draws nor vertices -- so it is bounded by the memory it
// actually spends rather than pinned to a number. Four rows exist because two
// silhouettes per species left a stand of broadleaf or shrub reading as one
// undifferentiated mass; pinning the count here would have made fixing that a
// performance failure.
{
  const variantRows = Number(
    detailFoliageAtlasFactory.match(/DETAIL_FOLIAGE_VARIANT_ROWS = (\d+)/)?.[1],
  );
  const cellResolution = Number(
    detailFoliageAtlasFactory.match(
      /DETAIL_FOLIAGE_CELL_RESOLUTION = (\d+)/,
    )?.[1],
  );
  const cellPadding = Number(
    detailFoliageAtlasFactory.match(/DETAIL_FOLIAGE_CELL_PADDING = (\d+)/)?.[1],
  );
  const cellSize = cellResolution + cellPadding * 2;
  const atlasBytes = variantRows * maxAccentSpecies * cellSize * cellSize * 4;
  const ATLAS_BYTE_CEILING = 8 * 1024 * 1024;
  assert(
    Number.isFinite(variantRows) && variantRows >= 2,
    "The detail-foliage atlas must carry at least two phenotype rows per species.",
  );
  assert(
    atlasBytes <= ATLAS_BYTE_CEILING,
    `Detail foliage atlas is ${(atlasBytes / 1024 / 1024).toFixed(2)} MB, above the ${ATLAS_BYTE_CEILING / 1024 / 1024} MB ceiling.`,
  );
}
assert(
  detailFoliageField.includes("castShadow = false") &&
    detailFoliageField.includes("receiveShadow = false") &&
    detailFoliageField.includes("setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4])") &&
    detailFoliageField.includes('setAttribute(\n      "instanceVariation"') &&
    detailFoliageField.includes('setAttribute(\n      "instanceCoverage"') &&
    detailFoliageField.includes('setAttribute(\n      "instanceBiome"') &&
    detailFoliageField.includes('setAttribute(\n      "instanceAccent"') &&
    !detailFoliageField.includes("instanceColony") &&
    !detailFoliageField.includes("instanceClump") &&
    !detailFoliageField.includes("instanceAge") &&
    !detailFoliageField.includes("instanceFamily"),
  "Detail foliage must keep the current card, shadows-off, and four instance attributes.",
);
assert(
  detailFoliageField.includes("this.distribution.sample(") &&
    !worldGrassSystem.includes("distribution.sample") &&
    !detailFoliageMaterial.includes("distribution.sample") &&
    !worldApp.includes("distribution.sample"),
  "Colony distribution must run only during detail-tile construction.",
);
const factorySource = detailFoliageField.slice(
  detailFoliageField.indexOf("export class WorldDetailFoliageFactory"),
  detailFoliageField.indexOf("export interface WorldDetailFoliageFieldOptions"),
);
const positionDraws = factorySource.match(/positionRandom\.next\(\)/g) ?? [];
assert(
  positionDraws.length === 2 &&
    !factorySource.includes("positionRandom.range") &&
    factorySource.includes("detailFoliageChannel01(candidateHash, DETAIL_FOLIAGE_YAW_SALT)") &&
    factorySource.includes("detailFoliageChannel01(candidateHash, DETAIL_FOLIAGE_DITHER_SALT)") &&
    !factorySource.includes("GRASS_ACCENT_SPECIES.find") &&
    !factorySource.includes("resolveGrassAccentTintRow") &&
    biomeProfileSource.includes("speciesIndex:") &&
    biomeProfileSource.includes("tintRow:"),
  "Candidate positions must consume exactly two positionRandom draws; appearance and species come from candidate channels and pre-resolved profile rows.",
);
assert(
  nearField.includes("detailFoliageTuningEquals(this.detailFoliageTuning, normalized)") &&
    nearField.includes("this.detailFoliageField?.invalidate()") &&
    detailFoliageField.includes("invalidate(): void"),
  "Equal normalized tuning must not rebuild; changed tuning invalidates detail tiles only.",
);

assert(
  compactUltraMultiplier <= ultraMultiplier &&
    nearField.includes("grassUltraNearDensityMultiplierCompact"),
  "Compact must carry its own ultra-near multiplier, never above the desktop one.",
);
assert(
  compactDensity <= 48 && patchCompactDensity <= 48,
  `Compact density may only be lowered from the reviewed 48 blades/m²: ${compactDensity}.`,
);
assert(
  worldGrassSystem.indexOf("this.processBuildQueue(streamBuildDeadline)") <
    worldGrassSystem.indexOf("this.nearField.update(") &&
    worldGrassSystem.includes("DESKTOP_STREAM_BUILD_RESERVE_MS") &&
    worldApp.includes("this.streamingBuildDeadline") &&
    !worldApp.includes("performance.now() + grassBuildReserveMs"),
  "Mid/far grass streaming must receive bounded progress before near-field detail work without extending the shared frame deadline.",
);
assert(
  nearField.includes("this.baseField?.update(focus, baseDeadline)") &&
    nearField.includes("this.buildCursor + offset") &&
    nearField.includes("remainingMs / remainingBuilders") &&
    nearField.includes("this.buildCursor = (this.buildCursor + 1)"),
  "Near grass builders must rotate and share their deadline instead of starving later layers.",
);
const configLoader = read("src/world/WorldConfigLoader.ts");
const configSchema = read("src/world/WorldConfigSchema.ts");
const configValidator = read("src/world/WorldConfigValidator.ts");
assert(
  configLoader.includes("WORLD_CONFIG_SCHEMA") &&
    configLoader.includes("validateWorldConfig(config)") &&
    configSchema.includes("grassClumpRadiusScaleMin") &&
    configSchema.includes("grassClumpAspectMin") &&
    configSchema.includes("grassClumpRadialExponent") &&
    configValidator.includes("grassClumpRadiusScale range is reversed") &&
    configValidator.includes("of a blade's heading to independent randomness"),
  "Clump tuning must be schema-checked and cross-validated by the config loader.",
);
assert(
  tileFactory.includes("const GRASS_PLACEMENT_VERSION") &&
    tileFactory.includes("placement-${GRASS_PLACEMENT_VERSION}"),
  "The near placement cache key must carry the placement version.",
);
assert(
  nearMaterial.includes(
    "float grassMotionPhase = fract(grassPhase + instanceVariation.x);",
  ) &&
    nearMaterial.includes("grassMotionPhase * 6.28318530718") &&
    nearMaterial.includes("grassTuftPhase") &&
    nearMaterial.includes("grassWeather") &&
    nearMaterial.includes("grassPhase * 0.569840296") &&
    nearMaterial.includes("grassPhase * 0.819173") &&
    !nearMaterial.includes("grassMotionPhase * 0.569840296") &&
    !nearMaterial.includes("grassMotionPhase * 0.819173"),
  "Motion phase must drive flutter only; tuft phase and weather must drive coherent gusts; both dithers must keep the source phase.",
);
assert(
  !tileFactory.includes("const centerZ = lean * curve") &&
    tileFactory.includes("resolveGrassBladeArcPoint(height, curve, 1)") &&
    tileFactory.includes("bladeCurveReach: calculateGrassBladeCurveReach(") &&
    tileFactory.includes(
      "this.leanAxis.set(Math.cos(leanAngle), 0, -Math.sin(leanAngle))",
    ) &&
    tileFactory.includes("this.align.multiply(this.lean).multiply(this.yaw)") &&
    tileFactory.includes("INSTANCE_HORIZONTAL_SCALE_MAX) /"),
  "Near blades must lean by transform, scaled to the horizontal displacement the bounds charge.",
);
const samplingLoop = tileFactory.slice(
  tileFactory.indexOf("private advanceSampling("),
  tileFactory.indexOf("private advanceFinalize("),
);
assert(
  !/new THREE\.(Vector2|Vector3|Quaternion|Matrix4)\(/.test(samplingLoop) &&
    !/\bnew Array\(/.test(samplingLoop),
  "The near placement loop must not allocate per blade.",
);
const windNoise = read("src/grass/wind/WindNoiseTexture.ts");
assert(
  windNoise.includes("export function grassCompactGustGlsl") &&
    windNoise.includes("GRASS_GUST_CROSS_SCALE") &&
    nearMaterial.includes("grassCompactGustGlsl({") &&
    impostorMaterial.includes("grassCompactGustGlsl({") &&
    detailFoliageMaterial.includes("grassCompactGustGlsl({"),
  "Every layer's compact gust must come from the one shared expression.",
);
const primaryWeight = readSourceNumber(windNoise, "GRASS_GUST_PRIMARY_WEIGHT");
const crossWeight = readSourceNumber(windNoise, "GRASS_GUST_CROSS_WEIGHT");
assert(
  Math.abs(primaryWeight + crossWeight - 1) < 1e-9,
  `Compact gust weights must sum to one: ${primaryWeight} + ${crossWeight}.`,
);
const diagnosticsHud = read("src/runtime/WorldDiagnosticsHud.ts");
const workloadProbe = read("src/runtime/GrassWorkloadProbe.ts");
assert(
  diagnosticsHud.includes("Grass logical") &&
    diagnosticsHud.includes("Near resident") &&
    diagnosticsHud.includes("Mid submit") &&
    workloadProbe.includes("logicalBladeEquivalents") &&
    workloadProbe.includes("nearSubmittedTriangles") &&
    workloadProbe.includes("midSubmittedBlades"),
  "The workload HUD must report resident and submitted work as separate, named counters.",
);

const tierScales = [
  ...qualityGovernor.matchAll(/densityScale:\s*([0-9.]+)/g),
].map((match) => Number(match[1]));
assert(
  tierScales.length === 4 &&
    tierScales.every((scale, index) =>
      scale <= 1 && (index === 0 || scale <= tierScales[index - 1])
    ),
  "Quality tiers must only lower density from the preset budget.",
);
assert(
  tileFactory.includes("emptyPlacementCache") &&
    tileFactory.includes("empty: true") &&
    tileField.includes("emptyTiles") &&
    tileField.includes("result.empty"),
  "Completed-empty near tiles must be remembered instead of rebuilt while moving.",
);
assert(
  nearField.includes("cachedPlacementOnly: true") &&
    tileFactory.includes("placementCache") &&
    tileFactory.includes("variation: placement.variationAttribute") &&
    tileFactory.includes("mesh.instanceMatrix = placement.instanceMatrix") &&
    geometryFactory.includes("preserveSharedInstanceData"),
  "Complementary base/detail layers must reuse identical placement buffers.",
);
assert(
  tileField.includes("DISABLED_TILE_EVICTION_MS") &&
    tileField.includes("this.evictTiles()"),
  "Suspended near fields must eventually release their resident tile resources.",
);
assert(
  nearField.includes("focusGroundHeight") &&
    nearField.includes("setEnabled(nearFieldsEnabled)"),
  "Dense near grass must suspend when a fly camera is above its 3D LOD range.",
);
assert(
  worldGrassSystem.includes("sheen: false") &&
    nearMaterial.includes("if (vGrassSheen.x > 0.001)") &&
    nearMaterial.includes('sheen ? FRAGMENT_SHEEN_OUTPUT : ""'),
  "Mid grass must compile sheen out and near grass must skip its lobe after fade-out.",
);
assert(
  nearMaterial.includes("vNormal = normalize(grassRotateAroundAxis(") &&
    nearMaterial.includes("grassWindAxisView") &&
    nearMaterial.includes("grassTrailAxisView"),
  "Wind and trail deformation must rotate the lighting normal with the blade.",
);
// The attribute carries four channels now: the two signed path distances, the
// altitude visibility, and landform convexity. The fourth was added because the
// fragment stage has slope from its own derivatives but no curvature, and slope
// cannot tell a hollow from a bank.
assert(
  terrainField.includes("samplePathVisibility(height") &&
    terrainChunk.includes("new THREE.BufferAttribute(this.paths, 4)") &&
    terrainMaterialShader.includes("terrainPathVisibility") &&
    terrainMaterialShader.includes("abs(vTerrainPath.xy)") &&
    terrainMaterialShader.includes("vTerrainPath.w"),
  "Terrain path altitude visibility and landform convexity must be interpolated separately from the signed distances.",
);
assert(
  terrainStreamer.includes("buildDeadline - performance.now()") &&
    worldGrassSystem.includes("buildDeadline - performance.now()"),
  "Terrain and grass streaming must share the frame build deadline.",
);
assert(
  worldApp.includes("profile.shadows && !useFlyControls") &&
    worldApp.includes("if (!useFlyControls)"),
  "Fly mode must not allocate character-only trail targets or render an empty shadow map.",
);
assert(
  denseSpawnLocator.includes("COARSE_STEP_MULTIPLIER") &&
    denseSpawnLocator.includes("REFINE_CANDIDATE_COUNT") &&
    denseSpawnLocator.includes("sampledSuitability"),
  "Spawn selection must retain cached coarse-to-fine sampling instead of repeating overlapping evaluations.",
);
assert(
  worldGrassSystem.includes("mesh.position.copy(origin)") &&
    tileFactory.includes("mesh.position.copy(placement.origin)"),
  "Grass meshes must carry a real world position so opaque depth sorting works.",
);
assert(worldGrassSystem.includes("mesh.receiveShadow = false"), "Mid/far grass must not perform per-blade shadow reads.");
assert(
  !nearField.includes("receiveShadows: true"),
  "Near grass must not perform per-blade shadow reads.",
);
const underfill = Number(lodTuning.match(/GRASS_MID_IMPOSTOR_UNDERFILL\s*=\s*([0-9.]+)/)?.[1]);
assert(underfill === 0, "Far-card underfill must remain disabled in the full mid band.");
// The fetch may carry explicit gradients; what matters is that there is one of
// it and no four-tap blend behind it.
assert(
  !impostorMaterialCode.includes("vec4 color00 = sampleFrame") &&
    impostorMaterialCode.includes("atlasColor = sampleFrame(selectedFrame, vUv"),
  "Far views must reconstruct the blend stochastically with one atlas fetch, at every distance.",
);
assert(
  !/\.onBeforeRender\s*=/.test(nearMaterial) &&
    !/\.onBeforeRender\s*=/.test(impostorMaterial),
  "Grass materials must not write per-mesh uniforms from onBeforeRender: three never uploads them.",
);
assert(
  nearField.includes("baseDetailMaterial") &&
    /detailMode:\s*1/.test(nearField) &&
    /detailMode:\s*2/.test(nearField),
  "The base and detail near layers must own separate materials so their detail modes both take effect.",
);
assert(
  worldGrassSystem.includes("applyStreamCoverage") &&
    !worldGrassSystem.includes("userData.grassStreamCoverage"),
  "Streaming fade-in must ride on the per-instance coverage attribute.",
);
assert(
  trailField.includes("const UPDATE_INTERVAL_SECONDS = 1 / 30") &&
    trailField.includes("accumulatedDeltaSeconds"),
  "The trail feedback pass must remain capped at 30 Hz with accumulated decay time.",
);
assert(
  trailField.indexOf("float distanceSquared = dot(offset, offset)") <
    trailField.indexOf("float distanceToContact = sqrt(distanceSquared)"),
  "Trail contacts must reject out-of-radius texels before square-root and falloff work.",
);
assert(
  trailField.includes("private readonly contacts = new Float32Array") &&
    !interactionField.includes("submitContact({"),
  "Frame-loop trail contacts must use fixed storage instead of transient objects.",
);
assert(
  nearMaterial.includes("vertexPalette") &&
    nearMaterial.includes("varying vec3 vGrassColor"),
  "Single-triangle grass layers must resolve the palette per vertex.",
);
assert(
  terrainChunk.includes("renderOrder = TERRAIN_RENDER_ORDER") &&
    /TERRAIN_RENDER_ORDER = ([1-9])/.test(terrainChunk),
  "Terrain must draw after grass so covered terrain fragments are depth-rejected.",
);

assert(
  tileFactory.includes('job.stage === "radix-count"') &&
    tileFactory.includes("SINGLE_BLADE_DITHER_BIAS = 0.662358981"),
  "Single-blade tiles must sort their instances by the shader's dither key.",
);
const ditherMargin = Number(
  tileField.match(/DITHER_SAFETY_MARGIN = 1 \/ (\d+)/)?.[1],
);
assert(
  Number.isFinite(ditherMargin) && 1 / ditherMargin >= 1e-4,
  "The dither truncation margin must stay above float32 rounding error.",
);
verifyDitherTruncationIsLossless(1 / ditherMargin);

function verifyDitherTruncationIsLossless(margin) {
  const bias = 0.662358981;
  const seed = 0x6a09e667 / 4294967296;
  const bladeCount = 4608;
  const near = nearDistance;
  const transition = transitionDistance;

  const dithers = new Float32Array(bladeCount);
  let state = 123456789;
  for (let index = 0; index < bladeCount; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = bias + state / 4294967296 + seed;
    dithers[index] = value - Math.floor(value);
  }
  dithers.sort();

  const fadeStart = near - transition;
  const fadeEnd = near + transition;
  for (let step = 0; step <= 400; step += 1) {
    const nearest = (step / 400) * (fadeEnd + 4);
    const farthest = Math.hypot(nearest + tileSize * Math.SQRT2, 24);
    const cutCoverage = coverageAt(nearest, fadeStart, fadeEnd) + margin;
    const count =
      nearest <= fadeStart
        ? bladeCount
        : nearest >= fadeEnd
          ? upperBoundIndex(dithers, cutCoverage)
          : upperBoundIndex(dithers, cutCoverage);
    for (let index = 0; index < bladeCount; index += 1) {
      const shaderCoverage = coverageAt(nearest, fadeStart, fadeEnd);
      const kept = dithers[index] <= shaderCoverage;
      assert(
        !kept || index < count,
        `Dither truncation dropped a kept blade at ${nearest.toFixed(2)} m (index ${index} of ${count}).`,
      );
    }
    void farthest;
  }
}

function coverageAt(distance, edge0, edge1) {
  const t = Math.min(1, Math.max(0, (distance - edge0) / (edge1 - edge0)));
  return 1 - t * t * (3 - 2 * t);
}

function upperBoundIndex(values, value) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

console.log(
  `[grass-performance] Tile-enumerated near triangles avg/max: ` +
    `desktop ${Math.round(desktopNear.average).toLocaleString("en-US")}/${desktopNear.maximum.toLocaleString("en-US")}, ` +
    `compact ${Math.round(compactNear.average).toLocaleString("en-US")}/${compactNear.maximum.toLocaleString("en-US")}; ` +
    `near geometry ${(maximumNearBaselineRatio * 100).toFixed(1)}% of the fully segmented baseline; ` +
    `analytical mid/far submission envelope ${(Math.min(...submissionRatios) * 100).toFixed(1)}–${(Math.max(...submissionRatios) * 100).toFixed(1)}% of the prior baseline; ` +
    `accents ≤ ${accentResidentCards.toLocaleString("en-US")} cards / ` +
    `${accentDrawnTiles} draws / ${accentVertices.toLocaleString("en-US")} vertices, gone by ` +
    `${accentFadeDistance + accentFadeTransition} m; ` +
    "every blade and four baked subpatch cards retained in one far instance; " +
    "far views remain one-fetch with derivative-aware alpha coverage. " +
    "Near counts are the pre-truncation ceiling: tiles are sorted by dither and " +
    "the draw is cut to the surviving prefix at runtime.",
);
