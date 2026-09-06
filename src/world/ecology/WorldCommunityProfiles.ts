import profileData from "./WorldCommunityProfiles.json";
import { GRASS_ACCENT_SPECIES } from "../../grass/biome/GrassAccentSpecies";

/**
 * Which vegetation communities exist, what conditions each one wants, and what
 * it does to the plants that grow in it.
 *
 * The values live in JSON with a version constant for the same reason the biome
 * and art-preset tables do: these are the numbers that get iterated during
 * visual tuning, and a tuning pass should not be a TypeScript edit. This module
 * owns only schema, validation, and resolution.
 *
 * The ordering of concerns matters and is the whole design. `preferences` say
 * where a community is *possible*; nothing here says where one *is*. That is
 * decided in {@link ./WorldCommunityField} by weighting these against a
 * low-frequency composition field, and it is the direction the world model has
 * always run in: `WorldEcologyField` exists because a landscape reads as real
 * when its features agree with each other, and features can only agree if they
 * are consequences of the same cause.
 *
 * Read the preference rows across and the ecology is legible: bare breaks want
 * dry, disturbed, rocky, exposed ground; broadleaf understory wants shade over
 * rich damp soil; tall colonies want wet, fertile, sheltered ground nothing has
 * trampled; short sward wants the drier, more exposed, more trafficked ground
 * between them. None of that is asserted anywhere. It is earned from the
 * ecology that is already being computed.
 */

export const COMMUNITY_SHORT_SWARD = 0;
export const COMMUNITY_TALL_COLONY = 1;
export const COMMUNITY_BARE_BREAK = 2;
export const COMMUNITY_FLOWER_MEADOW = 3;
export const COMMUNITY_BROADLEAF_UNDERSTORY = 4;
export const COMMUNITY_COUNT = 5;

export const WORLD_COMMUNITY_VERSION = 3;

/**
 * The ecology channels a community is scored against.
 *
 * Deliberately the same six `WorldEcologySample` publishes, and deliberately
 * read-only here: a community may consult every one of them and may write none.
 * A community that edited dryness would be deciding the condition that selected
 * it, which is the circularity this layer exists to avoid.
 */
export interface CommunityPreferences {
  /** Each entry is [preferred value, tolerance]. */
  moisture: readonly [number, number];
  fertility: readonly [number, number];
  exposure: readonly [number, number];
  disturbance: readonly [number, number];
  rockiness: readonly [number, number];
  shade: readonly [number, number];
}

/**
 * What a community does to the plants growing in it.
 *
 * Composition only. Biome owns palette, species pool, height band and wind
 * damping; community owns how much of what grows. The two derive from
 * overlapping causes, so any channel appearing in both would stack — a
 * dry-steppe short sward would come out twice as dry as either says.
 *
 * There is no dryness field, and its absence is load-bearing rather than an
 * oversight. `verify-community-field` asserts this interface names no ecology
 * channel.
 */
export interface CommunityResponse {
  density: number;
  height: number;
  accentChance: number;
  /** Multiplier on `GrassHabitatSample.underlayer`. */
  understory: number;
  clumpScale: number;
  /** How strongly the small clearing field may interrupt this community. */
  clearingAffinity: number;
  /** Continuous semantic channels consumed by the terrain material. */
  groundExposure: number;
  organicCover: number;
  dryGroundBias: number;
}

export interface CommunityProfile {
  key: string;
  index: number;
  label: string;
  /** Prior weight before ecology and noise have their say. */
  weight: number;
  /** Tie-break toward dry/sparse (+) or tall/wet (-) grass archetypes. */
  archetypeBias: number;
  preferences: CommunityPreferences;
  response: CommunityResponse;
}

const PREFERENCE_KEYS = [
  "moisture",
  "fertility",
  "exposure",
  "disturbance",
  "rockiness",
  "shade",
] as const;

const RESPONSE_KEYS = [
  "density",
  "height",
  "accentChance",
  "understory",
  "clumpScale",
  "clearingAffinity",
  "groundExposure",
  "organicCover",
  "dryGroundBias",
] as const;

function fail(message: string): never {
  throw new Error(`[world-community] ${message}`);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertFiniteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number.`);
  }
  if (value < minimum || value > maximum) {
    fail(`${label} must be within [${minimum}, ${maximum}], got ${value}.`);
  }
  return value;
}

function assertPreferencePair(
  value: unknown,
  label: string,
): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`${label} must be a [target, tolerance] pair.`);
  }
  const target = assertFiniteInRange(value[0], 0, 1, `${label} target`);
  // A zero tolerance would make the preference a step, and a step in a
  // selection score is a hard community boundary drawn on an ecology contour --
  // the contour-map look the composition field exists to break up.
  const tolerance = assertFiniteInRange(
    value[1],
    0.05,
    2,
    `${label} tolerance`,
  );
  return [target, tolerance] as const;
}

function resolveProfiles(): readonly CommunityProfile[] {
  const source = assertRecord(profileData, "Community profile data");
  assertFiniteInRange(source.version, 1, 1_000, "version");
  if (source.version !== WORLD_COMMUNITY_VERSION) {
    fail(
      `Profile version ${source.version} does not match the expected ${WORLD_COMMUNITY_VERSION}.`,
    );
  }
  const communities = assertRecord(source.communities, "communities");
  const profiles: CommunityProfile[] = [];
  for (const [key, raw] of Object.entries(communities)) {
    const entry = assertRecord(raw, `Community ${key}`);
    const index = assertFiniteInRange(
      entry.index,
      0,
      COMMUNITY_COUNT - 1,
      `${key} index`,
    );
    if (!Number.isInteger(index)) {
      fail(`${key} index must be a whole number.`);
    }
    const preferenceSource = assertRecord(
      entry.preferences,
      `${key} preferences`,
    );
    const preferences = {} as Record<string, readonly [number, number]>;
    for (const channel of PREFERENCE_KEYS) {
      preferences[channel] = assertPreferencePair(
        preferenceSource[channel],
        `${key} ${channel}`,
      );
    }
    const responseSource = assertRecord(entry.response, `${key} response`);
    for (const extra of Object.keys(responseSource)) {
      if (!(RESPONSE_KEYS as readonly string[]).includes(extra)) {
        fail(
          `${key} response carries an unknown field ${extra}; a community may not write what ecology owns.`,
        );
      }
    }
    const response = {} as Record<string, number>;
    for (const channel of RESPONSE_KEYS) {
      response[channel] = assertFiniteInRange(
        responseSource[channel],
        0,
        4,
        `${key} ${channel}`,
      );
    }
    profiles[index] = {
      key,
      index,
      label: typeof entry.label === "string" ? entry.label : key,
      weight: assertFiniteInRange(entry.weight, 0.01, 4, `${key} weight`),
      archetypeBias: assertFiniteInRange(
        entry.archetypeBias,
        -1,
        1,
        `${key} archetype bias`,
      ),
      preferences: preferences as unknown as CommunityPreferences,
      response: response as unknown as CommunityResponse,
    };
  }
  for (let index = 0; index < COMMUNITY_COUNT; index += 1) {
    if (!profiles[index]) {
      fail(`No community profile occupies index ${index}.`);
    }
  }
  return Object.freeze(profiles);
}

export const COMMUNITY_PROFILES = resolveProfiles();

/**
 * Per-species community affinity, indexed by community.
 *
 * Multiplied into the habitat score `DetailFoliageAffinity` already computes,
 * so a species can be common in a community without becoming unconditional
 * there — the same shape as the ecology term it sits beside.
 */
export const COMMUNITY_SPECIES_AFFINITY: readonly (readonly number[])[] =
  (() => {
    const source = assertRecord(
      assertRecord(profileData, "Community profile data").speciesAffinity,
      "speciesAffinity",
    );
    const table: number[][] = [];
    for (const species of GRASS_ACCENT_SPECIES) {
      const raw = source[species.key];
      if (!Array.isArray(raw) || raw.length !== COMMUNITY_COUNT) {
        fail(
          `speciesAffinity.${species.key} must list ${COMMUNITY_COUNT} weights.`,
        );
      }
      table[species.index] = raw.map((value, community) =>
        assertFiniteInRange(
          value,
          0,
          4,
          `speciesAffinity.${species.key}[${community}]`,
        ),
      );
    }
    return Object.freeze(table.map((row) => Object.freeze(row)));
  })();

/** The neutral response: what a community edge fades toward. */
export const NEUTRAL_COMMUNITY_RESPONSE: CommunityResponse = Object.freeze({
  density: 1,
  height: 1,
  accentChance: 1,
  understory: 1,
  clumpScale: 1,
  clearingAffinity: 0.5,
  groundExposure: 0,
  organicCover: 0,
  dryGroundBias: 0,
});
