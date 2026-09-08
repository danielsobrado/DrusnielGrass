/**
 * The identifier catalogs the experience layer selects from.
 *
 * Held as explicit frozen lists rather than free strings because every one of
 * them is chosen by a user — from a stored setting, a URL override or a menu —
 * and an unrecognised identifier has to be rejectable before it reaches a
 * system that would silently do nothing with it.
 */

/** Weather changes illumination, wind response and wetness; never ecology. */
export const WEATHER_PRESET_IDS = Object.freeze([
  "drusniel", "sunny", "goldenHour", "rainy", "windy", "calm", "bowed", "moonlight",
] as const);
export type WeatherPresetId = (typeof WEATHER_PRESET_IDS)[number];

/** The blade silhouettes T09 offers; listed here so T01 can validate them. */
export const GRASS_SILHOUETTE_IDS = Object.freeze([
  "blade", "ribbon", "reed", "tuft",
] as const);
export type GrassSilhouetteId = (typeof GRASS_SILHOUETTE_IDS)[number];

/** Playable appearances T13 offers, keyed independently of the locomotion rig. */
export const CHARACTER_IDS = Object.freeze([
  "drow", "villager", "ranger", "wanderer",
] as const);
export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Quality changes resource budgets only; it never selects weather or shape. */
export const QUALITY_IDS = Object.freeze([
  "low", "medium", "high", "ultra",
] as const);
export type QualityId = (typeof QUALITY_IDS)[number];

/**
 * Which wind model drives the world.
 *
 * `cinematic` is the shared field every representation reads. `legacy` leaves
 * each material on its own gust model, and exists so the shared field can be
 * compared against what the world looked like before it.
 */
export const WIND_MODEL_IDS = Object.freeze(["cinematic", "legacy"] as const);
export type WindModelId = (typeof WIND_MODEL_IDS)[number];
/**
 * `legacy` until the shared field's cost is understood.
 *
 * The shared field is correct — bit-identical to the model it was ported from,
 * and agreeing between CPU and GPU — but measures 15.5 ms median against 7.6 ms
 * for the per-material model, and three attempts to find that cost in texture
 * fetches each failed to move it. Shipping a default nobody measured as
 * affordable would be the wrong way round.
 */
export const DEFAULT_WIND_MODEL: WindModelId = "legacy";

export const DEFAULT_WEATHER_PRESET: WeatherPresetId = "drusniel";
export const DEFAULT_GRASS_SILHOUETTE: GrassSilhouetteId = "blade";
export const DEFAULT_CHARACTER: CharacterId = "drow";

/**
 * Narrows an untrusted identifier, reporting rather than guessing.
 *
 * Returns `undefined` for anything not in the catalog so the caller decides
 * what to fall back to and emits exactly one diagnostic. A helper that silently
 * substituted a default would make an invalid stored setting indistinguishable
 * from a deliberate one.
 */
export function resolveCatalogId<Id extends string>(
  catalog: readonly Id[],
  value: string | null | undefined,
): Id | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return catalog.find((entry) => entry === value);
}
