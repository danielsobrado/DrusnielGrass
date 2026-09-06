import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EPSILON = 1e-6;
const WATER_INTERACTION_RESOLVER_MAX_LINES = 100;

function assert(condition, message) {
  if (!condition) throw new Error(`[water-flow] ${message}`);
}

function assertClose(actual, expected, message) {
  assert(
    Math.abs(actual - expected) <= EPSILON,
    `${message} Expected ${expected}, received ${actual}.`,
  );
}

const terrainChunkSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/TerrainChunk.ts"),
  "utf8",
);
const waterGeometrySource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/hydrology/WaterChunkGeometry.ts"),
  "utf8",
);
const interactionResolverSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/hydrology/WaterChunkInteractionResolver.ts"),
  "utf8",
);
const waterMaterialSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/world/hydrology/WaterMaterialController.ts"),
  "utf8",
);
assert(
  terrainChunkSource.includes("WATER_INTERACTION_STAGE") &&
    terrainChunkSource.includes("advanceWaterInteractions(deadline)") &&
    waterGeometrySource.includes("advanceInteractions(deadline") &&
    interactionResolverSource.includes("performance.now() < deadline") &&
    !waterGeometrySource.includes("resolveFlowAndInteractions"),
  "Stone wakes must remain a frame-budgeted terrain-build stage rather than finalize-time work.",
);
assert(
  interactionResolverSource.split(/\r?\n/).length <=
      WATER_INTERACTION_RESOLVER_MAX_LINES &&
    interactionResolverSource.includes("resolveDownhillWaterFlow") &&
    interactionResolverSource.includes("interactionField.sample") &&
    !interactionResolverSource.includes("BufferGeometry") &&
    !interactionResolverSource.includes("MeshPhysicalMaterial"),
  "Water interaction resolution must stay small and independent from geometry/material ownership.",
);
assert(
  interactionResolverSource.includes("this.data[dataOffset + 2] = this.flow.flowX") &&
    interactionResolverSource.includes("this.data[dataOffset + 3] = this.flow.flowZ"),
  "The settled downhill tangent must be packed per vertex so it interpolates instead of being decided per triangle.",
);
assert(
  waterGeometrySource.includes("resolveWaterSurfaceGradient"),
  "The water sheet must carry real per-vertex normals rather than a flat-up placeholder.",
);
assert(
  waterMaterialSource.includes("side: THREE.DoubleSide") &&
    waterMaterialSource.includes("this.material.forceSinglePass = true"),
  "The open double-sided water sheet must remain single-pass to avoid duplicate transparent draws.",
);

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
  const {
    createWaterFlowSample,
    createWaterSurfaceGradient,
    resolveDownhillWaterFlow,
    resolveWaterSurfaceGradient,
  } = await server.ssrLoadModule(
    "/src/world/hydrology/WaterFlowDirection.ts",
  );

  const resolution = 3;
  const positions = new Float32Array(resolution * resolution * 3);
  const data = new Float32Array(resolution * resolution * 4);
  const coverage = 0.8;

  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = z * resolution + x;
      const positionOffset = index * 3;
      const dataOffset = index * 4;
      positions[positionOffset] = x;
      positions[positionOffset + 1] = -x;
      positions[positionOffset + 2] = z;
      data[dataOffset] = 1;
      data[dataOffset + 1] = 1;
      data[dataOffset + 2] = -coverage;
      data[dataOffset + 3] = 0;
    }
  }

  const center = 4;
  const flow = createWaterFlowSample();
  resolveDownhillWaterFlow(center, resolution, positions, data, flow);
  assertClose(flow.riverCoverage, coverage, "River coverage must be preserved.");
  assertClose(flow.flowX, 1, "Uphill source flow must resolve downhill for CPU wakes.");
  assertClose(flow.flowZ, 0, "Flow must stay on the river tangent.");
  assertClose(
    data[center * 4 + 2],
    -coverage,
    "CPU correction must not flip packed vertex flow before interpolation.",
  );

  data[center * 4 + 2] = coverage;
  resolveDownhillWaterFlow(center, resolution, positions, data, flow);
  assertClose(flow.flowX, 1, "Already-downhill flow must remain unchanged.");
  assertClose(
    data[center * 4 + 2],
    coverage,
    "Already-downhill packed flow must remain unchanged.",
  );

  // A dry vertex stores the bank it sits on, not a water surface. If that height
  // joins the slope, a steep bank outvotes the river's own fall and sends the
  // stone wakes upstream. Here the left neighbour is dry land far below the
  // water, while the water itself descends towards +x.
  const bankPositions = new Float32Array(resolution * resolution * 3);
  const bankData = new Float32Array(resolution * resolution * 4);
  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = z * resolution + x;
      const positionOffset = index * 3;
      const dataOffset = index * 4;
      const dry = x === 0;
      bankPositions[positionOffset] = x;
      bankPositions[positionOffset + 1] = dry ? -10 : -0.5 * x;
      bankPositions[positionOffset + 2] = z;
      bankData[dataOffset] = dry ? 0 : 1;
      bankData[dataOffset + 1] = 1;
      bankData[dataOffset + 2] = dry ? 0 : coverage;
      bankData[dataOffset + 3] = 0;
    }
  }

  resolveDownhillWaterFlow(center, resolution, bankPositions, bankData, flow);
  assertClose(
    flow.flowX,
    1,
    "A dry bank must not outvote the water surface when resolving downstream flow.",
  );
  assertClose(flow.flowZ, 0, "A dry bank must not tilt flow off the river tangent.");

  // The same slope drives the vertex normals, so a mis-read bank would tilt the
  // shading of the whole shore quad rather than just its wake direction.
  const gradient = createWaterSurfaceGradient();
  resolveWaterSurfaceGradient(center, resolution, positions, data, gradient);
  assertClose(gradient.gradientX, -1, "The water surface must fall along its own slope.");
  assertClose(gradient.gradientZ, 0, "A river running along x must read level across z.");

  resolveWaterSurfaceGradient(center, resolution, bankPositions, bankData, gradient);
  assertClose(
    gradient.gradientX,
    -0.5,
    "A dry bank must not tilt the water normals it merely borders.",
  );
  assertClose(gradient.gradientZ, 0, "A level river must shade level across z.");

  const waterShaderSource = readFileSync(
    resolve(REPOSITORY_ROOT, "src/world/hydrology/WaterShader.ts"),
    "utf8",
  );
  assert(
    waterShaderSource.includes("waterLocalFlowSpeed") &&
      waterShaderSource.includes("waterRiverFrequencyScale") &&
      waterShaderSource.includes("uWaterRiverPoolFlowScale") &&
      waterShaderSource.includes("mix(uWaterFlowSpeed * 0.2, waterLocalFlowSpeed, waterRiverAmount)"),
    "River visual flow must scale from existing coverage/depth rather than a new GPU channel.",
  );

  console.log(
    "[water-flow] Downhill CPU wakes, coherent packed flow, budgeted interactions, and single-pass water verified.",
  );
} finally {
  await server.close();
}
