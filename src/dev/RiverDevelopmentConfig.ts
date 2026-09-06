import type { WorldConfig } from "../world/WorldConfig";
import { validateWorldConfig } from "../world/WorldConfigValidator";

export const RIVER_TUNING_STORAGE_KEY = "fluffygrass:river-tuning:v2";

export const RIVER_DEVELOPMENT_OVERRIDE_KEYS = [
  "riverWidthVariation",
  "riverBendBankAsymmetry",
  "riverDepthVariation",
  "riverBendChannelShift",
  "waterRiverPoolFlowScale",
  "waterRiverRiffleFlowScale",
  "waterShoreFoamWeight",
  "waterRiffleFoamWeight",
  "waterStoneFoamWeight",
  "waterOpacity",
  "waterRippleStrength",
  "waterRippleScale",
  "waterFlowSpeed",
  "waterFoamStrength",
  "waterFresnelStrength",
  "waterDepthFade",
  "waterRoughness",
  "waterFlowNoiseStrength",
  "waterCausticStrength",
  "waterGlintStrength",
  "waterStoneWakeStrength",
  "waterStoneWakeLength",
  "waterBedStrength",
  "waterBedScale",
  "waterBedRefraction",
  "waterAlgaeStrength",
] as const;

export type RiverDevelopmentOverrideKey =
  (typeof RIVER_DEVELOPMENT_OVERRIDE_KEYS)[number];

export type RiverDevelopmentOverrides = Partial<
  Pick<WorldConfig, RiverDevelopmentOverrideKey>
>;

const OVERRIDE_KEY_SET = new Set<string>(RIVER_DEVELOPMENT_OVERRIDE_KEYS);

export function readRiverDevelopmentOverrides(): RiverDevelopmentOverrides {
  const raw = sessionStorage.getItem(RIVER_TUNING_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return sanitizeRiverDevelopmentOverrides(parsed);
  } catch {
    clearRiverDevelopmentOverrides();
    return {};
  }
}

export function writeRiverDevelopmentOverrides(
  overrides: RiverDevelopmentOverrides,
): void {
  const sanitized = sanitizeRiverDevelopmentOverrides(overrides);
  if (Object.keys(sanitized).length === 0) {
    sessionStorage.removeItem(RIVER_TUNING_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(RIVER_TUNING_STORAGE_KEY, JSON.stringify(sanitized));
}

export function clearRiverDevelopmentOverrides(): void {
  sessionStorage.removeItem(RIVER_TUNING_STORAGE_KEY);
}

export function applyRiverDevelopmentConfig(
  loaded: WorldConfig,
): WorldConfig {
  const overrides = readRiverDevelopmentOverrides();
  if (Object.keys(overrides).length === 0) {
    return loaded;
  }
  try {
    const merged: WorldConfig = { ...loaded, ...overrides };
    validateWorldConfig(merged);
    return Object.freeze(merged);
  } catch (error) {
    console.warn(
      "[Drusniel World] Ignoring invalid river-tuning session overrides.",
      error,
    );
    clearRiverDevelopmentOverrides();
    return loaded;
  }
}

export function serializeRiverConfigYaml(config: WorldConfig): string {
  return RIVER_DEVELOPMENT_OVERRIDE_KEYS.map(
    (key) => `${key}: ${formatYamlNumber(config[key])}`,
  ).join("\n");
}

function sanitizeRiverDevelopmentOverrides(
  values: Record<string, unknown> | RiverDevelopmentOverrides,
): RiverDevelopmentOverrides {
  const sanitized: RiverDevelopmentOverrides = {};
  for (const key of Object.keys(values)) {
    if (!OVERRIDE_KEY_SET.has(key)) {
      continue;
    }
    const value = values[key as RiverDevelopmentOverrideKey];
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key as RiverDevelopmentOverrideKey] = value;
    }
  }
  return sanitized;
}

function formatYamlNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toPrecision(12)));
}
