import type { RuntimeCloudConfig } from "../../runtime/RuntimeConfig";

export const WORLD_CLOUD_TIME_WRAP_SECONDS = 86_400;

export type CloudWeatherRegime = "clear" | "fair" | "overcast" | "storm";

export interface CloudSunDirection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const FBM_ROTATION_COS = 0.8;
const FBM_ROTATION_SIN = 0.6;
const FBM_FREQUENCY = 2.02;
const WEATHER_COVERAGE_SWING = 0.11;
const WEATHER_CLEAR_THRESHOLD = 0.28;
const WEATHER_OVERCAST_THRESHOLD = 0.78;
const WEATHER_REGIME_CLEAR_MAX = 0.22;
const WEATHER_REGIME_FAIR_MAX = 0.62;
const WEATHER_REGIME_OVERCAST_MAX = 0.88;
const SHADOW_CENTER_WEIGHT = 0.36;
const SHADOW_CARDINAL_WEIGHT = 0.16;

export function sampleCloudDirectTransmittance(
  config: Readonly<RuntimeCloudConfig>,
  compact: boolean,
  worldX: number,
  worldZ: number,
  timeSeconds: number,
): number {
  if (!config.enabled) {
    return 1;
  }
  const radius = config.shadowSampleRadius;
  const density =
    sampleCloudDensity(config, compact, worldX, worldZ, timeSeconds) *
      SHADOW_CENTER_WEIGHT +
    sampleCloudDensity(
      config,
      compact,
      worldX + radius,
      worldZ,
      timeSeconds,
    ) *
      SHADOW_CARDINAL_WEIGHT +
    sampleCloudDensity(
      config,
      compact,
      worldX - radius,
      worldZ,
      timeSeconds,
    ) *
      SHADOW_CARDINAL_WEIGHT +
    sampleCloudDensity(
      config,
      compact,
      worldX,
      worldZ + radius,
      timeSeconds,
    ) *
      SHADOW_CARDINAL_WEIGHT +
    sampleCloudDensity(
      config,
      compact,
      worldX,
      worldZ - radius,
      timeSeconds,
    ) *
      SHADOW_CARDINAL_WEIGHT;
  return Math.max(
    config.minimumDirectTransmittance,
    1 - density * config.shadowStrength,
  );
}

/** CPU equivalent of the GPU shadow pass at one cloud-plane position. */
export function sampleCloudShadowTransmittance(
  config: Readonly<RuntimeCloudConfig>,
  compact: boolean,
  cloudPlaneX: number,
  cloudPlaneZ: number,
  timeSeconds: number,
  sunDirection: CloudSunDirection,
): number {
  return sampleCloudPointDirectTransmittance(
    config,
    compact,
    cloudPlaneX,
    config.baseHeight,
    cloudPlaneZ,
    timeSeconds,
    sunDirection,
  );
}

/** Direct sunlight remaining at an arbitrary world-space point. */
export function sampleCloudPointDirectTransmittance(
  config: Readonly<RuntimeCloudConfig>,
  compact: boolean,
  worldX: number,
  worldY: number,
  worldZ: number,
  timeSeconds: number,
  sunDirection: CloudSunDirection,
): number {
  if (!config.enabled) {
    return 1;
  }
  const cloudTop = config.baseHeight + config.thickness;
  if (worldY >= cloudTop) {
    return 1;
  }

  const startHeight = Math.max(worldY, config.baseHeight);
  const startFraction = clamp01(
    (startHeight - config.baseHeight) / config.thickness,
  );
  const remainingFraction = 1 - startFraction;
  if (remainingFraction <= Number.EPSILON) {
    return 1;
  }

  const stepCount = Math.max(1, Math.trunc(config.shadowSteps));
  const sunVertical = Math.max(sunDirection.y, 0.08);
  let opticalDepth = 0;
  for (let sampleIndex = 0; sampleIndex < stepCount; sampleIndex += 1) {
    const stepFraction = (sampleIndex + 0.5) / stepCount;
    const heightFraction =
      startFraction + stepFraction * remainingFraction;
    const sampleHeight =
      config.baseHeight + heightFraction * config.thickness;
    const distance = Math.max(0, (sampleHeight - worldY) / sunVertical);
    const sampleX = worldX + sunDirection.x * distance;
    const sampleZ = worldZ + sunDirection.z * distance;
    opticalDepth +=
      sampleCloudDensity(config, compact, sampleX, sampleZ, timeSeconds) *
      sampleCloudVerticalProfile(
        config,
        sampleX,
        sampleZ,
        heightFraction,
        timeSeconds,
      );
  }
  opticalDepth = (opticalDepth / stepCount) * remainingFraction;
  return resolveAuthoredTransmittance(config, opticalDepth);
}

export function sampleCloudWeatherAmount(
  config: Readonly<RuntimeCloudConfig>,
  worldX: number,
  worldZ: number,
  timeSeconds: number,
): number {
  if (!config.enabled) {
    return 0;
  }
  const macroX = worldX + config.windX * timeSeconds;
  const macroZ = worldZ + config.windZ * timeSeconds;
  return smoothstep(
    WEATHER_CLEAR_THRESHOLD,
    WEATHER_OVERCAST_THRESHOLD,
    valueNoise(
      macroX * config.weatherScale - 73.1,
      macroZ * config.weatherScale + 52.8,
    ),
  );
}

export function resolveCloudWeatherRegime(
  weatherAmount: number,
): CloudWeatherRegime {
  const amount = clamp01(weatherAmount);
  if (amount < WEATHER_REGIME_CLEAR_MAX) {
    return "clear";
  }
  if (amount < WEATHER_REGIME_FAIR_MAX) {
    return "fair";
  }
  if (amount < WEATHER_REGIME_OVERCAST_MAX) {
    return "overcast";
  }
  return "storm";
}

function resolveAuthoredTransmittance(
  config: Readonly<RuntimeCloudConfig>,
  opticalDepth: number,
): number {
  const physicalTransmittance = Math.exp(-opticalDepth * config.extinction);
  return Math.max(
    config.minimumDirectTransmittance,
    Math.min(1, mix(1, physicalTransmittance, config.shadowStrength)),
  );
}

function sampleCloudDensity(
  config: Readonly<RuntimeCloudConfig>,
  compact: boolean,
  worldX: number,
  worldZ: number,
  timeSeconds: number,
): number {
  const macroX = worldX + config.windX * timeSeconds;
  const macroZ = worldZ + config.windZ * timeSeconds;
  const detailX = worldX + config.detailWindX * timeSeconds;
  const detailZ = worldZ + config.detailWindZ * timeSeconds;
  const macroScale = config.macroScale;
  const macro = fbm(
    macroX * macroScale,
    macroZ * macroScale,
    compact ? 2 : 3,
  );
  const warp = valueNoise(
    macroX * macroScale * 2.35 + 17.13,
    macroZ * macroScale * 2.35 - 9.71,
  );
  const detail = valueNoise(
    detailX * config.detailScale + 41.7,
    detailZ * config.detailScale - 26.4,
  );
  const weatherCoverage = sampleCloudWeatherAmount(
    config,
    worldX,
    worldZ,
    timeSeconds,
  );
  const threshold =
    config.coverage + (0.5 - weatherCoverage) * WEATHER_COVERAGE_SWING;
  const field = macro + (warp - 0.5) * 0.2 + (detail - 0.5) * 0.1;
  return smoothstep(
    threshold - config.softness,
    threshold + config.softness,
    field,
  );
}

function sampleCloudVerticalProfile(
  config: Readonly<RuntimeCloudConfig>,
  worldX: number,
  worldZ: number,
  heightFraction: number,
  timeSeconds: number,
): number {
  const macroX = worldX + config.windX * timeSeconds;
  const macroZ = worldZ + config.windZ * timeSeconds;
  const detailX = worldX + config.detailWindX * timeSeconds;
  const detailZ = worldZ + config.detailWindZ * timeSeconds;
  const topNoise = valueNoise(
    macroX * config.macroScale * 0.61 + 23.7,
    macroZ * config.macroScale * 0.61 - 18.2,
  );
  const baseNoise = valueNoise(
    macroX * config.macroScale * 0.83 - 31.4,
    macroZ * config.macroScale * 0.83 + 14.9,
  );
  const bodyNoise = valueNoise(
    detailX * config.detailScale * 0.42 + 9.2 + heightFraction * 7.1,
    detailZ * config.detailScale * 0.42 - 37.6 - heightFraction * 5.3,
  );
  const top = mix(0.62, 1, topNoise);
  const baseFeather = mix(0.045, 0.095, baseNoise);
  const shapedBase = smoothstep(0, baseFeather, heightFraction);
  const irregularTop =
    1 - smoothstep(Math.max(0.12, top - 0.16), top, heightFraction);
  const bodyErosion = mix(0.78, 1, smoothstep(0.28, 0.72, bodyNoise));
  return shapedBase * irregularTop * bodyErosion;
}

function fbm(x: number, y: number, octaves: 2 | 3): number {
  let px = x;
  let py = y;
  let amplitude = 0.5;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(px, py) * amplitude;
    weight += amplitude;
    const rotatedX =
      (px * FBM_ROTATION_COS - py * FBM_ROTATION_SIN) * FBM_FREQUENCY;
    const rotatedY =
      (px * FBM_ROTATION_SIN + py * FBM_ROTATION_COS) * FBM_FREQUENCY;
    px = rotatedX + 11.7;
    py = rotatedY - 7.3;
    amplitude *= 0.5;
  }
  return weight > 0 ? total / weight : 0;
}

function valueNoise(x: number, y: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = fract(x);
  const localY = fract(y);
  const blendX = localX * localX * (3 - 2 * localX);
  const blendY = localY * localY * (3 - 2 * localY);
  const a = hash12(cellX, cellY);
  const b = hash12(cellX + 1, cellY);
  const c = hash12(cellX, cellY + 1);
  const d = hash12(cellX + 1, cellY + 1);
  return mix(mix(a, b, blendX), mix(c, d, blendX), blendY);
}

function hash12(x: number, y: number): number {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const dot =
    px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += dot;
  py += dot;
  pz += dot;
  return fract((px + py) * pz);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fract(value: number): number {
  return value - Math.floor(value);
}
