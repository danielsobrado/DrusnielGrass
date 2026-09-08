import type { ConfigNumberRule } from "../../config/FlatConfigValueReader";

/**
 * Everything the optional experience systems are allowed to be told at load.
 *
 * Separate from `WorldConfig` on purpose: that file describes the world itself
 * — terrain, ecology, hydrology — and regenerating it changes what the place
 * is. These keys only decide which optional systems exist and how large their
 * budgets are. Turning one off must leave the same world, minus one effect.
 */
export interface WorldExperienceConfig {
  readonly weatherEnabled: boolean;
  readonly rainEnabled: boolean;
  readonly audioEnabled: boolean;
  readonly leavesEnabled: boolean;
  readonly birdsEnabled: boolean;
  readonly painterEnabled: boolean;
  readonly tourEnabled: boolean;
  readonly cinematicEnabled: boolean;
  readonly desktopRainCount: number;
  readonly compactRainCount: number;
  readonly desktopLeafCount: number;
  readonly compactLeafCount: number;
  readonly desktopBirdCount: number;
  readonly compactBirdCount: number;
  readonly desktopAudioVoices: number;
  readonly compactAudioVoices: number;
  readonly desktopPostSamples: number;
  readonly compactPostSamples: number;
  readonly authoringTileSize: number;
  readonly authoringTileResolution: number;
  readonly authoringMaxTiles: number;
  readonly tourDurationSeconds: number;
  readonly wettingSeconds: number;
  readonly dryingSeconds: number;
}

export type WorldExperienceFlagKey = {
  [Key in keyof WorldExperienceConfig]:
  WorldExperienceConfig[Key] extends boolean ? Key : never
}[keyof WorldExperienceConfig];

export type WorldExperienceNumberKey = Exclude<
  keyof WorldExperienceConfig, WorldExperienceFlagKey
>;

/**
 * Every flag defaults to on.
 *
 * A feature that is present but disabled is a feature nobody sees fail, so the
 * shipped state is the tested state; the flags exist to isolate a system while
 * working on it and to switch one off on a device that cannot afford it.
 */
export const WORLD_EXPERIENCE_FLAG_DEFAULTS:
Readonly<Record<WorldExperienceFlagKey, boolean>> = Object.freeze({
  weatherEnabled: true,
  rainEnabled: true,
  audioEnabled: true,
  leavesEnabled: true,
  birdsEnabled: true,
  painterEnabled: true,
  tourEnabled: true,
  cinematicEnabled: true,
});

/** Multisample counts a post pipeline may ask for; anything else is a typo. */
export const ALLOWED_POST_SAMPLES = Object.freeze([0, 2, 4]);

/**
 * The authoring grid is fixed for now.
 *
 * T10 stores painter documents against a tile size and resolution, so a world
 * authored at one grid cannot be read back at another. Until that migration
 * exists, the loader requires the shipped values rather than accepting a number
 * that would silently invalidate saved work.
 */
export const REQUIRED_AUTHORING_TILE_SIZE = 32;
export const REQUIRED_AUTHORING_TILE_RESOLUTION = 128;

const COUNT_RULE = (maximum: number): ConfigNumberRule =>
  ({ minimum: 0, maximum, integer: true });

export const WORLD_EXPERIENCE_NUMBER_SCHEMA:
Readonly<Record<WorldExperienceNumberKey, ConfigNumberRule>> = Object.freeze({
  desktopRainCount: COUNT_RULE(10000),
  compactRainCount: COUNT_RULE(10000),
  desktopLeafCount: COUNT_RULE(512),
  compactLeafCount: COUNT_RULE(512),
  desktopBirdCount: COUNT_RULE(32),
  compactBirdCount: COUNT_RULE(32),
  // At least one voice: a mixer with no voices cannot play the sound that
  // proves audio is working, which is exactly when someone reaches for this.
  desktopAudioVoices: { minimum: 1, maximum: 32, integer: true },
  compactAudioVoices: { minimum: 1, maximum: 32, integer: true },
  desktopPostSamples: { minimum: 0, maximum: 4, integer: true },
  compactPostSamples: { minimum: 0, maximum: 4, integer: true },
  authoringTileSize: {
    minimum: REQUIRED_AUTHORING_TILE_SIZE,
    maximum: REQUIRED_AUTHORING_TILE_SIZE,
    integer: true,
  },
  authoringTileResolution: {
    minimum: REQUIRED_AUTHORING_TILE_RESOLUTION,
    maximum: REQUIRED_AUTHORING_TILE_RESOLUTION,
    integer: true,
  },
  authoringMaxTiles: { minimum: 1, maximum: 1024, integer: true },
  tourDurationSeconds: { minimum: 10, maximum: 120 },
  wettingSeconds: { exclusiveMinimum: 0, maximum: 300 },
  dryingSeconds: { exclusiveMinimum: 0, maximum: 300 },
});

/** The shipped values, and the fallback when no experience config is present. */
export const WORLD_EXPERIENCE_DEFAULTS: WorldExperienceConfig = Object.freeze({
  ...WORLD_EXPERIENCE_FLAG_DEFAULTS,
  desktopRainCount: 4000,
  compactRainCount: 1000,
  desktopLeafCount: 192,
  compactLeafCount: 48,
  desktopBirdCount: 12,
  compactBirdCount: 4,
  desktopAudioVoices: 16,
  compactAudioVoices: 8,
  desktopPostSamples: 4,
  compactPostSamples: 0,
  authoringTileSize: REQUIRED_AUTHORING_TILE_SIZE,
  authoringTileResolution: REQUIRED_AUTHORING_TILE_RESOLUTION,
  authoringMaxTiles: 1024,
  tourDurationSeconds: 30,
  wettingSeconds: 8,
  dryingSeconds: 45,
});

/**
 * Rejects a sample count the pipeline cannot use.
 *
 * The range check accepts 1 and 3; multisampling does not. Clamping to GPU
 * support happens later, against the live capability probe — this only rejects
 * a value that was never meaningful.
 */
export function validateWorldExperienceConfig(config: WorldExperienceConfig): void {
  for (const key of ["desktopPostSamples", "compactPostSamples"] as const) {
    if (!ALLOWED_POST_SAMPLES.includes(config[key])) {
      throw new Error(
        `Experience config value ${key} must be one of ${ALLOWED_POST_SAMPLES.join(", ")}.`,
      );
    }
  }
  if (config.compactRainCount > config.desktopRainCount) {
    throw new Error(
      "Experience config compactRainCount must not exceed desktopRainCount.",
    );
  }
}

/** The per-profile budgets, resolved once rather than branched at every use. */
export interface WorldExperienceBudgets {
  readonly rainCount: number;
  readonly leafCount: number;
  readonly birdCount: number;
  readonly audioVoices: number;
  readonly postSamples: number;
}

export function resolveExperienceBudgets(
  config: WorldExperienceConfig, compact: boolean,
): WorldExperienceBudgets {
  return Object.freeze({
    rainCount: compact ? config.compactRainCount : config.desktopRainCount,
    leafCount: compact ? config.compactLeafCount : config.desktopLeafCount,
    birdCount: compact ? config.compactBirdCount : config.desktopBirdCount,
    audioVoices: compact ? config.compactAudioVoices : config.desktopAudioVoices,
    postSamples: compact ? config.compactPostSamples : config.desktopPostSamples,
  });
}
