import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const GRASS_SYSTEM = resolve(REPOSITORY_ROOT, "src", "world", "WorldGrassSystem.ts");

function fail(message) {
  throw new Error(`[grass-streaming-performance] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function position(source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) {
    fail(`Missing streaming contract: ${needle}`);
  }
  return index;
}

const source = readFileSync(GRASS_SYSTEM, "utf8").replaceAll("\r\n", "\n");
const buildStart = position(source, "private advancePatchBuild(");
const buildEnd = position(source, "private advancePatchFinalize(");
const build = source.slice(buildStart, buildEnd);

assert(
  source.includes("const FIELD_COVERAGE_REJECT = 0.02;"),
  "The streamed patch rejection threshold must remain a named constant.",
);
assert(
  !build.includes("sampleGrassSuitability("),
  "Streamed patches must not recompute slope-free suitability after sampling the normal.",
);

const slopeFree = position(build, "sampleGrassSuitabilityWithoutSlope");
const slopeFreeReject = position(build, "suitabilityWithoutSlope <= FIELD_COVERAGE_MIN");
const normal = position(build, "sampleNormal(x, z, job.normal)");
const slopeMask = position(build, "sampleGrassSlopeMask(job.normal)");
const fieldReject = position(build, "fieldCoverage <= FIELD_COVERAGE_REJECT");
const path = position(build, "samplePathGrassMask");
const pathReject = position(build, "pathFieldCoverage <= FIELD_COVERAGE_REJECT");
const stone = position(build, "sampleStoneGrassClearance");
const preBiomeReject = position(build, "preBiomeCoverage <= FIELD_COVERAGE_REJECT");
const biome = position(build, "sampleGrassBiome(x, z)");
const coverage = position(
  build,
  "const coverage = preBiomeCoverage * resolveGrassBiomeDensity(biomeSample);",
);
const finalReject = build.indexOf("coverage <= FIELD_COVERAGE_REJECT", coverage);
const biomePick = position(build, "pickGrassBiomeIndex(x, z, biomeSample)");

assert(
  slopeFree < slopeFreeReject &&
    slopeFreeReject < normal &&
    normal < slopeMask &&
    slopeMask < fieldReject &&
    fieldReject < path &&
    path < pathReject &&
    pathReject < stone &&
    stone < preBiomeReject &&
    preBiomeReject < biome &&
    biome < coverage &&
    coverage < finalReject &&
    finalReject < biomePick,
  "Streamed grass must reject guaranteed-empty patches before normal, path/stone, biome, and biome-pick work in cost order.",
);

console.log("[grass-streaming-performance] Early rejection ordering verified.");
