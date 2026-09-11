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
    throw new Error(`[grass-geometry-lifecycle] ${message}`);
  }
}

const source = read("src/grass/GrassGeometryFactory.ts");
const patchSource = read("src/world/grass/WorldGrassPatchGeometryFactory.ts");
const detailFieldSource = read("src/world/grass/WorldDetailFoliageField.ts");
const detailMaterialSource = read("src/world/grass/WorldDetailFoliageNodeMaterial.ts");
const detailNodesSource = read("src/world/grass/WorldDetailFoliageNodes.ts");
const artPresets = JSON.parse(read("src/grass/GrassArtPresets.json"));
const trailSource = read("src/grass/interaction/GrassTrailField.ts");
const trailPassSource = read("src/grass/interaction/GrassTrailNodePass.ts");

assert(
  source.includes('import { disposeResources } from "../render/ResourceDisposal"') &&
    /createLodVariants\([\s\S]*?let near: THREE\.BufferGeometry\[\] = \[\];[\s\S]*?let mid: THREE\.BufferGeometry\[\] = \[\];[\s\S]*?try \{[\s\S]*?return \{ near, mid \};[\s\S]*?catch \(error\)[\s\S]*?disposeGrassGeometryResources\(\[\.\.\.near, \.\.\.mid\]/.test(
      source,
    ),
  "LOD variant creation must roll back already completed near/mid geometries when a later variant fails.",
);

assert(
  /createInstancedGeometry\([\s\S]*?const geometry = new THREE\.InstancedBufferGeometry\(\);[\s\S]*?try \{[\s\S]*?return geometry;[\s\S]*?catch \(error\)[\s\S]*?disposeGrassGeometryResources\(\[geometry\], "instanced geometry"\)/.test(
    source,
  ),
  "Instanced geometry setup must release its unpublished geometry on failure.",
);

assert(
  /if \(sharedAttributes\?\.shape\) \{\s*geometry\.setAttribute\("instanceShape", sharedAttributes\.shape\);\s*\}/.test(
    source,
  ) &&
    !source.includes("new Uint8Array(instanceCount * 4).fill(128)"),
  "Shape attributes must only exist on geometry whose material consumes them; non-shape LODs must not allocate a fallback buffer.",
);

assert(
  /private createVariants\([\s\S]*?const variants: THREE\.BufferGeometry\[\] = \[\];[\s\S]*?try \{[\s\S]*?variants\.push\([\s\S]*?return variants;[\s\S]*?catch \(error\)[\s\S]*?disposeGrassGeometryResources\(variants, "partial variant set"\)/.test(
    source,
  ),
  "Variant-set creation must release geometries completed before a later variant fails.",
);

assert(
  /private createClump\([\s\S]*?const geometry = new THREE\.BufferGeometry\(\);[\s\S]*?try \{[\s\S]*?geometry\.computeBoundingSphere\(\);[\s\S]*?return geometry;[\s\S]*?catch \(error\)[\s\S]*?disposeGrassGeometryResources\(\[geometry\], "clump geometry"\)/.test(
    source,
  ),
  "Clump geometry must clean a partially configured BufferGeometry before rethrowing.",
);

assert(
  /disposeInstancedGeometry\([\s\S]*?for \(const name of Object\.keys\(geometry\.attributes\)\)[\s\S]*?geometry\.deleteAttribute\(name\)[\s\S]*?geometry\.setIndex\(null\);[\s\S]*?geometry\.dispose\(\);/.test(
    source,
  ) &&
    /disposeInstancedMesh\([\s\S]*?disposeResources\(\[[\s\S]*?this\.disposeInstancedGeometry\(geometry, preserveSharedInstanceData\)[\s\S]*?preserveSharedInstanceData \? undefined : mesh/.test(
      source,
    ),
  "Instanced geometry must detach borrowed attributes once, while mesh teardown independently attempts geometry and mesh cleanup.",
);

assert(
  patchSource.includes(
    'import { disposeResources } from "../../render/ResourceDisposal"',
  ) &&
    /createLodVariants\([\s\S]*?const mid: THREE\.BufferGeometry\[\] = \[\];[\s\S]*?try \{[\s\S]*?mid\.push\(this\.createGeometry[\s\S]*?return \{[\s\S]*?mid,[\s\S]*?catch \(error\)[\s\S]*?disposePatchGeometries\(mid, "partial patch variants"\)/.test(
      patchSource,
    ),
  "Shared patch-variant creation must release completed mid geometries when a later variant fails.",
);

assert(
  /private createGeometry\([\s\S]*?const geometry = new THREE\.BufferGeometry\(\);[\s\S]*?try \{[\s\S]*?geometry\.computeBoundingSphere\(\);[\s\S]*?return geometry;[\s\S]*?catch \(error\)[\s\S]*?disposePatchGeometries\(\[geometry\], "patch geometry"\)/.test(
    patchSource,
  ),
  "Shared patch geometry must dispose a partially configured BufferGeometry before rethrowing.",
);

assert(
  /const inputs = createGrassNodeUniforms\(values\);[\s\S]*?this\.inputs = inputs;[\s\S]*?try \{[\s\S]*?createGrassFoliageNodes\(inputs,[\s\S]*?catch \(error\) \{[\s\S]*?inputs\.dispose\(\);[\s\S]*?super\.dispose\(\);[\s\S]*?throw error;/.test(
    detailMaterialSource,
  ),
  "Detail-foliage node material construction must release locally owned uniform bindings and the unpublished material before rethrowing.",
);

assert(
  detailMaterialSource.includes("const wind = context.worldWindUniforms();") &&
    detailMaterialSource.includes("speciesWind, wind") &&
    detailNodesSource.includes("createBakedWorldWindNodes") &&
    detailNodesSource.includes("createWorldWindFieldNodes") &&
    detailNodesSource.includes("WORLD_WIND_RESPONSE.billboard") &&
    detailNodesSource.includes("positionXZ: root.xz") &&
    detailNodesSource.includes("field.gust") &&
    detailNodesSource.includes("field.direction") &&
    detailNodesSource.includes("field.flutter") &&
    detailNodesSource.includes("wind.restBendGain"),
  "Production detail foliage must consume the shared cinematic world-wind field and retain the legacy gust path only as its fallback.",
);

const maximumArtWindScale = Math.max(
  ...Object.values(artPresets).map((preset) => preset.windStrengthScale),
);
assert(
  detailNodesSource.includes('const swayLimit = u.number("uWindStrength").mul(WIND_SHEAR_FACTOR).max(0);') &&
    detailNodesSource.includes("displacement.mulAssign(min(float(1), swayLimit.div(max(swayLength, 0.000001))))") &&
    detailFieldSource.includes("const MAXIMUM_ART_WIND_SCALE = 2;") &&
    detailFieldSource.includes("this.grassConfig.wind.strength * DETAIL_FOLIAGE_WIND_SHEAR_FACTOR") &&
    maximumArtWindScale <= 2,
  "Detail-foliage cinematic sway must stay inside the same art-directed wind envelope reserved by its static frustum bounds.",
);

assert(
  /const delta = this\.accumulatedDeltaSeconds;[\s\S]*?const nextCenterX[\s\S]*?backend\.render\(this\.readTarget, writeTarget\)[\s\S]*?this\.previousCenter\.copy\(this\.center\);[\s\S]*?this\.center\.set\(nextCenterX, nextCenterZ\);[\s\S]*?this\.readTarget = writeTarget;[\s\S]*?this\.contactCount = 0;[\s\S]*?this\.accumulatedDeltaSeconds = 0;/.test(
    trailSource,
  ),
  "Trail CPU state and ping-pong publication must commit only after the GPU update succeeds.",
);

assert(
  /catch \(error\) \{[\s\S]*?this\.enabled = false;[\s\S]*?Grass trail rendering unavailable; continuing without trail updates/.test(
    trailSource,
  ),
  "A trail-pass failure must disable only the optional trail updater instead of escaping into the grass frame phase.",
);

assert(
  /catch \(error\) \{\s*try \{\s*disposeResources\(\[material, \.\.\.targets\]\);[\s\S]*?Grass trail node-pass rollback failed[\s\S]*?throw error;/.test(
    trailPassSource,
  ),
  "Trail node-pass construction cleanup must preserve the original construction failure.",
);

console.log(
  "[grass-geometry-lifecycle] Clump, instanced, optional shape, shared patch, bounded detail-foliage material/wind, trail transaction, and variant geometry ownership verified.",
);