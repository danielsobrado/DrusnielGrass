import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EPSILON = 1e-6;

function assert(condition, message) {
  if (!condition) throw new Error(`[terrain-lattice] ${message}`);
}

function assertClose(actual, expected, message) {
  assert(
    Math.abs(actual - expected) <= EPSILON,
    `${message} Expected ${expected}, received ${actual}.`,
  );
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
  const { TerrainHeightLattice } = await server.ssrLoadModule(
    "/src/world/TerrainHeightLattice.ts",
  );
  const field = {
    sampleHeight(x, z) {
      return x + z * 2;
    },
  };
  const lattice = new TerrainHeightLattice();
  lattice.build(field, 10, 20, 2, 1);

  assertClose(lattice.sampleHeight(11.5, 21.5), 54.5, "Interior bilinear sampling must stay exact for a plane.");
  assertClose(lattice.sampleHeight(8, 21), 52, "Samples left of the lattice must clamp to its edge.");
  assertClose(lattice.sampleHeight(14, 21), 54, "Samples right of the lattice must clamp to its edge.");
  assertClose(lattice.sampleHeight(11, 18), 51, "Samples below the lattice must clamp to its edge.");
  assertClose(lattice.sampleHeight(11, 24), 55, "Samples above the lattice must clamp to its edge.");

  console.log("[terrain-lattice] Bilinear interpolation and edge clamping verified.");
} finally {
  await server.close();
}
