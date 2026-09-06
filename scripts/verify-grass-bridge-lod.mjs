import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
// Reviewed after the 84 blades/m² canopy-closure pass. Compact keeps its
// independent mobile budget below.
const MAX_DESKTOP_BRIDGE_EXTRA_TRIANGLES = 215_000;
const MAX_COMPACT_BRIDGE_EXTRA_TRIANGLES = 100_000;
const MAX_DESKTOP_TOTAL_NEAR_TRIANGLES = 1_400_000;
const MAX_COMPACT_TOTAL_NEAR_TRIANGLES = 600_000;
const PHASE_SAMPLES = 64;

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[grass-bridge-lod] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readYamlNumber(source, key) {
  const value = Number(
    source.match(new RegExp(`^${key}:\\s*([0-9.]+)$`, "m"))?.[1],
  );
  if (!Number.isFinite(value)) {
    fail(`Unable to read ${key}.`);
  }
  return value;
}

function readSourceNumber(source, key) {
  const value = Number(
    source.match(new RegExp(`const ${key}\\s*=\\s*([0-9.]+)`))?.[1],
  );
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

function requestedBladesPerTile(tileSize, density, multiplier = 1) {
  return Math.max(1, Math.round(tileSize ** 2 * density * multiplier));
}

function sampleMaximum(radiusEvaluator, tileSize) {
  let maximum = 0;
  for (let z = 0; z < PHASE_SAMPLES; z += 1) {
    for (let x = 0; x < PHASE_SAMPLES; x += 1) {
      maximum = Math.max(
        maximum,
        radiusEvaluator(
          (x * tileSize) / PHASE_SAMPLES,
          (z * tileSize) / PHASE_SAMPLES,
        ),
      );
    }
  }
  return maximum;
}

function maximumResidentTiles(radius, tileSize) {
  return sampleMaximum(
    (focusX, focusZ) => countTiles(radius, tileSize, focusX, focusZ),
    tileSize,
  );
}

function maximumTotalNearTriangles({
  density,
  ultraMultiplier,
  tileSize,
  bladeSegments,
  baseRadius,
  detailRadius,
  ultraRadius,
  bridgeRadius,
}) {
  const baseBlades = requestedBladesPerTile(tileSize, density);
  const ultraBlades = requestedBladesPerTile(
    tileSize,
    density,
    ultraMultiplier - 1,
  );
  const segmentedTriangles = bladeSegments * 2;
  return sampleMaximum((focusX, focusZ) => {
    const baseTriangles =
      countTiles(baseRadius, tileSize, focusX, focusZ) * baseBlades;
    const detailTriangles =
      countTiles(detailRadius, tileSize, focusX, focusZ) *
      baseBlades *
      segmentedTriangles;
    const ultraTriangles =
      countTiles(ultraRadius, tileSize, focusX, focusZ) *
      ultraBlades *
      segmentedTriangles;
    const bridgeExtraTriangles =
      countTiles(bridgeRadius, tileSize, focusX, focusZ) * baseBlades;
    return (
      baseTriangles +
      detailTriangles +
      ultraTriangles +
      bridgeExtraTriangles
    );
  }, tileSize);
}

const worldConfig = read("public/config/world.yaml");
const grassConfig = read("public/config/grass.yaml");
const presets = JSON.parse(read("src/grass/GrassArtPresets.json"));
const nearField = read("src/world/grass/WorldNearGrassField.ts");
const tileField = read("src/world/grass/WorldSingleBladeTileField.ts");
const qualityGovernor = read("src/runtime/GrassQualityGovernor.ts");

const bridgeDistance = readYamlNumber(worldConfig, "grassNearBridgeDistance");
const bridgeTransition = readYamlNumber(
  worldConfig,
  "grassNearBridgeTransitionDistance",
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
const nearDistance = readYamlNumber(worldConfig, "grassNearDistance");
const nearTransition = readYamlNumber(worldConfig, "grassTransitionDistance");
const tileSize = readYamlNumber(worldConfig, "grassNearTileSize");
const desktopDensity = readYamlNumber(
  worldConfig,
  "grassNearBladesPerSquareMeterDesktop",
);
const compactDensity = readYamlNumber(
  worldConfig,
  "grassNearBladesPerSquareMeterCompact",
);
const bladeSegments = readYamlNumber(grassConfig, "bladeSegments");
const boundsMargin = readSourceNumber(nearField, "SINGLE_BLADE_BOUNDS_MARGIN");

const bridgeFadeStart = bridgeDistance - bridgeTransition;
const bridgeFadeEnd = bridgeDistance + bridgeTransition;
const ultraFadeEnd = ultraDistance + ultraTransition;
const configuredNearFadeStart = nearDistance - nearTransition;

assert(
  bridgeFadeStart >= ultraFadeEnd,
  "Bridge entry must begin after ultra-near detail has finished.",
);
assert(
  bridgeFadeEnd <= configuredNearFadeStart,
  "Bridge entry must finish before the configured near-to-mid fade starts.",
);

const bridgeResidencyRadius = bridgeFadeEnd + boundsMargin;
const maximumBridgeTiles = maximumResidentTiles(
  bridgeResidencyRadius,
  tileSize,
);
for (const [profile, density, ceiling] of [
  ["desktop", desktopDensity, MAX_DESKTOP_BRIDGE_EXTRA_TRIANGLES],
  ["compact", compactDensity, MAX_COMPACT_BRIDGE_EXTRA_TRIANGLES],
]) {
  const bladesPerTile = requestedBladesPerTile(tileSize, density);
  const conservativeExtraTriangles = maximumBridgeTiles * bladesPerTile;
  assert(
    conservativeExtraTriangles <= ceiling,
    `${profile} bridge shell adds ${conservativeExtraTriangles} conservative ` +
      `near triangles, above the ${ceiling} ceiling.`,
  );
}

const maximumPresetNearFade = Math.max(
  ...Object.values(presets).map(
    (direction) => direction.nearDistance + direction.transitionDistance,
  ),
);
const totalNearParameters = {
  tileSize,
  bladeSegments,
  baseRadius: maximumPresetNearFade + boundsMargin,
  detailRadius: ultraFadeEnd + boundsMargin,
  ultraRadius: ultraFadeEnd,
  bridgeRadius: bridgeResidencyRadius,
};
for (const [profile, density, profileUltraMultiplier, ceiling] of [
  [
    "desktop",
    desktopDensity,
    ultraMultiplier,
    MAX_DESKTOP_TOTAL_NEAR_TRIANGLES,
  ],
  [
    "compact",
    compactDensity,
    compactUltraMultiplier,
    MAX_COMPACT_TOTAL_NEAR_TRIANGLES,
  ],
]) {
  const maximumTriangles = maximumTotalNearTriangles({
    ...totalNearParameters,
    density,
    ultraMultiplier: profileUltraMultiplier,
  });
  assert(
    maximumTriangles <= ceiling,
    `${profile} combined near + bridge budget is ${maximumTriangles} triangles, ` +
      `above the ${ceiling} ceiling.`,
  );
}

const qualityScaleTargets = [
  ...qualityGovernor.matchAll(/nearDistanceScale:\s*([0-9.]+)/g),
].map((match) => Number(match[1]));
assert(
  qualityScaleTargets.length > 0 && qualityScaleTargets.every(Number.isFinite),
  "Unable to read grass quality near-distance scales.",
);
const minimumQualityScale = Math.min(...qualityScaleTargets);
const maximumQualityScale = Math.max(...qualityScaleTargets);
const qualityScales = Array.from(
  { length: PHASE_SAMPLES + 1 },
  (_, index) =>
    minimumQualityScale +
    ((maximumQualityScale - minimumQualityScale) * index) / PHASE_SAMPLES,
);

for (const direction of Object.values(presets)) {
  for (const scale of qualityScales) {
    const outerFadeStart =
      direction.nearDistance * scale - direction.transitionDistance;
    const preferredBridgeFadeEnd = bridgeFadeEnd * scale;
    const resolvedBridgeFadeEnd = Math.min(
      preferredBridgeFadeEnd,
      outerFadeStart,
    );
    const preferredBridgeTransition = bridgeTransition * scale;
    const resolvedBridgeTransition = Math.max(
      0.01,
      Math.min(
        preferredBridgeTransition,
        Math.max(0.01, (resolvedBridgeFadeEnd - ultraFadeEnd) * 0.5),
      ),
    );
    const resolvedBridgeFadeStart =
      resolvedBridgeFadeEnd - resolvedBridgeTransition * 2;

    assert(
      resolvedBridgeFadeEnd <= outerFadeStart + 1e-9,
      `${direction.label} bridge overlaps the patch fade at quality scale ${scale}.`,
    );
    assert(
      resolvedBridgeFadeStart >= ultraFadeEnd - 1e-9,
      `${direction.label} bridge overlaps ultra-near detail at quality scale ${scale}.`,
    );
  }
}

assert(
  nearField.includes("ditherSeed: BASE_SEED_SALT") &&
    nearField.includes('namePrefix: "world-grass-single-blades"') &&
    nearField.includes('namePrefix: "world-grass-near-bridge"') &&
    nearField.includes("densityMultiplier: 1"),
  "LOD0 and bridge must retain the same placement seed and source density.",
);
assert(
  nearField.includes("this.baseMaterial.setLodDensityScale(1)") &&
    nearField.includes("this.baseDetailMaterial.setLodDensityScale(1)") &&
    nearField.includes("this.bridgeMaterial.setLodDensityScale(densityScale)"),
  "Quality scaling must not open a dither gap between LOD0 and bridge.",
);
assert(
  nearField.includes("lodInnerCullDistance:") &&
    nearField.includes("setInnerCullDistance(") &&
    tileField.includes("isInsideInnerCull") &&
    tileField.includes("tile.mesh.boundingSphere") &&
    tileField.includes("tile.mesh.count = 0"),
  "Bridge tiles fully inside the zero-coverage core must skip submission.",
);
assert(
  nearField.includes("sheen: false"),
  "The bridge must remain cheaper than close LOD0 shading.",
);

console.log(
  "[grass-bridge-lod] Placement, staging, quality, total-budget, and submission checks passed.",
);
