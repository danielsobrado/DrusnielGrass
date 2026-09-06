import { FlatConfigValueReader } from "../config/FlatConfigValueReader";
import type { RuntimeCloudConfig } from "./RuntimeConfig";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function readRuntimeCloudConfig(
  reader: FlatConfigValueReader,
  prefix: "desktop" | "compact",
): RuntimeCloudConfig {
  const key = (suffix: string): string => `${prefix}Cloud${suffix}`;
  const shadowDistanceFadeStart = reader.number(
    key("ShadowDistanceFadeStart"),
    { exclusiveMinimum: 0 },
  );
  const shadowDistanceFadeEnd = reader.number(key("ShadowDistanceFadeEnd"), {
    exclusiveMinimum: 0,
  });
  if (shadowDistanceFadeEnd <= shadowDistanceFadeStart) {
    throw new Error(
      `Runtime config value ${key("ShadowDistanceFadeEnd")} must be greater than ${key("ShadowDistanceFadeStart")}.`,
    );
  }
  return {
    enabled: reader.boolean(key("Enabled")),
    coverage: reader.number(key("Coverage"), { minimum: 0, maximum: 1 }),
    softness: reader.number(key("Softness"), {
      exclusiveMinimum: 0,
      maximum: 0.35,
    }),
    opacity: reader.number(key("Opacity"), { minimum: 0, maximum: 1 }),
    baseHeight: reader.number(key("BaseHeight"), {
      minimum: 100,
      maximum: 3000,
    }),
    thickness: reader.number(key("Thickness"), {
      minimum: 40,
      maximum: 600,
    }),
    extinction: reader.number(key("Extinction"), {
      exclusiveMinimum: 0,
      maximum: 4,
    }),
    macroScale: reader.number(key("MacroScale"), {
      exclusiveMinimum: 0,
      maximum: 0.02,
    }),
    detailScale: reader.number(key("DetailScale"), {
      exclusiveMinimum: 0,
      maximum: 0.05,
    }),
    weatherScale: reader.number(key("WeatherScale"), {
      exclusiveMinimum: 0,
      maximum: 0.01,
    }),
    windX: reader.number(key("WindX"), { minimum: -100, maximum: 100 }),
    windZ: reader.number(key("WindZ"), { minimum: -100, maximum: 100 }),
    detailWindX: reader.number(key("DetailWindX"), {
      minimum: -100,
      maximum: 100,
    }),
    detailWindZ: reader.number(key("DetailWindZ"), {
      minimum: -100,
      maximum: 100,
    }),
    selfShadowStrength: reader.number(key("SelfShadowStrength"), {
      minimum: 0,
      maximum: 1,
    }),
    silverLiningStrength: reader.number(key("SilverLiningStrength"), {
      minimum: 0,
      maximum: 3,
    }),
    shadowStrength: reader.number(key("ShadowStrength"), {
      minimum: 0,
      maximum: 0.35,
    }),
    shadowSampleRadius: reader.number(key("ShadowSampleRadius"), {
      minimum: 0,
      maximum: 100,
    }),
    shadowMapResolution: reader.number(key("ShadowMapResolution"), {
      minimum: 64,
      maximum: 512,
      integer: true,
    }),
    shadowWorldSize: reader.number(key("ShadowWorldSize"), {
      minimum: 256,
      maximum: 4096,
    }),
    shadowSteps: reader.number(key("ShadowSteps"), {
      minimum: 1,
      maximum: 6,
      integer: true,
    }),
    shadowEdgeFade: reader.number(key("ShadowEdgeFade"), {
      minimum: 0,
      maximum: 0.25,
    }),
    shadowDistanceFadeStart,
    shadowDistanceFadeEnd,
    minimumDirectTransmittance: reader.number(
      key("MinimumDirectTransmittance"),
      { minimum: 0.65, maximum: 1 },
    ),
    lightResponseRate: reader.number(key("LightResponseRate"), {
      exclusiveMinimum: 0,
      maximum: 5,
    }),
    weatherGradeStrength: reader.number(key("WeatherGradeStrength"), {
      minimum: 0,
      maximum: 1,
    }),
    volumetricEnabled: reader.boolean(key("VolumetricEnabled")),
    volumetricResolutionScale: reader.number(key("VolumetricResolutionScale"), {
      minimum: 0.2,
      maximum: 0.75,
    }),
    volumetricSteps: reader.number(key("VolumetricSteps"), {
      minimum: 4,
      maximum: 12,
      integer: true,
    }),
    temporalBlend: reader.number(key("TemporalBlend"), {
      minimum: 0,
      maximum: 0.98,
    }),
    godRays: reader.boolean(key("GodRays")),
    godRayStrength: reader.number(key("GodRayStrength"), {
      minimum: 0,
      maximum: 0.5,
    }),
    ambientColor: readColor(reader, key("AmbientColor")),
    shadowColor: readColor(reader, key("ShadowColor")),
    sunlitColor: readColor(reader, key("SunlitColor")),
  };
}

function readColor(reader: FlatConfigValueReader, key: string): string {
  const value = reader.string(key);
  if (!HEX_COLOR.test(value)) {
    throw new Error(
      `Runtime config value ${key} must be a six-digit hexadecimal color.`,
    );
  }
  return value;
}
