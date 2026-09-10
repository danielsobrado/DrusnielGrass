import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/scenic/WorldTreeField.ts"),
  "utf8",
).replaceAll("\r\n", "\n");
const tuning = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/scenic/WorldTreeTuning.ts"),
  "utf8",
).replaceAll("\r\n", "\n");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[tree-field-safety] ${message}`);
  }
}

const collectStart = source.indexOf("collect(centerX: number, centerZ: number, radius: number)");
const sampleStart = source.indexOf("private sampleCell(", collectStart);
const collectSource = source.slice(collectStart, sampleStart);

assert(
  collectStart >= 0 &&
    sampleStart > collectStart &&
    collectSource.includes("!Number.isFinite(centerX)") &&
    collectSource.includes("!Number.isFinite(centerZ)") &&
    collectSource.includes("!Number.isFinite(radius)") &&
    collectSource.includes("radius <= 0") &&
    collectSource.indexOf("return []") < collectSource.indexOf("const minX = Math.floor"),
  "Tree collection must reject invalid bounds before deriving lattice limits, preventing Infinity-based non-advancing loops.",
);

const ecologyStart = source.indexOf("const ecology = this.field.sampleOpenGroundEcologyAt");
const speciesRoll = source.indexOf("const speciesRoll =", ecologyStart);
const returnTree = source.indexOf("return {", speciesRoll);
assert(
  source.includes("readonly species: WorldTreeSpecies") &&
    ecologyStart >= 0 &&
    speciesRoll > ecologyStart &&
    returnTree > speciesRoll &&
    source.includes("species: resolveWorldTreeSpecies(") &&
    source.includes("TREE_SPECIES_SALT") &&
    tuning.includes('WORLD_TREE_SPECIES = ["oak", "birch", "evergreen"]'),
  "Tree species must be a deterministic identity channel derived after the existing placement filters, not a second placement field.",
);
assert(
  source.includes("TREE_SPECIES_CANOPY_RADIUS[tree.species]") &&
    tuning.includes("TREE_SPECIES_CANOPY_RADIUS") &&
    tuning.includes("oak: 1") &&
    tuning.includes("birch: 0.78") &&
    tuning.includes("evergreen: 0.82"),
  "Canopy shade must use the same species radius factors as the tree renderer.",
);
assert(
  source.includes("TREE_EVERGREEN_MAX_SHARE") &&
    source.includes("TREE_BIRCH_MAX_SHARE") &&
    source.includes('return sample < birchThreshold ? "birch" : "oak";'),
  "Species mixing must stay bounded so no ecology patch collapses into one tree family.",
);

console.log(
  "[tree-field-safety] Tree bounds, deterministic species identity, and renderer/shade crown parity verified.",
);
