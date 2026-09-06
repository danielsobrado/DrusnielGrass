import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[grass-dry-lighting] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const tuning = JSON.parse(read("src/grass/materials/GrassPaletteTuning.json"));
const presets = JSON.parse(read("src/grass/GrassArtPresets.json"));
const nearMaterial = read("src/grass/materials/GrassNearMaterial.ts");

assert(
  tuning.dryLuminanceScale < 1 && tuning.dryLuminanceScale >= 0.75,
  "Dry palette luminance must stay below healthy base luminance without becoming unnaturally dark.",
);
assert(
  tuning.tipLuminanceScale <= 1.42,
  "Tip luminance must remain bounded so dry tips cannot turn into a pale field-wide highlight.",
);
assert(
  tuning.drynessMaximum <= 0.65,
  "Palette dryness mixing must stay bounded below full replacement.",
);
assert(
  tuning.groundContactDryScale <= 0.6,
  "Dry roots must remain grounded rather than becoming a bright straw line at the soil.",
);

const transmission = nearMaterial.match(
  /float grassWetTransmission = mix\(\s*([0-9.]+),\s*([0-9.]+),\s*1\.0 - vGrassDryness\s*\);/,
);
assert(transmission, "Near grass must retain dryness-aware leaf transmission.");
const dryTransmission = Number(transmission?.[1]);
const wetTransmission = Number(transmission?.[2]);
assert(
  Number.isFinite(dryTransmission) &&
    Number.isFinite(wetTransmission) &&
    dryTransmission < wetTransmission &&
    dryTransmission <= 0.85 &&
    wetTransmission <= 1.2,
  `Dry/wet transmission endpoints are unsafe: ${dryTransmission}/${wetTransmission}.`,
);
assert(
  nearMaterial.includes("grassBackLight * uGrassBacklightStrength") &&
    nearMaterial.includes("grassWetTransmission"),
  "Dryness-aware transmission must remain on the actual backlight path.",
);
assert(
  !/diffuseColor\.rgb\s*=\s*min\(/.test(nearMaterial) &&
    !/outgoingLight\s*=\s*min\(/.test(nearMaterial),
  "Grass lighting must not hide dry-color errors behind a final-output luminance clamp.",
);

const sheenStrength = Number(
  nearMaterial.match(/DEFAULT_SHEEN_STRENGTH\s*=\s*([0-9.]+)/)?.[1],
);
assert(
  Number.isFinite(sheenStrength) &&
    sheenStrength <= 0.04 &&
    nearMaterial.includes("smoothstep(0.3, 0.92, vGrassProgress)"),
  "Blade sheen must stay subtle and tip-weighted so roots cannot bleach into a pale band.",
);

/**
 * Blade normals must be flattened on a schedule, not by one constant.
 *
 * At the shipped 0.76 more than three quarters of every normal was world up, so
 * a blade facing the sun and one facing away returned nearly the same Lambert
 * response: the near field had form only in colour. The same constant flattened
 * grassThinness, which is the transmission term, so the backlighting was
 * implemented correctly and then suppressed.
 *
 * The far end must still equal the impostor material's own flattening, or the
 * mid-to-far handoff shifts hue under a moving camera.
 */
{
  assert(
    nearMaterial.includes("uniform vec2 uGrassNormalUpRange;") &&
      nearMaterial.includes("float grassNormalUpHere = mix("),
    "Blade normal flattening must interpolate between a near and a far value.",
  );
  assert(
    !/uniform float uGrassNormalUp;/.test(nearMaterial),
    "The single-constant normal flattening must be gone.",
  );
  // The macro blade-plane normal bypasses Three.js's defaultnormal_vertex
  // instance correction, so it must explicitly divide by squared instance
  // scale. Phase 5 introduced broad, non-uniform blades; without this the
  // Phase 6 far normal is skewed by morphology instead of only by facing.
  assert(
    nearMaterial.includes("vec3 grassInstanceScaleSquared = vec3(") &&
      nearMaterial.includes(
        "grassBladePlaneNormal / max(grassInstanceScaleSquared, vec3(1e-8))",
      ),
    "The macro blade-plane normal must mirror Three.js inverse-scale correction for non-uniform instances.",
  );
  // The schedule rides the shading micro fade, which every near and mid layer
  // shares. Keying it to a LOD distance instead is what produced an earlier
  // brightness ring at 6-7 m.
  assert(
    /grassNormalUpHere = mix\(\s*uGrassNormalUpRange\.y,\s*uGrassNormalUpRange\.x,\s*grassMicroFade/.test(
      nearMaterial,
    ),
    "The flattening schedule must ride the shared micro fade rather than a LOD distance.",
  );

  const worldYaml = read("public/config/world.yaml");
  const nearScale = Number(
    worldYaml.match(/^grassNearNormalUpScale:\s*([0-9.]+)/m)?.[1],
  );
  assert(
    nearScale > 0.4 && nearScale < 1,
    `grassNearNormalUpScale ${nearScale} must genuinely reduce the near flattening.`,
  );

  // What the change is actually for: a blade facing the sun must return
  // materially more light than one facing away. Measured on the Lambert term
  // the mix produces, at a distance inside the micro fade.
  const farNormalUp = Math.max(
    ...Object.values(presets).map((preset) => preset.normalUp),
  );
  const nearNormalUp = farNormalUp * nearScale;
  const facingResponse = (bladeFacing, flatten) => {
    // Blade plane normal against a sun 35 degrees above the horizon.
    const sun = [Math.cos(0.61), Math.sin(0.61), 0];
    const normal = [
      bladeFacing * (1 - flatten),
      flatten,
      0,
    ];
    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    return Math.max(
      0,
      (normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2]) / length,
    );
  };
  const nearRatio =
    facingResponse(1, nearNormalUp) / Math.max(facingResponse(-1, nearNormalUp), 1e-4);
  const oldRatio =
    facingResponse(1, farNormalUp) / Math.max(facingResponse(-1, farNormalUp), 1e-4);
  assert(
    nearRatio > oldRatio * 1.5,
    `Near blades separate sun-facing from sun-averted by ${nearRatio.toFixed(2)}x against ${oldRatio.toFixed(2)}x at the far flattening; the schedule is not buying form.`,
  );
}

/**
 * Dry grass must stay separable from healthy grass.
 *
 * The palette move that muted the field pulled every source toward its own
 * luminance and cut the tip's brightness lead from 1.30 to 1.24, and both of
 * those close the gap between a dry blade and a healthy one. Saturation is the
 * cheapest way to tell two plants apart and it is the thing this phase spends,
 * so the separation it spends from has to be measured rather than assumed.
 *
 * Two measures, because they fail differently.
 *
 * The luminance check is *relative*. An absolute one would be a tax on dark
 * biomes -- alpine's base is 0.086, so it can never reach the same absolute gap
 * as the steppe's 0.170 no matter how its dry tone is chosen -- and the failure
 * worth catching is someone closing the tip and dry scales toward each other,
 * which shows up in the ratio.
 *
 * The chromatic check is measured at a common exposure for the same reason: Lab
 * distances compress in dark colours, so raw albedo ΔE reports alpine as the
 * worst row in the set when in fact its dry tone is further from its healthy one
 * than the steppe's is. The palette is albedo and the renderer multiplies light
 * back into it, so comparing the rows at one exposure is the closer analogue of
 * what a viewer sees.
 */
{
  const biomeProfiles = JSON.parse(read("src/grass/biome/GrassBiomeProfiles.json"));
  const desaturation = Number(
    read("public/config/world.yaml").match(
      /^grassPaletteDesaturation:\s*([0-9.]+)$/m,
    )?.[1],
  );
  assert(
    Number.isFinite(desaturation),
    "Unable to read grassPaletteDesaturation.",
  );

  const luminanceOf = (color) =>
    color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;

  function parseHex(hex) {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    // The engine's colours are authored in sRGB and Three converts them on the
    // way in, so the comparison has to happen in the same space the shader
    // mixes in rather than on the hex triples.
    return [
      ((value >> 16) & 255) / 255,
      ((value >> 8) & 255) / 255,
      (value & 255) / 255,
    ].map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  }

  function scaleTo(color, target) {
    const factor = target / Math.max(luminanceOf(color), 1e-4);
    return color.map((channel) => Math.min(1, channel * factor));
  }

  function desaturate(color, amount) {
    const value = luminanceOf(color);
    return color.map((channel) => channel + (value - channel) * amount);
  }

  function toLab(color) {
    const [r, g, b] = color;
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const pivot = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [
      116 * pivot(y) - 16,
      500 * (pivot(x) - pivot(y)),
      200 * (pivot(y) - pivot(z)),
    ];
  }

  const deltaE = (a, b) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /** Reproduces setBalancedGrassPaletteColors for one palette row. */
  function balanceRow(row) {
    const base = parseHex(row.baseColor);
    const baseLuminance = Math.max(luminanceOf(base), 1e-4);
    return {
      base: desaturate(base, desaturation),
      tip: desaturate(
        scaleTo(parseHex(row.tipColor), baseLuminance * tuning.tipLuminanceScale),
        desaturation,
      ),
      dry: desaturate(
        scaleTo(parseHex(row.dryColor), baseLuminance * tuning.dryLuminanceScale),
        desaturation,
      ),
    };
  }

  const MINIMUM_RELATIVE_LUMINANCE_GAP = 0.25;
  /**
   * Two bars, because the rows are not the same kind of thing.
   *
   * The shipped default and the meadow biome -- 62% of the world -- carry the
   * look and have to hold a real separation. The comparison presets and the
   * other biomes only have to stay out of collapse, and one of them legitimately
   * sits close: a dry steppe's healthy grass already looks like straw, and
   * forcing its dry state further away would be wrong rather than safer.
   */
  const MINIMUM_EXPOSED_DELTA_E = 18;
  const MINIMUM_ALTERNATE_EXPOSED_DELTA_E = 10;
  const REFERENCE_EXPOSURE = 0.45;
  const defaultArtDirectionKey = read("src/grass/GrassArtDirection.ts").match(
    /DEFAULT_GRASS_ART_DIRECTION_KEY: GrassArtDirectionKey =\s*"([a-z-]+)"/,
  )?.[1];
  assert(
    Boolean(presets[defaultArtDirectionKey]),
    `Unable to resolve the default art direction: ${defaultArtDirectionKey}.`,
  );

  const rows = [
    ...Object.entries(presets).map(([key, preset]) => [
      `preset ${key}`,
      preset,
      key === defaultArtDirectionKey,
    ]),
    ...Object.entries(biomeProfiles).map(([key, profile]) => [
      `biome ${key}`,
      profile,
      key === "meadow",
    ]),
  ];
  let worstGap = Infinity;
  let worstDeltaE = Infinity;
  let worstGapRow = "";
  let worstDeltaERow = "";
  for (const [label, row, carriesTheLook] of rows) {
    const palette = balanceRow(row);
    const tipLuminance = luminanceOf(palette.tip);
    const gap = (tipLuminance - luminanceOf(palette.dry)) / tipLuminance;
    const exposed = deltaE(
      toLab(scaleTo(palette.tip, REFERENCE_EXPOSURE)),
      toLab(scaleTo(palette.dry, REFERENCE_EXPOSURE)),
    );
    if (gap < worstGap) {
      worstGap = gap;
      worstGapRow = label;
    }
    if (exposed < worstDeltaE) {
      worstDeltaE = exposed;
      worstDeltaERow = label;
    }
    assert(
      gap >= MINIMUM_RELATIVE_LUMINANCE_GAP,
      `${label} separates dry from healthy by only ${(gap * 100).toFixed(1)}% of tip luminance.`,
    );
    const floor = carriesTheLook
      ? MINIMUM_EXPOSED_DELTA_E
      : MINIMUM_ALTERNATE_EXPOSED_DELTA_E;
    assert(
      exposed >= floor,
      `${label} dry and healthy differ by only ΔE ${exposed.toFixed(1)} at a common exposure, against a floor of ${floor}; dry grass has to be a different colour, not just a darker one.`,
    );
  }

  console.log(
    `[grass-dry-lighting] ${rows.length} palette rows hold dry/healthy apart: ` +
      `narrowest luminance gap ${(worstGap * 100).toFixed(1)}% (${worstGapRow}), ` +
      `narrowest chromatic ΔE ${worstDeltaE.toFixed(1)} (${worstDeltaERow}) at ` +
      `exposure ${REFERENCE_EXPOSURE} under ${(desaturation * 100).toFixed(0)}% ` +
      "global desaturation.",
  );
}

const maximumBacklight = Math.max(
  ...Object.values(presets).map((preset) => preset.backlightStrength),
);
assert(
  maximumBacklight <= 0.35,
  `Preset backlight ${maximumBacklight} is high enough to reintroduce chalky dry masses.`,
);

console.log(
  `[grass-dry-lighting] Dry palette ${tuning.dryLuminanceScale.toFixed(2)}x, ` +
    `tip ${tuning.tipLuminanceScale.toFixed(2)}x, transmission ` +
    `${dryTransmission.toFixed(2)}-${wetTransmission.toFixed(2)}, ` +
    `sheen ${sheenStrength.toFixed(3)}, max preset backlight ` +
    `${maximumBacklight.toFixed(2)} verified without output clamps.`,
);
