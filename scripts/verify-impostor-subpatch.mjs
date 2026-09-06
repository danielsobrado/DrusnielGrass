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
  throw new Error(`[impostor-subpatch] ${message}`);
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
    fail(`Unable to read ${key} from configuration.`);
  }
  return value;
}

function readConstant(source, name) {
  const expression = source.match(
    new RegExp(`export const ${name}\\s*=\\s*([^;]+);`),
  )?.[1];
  const value = Number(expression);
  if (!Number.isFinite(value)) {
    fail(`Unable to read numeric constant ${name}.`);
  }
  return value;
}

function resolveBladeArcTip(height, bladeCurve) {
  if (!(bladeCurve > 1e-4)) {
    return { y: height, z: 0 };
  }
  return {
    y: (height * Math.sin(bladeCurve)) / bladeCurve,
    z: (height * (1 - Math.cos(bladeCurve))) / bladeCurve,
  };
}

const worldConfig = read("public/config/world.yaml");
const grassConfig = read("public/config/grass.yaml");
const impostorLimits = read("src/grass/GrassImpostorLimits.ts");
const lodTuning = read("src/grass/GrassLodTuning.ts");
const configLoader = read("src/grass/internal/GrassConfigLoader.ts");
const configValidator = read("src/grass/internal/GrassConfigValidator.ts");
const mapping = read("src/grass/impostors/OctahedralMapping.ts");
const baker = read("src/grass/impostors/OctahedralImpostorBaker.ts");
const atlasFactory = read(
  "src/world/grass/WorldGrassImpostorAtlasFactory.ts",
);
const material = read("src/world/grass/WorldGrassImpostorMaterial.ts");
const workloadProbe = read("src/runtime/GrassWorkloadProbe.ts");
const performanceGate = read("scripts/verify-grass-performance.mjs");

const patchSize = readYamlNumber(worldConfig, "grassPatchSize");
const farInstances = readYamlNumber(
  worldConfig,
  "grassFarImpostorsPerPatch",
);
const viewsPerAxis = readYamlNumber(grassConfig, "impostorViewsPerAxis");
const frameResolution = readYamlNumber(
  grassConfig,
  "impostorFrameResolution",
);
const padding = readYamlNumber(grassConfig, "impostorPadding");
const cameraMargin = readYamlNumber(grassConfig, "impostorCameraMargin");
const bladeHeight = readYamlNumber(grassConfig, "bladeHeightMax");
const bladeWidth = readYamlNumber(grassConfig, "bladeWidthMax");
const bladeLean = readYamlNumber(grassConfig, "bladeLeanMax");
const bladeCurve = readYamlNumber(grassConfig, "bladeCurve");
const subpatchesPerAxis = readConstant(
  impostorLimits,
  "GRASS_IMPOSTOR_SUBPATCHES_PER_AXIS",
);
const maximumAtlasSize = readConstant(
  impostorLimits,
  "GRASS_IMPOSTOR_MAX_ATLAS_SIZE",
);
const footprintScale = readConstant(
  lodTuning,
  "GRASS_IMPOSTOR_FOOTPRINT_SCALE",
);
const maximumHorizontalScale = readConstant(
  lodTuning,
  "GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE",
);
const maximumVerticalScale = readConstant(
  lodTuning,
  "GRASS_IMPOSTOR_MAX_VERTICAL_SCALE",
);
const maximumWindDisplacement = readConstant(
  lodTuning,
  "GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT",
);
const boundsSafetyMargin = readConstant(
  lodTuning,
  "GRASS_IMPOSTOR_BOUNDS_SAFETY_MARGIN",
);

assert(
  Number.isInteger(subpatchesPerAxis) && subpatchesPerAxis === 2,
  "The current quadrant partitioner requires a 2x2 subpatch layout.",
);
assert(farInstances === 1, "Far grass must use one source instance per patch.");
assert(patchSize > 0, "Grass patch size must be positive.");
assert(
  Number.isInteger(maximumAtlasSize) && maximumAtlasSize > 0,
  "Far atlas ceiling must be a positive integer.",
);

const subpatchCount = subpatchesPerAxis ** 2;
const cellSize = frameResolution + padding * 2;
const atlasSize = viewsPerAxis * cellSize * subpatchesPerAxis;
assert(
  atlasSize <= maximumAtlasSize,
  `Far atlas ${atlasSize}px exceeds the ${maximumAtlasSize}px ceiling.`,
);

const subpatchSize = patchSize / subpatchesPerAxis;
const halfSubpatch = subpatchSize * 0.5;
const bladeTip = resolveBladeArcTip(bladeHeight, bladeCurve);
const centerHeight = bladeTip.y * 0.5;
const sourceHorizontalExtent =
  Math.SQRT2 * halfSubpatch + bladeLean + bladeWidth + bladeTip.z;
const cardRadius =
  Math.hypot(sourceHorizontalExtent, centerHeight) * cameraMargin;
const maximumCenterOffset =
  Math.SQRT2 * (patchSize * 0.5 - halfSubpatch);
const transformedHorizontalExtent =
  cardRadius * maximumHorizontalScale * footprintScale;
const transformedVerticalExtent = cardRadius * maximumVerticalScale;
const cardBoundsRadius =
  centerHeight * maximumVerticalScale +
  Math.hypot(transformedHorizontalExtent, transformedVerticalExtent) +
  maximumWindDisplacement +
  boundsSafetyMargin;
const patchBoundsRadius =
  cardBoundsRadius + maximumCenterOffset * maximumHorizontalScale;

assert(
  Number.isFinite(patchBoundsRadius) && patchBoundsRadius > patchSize * 0.5,
  "Derived far-impostor bounds are invalid.",
);
assert(
  configLoader.includes("validateGrassConfig(config)") &&
    configValidator.includes("GRASS_IMPOSTOR_SUBPATCHES_PER_AXIS") &&
    configValidator.includes("GRASS_IMPOSTOR_MAX_ATLAS_SIZE") &&
    configValidator.includes("config.impostor.viewsPerAxis *") &&
    configValidator.includes("GRASS_IMPOSTOR_SUBPATCHES_PER_AXIS"),
  "Grass config validation must account for the complete subpatch atlas allocation.",
);
assert(
  mapping.includes("direction.lengthSq() <= Number.EPSILON") &&
    mapping.includes("Number.isFinite(direction.x)") &&
    mapping.includes("Number.isFinite(u)") &&
    mapping.includes("Number.isFinite(v)"),
  "Octahedral mapping must reject non-finite coordinates and zero/non-finite direction vectors before they create NaN atlas coordinates.",
);
assert(
  baker.includes("const saved = new Set<THREE.Object3D>()") &&
    baker.includes("if (saved.has(object))") &&
    baker.includes("saved.add(object)"),
  "Impostor baking must save each scene object exactly once so source-contained lights restore their original layer and visibility state.",
);
assert(
  atlasFactory.includes("partitionBlades") &&
    atlasFactory.includes("grassSubpatchOffset") &&
    atlasFactory.includes("grassSubpatchIndex") &&
    atlasFactory.includes("subpatchOffsetRadius * GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE"),
  "Far atlas geometry must partition blades and include subpatch offsets in bounds.",
);
assert(
  atlasFactory.includes("calculateGrassBladeCurveReach") &&
    atlasFactory.includes("resolveGrassBladeArcPoint"),
  "Far atlas geometry and bounds must use the configured blade rest arc.",
);
assert(
  atlasFactory.includes("IMPOSTOR_MAX_ATLAS_SIZE") &&
    atlasFactory.includes("atlasSize > IMPOSTOR_MAX_ATLAS_SIZE"),
  "Far atlas allocation must enforce the runtime atlas ceiling.",
);
assert(
  atlasFactory.includes("blade.rootX >= 0 ? 1 : 0") &&
    atlasFactory.includes("blade.rootZ >= 0 ? 1 : 0"),
  "The 2x2 atlas must assign each blade root to exactly one quadrant.",
);
assert(
  material.includes("cylindricalRight") &&
    material.includes("atlasElevation") &&
    material.includes("return textureGrad(") &&
    material.includes("float alphaCoverage = saturate(") &&
    material.includes("uSubpatchesPerAxis"),
  "Far material must retain upright horizon cards, explicit mip gradients, and stable alpha coverage.",
);
assert(
  workloadProbe.includes("FAR_INDICES_PER_CARD = 6") &&
    workloadProbe.includes("submittedIndices / FAR_INDICES_PER_CARD"),
  "Runtime diagnostics must count submitted subpatch cards from geometry indices.",
);
assert(
  performanceGate.includes("farSubpatchesPerAxis") &&
    performanceGate.includes("farInstancesPerBatch === 64") &&
    performanceGate.includes("farTrianglesPerBatch === 512"),
  "Performance gates must charge all four cards contained in each far instance.",
);

console.log(
  `[impostor-subpatch] ${subpatchCount} cards/patch, ${atlasSize}px atlas, ` +
    `${patchBoundsRadius.toFixed(3)} m conservative patch bound verified.`,
);
