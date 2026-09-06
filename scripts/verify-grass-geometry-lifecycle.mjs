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

console.log(
  "[grass-geometry-lifecycle] Clump, instanced, optional shape, shared patch, and variant geometry ownership verified.",
);