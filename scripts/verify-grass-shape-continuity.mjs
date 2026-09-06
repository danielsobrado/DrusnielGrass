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
    throw new Error(`[grass-shape] ${message}`);
  }
}

const grassConfig = read("public/config/grass.yaml");
const legacyFactory = read("src/grass/GrassGeometryFactory.ts");
const nearFactory = read("src/world/grass/WorldSingleBladeTileFactory.ts");
const midFactory = read("src/world/grass/WorldGrassPatchGeometryFactory.ts");
const farFactory = read("src/world/grass/WorldGrassImpostorAtlasFactory.ts");

const bladeCurve = Number(
  grassConfig.match(/^bladeCurve:\s*([0-9.]+)$/m)?.[1],
);
assert(Number.isFinite(bladeCurve), "bladeCurve must exist in grass.yaml.");

for (const [label, source] of [
  ["legacy", legacyFactory],
  ["near", nearFactory],
  ["mid", midFactory],
  ["far", farFactory],
]) {
  assert(
    source.includes("resolveGrassBladeArcPoint"),
    `${label} grass must resolve its blade tip from the configured rest arc.`,
  );
}

if (bladeCurve > 0) {
  assert(
    legacyFactory.includes("bladeCurve: config.bladeCurve") &&
      legacyFactory.includes("config.bladeCurve") &&
      !legacyFactory.includes("const centerY = height * progress"),
    "Legacy grass must carry bladeCurve through both LOD variants.",
  );
  assert(
    midFactory.includes("tip.y") &&
      !midFactory.includes("tipX,\n        spec.height * heightScale,\n        tipZ"),
    "Mid grass must use the curved tip's vertical reach, not the old full height.",
  );
  assert(
    farFactory.includes("tip.y") &&
      !farFactory.includes("tipX,\n      blade.height,\n      tipZ"),
    "Far atlas blades must use the curved tip's vertical reach.",
  );
  assert(
    farFactory.includes("calculateGrassBladeCurveReach") &&
      farFactory.includes("maximumBladeLength, grass.bladeCurve"),
    "Far atlas bounds must reserve the configured blade-curve reach.",
  );
}

const curveDirection =
  "const curveX = -Math.sin(spec.facingAngle) * tip.z;";
assert(
  midFactory.includes(curveDirection) &&
    farFactory.includes(
      curveDirection.replaceAll("spec.facingAngle", "blade.facingAngle"),
    ),
  "Mid geometry and the far atlas must bend the rest arc in the same plane direction.",
);
assert(
  legacyFactory.includes("const tipVertex = positions.length / 3") &&
    legacyFactory.includes("indices.push(finalRow, tipVertex, finalRow + 1)") &&
    !legacyFactory.includes("segment <= config.bladeSegments"),
  "Legacy segmented blades must use one apex vertex without a degenerate final triangle.",
);
assert(
  nearFactory.includes("const halfWidth = width * 0.5 * taper"),
  "Near segmented blades must treat bladeWidth as full width.",
);
assert(
  nearFactory.includes("const tipVertex = positions.length / 3") &&
    nearFactory.includes("indices.push(finalRow, tipVertex, finalRow + 1)") &&
    !nearFactory.includes("segment <= segments") &&
    !nearFactory.includes("if (segments === 1)"),
  "Near blades must use one apex topology for every segment count.",
);

console.log(`[grass-shape] LOD shape continuity verified (bladeCurve=${bladeCurve}).`);
