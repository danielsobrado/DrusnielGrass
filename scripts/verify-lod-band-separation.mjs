import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * The meadow's most visible defect was a band crossing the hillside, and its
 * cause was not any one fade being wrong. Six unrelated camera-distance
 * schedules -- three on the ground, three in the vegetation -- had all been
 * keyed to the grass preset's near (28 m) and mid (54 m) distances.
 * Individually each was smooth and dithered. Stacked on the same two radii they
 * read as one hard edge that followed the viewer.
 *
 * A blanket rule about pairs of schedules is the wrong gate, in both
 * directions. It would forbid the grass micro-detail fade that all five near
 * and mid layers deliberately share -- giving each its own schedule is what
 * produced an earlier ring at 6-7 m -- while permitting any number of gentle
 * schedules to pile onto one radius. So schedules are classified by what they
 * change, and the rules differ by class.
 *
 * The primary assertion is structural: at any distance, at most one schedule
 * that genuinely changes what is on the ground may be in transition. That is
 * the claim the separation actually makes, and it can be checked without
 * inventing anything.
 *
 * What is deliberately *not* asserted here is absolute frame luminance.
 * Modelling it would mean inventing a contrast between canopy and soil and an
 * opacity for every layer, and a gate that passes because its invented
 * constants were flattering is worse than no gate. Magnitudes belong to the
 * rendered capture diagnostic, which measures the frame rather than predicting
 * it.
 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

/** Window the composite profile is measured over, in metres. */
const PROFILE_WINDOW = 4;
/** Metres between profile samples. */
const PROFILE_STEP = 0.5;
const PROFILE_MIN_DISTANCE = 4;
const PROFILE_MAX_DISTANCE = 200;
/**
 * Narrowest transition a schedule that genuinely changes the field may use.
 * A narrow transition is a step however well the individual cut is dithered,
 * and the one-metre micro-detail fade this work replaced is the proof.
 */
const MIN_ACTIVE_TRANSITION_WIDTH = 10;
/** Samples of the wander field used to marginalise the jitter out. */
const JITTER_SAMPLES = 256;

function fail(message) {
  throw new Error(`[lod-band-separation] ${message}`);
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

function smoothstep(edge0, edge1, value) {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
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
  const { GRASS_ART_DIRECTIONS } = await server.ssrLoadModule(
    "/src/grass/GrassArtDirection.ts",
  );
  const { resolveLodSchedules, resolveMinimumEdgeSeparation } =
    await server.ssrLoadModule("/src/world/grass/WorldLodSchedules.ts");
  const {
    sampleLodBandOffset,
    resolveLodBandJitterMetres,
    LOD_BAND_JITTER_PERIOD,
  } = await server.ssrLoadModule("/src/grass/GrassLodBanding.ts");
  const { GRASS_MACRO_DRYNESS_STRENGTH, ...macroFields } =
    await server.ssrLoadModule("/src/grass/GrassFieldVariation.ts");
  const {
    DETAIL_FOLIAGE_FADE_DISTANCE,
    DETAIL_FOLIAGE_FADE_TRANSITION,
    DETAIL_FOLIAGE_FADE_STAGGER,
  } = await server.ssrLoadModule(
    "/src/world/grass/WorldDetailFoliageField.ts",
  );

  const config = new WorldConfigLoader().parse(
    read("public/config/world.yaml"),
  );

  // Class constants are erased by `const enum`, so mirror them by name rather
  // than importing values that do not exist at runtime.
  const MEAN_ALBEDO = 0;
  const COVERAGE = 1;
  const DETAIL_PRESERVED = 2;

  const resolveScheduleJitter = (schedule) =>
    schedule.worldSpaceJitter
      ? resolveLodBandJitterMetres(
          schedule.start,
          schedule.end,
          config.lodBandJitterRatio,
        )
      : 0;

  const offsets = [];
  for (let index = 0; index < JITTER_SAMPLES; index += 1) {
    // A lattice stride that is not a factor of the wander period, so the sample
    // set spans the field rather than landing repeatedly on the same phase.
    const step = LOD_BAND_JITTER_PERIOD * 0.31;
    offsets.push(sampleLodBandOffset(index * step, index * step * 1.618));
  }

  let checkedDirections = 0;
  for (const direction of Object.values(GRASS_ART_DIRECTIONS)) {
    checkedDirections += 1;
    const schedules = resolveLodSchedules(config, direction);
    assert(
      schedules.length >= 10,
      `The schedule registry looks incomplete for ${direction.key}: ${schedules.length} entries.`,
    );

    for (const schedule of schedules) {
      assert(
        Number.isFinite(schedule.start) && Number.isFinite(schedule.end),
        `${schedule.key} has a non-finite range.`,
      );
      assert(
        schedule.start < schedule.end,
        `${schedule.key} starts at ${schedule.start} and ends at ${schedule.end}.`,
      );
      if (schedule.handoffPartner) {
        const partner = schedules.find(
          (other) => other.key === schedule.handoffPartner,
        );
        assert(
          partner !== undefined,
          `${schedule.key} names a handoff partner ${schedule.handoffPartner} that is not registered.`,
        );
        assert(
          schedule.neutral,
          `${schedule.key} has a handoff partner but is not marked neutral.`,
        );
      }
    }

    // --- Secondary: pairwise separation, only where the composite is blind ---
    for (let a = 0; a < schedules.length; a += 1) {
      for (let b = a + 1; b < schedules.length; b += 1) {
        const first = schedules[a];
        const second = schedules[b];
        if (
          first.scheduleClass === DETAIL_PRESERVED ||
          second.scheduleClass === DETAIL_PRESERVED
        ) {
          // Exempt by design. The grass micro-detail fade is shared across every
          // near and mid layer on purpose; what these owe is a preserved mean,
          // which `verify-terrain-surface` checks against the measured field.
          continue;
        }
        if (first.neutral || second.neutral) {
          // A neutral schedule contributes nothing to the composite, so it
          // cannot stack with anything -- that is what neutral means. The base
          // layer handing its population to the bridge at the same radius the
          // density boost finishes decaying looks like a collision and is not
          // one: only the boost changes what is on the ground there. Whether a
          // schedule's neutrality is real is the composite profile's job, and
          // the rendered capture diagnostic's after that.
          continue;
        }
        const required = resolveMinimumEdgeSeparation(
          first.scheduleClass,
          second.scheduleClass,
        );
        const separation = Math.min(
          Math.abs(first.start - second.start),
          Math.abs(first.start - second.end),
          Math.abs(first.end - second.start),
          Math.abs(first.end - second.end),
        );
        assert(
          separation >= required,
          `${direction.key}: ${first.key} and ${second.key} have edges ${separation.toFixed(1)} m apart, below the ${required} m minimum for their classes.`,
        );
      }
    }

    // --- Primary: nothing that changes the frame may change it at the same
    // radius as anything else that changes the frame ---
    //
    // Deliberately not a model of absolute frame luminance. Building one would
    // mean inventing a contrast between canopy and soil and an opacity for each
    // layer, and a gate that passes because its invented constants were
    // flattering is worse than no gate. What can be asserted without inventing
    // anything is the structural claim the separation actually makes: at any
    // distance, at most one schedule that genuinely changes what is on the
    // ground is in transition. The magnitudes belong to the rendered capture
    // diagnostic, which measures the frame instead of predicting it.
    const active = schedules.filter(
      (schedule) =>
        !schedule.neutral && schedule.scheduleClass !== DETAIL_PRESERVED,
    );

    for (const schedule of active) {
      assert(
        schedule.end - schedule.start >= MIN_ACTIVE_TRANSITION_WIDTH,
        `${direction.key}: ${schedule.key} changes the field over ${(schedule.end - schedule.start).toFixed(1)} m, below the ${MIN_ACTIVE_TRANSITION_WIDTH} m minimum. A narrow transition is a step however well it is dithered.`,
      );
    }

    // Only schedules whose runtime shader uses GrassLodBanding may wander here.
    // Modelling synthetic jitter on raw camera-distance grass schedules would
    // make this gate prove a renderer that does not exist.
    for (const offset of offsets) {
      const intervals = active.map((schedule) => {
        const jitter = resolveScheduleJitter(schedule);
        return {
          key: schedule.key,
          // The boundary moves against a fixed camera distance, so a positive
          // offset pushes the schedule outward.
          start: schedule.start - jitter * offset,
          end: schedule.end - jitter * offset,
        };
      });
      for (let a = 0; a < intervals.length; a += 1) {
        for (let b = a + 1; b < intervals.length; b += 1) {
          const first = intervals[a];
          const second = intervals[b];
          const overlap =
            Math.min(first.end, second.end) - Math.max(first.start, second.start);
          assert(
            overlap <= 0,
            `${direction.key}: ${first.key} and ${second.key} are both in transition over ${overlap.toFixed(1)} m at wander offset ${offset.toFixed(3)}.`,
          );
        }
      }
    }

    // --- Composite coverage must never recover with distance ---
    let previousCoverage = Infinity;
    for (
      let distance = PROFILE_MIN_DISTANCE;
      distance <= PROFILE_MAX_DISTANCE;
      distance += PROFILE_STEP
    ) {
      let total = 0;
      for (const offset of offsets) {
        let surviving = 1;
        for (const schedule of active) {
          if (schedule.scheduleClass !== COVERAGE) {
            continue;
          }
          const jitter = resolveScheduleJitter(schedule);
          surviving *=
            1 - smoothstep(schedule.start, schedule.end, distance + jitter * offset);
        }
        total += surviving;
      }
      const coverage = total / offsets.length;
      assert(
        coverage <= previousCoverage + 1e-9,
        `${direction.key}: composite coverage rises with distance at ${distance.toFixed(1)} m.`,
      );
      previousCoverage = coverage;
    }
  }

  assert(checkedDirections >= 7, "Every shipped art preset must be checked.");

  // --- Runtime/registry wander contract ---
  const nearMaterialSource = read("src/grass/materials/GrassNearMaterial.ts");
  const impostorMaterialSource = read(
    "src/world/grass/WorldGrassImpostorMaterial.ts",
  );
  const detailMaterialSource = read(
    "src/world/grass/WorldDetailFoliageMaterial.ts",
  );
  const terrainMaterialSource = read("src/world/TerrainMaterialShader.ts");
  const referenceDirection = Object.values(GRASS_ART_DIRECTIONS)[0];
  const referenceSchedules = resolveLodSchedules(config, referenceDirection);
  const scheduleByKey = new Map(
    referenceSchedules.map((schedule) => [schedule.key, schedule]),
  );

  assert(
    !nearMaterialSource.includes("GRASS_LOD_BAND_GLSL") &&
      !scheduleByKey.get("near-density-boost")?.worldSpaceJitter,
    "Near grass uses raw camera distance; the schedule registry must not invent wander for it.",
  );
  assert(
    !impostorMaterialSource.includes("GRASS_LOD_BAND_GLSL") &&
      !scheduleByKey.get("far-to-terrain")?.worldSpaceJitter,
    "Far impostors use raw camera distance; the schedule registry must model that exactly.",
  );
  assert(
    detailMaterialSource.includes("GRASS_LOD_BAND_GLSL") &&
      scheduleByKey.get("detail-foliage-fade")?.worldSpaceJitter,
    "Detail foliage uses world-space LOD wander and must be marked accordingly.",
  );
  assert(
    terrainMaterialSource.includes("TERRAIN_MACRO_FIELD_FUNCTIONS") &&
      scheduleByKey.get("terrain-canopy-merge")?.worldSpaceJitter,
    "Terrain LOD schedules use the shared band field and must be marked accordingly.",
  );
  assert(
    detailMaterialSource.includes("float foliageFadeDistance = clamp("),
    "Detail foliage must clamp its staggered shader fade inside the CPU-owned envelope.",
  );

  const nearDensityEnd =
    config.grassNearDensityBoostDistance + config.grassNearDensityBoostTransition;
  const earliestFoliageStart =
    DETAIL_FOLIAGE_FADE_DISTANCE -
    DETAIL_FOLIAGE_FADE_STAGGER * 0.5 -
    DETAIL_FOLIAGE_FADE_TRANSITION;
  assert(
    earliestFoliageStart >= nearDensityEnd,
    `Detail-foliage stagger may begin at ${earliestFoliageStart.toFixed(1)} m, before the near-density transition ends at ${nearDensityEnd.toFixed(1)} m.`,
  );

  // --- The GLSL macro-field mirror must reproduce the CPU fields exactly ---
  //
  // Asserted against the *generated* GLSL rather than the TypeScript that
  // builds it: the source carries template expressions, and checking those
  // would prove only that someone wrote the right variable name, not that the
  // shader received the right number.
  const { TERRAIN_MACRO_FIELD_APPLY, TERRAIN_MACRO_FIELD_FUNCTIONS } =
    await server.ssrLoadModule(
      "/src/world/terrain/TerrainMacroFieldShader.ts",
    );
  const { GRASS_LATTICE_NOISE_GLSL, GRASS_LOD_BAND_GLSL } =
    await server.ssrLoadModule("/src/grass/GrassLodBanding.ts");

  assert(
    GRASS_LATTICE_NOISE_GLSL.includes(
      "uint grassLatticeHash(int x, int z, uint seed)",
    ),
    "The shared lattice-noise mirror must declare the hash the CPU fields use.",
  );
  assert(
    GRASS_LOD_BAND_GLSL.includes("float grassLodBandOffset(vec2 world)"),
    "The band mirror must declare the wander field.",
  );
  // Math.imul is a 32-bit signed multiply and GLSL ES 3.0 uint arithmetic is mod
  // 2^32, so the two agree bit for bit -- but only while the constants do.
  const cpuHashSource = read("src/grass/GrassFieldVariation.ts");
  for (const constant of ["374761393", "668265263", "1274126177"]) {
    assert(
      GRASS_LATTICE_NOISE_GLSL.includes(constant),
      `The GLSL lattice mirror must use the same ${constant} the CPU hash does.`,
    );
    assert(
      cpuHashSource.includes(constant),
      `The CPU hash no longer uses ${constant}; the GLSL mirror is now wrong.`,
    );
  }
  assert(
    GRASS_LATTICE_NOISE_GLSL.includes("0x9e3779b9u"),
    "The GLSL patch noise must salt its second octave the way the CPU one does.",
  );
  assert(
    TERRAIN_MACRO_FIELD_APPLY.includes(GRASS_MACRO_DRYNESS_STRENGTH.toFixed(4)),
    "The per-fragment dryness correction must use the same macro strength the CPU habitat does.",
  );
  assert(
    TERRAIN_MACRO_FIELD_APPLY.includes("vTerrainMacroDryness"),
    "The per-fragment dryness must subtract the vertex term it replaces, or it double-counts.",
  );
  assert(
    TERRAIN_MACRO_FIELD_APPLY.includes("terrainHumidity = saturate("),
    "Per-fragment dryness/vigour replacement must also correct their derived humidity.",
  );
  assert(
    TERRAIN_MACRO_FIELD_FUNCTIONS.includes(
      `${macroFields.DRYNESS_PERIOD.toFixed(1)}`,
    ) &&
      TERRAIN_MACRO_FIELD_FUNCTIONS.includes(
        `${macroFields.VIGOR_PERIOD.toFixed(1)}`,
      ),
    "The per-fragment macro fields must use the same periods the CPU fields do.",
  );
  assert(
    TERRAIN_MACRO_FIELD_FUNCTIONS.includes(`${macroFields.DRYNESS_SEED}u`) &&
      TERRAIN_MACRO_FIELD_FUNCTIONS.includes(`${macroFields.VIGOR_SEED}u`),
    "The per-fragment macro fields must use the same seeds the CPU fields do.",
  );

  // --- The float32 claim the mirror rests on ---
  //
  // GLSL computes `float(hash) / 4294967296.0`, and float32 cannot hold a
  // 32-bit integer exactly above 2^24. The mirror is only bit-exact if that
  // rounding is negligible, which is asserted rather than assumed: simulate the
  // narrowing with Math.fround over the whole hash range and bound the error.
  {
    let worstHashError = 0;
    for (let index = 0; index < 200000; index += 1) {
      const value = Math.floor((index / 200000) * 4294967295);
      const exact = value / 4294967296;
      const narrowed = Math.fround(value) / 4294967296;
      worstHashError = Math.max(worstHashError, Math.abs(exact - narrowed));
    }
    assert(
      worstHashError < 1e-5,
      `Narrowing the lattice hash to float32 costs ${worstHashError.toExponential(2)}, above the 1e-5 the GLSL mirror claims.`,
    );
  }

  // --- The macro texture must resolve the fields it carries ---
  const { TERRAIN_MACRO_FIELD_METRES_PER_TEXEL } = await server.ssrLoadModule(
    "/src/world/terrain/TerrainMacroFieldTexture.ts",
  );
  const shortestMacroPeriod = Math.min(
    macroFields.DRYNESS_PERIOD,
    macroFields.VIGOR_PERIOD,
  );
  assert(
    TERRAIN_MACRO_FIELD_METRES_PER_TEXEL <= shortestMacroPeriod * 0.5,
    `The baked macro field samples every ${TERRAIN_MACRO_FIELD_METRES_PER_TEXEL} m, which cannot resolve a ${shortestMacroPeriod} m field.`,
  );

  // --- The far terrain ring must still resolve what the vertex path carries ---
  const farVertexSpacing =
    config.chunkSize / (config.terrainFarResolution - 1);
  assert(
    farVertexSpacing > shortestMacroPeriod * 0.5,
    "The far terrain ring already resolves the macro fields; the per-fragment path is unnecessary work.",
  );

  console.log(
    `[lod-band-separation] ${checkedDirections} presets: schedules separated, composite response smooth, macro mirror exact.`,
  );
} finally {
  await server.close();
}
