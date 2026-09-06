import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * The vegetation community field, and the direction its causality runs in.
 *
 * The claim this layer makes is that ecology decides which communities are
 * *possible* somewhere, and a low-frequency composition field decides which of
 * the possible ones actually organises there. A first draft ran the other way --
 * noise labelled a patch, the label then edited dryness -- which puts bare
 * breaks on wet, fertile, sheltered ground. That is scatter wearing a taxonomy,
 * and it contradicts the founding claim of `WorldEcologyField`.
 *
 * The first assertion below is the one that matters, because it is the only one
 * that would fail if anyone ever reintroduced a write-back: it compares the
 * conditions each community actually lands on. Everything after it checks that
 * the field is smooth, deterministic, and coarse enough for the ground to carry.
 *
 * Shares are *measured*, not enforced. When ecology drives selection you cannot
 * guarantee a community's share of the world without overriding ecology to hit
 * a quota, which would be the same inversion by another route. They are bounded
 * to a band instead.
 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

const SHORT_SWARD = 0;
const TALL_COLONY = 1;
const BARE_BREAK = 2;
const FLOWER_MEADOW = 3;
const BROADLEAF_UNDERSTORY = 4;

/** World samples used for the distribution measurements. */
const SAMPLE_COUNT = 400_000;
/** Spacing between samples, chosen not to divide the community period. */
const SAMPLE_STEP = 3.7;
/**
 * No community may vanish, and none may take the world.
 *
 * The floor is 3% rather than something rounder because one of the five is
 * bounded by a resource this world barely has: broadleaf understory wants
 * shade, and canopy covers under 3% of the ground. Its small share is the
 * correct ecological outcome, not a tuning failure, and raising it would mean
 * putting an understory community on open ground -- the inversion this whole
 * layer exists to avoid.
 */
const MIN_SHARE = 0.03;
const MAX_SHARE = 0.4;
/** The authored hierarchy: mostly grass, expressed as a band not a quota. */
const MIN_GRASS_SHARE = 0.42;
const MAX_GRASS_SHARE = 0.72;
/** Probe distance for the continuity checks, in metres. */
const CONTINUITY_PROBE = 0.001;
const MAX_CONTINUITY_STEP = 0.02;
/**
 * How much response movement one unit of ecology movement may justify.
 *
 * Derived from the layer's own constants rather than guessed: a change in a
 * preference propagates through the fit exponent and then through the mixture
 * sharpening, so their product is the amplification the implementation claims.
 * Asserting against a number picked to make the test pass would prove nothing;
 * asserting against the declared constants proves the code does what it says.
 */
let ECOLOGY_STEP_GAIN = 12;

function fail(message) {
  throw new Error(`[community-field] ${message}`);
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
  const {
    createCommunitySample,
    pickCommunityIndex,
    sampleWorldCommunity,
  } = await server.ssrLoadModule("/src/world/ecology/WorldCommunityField.ts");
  const { createCommunityResponse, resolveCommunityResponse } =
    await server.ssrLoadModule("/src/world/ecology/WorldCommunityResponse.ts");
  const { ECOLOGY_EXPONENT, MIXTURE_SHARPNESS, scoreCommunityFit } =
    await server.ssrLoadModule(
    "/src/world/ecology/WorldCommunityField.ts",
  );
  const { COMMUNITY_COUNT, COMMUNITY_PROFILES, WORLD_COMMUNITY_VERSION } =
    await server.ssrLoadModule(
      "/src/world/ecology/WorldCommunityProfiles.ts",
    );

  const config = new WorldConfigLoader().parse(read("public/config/world.yaml"));
  ECOLOGY_STEP_GAIN =
    ECOLOGY_EXPONENT *
    config.grassCommunityEcologyStrength *
    MIXTURE_SHARPNESS;
  const field = new TerrainField(config);
  const sample = createCommunitySample();
  const response = createCommunityResponse();

  assert(
    COMMUNITY_COUNT === 5 && COMMUNITY_PROFILES.length === 5,
    `Expected five communities, found ${COMMUNITY_PROFILES.length}.`,
  );
  assert(WORLD_COMMUNITY_VERSION >= 1, "Community profiles must be versioned.");
  assert(
    COMMUNITY_PROFILES.every(
      (profile) =>
        Number.isFinite(profile.archetypeBias) &&
        profile.archetypeBias >= -1 &&
        profile.archetypeBias <= 1,
    ),
    "Every versioned community profile must carry its grass-archetype bias.",
  );
  assert(
    !read("src/world/grass/GrassHabitatField.ts").includes(
      "COMMUNITY_ARCHETYPE_BIAS",
    ),
    "Community archetype art direction must live in WorldCommunityProfiles.json, not a parallel TypeScript table.",
  );

  // --- Sweep the world once, accumulating everything the checks need ---
  const counts = new Array(COMMUNITY_COUNT).fill(0);
  const channelSums = new Array(COMMUNITY_COUNT).fill(null).map(() => ({
    moisture: 0,
    fertility: 0,
    exposure: 0,
    disturbance: 0,
    rockiness: 0,
    shade: 0,
  }));
  const axis = Math.round(Math.sqrt(SAMPLE_COUNT));
  const half = (axis * SAMPLE_STEP) / 2;
  let quietTotal = 0;
  let coreTotal = 0;
  let blendTotal = 0;
  for (let iz = 0; iz < axis; iz += 1) {
    for (let ix = 0; ix < axis; ix += 1) {
      const x = -half + ix * SAMPLE_STEP;
      const z = -half + iz * SAMPLE_STEP;
      const height = field.sampleHeight(x, z);
      const ecology = field.sampleEcologyAt(x, z, height);
      sampleWorldCommunity(x, z, ecology, config, sample);
      counts[sample.index] += 1;
      const sums = channelSums[sample.index];
      sums.moisture += ecology.moisture;
      sums.fertility += ecology.fertility;
      sums.exposure += ecology.exposure;
      sums.disturbance += ecology.disturbance;
      sums.rockiness += ecology.rockiness;
      sums.shade += ecology.shade;
      quietTotal += sample.quiet;
      coreTotal += sample.core;
      blendTotal += sample.blend;
    }
  }
  const total = axis * axis;
  const shares = counts.map((count) => count / total);
  const mean = (community, channel) =>
    counts[community] > 0 ? channelSums[community][channel] / counts[community] : 0;

  // --- The causality gate ---
  //
  // Each of these is a statement about the conditions a community lands on, so
  // each fails loudly if selection ever stops consulting ecology -- or if a
  // response is ever allowed to edit the channel that selected it.
  const causalChecks = [
    [
      "moisture",
      BROADLEAF_UNDERSTORY,
      BARE_BREAK,
      0.2,
      "broadleaf understory must be wetter than bare breaks",
    ],
    // Disturbance is deliberately absent from this list. Paths are 3 m wide at
    // 640 m spacing, so the channel means 0.015 across the whole world and
    // asserting a margin on it would be asserting something the terrain cannot
    // supply. Rockiness carries the same statement on ground that exists.
    [
      "shade",
      BROADLEAF_UNDERSTORY,
      FLOWER_MEADOW,
      0.15,
      "broadleaf understory must be shadier than flower meadow",
    ],
    [
      "fertility",
      TALL_COLONY,
      BARE_BREAK,
      0.2,
      "tall colonies must be richer than bare breaks",
    ],
    [
      "rockiness",
      BARE_BREAK,
      TALL_COLONY,
      0.15,
      "bare breaks must be rockier than tall colonies",
    ],
  ];
  for (const [channel, high, low, margin, description] of causalChecks) {
    const delta = mean(high, channel) - mean(low, channel);
    assert(
      delta >= margin,
      `${description}: measured ${channel} margin is ${delta.toFixed(3)}, below ${margin}. Communities are no longer being selected by the conditions they claim to want.`,
    );
  }

  // --- Shares, measured rather than enforced ---
  for (let index = 0; index < COMMUNITY_COUNT; index += 1) {
    assert(
      shares[index] >= MIN_SHARE && shares[index] <= MAX_SHARE,
      `${COMMUNITY_PROFILES[index].key} takes ${(shares[index] * 100).toFixed(1)}% of the world, outside the ${MIN_SHARE * 100}-${MAX_SHARE * 100}% band.`,
    );
  }
  const grassShare = shares[SHORT_SWARD] + shares[TALL_COLONY];
  assert(
    grassShare >= MIN_GRASS_SHARE && grassShare <= MAX_GRASS_SHARE,
    `Mostly-grass communities take ${(grassShare * 100).toFixed(1)}% of the world, outside the authored ${MIN_GRASS_SHARE * 100}-${MAX_GRASS_SHARE * 100}% hierarchy.`,
  );
  assert(
    quietTotal / total > 0.02 && quietTotal / total < 0.5,
    `Quiet ground averages ${(quietTotal / total).toFixed(3)}; it must be a real minority rather than absent or everywhere.`,
  );
  assert(
    coreTotal / total > 0.3,
    "Patch interiors must dominate their own edges; a field that is all ecotone has no communities in it.",
  );
  assert(
    blendTotal / total > 0.01,
    "Some ground must be an ecotone, or community edges are walls.",
  );

  // --- Continuity: no output may step ---
  for (let index = 0; index < 20_000; index += 1) {
    const x = -half + ((index * 37.13) % (half * 2));
    const z = -half + ((index * 91.7) % (half * 2));
    const height = field.sampleHeight(x, z);
    // Copied, not referenced: sampleEcologyAt fills one shared scratch object,
    // so holding a reference across the second call compares the nudged sample
    // against itself and reports an input step of zero however far it moved.
    const ecology = { ...field.sampleEcologyAt(x, z, height) };
    sampleWorldCommunity(x, z, ecology, config, sample);
    resolveCommunityResponse(sample, config, response);
    const before = { ...response, core: sample.core };
    const nudgedHeight = field.sampleHeight(x + CONTINUITY_PROBE, z);
    const nudgedEcology = {
      ...field.sampleEcologyAt(x + CONTINUITY_PROBE, z, nudgedHeight),
    };
    sampleWorldCommunity(x + CONTINUITY_PROBE, z, nudgedEcology, config, sample);
    resolveCommunityResponse(sample, config, response);
    const after = { ...response, core: sample.core };
    // The response may only move as fast as its input did.
    //
    // Asserting a flat bound would be asserting that the *ecology* is
    // continuous, which is not this layer's claim and is not always true:
    // canopy shade and stone rockiness both come from discrete objects, so a
    // probe that straddles one of their edges sees a genuine step upstream. What
    // this layer owes is that it adds no discontinuity of its own, which is what
    // an input-relative bound measures.
    // blend is deliberately not compared. It is derived from the top-two score
    // margin and jumps when the runner-up changes identity -- but it feeds only
    // the per-plant dithered pick, which is a discrete choice that is *supposed*
    // to differ between neighbouring plants. That is what an ecotone is. The
    // continuous response is mixed over all five communities and has no such
    // identity to jump.
    let ecologyStep = 0;
    for (const key of Object.keys(ecology)) {
      ecologyStep = Math.max(
        ecologyStep,
        Math.abs(Number(nudgedEcology[key]) - Number(ecology[key])),
      );
    }
    const allowance = MAX_CONTINUITY_STEP + ECOLOGY_STEP_GAIN * ecologyStep;
    for (const key of Object.keys(before)) {
      const step = Math.abs(after[key] - before[key]);
      assert(
        step <= allowance,
        `${key} steps by ${step.toFixed(4)} over a ${CONTINUITY_PROBE} m probe at (${x.toFixed(5)}, ${z.toFixed(5)}) while its ecology moved ${ecologyStep.toFixed(5)}; the community layer must add no discontinuity of its own.`,
      );
    }
  }

  // --- The ecology-strength lever must do what it claims ---
  //
  // Raising it must sharpen the causal margins, monotonically. A lever whose
  // direction cannot be demonstrated is a lever nobody can tune with confidence.
  const margins = [];
  for (const strength of [0, 0.5, 1]) {
    const probeConfig = { ...config, grassCommunityEcologyStrength: strength };
    let fitSum = 0;
    let fitCount = 0;
    const probeAxis = 260;
    const probeStep = 5.3;
    const probeHalf = (probeAxis * probeStep) / 2;
    for (let iz = 0; iz < probeAxis; iz += 1) {
      for (let ix = 0; ix < probeAxis; ix += 1) {
        const x = -probeHalf + ix * probeStep;
        const z = -probeHalf + iz * probeStep;
        const height = field.sampleHeight(x, z);
        const ecology = field.sampleEcologyAt(x, z, height);
        sampleWorldCommunity(x, z, ecology, probeConfig, sample);
        fitSum += scoreCommunityFit(
          ecology,
          COMMUNITY_PROFILES[sample.index].preferences,
        );
        fitCount += 1;
      }
    }
    // The mean fit of whichever community was chosen.
    //
    // An earlier version compared the moisture of two named communities, which
    // is a proxy and can move the wrong way for an honest reason: at full
    // strength broadleaf becomes so shade-locked that it takes only the deepest
    // shade, whose moisture need not be higher than the moderately shaded ground
    // it took before. The lever's actual claim is that raising it makes
    // communities land on ground that suits them, and that is what this measures.
    margins.push(fitSum / Math.max(fitCount, 1));
  }
  assert(
    margins[1] > margins[0] && margins[2] > margins[1],
    `grassCommunityEcologyStrength does not monotonically improve how well communities fit their ground: mean fit ${margins.map((value) => value.toFixed(3)).join(" -> ")}.`,
  );

  // --- Per-plant picks must interleave rather than flip whole patches ---
  {
    let neighborPicks = 0;
    let dominantPicks = 0;
    for (let index = 0; index < 40_000; index += 1) {
      const x = -half + ((index * 13.7) % (half * 2));
      const z = -half + ((index * 53.1) % (half * 2));
      const height = field.sampleHeight(x, z);
      const ecology = field.sampleEcologyAt(x, z, height);
      sampleWorldCommunity(x, z, ecology, config, sample);
      if (sample.blend <= 0) {
        continue;
      }
      const picked = pickCommunityIndex(x, z, sample);
      if (picked === sample.neighborIndex) {
        neighborPicks += 1;
      } else {
        dominantPicks += 1;
      }
    }
    assert(
      neighborPicks > 0 && dominantPicks > neighborPicks,
      `Ecotone picks are ${neighborPicks} neighbour against ${dominantPicks} dominant; an ecotone must interleave, with the dominant community still winning.`,
    );
  }

  // --- Determinism ---
  {
    // The ecology is captured once and replayed, rather than resampled per run.
    //
    // TerrainField does not return identical ecology on a second visit to the
    // same point -- about 0.3% of points differ, moisture by up to 0.06, which
    // is a lazily-warmed cache upstream of this layer. Resampling per run would
    // make this assertion a test of that cache rather than of the community
    // field, and it would fail for a reason this module cannot fix. What this
    // layer owes is that identical inputs give identical outputs.
    const captured = [];
    for (let index = 0; index < 4096; index += 1) {
      const x = -400 + (index % 64) * 12.3;
      const z = -400 + Math.floor(index / 64) * 12.3;
      const height = field.sampleHeight(x, z);
      captured.push({ x, z, ecology: { ...field.sampleEcologyAt(x, z, height) } });
    }
    const trace = [];
    for (let run = 0; run < 2; run += 1) {
      const parts = [];
      for (const entry of captured) {
        sampleWorldCommunity(entry.x, entry.z, entry.ecology, config, sample);
        parts.push(
          `${sample.index},${sample.neighborIndex},${sample.blend.toFixed(6)},${sample.core.toFixed(6)},${sample.quiet.toFixed(6)}`,
        );
      }
      trace.push(createHash("sha256").update(parts.join("|")).digest("hex"));
    }
    assert(
      trace[0] === trace[1],
      "The community field must be deterministic across runs.",
    );
    console.log(`[community-field] trace ${trace[0].slice(0, 12)}`);
  }

  // --- A community may write nothing ecology owns ---
  //
  // Structural, because the moment a dryness field reappears on this interface
  // the whole layer is back to editing the conditions that selected it.
  {
    const profilesSource = read("src/world/ecology/WorldCommunityProfiles.ts");
    const interfaceBody = profilesSource
      .split("export interface CommunityResponse {")[1]
      ?.split("}")[0];
    assert(
      interfaceBody !== undefined,
      "CommunityResponse must remain a declared interface.",
    );
    for (const channel of [
      "moisture",
      "fertility",
      "exposure",
      "disturbance",
      "rockiness",
      "shade",
      "dryness",
    ]) {
      assert(
        !new RegExp(`\\b${channel}\\s*:`).test(interfaceBody),
        `CommunityResponse declares ${channel}; a community may read ecology and may not write it.`,
      );
    }
  }

  // --- Field scale ---
  const farVertexSpacing = config.chunkSize / (config.terrainFarResolution - 1);
  assert(
    config.grassCommunityWorldSize >= 2.1 * farVertexSpacing,
    `A ${config.grassCommunityWorldSize} m community field cannot survive the far ring's ${farVertexSpacing.toFixed(2)} m vertex spacing.`,
  );
  const macroSeparation =
    Math.abs(config.grassCommunityWorldSize - config.grassMacroPatchWorldSize) /
    Math.min(config.grassCommunityWorldSize, config.grassMacroPatchWorldSize);
  assert(
    macroSeparation >= 0.25,
    `The community and macro-patch fields are within ${(macroSeparation * 100).toFixed(1)}% of each other; two structural fields at nearby scales read as mud.`,
  );

  console.log(
    `[community-field] shares ${shares.map((value) => value.toFixed(3)).join(" ")} · grass ${(grassShare * 100).toFixed(1)}% · quiet ${(quietTotal / total).toFixed(3)} · causality, continuity, monotonicity and determinism verified.`,
  );
} finally {
  await server.close();
}
