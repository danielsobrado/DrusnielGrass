import type { WeatherPresetId } from "../experience/WorldExperienceCatalog";
import {
  WORLD_SOURCE_ENVIRONMENT_PRESETS,
  type WorldEnvironmentPresetReference,
} from "./WorldEnvironmentPresets";

const SOURCE_HIGHFIELD_DIRECT_INTENSITY = 5;
const SOURCE_REFERENCE_WIND_NOISE_SCALE = 0.3;
const DESTINATION_CLOUD_THRESHOLD_INTERCEPT = 0.74;
const DESTINATION_CLOUD_THRESHOLD_SLOPE = 0.35;
const DESTINATION_CLOUD_THRESHOLD_MIN = 0.38;
const DESTINATION_CLOUD_THRESHOLD_MAX = 0.70;
const LOWSWAY_STATIC_LEAN_RADIANS = 0.22;
const PALETTE_MULTIPLIER_MIN = 0.65;
const PALETTE_MULTIPLIER_MAX = 1.35;

export interface ResolvedWorldEnvironmentPreset {
  readonly id: WeatherPresetId;
  readonly label: string;
  readonly baseline: boolean;
  readonly sunDirection?: readonly [number, number, number];
  readonly sunColor?: string;
  readonly sunIntensityScale: number;
  readonly hemisphereSkyColor?: string;
  readonly hemisphereGroundColor?: string;
  readonly hemisphereIntensityScale: number;
  readonly ambientColor?: string;
  readonly ambientIntensityScale: number;
  readonly environmentIntensity: number;
  readonly skyHorizonColor?: string;
  readonly skyZenithColor?: string;
  readonly skySunHaloColor?: string;
  readonly skySunDiskColor?: string;
  readonly skyHaloPower?: number;
  readonly skyDiskPower?: number;
  readonly fogColor?: string;
  readonly fogDensityScale: number;
  readonly cloudCoverageTarget?: number;
  readonly cloudThreshold?: number;
  readonly paletteMultiplier: readonly [number, number, number];
  readonly windDirectionDegrees: number;
  readonly windIntensity: number;
  readonly windNoiseScale: number;
  readonly windSimulationSpeed: number;
  readonly restBendGain: number;
  readonly rainIntensity: number;
}

/**
 * Converts an intuitive cloud amount into this world's density threshold.
 * Larger coverage must always lower the threshold because the cloud field uses
 * the opposite convention. The clamp keeps extreme presets inside the range
 * already exercised by the destination cloud shader.
 */
export function resolveDestinationCloudThreshold(targetCoverage: number): number {
  const target = Number.isFinite(targetCoverage)
    ? Math.min(Math.max(targetCoverage, 0), 1)
    : 0;
  return Math.min(
    Math.max(
      DESTINATION_CLOUD_THRESHOLD_INTERCEPT -
        target * DESTINATION_CLOUD_THRESHOLD_SLOPE,
      DESTINATION_CLOUD_THRESHOLD_MIN,
    ),
    DESTINATION_CLOUD_THRESHOLD_MAX,
  );
}

/** Resolve one preset without allocating Three.js objects or touching runtime state. */
export function resolveWorldEnvironmentPreset(
  id: WeatherPresetId,
): ResolvedWorldEnvironmentPreset {
  if (id === "drusniel") {
    return Object.freeze({
      id,
      label: "Drusniel",
      baseline: true,
      sunIntensityScale: 1,
      hemisphereIntensityScale: 1,
      ambientIntensityScale: 0,
      environmentIntensity: 1,
      fogDensityScale: 1,
      paletteMultiplier: [1, 1, 1] as const,
      windDirectionDegrees: 0,
      windIntensity: 1,
      windNoiseScale: 1,
      windSimulationSpeed: 1,
      restBendGain: 0,
      rainIntensity: 0,
    });
  }
  return resolveSourcePreset(WORLD_SOURCE_ENVIRONMENT_PRESETS[id]);
}

function resolveSourcePreset(
  source: WorldEnvironmentPresetReference,
): ResolvedWorldEnvironmentPreset {
  const direction = normalizeDirection(source.lighting.position);
  const globalLightScale = 1 / SOURCE_HIGHFIELD_DIRECT_INTENSITY;
  return Object.freeze({
    id: source.id,
    label: source.label,
    baseline: false,
    sunDirection: direction,
    sunColor: source.lighting.color,
    sunIntensityScale: source.lighting.directionalIntensity * globalLightScale,
    hemisphereSkyColor: source.lighting.hemisphereSkyColor,
    hemisphereGroundColor: source.lighting.hemisphereGroundColor,
    hemisphereIntensityScale: source.lighting.hemisphereIntensity * globalLightScale,
    ambientColor: source.lighting.ambientColor,
    ambientIntensityScale: source.lighting.ambientIntensity * globalLightScale,
    environmentIntensity: source.lighting.environmentIntensity,
    skyHorizonColor: source.sky.horizonColor,
    skyZenithColor: source.sky.zenithColor,
    skySunHaloColor: source.sky.sunHaloColor,
    skySunDiskColor: source.sky.sunDiskColor,
    skyHaloPower: source.sky.haloPower,
    skyDiskPower: source.sky.diskPower,
    fogColor: source.sky.fogColor,
    fogDensityScale: source.sky.fogDensity / 0.005,
    cloudCoverageTarget: source.cloudCoverageTarget,
    cloudThreshold: resolveDestinationCloudThreshold(source.cloudCoverageTarget),
    paletteMultiplier: resolvePaletteMultiplier(source),
    windDirectionDegrees: source.grass.windDirection,
    windIntensity: source.windGain,
    windNoiseScale: source.grass.windNoiseScale / SOURCE_REFERENCE_WIND_NOISE_SCALE,
    windSimulationSpeed: source.grass.simulationSpeed,
    restBendGain: source.id === "bowed" ? LOWSWAY_STATIC_LEAN_RADIANS : 0,
    rainIntensity: source.rainIntensity,
  });
}

function normalizeDirection(
  value: readonly [number, number, number],
): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!(length > 1e-6) || !Number.isFinite(length)) {
    return [0, 1, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function resolvePaletteMultiplier(
  source: WorldEnvironmentPresetReference,
): readonly [number, number, number] {
  const sunny = WORLD_SOURCE_ENVIRONMENT_PRESETS.sunny;
  const sourceMean = meanRgb(source.grass.baseColor, source.grass.tipColor);
  const sunnyMean = meanRgb(sunny.grass.baseColor, sunny.grass.tipColor);
  return [0, 1, 2].map((index) => clampPaletteMultiplier(
    sourceMean[index] / Math.max(sunnyMean[index], 1 / 255),
  )) as [number, number, number];
}

function meanRgb(first: string, second: string): [number, number, number] {
  const a = parseHex(first);
  const b = parseHex(second);
  return [
    (a[0] + b[0]) * 0.5,
    (a[1] + b[1]) * 0.5,
    (a[2] + b[2]) * 0.5,
  ];
}

function parseHex(value: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`Weather palette color must be six-digit hex: ${value}`);
  }
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function clampPaletteMultiplier(value: number): number {
  return Math.min(Math.max(value, PALETTE_MULTIPLIER_MIN), PALETTE_MULTIPLIER_MAX);
}
