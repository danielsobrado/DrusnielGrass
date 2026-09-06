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

function fail(message) {
  throw new Error(`[grass-cluster-profile] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readYamlNumber(source, key) {
  const value = Number(
    source.match(new RegExp(`^${key}:\\s*([0-9.-]+)$`, "m"))?.[1],
  );
  if (!Number.isFinite(value)) {
    fail(`Unable to read ${key}.`);
  }
  return value;
}

function readSourceNumber(source, key) {
  const value = Number(
    source.match(
      new RegExp(`(?:export\\s+)?const ${key}\\s*=\\s*([0-9.]+)`),
    )?.[1],
  );
  if (!Number.isFinite(value)) {
    fail(`Unable to read source constant ${key}.`);
  }
  return value;
}

const worldSource = read("public/config/world.yaml");
const grassSource = read("public/config/grass.yaml");
const profileSource = read("src/world/grass/GrassClusterProfile.ts");
const habitatSource = read("src/world/grass/GrassHabitatField.ts");
const tuningSource = read("src/world/grass/GrassClusterProfileTuning.ts");
const nearFactorySource = read("src/world/grass/WorldSingleBladeTileFactory.ts");
const patchFactorySource = read("src/world/grass/WorldGrassPatchGeometryFactory.ts");

const config = {
  underlayerShare: readYamlNumber(worldSource, "grassUnderlayerFraction"),
  accentShare: readYamlNumber(worldSource, "grassAccentBladeShare"),
  understoryHeight: readYamlNumber(worldSource, "grassUnderstoryHeightScale"),
  mainHeight: readYamlNumber(worldSource, "grassMainHeightScale"),
  accentHeight: readYamlNumber(worldSource, "grassAccentHeightScale"),
  planeCoherence: readYamlNumber(worldSource, "grassClumpPlaneCoherence"),
  edgeCoverage: readYamlNumber(worldSource, "grassClumpEdgeCoverage"),
  heightJitter: readYamlNumber(worldSource, "grassBladeHeightJitter"),
  sparseDensityRetentionThreshold: readYamlNumber(
    worldSource,
    "grassSparseDensityRetentionThreshold",
  ),
  bladeLeanMin: readYamlNumber(grassSource, "bladeLeanMin"),
  bladeLeanMax: readYamlNumber(grassSource, "bladeLeanMax"),
};

assert(
  config.underlayerShare + config.accentShare <= 0.78,
  "Configured tier shares must leave at least 22% for the main canopy.",
);
assert(
  config.understoryHeight < config.mainHeight &&
    config.mainHeight < config.accentHeight,
  "Configured tier heights must increase from understory to main to accent.",
);
assert(
  config.planeCoherence > 0 && config.planeCoherence <= 0.5,
  "Clump plane coherence must be present but restrained.",
);
assert(
  config.edgeCoverage >= 0.4 && config.edgeCoverage < 1,
  "Clump edges must stay populated while remaining visibly frayed.",
);
assert(
  config.heightJitter > 0 && config.heightJitter <= 0.1,
  "Blade height jitter must remain subordinate to clump and tier height.",
);
assert(
  config.sparseDensityRetentionThreshold > 0 &&
    config.sparseDensityRetentionThreshold < 1 &&
    habitatSource.includes("densityRetention") &&
    habitatSource.includes("config.grassSparseDensityRetentionThreshold") &&
    !/habitat\.density\s*\+\s*identityBias\s*<\s*0\.55/.test(habitatSource),
  "Sparse-open classification must compare biome-relative density retention against world configuration.",
);

for (const token of [
  "GRASS_CLUSTER_DENSE_NORMAL",
  "GRASS_CLUSTER_SPARSE_OPEN",
  "GRASS_CLUSTER_TALL_WET",
  "GRASS_CLUSTER_SHORT_DRY",
  "GRASS_CLUSTER_FLATTENED",
  "GRASS_CLUSTER_ACCENT",
  "resolveGrassClusterCoverage",
  "mixGrassAngle",
  "leanTowardMax",
  'import * as Tuning from "./GrassClusterProfileTuning"',
]) {
  assert(profileSource.includes(token), `GrassClusterProfile must retain ${token}.`);
}

const shapedLeanPattern =
  /const shapedLean = THREE\.MathUtils\.lerp\(\s*sharedLean,\s*leanMax,\s*this\.clusterProfile\.leanTowardMax,\s*\);/;
const leanDistancePattern =
  /const leanDistance = THREE\.MathUtils\.clamp\(\s*shapedLean \*\s*this\.clusterProfile\.leanScale \*/;
assert(
  nearFactorySource.includes("resolveGrassClusterProfile(") &&
    nearFactorySource.includes("resolveGrassClusterCoverage(") &&
    nearFactorySource.includes("mixGrassAngle(") &&
    shapedLeanPattern.test(nearFactorySource) &&
    leanDistancePattern.test(nearFactorySource) &&
    nearFactorySource.includes("CLUMP_PLANE_SALT") &&
    nearFactorySource.includes("GRASS_PLACEMENT_VERSION = 16") &&
    nearFactorySource.includes("STONE_FRINGE_UNDERSTORY_SHARE") &&
    nearFactorySource.includes("isUnderstoryBlade ? UNDERSTORY_WIDTH_SCALE : 1"),
  "Near grass must consume the shared clump profile, including absolute flattened-rest lean, and version its placement cache.",
);

assert(
  readSourceNumber(patchFactorySource, "UNDERLAYER_WIDTH_SCALE") > 1 &&
    readSourceNumber(nearFactorySource, "UNDERSTORY_WIDTH_SCALE") > 1,
  "Understory blades must carry more width than the readable main tier at near and middle LODs.",
);
assert(
  readSourceNumber(tuningSource, "HABITAT_UNDERSTORY_BLEND") <= 0.35,
  "Habitat variation must not erase the authored healthy-meadow carpet share.",
);

for (const key of [
  "grassUnderlayerFraction",
  "grassAccentBladeShare",
  "grassUnderstoryHeightScale",
  "grassMainHeightScale",
  "grassAccentHeightScale",
  "grassBladeHeightJitter",
]) {
  assert(
    patchFactorySource.includes(key),
    `Mid/far blade source must consume ${key}.`,
  );
}

const dense = {
  height: 1,
  coverage: 1,
  drynessScale: 1,
  drynessOffset: 0,
  leanScale: 1,
  leanTowardMax: 0,
};
const sparse = {
  height: dense.height * readSourceNumber(tuningSource, "SPARSE_HEIGHT_SCALE"),
  coverage: readSourceNumber(tuningSource, "SPARSE_COVERAGE_SCALE"),
  drynessScale: 1,
  drynessOffset: readSourceNumber(tuningSource, "SPARSE_DRYNESS_OFFSET"),
  leanScale: readSourceNumber(tuningSource, "SPARSE_LEAN_SCALE"),
  leanTowardMax: 0,
};
const tallWet = {
  height: dense.height * readSourceNumber(tuningSource, "WET_HEIGHT_SCALE"),
  coverage: 1,
  drynessScale: readSourceNumber(tuningSource, "WET_DRYNESS_SCALE"),
  drynessOffset: 0,
  leanScale: readSourceNumber(tuningSource, "WET_LEAN_SCALE"),
  leanTowardMax: 0,
};
const shortDry = {
  height: dense.height * readSourceNumber(tuningSource, "DRY_HEIGHT_SCALE"),
  coverage: readSourceNumber(tuningSource, "DRY_COVERAGE_SCALE"),
  drynessScale: readSourceNumber(tuningSource, "DRY_DRYNESS_SCALE"),
  drynessOffset: readSourceNumber(tuningSource, "DRY_DRYNESS_OFFSET"),
  leanScale: readSourceNumber(tuningSource, "DRY_LEAN_SCALE"),
  leanTowardMax: 0,
};
const flattened = {
  height:
    dense.height * readSourceNumber(tuningSource, "FLATTENED_HEIGHT_SCALE"),
  coverage: readSourceNumber(tuningSource, "FLATTENED_COVERAGE_SCALE"),
  drynessScale: 1,
  drynessOffset: readSourceNumber(
    tuningSource,
    "FLATTENED_DRYNESS_OFFSET",
  ),
  leanScale: readSourceNumber(tuningSource, "FLATTENED_LEAN_SCALE"),
  leanTowardMax: readSourceNumber(
    tuningSource,
    "FLATTENED_LEAN_TOWARD_MAX",
  ),
};

assert(tallWet.height > dense.height, "Tall-wet clumps must be taller than normal.");
assert(shortDry.height < dense.height, "Short-dry clumps must be shorter than normal.");
assert(sparse.coverage < dense.coverage, "Sparse clumps must carry less body coverage.");
assert(
  flattened.leanScale >= 1 &&
    flattened.leanTowardMax > 0 &&
    flattened.leanTowardMax <= 1,
  "Flattened clumps must bias stable rest lean toward the configured maximum.",
);
const flattenedMinimumRestLean =
  (config.bladeLeanMin +
    (config.bladeLeanMax - config.bladeLeanMin) * flattened.leanTowardMax) *
  flattened.leanScale;
const minimumStrongFlattenedLean =
  config.bladeLeanMin +
  (config.bladeLeanMax - config.bladeLeanMin) * 0.5;
assert(
  flattenedMinimumRestLean >= minimumStrongFlattenedLean,
  `Flattened minimum rest lean ${flattenedMinimumRestLean.toFixed(3)} is too weak; expected at least ${minimumStrongFlattenedLean.toFixed(3)}.`,
);
assert(
  tallWet.drynessScale < shortDry.drynessScale &&
    shortDry.drynessOffset > tallWet.drynessOffset,
  "Wet and dry archetypes must separate in dryness as well as height.",
);
assert(
  flattened.coverage < dense.coverage && flattened.height < dense.height,
  "Flattened clumps must keep a low, opened rest silhouette.",
);

console.log(
  "[grass-cluster-profile] Config-backed tiering, clump morphology, absolute flattened-rest lean, plane coherence, frayed coverage, LOD source parity, and archetype relationships verified.",
);
