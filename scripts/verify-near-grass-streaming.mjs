import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[near-grass-streaming] ${message}`);
  }
}

const server = await createServer({
  configFile: false,
  root: REPOSITORY_ROOT,
  appType: "custom",
  logLevel: "silent",
  server: {
    middlewareMode: true,
    watch: null,
  },
  optimizeDeps: { noDiscovery: true },
});

try {
  const limits = await server.ssrLoadModule(
    "/src/world/grass/NearGrassStreamingLimits.ts",
  );
  const { MAX_NEAR_GRASS_TILE_RADIUS, resolveNearGrassTileRadius } = limits;

  assert(
    resolveNearGrassTileRadius(40, 8) === 5,
    "The shipped-scale 40 m / 8 m residency must resolve to five tile radii.",
  );
  assert(
    resolveNearGrassTileRadius(MAX_NEAR_GRASS_TILE_RADIUS * 2, 2) ===
      MAX_NEAR_GRASS_TILE_RADIUS,
    "The exact residency ceiling must remain accepted.",
  );

  for (const [radius, tileSize, label] of [
    [(MAX_NEAR_GRASS_TILE_RADIUS + 1) * 2, 2, "over-ceiling radius"],
    [Number.NaN, 8, "NaN radius"],
    [40, 0, "zero tile size"],
  ]) {
    let rejected = false;
    try {
      resolveNearGrassTileRadius(radius, tileSize);
    } catch {
      rejected = true;
    }
    assert(rejected, `${label} must be rejected before a residency scan.`);
  }

  const field = readFileSync(
    resolve(REPOSITORY_ROOT, "src/world/grass/WorldSingleBladeTileField.ts"),
    "utf8",
  );
  assert(
    field.includes("resolveNearGrassTileRadius(options.visibilityRadius, tileSize)") &&
      field.includes("resolveNearGrassTileRadius(radius, this.tileSize)") &&
      /private reconcile\(focus: THREE\.Vector3\): void \{[\s\S]*?const offset = resolveNearGrassTileRadius\(/.test(
        field,
      ) &&
      field.includes("!Number.isFinite(focus.x)") &&
      field.includes("!Number.isFinite(focus.z)"),
    "The field must enforce the ceiling at construction, retuning, and reconciliation while rejecting invalid focus coordinates.",
  );

  console.log(
    `[near-grass-streaming] Radius capped at ${MAX_NEAR_GRASS_TILE_RADIUS} tiles with non-finite focus rejection.`,
  );
} finally {
  await server.close();
}
