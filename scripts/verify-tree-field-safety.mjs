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

const source = read("src/world/scenic/WorldTreeField.ts");
const tuning = read("src/world/scenic/WorldTreeTuning.ts");
const material = read("src/world/scenic/WorldTreeMaterialFactory.ts");
const resources = read("src/world/scenic/WorldTreeRenderResources.ts");
const system = read("src/world/scenic/WorldTreeSystem.ts");

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

assert(
  material.includes("positionGeometry") &&
    material.includes("const worldAxisX = modelWorldMatrix.mul") &&
    material.includes("const worldAxisY = modelWorldMatrix.mul") &&
    material.includes("const worldAxisZ = modelWorldMatrix.mul") &&
    material.includes("const deformed = positionGeometry.add(localDisplacement)") &&
    material.includes("columns[0].xyz.mul(deformed.x)"),
  "Tree wind must deform source geometry before reconstructing the instance transform; Three applies instancing before positionNode.",
);
assert(
  material.includes("createBakedWorldWindNodes") &&
    material.includes("createWorldWindFieldNodes") &&
    material.includes("WORLD_WIND_RESPONSE.trees") &&
    material.includes("field.strength") &&
    material.includes("field.direction") &&
    material.includes("field.flutter") &&
    material.includes("positionXZ: worldRoot.xz") &&
    material.includes("bakedField: wind.bakedField") &&
    material.includes("originXZ: wind.bakedOriginXZ"),
  "Tree crowns must consume the same spatial wind field and baked-field fallback contract as grass.",
);
assert(
  tuning.includes("TREE_WIND_RESPONSE_VARIATION = 0.1") &&
    !tuning.includes("TREE_WIND_SWAY_METERS") &&
    !tuning.includes("TREE_WIND_PHASE_SPEED") &&
    !tuning.includes("TREE_WIND_SECONDARY_SPEED"),
  "Per-tree phase may vary response but must not reintroduce a second temporal wind model.",
);
assert(
  material.includes("material.alphaHash = true") &&
    material.includes("material.alphaToCoverage = false") &&
    material.includes("material.alphaTestNode = float(alphaTest).mul(lodOpacity)") &&
    !material.includes("material.alphaTest = alphaTest"),
  "Tree cutout alpha must stay independent of LOD opacity so alpha-hash owns the full near/far crossfade.",
);
assert(
  resources.includes("let wood: THREE.InstancedMesh | undefined") &&
    resources.includes("let foliage: THREE.InstancedMesh | undefined") &&
    resources.includes("let far: THREE.InstancedMesh | undefined") &&
    /disposeResources\(\[\s*wood,\s*foliage,\s*far,/.test(resources) &&
    /disposeResources\(\[\s*\.\.\.meshes\.map\(\(mesh\) => \(\{ dispose: \(\) => mesh\.removeFromParent\(\) \}\)\),\s*\.\.\.meshes,/.test(resources),
  "Tree rollback and normal teardown must dispose InstancedMesh owners as well as geometry/material resources.",
);
assert(
  tuning.includes("TREE_STREAM_FADE_METERS = 8") &&
    system.includes("this.radius + TREE_REBUILD_STEP") &&
    system.includes("this.radius - TREE_STREAM_FADE_METERS") &&
    system.includes("const streamOpacity = 1 - smoothstep") &&
    system.includes("* streamOpacity") &&
    system.includes("streamOpacity <= TREE_LOD_VISIBLE_THRESHOLD"),
  "Tree streaming must keep a rebuild guard band and fade the visible edge before roster membership changes.",
);
assert(
  system.includes("function movedAtLeast(") &&
    system.includes("return dx * dx + dz * dz >= distance * distance;") &&
    system.includes("this.builtX,") &&
    system.includes("TREE_REBUILD_STEP,") &&
    system.includes("this.publishedX,") &&
    system.includes("TREE_LOD_UPDATE_STEP,") &&
    !system.includes("Math.abs(focus.x - this.builtX)") &&
    !system.includes("Math.abs(focus.z - this.builtZ)"),
  "Tree rebuild and LOD publication thresholds must use radial horizontal distance so diagonal travel cannot outrun the stream guard band.",
);

console.log(
  "[tree-field-safety] Tree bounds, deterministic species, renderer/shade parity, shared wind, LOD alpha, GPU ownership, radial stream continuity, and stream fade verified.",
);
