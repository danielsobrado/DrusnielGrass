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

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[flower-variety] ${message}`);
  }
}

const species = read("src/grass/biome/GrassAccentSpecies.ts");
const biomeProfile = read("src/grass/biome/GrassBiomeProfile.ts");
const affinity = read("src/world/grass/DetailFoliageAffinity.ts");
const atlas = read("src/world/grass/WorldDetailFoliageAtlasFactory.ts");
const material = read("src/world/grass/WorldDetailFoliageMaterial.ts");

assert(
  species.includes("canopyHeightBand: [0.88, 1.58]") &&
    species.includes("canopyHeightBand: [0.82, 1.46]"),
  "Flower families must retain visibly different, broad height bands.",
);
assert(
  species.includes('key: "low-shrub"') &&
    species.includes("index") &&
    /key: "low-shrub"[\s\S]*?category: "shrub"/.test(species) &&
    /key: "broadleaf-rosette"[\s\S]*?category: "broadleaf"/.test(species) &&
    !species.includes('key: "tall-tuft"') &&
    !species.includes('key: "sprig"'),
  "Species slots 1 and 7 must be low-shrub and broadleaf-rosette.",
);
assert(
  species.includes("GRASS_MAX_ACCENT_SPECIES = 10") &&
    [...species.matchAll(/key: "([a-z-]+)",\s+category:/g)].length === 10 &&
    species.includes('| "shrub"') &&
    species.includes('| "broadleaf"') &&
    species.includes('| "groundcover"'),
  "The accent catalogue must stay at ten species and include shrub, broadleaf, and groundcover.",
);
assert(
  biomeProfile.includes("GRASS_MAX_ACCENT_PROFILE_ENTRIES = 16") &&
    biomeProfile.includes("source.length > GRASS_MAX_ACCENT_PROFILE_ENTRIES"),
  "Biome accent lists must keep the bounded 16-entry candidate-scan contract.",
);
assert(
  affinity.includes(
    "return smoothstep(0, 0.75, clamp01(tuning.colonyStrength));",
  ),
  "Colony strength must use the saturated spatial-correlation response.",
);
const tintPicker = affinity.slice(
  affinity.indexOf("function pickTintRow("),
  affinity.indexOf("export function detailFoliageCorrelation("),
);
assert(
  tintPicker.length > 0 && !tintPicker.includes("adjustedWeight("),
  "Tint picking must reuse same-species profile weights instead of rescoring ecology and edges.",
);
const heightBands = [
  ...species.matchAll(/canopyHeightBand: \[([0-9.]+), ([0-9.]+)\]/g),
];
const aspects = [...species.matchAll(/aspect: ([0-9.]+)/g)].map((match) =>
  Number(match[1]),
);
let maxHeight = 0;
let maxWidth = 0;
heightBands.forEach((match, index) => {
  const high = Number(match[2]);
  maxHeight = Math.max(maxHeight, high);
  maxWidth = Math.max(maxWidth, high * aspects[index]);
});
// The envelope the accent layer reserves, as multiples of canopy height.
// Raised from 1.72/1.314 when the structural species (ferns, rosettes, shrubs)
// were grown past the flowers: at the old ceiling a fern was 0.84 m in 0.73 m
// grass and read as a tall blade. These bounds are what the tile bounding
// sphere is padded by, so they are a culling cost and not a free knob.
assert(
  maxHeight <= 2.05 && maxWidth <= 1.96,
  `Accent canopy bounds exceeded: height ${maxHeight}, width ${maxWidth}.`,
);
const shrubAspect = Number(
  species.match(/key: "low-shrub"[\s\S]*?aspect: ([0-9.]+)/)?.[1],
);
const seedAspect = Number(
  species.match(/key: "seed-head"[\s\S]*?aspect: ([0-9.]+)/)?.[1],
);
const broadleafMax = Number(
  species.match(
    /key: "broadleaf-rosette"[\s\S]*?canopyHeightBand: \[[0-9.]+, ([0-9.]+)\]/,
  )?.[1],
);
const daisyMax = Number(
  species.match(
    /key: "daisy"[\s\S]*?canopyHeightBand: \[[0-9.]+, ([0-9.]+)\]/,
  )?.[1],
);
const seedMax = Number(
  species.match(
    /key: "seed-head"[\s\S]*?canopyHeightBand: \[[0-9.]+, ([0-9.]+)\]/,
  )?.[1],
);
assert(
  shrubAspect > seedAspect &&
    broadleafMax < daisyMax &&
    broadleafMax < seedMax,
  "Replacement plants must keep a lower, wider silhouette than seed heads and daisies.",
);
// Four phenotype rows, and they must be maturation states rather than reseeds:
// the understory families are large, low-contrast and mid-green, so a row that
// differs only by seed leaves a stand of them reading as one plant.
assert(
  atlas.includes("private drawLowShrub(") &&
    atlas.includes("private drawBroadleafRosette(") &&
    /drawLowShrub\([\s\S]*?variant % DETAIL_FOLIAGE_VARIANT_ROWS/.test(atlas) &&
    /drawBroadleafRosette\([\s\S]*?variant % DETAIL_FOLIAGE_VARIANT_ROWS/.test(
      atlas,
    ) &&
    atlas.includes("private drawCloverPatch(") &&
    atlas.includes("private drawLeafLitter(") &&
    atlas.includes("DETAIL_FOLIAGE_CELL_RESOLUTION = 112") &&
    atlas.includes("DETAIL_FOLIAGE_VARIANT_ROWS = 4") &&
    atlas.includes("columns * cellSize") &&
    !atlas.includes("drawSprig") &&
    !atlas.includes('case "tall-tuft"'),
  "Atlas must draw shrub, rosette, and ground-layer phenotypes on the 10x4 1280x512 layout.",
);
assert(
  species.includes('key: "daisy"') &&
    species.includes("aspect: 0.72") &&
    species.includes('key: "round-bloom"') &&
    species.includes("aspect: 0.9"),
  "Flower families must retain distinct card proportions.",
);
assert(
  atlas.includes("private fillPetal(") &&
    atlas.includes("private drawCalyx(") &&
    atlas.includes("random.range(10, 14)") &&
    atlas.includes("random.range(7, 10)") &&
    atlas.includes("const branched = variant % 2 === 1") &&
    atlas.includes("budX"),
  "Flower atlas must retain distinct petal, calyx, and branched phenotypes.",
);
assert(
  atlas.includes("baseTint") &&
    atlas.includes("tipTint") &&
    atlas.includes("createLinearGradient(0, 0, length, 0)"),
  "Petals must retain semantic shade/tint gradients instead of flat fills.",
);
assert(
  material.includes("flat varying float vPhenotype") &&
    material.includes("float petalShade = mix(0.65, 1.12, accentData.g)") &&
    material.includes("float saturation = mix(0.82, 1.0") &&
    !material.includes(
      "color = mix(color, uAccentTint[tintRow], accentData.b);",
    ),
  "Flower tinting must retain per-pixel shade and stable per-instance variation.",
);

/**
 * A flower has to read as a flower against the shipped grass palette.
 *
 * Biome row zero delegates its colors to the active art direction. Measuring
 * against the profile JSON instead would freeze this gate to a palette that is
 * not rendered whenever the default preset changes. The tint itself is checked
 * before shared lighting; later petal shade and lighting may alter value, but
 * they cannot rescue a source tint that already collapses into the canopy hue.
 */
{
  const tuning = JSON.parse(read("src/grass/materials/GrassPaletteTuning.json"));
  const biomeProfiles = JSON.parse(
    read("src/grass/biome/GrassBiomeProfiles.json"),
  );
  const presets = JSON.parse(read("src/grass/GrassArtPresets.json"));
  const defaultArtDirectionKey = read("src/grass/GrassArtDirection.ts").match(
    /DEFAULT_GRASS_ART_DIRECTION_KEY: GrassArtDirectionKey =\s*"([a-z-]+)"/,
  )?.[1];
  assert(
    biomeProfiles.meadow?.paletteSource === "art",
    "The meadow row must delegate its palette to the active art direction.",
  );
  const meadow = presets[defaultArtDirectionKey];
  assert(
    Boolean(meadow),
    `Unable to resolve the default art direction: ${defaultArtDirectionKey}.`,
  );
  const desaturation = Number(
    read("public/config/world.yaml").match(
      /^grassPaletteDesaturation:\s*([0-9.]+)$/m,
    )?.[1],
  );
  assert(
    Number.isFinite(desaturation),
    "Unable to read grassPaletteDesaturation.",
  );

  const tints = [
    ...species.matchAll(/\{ key: "([a-z-]+)", color: "(#[0-9a-f]{6})" \}/g),
  ].map(([, key, color]) => ({ key, color }));
  assert(
    tints.length >= 8,
    `Only ${tints.length} accent tints found; the tint table did not parse.`,
  );

  const luminanceOf = (color) =>
    color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;

  function parseHex(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [
      ((value >> 16) & 255) / 255,
      ((value >> 8) & 255) / 255,
      (value & 255) / 255,
    ].map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
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

  // Mirrors setBalancedGrassPaletteColors: balance the tip against the active
  // base first, then apply the luminance-preserving global desaturation.
  const meadowBase = parseHex(meadow.baseColor);
  const meadowTip = parseHex(meadow.tipColor);
  const tipFactor =
    (Math.max(luminanceOf(meadowBase), 1e-4) * tuning.tipLuminanceScale) /
    Math.max(luminanceOf(meadowTip), 1e-4);
  const canopy = meadowTip.map((channel) => channel * tipFactor);
  const canopyLuminance = luminanceOf(canopy);
  const canopyLab = toLab(
    canopy.map(
      (channel) => channel + (canopyLuminance - channel) * desaturation,
    ),
  );

  const MINIMUM_TINT_DELTA_E = 18;
  let worst = Infinity;
  let worstKey = "";
  for (const tint of tints) {
    const lab = toLab(parseHex(tint.color));
    const distance = Math.hypot(
      lab[0] - canopyLab[0],
      lab[1] - canopyLab[1],
      lab[2] - canopyLab[2],
    );
    if (distance < worst) {
      worst = distance;
      worstKey = tint.key;
    }
    assert(
      distance >= MINIMUM_TINT_DELTA_E,
      `Accent tint ${tint.key} sits ΔE ${distance.toFixed(1)} from the shipped meadow canopy; a flower that close to the grass is texture, not a flower.`,
    );
  }

  console.log(
    `[flower-variety] ${tints.length} accent tints clear ${defaultArtDirectionKey} ` +
      `by ΔE ${worst.toFixed(1)} at worst (${worstKey}), against a floor of ` +
      `${MINIMUM_TINT_DELTA_E}.`,
  );
}

console.log(
  "[flower-variety] Height, silhouette, composition, shading, and phenotype checks passed.",
);
