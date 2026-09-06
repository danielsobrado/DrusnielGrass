/**
 * The detail-foliage species catalogue: ferns, flowers, seed heads, low shrubs,
 * and broadleaf rosettes.
 *
 * This is pure data with no renderer dependency, because four layers need to
 * agree on it: the biome profiles name species and tints, the atlas factory
 * bakes one cell per species, the placement field reads the height bands and
 * the macro gate each species belongs to, and the material uploads the wind
 * weights as a bounded uniform array. One catalogue keeps those four in step —
 * the same reason the biome profiles themselves are loaded once and validated.
 *
 * Both tables are bounded: the shader indexes them with a
 * per-instance row, exactly like the biome palette arrays, so their length is a
 * uniform-array size and never a draw-call or program count.
 */

/**
 * Ten species, eight tints. The cap is a uniform-array size, not a draw-call or
 * program count, so it was raised from eight to admit the sub-canopy ground
 * layer: two more rows of `uSpeciesWind` and two more atlas columns
 * (1280x256 instead of 1024x256). It stays a hard bound because the shader
 * indexes it with a per-instance row.
 */
export const GRASS_MAX_ACCENT_SPECIES = 10;
export const GRASS_MAX_ACCENT_TINTS = 8;

/**
 * Which macro field decides where a species belongs. The categories are what
 * make the field read as *mixed* rather than as a uniform sprinkle: flowers
 * follow vigour, seed heads follow dryness, ferns follow the poorer ground the
 * blade layer is already thinning on, and tufts fill everywhere. Those fields
 * disagree with each other spatially, so their union is patchy at metre scale
 * without any extra noise of its own.
 */
export type GrassAccentCategory =
  | "groundcover"
  | "tuft"
  | "shrub"
  | "fern"
  | "broadleaf"
  | "flower"
  | "seed";

export interface GrassAccentSpeciesDefinition {
  key: string;
  index: number;
  category: GrassAccentCategory;
  /** Card width as a fraction of its height. The atlas cell is drawn to match. */
  aspect: number;
  /** Wind response, in [0.3, 1]; the per-texel mask the article uses cannot act
   * in a vertex stage, so this scalar times a height ramp is its equivalent. */
  windWeight: number;
  /**
   * Card height band as a **multiple of the grass canopy height**, sampled per
   * instance and resolved to metres at build time.
   *
   * Relative, not absolute, and that is the whole point: an accent layer exists
   * to be seen, so every one of these bands is a statement about where a species
   * sits against the blades around it — a daisy's bloom at the canopy line, a
   * seed head above it, a small fern below. Absolute metres cannot express that.
   * They were tried first and the layer rendered invisible: the blade silhouette
   * pass had meanwhile taken the canopy from 0.83 m to 0.73 m while the accents
   * kept 0.3-0.7 m heights authored against an older, taller field, so ~1 500
   * cards were streaming, building, and drawing entirely underneath the grass.
   *
   * Anchoring to the canopy makes that failure impossible to reintroduce: blade
   * heights are config (`bladeHeightMin`/`Max`) and have changed once already.
   */
  canopyHeightBand: readonly [number, number];
}

/**
 * The canopy a band of 1.0 refers to: the height {@link
 * WorldSingleBladeTileFactory.createSingleBladeGeometry} builds a blade at,
 * which is the mean of the configured blade height range. Per-instance vertical
 * scale varies individual blades around it by roughly ±20%.
 */
export function resolveGrassCanopyHeight(
  bladeHeightMin: number,
  bladeHeightMax: number,
): number {
  return (bladeHeightMin + bladeHeightMax) * 0.5;
}

export const GRASS_ACCENT_SPECIES: readonly GrassAccentSpeciesDefinition[] =
  Object.freeze(
    (
      [
        {
          key: "grass-tuft",
          category: "tuft",
          aspect: 1.05,
          windWeight: 0.85,
          canopyHeightBand: [0.9, 1.25],
        },
        {
          key: "low-shrub",
          category: "shrub",
          aspect: 1.25,
          windWeight: 0.35,
          canopyHeightBand: [0.85, 1.3],
        },
        {
          key: "fern",
          category: "fern",
          // A frond is the layer's largest silhouette, so it is sized to the
          // reserved bounds envelope rather than to the canopy it stands in:
          // 2.05 canopies is ~1.5 m of frond over 0.73 m grass. Growing the
          // structural species past the flowers is what widened the reserved
          // bounds envelope from 1.72/1.314 to 2.05/1.96; the cost is a more
          // conservative tile bounding sphere, paid once in frustum culling.
          aspect: 0.95,
          windWeight: 0.35,
          canopyHeightBand: [1.35, 2.05],
        },
        {
          key: "small-fern",
          category: "fern",
          aspect: 1.05,
          windWeight: 0.4,
          canopyHeightBand: [1, 1.5],
        },
        {
          key: "daisy",
          category: "flower",
          aspect: 0.72,
          windWeight: 0.7,
          // Wild daisies should not form one mechanical horizon. The atlas
          // phenotype also varies stem length, so this broad card band produces
          // both blooms tucked into the canopy and occasional taller stems.
          canopyHeightBand: [0.88, 1.58],
        },
        {
          key: "round-bloom",
          category: "flower",
          aspect: 0.9,
          windWeight: 0.65,
          // A different band and aspect keep this family visibly distinct from
          // daisies even before petal shape and colour variation are applied.
          canopyHeightBand: [0.82, 1.46],
        },
        {
          key: "seed-head",
          category: "seed",
          aspect: 0.5,
          windWeight: 1,
          canopyHeightBand: [1.3, 1.72],
        },
        {
          key: "broadleaf-rosette",
          category: "broadleaf",
          // Widest card in the catalogue and deliberately the lowest of the
          // large species: broad leaves read as ground mass under the ferns
          // rather than competing with them at the canopy line.
          aspect: 1.45,
          windWeight: 0.42,
          canopyHeightBand: [0.85, 1.35],
        },
        {
          // The sub-canopy layer. Both sit below 0.5 canopies, so they are read
          // as ground the blades stand in rather than as another thing standing
          // in it: wide, near-flat cards that close the gap between the soil and
          // the shortest blade instead of competing at the canopy line.
          key: "clover-patch",
          category: "groundcover",
          aspect: 2.1,
          windWeight: 0.34,
          canopyHeightBand: [0.24, 0.42],
        },
        {
          key: "leaf-litter",
          category: "groundcover",
          aspect: 2.8,
          windWeight: 0.3,
          canopyHeightBand: [0.12, 0.24],
        },
      ] as const
    ).map((definition, index) =>
      Object.freeze({ ...definition, index } as GrassAccentSpeciesDefinition),
    ),
  );

/**
 * Tint rows for the atlas's B channel, which marks petals and seed clusters.
 *
 * The colour is per instance rather than per material, so one atlas yields a
 * broad wildflower mix with no extra draw and no second texture. Saturated
 * flower hues are intentional hero accents; stems and leaf mass remain tied to
 * the biome palette through the atlas channels.
 */
export const GRASS_ACCENT_TINTS: readonly { key: string; color: string }[] =
  Object.freeze([
    { key: "white", color: "#f2efd8" },
    { key: "cream", color: "#f0dea0" },
    { key: "buttercup", color: "#f2c62f" },
    { key: "poppy-red", color: "#dc5b3f" },
    { key: "pink", color: "#df829c" },
    { key: "lavender", color: "#ad98d8" },
    { key: "straw", color: "#d8bd68" },
    { key: "sky-blue", color: "#8ec4d4" },
  ]);

/** The tint every untinted species uses. Their B channel is zero, so the row
 * is never read — naming it keeps `"none"` a valid profile value. */
export const GRASS_ACCENT_TINT_NONE = "none";

export function findGrassAccentSpecies(
  key: string,
): GrassAccentSpeciesDefinition | undefined {
  return GRASS_ACCENT_SPECIES.find((species) => species.key === key);
}

export function resolveGrassAccentTintRow(key: string): number {
  if (key === GRASS_ACCENT_TINT_NONE) {
    return 0;
  }
  const row = GRASS_ACCENT_TINTS.findIndex((tint) => tint.key === key);
  return row < 0 ? 0 : row;
}

/**
 * The one float each instance carries. Species, atlas variant row, and tint fit
 * a single attribute, which keeps the accent layer on the same four-attribute
 * budget as every other grass layer.
 */
/**
 * Packs a card's identity into one float attribute.
 *
 * The species stride was 16, which left `variantRow` exactly one bit and capped
 * the atlas at two phenotypes per species. Four maturation states need two, so
 * the stride is 32; the tint keeps its low three bits. The widest value this
 * produces is 10 species x 32 + 3 x 8 + 7 = 351, exact in a float32 attribute
 * with three orders of magnitude to spare.
 *
 * The decode in `WorldDetailFoliageMaterial`'s vertex stage must use the same
 * stride, and `verify-understory-morphology` parses both to check that it does.
 */
export function packGrassAccent(
  speciesIndex: number,
  variantRow: number,
  tintRow: number,
): number {
  return speciesIndex * 32 + variantRow * 8 + tintRow;
}
