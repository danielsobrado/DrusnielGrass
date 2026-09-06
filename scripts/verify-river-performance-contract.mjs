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
    throw new Error(`[river-perf] ${message}`);
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`private ${name}(`);
  const fallback = source.indexOf(`${name}(`);
  const index = start >= 0 ? start : fallback;
  assert(index >= 0, `Unable to find ${name}().`);
  let depth = 0;
  let started = false;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "{") {
      depth += 1;
      started = true;
    } else if (character === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return source.slice(index, cursor + 1);
      }
    }
  }
  throw new Error(`[river-perf] Unable to extract ${name}().`);
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

const riverField = read("src/world/hydrology/RiverField.ts");
const hydrologyField = read("src/world/hydrology/HydrologyField.ts");
const waterShader = read("src/world/hydrology/WaterShader.ts");
const waterMaterial = read("src/world/hydrology/WaterMaterialController.ts");
const bedShader = read("src/world/hydrology/WaterBedMaterialShader.ts");
const bedFunctions = read("src/world/hydrology/WaterBedShader.ts");
const bedMaterial = read("src/world/hydrology/WaterBedMaterialController.ts");
const interaction = read("src/world/hydrology/WaterInteractionField.ts");
const resolver = read("src/world/hydrology/WaterChunkInteractionResolver.ts");
const streamer = read("src/world/TerrainStreamer.ts");
const chunkGeometry = read("src/world/hydrology/WaterChunkGeometry.ts");
const regimeShader = read("src/world/hydrology/WaterRegimeShader.ts");
const waveShader = read("src/world/hydrology/WaterWaveShader.ts");
const foamShader = read("src/world/hydrology/WaterFoamShader.ts");

const sample = extractFunction(riverField, "sample");
const sampleLane = extractFunction(riverField, "sampleLane");
const resolveSelected = extractFunction(riverField, "resolveSelectedLane");

assert(
  countMatches(sampleLane, /Math\.sin\s*\(/g) === 2,
  "sampleLane() must use exactly two centreline sine evaluations.",
);
assert(
  !sampleLane.includes("Math.cos"),
  "Cosine work must remain selected-lane work, not per-candidate-lane work.",
);
assert(
  countMatches(resolveSelected, /Math\.cos\s*\(/g) === 2,
  "The selected lane must evaluate both centreline cosines once.",
);
assert(
  resolveSelected.includes("const curvature =") &&
    resolveSelected.includes("tangentLength * tangentLength * tangentLength") &&
    resolveSelected.includes("curvature / secondDerivativeReference"),
  "Bend strength must use geometric curvature rather than raw second derivative.",
);
const altitudeRejectIndex = sample.indexOf("height >= this.config.riverMaxAltitude");
const laneSampleIndex = sample.indexOf("this.sampleLane(");
assert(
  altitudeRejectIndex >= 0 && laneSampleIndex > altitudeRejectIndex,
  "Samples above riverMaxAltitude must reject before any centreline trigonometry.",
);
assert(
  riverField.includes("maximumInfluenceHalfWidth") &&
    sample.includes("lane.distance > this.maximumInfluenceHalfWidth") &&
    sample.includes("return clearRiverSample(target)"),
  "Dry samples outside every possible river influence must skip selected-lane morphology work.",
);
assert(
  !riverField.includes("simplex") &&
    !riverField.includes("perlin") &&
    !riverField.includes("valueNoise") &&
    !waterShader.includes("uWaterRiverNoise") &&
    !waterMaterial.includes("createWaterRiver") &&
    !bedMaterial.includes("createWaterRiver"),
  "River morphology must not introduce a new noise texture or sampler.",
);
assert(
  /const WAKE_SAMPLE_COUNT = 3;/.test(interaction),
  "Stone wakes must keep WAKE_SAMPLE_COUNT = 3.",
);
assert(
  !interaction.includes("waterStoneWakeStrength <= 0"),
  "Live wake strength must not suppress the CPU wake mask needed to turn the effect back on.",
);
assert(
  chunkGeometry.includes('setAttribute("waterData"') &&
    chunkGeometry.includes("new THREE.BufferAttribute(this.data, 4)"),
  "waterData must remain four floats.",
);
assert(
  chunkGeometry.includes('setAttribute(\n      "waterInteraction"') ||
    chunkGeometry.includes('"waterInteraction"'),
  "waterInteraction attribute must remain present.",
);
assert(
  chunkGeometry.includes("new THREE.BufferAttribute(this.interactions, 2)"),
  "waterInteraction must remain two floats.",
);
/**
 * Morphology, bend, lateral position, and lake position used to be barred from
 * the GPU entirely. They now reach it, but only through one packed vertex
 * attribute the hydrology had already computed — never through a second field,
 * a second sampler, or a second material. That is what this contract protects.
 */
assert(
  chunkGeometry.includes('"waterContext"') &&
    chunkGeometry.includes("new THREE.BufferAttribute(this.context, 4)") &&
    chunkGeometry.includes("hydrology.riverBend") &&
    chunkGeometry.includes("hydrology.riverLateral") &&
    chunkGeometry.includes("hydrology.riverMorphology") &&
    chunkGeometry.includes("hydrology.lakeNormalizedDistance"),
  "River and lake context must reach the surface as one packed four-float attribute.",
);
assert(
  waterShader.includes("attribute vec4 waterContext") &&
    waterShader.includes("varying vec4 vWaterContext") &&
    !waterShader.includes("attribute vec4 waterBend") &&
    !waterShader.includes("attribute vec4 waterMorphology"),
  "The surface must read that context from a single varying rather than growing new attributes.",
);
assert(
  hydrologyField.includes("riverMorphology") &&
    hydrologyField.includes("riverBend") &&
    hydrologyField.includes("riverLateral") &&
    hydrologyField.includes("lakeNormalizedDistance"),
  "CPU hydrology samples must expose morphology and lake-position semantics for QA.",
);
assert(
  regimeShader.includes("waterResolveRegime") &&
    !regimeShader.includes("texture2D") &&
    !waveShader.includes("texture2D") &&
    !foamShader.includes("texture2D"),
  "Regime, wave, and foam helpers must stay arithmetic; no regime may add a texture fetch.",
);

const surfaceSamplerCount = countMatches(
  waterShader,
  /uniform\s+sampler2D\s+/g,
);
const bedSamplerCount = countMatches(bedShader, /uniform\s+sampler2D\s+/g);
assert(
  surfaceSamplerCount === 1 && waterShader.includes("uWaterFlowNoise"),
  "Surface water must keep a single sampler2D uniform.",
);
assert(
  bedSamplerCount === 1 && bedShader.includes("uWaterBedNoise"),
  "Riverbed shading must keep a single sampler2D uniform.",
);
assert(
  countMatches(bedFunctions, /texture2D\s*\(\s*uWaterBedNoise/g) === 2,
  "Riverbed composition must reuse the existing two bed texture samples.",
);
assert(
  waterMaterial.includes("forceSinglePass = true"),
  "Water surface must remain forceSinglePass.",
);
assert(
  streamer.includes("new WaterMaterialController(config, compact)") &&
    streamer.includes("new WaterBedMaterialController(config, compact)") &&
    streamer.includes("this.waterMaterialController?.material") &&
    streamer.includes("this.waterBedMaterialController?.material"),
  "TerrainStreamer must own the shared water and bed controllers.",
);
assert(
  !/class TerrainChunk[\s\S]*new WaterMaterialController/.test(
    read("src/world/TerrainChunk.ts"),
  ),
  "Water materials must not be created per terrain chunk.",
);

const downhillIndex = resolver.indexOf("resolveDownhillWaterFlow");
const interactionIndex = resolver.indexOf("interactionField.sample");
assert(
  downhillIndex >= 0 && interactionIndex > downhillIndex,
  "Downhill flow must be resolved before stone interaction sampling.",
);

console.log(
  "[river-perf] Static river performance architecture contract verified.",
);
