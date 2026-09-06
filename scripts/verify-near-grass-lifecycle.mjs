import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const source = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/grass/WorldNearGrassField.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[near-grass-lifecycle] ${message}`);
  }
}

assert(
  source.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
    source.includes("const resources = createNearGrassResources(profile, worldConfig)") &&
    source.includes("function createNearGrassResources(") &&
    source.includes("const created: GrassNearMaterial[] = []") &&
    source.includes("disposeResources(created.map((material) => material.material))") &&
    source.includes("Near grass construction cleanup failed."),
  "Near grass shader materials must be acquired as one rollback transaction.",
);

assert(
  /this\.initialization = this\.initializeInternal\(grassConfig\)\.catch\(\(error\) => \{[\s\S]*?this\.dispose\(\);[\s\S]*?throw error;/.test(
    source,
  ) && source.includes("Near grass initialization cleanup failed."),
  "Failed async near-grass initialization must dispose every resource already published to the field while preserving the original error.",
);

const detailStart = source.indexOf("private createDetailFoliageLayer(");
const detailEnd = source.indexOf("private resolveBaseVisibilityRadius(", detailStart);
const detail = source.slice(detailStart, detailEnd);
assert(
  detailStart >= 0 &&
    detailEnd > detailStart &&
    detail.includes("let atlas: WorldDetailFoliageAtlas | undefined") &&
    detail.includes("let material: WorldDetailFoliageMaterial | undefined") &&
    detail.includes("let factory: WorldDetailFoliageFactory | undefined") &&
    detail.includes("let field: WorldDetailFoliageField | undefined") &&
    detail.indexOf("field.setDensityScale(") <
      detail.indexOf("this.detailFoliageAtlas = atlas") &&
    detail.includes("disposeResources([") &&
    detail.includes("material ? undefined : atlas?.texture") &&
    detail.includes("Detail foliage construction cleanup failed."),
  "Detail foliage atlas, material, factory, and field must publish only after complete construction and roll back local ownership on failure.",
);

const disposeStart = source.indexOf("dispose(): void {");
const initializeStart = source.indexOf("private async initializeInternal(", disposeStart);
const dispose = source.slice(disposeStart, initializeStart);
assert(
  disposeStart >= 0 &&
    initializeStart > disposeStart &&
    dispose.includes("const baseField = this.baseField") &&
    dispose.includes("const detailFoliageMaterial = this.detailFoliageMaterial") &&
    dispose.indexOf("this.baseField = undefined") <
      dispose.indexOf("disposeResources([") &&
    dispose.indexOf("this.detailFoliageMaterial = undefined") <
      dispose.indexOf("disposeResources([") &&
    dispose.includes("this.baseMaterial.material") &&
    dispose.includes("this.bridgeMaterial.material") &&
    dispose.includes("this.baseDetailMaterial.material") &&
    dispose.includes("this.ultraNearMaterial.material"),
  "Near-grass teardown must clear ownership before attempting complete field, factory, and material cleanup.",
);

console.log(
  "[near-grass-lifecycle] Transactional construction, async rollback, detail publication, and teardown ownership verified.",
);
