import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * Where the meadow meets a walked way.
 *
 * The verge read as a painted polygon, and there were two reasons rather than
 * one. Only the dirt *core* was roughened -- the grass edge around it was a
 * clean offset curve, so a torn patch of earth sat inside a smooth green
 * cut-out. And nothing crossed the boundary at all: blades were rejected the
 * instant the mask reached zero, so grass simply stopped, which is a biological
 * line rather than a worn edge.
 *
 * Both fixes have the same failure mode if they drift -- the ground and the
 * blades disagreeing about where the path is -- so the checks below are mostly
 * about the two layers reading the same field.
 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

/** Transects taken across the path network. */
const TRANSECT_COUNT = 512;
const TRANSECT_SAMPLES = 220;
const TRANSECT_STEP = 0.08;
/**
 * Minimum standard deviation of where the vegetation boundary falls, in metres.
 *
 * A perfectly smooth boundary scores zero. This is the number that says the
 * edge wanders rather than tracing an offset of the path contour.
 */
const MIN_BOUNDARY_WANDER = 0.35;
/**
 * Samples used for the pioneer-share measurement.
 *
 * Large because ways are sparse: 3 m wide at 640 m spacing means well under one
 * per cent of the world is tread, so a grid that comfortably covers the meadow
 * still lands only a few thousand samples on a path.
 */
const PIONEER_SAMPLES = 600_000;
const PATH_PIONEER_SALT = 0x3f;

function fail(message) {
  throw new Error(`[path-verge] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

const server = await createServer({
  configFile: false,
  root: REPOSITORY_ROOT,
  appType: "custom",
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const { WorldConfigLoader } = await server.ssrLoadModule(
    "/src/world/WorldConfigLoader.ts",
  );
  const { TerrainField } = await server.ssrLoadModule(
    "/src/world/TerrainField.ts",
  );
  const { samplePathEdgeNoise, PATH_EDGE_PERIOD } = await server.ssrLoadModule(
    "/src/grass/GrassFieldVariation.ts",
  );
  const { sampleGrassClumpValue } = await server.ssrLoadModule(
    "/src/world/grass/GrassClumpLattice.ts",
  );
  const { TERRAIN_DETAIL_COLOR } = await server.ssrLoadModule(
    "/src/world/TerrainMaterialShader.ts",
  );

  const config = new WorldConfigLoader().parse(read("public/config/world.yaml"));
  const field = new TerrainField(config);

  // --- The vegetation boundary must be more irregular than the mineral one ---
  assert(
    config.pathGrassEdgeRoughness > config.pathEdgeRoughness,
    `pathGrassEdgeRoughness ${config.pathGrassEdgeRoughness} must exceed pathEdgeRoughness ${config.pathEdgeRoughness}.`,
  );

  // --- Both layers must read the same roughness field ---
  //
  // Checked against the generated GLSL rather than the source that builds it,
  // so this proves the shader received the right period and seed rather than
  // that someone wrote the right variable name.
  assert(
    TERRAIN_DETAIL_COLOR.includes(`grassPatchNoise(`) &&
      TERRAIN_DETAIL_COLOR.includes(`${PATH_EDGE_PERIOD.toFixed(1)}`),
    "The terrain shader must roughen its path boundaries with the shared world-space edge field.",
  );
  assert(
    TERRAIN_DETAIL_COLOR.includes("uTerrainPathGrassEdge * terrainEdgeNoise"),
    "The vegetation boundary must be roughened, not only the dirt core.",
  );
  assert(
    !TERRAIN_DETAIL_COLOR.includes("terrainBaseNoise.r - 0.5) * 1.35"),
    "The path edge must no longer be roughened by the 64 m surface-noise channel.",
  );

  // --- The boundary must actually wander ---
  //
  // Measured by walking outward from the middle of a way and recording where
  // the mask crosses a half. A smooth offset curve puts that crossing at the
  // same radius every time; a roughened one does not.
  let crossings = 0;
  let crossingSum = 0;
  let crossingSquareSum = 0;
  // Transects start *on* a way rather than at arbitrary points. Ways are 3 m
  // wide at 640 m spacing, so a randomly placed transect almost never crosses
  // one -- an earlier version of this found 26 crossings from 512 transects and
  // was measuring nothing.
  const treadOrigins = [];
  for (let scan = 0; scan < 900_000 && treadOrigins.length < TRANSECT_COUNT; scan += 1) {
    const x = -1000 + ((scan * 3.11) % 2000);
    const z = -1000 + ((scan * 7.93) % 2000);
    const height = field.sampleHeight(x, z);
    if (field.samplePathGrassMask(x, z, height) <= 0.02) {
      treadOrigins.push({ x, z });
    }
  }
  assert(
    treadOrigins.length >= 64,
    `Only ${treadOrigins.length} tread points found; the world has no paths to measure.`,
  );
  for (let transect = 0; transect < treadOrigins.length; transect += 1) {
    const originX = treadOrigins[transect].x;
    const originZ = treadOrigins[transect].z;
    const angle = (transect * 2.399963) % (Math.PI * 2);
    const stepX = Math.cos(angle) * TRANSECT_STEP;
    const stepZ = Math.sin(angle) * TRANSECT_STEP;
    let previousMask = -1;
    for (let step = 0; step < TRANSECT_SAMPLES; step += 1) {
      const x = originX + stepX * step;
      const z = originZ + stepZ * step;
      const height = field.sampleHeight(x, z);
      const mask = field.samplePathGrassMask(x, z, height);
      if (previousMask >= 0 && previousMask < 0.5 && mask >= 0.5) {
        const radius = step * TRANSECT_STEP;
        crossings += 1;
        crossingSum += radius;
        crossingSquareSum += radius * radius;
      }
      previousMask = mask;
    }
  }
  assert(
    crossings >= 40,
    `Only ${crossings} verge crossings found; the transects are not reaching the path network.`,
  );
  const meanCrossing = crossingSum / crossings;
  const crossingDeviation = Math.sqrt(
    Math.max(0, crossingSquareSum / crossings - meanCrossing * meanCrossing),
  );
  assert(
    crossingDeviation >= MIN_BOUNDARY_WANDER,
    `The vegetation boundary lands within ${crossingDeviation.toFixed(3)} m of the same radius every time; a boundary that does not wander is an offset curve, and it reads as one.`,
  );

  // --- The edge field itself must be zero-mean ---
  //
  // A biased field would move the whole boundary rather than roughen it, which
  // would silently widen or narrow every way in the world.
  {
    let total = 0;
    let count = 0;
    let extreme = 0;
    for (let index = 0; index < 200_000; index += 1) {
      const x = -1000 + ((index * 7.31) % 2000);
      const z = -1000 + ((index * 13.77) % 2000);
      const value = samplePathEdgeNoise(x, z);
      total += value;
      extreme = Math.max(extreme, Math.abs(value));
      count += 1;
    }
    const mean = total / count;
    assert(
      Math.abs(mean) < 0.01,
      `The path edge field means ${mean.toFixed(4)}; a biased roughness moves every boundary rather than roughening it.`,
    );
    assert(
      extreme <= 0.5 + 1e-9,
      `The path edge field reaches ${extreme.toFixed(4)}, outside its declared [-0.5, 0.5].`,
    );
  }

  // --- Pioneers, and the walkable core they must stay out of ---
  {
    let inTread = 0;
    let survivors = 0;
    let coreTotal = 0;
    let deepCoreSurvivors = 0;
    const axis = Math.round(Math.sqrt(PIONEER_SAMPLES));
    for (let iz = 0; iz < axis; iz += 1) {
      for (let ix = 0; ix < axis; ix += 1) {
        const x = -600 + ix * 1.37;
        const z = -600 + iz * 1.37;
        const height = field.sampleHeight(x, z);
        const mask = field.samplePathGrassMask(x, z, height);
        if (mask > 0) {
          continue;
        }
        const core = field.samplePathCoreAmount(x, z, height);
        inTread += 1;
        coreTotal += core;
        // Reproduces the factory's own decision.
        const closing = Math.min(1, Math.max(0, (core - 0.6) / (0.85 - 0.6)));
        const chance =
          config.grassPathPioneerChance *
          (1 - core) *
          (1 - closing * closing * (3 - 2 * closing));
        const roll = sampleGrassClumpValue(
          Math.round(x * 100),
          Math.round(z * 100),
          config.seed,
          PATH_PIONEER_SALT,
        );
        if (roll < chance) {
          survivors += 1;
          if (core > 0.85) {
            deepCoreSurvivors += 1;
          }
        }
      }
    }
    assert(
      inTread > 2500,
      `Only ${inTread} samples landed in a tread; the measurement has no path to measure.`,
    );
    const meanCore = coreTotal / inTread;
    const expected = config.grassPathPioneerChance * (1 - meanCore);
    const measured = survivors / inTread;
    assert(
      Math.abs(measured - expected) <= expected * 0.15 + 0.002,
      `Pioneer share is ${(measured * 100).toFixed(2)}% against an expected ${(expected * 100).toFixed(2)}%.`,
    );
    assert(
      deepCoreSurvivors === 0,
      `${deepCoreSurvivors} pioneers stand in the compacted middle of a way; the tread has to stay walkable.`,
    );
    console.log(
      `[path-verge] tread samples ${inTread}, mean core ${meanCore.toFixed(3)}, pioneers ${(measured * 100).toFixed(2)}%`,
    );
  }

  // --- The factory must carry a selected pioneer through placement ---
  {
    const factory = read("src/world/grass/WorldSingleBladeTileFactory.ts");
    assert(
      factory.includes("PATH_PIONEER_SALT"),
      "Pioneer survival must be decided by a salted world-space hash.",
    );
    assert(
      !/PATH_PIONEER_SALT[\s\S]{0,200}job\.random/.test(factory),
      "Pioneer survival must not be drawn from the job random stream, or the same blades will not survive across a tile rebuild.",
    );
    assert(
      factory.includes("Math.max(pathMask, pioneer)"),
      "A pioneer selected inside the tread must bypass the zero path mask during placement suitability; otherwise every pioneer is rejected before its coverage and morphology are written.",
    );
  }

  console.log(
    `[path-verge] boundary wander ${crossingDeviation.toFixed(3)} m over ${crossings} crossings; shared edge field, pioneer placement and walkable core verified.`,
  );
} finally {
  await server.close();
}
