import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const presets = JSON.parse(
  readFileSync(
    resolve(REPOSITORY_ROOT, "src/grass/GrassArtPresets.json"),
    "utf8",
  ),
);
const defaultArtDirectionKey = readFileSync(
  resolve(REPOSITORY_ROOT, "src/grass/GrassArtDirection.ts"),
  "utf8",
).match(
  /DEFAULT_GRASS_ART_DIRECTION_KEY: GrassArtDirectionKey =\s*"([a-z-]+)"/,
)?.[1];
const biomeProfiles = JSON.parse(
  readFileSync(
    resolve(REPOSITORY_ROOT, "src/grass/biome/GrassBiomeProfiles.json"),
    "utf8",
  ),
);
const tuning = JSON.parse(
  readFileSync(
    resolve(REPOSITORY_ROOT, "src/grass/materials/GrassPaletteTuning.json"),
    "utf8",
  ),
);
const paletteShaderSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/grass/materials/GrassPaletteShader.ts"),
  "utf8",
);
const nearMaterialSource = readFileSync(
  resolve(REPOSITORY_ROOT, "src/grass/materials/GrassNearMaterial.ts"),
  "utf8",
);

const MAX_AVERAGE_LUMINANCE_DELTA = 0.03;
const MAX_AVERAGE_RGB_DELTA = 0.025;
const MAX_SAMPLE_RMSE = 0.025;
const MAX_P95_SAMPLE_DELTA = 0.03;
// Semantic/source-distribution guard. Runtime WebGL compilation, atlas
// filtering, lighting, fog, and minification are verified separately in the
// browser smoke pass.
//
// This bounds the canopy depth an art preset may ask for. It is not what keeps
// an LOD handoff invisible — MAX_ROOT_TIP_LOD_DELTA below is. Every LOD
// resolves the same palette function from the same root darkening uniform, so
// raising the absolute contrast moves near, mid, and far together. The bound
// sat at 8% while the presets all shipped root darkening around 0.97, which is
// a two percent effect and left the field with no canopy depth at all.
//
// Raised again from 30% once the palette stopped flattening itself: the tip
// balancer had been renormalizing tip luminance to 1.035x the base, so a preset
// could name any tip colour it liked and still get a tip the same brightness as
// its root. Ground-contact shading is progress-dependent, so the measured LOD
// spread sits near 1.1% and MAX_ROOT_TIP_LOD_DELTA is 1.5%.
/**
 * Bound on how far a one-triangle blade's area-weighted mean luminance may drift
 * from the per-fragment blade it hands off to. Relative, not absolute: a blade's
 * mean luminance is around 0.05-0.10, so the absolute deltas the near/mid bounds
 * above are written in cannot resolve this. Evaluating the palette at the raw
 * root progress measured 2.74% against MAX_AVERAGE_LUMINANCE_DELTA's 0.03 and
 * therefore passed, while being a 22% relative error on the blade — which is what
 * the eye reads at the radius where the two representations swap.
 */
const MAX_TRIANGLE_INTERPOLATION_DELTA = 0.03;
const MAX_ROOT_TIP_CONTRAST = 1.25;
// Ground-contact shading is progress-dependent. Mid blades only have root/tip
// vertices and far progress is 8-bit, so the measured near/mid/far contrast
// can differ by about a percent even though every LOD calls the same function.
const MAX_ROOT_TIP_LOD_DELTA = 0.015;
// The far light offset is a deliberate art control rather than LOD drift, so it
// is bounded to the art menu range instead of the parity tolerances above.
const MIN_FAR_LIGHT = 0.7;
const MAX_FAR_LIGHT = 1.15;
const MIN_FAR_SPATIAL_LUMINANCE_RANGE = 0.08;
// Raised from 0.12 when the shaders stopped attenuating this uniform behind its
// back. Both fragment shaders used to scale it by a further hardcoded factor —
// 0.3 in the near material, 0.2 in the impostor — so the number a preset named
// here was never the number that reached the frame, and the two LODs scaled it
// differently. The factors are gone and this is now the whole transmission
// control, so the range it is bounded to has to be the range the art actually
// uses. Both shaders read the same uniform through the same formula, which is
// what keeps the 54 m handoff from shifting hue.
const MAX_BACKLIGHT_STRENGTH = 0.5;
const LOD_DISTRIBUTION_SAMPLE_COUNT = 16384;
const SAMPLE_DRYNESS = [0, 0.05, 0.15, 0.3];
// Spans the canopy-occlusion range GrassFieldVariation can produce, not just
// the old zero-mean per-blade tone jitter.
/**
 * Whole-blade occlusion values the parity check samples.
 *
 * The lower end used to be 0.82, which was the floor resolveGrassCanopyAo alone
 * could reach. Blades now also carry how deep in their own tuft they sit, so the
 * floor is 0.82 x (1 - 0.26) x (1 - 0.12) = 0.541 -- and a parity gate that only
 * sampled the old range would be checking a blade population the field no longer
 * produces.
 */
const SAMPLE_ROOT_AO = [0.54, 0.7, 0.82, 0.94, 1, 1.06];
// Mirrors GRASS_MACRO_DRYNESS_STRENGTH and CANOPY_AO_STRENGTH in
// src/grass/GrassFieldVariation.ts. Both LODs apply them at the same world
// position from the same functions; the independent draws below are the
// worst case for the near-to-mid delta, since in the field the macro terms
// agree exactly and only the per-blade jitter differs.
const MACRO_DRYNESS_STRENGTH = 0.22;
const CANOPY_AO_STRENGTH = 0.17;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PRESET_NUMBER_FIELDS = [
  "rootDarkening",
  "tipColorStrength",
  "normalUp",
  "ambientBoost",
  "backlightStrength",
  "impostorBaseColorBlend",
  "impostorColorScale",
  "terrainGrassTintStrength",
  "densityScale",
  "windStrengthScale",
  "flutterStrengthScale",
  "nearDistance",
  "midDistance",
  "farDistance",
  "transitionDistance",
];
const TUNING_NUMBER_FIELDS = [
  "tipStart",
  "tipEnd",
  "tipLuminanceScale",
  "dryLuminanceScale",
  "shadeDrynessPivot",
  "shadeDrynessScale",
  "shadeDrynessMaximum",
  "instanceDrynessBase",
  "instanceDrynessTip",
  "drynessMaximum",
  "rootFadeEnd",
  "shadeLightMinimum",
  "shadeLightMaximum",
  "shadowDesaturation",
  "groundContactStart",
  "groundContactEnd",
  "groundContactStrength",
  "groundContactBaseScale",
  "groundContactDryScale",
];

function fail(message) {
  throw new Error(`[lod-color] ${message}`);
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    fail(`${label} must be finite.`);
  }
}

function validateInputs() {
  const entries = Object.entries(presets);
  if (entries.length === 0) {
    fail("At least one grass art preset is required.");
  }
  for (const field of TUNING_NUMBER_FIELDS) {
    assertFinite(tuning[field], `Palette tuning ${field}`);
  }
  if (!(tuning.tipStart < tuning.tipEnd)) {
    fail("Palette tipStart must be lower than tipEnd.");
  }
  if (!(tuning.groundContactStart < tuning.groundContactEnd)) {
    fail("Palette groundContactStart must be lower than groundContactEnd.");
  }
  if (!(tuning.shadeLightMinimum <= tuning.shadeLightMaximum)) {
    fail("Palette shade-light range is reversed.");
  }
  for (const [key, preset] of entries) {
    if (preset.key !== key || typeof preset.label !== "string") {
      fail(`Preset ${key} has an invalid key or label.`);
    }
    for (const field of ["baseColor", "tipColor", "dryColor", "terrainGrassColor"]) {
      if (!COLOR_PATTERN.test(preset[field])) {
        fail(`Preset ${key} ${field} must be #RRGGBB.`);
      }
    }
    for (const field of PRESET_NUMBER_FIELDS) {
      assertFinite(preset[field], `Preset ${key} ${field}`);
    }
    if (
      preset.rootDarkening < 0 ||
      preset.rootDarkening > 1 ||
      preset.tipColorStrength < 0 ||
      preset.tipColorStrength > 1 ||
      preset.impostorBaseColorBlend < 0 ||
      preset.impostorBaseColorBlend > 1 ||
      preset.impostorColorScale < MIN_FAR_LIGHT ||
      preset.impostorColorScale > MAX_FAR_LIGHT
    ) {
      fail(`Preset ${key} contains an out-of-range palette control.`);
    }
    if (!(preset.nearDistance < preset.midDistance && preset.midDistance < preset.farDistance)) {
      fail(`Preset ${key} LOD distances must increase from near to far.`);
    }
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(value, minimum, maximum) {
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createLodDistributionSamples() {
  const random = createSeededRandom(42017);
  const samples = [];
  for (let index = 0; index < LOD_DISTRIBUTION_SAMPLE_COUNT; index += 1) {
    // A uniformly sampled triangle has twice as much root area as tip area.
    const progress = 1 - Math.sqrt(1 - random());
    const suitability = 0.08 + random() * 0.92;
    const vigor = random();
    const macroDryness = random();
    const canopyAo = 1 - CANOPY_AO_STRENGTH * vigor * suitability;
    const underlayer = random() < 0.3;
    samples.push({
      progress,
      near: {
        shade: 0.5,
        dryness: clamp(
          (1 - suitability) * 0.25 +
            macroDryness * MACRO_DRYNESS_STRENGTH +
            random() * 0.06,
          0,
          1,
        ),
        rootAo: canopyAo * (0.985 + random() * 0.03),
      },
      mid: {
        shade: underlayer ? random() * 0.2 : 0.24 + random() * 0.76,
        dryness: clamp(
          (1 - suitability) * 0.34 +
            macroDryness * MACRO_DRYNESS_STRENGTH +
            random() * 0.09,
          0,
          1,
        ),
        rootAo: canopyAo * (0.97 + random() * 0.06),
      },
    });
  }
  return samples;
}

const LOD_DISTRIBUTION_SAMPLES = createLodDistributionSamples();

function srgbChannelToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(value) {
  const clamped = clamp(value, 0, 1);
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function parseColor(value) {
  if (!COLOR_PATTERN.test(value)) {
    fail(`Invalid color ${String(value)}.`);
  }
  return [1, 3, 5].map((offset) =>
    srgbChannelToLinear(Number.parseInt(value.slice(offset, offset + 2), 16) / 255),
  );
}

function mixColor(left, right, amount) {
  return left.map((value, index) => lerp(value, right[index], amount));
}

function multiplyColor(color, scalar) {
  return color.map((value) => value * scalar);
}

function luminance(color) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function matchLuminance(color, targetLuminance) {
  return multiplyColor(color, targetLuminance / Math.max(luminance(color), 1e-4));
}

function createPalette(preset) {
  const baseColor = parseColor(preset.baseColor);
  const baseLuminance = Math.max(luminance(baseColor), 1e-4);
  return {
    baseColor,
    tipColor: matchLuminance(
      parseColor(preset.tipColor),
      baseLuminance * tuning.tipLuminanceScale,
    ),
    dryColor: matchLuminance(
      parseColor(preset.dryColor),
      baseLuminance * tuning.dryLuminanceScale,
    ),
  };
}

function resolvePalette(preset, palette, progress, shade, dryness, rootAo) {
  const tipProfile = smoothstep(progress, tuning.tipStart, tuning.tipEnd);
  const healthyColor = mixColor(
    palette.baseColor,
    palette.tipColor,
    tipProfile * preset.tipColorStrength,
  );
  const shadeDryness = clamp(
    (tuning.shadeDrynessPivot - shade) * tuning.shadeDrynessScale,
    0,
    tuning.shadeDrynessMaximum,
  );
  const instanceDryness =
    dryness *
    (tuning.instanceDrynessBase + tipProfile * tuning.instanceDrynessTip);
  const paletteColor = mixColor(
    healthyColor,
    palette.dryColor,
    clamp(shadeDryness + instanceDryness, 0, tuning.drynessMaximum),
  );
  const rootLight = lerp(
    preset.rootDarkening,
    1,
    smoothstep(progress, 0, tuning.rootFadeEnd),
  );
  const bladeVariation = lerp(
    tuning.shadeLightMinimum,
    tuning.shadeLightMaximum,
    shade,
  );
  // Mirrors the shadow desaturation in GRASS_PALETTE_GLSL. The blend runs
  // toward the colour's own luminance, so it is luminance-preserving and the
  // ΔL bounds below are unaffected; it is replicated here because the p95
  // colour distance is not.
  const occlusion = rootLight * bladeVariation * rootAo;
  let shadedColor = multiplyColor(paletteColor, occlusion);
  const groundContact =
    1 -
    smoothstep(progress, tuning.groundContactStart, tuning.groundContactEnd);
  const groundColor = multiplyColor(
    mixColor(
      multiplyColor(palette.baseColor, tuning.groundContactBaseScale),
      multiplyColor(palette.dryColor, tuning.groundContactDryScale),
      dryness,
    ),
    occlusion,
  );
  shadedColor = mixColor(
    shadedColor,
    groundColor,
    groundContact * tuning.groundContactStrength,
  );
  const shadowDesaturation = clamp(
    (1 - occlusion) * tuning.shadowDesaturation,
    0,
    1,
  );
  const shadedLuminance = luminance(shadedColor);
  return shadedColor.map((value) =>
    lerp(value, shadedLuminance, shadowDesaturation),
  );
}

function resolveImpostorPalette(
  preset,
  palette,
  progress,
  shade,
  dryness,
  rootAo,
) {
  const encodedProgress = Math.round(clamp(progress, 0, 1) * 255) / 255;
  const encodedShade = Math.round(clamp(shade, 0, 1) * 255) / 255;
  const semanticColor = resolvePalette(
    preset,
    palette,
    encodedProgress,
    encodedShade,
    dryness,
    rootAo,
  );
  return mixColor(
    semanticColor,
    palette.baseColor,
    preset.impostorBaseColorBlend,
  );
}

// The far light offset dims every impostor channel uniformly, so parity is
// measured before it is applied: the guard keeps catching semantic, blend, and
// palette divergence while the art direction stays free to darken the horizon.
function applyFarLight(preset, color) {
  return multiplyColor(color, preset.impostorColorScale);
}

function add(target, color) {
  for (let channel = 0; channel < 3; channel += 1) {
    target[channel] += color[channel];
  }
}

function average(total, count) {
  if (count <= 0) {
    fail("A deterministic color sample set was empty.");
  }
  return total.map((value) => value / count);
}

function colorDistance(left, right) {
  return Math.sqrt(
    left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0) /
      3,
  );
}

function percentile(values, amount) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1)];
}

function formatColor(color) {
  return `#${color
    .map((value) =>
      Math.round(linearChannelToSrgb(value) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function analyzePreset(preset) {
  const palette = createPalette(preset);
  const sampleDeltas = [];
  let sampleCount = 0;
  let squaredError = 0;

  for (let progressIndex = 0; progressIndex <= 32; progressIndex += 1) {
    const progress = progressIndex / 32;
    for (let shadeIndex = 0; shadeIndex <= 16; shadeIndex += 1) {
      const shade = shadeIndex / 16;
      for (const dryness of SAMPLE_DRYNESS) {
        for (const rootAo of SAMPLE_ROOT_AO) {
          const near = resolvePalette(
            preset,
            palette,
            progress,
            shade,
            dryness,
            rootAo,
          );
          const far = resolveImpostorPalette(
            preset,
            palette,
            progress,
            shade,
            dryness,
            rootAo,
          );
          const delta = colorDistance(near, far);
          sampleDeltas.push(delta);
          squaredError += delta ** 2 * 3;
          sampleCount += 1;
        }
      }
    }
  }

  const nearTotal = [0, 0, 0];
  const midTotal = [0, 0, 0];
  const farTotal = [0, 0, 0];
  const farParityTotal = [0, 0, 0];
  const nearRootTotal = [0, 0, 0];
  const midRootTotal = [0, 0, 0];
  const farRootTotal = [0, 0, 0];
  const nearTipTotal = [0, 0, 0];
  const midTipTotal = [0, 0, 0];
  const farTipTotal = [0, 0, 0];
  const farSpatialLuminances = [];
  const distributionDeltas = [];
  let rootCount = 0;
  let tipCount = 0;
  for (const sample of LOD_DISTRIBUTION_SAMPLES) {
    const near = resolvePalette(
      preset,
      palette,
      sample.progress,
      sample.near.shade,
      sample.near.dryness,
      sample.near.rootAo,
    );
    const mid = resolvePalette(
      preset,
      palette,
      sample.progress,
      sample.mid.shade,
      sample.mid.dryness,
      sample.mid.rootAo,
    );
    const farParity = resolveImpostorPalette(
      preset,
      palette,
      sample.progress,
      sample.mid.shade,
      sample.mid.dryness,
      sample.mid.rootAo,
    );
    const far = applyFarLight(preset, farParity);
    add(nearTotal, near);
    add(midTotal, mid);
    add(farTotal, far);
    add(farParityTotal, farParity);
    distributionDeltas.push(
      Math.max(
        colorDistance(near, mid),
        colorDistance(mid, farParity),
      ),
    );
    farSpatialLuminances.push(luminance(far));
    if (sample.progress <= 0.2) {
      add(nearRootTotal, near);
      add(midRootTotal, mid);
      add(farRootTotal, far);
      rootCount += 1;
    }
    if (sample.progress >= 0.8) {
      add(nearTipTotal, near);
      add(midTipTotal, mid);
      add(farTipTotal, far);
      tipCount += 1;
    }
  }

  const distributionCount = LOD_DISTRIBUTION_SAMPLES.length;
  const nearAverage = average(nearTotal, distributionCount);
  const midAverage = average(midTotal, distributionCount);
  const farAverage = average(farTotal, distributionCount);
  const farParityAverage = average(farParityTotal, distributionCount);
  const nearLuminance = luminance(nearAverage);
  const midLuminance = luminance(midAverage);
  const farLuminance = luminance(farAverage);
  const farParityLuminance = luminance(farParityAverage);
  const luminanceDelta = Math.max(
    Math.abs(midLuminance - nearLuminance) /
      Math.max(nearLuminance, 1e-6),
    Math.abs(farParityLuminance - midLuminance) /
      Math.max(midLuminance, 1e-6),
  );
  const averageRgbDelta = Math.max(
    colorDistance(nearAverage, midAverage),
    colorDistance(midAverage, farParityAverage),
  );
  const sampleRmse = Math.sqrt(squaredError / (sampleCount * 3));
  const p95SampleDelta = Math.max(
    percentile(sampleDeltas, 0.95),
    percentile(distributionDeltas, 0.95),
  );
  const nearRootLuminance = luminance(average(nearRootTotal, rootCount));
  const midRootLuminance = luminance(average(midRootTotal, rootCount));
  const nearTipLuminance = luminance(average(nearTipTotal, tipCount));
  const midTipLuminance = luminance(average(midTipTotal, tipCount));
  const farRootLuminance = luminance(average(farRootTotal, rootCount));
  const farTipLuminance = luminance(average(farTipTotal, tipCount));
  const nearRootTipContrast =
    Math.abs(nearTipLuminance - nearRootLuminance) /
    Math.max(nearLuminance, 1e-6);
  const midRootTipContrast =
    Math.abs(midTipLuminance - midRootLuminance) /
    Math.max(midLuminance, 1e-6);
  const farRootTipContrast =
    Math.abs(farTipLuminance - farRootLuminance) /
    Math.max(farLuminance, 1e-6);
  const rootTipLodDelta = Math.max(
    Math.abs(midRootTipContrast - nearRootTipContrast),
    Math.abs(farRootTipContrast - midRootTipContrast),
  );
  const spatialMinimum = percentile(farSpatialLuminances, 0.05);
  const spatialMaximum = percentile(farSpatialLuminances, 0.95);
  const farSpatialLuminanceRange =
    (spatialMaximum - spatialMinimum) /
    Math.max(farLuminance, 1e-6);

  const finiteResults = [
    ...nearAverage,
    ...midAverage,
    ...farAverage,
    ...farParityAverage,
    luminanceDelta,
    averageRgbDelta,
    sampleRmse,
    p95SampleDelta,
    nearRootTipContrast,
    midRootTipContrast,
    farRootTipContrast,
    rootTipLodDelta,
    farSpatialLuminanceRange,
  ];
  if (!finiteResults.every(Number.isFinite)) {
    fail(`${preset.label} produced a non-finite deterministic color metric.`);
  }

  return {
    nearAverage,
    midAverage,
    farAverage,
    luminanceDelta,
    averageRgbDelta,
    sampleRmse,
    p95SampleDelta,
    nearRootTipContrast,
    midRootTipContrast,
    farRootTipContrast,
    rootTipLodDelta,
    farSpatialLuminanceRange,
  };
}

validateInputs();
const failures = [];
// Biome rows resolve against the shipped art direction at runtime: row zero
// takes that palette verbatim while profile-backed rows replace only their own
// palette controls. Resolve the declared default strictly; falling back to an
// arbitrary preset would let a broken default key turn this gate green.
const defaultPreset = defaultArtDirectionKey
  ? presets[defaultArtDirectionKey]
  : undefined;
if (!defaultPreset) {
  fail(
    `Unable to resolve the default art direction: ${String(defaultArtDirectionKey)}.`,
  );
}
const biomeDirections = Object.values(biomeProfiles).map((profile) =>
  profile.paletteSource === "art"
    ? { ...defaultPreset, label: `Biome: ${profile.label}` }
    : {
        ...defaultPreset,
        label: `Biome: ${profile.label}`,
        baseColor: profile.baseColor,
        tipColor: profile.tipColor,
        dryColor: profile.dryColor,
        rootDarkening: profile.rootDarkening,
        tipColorStrength: profile.tipColorStrength,
      },
);
for (const preset of [...Object.values(presets), ...biomeDirections]) {
  const result = analyzePreset(preset);
  console.log(
    `[lod-color] ${preset.label.padEnd(17)} near ${formatColor(result.nearAverage)} ` +
      `mid ${formatColor(result.midAverage)} far ${formatColor(result.farAverage)} ` +
      `far light ${formatPercent(preset.impostorColorScale)} ` +
      `ΔL ${formatPercent(result.luminanceDelta)} ` +
      `p95 ${result.p95SampleDelta.toFixed(4)} ` +
      `root↔tip ${formatPercent(result.nearRootTipContrast)} / ` +
      `${formatPercent(result.midRootTipContrast)} / ` +
      `${formatPercent(result.farRootTipContrast)} ` +
      `semantic far range ${formatPercent(result.farSpatialLuminanceRange)}`,
  );

  if (result.luminanceDelta > MAX_AVERAGE_LUMINANCE_DELTA) {
    failures.push(
      `${preset.label} average LOD luminance differs by ${formatPercent(result.luminanceDelta)}.`,
    );
  }
  if (result.averageRgbDelta > MAX_AVERAGE_RGB_DELTA) {
    failures.push(
      `${preset.label} average LOD RGB delta is ${result.averageRgbDelta.toFixed(4)}.`,
    );
  }
  if (result.sampleRmse > MAX_SAMPLE_RMSE) {
    failures.push(
      `${preset.label} per-sample LOD RMSE is ${result.sampleRmse.toFixed(4)}.`,
    );
  }
  if (result.p95SampleDelta > MAX_P95_SAMPLE_DELTA) {
    failures.push(
      `${preset.label} p95 sample delta is ${result.p95SampleDelta.toFixed(4)}.`,
    );
  }
  if (result.nearRootTipContrast > MAX_ROOT_TIP_CONTRAST) {
    failures.push(
      `${preset.label} near root-to-tip contrast is ${formatPercent(result.nearRootTipContrast)}.`,
    );
  }
  if (result.midRootTipContrast > MAX_ROOT_TIP_CONTRAST) {
    failures.push(
      `${preset.label} mid root-to-tip contrast is ${formatPercent(result.midRootTipContrast)}.`,
    );
  }
  if (result.farRootTipContrast > MAX_ROOT_TIP_CONTRAST) {
    failures.push(
      `${preset.label} far root-to-tip contrast is ${formatPercent(result.farRootTipContrast)}.`,
    );
  }
  if (result.rootTipLodDelta > MAX_ROOT_TIP_LOD_DELTA) {
    failures.push(
      `${preset.label} root-to-tip contrast changes by ${formatPercent(result.rootTipLodDelta)} between LODs.`,
    );
  }
  if (result.farSpatialLuminanceRange < MIN_FAR_SPATIAL_LUMINANCE_RANGE) {
    failures.push(
      `${preset.label} far spatial luminance range is only ${formatPercent(result.farSpatialLuminanceRange)}.`,
    );
  }
  if (preset.backlightStrength > MAX_BACKLIGHT_STRENGTH) {
    failures.push(
      `${preset.label} backlight ${preset.backlightStrength} can recreate shiny tips.`,
    );
  }
}

// --- One-triangle blades: the vertex palette must carry the fragment palette's
// area-weighted mean.
//
// Base, bridge and mid resolve the palette per vertex, and their blades are a
// single triangle whose only progress values are 0 and 1. The rasteriser
// therefore draws a chord from palette(0) to palette(1) while the segmented
// ultra-near layers evaluate the true curve per fragment. rootLight and
// groundContact both saturate inside the bottom half of a blade, so that chord
// used to land about 22% dark — a step at exactly the radius where the two
// representations swap, and one nothing else in this file could see, because
// every check above compares the palette at *matched* progress rather than
// integrated over a blade.
//
// GrassPaletteShader lifts the root vertices to GRASS_VERTEX_PALETTE_ROOT_PROGRESS
// so the chord reproduces the true mean. That constant is derived, so it is
// recomputed here from the same tuning file, and the residual it leaves is
// bounded across every preset and biome.
const VERTEX_PALETTE_REFERENCE_ROOT_DARKENING = Number(
  paletteShaderSource.match(
    /VERTEX_PALETTE_REFERENCE_ROOT_DARKENING\s*=\s*([0-9.]+)/,
  )?.[1],
);
const VERTEX_PALETTE_REFERENCE_TIP_COLOR_STRENGTH = Number(
  paletteShaderSource.match(
    /VERTEX_PALETTE_REFERENCE_TIP_COLOR_STRENGTH\s*=\s*([0-9.]+)/,
  )?.[1],
);
assertFinite(
  VERTEX_PALETTE_REFERENCE_ROOT_DARKENING,
  "vertex-palette reference root darkening",
);
assertFinite(
  VERTEX_PALETTE_REFERENCE_TIP_COLOR_STRENGTH,
  "vertex-palette reference tip colour strength",
);

const VERTEX_PALETTE_REFERENCE_DRYNESS = Number(
  paletteShaderSource.match(
    /VERTEX_PALETTE_REFERENCE_DRYNESS\s*=\s*([0-9.]+)/,
  )?.[1],
);
assertFinite(
  VERTEX_PALETTE_REFERENCE_DRYNESS,
  "vertex-palette reference dryness",
);

/** Mirrors paletteProgressProfile in GrassPaletteShader.ts. */
function paletteProgressProfile(progress) {
  const tipProfile = smoothstep(progress, tuning.tipStart, tuning.tipEnd);
  const instanceDryness = Math.min(
    tuning.drynessMaximum,
    VERTEX_PALETTE_REFERENCE_DRYNESS *
      (tuning.instanceDrynessBase + tipProfile * tuning.instanceDrynessTip),
  );
  const healthy =
    (1 +
      (tuning.tipLuminanceScale - 1) *
        tipProfile *
        VERTEX_PALETTE_REFERENCE_TIP_COLOR_STRENGTH) *
      (1 - instanceDryness) +
    tuning.dryLuminanceScale * instanceDryness;
  const rootLight = lerp(
    VERTEX_PALETTE_REFERENCE_ROOT_DARKENING,
    1,
    smoothstep(progress, 0, tuning.rootFadeEnd),
  );
  const groundContact =
    1 -
    smoothstep(progress, tuning.groundContactStart, tuning.groundContactEnd);
  const ground = lerp(
    tuning.groundContactBaseScale,
    tuning.groundContactDryScale,
    VERTEX_PALETTE_REFERENCE_DRYNESS,
  );
  return (
    rootLight *
    (healthy - tuning.groundContactStrength * groundContact * (healthy - ground))
  );
}

// The derivation above is a mirror of the one in GrassPaletteShader.ts. Neither
// can be imported here (the shader module pulls in three), so what keeps the two
// from drifting is that they must consume exactly the same tuning terms: drop or
// add one on either side and this trips.
{
  const shaderProfile = paletteShaderSource.slice(
    paletteShaderSource.indexOf("function paletteProgressProfile"),
    paletteShaderSource.indexOf("export const GRASS_VERTEX_PALETTE_ROOT_PROGRESS"),
  );
  const mirrorProfile = paletteProgressProfile.toString();
  const tuningKeys = Object.keys(tuning);
  for (const key of tuningKeys) {
    const inShader = shaderProfile.includes(`tuning.${key}`);
    const inMirror = mirrorProfile.includes(`tuning.${key}`);
    if (inShader !== inMirror) {
      failures.push(
        `The vertex-palette root-progress derivation disagrees on tuning.${key}: shader ${inShader}, verifier ${inMirror}.`,
      );
    }
  }
  if (shaderProfile.length === 0) {
    failures.push(
      "GrassPaletteShader must expose paletteProgressProfile for the root-progress derivation.",
    );
  }
}

const TRIANGLE_AREA_STEPS = 4096;

/** Area-weighted mean over a blade triangle, whose width tapers as 2(1-p). */
function triangleAreaMean(sample) {
  let total = 0;
  for (let index = 0; index < TRIANGLE_AREA_STEPS; index += 1) {
    const progress = (index + 0.5) / TRIANGLE_AREA_STEPS;
    total += sample(progress) * 2 * (1 - progress);
  }
  return total / TRIANGLE_AREA_STEPS;
}

const derivedRootProgress = (() => {
  const target =
    1.5 * triangleAreaMean(paletteProgressProfile) -
    0.5 * paletteProgressProfile(1);
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middle = (low + high) * 0.5;
    if (paletteProgressProfile(middle) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) * 0.5;
})();

if (
  !/export const GRASS_VERTEX_PALETTE_ROOT_PROGRESS_GLSL = toGlslFloat\(/.test(
    paletteShaderSource,
  )
) {
  failures.push(
    "GrassPaletteShader must publish GRASS_VERTEX_PALETTE_ROOT_PROGRESS as a GLSL constant.",
  );
}
if (
  !/mix\(\$\{GRASS_VERTEX_PALETTE_ROOT_PROGRESS_GLSL\}, 1\.0, grassProgress\)/.test(
    nearMaterialSource,
  )
) {
  failures.push(
    "The vertex palette must resolve at the lifted root progress, not the raw attribute.",
  );
}

// Every shipped shade control has to sit inside the band the one derived
// constant was fitted for; outside it the approximation is no longer bounded.
for (const [label, source] of [
  ["preset", presets],
  ["biome", biomeProfiles],
]) {
  for (const entry of Object.values(source)) {
    if (typeof entry.rootDarkening !== "number") {
      continue;
    }
    if (entry.rootDarkening < 0.4 || entry.rootDarkening > 0.48) {
      failures.push(
        `${label} ${entry.label} rootDarkening ${entry.rootDarkening} leaves the vertex-palette fit band.`,
      );
    }
    if (entry.tipColorStrength < 0.28 || entry.tipColorStrength > 0.4) {
      failures.push(
        `${label} ${entry.label} tipColorStrength ${entry.tipColorStrength} leaves the vertex-palette fit band.`,
      );
    }
  }
}

let worstTriangleDelta = 0;
for (const preset of Object.values(presets)) {
  const palette = createPalette(preset);
  for (const shade of [0.2, 0.5, 0.8]) {
    for (const dryness of SAMPLE_DRYNESS) {
      const fragmentMean = triangleAreaMean((progress) =>
        luminance(resolvePalette(preset, palette, progress, shade, dryness, 1)),
      );
      const rootLuminance = luminance(
        resolvePalette(preset, palette, derivedRootProgress, shade, dryness, 1),
      );
      const tipLuminance = luminance(
        resolvePalette(preset, palette, 1, shade, dryness, 1),
      );
      // The chord's own area-weighted mean sits two thirds of the way from tip
      // to root, because the triangle is widest where progress is lowest.
      const vertexMean = (2 / 3) * rootLuminance + (1 / 3) * tipLuminance;
      const delta =
        Math.abs(vertexMean - fragmentMean) / Math.max(fragmentMean, 1e-4);
      worstTriangleDelta = Math.max(worstTriangleDelta, delta);
      if (delta > MAX_TRIANGLE_INTERPOLATION_DELTA) {
        failures.push(
          `${preset.label} one-triangle blade mean luminance differs from the per-fragment blade by ${formatPercent(delta)} (shade ${shade}, dryness ${dryness}).`,
        );
      }
    }
  }
}
console.log(
  `[lod-color] One-triangle blades resolve the palette at progress ${derivedRootProgress.toFixed(4)}; worst area-weighted mean delta against the per-fragment blade is ${formatPercent(worstTriangleDelta)}.`,
);

// --- Canopy fill: widened blades compensate toward their own biome and dryness.
//
// The width clamp pays invented coverage back in colour. A single world canopy
// target makes that payback distance-dependent in a multi-biome field: steppe
// and alpine blades are pulled toward meadow precisely as their projected width
// falls. Two bounded rows per biome retain the same vertex-only cost model while
// letting instance dryness interpolate between the palette's healthy/dry means.
if (!/export function setGrassCanopyColors\(/.test(paletteShaderSource)) {
  failures.push(
    "GrassPaletteShader must derive healthy and dry canopy endpoints through setGrassCanopyColors.",
  );
}
if (
  !/uniform vec3 uGrassBiomeCanopyHealthy\[GRASS_MAX_BIOMES\]/.test(
    nearMaterialSource,
  ) ||
  !/uniform vec3 uGrassBiomeCanopyDry\[GRASS_MAX_BIOMES\]/.test(
    nearMaterialSource,
  )
) {
  failures.push("Sub-pixel canopy compensation must use bounded biome uniform arrays.");
}
if (
  !/mix\(\s*uGrassBiomeCanopyHealthy\[grassBiomeRow\],\s*uGrassBiomeCanopyDry\[grassBiomeRow\],\s*instanceVariation\.w\s*\)/.test(
    nearMaterialSource,
  )
) {
  failures.push(
    "Sub-pixel canopy compensation must index instanceBiome and interpolate with instanceVariation.w.",
  );
}
if (/uGrassCanopyColor/.test(nearMaterialSource)) {
  failures.push("The obsolete single-world uGrassCanopyColor uniform must be removed.");
}
if (
  !/export const GRASS_CANOPY_MEAN_PROGRESS = 1 \/ 3/.test(
    paletteShaderSource,
  ) ||
  !/export const GRASS_CANOPY_MEAN_SHADE = 0\.5/.test(paletteShaderSource) ||
  !/export const GRASS_CANOPY_MEAN_ROOT_AO = 0\.95/.test(paletteShaderSource)
) {
  failures.push(
    "GrassPaletteShader must publish the canopy mean progress and occlusion constants.",
  );
}
if (
  !/resolveGrassPaletteColor\(\s*target,[\s\S]*?GRASS_VERTEX_PALETTE_ROOT_PROGRESS,/.test(
    paletteShaderSource,
  ) ||
  !/target\.lerp\(\s*canopyScratchResolvedTip,\s*GRASS_CANOPY_MEAN_PROGRESS/.test(
    paletteShaderSource,
  )
) {
  failures.push(
    "setGrassCanopyColor must use the vertex-palette chord mean, not the palette at mean progress.",
  );
}

const GRASS_CANOPY_MEAN_PROGRESS = 1 / 3;
const GRASS_CANOPY_MEAN_SHADE = 0.5;
const GRASS_CANOPY_MEAN_ROOT_AO = 0.95;
const CANOPY_DRYNESS_SAMPLES = [0, 0.25, 0.65, 1];
const CANOPY_COVERAGE_SAMPLES = [1, 0.6, 0.2];

let worstCanopyDelta = 0;
for (const preset of biomeDirections) {
  const palette = createPalette(preset);
  const healthyRootColor = resolvePalette(
    preset,
    palette,
    derivedRootProgress,
    GRASS_CANOPY_MEAN_SHADE,
    0,
    GRASS_CANOPY_MEAN_ROOT_AO,
  );
  const healthyTipColor = resolvePalette(
    preset,
    palette,
    1,
    GRASS_CANOPY_MEAN_SHADE,
    0,
    GRASS_CANOPY_MEAN_ROOT_AO,
  );
  const healthyCanopy = mixColor(
    healthyRootColor,
    healthyTipColor,
    GRASS_CANOPY_MEAN_PROGRESS,
  );
  const dryRootColor = resolvePalette(
    preset,
    palette,
    derivedRootProgress,
    GRASS_CANOPY_MEAN_SHADE,
    1,
    GRASS_CANOPY_MEAN_ROOT_AO,
  );
  const dryTipColor = resolvePalette(
    preset,
    palette,
    1,
    GRASS_CANOPY_MEAN_SHADE,
    1,
    GRASS_CANOPY_MEAN_ROOT_AO,
  );
  const dryCanopy = mixColor(
    dryRootColor,
    dryTipColor,
    GRASS_CANOPY_MEAN_PROGRESS,
  );
  for (const dryness of CANOPY_DRYNESS_SAMPLES) {
    const rootColor = resolvePalette(
      preset,
      palette,
      derivedRootProgress,
      GRASS_CANOPY_MEAN_SHADE,
      dryness,
      GRASS_CANOPY_MEAN_ROOT_AO,
    );
    const tipColor = resolvePalette(
      preset,
      palette,
      1,
      GRASS_CANOPY_MEAN_SHADE,
      dryness,
      GRASS_CANOPY_MEAN_ROOT_AO,
    );
    const sourceMean = mixColor(rootColor, tipColor, GRASS_CANOPY_MEAN_PROGRESS);
    // Mirror the runtime shader exactly: only the healthy/dry endpoints are
    // uploaded, and the per-instance dryness interpolates between them.
    const canopy = mixColor(healthyCanopy, dryCanopy, dryness);
    for (const coverage of CANOPY_COVERAGE_SAMPLES) {
      const compensatedRoot = mixColor(rootColor, canopy, 1 - coverage);
      const compensatedTip = mixColor(tipColor, canopy, 1 - coverage);
      const compensatedMean = mixColor(
        compensatedRoot,
        compensatedTip,
        GRASS_CANOPY_MEAN_PROGRESS,
      );
      const delta =
        Math.abs(luminance(compensatedMean) - luminance(sourceMean)) /
        Math.max(luminance(sourceMean), 1e-4);
      worstCanopyDelta = Math.max(worstCanopyDelta, delta);
      if (delta > MAX_AVERAGE_LUMINANCE_DELTA) {
        failures.push(
          `${preset.label} canopy compensation changes mean luminance by ${formatPercent(delta)} at dryness ${dryness} and coverage ${coverage}.`,
        );
      }
      if (
        coverage === 1 &&
        (colorDistance(compensatedRoot, rootColor) > 1e-12 ||
          colorDistance(compensatedTip, tipColor) > 1e-12)
      ) {
        failures.push(
          `${preset.label} full-coverage blades must retain their resolved palette exactly.`,
        );
      }
    }
  }
}
console.log(
  `[lod-color] Biome-aware canopy compensation covers ${biomeDirections.length} shipped rows, ${CANOPY_DRYNESS_SAMPLES.length} dryness values, and ${CANOPY_COVERAGE_SAMPLES.length} coverage levels; worst mean luminance delta is ${formatPercent(worstCanopyDelta)}.`,
);

if (failures.length > 0) {
  fail(failures.join("\n[lod-color] "));
}

console.log(
  "[lod-color] Seeded semantic near/mid source distributions and quantized far samples satisfy mean, p95, root-tip, and variation limits.",
);
