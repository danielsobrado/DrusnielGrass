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
    throw new Error(`[impostor-lifecycle] ${message}`);
  }
}

const source = read("src/world/grass/WorldGrassImpostorAtlasFactory.ts");

assert(
  source.includes('import { disposeResources } from "../../render/ResourceDisposal"') &&
    source.includes("let texture: THREE.CanvasTexture | undefined") &&
    source.includes("let geometry: THREE.BufferGeometry | undefined") &&
    source.includes("disposeResources([geometry, texture])") &&
    source.includes("Grass impostor atlas cleanup failed."),
  "Atlas creation must release texture/geometry ownership when publication fails.",
);

assert(
  /private createGeometry\([\s\S]*?const geometry = new THREE\.BufferGeometry\(\);[\s\S]*?try \{[\s\S]*?geometry\.computeBoundingSphere\(\);[\s\S]*?return geometry;[\s\S]*?\} catch \(error\) \{[\s\S]*?geometry\.dispose\(\);[\s\S]*?throw error;/.test(
    source,
  ),
  "Impostor geometry setup must release a partially initialized BufferGeometry before rethrowing.",
);

console.log(
  "[impostor-lifecycle] Atlas texture and geometry rollback ownership verified.",
);
