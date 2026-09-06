import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * Deterministic gates for Tiny Glade-style detail-foliage composition.
 *
 * Repeatability compares two runs directly. Goldens stay unfrozen until visual
 * acceptance; do not paste SHA-256 values here until that review lands.
 *
 * Tile-boundary continuity uses 0.011 because hermite interpolation of unit
 * corners over size S has max |d/dx| = 1.5/S. The clump band then smoothsteps
 * a 0.44-wide interval, so the steepest continuous output is about
 * (1.5 / 0.44) * (1.5 / 2.25) ≈ 2.27 per metre. Over the 0.001 m probe that is
 * ~0.0023, well below 0.011. The bound is analytical, not screenshot-derived.
 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[detail-foliage] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function sha256(parts) {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

function format6(value) {
  return value.toFixed(6);
}

/**
 * Read from the shipped config rather than restated here.
 *
 * These were duplicated as literals and silently went stale: the config had
 * moved to 20 cards/m2 and a 0.34 background suppression while this block still
 * declared 0.35 and 0.58, so every distribution assertion below was validating
 * a field the game had not rendered in a long time -- including the one number
 * that changed by 97x. Deriving them makes that drift impossible instead of
 * merely fixed once.
 */
function readWorldNumber(key) {
  const prefix = `${key}:`;
  for (const line of worldConfigSource.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) {
      continue;
    }
    const value = Number(trimmed.slice(prefix.length).trim());
    if (Number.isFinite(value)) {
      return value;
    }
  }
  throw new Error(`[detail-foliage] world.yaml is missing ${key}.`);
}

const worldConfigSource = read("public/config/world.yaml");
const PRODUCTION_TUNING = {
  density: readWorldNumber("detailFoliageDensity"),
  colonyWorldSize: readWorldNumber("detailFoliageColonyWorldSize"),
  clumpWorldSize: readWorldNumber("detailFoliageClumpWorldSize"),
  colonyStrength: readWorldNumber("detailFoliageColonyStrength"),
  dominantFamilyShare: readWorldNumber("detailFoliageDominantFamilyShare"),
  tintCoherence: readWorldNumber("detailFoliageTintCoherence"),
  quietZoneThreshold: readWorldNumber("detailFoliageQuietZoneThreshold"),
  backgroundSuppression: readWorldNumber("detailFoliageBackgroundSuppression"),
  coreHeightBias: readWorldNumber("detailFoliageCoreHeightBias"),
  maturePhenotypeBias: readWorldNumber("detailFoliageMaturePhenotypeBias"),
  ecologyStrength: readWorldNumber("detailFoliageEcologyStrength"),
  edgeCompanionStrength: readWorldNumber("detailFoliageEdgeCompanionStrength"),
  stoneFringeStrength: readWorldNumber("detailFoliageStoneFringeStrength"),
  pathFringeStrength: readWorldNumber("detailFoliagePathFringeStrength"),
  communityStrength: readWorldNumber("detailFoliageCommunityStrength"),
  grassHeightCoupling: readWorldNumber("detailFoliageGrassHeightCoupling"),
};

const MEADOW_ECOLOGY = {
  moisture: 0.62,
  fertility: 0.72,
  exposure: 0.55,
  disturbance: 0.08,
  rockiness: 0.22,
  shade: 0,
};

const WORLD_SEED = 42017;

const distributionSource = read(
  "src/world/grass/WorldDetailFoliageDistribution.ts",
).replaceAll("\r\n", "\n");
assert(
  !/tileX|tileZ|tileCoordinate/.test(distributionSource) &&
    /sample\(\s*x: number,\s*z: number,/.test(distributionSource) &&
    /return target;/.test(distributionSource) &&
    (distributionSource.match(/return \{/g) || []).length === 1,
  "The distribution sampler must not take tile coordinates or allocate per sample.",
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
    WorldDetailFoliageDistribution,
    createDetailFoliageDistributionSample,
  } = await server.ssrLoadModule(
    "/src/world/grass/WorldDetailFoliageDistribution.ts",
  );
  const {
    resolveDetailFoliageSelection,
    createDetailFoliageSelection,
    scoreDetailFoliageHabitat,
    detailFoliageDominantProbability,
    detailFoliageEffectiveTintCoherence,
    detailFoliageHeightShift,
    detailFoliageMaturity,
    pickDetailFoliageWeightedIndex,
  } = await server.ssrLoadModule("/src/world/grass/DetailFoliageAffinity.ts");
  const {
    DETAIL_FOLIAGE_CANDIDATE_SALT,
    DETAIL_FOLIAGE_DISTRIBUTION_KEEP_CHANNEL_SALT,
    DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT,
    DETAIL_FOLIAGE_CHANNEL_TINT_SALT,
    DETAIL_FOLIAGE_INDIVIDUAL_MATURITY_SALT,
    detailFoliageChannel01,
    detailFoliageHashInt2,
  } = await server.ssrLoadModule("/src/world/grass/DetailFoliageRandom.ts");
  const { normalizeDetailFoliageTuning, detailFoliageTuningEquals } =
    await server.ssrLoadModule("/src/world/grass/DetailFoliageTuning.ts");
  const { GRASS_BIOME_PROFILES } = await server.ssrLoadModule(
    "/src/grass/biome/GrassBiomeProfile.ts",
  );
  const {
    GRASS_ACCENT_SPECIES,
    GRASS_MAX_ACCENT_SPECIES,
    GRASS_MAX_ACCENT_TINTS,
  } =
    await server.ssrLoadModule("/src/grass/biome/GrassAccentSpecies.ts");

  const tuning = normalizeDetailFoliageTuning(PRODUCTION_TUNING);
  const meadow = GRASS_BIOME_PROFILES[0];
  const selection = createDetailFoliageSelection();
  const sample = createDetailFoliageDistributionSample();

  function candidateHash(x, z) {
    return detailFoliageHashInt2(
      Math.round(x * 100),
      Math.round(z * 100),
      (WORLD_SEED ^ DETAIL_FOLIAGE_CANDIDATE_SALT) >>> 0,
    );
  }

  function digestDistribution(instance) {
    const parts = [];
    for (let iz = 0; iz < 64; iz += 1) {
      for (let ix = 0; ix < 64; ix += 1) {
        const x = -128 + ix * 4;
        const z = -128 + iz * 4;
        instance.sample(x, z, sample);
        parts.push(
          [
            format6(sample.colony),
            format6(sample.clump),
            format6(sample.core),
            format6(sample.keepMultiplier),
            format6(sample.familyRoll),
            format6(sample.tintRoll),
            format6(sample.maturityRoll),
          ].join(","),
        );
      }
    }
    return sha256(parts);
  }

  function digestSelection(instance) {
    const parts = [];
    for (let iz = 0; iz < 64; iz += 1) {
      for (let ix = 0; ix < 64; ix += 1) {
        const x = -128 + ix * 4;
        const z = -128 + iz * 4;
        instance.sample(x, z, sample);
        const hash = candidateHash(x, z);
        const keep =
          detailFoliageChannel01(
            hash,
            DETAIL_FOLIAGE_DISTRIBUTION_KEEP_CHANNEL_SALT,
          ) < sample.keepMultiplier;
        if (
          !keep ||
          !resolveDetailFoliageSelection(
            meadow,
            MEADOW_ECOLOGY,
            0.28,
            0,
            0.88,
            0.92,
            0,
            sample,
            hash,
            0,
            tuning,
            selection,
          )
        ) {
          parts.push("0,-1,-1");
          continue;
        }
        parts.push(`1,${selection.speciesIndex},${selection.tintRow}`);
      }
    }
    return sha256(parts);
  }

  const distributionA = new WorldDetailFoliageDistribution(WORLD_SEED, tuning);
  const distributionB = new WorldDetailFoliageDistribution(WORLD_SEED, tuning);
  const distributionDigestA = digestDistribution(distributionA);
  const distributionDigestB = digestDistribution(distributionB);
  assert(
    distributionDigestA === distributionDigestB,
    "Distribution sampling must be repeatable.",
  );

  const selectionDigestA = digestSelection(distributionA);
  const selectionDigestB = digestSelection(distributionB);
  assert(
    selectionDigestA === selectionDigestB,
    "Species/tint selection must be repeatable.",
  );

  const continuousKeys = [
    "colony",
    "clump",
    "core",
    "keepMultiplier",
    "familyRoll",
    "tintRoll",
    "maturityRoll",
  ];
  const epsilon = 0.001;
  const continuityLimit = 0.011;
  const orthogonals = [-64, -32, 0, 32, 64];
  for (let k = -8; k <= 8; k += 1) {
    const boundary = k * 16;
    for (const orthogonal of orthogonals) {
      distributionA.sample(boundary - epsilon, orthogonal, sample);
      const left = { ...sample };
      distributionA.sample(boundary + epsilon, orthogonal, sample);
      for (const key of continuousKeys) {
        assert(
          Math.abs(left[key] - sample[key]) <= continuityLimit,
          `X-boundary ${boundary} ${key} jumped by ${Math.abs(left[key] - sample[key])}.`,
        );
      }
      distributionA.sample(orthogonal, boundary - epsilon, sample);
      const below = { ...sample };
      distributionA.sample(orthogonal, boundary + epsilon, sample);
      for (const key of continuousKeys) {
        assert(
          Math.abs(below[key] - sample[key]) <= continuityLimit,
          `Z-boundary ${boundary} ${key} jumped by ${Math.abs(below[key] - sample[key])}.`,
        );
      }
    }
  }

  for (let iz = 0; iz < 32; iz += 1) {
    for (let ix = 0; ix < 32; ix += 1) {
      distributionA.sample(-80 + ix * 5, -80 + iz * 5, sample);
      for (const key of continuousKeys) {
        assert(
          Number.isFinite(sample[key]) &&
            sample[key] >= 0 &&
            sample[key] <= 1,
          `${key} left the unit interval.`,
        );
      }
    }
  }

  let quietCells = 0;
  let keepSum = 0;
  let keepCount = 0;
  for (let cellZ = 0; cellZ < 32; cellZ += 1) {
    for (let cellX = 0; cellX < 32; cellX += 1) {
      const originX = -128 + cellX * 8;
      const originZ = -128 + cellZ * 8;
      let cellKeep = 0;
      for (let sz = 0; sz < 4; sz += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          distributionA.sample(
            originX + 1 + sx * 2,
            originZ + 1 + sz * 2,
            sample,
          );
          cellKeep += sample.keepMultiplier;
          keepSum += sample.keepMultiplier;
          keepCount += 1;
        }
      }
      if (cellKeep / 16 < 0.55) {
        quietCells += 1;
      }
    }
  }
  const quietRatio = quietCells / 1024;
  const meanKeep = keepSum / keepCount;
  assert(
    quietRatio >= 0.2 && quietRatio <= 0.6,
    `Quiet-cell ratio ${quietRatio.toFixed(3)} is outside 20%–60%.`,
  );
  assert(
    meanKeep >= 0.58 && meanKeep <= 0.82,
    `Mean keepMultiplier ${meanKeep.toFixed(3)} is outside 0.58–0.82.`,
  );

  function collectKept(familyFromMacro) {
    const kept = [];
    for (let z = 0; z < 128; z += 1) {
      for (let x = 0; x < 128; x += 1) {
        distributionA.sample(x, z, sample);
        const hash = candidateHash(x, z);
        if (!familyFromMacro) {
          sample.familyRoll = detailFoliageChannel01(
            hash,
            DETAIL_FOLIAGE_CHANNEL_FAMILY_SALT,
          );
          sample.tintRoll = detailFoliageChannel01(
            hash,
            DETAIL_FOLIAGE_CHANNEL_TINT_SALT,
          );
        }
        if (
          detailFoliageChannel01(
            hash,
            DETAIL_FOLIAGE_DISTRIBUTION_KEEP_CHANNEL_SALT,
          ) >= sample.keepMultiplier
        ) {
          continue;
        }
        if (
          !resolveDetailFoliageSelection(
            meadow,
            MEADOW_ECOLOGY,
            0.28,
            0,
            0.88,
            0.92,
            0,
            sample,
            hash,
            0,
            tuning,
            selection,
          )
        ) {
          continue;
        }
        kept.push({
          x,
          z,
          speciesIndex: selection.speciesIndex,
          tintRow: selection.tintRow,
          category: GRASS_ACCENT_SPECIES[selection.speciesIndex].category,
        });
      }
    }
    return kept;
  }

  function neighborStats(kept) {
    const byKey = new Map();
    for (const item of kept) {
      byKey.set(`${item.x},${item.z}`, item);
    }
    let pairs = 0;
    let sameCategory = 0;
    let sameSpecies = 0;
    let flowerPairs = 0;
    let sameTint = 0;
    for (const item of kept) {
      const neighbors = [
        byKey.get(`${item.x + 1},${item.z}`),
        byKey.get(`${item.x},${item.z + 1}`),
      ];
      for (const neighbor of neighbors) {
        if (!neighbor) {
          continue;
        }
        pairs += 1;
        if (neighbor.category === item.category) {
          sameCategory += 1;
        }
        if (neighbor.speciesIndex === item.speciesIndex) {
          sameSpecies += 1;
        }
        if (item.category === "flower" && neighbor.category === "flower") {
          flowerPairs += 1;
          if (neighbor.tintRow === item.tintRow) {
            sameTint += 1;
          }
        }
      }
    }
    return { pairs, sameCategory, sameSpecies, flowerPairs, sameTint };
  }

  const clustered = collectKept(true);
  const independent = collectKept(false);
  const clusteredStats = neighborStats(clustered);
  const independentStats = neighborStats(independent);
  assert(clusteredStats.pairs > 0, "Family correlation needs neighboring kept samples.");
  const clusteredCategoryRatio =
    clusteredStats.sameCategory / clusteredStats.pairs;
  const independentSpeciesRatio =
    independentStats.sameSpecies / Math.max(1, independentStats.pairs);
  const clusteredSpeciesRatio =
    clusteredStats.sameSpecies / clusteredStats.pairs;
  assert(
    clusteredCategoryRatio >= 0.6,
    `Same-category neighbor ratio ${clusteredCategoryRatio.toFixed(3)} is below 0.60.`,
  );
  assert(
    clusteredSpeciesRatio >= independentSpeciesRatio + 0.1,
    `Clustered same-species ratio ${clusteredSpeciesRatio.toFixed(3)} is not 0.10 above the independent baseline ${independentSpeciesRatio.toFixed(3)}.`,
  );

  assert(
    clusteredStats.flowerPairs >= 100,
    `Tint correlation needs at least 100 flower pairs, found ${clusteredStats.flowerPairs}.`,
  );
  const clusteredTintRatio = clusteredStats.sameTint / clusteredStats.flowerPairs;
  let independentFlowerPairs = independentStats.flowerPairs;
  let independentSameTint = independentStats.sameTint;
  const independentTintRatio =
    independentSameTint / Math.max(1, independentFlowerPairs);
  assert(
    clusteredTintRatio >= 0.65,
    `Same-tint neighbor ratio ${clusteredTintRatio.toFixed(3)} is below 0.65.`,
  );
  assert(
    clusteredTintRatio >= independentTintRatio + 0.12,
    `Clustered same-tint ratio ${clusteredTintRatio.toFixed(3)} is not 0.12 above the independent baseline ${independentTintRatio.toFixed(3)}.`,
  );

  const offTuning = normalizeDetailFoliageTuning({
    ...tuning,
    colonyStrength: 0,
  });
  const offDistribution = new WorldDetailFoliageDistribution(WORLD_SEED, offTuning);
  offDistribution.sample(12.5, -7.25, sample);
  assert(sample.keepMultiplier === 1, "colonyStrength=0 must restore keepMultiplier to 1.");
  assert(
    detailFoliageDominantProbability(sample, offTuning) === 0,
    "colonyStrength=0 must zero dominant-family probability.",
  );
  assert(
    detailFoliageEffectiveTintCoherence(offTuning) === 0,
    "colonyStrength=0 must zero tint coherence.",
  );
  assert(
    detailFoliageHeightShift(sample, offTuning) === 0,
    "colonyStrength=0 must zero core height shift.",
  );
  const hash = candidateHash(12.5, -7.25);
  const individualMaturity = detailFoliageChannel01(
    hash,
    DETAIL_FOLIAGE_INDIVIDUAL_MATURITY_SALT,
  );
  assert(
    Math.abs(detailFoliageMaturity(sample, hash, offTuning) - individualMaturity) <
      1e-12,
    "colonyStrength=0 must use the individual maturity roll only.",
  );

  const fern = GRASS_ACCENT_SPECIES.find((species) => species.key === "fern").index;
  const smallFern = GRASS_ACCENT_SPECIES.find(
    (species) => species.key === "small-fern",
  ).index;
  const broadleaf = GRASS_ACCENT_SPECIES.find(
    (species) => species.key === "broadleaf-rosette",
  ).index;
  const shrub = GRASS_ACCENT_SPECIES.find(
    (species) => species.key === "low-shrub",
  ).index;
  const seedHead = GRASS_ACCENT_SPECIES.find(
    (species) => species.key === "seed-head",
  ).index;
  const daisy = GRASS_ACCENT_SPECIES.find((species) => species.key === "daisy")
    .index;
  assert(
    scoreDetailFoliageHabitat(fern, {
      moisture: 0.85,
      fertility: 0.55,
      exposure: 0.2,
      rockiness: 0.4,
      shade: 0.7,
      disturbance: 0.05,
    }) >
      scoreDetailFoliageHabitat(fern, {
        moisture: 0.2,
        fertility: 0.3,
        exposure: 0.9,
        rockiness: 0.2,
        shade: 0.05,
        disturbance: 0.4,
      }),
    "Ferns must prefer wet sheltered ground.",
  );
  assert(
    scoreDetailFoliageHabitat(smallFern, {
      moisture: 0.75,
      fertility: 0.5,
      exposure: 0.3,
      rockiness: 0.65,
      shade: 0.6,
      disturbance: 0.1,
    }) >
      scoreDetailFoliageHabitat(smallFern, {
        moisture: 0.2,
        fertility: 0.3,
        exposure: 0.8,
        rockiness: 0.1,
        shade: 0.05,
        disturbance: 0.4,
      }),
    "Small ferns must prefer wet rocky ground.",
  );
  assert(
    scoreDetailFoliageHabitat(broadleaf, {
      moisture: 0.75,
      fertility: 0.85,
      exposure: 0.35,
      rockiness: 0.15,
      shade: 0.6,
      disturbance: 0.08,
    }) >
      scoreDetailFoliageHabitat(broadleaf, {
        moisture: 0.2,
        fertility: 0.2,
        exposure: 0.7,
        rockiness: 0.4,
        shade: 0.05,
        disturbance: 0.4,
      }),
    "Broadleaf rosettes must prefer fertile moist ground.",
  );
  assert(
    scoreDetailFoliageHabitat(shrub, {
      moisture: 0.55,
      fertility: 0.65,
      exposure: 0.55,
      rockiness: 0.35,
      shade: 0.34,
      disturbance: 0.05,
    }) >
      scoreDetailFoliageHabitat(shrub, {
        moisture: 0.55,
        fertility: 0.65,
        exposure: 0.55,
        rockiness: 0.35,
        shade: 0.34,
        disturbance: 0.9,
      }),
    "Low shrubs must prefer low disturbance.",
  );
  assert(
    scoreDetailFoliageHabitat(seedHead, {
      moisture: 0.2,
      fertility: 0.3,
      exposure: 0.85,
      rockiness: 0.5,
      shade: 0.05,
      disturbance: 0.25,
    }) >
      scoreDetailFoliageHabitat(seedHead, {
        moisture: 0.8,
        fertility: 0.7,
        exposure: 0.2,
        rockiness: 0.2,
        shade: 0.6,
        disturbance: 0.05,
      }),
    "Seed heads must prefer dry exposed ground.",
  );
  assert(
    scoreDetailFoliageHabitat(daisy, {
      moisture: 0.55,
      fertility: 0.8,
      exposure: 0.7,
      rockiness: 0.2,
      shade: 0.08,
      disturbance: 0.08,
    }) >
      scoreDetailFoliageHabitat(daisy, {
        moisture: 0.3,
        fertility: 0.2,
        exposure: 0.4,
        rockiness: 0.6,
        shade: 0.5,
        disturbance: 0.8,
      }),
    "Daisies must prefer fertile open ground.",
  );

  // Overhead cover has to be decisive on its own. Every other channel is held
  // identical across this pair, so if the two scores come out level then shade
  // is being carried by whatever it correlates with rather than doing any work,
  // and a fern has no reason to sit under a tree rather than beside it.
  const sameGround = {
    moisture: 0.72,
    fertility: 0.7,
    exposure: 0.4,
    rockiness: 0.25,
    disturbance: 0.06,
  };
  assert(
    scoreDetailFoliageHabitat(fern, { ...sameGround, shade: 0.85 }) >
      scoreDetailFoliageHabitat(fern, { ...sameGround, shade: 0 }),
    "On identical ground, a fern must prefer the half of it that has a crown over it.",
  );
  assert(
    scoreDetailFoliageHabitat(daisy, { ...sameGround, shade: 0 }) >
      scoreDetailFoliageHabitat(daisy, { ...sameGround, shade: 0.85 }),
    "On identical ground, a daisy must prefer the half of it that is open to the sky.",
  );

  for (const item of clustered) {
    assert(
      item.speciesIndex >= 0 && item.speciesIndex < GRASS_MAX_ACCENT_SPECIES,
      "Selected speciesIndex must stay inside the species ceiling.",
    );
    assert(
      item.tintRow >= 0 && item.tintRow < GRASS_MAX_ACCENT_TINTS,
      "Selected tintRow must stay inside the tint ceiling.",
    );
    assert(
      meadow.accentSpecies.some((entry) => entry.speciesIndex === item.speciesIndex),
      "Selected species must exist in the active profile.",
    );
    if (item.category !== "flower" && item.category !== "seed") {
      assert(item.tintRow === 0, "Non-flower green forms must use tint row 0.");
    }
  }

  assert(
    pickDetailFoliageWeightedIndex([0.2, 0.3, 0.5], 1) === 2,
    "Weighted pick must fall back to the last positive weight at roll 1.",
  );
  assert(
    pickDetailFoliageWeightedIndex([0, 0, 0], 0.5) === -1,
    "Weighted pick must fail closed when every weight is non-positive.",
  );

  const live = normalizeDetailFoliageTuning({
    ...tuning,
    colonyWorldSize: 6,
    clumpWorldSize: 4,
  });
  assert(
    live.clumpWorldSize <= live.colonyWorldSize * 0.5,
    "Live tuning must clamp clump size to half the colony size.",
  );
  assert(
    detailFoliageTuningEquals(tuning, normalizeDetailFoliageTuning({ ...tuning })),
    "Equal normalized tuning must compare equal.",
  );

  console.log(
    `[detail-foliage] Distribution ${distributionDigestA.slice(0, 12)} selection ${selectionDigestA.slice(0, 12)} quiet ${quietRatio.toFixed(3)} keep ${meanKeep.toFixed(3)} family ${clusteredCategoryRatio.toFixed(3)} tint ${clusteredTintRatio.toFixed(3)}.`,
  );
} finally {
  await server.close();
}
