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
    throw new Error(`[stone-lifecycle] ${message}`);
  }
}

const stones = read("src/world/stones/WorldStoneSystem.ts");

assert(
  stones.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
    stones.includes('disposeStoneResource(progress.result.geometry, "Stale stone batch")'),
  "Completed stale stone builds must release their unpublished geometry.",
);

const commitStart = stones.indexOf("private commitBuild(");
const coarseStart = stones.indexOf("private isCoarseShaderSafe(", commitStart);
const commitSource = stones.slice(commitStart, coarseStart);
const batchPosition = commitSource.indexOf(
  "mesh.position.set(result.originX, result.originY, result.originZ)",
);
const freezeLocalMatrix = commitSource.indexOf("mesh.matrixAutoUpdate = false");
const updateLocalMatrix = commitSource.indexOf("mesh.updateMatrix()");
const publishScene = commitSource.indexOf("sceneAddAndUpdate(this.scene, mesh)");
const publishMap = commitSource.indexOf("this.batches.set(batch.key, batch)");
const retireExisting = commitSource.lastIndexOf("this.removeBatch(existing)");
assert(
  commitStart >= 0 &&
    coarseStart > commitStart &&
    publishScene >= 0 &&
    publishMap > publishScene &&
    retireExisting > publishMap &&
    commitSource.includes("result.geometry") &&
    commitSource.includes("Unpublished stone batch cleanup failed."),
  "Stone replacement must publish the new batch before retiring the previous visible batch and clean failed publication geometry.",
);
assert(
  batchPosition >= 0 &&
    freezeLocalMatrix > batchPosition &&
    updateLocalMatrix > freezeLocalMatrix &&
    publishScene > updateLocalMatrix &&
    !commitSource.includes("mesh.matrixWorldAutoUpdate = false"),
  "Static stone batches must freeze only the local matrix and allow Three.js to publish their translated world matrix.",
);
assert(
  /function sceneAddAndUpdate\(scene: THREE\.Scene, mesh: THREE\.Mesh\): void \{[\s\S]*?scene\.add\(mesh\);[\s\S]*?mesh\.updateMatrixWorld\(true\)/.test(
    stones,
  ),
  "Stone scene publication must update matrixWorld after the mesh is attached.",
);

const disposeStart = stones.indexOf("dispose(): void");
// `createGrainTexture` became a module-level function, so the old
// "private createGrainTexture" boundary no longer exists, indexOf returned -1,
// and the `createTextureStart > disposeStart` guard below failed the build.
// Bound the slice by the next method instead — the real end of dispose().
const createTextureStart = stones.indexOf("private reconcile(): void", disposeStart);
const disposeSource = stones.slice(disposeStart, createTextureStart);
assert(
  disposeStart >= 0 &&
    createTextureStart > disposeStart &&
    disposeSource.includes("const batches = Array.from(this.batches.values())") &&
    disposeSource.includes("this.batches.clear()") &&
    disposeSource.includes("disposeResources([") &&
    disposeSource.includes("this.clearanceRegistration") &&
    disposeSource.includes("this.detailMaterial") &&
    disposeSource.includes("this.coarseMaterial") &&
    disposeSource.includes("this.grainTexture"),
  "Stone teardown must detach state first and attempt every batch, registration, material, and texture cleanup.",
);

assert(
  /private removeBatch\(batch: StoneBatch\): void \{[\s\S]*?disposeResources\(\[[\s\S]*?this\.scene\.remove\(batch\.mesh\)[\s\S]*?batch\.mesh\.geometry/.test(
    stones,
  ),
  "Stone batch removal must attempt geometry disposal even if scene detachment fails.",
);

console.log(
  "[stone-lifecycle] World transforms, stale-result disposal, transactional replacement, and isolated teardown verified.",
);
