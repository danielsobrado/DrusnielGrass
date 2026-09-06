import { resolveStoneGrowthWeights } from "./StoneGrowthField";
import { STONE_PALETTES, type StonePaletteKey } from "./StonePalette";

function fail(message: string): never {
  throw new Error(`[stones-growth] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

/** Deterministic invariant checks for coarse moss/lichen placement. */
export function verifyStoneGrowthField(): string {
  const palettes = Object.keys(STONE_PALETTES) as StonePaletteKey[];
  let samples = 0;

  for (const paletteKey of palettes) {
    for (const normalY of [-0.7, 0, 0.45, 0.9]) {
      for (const heightFraction of [0, 0.35, 0.7, 1]) {
        for (const exposure of [0, 0.5, 1]) {
          for (const environmentMoss of [0, 0.4, 1]) {
            const weights = resolveStoneGrowthWeights({
              baseMossSusceptibility: 0.55,
              normalY,
              heightFraction,
              exposure,
              exposureStrength: 0.7,
              environmentMoss,
              paletteKey,
              graniteBlend: paletteKey === "graniteGrey" ? 1 : 0,
            });
            assert(
              Number.isFinite(weights.moss) &&
                weights.moss >= 0 &&
                weights.moss <= 1,
              `${paletteKey} produced invalid moss ${weights.moss}.`,
            );
            assert(
              Number.isFinite(weights.lichen) &&
                weights.lichen >= 0 &&
                weights.lichen <= 1,
              `${paletteKey} produced invalid lichen ${weights.lichen}.`,
            );
            samples += 1;
          }
        }
      }
    }
  }

  const sheltered = resolveStoneGrowthWeights({
    baseMossSusceptibility: 0.75,
    normalY: 0.4,
    heightFraction: 0.45,
    exposure: 0,
    exposureStrength: 0.8,
    environmentMoss: 0.9,
    paletteKey: "meadowSage",
    graniteBlend: 0,
  });
  const exposed = resolveStoneGrowthWeights({
    baseMossSusceptibility: 0.75,
    normalY: 0.4,
    heightFraction: 0.45,
    exposure: 1,
    exposureStrength: 0.8,
    environmentMoss: 0.9,
    paletteKey: "meadowSage",
    graniteBlend: 0,
  });
  assert(
    sheltered.moss > exposed.moss,
    "Exposure must reduce moss on otherwise identical stone.",
  );

  const mossFree = resolveStoneGrowthWeights({
    baseMossSusceptibility: 0,
    normalY: 0,
    heightFraction: 0.7,
    exposure: 0.55,
    exposureStrength: 0.7,
    environmentMoss: 0.8,
    paletteKey: "graniteGrey",
    graniteBlend: 1,
  });
  const mossOccupied = resolveStoneGrowthWeights({
    baseMossSusceptibility: 1,
    normalY: 0,
    heightFraction: 0.7,
    exposure: 0.55,
    exposureStrength: 0.7,
    environmentMoss: 0.8,
    paletteKey: "graniteGrey",
    graniteBlend: 1,
  });
  assert(
    mossOccupied.lichen < mossFree.lichen,
    "Actual moss coverage must compete with lichen coverage.",
  );

  return `${samples} coarse growth samples`;
}
