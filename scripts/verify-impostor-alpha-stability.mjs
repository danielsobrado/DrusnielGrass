import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const TERRAIN_DITHER_SAMPLES = 4096;
const MAX_TERRAIN_COVERAGE_ERROR = 0.002;

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[impostor-alpha] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
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

function readYamlNumber(source, key) {
  const value = Number(
    source.match(new RegExp(`^${key}:\\s*([0-9.]+)$`, "m"))?.[1],
  );
  if (!Number.isFinite(value)) {
    fail(`Unable to read ${key} from configuration.`);
  }
  return value;
}

function fract(value) {
  return value - Math.floor(value);
}

const material = read("src/world/grass/WorldGrassImpostorMaterial.ts");
const tuning = read("src/world/grass/WorldGrassImpostorTuning.ts");
const limits = read("src/grass/GrassImpostorLimits.ts");
const validator = read("src/grass/internal/GrassConfigValidator.ts");
const grassConfig = read("public/config/grass.yaml");

const alphaCutoff = readConstant(tuning, "IMPOSTOR_ALPHA_CUTOFF");
const minifiedAlphaCutoff = readConstant(
  tuning,
  "IMPOSTOR_MINIFIED_ALPHA_CUTOFF",
);
const minificationStart = readConstant(
  tuning,
  "IMPOSTOR_MINIFICATION_START_TEXELS_PER_PIXEL",
);
const minificationFull = readConstant(
  tuning,
  "IMPOSTOR_MINIFICATION_FULL_TEXELS_PER_PIXEL",
);
const viewDitherGridScale = readConstant(
  tuning,
  "IMPOSTOR_VIEW_DITHER_GRID_SCALE",
);
const terrainInstanceScale = readConstant(
  tuning,
  "IMPOSTOR_TERRAIN_DITHER_INSTANCE_SCALE",
);
const terrainSubpatchScale = readConstant(
  tuning,
  "IMPOSTOR_TERRAIN_DITHER_SUBPATCH_SCALE",
);
const terrainSeedScale = readConstant(
  tuning,
  "IMPOSTOR_TERRAIN_DITHER_SEED_SCALE",
);
const ditherSeed = readConstant(tuning, "IMPOSTOR_DITHER_SEED");
const minimumPadding = readConstant(limits, "GRASS_IMPOSTOR_MIN_PADDING");
const configuredPadding = readYamlNumber(grassConfig, "impostorPadding");

assert(
  alphaCutoff > 0 &&
    alphaCutoff < minifiedAlphaCutoff &&
    minifiedAlphaCutoff <= 1,
  "Minified alpha must harden from a valid near cutoff to a stronger cutoff no greater than one.",
);
assert(
  minificationStart >= 1 && minificationFull > minificationStart,
  "Minification thresholds must begin at or beyond one atlas texel per screen pixel and increase monotonically.",
);
assert(
  viewDitherGridScale > 0 && viewDitherGridScale <= 1,
  "View dither resolution must remain a positive fraction of the configured frame resolution.",
);
assert(
  minimumPadding >= minificationFull && configuredPadding >= minimumPadding,
  "Atlas padding must isolate neighbouring frames through the stochastic minification range.",
);
assert(
  validator.includes("config.impostor.padding < GRASS_IMPOSTOR_MIN_PADDING"),
  "Grass config validation must reject mip-unsafe impostor padding.",
);

assert(
  material.includes("vec3 safeNormalize3(vec3 value, vec3 fallbackValue)") &&
    material.includes("float scaleZ = max(length(instanceAxisZ), 0.0001)") &&
    material.includes("safeNormalize3(cameraPosition - center, basisZ)") &&
    material.includes("float cardVisibility = step(0.001, effectiveCoverage)") &&
    material.includes(
      "cardVisibility *= 1.0 - step(terrainCoverage, terrainDither)",
    ) &&
    material.includes("vec3 worldPosition = center + cardOffset * cardVisibility") &&
    !material.includes("gl_Position = vec4(2.0, 2.0, 2.0, 1.0)"),
  "Impostor vertices must keep finite bases and collapse rejected cards instead of early-returning with partially written vertex outputs.",
);
assert(
  material.includes("vec2 frameUvDx = dFdx(vUv)") &&
    material.includes("vec2 frameUvDy = dFdy(vUv)") &&
    material.includes("vec2 frameUvWidth = abs(frameUvDx) + abs(frameUvDy)") &&
    material.includes("uFrameResolution * max(frameUvWidth.x, frameUvWidth.y)"),
  "Impostor minification must be driven by projected atlas derivatives captured before any discard.",
);
assert(
  material.includes("float safeMipTexelsPerPixel = max(1.0, uPadding * 2.0)") &&
    material.includes("safeMipTexelsPerPixel / max(atlasTexelsPerPixel, 0.0001)") &&
    material.includes("vec2 sampleUvDx = frameUvDx * mipGradientScale") &&
    material.includes("vec2 sampleUvDy = frameUvDy * mipGradientScale"),
  "Packed-atlas sampling must cap its mip footprint to the two padding gutters between neighbouring frames.",
);
assert(
  material.includes("floor(vUv * uFrameResolution)") &&
    !material.includes("floor(vUv * 64.0)"),
  "Coverage dither must track the configured atlas frame resolution.",
);
assert(
  material.includes("return textureGrad(") &&
    material.includes("localUvDx * atlasGradientScale") &&
    material.includes("localUvDy * atlasGradientScale") &&
    material.includes("sampleFrame(nearestFrame, vUv, sampleUvDx, sampleUvDy)") &&
    material.includes("sampleFrame(selectedFrame, vUv, sampleUvDx, sampleUvDy)") &&
    material.includes("if (uBlendViews < 0.5)") &&
    material.includes("if (!fullyMinified)") &&
    !material.includes("return texture2D(uAtlas"),
  "Stochastic frame selection must use explicit capped local-frame gradients so atlas-cell jumps and extreme minification cannot select cross-frame mips.",
);
assert(
  material.includes("float terrainCoverage = 1.0 - smoothstep(") &&
    material.includes("float terrainDither = fract(") &&
    material.includes(
      "cardVisibility *= 1.0 - step(terrainCoverage, terrainDither)",
    ) &&
    material.includes("IMPOSTOR_TERRAIN_DITHER_INSTANCE_SCALE.toFixed(1)") &&
    material.includes("IMPOSTOR_TERRAIN_DITHER_SUBPATCH_SCALE.toFixed(11)") &&
    material.includes("IMPOSTOR_TERRAIN_DITHER_SEED_SCALE.toFixed(11)") &&
    !material.includes("vTerrainCoverage"),
  "The unoverlapped far-to-terrain handoff must fade coherent subpatch cards from named stable hash tuning.",
);
assert(
  material.includes("float dither = fullyMinified") &&
    material.includes("vFarEntry * min(vFieldCoverage * uArtDensityScale, 1.0)") &&
    material.includes("if (dither >= effectiveCoverage)"),
  "Mid/field coverage must retain a strict zero-safe threshold and become coherent once cards are strongly minified.",
);
assert(
  material.includes("float alphaCoverage = saturate(") &&
    material.includes("(atlasColor.a - cutoff) / max(1.0 - cutoff, 0.001)") &&
    material.includes("if (atlasColor.a <= cutoff)") &&
    material.includes("float alphaThreshold = mix(alphaDither, 0.5, minification)") &&
    material.includes("if (alphaThreshold >= alphaCoverage)") &&
    !material.includes("float alphaWidth =") &&
    !material.includes("if (alphaDither > alphaCoverage)"),
  "Atlas alpha must be remapped directly as coverage instead of differentiating stochastic view samples.",
);
const fragmentStartIndex = material.indexOf("const FRAGMENT_SHADER = `");
const mainStartIndex = material.indexOf("void main() {", fragmentStartIndex);
const frameDerivativeIndex = material.indexOf(
  "vec2 frameUvDx = dFdx(vUv)",
  mainStartIndex,
);
const nearestSampleIndex = material.indexOf(
  "sampleFrame(nearestFrame, vUv, sampleUvDx, sampleUvDy)",
  mainStartIndex,
);
const selectedSampleIndex = material.indexOf(
  "sampleFrame(selectedFrame, vUv, sampleUvDx, sampleUvDy)",
  mainStartIndex,
);
const firstFragmentDiscardIndex = material.indexOf("discard;", mainStartIndex);
const coverageDitherIndex = material.indexOf(
  "float dither = fullyMinified",
  mainStartIndex,
);
assert(
  fragmentStartIndex >= 0 &&
    mainStartIndex > fragmentStartIndex &&
    frameDerivativeIndex > mainStartIndex &&
    nearestSampleIndex > frameDerivativeIndex &&
    selectedSampleIndex > frameDerivativeIndex &&
    firstFragmentDiscardIndex > nearestSampleIndex &&
    firstFragmentDiscardIndex > selectedSampleIndex &&
    coverageDitherIndex > firstFragmentDiscardIndex,
  "Impostor derivatives and atlas fetches must run before any non-uniform fragment discard.",
);
const postDiscardSource = material.slice(firstFragmentDiscardIndex);
assert(
  !postDiscardSource.includes("dFdx(") &&
    !postDiscardSource.includes("dFdy(") &&
    !postDiscardSource.includes("fwidth("),
  "No derivative operation may execute after a possible fragment discard.",
);
for (const varying of [
  "flat varying vec3 vLocalViewDirection;",
  "flat varying float vGustNoise;",
  "flat varying float vInstanceSeed;",
  "flat varying float vFarEntry;",
  "flat varying float vFieldCoverage;",
  "flat varying vec3 vGrassIrradiance;",
]) {
  assert(
    material.includes(varying),
    `Per-card impostor value must avoid perspective interpolation: ${varying}`,
  );
}
assert(
  !material.includes("vCameraDistance") &&
    !material.includes("IMPOSTOR_FAR_ALPHA_CUTOFF_SCALE"),
  "Alpha stability must stay screen-space driven and must not retain the old distance-coupled cutoff path.",
);
assert(
  material.includes("let createdMaterial: THREE.ShaderMaterial | undefined") &&
    material.includes("createdMaterial?.dispose()") &&
    material.includes("atlas.texture.dispose()") &&
    material.includes("atlas.geometry.dispose()"),
  "Impostor construction must release atlas GPU resources when material setup fails.",
);

for (const coverage of [0.1, 0.25, 0.5, 0.75, 0.9]) {
  let kept = 0;
  const subpatches = 4;
  const total = TERRAIN_DITHER_SAMPLES * subpatches;
  for (let index = 0; index < TERRAIN_DITHER_SAMPLES; index += 1) {
    const instanceSeed =
      (Math.imul(index + 1, 0x9e3779b1) >>> 0) / 0x1_0000_0000;
    for (let subpatch = 0; subpatch < subpatches; subpatch += 1) {
      const dither = fract(
        instanceSeed * terrainInstanceScale +
          subpatch * terrainSubpatchScale +
          ditherSeed * terrainSeedScale,
      );
      if (dither < coverage) {
        kept += 1;
      }
    }
  }
  const measured = kept / total;
  assert(
    Math.abs(measured - coverage) <= MAX_TERRAIN_COVERAGE_ERROR,
    `Terrain dither coverage ${coverage} measured ${measured}.`,
  );
}

console.log(
  `[impostor-alpha] ${alphaCutoff.toFixed(2)} -> ${minifiedAlphaCutoff.toFixed(2)} cutoff, ` +
    `${minificationStart.toFixed(1)}-${minificationFull.toFixed(1)} texels/pixel hardening, ` +
    `${minimumPadding}px minimum gutter, coherent terrain fade verified.`,
);
