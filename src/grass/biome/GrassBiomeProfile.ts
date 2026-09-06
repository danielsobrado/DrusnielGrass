import profileData from "./GrassBiomeProfiles.json";
import {
  findGrassAccentSpecies,
  GRASS_ACCENT_TINTS,
  GRASS_ACCENT_TINT_NONE,
  resolveGrassAccentTintRow,
} from "./GrassAccentSpecies";

export const GRASS_MAX_BIOMES = 8;
export const GRASS_MAX_ACCENT_PROFILE_ENTRIES = 16;

export type GrassBiomePaletteSource = "art" | "profile";

export interface GrassBiomeProfile {
  key: string;
  index: number;
  label: string;
  paletteSource: GrassBiomePaletteSource;
  baseColor: string;
  tipColor: string;
  dryColor: string;
  rootDarkening: number;
  tipColorStrength: number;
  worldShare: number;
  density: number;
  minimumClimateDensityRetention: number;
  heightBand: readonly [number, number];
  widthBand: readonly [number, number];
  drynessBias: number;
  windDamping: number;
  shapeFamily: string;
  accentDensity: number;
  accentSpecies: readonly GrassBiomeAccentSpecies[];
}

interface GrassBiomeAccentSpeciesSource {
  species: string;
  tint?: string;
  weight: number;
}

export interface GrassBiomeAccentSpecies {
  species: string;
  speciesIndex: number;
  tint: string;
  tintRow: number;
  weight: number;
}

const DEFAULT_ACCENT_SPECIES_SOURCE: readonly GrassBiomeAccentSpeciesSource[] =
  Object.freeze([
    { species: "daisy", tint: "white", weight: 1.2 },
    { species: "daisy", tint: "cream", weight: 0.7 },
    { species: "daisy", tint: "sky-blue", weight: 0.25 },
    { species: "round-bloom", tint: "pink", weight: 0.35 },
    { species: "round-bloom", tint: "lavender", weight: 0.25 },
    { species: "round-bloom", tint: "buttercup", weight: 0.15 },
    { species: "round-bloom", tint: "poppy-red", weight: 0.1 },
    { species: "fern", tint: GRASS_ACCENT_TINT_NONE, weight: 1.7 },
    { species: "small-fern", tint: GRASS_ACCENT_TINT_NONE, weight: 1 },
    { species: "grass-tuft", tint: GRASS_ACCENT_TINT_NONE, weight: 3.6 },
    { species: "broadleaf-rosette", tint: GRASS_ACCENT_TINT_NONE, weight: 1.7 },
    { species: "low-shrub", tint: GRASS_ACCENT_TINT_NONE, weight: 0.55 },
    { species: "seed-head", tint: "straw", weight: 0.25 },
  ]);

export const GRASS_BIOME_HEIGHT_BAND_LIMIT = Object.freeze([0.7, 1.14] as const);
export const GRASS_BIOME_WIDTH_BAND_LIMIT = Object.freeze([0.76, 1.1] as const);
export const GRASS_BIOME_WIND_DAMPING_LIMIT = Object.freeze([0.7, 1] as const);

export const GRASS_BIOME_VERSION = 5;

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function fail(message: string): never {
  throw new Error(`[grass-biome] ${message}`);
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

function assertBand(
  value: unknown,
  limit: readonly [number, number],
  label: string,
): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`${label} must be a two-element band.`);
  }
  const minimum = assertFiniteInRange(value[0], limit[0], limit[1], `${label} minimum`);
  const maximum = assertFiniteInRange(value[1], limit[0], limit[1], `${label} maximum`);
  if (minimum > maximum) {
    fail(`${label} is reversed.`);
  }
  return [minimum, maximum] as const;
}

function resolveAccentSpeciesEntry(
  item: Record<string, unknown>,
  where: string,
): GrassBiomeAccentSpecies {
  if (typeof item.species !== "string") {
    fail(`${where} needs a species name.`);
  }
  const species = findGrassAccentSpecies(item.species);
  if (!species) {
    fail(`${where} names an unknown accent species.`);
  }
  const tint = item.tint ?? GRASS_ACCENT_TINT_NONE;
  if (
    typeof tint !== "string" ||
    (tint !== GRASS_ACCENT_TINT_NONE &&
      !GRASS_ACCENT_TINTS.some((entryTint) => entryTint.key === tint))
  ) {
    fail(`${where} names an unknown accent tint.`);
  }
  const weight = item.weight;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
    fail(`${where} weight must be a positive finite number.`);
  }
  return Object.freeze({
    species: item.species,
    speciesIndex: species.index,
    tint,
    tintRow: resolveGrassAccentTintRow(tint),
    weight,
  });
}

function assertAccentSpecies(
  value: unknown,
  label: string,
): readonly GrassBiomeAccentSpecies[] {
  const source =
    value === undefined ? DEFAULT_ACCENT_SPECIES_SOURCE : value;
  if (!Array.isArray(source) || source.length === 0) {
    fail(`${label} must be a non-empty array when present.`);
  }
  if (source.length > GRASS_MAX_ACCENT_PROFILE_ENTRIES) {
    fail(
      `${label} must contain at most ${GRASS_MAX_ACCENT_PROFILE_ENTRIES} entries, got ${source.length}.`,
    );
  }
  return Object.freeze(
    source.map((entry, position) => {
      const where = `${label}[${position}]`;
      return resolveAccentSpeciesEntry(assertRecord(entry, where), where);
    }),
  );
}

function validate(key: string, raw: Record<string, unknown>): GrassBiomeProfile {
  const index = raw.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    fail(`Biome ${key} needs a non-negative integer index.`);
  }
  if (typeof raw.label !== "string" || raw.label.length === 0) {
    fail(`Biome ${key} needs a label.`);
  }
  if (raw.paletteSource !== "art" && raw.paletteSource !== "profile") {
    fail(`Biome ${key} paletteSource must be "art" or "profile".`);
  }
  if (index === 0 && raw.paletteSource !== "art") {
    fail(
      "Biome 0 must take the art direction's palette so a single-biome world " +
        "renders identically to one without biome support.",
    );
  }
  for (const field of ["baseColor", "tipColor", "dryColor"] as const) {
    if (typeof raw[field] !== "string" || !COLOR_PATTERN.test(raw[field])) {
      fail(`Biome ${key} ${field} must be #RRGGBB.`);
    }
  }
  if (typeof raw.shapeFamily !== "string" || raw.shapeFamily.length === 0) {
    fail(`Biome ${key} needs a shapeFamily.`);
  }

  return {
    key,
    index,
    label: raw.label,
    paletteSource: raw.paletteSource,
    baseColor: raw.baseColor as string,
    tipColor: raw.tipColor as string,
    dryColor: raw.dryColor as string,
    rootDarkening: assertFiniteInRange(
      raw.rootDarkening,
      0,
      1,
      `Biome ${key} rootDarkening`,
    ),
    tipColorStrength: assertFiniteInRange(
      raw.tipColorStrength,
      0,
      1,
      `Biome ${key} tipColorStrength`,
    ),
    worldShare: assertFiniteInRange(
      raw.worldShare,
      0.01,
      1,
      `Biome ${key} worldShare`,
    ),
    density: assertFiniteInRange(raw.density, 0.0001, 1, `Biome ${key} density`),
    minimumClimateDensityRetention: assertFiniteInRange(
      raw.minimumClimateDensityRetention,
      0,
      1,
      `Biome ${key} minimumClimateDensityRetention`,
    ),
    heightBand: assertBand(
      raw.heightBand,
      GRASS_BIOME_HEIGHT_BAND_LIMIT,
      `Biome ${key} heightBand`,
    ),
    widthBand: assertBand(
      raw.widthBand,
      GRASS_BIOME_WIDTH_BAND_LIMIT,
      `Biome ${key} widthBand`,
    ),
    drynessBias: assertFiniteInRange(
      raw.drynessBias,
      0,
      0.6,
      `Biome ${key} drynessBias`,
    ),
    windDamping: assertFiniteInRange(
      raw.windDamping,
      GRASS_BIOME_WIND_DAMPING_LIMIT[0],
      GRASS_BIOME_WIND_DAMPING_LIMIT[1],
      `Biome ${key} windDamping`,
    ),
    shapeFamily: raw.shapeFamily,
    accentDensity:
      raw.accentDensity === undefined
        ? 1
        : assertFiniteInRange(
            raw.accentDensity,
            0,
            1,
            `Biome ${key} accentDensity`,
          ),
    accentSpecies: assertAccentSpecies(
      raw.accentSpecies,
      `Biome ${key} accentSpecies`,
    ),
  };
}

function loadProfiles(): readonly GrassBiomeProfile[] {
  const root = assertRecord(profileData, "Grass biome profile data");
  const entries = Object.entries(root);
  if (entries.length === 0) {
    fail("At least one biome profile is required.");
  }
  if (entries.length > GRASS_MAX_BIOMES) {
    fail(
      `At most ${GRASS_MAX_BIOMES} biome profiles fit the bounded palette ` +
        `uniform arrays, found ${entries.length}.`,
    );
  }
  const profiles = entries.map(([key, raw]) =>
    validate(key, assertRecord(raw, `Biome ${key}`)),
  );
  profiles.sort((left, right) => left.index - right.index);
  profiles.forEach((profile, position) => {
    if (profile.index !== position) {
      fail(
        `Biome indices must be dense from 0; ${profile.key} has index ` +
          `${profile.index} at position ${position}.`,
      );
    }
  });
  const totalShare = profiles.reduce(
    (sum, profile) => sum + profile.worldShare,
    0,
  );
  if (profiles.length > 1 && profiles[0].worldShare / totalShare < 0.4) {
    fail(
      "Biome 0 must hold at least 40% of the world: it carries the art " +
        "direction's palette, and a world where it is a minority no longer " +
        "looks like the active preset.",
    );
  }
  return Object.freeze(profiles.map((profile) => Object.freeze(profile)));
}

export const GRASS_BIOME_PROFILES = loadProfiles();

function bandMean(band: readonly [number, number]): number {
  return (band[0] + band[1]) * 0.5;
}

export function resolveGrassBiomeHeightRatio(profile: GrassBiomeProfile): number {
  return Math.min(
    1,
    bandMean(profile.heightBand) / bandMean(GRASS_BIOME_PROFILES[0].heightBand),
  );
}

export function resolveGrassBiomeWidthRatio(profile: GrassBiomeProfile): number {
  return Math.min(
    1,
    bandMean(profile.widthBand) / bandMean(GRASS_BIOME_PROFILES[0].widthBand),
  );
}
