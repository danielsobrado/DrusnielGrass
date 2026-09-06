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
    throw new Error(`[water-render] ${message}`);
  }
}

const waterShader = read("src/world/hydrology/WaterShader.ts");
const waterOptics = read("src/world/hydrology/WaterOpticsShader.ts");
// The surface fragment program is composed from both files: WaterShader.ts
// inlines WATER_OPTICS_FRAGMENT_FUNCTIONS, so the optical uniforms are declared
// in WaterOpticsShader.ts but reach the GPU as one program. Contracts about the
// surface must therefore read the composed source, not a single file.
const waterSurfaceProgram = `${waterShader}\n${waterOptics}`;
const waterMaterial = read("src/world/hydrology/WaterMaterialController.ts");
const bedShader = read("src/world/hydrology/WaterBedMaterialShader.ts");
const bedMaterial = read("src/world/hydrology/WaterBedMaterialController.ts");
const bedFunctions = read("src/world/hydrology/WaterBedShader.ts");
const tuning = read("src/world/hydrology/WaterMaterialTuning.ts");
const regimeShader = read("src/world/hydrology/WaterRegimeShader.ts");
const waveShader = read("src/world/hydrology/WaterWaveShader.ts");
const foamShader = read("src/world/hydrology/WaterFoamShader.ts");
const streamer = read("src/world/TerrainStreamer.ts");
const chunkGeometry = read("src/world/hydrology/WaterChunkGeometry.ts");
const refractionPass = read("src/world/hydrology/WaterRefractionPass.ts");

assert(
  !waterSurfaceProgram.includes("waterSampleRiverBed") &&
    !waterSurfaceProgram.includes("uWaterBedNoise") &&
    !waterSurfaceProgram.includes("waterCaustic") &&
    !waterMaterial.includes("createWaterBedTexture") &&
    !waterMaterial.includes("bedTexture"),
  "The water surface must not own bed pebbles, algae, or caustics.",
);
assert(
  waterSurfaceProgram.includes("waterTransmittance") &&
    waterSurfaceProgram.includes("uWaterAbsorption") &&
    waterSurfaceProgram.includes("uWaterFresnelF0") &&
    !waterSurfaceProgram.includes("waterFresnelOpacity"),
  "Optical depth must drive transmittance, and Fresnel must not own surface alpha.",
);
assert(
  waterShader.includes("uWaterSunDirection") &&
    waterShader.includes("waterSunSpecular") &&
    waterShader.includes("waterGlintBreakup"),
  "Sun glints must come from the physical sun response, with noise only as breakup.",
);
assert(
  waterMaterial.includes("depthWrite: false") &&
    waterMaterial.includes("transparent: true") &&
    waterMaterial.includes("WATER_COMPACT_DETAIL_SCALE"),
  "Water surface must stay transparent without depth writes and scale compact detail.",
);
assert(
  waterOptics.includes("uniform sampler2D tWaterRefractionDepth") &&
    waterOptics.includes("WATER_REFRACTION_BACKGROUND_DEPTH") &&
    waterOptics.includes("texture2D(tWaterRefractionDepth, offsetUv).r") &&
    waterOptics.includes("refractionDepth < WATER_REFRACTION_BACKGROUND_DEPTH") &&
    waterMaterial.includes("tWaterRefractionDepth: { value: null }") &&
    waterMaterial.includes("this.refraction.depthTexture ?? null") &&
    refractionPass.includes("depthTexture: new THREE.DepthTexture"),
  "Screen-space refraction must reject clear-target pixels using the matching depth texture instead of blending empty black radiance into water.",
);
assert(
  bedFunctions.includes("waterSampleRiverBed") &&
    bedShader.includes("waterSampleRiverBed") &&
    bedShader.includes("waterBedCaustic") &&
    bedShader.includes("uWaterCausticStrength") &&
    bedMaterial.includes("uWaterCausticStrength") &&
    bedFunctions.includes("bedRiffle") &&
    bedFunctions.includes("fineDeposition") &&
    bedShader.includes("uWaterRiverReferenceDepth") &&
    bedMaterial.includes("uWaterRiverReferenceDepth"),
  "The bed pass must own cobbles, algae, caustics, and depth-driven composition.",
);
assert(
  bedMaterial.includes("transparent: false") &&
    bedMaterial.includes("depthWrite: true") &&
    bedMaterial.includes("depthTest: true") &&
    bedMaterial.includes("alphaTest: 0.01") &&
    bedShader.includes("diffuseColor.a = 1.0") &&
    bedShader.includes("discard"),
  "The bed must depth-test and depth-write as opaque masked geometry.",
);
assert(
  streamer.includes("new WaterMaterialController(config, compact)") &&
    streamer.includes("new WaterBedMaterialController(config, compact)"),
  "Water quality must follow the streamer compact profile rather than user-agent checks.",
);
assert(
  chunkGeometry.includes("box.min.y -= maxDepth") &&
    chunkGeometry.includes("box.getBoundingSphere(sphere)"),
  "Shared water geometry bounds must cover the vertex-displaced bed.",
);
assert(
  waterShader.includes("waterSunPlusView") &&
    waterShader.includes("waterViewDiff") &&
    bedShader.includes("waterBedViewDiff"),
  "Water and bed shaders must guard against zero-length vector normalizations.",
);
assert(
  waterShader.includes("uWaterFlowNoise") &&
    waterMaterial.includes("uWaterFlowNoise") &&
    !waterShader.includes("uWaterRiverNoise") &&
    !waterMaterial.includes("uWaterRiverNoise"),
  "Surface water must keep its existing flow-noise sampler and must not add a river noise map.",
);
assert(
  waterShader.includes("waterLocalFlowSpeed") &&
    waterShader.includes("waterResolveRiffleFoam") &&
    waterShader.includes("uWaterShoreFoamWeight") &&
    waterShader.includes("waterPoolTint") &&
    waterMaterial.includes("uWaterRiverReferenceDepth") &&
    waterMaterial.includes("forceSinglePass = true"),
  "Local river energy, foam hierarchy, and restrained tint must stay on the existing surface pass.",
);
/**
 * Calm, flowing and turbulent water are weights inside one material, never
 * separate materials. Separate lake/river/rapid materials are exactly where
 * layered water setups grow seams, and our hydrology already carries enough
 * context to avoid needing them.
 */
assert(
  waterShader.includes("waterResolveRegime") &&
    waterShader.includes("waterResolveBankSides") &&
    waterShader.includes("waterResolveLakeExposure") &&
    waterShader.includes("waterStreakStretch") &&
    !waterShader.includes("if (waterRegime") &&
    !waterMaterial.includes("lakeMaterial") &&
    !waterMaterial.includes("rapidMaterial") &&
    !waterMaterial.includes("new THREE.MeshPhysicalMaterial(\n      {"),
  "Pool/run/riffle/rapid, bank asymmetry and lake zones must be blended weights on one material.",
);
assert(
  regimeShader.includes("waterResolveRegime") &&
    waveShader.includes("stretch") &&
    foamShader.includes("shoreEnergy") &&
    foamShader.includes("cutoff"),
  "Regime weights, anisotropic streak stretch, and energy-weighted foam must own their own modules.",
);
assert(
  tuning.includes("WATER_MATERIAL_CACHE_KEY") &&
    tuning.includes("WATER_BED_MATERIAL_CACHE_KEY") &&
    tuning.includes("WATER_F0") &&
    tuning.includes("WATER_ABSORPTION_COLOR"),
  "Water compile cache keys and optical constants must live in the tuning module.",
);
assert(
  /try \{[\s\S]*?renderer\.render\(scene, camera\);[\s\S]*?\} finally \{[\s\S]*?camera\.layers\.mask = previousMask;[\s\S]*?renderer\.setRenderTarget\(previousTarget\);/.test(
    refractionPass,
  ),
  "Water refraction must restore the shared camera before renderer-target recovery can fail.",
);
assert(
  /this\.disposed = true;[\s\S]*?const target = this\.target;[\s\S]*?this\.target = undefined;[\s\S]*?if \(target\) \{[\s\S]*?disposeResources\(\[target, target\.depthTexture \?\? undefined\]\)/.test(
    refractionPass,
  ),
  "Water refraction disposal must clear published ownership before resource cleanup can throw.",
);

console.log(
  "[water-render] Surface/bed ownership, opaque bed depth, absorption, depth-gated refraction, state restoration, failure-safe cleanup, and compact quality verified.",
);
