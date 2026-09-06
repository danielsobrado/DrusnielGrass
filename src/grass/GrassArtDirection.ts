import presetData from "./GrassArtPresets.json";

export type GrassArtDirectionKey = keyof typeof presetData;

export interface GrassArtDirection {
  key: GrassArtDirectionKey;
  label: string;
  baseColor: string;
  tipColor: string;
  dryColor: string;
  rootDarkening: number;
  tipColorStrength: number;
  normalUp: number;
  ambientBoost: number;
  backlightStrength: number;
  impostorBaseColorBlend: number;
  impostorColorScale: number;
  terrainGrassColor: string;
  terrainGrassTintStrength: number;
  densityScale: number;
  windStrengthScale: number;
  flutterStrengthScale: number;
  gustDepth?: number;
  gustTipBoost?: number;
  nearDistance: number;
  midDistance: number;
  farDistance: number;
  transitionDistance: number;
}

/**
 * The shipped look.
 *
 * Moved off `lush-hero`, whose tips ran 38% brighter than its base before any
 * lighting reached them. That is a hero shot's palette -- it reads as a single
 * saturated green because every blade is near the top of the gamut, and nothing
 * downstream can put contrast back into a field that has none. `muted-meadow`
 * gives up the peak brightness for range: tips only 24% over base, a wider
 * shade band, and a dry tone that is genuinely a different hue rather than the
 * same green with the saturation pulled out. The old presets stay for
 * comparison and are still exercised by every gate.
 */
export const DEFAULT_GRASS_ART_DIRECTION_KEY: GrassArtDirectionKey =
  "muted-meadow";

export const GRASS_ART_DIRECTIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(presetData).map(([key, direction]) => [
      key,
      Object.freeze(direction),
    ]),
  ) as unknown as Record<GrassArtDirectionKey, GrassArtDirection>,
);

export function resolveGrassArtDirectionKey(
  value: string | null | undefined,
): GrassArtDirectionKey {
  return value &&
    Object.prototype.hasOwnProperty.call(GRASS_ART_DIRECTIONS, value)
    ? (value as GrassArtDirectionKey)
    : DEFAULT_GRASS_ART_DIRECTION_KEY;
}
