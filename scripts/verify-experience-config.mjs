import assert from "node:assert/strict";
import { createServer } from "vite";

/**
 * The experience config contract, exercised rather than read.
 *
 * Every key here is a budget or a switch that a person can get wrong, and the
 * cost of accepting a wrong one is a system that quietly does nothing. So this
 * loads the real loader and feeds it real documents: a complete one, one
 * missing a key, one with a value outside its range, one with a stale key, and
 * the sample counts multisampling cannot use.
 */
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

const failures = [];
const check = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(new Error(`${name}: ${error.message}`));
  }
};

try {
  const { WorldExperienceConfigLoader } = await server.ssrLoadModule(
    "/src/world/experience/WorldExperienceConfigLoader.ts",
  );
  const {
    WORLD_EXPERIENCE_DEFAULTS,
    WORLD_EXPERIENCE_FLAG_DEFAULTS,
    WORLD_EXPERIENCE_NUMBER_SCHEMA,
    ALLOWED_POST_SAMPLES,
    resolveExperienceBudgets,
  } = await server.ssrLoadModule("/src/world/experience/WorldExperienceConfig.ts");
  const {
    WEATHER_PRESET_IDS, CHARACTER_IDS, GRASS_SILHOUETTE_IDS, QUALITY_IDS,
    resolveCatalogId, DEFAULT_WEATHER_PRESET,
  } = await server.ssrLoadModule("/src/world/experience/WorldExperienceCatalog.ts");

  const loader = new WorldExperienceConfigLoader();
  const keys = [
    ...Object.keys(WORLD_EXPERIENCE_FLAG_DEFAULTS),
    ...Object.keys(WORLD_EXPERIENCE_NUMBER_SCHEMA),
  ];
  const document = (overrides = {}) =>
    keys
      .map((key) => `${key}: ${overrides[key] ?? WORLD_EXPERIENCE_DEFAULTS[key]}`)
      .join("\n");

  await check("a complete document round-trips to the shipped defaults", () => {
    const parsed = loader.parse(document());
    assert.deepEqual({ ...parsed }, { ...WORLD_EXPERIENCE_DEFAULTS });
    assert.ok(Object.isFrozen(parsed), "The parsed config must be frozen.");
  });

  await check("every key is required", () => {
    for (const key of keys) {
      const partial = keys
        .filter((entry) => entry !== key)
        .map((entry) => `${entry}: ${WORLD_EXPERIENCE_DEFAULTS[entry]}`)
        .join("\n");
      assert.throws(() => loader.parse(partial), undefined,
        `Omitting ${key} must fail rather than default.`);
    }
  });

  await check("an unknown key is reported, not ignored", () => {
    assert.throws(() => loader.parse(document() + "\nweatherEnabledd: true"),
      undefined, "A misspelled key must not be silently consumed.");
  });

  await check("flags must be boolean", () => {
    for (const key of Object.keys(WORLD_EXPERIENCE_FLAG_DEFAULTS)) {
      assert.throws(() => loader.parse(document({ [key]: "1" })), undefined,
        `${key} must reject a non-boolean.`);
    }
  });

  await check("numeric bounds are enforced at both ends", () => {
    for (const [key, rule] of Object.entries(WORLD_EXPERIENCE_NUMBER_SCHEMA)) {
      if (rule.maximum !== undefined) {
        assert.throws(() => loader.parse(document({ [key]: rule.maximum + 1 })),
          undefined, `${key} must reject a value above its maximum.`);
      }
      if (rule.minimum !== undefined && rule.minimum > 0) {
        assert.throws(() => loader.parse(document({ [key]: rule.minimum - 1 })),
          undefined, `${key} must reject a value below its minimum.`);
      }
      if (rule.exclusiveMinimum !== undefined) {
        assert.throws(() => loader.parse(document({ [key]: rule.exclusiveMinimum })),
          undefined, `${key} must reject its exclusive minimum.`);
      }
      if (rule.integer) {
        const fractional = (rule.minimum ?? 1) + 0.5;
        assert.throws(() => loader.parse(document({ [key]: fractional })),
          undefined, `${key} must reject a fractional value.`);
      }
      assert.throws(() => loader.parse(document({ [key]: "not-a-number" })),
        undefined, `${key} must reject a non-numeric value.`);
    }
  });

  await check("only real multisample counts are accepted", () => {
    for (const key of ["desktopPostSamples", "compactPostSamples"]) {
      for (const samples of ALLOWED_POST_SAMPLES) {
        assert.doesNotThrow(() => loader.parse(document({ [key]: samples })),
          `${key} must accept ${samples}.`);
      }
      // In range and still impossible: this is the case a bounds check misses.
      for (const samples of [1, 3]) {
        assert.throws(() => loader.parse(document({ [key]: samples })), undefined,
          `${key} must reject ${samples}, which multisampling cannot use.`);
      }
    }
  });

  await check("the authoring grid is pinned while documents depend on it", () => {
    for (const [key, wrong] of [["authoringTileSize", 64], ["authoringTileResolution", 256]]) {
      assert.throws(() => loader.parse(document({ [key]: wrong })), undefined,
        `${key} must reject a grid that would invalidate stored painter work.`);
    }
  });

  await check("compact budgets cannot exceed desktop budgets", () => {
    assert.throws(
      () => loader.parse(document({ compactRainCount: 9000, desktopRainCount: 4000 })),
      undefined,
      "A compact profile must not be asked to draw more rain than a desktop one.",
    );
  });

  await check("budgets resolve per profile", () => {
    const desktop = resolveExperienceBudgets(WORLD_EXPERIENCE_DEFAULTS, false);
    const compact = resolveExperienceBudgets(WORLD_EXPERIENCE_DEFAULTS, true);
    assert.equal(desktop.rainCount, WORLD_EXPERIENCE_DEFAULTS.desktopRainCount);
    assert.equal(compact.rainCount, WORLD_EXPERIENCE_DEFAULTS.compactRainCount);
    assert.ok(compact.leafCount <= desktop.leafCount);
    assert.ok(compact.birdCount <= desktop.birdCount);
    assert.ok(compact.audioVoices <= desktop.audioVoices);
  });

  await check("a missing config file ships the defaults", async () => {
    const resolved = await loader.load("./config/experience-does-not-exist.yaml");
    assert.deepEqual({ ...resolved }, { ...WORLD_EXPERIENCE_DEFAULTS },
      "Absence is a valid state; a malformed file is not.");
  });

  await check("catalogs reject what they do not contain", () => {
    for (const catalog of [WEATHER_PRESET_IDS, CHARACTER_IDS, GRASS_SILHOUETTE_IDS, QUALITY_IDS]) {
      assert.ok(catalog.length > 0, "A catalog must not be empty.");
      assert.ok(Object.isFrozen(catalog), "A catalog must be frozen.");
      assert.equal(resolveCatalogId(catalog, "not-an-id"), undefined);
      assert.equal(resolveCatalogId(catalog, null), undefined);
      assert.equal(resolveCatalogId(catalog, catalog[0]), catalog[0]);
    }
    assert.ok(WEATHER_PRESET_IDS.includes(DEFAULT_WEATHER_PRESET),
      "The default weather preset must be in its own catalog.");
  });
  // --- Stored settings ------------------------------------------------------

  const { decodeHudSettings, HUD_SETTINGS_VERSION, MINIMUM_RENDER_SCALE, MAXIMUM_RENDER_SCALE } =
    await server.ssrLoadModule("/src/runtime/HudSettingsStore.ts");

  await check("the existing inversion setting still migrates", () => {
    // The only field the shipped build ever wrote. A document from it has no
    // version and no other key, and must keep meaning what it meant.
    const migrated = decodeHudSettings({ invertHorizontalMovement: true });
    assert.equal(migrated.invertHorizontalMovement, true);
    assert.equal(migrated.weather, "drusniel", "Absent fields take their default.");
    assert.ok(HUD_SETTINGS_VERSION >= 2);
  });

  await check("an identifier that no longer exists falls back", () => {
    const decoded = decodeHudSettings({
      weather: "thunderstorm", shape: "spike", character: "nobody", quality: "extreme",
    });
    assert.equal(decoded.weather, "drusniel");
    assert.equal(decoded.shape, "blade");
    assert.equal(decoded.character, "drow");
    assert.equal(decoded.quality, undefined,
      "An invalid quality must fall back to letting the profile decide, "
      + "not to a tier nobody chose.");
  });

  await check("a valid identifier is kept", () => {
    const decoded = decodeHudSettings({
      weather: "rainy", shape: "reed", character: "villager", quality: "high",
    });
    assert.equal(decoded.weather, "rainy");
    assert.equal(decoded.shape, "reed");
    assert.equal(decoded.character, "villager");
    assert.equal(decoded.quality, "high");
  });

  await check("numeric settings are clamped, not trusted", () => {
    const high = decodeHudSettings({
      renderScale: 99, masterVolume: 5, ambientVolume: -3, effectsVolume: Number.NaN,
    });
    assert.equal(high.renderScale, MAXIMUM_RENDER_SCALE);
    assert.equal(high.masterVolume, 1);
    assert.equal(high.ambientVolume, 0);
    assert.equal(high.effectsVolume, 0.9, "A non-finite value takes the default.");
    assert.equal(decodeHudSettings({ renderScale: 0.01 }).renderScale, MINIMUM_RENDER_SCALE);
  });

  await check("unknown stored fields are ignored, not rejected", () => {
    const decoded = decodeHudSettings({
      invertHorizontalMovement: true, somethingFromANewerBuild: { nested: true },
    });
    assert.equal(decoded.invertHorizontalMovement, true,
      "A document written by a newer build must still load here.");
    assert.equal("somethingFromANewerBuild" in decoded, false);
  });

  await check("corrupt storage decodes to defaults rather than throwing", () => {
    for (const raw of [null, undefined, 42, "a string", []]) {
      assert.doesNotThrow(() => decodeHudSettings(raw));
    }
    assert.equal(decodeHudSettings(null).weather, "drusniel");
  });

  await check("wrong types fall back per field", () => {
    const decoded = decodeHudSettings({
      invertHorizontalMovement: "yes", weather: 7, renderScale: "big",
    });
    assert.equal(decoded.invertHorizontalMovement, false);
    assert.equal(decoded.weather, "drusniel");
    assert.equal(decoded.renderScale, 1);
  });
} finally {
  await server.close();
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[experience-config] ${failure.message}`);
  }
  throw new Error(`[experience-config] ${failures.length} checks failed.`);
}

console.log(
  "[experience-config] Required keys, bounds, boolean flags, multisample counts, "
  + "the pinned authoring grid, per-profile budgets, absent-file defaults, the "
  + "identifier catalogs and the versioned settings decoder verified.",
);
