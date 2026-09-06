import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createServer } from "vite";

/**
 * Build gate for the ecological field layer.
 *
 * The claim this layer makes is that vegetation, soil, and stone are
 * consequences of shared causes rather than independent scatter. That claim is
 * only worth anything if the causes behave like causes, so the checks here are
 * about relationships between places — a ridge against a hollow, a sunny face
 * against a shaded one — not about absolute values, which are art direction and
 * are free to move.
 */
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function fail(message) {
  throw new Error(`[ecology] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
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
  const { WorldConfigLoader } = await server.ssrLoadModule(
    "/src/world/WorldConfigLoader.ts",
  );
  const { TerrainField } = await server.ssrLoadModule(
    "/src/world/TerrainField.ts",
  );
  const { WorldEcologyField, createEcologySample } = await server.ssrLoadModule(
    "/src/world/ecology/WorldEcologyField.ts",
  );
  const { createHydrologySample } = await server.ssrLoadModule(
    "/src/world/hydrology/HydrologyField.ts",
  );
  const {
    GRASS_CLUSTER_SHORT_DRY,
    GRASS_CLUSTER_SPARSE_OPEN,
    createGrassHabitatSample,
    resolveGrassClusterArchetype,
    sampleGrassHabitat,
  } = await server.ssrLoadModule("/src/world/grass/GrassHabitatField.ts");
  const { NEUTRAL_COMMUNITY_RESPONSE: NEUTRAL_COMMUNITY } =
    await server.ssrLoadModule(
      "/src/world/ecology/WorldCommunityProfiles.ts",
    );

  const configSource = readFileSync(
    resolve(REPOSITORY_ROOT, "public/config/world.yaml"),
    "utf8",
  );
  const config = new WorldConfigLoader().parse(configSource);
  const field = new TerrainField(config);
  const ecologyField = new WorldEcologyField(config);

  const dry = createHydrologySample();
  const sample = createEcologySample();

  /**
   * Builds the landform the field expects. Slope is derived from the gradient
   * the same way the real lattice derives it, so a test case cannot describe a
   * shape the world could never produce.
   */
  function evaluate({
    gradientX = 0,
    gradientZ = 0,
    convexity = 0,
    hydrology = dry,
    path = 1,
    canopy = 0,
    height = config.baseHeight,
  }) {
    const gradient = Math.hypot(gradientX, gradientZ);
    const landform = {
      convexity,
      slope: 1 - 1 / Math.sqrt(1 + gradient * gradient),
      gradientX,
      gradientZ,
    };
    return {
      ...ecologyField.sample(height, landform, hydrology, path, canopy, sample),
    };
  }

  const STEEP = 1.05;

  // The headline claim: a dry ridge close to water stays drier than a sheltered
  // hollow far from any. Proximity supplies water; slope and convexity refuse
  // to hold it. If this ever inverts, moisture has collapsed back into
  // distance-to-water and the rings it was built to avoid are back.
  const riversideRidge = evaluate({
    gradientX: STEEP,
    convexity: 0.85,
    hydrology: { ...dry, humidityBoost: 0.9, waterProximity: 0.95 },
  });
  const distantHollow = evaluate({ convexity: -0.85 });
  assert(
    distantHollow.moisture > riversideRidge.moisture,
    `A hollow far from water (${distantHollow.moisture.toFixed(3)}) must stay wetter than a steep convex spur beside it (${riversideRidge.moisture.toFixed(3)}).`,
  );

  // Landform has to matter on its own, with no mapped water anywhere near.
  const hollow = evaluate({ convexity: -1 });
  const spur = evaluate({ convexity: 1 });
  assert(
    hollow.moisture > spur.moisture * 1.35,
    `Curvature barely moves moisture (hollow ${hollow.moisture.toFixed(3)} vs spur ${spur.moisture.toFixed(3)}); the landform term is not doing its job.`,
  );

  // Slope sheds, sun dries.
  assert(
    evaluate({}).moisture > evaluate({ gradientX: STEEP }).moisture,
    "Steep ground must shed water relative to level ground.",
  );
  // The world sun sits toward +X/+Z, so a face tilted to meet it has a
  // gradient falling the other way.
  const sunward = { gradientX: -0.6, gradientZ: -0.4 };
  const leeward = { gradientX: 0.6, gradientZ: 0.4 };
  assert(
    evaluate(leeward).moisture > evaluate(sunward).moisture,
    "A shaded face must hold moisture better than a sun-facing one.",
  );
  assert(
    evaluate(sunward).exposure > evaluate(leeward).exposure,
    "Exposure must follow surface aspect against the world sun.",
  );

  // A crown makes a different habitat, not just a dimmer one. All three of
  // these have to move together or the ground under a tree is merely a cool
  // patch of meadow and the vegetation over it has nothing new to say.
  const openGround = evaluate({});
  const underCrown = evaluate({ canopy: 1 });
  assert(
    underCrown.exposure < openGround.exposure * 0.5,
    `A full crown must take most of the direct sun (${underCrown.exposure.toFixed(3)} against ${openGround.exposure.toFixed(3)} in the open).`,
  );
  assert(
    underCrown.moisture > openGround.moisture &&
      underCrown.fertility > openGround.fertility,
    "Shaded, mulched, litter-fed ground must hold more water and more soil than the open meadow beside it.",
  );
  assert(
    underCrown.shade === 1 && openGround.shade === 0,
    "Shade must report overhead cover exactly, with nothing else folded into it.",
  );

  // Aspect shade and canopy shade must stay distinguishable. If a cool slope
  // came out with the same signature as ground under a tree, the accent layer
  // could not tell a north face from a grove and the whole channel is wasted.
  const coolSlope = evaluate(leeward);
  assert(
    coolSlope.shade === 0,
    "A shaded aspect is open ground: it must not report overhead cover it does not have.",
  );

  // Two crowns over one point may deepen the shade but can never manufacture
  // more sky than there is to block.
  for (const canopy of [0, 0.25, 0.5, 0.75, 1]) {
    const shaded = evaluate({ canopy });
    assert(
      shaded.shade >= 0 && shaded.shade <= 1 && shaded.exposure >= 0,
      `Canopy cover ${canopy} left the field out of range.`,
    );
  }

  // Rock is what is left when cover fails, so cover has to be able to bury it.
  const bareSlope = evaluate({ gradientX: STEEP, convexity: 1 });
  const richFlat = evaluate({ convexity: -1 });
  assert(
    bareSlope.rockiness > richFlat.rockiness,
    `Steep convex ground (${bareSlope.rockiness.toFixed(3)}) must show more stone than deep soil in a hollow (${richFlat.rockiness.toFixed(3)}).`,
  );
  assert(
    richFlat.fertility > bareSlope.fertility,
    "Fertility must accumulate where material comes to rest, not on stripped ground.",
  );

  // Traffic strips soil without pretending to change the weather.
  const walked = evaluate({ path: 0 });
  const untouched = evaluate({ path: 1 });
  assert(
    walked.disturbance === 1 && untouched.disturbance === 0,
    "Disturbance must invert the path grass mask exactly.",
  );
  assert(
    walked.fertility < untouched.fertility &&
      Math.abs(walked.moisture - untouched.moisture) < 1e-9,
    "Trampling must cost soil, not rainfall.",
  );

  // Every channel stays in range across real terrain, and the layer stays a
  // pure function of position: two fields built from the same config must
  // agree everywhere, or LODs sampling it will disagree with each other.
  const second = new TerrainField(config);
  const normal = new THREE.Vector3();
  const otherNormal = new THREE.Vector3();
  const half = config.worldSize * 0.5 - 4;
  let checked = 0;
  let wettest = 0;
  let driest = 1;
  let deepestShade = 0;
  let shadedPoints = 0;
  for (let index = 0; index < 4000; index += 1) {
    const x = ((index * 613.7) % (half * 2)) - half;
    const z = ((index * 271.3) % (half * 2)) - half;
    const height = field.sampleHeight(x, z);
    field.sampleNormal(x, z, normal);
    const value = field.sampleEcologyAt(x, z, height);
    for (const [name, channel] of Object.entries(value)) {
      assert(
        Number.isFinite(channel) && channel >= 0 && channel <= 1,
        `Ecology channel ${name} left [0, 1] at ${x.toFixed(0)}, ${z.toFixed(0)}: ${channel}.`,
      );
    }
    wettest = Math.max(wettest, value.moisture);
    driest = Math.min(driest, value.moisture);
    deepestShade = Math.max(deepestShade, value.shade);
    if (value.shade > 0.05) {
      shadedPoints += 1;
    }

    const otherHeight = second.sampleHeight(x, z);
    second.sampleNormal(x, z, otherNormal);
    const repeat = second.sampleEcologyAt(x, z, otherHeight);
    for (const name of Object.keys(value)) {
      assert(
        Math.abs(repeat[name] - value[name]) <= 1e-12,
        `Ecology is not deterministic across field instances for ${name} at ${x.toFixed(0)}, ${z.toFixed(0)}.`,
      );
    }
    checked += 1;
  }

  // A field that never varies is a field nobody can see. Guard the spread so a
  // future tuning pass cannot flatten the world back to uniform mush.
  assert(
    wettest - driest > 0.35,
    `Moisture spans only ${(wettest - driest).toFixed(3)} across the world; the ecology has flattened out.`,
  );

  // Shade has to actually happen, and has to stay rare. A field that never
  // reports cover means the crowns and the ecology have quietly stopped talking
  // — the exact failure this layer was added to end — while cover everywhere
  // would mean the footprints have grown past the trees casting them.
  assert(
    deepestShade > 0.5,
    `No point in the world sampled meaningful canopy cover (deepest ${deepestShade.toFixed(3)}); the crown source and the ecology have come apart.`,
  );
  const shadedShare = shadedPoints / checked;
  assert(
    shadedShare > 0.0004 && shadedShare < 0.25,
    // The floor is deliberately far below the measured share. This guards
    // against the crowns disconnecting entirely, not against the tree lattice
    // being thinned — how many trees the meadow carries is art direction, and
    // a gate that pinned it would turn every density pass into a test failure.
    `Canopy cover reaches ${(shadedShare * 100).toFixed(2)}% of the world; a sparse tree lattice must shade a small minority of it, but not none of it.`,
  );

  // Curvature must stay a landform reading, not micro-noise. Its lattice cache
  // is a speed device only, so an uncached read has to match a cached one.
  const fresh = new TerrainField(config);
  let worstCurvature = 0;
  for (let index = 0; index < 500; index += 1) {
    const x = ((index * 97.3) % 800) - 400;
    const z = ((index * 43.1) % 800) - 400;
    worstCurvature = Math.max(
      worstCurvature,
      Math.abs(fresh.sampleCurvature(x, z) - field.sampleCurvature(x, z)),
    );
  }
  assert(
    worstCurvature <= 1e-12,
    `Curvature depends on cache state; worst disagreement ${worstCurvature}.`,
  );

  const habitat = createGrassHabitatSample();
  const healthy = {
    moisture: 0.82,
    fertility: 0.74,
    exposure: 0.4,
    disturbance: 0.05,
    rockiness: 0.04,
    shade: 0,
  };
  sampleGrassHabitat(12, -8, healthy, 1, 0, 0.9, 1.12, 0, 0.2, NEUTRAL_COMMUNITY, config, habitat);
  const healthyDensity = habitat.density;
  const healthyHeight = habitat.height;
  for (const name of Object.keys(habitat)) {
    assert(
      Number.isFinite(habitat[name]) && habitat[name] >= 0,
      `Habitat ${name} must be finite and non-negative.`,
    );
  }
  sampleGrassHabitat(
    12,
    -8,
    { ...healthy, moisture: 0.12, fertility: 0.28 },
    1,
    0,
    0.9,
    1.12,
    0.2,
    0.2,
    NEUTRAL_COMMUNITY,
    config,
    habitat,
  );
  assert(
    habitat.density <= healthyDensity * 0.85 &&
      habitat.height <= healthyHeight + 1e-9 &&
      habitat.dryness > 0.35,
    "Dry ground must not grow denser or taller than the equivalent healthy sample.",
  );
  sampleGrassHabitat(
    12,
    -8,
    { ...healthy, rockiness: 0.86 },
    1,
    0,
    0.9,
    1.12,
    0,
    0.2,
    NEUTRAL_COMMUNITY,
    config,
    habitat,
  );
  assert(
    habitat.density <= healthyDensity * 0.55,
    "Rocky ground must not grow denser than the equivalent healthy sample.",
  );
  sampleGrassHabitat(
    12,
    -8,
    { ...healthy, disturbance: 0.92 },
    1,
    0,
    0.9,
    1.12,
    0,
    0.2,
    NEUTRAL_COMMUNITY,
    config,
    habitat,
  );
  assert(
    habitat.density <= healthyDensity + 1e-9,
    "Disturbed ground must not grow denser than the equivalent healthy sample.",
  );
  sampleGrassHabitat(12, -8, healthy, 1, 0, 0.9, 1.12, 0, 0.2, NEUTRAL_COMMUNITY, config, habitat);
  const firstArchetype = resolveGrassClusterArchetype(habitat, 0, 4, 9, config);
  const secondArchetype = resolveGrassClusterArchetype(habitat, 0, 4, 9, config);
  assert(
    firstArchetype === secondArchetype &&
      firstArchetype >= 0 &&
      firstArchetype <= 5,
    "Cluster archetypes must be stable for the same clump cell.",
  );

  const normalLowDensityBiome = createGrassHabitatSample();
  normalLowDensityBiome.density = 0.42;
  normalLowDensityBiome.densityRetention = 1;
  const normalLowDensityArchetype = resolveGrassClusterArchetype(
    normalLowDensityBiome,
    0,
    4,
    9,
    config,
  );
  assert(
    normalLowDensityArchetype !== GRASS_CLUSTER_SPARSE_OPEN,
    "A normal low-density biome must not become sparse solely because its baseline density is below meadow density.",
  );

  normalLowDensityBiome.density = 0.2;
  normalLowDensityBiome.densityRetention = 0.2 / 0.42;
  const degradedLowDensityArchetype = resolveGrassClusterArchetype(
    normalLowDensityBiome,
    0,
    4,
    9,
    config,
  );
  assert(
    degradedLowDensityArchetype === GRASS_CLUSTER_SPARSE_OPEN,
    "A genuinely degraded low-density biome must retain the sparse-open archetype.",
  );
  normalLowDensityBiome.height = 0.8;
  normalLowDensityBiome.dryness = 0.8;
  const degradedDryBiomeArchetype = resolveGrassClusterArchetype(
    normalLowDensityBiome,
    0,
    4,
    9,
    config,
  );
  assert(
    degradedDryBiomeArchetype === GRASS_CLUSTER_SHORT_DRY,
    "Naturally dry, short habitat must retain short-dry morphology before sparse-open fallback.",
  );

  const climateFloor = 0.62;
  const lowDensityBiome = 0.42;
  const harshClimate = {
    moisture: 0,
    fertility: 0,
    exposure: 1,
    disturbance: 0,
    rockiness: 0,
    shade: 0,
  };
  sampleGrassHabitat(
    12,
    -8,
    harshClimate,
    lowDensityBiome,
    climateFloor,
    0.72,
    0.94,
    0.48,
    0.6,
    NEUTRAL_COMMUNITY,
    config,
    habitat,
  );
  assert(
    habitat.density + 1e-9 >= lowDensityBiome * climateFloor,
    "Climate and macro variation must retain the biome-level density floor.",
  );
  const climateOnlyDensity = habitat.density;
  sampleGrassHabitat(
    12,
    -8,
    { ...harshClimate, rockiness: 0.9 },
    lowDensityBiome,
    climateFloor,
    0.72,
    0.94,
    0.48,
    0.6,
    NEUTRAL_COMMUNITY,
    config,
    habitat,
  );
  assert(
    habitat.density < climateOnlyDensity,
    "Rockiness must reduce density after the climate-retention floor.",
  );
  sampleGrassHabitat(
    12,
    -8,
    { ...harshClimate, disturbance: 0.9 },
    lowDensityBiome,
    climateFloor,
    0.72,
    0.94,
    0.48,
    0.6,
    NEUTRAL_COMMUNITY,
    config,
    habitat,
  );
  assert(
    habitat.density < climateOnlyDensity,
    "Disturbance must reduce density after the climate-retention floor.",
  );

  console.log(
    `[ecology] OK · ${checked} points in range and deterministic · moisture spans ${(wettest - driest).toFixed(2)} · canopy shades ${(shadedShare * 100).toFixed(2)}% of sampled ground · landform outranks water proximity · curvature cache is transparent`,
  );
} catch (error) {
  console.error(`[ecology] ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await server.close();
}
